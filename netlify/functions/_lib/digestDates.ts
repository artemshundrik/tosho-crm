/** Київські дати для звітів: спільні для розсилки й вкладок у боті. */

const TIME_ZONE = "Europe/Kiev";

export function todayKeyInKiev(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function zonedWallClockOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

/**
 * «Плаваючий» wall-clock → реальний момент у вказаній зоні.
 * Копія логіки з quote-deadline-reminders.ts: дедлайни зберігаються як час,
 * який обрав користувач, позначений +00, а не як справжній UTC-момент.
 */
export function wallClockToInstant(value: string, timeZone = TIME_ZONE): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return new Date(value);
  const [, y, mo, d, hh, mm, ss] = match;
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh ?? "0"), Number(mm ?? "0"), Number(ss ?? "0"));
  let instant = base - zonedWallClockOffsetMs(base, timeZone);
  instant = base - zonedWallClockOffsetMs(instant, timeZone);
  return new Date(instant);
}

/** Межі київської доби як справжні UTC-моменти. */
export function kievDayBounds(dayKey: string): { startIso: string; endIso: string } {
  return {
    startIso: wallClockToInstant(`${dayKey}T00:00:00`).toISOString(),
    endIso: wallClockToInstant(`${shiftDays(dayKey, 1)}T00:00:00`).toISOString(),
  };
}
