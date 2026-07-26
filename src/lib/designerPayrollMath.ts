/**
 * Чиста арифметика заробітку дизайнера — БЕЗ мережі й без supabase.
 *
 * Винесено окремо від `designerPayroll.ts` навмисно: ці функції рахують гроші,
 * тому мають бути покриті тестами, а тест не повинен тягнути браузерний
 * supabase-клієнт. I/O живе в `designerPayroll.ts`, який реекспортує це все.
 *
 * Модель і рішення: docs/DESIGNER_PAYROLL_DESIGN.md
 */

export type DesignerPayDefaults = {
  visualNorm: number;
  overNormRate: number;
  creativePercent: number;
  minCreativeCost: number;
};

export type DesignerPayRate = {
  baseMonthRate: number;
  visualNorm: number | null;
  overNormRate: number | null;
  creativePercent: number | null;
  effectiveFrom: string;
};

/** Ефективні умови = індивідуальний override поверх командних дефолтів. */
export type EffectivePayTerms = {
  baseMonthRate: number;
  visualNorm: number;
  overNormRate: number;
  creativePercent: number;
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
  /** Робочі дні місяця та скільки з них уже минуло (з урахуванням відсутностей). */
  workdaysTotal: number;
  workdaysPassed: number;
  /** Накопичена база на сьогодні. */
  baseAccrued: number;
  /** Унікальні візуали за місяць (не файли!) і скільки з них понад норму. */
  visuals: number;
  visualFiles: number;           // сирі файли — довідково, показує масштаб перезаливів
  visualsOverNorm: number;
  overNormPay: number;
  /** Платні креативи: зараховані (approved) і ті, що чекають затвердження. */
  creatives: CreativePay[];
  creativesPay: number;
  creativesPendingPay: number;
  /** Разом на сьогодні + прогноз на кінець місяця. */
  earnedTotal: number;
  forecastTotal: number;
  forecastVisuals: number;
};

const pad2 = (value: number) => String(value).padStart(2, "0");
export const monthKeyOf = (date: Date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

const monthBounds = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
};

/**
 * Робочі дні місяця: пн–пт, скориговані винятками календаря, мінус дні
 * відсутності (відпустка/лікарняний) — під час них лічильник бази стоїть.
 *
 * `asOf` = «сьогодні»: дні рахуються включно з поточним, бо робочий день, що
 * триває, вже оплачується.
 */
export function countWorkdays(params: {
  monthKey: string;
  asOf?: Date;
  /** day (YYYY-MM-DD) → is_workday. Перебиває правило «пн–пт». */
  exceptions?: Map<string, boolean>;
  /** Діапазони відсутності [початок, кінець] включно, YYYY-MM-DD. */
  absences?: Array<{ start: string; end: string }>;
}): { total: number; passed: number } {
  const { from, to } = monthBounds(params.monthKey);
  const asOf = params.asOf ?? new Date();
  const exceptions = params.exceptions ?? new Map<string, boolean>();
  const absences = params.absences ?? [];

  let total = 0;
  let passed = 0;
  for (let day = new Date(from); day < to; day.setUTCDate(day.getUTCDate() + 1)) {
    const key = `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
    const weekday = day.getUTCDay(); // 0 = нд, 6 = сб
    const isWorkdayByDefault = weekday !== 0 && weekday !== 6;
    const isWorkday = exceptions.has(key) ? exceptions.get(key)! : isWorkdayByDefault;
    if (!isWorkday) continue;
    const absent = absences.some((range) => key >= range.start && key <= range.end);
    if (absent) continue;
    total += 1;
    // Порівнюємо календарні дати, а не миті часу: день зараховується цілком.
    const asOfKey = `${asOf.getUTCFullYear()}-${pad2(asOf.getUTCMonth() + 1)}-${pad2(asOf.getUTCDate())}`;
    if (key <= asOfKey) passed += 1;
  }
  return { total, passed };
}

/** Індивідуальні значення перебивають командні; null = «беремо дефолт». */
export function resolveTerms(rate: DesignerPayRate, defaults: DesignerPayDefaults): EffectivePayTerms {
  return {
    baseMonthRate: rate.baseMonthRate,
    visualNorm: rate.visualNorm ?? defaults.visualNorm,
    overNormRate: rate.overNormRate ?? defaults.overNormRate,
    creativePercent: rate.creativePercent ?? defaults.creativePercent,
  };
}

/** Чинна на місяць ставка = найпізніша з effective_from <= 1 число місяця. */
export function pickRateForMonth(rates: DesignerPayRate[], monthKey: string): DesignerPayRate | null {
  const firstDay = `${monthKey}-01`;
  const applicable = rates
    .filter((rate) => rate.effectiveFrom <= firstDay)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0] ?? null;
}

/**
 * Чиста функція підрахунку — вся арифметика тут, щоб її можна було перевірити
 * без мережі й без React.
 */
export function computeEarnings(input: {
  monthKey: string;
  terms: EffectivePayTerms;
  workdaysTotal: number;
  workdaysPassed: number;
  visuals: number;
  visualFiles: number;
  creatives?: CreativePay[];
}): DesignerEarnings {
  const { terms, workdaysTotal, workdaysPassed, visuals, visualFiles } = input;
  const creatives = input.creatives ?? [];
  const ratio = workdaysTotal > 0 ? workdaysPassed / workdaysTotal : 0;
  const baseAccrued = Math.round(terms.baseMonthRate * ratio);

  const visualsOverNorm = Math.max(0, visuals - terms.visualNorm);
  const overNormPay = Math.round(visualsOverNorm * terms.overNormRate);

  // Креативи: у «зароблено» йдуть лише затверджені; решта — тільки в прогноз.
  const creativesPay = creatives.filter((item) => item.earned).reduce((sum, item) => sum + item.payout, 0);
  const creativesPendingPay = creatives.filter((item) => !item.earned).reduce((sum, item) => sum + item.payout, 0);

  // Прогноз: лінійна екстраполяція темпу візуалів на повний місяць.
  // Поки жодного робочого дня не минуло — прогнозувати нема з чого.
  const forecastVisuals =
    workdaysPassed > 0 ? Math.round((visuals / workdaysPassed) * workdaysTotal) : visuals;
  const forecastOverNorm = Math.max(0, forecastVisuals - terms.visualNorm);
  // Прогноз включає і те, що чекає затвердження: менеджер уже назвав суму,
  // тож дизайнеру чесно показати, на що він виходить.
  const forecastTotal = Math.round(
    terms.baseMonthRate + forecastOverNorm * terms.overNormRate + creativesPay + creativesPendingPay
  );

  return {
    month: input.monthKey,
    terms,
    workdaysTotal,
    workdaysPassed,
    baseAccrued,
    visuals,
    visualFiles,
    visualsOverNorm,
    overNormPay,
    creatives,
    creativesPay,
    creativesPendingPay,
    earnedTotal: baseAccrued + overNormPay + creativesPay,
    forecastTotal,
    forecastVisuals,
  };
}

/** Скільки дизайнер отримає з платного креативу. Єдина точка правди для UI і розрахунку. */
export function creativePayout(projectCost: number, creativePercent: number) {
  if (!Number.isFinite(projectCost) || projectCost <= 0) return 0;
  return Math.round((projectCost * creativePercent) / 100);
}
