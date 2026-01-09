import { getText } from "./domUtils";
import { normalizeSpace } from "./textUtils";
import type { MatchItem } from "./types";
import { parseCalendarMatchesFromText } from "./parseCalendarMatchesFromText";

const MATCHES_LABEL = "Календар матчів";

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

function buildMatchFromCard(card: Element): MatchItem | null {
  const home = getText(card.querySelector(".card-of-matches__team--left"));
  const away = getText(card.querySelector(".card-of-matches__team--right"));
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
  };
}

export function parseCalendarMatchesFromDOM(doc: Document): MatchItem[] {
  const titleElement = findElementWithText(doc, MATCHES_LABEL);
  const container = titleElement?.closest("section") ?? titleElement?.parentElement ?? doc.body;

  const cards = Array.from(container.querySelectorAll(".card-of-matches"));
  const matches = cards
    .map((card) => buildMatchFromCard(card))
    .filter((match): match is MatchItem => Boolean(match));

  if (matches.length > 0) {
    return matches;
  }

  const fallbackText = normalizeSpace(container.textContent ?? "");
  const source = fallbackText.includes(MATCHES_LABEL)
    ? fallbackText
    : `${MATCHES_LABEL} ${fallbackText}`;

  return parseCalendarMatchesFromText(source);
}
