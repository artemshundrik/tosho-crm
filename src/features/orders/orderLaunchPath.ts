import type { DerivedOrderRecord } from "./orderRecords";
import { formatBalanceDaysShort, isCashlessPaymentMethod } from "./paymentRules";

/**
 * «Шлях до запуску» й розбивка оплати на картці замовлення (REQ-322#p11).
 * Показуємо лише умови свого способу оплати (СЕО, 14.10.2026): на готівці —
 * передоплату, на безготівці — договір, СП і оплату за умовами.
 *
 * Підписів, погоджень і воріт запуску в даних ще немає (p6–p8), тому договір і
 * СП тут «зроблені», щойно створені. Коли з'являться підписи, крок стане
 * «зроблений», лише коли підписано, — і змінити треба буде саме цей файл.
 */
export type LaunchPathInput = Pick<
  DerivedOrderRecord,
  | "paymentMethodId"
  | "paymentRail"
  | "total"
  | "prepaymentPct"
  | "balancePct"
  | "balanceTiming"
  | "balanceDaysAfterShipment"
  | "balanceDaysKind"
  | "paymentStatus"
  | "orderStatus"
  | "contractCreatedAt"
  | "specificationCreatedAt"
>;

export type LaunchStepState = "done" | "current" | "todo" | "locked";
export type LaunchStep = { key: string; title: string; note: string; state: LaunchStepState };

const PREPAYMENT_RECEIVED = new Set(["partially_paid", "fully_paid", "awaiting_balance"]);
const LAUNCHED = new Set(["production_started", "in_production", "ready", "shipped", "completed"]);

const hasBreakdown = (input: LaunchPathInput) =>
  typeof input.prepaymentPct === "number" && typeof input.balancePct === "number";

const isFullyDeferred = (input: LaunchPathInput) => hasBreakdown(input) && input.prepaymentPct === 0;

const balanceDaysShort = (input: LaunchPathInput) =>
  formatBalanceDaysShort(input.balanceDaysAfterShipment ?? 3, input.balanceDaysKind);

export const formatPaymentTermsChip = (input: LaunchPathInput): string | null => {
  if (!hasBreakdown(input)) return null;
  if (isFullyDeferred(input)) return `Відтермінування ${balanceDaysShort(input)}`;
  return `${input.prepaymentPct}/${input.balancePct}`;
};

export const buildLaunchPath = (
  input: LaunchPathInput
): { heading: string; steps: LaunchStep[]; blocker: string | null } => {
  const prepaymentReceived = PREPAYMENT_RECEIVED.has(input.paymentStatus);
  const launched = LAUNCHED.has(input.orderStatus);
  const terms = formatPaymentTermsChip(input);
  const prepaymentNote = hasBreakdown(input) ? `${input.prepaymentPct}% до запуску` : "За умовами замовлення";
  const launchStep = (ready: boolean, lockedNote: string): LaunchStep => ({
    key: "launch",
    title: "Запуск у виробництво",
    note: launched ? "Запущено" : ready ? "Можна запускати" : lockedNote,
    state: launched ? "done" : ready ? "current" : "locked",
  });

  if (!isCashlessPaymentMethod(input.paymentMethodId, input.paymentRail)) {
    const steps: LaunchStep[] = [
      {
        key: "prepayment",
        title: "Передоплата",
        note: `${prepaymentNote} · на готівці не менше 50%`,
        state: prepaymentReceived || launched ? "done" : "current",
      },
      launchStep(prepaymentReceived, "Після передоплати"),
    ];
    if ((input.balancePct ?? 0) > 0) {
      steps.push({
        key: "balance",
        title: "Доплата",
        note: `${input.balancePct}% до відвантаження`,
        state: input.paymentStatus === "fully_paid" ? "done" : "todo",
      });
    }
    steps.push({ key: "shipment", title: "Відвантаження", note: "Лише коли надійшла вся сума", state: "todo" });
    return {
      heading: terms ? `Готівка, ${terms}` : "Готівка",
      steps,
      blocker: prepaymentReceived || launched ? null : "Чекає передоплату",
    };
  }

  const contractDone = Boolean(input.contractCreatedAt);
  const specDone = Boolean(input.specificationCreatedAt);
  const deferred = isFullyDeferred(input);
  const paymentDone = deferred || prepaymentReceived || launched;
  const steps: LaunchStep[] = [
    {
      key: "contract",
      title: "Договір",
      note: contractDone ? "Створено" : "Один на замовника",
      state: contractDone ? "done" : "current",
    },
    {
      key: "specification",
      title: "СП",
      note: specDone ? "Створено" : "Додаток до договору на це замовлення",
      state: specDone ? "done" : contractDone ? "current" : "todo",
    },
    {
      key: "payment",
      title: "Оплата",
      note: deferred ? `До запуску не потрібна: 100% за ${balanceDaysShort(input)} від ВН` : prepaymentNote,
      state: paymentDone ? "done" : contractDone && specDone ? "current" : "todo",
    },
    launchStep(contractDone && specDone && paymentDone, "Після СП і оплати за умовами"),
  ];
  const blocker = !contractDone
    ? "Бракує договору"
    : !specDone
      ? "Бракує СП"
      : !paymentDone
        ? "Чекає передоплату"
        : null;
  return {
    heading: deferred ? "Безготівка, оплата після відвантаження" : terms ? `Безготівка, ${terms}` : "Безготівка",
    steps,
    blocker,
  };
};

export type OrderPaymentPart = { key: "prepayment" | "balance"; label: string; amount: number; pct: number };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const buildOrderPaymentParts = (input: LaunchPathInput): OrderPaymentPart[] => {
  const total = Number(input.total) || 0;
  if (!hasBreakdown(input)) return [{ key: "balance", label: "До оплати", amount: total, pct: 100 }];
  const prepaymentPct = input.prepaymentPct as number;
  const balancePct = input.balancePct as number;
  const prepayment = roundMoney((total * prepaymentPct) / 100);
  return [
    { key: "prepayment", label: "Наперед", amount: prepayment, pct: prepaymentPct },
    {
      key: "balance",
      label:
        input.balanceTiming === "after_shipment" ? `Після ВН, до ${balanceDaysShort(input)}` : "До відвантаження",
      amount: roundMoney(total - prepayment),
      pct: balancePct,
    },
  ];
};
