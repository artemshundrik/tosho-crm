/**
 * ДЕДЛАЙНИ ПРОРАХУНКУ: розбір дати й короткі підписи.
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ. `QuoteDetailsPage.tsx` уже майже десять тисяч рядків, і
 * ратчет проти розростання не пускає в неї нове. Ці функції — чиста
 * арифметика над рядком дати, без стану й без React, тож вони й мали жити тут.
 *
 * ДЕДЛАЙНИ ЗБЕРІГАЮТЬСЯ ЯК НАСТІННИЙ ЧАС. Хвіст із поясом («+00:00», «Z»)
 * навмисно ігнорується: 15:00 у картці означає 15:00 у Києві, а не те, що
 * вийде після перерахунку в поясі браузера.
 *
 * ЯК ЦЕ ВИГЛЯДАЄ В БАЗІ. Колонка — timestamptz, тобто Postgres усе одно
 * тримає момент. Але записуємо ми рядок БЕЗ пояса («2026-09-05T15:00:00»), і
 * сервер підставляє свій UTC: у базі опиняється 15:00+00, хоча мали на увазі
 * 15:00 у Києві. Пояс тут — етикетка, а не значення.
 *
 * ЦЕ НЕ ХАЛЯВА, А РІШЕННЯ, І В НЬОГО Є ЦІНА. Дедлайн «до 15:00» — обіцянка
 * замовнику в його ж годиннику, і вона не має роз'їжджатись від того, з якої
 * зони дивиться менеджер. Плата за це — той, хто пише дедлайн, мусить писати
 * настінне число, а той, кому потрібен СПРАВЖНІЙ момент (нагадування), мусить
 * перетлумачити його в Europe/Kiev: саме це робить wallClockToInstant у
 * netlify/functions/quote-deadline-reminders.ts, і саме тому воно там є.
 *
 * ЩО СТАЄТЬСЯ, КОЛИ ХТОСЬ ПИШЕ ІНАКШЕ. Візард створення прорахунку з 01.09.2026
 * писав `Date.toISOString()`, тобто справжній UTC: обраний менеджером час
 * 17:00 лягав у базу як 14:00+00, картка показувала 14:00, а нагадування
 * рахувалось від 17:00 київських — три різні відповіді на одне питання.
 * Тому запис і читання тепер живуть тут в одному примірнику: toWallClockValue
 * і parseDeadlineDate — пара, і будь-який новий вхід має брати саме їх.
 */

/** Двоцифрове число для рядка дати. */
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Date із пікера → рядок для бази, у конвенції настінного часу.
 *
 * Беремо ЛОКАЛЬНІ поля дати, а не toISOString(): менеджер обрав те, що бачив у
 * себе на екрані, і саме це число має лягти в базу. toISOString() перевів би
 * його в UTC і зсунув дедлайн на різницю поясів.
 *
 * Секунди завжди «:00» — дедлайни задаються з точністю до хвилини, а зайвий
 * розряд лише робив би два однакові дедлайни різними рядками.
 */
export const toWallClockValue = (date?: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
};

/**
 * Дата й час окремими рядками («2026-09-05», «15:00») → значення для бази.
 *
 * Порожня дата означає «дедлайну немає» — і це саме порожній рядок, а не
 * сьогоднішнє число: підставляти дату за людину тут не можна.
 */
export const combineWallClockValue = (
  date?: string | null,
  time?: string | null,
  fallbackTime = "18:00"
): string => {
  const normalizedDate = (date ?? "").trim();
  if (!normalizedDate) return "";
  const normalizedTime = (time ?? "").trim() || fallbackTime;
  // Пікер часу віддає «15:00», а база чекає повний час — дописуємо секунди.
  const withSeconds = normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime;
  return `${normalizedDate}T${withSeconds}`;
};

/** Тільки дата, без часу — для календарного пікера. */
export const toLocalDate = (value?: string | null) => {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
};

/** Дата з часом, прочитана як настінна (див. шапку модуля). */
export const parseDeadlineDate = (value?: string | null) => {
  if (!value) return null;
  const dateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (dateTimeMatch) {
    const [, y, m, d, hh, mm, ss] = dateTimeMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? "0"));
  }
  const local = toLocalDate(value);
  if (local) return local;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

/**
 * Чи стоїть дедлайн макета ПІЗНІШЕ за дедлайн відповіді замовнику (REQ-155 p8).
 *
 * Три дати прорахунку мусять іти в одному порядку: спершу погодити макет, потім
 * дати відповідь замовнику, потім відвантажити. Коли дизайн стоїть після
 * відповіді, КП летить клієнту без погодженого візуала — тобто та сама розмова
 * відбудеться вдруге, тільки вже з обіцянкою на руках.
 *
 * Порівнюємо з точністю до хвилини, а не до доби: дедлайни задаються з часом, і
 * «макет о 18:00, відповідь о 10:00 того ж дня» — це та сама пастка.
 *
 * Однієї з дат немає — не порівнюємо: незадана дата це не порушення порядку.
 */
export const isDesignDeadlineAfterAnswer = (
  designDeadline?: string | null,
  answerDeadline?: string | null
) => {
  const design = parseDeadlineDate(designDeadline);
  const answer = parseDeadlineDate(answerDeadline);
  if (!design || !answer) return false;
  return design.getTime() > answer.getTime();
};

/**
 * Скільки днів між сьогодні й дедлайном. Мінус — прострочено, нуль — сьогодні.
 *
 * Рахунок ведеться по ДОБАХ, а не по годинах: дедлайн о 10:00 не стає
 * «завтрашнім» об 11-й. Раніше ця арифметика лежала в трьох місцях трьома
 * копіями, і кожна нова мірка дедлайну починалась із неї ж.
 */
export const deadlineDiffDays = (value?: string | null): number | null => {
  const date = parseDeadlineDate(value);
  if (!date) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDeadline = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
};

export type DeadlineTabBadge = { label: string; toneClass: string | null };

/**
 * Підпис вкладки «Дедлайни» — знак, число і колір стану.
 *
 * ЩО БУЛО НЕ ТАК ІЗ ТЕКСТОМ. Підпис збирався з повного бейджа й часу, і
 * виходило «Прострочено (24 дн.) · 10:00» — 159 px у коробку завширшки 96.
 * Обрізало рівно там, де починалась інформація: слово лишалось, ЧИСЛО
 * зникало, і на вкладці висіло «Прострочено (…».
 *
 * Гірше за обрізання було те, що підпис говорив чотирма мовами залежно від
 * стану: словом («Сьогодні»), лічильником («Через 2 дн.»), датою
 * («05.09.2026») і сумішшю з часом. Тепер одна мова на всі стани:
 * «−24 дн», «Сьогодні», «+1 дн», «+11 дн».
 *
 * ЧОМУ КОЛІР. Без нього вкладка казала протилежне тому, що відбувалось:
 * червона крапка «потребує уваги» спалахувала, коли дедлайн НЕ ВКАЗАНО, а вже
 * прострочений показувався тим самим сірим, що й «Товари 1». Вкладка кричала
 * про дедлайн, якого ніхто не ставив, і мовчала про зірваний.
 *
 * ПОРОГИ ТІ САМІ, ЩО В getDeadlineBadge (<0 прострочено, 0 сьогодні, ≤2
 * скоро) — щоб підпис на вкладці й бейджі ВСЕРЕДИНІ неї не розходились:
 * відкриваєш вкладку й бачиш той самий колір, що привів тебе туди. Так само
 * зроблено в дизайн-задачі; картка прорахунку була єдиною, хто випадав.
 *
 * Фон навмисно не чіпаємо — лише текст: постійний фон у смузі вкладок означав
 * би «тут зараз щось відбувається» і сперечався б із рискою активної вкладки.
 *
 * Дедлайну немає — підпису теж немає: про це вже говорить червона крапка, і
 * слово «Не вказано» поруч із нею лише повторювало її.
 */
export const buildDeadlineTabBadge = (value?: string | null): DeadlineTabBadge | null => {
  const diffDays = deadlineDiffDays(value);
  if (diffDays === null) return null;
  const label = diffDays === 0 ? "Сьогодні" : `${diffDays < 0 ? "−" : "+"}${Math.abs(diffDays)} дн`;
  const toneClass =
    diffDays < 0 ? "text-danger-foreground" : diffDays <= 2 ? "text-warning-foreground" : null;
  return { label, toneClass };
};

/**
 * Дедлайни — теж чисті форматувальники на рівні модуля.
 *
 * Повний підпис дедлайна — «12 березня 2026 р., 15:00». Читає стрічка подій і
 * підказка під курсором у картці. Поки функція жила в тілі компонента, React
 * перестворював її щорендеру, тож чесний список залежностей перераховував би
 * всю стрічку на кожен рендер (REQ-109).
 *
 * Дедлайни зберігаються як настінний час без пояси — хвіст «+00:00»/«Z»
 * навмисно ігнорується, читаються компоненти як є.
 */
export const formatDeadlineLabel = (value?: string | null) => {
  const date = parseDeadlineDate(value);
  if (!date) return "Без дедлайну";
  const dateLabel = date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (!/T\d{2}:\d{2}/.test(value ?? "")) return dateLabel;
  return `${dateLabel}, ${date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};
