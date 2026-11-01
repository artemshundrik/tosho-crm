import { supabase } from "@/lib/supabaseClient";

/**
 * «Вхідні» (хвиля В2, REQ-346#p2): сповіщення, зведені за справою.
 *
 * Справу визначаємо з `href`, а не з нової колонки: прорахунок, замовлення й
 * дизайн-задача вже лежать там UUID-ом, і таблиця `notifications` лишається
 * як є. Шість однакових «внести номер з BAS» на одне замовлення — один рядок
 * «×6», а не шість.
 *
 * «Відкласти» живе в `metadata.snoozed_until` того самого рядка: власник має
 * право оновлювати свої сповіщення (політика `notifications_update_own`), а
 * повернення о 9:00 — це просто фільтр за часом, без крона й без повторного
 * пуша, тож тихих годин воно не порушує.
 */

export type InboxEntityKind = "quote" | "order" | "design";

export type InboxEntityRef = { kind: InboxEntityKind; id: string };

export type InboxNotificationRow = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  read_at: string | null;
  type: string | null;
  metadata: Record<string, unknown> | null;
};

export type InboxThreadState = "open" | "snoozed" | "done";

export type InboxThread = {
  key: string;
  entity: InboxEntityRef | null;
  href: string | null;
  /** Найсвіжіше сповіщення справи — його заголовок і час у рядку. */
  latest: InboxNotificationRow;
  notifications: InboxNotificationRow[];
  /** Скільки сповіщень справи ще не закрито — «×N» у рядку. */
  openCount: number;
  /** Хто писав, без повторів, найсвіжіший перший. */
  actors: string[];
  state: InboxThreadState;
  snoozedUntil: string | null;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ENTITY_HREF: Array<[RegExp, InboxEntityKind]> = [
  [new RegExp(`^/orders/estimates/(${UUID})`, "i"), "quote"],
  [new RegExp(`^/orders/production/(${UUID})`, "i"), "order"],
  [new RegExp(`^/design/(${UUID})`, "i"), "design"],
];

export function parseInboxEntity(href: string | null | undefined): InboxEntityRef | null {
  if (!href) return null;
  for (const [pattern, kind] of ENTITY_HREF) {
    const match = href.match(pattern);
    if (match) return { kind, id: match[1].toLowerCase() };
  }
  return null;
}

/** «Юлія К. виписав(ла) …» — автор стоїть на початку тексту сповіщення. */
const ACTOR = /^([А-ЯІЇЄҐA-Z][\p{L}'’-]+ [А-ЯІЇЄҐA-Z]\.)/u;

export function extractInboxActor(body: string | null | undefined) {
  return body?.trim().match(ACTOR)?.[1] ?? null;
}

export function snoozedUntilOf(row: InboxNotificationRow): string | null {
  const value = row.metadata?.snoozed_until;
  return typeof value === "string" && value ? value : null;
}

const isOpenAt = (row: InboxNotificationRow, now: number) => {
  if (row.read_at) return false;
  const snoozed = snoozedUntilOf(row);
  return !snoozed || Date.parse(snoozed) <= now;
};

export function buildInboxThreads(rows: InboxNotificationRow[], now = Date.now()): InboxThread[] {
  const byKey = new Map<string, InboxNotificationRow[]>();
  const order: string[] = [];
  for (const row of rows) {
    const entity = parseInboxEntity(row.href);
    const key = entity ? `${entity.kind}:${entity.id}` : row.href ? `href:${row.href}` : `id:${row.id}`;
    const list = byKey.get(key);
    if (list) list.push(row);
    else {
      byKey.set(key, [row]);
      order.push(key);
    }
  }

  return order.map((key) => {
    // Рядки приходять від найсвіжішого — порядок справ за останньою подією.
    const notifications = byKey.get(key) ?? [];
    const latest = notifications[0];
    const open = notifications.filter((row) => isOpenAt(row, now));
    const unread = notifications.filter((row) => !row.read_at);
    const snoozes = unread.map(snoozedUntilOf).filter((value): value is string => Boolean(value));
    const state: InboxThreadState = open.length > 0 ? "open" : unread.length > 0 ? "snoozed" : "done";
    const actors = Array.from(
      new Set(notifications.map((row) => extractInboxActor(row.body)).filter((value): value is string => Boolean(value)))
    );
    return {
      key,
      entity: parseInboxEntity(latest.href),
      href: latest.href,
      latest,
      notifications,
      openCount: open.length,
      actors,
      state,
      snoozedUntil: state === "snoozed" ? snoozes.sort()[0] ?? null : null,
    };
  });
}

/** Наступний ранок о 9:00 за годинником людини — межа тихих годин. */
export function nextMorning(now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

const pad = (value: number) => String(value).padStart(2, "0");
const WEEKDAYS = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfWeek = (date: Date) => {
  const day = startOfDay(date);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
};

export type InboxBucket = "today" | "week" | "earlier";

export const INBOX_BUCKET_LABELS: Record<InboxBucket, string> = {
  today: "Сьогодні",
  week: "Цього тижня",
  earlier: "Раніше",
};

export function inboxBucket(iso: string, now = new Date()): InboxBucket {
  const date = new Date(iso);
  if (date >= startOfDay(now)) return "today";
  if (date >= startOfWeek(now)) return "week";
  return "earlier";
}

/** «16:59» сьогодні, «пн» цього тижня, далі «12.10» (з роком — коли не цей). */
export function formatInboxTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  const bucket = inboxBucket(iso, now);
  if (bucket === "today") return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (bucket === "week") return WEEKDAYS[date.getDay()];
  const short = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  return date.getFullYear() === now.getFullYear() ? short : `${short}.${String(date.getFullYear()).slice(2)}`;
}

export const INBOX_SELECT = "id, title, body, href, created_at, read_at, type, metadata";

/**
 * Число на дзвонику й на сторінці — з одного розрахунку: відкриті СПРАВИ, а не
 * сирі рядки. Раніше дзвоник рахував непрочитані серед 20 останніх (20), а
 * сторінка — серед 200 (81), і обидва числа були неправдою по-різному.
 */
export async function fetchInboxOpenCount(userId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select(INBOX_SELECT)
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return null;
  return buildInboxThreads((data ?? []) as InboxNotificationRow[]).filter((thread) => thread.state === "open").length;
}
