import { supabase } from "@/lib/supabaseClient";
import { normalizeTeamAbsenceKind } from "@/lib/teamAbsences";
import {
  computeEarnings,
  countWorkdays,
  creativePayout,
  listWorkdays,
  monthKeyOf,
  pickRateForMonth,
  resolveTerms,
  type AbsenceRange,
  type CreativePay,
  type DesignerEarnings,
  type DesignerPayDefaults,
  type DesignerPayRate,
  type OutputCounts,
} from "@/lib/designerPayrollMath";

/**
 * I/O-шар заробітку дизайнера: читання ставок/дефолтів/календаря та підрахунок
 * унікальних візуалів. Уся арифметика — в `designerPayrollMath.ts` (він без
 * мережі, щоб її можна було покрити тестами).
 *
 * Принцип: **нічого не нараховуємо в базу під час місяця**. Сума завжди
 * рахується наживо з подій, тож відкат статусу чи видалення файлу автоматично
 * прибирає нарахування — окремого «сторно» не існує. Заморожується лише
 * підсумок місяця (`employee_pay_month_close`, Фаза 3).
 *
 * ГОЛОВНИЙ ГОЧА — одиниця норми. Рахуються НЕ файли, а унікальні роботи:
 * `(задача + назва файлу без розширення)`. Один візуал перезаливають після
 * правок по 5–9 разів під тією самою назвою, тож «за файл» оплачувало б одну
 * роботу дев'ять разів.
 *
 * Візуали й макети рахуються ОКРЕМО: у них різні денні норми (8 і 5) і різні
 * тарифи понад норму (100 і 200 ₴).
 */

export * from "@/lib/designerPayrollMath";

const OUTPUT_KIND_VISUALIZATION = "visualization";

/**
 * Таблиці payroll створені міграцією `scripts/designer-payroll.sql` і ще не
 * потрапили у згенерований `database.types.ts`, тому типізуємо доступ до них
 * вузьким мостом — та сама конвенція, що в `workspaceMemberDirectory.ts`.
 * Це не `any`: форма запиту лишається перевіреною, а рядки приводимо явно.
 */
type PayrollResult = { data: unknown; error: unknown };
/** Thenable, тож `await` на ланцюжку працює так само, як у звичайного клієнта. */
interface PayrollFilter extends PromiseLike<PayrollResult> {
  eq(column: string, value: string): PayrollFilter;
  gte(column: string, value: string): PayrollFilter;
  lt(column: string, value: string): PayrollFilter;
  order(column: string, options: { ascending: boolean }): PayrollFilter;
  maybeSingle(): PromiseLike<PayrollResult>;
}

const payrollTable = (table: string) =>
  supabase.schema("tosho").from(table as never) as unknown as {
    select: (columns: string) => PayrollFilter;
  };

const monthBounds = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
};

const baseNameOf = (fileName: string) => fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "");

/**
 * Унікальні роботи дизайнера за місяць, розведені на візуали й макети.
 *
 * Повертає і кількість робіт, і кількість сирих файлів — розрив між ними
 * показує масштаб перезаливів (у проді буває до ×1.9; макети ллють у двох
 * форматах .ai+.pdf, але базова назва в них однакова, тож це одна робота).
 *
 * Вид беремо з події завантаження: `visualization` — візуал, усе інше
 * (`layout`, порожнє, невідоме) — макет. Та сама угода, що в orderRecords.
 */
export async function loadOutputCounts(params: {
  teamId: string;
  userId: string;
  monthKey: string;
}): Promise<{ visuals: OutputCounts; layouts: OutputCounts }> {
  const { from, to } = monthBounds(params.monthKey);
  const { data, error } = await supabase
    .from("activity_log")
    .select("entity_id,metadata")
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId)
    .eq("action", "design_output_upload")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .limit(5000);
  if (error) throw error;

  const seen = { visuals: new Set<string>(), layouts: new Set<string>() };
  const files = { visuals: 0, layouts: 0 };
  ((data ?? []) as Array<{
    entity_id?: string | null;
    metadata?: {
      design_task_id?: string | null;
      output_kind?: string | null;
      uploaded_files?: Array<{ file_name?: string | null }>;
    } | null;
  }>).forEach((row) => {
    const taskId = row.entity_id ?? row.metadata?.design_task_id ?? "?";
    const bucket = row.metadata?.output_kind === OUTPUT_KIND_VISUALIZATION ? "visuals" : "layouts";
    const uploaded = Array.isArray(row.metadata?.uploaded_files) ? row.metadata.uploaded_files : [];
    uploaded.forEach((file) => {
      const name = typeof file?.file_name === "string" ? file.file_name : "";
      if (!name) return;
      files[bucket] += 1;
      seen[bucket].add(`${taskId}:${baseNameOf(name)}`);
    });
  });
  return {
    visuals: { works: seen.visuals.size, files: files.visuals },
    layouts: { works: seen.layouts.size, files: files.layouts },
  };
}

export async function loadPayDefaults(workspaceId: string): Promise<DesignerPayDefaults | null> {
  const { data, error } = await payrollTable("employee_pay_defaults")
    .select("visual_norm_per_day,layout_norm_per_day,visual_over_rate,layout_over_rate,creative_percent,min_creative_cost")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    visual_norm_per_day: number;
    layout_norm_per_day: number;
    visual_over_rate: number;
    layout_over_rate: number;
    creative_percent: number;
    min_creative_cost: number;
  };
  return {
    visualNormPerDay: Number(row.visual_norm_per_day),
    layoutNormPerDay: Number(row.layout_norm_per_day),
    visualOverRate: Number(row.visual_over_rate),
    layoutOverRate: Number(row.layout_over_rate),
    creativePercent: Number(row.creative_percent),
    minCreativeCost: Number(row.min_creative_cost),
  };
}

/** RLS сама віддасть лише свої рядки дизайнеру і всі — SEO/owner. */
export async function loadPayRates(workspaceId: string, userId?: string): Promise<DesignerPayRate[]> {
  let query = payrollTable("employee_pay_rates")
    .select(
      "user_id,base_month_rate,visual_norm_per_day,layout_norm_per_day,visual_over_rate,layout_over_rate,creative_percent,effective_from"
    )
    .eq("workspace_id", workspaceId)
    .order("effective_from", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Array<{
    base_month_rate: number | string;
    visual_norm_per_day: number | null;
    layout_norm_per_day: number | null;
    visual_over_rate: number | string | null;
    layout_over_rate: number | string | null;
    creative_percent: number | string | null;
    effective_from: string;
  }>).map((row) => ({
    baseMonthRate: Number(row.base_month_rate),
    visualNormPerDay: row.visual_norm_per_day == null ? null : Number(row.visual_norm_per_day),
    layoutNormPerDay: row.layout_norm_per_day == null ? null : Number(row.layout_norm_per_day),
    visualOverRate: row.visual_over_rate == null ? null : Number(row.visual_over_rate),
    layoutOverRate: row.layout_over_rate == null ? null : Number(row.layout_over_rate),
    creativePercent: row.creative_percent == null ? null : Number(row.creative_percent),
    effectiveFrom: row.effective_from,
  }));
}

export async function loadWorkdayExceptions(workspaceId: string, monthKey: string) {
  const { from, to } = monthBounds(monthKey);
  const { data, error } = await payrollTable("ua_workday_exceptions")
    .select("day,is_workday")
    .eq("workspace_id", workspaceId)
    .gte("day", from.toISOString().slice(0, 10))
    .lt("day", to.toISOString().slice(0, 10));
  if (error) throw error;
  const map = new Map<string, boolean>();
  ((data ?? []) as Array<{ day: string; is_workday: boolean }>).forEach((row) => {
    map.set(row.day, row.is_workday);
  });
  return map;
}

/**
 * Відсутності людини за місяць: фарбують сітку днів І зменшують норму.
 *
 * Базу вони НЕ зменшують (рішення CEO 2026-07-26) — за день лікарняного
 * ставка нараховується повністю, але 8 візуалів і 5 макетів до норми за нього
 * не додаються. Асиметрія свідома, на користь людини.
 *
 * Живе в tosho, ключується workspace_id; читати може будь-який учасник
 * воркспейсу (політика team_absences_select).
 */
export async function loadAbsences(params: {
  workspaceId: string;
  userId: string;
  monthKey: string;
}): Promise<AbsenceRange[]> {
  const { from, to } = monthBounds(params.monthKey);
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .select("start_date,end_date,kind,comment")
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    // Діапазон може починатись до 1-го числа й тягнутись у місяць — тому
    // перетин діапазонів, а не «початок усередині місяця».
    .lte("start_date", to.toISOString().slice(0, 10))
    .gte("end_date", from.toISOString().slice(0, 10));
  if (error) throw error;
  return (data ?? []).map((row) => ({
    start: row.start_date,
    end: row.end_date,
    kind: normalizeTeamAbsenceKind(row.kind),
    comment: row.comment,
  }));
}

/**
 * Платні креативи дизайнера за місяць.
 *
 * Місяць визначається за ЗАКРИТТЯМ (подія переходу в approved), а не за датою
 * створення задачі: гроші нараховуються тоді, коли клієнт погодив. Для задач,
 * які ще чекають погодження, беремо ті, що зараз у pm_review/client_review —
 * вони йдуть лише в прогноз (`earned: false`).
 */
export async function loadCreativePays(params: {
  teamId: string;
  userId: string;
  monthKey: string;
  creativePercent: number;
}): Promise<CreativePay[]> {
  const { from, to } = monthBounds(params.monthKey);

  const { data, error } = await supabase
    .from("activity_log")
    .select("id,title,metadata")
    .eq("team_id", params.teamId)
    .eq("action", "design_task")
    .eq("metadata->>design_task_type", "creative")
    .eq("metadata->>design_creative_paid", "true")
    .eq("metadata->>assignee_user_id", params.userId)
    .limit(500);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    title?: string | null;
    metadata?: {
      status?: string | null;
      design_task_number?: string | null;
      design_creative_project_cost?: number | string | null;
      status_changed_at?: string | null;
    } | null;
  }>;

  const result: CreativePay[] = [];
  rows.forEach((row) => {
    const meta = row.metadata ?? {};
    const cost = Number(meta.design_creative_project_cost);
    if (!Number.isFinite(cost) || cost <= 0) return;

    const status = meta.status ?? "";
    const approved = status === "approved";
    const pending = status === "pm_review" || status === "client_review";
    if (!approved && !pending) return;

    // Затверджений креатив зараховуємо в місяць затвердження, а не створення.
    if (approved) {
      const changedAt = meta.status_changed_at ? new Date(meta.status_changed_at) : null;
      if (!changedAt || changedAt < from || changedAt >= to) return;
    }

    result.push({
      taskId: row.id,
      taskNumber: meta.design_task_number ?? null,
      title: row.title ?? null,
      projectCost: cost,
      payout: creativePayout(cost, params.creativePercent),
      earned: approved,
    });
  });
  return result;
}

/** Повний цикл для віджета: умови + дані місяця → готові суми. */
export async function loadDesignerEarnings(params: {
  workspaceId: string;
  teamId: string;
  userId: string;
  monthKey?: string;
  asOf?: Date;
  absences?: Array<{ start: string; end: string }>;
}): Promise<DesignerEarnings | null> {
  const monthKey = params.monthKey ?? monthKeyOf(params.asOf ?? new Date());

  const [defaults, rates] = await Promise.all([
    loadPayDefaults(params.workspaceId),
    loadPayRates(params.workspaceId, params.userId),
  ]);
  const rate = pickRateForMonth(rates, monthKey);
  // Немає ставки на цей місяць — людина не в pay-системі, віджет не показуємо.
  if (!rate || !defaults) return null;

  const terms = resolveTerms(rate, defaults);
  const [exceptions, outputs, absences, creatives] = await Promise.all([
    loadWorkdayExceptions(params.workspaceId, monthKey),
    loadOutputCounts({ teamId: params.teamId, userId: params.userId, monthKey }),
    loadAbsences({ workspaceId: params.workspaceId, userId: params.userId, monthKey }).catch((error) => {
      // Відсутності — суто оформлення сітки: без них квадратики просто всі
      // однакові, а суми не змінюються. Падати через це віджету нема сенсу.
      console.warn("Failed to load absences", error);
      return [] as AbsenceRange[];
    }),
    loadCreativePays({
      teamId: params.teamId,
      userId: params.userId,
      monthKey,
      creativePercent: terms.creativePercent,
    }).catch((error) => {
      // Креативи — додаткова частина: якщо їх не вдалось порахувати, віджет
      // усе одно показує базу й візуали, а не падає цілком.
      console.warn("Failed to load creative pays", error);
      return [] as CreativePay[];
    }),
  ]);

  const allAbsences = [...absences, ...(params.absences ?? [])];

  // БАЗА — без відсутностей: лікарняний не зменшує ставку (рішення CEO).
  const base = countWorkdays({ monthKey, asOf: params.asOf, exceptions });
  // НОРМА — з відсутностями: за день, якого людина не працювала, норму не
  // набирають. Денна норма саме для цього й вводилась.
  const norm = countWorkdays({ monthKey, asOf: params.asOf, exceptions, absences: allAbsences });
  // А сітку малюємо З відсутностями — інакше день хвороби виглядав би як
  // звичайний відпрацьований.
  const workdays = listWorkdays({ monthKey, asOf: params.asOf, exceptions, absences: allAbsences });

  return computeEarnings({
    monthKey,
    terms,
    workdaysTotal: base.total,
    workdaysPassed: base.passed,
    normDaysTotal: norm.total,
    normDaysPassed: norm.passed,
    workdays,
    visuals: outputs.visuals,
    layouts: outputs.layouts,
    creatives,
  });
}
