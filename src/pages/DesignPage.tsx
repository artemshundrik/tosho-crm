import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Loader2, Palette, CheckCircle2, Paperclip, MoreVertical, Trash2, Plus, Building2, User, Calendar as CalendarIcon, Check, RefreshCw, PlayCircle, ShieldCheck, Hourglass, XCircle, Package } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { resolveWorkspaceId } from "@/lib/workspace";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import { notifyQuoteInitiatorOnDesignStatusChange } from "@/lib/workflowNotifications";
import {
  formatElapsedSeconds,
  getDesignTasksTimerSummaryMap,
  pauseDesignTaskTimer,
  type DesignTaskTimerSummary,
} from "@/lib/designTaskTimer";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ActiveHereCard } from "@/components/app/workspace-presence-widgets";
import { PageHeader } from "@/components/app/headers/PageHeader";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { KanbanBoard, KanbanCard, KanbanColumn } from "@/components/kanban";
import { QuoteDeadlineBadge } from "@/features/quotes/components/QuoteDeadlineBadge";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";
import { toast } from "sonner";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

type DesignTask = {
  id: string;
  quoteId: string;
  title: string | null;
  status: DesignStatus;
  assigneeUserId?: string | null;
  assignedAt?: string | null;
  metadata?: Record<string, unknown>;
  methodsCount?: number;
  hasFiles?: boolean;
  designDeadline?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  partyType?: "customer" | "lead" | null;
  productName?: string | null;
  productImageUrl?: string | null;
  productQtyLabel?: string | null;
  createdAt?: string | null;
};

type MembershipRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  access_role: string | null;
  job_role: string | null;
};
type DesignTaskActivityRow = {
  id: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  title: string | null;
  created_at: string;
};

type CustomerOption = {
  id: string;
  label: string;
};

type AssignmentFilter = "mine" | "all" | "unassigned";
type DesignViewMode = "kanban" | "timeline" | "assignee";

const isDesignerRole = (value?: string | null) => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "designer" || normalized === "дизайнер";
};

const isManagerRole = (accessRole?: string | null, jobRole?: string | null) => {
  const normalizedAccess = (accessRole ?? "").trim().toLowerCase();
  const normalizedJob = (jobRole ?? "").trim().toLowerCase();
  return (
    normalizedAccess === "owner" ||
    normalizedAccess === "admin" ||
    normalizedJob === "manager" ||
    normalizedJob === "менеджер"
  );
};

const isUuid = (value?: string | null) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type DesignStatus =
  | "new"
  | "changes"
  | "in_progress"
  | "pm_review"
  | "client_review"
  | "approved"
  | "cancelled";

const DESIGN_COLUMNS: { id: DesignStatus; label: string }[] = [
  { id: "new", label: "Новий" },
  { id: "changes", label: "Правки" },
  { id: "in_progress", label: "В роботі" },
  { id: "pm_review", label: "На перевірці" },
  { id: "client_review", label: "На погодженні" },
  { id: "approved", label: "Затверджено" },
  { id: "cancelled", label: "Скасовано" },
];
const DESIGN_STATUS_ICON_BY_STATUS = {
  new: Plus,
  changes: RefreshCw,
  in_progress: PlayCircle,
  pm_review: ShieldCheck,
  client_review: Hourglass,
  approved: CheckCircle2,
  cancelled: XCircle,
} satisfies Record<DesignStatus, typeof CheckCircle2>;
const DESIGN_STATUS_ICON_COLOR_BY_STATUS: Record<DesignStatus, string> = {
  new: "text-muted-foreground",
  changes: "text-warning-foreground",
  in_progress: "text-info-foreground",
  pm_review: "text-info-foreground",
  client_review: "text-warning-foreground",
  approved: "text-success-foreground",
  cancelled: "text-danger-foreground",
};
const STATUS_BADGE_CLASS_BY_STATUS: Record<DesignStatus, string> = {
  new: "design-status-badge-new",
  changes: "design-status-badge-changes",
  in_progress: "design-status-badge-in-progress",
  pm_review: "design-status-badge-pm-review",
  client_review: "design-status-badge-client-review",
  approved: "design-status-badge-approved",
  cancelled: "design-status-badge-cancelled",
};
const TIMELINE_BAR_CLASS_BY_STATUS: Record<DesignStatus, string> = {
  new: "design-timeline-bar-new",
  changes: "design-timeline-bar-changes",
  in_progress: "design-timeline-bar-in-progress",
  pm_review: "design-timeline-bar-pm-review",
  client_review: "design-timeline-bar-client-review",
  approved: "design-timeline-bar-approved",
  cancelled: "design-timeline-bar-cancelled",
};
const TIMELINE_PROGRESS_BY_STATUS: Record<DesignStatus, number> = {
  new: 0,
  changes: 0.15,
  in_progress: 0.55,
  pm_review: 0.75,
  client_review: 0.9,
  approved: 1,
  cancelled: 0.3,
};

const DESIGN_FILES_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";
const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

const MAX_BRIEF_FILES = 5;
const formatEstimateMinutes = (minutes?: number | null) => {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return "Не вказано";
  const value = Math.round(minutes);
  const days = Math.floor(value / 480);
  const hours = Math.floor((value % 480) / 60);
  const mins = value % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} д`);
  if (hours) parts.push(`${hours} год`);
  if (mins) parts.push(`${mins} хв`);
  return parts.length > 0 ? parts.join(" ") : "0 хв";
};

const getInitials = (name?: string | null) => {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

const getTaskPartyLabel = () => "Клієнт";

function isBrokenSupabaseRestUrl(value?: string | null): boolean {
  if (!value) return false;
  return /\/rest\/v1\//i.test(value);
}

const normalizeLogoUrl = (value?: string | null) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  return isBrokenSupabaseRestUrl(normalized) ? null : normalized;
};

const parseDateOnly = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(value);
};

const getDeadlineBadge = (value?: string | null) => {
  if (!value) return { label: "Не вказано", tone: "none" as const };
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return { label: "Не вказано", tone: "none" as const };
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDeadline = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `Прострочено (${Math.abs(diffDays)} дн.)`, tone: "overdue" as const };
  if (diffDays === 0) return { label: "Сьогодні", tone: "today" as const };
  if (diffDays <= 2) return { label: diffDays === 1 ? "Завтра" : `Через ${diffDays} дн.`, tone: "soon" as const };
  return { label: date.toLocaleDateString("uk-UA"), tone: "future" as const };
};

const formatDeadlineShort = (value: string) => {
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
};

const formatQtyLabel = (qty: number | null | undefined, unit: string | null | undefined) => {
  const qtyValue = Number(qty ?? 0);
  if (!Number.isFinite(qtyValue) || qtyValue <= 0) return null;
  const qtyLabel = Number.isInteger(qtyValue) ? String(qtyValue) : qtyValue.toLocaleString("uk-UA");
  const rawUnit = (unit ?? "").trim().toLowerCase();
  if (rawUnit === "pcs" || rawUnit === "pc") return `${qtyLabel} шт.`;
  if (rawUnit === "шт" || rawUnit === "шт." || rawUnit === "штук") return `${qtyLabel} шт.`;
  return `${qtyLabel} ${unit?.trim() || "шт."}`;
};

export default function DesignPage() {
  const { teamId, userId, permissions } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const effectiveTeamId = teamId;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [tasks, setTasks] = useState<DesignTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<DesignStatus | null>(null);
  const [suppressCardClick, setSuppressCardClick] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<DesignTask | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBrief, setCreateBrief] = useState("");
  const [createCustomer, setCreateCustomer] = useState("");
  const [createCustomerSearch, setCreateCustomerSearch] = useState("");
  const [createCustomerPopoverOpen, setCreateCustomerPopoverOpen] = useState(false);
  const [createDeadline, setCreateDeadline] = useState<Date | undefined>();
  const [createDeadlinePopoverOpen, setCreateDeadlinePopoverOpen] = useState(false);
  const [createManagerUserId, setCreateManagerUserId] = useState<string>("none");
  const [createManagerPopoverOpen, setCreateManagerPopoverOpen] = useState(false);
  const [createAssigneeUserId, setCreateAssigneeUserId] = useState<string>("none");
  const [createAssigneePopoverOpen, setCreateAssigneePopoverOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createFilesDragActive, setCreateFilesDragActive] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [estimateDialogOpen, setEstimateDialogOpen] = useState(false);
  const [estimateInput, setEstimateInput] = useState("2");
  const [estimateUnit, setEstimateUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [estimateReason, setEstimateReason] = useState("");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimatePendingAction, setEstimatePendingAction] = useState<{
    mode: "assign" | "status" | "reestimate";
    task: DesignTask;
    nextAssigneeUserId?: string | null;
    nextStatus?: DesignStatus;
  } | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [viewMode, setViewMode] = useState<DesignViewMode>("kanban");
  const [timelineZoom, setTimelineZoom] = useState<"day" | "week" | "month">("day");
  const [memberById, setMemberById] = useState<Record<string, string>>({});
  const [memberAvatarById, setMemberAvatarById] = useState<Record<string, string | null>>({});
  const [managerMembers, setManagerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>([]);
  const [designerMembers, setDesignerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>([]);
  const [timerSummaryByTaskId, setTimerSummaryByTaskId] = useState<Record<string, DesignTaskTimerSummary>>({});
  const [timerNowMs, setTimerNowMs] = useState<number>(() => Date.now());
  const canManageAssignments = permissions.canManageAssignments;
  const canSelfAssign = permissions.canSelfAssignDesign;
  const openTask = (taskId: string, inNewTab = false) => {
    const href = `/design/${taskId}`;
    if (inNewTab) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(href);
  };

  const getMemberLabel = (id: string | null | undefined) => {
    if (!id) return "Без виконавця";
    return memberById[id] ?? id.slice(0, 8);
  };
  const getMemberAvatar = (id: string | null | undefined) => {
    if (!id) return null;
    return memberAvatarById[id] ?? null;
  };

  const getTaskTimerSummary = (taskId: string): DesignTaskTimerSummary => {
    return (
      timerSummaryByTaskId[taskId] ?? {
        totalSeconds: 0,
        activeSessionId: null,
        activeStartedAt: null,
        activeUserId: null,
      }
    );
  };

  const getTaskTrackedSeconds = (taskId: string) => {
    const summary = getTaskTimerSummary(taskId);
    const activeSeconds = summary.activeStartedAt
      ? Math.max(0, Math.floor((timerNowMs - new Date(summary.activeStartedAt).getTime()) / 1000))
      : 0;
    return summary.totalSeconds + activeSeconds;
  };

  useEffect(() => {
    const loadMembers = async () => {
      if (!userId) return;
      setMembersLoading(true);
      try {
        let rows: MembershipRow[] = [];

        if (effectiveTeamId) {
          const teamViewColumns = [
            "user_id,full_name,email,avatar_url,access_role,job_role",
            "user_id,full_name,email,avatar_url,job_role",
            "user_id,full_name,email,avatar_url",
            "user_id,full_name,email,job_role",
            "user_id,full_name,email",
            "user_id,full_name,avatar_url",
            "user_id,email,avatar_url",
            "user_id,full_name,job_role",
            "user_id,full_name",
            "user_id,email",
            "user_id",
          ];
          for (const columns of teamViewColumns) {
            const { data: teamViewData, error: teamViewError } = await supabase
              .from("team_members_view")
              .select(columns)
              .eq("team_id", effectiveTeamId);
            if (!teamViewError) {
              rows = ((teamViewData as unknown as MembershipRow[] | null) ?? []).filter((row) => !!row.user_id);
              break;
            }
            const message = (teamViewError.message ?? "").toLowerCase();
            if (!message.includes("column") || !message.includes("does not exist")) {
              throw teamViewError;
            }
          }
        }

        if (rows.length === 0) {
          const workspaceId = await resolveWorkspaceId(userId);
          if (!workspaceId) {
            setMemberById({});
            setMemberAvatarById({});
            setManagerMembers([]);
            setDesignerMembers([]);
            return;
          }

          const membershipColumns = [
            "user_id,full_name,email,avatar_url,access_role,job_role",
            "user_id,full_name,email,avatar_url,job_role",
            "user_id,full_name,email,avatar_url",
            "user_id,full_name,email,access_role,job_role",
            "user_id,full_name,email,job_role",
            "user_id,full_name,email",
            "user_id",
          ];
          let loaded = false;
          for (const columns of membershipColumns) {
            const { data, error: membersError } = await supabase
              .schema("tosho")
              .from("memberships_view")
              .select(columns)
              .eq("workspace_id", workspaceId);
            if (!membersError) {
              rows = ((data as unknown as MembershipRow[] | null) ?? []).filter((row) => !!row.user_id);
              loaded = true;
              break;
            }
            const message = (membersError.message ?? "").toLowerCase();
            if (!message.includes("column") || !message.includes("does not exist")) {
              throw membersError;
            }
          }
          if (!loaded) throw new Error("Не вдалося завантажити учасників");
        }

        const labelById: Record<string, string> = {};
        const avatarById: Record<string, string | null> = {};
        rows.forEach((row) => {
          const label = row.full_name?.trim() || row.email?.split("@")[0]?.trim() || row.user_id;
          labelById[row.user_id] = label;
          avatarById[row.user_id] = row.avatar_url ?? null;
        });
        setMemberById(labelById);
        const resolvedAvatarEntries = await Promise.all(
          Object.entries(avatarById).map(async ([id, rawUrl]) => [id, await resolveAvatarDisplayUrl(supabase, rawUrl, AVATAR_BUCKET)] as const)
        );
        setMemberAvatarById(Object.fromEntries(resolvedAvatarEntries));
        let designerRows = rows.filter((row) => isDesignerRole(row.job_role));

        // Fallback: when team_members_view doesn't expose job_role, hydrate roles from memberships_view.
        if (designerRows.length === 0 && rows.length > 0) {
          const workspaceId = await resolveWorkspaceId(userId);
          if (workspaceId) {
            const memberIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
            const membershipColumns = [
              "user_id,job_role",
              "user_id,full_name,email,job_role",
              "user_id,access_role,job_role",
              "user_id",
            ];
            for (const columns of membershipColumns) {
              const { data: roleRows, error: roleError } = await supabase
                .schema("tosho")
                .from("memberships_view")
                .select(columns)
                .eq("workspace_id", workspaceId)
                .in("user_id", memberIds);
              if (!roleError) {
                const roleById = new Map(
                  (((roleRows as Array<{ user_id?: string | null; job_role?: string | null }> | null) ?? [])
                    .map((row) => [row.user_id ?? "", row.job_role ?? null])) as Array<[string, string | null]>
                );
                designerRows = rows.filter((row) => isDesignerRole(roleById.get(row.user_id) ?? row.job_role));
                break;
              }
              const message = (roleError.message ?? "").toLowerCase();
              if (!message.includes("column") || !message.includes("does not exist")) {
                throw roleError;
              }
            }
          }
        }

        // If no one is marked as designer, still allow assignment to any team member.
        const assigneeRows = designerRows.length > 0 ? designerRows : rows;
        setDesignerMembers(
          assigneeRows.map((row) => ({
            id: row.user_id,
            label: labelById[row.user_id] ?? row.user_id,
            avatarUrl: avatarById[row.user_id] ?? null,
          }))
        );

        let managerRows = rows.filter((row) => isManagerRole(row.access_role, row.job_role));
        if (managerRows.length === 0 && userId) {
          const me = rows.find((row) => row.user_id === userId);
          if (me) managerRows = [me];
        }
        if (managerRows.length === 0) managerRows = rows;
        setManagerMembers(
          managerRows.map((row) => ({
            id: row.user_id,
            label: labelById[row.user_id] ?? row.user_id,
            avatarUrl: avatarById[row.user_id] ?? null,
          }))
        );
      } catch (e: unknown) {
        setError(getErrorMessage(e, "Не вдалося завантажити учасників команди"));
      } finally {
        setMembersLoading(false);
      }
    };
    void loadMembers();
  }, [userId, effectiveTeamId]);

  useEffect(() => {
    const loadCustomers = async () => {
      if (!effectiveTeamId) return;
      setCustomersLoading(true);
      try {
        const { data, error: customersError } = await supabase
          .schema("tosho")
          .from("customers")
          .select("id,name,legal_name")
          .eq("team_id", effectiveTeamId)
          .order("name", { ascending: true });
        if (customersError) throw customersError;
        const options = ((data as Array<{ id: string; name?: string | null; legal_name?: string | null }> | null) ?? [])
          .map((row) => ({
            id: row.id,
            label: row.name?.trim() || row.legal_name?.trim() || "Клієнт без назви",
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "uk"));
        setCustomers(options);
      } catch {
        setCustomers([]);
      } finally {
        setCustomersLoading(false);
      }
    };
    void loadCustomers();
  }, [effectiveTeamId]);

  useEffect(() => {
    if (permissions.isDesigner) {
      setAssignmentFilter((prev) => (prev === "all" ? "mine" : prev));
    }
  }, [permissions.isDesigner]);

  const loadTasks = async () => {
    if (!effectiveTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("activity_log")
        .select("id,entity_id,metadata,title,created_at")
        .eq("team_id", effectiveTeamId)
        .eq("action", "design_task")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      const parsedRaw =
        data?.map((row) => {
          const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
          const metadataQuoteId =
            typeof metadata.quote_id === "string" && metadata.quote_id.trim()
              ? metadata.quote_id.trim()
              : null;
          const entityQuoteId = typeof row.entity_id === "string" ? row.entity_id : "";
          const resolvedQuoteId = metadataQuoteId ?? entityQuoteId;
          return {
            id: row.id as string,
            quoteId: resolvedQuoteId,
            title: (row.title as string) ?? null,
            status: (metadata.status as DesignStatus) ?? "new",
            assigneeUserId:
              typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id
                ? metadata.assignee_user_id
                : null,
            assignedAt: typeof metadata.assigned_at === "string" ? metadata.assigned_at : null,
            metadata,
            quoteNumber:
              typeof metadata.quote_number === "string" && metadata.quote_number.trim()
                ? metadata.quote_number.trim()
                : null,
            customerName:
              typeof metadata.customer_name === "string" && metadata.customer_name.trim()
                ? metadata.customer_name.trim()
                : null,
            customerLogoUrl:
              typeof metadata.customer_logo_url === "string" && metadata.customer_logo_url.trim()
                ? metadata.customer_logo_url.trim()
                : null,
            partyType:
              typeof metadata.customer_type === "string"
                ? (metadata.customer_type.trim().toLowerCase() === "lead"
                    ? "lead"
                    : metadata.customer_type.trim().toLowerCase() === "customer"
                      ? "customer"
                      : null)
                : null,
            productName:
              typeof metadata.product_name === "string" && metadata.product_name.trim()
                ? metadata.product_name.trim()
                : typeof metadata.quote_item_name === "string" && metadata.quote_item_name.trim()
                  ? metadata.quote_item_name.trim()
                  : typeof metadata.item_name === "string" && metadata.item_name.trim()
                    ? metadata.item_name.trim()
                    : null,
            methodsCount: metadata.methods_count ?? 0,
            hasFiles: metadata.has_files ?? false,
            designDeadline: metadata.design_deadline ?? metadata.deadline ?? null,
            createdAt: row.created_at as string,
          } as DesignTask;
        }) ?? [];

      // Fetch quote details for number and customer
      const quoteIds = Array.from(
        new Set(parsedRaw.map((t) => t.quoteId).filter((quoteId): quoteId is string => !!quoteId && isUuid(quoteId)))
      );
      let quoteMap = new Map<string, { number: string | null; customerName: string | null; customerLogoUrl: string | null; partyType: "customer" | "lead" }>();
      const productNameByQuoteId = new Map<string, string | null>();
      const productImageByQuoteId = new Map<string, string | null>();
      const productQtyByQuoteId = new Map<string, string | null>();
      if (quoteIds.length > 0) {
        const { data: quoteRows, error: quoteError } = await supabase
          .schema("tosho")
          .from("quotes")
          .select("id, number, customer_id, customer_name, customer_logo_url, title")
          .in("id", quoteIds);
        if (quoteError) throw quoteError;

        const customerIds = Array.from(
          new Set((quoteRows ?? []).map((q) => q.customer_id).filter(Boolean) as string[])
        );
        const customerMap = new Map<string, { name: string | null; logoUrl: string | null }>();
        if (customerIds.length > 0) {
          const { data: customers, error: custError } = await supabase
            .schema("tosho")
            .from("customers")
            .select("id, name, legal_name, logo_url")
            .in("id", customerIds);
          if (custError) throw custError;
          (customers ?? []).forEach((c) => {
            const name =
              (typeof c.name === "string" && c.name.trim() ? c.name : null) ??
              (typeof c.legal_name === "string" && c.legal_name.trim() ? c.legal_name : null);
            const logoUrl = typeof c.logo_url === "string" && c.logo_url.trim() ? c.logo_url : null;
            customerMap.set(c.id, { name, logoUrl });
          });
        }

        quoteMap = new Map(
          (quoteRows ?? []).map((q) => [
            q.id as string,
            {
              number: (q.number as string) ?? null,
              customerName:
                (typeof q.customer_name === "string" && q.customer_name.trim() ? q.customer_name.trim() : null) ??
                customerMap.get(q.customer_id as string)?.name ??
                (typeof q.title === "string" && q.title.trim() ? q.title.trim() : null),
              customerLogoUrl:
                normalizeLogoUrl(
                  typeof q.customer_logo_url === "string" ? q.customer_logo_url : null
                ) ?? normalizeLogoUrl(customerMap.get(q.customer_id as string)?.logoUrl ?? null),
              partyType: q.customer_id ? "customer" : "lead",
            },
          ])
        );

        const { data: quoteItems, error: quoteItemsError } = await supabase
          .schema("tosho")
          .from("quote_items")
          .select("quote_id, position, name, qty, unit, attachment, catalog_model_id")
          .in("quote_id", quoteIds)
          .order("position", { ascending: true });
        if (quoteItemsError) throw quoteItemsError;

        const firstItemByQuoteId = new Map<
          string,
          {
            quote_id: string | null;
            name?: string | null;
            qty?: number | null;
            unit?: string | null;
            attachment?: unknown;
            catalog_model_id?: string | null;
          }
        >();
        (quoteItems ?? []).forEach((item) => {
          const quoteId = typeof item.quote_id === "string" ? item.quote_id : null;
          if (!quoteId || productNameByQuoteId.has(quoteId)) return;
          const name = typeof item.name === "string" ? item.name.trim() : "";
          productNameByQuoteId.set(quoteId, name || null);
          productQtyByQuoteId.set(
            quoteId,
            formatQtyLabel(
              typeof item.qty === "number" ? item.qty : item.qty ? Number(item.qty) : null,
              typeof item.unit === "string" ? item.unit : null
            )
          );
          firstItemByQuoteId.set(quoteId, item);
        });

        const modelIds = Array.from(
          new Set(
            Array.from(firstItemByQuoteId.values())
              .map((item) =>
                typeof item.catalog_model_id === "string" && item.catalog_model_id.trim()
                  ? item.catalog_model_id.trim()
                  : ""
              )
              .filter(Boolean)
          )
        );
        const modelImageById = new Map<string, string>();
        if (modelIds.length > 0) {
          const loadModels = async (withImage: boolean) => {
            const columns = withImage ? "id,image_url" : "id";
            return await supabase.schema("tosho").from("catalog_models").select(columns).in("id", modelIds);
          };
          let { data: modelRows, error: modelError } = await loadModels(true);
          if (
            modelError &&
            /column/i.test(modelError.message ?? "") &&
            /image_url/i.test(modelError.message ?? "")
          ) {
            ({ data: modelRows, error: modelError } = await loadModels(false));
          }
          if (!modelError) {
            (((modelRows ?? []) as unknown) as Array<{ id: string; image_url?: string | null }>).forEach((row) => {
              const imageUrl = row.image_url?.trim();
              if (!imageUrl) return;
              modelImageById.set(row.id, imageUrl);
            });
          }
        }

        firstItemByQuoteId.forEach((item, quoteId) => {
          const attachmentImage =
            item.attachment &&
            typeof item.attachment === "object" &&
            typeof (item.attachment as Record<string, unknown>).url === "string"
              ? String((item.attachment as Record<string, unknown>).url)
              : null;
          const catalogImage =
            typeof item.catalog_model_id === "string" && item.catalog_model_id.trim()
              ? modelImageById.get(item.catalog_model_id.trim()) ?? null
              : null;
          productImageByQuoteId.set(quoteId, attachmentImage || catalogImage || null);
        });
      }

      const parsed: DesignTask[] = parsedRaw.map((t) => ({
        ...t,
        quoteNumber: t.quoteNumber ?? quoteMap.get(t.quoteId)?.number ?? null,
        customerName: t.customerName ?? quoteMap.get(t.quoteId)?.customerName ?? null,
        customerLogoUrl:
          normalizeLogoUrl(t.customerLogoUrl) ??
          normalizeLogoUrl(quoteMap.get(t.quoteId)?.customerLogoUrl ?? null) ??
          null,
        partyType: t.partyType ?? quoteMap.get(t.quoteId)?.partyType ?? null,
        productName: t.productName ?? productNameByQuoteId.get(t.quoteId) ?? null,
        productImageUrl: productImageByQuoteId.get(t.quoteId) ?? null,
        productQtyLabel: productQtyByQuoteId.get(t.quoteId) ?? null,
      }));

      setTasks(parsed);
      try {
        const timerSummaryMap = await getDesignTasksTimerSummaryMap(
          effectiveTeamId,
          parsed.map((task) => task.id)
        );
        const timerSummaryObj: Record<string, DesignTaskTimerSummary> = {};
        timerSummaryMap.forEach((summary, taskId) => {
          timerSummaryObj[taskId] = summary;
        });
        setTimerSummaryByTaskId(timerSummaryObj);
      } catch (timerError) {
        console.warn("Failed to load timer summaries", timerError);
        setTimerSummaryByTaskId({});
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Не вдалося завантажити задачі дизайну"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTeamId]);

  const filteredTasks = useMemo(() => {
    if (assignmentFilter === "all") return tasks;
    if (assignmentFilter === "mine") {
      return tasks.filter((task) => !!userId && task.assigneeUserId === userId);
    }
    return tasks.filter((task) => !task.assigneeUserId);
  }, [assignmentFilter, tasks, userId]);

  useEffect(() => {
    const hasActive = Object.values(timerSummaryByTaskId).some((summary) => !!summary.activeStartedAt);
    if (!hasActive) return;
    const interval = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerSummaryByTaskId]);

  const grouped = useMemo(() => {
    const bucket: Record<DesignStatus, DesignTask[]> = {
      new: [],
      changes: [],
      in_progress: [],
      pm_review: [],
      client_review: [],
      approved: [],
      cancelled: [],
    };
    filteredTasks.forEach((task) => {
      bucket[task.status]?.push(task);
    });
    return bucket;
  }, [filteredTasks]);

  const getTaskEstimateMinutes = (task: DesignTask) => {
    const raw = (task.metadata ?? {}).estimate_minutes;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
  };

  const requestEstimateBeforeAction = (params: {
    mode: "assign" | "status";
    task: DesignTask;
    nextAssigneeUserId?: string | null;
    nextStatus?: DesignStatus;
  }) => {
    setEstimatePendingAction(params);
    setEstimateInput("2");
    setEstimateUnit("hours");
    setEstimateReason("");
    setEstimateError(null);
    setEstimateDialogOpen(true);
  };

  const requestReestimate = (task: DesignTask) => {
    const current = getTaskEstimateMinutes(task);
    if (!current) {
      requestEstimateBeforeAction({ mode: "status", task, nextStatus: task.status });
      return;
    }
    if (current % 480 === 0) {
      setEstimateInput(String(current / 480));
      setEstimateUnit("days");
    } else if (current % 60 === 0) {
      setEstimateInput(String(current / 60));
      setEstimateUnit("hours");
    } else {
      setEstimateInput(String(current));
      setEstimateUnit("minutes");
    }
    setEstimateReason("");
    setEstimateError(null);
    setEstimatePendingAction({ mode: "reestimate", task });
    setEstimateDialogOpen(true);
  };

  const timelineData = useMemo(() => {
    const normalizeDate = (value: string | null | undefined): Date | null => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    };
    const addDays = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    const isWeekend = (day: Date) => {
      const w = day.getDay();
      return w === 0 || w === 6;
    };
    const daysDiff = (from: Date, to: Date) =>
      Math.round(
        (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
          new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
          (1000 * 60 * 60 * 24)
      );
    const subtractWorkingDays = (deadline: Date, workingDays: number) => {
      const safeDays = Math.max(1, workingDays);
      let cursor = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
      let remaining = safeDays;
      while (remaining > 1) {
        cursor = addDays(cursor, -1);
        if (!isWeekend(cursor)) remaining -= 1;
      }
      return cursor;
    };
    const today = normalizeDate(new Date().toISOString()) as Date;

    const timelineTasks = filteredTasks
      .map((task) => {
        const deadline = normalizeDate(task.designDeadline ?? null);
        if (!deadline) return null;
        const estimateMinutes = getTaskEstimateMinutes(task);
        const hasEstimate = !!estimateMinutes;
        const estimateWorkingDays = hasEstimate ? Math.max(1, Math.ceil((estimateMinutes as number) / 480)) : 1;
        const start = hasEstimate ? subtractWorkingDays(deadline, estimateWorkingDays) : deadline;
        const isDone = task.status === "approved" || task.status === "cancelled";
        const isStartRisk = (task.status === "new" || task.status === "changes") && today.getTime() > start.getTime();
        const isOverdue = !isDone && today.getTime() > deadline.getTime();
        return {
          task,
          start,
          end: deadline,
          hasEstimate,
          estimateMinutes: estimateMinutes ?? null,
          estimateWorkingDays,
          isStartRisk,
          isOverdue,
        };
      })
      .filter(Boolean) as Array<{
        task: DesignTask;
        start: Date;
        end: Date;
        hasEstimate: boolean;
        estimateMinutes: number | null;
        estimateWorkingDays: number;
        isStartRisk: boolean;
        isOverdue: boolean;
      }>;

    const noDeadlineTasks = filteredTasks.filter((task) => !normalizeDate(task.designDeadline ?? null));
    if (timelineTasks.length === 0) {
      return {
        rows: [] as Array<{
          task: DesignTask;
          start: Date;
          end: Date;
          offset: number;
          span: number;
          hasEstimate: boolean;
          estimateMinutes: number | null;
          estimateWorkingDays: number;
          isStartRisk: boolean;
          isOverdue: boolean;
        }>,
        days: [] as Date[],
        todayOffset: -1,
        noDeadlineTasks,
      };
    }

    const sorted = [...timelineTasks].sort((a, b) => {
      const byEnd = a.end.getTime() - b.end.getTime();
      if (byEnd !== 0) return byEnd;
      return a.start.getTime() - b.start.getTime();
    });

    const minStart = sorted.reduce(
      (acc, item) => (item.start.getTime() < acc.getTime() ? item.start : acc),
      sorted[0].start
    );
    const maxEnd = sorted.reduce((acc, item) => (item.end.getTime() > acc.getTime() ? item.end : acc), sorted[0].end);
    const windowStart = addDays(minStart, -1);
    const windowEnd = addDays(maxEnd.getTime() < today.getTime() ? today : maxEnd, 1);
    const totalDays = Math.max(1, daysDiff(windowStart, windowEnd) + 1);
    const days = Array.from({ length: totalDays }, (_, index) => addDays(windowStart, index));
    const todayOffset = Math.max(0, Math.min(totalDays - 1, daysDiff(windowStart, today)));

    const rows = sorted.map((item) => {
      const offset = Math.max(0, daysDiff(windowStart, item.start));
      const span = Math.max(1, daysDiff(item.start, item.end) + 1);
      return { ...item, offset, span };
    });

    return { rows, days, todayOffset, noDeadlineTasks };
  }, [filteredTasks]);

  const timelineAxis = useMemo(() => {
    const bucketSize = timelineZoom === "day" ? 1 : timelineZoom === "week" ? 7 : 30;
    const columnCount = Math.max(1, Math.ceil((timelineData.days.length || 1) / bucketSize));
    const columns = Array.from({ length: columnCount }, (_, idx) => {
      const startIndex = idx * bucketSize;
      const start = timelineData.days[startIndex] ?? timelineData.days[timelineData.days.length - 1] ?? new Date();
      const end = timelineData.days[Math.min(startIndex + bucketSize - 1, timelineData.days.length - 1)] ?? start;
      return { start, end };
    });
    return { bucketSize, columnCount, columns };
  }, [timelineData.days, timelineZoom]);

  const assigneeGrouped = useMemo(() => {
    const map = new Map<
      string,
      { id: string | null; label: string; tasks: DesignTask[]; estimateMinutesTotal: number; tasksWithoutEstimate: number }
    >();
    filteredTasks.forEach((task) => {
      const key = task.assigneeUserId ?? "__unassigned__";
      if (!map.has(key)) {
        map.set(key, {
          id: task.assigneeUserId ?? null,
          label: task.assigneeUserId ? getMemberLabel(task.assigneeUserId) : "Без виконавця",
          tasks: [],
          estimateMinutesTotal: 0,
          tasksWithoutEstimate: 0,
        });
      }
      const group = map.get(key);
      if (!group) return;
      group.tasks.push(task);
      const estimate = getTaskEstimateMinutes(task);
      if (estimate) group.estimateMinutesTotal += estimate;
      else group.tasksWithoutEstimate += 1;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (!a.id && b.id) return 1;
      if (a.id && !b.id) return -1;
      if (b.tasks.length !== a.tasks.length) return b.tasks.length - a.tasks.length;
      return a.label.localeCompare(b.label, "uk");
    });
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, memberById]);

  const filteredCustomerOptions = useMemo(() => {
    const q = createCustomerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers
      .filter((customer) => customer.label.toLowerCase().includes(q))
      .slice(0, 50);
  }, [customers, createCustomerSearch]);

  const selectedAssignee = useMemo(
    () => designerMembers.find((member) => member.id === createAssigneeUserId) ?? null,
    [designerMembers, createAssigneeUserId]
  );
  const selectedManager = useMemo(
    () => managerMembers.find((member) => member.id === createManagerUserId) ?? null,
    [managerMembers, createManagerUserId]
  );

  useEffect(() => {
    if (!createDialogOpen) return;
    if (!userId) return;
    setCreateManagerUserId((prev) => (prev && prev !== "none" ? prev : userId));
  }, [createDialogOpen, userId]);

  const startDraggingTask = (event: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggingId(taskId);
    setSuppressCardClick(true);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  };

  const stopDraggingTask = () => {
    setDraggingId(null);
    setDropTargetStatus(null);
    // Prevent accidental navigation when mouseup fires click right after drag end.
    window.setTimeout(() => setSuppressCardClick(false), 100);
  };

  const dropTaskToStatus = (nextStatus: DesignStatus) => {
    if (!draggingId) return;
    const draggedTask = tasks.find((task) => task.id === draggingId);
    if (!draggedTask) return;
    if (draggedTask.status === nextStatus) return;
    void handleStatusChange(draggedTask, nextStatus);
  };

  const handleStatusChange = async (task: DesignTask, next: DesignStatus, options?: { estimateMinutes?: number }) => {
    if (!effectiveTeamId || task.status === next) return;
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (next === "in_progress" && !existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateBeforeAction({ mode: "status", task, nextStatus: next });
      return;
    }
    const previousStatus = task.status;
    const estimateMinutes = options?.estimateMinutes ?? existingEstimateMinutes;
    const estimateSetAt =
      options?.estimateMinutes != null
        ? new Date().toISOString()
        : ((task.metadata ?? {}).estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? (userId ?? null)
        : ((task.metadata ?? {}).estimated_by_user_id as string | null | undefined) ?? null;
    const baseMetadata = {
      ...(task.metadata ?? {}),
      status: next,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      assignee_user_id: task.assigneeUserId ?? null,
      assigned_at: task.assignedAt ?? null,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };
    try {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: next,
                metadata: { ...(t.metadata ?? {}), ...baseMetadata },
              }
            : t
        )
      );
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: baseMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      if (previousStatus === "in_progress" && next !== "in_progress") {
        await pauseDesignTaskTimer({ teamId: effectiveTeamId, taskId: task.id });
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        if (previousStatus === "in_progress" && next !== "in_progress") {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_timer",
            title: "Таймер зупинено автоматично",
            metadata: {
              source: "design_task_timer",
              timer_action: "auto_pause_on_status_change",
              from_status: previousStatus,
              to_status: next,
            },
          });
        }
        if (options?.estimateMinutes != null) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_estimate",
            title: `Естімейт: ${formatEstimateMinutes(options.estimateMinutes)}`,
            metadata: {
              source: "design_task_estimate",
              estimate_minutes: options.estimateMinutes,
            },
          });
        }
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_status",
          title: `Статус: ${DESIGN_COLUMNS.find((c) => c.id === previousStatus)?.label ?? previousStatus} → ${DESIGN_COLUMNS.find((c) => c.id === next)?.label ?? next}`,
          metadata: {
            source: "design_task_status",
            from_status: previousStatus,
            to_status: next,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task status event", logError);
      }
      try {
        await notifyQuoteInitiatorOnDesignStatusChange({
          quoteId: task.quoteId,
          designTaskId: task.id,
          toStatus: next,
          actorUserId: userId ?? null,
        });
      } catch (notifyError) {
        console.warn("Failed to notify quote initiator about design status change", notifyError);
      }
      try {
        const timerSummaryMap = await getDesignTasksTimerSummaryMap(effectiveTeamId, [task.id]);
        const nextSummary = timerSummaryMap.get(task.id);
        setTimerSummaryByTaskId((prev) => ({
          ...prev,
          [task.id]:
            nextSummary ?? {
              totalSeconds: 0,
              activeSessionId: null,
              activeStartedAt: null,
              activeUserId: null,
            },
        }));
      } catch (timerError) {
        console.warn("Failed to refresh timer summary after status change", timerError);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Не вдалося оновити статус"));
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status, metadata: task.metadata ?? {} } : t))
      );
    }
  };

  const applyAssignee = async (
    task: DesignTask,
    nextAssigneeUserId: string | null,
    options?: { estimateMinutes?: number }
  ) => {
    if (!effectiveTeamId) return;
    if (!canManageAssignments) {
      if (!userId || nextAssigneeUserId !== userId) {
        toast.error("Немає прав для зміни виконавця");
        return;
      }
      if (task.assigneeUserId && task.assigneeUserId !== userId) {
        toast.error("Задача вже призначена іншому дизайнеру");
        return;
      }
    }
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (nextAssigneeUserId && !existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateBeforeAction({ mode: "assign", task, nextAssigneeUserId });
      return;
    }
    const nextAssignedAt = nextAssigneeUserId ? new Date().toISOString() : null;
    const estimateMinutes = options?.estimateMinutes ?? existingEstimateMinutes;
    const estimateSetAt =
      options?.estimateMinutes != null
        ? new Date().toISOString()
        : ((task.metadata ?? {}).estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? (userId ?? null)
        : ((task.metadata ?? {}).estimated_by_user_id as string | null | undefined) ?? null;
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: task.status,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      assignee_user_id: nextAssigneeUserId,
      assigned_at: nextAssignedAt,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    const previousAssignee = task.assigneeUserId ?? null;
    const previousAssignedAt = task.assignedAt ?? null;
    const previousMetadata = task.metadata ?? {};
    const previousAssigneeLabel = getMemberLabel(previousAssignee);
    const nextAssigneeLabel = getMemberLabel(nextAssigneeUserId);

    setTasks((prev) =>
      prev.map((row) =>
        row.id === task.id
          ? {
              ...row,
              assigneeUserId: nextAssigneeUserId,
              assignedAt: nextAssignedAt,
              metadata: nextMetadata,
            }
          : row
      )
    );

    try {
      let query = supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);

      // Race-safe claim for "take task": update only when task still unassigned.
      // Use ->> so JSON null is treated as SQL NULL in PostgREST filtering.
      if (!task.assigneeUserId && nextAssigneeUserId) {
        query = query.is("metadata->>assignee_user_id", null);
      }

      const { data, error: updateError } = await query.select("id");
      if (updateError) throw updateError;
      if (!task.assigneeUserId && nextAssigneeUserId && (!data || data.length === 0)) {
        throw new Error("Цю задачу вже призначив інший користувач. Оновіть дошку.");
      }

      if (previousAssignee !== nextAssigneeUserId) {
        await pauseDesignTaskTimer({ teamId: effectiveTeamId, taskId: task.id });
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        if (previousAssignee !== nextAssigneeUserId) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_timer",
            title: "Таймер зупинено автоматично",
            metadata: {
              source: "design_task_timer",
              timer_action: "auto_pause_on_reassign",
              from_assignee_user_id: previousAssignee,
              to_assignee_user_id: nextAssigneeUserId,
            },
          });
        }
        if (options?.estimateMinutes != null) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_estimate",
            title: `Естімейт: ${formatEstimateMinutes(options.estimateMinutes)}`,
            metadata: {
              source: "design_task_estimate",
              estimate_minutes: options.estimateMinutes,
            },
          });
        }
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_assignment",
          title: nextAssigneeUserId
            ? `Призначено виконавця: ${nextAssigneeLabel}`
            : `Знято виконавця (${previousAssigneeLabel})`,
          metadata: {
            source: "design_task_assignment",
            from_assignee_user_id: previousAssignee,
            from_assignee_label: previousAssigneeLabel,
            to_assignee_user_id: nextAssigneeUserId,
            to_assignee_label: nextAssigneeUserId ? nextAssigneeLabel : null,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task assignment event", logError);
      }

      const quoteLabel = task.quoteNumber ? `#${task.quoteNumber}` : task.quoteId.slice(0, 8);
      try {
        if (nextAssigneeUserId && nextAssigneeUserId !== userId) {
          await notifyUsers({
            userIds: [nextAssigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: `${actorLabel} призначив(ла) вас на задачу по прорахунку ${quoteLabel}.`,
            href: `/design/${task.id}`,
            type: "info",
          });
        }
        if (previousAssignee && previousAssignee !== userId && previousAssignee !== nextAssigneeUserId) {
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: `${actorLabel} зняв(ла) вас із задачі по прорахунку ${quoteLabel}.`,
            href: `/design/${task.id}`,
            type: "warning",
          });
        }
      } catch (notifyError) {
        console.warn("Failed to send design task assignment notification", notifyError);
      }

      try {
        const timerSummaryMap = await getDesignTasksTimerSummaryMap(effectiveTeamId, [task.id]);
        const nextSummary = timerSummaryMap.get(task.id);
        setTimerSummaryByTaskId((prev) => ({
          ...prev,
          [task.id]:
            nextSummary ?? {
              totalSeconds: 0,
              activeSessionId: null,
              activeStartedAt: null,
              activeUserId: null,
            },
        }));
      } catch (timerError) {
        console.warn("Failed to refresh timer summary after assignee change", timerError);
      }

      toast.success(nextAssigneeUserId ? `Задача призначена: ${getMemberLabel(nextAssigneeUserId)}` : "Призначення знято");
    } catch (e: unknown) {
      setTasks((prev) =>
        prev.map((row) =>
          row.id === task.id
            ? {
                ...row,
                assigneeUserId: previousAssignee,
                assignedAt: previousAssignedAt,
                metadata: previousMetadata,
              }
            : row
        )
      );
      const message = getErrorMessage(e, "Не вдалося оновити виконавця");
      setError(message);
      toast.error(message);
    }
  };

  const requestDeleteTask = (task: DesignTask) => {
    if (!canManageAssignments) {
      toast.error("Немає прав для видалення задачі");
      return;
    }
    setTaskToDelete(task);
  };

  const addFilesToCreate = (incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return;
    const next = Array.from(incoming);
    if (next.length === 0) return;
    setCreateFiles((prev) => [...prev, ...next].slice(0, MAX_BRIEF_FILES));
  };

  const removeCreateFile = (index: number) => {
    setCreateFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadStandaloneBriefFiles = async (params: {
    teamId: string;
    taskId: string;
    userId: string | null;
    files: File[];
  }) => {
    const uploaded: Array<Record<string, unknown>> = [];
    for (const file of params.files) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const baseName = `${Date.now()}-${safeName}`;
      const candidatePaths = [
        `teams/${params.teamId}/design-briefs/${params.taskId}/${baseName}`,
        `${params.teamId}/design-briefs/${params.taskId}/${baseName}`,
        `${params.userId ?? "unknown"}/design-briefs/${params.taskId}/${baseName}`,
      ];

      let storagePath = "";
      let lastError: unknown = null;
      for (const candidate of candidatePaths) {
        const { error: uploadError } = await supabase.storage
          .from(DESIGN_FILES_BUCKET)
          .upload(candidate, file, { upsert: true, contentType: file.type || undefined });
        if (!uploadError) {
          storagePath = candidate;
          lastError = null;
          break;
        }
        lastError = uploadError;
      }

      if (!storagePath) {
        console.error("Failed to upload standalone design brief file", lastError);
        throw new Error(`Не вдалося завантажити файл: ${file.name}`);
      }

      uploaded.push({
        id: crypto.randomUUID(),
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        storage_bucket: DESIGN_FILES_BUCKET,
        storage_path: storagePath,
        uploaded_by: params.userId,
        created_at: new Date().toISOString(),
      });
    }
    return uploaded;
  };

  const createStandaloneTask = async () => {
    if (!effectiveTeamId || createSaving) return;
    const subject = createTitle.trim();
    if (!subject) {
      setCreateError("Вкажіть назву задачі.");
      return;
    }

    setCreateSaving(true);
    setCreateError(null);
    try {
      const assigneeUserId = createAssigneeUserId === "none" ? null : createAssigneeUserId;
      const managerUserId =
        createManagerUserId === "none"
          ? (userId ?? null)
          : createManagerUserId;
      const assignedAt = assigneeUserId ? new Date().toISOString() : null;
      const entityId = `standalone-${crypto.randomUUID()}`;
      const actorName = userId ? getMemberLabel(userId) : "System";
      const managerLabel = managerUserId ? getMemberLabel(managerUserId) : actorName;
      const brief = createBrief.trim();
      const customerName = createCustomer.trim();
      const deadline = createDeadline ? format(createDeadline, "yyyy-MM-dd") : null;

      const { data, error: insertError } = await supabase
        .from("activity_log")
        .insert({
          team_id: effectiveTeamId,
          user_id: userId ?? null,
          actor_name: actorName,
          action: "design_task",
          entity_type: "design_task",
          entity_id: entityId,
          title: subject,
          metadata: {
            source: "design_task_created_manual",
            task_kind: "standalone",
            status: "new",
            quote_id: null,
            assignee_user_id: assigneeUserId,
            assigned_at: assignedAt,
            manager_user_id: managerUserId,
            manager_label: managerLabel,
            customer_name: customerName || null,
            design_brief: brief || null,
            standalone_brief_files: [],
            design_deadline: deadline,
            deadline,
            methods_count: 0,
            has_files: createFiles.length > 0,
          },
        })
        .select("id,entity_id,metadata,title,created_at")
        .single();
      if (insertError) throw insertError;

      const createdRow = (data as unknown as DesignTaskActivityRow | null) ?? null;
      if (!createdRow) throw new Error("Не вдалося створити дизайн-задачу");
      const metadata = (createdRow.metadata ?? {}) as Record<string, unknown>;
      let briefFiles: Array<Record<string, unknown>> = [];
      if (createFiles.length > 0) {
        briefFiles = await uploadStandaloneBriefFiles({
          teamId: effectiveTeamId,
          taskId: createdRow.id,
          userId: userId ?? null,
          files: createFiles,
        });
        const patchedMetadata = {
          ...metadata,
          standalone_brief_files: briefFiles,
          has_files: true,
        };
        const { error: patchError } = await supabase
          .from("activity_log")
          .update({ metadata: patchedMetadata })
          .eq("team_id", effectiveTeamId)
          .eq("id", createdRow.id);
        if (patchError) throw patchError;
        Object.assign(metadata, patchedMetadata);
      }
      const createdTask: DesignTask = {
        id: createdRow.id,
        quoteId: createdRow.entity_id || entityId,
        title: createdRow.title ?? subject,
        status: ((metadata.status as DesignStatus) ?? "new") as DesignStatus,
        assigneeUserId:
          typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id
            ? (metadata.assignee_user_id as string)
            : null,
        assignedAt: typeof metadata.assigned_at === "string" ? (metadata.assigned_at as string) : null,
        metadata,
        quoteNumber: null,
        customerName: typeof metadata.customer_name === "string" ? (metadata.customer_name as string) : null,
        methodsCount: 0,
        hasFiles: createFiles.length > 0,
        designDeadline: (metadata.design_deadline as string | null) ?? (metadata.deadline as string | null) ?? null,
        createdAt: createdRow.created_at,
      };
      setTasks((prev) => [createdTask, ...prev]);

      if (assigneeUserId && assigneeUserId !== userId) {
        try {
          await notifyUsers({
            userIds: [assigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: `${actorName} призначив(ла) вас на нову дизайн-задачу.`,
            href: `/design/${createdTask.id}`,
            type: "info",
          });
        } catch (notifyError) {
          console.warn("Failed to notify assignee about standalone design task", notifyError);
        }
      }

      setCreateDialogOpen(false);
      setCreateTitle("");
      setCreateBrief("");
      setCreateCustomer("");
      setCreateCustomerSearch("");
      setCreateDeadline(undefined);
      setCreateDeadlinePopoverOpen(false);
      setCreateManagerUserId(userId ?? "none");
      setCreateManagerPopoverOpen(false);
      setCreateAssigneeUserId("none");
      setCreateAssigneePopoverOpen(false);
      setCreateFilesDragActive(false);
      setCreateFiles([]);
      toast.success("Дизайн-задачу створено");
    } catch (e: unknown) {
      setCreateError(getErrorMessage(e, "Не вдалося створити дизайн-задачу"));
    } finally {
      setCreateSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!effectiveTeamId || !taskToDelete || !canManageAssignments) return;
    const targetTask = taskToDelete;
    setDeletingTaskId(targetTask.id);
    try {
      const { error: taskDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("id", targetTask.id)
        .eq("action", "design_task");
      if (taskDeleteError) throw taskDeleteError;

      setTasks((prev) => prev.filter((task) => task.id !== targetTask.id));
      setTaskToDelete(null);

      const { error: historyDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("entity_type", "design_task")
        .eq("entity_id", targetTask.id);
      if (historyDeleteError) {
        console.warn("Failed to delete design task history events", historyDeleteError);
      }

      toast.success("Задачу видалено");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося видалити задачу");
      setError(message);
      toast.error(message);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const updateTaskEstimate = async (task: DesignTask, estimateMinutes: number, reason?: string) => {
    if (!effectiveTeamId) return;
    const previousEstimate = getTaskEstimateMinutes(task);
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      estimate_minutes: estimateMinutes,
      estimate_set_at: new Date().toISOString(),
      estimated_by_user_id: userId ?? null,
    };
    if (reason && reason.trim()) nextMetadata.reestimate_reason = reason.trim();

    setTasks((prev) => prev.map((row) => (row.id === task.id ? { ...row, metadata: nextMetadata } : row)));
    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: task.id,
        quoteId: task.quoteId,
        userId,
        actorName: actorLabel,
        action: "design_task_estimate",
        title: previousEstimate
          ? `Естімейт: ${formatEstimateMinutes(previousEstimate)} → ${formatEstimateMinutes(estimateMinutes)}`
          : `Естімейт: ${formatEstimateMinutes(estimateMinutes)}`,
        metadata: {
          source: "design_task_estimate",
          from_estimate_minutes: previousEstimate,
          to_estimate_minutes: estimateMinutes,
          reestimate_reason: reason?.trim() || null,
        },
      });
      toast.success(previousEstimate ? "Естімейт оновлено" : "Естімейт встановлено");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося оновити естімейт");
      setError(message);
      toast.error(message);
      setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)));
    }
  };

  const submitEstimateDialog = async () => {
    if (!estimatePendingAction) return;
    const amount = Number(estimateInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEstimateError("Вкажіть коректний естімейт.");
      return;
    }
    const unitMultiplier = estimateUnit === "minutes" ? 1 : estimateUnit === "hours" ? 60 : 480;
    const normalized = Math.round(amount * unitMultiplier);
    if (estimatePendingAction.mode === "reestimate" && !estimateReason.trim()) {
      setEstimateError("Вкажіть причину зміни естімейту.");
      return;
    }
    setEstimateError(null);
    setEstimateDialogOpen(false);

    if (estimatePendingAction.mode === "assign") {
      await applyAssignee(estimatePendingAction.task, estimatePendingAction.nextAssigneeUserId ?? null, {
        estimateMinutes: normalized,
      });
    } else if (estimatePendingAction.mode === "status" && estimatePendingAction.nextStatus) {
      await handleStatusChange(estimatePendingAction.task, estimatePendingAction.nextStatus, {
        estimateMinutes: normalized,
      });
    } else if (estimatePendingAction.mode === "reestimate") {
      await updateTaskEstimate(estimatePendingAction.task, normalized, estimateReason);
    }
    setEstimatePendingAction(null);
    setEstimateReason("");
  };

  const renderTaskCard = (task: DesignTask, options?: { draggable?: boolean }) => {
    const isLinkedQuote = isUuid(task.quoteId);
    const partyLabel = getTaskPartyLabel();
    const assigneeLabel = getMemberLabel(task.assigneeUserId);
    const deadlineBadge = getDeadlineBadge(task.designDeadline);
    return (
      <KanbanCard
        draggable={options?.draggable}
        onDragStart={
          options?.draggable ? (event) => startDraggingTask(event as React.DragEvent<HTMLDivElement>, task.id) : undefined
        }
        onDragEnd={options?.draggable ? stopDraggingTask : undefined}
        onClick={() => {
          if (suppressCardClick) return;
          openTask(task.id);
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          if (suppressCardClick) return;
          openTask(task.id, true);
        }}
        onMouseDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.button === 0) {
            event.preventDefault();
            if (suppressCardClick) return;
            openTask(task.id, true);
          }
        }}
        className={cn(
          "kanban-estimate-card rounded-[18px] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/75 p-3 cursor-pointer transition-[border-color] duration-220 ease-out hover:border-foreground/24 dark:hover:border-foreground/22",
          draggingId === task.id && "ring-2 ring-primary/40"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-muted-foreground">{isLinkedQuote ? "Прорахунок" : "Задача"}</div>
            {isLinkedQuote ? (
              <button
                className="text-sm font-mono font-semibold hover:underline truncate"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/orders/estimates/${task.quoteId}`);
                }}
                title={task.quoteNumber ?? task.quoteId}
              >
                {task.quoteNumber ?? task.quoteId.slice(0, 8)}
              </button>
            ) : (
              <div className="text-sm font-semibold truncate" title={task.title ?? task.quoteId}>
                {task.title ?? task.quoteId.slice(0, 8)}
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem onClick={() => openTask(task.id, true)}>Відкрити в новій вкладці</DropdownMenuItem>
              <DropdownMenuSeparator />
              {canSelfAssign &&
              userId &&
              task.assigneeUserId &&
              (canManageAssignments || task.assigneeUserId === userId) ? (
                <DropdownMenuItem onClick={() => applyAssignee(task, userId)} disabled={task.assigneeUserId === userId}>
                  {task.assigneeUserId === userId ? "Призначено на мене" : "Призначити на мене"}
                </DropdownMenuItem>
              ) : null}
              {!task.assigneeUserId && canSelfAssign && userId ? (
                <DropdownMenuItem onClick={() => applyAssignee(task, userId)}>Взяти в роботу</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => requestReestimate(task)}>Оновити естімейт</DropdownMenuItem>
              {canManageAssignments ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Призначити дизайнеру</DropdownMenuLabel>
                  {designerMembers.length === 0 ? (
                    <DropdownMenuItem disabled>Немає дизайнерів</DropdownMenuItem>
                  ) : (
                    designerMembers.map((member) => (
                      <DropdownMenuItem
                        key={member.id}
                        onClick={() => applyAssignee(task, member.id)}
                        disabled={task.assigneeUserId === member.id}
                      >
                        {member.label}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuItem onClick={() => applyAssignee(task, null)} disabled={!task.assigneeUserId}>
                    Зняти виконавця
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              {DESIGN_COLUMNS.map((target) => (
                <DropdownMenuItem key={target.id} onClick={() => handleStatusChange(task, target.id)}>
                  {target.label}
                </DropdownMenuItem>
              ))}
              {canManageAssignments ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={deletingTaskId === task.id}
                    onClick={() => requestDeleteTask(task)}
                  >
                    {deletingTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Видалити задачу
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {task.title ? <div className="mt-2 text-sm font-medium line-clamp-2">{task.title}</div> : null}
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2.5 text-[15px] font-medium min-w-0">
            <EntityAvatar
              src={task.customerLogoUrl ?? null}
              name={task.customerName ?? "Клієнт / Лід"}
              fallback={getInitials(task.customerName)}
              size={32}
            />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                {partyLabel}
              </div>
              <div className="truncate text-[14px] font-semibold" title={task.customerName ?? "Не вказано"}>
                {task.customerName ?? "Не вказано"}
              </div>
            </div>
          </div>
        </div>
        {isLinkedQuote && task.productName ? (
          <div className="mt-3 rounded-[14px] border border-border/60 bg-background/35 px-3 py-2.5">
            <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Товар
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border border-border/60 bg-muted/25">
                {task.productImageUrl ? (
                  <img
                    src={task.productImageUrl}
                    alt={task.productName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground/60">
                    <Package className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium" title={task.productName}>
                  {task.productName}
                </div>
                {task.productQtyLabel ? (
                  <div className="text-[13px] font-normal text-muted-foreground">{task.productQtyLabel}</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <div className="flex items-center gap-2 min-w-0 text-[13px] text-muted-foreground">
            <AvatarBase
              src={task.assigneeUserId ? getMemberAvatar(task.assigneeUserId) : null}
              name={assigneeLabel}
              fallback={task.assigneeUserId ? getInitials(assigneeLabel) : "БВ"}
              size={26}
              className="text-[10px] font-semibold"
            />
            <span className="truncate font-medium text-foreground/90">{assigneeLabel}</span>
          </div>
          {task.designDeadline ? (
            (() => {
              const shortLabel = formatDeadlineShort(task.designDeadline);
              if (!shortLabel) return null;
              return <QuoteDeadlineBadge tone={deadlineBadge.tone} label={shortLabel} compact />;
            })()
          ) : null}
        </div>
        <div className="mt-2">
          {!task.assigneeUserId && canSelfAssign && userId ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 w-full text-xs"
              onClick={(event) => {
                event.stopPropagation();
                void applyAssignee(task, userId);
              }}
            >
              Взяти в роботу
            </Button>
          ) : null}
        </div>
      </KanbanCard>
    );
  };

  return (
    <section className="space-y-3">
      <PageHeader
        title="Дизайн"
        subtitle="Задачі на макети, правки та погодження."
        icon={<Palette className="h-5 w-5" />}
        actions={
          <Button size="lg" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Нова дизайн-задача
          </Button>
        }
      >
        <ActiveHereCard entries={workspacePresence.activeHereEntries} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={assignmentFilter === "mine" ? "secondary" : "outline"}
            onClick={() => setAssignmentFilter("mine")}
          >
            Мої
          </Button>
          <Button
            size="sm"
            variant={assignmentFilter === "all" ? "secondary" : "outline"}
            onClick={() => setAssignmentFilter("all")}
          >
            Всі
          </Button>
          <Button
            size="sm"
            variant={assignmentFilter === "unassigned" ? "secondary" : "outline"}
            onClick={() => setAssignmentFilter("unassigned")}
          >
            Без виконавця
          </Button>
          <Badge variant="outline" className="ml-1">
            {filteredTasks.length} задач
          </Badge>
          <div className="ml-auto flex items-center gap-1 rounded-md border border-border/60 bg-card/60 p-1">
            <Button size="sm" variant={viewMode === "kanban" ? "secondary" : "ghost"} onClick={() => setViewMode("kanban")}>
              Kanban
            </Button>
            <Button size="sm" variant={viewMode === "timeline" ? "secondary" : "ghost"} onClick={() => setViewMode("timeline")}>
              Timeline
            </Button>
            <Button size="sm" variant={viewMode === "assignee" ? "secondary" : "ghost"} onClick={() => setViewMode("assignee")}>
              По дизайнерах
            </Button>
          </div>
        </div>
      </PageHeader>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {viewMode === "kanban" ? (
        <KanbanBoard className="px-0 pb-0 pt-0" rowClassName="min-w-[1100px]">
            {DESIGN_COLUMNS.map((col) => {
              const items = grouped[col.id] ?? [];
              return (
                <KanbanColumn
                  key={col.id}
                  className={cn(
                    "kanban-column-surface basis-[320px] h-[calc(100dvh-17rem)] transition-colors",
                    `kanban-column-status-${col.id}`,
                    draggingId && "border-primary/35",
                    dropTargetStatus === col.id && "border-primary bg-primary/5"
                  )}
                  header={
                    <div className="kanban-column-header flex items-center justify-between gap-2 px-3.5 py-3 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {(() => {
                          const Icon = DESIGN_STATUS_ICON_BY_STATUS[col.id];
                          return <Icon className={cn("h-3.5 w-3.5 shrink-0", DESIGN_STATUS_ICON_COLOR_BY_STATUS[col.id])} />;
                        })()}
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                          {col.label}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/80">
                        {items.length}
                      </span>
                    </div>
                  }
                  bodyClassName="px-2.5 pb-3.5 pt-2.5 space-y-2"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dropTargetStatus !== col.id) setDropTargetStatus(col.id);
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (dropTargetStatus !== col.id) setDropTargetStatus(col.id);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDropTargetStatus((current) => (current === col.id ? null : current));
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropTargetStatus(null);
                    dropTaskToStatus(col.id);
                    stopDraggingTask();
                  }}
                >
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3 text-center">
                      Немає задач
                    </div>
                  ) : (
                    items.map((task) => renderTaskCard(task, { draggable: true }))
                  )}
                </KanbanColumn>
              );
            })}
        </KanbanBoard>
      ) : null}

      {viewMode === "timeline" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                <span className="h-2 w-2 rounded-full design-status-dot-cancelled" />
                Лінія сьогодні
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                <span className="h-2 w-2 rounded-full design-status-dot-client-review" />
                Ризик старту
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                <span className="h-2 w-2 rounded-full design-status-dot-cancelled" />
                Прострочено
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-card/70 p-1">
              <Button size="sm" variant={timelineZoom === "day" ? "secondary" : "ghost"} onClick={() => setTimelineZoom("day")}>
                День
              </Button>
              <Button size="sm" variant={timelineZoom === "week" ? "secondary" : "ghost"} onClick={() => setTimelineZoom("week")}>
                Тиждень
              </Button>
              <Button size="sm" variant={timelineZoom === "month" ? "secondary" : "ghost"} onClick={() => setTimelineZoom("month")}>
                Місяць
              </Button>
            </div>
          </div>
          {timelineData.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              Немає задач із дедлайном для Timeline.
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-card/60 overflow-auto">
              <div
                className="grid min-w-[980px]"
                style={{ gridTemplateColumns: `320px repeat(${timelineAxis.columnCount}, minmax(44px, 1fr))` }}
              >
                <div className="sticky left-0 z-20 border-b border-r border-border/50 bg-card/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Задача
                </div>
                {timelineAxis.columns.map((column, index) => (
                  <div
                    key={`timeline-head-${column.start.toISOString()}-${index}`}
                    className="border-b border-r border-border/40 px-1 py-2 text-center text-[11px] text-muted-foreground bg-card/80"
                  >
                    {timelineZoom === "day" ? (
                      <>
                        <div className="font-medium text-foreground">
                          {column.start.toLocaleDateString("uk-UA", { day: "2-digit" })}
                        </div>
                        <div>{column.start.toLocaleDateString("uk-UA", { month: "short" })}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-foreground">
                          {column.start.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}
                        </div>
                        <div>{column.end.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}</div>
                      </>
                    )}
                  </div>
                ))}

                {timelineData.rows.map((row) => {
                  const statusLabel = DESIGN_COLUMNS.find((col) => col.id === row.task.status)?.label ?? row.task.status;
                  const offsetUnits = row.offset / timelineAxis.bucketSize;
                  const spanUnits = Math.max(timelineZoom === "day" ? 1 : 0.6, row.span / timelineAxis.bucketSize);
                  const barLeft = `calc(${offsetUnits} * (100% / ${timelineAxis.columnCount}))`;
                  const barWidth = `calc(${spanUnits} * (100% / ${timelineAxis.columnCount}))`;
                  const progressRatio = TIMELINE_PROGRESS_BY_STATUS[row.task.status] ?? 0;
                  const progressWidth = `calc(${spanUnits * progressRatio} * (100% / ${timelineAxis.columnCount}))`;
                  const barTitle = [
                    `${isUuid(row.task.quoteId) ? "Прорахунок" : "Задача"}: ${
                      isUuid(row.task.quoteId) ? row.task.quoteNumber ?? row.task.quoteId.slice(0, 8) : row.task.title ?? row.task.quoteId.slice(0, 8)
                    }`,
                    `Статус: ${statusLabel}`,
                    `Естімейт: ${row.hasEstimate ? formatEstimateMinutes(row.estimateMinutes) : "немає"}`,
                    `Витрачено: ${formatElapsedSeconds(getTaskTrackedSeconds(row.task.id))}`,
                    `Дедлайн: ${row.end.toLocaleDateString("uk-UA")}`,
                  ].join(" • ");
                  return (
                    <div key={row.task.id} className="contents">
                      <button
                        className="sticky left-0 z-10 border-b border-r border-border/40 bg-card/95 px-3 py-2 text-left hover:bg-muted/20"
                        onClick={() => openTask(row.task.id)}
                        onAuxClick={(event) => {
                          if (event.button !== 1) return;
                          event.preventDefault();
                          openTask(row.task.id, true);
                        }}
                        onMouseDown={(event) => {
                          if ((event.metaKey || event.ctrlKey) && event.button === 0) {
                            event.preventDefault();
                            openTask(row.task.id, true);
                          }
                        }}
                      >
                        <div className="truncate text-sm font-medium">
                          {isUuid(row.task.quoteId)
                            ? row.task.quoteNumber ?? row.task.quoteId.slice(0, 8)
                            : row.task.title ?? row.task.quoteId.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{row.task.customerName ?? "Не вказано"}</span>
                          {isUuid(row.task.quoteId) ? (
                            <>
                              <span>·</span>
                              <span className="truncate">Товар: {row.task.productName ?? "Не вказано"}</span>
                            </>
                          ) : null}
                          <span>·</span>
                          <span>{statusLabel}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <AvatarBase
                              src={getMemberAvatar(row.task.assigneeUserId)}
                              name={getMemberLabel(row.task.assigneeUserId)}
                              fallback={getInitials(getMemberLabel(row.task.assigneeUserId))}
                              size={14}
                              className="shrink-0 border-border/70"
                            />
                            <span className="truncate">{getMemberLabel(row.task.assigneeUserId)}</span>
                          </span>
                          <span>·</span>
                          <span>{row.hasEstimate ? formatEstimateMinutes(row.estimateMinutes) : "Без естімейту"}</span>
                          <span>·</span>
                          <span>{formatElapsedSeconds(getTaskTrackedSeconds(row.task.id))}</span>
                        </div>
                      </button>
                      <div
                        className="relative border-b border-border/40"
                        style={{ gridColumn: `2 / span ${timelineAxis.columnCount}` }}
                      >
                        <div
                          className="absolute inset-y-0 border-l border-danger-soft-border pointer-events-none"
                          style={{ left: `calc(${timelineData.todayOffset / timelineAxis.bucketSize} * (100% / ${timelineAxis.columnCount}))` }}
                        />
                        <div className="absolute inset-y-2 left-0 right-0">
                          <div className="relative h-full">
                            <div
                              className={cn(
                                "absolute top-1/2 -translate-y-1/2 h-6 rounded-md border",
                                row.hasEstimate ? (TIMELINE_BAR_CLASS_BY_STATUS[row.task.status] ?? "bg-primary/20 border-primary/40") : "bg-transparent border-border/70 border-dashed",
                                row.isStartRisk && "ring-2 ring-warning-soft-border",
                                row.isOverdue && "ring-2 ring-danger-soft-border"
                              )}
                              title={barTitle}
                              style={{
                                left: barLeft,
                                width: barWidth,
                              }}
                            />
                            {row.hasEstimate ? (
                              <div
                                className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md bg-foreground/20"
                                style={{
                                  left: barLeft,
                                  width: progressWidth,
                                }}
                              />
                            ) : null}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 px-2 text-[10px] font-medium text-foreground/95 truncate pointer-events-none"
                              style={{
                                left: barLeft,
                                width: barWidth,
                              }}
                            >
                              {row.hasEstimate
                                ? `${formatEstimateMinutes(row.estimateMinutes)} · до ${row.end.toLocaleDateString("uk-UA", {
                                    day: "2-digit",
                                    month: "short",
                                  })}`
                                : `Без естімейту · до ${row.end.toLocaleDateString("uk-UA", {
                                    day: "2-digit",
                                    month: "short",
                                  })}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {timelineData.noDeadlineTasks.length > 0 ? (
            <div className="rounded-lg border border-border/60 bg-card/60">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                <div className="text-sm font-semibold">Без дедлайну</div>
                <Badge variant="secondary">{timelineData.noDeadlineTasks.length}</Badge>
              </div>
              <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {timelineData.noDeadlineTasks.map((task) => renderTaskCard(task))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {viewMode === "assignee" ? (
        <div className="space-y-3">
          {assigneeGrouped.length === 0 ? (
            <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3 text-center">
              Немає задач
            </div>
          ) : (
            assigneeGrouped.map((group) => (
              <div key={group.id ?? "unassigned"} className="rounded-lg border border-border/60 bg-card/60">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 min-w-0">
                      {group.id ? (
                        <AvatarBase
                          src={group.id ? getMemberAvatar(group.id) : null}
                          name={group.label}
                          fallback={getInitials(group.label)}
                          size={16}
                          className="shrink-0 border-border/70"
                        />
                      ) : null}
                      <div className="text-sm font-semibold truncate">{group.label}</div>
                    </div>
                    <Badge variant="outline" className="text-[11px]">
                      {formatEstimateMinutes(group.estimateMinutesTotal)}
                    </Badge>
                    {group.tasksWithoutEstimate > 0 ? (
                      <Badge variant="outline" className="text-[11px] border-warning-soft-border bg-warning-soft text-warning-foreground">
                        Без естімейту: {group.tasksWithoutEstimate}
                      </Badge>
                    ) : null}
                  </div>
                  <Badge variant="secondary">{group.tasks.length}</Badge>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[1.2fr_1.1fr_0.9fr_0.9fr_0.7fr_0.8fr] gap-2 border-b border-border/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <div>Задача</div>
                      <div>Клієнт</div>
                      <div>Статус</div>
                      <div>Дедлайн</div>
                      <div>Естімейт / Час</div>
                      <div className="text-right">Дії</div>
                    </div>
                    {group.tasks.map((task) => {
                      const isLinkedQuote = isUuid(task.quoteId);
                      const statusLabel = DESIGN_COLUMNS.find((col) => col.id === task.status)?.label ?? task.status;
                      const deadlineDate = task.designDeadline ? new Date(task.designDeadline) : null;
                      const hasValidDeadline = !!deadlineDate && !Number.isNaN(deadlineDate.getTime());
                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[1.2fr_1.1fr_0.9fr_0.9fr_0.7fr_0.8fr] gap-2 px-3 py-2.5 text-sm border-b border-border/30 last:border-b-0 hover:bg-muted/20"
                        >
                          <button
                            className="text-left min-w-0"
                            onClick={() => openTask(task.id)}
                            onAuxClick={(event) => {
                              if (event.button !== 1) return;
                              event.preventDefault();
                              openTask(task.id, true);
                            }}
                            onMouseDown={(event) => {
                              if ((event.metaKey || event.ctrlKey) && event.button === 0) {
                                event.preventDefault();
                                openTask(task.id, true);
                              }
                            }}
                            title={task.title ?? task.quoteNumber ?? task.quoteId}
                          >
                            <div className="font-medium truncate">
                              {isLinkedQuote
                                ? task.quoteNumber ?? task.quoteId.slice(0, 8)
                                : task.title ?? task.quoteId.slice(0, 8)}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {isLinkedQuote ? `Товар: ${task.productName ?? "Не вказано"}` : "Standalone"}
                            </div>
                          </button>
                          <div className="truncate">{task.customerName ?? "Не вказано"}</div>
                          <div>
                            <Badge
                              variant="outline"
                              className={cn("text-[11px]", STATUS_BADGE_CLASS_BY_STATUS[task.status])}
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground">
                            {hasValidDeadline ? (
                              deadlineDate.toLocaleDateString("uk-UA", { day: "numeric", month: "short" })
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-border/50 px-2 py-0.5 text-[11px]">
                                Без дедлайну
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground">
                            <div>{formatEstimateMinutes(getTaskEstimateMinutes(task))}</div>
                            <div className="text-[11px] text-foreground/80">{formatElapsedSeconds(getTaskTrackedSeconds(task.id))}</div>
                          </div>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/design/${task.id}`)}>
                                  Відкрити
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/design/${task.id}`)}>
                                  Редагувати
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => requestReestimate(task)}>
                                  Оновити естімейт
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {DESIGN_COLUMNS.map((target) => (
                                  <DropdownMenuItem key={target.id} onClick={() => handleStatusChange(task, target.id)}>
                                    Статус: {target.label}
                                  </DropdownMenuItem>
                                ))}
                                {canManageAssignments ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      disabled={deletingTaskId === task.id}
                                      onClick={() => requestDeleteTask(task)}
                                    >
                                      {deletingTaskId === task.id ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                      )}
                                      Видалити
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      <Dialog
        open={estimateDialogOpen}
        onOpenChange={(open) => {
          setEstimateDialogOpen(open);
          if (!open) {
            setEstimateError(null);
            setEstimateReason("");
            setEstimatePendingAction(null);
          }
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Вкажіть естімейт задачі</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="design-estimate-value">Естімейт</Label>
            <div className="grid grid-cols-[1fr_150px] gap-2">
              <Input
                id="design-estimate-value"
                type="number"
                min={0.25}
                step={0.25}
                value={estimateInput}
                onChange={(event) => setEstimateInput(event.target.value)}
                placeholder="Напр. 2"
              />
              <Select value={estimateUnit} onValueChange={(value) => setEstimateUnit(value as "minutes" | "hours" | "days")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Хвилини</SelectItem>
                  <SelectItem value="hours">Години</SelectItem>
                  <SelectItem value="days">Дні</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Без естімейту не можна призначити виконавця або перевести задачу у «В роботі». 1 день = 8 годин.
            </div>
            {estimatePendingAction?.mode === "reestimate" ? (
              <div className="space-y-1.5">
                <Label htmlFor="design-estimate-reason">Причина зміни</Label>
                <Textarea
                  id="design-estimate-reason"
                  value={estimateReason}
                  onChange={(event) => setEstimateReason(event.target.value)}
                  className="min-h-[90px]"
                  placeholder="Чому змінюємо естімейт?"
                />
              </div>
            ) : null}
            {estimateError ? <div className="text-sm text-destructive">{estimateError}</div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstimateDialogOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void submitEstimateDialog()}>Зберегти естімейт</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(loading || membersLoading) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loading ? "Завантаження задач..." : "Завантаження учасників..."}
        </div>
      )}

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setCreateError(null);
            setCreateSaving(false);
            setCreateCustomerPopoverOpen(false);
            setCreateAssigneePopoverOpen(false);
            setCreateManagerPopoverOpen(false);
            setCreateDeadlinePopoverOpen(false);
            setCreateFilesDragActive(false);
          }
        }}
      >
        <DialogContent className="max-w-[640px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Нова дизайн-задача (без прорахунку)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 max-h-[calc(85vh-170px)]">
            <div className="space-y-2">
              <Label htmlFor="standalone-design-title">Назва задачі</Label>
              <Input
                id="standalone-design-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                placeholder="Напр. Розробити брендбук / Пост для Instagram"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover
                open={createCustomerPopoverOpen}
                onOpenChange={(open) => {
                  setCreateCustomerPopoverOpen(open);
                  if (open) setCreateCustomerSearch(createCustomer || "");
                }}
              >
                <PopoverTrigger asChild>
                  <Chip size="md" icon={<Building2 className="h-4 w-4" />} active={!!createCustomer.trim()}>
                    {createCustomer.trim() || "Клієнт"}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-2" align="start">
                  <div className="space-y-2">
                    <Input
                      value={createCustomerSearch}
                      onChange={(event) => setCreateCustomerSearch(event.target.value)}
                      placeholder="Пошук клієнта..."
                      className="h-9"
                    />
                    <div className="max-h-56 overflow-auto space-y-1">
                      {customersLoading ? (
                        <div className="text-xs text-muted-foreground p-2">Завантаження...</div>
                      ) : filteredCustomerOptions.length > 0 ? (
                        filteredCustomerOptions.map((customer) => (
                          <Button
                            key={customer.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2 h-9 text-sm"
                            onClick={() => {
                              setCreateCustomer(customer.label);
                              setCreateCustomerSearch(customer.label);
                              setCreateCustomerPopoverOpen(false);
                            }}
                            title={customer.label}
                          >
                            <span className="truncate">{customer.label}</span>
                            <Check
                              className={cn(
                                "ml-auto h-3.5 w-3.5 text-primary",
                                createCustomer.trim() === customer.label ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </Button>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground p-2">Клієнтів не знайдено</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        disabled={!createCustomerSearch.trim()}
                        onClick={() => {
                          const manualName = createCustomerSearch.trim();
                          if (!manualName) return;
                          setCreateCustomer(manualName);
                          setCreateCustomerPopoverOpen(false);
                        }}
                      >
                        Використати: {createCustomerSearch.trim() || "назву"}
                      </Button>
                      {createCustomer.trim() ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-muted-foreground"
                          onClick={() => {
                            setCreateCustomer("");
                            setCreateCustomerSearch("");
                            setCreateCustomerPopoverOpen(false);
                          }}
                        >
                          Очистити
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={createDeadlinePopoverOpen} onOpenChange={setCreateDeadlinePopoverOpen}>
                <PopoverTrigger asChild>
                  <Chip size="md" icon={<CalendarIcon className="h-4 w-4" />} active={!!createDeadline}>
                    {createDeadline ? format(createDeadline, "d MMM yyyy", { locale: uk }) : "Дедлайн"}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={createDeadline}
                    onSelect={(date) => {
                      setCreateDeadline(date);
                      setCreateDeadlinePopoverOpen(false);
                    }}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 3}
                    toYear={new Date().getFullYear() + 5}
                    initialFocus
                  />
                  <DateQuickActions
                    onSelect={(date) => {
                      setCreateDeadline(date ?? undefined);
                      setCreateDeadlinePopoverOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Popover open={createManagerPopoverOpen} onOpenChange={setCreateManagerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Chip
                    size="md"
                    icon={
                      selectedManager ? (
                        <AvatarBase
                          src={selectedManager.avatarUrl ?? null}
                          name={selectedManager.label}
                          fallback={getInitials(selectedManager.label)}
                          size={20}
                          className="border-border/60"
                          fallbackClassName="text-[10px] font-semibold"
                        />
                      ) : (
                        <User className="h-4 w-4" />
                      )
                    }
                    active={createManagerUserId !== "none"}
                  >
                    {selectedManager?.label ?? "Менеджер"}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="space-y-1">
                    {managerMembers.length > 0 ? (
                      managerMembers.map((member) => (
                        <Button
                          key={member.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 h-9 text-sm"
                          onClick={() => {
                            setCreateManagerUserId(member.id);
                            setCreateManagerPopoverOpen(false);
                          }}
                          title={member.label}
                        >
                          <AvatarBase
                            src={member.avatarUrl ?? null}
                            name={member.label}
                            fallback={getInitials(member.label)}
                            size={20}
                            className="border-border/60 shrink-0"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <span className="truncate">{member.label}</span>
                          <Check
                            className={cn(
                              "ml-auto h-3.5 w-3.5 text-primary",
                              createManagerUserId === member.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </Button>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground p-2">Немає менеджерів</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={createAssigneePopoverOpen} onOpenChange={setCreateAssigneePopoverOpen}>
                <PopoverTrigger asChild>
                  <Chip
                    size="md"
                    icon={
                      selectedAssignee ? (
                        <AvatarBase
                          src={selectedAssignee.avatarUrl ?? null}
                          name={selectedAssignee.label}
                          fallback={getInitials(selectedAssignee.label)}
                          size={20}
                          className="border-border/60"
                          fallbackClassName="text-[10px] font-semibold"
                        />
                      ) : (
                        <User className="h-4 w-4" />
                      )
                    }
                    active={createAssigneeUserId !== "none"}
                  >
                    {selectedAssignee?.label ?? "Виконавець"}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="space-y-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 h-9 text-sm"
                      onClick={() => {
                        setCreateAssigneeUserId("none");
                        setCreateAssigneePopoverOpen(false);
                      }}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      Без виконавця
                      <Check
                        className={cn(
                          "ml-auto h-3.5 w-3.5 text-primary",
                          createAssigneeUserId === "none" ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </Button>
                    {designerMembers.length > 0 ? (
                      designerMembers.map((member) => (
                        <Button
                          key={member.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 h-9 text-sm"
                          onClick={() => {
                            setCreateAssigneeUserId(member.id);
                            setCreateAssigneePopoverOpen(false);
                          }}
                          title={member.label}
                        >
                          <AvatarBase
                            src={member.avatarUrl ?? null}
                            name={member.label}
                            fallback={getInitials(member.label)}
                            size={20}
                            className="border-border/60 shrink-0"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <span className="truncate">{member.label}</span>
                          <Check
                            className={cn(
                              "ml-auto h-3.5 w-3.5 text-primary",
                              createAssigneeUserId === member.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </Button>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground p-2">Немає користувачів</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="standalone-design-brief">ТЗ для дизайнера</Label>
              <Textarea
                id="standalone-design-brief"
                value={createBrief}
                onChange={(event) => setCreateBrief(event.target.value)}
                className="min-h-[140px]"
                placeholder="Опишіть задачу: ціль, референси, формат, текст, обмеження."
              />
            </div>
            <div className="space-y-2">
              <Label>Файли / картинки</Label>
              <div
                onDrop={(event) => {
                  event.preventDefault();
                  setCreateFilesDragActive(false);
                  addFilesToCreate(event.dataTransfer.files);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!createFilesDragActive) setCreateFilesDragActive(true);
                }}
                onDragLeave={() => setCreateFilesDragActive(false)}
                className={cn(
                  "relative border-2 border-dashed rounded-[var(--radius-md)] p-6 text-center transition-colors cursor-pointer",
                  createFilesDragActive
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/40 hover:border-border/60"
                )}
              >
                <input
                  type="file"
                  multiple
                  onChange={(event) => addFilesToCreate(event.target.files)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept="*/*"
                />
                <div className="flex flex-col items-center gap-2">
                  <Paperclip className={cn("h-5 w-5", createFilesDragActive ? "text-primary" : "text-muted-foreground")} />
                  <div className={cn("text-sm", createFilesDragActive ? "text-primary font-medium" : "text-foreground")}>
                    {createFilesDragActive ? "Відпустіть файли тут" : "Перетягніть або клікніть для вибору"}
                  </div>
                  <div className="text-xs text-muted-foreground">до {MAX_BRIEF_FILES} файлів</div>
                </div>
              </div>
              {createFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {createFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/20 border border-border/30 text-sm"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="text-xs">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeCreateFile(index)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {createError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={createSaving}>
              Скасувати
            </Button>
            <Button onClick={() => void createStandaloneTask()} disabled={createSaving} className="gap-2">
              {createSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {createSaving ? "Створення..." : "Створити задачу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!taskToDelete}
        onOpenChange={(open) => {
          if (!open) setTaskToDelete(null);
        }}
        title="Видалити дизайн-задачу?"
        description={
          taskToDelete
            ? isUuid(taskToDelete.quoteId)
              ? `Задача по прорахунку ${taskToDelete.quoteNumber ?? taskToDelete.quoteId.slice(0, 8)} буде видалена без можливості відновлення.`
              : `Дизайн-задача «${taskToDelete.title ?? taskToDelete.quoteId.slice(0, 8)}» буде видалена без можливості відновлення.`
            : undefined
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={!!deletingTaskId}
        onConfirm={() => void handleDeleteTask()}
      />
    </section>
  );
}
