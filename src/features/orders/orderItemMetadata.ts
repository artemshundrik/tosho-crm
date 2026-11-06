import { supplierNameFromUrl } from "@/lib/supplierPoolRows";

/**
 * Звідки взявся товар у позиції замовлення без прорахунку (REQ-353).
 *
 * Товар за посиланням або з пулу постачальників не має моделі каталогу, а артикул
 * і колір потрібні тому, хто його замовлятиме. В опис їм не можна: опис їде в
 * специфікацію й рахунок. Закупівельної ціни тут немає навмисно: вона лише
 * підказка у вікні створення, і в замовлення число не потрапляє.
 */
export type OrderItemMetadata = {
  sku?: string;
  color?: string;
  /** Посилання, за яким менеджер додав товар. */
  sourceUrl?: string;
  supplierUrl?: string;
  avantprintUrl?: string;
  supplierProductId?: string;
  variantId?: string;
  kindId?: string;
  kindName?: string;
  /** Категорія товару: з неї зібраний опис вантажу в ТТН, коли моделі немає. */
  typeName?: string;
};

const KEYS = [
  "sku",
  "color",
  "sourceUrl",
  "supplierUrl",
  "avantprintUrl",
  "supplierProductId",
  "variantId",
  "kindId",
  "kindName",
  "typeName",
] as const;

/** Те саме, але порожнє дозволене: так поля приходять із чернетки. */
export type OrderItemMetadataInput = { [K in keyof OrderItemMetadata]?: string | null };

/** Лишає тільки заповнене. Порожня позиція дає `null`, а не `{}`: так простіше читати базу. */
export function compactOrderItemMetadata(input: OrderItemMetadataInput | null | undefined): OrderItemMetadata | null {
  if (!input) return null;
  const result: OrderItemMetadata = {};
  for (const key of KEYS) {
    const value = input[key]?.trim();
    if (value) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** З бази: `jsonb` без гарантій щодо форми, тож чужі типи полів просто відпадають. */
export function parseOrderItemMetadata(raw: unknown): OrderItemMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const loose: OrderItemMetadataInput = {};
  for (const key of KEYS) {
    const value = source[key];
    if (typeof value === "string") loose[key] = value;
  }
  return compactOrderItemMetadata(loose);
}

/** Сайти товару без повторів: спершу наш магазин, потім оптовик, потім вставлене посилання. */
export function orderItemSources(metadata: OrderItemMetadata | null | undefined): Array<{ url: string; name: string }> {
  const seen = new Set<string>();
  const result: Array<{ url: string; name: string }> = [];
  for (const url of [metadata?.avantprintUrl, metadata?.supplierUrl, metadata?.sourceUrl]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ url, name: supplierNameFromUrl(url) ?? "посилання" });
  }
  return result;
}

/** Категорії для опису вантажу з позицій без моделі каталогу. */
export function orderItemCargoTypeNames(
  items: ReadonlyArray<{ catalogModelId?: string | null; metadata?: OrderItemMetadata | null }>
): string[] {
  return [
    ...new Set(
      items
        .filter((item) => !item.catalogModelId)
        .map((item) => item.metadata?.typeName)
        .filter((name): name is string => Boolean(name))
    ),
  ];
}
