import { getText } from "./domUtils";
import { normalizeSpace } from "./textUtils";
import type { MatchItem } from "./types";
import { parseCalendarMatchesFromText } from "./parseCalendarMatchesFromText";

const MATCHES_LABEL = "Календар матчів";
const MONTH_PATTERN = /(січ|лют|бер|квіт|трав|чер|лип|серп|вер|жовт|лист|груд)/i;
const TIME_PATTERN = /\b\d{1,2}:\d{2}\b/;

export type ParsedCalendar = {
  tab_labels: string[];
  matches: MatchItem[];
  raw_matches: number;
};

function findElementWithText(doc: Document, needle: string) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  const lowerNeedle = needle.toLowerCase();
  while (node) {
    const element = node as Element;
    const text = element.textContent?.toLowerCase();
    if (text && text.includes(lowerNeedle)) {
      return element;
    }
    node = walker.nextNode();
  }
  return null;
}

function hasMonthAndDay(text: string) {
  return MONTH_PATTERN.test(text) && /\b\d{1,2}\b/.test(text);
}

function findCalendarRoot(doc: Document) {
  const titleElement = findElementWithText(doc, MATCHES_LABEL);
  let current = titleElement?.parentElement ?? null;
  let depth = 0;
  while (current && depth < 8) {
    const text = normalizeSpace(current.textContent ?? "");
    if (TIME_PATTERN.test(text) && hasMonthAndDay(text)) {
      return current;
    }
    if (current.querySelector(".card-of-matches")) {
      return current;
    }
    current = current.parentElement;
    depth += 1;
  }
  return doc.body;
}

function collectTabLabels(calendarRoot: Element) {
  const labels: string[] = [];
  const seen = new Set<string>();
  const elements = Array.from(calendarRoot.querySelectorAll("a, button, div, li, span, p"));

  for (const el of elements) {
    const text = getText(el);
    if (!text || text.length > 25) continue;
    if (!hasMonthAndDay(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    labels.push(text);
  }

  return labels;
}

function extractTeamCandidates(container: Element) {
  const fragments = Array.from(container.querySelectorAll("p, span, div"))
    .map((el) => getText(el))
    .filter(Boolean);
  const filtered = fragments.filter((text) => {
    if (text.length < 2) return false;
    if (text.includes("League") || text.includes("тур") || text.includes("Арена")) return false;
    if (text.includes("Матч")) return false;
    if (TIME_PATTERN.test(text)) return false;
    return /[A-Za-zА-Яа-яІіЇїЄє«»()]/.test(text);
  });
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const text of filtered) {
    if (seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
  }
  return unique;
}

function findNearestTabLabel(element: Element, allElements: Element[], tabEntries: Array<{ index: number; label: string }>) {
  const index = allElements.indexOf(element);
  if (index === -1) return null;
  let currentLabel: string | null = null;
  for (const entry of tabEntries) {
    if (entry.index <= index) {
      currentLabel = entry.label;
    } else {
      break;
    }
  }
  return currentLabel;
}

function buildMatchFromCard(card: Element, tabLabel: string | null): MatchItem | null {
  const home = getText(card.querySelector(".card-of-matches__team--left")) || "";
  const away = getText(card.querySelector(".card-of-matches__team--right")) || "";
  const dateText = getText(card.querySelector(".card-of-matches__date"));
  const time = getText(card.querySelector(".card-of-matches__time"));
  const status = getText(card.querySelector(".card-of-matches__status")) || null;
  const marks = Array.from(card.querySelectorAll(".card-of-matches__mark span"))
    .map((el) => getText(el))
    .filter(Boolean);
  const leagueRoundVenue = marks.length > 0 ? marks.join(" ") : getText(card.querySelector(".card-of-matches__marks"));

  if (!home || !away || !time) return null;

  return {
    date_text: dateText,
    time,
    home_team: home,
    away_team: away,
    league_round_venue: leagueRoundVenue,
    status,
    start_at: null,
    season_label: null,
    tab_label: tabLabel,
    external_match_id: "",
  };
}

function buildMatchFromContainer(container: Element, tabLabel: string | null): MatchItem | null {
  const text = normalizeSpace(container.textContent ?? "");
  const timeMatch = text.match(TIME_PATTERN);
  if (!timeMatch) return null;

  const dateMatch = text.match(/\b\d{1,2}\s+[^\d\s]{3,}\b/);
  const dateText = dateMatch ? dateMatch[0] : "";

  const leagueLine =
    text
      .split(" ")
      .filter((part) => part.includes("League") || part.includes("тур") || part.includes("Арена"))
      .join(" ") || "";

  const teams = extractTeamCandidates(container);
  if (teams.length < 2) return null;

  return {
    date_text: dateText,
    time: timeMatch[0],
    home_team: teams[0],
    away_team: teams[1],
    league_round_venue: leagueLine,
    status: text.includes("Матч") ? "Матч завершено" : null,
    start_at: null,
    season_label: null,
    tab_label: tabLabel,
    external_match_id: "",
  };
}

function dedupeMatches(matches: MatchItem[]) {
  const seen = new Set<string>();
  const result: MatchItem[] = [];
  for (const match of matches) {
    const key = `${match.date_text}|${match.time}|${match.home_team}|${match.away_team}|${match.league_round_venue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

export function parseCalendarMatchesFromDOM(doc: Document): ParsedCalendar {
  const calendarRoot = findCalendarRoot(doc);
  const tabLabels = collectTabLabels(calendarRoot);
  const allElements = Array.from(calendarRoot.querySelectorAll("*"));
  const tabEntries = tabLabels
    .map((label) => {
      const el = allElements.find((node) => getText(node) === label);
      return el ? { index: allElements.indexOf(el), label } : null;
    })
    .filter((entry): entry is { index: number; label: string } => Boolean(entry));

  const cards = Array.from(calendarRoot.querySelectorAll(".card-of-matches"));
  const cardMatches = cards
    .map((card) => {
      const label = findNearestTabLabel(card, allElements, tabEntries);
      return buildMatchFromCard(card, label);
    })
    .filter((match): match is MatchItem => Boolean(match));

  const dedupedCardMatches = dedupeMatches(cardMatches);

  if (dedupedCardMatches.length > 0) {
    return {
      tab_labels: tabLabels,
      matches: dedupedCardMatches,
      raw_matches: cardMatches.length,
    };
  }

  const candidateElements = Array.from(calendarRoot.querySelectorAll("div, li, article, section"))
    .filter((el) => TIME_PATTERN.test(el.textContent ?? ""));

  const candidateMatches: MatchItem[] = [];
  for (const candidate of candidateElements) {
    const label = findNearestTabLabel(candidate, allElements, tabEntries);
    const match = buildMatchFromContainer(candidate, label);
    if (match) candidateMatches.push(match);
  }

  const dedupedCandidates = dedupeMatches(candidateMatches);
  if (dedupedCandidates.length > 0) {
    return {
      tab_labels: tabLabels,
      matches: dedupedCandidates,
      raw_matches: candidateMatches.length,
    };
  }

  const fallbackText = normalizeSpace(calendarRoot.textContent ?? "");
  const source = fallbackText.includes(MATCHES_LABEL)
    ? fallbackText
    : `${MATCHES_LABEL} ${fallbackText}`;

  const fallbackMatches = parseCalendarMatchesFromText(source);

  return {
    tab_labels: tabLabels,
    matches: fallbackMatches,
    raw_matches: fallbackMatches.length,
  };
}
