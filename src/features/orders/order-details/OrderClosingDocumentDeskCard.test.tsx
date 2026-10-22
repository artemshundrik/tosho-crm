import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

import { OrderClosingDocumentDeskCard } from "./OrderClosingDocumentDeskCard";

vi.mock("@/features/orders/orderLegalEntityQueries", () => ({ setOrderClosingDocumentNumber: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BLOCKER = "Склад ще не підтвердив отримання: Парасолі";

function renderCard(
  closingDocument: "act" | "waybill",
  waybillBlockers?: string[],
  overrides: Partial<DerivedOrderRecord> = {}
) {
  const record = {
    id: "order-378",
    closingDocument,
    actNumber: null,
    actDate: null,
    waybillNumber: null,
    waybillDate: null,
    ...overrides,
  } as unknown as DerivedOrderRecord;
  render(
    <OrderClosingDocumentDeskCard
      record={record}
      teamId="team-1"
      onSaved={vi.fn()}
      onPreview={null}
      waybillBlockers={waybillBlockers}
    />
  );
}

describe("картка закривального документа: гейт ВН", () => {
  it("ВН і склад не підтвердив отримання: номер неактивний, причину видно", () => {
    renderCard("waybill", [BLOCKER]);
    expect((screen.getByLabelText("Номер з BAS") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(BLOCKER)).toBeTruthy();
  });

  it("акт: проп ігнорується, номер активний", () => {
    renderCard("act", [BLOCKER]);
    expect((screen.getByLabelText("Номер з BAS") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(BLOCKER)).toBeNull();
  });

  it("ВН і порожній список причин: номер активний", () => {
    renderCard("waybill", []);
    expect((screen.getByLabelText("Номер з BAS") as HTMLInputElement).disabled).toBe(false);
  });

  it("ВН без пропа (посада без вкладки «Економіка»): номер активний, перевіряє база", () => {
    renderCard("waybill");
    expect((screen.getByLabelText("Номер з BAS") as HTMLInputElement).disabled).toBe(false);
  });

  it("ВН уже внесено: правити номер можна, як і в базі гейт лише на першому внесенні", () => {
    renderCard("waybill", [BLOCKER], { waybillNumber: "РН-12", waybillDate: "2026-10-20" });
    expect((screen.getByLabelText("Номер з BAS") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(BLOCKER)).toBeNull();
  });
});
