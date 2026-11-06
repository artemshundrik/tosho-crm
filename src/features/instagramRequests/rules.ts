/**
 * Правила заявок з Instagram без бази й без мережі.
 *
 * Лежить у src, бо це читають обидва боки: сервер ухвалює за цими правилами
 * рішення, а клієнт лише не показує кнопку, яку сервер однаково відхилить.
 * Імпорти з аліасом `@/` тут заборонені: файл збирає ще й Netlify.
 */

export type WorkHours = { startHour: number; endHour: number };
export const DEFAULT_WORK_HOURS: WorkHours = { startHour: 9, endHour: 18 };
export const WORK_TIME_ZONE = "Europe/Kiev";

/** Скільки після останнього повідомлення клієнта Instagram дає відповісти людині. */
export const REPLY_WINDOW_DAYS = 7;

export const CLOSE_REASONS = [
  { key: "not_client", label: "Не клієнт", hint: "Спам, постачальник, випадкова розмова" },
  { key: "cannot_do", label: "Не можемо зробити", hint: "Не наш товар або замалий тираж" },
  { key: "changed_mind", label: "Передумав або зник", hint: "Запитав і не замовив або перестав відповідати" },
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number]["key"];

export const isCloseReason = (value: unknown): value is CloseReason =>
  CLOSE_REASONS.some((reason) => reason.key === value);

export const closeReasonLabel = (value: string | null | undefined): string =>
  CLOSE_REASONS.find((reason) => reason.key === value)?.label ?? "";

/** Посади, що беруть заявки по колу. Те саме перелічено в SQL (can_read_instagram_requests). */
export const REQUEST_MANAGER_JOB_ROLES = ["manager", "sales_manager", "junior_sales_manager", "top_manager"] as const;

export const isRequestManagerRole = (jobRole: string | null | undefined): boolean =>
  (REQUEST_MANAGER_JOB_ROLES as readonly string[]).includes((jobRole ?? "").trim().toLowerCase());

const MINUTE = 60_000;

const kyivFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: WORK_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
});

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: string };

function wallClock(at: Date): WallClock {
  const parts: Record<string, string> = {};
  for (const part of kyivFormatter.formatToParts(at)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

/** Момент, коли в Києві на годиннику вказаний час. Зміщення беремо з самого Intl, тож перехід на літній час рахується сам. */
function kyivMoment(year: number, month: number, day: number, hour: number): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour);
  let guess = asUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const clock = wallClock(new Date(guess));
    const shown = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
    guess += asUtc - shown;
  }
  return new Date(guess);
}

const isWorkday = (clock: WallClock) => clock.weekday !== "Sat" && clock.weekday !== "Sun";

function dayBounds(clock: WallClock, hours: WorkHours) {
  return {
    start: kyivMoment(clock.year, clock.month, clock.day, hours.startHour),
    end: kyivMoment(clock.year, clock.month, clock.day, hours.endHour),
  };
}

/** Опівдні наступного дня, щоб перехід на літній час не перескочив дату. */
function nextDay(clock: WallClock): WallClock {
  return wallClock(new Date(Date.UTC(clock.year, clock.month - 1, clock.day, 12) + 24 * 60 * MINUTE));
}

export function isWorkingTime(at: Date, hours: WorkHours = DEFAULT_WORK_HOURS): boolean {
  const clock = wallClock(at);
  if (!isWorkday(clock)) return false;
  const { start, end } = dayBounds(clock, hours);
  return at >= start && at < end;
}

/** Коли мине стільки робочих хвилин, рахуючи від `from`. Поза робочим часом лічба стартує з наступного відкриття. */
export function addWorkingMinutes(from: Date, minutes: number, hours: WorkHours = DEFAULT_WORK_HOURS): Date {
  let remaining = Math.max(0, minutes);
  let cursor = from;
  let clock = wallClock(from);
  for (let guard = 0; guard < 400; guard += 1) {
    if (isWorkday(clock)) {
      const { start, end } = dayBounds(clock, hours);
      const begin = cursor > start ? cursor : start;
      if (begin < end) {
        const available = (end.getTime() - begin.getTime()) / MINUTE;
        if (remaining <= available) return new Date(begin.getTime() + remaining * MINUTE);
        remaining -= available;
      }
    }
    clock = nextDay(clock);
    cursor = kyivMoment(clock.year, clock.month, clock.day, 0);
  }
  throw new Error("addWorkingMinutes: не знайшлось робочого часу за 400 днів");
}

/** Скільки цілих робочих хвилин між двома моментами. */
export function workingMinutesBetween(from: Date, to: Date, hours: WorkHours = DEFAULT_WORK_HOURS): number {
  if (to <= from) return 0;
  let total = 0;
  let clock = wallClock(from);
  for (let guard = 0; guard < 400; guard += 1) {
    if (isWorkday(clock)) {
      const { start, end } = dayBounds(clock, hours);
      const begin = from > start ? from : start;
      const finish = to < end ? to : end;
      if (finish > begin) total += (finish.getTime() - begin.getTime()) / MINUTE;
    }
    const next = nextDay(clock);
    if (kyivMoment(next.year, next.month, next.day, 0) >= to) break;
    clock = next;
  }
  return Math.floor(total);
}

export type PickNextInput = {
  /** Відсортовані в постійному порядку: хто реально може взяти заявку зараз. */
  candidates: string[];
  /** На кому зупинилось спільне коло команди. */
  cursor: string | null;
  /** У кого ця заявка вже була на поточному колі. */
  alreadyHad: string[];
  /** Поточний відповідальний: на новому колі йому заявка дістається в останню чергу. */
  current?: string | null;
};

export type PickNextResult = { userId: string; newRound: boolean };

export function pickNextManager({ candidates, cursor, alreadyHad, current }: PickNextInput): PickNextResult | null {
  if (candidates.length === 0) return null;
  // Курсор міг лишитись на звільненому: тоді йдемо від місця, де він стояв би в порядку.
  let startIndex = 0;
  if (cursor) {
    const exact = candidates.indexOf(cursor);
    if (exact >= 0) startIndex = exact + 1;
    else {
      const after = candidates.findIndex((id) => id > cursor);
      startIndex = after >= 0 ? after : 0;
    }
  }
  const ordered = candidates.map((_, offset) => candidates[(startIndex + offset) % candidates.length]);
  const had = new Set(alreadyHad);
  const fresh = ordered.find((id) => !had.has(id));
  if (fresh) return { userId: fresh, newRound: false };
  return { userId: ordered.find((id) => id !== current) ?? ordered[0], newRound: true };
}

export function replyWindowEndsAt(lastClientMessageAt: string | Date | null | undefined): Date | null {
  if (!lastClientMessageAt) return null;
  const at = new Date(lastClientMessageAt);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(at.getTime() + REPLY_WINDOW_DAYS * 24 * 60 * MINUTE);
}

export const isReplyWindowOpen = (lastClientMessageAt: string | Date | null | undefined, now: Date): boolean => {
  const end = replyWindowEndsAt(lastClientMessageAt);
  return end !== null && now < end;
};

export type RequestActor = { userId: string; isOwnerOrCeo: boolean };
export type RequestAccessShape = {
  kind: "ad" | "other";
  status: "new" | "in_progress" | "lead" | "closed";
  assigned_user_id: string | null;
};

/** Двох відповідей клієнт не отримає: пише лише той, хто займається. «Інше» нікому не призначене, там пише керівник. */
export function canReply(actor: RequestActor, request: RequestAccessShape): boolean {
  if (request.kind === "other") return actor.isOwnerOrCeo;
  return request.assigned_user_id === actor.userId;
}

const isOwnerOfRequest = (actor: RequestActor, request: RequestAccessShape) =>
  actor.isOwnerOrCeo || request.assigned_user_id === actor.userId;

export const canManage = (actor: RequestActor, request: RequestAccessShape): boolean =>
  request.kind === "ad" && isOwnerOfRequest(actor, request);

export const canPass = (actor: RequestActor, request: RequestAccessShape): boolean =>
  canManage(actor, request) && (request.status === "new" || request.status === "in_progress");

export const canClose = canPass;

export const canReopen = (actor: RequestActor, request: RequestAccessShape): boolean =>
  canManage(actor, request) && request.status === "closed";

export const canClaim = (actor: RequestActor, request: RequestAccessShape): boolean =>
  request.kind === "ad" && request.assigned_user_id !== actor.userId && request.status !== "lead";
