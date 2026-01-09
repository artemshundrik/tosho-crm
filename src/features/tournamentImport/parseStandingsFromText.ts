import { normalizeSpace } from "./textUtils";
import type { ParsedStandings, StandingRow } from "./types";

const STANDINGS_LABEL = "Турнірна таблиця";
const MATCHES_LABEL = "Календар матчів";

function extractBlock(source: string, startLabel: string, endLabel?: string) {
  const startIndex = source.indexOf(startLabel);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = endLabel ? source.indexOf(endLabel, startIndex + startLabel.length) : -1;
  const sliceEnd = endIndex === -1 ? source.length : endIndex;

  return source.slice(startIndex, sliceEnd).trim();
}

function isRowStartToken(token: string, nextToken: string | undefined) {
  if (!/^\d+$/.test(token)) return false;
  if (!nextToken) return false;
  if (/^\d+$/.test(nextToken)) return false;
  if (nextToken === "-" || nextToken.includes(":")) return false;
  return /[A-Za-zА-Яа-яІіЇїЄє«]/.test(nextToken);
}

function parseRowTokens(tokens: string[], startIndex: number, endIndex: number): StandingRow | null {
  const positionToken = tokens[startIndex];
  const position = Number(positionToken);
  if (!Number.isFinite(position)) return null;

  const nameTokens: string[] = [];
  let cursor = startIndex + 1;

  while (cursor < endIndex) {
    const token = tokens[cursor];
    if (token === "-" || /^\d+$/.test(token) || token.includes(":")) {
      break;
    }
    nameTokens.push(token);
    cursor += 1;
  }

  const team = nameTokens.join(" ").trim();
  if (!team) return null;

  const numericTokens: number[] = [];
  for (let i = cursor; i < endIndex; i += 1) {
    const token = tokens[i];
    if (/^\d+$/.test(token)) {
      numericTokens.push(Number(token));
    }
  }

  const played = numericTokens.length > 0 ? numericTokens[0] : null;
  const points = numericTokens.length > 0 ? numericTokens[numericTokens.length - 1] : null;

  return {
    position,
    team,
    played,
    points,
    wins: null,
    draws: null,
    losses: null,
    goals_for: null,
    goals_against: null,
    logo_url: null,
  };
}

export function parseStandingsFromText(fullText: string): ParsedStandings {
  const normalized = normalizeSpace(fullText);
  const block = extractBlock(normalized, STANDINGS_LABEL, MATCHES_LABEL);

  if (!block) {
    return { title: null, rows: [] };
  }

  const content = block.replace(STANDINGS_LABEL, "").trim();
  const tokens = content.split(" ");

  const rowStarts: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (isRowStartToken(tokens[i], tokens[i + 1])) {
      rowStarts.push(i);
    }
  }

  const rows: StandingRow[] = [];
  for (let i = 0; i < rowStarts.length; i += 1) {
    const start = rowStarts[i];
    const end = i + 1 < rowStarts.length ? rowStarts[i + 1] : tokens.length;
    const row = parseRowTokens(tokens, start, end);
    if (row) rows.push(row);
  }

  return {
    title: STANDINGS_LABEL,
    rows,
  };
}
