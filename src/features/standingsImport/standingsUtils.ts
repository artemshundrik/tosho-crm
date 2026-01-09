export type StandingsRowView = {
  team_name: string;
  position: number;
  played: number | null;
  points: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  goals_for?: number | null;
  goals_against?: number | null;
  logo_url?: string | null;
  updated_at?: string | null;
};

export function formatUpdatedAgo(updatedAt: string | null): string {
  if (!updatedAt) return "Оновлено —";
  const updatedMs = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return "Оновлено —";

  const diffMs = Date.now() - updatedMs;
  if (diffMs < 60_000) return "Оновлено щойно";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `Оновлено ${minutes} хв тому`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Оновлено ${hours} год тому`;

  const days = Math.floor(hours / 24);
  return `Оновлено ${days} дн тому`;
}

export function getContextRows(
  rows: StandingsRowView[],
  teamQuery: string,
  radius = 2,
): { rows: StandingsRowView[]; teamRow: StandingsRowView | null } {
  if (!rows.length) return { rows: [], teamRow: null };
  const sorted = rows.slice().sort((a, b) => a.position - b.position);
  const query = teamQuery.trim().toLowerCase();
  const index = query
    ? sorted.findIndex((row) => row.team_name.toLowerCase().includes(query))
    : -1;

  if (index === -1) {
    return { rows: sorted.slice(0, Math.min(5, sorted.length)), teamRow: null };
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(sorted.length, index + radius + 1);
  return { rows: sorted.slice(start, end), teamRow: sorted[index] };
}
