import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

vi.mock("@/features/orders/order-details/OrderItemDocumentNamesField", () => ({
  OrderItemDocumentNamesField: () => null,
}));

import { OrderItemsTable } from "./OrderItemsTable";

const record = (item: Record<string, unknown>) =>
  ({
    currency: "UAH",
    total: 100,
    items: [{ id: "1", position: 1, name: "Футболка", qty: 1, unit: "шт.", unitPrice: 100, lineTotal: 100, ...item }],
  }) as unknown as DerivedOrderRecord;

const show = (item: Record<string, unknown>) =>
  render(<OrderItemsTable record={record(item)} teamId="team" onDocumentNamesSaved={() => {}} />);

describe("OrderItemsTable: звідки товар", () => {
  it("показує артикул, колір і сайт позиції без каталогу", () => {
    show({ metadata: { sku: "99200", color: "Хакі", sourceUrl: "https://e-suvenir.com.ua/ua/x" } });
    expect(screen.getByText("арт. 99200")).toBeTruthy();
    expect(screen.getByText("Хакі")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://e-suvenir.com.ua/ua/x");
  });

  it("не дублює колір, який уже в назві", () => {
    show({ name: "Футболка · Хакі", metadata: { color: "Хакі" } });
    expect(screen.queryByText("Хакі")).toBeNull();
  });

  it("позиція з прорахунку без цих даних виглядає як раніше", () => {
    show({ metadata: null });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/арт\./)).toBeNull();
  });
});
