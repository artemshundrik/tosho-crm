import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import type { OrderPurchase } from "@/features/orders/orderPurchases";

import { useOrderEconomicsPanel } from "./useOrderEconomicsPanel";

/**
 * Дії із закупками лишають рядок у стрічці замовлення — без сум і постачальників.
 * Запис у стрічку не ламає основну дію: збій логера мовчить.
 */

type TabProps = {
  onToggleNone: (value: boolean) => void;
};
type SaveProps = { onSubmit: (input: Record<string, unknown>) => Promise<boolean> };
type PayProps = {
  accounts: Array<{ id: string; name: string }> | null;
  target: unknown;
  onPay: (purchase: OrderPurchase, draft: Record<string, unknown>) => Promise<boolean>;
  onCancel: (purchase: OrderPurchase, reason: string) => Promise<boolean>;
};
type ReceiptProps = { onConfirm: (purchase: OrderPurchase, draft: Record<string, unknown>) => Promise<boolean> };
type DeleteTab = {
  onDelete: (purchase: OrderPurchase) => void;
  onAdd: (itemId?: string) => void;
  onPay: (purchase: OrderPurchase) => void;
};

const captured = vi.hoisted(() => ({
  tab: null as null | (TabProps & DeleteTab),
  save: null as null | SaveProps,
  pay: null as null | PayProps,
  receipt: null as null | ReceiptProps,
}));

const queries = vi.hoisted(() => ({
  cancelOrderPurchasePayment: vi.fn(async () => undefined),
  confirmOrderPurchaseReceipt: vi.fn(async () => undefined),
  deleteOrderPurchase: vi.fn(async () => undefined),
  getOrderPurchasesNone: vi.fn(async () => null),
  listOrderPurchases: vi.fn(async () => []),
  listSupplierNameHints: vi.fn(async () => []),
  setOrderPurchasesNone: vi.fn(async () => undefined),
  payOrderPurchase: vi.fn(async () => undefined),
  saveOrderPurchase: vi.fn(async () => "new-id"),
}));
const logActivity = vi.hoisted(() => vi.fn(async (_payload: Record<string, unknown>) => undefined));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/activityLogger", () => ({ logActivity }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const listOrderPaymentAccounts = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ accounts: [{ id: "acc-1", name: "Рахунок" }] }))
);
vi.mock("@/features/orders/orderPaymentQueries", () => ({ listOrderPaymentAccounts }));
vi.mock("@/features/orders/orderPurchaseQueries", () => queries);
vi.mock("@/features/orders/order-details/OrderEconomicsTab", () => ({
  economicsAccess: () => ({ amounts: true, margin: true, edit: true, receive: true, markNone: true }),
  OrderEconomicsTab: (props: TabProps & DeleteTab) => {
    captured.tab = props;
    return null;
  },
}));
vi.mock("@/features/orders/order-details/OrderPurchaseDialog", () => ({
  OrderPurchaseDialog: (props: SaveProps) => {
    captured.save = props;
    return null;
  },
}));
vi.mock("@/features/orders/order-details/OrderPurchasePayDialog", () => ({
  OrderPurchasePayDialog: (props: PayProps) => {
    captured.pay = props;
    return null;
  },
}));
vi.mock("@/features/orders/order-details/OrderPurchaseReceiptDialog", () => ({
  OrderPurchaseReceiptDialog: (props: ReceiptProps) => {
    captured.receipt = props;
    return null;
  },
}));
vi.mock("@/lib/permissions", () => ({ canViewOrderEconomics: () => true }));

const record = {
  id: "order-1",
  source: "stored",
  linkedQuoteId: "quote-1",
  items: [{ id: "item-box", name: "Коробка", qty: 200, unit: "шт" }],
  total: 95400,
  currency: "UAH",
  ourLegalEntityId: null,
} as unknown as DerivedOrderRecord;

// Закупка «Коробка-200 шт», постачальник «КОРОБКА», сума 5 250,30.
const purchase = {
  id: "p1",
  orderId: "order-1",
  description: "Коробка-200 шт",
  supplierName: "КОРОБКА",
  amount: 5250.3,
} as unknown as OrderPurchase;

function Harness({ onReady }: { onReady?: () => void }) {
  const panel = useOrderEconomicsPanel({
    record,
    teamId: "team-1",
    userId: "user-1",
    accessRole: "member",
    jobRole: "accountant",
    onChanged: () => undefined,
  });
  onReady?.();
  return <>{panel.content}</>;
}

async function mount() {
  render(<Harness />);
  await waitFor(() => expect(captured.tab).not.toBeNull());
  // Вікно редактора відкривається додаванням закупки.
  await act(async () => captured.tab?.onAdd("item-box"));
  await waitFor(() => expect(captured.save).not.toBeNull());
  await act(async () => undefined);
}

const logged = () => logActivity.mock.calls.map((call) => call[0]);

describe("useOrderEconomicsPanel: стрічка замовлення", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.tab = captured.save = captured.pay = captured.receipt = null;
  });

  it("нова закупка пишеться в стрічку без сум і постачальника", async () => {
    await mount();
    await act(async () => {
      await captured.save?.onSubmit({ id: null, orderId: "order-1", description: "Коробка-200 шт", supplierName: "КОРОБКА", amount: 5250.3 });
    });
    expect(logged()).toHaveLength(1);
    expect(logged()[0]).toMatchObject({
      teamId: "team-1",
      action: "order_purchase",
      entityType: "orders",
      entityId: "order-1",
      title: "Внесено закупку",
      href: "/orders/production/order-1",
      metadata: { quote_id: "quote-1", order_id: "order-1" },
    });
    expect(JSON.stringify(logged()[0])).not.toMatch(/КОРОБКА|Коробка|5250|5 250/);
  });

  it("правка наявної закупки стрічку не чіпає", async () => {
    await mount();
    await act(async () => {
      await captured.save?.onSubmit({ id: "p1", orderId: "order-1", description: "Коробка-200 шт", supplierName: "КОРОБКА", amount: 6000 });
    });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("отримання й позначка «закупок немає» пишуться з клієнта", async () => {
    await mount();
    await act(async () => {
      await captured.receipt?.onConfirm(purchase, { receivedOn: "2026-10-16", receivedQty: 200, docKind: "waybill", docNumber: "77" });
      captured.tab?.onToggleNone(true);
    });
    await waitFor(() => expect(logActivity).toHaveBeenCalledTimes(2));
    await act(async () => captured.tab?.onToggleNone(false));
    await waitFor(() => expect(logActivity).toHaveBeenCalledTimes(3));
    expect(logged().map((entry) => entry.title)).toEqual([
      "Товар отримано",
      "Позначено: закупок немає",
      "Знято позначку «закупок немає»",
    ]);
    expect(logged().every((entry) => entry.action === "order_purchase")).toBe(true);
  });

  it("оплату й скасування оплати в стрічку пише база, клієнт — ні", async () => {
    await mount();
    let paid: boolean | undefined;
    let cancelled: boolean | undefined;
    await act(async () => {
      paid = await captured.pay?.onPay(purchase, { paidOn: "2026-10-12", accountId: "acc", amount: 5250.3 });
      cancelled = await captured.pay?.onCancel(purchase, "Подвійне внесення");
    });
    expect(paid).toBe(true);
    expect(cancelled).toBe(true);
    expect(queries.payOrderPurchase).toHaveBeenCalledTimes(1);
    expect(queries.cancelOrderPurchasePayment).toHaveBeenCalledWith(purchase.id, "Подвійне внесення");
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("видалення закупки не пишеться в стрічку", async () => {
    await mount();
    await act(async () => captured.tab?.onDelete(purchase));
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("дія, що впала, у стрічку не потрапляє", async () => {
    queries.payOrderPurchase.mockRejectedValueOnce(new Error("Не вдалося"));
    await mount();
    await act(async () => {
      await captured.pay?.onPay(purchase, { paidOn: "2026-10-12", accountId: "acc", amount: 1 });
    });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("збій запису в стрічку не ламає дію й не дає помилки", async () => {
    logActivity.mockRejectedValueOnce(new Error("мережа"));
    const { toast } = await import("sonner");
    await mount();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await captured.receipt?.onConfirm(purchase, { receivedOn: "2026-10-16", receivedQty: 200, docKind: "waybill", docNumber: "77" });
    });
    expect(ok).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("useOrderEconomicsPanel: свіжість і рахунки", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.tab = captured.save = captured.pay = captured.receipt = null;
  });

  it("повернення у вкладку перечитує закупки — застарілі причини не тримають ВН", async () => {
    render(<Harness />);
    await waitFor(() => expect(queries.listOrderPurchases).toHaveBeenCalledTimes(1));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(queries.listOrderPurchases).toHaveBeenCalledTimes(2));
  });

  it("рахунки списання вантажаться, лише коли відкрили оплату, і один раз", async () => {
    render(<Harness />);
    await waitFor(() => expect(captured.tab).not.toBeNull());
    expect(listOrderPaymentAccounts).not.toHaveBeenCalled();
    expect(captured.pay?.accounts).toBeNull();

    await act(async () => captured.tab?.onPay(purchase));
    await waitFor(() => expect(captured.pay?.accounts).toEqual([{ id: "acc-1", name: "Рахунок" }]));
    expect(listOrderPaymentAccounts).toHaveBeenCalledTimes(1);

    await act(async () => captured.tab?.onPay(purchase));
    expect(listOrderPaymentAccounts).toHaveBeenCalledTimes(1);
  });
});
