import { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/lib/database.types";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DuplicateDesignTaskDialog } from "@/components/design/DuplicateDesignTaskDialog";
import { DesignersDashboard } from "@/components/design/DesignersDashboard";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/picker-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { DictationButton } from "@/components/dictation/DictationButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Loader2, CheckCircle2, Paperclip, MoreVertical, Trash2, Plus, User, Calendar as CalendarIcon, Check, RefreshCw, Package, Link2, Copy, UserPlus, UserMinus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { DesignTaskRenameDialog } from "@/components/app/DesignTaskRenameDialog";
import { resolveWorkspaceId } from "@/lib/workspace";
import { toAvatarAbsence, type AvatarAbsence } from "@/lib/absenceIndicator";
import { PersonHoverCard, toPersonHoverCardData } from "@/components/app/PersonHoverCard";
import { PartyHoverCard } from "@/components/app/PartyHoverCard";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import {
  APPROVAL_GATE_HINT,
  canChangeDesignStatus,
  getApprovalBlockers,
  getDesignStatusActionLabel,
  DESIGN_ALL_STATUSES,
  DESIGN_BOARD_COLUMNS,
  DESIGN_STATUS_LABELS,
  type DesignStatus,
} from "@/lib/designTaskStatus";
import { DESIGN_STATUS_ICON_BY_STATUS, DESIGN_STATUS_ICON_COLOR_BY_STATUS } from "@/lib/designStatusIcons";
import { notifyDesignTaskCollaboratorsOnStatusChange, notifyQuoteInitiatorOnDesignStatusChange } from "@/lib/workflowNotifications";
import {
  pauseDesignTaskTimer,
  startDesignTaskTimer,
} from "@/lib/designTaskTimer";
import {
  pickNewestChangeRequestId,
  shouldPauseTimerForStatusChange,
  shouldStartTimerForStatusChange,
} from "@/lib/designTimerStatusRules";
import {
  getDesignTaskCollaboratorIds,
  resolveDesignTaskCollaborators,
  withDesignTaskCollaboratorMetadata,
} from "@/lib/designTaskCollaborators";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ActiveHereCard } from "@/components/app/workspace-presence-widgets";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { useDeferredHeavySurface } from "@/hooks/useDeferredHeavySurface";
import { ModalMount, useModalMount } from "@/components/ui/modal-mount";
import { useKanbanViewportHeight } from "@/hooks/useKanbanViewportHeight";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { MOBILE_PAGE_BODY } from "@/layout/mobileRhythm";
import { preloadDesignTaskRoute } from "@/routes/routePreload";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanColumnHeader, KanbanImageZoomPreview, KanbanSkeleton, KanbanVirtualList, MobileStatusBoard } from "@/components/kanban";
import { CancelledDesignTasksList } from "@/components/design/CancelledDesignTasksList";
import { boardColumnStatuses, isOffBoardStatus } from "@/lib/kanbanBoards";
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
import { hasOwnManagedWork } from "@/lib/managedWorkOwnership";
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
import { DesignTaskProductPicker } from "@/components/design/DesignTaskProductPicker";
import {
  createEmptyDesignTaskProduct,
  designTaskTypeShowsProduct,
  hasDesignTaskProductSelection,
  parseDesignTaskProduct,
  serializeDesignTaskProduct,
  type DesignTaskProduct,
} from "@/lib/designTaskProduct";
import { ACTIVE_DESIGN_STATUSES, calculateDesignWorkload, getDesignTaskEstimateMinutes } from "@/lib/designWorkload";
import {
  listWorkspaceMembersForDisplay,
  type WorkspaceMemberDisplayRow,
} from "@/lib/workspaceMemberDirectory";
import { isInactiveEmployment } from "@/lib/employment";
import { listCatalogModelsByIds, listCustomersBySearch, listLeadsBySearch, type LeadSearchRow } from "@/lib/toshoApi";
import {
  listCustomerLeadLogoDirectory,
  normalizeCustomerLogoUrl as normalizeLogoUrl,
  type CustomerLeadLogoDirectoryEntry,
} from "@/lib/customerLogo";
import { buildDraftKey, clearDraft, readDraft } from "@/lib/draftStorage";
import { useDraftPersist } from "@/hooks/useDraftPersist";
import { toast } from "sonner";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { Clock3, ExternalLink, LayoutGrid, ListFilter, PencilLine, Users } from "lucide-react";
import { SegmentedGroup } from "@/components/ui/segmented-group";

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

type DesignTaskListActivityRow = {
  id: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  created_at: string;
};

type CustomerOption = CustomerLeadOption;

type DesignViewMode = "kanban" | "assignee";
type DesignContentView = "all" | "linked" | "standalone";
type DesignCompletedPeriod = "7d" | "30d" | "month" | "quarter";

const normalizeDesignViewMode = (value?: DesignViewMode | null): DesignViewMode => {
  return value ?? "kanban";
};

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
const DESIGN_MANAGER_QUOTE_ID_CHUNK_SIZE = 80;
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
  assigneeSpotlight?: string;
  completedPeriod?: DesignCompletedPeriod;
  cachedAt?: number;
};

type DesignTaskServerFilters = {
  managerUserId?: string | null;
  status?: DesignStatus | null;
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

/**
 * Читачі metadata для гейта «Позначити як затверджено». Саме правило (який тип
 * задачі що вимагає) живе в getApprovalBlockers — тут лише дістаємо числа.
 */
const readStringIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

/**
 * Файли без output_kind картка нормалізує за типом задачі (parseDesignOutputKind).
 * Дошка мусить робити так само, інакше вона рахує нуль погоджених там, де картка
 * бачить погоджене, і блокує перехід, який картка пускає.
 */
const normalizeOutputKind = (raw: unknown, taskType: DesignTaskType | null | undefined) => {
  if (raw === "visualization" || raw === "layout") return raw;
  if (taskType === "visualization") return "visualization";
  return "layout";
};

const readApprovedOutputCount = (
  metadata: Record<string, unknown> | null | undefined,
  kind: "visualization" | "layout",
  taskType?: DesignTaskType | null
) => {
  const idsKey = kind === "visualization" ? "selected_visual_output_file_ids" : "selected_layout_output_file_ids";
  const idKey = kind === "visualization" ? "selected_visual_output_file_id" : "selected_layout_output_file_id";
  const explicit = readStringIds(metadata?.[idsKey]);
  if (explicit.length > 0) return new Set(explicit).size;
  const single = metadata?.[idKey];
  if (typeof single === "string" && single.trim().length > 0) return 1;

  // Легасі: старі задачі тримають погодження в спільних ключах без поділу за
  // типом. Той самий фолбек є в картці задачі — без нього дошка блокувала б
  // перехід, який картка пускає.
  const legacy = new Set([
    ...readStringIds(metadata?.selected_design_output_file_ids),
    ...(typeof metadata?.selected_design_output_file_id === "string" &&
    metadata.selected_design_output_file_id.trim().length > 0
      ? [metadata.selected_design_output_file_id]
      : []),
  ]);
  if (legacy.size === 0) return 0;
  const files = Array.isArray(metadata?.design_output_files) ? metadata.design_output_files : [];
  return files.filter((file) => {
    const row = file as { id?: unknown; output_kind?: unknown } | null;
    return (
      typeof row?.id === "string" && legacy.has(row.id) && normalizeOutputKind(row.output_kind, taskType) === kind
    );
  }).length;
};

const readHasLayoutOutputs = (
  metadata: Record<string, unknown> | null | undefined,
  taskType?: DesignTaskType | null
) => {
  const files = metadata?.design_output_files;
  if (!Array.isArray(files)) return false;
  return files.some(
    (file) => normalizeOutputKind((file as { output_kind?: unknown } | null)?.output_kind, taskType) === "layout"
  );
};

/**
 * Колонки дошки. Склад бере реєстр канбанів (@/lib/kanbanBoards) — той самий,
 * що й прорахунки, замовлення та запити на доробку: «Скасовано» стовпчиком не
 * стоїть, воно живе окремим списком за перемикачем у тулбарі.
 *
 * УВАГА: це НЕ перелік станів задачі. Скасувати задачу можна й далі — меню
 * «Змінити статус» збирається з DESIGN_ALL_STATUSES. Якщо взяти для нього цей
 * масив, «Скасувати» тихо зникне з меню, і дошка стане пасткою в один бік.
 */
const DESIGN_COLUMNS = DESIGN_BOARD_COLUMNS;
/** Усі стани разом зі скасованим — для меню, підписів та історії. */
const DESIGN_STATUS_ENTRIES: { id: DesignStatus; label: string }[] = DESIGN_ALL_STATUSES.map((id) => ({
  id,
  label: DESIGN_STATUS_LABELS[id],
}));
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
const DESIGN_PAGE_REFRESH_INDICATOR_DELAY_MS = 900;

const isResourceExhaustionLikeError = (error: unknown) => {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("insufficient resources") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
};

const sortDesignTaskActivityRows = (rows: DesignTaskListActivityRow[]) =>
  [...rows].sort((a, b) => {
    const aTime = new Date(a.created_at ?? 0).getTime();
    const bTime = new Date(b.created_at ?? 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return b.id.localeCompare(a.id);
  });

async function listQuoteIdsForManager(teamId: string, managerUserId: string) {
  const { data, error } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id")
    .eq("team_id", teamId)
    .eq("assigned_to", managerUserId);
  if (error) throw error;
  return Array.from(
    new Set(
      ((data ?? []) as Array<{ id?: string | null }>)
        .map((row) => row.id?.trim() ?? "")
        .filter((value) => value && isUuid(value))
    )
  );
}

function applyDesignTaskActivityStatusFilter<T>(
  query: T,
  status?: DesignStatus | null
): T {
  return status
    ? (query as { eq: (column: string, value: unknown) => T }).eq("metadata->>status", status)
    : query;
}

async function listManagerDesignTaskActivityRows(params: {
  teamId: string;
  managerUserId: string;
  status?: DesignStatus | null;
  offset: number;
  pageSize: number;
  fetchAll: boolean;
}) {
  const quoteIds = await listQuoteIdsForManager(params.teamId, params.managerUserId);
  const rowById = new Map<string, DesignTaskListActivityRow>();
  const directLimit = params.fetchAll ? DESIGN_SEARCH_FETCH_PAGE_SIZE : params.offset + params.pageSize + 1;
  let directOffset = 0;
  let directMayHaveMore: boolean;

  while (true) {
    const directPageSize = params.fetchAll ? DESIGN_SEARCH_FETCH_PAGE_SIZE : directLimit;
    const fetchLimit = directPageSize + 1;
    let query = supabase
      .from("activity_log")
      .select("id,entity_id,metadata,title,created_at")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .eq("metadata->>manager_user_id", params.managerUserId)
      .order("created_at", { ascending: false })
      .range(directOffset, directOffset + fetchLimit - 1);
    query = applyDesignTaskActivityStatusFilter(query, params.status);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as DesignTaskListActivityRow[];
    const limitedRows = rows.slice(0, directPageSize);
    limitedRows.forEach((row) => rowById.set(row.id, row));

    directMayHaveMore = rows.length > directPageSize;
    if (!params.fetchAll || !directMayHaveMore) break;
    directOffset += DESIGN_SEARCH_FETCH_PAGE_SIZE;
  }

  for (let index = 0; index < quoteIds.length; index += DESIGN_MANAGER_QUOTE_ID_CHUNK_SIZE) {
    const chunk = quoteIds.slice(index, index + DESIGN_MANAGER_QUOTE_ID_CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const queries = [
      supabase
        .from("activity_log")
        .select("id,entity_id,metadata,title,created_at")
        .eq("team_id", params.teamId)
        .eq("action", "design_task")
        .in("metadata->>quote_id", chunk)
        .order("created_at", { ascending: false }),
      supabase
        .from("activity_log")
        .select("id,entity_id,metadata,title,created_at")
        .eq("team_id", params.teamId)
        .eq("action", "design_task")
        .in("entity_id", chunk)
        .order("created_at", { ascending: false }),
    ].map((query) => applyDesignTaskActivityStatusFilter(query, params.status));

    const [metadataResult, entityResult] = await Promise.all(queries);
    if (metadataResult.error) throw metadataResult.error;
    if (entityResult.error) throw entityResult.error;

    ([...(metadataResult.data ?? []), ...(entityResult.data ?? [])] as DesignTaskListActivityRow[]).forEach((row) => {
      rowById.set(row.id, row);
    });
  }

  const sortedRows = sortDesignTaskActivityRows(Array.from(rowById.values()));
  const limitedRows = params.fetchAll
    ? sortedRows
    : sortedRows.slice(params.offset, params.offset + params.pageSize);

  return {
    rows: limitedRows,
    hasMore: params.fetchAll ? false : sortedRows.length > params.offset + params.pageSize || directMayHaveMore,
  };
}

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
  // Cache the full metadata. Previous stripping caused write handlers that did
  // `metadata: { ...task.metadata, ...patch }` to wipe missing keys
  // (design_brief, design_output_files, design_brief_versions, etc.) whenever
  // a write fired in the brief window between cache hydration and DB load.
  // Per-row metadata is small (~2 KB p50, ~18 KB max). ~120 cached tasks
  // means ~250 KB-2 MB worst case, still within sessionStorage budget. The
  // cache key version (-v2) below invalidates older stripped entries.
  return { ...metadata };
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
        logoByCompactLabel.get(compactLabel)
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

type InitialDesignPageState = {
  logoCache: DesignCustomerLogoCachePayload | null;
  memberCache: DesignMemberCachePayload | null;
  cache: DesignPageCachePayload | null;
  cacheIsFresh: boolean;
  filters: DesignPageFiltersState | null;
};

/**
 * Знімок кешів, з якого сторінка стартує.
 *
 * ЧОМУ ЦЕ ОКРЕМА ФУНКЦІЯ, А НЕ ДЕСЯТЬ РЯДКІВ У ТІЛІ КОМПОНЕНТА. Доти вони
 * стояли просто в тілі й виконувались на КОЖЕН рендер: три читання сховища з
 * `JSON.parse` усього списку задач і повний перебір задач у
 * `applyCustomerLogosToTasks`. Потрібні ці значення лише при монтуванні — з них
 * беруться початкові стани через ліниві ініціалізатори `useState`, — але
 * платили за них щоразу.
 *
 * ЗАМІРЯНО 24.08.2026 (зібраний прод локально, серія з 14 літер у пошуку,
 * 37 рендерів сторінки): ці десять рядків коштували 1348 мс із 1379 мс УСЬОГО
 * тіла компонента. Тобто 97% ціни одного рендера сторінки на 5800 рядків — не
 * її розмір, а читання кешу вгорі. Створення розмітки, для порівняння, коштує
 * 20 мс на всю серію.
 *
 * КЛЮЧ ПЕРЕРАХУНКУ — КОМАНДА, А НЕ МОНТУВАННЯ. На першому рендері `teamId` ще
 * може бути порожній (права їдуть асинхронно), і кеш прочитався б за порожнім
 * ключем — тобто ніяк. Тому рахуємо заново, коли команда змінилась: інакше
 * холодний вхід завжди тягнув би повний список із мережі замість кешу.
 */
function readInitialDesignPageState(
  teamId: string,
  navigationType: "POP" | "PUSH" | "REPLACE"
): InitialDesignPageState {
  const logoCache = readDesignCustomerLogoCache(teamId);
  const memberCache = readDesignMemberCache(teamId);
  const raw = readDesignPageCache(teamId);
  const storedFilters = readDesignPageFiltersState(teamId);
  const filters = shouldRestorePageUiState(navigationType, storedFilters?.cachedAt)
    ? storedFilters
    : null;
  const cache =
    raw && logoCache?.entries?.length
      ? { ...raw, tasks: applyCustomerLogosToTasks(raw.tasks, logoCache.entries) }
      : raw;
  const cacheIsFresh = Boolean(
    cache?.tasks?.length && Date.now() - Number(cache.cachedAt ?? 0) < DESIGN_PAGE_CACHE_FRESH_MS
  );
  return { logoCache, memberCache, cache, cacheIsFresh, filters };
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

/** Чи монтувалось важке тіло цієї сторінки в цій сесії — див. useDeferredHeavySurface. */
let designBodyMountedThisSession = false;
const markDesignBodyMounted = () => {
  designBodyMountedThisSession = true;
};

export default function DesignPage() {
  const { teamId, userId, permissions, session, jobRole, viewUserId } = useAuth();
  const navigationType = useNavigationType();
  const workspacePresence = useWorkspacePresence();
  const effectiveTeamId = teamId;
  /**
   * Кеші читаються ОДИН раз на команду, а не на кожен рендер — див.
   * `readInitialDesignPageState`. Там-таки записано, скільки це коштувало.
   */
  const initialPageState = useMemo(
    () => readInitialDesignPageState(effectiveTeamId ?? "", navigationType),
    [effectiveTeamId, navigationType]
  );
  const initialLogoCache = initialPageState.logoCache;
  const initialMemberCache = initialPageState.memberCache;
  const initialCache = initialPageState.cache;
  const initialCacheIsFresh = initialPageState.cacheIsFresh;
  const restoredFilters = initialPageState.filters;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(() => !(initialCache && initialCache.tasks.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [showRefreshIndicator, setShowRefreshIndicator] = useState(false);
  const [membersLoading, setMembersLoading] = useState(() => !initialMemberCache);
  const [tasks, setTasks] = useState<DesignTask[]>(() => initialCache?.tasks ?? []);
  const { skeletonShown: boardSkeletonShown, skeletonOpaque } = useDeferredHeavySurface({
    alreadyMounted: designBodyMountedThisSession,
    markMounted: markDesignBodyMounted,
    dataPending: loading && tasks.length === 0,
  });
  /**
   * Мобільна й десктопна дошки — РІЗНІ дерева, і ховати зайве класами замало:
   * React будує й комітить обидва. Мобільний список малює всі картки поспіль,
   * без віртуалізації, що є в десктопній колонці, — саме він давав дев'ять
   * підряд коммітів по ~690 мс на відкритті. Тепер малюємо рівно одну гілку.
   */
  const isNarrowViewport = useIsNarrowViewport();
  const [teamWorkloadTasks, setTeamWorkloadTasks] = useState<DesignTask[]>([]);
  const [teamWorkloadLoaded, setTeamWorkloadLoaded] = useState(false);
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
  const [duplicateSource, setDuplicateSource] = useState<DesignTask | null>(null);
  const [duplicateSaving, setDuplicateSaving] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [taskToRename, setTaskToRename] = useState<DesignTask | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  /**
   * ДЗЕРКАЛО прапорця вікна, не сам прапорець (REQ-75). Справжній живе в
   * `<ModalMount>` нижче: інакше натиск кнопки перемальовує всю дошку
   * (заміряно 24.08.2026 на зібраному проді — 120 мс однією довгою задачею на
   * вікно, яке додає 89 вузлів до 6446). Сюди прапорець приїжджає в transition,
   * уже після того, як вікно намальоване, — його чекають шість ефектів:
   * чернетка, автозбереження, типовий виконавець, пошук замовників і
   * клавіатурні обробники. Усі асинхронні, кадр затримки їм нічого не коштує.
   */
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const createDialog = useModalMount();
  const [createTitle, setCreateTitle] = useState("");
  const [createBrief, setCreateBrief] = useState("");
  const createBriefTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [createProduct, setCreateProduct] = useState<DesignTaskProduct | null>(null);
  const createDeadlineTime = useMemo(() => {
    if (!createDeadline) return DEFAULT_CREATE_DEADLINE_TIME;
    return `${String(createDeadline.getHours()).padStart(2, "0")}:${String(createDeadline.getMinutes()).padStart(2, "0")}`;
  }, [createDeadline]);
  const [createManagerUserId, setCreateManagerUserId] = useState<string>("none");
  const [createManagerPopoverOpen, setCreateManagerPopoverOpen] = useState(false);
  const [createAssigneeUserId, setCreateAssigneeUserId] = useState<string>("none");
  const [createAssigneePopoverOpen, setCreateAssigneePopoverOpen] = useState(false);
  const [createCollaboratorIds, setCreateCollaboratorIds] = useState<string[]>([]);
  const [createCollaboratorsPopoverOpen, setCreateCollaboratorsPopoverOpen] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [createFilesDragActive, setCreateFilesDragActive] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [, setCustomersLoading] = useState(false);
  const [createCustomerOptions, setCreateCustomerOptions] = useState<CustomerOption[]>([]);
  const [createCustomerOptionsLoading, setCreateCustomerOptionsLoading] = useState(false);
  const [estimateDialogOpen, setEstimateDialogOpen] = useState(false);
  const [estimateInput, setEstimateInput] = useState("2");
  const [estimateUnit, setEstimateUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [estimateReason, setEstimateReason] = useState("");
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // Draft persistence for the "Створити дизайн-задачу" dialog. Long brief
  // text would otherwise be lost on accidental close, refresh, or version
  // update. Drafts are scoped per workspace and auto-restored on next open.
  const createDraftKey = useMemo(
    () => buildDraftKey("new-design-task", effectiveTeamId),
    [effectiveTeamId]
  );
  type NewDesignTaskDraft = {
    title?: string;
    brief?: string;
    customer?: string;
    customerId?: string | null;
    customerLogoUrl?: string | null;
    customerType?: "customer" | "lead";
    designTaskType?: DesignTaskType | null;
    deadlineISO?: string | null;
    managerUserId?: string;
    assigneeUserId?: string;
    collaboratorIds?: string[];
  };
  const createDraftRestoredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!createDialogOpen || !createDraftKey) return;
    if (createDraftRestoredKeyRef.current === createDraftKey) return;
    createDraftRestoredKeyRef.current = createDraftKey;
    const draft = readDraft<NewDesignTaskDraft>(createDraftKey)?.value;
    if (!draft) return;
    if (typeof draft.title === "string") setCreateTitle(draft.title);
    if (typeof draft.brief === "string") setCreateBrief(draft.brief);
    if (typeof draft.customer === "string") setCreateCustomer(draft.customer);
    if (typeof draft.customerId === "string" || draft.customerId === null)
      setCreateCustomerId(draft.customerId ?? null);
    if (typeof draft.customerLogoUrl === "string" || draft.customerLogoUrl === null)
      setCreateCustomerLogoUrl(draft.customerLogoUrl ?? null);
    if (draft.customerType === "customer" || draft.customerType === "lead")
      setCreateCustomerType(draft.customerType);
    if (draft.designTaskType === "visualization" || draft.designTaskType === "layout" || draft.designTaskType === null)
      setCreateDesignTaskType(draft.designTaskType ?? null);
    if (typeof draft.deadlineISO === "string") {
      const parsed = new Date(draft.deadlineISO);
      if (!Number.isNaN(parsed.getTime())) setCreateDeadline(parsed);
    }
    if (typeof draft.managerUserId === "string") setCreateManagerUserId(draft.managerUserId);
    if (typeof draft.assigneeUserId === "string") setCreateAssigneeUserId(draft.assigneeUserId);
    if (Array.isArray(draft.collaboratorIds))
      setCreateCollaboratorIds(draft.collaboratorIds.filter((id): id is string => typeof id === "string"));
  }, [createDialogOpen, createDraftKey]);
  useEffect(() => {
    if (!createDialogOpen) {
      createDraftRestoredKeyRef.current = null;
    }
  }, [createDialogOpen]);
  const newDesignTaskDraft = useMemo<NewDesignTaskDraft>(
    () => ({
      title: createTitle,
      brief: createBrief,
      customer: createCustomer,
      customerId: createCustomerId,
      customerLogoUrl: createCustomerLogoUrl,
      customerType: createCustomerType,
      designTaskType: createDesignTaskType,
      deadlineISO: createDeadline ? createDeadline.toISOString() : null,
      managerUserId: createManagerUserId,
      assigneeUserId: createAssigneeUserId,
      collaboratorIds: createCollaboratorIds,
    }),
    [
      createTitle,
      createBrief,
      createCustomer,
      createCustomerId,
      createCustomerLogoUrl,
      createCustomerType,
      createDesignTaskType,
      createDeadline,
      createManagerUserId,
      createAssigneeUserId,
      createCollaboratorIds,
    ]
  );
  useDraftPersist(createDraftKey, newDesignTaskDraft, {
    enabled: createDialogOpen,
    isEmpty: (d) =>
      !d.title?.trim() &&
      !d.brief?.trim() &&
      !d.customerId &&
      !d.customer?.trim() &&
      !d.designTaskType &&
      (!d.collaboratorIds || d.collaboratorIds.length === 0),
  });
  const [estimatePendingAction, setEstimatePendingAction] = useState<{
    mode: "assign" | "status" | "reestimate";
    task: DesignTask;
    nextAssigneeUserId?: string | null;
    nextStatus?: DesignStatus;
  } | null>(null);
  const [contentView, setContentView] = useState<DesignContentView>(() => restoredFilters?.contentView ?? "all");
  const [viewMode, setViewMode] = useState<DesignViewMode>(() => normalizeDesignViewMode(restoredFilters?.viewMode));
  const [search, setSearch] = useState(() => restoredFilters?.search ?? "");
  // Keep the input itself instant; let filtering + the full-dataset fetch run at
  // lower priority off the deferred value so fast typing never drops letters.
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<DesignStatus | "all">(
    () => restoredFilters?.statusFilter ?? "all"
  );
  const [designerFilter, setDesignerFilter] = useState<string>(
    () => restoredFilters?.designerFilter ?? ALL_DESIGNERS_FILTER
  );
  // Manager-filter default (see effect below) — role-agnostic, by task ownership:
  //   • designer   → всі (they filter by designer, not manager — even for tasks
  //                  they created themselves, where they'd be the manager)
  //   • sales-manager job role → себе immediately (definitely owns tasks)
  //   • everyone else (incl. owner/super_admin) → всі, narrowed to себе only if
  //     they actually own ≥1 task
  const [managerFilter, setManagerFilter] = useState<string>(
    () => restoredFilters?.managerFilter ?? (isQuoteManagerJobRole(jobRole) && userId ? userId : ALL_MANAGERS_FILTER)
  );
  const [defaultDesignerFilterApplied, setDefaultDesignerFilterApplied] = useState(
    () => (restoredFilters?.designerFilter ?? ALL_DESIGNERS_FILTER) !== ALL_DESIGNERS_FILTER
  );
  const [defaultManagerFilterApplied, setDefaultManagerFilterApplied] = useState(
    () => (restoredFilters?.managerFilter ?? ALL_MANAGERS_FILTER) !== ALL_MANAGERS_FILTER || isQuoteManagerJobRole(jobRole)
  );
  const [assigneeSpotlight, setAssigneeSpotlight] = useState<string>(
    () => restoredFilters?.assigneeSpotlight ?? ALL_ASSIGNEE_SPOTLIGHT
  );
  const [memberById, setMemberById] = useState<Record<string, string>>(() => initialMemberCache?.memberById ?? {});
  const [memberAvatarById, setMemberAvatarById] = useState<Record<string, string | null>>(
    () => initialMemberCache?.memberAvatarById ?? {}
  );
  const [memberAvailabilityById, setMemberAvailabilityById] = useState<Record<string, "available" | "vacation" | "sick_leave" | "offline">>({});
  const [memberInactiveById, setMemberInactiveById] = useState<Record<string, boolean>>({});
  /** Відсутність «сьогодні» з журналу — живить кільце на аватарці. */
  const [memberAbsenceById, setMemberAbsenceById] = useState<Record<string, AvatarAbsence | null>>({});
  /** Повні рядки директорії — з них будується картка людини під курсором. */
  const [memberRowById, setMemberRowById] = useState<Record<string, WorkspaceMemberDisplayRow>>({});
  const [managerMembers, setManagerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>(
    () => initialMemberCache?.managerMembers ?? []
  );
  const [designerMembers, setDesignerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>(
    () => initialMemberCache?.designerMembers ?? []
  );
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

  const openTask = (taskId: string, inNewTab = false) => {
    const href = `/design/${taskId}`;
    if (inNewTab) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(href);
  };

  // useCallback, щоб getTaskCollaborators (та інші мемо-споживачі) могли
  // тримати її в deps без перестворення щорендер.
  const getMemberLabel = useCallback((id: string | null | undefined) => {
    if (!id) return "Без виконавця";
    if (id === userId && currentUserDisplayName) return currentUserDisplayName;
    return memberById[id] ?? id.slice(0, 8);
  }, [userId, currentUserDisplayName, memberById]);
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
  const getTaskCollaborators = useCallback(
    (task: Pick<DesignTask, "assigneeUserId" | "metadata">) =>
      resolveDesignTaskCollaborators(task.metadata, {
        assigneeUserId: task.assigneeUserId,
        resolveLabel: getMemberLabel,
        resolveAvatar: getMemberAvatar,
      }),
    [getMemberAvatar, getMemberLabel]
  );
  const isUserCollaboratorOnTask = useCallback(
    (task: Pick<DesignTask, "assigneeUserId" | "metadata">, memberId?: string | null) =>
      !!memberId && getDesignTaskCollaboratorIds(task.metadata, task.assigneeUserId).includes(memberId),
    []
  );
  const completedSummaryTaskDeps = useMemo(
    () =>
      tasks
        .map((task) => `${task.id}:${task.assigneeUserId ?? ""}:${task.designTaskType ?? ""}`)
        .join("|"),
    [tasks]
  );
  // З УСІХ станів, а не з колонок дошки: «Скасувати» — теж перехід, і зникнути
  // з меню разом зі стовпчиком воно не має.
  const getAllowedStatusTransitions = (task: DesignTask) =>
    DESIGN_STATUS_ENTRIES.filter((column) =>
      canChangeDesignStatus({
        currentStatus: task.status,
        nextStatus: column.id,
        canManageAssignments: canManageDesignStatuses,
        isAssignedToCurrentUser:
          !!userId && (task.assigneeUserId === userId || isUserCollaboratorOnTask(task, userId)),
      })
    );
  const canMarkTaskReady = (task: DesignTask) =>
    canChangeDesignStatus({
      currentStatus: task.status,
      nextStatus: "pm_review",
      canManageAssignments: canManageDesignStatuses,
      isAssignedToCurrentUser:
        !!userId && (task.assigneeUserId === userId || isUserCollaboratorOnTask(task, userId)),
    });


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
          setMemberAbsenceById({});
          setMemberRowById({});
          setManagerMembers([]);
          setDesignerMembers([]);
          return;
        }
        const rows = await listWorkspaceMembersForDisplay(workspaceId);

        const labelById: Record<string, string> = {};
        const avatarById: Record<string, string | null> = {};
        const availabilityById: Record<string, "available" | "vacation" | "sick_leave" | "offline"> = {};
        const inactiveById: Record<string, boolean> = {};
        const absenceById: Record<string, AvatarAbsence | null> = {};
        rows.forEach((row) => {
          labelById[row.userId] = row.label;
          avatarById[row.userId] = row.avatarDisplayUrl;
          availabilityById[row.userId] = normalizeTeamAvailabilityStatus(row.availabilityStatus);
          inactiveById[row.userId] = isInactiveEmployment(row.employmentStatus);
          absenceById[row.userId] = toAvatarAbsence(row.absenceToday);
        });
        const rowById = Object.fromEntries(rows.map((row) => [row.userId, row]));

        setMemberById(labelById);
        setMemberAvatarById(avatarById);
        setMemberAvailabilityById(availabilityById);
        setMemberInactiveById(inactiveById);
        setMemberAbsenceById(absenceById);
        setMemberRowById(rowById);
        const designerRows = rows.filter(
          (row) => isDesignerRole(row.jobRole) && !isInactiveEmployment(row.employmentStatus)
        );

        // If no one is marked as designer, still allow assignment to any active team member.
        const assigneeRows =
          designerRows.length > 0
            ? designerRows
            : rows.filter((row) => !isInactiveEmployment(row.employmentStatus));

        let managerRows = rows.filter(
          (row) => isManagerRole(row.accessRole, row.jobRole) && !isInactiveEmployment(row.employmentStatus)
        );
        if (managerRows.length === 0 && userId) {
          const me = rows.find((row) => row.userId === userId);
          if (me) managerRows = [me];
        }
        if (managerRows.length === 0) {
          managerRows = rows.filter((row) => !isInactiveEmployment(row.employmentStatus));
        }
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
    // Той самий повний рендер дошки, що й у loadTasks, — тому теж transition.
    startTransition(() => {
      setTasks(next);
    });
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
    if (permissions.isDesigner) return;
    if (managerFilter !== ALL_MANAGERS_FILTER) return;
    if (!userId || !effectiveTeamId) return;
    // Mark applied up-front so this probe runs exactly once; then ask the DB
    // directly (pagination-proof) whether this user manages any work at all —
    // design tasks OR quotes, so SEO who manage only quotes still land on себе.
    setDefaultManagerFilterApplied(true);
    let cancelled = false;
    void (async () => {
      const ownsWork = await hasOwnManagedWork({ userId, teamId: effectiveTeamId });
      if (!cancelled && ownsWork) setManagerFilter(userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    defaultManagerFilterApplied,
    effectiveTeamId,
    managerFilter,
    permissions.isDesigner,
    userId,
  ]);

  const loadTeamWorkloadTasks = useCallback(async () => {
    if (!effectiveTeamId) {
      setTeamWorkloadTasks([]);
      setTeamWorkloadLoaded(false);
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    try {
      const rows: DesignTaskListActivityRow[] = [];
      const pageSize = 1000;
      let offset = 0;

      while (true) {
        const { data, error: fetchError } = await supabase
          .from("activity_log")
          .select("id,entity_id,metadata,created_at,title")
          .eq("team_id", effectiveTeamId)
          .eq("action", "design_task")
          .in("metadata->>status", ACTIVE_DESIGN_STATUSES)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (fetchError) throw fetchError;

        const pageRows = (data ?? []) as DesignTaskListActivityRow[];
        rows.push(...pageRows);
        if (pageRows.length < pageSize) break;
        offset += pageSize;
      }

      const parsed = rows
        .map((row) => {
          const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
          const metadataQuoteId =
            typeof metadata.quote_id === "string" && metadata.quote_id.trim()
              ? metadata.quote_id.trim()
              : null;
          const entityQuoteId = typeof row.entity_id === "string" ? row.entity_id : "";
          const resolvedQuoteId = metadataQuoteId ?? entityQuoteId;
          const status = (metadata.status as DesignStatus) ?? "new";
          return {
            id: row.id as string,
            quoteId: resolvedQuoteId,
            title: (row.title as string) ?? null,
            status,
            designTaskType: parseDesignTaskType(metadata.design_task_type),
            assigneeUserId:
              typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id
                ? metadata.assignee_user_id
                : null,
            assignedAt: typeof metadata.assigned_at === "string" ? metadata.assigned_at : null,
            quoteManagerUserId:
              typeof metadata.manager_user_id === "string" && metadata.manager_user_id.trim()
                ? metadata.manager_user_id.trim()
                : null,
            metadata,
            methodsCount: metadata.methods_count ?? 0,
            hasFiles: metadata.has_files ?? false,
            designDeadline: metadata.design_deadline ?? metadata.deadline ?? null,
            createdAt: row.created_at as string,
          } as DesignTask;
        })
        .filter((task) => ACTIVE_DESIGN_STATUSES.includes(task.status));

      setTeamWorkloadTasks(parsed);
      setTeamWorkloadLoaded(true);
    } catch (workloadError) {
      console.warn("Failed to load team design workload", workloadError);
      setTeamWorkloadLoaded(false);
    }
  }, [effectiveTeamId]);

  useEffect(() => {
    void loadTeamWorkloadTasks();
  }, [loadTeamWorkloadTasks]);

  // SEO/Superadmin бачать аналітику всіх дизайнерів; решта — лише свою
  // (та сама політика, що була в звіті файлів).
  const canSeeAllDesignerFiles = permissions.isSuperAdmin || permissions.isSeo;


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
    const serverFilters: DesignTaskServerFilters = {
      managerUserId:
        isManagerUser && userId
          ? userId
          : managerFilter !== ALL_MANAGERS_FILTER
            ? managerFilter
            : null,
      status: statusFilter !== "all" && statusFilter !== "new" ? statusFilter : null,
    };

    loadTasksInFlightRef.current = true;
    if (tasksLengthRef.current > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      let nextHasMoreTasks = false;
      let limitedRows: DesignTaskListActivityRow[] = [];

      if (serverFilters.managerUserId) {
        const managerRowsResult = await listManagerDesignTaskActivityRows({
          teamId: effectiveTeamId,
          managerUserId: serverFilters.managerUserId,
          status: serverFilters.status,
          offset,
          pageSize,
          fetchAll,
        });
        limitedRows = managerRowsResult.rows;
        nextHasMoreTasks = managerRowsResult.hasMore;
      } else {
        const fetchedRows: DesignTaskListActivityRow[] = [];
        let nextOffset = offset;

        while (true) {
          const fetchLimit = pageSize + 1;
          let query = supabase
            .from("activity_log")
            .select("id,entity_id,metadata,title,created_at")
            .eq("team_id", effectiveTeamId)
            .eq("action", "design_task")
            .order("created_at", { ascending: false });
          if (serverFilters.status) {
            query = query.eq("metadata->>status", serverFilters.status);
          }
          const { data, error: fetchError } = await query.range(nextOffset, nextOffset + fetchLimit - 1);
          if (fetchError) throw fetchError;

          const pageRows = (data ?? []) as DesignTaskListActivityRow[];
          const limitedPageRows = pageRows.slice(0, pageSize);
          fetchedRows.push(...limitedPageRows);

          nextHasMoreTasks = pageRows.length > pageSize;
          if (!fetchAll || !nextHasMoreTasks) break;
          nextOffset += pageSize;
        }

        limitedRows = fetchedRows;
      }
      /**
       * ДОБІР АКТИВНИХ ЗАДАЧ.
       *
       * Основна вибірка бере перші N за спаданням created_at. Задача, що досі
       * «в роботі», але створена давно, у це вікно не влазить — і зникає з
       * дошки взагалі. Реальний випадок: TS-0626-0043 від 10 червня була
       * in_progress, а колонка «В роботі» показувала нуль, бо новіших задач у
       * команді 135 при вікні 120. Робота, якої не видно на дошці, — це
       * робота, про яку забувають.
       *
       * Тому активні статуси (new/changes/in_progress) добираємо завжди й
       * повністю. Їх мало — це поточна робота команди, не історія. Рядки
       * додаємо ДО спільного мапінгу, щоб вони пройшли те саме збагачення
       * замовниками, номерами й логотипами, що й решта.
       */
      if (!append) {
        const activeStatuses = serverFilters.status
          ? (ACTIVE_DESIGN_STATUSES as string[]).includes(serverFilters.status)
            ? [serverFilters.status]
            : []
          : (ACTIVE_DESIGN_STATUSES as string[]);

        if (activeStatuses.length > 0) {
          let activeQuery = supabase
            .from("activity_log")
            .select("id,entity_id,metadata,title,created_at")
            .eq("team_id", effectiveTeamId)
            .eq("action", "design_task")
            .in("metadata->>status", activeStatuses)
            .order("created_at", { ascending: false });
          if (serverFilters.managerUserId) {
            activeQuery = activeQuery.eq("metadata->>manager_user_id", serverFilters.managerUserId);
          }
          const { data: activeData, error: activeError } = await activeQuery;
          if (activeError) {
            // Добір — не критичний шлях: краще показати дошку без нього, ніж
            // впасти цілком.
            console.warn("Failed to top up active design tasks", activeError);
          } else {
            const seen = new Set(limitedRows.map((row) => row.id as string));
            const extraRows = ((activeData ?? []) as DesignTaskListActivityRow[]).filter(
              (row) => !seen.has(row.id as string)
            );
            if (extraRows.length > 0) limitedRows = [...limitedRows, ...extraRows];
          }
        }
      }

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
                    : (parseDesignTaskProduct(metadata.product)?.name ?? null),
            productImageUrl: sanitizeImageReference(parseDesignTaskProduct(metadata.product)?.imageUrl ?? null),
            productZoomImageUrl: sanitizeImageReference(parseDesignTaskProduct(metadata.product)?.imageUrl ?? null),
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
            ? customerMap.get(t.customerId)?.name ?? leadMap.get(t.customerId)?.name
            : null) ??
          quoteMap.get(t.quoteId)?.customerName ??
          t.customerName ??
          null,
        customerLogoUrl:
          (t.customerId
            ? sanitizeImageReference(normalizeLogoUrl(customerMap.get(t.customerId)?.logoUrl ?? null)) ??
              sanitizeImageReference(normalizeLogoUrl(leadMap.get(t.customerId)?.logoUrl ?? null))
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
        productImageUrl: sanitizeImageReference(productImageByQuoteId.get(t.quoteId) ?? t.productImageUrl ?? null),
        productZoomImageUrl: sanitizeImageReference(productZoomImageByQuoteId.get(t.quoteId) ?? t.productZoomImageUrl ?? null),
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

      /**
       * Transition, бо це найдорожчий рендер сторінки (REQ-136): повна дошка на
       * сотні карток. Автодовантаження кличе loadTasks кілька разів поспіль, і
       * кожен такий рендер у звичайному пріоритеті блокував головний потік —
       * заміряно на деві: перехід на «Підрядники» одразу після відкриття дошки
       * чекав 2.8 с, поки дошка домальовує чергову порцію. У transition React
       * рендерить шматками й пропускає кліки та навігацію вперед.
       */
      startTransition(() => {
        setTasks(nextTasks);
      });
      if (typeof window !== "undefined" && effectiveTeamId) {
        writeDesignSessionCache(`design-page-cache:${effectiveTeamId}`, buildDesignPageCachePayload(nextTasks));
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
    isManagerUser,
    managerFilter,
    statusFilter,
    tasksFetchLimit,
    userId,
    viewMode,
  ]);

  useEffect(() => {
    const hasBlockingFilters =
      search.trim().length > 0 ||
      statusFilter === "new" ||
      designerFilter !== ALL_DESIGNERS_FILTER;

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
    // Key by team + server filters only (NOT the search text): searching is
    // client-side over `tasks`, so the full dataset only needs to be fetched
    // once per filter set. Including the query here made every keystroke a fresh
    // full-table fetch. loadTasks() dedups on this key, so repeats are no-ops.
    const fullFetchKey = `search-full:${effectiveTeamId ?? ""}:${statusFilter}:${managerFilter}:${isManagerUser ? userId ?? "" : ""}`;
    if (!deferredSearch.trim()) return;
    if (!effectiveTeamId) return;
    if (loading || refreshing) return;
    if (!hasMoreTasks && tasks.length < DESIGN_PAGE_CACHE_LIMIT) return;
    void loadTasks({ force: true, fetchAll: true, fullFetchKey });
  }, [deferredSearch, effectiveTeamId, hasMoreTasks, isManagerUser, loadTasks, loading, managerFilter, refreshing, statusFilter, tasks.length, userId]);

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
          .select("entity_id,created_at,to_status:metadata->>to_status,assignee_user_id:metadata->>assignee_user_id,design_task_type:metadata->>design_task_type")
          .eq("team_id", effectiveTeamId)
          .eq("action", "design_task_status")
          .in("entity_id", taskIds)
          .eq("metadata->>to_status", "approved")
          .gte("created_at", since);
        if (fetchError) throw fetchError;

        const taskById = new Map(tasks.map((task) => [task.id, task]));
        const nextSummary: Record<string, { total: number; byType: Partial<Record<DesignTaskType, number>> }> = {};

        ((data ?? []) as Array<{
          entity_id?: string | null;
          assignee_user_id?: string | null;
          design_task_type?: string | null;
        }>).forEach((row) => {
          const taskId = typeof row.entity_id === "string" ? row.entity_id.trim() : "";
          const task = taskById.get(taskId);
          const assigneeUserId =
            (typeof row.assignee_user_id === "string" && row.assignee_user_id.trim()
              ? row.assignee_user_id.trim()
              : null) ??
            task?.assigneeUserId ??
            null;
          if (!assigneeUserId) return;

          const taskType =
            parseDesignTaskType(row.design_task_type) ??
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
          fallbackClassName="text-3xs font-semibold"
          availability={getMemberAvailability(value)}
          presence={onlineMemberIds.has(value) ? "online" : "offline"}
          inactive={memberInactiveById[value] ?? false}
        />
        <span className="truncate">{label}</span>
      </span>
    );
  }, [currentUserDisplayName, getMemberAvatar, getMemberAvailability, memberById, memberInactiveById, onlineMemberIds, userId]);

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
          fallbackClassName="text-3xs font-semibold"
          inactive={memberInactiveById[value] ?? false}
        />
        <span className="truncate">{label}</span>
      </span>
    );
  }, [currentUserDisplayName, getMemberAvatar, memberById, memberInactiveById, userId]);

  const effectiveDesignerFilter = viewMode === "assignee" ? ALL_DESIGNERS_FILTER : designerFilter;

  useEffect(() => {
    const hasImplicitManagerFilter = isManagerUser && !!userId;
    const filterKey = [
      "filters",
      effectiveTeamId ?? "",
      effectiveDesignerFilter,
      managerFilter,
      isManagerUser ? "manager-user" : "not-manager-user",
      hasImplicitManagerFilter ? userId : "",
    ].join(":");
    if (!effectiveTeamId) return;
    const hasServerSideOnlyFilters =
      (managerFilter !== ALL_MANAGERS_FILTER ||
        hasImplicitManagerFilter ||
        (statusFilter !== "all" && statusFilter !== "new")) &&
      effectiveDesignerFilter === ALL_DESIGNERS_FILTER;
    if (hasServerSideOnlyFilters) {
      return;
    }
    if (effectiveDesignerFilter === ALL_DESIGNERS_FILTER && managerFilter === ALL_MANAGERS_FILTER) {
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
    statusFilter,
    tasks.length,
    userId,
  ]);

  /**
   * Покажчик для пошуку: усе дороге рахуємо ОДИН раз на набір задач.
   *
   * НАВІЩО. Фільтр нижче бігає по всіх задачах на кожну зміну запиту. Доти він
   * для КОЖНОЇ задачі розбирав метадані чотири рази — окремо ids, окремо мітки,
   * окремо аватарки (усе всередині resolveDesignTaskCollaborators), плюс ще раз
   * getDesignTaskCollaboratorIds на самому початку, — і щоразу наново склеював
   * рядок для пошуку. Це марна робота: від набраних літер вона не залежить.
   *
   * ЧЕСНО ПРО МАСШТАБ. Це НЕ оголошення перемоги над блокуванням. На дошці
   * дизайну заміряно 24.08.2026 на проді: 14 символів дають 14 довгих задач,
   * 1098 мс, найдовша 205 мс, і атрибуція кадрів показує чистий JS у
   * планувальнику React при нулі верстки й малювання. Але перебір 267 задач із
   * операціями над масивами коштує помітно менше за ті 60-90 мс на літеру, тож
   * головний споживач майже напевно в іншому місці — найімовірніше в самому
   * перерендері дошки. Знайти його можна лише замірами з розміткою всередині
   * збірки; доти картку не закривати.
   *
   * Ключ мемо — `visibleTasks`, а не запит: від набору літер вміст покажчика не
   * залежить, тож на набір він не перебудовується. `getTaskCollaborators`
   * тримається на useCallback із залежностями від довідника людей, який під час
   * набору не міняється.
   *
   * Міряти повторно: scripts/measure-search-blocking.js.
   */
  const taskSearchIndex = useMemo(() => {
    const index = new Map<string, { collaboratorIds: string[]; haystack: string }>();
    visibleTasks.forEach((task) => {
      index.set(task.id, {
        collaboratorIds: getDesignTaskCollaboratorIds(task.metadata, task.assigneeUserId),
        haystack: [
          task.designTaskNumber,
          task.quoteNumber,
          task.title,
          task.customerName,
          task.productName,
          ...getTaskCollaborators(task).map((entry) => entry.label),
          task.designTaskType ? DESIGN_TASK_TYPE_LABELS[task.designTaskType] : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      });
    });
    return index;
  }, [getTaskCollaborators, visibleTasks]);

  const filteredTasks = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return visibleTasks.filter((task) => {
      const indexed = taskSearchIndex.get(task.id);
      const collaboratorIds =
        indexed?.collaboratorIds ?? getDesignTaskCollaboratorIds(task.metadata, task.assigneeUserId);
      const isLinkedTask = isUuid(task.quoteId);
      if (contentView === "linked" && !isLinkedTask) return false;
      if (contentView === "standalone" && isLinkedTask) return false;

      if (statusFilter !== "all" && task.status !== statusFilter) return false;

      if (effectiveDesignerFilter === NO_DESIGNER_FILTER && task.assigneeUserId) return false;
      if (effectiveDesignerFilter === NO_DESIGNER_FILTER && collaboratorIds.length > 0) return false;
      if (
        effectiveDesignerFilter !== ALL_DESIGNERS_FILTER &&
        effectiveDesignerFilter !== NO_DESIGNER_FILTER &&
        task.assigneeUserId !== effectiveDesignerFilter &&
        !collaboratorIds.includes(effectiveDesignerFilter)
      ) {
        return false;
      }

      if (!isManagerUser && managerFilter !== ALL_MANAGERS_FILTER && task.quoteManagerUserId !== managerFilter) {
        return false;
      }

      if (!query) return true;

      return (indexed?.haystack ?? "").includes(query);
    });
  }, [contentView, deferredSearch, effectiveDesignerFilter, isManagerUser, managerFilter, statusFilter, taskSearchIndex, visibleTasks]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter !== "all" ||
    effectiveDesignerFilter !== ALL_DESIGNERS_FILTER ||
    (!isManagerUser && managerFilter !== ALL_MANAGERS_FILTER);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setDesignerFilter(ALL_DESIGNERS_FILTER);
    setManagerFilter(ALL_MANAGERS_FILTER);
    // Re-arm the role-appropriate defaults (designer → self, manager → self if
    // they own tasks) instead of hardcoding a stale "managers only → self" rule.
    setDefaultDesignerFilterApplied(false);
    setDefaultManagerFilterApplied(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !effectiveTeamId) return;
    writeDesignSessionCache(`design-page-filters:${effectiveTeamId}`, {
      contentView,
      viewMode,
      search,
      statusFilter,
      designerFilter,
      managerFilter,
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
    assigneeSpotlight,
    completedPeriod,
  ]);

  useEffect(() => {
    if (!refreshing) {
      setShowRefreshIndicator(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowRefreshIndicator(true);
    }, DESIGN_PAGE_REFRESH_INDICATOR_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshing]);


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


  const desktopKanbanViewportHeight = useKanbanViewportHeight(desktopKanbanViewportRef, {
    enabled: viewMode === "kanban",
    skeletonShown: boardSkeletonShown,
    itemCount: filteredTasks.length,
  });
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
    const byId = new Map<string, DesignTask>();
    const sourceTasks = teamWorkloadLoaded ? teamWorkloadTasks : tasks;
    sourceTasks.forEach((task) => {
      byId.set(task.id, task);
    });
    tasks.forEach((task) => {
      byId.set(task.id, task);
    });

    return Array.from(byId.values()).filter((task) => {
      const isLinkedTask = isUuid(task.quoteId);
      if (contentView === "linked" && !isLinkedTask) return false;
      if (contentView === "standalone" && isLinkedTask) return false;
      return true;
    });
  }, [contentView, tasks, teamWorkloadLoaded, teamWorkloadTasks]);

  /**
   * Скільки задач у людини СПРАВДІ в роботі.
   *
   * Дві помилки, які тут були: рахувалось «усе, крім approved/cancelled» —
   * тобто pm_review і client_review теж, хоча там м'яч уже не в дизайнера
   * (у Лєни таких 115, і число перетворювалось на сміття). І бралось із
   * `tasks`, а це пагінована сторінка канбану, не весь набір.
   *
   * Тепер: канонічний ACTIVE_DESIGN_STATUSES (new/changes/in_progress) з
   * designWorkload.ts і повне джерело. Поки повний набір не завантажено —
   * числа НЕ показуємо взагалі, бо часткове гірше за відсутнє.
   */
  const activeTaskCountByUser = useMemo(() => {
    const byId = new Map<string, DesignTask>();
    (teamWorkloadLoaded ? teamWorkloadTasks : tasks).forEach((task) => byId.set(task.id, task));
    tasks.forEach((task) => byId.set(task.id, task));

    const counts: Record<string, { total: number; new: number; changes: number; inProgress: number }> = {};
    byId.forEach((task) => {
      const assignee = task.assigneeUserId?.trim();
      if (!assignee) return;
      if (!ACTIVE_DESIGN_STATUSES.includes(task.status)) return;
      const bucket = (counts[assignee] ??= { total: 0, new: 0, changes: 0, inProgress: 0 });
      bucket.total += 1;
      if (task.status === "new") bucket.new += 1;
      else if (task.status === "changes") bucket.changes += 1;
      else if (task.status === "in_progress") bucket.inProgress += 1;
    });
    return counts;
  }, [tasks, teamWorkloadLoaded, teamWorkloadTasks]);

  const buildPersonCard = useCallback(
    (personId: string) => {
      const row = memberRowById[personId];
      if (!row) return null;
      const workload = activeTaskCountByUser[personId];
      return toPersonHoverCardData(row, {
        online: onlineMemberIds.has(personId),
        activeTasks: teamWorkloadLoaded ? (workload?.total ?? 0) : null,
        taskBreakdown: teamWorkloadLoaded
          ? {
              new: workload?.new ?? 0,
              changes: workload?.changes ?? 0,
              inProgress: workload?.inProgress ?? 0,
            }
          : null,
        inactive: memberInactiveById[personId] ?? false,
      });
    },
    [activeTaskCountByUser, memberInactiveById, memberRowById, onlineMemberIds, teamWorkloadLoaded]
  );

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
    // assigneeGrouped НАВМИСНО ширший за список діючих дизайнерів: у нього
    // підмішуються всі, хто здавав задачі за обраний період (completedByAssignee)
    // і хто висить у завантажених задачах — це потрібно для статистики.
    //
    // Але брати з нього рекомендацію напряму не можна. Список відсортований за
    // навантаженням ЗА ЗРОСТАННЯМ, а в людини, яка звільнилась, активних задач
    // нуль — тобто вона завжди опиняється першою і отримує підпис «Можна
    // ставити термінову задачу». Саме так у рекомендацію потрапила Євгенія Б.,
    // inactive з 26.06.2026 (її стару задачу заапрувили 27.07, і цього вистачило).
    const activeDesignerIds = new Set(designerMembers.map((member) => member.id));
    const candidate = assigneeGrouped.find(
      (group) => group.id && activeDesignerIds.has(group.id) && !memberInactiveById[group.id]
    );
    if (!candidate) return null;
    // Радити того, про кого сама ж система пише «нові задачі краще не давати», —
    // це не рекомендація. Коли перевантажені всі, чесніше не радити нікого.
    if (candidate.workload?.level === "critical") return null;
    return candidate;
  }, [assigneeGrouped, designerMembers, memberInactiveById]);

  const designerLoadById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateDesignWorkload>>();
    assigneeGrouped.forEach((group) => {
      if (group.id && group.workload) map.set(group.id, group.workload);
    });
    return map;
  }, [assigneeGrouped]);


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
      setCreateCollaboratorIds((prev) => prev.filter((entry) => entry !== userId));
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
      isAssignedToCurrentUser:
        !!userId && (draggedTask.assigneeUserId === userId || isUserCollaboratorOnTask(draggedTask, userId)),
    })) {
      toast.error("Ви не можете перевести задачу в цей статус");
      return;
    }
    void handleStatusChange(draggedTask, nextStatus);
  };

  /**
   * СКАСОВАНІ — ОКРЕМИЙ СПИСОК, А НЕ КОЛОНКА (REQ-138).
   *
   * Показуємо його рівно тоді, коли у фільтрі статусів обрано «Скасовано»:
   * інакше на дошці, з якої колонку прибрано, лишилась би порожнеча. Окремої
   * кнопки під це в тулбарі немає — перша спроба поставила туди перемикач, і
   * він займав місце щодня заради дії раз на рік, дублював фільтр і на кожне
   * натискання перезавантажував дошку.
   */
  const restoreDesignStatus = (boardColumnStatuses("design")[0] ?? "new") as DesignStatus;
  const showCancelledTasks = viewMode === "kanban" && isOffBoardStatus("design", statusFilter);
  const [restoringTaskId, setRestoringTaskId] = useState<string | null>(null);

  const handleStatusChange = async (task: DesignTask, next: DesignStatus, options?: { estimateMinutes?: number }) => {
    if (!effectiveTeamId || task.status === next) return;
    if (
      !canChangeDesignStatus({
        currentStatus: task.status,
        nextStatus: next,
        canManageAssignments: canManageDesignStatuses,
        isAssignedToCurrentUser:
          !!userId && (task.assigneeUserId === userId || isUserCollaboratorOnTask(task, userId)),
      })
    ) {
      toast.error("Ви не можете перевести задачу в цей статус");
      return;
    }
    // Дошка не має realtime, тож у її стані лежить знімок на момент завантаження.
    // Читаємо актуальні metadata ОДИН раз — і для гейтів, і як базу для запису.
    // Без цього update нижче писав би застарілий знімок цілою колонкою і затирав
    // усе, що змінилось у задачі після того, як дошку відкрили.
    const { data: freshRow } = await supabase
      .from("activity_log")
      .select("metadata")
      .eq("id", task.id)
      .eq("team_id", effectiveTeamId)
      .maybeSingle();
    const currentMetadata =
      ((freshRow?.metadata as Record<string, unknown> | null) ?? task.metadata ?? {}) as Record<string, unknown>;

    const statusChangedAt =
      typeof currentMetadata.status_changed_at === "string" ? currentMetadata.status_changed_at : null;
    const deadlineUpdatedAt =
      typeof currentMetadata.deadline_updated_at === "string" ? currentMetadata.deadline_updated_at : null;
    const deadlineWasUpdatedAfterCurrentStatus =
      !!deadlineUpdatedAt &&
      (!statusChangedAt || new Date(deadlineUpdatedAt).getTime() > new Date(statusChangedAt).getTime());
    if (next === "changes" && !deadlineWasUpdatedAfterCurrentStatus) {
      toast.error("Щоб повернути задачу в «Правки», спочатку оновіть дедлайн у самій дизайн-задачі.");
      return;
    }
    if (next === "approved") {
      // Той самий гейт, що й у картці задачі. Без нього задачу можна було
      // перетягнути в «Затверджено», не сказавши, який варіант обрав замовник.
      const blockers = getApprovalBlockers({
        designTaskType: task.designTaskType ?? null,
        approvedVisualizationCount: readApprovedOutputCount(currentMetadata, "visualization", task.designTaskType),
        approvedLayoutCount: readApprovedOutputCount(currentMetadata, "layout", task.designTaskType),
        hasLayoutOutputs: readHasLayoutOutputs(currentMetadata, task.designTaskType),
      });
      if (blockers.length > 0) {
        toast.error(`Щоб затвердити дизайн, закрийте блокери: ${blockers.join(", ")}.`, {
          description: APPROVAL_GATE_HINT,
        });
        return;
      }
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
        : (currentMetadata.estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? (userId ?? null)
        : (currentMetadata.estimated_by_user_id as string | null | undefined) ?? null;
    const baseMetadata = {
      ...currentMetadata,
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

      if (shouldPauseTimerForStatusChange(previousStatus, next)) {
        await pauseDesignTaskTimer({ teamId: effectiveTeamId, taskId: task.id });
      }

      // Дизайнери забувають тиснути «старт», тож беремо це на себе: узяв задачу
      // в роботу — час пішов. Збій таймера не має валити зміну статусу, вона
      // тут головна, тому ловимо помилку окремо й лише повідомляємо.
      if (
        shouldStartTimerForStatusChange({
          previousStatus,
          nextStatus: next,
          actorUserId: userId,
          assigneeUserId: task.assigneeUserId,
          collaboratorUserIds: getDesignTaskCollaboratorIds(task.metadata, task.assigneeUserId),
        })
      ) {
        try {
          await startDesignTaskTimer({
            teamId: effectiveTeamId,
            taskId: task.id,
            userId: userId as string,
            changeRequestId: pickNewestChangeRequestId(task.metadata),
          });
        } catch (timerError) {
          // «Таймер вже запущено» тепер означає рівно одне: ця сама людина вже
          // веде цю задачу. Мовчимо. Колега з власним таймером більше не заважає —
          // перевірка стала по людині, не по задачі.
          const message = getErrorMessage(timerError, "");
          if (!/вже запущено/i.test(message)) {
            toast.error("Статус змінено, але таймер не запустився", { description: message });
          }
        }
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
          title: `Статус: ${DESIGN_STATUS_LABELS[previousStatus] ?? previousStatus} → ${DESIGN_STATUS_LABELS[next] ?? next}`,
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
        await notifyDesignTaskCollaboratorsOnStatusChange({
          designTaskId: task.id,
          taskLabel: `#${getTaskDisplayNumber(task)}`,
          toStatus: next,
          actorUserId: userId ?? null,
          actorName: actorLabel,
          collaboratorUserIds: getTaskCollaborators(task).map((entry) => entry.userId),
        });
      } catch (notifyError) {
        console.warn("Failed to notify quote initiator about design status change", notifyError);
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
    const collaboratorUserIds = getDesignTaskCollaboratorIds(task.metadata, task.assigneeUserId).filter(
      (value) => value !== nextAssigneeUserId
    );
    const nextMetadata = withDesignTaskCollaboratorMetadata(
      {
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
      },
      collaboratorUserIds,
      {
        assigneeUserId: nextAssigneeUserId,
        resolveLabel: getMemberLabel,
        resolveAvatar: getMemberAvatar,
      }
    );

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
        .update({ metadata: nextMetadata as Json })
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
            collaborator_user_ids: collaboratorUserIds,
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

      toast.success(nextAssigneeUserId ? `Задача призначена: ${getMemberLabel(nextAssigneeUserId)}` : "Призначення знято");
    } catch (e: unknown) {
      setTasks((prev) =>
        prev.map((row) =>
          row.id === task.id
            ? {
                ...row,
                assigneeUserId: previousAssignee,
                assignedAt: previousAssignedAt,
                assigneeLabel: previousAssignee ? previousAssigneeLabel : null,
                assigneeAvatarUrl: previousAssignee ? previousAssigneeAvatarUrl ?? null : null,
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

  const getDroppedString = (item: DataTransferItem) =>
    new Promise<string>((resolve) => {
      item.getAsString((value) => resolve(value ?? ""));
    });

  const getExtensionFromMime = (mimeType: string) => {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("svg")) return "svg";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    return "bin";
  };

  const extractImageUrlsFromDropText = (value: string, mimeType: string) => {
    const urls = new Set<string>();
    if (!value.trim()) return [];

    if (mimeType === "text/html") {
      const doc = new DOMParser().parseFromString(value, "text/html");
      doc.querySelectorAll("img, a, source").forEach((node) => {
        ["src", "href", "data-src", "data-original", "data-url"].forEach((attribute) => {
          const raw = node.getAttribute(attribute);
          if (raw) urls.add(raw);
        });
        const srcset = node.getAttribute("srcset");
        if (srcset) {
          srcset.split(",").forEach((entry) => {
            const raw = entry.trim().split(/\s+/)[0];
            if (raw) urls.add(raw);
          });
        }
      });
      doc.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
        const style = node.getAttribute("style") ?? "";
        Array.from(style.matchAll(/url\((["']?)(.*?)\1\)/gi)).forEach((match) => {
          if (match[2]) urls.add(match[2]);
        });
      });
    }

    if (mimeType === "DownloadURL") {
      const match = value.match(/(?:https?:\/\/|blob:|data:image\/).+$/i);
      if (match?.[0]) urls.add(match[0]);
    }

    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        Array.from(line.matchAll(/(?:https?:\/\/|blob:|data:image\/)[^\s"'<>\\)]+/gi)).forEach((match) => {
          if (match[0]) urls.add(match[0]);
        });
      });

    return Array.from(urls).map((url) => url.replace(/&amp;/g, "&"));
  };

  const createFileFromDroppedUrl = async (url: string, index: number) => {
    if (!/^(https?:\/\/|blob:|data:image\/)/i.test(url)) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.size) return null;
      const mimeType = blob.type || response.headers.get("content-type") || "application/octet-stream";
      if (!mimeType.startsWith("image/")) return null;
      let baseName = `dropped-image-${index + 1}`;
      try {
        const parsed = new URL(url);
        const lastPathPart = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
        if (lastPathPart) baseName = lastPathPart.replace(/[^\p{L}\p{N}._-]+/gu, "-");
      } catch {
        // Data URLs do not have a useful path.
      }
      const hasExtension = /\.[a-z0-9]{2,5}$/i.test(baseName);
      const fileName = hasExtension ? baseName : `${baseName}.${getExtensionFromMime(mimeType)}`;
      return new File([blob], fileName, { type: mimeType });
    } catch {
      return null;
    }
  };

  const getTransferData = (dataTransfer: DataTransfer, type: string) => {
    try {
      return dataTransfer.getData(type);
    } catch {
      return "";
    }
  };

  const collectCreateFilesFromDrop = async (dataTransfer: DataTransfer) => {
    const files = new Map<string, File>();
    const addFile = (file: File | null | undefined) => {
      if (!file || !file.size) return;
      files.set(`${file.name}:${file.size}:${file.lastModified}`, file);
    };

    Array.from(dataTransfer.files ?? []).forEach(addFile);

    const items = Array.from(dataTransfer.items ?? []);
    items
      .filter((item) => item.kind === "file")
      .forEach((item) => addFile(item.getAsFile()));

    const stringItems = items.filter((item) => item.kind === "string");
    const droppedStrings = await Promise.all(
      stringItems.map(async (item) => ({
        type: item.type,
        value: await getDroppedString(item),
      }))
    );
    const directStrings = ["DownloadURL", "text/html", "text/uri-list", "text/plain"]
      .map((type) => ({ type, value: getTransferData(dataTransfer, type) }))
      .filter((entry) => entry.value.trim());
    const urls = Array.from(
      new Set(
        [...droppedStrings, ...directStrings].flatMap((entry) =>
          extractImageUrlsFromDropText(entry.value, entry.type)
        )
      )
    );
    const urlFiles = await Promise.all(urls.map((url, index) => createFileFromDroppedUrl(url, index)));
    urlFiles.forEach(addFile);

    return Array.from(files.values()).slice(0, MAX_BRIEF_FILES);
  };

  const handleCreateFilesDrop = async (dataTransfer: DataTransfer) => {
    const droppedFiles = await collectCreateFilesFromDrop(dataTransfer);
    if (droppedFiles.length > 0) {
      addFilesToCreate(droppedFiles);
      return;
    }
    toast.error(
      "Не вдалося отримати файл із перетягування. Спробуйте перетягнути саме файл, вставити картинку через Cmd/Ctrl+V або додати її через вибір файлу."
    );
  };

  const hasAttachmentPayload = (dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) return false;
    if (Array.from(dataTransfer.files ?? []).some((file) => file.size > 0)) return true;
    const items = Array.from(dataTransfer.items ?? []);
    if (items.some((item) => item.kind === "file")) return true;
    return ["DownloadURL", "text/html", "text/uri-list", "text/plain"].some((type) =>
      extractImageUrlsFromDropText(getTransferData(dataTransfer, type), type).length > 0
    );
  };

  const isTextEditingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
    return target.isContentEditable;
  };

  useEffect(() => {
    if (!createDialogOpen) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const clipboardData = event.clipboardData;
      if (!clipboardData || !hasAttachmentPayload(clipboardData)) return;
      event.preventDefault();
      void handleCreateFilesDrop(clipboardData);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // Навмисно лише [createDialogOpen]: обидва хендлери працюють ВИКЛЮЧНО з
    // переданим clipboardData (аргумент), а запис іде через функціональний
    // setCreateFiles(prev => …) — stale-closure неможливий. Додавання їх у
    // deps лише перечіпляло б paste-listener щорендер без зміни поведінки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createDialogOpen]);

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
      toast.error("Вкажіть назву задачі.");
      return;
    }
    if (!customerName) {
      toast.error("Замовник/лід обов'язковий");
      return;
    }
    if (!createDesignTaskType) {
      toast.error("Оберіть тип дизайнерської задачі.");
      return;
    }

    setCreateSaving(true);
    try {
      const assigneeUserId = shouldForceSelfAssignee
        ? (userId ?? null)
        : (createAssigneeUserId === "none" ? null : createAssigneeUserId);
      const managerUserId =
        createManagerUserId === "none"
          ? (userId ?? null)
          : createManagerUserId;
      const assignedAt = assigneeUserId ? new Date().toISOString() : null;
      const collaboratorUserIds = Array.from(
        new Set(createCollaboratorIds.filter((value) => value && value !== assigneeUserId))
      );
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
          metadata: withDesignTaskCollaboratorMetadata(
            {
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
              ...(designTaskTypeShowsProduct(createDesignTaskType) && hasDesignTaskProductSelection(createProduct)
                ? { product: serializeDesignTaskProduct(createProduct!) }
                : {}),
            },
            collaboratorUserIds,
            {
              assigneeUserId,
              resolveLabel: getMemberLabel,
              resolveAvatar: getMemberAvatar,
            }
          ) as Json,
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
          .update({ metadata: patchedMetadata as Json })
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
      if (collaboratorUserIds.length > 0) {
        try {
          await notifyUsers({
            userIds: collaboratorUserIds.filter((value) => value !== userId && value !== assigneeUserId),
            title: "Вас додано як співвиконавця",
            body: `${actorName} додав(ла) вас до нової дизайн-задачі.`,
            href: `/design/${createdTask.id}`,
            type: "info",
          });
        } catch (notifyError) {
          console.warn("Failed to notify collaborators about standalone design task", notifyError);
        }
      }

      const createdTaskHref = `/design/${createdTask.id}`;
      const createdTaskLabel = createdTask.designTaskNumber ?? "Без номера";

      clearDraft(createDraftKey);
      createDialog.close();
      setCreateTitle("");
      setCreateBrief("");
      setCreateCustomer("");
      setCreateCustomerId(null);
      setCreateCustomerLogoUrl(null);
      setCreateCustomerType("customer");
      setCreateCustomerSearch("");
      setCreateDesignTaskType(null);
      setCreateProduct(null);
      setCreateDeadline(createDefaultDesignDeadline());
      setCreateDeadlinePopoverOpen(false);
      setCreateManagerUserId(userId ?? "none");
      setCreateManagerPopoverOpen(false);
      setCreateAssigneeUserId("none");
      setCreateAssigneePopoverOpen(false);
      setCreateCollaboratorIds([]);
      setCreateCollaboratorsPopoverOpen(false);
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
      toast.error(getErrorMessage(e, "Не вдалося створити дизайн-задачу"));
    } finally {
      setCreateSaving(false);
    }
  };

  const requestDuplicateTask = (task: DesignTask) => {
    if (!canManageAssignments && !permissions.isDesigner) {
      toast.error("Немає прав для копіювання задачі");
      return;
    }
    setDuplicateError(null);
    setDuplicateSource(task);
  };

  const duplicateStandaloneTask = async (
    source: DesignTask,
    options: {
      briefFileIds: string[];
      briefMode: "edit" | "new";
      taskType: DesignTaskType | null;
      carryAssignee: boolean;
      carryDeadline: boolean;
    }
  ) => {
    if (!effectiveTeamId || duplicateSaving) return;
    setDuplicateSaving(true);
    setDuplicateError(null);
    try {
      const sourceMeta = (source.metadata ?? {}) as Record<string, unknown>;
      const createdAtIso = new Date().toISOString();
      const designTaskNumber = await getNextDesignTaskNumber(effectiveTeamId, createdAtIso);
      const entityId = `standalone-${crypto.randomUUID()}`;
      const actorName = userId ? getMemberLabel(userId) : "System";

      const customerId =
        typeof sourceMeta.customer_id === "string" && sourceMeta.customer_id.trim()
          ? sourceMeta.customer_id.trim()
          : source.customerId;
      const customerName =
        source.customerName ?? (typeof sourceMeta.customer_name === "string" ? (sourceMeta.customer_name as string) : null);
      const customerType =
        typeof sourceMeta.customer_type === "string" && sourceMeta.customer_type.trim()
          ? sourceMeta.customer_type.trim()
          : source.customerType;
      const customerLogoUrl = normalizeLogoUrl(
        (typeof sourceMeta.customer_logo_url === "string" ? (sourceMeta.customer_logo_url as string) : null) ??
          source.customerLogoUrl ??
          null
      );
      const managerUserId =
        typeof sourceMeta.manager_user_id === "string" && sourceMeta.manager_user_id.trim()
          ? sourceMeta.manager_user_id.trim()
          : source.quoteManagerUserId ?? userId ?? null;
      const managerLabel = managerUserId ? getMemberLabel(managerUserId) : actorName;
      const designTaskType =
        options.taskType ?? source.designTaskType ?? parseDesignTaskType(sourceMeta.design_task_type);

      const carriedBrief =
        options.briefMode === "edit" &&
        typeof sourceMeta.design_brief === "string" &&
        (sourceMeta.design_brief as string).trim()
          ? (sourceMeta.design_brief as string)
          : null;

      const assigneeUserId = options.carryAssignee ? source.assigneeUserId ?? null : null;
      const assignedAt = assigneeUserId ? createdAtIso : null;
      const assigneeLabel = assigneeUserId ? getMemberLabel(assigneeUserId) : null;
      const assigneeAvatarUrl = assigneeUserId ? getMemberAvatar(assigneeUserId) : null;
      const deadline = options.carryDeadline ? source.designDeadline ?? null : null;

      const title = source.title?.trim() ? source.title.trim() : `Копія ${source.designTaskNumber ?? ""}`.trim();

      const baseMetadata = withDesignTaskCollaboratorMetadata(
        {
          source: "design_task_created_manual",
          task_kind: "standalone",
          task_owner_role: permissions.isDesigner ? "designer" : "manager",
          created_by_user_id: userId ?? null,
          duplicated_from_task_id: source.id,
          duplicated_from_number: source.designTaskNumber ?? null,
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
          customer_name: customerName,
          customer_type: customerName ? customerType : null,
          customer_logo_url: customerLogoUrl,
          design_task_type: designTaskType,
          design_brief: carriedBrief,
          standalone_brief_files: [],
          design_deadline: deadline,
          deadline,
          methods_count: typeof sourceMeta.methods_count === "number" ? sourceMeta.methods_count : 0,
          has_files: false,
        },
        [],
        { assigneeUserId, resolveLabel: getMemberLabel, resolveAvatar: getMemberAvatar }
      );

      const { data, error: insertError } = await supabase
        .from("activity_log")
        .insert({
          team_id: effectiveTeamId,
          user_id: userId ?? null,
          actor_name: actorName,
          action: "design_task",
          entity_type: "design_task",
          entity_id: entityId,
          title,
          metadata: baseMetadata as Json,
        })
        .select("id,entity_id,metadata,title,created_at")
        .single();
      if (insertError) throw insertError;
      const createdRow = (data as unknown as DesignTaskActivityRow | null) ?? null;
      if (!createdRow) throw new Error("Не вдалося створити копію задачі");
      const metadata = (createdRow.metadata ?? {}) as Record<string, unknown>;

      const sourceFiles = Array.isArray(sourceMeta.standalone_brief_files)
        ? (sourceMeta.standalone_brief_files as Array<Record<string, unknown>>)
        : [];
      const selectedFiles = sourceFiles.filter((file) => options.briefFileIds.includes(String(file.id ?? "")));
      let briefFiles: Array<Record<string, unknown>> = [];
      if (selectedFiles.length > 0) {
        const filesToUpload: File[] = [];
        for (const file of selectedFiles) {
          const bucket = typeof file.storage_bucket === "string" ? file.storage_bucket : DESIGN_FILES_BUCKET;
          const path = typeof file.storage_path === "string" ? file.storage_path : "";
          if (!path) continue;
          const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(path);
          if (downloadError || !blob) {
            console.warn("Failed to copy design brief file during duplicate", path, downloadError);
            continue;
          }
          const fileName = typeof file.file_name === "string" && file.file_name ? file.file_name : "file";
          const mimeType = typeof file.mime_type === "string" && file.mime_type ? file.mime_type : blob.type || undefined;
          filesToUpload.push(new File([blob], fileName, mimeType ? { type: mimeType } : undefined));
        }
        if (filesToUpload.length > 0) {
          briefFiles = await uploadStandaloneBriefFiles({
            teamId: effectiveTeamId,
            taskId: createdRow.id,
            userId: userId ?? null,
            files: filesToUpload,
          });
          const patchedMetadata = { ...metadata, standalone_brief_files: briefFiles, has_files: true };
          const { error: patchError } = await supabase
            .from("activity_log")
            .update({ metadata: patchedMetadata as Json })
            .eq("team_id", effectiveTeamId)
            .eq("id", createdRow.id);
          if (patchError) throw patchError;
          Object.assign(metadata, patchedMetadata);
        }
      }

      const createdTask: DesignTask = {
        id: createdRow.id,
        quoteId: createdRow.entity_id || entityId,
        title: createdRow.title ?? title,
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
          typeof metadata.design_task_number === "string" && metadata.design_task_number.trim()
            ? metadata.design_task_number.trim()
            : designTaskNumber,
        quoteNumber: null,
        customerName: typeof metadata.customer_name === "string" ? (metadata.customer_name as string) : null,
        customerLogoUrl:
          typeof metadata.customer_logo_url === "string" && metadata.customer_logo_url.trim()
            ? sanitizeImageReference(normalizeLogoUrl(metadata.customer_logo_url as string))
            : null,
        customerId:
          typeof metadata.customer_id === "string" && metadata.customer_id.trim() ? metadata.customer_id.trim() : null,
        customerType:
          typeof metadata.customer_type === "string"
            ? metadata.customer_type.trim().toLowerCase() === "lead"
              ? "lead"
              : metadata.customer_type.trim().toLowerCase() === "customer"
                ? "customer"
                : null
            : null,
        methodsCount: 0,
        hasFiles: briefFiles.length > 0,
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

      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: createdRow.id,
          quoteId: null,
          userId,
          actorName,
          action: "design_task_duplicated",
          title: `Створено на основі #${source.designTaskNumber ?? "—"}`,
          href: `/design/${createdRow.id}`,
          metadata: {
            source: "design_task_duplicated",
            from_task_id: source.id,
            from_task_number: source.designTaskNumber ?? null,
            copied_file_count: briefFiles.length,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task duplicate event", logError);
      }

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
          console.warn("Failed to notify assignee about duplicated task", notifyError);
        }
      }

      const createdTaskHref = `/design/${createdTask.id}`;
      setDuplicateSource(null);
      toast.success("Задачу скопійовано", {
        description: `Нова задача ${createdTask.designTaskNumber ?? ""}`.trim(),
        action: { label: "Відкрити", onClick: () => navigate(createdTaskHref) },
      });
    } catch (e: unknown) {
      setDuplicateError(getErrorMessage(e, "Не вдалося скопіювати задачу"));
    } finally {
      setDuplicateSaving(false);
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
        .update({ metadata: nextMetadata as Json })
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
    const collaboratorEntries = getTaskCollaborators(task);
    const deadlineBadge = getDeadlineBadge(task.designDeadline);
    const statusTargets = getAllowedStatusTransitions(task).filter((target) => target.id !== "pm_review");
    const showSelfAssign = Boolean(
      canSelfAssign && userId && task.assigneeUserId && (canManageAssignments || task.assigneeUserId === userId)
    );
    const showTakeInWork = Boolean(!task.assigneeUserId && canSelfAssign && userId);
    const hasAssignmentGroup = showSelfAssign || showTakeInWork || canManageAssignments;
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
        // Чанк сторінки задачі (294 кБ) починає їхати на наведенні, а не в мить
        // кліку (REQ-136). Обробник сталий, тож у списку карток нічого не
        // створюється щорендер.
        onMouseEnter={preloadDesignTaskRoute}
        onFocus={preloadDesignTaskRoute}
        onTouchStart={preloadDesignTaskRoute}
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
        surface="raised"
        dragging={draggingId === task.id}
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
                <Badge variant="outline" className="h-5 px-2 text-3xs">
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
              <DropdownMenuContent align="end" className="w-60" onClick={(event) => event.stopPropagation()}>
                <DropdownMenuItem onClick={() => openTask(task.id, true)}>
                  <ExternalLink />
                  Відкрити в новій вкладці
                </DropdownMenuItem>
                {userId && (task.assigneeUserId === userId || canManageAssignments) ? (
                  <DropdownMenuItem onClick={() => openRenameDialog(task)}>
                    <PencilLine />
                    Редагувати назву
                  </DropdownMenuItem>
                ) : null}
                {canManageAssignments || permissions.isDesigner ? (
                  <DropdownMenuItem onClick={() => requestDuplicateTask(task)}>
                    <Copy />
                    Скопіювати задачу
                  </DropdownMenuItem>
                ) : null}

                <DropdownMenuSeparator />

                {showSelfAssign ? (
                  <DropdownMenuItem onClick={() => applyAssignee(task, userId)} disabled={task.assigneeUserId === userId}>
                    <UserPlus />
                    {task.assigneeUserId === userId ? "Призначено на мене" : "Призначити на мене"}
                  </DropdownMenuItem>
                ) : null}
                {showTakeInWork ? (
                  <DropdownMenuItem onClick={() => applyAssignee(task, userId)}>
                    <UserPlus />
                    Взяти в роботу
                  </DropdownMenuItem>
                ) : null}
                {canManageAssignments ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Users />
                      Призначити дизайнеру
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                      {designerMembers.length === 0 ? (
                        <DropdownMenuItem disabled>Немає дизайнерів</DropdownMenuItem>
                      ) : (
                        designerMembers.map((member) => (
                          <DropdownMenuItem
                            key={member.id}
                            onClick={() => applyAssignee(task, member.id)}
                            disabled={task.assigneeUserId === member.id}
                          >
                            <AvatarBase
                              src={member.avatarUrl ?? null}
                              name={member.label}
                              size={20}
                              showStatusIndicator={false}
                            />
                            {member.label}
                          </DropdownMenuItem>
                        ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => applyAssignee(task, null)} disabled={!task.assigneeUserId}>
                        <UserMinus />
                        Зняти виконавця
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}

                {hasAssignmentGroup ? <DropdownMenuSeparator /> : null}

                <DropdownMenuItem onClick={() => requestReestimate(task)}>
                  <Clock3 />
                  Оновити естімейт
                </DropdownMenuItem>
                {canMarkTaskReady(task) ? (
                  <DropdownMenuItem onClick={() => handleStatusChange(task, "pm_review")}>
                    <CheckCircle2 />
                    Позначити як дизайн готовий
                  </DropdownMenuItem>
                ) : null}
                {statusTargets.length > 0 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <RefreshCw />
                      Змінити статус
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                      {statusTargets.map((target) => {
                        const StatusIcon = DESIGN_STATUS_ICON_BY_STATUS[target.id];
                        return (
                          <DropdownMenuItem key={target.id} onClick={() => handleStatusChange(task, target.id)}>
                            <StatusIcon className={DESIGN_STATUS_ICON_COLOR_BY_STATUS[target.id]} />
                            {getDesignStatusActionLabel(task.status, target.id)}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}

                {canManageAssignments ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={deletingTaskId === task.id}
                      onClick={() => requestDeleteTask(task)}
                    >
                      {deletingTaskId === task.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
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
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/6 px-2.5 py-1 text-2xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            <span>Окрема задача привʼязана до прорахунку</span>
          </div>
        ) : null}
        {task.designTaskType ? (
          /* Тип задачі — НЕЙТРАЛЬНИЙ, і це навмисно.
             Раніше тут стояв accent (фіолетовий) для всіх п'яти типів одразу, тож
             колір не розрізняв нічого — «Верстка» і «Презентація» виглядали однаково.
             Гірше: той самий accent означає статус pm_review («Дизайн готовий»), тому
             на борді один відтінок ніс дві різні смислові осі.
             На канбані статус уже закодований колонкою, а єдине, що на картці вимагає
             реакції, — дедлайн. Тип сканують, уже відкривши картку, тож він віддає
             кольоровий бюджет дедлайну, а сам упізнається іконкою й текстом.
             Це також вирівнює борд з рештою застосунку: у згрупованому вигляді, на
             сторінці задачі та в картці клієнта тип уже був нейтральним.

             Заливка — bg-muted/20, а не neutral-soft: суцільний сірий (#f0f0f0)
             на білій картці читається як ще одна пляма поруч з дедлайном. Тут
             навмисно та сама трійка, що й у згрупованому вигляді нижче по файлу,
             щоб два вигляди однієї сторінки не розходились. */
          <Badge
            variant="outline"
            className="mt-2 gap-1.5 rounded-full border-border/60 bg-muted/20 px-2.5 py-1 text-2xs font-medium normal-case tracking-normal text-muted-foreground"
          >
            {(() => {
              const TypeIcon = DESIGN_TASK_TYPE_ICONS[task.designTaskType];
              return <TypeIcon className="h-3.5 w-3.5" />;
            })()}
            <span>{DESIGN_TASK_TYPE_LABELS[task.designTaskType]}</span>
          </Badge>
        ) : null}
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2.5 text-[15px] font-medium min-w-0">
            <PartyHoverCard
              target={
                task.customerId && task.customerType
                  ? {
                      kind: task.customerType,
                      id: task.customerId,
                      name: task.customerName ?? "Замовник / Лід",
                      logoUrl: task.customerLogoUrl ?? null,
                      managerLabel: task.quoteManagerUserId ? memberById[task.quoteManagerUserId] ?? null : null,
                      managerAvatarUrl: task.quoteManagerUserId ? getMemberAvatar(task.quoteManagerUserId) : null,
                    }
                  : null
              }
            >
              <EntityAvatar
                src={task.customerLogoUrl ?? null}
                name={task.customerName ?? "Замовник / Лід"}
                fallback={getInitials(task.customerName)}
                size={32}
              />
            </PartyHoverCard>
            <div className="min-w-0">
              <div className="text-3xs uppercase tracking-caps text-muted-foreground/70">
                {partyLabel}
              </div>
              <div className="truncate text-[14px] font-semibold" title={task.customerName ?? "Не вказано"}>
                {task.customerName ?? "Не вказано"}
              </div>
            </div>
          </div>
        </div>
        {task.productName ? (
          <div className="mt-3 rounded-inner border border-border/60 bg-background/35 px-3 py-2.5">
            <div className="mb-2 inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Товар
            </div>
            <div className="flex items-center gap-2.5">
              {task.productImageUrl ? (
                <KanbanImageZoomPreview
                  imageUrl={task.productImageUrl}
                  zoomImageUrl={task.productZoomImageUrl ?? task.productImageUrl}
                  alt={task.productName}
                  loadStrategy="visible"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/25">
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
            <div className="flex shrink-0 items-center -space-x-2">
              {task.assigneeUserId ? (
                (() => {
                  const assigneeId = task.assigneeUserId as string;
                  const avatar = (
                    <AvatarBase
                      src={getTaskAssigneeAvatar(task)}
                      name={assigneeLabel}
                      fallback={getInitials(assigneeLabel)}
                      size={26}
                      className="text-3xs font-semibold ring-2 ring-background"
                      availability={getMemberAvailability(assigneeId)}
                      suppressNativeTitle
                      absence={memberAbsenceById[assigneeId] ?? null}
                      presence={onlineMemberIds.has(assigneeId) ? "online" : "offline"}
                      inactive={memberInactiveById[assigneeId] ?? false}
                    />
                  );
                  // Картка під курсором лише там, де є кого показувати: на цій
                  // аватарці менеджер вирішує, чи не перевантажений виконавець.
                  const person = buildPersonCard(assigneeId);
                  return person ? <PersonHoverCard person={person}>{avatar}</PersonHoverCard> : avatar;
                })()
              ) : (
                <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground ring-2 ring-background">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
              {collaboratorEntries.slice(0, 2).map((entry) => (
                <AvatarBase
                  key={`task-collaborator-${task.id}-${entry.userId}`}
                  src={entry.avatarUrl}
                  name={entry.label}
                  fallback={getInitials(entry.label)}
                  size={22}
                  className="text-3xs font-semibold ring-2 ring-background"
                  availability={getMemberAvailability(entry.userId)}
                  presence={onlineMemberIds.has(entry.userId) ? "online" : "offline"}
                  inactive={memberInactiveById[entry.userId] ?? false}
                />
              ))}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-foreground/90">{assigneeLabel}</span>
              {collaboratorEntries.length > 0 ? (
                <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-3xs">
                  {collaboratorEntries.length > 1 ? `Спільна +${collaboratorEntries.length}` : "Спільна"}
                </Badge>
              ) : null}
            </div>
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
      <UnifiedPageToolbar
        // Телефон: пошук і «Фільтри», решта — в аркуші (картка 146).
        mobileCompact
        mobileFilterCount={
          (statusFilter !== "all" ? 1 : 0) +
          (designerFilter !== ALL_DESIGNERS_FILTER ? 1 : 0) +
          (managerFilter !== ALL_MANAGERS_FILTER ? 1 : 0)
        }
        mobileViewSwitch={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={viewMode === "kanban"}
              onClick={() => setViewMode("kanban")}
              className={cn(SEGMENTED_TRIGGER, "flex-1 gap-2")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={viewMode === "assignee"}
              onClick={() => setViewMode("assignee")}
              className={cn(SEGMENTED_TRIGGER, "flex-1 gap-2")}
            >
              <Users className="h-3.5 w-3.5" />
              Дизайнери
            </Button>
          </SegmentedGroup>
        }
        mobilePrimary={
          // Стрілка, а не `createDialog.open` напряму: обгортка тримає стан у
          // ref, і читання методу під час рендера додає борг компілятора.
          <Button onClick={() => createDialog.open()} size="icon" aria-label="Нова дизайн-задача" className="h-11 w-11 shrink-0">
            <Plus className="h-5 w-5" />
          </Button>
        }
        topLeft={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={contentView === "all"}
              onClick={() => setContentView("all")}
              className={SEGMENTED_TRIGGER}
            >
              Всі
              <CountBadge value={allTasksCount} className="ml-1" />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={contentView === "linked"}
              onClick={() => setContentView("linked")}
              className={SEGMENTED_TRIGGER}
            >
              З прорах.
              <CountBadge value={linkedTasksCount} className="ml-1" />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={contentView === "standalone"}
              onClick={() => setContentView("standalone")}
              className={SEGMENTED_TRIGGER}
            >
              Окремі
              <CountBadge value={standaloneTasksCount} className="ml-1" />
            </Button>
          </SegmentedGroup>
        }
        topRight={
          <>
            <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full sm:w-auto")}>
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
                aria-pressed={viewMode === "assignee"}
                onClick={() => setViewMode("assignee")}
                className={cn(SEGMENTED_TRIGGER, "gap-1.5")}
              >
                <Users className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Дизайнери</span>
              </Button>
            </SegmentedGroup>
            <Button
              className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
              onClick={createDialog.open}
            >
              <Plus className="h-4 w-4" />
              Нова дизайн-задача
            </Button>
          </>
        }
        search={
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder={
              contentView === "linked"
                ? "Пошук по задачах з прорахунку..."
                : contentView === "standalone"
                  ? "Пошук по окремих задачах..."
                  : "Пошук по всіх дизайн-задачах..."
            }
            loading={(loading || (refreshing && hasMoreTasks)) && Boolean(search)}
          />
        }
        filters={
          <>
            {/*
              ФІЛЬТР ЛИШАЄТЬСЯ ПОВНИМ, зі «Скасовано» включно, — і це єдиний
              шлях до скасованих задач. Окремої кнопки під них у тулбарі немає:
              постійне місце на екрані за дію раз на рік — це податок на всіх
              щодня, а фільтр робить те саме й нічого не коштує.
            */}
            <ToolbarFilterSelect
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as DesignStatus | "all")}
              neutralValue="all"
              className="sm:w-[180px]"
              options={[
                { value: "all", label: "Всі статуси", icon: ListFilter },
                ...DESIGN_STATUS_ENTRIES.map((column) => ({
                  value: column.id,
                  label: column.label,
                  icon: DESIGN_STATUS_ICON_BY_STATUS[column.id],
                })),
              ]}
            />

            {viewMode !== "assignee" ? (
              <ToolbarFilterSelect
                value={designerFilter}
                onValueChange={setDesignerFilter}
                neutralValue={ALL_DESIGNERS_FILTER}
                className="sm:w-[220px]"
                options={[
                  { value: ALL_DESIGNERS_FILTER, label: renderDesignerFilterValue(ALL_DESIGNERS_FILTER) },
                  { value: NO_DESIGNER_FILTER, label: renderDesignerFilterValue(NO_DESIGNER_FILTER) },
                  ...designerFilterOptions.map((member) => ({
                    value: member.id,
                    label: renderDesignerFilterValue(member.id),
                  })),
                ]}
              />
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
                    fallbackClassName="text-3xs font-semibold"
                  />
                  <span className="truncate leading-none">
                    {currentUserDisplayName || "Менеджер"}
                  </span>
                </div>
              </div>
            ) : (
              <ToolbarFilterSelect
                value={managerFilter}
                onValueChange={setManagerFilter}
                neutralValue={ALL_MANAGERS_FILTER}
                className="sm:w-[220px]"
                options={[
                  { value: ALL_MANAGERS_FILTER, label: renderManagerFilterValue(ALL_MANAGERS_FILTER) },
                  ...managerFilterOptions.map((member) => ({
                    value: member.id,
                    label: renderManagerFilterValue(member.id),
                  })),
                ]}
              />
            )}

            {isNarrowViewport ? null : (
                  /* «Хто на цій сторінці» — десктопна річ: в аркуші фільтрів
                     на телефоні присутність нічого не фільтрує (картка 146). */
                  <ActiveHereCard entries={workspacePresence.activeHereEntries} variant="minimal" />
                )}
          </>
        }
        meta={
          <ToolbarMeta
            count={boardSkeletonShown ? "…" : filteredTasks.length}
            onReset={clearFilters}
            showReset={hasActiveFilters}
            loading={loading || showRefreshIndicator}
          />
        }
      />
    ),
    [
      clearFilters,
      contentView,
      allTasksCount,
      createDialog,
      currentUserDisplayName,
      designerFilter,
      designerFilterOptions,
      boardSkeletonShown,
      filteredTasks.length,
      getMemberAvatar,
      hasMoreTasks,
      hasActiveFilters,
      isManagerUser,
      linkedTasksCount,
      loading,
      managerFilter,
      managerFilterOptions,
      refreshing,
      renderDesignerFilterValue,
      renderManagerFilterValue,
      search,
      showRefreshIndicator,
      standaloneTasksCount,
      statusFilter,
      userId,
      viewMode,
      workspacePresence.activeHereEntries,
    isNarrowViewport,
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
          {boardSkeletonShown ? (
            <div
              data-deferred-body-skeleton
              className={cn(
                "transition-opacity duration-200",
                !skeletonOpaque && "opacity-0"
              )}
            >
              {isNarrowViewport ? (
              <div className="space-y-3">
                {DESIGN_COLUMNS.map((col) => {
                  const Icon = DESIGN_STATUS_ICON_BY_STATUS[col.id];
                  return (
                    <section key={col.id} className="rounded-inner border border-border/60 bg-card/60">
                      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className={cn("h-3.5 w-3.5 shrink-0", DESIGN_STATUS_ICON_COLOR_BY_STATUS[col.id])} />
                          <span className="truncate text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                            {col.label}
                          </span>
                        </div>
                        <Skeleton className="h-3 w-5 rounded-full" />
                      </div>
                      <div className="space-y-2 p-2.5">
                        {Array.from({ length: 2 }).map((_, index) => (
                          <div key={`${col.id}:mobile-skeleton:${index}`} className="rounded-[var(--radius-md)] border border-border/50 bg-card/82 p-3">
                            <div className="flex items-center gap-3">
                              <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                              <div className="min-w-0 flex-1 space-y-2">
                                <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[68%]" : "w-[54%]")} />
                                <Skeleton className="h-3 w-[48%] rounded-full opacity-75" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              ) : (
              <div
                ref={desktopKanbanViewportRef}
                className="min-h-0 overflow-hidden"
                style={
                  desktopKanbanViewportHeight
                    ? { height: `${desktopKanbanViewportHeight}px` }
                    : undefined
                }
              >
                <KanbanSkeleton
                  columns={DESIGN_COLUMNS.map((column) => ({
                    id: column.id,
                    label: column.label,
                  }))}
                  rowClassName="h-full items-stretch"
                />
              </div>
              )}
            </div>
          ) : showCancelledTasks ? (
            <CancelledDesignTasksList
              tasks={filteredTasks}
              busyId={restoringTaskId}
              onOpen={(task) => openTask(task.id)}
              assigneeLabel={getTaskAssigneeLabel}
              restoreOf={(task) =>
                canChangeDesignStatus({
                  currentStatus: task.status,
                  nextStatus: restoreDesignStatus,
                  canManageAssignments: canManageDesignStatuses,
                  isAssignedToCurrentUser:
                    !!userId && (task.assigneeUserId === userId || isUserCollaboratorOnTask(task, userId)),
                })
                  ? () => {
                      setRestoringTaskId(task.id);
                      void handleStatusChange(task, restoreDesignStatus).finally(() =>
                        setRestoringTaskId(null)
                      );
                    }
                  : null
              }
              footer={
                hasMoreTasks ? (
                  <Button
                    variant="outline"
                    onClick={() => void loadTasks({ append: true, force: true })}
                    disabled={loading || refreshing}
                  >
                    {refreshing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Завантаження...
                      </>
                    ) : (
                      "Показати ще"
                    )}
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              {isNarrowViewport ? (
                /*
                 * Статуси й картки замість стосу всіх колонок (картка 146).
                 * Стос тримав у DOM картки ВСІХ статусів одразу — на дошці це
                 * та сама зайва робота, від якої свого часу позбулись, замінивши
                 * `md:hidden` на цей самий тернарник.
                 */
                <MobileStatusBoard
                  className={cn(MOBILE_PAGE_BODY, "pb-3")}
                  columns={DESIGN_COLUMNS.map((col) => ({
                    key: col.id,
                    label: col.label,
                    icon: DESIGN_STATUS_ICON_BY_STATUS[col.id],
                    items: grouped[col.id] ?? [],
                  }))}
                  getItemKey={(task) => task.id}
                  renderCard={(task) => renderTaskCard(task)}
                  emptyLabel="Немає задач у цьому статусі"
                />
              ) : (
              <div
                ref={desktopKanbanViewportRef}
                className="min-h-0 overflow-hidden"
                style={
                  desktopKanbanViewportHeight
                    ? { height: `${desktopKanbanViewportHeight}px` }
                    : undefined
                }
              >
                <KanbanBoard className="h-full pb-2 md:pb-3 [container-type:inline-size]" rowClassName="h-full items-stretch">
              {DESIGN_COLUMNS.map((col) => {
                const items = grouped[col.id] ?? [];
                return (
                  <KanbanColumn
                    key={col.id}
                    className={cn(
                      "kanban-column-surface basis-[clamp(224px,calc((100cqw-52px)/4.2),312px)] h-full transition-colors",
                      draggingId && "kanban-column-armed",
                      dropTargetStatus === col.id && "kanban-column-drop-target"
                    )}
                    header={
                      <KanbanColumnHeader
                        icon={DESIGN_STATUS_ICON_BY_STATUS[col.id]}
                        toneClassName={DESIGN_STATUS_ICON_COLOR_BY_STATUS[col.id]}
                        label={col.label}
                        count={items.length}
                      />
                    }
                    bodyClassName="px-2.5 pb-1.5 pt-2.5"
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
                      // Малюємо лише видимі картки: у найбільшій колонці їх
                      // бувають сотні, і саме вони тримали 57 тисяч вузлів DOM.
                      <KanbanVirtualList
                        items={items}
                        getKey={(task) => task.id}
                        renderItem={(task) => renderTaskCard(task, { draggable: true })}
                      />
                    )}
                  </KanbanColumn>
                );
              })}
                </KanbanBoard>
              </div>
              )}
            </>
          )}
        </EstimatesKanbanCanvas>
      ) : null}


      {viewMode === "assignee" ? (
        <DesignersDashboard
          teamId={effectiveTeamId}
          currentUserId={viewUserId ?? null}
          canSeeAll={canSeeAllDesignerFiles}
          designers={designerMembers}
          memberInactiveById={memberInactiveById}
          getMemberAvatar={getMemberAvatar}
        />
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



      <ModalMount ref={createDialog.ref} onOpenChange={setCreateDialogOpen}>
        {(createOpen, setCreateOpen) => (
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            // БЕЗ transition: на закритті ніхто не чекає кадру, а окремий
            // рендер, що прилітає посеред анімації зникання, видно як блимання.
            setCreateSaving(false);
            setCreateCustomerId(null);
            setCreateCustomerLogoUrl(null);
            setCreateCustomerType("customer");
            setCreateCustomerPopoverOpen(false);
            setCreateDesignTaskType(null);
            setCreateProduct(null);
            setCreateDesignTaskTypePopoverOpen(false);
            setCreateAssigneePopoverOpen(false);
            setCreateCollaboratorIds([]);
            setCreateCollaboratorsPopoverOpen(false);
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

              {/* Дедлайн — спільний пікер; тригером лишається чіп цього ряду. */}
              <DateTimePicker
                value={createDeadline ?? null}
                onChange={(next) => setCreateDeadline(next ?? undefined)}
                open={createDeadlinePopoverOpen}
                onOpenChange={setCreateDeadlinePopoverOpen}
                trigger={
                  <Chip
                    size="md"
                    icon={<CalendarIcon className="h-4 w-4" />}
                    active={!!createDeadline}
                    className="min-w-[210px]"
                  >
                    {createDeadline
                      ? `${format(createDeadline, "d MMM yyyy", { locale: uk })} · ${createDeadlineTime}`
                      : "Дедлайн"}
                  </Chip>
                }
              />

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
                          fallbackClassName="text-3xs font-semibold"
                          inactive={memberInactiveById[selectedManager.id] ?? false}
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
                            fallbackClassName="text-3xs font-semibold"
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
                        fallbackClassName="text-3xs font-semibold"
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
                            fallbackClassName="text-3xs font-semibold"
                            inactive={memberInactiveById[selectedAssignee.id] ?? false}
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
                          <div className="text-2xs font-medium uppercase tracking-caps text-primary">Рекомендуємо</div>
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
                          setCreateCollaboratorIds((prev) => prev.filter((entry) => entry !== "none"));
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
                              setCreateCollaboratorIds((prev) => prev.filter((entry) => entry !== member.id));
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
                              fallbackClassName="text-3xs font-semibold"
                            />
                            <div className="min-w-0 flex-1 text-left">
                              <div className="truncate">{member.label}</div>
                              {workload ? (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
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

              <Popover open={createCollaboratorsPopoverOpen} onOpenChange={setCreateCollaboratorsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Chip
                    size="md"
                    icon={<Users className="h-4 w-4" />}
                    active={createCollaboratorIds.length > 0}
                  >
                    {createCollaboratorIds.length === 0
                      ? "Співвиконавці"
                      : createCollaboratorIds.length === 1
                      ? getMemberLabel(createCollaboratorIds[0])
                      : `Співвиконавці · ${createCollaboratorIds.length}`}
                  </Chip>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start" portalled={false}>
                  <div className="space-y-1">
                    {sortedDesignerCapacityOptions
                      .filter((member) => member.id !== createAssigneeUserId)
                      .map((member) => {
                        const checked = createCollaboratorIds.includes(member.id);
                        const workload = designerLoadById.get(member.id);
                        return (
                          <Button
                            key={member.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-auto w-full justify-start gap-2 py-2 text-sm",
                              checked && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                            )}
                            onClick={() => {
                              setCreateCollaboratorIds((prev) =>
                                checked ? prev.filter((entry) => entry !== member.id) : [...prev, member.id]
                              );
                            }}
                            title={member.label}
                          >
                            <AvatarBase
                              src={member.avatarUrl ?? null}
                              name={member.label}
                              fallback={getInitials(member.label)}
                              size={20}
                              className="border-border/60 shrink-0"
                              fallbackClassName="text-3xs font-semibold"
                            />
                            <div className="min-w-0 flex-1 text-left">
                              <div className="truncate">{member.label}</div>
                              {workload ? (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
                                  <span>{CAPACITY_LABEL_BY_LEVEL[workload.level]}</span>
                                  <span>·</span>
                                  <span>{workload.activeTaskCount} задач</span>
                                </div>
                              ) : null}
                            </div>
                            <Check
                              className={cn(
                                "ml-auto h-3.5 w-3.5 text-primary",
                                checked ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </Button>
                        );
                      })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {designTaskTypeShowsProduct(createDesignTaskType) ? (
              <div className="space-y-3">
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={createProduct != null}
                    onCheckedChange={(checked) =>
                      setCreateProduct(checked === true ? createEmptyDesignTaskProduct("merch") : null)
                    }
                  />
                  Додати товар
                </label>
                {createProduct != null ? (
                  <DesignTaskProductPicker
                    teamId={effectiveTeamId}
                    value={createProduct}
                    onChange={setCreateProduct}
                  />
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="standalone-design-brief">ТЗ для дизайнера</Label>
                <DictationButton
                  textareaRef={createBriefTextareaRef}
                  value={createBrief}
                  onChange={setCreateBrief}
                  context="brief"
                />
              </div>
              {/* Сім рядків порожнім — приблизно ті самі 180px, що в полі ТЗ
                  у діалозі прорахунку. Доти тут стояв один рядок, і те саме
                  поле в двох діалогах виглядало по-різному: підпис обіцяв
                  «ціль, референси, формат, текст, обмеження», а форма казала
                  «сюди пишуть коротко».
                  Стеля в 16 рядків — щоб довге ТЗ не розпихало діалог: він
                  центрований, тож росте симетрично, і все, що вище поля, повзе
                  з-під очей просто під час набору. */}
              <AutoTextarea
                ref={createBriefTextareaRef}
                id="standalone-design-brief"
                minRows={7}
                maxRows={16}
                value={createBrief}
                onChange={(event) => setCreateBrief(event.target.value)}
                placeholder="Опишіть задачу: ціль, референси, формат, текст, обмеження."
              />
            </div>
            <div className="space-y-2">
              <Label>Файли / картинки</Label>
              <div
                tabIndex={0}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCreateFilesDragActive(false);
                  void handleCreateFilesDrop(event.dataTransfer);
                }}
                onPaste={(event) => {
                  if (!hasAttachmentPayload(event.clipboardData)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void handleCreateFilesDrop(event.clipboardData);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "copy";
                  if (!createFilesDragActive) setCreateFilesDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setCreateFilesDragActive(false);
                }}
                className={cn(
                  "relative flex items-center justify-center gap-2.5 border border-dashed rounded-[var(--radius-md)] px-3 py-2.5 text-center transition-colors cursor-pointer",
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
                <Paperclip className={cn("h-4 w-4 shrink-0", createFilesDragActive ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-sm", createFilesDragActive ? "text-primary font-medium" : "text-foreground")}>
                  {createFilesDragActive ? "Відпустіть файли тут" : "Перетягніть, вставте або клікніть"}
                </span>
                <span className="text-xs text-muted-foreground">· до {MAX_BRIEF_FILES}</span>
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
                        aria-label={`Видалити файл ${file.name}`}
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
          </div>
          <DialogFooter className="px-4 py-4 pt-0">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>
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
        )}
      </ModalMount>

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

      <DuplicateDesignTaskDialog
        open={!!duplicateSource}
        saving={duplicateSaving}
        error={duplicateError}
        onCancel={() => {
          if (duplicateSaving) return;
          setDuplicateSource(null);
          setDuplicateError(null);
        }}
        onConfirm={(options) => {
          if (duplicateSource) void duplicateStandaloneTask(duplicateSource, options);
        }}
        source={
          duplicateSource
            ? {
                id: duplicateSource.id,
                taskNumber: duplicateSource.designTaskNumber ?? null,
                title: duplicateSource.title ?? null,
                customerName: duplicateSource.customerName ?? null,
                customerType: duplicateSource.customerType ?? null,
                customerLogoUrl: duplicateSource.customerLogoUrl ?? null,
                managerLabel: duplicateSource.quoteManagerUserId
                  ? getMemberLabel(duplicateSource.quoteManagerUserId)
                  : null,
                managerAvatarUrl: duplicateSource.quoteManagerUserId
                  ? getMemberAvatar(duplicateSource.quoteManagerUserId)
                  : null,
                assigneeUserId: duplicateSource.assigneeUserId ?? null,
                assigneeLabel: duplicateSource.assigneeUserId ? getMemberLabel(duplicateSource.assigneeUserId) : null,
                assigneeAvatarUrl: duplicateSource.assigneeUserId
                  ? getMemberAvatar(duplicateSource.assigneeUserId)
                  : null,
                deadline: duplicateSource.designDeadline ?? null,
                taskType: duplicateSource.designTaskType ?? null,
                hasBrief:
                  typeof duplicateSource.metadata?.design_brief === "string" &&
                  (duplicateSource.metadata.design_brief as string).trim().length > 0,
                files: Array.isArray(duplicateSource.metadata?.standalone_brief_files)
                  ? (duplicateSource.metadata.standalone_brief_files as Array<Record<string, unknown>>)
                      .map((file) => ({
                        id: String(file.id ?? ""),
                        name: typeof file.file_name === "string" ? file.file_name : "файл",
                        bucket: typeof file.storage_bucket === "string" ? file.storage_bucket : "",
                        path: typeof file.storage_path === "string" ? file.storage_path : "",
                        mime: typeof file.mime_type === "string" ? file.mime_type : null,
                      }))
                      .filter((file) => file.id)
                  : [],
              }
            : null
        }
      />
    </section>
  );
}
