import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { InlineLoading } from "@/components/app/loading-primitives";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Loader2, CheckCircle2, Paperclip, MoreVertical, Trash2, Plus, User, Calendar as CalendarIcon, Check, RefreshCw, PlayCircle, ShieldCheck, Hourglass, XCircle, Package, Link2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { DesignTaskRenameDialog } from "@/components/app/DesignTaskRenameDialog";
import { resolveWorkspaceId } from "@/lib/workspace";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import {
  canChangeDesignStatus,
  getDesignStatusActionLabel,
  DESIGN_STATUS_LABELS,
  type DesignStatus,
} from "@/lib/designTaskStatus";
import { notifyQuoteInitiatorOnDesignStatusChange } from "@/lib/workflowNotifications";
import {
  formatElapsedSeconds,
  getDesignTasksTimerSummaryMap,
  pauseDesignTaskTimer,
  type DesignTaskTimerSummary,
} from "@/lib/designTaskTimer";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ActiveHereCard } from "@/components/app/workspace-presence-widgets";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanImageZoomPreview } from "@/components/kanban";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
  TOOLBAR_CONTROL,
} from "@/components/ui/controlStyles";
import {
  CustomerLeadPicker,
  type CreatedCustomerLead,
  type CustomerLeadOption,
  getCreatedCustomerLeadLabel,
  toCustomerLeadOption,
  upsertByIdAndEntityType,
  useCustomerLeadCreate,
} from "@/components/customers";
import { QuoteDeadlineBadge } from "@/features/quotes/components/QuoteDeadlineBadge";
import { EstimatesKanbanCanvas } from "@/features/quotes/components/EstimatesKanbanCanvas";
import { buildUserNameFromMetadata, formatUserShortName } from "@/lib/userName";
import { getCanonicalAvatarReference } from "@/lib/avatarUrl";
import { removeAttachmentWithVariants, uploadAttachmentWithVariants } from "@/lib/attachmentPreview";
import { isQuoteManagerJobRole } from "@/lib/permissions";
import { normalizeTeamAvailabilityStatus } from "@/lib/teamAvailability";
import { formatDesignTaskNumber, getDesignTaskMonthCode, getNextDesignTaskNumber } from "@/lib/designTaskNumber";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  DESIGN_TASK_TYPE_OPTIONS,
  parseDesignTaskType,
  type DesignTaskType,
} from "@/lib/designTaskType";
import { calculateDesignWorkload, getDesignTaskEstimateMinutes } from "@/lib/designWorkload";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { listCatalogModelsByIds, listCustomersBySearch, listLeadsBySearch, type LeadSearchRow } from "@/lib/toshoApi";
import {
  listCustomerLeadLogoDirectory,
  normalizeCustomerLogoUrl as normalizeLogoUrl,
  type CustomerLeadLogoDirectoryEntry,
} from "@/lib/customerLogo";
import { toast } from "sonner";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { AlertTriangle, CalendarRange, Clock3, FilterX, Gauge, LayoutGrid, Layers3, Search, Target, Users, X } from "lucide-react";

type DesignTask = {
  id: string;
  quoteId: string;
  title: string | null;
  status: DesignStatus;
  designTaskType?: DesignTaskType | null;
  assigneeUserId?: string | null;
  quoteManagerUserId?: string | null;
  customerId?: string | null;
  customerType?: "customer" | "lead" | null;
  assignedAt?: string | null;
  metadata?: Record<string, unknown>;
  methodsCount?: number;
  hasFiles?: boolean;
  designDeadline?: string | null;
  designTaskNumber?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  partyType?: "customer" | "lead" | null;
  productName?: string | null;
  productImageUrl?: string | null;
  productZoomImageUrl?: string | null;
  productQtyLabel?: string | null;
  assigneeLabel?: string | null;
  assigneeAvatarUrl?: string | null;
  createdAt?: string | null;
};

type DesignTaskActivityRow = {
  id: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  title: string | null;
  created_at: string;
};

type CustomerOption = CustomerLeadOption;

type DesignViewMode = "kanban" | "timeline" | "assignee";
type DesignContentView = "all" | "linked" | "standalone";
type DesignCompletedPeriod = "7d" | "30d" | "month" | "quarter";

const ALL_DESIGNERS_FILTER = "__all__";
const NO_DESIGNER_FILTER = "__none__";
const ALL_MANAGERS_FILTER = "__all__";
const ALL_ASSIGNEE_SPOTLIGHT = "__all_assignees__";
const DESIGN_LIST_PAGE_SIZE = 50;
const DESIGN_LIST_PAGE_INCREMENT = 50;
const DESIGN_KANBAN_INITIAL_PAGE_SIZE = 120;
const DESIGN_KANBAN_PAGE_INCREMENT = 60;
const DESIGN_SEARCH_FETCH_PAGE_SIZE = 500;
const DESIGN_PAGE_CACHE_LIMIT = DESIGN_KANBAN_INITIAL_PAGE_SIZE;
const KANBAN_AUTOLOAD_THRESHOLD_PX = 180;
const KANBAN_AUTOLOAD_LOCK_MS = 1200;
type DesignPageCachePayload = {
  tasks: DesignTask[];
  cachedAt: number;
};

type DesignMemberCachePayload = {
  memberById: Record<string, string>;
  memberAvatarById: Record<string, string | null>;
  managerMembers: Array<{ id: string; label: string; avatarUrl?: string | null }>;
  designerMembers: Array<{ id: string; label: string; avatarUrl?: string | null }>;
  cachedAt: number;
};

type DesignCustomerLogoCachePayload = {
  entries: CustomerLeadLogoDirectoryEntry[];
  cachedAt: number;
};

type DesignPageFiltersState = {
  contentView?: DesignContentView;
  viewMode?: DesignViewMode;
  search?: string;
  statusFilter?: DesignStatus | "all";
  designerFilter?: string;
  managerFilter?: string;
  timelineZoom?: "day" | "week" | "month";
  assigneeSpotlight?: string;
  completedPeriod?: DesignCompletedPeriod;
  cachedAt?: number;
};

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
    normalizedJob === "seo" ||
    normalizedJob === "manager" ||
    normalizedJob === "менеджер"
  );
};

const isUuid = (value?: string | null) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function collectDesignTaskStorageFiles(metadata: Record<string, unknown> | null | undefined) {
  const collected = new Map<string, { bucket: string; path: string }>();

  const pushFile = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const bucket =
      typeof (value as { storage_bucket?: unknown }).storage_bucket === "string"
        ? (value as { storage_bucket: string }).storage_bucket
        : null;
    const path =
      typeof (value as { storage_path?: unknown }).storage_path === "string"
        ? (value as { storage_path: string }).storage_path
        : null;
    if (!bucket || !path) return;
    collected.set(`${bucket}:${path}`, { bucket, path });
  };

  const standaloneBriefFiles = Array.isArray(metadata?.standalone_brief_files) ? metadata.standalone_brief_files : [];
  const designOutputFiles = Array.isArray(metadata?.design_output_files) ? metadata.design_output_files : [];

  standaloneBriefFiles.forEach(pushFile);
  designOutputFiles.forEach(pushFile);
  pushFile({
    storage_bucket: metadata?.selected_design_output_storage_bucket,
    storage_path: metadata?.selected_design_output_storage_path,
  });
  pushFile({
    storage_bucket: metadata?.selected_visual_output_storage_bucket,
    storage_path: metadata?.selected_visual_output_storage_path,
  });
  pushFile({
    storage_bucket: metadata?.selected_layout_output_storage_bucket,
    storage_path: metadata?.selected_layout_output_storage_path,
  });

  return Array.from(collected.values());
}

const buildDerivedDesignTaskNumberMap = (tasks: Array<{ id: string; createdAt?: string | null; designTaskNumber?: string | null }>) => {
  const counters = new Map<string, number>();
  const map = new Map<string, string>();
  const sorted = [...tasks].sort((a, b) => {
    const aTime = new Date(a.createdAt ?? 0).getTime();
    const bTime = new Date(b.createdAt ?? 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });
  sorted.forEach((task) => {
    if (task.designTaskNumber && !/^DZ-/i.test(task.designTaskNumber)) {
      map.set(task.id, task.designTaskNumber);
      return;
    }
    const monthCode = getDesignTaskMonthCode(task.createdAt ?? null);
    const next = (counters.get(monthCode) ?? 0) + 1;
    counters.set(monthCode, next);
    map.set(task.id, formatDesignTaskNumber(monthCode, next));
  });
  return map;
};

const DESIGN_COLUMNS: { id: DesignStatus; label: string }[] = [
  { id: "new", label: DESIGN_STATUS_LABELS.new },
  { id: "changes", label: DESIGN_STATUS_LABELS.changes },
  { id: "in_progress", label: DESIGN_STATUS_LABELS.in_progress },
  { id: "pm_review", label: DESIGN_STATUS_LABELS.pm_review },
  { id: "client_review", label: DESIGN_STATUS_LABELS.client_review },
  { id: "approved", label: DESIGN_STATUS_LABELS.approved },
  { id: "cancelled", label: DESIGN_STATUS_LABELS.cancelled },
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
const DESIGN_FILES_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";
const STORAGE_CACHE_CONTROL = "31536000, immutable";

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

const formatHoursLoad = (minutes?: number | null) => {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return "0 год";
  const hours = minutes / 60;
  return `${hours.toLocaleString("uk-UA", {
    minimumFractionDigits: hours >= 10 || Number.isInteger(hours) ? 0 : 1,
    maximumFractionDigits: 1,
  })} год`;
};

const getWorkloadLevel = (taskCount: number, estimateMinutes: number) => {
  if (estimateMinutes >= 2400 || taskCount >= 8) return "overloaded" as const;
  if (estimateMinutes >= 1200 || taskCount >= 5) return "busy" as const;
  if (estimateMinutes >= 360 || taskCount >= 2) return "balanced" as const;
  return "calm" as const;
};

const WORKLOAD_LABEL_BY_LEVEL = {
  calm: "Спокійно",
  balanced: "Норма",
  busy: "Щільно",
  overloaded: "Перевантаження",
} as const;

const WORKLOAD_BADGE_CLASS_BY_LEVEL = {
  calm: "border-border/60 bg-background/80 text-muted-foreground",
  balanced: "border-info-soft-border bg-info-soft text-info-foreground",
  busy: "border-warning-soft-border bg-warning-soft text-warning-foreground",
  overloaded: "border-danger-soft-border bg-danger-soft text-danger-foreground",
} as const;

const WORKLOAD_PROGRESS_CLASS_BY_LEVEL = {
  calm: "bg-foreground/15",
  balanced: "bg-info-foreground/75",
  busy: "bg-warning-foreground/80",
  overloaded: "bg-danger-foreground/80",
} as const;

const CAPACITY_BADGE_CLASS_BY_LEVEL = {
  low: "border-success-soft-border bg-success-soft text-success-foreground",
  medium: "border-info-soft-border bg-info-soft text-info-foreground",
  high: "border-warning-soft-border bg-warning-soft text-warning-foreground",
  critical: "border-danger-soft-border bg-danger-soft text-danger-foreground",
} as const;

const CAPACITY_LABEL_BY_LEVEL = {
  low: "Низьке",
  medium: "Середнє",
  high: "Високе",
  critical: "Перевантаження",
} as const;

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
  const resolveRawMessage = () => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "object" && error !== null) {
      const record = error as Record<string, unknown>;
      if (typeof record.message === "string" && record.message) return record.message;
    }
    return fallback;
  };
  const message = resolveRawMessage();
  const normalized = message.toLowerCase();
  if (normalized.includes("quota has been exceeded") || normalized.includes("quota exceeded")) {
    return "Тимчасово перевищено ліміт запитів. Спробуйте оновити сторінку трохи пізніше.";
  }
  if (normalized.includes("rate limit")) {
    return "Забагато запитів за короткий час. Спробуйте ще раз трохи пізніше.";
  }
  return message;
};

const getTaskPartyLabel = () => "Замовник";

const isTaskAttachedFromStandalone = (task: DesignTask) => {
  const source = typeof task.metadata?.source === "string" ? task.metadata.source.trim() : "";
  const attachedQuoteAt =
    typeof task.metadata?.attached_quote_at === "string" ? task.metadata.attached_quote_at.trim() : "";
  return source === "design_task_created_manual" || !!attachedQuoteAt;
};

const parseDateOnly = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(value);
};

const sanitizeImageReference = (value?: string | null) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (
    lower.includes("/rest/v1/") ||
    lower.includes("?select=") ||
    lower.includes("&select=") ||
    lower.includes("status=eq.") ||
    lower.includes("order=") ||
    lower.includes("&limit=")
  ) {
    return null;
  }
  return normalized;
};

const LOAD_TASKS_RESOURCE_COOLDOWN_MS = 30_000;
const DESIGN_PAGE_CACHE_FRESH_MS = 5 * 60 * 1000;
const DESIGN_PAGE_BACKGROUND_REFRESH_DELAY_MS = 1200;

const isResourceExhaustionLikeError = (error: unknown) => {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("insufficient resources") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
};

function readDesignPageCache(teamId: string): DesignPageCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`design-page-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignPageCachePayload;
    if (!Array.isArray(parsed.tasks)) return null;
    return {
      tasks: parsed.tasks,
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function readDesignPageFiltersState(teamId: string): DesignPageFiltersState | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`design-page-filters:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignPageFiltersState;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
      cachedAt: Number(parsed.cachedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function readDesignCustomerLogoCache(teamId: string): DesignCustomerLogoCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`design-customer-logo-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignCustomerLogoCachePayload;
    if (!Array.isArray(parsed.entries)) return null;
    return {
      entries: parsed.entries,
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function readDesignMemberCache(teamId: string): DesignMemberCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`design-member-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignMemberCachePayload;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      memberById: typeof parsed.memberById === "object" && parsed.memberById ? parsed.memberById : {},
      memberAvatarById:
        typeof parsed.memberAvatarById === "object" && parsed.memberAvatarById ? parsed.memberAvatarById : {},
      managerMembers: Array.isArray(parsed.managerMembers) ? parsed.managerMembers : [],
      designerMembers: Array.isArray(parsed.designerMembers) ? parsed.designerMembers : [],
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function writeDesignSessionCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore cache persistence failures
  }
}

function sanitizeDesignTaskMetadataForCache(metadata: DesignTask["metadata"]): DesignTask["metadata"] {
  if (!metadata || typeof metadata !== "object") return undefined;
  const next: Record<string, unknown> = {};
  const stringKeys = [
    "source",
    "status",
    "design_task_number",
    "quote_id",
    "quote_number",
    "assignee_user_id",
    "assigned_at",
    "manager_user_id",
    "customer_id",
    "customer_name",
    "customer_logo_url",
    "design_task_type",
    "design_deadline",
    "deadline",
    "product_name",
    "quote_item_name",
    "item_name",
  ] as const;
  stringKeys.forEach((key) => {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value.trim();
    }
  });
  if (metadata.customer_type === "customer" || metadata.customer_type === "lead") {
    next.customer_type = metadata.customer_type;
  }
  if (typeof metadata.methods_count === "number") {
    next.methods_count = metadata.methods_count;
  }
  if (typeof metadata.has_files === "boolean") {
    next.has_files = metadata.has_files;
  }
  return next;
}

function sanitizeDesignTaskForCache(task: DesignTask): DesignTask {
  return {
    id: task.id,
    title: task.title ?? null,
    status: task.status,
    quoteId: task.quoteId,
    quoteNumber: task.quoteNumber ?? null,
    customerName: task.customerName ?? null,
    customerLogoUrl: task.customerLogoUrl ?? null,
    quoteManagerUserId: task.quoteManagerUserId ?? null,
    assigneeUserId: task.assigneeUserId ?? null,
    assignedAt: task.assignedAt ?? null,
    metadata: sanitizeDesignTaskMetadataForCache(task.metadata),
    methodsCount: task.methodsCount ?? 0,
    hasFiles: task.hasFiles ?? false,
    designDeadline: task.designDeadline ?? null,
    designTaskType: task.designTaskType ?? null,
    designTaskNumber: task.designTaskNumber ?? null,
    partyType: task.partyType ?? null,
    productName: task.productName ?? null,
    productImageUrl: task.productImageUrl ?? null,
    productQtyLabel: task.productQtyLabel ?? null,
    assigneeLabel: task.assigneeLabel ?? null,
    assigneeAvatarUrl: task.assigneeAvatarUrl ?? null,
    createdAt: task.createdAt ?? null,
  };
}

function buildDesignPageCachePayload(tasks: DesignTask[]): DesignPageCachePayload {
  return {
    tasks: tasks.slice(0, DESIGN_PAGE_CACHE_LIMIT).map((task) => sanitizeDesignTaskForCache(task)),
    cachedAt: Date.now(),
  };
}

function resolveTaskCustomerLogo(
  task: Pick<DesignTask, "customerName" | "customerLogoUrl" | "partyType">,
  entries: Array<{
    label: string;
    entityType: "customer" | "lead";
    logoUrl?: string | null;
  }>
) {
  if (entries.length === 0) return normalizeLogoUrl(task.customerLogoUrl ?? null);
  const logoByPartyAndLabel = new Map<string, string>();
  const logoByPartyAndCompactLabel = new Map<string, string>();
  const logoByLabel = new Map<string, string>();
  const logoByCompactLabel = new Map<string, string>();
  entries.forEach((row) => {
    const normalizedLabel = normalizePartyLabel(row.label);
    const normalizedCompactLabel = compactPartyLabel(row.label);
    const key = `${row.entityType}:${normalizedLabel}`;
    const compactKey = `${row.entityType}:${normalizedCompactLabel}`;
    const logoUrl = normalizeLogoUrl(row.logoUrl ?? null);
    if (!logoUrl) return;
    logoByPartyAndLabel.set(key, logoUrl);
    logoByPartyAndCompactLabel.set(compactKey, logoUrl);
    if (!logoByLabel.has(normalizedLabel)) {
      logoByLabel.set(normalizedLabel, logoUrl);
    }
    if (!logoByCompactLabel.has(normalizedCompactLabel)) {
      logoByCompactLabel.set(normalizedCompactLabel, logoUrl);
    }
  });

  const label = normalizePartyLabel(task.customerName ?? "");
  const compactLabel = compactPartyLabel(task.customerName ?? "");
  const partyType = task.partyType ?? "customer";
  return (
    (label
      ? logoByPartyAndLabel.get(`${partyType}:${label}`) ??
        logoByPartyAndCompactLabel.get(`${partyType}:${compactLabel}`) ??
        logoByLabel.get(label) ??
        logoByCompactLabel.get(compactLabel) ??
        null
      : null) ?? normalizeLogoUrl(task.customerLogoUrl ?? null)
  );
}

function applyCustomerLogosToTasks(
  tasks: DesignTask[],
  entries: Array<{
    label: string;
    entityType: "customer" | "lead";
    logoUrl?: string | null;
  }>
) {
  let changed = false;
  const next = tasks.map((task) => {
    const resolvedLogo = resolveTaskCustomerLogo(task, entries);
    const currentLogo = normalizeLogoUrl(task.customerLogoUrl ?? null);
    if (resolvedLogo === currentLogo) return task;
    changed = true;
    return { ...task, customerLogoUrl: resolvedLogo };
  });
  return changed ? next : tasks;
}

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

const normalizePartyLabel = (value?: string | null) => {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/[`"'’«»]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
};

const compactPartyLabel = (value?: string | null) => normalizePartyLabel(value).replace(/\s+/g, "");
const isValidDeadlineTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
const DEFAULT_CREATE_DEADLINE_TIME = "10:00";
const createDefaultDesignDeadline = (time = DEFAULT_CREATE_DEADLINE_TIME) => {
  if (time === DEFAULT_CREATE_DEADLINE_TIME) {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    if (next.getTime() - now.getTime() < 30 * 60 * 1000) {
      next.setHours(next.getHours() + 1);
    }
    if (next.toDateString() !== now.toDateString()) {
      next.setHours(10, 0, 0, 0);
    }
    return next;
  }
  const [hours, minutes] = time.split(":").map((part) => Number(part) || 0);
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  return next;
};
const getCompletedPeriodStart = (period: DesignCompletedPeriod) => {
  const now = new Date();
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
};

export default function DesignPage() {
  const { teamId, userId, permissions, session, jobRole } = useAuth();
  const navigationType = useNavigationType();
  const workspacePresence = useWorkspacePresence();
  const effectiveTeamId = teamId;
  const initialLogoCache = readDesignCustomerLogoCache(effectiveTeamId ?? "");
  const initialMemberCache = readDesignMemberCache(effectiveTeamId ?? "");
  const initialCacheRaw = readDesignPageCache(effectiveTeamId ?? "");
  const initialFilters = readDesignPageFiltersState(effectiveTeamId ?? "");
  const restoredFilters = shouldRestorePageUiState(navigationType, initialFilters?.cachedAt) ? initialFilters : null;
  const initialCache =
    initialCacheRaw && initialLogoCache?.entries?.length
      ? {
          ...initialCacheRaw,
          tasks: applyCustomerLogosToTasks(initialCacheRaw.tasks, initialLogoCache.entries),
        }
      : initialCacheRaw;
  const initialCacheIsFresh = Boolean(
    initialCache?.tasks?.length && Date.now() - Number(initialCache.cachedAt ?? 0) < DESIGN_PAGE_CACHE_FRESH_MS
  );
  const navigate = useNavigate();
  const [loading, setLoading] = useState(() => !(initialCache && initialCache.tasks.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [membersLoading, setMembersLoading] = useState(() => !initialMemberCache);
  const [tasks, setTasks] = useState<DesignTask[]>(() => initialCache?.tasks ?? []);
  const [tasksFetchLimit, setTasksFetchLimit] = useState(() =>
    (restoredFilters?.viewMode ?? "kanban") === "kanban" ? DESIGN_KANBAN_INITIAL_PAGE_SIZE : DESIGN_LIST_PAGE_SIZE
  );
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<DesignStatus | null>(null);
  const [suppressCardClick, setSuppressCardClick] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<DesignTask | null>(null);
  const [taskToRename, setTaskToRename] = useState<DesignTask | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBrief, setCreateBrief] = useState("");
  const [createCustomer, setCreateCustomer] = useState("");
  const [createCustomerId, setCreateCustomerId] = useState<string | null>(null);
  const [createCustomerLogoUrl, setCreateCustomerLogoUrl] = useState<string | null>(null);
  const [createCustomerType, setCreateCustomerType] = useState<"customer" | "lead">("customer");
  const [createCustomerSearch, setCreateCustomerSearch] = useState("");
  const [createCustomerPopoverOpen, setCreateCustomerPopoverOpen] = useState(false);
  const [createDeadline, setCreateDeadline] = useState<Date | undefined>(() => createDefaultDesignDeadline());
  const [createDeadlinePopoverOpen, setCreateDeadlinePopoverOpen] = useState(false);
  const [createDesignTaskType, setCreateDesignTaskType] = useState<DesignTaskType | null>(null);
  const [createDesignTaskTypePopoverOpen, setCreateDesignTaskTypePopoverOpen] = useState(false);
  const createDeadlineTime = useMemo(() => {
    if (!createDeadline) return DEFAULT_CREATE_DEADLINE_TIME;
    return `${String(createDeadline.getHours()).padStart(2, "0")}:${String(createDeadline.getMinutes()).padStart(2, "0")}`;
  }, [createDeadline]);
  const [createManagerUserId, setCreateManagerUserId] = useState<string>("none");
  const [createManagerPopoverOpen, setCreateManagerPopoverOpen] = useState(false);
  const [createAssigneeUserId, setCreateAssigneeUserId] = useState<string>("none");
  const [createAssigneePopoverOpen, setCreateAssigneePopoverOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createFilesDragActive, setCreateFilesDragActive] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [, setCustomersLoading] = useState(false);
  const [createCustomerOptions, setCreateCustomerOptions] = useState<CustomerOption[]>([]);
  const [createCustomerOptionsLoading, setCreateCustomerOptionsLoading] = useState(false);
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
  const [contentView, setContentView] = useState<DesignContentView>(() => restoredFilters?.contentView ?? "all");
  const [viewMode, setViewMode] = useState<DesignViewMode>(() => restoredFilters?.viewMode ?? "kanban");
  const [search, setSearch] = useState(() => restoredFilters?.search ?? "");
  const [statusFilter, setStatusFilter] = useState<DesignStatus | "all">(
    () => restoredFilters?.statusFilter ?? "all"
  );
  const [designerFilter, setDesignerFilter] = useState<string>(
    () => restoredFilters?.designerFilter ?? ALL_DESIGNERS_FILTER
  );
  const [managerFilter, setManagerFilter] = useState<string>(
    () => restoredFilters?.managerFilter ?? (isQuoteManagerJobRole(jobRole) && userId ? userId : ALL_MANAGERS_FILTER)
  );
  const [defaultDesignerFilterApplied, setDefaultDesignerFilterApplied] = useState(
    () => (restoredFilters?.designerFilter ?? ALL_DESIGNERS_FILTER) !== ALL_DESIGNERS_FILTER
  );
  const [defaultManagerFilterApplied, setDefaultManagerFilterApplied] = useState(
    () => (restoredFilters?.managerFilter ?? ALL_MANAGERS_FILTER) !== ALL_MANAGERS_FILTER || isQuoteManagerJobRole(jobRole)
  );
  const [timelineZoom, setTimelineZoom] = useState<"day" | "week" | "month">(
    () => restoredFilters?.timelineZoom ?? "day"
  );
  const [assigneeSpotlight, setAssigneeSpotlight] = useState<string>(
    () => restoredFilters?.assigneeSpotlight ?? ALL_ASSIGNEE_SPOTLIGHT
  );
  const [memberById, setMemberById] = useState<Record<string, string>>(() => initialMemberCache?.memberById ?? {});
  const [memberAvatarById, setMemberAvatarById] = useState<Record<string, string | null>>(
    () => initialMemberCache?.memberAvatarById ?? {}
  );
  const [memberAvailabilityById, setMemberAvailabilityById] = useState<Record<string, "available" | "vacation" | "sick_leave" | "offline">>({});
  const [managerMembers, setManagerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>(
    () => initialMemberCache?.managerMembers ?? []
  );
  const [designerMembers, setDesignerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>(
    () => initialMemberCache?.designerMembers ?? []
  );
  const [timerSummaryByTaskId, setTimerSummaryByTaskId] = useState<Record<string, DesignTaskTimerSummary>>({});
  const [timerNowMs, setTimerNowMs] = useState<number>(() => Date.now());
  const [completedPeriod] = useState<DesignCompletedPeriod>(
    () => restoredFilters?.completedPeriod ?? "30d"
  );
  const [completedByAssignee, setCompletedByAssignee] = useState<Record<string, { total: number; byType: Partial<Record<DesignTaskType, number>> }>>({});
  const [, setCompletedSummaryLoading] = useState(false);
  const desktopKanbanViewportRef = useRef<HTMLDivElement | null>(null);
  const loadTasksInFlightRef = useRef(false);
  const loadTasksCooldownUntilRef = useRef(0);
  const resourceErrorToastShownRef = useRef(false);
  const tasksLengthRef = useRef(0);
  const tasksRef = useRef<DesignTask[]>(initialCache?.tasks ?? []);
  const customersRef = useRef<CustomerOption[]>([]);
  const memberByIdRef = useRef<Record<string, string>>({});
  const memberAvatarByIdRef = useRef<Record<string, string | null>>({});
  const currentUserDisplayNameRef = useRef("");
  const currentUserAvatarUrlRef = useRef<string | null>(null);
  const initialLogoEntriesRef = useRef<CustomerOption[]>(initialLogoCache?.entries ?? []);
  const [desktopKanbanViewportHeight, setDesktopKanbanViewportHeight] = useState<number | null>(null);
  const tasksKanbanAutoloadLockRef = useRef(false);
  const tasksKanbanAutoloadTimerRef = useRef<number | null>(null);
  const fullFetchCompletedKeyRef = useRef<string | null>(null);
  const canManageAssignments = permissions.canManageAssignments;
  const canManageDesignStatuses = permissions.canManageDesignStatuses;
  const canSelfAssign = permissions.canSelfAssignDesign;
  const shouldForceSelfAssignee = permissions.isDesigner && !canManageAssignments && !!userId;
  const currentUserDisplayName = useMemo(() => {
    const user = session?.user;
    if (!user) return "";
    return buildUserNameFromMetadata(
      user.user_metadata as Record<string, unknown> | undefined,
      user.email
    ).displayName;
  }, [session?.user]);
  const isManagerUser = useMemo(() => isQuoteManagerJobRole(jobRole), [jobRole]);
  const currentUserAvatarUrl = useMemo(() => {
    return getCanonicalAvatarReference(
      {
        avatarUrl: (session?.user?.user_metadata?.avatar_url as string | undefined) ?? null,
        avatarPath: (session?.user?.user_metadata?.avatar_path as string | undefined) ?? null,
      },
      "avatars"
    );
  }, [session?.user?.user_metadata]);
  useEffect(() => {
    tasksLengthRef.current = tasks.length;
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);
  useEffect(() => {
    memberByIdRef.current = memberById;
  }, [memberById]);
  useEffect(() => {
    memberAvatarByIdRef.current = memberAvatarById;
  }, [memberAvatarById]);
  useEffect(() => {
    currentUserDisplayNameRef.current = currentUserDisplayName;
  }, [currentUserDisplayName]);
  useEffect(() => {
    currentUserAvatarUrlRef.current = currentUserAvatarUrl;
  }, [currentUserAvatarUrl]);
  useEffect(() => {
    initialLogoEntriesRef.current = initialLogoCache?.entries ?? [];
  }, [initialLogoCache?.entries]);
  const updateCreateDeadlineDate = useCallback((date?: Date) => {
    if (!date) {
      setCreateDeadline(undefined);
      return;
    }
    const next = new Date(date);
    const [hours, minutes] = createDeadlineTime.split(":").map((part) => Number(part) || 0);
    next.setHours(hours, minutes, 0, 0);
    setCreateDeadline(next);
  }, [createDeadlineTime]);

  const updateCreateDeadlineTime = useCallback((value: string) => {
    if (!isValidDeadlineTime(value)) return;
    const [hours, minutes] = value.split(":").map((part) => Number(part) || 0);
    const next = createDeadline ? new Date(createDeadline) : createDefaultDesignDeadline(value);
    next.setHours(hours, minutes, 0, 0);
    setCreateDeadline(next);
  }, [createDeadline]);
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
    if (id === userId && currentUserDisplayName) return currentUserDisplayName;
    return memberById[id] ?? id.slice(0, 8);
  };
  const getMemberAvatar = useCallback((id: string | null | undefined) => {
    if (!id) return null;
    if (id === userId && currentUserAvatarUrl) return currentUserAvatarUrl;
    return memberAvatarById[id] ?? null;
  }, [currentUserAvatarUrl, memberAvatarById, userId]);
  const getMemberAvailability = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "available";
      return memberAvailabilityById[id] ?? "available";
    },
    [memberAvailabilityById]
  );
  const onlineMemberIds = useMemo(
    () => new Set(workspacePresence.onlineEntries.map((entry) => entry.userId)),
    [workspacePresence.onlineEntries]
  );
  const getTaskAssigneeLabel = (task: DesignTask) => {
    if (task.assigneeLabel?.trim()) return task.assigneeLabel.trim();
    if (
      task.assigneeUserId &&
      membersLoading &&
      !memberById[task.assigneeUserId] &&
      !(task.assigneeUserId === userId && currentUserDisplayName)
    ) {
      return "Завантаження...";
    }
    return getMemberLabel(task.assigneeUserId);
  };
  const getTaskAssigneeAvatar = (task: DesignTask) =>
    getMemberAvatar(task.assigneeUserId) || task.assigneeAvatarUrl?.trim() || null;
  const completedSummaryTaskDeps = useMemo(
    () =>
      tasks
        .map((task) => `${task.id}:${task.assigneeUserId ?? ""}:${task.designTaskType ?? ""}`)
        .join("|"),
    [tasks]
  );
  const getAllowedStatusTransitions = (task: DesignTask) =>
    DESIGN_COLUMNS.filter((column) =>
      canChangeDesignStatus({
        currentStatus: task.status,
        nextStatus: column.id,
        canManageAssignments: canManageDesignStatuses,
        isAssignedToCurrentUser: !!userId && task.assigneeUserId === userId,
      })
    );
  const canMarkTaskReady = (task: DesignTask) =>
    canChangeDesignStatus({
      currentStatus: task.status,
      nextStatus: "pm_review",
      canManageAssignments: canManageDesignStatuses,
      isAssignedToCurrentUser: !!userId && task.assigneeUserId === userId,
    });

  const getTaskTimerSummary = useCallback((taskId: string): DesignTaskTimerSummary => {
    return (
      timerSummaryByTaskId[taskId] ?? {
        totalSeconds: 0,
        activeSessionId: null,
        activeStartedAt: null,
        activeUserId: null,
      }
    );
  }, [timerSummaryByTaskId]);

  const getTaskTrackedSeconds = useCallback((taskId: string) => {
    const summary = getTaskTimerSummary(taskId);
    const activeSeconds = summary.activeStartedAt
      ? Math.max(0, Math.floor((timerNowMs - new Date(summary.activeStartedAt).getTime()) / 1000))
      : 0;
    return summary.totalSeconds + activeSeconds;
  }, [getTaskTimerSummary, timerNowMs]);

  useEffect(() => {
    const loadMembers = async () => {
      if (!userId) return;
      setMembersLoading(true);
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) {
          setMemberById({});
          setMemberAvatarById({});
          setMemberAvailabilityById({});
          setManagerMembers([]);
          setDesignerMembers([]);
          return;
        }
        const rows = await listWorkspaceMembersForDisplay(workspaceId);

        const labelById: Record<string, string> = {};
        const avatarById: Record<string, string | null> = {};
        const availabilityById: Record<string, "available" | "vacation" | "sick_leave" | "offline"> = {};
        rows.forEach((row) => {
          labelById[row.userId] = row.label;
          avatarById[row.userId] = row.avatarDisplayUrl;
          availabilityById[row.userId] = normalizeTeamAvailabilityStatus(row.availabilityStatus);
        });

        setMemberById(labelById);
        setMemberAvatarById(avatarById);
        setMemberAvailabilityById(availabilityById);
        const designerRows = rows.filter((row) => isDesignerRole(row.jobRole));

        // If no one is marked as designer, still allow assignment to any team member.
        const assigneeRows = designerRows.length > 0 ? designerRows : rows;

        let managerRows = rows.filter((row) => isManagerRole(row.accessRole, row.jobRole));
        if (managerRows.length === 0 && userId) {
          const me = rows.find((row) => row.userId === userId);
          if (me) managerRows = [me];
        }
        if (managerRows.length === 0) managerRows = rows;
        const nextManagerMembers = managerRows.map((row) => ({
          id: row.userId,
          label: labelById[row.userId] ?? row.userId,
          avatarUrl: avatarById[row.userId] ?? null,
        }));
        const nextDesignerMembers = assigneeRows.map((row) => ({
          id: row.userId,
          label: labelById[row.userId] ?? row.userId,
          avatarUrl: avatarById[row.userId] ?? null,
        }));
        setDesignerMembers(nextDesignerMembers);
        setManagerMembers(nextManagerMembers);
        if (typeof window !== "undefined" && effectiveTeamId) {
          writeDesignSessionCache(`design-member-cache:${effectiveTeamId}`, {
            memberById: labelById,
            memberAvatarById: avatarById,
            managerMembers: nextManagerMembers,
            designerMembers: nextDesignerMembers,
            cachedAt: Date.now(),
          } satisfies DesignMemberCachePayload);
        }
      } catch (e: unknown) {
        console.warn("Failed to load workspace members for design page", e);
        setMemberAvailabilityById({});
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
        const directory = await listCustomerLeadLogoDirectory(effectiveTeamId);
        if (typeof window !== "undefined") {
          writeDesignSessionCache(`design-customer-logo-cache:${effectiveTeamId}`, {
            entries: directory,
            cachedAt: Date.now(),
          } satisfies DesignCustomerLogoCachePayload);
        }
        const options: CustomerOption[] = directory.map((row) => ({
          id: row.id,
          label: row.label,
          entityType: row.entityType,
          logoUrl: row.logoUrl,
        }));
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
    if (!createDialogOpen) return;
    if (!effectiveTeamId) {
      setCreateCustomerOptions([]);
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setCreateCustomerOptionsLoading(true);
      try {
        const [customerRows, leadRows] = await Promise.all([
          listCustomersBySearch(effectiveTeamId, createCustomerSearch),
          listLeadsBySearch(effectiveTeamId, createCustomerSearch).catch(() => [] as LeadSearchRow[]),
        ]);

        if (!active) return;

        const restrictToOwnParties = isQuoteManagerJobRole(jobRole);
        const normalizeManagerKey = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
        const currentManagerKey = normalizeManagerKey(memberById[userId ?? ""] ?? currentUserDisplayName ?? "");
        const resolvePartyManagerUserId = (managerUserId?: string | null, managerLabel?: string | null) => {
          const normalizedManagerUserId = managerUserId?.trim() ?? "";
          if (normalizedManagerUserId) return normalizedManagerUserId;

          const normalizedManagerLabel = managerLabel?.trim() ?? "";
          if (!normalizedManagerLabel) return "";

          const managerShortLabel = formatUserShortName({ fullName: normalizedManagerLabel, fallback: normalizedManagerLabel });
          const matchedMember = Object.entries(memberById).find(([, label]) => {
            const normalizedLabel = normalizeManagerKey(label);
            return (
              normalizedLabel === normalizeManagerKey(normalizedManagerLabel) ||
              normalizedLabel === normalizeManagerKey(managerShortLabel)
            );
          });

          return matchedMember?.[0] ?? "";
        };
        const isOwnParty = (managerUserId?: string | null, managerLabel?: string | null) => {
          if (!restrictToOwnParties) return true;
          if (!userId) return false;

          const resolvedManagerUserId = resolvePartyManagerUserId(managerUserId, managerLabel);
          if (resolvedManagerUserId) {
            return resolvedManagerUserId === userId;
          }

          const normalizedManagerLabel = managerLabel?.trim() ?? "";
          if (!normalizedManagerLabel) return true;

          if (!currentManagerKey) return true;

          if (normalizeManagerKey(normalizedManagerLabel) === currentManagerKey) return true;

          const managerShortLabel = formatUserShortName({ fullName: normalizedManagerLabel, fallback: normalizedManagerLabel });
          if (normalizeManagerKey(managerShortLabel) === currentManagerKey) return true;

          // Old/ambiguous records should stay selectable; block only when ownership is explicit.
          return true;
        };

        const customerOptions: CustomerOption[] = customerRows.map((customer) => ({
          id: customer.id,
          label: customer.name?.trim() || customer.legal_name?.trim() || "Замовник без назви",
          legalName: customer.legal_name?.trim() || null,
          entityType: "customer",
          logoUrl: normalizeLogoUrl(customer.logo_url ?? null),
          managerLabel: customer.manager?.trim() || null,
          searchText: [customer.name ?? "", customer.legal_name ?? ""].filter(Boolean).join(" "),
          disabled: !isOwnParty(customer.manager_user_id ?? null, customer.manager ?? null),
          disabledReason: !isOwnParty(customer.manager_user_id ?? null, customer.manager ?? null)
            ? `Можна вибрати тільки свого замовника або ліда${customer.manager?.trim() ? `. Менеджер: ${customer.manager.trim()}` : ""}`
            : null,
        }));

        const leadOptions: CustomerOption[] = leadRows.map((lead) => ({
          id: lead.id,
          label:
            lead.company_name?.trim() ||
            lead.legal_name?.trim() ||
            [lead.first_name?.trim(), lead.last_name?.trim()].filter(Boolean).join(" ") ||
            "Лід без назви",
          legalName: lead.legal_name?.trim() || null,
          entityType: "lead",
          logoUrl: normalizeLogoUrl(lead.logo_url ?? null),
          managerLabel: lead.manager?.trim() || null,
          searchText: [
            lead.company_name ?? "",
            lead.legal_name ?? "",
            lead.first_name ?? "",
            lead.last_name ?? "",
          ]
            .filter(Boolean)
            .join(" "),
          disabled: !isOwnParty(lead.manager_user_id ?? null, lead.manager ?? null),
          disabledReason: !isOwnParty(lead.manager_user_id ?? null, lead.manager ?? null)
            ? `Можна вибрати тільки свого замовника або ліда${lead.manager?.trim() ? `. Менеджер: ${lead.manager.trim()}` : ""}`
            : null,
        }));

        setCreateCustomerOptions(
          [...customerOptions, ...leadOptions].sort((a, b) => a.label.localeCompare(b.label, "uk"))
        );
      } catch {
        if (active) setCreateCustomerOptions([]);
      } finally {
        if (active) setCreateCustomerOptionsLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [createCustomerSearch, createDialogOpen, currentUserDisplayName, effectiveTeamId, jobRole, memberById, userId]);

  useEffect(() => {
    if (customers.length === 0 || tasks.length === 0) return;
    const next = applyCustomerLogosToTasks(tasks, customers);
    if (next === tasks) return;
    setTasks(next);
    if (typeof window !== "undefined" && effectiveTeamId) {
      writeDesignSessionCache(`design-page-cache:${effectiveTeamId}`, buildDesignPageCachePayload(next));
    }
  }, [customers, effectiveTeamId, tasks]);

  useEffect(() => {
    if (defaultDesignerFilterApplied) return;
    if (designerFilter !== ALL_DESIGNERS_FILTER) return;
    if (!permissions.isDesigner || !userId) return;
    if (loading && tasks.length === 0) return;
    const hasOwnTasks = tasks.some((task) => task.assigneeUserId === userId);
    if (hasOwnTasks) {
      setDesignerFilter(userId);
    }
    setDefaultDesignerFilterApplied(true);
  }, [defaultDesignerFilterApplied, designerFilter, loading, permissions.isDesigner, tasks, userId]);

  useEffect(() => {
    if (defaultManagerFilterApplied) return;
    if (managerFilter !== ALL_MANAGERS_FILTER) return;
    if (!isManagerUser || !userId) return;
    if (loading && tasks.length === 0) return;
    const hasOwnManagedTasks = tasks.some((task) => task.quoteManagerUserId === userId);
    if (hasOwnManagedTasks) {
      setManagerFilter(userId);
    }
    setDefaultManagerFilterApplied(true);
  }, [defaultManagerFilterApplied, isManagerUser, loading, managerFilter, tasks, userId]);

  const loadTasks = useCallback(async (options?: { force?: boolean; append?: boolean; fetchAll?: boolean; fullFetchKey?: string }) => {
    if (!effectiveTeamId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden" && !options?.force) return;
    if (loadTasksInFlightRef.current) return;
    const now = Date.now();
    if (!options?.force && loadTasksCooldownUntilRef.current > now) return;

    const append = !!options?.append;
    const fetchAll = !!options?.fetchAll && !append;
    if (fetchAll && options?.fullFetchKey && fullFetchCompletedKeyRef.current === options.fullFetchKey) {
      return;
    }
    const pageSize = append
      ? (viewMode === "kanban" ? DESIGN_KANBAN_PAGE_INCREMENT : DESIGN_LIST_PAGE_INCREMENT)
      : fetchAll
        ? DESIGN_SEARCH_FETCH_PAGE_SIZE
        : tasksFetchLimit;
    const offset = append ? tasksLengthRef.current : 0;

    loadTasksInFlightRef.current = true;
    if (tasksLengthRef.current > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const fetchedRows: Array<{
        id: string;
        entity_id?: string | null;
        metadata?: Record<string, unknown> | null;
        title?: string | null;
        created_at: string;
      }> = [];
      let nextOffset = offset;
      let nextHasMoreTasks = false;

      while (true) {
        const fetchLimit = pageSize + 1;
        const { data, error: fetchError } = await supabase
          .from("activity_log")
          .select("id,entity_id,metadata,title,created_at")
          .eq("team_id", effectiveTeamId)
          .eq("action", "design_task")
          .order("created_at", { ascending: false })
          .range(nextOffset, nextOffset + fetchLimit - 1);
        if (fetchError) throw fetchError;

        const pageRows = (data ?? []) as Array<{
          id: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown> | null;
          title?: string | null;
          created_at: string;
        }>;
        const limitedPageRows = pageRows.slice(0, pageSize);
        fetchedRows.push(...limitedPageRows);

        nextHasMoreTasks = pageRows.length > pageSize;
        if (!fetchAll || !nextHasMoreTasks) break;
        nextOffset += pageSize;
      }

      const limitedRows = fetchedRows;
      setHasMoreTasks(fetchAll ? false : nextHasMoreTasks);
      if (!append) {
        fullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
      }
      const parsedRaw =
        limitedRows.map((row) => {
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
            designTaskType: parseDesignTaskType(metadata.design_task_type),
            designTaskNumber:
              typeof metadata.design_task_number === "string" && metadata.design_task_number.trim()
                ? (/^DZ-/i.test(metadata.design_task_number.trim()) ? null : metadata.design_task_number.trim())
                : null,
            assigneeUserId:
              typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id
                ? metadata.assignee_user_id
                : null,
            assignedAt: typeof metadata.assigned_at === "string" ? metadata.assigned_at : null,
            quoteManagerUserId:
              typeof metadata.manager_user_id === "string" && metadata.manager_user_id.trim()
                ? metadata.manager_user_id.trim()
                : null,
            customerId:
              typeof metadata.customer_id === "string" && metadata.customer_id.trim()
                ? metadata.customer_id.trim()
                : null,
            customerType:
              typeof metadata.customer_type === "string"
                ? (metadata.customer_type.trim().toLowerCase() === "lead"
                    ? "lead"
                    : metadata.customer_type.trim().toLowerCase() === "customer"
                      ? "customer"
                    : null)
                : null,
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
                ? sanitizeImageReference(metadata.customer_logo_url)
                : null,
            partyType:
              typeof metadata.customer_type === "string"
                ? (metadata.customer_type.trim().toLowerCase() === "lead"
                    ? "lead"
                    : metadata.customer_type.trim().toLowerCase() === "customer"
                      ? "customer"
                    : null)
                : null,
            assigneeLabel:
              typeof metadata.assignee_label === "string" && metadata.assignee_label.trim()
                ? metadata.assignee_label.trim()
                : null,
            assigneeAvatarUrl:
              typeof metadata.assignee_avatar_url === "string" && metadata.assignee_avatar_url.trim()
                ? sanitizeImageReference(metadata.assignee_avatar_url)
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
        });

      // Fetch quote details only when metadata does not already contain enough info.
      const quoteIdsNeedingQuoteLookup = Array.from(
        new Set(
          parsedRaw
            .filter(
              (task) =>
                !!task.quoteId &&
                isUuid(task.quoteId) &&
                (!task.quoteNumber ||
                  !task.customerName ||
                  !task.quoteManagerUserId ||
                  !task.customerId ||
                  !task.partyType ||
                  !task.customerLogoUrl)
            )
            .map((task) => task.quoteId)
        )
      );
      const quoteIdsNeedingFirstItemLookup = Array.from(
        new Set(
          parsedRaw
            .filter(
              (task) =>
                !!task.quoteId &&
                isUuid(task.quoteId) &&
                (!task.productName || !task.productImageUrl || !(task as { productQtyLabel?: string | null }).productQtyLabel)
            )
            .map((task) => task.quoteId)
        )
      );
      const quoteIds = Array.from(
        new Set(
          parsedRaw.map((t) => t.quoteId).filter((quoteId): quoteId is string => !!quoteId && isUuid(quoteId))
        )
      );
      let quoteMap = new Map<string, {
        number: string | null;
        customerName: string | null;
        customerLogoUrl: string | null;
        partyType: "customer" | "lead";
        managerUserId: string | null;
      }>();
      const customerMap = new Map<string, { name: string | null; logoUrl: string | null }>();
      const leadMap = new Map<string, { name: string | null; logoUrl: string | null }>();
      const productNameByQuoteId = new Map<string, string | null>();
      const productImageByQuoteId = new Map<string, string | null>();
      const productQtyByQuoteId = new Map<string, string | null>();
      const productZoomImageByQuoteId = new Map<string, string | null>();
      if (quoteIds.length > 0) {
        const { data: quoteRows, error: quoteError } = await supabase
          .schema("tosho")
          .from("quotes")
          .select("id, number, customer_id, customer_name, customer_logo_url, title, assigned_to")
          .in("id", quoteIdsNeedingQuoteLookup.length > 0 ? quoteIdsNeedingQuoteLookup : quoteIds);
        if (quoteError) throw quoteError;

        const customerIds = Array.from(
          new Set([
            ...(quoteRows ?? [])
              .filter((q) => {
                const parsedTask = parsedRaw.find((task) => task.quoteId === q.id);
                return !parsedTask?.customerName || !parsedTask?.customerLogoUrl;
              })
              .map((q) => q.customer_id)
              .filter(Boolean),
            ...parsedRaw
              .filter(
                (task) =>
                  task.customerType !== "lead" &&
                  task.customerId &&
                  (!task.customerName || !task.customerLogoUrl)
              )
              .map((task) => task.customerId as string),
          ] as string[])
        );
        const leadIds = Array.from(
          new Set(
            parsedRaw
              .filter(
                (task) =>
                  task.customerType === "lead" &&
                  task.customerId &&
                  (!task.customerName || !task.customerLogoUrl)
              )
              .map((task) => task.customerId as string)
          )
        );
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
        if (leadIds.length > 0) {
          const { data: leads, error: leadError } = await supabase
            .schema("tosho")
            .from("leads")
            .select("id, company_name, legal_name, logo_url")
            .eq("team_id", effectiveTeamId)
            .in("id", leadIds);
          if (leadError) throw leadError;
          (leads ?? []).forEach((lead) => {
            const name =
              (typeof lead.company_name === "string" && lead.company_name.trim() ? lead.company_name : null) ??
              (typeof lead.legal_name === "string" && lead.legal_name.trim() ? lead.legal_name : null);
            const logoUrl = typeof lead.logo_url === "string" && lead.logo_url.trim() ? lead.logo_url : null;
            leadMap.set(lead.id, { name, logoUrl });
          });
        }

        quoteMap = new Map(
          (quoteRows ?? []).map((q) => [
            q.id as string,
            {
              number: (q.number as string) ?? null,
              customerName:
                customerMap.get(q.customer_id as string)?.name ??
                (typeof q.customer_name === "string" && q.customer_name.trim() ? q.customer_name.trim() : null) ??
                (typeof q.title === "string" && q.title.trim() ? q.title.trim() : null),
              customerLogoUrl:
                sanitizeImageReference(
                  normalizeLogoUrl(customerMap.get(q.customer_id as string)?.logoUrl ?? null) ??
                    normalizeLogoUrl(typeof q.customer_logo_url === "string" ? q.customer_logo_url : null)
                ),
              partyType: q.customer_id ? "customer" : "lead",
              managerUserId:
                typeof q.assigned_to === "string" && q.assigned_to.trim() ? q.assigned_to.trim() : null,
            },
          ])
        );

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
        if (quoteIdsNeedingFirstItemLookup.length > 0) {
          const { data: quoteItems, error: quoteItemsError } = await supabase
            .schema("tosho")
            .from("quote_items")
            .select("quote_id, position, name, qty, unit, attachment, catalog_model_id")
            .in("quote_id", quoteIdsNeedingFirstItemLookup)
            .order("position", { ascending: true });
          if (quoteItemsError) throw quoteItemsError;

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
        }

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
        const modelImageById = new Map<string, { imageUrl: string; zoomImageUrl?: string | null }>();
        if (modelIds.length > 0) {
          const modelRows = await listCatalogModelsByIds(modelIds);
          modelRows.forEach((row, id) => {
            const zoomImageUrl = row.image_url?.trim() || null;
            const imageUrl = row.thumb_url?.trim() || zoomImageUrl;
            if (!imageUrl) return;
            modelImageById.set(id, { imageUrl, zoomImageUrl });
          });
        }

        firstItemByQuoteId.forEach((item, quoteId) => {
          const attachmentImage =
            item.attachment &&
            typeof item.attachment === "object" &&
            typeof (item.attachment as Record<string, unknown>).url === "string"
              ? sanitizeImageReference(String((item.attachment as Record<string, unknown>).url))
              : null;
          const catalogImage =
            typeof item.catalog_model_id === "string" && item.catalog_model_id.trim()
              ? modelImageById.get(item.catalog_model_id.trim()) ?? null
              : null;
          productImageByQuoteId.set(quoteId, attachmentImage || catalogImage?.imageUrl || null);
          productZoomImageByQuoteId.set(
            quoteId,
            attachmentImage || catalogImage?.zoomImageUrl || catalogImage?.imageUrl || null
          );
        });
      }

      const derivedNumbers = buildDerivedDesignTaskNumberMap(
        parsedRaw.map((task) => ({
          id: task.id,
          createdAt: task.createdAt ?? null,
          designTaskNumber: task.designTaskNumber ?? null,
        }))
      );

      const parsedBase: DesignTask[] = parsedRaw.map((t) => ({
        ...t,
        designTaskNumber: t.designTaskNumber ?? derivedNumbers.get(t.id) ?? null,
        quoteNumber: t.quoteNumber ?? quoteMap.get(t.quoteId)?.number ?? null,
        customerName:
          (t.customerId
            ? customerMap.get(t.customerId)?.name ?? leadMap.get(t.customerId)?.name ?? null
            : null) ??
          quoteMap.get(t.quoteId)?.customerName ??
          t.customerName ??
          null,
        customerLogoUrl:
          (t.customerId
            ? sanitizeImageReference(normalizeLogoUrl(customerMap.get(t.customerId)?.logoUrl ?? null)) ??
              sanitizeImageReference(normalizeLogoUrl(leadMap.get(t.customerId)?.logoUrl ?? null)) ??
              null
            : null) ??
          sanitizeImageReference(normalizeLogoUrl(quoteMap.get(t.quoteId)?.customerLogoUrl ?? null)) ??
          sanitizeImageReference(normalizeLogoUrl(t.customerLogoUrl)) ??
          null,
        partyType:
          t.partyType ??
          t.customerType ??
          (t.customerId && customerMap.has(t.customerId)
            ? "customer"
            : t.customerId && leadMap.has(t.customerId)
              ? "lead"
              : null) ??
          quoteMap.get(t.quoteId)?.partyType ??
          null,
        quoteManagerUserId: t.quoteManagerUserId ?? quoteMap.get(t.quoteId)?.managerUserId ?? null,
        productName: t.productName ?? productNameByQuoteId.get(t.quoteId) ?? null,
        productImageUrl: sanitizeImageReference(productImageByQuoteId.get(t.quoteId) ?? null),
        productZoomImageUrl: sanitizeImageReference(productZoomImageByQuoteId.get(t.quoteId) ?? null),
        productQtyLabel: productQtyByQuoteId.get(t.quoteId) ?? null,
        assigneeLabel:
          t.assigneeLabel ??
          (t.assigneeUserId
                ? (t.assigneeUserId === userId && currentUserDisplayNameRef.current
                ? currentUserDisplayNameRef.current
                : (memberByIdRef.current[t.assigneeUserId] ?? null))
            : null),
        assigneeAvatarUrl:
          (t.assigneeUserId
            ? (t.assigneeUserId === userId && currentUserAvatarUrlRef.current
                ? sanitizeImageReference(currentUserAvatarUrlRef.current)
                : sanitizeImageReference(memberAvatarByIdRef.current[t.assigneeUserId] ?? null))
            : null) ??
          sanitizeImageReference(t.assigneeAvatarUrl),
      }));
      const parsed = applyCustomerLogosToTasks(
        parsedBase,
        customersRef.current.length > 0 ? customersRef.current : initialLogoEntriesRef.current
      );
      const nextTasks = append
        ? [
            ...tasksRef.current,
            ...parsed.filter((task) => !tasksRef.current.some((existing) => existing.id === task.id)),
          ]
        : parsed;

      setTasks(nextTasks);
      if (typeof window !== "undefined" && effectiveTeamId) {
        writeDesignSessionCache(`design-page-cache:${effectiveTeamId}`, buildDesignPageCachePayload(nextTasks));
      }
      try {
        const timerSummaryMap = await getDesignTasksTimerSummaryMap(
          effectiveTeamId,
          parsed.map((task) => task.id)
        );
        const timerSummaryObj: Record<string, DesignTaskTimerSummary> = {};
        timerSummaryMap.forEach((summary, taskId) => {
          timerSummaryObj[taskId] = summary;
        });
        setTimerSummaryByTaskId((current) => (append ? { ...current, ...timerSummaryObj } : timerSummaryObj));
      } catch (timerError) {
        console.warn("Failed to load timer summaries", timerError);
        if (!append) setTimerSummaryByTaskId({});
      }
      loadTasksCooldownUntilRef.current = 0;
      resourceErrorToastShownRef.current = false;
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося завантажити задачі дизайну");
      setHasMoreTasks(false);
      if (isResourceExhaustionLikeError(e)) {
        loadTasksCooldownUntilRef.current = Date.now() + LOAD_TASKS_RESOURCE_COOLDOWN_MS;
        if (tasksLengthRef.current > 0) {
          console.warn("Paused design task refresh after resource exhaustion", e);
          if (!resourceErrorToastShownRef.current) {
            toast.error("Вкладка перевантажена. Оновлення задач тимчасово призупинено на 30 секунд.");
            resourceErrorToastShownRef.current = true;
          }
        } else {
          setError("Браузер перевантажений. Спробуйте перезавантажити вкладку.");
        }
      } else if (tasksLengthRef.current > 0) {
        console.warn("Failed to refresh design tasks", e);
        toast.error(message);
      } else {
        setError(message);
      }
    } finally {
      loadTasksInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    effectiveTeamId,
    tasksFetchLimit,
    userId,
    viewMode,
  ]);

  useEffect(() => {
    const hasBlockingFilters =
      search.trim().length > 0 ||
      statusFilter !== "all" ||
      designerFilter !== ALL_DESIGNERS_FILTER ||
      (!isManagerUser && managerFilter !== ALL_MANAGERS_FILTER);

    if (hasBlockingFilters) {
      if (tasks.length === 0) {
        void loadTasks({ force: true });
      }
      return;
    }

    if (initialCacheIsFresh && tasks.length > 0) {
      const timeoutId = window.setTimeout(() => {
        void loadTasks();
      }, DESIGN_PAGE_BACKGROUND_REFRESH_DELAY_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    void loadTasks({ force: true });
  }, [designerFilter, initialCacheIsFresh, isManagerUser, loadTasks, managerFilter, search, statusFilter, tasks.length]);

  useEffect(() => {
    const searchKey = `search:${effectiveTeamId ?? ""}:${search.trim().toLowerCase()}`;
    if (!search.trim()) return;
    if (!effectiveTeamId) return;
    if (loading || refreshing) return;
    if (!hasMoreTasks && tasks.length < DESIGN_PAGE_CACHE_LIMIT) return;
    void loadTasks({ force: true, fetchAll: true, fullFetchKey: searchKey });
  }, [effectiveTeamId, hasMoreTasks, loadTasks, loading, refreshing, search, tasks.length]);

  useEffect(() => {
    if (!effectiveTeamId) return;
    const handlePageCacheUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ teamId?: string }>;
      if (customEvent.detail?.teamId !== effectiveTeamId) return;
      const cached = readDesignPageCache(effectiveTeamId);
      if (!cached?.tasks) return;
      setTasks(cached.tasks);
    };

    window.addEventListener("design:page-cache-updated", handlePageCacheUpdate as EventListener);
    return () => {
      window.removeEventListener("design:page-cache-updated", handlePageCacheUpdate as EventListener);
    };
  }, [effectiveTeamId, loadTasks]);

  useEffect(() => {
    if (!effectiveTeamId) return;
    const handleCustomersUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ teamId?: string }>;
      if (customEvent.detail?.teamId !== effectiveTeamId) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadTasks();
    };

    window.addEventListener("design:customers-updated", handleCustomersUpdated as EventListener);
    return () => {
      window.removeEventListener("design:customers-updated", handleCustomersUpdated as EventListener);
    };
  }, [effectiveTeamId, loadTasks]);

  useEffect(() => {
    if (!effectiveTeamId) {
      setCompletedByAssignee({});
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (tasks.length === 0) {
      setCompletedByAssignee({});
      return;
    }

    let active = true;
    const loadCompletedSummary = async () => {
      setCompletedSummaryLoading(true);
      try {
        const since = getCompletedPeriodStart(completedPeriod).toISOString();
        const taskIds = tasks.map((task) => task.id).filter(Boolean);
        if (taskIds.length === 0) {
          if (active) setCompletedByAssignee({});
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("activity_log")
          .select("entity_id,metadata,created_at")
          .eq("team_id", effectiveTeamId)
          .eq("action", "design_task_status")
          .in("entity_id", taskIds)
          .gte("created_at", since);
        if (fetchError) throw fetchError;

        const taskById = new Map(tasks.map((task) => [task.id, task]));
        const nextSummary: Record<string, { total: number; byType: Partial<Record<DesignTaskType, number>> }> = {};

        ((data ?? []) as Array<{ entity_id?: string | null; metadata?: Record<string, unknown> | null }>).forEach((row) => {
          const metadata = row.metadata ?? {};
          if (metadata.to_status !== "approved") return;

          const taskId = typeof row.entity_id === "string" ? row.entity_id.trim() : "";
          const task = taskById.get(taskId);
          const assigneeUserId =
            (typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id.trim()
              ? metadata.assignee_user_id.trim()
              : null) ??
            task?.assigneeUserId ??
            null;
          if (!assigneeUserId) return;

          const taskType =
            parseDesignTaskType(metadata.design_task_type) ??
            task?.designTaskType ??
            null;
          const bucket = nextSummary[assigneeUserId] ?? { total: 0, byType: {} };
          bucket.total += 1;
          if (taskType) {
            bucket.byType[taskType] = (bucket.byType[taskType] ?? 0) + 1;
          }
          nextSummary[assigneeUserId] = bucket;
        });

        if (active) setCompletedByAssignee(nextSummary);
      } catch (summaryError) {
        console.warn("Failed to load completed design summary", summaryError);
        if (active) setCompletedByAssignee({});
      } finally {
        if (active) setCompletedSummaryLoading(false);
      }
    };

    void loadCompletedSummary();

    return () => {
      active = false;
    };
  }, [completedPeriod, completedSummaryTaskDeps, effectiveTeamId, tasks]);

  const getTaskDisplayNumber = (task: DesignTask) => {
    if (task.designTaskNumber) return task.designTaskNumber;
    if (isUuid(task.quoteId) && task.quoteNumber) return task.quoteNumber;
    return task.quoteId.slice(0, 8);
  };

  const allTasksCount = tasks.length;
  const linkedTasksCount = useMemo(() => tasks.filter((task) => isUuid(task.quoteId)).length, [tasks]);
  const standaloneTasksCount = useMemo(() => tasks.filter((task) => !isUuid(task.quoteId)).length, [tasks]);

  const designerFilterOptions = useMemo(
    () =>
      [...designerMembers].sort((a, b) => a.label.localeCompare(b.label, "uk", { sensitivity: "base" })),
    [designerMembers]
  );

  const renderDesignerFilterValue = useCallback((value: string) => {
    if (value === ALL_DESIGNERS_FILTER) return <span>Всі дизайнери</span>;
    if (value === NO_DESIGNER_FILTER) return <span>Без дизайнера</span>;
    const label = value === userId && currentUserDisplayName ? currentUserDisplayName : (memberById[value] ?? "Користувач");
    const avatarUrl = getMemberAvatar(value);
    return (
      <span className="flex min-w-0 items-center gap-2">
        <AvatarBase
          src={avatarUrl}
          name={label}
          fallback={getInitials(label)}
          size={18}
          className="shrink-0 border-border/60"
          fallbackClassName="text-[9px] font-semibold"
          availability={getMemberAvailability(value)}
          presence={onlineMemberIds.has(value) ? "online" : "offline"}
        />
        <span className="truncate">{label}</span>
      </span>
    );
  }, [currentUserDisplayName, getMemberAvatar, getMemberAvailability, memberById, onlineMemberIds, userId]);

  const renderAssigneeSpotlightValue = (value: string) => {
    if (value === ALL_ASSIGNEE_SPOTLIGHT) return <span>Вся команда</span>;
    if (value === NO_DESIGNER_FILTER) return <span>Без виконавця</span>;
    return renderDesignerFilterValue(value);
  };

  const visibleTasks = useMemo(
    () =>
      isManagerUser && userId
        ? tasks.filter((task) => (task.quoteManagerUserId?.trim() ?? "") === userId)
        : tasks,
    [isManagerUser, tasks, userId]
  );

  const managerFilterOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; avatarUrl?: string | null }>();

    managerMembers.forEach((member) => {
      byId.set(member.id, member);
    });

    visibleTasks.forEach((task) => {
      const managerId = task.quoteManagerUserId?.trim();
      if (!managerId || byId.has(managerId)) return;
      const label =
        managerId === userId && currentUserDisplayName
          ? currentUserDisplayName
          : (memberById[managerId] ?? managerId);
      byId.set(managerId, {
        id: managerId,
        label,
        avatarUrl: getMemberAvatar(managerId),
      });
    });

    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label, "uk", { sensitivity: "base" }));
  }, [currentUserDisplayName, getMemberAvatar, managerMembers, memberById, userId, visibleTasks]);

  const renderManagerFilterValue = useCallback((value: string) => {
    if (value === ALL_MANAGERS_FILTER) return <span>Всі менеджери</span>;
    const label = value === userId && currentUserDisplayName ? currentUserDisplayName : (memberById[value] ?? "Користувач");
    const avatarUrl = getMemberAvatar(value);
    return (
      <span className="flex min-w-0 items-center gap-2">
        <AvatarBase
          src={avatarUrl}
          name={label}
          fallback={getInitials(label)}
          size={18}
          className="shrink-0 border-border/60"
          fallbackClassName="text-[9px] font-semibold"
        />
        <span className="truncate">{label}</span>
      </span>
    );
  }, [currentUserDisplayName, getMemberAvatar, memberById, userId]);

  const effectiveDesignerFilter = viewMode === "assignee" ? ALL_DESIGNERS_FILTER : designerFilter;

  useEffect(() => {
    const filterKey = [
      "filters",
      effectiveTeamId ?? "",
      effectiveDesignerFilter,
      managerFilter,
      isManagerUser ? "manager-user" : "not-manager-user",
    ].join(":");
    if (!effectiveTeamId) return;
    if (
      effectiveDesignerFilter === ALL_DESIGNERS_FILTER &&
      (isManagerUser || managerFilter === ALL_MANAGERS_FILTER)
    ) {
      return;
    }
    if (loading || refreshing) return;
    if (!hasMoreTasks && tasks.length < DESIGN_PAGE_CACHE_LIMIT) return;
    void loadTasks({ force: true, fetchAll: true, fullFetchKey: filterKey });
  }, [
    effectiveDesignerFilter,
    effectiveTeamId,
    hasMoreTasks,
    isManagerUser,
    loadTasks,
    loading,
    managerFilter,
    refreshing,
    tasks.length,
  ]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleTasks.filter((task) => {
      const isLinkedTask = isUuid(task.quoteId);
      if (contentView === "linked" && !isLinkedTask) return false;
      if (contentView === "standalone" && isLinkedTask) return false;

      if (statusFilter !== "all" && task.status !== statusFilter) return false;

      if (effectiveDesignerFilter === NO_DESIGNER_FILTER && task.assigneeUserId) return false;
      if (
        effectiveDesignerFilter !== ALL_DESIGNERS_FILTER &&
        effectiveDesignerFilter !== NO_DESIGNER_FILTER &&
        task.assigneeUserId !== effectiveDesignerFilter
      ) {
        return false;
      }

      if (!isManagerUser && managerFilter !== ALL_MANAGERS_FILTER && task.quoteManagerUserId !== managerFilter) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        task.designTaskNumber,
        task.quoteNumber,
        task.title,
        task.customerName,
        task.productName,
        task.designTaskType ? DESIGN_TASK_TYPE_LABELS[task.designTaskType] : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [contentView, effectiveDesignerFilter, isManagerUser, managerFilter, search, statusFilter, visibleTasks]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter !== "all" ||
    effectiveDesignerFilter !== ALL_DESIGNERS_FILTER ||
    (!isManagerUser && managerFilter !== ALL_MANAGERS_FILTER);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setDesignerFilter(ALL_DESIGNERS_FILTER);
    setManagerFilter(isManagerUser && userId ? userId : ALL_MANAGERS_FILTER);
  }, [isManagerUser, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !effectiveTeamId) return;
    writeDesignSessionCache(`design-page-filters:${effectiveTeamId}`, {
      contentView,
      viewMode,
      search,
      statusFilter,
      designerFilter,
      managerFilter,
      timelineZoom,
      assigneeSpotlight,
      completedPeriod,
      cachedAt: Date.now(),
    } satisfies DesignPageFiltersState);
  }, [
    effectiveTeamId,
    contentView,
    viewMode,
    search,
    statusFilter,
    designerFilter,
    managerFilter,
    timelineZoom,
    assigneeSpotlight,
    completedPeriod,
  ]);

  useEffect(() => {
    const hasActive = Object.values(timerSummaryByTaskId).some((summary) => !!summary.activeStartedAt);
    if (!hasActive) return;
    const interval = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerSummaryByTaskId]);

  useEffect(() => {
    setTasksFetchLimit(viewMode === "kanban" ? DESIGN_KANBAN_INITIAL_PAGE_SIZE : DESIGN_LIST_PAGE_SIZE);
  }, [effectiveTeamId, viewMode]);

  useLayoutEffect(() => {
    if (viewMode !== "kanban") return;
    if (typeof window === "undefined") return;

    const scrollingElement = document.scrollingElement;
    scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const viewport = desktopKanbanViewportRef.current;
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "kanban") return;
    if (typeof window === "undefined") return;

    const viewport = desktopKanbanViewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    const measure = () => {
      frameId = 0;
      const rect = viewport.getBoundingClientRect();
      const nextHeight = Math.max(320, Math.floor(window.innerHeight - rect.top - 12));
      setDesktopKanbanViewportHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;

    resizeObserver?.observe(viewport);
    if (viewport.parentElement) {
      resizeObserver?.observe(viewport.parentElement);
    }

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [viewMode, filteredTasks.length]);

  useEffect(() => {
    if (viewMode !== "kanban") return;
    if (!hasMoreTasks || loading || refreshing) return;
    if (typeof window === "undefined") return;

    const viewport = desktopKanbanViewportRef.current;
    if (!viewport) return;

    const releaseLock = () => {
      tasksKanbanAutoloadLockRef.current = false;
      if (tasksKanbanAutoloadTimerRef.current) {
        window.clearTimeout(tasksKanbanAutoloadTimerRef.current);
        tasksKanbanAutoloadTimerRef.current = null;
      }
    };

    const queueLoadMore = () => {
      if (document.visibilityState === "hidden") return;
      if (tasksKanbanAutoloadLockRef.current) return;
      tasksKanbanAutoloadLockRef.current = true;
      void loadTasks({ append: true });
      tasksKanbanAutoloadTimerRef.current = window.setTimeout(releaseLock, KANBAN_AUTOLOAD_LOCK_MS);
    };

    const maybeLoadMore = (node: HTMLElement) => {
      const overflow = node.scrollHeight - node.clientHeight;
      if (overflow <= KANBAN_AUTOLOAD_THRESHOLD_PX) return;
      const remaining = overflow - node.scrollTop;
      if (remaining <= KANBAN_AUTOLOAD_THRESHOLD_PX) {
        queueLoadMore();
      }
    };

    const columnBodies = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-kanban-column-body='true']")
    );
    if (columnBodies.length === 0) return;

    const handleColumnScroll = (event: Event) => {
      const node = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      if (!node) return;
      maybeLoadMore(node);
    };

    columnBodies.forEach((node) => {
      node.addEventListener("scroll", handleColumnScroll, { passive: true });
    });

    return () => {
      columnBodies.forEach((node) => {
        node.removeEventListener("scroll", handleColumnScroll);
      });
      releaseLock();
    };
  }, [hasMoreTasks, loading, refreshing, viewMode, loadTasks]);

  const handleLoadMoreTasks = useCallback(() => {
    if (loading || refreshing || !hasMoreTasks) return;
    void loadTasks({ append: true });
  }, [hasMoreTasks, loading, refreshing, loadTasks]);

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

  const workloadSourceTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isLinkedTask = isUuid(task.quoteId);
      if (contentView === "linked" && !isLinkedTask) return false;
      if (contentView === "standalone" && isLinkedTask) return false;
      if (!isManagerUser && managerFilter !== ALL_MANAGERS_FILTER && task.quoteManagerUserId !== managerFilter) {
        return false;
      }
      return true;
    });
  }, [contentView, isManagerUser, managerFilter, tasks]);

  const getTaskEstimateMinutes = (task: DesignTask) => {
    return getDesignTaskEstimateMinutes(task);
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
    const baseDays = timelineData.days;
    if (baseDays.length === 0) {
      return {
        columns: [] as Array<{ start: Date; end: Date; dayCount: number }>,
        visibleStart: null as Date | null,
        visibleEnd: null as Date | null,
        totalDays: 0,
        todayOffset: -1,
      };
    }

    const normalizeDate = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const addDays = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    const daysDiff = (from: Date, to: Date) =>
      Math.round(
        (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
          (1000 * 60 * 60 * 24)
      );
    const startOfWeek = (value: Date) => {
      const normalized = normalizeDate(value);
      const day = normalized.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      return addDays(normalized, diff);
    };
    const endOfWeek = (value: Date) => addDays(startOfWeek(value), 6);
    const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
    const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0);

    const visibleStart = normalizeDate(baseDays[0]);
    const visibleEnd = normalizeDate(baseDays[baseDays.length - 1]);
    const today = normalizeDate(new Date());

    if (timelineZoom === "day") {
      const columns = baseDays.map((day) => {
        const start = normalizeDate(day);
        return { start, end: start, dayCount: 1 };
      });
      return {
        columns,
        visibleStart,
        visibleEnd,
        totalDays: columns.length,
        todayOffset: Math.max(0, Math.min(columns.length - 1, daysDiff(visibleStart, today))),
      };
    }

    if (timelineZoom === "week") {
      const first = startOfWeek(visibleStart);
      const last = endOfWeek(visibleEnd);
      const columns: Array<{ start: Date; end: Date; dayCount: number }> = [];
      let cursor = first;
      while (cursor.getTime() <= last.getTime()) {
        const start = cursor;
        const end = endOfWeek(start);
        columns.push({ start, end, dayCount: daysDiff(start, end) + 1 });
        cursor = addDays(end, 1);
      }
      return {
        columns,
        visibleStart: first,
        visibleEnd: last,
        totalDays: daysDiff(first, last) + 1,
        todayOffset: Math.max(0, Math.min(daysDiff(first, last), daysDiff(first, today))),
      };
    }

    const first = startOfMonth(visibleStart);
    const last = endOfMonth(visibleEnd);
    const columns: Array<{ start: Date; end: Date; dayCount: number }> = [];
    let cursor = first;
    while (cursor.getTime() <= last.getTime()) {
      const start = cursor;
      const end = endOfMonth(start);
      columns.push({ start, end, dayCount: daysDiff(start, end) + 1 });
      cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    }
    return {
      columns,
      visibleStart: first,
      visibleEnd: last,
      totalDays: daysDiff(first, last) + 1,
      todayOffset: Math.max(0, Math.min(daysDiff(first, last), daysDiff(first, today))),
    };
  }, [timelineData.days, timelineZoom]);

  const assigneeGrouped = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string | null;
        label: string;
        tasks: DesignTask[];
        estimateMinutesTotal: number;
        tasksWithoutEstimate: number;
      }
    >();

    designerMembers.forEach((member) => {
      map.set(member.id, {
        id: member.id,
        label: member.label,
        tasks: [],
        estimateMinutesTotal: 0,
        tasksWithoutEstimate: 0,
      });
    });

    Object.keys(completedByAssignee).forEach((memberId) => {
      if (map.has(memberId)) return;
      map.set(memberId, {
        id: memberId,
        label: getMemberLabel(memberId),
        tasks: [],
        estimateMinutesTotal: 0,
        tasksWithoutEstimate: 0,
      });
    });

    workloadSourceTasks.forEach((task) => {
      const key = task.assigneeUserId ?? "__unassigned__";
      if (!map.has(key)) {
        map.set(key, {
          id: task.assigneeUserId ?? null,
          label: task.assigneeUserId ? getTaskAssigneeLabel(task) : "Без виконавця",
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

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        workload: group.id ? calculateDesignWorkload(group.tasks) : null,
      }))
      .sort((a, b) => {
        if (!a.id && b.id) return 1;
        if (a.id && !b.id) return -1;
        if (a.workload && b.workload && a.workload.score !== b.workload.score) {
          return a.workload.score - b.workload.score;
        }
        if (a.workload && b.workload && a.workload.overdueCount !== b.workload.overdueCount) {
          return a.workload.overdueCount - b.workload.overdueCount;
        }
        if (a.tasks.length !== b.tasks.length) return a.tasks.length - b.tasks.length;
        return a.label.localeCompare(b.label, "uk");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedByAssignee, designerMembers, memberById, workloadSourceTasks]);

  const recommendedAssigneeGroup = useMemo(() => {
    return assigneeGrouped.find((group) => group.id) ?? null;
  }, [assigneeGrouped]);

  const designerLoadById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateDesignWorkload>>();
    assigneeGrouped.forEach((group) => {
      if (group.id && group.workload) map.set(group.id, group.workload);
    });
    return map;
  }, [assigneeGrouped]);

  const timelineSummary = useMemo(() => {
    const today = new Date();
    const rows = timelineData.rows;
    const overdue = rows.filter((row) => row.isOverdue).length;
    const startRisk = rows.filter((row) => row.isStartRisk).length;
    const noEstimate = rows.filter((row) => !row.hasEstimate).length;
    const dueToday = rows.filter((row) => {
      const end = row.end;
      return (
        end.getFullYear() === today.getFullYear() &&
        end.getMonth() === today.getMonth() &&
        end.getDate() === today.getDate()
      );
    }).length;
    const dueThisWeek = rows.filter((row) => {
      const diff = row.end.getTime() - today.getTime();
      const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    }).length;

    return {
      scheduled: rows.length,
      overdue,
      startRisk,
      noEstimate,
      dueToday,
      dueThisWeek,
      noDeadline: timelineData.noDeadlineTasks.length,
    };
  }, [timelineData.noDeadlineTasks.length, timelineData.rows]);

  const assigneeOverview = useMemo(() => {
    const activeGroups = assigneeGrouped.filter((group) => group.id);
    const totalEstimateMinutes = assigneeGrouped.reduce((sum, group) => sum + group.estimateMinutesTotal, 0);
    const totalTrackedSeconds = assigneeGrouped.reduce(
      (sum, group) => sum + group.tasks.reduce((taskSum, task) => taskSum + getTaskTrackedSeconds(task.id), 0),
      0
    );
    const busyCount = activeGroups.filter((group) => {
      if (!group.workload) return false;
      return group.workload.level === "high" || group.workload.level === "critical";
    }).length;
    const unassignedCount = assigneeGrouped.find((group) => !group.id)?.tasks.length ?? 0;
    const availableNowCount = activeGroups.filter((group) => group.workload?.level === "low").length;
    const criticalCount = activeGroups.filter((group) => group.workload?.level === "critical").length;

    return {
      activeDesigners: activeGroups.length,
      totalEstimateMinutes,
      totalTrackedSeconds,
      busyCount,
      unassignedCount,
      availableNowCount,
      criticalCount,
    };
  }, [assigneeGrouped, getTaskTrackedSeconds]);

  const sortedDesignerCapacityOptions = useMemo(
    () =>
      [...designerMembers].sort((a, b) => {
        const aWorkload = designerLoadById.get(a.id);
        const bWorkload = designerLoadById.get(b.id);
        if (aWorkload && bWorkload && aWorkload.score !== bWorkload.score) {
          return aWorkload.score - bWorkload.score;
        }
        if (aWorkload && !bWorkload) return -1;
        if (!aWorkload && bWorkload) return 1;
        return a.label.localeCompare(b.label, "uk", { sensitivity: "base" });
      }),
    [designerLoadById, designerMembers]
  );

  const assigneeVisibleGroups = useMemo(() => {
    if (assigneeSpotlight === ALL_ASSIGNEE_SPOTLIGHT) return assigneeGrouped;
    if (assigneeSpotlight === NO_DESIGNER_FILTER) return assigneeGrouped.filter((group) => !group.id);
    return assigneeGrouped.filter((group) => group.id === assigneeSpotlight);
  }, [assigneeGrouped, assigneeSpotlight]);

  useEffect(() => {
    if (assigneeSpotlight === ALL_ASSIGNEE_SPOTLIGHT) return;
    if (assigneeSpotlight === NO_DESIGNER_FILTER) {
      if (assigneeGrouped.some((group) => !group.id)) return;
      setAssigneeSpotlight(ALL_ASSIGNEE_SPOTLIGHT);
      return;
    }
    if (!assigneeGrouped.some((group) => group.id === assigneeSpotlight)) {
      setAssigneeSpotlight(ALL_ASSIGNEE_SPOTLIGHT);
    }
  }, [assigneeGrouped, assigneeSpotlight]);

  const selectedAssignee = useMemo(
    () => designerMembers.find((member) => member.id === createAssigneeUserId) ?? null,
    [designerMembers, createAssigneeUserId]
  );
  const selectedManager = useMemo(
    () => managerMembers.find((member) => member.id === createManagerUserId) ?? null,
    [managerMembers, createManagerUserId]
  );

  const handleCreatedParty = (created: CreatedCustomerLead) => {
    const label = getCreatedCustomerLeadLabel(created);
    const next = toCustomerLeadOption(created);
    setCustomers((prev) => {
      return upsertByIdAndEntityType(prev, next).sort((a, b) => a.label.localeCompare(b.label, "uk"));
    });
    setCreateCustomerOptions((prev) =>
      upsertByIdAndEntityType(prev, next).sort((a, b) => a.label.localeCompare(b.label, "uk"))
    );
    setCreateCustomer(label);
    setCreateCustomerId(created.id);
    setCreateCustomerLogoUrl(normalizeLogoUrl(created.logoUrl));
    setCreateCustomerType(created.entityType);
    setCreateCustomerSearch(label);
  };

  const customerLeadCreate = useCustomerLeadCreate({
    teamId: effectiveTeamId,
    defaultManagerLabel: userId ? getMemberLabel(userId) : "",
    teamMembers: managerMembers,
    onCreated: handleCreatedParty,
    resolveErrorMessage: getErrorMessage,
    customerDialogTitle: "Новий замовник",
    customerDialogDescription: "Додайте дані замовника для подальшої роботи в дизайн-задачах.",
    customerSubmitLabel: "Створити замовника",
    leadDialogTitle: "Новий лід",
    leadDialogDescription: "Додайте контакт ліда для подальшої роботи в дизайн-задачах.",
    leadSubmitLabel: "Створити ліда",
  });

  useEffect(() => {
    if (!createDialogOpen) return;
    if (!userId) return;
    setCreateManagerUserId((prev) => (prev && prev !== "none" ? prev : userId));
    if (shouldForceSelfAssignee) {
      setCreateAssigneeUserId(userId);
    }
  }, [createDialogOpen, userId, shouldForceSelfAssignee]);

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
    if (!canChangeDesignStatus({
      currentStatus: draggedTask.status,
      nextStatus,
      canManageAssignments: canManageDesignStatuses,
      isAssignedToCurrentUser: !!userId && draggedTask.assigneeUserId === userId,
    })) {
      toast.error("Ви не можете перевести задачу в цей статус");
      return;
    }
    void handleStatusChange(draggedTask, nextStatus);
  };

  const handleStatusChange = async (task: DesignTask, next: DesignStatus, options?: { estimateMinutes?: number }) => {
    if (!effectiveTeamId || task.status === next) return;
    if (
      !canChangeDesignStatus({
        currentStatus: task.status,
        nextStatus: next,
        canManageAssignments: canManageDesignStatuses,
        isAssignedToCurrentUser: !!userId && task.assigneeUserId === userId,
      })
    ) {
      toast.error("Ви не можете перевести задачу в цей статус");
      return;
    }
    const statusChangedAt = typeof task.metadata?.status_changed_at === "string" ? task.metadata.status_changed_at : null;
    const deadlineUpdatedAt =
      typeof task.metadata?.deadline_updated_at === "string" ? task.metadata.deadline_updated_at : null;
    const deadlineWasUpdatedAfterCurrentStatus =
      !!deadlineUpdatedAt &&
      (!statusChangedAt || new Date(deadlineUpdatedAt).getTime() > new Date(statusChangedAt).getTime());
    if (next === "changes" && !deadlineWasUpdatedAfterCurrentStatus) {
      toast.error("Щоб повернути задачу в «Правки», спочатку оновіть дедлайн у самій дизайн-задачі.");
      return;
    }
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
      status_changed_at: new Date().toISOString(),
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
            assignee_user_id: task.assigneeUserId ?? null,
            design_task_type: task.designTaskType ?? null,
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
    const nextAssigneeAvatarUrl = getMemberAvatar(nextAssigneeUserId);
    const previousAssigneeAvatarUrl = task.assigneeAvatarUrl ?? getMemberAvatar(previousAssignee);
    nextMetadata.assignee_label = nextAssigneeUserId ? nextAssigneeLabel : null;
    nextMetadata.assignee_avatar_url = nextAssigneeUserId ? nextAssigneeAvatarUrl : null;

    setTasks((prev) =>
      prev.map((row) =>
        row.id === task.id
          ? {
              ...row,
              assigneeUserId: nextAssigneeUserId,
              assignedAt: nextAssignedAt,
              assigneeLabel: nextAssigneeUserId ? nextAssigneeLabel : null,
              assigneeAvatarUrl: nextAssigneeUserId ? nextAssigneeAvatarUrl : null,
              metadata: nextMetadata,
            }
          : row
      )
    );

    try {
      const query = supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);

      const { error: updateError } = await query;
      if (updateError) throw updateError;

      if (previousAssignee !== nextAssigneeUserId) {
        await pauseDesignTaskTimer({ teamId: effectiveTeamId, taskId: task.id });
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
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
            from_assignee_avatar_url: previousAssignee ? previousAssigneeAvatarUrl ?? null : null,
            to_assignee_user_id: nextAssigneeUserId,
            to_assignee_label: nextAssigneeUserId ? nextAssigneeLabel : null,
            to_assignee_avatar_url: nextAssigneeUserId ? nextAssigneeAvatarUrl : null,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task assignment event", logError);
      }

      const quoteLabel = `#${getTaskDisplayNumber(task)}`;
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
      const candidatePaths = [`teams/${params.teamId}/design-brief-files/${params.taskId}/${baseName}`];

      let storagePath = "";
      let storedContentType: string | null = file.type || null;
      let storedSize = file.size;
      let lastError: unknown = null;
      for (const candidate of candidatePaths) {
        try {
          const uploadResult = await uploadAttachmentWithVariants({
            bucket: DESIGN_FILES_BUCKET,
            storagePath: candidate,
            file,
            cacheControl: STORAGE_CACHE_CONTROL,
          });
          storagePath = uploadResult.storagePath;
          storedContentType = uploadResult.contentType || storedContentType;
          storedSize = uploadResult.size || storedSize;
          lastError = null;
          break;
        } catch (uploadError) {
          lastError = uploadError;
        }
      }

      if (!storagePath) {
        console.error("Failed to upload standalone design brief file", lastError);
        throw new Error(`Не вдалося завантажити файл: ${file.name}`);
      }

      uploaded.push({
        id: crypto.randomUUID(),
        file_name: file.name,
        file_size: storedSize,
        mime_type: storedContentType,
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
    const customerName = createCustomer.trim();
    if (!subject) {
      setCreateError("Вкажіть назву задачі.");
      return;
    }
    if (!customerName) {
      toast.error("Замовник/лід обов'язковий");
      return;
    }
    if (!createDesignTaskType) {
      setCreateError("Оберіть тип дизайнерської задачі.");
      return;
    }

    setCreateSaving(true);
    setCreateError(null);
    try {
      const assigneeUserId = shouldForceSelfAssignee
        ? (userId ?? null)
        : (createAssigneeUserId === "none" ? null : createAssigneeUserId);
      const managerUserId =
        createManagerUserId === "none"
          ? (userId ?? null)
          : createManagerUserId;
      const assignedAt = assigneeUserId ? new Date().toISOString() : null;
      const entityId = `standalone-${crypto.randomUUID()}`;
      const actorName = userId ? getMemberLabel(userId) : "System";
      const managerLabel = managerUserId ? getMemberLabel(managerUserId) : actorName;
      const assigneeLabel = assigneeUserId ? getMemberLabel(assigneeUserId) : null;
      const assigneeAvatarUrl = assigneeUserId ? getMemberAvatar(assigneeUserId) : null;
      const brief = createBrief.trim();
      const customerType = createCustomerType;
      const customerId = createCustomerId;
      const customerLogoUrl = normalizeLogoUrl(createCustomerLogoUrl);
      const normalizedDeadlineTime = isValidDeadlineTime(createDeadlineTime.trim())
        ? createDeadlineTime.trim()
        : DEFAULT_CREATE_DEADLINE_TIME;
      const deadline = createDeadline ? `${format(createDeadline, "yyyy-MM-dd")}T${normalizedDeadlineTime}:00` : null;
      const createdAtIso = new Date().toISOString();
      const designTaskNumber = await getNextDesignTaskNumber(effectiveTeamId, createdAtIso);

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
            task_owner_role: permissions.isDesigner ? "designer" : "manager",
            created_by_user_id: userId ?? null,
            status: "new",
            design_task_number: designTaskNumber,
            quote_id: null,
            assignee_user_id: assigneeUserId,
            assignee_label: assigneeLabel,
            assignee_avatar_url: assigneeAvatarUrl,
            assigned_at: assignedAt,
            manager_user_id: managerUserId,
            manager_label: managerLabel,
            customer_id: customerId,
            customer_name: customerName || null,
            customer_type: customerName ? customerType : null,
            customer_logo_url: customerLogoUrl,
            design_task_type: createDesignTaskType,
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
        designTaskType: parseDesignTaskType(metadata.design_task_type),
        assigneeUserId:
          typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id
            ? (metadata.assignee_user_id as string)
            : null,
        quoteManagerUserId:
          typeof metadata.manager_user_id === "string" && metadata.manager_user_id.trim()
            ? metadata.manager_user_id.trim()
            : managerUserId,
        assignedAt: typeof metadata.assigned_at === "string" ? (metadata.assigned_at as string) : null,
        assigneeLabel:
          typeof metadata.assignee_label === "string" && metadata.assignee_label.trim()
            ? metadata.assignee_label.trim()
            : null,
        assigneeAvatarUrl:
          typeof metadata.assignee_avatar_url === "string" && metadata.assignee_avatar_url.trim()
            ? sanitizeImageReference(metadata.assignee_avatar_url)
            : null,
        metadata,
        designTaskNumber:
          (typeof metadata.design_task_number === "string" && metadata.design_task_number.trim()
            ? metadata.design_task_number.trim()
            : designTaskNumber),
        quoteNumber: null,
        customerName: typeof metadata.customer_name === "string" ? (metadata.customer_name as string) : null,
        customerLogoUrl:
          typeof metadata.customer_logo_url === "string" && metadata.customer_logo_url.trim()
            ? sanitizeImageReference(normalizeLogoUrl(metadata.customer_logo_url as string))
            : null,
        customerId:
          typeof metadata.customer_id === "string" && metadata.customer_id.trim()
            ? metadata.customer_id.trim()
            : null,
        customerType:
          typeof metadata.customer_type === "string"
            ? (metadata.customer_type.trim().toLowerCase() === "lead"
                ? "lead"
                : metadata.customer_type.trim().toLowerCase() === "customer"
                  ? "customer"
                : null)
            : null,
        methodsCount: 0,
        hasFiles: createFiles.length > 0,
        designDeadline: (metadata.design_deadline as string | null) ?? (metadata.deadline as string | null) ?? null,
        createdAt: createdRow.created_at,
      };
      setTasks((prev) => {
        const nextTasks = [createdTask, ...prev];
        if (typeof window !== "undefined") {
          writeDesignSessionCache(`design-page-cache:${effectiveTeamId}`, buildDesignPageCachePayload(nextTasks));
        }
        return nextTasks;
      });

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

      const createdTaskHref = `/design/${createdTask.id}`;
      const createdTaskLabel = createdTask.designTaskNumber ?? "Без номера";

      setCreateDialogOpen(false);
      setCreateTitle("");
      setCreateBrief("");
      setCreateCustomer("");
      setCreateCustomerId(null);
      setCreateCustomerLogoUrl(null);
      setCreateCustomerType("customer");
      setCreateCustomerSearch("");
      setCreateDesignTaskType(null);
      setCreateDeadline(createDefaultDesignDeadline());
      setCreateDeadlinePopoverOpen(false);
      setCreateManagerUserId(userId ?? "none");
      setCreateManagerPopoverOpen(false);
      setCreateAssigneeUserId("none");
      setCreateAssigneePopoverOpen(false);
      setCreateFilesDragActive(false);
      setCreateFiles([]);
      toast.success("Дизайн-задачу створено", {
        description: `Задача ${createdTaskLabel}${createdTask.assigneeUserId ? ` · ${getMemberLabel(createdTask.assigneeUserId)}` : ""}`,
        action: {
          label: "Відкрити",
          onClick: () => navigate(createdTaskHref),
        },
      });
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
      const storageFiles = collectDesignTaskStorageFiles(targetTask.metadata);
      await Promise.all(storageFiles.map((file) => removeAttachmentWithVariants(file.bucket, file.path)));

      if (isUuid(targetTask.quoteId) && storageFiles.length > 0) {
        const { error: quoteAttachmentDeleteError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .delete()
          .eq("quote_id", targetTask.quoteId)
          .in(
            "storage_path",
            storageFiles.map((file) => file.path)
          );
        if (quoteAttachmentDeleteError) throw quoteAttachmentDeleteError;
      }

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

  const openRenameDialog = (task: DesignTask) => {
    if (!userId || (task.assigneeUserId !== userId && !canManageAssignments)) return;
    setTaskToRename(task);
    setRenameError(null);
    setRenameDialogOpen(true);
  };

  const submitRenameDialog = async (nextTitle: string) => {
    if (!effectiveTeamId || !taskToRename || !userId) return;
    if (taskToRename.assigneeUserId !== userId && !canManageAssignments) return;
    const normalizedTitle = nextTitle.trim();
    if (!normalizedTitle) {
      setRenameError("Вкажіть назву задачі.");
      return;
    }

    const previousTask = taskToRename;
    const previousTitle = previousTask.title?.trim() || "";
    if (previousTitle === normalizedTitle) {
      setRenameDialogOpen(false);
      setTaskToRename(null);
      setRenameError(null);
      return;
    }

    const nextTask = { ...previousTask, title: normalizedTitle };
    const nextTasks = tasks.map((row) => (row.id === previousTask.id ? nextTask : row));
    setRenameError(null);
    setRenamingTaskId(previousTask.id);
    setTasks(nextTasks);

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ title: normalizedTitle })
        .eq("id", previousTask.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: previousTask.id,
        quoteId: previousTask.quoteId,
        userId,
        actorName: actorLabel,
        action: "design_task_title",
        title: `Назва задачі: ${previousTitle || "Без назви"} → ${normalizedTitle}`,
        metadata: {
          source: "design_task_title",
          from_title: previousTitle || null,
          to_title: normalizedTitle,
        },
      });

      if (typeof window !== "undefined") {
        writeDesignSessionCache(`design-page-cache:${effectiveTeamId}`, buildDesignPageCachePayload(nextTasks));
      }

      toast.success("Назву задачі оновлено");
      setRenameDialogOpen(false);
      setTaskToRename(null);
    } catch (e: unknown) {
      setTasks((prev) => prev.map((row) => (row.id === previousTask.id ? previousTask : row)));
      const message = getErrorMessage(e, "Не вдалося оновити назву задачі");
      setRenameError(message);
      setError(message);
      toast.error(message);
    } finally {
      setRenamingTaskId(null);
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
    const isAttachedFromStandalone = isTaskAttachedFromStandalone(task) && isLinkedQuote;
    const partyLabel = getTaskPartyLabel();
    const assigneeLabel = getTaskAssigneeLabel(task);
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
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {isLinkedQuote ? (
                <HoverCopyText
                  value={getTaskDisplayNumber(task)}
                  textClassName="font-mono text-[13px] font-medium text-muted-foreground tracking-wide whitespace-nowrap hover:underline"
                  successMessage="Номер прорахунку скопійовано"
                  copyLabel="Скопіювати номер прорахунку"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/orders/estimates/${task.quoteId}`);
                  }}
                />
              ) : (
                <HoverCopyText
                  value={getTaskDisplayNumber(task)}
                  textClassName="font-mono text-[13px] font-medium text-muted-foreground tracking-wide whitespace-nowrap"
                  successMessage="Номер дизайн-задачі скопійовано"
                  copyLabel="Скопіювати номер дизайн-задачі"
                  title={task.title ?? getTaskDisplayNumber(task)}
                />
              )}
              {isAttachedFromStandalone ? (
                <Badge variant="outline" className="h-5 px-2 text-[10px]">
                  Привʼязано
                </Badge>
              ) : null}
            </div>
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
                {userId && (task.assigneeUserId === userId || canManageAssignments) ? (
                  <DropdownMenuItem onClick={() => openRenameDialog(task)}>Редагувати назву</DropdownMenuItem>
                ) : null}
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
              {canMarkTaskReady(task) ? (
                <DropdownMenuItem onClick={() => handleStatusChange(task, "pm_review")}>
                  Позначити як дизайн готовий
                </DropdownMenuItem>
              ) : null}
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
              {getAllowedStatusTransitions(task)
                .filter((target) => target.id !== "pm_review")
                .map((target) => (
                <DropdownMenuItem key={target.id} onClick={() => handleStatusChange(task, target.id)}>
                  {getDesignStatusActionLabel(task.status, target.id)}
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
        {isLinkedQuote && task.title ? (
          <div className="mt-2 text-sm font-medium line-clamp-2">{task.title}</div>
        ) : null}
        {!isLinkedQuote && task.title ? (
          <div className="mt-2 text-sm font-medium line-clamp-2">{task.title}</div>
        ) : null}
        {isAttachedFromStandalone ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/6 px-2.5 py-1 text-[11px] text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            <span>Окрема задача привʼязана до прорахунку</span>
          </div>
        ) : null}
        {task.designTaskType ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary">
            {(() => {
              const TypeIcon = DESIGN_TASK_TYPE_ICONS[task.designTaskType];
              return <TypeIcon className="h-3.5 w-3.5" />;
            })()}
            <span>{DESIGN_TASK_TYPE_LABELS[task.designTaskType]}</span>
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2.5 text-[15px] font-medium min-w-0">
            <EntityAvatar
              src={task.customerLogoUrl ?? null}
              name={task.customerName ?? "Замовник / Лід"}
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
          <div className="mt-3 rounded-[var(--radius-inner)] border border-border/60 bg-background/35 px-3 py-2.5">
            <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Товар
            </div>
            <div className="flex items-center gap-2.5">
              {task.productImageUrl ? (
                <KanbanImageZoomPreview
                  imageUrl={task.productImageUrl}
                  zoomImageUrl={task.productZoomImageUrl ?? task.productImageUrl}
                  alt={task.productName}
                  loadStrategy="eager"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border border-border/60 bg-muted/25">
                  <div className="grid h-full w-full place-items-center text-muted-foreground/60">
                    <Package className="h-4 w-4" />
                  </div>
                </div>
              )}
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
            {task.assigneeUserId ? (
              <AvatarBase
                src={getTaskAssigneeAvatar(task)}
                name={assigneeLabel}
                fallback={getInitials(assigneeLabel)}
                size={26}
                className="text-[10px] font-semibold"
                availability={getMemberAvailability(task.assigneeUserId)}
                presence={task.assigneeUserId && onlineMemberIds.has(task.assigneeUserId) ? "online" : "offline"}
              />
            ) : (
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
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
        {!task.assigneeUserId && canSelfAssign && userId ? (
          <div className="mt-2">
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
          </div>
        ) : null}
      </KanbanCard>
    );
  };

  const designHeaderActions = useMemo(
    () => (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={contentView === "all"}
              onClick={() => setContentView("all")}
              className={SEGMENTED_TRIGGER}
            >
              Всі
              <span className="ml-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{allTasksCount}</span>
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={contentView === "linked"}
              onClick={() => setContentView("linked")}
              className={SEGMENTED_TRIGGER}
            >
              З прорах.
              <span className="ml-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{linkedTasksCount}</span>
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={contentView === "standalone"}
              onClick={() => setContentView("standalone")}
              className={SEGMENTED_TRIGGER}
            >
              Окремі
              <span className="ml-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{standaloneTasksCount}</span>
            </Button>
          </div>
          <div className="flex w-full flex-col gap-2 self-stretch sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:self-auto">
            <div className={cn(SEGMENTED_GROUP, "w-full sm:w-auto")}>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
                className={cn(SEGMENTED_TRIGGER, "gap-1.5")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Kanban</span>
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={viewMode === "timeline"}
                onClick={() => setViewMode("timeline")}
                className={cn(SEGMENTED_TRIGGER, "gap-1.5")}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Timeline</span>
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={viewMode === "assignee"}
                onClick={() => setViewMode("assignee")}
                className={cn(SEGMENTED_TRIGGER, "gap-1.5")}
              >
                <Users className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Дизайнери</span>
              </Button>
            </div>
            <Button
              className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Нова дизайн-задача
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative w-full xl:max-w-[370px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                contentView === "linked"
                  ? "Пошук по задачах з прорахунку..."
                  : contentView === "standalone"
                    ? "Пошук по окремих задачах..."
                    : "Пошук по всіх дизайн-задачах..."
              }
              className={cn(TOOLBAR_CONTROL, "pl-9 pr-9")}
            />
            {search ? (
              <Button
                type="button"
                variant="control"
                size="iconSm"
                aria-label="Очистити пошук"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setSearch("")}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
            {(loading || (refreshing && hasMoreTasks)) && search ? (
              <Loader2 className="absolute right-10 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:flex-1">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as DesignStatus | "all")}>
              <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[180px]")}>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі статуси</SelectItem>
                {DESIGN_COLUMNS.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {viewMode !== "assignee" ? (
              <Select value={designerFilter} onValueChange={setDesignerFilter}>
                <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[220px]")}>
                  <div className="flex min-w-0 items-center">{renderDesignerFilterValue(designerFilter)}</div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DESIGNERS_FILTER}>{renderDesignerFilterValue(ALL_DESIGNERS_FILTER)}</SelectItem>
                  <SelectItem value={NO_DESIGNER_FILTER}>{renderDesignerFilterValue(NO_DESIGNER_FILTER)}</SelectItem>
                  {designerFilterOptions.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {renderDesignerFilterValue(member.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {isManagerUser ? (
              <div
                className={cn(
                  TOOLBAR_CONTROL,
                  "flex w-full cursor-not-allowed items-center justify-start opacity-90 sm:w-[220px]"
                )}
                aria-disabled="true"
                title="Показуються тільки ваші дизайн-задачі"
              >
                <div className="flex h-full min-w-0 items-center gap-2">
                  <AvatarBase
                    src={getMemberAvatar(userId ?? null)}
                    name={currentUserDisplayName || "Менеджер"}
                    fallback={getInitials(currentUserDisplayName || "Менеджер")}
                    size={20}
                    className="border-border/60 shrink-0"
                    fallbackClassName="text-[10px] font-semibold"
                  />
                  <span className="truncate leading-none">
                    {currentUserDisplayName || "Менеджер"}
                  </span>
                </div>
              </div>
            ) : (
              <Select value={managerFilter} onValueChange={setManagerFilter}>
                <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[220px]")}>
                  <div className="flex min-w-0 items-center">{renderManagerFilterValue(managerFilter)}</div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MANAGERS_FILTER}>{renderManagerFilterValue(ALL_MANAGERS_FILTER)}</SelectItem>
                  {managerFilterOptions.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {renderManagerFilterValue(member.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <ActiveHereCard entries={workspacePresence.activeHereEntries} variant="minimal" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFilters}
                className="h-8 w-8 shrink-0 text-muted-foreground"
                title="Скинути фільтри"
                aria-label="Скинути фільтри"
              >
                <FilterX className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="tabular-nums">{loading && tasks.length === 0 ? "…" : filteredTasks.length}</span>
              {(loading || refreshing) ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>
        </div>
      </div>
    ),
    [
      clearFilters,
      contentView,
      allTasksCount,
      currentUserDisplayName,
      designerFilter,
      designerFilterOptions,
      filteredTasks.length,
      getMemberAvatar,
      hasMoreTasks,
      hasActiveFilters,
      isManagerUser,
      linkedTasksCount,
      loading,
      managerFilter,
      managerFilterOptions,
      renderDesignerFilterValue,
      renderManagerFilterValue,
      refreshing,
      search,
      standaloneTasksCount,
      statusFilter,
      tasks.length,
      userId,
      viewMode,
      workspacePresence.activeHereEntries,
    ]
  );

  usePageHeaderActions(designHeaderActions, [designHeaderActions]);

  return (
    <section className="space-y-3 notranslate" translate="no">

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {viewMode === "kanban" ? (
        <EstimatesKanbanCanvas>
          <div className="space-y-3 md:hidden">
            {DESIGN_COLUMNS.map((col) => {
              const items = grouped[col.id] ?? [];
              const Icon = DESIGN_STATUS_ICON_BY_STATUS[col.id];
              return (
                <section key={col.id} className="rounded-[var(--radius-inner)] border border-border/60 bg-card/60">
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", DESIGN_STATUS_ICON_COLOR_BY_STATUS[col.id])} />
                      <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {col.label}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/80">{items.length}</span>
                  </div>
                  <div className="space-y-2 p-2.5">
                    {items.length === 0 ? (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                        Немає задач
                      </div>
                    ) : (
                      items.map((task) => <Fragment key={task.id}>{renderTaskCard(task)}</Fragment>)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <div
            ref={desktopKanbanViewportRef}
            className="hidden min-h-0 overflow-hidden md:block"
            style={
              desktopKanbanViewportHeight
                ? { height: `${desktopKanbanViewportHeight}px` }
                : undefined
            }
          >
            <KanbanBoard className="h-full pb-2 md:pb-3" rowClassName="min-w-[1100px] h-full items-stretch">
              {DESIGN_COLUMNS.map((col) => {
                const items = grouped[col.id] ?? [];
                return (
                  <KanbanColumn
                    key={col.id}
                    className={cn(
                      "kanban-column-surface basis-[320px] h-full transition-colors",
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
                    bodyClassName="px-2.5 pb-1.5 pt-2.5 space-y-2"
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
                      items.map((task) => <Fragment key={task.id}>{renderTaskCard(task, { draggable: true })}</Fragment>)
                    )}
                  </KanbanColumn>
                );
              })}
            </KanbanBoard>
          </div>
        </EstimatesKanbanCanvas>
      ) : null}

      {viewMode === "timeline" ? (
        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
            <div className="rounded-[var(--radius-section)] border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    <CalendarRange className="h-3.5 w-3.5" />
                    Production Timeline
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">План-графік дизайну по дедлайнах і ризиках</h3>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Один екран для черги, дедлайнів і вузьких місць. Акцент на задачах, які треба розрулювати сьогодні, а не просто на списку дат.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/80 p-1">
                  <Button size="sm" variant={timelineZoom === "day" ? "secondary" : "ghost"} onClick={() => setTimelineZoom("day")}>
                    Дні
                  </Button>
                  <Button size="sm" variant={timelineZoom === "week" ? "secondary" : "ghost"} onClick={() => setTimelineZoom("week")}>
                    Тижні
                  </Button>
                  <Button size="sm" variant={timelineZoom === "month" ? "secondary" : "ghost"} onClick={() => setTimelineZoom("month")}>
                    Місяці
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[var(--radius-inner)] border border-border/60 bg-background/85 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">В графіку</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{timelineSummary.scheduled}</div>
                    </div>
                    <Layers3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {timelineSummary.noDeadline > 0 ? `${timelineSummary.noDeadline} задач без дедлайну винесено окремо` : "Усі задачі мають дедлайн"}
                  </div>
                </div>
                <div className="rounded-[var(--radius-inner)] border border-danger-soft-border bg-danger-soft/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-danger-foreground/80">Ризик зриву</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums text-danger-foreground">{timelineSummary.overdue}</div>
                    </div>
                    <AlertTriangle className="h-4 w-4 text-danger-foreground" />
                  </div>
                  <div className="mt-2 text-xs text-danger-foreground/80">{timelineSummary.startRisk} задач мають вузький запас часу на старт</div>
                </div>
                <div className="rounded-[var(--radius-inner)] border border-warning-soft-border bg-warning-soft/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-warning-foreground/90">Фокус сьогодні</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums text-warning-foreground">{timelineSummary.dueToday}</div>
                    </div>
                    <Target className="h-4 w-4 text-warning-foreground" />
                  </div>
                  <div className="mt-2 text-xs text-warning-foreground/90">{timelineSummary.dueThisWeek} задач треба закрити протягом 7 днів</div>
                </div>
                <div className="rounded-[var(--radius-inner)] border border-info-soft-border bg-info-soft/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-info-foreground/90">Без естімейту</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums text-info-foreground">{timelineSummary.noEstimate}</div>
                    </div>
                    <Clock3 className="h-4 w-4 text-info-foreground" />
                  </div>
                  <div className="mt-2 text-xs text-info-foreground/90">Планування неповне, ці задачі гірше прогнозуються</div>
                </div>
              </div>
            </div>

            <div className="rounded-[var(--radius-section)] border border-border/60 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Орієнтири</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">Що означає графік</div>
                </div>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger-foreground" />
                  Вертикальна лінія показує сьогоднішній день.
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-warning-soft-border bg-warning-soft/50 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-warning-foreground" />
                  Жовтий контур сигналізує, що часу до дедлайну мало для старту.
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-danger-soft-border bg-danger-soft/50 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger-foreground" />
                  Червоний контур означає, що задача вже прострочена.
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full border border-border/70 bg-transparent" />
                  Пунктирна смуга означає відсутній естімейт.
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-danger-foreground" />
                Лінія сьогодні
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-warning-soft-border bg-warning-soft/40 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-warning-foreground" />
                Ризик старту
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-danger-soft-border bg-danger-soft/40 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-danger-foreground" />
                Прострочено
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Масштаб: <span className="font-semibold text-foreground">{timelineZoom === "day" ? "по днях" : timelineZoom === "week" ? "по тижнях" : "по місяцях"}</span>
            </div>
          </div>

          {timelineData.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">Немає задач із дедлайном для Timeline.</div>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {timelineData.rows.map((row) => {
                  const statusLabel = DESIGN_COLUMNS.find((col) => col.id === row.task.status)?.label ?? row.task.status;
                  const trackedSeconds = getTaskTrackedSeconds(row.task.id);
                  const progressRatio = row.hasEstimate ? Math.min(1, trackedSeconds / Math.max(1, (row.estimateMinutes ?? 0) * 60)) : 0;
                  return (
                    <button
                      key={row.task.id}
                      className="rounded-[var(--radius-section)] border border-border/60 bg-card/70 p-4 text-left shadow-sm transition-colors hover:bg-card"
                      onClick={() => openTask(row.task.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{getTaskDisplayNumber(row.task)}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{row.task.customerName ?? "Не вказано"}</div>
                        </div>
                        <Badge variant="outline" className={cn("text-[11px]", STATUS_BADGE_CLASS_BY_STATUS[row.task.status])}>
                          {statusLabel}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-[11px]">
                          До {row.end.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {row.hasEstimate ? formatEstimateMinutes(row.estimateMinutes) : "Без естімейту"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            row.isOverdue
                              ? "border-danger-soft-border bg-danger-soft text-danger-foreground"
                              : row.isStartRisk
                                ? "border-warning-soft-border bg-warning-soft text-warning-foreground"
                                : "border-border/60"
                          )}
                        >
                          {row.isOverdue ? "Прострочено" : row.isStartRisk ? "Ризик старту" : "В нормі"}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Прогрес по часу</span>
                          <span>{formatElapsedSeconds(trackedSeconds)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted/70">
                          <div
                            className={cn(
                              "h-2 rounded-full transition-all",
                              row.isOverdue ? "bg-danger-foreground" : row.isStartRisk ? "bg-warning-foreground" : "bg-primary/70"
                            )}
                            style={{ width: `${Math.max(8, Math.round(progressRatio * 100))}%` }}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <AvatarBase
                            src={getTaskAssigneeAvatar(row.task)}
                            name={getTaskAssigneeLabel(row.task)}
                            fallback={getInitials(getTaskAssigneeLabel(row.task))}
                            size={16}
                            className="border-border/70"
                          />
                          {getTaskAssigneeLabel(row.task)}
                        </span>
                        <span>{row.task.productName ?? "Без товару"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-[var(--radius-section)] border border-border/60 bg-card/70 shadow-sm md:block">
                <div
                  className="grid min-w-[1120px]"
                  style={{
                    gridTemplateColumns: `360px ${timelineAxis.columns
                      .map((column) => `minmax(${Math.max(56, column.dayCount * 14)}px, ${column.dayCount}fr)`)
                      .join(" ")}`,
                  }}
                >
                  <div className="sticky left-0 z-20 border-b border-r border-border/50 bg-card/95 px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Черга задач</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">Дедлайн, виконавець, естімейт, прогрес</div>
                  </div>
                  {timelineAxis.columns.map((column, index) => (
                    <div
                      key={`timeline-head-${column.start.toISOString()}-${index}`}
                      className="border-b border-r border-border/40 bg-background/65 px-1 py-3 text-center text-[11px] text-muted-foreground"
                    >
                      <div className="font-medium text-foreground">
                        {timelineZoom === "month"
                          ? column.start.toLocaleDateString("uk-UA", { month: "short" })
                          : column.start.toLocaleDateString("uk-UA", {
                              day: "2-digit",
                              month: timelineZoom === "day" ? undefined : "short",
                            })}
                      </div>
                      <div className="mt-0.5">
                        {timelineZoom === "day"
                          ? column.start.toLocaleDateString("uk-UA", { month: "short" })
                          : timelineZoom === "week"
                            ? column.end.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })
                            : column.start.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}
                      </div>
                    </div>
                  ))}

                  {timelineData.rows.map((row) => {
                    const statusLabel = DESIGN_COLUMNS.find((col) => col.id === row.task.status)?.label ?? row.task.status;
                    const isAttachedFromStandalone = isTaskAttachedFromStandalone(row.task) && isUuid(row.task.quoteId);
                    const axisStart = timelineAxis.visibleStart ?? row.start;
                    const daysDiff = (from: Date, to: Date) =>
                      Math.round(
                        (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
                          (1000 * 60 * 60 * 24)
                      );
                    const offsetDays = Math.max(0, daysDiff(axisStart, row.start));
                    const spanDays = Math.max(1, daysDiff(row.start, row.end) + 1);
                    const totalDays = Math.max(1, timelineAxis.totalDays);
                    const barLeft = `calc(${offsetDays} * (100% / ${totalDays}))`;
                    const barWidth = `calc(${spanDays} * (100% / ${totalDays}))`;
                    const trackedSeconds = getTaskTrackedSeconds(row.task.id);
                    const progressRatio = row.hasEstimate ? Math.min(1, trackedSeconds / Math.max(1, (row.estimateMinutes ?? 0) * 60)) : 0;
                    const progressWidth = `calc(${spanDays * progressRatio} * (100% / ${totalDays}))`;
                    const barTitle = [
                      `${isUuid(row.task.quoteId) ? "Прорахунок" : "Задача"}: ${getTaskDisplayNumber(row.task)}`,
                      `Статус: ${statusLabel}`,
                      `Естімейт: ${row.hasEstimate ? formatEstimateMinutes(row.estimateMinutes) : "немає"}`,
                      `Витрачено: ${formatElapsedSeconds(trackedSeconds)}`,
                      `Дедлайн: ${row.end.toLocaleDateString("uk-UA")}`,
                    ].join(" • ");
                    return (
                      <div key={row.task.id} className="contents">
                        <button
                          className="sticky left-0 z-10 border-b border-r border-border/40 bg-card/95 px-4 py-3 text-left transition-colors hover:bg-muted/20"
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
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">{getTaskDisplayNumber(row.task)}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="truncate">{row.task.customerName ?? "Не вказано"}</span>
                                {isAttachedFromStandalone ? <span className="text-primary">Привʼязано</span> : null}
                                {row.task.productName ? (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{row.task.productName}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <Badge variant="outline" className={cn("text-[11px]", STATUS_BADGE_CLASS_BY_STATUS[row.task.status])}>
                              {statusLabel}
                            </Badge>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <AvatarBase
                                src={getTaskAssigneeAvatar(row.task)}
                                name={getTaskAssigneeLabel(row.task)}
                                fallback={getInitials(getTaskAssigneeLabel(row.task))}
                                size={18}
                                className="shrink-0 border-border/70"
                              />
                              <span className="truncate">{getTaskAssigneeLabel(row.task)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock3 className="h-3.5 w-3.5 shrink-0" />
                              <span>{row.hasEstimate ? formatEstimateMinutes(row.estimateMinutes) : "Без естімейту"}</span>
                              <span>·</span>
                              <span>{formatElapsedSeconds(trackedSeconds)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>До {row.end.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}</span>
                            </div>
                          </div>
                        </button>
                        <div
                          className="relative border-b border-border/40 bg-[linear-gradient(to_right,transparent_0%,transparent_calc(100%_-_1px),hsl(var(--neutral-soft-border)/0.34)_calc(100%_-_1px),hsl(var(--neutral-soft-border)/0.34)_100%)]"
                          style={{ gridColumn: `2 / span ${timelineAxis.columns.length}` }}
                        >
                          <div
                            className="absolute inset-y-0 border-l-2 border-danger-foreground/80 pointer-events-none"
                            style={{ left: `calc(${Math.max(0, timelineAxis.todayOffset)} * (100% / ${Math.max(1, timelineAxis.totalDays)}))` }}
                          />
                          <div className="absolute inset-y-2 left-0 right-0">
                            <div className="relative h-full">
                              <div
                                className={cn(
                                  "absolute top-1/2 h-11 -translate-y-1/2 rounded-2xl border shadow-sm",
                                  row.hasEstimate ? (TIMELINE_BAR_CLASS_BY_STATUS[row.task.status] ?? "bg-primary/20 border-primary/40") : "border-dashed border-border/70 bg-background/70",
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
                                  className="absolute top-1/2 h-11 -translate-y-1/2 rounded-2xl bg-foreground/15"
                                  style={{
                                    left: barLeft,
                                    width: progressWidth,
                                  }}
                                />
                              ) : null}
                              <div
                                className="absolute top-1/2 flex h-11 -translate-y-1/2 items-center justify-between gap-3 px-3 text-[11px] font-medium text-foreground/95 pointer-events-none"
                                style={{
                                  left: barLeft,
                                  width: barWidth,
                                }}
                              >
                                <span className="truncate">{row.hasEstimate ? formatEstimateMinutes(row.estimateMinutes) : "Без естімейту"}</span>
                                <span className="shrink-0 opacity-75">{row.end.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {timelineData.noDeadlineTasks.length > 0 ? (
            <div className="rounded-[var(--radius-section)] border border-border/60 bg-card/70 p-4 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border/50 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Backlog</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">Задачі без дедлайну</div>
                </div>
                <Badge variant="secondary">{timelineData.noDeadlineTasks.length}</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {timelineData.noDeadlineTasks.map((task) => <Fragment key={task.id}>{renderTaskCard(task)}</Fragment>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {viewMode === "assignee" ? (
        <div className="space-y-4 px-4 pt-4 pb-2 sm:px-5 sm:pt-5">
          <section className="rounded-[18px] border border-border/60 bg-background/70 p-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Users className="h-3.5 w-3.5" />
                Balance Team
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Баланс команди дизайнерів</h3>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Тут менеджер бачить тільки головне: кому можна ставити нову задачу зараз, хто вже завантажений, і чи є задачі без виконавця.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
              <div className="space-y-4">
                <div className="border-b border-border/60 pb-5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Рекомендуємо зараз</div>
                  {recommendedAssigneeGroup?.id && recommendedAssigneeGroup.workload ? (
                    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        <AvatarBase
                          src={getMemberAvatar(recommendedAssigneeGroup.id)}
                          name={recommendedAssigneeGroup.label}
                          fallback={getInitials(recommendedAssigneeGroup.label)}
                          size={48}
                          className="border-border/70"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xl font-semibold text-foreground">{recommendedAssigneeGroup.label}</div>
                          <div className="mt-1 text-[15px] text-muted-foreground">{recommendedAssigneeGroup.workload.recommendation}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        <Badge variant="outline" className={cn("px-3 py-1.5 text-[12px]", CAPACITY_BADGE_CLASS_BY_LEVEL[recommendedAssigneeGroup.workload.level])}>
                          {CAPACITY_LABEL_BY_LEVEL[recommendedAssigneeGroup.workload.level]}
                        </Badge>
                        <Badge variant="outline" className="border-border/60 px-3 py-1.5 text-[12px]">
                          {recommendedAssigneeGroup.workload.activeTaskCount} задач
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">Немає доступних дизайнерів для рекомендації.</div>
                  )}
                </div>

                <div className="overflow-hidden rounded-[18px] border border-border/60 bg-background/85">
                  <div className="grid grid-cols-[minmax(260px,1.8fr)_150px_190px] gap-4 border-b border-border/60 px-5 py-4 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    <div>Дизайнер</div>
                    <div>Задачі зараз</div>
                    <div>Навантаження</div>
                  </div>
                  <div className="divide-y divide-border/50">
                    {assigneeGrouped
                      .filter((group) => group.id && group.workload)
                      .map((group, index) => {
                        const workload = group.workload;
                        if (!group.id || !workload) return null;
                        return (
                          <div
                            key={`team-balance-${group.id}`}
                            className={cn(
                              "grid grid-cols-[minmax(260px,1.8fr)_150px_190px] gap-4 px-5 py-5 transition-colors",
                              index === 0 ? "bg-primary/5" : "bg-transparent hover:bg-muted/10"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-4">
                                <AvatarBase
                                  src={getMemberAvatar(group.id)}
                                  name={group.label}
                                  fallback={getInitials(group.label)}
                                  size={40}
                                  className="border-border/70"
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-[18px] font-semibold leading-tight text-foreground">{group.label}</div>
                                  <div className="mt-1 truncate text-sm text-muted-foreground">
                                    {workload.recommendation}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <span className="inline-flex min-w-[56px] items-center justify-center rounded-full border border-border/60 bg-background px-3 py-2 text-base font-semibold tabular-nums text-foreground">
                                {workload.activeTaskCount}
                              </span>
                            </div>
                            <div className="flex items-center">
                              <Badge variant="outline" className={cn("px-3 py-1.5 text-[12px]", CAPACITY_BADGE_CLASS_BY_LEVEL[workload.level])}>
                                {CAPACITY_LABEL_BY_LEVEL[workload.level]}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              <div className="grid gap-0 overflow-hidden rounded-[18px] border border-border/60 bg-background/85">
                <div className="border-b border-border/60 px-5 py-5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Активні дизайнери</div>
                  <div className="mt-2 text-4xl font-semibold tabular-nums text-foreground">{assigneeOverview.activeDesigners}</div>
                  <div className="mt-2 text-[15px] text-muted-foreground">Дизайнери, які зараз у команді</div>
                </div>
                <div className="border-b border-border/60 px-5 py-5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-info-foreground/90">Можна ставити нову задачу</div>
                  <div className="mt-2 text-4xl font-semibold tabular-nums text-info-foreground">{assigneeOverview.availableNowCount}</div>
                  <div className="mt-2 text-[15px] text-info-foreground/80">Людей з низьким поточним навантаженням</div>
                </div>
                <div className="border-b border-border/60 px-5 py-5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-warning-foreground/90">Уже завантажені</div>
                  <div className="mt-2 text-4xl font-semibold tabular-nums text-warning-foreground">{assigneeOverview.busyCount}</div>
                  <div className="mt-2 text-[15px] text-warning-foreground/80">Кому краще не давати звичайні нові задачі</div>
                </div>
                <div className="px-5 py-5">
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-danger-foreground/85">Без виконавця</div>
                  <div className="mt-2 text-4xl font-semibold tabular-nums text-danger-foreground">{assigneeOverview.unassignedCount}</div>
                  <div className="mt-2 text-[15px] text-danger-foreground/80">Задач, які ще треба комусь розподілити</div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3 border-y border-border/60 bg-background/50 px-1 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">Фокус по дизайнеру</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Для менеджера правильний режим такий: спочатку дивитись всю команду, а потім звужуватися на конкретного дизайнера тут, всередині вкладки.
              </div>
            </div>
            <Select value={assigneeSpotlight} onValueChange={setAssigneeSpotlight}>
              <SelectTrigger className="w-full lg:w-[260px]">
                <div className="flex min-w-0 items-center">{renderAssigneeSpotlightValue(assigneeSpotlight)}</div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ASSIGNEE_SPOTLIGHT}>{renderAssigneeSpotlightValue(ALL_ASSIGNEE_SPOTLIGHT)}</SelectItem>
                <SelectItem value={NO_DESIGNER_FILTER}>{renderAssigneeSpotlightValue(NO_DESIGNER_FILTER)}</SelectItem>
                {designerFilterOptions.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {renderAssigneeSpotlightValue(member.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {assigneeVisibleGroups.length === 0 ? (
            <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3 text-center">Немає задач</div>
          ) : (
            <div className="overflow-hidden rounded-[18px] border border-border/60 bg-background/60">
            {assigneeVisibleGroups.map((group, index) => {
              const workload = group.workload;
              const workloadLevel = getWorkloadLevel(group.tasks.length, group.estimateMinutesTotal);
              const statusBreakdown = DESIGN_COLUMNS.map((column) => ({
                ...column,
                count: group.tasks.filter((task) => task.status === column.id).length,
              })).filter((item) => item.count > 0);
              const trackedSecondsTotal = group.tasks.reduce((sum, task) => sum + getTaskTrackedSeconds(task.id), 0);
              const completionRatio = group.estimateMinutesTotal > 0
                ? Math.min(1, trackedSecondsTotal / Math.max(1, group.estimateMinutesTotal * 60))
                : 0;
              const queue = [...group.tasks].sort((a, b) => {
                const aBadge = a.designDeadline ? getDeadlineBadge(a.designDeadline) : { tone: "none" as const };
                const bBadge = b.designDeadline ? getDeadlineBadge(b.designDeadline) : { tone: "none" as const };
                const score = (tone: "none" | "overdue" | "today" | "soon" | "future") => {
                  if (tone === "overdue") return 0;
                  if (tone === "today") return 1;
                  if (tone === "soon") return 2;
                  if (tone === "future") return 3;
                  return 4;
                };
                const byTone = score(aBadge.tone) - score(bBadge.tone);
                if (byTone !== 0) return byTone;
                if (!a.designDeadline && b.designDeadline) return 1;
                if (a.designDeadline && !b.designDeadline) return -1;
                const aTime = a.designDeadline ? new Date(a.designDeadline).getTime() : Number.MAX_SAFE_INTEGER;
                const bTime = b.designDeadline ? new Date(b.designDeadline).getTime() : Number.MAX_SAFE_INTEGER;
                return aTime - bTime;
              });

              return (
                <section
                  key={group.id ?? "unassigned"}
                  className={cn(index !== 0 ? "border-t border-border/60" : "", "bg-transparent")}
                >
                  <div className="border-b border-border/50 bg-background/35 px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {group.id ? (
                            <AvatarBase
                              src={group.id ? getMemberAvatar(group.id) : null}
                              name={group.label}
                              fallback={getInitials(group.label)}
                              size={24}
                              className="shrink-0 border-border/70"
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-foreground">{group.label}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {group.id
                                ? workload?.recommendation ?? "Персональна черга дизайнера"
                                : "Черга задач, які треба розподілити"}
                            </div>
                          </div>
                          {workload ? (
                            <Badge variant="outline" className={cn("text-[11px]", CAPACITY_BADGE_CLASS_BY_LEVEL[workload.level])}>
                              {CAPACITY_LABEL_BY_LEVEL[workload.level]}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={cn("text-[11px]", WORKLOAD_BADGE_CLASS_BY_LEVEL[workloadLevel])}>
                              {WORKLOAD_LABEL_BY_LEVEL[workloadLevel]}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5">
                            <span className="text-muted-foreground">Задач зараз</span>
                            <span className="font-semibold text-foreground">{workload?.activeTaskCount ?? group.tasks.length}</span>
                          </span>
                          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5">
                            <span className="text-muted-foreground">Estimate</span>
                            <span className="font-semibold text-foreground">{formatHoursLoad(workload?.estimateMinutesTotal ?? group.estimateMinutesTotal)}</span>
                          </span>
                          {group.tasksWithoutEstimate > 0 ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-warning-soft-border bg-warning-soft/60 px-3 py-1.5 text-warning-foreground">
                              Без estimate: {group.tasksWithoutEstimate}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="w-full max-w-[360px] border-l border-border/60 pl-0 xl:pl-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Навантаження</div>
                          <div className="text-xs text-muted-foreground">
                            {workload ? `${workload.capacityPercent}%` : `${Math.round(completionRatio * 100)}%`}
                          </div>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-muted/70">
                          <div
                            className={cn(
                              "h-2.5 rounded-full transition-all",
                              workload
                                ? workload.level === "low"
                                  ? "bg-success-foreground/80"
                                  : workload.level === "medium"
                                    ? "bg-info-foreground/80"
                                    : workload.level === "high"
                                      ? "bg-warning-foreground/80"
                                      : "bg-danger-foreground/80"
                                : WORKLOAD_PROGRESS_CLASS_BY_LEVEL[workloadLevel]
                            )}
                            style={{ width: `${Math.max(6, workload?.capacityPercent ?? Math.round(completionRatio * 100))}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {workload?.signals.slice(0, 3).map((signal) => (
                            <Badge key={signal} variant="outline" className="text-[11px] border-border/60 bg-background/70">
                              {signal}
                            </Badge>
                          ))}
                          {statusBreakdown.slice(0, 4).map((status) => (
                            <Badge key={status.id} variant="outline" className="text-[11px]">
                              {status.label}: {status.count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.95fr)]">
                    <div className="space-y-3">
                      {queue.length === 0 ? (
                        <div className="border border-dashed border-border/60 px-4 py-5 text-center text-sm text-muted-foreground">
                          Немає задач у цій черзі
                        </div>
                      ) : (
                        queue.map((task) => {
                          const isLinkedQuote = isUuid(task.quoteId);
                          const isAttachedFromStandalone = isTaskAttachedFromStandalone(task) && isLinkedQuote;
                          const statusLabel = DESIGN_COLUMNS.find((col) => col.id === task.status)?.label ?? task.status;
                          const deadlineBadge = task.designDeadline ? getDeadlineBadge(task.designDeadline) : { label: "Без дедлайну", tone: "none" as const };
                          const estimateMinutes = getTaskEstimateMinutes(task);
                          const trackedSeconds = getTaskTrackedSeconds(task.id);
                          const itemProgressRatio = estimateMinutes ? Math.min(1, trackedSeconds / Math.max(1, estimateMinutes * 60)) : 0;
                          return (
                            <div key={task.id} className="border border-border/60 bg-background/85 p-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <button
                                  className="min-w-0 text-left"
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
                                  title={task.title ?? getTaskDisplayNumber(task)}
                                >
                                  <div className="min-w-0">
                                    <div className="truncate font-mono text-[13px] font-medium tracking-wide text-muted-foreground">
                                      {getTaskDisplayNumber(task)}
                                    </div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground">
                                      {task.customerName ?? "Не вказано"}
                                      {task.productName ? ` · ${task.productName}` : ""}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Badge variant="outline" className={cn("text-[11px]", STATUS_BADGE_CLASS_BY_STATUS[task.status])}>
                                        {statusLabel}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-[11px]",
                                          deadlineBadge.tone === "overdue"
                                            ? "border-danger-soft-border bg-danger-soft text-danger-foreground"
                                            : deadlineBadge.tone === "today" || deadlineBadge.tone === "soon"
                                              ? "border-warning-soft-border bg-warning-soft text-warning-foreground"
                                              : "border-border/60"
                                        )}
                                      >
                                        {deadlineBadge.label}
                                      </Badge>
                                      {task.designTaskType ? (
                                        <Badge variant="outline" className="text-[11px]">
                                          {DESIGN_TASK_TYPE_LABELS[task.designTaskType]}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                </button>
                                <div className="flex shrink-0 items-start gap-2">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => navigate(`/design/${task.id}`)}>Відкрити</DropdownMenuItem>
                                      {userId && (task.assigneeUserId === userId || canManageAssignments) ? (
                                        <DropdownMenuItem onClick={() => openRenameDialog(task)}>Редагувати назву</DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuItem onClick={() => requestReestimate(task)}>Оновити естімейт</DropdownMenuItem>
                                      {canMarkTaskReady(task) ? (
                                        <DropdownMenuItem onClick={() => handleStatusChange(task, "pm_review")}>
                                          Позначити як дизайн готовий
                                        </DropdownMenuItem>
                                      ) : null}
                                      <DropdownMenuSeparator />
                                      {getAllowedStatusTransitions(task)
                                        .filter((target) => target.id !== "pm_review")
                                        .map((target) => (
                                          <DropdownMenuItem key={target.id} onClick={() => handleStatusChange(task, target.id)}>
                                            {getDesignStatusActionLabel(task.status, target.id)}
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

                              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-lg border border-border/50 bg-card/80 px-2.5 py-2">
                                  Джерело
                                  <div className="mt-1 text-sm text-foreground">
                                    {isLinkedQuote ? (isAttachedFromStandalone ? "Привʼязано з окремої" : "Із прорахунку") : "Standalone"}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-border/50 bg-card/80 px-2.5 py-2">
                                  Дедлайн
                                  <div className="mt-1 text-sm text-foreground">{task.designDeadline ? formatDeadlineShort(task.designDeadline) ?? "Без дедлайну" : "Без дедлайну"}</div>
                                </div>
                                <div className="rounded-lg border border-border/50 bg-card/80 px-2.5 py-2">
                                  Estimate
                                  <div className="mt-1 text-sm text-foreground">{formatEstimateMinutes(estimateMinutes)}</div>
                                </div>
                                <div className="rounded-lg border border-border/50 bg-card/80 px-2.5 py-2">
                                  Витрачено
                                  <div className="mt-1 text-sm text-foreground">{formatElapsedSeconds(trackedSeconds)}</div>
                                </div>
                              </div>

                              <div className="mt-3">
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>Прогрес виконання</span>
                                  <span>{Math.round(itemProgressRatio * 100)}%</span>
                                </div>
                                <div className="mt-1.5 h-2 rounded-full bg-muted/70">
                                  <div className="h-2 rounded-full bg-primary/70 transition-all" style={{ width: `${Math.max(8, Math.round(itemProgressRatio * 100))}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="border border-border/60 bg-background/80 p-3">
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Статуси в черзі</div>
                        <div className="mt-3 space-y-2">
                          {statusBreakdown.length > 0 ? (
                            statusBreakdown.map((status) => {
                              const width = Math.max(8, Math.round((status.count / Math.max(1, group.tasks.length)) * 100));
                              return (
                                <div key={status.id}>
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-foreground">{status.label}</span>
                                    <span className="tabular-nums text-muted-foreground">{status.count}</span>
                                  </div>
                                  <div className="mt-1 h-2 rounded-full bg-muted/70">
                                    <div className="h-2 rounded-full bg-primary/60" style={{ width: `${width}%` }} />
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-sm text-muted-foreground">Поки без активних статусів.</div>
                          )}
                        </div>
                      </div>

                      <div className="border border-border/60 bg-background/80 p-3">
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Фокус дій</div>
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                            {group.tasksWithoutEstimate > 0
                              ? `${group.tasksWithoutEstimate} задач без естімейту потребують уточнення перед плануванням.`
                              : "Усі задачі мають estimate і придатні до планування."}
                          </div>
                          <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                            {group.id
                              ? workload?.level === "low"
                                ? "Цьому дизайнеру можна віддавати наступні нові задачі."
                                : workload?.level === "medium"
                                  ? "Планові задачі ще можна ставити, але без перевантаження."
                                  : "Нові задачі сюди краще ставити тільки якщо це справді пріоритет."
                              : "Цей блок показує чергу, яку треба розподілити між дизайнерами."}
                          </div>
                          <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                            {queue[0]?.designDeadline
                              ? `Найближчий дедлайн: ${formatDeadlineShort(queue[0].designDeadline) ?? queue[0].designDeadline}.`
                              : "Немає задач із зафіксованим дедлайном на верхівці черги."}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
            </div>
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
        <DialogContent className="max-w-[420px] notranslate" translate="no">
          <DialogHeader>
            <DialogTitle>Вкажіть естімейт задачі</DialogTitle>
            <DialogDescription>
              Вкажіть тривалість задачі, щоб її можна було коректно призначати і рухати по статусах.
            </DialogDescription>
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
                <SelectContent portalled={false}>
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

      {viewMode !== "kanban" && (((loading && tasks.length === 0) || membersLoading || refreshing)) && (
        <InlineLoading
          label={
            membersLoading
              ? "Завантажуємо учасників..."
              : refreshing
              ? "Оновлюємо задачі..."
              : "Завантажуємо задачі..."
          }
        />
      )}

      {viewMode !== "kanban" && hasMoreTasks && !loading && !membersLoading ? (
        <div className="flex items-center justify-center px-4 pb-6 pt-2 md:px-6">
          <Button variant="outline" onClick={handleLoadMoreTasks} disabled={refreshing}>
            {refreshing ? "Оновлення..." : `Показати ще ${DESIGN_LIST_PAGE_INCREMENT}`}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setCreateError(null);
            setCreateSaving(false);
            setCreateCustomerId(null);
            setCreateCustomerLogoUrl(null);
            setCreateCustomerType("customer");
            setCreateCustomerPopoverOpen(false);
            setCreateDesignTaskType(null);
            setCreateDesignTaskTypePopoverOpen(false);
            setCreateAssigneePopoverOpen(false);
            setCreateManagerPopoverOpen(false);
            setCreateDeadlinePopoverOpen(false);
            setCreateFilesDragActive(false);
          }
        }}
      >
        <DialogContent className="max-w-[640px] max-h-[85vh] p-0 gap-0 notranslate" translate="no">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Нова дизайн-задача (без прорахунку)</DialogTitle>
            <DialogDescription>
              Заповніть основні поля задачі, виберіть дедлайн, відповідальних та додайте матеріали для дизайнера.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-4 pr-3 max-h-[calc(85vh-170px)]">
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
              <Popover open={createDesignTaskTypePopoverOpen} onOpenChange={setCreateDesignTaskTypePopoverOpen}>
                <PopoverTrigger asChild>
                  <Chip
                    size="md"
                    icon={
                      createDesignTaskType ? (
                        (() => {
                          const TypeIcon = DESIGN_TASK_TYPE_ICONS[createDesignTaskType];
                          return <TypeIcon className="h-4 w-4" />;
                        })()
                      ) : (
                        <Package className="h-4 w-4" />
                      )
                    }
                    active={!!createDesignTaskType}
                  >
                    {createDesignTaskType ? DESIGN_TASK_TYPE_LABELS[createDesignTaskType] : "Тип задачі"}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start" portalled={false}>
                  <div className="space-y-1">
                    {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 h-9 text-sm"
                        onClick={() => {
                          setCreateDesignTaskType(option.value);
                          setCreateDesignTaskTypePopoverOpen(false);
                        }}
                      >
                        {(() => {
                          const TypeIcon = DESIGN_TASK_TYPE_ICONS[option.value];
                          return <TypeIcon className="h-3.5 w-3.5" />;
                        })()}
                        <span>{option.label}</span>
                        {createDesignTaskType === option.value ? <Check className="ml-auto h-4 w-4" /> : null}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <CustomerLeadPicker
                open={createCustomerPopoverOpen}
                onOpenChange={(open) => {
                  setCreateCustomerPopoverOpen(open);
                  if (open) setCreateCustomerSearch(createCustomer || "");
                }}
                selectedLabel={createCustomer}
                selectedType={createCustomerType}
                selectedLogoUrl={createCustomerLogoUrl}
                searchValue={createCustomerSearch}
                onSearchChange={setCreateCustomerSearch}
                options={createCustomerOptions}
                loading={createCustomerOptionsLoading}
                onSelect={(customer) => {
                  setCreateCustomer(customer.label);
                  setCreateCustomerId(customer.id);
                  setCreateCustomerLogoUrl(normalizeLogoUrl(customer.logoUrl ?? null));
                  setCreateCustomerType(customer.entityType);
                  setCreateCustomerSearch(customer.label);
                }}
                onCreateCustomer={(name) => {
                  customerLeadCreate.openCustomerCreate(name);
                }}
                onCreateLead={(name) => {
                  customerLeadCreate.openLeadCreate(name);
                }}
                onClear={() => {
                  setCreateCustomer("");
                  setCreateCustomerId(null);
                  setCreateCustomerLogoUrl(null);
                  setCreateCustomerType("customer");
                  setCreateCustomerSearch("");
                }}
              />

              <Popover open={createDeadlinePopoverOpen} onOpenChange={setCreateDeadlinePopoverOpen}>
                <PopoverTrigger asChild>
                  <Chip size="md" icon={<CalendarIcon className="h-4 w-4" />} active={!!createDeadline}>
                    {createDeadline
                      ? `${format(createDeadline, "d MMM yyyy", { locale: uk })} · ${isValidDeadlineTime(createDeadlineTime) ? createDeadlineTime : "12:00"}`
                      : "Дедлайн"}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="start" portalled={false}>
                  <Calendar
                    mode="single"
                    selected={createDeadline}
                    onSelect={(date) => {
                      updateCreateDeadlineDate(date ?? undefined);
                    }}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 3}
                    toYear={new Date().getFullYear() + 5}
                    initialFocus
                  />
                  <div className="border-t border-border/50 px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Час дедлайну
                    </div>
                    <Input
                      type="time"
                      value={createDeadlineTime}
                      onChange={(event) => updateCreateDeadlineTime(event.target.value)}
                      className="mt-2 h-9"
                    />
                  </div>
                  <DateQuickActions
                    onSelect={(date) => {
                      updateCreateDeadlineDate(date ?? undefined);
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
                <PopoverContent className="w-64 p-2" align="start" portalled={false}>
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

              {shouldForceSelfAssignee ? (
                <Chip
                  size="md"
                  icon={
                    userId ? (
                      <AvatarBase
                        src={getMemberAvatar(userId)}
                        name={getMemberLabel(userId)}
                        fallback={getInitials(getMemberLabel(userId))}
                        size={20}
                        className="border-border/60"
                        fallbackClassName="text-[10px] font-semibold"
                      />
                    ) : (
                      <User className="h-4 w-4" />
                    )
                  }
                  active
                >
                  {userId ? getMemberLabel(userId) : "Виконавець"}
                </Chip>
              ) : (
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
                  <PopoverContent className="w-64 p-2" align="start" portalled={false}>
                    <div className="space-y-1">
                      {recommendedAssigneeGroup?.id ? (
                        <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Рекомендуємо</div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{recommendedAssigneeGroup.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {recommendedAssigneeGroup.workload?.recommendation ?? "Найменше навантаження в команді"}
                          </div>
                        </div>
                      ) : null}
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
                      {sortedDesignerCapacityOptions.length > 0 ? (
                        sortedDesignerCapacityOptions.map((member) => {
                          const workload = designerLoadById.get(member.id);
                          return (
                          <Button
                            key={member.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto w-full justify-start gap-2 py-2 text-sm"
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
                            <div className="min-w-0 flex-1 text-left">
                              <div className="truncate">{member.label}</div>
                              {workload ? (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                  <span>{CAPACITY_LABEL_BY_LEVEL[workload.level]}</span>
                                  <span>·</span>
                                  <span>{workload.activeTaskCount} задач</span>
                                  <span>·</span>
                                  <span>{formatHoursLoad(workload.estimateMinutesTotal)}</span>
                                </div>
                              ) : null}
                            </div>
                            <Check
                              className={cn(
                                "ml-auto h-3.5 w-3.5 text-primary",
                                createAssigneeUserId === member.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </Button>
                          );
                        })
                      ) : (
                        <div className="text-xs text-muted-foreground p-2">Немає користувачів</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
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
          <DialogFooter className="px-4 py-4 pt-0">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={createSaving}>
              Скасувати
            </Button>
            <Button
              onClick={() => void createStandaloneTask()}
              disabled={createSaving}
              className="gap-2"
            >
              {createSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {createSaving ? "Створення..." : "Створити задачу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {customerLeadCreate.dialogs}

      <DesignTaskRenameDialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) {
            setTaskToRename(null);
            setRenameError(null);
          }
        }}
        initialValue={taskToRename?.title ?? ""}
        taskLabel={taskToRename ? `«${getTaskDisplayNumber(taskToRename)}»` : null}
        saving={!!renamingTaskId}
        error={renameError}
        onSubmit={submitRenameDialog}
      />

      <ConfirmDialog
        open={!!taskToDelete}
        onOpenChange={(open) => {
          if (!open) setTaskToDelete(null);
        }}
        title="Видалити дизайн-задачу?"
        description={
          taskToDelete
            ? isUuid(taskToDelete.quoteId)
              ? `Задача по прорахунку ${getTaskDisplayNumber(taskToDelete)} буде видалена без можливості відновлення.`
              : `Дизайн-задача «${taskToDelete.title ?? getTaskDisplayNumber(taskToDelete)}» буде видалена без можливості відновлення.`
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
