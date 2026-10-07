import { renderDescriptionHtml } from "./description";
import type { SiteListingDraft } from "./types";

/**
 * Рядки файлу імпорту Хорошопа (REQ-311#p9).
 *
 * НАЗВИ КОЛОНОК — РОСІЙСЬКІ ПОЛЯ ШАБЛОНУ «КАТАЛОГ: Товар», а не підписи
 * української адмінки: з українськими назвами Хорошоп упізнав 2 колонки з 11
 * (перша проба, 01.10.2026). Набір і порядок — із файлу другої проби
 * (06.10.2026), який власник затвердив. Єдина українська — «Наявність»:
 * саме так зветься поле в шаблоні.
 *
 * `Название модификации (UA)` = назва товару: порожню Хорошоп заповнює сам як
 * «Назва, Колір», і колір вилазить у заголовок сторінки (відгук 06.10.2026).
 *
 * Рядок на колір, головний колір першим; «Родительский артикул» — артикул
 * головного кольору в усіх рядках моделі, і в його власному теж.
 */
export const IMPORT_COLUMNS = [
  "Артикул",
  "Родительский артикул",
  "Название (UA)",
  "Название модификации (UA)",
  "Раздел",
  "Цена",
  "Наявність",
  "Отображать",
  "Цвет",
  "Описание товара (UA)",
  "Фото",
  "Галерея",
] as const;

export const IMPORT_SHEET_NAME = "Товари";

export type ImportModel = { draft: SiteListingDraft; category: string };

export function buildImportRows(models: ImportModel[]): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [[...IMPORT_COLUMNS]];
  for (const { draft, category } of models) {
    const parent = draft.variants[0]?.article;
    if (!parent) continue;
    const description = renderDescriptionHtml(draft);
    for (const variant of draft.variants) {
      rows.push([
        variant.article,
        parent,
        draft.title,
        draft.title,
        category,
        variant.price,
        "В наявності",
        // Завжди прихованим: вичитка й «показати на сайті» — у Хорошопі.
        "Ні",
        variant.color,
        description,
        variant.images[0] ?? "",
        variant.images.slice(1).join(";"),
      ]);
    }
  }
  return rows;
}
