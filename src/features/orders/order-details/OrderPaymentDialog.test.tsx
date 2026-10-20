import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { paymentStatusLabel } from "@/features/orders/orderPayments";

import { OrderPaymentDialog } from "./OrderPaymentDialog";

const spaces = (text: string | null | undefined) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

/** Замовлення з прототипу: 99 360 грн, 50/50, оплат ще не було. */
function renderDialog(overrides: Partial<Parameters<typeof OrderPaymentDialog>[0]> = {}) {
  const onSubmit = vi.fn(async () => true);
  const onOpenChange = vi.fn();
  render(
    <OrderPaymentDialog
      open
      onOpenChange={onOpenChange}
      orderNumber="TS-1020-0001"
      invoiceLine="Рахунок № 434 · AVANTI GROUP · 50/50"
      total={99360}
      prePct={50}
      pre={49680}
      paid={0}
      currentStatus="awaiting_payment"
      launched={false}
      payments={[]}
      accounts={[{ id: "acc-1", name: "ПриватБанк ТОВ" }]}
      defaultAccountId="acc-1"
      saving={false}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onOpenChange };
}

describe("віконце «Внести оплату»", () => {
  it("стартує із суми передоплати й каже, що запуск відкриється", () => {
    renderDialog();
    expect(spaces((screen.getByLabelText("Сума") as HTMLInputElement).value)).toBe("49 680,00");
    expect(screen.getByText(/Статус стане «.+» · запуск відкриється/)).toBeTruthy();
    expect(spaces(screen.getByRole("button", { name: /^Внести 49/ }).textContent)).toBe("Внести 49 680,00 грн");
  });

  it("менша сума — попередження, але внести можна", async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = renderDialog();
    const input = screen.getByLabelText("Сума");
    await user.clear(input);
    await user.type(input, "45 000");
    expect(spaces(screen.getByText(/Менше за передоплату/).textContent)).toBe(
      "Менше за передоплату на 4 680,00 грн — запуск лишиться закритим"
    );
    await user.click(screen.getByRole("button", { name: /^Внести 45/ }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 45000, accountId: "acc-1", bankTxnRef: null })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("«Інша» чистить поле, і без суми кнопка неактивна", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Інша" }));
    expect((screen.getByLabelText("Сума") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Внести" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("після передоплати стартує з решти суми", () => {
    renderDialog({ paid: 49680, currentStatus: "partially_paid" });
    expect(spaces((screen.getByLabelText("Сума") as HTMLInputElement).value)).toBe("49 680,00");
    expect(screen.getByText(`Статус стане «${paymentStatusLabel("fully_paid")}»`)).toBeTruthy();
  });
});
