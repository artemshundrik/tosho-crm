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

function headerMapFromRow(row: HTMLTableRowElement) {
  const headers = Array.from(row.querySelectorAll("th, td")).map((cell) =>
    normalizeSpace(cell.textContent ?? ""),
  );
  const map = new Map<string, number>();
  headers.forEach((label, index) => {
    if (label) map.set(label.toLowerCase(), index);
  });
  return map;
}

function findBestTable(doc: Document) {
  const tables = Array.from(doc.querySelectorAll("table"));
  let best: HTMLTableElement | null = null;
  let bestScore = -1;
  for (const table of tables) {
    const headerRow = table.querySelector("tr");
    if (!headerRow) continue;
    const headerText = normalizeSpace(headerRow.textContent ?? "").toLowerCase();
    let score = 0;
    if (headerText.includes("команда") || headerText.includes("team")) score += 3;
    if (headerText.includes("і") || headerText.includes("ігор") || headerText.includes("games")) score += 2;
    if (headerText.includes("о") || headerText.includes("points")) score += 2;
    if (table.querySelectorAll("tr").length >= 4) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = table as HTMLTableElement;
    }
  }
  return best;
}

function parseGoals(text: string) {
  const match = text.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return { goals_for: null, goals_against: null };
  return { goals_for: Number(match[1]), goals_against: Number(match[2]) };
}

function parseNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function parseStandingsGeneric(doc: Document): ParsedStandings {
  const table = findBestTable(doc);
  if (!table) return { title: null, rows: [] };

  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return { title: null, rows: [] };

  const headerMap = headerMapFromRow(rows[0]);
  const dataRows = rows.slice(1);
  const result: StandingRow[] = [];

  for (const row of dataRows) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length === 0) continue;

    const cellTexts = cells.map((cell) => normalizeSpace(cell.textContent ?? ""));
    const teamIndex = headerMap.has("команда")
      ? headerMap.get("команда")
      : headerMap.has("team")
      ? headerMap.get("team")
      : 1;

    const teamCell = cells[teamIndex ?? 1] ?? cells[1] ?? cells[0];
    const teamName = normalizeTeamName(teamCell.textContent ?? "");
    if (!teamName) continue;

    const logoImg = row.querySelector("img");
    const position = parseNumber(cellTexts[0] ?? "");
    const played = headerMap.has("і")
      ? parseNumber(cellTexts[headerMap.get("і") ?? -1] ?? "")
      : headerMap.has("games")
      ? parseNumber(cellTexts[headerMap.get("games") ?? -1] ?? "")
      : null;

    const wins = headerMap.has("в")
      ? parseNumber(cellTexts[headerMap.get("в") ?? -1] ?? "")
      : null;
    const draws = headerMap.has("н")
      ? parseNumber(cellTexts[headerMap.get("н") ?? -1] ?? "")
      : null;
    const losses = headerMap.has("п")
      ? parseNumber(cellTexts[headerMap.get("п") ?? -1] ?? "")
      : null;

    const goalsText = headerMap.has("г")
      ? cellTexts[headerMap.get("г") ?? -1] ?? ""
      : "";
    const goals = parseGoals(goalsText);

    const points = headerMap.has("о")
      ? parseNumber(cellTexts[headerMap.get("о") ?? -1] ?? "")
      : headerMap.has("points")
      ? parseNumber(cellTexts[headerMap.get("points") ?? -1] ?? "")
      : parseNumber(cellTexts[cellTexts.length - 1] ?? "");

    if (position === null) continue;

    result.push({
      team_name: teamName,
      position,
      played,
      points,
      wins,
      draws,
      losses,
      goals_for: goals.goals_for,
      goals_against: goals.goals_against,
      logo_url: logoImg?.getAttribute("src") ?? null,
    });
  }

  return { title: null, rows: result };
}

export function parseStandingsFromHtmlDom(html: string, sourceUrl?: string): ParsedStandings {
  const doc = parseHtmlToDocument(html);
  const host = sourceUrl ? new URL(sourceUrl).hostname : "";
  if (host === "v9ky.in.ua") {
    const parsed = parseStandingsFromDOM(doc);
    return {
      title: parsed.title,
      rows: parsed.rows.map((row) => ({
        team_name: normalizeTeamName(row.team ?? ""),
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

  return parseStandingsGeneric(doc);
}
