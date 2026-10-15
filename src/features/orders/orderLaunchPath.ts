import {
  getDocumentApprovalState,
  getLaunchException,
  type ApprovalRecord,
  type DocumentApprovalState,
} from "./orderApprovals";
import { ORDER_PAYMENT_TERMS_OPTIONS } from "./config";
import type { DerivedOrderRecord } from "./orderRecords";
import { formatBalanceDaysShort, isCashlessPaymentMethod } from "./paymentRules";

/**
 * «Шлях до запуску» й розбивка оплати на картці замовлення (REQ-322#p11).
 * Показуємо лише умови свого способу оплати (СЕО, 14.10.2026): на готівці —
 * передоплату, на безготівці — договір, СП і оплату за умовами.
 *
 * Ворота запуску (p8): договір і СП «зроблені», лише коли підписані (p7);
 * до того крок показує погодження (p6). Дозвіл на запуск без умов від СЕО чи
 * головного бухгалтера відкриває запуск, хоч би чого бракувало.
 */
export type LaunchPathInput = ApprovalRecord &
  Pick<
  DerivedOrderRecord,
  | "paymentMethodId"
  | "paymentRail"
  | "total"
  | "prepaymentPct"
  | "balancePct"
  | "balanceTiming"
  | "balanceDaysAfterShipment"
  | "balanceDaysKind"
  | "paymentTerms"
  | "paymentStatus"
  | "orderStatus"
  | "contractCreatedAt"
  | "specificationCreatedAt"
>;

export type LaunchStepState = "done" | "current" | "todo" | "locked";
export type LaunchStep = { key: string; title: string; note: string; state: LaunchStepState };

/** Що саме зупиняє запуск; null — можна запускати. Читає й список замовлень. */
export type LaunchBlocker =
  | "Бракує договору"
  | "Бракує СП"
  | "Договір не погоджено"
  | "СП не погоджено"
  | "Договір не підписано"
  | "СП не підписана"
  | "Чекає передоплату";

export const PREPAYMENT_RECEIVED = new Set(["partially_paid", "fully_paid", "awaiting_balance"]);
export const LAUNCHED_ORDER_STATUSES = new Set(["production_started", "in_production", "ready", "shipped", "completed"]);
export const SHIPPED_ORDER_STATUSES = new Set(["shipped", "completed"]);

/**
 * Відсотки «наперед / доплата»: явні з замовлення, а для старих — з коду умов
 * (`payment_terms`: «70/30», «100_prepaid»…). null — умов немає взагалі.
 */
export const resolveBreakdown = (input: LaunchPathInput): { prepayment: number; balance: number } | null => {
  if (typeof input.prepaymentPct === "number" && typeof input.balancePct === "number") {
    return { prepayment: input.prepaymentPct, balance: input.balancePct };
  }
  const option = ORDER_PAYMENT_TERMS_OPTIONS.find((item) => item.id === input.paymentTerms);
  return option ? { prepayment: option.advance, balance: option.balance } : null;
};

/** 0% наперед і доплата ПІСЛЯ відвантаження — відтермінування від дати ВН. */
export const isFullyDeferred = (input: LaunchPathInput) =>
  resolveBreakdown(input)?.prepayment === 0 && input.balanceTiming === "after_shipment";

/** 0% наперед, але платять по готовності, до відвантаження («100% після готовності»). */
const isPaidOnReadiness = (input: LaunchPathInput) =>
  resolveBreakdown(input)?.prepayment === 0 && input.balanceTiming !== "after_shipment";

export const balanceDaysShort = (input: LaunchPathInput) =>
  formatBalanceDaysShort(input.balanceDaysAfterShipment ?? 3, input.balanceDaysKind);

export const formatPaymentTermsChip = (input: LaunchPathInput): string | null => {
  const breakdown = resolveBreakdown(input);
  if (!breakdown) return null;
  if (isFullyDeferred(input)) return `Відтермінування ${balanceDaysShort(input)}`;
  if (isPaidOnReadiness(input)) return "100% після готовності";
  if (breakdown.balance === 0) return "100% наперед";
  return `${breakdown.prepayment}/${breakdown.balance}`;
};

const APPROVAL_NOTES: Partial<Record<DocumentApprovalState, string>> = {
  none: "Створено — надіслати на погодження",
  stale: "Змінився після погодження — погодити ще раз",
  pending: "На погодженні в бухгалтерії",
  returned: "Повернули на правки",
  approved: "Погоджено — чекаємо підпис",
};

export const buildLaunchPath = (
  input: LaunchPathInput
): {
  heading: string;
  steps: LaunchStep[];
  blocker: LaunchBlocker | null;
  /** Що ще бракує, коли запускають за дозволом: «оплати», «підпису СП». */
  missing: string[];
  exception: ReturnType<typeof getLaunchException>;
} => {
  const exception = getLaunchException(input);
  const exceptionApproved = exception?.status === "approved";
  const prepaymentReceived = PREPAYMENT_RECEIVED.has(input.paymentStatus);
  const launched = LAUNCHED_ORDER_STATUSES.has(input.orderStatus);
  const terms = formatPaymentTermsChip(input);
  const breakdown = resolveBreakdown(input);
  const prepaymentNote = breakdown ? `${breakdown.prepayment}% до запуску` : "За умовами замовлення";
  const launchStep = (ready: boolean, lockedNote: string): LaunchStep => ({
    key: "launch",
    title: "Запуск у виробництво",
    note: launched
      ? "Запущено"
      : ready
        ? "Можна запускати"
        : exceptionApproved
          ? "Дозволено запустити без умов"
          : lockedNote,
    state: launched ? "done" : ready || exceptionApproved ? "current" : "locked",
  });

  const shipmentStep: LaunchStep = {
    key: "shipment",
    title: "Відвантаження",
    note: SHIPPED_ORDER_STATUSES.has(input.orderStatus) ? "Відвантажено" : "Лише коли надійшла вся сума",
    state: SHIPPED_ORDER_STATUSES.has(input.orderStatus) ? "done" : "todo",
  };

  if (!isCashlessPaymentMethod(input.paymentMethodId, input.paymentRail)) {
    // Правило «не менше 50%» — лише для готівки; крипта йде тим самим шляхом без документів, але без нього.
    const isCash = input.paymentMethodId !== "crypto";
    const noPrepayment = breakdown?.prepayment === 0;
    const prepaymentDone = prepaymentReceived || launched || (!isCash && noPrepayment);
    const steps: LaunchStep[] = [
      {
        key: "prepayment",
        title: "Передоплата",
        note: !isCash && noPrepayment
          ? "До запуску не потрібна"
          : isCash
            ? `${prepaymentNote} · на готівці не менше 50%`
            : prepaymentNote,
        state: prepaymentDone ? "done" : "current",
      },
      launchStep(prepaymentDone, "Після передоплати"),
    ];
    if ((breakdown?.balance ?? 0) > 0) {
      steps.push({
        key: "balance",
        title: "Доплата",
        note: `${breakdown?.balance}% до відвантаження`,
        state: input.paymentStatus === "fully_paid" ? "done" : "todo",
      });
    }
    steps.push(shipmentStep);
    const method = isCash ? "Готівка" : "Криптовалюта";
    return {
      heading: terms ? `${method}, ${terms}` : method,
      steps,
      blocker: prepaymentDone || exceptionApproved ? null : "Чекає передоплату",
      missing: prepaymentDone ? [] : ["передоплати"],
      exception,
    };
  }

  const contract = getDocumentApprovalState(input, "contract");
  const spec = getDocumentApprovalState(input, "specification");
  const contractCreated = Boolean(input.contractCreatedAt);
  const specCreated = Boolean(input.specificationCreatedAt);
  const contractSigned = Boolean(input.contractSignedAt);
  const specSigned = Boolean(input.specificationSignedAt);
  const deferred = isFullyDeferred(input);
  const onReadiness = isPaidOnReadiness(input);
  const paymentDone = deferred || onReadiness || prepaymentReceived || launched;
  const docNote = (created: boolean, signed: boolean, state: DocumentApprovalState, emptyNote: string) =>
    signed ? "Підписано" : !created ? emptyNote : (APPROVAL_NOTES[state] ?? "Створено — чекаємо підпис");
  const steps: LaunchStep[] = [
    {
      key: "contract",
      title: "Договір",
      note: input.inheritedContractOrderNumber && !contractSigned
        ? `З ${input.inheritedContractOrderNumber} — не позначено підписаним`
        : docNote(contractCreated, contractSigned, contract.state, "Один на замовника, підписують обидві сторони"),
      state: contractSigned ? "done" : "current",
    },
    {
      key: "specification",
      title: "СП",
      note: docNote(specCreated, specSigned, spec.state, "Додаток до договору на це замовлення"),
      state: specSigned ? "done" : contractCreated ? "current" : "todo",
    },
    {
      key: "payment",
      title: "Оплата",
      note: deferred
        ? `До запуску не потрібна: 100% за ${balanceDaysShort(input)} від ВН`
        : onReadiness
          ? "До запуску не потрібна: 100% після готовності, до відвантаження"
          : prepaymentNote,
      state: paymentDone ? "done" : contractSigned && specSigned ? "current" : "todo",
    },
    launchStep(contractSigned && specSigned && paymentDone, "Після підписаної СП і оплати за умовами"),
  ];
  const needsApproval = (state: DocumentApprovalState) => state !== "approved" && state !== "notRequired";
  // Уже запущене (старі замовлення без договору в CRM) — блокувати нічого.
  const rawBlocker: LaunchBlocker | null = launched
    ? null
    : !contractCreated
      ? "Бракує договору"
      : !specCreated
        ? "Бракує СП"
        : !contractSigned && needsApproval(contract.state)
          ? "Договір не погоджено"
          : !specSigned && needsApproval(spec.state)
            ? "СП не погоджено"
            : !contractSigned
              ? "Договір не підписано"
              : !specSigned
                ? "СП не підписана"
                : !paymentDone
                  ? "Чекає передоплату"
                  : null;
  const missing = [
    ...(!contractSigned ? ["підпису договору"] : []),
    ...(!specSigned ? ["підпису СП"] : []),
    ...(!paymentDone ? ["оплати"] : []),
  ];
  return {
    heading: deferred ? "Безготівка, оплата після відвантаження" : terms ? `Безготівка, ${terms}` : "Безготівка",
    steps,
    blocker: exceptionApproved ? null : rawBlocker,
    missing: launched ? [] : missing,
    exception,
  };
};

export type OrderPaymentPart = { key: "prepayment" | "balance"; label: string; amount: number; pct: number };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const buildOrderPaymentParts = (input: LaunchPathInput): OrderPaymentPart[] => {
  const total = Number(input.total) || 0;
  const breakdown = resolveBreakdown(input);
  if (!breakdown) return [{ key: "balance", label: "До оплати", amount: total, pct: 100 }];
  const prepaymentPct = breakdown.prepayment;
  const balancePct = breakdown.balance;
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
