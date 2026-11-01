import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadRow } from "../leadRecord";
import { buildLeadFormFromRow } from "../leadRecord";

const mocks = vi.hoisted(() => ({
  loadLeadRow: vi.fn(),
  loadPartyLinkedRecords: vi.fn(),
  writeLeadFields: vi.fn(),
  saveLeadCard: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ teamId: "t1", userId: "u1", accessRole: "member", jobRole: "manager" }),
}));
vi.mock("../leadCardLoad", () => ({ loadLeadRow: mocks.loadLeadRow }));
vi.mock("../partyLinkedRecords", () => ({ loadPartyLinkedRecords: mocks.loadPartyLinkedRecords }));
vi.mock("../partyFieldWrite", () => ({ writeLeadFields: mocks.writeLeadFields }));
vi.mock("../partyCardSave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../partyCardSave")>()),
  saveLeadCard: mocks.saveLeadCard,
}));
vi.mock("@/lib/workspace", () => ({ resolveWorkspaceId: vi.fn().mockResolvedValue("w1") }));
vi.mock("@/lib/workspaceMemberDirectory", () => ({
  listWorkspaceMembersForDisplay: vi.fn().mockResolvedValue([{ userId: "u1", label: "Дарʼя М.", avatarDisplayUrl: null }]),
}));

import { LeadConversionForm } from "./LeadConversionForm";
import { LeadPanel } from "./LeadPanel";

/** MAS Seeds: є назва, джерело, контакт і телефон — реквізитів немає. */
const MAS_SEEDS: LeadRow = {
  id: "l1",
  company_name: "MAS Seeds",
  first_name: "Людмила",
  source: "Конференція",
  phone_numbers: ["+380966960056"],
  payment_type: "invoice",
  manager: "Дарʼя М.",
  manager_user_id: "u1",
  created_at: "2026-08-26T10:00:00Z",
} as LeadRow;

const EMPTY_LINKED = { calculations: [], orders: [], designTasks: [], ltvEntry: null };
const IBAN_27 = "305299000002600800503482700";

function fields() {
  return screen.queryAllByTestId(/^conversion-field-/).map((node) => node.getAttribute("data-testid"));
}

describe("LeadConversionForm", () => {
  it("для ліда з одним телефоном на «Рахунку» питає рівно шість полів", () => {
    render(
      <LeadConversionForm name="MAS Seeds" form={buildLeadFormFromRow(MAS_SEEDS, "Дарʼя М.")} onCancel={() => {}} onConvert={() => {}} />,
    );
    expect(fields()).toEqual([
      "conversion-field-ownership",
      "conversion-field-taxId",
      "conversion-field-legalAddress",
      "conversion-field-iban",
      "conversion-field-signatory",
      "conversion-field-documentEmail",
    ]);
    expect(screen.getByRole("button", { name: "Перевести" })).toBeDisabled();
  });

  it("ФОП: ІПН — 10 цифр, IBAN — UA і 27 цифр; лише тоді «Перевести»", () => {
    const onConvert = vi.fn();
    render(
      <LeadConversionForm name="MAS Seeds" form={buildLeadFormFromRow(MAS_SEEDS, "Дарʼя М.")} onCancel={() => {}} onConvert={onConvert} />,
    );
    fireEvent.click(within(screen.getByTestId("conversion-field-ownership")).getByRole("button", { name: "ФОП" }));

    const tax = screen.getByLabelText(/ІПН ФОП/);
    fireEvent.change(tax, { target: { value: "12345678" } });
    fireEvent.blur(tax);
    expect(screen.getByText("ІПН ФОП — 10 цифр")).toBeInTheDocument();

    const iban = screen.getByLabelText(/IBAN/);
    fireEvent.change(iban, { target: { value: "1234" } });
    fireEvent.blur(iban);
    expect(screen.getByText("IBAN — це UA і 27 цифр")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Прописка/), { target: { value: "Київ, вул. Хрещатик, 1" } });
    fireEvent.change(screen.getByLabelText(/Пошта для документів/), { target: { value: "lyudmyla@masseeds.ua" } });
    // ФОП підписує сам — посада підставилась.
    expect(screen.getByLabelText(/Посада підписанта/)).toHaveValue("ФОП");
    expect(screen.getByRole("button", { name: "Перевести" })).toBeDisabled();

    fireEvent.change(tax, { target: { value: "1234567890" } });
    fireEvent.change(iban, { target: { value: IBAN_27 } });
    expect(screen.queryByText("ІПН ФОП — 10 цифр")).not.toBeInTheDocument();
    expect(screen.queryByText("IBAN — це UA і 27 цифр")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
    expect(onConvert).toHaveBeenCalledWith({
      ownershipType: "fop",
      taxId: "1234567890",
      legalAddress: "Київ, вул. Хрещатик, 1",
      iban: `UA${IBAN_27}`,
      signatoryPosition: "ФОП",
      email: "lyudmyla@masseeds.ua",
    });
  });
});

describe("LeadPanel", () => {
  beforeEach(() => {
    mocks.loadLeadRow.mockReset().mockResolvedValue({ ...MAS_SEEDS });
    mocks.loadPartyLinkedRecords.mockReset().mockResolvedValue(EMPTY_LINKED);
    mocks.writeLeadFields.mockReset().mockResolvedValue({ ok: true });
    mocks.saveLeadCard.mockReset().mockResolvedValue({ logoUrl: null, convertedCustomerId: "c-new" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function renderPanel(extra: Partial<Parameters<typeof LeadPanel>[0]> = {}) {
    return render(
      <MemoryRouter>
        <LeadPanel leadId="l1" fallbackName="MAS Seeds" onClose={() => {}} onOpenFull={() => {}} {...extra} />
      </MemoryRouter>,
    );
  }

  it("показує ті самі сім пунктів готовності, що й у замовника", async () => {
    renderPanel();
    expect(await screen.findByText("Готово 1 з 7")).toBeInTheDocument();
  });

  it("«Готівка»: форма переведення без полів, одразу «Перевести»", async () => {
    mocks.loadLeadRow.mockResolvedValue({ ...MAS_SEEDS, payment_type: "cash" });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Перевести в замовники" }));
    expect(fields()).toEqual([]);
    expect(screen.getByRole("button", { name: "Перевести" })).toBeEnabled();
  });

  it("переведення пишеться в базу лише через 6 с, і панель стає замовником", async () => {
    mocks.loadLeadRow.mockResolvedValue({ ...MAS_SEEDS, payment_type: "cash" });
    const onSaved = vi.fn();
    const onConverted = vi.fn();
    renderPanel({ onSaved, onConverted });
    fireEvent.click(await screen.findByRole("button", { name: "Перевести в замовники" }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
    expect(screen.getByText(/стане замовником/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_999));
    expect(mocks.saveLeadCard).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(mocks.saveLeadCard).toHaveBeenCalledTimes(1);
    expect(mocks.saveLeadCard.mock.calls[0][0]).toMatchObject({ leadId: "l1", convertToCustomer: true });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ kind: "lead", id: "l1", convertedCustomerId: "c-new" }));
    expect(onConverted).toHaveBeenCalledWith("c-new");
  });

  it("нотатка, дописана поки чекає «Скасувати», переходить у замовника", async () => {
    mocks.loadLeadRow.mockResolvedValue({ ...MAS_SEEDS, payment_type: "cash" });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Перевести в замовники" }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
    const notes = screen.getByLabelText("Нотатки");
    fireEvent.change(notes, { target: { value: "Дзвонити після 14:00" } });
    fireEvent.blur(notes);
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    expect(mocks.saveLeadCard.mock.calls[0][0].form.notes).toBe("Дзвонити після 14:00");
  });

  it("поки переведення чекає, повна картка ліда не відкривається", async () => {
    mocks.loadLeadRow.mockResolvedValue({ ...MAS_SEEDS, payment_type: "cash" });
    const onOpenFull = vi.fn();
    renderPanel({ onOpenFull });
    fireEvent.click(await screen.findByRole("button", { name: "Перевести в замовники" }));
    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onOpenFull).not.toHaveBeenCalled();
  });

  it("«Скасувати» в панелі — у базу нічого не йде", async () => {
    mocks.loadLeadRow.mockResolvedValue({ ...MAS_SEEDS, payment_type: "cash" });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Перевести в замовники" }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
    fireEvent.click(screen.getByRole("button", { name: "Скасувати переведення" }));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mocks.saveLeadCard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Перевести в замовники" })).toBeInTheDocument();
  });
});
