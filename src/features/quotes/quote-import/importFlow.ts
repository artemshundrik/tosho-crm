import { insertCatalogModelRow, insertQuoteItemRow, persistQuoteRuns } from "@/features/quotes/quote-details/queries";
import { supabase } from "@/lib/supabaseClient";
import type { QuoteRun } from "@/lib/toshoApi";

import {
  buildImportItemPayload,
  buildImportRunPayloads,
  toDraftItems,
  type QuoteImportRunDefaults,
} from "./mapping";
import { buildSheetDump } from "./sheetDump";
import { QUOTE_IMPORT_MAX_FILE_BYTES, isSupportedImportFile, readWorkbookSheets } from "./readWorkbook";
import type { QuoteImportDraftItem, QuoteImportParseResponse } from "./types";

/**
 * Дві половини імпорту без інтерфейсу: розібрати файл у чернетки й записати
 * чернетки в прорахунок (REQ-237#p2).
 *
 * ЧОМУ ВИНЕСЕНО. Читачів стало два: вікно «Імпорт з файлу» в картці
 * прорахунку і вікно візарда, де ексель — одне з трьох джерел позицій поруч
 * із «руками» й «за посиланням». Спільне в них — не розмітка, а саме ця
 * логіка: як читається файл, у якому порядку пишуться позиції й тиражі, як
 * звучить помилка. Дублювати її означало б, що наступна поправка (як-от
 * «перша позиція пише тиражі одразу») доїде лише в одне з вікон.
 */

/** Стадії розбору — щоб вікно казало словами, що зараз відбувається. */
export type ImportParseStep = "read" | "model";

export type ImportParseOutcome =
  | { ok: true; drafts: QuoteImportDraftItem[]; warnings: string[]; fileName: string }
  | { ok: false; error: string; warnings: string[] };

export async function parseImportFile(
  file: File,
  options: { quoteId?: string | null; onStep?: (step: ImportParseStep) => void } = {}
): Promise<ImportParseOutcome> {
  if (!isSupportedImportFile(file.name)) {
    return { ok: false, error: "Підтримуються лише xlsx, xls, xlsm і csv.", warnings: [] };
  }
  if (file.size > QUOTE_IMPORT_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "Файл більший за 12 МБ — це вже не запит клієнта. Заберіть зайві аркуші.",
      warnings: [],
    };
  }

  try {
    options.onStep?.("read");
    const sheets = await readWorkbookSheets(file);
    const dump = buildSheetDump(sheets);
    if (dump.rowCount === 0) {
      return { ok: false, error: "У файлі немає жодного заповненого рядка.", warnings: [] };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Сесія застаріла — перезайдіть у CRM.");

    options.onStep?.("model");
    const response = await fetch("/.netlify/functions/quote-import-parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quoteId: options.quoteId ?? undefined, fileName: file.name, sheetDump: dump.text }),
    });
    const payload = (await response.json().catch(() => null)) as
      | (QuoteImportParseResponse & { error?: string })
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || `Розшифровка не вдалася (${response.status}).`);
    }

    const drafts = toDraftItems(payload?.items ?? []);
    const warnings = [...(payload?.warnings ?? [])];
    if (dump.truncated) {
      warnings.unshift("Файл завеликий — розібрано лише його початок.");
    }
    if (drafts.length === 0) {
      return {
        ok: false,
        error: "Модель не знайшла в файлі жодної позиції. Перевірте, чи це справді таблиця запиту.",
        warnings,
      };
    }
    return { ok: true, drafts, warnings, fileName: file.name };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Не вдалося прочитати файл.", warnings: [] };
  }
}

/**
 * Товар за посиланням → справжній рядок каталогу (REQ-182#p18).
 *
 * Вид у чернетки вже є (припущення з назви сторінки або вибір людини), а
 * моделі ще немає — заводимо її ТУТ, у мить «Створити», а не коли посилання
 * дочиталось: до натиску вікно не лишає в базі нічого, і каталог не виняток.
 * Рядок каталогу мінімальний: вид, назва, посилання постачальника в
 * `metadata.source`; фото доставить фонова розвідка, коли стисне картинку.
 *
 * Не вдалося — позиція лягає з видом, але без моделі: як і будь-яка інша
 * позиція без каталогу, вона від цього рахуватись не перестає.
 */
async function bindCatalogModel(draft: QuoteImportDraftItem, teamId: string): Promise<QuoteImportDraftItem> {
  const catalog = draft.catalog;
  if (!catalog || catalog.modelId || !draft.name.trim()) return draft;
  const supplierUrl = draft.links[0] ?? null;
  const inserted = await insertCatalogModelRow({
    team_id: teamId,
    kind_id: catalog.kindId,
    name: draft.name.trim().slice(0, 160),
    image_url: null,
    metadata: {
      source: { vendor: "link", url: supplierUrl, importedAt: new Date().toISOString() },
      ...(supplierUrl ? { supplierUrl } : {}),
    },
  });
  if (!inserted.ok) return draft;
  return { ...draft, catalog: { ...catalog, modelId: inserted.data.id, guessed: false } };
}

export type ImportWriteOutcome =
  | { ok: true; itemIds: string[] }
  | { ok: false; itemIds: string[]; error: string };

/**
 * Записати чернетки в прорахунок: позиції, потім тиражі.
 *
 * ПЕРША ПОЗИЦІЯ ПИШЕ ТИРАЖІ ОДРАЗУ, решта — гуртом наприкінці. Будь-яка
 * відмова на тиражах (RLS, зникла сесія, блокування картки) прилітала б
 * інакше ПІСЛЯ створення всіх позицій — і в прорахунку лишалось двадцять
 * п'ять товарів без жодного тиражу (побачено живим прогоном 01.09.2026).
 * Тепер найгірше, що буває, — одна зайва позиція. А решта одним записом, бо
 * двадцять п'ять окремих запитів на кожен клік «Створити» — це чверть
 * хвилини очікування без жодної користі.
 *
 * Запасного шляху «те саме, але без собівартості» тут немає навмисно: імпорт
 * шле самі нулі (REQ-235), а тригер прав на поля ціни лається лише на
 * НЕНУЛЬОВЕ значення в чужому полі — відмовляти базі нема на що.
 */
export async function writeDraftsToQuote(input: {
  drafts: QuoteImportDraftItem[];
  quoteId: string;
  teamId: string;
  nextPosition: number;
  runDefaults: QuoteImportRunDefaults;
  trace: { fileName: string; importedAt: string };
  /** Скільки позицій уже лягло — для лічильника на кнопці. */
  onSaved?: (count: number) => void;
}): Promise<ImportWriteOutcome> {
  const itemIds: string[] = [];
  const runPayloads: QuoteRun[] = [];

  const saveRuns = (runs: QuoteRun[]) => persistQuoteRuns(input.quoteId, runs, []);

  /** Позиції створені, тиражі — ні. Кажемо це прямо, а не самою помилкою бази. */
  const runsFailure = (message: string): ImportWriteOutcome => ({
    ok: false,
    itemIds,
    error: `Позиції створено (${itemIds.length}), а тиражі до них — ні. ${message.replace(/[.\s]*$/, "")}. Впишіть тиражі руками або приберіть позиції.`,
  });

  for (const [index, rawDraft] of input.drafts.entries()) {
    const itemId = crypto.randomUUID();
    const draft = await bindCatalogModel(rawDraft, input.teamId);
    const payload = buildImportItemPayload({
      draft,
      itemId,
      teamId: input.teamId,
      quoteId: input.quoteId,
      position: input.nextPosition + index,
      trace: input.trace,
    });
    const inserted = await insertQuoteItemRow(payload);
    if (!inserted.ok) {
      return { ok: false, itemIds, error: inserted.message };
    }
    const rowId = ((inserted.data as { id?: string } | null)?.id ?? itemId) as string;
    itemIds.push(rowId);
    input.onSaved?.(itemIds.length);
    const runs = buildImportRunPayloads({
      draft,
      quoteId: input.quoteId,
      quoteItemId: rowId,
      defaults: input.runDefaults,
    });

    if (index === 0) {
      const probe = await saveRuns(runs);
      if (!probe.ok) return runsFailure(probe.message);
      continue;
    }
    runPayloads.push(...runs);
  }

  if (runPayloads.length > 0) {
    const savedRuns = await saveRuns(runPayloads);
    if (!savedRuns.ok) return runsFailure(savedRuns.message);
  }

  return { ok: true, itemIds };
}

/**
 * Фонове дослідження лінків. Помилка тут нічого не скасовує: позиції вже
 * створені, а картинка з назвою — приємний додаток, без якого прорахунок
 * робиться так само.
 */
export async function startImportResearch(quoteId: string, itemIds: string[]) {
  if (itemIds.length === 0) return;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    await fetch("/.netlify/functions/quote-import-research-background", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quoteId, itemIds }),
    });
  } catch {
    // Мовчки: користувач про цей запит не просив, і сказати йому нічого.
  }
}
