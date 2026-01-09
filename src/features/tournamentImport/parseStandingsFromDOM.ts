import { getText } from "./domUtils";
import { normalizeSpace } from "./textUtils";
import type { ParsedStandings, StandingRow } from "./types";

const STANDINGS_LABEL = "Турнірна таблиця";

function findElementWithText(doc: Document, needle: string) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    const element = node as Element;
    const text = element.textContent;
    if (text && text.includes(needle)) {
      return element;
    }
    node = walker.nextNode();
  }
  return null;
}

function findNextTable(doc: Document, anchor: Element | null) {
  const tables = Array.from(doc.querySelectorAll("table"));
  if (!anchor) return null;
  for (const table of tables) {
    const position = anchor.compareDocumentPosition(table);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return table;
    }
  }
  return null;
}

function scoreTable(table: HTMLTableElement) {
  let score = 0;
  const headerText = normalizeSpace(table.querySelector("th")?.textContent ?? "");
  if (headerText.includes("Команда")) score += 3;
  if (table.querySelector(".cell--team")) score += 3;
  if (table.querySelector(".cell--games")) score += 2;
  if (table.querySelector(".cell--total")) score += 2;
  if (table.querySelectorAll("tr").length >= 5) score += 1;
  return score;
}

function selectFallbackTable(doc: Document) {
  const tables = Array.from(doc.querySelectorAll("table"));
  let best: HTMLTableElement | null = null;
  let bestScore = -1;
  for (const table of tables) {
    const score = scoreTable(table as HTMLTableElement);
    if (score > bestScore) {
      bestScore = score;
      best = table as HTMLTableElement;
    }
  }
  return best;
}

function headerIndexMap(table: HTMLTableElement) {
  const headerRow = Array.from(table.querySelectorAll("tr")).find(
    (row) => row.querySelectorAll("th").length > 0,
  );
  if (!headerRow) return new Map<string, number>();
  const headers = Array.from(headerRow.querySelectorAll("th")).map((cell) => getText(cell));
  const map = new Map<string, number>();
  headers.forEach((label, index) => {
    if (label) map.set(label, index);
  });
  return map;
}

function parseNumber(text: string) {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function parseGoals(text: string) {
  const match = text.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return { goals_for: null, goals_against: null };
  return { goals_for: Number(match[1]), goals_against: Number(match[2]) };
}

function isHeaderLike(text: string) {
  if (!text) return true;
  const normalized = normalizeSpace(text);
  if (normalized.includes("І В Н П")) return true;
  if (normalized.includes("Команда") && normalized.includes("І")) return true;
  return false;
}

export function parseStandingsFromDOM(doc: Document): ParsedStandings {
  const titleElement = findElementWithText(doc, STANDINGS_LABEL);
  const titleText = titleElement ? getText(titleElement) : STANDINGS_LABEL;
  const title = titleText.includes(STANDINGS_LABEL) ? titleText : STANDINGS_LABEL;

  const nextTable = findNextTable(doc, titleElement);
  const table = (nextTable as HTMLTableElement | null) ?? selectFallbackTable(doc);

  if (!table) {
    return { title, rows: [] };
  }

  const headerMap = headerIndexMap(table);
  const rows: StandingRow[] = [];

  const bodyRows = table.tBodies.length > 0 ? Array.from(table.tBodies[0].rows) : Array.from(table.rows);

  for (const row of bodyRows) {
    if (row.querySelectorAll("th").length > 0) continue;

    const teamCell = row.querySelector(".cell--team");
    const logoCell = row.querySelector(".cell--team-logo") as HTMLImageElement | null;
    const rowText = normalizeSpace(row.textContent ?? "");
    if (isHeaderLike(rowText)) continue;

    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length === 0) continue;

    const teamText = teamCell
      ? getText(teamCell)
      : cells
          .map((cell) => getText(cell))
          .find((text) => /[A-Za-zА-Яа-яІіЇїЄє«]/.test(text) && !/^\d+$/.test(text)) || "";

    if (!teamText || teamText === "Команда") continue;

    const positionCellText = cells.map((cell) => getText(cell)).find((text) => /^\d+$/.test(text));
    const position = positionCellText ? Number(positionCellText) : NaN;

    const playedCell = row.querySelector(".cell--games");
    const winCell = row.querySelector(".cell--win");
    const drawCell = row.querySelector(".cell--draw");
    const lossCell = row.querySelector(".cell--defeat");
    const goalsCell = row.querySelector(".cell--scored");
    const pointsCell = row.querySelector(".cell--total");

    const numericCells = cells
      .map((cell) => parseNumber(getText(cell)))
      .filter((value): value is number => value !== null);

    const played = playedCell
      ? parseNumber(getText(playedCell))
      : headerMap.has("І") && cells[headerMap.get("І") ?? -1]
        ? parseNumber(getText(cells[headerMap.get("І") ?? -1]))
        : numericCells.length > 1
          ? numericCells[1]
          : null;

    const wins = winCell
      ? parseNumber(getText(winCell))
      : headerMap.has("В") && cells[headerMap.get("В") ?? -1]
        ? parseNumber(getText(cells[headerMap.get("В") ?? -1]))
        : null;

    const draws = drawCell
      ? parseNumber(getText(drawCell))
      : headerMap.has("Н") && cells[headerMap.get("Н") ?? -1]
        ? parseNumber(getText(cells[headerMap.get("Н") ?? -1]))
        : null;

    const losses = lossCell
      ? parseNumber(getText(lossCell))
      : headerMap.has("П") && cells[headerMap.get("П") ?? -1]
        ? parseNumber(getText(cells[headerMap.get("П") ?? -1]))
        : null;

    const goalsText = goalsCell
      ? getText(goalsCell)
      : headerMap.has("Г") && cells[headerMap.get("Г") ?? -1]
        ? getText(cells[headerMap.get("Г") ?? -1])
        : "";
    const goalsParsed = parseGoals(goalsText);

    const points = pointsCell
      ? parseNumber(getText(pointsCell))
      : headerMap.has("О") && cells[headerMap.get("О") ?? -1]
        ? parseNumber(getText(cells[headerMap.get("О") ?? -1]))
        : numericCells.length > 0
          ? numericCells[numericCells.length - 1]
          : null;

    if (!Number.isFinite(position)) continue;

    rows.push({
      position,
      team: teamText,
      played,
      points,
      wins,
      draws,
      losses,
      goals_for: goalsParsed.goals_for,
      goals_against: goalsParsed.goals_against,
      logo_url: logoCell?.getAttribute("src") ?? null,
    });
  }

  return { title, rows };
}
