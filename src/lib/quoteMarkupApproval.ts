import { MIN_MARKUP_RATE, needsMarkupApproval } from "@/lib/quoteRuns";

/**
 * Стан погодження накрутки нижче дна 20 % (REQ-149).
 *
 * ГОЛОВНЕ ПРАВИЛО, З ЯКОГО ВИРІС ЦЕЙ ФАЙЛ: дно не блокує роботу. Прорахунок
 * нижче 20 % редагується й зберігається як завжди — замикаються тільки двері
 * назовні (КП клієнту й перехід у «Затверджено»). Тверда заборона на
 * попередньому порозі не прибирала потребу, а переносила її в цифри: у
 * TS-0826-0039 проджект вписав 1000 ₴ о 08:13 лише щоб зняти блокування, і
 * менеджер виправив на 500 ₴ о 08:15.
 */

export type QuoteMarkupApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type QuoteMarkupApproval = {
  id: string;
  quoteId: string;
  runId: string;
  status: QuoteMarkupApprovalStatus;
  /** Число, НА ЯКЕ просили. Рішення стосується саме його, а не поточного поля. */
  markupRate: number;
  /** Собівартість, ПРИ ЯКІЙ просили. Друга половина «конкретного числа». */
  costTotal: number;
  requestNote: string | null;
  requestedBy: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

export type QuoteRunMarkupState =
  /** Собівартості ще немає — поріг не вмикається, ціни теж немає. */
  | { kind: "draft"; approval: null }
  /** На дні або вище: питати нема про що. */
  | { kind: "ok"; approval: null }
  /** Нижче дна, живого запиту немає — менеджер може надіслати. */
  | { kind: "under"; approval: null }
  | { kind: "pending"; approval: QuoteMarkupApproval }
  | { kind: "rejected"; approval: QuoteMarkupApproval }
  | { kind: "approved"; approval: QuoteMarkupApproval };

export type QuoteRunMarkupStateKind = QuoteRunMarkupState["kind"];

/**
 * Похибка порівняння відсотків і сум.
 *
 * Накрутка зберігається БЕЗ округлення (scripts/quote-run-markup-rate-precision.sql):
 * перенесені з історії значення виглядають як 30,840579710144926. Точне
 * `<` на таких числах зробило б «те саме число» різним після зайвого циклу
 * читання-запису й відкривало б запит наново на порожньому місці.
 */
const EPSILON = 1e-9;

/**
 * Чи рішення ще стосується того, що зараз у тиражі.
 *
 * Домовленість (пункт p5 картки): «зміна собівартості або накрутки ВНИЗ
 * відкриває запит наново». Тобто рішення діє, поки тираж не став ГІРШИМ за те,
 * на що погоджувались: накрутка не нижча за погоджену І собівартість не нижча
 * за ту, при якій рахували. Обидва рухи вниз зменшують гроші компанії, обидва
 * рухи вгору — збільшують, тож догори правило не чіпляється й не смикає
 * погоджувача через нешкідливу правку.
 *
 * Без цієї перевірки лишалась би діра «погодили 15 %, потім переписали».
 */
export function isMarkupApprovalStillBinding(
  approval: Pick<QuoteMarkupApproval, "markupRate" | "costTotal">,
  run: { markupRate: number; costTotal: number }
): boolean {
  const markupRate = Number(run.markupRate) || 0;
  const costTotal = Number(run.costTotal) || 0;
  return (
    markupRate >= (Number(approval.markupRate) || 0) - EPSILON &&
    costTotal >= (Number(approval.costTotal) || 0) - EPSILON
  );
}

/**
 * Єдине джерело правди про стан тиражу — і для інтерфейсу, і для дверей.
 *
 * `approval` — НАЙСВІЖІШИЙ запит на цей тираж (або його відсутність).
 * Історію ми не переглядаємо: рішення завжди ухвалює останній запит, старі
 * лежать заради відповіді на «чому ця угода пішла нижче дна».
 */
export function resolveQuoteRunMarkupState(params: {
  costTotal: number;
  markupRate: number;
  approval?: QuoteMarkupApproval | null;
}): QuoteRunMarkupState {
  const costTotal = Number(params.costTotal) || 0;
  const markupRate = Number(params.markupRate) || 0;
  if (costTotal <= 0) return { kind: "draft", approval: null };
  if (!needsMarkupApproval({ costTotal, markupRate })) return { kind: "ok", approval: null };

  const approval = params.approval ?? null;
  if (!approval) return { kind: "under", approval: null };
  if (approval.status === "withdrawn") return { kind: "under", approval: null };
  if (!isMarkupApprovalStillBinding(approval, { markupRate, costTotal })) {
    return { kind: "under", approval: null };
  }
  if (approval.status === "pending") return { kind: "pending", approval };
  if (approval.status === "approved") return { kind: "approved", approval };
  return { kind: "rejected", approval };
}

/**
 * Чи замкнені двері назовні — КП клієнту й перехід у «Затверджено».
 *
 * `under` теж замикає: запит іще не надіслали, тобто ціну нижче дна ніхто не
 * бачив. Інакше «не надсилати» було б способом обійти погодження.
 */
export function isMarkupBlockingRelease(state: QuoteRunMarkupState): boolean {
  return state.kind === "under" || state.kind === "pending" || state.kind === "rejected";
}

/**
 * Чи заморожене поле накрутки.
 *
 * `pending` — інакше погодження стосувалося б не того числа, яке поїде клієнту.
 * `approved` — щоб підтверджене число не поповзло тихою правкою; опустити його
 * все одно можна лише через новий запит.
 *
 * `rejected` НЕ заморожує свідомо: після відмови менеджер має чим відповісти —
 * підняти накрутку або надіслати запит наново з поясненням.
 */
export function isMarkupFrozen(state: QuoteRunMarkupState): boolean {
  return state.kind === "pending" || state.kind === "approved";
}

/** Що зараз можна зробити із запитом (кнопки в блоці ціни). */
export function canRequestMarkupApproval(state: QuoteRunMarkupState): boolean {
  return state.kind === "under" || state.kind === "rejected";
}

export type QuoteMarkupGate = {
  /** Тиражі, які тримають двері закритими. */
  blockingRunIds: string[];
  blocked: boolean;
};

/**
 * Двері на весь прорахунок: закриті, поки хоч один тираж стоїть нижче дна без
 * чинного погодження.
 *
 * Рахуємо ПО ВСІХ тиражах, а не лише по позначеному клієнтом: у КП їдуть усі,
 * і саме тому «позначу інший тираж» не має бути обхідним шляхом.
 */
export function resolveQuoteMarkupGate(
  runs: Array<{ id: string; costTotal: number; markupRate: number; approval?: QuoteMarkupApproval | null }>
): QuoteMarkupGate {
  const blockingRunIds = runs
    .filter((run) => isMarkupBlockingRelease(resolveQuoteRunMarkupState(run)))
    .map((run) => run.id);
  return { blockingRunIds, blocked: blockingRunIds.length > 0 };
}

export const MARKUP_GATE_MESSAGE =
  `Накрутка нижче дна ${MIN_MARKUP_RATE} % — спершу погодження СЕО або головного бухгалтера. ` +
  "Рахувати й зберігати прорахунок це не заважає.";
