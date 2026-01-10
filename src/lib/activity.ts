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
  created_at: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  subtitle?: string;
  actor?: string;
  action?: string;
  href?: string;
  time: string;
  created_at: string;
  type?: string;
};

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
  return {
    id: row.id,
    title,
    subtitle,
    actor,
    action,
    href: row.href ?? undefined,
    time: formatActivityTime(row.created_at),
    created_at: row.created_at,
    type: row.entity_type ?? undefined,
  };
}
