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
 */

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
