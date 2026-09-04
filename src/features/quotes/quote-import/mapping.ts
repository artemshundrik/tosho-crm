import type { QuoteRun } from "@/lib/toshoApi";

import { normalizeProductUrl } from "./productUrl";
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
 *
 * ІМПОРТ НЕ ПРИНОСИТЬ СОБІВАРТОСТІ (REQ-235). Модель і далі витягує з файлу
 * числа, але сюди вони не доходять: тираж їде самою кількістю, а вартість
 * товару, нанесення й логістику вписує в прорахунку той, чия це справа.
 * Причина не в правах, а в тому, що колонка ціни в клієнтській ексельці
 * означає будь-що: ціну постачальника, ціну з минулого замовлення, бажану ціну
 * клієнта. Одного разу вона доїхала в «нанесення» — тобто ціна товару стала ще
 * й ціною друку, і прорахунок вийшов удвічі дорожчим на рівному місці. Число,
 * сенсу якого ми не знаємо, у собівартості гірше за порожнє поле: порожнє
 * видно, а неправильне рахується далі як своє.
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
    // Рекламний хвіст зрізаємо ТУТ, до відсіювання дублів нижче: у файлі один
    // товар часто трапляється двічі з різними `gclid`, і без цього він двічі ж
    // і потрапляв у позицію як «різні» посилання.
    return normalizeProductUrl(url.toString());
  } catch {
    return null;
  }
}

function positiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Відповідь моделі → рядки прев'ю.
 *
 * Усе, що модель могла вигадати або зіпсувати, гаситься саме тут: нульові
 * тиражі, `javascript:` у посиланні, позиція без назви. Ціни відкидаються
 * цілком — не як «брудні дані», а свідомо (див. шапку модуля). Прев'ю має
 * показувати вже безпечні дані: менеджер підтверджує, а не вичищає.
 *
 * ВАРІАНТИ РАХУЮТЬСЯ ТУТ, а не в рендері. Модель віддає лише спільний ключ
 * (`variantGroup`), а «варіант 2 з 2» — похідне від усього списку, і рахувати
 * його всередині рендера означало б робити це на кожну перемальовку прев'ю з
 * тридцяти позицій.
 */
export function toDraftItems(items: QuoteImportItem[]): QuoteImportDraftItem[] {
  const groupSizes = new Map<string, number>();
  for (const item of items) {
    const group = (item.variantGroup ?? "").trim();
    if (!group) continue;
    groupSizes.set(group, (groupSizes.get(group) ?? 0) + 1);
  }
  const seenInGroup = new Map<string, number>();

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
        }));

      // Група з одного — це не вибір, а звичайна позиція: підпис «варіант 1 з 1»
      // нічого не пояснює, лише додає шуму в і без того щільний рядок.
      const group = (item.variantGroup ?? "").trim();
      const groupSize = group ? (groupSizes.get(group) ?? 0) : 0;
      let variant: QuoteImportDraftItem["variant"] = null;
      if (group && groupSize > 1) {
        const position = (seenInGroup.get(group) ?? 0) + 1;
        seenInGroup.set(group, position);
        variant = { index: position, total: groupSize };
      }

      return {
        key: `import-${index}`,
        selected: true,
        name,
        comment: (item.comment ?? "").replace(/\s+/g, " ").trim(),
        links,
        // Позиція без тиражу все одно потрібна: у файлі KMZ такі рядки є, і
        // менеджер дописує тираж руками вже в прорахунку.
        runs: runs.length > 0 ? runs : [{ key: `${index}-0`, quantity: 1 }],
        flags: Array.isArray(item.flags) ? item.flags : [],
        sourceRows: (item.sourceRows ?? []).filter((row) => Number.isFinite(row)).map((row) => Math.trunc(row)),
        notes: (item.notes ?? "").trim() || null,
        variant,
        catalog: null,
        // Артикула у файлі клієнта немає — його називає сторінка постачальника
        // (REQ-247), і він доїде розвідкою посилання, а не розбором таблиці.
        sku: null,
        imprints: [],
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

/** Слід позиції, яка прийшла не з файлу: посиланням, з каталогу чи просто назвою. */
export const DRAFT_ORIGIN_LABELS = {
  link: "за посиланням",
  catalog: "з каталогу",
  manual: "введено руками",
} as const;

/**
 * Звідки взялась чернетка — для сліду в `metadata.import.fileName`.
 *
 * У візарді всі джерела лежать одним списком (REQ-182#p14): поруч із рядками
 * файлу стоять товари за посиланням і з каталогу. Один спільний підпис на всіх
 * брехав би — «zapyt.xlsx» на позиції, яку вписали руками. Тому підпис іде від
 * самої чернетки: рядки файлу є лише в тієї, що з файлу.
 */
export function describeDraftOrigin(draft: QuoteImportDraftItem, fileName: string): string {
  if (draft.sourceRows.length > 0 && fileName) return fileName;
  if (draft.links.length > 0) return DRAFT_ORIGIN_LABELS.link;
  if (draft.catalog) return DRAFT_ORIGIN_LABELS.catalog;
  return DRAFT_ORIGIN_LABELS.manual;
}

/**
 * Рядок `quote_items`.
 *
 * `qty` береться з ПЕРШОГО тиражу — колонка позиції в нашій моделі це вітрина
 * («скільки»), а рахує ціну все одно `quote_item_runs` (docs/DB_MAP.md).
 * `unit_price` лишається нулем: це та сама собівартість, тільки збоку, і
 * імпорт її не приносить (REQ-235).
 *
 * Позиція з каталогу несе `catalog_*_id` (REQ-182#p14): саме через них її
 * бачать замовлення, КП, дизайн-задача й орієнтир накрутки — усі ті читачі,
 * які сліпі до `metadata.catalogVariant` посилання.
 *
 * Нанесення (REQ-182#p24) — тим самим рядком `{method_id, count, …}`, що пишуть
 * «Новий прорахунок» і картка позиції: пара «метод + місце» лягає одним
 * записом, розмір лишається порожнім (його питає ТЗ дизайн-задачі, не вікно).
 * Поруч із `print_position_id` пишемо `print_position_label`: id є не завжди —
 * рядок довідника міг не завестись, — а місце словами прочитають і КП, і
 * картка. Порожній список — `null`, як і в решти шляхів: «без нанесення»
 * у базі виглядає однаково, звідки б позиція не прийшла.
 */
export function buildImportItemPayload(input: QuoteImportItemPayloadInput): Record<string, unknown> {
  const { draft } = input;
  const firstRun = draft.runs[0];
  const qty = Math.max(1, firstRun?.quantity ?? 1);

  const metadata: Record<string, unknown> = {
    import: {
      fileName: describeDraftOrigin(draft, input.trace.fileName),
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
  // Артикул зі сторінки постачальника (REQ-247). Ключ `sku` вибрано не
  // випадково: картка позиції й картка на дошці читають саме його вже сьогодні,
  // тож «Артикул: …» з'являється без жодної зміни в тих читачах.
  const sku = draft.sku?.trim();
  if (sku) metadata.sku = sku;

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
    unit_price: 0,
    line_total: 0,
    catalog_type_id: draft.catalog?.typeId ?? null,
    catalog_kind_id: draft.catalog?.kindId ?? null,
    catalog_model_id: draft.catalog?.modelId ?? null,
    // Який саме колір продали (REQ-250#p1). До цієї колонки замовлення знало
    // лише модель, а постачальнику товар замовляють за артикулом кольору.
    catalog_variant_id: draft.catalog?.variantId ?? null,
    print_position_id: draft.imprints.find((imprint) => imprint.positionId)?.positionId ?? null,
    methods:
      draft.imprints.length > 0
        ? draft.imprints.map((imprint) => ({
            method_id: imprint.methodId,
            count: 1,
            print_position_id: imprint.positionId,
            print_position_label: imprint.positionLabel,
            print_width_mm: null,
            print_height_mm: null,
          }))
        : null,
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
 * Тиражі позиції — кількість і ставки прорахунку, більше нічого.
 *
 * Усі чотири поля собівартості йдуть нулями (REQ-235), а `unit_price_model_vat`
 * порожнім: позначка «з ПДВ чи без» описує суму, якої тут немає. Ставки —
 * не собівартість, а налаштування прорахунку, тож вони приходять як у будь-
 * якому новому тиражі.
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
    unit_price_model: 0,
    unit_price_model_vat: null,
    unit_price_print: 0,
    logistics_cost: 0,
    desired_manager_income: 0,
    markup_rate: input.defaults.markupRate,
    manager_rate: input.defaults.managerRate,
    fixed_cost_rate: input.defaults.fixedCostRate,
    vat_rate: input.defaults.vatRate,
    is_approved: false,
  }));
}
