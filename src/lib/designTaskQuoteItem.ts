import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Яку позицію прорахунку показує дизайн-задача.
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ. Правило звучить просто, але помилка в ньому не
 * впадає в очі: картка задачі показує товар, тираж, фото й методи нанесення
 * ОДНІЄЇ позиції, і якщо взяти не ту, все чотири поля збрешуть узгоджено —
 * виглядатиме як цілісна картка, просто не того товару. Саме так це й жило,
 * поки Влад не помітив 27.08.2026.
 *
 * ЩО БУЛО НЕ ТАК. Створення задачі пише `metadata.quote_item_id` — людина ж
 * обирає, який саме товар візуалізувати. А читач у картці брав ПЕРШУ позицію
 * за `position`, і про це поле не знав узагалі: пошук по всьому коду показував,
 * що `quote_item_id` дизайн-задачі не читає жодне місце. Тобто запис
 * полагодили, коли заводили задачі на кожен товар, а читача забули. Замір бази
 * того ж дня: із 7 задач, заведених на конкретну позицію, 3 показували чужий
 * товар, решта 4 збіглися з першою випадково.
 */

/** Валідний UUID. Свій, щоб модуль лишався листком без імпортів зі сторінок. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id позиції, на яку заведено задачу, або `null` — коли поля немає.
 *
 * `null` означає «задачу заводили до появи вибору позиції», а не «бери будь-яку»:
 * рішення, що з цим робити, ухвалює `fetchDesignTaskQuoteItem`.
 */
export function resolveTaskQuoteItemId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { quote_item_id?: unknown }).quote_item_id;
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * Той самий вибір, але для вже завантаженого списку позицій прорахунку —
 * дошка «Дизайн» тягне їх пакетом на всі картки одразу, тож окремий запит на
 * задачу там неприйнятний.
 *
 * `items` — позиції ОДНОГО прорахунку в порядку `position`. Повертає `null`,
 * коли задачу заводили на позицію, якої в прорахунку вже немає: показати
 * сусідню означало б ту саму брехню, тільки тихішу.
 */
export function pickTaskQuoteItem<T extends { id?: string | null }>(items: T[], metadata: unknown): T | null {
  const targetId = resolveTaskQuoteItemId(metadata);
  if (!targetId) return items[0] ?? null;
  return items.find((item) => item.id === targetId) ?? null;
}

/** Колонки, з яких картка задачі будує блок товару. */
export const DESIGN_TASK_QUOTE_ITEM_COLUMNS =
  "name, qty, unit, methods, attachment, catalog_model_id, catalog_kind_id";

/** Рядок позиції в тому вигляді, в якому його читає картка задачі. */
export type DesignTaskQuoteItem = {
  id?: string;
  name: string | null;
  qty: number | null;
  unit: string | null;
  methods: unknown;
  attachment?: unknown;
  catalog_model_id?: string | null;
  catalog_kind_id?: string | null;
};

/**
 * Позиція прорахунку для картки задачі.
 *
 * ПЕРША ПОЗИЦІЯ — ЛИШЕ ЗАПАСНИЙ ВАРІАНТ і лише там, де `quote_item_id` немає.
 * Якщо поле є, а позицію з прорахунку прибрали, повертаємо `null` і товару не
 * показуємо взагалі: підставити сусідній означало б повернути ту саму брехню,
 * тільки тихішу — людина побачила б цілу картку й не мала б підстав засумніватись.
 */
export async function fetchDesignTaskQuoteItem(
  supabase: SupabaseClient,
  quoteId: string,
  metadata: unknown
): Promise<DesignTaskQuoteItem | null> {
  const targetId = resolveTaskQuoteItemId(metadata);
  const base = supabase.schema("tosho").from("quote_items").select(DESIGN_TASK_QUOTE_ITEM_COLUMNS).eq("quote_id", quoteId);
  const { data } = targetId
    ? await base.eq("id", targetId).maybeSingle()
    : await base.order("position", { ascending: true }).limit(1).maybeSingle();
  return (data as DesignTaskQuoteItem | null) ?? null;
}
