import { DEFAULT_PRODUCTION_WORK_DAYS } from "@/features/orders/specificationDocument";

/**
 * Розбір полів вікна параметрів СП у значення для бази. Порожнє чи хибне поле
 * дає дефолт або null — помилку показує окрема перевірка мінімальної передоплати.
 */
export function parseSpecificationParamsInput(
  input: {
    productionDays: string;
    prepaymentPct: string;
    balancePct: string;
    balanceTiming: "before_shipment" | "after_shipment";
    balanceDays: string;
    specificationNumber: string;
  },
  currentSpecificationNumber: number | null
) {
  const percent = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  };
  const positiveInt = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  };
  return {
    productionWorkingDays: positiveInt(input.productionDays) ?? DEFAULT_PRODUCTION_WORK_DAYS,
    prepaymentPct: percent(input.prepaymentPct),
    balancePct: percent(input.balancePct),
    balanceDaysAfterShipment: input.balanceTiming === "after_shipment" ? positiveInt(input.balanceDays) : null,
    // Порожнє поле номер не стирає: до створення СП його видасть тригер, після — лишається як був.
    specificationNumber: positiveInt(input.specificationNumber) ?? currentSpecificationNumber,
  };
}
