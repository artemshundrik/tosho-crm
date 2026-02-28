const PIECE_UNITS = new Set(["pcs", "pc", "piece", "pieces", "шт", "шт.", "штука", "штуки"]);

export function normalizeUnitLabel(value?: string | null): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "шт.";
  if (PIECE_UNITS.has(raw)) return "шт.";
  if (raw === "m") return "м";
  if (raw === "m2" || raw === "м2") return "м²";
  if (raw === "kg") return "кг";
  if (raw === "l") return "л";
  return (value ?? "").trim() || "шт.";
}
