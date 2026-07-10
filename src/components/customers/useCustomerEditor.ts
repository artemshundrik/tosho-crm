import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { OWNERSHIP_OPTIONS, VAT_OPTIONS } from "@/features/quotes/quotes-page/config";
import type { CustomerContact, CustomerDialogProps, CustomerFormState } from "./CustomerDialog";
import {
  createEmptyCustomerLegalEntity,
  getPrimaryCustomerLegalEntity,
  parseCustomerLegalEntities,
  serializeCustomerLegalEntities,
} from "@/lib/customerLegalEntities";
import {
  getCustomerLogoImportErrorMessage,
  ingestCustomerLogoFromFile,
  ingestCustomerLogoFromUrl,
  normalizeCustomerLogoUrl,
  removeManagedCustomerLogoByUrl,
} from "@/lib/customerLogo";
import {
  buildReminderAtIso,
  getLocalReminderDateInputValue,
  getLocalReminderTimeInputValue,
} from "@/lib/reminderDateTime";
import { parseCustomerDeliveryPoints, serializeCustomerDeliveryPoints } from "@/lib/customerDeliveryPoints";
import { normalizeTelegramUsername } from "@/lib/telegramContact";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";

type CustomerRecord = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  payment_type?: string | null;
  source?: string | null;
  legal_name?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  ownership_type?: string | null;
  vat_rate?: number | null;
  tax_id?: string | null;
  website?: string | null;
  iban?: string | null;
  logo_url?: string | null;
  legal_entities?: unknown;
  contact_name?: string | null;
  contact_position?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_birthday?: string | null;
  contacts?: CustomerContact[] | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
  accountant_name?: string | null;
  accountant_email?: string | null;
  accountant_edrpou?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
  delivery_points?: unknown;
};

const CUSTOMER_COLUMNS = [
  "id",
  "team_id",
  "name",
  "payment_type",
  "source",
  "legal_name",
  "manager",
  "manager_user_id",
  "ownership_type",
  "vat_rate",
  "tax_id",
  "website",
  "iban",
  "logo_url",
  "legal_entities",
  "contact_name",
  "contact_position",
  "contact_phone",
  "contact_email",
  "contact_birthday",
  "contacts",
  "signatory_name",
  "signatory_position",
  "accountant_name",
  "accountant_email",
  "accountant_edrpou",
  "reminder_at",
  "reminder_comment",
  "event_name",
  "event_at",
  "event_comment",
  "notes",
  "delivery_points",
].join(",");

const EMPTY_CONTACT: CustomerContact = {
  name: "",
  position: "",
  phone: "",
  email: "",
  birthday: "",
  telegram: "",
};

const buildEmptyForm = (): CustomerFormState => ({
  name: "",
  paymentType: "invoice",
  source: "",
  manager: "",
  managerId: "",
  website: "",
  logoUrl: "",
  logoFile: null,
  logoUploadMode: "url",
  legalEntities: [createEmptyCustomerLegalEntity()],
  contacts: [{ ...EMPTY_CONTACT }],
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
});

const parseContactsFromRow = (row: CustomerRecord): CustomerContact[] => {
  const raw = Array.isArray(row.contacts) ? row.contacts : [];
  const normalized = raw
    .map((entry) => {
      const contact = typeof entry === "object" && entry ? (entry as Partial<CustomerContact>) : null;
      return {
        name: contact?.name?.trim() ?? "",
        position: contact?.position?.trim() ?? "",
        phone: contact?.phone?.trim() ?? "",
        email: contact?.email?.trim() ?? "",
        birthday: contact?.birthday?.trim() ?? "",
        telegram: contact?.telegram?.trim() ?? "",
      };
    })
    .filter((contact) => Object.values(contact).some(Boolean));
  if (normalized.length > 0) return normalized;
  const legacy = {
    name: row.contact_name?.trim() ?? "",
    position: row.contact_position?.trim() ?? "",
    phone: row.contact_phone?.trim() ?? "",
    email: row.contact_email?.trim() ?? "",
    birthday: row.contact_birthday?.trim() ?? "",
    telegram: "",
  };
  return Object.values(legacy).some(Boolean) ? [legacy] : [{ ...EMPTY_CONTACT }];
};

const normalizeBirthday = (value: string) => {
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

type TeamMemberOption = { id: string; label: string; avatarUrl?: string | null };

export type CustomerEditorSavedResult = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type UseCustomerEditorOptions = {
  onSaved?: (result: CustomerEditorSavedResult) => void;
};

export type CustomerEditorDialogProps = Pick<
  CustomerDialogProps,
  | "open"
  | "onOpenChange"
  | "form"
  | "setForm"
  | "ownershipOptions"
  | "vatOptions"
  | "teamMembers"
  | "saving"
  | "error"
  | "title"
  | "description"
  | "submitLabel"
  | "onSubmit"
>;

export const useCustomerEditor = (options?: UseCustomerEditorOptions) => {
  const { teamId, userId } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CustomerFormState>(buildEmptyForm);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberOption[]>([]);
  const previousLogoUrlRef = React.useRef<string | null>(null);
  const onSavedRef = React.useRef(options?.onSaved);

  React.useEffect(() => {
    onSavedRef.current = options?.onSaved;
  }, [options?.onSaved]);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId || cancelled) return;
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        if (cancelled) return;
        setTeamMembers(
          rows.map((member) => ({
            id: member.userId,
            label: member.label,
            avatarUrl: member.avatarDisplayUrl,
          }))
        );
      } catch {
        if (!cancelled) setTeamMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const openForCustomer = React.useCallback(
    async (customerId: string) => {
      if (!customerId) return;
      if (!teamId) {
        setError("Не вдалося визначити команду.");
        setOpen(true);
        return;
      }
      setEditingId(customerId);
      setForm(buildEmptyForm());
      setError(null);
      setLoading(true);
      setOpen(true);
      try {
        const { data, error: loadError } = await supabase
          .schema("tosho")
          .from("customers")
          .select(CUSTOMER_COLUMNS)
          .eq("team_id", teamId)
          .eq("id", customerId)
          .maybeSingle<CustomerRecord>();
        if (loadError) throw loadError;
        if (!data) {
          setError("Не вдалося завантажити дані замовника.");
          return;
        }
        previousLogoUrlRef.current = data.logo_url ?? null;
        const resolvedMember = data.manager_user_id
          ? teamMembers.find((member) => member.id === data.manager_user_id)
          : undefined;
        setForm({
          name: data.name ?? "",
          paymentType: data.payment_type === "cash" ? "cash" : "invoice",
          source: data.source ?? "",
          manager: resolvedMember?.label ?? (data.manager ?? ""),
          managerId: data.manager_user_id ?? "",
          website: data.website ?? "",
          logoUrl: normalizeCustomerLogoUrl(data.logo_url) ?? "",
          logoFile: null,
          logoUploadMode: "url",
          legalEntities: parseCustomerLegalEntities(data),
          contacts: parseContactsFromRow(data),
          deliveryPoints: parseCustomerDeliveryPoints(data.delivery_points),
          reminderDate: getLocalReminderDateInputValue(data.reminder_at),
          reminderTime: getLocalReminderTimeInputValue(data.reminder_at),
          reminderComment: data.reminder_comment ?? "",
          eventName: data.event_name ?? "",
          eventDate: data.event_at ? data.event_at.slice(0, 10) : "",
          eventComment: data.event_comment ?? "",
          notes: data.notes ?? "",
          accountantName: data.accountant_name ?? "",
          accountantEmail: data.accountant_email ?? "",
          accountantEdrpou: data.accountant_edrpou ?? "",
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Не вдалося завантажити дані замовника.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [teamId, teamMembers]
  );

  const submit = React.useCallback(async () => {
    if (!teamId || !editingId) {
      setError("Не вдалося визначити замовника для збереження.");
      return;
    }
    if (!form.name.trim()) {
      setError("Вкажіть назву компанії.");
      return;
    }
    const normalizedLogoUrl = normalizeCustomerLogoUrl(form.logoUrl);
    if (form.logoUploadMode === "url" && form.logoUrl.trim() && !normalizedLogoUrl) {
      setError("Вкажіть звичайний URL логотипа. `data:image/...;base64,...` більше не підтримується.");
      return;
    }

    setSaving(true);
    setError(null);

    const managerLabelRaw = form.manager.trim();
    const selectedMember = form.managerId
      ? teamMembers.find((member) => member.id === form.managerId)
      : teamMembers.find((member) => member.label === managerLabelRaw);
    const selectedManagerLabel = selectedMember?.label ?? managerLabelRaw;
    const selectedManagerUserId = selectedMember?.id ?? (form.managerId.trim() || null);

    const contacts = form.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        position: contact.position.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
        birthday: normalizeBirthday(contact.birthday),
        telegram: normalizeTelegramUsername(contact.telegram),
      }))
      .filter((contact) => Object.values(contact).some(Boolean));
    const primaryContact = contacts[0] ?? null;
    const legalEntities = serializeCustomerLegalEntities(form.legalEntities);
    const primaryLegalEntity = getPrimaryCustomerLegalEntity(form.legalEntities);

    let optimizedLogoUrl: string | null = null;
    try {
      if (form.logoUploadMode === "file" && form.logoFile) {
        const optimized = await ingestCustomerLogoFromFile({
          teamId,
          file: form.logoFile,
          entityType: "customer",
          entityId: editingId,
          preferredName: form.name.trim(),
        });
        optimizedLogoUrl = optimized.logoUrl;
      } else if (normalizedLogoUrl) {
        const optimized = await ingestCustomerLogoFromUrl({
          teamId,
          sourceUrl: normalizedLogoUrl,
          entityType: "customer",
          entityId: editingId,
          preferredName: form.name.trim(),
        });
        optimizedLogoUrl = optimized.logoUrl;
      } else {
        optimizedLogoUrl = null;
      }
    } catch (logoError: unknown) {
      setSaving(false);
      setError(getCustomerLogoImportErrorMessage(logoError, "логотип"));
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      payment_type: form.paymentType,
      source: form.source.trim() || null,
      legal_name: primaryLegalEntity?.legal_name ?? null,
      manager: selectedManagerLabel || null,
      manager_user_id: selectedManagerUserId,
      ownership_type: primaryLegalEntity?.ownership_type ?? null,
      vat_rate: primaryLegalEntity?.vat_rate ?? null,
      tax_id: primaryLegalEntity?.tax_id ?? null,
      website: form.website.trim() || null,
      iban: primaryLegalEntity?.iban ?? null,
      logo_url: optimizedLogoUrl,
      legal_entities: legalEntities.length > 0 ? legalEntities : null,
      contacts: contacts.length > 0 ? contacts : null,
      contact_name: primaryContact?.name || null,
      contact_position: primaryContact?.position || null,
      contact_phone: primaryContact?.phone || null,
      contact_email: primaryContact?.email || null,
      contact_birthday: primaryContact?.birthday || null,
      signatory_name: primaryLegalEntity?.signatory_name ?? null,
      signatory_position: primaryLegalEntity?.signatory_position ?? null,
      accountant_name: form.accountantName.trim() || null,
      accountant_email: form.accountantEmail.trim() || null,
      accountant_edrpou: form.accountantEdrpou.trim() || null,
      reminder_at: buildReminderAtIso(form.reminderDate, form.reminderTime),
      reminder_comment: form.reminderComment.trim() || null,
      event_name: form.eventName.trim() || null,
      event_at: form.eventDate || null,
      event_comment: form.eventComment.trim() || null,
      notes: form.notes.trim() || null,
      delivery_points: serializeCustomerDeliveryPoints(form.deliveryPoints),
    };

    try {
      const { error: updateError } = await supabase
        .schema("tosho")
        .from("customers")
        .update(payload)
        .eq("id", editingId)
        .eq("team_id", teamId);
      if (updateError) throw updateError;

      const previousLogoUrl = previousLogoUrlRef.current;
      if (previousLogoUrl && previousLogoUrl !== optimizedLogoUrl) {
        void removeManagedCustomerLogoByUrl(previousLogoUrl);
      }
      previousLogoUrlRef.current = optimizedLogoUrl;

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      }

      onSavedRef.current?.({
        id: editingId,
        name: form.name.trim(),
        logoUrl: optimizedLogoUrl,
      });
      setOpen(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message ? err.message : "Не вдалося зберегти замовника.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [editingId, form, teamId, teamMembers]);

  const editorProps: CustomerEditorDialogProps = {
    open,
    onOpenChange: setOpen,
    form,
    setForm,
    ownershipOptions: OWNERSHIP_OPTIONS,
    vatOptions: VAT_OPTIONS,
    teamMembers,
    saving: saving || loading,
    error,
    title: "Редагувати замовника",
    description: "Оновіть дані замовника — зміни одразу застосуються в інших картках.",
    submitLabel: "Зберегти",
    onSubmit: () => void submit(),
  };

  return {
    openForCustomer,
    isOpen: open,
    closeEditor: React.useCallback(() => setOpen(false), []),
    editorProps,
    saving,
    loading,
    error,
  };
};
