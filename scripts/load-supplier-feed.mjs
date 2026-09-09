#!/usr/bin/env node
/**
 * Завантажити товарний фід постачальника в пул tosho.supplier_products
 * (REQ-250#p3, двигун агрегатора). Дизайн — docs/CATALOG_DESIGN.md §5/§5б.
 *
 * НАВІЩО ОКРЕМИЙ СКРИПТ, А НЕ РАЗОВИЙ ПАРСЕР. Фіди оновлюються (berrytex,
 * totobi — щодня), тож завантаження має бути ІДЕМПОТЕНТНИМ: ганяєш скільки
 * треба, рядок оновлюється за ключем (supplier_slug, external_key), а не
 * дублюється. Це той самий принцип, що в db-apply: одна транзакція, чесний слід.
 *
 * ЩО РОБИТЬ. Тягне фід постачальника → розбирає в рядки → COPY у тимчасову
 * таблицю → один upsert у пул. Зниклі з фіда товари гасяться is_active=false
 * (не видаляються — на них можуть посилатися старі прорахунки).
 *
 * ФІДА МОЖЕ Й НЕ БУТИ, І ТОДІ Є ДВА ЗАПАСНІ ШЛЯХИ. Перший — `crawl` у реєстрі:
 * скрипт бере з мапи сайту перелік адрес і обходить сторінки по одній
 * (bergamo), розбирач такої сторінки живе в `PAGE_PARSERS`. Другий — `api`:
 * джерело саме ходить по своєму інтерфейсу, без файлу й без мапи (e-suvenir,
 * Magento GraphQL), і такий завантажувач живе в `API_LOADERS`.
 *
 * ЩО СТЕРЕЖЕ ВІД ТИХОЇ БІДИ. Порожній або обірваний прогін НЕ МОЖНА заливати:
 * гасіння зниклих працює за часом, тож нуль рядків вимкнув би всього
 * постачальника, а виглядало б це як «постачальник зник із пошуку». Три
 * рубежі: `curl -f` (404 падає вголос), `maxFailRatio` в обході (частковий
 * обхід не доходить до запису) і `minRows` у реєстрі (нижня межа рядків).
 *
 * ЦІНА. За замовчуванням у пул лягає ціна вітрини як price_kind='retail'. Якщо
 * в постачальника є домовленість — вона стоїть у його записі реєстру полем
 * `priceRule`, і тоді в `price` лягає вже НАША ціна (price_kind='wholesale'), а
 * ціна сайту лишається поруч в `attrs.sitePrice`. Правило — дані, не код: щоб
 * змінити відсотки, правиш реєстр і переганяєш фід.
 *
 * ЧОГО НЕ РОБИТЬ. Не чіпає catalog_models (перевірений каталог).
 *
 * Запуск (потрібен BACKUP_DB_URL, як у db:apply):
 *   set -a; . ./.env.backup; set +a
 *   node scripts/load-supplier-feed.mjs berrytex
 *   node scripts/load-supplier-feed.mjs berrytex --dry   (показати, не писати)
 *   node scripts/load-supplier-feed.mjs bergamo --dry --limit=20  (коротка проба обходу)
 *   node scripts/load-supplier-feed.mjs --list           (перелік постачальників)
 *
 * Джерелам під логіном (e-suvenir, berrytex) потрібні ще й свої змінні — які
 * саме, написано в їхньому записі реєстру полем `auth`.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Папірус віддає прайс книжкою Excel, а не XML. Пакет уже в залежностях
// (SheetJS 0.20.3) — його ж читає розбір ексельок у прорахунках.
import * as XLSX from "xlsx";
/**
 * ТАБЛИЦЯ КОДУВАНЬ — НЕ ФАКУЛЬТАТИВНА, І САМЕ ТУТ. Прайс Папіруса — старий
 * формат BIFF, де кирилиця лежить у CP1251. Під `require()` SheetJS підвантажує
 * `cpexcel` сам, а в ESM — ні, і мовчки читає байти як Latin-1: «Швабра для
 * миття вікон» перетворюється на «Øâàáðà äëÿ ìèòòÿ â³êîí». Ціни, артикули й
 * залишки при цьому правильні, тож на око прогін виглядає здоровим — сміттям
 * стають самі назви, усі 6697. Знайдено 09.09.2026 на живому файлі.
 */
import * as cptable from "xlsx/dist/cpexcel.full.mjs";

XLSX.set_cptable(cptable);

const PSQL = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// Перелік параметрів рядка підключення, які вміємо передати через оточення.
// Стоїть тут, а не біля psql: фото-прохід читає базу ДО того місця, і на
// пізньому `const` спіткнувся б об тимчасову мертву зону.
const PG_PARAMS = { sslmode: "PGSSLMODE", options: "PGOPTIONS", connect_timeout: "PGCONNECT_TIMEOUT", application_name: "PGAPPNAME" };

/**
 * Реєстр постачальників. Додати нового — рядок сюди, а не новий скрипт.
 * slug — домен (ключ прив'язки до contractors.website і до пулу).
 * format — як розбирати: 'prom' (YML/Prom.ua XML) поки єдиний.
 */
const SUPPLIERS = {
  berrytex: {
    slug: "berrytex.com.ua",
    feed: "https://berrytex.com.ua/prom.xml",
    format: "prom",
    source: "feed:prom",
    minRows: 1600, // у фіді 2083 (08.09.2026)
    // ЦІНА ФІДА ТУТ РОЗДРІБНА, А НАША ЛЕЖИТЬ ЗА ЛОГІНОМ — І ЦЕ НЕ ПРАВИЛО,
    // А ЧИСЛО З КАБІНЕТУ. Знижка не одна на весь каталог (заміряно 09.09.2026
    // на десяти товарах різних брендів): вісім дали множник 0,625, кепка
    // Reis 6P — 0,72, жилет Moontex — 0,60. `priceRule`, як у Тотобі, поставив
    // би трьом товарам з десяти чужу ціну, а помітили б це вже на погодженні.
    //
    // Зате ВСЕРЕДИНІ товару множник сталий: 54 кольори на п'яти товарах дали
    // розкид 0,6247–0,6276, і весь він від округлення сайту до цілих гривень.
    // Тому ходимо не по 2071 рядку, а по 74 сторінках товару: беремо множник
    // сторінки й множимо на копійчані ціни фіда. Сторінка сама точних копійок
    // не знає — вона показує гривні.
    auth: { emailEnv: "BERRYTEX_EMAIL", passwordEnv: "BERRYTEX_PASSWORD" },
    accountPricing: {
      loginPage: "https://berrytex.com.ua/customer/account/login/",
      loginPost: "https://berrytex.com.ua/customer/account/loginPost/",
      accountPage: "https://berrytex.com.ua/customer/account/",
      concurrency: 4,
      delayMs: 250,
      // Частка СТОРІНОК, де множник справді нижчий за роздріб. Логін може
      // відпасти посеред проходу, і тоді сторінки почнуть віддавати роздріб:
      // рядки на місці, виглядають нормально, просто дорожчі в півтора раза.
      // Той самий рубіж, що `minDiscountedRatio` в Е-Сувеніра.
      minDiscountedRatio: 0.8,
      // Частка РЯДКІВ, які дістали множник своєї сторінки. Решта лишається без
      // ціни (див. нижче), і якщо таких більше десятої частини — це вже не
      // «кілька сторінок не відповіли», а зламаний прохід.
      minCoverage: 0.9,
    },
    priceKind: "wholesale",
  },
  avanprint: {
    slug: "avanprint.ua",
    // Профіль вивантаження в адмінці Хорошопа (Товари → Експорт → YML, валюта
    // UAH, автогенерація «Так»), заведений 08.09.2026. До нього тут стояла мапа
    // сайту: вона давала лише назву й фото — 1851 рядок БЕЗ артикула, ціни й
    // кольору. Профіль дає 10234 пропозиції, кожна модифікація окремим рядком
    // зі своїм vendorCode і своєю ціною.
    //
    // Адреса непостійна: Хорошоп зашиває в неї хеш профілю. Зникне файл —
    // не вигадуй нову адресу, а візьми готову в адмінці, у списку «Всі варіанти
    // експорту» (avanprint.ua/adminLegacy/data.php?handler=261).
    feed: "https://avanprint.ua/content/export/c15ef418f98917515ed67a4f4bb26657.xml",
    format: "horoshop",
    source: "feed:horoshop",
    minRows: 8000, // у фіді 10234 (08.09.2026)
    // ЦІНА АВАНПРИНТА — НЕ ЦІНА, А ДОВІДКА. avanprint.ua це наша власна
    // вітрина, і число у фіді — наш РОЗДРІБ. Купуємо ми не в себе: товар
    // береться в постачальників (Артем, 08.09.2026), тож рахувати
    // собівартість від власної вітрини не можна — вийде накрутка на накрутку.
    //
    // Тому роздріб лягає в `attrs.sitePrice` (є з чим звіряти й видно, коли
    // ціна на сайті поїхала), а `price` лишається порожнім. Фактична ціна
    // прийде звідти ж, звідки товар, — парою «позиція Аванпринта → позиція
    // постачальника», за правилом того постачальника (Тотобі −44/−40/−50%).
    // До підтвердження пари чесніше не показувати ціни взагалі, ніж показати
    // чужу: порожнє поле менеджер помітить, а неправильне число — ні.
    priceIsReference: true,
  },
  bergamo: {
    slug: "bergamo.ua",
    // Мапа сайту тут — не фід, а ПЕРЕЛІК АДРЕС: назви, ціни й фото беруться зі
    // сторінок товарів (`crawl` нижче). Фіда в Бергамо немає, і це перевірено,
    // а не припущено (08.09.2026): prom.xml, yml.xml, google.xml,
    // route=feed/*, extension/feed/yandex_yml — 404; extension/feed/google_base
    // віддає 200 і нуль байтів; extension/feed/google_sitemap — та сама мапа.
    // В акаунті «Файли для завантаження» порожні, checkout/cart/export віддає
    // xlsx самого кошика. Сторінки опису вигрузок, як у Тотобі, у них немає.
    feed: "https://bergamo.ua/sitemap.xml",
    format: "opencart-page",
    source: "crawl:opencart",
    // Обхід сторінок замість одного файлу. `index` каже, як дістати перелік
    // адрес із мапи; далі кожна адреса тягнеться окремо.
    crawl: { index: "sitemap-sku", concurrency: 4, retries: 1, delayMs: 250, maxFailRatio: 0.05 },
    minRows: 2100, // у мапі 2658 (08.09.2026)
    // ДИЛЕРСЬКА ЦІНА = ЦІНА САЙТУ × 0,525 (−47,5%). Заміряно 08.09.2026 на 10
    // товарах із різних розділів — сувенірка, одяг, робочий одяг, термокружки,
    // від 35 до 21 000 грн: коефіцієнт СКРІЗЬ однаковий, поділу за категоріями
    // немає (на відміну від Тотобі). Це не оцінка й не домовленість зі слів:
    // Бергамо сама показує цю ціну під нашим логіном, поруч із закресленою
    // публічною.
    //
    // `agreedOn: null` — саме тому, що підтвердження «ставка стала, а не акція»
    // від СЕО ще немає (питання відкрите з 08.09.2026). Коли назвуть іншу
    // цифру — правиш множник, і ціни перераховуються з `attrs.sitePrice`
    // одним UPDATE, без повторного обходу 2658 сторінок:
    //   update tosho.supplier_products
    //      set price = round((attrs->>'sitePrice')::numeric * <множник>, 2)
    //    where supplier_slug = 'bergamo.ua' and attrs ? 'sitePrice';
    priceRule: {
      agreedOn: null,
      rules: [{ multiplier: 0.525, label: "дилерська −47,5%" }],
    },
  },
  totobi: {
    slug: "totobi.com.ua",
    // Адреса взята зі сторінки totobi.com.ua/opis-vigruzok/ — постачальник
    // публікує її сам. Ключ у ній не наш і не секретний: фід відкритий, логін
    // не потрібен. 05.09.2026 я записав «ні фіда, ні мапи — усе 404»: шукав
    // /sitemap.xml і /prom.xml, а вивантаження в CS-Cart живе під dispatch.
    feed: "https://totobi.com.ua/index.php?dispatch=yml.get&access_key=lg3bjy2gvww",
    format: "cscart",
    source: "feed:cscart",
    minRows: 2500, // у фіді 3150 (08.09.2026)
    // Фід віддає адреси картинок і товарів через http, хоч сайт працює по https
    // (перевірено: та сама картинка по https віддає 200). На проді ми під https,
    // тож http-картинка — це mixed content, який браузер просто НЕ покаже.
    forceHttps: true,
    // НАША ЦІНА = ЦІНА САЙТУ × МНОЖНИК. Домовленість із Тотобі, підтверджена
    // 08.09.2026: сувенірка −44%, одяг −40%, а де стоїть статус «Єдина ціна» —
    // стандартний прайс 50% від сайту. Правило лежить ТУТ, а не в коді розбору:
    // зміняться відсотки — правиш три числа й переганяєш фід (він однаково
    // оновлюється щогодини).
    //
    // Порядок важливий: «Єдина ціна» б'є категорію. З 1353 товарів розділу
    // «Одяг» 606 мають саме її, і за категорією вони отримали б −40% замість
    // −50%. Останнє правило без `when` — це «все інше».
    //
    // Ціни у фіді з ПДВ, тому й наші з ПДВ (Артем, 08.09.2026).
    priceRule: {
      agreedOn: "2026-09-08",
      rules: [
        { when: { priceType: "Єдина ціна" }, multiplier: 0.5, label: "єдина ціна −50%" },
        // Головні убори Артем відніс до одягу (08.09.2026) — 288 товарів.
        { when: { section: ["Одяг", "Головні убори"] }, multiplier: 0.6, label: "одяг −40%" },
        { multiplier: 0.56, label: "сувенірка −44%" },
      ],
    },
  },
  "e-suvenir": {
    slug: "e-suvenir.com.ua",
    // ФІДА НЕМАЄ, І ПЕРЕВІРЕНО ЦЕ ІНАКШЕ, НІЖ У РЕШТИ. Сайт — Magento PWA
    // Studio: React поверх Magento, і будь-яка невідома адреса віддає оболонку
    // з кодом 200. Тобто /sitemap.xml, /prom.xml, /google.xml тут «є» — усі
    // віддають ту саму HTML-сторінку на 2312 байтів. Зате під оболонкою
    // відкритий GraphQL, яким ходить сам їхній магазин.
    api: {
      endpoint: "https://e-suvenir.com.ua/graphql",
      // Вітрина, якою працює сам магазин. Не плутати з типовою `esouv_ukr`:
      // це РІЗНІ website (2 і 1), і акаунт живе на другому — див. `Store` у gql.
      store: "e_svnr_ukr",
      // Адреса товару — з `url_key`, і префікс `/ua/` обов'язковий: без нього
      // сторінка віддає 301 на головну (перевірено 08.09.2026).
      site: "https://e-suvenir.com.ua/ua",
      rootCategory: "2",
      pageSize: 50,
      delayMs: 250,
      // Категорія «Печать» — це прайс на нанесення (УФ друк, тиснення,
      // деколь), а не товари. Корисна сама по собі, але не в пулі товарів.
      skipCategories: ["Печать"],
      // Частка рядків, де наша ціна нижча за публічну. Заміряно 08.09.2026:
      // майже все джерело йде зі знижкою, тож просідання нижче межі означає
      // не «постачальник підняв ціни», а «логін відпав».
      minDiscountedRatio: 0.8,
    },
    format: "magento-graphql",
    source: "api:magento",
    // Логін обов'язковий для заливу: без нього API віддає публічні ціни, і
    // вони лягли б у пул під підписом «оптова». Пошта й пароль — у .env.backup,
    // поруч із BACKUP_DB_URL; сюди потрапляють лише ІМЕНА змінних.
    auth: { emailEnv: "E_SUVENIR_EMAIL", passwordEnv: "E_SUVENIR_PASSWORD" },
    // Ціна тут не рахується правилом — постачальник каже її прямо, тому
    // `priceRule` немає, а підпис доводиться ставити руками.
    priceKind: "wholesale",
    // 468 товарів вітрини `e_svnr_ukr` дають 1229 рядків-кольорів (08.09.2026).
    // Не плутати з 863 товарами сусідньої вітрини `esouv_ukr` (es.com.ua,
    // Євросувенір): той самий Magento, інший website і інший магазин.
    minRows: 950,
  },
  papirus: {
    slug: "papirus-opt.com",
    // ЄДИНЕ НАШЕ ДЖЕРЕЛО, ДЕ ПОСТАЧАЛЬНИК САМ КЛАДЕ НАМ ФАЙЛ. Публічно в
    // Папіруса немає нічого: сайт — сторінка-візитівка, prom.xml / yml.xml /
    // sitemap.xml усі 404, а robots.txt каже `Disallow: /` геть усім (на
    // відміну від Бергамо й Беррітекса, які закривають лише окремі шляхи).
    // Зате в кабінеті партнера лежить готова вигрузка — один XLS на 1,19 МБ,
    // аркуш `Price`, 6697 товарів. Тобто прайс — це не обхід чужого сайту, а
    // файл, який нам віддають; обхід тут лише за фото (`photos` нижче).
    api: {
      loginPage: "https://www.papirus-opt.com/",
      loginPost: "https://www.papirus-opt.com/auth/",
      // Сторінка, куди кабінет кидає після входу. Її ж перевіряємо як доказ
      // сесії: без логіна будь-яка адреса віддає ту саму візитівку з кодом 200.
      homePage: "https://www.papirus-opt.com/promo/",
      priceUrl: "https://www.papirus-opt.com/cabinet/pricelist/",
      site: "https://www.papirus-opt.com",
      /**
       * ФОТО В ПРАЙСІ НЕМАЄ, І ВИВЕСТИ ЙОГО З АРТИКУЛА НЕ ВИЙДЕ. Ім'я файлу —
       * це внутрішній id товару (`/img/goods/6704.jpg`), і він же адреса
       * картки (`/categories/view/6704/`). Тобто одна мапа «артикул → id»
       * закриває і фото, і посилання.
       *
       * Збираємо її ЇХНІМ ЖЕ ПОШУКОМ (`/sphinx/find/`), а не обходом розділів:
       * чому саме так — довго розписано над `attachPapirusPhotos`, коротко —
       * меню показує не весь каталог, і обхід упирається в 75,6%.
       *
       * Самі картинки ПУБЛІЧНІ: `/img/goods/{id}.jpg` віддається без куки
       * (перевірено 09.09.2026 — 200, JPEG 1000×701). Тому в CRM вони просто
       * покажуться, класти їх до себе не треба.
       */
      photos: { concurrency: 4, delayMs: 250, minCoverage: 0.9 },
    },
    format: "xls-price",
    source: "cabinet:xls",
    // Пошта й пароль — у .env.backup поруч із BACKUP_DB_URL; сюди потрапляють
    // лише ІМЕНА змінних. Пароль тут видає їхній менеджер: самореєстрації немає.
    auth: { emailEnv: "PAPIRUS_EMAIL", passwordEnv: "PAPIRUS_PASSWORD" },
    // ЦІНА ВЖЕ НАША, І ЦЕ ПЕРЕВІРЕНО, А НЕ ПРИПУЩЕНО. 09.09.2026 звірив 12
    // товарів із тим, що портал показує під нашим логіном: лампа O74015 на
    // сайті «285.53 → 228.42» (−20% від базової), у прайсі рівно 228.42;
    // ручка E10240-14 в акції −50% на сайті 2.76, у прайсі 2.76. Збіглися всі
    // дванадцять, разом з акцією місяця й персональною пропозицією. Тому ні
    // priceRule, ні accountPricing тут не потрібні — як у Е-Сувеніра.
    priceKind: "wholesale",
    // У прайсі 6697 товарів (09.09.2026). Межа з запасом: сесія, що відпала,
    // дає не «мало рядків», а HTML замість XLS — і падає раніше, на типі файлу.
    minRows: 5500,
  },
  // НЕ ДОДАНИЙ, і причина в ньому, а не в коді (перевірено 05.09.2026):
  //   eney (OpenCart) — точка фіда index.php?route=extension/feed/google_base
  //                     віддає 200 і НУЛЬ байт: розширення є, фід вимкнено в
  //                     їхній адмінці. Мапа є, але без назв — самі адреси.
  // Досить, щоб постачальник увімкнув вивантаження в себе; тоді сюди лягає
  // рядок, а для google_base — ще й свій розбір (це Merchant XML, не YML).
};

const args = process.argv.slice(2);
if (args.includes("--list") || args.length === 0) {
  console.log("Постачальники:", Object.keys(SUPPLIERS).join(", ") || "(порожньо)");
  if (args.length === 0) process.exit(1);
  process.exit(0);
}
const dry = args.includes("--dry");
// `--limit N` — коротка пробіжка обходом, щоб подивитись, що взагалі
// розбирається, не тягнучи 2658 сторінок. ЗАПИС ІЗ НЕЮ ЗАБОРОНЕНИЙ: неповний
// набір рядків погасив би весь решту каталогу постачальника як «зниклий».
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? args[args.indexOf(limitArg) + 1], 10) : 0;
if (limitArg && (!Number.isFinite(limit) || limit <= 0)) {
  console.error("--limit чекає додатне число: --limit=20");
  process.exit(1);
}
if (limit && !dry) {
  console.error("--limit можна лише разом із --dry: неповний обхід, залитий у базу, погасить решту каталогу.");
  process.exit(1);
}
const key = args.find((a) => !a.startsWith("--") && a !== String(limit));
const cfg = SUPPLIERS[key];
if (!cfg) {
  console.error(`Немає постачальника «${key}». Доступні: ${Object.keys(SUPPLIERS).join(", ")}`);
  process.exit(1);
}

const dbUrl = process.env.BACKUP_DB_URL || "";
if (!dbUrl && !dry) {
  console.error("Немає BACKUP_DB_URL. Підвантажте: set -a; . ./.env.backup; set +a");
  process.exit(1);
}

// ── розбір ──────────────────────────────────────────────────────────────────
function unesc(s) {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

function parseProm(xml) {
  // Ціни тут роздрібні: наша лежить за логіном і приїжджає окремим проходом
  // (`applyAccountPricing`), а не правилом.
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const attrsStr = m[1];
    const b = m[2];
    const idm = attrsStr.match(/\bid="([^"]+)"/);
    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => p[1].trim());
    const name = tag(b, "name");
    if (!name) continue;
    rows.push({
      external_key: idm ? idm[1] : tag(b, "url"),
      article: tag(b, "code") || null,
      name,
      vendor: tag(b, "vendor") || null,
      category: cats[tag(b, "categoryId")] || null,
      price: tag(b, "price") || null,
      currency: tag(b, "currencyId") || "UAH",
      url: tag(b, "url") || null,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
    });
  }
  return rows;
}

/**
 * Точна пара тегів, без атрибутів. Навмисно НЕ `tag()`: той бере `<price[^>]*>`
 * і в CS-Cart чіпляє `<price_type>Базова ціна</price_type>`, який стоїть ВИЩЕ
 * за `<price>`. Ціна тоді дорівнює рядку «Базова ціна» — і мовчки стає null
 * при `::numeric`. Видно лише на живому фіді, тому окремий помічник.
 */
function exactTag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

function param(block, name) {
  const m = block.match(new RegExp(`<param name="${name}">([\\s\\S]*?)</param>`));
  return m ? unesc(m[1].trim()) : "";
}

/**
 * CS-Cart YML (totobi). Багатший за prom-фід, і дві його особливості визначають
 * усе інше в цьому розборі.
 *
 * 1. КОЛІР — ОКРЕМИЙ ТОВАР. 3150 пропозицій на 679 назв: кожен колір має свій
 *    `vendorCode`, за яким його й замовляють. Тому рядок у пулі — колір, а не
 *    «модель»; згортає їх назад у одну картку вже читальний шар (supplierPool).
 *
 * 2. У ТЕКСТИЛЮ ЦІНА НЕ В `<price>`. У 1367 товарів там 0.00, а справжня ціна
 *    лежить в атрибуті `modifier` кожного розміру (у розмірів і свої артикули).
 *    Беремо мінімальну з них — це ціна найдешевшого розміру, і саме її бачить
 *    менеджер на сайті. Без цього кроку ціну втратили б у 43% фіда.
 *
 * `attrs` несе те, чого в колонках пулу немає, але шкода загубити до наступного
 * заливу: колір, групу нанесення (у фіді вона заповнена в 3142 з 3150 — це те,
 * що в нашому каталозі досі виколупується з описів) і розміри з їхніми кодами.
 */
function applyPriceRule(rule, price, ctx) {
  if (!rule || price == null) return { price, label: null };
  for (const item of rule.rules) {
    const when = item.when;
    if (when) {
      if (when.priceType && when.priceType !== ctx.priceType) continue;
      if (when.section && !when.section.includes(ctx.section)) continue;
    }
    // Округлення до копійки: множення на 0.56 дає хвости на 12 знаків, а ціна
    // з такими хвостами лізе в документи й у порівняння «ціна не змінилась».
    return { price: Math.round(price * item.multiplier * 100) / 100, label: item.label };
  }
  return { price, label: null };
}

function parseCscart(xml, cfg) {
  const secure = (value) => (cfg.forceHttps && value ? value.replace(/^http:\/\//i, "https://") : value);
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const b = m[2];
    const name = exactTag(b, "name");
    if (!name) continue;

    const sizes = [...b.matchAll(/<size\b([^>]*)>([\s\S]*?)<\/size>/g)].map((s) => ({
      size: unesc(s[2].trim()),
      code: (s[1].match(/\bproduct_code="([^"]*)"/) || [])[1] || null,
      price: num((s[1].match(/\bmodifier="([^"]*)"/) || [])[1]),
    }));

    const sitePrice = num(exactTag(b, "price")) ?? sizes.map((s) => s.price).filter(Boolean).sort((a, z) => a - z)[0] ?? null;
    // «Базова ціна» і порожній тип — те саме відро (Артем, 08.09.2026).
    const priceType = exactTag(b, "price_type") || "Базова ціна";
    const section = param(b, "Розділ у каталозі");
    const ruled = applyPriceRule(cfg.priceRule, sitePrice, { priceType, section });
    const price = ruled.price;
    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => secure(p[1].trim()));
    const attrs = {};
    // «Група Кольорів» — запасний варіант, а не синонім: вона грубша («Сірий»
    // замість «ash grey»), зате стоїть там, де точного кольору постачальник не
    // вказав. Без неї частина карток лишилась би з безіменними варіантами.
    const color = param(b, "Колір") || param(b, "Група Кольорів");
    const methods = param(b, "Група нанесення");
    if (color) attrs.color = color;
    if (methods) attrs.methods = methods;
    // Ціну сайту тримаємо поруч навмисно. Показуємо в пошуку тільки нашу (так
    // просив Артем — «не засмічувати»), але без вихідної цифри неможливо ні
    // перевірити правило, ні побачити, що постачальник підняв ціну.
    if (ruled.label) {
      attrs.sitePrice = sitePrice;
      attrs.priceRule = ruled.label;
    }
    attrs.priceType = priceType;
    if (section) attrs.section = section;
    if (sizes.length) {
      attrs.sizes = sizes.map((s) => ({
        ...s,
        price: applyPriceRule(cfg.priceRule, s.price, { priceType, section }).price,
      }));
    }

    rows.push({
      external_key: (m[1].match(/\bid="([^"]+)"/) || [])[1] || exactTag(b, "url"),
      article: exactTag(b, "vendorCode") || null,
      name,
      vendor: param(b, "ТМ") || null,
      category: cats[exactTag(b, "categoryId")] || null,
      price,
      currency: exactTag(b, "currencyId") || "UAH",
      url: secure(exactTag(b, "url")) || null,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
      attrs: JSON.stringify(attrs),
    });
  }
  return rows;
}

/**
 * Мапа сайту з картинками (avanprint). Дає назву, фото й адресу — але НЕ дає
 * ціни й артикула: вони на сторінках за анти-бот захистом, і чистий шлях до них
 * — експорт з адмінки (docs/CATALOG_DESIGN.md §6а). Для пошуку агрегатора назви
 * й фото вже корисні: менеджер бачить, що така річ у нас є, і відкриває її.
 */
function parseSitemap(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const b = m[1];
    const loc = b.match(/<loc>([^<]+)<\/loc>/);
    if (!loc) continue;
    const url = loc[1].trim();
    if (url.includes("/en/")) continue; // англійський дубль тієї ж картки
    const pics = [...b.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((p) => p[1].trim());
    const titleMatch = b.match(/<image:title><!\[CDATA\[([\s\S]*?)\]\]><\/image:title>/);
    const name = titleMatch ? unesc(titleMatch[1]) : "";
    if (!name) continue; // без назви рядок у пошуку марний
    rows.push({
      external_key: url,
      article: null,
      name,
      vendor: null,
      category: null,
      price: null,
      currency: "UAH",
      url,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
    });
  }
  return rows;
}

/**
 * Мапа, у якій немає ні назв, ні фото, зате АДРЕСА товару — це його артикул
 * (bergamo: bergamo.ua/V3447-03). Такий рядок не знайдеться за назвою, але
 * знайдеться за кодом — а артикул вставляють не рідше, ніж набирають назву.
 *
 * Назвою ставимо сам артикул: у базі поле not null, а вигадувати назву з коду
 * означало б показати менеджеру те, чого постачальник не казав.
 */
function parseSitemapSku(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1].trim();
    const slug = url.replace(/\/+$/, "").split("/").pop() || "";
    // Артикул — це код, а не слово: цифри в ньому обов'язкові. Так відсіюються
    // сторінки на кшталт /about, /catalog і головна.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*$/.test(slug)) continue;
    rows.push({
      external_key: url,
      article: slug,
      name: slug,
      vendor: null,
      category: null,
      price: null,
      currency: "UAH",
      url,
      image_url: null,
      images: "[]",
    });
  }
  return rows;
}

/**
 * Хорошоп (avanprint) — YML із профілю вивантаження. Формат близький до
 * prom-фіда, але три речі відрізняють його настільки, що спільний розбирач
 * вийшов би плутанішим за окремий.
 *
 * 1. КЛЮЧ — АДРЕСА, А НЕ `id`. У пулі вже лежить 1851 рядок avanprint, залитий
 *    свого часу з мапи сайту, і ключем там стоїть саме адреса товару. Звірено
 *    перед заміною: усі 1851 адреси є і в новому фіді, розбіжностей нуль — тож
 *    старі рядки ОНОВЛЮЮТЬСЯ на місці, дописуючи собі артикул, ціну й колір.
 *    Взяли б `id` (він у фіді теж унікальний) — дістали б 10234 нові рядки, а
 *    1851 старий згас би як «зниклий з фіда»: у пошуку це виглядало б як
 *    дублі впереміш із дірами, і причину шукали б у показі, а не в ключі.
 *
 * 2. МОДИФІКАЦІЯ — ОКРЕМА ПРОПОЗИЦІЯ, як у CS-Cart: 10234 пропозиції на ~1836
 *    товарів, у кожної свій `vendorCode` і своя ціна. Згортає їх назад у одну
 *    картку читальний шар (`supplierPoolRows`), за назвою.
 *
 * 3. ХАРАКТЕРИСТИК У ЦЬОМУ ФІДІ ПРАКТИЧНО НЕМАЄ, і це варто знати заздалегідь.
 *    `<param>` рівно двох видів — «Цвет» (9603 товари) і «Гарантия» (7216); ні
 *    розмірів, ні матеріалу, ні методів нанесення. Справжня специфікація живе
 *    в шаблоні даних «КАТАЛОГ: Товар» (`h_product_characteristics`) і
 *    віддається окремою кнопкою «Експорт характеристик» — разовим xlsx, без
 *    автогенерації й без сталої адреси. Тобто «характеристики з Аванпринта»
 *    цим фідом НЕ закриваються: колір закривається, специфікація ні.
 *
 * Опис кладемо в `attrs.description` навмисно, хоч на весь фід це 5,3 МБ: за
 * розподілом ролей (08.09.2026) текст для документів беремо саме з Аванпринта —
 * це наш магазин і наші слова. У вікно пошуку він не поїде: `supplierPool`
 * вибирає з `attrs` лише `color`, а не всю колонку.
 */
function parseHoroshop(xml, cfg) {
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const SKIP_PARAMS = new Set(["Цвет", "Колір", "Гарантия", "Гарантія"]);
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const b = m[2];
    const rawName = exactTag(b, "name");
    const url = exactTag(b, "url");
    // Без адреси рядок нічим не приткнути: вона тут одночасно ключ і посилання.
    if (!rawName || !url) continue;

    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => p[1].trim());
    const attrs = {};
    // exactTag, а не tag: `<oldprice>` стоїть поруч, і регулярка з `[^>]*`
    // рано чи пізно чіпляє сусіда — на CS-Cart цим уже обпікались.
    const listed = num(exactTag(b, "price"));
    // Довідкову ціну тримаємо завжди, робочу — лише коли фід дає саме її.
    if (listed != null) attrs.sitePrice = listed;
    const color = param(b, "Цвет") || param(b, "Колір");
    if (color) attrs.color = color;

    // КОЛІР ЗАШИТИЙ У НАЗВУ, і це доводиться прибирати тут. CS-Cart лишає
    // модифікаціям спільну назву й віддає колір окремим полем — Хорошоп у
    // частини товарів пише «Футболка «ACTION» жіноча, Бежевий». Читальний шар
    // згортає картку САМЕ ЗА НАЗВОЮ, тож така пара розсипається на десяток
    // майже однакових рядків: у прев'ї одна футболка з'їла вісім рядків із
    // сорока, і в тій сороковці не лишилось місця нікому іншому.
    //
    // Ріжемо тільки тоді, коли хвіст ДОСЛІВНО дорівнює кольору з <param>.
    // Здогадуватись «усе після коми — колір» не можна: 60 назв мають кому не
    // про колір, і вони втратили б половину себе. Зачіпає 743 пропозиції з
    // 10234 — вони згортаються у 120 карток замість 743.
    const suffix = color ? `, ${color}` : "";
    const name =
      suffix && rawName.toLowerCase().endsWith(suffix.toLowerCase())
        ? rawName.slice(0, rawName.length - suffix.length).trim() || rawName
        : rawName;
    const warranty = param(b, "Гарантия") || param(b, "Гарантія");
    if (warranty) attrs.warranty = warranty;
    const description = exactTag(b, "description");
    if (description) attrs.description = description;
    // Решта параметрів — на виріст: сьогодні їх нуль, але щойно в Аванпринті
    // заповнять характеристики, вони приїдуть самі, без правки цього коду.
    const rest = {};
    for (const p of b.matchAll(/<param name="([^"]*)"[^>]*>([\s\S]*?)<\/param>/g)) {
      const pname = unesc(p[1]);
      if (SKIP_PARAMS.has(pname)) continue;
      rest[pname] = unesc(p[2].trim());
    }
    if (Object.keys(rest).length) attrs.params = rest;
    // `available="true"` Хорошоп ставить лише тим, що в наявності (9852 з
    // 10234); решті атрибут просто не пише. Тому дивимось на присутність
    // «true», а не шукаємо "false" — його у фіді немає взагалі.
    attrs.available = /\bavailable="true"/.test(m[1]);

    rows.push({
      external_key: url,
      article: exactTag(b, "vendorCode") || null,
      name,
      vendor: exactTag(b, "vendor") || null,
      category: cats[exactTag(b, "categoryId")] || null,
      price: cfg?.priceIsReference ? null : listed,
      currency: exactTag(b, "currencyId") || "UAH",
      url,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
      attrs: JSON.stringify(attrs),
    });
  }
  return rows;
}

/**
 * OpenCart (bergamo) — розбір ОДНІЄЇ сторінки товару. Викликається обходом, а
 * не по фіду: фіда в Бергамо немає (див. запис у реєстрі).
 *
 * ⚠️ ГОЛОВНА ПАСТКА, І ВОНА ТИХА. На сторінці є ДВІ ціни, і найзручніша з них
 * неправильна. `application/ld+json` (`offers.price`) віддає ПУБЛІЧНУ ціну —
 * і віддає її навіть залогіненому дилеру. Наша ціна живе тільки в DOM:
 * `.product-price-old` — публічна, `.product-price` — наша. Тобто розбирач, який
 * взяв би ціну звідти ж, звідки бере назву, бренд і фото (а це найприродніше
 * рішення), мовчки записав би ціни майже вдвічі більші, і виглядало б це
 * абсолютно нормально. Формою це той самий випадок, що `<price_type>` у CS-Cart
 * і `<oldprice>` у Хорошопа: сусід, який ловиться раніше за потрібне поле.
 *
 * ТОМУ МИ ХОДИМО АНОНІМНО І МНОЖИМО. Публічну ціну беремо з JSON-LD (вона там
 * чесна), а нашу рахує `priceRule` реєстру. Так обхід не потребує ані кукі, ані
 * логіна — ні на ноутбуці, ні в кроні, де сесії взятись нізвідки. Публічна ціна
 * лишається в `attrs.sitePrice`: зміниться ставка — перерахунок робиться з неї
 * одним UPDATE, без повторного обходу.
 *
 * ГАЛЕРЕЯ — ЗА ПРЕФІКСОМ ГОЛОВНОГО ФОТО. На сторінці 46 адрес `catalog_images`,
 * але майже всі — супутні товари й банери блогу. Кадри саме цього товару ділять
 * шлях і основу імені з головним фото (`.../voyager/v3447_03_a-1000x1000.jpg`),
 * розрізняючись хвостом `_a`/`_b` і розміром. Тому беремо ті, що починаються з
 * тієї самої основи, і зрізаємо `-WxH`, щоб не тягти п'ять копій одного кадру.
 *
 * КАТЕГОРІЇ ТУТ НЕМАЄ, і це не недогляд. Хлібні крихти на сторінці товару
 * містять лише його власну назву — розділ у них не потрапляє. Розділ можна
 * дістати обходом 279 сторінок категорій із мапи, але це окрема робота на
 * стільки ж запитів, тож поки `category: null`.
 */
function parseOpencartPage(html, ctx) {
  const ld = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      ld.push(JSON.parse(m[1].trim()));
    } catch {
      // Битий JSON-LD — не привід втрачати сторінку: нижче є запасні шляхи.
    }
  }
  const product = ld.find((d) => d && d["@type"] === "Product");
  if (!product) return null;

  const name = typeof product.name === "string" ? product.name.trim() : "";
  if (!name) return null;

  const offers = product.offers && !Array.isArray(product.offers) ? product.offers : (product.offers || [])[0];
  const sitePriceRaw = offers ? Number.parseFloat(offers.price) : Number.NaN;
  const sitePrice = Number.isFinite(sitePriceRaw) && sitePriceRaw > 0 ? sitePriceRaw : null;

  const mainImage = typeof product.image === "string" ? product.image : (product.image || [])[0] || null;
  // Основа імені: без «-1000x1000» і без кадрового хвоста «_a».
  const stripSize = (u) => u.replace(/-\d+x\d+[a-z]*\.(jpg|jpeg|png|webp)$/i, "");
  let images = [];
  if (mainImage) {
    const base = stripSize(mainImage).replace(/_[a-z]$/i, "");
    // Один кадр лежить у кількох розмірах: -250x250, -550x550, -600x315w. Хвіст
    // «w» — соцмережевий кроп, широкий і з обрізаним товаром, і саме він
    // трапляється в розмітці ПЕРШИМ (це og:image). Тому «перший, що трапився»
    // брати не можна: на картці стояла б обрізана картинка. Для кожного кадру
    // лишаємо найбільший КВАДРАТНИЙ варіант.
    //
    // Головне фото додаємо окремо: у JSON-LD слеші екрановані (`https:\/\/`),
    // тож у сирому тексті сторінки регулярка його не бачить, а саме там лежить
    // найбільший розмір (1000x1000).
    const rankOf = (url) => {
      const m = url.match(/-(\d+)x(\d+)([a-z]*)\.(?:jpg|jpeg|png|webp)$/i);
      if (!m) return 1; // без розміру — оригінал, кращий за будь-який кроп
      const [w, h] = [Number(m[1]), Number(m[2])];
      return (w === h ? 1e9 : 0) + w * h;
    };
    const best = new Map();
    const offer = (url) => {
      const frame = stripSize(url);
      if (!frame.startsWith(base)) return;
      const prev = best.get(frame);
      const rank = rankOf(url);
      if (!prev || rank > prev.rank) best.set(frame, { url, rank });
    };
    offer(mainImage);
    for (const m of html.matchAll(/https:\/\/[^\s"'\\)]*?\/image\/cache\/[^\s"'\\)]+?\.(?:jpg|jpeg|png|webp)/gi)) offer(m[0]);
    images = [...best.keys()].sort().map((k) => best.get(k).url);
    if (!images.length) images = [mainImage];
  }

  const ruled = applyPriceRule(ctx.cfg.priceRule, sitePrice, {});
  const attrs = {};
  if (sitePrice != null) attrs.sitePrice = sitePrice;
  if (ruled.label) attrs.priceRule = ruled.label;
  if (product.description) attrs.description = String(product.description).trim();
  if (product.model) attrs.model = String(product.model).trim();
  // schema.org/InStock vs OutOfStock — єдиний сигнал наявності на сторінці.
  if (offers?.availability) attrs.available = /InStock/i.test(String(offers.availability));

  /**
   * КОЛІР ЗАШИТИЙ У НАЗВУ, А РЕШТА КОЛЬОРІВ — У РОЗМІТЦІ СТОРІНКИ.
   *
   * У мапі сайту рівно ОДНА адреса на модель, і вона веде на один колір
   * (у футболок Printer Prime це завжди `…5360`, темно-синій). Через це в пулі
   * кожна річ лежала одним кольором, хоч на сайті їх шість — і виглядало це як
   * «Бергамо бідний», хоч насправді ми просто не спитали.
   *
   * Решта кольорів є ТУТ ЖЕ, у блоці `#hpmodel`: у кожного своя адреса, свій
   * код і назва в `title` («6053 - синій»). Тобто повне покриття кольорів
   * коштує НУЛЬ додаткових запитів — треба лише прочитати те, що вже завантажено.
   * Обходити ще й кожну колірну сторінку окремо було б у шість разів довше й
   * поклало б на чужий сайт зайве навантаження заради того, що вже в руках.
   *
   * ФОТО В КОЛЬОРІВ НЕ БУДЕ, і це перевірено, а не припущено. Ім'я файлу
   * містить артикул (`22640315360_a-674x800.jpg`), тож напрошується підставити
   * чужий код і дістати фото. Спробував три — усі 404: шлях кешу в них інший.
   * Тому в братів `image_url` порожній, а на картці стоїть фото моделі. Краще
   * без фото, ніж помаранчева футболка з темно-синім знімком.
   */
  const colorTail = name.match(/,\s*колір\s+(.+?)(?:\s+-\s+\S+)?\s*$/iu);
  const baseName = colorTail ? name.slice(0, colorTail.index).trim() || name : name;
  const selfArticle = typeof product.sku === "string" && product.sku.trim() ? product.sku.trim() : null;
  if (colorTail) attrs.color = colorTail[1].trim();

  const self = {
    external_key: ctx.url,
    article: selfArticle,
    name: baseName,
    vendor: product.brand?.name ? String(product.brand.name).trim() : null,
    category: null,
    price: ruled.price,
    currency: offers?.priceCurrency || "UAH",
    url: ctx.url,
    image_url: images[0] || mainImage || null,
    images: JSON.stringify(images),
    attrs: JSON.stringify(attrs),
  };

  /**
   * ФОТО КОЛЬОРУ ВИВОДИМО З БАТЬКІВСЬКОГО, і цього разу перевірено як слід.
   *
   * Спершу я спробував підставити чужий код у КЕШОВАНУ адресу
   * (`/image/cache/.../22640316053_a-674x800.jpg`), отримав 404 на трьох
   * пробах і записав «вивести не можна». Висновок був хибний: адреса
   * правильна, а файл у кеші OpenCart створюється лише тоді, коли хтось
   * ВІДКРИЄ сторінку того кольору. Відвіданий — 200, невідвіданий — 404;
   * саме тому проби й падали.
   *
   * Оригінал же лежить поруч і БЕЗ кешу — `/image/catalog_images/<бренд>/…` —
   * і віддається завжди, хоч сторінку кольору ніхто не відкривав. Перевірено
   * на двох брендах (james_harvest, voyager) і на кодах, куди ми не ходили.
   *
   * Ім'я файлу — це артикул у нижньому регістрі з дефісами через підкреслення
   * («V3447-03» → «v3447_03»), далі кадр («_a») і розширення. Кадр і
   * розширення беремо з РЕАЛЬНОЇ батьківської адреси, а не вгадуємо: так
   * правило не розсиплеться на товарі, у якого головний кадр названий інакше.
   */
  const stemOf = (art) => art.toLowerCase().replace(/-/g, "_");
  const parentImage = images[0] || mainImage || "";
  const parentStem = selfArticle ? stemOf(selfArticle) : null;
  const parts = parentImage.match(
    /^(.*)\/image\/cache\/(.+)\/([^/]+?)(?:-\d+x\d+[a-z]*)?(\.(?:jpg|jpeg|png|webp))$/i
  );
  const colorImage = (article) => {
    if (!parts || !parentStem || !article) return null;
    const [, origin, folder, file, ext] = parts;
    // Основа імені має справді містити артикул батька — інакше підстановка
    // була б здогадкою, а здогадка тут означає чуже фото на картці.
    if (!file.toLowerCase().startsWith(parentStem)) return null;
    return `${origin}/image/${folder}/${stemOf(article)}${file.slice(parentStem.length)}${ext}`;
  };

  const rows = [self];
  const seen = new Set([ctx.url]);
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const body = m[2];
    if (!body.includes("hcol-attribute")) continue;
    const href = m[1].trim();
    // Активний колір — це сама сторінка, у нього href="javascript:void(0)".
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    const title = (body.match(/title="([^"]*)"/) || [])[1] || "";
    // «6053 - синій» → назва кольору без коду; код і так є в артикулі.
    const label = title.includes(" - ") ? title.slice(title.indexOf(" - ") + 3).trim() : title.trim();
    if (!label) continue;
    // Спершу відрізаємо запит і якір, і лише ПОТІМ ділимо шляхом. Навпаки не
    // можна: `[/?#].*$` зрізає від першого слеша, тобто від «https://», і
    // артикул виходив «https:» (спіймано на сухій пробіжці).
    const slug = href.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
    const siblingArticle = /\d/.test(slug) ? slug : null;
    const siblingImage = colorImage(siblingArticle);
    seen.add(href);
    rows.push({
      ...self,
      external_key: href,
      article: siblingArticle,
      url: href,
      image_url: siblingImage,
      images: siblingImage ? JSON.stringify([siblingImage]) : "[]",
      attrs: JSON.stringify({ ...attrs, color: label }),
    });
  }
  return rows;
}


/**
 * Magento GraphQL (e-suvenir) — третій спосіб узяти каталог. Ні файлу, як у
 * фідах, ні обходу сторінок, як у Бергамо: посторінковий запит до API магазину.
 *
 * ЧОМУ НЕ ФІД, І ЧОМУ ЦЕ НЕ ВИДНО ПО КОДУ ВІДПОВІДІ. Сайт — Magento PWA Studio,
 * тобто React поверх Magento. Будь-яка невідома адреса віддає ту саму оболонку
 * з кодом 200: `/sitemap.xml`, `/prom.xml`, `/google.xml` — усі «знаходяться».
 * Розбирач фіда дістав би з тієї оболонки нуль товарів, `curl -f` не спрацював
 * би (200 же), і врятував би лише `minRows`. Мораль ширша за e-suvenir: на SPA
 * перевіряй ВМІСТ відповіді, а не її код.
 *
 * ЧОМУ ПІД ЛОГІНОМ. Наша ціна тут не рахується множником, як у Бергамо й
 * Тотобі, — постачальник каже її прямо: під нашим акаунтом той самий запит
 * повертає `regular_price` (публічна, вона ж закреслена на сайті) і
 * `final_price` (наша). Заміряно 08.09.2026 на 834 товарах: 781 має рівно
 * −41%, 18 записників Mem'O! −50%, решта — розпродаж від −44% до −80%.
 * Тобто множник 0,59 був би правильний для 94% і тихо збрехав би на 53
 * позиціях, причому саме там, де знижка найбільша.
 *
 * ⚠️ ГОЛОВНА ПАСТКА ЦЬОГО ДЖЕРЕЛА, І ВОНА ТИХА. Якщо логін не вдався або токен
 * протух посеред прогону, API далі відповідає — просто `final_price` починає
 * дорівнювати `regular_price`. Тобто в пул лягли б ПУБЛІЧНІ ціни під виглядом
 * наших: усе на місці, нічого не впало, ціни майже вдвічі більші. Це рівно та
 * сама форма збою, що `<price_type>` у CS-Cart і JSON-LD у Бергамо — сусіднє
 * поле, яке виглядає правильним. Стереже `minDiscountedRatio`: частка рядків,
 * де наша ціна нижча за публічну, має лишатись високою, інакше падаємо ДО
 * запису.
 *
 * РЯДОК — КОЛІР, А НЕ ПАРА «КОЛІР+РОЗМІР». Варіанти тут мають власний артикул
 * на кожну пару (`7046L-01-S`), і рядок на кожну дав би 6265 рядків замість
 * ~2500. Розміри лягають у `attrs.sizes` зі своїми кодами — точно так, як у
 * Тотобі, тож читальний шар уже вміє їх показувати.
 *
 * АРТИКУЛ БЕРЕМО ТОЙ, ЯКИМ ЗАМОВЛЯЮТЬ. У кольору без розмірів це код самого
 * варіанта (`95134949923`), у кольору з розмірами — код моделі (`7046L`), бо
 * замовляють модель, а розмір вибирають окремо (його код лежить у `attrs.sizes`).
 * Ставити код випадкового розміру не можна: саме це число менеджер скопіює.
 */
async function loadMagentoGraphql(cfg) {
  const {
    endpoint,
    pageSize = 50,
    delayMs = 250,
    skipCategories = [],
    minDiscountedRatio = 0.8,
  } = cfg.api;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  // Часткові помилки відповіді: рахуємо, щоб сказати про них один раз у кінці,
  // а не сипати однаковим рядком на кожній сторінці.
  const softErrors = { count: 0, first: null };

  /**
   * Секрети йдуть ЗМІННИМИ запиту, а не в тексті. Так пароль не потрапляє ні в
   * рядок запиту, ні у вивід помилки: назовні друкуємо лише `errors[].message`
   * від Magento, ніколи не тіло запиту. Причина та сама, що в `pgEnvFrom` нижче
   * — цей скрипт ганяє крон у ПУБЛІЧНОМУ репозиторії.
   */
  async function gql(query, variables, token, { partial = false } = {}) {
    const headers = { "Content-Type": "application/json", "User-Agent": UA };
    /**
     * ⚠️ ЗАГОЛОВОК `Store` ТУТ ОБОВ'ЯЗКОВИЙ, І БЕЗ НЬОГО ЛОГІН НЕ ПРОЙДЕ НІКОЛИ.
     * У Magento обліковий запис належить САЙТУ (website), а не вітрині. У
     * e-suvenir вітрин дві пари: типова `esouv_ukr` — це website 1, а та, якою
     * працює магазин, — `e_svnr_ukr`, website 2. Без заголовка API відповідає
     * від імені website 1, де нашого користувача просто немає, і віддає
     * «E-mail чи пароль введені невірно» — тобто ту саму відповідь, що й на
     * справді неправильний пароль. Ми на це витратили чотири спроби входу,
     * поки не подивились, що шле сам їхній сайт (`store_view_code` у бандлі).
     *
     * Заодно це визначає, ЯКИЙ каталог ми качаємо: у різних website можуть
     * бути різні товари й ціни, тож заголовок іде на КОЖЕН запит, а не лише
     * на логін.
     */
    if (cfg.api.store) headers.Store = cfg.api.store;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const messages = (json.errors || []).map((e) => e.message).join("; ");
    /**
     * ПОМИЛКА ПОРУЧ ІЗ ДАНИМИ — ТУТ НОРМА, і падати на ній не можна. Magento
     * віддає GraphQL чесно частково: якщо в одного товару зламане поле, у
     * відповіді приїжджають і `data` з рештою сторінки, і `errors` про той
     * товар. Живий приклад: `print_logo_space_list` (місця нанесення) валиться
     * «Internal server error» на кількох товарах кожної сотні — решта товарів
     * сторінки при цьому цілі, лише в тих кількох це поле порожнє. Кидати
     * виняток означало б втратити весь каталог через два товари.
     *
     * Дані відсутні цілком — це вже справжній збій, тоді падаємо.
     *
     * ⚠️ ТЕРПИМІСТЬ ВМИКАЄТЬСЯ ЯВНО, І ЦЕ ВИПРАВЛЕННЯ ПІСЛЯ ЖИВОГО ПРОМАХУ.
     * Спершу вона стояла на всіх запитах — і проковтнула помилку логіна:
     * `generateCustomerToken` віддає `data.generateCustomerToken: null` ПЛЮС
     * `errors` із людською причиною («E-mail чи пароль введені невірно, або
     * обліковий запис тимчасово заблокований»). `data` при цьому не порожня,
     * тож помилка тихо лягала в лічильник, а назовні йшло моє беззмістовне
     * «логін не дав токена». Причина була на руках і не доїхала до людини.
     * Тому терпимість тепер лише там, де вона справді потрібна, — на сторінках
     * товарів.
     */
    if (!json.data) throw new Error(messages || "порожня відповідь");
    if (messages && !partial) throw new Error(messages);
    if (messages) {
      softErrors.count += json.errors.length;
      if (!softErrors.first) softErrors.first = messages.slice(0, 120);
    }
    return json.data;
  }

  // ── логін ────────────────────────────────────────────────────────────────
  const email = process.env[cfg.auth.emailEnv];
  const password = process.env[cfg.auth.passwordEnv];
  let token = null;
  if (email && password) {
    const data = await gql(
      "mutation($email:String!,$password:String!){ generateCustomerToken(email:$email,password:$password){ token } }",
      { email, password }
    );
    token = data?.generateCustomerToken?.token || null;
    if (!token) throw new Error("Логін не дав токена — ціни були б публічними, зупиняюсь.");
    // Перевіряємо, що токен справді працює, а не просто виданий: якщо тут
    // порожньо, далі ми б тихо качали публічні ціни.
    const who = await gql("{ customer { firstname lastname } }", {}, token);
    if (!who?.customer) throw new Error("Токен не відкриває акаунт — зупиняюсь, щоб не залити публічні ціни.");
    console.log(`Акаунт: ${[who.customer.firstname, who.customer.lastname].filter(Boolean).join(" ")}`);
  } else if (dry) {
    console.log(
      `⚠ Немає ${cfg.auth.emailEnv}/${cfg.auth.passwordEnv} — суха пробіжка ПУБЛІЧНИМИ цінами. ` +
        `Для заливу впишіть їх у .env.backup.`
    );
  } else {
    console.error(
      `Немає ${cfg.auth.emailEnv}/${cfg.auth.passwordEnv} у оточенні. Без логіна API віддає ` +
        `публічні ціни, і вони лягли б у пул як наші. Впишіть їх у .env.backup і повторіть.`
    );
    process.exit(1);
  }

  // ── довідник значень атрибутів ───────────────────────────────────────────
  /**
   * Magento віддає атрибути-списки ЧИСЛАМИ, а не текстом: `brand: 624`,
   * `material: 81`, `clothes_density: 217`. Числа виглядають осмислено (у
   * поло `clothes_density: 220` навіть збігається зі щільністю з опису — і це
   * ЗБІГ), тож записати їх як є означало б покласти в базу дані, які виглядають
   * правильними й не є ними: 217 — це «135-145 г/м²». Тому один запит по
   * довідник і підстановка підписів.
   */
  const OPTION_ATTRS = ["brand", "material", "clothes_density", "avail_print_methods", "search_color"];
  const meta = await gql(
    `{ customAttributeMetadata(attributes:[${OPTION_ATTRS.map(
      (a) => `{attribute_code:"${a}",entity_type:"catalog_product"}`
    ).join(",")}]) { items { attribute_code attribute_options { value label } } } }`
  );
  const labels = {};
  for (const item of meta?.customAttributeMetadata?.items || []) {
    const map = new Map();
    for (const o of item.attribute_options || []) map.set(String(o.value), o.label);
    labels[item.attribute_code] = map;
  }
  const labelOf = (code, value) => {
    if (value == null || value === "") return null;
    // Списки multiselect приходять через кому: "silk_stencil,thermal_transfer".
    const parts = String(value).split(",").map((v) => v.trim()).filter(Boolean);
    const named = parts.map((v) => labels[code]?.get(v) ?? v);
    return named.length ? named.join(", ") : null;
  };

  // ── перелік категорій ────────────────────────────────────────────────────
  /**
   * Кореневої категорії «2» НЕ ДОСИТЬ: вона віддає 863 товари, а дерево цілком
   * — 868. П'ять позицій висять у розділах, не прив'язаних до кореня, і мовчки
   * випали б. Тому збираємо всі гілки й питаємо по них.
   */
  const tree = await gql(
    `{ categories(filters:{ids:{in:["${cfg.api.rootCategory}"]}}) { items { children { id children { id children { id } } } } } }`
  );
  const ids = new Set([cfg.api.rootCategory]);
  const walk = (node) => {
    if (!node) return;
    ids.add(String(node.id));
    for (const c of node.children || []) walk(c);
  };
  for (const c of tree?.categories?.items?.[0]?.children || []) walk(c);
  const idFilter = [...ids].map((i) => `"${i}"`).join(",");
  console.log(`Категорій у дереві: ${ids.size}`);

  // ── товари ───────────────────────────────────────────────────────────────
  const PRODUCT_FIELDS = `
    __typename sku name url_key stock_status
    brand material country_of_manufacture clothes_density avail_print_methods
    razmer_ypakovki ves_ypakovki
    print_logo_space_list { name max_width max_height }
    short_description { html }
    categories { name level }
    image { url } media_gallery { url }
    price_range { minimum_price { regular_price { value currency } final_price { value } } }
    ... on ConfigurableProduct {
      variants {
        product { sku stock_status media_gallery { url }
          price_range { minimum_price { regular_price { value } final_price { value } } } }
        attributes { code label }
      }
    }`;

  const products = [];
  let total = 0;
  let seen = 0; // рядків у відповідях, разом із порожніми
  let blanks = 0;
  for (let page = 1; ; page++) {
    const data = await gql(
      `{ products(filter:{category_id:{in:[${idFilter}]}} pageSize:${pageSize} currentPage:${page}) {
         total_count items { ${PRODUCT_FIELDS} } } }`,
      {},
      token,
      { partial: true }
    );
    /**
     * ⚠️ РАХУЄМО СИРІ РЯДКИ, А НЕ ВІДФІЛЬТРОВАНІ, І ЦЕ НЕ ПРИСКІПЛИВІСТЬ.
     * Товар, у якого зламалось поле, приїжджає в масиві як `null` — тобто
     * сторінка з 50 позицій після `filter(Boolean)` стає 49. Кінець вибірки
     * визначався саме по «менше за pageSize», тож перший же такий товар
     * обривав обхід достроково: спіймано живцем — 699 товарів із 870, і в
     * логах це виглядало як звичайне завершення.
     */
    const raw = data?.products?.items || [];
    const items = raw.filter(Boolean);
    blanks += raw.length - items.length;
    seen += raw.length;
    products.push(...items);
    if (page === 1) {
      total = data?.products?.total_count ?? 0;
      console.log(`Товарів у каталозі: ${total || "?"}`);
    }
    console.log(`  сторінка ${page}: ${items.length} товарів, разом ${products.length}`);
    if (raw.length < pageSize || (total && seen >= total)) break;
    if (limit && products.length >= limit) break;
    await nap(delayMs);
  }
  if (blanks) console.log(`  порожніх рядків у відповідях: ${blanks}`);
  /**
   * Обхід мусить дійти до кінця. Недобрані сторінки — це той самий тихий збій,
   * що обірваний обхід у Бергамо: рядки на місці, просто їх менше, і гасіння
   * зниклих вимкнуло б решту каталогу.
   */
  if (!limit && total && seen < total) {
    throw new Error(`Дійшли лише до ${seen} товарів із ${total} — вибірка обірвалась, заливати не можна.`);
  }

  // ── у рядки пулу ─────────────────────────────────────────────────────────
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const text = (html) =>
    html ? String(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : null;

  const rows = [];
  let skippedByCategory = 0;
  for (const p of products) {
    const cats = (p.categories || []).filter(Boolean);
    // «Печать» — це послуги нанесення (УФ друк, тиснення, деколь), а не товари.
    // Пропускаємо лише коли ІНШИХ розділів немає: товар, який заодно лежить у
    // «Печаті», лишається товаром.
    if (cats.length && cats.every((c) => skipCategories.includes(c.name))) {
      skippedByCategory++;
      continue;
    }
    // Найглибший розділ інформативніший за корінь: «Рюкзаки», а не «Сумки».
    const category = cats.slice().sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0]?.name || null;

    const base = {
      vendor: labelOf("brand", p.brand),
      category,
      url: `${cfg.api.site}/${p.url_key}`,
      currency: p.price_range?.minimum_price?.regular_price?.currency || "UAH",
    };
    const commonAttrs = {};
    const put = (k, v) => {
      if (v != null && v !== "") commonAttrs[k] = v;
    };
    put("description", text(p.short_description?.html));
    put("material", labelOf("material", p.material));
    put("density", labelOf("clothes_density", p.clothes_density));
    put("methods", labelOf("avail_print_methods", p.avail_print_methods));
    put("country", p.country_of_manufacture);
    put("packageSize", p.razmer_ypakovki);
    put("packageWeight", p.ves_ypakovki);
    // Місця нанесення з розмірами поля в мм — цього не дає жодне інше джерело.
    const places = (p.print_logo_space_list || []).filter(Boolean).map((s) => ({
      name: s.name,
      maxWidth: s.max_width ?? null,
      maxHeight: s.max_height ?? null,
    }));
    if (places.length) commonAttrs.printPlaces = places;

    const parentImages = (p.media_gallery || []).map((m) => m.url).filter(Boolean);
    const variants = (p.variants || []).filter((v) => v?.product?.sku);

    if (!variants.length) {
      // Простий товар: колір і розмір не розділені, артикул один.
      const reg = num(p.price_range?.minimum_price?.regular_price?.value);
      const fin = num(p.price_range?.minimum_price?.final_price?.value);
      const attrs = { ...commonAttrs, available: p.stock_status === "IN_STOCK" };
      if (reg != null) attrs.sitePrice = reg;
      rows.push({
        ...base,
        external_key: p.sku,
        article: p.sku,
        name: p.name,
        price: fin,
        image_url: parentImages[0] || p.image?.url || null,
        images: JSON.stringify(parentImages),
        attrs: JSON.stringify(attrs),
      });
      continue;
    }

    // Складений товар: групуємо варіанти за кольором, розміри лишаємо всередині.
    const groups = new Map();
    for (const v of variants) {
      const attrsOf = Object.fromEntries((v.attributes || []).map((a) => [a.code, a.label]));
      const color = attrsOf.color || "";
      if (!groups.has(color)) groups.set(color, []);
      groups.get(color).push({ v, size: attrsOf.clothes_size || null });
    }
    for (const [color, members] of groups) {
      const prices = members.map((m) => num(m.v.product.price_range?.minimum_price?.final_price?.value)).filter((n) => n != null);
      const sitePrices = members.map((m) => num(m.v.product.price_range?.minimum_price?.regular_price?.value)).filter((n) => n != null);
      const sizes = members.filter((m) => m.size).map((m) => ({
        size: m.size,
        code: m.v.product.sku,
        price: num(m.v.product.price_range?.minimum_price?.final_price?.value),
      }));
      const variantImages = members.flatMap((m) => (m.v.product.media_gallery || []).map((g) => g.url)).filter(Boolean);
      const images = [...new Set(variantImages.length ? variantImages : parentImages)];

      const attrs = { ...commonAttrs };
      if (color) attrs.color = color;
      if (sitePrices.length) attrs.sitePrice = Math.min(...sitePrices);
      if (sizes.length) attrs.sizes = sizes;
      // Код моделі тримаємо завжди: коли рядок — колір із розмірами, артикулом
      // стоїть саме він, але й для однорозмірних кольорів корисно бачити, від
      // якої моделі колір походить.
      attrs.model = p.sku;
      attrs.available = members.some((m) => m.v.product.stock_status === "IN_STOCK");

      rows.push({
        ...base,
        external_key: color ? `${p.sku}::${color}` : p.sku,
        article: members.length === 1 ? members[0].v.product.sku : p.sku,
        name: p.name,
        price: prices.length ? Math.min(...prices) : null,
        image_url: images[0] || p.image?.url || null,
        images: JSON.stringify(images),
        attrs: JSON.stringify(attrs),
      });
    }
  }
  if (skippedByCategory) console.log(`  пропущено як послуги (${skipCategories.join(", ")}): ${skippedByCategory}`);
  if (softErrors.count) {
    console.log(`  ⚠ часткових помилок у відповідях: ${softErrors.count} (${softErrors.first})`);
  }

  /**
   * ОСТАННІЙ РУБІЖ ПЕРЕД `minRows`: чи це справді НАШІ ціни. Якщо логін
   * відпав, рядки будуть на місці й виглядатимуть нормально — просто дорожчі
   * майже вдвічі. Тому дивимось не на кількість, а на суть: скільки рядків
   * мають ціну НИЖЧУ за публічну.
   */
  const withBoth = rows.filter((r) => {
    const a = JSON.parse(r.attrs || "{}");
    return r.price != null && a.sitePrice != null;
  });
  const discounted = withBoth.filter((r) => r.price < JSON.parse(r.attrs).sitePrice);
  const ratio = withBoth.length ? discounted.length / withBoth.length : 0;
  console.log(`  наша ціна нижча за публічну: ${discounted.length} з ${withBoth.length} (${(ratio * 100).toFixed(1)}%)`);
  if (token && withBoth.length && ratio < minDiscountedRatio) {
    console.error(
      `Лише ${(ratio * 100).toFixed(1)}% рядків мають нашу ціну (межа ${(minDiscountedRatio * 100).toFixed(0)}%). ` +
        `Схоже, логін відпав посеред прогону і API віддає публічні ціни. Нічого не записано.`
    );
    process.exit(1);
  }
  return rows;
}

/**
 * Ціни з кабінету для джерел, чий фід віддає роздріб (berrytex).
 *
 * НАВІЩО ОКРЕМИЙ ПРОХІД, А НЕ ЩЕ ОДИН `priceRule`. Правило описує домовленість
 * одним числом на весь каталог або на розділ. У Беррітекса так не виходить:
 * знижка різна в різних товарів (0,625 у більшості, 0,72 в кепки Reis 6P, 0,60
 * в жилета Moontex — заміряно 09.09.2026), і вгадати її з фіда нічим. Число
 * лежить у кабінеті, тож по нього треба сходити.
 *
 * ЧОМУ 74 ЗАПИТИ, А НЕ 2071. Ціна варіанта на сайті показана цілими гривнями, а
 * у фіді вона з копійками. Якщо взяти число сайту як є, у пул ляже округлення —
 * до півгривні на рядок, і воно поїде в прорахунок. Тому зі сторінки беремо не
 * ціну, а МНОЖНИК (сума цін сайту / сума цін фіда по тих самих кольорах), і
 * множимо на копійчану ціну фіда. Сума замість середнього навмисно: округлення
 * сайту так усереднюється, і на п'яти перевірених товарах перерахунок сходиться
 * з числом сайту до гривні.
 *
 * ⚠️ РЯДОК БЕЗ МНОЖНИКА ЛИШАЄТЬСЯ БЕЗ ЦІНИ. Спокуса лишити йому роздріб велика
 * — рядок виглядатиме повним. Але `price_kind` у цього постачальника вже
 * 'wholesale', тож роздріб у цій колонці означав би «наша ціна» з числом,
 * більшим у півтора раза. Та сама причина, що в Аванпринта: порожнє поле
 * менеджер помітить, а неправильне число — ні.
 */
/**
 * Папірус: вигрузка з кабінету партнера (XLS) + прохід за фото.
 *
 * ЧОМУ ЦЕ `api`, А НЕ `feed`. Звичайний шлях фіда тягне файл одним `curl` без
 * куки — тут так не можна: `/cabinet/pricelist/` без сесії віддає не помилку,
 * а сторінку-візитівку з кодом 200. `curl -f` таке пропустив би, розбирач знайшов
 * би нуль товарів, і залив погасив би всього постачальника. Тож джерело ходить
 * по собі само: логін, файл, перевірка що це справді книжка Excel.
 *
 * СТОРОЖА ТУТ ДЕШЕВША, НІЖ У РЕШТИ. Беррітекс і Е-Сувенір стережуть частку
 * знижених рядків, бо в них сесія, що відпала, віддає ті самі товари, тільки з
 * роздрібними цінами — тихо й правдоподібно. Папірус так не вміє: без логіна
 * немає ані файлу, ані товарів. Тому досить перевірити ТИП ФАЙЛУ — книжка
 * Excel починається з підпису OLE2 (D0 CF 11 E0), а візитівка з `<!DOCTYPE`.
 */
async function loadPapirusPrice(cfg) {
  const { api } = cfg;
  const email = process.env[cfg.auth.emailEnv];
  const password = process.env[cfg.auth.passwordEnv];
  if (!email || !password) {
    console.error(
      `Немає ${cfg.auth.emailEnv}/${cfg.auth.passwordEnv} у оточенні. Без логіна кабінет віддає ` +
        `сторінку-візитівку замість прайсу. Впишіть їх у .env.backup і повторіть.`
    );
    process.exit(1);
  }

  // ── сесія ─────────────────────────────────────────────────────────────────
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  // `...opts` першим — з тієї ж причини, що в applyAccountPricing: інакше
  // заголовки виклику затруть зібрану куку, і вхід виглядав би як поганий пароль.
  const req = async (url, opts = {}) =>
    fetch(url, {
      ...opts,
      redirect: "manual",
      headers: { "User-Agent": UA, cookie: cookie(), ...(opts.headers || {}) },
      signal: AbortSignal.timeout(60_000),
    }).then((res) => (keep(res), res));

  // Спершу порожній GET — по куку сесії, інакше форма входу її не отримає.
  keep(await req(api.loginPage));
  await req(api.loginPost, {
    method: "POST",
    body: new URLSearchParams({ login: email, password, autoauth: "1", redirect: "/promo/" }),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: api.loginPage },
  });

  // Доказ входу — не код відповіді (він і без логіна 200), а посилання «Вийти».
  const home = await (await req(api.homePage)).text();
  if (!/\/\?logout/.test(home)) {
    console.error(
      "Кабінет не відкрився: сторінка не показує «Вийти». Портал сам каже, що пароль видає їхній " +
        "менеджер і що акаунт буває неактивним — перевірте доступи."
    );
    process.exit(1);
  }
  console.log("Кабінет відкрито — прайс беремо з-під логіна.");

  // ── прайс ─────────────────────────────────────────────────────────────────
  const res = await req(api.priceUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const isXls = buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0;
  if (!isXls) {
    console.error(
      `Кабінет віддав не книжку Excel, а ${buf.length} байт типу «${res.headers.get("content-type") || "?"}». ` +
        `Так виглядає відпала сесія: замість файлу приїжджає сторінка-візитівка. Нічого не записано.`
    );
    process.exit(1);
  }
  console.log(`Прайс: ${(buf.length / 1024 / 1024).toFixed(2)} МБ`);

  const sheet = XLSX.read(buf, { type: "buffer" }).Sheets.Price;
  if (!sheet) {
    console.error("У книжці немає аркуша «Price» — вигрузку перебудували, розбирати нічим.");
    process.exit(1);
  }
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  /**
   * РОЗДІЛИ ЗАШИТІ ВІДСТУПАМИ В ПЕРШІЙ КОЛОНЦІ, а не окремим полем: рядок
   * товару має шість колонок, рядок розділу — саму назву з пробілами спереду.
   * Глибина рахується стеком, а не діленням відступу на чотири: один розділ
   * («Ділові подарунки та аксесуари») набраний п'ятьма пробілами замість
   * чотирьох, і арифметика поклала б його не туди.
   */
  const clean = (s) => String(s).replace(/<[^>]*>/g, "").trim();
  const rows = [];
  const stack = [];
  for (const r of table.slice(1)) {
    const first = r[0];
    if (typeof r[3] === "number") {
      const article = clean(first);
      const name = clean(r[1]);
      if (!article || !name) continue;
      // Дерево без кореня «Каталог продукції»: він однаковий у всіх рядків.
      const path = stack.slice(1).map((s) => s.name);
      rows.push({
        external_key: article,
        article,
        name,
        // Окремої колонки бренду немає — він сидить у назві («ECONOMIX», «SCHNEIDER»).
        // Виколупувати його регуляркою з назви не будемо: у половини товарів марки
        // немає взагалі, і вигадана «Папка» як виробник гірша за порожнє поле.
        vendor: null,
        category: path[path.length - 1] || null,
        price: r[3],
        currency: "UAH",
        url: null,
        image_url: null,
        images: JSON.stringify([]),
        attrs: JSON.stringify({
          // РРЦ — рекомендована роздрібна, не наша й не базова. Кладемо поруч,
          // щоб було з чим звіряти, але в `price` йде саме наша (колонка «Ціна»).
          ...(typeof r[4] === "number" && r[4] > 0 ? { rrp: r[4] } : {}),
          ...(r[2] ? { pack: clean(r[2]) } : {}),
          ...(typeof r[5] === "number" ? { stock: r[5] } : {}),
          ...(path.length ? { categoryPath: path.join(" / ") } : {}),
        }),
      });
      continue;
    }
    if (typeof first !== "string" || !first.trim()) continue;
    const indent = first.match(/^ */)[0].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, name: clean(first) });
  }
  console.log(`У прайсі товарів: ${rows.length}`);

  // `--limit` для проби: беремо початок прайсу й обходимо лічені розділи, щоб
  // не ганяти 350 сторінок заради перевірки, що розбір живий. `minRows` при
  // `--limit` і так не діє, тож урізаний прогін не дійде до запису.
  const out = limit ? rows.slice(0, limit) : rows;
  if (limit) console.log(`  беремо перші ${out.length} — --limit`);

  // Сторінки розділів теж під логіном: без куки вони віддають ту саму візитівку.
  if (api.photos) await attachPapirusPhotos(out, cfg, cookie());
  return out;
}

/**
 * Папірус: фото, посилання й id товару — ЇХНІМ ЖЕ ПОШУКОМ, а не обходом розділів.
 *
 * ЧОМУ НЕ РОЗДІЛИ, ХОЧ СПОЧАТКУ БУЛО САМЕ ТАК. Обхід `/categories/view/cid.N/`
 * упирається в стелю: 4101 сторінка дала пари лише для 5062 з 6697 товарів
 * (75,6%, заміряно 09.09.2026). Причина не в обході — сайт віддав 8090 пар,
 * більше, ніж товарів у прайсі, — а в тому, що МЕНЮ ПОКАЗУЄ НЕ ВЕСЬ КАТАЛОГ:
 * 1635 позицій прайсу просто не лежать у жодному розділі з меню. Це не
 * лікується ні пагінацією, ні регістром: я пробував обидва, разом вони дали
 * +59 товарів ціною вп'ятеро довшого проходу.
 *
 * Пошук же знаходить УСЕ: 25 випадкових артикулів прайсу — 25 влучень, усі з
 * фото. Він і дешевший за сторінку розділу: маленький JSON проти 250 кБ HTML.
 *
 * ОДИН ЗАПИТ ЗАКРИВАЄ БАГАТО АРТИКУЛІВ. Відповідь несе до 100 товарів, а в
 * прайсі сусідні рядки — родичі (той самий товар у різних кольорах, та сама
 * серія). Тому йдемо списком і питаємо лише про те, чого ще не знаємо: решту
 * забираємо з чужих відповідей.
 */
async function attachPapirusPhotos(rows, cfg, cookieHeader) {
  const { concurrency = 4, delayMs = 250, minCoverage = 0.8 } = cfg.api.photos;
  const site = cfg.api.site;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (a) => String(a ?? "").trim().toLowerCase();

  // id товару: з нього ж будуються і фото, і адреса картки.
  const byArticle = new Map();

  /**
   * ПЕРШИЙ ПРОХІД ПИТАЄ ПРО ВСЕ, ДАЛІ — ЛИШЕ ПРО НОВЕ. Внутрішній id товару
   * сталий: він не міняється ні від ціни, ні від залишку. Тому перепитувати
   * шість із половиною тисяч артикулів двічі на день — це навантажувати чужий
   * сайт заради відповіді, яка вже лежить у нас у базі.
   *
   * Числа, які до цього призвели (09.09.2026): без засіву прохід робить 6469
   * запитів і триває чверть години — більше, ніж тижневий обхід Бергамо, і це
   * двічі на добу. Із засівом стільки коштує лише перший прогін.
   *
   * Ідемо в базу тим самим psql, що й запис. Не вийшло — не біда: працюємо як
   * раніше, просто дорожче.
   */
  seed: {
    if (!dbUrl) break seed;
    try {
      const env = pgEnvFrom(dbUrl);
      const args = ["-X", "-A", "-t", "-F", "\t", "-c",
        `select article, image_url from tosho.supplier_products
          where supplier_slug = '${cfg.slug}' and article is not null and image_url is not null`];
      if (!env) args.unshift(dbUrl);
      const out = execFileSync(PSQL, args, {
        encoding: "utf8",
        env: { ...process.env, ...(env || {}) },
        maxBuffer: 32 * 1024 * 1024,
      });
      for (const line of out.split("\n")) {
        const [article, url] = line.split("\t");
        const id = (String(url || "").match(/\/img\/goods\/(\d+)\.jpg/) || [])[1];
        if (article && id) byArticle.set(norm(article), id);
      }
      if (byArticle.size) console.log(`  з бази вже відомо id для ${byArticle.size} артикулів — про них не питаємо`);
    } catch {
      // База недоступна або таблиці ще немає — просто питаємо про все.
    }
  }

  const want = rows.map((r) => r.article);
  let asked = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= want.length) return;
      const article = want[i];
      // Уже приїхав у чиїйсь відповіді — питати окремо нема потреби.
      if (byArticle.has(norm(article))) continue;
      let json = null;
      try {
        const res = await fetch(`${site}/sphinx/find/`, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            cookie: cookieHeader,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: `js=1&st=catalog&q=${encodeURIComponent(article)}`,
          signal: AbortSignal.timeout(30_000),
        });
        json = JSON.parse(await res.text());
      } catch {
        // Мовчазний пропуск: фото — прикраса картки, і одна невдала відповідь
        // не має валити прогін. Загальне покриття все одно перевіряється нижче.
      }
      asked++;
      for (const it of json?.items ?? []) {
        const key = norm(it.article);
        // `img == false` у них означає «фото немає» — їхній же скрипт підставляє
        // на це місце заглушку comingsoon. Такий рядок лишаємо без картинки.
        const hasImg = it.img && !/comingsoon/i.test(String(it.img));
        if (key && it.id && hasImg && !byArticle.has(key)) byArticle.set(key, String(it.id));
      }
      if (asked % 250 === 0) console.log(`  запитів ${asked}, знайдено ${byArticle.size}`);
      await nap(delayMs);
    }
  }
  console.log(`Фото: питаємо їхній пошук про ${want.length} артикулів (сусідні закриваються гуртом)`);
  await Promise.all(Array.from({ length: concurrency }, worker));

  let hit = 0;
  for (const r of rows) {
    const id = byArticle.get(norm(r.article));
    if (!id) continue;
    hit++;
    r.image_url = `${site}/img/goods/${id}.jpg`;
    r.url = `${site}/categories/view/${id}/`;
    r.images = JSON.stringify([`${site}/img/goods/${id}.jpg`]);
  }
  const coverage = rows.length ? hit / rows.length : 0;
  console.log(
    `  запитів ${asked} на ${rows.length} товарів, з фото ${hit} (${(coverage * 100).toFixed(1)}%)`
  );
  if (!limit && coverage < minCoverage) {
    console.log(
      `  ⚠ фото менше за очікуване (межа ${(minCoverage * 100).toFixed(0)}%): пошук міг відповідати ` +
        `порожньо. Прайс від цього не постраждав — ціни й залишки на місці.`
    );
  }
}


async function applyAccountPricing(rows, cfg) {
  const ap = cfg.accountPricing;
  const { concurrency = 4, delayMs = 250, minDiscountedRatio = 0.8, minCoverage = 0.9, retries = 1 } = ap;

  const email = process.env[cfg.auth.emailEnv];
  const password = process.env[cfg.auth.passwordEnv];
  if (!email || !password) {
    if (dry) {
      console.log(
        `⚠ Немає ${cfg.auth.emailEnv}/${cfg.auth.passwordEnv} — суха пробіжка з РОЗДРІБНИМИ цінами фіда. ` +
          `Для заливу впишіть їх у .env.backup.`
      );
      return;
    }
    console.error(
      `Немає ${cfg.auth.emailEnv}/${cfg.auth.passwordEnv} у оточенні. Без логіна сайт показує роздріб, ` +
        `а він ліг би в пул як наша ціна. Впишіть їх у .env.backup і повторіть.`
    );
    process.exit(1);
  }

  // ── сесія ─────────────────────────────────────────────────────────────────
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const keep = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  /**
   * `...opts` СТОЇТЬ ПЕРШИМ НАВМИСНО. Якщо розсипати його після `headers`,
   * власні заголовки виклику затруть зібрані тут — разом із кукою. Magento на
   * запит без сесії відповідає редиректом на `/enable-cookies`, і виглядає це
   * як «неправильний пароль». Півгодини на цьому вже втрачено (09.09.2026).
   */
  const req = async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      redirect: "manual",
      headers: { "User-Agent": UA, cookie: cookie(), ...(opts.headers || {}) },
      signal: AbortSignal.timeout(30_000),
    });
    keep(res);
    return res;
  };

  const loginHtml = await (await req(ap.loginPage)).text();
  const formKey = (loginHtml.match(/id="login-form"[\s\S]*?name="form_key"[^>]*value="([^"]+)"/) ||
    loginHtml.match(/name="form_key"[^>]*value="([^"]+)"/) || [])[1];
  if (!formKey) {
    console.error("Сторінка входу не віддала form_key — форма змінилась, вхід зібрати нічим.");
    process.exit(1);
  }
  const posted = await req(ap.loginPost, {
    method: "POST",
    body: new URLSearchParams({ form_key: formKey, "login[username]": email, "login[password]": password }),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: ap.loginPage },
  });
  const landed = posted.headers.get("location") || "";
  if (/enable-cookies/.test(landed)) {
    console.error("Magento відповів «увімкніть куки»: сесія не доїхала до запиту входу, а не пароль поганий.");
    process.exit(1);
  }

  let acc = await req(ap.accountPage);
  for (let hop = 0; hop < 3 && acc.status >= 300 && acc.status < 400; hop++) {
    acc = await req(new URL(acc.headers.get("location"), ap.accountPage).href);
  }
  const accHtml = await acc.text();
  if (!/customer\/account\/logout/.test(accHtml)) {
    console.error("Кабінет не відкрився — далі сайт показував би роздріб. Перевірте пошту й пароль.");
    process.exit(1);
  }
  console.log("Кабінет відкрито — ціни беремо з-під логіна.");

  // ── множник сторінки ──────────────────────────────────────────────────────
  // Код кольору у фіді стоїть у назві: «(колір білий (WH), розмір 1/2)». Він же
  // — у класі плитки на сторінці (`color-WH`), тож це і є ключ звірки.
  const colourOf = (name) => {
    const s = String(name || "");
    const m = s.match(/колір[^()]*\(([A-Z0-9]+)\)/) || s.match(/\(([A-Z0-9]{1,6})\)/);
    return m ? m[1] : null;
  };
  // Атрибути в тезі йдуть у довільному порядку, тому спершу беремо весь тег із
  // ціною, а колір шукаємо всередині нього.
  const pagePrices = (html) => {
    const out = new Map();
    for (const m of html.matchAll(/<[^>]*\bdata-price="([\d.]+)"[^>]*>/g)) {
      const colour = (m[0].match(/\bcolor-([A-Z0-9]+)\b/) || [])[1];
      const price = Number.parseFloat(m[1]);
      if (!colour || !Number.isFinite(price) || price <= 0) continue;
      if (!out.has(colour) || price < out.get(colour)) out.set(colour, price);
    }
    return out;
  };
  /**
   * Множник сторінки — насправді множник КОЛЬОРУ, і це не педантизм.
   * На `jhk-polo-regular-man` білий іде за 0,630, а решта 26 кольорів за 0,623
   * (09.09.2026). Один множник на сторінку дав би білому 333,61 замість 337 —
   * 3,40 грн повз, причому мовчки й на найпопулярнішому кольорі.
   *
   * Але й брати відношення кожного кольору окремо не можна: сайт показує цілі
   * гривні, тож у відношенні сидить шум до половини гривні, і на дешевому
   * товарі він більший за справжню різницю ставок.
   *
   * ЗВІДСИ ПРАВИЛО ГРУПУВАННЯ, У ЯКОМУ НЕМАЄ ЖОДНОГО ПІДІБРАНОГО ЧИСЛА: колір
   * належить ставці, якщо ставка ВІДТВОРЮЄ показане сайтом ціле число, тобто
   * різниця менша за пів гривні — рівно те округлення, яке сайт і робить.
   * Беремо медіанне відношення як припущення, залишаємо тих, кого воно
   * відтворює, перераховуємо ставку сумою по них (шум усереднюється), а хто не
   * вписався — той збирається в наступну групу тим самим способом.
   *
   * Перша редакція розділяла кольори за «розривом утричі більшим за шум», і на
   * футболці `jhk-regular-t-shirt` це проковтнуло колір CM: 315 грн проти 316,56
   * за спільною ставкою. Підібраний поріг завжди комусь завеликий.
   */
  const tierFor = (page, group) => {
    if (!page.size) return null;
    // Сайт показує ціну НАЙДЕШЕВШОГО розміру кольору («ціна від»), тож і з фіда
    // по кожному кольору беремо мінімум — інакше множник поїде на товарах, де
    // розміри коштують по-різному.
    const feedMin = new Map();
    for (const r of group) {
      const c = colourOf(r.name);
      const price = Number.parseFloat(r.price);
      if (!c || !Number.isFinite(price) || price <= 0) continue;
      if (!feedMin.has(c) || price < feedMin.get(c)) feedMin.set(c, price);
    }
    const pairs = [];
    for (const [c, sp] of page) {
      const fp = feedMin.get(c);
      if (fp) pairs.push({ c, sp, fp, ratio: sp / fp });
    }
    const sane = (t) => t > 0.2 && t <= 1.05;

    if (!pairs.length) {
      // Кольори не зійшлись (у назві їх немає зовсім) — лишається порівняти
      // найдешевше з найдешевшим: на сайті це «ціна від», у фіді — мінімум.
      const fp = Math.min(...group.map((r) => Number.parseFloat(r.price)).filter((n) => Number.isFinite(n) && n > 0));
      if (!Number.isFinite(fp)) return null;
      const tier = Math.round((Math.min(...page.values()) / fp) * 10000) / 10000;
      return sane(tier) ? { byColour: new Map(), fallback: tier, groups: 1, matched: 0, worst: 0 } : null;
    }

    // Округлення сайту: показане число відрізняється від справжнього не більше
    // ніж на пів гривні. 0,51 — щоб не спіткнутись на рівно половині.
    const ROUNDING = 0.51;
    const sumTier = (list) => {
      const site = list.reduce((a, x) => a + x.sp, 0);
      const feed = list.reduce((a, x) => a + x.fp, 0);
      return feed ? Math.round((site / feed) * 10000) / 10000 : 0;
    };
    const clusters = [];
    let rest = pairs.slice();
    while (rest.length) {
      const sorted = rest.map((x) => x.ratio).sort((a, z) => a - z);
      // Медіана, а не середнє: одна ставка-виняток не має тягнути припущення на себе.
      let tier = sorted[Math.floor(sorted.length / 2)];
      let fits = [];
      for (let step = 0; step < 5; step++) {
        const next = rest.filter((x) => Math.abs(x.fp * tier - x.sp) <= ROUNDING);
        if (!next.length) break;
        const nt = sumTier(next);
        const settled = next.length === fits.length && Math.abs(nt - tier) < 1e-6;
        fits = next;
        tier = nt;
        if (settled) break;
      }
      // Медіанна ставка не відтворила нікого (буває на двох кольорах із різними
      // ставками) — тоді група з одного кольору й точним його відношенням.
      if (!fits.length) {
        fits = [rest[0]];
        tier = Math.round(rest[0].ratio * 10000) / 10000;
      }
      clusters.push({ tier, members: fits });
      rest = rest.filter((x) => !fits.includes(x));
    }

    const byColour = new Map();
    let biggest = null;
    for (const { tier, members } of clusters) {
      // Ставка поза межами — не знижка, а розсинхрон (інша сторінка, ціна за
      // комплект). Кольори такої групи лишаються без множника, решта сторінки
      // від цього не страждає.
      if (!sane(tier)) continue;
      for (const x of members) byColour.set(x.c, tier);
      if (!biggest || members.length > biggest.n) biggest = { tier, n: members.length };
    }
    if (!biggest) return null;
    let worst = 0;
    for (const x of pairs) {
      const tier = byColour.get(x.c);
      if (tier) worst = Math.max(worst, Math.abs(x.fp * tier - x.sp));
    }
    return { byColour, fallback: biggest.tier, groups: byColour.size ? new Set(byColour.values()).size : 1, matched: pairs.length, worst };
  };

  const byUrl = new Map();
  for (const r of rows) {
    if (!r.url) continue;
    if (!byUrl.has(r.url)) byUrl.set(r.url, []);
    byUrl.get(r.url).push(r);
  }
  const urls = [...byUrl.keys()];
  const candidates = rows.filter((r) => Number.parseFloat(r.price) > 0).length;
  console.log(`Сторінок товару: ${urls.length} на ${rows.length} рядків — по множнику з кожної.`);

  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const tiers = new Map();
  const failures = [];
  let cursor = 0;
  let done = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= urls.length) return;
      const url = urls[i];
      let html = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await req(url);
          if (res.status >= 300 && res.status < 400) throw new Error(`редирект на ${res.headers.get("location") || "?"}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          html = await res.text();
          break;
        } catch (e) {
          if (attempt === retries) failures.push(`${url} — ${e.message}`);
          else await nap(600);
        }
      }
      if (html) {
        const t = tierFor(pagePrices(html), byUrl.get(url));
        if (t) tiers.set(url, t);
      }
      done++;
      if (done % 25 === 0 || done === urls.length) {
        console.log(`  пройдено ${done}/${urls.length} — множників ${tiers.size}, невдач ${failures.length}`);
      }
      await nap(delayMs);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  if (failures.length) {
    console.log(`Не відповіли ${failures.length} сторінок, перші три:`);
    for (const f of failures.slice(0, 3)) console.log(`  ${f}`);
  }

  // ── перерахунок ───────────────────────────────────────────────────────────
  let priced = 0;
  let cleared = 0;
  // Ідемо по ВСІХ рядках, а не по сторінках: рядок без адреси в жодну групу не
  // потрапив, і обхід по групах лишив би йому роздріб під виглядом нашої ціни.
  for (const r of rows) {
    const site = Number.parseFloat(r.price);
    if (!Number.isFinite(site) || site <= 0) continue;
    const t = r.url ? tiers.get(r.url) : null;
    const attrs = JSON.parse(r.attrs || "{}");
    attrs.sitePrice = site;
    if (t) {
      const colour = colourOf(r.name);
      // Колір, якого на сторінці немає (зняли з продажу, але у фіді ще є),
      // рахується найпоширенішою ставкою товару.
      const tier = (colour && t.byColour.get(colour)) || t.fallback;
      attrs.accountTier = tier;
      r.price = (Math.round(site * tier * 100) / 100).toFixed(2);
      priced++;
    } else {
      r.price = null;
      cleared++;
    }
    r.attrs = JSON.stringify(attrs);
  }

  const spread = new Map();
  for (const t of tiers.values()) {
    const k = t.fallback.toFixed(3);
    spread.set(k, (spread.get(k) || 0) + 1);
  }
  const top = [...spread.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`  ціну з кабінету дістали ${priced} рядків з ${candidates}; без ціни лишилось ${cleared}`);
  const multi = [...tiers.values()].filter((t) => t.groups > 1).length;
  if (multi) console.log(`  сторінок, де ставка різна для різних кольорів: ${multi}`);
  console.log(`  множники: ${top.map(([k, n]) => `${k} — ${n} сторінок`).join(", ")}${spread.size > top.length ? ", …" : ""}`);
  // Розбіжність — це перевірка самої гіпотези «множник у товарі сталий». Поки
  // вона в межах гривні, множник справді один на товар; помітно більша означає,
  // що на сторінці цін кілька, і її треба дивитись очима.
  const byWorst = [...tiers].sort((a, b) => b[1].worst - a[1].worst);
  const worst = byWorst.length ? byWorst[0][1].worst : 0;
  console.log(`  найбільша розбіжність перерахунку з числом сайту: ${worst.toFixed(2)} грн`);
  for (const [url, t] of byWorst.slice(0, 3).filter(([, t]) => t.worst >= 1)) {
    console.log(`    ${t.worst.toFixed(2)} грн — ${url} (множник ${t.fallback.toFixed(3)}, кольорів ${t.matched})`);
  }

  const coverage = candidates ? priced / candidates : 0;
  if (coverage < minCoverage) {
    console.error(
      `Ціну з кабінету дістали лише ${(coverage * 100).toFixed(1)}% рядків (межа ${(minCoverage * 100).toFixed(0)}%). ` +
        `Заливати такий прохід не можна: більшість каталогу лишилась би без ціни. Нічого не записано.`
    );
    process.exit(1);
  }
  const discounted = [...tiers.values()].filter((t) => t.fallback < 0.95).length;
  const ratio = tiers.size ? discounted / tiers.size : 0;
  console.log(`  сторінок із ціною, нижчою за роздріб: ${discounted} з ${tiers.size} (${(ratio * 100).toFixed(1)}%)`);
  const noDiscount = [...tiers].filter(([, t]) => t.fallback >= 0.95);
  for (const [url, t] of noDiscount.slice(0, 5)) {
    console.log(`    без знижки: множник ${t.fallback.toFixed(3)} — ${url}`);
  }
  if (ratio < minDiscountedRatio) {
    console.error(
      `Лише ${(ratio * 100).toFixed(1)}% сторінок дали ціну нижчу за роздрібну (межа ${(minDiscountedRatio * 100).toFixed(0)}%). ` +
        `Схоже, логін відпав посеред проходу і сайт показує роздріб. Нічого не записано.`
    );
    process.exit(1);
  }
}

const PARSERS = { prom: parseProm, cscart: parseCscart, sitemap: parseSitemap, "sitemap-sku": parseSitemapSku, horoshop: parseHoroshop };
const PAGE_PARSERS = { "opencart-page": parseOpencartPage };
// Завантажувачі, які самі ходять по джерелу: їм не потрібен ані файл фіда, ані
// перелік адрес — вони тягнуть каталог по своєму протоколу.
const API_LOADERS = { "magento-graphql": loadMagentoGraphql, "xls-price": loadPapirusPrice };

// ── тягнемо фід ─────────────────────────────────────────────────────────────
// Джерело з `api` не має файлу, який можна завантажити: воно саме ходить по
// сторінках свого API. Тому весь блок нижче — тільки для фідів і обходів.
let xml = null;
if (!cfg.api) {
console.log(`Фід: ${cfg.feed}`);
try {
  // `-f` тут не косметика. Без нього 404 повертає HTML-сторінку помилки з
  // нульовим кодом виходу: розбирач знаходить нуль товарів, залив «успішно»
  // пише нуль рядків — і гасить УСЬОГО постачальника, бо зниклі з фіда
  // вимикаються за часом. Адреси вивантажень непостійні (Хорошоп зашиває в них
  // хеш профілю), тож це не гіпотетичний випадок. З `-f` curl падає вголос.
  xml = execFileSync("curl", ["-fsS", "--max-time", "60", "-A", UA, cfg.feed], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  console.error("Не вдалося завантажити фід:", e.message);
  process.exit(1);
}
}

/**
 * Обхід сторінок для постачальників без фіда. Мапа сайту дає лише перелік
 * адрес, тож кожну сторінку доводиться тягти окремо.
 *
 * ТЕМП НАВМИСНО ВВІЧЛИВИЙ. Це сайт партнера, а не наш: 4 паралельні запити з
 * паузою чверть секунди — приблизно 11 запитів на секунду, 2658 сторінок
 * проходять хвилин за чотири. Ганяти швидше немає ніякої потреби: обхід
 * ходить раз на тиждень.
 *
 * І ГОЛОВНЕ — ЧАСТКОВИЙ ОБХІД НЕ МОЖНА ЗАЛИВАТИ. Якщо мережа відвалиться на
 * 1500-й сторінці, у нас на руках півтори тисячі товарів замість 2658, і
 * звичайний залив погасив би решту 1158 як «зниклі з фіда». У пошуку це
 * виглядало б як «половина Бергамо зникла», а причина була б у мережі. Тому
 * рахуємо частку невдач і при перевищенні `maxFailRatio` падаємо ДО запису.
 */
async function crawlPages(indexXml, cfg) {
  const { concurrency = 4, retries = 1, delayMs = 250, maxFailRatio = 0.05 } = cfg.crawl;
  const parsePage = PAGE_PARSERS[cfg.format];
  if (!parsePage) throw new Error(`Немає посторінкового розбирача «${cfg.format}»`);

  const all = PARSERS[cfg.crawl.index](indexXml, cfg).map((r) => r.url);
  const urls = limit ? all.slice(0, limit) : all;
  console.log(`Адрес у мапі: ${all.length}${limit ? ` (беремо перші ${urls.length} — --limit)` : ""}`);

  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = [];
  const failures = [];
  let skipped = 0;
  let done = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= urls.length) return;
      const url = urls[i];
      let html = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          html = await res.text();
          break;
        } catch (e) {
          if (attempt === retries) failures.push(`${url} — ${e.message}`);
          else await nap(600);
        }
      }
      if (html) {
        const parsed = parsePage(html, { url, cfg });
        // Сторінка може дати БІЛЬШЕ як один рядок: у Бергамо на картці товару
        // висить перелік усіх його кольорів, і кожен колір — окремий товар зі
        // своїм кодом. Тому розбирач повертає масив.
        //
        // `null` (або порожньо) — сторінка без товару (розділ, стаття). Це не
        // збій: у мапі такі адреси теж є, просто вони не проходять фільтр
        // «код з цифрою».
        const produced = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        if (produced.length) rows.push(...produced);
        else skipped++;
      }
      done++;
      if (done % 250 === 0 || done === urls.length) {
        console.log(`  пройдено ${done}/${urls.length} — товарів ${rows.length}, без товару ${skipped}, невдач ${failures.length}`);
      }
      await nap(delayMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (failures.length) {
    console.log(`Не відповіли ${failures.length} сторінок, перші три:`);
    for (const f of failures.slice(0, 3)) console.log(`  ${f}`);
  }
  const ratio = urls.length ? failures.length / urls.length : 0;
  if (ratio > maxFailRatio) {
    console.error(
      `Обхід обірвався: не відповіли ${failures.length} з ${urls.length} сторінок ` +
        `(${(ratio * 100).toFixed(1)}%, межа ${(maxFailRatio * 100).toFixed(1)}%). ` +
        `Заливати частковий обхід НЕ можна — він погасив би решту каталогу.`
    );
    process.exit(1);
  }
  return rows;
}

const rows = cfg.api
  ? await API_LOADERS[cfg.format](cfg)
  : cfg.crawl
    ? await crawlPages(xml, cfg)
    : PARSERS[cfg.format](xml, cfg);
console.log(`Розібрано товарів: ${rows.length}`);
console.log(
  `  з артикулом: ${rows.filter((r) => r.article).length}, ` +
    `з ціною: ${rows.filter((r) => r.price).length}, ` +
    `з фото: ${rows.filter((r) => r.image_url).length}`
);
// Фід дав роздріб — наша ціна лежить за логіном, і по неї треба сходити окремо.
if (cfg.accountPricing) await applyAccountPricing(rows, cfg);
// Розкладка за правилом ціни. Показуємо, бо мовчазний промах правила виглядає
// так само, як усе гаразд: ціни на місці, просто не наші. «(без правила)» на
// весь фід означає, що постачальник перейменував розділ або тип ціни.
if (cfg.priceRule) {
  const byLabel = {};
  for (const r of rows) {
    let label = null;
    try {
      label = JSON.parse(r.attrs || "{}").priceRule ?? null;
    } catch {
      // Битий attrs — рахуємо як «без правила», це й так сигнал.
    }
    const k = label || "(без правила)";
    byLabel[k] = (byLabel[k] || 0) + 1;
  }
  const parts = Object.entries(byLabel).map(([k, v]) => `${k} — ${v}`);
  console.log(`  за правилом ціни: ${parts.join(", ")}`);
  if (!cfg.priceRule.agreedOn) {
    console.log(`  ⚠ ставку «${key}» ще не підтверджено (agreedOn: null) — цифри робочі, але не остаточні`);
  }
}
// дедуп за external_key усередині фіда (ON CONFLICT не любить дублів у одному COPY)
const seen = new Set();
const uniq = rows.filter((r) => (r.external_key && !seen.has(r.external_key) ? (seen.add(r.external_key), true) : false));
if (uniq.length !== rows.length) console.log(`  унікальних за ключем: ${uniq.length}`);

/**
 * ПОРІГ РЯДКІВ. Останній рубіж перед записом, і найважливіший у цьому скрипті.
 *
 * Зниклі з фіда товари гасяться за часом: «усе, чого не торкнулись у цьому
 * прогоні, — вимкнути». Це правильно, поки прогін чесний. Але якщо фід віддав
 * порожнечу — змінилась адреса вивантаження, постачальник перебудував сайт,
 * обхід обірвався — то залив «успішно» запише нуль рядків і ПОГАСИТЬ УСЬОГО
 * ПОСТАЧАЛЬНИКА. Симптом («Аванпринт зник із пошуку») не схожий на причину
 * (хеш у адресі), і шукали б його в показі.
 *
 * Тому кожен постачальник має в реєстрі `minRows` — грубу нижню межу з запасом
 * від живого розміру фіда. Менше — це не «мало товарів», це зламане джерело:
 * не пишемо нічого й падаємо вголос. Каталог у базі лишається таким, як був.
 */
if (cfg.minRows && !limit && uniq.length < cfg.minRows) {
  console.error(
    `Розібрано ${uniq.length} товарів, а нижня межа для «${key}» — ${cfg.minRows}. ` +
      `Схоже, джерело зламалось: адреса вивантаження, розмітка сайту або обхід. ` +
      `Нічого не записано, каталог постачальника не погашено.`
  );
  process.exit(1);
}

if (dry) {
  console.log("--- dry: перші 3 рядки ---");
  console.log(uniq.slice(0, 3));
  process.exit(0);
}

// ── у базу: TSV → тимчасова таблиця → upsert ────────────────────────────────
/**
 * Підпис ціни. Досі він виводився з наявності `priceRule`: є множник — значить
 * ціна наша. Для e-suvenir це не працює: множника немає, бо постачальник каже
 * нашу ціну прямо. Тому підпис став полем реєстру, а старе правило лишилось
 * запасним — щоб чотири наявні джерела поводились точно як раніше.
 */
const priceKind = cfg.priceKind || (cfg.priceRule ? "wholesale" : "retail");
const dir = mkdtempSync(join(tmpdir(), "feed-"));
const tsv = join(dir, "rows.tsv");
const esc = (v) => (v == null ? "\\N" : String(v).replace(/\\/g, "\\\\").replace(/\t/g, " ").replace(/\n/g, " ").replace(/\r/g, ""));
const cols = ["external_key", "article", "name", "vendor", "category", "price", "currency", "url", "image_url", "images", "attrs"];
writeFileSync(tsv, uniq.map((r) => cols.map((c) => esc(r[c])).join("\t")).join("\n"));

const sql = `
\\set ON_ERROR_STOP on
begin;

create temp table _feed (
  external_key text, article text, name text, vendor text, category text,
  price text, currency text, url text, image_url text, images text, attrs text
) on commit drop;

\\copy _feed (${cols.join(", ")}) from '${tsv}' with (format text, null '\\N')

-- Немає картки постачальника — падаємо ГУЧНО. Без цього CROSS JOIN нижче дав би
-- порожньо, і залив «успішно» вставив би нуль рядків: рівно той тихий збій, на
-- якому в цьому проєкті вже обпікались (SQL, що не поїхав, при зелених джобах).
do $$
begin
  if not exists (select 1 from tosho.contractors where website ilike '%${cfg.slug}%') then
    raise exception 'Немає картки підрядника з доменом %. Заведіть її (kind=supplier, website), інакше вставляти нема під кого.', '${cfg.slug}';
  end if;
end
$$;

-- team_id і contractor_id беремо з картки постачальника за доменом.
with sup as (
  select team_id, id as contractor_id
  from tosho.contractors
  where website ilike '%${cfg.slug}%'
  order by (kind = 'supplier') desc
  limit 1
)
insert into tosho.supplier_products
  (team_id, supplier_slug, contractor_id, source, external_key,
   article, name, vendor, category, price, currency, price_kind, url, image_url, images, attrs, observed_at, is_active)
select
  sup.team_id, '${cfg.slug}', sup.contractor_id, '${cfg.source}', f.external_key,
  nullif(f.article,''), f.name, nullif(f.vendor,''), nullif(f.category,''),
  nullif(f.price,'')::numeric, coalesce(nullif(f.currency,''),'UAH'), '${priceKind}',
  nullif(f.url,''), nullif(f.image_url,''), coalesce(f.images::jsonb,'[]'::jsonb),
  coalesce(f.attrs::jsonb,'{}'::jsonb), now(), true
from _feed f cross join sup
on conflict (supplier_slug, external_key) do update set
  article = excluded.article, name = excluded.name, vendor = excluded.vendor,
  category = excluded.category, price = excluded.price, currency = excluded.currency,
  price_kind = excluded.price_kind,
  url = excluded.url, image_url = excluded.image_url, images = excluded.images,
  attrs = excluded.attrs,
  contractor_id = excluded.contractor_id, observed_at = now(), is_active = true,
  updated_at = now();

-- Зниклі з фіда — гасимо, не видаляємо (посилання зі старих прорахунків).
update tosho.supplier_products p set is_active = false, updated_at = now()
where p.supplier_slug = '${cfg.slug}' and p.observed_at < now() - interval '1 minute' and p.is_active;

select '${cfg.slug}' as supplier, count(*) as total,
       count(*) filter (where is_active) as active
from tosho.supplier_products where supplier_slug = '${cfg.slug}';

commit;
notify pgrst, 'reload schema';
`;
const sqlFile = join(dir, "load.sql");
writeFileSync(sqlFile, sql);

/**
 * РЯДОК ПІДКЛЮЧЕННЯ НЕ КЛАДЕМО В АРГУМЕНТИ. Раніше він ішов першим аргументом
 * `psql`, і на будь-якій помилці сюди друкувався `e.message`, куди Node вкладає
 * всю команду з аргументами — тобто пароль від бази. Відколи цей скрипт ганяє
 * крон у GitHub Actions, це друк у ПУБЛІЧНИЙ лог (репозиторій відкритий).
 * GitHub замальовує точне значення секрета сам, але будь-яке перетворення
 * рядка це замальовування промахує, а на ноутбуці замальовувати нікому взагалі.
 *
 * Тому підключення передається змінними оточення (їх libpq читає так само), і
 * в argv не лишається нічого таємного. Якщо в рядку трапиться параметр, якого
 * ми не знаємо, — не викидаємо його мовчки, а чесно вертаємось до старого
 * способу; на цей випадок увесь вивід проціджується через `redact`.
 */
function pgEnvFrom(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
  const env = {};
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const db = u.pathname.replace(/^\//, "");
  if (db) env.PGDATABASE = decodeURIComponent(db);
  for (const [k, v] of u.searchParams) {
    const name = PG_PARAMS[k];
    if (!name) return null; // незнайомий параметр — краще старий шлях, ніж тихо його загубити
    env[name] = v;
  }
  return env.PGHOST ? env : null;
}
const redact = (text) => String(text ?? "").replace(/postgres(ql)?:\/\/\S+/gi, "postgres://«приховано»");

const pgEnv = pgEnvFrom(dbUrl);
const psqlArgs = ["-X", "-v", "ON_ERROR_STOP=1", "-f", sqlFile];
if (!pgEnv) {
  console.log("Рядок підключення розібрати не вдалось — передаю як є (вивід проціджується).");
  psqlArgs.unshift(dbUrl);
}

try {
  const out = execFileSync(PSQL, psqlArgs, {
    encoding: "utf8",
    env: { ...process.env, ...(pgEnv || {}) },
  });
  console.log(redact(out).trim());
  console.log("✓ Пул оновлено.");
} catch (e) {
  console.error("psql помилка:", redact(e.stdout || e.message));
  process.exit(1);
}
