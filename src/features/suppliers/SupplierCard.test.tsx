import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SupplierCard } from "./SupplierCard";
import { supplierById, type SupplierDefinition } from "./suppliersCatalog";
import { supplierStatus, type SupplierPoolSummaryRow, type SupplierStatus } from "./suppliersStatus";

const now = new Date("2026-09-09T12:00:00Z");
const totobi = supplierById("totobi")!;
const summary: SupplierPoolSummaryRow = {
  supplier_slug: "totobi.com.ua",
  contractor_id: null,
  rows_active: 3150,
  products: 679,
  with_price: 3074,
  with_photo: 3145,
  categories: 72,
  last_observed: "2026-09-09T10:00:00Z",
  first_loaded: "2026-09-08T08:06:16Z",
};

const renderCard = (definition: SupplierDefinition, status: SupplierStatus) =>
  render(
    <MemoryRouter>
      <SupplierCard definition={definition} status={status} />
    </MemoryRouter>
  );

describe("SupplierCard", () => {
  it("веде на сторінку постачальника й показує три числа", () => {
    renderCard(totobi, supplierStatus(totobi, summary, now));
    expect(screen.getByRole("link", { name: /Totobi/ })).toHaveAttribute("href", "/integrations/suppliers/totobi");
    expect(screen.getByText("679")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getByText("2 години тому")).toBeInTheDocument();
    expect(screen.getByText("У пошуку прорахунку")).toBeInTheDocument();
  });

  it("застарілі дані — попередження з датою прогону", () => {
    renderCard(totobi, supplierStatus(totobi, { ...summary, last_observed: "2026-09-07T10:00:00Z" }, now));
    expect(screen.getByText("Дані застаріли")).toBeInTheDocument();
    expect(screen.getByText(/Останній прогін 07\.09/)).toBeInTheDocument();
  });

  it("запланований — без чисел, з тим, що заважає", () => {
    // Синтетичний, а не реальний: під'єднаний постачальник забирає з реєстру
    // приклад «плануємо», і перевірка падає на успіху — див. suppliersStatus.test.ts.
    const planned = {
      ...totobi,
      slug: "example.com",
      name: "Example",
      inQuoteSearch: false,
      searchNote: "Ще не під'єднано.",
      planned: { since: "2026-09-05", blocker: "Потрібно з'ясувати, як віддають ціни." },
    };
    renderCard(planned, supplierStatus(planned, null, now));
    expect(screen.getByText("Плануємо")).toBeInTheDocument();
    expect(screen.getByText(planned.planned.blocker)).toBeInTheDocument();
    expect(screen.queryByText("товарів")).not.toBeInTheDocument();
  });
});
