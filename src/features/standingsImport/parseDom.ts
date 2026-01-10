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

function parseStandingsSfck(doc: Document, teamQuery?: string): ParsedStandings {
  const tables = Array.from(doc.querySelectorAll(".custom-table.custom-table-table"));
  const rows: StandingRow[] = [];
  const normalizedQuery = teamQuery?.trim().toLowerCase();

  for (const table of tables) {
    const lines = Array.from(table.querySelectorAll(".custom-table__line"));
    const tableRows: StandingRow[] = [];
    let hasTeamMatch = false;

    for (const line of lines) {
      const positionText = normalizeSpace(
        line.querySelector(".custom-table__number-wrapper")?.textContent ?? "",
      );
      const position = parseNumber(positionText);
      if (position === null) continue;

      const teamName = normalizeTeamName(
        line.querySelector(".custom-table__team-name")?.textContent ?? "",
      );
      if (!teamName) continue;

      const logo = line.querySelector(".custom-table__team-img")?.getAttribute("src") ?? null;
      const gamesText = normalizeSpace(
        line.querySelector(".custom-table__var--games .custom-table__content")?.textContent ?? "",
      );
      const played = parseNumber(gamesText);

      const drawsText = normalizeSpace(
        line.querySelector(".custom-table__cell--draws .custom-table__content")?.textContent ?? "",
      );
      const draws = parseNumber(drawsText);

      const goalsText = normalizeSpace(
        line.querySelector(".custom-table__var--diff .custom-table__content")?.textContent ?? "",
      );
      const goals = parseGoals(goalsText);

      const pointsText = normalizeSpace(
        line.querySelector(".custom-table__score .custom-table__content")?.textContent ?? "",
      );
      const points = parseNumber(pointsText);

      const varCells = Array.from(line.querySelectorAll(".custom-table__var")).filter(
        (cell) =>
          !cell.classList.contains("custom-table__var--games") &&
          !cell.classList.contains("custom-table__cell--draws") &&
          !cell.classList.contains("custom-table__var--diff") &&
          !cell.classList.contains("custom-table__score"),
      );
      const wins = parseNumber(
        normalizeSpace(varCells[0]?.querySelector(".custom-table__content")?.textContent ?? ""),
      );
      const losses = parseNumber(
        normalizeSpace(varCells[1]?.querySelector(".custom-table__content")?.textContent ?? ""),
      );

      const row: StandingRow = {
        team_name: teamName,
        position,
        played,
        points,
        wins,
        draws,
        losses,
        goals_for: goals.goals_for,
        goals_against: goals.goals_against,
        logo_url: logo,
      };

      if (normalizedQuery && teamName.toLowerCase().includes(normalizedQuery)) {
        hasTeamMatch = true;
      }

      tableRows.push(row);
    }

    if (normalizedQuery && hasTeamMatch && tableRows.length > 0) {
      return { title: null, rows: tableRows };
    }

    rows.push(...tableRows);
  }

  return { title: null, rows };
}

export function parseStandingsFromHtmlDom(
  html: string,
  sourceUrl?: string,
  teamQuery?: string,
): ParsedStandings {
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

  if (host === "sfck.com.ua" || host === "r-cup.com.ua") {
    const sfckParsed = parseStandingsSfck(doc, teamQuery);
    if (sfckParsed.rows.length > 0) return sfckParsed;
  }

  return parseStandingsGeneric(doc);
}
