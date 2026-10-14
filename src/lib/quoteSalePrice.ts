/**
 * Ціна тиражу з відсотка на собівартість — без жодних залежностей.
 *
 * Окремим модулем, а не в quoteRuns.ts (звідки реекспортується), бо цю саму
 * суму називає й серверне нагадування погоджувачам (REQ-328), а quoteRuns.ts
 * тягне за собою toshoApi з клієнтом бази. Сума в Telegram мусить бути тією,
 * що на картці, — тож формула одна.
 */

/**
 * Ціна за штуку округлюється до КОПІЙОК, і сума тиражу рахується вже з неї.
 *
 * Рішення Артема 01.09.2026: «до двох знаків після коми за штуку». Порядок тут
 * не косметика — він визначає, яке з двох чисел збігається на екрані. Раніше
 * сума ділилась на кількість «як вийде», і в КП штука × кількість не давало
 * підсумок: 504,847… ₴ × 20 показувалось як 504,85 × 20 = 10 097,00, а в
 * підсумку стояло 10 096,94. Клієнт бачить обидва числа в одному рядку, і
 * розбіг у копійки читається як помилка в рахунку.
 *
 * Тому округлюємо ціну за штуку, а суму множимо назад із неї — тоді сходиться
 * саме те, що людина перевіряє очима.
 */
export function roundUnitPrice(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Ціна тиражу за відсотком на собівартість — лише сума й штука, без розкладу.
 *
 * ОКРЕМО, БО ЇЇ РАХУЮТЬ НЕ ТІЛЬКИ З ПОЛЯ. Погодження нижче дна називає ціну на
 * дні й ціну за запитом — на собівартості, при якій просили. Банер рахував їх
 * множенням без округлення штуки й показував 90 577 ₴ поруч із 90 600 ₴ над
 * ним (TS-0926-0050): власник погоджує суму і бачить дві. Тепер обидва числа
 * йдуть звідси, а `computeRunSalePricingFromMarkup` бере звідси ж свої.
 */
export function saleAtMarkup(params: {
  quantity: number;
  costTotal: number;
  markupRate: number;
}): { saleTotal: number; saleUnitPrice: number | null } {
  const quantity = Math.max(0, Number(params.quantity) || 0);
  const costTotal = Number(params.costTotal) || 0;
  const markupRate = Math.max(0, Number(params.markupRate) || 0);
  // Ціну веде ШТУКА: округлюємо її, а суму множимо назад — див. roundUnitPrice.
  // Тираж без кількості ціни за штуку не має, тож там лишається сира сума.
  const saleUnitPrice = quantity > 0 ? roundUnitPrice((costTotal * (1 + markupRate / 100)) / quantity) : null;
  const saleTotal = saleUnitPrice === null ? costTotal * (1 + markupRate / 100) : saleUnitPrice * quantity;
  return { saleTotal, saleUnitPrice };
}

/**
 * Зворотний хід: яка накрутка дає рівно цю ціну за штуку (REQ-332).
 *
 * Ціна з тендера чи договору — це гривні, а не відсоток, і відсотком її не
 * виставити навіть із сотими: на собівартості 872,75 ₴ за штуку 0,01 % — це
 * ~9 коп, і 1 020,00 ₴ лежить між 16,87 % (1 019,98) і 16,88 % (1 020,07)
 * (TS-1026-0002). Тому відсоток повертається НЕОКРУГЛЕНИМ: база тримає його
 * повністю, а `saleAtMarkup` з нього округлює штуку назад рівно до введеної.
 *
 * Ціна нижче собівартості дає нуль, а не від'ємну накрутку — як і поле
 * відсотка, яке нижче нуля не пускає. Без кількості чи собівартості ціни за
 * штуку не існує, тож і відповіді немає.
 */
export function markupRateForUnitPrice(params: {
  quantity: number;
  costTotal: number;
  unitPrice: number;
}): number | null {
  const quantity = Math.max(0, Number(params.quantity) || 0);
  const costTotal = Number(params.costTotal) || 0;
  const unitPrice = Number(params.unitPrice);
  if (quantity <= 0 || costTotal <= 0 || !Number.isFinite(unitPrice)) return null;
  return Math.max(0, ((roundUnitPrice(unitPrice) * quantity) / costTotal - 1) * 100);
}
