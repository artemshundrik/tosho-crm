import type { DerivedReadinessStep } from "./orderRecords";

export type DerivedReadinessInput = {
  partyType: "customer" | "lead";
  /** Безготівка: потрібні договір, СП і рахунок, а з ними й реквізити. */
  requiresCustomerDocuments: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLegalEntityIdentity: boolean;
  hasFullSignatoryName: boolean;
  isVatPayer: boolean;
  hasValidVatId: boolean;
  hasItems: boolean;
  runChoicePending: boolean;
  requiresVisualization: boolean;
  hasApprovedVisualization: boolean;
  requiresLayout: boolean;
  hasApprovedLayout: boolean;
};

/**
 * Що треба, щоб прорахунок став замовленням. На готівці договору, СП і рахунку
 * немає (погоджено СЕО 14.10.2026), тож реквізити й ПІБ підписанта не питаємо —
 * так само, як у переведенні ліда (getLeadConversionMissingFields). Телефон
 * лишається: доставка й звʼязок.
 */
export const buildDerivedReadinessSteps = (input: DerivedReadinessInput): DerivedReadinessStep[] => [
  { label: "Прорахунок затверджено менеджером", done: true },
  { label: "Ліда переведено у Замовника", done: input.partyType === "customer", blocking: true },
  ...(input.requiresCustomerDocuments
    ? [
        { label: "Заповнені email та мобільний номер", done: input.hasEmail && input.hasPhone, blocking: true },
        { label: "Заповнені реквізити, юр. назва та підписант", done: input.hasLegalEntityIdentity, blocking: true },
        {
          label: "Вказано повне ПІБ підписанта (прізвище, імʼя, по-батькові)",
          done: input.hasFullSignatoryName,
          blocking: true,
        },
        ...(input.isVatPayer
          ? [{ label: "Вказано ІПН платника ПДВ (12 цифр)", done: input.hasValidVatId, blocking: true }]
          : []),
      ]
    : [{ label: "Заповнений мобільний номер", done: input.hasPhone, blocking: true }]),
  { label: "Підготовлені позиції для рахунку та СП", done: input.hasItems, blocking: true },
  // Кілька тиражів на позицію = кілька різних цін. Доки не позначено, який
  // із них погодив клієнт, замовлення робити нема з чого — до 25.08.2026
  // мовчки брався перший створений.
  ...(input.runChoicePending ? [{ label: "Позначено тираж, який погодив клієнт", done: false, blocking: true }] : []),
  ...(input.requiresVisualization
    ? [{ label: "Візуал погоджено", done: input.hasApprovedVisualization, blocking: true }]
    : []),
  ...(input.requiresLayout ? [{ label: "Макет погоджено", done: input.hasApprovedLayout, blocking: true }] : []),
];

const COUNTERPARTY_MARKERS = ["Ліда", "email", "мобільний", "реквізити", "ІПН", "ПІБ"];

export const getReadinessColumn = (blockers: string[]) =>
  blockers.some((label) => COUNTERPARTY_MARKERS.some((marker) => label.includes(marker)))
    ? ("counterparty" as const)
    : blockers.length > 0
      ? ("design" as const)
      : ("ready" as const);
