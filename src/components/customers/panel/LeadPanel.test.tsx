import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadRow } from "../leadRecord";
import { buildLeadFormFromRow } from "../leadRecord";

const mocks = vi.hoisted(() => ({
  loadLeadRow: vi.fn(),
  loadPartyLinkedRecords: vi.fn(),
  writeLeadFields: vi.fn(),
  saveLeadCard: vi.fn(),
  findDuplicatePartyMessage: vi.fn(),
  toastError: vi.fn(),
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
vi.mock("../partyCreate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../partyCreate")>()),
  findDuplicatePartyMessage: mocks.findDuplicatePartyMessage,
}));
vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: Object.assign(actual.toast, { error: mocks.toastError }) };
});
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
    mocks.findDuplicatePartyMessage.mockReset().mockResolvedValue(null);
    mocks.toastError.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function fillConversionForm() {
    fireEvent.click(within(screen.getByTestId("conversion-field-ownership")).getByRole("button", { name: "ФОП" }));
    fireEvent.change(screen.getByLabelText(/ІПН ФОП/), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText(/IBAN/), { target: { value: IBAN_27 } });
    fireEvent.change(screen.getByLabelText(/Прописка/), { target: { value: "Київ, вул. Хрещатик, 1" } });
    fireEvent.change(screen.getByLabelText(/Пошта для документів/), { target: { value: "lyudmyla@masseeds.ua" } });
  }

  function renderPanel(extra: Partial<Parameters<typeof LeadPanel>[0]> = {}) {
    return render(
      <MemoryRouter>
        <LeadPanel leadId="l1" fallbackName="MAS Seeds" onClose={() => {}} {...extra} />
      </MemoryRouter>,
    );
  }

  it("показує ті самі сім пунктів готовності, що й у замовника", async () => {
    renderPanel();
    const block = await screen.findByTestId("readiness-block");
    expect(within(block).getByText("1")).toBeInTheDocument();
    expect(within(block).getByText("з 7")).toBeInTheDocument();
  });

  it("IBAN вписується прямо в блоці й пишеться в колонку ліда при виході з поля", async () => {
    renderPanel();
    const block = await screen.findByTestId("readiness-block");
    const iban = within(block).getByLabelText("IBAN");
    fireEvent.change(iban, { target: { value: `UA${IBAN_27}` } });
    fireEvent.blur(iban);
    await waitFor(() => expect(mocks.writeLeadFields).toHaveBeenCalledWith("l1", { iban: `UA${IBAN_27}` }));
  });

  it("повної картки більше немає: ні ⤢, ні кнопки внизу", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    expect(screen.queryByRole("button", { name: "Розгорнути на всю сторінку" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Відкрити повну картку" })).toBeNull();
  });

  it("назва пишеться з шапки, порожня повертає збережену", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    const name = screen.getByLabelText("Назва ліда");
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.blur(name);
    expect(mocks.writeLeadFields).not.toHaveBeenCalled();
    expect(name).toHaveValue("MAS Seeds");
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "MAS Seeds Ukraine" } });
    fireEvent.blur(name);
    await waitFor(() => expect(mocks.writeLeadFields).toHaveBeenCalledWith("l1", { company_name: "MAS Seeds Ukraine" }));
  });

  it("Esc у назві скасовує правку, а не зберігає її", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    const name = screen.getByLabelText("Назва ліда") as HTMLInputElement;
    name.focus();
    fireEvent.change(name, { target: { value: "Випадковий текст" } });
    fireEvent.keyDown(name, { key: "Escape" });
    await waitFor(() => expect(name).toHaveValue("MAS Seeds"));
    expect(mocks.findDuplicatePartyMessage).not.toHaveBeenCalled();
    expect(mocks.writeLeadFields).not.toHaveBeenCalled();
  });

  it("назва іншої компанії не записується: прорахунки двох лідів злилися б", async () => {
    mocks.findDuplicatePartyMessage.mockResolvedValue("Схожа компанія вже є в CRM як лід.");
    renderPanel();
    await screen.findByTestId("readiness-block");
    const name = screen.getByLabelText("Назва ліда");
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "Інша компанія" } });
    fireEvent.blur(name);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.findDuplicatePartyMessage).toHaveBeenCalledWith("t1", "Інша компанія", { excludeLeadId: "l1" });
    expect(mocks.writeLeadFields).not.toHaveBeenCalled();
    await waitFor(() => expect(name).toHaveValue("MAS Seeds"));
  });

  it("контакт не зберігся після «Готово»: редактор лишається відкритим і каже про це", async () => {
    mocks.writeLeadFields.mockResolvedValue({ ok: false, reason: "network", message: "Немає звʼязку" });
    renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    const lastName = screen.getByLabelText("Прізвище");
    fireEvent.change(lastName, { target: { value: "Коваль" } });
    fireEvent.blur(lastName);
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(screen.getByTestId("lead-contact-editor")).toBeInTheDocument());
    expect(screen.getByLabelText("Прізвище")).toHaveValue("Коваль");
  });

  it("вставка ніка в телефон не затирає наявний Telegram", async () => {
    mocks.loadLeadRow.mockResolvedValue({ ...MAS_SEEDS, telegram: "stary_nik" });
    renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    fireEvent.paste(screen.getByLabelText("Телефон"), { clipboardData: { getData: () => "https://t.me/novyi_nik" } });
    expect(screen.getByLabelText("Telegram")).toHaveValue("stary_nik");
    expect(await screen.findByText(/Telegram уже вказано/)).toBeInTheDocument();
  });

  it("нотатка не губиться, коли панель закрили з курсором у полі", async () => {
    const { unmount } = renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.change(screen.getByLabelText("Нотатки"), { target: { value: "Дзвонити після 14:00" } });
    unmount();
    await waitFor(() => expect(mocks.writeLeadFields).toHaveBeenCalledWith("l1", { notes: "Дзвонити після 14:00" }));
  });

  it("контакт правиться в панелі й пише лише змінене", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    const lastName = screen.getByLabelText("Прізвище");
    fireEvent.change(lastName, { target: { value: "Коваль" } });
    fireEvent.blur(lastName);
    await waitFor(() => expect(mocks.writeLeadFields).toHaveBeenCalledWith("l1", { last_name: "Коваль" }));
    expect(mocks.writeLeadFields).toHaveBeenCalledTimes(1);
  });

  it("порожнє імʼя повертається, у базу не йде", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    const firstName = screen.getByLabelText("Імʼя");
    fireEvent.change(firstName, { target: { value: "" } });
    fireEvent.blur(firstName);
    expect(firstName).toHaveValue("Людмила");
    expect(mocks.writeLeadFields).not.toHaveBeenCalled();
  });

  it("останній спосіб звʼязку не стирається: показує причину й не пише", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    const phone = screen.getByLabelText("Телефон");
    fireEvent.change(phone, { target: { value: "" } });
    fireEvent.blur(phone);
    expect(await screen.findByText(/Вкажіть номер телефону або Telegram/)).toBeInTheDocument();
    expect(mocks.writeLeadFields).not.toHaveBeenCalled();
  });

  it("вписаний контакт не губиться, коли панель закрили з курсором у полі", async () => {
    const { unmount } = renderPanel();
    await screen.findByTestId("readiness-block");
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    fireEvent.change(screen.getByLabelText("Прізвище"), { target: { value: "Коваль" } });
    unmount();
    await waitFor(() => expect(mocks.writeLeadFields).toHaveBeenCalledWith("l1", { last_name: "Коваль" }));
  });

  it("усі реквізити доступні в згорнутому розділі: повна назва пишеться в колонку ліда", async () => {
    renderPanel();
    await screen.findByTestId("readiness-block");
    expect(screen.queryByLabelText("Повна назва")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Показати" }));
    const legal = screen.getByLabelText("Повна назва");
    fireEvent.change(legal, { target: { value: "ТОВ «МАС Сідс»" } });
    fireEvent.blur(legal);
    await waitFor(() => expect(mocks.writeLeadFields).toHaveBeenCalledWith("l1", { legal_name: "ТОВ «МАС Сідс»" }));
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

  it("скасоване переведення не лишає значень форми: закриття панелі їх не записує", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(await screen.findByRole("button", { name: "Перевести в замовники" }));
    fillConversionForm();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
    fireEvent.click(screen.getByRole("button", { name: "Скасувати переведення" }));
    expect(screen.getByRole("button", { name: "Перевести в замовники" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Закрити/ }));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onClose).toHaveBeenCalled();
    expect(mocks.writeLeadFields).not.toHaveBeenCalled();
    expect(mocks.saveLeadCard).not.toHaveBeenCalled();
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
