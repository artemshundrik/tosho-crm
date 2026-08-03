export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  read_at: string | null;
  type: string | null;
};

export type NotificationTone = "info" | "success" | "warning";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  /** Сирий ISO з created_at — потрібен там, де час групують по днях або форматують інакше. */
  createdAt: string;
  href?: string;
  read: boolean;
  tone?: NotificationTone;
};

export function formatNotificationTime(iso: string) {
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

export function mapNotificationRow(row: NotificationRow): NotificationItem {
  const tone = row.type === "success" || row.type === "warning" || row.type === "info" ? row.type : undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.body ?? "",
    time: formatNotificationTime(row.created_at),
    createdAt: row.created_at,
    href: row.href ?? undefined,
    read: Boolean(row.read_at),
    tone,
  };
}
