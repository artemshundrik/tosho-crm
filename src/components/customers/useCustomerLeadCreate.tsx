import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import { CustomerDialog, type CustomerFormState } from "./CustomerDialog";
import { LeadDialog, type LeadFormState } from "./LeadDialog";
import { OWNERSHIP_OPTIONS, VAT_OPTIONS } from "@/features/quotes/quotes-page/config";

type MemberOption = {
  id: string;
  label: string;
  avatarUrl?: string | null;
};

export type CreatedCustomerLead = {
  id: string;
  entityType: "customer" | "lead";
  name: string;
  legalName: string | null;
  logoUrl: string | null;
};

type UseCustomerLeadCreateOptions = {
  teamId?: string | null;
  defaultManagerLabel?: string;
  teamMembers?: MemberOption[];
  onCreated: (entity: CreatedCustomerLead) => void;
  resolveErrorMessage?: (error: unknown, fallback: string) => string;
  customerDialogTitle?: string;
  customerDialogDescription?: string;
  customerSubmitLabel?: string;
  leadDialogTitle?: string;
  leadDialogDescription?: string;
  leadSubmitLabel?: string;
};

const defaultResolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const createInitialCustomerForm = (prefillName: string, defaultManagerLabel: string): CustomerFormState => ({
  name: prefillName,
  legalName: "",
  manager: defaultManagerLabel,
  managerId: "",
  ownershipType: "",
  vatRate: "none",
  taxId: "",
  website: "",
  iban: "",
  logoUrl: "",
  contactName: "",
  contactPosition: "",
  contactPhone: "",
  contactEmail: "",
  contactBirthday: "",
  signatoryName: "",
  signatoryPosition: "",
  reminderDate: "",
  reminderTime: "",
  reminderComment: "",
  eventName: "",
  eventDate: "",
  eventComment: "",
  notes: "",
});

const createInitialLeadForm = (prefillName: string, defaultManagerLabel: string): LeadFormState => ({
  companyName: prefillName,
  legalName: "",
  firstName: "",
  lastName: "",
  email: "",
  phones: [""],
  source: "",
  website: "",
  logoUrl: "",
  manager: defaultManagerLabel,
  managerId: "",
  iban: "",
  signatoryName: "",
  signatoryPosition: "",
  reminderDate: "",
  reminderTime: "",
  reminderComment: "",
  eventName: "",
  eventDate: "",
  eventComment: "",
  notes: "",
});

export const useCustomerLeadCreate = ({
  teamId,
  defaultManagerLabel = "",
  teamMembers = [],
  onCreated,
  resolveErrorMessage = defaultResolveErrorMessage,
  customerDialogTitle = "Новий клієнт",
  customerDialogDescription = "Додайте дані клієнта.",
  customerSubmitLabel = "Створити клієнта",
  leadDialogTitle = "Новий лід",
  leadDialogDescription = "Додайте дані ліда.",
  leadSubmitLabel = "Створити ліда",
}: UseCustomerLeadCreateOptions) => {
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [customerSaving, setCustomerSaving] = React.useState(false);
  const [customerError, setCustomerError] = React.useState<string | null>(null);
  const [customerForm, setCustomerForm] = React.useState<CustomerFormState>(() =>
    createInitialCustomerForm("", defaultManagerLabel)
  );

  const [leadOpen, setLeadOpen] = React.useState(false);
  const [leadSaving, setLeadSaving] = React.useState(false);
  const [leadError, setLeadError] = React.useState<string | null>(null);
  const [leadForm, setLeadForm] = React.useState<LeadFormState>(() => createInitialLeadForm("", defaultManagerLabel));

  const resetCustomerForm = React.useCallback(
    (prefillName = "") => {
      setCustomerForm(createInitialCustomerForm(prefillName, defaultManagerLabel));
      setCustomerError(null);
    },
    [defaultManagerLabel]
  );

  const resetLeadForm = React.useCallback(
    (prefillName = "") => {
      setLeadForm(createInitialLeadForm(prefillName, defaultManagerLabel));
      setLeadError(null);
    },
    [defaultManagerLabel]
  );

  const openCustomerCreate = React.useCallback(
    (prefillName = "") => {
      resetCustomerForm(prefillName);
      setCustomerOpen(true);
    },
    [resetCustomerForm]
  );

  const openLeadCreate = React.useCallback(
    (prefillName = "") => {
      resetLeadForm(prefillName);
      setLeadOpen(true);
    },
    [resetLeadForm]
  );

  const handleCreateCustomer = React.useCallback(async () => {
    if (!teamId) {
      setCustomerError("Не вдалося визначити команду.");
      return;
    }
    if (!customerForm.name.trim()) {
      setCustomerError("Вкажіть назву компанії.");
      return;
    }

    setCustomerSaving(true);
    setCustomerError(null);

    const vatOption = VAT_OPTIONS.find((option) => option.value === customerForm.vatRate);
    const managerValue = customerForm.manager.trim();
    const selectedManagerLabel = customerForm.managerId
      ? teamMembers.find((member) => member.id === customerForm.managerId)?.label ?? managerValue
      : managerValue;
    const payload: Record<string, unknown> = {
      team_id: teamId,
      name: customerForm.name.trim(),
      legal_name: customerForm.legalName.trim() || null,
      manager: selectedManagerLabel || defaultManagerLabel || null,
      manager_user_id: customerForm.managerId || null,
      ownership_type: customerForm.ownershipType || null,
      vat_rate: vatOption?.rate ?? null,
      tax_id: customerForm.taxId.trim() || null,
      website: customerForm.website.trim() || null,
      iban: customerForm.iban.trim() || null,
      logo_url: customerForm.logoUrl.trim() || null,
      contact_name: customerForm.contactName.trim() || null,
      contact_position: customerForm.contactPosition || null,
      contact_phone: customerForm.contactPhone.trim() || null,
      contact_email: customerForm.contactEmail.trim() || null,
      contact_birthday: customerForm.contactBirthday || null,
      signatory_name: customerForm.signatoryName.trim() || null,
      signatory_position: customerForm.signatoryPosition.trim() || null,
      reminder_at:
        customerForm.reminderDate && customerForm.reminderTime
          ? `${customerForm.reminderDate}T${customerForm.reminderTime}:00`
          : null,
      reminder_comment: customerForm.reminderComment.trim() || null,
      event_name: customerForm.eventName.trim() || null,
      event_at: customerForm.eventDate || null,
      event_comment: customerForm.eventComment.trim() || null,
      notes: customerForm.notes.trim() || null,
    };

    try {
      const createWithPayload = async (insertPayload: Record<string, unknown>) => {
        return supabase
          .schema("tosho")
          .from("customers")
          .insert(insertPayload)
          .select("id,name,legal_name,logo_url")
          .single();
      };
      let { data, error } = await createWithPayload(payload);
      if (error) {
        const message = error.message ?? "";
        if (message.includes("column") && message.includes("manager_user_id")) {
          const fallbackPayload = { ...payload };
          delete fallbackPayload.manager_user_id;
          const fallbackRes = await createWithPayload(fallbackPayload);
          data = fallbackRes.data;
          error = fallbackRes.error;
        }
      }
      if (error) throw error;
      const created = data as { id: string; name?: string | null; legal_name?: string | null; logo_url?: string | null };
      onCreated({
        id: created.id,
        entityType: "customer",
        name: created.name?.trim() || created.legal_name?.trim() || customerForm.name.trim(),
        legalName: created.legal_name?.trim() || null,
        logoUrl: created.logo_url ?? null,
      });
      setCustomerOpen(false);
    } catch (error: unknown) {
      setCustomerError(resolveErrorMessage(error, "Не вдалося створити клієнта."));
    } finally {
      setCustomerSaving(false);
    }
  }, [customerForm, defaultManagerLabel, onCreated, resolveErrorMessage, teamId, teamMembers]);

  const handleCreateLead = React.useCallback(async () => {
    if (!teamId) {
      setLeadError("Не вдалося визначити команду.");
      return;
    }
    if (!leadForm.companyName.trim()) {
      setLeadError("Вкажіть назву компанії.");
      return;
    }
    if (!leadForm.firstName.trim()) {
      setLeadError("Вкажіть імʼя.");
      return;
    }
    if (!leadForm.source.trim()) {
      setLeadError("Вкажіть джерело.");
      return;
    }
    const phones = leadForm.phones.map((phone) => phone.trim()).filter(Boolean);
    if (phones.length === 0) {
      setLeadError("Вкажіть хоча б один номер телефону.");
      return;
    }

    setLeadSaving(true);
    setLeadError(null);

    const basePayload: Record<string, unknown> = {
      team_id: teamId,
      company_name: leadForm.companyName.trim(),
      legal_name: leadForm.legalName.trim() || null,
      logo_url: leadForm.logoUrl.trim() || null,
      first_name: leadForm.firstName.trim(),
      last_name: leadForm.lastName.trim() || null,
      email: leadForm.email.trim() || null,
      phone_numbers: phones,
      source: leadForm.source.trim(),
      website: leadForm.website.trim() || null,
      manager: (
        leadForm.managerId
          ? teamMembers.find((member) => member.id === leadForm.managerId)?.label ?? leadForm.manager.trim()
          : leadForm.manager.trim()
      ) || defaultManagerLabel || null,
      manager_user_id: leadForm.managerId || null,
      iban: leadForm.iban.trim() || null,
      signatory_name: leadForm.signatoryName.trim() || null,
      signatory_position: leadForm.signatoryPosition.trim() || null,
      reminder_at:
        leadForm.reminderDate && leadForm.reminderTime
          ? `${leadForm.reminderDate}T${leadForm.reminderTime}:00`
          : null,
      reminder_comment: leadForm.reminderComment.trim() || null,
      event_name: leadForm.eventName.trim() || null,
      event_at: leadForm.eventDate || null,
      event_comment: leadForm.eventComment.trim() || null,
      notes: leadForm.notes.trim() || null,
    };

    try {
      const createWithPayload = async (payload: Record<string, unknown>) => {
        return supabase
          .schema("tosho")
          .from("leads")
          .insert(payload)
          .select("id,company_name,legal_name,logo_url")
          .single();
      };

      let { data, error } = await createWithPayload(basePayload);
      if (error) {
        const message = error.message ?? "";
        if (message.includes("column") && message.includes("logo_url")) {
          const fallbackPayload = { ...basePayload };
          delete fallbackPayload.logo_url;
          const fallbackRes = await createWithPayload(fallbackPayload);
          data = fallbackRes.data;
          error = fallbackRes.error;
        } else if (message.includes("column") && message.includes("manager_user_id")) {
          const fallbackPayload = { ...basePayload };
          delete fallbackPayload.manager_user_id;
          const fallbackRes = await createWithPayload(fallbackPayload);
          data = fallbackRes.data;
          error = fallbackRes.error;
        }
      }
      if (error) throw error;

      const created = data as {
        id: string;
        company_name?: string | null;
        legal_name?: string | null;
        logo_url?: string | null;
      };
      onCreated({
        id: created.id,
        entityType: "lead",
        name: created.company_name?.trim() || created.legal_name?.trim() || leadForm.companyName.trim(),
        legalName: created.legal_name?.trim() || null,
        logoUrl: created.logo_url ?? null,
      });
      setLeadOpen(false);
    } catch (error: unknown) {
      const message = resolveErrorMessage(error, "Не вдалося створити ліда.");
      if (message.includes("relation") && message.includes("leads")) {
        setLeadError("Таблиця lead ще не створена. Запустіть SQL-скрипт scripts/leads-schema.sql.");
      } else {
        setLeadError(message);
      }
    } finally {
      setLeadSaving(false);
    }
  }, [defaultManagerLabel, leadForm, onCreated, resolveErrorMessage, teamId, teamMembers]);

  const dialogs = (
    <>
      <CustomerDialog
        open={customerOpen}
        onOpenChange={(open) => {
          setCustomerOpen(open);
          if (!open) resetCustomerForm();
        }}
        form={customerForm}
        setForm={setCustomerForm}
        ownershipOptions={OWNERSHIP_OPTIONS}
        vatOptions={VAT_OPTIONS}
        teamMembers={teamMembers}
        saving={customerSaving}
        error={customerError}
        title={customerDialogTitle}
        description={customerDialogDescription}
        submitLabel={customerSubmitLabel}
        onSubmit={() => void handleCreateCustomer()}
      />
      <LeadDialog
        open={leadOpen}
        onOpenChange={(open) => {
          setLeadOpen(open);
          if (!open) resetLeadForm();
        }}
        form={leadForm}
        setForm={setLeadForm}
        teamMembers={teamMembers}
        saving={leadSaving}
        error={leadError}
        title={leadDialogTitle}
        description={leadDialogDescription}
        submitLabel={leadSubmitLabel}
        onSubmit={() => void handleCreateLead()}
      />
    </>
  );

  return {
    openCustomerCreate,
    openLeadCreate,
    dialogs,
  };
};
