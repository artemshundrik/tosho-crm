// Shared categorization for CRM activity_log rows, used by the team Пульс tab
// and the per-person activity section. Muted categorical palette (moderate
// saturation, no neon) so the breakdown stays readable in light and dark.

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  design: { label: "Дизайн", color: "hsl(262 45% 58%)" },
  quote: { label: "Прорахунки", color: "hsl(219 80% 56%)" },
  order: { label: "Замовлення", color: "hsl(160 50% 42%)" },
  crm: { label: "Клієнти / ліди", color: "hsl(199 65% 46%)" },
  status: { label: "Статуси", color: "hsl(28 80% 52%)" },
  comment: { label: "Коментарі", color: "hsl(48 75% 50%)" },
  other: { label: "Інше", color: "hsl(0 0% 55%)" },
};

export function categorizeAction(action: string | null, title: string | null): string {
  const a = (action ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (a.includes("design") || t.includes("дизайн") || t.includes("макет")) return "design";
  if (a.includes("quote") || t.includes("прорахун") || t.includes("кошторис")) return "quote";
  if (a.includes("order") || t.includes("замовлен")) return "order";
  if (a.includes("comment") || t.includes("комент")) return "comment";
  if (a.includes("customer") || a.includes("lead") || a.includes("client") || t.includes("клієнт") || t.includes("лід")) return "crm";
  if (a.includes("status") || t.includes("статус")) return "status";
  return "other";
}

export function categoryColor(key: string) {
  return CATEGORY_META[key]?.color ?? CATEGORY_META.other.color;
}

export function categoryLabel(key: string) {
  return CATEGORY_META[key]?.label ?? key;
}
