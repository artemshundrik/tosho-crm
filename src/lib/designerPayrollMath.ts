/**
 * Чиста арифметика заробітку дизайнера — БЕЗ мережі й без supabase.
 *
 * Винесено окремо від `designerPayroll.ts` навмисно: ці функції рахують гроші,
 * тому мають бути покриті тестами, а тест не повинен тягнути браузерний
 * supabase-клієнт. I/O живе в `designerPayroll.ts`, який реекспортує це все.
 *
 * Модель і рішення: docs/DESIGNER_PAYROLL_DESIGN.md
 *
 * НОРМА — ДЕННА (рішення CEO 2026-07-26). Місячна норма була несправедлива:
 * у травні 2026 — 21 робочий день, у липні — 23, тобто до 10% різниці на
 * рівному місці. Тепер норма = «стільки робіт на робочий день» × робочі дні
 * людини, і відпустка з лікарняним зменшують її самі.
 *
 * Рахуються ДВА види робіт із різними нормами й тарифами: візуали
 * (`output_kind='visualization'`) і макети (все інше). Одиниця — унікальна
 * робота `(задача + назва файлу без розширення)`, а не файл: один візуал
 * перезаливають після правок по 5–9 разів.
 */

export type DesignerPayDefaults = {
  visualNormPerDay: number;
  layoutNormPerDay: number;
  visualOverRate: number;
  layoutOverRate: number;
  creativePercent: number;
  minCreativeCost: number;
};

export type DesignerPayRate = {
  /** Заповнюється, коли ставки читаються пачкою на кількох людей. */
  userId?: string | null;
  baseMonthRate: number;
  /** null у будь-якому полі = «беремо командний дефолт». */
  visualNormPerDay: number | null;
  layoutNormPerDay: number | null;
  visualOverRate: number | null;
  layoutOverRate: number | null;
  creativePercent: number | null;
  effectiveFrom: string;
};

/** Ефективні умови = індивідуальний override поверх командних дефолтів. */
export type EffectivePayTerms = {
  baseMonthRate: number;
  visualNormPerDay: number;
  layoutNormPerDay: number;
  visualOverRate: number;
  layoutOverRate: number;
  creativePercent: number;
};

/** Скільки унікальних робіт і скільки сирих файлів за ними стоїть. */
export type OutputCounts = {
  works: number;
  files: number;
};

/** Підсумок по одному виду робіт (візуали або макети). */
export type OutputEarnings = {
  works: number;
  /** Сирі файли — довідково, показує масштаб перезаливів. На гроші не впливають. */
  files: number;
  normPerDay: number;
  overRate: number;
  /** Норма, набрана на сьогодні: `normPerDay × нормо-днів, що минули`. */
  normToDate: number;
  /** Норма на повний місяць — для прогнозу й підпису «з N». */
  normFull: number;
  over: number;
  pay: number;
  forecastWorks: number;
  forecastOver: number;
  forecastPay: number;
};

/**
 * Платний креатив у розрахунку.
 * `earned` = гроші вже зароблені (задача «Затверджено»); інакше сума лише в
 * прогнозі. Відкат статусу автоматично прибирає нарахування, бо розрахунок
 * завжди читає поточний стан задачі.
 */
export type CreativePay = {
  taskId: string;
  taskNumber: string | null;
  title: string | null;
  projectCost: number;
  payout: number;
  earned: boolean;
};

export type DesignerEarnings = {
  month: string;                 // "2026-07"
  terms: EffectivePayTerms;
  /** Робочі дні місяця та скільки з них уже минуло — БАЗА (відсутності не віднімаються). */
  workdaysTotal: number;
  workdaysPassed: number;
  /** Ті самі дні мінус відпустки/лікарняні — НОРМА. */
  normDaysTotal: number;
  normDaysPassed: number;
  /** Ті самі дні поденно — для сітки квадратиків. Порожній масив, якщо не завантажували. */
  workdays: WorkdayCell[];
  /** Накопичена база на сьогодні. */
  baseAccrued: number;
  visuals: OutputEarnings;
  layouts: OutputEarnings;
  /** Доплата понад норму за обидва види разом. */
  overNormPay: number;
  /** Платні креативи: зараховані (approved) і ті, що чекають затвердження. */
  creatives: CreativePay[];
  creativesPay: number;
  creativesPendingPay: number;
  /** Разом на сьогодні + прогноз на кінець місяця. */
  earnedTotal: number;
  forecastTotal: number;
};

/**
 * ОДИНИЦЯ ВИРОБІТКУ — спільна для зарплати і для дашборда «Дизайнери».
 *
 * Робота = (задача + назва файлу без розширення), у нижньому регістрі. Саме тому
 * `макет.ai` + `макет.pdf` — одна робота, а не дві, і перезалив після правок під
 * тією самою назвою нової роботи не додає.
 *
 * Живе тут, а не в кожному місці окремо: якщо дашборд і зарплата порахують
 * по-різному, дизайнер побачить одну цифру у віджеті й іншу на сторінці.
 */
export const outputWorkKey = (taskId: string | null | undefined, fileName: string) =>
  `${taskId ?? "?"}:${fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "")}`;

/** Вид роботи за подією завантаження: усе, що не `visualization`, — макет. */
export const outputWorkKind = (outputKind: string | null | undefined): "visualization" | "layout" =>
  outputKind === "visualization" ? "visualization" : "layout";

/**
 * З якого місяця діє правило «видалене того ж місяця не рахується»
 * (рішення CEO: з нового місяця, 2026-08).
 *
 * Раніше застосувати його неможливо технічно: видалення почали логуватись лише
 * 27.07.2026, тож для попередніх місяців даних про них просто немає.
 *
 * ЧОМУ САМЕ «ТОГО Ж МІСЯЦЯ», а не «видалене будь-коли»:
 *  · місяць застигає сам. Видалення у жовтні не має права переписати серпень,
 *    який уже виплачено — інакше зарплата стає заднім числом мінливою, і без
 *    снапшотів це небезпечно;
 *  · так збігається зі змістом. Перезалив під новою назвою після правок
 *    трапляється за дні (TS-0526-0041: залито 15.05, замінено 27–28.05) — це
 *    і є подвійний рахунок. А прибирання зданої роботи через місяць-два
 *    (TS-0426-0055) — це вже наведення ладу, і воно лишається зарахованим.
 */
export const DELETED_WORKS_RULE_FROM_MONTH = "2026-08";

/** Порівняння рядків "YYYY-MM" працює лексикографічно — окремий парсер не потрібен. */
export const isDeletedWorksRuleActive = (monthKey: string) => monthKey >= DELETED_WORKS_RULE_FROM_MONTH;

/**
 * Чи зараховується робота: хоч один її файл пережив місяць.
 * Порожній список файлів роботою не є.
 */
export const workSurvivedMonth = (fileIds: string[], deletedInMonth: Set<string>) =>
  fileIds.some((id) => !deletedInMonth.has(id));

const pad2 = (value: number) => String(value).padStart(2, "0");
export const monthKeyOf = (date: Date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

const monthBounds = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
};

/** Діапазон відсутності; kind/comment потрібні лише для показу в сітці днів. */
export type AbsenceRange = {
  /** YYYY-MM-DD, включно. */
  start: string;
  /** YYYY-MM-DD, включно. */
  end: string;
  kind?: string;
  comment?: string | null;
};

/** Один робочий день місяця — клітинка сітки у віджеті заробітку. */
export type WorkdayCell = {
  /** YYYY-MM-DD */
  day: string;
  /** Уже минув (включно із сьогоднішнім). */
  passed: boolean;
  /** Не null, якщо цього дня людина була відсутня. */
  absence: { kind: string; comment: string | null } | null;
};

type WorkdayParams = {
  monthKey: string;
  asOf?: Date;
  /** day (YYYY-MM-DD) → is_workday. Перебиває правило «пн–пт». */
  exceptions?: Map<string, boolean>;
  absences?: AbsenceRange[];
};

/**
 * Перелік робочих днів місяця: пн–пт, скориговані винятками календаря.
 *
 * Дні відсутності ЛИШАЮТЬСЯ у списку, але позначені `absence` — сітка має їх
 * показати іншим кольором, а не проковтнути. Рішення «віднімати їх від бази
 * чи ні» приймає `countWorkdays`, а не цей перелік.
 *
 * `asOf` = «сьогодні»: день зараховується цілком, тобто поточний уже `passed`,
 * бо робочий день, що триває, вже оплачується.
 */
export function listWorkdays(params: WorkdayParams): WorkdayCell[] {
  const { from, to } = monthBounds(params.monthKey);
  const asOf = params.asOf ?? new Date();
  const exceptions = params.exceptions ?? new Map<string, boolean>();
  const absences = params.absences ?? [];
  // Порівнюємо календарні дати, а не миті часу.
  const asOfKey = `${asOf.getUTCFullYear()}-${pad2(asOf.getUTCMonth() + 1)}-${pad2(asOf.getUTCDate())}`;

  const cells: WorkdayCell[] = [];
  for (let day = new Date(from); day < to; day.setUTCDate(day.getUTCDate() + 1)) {
    const key = `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
    const weekday = day.getUTCDay(); // 0 = нд, 6 = сб
    const isWorkdayByDefault = weekday !== 0 && weekday !== 6;
    const isWorkday = exceptions.has(key) ? exceptions.get(key)! : isWorkdayByDefault;
    if (!isWorkday) continue;
    const match = absences.find((range) => key >= range.start && key <= range.end);
    cells.push({
      day: key,
      passed: key <= asOfKey,
      absence: match ? { kind: match.kind ?? "other", comment: match.comment ?? null } : null,
    });
  }
  return cells;
}

/**
 * Робочі дні місяця: пн–пт, скориговані винятками календаря, мінус дні
 * відсутності (якщо їх передали) — під час них лічильник стоїть.
 *
 * Викликається ДВІЧІ з різними аргументами, і це навмисно:
 *  · для БАЗИ — без `absences` (лікарняний не зменшує ставку);
 *  · для НОРМИ — з `absences` (за день хвороби норму не набирають).
 * Асиметрія на користь людини, рішення CEO 2026-07-26.
 *
 * Рахується з того самого переліку, що малює сітку, щоб цифри «18 з 23» і
 * кількість квадратиків не могли розійтися.
 */
export function countWorkdays(params: WorkdayParams): { total: number; passed: number } {
  const counted = listWorkdays(params).filter((cell) => !cell.absence);
  return {
    total: counted.length,
    passed: counted.filter((cell) => cell.passed).length,
  };
}

/** Індивідуальні значення перебивають командні; null = «беремо дефолт». */
export function resolveTerms(rate: DesignerPayRate, defaults: DesignerPayDefaults): EffectivePayTerms {
  return {
    baseMonthRate: rate.baseMonthRate,
    visualNormPerDay: rate.visualNormPerDay ?? defaults.visualNormPerDay,
    layoutNormPerDay: rate.layoutNormPerDay ?? defaults.layoutNormPerDay,
    visualOverRate: rate.visualOverRate ?? defaults.visualOverRate,
    layoutOverRate: rate.layoutOverRate ?? defaults.layoutOverRate,
    creativePercent: rate.creativePercent ?? defaults.creativePercent,
  };
}

/** Чинна на місяць ставка = найпізніша з effective_from <= 1 число місяця. */
// Узагальнена по типу навмисно: те саме правило потрібне зарплатній відомості
// («Виплати команді» підставляє чинну базову ставку), а їй вистачає пари
// {effectiveFrom, baseMonthRate}. Дублювати правило вибору ставки в двох місцях
// не можна — розійдуться.
export function pickRateForMonth<T extends { effectiveFrom: string }>(
  rates: T[],
  monthKey: string
): T | null {
  const firstDay = `${monthKey}-01`;
  const applicable = rates
    .filter((rate) => rate.effectiveFrom <= firstDay)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0] ?? null;
}

/**
 * Один вид робіт: скільки зроблено проти норми на сьогодні й скільки за це
 * доплатять.
 *
 * Норма «на сьогодні», а не на весь місяць — інакше до останнього дня місяця
 * доплата показувала б нуль, а потім стрибала. Побічний ефект: якщо дизайнер
 * вирвався вперед, а потім пригальмував, доплата в віджеті може зменшитись —
 * це чесне відображення live-розрахунку, а не помилка.
 */
function computeOutput(params: {
  counts: OutputCounts;
  normPerDay: number;
  overRate: number;
  normDaysTotal: number;
  normDaysPassed: number;
}): OutputEarnings {
  const { counts, normPerDay, overRate, normDaysTotal, normDaysPassed } = params;
  const normToDate = normPerDay * normDaysPassed;
  const normFull = normPerDay * normDaysTotal;

  const over = Math.max(0, counts.works - normToDate);
  const pay = Math.round(over * overRate);

  // Прогноз: темп за нормо-днями, екстрапольований на повний місяць.
  const forecastWorks =
    normDaysPassed > 0 ? Math.round((counts.works / normDaysPassed) * normDaysTotal) : counts.works;
  const forecastOver = Math.max(0, forecastWorks - normFull);

  return {
    works: counts.works,
    files: counts.files,
    normPerDay,
    overRate,
    normToDate,
    normFull,
    over,
    pay,
    forecastWorks,
    forecastOver,
    forecastPay: Math.round(forecastOver * overRate),
  };
}

/**
 * Чиста функція підрахунку — вся арифметика тут, щоб її можна було перевірити
 * без мережі й без React.
 */
export function computeEarnings(input: {
  monthKey: string;
  terms: EffectivePayTerms;
  /** Дні для БАЗИ (без вирахування відсутностей). */
  workdaysTotal: number;
  workdaysPassed: number;
  /** Дні для НОРМИ (мінус відсутності). Не передали — беремо ті самі, що для бази. */
  normDaysTotal?: number;
  normDaysPassed?: number;
  visuals: OutputCounts;
  layouts: OutputCounts;
  creatives?: CreativePay[];
  /** Поденна сітка для показу. На гроші не впливає — лічильники беруться з workdays*. */
  workdays?: WorkdayCell[];
}): DesignerEarnings {
  const { terms, workdaysTotal, workdaysPassed } = input;
  const normDaysTotal = input.normDaysTotal ?? workdaysTotal;
  const normDaysPassed = input.normDaysPassed ?? workdaysPassed;
  const creatives = input.creatives ?? [];

  const ratio = workdaysTotal > 0 ? workdaysPassed / workdaysTotal : 0;
  const baseAccrued = Math.round(terms.baseMonthRate * ratio);

  const visuals = computeOutput({
    counts: input.visuals,
    normPerDay: terms.visualNormPerDay,
    overRate: terms.visualOverRate,
    normDaysTotal,
    normDaysPassed,
  });
  const layouts = computeOutput({
    counts: input.layouts,
    normPerDay: terms.layoutNormPerDay,
    overRate: terms.layoutOverRate,
    normDaysTotal,
    normDaysPassed,
  });
  const overNormPay = visuals.pay + layouts.pay;

  // Креативи: у «зароблено» йдуть лише затверджені; решта — тільки в прогноз.
  const creativesPay = creatives.filter((item) => item.earned).reduce((sum, item) => sum + item.payout, 0);
  const creativesPendingPay = creatives.filter((item) => !item.earned).reduce((sum, item) => sum + item.payout, 0);

  // Прогноз включає і те, що чекає затвердження: менеджер уже назвав суму,
  // тож дизайнеру чесно показати, на що він виходить.
  const forecastTotal = Math.round(
    terms.baseMonthRate + visuals.forecastPay + layouts.forecastPay + creativesPay + creativesPendingPay
  );

  return {
    month: input.monthKey,
    terms,
    workdaysTotal,
    workdaysPassed,
    normDaysTotal,
    normDaysPassed,
    workdays: input.workdays ?? [],
    baseAccrued,
    visuals,
    layouts,
    overNormPay,
    creatives,
    creativesPay,
    creativesPendingPay,
    earnedTotal: baseAccrued + overNormPay + creativesPay,
    forecastTotal,
  };
}

/** Скільки дизайнер отримає з платного креативу. Єдина точка правди для UI і розрахунку. */
export function creativePayout(projectCost: number, creativePercent: number) {
  if (!Number.isFinite(projectCost) || projectCost <= 0) return 0;
  return Math.round((projectCost * creativePercent) / 100);
}
