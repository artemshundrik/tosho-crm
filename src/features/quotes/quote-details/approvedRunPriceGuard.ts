import { getRunSalePricingFromRun } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Чи міняється ціна тиражу, який клієнт уже погодив (REQ-178#p10).
 *
 * ЩО БУЛО НЕ ТАК. Позначка «погоджено клієнтом» вирішує, яка ціна поїде в
 * замовлення й у КП, — але правити її після цього можна було так само тихо, як
 * будь-яку іншу: тиражі зберігаються самі, без кнопки. Слід лишався тільки в
 * журналі змін, тобто там, куди дивляться вже після того, як розбіжність із
 * замовником спливла.
 *
 * ПОРІВНЮЄМО ЦІНУ, А НЕ ПОЛЯ. Ціна тиражу складається з чотирьох витрат,
 * накрутки, ставки менеджера, постійних і ПДВ — і кожне з цих полів має свою
 * посаду. Сторожити список полів означало б питати на правках, які підсумку не
 * міняють (перекладання витрати з логістики в нанесення), і мовчати там, де
 * два поля зрушили ціну назустріч одне одному. Тому питання одне: чи стала
 * інакшою `saleTotal`.
 *
 * ЛИШЕ ЯВНА ПОЗНАЧКА. `pickApprovedRun` вважає погодженим і одинокий тираж без
 * позначки — тут це навмисно НЕ так: прорахунок з одним тиражем частіше за все
 * ще рахують, і питати про кожну правку означало б зробити попередження шумом,
 * який навчаються прощіпувати. Сторожимо те, про що людина сказала «так».
 *
 * ЗМІНА САМОЇ ПОЗНАЧКИ ПИТАННЯ НЕ СТАВИТЬ: погодженим тираж мусить бути ДО
 * правки, інакше ми питали б у момент, коли ціну щойно й погодили.
 */

export type ApprovedRunPriceChange = {
  runId: string;
  quantity: number;
  /** Сума тиражу до правки. */
  before: number;
  /** Сума тиражу після правки. */
  after: number;
};

/** У копійках: різниця в соті частки — це похибка float, а не зміна ціни. */
const toKopiyky = (value: number) => Math.round((Number(value) || 0) * 100);

export function findApprovedRunPriceChanges(
  next: QuoteRun[],
  original: QuoteRun[]
): ApprovedRunPriceChange[] {
  const approvedBefore = new Map<string, QuoteRun>();
  for (const run of original) {
    if (run.is_approved === true && run.id) approvedBefore.set(run.id, run);
  }
  if (approvedBefore.size === 0) return [];

  const changes: ApprovedRunPriceChange[] = [];
  for (const run of next) {
    if (!run.id) continue;
    const was = approvedBefore.get(run.id);
    if (!was) continue;
    const before = getRunSalePricingFromRun(was).saleTotal;
    const after = getRunSalePricingFromRun(run).saleTotal;
    if (toKopiyky(before) === toKopiyky(after)) continue;
    changes.push({ runId: run.id, quantity: Math.max(0, Number(run.quantity) || 0), before, after });
  }
  return changes;
}

/**
 * Повернути погоджені тиражі до збережених значень, не чіпаючи решту.
 *
 * Відмова означає «цю ціну не чіпаємо», а не «викинь усе, що я щойно набрав»:
 * в одному заході правлять кілька тиражів, і скидати сусідні означало б
 * карати за обережність.
 */
export function revertApprovedRunPrices(
  current: QuoteRun[],
  original: QuoteRun[],
  changes: ApprovedRunPriceChange[]
): QuoteRun[] {
  if (changes.length === 0) return current;
  const revertTo = new Map<string, QuoteRun>();
  for (const change of changes) {
    const was = original.find((run) => run.id === change.runId);
    if (was) revertTo.set(change.runId, was);
  }
  return current.map((run) => (run.id ? (revertTo.get(run.id) ?? run) : run));
}
