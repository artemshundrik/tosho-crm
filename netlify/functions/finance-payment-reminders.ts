import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";

// Нагадування про майбутній регулярний платіж (велика річна підписка тощо):
// шле нотифікацію за reminder_lead_days днів до next_charge_date. Отримувачі —
// фін-ролі (власник + SEO + бухгалтери). Після проходження дати посуває
// next_charge_date на період уперед, щоб нагадування повторювалось щоперіоду.
// Тригер рахуємо ДАТОВОЮ арифметикою в Europe/Kiev (next_charge_date — це date,
// floating wall-clock, а не UTC-момент).

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

type ExpenseRow = {
  id: string;
  team_id: string;
  supplier_name?: string | null;
  category_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  recurrence?: string | null;
  next_charge_date?: string | null;
  reminder_lead_days?: number | null;
};

type MemberProfileRow = {
  workspace_id: string;
  user_id: string;
  access_role?: string | null;
  job_role?: string | null;
  employment_status?: string | null;
};

type PendingNotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "warning";
};

const TIME_ZONE = "Europe/Kiev";
const EXISTING_NOTIFICATION_LOOKBACK_DAYS = 60;
const RECURRENCE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
const CURRENCY_SYMBOL: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€" };

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// «Сьогодні» як YYYY-MM-DD у Києві (дати списань — floating wall-clock).
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

// «YYYY-MM-DD» ± днів → «YYYY-MM-DD» (UTC-безпечно, лише дата).
function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// Додати N місяців до дати (з переносом місяця засобами Date).
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

// Прокрутити дату платежу вперед по періоду, поки вона не стане >= today.
function rollForward(chargeDate: string, recurrence: string | null | undefined, today: string): string {
  const step = RECURRENCE_MONTHS[(recurrence ?? "monthly").toLowerCase()] ?? 1;
  let next = chargeDate;
  let guard = 0;
  while (next < today && guard < 240) {
    next = addMonths(next, step);
    guard += 1;
  }
  return next;
}

function formatDateUA(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function formatAmount(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  const num = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  return `${num} ${sym}`;
}

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function isDeliverableMember(profile: MemberProfileRow) {
  const status = normalize(profile.employment_status);
  return status !== "inactive" && status !== "rejected";
}

// Фін-ролі: власник + SEO + бухгалтери (той самий набір, що бачить Фінанси).
function isFinanceMember(profile: MemberProfileRow) {
  const access = normalize(profile.access_role);
  const job = normalize(profile.job_role);
  return access === "owner" || access === "admin" || ["seo", "accountant", "chief_accountant"].includes(job);
}

function reminderKeyFromHref(href?: string | null) {
  if (!href) return null;
  const q = href.indexOf("?");
  if (q === -1) return null;
  return new URLSearchParams(href.slice(q + 1)).get("reminder")?.trim() || null;
}

export const config = {
  // Щодня о 06:00 UTC (~08–09 Київ). Функція резолвить «сьогодні» у Києві, тож
  // конкретна година-тригер не критична.
  schedule: "0 6 * * *",
};

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

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const now = new Date();
    const today = todayKeyInKiev(now);
    const notificationFromIso = new Date(
      now.getTime() - EXISTING_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Кандидати: регулярні сталі платежі з увімкненим нагадуванням і датою списання.
    const expensesResult = await adminClient
      .schema("tosho")
      .from("finance_expenses")
      .select("id,team_id,supplier_name,category_id,amount,currency,recurrence,next_charge_date,reminder_lead_days")
      .not("reminder_lead_days", "is", null)
      .eq("is_recurring", true)
      .eq("amount_varies", false)
      .not("next_charge_date", "is", null)
      .limit(2000);
    if (expensesResult.error) throw expensesResult.error;
    const expenses = (expensesResult.data ?? []) as ExpenseRow[];

    if (expenses.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, delivered: 0, rolled: 0 });
    }

    const teamIds = Array.from(new Set(expenses.map((e) => e.team_id).filter(Boolean)));
    const categoryIds = Array.from(new Set(expenses.map((e) => e.category_id).filter(Boolean))) as string[];

    const [profilesResult, categoriesResult, existingResult] = await Promise.all([
      adminClient
        .schema("tosho")
        .from("team_member_profiles")
        .select("workspace_id,user_id,access_role,job_role,employment_status")
        .in("workspace_id", teamIds)
        .limit(10000),
      categoryIds.length
        ? adminClient.schema("tosho").from("finance_expense_categories").select("id,name").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null }),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/finances%")
        .gte("created_at", notificationFromIso)
        .limit(5000),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    if (existingResult.error) throw existingResult.error;

    // teamId → набір фін-отримувачів.
    const recipientsByTeam = new Map<string, Set<string>>();
    for (const p of (profilesResult.data ?? []) as MemberProfileRow[]) {
      if (!p.workspace_id || !p.user_id || !isDeliverableMember(p) || !isFinanceMember(p)) continue;
      const set = recipientsByTeam.get(p.workspace_id) ?? new Set<string>();
      set.add(p.user_id);
      recipientsByTeam.set(p.workspace_id, set);
    }

    const categoryName = new Map<string, string>();
    for (const c of (categoriesResult.data ?? []) as Array<{ id: string; name: string }>) {
      categoryName.set(c.id, c.name);
    }

    const existingKeys = new Set(
      ((existingResult.data ?? []) as Array<{ user_id?: string | null; href?: string | null }>)
        .map((r) => {
          const uid = r.user_id?.trim();
          const key = reminderKeyFromHref(r.href);
          return uid && key ? `${uid}::${key}` : null;
        })
        .filter((v): v is string => Boolean(v))
    );

    const pendingRows: PendingNotificationRow[] = [];
    let rolled = 0;

    for (const e of expenses) {
      if (!e.next_charge_date) continue;

      // 1) Прокрутка: якщо дата минула — посуваємо на період уперед (щоб повторювалось).
      let charge = e.next_charge_date;
      if (charge < today) {
        const next = rollForward(charge, e.recurrence, today);
        if (next !== charge) {
          const upd = await adminClient
            .schema("tosho")
            .from("finance_expenses")
            .update({ next_charge_date: next })
            .eq("id", e.id);
          if (!upd.error) {
            charge = next;
            rolled += 1;
          }
        }
      }

      // 2) Вікно нагадування: fireDate <= today <= charge (дедуп зробить «раз на дату»).
      const lead = e.reminder_lead_days ?? 0;
      const fireDate = shiftDays(charge, -lead);
      if (!(fireDate <= today && today <= charge)) continue;

      const recipients = recipientsByTeam.get(e.team_id);
      if (!recipients || recipients.size === 0) continue;

      const name =
        e.supplier_name?.trim() ||
        (e.category_id ? categoryName.get(e.category_id) : null) ||
        "Регулярний платіж";
      const amountNum = typeof e.amount === "string" ? Number(e.amount) : e.amount ?? 0;
      const amountText = formatAmount(Number.isFinite(amountNum as number) ? (amountNum as number) : 0, (e.currency ?? "UAH").toUpperCase());
      const reminderKey = `expense:${e.id}:${charge}`;
      const href = `/finances?tab=calendar&reminder=${encodeURIComponent(reminderKey)}&expenseId=${e.id}`;
      const daysLeft = Math.max(0, Math.round((Date.parse(`${charge}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000));
      const whenText = daysLeft === 0 ? "сьогодні" : daysLeft === 1 ? "завтра" : `за ${daysLeft} дн.`;

      for (const userId of recipients) {
        const dedupeKey = `${userId}::${reminderKey}`;
        if (existingKeys.has(dedupeKey)) continue;
        existingKeys.add(dedupeKey);
        pendingRows.push({
          user_id: userId,
          title: `Платіж ${whenText}: ${name}`,
          body: `${amountText} спишеться ${formatDateUA(charge)}. Переконайтесь, що є кошти на картці.`,
          href,
          type: "warning",
        });
      }
    }

    let delivered = 0;
    let pushDelivered = 0;
    let pushFailed = 0;
    if (pendingRows.length > 0) {
      const delivery = await deliverNotifications(adminClient, pendingRows, {
        dedupeByHref: true,
        category: "finance_payment",
      });
      delivered = delivery.delivered;
      pushDelivered = delivery.pushDelivered;
      pushFailed = delivery.pushFailed;
    }

    return jsonResponse(200, { success: true, scanned: expenses.length, rolled, delivered, pushDelivered, pushFailed });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};
