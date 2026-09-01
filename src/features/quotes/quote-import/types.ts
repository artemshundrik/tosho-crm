/**
 * Спільна мова імпорту ексельки (REQ-233): те, що функція `quote-import-parse`
 * повертає, і те, чим далі живе прев'ю на фронті.
 *
 * Типи лежать окремо від обох сторін навмисно: схема відповіді моделі описана
 * в функції, а форму читає браузер, і третього місця, де їх треба не забути
 * узгодити, бути не повинно.
 */

/** Що саме в рядку файлу було брудним — беджі прев'ю ростуть звідси. */
export type QuoteImportFlag =
  | "price_missing"
  | "ask_supplier"
  | "quantity_range"
  | "alternative";

/** Тираж, як його побачила модель. Ціни необов'язкові: їх у файлі може не бути. */
export type QuoteImportRun = {
  quantity: number;
  unitPriceModel?: number | null;
  /** «(без ПДВ)» у тексті ціни → false, «з ПДВ» → true, мовчання → null. */
  modelPriceIncludesVat?: boolean | null;
  unitPricePrint?: number | null;
};

export type QuoteImportItem = {
  /** Рядки файлу, з яких зібрана позиція, — щоб було що показати менеджеру. */
  sourceRows: number[];
  name: string;
  comment?: string | null;
  links: string[];
  runs: QuoteImportRun[];
  flags: QuoteImportFlag[];
  notes?: string | null;
};

export type QuoteImportParseResponse = {
  items: QuoteImportItem[];
  /** Що модель не змогла розібрати — показуємо як є, не ховаємо. */
  warnings: string[];
  model: string;
  costUsd: number;
  fileName: string;
};

/** Позиція в прев'ю: те саме, що прийшло, плюс правки менеджера. */
export type QuoteImportDraftRun = {
  key: string;
  quantity: number;
  unitPriceModel: number;
  /** `null` — модель не побачила відповіді; менеджер дає її перемикачем. */
  modelPriceVat: "incl" | "excl" | null;
  unitPricePrint: number;
};

export type QuoteImportDraftItem = {
  key: string;
  selected: boolean;
  name: string;
  comment: string;
  links: string[];
  runs: QuoteImportDraftRun[];
  flags: QuoteImportFlag[];
  sourceRows: number[];
  notes: string | null;
};

/** Слід імпорту на позиції — щоб відрізнити її на картці й дебажити розбір. */
export type QuoteImportTrace = {
  fileName: string;
  importedAt: string;
  sourceRows: number[];
};
