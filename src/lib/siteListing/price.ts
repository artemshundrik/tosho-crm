/**
 * Ціна на сайті = роздріб постачальника × 0,99, вниз до цілої гривні
 * (рішення власника 01.10.2026: «ціна на сайті постачальника −1%»).
 *
 * РАХУЄМО В КОПІЙКАХ ЦІЛИМИ, як велить спека: ціна з фіду — двійковий дріб
 * (1,15 × 100 = 114,999…), і на самій межі гривні округлення вниз з'їло б
 * цілу гривню. `round(ціна × 100)` знімає хвіст, далі множення й ділення —
 * над цілими.
 *
 * null — ціни немає або вона безглузда: таку модель взяти не можна.
 */
export function siteListingPrice(supplierRetail: number | null | undefined): number | null {
  if (typeof supplierRetail !== "number" || !Number.isFinite(supplierRetail) || supplierRetail <= 0) {
    return null;
  }
  const kopecks = Math.round(supplierRetail * 100);
  const price = Math.floor((kopecks * 99) / 10000);
  return price >= 1 ? price : null;
}
