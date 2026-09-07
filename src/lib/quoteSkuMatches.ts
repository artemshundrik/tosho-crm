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
 * ТРИ ДЖЕРЕЛА, БО АРТИКУЛ ЛЕЖИТЬ У ТРЬОХ МІСЦЯХ. У самій позиції він є лише
 * тоді, коли товар прийшов за посиланням чи з ексельки (71 позиція з 323 на
 * 07.09.2026); решта посилається на модель каталогу. А в моделі артикулів теж
 * два різні: свій власний і артикули КОЛЬОРІВ — постачальник дає саме код
 * кольору. Ці два не зводяться один до одного: на проді 71 модель має власний
 * артикул, і у 15 із них немає жодного варіанта, тобто пошук лише по
 * `catalog_variants` їх би не знайшов.
 *
 * ЧОМУ НЕ ГЕНЕРОВАНА КОЛОНКА, ЯК БУЛО. `catalog_models.search_skus` збирала
 * обидва списки в один рядок, але рахувалась із `metadata` — тобто трималась на
 * тому, що варіанти лежать у JSON. Відколи варіант це рядок таблиці
 * (REQ-250#p1), колонка стала останньою ниткою, що прив'язувала пошук до
 * старого сховища: щоб прибрати JSON, довелось би тихо зламати цей пошук. Тому
 * питаємо два індекси напряму (обидва триграмні), а колонка пішла.
 *
 * ХОДИМО, ЛИШЕ КОЛИ НАБРАНЕ СХОЖЕ НА КОД. Назви й номери й так знаходяться
 * колонками самих прорахунків, а зайві запити на кожну літеру — ні до чого.
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
    const [itemsBySku, modelsByOwnSku, variantsBySku] = await Promise.all([
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
        .ilike("metadata->>sku", pattern)
        .limit(QUOTE_SKU_MATCH_LIMIT),
      supabase
        .schema("tosho")
        .from("catalog_variants")
        .select("model_id")
        .eq("team_id", teamId)
        .ilike("sku", pattern)
        .limit(QUOTE_SKU_MATCH_LIMIT),
    ]);

    const quoteIds = new Set<string>();
    for (const row of (itemsBySku.data ?? []) as Array<{ quote_id?: string | null }>) {
      if (row.quote_id) quoteIds.add(row.quote_id);
    }

    const modelIds = new Set<string>();
    for (const row of (modelsByOwnSku.data ?? []) as Array<{ id?: string | null }>) {
      if (row.id) modelIds.add(row.id);
    }
    for (const row of (variantsBySku.data ?? []) as Array<{ model_id?: string | null }>) {
      if (row.model_id) modelIds.add(row.model_id);
    }

    if (modelIds.size > 0) {
      const { data: itemsByModel } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("quote_id")
        .eq("team_id", teamId)
        .in("catalog_model_id", Array.from(modelIds))
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
