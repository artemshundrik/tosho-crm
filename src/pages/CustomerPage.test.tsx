import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerRecord } from "@/components/customers/customerCardLoad";
import type { EntityLockState } from "@/hooks/useEntityLock";

const mocks = vi.hoisted(() => ({
  loadCustomerRow: vi.fn(),
  loadPartyLinkedRecords: vi.fn(),
  writeCustomerSection: vi.fn(),
  writeCustomerFields: vi.fn(),
  useEntityLock: vi.fn(),
  readEntityLock: vi.fn(),
  requestEntityLockRelease: vi.fn(),
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
  writeCustomerFields: mocks.writeCustomerFields,
  writeCustomerSection: mocks.writeCustomerSection,
}));
vi.mock("@/lib/entityLock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entityLock")>()),
  readEntityLock: mocks.readEntityLock,
  requestEntityLockRelease: mocks.requestEntityLockRelease,
}));
vi.mock("@/hooks/useEntityLock", () => ({ useEntityLock: mocks.useEntityLock }));
vi.mock("@/lib/workspace", () => ({ resolveWorkspaceId: vi.fn().mockResolvedValue(null) }));

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

/** Замок бере лише той, кому `enabled`: так і в житті — без фокусу в полі замка немає. */
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
  mocks.writeCustomerFields.mockReset().mockResolvedValue({ ok: true });
  mocks.readEntityLock.mockReset().mockResolvedValue(null);
  mocks.requestEntityLockRelease.mockReset().mockResolvedValue(undefined);
  lockFor({ acquired: true });
});

describe("CustomerPage", () => {
  it("кнопки «Змінити основне» немає: назва правиться в шапці й пишеться окремо", async () => {
    renderPage();
    const name = await screen.findByRole("textbox", { name: "Назва замовника" });
    expect(screen.queryByRole("button", { name: "Змінити основне" })).not.toBeInTheDocument();
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "Червоний маркет 2" } });
    fireEvent.blur(name);
    await waitFor(() => expect(mocks.writeCustomerFields).toHaveBeenCalledWith("c1", { name: "Червоний маркет 2" }));
  });

  it("порожню назву не пишемо — повертаємо збережену", async () => {
    renderPage();
    const name = await screen.findByRole("textbox", { name: "Назва замовника" });
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.blur(name);
    expect(name).toHaveValue("Червоний маркет");
    expect(mocks.writeCustomerFields).not.toHaveBeenCalled();
  });

  it("реквізити видно полями без «Змінити»; фокус у полі бере замок і перечитує замовника", async () => {
    renderPage();
    const field = await screen.findByLabelText("ЄДРПОУ");
    expect(field).toHaveValue("44885114");
    expect(screen.queryByRole("button", { name: "Змінити" })).not.toBeInTheDocument();
    const fresh = { ...ROW, legal_entities: [{ ...LEGAL_ENTITY, legal_name: "РЕЧІ ВІД КОЛЕГИ" }], legal_name: "РЕЧІ ВІД КОЛЕГИ" };
    mocks.loadCustomerRow.mockResolvedValue({ data: fresh, error: null });
    fireEvent.focus(field);
    expect(mocks.useEntityLock).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: "customer:requisites", entityId: "c1", enabled: true }),
    );
    expect(await screen.findByDisplayValue("РЕЧІ ВІД КОЛЕГИ")).toBeInTheDocument();
  });

  it("замок колеги вже стоїть — «Реквізити зараз редагує Анна» і «Попросити передати»", async () => {
    mocks.readEntityLock.mockResolvedValue({ lockedBy: "u2", lockedByName: "Анна", expiresAt: null });
    renderPage();
    expect(await screen.findByText(/Реквізити зараз редагує Анна/)).toBeInTheDocument();
    expect(screen.getByLabelText("ЄДРПОУ")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Попросити передати" }));
    expect(mocks.requestEntityLockRelease).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "customer:requisites", entityId: "c1", userId: "u1" }),
    );
  });

  it("замок не дали — банер «редагує реквізити», нічого не пишемо", async () => {
    lockFor({ lockedByOther: true, holderName: "Анна" });
    renderPage();
    fireEvent.focus(await screen.findByLabelText("ЄДРПОУ"));
    expect(await screen.findByText("редагує реквізити")).toBeInTheDocument();
    expect(mocks.writeCustomerSection).not.toHaveBeenCalled();
  });

  it("ЄДРПОУ «4488511» — помилка під полем, і нічого не пишеться", async () => {
    renderPage();
    const field = await screen.findByLabelText("ЄДРПОУ");
    fireEvent.focus(field);
    await screen.findByDisplayValue("РЕЧІ");
    await waitFor(() => expect(mocks.loadCustomerRow).toHaveBeenCalledTimes(2));
    fireEvent.change(field, { target: { value: "4488511" } });
    expect(await screen.findByText("ЄДРПОУ — 8 цифр")).toBeInTheDocument();
    fireEvent.blur(field);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(mocks.writeCustomerSection).not.toHaveBeenCalled();
  });

  it("пауза в наборі записує ЛИШЕ колонки реквізитів", async () => {
    renderPage();
    const field = await screen.findByLabelText("Повна назва");
    fireEvent.focus(field);
    await waitFor(() => expect(mocks.loadCustomerRow).toHaveBeenCalledTimes(2));
    fireEvent.change(field, { target: { value: "РЕЧІ ПЛЮС" } });
    await waitFor(() => expect(mocks.writeCustomerSection).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [id, patch] = mocks.writeCustomerSection.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("c1");
    expect(patch.legal_name).toBe("РЕЧІ ПЛЮС");
    expect(Object.keys(patch)).not.toContain("notes");
    expect(Object.keys(patch)).not.toContain("contacts");
  });

  it("«Для рахунку 6 з 7»: пігулка «IBAN» веде фокус у поле IBAN", async () => {
    renderPage();
    const block = await screen.findByTestId("readiness-block");
    expect(within(block).getByText("6")).toBeInTheDocument();
    fireEvent.click(within(block).getByRole("button", { name: "IBAN" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("IBAN")));
  });

  it("контакти — картками з полями на місці й «+ Додати контакт»", async () => {
    renderPage();
    const cards = await screen.findAllByTestId("contact-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByRole("textbox", { name: "Імʼя" })).toHaveValue("Анна");
    fireEvent.click(screen.getByRole("button", { name: "+ Додати контакт" }));
    expect(screen.getAllByTestId("contact-card")).toHaveLength(2);
  });

  it("порожня відповідь — «Замовника не знайдено» і посилання до списку", async () => {
    mocks.loadCustomerRow.mockResolvedValue({ data: null, error: null });
    renderPage();
    expect(await screen.findByText("Замовника не знайдено")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "До списку замовників" }));
    expect(await screen.findByText("Список замовників")).toBeInTheDocument();
  });
});
