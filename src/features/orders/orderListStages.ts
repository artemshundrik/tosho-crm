import {
  balanceDaysShort,
  buildLaunchPath,
  isFullyDeferred,
  LAUNCHED_ORDER_STATUSES,
  PREPAYMENT_RECEIVED,
  resolveBreakdown,
  SHIPPED_ORDER_STATUSES,
  type LaunchPathInput,
} from "./orderLaunchPath";
import { getOrderInvoiceState } from "./orderInvoice";
import type { DerivedOrderRecord } from "./orderRecords";
import { isCashlessPaymentMethod } from "./paymentRules";

/**
 * Список замовлень (REQ-322#p12): етап, що далі й чий хід — для смуги етапів
 * і колонки «Що далі». Хід бухгалтерії — рахунок, який попросили (p10).
 * Погоджень (p6) і підписів (p7) ще немає в даних; коли з'являться, нові
 * гілки додаються в `getOrderNextStep`.
 */
export type OrderListInput = LaunchPathInput &
  Pick<
    DerivedOrderRecord,
    | "deliveryStatus"
    | "designStatuses"
    | "invoiceCreatedAt"
    | "invoiceNumber"
    | "invoiceRequestedAt"
    | "invoiceReturnNote"
    | "inheritedContractOrderNumber"
    | "managerUserId"
  >;

export type ActiveOrderStage = "setup" | "customer" | "production" | "shipment" | "awaitingPayment";
export type OrderStage = ActiveOrderStage | "done" | "cancelled";

export const ACTIVE_ORDER_STAGES: { id: ActiveOrderStage; label: string }[] = [
  { id: "setup", label: "Оформлення" },
  { id: "customer", label: "Чекають замовника" },
  { id: "production", label: "У виробництві" },
  { id: "shipment", label: "Відвантаження" },
  { id: "awaitingPayment", label: "Чекають оплату" },
];

export type OrderTurn = "manager" | "customer" | "production" | "accounting";

export const ORDER_TURN_LABELS: Record<OrderTurn, string> = {
  manager: "Менеджер",
  customer: "Замовник",
  production: "Виробництво",
  accounting: "Бухгалтерія",
};

export type OrderNextStep = {
  stage: OrderStage;
  turn: OrderTurn | null;
  title: string;
  detail: string | null;
  /** Скільки чекаємо від замовника; форматує інтерфейс. */
  amountDue: number | null;
  /** Підпис кнопки в рядку. Кнопка відкриває картку — дія робиться там. */
  actionLabel: string | null;
};

const SHIPPED_DELIVERY = new Set(["shipped", "delivered", "partially_delivered", "unclaimed"]);

const step = (partial: Partial<OrderNextStep> & Pick<OrderNextStep, "stage" | "title">): OrderNextStep => ({
  turn: null,
  detail: null,
  amountDue: null,
  actionLabel: null,
  ...partial,
});

const share = (input: OrderListInput, pct: number) => Math.round(((Number(input.total) || 0) * pct)) / 100;

export const getOrderNextStep = (input: OrderListInput): OrderNextStep => {
  if (input.designStatuses.includes("cancelled")) return step({ stage: "cancelled", title: "Скасовано" });

  const breakdown = resolveBreakdown(input);
  const fullyPaid = input.paymentStatus === "fully_paid";
  const shipped = SHIPPED_ORDER_STATUSES.has(input.orderStatus) || SHIPPED_DELIVERY.has(input.deliveryStatus);

  if (input.orderStatus === "completed" || (shipped && fullyPaid)) return step({ stage: "done", title: "Завершено" });

  // Неоплачена частина: доплата після передоплати або все, якщо нічого не прийшло.
  const unpaidPct = PREPAYMENT_RECEIVED.has(input.paymentStatus) ? (breakdown?.balance ?? 0) : 100;

  if (shipped) {
    const deferred = input.balanceTiming === "after_shipment";
    return step({
      stage: "awaitingPayment",
      turn: "customer",
      title: deferred ? "Оплата після ВН" : `Доплата ${unpaidPct}%`,
      detail: deferred ? `до ${balanceDaysShort(input)}` : null,
      amountDue: share(input, unpaidPct),
    });
  }

  if (input.orderStatus === "ready" || input.deliveryStatus === "preparing_shipment") {
    const owesBeforeShipment = !fullyPaid && input.balanceTiming !== "after_shipment" && unpaidPct > 0;
    return owesBeforeShipment
      ? step({
          stage: "shipment",
          turn: "customer",
          title: `Доплата ${unpaidPct}% — без неї не відвантажуємо`,
          amountDue: share(input, unpaidPct),
        })
      : step({ stage: "shipment", turn: "manager", title: "Готово — відвантажити", actionLabel: "Відвантажити" });
  }

  if (LAUNCHED_ORDER_STATUSES.has(input.orderStatus)) {
    return step({ stage: "production", turn: "production", title: "Виробництво" });
  }

  switch (buildLaunchPath(input).blocker) {
    case "Бракує договору":
      return step({ stage: "setup", turn: "manager", title: "Створити договір", actionLabel: "Договір" });
    case "Бракує СП":
      return step({ stage: "setup", turn: "manager", title: "Створити СП", actionLabel: "Створити СП" });
    case "Чекає передоплату": {
      const pct = breakdown?.prepayment ?? 100;
      // На безготівці замовник платить за рахунком, а рахунок виписує бухгалтерія.
      if (isCashlessPaymentMethod(input.paymentMethodId, input.paymentRail)) {
        const invoice = getOrderInvoiceState(input);
        if (invoice === "requested") {
          return step({ stage: "setup", turn: "accounting", title: "Рахунок у бухгалтерії", actionLabel: "Внести номер" });
        }
        if (invoice !== "issued") {
          return step({
            stage: "setup",
            turn: "manager",
            title: invoice === "returned" ? "Рахунок повернули — виправити" : "Попросити рахунок",
            detail: invoice === "returned" ? input.invoiceReturnNote : null,
            actionLabel: "Рахунок",
          });
        }
      }
      return step({
        stage: "customer",
        turn: "customer",
        title: `Передоплата ${pct}%`,
        amountDue: share(input, pct),
      });
    }
    default:
      return step({ stage: "setup", turn: "manager", title: "Можна запускати", actionLabel: "Запустити" });
  }
};

/** Скільки оплачено — зі статусу оплати: журнал оплат живе у Фінансах і менеджерам закритий. */
export const getOrderPaidShare = (input: OrderListInput): { pct: number; label: string } => {
  if (input.paymentStatus === "fully_paid") return { pct: 100, label: "Оплачено" };
  const breakdown = resolveBreakdown(input);
  if (PREPAYMENT_RECEIVED.has(input.paymentStatus)) {
    const pct = breakdown?.prepayment ?? 0;
    const waitsBalance =
      (breakdown?.balance ?? 0) > 0 &&
      (input.orderStatus === "ready" || SHIPPED_ORDER_STATUSES.has(input.orderStatus));
    return { pct, label: waitsBalance ? `чекає ${breakdown?.balance}%` : `${pct}% є` };
  }
  if (isFullyDeferred(input)) return { pct: 0, label: `${balanceDaysShort(input)} після ВН` };
  if (breakdown?.prepayment === 0) return { pct: 0, label: "після готовності" };
  return { pct: 0, label: breakdown ? `0 з ${breakdown.prepayment}%` : "не оплачено" };
};

export type OrderDocMark = {
  key: string;
  letter: string;
  title: string;
  ready: boolean;
  /** Документ у роботі в когось (рахунок у бухгалтерії) — обведена плашка. */
  inProgress?: boolean;
};

/**
 * Д/С/Р/В — лише для безготівки. Видаткова в CRM ще не формується (REQ-322#p3),
 * тож «В» поки завжди «ще ні».
 */
export const getOrderDocMarks = (input: OrderListInput): OrderDocMark[] | null => {
  if (!isCashlessPaymentMethod(input.paymentMethodId, input.paymentRail)) return null;
  return [
    {
      key: "contract",
      letter: "Д",
      title: "Договір",
      ready: Boolean(input.contractCreatedAt || input.inheritedContractOrderNumber),
    },
    { key: "specification", letter: "С", title: "Специфікація", ready: Boolean(input.specificationCreatedAt) },
    {
      key: "invoice",
      letter: "Р",
      title: "Рахунок",
      ready: getOrderInvoiceState(input) === "issued",
      inProgress: getOrderInvoiceState(input) === "requested",
    },
    { key: "waybill", letter: "В", title: "Видаткова", ready: false },
  ];
};

export type OrderStageSummary = {
  byStage: Record<ActiveOrderStage, { count: number; total: number }>;
  activeCount: number;
  activeTotal: number;
  receivedTotal: number;
  doneCount: number;
};

export const summarizeOrderStages = (records: OrderListInput[]): OrderStageSummary => {
  const byStage = Object.fromEntries(
    ACTIVE_ORDER_STAGES.map((stage) => [stage.id, { count: 0, total: 0 }])
  ) as OrderStageSummary["byStage"];
  const summary: OrderStageSummary = { byStage, activeCount: 0, activeTotal: 0, receivedTotal: 0, doneCount: 0 };
  for (const record of records) {
    const { stage } = getOrderNextStep(record);
    if (stage === "done") summary.doneCount += 1;
    if (stage === "done" || stage === "cancelled") continue;
    const total = Number(record.total) || 0;
    byStage[stage].count += 1;
    byStage[stage].total += total;
    summary.activeCount += 1;
    summary.activeTotal += total;
    summary.receivedTotal += share(record, getOrderPaidShare(record).pct);
  }
  return summary;
};

/**
 * «Мій хід»: менеджеру — кроки на його замовленнях, бухгалтерії — рахунки, які
 * попросили (на будь-якому замовленні). Погодження СЕО з'являться з p6.
 */
export const isMyTurn = (
  input: OrderListInput,
  viewer: { userId: string | null | undefined; canIssueInvoice: boolean }
) => {
  const { turn } = getOrderNextStep(input);
  if (turn === "accounting") return viewer.canIssueInvoice;
  return Boolean(viewer.userId) && input.managerUserId === viewer.userId && turn === "manager";
};
