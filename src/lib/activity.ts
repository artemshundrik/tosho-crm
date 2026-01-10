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
  href?: string;
  time: string;
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
    href: row.href ?? undefined,
    time: formatActivityTime(row.created_at),
    type: row.entity_type ?? undefined,
  };
}
