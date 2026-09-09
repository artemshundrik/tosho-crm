/**
 * Реєстр постачальників, чиї товари лежать у пулі tosho.supplier_products.
 *
 * Тут — те, що НЕ змінюється від стану бази: як забираємо товари, яка
 * домовленість про ціну, що дає фід, чим особливий кабінет. Живі числа
 * (скільки рядків, коли оновлювалось) рахує suppliersStatus.ts зі зведення
 * бази — свідомо окремо, бо реєстр читається синхронно при першому кадрі.
 *
 * ДОДАЮЧИ ПОСТАЧАЛЬНИКА: запис сюди йде тим самим рухом, що й запис у
 * реєстр завантажувача (scripts/load-supplier-feed.mjs) і рядок у списку
 * джерел search_supplier_pool (scripts/supplier-pool-search.sql). Тест
 * suppliersCatalog.test.ts не дасть трьом файлам розійтись.
 *
 * `id` — ключ у завантажувачі й в адресі (/suppliers/totobi). Домен в адресу
 * не кладемо: крапка в останньому сегменті шляху для dev-сервера виглядає
 * як розширення файлу. `slug` — домен, ключ пулу (supplier_slug).
 */

export type SupplierId =
  | "totobi"
  | "bergamo"
  | "berrytex"
  | "avanprint"
  | "e-suvenir"
  | "toptime"
  | "papirus"
  | "eney";

/** Як приїжджають товари: файл фіда, обхід сторінок сайту або API під логіном. */
export type SupplierIntakeKind = "feed" | "crawl" | "api";
export type SupplierSchedule = "daily" | "weekly" | "manual";
/**
 * Звідки ціна на картці: `rule` — ціна сайту × множник із домовленості;
 * `account` — постачальник показує нашу ціну сам під логіном; `reference` —
 * лише довідкова, у пулі порожня (наш власний магазин); `retail` — роздріб.
 */
export type SupplierPriceBasis = "rule" | "account" | "reference" | "retail";

export type SupplierDefinition = {
  id: SupplierId;
  /** Домен — ключ пулу (`supplier_slug`); у запланованих — домен сайту. */
  slug: string;
  /** Латиницею, як на сайті постачальника; збігається з supplierDisplayName(slug). */
  name: string;
  siteUrl: string;
  /** Сторінка входу в кабінет. Облікові дані сюди не потрапляють ніколи. */
  cabinetUrl?: string;
  platform: string;
  /** Один рядок для картки: асортимент і бренди. */
  sells: string;
  intake: {
    kind: SupplierIntakeKind;
    summary: string;
    schedule: SupplierSchedule;
    scheduleNote: string;
  };
  price: {
    basis: SupplierPriceBasis;
    summary: string;
    /** ISO-дата домовленості; null — ставка ще не підтверджена або не потрібна. */
    agreedOn: string | null;
    vat?: string;
  };
  /**
   * Під яким акаунтом заходить завантажувач. Тут лише ІМЕНА змінних оточення —
   * самі пошта й пароль лежать у `.env.backup` поруч із BACKUP_DB_URL і в код
   * не потрапляють ніколи: репозиторій публічний, а секрет, що доїхав до
   * браузера, живе далі в бекапах, у кеші й у чужих стенограмах.
   */
  access?: { emailEnv: string; passwordEnv: string };
  gives: string[];
  lacks: string[];
  quirks: string[];
  inQuoteSearch: boolean;
  /** Чому поза пошуком — обов'язково, коли inQuoteSearch === false. */
  searchNote?: string;
  planned?: { since: string; blocker: string };
};

/**
 * Після скількох годин без прогону дані вважаємо застарілими. `manual` не старіє.
 *
 * 30 годин для денного розкладу — це «пропущено щонайменше два прогони поспіль».
 * Прогони йдуть о 10:00 і 17:00, тож найдовший нормальний розрив — 17 годин, а
 * GitHub до того ж спізнюється (фіксували 4 год 40 хв). Тому нижчий поріг ловив
 * би не поломку, а звичайне спізнення крона, і плашка «дані застаріли» швидко
 * стала б фоном, на який перестають дивитись.
 */
export const STALE_AFTER_HOURS: Record<SupplierSchedule, number | null> = {
  daily: 30,
  weekly: 8 * 24,
  manual: null,
};

export const SUPPLIER_FEEDS_RUNS_URL =
  "https://github.com/artemshundrik/tosho-crm/actions/workflows/supplier-feeds.yml";

export const SUPPLIER_INTAKE_LABEL: Record<SupplierIntakeKind, string> = {
  feed: "фід",
  crawl: "обхід сторінок",
  api: "API",
};

export const SUPPLIER_SCHEDULE_LABEL: Record<SupplierSchedule, string> = {
  daily: "двічі на день, о 10:00 і 17:00",
  weekly: "щотижня, у неділю о 06:30",
  manual: "руками",
};

export const SUPPLIER_PRICE_BASIS_LABEL: Record<SupplierPriceBasis, string> = {
  rule: "наша ціна за правилом",
  account: "постачальник каже нашу ціну сам",
  reference: "лише довідкова, не показуємо",
  retail: "роздріб із сайту",
};

export const SUPPLIER_DEFINITIONS: readonly SupplierDefinition[] = [
  {
    id: "totobi",
    slug: "totobi.com.ua",
    name: "Totobi",
    siteUrl: "https://totobi.com.ua/",
    platform: "CS-Cart",
    sells: "Одяг і сувенірка: Discover, Floyd, Gildan",
    intake: {
      kind: "feed",
      summary:
        "Відкритий YML-фід з їхньої сторінки опису вигрузок; логін не потрібен. У них оновлюється щогодини.",
      schedule: "daily",
      scheduleNote:
        "Перезалив двічі на день, о 10:00 і 17:00 за Києвом (GitHub Actions, supplier-feeds); узимку на годину раніше.",
    },
    price: {
      basis: "rule",
      summary:
        "Ціна сайту × множник: сувенірка −44%, одяг і головні убори −40%, статус «Єдина ціна» −50%.",
      agreedOn: "2026-09-08",
      vat: "Ціни у фіді з ПДВ, тому й наші з ПДВ.",
    },
    gives: [
      "артикул на кожен колір",
      "фото",
      "ціна",
      "колір",
      "група нанесення",
      "розміри з власними артикулами й цінами",
      "розділи",
    ],
    lacks: ["опис для документа (беремо з Avanprint)"],
    quirks: [
      "Картинки й адреси у фіді йдуть по http — підставляємо https, інакше браузер їх не покаже.",
      "У текстилю ціна лежить у розмірах, а не в товарі: це 43% фіда.",
      "Ціна на сайті публічна, не дилерська: без множника з реєстру це роздріб.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "bergamo",
    slug: "bergamo.ua",
    name: "Bergamo",
    siteUrl: "https://bergamo.ua/",
    platform: "OpenCart",
    sells: "Одяг і сувенірка: James Harvest, Printer, Voyager",
    intake: {
      kind: "crawl",
      summary:
        "Фіда немає (перевірено 08.09.2026). Перелік адрес — мапа сайту, дані — з 2 658 сторінок товарів; кольори моделі читаються з тієї самої сторінки.",
      schedule: "weekly",
      scheduleNote: "Обхід щотижня, у неділю о 06:30 за Києвом: пів години роботи й навантаження на чужий сайт.",
    },
    price: {
      basis: "rule",
      summary:
        "Ціна сайту × 0,525 (дилерська −47,5%): сайт сам показує її під нашим логіном поруч із закресленою публічною.",
      agreedOn: null,
    },
    gives: ["артикул", "назва", "бренд", "опис", "наявність", "ціна", "кольори з блоку моделі"],
    lacks: ["розділи", "методи нанесення", "фото в половини кольорів (4 941 із 10 076 рядків)"],
    quirks: [
      "Підтвердження від СЕО, що ставка стала, а не акція, ще немає: змінять цифру — ціни перераховуються одним UPDATE без обходу.",
      "Фото кольору виводиться за артикулом; частина кадрів на сайті названа інакше, і такі рядки лишаються без фото.",
      "Паралельні запити сайт придушує: обхід іде по чотири з паузою.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "berrytex",
    slug: "berrytex.com.ua",
    name: "Berrytex",
    siteUrl: "https://berrytex.com.ua/",
    cabinetUrl: "https://berrytex.com.ua/customer/account/login/",
    platform: "Magento",
    sells: "Текстиль і робочий одяг: JHK, Adler, Reis",
    intake: {
      kind: "feed",
      summary:
        "Публічний фід prom.xml дає товари з роздрібними цінами; далі завантажувач заходить у кабінет і з 74 сторінок товарів бере множник нашої ціни.",
      schedule: "daily",
      scheduleNote:
        "Перезалив двічі на день, о 10:00 і 17:00 за Києвом (GitHub Actions, supplier-feeds); узимку на годину раніше.",
    },
    price: {
      basis: "account",
      summary:
        "Наша ціна з кабінету: множник свій у кожного товару (0,60–0,72), тож єдиного правила немає — ціна фіда множиться на множник його сторінки.",
      agreedOn: null,
    },
    access: { emailEnv: "BERRYTEX_EMAIL", passwordEnv: "BERRYTEX_PASSWORD" },
    gives: ["артикул", "фото", "ціна", "виробник", "розділи"],
    lacks: ["методи нанесення", "характеристики"],
    quirks: [
      "Логін може відпасти посеред проходу, і сторінки почнуть віддавати роздріб; прогін зупиняє межа частки сторінок зі знижкою.",
      "Усі кольори одного товару ділять один артикул.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "avanprint",
    slug: "avanprint.ua",
    name: "Avanprint",
    siteUrl: "https://avanprint.ua/",
    cabinetUrl: "https://avanprint.ua/edit/",
    platform: "Хорошоп",
    sells: "Наш магазин: сувенірка й одяг, які продаємо самі",
    intake: {
      kind: "feed",
      summary: "Профіль експорту YML в адмінці Хорошопа з автогенерацією; адреса файлу містить хеш профілю.",
      schedule: "daily",
      scheduleNote:
        "Перезалив двічі на день, о 10:00 і 17:00 за Києвом (GitHub Actions, supplier-feeds); узимку на годину раніше.",
    },
    price: {
      basis: "reference",
      summary:
        "Ціна у фіді — наш роздріб, а не закупівля: у пулі порожня й на картках не показується. Закупівельна прийде парою з оптовиком (Totobi, Bergamo).",
      agreedOn: null,
    },
    gives: ["артикул", "кольори", "фото", "опис для документа", "розділи"],
    lacks: ["характеристики (у фіді лише колір і гарантія)", "закупівельна ціна", "методи нанесення"],
    quirks: [
      "Зникне файл — не вигадувати адресу, а взяти готову в адмінці у списку «Всі варіанти експорту».",
      "Колір зашитий у назву модифікації; ріжемо лише коли хвіст дослівно дорівнює параметру кольору.",
      "Роль у злитих картках: назва, опис і фото наші, ціна — оптовика.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "e-suvenir",
    slug: "e-suvenir.com.ua",
    name: "E-Suvenir",
    siteUrl: "https://e-suvenir.com.ua/ua",
    platform: "Magento PWA",
    sells: "Сувенірка й ручки: Sun Line, Mem'O!, Ritter Pen, Fruit of the Loom, Parker",
    intake: {
      kind: "api",
      summary:
        "GraphQL під нашим логіном; заголовок вітрини e_svnr_ukr обов'язковий — без нього акаунт «не існує». Фіда немає й бути не може: сайт віддає оболонку з кодом 200 на будь-яку адресу.",
      schedule: "daily",
      scheduleNote:
        "Перезалив двічі на день, о 10:00 і 17:00 за Києвом (GitHub Actions, supplier-feeds); узимку на годину раніше.",
    },
    price: {
      basis: "account",
      summary:
        "Постачальник віддає нашу ціну сам: типово −41%, записники Mem'O! −50%, розпродаж до −80%.",
      agreedOn: null,
    },
    access: { emailEnv: "E_SUVENIR_EMAIL", passwordEnv: "E_SUVENIR_PASSWORD" },
    gives: [
      "методи нанесення",
      "місця друку з розмірами в мм",
      "матеріал",
      "бренд",
      "щільність",
      "країна",
      "розміри й вага упаковки",
      "кольори",
      "розміри з власними кодами",
    ],
    lacks: [],
    quirks: [
      "468 товарів вітрини, не 863: сусідній магазин es.com.ua живе на тому самому Magento.",
      "Категорія «Печать» — прайс на нанесення, у пул не йде.",
      "Логін, що відпав, виглядає як норма: ціни просто стають публічними; прогін стереже частка рядків зі знижкою.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "toptime",
    slug: "toptime.com.ua",
    name: "Toptime",
    siteUrl: "https://toptime.com.ua/",
    platform: "власний рушій",
    sells: "Сувенірка (асортимент ще не розбирали)",
    intake: {
      kind: "crawl",
      summary: "Публічно лише мапа сайту; спосіб отримання цін не з'ясовано.",
      schedule: "manual",
      scheduleNote: "Ще не під'єднано.",
    },
    price: { basis: "retail", summary: "Ціни поки невідомі.", agreedOn: null },
    gives: [],
    lacks: [],
    quirks: [],
    inQuoteSearch: false,
    searchNote: "Ще не під'єднано.",
    planned: {
      since: "2026-09-05",
      blocker: "Потрібно з'ясувати, як віддають ціни: фіда немає, кабінету не бачили.",
    },
  },
  {
    id: "papirus",
    slug: "papirus-opt.com",
    name: "Papirus",
    siteUrl: "https://papirus-opt.com/",
    cabinetUrl: "https://www.papirus-opt.com/",
    platform: "власний B2B-портал",
    sells: "Канцтовари, школа й творчість, ділові подарунки: Optima, Schneider, Kores, Economix, Cool for School, Maxi",
    intake: {
      kind: "feed",
      summary:
        "Готова вигрузка з кабінету партнера: один XLS на 6 697 товарів. Публічно в них немає нічого — сайт це сторінка-візитівка, фідів за звичними адресами теж немає.",
      schedule: "daily",
      scheduleNote:
        "Перезалив двічі на день, о 10:00 і 17:00 за Києвом (GitHub Actions, supplier-feeds). Узимку на годину раніше: розклад у GitHub записаний в UTC.",
    },
    price: {
      basis: "account",
      summary:
        "Постачальник віддає нашу ціну сам, уже з акцією місяця й персональною пропозицією: типово −40% від РРЦ, акційні позиції до −50%.",
      agreedOn: null,
      vat: "Ціни в прайсі з ПДВ (Артем, 09.09.2026), тому й наші з ПДВ. Сам прайс і портал про це не кажуть ні слова — знання з договору.",
    },
    access: { emailEnv: "PAPIRUS_EMAIL", passwordEnv: "PAPIRUS_PASSWORD" },
    gives: ["артикул", "назва", "наша ціна", "РРЦ", "залишок", "пакування", "розділи", "фото", "посилання на товар"],
    lacks: ["колір", "методи нанесення", "бренд окремим полем (сидить у назві)", "опис"],
    quirks: [
      "Пароль видає їхній менеджер: самореєстрації немає, а неактивний акаунт віддає ту саму візитівку, що й гість.",
      "Прайс — старий формат Excel із кирилицею в CP1251: без таблиці кодувань назви мовчки стають кракозябрами, а ціни лишаються правильними.",
      "Фото в прайсі немає: ім'я файлу — внутрішній id товару, і мапа «артикул → id» збирається їхнім же пошуком. Обхід розділів тут не годиться — меню показує не весь каталог і впирається в 75% товарів.",
      "robots.txt забороняє обхід усього сайту, на відміну від Бергамо й Беррітекса; прайс під це не підпадає, бо кабінет віддає його нам самим.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "eney",
    slug: "eney.com.ua",
    name: "Eney",
    siteUrl: "https://eney.com.ua/",
    platform: "OpenCart",
    sells: "Сувенірна продукція",
    intake: {
      kind: "feed",
      summary:
        "Точка фіда google_base є, але віддає нуль байтів: вивантаження вимкнено в їхній адмінці. Мапа сайту без назв.",
      schedule: "manual",
      scheduleNote: "Ще не під'єднано.",
    },
    price: { basis: "retail", summary: "Ціни поки невідомі.", agreedOn: null },
    gives: [],
    lacks: [],
    quirks: [],
    inQuoteSearch: false,
    searchNote: "Ще не під'єднано.",
    planned: {
      since: "2026-09-05",
      blocker: "Просимо постачальника увімкнути вивантаження; для google_base потрібен свій розбір (Merchant XML, не YML).",
    },
  },
];

const BY_ID = new Map(SUPPLIER_DEFINITIONS.map((s) => [s.id as string, s]));
const BY_SLUG = new Map(SUPPLIER_DEFINITIONS.map((s) => [s.slug, s]));

export function supplierById(id: string): SupplierDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function supplierBySlug(slug: string): SupplierDefinition | null {
  return BY_SLUG.get(slug) ?? null;
}
