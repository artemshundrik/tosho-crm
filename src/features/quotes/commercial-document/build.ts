/**
 * Збирання комерційного документа з прорахунків — походи в базу, які `document.ts`
 * навмисно не робить (там чисті функції й розмітка виходів).
 *
 * ЧОМУ ФУНКЦІЯ БІЛЬШЕ НЕ ЗНАЄ ПРО НАБОРИ. Вона жила замиканням у `QuotesPage` і
 * стояла на `quoteSetDetailsTarget` + `quoteSetDetailsItems`, тобто документ міг
 * народитись лише з набору — а набір вимагає щонайменше ДВОХ прорахунків
 * (`canRunGroupedActions`). Через це прорахунок на дев'ять позицій не було чим
 * показати замовнику взагалі: усі чотири виходи жили у вікні набору на сторінці
 * списку. Усередині функція й так ходила по масиву `quoteIds` — тож розв'язати її
 * від набору означало передати цей масив ззовні, а не переписувати збирання.
 *
 * Тепер входів два й вони рівноправні: сторінка списку віддає позиції набору,
 * картка прорахунку — один прорахунок.
 *
 * ГЕЙТ НАЦІНКИ ЛИШАЄТЬСЯ ТУТ (REQ-149, REQ-182). Це єдині двері назовні: саме ця
 * функція збирає документ, який бачить клієнт, і всі виходи — прев'ю, друк,
 * вивантаження — ходять через неї. Окремі перевірки на кожній кнопці рано чи пізно
 * розійшлися б, а прев'ю показує рівно те, що поїде.
 */

import { normalizeStatus, statusLabels } from "@/features/quotes/quotes-page/config";
import { fetchMarkupApprovalsForQuotes } from "@/features/quotes/quote-details/markupApproval";
import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { sumMoneyRanges } from "@/lib/moneyRange";
import { resolveQuoteDealType, type QuoteDealType } from "@/lib/quoteDealType";
import { markupGateMessage, resolveQuoteMarkupGate } from "@/lib/quoteMarkupApproval";
import { getRunSalePricingFromRun } from "@/lib/quoteRuns";
import { supabase } from "@/lib/supabaseClient";
import {
  getQuoteRuns,
  listCatalogModelsByIds,
  listQuoteItemsForQuotes,
  type QuoteItemExportRow,
  type QuoteRun,
} from "@/lib/toshoApi";
import { normalizeUnitLabel } from "@/lib/units";

import {
  cleanCustomerName,
  commercialSectionTotalRange,
  formatDateTime,
  parseMethodsSummary,
  parsePlacementSummary,
  type CommercialDocument,
  type CommercialItemRow,
  type CommercialQuoteSection,
  type CommercialRunRow,
} from "./document";

/**
 * Прорахунок на вході — рівно те, що потрібно для шапки секції.
 *
 * Поля названі не так, як колонки `quote_set_items` (`quote_number`,
 * `quote_status`…): назви з набору тягнули б за собою уявлення, що документ
 * буває лише з набору. Виклик зі сторінки списку перекладає їх на ці.
 */
export type CommercialSourceQuote = {
  id: string;
  number?: string | null;
  status?: string | null;
  createdAt?: string | null;
  /** Збережений підсумок прорахунку — запасний шлях, коли цін немає зовсім. */
  total?: number | null;
};

export type BuildCommercialDocumentParams = {
  teamId: string;
  quotes: readonly CommercialSourceQuote[];
  title: string;
  /** Як у картці клієнта; чиститься тут, для всіх виходів разом (`cleanCustomerName`). */
  customerName: string | null | undefined;
  /** Дата документа; порожня — береться сьогоднішня. */
  createdAt?: string | null;
};

const formatStatusLabel = (value: string | null | undefined) => {
  const normalized = normalizeStatus(value);
  return (normalized && statusLabels[normalized]) || value || "Не вказано";
};

/**
 * Фото, яке позиція несе САМА.
 *
 * Товар, заведений посиланням, не завжди стає рядком каталогу — але імпорт
 * одразу кладе його знімок у `metadata.catalogVariant.imageUrl`
 * (`quote-import-research-background`), і картка позиції цим уже малює
 * картинку. Документ туди не заглядав і показував плитку з ініціалами там, де
 * фото було весь час.
 *
 * ЦЕ ЗАМІНИЛО ПЛАН ІТИ ПО ФОТО В ПУЛ ПОСТАЧАЛЬНИКІВ (REQ-296#p8). Заміряно
 * 21.09.2026: із 44 позицій без фото моделі 11 мають його тут, а з решти 33
 * жодна не має навіть артикула — тобто запит у пул не врятував би НІ ОДНОЇ, а
 * коштував би нової функції з привілейованим читанням таблиці, у якій лежать
 * закупівельні ціни.
 */
const readVariantImage = (metadata: QuoteItemExportRow["metadata"]) => {
  if (!metadata || typeof metadata !== "object") return "";
  const variant = (metadata as Record<string, unknown>).catalogVariant;
  if (!variant || typeof variant !== "object") return "";
  const url = (variant as Record<string, unknown>).imageUrl;
  return typeof url === "string" ? url.trim() : "";
};

export async function buildCommercialDocument(
  params: BuildCommercialDocumentParams
): Promise<CommercialDocument | null> {
  const { teamId, quotes } = params;
  const quoteIds = quotes.map((quote) => quote.id).filter(Boolean);
  if (quoteIds.length === 0) return null;

  const itemRows = await listQuoteItemsForQuotes({ teamId, quoteIds });
  // Продажні ціни (з націнкою) зберігаються в quote_item_runs, а не в quote_items.unit_price
  // (там лежить собівартість). Підтягуємо runs, щоб КП показувало ту саму ціну, що й замовлення.
  const runsByQuoteId = new Map<string, QuoteRun[]>();
  await Promise.all(
    quoteIds.map(async (quoteId) => {
      runsByQuoteId.set(quoteId, await getQuoteRuns(quoteId));
    })
  );

  const markupApprovals = await fetchMarkupApprovalsForQuotes(quoteIds);
  // Дно залежить від типу УГОДИ, а в документ їх може входити кілька — тому гейт
  // рахуємо по кожному прорахунку окремо (REQ-182). Спільний прохід по всіх
  // тиражах брав би дно навмання з першого-ліпшого.
  const { data: dealTypeRows } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,quote_type,deal_type")
    .in("id", quoteIds);
  const dealTypeByQuoteId = new Map<string, QuoteDealType | null>(
    (
      (dealTypeRows as Array<{
        id: string;
        quote_type: string | null;
        deal_type: string | null;
      }> | null) ?? []
    ).map((row) => [row.id, resolveQuoteDealType(row.quote_type, row.deal_type)])
  );
  // `undefined` — «жоден не заблокований». Саме `undefined`, а не `null`:
  // null — повноцінне значення шкали, воно означає мерч зі старим дном 20 %.
  let blockedDealType: QuoteDealType | null | undefined;
  for (const [quoteId, quoteRuns] of runsByQuoteId) {
    const dealType = dealTypeByQuoteId.get(quoteId) ?? null;
    const gate = resolveQuoteMarkupGate(
      quoteRuns
        .filter((run): run is QuoteRun & { id: string } => !!run.id)
        .map((run) => {
          const pricing = getRunSalePricingFromRun(run);
          return {
            id: run.id,
            costTotal: pricing.costTotal,
            markupRate: Number(run.markup_rate) || 0,
            approval: markupApprovals.get(run.id) ?? null,
          };
        }),
      dealType
    );
    if (gate.blocked) {
      blockedDealType = dealType;
      break;
    }
  }
  if (blockedDealType !== undefined) {
    throw new Error(markupGateMessage(blockedDealType));
  }

  const { data: visualizationRows, error: visualizationsError } = await supabase
    .schema("tosho")
    .from("quote_attachments")
    .select("quote_id,file_name,mime_type,storage_bucket,storage_path,created_at")
    .in("quote_id", quoteIds)
    .order("created_at", { ascending: false });
  if (visualizationsError) throw visualizationsError;

  /*
    ЩО САМЕ ВВАЖАЄТЬСЯ ВІЗУАЛОМ — ВИРІШУЄ ДИЗАЙН-ЗАДАЧА (REQ-304).

    Доти КП брало все, що лежить у `design-outputs/` серед файлів прорахунку, і
    задачу не питало взагалі. Але видалення виходу з задачі прибирає його лише
    з метаданих задачі — рядок вкладення лишається. Тож видалений візуал
    мовчки їхав клієнтові: на TS-0926-0026 у задачі був один вихід, а в
    документ ішло два.

    Задачі без ключа `design_output_files` (старі) списку не мають — для їхніх
    прорахунків лишається все як було, інакше в них КП втратило б візуали.
  */
  const { data: designTaskRows } = await supabase
    .from("activity_log")
    .select("entity_id,metadata")
    .eq("action", "design_task")
    .in("entity_id", quoteIds);

  const allowedVisualPaths = new Map<string, Set<string>>();
  for (const row of (designTaskRows ?? []) as Array<{ entity_id?: string | null; metadata?: unknown }>) {
    const quoteId = row.entity_id ?? "";
    if (!quoteId) continue;
    const outputs = (row.metadata as { design_output_files?: unknown } | null)?.design_output_files;
    if (!Array.isArray(outputs)) continue;
    const paths = allowedVisualPaths.get(quoteId) ?? new Set<string>();
    for (const output of outputs) {
      const path = (output as { storage_path?: unknown } | null)?.storage_path;
      if (typeof path === "string" && path.trim()) paths.add(path.trim());
    }
    allowedVisualPaths.set(quoteId, paths);
  }

  const typeIds = Array.from(new Set(itemRows.map((row) => row.catalog_type_id ?? "").filter(Boolean)));
  const kindIds = Array.from(new Set(itemRows.map((row) => row.catalog_kind_id ?? "").filter(Boolean)));
  const modelIds = Array.from(new Set(itemRows.map((row) => row.catalog_model_id ?? "").filter(Boolean)));
  /**
   * Назви методів нанесення лежать у довіднику, а в позиції — самі id.
   *
   * ДО 22.09.2026 ДОКУМЕНТ МОВЧАВ ПРО НАНЕСЕННЯ ВЗАГАЛІ. `parseMethodsSummary`
   * шукала назву всередині запису методу (`method_name`), а туди пишеться лише
   * `method_id` — тож рядок виходив порожній і просто не малювався. На живому
   * прорахунку TS-0926-0029 так зникли ДТФ, УФ-друк і Сублімація з шести
   * позицій: замовник бачив товари й ціни, але не бачив, чим ми їх брендуємо.
   */
  const methodIds = Array.from(
    new Set(
      itemRows
        .flatMap((row) =>
          Array.isArray(row.methods)
            ? row.methods.map((entry) => {
                if (!entry || typeof entry !== "object") return "";
                const value = (entry as Record<string, unknown>).method_id;
                return typeof value === "string" ? value : "";
              })
            : []
        )
        .filter(Boolean)
    )
  );

  const printPositionIds = Array.from(
    new Set(
      itemRows
        .flatMap((row) => {
          const fromMethods = Array.isArray(row.methods)
            ? row.methods
                .map((entry) => {
                  if (!entry || typeof entry !== "object") return "";
                  const value = (entry as Record<string, unknown>).print_position_id;
                  return typeof value === "string" ? value : "";
                })
                .filter(Boolean)
            : [];
          return [row.print_position_id ?? "", ...fromMethods];
        })
        .filter(Boolean)
    )
  );

  const [typeRows, kindRows, modelRows, printPositionRows, methodRows] = await Promise.all([
    typeIds.length > 0
      ? supabase.schema("tosho").from("catalog_types").select("id,name").in("id", typeIds)
      : Promise.resolve({ data: [], error: null }),
    kindIds.length > 0
      ? supabase.schema("tosho").from("catalog_kinds").select("id,name").in("id", kindIds)
      : Promise.resolve({ data: [], error: null }),
    modelIds.length > 0
      ? listCatalogModelsByIds(modelIds).then((map) => ({ data: Array.from(map.values()), error: null }))
      : Promise.resolve({ data: [], error: null }),
    printPositionIds.length > 0
      ? supabase.schema("tosho").from("catalog_print_positions").select("id,label").in("id", printPositionIds)
      : Promise.resolve({ data: [], error: null }),
    methodIds.length > 0
      ? supabase.schema("tosho").from("catalog_methods").select("id,name").in("id", methodIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (typeRows.error) throw typeRows.error;
  if (kindRows.error) throw kindRows.error;
  if (modelRows.error) throw modelRows.error;
  if (printPositionRows.error) throw printPositionRows.error;
  if (methodRows.error) throw methodRows.error;

  const typeNameById = new Map(
    (((typeRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null }>).map((row) => [
      row.id,
      row.name ?? "",
    ])
  );
  const kindNameById = new Map(
    (((kindRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null }>).map((row) => [
      row.id,
      row.name ?? "",
    ])
  );
  const modelById = new Map(
    (
      ((modelRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null; image_url?: string | null }>
    ).map((row) => [row.id, { name: row.name ?? "", imageUrl: row.image_url ?? "" }])
  );
  const methodNameById = new Map(
    (((methodRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null }>).map((row) => [
      row.id,
      row.name ?? "",
    ])
  );
  const printPositionLabelById = new Map(
    (((printPositionRows.data ?? []) as unknown) as Array<{ id: string; label?: string | null }>).map((row) => [
      row.id,
      row.label ?? "",
    ])
  );

  const visualizationsByQuoteId = new Map<string, Array<{ url: string; thumbUrl?: string; name: string }>>();
  const seenVisualPaths = new Map<string, Set<string>>();
  const typedVisualizations = ((visualizationRows ?? []) as unknown) as Array<{
    quote_id?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
    storage_bucket?: string | null;
    storage_path?: string | null;
    created_at?: string | null;
  }>;
  for (const row of typedVisualizations) {
    const quoteId = row.quote_id ?? "";
    if (!quoteId) continue;
    if (!row.storage_bucket || !row.storage_path) continue;
    const storagePath = row.storage_path;
    const isDesignVisualization = storagePath.includes("design-outputs/");
    if (!isDesignVisualization) continue;
    const allowed = allowedVisualPaths.get(quoteId);
    if (allowed && !allowed.has(storagePath)) continue;
    // Дублі рядків у вкладеннях бувають (той самий файл записаний двічі з
    // різницею у 80 мс), а підписане посилання щоразу нове — тож єдине, за чим
    // тут можна впізнати той самий файл, це шлях у сховищі.
    if (seenVisualPaths.get(quoteId)?.has(storagePath)) continue;
    const mimeType = row.mime_type?.toLowerCase() ?? "";
    const fileName = row.file_name?.toLowerCase() ?? "";
    const canRenderPreview =
      mimeType.startsWith("image/") ||
      mimeType === "application/pdf" ||
      mimeType === "image/tiff" ||
      /\.(png|jpg|jpeg|webp|gif|bmp|svg|pdf|tif|tiff)$/i.test(fileName);
    if (!canRenderPreview) continue;

    const signedUrl =
      (await getSignedAttachmentUrl(row.storage_bucket, storagePath, "preview", 60 * 60 * 24 * 7)) ??
      (await getSignedAttachmentUrl(row.storage_bucket, storagePath, "thumb", 60 * 60 * 24 * 7)) ??
      (await getSignedAttachmentUrl(row.storage_bucket, storagePath, "original", 60 * 60 * 24 * 7)) ??
      supabase.storage.from(row.storage_bucket).getPublicUrl(storagePath).data.publicUrl;
    if (!signedUrl) continue;
    const thumbUrl =
      (await getSignedAttachmentUrl(row.storage_bucket, storagePath, "thumb", 60 * 60 * 24 * 7)) ?? signedUrl;
    const list = visualizationsByQuoteId.get(quoteId) ?? [];
    list.push({
      url: signedUrl,
      thumbUrl,
      name: row.file_name ?? "visualization",
    });
    visualizationsByQuoteId.set(quoteId, list);
    const seen = seenVisualPaths.get(quoteId) ?? new Set<string>();
    seen.add(storagePath);
    seenVisualPaths.set(quoteId, seen);
  }

  const itemsByQuoteId = new Map<string, QuoteItemExportRow[]>();
  itemRows.forEach((row) => {
    const quoteId = row.quote_id;
    if (!quoteId) return;
    const existing = itemsByQuoteId.get(quoteId) ?? [];
    existing.push(row);
    itemsByQuoteId.set(quoteId, existing);
  });

  const sections: CommercialQuoteSection[] = quotes.map((quoteRef) => {
    const rows = (itemsByQuoteId.get(quoteRef.id) ?? []).slice().sort((a, b) => {
      const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition;
    });

    const quoteRuns = runsByQuoteId.get(quoteRef.id) ?? [];

    const mappedItems: CommercialItemRow[] = rows.map((row, index) => {
      const fallbackQty = Number(row.qty ?? 0) || 0;
      const fallbackUnitPrice = Number(row.unit_price ?? 0) || 0;
      const fallbackLineTotal =
        Number.isFinite(Number(row.line_total)) && row.line_total !== null
          ? Number(row.line_total)
          : fallbackQty * fallbackUnitPrice;
      // Продажні ціни (з націнкою) живуть у quote_item_runs, а не в quote_items.unit_price
      // (там — застаріла/собівартісна копія, через що КП губив націнку або показував 0).
      // Один товар у прорахунку ⇒ беремо всі run-и (quote_item_id інколи null).
      const itemRuns = rows.length === 1 ? quoteRuns : quoteRuns.filter((run) => run.quote_item_id === row.id);

      // Кожен тираж — окремий рядок. НЕ підсумовувати: варіанти взаємовиключні,
      // сума «всіх разом» не відповідає жодному можливому замовленню.
      const runRows: CommercialRunRow[] = itemRuns
        .map((run, runIndex) => {
          const runQty = Math.max(0, Number(run.quantity) || 0);
          const saleTotal = getRunSalePricingFromRun(run).saleTotal;
          return {
            id: run.id ?? `${row.id}-run-${runIndex}`,
            qty: runQty,
            unitPrice: runQty > 0 ? saleTotal / runQty : 0,
            lineTotal: saleTotal,
          };
        })
        .filter((run) => run.qty > 0)
        .sort((a, b) => a.qty - b.qty);

      // Прорахунки без збережених тиражів (старі або ще не порахованi) далі
      // живуть на копії з quote_items — інакше позиція зникла б із КП.
      const runs: CommercialRunRow[] =
        runRows.length > 0
          ? runRows
          : [
              {
                id: `${row.id}-fallback`,
                qty: fallbackQty,
                unitPrice: fallbackUnitPrice,
                lineTotal: fallbackLineTotal,
              },
            ];
      const modelMeta = row.catalog_model_id ? modelById.get(row.catalog_model_id) : undefined;
      /**
       * ПОЗИЦІЯ ГОЛОВНІША ЗА МОДЕЛЬ, а не навпаки.
       *
       * Модель віддає один знімок на всі свої кольори, а позиція несе той, який
       * менеджер справді обрав. До 22.09.2026 перемагала модель — і на живому
       * прорахунку TS-0926-0029 «Записна книжка А5, Soft» їхала замовнику
       * фіолетовою, хоч у прорахунку стояла синя. Картка позиції весь час
       * малювала правильну: розходився саме документ.
       */
      const imageUrl = readVariantImage(row.metadata) || modelMeta?.imageUrl || "";
      const catalogPath = [
        row.catalog_type_id ? typeNameById.get(row.catalog_type_id) ?? "" : "",
        row.catalog_kind_id ? kindNameById.get(row.catalog_kind_id) ?? "" : "",
        modelMeta?.name ?? "",
      ]
        .filter(Boolean)
        .join(" / ");
      const placementSummary = parsePlacementSummary(
        row.methods,
        printPositionLabelById,
        row.print_position_id,
        row.print_width_mm,
        row.print_height_mm
      );
      return {
        id: row.id,
        position: typeof row.position === "number" ? row.position : index + 1,
        imageUrl,
        name: row.name?.trim() || "Без назви",
        catalogPath,
        description: row.description?.trim() || "",
        methodsSummary: parseMethodsSummary(row.methods, methodNameById),
        placementSummary,
        unit: normalizeUnitLabel(row.unit),
        runs,
      };
    });

    // Підсумок прорахунку — не число, а межі: тиражі всередині позиції
    // взаємовиключні, тож у позиції з кількома тиражами точної суми не існує.
    // Один тираж у всіх позицій ⇒ межі збігаються ⇒ звичайна сума.
    const itemsTotalRange = commercialSectionTotalRange(mappedItems);
    const quoteTotalFromSummary =
      typeof quoteRef.total === "number" && Number.isFinite(quoteRef.total) ? Number(quoteRef.total) : null;

    return {
      quoteId: quoteRef.id,
      quoteNumber: quoteRef.number ?? quoteRef.id.slice(0, 8),
      status: formatStatusLabel(quoteRef.status ?? null),
      createdAt: formatDateTime(quoteRef.createdAt),
      visualizations: visualizationsByQuoteId.get(quoteRef.id) ?? [],
      items: mappedItems,
      // На збережений quote_total відкочуємось лише коли цін немає зовсім.
      totalRange:
        itemsTotalRange.max > 0
          ? itemsTotalRange
          : { min: quoteTotalFromSummary ?? 0, max: quoteTotalFromSummary ?? 0 },
    };
  });

  // Прорахунки в документі складаються: це РІЗНІ товари, а межі кожного вже
  // враховані вище.
  const totalRange = sumMoneyRanges(sections.map((section) => section.totalRange));
  const now = new Date();
  const createdAt = params.createdAt
    ? new Date(params.createdAt).toLocaleDateString("uk-UA")
    : now.toLocaleDateString("uk-UA");

  return {
    title: params.title,
    customerName: cleanCustomerName(params.customerName),
    createdAt,
    generatedAt: formatDateTime(now.toISOString()),
    currency: "грн",
    sections,
    totalRange,
  };
}
