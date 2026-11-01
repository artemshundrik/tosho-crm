import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerRecord } from "@/components/customers/customerCardLoad";
import type { EntityLockState } from "@/hooks/useEntityLock";

const mocks = vi.hoisted(() => ({
  loadCustomerRow: vi.fn(),
  loadPartyLinkedRecords: vi.fn(),
  writeCustomerSection: vi.fn(),
  useEntityLock: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ teamId: "t1", userId: "u1", accessRole: "member", jobRole: "manager" }),
}));
vi.mock("@/components/customers/customerCardLoad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/customers/customerCardLoad")>()),
  loadCustomerRow: mocks.loadCustomerRow,
}));
vi.mock("@/components/customers/partyLinkedRecords", () => ({ loadPartyLinkedRecords: mocks.loadPartyLinkedRecords }));
vi.mock("@/components/customers/partyFieldWrite", () => ({
  writeCustomerFields: vi.fn().mockResolvedValue({ ok: true }),
  writeCustomerSection: mocks.writeCustomerSection,
}));
vi.mock("@/lib/entityLock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entityLock")>()),
  readEntityLock: vi.fn().mockResolvedValue(null),
  requestEntityLockRelease: vi.fn(),
}));
vi.mock("@/hooks/useEntityLock", () => ({ useEntityLock: mocks.useEntityLock }));

import CustomerPage from "./CustomerPage";

const LEGAL_ENTITY = {
  id: "le1",
  ownership_type: "tov",
  legal_name: "РЕЧІ",
  tax_id: "44885114",
  legal_address: "Київ, вул. Хрещатик, 1",
  iban: "",
  signatory_position: "директор",
};

const ROW: CustomerRecord = {
  id: "c1",
  name: "Червоний маркет",
  payment_type: "invoice",
  legal_entities: [LEGAL_ENTITY],
  contacts: [{ name: "Анна", position: "закупівлі", phone: "+380672170022", email: "anna@rechi.ua", birthday: "", telegram: "" }],
  created_at: "2026-02-27T10:00:00Z",
};

const IDLE_LOCK: EntityLockState = {
  loading: false,
  acquired: false,
  lockedByOther: false,
  holderName: null,
  error: null,
  releaseRequestedByName: null,
  releaseRequestSent: false,
  idleSecondsLeft: null,
  releasedReason: null,
  requestRelease: async () => {},
  forceRelease: async () => {},
  release: () => {},
  keepAlive: () => {},
  resume: () => {},
};

function renderPage(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/orders/customers/c1${search}`]}>
      <Routes>
        <Route path="/orders/customers/:id" element={<CustomerPage />} />
        <Route path="/orders/customers" element={<p>Список замовників</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Замок бере лише той, кому `enabled`: так і в житті — без «Змінити» замка немає. */
const lockFor = (state: Partial<EntityLockState>) =>
  mocks.useEntityLock.mockImplementation(({ enabled }: { enabled: boolean }) =>
    enabled ? { ...IDLE_LOCK, ...state } : IDLE_LOCK,
  );

beforeEach(() => {
  mocks.loadCustomerRow.mockReset().mockResolvedValue({ data: ROW, error: null });
  mocks.loadPartyLinkedRecords
    .mockReset()
    .mockResolvedValue({ calculations: [], orders: [], designTasks: [], ltvEntry: null });
  mocks.writeCustomerSection.mockReset().mockResolvedValue({ ok: true });
  lockFor({ acquired: true });
});

describe("CustomerPage", () => {
  it("?section=requisites відкриває розділ «Реквізити»", async () => {
    renderPage("?section=requisites");
    const section = await screen.findByTestId("customer-section-requisites");
    expect(within(section).getByText("44885114")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-section-contacts")).not.toBeInTheDocument();
  });

  it("«Змінити» в Реквізитах бере замок розділу; чужий замок — банер і лише перегляд", async () => {
    lockFor({ lockedByOther: true, holderName: "Анна" });
    renderPage("?section=requisites");
    fireEvent.click(await screen.findByRole("button", { name: "Змінити" }));
    expect(mocks.useEntityLock).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: "customer:requisites", entityId: "c1", enabled: true }),
    );
    expect(await screen.findByText("редагує реквізити")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зберегти" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Код ЄДРПОУ")).not.toBeInTheDocument();
  });

  it("ЄДРПОУ «4488511» — «ЄДРПОУ — 8 цифр», і «Зберегти» неактивна", async () => {
    renderPage("?section=requisites");
    fireEvent.click(await screen.findByRole("button", { name: "Змінити" }));
    const field = await screen.findByLabelText("Код ЄДРПОУ");
    fireEvent.change(field, { target: { value: "4488511" } });
    expect(screen.getByText("ЄДРПОУ — 8 цифр")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
  });

  it("змінили поле й тиснуть «Скасувати» — питаємо; «Продовжити редагування» тримає введене", async () => {
    renderPage("?section=requisites");
    fireEvent.click(await screen.findByRole("button", { name: "Змінити" }));
    fireEvent.change(await screen.findByLabelText("Юридична назва"), { target: { value: "РЕЧІ ПЛЮС" } });
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(await screen.findByText("Закрити без збереження?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продовжити редагування" }));
    expect(screen.getByLabelText("Юридична назва")).toHaveValue("РЕЧІ ПЛЮС");
  });

  it("зберігає лише колонки реквізитів", async () => {
    renderPage("?section=requisites");
    fireEvent.click(await screen.findByRole("button", { name: "Змінити" }));
    fireEvent.change(await screen.findByLabelText("Юридична назва"), { target: { value: "РЕЧІ ПЛЮС" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(mocks.writeCustomerSection).toHaveBeenCalledTimes(1);
    const [id, patch] = mocks.writeCustomerSection.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("c1");
    expect(patch.legal_name).toBe("РЕЧІ ПЛЮС");
    expect(Object.keys(patch)).not.toContain("notes");
    expect(Object.keys(patch)).not.toContain("contacts");
  });

  it("порожня відповідь — «Замовника не знайдено» і посилання до списку", async () => {
    mocks.loadCustomerRow.mockResolvedValue({ data: null, error: null });
    renderPage();
    expect(await screen.findByText("Замовника не знайдено")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "До списку замовників" }));
    expect(await screen.findByText("Список замовників")).toBeInTheDocument();
  });
});
