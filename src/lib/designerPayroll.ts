import { supabase } from "@/lib/supabaseClient";
import {
  computeEarnings,
  countWorkdays,
  creativePayout,
  monthKeyOf,
  pickRateForMonth,
  resolveTerms,
  type CreativePay,
  type DesignerEarnings,
  type DesignerPayDefaults,
  type DesignerPayRate,
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
 * роботу дев'ять разів. Макети (`layout`) у норму не входять — тільки
 * `output_kind='visualization'`.
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
 * Унікальні візуали дизайнера за місяць.
 * Повертає і кількість робіт, і кількість сирих файлів — розрив між ними
 * показує масштаб перезаливів (у проді буває до ×1.9).
 */
export async function loadVisualCount(params: {
  teamId: string;
  userId: string;
  monthKey: string;
}): Promise<{ works: number; files: number }> {
  const { from, to } = monthBounds(params.monthKey);
  const { data, error } = await supabase
    .from("activity_log")
    .select("entity_id,metadata")
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId)
    .eq("action", "design_output_upload")
    .eq("metadata->>output_kind", OUTPUT_KIND_VISUALIZATION)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .limit(5000);
  if (error) throw error;

  const seen = new Set<string>();
  let files = 0;
  ((data ?? []) as Array<{
    entity_id?: string | null;
    metadata?: { design_task_id?: string | null; uploaded_files?: Array<{ file_name?: string | null }> } | null;
  }>).forEach((row) => {
    const taskId = row.entity_id ?? row.metadata?.design_task_id ?? "?";
    const uploaded = Array.isArray(row.metadata?.uploaded_files) ? row.metadata.uploaded_files : [];
    uploaded.forEach((file) => {
      const name = typeof file?.file_name === "string" ? file.file_name : "";
      if (!name) return;
      files += 1;
      seen.add(`${taskId}:${baseNameOf(name)}`);
    });
  });
  return { works: seen.size, files };
}

export async function loadPayDefaults(workspaceId: string): Promise<DesignerPayDefaults | null> {
  const { data, error } = await payrollTable("employee_pay_defaults")
    .select("visual_norm,over_norm_rate,creative_percent,min_creative_cost")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    visual_norm: number;
    over_norm_rate: number;
    creative_percent: number;
    min_creative_cost: number;
  };
  return {
    visualNorm: Number(row.visual_norm),
    overNormRate: Number(row.over_norm_rate),
    creativePercent: Number(row.creative_percent),
    minCreativeCost: Number(row.min_creative_cost),
  };
}

/** RLS сама віддасть лише свої рядки дизайнеру і всі — SEO/owner. */
export async function loadPayRates(workspaceId: string, userId?: string): Promise<DesignerPayRate[]> {
  let query = payrollTable("employee_pay_rates")
    .select("user_id,base_month_rate,visual_norm,over_norm_rate,creative_percent,effective_from")
    .eq("workspace_id", workspaceId)
    .order("effective_from", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Array<{
    base_month_rate: number | string;
    visual_norm: number | null;
    over_norm_rate: number | string | null;
    creative_percent: number | string | null;
    effective_from: string;
  }>).map((row) => ({
    baseMonthRate: Number(row.base_month_rate),
    visualNorm: row.visual_norm == null ? null : Number(row.visual_norm),
    overNormRate: row.over_norm_rate == null ? null : Number(row.over_norm_rate),
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
  const [exceptions, visualData, creatives] = await Promise.all([
    loadWorkdayExceptions(params.workspaceId, monthKey),
    loadVisualCount({ teamId: params.teamId, userId: params.userId, monthKey }),
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

  const { total, passed } = countWorkdays({
    monthKey,
    asOf: params.asOf,
    exceptions,
    absences: params.absences,
  });

  return computeEarnings({
    monthKey,
    terms,
    workdaysTotal: total,
    workdaysPassed: passed,
    visuals: visualData.works,
    visualFiles: visualData.files,
    creatives,
  });
}
