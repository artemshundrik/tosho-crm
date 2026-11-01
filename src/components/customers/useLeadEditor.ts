import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { OWNERSHIP_OPTIONS } from "@/features/quotes/quotes-page/config";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import type { CustomerLinkedItem } from "./CustomerDialog";
import type { LeadDialogProps, LeadFormState } from "./LeadDialog";
import { buildLeadFormFromRow, createEmptyLeadForm } from "./leadRecord";
import { loadLeadRow } from "./leadCardLoad";
import { saveLeadCard, validateLeadCard, type PartyPreviousState } from "./partyCardSave";
import { loadPartyLinkedRecords } from "./partyLinkedRecords";

/**
 * Повна картка ліда поза сторінкою «Замовники» (REQ-348): та сама форма, той
 * самий запис і те саме переведення в замовника (`saveLeadCard`).
 */

type TeamMemberOption = { id: string; label: string; avatarUrl?: string | null };

export type LeadEditorSavedResult = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Лід став замовником: старого ліда вже немає, далі живе цей замовник. */
  convertedCustomerId: string | null;
};

export type LeadEditorDialogProps = Pick<
  LeadDialogProps,
  | "open"
  | "onOpenChange"
  | "teamId"
  | "duplicateHintExcludeId"
  | "form"
  | "setForm"
  | "ownershipOptions"
  | "teamMembers"
  | "saving"
  | "error"
  | "title"
  | "submitLabel"
  | "secondarySubmitLabel"
  | "onSecondarySubmit"
  | "onSubmit"
  | "calculations"
  | "orders"
  | "designTasks"
  | "linkedLoading"
  | "onOpenCalculation"
  | "onOpenOrder"
  | "onOpenDesignTask"
>;

type LinkedState = {
  calculations: CustomerLinkedItem[];
  orders: CustomerLinkedItem[];
  designTasks: CustomerLinkedItem[];
};

const EMPTY_LINKED: LinkedState = { calculations: [], orders: [], designTasks: [] };

export const useLeadEditor = (options?: { onSaved?: (result: LeadEditorSavedResult) => void }) => {
  const { teamId, userId } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<LeadFormState>(() => createEmptyLeadForm());
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberOption[]>([]);
  const [linked, setLinked] = React.useState<LinkedState>(EMPTY_LINKED);
  const [linkedLoading, setLinkedLoading] = React.useState(false);
  const previousRef = React.useRef<PartyPreviousState>(null);
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
        setTeamMembers(rows.map((member) => ({ id: member.userId, label: member.label, avatarUrl: member.avatarDisplayUrl })));
      } catch {
        if (!cancelled) setTeamMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const currentUserLabel = React.useMemo(
    () => teamMembers.find((member) => member.id === userId)?.label ?? "",
    [teamMembers, userId]
  );

  /** false — ліда немає (видалили або перевели в замовника). */
  const openForLead = React.useCallback(
    async (leadId: string): Promise<boolean> => {
      if (!leadId) return false;
      if (!teamId) {
        setError("Не вдалося визначити команду.");
        setOpen(true);
        return false;
      }
      const request = ++requestRef.current;
      setEditingId(leadId);
      setForm(createEmptyLeadForm());
      setError(null);
      setLinked(EMPTY_LINKED);
      setLoading(true);
      setOpen(true);
      try {
        const lead = await loadLeadRow(teamId, leadId);
        if (request !== requestRef.current) return true;
        if (!lead) {
          setError("Не вдалося завантажити дані ліда.");
          return false;
        }
        const resolvedMember = lead.manager_user_id
          ? teamMembers.find((member) => member.id === lead.manager_user_id)
          : undefined;
        const managerLabel = resolvedMember?.label ?? (lead.manager ?? "");
        previousRef.current = {
          logoUrl: lead.logo_url ?? null,
          managerUserId: lead.manager_user_id?.trim() || null,
          managerLabel,
          companyName: lead.company_name ?? null,
        };
        setForm(buildLeadFormFromRow(lead, managerLabel || currentUserLabel));
        setLoading(false);

        setLinkedLoading(true);
        try {
          const records = await loadPartyLinkedRecords({
            teamId,
            userId,
            target: { kind: "lead", names: [lead.company_name, lead.legal_name] },
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
        return true;
      } catch (err: unknown) {
        if (request === requestRef.current) {
          setError(err instanceof Error && err.message ? err.message : "Не вдалося завантажити дані ліда.");
        }
        return true;
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [currentUserLabel, teamId, teamMembers, userId]
  );

  const submit = React.useCallback(
    async (convertToCustomer = false) => {
      if (!teamId || !editingId) {
        setError("Не вдалося визначити ліда для збереження.");
        return;
      }
      const issue = validateLeadCard(form, { leadId: editingId, convertToCustomer });
      if (issue) {
        setError(issue);
        return;
      }
      setSaving(true);
      setError(null);

      const managerLabelRaw = form.manager.trim();
      const selectedMember = form.managerId
        ? teamMembers.find((member) => member.id === form.managerId)
        : teamMembers.find((member) => member.label === managerLabelRaw);

      try {
        const { logoUrl, convertedCustomerId } = await saveLeadCard({
          teamId,
          leadId: editingId,
          form,
          manager: {
            label: selectedMember?.label ?? managerLabelRaw,
            userId: selectedMember?.id ?? (form.managerId.trim() || null),
          },
          fallbackManagerLabel: currentUserLabel,
          previous: previousRef.current,
          actor: { userId: userId ?? null, name: currentUserLabel },
          convertToCustomer,
        });
        if (convertedCustomerId) toast.success("Ліда переведено в замовника.");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
        }
        onSavedRef.current?.({ id: editingId, name: form.companyName.trim(), logoUrl, convertedCustomerId });
        setOpen(false);
      } catch (err: unknown) {
        setError(err instanceof Error && err.message ? err.message : "Не вдалося зберегти ліда.");
      } finally {
        setSaving(false);
      }
    },
    [currentUserLabel, editingId, form, teamId, teamMembers, userId]
  );

  const openLinked = React.useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  const editorProps: LeadEditorDialogProps = {
    open,
    onOpenChange: setOpen,
    teamId,
    duplicateHintExcludeId: editingId,
    form,
    setForm,
    ownershipOptions: OWNERSHIP_OPTIONS,
    teamMembers,
    saving: saving || loading,
    error,
    title: "Редагувати ліда",
    submitLabel: "Зберегти",
    secondarySubmitLabel: "Зберегти і перевести в замовника",
    onSecondarySubmit: () => void submit(true),
    onSubmit: () => void submit(),
    calculations: linked.calculations,
    orders: linked.orders,
    designTasks: linked.designTasks,
    linkedLoading,
    onOpenCalculation: (id) => openLinked(`/orders/estimates/${id}`),
    onOpenOrder: (id) => openLinked(`/orders/production/${id}`),
    onOpenDesignTask: (id) => openLinked(`/design/${id}`),
  };

  return { openForLead, closeEditor: React.useCallback(() => setOpen(false), []), editorProps };
};
