import { normalizeSpace } from "./textUtils";

export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type MatchKeyInput = {
  start_at: string | null;
  home_team: string;
  away_team: string;
  league_round_venue: string;
  tab_label: string | null;
};

export function stableKeyForMatch(match: MatchKeyInput): string {
  const parts = [
    match.start_at ?? "",
    match.home_team,
    match.away_team,
    match.league_round_venue,
    match.tab_label ?? "",
  ];

  return normalizeSpace(parts.join("| ")).toLowerCase();
}
