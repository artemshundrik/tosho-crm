import type { CustomerFormState } from "./partyFormTypes";
import type { LeadFormState } from "./partyFormTypes";
import { getPrimaryCustomerLegalEntity } from "@/lib/customerLegalEntities";

/**
 * Чого бракує, щоб із замовником чи лідом можна було працювати: виставити
 * рахунок, підписати договір, відправити документи.
 *
 * ОДНЕ ПРАВИЛО НА ДВІ СУТНОСТІ. Раніше воно жило лише в переведенні ліда
 * (`getLeadConversionMissingFields`), а картка замовника про нього не знала.
 * Тепер і панель, і сторінка, і форма переведення рахують з одного місця:
 * інакше «готово 7 з 7» у панелі розійшлося б із тим, що спитає переведення.
 *
 * На «Готівці» пункт один — телефон (REQ-329): договору й рахунку на юрособу
 * там немає, а звʼязок і доставка потрібні.
 *
 * Читачі: leadRecord (переведення ліда), панелі замовника й ліда, сторінка
 * замовника, форма переведення.
 */

export type PartyReadinessKey =
  | "ownership"
  | "taxId"
  | "legalAddress"
  | "iban"
  | "signatory"
  | "phone"
  | "documentEmail";

export type PartyReadinessInput = {
  paymentType: "cash" | "invoice";
  ownershipType: string;
  taxId: string;
  legalAddress: string;
  iban: string;
  signatoryPosition: string;
  phones: string[];
  /** Пошта контакту або бухгалтера — що непорожнє. */
  documentEmail: string;
};

export type PartyReadinessItem = { key: PartyReadinessKey; label: string; done: boolean };
export type PartyReadiness = {
  items: PartyReadinessItem[];
  done: number;
  total: number;
  missing: PartyReadinessKey[];
};

const filled = (value: string | null | undefined) => Boolean(value?.trim());

export function getPartyReadiness(input: PartyReadinessInput): PartyReadiness {
  const fop = input.ownershipType === "fop";
  const phone: PartyReadinessItem = { key: "phone", label: "телефон", done: input.phones.some(filled) };
  const items: PartyReadinessItem[] =
    input.paymentType === "cash"
      ? [phone]
      : [
          { key: "ownership", label: "форма власності", done: filled(input.ownershipType) },
          { key: "taxId", label: fop ? "ІПН" : "ЄДРПОУ / ІПН", done: filled(input.taxId) },
          { key: "legalAddress", label: fop ? "прописка" : "юридична адреса", done: filled(input.legalAddress) },
          { key: "iban", label: "IBAN", done: filled(input.iban) },
          { key: "signatory", label: "посада підписанта", done: filled(input.signatoryPosition) },
          phone,
          { key: "documentEmail", label: "email", done: filled(input.documentEmail) },
        ];
  const missing = items.filter((item) => !item.done).map((item) => item.key);
  return { items, done: items.length - missing.length, total: items.length, missing };
}

export function customerReadinessInput(form: CustomerFormState): PartyReadinessInput {
  const entity = getPrimaryCustomerLegalEntity(form.legalEntities ?? []);
  const contacts = form.contacts ?? [];
  return {
    paymentType: form.paymentType === "cash" ? "cash" : "invoice",
    ownershipType: entity?.ownership_type ?? "",
    taxId: entity?.tax_id ?? "",
    legalAddress: entity?.legal_address ?? "",
    iban: entity?.iban ?? "",
    signatoryPosition: entity?.signatory_position ?? "",
    phones: contacts.map((contact) => contact.phone ?? "").filter(filled),
    documentEmail: [form.accountantEmail, contacts[0]?.email].find(filled)?.trim() ?? "",
  };
}

export function leadReadinessInput(form: LeadFormState, phones: string[]): PartyReadinessInput {
  return {
    paymentType: form.paymentType === "cash" ? "cash" : "invoice",
    ownershipType: form.ownershipType ?? "",
    taxId: form.taxId ?? "",
    legalAddress: form.legalAddress ?? "",
    iban: form.iban ?? "",
    signatoryPosition: form.signatoryPosition ?? "",
    phones,
    documentEmail: form.email ?? "",
  };
}
