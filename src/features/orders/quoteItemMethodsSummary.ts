/**
 * Нанесення позиції одним рядком — для картки замовлення, СП і техкарти.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. `orderRecords.ts` уже впритул до стелі ратчета, а це
 * чиста функція без жодного запиту: її видно цілком і перевіряє звичайний
 * `.test.ts`, тоді як усередині `orderRecords` вона тягла за собою клієнта
 * Supabase і вимагала тестового середовища з `window`.
 *
 * ЗАПИС БЕЗ МЕТОДУ — ЦЕ НЕ НАНЕСЕННЯ (REQ-178#p5). У трьох давніх позиціях
 * (лютий–квітень 2026) лежить порожня пара `{method_id: null}` — слід ранньої
 * форми, де рядок нанесення заводився разом із позицією й лишався
 * незаповненим. Заглушка «Метод нанесення» видавала його за справжній метод,
 * тобто підсумок називав методом те, чого менеджер не вибирав.
 *
 * Гірше за підпис був наслідок: позицію з непорожнім підсумком вважають такою,
 * що має друк (`hasImprintItems`), — і замовлення вимагало б погодження
 * дизайну там, де наносити нічого, а СП і техкарта чекали б на візуал, якого
 * ніхто не малюватиме. Порожній запис тепер випадає зовсім.
 *
 * Метод, якого немає в довіднику, — інша річ: там вибір БУВ, просто рядок
 * довідника прибрали. Такому запису заглушка лишається.
 *
 * Два інші розбори тих самих даних порожню пару вже відкидали
 * (`parseMethodsSummary` у QuotesPage, розбір позицій у QuoteDetailsPage) —
 * цей лишався єдиним, хто вважав її нанесенням.
 */
export const formatQuoteItemMethodsSummary = (methods: unknown, methodNamesById: Map<string, string>) => {
  if (!Array.isArray(methods) || methods.length === 0) return null;
  const labels = methods
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (label) return label;
      const methodId = typeof record.method_id === "string" ? record.method_id.trim() : "";
      if (!methodId) return "";
      const methodName = methodNamesById.get(methodId) ?? "Метод нанесення";
      const width = Number(record.print_width_mm ?? 0) || 0;
      const height = Number(record.print_height_mm ?? 0) || 0;
      const size = width > 0 || height > 0 ? `${width || "?"}x${height || "?"} мм` : "";
      return [methodName, size].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return labels.length > 0 ? labels.join("; ") : null;
};
