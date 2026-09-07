import { looksLikeSku } from "@/lib/productSkuLike";
import { supabase } from "@/lib/supabaseClient";

/**
 * Скільки прорахунків добираємо за артикулом позиції: далі це вже не пошук, а
 * вивантаження. Список ідентифікаторів їде в адресу запиту, а вона не гумова
 * (стеля PostgREST ≈24 кБ, тобто близько 600 UUID).
 */
const QUOTE_SKU_MATCH_LIMIT = 200;

/**
 * Прорахунки, у яких є позиція з таким артикулом (REQ-178#p8).
 *
 * ЩО БУЛО НЕ ТАК. Пошук ходив по номеру, темі, замовнику й ТЗ — тобто по всьому,
 * крім того, що менеджеру дає постачальник. Артикул при цьому НАПИСАНИЙ на
 * картці прорахунку («Артикул: 51K054MHH»), і саме його вставляють у поле
 * пошуку. Відповідь була «Немає прорахунків».
 *
 * ДВА ДЖЕРЕЛА, БО АРТИКУЛ ЛЕЖИТЬ У ДВОХ МІСЦЯХ. У самій позиції він є лише тоді,
 * коли товар прийшов за посиланням чи з ексельки (71 позиція з 323 на
 * 07.09.2026); решта посилається на модель каталогу, і код видно вже через неї.
 * Тому питаємо і `quote_items.metadata->>sku`, і моделі — через генеровану
 * `search_skus`, яка збирає артикул моделі РАЗОМ з артикулами варіантів (той
 * самий стовпчик, що годує пошук товару в полі позиції) і має триграмний індекс.
 *
 * ХОДИМО, ЛИШЕ КОЛИ НАБРАНЕ СХОЖЕ НА КОД. Назви й номери й так знаходяться
 * колонками самих прорахунків, а два зайві запити на кожну літеру — ні до чого.
 *
 * НЕВДАЧА МОВЧАЗНА. Добір за артикулом — ДОДАТОК до пошуку по колонках
 * прорахунку: зірваний запит має лишити пошук таким, яким він був до цієї
 * правки, а не зробити сторінку порожньою.
 */
export async function findQuoteIdsByProductSku(teamId: string, query: string): Promise<string[]> {
  const needle = query.trim();
  if (!teamId || !looksLikeSku(needle)) return [];

  try {
    const pattern = `%${needle}%`;
    const [itemsBySku, models] = await Promise.all([
      supabase
        .schema("tosho")
        .from("quote_items")
        .select("quote_id")
        .eq("team_id", teamId)
        .ilike("metadata->>sku", pattern)
        .limit(QUOTE_SKU_MATCH_LIMIT),
      supabase
        .schema("tosho")
        .from("catalog_models")
        .select("id")
        .eq("team_id", teamId)
        .ilike("search_skus", pattern)
        .limit(QUOTE_SKU_MATCH_LIMIT),
    ]);

    const quoteIds = new Set<string>();
    for (const row of (itemsBySku.data ?? []) as Array<{ quote_id?: string | null }>) {
      if (row.quote_id) quoteIds.add(row.quote_id);
    }

    const modelIds = ((models.data ?? []) as Array<{ id?: string | null }>)
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));
    if (modelIds.length > 0) {
      const { data: itemsByModel } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("quote_id")
        .eq("team_id", teamId)
        .in("catalog_model_id", modelIds)
        .limit(QUOTE_SKU_MATCH_LIMIT);
      for (const row of (itemsByModel ?? []) as Array<{ quote_id?: string | null }>) {
        if (row.quote_id) quoteIds.add(row.quote_id);
      }
    }

    return Array.from(quoteIds).slice(0, QUOTE_SKU_MATCH_LIMIT);
  } catch {
    return [];
  }
}
