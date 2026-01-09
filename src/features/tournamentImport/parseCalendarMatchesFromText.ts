import { normalizeSpace } from "./textUtils";
import type { MatchItem } from "./types";

const MATCHES_LABEL = "Календар матчів";

function extractBlock(source: string, startLabel: string) {
  const startIndex = source.indexOf(startLabel);
  if (startIndex === -1) {
    return null;
  }

  return source.slice(startIndex).trim();
}

const matchRegex =
  /(\d{1,2})\s*:\s*(\d{1,2})\s+(.+?)\s+(\d{1,2}\s+[^\d]+?\([^)]*\))\s+(\d{1,2}:\d{2})\s+(.+?)\s+(Gold League \(Горай\)\s+\d+\s+тур\s+Горай\s+Арена)\s+(Матч[^\d]+?)(?=\s+\d{1,2}\s*:\s*\d{1,2}|\s+ЗБІРНА|\s+Зима|$)/g;

export function parseCalendarMatchesFromText(fullText: string): MatchItem[] {
  const normalized = normalizeSpace(fullText);
  const block = extractBlock(normalized, MATCHES_LABEL);

  if (!block) {
    return [];
  }

  const content = block.replace(MATCHES_LABEL, "").trim();
  const matches: MatchItem[] = [];

  for (const match of content.matchAll(matchRegex)) {
    const [, , , homeTeam, dateText, time, awayTeam, leagueRoundVenue, status] = match;

    matches.push({
      date_text: dateText.trim(),
      time: time.trim(),
      home_team: homeTeam.trim(),
      away_team: awayTeam.trim(),
      league_round_venue: leagueRoundVenue.trim(),
      status: status?.trim() ?? null,
      start_at: null,
      season_label: null,
      tab_label: null,
      external_match_id: "",
    });
  }

  return matches;
}
