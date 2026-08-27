import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";
import {
  groupRecipientsByTeam,
  isFinanceRole,
  mergeTeamMembers,
  type MembershipSource,
  type ProfileSource,
  type TeamLinkSource,
} from "./_lib/teamMembers";

// Чекліст «закрити місяць»: журнальні витрати (комуналка, вода, прибирання) не
// мають дати списання — про них просто забувають. Раз на місяць збираємо ті, за
// якими за цільовий місяць немає ЖОДНОГО запису, і шлемо ОДНЕ сповіщення зі
// списком, згрупованим за обʼєктом.
//
// Дві стадії (?stage=), кожна — окрема крон-джоба:
//   soft  (25-го) — про ПОТОЧНИЙ місяць, мʼяке попередження;
//   final (5-го)  — про ПОПЕРЕДНІЙ місяць, коли платежі вже точно пройшли.
//
// Свідомо БЕЗ export const config: стадію передає pg_cron у query, а планувальник
// Netlify параметрів не передає (і в цьому репозиторії все одно не використовується
// — див. scripts/reminders-cron.sql).
//
// Межі беремо від САМОЇ витрати (REQ-190): від місяця «веду облік з» (expense_date)
// до архівації (archived_at) включно. Правило те саме, що в src/features/finances/
// monthClose.ts — тримати їх нарізно не можна, бо це один і той самий чекліст.
//
// Раніше тут була умова «є запис за три місяці до цільового», щоб давно закинуті
// статті («Кондиціонери» з нулем записів за весь час) не висіли щомісяця. Вона ж
// глушила найгучніше: НОВУ витрату з нулем записів, чий орієнтир щойно підставився
// в кожен місяць. Тепер «більше не ведемо» каже архів — рішення людини.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type ExpenseRow = {
  id: string;
  team_id: string;
  supplier_name?: string | null;
  category_id?: string | null;
  object_group?: string | null;
  expense_date?: string | null;
  archived_at?: string | null;
};

type EntryRow = {
  expense_id: string;
  entry_date: string;
};

type PendingNotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "warning";
};

const TIME_ZONE = "Europe/Kiev";
const UNTAGGED_GROUP = "Інші";

const MONTHS_NOMINATIVE = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];
const MONTHS_GENITIVE = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

/** «Сьогодні» як YYYY-MM-DD у Києві (дати журналу — floating wall-clock). */
function todayKeyInKiev(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** «YYYY-MM» ± місяців. */
function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return dt.toISOString().slice(0, 7);
}

const firstDayOf = (monthKey: string) => `${monthKey}-01`;

/** Останній день місяця як YYYY-MM-DD. */
function lastDayOf(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Чи існувала витрата в цьому місяці: від «веду облік з» до архівації включно.
 * Копія правила з src/features/finances/expenseMonth.ts — імпортувати з src у
 * функції не можна, тож збіг тримається цим коментарем і тестами обох сторін.
 */
function isExpenseInMonth(expense: ExpenseRow, monthKey: string): boolean {
  const start = (expense.expense_date ?? "").slice(0, 7);
  if (start && monthKey < start) return false;
  const archived = expense.archived_at ? expense.archived_at.slice(0, 7) : null;
  if (archived && monthKey > archived) return false;
  return true;
}

function monthLabel(monthKey: string, form: "nominative" | "genitive"): string {
  const idx = Number(monthKey.slice(5, 7)) - 1;
  const table = form === "nominative" ? MONTHS_NOMINATIVE : MONTHS_GENITIVE;
  return table[idx] ?? monthKey;
}

/** 1 витрата / 2 витрати / 5 витрат. */
function pluralExpenses(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} витрата`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} витрати`;
  return `${n} витрат`;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }
  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const params = event.queryStringParameters ?? {};
  const stage = (params.stage ?? "final").trim().toLowerCase() === "soft" ? "soft" : "final";
  // Прогін без запису — щоб перевірити склад списку на реальних даних.
  const dryRun = params.dry === "1" || params.dry === "true";

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const today = todayKeyInKiev(new Date());
    const currentMonth = today.slice(0, 7);
    const targetMonth = stage === "soft" ? currentMonth : shiftMonthKey(currentMonth, -1);
    const targetFrom = firstDayOf(targetMonth);
    const targetTo = lastDayOf(targetMonth);

    // Кандидати: журнальні регулярні витрати. Події виключені — вони разові за
    // природою (корпоратив не «ведуть щомісяця»), див. event_type.
    const expensesResult = await adminClient
      .schema("tosho")
      .from("finance_expenses")
      .select("id,team_id,supplier_name,category_id,object_group,expense_date,archived_at")
      .eq("is_recurring", true)
      .eq("amount_varies", true)
      .is("event_type", null)
      .limit(2000);
    if (expensesResult.error) throw expensesResult.error;
    const expenses = (expensesResult.data ?? []) as ExpenseRow[];

    if (expenses.length === 0) {
      return jsonResponse(200, { success: true, stage, targetMonth, scanned: 0, missing: 0, delivered: 0 });
    }

    const expenseIds = expenses.map((e) => e.id);
    const categoryIds = Array.from(new Set(expenses.map((e) => e.category_id).filter(Boolean))) as string[];

    const [entriesResult, membershipsResult, profilesResult, teamLinksResult, categoriesResult] = await Promise.all([
      // Потрібен лише цільовий місяць: історія більше ні на що не впливає.
      adminClient
        .schema("tosho")
        .from("finance_expense_monthly_amounts")
        .select("expense_id,entry_date")
        .in("expense_id", expenseIds)
        .gte("entry_date", targetFrom)
        .lte("entry_date", targetTo)
        .limit(10000),
      adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("user_id,workspace_id,access_role,job_role")
        .limit(10000),
      adminClient
        .schema("tosho")
        .from("team_member_profiles")
        .select("user_id,employment_status,first_name,last_name")
        .limit(10000),
      adminClient.from("team_members").select("user_id,team_id").limit(10000),
      categoryIds.length
        ? adminClient.schema("tosho").from("finance_expense_categories").select("id,name").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (entriesResult.error) throw entriesResult.error;
    if (membershipsResult.error) throw membershipsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (teamLinksResult.error) throw teamLinksResult.error;
    if (categoriesResult.error) throw categoriesResult.error;

    // Ключ — ОПЕРАЦІЙНИЙ team_id (той самий, що у finance_expenses.team_id),
    // а не workspace_id: вони різні, і на цьому губились отримувачі.
    const recipientsByTeam = groupRecipientsByTeam(
      mergeTeamMembers({
        memberships: (membershipsResult.data ?? []) as MembershipSource[],
        profiles: (profilesResult.data ?? []) as ProfileSource[],
        teamLinks: (teamLinksResult.data ?? []) as TeamLinkSource[],
      }),
      isFinanceRole
    );

    const categoryName = new Map<string, string>();
    for (const c of (categoriesResult.data ?? []) as Array<{ id: string; name: string }>) {
      categoryName.set(c.id, c.name);
    }

    const inTargetMonth = new Set<string>();
    for (const row of (entriesResult.data ?? []) as EntryRow[]) {
      if (row.entry_date.slice(0, 7) === targetMonth) inTargetMonth.add(row.expense_id);
    }

    // Порожні за цільовий місяць — з тих, що в цьому місяці взагалі існували.
    const missing = expenses.filter(
      (e) => !inTargetMonth.has(e.id) && isExpenseInMonth(e, targetMonth)
    );

    if (missing.length === 0) {
      return jsonResponse(200, {
        success: true,
        stage,
        targetMonth,
        scanned: expenses.length,
        missing: 0,
        delivered: 0,
      });
    }

    // Групуємо по команді, всередині — по обʼєкту/адресі: «Богданівська 7: ...».
    const byTeam = new Map<string, Map<string, string[]>>();
    for (const e of missing) {
      const label =
        e.supplier_name?.trim() ||
        (e.category_id ? categoryName.get(e.category_id) : null) ||
        "Без назви";
      const group = e.object_group?.trim() || UNTAGGED_GROUP;
      const teamGroups = byTeam.get(e.team_id) ?? new Map<string, string[]>();
      const names = teamGroups.get(group) ?? [];
      names.push(label);
      teamGroups.set(group, names);
      byTeam.set(e.team_id, teamGroups);
    }

    const monthNom = monthLabel(targetMonth, "nominative");
    const monthGen = monthLabel(targetMonth, "genitive");
    const pendingRows: PendingNotificationRow[] = [];
    const preview: Array<{ teamId: string; recipients: number; title: string; body: string }> = [];

    for (const [teamId, groups] of byTeam) {
      const recipients = recipientsByTeam.get(teamId);
      const count = Array.from(groups.values()).reduce((sum, names) => sum + names.length, 0);

      // Безобʼєктні («Інші») — завжди в кінці, решта за абеткою.
      const body = Array.from(groups.entries())
        .sort((a, b) => {
          if (a[0] === UNTAGGED_GROUP) return 1;
          if (b[0] === UNTAGGED_GROUP) return -1;
          return a[0].localeCompare(b[0], "uk");
        })
        .map(([group, names]) => `${group}: ${names.sort((x, y) => x.localeCompare(y, "uk")).join(", ")}`)
        .join("\n");

      const title =
        stage === "soft"
          ? `До кінця ${monthGen} не внесено — ${pluralExpenses(count)}`
          : `${monthNom} не закритий — ${pluralExpenses(count)}`;

      // «reminder=» у href обовʼязкове: частковий унікальний індекс, на якому
      // тримається dedupeByHref, діє ЛИШЕ для таких посилань.
      const reminderKey = `month-close:${targetMonth}:${stage}`;
      const href = `/finances?tab=expenses&month=${targetMonth}&highlight=missing&reminder=${encodeURIComponent(reminderKey)}`;

      preview.push({ teamId, recipients: recipients?.size ?? 0, title, body });
      if (!recipients || recipients.size === 0) continue;
      for (const userId of recipients) {
        pendingRows.push({ user_id: userId, title, body, href, type: "warning" });
      }
    }

    if (dryRun) {
      return jsonResponse(200, {
        success: true,
        dryRun: true,
        stage,
        targetMonth,
        scanned: expenses.length,
        missing: missing.length,
        wouldNotify: pendingRows.length,
        preview,
      });
    }

    let delivered = 0;
    let pushDelivered = 0;
    let pushFailed = 0;
    if (pendingRows.length > 0) {
      const delivery = await deliverNotifications(adminClient, pendingRows, {
        dedupeByHref: true,
        category: "finance_month_close",
      });
      delivered = delivery.delivered;
      pushDelivered = delivery.pushDelivered;
      pushFailed = delivery.pushFailed;
    }

    return jsonResponse(200, {
      success: true,
      stage,
      targetMonth,
      scanned: expenses.length,
      missing: missing.length,
      delivered,
      pushDelivered,
      pushFailed,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};
