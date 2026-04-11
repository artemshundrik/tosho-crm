import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  ArrowLeft,
  Clock,
  Timer,
  Play,
  Pause,
  CalendarClock,
  Eye,
  Upload,
  Download,
  Palette,
  UserRound,
  Building2,
  Image as ImageIcon,
  Hash,
  MoreVertical,
  ExternalLink,
  Link2,
  Trash2,
  Check,
  Copy,
  PencilLine,
  X,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Archive,
  FolderOpen,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { resolveWorkspaceId } from "@/lib/workspace";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { listCatalogModelsByIds } from "@/lib/toshoApi";
import {
  listCustomerLeadLogoDirectory,
  normalizeCustomerLogoUrl as normalizeLogoUrl,
} from "@/lib/customerLogo";
import {
  getAttachmentVariantPath,
  getSignedAttachmentUrl,
  isServerPreviewableStoragePath,
  removeAttachmentWithVariants,
  uploadAttachmentWithVariants,
  waitForSignedAttachmentUrl,
  type AttachmentPreviewVariant,
} from "@/lib/attachmentPreview";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { EntityViewersBar } from "@/components/app/workspace-presence-widgets";
import { EntityHeader } from "@/components/app/headers/EntityHeader";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { useEntityLock } from "@/hooks/useEntityLock";
import { formatActivityClock, formatActivityDayLabel, type ActivityRow } from "@/lib/activity";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import {
  canChangeDesignStatus,
  DESIGN_ALL_STATUSES,
  DESIGN_STATUS_LABELS,
  DESIGN_STATUS_QUICK_ACTIONS,
  getDesignStatusActionLabel,
  type DesignStatus,
} from "@/lib/designTaskStatus";
import { notifyQuoteInitiatorOnDesignStatusChange } from "@/lib/workflowNotifications";
import {
  formatElapsedSeconds,
  getDesignTaskTimerSummary,
  pauseDesignTaskTimer,
  startDesignTaskTimer,
  type DesignTaskTimerSummary,
} from "@/lib/designTaskTimer";
import { toast } from "sonner";
import { format } from "date-fns";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { copyText, renderInlineRichText, renderRichTextBlocks } from "@/components/ui/rich-text-links";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  DESIGN_TASK_TYPE_OPTIONS,
  parseDesignTaskType,
  type DesignTaskType,
} from "@/lib/designTaskType";
import { calculateDesignWorkload, getDesignTaskEstimateMinutes } from "@/lib/designWorkload";
import {
  buildMentionAlias,
  extractMentionKeys,
  isMentionTerminator,
  normalizeMentionKey,
  toEmailLocalPart,
} from "@/features/quotes/quote-details/config";

const CustomerLeadQuickViewDialog = lazy(() =>
  import("@/components/customers").then((module) => ({ default: module.CustomerLeadQuickViewDialog }))
);

type DesignTask = {
  id: string;
  quoteId: string;
  title: string | null;
  status: DesignStatus;
  designTaskType?: DesignTaskType | null;
  creatorUserId?: string | null;
  assigneeUserId?: string | null;
  assignedAt?: string | null;
  metadata?: Record<string, unknown>;
  methodsCount?: number;
  hasFiles?: boolean;
  designDeadline?: string | null;
  designTaskNumber?: string | null;
  quoteNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
  quoteManagerUserId?: string | null;
  designBrief?: string | null;
  createdAt?: string | null;
};

type QuoteItemRow = {
  id?: string;
  name: string | null;
  qty: number | null;
  unit: string | null;
  methods: unknown;
  attachment?: unknown;
  catalog_model_id?: string | null;
  catalog_kind_id?: string | null;
};

type AttachmentRow = {
  id: string;
  file_name: string | null;
  file_size?: number | null;
  created_at?: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  signed_url?: string | null;
  uploaded_by?: string | null;
};

type DesignOutputFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  group_label?: string | null;
  output_kind?: DesignOutputKind | null;
  signed_url?: string | null;
};

type DesignOutputLink = {
  id: string;
  label: string;
  url: string;
  created_at: string;
  created_by: string | null;
  group_label?: string | null;
  output_kind?: DesignOutputKind | null;
};

type StorageBackedFile = {
  file_name?: string | null;
  signed_url?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
};

type QuoteCandidate = {
  id: string;
  number: string | null;
  status: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
  createdAt: string | null;
};

type QuoteMentionComment = {
  id: string;
  body: string;
  created_at: string;
  created_by: string;
};

type DesignTaskComment = {
  id: string;
  body: string;
  created_at: string;
  created_by: string;
};

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

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

type MentionSuggestion = {
  id: string;
  label: string;
  alias: string;
  avatarUrl: string | null;
};

type MentionDropdownState = {
  side: "top" | "bottom";
  maxHeight: number;
};

type FilePreviewState = {
  name: string;
  url: string;
  kind: "image" | "pdf";
  storageBucket?: string | null;
  storagePath?: string | null;
};

type GroupedDesignOutputs = {
  key: string;
  label: string;
  files: DesignOutputFile[];
  links: DesignOutputLink[];
};

type DesignOutputKind = "visualization" | "layout";
type DropboxExportRole = "final" | "archive";

type DropboxExportPlanFile = {
  file: DesignOutputFile;
  role: DropboxExportRole;
  outputKind: DesignOutputKind;
  archiveVersion?: number;
};

type DropboxExportMetadataFile = {
  source_file_id?: string | null;
  file_name?: string | null;
  output_kind?: string | null;
  role?: string | null;
  dropbox_path?: string | null;
  dropbox_shared_url?: string | null;
  exported_at?: string | null;
};

const DESIGN_OUTPUT_KIND_LABELS: Record<DesignOutputKind, string> = {
  visualization: "Візуал",
  layout: "Макет",
};

const BRIEF_INLINE_TEXTAREA_MAX_HEIGHT = 320;
const BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT = 560;

const normalizePartyLabel = (value?: string | null) => {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/[`"'’«»]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
};

const compactPartyLabel = (value?: string | null) => normalizePartyLabel(value).replace(/\s+/g, "");

const DROPBOX_ORDERS_ROOT_SUFFIX = "/Замовлення";

function DropboxGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M6.15 3 1.5 6.05l4.65 3.05 4.7-3.05L6.15 3Zm11.7 0-4.7 3.05 4.7 3.05 4.65-3.05L17.85 3ZM1.5 12.2l4.65 3.05 4.7-3.05-4.7-3.05L1.5 12.2Zm11.65-3.05-4.7 3.05 4.7 3.05 4.65-3.05-4.65-3.05ZM6.2 16.2l4.65 3.05 4.7-3.05-2.4-1.55-2.3 1.5-2.3-1.5-2.35 1.55Z"
      />
    </svg>
  );
}

function sanitizeDropboxNameSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"|?*\u0000-\u001f]/g, " ")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return normalized || fallback;
}

function buildDropboxClientFolderPath(clientName: string) {
  return `Tosho Team Folder/Замовники/${sanitizeDropboxNameSegment(clientName, "Замовник")}`;
}

function buildDropboxBrandFolderPath(clientPath: string) {
  return `${clientPath}/Бренд`;
}

function formatDropboxDate(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return formatDropboxDate(null);
  return date.toISOString().slice(0, 10);
}

function getDropboxFileExtension(fileName?: string | null) {
  const trimmed = (fileName ?? "").trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return "";
  return trimmed.slice(dotIndex);
}

function buildDropboxExportFileName(params: {
  clientLabel: string;
  outputKind: DesignOutputKind;
  projectName: string;
  orderNumber: string;
  dateLabel: string;
  extension?: string;
  archiveVersion?: number;
}) {
  const baseParts =
    params.archiveVersion != null
      ? [
          params.clientLabel,
          "Архів",
          DESIGN_OUTPUT_KIND_LABELS[params.outputKind],
          params.projectName,
          params.orderNumber,
          params.dateLabel,
          `v${params.archiveVersion}`,
        ]
      : [
          params.clientLabel,
          DESIGN_OUTPUT_KIND_LABELS[params.outputKind],
          params.projectName,
          params.orderNumber,
          params.dateLabel,
        ];
  const baseName = sanitizeDropboxNameSegment(baseParts.filter(Boolean).join(" - "), "Export");
  return `${baseName}${params.extension ?? ""}`;
}

function normalizeDropboxFolderNameDraft(value?: string | null, fallback = "Замовлення") {
  return sanitizeDropboxNameSegment((value ?? "").trim(), fallback);
}

function resizeTextareaToContent(textarea: HTMLTextAreaElement | null, maxHeight: number) {
  if (!textarea) return;
  textarea.style.height = "0px";
  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${Math.max(nextHeight, 140)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function formatBriefSelection(
  textarea: HTMLTextAreaElement,
  formatter: (params: {
    value: string;
    selectionStart: number;
    selectionEnd: number;
    selectedText: string;
  }) => { nextText: string; replaceStart?: number; replaceEnd?: number; selectionStart: number; selectionEnd: number }
) {
  const selectionStart = textarea.selectionStart ?? 0;
  const selectionEnd = textarea.selectionEnd ?? selectionStart;
  const selectedText = textarea.value.slice(selectionStart, selectionEnd);
  const formatted = formatter({
    value: textarea.value,
    selectionStart,
    selectionEnd,
    selectedText,
  });
  const replaceStart = formatted.replaceStart ?? selectionStart;
  const replaceEnd = formatted.replaceEnd ?? selectionEnd;
  const nextValue = `${textarea.value.slice(0, replaceStart)}${formatted.nextText}${textarea.value.slice(replaceEnd)}`;
  return {
    nextValue,
    selectionStart: replaceStart + formatted.selectionStart,
    selectionEnd: replaceStart + formatted.selectionEnd,
  };
}

function toggleWrappedFormatting(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
  fallback: string
) {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const beforeSelection = value.slice(Math.max(0, selectionStart - marker.length), selectionStart);
  const afterSelection = value.slice(selectionEnd, selectionEnd + marker.length);
  const hasWrappedSelection = beforeSelection === marker && afterSelection === marker;
  if (hasWrappedSelection) {
    const unwrapped = selectedText;
    return {
      nextText: unwrapped,
      replaceStart: selectionStart - marker.length,
      replaceEnd: selectionEnd + marker.length,
      selectionStart: 0,
      selectionEnd: unwrapped.length,
    };
  }
  const inlineWrapped =
    selectedText.startsWith(marker) && selectedText.endsWith(marker) && selectedText.length >= marker.length * 2;
  if (inlineWrapped) {
    const unwrapped = selectedText.slice(marker.length, selectedText.length - marker.length);
    return {
      nextText: unwrapped,
      selectionStart: 0,
      selectionEnd: unwrapped.length,
    };
  }
  const nextValue = selectedText || fallback;
  return {
    nextText: `${marker}${nextValue}${marker}`,
    selectionStart: marker.length,
    selectionEnd: marker.length + nextValue.length,
  };
}

function toggleLinePrefix(selectedText: string, prefixFactory: (index: number) => string, matcher: RegExp, fallback: string) {
  const source = selectedText || fallback;
  const lines = source.split("\n");
  const allFormatted = lines.every((line) => matcher.test(line));
  const nextText = allFormatted
    ? lines.map((line) => line.replace(matcher, "")).join("\n")
    : lines.map((line, index) => `${prefixFactory(index)}${line}`).join("\n");
  return {
    nextText,
    selectionStart: 0,
    selectionEnd: nextText.length,
  };
}

function renderBriefRichText(value: string | null | undefined) {
  return renderRichTextBlocks(value, { emptyFallback: <span>Порожнє ТЗ</span> });
}

type DesignTaskHistoryEvent = {
  id: string;
  created_at: string;
  title: string;
  actorLabel: string;
  actorUserId?: string | null;
  description?: string;
  icon: typeof Clock;
  accentClass: string;
};

type DesignBriefVersion = {
  id: string;
  version: number;
  brief: string | null;
  created_at: string;
  created_by: string | null;
  created_by_label: string | null;
  change_request_id: string | null;
  note: string | null;
};

type DesignBriefChangeRequestStatus = "pending" | "approved" | "rejected";

type DesignBriefChangeRequest = {
  id: string;
  status: DesignBriefChangeRequestStatus;
  request_text: string;
  reason: string | null;
  priority: string | null;
  impact: string | null;
  requested_by: string | null;
  requested_by_label: string | null;
  requested_at: string;
  decision_at: string | null;
  decided_by: string | null;
  decided_by_label: string | null;
  decision_note: string | null;
  applied_version_id: string | null;
};

type DesignTaskPageCachePayload = {
  task: DesignTask;
  quoteItem: QuoteItemRow | null;
  productPreviewUrl: string | null;
  productZoomPreviewUrl: string | null;
  attachments: AttachmentRow[];
  customerAttachmentsLoaded?: boolean;
  designOutputFiles: DesignOutputFile[];
  designOutputLinks: DesignOutputLink[];
  designOutputGroups: string[];
  cachedAt: number;
};

function sanitizeDesignTaskMetadataForCache(metadata?: Record<string, unknown> | null) {
  if (!metadata) return undefined;
  const next: Record<string, unknown> = {};
  const keys = [
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
    "customer_type",
    "design_task_type",
    "methods_count",
    "has_files",
    "design_deadline",
    "deadline",
    "product_name",
    "quote_item_name",
    "item_name",
  ] as const;
  keys.forEach((key) => {
    if (metadata[key] !== undefined) next[key] = metadata[key];
  });
  return next;
}

function sanitizeDesignTaskForCache(task: DesignTask): DesignTask {
  return {
    id: task.id,
    quoteId: task.quoteId,
    title: task.title ?? null,
    status: task.status,
    designTaskType: task.designTaskType ?? null,
    creatorUserId: task.creatorUserId ?? null,
    assigneeUserId: task.assigneeUserId ?? null,
    assignedAt: task.assignedAt ?? null,
    metadata: sanitizeDesignTaskMetadataForCache(task.metadata),
    methodsCount: task.methodsCount ?? 0,
    hasFiles: task.hasFiles ?? false,
    designDeadline: task.designDeadline ?? null,
    designTaskNumber: task.designTaskNumber ?? null,
    quoteNumber: task.quoteNumber ?? null,
    customerName: task.customerName ?? null,
    customerLogoUrl: task.customerLogoUrl ?? null,
    quoteManagerUserId: task.quoteManagerUserId ?? null,
    designBrief: null,
    createdAt: task.createdAt ?? null,
  };
}

function buildDesignTaskPageCachePayload(params: {
  task: DesignTask;
  quoteItem?: QuoteItemRow | null;
  productPreviewUrl?: string | null;
  productZoomPreviewUrl?: string | null;
  customerAttachmentsLoaded?: boolean;
  attachments?: AttachmentRow[];
  designOutputLinks?: DesignOutputLink[];
  designOutputGroups?: string[];
}): DesignTaskPageCachePayload {
  return {
    task: sanitizeDesignTaskForCache(params.task),
    quoteItem: params.quoteItem ?? null,
    productPreviewUrl: params.productPreviewUrl ?? null,
    productZoomPreviewUrl: params.productZoomPreviewUrl ?? null,
    attachments: Array.isArray(params.attachments) ? params.attachments.slice(0, 20) : [],
    customerAttachmentsLoaded: params.customerAttachmentsLoaded ?? false,
    designOutputFiles: [],
    designOutputLinks: Array.isArray(params.designOutputLinks) ? params.designOutputLinks.slice(0, 20) : [],
    designOutputGroups: Array.isArray(params.designOutputGroups) ? params.designOutputGroups.slice(0, 20) : [],
    cachedAt: Date.now(),
  };
}

const statusLabels = DESIGN_STATUS_LABELS;

const statusColors: Record<DesignStatus, string> = {
  new: "design-status-badge-new",
  changes: "design-status-badge-changes",
  in_progress: "design-status-badge-in-progress",
  pm_review: "design-status-badge-pm-review",
  client_review: "design-status-badge-client-review",
  approved: "design-status-badge-approved",
  cancelled: "design-status-badge-cancelled",
};

const statusQuickActions = DESIGN_STATUS_QUICK_ACTIONS;
const allStatuses = DESIGN_ALL_STATUSES;
const DESIGN_TASK_HISTORY_PAGE_SIZE = 50;

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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getQuoteMonthCode = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
};

const formatDesignTaskNumber = (monthCode: string, sequence: number) => `TS-${monthCode}-${String(Math.max(1, sequence)).padStart(4, "0")}`;

const getInitials = (name?: string | null) => {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

const isGenericMentionLabel = (label?: string | null) => {
  const normalized = (label ?? "").trim().toLowerCase();
  return normalized === "користувач" || normalized === "невідомий користувач";
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes || Number.isNaN(bytes)) return "Розмір невідомий";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (name?: string | null) => {
  if (!name) return "FILE";
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "FILE";
  return name.slice(dot + 1).toUpperCase();
};

const normalizeOutputGroupLabel = (value?: string | null) => {
  const normalized = toNonEmptyString(value);
  return normalized && normalized !== "__none__" ? normalized : null;
};

const parseStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => toNonEmptyString(entry)).filter((entry): entry is string => !!entry)
    : [];

const parseDesignOutputKind = (
  value: unknown,
  fallbackTaskType?: DesignTaskType | null
): DesignOutputKind | null => {
  if (value === "visualization" || value === "layout") return value;
  if (fallbackTaskType === "visualization") return "visualization";
  if (
    fallbackTaskType === "layout" ||
    fallbackTaskType === "layout_adaptation" ||
    fallbackTaskType === "visualization_layout_adaptation"
  ) {
    return "layout";
  }
  return "layout";
};

const getSelectedDesignOutputFileIdsFromMetadata = (
  metadata?: Record<string, unknown>,
  kind?: DesignOutputKind
) => {
  if (kind) {
    const idsKey = kind === "visualization" ? "selected_visual_output_file_ids" : "selected_layout_output_file_ids";
    const idKey = kind === "visualization" ? "selected_visual_output_file_id" : "selected_layout_output_file_id";
    const many = parseStringArray(metadata?.[idsKey]);
    if (many.length > 0) return Array.from(new Set(many));
    const legacy = toNonEmptyString(metadata?.[idKey]);
    return legacy ? [legacy] : [];
  }
  const many = parseStringArray(metadata?.selected_design_output_file_ids);
  if (many.length > 0) return Array.from(new Set(many));
  const legacy = toNonEmptyString(metadata?.selected_design_output_file_id);
  return legacy ? [legacy] : [];
};

const canPreviewImage = (extension?: string | null) =>
  !!extension && ["PNG", "JPG", "JPEG", "WEBP", "GIF", "BMP", "SVG"].includes(extension);

const canPreviewPdf = (extension?: string | null) => extension === "PDF";

const canPreviewTiff = (extension?: string | null) => extension === "TIF" || extension === "TIFF";

const canRenderStoragePreview = (extension?: string | null) =>
  canPreviewImage(extension) || canPreviewPdf(extension) || canPreviewTiff(extension);

const isUsableStorageUrl = (value?: string | null) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.pathname.includes("/storage/v1/object/sign/")) {
      return parsed.searchParams.has("token");
    }
    return true;
  } catch {
    return false;
  }
};

const DESIGN_OUTPUT_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";
const STORAGE_CACHE_CONTROL = "31536000, immutable";
const DEADLINE_PRESET_TIMES = ["09:00", "12:00", "15:00", "18:00"];

const parseActivityMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
};

const parseBriefVersions = (value: unknown): DesignBriefVersion[] => {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = toNonEmptyString(row.id);
      const versionRaw = typeof row.version === "number" ? row.version : Number(row.version);
      const createdAt = toNonEmptyString(row.created_at);
      const brief =
        row.brief === null || row.brief === undefined
          ? null
          : typeof row.brief === "string"
            ? row.brief
            : String(row.brief);
      if (!id || !Number.isFinite(versionRaw) || versionRaw < 1 || !createdAt) return null;
      return {
        id,
        version: Math.round(versionRaw),
        brief,
        created_at: createdAt,
        created_by: toNonEmptyString(row.created_by),
        created_by_label: toNonEmptyString(row.created_by_label),
        change_request_id: toNonEmptyString(row.change_request_id),
        note: toNonEmptyString(row.note),
      } satisfies DesignBriefVersion;
    })
    .filter(Boolean) as DesignBriefVersion[];
  return rows.sort((a, b) => a.version - b.version);
};

function readDesignTaskPageCache(teamId: string, taskId: string): DesignTaskPageCachePayload | null {
  if (typeof window === "undefined" || !teamId || !taskId) return null;
  try {
    const raw = sessionStorage.getItem(`design-task-page-cache:${teamId}:${taskId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignTaskPageCachePayload;
    if (!parsed.task || typeof parsed.task !== "object") return null;
    return {
      task: parsed.task,
      quoteItem: parsed.quoteItem ?? null,
      productPreviewUrl: typeof parsed.productPreviewUrl === "string" ? parsed.productPreviewUrl : null,
      productZoomPreviewUrl:
        typeof parsed.productZoomPreviewUrl === "string" ? parsed.productZoomPreviewUrl : null,
      attachments: [],
      designOutputFiles: [],
      designOutputLinks: Array.isArray(parsed.designOutputLinks) ? parsed.designOutputLinks : [],
      designOutputGroups: Array.isArray(parsed.designOutputGroups) ? parsed.designOutputGroups : [],
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function syncDesignPageCacheTask(
  teamId: string,
  task: Pick<
    DesignTask,
    "id" | "title" | "quoteId" | "quoteNumber" | "customerName" | "customerLogoUrl" | "quoteManagerUserId"
  > | null
) {
  if (typeof window === "undefined" || !teamId || !task) return;
  try {
    const raw = sessionStorage.getItem(`design-page-cache:${teamId}`);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { tasks?: DesignTask[]; cachedAt?: number };
    if (!Array.isArray(parsed.tasks)) return;
    const nextTasks = parsed.tasks.map((row) =>
      row.id === task.id
        ? {
            ...row,
            title: task.title ?? row.title ?? null,
            quoteId: task.quoteId,
            quoteNumber: task.quoteNumber ?? row.quoteNumber ?? null,
            customerName: task.customerName ?? row.customerName ?? null,
            customerLogoUrl: task.customerLogoUrl ?? row.customerLogoUrl ?? null,
            quoteManagerUserId: task.quoteManagerUserId ?? row.quoteManagerUserId ?? null,
          }
        : row
    );
    const changed = nextTasks.some((row, index) => row !== parsed.tasks?.[index]);
    if (!changed) return;
    sessionStorage.setItem(
      `design-page-cache:${teamId}`,
      JSON.stringify({
        ...parsed,
        tasks: nextTasks.map((row) => sanitizeDesignTaskForCache(row)),
        cachedAt: Date.now(),
      })
    );
    window.dispatchEvent(
      new CustomEvent("design:page-cache-updated", {
        detail: { teamId },
      })
    );
  } catch {
    // ignore cache sync failures
  }
}

const parseBriefChangeRequests = (value: unknown): DesignBriefChangeRequest[] => {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id = toNonEmptyString(row.id);
      const requestText = toNonEmptyString(row.request_text);
      const requestedAt = toNonEmptyString(row.requested_at);
      const statusRaw = toNonEmptyString(row.status) ?? "pending";
      const status: DesignBriefChangeRequestStatus =
        statusRaw === "approved" || statusRaw === "rejected" ? statusRaw : "pending";
      if (!id || !requestText || !requestedAt) return null;
      return {
        id,
        status,
        request_text: requestText,
        reason: toNonEmptyString(row.reason),
        priority: toNonEmptyString(row.priority),
        impact: toNonEmptyString(row.impact),
        requested_by: toNonEmptyString(row.requested_by),
        requested_by_label: toNonEmptyString(row.requested_by_label),
        requested_at: requestedAt,
        decision_at: toNonEmptyString(row.decision_at),
        decided_by: toNonEmptyString(row.decided_by),
        decided_by_label: toNonEmptyString(row.decided_by_label),
        decision_note: toNonEmptyString(row.decision_note),
        applied_version_id: toNonEmptyString(row.applied_version_id),
      } satisfies DesignBriefChangeRequest;
    })
    .filter(Boolean) as DesignBriefChangeRequest[];
  return rows.sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
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
    normalizedAccess === "manager" ||
    normalizedJob === "manager" ||
    normalizedJob === "менеджер"
  );
};

const formatQuantityWithUnit = (qty?: number | null, unit?: string | null) => {
  if (qty == null || Number.isNaN(Number(qty))) return "Не вказано";
  const qtyText = new Intl.NumberFormat("uk-UA").format(Number(qty));
  const rawUnit = (unit ?? "").trim().toLowerCase();
  const normalizedUnit =
    rawUnit === "pcs" || rawUnit === "pc" || rawUnit === "piece" || rawUnit === "pieces" || rawUnit === "шт" || rawUnit === "шт."
      ? "шт."
      : (unit ?? "").trim() || "од.";
  return `${qtyText} ${normalizedUnit}`;
};

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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

const normalizePartyMatch = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");

const getTaskOwnerRole = (
  metadata: Record<string, unknown> | undefined,
  creatorUserId: string | null | undefined,
  memberRoleById: Record<string, string>
): "designer" | "manager" => {
  const raw = typeof metadata?.task_owner_role === "string" ? metadata.task_owner_role.trim().toLowerCase() : "";
  if (raw === "designer") return "designer";
  if (raw === "manager") return "manager";
  if (creatorUserId && isDesignerRole(memberRoleById[creatorUserId] ?? null)) return "designer";
  return "manager";
};

export default function DesignTaskPage() {
  const { id } = useParams();
  const { teamId, userId, permissions } = useAuth();
  const navigate = useNavigate();
  const initialCache = readDesignTaskPageCache(teamId ?? "", id ?? "");
  const { getEntityViewers } = useWorkspacePresence();
  const designTaskViewers = useMemo(
    () => (id ? getEntityViewers("design_task", id) : []),
    [getEntityViewers, id]
  );
  const [task, setTask] = useState<DesignTask | null>(() => initialCache?.task ?? null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(() => initialCache?.task?.title ?? "");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [quoteItem, setQuoteItem] = useState<QuoteItemRow | null>(() => initialCache?.quoteItem ?? null);
  const [productPreviewUrl, setProductPreviewUrl] = useState<string | null>(() => initialCache?.productPreviewUrl ?? null);
  const [productZoomPreviewUrl, setProductZoomPreviewUrl] = useState<string | null>(
    () => initialCache?.productZoomPreviewUrl ?? null
  );
  const [attachments, setAttachments] = useState<AttachmentRow[]>(() => initialCache?.attachments ?? []);
  const [customerAttachmentsLoaded, setCustomerAttachmentsLoaded] = useState<boolean>(
    () => initialCache?.customerAttachmentsLoaded ?? false
  );
  const [customerAttachmentsLoading, setCustomerAttachmentsLoading] = useState(false);
  const [customerAttachmentsError, setCustomerAttachmentsError] = useState<string | null>(null);
  const [designOutputFiles, setDesignOutputFiles] = useState<DesignOutputFile[]>(() => initialCache?.designOutputFiles ?? []);
  const [designOutputLinks, setDesignOutputLinks] = useState<DesignOutputLink[]>(() => initialCache?.designOutputLinks ?? []);
  const [designOutputGroups, setDesignOutputGroups] = useState<string[]>(() => initialCache?.designOutputGroups ?? []);
  const [fileAccessUrlByKey, setFileAccessUrlByKey] = useState<Record<string, string>>({});
  const [groupingSelectionIds, setGroupingSelectionIds] = useState<string[]>([]);
  const [methodLabelById, setMethodLabelById] = useState<Record<string, string>>({});
  const [positionLabelById, setPositionLabelById] = useState<Record<string, string>>({});
  const [memberById, setMemberById] = useState<Record<string, string>>({});
  const [memberAvatarById, setMemberAvatarById] = useState<Record<string, string | null>>({});
  const [memberRoleById, setMemberRoleById] = useState<Record<string, string>>({});
  const [designerMembers, setDesignerMembers] = useState<Array<{ id: string; label: string; avatarUrl?: string | null }>>([]);
  const [managerMembers, setManagerMembers] = useState<Array<{ id: string; label: string }>>([]);
  const [designQueueTasks, setDesignQueueTasks] = useState<DesignTask[]>([]);
  const [assigningSelf, setAssigningSelf] = useState(false);
  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [managerSaving, setManagerSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState<DesignStatus | null>(null);
  const [outputUploading, setOutputUploading] = useState(false);
  const [outputSaving, setOutputSaving] = useState(false);
  const [dropboxClientPath, setDropboxClientPath] = useState<string | null>(null);
  const [dropboxFolderDialogOpen, setDropboxFolderDialogOpen] = useState(false);
  const [dropboxFolderDraft, setDropboxFolderDraft] = useState("");
  const [dropboxFolderError, setDropboxFolderError] = useState<string | null>(null);
  const [dropboxExporting, setDropboxExporting] = useState(false);
  const [dropboxFolderReachable, setDropboxFolderReachable] = useState<boolean | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);
  const [partyCardOpen, setPartyCardOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<ActivityRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoadedAll, setHistoryLoadedAll] = useState(false);
  const [quoteMentionComments, setQuoteMentionComments] = useState<QuoteMentionComment[]>([]);
  const [quoteMentionsLoading, setQuoteMentionsLoading] = useState(false);
  const [quoteMentionsError, setQuoteMentionsError] = useState<string | null>(null);
  const [quoteCommentDraft, setQuoteCommentDraft] = useState("");
  const [quoteCommentSaving, setQuoteCommentSaving] = useState(false);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionDropdown, setMentionDropdown] = useState<MentionDropdownState>({
    side: "bottom",
    maxHeight: 224,
  });
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [addLinkUrl, setAddLinkUrl] = useState("https://");
  const [addLinkLabel, setAddLinkLabel] = useState("");
  const [addLinkGroupValue, setAddLinkGroupValue] = useState("__none__");
  const [addLinkGroupDraft, setAddLinkGroupDraft] = useState("");
  const [addLinkKind, setAddLinkKind] = useState<DesignOutputKind>("layout");
  const [addLinkError, setAddLinkError] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupDraft, setCreateGroupDraft] = useState("");
  const [createGroupError, setCreateGroupError] = useState<string | null>(null);
  const [uploadTargetGroup, setUploadTargetGroup] = useState("__none__");
  const [uploadTargetKind, setUploadTargetKind] = useState<DesignOutputKind>("layout");
  const [activeDesignOutputTab, setActiveDesignOutputTab] = useState<DesignOutputKind>("visualization");
  const [attachQuoteDialogOpen, setAttachQuoteDialogOpen] = useState(false);
  const [quoteCandidates, setQuoteCandidates] = useState<QuoteCandidate[]>([]);
  const [quoteCandidatesLoading, setQuoteCandidatesLoading] = useState(false);
  const [attachingQuoteId, setAttachingQuoteId] = useState<string | null>(null);
  const [estimateDialogOpen, setEstimateDialogOpen] = useState(false);
  const [estimateInput, setEstimateInput] = useState("2");
  const [estimateUnit, setEstimateUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [headerTypePopoverOpen, setHeaderTypePopoverOpen] = useState(false);
  const [headerDeadlinePopoverOpen, setHeaderDeadlinePopoverOpen] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [deadlineDraftDate, setDeadlineDraftDate] = useState<Date | undefined>();
  const [deadlineTime, setDeadlineTime] = useState("12:00");
  const [estimatePendingAction, setEstimatePendingAction] = useState<
    | { mode: "assign"; nextAssigneeUserId: string | null }
    | { mode: "assign_self"; alsoStart: boolean }
    | { mode: "status"; nextStatus: DesignStatus }
    | { mode: "manual" }
    | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const objectUrlRegistryRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(() => !initialCache?.task);
  const [error, setError] = useState<string | null>(null);
  const [briefDraft, setBriefDraft] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefEditorOpen, setBriefEditorOpen] = useState(false);
  const [briefInlineEditing, setBriefInlineEditing] = useState(false);
  const [briefSelection, setBriefSelection] = useState({ start: 0, end: 0 });
  const [changeRequestDraft, setChangeRequestDraft] = useState("");
  const [changeRequestSaving, setChangeRequestSaving] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [timerSummary, setTimerSummary] = useState<DesignTaskTimerSummary>({
    totalSeconds: 0,
    activeSessionId: null,
    activeStartedAt: null,
    activeUserId: null,
  });
  const [timerBusy, setTimerBusy] = useState<"start" | "pause" | null>(null);
  const [timerNowMs, setTimerNowMs] = useState<number>(() => Date.now());
  const outputInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const quoteCommentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const briefTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const briefDialogTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentDeletingId, setAttachmentDeletingId] = useState<string | null>(null);

  const effectiveTeamId = teamId;
  const canManageAssignments = permissions.canManageAssignments;
  const canManageDesignStatuses = permissions.canManageDesignStatuses;
  const canSelfAssign = permissions.canSelfAssignDesign;
  const isAssignedToMe = !!userId && task?.assigneeUserId === userId;
  const designTaskLock = useEntityLock({
    teamId: effectiveTeamId,
    entityType: "design_task",
    entityId: id ?? null,
    userId,
    userLabel: userId ? memberById[userId] ?? null : null,
    enabled: !!effectiveTeamId && !!id && !!userId,
  });
  const designTaskLockedByOther = designTaskLock.lockedByOther;

  useEffect(() => {
    syncDesignPageCacheTask(effectiveTeamId ?? "", task);
  }, [effectiveTeamId, task]);

  const ensureCanEdit = () => {
    if (!designTaskLockedByOther) return true;
    toast.error(
      `Запис зараз редагує ${designTaskLock.holderName ?? "інший користувач"}. Доступно лише перегляд.`
    );
    return false;
  };

  const getMemberLabel = (id: string | null | undefined) => {
    if (!id) return "Без виконавця";
    return memberById[id] ?? id.slice(0, 8);
  };
  const getMemberAvatar = (id: string | null | undefined) => {
    if (!id) return null;
    return memberAvatarById[id] ?? null;
  };

  const canDeleteTaskBriefAttachment = useCallback(
    (attachment: AttachmentRow) => {
      const managerUserId =
        typeof task?.metadata?.manager_user_id === "string" && task.metadata.manager_user_id
          ? (task.metadata.manager_user_id as string)
          : task?.quoteManagerUserId ?? null;
      return Boolean(managerUserId && userId && managerUserId === userId && attachment.uploaded_by === userId);
    },
    [task, userId]
  );

  const getTaskDisplayNumber = (value: DesignTask | null) => {
    if (!value) return "";
    if (value.designTaskNumber) return value.designTaskNumber;
    if (isUuid(value.quoteId) && value.quoteNumber) return value.quoteNumber;
    return value.quoteId.slice(0, 8);
  };

  const getDesignTaskOrdinalByCreatedAt = async (teamIdValue: string, createdAt: string) => {
    const date = new Date(createdAt);
    const monthCode = getQuoteMonthCode(createdAt);
    const monthStartIso = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const nextMonthStartIso = new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString();
    const { count, error: countError } = await supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamIdValue)
      .eq("action", "design_task")
      .gte("created_at", monthStartIso)
      .lte("created_at", createdAt)
      .lt("created_at", nextMonthStartIso);
    if (countError) throw countError;
    return formatDesignTaskNumber(monthCode, count ?? 1);
  };

  const getMethodLabel = (value: string | null | undefined) => {
    if (!value) return "Не вказано";
    if (methodLabelById[value]) return methodLabelById[value];
    return isUuid(value) ? "Метод з каталогу" : value;
  };

  const getPrintPositionLabel = (value: string | null | undefined) => {
    if (!value) return "Не вказано";
    if (positionLabelById[value]) return positionLabelById[value];
    return isUuid(value) ? "Позиція з каталогу" : value;
  };

  const briefVersions = useMemo(() => parseBriefVersions(task?.metadata?.design_brief_versions), [task?.metadata]);
  const briefChangeRequests = useMemo(
    () => parseBriefChangeRequests(task?.metadata?.design_brief_change_requests),
    [task?.metadata]
  );
  const activeBriefVersion = useMemo(() => {
    if (briefVersions.length === 0) return null;
    const activeVersionId = toNonEmptyString(task?.metadata?.design_brief_active_version_id);
    if (activeVersionId) {
      const found = briefVersions.find((row) => row.id === activeVersionId);
      if (found) return found;
    }
    return briefVersions[briefVersions.length - 1] ?? null;
  }, [briefVersions, task?.metadata]);
  const briefChangeRequestById = useMemo(
    () => new Map(briefChangeRequests.map((row) => [row.id, row] as const)),
    [briefChangeRequests]
  );
  const hasBriefHistory = briefVersions.length > 1;

  const loadTimerSummary = async (taskId: string) => {
    if (!effectiveTeamId) return;
    try {
      const summary = await getDesignTaskTimerSummary(effectiveTeamId, taskId);
      setTimerSummary(summary);
    } catch (e) {
      console.warn("Failed to load timer summary", e);
      setTimerSummary({
        totalSeconds: 0,
        activeSessionId: null,
        activeStartedAt: null,
        activeUserId: null,
      });
    }
  };

  useEffect(() => {
    const loadMembers = async () => {
      if (!userId) return;
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) {
          return;
        }
        const rows = await listWorkspaceMembersForDisplay(workspaceId);

        const labels: Record<string, string> = {};
        const avatars: Record<string, string | null> = {};
        rows.forEach((row) => {
          labels[row.userId] = row.label;
          avatars[row.userId] = row.avatarDisplayUrl;
        });

        setMemberById(labels);
        setMemberAvatarById(avatars);

        const resolvedRoleById: Record<string, string> = {};
        rows.forEach((row) => {
          const role = row.jobRole;
          if (typeof role === "string" && role.trim()) {
            resolvedRoleById[row.userId] = role.trim();
          }
        });
        setMemberRoleById(resolvedRoleById);

        setDesignerMembers(
          rows
            .filter((row) => isDesignerRole(row.jobRole))
            .map((row) => ({
              id: row.userId,
              label: labels[row.userId] ?? row.userId,
              avatarUrl: avatars[row.userId] ?? null,
            }))
        );
        let managerRows = rows.filter((row) => isManagerRole(row.accessRole, row.jobRole));
        if (managerRows.length === 0 && userId) {
          const me = rows.find((row) => row.userId === userId);
          if (me) managerRows = [me];
        }
        if (managerRows.length === 0) managerRows = rows;
        setManagerMembers(
          managerRows.map((row) => ({
            id: row.userId,
            label: labels[row.userId] ?? row.userId,
          }))
        );
      } catch {
        // Optional UI context; keep page functional even if membership lookup fails.
      }
    };
    void loadMembers();
  }, [userId, effectiveTeamId]);

  useEffect(() => {
    let active = true;
    const loadDesignQueue = async () => {
      if (!effectiveTeamId) return;
      try {
        const { data, error: fetchError } = await supabase
          .from("activity_log")
          .select(
            "id,entity_id,title,status:metadata->>status,quote_id:metadata->>quote_id,design_task_type:metadata->>design_task_type,assignee_user_id:metadata->>assignee_user_id,assigned_at:metadata->>assigned_at,design_deadline:metadata->>design_deadline,deadline:metadata->>deadline,estimate_minutes:metadata->>estimate_minutes,created_at"
          )
          .eq("team_id", effectiveTeamId)
          .eq("action", "design_task");
        if (fetchError) throw fetchError;

        const parsed = ((data ?? []) as Array<{
          id: string;
          entity_id?: string | null;
          title?: string | null;
          status?: string | null;
          quote_id?: string | null;
          design_task_type?: string | null;
          assignee_user_id?: string | null;
          assigned_at?: string | null;
          design_deadline?: string | null;
          deadline?: string | null;
          estimate_minutes?: string | null;
          created_at?: string | null;
        }>).map((row) => {
          const metadata: Record<string, unknown> = {};
          if (typeof row.estimate_minutes === "string" && row.estimate_minutes.trim()) {
            metadata.estimate_minutes = row.estimate_minutes.trim();
          }
          const metadataQuoteId = typeof row.quote_id === "string" && row.quote_id.trim() ? row.quote_id.trim() : null;
          return {
            id: row.id,
            quoteId: metadataQuoteId ?? (typeof row.entity_id === "string" ? row.entity_id : ""),
            title: row.title ?? null,
            status:
              typeof row.status === "string" && row.status.trim()
                ? (row.status.trim() as DesignStatus)
                : "new",
            designTaskType: parseDesignTaskType(row.design_task_type),
            assigneeUserId: typeof row.assignee_user_id === "string" && row.assignee_user_id.trim() ? row.assignee_user_id.trim() : null,
            assignedAt: typeof row.assigned_at === "string" ? row.assigned_at : null,
            metadata,
            designDeadline:
              typeof row.design_deadline === "string"
                ? row.design_deadline
                : typeof row.deadline === "string"
                  ? row.deadline
                  : null,
            createdAt: typeof row.created_at === "string" ? row.created_at : null,
          } as DesignTask;
        });

        if (active) setDesignQueueTasks(parsed);
      } catch (queueError) {
        console.warn("Failed to load design queue for workload insights", queueError);
        if (active) setDesignQueueTasks([]);
      }
    };

    void loadDesignQueue();

    return () => {
      active = false;
    };
  }, [effectiveTeamId]);

  useEffect(() => {
    const load = async () => {
      if (!id || !effectiveTeamId) return;
      if (!task) setLoading(true);
      setError(null);
      try {
        const { data: row, error: rowError } = await supabase
          .from("activity_log")
          .select("id,entity_id,metadata,title,created_at,user_id")
          .eq("team_id", effectiveTeamId)
          .eq("id", id)
          .single();
        if (rowError) throw rowError;
        const meta = (row?.metadata as Record<string, unknown> | null) ?? {};
        const metadataQuoteId =
          typeof meta.quote_id === "string" && meta.quote_id.trim() ? meta.quote_id.trim() : null;
        const entityQuoteId = typeof row?.entity_id === "string" ? row.entity_id : "";
        const quoteId = metadataQuoteId ?? entityQuoteId;

        // quote basics
        let quote: {
          number?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_logo_url?: string | null;
          title?: string | null;
          assigned_to?: string | null;
          created_at?: string | null;
          design_brief?: string | null;
          comment?: string | null;
        } | null = null;
        if (isUuid(quoteId)) {
          const { data: quoteData, error: quoteError } = await supabase
            .schema("tosho")
            .from("quotes")
            .select("number, customer_id, customer_name, customer_logo_url, title, assigned_to, created_at, design_brief, comment")
            .eq("id", quoteId)
            .maybeSingle();
          if (
            quoteError &&
            /column/i.test(quoteError.message ?? "") &&
            /design_brief/i.test(quoteError.message ?? "")
          ) {
            const { data: quoteFallback, error: quoteFallbackError } = await supabase
              .schema("tosho")
              .from("quotes")
              .select("number, customer_id, customer_name, title, assigned_to, created_at, comment")
              .eq("id", quoteId)
              .maybeSingle();
            if (quoteFallbackError) throw quoteFallbackError;
            quote = quoteFallback as {
              number?: string | null;
              customer_id?: string | null;
              customer_name?: string | null;
              title?: string | null;
              assigned_to?: string | null;
              created_at?: string | null;
              comment?: string | null;
            } | null;
          } else if (quoteError) {
            throw quoteError;
          } else {
            quote = quoteData as {
              number?: string | null;
              customer_id?: string | null;
              customer_name?: string | null;
              customer_logo_url?: string | null;
              title?: string | null;
              assigned_to?: string | null;
              created_at?: string | null;
              design_brief?: string | null;
              comment?: string | null;
            } | null;
          }
        }

        let customerName: string | null =
          (typeof meta.customer_name === "string" && meta.customer_name.trim() ? meta.customer_name.trim() : null) ??
          (typeof quote?.customer_name === "string" && quote.customer_name.trim() ? quote.customer_name.trim() : null) ??
          (typeof quote?.title === "string" && quote.title.trim() ? quote.title.trim() : null);
        let customerLogoUrl: string | null = null;
        const metadataCustomerId =
          typeof meta.customer_id === "string" && meta.customer_id.trim() ? meta.customer_id.trim() : null;
        const metadataCustomerTypeRaw =
          typeof meta.customer_type === "string" && meta.customer_type.trim()
            ? meta.customer_type.trim().toLowerCase()
            : null;
        const metadataCustomerType =
          metadataCustomerTypeRaw === "lead" || metadataCustomerTypeRaw === "customer"
            ? metadataCustomerTypeRaw
            : null;
        const logoDirectory = effectiveTeamId ? await listCustomerLeadLogoDirectory(effectiveTeamId) : [];
        const entryByTypedId = new Map(
          logoDirectory.map((entry) => [`${entry.entityType}:${entry.id}`, entry] as const)
        );
        const entryByLabel = new Map<string, (typeof logoDirectory)[number]>();
        const entryByCompactLabel = new Map<string, (typeof logoDirectory)[number]>();
        logoDirectory.forEach((entry) => {
          [entry.label, entry.legalName].forEach((label) => {
            const normalized = normalizePartyLabel(label);
            const compact = compactPartyLabel(label);
            if (normalized && !entryByLabel.has(normalized)) entryByLabel.set(normalized, entry);
            if (compact && !entryByCompactLabel.has(compact)) entryByCompactLabel.set(compact, entry);
          });
        });

        const directEntry =
          (quote?.customer_id ? entryByTypedId.get(`customer:${quote.customer_id}`) : null) ??
          (metadataCustomerId && metadataCustomerType ? entryByTypedId.get(`${metadataCustomerType}:${metadataCustomerId}`) : null) ??
          null;

        if (directEntry) {
          customerName = directEntry.label || directEntry.legalName || customerName;
          customerLogoUrl = directEntry.logoUrl ?? customerLogoUrl;
        } else {
          const lookupName = (customerName ?? quote?.title ?? "").trim();
          if (lookupName) {
            const normalizedLookup = normalizePartyLabel(lookupName);
            const compactLookup = compactPartyLabel(lookupName);
            const matchedEntry =
              entryByLabel.get(normalizedLookup) ??
              entryByCompactLabel.get(compactLookup) ??
              logoDirectory.find((entry) => {
                const label = normalizePartyLabel(entry.label);
                const legalName = normalizePartyLabel(entry.legalName);
                return (
                  (!!normalizedLookup && !!label && label.includes(normalizedLookup)) ||
                  (!!normalizedLookup && !!legalName && legalName.includes(normalizedLookup))
                );
              }) ??
              null;
            if (matchedEntry) {
              customerName = customerName ?? matchedEntry.label ?? matchedEntry.legalName ?? null;
              customerLogoUrl = matchedEntry.logoUrl ?? customerLogoUrl;
            }
          }
        }

        if (!customerLogoUrl) {
          customerLogoUrl =
            normalizeLogoUrl(typeof meta.customer_logo_url === "string" ? meta.customer_logo_url : null) ??
            normalizeLogoUrl(quote?.customer_logo_url ?? null);
        }

        // first quote item (only for quote-linked tasks)
        const { data: item } = isUuid(quoteId)
          ? await supabase
              .schema("tosho")
              .from("quote_items")
              .select("name, qty, unit, methods, attachment, catalog_model_id, catalog_kind_id")
              .eq("quote_id", quoteId)
              .order("position", { ascending: true })
              .limit(1)
              .maybeSingle()
          : { data: null };

        let itemPreviewUrl: string | null = null;
        let itemZoomPreviewUrl: string | null = null;
        if (item?.catalog_model_id) {
          const modelRows = await listCatalogModelsByIds([item.catalog_model_id as string]);
          const modelRow = modelRows.get(item.catalog_model_id as string);
          itemPreviewUrl = modelRow?.thumb_url ?? modelRow?.image_url ?? null;
          itemZoomPreviewUrl = modelRow?.image_url ?? modelRow?.thumb_url ?? null;
        }
        // Keep product image independent from design visualizations.

        const rawStandaloneBriefFiles = Array.isArray(meta.standalone_brief_files)
          ? meta.standalone_brief_files
          : [];
        const parsedStandaloneBriefFiles = rawStandaloneBriefFiles
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            const fileName = typeof entry.file_name === "string" && entry.file_name ? entry.file_name : null;
            const storageBucket = typeof entry.storage_bucket === "string" && entry.storage_bucket ? entry.storage_bucket : null;
            const storagePath = typeof entry.storage_path === "string" && entry.storage_path ? entry.storage_path : null;
            if (!fileName || !storageBucket || !storagePath) return null;
            return {
              id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
              file_name: fileName,
              file_size: entry.file_size == null ? null : Number(entry.file_size),
              created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
              storage_bucket: storageBucket,
              storage_path: storagePath,
              uploaded_by: typeof entry.uploaded_by === "string" ? entry.uploaded_by : null,
            } satisfies AttachmentRow;
          })
          .filter(Boolean) as AttachmentRow[];

        const standaloneBriefFilesWithUrls = parsedStandaloneBriefFiles.map((file) => ({ ...file, signed_url: null }));

        const rawDesignFiles = Array.isArray(meta.design_output_files) ? meta.design_output_files : [];
        const designOutputFallbackType = parseDesignTaskType(meta.design_task_type);
        const parsedDesignFiles: DesignOutputFile[] = rawDesignFiles
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            const fileName = typeof entry.file_name === "string" && entry.file_name ? entry.file_name : null;
            const storageBucket = typeof entry.storage_bucket === "string" && entry.storage_bucket ? entry.storage_bucket : null;
            const storagePath = typeof entry.storage_path === "string" && entry.storage_path ? entry.storage_path : null;
            if (!fileName || !storageBucket || !storagePath) return null;
            return {
              id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
              file_name: fileName,
              file_size: entry.file_size == null ? null : Number(entry.file_size),
              mime_type: typeof entry.mime_type === "string" ? entry.mime_type : null,
              storage_bucket: storageBucket,
              storage_path: storagePath,
              uploaded_by: typeof entry.uploaded_by === "string" ? entry.uploaded_by : null,
              created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
              group_label: normalizeOutputGroupLabel(typeof entry.group_label === "string" ? entry.group_label : null),
              output_kind: parseDesignOutputKind(entry.output_kind, designOutputFallbackType),
              signed_url: null,
            } satisfies DesignOutputFile;
          })
          .filter(Boolean) as DesignOutputFile[];

        const designFilesWithUrls = parsedDesignFiles;

        const rawDesignLinks = Array.isArray(meta.design_output_links) ? meta.design_output_links : [];
        const parsedDesignLinks: DesignOutputLink[] = rawDesignLinks
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            const url = typeof entry.url === "string" ? entry.url.trim() : "";
            if (!url) return null;
            return {
              id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
              label: (typeof entry.label === "string" && entry.label.trim()) || "Посилання",
              url,
              created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
              created_by: typeof entry.created_by === "string" ? entry.created_by : null,
              group_label: normalizeOutputGroupLabel(typeof entry.group_label === "string" ? entry.group_label : null),
              output_kind: parseDesignOutputKind(entry.output_kind, designOutputFallbackType),
            } satisfies DesignOutputLink;
          })
          .filter(Boolean) as DesignOutputLink[];
        const parsedOutputGroups = Array.from(
          new Set([
            ...parseStringArray(meta.design_output_groups),
            ...parsedDesignFiles.map((file) => normalizeOutputGroupLabel(file.group_label)).filter((value): value is string => !!value),
            ...parsedDesignLinks.map((link) => normalizeOutputGroupLabel(link.group_label)).filter((value): value is string => !!value),
          ])
        );

        let designTaskNumber: string | null =
          typeof meta.design_task_number === "string" && meta.design_task_number.trim()
            ? (/^DZ-/i.test(meta.design_task_number.trim()) ? null : meta.design_task_number.trim())
            : null;
        if (!designTaskNumber && typeof row?.created_at === "string" && row.created_at) {
          try {
            designTaskNumber = await getDesignTaskOrdinalByCreatedAt(effectiveTeamId, row.created_at);
          } catch (numberError) {
            console.warn("Failed to derive design task number", numberError);
          }
        }

        const metaBriefVersions = parseBriefVersions(meta.design_brief_versions);
        const metaActiveBriefVersionId = toNonEmptyString(meta.design_brief_active_version_id);
        const activeBriefVersion =
          (metaActiveBriefVersionId
            ? metaBriefVersions.find((entry) => entry.id === metaActiveBriefVersionId)
            : null) ??
          metaBriefVersions[metaBriefVersions.length - 1] ??
          null;

        const nextTask = {
          id,
          quoteId,
          title: (row?.title as string) ?? null,
          status: (meta.status as DesignStatus) ?? "new",
          designTaskType: parseDesignTaskType(meta.design_task_type),
          creatorUserId:
            typeof row?.user_id === "string" && row.user_id.trim()
              ? row.user_id.trim()
              : (typeof meta.created_by_user_id === "string" && meta.created_by_user_id.trim()
                  ? meta.created_by_user_id.trim()
                  : null),
          designTaskNumber,
          assigneeUserId:
            typeof meta.assignee_user_id === "string" && meta.assignee_user_id ? meta.assignee_user_id : null,
          assignedAt: typeof meta.assigned_at === "string" ? meta.assigned_at : null,
          metadata: meta,
          methodsCount: meta.methods_count ?? (item?.methods?.length ?? 0),
          hasFiles:
            typeof meta.has_files === "boolean" ? meta.has_files : parsedStandaloneBriefFiles.length > 0,
          designDeadline:
            (typeof meta.design_deadline === "string" ? meta.design_deadline : null) ??
            (typeof meta.deadline === "string" ? meta.deadline : null),
          quoteNumber:
            (typeof meta.quote_number === "string" && meta.quote_number.trim() ? meta.quote_number.trim() : null) ??
            (quote?.number as string) ??
            null,
          customerId:
            (typeof meta.customer_id === "string" && meta.customer_id.trim() ? meta.customer_id.trim() : null) ??
            (quote?.customer_id as string | null | undefined) ??
            null,
          customerName,
          customerLogoUrl,
          quoteManagerUserId:
            (typeof meta.manager_user_id === "string" && meta.manager_user_id.trim()
              ? meta.manager_user_id
              : null) ??
            (typeof quote?.assigned_to === "string" && quote.assigned_to.trim() ? quote.assigned_to : null),
          designBrief:
            activeBriefVersion?.brief ??
            (typeof meta.design_brief === "string" && meta.design_brief.trim() ? meta.design_brief.trim() : null) ??
            quote?.design_brief ??
            quote?.comment ??
            null,
          createdAt:
            (typeof row?.created_at === "string" && row.created_at ? row.created_at : null) ??
            (quote?.created_at as string | null),
        };
        const designOutputKeys = new Set(
          designFilesWithUrls.map((file) => `${file.storage_bucket}:${file.storage_path}`)
        );

        const nextQuoteItem = item ?? null;
        const nextProductPreviewUrl = itemPreviewUrl;
        const nextProductZoomPreviewUrl = itemZoomPreviewUrl;
        const nextAttachments = [...standaloneBriefFilesWithUrls];
        const nextDesignOutputFiles = designFilesWithUrls;
        const nextDesignOutputLinks = parsedDesignLinks;
        const nextDesignOutputGroups = parsedOutputGroups;

        setTask(nextTask);
        setQuoteItem(nextQuoteItem);
        setProductPreviewUrl(nextProductPreviewUrl);
        setProductZoomPreviewUrl(nextProductZoomPreviewUrl);
        setAttachments(nextAttachments);
        setCustomerAttachmentsLoaded(false);
        setCustomerAttachmentsError(null);
        setDesignOutputFiles(nextDesignOutputFiles);
        setDesignOutputLinks(nextDesignOutputLinks);
        setDesignOutputGroups(nextDesignOutputGroups);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              `design-task-page-cache:${effectiveTeamId}:${id}`,
              JSON.stringify(
                buildDesignTaskPageCachePayload({
                  task: nextTask,
                  quoteItem: nextQuoteItem,
                  productPreviewUrl: nextProductPreviewUrl,
                  productZoomPreviewUrl: nextProductZoomPreviewUrl,
                  customerAttachmentsLoaded: false,
                  attachments: nextAttachments,
                  designOutputLinks: nextDesignOutputLinks,
                  designOutputGroups: nextDesignOutputGroups,
                })
              )
            );
          } catch {
            // ignore cache persistence failures
          }
        }
      } catch (e: unknown) {
        setError(getErrorMessage(e, "Не вдалося завантажити задачу"));
      } finally {
        setLoading(false);
      }
    };
    void load();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTeamId, id]);

  useEffect(() => {
    let active = true;

    const loadDropboxClientPath = async () => {
      const metadataPath =
        typeof task?.metadata?.dropbox_client_path === "string" && task.metadata.dropbox_client_path.trim()
          ? task.metadata.dropbox_client_path.trim()
          : "";
      if (!task?.customerId) {
        if (active) setDropboxClientPath(metadataPath || null);
        return;
      }
      try {
        const { data, error } = await supabase
          .schema("tosho")
          .from("customers")
          .select("dropbox_client_path")
          .eq("id", task.customerId)
          .maybeSingle();
        if (error) {
          const message = error.message ?? "";
          if (/column/i.test(message) && /dropbox_client_path/i.test(message)) {
            if (active) setDropboxClientPath(null);
            return;
          }
          throw error;
        }
        if (!active) return;
        const nextPath =
          data && typeof (data as { dropbox_client_path?: string | null }).dropbox_client_path === "string"
            ? (data as { dropbox_client_path: string }).dropbox_client_path.trim()
            : "";
        setDropboxClientPath(nextPath || metadataPath || null);
      } catch (loadError) {
        console.warn("Failed to load Dropbox client path", loadError);
        if (active) setDropboxClientPath(metadataPath || null);
      }
    };

    void loadDropboxClientPath();

    return () => {
      active = false;
    };
  }, [task?.customerId, task?.metadata]);

  const loadCustomerAttachments = useCallback(async (options?: { force?: boolean }) => {
    if (!effectiveTeamId || !task || !isUuid(task.quoteId)) return;
    if (customerAttachmentsLoading) return;
    if (customerAttachmentsLoaded && !options?.force) return;

    setCustomerAttachmentsLoading(true);
    setCustomerAttachmentsError(null);
    try {
      const { data, error } = await supabase
        .schema("tosho")
        .from("quote_attachments")
        .select("id,file_name,file_size,created_at,storage_bucket,storage_path,uploaded_by")
        .eq("quote_id", task.quoteId);
      if (error) throw error;

      const attachmentRows = ((data as AttachmentRow[] | null) ?? []).map((file) => ({ ...file, signed_url: null }));
      const designOutputKeys = new Set(
        designOutputFiles.map((file) => `${file.storage_bucket}:${file.storage_path}`)
      );
      const customerOnlyAttachments = attachmentRows.filter(
        (file) => !designOutputKeys.has(`${file.storage_bucket}:${file.storage_path}`)
      );
      const standaloneKeys = new Set(
        (Array.isArray(task.metadata?.standalone_brief_files) ? task.metadata.standalone_brief_files : [])
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const entry = row as Record<string, unknown>;
            if (typeof entry.storage_bucket !== "string" || typeof entry.storage_path !== "string") return null;
            return `${entry.storage_bucket}:${entry.storage_path}`;
          })
          .filter((value): value is string => !!value)
      );

      setAttachments((prev) => {
        const standaloneAttachments = prev.filter((file) =>
          standaloneKeys.has(`${file.storage_bucket}:${file.storage_path}`)
        );
        return [...standaloneAttachments, ...customerOnlyAttachments];
      });
      setCustomerAttachmentsLoaded(true);

      if (typeof window !== "undefined" && id) {
        const cacheKey = `design-task-page-cache:${effectiveTeamId}:${id}`;
        try {
          const cachedRaw = sessionStorage.getItem(cacheKey);
          const cached = cachedRaw ? (JSON.parse(cachedRaw) as Partial<DesignTaskPageCachePayload>) : null;
          const nextCachedAttachments = [
            ...attachments.filter((file) => standaloneKeys.has(`${file.storage_bucket}:${file.storage_path}`)),
            ...customerOnlyAttachments,
          ];
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              ...(cached ?? {}),
              ...buildDesignTaskPageCachePayload({
                task,
                quoteItem,
                productPreviewUrl,
                productZoomPreviewUrl,
                customerAttachmentsLoaded: true,
                attachments: nextCachedAttachments,
                designOutputLinks,
                designOutputGroups,
              }),
            } satisfies DesignTaskPageCachePayload)
          );
        } catch {
          // ignore cache persistence failures
        }
      }
    } catch (e: unknown) {
      setCustomerAttachmentsError(getErrorMessage(e, "Не вдалося завантажити файли замовника"));
    } finally {
      setCustomerAttachmentsLoading(false);
    }
  }, [
    attachments,
    customerAttachmentsLoaded,
    customerAttachmentsLoading,
    designOutputFiles,
    designOutputGroups,
    designOutputLinks,
    effectiveTeamId,
    id,
    productPreviewUrl,
    productZoomPreviewUrl,
    quoteItem,
    task,
  ]);

  const loadHistory = async (taskId: string, options?: { full?: boolean }) => {
    if (!effectiveTeamId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const createdQuery = supabase
        .from("activity_log")
        .select("id,team_id,user_id,actor_name,action,entity_type,entity_id,title,href,metadata,created_at")
        .eq("team_id", effectiveTeamId)
        .eq("id", taskId)
        .maybeSingle();

      const eventsQuery = supabase
        .from("activity_log")
        .select("id,team_id,user_id,actor_name,action,entity_type,entity_id,title,href,metadata,created_at")
        .eq("team_id", effectiveTeamId)
        .eq("entity_type", "design_task")
        .eq("entity_id", taskId)
        .neq("action", "design_task_timer")
        .order("created_at", { ascending: false });

      if (!options?.full) {
        eventsQuery.limit(DESIGN_TASK_HISTORY_PAGE_SIZE);
      }

      const [{ data: createdRow, error: createdError }, { data: eventRows, error: eventsError }] = await Promise.all([
        createdQuery,
        eventsQuery,
      ]);
      if (createdError) throw createdError;
      if (eventsError) throw eventsError;

      const rows = [
        ...(createdRow ? [createdRow as ActivityRow] : []),
        ...(((eventRows as ActivityRow[] | null) ?? []).filter((row) => row.id !== createdRow?.id)),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setHistoryRows(rows);
      setHistoryLoadedAll(options?.full ?? ((eventRows as ActivityRow[] | null)?.length ?? 0) < DESIGN_TASK_HISTORY_PAGE_SIZE);
    } catch (e: unknown) {
      setHistoryRows([]);
      setHistoryError(getErrorMessage(e, "Не вдалося завантажити історію задачі."));
      setHistoryLoadedAll(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!task?.id) return;
    void loadHistory(task.id);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, effectiveTeamId]);

  useEffect(() => {
    if (!task?.id) return;
    void loadTimerSummary(task.id);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, effectiveTeamId]);

  const taskIdForMentions = task?.id ?? null;
  const taskQuoteIdForMentions = task?.quoteId ?? null;
  useEffect(() => {
    const loadQuoteMentions = async () => {
      if (!taskIdForMentions || !taskQuoteIdForMentions || !isUuid(taskQuoteIdForMentions)) {
        setQuoteMentionComments([]);
        setQuoteMentionsError(null);
        setQuoteMentionsLoading(false);
        return;
      }

      setQuoteMentionsLoading(true);
      setQuoteMentionsError(null);
      try {
        let rows: QuoteMentionComment[] = [];
          const { data, error: commentsError } = await supabase
            .schema("tosho")
            .from("quote_comments")
            .select("id,body,created_at,created_by")
            .eq("quote_id", taskQuoteIdForMentions)
            .order("created_at", { ascending: false })
            .limit(30);

        if (!commentsError) {
          rows =
            ((data as Array<{ id: string; body: string | null; created_at: string; created_by: string | null }> | null) ?? [])
              .map((row) => ({
                id: row.id,
                body: row.body ?? "",
                created_at: row.created_at,
                created_by: row.created_by ?? "",
              }));
        } else {
          const sessionData = await supabase.auth.getSession();
          const token = sessionData.data.session?.access_token;
          if (!token) throw commentsError;
          const response = await fetch("/.netlify/functions/quote-comments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ mode: "list", quoteId: taskQuoteIdForMentions }),
          });
          if (!response.ok) throw commentsError;
          const payload = await parseJsonSafe<{ comments?: unknown[] }>(response);
          rows = (Array.isArray(payload?.comments) ? payload.comments : [])
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const data = row as Record<string, unknown>;
              if (typeof data.id !== "string" || typeof data.created_at !== "string") return null;
              return {
                id: data.id,
                body: typeof data.body === "string" ? data.body : "",
                created_at: data.created_at,
                created_by: typeof data.created_by === "string" ? data.created_by : "",
              } satisfies QuoteMentionComment;
            })
            .filter(Boolean) as QuoteMentionComment[];
        }

        setQuoteMentionComments(rows.filter((row) => row.body.includes("@")));
      } catch (e: unknown) {
        setQuoteMentionComments([]);
        setQuoteMentionsError(getErrorMessage(e, "Не вдалося завантажити згадки з прорахунку."));
      } finally {
        setQuoteMentionsLoading(false);
      }
    };
    void loadQuoteMentions();
  }, [taskIdForMentions, taskQuoteIdForMentions]);

  useEffect(() => {
    if (!task) return;
    if (briefDirty) return;
    setBriefDraft(activeBriefVersion?.brief ?? task.designBrief ?? "");
  }, [task, briefDirty, activeBriefVersion]);

  useEffect(() => {
    resizeTextareaToContent(briefTextareaRef.current, BRIEF_INLINE_TEXTAREA_MAX_HEIGHT);
    resizeTextareaToContent(briefDialogTextareaRef.current, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT);
  }, [briefDraft, briefEditorOpen, briefInlineEditing]);

  useEffect(() => {
    if (!briefInlineEditing) return;
    const frameId = requestAnimationFrame(() => {
      briefTextareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(frameId);
  }, [briefInlineEditing]);

  const handleBriefInlineBlur = useCallback(() => {
    if (briefDirty) return;
    requestAnimationFrame(() => {
      if (document.activeElement === briefTextareaRef.current) return;
      setBriefInlineEditing(false);
    });
  }, [briefDirty]);

  useEffect(() => {
    if (!briefEditorOpen) return;
    const frameId = requestAnimationFrame(() => {
      briefDialogTextareaRef.current?.focus();
      const length = briefDialogTextareaRef.current?.value.length ?? 0;
      briefDialogTextareaRef.current?.setSelectionRange(length, length);
      setBriefSelection({ start: length, end: length });
    });
    return () => cancelAnimationFrame(frameId);
  }, [briefEditorOpen]);

  const applyBriefFormatting = useCallback(
    (formatter: (params: {
      value: string;
      selectionStart: number;
      selectionEnd: number;
      selectedText: string;
    }) => { nextText: string; replaceStart?: number; replaceEnd?: number; selectionStart: number; selectionEnd: number }) => {
      const textarea = briefDialogTextareaRef.current;
      if (!textarea || briefSaving || designTaskLockedByOther) return;
      const formatted = formatBriefSelection(textarea, formatter);
      setBriefDraft(formatted.nextValue);
      setBriefDirty(true);
      requestAnimationFrame(() => {
        const target = briefDialogTextareaRef.current;
        if (!target) return;
        target.focus();
        target.setSelectionRange(formatted.selectionStart, formatted.selectionEnd);
        resizeTextareaToContent(target, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT);
      });
    },
    [briefSaving, designTaskLockedByOther]
  );

  const syncBriefSelection = useCallback(() => {
    const textarea = briefDialogTextareaRef.current;
    if (!textarea) return;
    setBriefSelection({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    });
  }, []);

  const selectedBriefText = useMemo(() => {
    const start = Math.min(briefSelection.start, briefSelection.end);
    const end = Math.max(briefSelection.start, briefSelection.end);
    return briefDraft.slice(start, end);
  }, [briefDraft, briefSelection.end, briefSelection.start]);

  const briefSelectionStart = Math.min(briefSelection.start, briefSelection.end);
  const briefSelectionEnd = Math.max(briefSelection.start, briefSelection.end);
  const briefSelectionBeforeBold = briefDraft.slice(Math.max(0, briefSelectionStart - 2), briefSelectionStart);
  const briefSelectionAfterBold = briefDraft.slice(briefSelectionEnd, briefSelectionEnd + 2);
  const briefSelectionBeforeItalic = briefDraft.slice(Math.max(0, briefSelectionStart - 1), briefSelectionStart);
  const briefSelectionAfterItalic = briefDraft.slice(briefSelectionEnd, briefSelectionEnd + 1);

  const boldActive =
    (selectedBriefText.startsWith("**") && selectedBriefText.endsWith("**") && selectedBriefText.length > 4) ||
    (selectedBriefText.length > 0 && briefSelectionBeforeBold === "**" && briefSelectionAfterBold === "**");
  const italicActive =
    ((selectedBriefText.startsWith("*") && selectedBriefText.endsWith("*") && !boldActive && selectedBriefText.length > 2) ||
      (selectedBriefText.length > 0 && briefSelectionBeforeItalic === "*" && briefSelectionAfterItalic === "*")) &&
    !boldActive;
  const headingActive = /^##\s+.+$/m.test(selectedBriefText.trim());
  const bulletActive = selectedBriefText.trim().length > 0 && selectedBriefText.split("\n").every((line) => /^-\s+/.test(line));
  const orderedActive =
    selectedBriefText.trim().length > 0 && selectedBriefText.split("\n").every((line) => /^\d+\.\s+/.test(line));

  const insertMentionIntoComment = (memberId: string) => {
    const suggestion = mentionSuggestions.find((entry) => entry.id === memberId);
    if (!suggestion) return;
    setQuoteCommentDraft((prev) => `${prev.trimEnd()}${prev.trim() ? " " : ""}@${suggestion.alias} `);
    setMentionContext(null);
    setMentionActiveIndex(0);
    requestAnimationFrame(() => quoteCommentTextareaRef.current?.focus());
  };

  const measureMentionDropdown = () => {
    const textarea = quoteCommentTextareaRef.current;
    if (!textarea || typeof window === "undefined") return;

    const rect = textarea.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 8;
    const maxDropdownHeight = 224;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const spaceAbove = rect.top - viewportPadding - gap;
    const side =
      spaceBelow >= maxDropdownHeight || spaceBelow >= spaceAbove ? "bottom" : "top";
    const availableSpace = side === "bottom" ? spaceBelow : spaceAbove;

    setMentionDropdown({
      side,
      maxHeight: Math.max(96, Math.min(maxDropdownHeight, Math.floor(Math.max(availableSpace, 96)))),
    });
  };

  const resolveMentionContext = (text: string, cursor: number): MentionContext | null => {
    if (!text || cursor <= 0) return null;

    const start = text.lastIndexOf("@", Math.max(0, cursor - 1));
    if (start < 0) return null;

    const prevChar = start > 0 ? text[start - 1] : "";
    if (start > 0 && !/[\s(]/u.test(prevChar)) return null;

    const query = text.slice(start + 1, cursor);
    if (query.includes("@")) return null;
    if ([...query].some((char) => isMentionTerminator(char))) return null;

    let end = cursor;
    while (end < text.length && !isMentionTerminator(text[end])) {
      end += 1;
    }

    return { start, end, query };
  };

  const syncMentionContext = (text: string, cursor: number) => {
    const nextContext = resolveMentionContext(text, cursor);
    setMentionContext(nextContext);
    if (nextContext) {
      measureMentionDropdown();
    }
    setMentionActiveIndex(0);
  };

  const applyMentionSuggestion = (suggestion: MentionSuggestion) => {
    if (!mentionContext) return;

    const before = quoteCommentDraft.slice(0, mentionContext.start);
    const after = quoteCommentDraft.slice(mentionContext.end);
    const mentionToken = `@${suggestion.alias}`;
    const needsSpaceAfter = after.length > 0 && !/^[\s,;:!?()[\]{}<>]/u.test(after);
    const insertText = `${mentionToken}${needsSpaceAfter ? " " : ""}`;
    const nextValue = `${before}${insertText}${after}`;
    const caretPosition = before.length + insertText.length;

    setQuoteCommentDraft(nextValue);
    setMentionContext(null);
    setMentionActiveIndex(0);

    requestAnimationFrame(() => {
      const input = quoteCommentTextareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(caretPosition, caretPosition);
    });
  };

  const handleQuoteCommentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionContext) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setMentionContext(null);
      setMentionActiveIndex(0);
      return;
    }

    if (filteredMentionSuggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionActiveIndex((prev) => (prev + 1) % filteredMentionSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionActiveIndex((prev) =>
        prev === 0 ? filteredMentionSuggestions.length - 1 : prev - 1
      );
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const selected =
        filteredMentionSuggestions[Math.max(0, mentionActiveIndex)] ?? filteredMentionSuggestions[0];
      if (selected) {
        applyMentionSuggestion(selected);
      }
    }
  };

  useEffect(() => {
    if (!mentionContext) return;
    const handleViewportChange = () => measureMentionDropdown();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [mentionContext]);

  const handleSubmitQuoteComment = async () => {
    if (!task?.id) return;
    const body = quoteCommentDraft.trim();
    if (!body) {
      toast.error("Введіть коментар.");
      return;
    }
    setQuoteCommentSaving(true);
    try {
      const mentionKeys = extractMentionKeys(body);
      const mentionedUserIds = Array.from(
        new Set(
          mentionKeys
            .map((key) => mentionLookup.get(key))
            .filter((set): set is Set<string> => !!set && set.size === 1)
            .flatMap((set) => Array.from(set))
            .filter((memberId) => memberId !== userId)
        )
      );

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (isUuid(task.quoteId)) {
        if (!token) throw new Error("Не вдалося визначити сесію користувача.");

        const response = await fetch("/.netlify/functions/quote-comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mode: "add",
            quoteId: task.quoteId,
            body,
            mentionedUserIds,
          }),
        });
        const payload = await parseJsonSafe<{ error?: string; comment?: QuoteMentionComment; mentionError?: string }>(response);
        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }

        const savedComment = payload?.comment;
        if (savedComment && body.includes("@")) {
          setQuoteMentionComments((prev) => [savedComment, ...prev].slice(0, 30));
        } else {
          void (async () => {
            if (task?.id) await loadHistory(task.id);
          })();
        }
        if (payload?.mentionError) {
          toast.error(payload.mentionError);
        }
      } else {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: null,
          userId,
          action: "comment",
          title: body.length > 80 ? `${body.slice(0, 77)}...` : body,
          href: `/design/${task.id}`,
          metadata: {
            source: "design_task_comment",
            comment_body: body,
            mentioned_user_ids: mentionedUserIds,
          },
        });
        if (mentionedUserIds.length > 0) {
          await notifyUsers({
            userIds: mentionedUserIds,
            title: `Згадка у дизайн-задачі ${getTaskDisplayNumber(task)}`,
            body: body.length > 160 ? `${body.slice(0, 157)}...` : body,
            href: `/design/${task.id}`,
            type: "info",
          });
        }
        await loadHistory(task.id);
      }
      setQuoteCommentDraft("");
      toast.success(
        mentionedUserIds.length > 0 ? "Коментар і згадки надіслано" : "Коментар збережено"
      );
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося зберегти коментар"));
    } finally {
      setQuoteCommentSaving(false);
    }
  };

  useEffect(() => {
    if (!timerSummary.activeStartedAt) return;
    const interval = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerSummary.activeStartedAt]);

  useEffect(() => {
    if (!headerDeadlinePopoverOpen && !deadlinePopoverOpen) return;
    setDeadlineDraftDate(toLocalDate(task?.designDeadline));
    const match = (task?.designDeadline ?? null)?.match(/t(\d{2}):(\d{2})/i);
    if (!match) {
      setDeadlineTime("12:00");
      return;
    }
    const parsed = `${match[1]}:${match[2]}`;
    setDeadlineTime(isValidDeadlineTime(parsed) ? parsed : "12:00");
  }, [headerDeadlinePopoverOpen, deadlinePopoverOpen, task?.designDeadline]);

  const deadlineLabel = useMemo(() => {
    if (!task?.designDeadline) return { label: "Без дедлайну", className: "text-muted-foreground" };
    const d = new Date(task.designDeadline);
    if (Number.isNaN(d.getTime())) return { label: "Без дедлайну", className: "text-muted-foreground" };
    const today = new Date();
    const startOfDeadline = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    const hasTime = /t\d{2}:\d{2}/i.test(task.designDeadline ?? "");
    const timeSuffix = hasTime
      ? ` ${d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`
      : "";
    if (diff < 0) return { label: `Прострочено ${Math.abs(diff)} дн.${timeSuffix}`, className: "text-danger-foreground" };
    if (diff === 0) return { label: `Сьогодні${timeSuffix}`, className: "text-warning-foreground" };
    if (diff === 1) return { label: `Завтра${timeSuffix}`, className: "text-warning-foreground" };
    return {
      label: `${d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}${timeSuffix}`,
      className: "text-muted-foreground",
    };
  }, [task?.designDeadline]);
  const estimateLabel = useMemo(() => {
    const minutes = getTaskEstimateMinutes(task);
    return formatEstimateMinutes(minutes);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.metadata]);
  const isTimerRunning = !!timerSummary.activeSessionId && !!timerSummary.activeStartedAt;
  const timerElapsedSeconds =
    timerSummary.totalSeconds +
    (timerSummary.activeStartedAt
      ? Math.max(0, Math.floor((timerNowMs - new Date(timerSummary.activeStartedAt).getTime()) / 1000))
      : 0);
  const timerElapsedLabel = formatElapsedSeconds(timerElapsedSeconds);
  const canStartTimer =
    !!task &&
    !!userId &&
    task.status === "in_progress" &&
    !isTimerRunning &&
    !!task.assigneeUserId &&
    (task.assigneeUserId === userId || canManageAssignments);
  const canPauseTimer =
    !!task &&
    isTimerRunning &&
    !!userId &&
    !!task.assigneeUserId &&
    (task.assigneeUserId === userId || canManageAssignments);
  const startTimerBlockedReason = !task
    ? "Задача не завантажена"
    : !userId
      ? "Потрібна авторизація"
      : task.status !== "in_progress"
        ? "Спочатку переведіть задачу у статус «В роботі»"
        : !task.assigneeUserId
          ? "Спочатку призначте виконавця"
          : task.assigneeUserId !== userId && !canManageAssignments
            ? "Запускати таймер може тільки виконавець задачі"
            : isTimerRunning
              ? "Таймер уже запущено"
              : null;
  const pauseTimerBlockedReason = !task
    ? "Задача не завантажена"
    : !userId
      ? "Потрібна авторизація"
      : !isTimerRunning
        ? "Таймер не запущено"
        : !task.assigneeUserId
          ? "Виконавець не вказаний"
          : task.assigneeUserId !== userId && !canManageAssignments
            ? "Ставити на паузу може тільки виконавець задачі"
            : null;

  const methods = useMemo(() => {
    const raw = quoteItem?.methods;
    if (!raw || !Array.isArray(raw)) return [];
    return raw as { method_id?: string; print_position_id?: string; print_width_mm?: number | null; print_height_mm?: number | null }[];
  }, [quoteItem?.methods]);

  useEffect(() => {
    const loadMethodAndPositionLabels = async () => {
      const methodIds = Array.from(
        new Set(
          methods
            .map((method) => method.method_id)
            .filter((value): value is string => !!value && isUuid(value))
        )
      );
      const positionIds = Array.from(
        new Set(
          methods
            .map((method) => method.print_position_id)
            .filter((value): value is string => !!value && isUuid(value))
        )
      );

      if (methodIds.length === 0 && positionIds.length === 0) {
        setMethodLabelById({});
        setPositionLabelById({});
        return;
      }

      try {
        if (methodIds.length > 0) {
          let methodsQuery;
          if (effectiveTeamId) {
            methodsQuery = await supabase
              .schema("tosho")
              .from("catalog_methods")
              .select("id,name")
              .eq("team_id", effectiveTeamId)
              .in("id", methodIds)
              .order("name", { ascending: true });
            if (
              methodsQuery.error &&
              /column/i.test(methodsQuery.error.message ?? "") &&
              /team_id/i.test(methodsQuery.error.message ?? "")
            ) {
              methodsQuery = await supabase
                .schema("tosho")
                .from("catalog_methods")
                .select("id,name")
                .in("id", methodIds)
                .order("name", { ascending: true });
            }
          } else {
            methodsQuery = await supabase
              .schema("tosho")
              .from("catalog_methods")
              .select("id,name")
              .in("id", methodIds)
              .order("name", { ascending: true });
          }

          if (!methodsQuery.error) {
            const labelMap: Record<string, string> = {};
            ((methodsQuery.data as Array<{ id: string; name: string | null }> | null) ?? []).forEach((row) => {
              if (row.id) labelMap[row.id] = row.name ?? row.id;
            });
            setMethodLabelById(labelMap);
          }
        } else {
          setMethodLabelById({});
        }

        if (positionIds.length > 0) {
          const { data: positionsData, error: positionsError } = await supabase
            .schema("tosho")
            .from("catalog_print_positions")
            .select("id,label")
            .in("id", positionIds)
            .order("label", { ascending: true });
          if (!positionsError) {
            const labelMap: Record<string, string> = {};
            ((positionsData as Array<{ id: string; label: string | null }> | null) ?? []).forEach((row) => {
              if (row.id) labelMap[row.id] = row.label ?? row.id;
            });
            setPositionLabelById(labelMap);
          }
        } else {
          setPositionLabelById({});
        }
      } catch {
        // Keep UI working even if dictionary lookup fails.
      }
    };

    void loadMethodAndPositionLabels();
  }, [effectiveTeamId, methods]);

  const allowedStatusTransitions = useMemo(
    () =>
      task
        ? allStatuses.filter((nextStatus) =>
            canChangeDesignStatus({
              currentStatus: task.status,
              nextStatus,
              canManageAssignments: canManageDesignStatuses,
              isAssignedToCurrentUser: isAssignedToMe,
            })
          )
        : [],
    [canManageDesignStatuses, isAssignedToMe, task]
  );
  const quickActions = useMemo(
    () => (task ? (statusQuickActions[task.status] ?? []).filter((action) => allowedStatusTransitions.includes(action.next)) : []),
    [allowedStatusTransitions, task]
  );
  function getTaskEstimateMinutes(sourceTask: DesignTask | null) {
    return getDesignTaskEstimateMinutes(sourceTask);
  }

  const designerWorkloadById = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof calculateDesignWorkload>
    >();
    designerMembers.forEach((member) => {
      const tasks = designQueueTasks.filter((queueTask) => queueTask.assigneeUserId === member.id);
      map.set(member.id, calculateDesignWorkload(tasks));
    });
    return map;
  }, [designQueueTasks, designerMembers]);

  const sortedDesignerMembers = useMemo(
    () =>
      [...designerMembers].sort((a, b) => {
        const aWorkload = designerWorkloadById.get(a.id);
        const bWorkload = designerWorkloadById.get(b.id);
        if (aWorkload && bWorkload && aWorkload.score !== bWorkload.score) {
          return aWorkload.score - bWorkload.score;
        }
        if (aWorkload && !bWorkload) return -1;
        if (!aWorkload && bWorkload) return 1;
        return a.label.localeCompare(b.label, "uk", { sensitivity: "base" });
      }),
    [designerMembers, designerWorkloadById]
  );

  const recommendedDesigner = useMemo(() => sortedDesignerMembers[0] ?? null, [sortedDesignerMembers]);

  const requestEstimateDialog = (
    pending: { mode: "assign"; nextAssigneeUserId: string | null } | { mode: "assign_self"; alsoStart: boolean } | { mode: "status"; nextStatus: DesignStatus }
  ) => {
    setEstimatePendingAction(pending);
    setEstimateInput("2");
    setEstimateUnit("hours");
    setEstimateError(null);
    setEstimateDialogOpen(true);
  };

  const quantityLabel = useMemo(
    () => formatQuantityWithUnit(quoteItem?.qty ?? null, quoteItem?.unit ?? null),
    [quoteItem?.qty, quoteItem?.unit]
  );

  const formatDate = (value: string | null | undefined, withTime = false) => {
    if (!value) return "Не вказано";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Не вказано";
    return withTime
      ? date.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  };
  const parseJsonSafe = async <T,>(response: Response): Promise<T | null> => {
    const raw = await response.text();
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const formatDeadlineLabel = (value: string | null | undefined) => {
    if (!value) return "Без дедлайну";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Без дедлайну";
    return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatDeadlineDateTime = (value: string | null | undefined) => {
    if (!value) return "Без дедлайну";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Без дедлайну";
    const hasTime = /t\d{2}:\d{2}/i.test(value);
    return hasTime
      ? date.toLocaleString("uk-UA", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  };

  const toLocalDate = (value: string | null | undefined) => {
    if (!value) return undefined;
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      return new Date(year, month, day);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const normalizeDeadlineTimeInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length === 0) return "";
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  };

  const isValidDeadlineTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

  const historyEvents = useMemo<DesignTaskHistoryEvent[]>(() => {
    return historyRows.map((row) => {
      const metadata = parseActivityMetadata(row.metadata);
      const source = typeof metadata.source === "string" ? metadata.source : "";
      const actorLabel =
        row.user_id && memberById[row.user_id] ? memberById[row.user_id] : row.actor_name?.trim() || "Користувач";

      if (source === "design_task_assignment") {
        const fromLabel = typeof metadata.from_assignee_label === "string" ? metadata.from_assignee_label : "Без виконавця";
        const toLabel = typeof metadata.to_assignee_label === "string" ? metadata.to_assignee_label : "";
        const title = toLabel ? `Виконавець: ${fromLabel} → ${toLabel}` : `Виконавця знято (${fromLabel})`;
        return {
          id: row.id,
          created_at: row.created_at,
          title,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: UserRound,
          accentClass:
            "bg-primary/10 text-primary border-primary/20",
        };
      }

      if (source === "design_task_manager") {
        const fromLabel = typeof metadata.from_manager_label === "string" ? metadata.from_manager_label : "Не вказано";
        const toLabel = typeof metadata.to_manager_label === "string" ? metadata.to_manager_label : "Не вказано";
        const roleLabel = typeof metadata.role_label === "string" && metadata.role_label.trim()
          ? metadata.role_label.trim()
          : "Менеджер";
        return {
          id: row.id,
          created_at: row.created_at,
          title: `${roleLabel}: ${fromLabel} → ${toLabel}`,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: UserRound,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_status") {
        const fromStatusRaw = typeof metadata.from_status === "string" ? metadata.from_status : "";
        const toStatusRaw = typeof metadata.to_status === "string" ? metadata.to_status : "";
        const fromLabel = statusLabels[fromStatusRaw as DesignStatus] ?? fromStatusRaw;
        const toLabel = statusLabels[toStatusRaw as DesignStatus] ?? toStatusRaw;
        return {
          id: row.id,
          created_at: row.created_at,
          title: fromLabel && toLabel ? `Статус: ${fromLabel} → ${toLabel}` : row.title?.trim() || "Оновлено статус задачі",
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: CalendarClock,
          accentClass: "quote-activity-accent-deadline",
        };
      }

      if (source === "design_task_deadline") {
        const fromDeadline = typeof metadata.from_deadline === "string" ? metadata.from_deadline : null;
        const toDeadline = typeof metadata.to_deadline === "string" ? metadata.to_deadline : null;
        return {
          id: row.id,
          created_at: row.created_at,
          title: `Дедлайн: ${formatDeadlineLabel(fromDeadline)} → ${formatDeadlineLabel(toDeadline)}`,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: CalendarClock,
          accentClass: "quote-activity-accent-deadline",
        };
      }

      if (source === "design_task_brief_version") {
        const versionRaw = typeof metadata.brief_version === "number" ? metadata.brief_version : Number(metadata.brief_version);
        return {
          id: row.id,
          created_at: row.created_at,
          title: Number.isFinite(versionRaw) ? `Оновлено ТЗ до v${Math.round(versionRaw)}` : "Оновлено ТЗ",
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: Check,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_brief_change_request") {
        return {
          id: row.id,
          created_at: row.created_at,
          title: "Додано правку до ТЗ",
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: Clock,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_comment") {
        const body =
          typeof metadata.comment_body === "string" && metadata.comment_body.trim()
            ? metadata.comment_body.trim()
            : row.title?.trim() || "";
        return {
          id: row.id,
          created_at: row.created_at,
          title: "Коментар",
          actorLabel,
          actorUserId: row.user_id ?? null,
          description: body || undefined,
          icon: Check,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_estimate") {
        const raw = metadata.estimate_minutes;
        const estimateMinutes =
          typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        return {
          id: row.id,
          created_at: row.created_at,
          title: `Естімейт: ${formatEstimateMinutes(Number.isFinite(estimateMinutes) ? estimateMinutes : null)}`,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: Clock,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_timer") {
        const timerAction = typeof metadata.timer_action === "string" ? metadata.timer_action : "";
        const title =
          timerAction === "start"
            ? "Запущено таймер"
            : timerAction === "pause"
              ? "Таймер на паузі"
              : timerAction.startsWith("auto_pause")
                ? "Таймер зупинено автоматично"
                : row.title?.trim() || "Оновлено таймер";
        return {
          id: row.id,
          created_at: row.created_at,
          title,
          actorLabel,
          actorUserId: row.user_id ?? null,
          icon: Timer,
          accentClass: "quote-activity-accent-comment",
        };
      }

      if (source === "design_task_created" || row.action === "design_task") {
        return {
          id: row.id,
          created_at: row.created_at,
          title: "Створено дизайн-задачу",
          actorLabel,
          actorUserId: row.user_id ?? null,
          description: row.title?.trim() || undefined,
          icon: Palette,
          accentClass: "quote-activity-accent-runs",
        };
      }

      return {
        id: row.id,
        created_at: row.created_at,
        title: row.title?.trim() || "Оновлено задачу",
        actorLabel,
        actorUserId: row.user_id ?? null,
        icon: Clock,
        accentClass: "bg-muted/30 text-muted-foreground border-border",
      };
    });
  }, [historyRows, memberById]);

  const historyGroups = useMemo(() => {
    const groups: { label: string; items: DesignTaskHistoryEvent[] }[] = [];
    for (const event of historyEvents) {
      const label = formatActivityDayLabel(event.created_at);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [event] });
      } else {
        lastGroup.items.push(event);
      }
    }
    return groups;
  }, [historyEvents]);

  const standaloneComments = useMemo<DesignTaskComment[]>(
    () =>
      historyRows
        .map((row) => {
          const metadata = parseActivityMetadata(row.metadata);
          const source = typeof metadata.source === "string" ? metadata.source : "";
          if (source !== "design_task_comment") return null;
          const body =
            typeof metadata.comment_body === "string" && metadata.comment_body.trim()
              ? metadata.comment_body
              : row.title?.trim() || "";
          return {
            id: row.id,
            body,
            created_at: row.created_at,
            created_by: row.user_id ?? "",
          } satisfies DesignTaskComment;
        })
        .filter(Boolean) as DesignTaskComment[],
    [historyRows]
  );

  const getStorageFileKey = useCallback((
    file: Pick<StorageBackedFile, "storage_bucket" | "storage_path">,
    variant: AttachmentPreviewVariant = "original"
  ) => {
    if (!file.storage_bucket || !file.storage_path) return null;
    return `${file.storage_bucket}:${getAttachmentVariantPath(file.storage_path, variant)}`;
  }, []);

  const ensureFileAccessUrl = useCallback(async (
    file: StorageBackedFile,
    options?: { forceRefresh?: boolean; variant?: AttachmentPreviewVariant }
  ) => {
    const variant = options?.variant ?? "original";
    const key = getStorageFileKey(file, variant);
    if (!key || !file.storage_bucket || !file.storage_path) return null;
    const existingUrl = fileAccessUrlByKey[key];
    if (!options?.forceRefresh && existingUrl) return existingUrl;

    const signedUrl =
      variant !== "original" && isServerPreviewableStoragePath(file.storage_path)
        ? await waitForSignedAttachmentUrl(file.storage_bucket, file.storage_path, variant, {
            attempts: 8,
            delayMs: 1500,
            ttlSeconds: 60 * 60 * 24 * 7,
            queueServerPreview: true,
          })
        : await getSignedAttachmentUrl(file.storage_bucket, file.storage_path, variant, 60 * 60 * 24 * 7);
    if (isUsableStorageUrl(signedUrl)) {
      if (typeof signedUrl !== "string") return null;
      const resolvedUrl = signedUrl;
      if (existingUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(existingUrl);
        objectUrlRegistryRef.current.delete(existingUrl);
      }
      setFileAccessUrlByKey((prev) => ({ ...prev, [key]: resolvedUrl }));
      return resolvedUrl;
    }

    if (variant !== "original") return null;

    const { data: blobData, error: downloadError } = await supabase.storage
      .from(file.storage_bucket)
      .download(file.storage_path);
    if (downloadError || !blobData) return null;

    const objectUrl = URL.createObjectURL(blobData);
    if (existingUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(existingUrl);
      objectUrlRegistryRef.current.delete(existingUrl);
    }
    objectUrlRegistryRef.current.add(objectUrl);
    setFileAccessUrlByKey((prev) => ({ ...prev, [key]: objectUrl }));
    return objectUrl;
  }, [fileAccessUrlByKey, getStorageFileKey]);

  const downloadFileToDevice = useCallback(async (url: string, filename?: string | null) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = (filename && filename.trim()) || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error("Не вдалося завантажити файл", {
        description: getErrorMessage(error, "Спробуйте ще раз."),
      });
    }
  }, []);

  const getPreviewOpenVariant = useCallback((fileName?: string | null): AttachmentPreviewVariant => {
    const extension = getFileExtension(fileName);
    const previewable =
      canPreviewImage(extension) || canPreviewTiff(extension) || canPreviewPdf(extension);
    return previewable ? "preview" : "original";
  }, []);

  const openStorageFileInNewTab = useCallback(async (file: StorageBackedFile) => {
    const url = await ensureFileAccessUrl(file, { variant: getPreviewOpenVariant(file.file_name) });
    if (!url) {
      toast.error("Не вдалося відкрити файл");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [ensureFileAccessUrl, getPreviewOpenVariant]);

  const downloadStorageBackedFile = useCallback(async (file: StorageBackedFile) => {
    const url = await ensureFileAccessUrl(file);
    if (!url) {
      toast.error("Не вдалося завантажити файл");
      return;
    }
    await downloadFileToDevice(url, file.file_name);
  }, [downloadFileToDevice, ensureFileAccessUrl]);

  const openStorageFilePreview = useCallback(async (file: StorageBackedFile & { file_name?: string | null }) => {
    const extension = getFileExtension(file.file_name);
    const kind =
      canPreviewImage(extension) || canPreviewTiff(extension)
        ? "image"
        : canPreviewPdf(extension)
          ? "pdf"
          : null;
    if (!kind) {
      await openStorageFileInNewTab(file);
      return;
    }
    const url = await ensureFileAccessUrl(file, { variant: "preview" });
    if (!url) {
      toast.error("Не вдалося відкрити превʼю файлу");
      return;
    }
    setFilePreview({
      name: file.file_name ?? "Файл",
      url,
      kind,
      storageBucket: file.storage_bucket ?? null,
      storagePath: file.storage_path ?? null,
    });
  }, [ensureFileAccessUrl, openStorageFileInNewTab]);

  useEffect(() => {
    const objectUrls = objectUrlRegistryRef.current;
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (!filePreview || typeof document === "undefined") return;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, [filePreview]);

  const persistDesignOutputs = async (
    nextFiles: DesignOutputFile[],
    nextLinks: DesignOutputLink[],
    options?: {
      nextGroups?: string[];
      metadataPatch?: Record<string, unknown>;
    }
  ) => {
    if (!task || !effectiveTeamId) return;
    if (!ensureCanEdit()) return;
    const filesForMeta = nextFiles.map((file) => ({
      id: file.id,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: file.uploaded_by,
      created_at: file.created_at,
      group_label: normalizeOutputGroupLabel(file.group_label),
      output_kind: file.output_kind ?? null,
    }));
    const linksForMeta = nextLinks.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      created_at: link.created_at,
      created_by: link.created_by,
      group_label: normalizeOutputGroupLabel(link.group_label),
      output_kind: link.output_kind ?? null,
    }));
    const nextGroups = Array.from(
      new Set(
        (options?.nextGroups ?? designOutputGroups)
          .map((entry) => normalizeOutputGroupLabel(entry))
          .filter((entry): entry is string => !!entry)
      )
    );

    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      design_output_files: filesForMeta,
      design_output_links: linksForMeta,
      design_output_groups: nextGroups,
      ...(options?.metadataPatch ?? {}),
    };

    setOutputSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;
      setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      setDesignOutputGroups(nextGroups);
    } finally {
      setOutputSaving(false);
    }
  };

  const syncDesignFileToQuoteVisualizations = async (file: DesignOutputFile) => {
    if (!task || !effectiveTeamId || !isUuid(task.quoteId)) return;
    if (!ensureCanEdit()) return;

    const { data: existing, error: existingError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("id")
      .eq("quote_id", task.quoteId)
      .eq("storage_bucket", file.storage_bucket)
      .eq("storage_path", file.storage_path)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) return;

    const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
      team_id: effectiveTeamId,
      quote_id: task.quoteId,
      file_name: file.file_name,
      mime_type: file.mime_type || null,
      file_size: file.file_size,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: userId ?? null,
    });
    if (insertError) throw insertError;
  };

  const buildOutputSelectionMetadata = (
    metadata: Record<string, unknown>,
    nextSelectedByKind: Record<DesignOutputKind, string[]>,
    actorLabel: string
  ) => {
    const nextMetadata = { ...metadata };
    const unionSelectedIds = Array.from(
      new Set(
        (["visualization", "layout"] as DesignOutputKind[]).flatMap((kind) =>
          nextSelectedByKind[kind].map((entry) => entry.trim()).filter(Boolean)
        )
      )
    );

    (["visualization", "layout"] as DesignOutputKind[]).forEach((kind) => {
      const normalizedSelectedIds = Array.from(
        new Set(nextSelectedByKind[kind].map((entry) => entry.trim()).filter(Boolean))
      );
      const primarySelected =
        designOutputFiles.find((file) => file.id === normalizedSelectedIds[0] && file.output_kind === kind) ?? null;
      const prefix = kind === "visualization" ? "selected_visual_output" : "selected_layout_output";
      nextMetadata[`${prefix}_file_ids`] = normalizedSelectedIds;
      nextMetadata[`${prefix}_file_id`] = primarySelected?.id ?? null;
      nextMetadata[`${prefix}_file_name`] = primarySelected?.file_name ?? null;
      nextMetadata[`${prefix}_storage_bucket`] = primarySelected?.storage_bucket ?? null;
      nextMetadata[`${prefix}_storage_path`] = primarySelected?.storage_path ?? null;
      nextMetadata[`${prefix}_mime_type`] = primarySelected?.mime_type ?? null;
      nextMetadata[`${prefix}_file_size`] = primarySelected?.file_size ?? null;
      nextMetadata[`${prefix}_selected_at`] = normalizedSelectedIds.length > 0 ? new Date().toISOString() : null;
      nextMetadata[`${prefix}_selected_by`] = normalizedSelectedIds.length > 0 ? (userId ?? null) : null;
      nextMetadata[`${prefix}_selected_by_label`] = normalizedSelectedIds.length > 0 ? actorLabel : null;
    });

    const primarySelected = designOutputFiles.find((file) => file.id === unionSelectedIds[0]) ?? null;
    nextMetadata.selected_design_output_file_ids = unionSelectedIds;
    nextMetadata.selected_design_output_file_id = primarySelected?.id ?? null;
    nextMetadata.selected_design_output_file_name = primarySelected?.file_name ?? null;
    nextMetadata.selected_design_output_storage_bucket = primarySelected?.storage_bucket ?? null;
    nextMetadata.selected_design_output_storage_path = primarySelected?.storage_path ?? null;
    nextMetadata.selected_design_output_mime_type = primarySelected?.mime_type ?? null;
    nextMetadata.selected_design_output_file_size = primarySelected?.file_size ?? null;
    nextMetadata.selected_design_output_selected_at = unionSelectedIds.length > 0 ? new Date().toISOString() : null;
    nextMetadata.selected_design_output_selected_by = unionSelectedIds.length > 0 ? (userId ?? null) : null;
    nextMetadata.selected_design_output_selected_by_label = unionSelectedIds.length > 0 ? actorLabel : null;
    return nextMetadata;
  };

  const handleUploadDesignOutputs = async (files: FileList | null) => {
    if (!files || files.length === 0 || !task || !effectiveTeamId || !userId || outputUploading) return;
    if (!ensureCanEdit()) return;
    const targetGroupLabel = normalizeOutputGroupLabel(uploadTargetGroup);
    setOutputUploading(true);
    try {
      const uploaded: DesignOutputFile[] = [];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const baseName = `${Date.now()}-${safeName}`;
        const candidatePaths = [`teams/${effectiveTeamId}/design-outputs/${task.quoteId}/${baseName}`];

        let storagePath = "";
        let lastError: unknown = null;
        for (const candidate of candidatePaths) {
          try {
            await uploadAttachmentWithVariants({
              bucket: DESIGN_OUTPUT_BUCKET,
              storagePath: candidate,
              file,
              cacheControl: STORAGE_CACHE_CONTROL,
            });
            storagePath = candidate;
            break;
          } catch (uploadError) {
            lastError = uploadError;
          }
        }
        if (!storagePath) throw lastError ?? new Error(`Не вдалося завантажити файл ${file.name}`);

        uploaded.push({
          id: crypto.randomUUID(),
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          storage_bucket: DESIGN_OUTPUT_BUCKET,
          storage_path: storagePath,
          uploaded_by: userId,
          created_at: new Date().toISOString(),
          group_label: targetGroupLabel,
          output_kind: uploadTargetKind,
          signed_url: null,
        });
      }

      const nextFiles = [...uploaded, ...designOutputFiles];
      const nextGroups =
        targetGroupLabel && !designOutputGroups.includes(targetGroupLabel)
          ? [...designOutputGroups, targetGroupLabel]
          : designOutputGroups;
      await persistDesignOutputs(nextFiles, designOutputLinks, { nextGroups });
      setDesignOutputFiles(nextFiles);
      try {
        if (uploaded.length > 0) {
          await Promise.all(uploaded.map((file) => syncDesignFileToQuoteVisualizations(file)));
        }
      } catch (syncError: unknown) {
        console.warn("Failed to sync design file to quote visualizations", syncError);
      }
      try {
        const actorLabel = userId ? getMemberLabel(userId) : "System";
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_output_upload",
          title: `Додано файлів до ${uploadTargetKind === "visualization" ? "візуалів" : "макетів"}: ${uploaded.length}`,
          metadata: {
            source: "design_output_upload",
            output_kind: uploadTargetKind,
            uploaded_files: uploaded.map((file) => ({
              id: file.id,
              file_name: file.file_name,
              storage_bucket: file.storage_bucket,
              storage_path: file.storage_path,
            })),
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design output upload", logError);
      }
      toast.success(`Додано файлів: ${uploaded.length}`);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося завантажити файли");
      toast.error(message);
      setError(message);
    } finally {
      setOutputUploading(false);
      if (outputInputRef.current) outputInputRef.current.value = "";
    }
  };

  const handleUploadTaskAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0 || !task || !effectiveTeamId || !userId || attachmentUploading) return;
    if (!ensureCanEdit()) return;

    setAttachmentUploading(true);
    try {
      const uploadedAttachments: AttachmentRow[] = [];

      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const baseName = `${Date.now()}-${safeName}`;
        const storagePath = isUuid(task.quoteId)
          ? `teams/${effectiveTeamId}/quote-attachments/${task.quoteId}/${baseName}`
          : `teams/${effectiveTeamId}/design-brief-files/${task.id}/${baseName}`;

        await uploadAttachmentWithVariants({
          bucket: DESIGN_OUTPUT_BUCKET,
          storagePath,
          file,
          cacheControl: STORAGE_CACHE_CONTROL,
        });

        const nextAttachment: AttachmentRow = {
          id: crypto.randomUUID(),
          file_name: file.name,
          file_size: file.size,
          created_at: new Date().toISOString(),
          storage_bucket: DESIGN_OUTPUT_BUCKET,
          storage_path: storagePath,
          uploaded_by: userId,
          signed_url: null,
        };

        if (isUuid(task.quoteId)) {
          const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
            team_id: effectiveTeamId,
            quote_id: task.quoteId,
            file_name: nextAttachment.file_name,
            mime_type: file.type || null,
            file_size: nextAttachment.file_size,
            storage_bucket: nextAttachment.storage_bucket,
            storage_path: nextAttachment.storage_path,
            uploaded_by: userId,
          });
          if (insertError) throw insertError;
        }

        uploadedAttachments.push(nextAttachment);
      }

      if (!isUuid(task.quoteId)) {
        const standaloneBriefFiles = uploadedAttachments.map((file) => ({
          id: file.id,
          file_name: file.file_name,
          file_size: file.file_size,
          created_at: file.created_at,
          storage_bucket: file.storage_bucket,
          storage_path: file.storage_path,
          uploaded_by: file.uploaded_by,
        }));
        const nextMetadata: Record<string, unknown> = {
          ...(task.metadata ?? {}),
          standalone_brief_files: [
            ...standaloneBriefFiles,
            ...((Array.isArray(task.metadata?.standalone_brief_files) ? task.metadata?.standalone_brief_files : []) as unknown[]),
          ],
        };

        const { error: updateError } = await supabase
          .from("activity_log")
          .update({ metadata: nextMetadata })
          .eq("id", task.id)
          .eq("team_id", effectiveTeamId);
        if (updateError) throw updateError;

        setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      }

      setAttachments((prev) => [...uploadedAttachments, ...prev]);
      if (isUuid(task.quoteId)) {
        setCustomerAttachmentsLoaded(true);
      }

      try {
        const actorLabel = userId ? getMemberLabel(userId) : "System";
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_attachment",
          title: `Додано файлів до задачі: ${uploadedAttachments.length}`,
          metadata: {
            source: "design_task_attachment",
            uploaded_files: uploadedAttachments.map((file) => ({
              id: file.id,
              file_name: file.file_name,
              storage_bucket: file.storage_bucket,
              storage_path: file.storage_path,
            })),
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log task attachment upload", logError);
      }

      toast.success(`Додано файлів: ${uploadedAttachments.length}`);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося додати файли");
      setError(message);
      toast.error(message);
    } finally {
      setAttachmentUploading(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  const handleRemoveTaskAttachment = async (attachmentId: string) => {
    if (!task || !effectiveTeamId || attachmentDeletingId) return;
    if (!ensureCanEdit()) return;

    const target = attachments.find((file) => file.id === attachmentId);
    if (!target) return;
    if (!canDeleteTaskBriefAttachment(target)) {
      toast.error("Недостатньо прав", {
        description: "Видаляти ці файли може лише менеджер задачі, який їх завантажив.",
      });
      return;
    }

    setAttachmentDeletingId(attachmentId);
    try {
      if (target.storage_bucket && target.storage_path) {
        await removeAttachmentWithVariants(target.storage_bucket, target.storage_path);
      }

      if (isUuid(task.quoteId)) {
        const { error: deleteError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .delete()
          .eq("quote_id", task.quoteId)
          .eq("storage_bucket", target.storage_bucket)
          .eq("storage_path", target.storage_path);
        if (deleteError) throw deleteError;
      } else {
        const currentFiles = Array.isArray(task.metadata?.standalone_brief_files)
          ? (task.metadata.standalone_brief_files as Array<Record<string, unknown>>)
          : [];
        const nextFiles = currentFiles.filter(
          (file) =>
            !(
              typeof file.storage_bucket === "string" &&
              typeof file.storage_path === "string" &&
              file.storage_bucket === target.storage_bucket &&
              file.storage_path === target.storage_path
            )
        );
        const nextMetadata: Record<string, unknown> = {
          ...(task.metadata ?? {}),
          standalone_brief_files: nextFiles,
        };
        const { error: updateError } = await supabase
          .from("activity_log")
          .update({ metadata: nextMetadata })
          .eq("id", task.id)
          .eq("team_id", effectiveTeamId);
        if (updateError) throw updateError;
        setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      }

      setAttachments((prev) => prev.filter((file) => file.id !== attachmentId));
      toast.success("Файл видалено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося видалити файл"));
    } finally {
      setAttachmentDeletingId(null);
    }
  };

  const openAddDesignLinkModal = (kind: DesignOutputKind) => {
    setAddLinkUrl("https://");
    setAddLinkLabel("");
    setAddLinkGroupValue(uploadTargetGroup);
    setAddLinkGroupDraft("");
    setAddLinkKind(kind);
    setAddLinkError(null);
    setAddLinkOpen(true);
  };

  const handleSubmitDesignLink = async () => {
    if (!task) return;
    if (!ensureCanEdit()) return;
    const trimmedUrl = addLinkUrl.trim();
    if (!trimmedUrl) {
      setAddLinkError("Вставте URL посилання.");
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setAddLinkError("Дозволені тільки http/https посилання.");
        return;
      }
      if (addLinkGroupValue === "__new__" && !normalizeOutputGroupLabel(addLinkGroupDraft)) {
        setAddLinkError("Вкажіть назву нової групи.");
        return;
      }
      const nextGroupLabel = normalizeOutputGroupLabel(
        addLinkGroupValue === "__new__" ? addLinkGroupDraft : addLinkGroupValue
      );
      const nextGroups =
        nextGroupLabel && !designOutputGroups.includes(nextGroupLabel)
          ? [...designOutputGroups, nextGroupLabel]
          : designOutputGroups;
      const nextLink: DesignOutputLink = {
        id: crypto.randomUUID(),
        label: addLinkLabel.trim() || parsed.hostname,
        url: parsed.toString(),
        created_at: new Date().toISOString(),
        created_by: userId ?? null,
        group_label: nextGroupLabel,
        output_kind: addLinkKind,
      };
      const nextLinks = [nextLink, ...designOutputLinks];
      await persistDesignOutputs(designOutputFiles, nextLinks, { nextGroups });
      setDesignOutputLinks(nextLinks);
      setAddLinkOpen(false);
      setAddLinkError(null);
      toast.success("Посилання додано");
    } catch {
      setAddLinkError("Некоректний URL.");
    }
  };

  const handleRemoveDesignFile = async (fileId: string) => {
    if (!ensureCanEdit()) return;
    const target = designOutputFiles.find((file) => file.id === fileId);
    if (!target) return;
    const taskQuoteId = task?.quoteId ?? null;
    try {
      const nextFiles = designOutputFiles.filter((file) => {
        if (file.id === fileId) return false;
        if (
          target.storage_bucket &&
          target.storage_path &&
          file.storage_bucket === target.storage_bucket &&
          file.storage_path === target.storage_path
        ) {
          return false;
        }
        return true;
      });
      const { data: latestRow, error: latestRowError } = await supabase
        .from("activity_log")
        .select("metadata")
        .eq("id", task?.id)
        .eq("team_id", effectiveTeamId)
        .maybeSingle();
      if (latestRowError) throw latestRowError;

      const latestMetadata = ((latestRow?.metadata as Record<string, unknown> | null) ?? task?.metadata ?? {}) as Record<string, unknown>;
      const latestRawFiles = Array.isArray(latestMetadata.design_output_files)
        ? (latestMetadata.design_output_files as Array<Record<string, unknown>>)
        : [];
      const nextFilesForMeta = latestRawFiles.filter((file) => {
        const rowId = typeof file.id === "string" ? file.id : null;
        const storageBucket = typeof file.storage_bucket === "string" ? file.storage_bucket : null;
        const storagePath = typeof file.storage_path === "string" ? file.storage_path : null;
        if (rowId === fileId) return false;
        if (
          target.storage_bucket &&
          target.storage_path &&
          storageBucket === target.storage_bucket &&
          storagePath === target.storage_path
        ) {
          return false;
        }
        return true;
      });
      const actorLabel = userId ? getMemberLabel(userId) : "System";
      const nextSelectedByKind: Record<DesignOutputKind, string[]> = {
        visualization: selectedVisualizationOutputFileIds.filter((id) => id !== fileId),
        layout: selectedLayoutOutputFileIds.filter((id) => id !== fileId),
      };
      const nextMetadataPatch = buildOutputSelectionMetadata(latestMetadata, nextSelectedByKind, actorLabel);
      const nextMetadata: Record<string, unknown> = {
        ...latestMetadata,
        design_output_files: nextFilesForMeta,
        design_output_links: designOutputLinks.map((link) => ({
          id: link.id,
          label: link.label,
          url: link.url,
          created_at: link.created_at,
          created_by: link.created_by,
          group_label: normalizeOutputGroupLabel(link.group_label),
          output_kind: link.output_kind ?? null,
        })),
        design_output_groups: Array.from(
          new Set(
            designOutputGroups
              .map((entry) => normalizeOutputGroupLabel(entry))
              .filter((entry): entry is string => !!entry)
          )
        ),
        ...nextMetadataPatch,
      };
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task?.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;
      setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      setDesignOutputFiles(nextFiles);
      setFileAccessUrlByKey((prev) => {
        if (!target.storage_bucket || !target.storage_path) return prev;
        const key = `${target.storage_bucket}:${target.storage_path}`;
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (taskQuoteId && isUuid(taskQuoteId) && target.storage_bucket && target.storage_path) {
        const { error: quoteAttachmentDeleteError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .delete()
          .eq("quote_id", taskQuoteId)
          .eq("storage_bucket", target.storage_bucket)
          .eq("storage_path", target.storage_path);
        if (quoteAttachmentDeleteError) throw quoteAttachmentDeleteError;
      }
      if (target.storage_bucket && target.storage_path) {
        await removeAttachmentWithVariants(target.storage_bucket, target.storage_path);
      }
      toast.success("Файл видалено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося видалити файл"));
    }
  };

  const handleRemoveDesignLink = async (linkId: string) => {
    if (!ensureCanEdit()) return;
    try {
      const nextLinks = designOutputLinks.filter((link) => link.id !== linkId);
      await persistDesignOutputs(designOutputFiles, nextLinks);
      setDesignOutputLinks(nextLinks);
      toast.success("Посилання видалено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося видалити посилання"));
    }
  };

  const handleCreateDesignOutputGroup = async () => {
    try {
      const nextGroup = normalizeOutputGroupLabel(createGroupDraft);
      if (!nextGroup) {
        setCreateGroupError("Вкажіть назву групи.");
        return;
      }
      if (designOutputGroups.includes(nextGroup)) {
        setCreateGroupError("Така група вже існує.");
        return;
      }
      await persistDesignOutputs(designOutputFiles, designOutputLinks, { nextGroups: [...designOutputGroups, nextGroup] });
      setUploadTargetGroup(nextGroup);
      setCreateGroupDraft("");
      setCreateGroupError(null);
      setCreateGroupOpen(false);
      toast.success("Групу створено");
    } catch (e: unknown) {
      setCreateGroupError(getErrorMessage(e, "Не вдалося створити групу"));
    }
  };

  const toggleGroupingSelection = (entityKey: string) => {
    setGroupingSelectionIds((prev) =>
      prev.includes(entityKey) ? prev.filter((id) => id !== entityKey) : [...prev, entityKey]
    );
  };

  const handleMoveSelectedOutputsToGroup = async () => {
    if (!ensureCanEdit()) return;
    if (groupingSelectionIds.length === 0) {
      toast.error("Спочатку відмітьте файли або посилання для переміщення.");
      return;
    }
    try {
      const nextGroupLabel = normalizeOutputGroupLabel(uploadTargetGroup);
      await moveSelectedOutputsToGroup(nextGroupLabel);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося перемістити матеріали у групу"));
    }
  };

  const moveSelectedOutputsToGroup = async (groupLabel: string | null) => {
    const nextGroupLabel = normalizeOutputGroupLabel(groupLabel);
    if (groupingSelectionIds.length === 0) {
      throw new Error("Немає вибраних матеріалів.");
    }
    const fileSelectionIds = new Set(
      groupingSelectionIds
        .filter((entry) => entry.startsWith("file:"))
        .map((entry) => entry.slice("file:".length))
    );
    const linkSelectionIds = new Set(
      groupingSelectionIds
        .filter((entry) => entry.startsWith("link:"))
        .map((entry) => entry.slice("link:".length))
    );

    const nextFiles = designOutputFiles.map((file) =>
      fileSelectionIds.has(file.id) ? { ...file, group_label: nextGroupLabel } : file
    );
    const nextLinks = designOutputLinks.map((link) =>
      linkSelectionIds.has(link.id) ? { ...link, group_label: nextGroupLabel } : link
    );
    const nextGroups =
      nextGroupLabel && !designOutputGroups.includes(nextGroupLabel)
        ? [...designOutputGroups, nextGroupLabel]
        : designOutputGroups;

    await persistDesignOutputs(nextFiles, nextLinks, { nextGroups });
    setDesignOutputFiles(nextFiles);
    setDesignOutputLinks(nextLinks);
    setGroupingSelectionIds([]);
  };

  const handleMoveSelectedOutputsToSpecificGroup = async (groupLabel: string | null) => {
    if (!ensureCanEdit()) return;
    if (groupingSelectionIds.length === 0) {
      toast.error("Спочатку відмітьте файли або посилання для переміщення.");
      return;
    }
    try {
      await moveSelectedOutputsToGroup(groupLabel);
      toast.success("Матеріали переміщено у групу");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося перемістити матеріали у групу"));
    }
  };

  const handleUngroupSelectedOutputsFromGroup = async (groupKey: string) => {
    if (!ensureCanEdit()) return;
    const selectedKeysInGroup = new Set(
      selectedGroupingItems.filter((item) => item.groupKey === groupKey).map((item) => item.key)
    );
    if (selectedKeysInGroup.size === 0) {
      toast.error("У цій групі немає вибраних матеріалів.");
      return;
    }
    try {
      const nextFiles = designOutputFiles.map((file) =>
        selectedKeysInGroup.has(`file:${file.id}`) ? { ...file, group_label: null } : file
      );
      const nextLinks = designOutputLinks.map((link) =>
        selectedKeysInGroup.has(`link:${link.id}`) ? { ...link, group_label: null } : link
      );
      await persistDesignOutputs(nextFiles, nextLinks);
      setDesignOutputFiles(nextFiles);
      setDesignOutputLinks(nextLinks);
      setGroupingSelectionIds((prev) => prev.filter((key) => !selectedKeysInGroup.has(key)));
      toast.success("Матеріали прибрано з групи");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося прибрати матеріали з групи"));
    }
  };

  const handleSelectDesignOutputFile = async (fileId: string, kind: DesignOutputKind) => {
    if (!task || !effectiveTeamId) return;
    if (!canManageAssignments) {
      toast.error("Тільки менеджер може зафіксувати обраний варіант замовника.");
      return;
    }
    if (!ensureCanEdit()) return;
    if (outputSaving) return;

    const selectedIdsForKind =
      kind === "visualization" ? selectedVisualizationOutputFileIds : selectedLayoutOutputFileIds;
    const selectedIdSetForKind =
      kind === "visualization" ? selectedVisualizationOutputFileIdSet : selectedLayoutOutputFileIdSet;
    const alreadySelected = selectedIdSetForKind.has(fileId);
    const nextSelectedIds = alreadySelected
      ? selectedIdsForKind.filter((id) => id !== fileId)
      : [...selectedIdsForKind, fileId];
    const nextSelectedByKind: Record<DesignOutputKind, string[]> = {
      visualization:
        kind === "visualization" ? nextSelectedIds : [...selectedVisualizationOutputFileIds],
      layout: kind === "layout" ? nextSelectedIds : [...selectedLayoutOutputFileIds],
    };
    const selectedFiles = designOutputFiles.filter((file) => nextSelectedByKind[kind].includes(file.id));
    const actorLabel = userId ? getMemberLabel(userId) : "System";

    setOutputSaving(true);
    try {
      const nextMetadata = buildOutputSelectionMetadata(task.metadata ?? {}, nextSelectedByKind, actorLabel);
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      if (selectedFiles.length > 0) {
        try {
          await Promise.all(selectedFiles.map((file) => syncDesignFileToQuoteVisualizations(file)));
        } catch (syncError) {
          console.warn("Failed to sync selected design file to quote visualizations", syncError);
        }
      }
      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: task.id,
        quoteId: task.quoteId,
        userId,
        actorName: actorLabel,
        action: "design_output_selection",
        title:
          nextSelectedIds.length > 0
            ? `Замовник погодив ${kind === "visualization" ? "візуали" : "макети"}: ${selectedFiles.map((file) => file.file_name).slice(0, 3).join(", ")}${selectedFiles.length > 3 ? ` +${selectedFiles.length - 3}` : ""}`
            : `Скасовано погоджені ${kind === "visualization" ? "візуали" : "макети"} замовника`,
        metadata: {
          source: "design_output_selection",
          output_kind: kind,
          selected_design_output_file_ids: nextSelectedIds,
        },
      });
      await loadHistory(task.id);
      toast.success(
        nextSelectedIds.length > 0
          ? `Погоджені ${kind === "visualization" ? "візуали" : "макети"} оновлено`
          : `Погоджені ${kind === "visualization" ? "візуали" : "макети"} очищено`
      );
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося зберегти вибір варіанту"));
    } finally {
      setOutputSaving(false);
    }
  };

  const loadQuoteCandidates = async () => {
    if (!effectiveTeamId || !task) {
      setQuoteCandidates([]);
      return;
    }
    setQuoteCandidatesLoading(true);
    try {
      const metadata = task.metadata ?? {};
      const customerId =
        typeof metadata.customer_id === "string" && metadata.customer_id.trim()
          ? metadata.customer_id.trim()
          : null;
      const customerName = normalizePartyMatch(task.customerName ?? null);

      const quotesQuery = supabase
        .schema("tosho")
        .from("quotes")
        .select("id,number,status,customer_id,customer_name,customer_logo_url,created_at,title")
        .eq("team_id", effectiveTeamId)
        .order("created_at", { ascending: false });

      const { data, error } = customerId
        ? await quotesQuery.eq("customer_id", customerId)
        : await quotesQuery;
      if (error) throw error;

      const rowsSource = ((data ?? []) as Array<{
        id: string;
        number?: string | null;
        status?: string | null;
        customer_id?: string | null;
        customer_name?: string | null;
        customer_logo_url?: string | null;
        created_at?: string | null;
        title?: string | null;
      }>);

      const nextCandidates = (rowsSource
        .filter((row) => row.id !== task.quoteId)
        .filter((row) => {
          if (customerId && row.customer_id) return row.customer_id === customerId;
          return normalizePartyMatch(row.customer_name ?? row.title ?? null) === customerName;
        })
        .map((row) => ({
          id: row.id,
          number: row.number ?? null,
          status: row.status ?? null,
          customerName: row.customer_name ?? row.title ?? null,
          customerLogoUrl: normalizeLogoUrl(row.customer_logo_url ?? null),
          createdAt: row.created_at ?? null,
        }))) as QuoteCandidate[];

      setQuoteCandidates(nextCandidates);
    } catch (e) {
      console.warn("Failed to load quote candidates", e);
      setQuoteCandidates([]);
    } finally {
      setQuoteCandidatesLoading(false);
    }
  };

  const attachTaskToQuote = async (quoteCandidate: QuoteCandidate) => {
    if (!task || !effectiveTeamId || attachingQuoteId) return;
    if (!ensureCanEdit()) return;
    setAttachingQuoteId(quoteCandidate.id);
    try {
      const actorLabel = userId ? getMemberLabel(userId) : "System";
      const selectedFiles = designOutputFiles.filter((file) => selectedApprovedDesignOutputFileIdSet.has(file.id));
      const nextMetadata: Record<string, unknown> = {
        ...(task.metadata ?? {}),
        quote_id: quoteCandidate.id,
        quote_number: quoteCandidate.number,
        task_kind: "linked",
        attached_quote_at: new Date().toISOString(),
        attached_quote_by: userId ?? null,
      };

      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata, entity_id: quoteCandidate.id })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      if (selectedFiles.length > 0) {
        for (const selectedFile of selectedFiles) {
          const { data: existing, error: existingError } = await supabase
            .schema("tosho")
            .from("quote_attachments")
            .select("id")
            .eq("quote_id", quoteCandidate.id)
            .eq("storage_bucket", selectedFile.storage_bucket)
            .eq("storage_path", selectedFile.storage_path)
            .maybeSingle();
          if (existingError) throw existingError;
          if (!existing?.id) {
            const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
              team_id: effectiveTeamId,
              quote_id: quoteCandidate.id,
              file_name: selectedFile.file_name,
              mime_type: selectedFile.mime_type || null,
              file_size: selectedFile.file_size,
              storage_bucket: selectedFile.storage_bucket,
              storage_path: selectedFile.storage_path,
              uploaded_by: selectedFile.uploaded_by ?? userId ?? null,
            });
            if (insertError) throw insertError;
          }
        }
      }

      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: task.id,
        quoteId: quoteCandidate.id,
        userId,
        actorName: actorLabel,
        action: "design_task_attachment",
        title: `Задачу прив’язано до прорахунку ${quoteCandidate.number ?? quoteCandidate.id.slice(0, 8)}`,
        metadata: {
          source: "design_task_attachment",
          from_quote_id: isUuid(task.quoteId) ? task.quoteId : null,
          to_quote_id: quoteCandidate.id,
          selected_design_output_file_ids: selectedFiles.map((file) => file.id),
        },
      });

      setTask((prev) =>
        prev
          ? {
              ...prev,
              quoteId: quoteCandidate.id,
              quoteNumber: quoteCandidate.number,
              metadata: nextMetadata,
            }
          : prev
      );
      setAttachQuoteDialogOpen(false);
      toast.success("Задачу прив’язано до прорахунку");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося прив’язати задачу до прорахунку");
      setError(message);
      toast.error(message);
    } finally {
      setAttachingQuoteId(null);
    }
  };

  const handleStartTimer = async () => {
    if (!task || !effectiveTeamId || !userId || timerBusy) return;
    if (!ensureCanEdit()) return;
    if (task.status !== "in_progress") {
      toast.error("Таймер можна запустити тільки у статусі «В роботі».");
      return;
    }
    if (!task.assigneeUserId) {
      toast.error("Спочатку призначте виконавця.");
      return;
    }
    if (task.assigneeUserId !== userId && !canManageAssignments) {
      toast.error("Таймер може запускати виконавець задачі.");
      return;
    }
    setTimerBusy("start");
    try {
      await startDesignTaskTimer({
        teamId: effectiveTeamId,
        taskId: task.id,
        userId,
      });
      await loadTimerSummary(task.id);
      toast.success("Таймер запущено");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося запустити таймер"));
    } finally {
      setTimerBusy(null);
    }
  };

  const handlePauseTimer = async (options?: { silent?: boolean }) => {
    if (!task || !effectiveTeamId || timerBusy) return false;
    if (!ensureCanEdit()) return false;
    setTimerBusy("pause");
    try {
      const wasPaused = await pauseDesignTaskTimer({
        teamId: effectiveTeamId,
        taskId: task.id,
      });
      await loadTimerSummary(task.id);
      if (wasPaused && !options?.silent) {
        toast.success("Таймер на паузі");
      }
      return wasPaused;
    } catch (e: unknown) {
      if (!options?.silent) toast.error(getErrorMessage(e, "Не вдалося зупинити таймер"));
      return false;
    } finally {
      setTimerBusy(null);
    }
  };

  const updateTaskStatus = async (nextStatus: DesignStatus, options?: { estimateMinutes?: number }) => {
    if (!task || !effectiveTeamId || task.status === nextStatus) return;
    if (!ensureCanEdit()) return;
    if (
      !canChangeDesignStatus({
        currentStatus: task.status,
        nextStatus,
        canManageAssignments: canManageDesignStatuses,
        isAssignedToCurrentUser: isAssignedToMe,
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
    if (nextStatus === "changes" && !deadlineWasUpdatedAfterCurrentStatus) {
      setDeadlineDraftDate(toLocalDate(task.designDeadline));
      const match = (task.designDeadline ?? null)?.match(/t(\d{2}):(\d{2})/i);
      setDeadlineTime(match ? `${match[1]}:${match[2]}` : "12:00");
      setDeadlinePopoverOpen(true);
      toast.error("Щоб повернути задачу в «Правки», спочатку оновіть дедлайн.");
      return;
    }
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (nextStatus === "in_progress" && !existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateDialog({ mode: "status", nextStatus });
      return;
    }
    if (nextStatus === "client_review" && clientReviewBlockers.length > 0) {
      toast.error(`Щоб передати дизайн замовнику, закрийте блокери: ${clientReviewBlockers.join(", ")}.`);
      return;
    }
    const previousStatus = task.status;
    const previousTask = task;
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
      status: nextStatus,
      status_changed_at: new Date().toISOString(),
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      deadline: task.designDeadline ?? null,
      assignee_user_id: task.assigneeUserId ?? null,
      assigned_at: task.assignedAt ?? null,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    setTask((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            metadata: nextMetadata,
          }
        : prev
    );
    setStatusSaving(nextStatus);

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      if (previousStatus === "in_progress" && nextStatus !== "in_progress") {
        await handlePauseTimer({ silent: true });
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
          title: `Статус: ${statusLabels[previousStatus] ?? previousStatus} → ${statusLabels[nextStatus] ?? nextStatus}`,
          metadata: {
            source: "design_task_status",
            from_status: previousStatus,
            to_status: nextStatus,
            assignee_user_id: task.assigneeUserId ?? null,
            design_task_type: task.designTaskType ?? null,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task status event", logError);
      }
      try {
        await notifyQuoteInitiatorOnDesignStatusChange({
          quoteId: task.quoteId,
          designTaskId: task.id,
          toStatus: nextStatus,
          actorUserId: userId ?? null,
        });
      } catch (notifyError) {
        console.warn("Failed to notify quote initiator about design status change", notifyError);
      }

      toast.success(`Статус оновлено: ${statusLabels[nextStatus]}`);
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося змінити статус");
      setError(message);
      toast.error(message);
    } finally {
      setStatusSaving(null);
    }
  };

  const submitRenameDialog = async (nextTitle: string) => {
    if (!task || !effectiveTeamId || !canEditTaskTitle) return;
    if (!ensureCanEdit()) return;

    const normalizedTitle = nextTitle.trim();
    if (!normalizedTitle) {
      setRenameError("Вкажіть назву задачі.");
      return;
    }

    const previousTask = task;
    const previousTitle = previousTask.title?.trim() || "";
    if (previousTitle === normalizedTitle) {
      setTitleEditing(false);
      setRenameError(null);
      return;
    }

    const nextTask = { ...previousTask, title: normalizedTitle };
    setRenameError(null);
    setRenameSaving(true);
    setTask(nextTask);

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
      await loadHistory(previousTask.id);

      if (typeof window !== "undefined" && id) {
        sessionStorage.setItem(
          `design-task-page-cache:${effectiveTeamId}:${id}`,
          JSON.stringify(
            buildDesignTaskPageCachePayload({
              task: nextTask,
              quoteItem,
              productPreviewUrl,
              productZoomPreviewUrl,
              customerAttachmentsLoaded: false,
              designOutputLinks,
              designOutputGroups,
            })
          )
        );
      }
      syncDesignPageCacheTask(effectiveTeamId, nextTask);

      toast.success("Назву задачі оновлено");
      setTitleEditing(false);
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити назву задачі");
      setRenameError(message);
      setError(message);
      toast.error(message);
    } finally {
      setRenameSaving(false);
    }
  };

  const updateTaskDeadline = async (nextDate: Date | null, nextTime?: string) => {
    if (!task || !effectiveTeamId) return;
    if (!ensureCanEdit()) return;
    const previousDeadline = task.designDeadline ?? null;
    const rawTime = (nextTime ?? deadlineTime).trim();
    const normalizedTime = isValidDeadlineTime(rawTime) ? rawTime : "12:00";
    const nextDeadline = nextDate ? `${format(nextDate, "yyyy-MM-dd")}T${normalizedTime}:00` : null;
    if (previousDeadline === nextDeadline) return;

    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: task.status,
      deadline_updated_at: new Date().toISOString(),
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: nextDeadline,
      deadline: nextDeadline,
      assignee_user_id: task.assigneeUserId ?? null,
      assigned_at: task.assignedAt ?? null,
      estimate_minutes: getTaskEstimateMinutes(task),
      estimate_set_at: (task.metadata ?? {}).estimate_set_at ?? null,
      estimated_by_user_id: (task.metadata ?? {}).estimated_by_user_id ?? null,
    };

    const previousTask = task;
    setDeadlineSaving(true);
    setTask((prev) =>
      prev
        ? {
            ...prev,
            designDeadline: nextDeadline,
            metadata: nextMetadata,
          }
        : prev
    );

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_deadline",
          title: `Дедлайн: ${formatDeadlineDateTime(previousDeadline)} → ${formatDeadlineDateTime(nextDeadline)}`,
          metadata: {
            source: "design_task_deadline",
            from_deadline: previousDeadline,
            to_deadline: nextDeadline,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task deadline event", logError);
      }

      toast.success(nextDeadline ? `Дедлайн оновлено: ${formatDeadlineDateTime(nextDeadline)}` : "Дедлайн очищено");
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити дедлайн");
      setError(message);
      toast.error(message);
    } finally {
      setDeadlineSaving(false);
      setDeadlinePopoverOpen(false);
      setHeaderDeadlinePopoverOpen(false);
    }
  };

  const applyTaskType = async (nextType: DesignTaskType) => {
    if (!task || !effectiveTeamId || typeSaving) return;
    if (!ensureCanEdit()) return;
    if (task.designTaskType === nextType) {
      setHeaderTypePopoverOpen(false);
      return;
    }

    const previousType = task.designTaskType ?? null;
    const previousLabel = previousType ? DESIGN_TASK_TYPE_LABELS[previousType] : "Не вказано";
    const nextLabel = DESIGN_TASK_TYPE_LABELS[nextType];
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      design_task_type: nextType,
    };

    const previousTask = task;
    setTypeSaving(true);
    setTask((prev) => (prev ? { ...prev, designTaskType: nextType, metadata: nextMetadata } : prev));

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_type",
          title: `Тип задачі: ${previousLabel} → ${nextLabel}`,
          metadata: {
            source: "design_task_type",
            from_design_task_type: previousType,
            to_design_task_type: nextType,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task type update", logError);
      }

      toast.success(`Тип задачі оновлено: ${nextLabel}`);
      setHeaderTypePopoverOpen(false);
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити тип задачі");
      setError(message);
      toast.error(message);
    } finally {
      setTypeSaving(false);
    }
  };

  const applyDeadlineDraft = () => {
    const normalizedTime = isValidDeadlineTime(deadlineTime.trim()) ? deadlineTime.trim() : "12:00";
    setDeadlineTime(normalizedTime);
    void updateTaskDeadline(deadlineDraftDate ?? null, normalizedTime);
  };

  const saveDesignBrief = async () => {
    if (!task || !effectiveTeamId || briefSaving) return;
    if (!ensureCanEdit()) return;
    const nextBrief = briefDraft.trim() ? briefDraft.trim() : null;
    const previousBrief = activeBriefVersion?.brief ?? task.designBrief ?? null;
    if ((previousBrief ?? null) === (nextBrief ?? null)) {
      setBriefDirty(false);
      setBriefInlineEditing(false);
      return;
    }

    const nowIso = new Date().toISOString();
    const actorLabel = userId ? getMemberLabel(userId) : "System";
    const baselineVersions =
      briefVersions.length > 0
        ? briefVersions
        : previousBrief !== null
          ? [
              {
                id: crypto.randomUUID(),
                version: 1,
                brief: previousBrief,
                created_at: task.createdAt ?? nowIso,
                created_by: null,
                created_by_label: "System",
                change_request_id: null,
                note: "Initial brief",
              } satisfies DesignBriefVersion,
            ]
          : [];
    const nextVersionNumber =
      baselineVersions.reduce((max, row) => Math.max(max, row.version), 0) + 1;
    const nextVersion: DesignBriefVersion = {
      id: crypto.randomUUID(),
      version: nextVersionNumber,
      brief: nextBrief,
      created_at: nowIso,
      created_by: userId ?? null,
      created_by_label: actorLabel,
      change_request_id: null,
      note: "Manual update",
    };
    const nextVersions = [...baselineVersions, nextVersion];

    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      design_brief: nextBrief,
      design_brief_versions: nextVersions,
      design_brief_active_version_id: nextVersion.id,
    };

    const previousTask = task;
    setBriefSaving(true);
    setTask((prev) =>
      prev
        ? {
            ...prev,
            designBrief: nextBrief,
            metadata: nextMetadata,
          }
        : prev
    );

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      if (isUuid(task.quoteId)) {
        const { error: quoteBriefError } = await supabase
          .schema("tosho")
          .from("quotes")
          .update({ design_brief: nextBrief })
          .eq("id", task.quoteId);

        if (
          quoteBriefError &&
          /column/i.test(quoteBriefError.message ?? "") &&
          /design_brief/i.test(quoteBriefError.message ?? "")
        ) {
          const { error: quoteFallbackError } = await supabase
            .schema("tosho")
            .from("quotes")
            .update({ comment: nextBrief })
          .eq("id", task.quoteId);
          if (quoteFallbackError) throw quoteFallbackError;
        } else if (quoteBriefError) {
          throw quoteBriefError;
        }
      }

      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_brief_version",
          title: `Оновлено ТЗ: v${nextVersion.version}`,
          metadata: {
            source: "design_task_brief_version",
            from_brief: previousBrief,
            to_brief: nextBrief,
            brief_version: nextVersion.version,
            brief_version_id: nextVersion.id,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task brief event", logError);
      }

      setBriefDirty(false);
      setBriefInlineEditing(false);
      toast.success(`ТЗ оновлено до v${nextVersion.version}`);
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити ТЗ");
      setError(message);
      toast.error(message);
    } finally {
      setBriefSaving(false);
    }
  };

  const createBriefChangeRequest = async () => {
    if (!task || !effectiveTeamId || changeRequestSaving) return;
    if (!ensureCanEdit()) return;
    const requestText = changeRequestDraft.trim();
    if (!requestText) {
      toast.error("Опишіть суть правки");
      return;
    }

    const actorLabel = userId ? getMemberLabel(userId) : "System";
    const nowIso = new Date().toISOString();

    const nextChangeRequest: DesignBriefChangeRequest = {
      id: crypto.randomUUID(),
      status: "pending",
      request_text: requestText,
      reason: null,
      priority: null,
      impact: null,
      requested_by: userId ?? null,
      requested_by_label: actorLabel,
      requested_at: nowIso,
      decision_at: null,
      decided_by: null,
      decided_by_label: null,
      decision_note: null,
      applied_version_id: null,
    };
    const nextRequests = [nextChangeRequest, ...briefChangeRequests];
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      design_brief_change_requests: nextRequests,
    };

    setChangeRequestSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));

      setChangeRequestDraft("");
      setChangeRequestOpen(false);

      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_brief_change_request",
          title: "Додано правку до ТЗ",
          metadata: {
            source: "design_task_brief_change_request",
            change_request_id: nextChangeRequest.id,
            status: "pending",
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log design task brief change request event", logError);
      }
      toast.success("Правку додано");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося додати правку"));
    } finally {
      setChangeRequestSaving(false);
    }
  };

  const applyAssignee = async (nextAssigneeUserId: string | null, options?: { estimateMinutes?: number }) => {
    if (!task || !effectiveTeamId || !canManageAssignments) return;
    if (!ensureCanEdit()) return;
    if (nextAssigneeUserId === task.assigneeUserId) return;
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (nextAssigneeUserId && !existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateDialog({ mode: "assign", nextAssigneeUserId });
      return;
    }

    const previousAssignee = task.assigneeUserId ?? null;
    const previousAssigneeLabel = getMemberLabel(previousAssignee);
    const nextAssigneeLabel = getMemberLabel(nextAssigneeUserId);
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
      deadline: task.designDeadline ?? null,
      assignee_user_id: nextAssigneeUserId,
      assigned_at: nextAssignedAt,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    const previousTask = task;
    setAssigningMemberId(nextAssigneeUserId ?? "__clear__");
    setTask((prev) =>
      prev
        ? {
            ...prev,
            assigneeUserId: nextAssigneeUserId,
            assignedAt: nextAssignedAt,
            metadata: nextMetadata,
          }
        : prev
    );
    setDesignQueueTasks((prev) =>
      prev.map((queueTask) =>
        queueTask.id === task.id
          ? {
              ...queueTask,
              assigneeUserId: nextAssigneeUserId,
              assignedAt: nextAssignedAt,
              metadata: nextMetadata,
            }
          : queueTask
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
        await handlePauseTimer({ silent: true });
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
            to_assignee_user_id: nextAssigneeUserId,
            to_assignee_label: nextAssigneeUserId ? nextAssigneeLabel : null,
          },
        });
      } catch (logError) {
        console.warn("Failed to log design task assignment event", logError);
      }

      const isLinkedQuoteTask = isUuid(task.quoteId);
      const taskLabel = isLinkedQuoteTask
        ? `#${getTaskDisplayNumber(task)}`
        : `«${task.title ?? getTaskDisplayNumber(task)}»`;
      try {
        if (nextAssigneeUserId && nextAssigneeUserId !== userId) {
          await notifyUsers({
            userIds: [nextAssigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: isLinkedQuoteTask
              ? `${actorLabel} призначив(ла) вас на задачу по прорахунку ${taskLabel}.`
              : `${actorLabel} призначив(ла) вас на дизайн-задачу ${taskLabel}.`,
            href: `/design/${task.id}`,
            type: "info",
          });
        }
        if (previousAssignee && previousAssignee !== userId && previousAssignee !== nextAssigneeUserId) {
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: isLinkedQuoteTask
              ? `${actorLabel} зняв(ла) вас із задачі по прорахунку ${taskLabel}.`
              : `${actorLabel} зняв(ла) вас із дизайн-задачі ${taskLabel}.`,
            href: `/design/${task.id}`,
            type: "warning",
          });
        }
      } catch (notifyError) {
        console.warn("Failed to send design task assignment notification", notifyError);
      }

      await loadHistory(task.id);
      toast.success(nextAssigneeUserId ? `Виконавця змінено: ${getMemberLabel(nextAssigneeUserId)}` : "Виконавця знято");
    } catch (e: unknown) {
      setTask(previousTask);
      setDesignQueueTasks((prev) => prev.map((queueTask) => (queueTask.id === previousTask.id ? previousTask : queueTask)));
      const message = getErrorMessage(e, "Не вдалося оновити виконавця");
      setError(message);
      toast.error(message);
    } finally {
      setAssigningMemberId(null);
    }
  };

  const applyManager = async (nextManagerUserId: string | null) => {
    if (!task || !effectiveTeamId || managerSaving) return;
    if (!ensureCanEdit()) return;
    const previousManagerUserId =
      typeof task.metadata?.manager_user_id === "string" && task.metadata.manager_user_id
        ? (task.metadata.manager_user_id as string)
        : null;
    if (previousManagerUserId === nextManagerUserId) return;

    const previousManagerLabel =
      (typeof task.metadata?.manager_label === "string" && task.metadata.manager_label.trim()) ||
      (previousManagerUserId ? getMemberLabel(previousManagerUserId) : "Не вказано");
    const nextManagerLabel = nextManagerUserId ? getMemberLabel(nextManagerUserId) : "Не вказано";
    const ownerRole = getTaskOwnerRole(task.metadata, task.creatorUserId ?? null, memberRoleById);
    const roleLabel = ownerRole === "designer" ? "Дизайнер" : "Менеджер";
    const roleLabelLower = ownerRole === "designer" ? "дизайнера" : "менеджера";
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      manager_user_id: nextManagerUserId,
      manager_label: nextManagerUserId ? nextManagerLabel : null,
    };

    const previousTask = task;
    setManagerSaving(true);
    setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));

    try {
      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      try {
        await logDesignTaskActivity({
          teamId: effectiveTeamId,
          designTaskId: task.id,
          quoteId: task.quoteId,
          userId,
          actorName: actorLabel,
          action: "design_task_manager",
          title: `${roleLabel}: ${previousManagerLabel} → ${nextManagerLabel}`,
          metadata: {
            source: "design_task_manager",
            role_label: roleLabel,
            from_manager_user_id: previousManagerUserId,
            from_manager_label: previousManagerLabel,
            to_manager_user_id: nextManagerUserId,
            to_manager_label: nextManagerLabel,
          },
        });
        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log manager update", logError);
      }

      toast.success(nextManagerUserId ? `${roleLabel}а змінено: ${nextManagerLabel}` : `${roleLabelLower} очищено`);
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, `Не вдалося оновити ${roleLabelLower}`);
      setError(message);
      toast.error(message);
    } finally {
      setManagerSaving(false);
    }
  };

  const assignTaskToMe = async (options?: { alsoStart?: boolean; estimateMinutes?: number }) => {
    if (!task || !effectiveTeamId || !userId || !canSelfAssign || isAssignedToMe || assigningSelf) return;
    if (!ensureCanEdit()) return;
    if (!canManageAssignments && task.assigneeUserId && task.assigneeUserId !== userId) {
      toast.error("Задача вже призначена іншому дизайнеру");
      return;
    }
    const previousAssignee = task.assigneeUserId ?? null;
    const previousAssigneeLabel = getMemberLabel(previousAssignee);
    const alsoStart = !!options?.alsoStart;
    const nextStatus: DesignStatus =
      alsoStart && (task.status === "new" || task.status === "changes") ? "in_progress" : task.status;
    const existingEstimateMinutes = getTaskEstimateMinutes(task);
    if (!existingEstimateMinutes && !options?.estimateMinutes) {
      requestEstimateDialog({ mode: "assign_self", alsoStart });
      return;
    }
    setAssigningSelf(true);
    const nextAssignedAt = new Date().toISOString();
    const estimateMinutes = options?.estimateMinutes ?? existingEstimateMinutes;
    const estimateSetAt =
      options?.estimateMinutes != null
        ? new Date().toISOString()
        : ((task.metadata ?? {}).estimate_set_at as string | null | undefined) ?? null;
    const estimatedByUserId =
      options?.estimateMinutes != null
        ? userId
        : (((task.metadata ?? {}).estimated_by_user_id as string | null | undefined) ?? userId);
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      status: nextStatus,
      methods_count: task.methodsCount ?? 0,
      has_files: task.hasFiles ?? false,
      quote_id: task.quoteId,
      design_deadline: task.designDeadline ?? null,
      deadline: task.designDeadline ?? null,
      assignee_user_id: userId,
      assigned_at: nextAssignedAt,
      estimate_minutes: estimateMinutes,
      estimate_set_at: estimateSetAt,
      estimated_by_user_id: estimatedByUserId,
    };

    const previousTask = task;
    setTask((prev) =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            assigneeUserId: userId,
            assignedAt: nextAssignedAt,
            metadata: nextMetadata,
          }
        : prev
    );
    setDesignQueueTasks((prev) =>
      prev.map((queueTask) =>
        queueTask.id === task.id
          ? {
              ...queueTask,
              status: nextStatus,
              assigneeUserId: userId,
              assignedAt: nextAssignedAt,
              metadata: nextMetadata,
            }
          : queueTask
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

      if (previousAssignee && previousAssignee !== userId) {
        await handlePauseTimer({ silent: true });
      }

      const actorLabel = getMemberLabel(userId);
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
          title: `Призначено виконавця: ${getMemberLabel(userId)}`,
          metadata: {
            source: "design_task_assignment",
            from_assignee_user_id: previousAssignee,
            from_assignee_label: previousAssigneeLabel,
            to_assignee_user_id: userId,
            to_assignee_label: getMemberLabel(userId),
          },
        });

        if (nextStatus !== task.status) {
          await logDesignTaskActivity({
            teamId: effectiveTeamId,
            designTaskId: task.id,
            quoteId: task.quoteId,
            userId,
            actorName: actorLabel,
            action: "design_task_status",
            title: `Статус: ${statusLabels[task.status] ?? task.status} → ${statusLabels[nextStatus] ?? nextStatus}`,
            metadata: {
              source: "design_task_status",
              from_status: task.status,
              to_status: nextStatus,
              assignee_user_id: task.assigneeUserId ?? null,
              design_task_type: task.designTaskType ?? null,
            },
          });
        }

        if (previousAssignee && previousAssignee !== userId) {
          const isLinkedQuoteTask = isUuid(task.quoteId);
        const taskLabel = isLinkedQuoteTask
            ? `#${getTaskDisplayNumber(task)}`
            : `«${task.title ?? getTaskDisplayNumber(task)}»`;
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: isLinkedQuoteTask
              ? `${actorLabel} зняв(ла) вас із задачі по прорахунку ${taskLabel}.`
              : `${actorLabel} зняв(ла) вас із дизайн-задачі ${taskLabel}.`,
            href: `/design/${task.id}`,
            type: "warning",
          });
        }

        await loadHistory(task.id);
      } catch (logError) {
        console.warn("Failed to log/notify assignment", logError);
      }

      toast.success(
        nextStatus !== task.status
          ? "Задача призначена на вас і переведена в статус «В роботі»"
          : "Задача призначена на вас"
      );
    } catch (e: unknown) {
      setTask(previousTask);
      setDesignQueueTasks((prev) => prev.map((queueTask) => (queueTask.id === previousTask.id ? previousTask : queueTask)));
      const message = getErrorMessage(e, "Не вдалося призначити задачу");
      toast.error(message);
      setError(message);
    } finally {
      setAssigningSelf(false);
    }
  };

  const openManualEstimateDialog = () => {
    const currentEstimate = getTaskEstimateMinutes(task);
    if (currentEstimate && currentEstimate % 480 === 0) {
      setEstimateInput(String(currentEstimate / 480));
      setEstimateUnit("days");
    } else if (currentEstimate && currentEstimate % 60 === 0) {
      setEstimateInput(String(currentEstimate / 60));
      setEstimateUnit("hours");
    } else if (currentEstimate) {
      setEstimateInput(String(currentEstimate));
      setEstimateUnit("minutes");
    } else {
      setEstimateInput("2");
      setEstimateUnit("hours");
    }
    setEstimateError(null);
    setEstimatePendingAction({ mode: "manual" });
    setEstimateDialogOpen(true);
  };

  const updateTaskEstimate = async (estimateMinutes: number) => {
    if (!task || !effectiveTeamId) return;
    if (!ensureCanEdit()) return;
    const previousEstimate = getTaskEstimateMinutes(task);
    const previousTask = task;
    const nextMetadata: Record<string, unknown> = {
      ...(task.metadata ?? {}),
      estimate_minutes: estimateMinutes,
      estimate_set_at: new Date().toISOString(),
      estimated_by_user_id: userId ?? null,
    };

    setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
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
        },
      });
      await loadHistory(task.id);
      toast.success(previousEstimate ? "Естімейт оновлено" : "Естімейт встановлено");
    } catch (e: unknown) {
      setTask(previousTask);
      const message = getErrorMessage(e, "Не вдалося оновити естімейт");
      setError(message);
      toast.error(message);
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
    setEstimateError(null);
    setEstimateDialogOpen(false);

    if (estimatePendingAction.mode === "assign") {
      await applyAssignee(estimatePendingAction.nextAssigneeUserId, { estimateMinutes: normalized });
    } else if (estimatePendingAction.mode === "assign_self") {
      await assignTaskToMe({ alsoStart: estimatePendingAction.alsoStart, estimateMinutes: normalized });
    } else if (estimatePendingAction.mode === "status") {
      await updateTaskStatus(estimatePendingAction.nextStatus, { estimateMinutes: normalized });
    } else if (estimatePendingAction.mode === "manual") {
      await updateTaskEstimate(normalized);
    }
    setEstimatePendingAction(null);
  };

  const requestDeleteTask = () => {
    if (!canManageAssignments) {
      toast.error("Немає прав для видалення задачі");
      return;
    }
    setDeleteDialogOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!task || !effectiveTeamId || !canManageAssignments || deletingTask) return;
    if (!ensureCanEdit()) return;
    setDeletingTask(true);
    try {
      const storageFiles = collectDesignTaskStorageFiles(task.metadata);
      await Promise.all(storageFiles.map((file) => removeAttachmentWithVariants(file.bucket, file.path)));

      if (isUuid(task.quoteId) && storageFiles.length > 0) {
        const { error: quoteAttachmentDeleteError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .delete()
          .eq("quote_id", task.quoteId)
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
        .eq("id", task.id)
        .eq("action", "design_task");
      if (taskDeleteError) throw taskDeleteError;

      const { error: historyDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("team_id", effectiveTeamId)
        .eq("entity_type", "design_task")
        .eq("entity_id", task.id);
      if (historyDeleteError) {
        console.warn("Failed to delete design task history events", historyDeleteError);
      }

      setDeleteDialogOpen(false);
      toast.success("Задачу видалено");
      navigate("/design", { replace: true });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося видалити задачу");
      setError(message);
      toast.error(message);
    } finally {
      setDeletingTask(false);
    }
  };

  const isStatusStartable = task?.status === "new" || task?.status === "changes";
  const isAssignedToOther = !!task?.assigneeUserId && !!userId && task.assigneeUserId !== userId;
  const selectedVisualizationOutputFileIds = useMemo(() => {
    const explicit = getSelectedDesignOutputFileIdsFromMetadata(task?.metadata, "visualization");
    if (explicit.length > 0) return explicit;
    const legacy = getSelectedDesignOutputFileIdsFromMetadata(task?.metadata);
    return legacy.filter((id) => designOutputFiles.some((file) => file.id === id && file.output_kind === "visualization"));
  }, [designOutputFiles, task?.metadata]);
  const selectedLayoutOutputFileIds = useMemo(() => {
    const explicit = getSelectedDesignOutputFileIdsFromMetadata(task?.metadata, "layout");
    if (explicit.length > 0) return explicit;
    const legacy = getSelectedDesignOutputFileIdsFromMetadata(task?.metadata);
    return legacy.filter((id) => designOutputFiles.some((file) => file.id === id && file.output_kind === "layout"));
  }, [designOutputFiles, task?.metadata]);
  const selectedVisualizationOutputFileIdSet = useMemo(
    () => new Set(selectedVisualizationOutputFileIds),
    [selectedVisualizationOutputFileIds]
  );
  const selectedLayoutOutputFileIdSet = useMemo(
    () => new Set(selectedLayoutOutputFileIds),
    [selectedLayoutOutputFileIds]
  );
  const selectedApprovedDesignOutputFileIdSet = useMemo(
    () => new Set([...selectedVisualizationOutputFileIds, ...selectedLayoutOutputFileIds]),
    [selectedLayoutOutputFileIds, selectedVisualizationOutputFileIds]
  );
  const requiresVisualizationOutput =
    task?.designTaskType === "visualization" || task?.designTaskType === "visualization_layout_adaptation";
  const requiresLayoutOutput =
    task?.designTaskType === "layout" ||
    task?.designTaskType === "layout_adaptation" ||
    task?.designTaskType === "visualization_layout_adaptation";
  const clientReviewBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (requiresVisualizationOutput && selectedVisualizationOutputFileIds.length === 0) {
      blockers.push("Потрібно погодити хоча б один візуал");
    }
    if (requiresLayoutOutput && selectedLayoutOutputFileIds.length === 0) {
      blockers.push("Потрібно погодити хоча б один макет");
    }
    return blockers;
  }, [
    requiresLayoutOutput,
    requiresVisualizationOutput,
    selectedLayoutOutputFileIds.length,
    selectedVisualizationOutputFileIds.length,
  ]);
  const canSeeMarkReadyAction = !!task && task.status === "in_progress" && allowedStatusTransitions.includes("pm_review");
  const canMarkReadyNow = canSeeMarkReadyAction;
  const canSendToClientNow = clientReviewBlockers.length === 0;
  useEffect(() => {
    if (requiresVisualizationOutput) {
      setUploadTargetKind((prev) => (prev === "visualization" ? prev : "visualization"));
      setAddLinkKind((prev) => (prev === "visualization" ? prev : "visualization"));
      setActiveDesignOutputTab((prev) => (prev === "visualization" ? prev : "visualization"));
      return;
    }
    if (requiresLayoutOutput) {
      setUploadTargetKind((prev) => (prev === "layout" ? prev : "layout"));
      setAddLinkKind((prev) => (prev === "layout" ? prev : "layout"));
      setActiveDesignOutputTab((prev) => (prev === "layout" ? prev : "layout"));
    }
  }, [requiresLayoutOutput, requiresVisualizationOutput]);
  const groupedDesignOutputs = useMemo(() => {
    const map = new Map<string, GroupedDesignOutputs>();
    for (const label of designOutputGroups) {
      const normalized = normalizeOutputGroupLabel(label);
      if (!normalized) continue;
      map.set(normalized, { key: normalized, label: normalized, files: [], links: [] });
    }

    for (const file of designOutputFiles) {
      const groupLabel = normalizeOutputGroupLabel(file.group_label) ?? "__ungrouped__";
      const group =
        map.get(groupLabel) ??
        {
          key: groupLabel,
          label: groupLabel === "__ungrouped__" ? "Без групи" : groupLabel,
          files: [],
          links: [],
        };
      group.files.push(file);
      map.set(groupLabel, group);
    }

    for (const link of designOutputLinks) {
      const groupLabel = normalizeOutputGroupLabel(link.group_label) ?? "__ungrouped__";
      const group =
        map.get(groupLabel) ??
        {
          key: groupLabel,
          label: groupLabel === "__ungrouped__" ? "Без групи" : groupLabel,
          files: [],
          links: [],
        };
      group.links.push(link);
      map.set(groupLabel, group);
    }

    const groups = Array.from(map.values()).filter((group) => group.files.length > 0 || group.links.length > 0);
    return groups.sort((a, b) => {
      if (a.key === "__ungrouped__") return 1;
      if (b.key === "__ungrouped__") return -1;
      const aIndex = designOutputGroups.findIndex((entry) => entry === a.label);
      const bIndex = designOutputGroups.findIndex((entry) => entry === b.label);
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      if (aIndex >= 0) return -1;
      if (bIndex >= 0) return 1;
      return a.label.localeCompare(b.label, "uk");
    });
  }, [designOutputFiles, designOutputGroups, designOutputLinks]);
  const groupedDesignOutputsByKind = useMemo(
    () =>
      (["visualization", "layout"] as DesignOutputKind[]).reduce(
        (acc, kind) => {
          acc[kind] = groupedDesignOutputs
            .map((group) => ({
              ...group,
              files: group.files.filter((file) => file.output_kind === kind),
              links: group.links.filter((link) => link.output_kind === kind),
            }))
            .filter((group) => group.files.length > 0 || group.links.length > 0);
          return acc;
        },
        {} as Record<DesignOutputKind, GroupedDesignOutputs[]>
      ),
    [groupedDesignOutputs]
  );
  const selectedGroupingItems = useMemo(() => {
    const selectedKeys = new Set(groupingSelectionIds);
    return [
      ...designOutputFiles
        .filter((file) => selectedKeys.has(`file:${file.id}`))
        .map((file) => ({
          key: `file:${file.id}`,
          groupKey: normalizeOutputGroupLabel(file.group_label) ?? "__ungrouped__",
        })),
      ...designOutputLinks
        .filter((link) => selectedKeys.has(`link:${link.id}`))
        .map((link) => ({
          key: `link:${link.id}`,
          groupKey: normalizeOutputGroupLabel(link.group_label) ?? "__ungrouped__",
        })),
    ];
  }, [designOutputFiles, designOutputLinks, groupingSelectionIds]);
  const mentionSuggestions = useMemo<MentionSuggestion[]>(
    () =>
      Object.entries(memberById)
        .filter(([memberId]) => memberId !== userId)
        .map(([memberId, label]) => ({
          id: memberId,
          label,
          alias: buildMentionAlias(label, memberId).toLowerCase(),
          avatarUrl: memberAvatarById[memberId] ?? null,
        }))
        .sort((a, b) => {
          const aGeneric = isGenericMentionLabel(a.label);
          const bGeneric = isGenericMentionLabel(b.label);
          if (aGeneric !== bGeneric) return aGeneric ? 1 : -1;
          return a.label.localeCompare(b.label, "uk");
        }),
    [memberAvatarById, memberById, userId]
  );
  const mentionLookup = useMemo(() => {
    const lookup = new Map<string, Set<string>>();
    const addKey = (raw: string | null | undefined, memberId: string) => {
      const normalized = normalizeMentionKey(raw);
      if (!normalized) return;
      const current = lookup.get(normalized) ?? new Set<string>();
      current.add(memberId);
      lookup.set(normalized, current);
    };

    for (const suggestion of mentionSuggestions) {
      addKey(suggestion.id, suggestion.id);
      addKey(suggestion.alias, suggestion.id);
      addKey(suggestion.label, suggestion.id);
      addKey(suggestion.label.replace(/\s+/g, ""), suggestion.id);
      addKey(suggestion.label.replace(/\s+/g, "."), suggestion.id);
      addKey(suggestion.label.replace(/\s+/g, "_"), suggestion.id);
      addKey(toEmailLocalPart(suggestion.label), suggestion.id);

      for (const part of suggestion.label.split(/\s+/).filter((token) => token.length >= 2)) {
        addKey(part, suggestion.id);
      }
    }
    return lookup;
  }, [mentionSuggestions]);
  const filteredMentionSuggestions = useMemo(() => {
    if (!mentionContext) return [];
    const query = normalizeMentionKey(mentionContext.query);
    return mentionSuggestions
      .filter((member) => {
        if (!query) return true;
        return (
          normalizeMentionKey(member.alias).includes(query) ||
          normalizeMentionKey(member.label).includes(query)
        );
      })
      .slice(0, 12);
  }, [mentionContext, mentionSuggestions]);
  useEffect(() => {
    if (filteredMentionSuggestions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }
    setMentionActiveIndex((prev) => Math.max(0, Math.min(prev, filteredMentionSuggestions.length - 1)));
  }, [filteredMentionSuggestions.length]);
  useEffect(() => {
    if (!attachQuoteDialogOpen || !task || isUuid(task.quoteId)) return;
    void loadQuoteCandidates();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachQuoteDialogOpen, task?.id, task?.quoteId, task?.customerName]);
  useEffect(() => {
    setTitleDraft(task?.title ?? "");
  }, [task?.id, task?.title]);
  useEffect(() => {
    if (!titleEditing) return;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [titleEditing]);
  const canTakeOverForSelf =
    !!task &&
    canSelfAssign &&
    !assigningSelf &&
    (!task.assigneeUserId || task.assigneeUserId === userId || canManageAssignments);

  const canStartWorkNow =
    !!task &&
    isStatusStartable &&
    !statusSaving &&
    (!!isAssignedToMe || canManageAssignments);

  let primaryActionLabel = "Взяти в роботу";
  let primaryActionHint: ReactNode = "Призначити задачу на себе.";
  let primaryActionDisabled = true;
  const primaryActionLoading = assigningSelf || statusSaving === "in_progress";
  let primaryActionClick: (() => void) | null = null;

  if (task) {
    if (!task.assigneeUserId && isStatusStartable) {
      primaryActionLabel = "Взяти на себе і почати";
      primaryActionHint = "Крок 1: призначити себе. Крок 2: змінити статус на «В роботі».";
      primaryActionDisabled = !canTakeOverForSelf;
      primaryActionClick = () => {
        void assignTaskToMe({ alsoStart: true });
      };
    } else if (!task.assigneeUserId) {
      primaryActionLabel = "Взяти на себе";
      primaryActionHint = "Призначити задачу на себе без зміни статусу.";
      primaryActionDisabled = !canTakeOverForSelf;
      primaryActionClick = () => {
        void assignTaskToMe();
      };
    } else if (isAssignedToMe && isStatusStartable) {
      primaryActionLabel = task.status === "changes" ? "Почати правки" : "Почати роботу";
      primaryActionHint = "Змінити статус на «В роботі».";
      primaryActionDisabled = !canStartWorkNow;
      primaryActionClick = () => {
        void updateTaskStatus("in_progress");
      };
    } else if (isAssignedToMe) {
      primaryActionLabel = "Задача на мені";
      primaryActionHint = "Виконавець уже встановлений.";
      primaryActionDisabled = true;
      primaryActionClick = null;
    } else if (isAssignedToOther && !canManageAssignments) {
      primaryActionLabel = "Вже призначено";
      primaryActionHint = (
        <span className="inline-flex items-center gap-1.5">
          <span>Виконавець:</span>
          <AvatarBase
            src={getMemberAvatar(task.assigneeUserId)}
            name={getMemberLabel(task.assigneeUserId)}
            fallback={getInitials(getMemberLabel(task.assigneeUserId))}
            size={14}
            className="shrink-0 border-border/70"
          />
          <span>{getMemberLabel(task.assigneeUserId)}</span>
        </span>
      );
      primaryActionDisabled = true;
      primaryActionClick = null;
    } else if (isAssignedToOther && canManageAssignments) {
      primaryActionLabel = "Призначити себе";
      primaryActionHint = (
        <span className="inline-flex items-center gap-1.5">
          <span>Зараз виконавець:</span>
          <AvatarBase
            src={getMemberAvatar(task.assigneeUserId)}
            name={getMemberLabel(task.assigneeUserId)}
            fallback={getInitials(getMemberLabel(task.assigneeUserId))}
            size={14}
            className="shrink-0 border-border/70"
          />
          <span>{getMemberLabel(task.assigneeUserId)}</span>
        </span>
      );
      primaryActionDisabled = !canTakeOverForSelf;
      primaryActionClick = () => {
        void assignTaskToMe();
      };
    }
  }

  const mobileSecondaryAction =
    quickActions.find((action) => !(isStatusStartable && action.next === "in_progress")) ?? null;
  const statusQuickActionsWithoutStart = quickActions.filter(
    (action) => !(isStatusStartable && action.next === "in_progress")
  );
  const mobileSecondaryActionDisabled =
    !!statusSaving || (mobileSecondaryAction?.next === "client_review" && !canSendToClientNow);

  const dropboxFolderNameDefault = useMemo(
    () => normalizeDropboxFolderNameDraft(task?.title ?? quoteItem?.name ?? "Замовлення"),
    [quoteItem?.name, task?.title]
  );
  const latestDropboxFolderName =
    typeof task?.metadata?.dropbox_order_folder_name === "string" && task.metadata.dropbox_order_folder_name.trim()
      ? normalizeDropboxFolderNameDraft(task.metadata.dropbox_order_folder_name)
      : null;
  const dropboxClientLabel = useMemo(() => {
    const raw = (task?.customerName ?? "").trim();
    if (!raw) return "Замовник";
    const beforeParenthesis = raw.split("(")[0]?.trim();
    return sanitizeDropboxNameSegment(beforeParenthesis || raw, "Замовник");
  }, [task?.customerName]);
  const dropboxDisplayedFolderName = latestDropboxFolderName || dropboxFolderNameDefault;
  const dropboxOrderNumber = useMemo(
    () => sanitizeDropboxNameSegment(task?.quoteNumber?.trim() || getTaskDisplayNumber(task), "TS"),
    [task]
  );
  const dropboxDateLabel = useMemo(() => formatDropboxDate(task?.createdAt), [task?.createdAt]);

  const dropboxPlanByKind = useMemo(() => {
    const buildPlan = (kind: DesignOutputKind) => {
      const files = designOutputFiles.filter((file) => file.output_kind === kind);
      const selectedIds = kind === "visualization" ? selectedVisualizationOutputFileIds : selectedLayoutOutputFileIds;
      const selectedSet = new Set(selectedIds);
      const finalFiles = files.filter((file) => selectedSet.has(file.id));
      const archiveFiles = files.filter((file) => !selectedSet.has(file.id));
      return {
        kind,
        files,
        finalFiles,
        archiveFiles,
      };
    };

    return {
      visualization: buildPlan("visualization"),
      layout: buildPlan("layout"),
    };
  }, [designOutputFiles, selectedLayoutOutputFileIds, selectedVisualizationOutputFileIds]);

  const dropboxExportWarnings = useMemo(() => {
    const warnings: string[] = [];
    (["visualization", "layout"] as DesignOutputKind[]).forEach((kind) => {
      const kindLabel = DESIGN_OUTPUT_KIND_LABELS[kind];
      const selectedCount = dropboxPlanByKind[kind].finalFiles.length;
      if (selectedCount > 1) {
        warnings.push(`У табі «${kindLabel}» вибрано кілька затверджених файлів. Для фіналу потрібен один.`);
      }
    });
    return warnings;
  }, [dropboxPlanByKind]);

  const dropboxExportPlan = useMemo(() => {
    const exported: DropboxExportPlanFile[] = [];

    (["visualization", "layout"] as DesignOutputKind[]).forEach((kind) => {
      const kindPlan = dropboxPlanByKind[kind];
      kindPlan.finalFiles.slice(0, 1).forEach((file) => {
        exported.push({
          file,
          role: "final",
          outputKind: kind,
        });
      });
      kindPlan.archiveFiles.forEach((file, index) => {
        exported.push({
          file,
          role: "archive",
          outputKind: kind,
          archiveVersion: index + 1,
        });
      });
    });

    return exported;
  }, [dropboxPlanByKind]);

  const dropboxExportCount = dropboxExportPlan.length;
  const dropboxCanExport =
    !!task &&
    !!dropboxClientPath &&
    dropboxExportCount > 0 &&
    dropboxExportWarnings.length === 0 &&
    !dropboxExporting;
  const latestDropboxFolderPath =
    typeof task?.metadata?.dropbox_order_folder_path === "string" && task.metadata.dropbox_order_folder_path.trim()
      ? task.metadata.dropbox_order_folder_path.trim()
      : null;
  const latestDropboxFolderSharedUrl =
    typeof task?.metadata?.dropbox_order_folder_shared_url === "string" && task.metadata.dropbox_order_folder_shared_url.trim()
      ? task.metadata.dropbox_order_folder_shared_url.trim()
      : null;
  const latestDropboxExportedAt =
    typeof task?.metadata?.dropbox_last_exported_at === "string" && task.metadata.dropbox_last_exported_at.trim()
      ? task.metadata.dropbox_last_exported_at.trim()
      : null;
  const latestDropboxExports = useMemo(() => {
    const raw = Array.isArray(task?.metadata?.dropbox_exports) ? task.metadata.dropbox_exports : [];
    return raw
      .filter((entry): entry is DropboxExportMetadataFile => !!entry && typeof entry === "object")
      .map((entry) => ({
        source_file_id: typeof entry.source_file_id === "string" ? entry.source_file_id : null,
        file_name: typeof entry.file_name === "string" ? entry.file_name : null,
        output_kind: typeof entry.output_kind === "string" ? entry.output_kind : null,
        role: typeof entry.role === "string" ? entry.role : null,
      }))
      .filter((entry) => entry.source_file_id && entry.file_name && entry.output_kind && entry.role);
  }, [task?.metadata?.dropbox_exports]);
  const buildDropboxPlanSignature = useCallback(
    (folderName: string, entries: DropboxExportPlanFile[]) =>
      entries
        .map((entry) =>
          [
            entry.file.id,
            entry.role,
            entry.outputKind,
            buildDropboxExportFileName({
              clientLabel: dropboxClientLabel,
              outputKind: entry.outputKind,
              projectName: folderName,
              orderNumber: dropboxOrderNumber,
              dateLabel: dropboxDateLabel,
              extension: getDropboxFileExtension(entry.file.file_name),
              archiveVersion: entry.role === "archive" ? entry.archiveVersion : undefined,
            }),
          ].join("|")
        )
        .sort()
        .join("::"),
    [dropboxClientLabel, dropboxDateLabel, dropboxOrderNumber]
  );
  const latestDropboxPlanSignature = useMemo(
    () =>
      latestDropboxExports
        .map((entry) => [entry.source_file_id, entry.role, entry.output_kind, entry.file_name].join("|"))
        .sort()
        .join("::"),
    [latestDropboxExports]
  );
  const currentDropboxPlanSignature = useMemo(
    () => buildDropboxPlanSignature(dropboxDisplayedFolderName, dropboxExportPlan),
    [buildDropboxPlanSignature, dropboxDisplayedFolderName, dropboxExportPlan]
  );
  const dropboxPlanDiffSummary = useMemo(() => {
    const currentEntries = new Set(currentDropboxPlanSignature ? currentDropboxPlanSignature.split("::").filter(Boolean) : []);
    const latestEntries = new Set(latestDropboxPlanSignature ? latestDropboxPlanSignature.split("::").filter(Boolean) : []);
    let addedOrChanged = 0;
    let removed = 0;
    currentEntries.forEach((entry) => {
      if (!latestEntries.has(entry)) addedOrChanged += 1;
    });
    latestEntries.forEach((entry) => {
      if (!currentEntries.has(entry)) removed += 1;
    });
    const messages: string[] = [];
    if (latestDropboxFolderName && latestDropboxFolderName !== dropboxDisplayedFolderName) {
      messages.push(`назва папки зміниться на «${dropboxDisplayedFolderName}»`);
    }
    if (addedOrChanged > 0) {
      messages.push(`оновиться ${addedOrChanged} ${addedOrChanged === 1 ? "файл" : "файли"}`);
    }
    if (removed > 0) {
      messages.push(`з експорту зникне ${removed} ${removed === 1 ? "файл" : "файли"}`);
    }
    return messages;
  }, [currentDropboxPlanSignature, dropboxDisplayedFolderName, latestDropboxFolderName, latestDropboxPlanSignature]);
  const dropboxSyncState = useMemo(() => {
    const hasExportedState = !!latestDropboxFolderPath && latestDropboxExports.length > 0;
    if (!hasExportedState) return "not_exported" as const;
    if (dropboxFolderReachable === false) return "stale" as const;
    return latestDropboxPlanSignature === currentDropboxPlanSignature ? ("synced" as const) : ("stale" as const);
  }, [currentDropboxPlanSignature, dropboxFolderReachable, latestDropboxExports.length, latestDropboxFolderPath, latestDropboxPlanSignature]);
  const dropboxStatusLabel =
    dropboxSyncState === "synced"
      ? "У Dropbox актуально"
      : dropboxSyncState === "stale"
        ? "Є нові зміни"
        : "Ще не експортовано";
  const dropboxStatusToneClass =
    dropboxSyncState === "synced"
      ? "border-success/20 bg-success/5 text-success-foreground"
      : dropboxSyncState === "stale"
        ? "border-amber-300/50 bg-amber-50/90 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-border/60 bg-background/70 text-muted-foreground";
  const latestDropboxExportedLabel = useMemo(() => {
    if (!latestDropboxExportedAt) return null;
    const date = new Date(latestDropboxExportedAt);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, "dd.MM.yyyy, HH:mm");
  }, [latestDropboxExportedAt]);

  const inspectDropboxFolder = useCallback(async (path: string) => {
    const response = await fetch(
      `/.netlify/functions/dropbox-manage?action=inspect&path=${encodeURIComponent(path)}`
    );
    const payload = (await response.json().catch(() => null)) as { sharedUrl?: string | null; error?: string | null } | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.error || "Не вдалося отримати Dropbox-папку.");
    }
    return payload.sharedUrl?.trim() || "";
  }, []);

  useEffect(() => {
    let active = true;
    if (!latestDropboxFolderPath) {
      setDropboxFolderReachable(null);
      return () => {
        active = false;
      };
    }
    setDropboxFolderReachable(null);
    void inspectDropboxFolder(latestDropboxFolderPath)
      .then(() => {
        if (active) setDropboxFolderReachable(true);
      })
      .catch(() => {
        if (active) setDropboxFolderReachable(false);
      });
    return () => {
      active = false;
    };
  }, [inspectDropboxFolder, latestDropboxFolderPath]);

  const openDropboxOrderFolder = useCallback(async () => {
    const targetUrl = latestDropboxFolderSharedUrl || (latestDropboxFolderPath ? await inspectDropboxFolder(latestDropboxFolderPath) : "");
    if (!targetUrl) {
      toast.error("Папка Dropbox ще не підготовлена.");
      return;
    }
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [inspectDropboxFolder, latestDropboxFolderPath, latestDropboxFolderSharedUrl]);

  const openDropboxExportDialog = useCallback(() => {
    setDropboxFolderDraft(dropboxDisplayedFolderName);
    setDropboxFolderError(null);
    setDropboxFolderDialogOpen(true);
  }, [dropboxDisplayedFolderName]);

  const createDropboxClientFolder = useCallback(
    async (options?: { openExportDialog?: boolean }) => {
      const currentTask = task;
      if (!currentTask || !effectiveTeamId) return;

      const customerName = (currentTask.customerName ?? "").trim();
      if (!customerName) {
        toast.error("Не вдалося визначити назву замовника для Dropbox.");
        return;
      }

      if (!ensureCanEdit()) return;

      setDropboxFolderError(null);
      setDropboxExporting(true);
      try {
        const response = await fetch("/.netlify/functions/dropbox-manage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create-client",
            clientName: customerName,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              clientPath?: string | null;
              brandPath?: string | null;
              clientSharedUrl?: string | null;
              error?: string | null;
            }
          | null;
        if (!response.ok || !payload?.ok || !payload.clientPath) {
          throw new Error(payload?.error || "Не вдалося створити Dropbox-папку замовника.");
        }

        const nextClientPath = payload.clientPath.trim();
        const nextBrandPath = (payload.brandPath ?? buildDropboxBrandFolderPath(nextClientPath)).trim();
        const nextSharedUrl = payload.clientSharedUrl?.trim() || "";

        const updatePayload = {
          dropbox_client_path: nextClientPath,
          dropbox_brand_path: nextBrandPath,
          dropbox_shared_url: nextSharedUrl || null,
        };
        if (currentTask.customerId) {
          const { error: updateError } = await supabase
            .schema("tosho")
            .from("customers")
            .update(updatePayload)
            .eq("id", currentTask.customerId);
          if (updateError) {
            const message = updateError.message ?? "";
            if (!(/column/i.test(message) && /dropbox_/i.test(message))) {
              throw updateError;
            }
          }
        }

        const nextMetadata = {
          ...(currentTask.metadata ?? {}),
          dropbox_client_path: nextClientPath,
          dropbox_brand_path: nextBrandPath,
          dropbox_client_shared_url: nextSharedUrl || null,
        };
        const { error: taskUpdateError } = await supabase
          .from("activity_log")
          .update({ metadata: nextMetadata })
          .eq("id", currentTask.id)
          .eq("team_id", effectiveTeamId);
        if (taskUpdateError) throw taskUpdateError;

        setDropboxClientPath(nextClientPath);
        setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
        toast.success("Dropbox-папку замовника створено");
        if (options?.openExportDialog) {
          setDropboxFolderDraft(dropboxDisplayedFolderName);
          setDropboxFolderDialogOpen(true);
        }
      } catch (error) {
        const fallbackPath = buildDropboxClientFolderPath(customerName);
        try {
          const fallbackUrl = await inspectDropboxFolder(fallbackPath);
          if (currentTask.customerId) {
            const { error: updateError } = await supabase
              .schema("tosho")
              .from("customers")
              .update({
                dropbox_client_path: fallbackPath,
                dropbox_brand_path: buildDropboxBrandFolderPath(fallbackPath),
                dropbox_shared_url: fallbackUrl || null,
              })
              .eq("id", currentTask.customerId);
            if (updateError) {
              const message = updateError.message ?? "";
              if (!( /column/i.test(message) && /dropbox_/i.test(message) )) {
                throw updateError;
              }
            }
          }
          const nextMetadata = {
            ...(currentTask.metadata ?? {}),
            dropbox_client_path: fallbackPath,
            dropbox_brand_path: buildDropboxBrandFolderPath(fallbackPath),
            dropbox_client_shared_url: fallbackUrl || null,
          };
          const { error: taskUpdateError } = await supabase
            .from("activity_log")
            .update({ metadata: nextMetadata })
            .eq("id", currentTask.id)
            .eq("team_id", effectiveTeamId);
          if (taskUpdateError) throw taskUpdateError;
          setDropboxClientPath(fallbackPath);
          setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
          toast.success("Dropbox-папку замовника підхоплено");
          if (options?.openExportDialog) {
            setDropboxFolderDraft(dropboxDisplayedFolderName);
            setDropboxFolderDialogOpen(true);
          }
          return;
        } catch {
          const message = getErrorMessage(error, "Не вдалося створити Dropbox-папку замовника");
          setDropboxFolderError(message);
          toast.error(message);
        }
      } finally {
        setDropboxExporting(false);
      }
    },
    [dropboxDisplayedFolderName, ensureCanEdit, inspectDropboxFolder, task?.customerId, task?.customerName]
  );

  const handleExportToDropbox = useCallback(async () => {
    if (!task || !effectiveTeamId || !dropboxClientPath) return;
    if (!ensureCanEdit()) return;

    const normalizedFolderName = normalizeDropboxFolderNameDraft(dropboxFolderDraft);
    if (!normalizedFolderName) {
      setDropboxFolderError("Вкажіть назву папки замовлення.");
      return;
    }
    if (dropboxExportWarnings.length > 0) {
      setDropboxFolderError(dropboxExportWarnings[0]);
      return;
    }
    if (dropboxExportPlan.length === 0) {
      setDropboxFolderError("Немає файлів для експорту в Dropbox.");
      return;
    }

    setDropboxFolderError(null);
    setDropboxExporting(true);

    try {
      const projectResponse = await fetch("/.netlify/functions/dropbox-manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create-project",
          clientPath: dropboxClientPath,
          projectName: normalizedFolderName,
        }),
      });
      const projectPayload = (await projectResponse.json().catch(() => null)) as
        | { projectPath?: string | null; projectSharedUrl?: string | null; error?: string | null }
        | null;
      if (!projectResponse.ok || !projectPayload?.projectPath) {
        throw new Error(projectPayload?.error || "Не вдалося підготувати Dropbox-папку замовлення.");
      }

      const projectPath = projectPayload.projectPath.trim();
      const filesPayload = [];
      for (const entry of dropboxExportPlan) {
        const signedUrl = await getSignedAttachmentUrl(
          entry.file.storage_bucket,
          entry.file.storage_path,
          "original",
          60 * 60 * 24 * 7
        );
        if (!signedUrl) {
          throw new Error(`Не вдалося підготувати файл «${entry.file.file_name}» до експорту.`);
        }
        const fileName = buildDropboxExportFileName({
          clientLabel: dropboxClientLabel,
          outputKind: entry.outputKind,
          projectName: normalizedFolderName,
          orderNumber: dropboxOrderNumber,
          dateLabel: dropboxDateLabel,
          extension: getDropboxFileExtension(entry.file.file_name),
          archiveVersion: entry.role === "archive" ? entry.archiveVersion : undefined,
        });
        filesPayload.push({
          sourceUrl: signedUrl,
          sourceFileId: entry.file.id,
          fileName,
          outputKind: entry.outputKind,
          role: entry.role,
          targetPath: `${projectPath}/${entry.role === "final" ? "Фінал" : "Архів"}/${fileName}`,
        });
      }

      const exportResponse = await fetch("/.netlify/functions/dropbox-export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectPath,
          files: filesPayload,
        }),
      });
      const exportPayload = (await exportResponse.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string | null;
            projectSharedUrl?: string | null;
            uploaded?: Array<{
              sourceFileId?: string | null;
              fileName?: string | null;
              outputKind?: string | null;
              role?: string | null;
              dropboxPath?: string | null;
              dropboxSharedUrl?: string | null;
            }>;
          }
        | null;
      if (!exportResponse.ok || !exportPayload?.ok) {
        throw new Error(exportPayload?.error || "Не вдалося експортувати файли в Dropbox.");
      }

      const actorLabel = userId ? getMemberLabel(userId) : "System";
      const nowIso = new Date().toISOString();
      const nextMetadata = {
        ...(task.metadata ?? {}),
        dropbox_order_folder_name: normalizedFolderName,
        dropbox_order_folder_path: projectPath,
        dropbox_order_folder_shared_url: exportPayload.projectSharedUrl ?? projectPayload.projectSharedUrl ?? null,
        dropbox_last_exported_at: nowIso,
        dropbox_exports: (exportPayload.uploaded ?? []).map((file) => ({
          source_file_id: file.sourceFileId ?? null,
          file_name: file.fileName ?? null,
          output_kind: file.outputKind ?? null,
          role: file.role ?? null,
          dropbox_path: file.dropboxPath ?? null,
          dropbox_shared_url: file.dropboxSharedUrl ?? null,
          exported_at: nowIso,
        })),
      };

      const { error: updateError } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", task.id)
        .eq("team_id", effectiveTeamId);
      if (updateError) throw updateError;

      setTask((prev) => (prev ? { ...prev, metadata: nextMetadata } : prev));
      setDropboxFolderDialogOpen(false);

      await logDesignTaskActivity({
        teamId: effectiveTeamId,
        designTaskId: task.id,
        quoteId: task.quoteId,
        userId,
        actorName: actorLabel,
        action: "design_output_selection",
        title: `Dropbox: експортовано ${filesPayload.length} файлів у «${normalizedFolderName}»`,
        metadata: {
          source: "dropbox_export",
          dropbox_order_folder_name: normalizedFolderName,
          dropbox_order_folder_path: projectPath,
          exported_count: filesPayload.length,
        },
      });
      await loadHistory(task.id);
      toast.success(`Експортовано в Dropbox: ${filesPayload.length} файлів`);
    } catch (error) {
      const message = getErrorMessage(error, "Не вдалося експортувати файли в Dropbox");
      setDropboxFolderError(message);
      toast.error(message);
    } finally {
      setDropboxExporting(false);
    }
  }, [
    dropboxClientLabel,
    dropboxClientPath,
    dropboxDateLabel,
    dropboxExportPlan,
    dropboxExportWarnings,
    dropboxFolderDraft,
    dropboxOrderNumber,
    effectiveTeamId,
    ensureCanEdit,
    task,
    userId,
  ]);

  if (loading) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо дизайн-задачу." />;
  }

  if (error || !task) {
    return (
      <div className="p-6 text-destructive">
        Помилка: {error ?? "Задачу не знайдено"}
      </div>
    );
  }

  const isLinkedQuote = isUuid(task.quoteId);
  const taskHeaderTitle = getTaskDisplayNumber(task);
  const taskHeaderName = task.title?.trim() || "Без назви";
  const taskHeaderSubtitle = isLinkedQuote
    ? `${task.customerName ?? "Замовник"} · ${quoteItem?.name ?? "Позиція"}`
    : `${task.customerName ?? "Замовник"} · Дизайн-задача без прорахунку`;
  const taskManagerUserId =
    typeof task.metadata?.manager_user_id === "string" && task.metadata.manager_user_id
      ? (task.metadata.manager_user_id as string)
      : task.quoteManagerUserId ?? null;
  const taskOwnerRole = getTaskOwnerRole(task.metadata, task.creatorUserId ?? null, memberRoleById);
  const taskRoleLabel = taskOwnerRole === "designer" ? "Дизайнер" : "Менеджер";
  const taskRoleLabelLower = taskOwnerRole === "designer" ? "дизайнера" : "менеджера";
  const taskManagerLabel =
    (typeof task.metadata?.manager_label === "string" && task.metadata.manager_label.trim()) ||
    (taskManagerUserId ? getMemberLabel(taskManagerUserId) : "Не вказано");
  const taskManagerAvatar = taskManagerUserId ? getMemberAvatar(taskManagerUserId) : null;
  const canEditTaskTitle = !!task && !!userId && (task.assigneeUserId === userId || canManageAssignments);
  const startInlineTitleEdit = () => {
    if (!canEditTaskTitle) return;
    setRenameError(null);
    setTitleDraft(task?.title ?? "");
    setTitleEditing(true);
  };
  const cancelInlineTitleEdit = () => {
    setTitleDraft(task?.title ?? "");
    setRenameError(null);
    setTitleEditing(false);
  };
  const handleInlineTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitRenameDialog(titleDraft);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineTitleEdit();
    }
  };

  const renderDesignOutputSection = (kind: DesignOutputKind) => {
    const groupedOutputs = groupedDesignOutputsByKind[kind];
    const selectedIdSet = kind === "visualization" ? selectedVisualizationOutputFileIdSet : selectedLayoutOutputFileIdSet;
    const selectedIds = kind === "visualization" ? selectedVisualizationOutputFileIds : selectedLayoutOutputFileIds;
    const requiresThisKind = kind === "visualization" ? requiresVisualizationOutput : requiresLayoutOutput;
    const kindLabel = DESIGN_OUTPUT_KIND_LABELS[kind];
    const kindIcon =
      kind === "visualization" ? <ImageIcon className="h-4 w-4 text-sky-600" /> : <PencilLine className="h-4 w-4 text-emerald-600" />;

    return (
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {kindIcon}
              <div className="text-sm font-semibold text-foreground">{kindLabel}</div>
              <Badge variant={requiresThisKind ? "default" : "outline"} className="text-[10px]">
                {requiresThisKind ? "Обов'язково для погодження" : "Опціонально"}
              </Badge>
              {selectedIds.length > 0 ? (
                <Badge variant="outline" className="text-[10px] border-success/40 bg-success/10 text-success-foreground">
                  Погоджено: {selectedIds.length}
                </Badge>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              {kind === "visualization"
                ? "Тут має бути превʼю виробу або нанесення, яке погоджує замовник."
                : "Тут має бути фінальний друкарський / виробничий макет."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={outputUploading || outputSaving}
              onClick={() => {
                setUploadTargetKind(kind);
                outputInputRef.current?.click();
              }}
            >
              {outputUploading && uploadTargetKind === kind ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Завантажити {kindLabel.toLowerCase()}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-2"
              disabled={outputSaving}
              onClick={() => openAddDesignLinkModal(kind)}
            >
              <Link2 className="h-4 w-4" />
              Додати посилання
            </Button>
          </div>
        </div>

        {groupedOutputs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 px-3 py-3 text-sm text-muted-foreground">
            {kind === "visualization"
              ? "Поки що не додано жодного візуалу. Для друку в замовлення має бути окремо погоджений візуал."
              : "Поки що не додано жодного макета. Для запуску в замовлення має бути окремо погоджений макет."}
          </div>
        ) : (
          <div className="space-y-2">
            {groupedOutputs.map((group) => {
              const selectedCountInGroup = selectedGroupingItems.filter((item) => item.groupKey === group.key).length;
              const hasSelection = groupingSelectionIds.length > 0;
              const allSelectedAlreadyInGroup = hasSelection && selectedCountInGroup === groupingSelectionIds.length;
              const canUngroup = group.key !== "__ungrouped__" && selectedCountInGroup > 0;
              return (
                <div key={`${kind}:${group.key}`} className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-foreground">{group.label}</div>
                      <Badge variant="outline" className="text-[10px]">
                        {group.files.length + group.links.length} матеріалів
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {canUngroup ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={outputSaving}
                          onClick={() => void handleUngroupSelectedOutputsFromGroup(group.key)}
                        >
                          Забрати з групи
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={outputSaving || groupingSelectionIds.length === 0 || allSelectedAlreadyInGroup}
                        onClick={() => void handleMoveSelectedOutputsToSpecificGroup(group.key === "__ungrouped__" ? null : group.label)}
                      >
                        Перемістити сюди
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {group.files.map((file) => {
                      const ext = getFileExtension(file.file_name);
                      const previewableFile = canRenderStoragePreview(ext) && Boolean(file.storage_bucket && file.storage_path);
                      return (
                        <div key={file.id} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex items-start gap-2.5">
                              {previewableFile ? (
                                <StorageObjectImage
                                  bucket={file.storage_bucket}
                                  path={file.storage_path}
                                  alt={file.file_name ?? "Файл"}
                                  variant="thumb"
                                  hoverPreview
                                  className="h-11 w-11 shrink-0 rounded-md border border-border/60 bg-muted/30"
                                />
                              ) : (
                                <div className="h-11 w-11 rounded-md border border-border/60 bg-muted/30 text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
                                  {ext}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium" title={file.file_name}>
                                  {file.file_name}
                                </div>
                                {selectedIdSet.has(file.id) ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 h-5 border-success/40 bg-success/10 text-[10px] text-success-foreground"
                                  >
                                    Погоджено замовником
                                  </Badge>
                                ) : null}
                                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                                  <span>{formatFileSize(file.file_size)}</span>
                                  <span>·</span>
                                  <span>{formatDate(file.created_at, true)}</span>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <AvatarBase
                                      src={file.uploaded_by ? getMemberAvatar(file.uploaded_by) : null}
                                      name={file.uploaded_by ? getMemberLabel(file.uploaded_by) : "Невідомий"}
                                      fallback={getInitials(file.uploaded_by ? getMemberLabel(file.uploaded_by) : "Невідомий")}
                                      size={14}
                                      className="shrink-0 border-border/70"
                                    />
                                    <span>{file.uploaded_by ? getMemberLabel(file.uploaded_by) : "Невідомий"}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground mr-1">
                                <Checkbox
                                  checked={groupingSelectionIds.includes(`file:${file.id}`)}
                                  disabled={outputSaving}
                                  onCheckedChange={() => toggleGroupingSelection(`file:${file.id}`)}
                                  aria-label={`Вибрати для групи: ${file.file_name}`}
                                />
                                <span>До групи</span>
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground mr-1">
                                <Checkbox
                                  checked={selectedIdSet.has(file.id)}
                                  disabled={outputSaving || !canManageAssignments}
                                  onCheckedChange={() => void handleSelectDesignOutputFile(file.id, kind)}
                                  aria-label={`Погодити ${kindLabel.toLowerCase()}: ${file.file_name}`}
                                />
                                <span>Погоджено</span>
                              </label>
                              {file.storage_bucket && file.storage_path ? (
                                <>
                                  <Button size="icon" variant="ghost" aria-label="Переглянути файл" onClick={() => void openStorageFilePreview(file)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" aria-label="Завантажити файл" onClick={() => void downloadStorageBackedFile(file)}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button size="icon" variant="ghost" disabled>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" disabled>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={outputSaving}
                                onClick={() => void handleRemoveDesignFile(file.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {group.links.map((link) => (
                      <div key={link.id} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                            title={link.url}
                          >
                            {link.label}
                          </a>
                          <div className="flex items-center gap-1 shrink-0">
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground mr-1">
                              <Checkbox
                                checked={groupingSelectionIds.includes(`link:${link.id}`)}
                                disabled={outputSaving}
                                onCheckedChange={() => toggleGroupingSelection(`link:${link.id}`)}
                                aria-label={`Вибрати для групи: ${link.label}`}
                              />
                              <span>До групи</span>
                            </label>
                            <Button size="icon" variant="ghost" asChild>
                              <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Відкрити посилання">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Скопіювати посилання"
                              onClick={() => void copyText(link.url).catch(() => toast.error("Не вдалося скопіювати посилання"))}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={outputSaving}
                              onClick={() => void handleRemoveDesignLink(link.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                          <span>{formatDate(link.created_at, true)}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <AvatarBase
                              src={link.created_by ? getMemberAvatar(link.created_by) : null}
                              name={link.created_by ? getMemberLabel(link.created_by) : "Невідомий"}
                              fallback={getInitials(link.created_by ? getMemberLabel(link.created_by) : "Невідомий")}
                              size={14}
                              className="shrink-0 border-border/70"
                            />
                            <span>{link.created_by ? getMemberLabel(link.created_by) : "Невідомий"}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-none px-0 pb-20 md:pb-0 space-y-4">
      <EntityHeader
        topBar={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/design")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              До дошки
            </Button>
            <Badge variant="outline" className="gap-1 text-xs">
              <Palette className="h-3.5 w-3.5" />
              Дизайн задача
            </Badge>
          </>
        }
        title={
          <div className="flex flex-wrap items-center gap-2 leading-none">
            <HoverCopyText
              value={taskHeaderTitle}
              className="max-w-full"
              textClassName="font-mono text-[22px] text-primary font-medium tracking-tight leading-none"
              buttonStyle="overlay"
              buttonClassName="h-6 w-6 rounded-md"
              successMessage="Номер дизайн-задачі скопійовано"
              copyLabel="Скопіювати номер дизайн-задачі"
            >
              {taskHeaderTitle}
            </HoverCopyText>
            <span className="text-foreground/45 leading-none">-</span>
            {titleEditing ? (
              <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(event) => {
                      setTitleDraft(event.target.value);
                      if (renameError) setRenameError(null);
                    }}
                    onKeyDown={handleInlineTitleKeyDown}
                    disabled={renameSaving || designTaskLockedByOther}
                    className="h-12 text-2xl font-medium tracking-tight md:h-12"
                    placeholder="Вкажіть назву задачі"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 shrink-0"
                    onClick={() => void submitRenameDialog(titleDraft)}
                    disabled={renameSaving || designTaskLockedByOther}
                    title="Зберегти назву"
                  >
                    {renameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 shrink-0"
                    onClick={cancelInlineTitleEdit}
                    disabled={renameSaving}
                    title="Скасувати редагування"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {renameError ? <div className="text-xs text-destructive">{renameError}</div> : null}
              </div>
            ) : (
              <span className="relative -top-[1px] min-w-0 break-words font-medium leading-none">{taskHeaderName}</span>
            )}
            {canEditTaskTitle ? (
              !titleEditing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={startInlineTitleEdit}
                  disabled={renameSaving || designTaskLockedByOther}
                  title="Редагувати назву"
                >
                  <PencilLine className="h-4 w-4" />
                </Button>
              ) : null
            ) : null}
          </div>
        }
        subtitle={taskHeaderSubtitle}
        viewers={<EntityViewersBar entries={designTaskViewers} label="Переглядають задачу" />}
        meta={
          <>
            <Badge className={cn("px-2.5 py-1 text-xs font-semibold", statusColors[task.status])}>
              {statusLabels[task.status]}
            </Badge>
            <Badge variant="outline" className="px-2.5 py-1 text-xs gap-1.5">
              <AvatarBase
                src={getMemberAvatar(task.assigneeUserId)}
                name={getMemberLabel(task.assigneeUserId)}
                fallback={getInitials(getMemberLabel(task.assigneeUserId))}
                size={16}
                className="border-border/70"
              />
              <span className="truncate max-w-[160px]">{getMemberLabel(task.assigneeUserId)}</span>
            </Badge>
            <Popover open={headerTypePopoverOpen} onOpenChange={setHeaderTypePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1.5"
                  disabled={typeSaving || designTaskLockedByOther}
                >
                  {task.designTaskType ? (
                    (() => {
                      const TypeIcon = DESIGN_TASK_TYPE_ICONS[task.designTaskType];
                      return <TypeIcon className="h-3.5 w-3.5" />;
                    })()
                  ) : (
                    <Palette className="h-3.5 w-3.5" />
                  )}
                  <span>{task.designTaskType ? DESIGN_TASK_TYPE_LABELS[task.designTaskType] : "Тип задачі"}</span>
                  {typeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="space-y-1">
                  {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
                    const TypeIcon = DESIGN_TASK_TYPE_ICONS[option.value];
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-full justify-start gap-2 text-sm"
                        disabled={typeSaving || task.designTaskType === option.value}
                        onClick={() => void applyTaskType(option.value)}
                      >
                        <TypeIcon className="h-3.5 w-3.5" />
                        <span>{option.label}</span>
                        {task.designTaskType === option.value ? <Check className="ml-auto h-4 w-4" /> : null}
                      </Button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={headerDeadlinePopoverOpen} onOpenChange={setHeaderDeadlinePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("h-7 px-2.5 text-xs gap-1", deadlineLabel.className)}
                  disabled={deadlineSaving || designTaskLockedByOther}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Дедлайн: {deadlineLabel.label}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] max-w-[calc(100vw-2rem)] p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deadlineDraftDate}
                  onSelect={(date) => {
                    setDeadlineDraftDate(date ?? undefined);
                  }}
                  captionLayout="dropdown-buttons"
                  fromYear={new Date().getFullYear() - 3}
                  toYear={new Date().getFullYear() + 5}
                  initialFocus
                />
                <div className="space-y-2 border-t border-border/50 px-2 py-3">
                  <Input
                    value={deadlineTime}
                    onChange={(event) => setDeadlineTime(normalizeDeadlineTimeInput(event.target.value))}
                    onBlur={() => {
                      setDeadlineTime((prev) => (isValidDeadlineTime(prev) ? prev : "12:00"));
                    }}
                    placeholder="HH:MM"
                    className="h-9 text-sm"
                  />
                  <div className="grid w-full grid-cols-4 gap-1.5">
                    {DEADLINE_PRESET_TIMES.map((time) => (
                      <Button
                        key={time}
                        type="button"
                        size="xs"
                        variant={deadlineTime === time ? "secondary" : "outline"}
                        className="w-full justify-center"
                        onClick={() => setDeadlineTime(time)}
                      >
                        {time}
                      </Button>
                    ))}
                  </div>
                </div>
                <DateQuickActions
                  fullWidth
                  onSelect={(date) => {
                    setDeadlineDraftDate(date ?? undefined);
                  }}
                />
                <div className="flex items-center justify-end gap-2 border-t border-border/50 px-2 py-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setHeaderDeadlinePopoverOpen(false)}
                    disabled={deadlineSaving}
                  >
                    Скасувати
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={applyDeadlineDraft}
                    disabled={deadlineSaving}
                  >
                    Зберегти
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Badge
              variant="outline"
              className={cn(
                "px-2.5 py-1 text-xs gap-1",
                isTimerRunning ? "border-success-soft-border text-success-foreground bg-success-soft" : ""
              )}
            >
              <Timer className="h-3.5 w-3.5" />
              {timerElapsedLabel}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              disabled={designTaskLockedByOther}
              onClick={() => void openManualEstimateDialog()}
            >
              <Clock className="h-3.5 w-3.5" />
              {estimateLabel === "Не вказано" ? "Додати естімейт" : `Естімейт: ${estimateLabel}`}
            </Button>
          </>
        }
        actions={
          <>
            {isLinkedQuote ? (
              <Button variant="outline" className="gap-2" onClick={() => navigate(`/orders/estimates/${task.quoteId}`)}>
                <ExternalLink className="h-4 w-4" />
                Відкрити прорахунок
              </Button>
            ) : (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setAttachQuoteDialogOpen(true)}
              >
                <Link2 className="h-4 w-4" />
                Привʼязати до прорахунку
              </Button>
            )}
            <Button disabled={primaryActionDisabled || designTaskLockedByOther} onClick={primaryActionClick ?? undefined}>
              {primaryActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {primaryActionLabel}
            </Button>
          </>
        }
        hint={primaryActionHint}
      />

      {designTaskLockedByOther ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <span className="font-medium">Режим лише перегляду.</span>{" "}
          ТЗ редагує {designTaskLock.holderName ?? "інший користувач"}.
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.15fr)_minmax(320px,1fr)] gap-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Бриф задачі</div>
              {isLinkedQuote && quantityLabel !== "Не вказано" ? (
                <Badge variant="outline" className="text-xs">
                  {quantityLabel}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                <div className="text-xs text-muted-foreground mb-1">Замовник</div>
                <button
                  type="button"
                  onClick={() => setPartyCardOpen(true)}
                  className="flex items-center gap-2.5 rounded-lg border border-transparent px-1 py-1 text-left transition-colors hover:border-border/60 hover:bg-muted/20"
                >
                  <EntityAvatar
                    src={task.customerLogoUrl ?? null}
                    name={task.customerName ?? undefined}
                    fallback={getInitials(task.customerName)}
                    size={28}
                  />
                  <div className="font-medium">{task.customerName ?? "Не вказано"}</div>
                </button>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                <div className="text-xs text-muted-foreground mb-1">{taskRoleLabel}</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <AvatarBase
                      src={taskManagerAvatar}
                      name={taskManagerLabel}
                      fallback={getInitials(taskManagerLabel)}
                      size={28}
                      className="border-border/70"
                    />
                    <div className="font-medium">{taskManagerLabel}</div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full justify-start"
                        disabled={managerSaving || designTaskLockedByOther || managerMembers.length === 0}
                      >
                        {managerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {`Змінити ${taskRoleLabelLower}`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuLabel>{`Відповідальний ${taskRoleLabelLower}`}</DropdownMenuLabel>
                      {managerMembers.map((member) => (
                        <DropdownMenuItem
                          key={member.id}
                          onClick={() => void applyManager(member.id)}
                          disabled={taskManagerUserId === member.id || managerSaving}
                          className="gap-2"
                        >
                          <AvatarBase
                            src={getMemberAvatar(member.id)}
                            name={member.label}
                            fallback={getInitials(member.label)}
                            size={18}
                            className="shrink-0 border-border/70"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <span className="truncate">{member.label}</span>
                          <Check
                            className={cn(
                              "ml-auto h-3.5 w-3.5 text-primary",
                              taskManagerUserId === member.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void applyManager(null)}
                        disabled={!taskManagerUserId || managerSaving}
                      >
                        <span className="truncate">{`Очистити ${taskRoleLabelLower}`}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {isLinkedQuote ? (
                <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Позиція</div>
                  <div className="flex items-center gap-2.5">
                    {productPreviewUrl ? (
                      <KanbanImageZoomPreview
                        imageUrl={productPreviewUrl}
                        zoomImageUrl={productZoomPreviewUrl ?? productPreviewUrl}
                        alt={quoteItem?.name ?? "Товар"}
                        className="h-10 w-10 rounded-md border border-border/60 bg-muted/30"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md border border-border/60 bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="font-medium">{quoteItem?.name ?? "Не вказано"}</div>
                  </div>
                </div>
              ) : null}
              {isLinkedQuote ? (
                <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Прорахунок</div>
                  <HoverCopyText
                    value={getTaskDisplayNumber(task)}
                    textClassName="font-mono font-medium"
                    successMessage="Номер прорахунку скопійовано"
                    copyLabel="Скопіювати номер прорахунку"
                  >
                    {getTaskDisplayNumber(task)}
                  </HoverCopyText>
                </div>
              ) : null}
              <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
                <div className="text-xs text-muted-foreground mb-1">Створено</div>
                <div className="font-medium">{formatDate(task.createdAt, true)}</div>
              </div>
            </div>
            {task.status === "changes" ? (
              <div className="rounded-lg border border-warning-soft-border bg-warning-soft p-3 text-sm text-warning-foreground">
                {task.title ?? "Замовник надіслав правки, перевірте деталі та оновіть макет."}
              </div>
            ) : null}
            <div className="rounded-lg border border-border/50 bg-muted/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground">ТЗ для дизайнера</div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge variant="outline" className="h-7">v{activeBriefVersion?.version ?? 1} активна</Badge>
                  <Button size="sm" variant="outline" onClick={() => setBriefEditorOpen(true)}>
                    Відкрити редактор
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                {briefInlineEditing || briefDirty ? (
                  <Textarea
                    ref={briefTextareaRef}
                    value={briefDraft}
                    onChange={(event) => {
                      setBriefDraft(event.target.value);
                      setBriefDirty(true);
                      resizeTextareaToContent(event.currentTarget, BRIEF_INLINE_TEXTAREA_MAX_HEIGHT);
                    }}
                    onBlur={handleBriefInlineBlur}
                    placeholder="Опишіть задачу для дизайнера…"
                    rows={5}
                    disabled={briefSaving || designTaskLockedByOther}
                    className="min-h-[140px] resize-none"
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full rounded-[var(--radius-lg)] border border-input bg-background px-3 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-readonly="true"
                    onClick={() => setBriefInlineEditing(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setBriefInlineEditing(true);
                      }
                    }}
                  >
                    <div className="min-h-[140px] text-sm text-foreground">{renderBriefRichText(briefDraft)}</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={() => void saveDesignBrief()}
                    disabled={briefSaving || designTaskLockedByOther || !briefDirty}
                  >
                    {briefSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Зберегти нову версію
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={changeRequestSaving || designTaskLockedByOther}
                    onClick={() => setChangeRequestOpen((prev) => !prev)}
                  >
                    Додати правку
                  </Button>
                  {briefDirty ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={briefSaving || designTaskLockedByOther}
                      onClick={() => {
                        setBriefDraft(activeBriefVersion?.brief ?? task.designBrief ?? "");
                        setBriefDirty(false);
                        setBriefInlineEditing(false);
                      }}
                    >
                      Скасувати
                    </Button>
                  ) : null}
                </div>

                {briefChangeRequests.length > 0 ? (
                  <div className="rounded-md border border-border/60 bg-background/50 p-3 space-y-2">
                    <div className="text-xs text-muted-foreground">Останні правки ({briefChangeRequests.length})</div>
                    <div className="space-y-1.5">
                      {briefChangeRequests.slice(0, 3).map((request) => (
                        <div key={request.id} className="text-sm whitespace-pre-wrap break-words">
                          <span className="text-muted-foreground">
                            {formatDate(request.requested_at, true)} · {request.requested_by_label ?? "Користувач"}:
                          </span>{" "}
                          <span>{renderInlineRichText(request.request_text)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {changeRequestOpen ? (
                  <div className="rounded-md border border-border/60 bg-background/70 p-3 space-y-2">
                    <Textarea
                      value={changeRequestDraft}
                      onChange={(event) => setChangeRequestDraft(event.target.value)}
                      placeholder="Опишіть правку…"
                      disabled={changeRequestSaving || designTaskLockedByOther}
                      className="resize-y min-h-[140px]"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void createBriefChangeRequest()}
                        disabled={changeRequestSaving || designTaskLockedByOther || !changeRequestDraft.trim()}
                      >
                        {changeRequestSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Ок
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={changeRequestSaving || designTaskLockedByOther}
                        onClick={() => {
                          setChangeRequestDraft("");
                          setChangeRequestOpen(false);
                        }}
                      >
                        Скасувати
                      </Button>
                    </div>
                  </div>
                ) : null}

                {hasBriefHistory ? (
                <div className="pt-1 space-y-2">
                  <div className="text-xs text-muted-foreground">Історія версій ({briefVersions.length})</div>
                  {briefVersions.length > 1 ? (
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {[...briefVersions].reverse().map((version) => (
                        <div key={version.id} className="rounded-md border border-border/60 bg-background/60 p-3 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">v{version.version}</div>
                            <div className="text-xs text-muted-foreground">{formatDate(version.created_at, true)}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {version.created_by_label ?? "System"}
                            {version.change_request_id ? " • з правки" : ""}
                          </div>
                          {version.change_request_id && briefChangeRequestById.get(version.change_request_id)?.request_text ? (
                            <div className="text-sm whitespace-pre-wrap break-words">
                              Правка: {renderInlineRichText(briefChangeRequestById.get(version.change_request_id)?.request_text ?? "")}
                            </div>
                          ) : null}
                          <div className="text-sm break-words">{renderBriefRichText(version.brief)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
                      Історія версій зʼявиться після першого збереження.
                    </div>
                  )}
                </div>
                ) : null}
              </div>
            </div>
          </div>

          {isLinkedQuote ? (
            <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Нанесення</div>
                {task.methodsCount ? <Badge variant="outline">{task.methodsCount} нанес.</Badge> : null}
              </div>
              {methods.length > 0 ? (
                <div className="space-y-2">
                  {methods.map((method, idx) => (
                    <div key={idx} className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm">
                      <div className="font-medium">Метод {idx + 1}: {getMethodLabel(method.method_id ?? null)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                      Позиція: {getPrintPositionLabel(method.print_position_id ?? null)} · Розмір: {method.print_width_mm ?? "не вказано"} ×{" "}
                      {method.print_height_mm ?? "не вказано"} мм
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                  Немає даних про нанесення для цієї задачі.
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Результат дизайнера</div>
              <Badge variant="outline" className="text-xs">
                {designOutputFiles.length + designOutputLinks.length} матеріалів
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={uploadTargetGroup} onValueChange={setUploadTargetGroup}>
                <SelectTrigger className="w-full sm:min-w-[220px] sm:w-auto">
                  <SelectValue placeholder="Група для завантаження" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без групи</SelectItem>
                  {designOutputGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={outputInputRef}
                type="file"
                className="hidden"
                multiple
                accept="*/*"
                onChange={(event) => void handleUploadDesignOutputs(event.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={outputUploading || outputSaving}
                onClick={() => outputInputRef.current?.click()}
              >
                {outputUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Завантажити {DESIGN_OUTPUT_KIND_LABELS[uploadTargetKind].toLowerCase()}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={outputSaving || groupingSelectionIds.length === 0}
                onClick={() => void handleMoveSelectedOutputsToGroup()}
              >
                Перемістити вибране{groupingSelectionIds.length > 0 ? ` (${groupingSelectionIds.length})` : ""}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-2"
                disabled={outputSaving}
                onClick={() => {
                  setCreateGroupDraft("");
                  setCreateGroupError(null);
                  setCreateGroupOpen(true);
                }}
              >
                <Check className="h-4 w-4" />
                Створити групу
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-2"
                disabled={outputSaving}
                onClick={() => openAddDesignLinkModal(uploadTargetKind)}
              >
                <Link2 className="h-4 w-4" />
                Додати посилання
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Оберіть зверху групу, а нижче окремо завантажуйте та погоджуйте візуал і макет. Для друку в замовлення мають бути відмічені обидва.
            </div>

            <Card className="overflow-hidden border border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.10),hsl(var(--background))_42%,hsl(204_94%_94%/0.22))] shadow-[0_20px_56px_-28px_hsl(var(--foreground)/0.28)]">
              <CardContent className="p-0">
                <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-5 p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_hsl(var(--primary)/0.7)]">
                        <DropboxGlyph className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
                          Dropbox Export
                        </div>
                        <div className="text-xl font-semibold text-foreground">
                          Фінал і архів для папки замовлення
                        </div>
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                          Назва папки за замовчуванням береться з назви задачі, але її можна змінити перед експортом. Затверджені
                          файли йдуть у <span className="font-medium text-foreground">Фінал</span>, усі інші матеріали з табів{" "}
                          <span className="font-medium text-foreground">Візуал</span> і{" "}
                          <span className="font-medium text-foreground">Макет</span> автоматично підуть в{" "}
                          <span className="font-medium text-foreground">Архів</span>.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {(["visualization", "layout"] as DesignOutputKind[]).map((kind) => {
                        const plan = dropboxPlanByKind[kind];
                        const finalFile = plan.finalFiles[0] ?? null;
                        return (
                          <div
                            key={`dropbox-plan-${kind}`}
                            className="rounded-2xl border border-border/60 bg-card/75 p-4 shadow-[0_16px_36px_-28px_hsl(var(--foreground)/0.22)] backdrop-blur-sm"
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                                {kind === "visualization" ? (
                                  <ImageIcon className="h-4 w-4 text-sky-600" />
                                ) : (
                                  <PencilLine className="h-4 w-4 text-emerald-600" />
                                )}
                                {DESIGN_OUTPUT_KIND_LABELS[kind]}
                              </div>
                              <Badge variant="outline" className="border-border/60 bg-background/60 text-[10px]">
                                Архів: {plan.archiveFiles.length}
                              </Badge>
                            </div>
                            {finalFile ? (
                              <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                                <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-success-foreground">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Фінал
                                </div>
                                <div className="truncate text-sm font-medium text-foreground" title={finalFile.file_name}>
                                  {finalFile.file_name}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-3 text-sm text-muted-foreground">
                                У цьому табі немає затвердженого файла. Усі матеріали підуть тільки в архів.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {dropboxExportWarnings.length > 0 ? (
                      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-3 text-sm text-amber-900">
                        <div className="mb-1 inline-flex items-center gap-2 font-medium">
                          <AlertTriangle className="h-4 w-4" />
                          Потрібно уточнення перед експортом
                        </div>
                        <div>{dropboxExportWarnings[0]}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col justify-between gap-4 border-t border-border/60 bg-[linear-gradient(180deg,hsl(var(--background)/0.72),hsl(var(--muted)/0.42))] p-5 lg:border-l lg:border-t-0">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          Папка замовлення
                        </div>
                        <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">
                          {dropboxDisplayedFolderName}
                        </div>
                        <div className="mt-2 text-xs leading-5 text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {`Tosho Team Folder/Замовники/${dropboxClientLabel}/Замовлення/${dropboxDisplayedFolderName}`}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">У фінал</div>
                          <div className="mt-2 text-2xl font-semibold text-foreground">
                            {dropboxExportPlan.filter((entry) => entry.role === "final").length}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">В архів</div>
                          <div className="mt-2 text-2xl font-semibold text-foreground">
                            {dropboxExportPlan.filter((entry) => entry.role === "archive").length}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className={cn("rounded-2xl border px-4 py-3 text-sm", dropboxStatusToneClass)}>
                        <div className="font-medium">{dropboxStatusLabel}</div>
                        <div className="mt-1 text-xs opacity-80">
                          {dropboxFolderReachable === false
                            ? "Папка або посилання більше не резолвиться через Dropbox API. Експорт треба оновити."
                            : latestDropboxExportedLabel
                              ? `Останній експорт: ${latestDropboxExportedLabel}`
                              : "Після першого експорту тут з’явиться стан синхронізації."}
                        </div>
                        {dropboxSyncState === "stale" && dropboxPlanDiffSummary.length > 0 ? (
                          <div className="mt-2 text-xs opacity-80">
                            Буде змінено: {dropboxPlanDiffSummary.join(", ")}.
                          </div>
                        ) : null}
                      </div>
                      {dropboxClientPath && dropboxSyncState === "synced" ? (
                        <>
                          <Button
                            className="w-full gap-2"
                            disabled={!latestDropboxFolderPath && !latestDropboxFolderSharedUrl}
                            onClick={() => void openDropboxOrderFolder()}
                          >
                            <FolderOpen className="h-4 w-4" />
                            Відкрити папку замовлення
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            disabled={dropboxExporting || !dropboxCanExport}
                            onClick={openDropboxExportDialog}
                          >
                            {dropboxExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                            Оновити в Dropbox
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            className="w-full gap-2"
                            disabled={dropboxExporting || (!dropboxCanExport && !!dropboxClientPath)}
                            onClick={dropboxClientPath ? openDropboxExportDialog : () => void createDropboxClientFolder({ openExportDialog: true })}
                          >
                            {dropboxExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                            {dropboxClientPath
                              ? dropboxSyncState === "stale"
                                ? "Оновити в Dropbox"
                                : "Перенести в Dropbox"
                              : "Створити папку Dropbox і продовжити"}
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            disabled={!latestDropboxFolderPath && !latestDropboxFolderSharedUrl}
                            onClick={() => void openDropboxOrderFolder()}
                          >
                            <FolderOpen className="h-4 w-4" />
                            Відкрити папку замовлення
                          </Button>
                        </>
                      )}
                      {!dropboxClientPath ? (
                        <div className="text-xs leading-5 text-muted-foreground">
                          Якщо папка замовника ще не створена, її можна підготувати прямо тут. Після цього відкриється модалка експорту.
                        </div>
                      ) : (
                        <div className="text-xs leading-5 text-muted-foreground">
                          {dropboxSyncState === "synced"
                            ? "Dropbox вже містить актуальний фінал і архів для цієї задачі. Основна дія тепер — відкрити папку, а оновлення доступне окремо."
                            : dropboxSyncState === "stale" && dropboxPlanDiffSummary.length > 0
                              ? `Оновлення ${dropboxPlanDiffSummary.join(", ")}.`
                              : "Експорт підготує папку замовлення, збереже фінальні файли окремо від архіву й запам’ятає шлях у задачі."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs
              value={activeDesignOutputTab}
              onValueChange={(value) => setActiveDesignOutputTab(value as DesignOutputKind)}
              className="w-full"
            >
              <TabsList className="mb-4 h-auto w-full justify-start gap-1 rounded-xl bg-muted/30 p-1 shadow-inner">
                <TabsTrigger value="visualization" className="gap-2">
                  <ImageIcon className="h-4 w-4" />
                  <span>Візуал</span>
                  {selectedVisualizationOutputFileIds.length > 0 ? (
                    <span className="rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] text-success-foreground">
                      {selectedVisualizationOutputFileIds.length}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="layout" className="gap-2">
                  <PencilLine className="h-4 w-4" />
                  <span>Макет</span>
                  {selectedLayoutOutputFileIds.length > 0 ? (
                    <span className="rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] text-success-foreground">
                      {selectedLayoutOutputFileIds.length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="visualization" className="mt-0">
                {renderDesignOutputSection("visualization")}
              </TabsContent>
              <TabsContent value="layout" className="mt-0">
                {renderDesignOutputSection("layout")}
              </TabsContent>
            </Tabs>

            <div className="rounded-lg border border-border/50 bg-muted/5 px-3 py-2 text-xs text-muted-foreground">
              Рекомендація: для друку додавайте окремо 1) візуал для погодження із замовником і 2) фінальний макет для виробництва.
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 self-start">
          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Швидкі дії</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEditTaskTitle ? (
                    <DropdownMenuItem onClick={startInlineTitleEdit} disabled={renameSaving || designTaskLockedByOther}>
                      Редагувати назву
                    </DropdownMenuItem>
                  ) : null}
                  {allowedStatusTransitions.filter((status) => status !== "pm_review").map((status) => (
                    <DropdownMenuItem
                      key={status}
                      disabled={!!statusSaving}
                      onClick={() => void updateTaskStatus(status)}
                    >
                      {task ? getDesignStatusActionLabel(task.status, status) : statusLabels[status]}
                    </DropdownMenuItem>
                  ))}
                  {canSeeMarkReadyAction ? (
                    <DropdownMenuItem disabled={!!statusSaving || !canMarkReadyNow} onClick={() => void updateTaskStatus("pm_review")}>
                      Позначити як дизайн готовий
                    </DropdownMenuItem>
                  ) : null}
                  {canManageAssignments ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={deletingTask}
                        onClick={() => requestDeleteTask()}
                      >
                        {deletingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Видалити задачу
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm space-y-2">
              <div className="text-xs text-muted-foreground">Крок 1. Виконавець</div>
              {task.assigneeUserId ? (
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 py-2">
                  <AvatarBase
                    src={getMemberAvatar(task.assigneeUserId)}
                    name={getMemberLabel(task.assigneeUserId)}
                    fallback={getInitials(getMemberLabel(task.assigneeUserId))}
                    size={24}
                    className="shrink-0"
                  />
                  <div className="font-medium truncate">{getMemberLabel(task.assigneeUserId)}</div>
                </div>
              ) : (
                <div className="font-medium text-muted-foreground">Без виконавця</div>
              )}
              {!task.assigneeUserId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={!canTakeOverForSelf}
                  onClick={() => void assignTaskToMe()}
                >
                  {assigningSelf ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Призначити себе
                </Button>
              ) : null}
              {canManageAssignments && recommendedDesigner ? (
                <div className="rounded-md border border-primary/15 bg-primary/5 px-2.5 py-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-primary">Рекомендуємо</div>
                  <div className="mt-1 flex items-center gap-2">
                    <AvatarBase
                      src={recommendedDesigner.avatarUrl ?? getMemberAvatar(recommendedDesigner.id)}
                      name={recommendedDesigner.label}
                      fallback={getInitials(recommendedDesigner.label)}
                      size={20}
                      className="shrink-0 border-border/70"
                      fallbackClassName="text-[10px] font-semibold"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{recommendedDesigner.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {designerWorkloadById.get(recommendedDesigner.id)?.recommendation ?? "Найменше поточне навантаження"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {canManageAssignments ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      disabled={!!assigningMemberId}
                    >
                      {assigningMemberId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Призначити дизайнеру
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Дизайнери</DropdownMenuLabel>
                    {sortedDesignerMembers.length === 0 ? (
                      <DropdownMenuItem disabled>Немає дизайнерів</DropdownMenuItem>
                    ) : (
                      sortedDesignerMembers.map((member) => {
                        const workload = designerWorkloadById.get(member.id);
                        return (
                        <DropdownMenuItem
                          key={member.id}
                          onClick={() => void applyAssignee(member.id)}
                          disabled={task.assigneeUserId === member.id}
                          className="gap-2 py-2"
                        >
                          <AvatarBase
                            src={member.avatarUrl ?? getMemberAvatar(member.id)}
                            name={member.label}
                            fallback={getInitials(member.label)}
                            size={18}
                            className="shrink-0 border-border/70"
                            fallbackClassName="text-[10px] font-semibold"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{member.label}</div>
                            {workload ? (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                <span>{CAPACITY_LABEL_BY_LEVEL[workload.level]}</span>
                                <span>·</span>
                                <span>{workload.activeTaskCount} задач</span>
                                <span>·</span>
                                <span>{workload.score}</span>
                              </div>
                            ) : null}
                          </div>
                          {workload ? (
                            <Badge variant="outline" className={cn("ml-auto text-[10px]", CAPACITY_BADGE_CLASS_BY_LEVEL[workload.level])}>
                              {workload.score}
                            </Badge>
                          ) : null}
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 text-primary",
                              task.assigneeUserId === member.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </DropdownMenuItem>
                        );
                      })
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void applyAssignee(null)} disabled={!task.assigneeUserId}>
                      Зняти виконавця
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Крок 2. Статус задачі</div>
              <div className="font-medium">{statusLabels[task.status]}</div>
              {isStatusStartable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-full justify-start"
                  disabled={!canStartWorkNow}
                  onClick={() => void updateTaskStatus("in_progress")}
                >
                  {statusSaving === "in_progress" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {task.status === "changes" ? "Почати правки (В роботі)" : "Почати роботу (В роботі)"}
                </Button>
              ) : null}
              {canSeeMarkReadyAction ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2 w-full justify-start"
                    disabled={!!statusSaving || !canMarkReadyNow}
                    onClick={() => void updateTaskStatus("pm_review")}
                  >
                    {statusSaving === "pm_review" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Позначити як дизайн готовий
                  </Button>
                  {clientReviewBlockers.length > 0 ? (
                    <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-xs text-muted-foreground">
                      Для передачі замовнику: {clientReviewBlockers.join(" · ")}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm space-y-2">
              <div className="text-xs text-muted-foreground">Дедлайн задачі</div>
              <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={deadlineSaving}
                  >
                    <CalendarClock className="h-4 w-4 mr-1" />
                    {task.designDeadline
                      ? formatDeadlineDateTime(task.designDeadline)
                      : "Оберіть дедлайн"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] max-w-[calc(100vw-2rem)] p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadlineDraftDate}
                    onSelect={(date) => {
                      setDeadlineDraftDate(date ?? undefined);
                    }}
                    captionLayout="dropdown-buttons"
                    fromYear={new Date().getFullYear() - 3}
                    toYear={new Date().getFullYear() + 5}
                    initialFocus
                  />
                  <div className="space-y-2 border-t border-border/50 px-2 py-3">
                    <Input
                      value={deadlineTime}
                      onChange={(event) => setDeadlineTime(normalizeDeadlineTimeInput(event.target.value))}
                      onBlur={() => {
                        setDeadlineTime((prev) => (isValidDeadlineTime(prev) ? prev : "12:00"));
                      }}
                      placeholder="HH:MM"
                      className="h-9 text-sm"
                    />
                    <div className="grid w-full grid-cols-4 gap-1.5">
                      {DEADLINE_PRESET_TIMES.map((time) => (
                        <Button
                          key={time}
                          type="button"
                          size="xs"
                          variant={deadlineTime === time ? "secondary" : "outline"}
                          className="w-full justify-center"
                          onClick={() => setDeadlineTime(time)}
                        >
                          {time}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <DateQuickActions
                    fullWidth
                    onSelect={(date) => {
                      setDeadlineDraftDate(date ?? undefined);
                    }}
                  />
                  <div className="flex items-center justify-end gap-2 border-t border-border/50 px-2 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeadlinePopoverOpen(false)}
                      disabled={deadlineSaving}
                    >
                      Скасувати
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyDeadlineDraft}
                      disabled={deadlineSaving}
                    >
                      Зберегти
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {task.designDeadline ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground"
                  disabled={deadlineSaving}
                  onClick={() => void updateTaskDeadline(null)}
                >
                  Очистити дедлайн
                </Button>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/5 p-3 text-sm space-y-2">
              <div className="text-xs text-muted-foreground">Крок 3. Таймер роботи</div>
              <div className="font-mono text-lg font-semibold tracking-wide">{timerElapsedLabel}</div>
              <div className="text-xs text-muted-foreground">
                {isTimerRunning
                  ? `Таймер активний${timerSummary.activeUserId ? ` · ${getMemberLabel(timerSummary.activeUserId)}` : ""}`
                  : "Таймер зупинено"}
              </div>
              {startTimerBlockedReason && !isTimerRunning ? (
                <div className="text-[11px] text-warning-foreground">{startTimerBlockedReason}</div>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 justify-start"
                  disabled={!canStartTimer || !!timerBusy}
                  title={startTimerBlockedReason ?? undefined}
                  onClick={() => void handleStartTimer()}
                >
                  {timerBusy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Play
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 justify-start"
                  disabled={!canPauseTimer || !!timerBusy}
                  title={pauseTimerBlockedReason ?? undefined}
                  onClick={() => void handlePauseTimer()}
                >
                  {timerBusy === "pause" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                  Pause
                </Button>
              </div>
            </div>

            {statusQuickActionsWithoutStart.length === 0 ? (
              <div className="text-sm text-muted-foreground">Для цього статусу немає швидких переходів.</div>
            ) : (
              <div className="space-y-2">
                {statusQuickActionsWithoutStart.map((action) => (
                  <Button
                    key={`${task.status}-${action.next}`}
                    variant="secondary"
                    className="w-full justify-start"
                    disabled={!!statusSaving || (action.next === "client_review" && !canSendToClientNow)}
                    onClick={() => void updateTaskStatus(action.next)}
                  >
                    {statusSaving === action.next ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {action.label}
                  </Button>
                ))}
                {task.status === "pm_review" && clientReviewBlockers.length > 0 ? (
                  <div className="rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-xs text-muted-foreground">
                    Для передачі замовнику: {clientReviewBlockers.join(" · ")}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {isLinkedQuote ? "Файли від замовника" : "Файли до ТЗ"}
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleUploadTaskAttachments(event.target.files)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={attachmentUploading}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  {attachmentUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Додати файл
                </Button>
              </div>
            </div>
            {attachments.length === 0 ? (
              isLinkedQuote && !customerAttachmentsLoaded ? (
                <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground space-y-3">
                  <div>Файли замовника ще не завантажені.</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    disabled={customerAttachmentsLoading}
                    onClick={() => void loadCustomerAttachments()}
                  >
                    {customerAttachmentsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Завантажити файли замовника
                  </Button>
                  {customerAttachmentsError ? (
                    <div className="text-xs text-destructive">{customerAttachmentsError}</div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                  Немає вкладень
                </div>
              )
            ) : (
              <div className="space-y-2.5">
                {isLinkedQuote && !customerAttachmentsLoaded ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    <span>Файли замовника не завантажені. Зараз показані лише файли з ТЗ.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5"
                      disabled={customerAttachmentsLoading}
                      onClick={() => void loadCustomerAttachments()}
                    >
                      {customerAttachmentsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Завантажити"}
                    </Button>
                  </div>
                ) : null}
                {customerAttachmentsError ? (
                  <div className="text-xs text-destructive">{customerAttachmentsError}</div>
                ) : null}
                {attachments.map((file) => {
                  const extension = getFileExtension(file.file_name);
                  const previewableImage = canRenderStoragePreview(extension) && Boolean(file.storage_bucket && file.storage_path);
                  return (
                    <div key={file.id} className="rounded-lg border border-border/50 bg-muted/5 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2.5">
                          {previewableImage ? (
                            <StorageObjectImage
                              bucket={file.storage_bucket}
                              path={file.storage_path}
                              alt={file.file_name ?? "Файл"}
                              variant="thumb"
                              hoverPreview
                              className="h-11 w-11 shrink-0 rounded-md border border-border/60"
                            />
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-[10px] font-semibold text-muted-foreground">
                              {extension}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={file.file_name ?? ""}>
                              {file.file_name ?? "Файл"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                              <span>{formatFileSize(file.file_size)}</span>
                              <span>·</span>
                              <span>{formatDate(file.created_at, true)}</span>
                              {file.uploaded_by ? (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <AvatarBase
                                      src={getMemberAvatar(file.uploaded_by)}
                                      name={getMemberLabel(file.uploaded_by)}
                                      fallback={getInitials(getMemberLabel(file.uploaded_by))}
                                      size={14}
                                      className="shrink-0 border-border/70"
                                    />
                                    <span>{getMemberLabel(file.uploaded_by)}</span>
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                              {file.storage_bucket && file.storage_path ? (
                                <>
                                  <Button
                                    size="icon"
                                variant="ghost"
                                aria-label="Переглянути файл"
                                onClick={() => void openStorageFilePreview(file)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Завантажити файл"
                                onClick={() => void downloadStorageBackedFile(file)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" disabled>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" disabled>
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canDeleteTaskBriefAttachment(file) ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              aria-label="Видалити файл"
                              disabled={attachmentDeletingId === file.id}
                              onClick={() => void handleRemoveTaskAttachment(file.id)}
                            >
                              {attachmentDeletingId === file.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Інформація</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />Замовник</span>
                <span className="font-medium text-right">{task.customerName ?? "Не вказано"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  {isLinkedQuote ? "Прорахунок" : "Контекст"}
                </span>
                <span className="font-medium text-right">
                  {isLinkedQuote ? getTaskDisplayNumber(task) : "Без прорахунку"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Виконавець</span>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <AvatarBase
                    src={getMemberAvatar(task.assigneeUserId)}
                    name={getMemberLabel(task.assigneeUserId)}
                    fallback={getInitials(getMemberLabel(task.assigneeUserId))}
                    size={16}
                    className="shrink-0 border-border/70"
                  />
                  <span className="font-medium text-right truncate max-w-[180px]">{getMemberLabel(task.assigneeUserId)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{taskRoleLabel}</span>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <AvatarBase
                    src={taskManagerAvatar}
                    name={taskManagerLabel}
                    fallback={getInitials(taskManagerLabel)}
                    size={16}
                    className="shrink-0 border-border/70"
                  />
                  <span className="font-medium text-right truncate max-w-[180px]">{taskManagerLabel}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Призначено</span>
                <span className="font-medium text-right">{formatDate(task.assignedAt, true)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Витрачено часу</span>
                <span className="font-mono font-medium text-right">{timerElapsedLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Створено</span>
                <span className="font-medium text-right">{formatDate(task.createdAt, true)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Історія задачі</div>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Завантаження історії...
              </div>
            ) : historyGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground">Подій ще немає</div>
            ) : (
              <div className="space-y-4">
                {historyError ? <div className="text-xs text-destructive">{historyError}</div> : null}
                {historyGroups.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="space-y-3">
                      {group.items.map((event) => {
                        const Icon = event.icon;
                        return (
                          <div key={event.id} className="flex items-start gap-2.5">
                            <div
                              className={cn(
                                "h-8 w-8 rounded-full border flex items-center justify-center shrink-0",
                                event.accentClass
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-medium">{event.title}</div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatActivityClock(event.created_at)}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                                <AvatarBase
                                  src={event.actorUserId ? getMemberAvatar(event.actorUserId) : null}
                                  name={event.actorLabel}
                                  fallback={getInitials(event.actorLabel)}
                                  size={14}
                                  className="shrink-0 border-border/70"
                                />
                                <span>{event.actorLabel}</span>
                              </div>
                              {event.description ? (
                                <div className="text-xs text-muted-foreground mt-1">{event.description}</div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!historyLoadedAll ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={historyLoading || !task?.id}
                    onClick={() => {
                      if (task?.id) {
                        void loadHistory(task.id, { full: true });
                      }
                    }}
                  >
                    {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Завантажити всю історію
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Коментарі та згадки</div>
            {isLinkedQuote ? (
              <>
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-3">
                  <div className="text-sm font-medium text-foreground">Повідомити через коментар</div>
                  {managerMembers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {managerMembers.slice(0, 6).map((member) => (
                        <Button
                          key={member.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => insertMentionIntoComment(member.id)}
                        >
                          @{mentionSuggestions.find((entry) => entry.id === member.id)?.alias ?? member.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Textarea
                      ref={quoteCommentTextareaRef}
                      value={quoteCommentDraft}
                      onChange={(event) => {
                        const cursor = event.target.selectionStart ?? event.target.value.length;
                        setQuoteCommentDraft(event.target.value);
                        syncMentionContext(event.target.value, cursor);
                      }}
                      onSelect={(event) => {
                        const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                        syncMentionContext(event.currentTarget.value, cursor);
                      }}
                      onKeyDown={handleQuoteCommentKeyDown}
                      placeholder="Наприклад: @tania макети погоджені, можна запускати у виробництво."
                      className="min-h-[110px]"
                    />
                    {mentionContext ? (
                      <div
                        className={cn(
                          "absolute left-0 right-0 z-30 overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
                          mentionDropdown.side === "bottom" ? "top-full mt-1" : "bottom-full mb-1"
                        )}
                      >
                        {filteredMentionSuggestions.length > 0 ? (
                          <div className="overflow-y-auto py-1" style={{ maxHeight: `${mentionDropdown.maxHeight}px` }}>
                            {filteredMentionSuggestions.map((member, index) => (
                              <button
                                key={member.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                                  index === mentionActiveIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
                                )}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  applyMentionSuggestion(member);
                                }}
                              >
                                <AvatarBase
                                  src={member.avatarUrl}
                                  name={member.label}
                                  fallback={getInitials(member.label)}
                                  size={24}
                                  className="text-[10px] font-semibold"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium">{member.label}</div>
                                  <div className="truncate text-xs text-muted-foreground">@{member.alias}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            {mentionContext.query ? `Немає збігів для @${mentionContext.query}` : "Немає доступних користувачів"}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void handleSubmitQuoteComment()} disabled={quoteCommentSaving}>
                      {quoteCommentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Надіслати коментар
                    </Button>
                  </div>
                </div>
                {quoteMentionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Завантаження згадок...
                  </div>
                ) : quoteMentionsError ? (
                  <div className="text-sm text-destructive">{quoteMentionsError}</div>
                ) : quoteMentionComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Поки немає згадок у коментарях цього прорахунку.</p>
                ) : (
                  <div className="space-y-2">
                    {quoteMentionComments.slice(0, 5).map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          <AvatarBase
                            src={getMemberAvatar(comment.created_by)}
                            name={getMemberLabel(comment.created_by)}
                            fallback={getInitials(getMemberLabel(comment.created_by))}
                            size={14}
                            className="shrink-0 border-border/70"
                          />
                          <span>{getMemberLabel(comment.created_by)}</span>
                          <span>·</span>
                          <span>{formatDate(comment.created_at, true)}</span>
                        </div>
                        <div className="mt-1 text-sm whitespace-pre-wrap line-clamp-3 break-words">
                          {renderInlineRichText(comment.body ?? "", { highlightMentions: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/orders/estimates/${task.quoteId}`)}>
                  <ExternalLink className="h-4 w-4" />
                  Відкрити коментарі прорахунку
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-3">
                  <div className="text-sm font-medium text-foreground">Повідомити через коментар</div>
                  {managerMembers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {managerMembers.slice(0, 6).map((member) => (
                        <Button
                          key={member.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => insertMentionIntoComment(member.id)}
                        >
                          @{mentionSuggestions.find((entry) => entry.id === member.id)?.alias ?? member.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Textarea
                      ref={quoteCommentTextareaRef}
                      value={quoteCommentDraft}
                      onChange={(event) => {
                        const cursor = event.target.selectionStart ?? event.target.value.length;
                        setQuoteCommentDraft(event.target.value);
                        syncMentionContext(event.target.value, cursor);
                      }}
                      onSelect={(event) => {
                        const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                        syncMentionContext(event.currentTarget.value, cursor);
                      }}
                      onKeyDown={handleQuoteCommentKeyDown}
                      placeholder="Наприклад: @tania підготуй, будь ласка, ще варіант із темним фоном."
                      className="min-h-[110px]"
                    />
                    {mentionContext ? (
                      <div
                        className={cn(
                          "absolute left-0 right-0 z-30 overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
                          mentionDropdown.side === "bottom" ? "top-full mt-1" : "bottom-full mb-1"
                        )}
                      >
                        {filteredMentionSuggestions.length > 0 ? (
                          <div className="overflow-y-auto py-1" style={{ maxHeight: `${mentionDropdown.maxHeight}px` }}>
                            {filteredMentionSuggestions.map((member, index) => (
                              <button
                                key={member.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                                  index === mentionActiveIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
                                )}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  applyMentionSuggestion(member);
                                }}
                              >
                                <AvatarBase
                                  src={member.avatarUrl}
                                  name={member.label}
                                  fallback={getInitials(member.label)}
                                  size={24}
                                  className="text-[10px] font-semibold"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium">{member.label}</div>
                                  <div className="truncate text-xs text-muted-foreground">@{member.alias}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            {mentionContext.query ? `Немає збігів для @${mentionContext.query}` : "Немає доступних користувачів"}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void handleSubmitQuoteComment()} disabled={quoteCommentSaving}>
                      {quoteCommentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Надіслати коментар
                    </Button>
                  </div>
                </div>
                {standaloneComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Поки немає коментарів у цій дизайн-задачі.</p>
                ) : (
                  <div className="space-y-2">
                    {standaloneComments.slice(0, 10).map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          <AvatarBase
                            src={getMemberAvatar(comment.created_by)}
                            name={getMemberLabel(comment.created_by)}
                            fallback={getInitials(getMemberLabel(comment.created_by))}
                            size={14}
                            className="shrink-0 border-border/70"
                          />
                          <span>{getMemberLabel(comment.created_by)}</span>
                          <span>·</span>
                          <span>{formatDate(comment.created_at, true)}</span>
                        </div>
                        <div className="mt-1 text-sm whitespace-pre-wrap break-words">
                          {renderInlineRichText(comment.body ?? "", { highlightMentions: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={briefEditorOpen} onOpenChange={setBriefEditorOpen}>
        <DialogContent className="h-[min(92dvh,860px)] sm:max-w-[min(920px,92vw)]">
          <DialogHeader>
            <DialogTitle>ТЗ для дизайнера</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-8 px-2", headingActive && "bg-primary/12 text-primary ring-1 ring-primary/20")}
                disabled={briefSaving || designTaskLockedByOther}
                onClick={() =>
                  applyBriefFormatting(({ selectedText }) =>
                    toggleLinePrefix(selectedText, () => "## ", /^##\s+/, "Заголовок")
                  )
                }
              >
                <Heading2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-8 px-2", boldActive && "bg-primary/12 text-primary ring-1 ring-primary/20")}
                disabled={briefSaving || designTaskLockedByOther}
                onClick={() =>
                  applyBriefFormatting(({ value, selectionStart, selectionEnd }) =>
                    toggleWrappedFormatting(value, selectionStart, selectionEnd, "**", "жирний текст")
                  )
                }
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-8 px-2", italicActive && "bg-primary/12 text-primary ring-1 ring-primary/20")}
                disabled={briefSaving || designTaskLockedByOther}
                onClick={() =>
                  applyBriefFormatting(({ value, selectionStart, selectionEnd }) =>
                    toggleWrappedFormatting(value, selectionStart, selectionEnd, "*", "курсив")
                  )
                }
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-8 px-2", bulletActive && "bg-primary/12 text-primary ring-1 ring-primary/20")}
                disabled={briefSaving || designTaskLockedByOther}
                onClick={() =>
                  applyBriefFormatting(({ selectedText }) =>
                    toggleLinePrefix(selectedText, () => "- ", /^-\s+/, "Пункт списку")
                  )
                }
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-8 px-2", orderedActive && "bg-primary/12 text-primary ring-1 ring-primary/20")}
                disabled={briefSaving || designTaskLockedByOther}
                onClick={() =>
                  applyBriefFormatting(({ selectedText }) =>
                    toggleLinePrefix(selectedText, (index) => `${index + 1}. `, /^\d+\.\s+/, "Пункт списку")
                  )
                }
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              ref={briefDialogTextareaRef}
              value={briefDraft}
              onChange={(event) => {
                setBriefDraft(event.target.value);
                setBriefDirty(true);
                resizeTextareaToContent(event.currentTarget, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT);
              }}
              onSelect={syncBriefSelection}
              onKeyUp={syncBriefSelection}
              onClick={syncBriefSelection}
              onWheelCapture={(event) => event.stopPropagation()}
              placeholder="Опишіть задачу для дизайнера…"
              rows={10}
              disabled={briefSaving || designTaskLockedByOther}
              className="min-h-[240px] flex-1 resize-none overflow-y-auto overscroll-contain"
            />
            <div className="text-xs text-muted-foreground">
              Якщо текст довший за видиму область, редактор залишиться стабільним по висоті і ввімкне внутрішній скрол.
            </div>
            <div className="min-h-0 rounded-lg border border-border/60 bg-background/70 p-3">
              <div className="mb-2 text-xs text-muted-foreground">Попередній перегляд</div>
              <div className="max-h-48 overflow-auto text-sm text-foreground">
                {renderBriefRichText(briefDraft)}
              </div>
            </div>
          </div>
          <DialogFooter>
            {briefDirty ? (
              <Button
                variant="ghost"
                disabled={briefSaving || designTaskLockedByOther}
                onClick={() => {
                  setBriefDraft(activeBriefVersion?.brief ?? task?.designBrief ?? "");
                  setBriefDirty(false);
                }}
              >
                Скасувати зміни
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setBriefEditorOpen(false)}>
              Закрити
            </Button>
            <Button
              onClick={() => void saveDesignBrief()}
              disabled={briefSaving || designTaskLockedByOther || !briefDirty}
            >
              {briefSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Зберегти нову версію
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={estimateDialogOpen}
        onOpenChange={(open) => {
          setEstimateDialogOpen(open);
          if (!open) {
            setEstimateError(null);
            setEstimatePendingAction(null);
          }
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Вкажіть естімейт задачі</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="task-estimate-value">Естімейт</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_150px]">
              <Input
                id="task-estimate-value"
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
            <p className="text-xs text-muted-foreground">
              Потрібно вказати естімейт, щоб призначити виконавця або почати роботу. 1 день = 8 годин.
            </p>
            {estimateError ? <p className="text-sm text-destructive">{estimateError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEstimateDialogOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void submitEstimateDialog()}>Зберегти естімейт</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dropboxFolderDialogOpen}
        onOpenChange={(open) => {
          setDropboxFolderDialogOpen(open);
          if (!open) setDropboxFolderError(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_hsl(var(--primary)/0.7)]">
                <DropboxGlyph className="h-5 w-5" />
              </span>
              Підготовка експорту в Dropbox
            </DialogTitle>
            <DialogDescription>
              Назва папки підставлена з задачі автоматично, але її можна змінити перед експортом.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="dropbox-folder-name">Назва папки замовлення</Label>
              <Input
                id="dropbox-folder-name"
                value={dropboxFolderDraft}
                onChange={(event) => setDropboxFolderDraft(event.target.value)}
                placeholder="Напр. Віндер - 2.4x0.6"
              />
              <div className="text-xs leading-5 text-muted-foreground">
                Шлях буде створено як{" "}
                <span className="font-medium text-foreground">
                  Tosho Team Folder/Замовники/{dropboxClientLabel}/Замовлення/{normalizeDropboxFolderNameDraft(dropboxFolderDraft)}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(["visualization", "layout"] as DesignOutputKind[]).map((kind) => {
                const plan = dropboxPlanByKind[kind];
                return (
                  <div key={`dropbox-dialog-${kind}`} className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        {kind === "visualization" ? (
                          <ImageIcon className="h-4 w-4 text-sky-600" />
                        ) : (
                          <PencilLine className="h-4 w-4 text-emerald-600" />
                        )}
                        {DESIGN_OUTPUT_KIND_LABELS[kind]}
                      </div>
                      <Badge variant="outline">{plan.files.length} файлів</Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-success-foreground">
                          Фінал
                        </div>
                        <div className="text-sm text-foreground">
                          {plan.finalFiles[0]?.file_name ?? "Немає затвердженого файла"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                        <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          <Archive className="h-3.5 w-3.5" />
                          Архів
                        </div>
                        <div className="text-sm text-foreground">
                          {plan.archiveFiles.length > 0
                            ? `${plan.archiveFiles.length} ${plan.archiveFiles.length === 1 ? "файл" : "файлів"}`
                            : "Немає архівних файлів"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {dropboxSyncState === "stale" && dropboxPlanDiffSummary.length > 0 ? (
              <div className="rounded-2xl border border-amber-300/50 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Буде змінено: {dropboxPlanDiffSummary.join(", ")}.
              </div>
            ) : null}

            {dropboxFolderError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {dropboxFolderError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropboxFolderDialogOpen(false)} disabled={dropboxExporting}>
              Скасувати
            </Button>
            <Button onClick={() => void handleExportToDropbox()} disabled={!dropboxCanExport}>
              {dropboxExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              {dropboxSyncState === "synced" ? "Оновити експорт у Dropbox" : dropboxSyncState === "stale" ? "Оновити в Dropbox" : "Перенести в Dropbox"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addLinkOpen}
        onOpenChange={(open) => {
          setAddLinkOpen(open);
          if (!open) setAddLinkError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Додати посилання на {addLinkKind === "visualization" ? "візуал" : "макет"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Тип матеріалу</Label>
              <Select value={addLinkKind} onValueChange={(value) => setAddLinkKind(value as DesignOutputKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visualization">Візуал</SelectItem>
                  <SelectItem value="layout">Макет</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Група</Label>
              <Select value={addLinkGroupValue} onValueChange={setAddLinkGroupValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без групи</SelectItem>
                  {designOutputGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">Нова група…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addLinkGroupValue === "__new__" ? (
              <div className="space-y-1.5">
                <Label htmlFor="design-link-group">Назва нової групи</Label>
                <Input
                  id="design-link-group"
                  value={addLinkGroupDraft}
                  onChange={(event) => setAddLinkGroupDraft(event.target.value)}
                  placeholder="Напр. Наліпки"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="design-link-url">URL</Label>
              <Input
                id="design-link-url"
                value={addLinkUrl}
                onChange={(event) => {
                  setAddLinkUrl(event.target.value);
                  if (addLinkError) setAddLinkError(null);
                }}
                onBlur={() => {
                  if (addLinkLabel.trim()) return;
                  try {
                    const parsed = new URL(addLinkUrl.trim());
                    if (parsed.hostname) setAddLinkLabel(parsed.hostname);
                  } catch {
                    // ignore invalid URL while typing
                  }
                }}
                placeholder="https://www.figma.com/file/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="design-link-label">Назва (опціонально)</Label>
              <Input
                id="design-link-label"
                value={addLinkLabel}
                onChange={(event) => setAddLinkLabel(event.target.value)}
                placeholder="Figma · Головний макет"
              />
            </div>
            {addLinkError ? <div className="text-sm text-destructive">{addLinkError}</div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLinkOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void handleSubmitDesignLink()} disabled={outputSaving}>
              {outputSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(filePreview)}
        onOpenChange={(open) => {
          if (!open) setFilePreview(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-[min(1100px,92vw)]">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{filePreview?.name ?? "Перегляд файлу"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto overscroll-contain rounded-xl bg-muted/15 p-2">
            {filePreview?.kind === "image" ? (
              <img
                src={filePreview.url}
                alt={filePreview.name}
                className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : filePreview?.kind === "pdf" ? (
              <img
                src={filePreview.url}
                alt={filePreview.name}
                className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : null}
          </div>
          <DialogFooter>
            {filePreview?.url ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const url =
                      filePreview.storageBucket && filePreview.storagePath
                        ? await getSignedAttachmentUrl(
                            filePreview.storageBucket,
                            filePreview.storagePath,
                            getPreviewOpenVariant(filePreview.name),
                            60 * 60 * 24 * 7
                          )
                        : filePreview.url;
                    if (!url) return;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  Відкрити окремо
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const url =
                      filePreview.storageBucket && filePreview.storagePath
                        ? await getSignedAttachmentUrl(filePreview.storageBucket, filePreview.storagePath, "original", 60 * 60 * 24 * 7)
                        : filePreview.url;
                    if (!url) return;
                    await downloadFileToDevice(url, filePreview.name);
                  }}
                >
                  Завантажити
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createGroupOpen}
        onOpenChange={(open) => {
          setCreateGroupOpen(open);
          if (!open) setCreateGroupError(null);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Створити групу макетів</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="design-output-group-name">Назва групи</Label>
              <Input
                id="design-output-group-name"
                value={createGroupDraft}
                onChange={(event) => setCreateGroupDraft(event.target.value)}
                placeholder="Напр. Самокопіюючі бланки"
              />
            </div>
            {createGroupError ? <div className="text-sm text-destructive">{createGroupError}</div> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void handleCreateDesignOutputGroup()} disabled={outputSaving}>
              {outputSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Створити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attachQuoteDialogOpen} onOpenChange={setAttachQuoteDialogOpen}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Привʼязати до прорахунку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Показані прорахунки цього ж замовника. Якщо у задачі вже обрано візуал, він одразу потрапить у вибраний
              прорахунок.
            </div>
            {quoteCandidatesLoading ? (
              <AppSectionLoader label="Завантаження..." compact />
            ) : quoteCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-sm text-muted-foreground">
                Немає прорахунків цього замовника для привʼязки.
              </div>
            ) : (
              <div className="space-y-2">
                {quoteCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/50 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <HoverCopyText
                          value={candidate.number ?? candidate.id.slice(0, 8)}
                          textClassName="font-mono text-sm font-semibold text-foreground"
                          successMessage="Номер прорахунку скопійовано"
                          copyLabel="Скопіювати номер прорахунку"
                        >
                          {candidate.number ?? candidate.id.slice(0, 8)}
                        </HoverCopyText>
                        {candidate.status ? (
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">
                            {candidate.status}
                          </Badge>
                        ) : null}
                        <div className="text-xs text-muted-foreground">
                          {candidate.createdAt
                            ? new Date(candidate.createdAt).toLocaleDateString("uk-UA", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "Без дати"}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <EntityAvatar
                          src={candidate.customerLogoUrl}
                          name={candidate.customerName ?? undefined}
                          fallback={getInitials(candidate.customerName)}
                          size={24}
                        />
                        <div className="truncate text-sm text-foreground">
                          {candidate.customerName ?? "Замовника не вказано"}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void attachTaskToQuote(candidate)}
                      disabled={attachingQuoteId === candidate.id}
                    >
                      {attachingQuoteId === candidate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Привʼязати
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachQuoteDialogOpen(false)}>
              Закрити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {partyCardOpen ? (
        <Suspense fallback={null}>
          <CustomerLeadQuickViewDialog
            open={partyCardOpen}
            onOpenChange={setPartyCardOpen}
            teamId={effectiveTeamId ?? ""}
            userId={userId}
            customerId={task?.customerId ?? null}
            customerName={task?.customerName ?? null}
            customerLogoUrl={task?.customerLogoUrl ?? null}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Видалити дизайн-задачу?"
        description={
          isLinkedQuote
            ? `Задача по прорахунку ${getTaskDisplayNumber(task)} буде видалена без можливості відновлення.`
            : `Дизайн-задача «${task.title ?? getTaskDisplayNumber(task)}» буде видалена без можливості відновлення.`
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={deletingTask}
        onConfirm={() => void handleDeleteTask()}
      />

      <div className="sticky bottom-3 z-10 xl:hidden flex flex-wrap gap-2 border border-border/60 bg-card/90 backdrop-blur rounded-lg px-3 py-2 shadow-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={primaryActionDisabled}
          onClick={primaryActionClick ?? undefined}
        >
          {primaryActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {primaryActionLabel}
        </Button>
        {mobileSecondaryAction ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={mobileSecondaryActionDisabled}
            onClick={() => void updateTaskStatus(mobileSecondaryAction.next)}
          >
            {statusSaving === mobileSecondaryAction.next ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mobileSecondaryAction.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
