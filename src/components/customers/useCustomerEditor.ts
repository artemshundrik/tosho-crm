import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { OWNERSHIP_OPTIONS, VAT_OPTIONS } from "@/features/quotes/quotes-page/config";
import type { CustomerDialogProps, CustomerFormState, CustomerLinkedItem } from "./CustomerDialog";
import { buildEmptyForm, customerRowToForm, loadCustomerRow } from "./customerCardLoad";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import type { CustomerLtvEntry, RfmSegment } from "@/lib/customerLtv";
import { hasCustomerFieldErrors, validateCustomerForm } from "./customerValidation";
import { saveCustomerCard, type PartyPreviousState } from "./partyCardSave";
import { loadPartyLinkedRecords } from "./partyLinkedRecords";

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
        const { data, error: loadError } = await loadCustomerRow(teamId, customerId);
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
        setForm(customerRowToForm(data, managerLabel));
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
