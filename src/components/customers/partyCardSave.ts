import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import {
  getCustomerLogoImportErrorMessage,
  ingestCustomerLogoFromFile,
  ingestCustomerLogoFromUrl,
  normalizeCustomerLogoUrl,
  removeManagedCustomerLogoByUrl,
} from "@/lib/customerLogo";
import {
  createEmptyCustomerLegalEntity,
  getPrimaryCustomerLegalEntity,
  serializeCustomerLegalEntities,
} from "@/lib/customerLegalEntities";
import { serializeCustomerDeliveryPoints } from "@/lib/customerDeliveryPoints";
import { buildReminderAtIso } from "@/lib/reminderDateTime";
import { normalizeTelegramUsername } from "@/lib/telegramContact";
import { notifyCustomerLeadManagerAssigned } from "@/lib/workflowNotifications";
import type { TableInsert } from "@/lib/dbTables";
import type { CustomerFormState } from "./CustomerDialog";
import type { CustomerSection, CustomerSectionPatch } from "./partyFieldWrite";
import type { LeadFormState } from "./LeadDialog";
import { getLeadContactIssue } from "./leadContact";
import { isMissingReferredByColumn } from "./leadEntryHints";
import { getLeadConversionMissingFields } from "./leadRecord";

/**
 * Збереження картки замовника й ліда — те саме для сторінки «Замовники» і для
 * картки, що відкривається клацанням по замовнику деінде (REQ-348).
 *
 * Чому спільне: друга копія (useCustomerEditor) уже встигла розійтись зі
 * сторінкою — не перевіряла поля й мовчала, коли міняли менеджера. Тут лише
 * запис; хто менеджер і як його показати, вирішує той, хто викликає.
 */

export type PartyManagerChoice = { label: string; userId: string | null };

export type PartyPreviousState = {
  logoUrl: string | null;
  managerUserId: string | null;
  managerLabel: string;
  /** Для ліда: стара назва, щоб при переведенні підхопити його прорахунки. */
  companyName?: string | null;
} | null;

export type PartyActor = { userId: string | null; name: string };

export const normalizeCustomerBirthday = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dotted = trimmed.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/);
  if (!dotted) return trimmed;
  const [, day, month, year] = dotted;
  const normalizedDay = String(Number(day)).padStart(2, "0");
  const normalizedMonth = String(Number(month)).padStart(2, "0");
  return year ? `${year}-${normalizedMonth}-${normalizedDay}` : `${normalizedDay}.${normalizedMonth}`;
};

/** Лого з файлу чи посилання — у наше сховище; шапка картки кличе це напряму. */
export async function ingestLogo(params: {
  teamId: string;
  entityType: "customer" | "lead";
  entityId: string | null;
  preferredName: string;
  logoUrl: string;
  logoFile: File | null;
  logoUploadMode: "url" | "file";
}): Promise<string | null> {
  const normalizedLogoUrl = normalizeCustomerLogoUrl(params.logoUrl);
  try {
    if (params.logoUploadMode === "file" && params.logoFile) {
      const optimized = await ingestCustomerLogoFromFile({
        teamId: params.teamId,
        file: params.logoFile,
        entityType: params.entityType,
        entityId: params.entityId,
        preferredName: params.preferredName,
      });
      return optimized.logoUrl;
    }
    if (normalizedLogoUrl) {
      const optimized = await ingestCustomerLogoFromUrl({
        teamId: params.teamId,
        sourceUrl: normalizedLogoUrl,
        entityType: params.entityType,
        entityId: params.entityId,
        preferredName: params.preferredName,
      });
      return optimized.logoUrl;
    }
    return null;
  } catch (error: unknown) {
    throw new Error(getCustomerLogoImportErrorMessage(error, "логотип"), { cause: error });
  }
}

const managerChangedFromAnother = (previous: PartyPreviousState, manager: PartyManagerChoice) =>
  Boolean(manager.userId) &&
  (previous?.managerUserId
    ? previous.managerUserId !== manager.userId
    : Boolean(previous?.managerLabel && previous.managerLabel !== manager.label));

/** Новий менеджер замість іншого — йому сповіщення. Повна форма й шапка картки кличуть одне. */
export async function notifyCustomerManagerChange(input: {
  customerId: string;
  name: string;
  previous: PartyPreviousState;
  manager: PartyManagerChoice;
  actor: PartyActor;
}) {
  const { customerId, name, previous, manager, actor } = input;
  if (!managerChangedFromAnother(previous, manager)) return;
  try {
    await notifyCustomerLeadManagerAssigned({
      entityType: "customer",
      entityId: customerId,
      entityName: name,
      newManagerUserId: manager.userId,
      previousManagerLabel: previous?.managerLabel ?? "",
      actorUserId: actor.userId,
      actorName: actor.name,
    });
  } catch (notifyError) {
    console.warn("Failed to notify customer manager assignment", notifyError);
  }
}

/**
 * Колонки одного розділу картки: реквізити (масив юросіб + копія основної в
 * окремих колонках), контакти (масив + перший контакт у колонках) чи
 * доставка. Сторінка замовника пише розділ лише цими колонками — так правка
 * реквізитів не затирає нотаток, які колега тим часом змінив у панелі.
 */
export function customerSectionColumns(section: CustomerSection, form: CustomerFormState): CustomerSectionPatch {
  if (section === "requisites") {
    const legalEntities = serializeCustomerLegalEntities(form.legalEntities);
    const primary = getPrimaryCustomerLegalEntity(form.legalEntities);
    return {
      legal_entities: legalEntities.length > 0 ? legalEntities : null,
      legal_name: primary?.legal_name ?? null,
      ownership_type: primary?.ownership_type ?? null,
      vat_rate: primary?.vat_rate ?? null,
      tax_id: primary?.tax_id ?? null,
      iban: primary?.iban ?? null,
      signatory_name: primary?.signatory_name ?? null,
      signatory_position: primary?.signatory_position ?? null,
    };
  }
  if (section === "contacts") {
    const contacts = form.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        position: contact.position.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
        birthday: normalizeCustomerBirthday(contact.birthday),
        telegram: normalizeTelegramUsername(contact.telegram),
      }))
      .filter((contact) => Object.values(contact).some(Boolean));
    const primary = contacts[0] ?? null;
    return {
      contacts: contacts.length > 0 ? contacts : null,
      contact_name: primary?.name || null,
      contact_position: primary?.position || null,
      contact_phone: primary?.phone || null,
      contact_email: primary?.email || null,
      contact_birthday: primary?.birthday || null,
    };
  }
  return { delivery_points: serializeCustomerDeliveryPoints(form.deliveryPoints) };
}

export async function saveCustomerCard(input: {
  teamId: string;
  customerId: string | null;
  form: CustomerFormState;
  manager: PartyManagerChoice;
  /** Менеджер для НОВОЇ картки, якщо в формі не вибрано: поточний користувач. */
  fallbackManagerLabel: string;
  previous: PartyPreviousState;
  actor: PartyActor;
}): Promise<{ logoUrl: string | null }> {
  const { teamId, customerId, form, manager, fallbackManagerLabel, previous, actor } = input;

  const optimizedLogoUrl = await ingestLogo({
    teamId,
    entityType: "customer",
    entityId: customerId,
    preferredName: form.name.trim(),
    logoUrl: form.logoUrl,
    logoFile: form.logoFile,
    logoUploadMode: form.logoUploadMode,
  });

  const payload: TableInsert<"customers"> = {
    team_id: teamId,
    name: form.name.trim(),
    payment_type: form.paymentType,
    manager: customerId ? (manager.label || null) : (manager.label || fallbackManagerLabel || null),
    manager_user_id: manager.userId,
    website: form.website.trim() || null,
    source: form.source.trim() || null,
    logo_url: optimizedLogoUrl,
    ...customerSectionColumns("requisites", form),
    ...customerSectionColumns("contacts", form),
    ...customerSectionColumns("delivery", form),
    accountant_name: form.accountantName.trim() || null,
    accountant_email: form.accountantEmail.trim() || null,
    accountant_edrpou: form.accountantEdrpou.trim() || null,
    reminder_at: buildReminderAtIso(form.reminderDate, form.reminderTime),
    reminder_comment: form.reminderComment.trim() || null,
    event_name: form.eventName.trim() || null,
    event_at: form.eventDate || null,
    event_comment: form.eventComment.trim() || null,
    notes: form.notes.trim() || null,
  };

  // Стара схема без частини колонок: зберігаємо хоча б назву, а не падаємо.
  const removeOptionalFields = () => {
    const clone: Record<string, unknown> = { ...payload };
    for (const key of [
      "manager", "manager_user_id", "ownership_type", "vat_rate", "tax_id", "website", "iban", "logo_url",
      "legal_entities", "contacts", "contact_name", "contact_position", "contact_phone", "contact_email",
      "contact_birthday", "signatory_name", "signatory_position", "accountant_name", "accountant_email",
      "accountant_edrpou", "reminder_at", "reminder_comment", "event_name", "event_at", "event_comment",
      "notes", "delivery_points",
    ]) {
      delete clone[key];
    }
    return clone;
  };

  let managerFieldsPersisted = true;
  if (customerId) {
    const { error: updateError } = await supabase
      .schema("tosho")
      .from("customers")
      .update(payload)
      .eq("id", customerId)
      .eq("team_id", teamId);
    if (updateError) {
      if (!(updateError.message ?? "").includes("column")) throw updateError;
      managerFieldsPersisted = false;
      const { error: fallbackError } = await supabase
        .schema("tosho")
        .from("customers")
        .update(removeOptionalFields() as never)
        .eq("id", customerId)
        .eq("team_id", teamId);
      if (fallbackError) throw fallbackError;
    }
  } else {
    const { error: insertError } = await supabase.schema("tosho").from("customers").insert(payload as never);
    if (insertError) {
      if (!(insertError.message ?? "").includes("column")) throw insertError;
      const { error: fallbackError } = await supabase
        .schema("tosho")
        .from("customers")
        .insert({ team_id: teamId, name: payload.name, legal_name: payload.legal_name } as never);
      if (fallbackError) throw fallbackError;
    }
  }

  if (customerId && previous?.logoUrl && previous.logoUrl !== optimizedLogoUrl) {
    void removeManagedCustomerLogoByUrl(previous.logoUrl);
  }

  if (customerId && managerFieldsPersisted) {
    await notifyCustomerManagerChange({ customerId, name: form.name.trim(), previous, manager, actor });
  }

  return { logoUrl: optimizedLogoUrl };
}

/** Перевірка ліда перед записом. Повертає текст помилки або null. */
export function validateLeadCard(
  form: LeadFormState,
  options: { leadId: string | null; convertToCustomer?: boolean }
): string | null {
  if (!form.companyName.trim()) return "Вкажіть назву компанії.";
  if (!form.firstName.trim()) return "Вкажіть імʼя.";
  if (!form.source.trim()) return "Вкажіть джерело.";
  if (form.logoUploadMode === "url" && form.logoUrl.trim() && !normalizeCustomerLogoUrl(form.logoUrl)) {
    return "Вкажіть звичайний URL логотипа. `data:image/...;base64,...` більше не підтримується.";
  }
  const phones = form.phones.map((phone) => phone.trim()).filter(Boolean);
  /**
   * Телефон АБО Telegram (REQ-298) — правило спільне з формою й зі швидким
   * створенням із прорахунку. Для переведення в замовника номер і далі
   * обовʼязковий: це стереже getLeadConversionMissingFields нижче.
   */
  const contactIssue = getLeadContactIssue({ phones, telegram: form.telegram });
  if (contactIssue) return contactIssue;
  if (options.convertToCustomer && !options.leadId) {
    return "Спочатку створіть ліда, потім переведіть його в замовника.";
  }
  if (options.convertToCustomer) {
    const missing = getLeadConversionMissingFields(form, phones);
    if (missing.length > 0) return `Щоб перевести ліда в замовника, заповніть: ${missing.join(", ")}.`;
  }
  return null;
}

/**
 * Запис ліда, а з `convertToCustomer` — ще й переведення в замовника: новий
 * замовник, прив'язка прорахунків ліда до нього й видалення ліда.
 * Перевірку (`validateLeadCard`) робить той, хто викликає, — до цього кроку.
 */
export async function saveLeadCard(input: {
  teamId: string;
  leadId: string | null;
  form: LeadFormState;
  manager: PartyManagerChoice;
  fallbackManagerLabel: string;
  previous: PartyPreviousState;
  actor: PartyActor;
  convertToCustomer?: boolean;
}): Promise<{ logoUrl: string | null; convertedCustomerId: string | null; createdLeadId: string | null }> {
  const { teamId, leadId, form, manager, fallbackManagerLabel, previous, actor, convertToCustomer } = input;
  let createdLeadId: string | null = null;
  const phones = form.phones.map((phone) => phone.trim()).filter(Boolean);
  const leadTelegram = normalizeTelegramUsername(form.telegram);
  const managerLabel = manager.label || fallbackManagerLabel || null;

  const optimizedLogoUrl = await ingestLogo({
    teamId,
    entityType: "lead",
    entityId: leadId,
    preferredName: form.companyName.trim(),
    logoUrl: form.logoUrl,
    logoFile: form.logoFile,
    logoUploadMode: form.logoUploadMode,
  });

  const payload: TableInsert<"leads"> = {
    team_id: teamId,
    company_name: form.companyName.trim(),
    payment_type: form.paymentType,
    legal_name: form.legalName.trim() || null,
    ownership_type: form.ownershipType || null,
    tax_id: form.taxId.trim() || null,
    legal_address: form.legalAddress.trim() || null,
    logo_url: optimizedLogoUrl,
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim() || null,
    email: form.email.trim() || null,
    phone_numbers: phones,
    telegram: leadTelegram || null,
    source: form.source.trim(),
    website: form.website.trim() || null,
    manager: managerLabel,
    manager_user_id: manager.userId,
    iban: form.iban.trim() || null,
    signatory_name: form.signatoryName.trim() || null,
    signatory_position: form.signatoryPosition.trim() || null,
    reminder_at: buildReminderAtIso(form.reminderDate, form.reminderTime),
    reminder_comment: form.reminderComment.trim() || null,
    event_name: form.eventName.trim() || null,
    event_at: form.eventDate || null,
    event_comment: form.eventComment.trim() || null,
    notes: form.notes.trim() || null,
    delivery_points: serializeCustomerDeliveryPoints(form.deliveryPoints),
    referred_by: form.referredBy?.trim() || null,
  } as TableInsert<"leads">;

  // update з .select("id"): нуль рядків = ліда вже немає (перевели в іншій
  // вкладці чи вікні). Без цієї перевірки переведення створювало другого
  // замовника — уже без прорахунків.
  const writeLead = async (body: TableInsert<"leads">) => {
    if (!leadId) {
      // Id потрібен тому, хто створює ліда не зі сторінки «Замовники»: заявка
      // з Instagram одразу прив'язується до своєї картки.
      const created = await supabase.schema("tosho").from("leads").insert(body as never).select("id").single();
      if (!created.error) createdLeadId = (created.data as { id: string }).id;
      return created;
    }
    const result = await supabase.schema("tosho").from("leads").update(body).eq("id", leadId).eq("team_id", teamId).select("id");
    if (!result.error && (result.data?.length ?? 0) === 0) {
      throw new Error(convertToCustomer ? "Ліда вже переведено або видалено — оновіть список." : "Ліда вже немає — оновіть список.");
    }
    return result;
  };

  let managerFieldsPersisted = true;
  let { error: writeError } = await writeLead(payload);
  if (writeError && isMissingReferredByColumn(writeError)) {
    delete (payload as Record<string, unknown>).referred_by;
    ({ error: writeError } = await writeLead(payload));
  }
  if (writeError) {
    const message = writeError.message ?? "";
    if (message.includes("column") && message.includes("logo_url")) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.logo_url;
      const { error: fallbackError } = await writeLead(fallbackPayload);
      if (fallbackError) throw fallbackError;
    } else if (message.includes("column") && message.includes("manager_user_id")) {
      managerFieldsPersisted = false;
      const fallbackPayload = { ...payload };
      delete fallbackPayload.manager_user_id;
      const { error: fallbackError } = await writeLead(fallbackPayload);
      if (fallbackError) throw fallbackError;
    } else {
      throw writeError;
    }
  }

  if (leadId && previous?.logoUrl && previous.logoUrl !== optimizedLogoUrl) {
    void removeManagedCustomerLogoByUrl(previous.logoUrl);
  }

  if (leadId && !convertToCustomer && managerFieldsPersisted && managerChangedFromAnother(previous, manager)) {
    try {
      await notifyCustomerLeadManagerAssigned({
        entityType: "lead",
        entityId: leadId,
        entityName: form.companyName.trim(),
        newManagerUserId: manager.userId,
        previousManagerLabel: previous?.managerLabel ?? "",
        actorUserId: actor.userId,
        actorName: actor.name,
      });
    } catch (notifyError) {
      console.warn("Failed to notify lead manager assignment", notifyError);
    }
  }

  if (!convertToCustomer || !leadId) return { logoUrl: optimizedLogoUrl, convertedCustomerId: null, createdLeadId };

  const contactName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(" ");
  const conversionLegalEntity = {
    ...createEmptyCustomerLegalEntity(),
    ownershipType: form.ownershipType.trim(),
    legalName: form.legalName.trim() || form.companyName.trim(),
    taxId: form.taxId.trim(),
    legalAddress: form.legalAddress.trim(),
    iban: form.iban.trim(),
    signatoryName: form.signatoryName.trim(),
    signatoryPosition: form.signatoryPosition.trim(),
  };
  const legalEntities = serializeCustomerLegalEntities([conversionLegalEntity]);
  const primaryLegalEntity = legalEntities[0] ?? null;
  const contacts = [
    {
      name: contactName || form.companyName.trim(),
      position: form.signatoryPosition.trim(),
      phone: phones[0] ?? "",
      email: form.email.trim(),
      birthday: "",
      telegram: leadTelegram,
    },
  ];
  const customerPayload: Record<string, unknown> = {
    team_id: teamId,
    name: form.companyName.trim(),
    // Спосіб оплати й джерело їдуть із ліда (REQ-329). Без них лід на
    // «Готівці» ставав замовником «Рахунок», а замовника без джерела
    // форма потім не давала зберегти навіть після правки однієї літери.
    payment_type: form.paymentType,
    source: form.source.trim() || null,
    referred_by: form.referredBy?.trim() || null,
    legal_name: primaryLegalEntity?.legal_name ?? null,
    manager: managerLabel,
    manager_user_id: manager.userId,
    ownership_type: primaryLegalEntity?.ownership_type ?? null,
    vat_rate: primaryLegalEntity?.vat_rate ?? null,
    tax_id: primaryLegalEntity?.tax_id ?? null,
    website: form.website.trim() || null,
    iban: primaryLegalEntity?.iban ?? null,
    logo_url: optimizedLogoUrl,
    legal_entities: legalEntities.length > 0 ? legalEntities : null,
    contacts,
    contact_name: contacts[0]?.name || null,
    contact_position: contacts[0]?.position || null,
    contact_phone: contacts[0]?.phone || null,
    contact_email: contacts[0]?.email || null,
    contact_birthday: null,
    signatory_name: primaryLegalEntity?.signatory_name ?? null,
    signatory_position: primaryLegalEntity?.signatory_position ?? null,
    reminder_at: buildReminderAtIso(form.reminderDate, form.reminderTime),
    reminder_comment: form.reminderComment.trim() || null,
    event_name: form.eventName.trim() || null,
    event_at: form.eventDate || null,
    event_comment: form.eventComment.trim() || null,
    notes: form.notes.trim() || null,
    delivery_points: serializeCustomerDeliveryPoints(form.deliveryPoints),
  };

  const insertCustomer = () =>
    supabase.schema("tosho").from("customers").insert(customerPayload as never).select("id").single();
  let { data: insertedCustomer, error: customerInsertError } = await insertCustomer();
  if (customerInsertError && isMissingReferredByColumn(customerInsertError)) {
    delete customerPayload.referred_by;
    ({ data: insertedCustomer, error: customerInsertError } = await insertCustomer());
  }
  if (customerInsertError) throw customerInsertError;

  // Лід тримається в прорахунку лише текстом `customer_name` (REQ-193), тож
  // без цього кроку прорахунки ліда лишались «лідовими» назавжди: чекліст
  // «Створити замовлення» не бачив ні переведення, ні реквізитів замовника
  // (REQ-338). Збіг точний, як у тригері перейменування: нечіткий забрав би
  // чужі прорахунки. Стара назва — на випадок, якщо тригер не встиг.
  const convertedCustomerId = (insertedCustomer as { id?: string } | null)?.id ?? null;
  const leadNames = Array.from(
    new Set([form.companyName.trim(), previous?.companyName ?? ""].filter(Boolean))
  );
  if (convertedCustomerId && leadNames.length > 0) {
    const { error: quotesLinkError } = await supabase
      .schema("tosho")
      .from("quotes")
      .update({ customer_id: convertedCustomerId, customer_name: form.companyName.trim() } as never)
      .eq("team_id", teamId)
      .is("customer_id", null)
      .in("customer_name", leadNames);
    // Замовника вже створено: кинути тут — лишити і ліда, і дубль-замовника.
    if (quotesLinkError) {
      console.warn("Failed to link lead quotes to converted customer", quotesLinkError);
      toast.error("Замовника створено, але прорахунки ліда не привʼязались — напишіть розробнику.");
    }
  }

  const { error: leadDeleteError } = await supabase
    .schema("tosho")
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("team_id", teamId);
  if (leadDeleteError) throw leadDeleteError;

  return { logoUrl: optimizedLogoUrl, convertedCustomerId, createdLeadId };
}
