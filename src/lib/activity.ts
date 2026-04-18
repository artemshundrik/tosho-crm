export type ActivityRow = {
  id: string;
  team_id: string | null;
  user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string | null;
  href: string | null;
  metadata?: Record<string, unknown> | null;
  event_date?: string | null;
  event_time?: string | null;
  created_at: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  subtitle?: string;
  actor?: string;
  action?: string;
  user_id?: string | null;
  avatar_url?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  href?: string;
  time: string;
  created_at: string;
  type?: string;
};

export function resolveActivityType(input: {
  entity_type?: string | null;
  action?: string | null;
  title?: string | null;
}): "quotes" | "design" | "team" | "other" {
  const haystack = `${input.entity_type ?? ""} ${input.action ?? ""} ${input.title ?? ""}`.toLowerCase();
  if (
    haystack.includes("design") ||
    haystack.includes("дизайн") ||
    haystack.includes("макет")
  ) {
    return "design";
  }
  if (
    haystack.includes("invoice") ||
    haystack.includes("transaction") ||
    haystack.includes("payment") ||
    haystack.includes("рахунок") ||
    haystack.includes("плат")
  ) {
    return "other";
  }
  if (
    haystack.includes("team") ||
    haystack.includes("member") ||
    haystack.includes("invite") ||
    haystack.includes("workspace") ||
    haystack.includes("команд") ||
    haystack.includes("інвайт")
  ) {
    return "team";
  }
  if (
    haystack.includes("quote") ||
    haystack.includes("estimate") ||
    haystack.includes("order") ||
    haystack.includes("прорах")
  ) {
    return "quotes";
  }
  return "other";
}

export function formatActivityTime(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} • ${time}`;
}

export function formatActivityClock(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatActivityDayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayStart.getTime() - dayStart.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Сьогодні";
  if (diffDays === 1) return "Вчора";

  const formatted = new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function mapActivityRow(row: ActivityRow): ActivityItem {
  const actor = row.actor_name?.trim() || "Користувач";
  const action = row.action?.trim() || "Оновив";
  const title = row.title?.trim() || `${actor} ${action}`.trim();
  const subtitle = row.entity_type ? `Розділ: ${row.entity_type}` : undefined;
  const metadata = row.metadata ?? null;
  const eventDate =
    typeof row.event_date === "string" ? row.event_date : typeof metadata?.event_date === "string" ? metadata.event_date : null;
  const eventTime =
    typeof row.event_time === "string" ? row.event_time : typeof metadata?.event_time === "string" ? metadata.event_time : null;
  return {
    id: row.id,
    title,
    subtitle,
    actor,
    action,
    user_id: row.user_id,
    event_date: eventDate,
    event_time: eventTime,
    href: row.href ?? undefined,
    time: formatActivityTime(row.created_at),
    created_at: row.created_at,
    type: resolveActivityType(row),
  };
}
