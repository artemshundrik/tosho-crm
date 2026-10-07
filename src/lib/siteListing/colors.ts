import type { ColorSource } from "./types";

/**
 * Назви кольорів для модифікацій (спека, розділ 4; відгук власника 06.10.2026).
 *
 * БЕРЕМО З СУСІДНЬОЇ МОДЕЛІ ТІЄЇ Ж МАРКИ, А НЕ З УСЬОГО КАТАЛОГУ. У палітри
 * Roly на сайті «Королівський синій», «Гранат», «Небесно-блакитний», і «royal
 * blue» має стати саме «Королівським синім», а не загальним «Синім», який
 * дала б більшість по всьому сайту. Тому:
 *   1. сусід — модель тієї ж марки, уже перенесена на сайт, із найбільшим
 *      перетином кольорів постачальника — дає свої назви; решту кольорів —
 *      наступний за перетином;
 *   2. немає сусіда — найчастіша назва цього кольору в межах марки;
 *   3. далі точний колір постачальника, якщо він кирилицею, — з великої;
 *   4. далі «Група Кольорів» постачальника.
 * Дві модифікації з однаковою назвою кольору неприпустимі: Хорошоп склеїть
 * квадратики під «Виберіть колір». Зайнята назва пропускається, і колір іде
 * далі по драбині; якщо драбина скінчилась — назва з уточненням і
 * попередження людині.
 */

export type ColorVariantInput = {
  article: string;
  /** `attrs.color` пулу: «Колір», а коли його немає — «Група Кольорів». */
  color: string | null;
  /** Параметр «Колір» як є. */
  exactColor: string | null;
  /** Параметр «Група Кольорів». */
  group: string | null;
};

export type BrandColorPair = {
  /** Назва моделі постачальника, яка вже є на сайті. */
  model: string;
  /** `attrs.color` її рядка в постачальника. */
  color: string;
  /** Колір того самого артикула на сайті. */
  siteColor: string;
};

export type AssignedColor = { article: string; color: string; source: ColorSource };

const keyOf = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const capitalize = (value: string) =>
  value ? value.charAt(0).toLocaleUpperCase("uk-UA") + value.slice(1) : value;

/** Лише кирилиця (плюс пробіли, апостроф, дефіс і скісна): «темно-синій», «білий/чорний». */
const CYRILLIC_ONLY = /^[\p{Script=Cyrillic}\s'ʼ’\-/]+$/u;

export function assignSiteColors(
  variants: ColorVariantInput[],
  brandPairs: BrandColorPair[]
): { colors: AssignedColor[]; warnings: string[] } {
  const assigned = new Map<string, AssignedColor>();
  const used = new Set<string>();
  const take = (variant: ColorVariantInput, color: string, source: ColorSource) => {
    assigned.set(variant.article, { article: variant.article, color, source });
    used.add(keyOf(color));
  };

  // Назви кожного сусіда: колір постачальника → колір сайту (перша зустріта).
  const byModel = new Map<string, Map<string, string>>();
  // І лічильник по всій марці: колір постачальника → {колір сайту → скільки разів}.
  const byBrand = new Map<string, Map<string, number>>();
  for (const pair of brandPairs) {
    const supplierKey = keyOf(pair.color);
    const siteColor = pair.siteColor.trim();
    if (!supplierKey || !siteColor) continue;
    let names = byModel.get(pair.model);
    if (!names) byModel.set(pair.model, (names = new Map()));
    if (!names.has(supplierKey)) names.set(supplierKey, siteColor);
    let counts = byBrand.get(supplierKey);
    if (!counts) byBrand.set(supplierKey, (counts = new Map()));
    counts.set(siteColor, (counts.get(siteColor) ?? 0) + 1);
  }

  // 1. Сусіди за спаданням перетину; рівні — за назвою, щоб результат не
  //    залежав від порядку рядків у відповіді бази.
  const wanted = new Set(variants.map((variant) => keyOf(variant.color)).filter(Boolean));
  const neighbors = [...byModel.entries()]
    .map(([model, names]) => ({ model, names, overlap: [...wanted].filter((key) => names.has(key)).length }))
    .filter((neighbor) => neighbor.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.model.localeCompare(b.model, "uk"));
  for (const neighbor of neighbors) {
    for (const variant of variants) {
      if (assigned.has(variant.article)) continue;
      const siteColor = neighbor.names.get(keyOf(variant.color));
      if (siteColor && !used.has(keyOf(siteColor))) take(variant, siteColor, "neighbor");
    }
  }

  // 2. Більшість у межах марки.
  for (const variant of variants) {
    if (assigned.has(variant.article)) continue;
    const options = [...(byBrand.get(keyOf(variant.color))?.entries() ?? [])].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "uk")
    );
    const pick = options.find(([name]) => !used.has(keyOf(name)));
    if (pick) take(variant, pick[0], "brand");
  }

  // 3–4. Точний колір кирилицею, далі група.
  for (const variant of variants) {
    if (assigned.has(variant.article)) continue;
    const exact = (variant.exactColor ?? variant.color ?? "").trim();
    if (exact && CYRILLIC_ONLY.test(exact) && !used.has(keyOf(exact))) {
      take(variant, capitalize(exact), "exact");
      continue;
    }
    const group = (variant.group ?? "").trim();
    if (group && !used.has(keyOf(group))) take(variant, capitalize(group), "group");
  }

  // 5. Драбина скінчилась: унікальна назва з уточненням і попередження.
  const warnings: string[] = [];
  for (const variant of variants) {
    if (assigned.has(variant.article)) continue;
    const base = capitalize((variant.group ?? variant.exactColor ?? variant.color ?? "").trim()) || "Колір";
    const raw = (variant.exactColor ?? variant.color ?? "").trim();
    let name = raw && keyOf(raw) !== keyOf(base) ? `${base} (${raw})` : `${base} ${variant.article}`;
    if (used.has(keyOf(name))) name = `${base} ${variant.article}`;
    take(variant, name, "fallback");
    warnings.push(`Колір ${variant.article}: назву «${name}» складено з даних постачальника — звірте в Хорошопі.`);
  }

  return {
    colors: variants.map((variant) => assigned.get(variant.article) as AssignedColor),
    warnings,
  };
}
