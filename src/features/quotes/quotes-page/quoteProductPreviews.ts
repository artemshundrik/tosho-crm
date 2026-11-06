import type { QuoteKanbanProductPreview } from "@/features/quotes/components/QuoteKanbanProducts";
import { fetchSpecPresetsByModelId } from "@/features/quotes/quote-details/catalogSpecPresets";
import { colorBesideTitle } from "@/features/quotes/quote-details/quoteItemMetadata";
import { computeQuoteListBreakdown } from "@/features/quotes/quotes-page/quoteListTotal";
import {
  listCatalogModelsByIds,
  listQuoteItemPreviewsForQuotes,
  listQuoteRunPreviewsForQuotes,
  type QuoteItemPreviewRow,
  type QuoteRunPreviewRow,
} from "@/lib/toshoApi";
import { normalizeUnitLabel } from "@/lib/units";

/**
 * Прев'ю товарів прорахунків: позиції з фото, тиражі й сума рядка — те, що
 * показують картка дошки, картка товарів у таблиці й прев'ю справи.
 *
 * Винесено зі сторінки прорахунків, коли прев'ю знадобилось «Вхідним»
 * (REQ-346#p2): один і той самий прорахунок не має виглядати по-різному
 * залежно від того, звідки його відкрили. Прорахунок без позицій у мапу не
 * потрапляє.
 */
export async function loadQuoteProductPreviews(
  teamId: string,
  quoteIds: string[]
): Promise<Record<string, QuoteKanbanProductPreview>> {
  const missingQuoteIds = quoteIds;
  const [itemRows, runRows] = await Promise.all([
    listQuoteItemPreviewsForQuotes({ teamId, quoteIds: missingQuoteIds }),
    listQuoteRunPreviewsForQuotes({ quoteIds: missingQuoteIds }),
  ]);

  const countByQuoteId: Record<string, number> = {};
  const firstItemByQuoteId = new Map<string, QuoteItemPreviewRow>();
  const itemsByQuoteId = new Map<string, QuoteItemPreviewRow[]>();
  const itemNamesByQuoteId = new Map<string, string[]>();
  const runsByItemId = new Map<string, QuoteRunPreviewRow[]>();
  const sharedRunsByQuoteId = new Map<string, QuoteRunPreviewRow[]>();

  itemRows.forEach((row) => {
    const quoteId = row.quote_id?.trim();
    if (!quoteId) return;
    countByQuoteId[quoteId] = (countByQuoteId[quoteId] ?? 0) + 1;
    const quoteItems = itemsByQuoteId.get(quoteId) ?? [];
    quoteItems.push(row);
    itemsByQuoteId.set(quoteId, quoteItems);
    const names = itemNamesByQuoteId.get(quoteId) ?? [];
    const itemName = row.name?.trim();
    if (itemName) {
      names.push(itemName);
    }
    itemNamesByQuoteId.set(quoteId, names);
    if (!firstItemByQuoteId.has(quoteId)) {
      firstItemByQuoteId.set(quoteId, row);
    }
  });

  runRows.forEach((run) => {
    const quoteId = run.quote_id?.trim();
    const itemId = run.quote_item_id?.trim();
    if (itemId) {
      const itemRuns = runsByItemId.get(itemId) ?? [];
      itemRuns.push(run);
      runsByItemId.set(itemId, itemRuns);
      return;
    }
    if (quoteId) {
      const quoteRuns = sharedRunsByQuoteId.get(quoteId) ?? [];
      quoteRuns.push(run);
      sharedRunsByQuoteId.set(quoteId, quoteRuns);
    }
  });

  const modelIds = Array.from(
    new Set(
      itemRows
        .map((row) => row.catalog_model_id?.trim() ?? "")
        .filter(Boolean)
    )
  );
  const specPresetById = await fetchSpecPresetsByModelId(modelIds);
  const modelImageById = new Map<string, { imageUrl: string | null; zoomImageUrl?: string | null; sku?: string | null }>();
  if (modelIds.length > 0) {
    const modelRows = await listCatalogModelsByIds(modelIds);
    modelRows.forEach((row, id) => {
      const zoomImageUrl = row.image_url?.trim() || null;
      const imageUrl = row.thumb_url?.trim() || zoomImageUrl;
      const sku = row.sku?.trim() || null;
      if (!imageUrl && !sku) return;
      modelImageById.set(id, { imageUrl, zoomImageUrl, sku });
    });
  }

  const formatQtyLabel = (qty: number | null | undefined, unit: string | null | undefined) => {
    const qtyValue = Number(qty ?? 0);
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) return "Не вказано";
    const qtyLabel = Number.isInteger(qtyValue) ? String(qtyValue) : qtyValue.toLocaleString("uk-UA");
    return `${qtyLabel} ${normalizeUnitLabel(unit)}`;
  };

  const formatRunLabel = (quantity: number | null | undefined, unit: string | null | undefined) =>
    formatQtyLabel(quantity, unit);

  const nextMap: Record<string, QuoteKanbanProductPreview> = {};
  missingQuoteIds.forEach((quoteId) => {
    const firstItem = firstItemByQuoteId.get(quoteId);
    const quoteItems = itemsByQuoteId.get(quoteId) ?? [];
    const itemCount = countByQuoteId[quoteId] ?? 0;
    if (!firstItem || itemCount === 0) return;

    const toProductPreview = (item: QuoteItemPreviewRow) => {
      const attachmentImage =
        item.attachment &&
        typeof item.attachment === "object" &&
        typeof (item.attachment as Record<string, unknown>).url === "string"
          ? String((item.attachment as Record<string, unknown>).url)
          : null;
      const catalogImage = item.catalog_model_id
        ? modelImageById.get(item.catalog_model_id) ?? null
        : null;
      const metadataSku =
        item.metadata && typeof item.metadata.sku === "string"
          ? item.metadata.sku.trim() || null
          : null;
      const metadataVariant =
        item.metadata &&
        typeof item.metadata.catalogVariant === "object" &&
        item.metadata.catalogVariant !== null
          ? (item.metadata.catalogVariant as {
              name?: unknown;
            sku?: unknown;
            imageUrl?: unknown;
            colorUnchosen?: unknown;
          })
        : null;
      const variantName = colorBesideTitle(item.name, metadataVariant);
      const variantImageUrl =
        typeof metadataVariant?.imageUrl === "string" ? metadataVariant.imageUrl.trim() || null : null;
      const sku = metadataSku || catalogImage?.sku || null;

      const itemRuns = runsByItemId.get(item.id) ?? [];
      const sharedRuns = quoteItems.length === 1 ? sharedRunsByQuoteId.get(quoteId) ?? [] : [];
      const runLabels = (itemRuns.length > 0 ? itemRuns : sharedRuns)
        .filter((run) => Number(run.quantity ?? 0) > 0)
        .map((run) => ({
          id: run.id,
          label: formatRunLabel(run.quantity, item.unit),
          active: false,
        }));

      return {
        id: item.id,
        name: item.name?.trim() || "Товар без назви",
        sku,
        variantName,
        variantImageUrl,
        qtyLabel: formatQtyLabel(item.qty, item.unit),
        specPreset: specPresetById.get(item.catalog_model_id ?? "") ?? null,
        runLabels,
        imageUrl: attachmentImage || variantImageUrl || catalogImage?.imageUrl || null,
        zoomImageUrl: attachmentImage || variantImageUrl || catalogImage?.zoomImageUrl || catalogImage?.imageUrl || null,
      };
    };

    const products = quoteItems.map(toProductPreview);
    const primaryProduct = products[0] ?? toProductPreview(firstItem);

    const breakdown = computeQuoteListBreakdown(
      quoteItems,
      [...quoteItems.flatMap((item) => runsByItemId.get(item.id) ?? []), ...(sharedRunsByQuoteId.get(quoteId) ?? [])]
    );

    nextMap[quoteId] = {
      itemCount,
      itemName: primaryProduct.name,
      itemNames: itemNamesByQuoteId.get(quoteId) ?? [],
      qtyLabel: formatQtyLabel(firstItem.qty, firstItem.unit),
      imageUrl: primaryProduct.imageUrl,
      zoomImageUrl: primaryProduct.zoomImageUrl,
      products,
      listTotal: breakdown.total,
      listLines: breakdown.lines,
    };
  });
  return nextMap;
}
