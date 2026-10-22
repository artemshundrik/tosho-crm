import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { PendingReceipts } from "@/features/orders/orderPurchaseQueries";

import { SupplierDocumentsCard, canSeeSupplierDocumentsCard } from "./SupplierDocumentsCard";

/**
 * Картка «Документи постачальників» — чиста розмітка: дані й «зараз» приходять
 * ззовні, тож перевіряємо рівно правила показу, а не мережу.
 */
const NOW = new Date(2026, 9, 22, 12, 0, 0); // 22.10.2026, локально

const purchase = (
  id: string,
  supplierName: string,
  invoiceDate: string,
  extra: Partial<PendingReceipts["pending"][number]> = {}
): PendingReceipts["pending"][number] => ({
  purchaseId: id,
  orderId: `order-${id}`,
  orderNumber: `ZM-${id}`,
  description: `Позиція ${id}`,
  supplierName,
  supplierInvoiceNumber: `INV-${id}`,
  supplierInvoiceDate: invoiceDate,
  ...extra,
});

const renderCard = (data: PendingReceipts) =>
  render(
    <MemoryRouter>
      <SupplierDocumentsCard data={data} now={NOW} />
    </MemoryRouter>
  );

describe("SupplierDocumentsCard", () => {
  it("порожньо в обох розділах - картки немає", () => {
    const { container } = renderCard({ pending: [], noneOrders: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("показує розділ «Чекають документів» і «Без закупок»", () => {
    renderCard({
      pending: [purchase("1", "Альфа", "2026-10-20")],
      noneOrders: [{ orderId: "o-9", orderNumber: "ZM-9", markedAt: "2026-10-21T09:00:00Z", markedByName: "Юлія" }],
    });
    expect(screen.getByRole("heading", { name: "Документи постачальників" })).toBeInTheDocument();
    expect(screen.getByText("Чекають документів")).toBeInTheDocument();
    expect(screen.getByText("Без закупок")).toBeInTheDocument();
    expect(screen.getByText(/Юлія/)).toBeInTheDocument();
  });

  it("розділ без рядків не малюється", () => {
    renderCard({ pending: [purchase("1", "Альфа", "2026-10-20")], noneOrders: [] });
    expect(screen.getByText("Чекають документів")).toBeInTheDocument();
    expect(screen.queryByText("Без закупок")).not.toBeInTheDocument();
  });

  it("групує за постачальником, старіший рахунок раніше, група з 8+ днів - угорі", () => {
    renderCard({
      pending: [
        purchase("1", "Бета", "2026-10-20"),
        purchase("2", "Альфа", "2026-10-19"),
        purchase("3", "Бета", "2026-10-10"), // 12 днів
        purchase("4", "Альфа", "2026-10-21"),
      ],
      noneOrders: [],
    });
    const groups = screen.getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Бета", "Альфа"]);
    const betaLinks = within(groups[0]).getAllByRole("link");
    expect(betaLinks.map((a) => a.textContent)).toEqual([
      expect.stringContaining("ZM-3"),
      expect.stringContaining("ZM-1"),
    ]);
    const alfaLinks = within(groups[1]).getAllByRole("link");
    expect(alfaLinks.map((a) => a.textContent)).toEqual([
      expect.stringContaining("ZM-2"),
      expect.stringContaining("ZM-4"),
    ]);
  });

  it("рядок з рахунком 8+ днів має тон попередження, свіжіший - ні", () => {
    renderCard({
      pending: [purchase("1", "Альфа", "2026-10-14"), purchase("2", "Альфа", "2026-10-15")],
      noneOrders: [],
    });
    const old = screen.getByRole("link", { name: /ZM-1/ });
    const fresh = screen.getByRole("link", { name: /ZM-2/ });
    expect(old.getAttribute("data-tone")).toBe("warning");
    expect(fresh.getAttribute("data-tone")).toBeNull();
    expect(old).toHaveTextContent("8 дн.");
    expect(fresh).toHaveTextContent("7 дн.");
  });

  it("посилання веде на сторінку замовлення", () => {
    renderCard({
      pending: [purchase("1", "Альфа", "2026-10-20")],
      noneOrders: [{ orderId: "o-9", orderNumber: "ZM-9", markedAt: "2026-10-21T09:00:00Z", markedByName: null }],
    });
    expect(screen.getByRole("link", { name: /ZM-1/ })).toHaveAttribute("href", "/orders/production/order-1");
    expect(screen.getByRole("link", { name: /ZM-9/ })).toHaveAttribute("href", "/orders/production/o-9");
  });

  it("не показує сум", () => {
    const { container } = renderCard({
      pending: [purchase("1", "Альфа", "2026-10-20")],
      noneOrders: [],
    });
    expect(container.textContent).not.toMatch(/₴|грн|UAH/i);
  });
});

describe("canSeeSupplierDocumentsCard", () => {
  it("бачать проджект, склад, виробництво, СЕО і власник; решта - ні", () => {
    for (const job of ["pm", "logistics", "head_of_logistics", "head_of_production", "seo"]) {
      expect(canSeeSupplierDocumentsCard("member", job)).toBe(true);
    }
    expect(canSeeSupplierDocumentsCard("owner", null)).toBe(true);
    for (const job of ["manager", "designer", "accountant", "chief_accountant", "junior_accountant", null]) {
      expect(canSeeSupplierDocumentsCard("member", job)).toBe(false);
    }
  });
});
