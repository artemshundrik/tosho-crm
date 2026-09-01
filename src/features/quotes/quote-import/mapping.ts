import type { QuoteRun } from "@/lib/toshoApi";

import type {
  QuoteImportDraftItem,
  QuoteImportDraftRun,
  QuoteImportItem,
  QuoteImportTrace,
} from "./types";

/**
 * Міст між тим, що сказала модель, і тим, що піде в базу (REQ-233).
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. Запис роблять НАЯВНІ мутації картки прорахунку —
 * `insertQuoteItemRow` і `persistQuoteRuns`, під RLS користувача. Тут тільки
 * чиста підготовка payload'ів: усе, що можна перевірити тестом, а не оком на
 * живому прорахунку, де кожен клік — це запис у прод.
 */

/** Скільки посилань узагалі тримаємо на позиції. Більше — це вже не паспорт товару. */
const MAX_LINKS_PER_ITEM = 5;

/** Стеля тиражів однієї позиції: діапазон «300-500» дає два, решта — от́руєні дані. */
const MAX_RUNS_PER_ITEM = 6;

export function sanitizeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    // `javascript:` і `data:` у metadata — це збережений XSS у кнопці
    // «Постачальник», яка рендериться як звичайне посилання.
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function positiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * Відповідь моделі → рядки прев'ю.
 *
 * Усе, що модель могла вигадати або зіпсувати, гаситься саме тут: від'ємні
 * ціни, нульові тиражі, `javascript:` у посиланні, позиція без назви. Прев'ю
 * має показувати вже безпечні дані — менеджер підтверджує, а не вичищає.
 */
export function toDraftItems(items: QuoteImportItem[]): QuoteImportDraftItem[] {
  return items
    .map((item, index): QuoteImportDraftItem | null => {
      const name = (item.name ?? "").replace(/\s+/g, " ").trim();
      if (!name) return null;

      const links: string[] = [];
      for (const raw of item.links ?? []) {
        const url = sanitizeExternalUrl(raw);
        if (url && !links.includes(url)) links.push(url);
        if (links.length >= MAX_LINKS_PER_ITEM) break;
      }

      const runs: QuoteImportDraftRun[] = (item.runs ?? [])
        .slice(0, MAX_RUNS_PER_ITEM)
        .map((run, runIndex) => ({
          key: `${index}-${runIndex}`,
          quantity: Math.round(positiveNumber(run.quantity, 1)),
          unitPriceModel: nonNegativeNumber(run.unitPriceModel),
          modelPriceVat:
            run.modelPriceIncludesVat === true
              ? ("incl" as const)
              : run.modelPriceIncludesVat === false
                ? ("excl" as const)
                : null,
          unitPricePrint: nonNegativeNumber(run.unitPricePrint),
        }));

      return {
        key: `import-${index}`,
        selected: true,
        name,
        comment: (item.comment ?? "").replace(/\s+/g, " ").trim(),
        links,
        // Позиція без тиражу все одно потрібна: у файлі KMZ такі рядки є, і
        // менеджер дописує тираж руками вже в прорахунку.
        runs: runs.length > 0 ? runs : [{ key: `${index}-0`, quantity: 1, unitPriceModel: 0, modelPriceVat: null, unitPricePrint: 0 }],
        flags: Array.isArray(item.flags) ? item.flags : [],
        sourceRows: (item.sourceRows ?? []).filter((row) => Number.isFinite(row)).map((row) => Math.trunc(row)),
        notes: (item.notes ?? "").trim() || null,
      };
    })
    .filter((item): item is QuoteImportDraftItem => item !== null);
}

export type QuoteImportItemPayloadInput = {
  draft: QuoteImportDraftItem;
  itemId: string;
  teamId: string;
  quoteId: string;
  position: number;
  trace: Omit<QuoteImportTrace, "sourceRows">;
};

/**
 * Рядок `quote_items`.
 *
 * `qty`/`unit_price` беруться з ПЕРШОГО тиражу: колонки позиції в нашій моделі
 * — це вітрина («скільки й почім»), а рахує ціну все одно `quote_item_runs`
 * (docs/DB_MAP.md). Лишити їх нулями означало б порожню картку там, де в файлі
 * усе було.
 */
export function buildImportItemPayload(input: QuoteImportItemPayloadInput): Record<string, unknown> {
  const { draft } = input;
  const firstRun = draft.runs[0];
  const qty = Math.max(1, firstRun?.quantity ?? 1);
  const unitPrice = firstRun?.unitPriceModel ?? 0;

  const metadata: Record<string, unknown> = {
    import: {
      fileName: input.trace.fileName,
      importedAt: input.trace.importedAt,
      sourceRows: draft.sourceRows,
    } satisfies QuoteImportTrace,
  };
  if (draft.links.length > 0) {
    // Перше посилання — те, що відкриває наявна кнопка «Постачальник»; решта
    // лежить поруч, щоб нічого з файлу не загубилось.
    metadata.supplierUrl = draft.links[0];
    metadata.importLinks = draft.links;
  }

  return {
    id: input.itemId,
    team_id: input.teamId,
    quote_id: input.quoteId,
    position: input.position,
    name: draft.name,
    description: draft.comment || null,
    metadata,
    qty,
    unit: "шт.",
    unit_price: unitPrice,
    line_total: qty * unitPrice,
    catalog_type_id: null,
    catalog_kind_id: null,
    catalog_model_id: null,
    methods: null,
    attachment: null,
  };
}

export type QuoteImportRunDefaults = {
  markupRate: number;
  managerRate: number;
  fixedCostRate: number;
  vatRate: number;
};

/**
 * Тиражі позиції.
 *
 * `is_approved` завжди false: погоджений тираж — це рішення клієнта, а не факт
 * з ексельки, і частковий унікальний індекс «один погоджений на позицію» тут
 * ще й упав би на двох варіантах діапазону.
 */
export function buildImportRunPayloads(input: {
  draft: QuoteImportDraftItem;
  quoteId: string;
  quoteItemId: string;
  defaults: QuoteImportRunDefaults;
}): QuoteRun[] {
  return input.draft.runs.map((run) => ({
    quote_id: input.quoteId,
    quote_item_id: input.quoteItemId,
    quantity: Math.max(1, run.quantity),
    unit_price_model: run.unitPriceModel,
    unit_price_model_vat: run.modelPriceVat,
    unit_price_print: run.unitPricePrint,
    logistics_cost: 0,
    desired_manager_income: 0,
    markup_rate: input.defaults.markupRate,
    manager_rate: input.defaults.managerRate,
    fixed_cost_rate: input.defaults.fixedCostRate,
    vat_rate: input.defaults.vatRate,
    is_approved: false,
  }));
}

/**
 * Чи це відмова бази саме за посадою, а не будь-яка інша.
 *
 * ЗВІДКИ ВЗЯЛОСЬ. На `quote_item_runs` стоїть тригер: собівартість заповнює
 * менеджер або проєктний менеджер. Власник і СЕО в цей перелік не входять —
 * і саме вони частіше за всіх пробують імпорт. Раніше така відмова зупиняла
 * весь імпорт, і з тридцяти позицій у прорахунку лишалась одна: людина
 * втрачала всю роботу через право, якого їй і не потрібно.
 */
export function isCostPermissionError(message: string | null | undefined): boolean {
  return /собівартість заповнює/i.test(message ?? "");
}

/** Той самий тираж, але без жодної цифри собівартості — його база пропустить. */
export function stripRunCost(run: QuoteRun): QuoteRun {
  return {
    ...run,
    unit_price_model: 0,
    unit_price_model_vat: null,
    unit_price_print: 0,
    logistics_cost: 0,
  };
}

/**
 * Чи можна взагалі писати цей набір.
 *
 * Гейт ПДВ (REQ-232) стоїть на збереженні тиражу з ненульовою вартістю товару,
 * і мовчазний імпорт його б обійшов — тираж просто не зберігся б, а позиція
 * лишилась. Тому питаємо в прев'ю, ДО запису.
 */
export function findDraftsNeedingModelPriceVat(drafts: QuoteImportDraftItem[]): QuoteImportDraftItem[] {
  return drafts.filter(
    (draft) =>
      draft.selected &&
      draft.runs.some((run) => run.unitPriceModel > 0 && run.modelPriceVat === null)
  );
}
