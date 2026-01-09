import { inferSeasonLabelFromDoc } from "./dateUtils";
import { normalizeSpace } from "./textUtils";

export type V9kyTab = { label: string; first_day: string | null; last_day: string | null };

const MONTH_PATTERN = /(січ|лют|бер|квіт|трав|чер|лип|серп|вер|жовт|лист|груд)/i;

export function inferBaseTournamentUrl(inputUrl: string): string {
  const url = new URL(inputUrl);
  url.searchParams.delete("first_day");
  url.searchParams.delete("last_day");
  const search = url.searchParams.toString();
  url.search = search ? `?${search}` : "";
  return url.toString();
}

function hasMonthAndDay(text: string) {
  return MONTH_PATTERN.test(text) && /\b\d{1,2}\b/.test(text);
}

function extractRawLabels(doc: Document): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const elements = Array.from(doc.querySelectorAll("a, button, div, li, span, p"));

  for (const el of elements) {
    const text = normalizeSpace(el.textContent ?? "");
    if (!text || text.length > 25) continue;
    if (!hasMonthAndDay(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    labels.push(text);
  }

  return labels;
}

function resolveYearForMonth(seasonLabel: string | null, month: number): number | null {
  if (seasonLabel) {
    const match = seasonLabel.match(/(\d{4})\s*\/\s*(\d{2})/);
    if (match) {
      const startYear = Number(match[1]);
      const endYear = Number(`20${match[2]}`);
      if (month >= 7 && month <= 12) return startYear;
      if (month >= 1 && month <= 6) return endYear;
    }
  }
  return null;
}

function monthUkrToNumber(monthWord: string): number | null {
  const normalized = monthWord.trim().toLowerCase();
  const map: Array<{ key: string; value: number }> = [
    { key: "січ", value: 1 },
    { key: "січень", value: 1 },
    { key: "лют", value: 2 },
    { key: "лютий", value: 2 },
    { key: "бер", value: 3 },
    { key: "берез", value: 3 },
    { key: "квіт", value: 4 },
    { key: "трав", value: 5 },
    { key: "чер", value: 6 },
    { key: "лип", value: 7 },
    { key: "серп", value: 8 },
    { key: "вер", value: 9 },
    { key: "жовт", value: 10 },
    { key: "лист", value: 11 },
    { key: "груд", value: 12 },
  ];

  for (const entry of map) {
    if (normalized.startsWith(entry.key)) {
      return entry.value;
    }
  }

  return null;
}

function toIsoDate(year: number, month: number, day: number) {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDayRange(label: string) {
  const rangeMatch = label.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (rangeMatch) {
    return { start: Number(rangeMatch[1]), end: Number(rangeMatch[2]) };
  }
  const singleMatch = label.match(/\b(\d{1,2})\b/);
  if (singleMatch) {
    const value = Number(singleMatch[1]);
    return { start: value, end: value };
  }
  return null;
}

function parseMonthSpan(label: string): { start: string; end?: string } | null {
  const normalized = normalizeSpace(label);
  const parts = normalized.split(" ");
  const monthPart = parts[0];
  if (!monthPart) return null;

  if (monthPart.includes("-")) {
    const [startMonthWord, endMonthWord] = monthPart.split("-").map((part) => part.trim());
    if (!startMonthWord || !endMonthWord) return null;
    return { start: startMonthWord, end: endMonthWord };
  }

  return { start: monthPart };
}

export function extractTabsFromDoc(doc: Document): { tabs: V9kyTab[]; raw_labels: string[] } {
  const raw_labels = extractRawLabels(doc);
  const seasonLabel = inferSeasonLabelFromDoc(doc, undefined);
  const tabs: V9kyTab[] = raw_labels.map((label) => {
    const monthSpan = parseMonthSpan(label);
    const dayRange = parseDayRange(label);
    if (!monthSpan || !dayRange) {
      return { label, first_day: null, last_day: null };
    }

    const startMonth = monthUkrToNumber(monthSpan.start);
    const endMonth = monthSpan.end ? monthUkrToNumber(monthSpan.end) : null;
    if (!startMonth) {
      return { label, first_day: null, last_day: null };
    }

    const startYear = resolveYearForMonth(seasonLabel, startMonth);
    if (!startYear) {
      return { label, first_day: null, last_day: null };
    }

    const firstDay = toIsoDate(startYear, startMonth, dayRange.start);

    if (!monthSpan.end) {
      const lastDay = dayRange.end !== dayRange.start ? toIsoDate(startYear, startMonth, dayRange.end) : "0";
      return { label, first_day: firstDay, last_day: lastDay };
    }

    if (!endMonth) {
      return { label, first_day: null, last_day: null };
    }

    const endYear = resolveYearForMonth(seasonLabel, endMonth) ?? startYear;
    const lastDay = toIsoDate(endYear, endMonth, dayRange.end);
    return { label, first_day: firstDay, last_day: lastDay };
  });

  return { tabs, raw_labels };
}

export function buildV9kyTabUrl(baseUrl: string, tab: V9kyTab): string {
  const url = new URL(baseUrl);
  if (!tab.first_day) {
    return url.toString();
  }
  url.searchParams.set("first_day", tab.first_day);
  url.searchParams.set("last_day", tab.last_day ?? "0");
  return url.toString();
}
