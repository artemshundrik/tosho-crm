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

import { supabase } from "@/lib/supabaseClient";
import {
  groupSupplierPoolRows,
  sanitizeSearchTerm,
  transliterateSearchTerm,
  type SupplierPoolProduct,
  type SupplierPoolRow,
} from "@/lib/supplierPoolRows";

export {
  applySupplierVariant,
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

  // ЧЕСНА ЧАСТКА НА ПОСТАЧАЛЬНИКА, і саме тому це RPC, а не .or().limit().
  // У PostgREST стеля рядків спрацьовує РАНІШЕ за сортування: 800 рядків
  // набиралися за абеткою з усіх джерел упереміш, і найбільший постачальник
  // з'їдав вікно цілком. Заміряно 08.09.2026 на «футболка»: із 2519 збігів у
  // вікно не потрапив жоден рядок Тотобі — 36 карток Аванпринта і нуль
  // Тотобі, при тому що закупівельна ціна є саме в Тотобі. Виглядало це як
  // «у Тотобі немає футболок», хоч дані лежали на місці: їх не спитали.
  //
  // Квота роздається у вікні `partition by supplier_slug` (scripts/
  // supplier-pool-search.sql), тож витіснити одне джерело іншим стало
  // неможливо в принципі. Всередині квоти порядок за назвою — рядки одного
  // товару сусідять, і зріз лягає по межі товару, а не посеред його кольорів.
  //
  // Множник 5, а не 20: раніше 800 рядків ділилися на всіх, тепер стільки ж
  // дістається КОЖНОМУ (4 джерела × 200). Груп це вистачає з запасом —
  // «Футболка SoftStyle 153» у totobi це 55 рядків, найтовща з відомих.
  const perSupplier = (options.limit ?? 40) * 5;

  // Через `supabase.schema("tosho")`, а не через `db`: типи `db` — це ПЕРЕТИН
  // схем, тож він приймає лише ті RPC, які є і в public, і в tosho. Так само
  // кличуть get_audit_log і get_ai_usage_summary.
  const { data, error } = await supabase.schema("tosho").rpc("search_supplier_pool", {
    p_terms: [...variants],
    p_per_supplier: perSupplier,
  });

  if (error) throw error;
  return groupSupplierPoolRows((data ?? []) as unknown as SupplierPoolRow[], options.limit ?? 40);
}

