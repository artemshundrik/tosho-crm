import { readQuoteItemPrintSpec } from "@/lib/printSpecLegacy";
import { formatPrintSpecEntries, getPrintSpecPreset } from "@/lib/printSpec";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { supabase } from "@/lib/supabaseClient";
import type { DerivedOrderRecord, OrderDesignAsset } from "@/features/orders/orderRecords";
import { itemDocumentName } from "@/features/orders/orderItemDocumentNames";
import { buildDefaultSpecItemText } from "@/features/orders/specificationDocument";

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
  records: Array<Pick<DerivedOrderRecord, "id" | "source" | "items">>
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

  const characteristicsOf = (row: OrderItemRow) => {
    const result: string[] = [];
    const description = text(row.description);
    const modelDescription = row.catalog_model_id ? modelDescriptionById.get(row.catalog_model_id) : "";
    if (description && normalizeForCompare(description) !== modelDescription) result.push(description);
    const metadata = row.quote_item_id ? metadataByQuoteItem.get(row.quote_item_id) : null;
    const colour = text(asRecord(asRecord(metadata)?.catalogVariant)?.name);
    if (colour) result.push(`колір ${colour}`);
    const spec = readQuoteItemPrintSpec(metadata);
    const preset = spec ? getPrintSpecPreset(spec.presetKey) : null;
    if (spec && preset) {
      result.push(...formatPrintSpecEntries(preset, spec.values).map((entry) => `${entry.label.toLowerCase()} — ${entry.value}`));
    }
    return result;
  };

  return records.flatMap((record) =>
    record.items.map((item) => {
      const row = rowsById.get(item.id);
      const defaultText = buildDefaultSpecItemText({
        name: itemDocumentName(item),
        characteristics: row ? characteristicsOf(row) : [],
        imprints: row ? imprintsOf(row) : item.methodsSummary ? [item.methodsSummary] : [],
      });
      const stored = row?.spec_text?.trim() ?? "";
      return {
        itemId: item.id,
        name: item.name,
        text: stored || defaultText,
        defaultText,
        edited: Boolean(stored) && stored !== defaultText,
      };
    })
  );
}

/** Текст, що збігається з типовим, зберігаємо як null: тоді він іде за даними замовлення. */
export async function saveSpecificationItemTexts(teamId: string, texts: SpecificationItemText[]) {
  for (const entry of texts) {
    const value = entry.text.trim();
    const { error } = await supabase
      .schema("tosho")
      .from("order_items")
      .update({ spec_text: value && value !== entry.defaultText.trim() ? value : null })
      .eq("team_id", teamId)
      .eq("id", entry.itemId);
    if (error) throw error;
  }
}
