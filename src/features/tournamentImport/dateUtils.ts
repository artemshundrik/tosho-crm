import { normalizeSpace } from "./textUtils";

export function inferSeasonLabelFromDoc(doc: Document, fallbackUrl?: string): string | null {
  if (fallbackUrl && fallbackUrl.includes("2025-26")) {
    return "2025/26";
  }

  const text = normalizeSpace(doc.body.textContent ?? "");
  const match = text.match(/\b(20\d{2}\s*\/\s*\d{2})\b/);
  if (match) {
    return match[1].replace(/\s+/g, "");
  }

  return null;
}

export function monthUkrToNumber(monthWord: string): number | null {
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

export function resolveYearForMonth(seasonLabel: string | null, month: number): number | null {
  if (seasonLabel) {
    const match = seasonLabel.match(/(\d{4})\s*\/\s*(\d{2})/);
    if (match) {
      const startYear = Number(match[1]);
      const endYear = Number(`20${match[2]}`);
      if (month >= 7 && month <= 12) return startYear;
      if (month >= 1 && month <= 6) return endYear;
    }
  }

  return new Date().getFullYear();
}

export function parseDateTextToISO(date_text: string, time: string, seasonLabel: string | null): string | null {
  const normalized = normalizeSpace(date_text);
  const dayMatch = normalized.match(/\b(\d{1,2})\b/);
  if (!dayMatch) return null;
  const day = Number(dayMatch[1]);
  if (!Number.isFinite(day)) return null;

  const monthMatch = normalized
    .replace(dayMatch[1], "")
    .trim()
    .split(" ")
    .find(Boolean);

  if (!monthMatch) return null;

  const month = monthUkrToNumber(monthMatch);
  if (!month) return null;

  const year = resolveYearForMonth(seasonLabel, month);
  if (!year) return null;

  const [hour, minute] = time.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+02:00`;
}
