import type { SupabaseClient } from "@supabase/supabase-js";

// Люди: список команди й зведення по конкретній людині.
//
// Назви посад беремо з канонічного src/lib/jobRoles.ts — того самого, що
// показує інтерфейс. Своя копія тут рано чи пізно розійшлася б із UI.

import { escapeTelegramHtml } from "./_telegram";
import { ABSENCE_KIND_LABELS, formatAbsenceShort } from "./_lib/absenceSubmit";
import { formatJobRole } from "../../src/lib/jobRoles";
import { formatLastSeenAgo } from "../../src/lib/lastSeen";
import { CLOCK_SKEW_TOLERANCE_MS } from "../../src/lib/presenceWindow";
import { loadWorkSchedules, scheduleRowsForDates } from "./_lib/workSchedules";
// Людські підписи дій — той самий довідник, що показує вкладка «Пульс».
// Без нього у відповідь летіли сирі ключі на кшталт design_task_brief_change_request.
import { actionLabel, isNoiseActivity } from "../../src/components/team/activityCategories";
import { runSaleTotal, type QuoteRunPricingRow } from "./_lib/quotePricing";
import { resolvePeriod, type DesignPeriod } from "./_designAssistant";

export type TeamIntent = "team_list" | "person_summary" | "who_is_online" | "who_is_absent";

// Групи посад для фільтра «дай список менеджерів».
const ROLE_GROUPS: Record<string, string[]> = {
  менеджер: ["manager", "sales_manager", "junior_sales_manager", "top_manager", "office_manager"],
  дизайнер: ["designer"],
  бухгалтер: ["accountant", "chief_accountant"],
  логіст: ["logistics", "head_of_logistics"],
  маркетолог: ["marketer", "smm", "seo"],
  pm: ["pm"],
};

// Емодзі за посадою — щоб список читався оком, а не вичитувався.
const ROLE_EMOJI: Record<string, string> = {
  manager: "💼",
  sales_manager: "💼",
  junior_sales_manager: "💼",
  top_manager: "💼",
  office_manager: "🗂",
  designer: "🎨",
  pm: "🧭",
  seo: "📈",
  smm: "📣",
  marketer: "📣",
  accountant: "🧮",
  chief_accountant: "🧮",
  logistics: "🚚",
  head_of_logistics: "🚚",
  head_of_production: "🏭",
  printer: "🖨",
  packer: "📦",
};

function roleEmoji(jobRole: string | null): string {
  return ROLE_EMOJI[(jobRole ?? "").trim().toLowerCase()] ?? "👤";
}

const TIME_ZONE = "Europe/Kiev";

/** YYYY-MM-DD за Києвом зі зсувом у днях — журнал відсутностей живе в датах. */
export function kyivDateKey(now: Date, offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + offsetDays * 86_400_000));
}

export type Presence = { lastSeenAt: string | null; where: string | null };

/**
 * Остання поява кожного в системі + де саме він був.
 *
 * `public.user_presence` тримає один рядок на людину й оновлюється на кожен
 * пінг, тож це і є чесна відповідь на «коли востаннє був у системі» — краща за
 * час логіну, бо ловить реальне користування, а не факт входу.
 */
export async function loadPresence(admin: SupabaseClient): Promise<Map<string, Presence>> {
  const { data, error } = await admin
    .from("user_presence")
    .select("user_id,last_seen_at,current_label,current_path")
    .limit(1000);
  if (error) throw new Error(`user_presence: ${error.message}`);
  const map = new Map<string, Presence>();
  for (const row of ((data ?? []) as Array<{
    user_id?: string | null;
    last_seen_at?: string | null;
    current_label?: string | null;
    current_path?: string | null;
  }>)) {
    if (!row.user_id) continue;
    map.set(row.user_id, {
      lastSeenAt: row.last_seen_at ?? null,
      where: (row.current_label ?? "").trim() || (row.current_path ?? "").trim() || null,
    });
  }
  return map;
}

/**
 * «зараз онлайн» / «3 дн 4 год тому» — людською мовою, а не ISO.
 * Та сама двоодинична точність, що й у CRM (src/lib/lastSeen.ts).
 */
export function formatLastSeen(lastSeenAt: string | null, now: Date): string {
  if (!lastSeenAt) return "не заходив";
  const ageMs = now.getTime() - new Date(lastSeenAt).getTime();
  // Позначка з майбутнього поза допуском — несправний годинник, а не присутність
  // (REQ-184). Форматер нижче про це знає й віддасть дату замість «щойно».
  if (ageMs < -CLOCK_SKEW_TOLERANCE_MS) return formatLastSeenAgo(lastSeenAt, now);
  if (Math.floor(Math.max(0, ageMs) / 60_000) < 3) return "зараз онлайн";
  return formatLastSeenAgo(lastSeenAt, now);
}

/**
 * Онлайн вважаємо тих, хто пінгував протягом 5 хвилин.
 *
 * Верхня межа тут не менш важлива за нижню: `last_seen_at` пише клієнт своїм
 * годинником, і позначка з майбутнього проходила перевірку «менше за 5 хвилин»
 * завжди — асистент звітував «зараз онлайн» про людину, яка пішла ще вчора
 * (REQ-184). Той самий допуск, що в CRM, щоб бот і застосунок не сперечались.
 */
export function isOnline(lastSeenAt: string | null, now: Date): boolean {
  if (!lastSeenAt) return false;
  const ageMs = now.getTime() - new Date(lastSeenAt).getTime();
  if (ageMs < -CLOCK_SKEW_TOLERANCE_MS) return false;
  return Math.max(0, ageMs) < 5 * 60_000;
}

export type TeamMember = {
  userId: string;
  name: string;
  jobRole: string | null;
  /** false = звільнений. Зі списків ховаємо, у пошуку за іменем лишаємо. */
  isActive?: boolean;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[ʼ‘’`´]/g, "'").replace(/\s+/g, " ");
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(amount))} ₴`;
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.trim();
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

/** Які посади просять: «менеджерів» → manager+sales_manager+…; порожньо → усі. */
function resolveRoleFilter(raw: string | null): string[] | null {
  const needle = normalize(raw ?? "");
  if (!needle) return null;
  for (const [key, roles] of Object.entries(ROLE_GROUPS)) {
    // «менеджери», «менеджерів», «менеджер» — усе через основу слова.
    if (needle.includes(key.slice(0, Math.max(3, key.length - 1)))) return roles;
  }
  return null;
}

export function renderTeamList(
  members: TeamMember[],
  roleQuery: string | null,
  presence: Map<string, Presence>,
  now: Date
): string {
  const filter = resolveRoleFilter(roleQuery);
  // Звільнених у переліку команди бути не має — це не історична довідка, а
  // «хто в нас зараз працює».
  const active = members.filter((m) => m.isActive !== false);
  const filtered = filter
    ? active.filter((m) => filter.includes((m.jobRole ?? "").trim().toLowerCase()))
    : active;

  if (filtered.length === 0) {
    return roleQuery
      ? `Не знайшов нікого за «${escapeTelegramHtml(roleQuery)}».`
      : "У команді нікого не знайшов.";
  }

  // Групуємо за посадою — так список читається, а не зливається.
  const byRole = new Map<string, TeamMember[]>();
  for (const member of filtered) {
    const label = formatJobRole(member.jobRole) || "Без посади";
    const list = byRole.get(label) ?? [];
    list.push(member);
    byRole.set(label, list);
  }

  const lines = [`👥 <b>Команда — ${filtered.length}</b>`];
  for (const [role, list] of Array.from(byRole.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const emoji = roleEmoji(list[0]?.jobRole ?? null);
    lines.push("", `${emoji} <b>${escapeTelegramHtml(role)}</b>`);
    for (const member of list.sort((a, b) => a.name.localeCompare(b.name, "uk"))) {
      const seen = presence.get(member.userId);
      const online = isOnline(seen?.lastSeenAt ?? null, now);
      const mark = online ? "🟢" : "⚪️";
      lines.push(
        `   ${mark} ${escapeTelegramHtml(member.name || "(без імені)")} · ` +
          `<i>${escapeTelegramHtml(formatLastSeen(seen?.lastSeenAt ?? null, now))}</i>`
      );
    }
  }
  return lines.join("\n");
}

/** «Хто зараз у системі» — онлайн зараз і хто був сьогодні, з місцем перебування. */
export function renderPresence(members: TeamMember[], presence: Map<string, Presence>, now: Date): string {
  const rows = members
    .filter((m) => m.isActive !== false)
    .map((m) => ({ member: m, seen: presence.get(m.userId) ?? null }))
    .filter((r) => r.seen?.lastSeenAt)
    .sort((a, b) => new Date(b.seen!.lastSeenAt!).getTime() - new Date(a.seen!.lastSeenAt!).getTime());

  if (rows.length === 0) return "🤷 Даних про присутність поки немає.";

  const online = rows.filter((r) => isOnline(r.seen!.lastSeenAt, now));
  const rest = rows.filter((r) => !isOnline(r.seen!.lastSeenAt, now));

  const lines: string[] = [];
  if (online.length > 0) {
    lines.push(`🟢 <b>Зараз у системі — ${online.length}</b>`, "");
    for (const r of online) {
      lines.push(
        `   ${roleEmoji(r.member.jobRole)} ${escapeTelegramHtml(shortName(r.member.name))}` +
          (r.seen!.where ? ` · <i>${escapeTelegramHtml(r.seen!.where)}</i>` : "")
      );
    }
  } else {
    lines.push("😴 <b>Зараз у системі нікого</b>");
  }

  if (rest.length > 0) {
    lines.push("", `⚪️ <b>Були раніше</b>`, "");
    for (const r of rest.slice(0, 12)) {
      lines.push(
        `   ${roleEmoji(r.member.jobRole)} ${escapeTelegramHtml(shortName(r.member.name))} · ` +
          `<i>${escapeTelegramHtml(formatLastSeen(r.seen!.lastSeenAt, now))}</i>`
      );
    }
  }
  return lines.join("\n");
}

async function sumByQuote(admin: SupabaseClient, quoteIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (quoteIds.length === 0) return totals;
  const { data, error } = await admin
    .schema("tosho")
    .from("quote_item_runs")
    .select(
      "quote_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,markup_rate,manager_rate,fixed_cost_rate,vat_rate"
    )
    .in("quote_id", quoteIds)
    .limit(20000);
  if (error) throw new Error(`quote_item_runs: ${error.message}`);
  for (const run of ((data ?? []) as QuoteRunPricingRow[])) {
    if (!run.quote_id) continue;
    totals.set(run.quote_id, (totals.get(run.quote_id) ?? 0) + runSaleTotal(run));
  }
  return totals;
}

/**
 * Зведення по людині за період: продажі, дизайн, активність.
 *
 * Свідомо НЕ прив'язане до посади: показуємо ті блоки, де є дані. Так відповідь
 * однаково працює і для менеджера, і для дизайнера, і для того, хто робить
 * і те, і те — не треба вгадувати роль наперед.
 */
export async function renderPersonSummary(params: {
  admin: SupabaseClient;
  teamIds: string[];
  person: TeamMember;
  period: DesignPeriod | null;
  presence: Presence | null;
  now: Date;
}): Promise<string> {
  const { admin, teamIds, person, period, presence, now } = params;
  const resolved = resolvePeriod(period ?? "this_month", now);
  const userId = person.userId;

  const [createdResult, approvedResult, ordersResult, customersResult, leadsResult, activityResult] =
    await Promise.all([
      (() => {
        let q = admin
          .schema("tosho")
          .from("quotes")
          .select("id")
          .in("team_id", teamIds)
          .eq("assigned_to", userId)
          .limit(2000);
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
        return q;
      })(),
      (() => {
        let q = admin
          .schema("tosho")
          .from("quotes")
          .select("id")
          .in("team_id", teamIds)
          .eq("assigned_to", userId)
          .eq("status", "approved")
          .limit(2000);
        if (resolved.startIso) q = q.gte("decided_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("decided_at", resolved.endIso);
        return q;
      })(),
      (() => {
        let q = admin
          .schema("tosho")
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("team_id", teamIds)
          .eq("manager_user_id", userId);
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
        return q;
      })(),
      admin
        .schema("tosho")
        .from("customers")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("manager_user_id", userId),
      admin
        .schema("tosho")
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("manager_user_id", userId),
      (() => {
        let q = admin.from("activity_log").select("action,created_at").eq("user_id", userId).limit(5000);
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
        return q;
      })(),
    ]);

  if (createdResult.error) throw new Error(`quotes (created): ${createdResult.error.message}`);
  if (approvedResult.error) throw new Error(`quotes (approved): ${approvedResult.error.message}`);

  const createdIds = ((createdResult.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const approvedIds = ((approvedResult.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const totals = await sumByQuote(admin, Array.from(new Set([...createdIds, ...approvedIds])));
  const sumOf = (ids: string[]) => ids.reduce((sum, id) => sum + (totals.get(id) ?? 0), 0);

  const role = formatJobRole(person.jobRole);
  const departed = person.isActive === false ? " · <i>не працює</i>" : "";
  const lines = [
    `${roleEmoji(person.jobRole)} <b>${escapeTelegramHtml(person.name || "—")}</b>${role ? ` · ${escapeTelegramHtml(role)}` : ""}${departed}`,
    `🗓 ${escapeTelegramHtml(resolved.label)}`,
    `${isOnline(presence?.lastSeenAt ?? null, now) ? "🟢" : "⚪️"} У системі: ${escapeTelegramHtml(
      formatLastSeen(presence?.lastSeenAt ?? null, now)
    )}${presence?.where ? ` · <i>${escapeTelegramHtml(presence.where)}</i>` : ""}`,
  ];

  const sales: string[] = [];
  if (createdIds.length > 0) {
    sales.push(`🧾 Прорахунків: <b>${createdIds.length}</b> на ${escapeTelegramHtml(formatMoney(sumOf(createdIds)))}`);
  }
  if (approvedIds.length > 0) {
    sales.push(`✅ Затверджено: <b>${approvedIds.length}</b> на ${escapeTelegramHtml(formatMoney(sumOf(approvedIds)))}`);
  }
  if ((ordersResult.count ?? 0) > 0) sales.push(`📦 Замовлень: <b>${ordersResult.count}</b>`);
  if (sales.length > 0) lines.push("", "💰 <b>Продажі</b>", ...sales);

  const base: string[] = [];
  if ((customersResult.count ?? 0) > 0) base.push(`🤝 Клієнтів: <b>${customersResult.count}</b>`);
  if ((leadsResult.count ?? 0) > 0) base.push(`🌱 Лідів: <b>${leadsResult.count}</b>`);
  if (base.length > 0) lines.push("", "📇 <b>База</b>", ...base);

  // Активність показує, що людина взагалі робила — навіть коли продажів нема.
  // Підписи ЛЮДСЬКІ: сирі ключі на кшталт design_task_brief_change_request
  // читати неможливо.
  const events = ((activityResult.data ?? []) as Array<{ action?: string | null; created_at?: string | null }>)
    .filter((r) => (r.action ?? "").trim() && !isNoiseActivity((r.action ?? "").trim(), null));
  const actions = events.map((r) => (r.action ?? "").trim());

  // Ритм дня: коли людина реально працює. Години рахуємо в Києві, інакше
  // «пік о 6 ранку» замість 9-ї.
  if (events.length > 0) {
    const hours = new Map<number, number>();
    let firstIso: string | null = null;
    let lastIso: string | null = null;
    for (const event of events) {
      if (!event.created_at) continue;
      const hour = Number(
        new Intl.DateTimeFormat("uk-UA", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(
          new Date(event.created_at)
        )
      );
      if (Number.isFinite(hour)) hours.set(hour, (hours.get(hour) ?? 0) + 1);
      if (!firstIso || event.created_at < firstIso) firstIso = event.created_at;
      if (!lastIso || event.created_at > lastIso) lastIso = event.created_at;
    }
    const peak = Array.from(hours.entries()).sort((a, b) => b[1] - a[1])[0];
    const clock = (iso: string | null) =>
      iso
        ? new Intl.DateTimeFormat("uk-UA", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(
            new Date(iso)
          )
        : "—";
    const rhythm: string[] = [];
    if (firstIso && lastIso) rhythm.push(`   🌅 Від ${clock(firstIso)} до ${clock(lastIso)}`);
    if (peak) rhythm.push(`   🔥 Пік о ${String(peak[0]).padStart(2, "0")}:00 — ${peak[1]} дій`);
    if (rhythm.length > 0) lines.push("", "⏱ <b>Ритм</b>", ...rhythm);
  }

  if (actions.length > 0) {
    const counts = new Map<string, number>();
    for (const action of actions) {
      const label = actionLabel(action);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    lines.push("", `⚡️ <b>Чим займався</b> — ${actions.length} дій`);
    for (const [label, count] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      lines.push(`   ${escapeTelegramHtml(label)}: <b>${count}</b>`);
    }
  }

  if (lines.length === 3) {
    lines.push("", `😴 Активності ${escapeTelegramHtml(resolved.label)} не знайшов.`);
  }
  return lines.join("\n");
}

const ABSENCE_EMOJI: Record<string, string> = {
  vacation: "🏖",
  day_off: "🌤",
  sick_leave: "🤒",
  other: "📌",
};

type AbsenceJournalRow = {
  user_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  kind?: string | null;
  status?: string | null;
};

/**
 * «Хто сьогодні відсутній» — з журналу tosho.team_absences, того самого, що
 * живить планер у CRM. Доступно всій команді: тип відсутності й так видно
 * кожному в календарі, а от коментарі-причини сюди не потрапляють ніколи.
 */
export async function renderWhoIsAbsent(params: {
  admin: SupabaseClient;
  workspaceId: string;
  members: TeamMember[];
  now: Date;
}): Promise<string> {
  const { admin, workspaceId, members, now } = params;
  const todayKey = kyivDateKey(now);
  const tomorrowKey = kyivDateKey(now, 1);

  const [currentResult, pendingResult, holidayResult, workSchedules] = await Promise.all([
    admin
      .schema("tosho")
      .from("team_absences")
      .select("user_id,start_date,end_date,kind,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "approved")
      .lte("start_date", tomorrowKey)
      .gte("end_date", todayKey)
      .limit(200),
    admin
      .schema("tosho")
      .from("team_absences")
      .select("user_id,start_date,end_date,kind,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .gte("end_date", todayKey)
      .order("start_date", { ascending: true })
      .limit(50),
    // Свята сьогодні/завтра: «завтра неробочий» так само важливо, як «хто у
    // відпустці» — на святковий день теж не варто ставити дедлайн.
    admin
      .schema("tosho")
      .from("ua_workday_exceptions")
      // Без фільтра по is_workday: свято буває й робочим (24 серпня 2026
      // команда працює). Фільтр ховав такий день цілком, замість того щоб
      // просто не називати його вихідним.
      .select("day,note,is_workday")
      .eq("workspace_id", workspaceId)
      .in("day", [todayKey, tomorrowKey]),
    loadWorkSchedules(admin, [workspaceId]),
  ]);
  if (currentResult.error) throw new Error(`team_absences: ${currentResult.error.message}`);

  const nameByUser = new Map(members.filter((m) => m.isActive !== false).map((m) => [m.userId, m.name]));
  const label = (userId?: string | null) => {
    const name = userId ? nameByUser.get(userId) : null;
    return name ? shortName(name) : null;
  };
  const kindOf = (row: AbsenceJournalRow) => (row.kind ?? "other").trim() || "other";
  const emojiOf = (row: AbsenceJournalRow) => ABSENCE_EMOJI[kindOf(row)] ?? "📌";
  const kindLabel = (row: AbsenceJournalRow) => ABSENCE_KIND_LABELS[kindOf(row)] ?? "Відсутність";

  const journalRows = ((currentResult.data ?? []) as AbsenceJournalRow[]).filter(
    (row) => row.start_date && row.end_date && label(row.user_id)
  );

  const holidays = new Map(
    ((holidayResult.data ?? []) as Array<{ day?: string | null; note?: string | null; is_workday?: boolean | null }>)
      .filter((row) => row.day && (row.note ?? "").trim())
      .map((row) => [
        row.day as string,
        { name: (row.note ?? "").trim(), isWorkday: row.is_workday === true },
      ])
  );

  /*
   * Постійний графік — теж «з дому», просто без рядка в журналі: він живе
   * патерном у team_work_schedules (REQ-166). Без цього бот на питання «хто
   * сьогодні з дому» відповідав лише про разові записи.
   */
  const scheduleRows = scheduleRowsForDates({
    schedules: workSchedules,
    dateKeys: [todayKey],
    absences: journalRows,
    exceptions: new Map(Array.from(holidays.entries()).map(([day, holiday]) => [day, holiday.isWorkday])),
  }).filter((row) => label(row.user_id));

  const rows: AbsenceJournalRow[] = [...journalRows, ...scheduleRows];

  // «З дому» — присутність, а не відсутність: окрема секція, не в лічильнику.
  const isWfh = (row: AbsenceJournalRow) => kindOf(row) === "wfh";
  const wfhToday = rows.filter((row) => isWfh(row) && row.start_date! <= todayKey);

  const today = rows
    .filter((row) => !isWfh(row) && row.start_date! <= todayKey)
    .sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1));
  const startTomorrow = rows.filter((row) => !isWfh(row) && row.start_date === tomorrowKey);
  const backTomorrow = today.filter((row) => row.end_date === todayKey);

  const lines: string[] = [];

  // Свято сьогодні — головна новина дня, тож іде першим рядком.
  if (holidays.has(todayKey)) {
    const holiday = holidays.get(todayKey)!;
    lines.push(
      `🎉 <b>Сьогодні свято — ${escapeTelegramHtml(holiday.name)}</b>` +
        (holiday.isWorkday ? " (працюємо)" : ""),
      ""
    );
  }

  if (today.length === 0) {
    lines.push("💪 <b>Сьогодні всі на місці</b>");
  } else {
    lines.push(`🏝 <b>Сьогодні відсутні — ${today.length}</b>`, "");
    for (const row of today) {
      const until =
        row.end_date === todayKey
          ? "останній день"
          : `до ${formatAbsenceShort(row.end_date!)}`;
      lines.push(
        `${emojiOf(row)} ${escapeTelegramHtml(label(row.user_id)!)} — ${kindLabel(row).toLowerCase()}, ${until}`
      );
    }
  }

  if (wfhToday.length > 0) {
    lines.push(
      "",
      `🏠 <b>З дому</b>: ${wfhToday.map((row) => escapeTelegramHtml(label(row.user_id) as string)).join(" · ")}`
    );
  }

  const tomorrow: string[] = [];
  for (const row of backTomorrow) {
    tomorrow.push(`↩️ повертається ${escapeTelegramHtml(label(row.user_id)!)}`);
  }
  for (const row of startTomorrow) {
    tomorrow.push(
      `${emojiOf(row)} ${escapeTelegramHtml(label(row.user_id)!)} — ${kindLabel(row).toLowerCase()} з завтра` +
        (row.end_date && row.end_date !== tomorrowKey ? ` (до ${formatAbsenceShort(row.end_date)})` : "")
    );
  }
  if (holidays.has(tomorrowKey)) {
    const holiday = holidays.get(tomorrowKey)!;
    tomorrow.unshift(
      `🎉 свято — ${escapeTelegramHtml(holiday.name)}` +
        (holiday.isWorkday ? ", працюємо" : ", вихідний")
    );
  }
  if (tomorrow.length > 0) lines.push("", "<b>Завтра</b>", ...tomorrow);

  const pending = ((pendingResult.data ?? []) as AbsenceJournalRow[]).filter(
    (row) => row.start_date && row.end_date && label(row.user_id)
  );
  if (pending.length > 0) {
    const parts = pending
      .slice(0, 5)
      .map(
        (row) =>
          `${escapeTelegramHtml(label(row.user_id)!)} (${kindLabel(row).toLowerCase()} ` +
          `${formatAbsenceShort(row.start_date!)}–${formatAbsenceShort(row.end_date!)})`
      );
    lines.push(
      "",
      `⏳ На погодженні: ${parts.join(" · ")}${pending.length > 5 ? ` …і ще ${pending.length - 5}` : ""}`
    );
  }

  return lines.join("\n");
}

export { shortName };
