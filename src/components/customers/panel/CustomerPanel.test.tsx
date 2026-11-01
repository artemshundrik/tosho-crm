import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CustomerRecord } from "../customerCardLoad";

const auth = vi.hoisted(() => ({
  value: { teamId: "t1", userId: "u1", accessRole: "member", jobRole: "manager" } as Record<string, string | null>,
}));
const mocks = vi.hoisted(() => ({
  loadCustomerRow: vi.fn(),
  loadPartyLinkedRecords: vi.fn(),
  writeCustomerFields: vi.fn(),
  writeCustomerSection: vi.fn(),
  readEntityLock: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("../customerCardLoad", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../customerCardLoad")>()),
  loadCustomerRow: mocks.loadCustomerRow,
}));
vi.mock("../partyLinkedRecords", () => ({ loadPartyLinkedRecords: mocks.loadPartyLinkedRecords }));
vi.mock("../partyFieldWrite", () => ({
  writeCustomerFields: mocks.writeCustomerFields,
  writeCustomerSection: mocks.writeCustomerSection,
}));
vi.mock("@/hooks/useEntityLock", () => ({
  useEntityLock: () => ({
    loading: false,
    acquired: true,
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
  }),
}));
vi.mock("@/lib/workspace", () => ({ resolveWorkspaceId: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/entityLock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entityLock")>()),
  readEntityLock: mocks.readEntityLock,
  requestEntityLockRelease: vi.fn(),
}));

import { CustomerPanel } from "./CustomerPanel";

const LEGAL_ENTITY = {
  id: "le1",
  ownership_type: "tov",
  legal_name: "РЕЧІ",
  tax_id: "12345678",
  legal_address: "Київ, вул. Хрещатик, 1",
  iban: "",
  signatory_position: "директор",
};

/** Замовник «на рахунку», у якого заповнене все, крім IBAN: 6 з 7. */
const ROW: CustomerRecord = {
  id: "c1",
  name: "Червоний маркет",
  payment_type: "invoice",
  legal_entities: [LEGAL_ENTITY],
  contacts: [{ name: "Анна", position: "закупівлі", phone: "+380672170022", email: "anna@rechi.ua", birthday: "", telegram: "" }],
  created_at: "2026-02-27T10:00:00Z",
};

const EMPTY_LINKED = { calculations: [], orders: [], designTasks: [], ltvEntry: null };

function renderPanel(onClose: () => void = () => {}) {
  return render(
    <MemoryRouter initialEntries={["/orders/estimates"]}>
      <Routes>
        <Route path="/orders/estimates" element={<CustomerPanel customerId="c1" fallbackName="Червоний маркет" onClose={onClose} />} />
        <Route path="/orders/customers/:id" element={<p>Сторінка замовника</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.value = { teamId: "t1", userId: "u1", accessRole: "member", jobRole: "manager" };
  mocks.loadCustomerRow.mockReset().mockResolvedValue({ data: ROW, error: null });
  mocks.loadPartyLinkedRecords.mockReset().mockResolvedValue(EMPTY_LINKED);
  mocks.writeCustomerFields.mockReset().mockResolvedValue({ ok: true });
  mocks.writeCustomerSection.mockReset().mockResolvedValue({ ok: true });
  mocks.readEntityLock.mockReset().mockResolvedValue(null);
});

describe("CustomerPanel", () => {
  it("поки вантажиться — скелет, а назва з місця кліку вже видна", () => {
    mocks.loadCustomerRow.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByRole("dialog", { name: "Червоний маркет" })).toBeInTheDocument();
    expect(screen.getByTestId("party-panel-skeleton")).toBeInTheDocument();
  });

  it("⤢ «Розгорнути на всю сторінку» закриває шторку й веде на сторінку замовника", async () => {
    const onClose = vi.fn();
    renderPanel(onClose);
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Розгорнути на всю сторінку" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Сторінка замовника")).toBeInTheDocument();
  });

  it("назва правиться в шапці шторки й пишеться окремо", async () => {
    renderPanel();
    const name = await screen.findByRole("textbox", { name: "Назва замовника" });
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "Червоний маркет 2" } });
    fireEvent.blur(name);
    await waitFor(() => expect(mocks.writeCustomerFields).toHaveBeenCalledWith("c1", { name: "Червоний маркет 2" }));
  });

  it("на «Рахунку» без IBAN — «6 з 7», і IBAN вписується прямо в блоці", async () => {
    renderPanel();
    const block = await screen.findByTestId("readiness-block");
    expect(within(block).getByText("6")).toBeInTheDocument();
    const iban = within(block).getByLabelText("IBAN");
    // Чого не бракує, у блоці не просимо.
    expect(within(block).queryByLabelText("ЄДРПОУ")).not.toBeInTheDocument();
    fireEvent.focus(iban);
    await waitFor(() => expect(mocks.loadCustomerRow).toHaveBeenCalledTimes(2));
    fireEvent.change(within(block).getByLabelText("IBAN"), { target: { value: "UA213223130000026007233566001" } });
    await waitFor(() => expect(mocks.writeCustomerSection).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [, patch] = mocks.writeCustomerSection.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.iban).toBe("UA213223130000026007233566001");
  });

  it("«Готівка» пишеться одразу й лишає один пункт", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Готівка" }));
    await waitFor(() => expect(mocks.writeCustomerFields).toHaveBeenCalledWith("c1", { payment_type: "cash" }));
    expect(within(screen.getByTestId("readiness-block")).getByText("з 1")).toBeInTheDocument();
  });

  it("форма оплати не вказана — «Можна виставляти рахунок» не кажемо", async () => {
    mocks.loadCustomerRow.mockResolvedValue({
      data: { ...ROW, payment_type: null, legal_entities: [{ ...LEGAL_ENTITY, iban: "UA213223130000026007233566001" }] },
      error: null,
    });
    renderPanel();
    const block = await screen.findByTestId("readiness-block");
    expect(within(block).getByText("Для рахунку все є — лишилось вибрати форму оплати.")).toBeInTheDocument();
    expect(within(block).queryByText("Можна виставляти рахунок")).not.toBeInTheDocument();
  });

  it("кілька незвезених замовлень без адреси — одна картка з лічильником", async () => {
    const order = (n: number) => ({ id: `o${n}`, number: `TO-1026-000${n}`, status: "in_production", delivery_status: null });
    mocks.loadPartyLinkedRecords.mockResolvedValue({ ...EMPTY_LINKED, orders: [1, 2, 3, 4, 5].map(order) });
    renderPanel();
    expect(await screen.findByText(/5 замовлень ще не/)).toBeInTheDocument();
    expect(screen.getByText("TO-1026-0001, TO-1026-0002, TO-1026-0003 і ще 2")).toBeInTheDocument();
  });

  it("дизайнер бачить папку Dropbox, а не гроші й реквізити", async () => {
    auth.value = { ...auth.value, jobRole: "designer" };
    renderPanel();
    expect(await screen.findByText("Папка в Dropbox")).toBeInTheDocument();
    expect(screen.queryByText("Гроші")).not.toBeInTheDocument();
    expect(screen.queryByText("Робота")).not.toBeInTheDocument();
    expect(screen.queryByTestId("readiness-block")).not.toBeInTheDocument();
  });

  it("запит упав — «Картку не завантажили» і «Спробувати ще», назва лишилась", async () => {
    mocks.loadCustomerRow.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    renderPanel();
    expect(await screen.findByText("Картку не завантажили")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Червоний маркет" })).toBeInTheDocument();
    mocks.loadCustomerRow.mockResolvedValue({ data: ROW, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще" }));
    expect(await screen.findByTestId("readiness-block")).toBeInTheDocument();
  });
});
