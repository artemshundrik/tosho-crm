import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuoteRunPriceFields } from "./QuoteRunPriceFields";
import { resolveQuoteRunMarkupState } from "@/lib/quoteMarkupApproval";
import { computeRunSalePricingFromMarkup, type QuoteRunModelPriceVat } from "@/lib/quoteRuns";
import type { QuoteRunPriceFieldAccess } from "@/lib/permissions";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Перемикач «з ПДВ / без ПДВ» на вартості товару (REQ-232).
 *
 * ТРИ СТАНИ, і саме через третій це тест, а не лише погляд у прев'ю: «ще не
 * обрано» неможливо показати скріншотом так, щоб було видно, що жодна кнопка
 * не натиснута НАВМИСНО, а не через збій підсвітки. Тут це перевіряється
 * атрибутом.
 */

const run = (overrides: Partial<QuoteRun> = {}): QuoteRun => ({
  id: "run-1",
  quantity: 20,
  unit_price_model: 631.4,
  unit_price_print: 219.5,
  logistics_cost: 500,
  desired_manager_income: 0,
  markup_rate: 40,
  manager_rate: 10,
  fixed_cost_rate: 30,
  vat_rate: 20,
  ...overrides,
});

const fullAccess: QuoteRunPriceFieldAccess = {
  unit_price_model: true,
  unit_price_print: true,
  logistics_cost: true,
  desired_manager_income: true,
  markup_rate: true,
};

function renderFields(options: {
  modelPriceVat?: QuoteRunModelPriceVat | null;
  missing?: boolean;
  access?: Partial<QuoteRunPriceFieldAccess>;
  onModelPriceVatChange?: (value: QuoteRunModelPriceVat) => void;
} = {}) {
  const target = run({ unit_price_model_vat: options.modelPriceVat ?? null });
  const pricing = computeRunSalePricingFromMarkup({
    quantity: target.quantity,
    costTotal: (target.unit_price_model + target.unit_price_print) * target.quantity + target.logistics_cost,
    markupRate: target.markup_rate,
    managerRate: target.manager_rate,
    fixedCostRate: target.fixed_cost_rate,
    vatRate: target.vat_rate,
  });
  render(
    <QuoteRunPriceFields
      dealType="standard"
      run={target}
      pricing={pricing}
      access={{ ...fullAccess, ...options.access }}
      markupState={resolveQuoteRunMarkupState({
        dealType: "standard",
        costTotal: pricing.costTotal,
        markupRate: target.markup_rate,
        approval: null,
      })}
      markupFrozen={false}
      currency="UAH"
      lockHint={() => undefined}
      onChange={() => {}}
      modelPriceVatMissing={options.missing ?? false}
      onModelPriceVatChange={options.onModelPriceVatChange ?? (() => {})}
    />
  );
  return {
    incl: screen.getByRole("button", { name: "Вартість товару з ПДВ" }),
    excl: screen.getByRole("button", { name: "Вартість товару без ПДВ" }),
    price: screen.getByLabelText("Вартість товару за одиницю"),
  };
}

describe("QuoteRunPriceFields — позначка ПДВ", () => {
  it("поки не обрано, жодна кнопка не активна", () => {
    const { incl, excl } = renderFields();
    expect(incl.getAttribute("data-state")).toBe("inactive");
    expect(excl.getAttribute("data-state")).toBe("inactive");
  });

  it("обране значення підсвічене, сусіднє — ні", () => {
    const { incl, excl } = renderFields({ modelPriceVat: "excl" });
    expect(excl.getAttribute("data-state")).toBe("active");
    expect(incl.getAttribute("data-state")).toBe("inactive");
  });

  it("клік віддає значення нагору", () => {
    const onModelPriceVatChange = vi.fn();
    const { incl } = renderFields({ onModelPriceVatChange });
    fireEvent.click(incl);
    expect(onModelPriceVatChange).toHaveBeenCalledWith("incl");
  });

  it("поки гейт тримає — поле в рамці й причина написана словами", () => {
    const { price } = renderFields({ missing: true });
    expect(price.className).toContain("border-warning-soft-border");
    expect(screen.getByText(/Оберіть, з ПДВ ця сума чи без/)).toBeTruthy();
  });

  it("гейт не тримає — ні рамки, ні напису", () => {
    const { price } = renderFields({ modelPriceVat: "incl" });
    expect(price.className).not.toContain("border-warning-soft-border");
    expect(screen.queryByText(/Оберіть, з ПДВ ця сума чи без/)).toBeNull();
  });

  it("перемикач замкнений тією самою рукою, що й саме поле", () => {
    // Позначку веде проєктний менеджер — той, хто вписує суму. Розійтись ці два
    // права не можуть: інакше хтось міняв би сенс чужого числа.
    const { incl, excl } = renderFields({ access: { unit_price_model: false } });
    expect((incl as HTMLButtonElement).disabled).toBe(true);
    expect((excl as HTMLButtonElement).disabled).toBe(true);
  });
});
