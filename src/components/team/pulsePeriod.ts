export type PulseRange = "day" | "week" | "month" | "year";

// Calendar periods, not rolling windows. Two reasons: "за сьогодні" is what
// people actually ask for, and user_activity_daily stores minutes in per-day
// buckets (Europe/Kiev) — a true "last 24h" cannot be derived from them, which
// is why actions and minutes used to describe different spans.
function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const mondayIndex = (next.getDay() + 6) % 7;
  return addDays(next, -mondayIndex);
}

export function getPulsePeriod(range: PulseRange, offset: number, now = new Date()) {
  if (range === "day") {
    const start = addDays(startOfDay(now), offset);
    return { start, end: addDays(start, 1) };
  }
  if (range === "week") {
    const start = addDays(startOfWeek(now), offset * 7);
    return { start, end: addDays(start, 7) };
  }
  if (range === "month") {
    const start = startOfDay(now);
    start.setDate(1);
    start.setMonth(start.getMonth() + offset);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }
  const start = startOfDay(now);
  start.setMonth(0, 1);
  start.setFullYear(start.getFullYear() + offset);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return { start, end };
}

export function formatPulsePeriod(range: PulseRange, offset: number, start: Date, end: Date) {
  if (range === "day") {
    if (offset === 0) return "Сьогодні";
    if (offset === -1) return "Вчора";
    return start.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  }
  if (range === "week") {
    const last = addDays(end, -1);
    const sameMonth = start.getMonth() === last.getMonth();
    const from = start.toLocaleDateString("uk-UA", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
    const to = last.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
    return `${from}–${to}`;
  }
  if (range === "month") {
    return start.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  }
  return String(start.getFullYear());
}

export function bucketOf(range: PulseRange): "hour" | "day" | "month" {
  if (range === "day") return "hour";
  if (range === "year") return "month";
  return "day";
}

export function toDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

