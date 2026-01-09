import { parseHtmlToDocument } from "@/features/tournamentImport/domUtils";
import { parseStandingsFromDOM } from "@/features/tournamentImport/parseStandingsFromDOM";
import { normalizeSpace } from "@/features/tournamentImport/textUtils";

import type { StandingRow } from "./diff";

type ParsedStandings = {
  title: string | null;
  rows: StandingRow[];
};

function normalizeTeamName(value: string) {
  const normalized = normalizeSpace(value);
  return normalized
    .replace(/\s+»/g, "»")
    .replace(/«\s+/g, "«")
    .replace(/[“”]/g, "\"")
    .trim();
}

export function parseStandingsFromHtmlDom(html: string): ParsedStandings {
  const doc = parseHtmlToDocument(html);
  const parsed = parseStandingsFromDOM(doc);

  return {
    title: parsed.title,
    rows: parsed.rows.map((row) => ({
      team_name: normalizeTeamName(row.team),
      position: row.position,
      played: row.played ?? null,
      points: row.points ?? null,
      wins: row.wins ?? null,
      draws: row.draws ?? null,
      losses: row.losses ?? null,
      goals_for: row.goals_for ?? null,
      goals_against: row.goals_against ?? null,
      logo_url: row.logo_url ?? null,
    })),
  };
}
