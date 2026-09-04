/**
 * Спільна мова імпорту ексельки (REQ-233): те, що функція `quote-import-parse`
 * повертає, і те, чим далі живе прев'ю на фронті.
 *
 * Типи лежать окремо від обох сторін навмисно: схема відповіді моделі описана
 * в функції, а форму читає браузер, і третього місця, де їх треба не забути
 * узгодити, бути не повинно.
 */

/**
 * Що саме в рядку файлу було брудним — беджі прев'ю ростуть звідси.
 *
 * Лишилась одна позначка (REQ-236). «Без ціни» й «спитати підрядника» пішли
 * разом із цінами: перша повідомляла про відсутність того, чого імпорт і не
 * бере, а друга ховала в бедж текст, який тепер їде в коментар.
 * «Альтернатива» перетворилась на `variantGroup` — зв'язок, а не позначку.
 */
export type QuoteImportFlag = "quantity_range";

/** Тираж, як його побачила модель. Цін тут немає: їх не витягує вже й функція. */
export type QuoteImportRun = {
  quantity: number;
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
  /**
   * Спільний ключ варіантів одного товару — номер позиції з файлу.
   *
   * У файлі KMZ під номером 30 лежать два різних дзен-сади з різними
   * посиланнями. Це не два товари, а вибір із двох, і прев'ю каже це словами:
   * «варіант 1 з 2». `null` — у позиції немає пари.
   */
  variantGroup?: string | null;
};

export type QuoteImportParseResponse = {
  items: QuoteImportItem[];
  /** Що модель не змогла розібрати — показуємо як є, не ховаємо. */
  warnings: string[];
  model: string;
  costUsd: number;
  fileName: string;
};

/**
 * Позиція в прев'ю: те саме, що прийшло, плюс правки менеджера.
 *
 * Тираж — це САМА КІЛЬКІСТЬ (REQ-235). Полів собівартості тут немає навмисно:
 * поки вони існували в чернетці, ціна з файлу мала куди доїхати.
 */
export type QuoteImportDraftRun = {
  key: string;
  quantity: number;
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
  /** Порядковий номер варіанта в межах групи — уже порахований, для підпису. */
  variant: { index: number; total: number } | null;
  /**
   * Позиція взята з каталогу (REQ-182#p14): модель, її вид і тип. Файл і
   * посилання дають `null` — там каталогу ще немає, і він з'явиться (якщо
   * з'явиться) уже після створення, фоновою розвідкою або рукою менеджера.
   */
  catalog: QuoteImportDraftCatalog | null;
  /**
   * Методи нанесення — id рядків `catalog_methods` виду (REQ-182#p16).
   * Порожньо = «Без нанесення», і це ЯВНИЙ стан, а не «ще не відповіли»:
   * так само порожні `methods` у базі читаються всіма як «без нанесення».
   * Місце й розмір тут не питаємо — вони лишаються в картці прорахунку.
   */
  methodIds: string[];
};

/** Прив'язка чернетки до каталогу: рівно те, що ляже в `quote_items.catalog_*_id`. */
export type QuoteImportDraftCatalog = {
  modelId: string;
  kindId: string;
  typeId: string;
  /** Підписи для рядка прев'ю — «Худі · Одяг», — щоб не ходити в базу вдруге. */
  kindName: string;
  typeName: string;
  imageUrl: string | null;
};

/** Слід імпорту на позиції — щоб відрізнити її на картці й дебажити розбір. */
export type QuoteImportTrace = {
  fileName: string;
  importedAt: string;
  sourceRows: number[];
};

/** Чим закінчилась розвідка посилання для прев'ю (REQ-236). */
export type QuoteImportLinkPreview =
  | { status: "pending" }
  | { status: "done"; imageUrl: string; title: string | null }
  | {
      status: "no_image" | "blocked" | "failed";
      reason: string;
      /** Назва буває й без фото: сторінка жива, просто без картинки. */
      title?: string | null;
    };
