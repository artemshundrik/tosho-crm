import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listCustomersBySearch: vi.fn(), listLeadsBySearch: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/lib/toshoApi", () => ({ listCustomersBySearch: mocks.listCustomersBySearch, listLeadsBySearch: mocks.listLeadsBySearch }));

import { validateLeadCard } from "./partyCardSave";
import { classifyPartyDuplicates, createPartyDraft, draftToCustomerForm, draftToLeadForm, findDuplicatePartyMessage, validatePartyDraft, type PartyCreateDraft } from "./partyCreate";

const draft = (patch: Partial<PartyCreateDraft> = {}): PartyCreateDraft => ({
  ...createPartyDraft("MAS Seeds", "u1"),
  firstName: "Людмила",
  phone: "+380966960056",
  email: "lyuda@mas.ua",
  source: "Сайт",
  ...patch,
});

describe("validatePartyDraft", () => {
  it("лід: досить назви, імені, джерела й телефону", () => {
    expect(validatePartyDraft("lead", draft({ email: "" }))).toEqual({});
  });

  it("лід: Telegram замінює телефон, без обох помилка на телефоні", () => {
    expect(validatePartyDraft("lead", draft({ phone: "", telegram: "@mas" }))).toEqual({});
    expect(validatePartyDraft("lead", draft({ phone: "" })).phone).toMatch(/телефону або Telegram/);
  });

  it("усі помилки одразу, а не по одній", () => {
    const errors = validatePartyDraft("lead", createPartyDraft("", "u1"));
    expect(Object.keys(errors).sort()).toEqual(["firstName", "name", "phone", "source"]);
  });

  it("чернетка, яку пропустили, не впаде на перевірці запису", () => {
    const form = draftToLeadForm(draft({ phone: "", telegram: "@mas", email: "" }), "Дарʼя");
    expect(validateLeadCard(form, { leadId: null })).toBeNull();
  });

  it("замовник: контакт обовʼязковий, а пошта лише для рахунку", () => {
    expect(validatePartyDraft("customer", draft())).toEqual({});
    expect(validatePartyDraft("customer", draft({ firstName: "" })).firstName).toBe("Вкажіть імʼя контакту.");
    expect(validatePartyDraft("customer", draft({ email: "" })).email).toBeTruthy();
    expect(validatePartyDraft("customer", draft({ email: "", paymentType: "cash" })).email).toBeUndefined();
  });
});

describe("перетворення на форми", () => {
  it("контакт замовника: імʼя й прізвище в одному рядку", () => {
    const form = draftToCustomerForm(draft({ lastName: " Коваль " }), "Дарʼя");
    expect(form.contacts[0]).toMatchObject({ name: "Людмила Коваль", phone: "+380966960056", email: "lyuda@mas.ua" });
    expect(form.manager).toBe("Дарʼя");
    expect(form.managerId).toBe("u1");
  });

  it("рекомендувач не їде в базу, якщо джерело змінили на інше", () => {
    expect(draftToLeadForm(draft({ source: "Сайт", referredBy: "Олена" }), "").referredBy).toBe("");
    expect(draftToLeadForm(draft({ source: "Рекомендація", referredBy: "Олена" }), "").referredBy).toBe("Олена");
    expect(draftToCustomerForm(draft({ source: "Сайт", referredBy: "Олена" }), "").referredBy).toBe("");
  });

  it("обраний файл лого йде як файл, а не як посилання", () => {
    const file = new File(["x"], "logo.png", { type: "image/png" });
    expect(draftToLeadForm(draft({ logoFile: file }), "")).toMatchObject({ logoFile: file, logoUploadMode: "file" });
    expect(draftToCustomerForm(draft(), "")).toMatchObject({ logoFile: null, logoUploadMode: "url" });
  });
});

describe("findDuplicatePartyMessage", () => {
  beforeEach(() => {
    mocks.listCustomersBySearch.mockReset().mockResolvedValue([]);
    mocks.listLeadsBySearch.mockReset().mockResolvedValue([]);
  });

  it("нікого немає — можна створювати", async () => {
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds")).toBeNull();
  });

  it("каже, ким компанія вже є і хто нею займається", async () => {
    mocks.listLeadsBySearch.mockResolvedValue([{ company_name: "MAS Seeds", legal_name: null, manager: "Дарʼя" }]);
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds")).toBe("Схожа компанія вже є в CRM як лід. Менеджер: Дарʼя.");
    mocks.listCustomersBySearch.mockResolvedValue([{ name: "Інша", legal_name: "MAS Seeds", manager: null }]);
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds")).toBe("Схожа компанія вже є в CRM як замовник.");
  });

  it("перейменування: сам лід собі не дубль, а інший лід — дубль", async () => {
    mocks.listLeadsBySearch.mockResolvedValue([{ id: "l1", company_name: "MAS Seeds", legal_name: null, manager: null }]);
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds", { excludeLeadId: "l1" })).toBeNull();
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds", { excludeLeadId: "l2" })).toContain("як лід");
  });

  it("скорочений підпис менеджера не дає подвійної крапки", async () => {
    mocks.listLeadsBySearch.mockResolvedValue([{ company_name: "MAS Seeds", legal_name: null, manager: "Іван С." }]);
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds")).toBe("Схожа компанія вже є в CRM як лід. Менеджер: Іван С.");
  });

  it("пошук упав — створення не блокуємо", async () => {
    mocks.listCustomersBySearch.mockRejectedValue(new Error("offline"));
    expect(await findDuplicatePartyMessage("t1", "MAS Seeds")).toBeNull();
  });
});

describe("classifyPartyDuplicates", () => {
  const row = (name: string, manager: string | null = null, legalName: string | null = null) => ({ id: name, name, legalName, manager });

  it("та сама назва забороняє, навіть з іншим регістром, лапками й правовою формою", () => {
    expect(classifyPartyDuplicates("вектор", [row('ТОВ "Вектор"', "Іван С.")], []).exact).toBe("Така назва вже є в CRM як замовник. Менеджер: Іван С.");
    expect(classifyPartyDuplicates("MAS Seeds", [], [row("masseeds")]).exact).toBe("Така назва вже є в CRM як лід.");
    expect(classifyPartyDuplicates("Вектор", [row("Інша", null, "ТОВ Вектор")], []).exact).toContain("замовник");
  });

  it("інші літери не забороняють, а показують", () => {
    for (const [query, existing] of [["Fantom", "Фантом"], ["Kyivstar", "Київстар"], ["KMZ", "KMZ Industries - КМЗ"]]) {
      const result = classifyPartyDuplicates(query, [row(existing)], []);
      expect(result.exact).toBeNull();
      expect(result.similar.map((match) => match.name)).toEqual([existing]);
    }
  });

  it("чуже мовчить", () => {
    expect(classifyPartyDuplicates("Вектор", [row("Нова Земля")], [row("EDS")])).toEqual({ exact: null, similar: [] });
  });
});
