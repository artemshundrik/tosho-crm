/**
 * Пул товарів постачальників — запит до бази (REQ-250#p3).
 * Таблиця: tosho.supplier_products (scripts/catalog-supplier-products.sql).
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ, А НЕ ЩЕ ОДИН ЗАПИТ У СТОРІНЦІ. Пул — це інше джерело,
 * ніж каталог: тисячі рядків, серверний пошук, свої правила показу. Каталог
 * лишається каталогом (250 перевірених моделей), пул — поруч. Змішати їх у
 * одному запиті означало б утопити перевірене прайсом (рішення 04.09, §6а).
 *
 * Типи й чиста логіка показу — у `supplierPoolRows.ts` (чому окремо — там же).
 * Реекспорт нижче лишає споживачам одну адресу: `@/lib/supplierPool`.
 */

import { db } from "@/lib/supabaseClient";
import {
  groupSupplierPoolRows,
  sanitizeSearchTerm,
  transliterateSearchTerm,
  type SupplierPoolProduct,
  type SupplierPoolRow,
} from "@/lib/supplierPoolRows";

export {
  baseProductName,
  formatSupplierPoolPrice,
  groupSupplierPoolRows,
  transliterateSearchTerm,
} from "@/lib/supplierPoolRows";
export type {
  SupplierPoolProduct,
  SupplierPoolRow,
  SupplierPoolVariant,
} from "@/lib/supplierPoolRows";

/**
 * Знайти товари постачальників. Порожній запит повертає порожньо: пул великий,
 * і показувати «все підряд» у вікні прорахунку сенсу немає.
 */
export async function searchSupplierPool(
  rawTerm: string,
  options: { limit?: number } = {}
): Promise<SupplierPoolProduct[]> {
  const term = sanitizeSearchTerm(rawTerm);
  if (term.length < 2) return [];

  const variants = new Set<string>([term.toLowerCase()]);
  const translit = transliterateSearchTerm(term);
  if (translit && translit !== term.toLowerCase()) variants.add(translit);

  const filters: string[] = [];
  for (const value of variants) {
    filters.push(`name.ilike.*${value}*`);
    filters.push(`article.ilike.*${value}*`);
  }

  // Беремо із запасом: після згортання за назвою записів стане помітно менше.
  // Множник 20, а не 12, бо групи бувають товсті — «Футболка SoftStyle 153» у
  // totobi це 55 рядків, тобто один товар з'їдає десяту частину вікна.
  const rowLimit = (options.limit ?? 40) * 20;

  const { data, error } = await db
    .from("supplier_products" as never)
    // `color:attrs->>color`, а не вся `attrs`: там ще лежать розміри (у текстилю
    // це вісім записів на рядок), і на 800 рядках вони дали б сотні кілобайт
    // заради підпису варіанта.
    .select("id,supplier_slug,article,name,vendor,category,price,currency,price_kind,url,image_url,color:attrs->>color")
    .eq("is_active", true)
    .or(filters.join(","))
    // Порядок обов'язковий, і саме за назвою. Без нього PostgREST віддає рядки
    // у фізичному порядку таблиці, тобто в порядку заливу: щойно доданий
    // постачальник опиняється в хвості й ризикує не влізти у вікно взагалі
    // (спіймано на totobi — 3150 товарів, залитих останніми). Назва ще й тримає
    // рядки одного товару поруч, тож вікно ріже по межі товару, а не посеред
    // кольорів. Що з цих рядків показати першим — вирішує вже групування.
    .order("name")
    .limit(rowLimit);

  if (error) throw error;
  return groupSupplierPoolRows((data ?? []) as unknown as SupplierPoolRow[], options.limit ?? 40);
}

