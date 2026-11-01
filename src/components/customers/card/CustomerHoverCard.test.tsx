import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerRecord } from "../customerCardLoad";

const mocks = vi.hoisted(() => ({
  loadCustomerRow: vi.fn(),
  loadPartyLinkedRecords: vi.fn(),
  readEntityLock: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("../customerCardLoad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../customerCardLoad")>()),
  loadCustomerRow: mocks.loadCustomerRow,
}));
vi.mock("../partyLinkedRecords", () => ({ loadPartyLinkedRecords: mocks.loadPartyLinkedRecords }));
vi.mock("@/lib/entityLock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entityLock")>()),
  readEntityLock: mocks.readEntityLock,
}));

import { CustomerHoverCard } from "./CustomerHoverCard";

const ROW: CustomerRecord = {
  id: "c1",
  name: "Червоний маркет",
  payment_type: "invoice",
  legal_entities: [
    { id: "le1", ownership_type: "tov", legal_name: "РЕЧІ", tax_id: "44885114", legal_address: "Київ", iban: "", signatory_position: "директор" },
  ],
  contacts: [{ name: "Анна", position: "закупівлі", phone: "+380672170022", email: "anna@rechi.ua", birthday: "", telegram: "" }],
  created_at: "2026-02-27T10:00:00Z",
};

function renderRow(onOpenPanel = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/orders/customers"]}>
      <Routes>
        <Route
          path="/orders/customers"
          element={
            <CustomerHoverCard teamId="t1" userId="u1" customerId="c1" onOpenPanel={onOpenPanel}>
              <span>Червоний маркет</span>
            </CustomerHoverCard>
          }
        />
        <Route path="/orders/customers/:id" element={<p>Сторінка замовника</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onOpenPanel;
}

beforeEach(() => {
  mocks.loadCustomerRow.mockReset().mockResolvedValue({ data: ROW, error: null });
  mocks.loadPartyLinkedRecords.mockReset().mockResolvedValue({ calculations: [], orders: [], designTasks: [], ltvEntry: null });
  mocks.readEntityLock.mockReset().mockResolvedValue(null);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const settle = () => act(async () => {
  await vi.runOnlyPendingTimersAsync();
});

describe("CustomerHoverCard", () => {
  it("зʼявляється лише через 2 с наведення, і нічого не вантажить раніше", async () => {
    renderRow();
    fireEvent.mouseEnter(screen.getByText("Червоний маркет"));
    act(() => vi.advanceTimersByTime(1_999));
    expect(screen.queryByTestId("customer-hover")).not.toBeInTheDocument();
    expect(mocks.loadCustomerRow).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    await settle();
    expect(screen.getByTestId("customer-hover")).toBeInTheDocument();
  });

  it("пішли з рядка раніше — картки немає", () => {
    renderRow();
    const trigger = screen.getByText("Червоний маркет");
    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(1_500));
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByTestId("customer-hover")).not.toBeInTheDocument();
  });

  it("показує готовність, основний контакт і веде в панель чи на сторінку", async () => {
    const onOpenPanel = renderRow();
    fireEvent.mouseEnter(screen.getByText("Червоний маркет"));
    act(() => vi.advanceTimersByTime(2_000));
    await settle();
    const card = screen.getByTestId("customer-hover");
    expect(card).toHaveTextContent("6");
    expect(card).toHaveTextContent("з 7");
    expect(card).toHaveTextContent("IBAN");
    expect(card).toHaveTextContent("Анна");
    fireEvent.click(screen.getByRole("button", { name: "Відкрити панель" }));
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it("«Повна картка» веде на сторінку замовника", async () => {
    renderRow();
    fireEvent.mouseEnter(screen.getByText("Червоний маркет"));
    act(() => vi.advanceTimersByTime(2_000));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Повна картка" }));
    await settle();
    expect(screen.getByText("Сторінка замовника")).toBeInTheDocument();
  });
});
