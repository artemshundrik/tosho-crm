/**
 * Очікуване надходження моделі постачальника (REQ-311#p16).
 *
 * Новинку, якої ще немає на складі, Тотобі віддає без ціни, а поруч — скільки
 * штук їде й на яку дату (`<wait>`, `<date_delivery>`; на сайті Тотобі —
 * «Очікується: 2000 На дату: 15-11-2026»). Без цього рядок у черзі «На сайт»
 * казав голе «немає ціни», і було незрозуміло, чи ціна загубилась, чи її просто
 * ще не дали. 09.10.2026 так стояли 36 моделей, 35 із них — саме очікувані.
 *
 * Спільне для черги в CRM і сповіщення в Telegram: обидва мусять казати одне.
 */

export type AwaitedInfo = {
  /** Скільки штук їде — сума по кольорах моделі. */
  awaited_qty: number | null;
  /** Найраніша дата надходження, київська «YYYY-MM-DD». */
  awaited_at: string | null;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayMonth(iso: string): string | null {
  const match = ISO_DATE.exec(iso);
  return match ? `${match[3]}.${match[2]}` : null;
}

function fullDate(iso: string): string | null {
  const match = ISO_DATE.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : null;
}

function hasAwaited(info: AwaitedInfo): boolean {
  return typeof info.awaited_qty === "number" && info.awaited_qty > 0;
}

/** «очікується 15.11» — у клітинку ціни; без дати — просто «очікується». */
export function awaitedShort(info: AwaitedInfo): string | null {
  if (!hasAwaited(info)) return null;
  const date = info.awaited_at ? dayMonth(info.awaited_at) : null;
  return date ? `очікується ${date}` : "очікується";
}

/** Підказка: що саме сказав постачальник і що буде далі. */
export function awaitedHint(info: AwaitedInfo): string | null {
  if (!hasAwaited(info)) return null;
  const qty = (info.awaited_qty as number).toLocaleString("uk-UA");
  const date = info.awaited_at ? fullDate(info.awaited_at) : null;
  const when = date ? ` на ${date}` : "";
  return (
    `Товару ще немає на складі — очікується ${qty} шт${when}. ` +
    "Ціну постачальник дасть із надходженням, тоді «Беремо» ввімкнеться саме."
  );
}
