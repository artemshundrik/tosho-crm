import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { OWNERSHIP_OPTIONS, VAT_OPTIONS } from "@/features/quotes/quotes-page/config";
import type { CustomerContact, CustomerDialogProps, CustomerFormState, CustomerLinkedItem } from "./CustomerDialog";
import { createEmptyCustomerLegalEntity, parseCustomerLegalEntities } from "@/lib/customerLegalEntities";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import { getLocalReminderDateInputValue, getLocalReminderTimeInputValue } from "@/lib/reminderDateTime";
import { parseCustomerDeliveryPoints } from "@/lib/customerDeliveryPoints";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import type { CustomerLtvEntry, RfmSegment } from "@/lib/customerLtv";
import { hasCustomerFieldErrors, validateCustomerForm } from "./customerValidation";
import { saveCustomerCard, type PartyPreviousState } from "./partyCardSave";
import { loadPartyLinkedRecords } from "./partyLinkedRecords";

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
  | "teamId"
  | "duplicateHintExcludeId"
  | "form"
  | "setForm"
  | "ownershipOptions"
  | "vatOptions"
  | "teamMembers"
  | "saving"
  | "error"
  | "fieldErrors"
  | "title"
  | "description"
  | "submitLabel"
  | "onSubmit"
  | "calculations"
  | "orders"
  | "designTasks"
  | "linkedLoading"
  | "onOpenCalculation"
  | "onOpenOrder"
  | "onOpenDesignTask"
  | "ltvEntry"
  | "ltvSegment"
>;

type LinkedState = {
  calculations: CustomerLinkedItem[];
  orders: CustomerLinkedItem[];
  designTasks: CustomerLinkedItem[];
  ltvEntry: CustomerLtvEntry | null;
  ltvSegment?: RfmSegment;
};

const EMPTY_LINKED: LinkedState = { calculations: [], orders: [], designTasks: [], ltvEntry: null };

/**
 * Повна картка замовника поза сторінкою «Замовники» — та сама форма, ті самі
 * правила збереження (`saveCustomerCard`) і ті самі зв'язані списки (REQ-348).
 *
 * Форма показується після ОДНОГО запиту (сам замовник); прорахунки, замовлення
 * й LTV доїжджають уже всередині відкритої картки.
 */
export const useCustomerEditor = (options?: UseCustomerEditorOptions) => {
  const { teamId, userId } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CustomerFormState>(buildEmptyForm);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberOption[]>([]);
  const [linked, setLinked] = React.useState<LinkedState>(EMPTY_LINKED);
  const [linkedLoading, setLinkedLoading] = React.useState(false);
  const previousRef = React.useRef<PartyPreviousState>(null);
  // Відповідь на старе відкриття не має перезаписати картку, відкриту пізніше.
  const requestRef = React.useRef(0);
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
      const request = ++requestRef.current;
      setEditingId(customerId);
      setForm(buildEmptyForm());
      setError(null);
      setSubmitAttempted(false);
      setLinked(EMPTY_LINKED);
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
        if (request !== requestRef.current) return;
        if (loadError) throw loadError;
        if (!data) {
          setError("Не вдалося завантажити дані замовника.");
          return;
        }
        const resolvedMember = data.manager_user_id
          ? teamMembers.find((member) => member.id === data.manager_user_id)
          : undefined;
        const managerLabel = resolvedMember?.label ?? (data.manager ?? "");
        previousRef.current = {
          logoUrl: data.logo_url ?? null,
          managerUserId: data.manager_user_id?.trim() || null,
          managerLabel,
        };
        setForm({
          name: data.name ?? "",
          paymentType: data.payment_type === "cash" ? "cash" : "invoice",
          source: data.source ?? "",
          manager: managerLabel,
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
        setLoading(false);

        setLinkedLoading(true);
        try {
          const records = await loadPartyLinkedRecords({
            teamId,
            userId,
            target: { kind: "customer", id: customerId, names: [data.name, data.legal_name] },
            onCalculations: (calculations) => {
              if (request === requestRef.current) setLinked((current) => ({ ...current, calculations }));
            },
          });
          if (request === requestRef.current) setLinked(records);
        } catch {
          if (request === requestRef.current) setLinked(EMPTY_LINKED);
        } finally {
          if (request === requestRef.current) setLinkedLoading(false);
        }
      } catch (err: unknown) {
        if (request !== requestRef.current) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Не вдалося завантажити дані замовника.";
        setError(message);
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [teamId, teamMembers, userId]
  );

  const fieldErrors = React.useMemo(() => validateCustomerForm(form, { isNew: false }), [form]);

  const submit = React.useCallback(async () => {
    if (!teamId || !editingId) {
      setError("Не вдалося визначити замовника для збереження.");
      return;
    }
    // Як на сторінці «Замовники»: усі проблеми форми видно одразу.
    setSubmitAttempted(true);
    if (hasCustomerFieldErrors(fieldErrors)) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);

    const managerLabelRaw = form.manager.trim();
    const selectedMember = form.managerId
      ? teamMembers.find((member) => member.id === form.managerId)
      : teamMembers.find((member) => member.label === managerLabelRaw);

    try {
      const { logoUrl } = await saveCustomerCard({
        teamId,
        customerId: editingId,
        form,
        manager: {
          label: selectedMember?.label ?? managerLabelRaw,
          userId: selectedMember?.id ?? (form.managerId.trim() || null),
        },
        fallbackManagerLabel: "",
        previous: previousRef.current,
        actor: { userId: userId ?? null, name: teamMembers.find((member) => member.id === userId)?.label ?? "" },
      });
      previousRef.current = previousRef.current ? { ...previousRef.current, logoUrl } : null;

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      }

      onSavedRef.current?.({
        id: editingId,
        name: form.name.trim(),
        logoUrl,
      });
      setOpen(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message ? err.message : "Не вдалося зберегти замовника.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [editingId, fieldErrors, form, teamId, teamMembers, userId]);

  const openLinked = React.useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  const editorProps: CustomerEditorDialogProps = {
    open,
    onOpenChange: setOpen,
    teamId,
    duplicateHintExcludeId: editingId,
    form,
    setForm,
    ownershipOptions: OWNERSHIP_OPTIONS,
    vatOptions: VAT_OPTIONS,
    teamMembers,
    saving: saving || loading,
    error,
    fieldErrors: submitAttempted ? fieldErrors : undefined,
    title: "Редагувати замовника",
    submitLabel: "Зберегти",
    onSubmit: () => void submit(),
    calculations: linked.calculations,
    orders: linked.orders,
    designTasks: linked.designTasks,
    linkedLoading,
    ltvEntry: linked.ltvEntry,
    ltvSegment: linked.ltvSegment,
    onOpenCalculation: (id) => openLinked(`/orders/estimates/${id}`),
    onOpenOrder: (id) => openLinked(`/orders/production/${id}`),
    onOpenDesignTask: (id) => openLinked(`/design/${id}`),
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
