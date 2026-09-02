import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuoteRunRows } from "./QuoteRunRows";
import { computeRunSalePricingFromMarkup } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Рішення клієнта в рядку тиражу (REQ-155 p2).
 *
 * ЧОМУ ТЕСТОМ, А НЕ САМИМИ ОЧИМА. Дев-сервер ходить у ПРОДІВСЬКУ базу, а тиражі
 * автозберігаються мовчки через 900 мс після будь-якої зміни (ефект
 * `runsAutosaveSignature` у QuoteDetailsPage). Тобто «клацнути й подивитись, як
 * виглядає бейдж» — це справжній запис у робочий прорахунок. Вигляд обох станів
 * звірено в браузері один раз, а тримає їх звідси.
 *
 * ГОЛОВНЕ, ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ: клік по «Погодити» НЕ рахується вибором
 * активного тиражу. Обидві дії живуть в одному рядку, і без зупинки бульбашки
 * одне натискання робило б їх разом — очима це не ловиться, бо погоджений тираж
 * і так стає активним.
 */

const run = (overrides: Partial<QuoteRun> = {}): QuoteRun =>
  ({
    id: "run-1",
    quote_item_id: "item-1",
    quantity: 30,
    unit_price_model: 1136.28,
    unit_price_print: 70.3,
    logistics_cost: 1000,
    markup_rate: 28,
    is_approved: false,
    ...overrides,
  }) as QuoteRun;

const pricingOf = (source: QuoteRun) =>
  computeRunSalePricingFromMarkup({
    quantity: Number(source.quantity) || 0,
    costTotal:
      ((Number(source.unit_price_model) || 0) + (Number(source.unit_price_print) || 0)) *
        (Number(source.quantity) || 0) +
      (Number(source.logistics_cost) || 0),
    markupRate: Number(source.markup_rate) || 0,
    managerRate: 10,
    fixedCostRate: 30,
    vatRate: 20,
  });

function renderRows(options: {
  runs: QuoteRun[];
  canApproveRun?: boolean;
  onSelect?: (next: QuoteRun) => void;
  onToggleApproved?: (next: QuoteRun) => void;
}) {
  render(
    <QuoteRunRows
      runs={options.runs}
      activeRunId={options.runs[0]?.id ?? null}
      unitLabel="шт."
      currency="UAH"
      getPricing={pricingOf}
      canAddRun={false}
      canApproveRun={options.canApproveRun ?? true}
      onSelect={options.onSelect ?? vi.fn()}
      onAddRun={vi.fn()}
      onToggleApproved={options.onToggleApproved ?? vi.fn()}
    />
  );
}

describe("QuoteRunRows — рішення клієнта в рядку", () => {
  it("непогоджений тираж пропонує «Погодити», погоджений показує бейдж", () => {
    renderRows({
      runs: [run(), run({ id: "run-2", quantity: 50, is_approved: true })],
    });

    expect(screen.getByRole("button", { name: /Погодити/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Погоджено клієнтом/ })).toBeTruthy();
  });

  it("без права на тиражі бейдж лишається, а кнопки немає", () => {
    renderRows({
      runs: [run(), run({ id: "run-2", quantity: 50, is_approved: true })],
      canApproveRun: false,
    });

    expect(screen.queryByRole("button", { name: /Погодити/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Погоджено клієнтом/ })).toBeNull();
    expect(screen.getByText("Погоджено клієнтом")).toBeTruthy();
  });

  it("клік по «Погодити» не вибирає рядок активним", () => {
    const onSelect = vi.fn();
    const onToggleApproved = vi.fn();
    renderRows({
      runs: [run(), run({ id: "run-2", quantity: 50 })],
      onSelect,
      onToggleApproved,
    });

    const rows = screen.getAllByRole("radio");
    fireEvent.click(within(rows[1]).getByRole("button", { name: /Погодити/ }));

    expect(onToggleApproved).toHaveBeenCalledTimes(1);
    expect(onToggleApproved.mock.calls[0][0].id).toBe("run-2");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("єдиний тираж кнопки не показує — вибирати нема з чого", () => {
    renderRows({ runs: [run()] });

    expect(screen.queryByRole("button", { name: /Погодити/ })).toBeNull();
    expect(screen.queryByText("Погоджено клієнтом")).toBeNull();
  });

  it("єдиний тираж із позначкою з минулого показує бейдж, але не кнопку", () => {
    renderRows({ runs: [run({ is_approved: true })] });

    expect(screen.queryByRole("button", { name: /Погоджено клієнтом/ })).toBeNull();
    expect(screen.getByText("Погоджено клієнтом")).toBeTruthy();
  });

  it("другий тираж повертає кнопки обом рядкам", () => {
    renderRows({ runs: [run(), run({ id: "run-2", quantity: 50 })] });

    expect(screen.getAllByRole("button", { name: /Погодити/ })).toHaveLength(2);
  });

  it("клік повз кнопку робить тираж активним", () => {
    const onSelect = vi.fn();
    renderRows({ runs: [run(), run({ id: "run-2", quantity: 50 })], onSelect });

    fireEvent.click(screen.getAllByRole("radio")[1]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("run-2");
  });
});
