import { createEmptyCustomerLegalEntity } from "@/lib/customerLegalEntities";
import { areCompanyNamesEquivalent } from "@/lib/companyNameSearch";
import { normalizeTelegramUsername } from "@/lib/telegramContact";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { validateCustomerForm } from "./customerValidation";
import { getLeadContactIssue } from "./leadContact";
import { createEmptyLeadForm } from "./leadRecord";
import { saveCustomerCard, saveLeadCard, type PartyActor, type PartyManagerChoice } from "./partyCardSave";
import type { CustomerFormState, CustomerPaymentType, LeadFormState } from "./partyFormTypes";

/**
 * Створення ліда й замовника: одна коротка форма, а не вся картка. Людина
 * заводить сторону посеред іншої роботи, тому тут лише те, без чого її не
 * можна створити. Реквізити дозаповнюються потім у бічній панелі.
 *
 * Правила не свої: замовника перевіряє `validateCustomerForm`, а тест стереже,
 * що ліда не пропускаємо там, де його не пропустив би `validateLeadCard`.
 */

export type PartyKind = "customer" | "lead";

export type PartyCreateDraft = {
  name: string;
  paymentType: CustomerPaymentType;
  firstName: string;
  lastName: string;
  phone: string;
  telegram: string;
  email: string;
  source: string;
  referredBy: string;
  managerId: string;
  logoFile: File | null;
};

export type PartyCreateField = "name" | "firstName" | "phone" | "email" | "source";
export type PartyCreateErrors = Partial<Record<PartyCreateField, string>>;

/** Порядок, у якому поля стоять у вікні: курсор іде на перше з них. */
export const PARTY_CREATE_FIELD_ORDER: PartyCreateField[] = ["name", "firstName", "phone", "email", "source"];

export type CreatedCustomerLead = {
  id: string;
  entityType: PartyKind;
  name: string;
  legalName: string | null;
  logoUrl: string | null;
};

export const createPartyDraft = (name: string, managerId: string): PartyCreateDraft => ({
  name,
  paymentType: "invoice",
  firstName: "",
  lastName: "",
  phone: "",
  telegram: "",
  email: "",
  source: "",
  referredBy: "",
  managerId,
  logoFile: null,
});

/** Джерело «Рекомендація» змінили на інше — забутий рекомендувач не їде в базу. */
const referredByOf = (draft: PartyCreateDraft) => (draft.source === "Рекомендація" ? draft.referredBy : "");

export function draftToCustomerForm(draft: PartyCreateDraft, manager: string): CustomerFormState {
  return {
    name: draft.name,
    paymentType: draft.paymentType,
    source: draft.source,
    referredBy: referredByOf(draft),
    manager,
    managerId: draft.managerId,
    website: "",
    logoUrl: "",
    logoFile: draft.logoFile,
    logoUploadMode: draft.logoFile ? "file" : "url",
    legalEntities: [createEmptyCustomerLegalEntity()],
    contacts: [
      {
        name: [draft.firstName, draft.lastName].map((part) => part.trim()).filter(Boolean).join(" "),
        position: "",
        phone: draft.phone,
        email: draft.email,
        birthday: "",
        telegram: normalizeTelegramUsername(draft.telegram),
      },
    ],
    deliveryPoints: [],
    reminderDate: "",
    reminderTime: "",
    reminderComment: "",
    eventName: "",
    eventDate: "",
    eventComment: "",
    notes: "",
    accountantName: "",
    accountantEmail: "",
    accountantEdrpou: "",
  };
}

export function draftToLeadForm(draft: PartyCreateDraft, manager: string): LeadFormState {
  return {
    ...createEmptyLeadForm({ label: manager, id: draft.managerId }),
    companyName: draft.name,
    paymentType: draft.paymentType,
    firstName: draft.firstName,
    lastName: draft.lastName,
    phones: [draft.phone],
    telegram: draft.telegram,
    email: draft.email,
    source: draft.source,
    referredBy: referredByOf(draft),
    logoFile: draft.logoFile,
    logoUploadMode: draft.logoFile ? "file" : "url",
  };
}

/** Усі помилки одразу: людина бачить повний список, а не дізнається про них по черзі. */
export function validatePartyDraft(kind: PartyKind, draft: PartyCreateDraft): PartyCreateErrors {
  const errors: PartyCreateErrors = {};
  if (kind === "customer") {
    const form = validateCustomerForm(draftToCustomerForm(draft, ""), { isNew: true });
    if (form.name) errors.name = form.name;
    if (!draft.firstName.trim()) errors.firstName = "Вкажіть імʼя контакту.";
    if (form.contactPhone) errors.phone = form.contactPhone;
    if (form.contactEmail) errors.email = form.contactEmail;
    if (form.source) errors.source = form.source;
    return errors;
  }
  if (!draft.name.trim()) errors.name = "Вкажіть назву компанії.";
  if (!draft.firstName.trim()) errors.firstName = "Вкажіть імʼя.";
  const contactIssue = getLeadContactIssue({ phones: [draft.phone], telegram: draft.telegram });
  if (contactIssue) errors.phone = contactIssue;
  if (!draft.source.trim()) errors.source = "Вкажіть джерело.";
  return errors;
}

/**
 * Та сама компанія вже є серед лідів чи замовників — текст для людини, інакше
 * null. Пошук упав — не зупиняємо створення: підказка під назвою теж є.
 */
export async function findDuplicatePartyMessage(
  teamId: string,
  name: string,
  options?: { excludeLeadId?: string },
): Promise<string | null> {
  const trimmed = name.trim();
  try {
    const [customers, leads] = await Promise.all([
      listCustomersBySearch(teamId, trimmed),
      listLeadsBySearch(teamId, trimmed).catch(() => []),
    ]);
    const matches = (values: Array<string | null | undefined>) =>
      values.some((value) => areCompanyNamesEquivalent(value ?? "", trimmed));
    const customer = customers.find((row) => matches([row.name, row.legal_name]));
    const lead = leads.find(
      (row) => (!options?.excludeLeadId || row.id !== options.excludeLeadId) && matches([row.company_name, row.legal_name]),
    );
    if (!customer && !lead) return null;
    const label = customer ? "замовник" : "лід";
    // Підпис менеджера буває скорочений («Іван С.»): крапку ставить речення.
    const manager = (customer ? customer.manager : lead?.manager)?.trim().replace(/\.+$/, "");
    return `Схожа компанія вже є в CRM як ${label}${manager ? `. Менеджер: ${manager}` : ""}.`;
  } catch {
    return null;
  }
}

export async function createParty(input: {
  kind: PartyKind;
  teamId: string;
  draft: PartyCreateDraft;
  manager: PartyManagerChoice;
  fallbackManagerLabel: string;
  actor: PartyActor;
}): Promise<CreatedCustomerLead> {
  const { kind, teamId, draft, manager, fallbackManagerLabel, actor } = input;
  const name = draft.name.trim();
  const common = { teamId, manager, fallbackManagerLabel, previous: null, actor };
  if (kind === "customer") {
    const form = draftToCustomerForm(draft, manager.label);
    const { logoUrl, createdCustomerId } = await saveCustomerCard({ ...common, customerId: null, form });
    if (!createdCustomerId) throw new Error("Замовник не створився. Спробуйте ще раз.");
    return { id: createdCustomerId, entityType: "customer", name, legalName: null, logoUrl };
  }
  const form = draftToLeadForm(draft, manager.label);
  const { logoUrl, createdLeadId } = await saveLeadCard({ ...common, leadId: null, form });
  if (!createdLeadId) throw new Error("Лід не створився. Спробуйте ще раз.");
  return { id: createdLeadId, entityType: "lead", name, legalName: null, logoUrl };
}
