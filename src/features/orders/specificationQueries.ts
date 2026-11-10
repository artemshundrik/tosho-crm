import { readQuoteItemPrintSpec } from "@/lib/printSpecLegacy";
import { formatPrintSpecEntries, formatPrintSpecParts, getPrintSpecPreset } from "@/lib/printSpec";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { supabase } from "@/lib/supabaseClient";
import type { DerivedOrderRecord, OrderDesignAsset } from "@/features/orders/orderRecords";
import { colorBesideTitle } from "@/features/quotes/quote-details/quoteItemMetadata";
import { itemDocumentName } from "@/features/orders/orderItemDocumentNames";
import { buildDefaultSpecItemText, buildPrintSpecItemText } from "@/features/orders/specificationDocument";
import type { SpecTemplate } from "@/features/orders/specTemplate";

/**
 * Дані для СП, яких немає в DerivedOrderRecord: тексти позицій (REQ-322#p24) і
 * картинки погодженої візуалізації. Спільні для СП одного замовлення й групової.
 */

const IMAGE_EXTENSIONS = new Set(["PNG", "JPG", "JPEG", "WEBP", "GIF", "BMP"]);

const isImageAsset = (asset: OrderDesignAsset) => {
  if (asset.mimeType && asset.mimeType.startsWith("image/")) return true;
  const label = (asset.label ?? "").trim();
  return label.includes(".") && IMAGE_EXTENSIONS.has(label.split(".").pop()?.trim().toUpperCase() ?? "");
};

export const resolveVisualizationImageUrls = async (assets: OrderDesignAsset[]): Promise<string[]> => {
  const urls: string[] = [];
  for (const asset of assets) {
    if (!isImageAsset(asset)) continue;
    if (asset.kind === "link") {
      if (asset.url) urls.push(asset.url);
      continue;
    }
    if (!asset.storageBucket || !asset.storagePath) continue;
    try {
      // Оригінал, не прев'ю: прев'ю стиснуте до 640 px, а візуал 16:9 несе дрібний текст
      // (розміри, тираж), який на друкованій СП розпливається до нечитабельного.
      const signedUrl =
        (await getSignedAttachmentUrl(asset.storageBucket, asset.storagePath, "original", 60 * 60)) ??
        (await getSignedAttachmentUrl(asset.storageBucket, asset.storagePath, "preview", 60 * 60));
      if (signedUrl) urls.push(signedUrl);
    } catch (resolveError) {
      console.error("Failed to resolve visualization signed URL", resolveError);
    }
  }
  return urls;
};

export type SpecificationItemText = {
  itemId: string;
  name: string;
  /** Що піде в СП: поправлене менеджером, інакше типове. */
  text: string;
  defaultText: string;
  /** Типовий текст за кожним шаблоном: вид СП можна перемкнути у вікні, не перечитуючи базу. */
  defaultTexts: Record<SpecTemplate, string>;
  /** Позиція має параметри друку з прорахунку — підказка виду СП (REQ-358). */
  isPrint: boolean;
  /** Позиція — послуга: усі послуги підказують СП на дизайн-послуги. */
  isService: boolean;
  edited: boolean;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  name: string | null;
  description: string | null;
  methods: unknown;
  catalog_model_id: string | null;
  quote_item_id: string | null;
  spec_text?: string | null;
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeForCompare = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

type LookupTable = "quote_items" | "catalog_models" | "catalog_methods" | "catalog_print_positions";

async function selectByIds<T>(table: LookupTable, columns: string, ids: string[]): Promise<T[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase.schema("tosho").from(table).select(columns).in("id", unique);
  if (error) throw error;
  return (data ?? []) as T[];
}

const ORDER_ITEM_COLUMNS = "id,order_id,name,description,methods,catalog_model_id,quote_item_id";

async function loadOrderItems(teamId: string, orderIds: string[]) {
  const query = (columns: string) =>
    supabase
      .schema("tosho")
      .from("order_items")
      .select(columns)
      .eq("team_id", teamId)
      .in("order_id", orderIds);
  const withText = await query(`${ORDER_ITEM_COLUMNS},spec_text`);
  // До застосування scripts/orders-specification-numbering.sql колонки ще немає —
  // тоді СП друкується з типовими текстами, а не падає.
  if (withText.error && /spec_text/.test(withText.error.message ?? "")) {
    const fallback = await query(ORDER_ITEM_COLUMNS);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []) as unknown as OrderItemRow[];
  }
  if (withText.error) throw withText.error;
  return (withText.data ?? []) as unknown as OrderItemRow[];
}

/**
 * Тексти позицій СП у порядку позицій замовлень. Типовий текст (рішення 6):
 * назва, «Технічні характеристики:» цього замовлення — опис менеджера, колір і
 * параметри виробу з прорахунку — та «<метод>, <місце> — згідно затвердженого
 * макету». Опис, що дослівно збігається з описом моделі в каталозі, — це
 * маркетинговий текст постачальника, і в СП він не йде.
 */
export async function loadSpecificationItemTexts(
  teamId: string,
  records: Array<Pick<DerivedOrderRecord, "id" | "source" | "items">>,
  template: SpecTemplate = "merch"
): Promise<SpecificationItemText[]> {
  const orderIds = records.filter((record) => record.source === "stored").map((record) => record.id);
  if (orderIds.length === 0) return [];
  const rows = await loadOrderItems(teamId, orderIds);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  const methodEntries = rows.flatMap((row) => (Array.isArray(row.methods) ? row.methods : [])).map(asRecord);
  const [quoteItems, models, methods, positions] = await Promise.all([
    selectByIds<{ id: string; metadata: unknown }>(
      "quote_items",
      "id,metadata",
      rows.map((row) => row.quote_item_id ?? "")
    ),
    // Опис моделі живе в metadata.description; беремо лише його, metadata цілком важке.
    selectByIds<{ id: string; description: string | null }>(
      "catalog_models",
      "id,description:metadata->>description",
      rows.map((row) => row.catalog_model_id ?? "")
    ),
    selectByIds<{ id: string; name: string | null }>(
      "catalog_methods",
      "id,name",
      methodEntries.map((entry) => text(entry?.method_id))
    ),
    selectByIds<{ id: string; label: string | null }>(
      "catalog_print_positions",
      "id,label",
      methodEntries.map((entry) => text(entry?.print_position_id))
    ),
  ]);
  const metadataByQuoteItem = new Map(quoteItems.map((row) => [row.id, row.metadata]));
  const modelDescriptionById = new Map(models.map((row) => [row.id, normalizeForCompare(row.description ?? "")]));
  const methodNameById = new Map(methods.map((row) => [row.id, text(row.name)]));
  const positionLabelById = new Map(positions.map((row) => [row.id, text(row.label)]));

  const imprintsOf = (row: OrderItemRow) =>
    (Array.isArray(row.methods) ? row.methods : [])
      .map((raw) => {
        const entry = asRecord(raw);
        if (!entry) return "";
        const label = text(entry.label);
        if (label) return label;
        const methodId = text(entry.method_id);
        // Порожня пара {method_id: null} — не нанесення (див. quoteItemMethodsSummary.ts).
        if (!methodId) return "";
        const place = text(entry.print_position_label) || positionLabelById.get(text(entry.print_position_id)) || "";
        return [methodNameById.get(methodId) || "Нанесення", place].filter(Boolean).join(", ");
      })
      .filter(Boolean);

  const entryText = (entry: { label: string; value: string }) => `${entry.label.toLowerCase()} — ${entry.value}`;

  /** Опис менеджера (якщо це не текст каталогу) і колір. */
  const ownTraitsOf = (row: OrderItemRow) => {
    const result: string[] = [];
    const description = text(row.description);
    const modelDescription = row.catalog_model_id ? modelDescriptionById.get(row.catalog_model_id) : "";
    if (description && normalizeForCompare(description) !== modelDescription) result.push(description);
    const metadata = row.quote_item_id ? metadataByQuoteItem.get(row.quote_item_id) : null;
    const colour = colorBesideTitle(row.name, asRecord(asRecord(metadata)?.catalogVariant));
    if (colour) result.push(`колір ${colour}`);
    return result;
  };

  const printSpecOf = (row: OrderItemRow) => {
    const metadata = row.quote_item_id ? metadataByQuoteItem.get(row.quote_item_id) : null;
    const spec = readQuoteItemPrintSpec(metadata);
    const preset = spec ? getPrintSpecPreset(spec.presetKey) : null;
    return spec && preset ? { preset, values: spec.values } : null;
  };

  return records.flatMap((record) =>
    record.items.map((item) => {
      const row = rowsById.get(item.id);
      const name = itemDocumentName(item);
      const imprints = row ? imprintsOf(row) : item.methodsSummary ? [item.methodsSummary] : [];
      const ownTraits = row ? ownTraitsOf(row) : [];
      const printSpec = row ? printSpecOf(row) : null;
      const merch = buildDefaultSpecItemText({
        name,
        characteristics: [
          ...ownTraits,
          ...(printSpec ? formatPrintSpecEntries(printSpec.preset, printSpec.values).map(entryText) : []),
        ],
        imprints,
      });
      const print = printSpec
        ? buildPrintSpecItemText({
            name,
            kindLabel: printSpec.preset.label,
            parts: formatPrintSpecParts(printSpec.preset, printSpec.values).map((part) => ({
              title: part.title,
              values: part.entries.map(entryText),
            })),
            characteristics: ownTraits,
            imprints,
          })
        : merch;
      // Послуга без нанесень і «згідно макету»: назва й опис робіт.
      const design = buildDefaultSpecItemText({ name, characteristics: ownTraits, imprints: [] });
      const defaultTexts: Record<SpecTemplate, string> = { merch, print, design };
      const defaultText = defaultTexts[template];
      const stored = row?.spec_text?.trim() ?? "";
      return {
        itemId: item.id,
        name: item.name,
        text: stored || defaultText,
        defaultText,
        defaultTexts,
        isPrint: Boolean(printSpec),
        isService: item.kind === "service",
        edited: Boolean(stored) && stored !== defaultText,
      };
    })
  );
}

/** Текст, що збігається з типовим, зберігаємо як null: тоді він іде за даними замовлення. */
export const storedSpecText = (entry: Pick<SpecificationItemText, "text" | "defaultText">) => {
  const value = entry.text.trim();
  return value && value !== entry.defaultText.trim() ? value : null;
};

/** Позиції з текстами, які щойно збережено: щоб відбиток погодження побачив правку без перезавантаження. */
export const withStoredSpecTexts = <T extends { id: string; specText?: string | null }>(
  items: T[],
  texts: SpecificationItemText[]
): T[] => {
  if (texts.length === 0) return items;
  const byId = new Map(texts.map((entry) => [entry.itemId, storedSpecText(entry)]));
  return items.map((item) => (byId.has(item.id) ? { ...item, specText: byId.get(item.id) ?? null } : item));
};

export async function saveSpecificationItemTexts(teamId: string, texts: SpecificationItemText[]) {
  for (const entry of texts) {
    const { error } = await supabase
      .schema("tosho")
      .from("order_items")
      .update({ spec_text: storedSpecText(entry) })
      .eq("team_id", teamId)
      .eq("id", entry.itemId);
    if (error) throw error;
  }
}
