/**
 * Вид специфікації (REQ-358). Від виду залежить шаблон СП: товари — шаблон № 31,
 * поліграфія — той самий, але опис позиції рядками за частинами виробу й інша
 * назва розділу 1. Дизайн-послуги — окремий документ за зразком СП на послуги:
 * таблиця з одиницями, порядок оплати й передання результатів, без Incoterms.
 */
export type SpecTemplate = "merch" | "print" | "design";

export const SPEC_TEMPLATE_LABELS: Record<SpecTemplate, string> = {
  merch: "Товари",
  print: "Поліграфія",
  design: "Дизайн-послуги",
};

/** Види, які можна обрати у вікні параметрів СП. */
export const PRINTABLE_SPEC_TEMPLATES: SpecTemplate[] = ["merch", "print", "design"];

export const parseSpecTemplate = (value: unknown): SpecTemplate | null =>
  value === "merch" || value === "print" || value === "design" ? value : null;

/** Збережений вид або товари: так друкувалися всі СП до появи видів. */
export const effectiveSpecTemplate = (value: SpecTemplate | null | undefined): SpecTemplate => value ?? "merch";

type SpecItemKind = { isPrint: boolean; isService?: boolean };

/**
 * Підказка виду за позиціями: поліграфія — коли хоч одна позиція має параметри
 * друку з прорахунку. Не категорія каталогу: готовий щоденник постачальника теж
 * лежить у «поліграфії», а це куплений товар. Дизайн-послуги — коли всі позиції
 * мають тип «послуга».
 */
export const suggestSpecTemplate = (items: SpecItemKind[]): SpecTemplate => {
  if (items.length > 0 && items.every((item) => item.isService)) return "design";
  return items.some((item) => item.isPrint) ? "print" : "merch";
};

/** Позиції іншого виду в одній СП: Влад просить різні СП, тож замовлення варто розділити. */
export const hasMixedSpecItems = (items: SpecItemKind[]) => {
  const services = items.filter((item) => item.isService).length;
  if (services > 0 && services < items.length) return true;
  const goods = items.filter((item) => !item.isService);
  return goods.some((item) => item.isPrint) && goods.some((item) => !item.isPrint);
};
