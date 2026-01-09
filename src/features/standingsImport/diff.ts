export type StandingRow = {
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
};

export type StandingDiffRow = {
  team_name: string;
  old?: StandingRow | null;
  next?: StandingRow | null;
  changes: {
    position?: [number | null, number | null];
    played?: [number | null, number | null];
    points?: [number | null, number | null];
    wins?: [number | null, number | null];
    draws?: [number | null, number | null];
    losses?: [number | null, number | null];
    goals_for?: [number | null, number | null];
    goals_against?: [number | null, number | null];
  };
  kind: "changed" | "same" | "new" | "removed";
};

const KIND_PRIORITY: Record<StandingDiffRow["kind"], number> = {
  changed: 0,
  new: 1,
  removed: 2,
  same: 3,
};

function buildChangeTuple(oldValue: number | null | undefined, nextValue: number | null | undefined) {
  if (oldValue === undefined && nextValue === undefined) return undefined;
  if ((oldValue ?? null) === (nextValue ?? null)) return undefined;
  return [oldValue ?? null, nextValue ?? null] as [number | null, number | null];
}

export function computeStandingsDiff(
  oldRows: StandingRow[],
  nextRows: StandingRow[],
): { changedCount: number; rows: StandingDiffRow[] } {
  const oldMap = new Map(oldRows.map((row) => [row.team_name, row]));
  const nextMap = new Map(nextRows.map((row) => [row.team_name, row]));

  const allTeams = new Set<string>([...oldMap.keys(), ...nextMap.keys()]);
  const rows: StandingDiffRow[] = [];

  for (const teamName of allTeams) {
    const oldRow = oldMap.get(teamName) ?? null;
    const nextRow = nextMap.get(teamName) ?? null;

    if (!oldRow && nextRow) {
      rows.push({
        team_name: teamName,
        old: null,
        next: nextRow,
        changes: {
          position: [null, nextRow.position],
          played: [null, nextRow.played ?? null],
          points: [null, nextRow.points ?? null],
        },
        kind: "new",
      });
      continue;
    }

    if (oldRow && !nextRow) {
      rows.push({
        team_name: teamName,
        old: oldRow,
        next: null,
        changes: {
          position: [oldRow.position, null],
          played: [oldRow.played ?? null, null],
          points: [oldRow.points ?? null, null],
        },
        kind: "removed",
      });
      continue;
    }

    if (!oldRow || !nextRow) continue;

    const changes = {
      position: buildChangeTuple(oldRow.position, nextRow.position),
      played: buildChangeTuple(oldRow.played, nextRow.played),
      points: buildChangeTuple(oldRow.points, nextRow.points),
      wins: buildChangeTuple(oldRow.wins, nextRow.wins),
      draws: buildChangeTuple(oldRow.draws, nextRow.draws),
      losses: buildChangeTuple(oldRow.losses, nextRow.losses),
      goals_for: buildChangeTuple(oldRow.goals_for, nextRow.goals_for),
      goals_against: buildChangeTuple(oldRow.goals_against, nextRow.goals_against),
    };

    const hasChanges = Boolean(
      changes.position ||
        changes.played ||
        changes.points ||
        changes.wins ||
        changes.draws ||
        changes.losses ||
        changes.goals_for ||
        changes.goals_against
    );

    rows.push({
      team_name: teamName,
      old: oldRow,
      next: nextRow,
      changes,
      kind: hasChanges ? "changed" : "same",
    });
  }

  const sortedRows = rows.sort((a, b) => {
    const kindDelta = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (kindDelta !== 0) return kindDelta;

    const posA = a.next?.position ?? a.old?.position ?? Number.MAX_SAFE_INTEGER;
    const posB = b.next?.position ?? b.old?.position ?? Number.MAX_SAFE_INTEGER;
    if (posA !== posB) return posA - posB;

    return a.team_name.localeCompare(b.team_name, "uk");
  });

  return {
    changedCount: sortedRows.filter((row) => row.kind !== "same").length,
    rows: sortedRows,
  };
}
