import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OrderPurchase } from "@/features/orders/orderPurchases";

import { economicsAccess, OrderEconomicsTab } from "./OrderEconomicsTab";
import { OrderPurchaseDialog } from "./OrderPurchaseDialog";

/** Замовлення № 378 з таблиці Влада: ТОВ «СІКЛУМ», парасолі 200 шт, рахунок 95 400 грн. */
const ITEMS = [
  { id: "item-umbrella", name: "Парасоля з логотипом", qty: 200, unit: "шт" },
  { id: "item-box", name: "Коробка", qty: 200, unit: "шт" },
];

const base: Omit<OrderPurchase, "id" | "description" | "supplierName"> = {
  orderId: "order-378",
  orderItemId: null,
  supplierInvoiceNumber: null,
  supplierInvoiceDate: "2026-10-10",
  qty: null,
  unit: null,
  amount: 0,
  vatMode: "with_vat",
  costWithVat: 0,
  receivedOn: null,
  receivedQty: null,
  receivedDocKind: null,
  receivedDocNumber: null,
  receivedByName: null,
  expenseId: null,
  paidOn: null,
};

const received = { receivedOn: "2026-10-16", receivedDocKind: "waybill" as const, receivedDocNumber: "77", receivedByName: "Олег" };

const PURCHASES: OrderPurchase[] = [
  { ...base, ...received, id: "p1", orderItemId: "item-umbrella", description: "Парасоля", supplierName: "Бергамо", supplierInvoiceNumber: "СФ-1201", qty: 200, unit: "шт", receivedQty: 200, amount: 52000, costWithVat: 52000, expenseId: "exp-1", paidOn: "2026-10-12" },
  { ...base, ...received, id: "p2", orderItemId: "item-umbrella", description: "Нанесення логотипу", supplierName: "Принт-Студія", qty: 200, unit: "шт", receivedQty: 200, amount: 12000, costWithVat: 12000, expenseId: "exp-2", paidOn: "2026-10-13" },
  { ...base, ...received, id: "p3", orderItemId: "item-umbrella", description: "Взірець", supplierName: "Бергамо", qty: 1, unit: "шт", receivedQty: 1, amount: 450, costWithVat: 450 },
  { ...base, ...received, id: "p4", orderItemId: "item-box", description: "Коробка-200 шт", supplierName: "КОРОБКА", supplierInvoiceNumber: "СФ-0005216", supplierInvoiceDate: "2026-10-14", qty: 200, unit: "шт", receivedQty: 180, amount: 5250.3, costWithVat: 5250.3 },
  { ...base, ...received, id: "p5", orderItemId: "item-box", description: "Пакування", supplierName: "ФОП Іваненко", qty: 200, unit: "шт", receivedQty: 200, amount: 1000, vatMode: "no_vat", costWithVat: 1200 },
  { ...base, ...received, id: "p6", description: "Доставка НП по сплиту", supplierName: "Нова пошта", receivedQty: 1, amount: 850, costWithVat: 850 },
  { ...base, id: "p7", description: "Доставка до замовника", supplierName: "Нова пошта", amount: 600, costWithVat: 600 },
];

/** Що віддає база складу: без сум, без ПДВ і без стану оплати. */
const HIDDEN: OrderPurchase[] = PURCHASES.map((p) => ({ ...p, amount: null, vatMode: null, costWithVat: null, expenseId: null, paidOn: null }));

function renderTab(jobRole: string, overrides: Partial<Parameters<typeof OrderEconomicsTab>[0]> = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onPay: vi.fn(), onCancelPayment: vi.fn(), onReceive: vi.fn(), onToggleNone: vi.fn() };
  const access = economicsAccess("member", jobRole);
  render(
    <OrderEconomicsTab
      items={ITEMS}
      purchases={access.amounts ? PURCHASES : HIDDEN}
      purchasesNone={null}
      invoiceTotal={95400}
      currency="UAH"
      access={access}
      loading={false}
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe("вкладка «Економіка»", () => {
  it("бухгалтер бачить суму рахунку, залишок, маржу, групи й кнопки запису", () => {
    renderTab("accountant");
    expect(screen.getByText(/95 400,00/)).toBeTruthy();
    expect(screen.getAllByText(/Залишок/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Маржа/).length).toBeGreaterThan(0);
    expect(screen.getByText("Парасоля з логотипом - 200 шт")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "+ Закупка" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Оплачено" }).length).toBeGreaterThan(0);
    // «На все замовлення» — остання група.
    const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(headings.at(-1)).toBe("На все замовлення");
  });

  it("молодший бухгалтер бачить суми рядків, але не залишок, маржу й кнопки запису", () => {
    renderTab("junior_accountant");
    expect(screen.getByText(/5 250,30/)).toBeTruthy();
    expect(screen.queryByText(/Залишок/)).toBeNull();
    expect(screen.queryByText(/Маржа/)).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Закупка" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Оплачено" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отримано" })).toBeNull();
  });

  it("проджект не бачить сум, бачить «отримано 6 з 7» і відмічає отримання", async () => {
    const user = userEvent.setup();
    const { onReceive } = renderTab("pm");
    expect(screen.queryByText(/5 250/)).toBeNull();
    expect(screen.queryByText(/95 400/)).toBeNull();
    expect(screen.queryByText(/оплачено/i)).toBeNull();
    expect(screen.getByText("отримано 6 з 7")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Отримано" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(onReceive).toHaveBeenCalledWith(expect.objectContaining({ id: "p7" }));
    expect(screen.queryByRole("button", { name: "+ Закупка" })).toBeNull();
  });

  it("ФОП-рядок показує обидва числа", () => {
    renderTab("accountant");
    expect(screen.getByText("1 000,00 → 1 200,00 з ПДВ")).toBeTruthy();
  });

  it("«закупок немає» замість рядків і без «+ Закупка»", () => {
    renderTab("accountant", { purchases: [], purchasesNone: { byName: "Юлія Коваль" } });
    expect(screen.getByText("Закупок немає · Юлія Коваль")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Закупка" })).toBeNull();
  });

  it("недовіз підсвічено для бухгалтера", () => {
    renderTab("accountant");
    const row = screen.getByText("Коробка-200 шт").closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(/недовіз/)).toBeTruthy();
  });

  it("валютне замовлення — маржу не рахуємо", () => {
    renderTab("accountant", { currency: "USD" });
    expect(screen.getByText("маржа для валютних замовлень — поки ні")).toBeTruthy();
  });
});

describe("віконце «Закупка»", () => {
  it("«Зберегти й ще одну» лишає позицію й постачальника для наступного рядка", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => true);
    const onOpenChange = vi.fn();
    render(
      <OrderPurchaseDialog
        open
        onOpenChange={onOpenChange}
        orderId="order-378"
        items={ITEMS}
        purchase={null}
        defaultItemId="item-umbrella"
        supplierHints={["Бергамо"]}
        saving={false}
        onSubmit={onSubmit}
      />
    );
    await user.type(screen.getByLabelText("Що"), "Парасоля");
    await user.type(screen.getByLabelText("Постачальник"), "ФОП Іваненко");
    await user.type(screen.getByLabelText("Сума з рахунку"), "1000");
    await user.click(screen.getByRole("switch", { name: "ФОП, без ПДВ" }));
    expect(screen.getByText(/→ 1 200,00 з ПДВ/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Зберегти й ще одну" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        orderId: "order-378",
        orderItemId: "item-umbrella",
        description: "Парасоля",
        supplierName: "ФОП Іваненко",
        amount: 1000,
        vatMode: "no_vat",
      })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect((screen.getByLabelText("Що") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Постачальник") as HTMLInputElement).value).toBe("ФОП Іваненко");
  });

  describe("позначка «закупок немає»", () => {
    it("бухгалтер без рядків бачить «Закупок немає» і ставить позначку", async () => {
      const onToggleNone = vi.fn();
      renderTab("accountant", { purchases: [], onToggleNone });
      await userEvent.click(screen.getByRole("button", { name: "Закупок немає" }));
      expect(onToggleNone).toHaveBeenCalledWith(true);
    });

    it("СЕО без рядків кнопки не бачить", () => {
      renderTab("seo", { purchases: [] });
      expect(screen.queryByRole("button", { name: "Закупок немає" })).toBeNull();
    });

    it("з рядками кнопки немає", () => {
      renderTab("accountant");
      expect(screen.queryByRole("button", { name: "Закупок немає" })).toBeNull();
    });

    it("коли позначка стоїть, бухгалтер може її зняти, СЕО - ні", async () => {
      const onToggleNone = vi.fn();
      const none = { byName: "Ірина" };
      renderTab("accountant", { purchases: [], purchasesNone: none, onToggleNone });
      await userEvent.click(screen.getByRole("button", { name: "Зняти позначку" }));
      expect(onToggleNone).toHaveBeenCalledWith(false);
      cleanup();
      renderTab("seo", { purchases: [], purchasesNone: none });
      expect(screen.queryByRole("button", { name: "Зняти позначку" })).toBeNull();
    });
  });
});
