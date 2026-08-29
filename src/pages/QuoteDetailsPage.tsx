import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoading } from "@/components/app/page-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { CurrencyAmountInput } from "@/features/quotes/components/CurrencyAmountInput";
import { TimeInput } from "@/components/ui/picker-input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { withDesignTaskCollaboratorMetadata } from "@/lib/designTaskCollaborators";
import { resolveWorkspaceId } from "@/lib/workspace";
import { EconomicsComingSoon } from "@/features/quotes/quote-details/EconomicsComingSoon";
import { QuotePartyCard } from "@/features/quotes/quote-details/QuotePartyCard";
import { QuotePriceSummary } from "@/features/quotes/quote-details/QuotePriceSummary";
import { QuoteStatusControl } from "@/features/quotes/quote-details/QuoteStatusControl";
import { threadKeyForQuote } from "@/lib/taskThread";
import { TaskThreadRail } from "@/features/taskChat/TaskThreadRail";
import { THREAD_EVENT_ACTIONS } from "@/features/taskChat/threadEvents";
import {
  getAttachmentDisplayFileName,
  getAttachmentDownloadFileName,
  getSignedAttachmentUrl,
  type AttachmentPreviewVariant,
} from "@/lib/attachmentPreview";
import { downloadFileToDevice } from "@/lib/downloadFileToDevice";
import { renderRichTextBlocks } from "@/components/ui/rich-text-links";
import {
  BRIEF_DIALOG_PREVIEW_CLASS,
  BRIEF_SURFACE_FRAME_CLASS,
  BRIEF_SURFACE_TEXT_CLASS,
  BRIEF_TEXTAREA_CLASS,
  BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT,
  BRIEF_INLINE_TEXTAREA_MAX_HEIGHT,
  resizeBriefTextarea,
} from "@/components/brief/briefSurfaceStyles";
import { DictationButton } from "@/components/dictation/DictationButton";
import {
  formatPrintProductSummary,
  getPrintProductConfig,
  getPrintProductDetailSections,
  isPrintPackageMetadata,
  type QuoteItemMetadata,
} from "@/lib/printPackage";
import { parsePrintSpecMetadata } from "@/lib/printSpec";
import { PrintSpecPanel } from "@/components/quotes/PrintSpecPanel";
import { normalizeUnitLabel } from "@/lib/units";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_LABELS,
  DESIGN_TASK_TYPE_OPTIONS,
  parseDesignTaskType,
  type DesignTaskType,
} from "@/lib/designTaskType";
import {
  type QuoteAttachmentAudience,
} from "@/lib/quoteAttachmentAudience";
import { supabase } from "@/lib/supabaseClient";
import { formatActivityClock, formatActivityDayLabel, type ActivityRow } from "@/lib/activity";
import { logActivity } from "@/lib/activityLogger";
import { notifyUsers } from "@/lib/designTaskActivity";
import { notifyDesignTaskStakeholdersOnCreate, notifyQuoteInitiatorOnStatusChange,
  notifyQuotesCreated,
} from "@/lib/workflowNotifications";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { AvatarBase } from "@/components/app/avatar-kit";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { NewQuoteDialog } from "@/components/quotes";
import type { NewQuoteFormData } from "@/components/quotes";
import { LiveCursorsLayer } from "@/components/app/LiveCursorsLayer";
import { useEntityLock } from "@/hooks/useEntityLock";
import { EntityLockBanner } from "@/components/app/EntityLockBanner";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { isInactiveEmployment } from "@/lib/employment";
import {
  type TeamMemberRow,
  type QuoteStatusRow,
  type QuoteSummaryRow,
  type QuoteRun,
  type QuoteSetMembershipInfo,
} from "@/lib/toshoApi";
import { useCompanyPricingRates } from "@/lib/companyPricingRates";
import {
  applyApprovedRunToggle,
  computeRunSalePricing,
  mergeQuoteRunsWithExisting,
  needsApprovedRunChoice,
  pickApprovedRun,
  validateRunEconomics,
  MIN_MANAGER_INCOME,
  MIN_RUN_MARKUP,
} from "@/lib/quoteRuns";
import { pluralUk } from "@/lib/lastSeen";
import {
  canOpenQuoteDetails,
  canViewQuoteSummary,
  isDesignerJobRole,
  isLogisticsJobRole,
  isQuoteManagerJobRole,
  normalizeJobRole,
  resolveQuoteRunPriceFieldAccess,
} from "@/lib/permissions";
import {
  type OrderCreationDraft,
} from "@/features/orders/orderRecords";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Copy,
  FileDown,
  FileText,
  Pencil,
  MoreHorizontal,
  Plus,
  Trash2,
  Paperclip,
  MessageSquare,
  CircleHelp,
  Check,
  Clock,
  Send,
  XCircle,
  Calendar,
  Users,
  Upload,
  Download,
  Search,
  ChevronDown,
  Loader2,
  Package,
  Image,
  ExternalLink,
  Lock,
  Calculator,
  Palette,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
} from "lucide-react";
import {
  ATTACHMENTS_ACCEPT,
  CANCEL_REASON_OPTIONS,
  ITEM_VISUAL_BUCKET,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_QUOTE_ATTACHMENTS,
  STATUS_NEXT_ACTION,
  STATUS_OPTIONS,
  buildMentionAlias,
  canPreviewDocumentThumb,
  canPreviewImage,
  createLocalId,
  extractMentionKeys,
  formatCurrency,
  formatCurrencyCompact,
  formatFileSize,
  resolveNumericRate,
  formatStatusLabel,
  getErrorMessage,
  getFileExtension,
  getInitials,
  isMentionTerminator,
  minutesAgo,
  normalizeMentionKey,
  normalizeStatus,
  renderTextWithMentions,
  statusClasses,
  statusIcons,
  toEmailLocalPart,
} from "@/features/quotes/quote-details/config";
import {
  attachDesignTaskToQuote,
  deleteQuoteItemRow,
  insertQuoteItemRow,
  deleteQuoteRunsByIds,
  updateQuoteItemRow,
  duplicateQuoteWithContents,
  fetchNextDesignTaskNumber,
  insertDesignTaskRow,
  uploadQuoteItemVisual,
  changeQuoteStatus,
  logDesignTaskEvent,
  syncDesignOutputFiles,
  linkDesignVisualizationToQuote,
  fetchCatalogBase,
  fetchCatalogEnrichment,
  createOrderFromQuote,
  deleteQuoteById,
  fetchOrderCreationDraft,
  fetchQuoteOrderRef,
  type QuoteOrderRef,
  deleteQuoteAttachmentRow,
  fetchDesignTasksLinkedToQuote,
  updateActivityMetadata,
  uploadQuoteAttachmentFile,
  persistQuoteRuns,
  createQuoteComment,
  logQuoteActivity,
  updateQuoteFields,
  fetchDesignTaskRows,
  fetchQuotePartyOptions,
  fetchTeamDesignTasks,
  fetchQuoteActivity,
  fetchQuoteComments,
  fetchQuoteItemsWithCatalog,
  fetchQuoteSummaryForDetails,
  fetchQuoteAttachments,
  fetchManagerRate,
  fetchMentionLabelOverrides,
  fetchQuoteSetMembership,
  notifyDesignTaskAssignmentChange,
  fetchQuoteRuns,
  fetchStatusHistory,
  invokeQuoteCommentsFunction,
  type DesignTaskRow,
  type InsertedCommentRow,
  type QuoteAttachment,
  type QuoteComment,
} from "@/features/quotes/quote-details/queries";
import { QuoteTypeBadge } from "@/features/quotes/components/QuoteTypeBadge";
import {
  QuoteDeadlineBadge,
  type QuoteDeadlineTone,
} from "@/features/quotes/components/QuoteDeadlineBadge";
import { QuoteKindBadge } from "@/features/quotes/components/QuoteKindBadge";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { CustomerLeadQuickViewDialog } from "@/components/customers";
import {
  type CatalogKind,
  type CatalogMethod,
  type CatalogModel,
  type CatalogPriceTier,
  type CatalogPrintPosition,
  getKindLabel,
  getMethodLabel,
  getMethodPrice,
  getModelImage,
  getModelSpecPreset,
  getModelLabel,
  getModelPrice,
  getPrintPositionLabel,
  getTypeLabel,
  type CatalogType,
} from "@/features/quotes/quote-details/catalog-utils";
import { buildDraftKey, readDraft } from "@/lib/draftStorage";
import { useDraftPersist } from "@/hooks/useDraftPersist";
import { getCurrentUser, getCurrentUserId } from "@/lib/currentUser";

type QuoteDetailsPageProps = {
  teamId: string;
  quoteId: string;
};

type QuotePageTab = "products" | "design" | "deadlines" | "discussion" | "details" | "economics";

type QuoteDetailsCachePayload = {
  quote: QuoteSummaryRow;
  cachedAt: number;
};

function sanitizeQuoteSummaryForCache(quote: QuoteSummaryRow): QuoteSummaryRow {
  return {
    id: quote.id,
    team_id: quote.team_id ?? null,
    customer_id: quote.customer_id ?? null,
    number: quote.number ?? null,
    status: quote.status ?? null,
    title: quote.title ?? null,
    quote_type: quote.quote_type ?? null,
    print_type: quote.print_type ?? null,
    delivery_type: quote.delivery_type ?? null,
    currency: quote.currency ?? null,
    total: quote.total ?? null,
    created_at: quote.created_at ?? null,
    updated_at: quote.updated_at ?? null,
    created_by: quote.created_by ?? null,
    customer_name: quote.customer_name ?? null,
    customer_logo_url: quote.customer_logo_url ?? null,
    assigned_to: quote.assigned_to ?? null,
    processing_minutes: quote.processing_minutes ?? null,
    deadline_at: quote.deadline_at ?? null,
    customer_deadline_at: quote.customer_deadline_at ?? null,
    design_deadline_at: quote.design_deadline_at ?? null,
    deadline_note: quote.deadline_note ?? null,
    deadline_reminder_offset_minutes: quote.deadline_reminder_offset_minutes ?? null,
    deadline_reminder_comment: quote.deadline_reminder_comment ?? null,
  };
}

const DEFAULT_DEADLINE_TIME = "09:00";
const DEADLINE_FIELD_LABEL_CLASS =
  "text-2xs font-medium uppercase tracking-wide text-muted-foreground";
const DEFAULT_MANAGER_RATE = 10;
const DEADLINE_REMINDER_OPTIONS = [
  { value: "none", label: "Без сповіщення" },
  { value: "0", label: "У момент дедлайну" },
  { value: "15", label: "За 15 хвилин" },
  { value: "60", label: "За 1 годину" },
  { value: "180", label: "За 3 години" },
  { value: "1440", label: "За 1 день" },
] as const;

/**
 * Чисті форматувальники дати й часу — на рівні модуля, а не в тілі сторінки.
 *
 * Вони не читають нічого зі стану, зате їх кличе loadQuote. Поки вони жили в
 * компоненті, кожен рендер створював нові функції — і loadQuote неможливо було
 * загорнути в useCallback, не зациклюючи ефект. Через це на ефекті завантаження
 * висіла заглушка правила залежностей, а через неї мовчали правила хуків
 * (REQ-109).
 */
const toDateInputValue = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toTimeInputValue = (value?: string | null) => {
  if (!value) return DEFAULT_DEADLINE_TIME;
  const directMatch = value.match(/T(\d{2}):(\d{2})/);
  if (directMatch) return `${directMatch[1]}:${directMatch[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return DEFAULT_DEADLINE_TIME;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * Дедлайни — теж чисті форматувальники на рівні модуля.
 *
 * formatDeadlineLabel читає стрічка подій (useMemo). Поки функція жила в тілі
 * компонента, React перестворював її щорендеру, тож чесний список залежностей
 * перераховував би всю стрічку на кожен рендер — саме тому там і висіла
 * заглушка. На рівні модуля тотожність стала, і залежність зникає (REQ-109).
 *
 * Дедлайни зберігаються як настінний час без пояси — хвіст «+00:00»/«Z»
 * навмисно ігнорується, читаються компоненти як є.
 */
const toLocalDate = (value?: string | null) => {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const parseDeadlineDate = (value?: string | null) => {
  if (!value) return null;
  // Deadlines are stored as floating wall-clock times; ignore any trailing
  // timezone offset (e.g. "+00:00"/"Z") and read the wall-clock components.
  const dateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (dateTimeMatch) {
    const [, y, m, d, hh, mm, ss] = dateTimeMatch;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss ?? "0")
    );
  }
  const local = toLocalDate(value);
  if (local) return local;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDeadlineLabel = (value?: string | null) => {
  const date = parseDeadlineDate(value);
  if (!date) return "Без дедлайну";
  const dateLabel = date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (!/T\d{2}:\d{2}/.test(value ?? "")) return dateLabel;
  return `${dateLabel}, ${date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

/**
 * Повертає true рівно на тому рендері, коли `signature` змінився.
 *
 * Це React-івський шаблон «виправити стан під новий вхід прямо в рендері»
 * замість ефекту. React відкидає незавершений рендер і починає новий ще ДО
 * того, як щось потрапить на екран, тож зайвого показу старого значення немає
 * — а через useEffect те саме коштує додатковий прохід.
 *
 * Підпис збираємо рядком із усіх значень, від яких залежав ефект: так
 * поведінка лишається ТОЧНО такою ж, як зі списком залежностей (REQ-109).
 */
function useSignatureChanged(signature: string) {
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    return true;
  }
  return false;
}

const isGenericMentionLabel = (label?: string | null) => {
  const normalized = (label ?? "").trim().toLowerCase();
  return normalized === "користувач" || normalized === "невідомий користувач";
};

type ItemMethod = {
  id: string;
  methodId: string;
  count: number;
  printPositionId?: string;
  printWidthMm?: number | null;
  printHeightMm?: number | null;
};
type QuoteItem = {
  id: string;
  position?: number;
  title: string;
  qty: number;
  unit: string;
  price: number;
  description?: string;
  metadata?: QuoteItemMetadata | null;
  catalogTypeId?: string;
  catalogKindId?: string;
  catalogModelId?: string;
  printPositionId?: string;
  printWidthMm?: number | null;
  printHeightMm?: number | null;
  productTypeId?: string;
  productKindId?: string;
  productModelId?: string;
  methods?: ItemMethod[];
  attachment?: {
    name: string;
    size: number;
    type: string;
    url: string;
  };
  resolvedTypeId?: string;
  resolvedTypeName?: string;
  resolvedKindId?: string;
  resolvedKindName?: string;
  resolvedModelId?: string;
  resolvedModelName?: string;
  resolvedModelImageUrl?: string;
  resolvedModelThumbUrl?: string;
  resolvedMethodNames?: Record<string, string>;
};
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
type DesignOutputMetaFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

type DesignTaskCandidate = {
  id: string;
  title: string | null;
  createdAt: string;
  designTaskNumber: string | null;
  status: string | null;
  metadata: Record<string, unknown>;
  selectedFile: DesignOutputMetaFile | null;
  outputsCount: number;
};

type ResolvedCatalogSelection = {
  typeId?: string;
  kindId?: string;
  modelId?: string;
};

type ActivityIcon = LucideIcon;

type ActivityEvent = {
  id: string;
  type: "status" | "comment" | "runs" | "other";
  created_at: string;
  title: string;
  description?: string;
  actorId?: string | null;
  actorLabel?: string | null;
  icon: ActivityIcon;
  accentClass?: string;
};

const parseActivityMetadata = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
};

const parseDesignOutputMetaFiles = (value: unknown): DesignOutputMetaFile[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const entry = row as Record<string, unknown>;
      const fileName = typeof entry.file_name === "string" && entry.file_name ? entry.file_name : null;
      const storageBucket =
        typeof entry.storage_bucket === "string" && entry.storage_bucket ? entry.storage_bucket : null;
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
      } satisfies DesignOutputMetaFile;
    })
    .filter(Boolean) as DesignOutputMetaFile[];
};

const filterSelectedOutputIds = (value: unknown, removedIds: Set<string>) =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .filter((entry) => !removedIds.has(entry))
    : [];

const filterSelectedOutputLabels = (value: unknown, removedIds: Set<string>) => {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !removedIds.has(key))
  );
};

function removeDesignOutputReferencesFromMetadata(
  metadata: Record<string, unknown>,
  storageBucket: string,
  storagePath: string
) {
  const files = parseDesignOutputMetaFiles(metadata.design_output_files);
  const remainingFiles = files.filter(
    (file) => !(file.storage_bucket === storageBucket && file.storage_path === storagePath)
  );
  if (remainingFiles.length === files.length) return null;

  const removedIds = new Set(
    files
      .filter((file) => file.storage_bucket === storageBucket && file.storage_path === storagePath)
      .map((file) => file.id)
  );
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    design_output_files: remainingFiles.map((file) => ({
      id: file.id,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: file.uploaded_by,
      created_at: file.created_at,
    })),
    selected_design_output_file_ids: filterSelectedOutputIds(metadata.selected_design_output_file_ids, removedIds),
    selected_visual_output_file_ids: filterSelectedOutputIds(metadata.selected_visual_output_file_ids, removedIds),
    selected_layout_output_file_ids: filterSelectedOutputIds(metadata.selected_layout_output_file_ids, removedIds),
    selected_visual_output_labels: filterSelectedOutputLabels(metadata.selected_visual_output_labels, removedIds),
    selected_layout_output_labels: filterSelectedOutputLabels(metadata.selected_layout_output_labels, removedIds),
  };

  if (
    metadata.selected_design_output_storage_bucket === storageBucket &&
    metadata.selected_design_output_storage_path === storagePath
  ) {
    nextMetadata.selected_design_output_file_id = null;
    nextMetadata.selected_design_output_file_name = null;
    nextMetadata.selected_design_output_storage_bucket = null;
    nextMetadata.selected_design_output_storage_path = null;
    nextMetadata.selected_design_output_mime_type = null;
    nextMetadata.selected_design_output_file_size = null;
    nextMetadata.selected_design_output_selected_at = null;
    nextMetadata.selected_design_output_selected_by = null;
    nextMetadata.selected_design_output_selected_by_label = null;
  }
  if (
    metadata.selected_visual_output_storage_bucket === storageBucket &&
    metadata.selected_visual_output_storage_path === storagePath
  ) {
    nextMetadata.selected_visual_output_file_id = null;
    nextMetadata.selected_visual_output_file_name = null;
    nextMetadata.selected_visual_output_storage_bucket = null;
    nextMetadata.selected_visual_output_storage_path = null;
    nextMetadata.selected_visual_output_mime_type = null;
    nextMetadata.selected_visual_output_file_size = null;
    nextMetadata.selected_visual_output_selected_at = null;
    nextMetadata.selected_visual_output_selected_by = null;
    nextMetadata.selected_visual_output_selected_by_label = null;
  }
  if (
    metadata.selected_layout_output_storage_bucket === storageBucket &&
    metadata.selected_layout_output_storage_path === storagePath
  ) {
    nextMetadata.selected_layout_output_file_id = null;
    nextMetadata.selected_layout_output_file_name = null;
    nextMetadata.selected_layout_output_storage_bucket = null;
    nextMetadata.selected_layout_output_storage_path = null;
    nextMetadata.selected_layout_output_mime_type = null;
    nextMetadata.selected_layout_output_file_size = null;
    nextMetadata.selected_layout_output_selected_at = null;
    nextMetadata.selected_layout_output_selected_by = null;
    nextMetadata.selected_layout_output_selected_by_label = null;
  }

  return nextMetadata;
}

const normalizePartyMatch = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");

const parseQuoteItemMetadata = (value: unknown): QuoteItemMetadata | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (isPrintPackageMetadata(value)) return value;

  const record = value as Record<string, unknown>;
  const metadata: QuoteItemMetadata = {};
  if (typeof record.sku === "string" && record.sku.trim()) {
    metadata.sku = record.sku.trim();
  }

  const rawVariant = record.catalogVariant;
  if (rawVariant && typeof rawVariant === "object" && !Array.isArray(rawVariant)) {
    const variantRecord = rawVariant as Record<string, unknown>;
    const id = typeof variantRecord.id === "string" ? variantRecord.id.trim() : "";
    const name = typeof variantRecord.name === "string" ? variantRecord.name.trim() : "";
    if (id && name) {
      metadata.catalogVariant = {
        id,
        name,
        sku: typeof variantRecord.sku === "string" ? variantRecord.sku.trim() || null : null,
        imageUrl: typeof variantRecord.imageUrl === "string" ? variantRecord.imageUrl.trim() || null : null,
      };
    }
  }

  // Параметри описових видів. Без цього рядка вони тихо зникали б на читанні:
  // парсер вище перебирає БІЛИЙ СПИСОК ключів, а не копіює обʼєкт, тож «просто
  // дописати новий ключ у metadata» недостатньо — його ще треба тут пропустити.
  const printSpec = parsePrintSpecMetadata(record.printSpec);
  if (printSpec) metadata.printSpec = printSpec;

  return metadata.sku || metadata.catalogVariant || metadata.printSpec ? metadata : null;
};

/**
 * Запис кешу — навмисно на рівні модуля, а не в тілі сторінки: тут `try` нікому
 * не заважає, а в компоненті він засліплював би правила хуків (REQ-96).
 */
function persistQuoteDetailsCache(teamId: string, quoteId: string, quote: QuoteSummaryRow) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `quote-details-cache:${teamId}:${quoteId}`,
      JSON.stringify({
        quote: sanitizeQuoteSummaryForCache(quote),
        cachedAt: Date.now(),
      } satisfies QuoteDetailsCachePayload)
    );
  } catch {
    // Кеш — необов'язковий; переповнене сховище не має ламати сторінку.
  }
}

function readQuoteDetailsCache(teamId: string, quoteId: string): QuoteDetailsCachePayload | null {
  if (typeof window === "undefined" || !teamId || !quoteId) return null;
  try {
    const raw = sessionStorage.getItem(`quote-details-cache:${teamId}:${quoteId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteDetailsCachePayload;
    if (!parsed.quote || typeof parsed.quote !== "object") return null;
    return {
      quote: sanitizeQuoteSummaryForCache(parsed.quote),
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

/**
 * Мінімум інлайнового поля ТЗ на цій сторінці.
 *
 * Був зашитий у власну копію resizeTextareaToContent, через що однойменна
 * функція на сторінці задачі поводилась інакше. Тепер функція спільна, а
 * мінімум лишився тут — він саме про цю сторінку.
 */
const BRIEF_MIN_HEIGHT = 140;

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
    return {
      nextText: selectedText,
      replaceStart: selectionStart - marker.length,
      replaceEnd: selectionEnd + marker.length,
      selectionStart: 0,
      selectionEnd: selectedText.length,
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
  return renderRichTextBlocks(value, {
    emptyFallback: <span>Спочатку вкажіть дедлайн дизайну або текст задачі.</span>,
  });
}

/** Рядок дизайн-задачі прорахунку зі стрічки activity_log. */
export function QuoteDetailsPage({ teamId, quoteId }: QuoteDetailsPageProps) {
  const navigate = useNavigate();
  const { userId, jobRole, accessRole, permissions } = useAuth();
  // Ставки компанії — з налаштувань, а не з констант у коді. До завантаження
  // віддають ті самі 30/20, тож перший кадр рахується як раніше.
  const companyRates = useCompanyPricingRates(userId);
  // Кеш читається ОДИН раз, а не на кожен рендер: значення потрібні лише для
  // початкових станів нижче. Чому це важливо — див. readInitialDesignPageState.
  const initialCache = useMemo(() => readQuoteDetailsCache(teamId, quoteId), [teamId, quoteId]);

  const [quote, setQuote] = useState<QuoteSummaryRow | null>(() => initialCache?.quote ?? null);
  const [loading, setLoading] = useState(() => !initialCache?.quote);
  const [error, setError] = useState<string | null>(null);

  const [statusNote, setStatusNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteQuoteDialogOpen, setDeleteQuoteDialogOpen] = useState(false);
  const [deleteQuoteBusy, setDeleteQuoteBusy] = useState(false);
  const [duplicateQuoteBusy, setDuplicateQuoteBusy] = useState(false);
  const [editQuoteDialogOpen, setEditQuoteDialogOpen] = useState(false);
  const [editQuoteSaving, setEditQuoteSaving] = useState(false);
  const [editQuoteError, setEditQuoteError] = useState<string | null>(null);
  const [editQuoteInitialValues, setEditQuoteInitialValues] = useState<Partial<NewQuoteFormData> | null>(null);
  const [editQuoteOriginalRuns, setEditQuoteOriginalRuns] = useState<QuoteRun[]>([]);
  const [editQuoteCustomers, setEditQuoteCustomers] = useState<
    Array<{
      id: string;
      name?: string | null;
      legal_name?: string | null;
      logo_url?: string | null;
      entityType?: "customer" | "lead";
    }>
  >([]);
  const [editQuoteCustomersLoading, setEditQuoteCustomersLoading] = useState(false);
  const [editQuoteCustomerSearch, setEditQuoteCustomerSearch] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [history, setHistory] = useState<QuoteStatusRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [quoteSetMembership, setQuoteSetMembership] = useState<QuoteSetMembershipInfo | null>(null);

  const [items, setItems] = useState<QuoteItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [itemsLoaded, setItemsLoaded] = useState(false);

  const [runs, setRuns] = useState<QuoteRun[]>([]);
  const [runsOriginal, setRunsOriginal] = useState<QuoteRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runsSaving, setRunsSaving] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [selectedRunIdRaw, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunIdByItem, setSelectedRunIdByItem] = useState<Record<string, string>>({});

  // Вибраний тираж — ПОХІДНЕ значення, а не окремий стан.
  //
  // Збережений вибір діє, поки такий тираж існує; зник — беремо перший. Раніше
  // це саме робив ефект, тобто правив стан навздогін: кадр із мертвим вибором
  // устигав потрапити на екран, і лише наступний прохід його виправляв. Читачі
  // (selectedRun, getSelectedRunForItem) запасний варіант мали й тоді, тож
  // єдиним споживачем ефекту лишалась підсвітка рядка (REQ-109).
  const selectedRunId =
    selectedRunIdRaw && runs.some((run) => run.id === selectedRunIdRaw)
      ? selectedRunIdRaw
      : runs[0]?.id ?? null;

  const [comments, setComments] = useState<QuoteComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [activeQuoteTab, setActiveQuoteTab] = useState<QuotePageTab>("products");
  /**
   * Згортання підсумку — щоб віддати висоту розмові.
   *
   * Деталі згортання не мають: після переходу на «ідентичність + доріжку» блок
   * займає два рядки, і ховати там нічого — кнопка коштувала б стільки ж місця,
   * скільки економила.
   */
  const [sideSummaryOpen, setSideSummaryOpen] = useState(true);

  /**
   * Висота повноекранної розкладки — ВИМІРЯНА, а не порахована.
   *
   * Той самий рецепт, що на сторінці дизайн-задачі, і з тієї ж причини: над
   * сторінкою може стояти не лише топбар, а й смуга «Дивитесь очима», і будь-яке
   * `calc(100dvh - 112px)` тоді бреше рівно на її висоту — сторінка стає вищою
   * за вікно, і з'являється скрол «на два пальці», хоча скролити нема чого.
   * Міряємо фактичну відстань від верху сторінки до низу вікна.
   *
   * Висоту з `overflow: hidden` отримує КОРІНЬ: якщо обмежити саму сітку, вміст
   * усередині все одно виштовхує сторінку, і замість скролу з'являється дірка
   * знизу.
   */
  const layoutRootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = layoutRootRef.current;
    if (!node) return;

    const apply = () => {
      // Нижче xl колонка йде під контентом — там сторінка скролиться як звичайна.
      if (window.innerWidth < 1280) {
        node.style.removeProperty("height");
        node.style.removeProperty("overflow");
        return;
      }
      const documentTop = node.getBoundingClientRect().top + window.scrollY;
      const available = Math.max(360, Math.round(window.innerHeight - documentTop));
      const next = `${available}px`;
      if (node.style.height !== next) {
        node.style.height = next;
        node.style.overflow = "hidden";
      }
    };

    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  });
  const [detailsTab, setDetailsTab] = useState<"comments" | "files" | "activity">("comments");
  const commentDraftKey = useMemo(() => buildDraftKey("quote-comment", quoteId), [quoteId]);
  const [commentText, setCommentText] = useState(() => readDraft<string>(commentDraftKey)?.value ?? "");
  const [commentSaving, setCommentSaving] = useState(false);
  useDraftPersist(commentDraftKey, commentText);
  // Re-hydrate when navigating between quotes (same component instance, new quoteId).
  // Перемкнули прорахунок — підставляємо його чернетку коментаря.
  //
  // Це не побічна дія, а виправлення стану під новий вхід, тож робиться прямо
  // під час рендеру, а не в ефекті: React відкидає незавершений рендер і
  // починає новий ще ДО того, як щось потрапить на екран. Через ефект те саме
  // коштувало б зайвий показ старого тексту (REQ-109).
  const [commentDraftQuoteId, setCommentDraftQuoteId] = useState(quoteId);
  if (commentDraftQuoteId !== quoteId) {
    setCommentDraftQuoteId(quoteId);
    setCommentText(readDraft<string>(commentDraftKey)?.value ?? "");
  }
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionActiveIndexRaw, setMentionActiveIndex] = useState(0);
  const [mentionDropdown, setMentionDropdown] = useState<MentionDropdownState>({
    side: "bottom",
    maxHeight: 224,
  });
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [briefText, setBriefText] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefEditorOpen, setBriefEditorOpen] = useState(false);
  const [briefInlineEditing, setBriefInlineEditing] = useState(false);
  const [briefSelection, setBriefSelection] = useState({ start: 0, end: 0 });
  const briefTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const briefDialogTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoadedAll, setActivityLoadedAll] = useState(false);
  const activityTabLoadedQuoteRef = useRef<string | null>(null);
  const filesTabLoadedQuoteRef = useRef<string | null>(null);

  const [filesCustomerOpen, setFilesCustomerOpen] = useState(true);
  const [filesDocsOpen, setFilesDocsOpen] = useState(true);

  const [attachments, setAttachments] = useState<QuoteAttachment[]>([]);
  const [designVisualizations, setDesignVisualizations] = useState<QuoteAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [attachmentsUploadError, setAttachmentsUploadError] = useState<string | null>(null);
  const [attachmentsDeletingId, setAttachmentsDeletingId] = useState<string | null>(null);
  const [attachmentsDeleteError, setAttachmentsDeleteError] = useState<string | null>(null);
  const [visualizationPreview, setVisualizationPreview] = useState<QuoteAttachment | null>(null);
  const [attachmentsDragActive, setAttachmentsDragActive] = useState(false);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteAttachmentOpen, setDeleteAttachmentOpen] = useState(false);
  const [deleteAttachmentTarget, setDeleteAttachmentTarget] = useState<QuoteAttachment | null>(null);
  const [attachmentAccessUrlByKey, setAttachmentAccessUrlByKey] = useState<Record<string, string>>({});
  const attachmentObjectUrlRegistryRef = useRef<Set<string>>(new Set());
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [memberInactiveById, setMemberInactiveById] = useState<Record<string, boolean>>({});
  const [mentionLabelOverrides, setMentionLabelOverrides] = useState<Record<string, string>>({});
  const [designTask, setDesignTask] = useState<{
    id: string;
    assigneeUserId: string | null;
    assignedAt: string | null;
    metadata: Record<string, unknown>;
  } | null>(null);
  /**
   * Усі задачі прорахунку. `designTask` вище — найновіша з них: нею керує
   * розгорнута панель (виконавець, тип, обраний візуал). Решта показані
   * списком, кожна зі своїм посиланням.
   */
  const [designTasks, setDesignTasks] = useState<DesignTaskRow[]>([]);
  const [designTaskLoading, setDesignTaskLoading] = useState(false);
  const [designTaskError, setDesignTaskError] = useState<string | null>(null);
  const [designTaskSaving, setDesignTaskSaving] = useState(false);
  const [designAssigneeId, setDesignAssigneeId] = useState<string | null>(null);
  const [designCollaboratorIds, setDesignCollaboratorIds] = useState<string[]>([]);
  const [designTaskType, setDesignTaskType] = useState<DesignTaskType | null>(null);
  const [createDesignTaskDialogOpen, setCreateDesignTaskDialogOpen] = useState(false);
  /** На яку позицію створюємо задачу. null — на прорахунок загалом. */
  const [designTaskItemId, setDesignTaskItemId] = useState<string | null>(null);
  const [designTaskCandidates, setDesignTaskCandidates] = useState<DesignTaskCandidate[]>([]);
  const [designTaskCandidatesLoading, setDesignTaskCandidatesLoading] = useState(false);
  const [attachDesignTaskDialogOpen, setAttachDesignTaskDialogOpen] = useState(false);
  const [attachingDesignTaskId, setAttachingDesignTaskId] = useState<string | null>(null);
  // Сторож від повторного входу — ref, а не стан: його ніхто не показує на
  // екрані, зате як стан він отруював ефект синхронізації. У чесному списку
  // залежностей він змушував ефект перезапуститись одразу після setSyncing(true),
  // а прибирання попереднього запуску ставило active=false і обривало
  // синхронізацію на півдорозі. Заодно зник зайвий перемальовок (REQ-109).
  const designVisualizationSyncingRef = useRef(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemFormMode, setItemFormMode] = useState<"simple" | "advanced">("simple");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemUnit, setItemUnit] = useState("шт.");
  const [itemPrice, setItemPrice] = useState("0");
  const [itemDescription, setItemDescription] = useState("");
  const [itemTypeId, setItemTypeId] = useState("");
  const [itemKindId, setItemKindId] = useState("");
  const [itemModelId, setItemModelId] = useState("");

  const toPrintApplications = (item: QuoteItem | null): NewQuoteFormData["printApplications"] => {
    if (!item?.methods || item.methods.length === 0) return [];
    return item.methods.map((method, index) => ({
      id: `${Date.now()}-${index}`,
      method: method.methodId ?? "",
      position: method.printPositionId ?? "",
      width:
        method.printWidthMm === null || method.printWidthMm === undefined ? "" : String(method.printWidthMm),
      height:
        method.printHeightMm === null || method.printHeightMm === undefined ? "" : String(method.printHeightMm),
    }));
  };
  const [itemMethods, setItemMethods] = useState<ItemMethod[]>([]);
  const [itemAttachment, setItemAttachment] = useState<QuoteItem["attachment"] | null>(null);
  const [itemAttachmentUploading, setItemAttachmentUploading] = useState(false);
  const [itemAttachmentError, setItemAttachmentError] = useState<string | null>(null);
  const [autoMethodsApplied, setAutoMethodsApplied] = useState(false);
  const [catalogTypes, setCatalogTypes] = useState<CatalogType[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSearchValue, setCatalogSearchValue] = useState("");
  const [lastAutoTitle, setLastAutoTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState(DEFAULT_DEADLINE_TIME);
  const [customerDeadlineDate, setCustomerDeadlineDate] = useState("");
  const [customerDeadlineTime, setCustomerDeadlineTime] = useState(DEFAULT_DEADLINE_TIME);
  const [designDeadlineDate, setDesignDeadlineDate] = useState("");
  const [designDeadlineTime, setDesignDeadlineTime] = useState(DEFAULT_DEADLINE_TIME);
  const [deadlineNote, setDeadlineNote] = useState("");
  const [deadlineReminderOffset, setDeadlineReminderOffset] = useState<string>("0");
  const [deadlineReminderComment, setDeadlineReminderComment] = useState("");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);
  const [customerDeadlinePopoverOpen, setCustomerDeadlinePopoverOpen] = useState(false);
  const [designDeadlinePopoverOpen, setDesignDeadlinePopoverOpen] = useState(false);

  // Inline editing for quantity
  const [editingQty, setEditingQty] = useState<string | null>(null);
  void editingQty;
  const [qtyValue, setQtyValue] = useState("");

  // Стан тримає лише ЗАВАНТАЖЕНУ ставку; випадок «менеджера немає» —
  // похідне значення, а не ще один запис у стан. Раніше типова ставка
  // виставлялась синхронно всередині ефекту, тобто коштувала зайвий прохід
  // рендеру щоразу, коли менеджера не було (REQ-109).
  const [fetchedManagerRate, setFetchedManagerRate] = useState<number | null>(null);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState("new");
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);
  const [createOrderDraft, setCreateOrderDraft] = useState<OrderCreationDraft | null>(null);
  const [createOrderSelectedItemIds, setCreateOrderSelectedItemIds] = useState<string[]>([]);
  const [createOrderLoading, setCreateOrderLoading] = useState(false);
  const [createOrderSubmitting, setCreateOrderSubmitting] = useState(false);
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  // Замовлення, зроблене з цього прорахунку. Поки його немає, позиції можна
  // правити й видаляти; щойно зʼявилось — прорахунок стає архівним документом.
  const [quoteOrderRef, setQuoteOrderRef] = useState<QuoteOrderRef | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<QuoteItem | null>(null);
  const [deleteItemBusy, setDeleteItemBusy] = useState(false);
  const [partyCardOpen, setPartyCardOpen] = useState(false);

  const getAttachmentStorageKey = useCallback((
    attachment: Pick<QuoteAttachment, "storageBucket" | "storagePath">,
    variant: AttachmentPreviewVariant = "original"
  ) => {
    if (!attachment.storageBucket || !attachment.storagePath) return null;
    return `${attachment.storageBucket}:${attachment.storagePath}:${variant}`;
  }, []);

  const ensureAttachmentAccessUrl = useCallback(
    async (attachment: QuoteAttachment, options?: { forceRefresh?: boolean; variant?: AttachmentPreviewVariant }) => {
      const variant = options?.variant ?? "original";
      const key = getAttachmentStorageKey(attachment, variant);
      if (!key || !attachment.storageBucket || !attachment.storagePath) {
        return attachment.url ?? null;
      }
      const existingUrl = attachmentAccessUrlByKey[key];
      if (!options?.forceRefresh && existingUrl) {
        return existingUrl;
      }

      const signedUrl = await getSignedAttachmentUrl(attachment.storageBucket, attachment.storagePath, variant, 60 * 60);
      if (typeof signedUrl === "string" && signedUrl) {
        if (existingUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(existingUrl);
          attachmentObjectUrlRegistryRef.current.delete(existingUrl);
        }
        setAttachmentAccessUrlByKey((prev) => ({ ...prev, [key]: signedUrl }));
        return signedUrl;
      }

      if (variant !== "original") return null;

      const { data: blobData, error: downloadError } = await supabase.storage
        .from(attachment.storageBucket)
        .download(attachment.storagePath);
      if (downloadError || !blobData) return null;

      const objectUrl = URL.createObjectURL(blobData);
      if (existingUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(existingUrl);
        attachmentObjectUrlRegistryRef.current.delete(existingUrl);
      }
      attachmentObjectUrlRegistryRef.current.add(objectUrl);
      setAttachmentAccessUrlByKey((prev) => ({ ...prev, [key]: objectUrl }));
      return objectUrl;
    },
    [attachmentAccessUrlByKey, getAttachmentStorageKey]
  );

  const getAttachmentDisplayName = useCallback(
    (attachment: {
      name?: string | null;
      mimeType?: string | null;
      storagePath?: string | null;
    }) => getAttachmentDisplayFileName(attachment.name, attachment.storagePath, attachment.mimeType),
    []
  );

  useEffect(() => {
    // Set створюється раз (useRef(new Set())) і .current ніколи не
    // переприсвоюється — лише мутується. Тож захоплення на маунті = те саме,
    // що читання при анмаунті; це знімає застереження exhaustive-deps про
    // «ref міг змінитися до cleanup» без зміни поведінки.
    const registry = attachmentObjectUrlRegistryRef.current;
    return () => {
      registry.forEach((url) => URL.revokeObjectURL(url));
      registry.clear();
    };
  }, []);

  const quoteManagerUserId = quote?.assigned_to?.trim() || null;
  const quoteCreatedByUserId = quote?.created_by?.trim() || null;
  const effectiveManagerId = quoteManagerUserId || quoteCreatedByUserId || userId || null;
  const viewerJobRole = normalizeJobRole(jobRole);
  const canOpenCurrentQuote = canOpenQuoteDetails({
    userId,
    quoteManagerUserId,
    quoteCreatedByUserId,
    viewerJobRole,
    permissions,
  });
  const canViewSummarySection = canViewQuoteSummary({
    userId,
    quoteManagerUserId,
    quoteCreatedByUserId,
    viewerJobRole,
    permissions,
  });
  // Запит живе в queries.ts: «Немає таблиці» там уже зведено до undefined,
  // тож типова ставка береться тим самим resolveNumericRate, що й раніше.
  const getManagerRateForUser = useCallback(async (targetUserId?: string | null) => {
    const normalizedUserId = targetUserId?.trim();
    if (!normalizedUserId) return DEFAULT_MANAGER_RATE;

    const result = await fetchManagerRate(normalizedUserId);
    if (!result.ok) {
      console.error("Failed to load current manager rate", result.message);
      return DEFAULT_MANAGER_RATE;
    }
    return resolveNumericRate(result.data, DEFAULT_MANAGER_RATE);
  }, []);
  const canEditQuoteContent =
    permissions.isSuperAdmin ||
    permissions.isSeo ||
    viewerJobRole === "pm" ||
    ((permissions.isAdmin || permissions.isManagerJob || isQuoteManagerJobRole(viewerJobRole)) &&
      userId !== null &&
      (quoteManagerUserId === userId || quoteCreatedByUserId === userId));
  const canManagerDeleteOwnDesignerBriefFiles = quoteManagerUserId === userId;
  const canDeleteDesignerBriefAttachment = useCallback(
    (attachment: QuoteAttachment) =>
      canManagerDeleteOwnDesignerBriefFiles &&
      Boolean(userId) &&
      (attachment.uploadedBy ?? null) === userId,
    [canManagerDeleteOwnDesignerBriefFiles, userId]
  );

  const loadCurrentManagerRate = useCallback(async () => {
    if (!effectiveManagerId) return;

    const result = await fetchManagerRate(effectiveManagerId);
    if (!result.ok) {
      console.error("Failed to load current manager rate", result.message);
      setFetchedManagerRate(null);
      return;
    }
    // Зведення НЕ таке, як у getManagerRateForUser вище: тут збережений нуль
    // теж стає типовою ставкою. Різницю лишено як була (REQ-109).
    setFetchedManagerRate(Math.max(0, Number(result.data) || DEFAULT_MANAGER_RATE));
  }, [effectiveManagerId]);

  useEffect(() => {
    // Обгортка навмисна, не прикрашання: правило set-state-in-effect вважає
    // будь-який виклик завантажувача просто в тілі ефекту синхронним записом у
    // стан. Тут це вже неправда — типова ставка стала похідним значенням, і в
    // loadCurrentManagerRate не лишилось жодного setState до await. Обгортка
    // дає це побачити, не повертаючи заглушку лінту (REQ-109).
    void (async () => {
      await loadCurrentManagerRate();
    })();
  }, [loadCurrentManagerRate]);

  const currentManagerRate = effectiveManagerId
    ? fetchedManagerRate ?? DEFAULT_MANAGER_RATE
    : DEFAULT_MANAGER_RATE;

  useEffect(() => {
    const handleWindowFocus = () => {
      void loadCurrentManagerRate();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
    };
  }, [loadCurrentManagerRate]);

  const getRunTotal = (run: QuoteRun) => {
    const qty = Number(run.quantity) || 0;
    const model = Number(run.unit_price_model) || 0;
    const print = Number(run.unit_price_print) || 0;
    const logistics = Number(run.logistics_cost) || 0;
    return (model + print) * qty + logistics;
  };

  const getRunPricing = useCallback((run: QuoteRun | null) => {
    if (!run) {
      return {
        costTotal: 0,
        costPerUnit: null as number | null,
        desiredManagerIncome: 0,
        managerRate: currentManagerRate,
        fixedCostRate: companyRates.fixedCostRate,
        vatRate: companyRates.vatRate,
        requiredGrossProfit: 0,
        fixedCosts: 0,
        vatAmount: 0,
        markupTotal: 0,
        saleTotal: 0,
        saleUnitPrice: null as number | null,
      };
    }

    const quantity = Math.max(0, Number(run.quantity) || 0);
    const costTotal = getRunTotal(run);
    const desiredManagerIncome = Math.max(0, Number(run.desired_manager_income) || 0);
    const managerRate = effectiveManagerId
      ? currentManagerRate || DEFAULT_MANAGER_RATE
      : resolveNumericRate(run.manager_rate, currentManagerRate || DEFAULT_MANAGER_RATE);
    const fixedCostRate = resolveNumericRate(run.fixed_cost_rate, companyRates.fixedCostRate);
    const vatRate = resolveNumericRate(run.vat_rate, companyRates.vatRate);
    const pricing = computeRunSalePricing({
      quantity,
      costTotal,
      desiredManagerIncome,
      managerRate,
      fixedCostRate,
      vatRate,
    });

    return {
      ...pricing,
      desiredManagerIncome,
      managerRate,
      fixedCostRate,
      vatRate,
    };
  }, [companyRates.fixedCostRate, companyRates.vatRate, currentManagerRate, effectiveManagerId]);

  // ── Оголошено ТУТ, а не серед сусідів за змістом ──────────────────────
  //
  // quoteRequirements, loadRuns і loadActivityLog читає saveRuns нижче.
  // Поки вони стояли після нього, React Compiler відмовлявся збирати весь
  // компонент: «Cannot access variable before it is declared». У JS воно
  // працює (виклик стається пізніше за оголошення), але компілятор не може
  // довести, що замикання побачить свіже значення — і мовчки пропускає
  // сторінку цілком, а разом із нею засинає лінт правил React (REQ-109).
  //
  // loadRuns і loadActivityLog через це відірвані від решти load*-функцій
  // нижче. Це свідомо: порядок тут важливіший за сусідство.

  const quoteRequirements = useMemo(() => {
    const issues: string[] = [];
    const hasParty = Boolean(quote?.customer_id || (quote?.customer_name ?? "").trim());
    const hasDeadline = Boolean((deadlineDate || "").trim() || (quote?.deadline_at ?? "").trim());
    if (!hasParty) issues.push("Замовник або Лід");
    if (!hasDeadline) issues.push("Дедлайн прорахунку");

    // Захист від продажу за собівартістю (рішення CEO 18.08).
    //
    // Перевірка живе САМЕ ТУТ, а не на кнопці «Зберегти»: тиражі мають
    // автозбереження через 900 мс після правки, і гейт на кнопці воно б
    // спокійно обійшло. quoteRequirements гальмує і кнопку, і автозбереження,
    // і решту шляхів збереження — це єдине місце, повз яке не пройти.
    const economicsIssues = new Set<string>();
    for (const run of runs) {
      const pricing = getRunPricing(run);
      const issue = validateRunEconomics({
        quantity: Number(run.quantity) || 0,
        costTotal: pricing.costTotal,
        desiredManagerIncome: pricing.desiredManagerIncome,
        managerRate: pricing.managerRate,
        fixedCostRate: pricing.fixedCostRate,
        vatRate: pricing.vatRate,
      });
      if (!issue) continue;
      const qty = Number(run.quantity) || 0;
      const where = qty > 0 ? ` (тираж ${qty} шт)` : "";
      economicsIssues.add(
        issue.code === "markup_below_min"
          ? `Націнка від ${MIN_RUN_MARKUP} ₴${where}`
          : `Бажаний заробіток від ${MIN_MANAGER_INCOME} ₴${where}`
      );
    }
    issues.push(...economicsIssues);

    return issues;
  }, [
    deadlineDate,
    getRunPricing,
    quote?.customer_id,
    quote?.customer_name,
    quote?.deadline_at,
    runs,
  ]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    const result = await fetchQuoteRuns(quoteId);
    if (result.ok) {
      setRuns(result.data);
      setRunsOriginal(result.data);
    } else {
      setRunsError(result.message);
      setRuns([]);
    }
    setRunsLoading(false);
    setRunsLoaded(true);
  }, [quoteId]);

  const loadActivityLog = useCallback(async (options?: { full?: boolean }) => {
    setActivityLoading(true);
    setActivityError(null);
    const result = await fetchQuoteActivity(quoteId, teamId, options);
    if (result.ok) {
      setActivityRows(result.data.rows);
      setActivityLoadedAll(result.data.loadedAll);
    } else {
      setActivityError(result.message);
      setActivityRows([]);
      setActivityLoadedAll(false);
    }
    setActivityLoading(false);
  }, [quoteId, teamId]);

  // Runs (tirages)
  const addRun = (quoteItemId?: string | null) => {
    const newId = crypto.randomUUID();
    const resolvedQuoteItemId = quoteItemId ?? (items.length === 1 ? items[0]?.id ?? null : null);
    setRuns((prev) => [
      ...prev,
      {
        id: newId,
        quote_item_id: resolvedQuoteItemId,
        quantity: 1,
        unit_price_model: 0,
        unit_price_print: 0,
        logistics_cost: 0,
        desired_manager_income: 0,
        manager_rate: currentManagerRate || DEFAULT_MANAGER_RATE,
        fixed_cost_rate: companyRates.fixedCostRate,
        vat_rate: companyRates.vatRate,
        is_approved: false,
      },
    ]);
    setSelectedRunId(newId);
    if (resolvedQuoteItemId) {
      setSelectedRunIdByItem((prev) => ({ ...prev, [resolvedQuoteItemId]: newId }));
    }
  };

  const updateRun = (index: number, field: keyof QuoteRun, value: number) => {
    setRuns((prev) =>
      prev.map((run, i) => (i === index ? { ...run, [field]: value } : run))
    );
  };
  void updateRun;

  /**
   * Розбір рядка переїхав у <NumberInput>: сюди приходить уже число (або null,
   * якщо поле лишили порожнім). Раніше тут стояло `Number(raw)` над сирим
   * значенням нативного number-поля — а воно на «1.» віддає порожній рядок,
   * тож набране число зникало просто під час набору.
   */
  const updateRunValue = (
    index: number,
    field:
      | "quantity"
      | "unit_price_model"
      | "unit_price_print"
      | "logistics_cost"
      | "desired_manager_income"
      | "manager_rate"
      | "fixed_cost_rate"
      | "vat_rate",
    value: number | null
  ) => {
    if (index < 0) return;
    setRuns((prev) =>
      prev.map((run, i) => (i === index ? { ...run, [field]: value } : run))
    );
  };

  /** Позначка «погоджено клієнтом» — правило живе в lib/quoteRuns і накрите тестами. */
  const toggleApprovedRun = (runId: string | null | undefined, quoteItemId?: string | null) => {
    setRuns((prev) => applyApprovedRunToggle(prev, runId, quoteItemId));
  };

  const saveRuns = async (nextRuns?: QuoteRun[] | unknown, options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (quoteRequirements.length > 0) {
      const message = `Щоб зберегти розрахунок, заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`;
      setRunsError(message);
      if (!silent) toast.error(message);
      return;
    }
    const targetRuns = Array.isArray(nextRuns) ? nextRuns : runs;
    setRunsSaving(true);
    setRunsError(null);
    {
      const sanitized = targetRuns.map((run) => ({
        ...run,
        quantity: Math.max(1, Number(run.quantity) || 1),
        unit_price_model: Math.max(0, Number(run.unit_price_model) || 0),
        unit_price_print: Math.max(0, Number(run.unit_price_print) || 0),
        logistics_cost: Math.max(0, Number(run.logistics_cost) || 0),
        desired_manager_income: Math.max(0, Number(run.desired_manager_income) || 0),
        manager_rate: resolveNumericRate(run.manager_rate, currentManagerRate || DEFAULT_MANAGER_RATE),
        fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, companyRates.fixedCostRate),
        vat_rate: resolveNumericRate(run.vat_rate, companyRates.vatRate),
        is_approved: run.is_approved === true,
      }));
      // delete missing (present before, absent now)
      const originalIds = new Set(
        runsOriginal.map((r) => r.id).filter((id): id is string => Boolean(id))
      );
      const keepIds = new Set(
        sanitized.map((r) => r.id).filter((id): id is string => Boolean(id))
      );
      const idsToDelete = Array.from(originalIds).filter((id) => !keepIds.has(id));

      // Окремим повідомленням, бо ця помилка означає не «щось пішло не так»,
      // а конкретну незастосовану міграцію — і підказка мусить бути дієвою.
      const fail = (message: string) => {
        if (/record\s+"new"\s+has\s+no\s+field\s+"team_id"/i.test(message)) {
          setRunsError(
            "Потрібно оновити SQL hotfix для блокувань (scripts/entity-locks-hotfix-quote-child-team-id.sql)."
          );
        } else {
          setRunsError(message);
        }
        if (!silent) toast.error("Помилка збереження");
        setRunsSaving(false);
      };

      const saved = await persistQuoteRuns(quoteId, sanitized, idsToDelete);
      if (!saved.ok) return fail(saved.message);

      await loadRuns();
      if (!silent) {
        const logged = await logQuoteActivity(
          {
            teamId,
            action: "прорахував тиражі",
            entityType: "quotes",
            entityId: quoteId,
            title: `Прорахував тиражі для прорахунку ${quote?.number ?? ""}`.trim(),
            href: `/orders/estimates/${quoteId}`,
            metadata: { source: "quote_runs" },
          },
          "Не вдалося зберегти тиражі."
        );
        if (!logged.ok) return fail(logged.message);
        await loadActivityLog();
        toast.success("Тиражі збережено");
      }
    }
    setRunsSaving(false);
  };

  const saveRunsRef = useRef(saveRuns);
  // Запис у ref НЕ під час рендеру, а в ефекті — інакше це порушення правил
  // React, через яке компілятор пропускає весь компонент. Ефект оголошений
  // вище за автозбереження, тож на момент його спрацювання ref уже свіжий.
  useEffect(() => {
    saveRunsRef.current = saveRuns;
  });

  const runsAutosaveSignature = useMemo(
    () =>
      JSON.stringify(
        runs.map((run) => ({
          id: run.id ?? "",
          quote_item_id: run.quote_item_id ?? "",
          quantity: Math.max(1, Number(run.quantity) || 1),
          unit_price_model: Math.max(0, Number(run.unit_price_model) || 0),
          unit_price_print: Math.max(0, Number(run.unit_price_print) || 0),
          logistics_cost: Math.max(0, Number(run.logistics_cost) || 0),
          desired_manager_income: Math.max(0, Number(run.desired_manager_income) || 0),
          manager_rate: resolveNumericRate(run.manager_rate, currentManagerRate || DEFAULT_MANAGER_RATE),
          fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, companyRates.fixedCostRate),
          vat_rate: resolveNumericRate(run.vat_rate, companyRates.vatRate),
          is_approved: run.is_approved === true,
        }))
      ),
    [companyRates.fixedCostRate, companyRates.vatRate, currentManagerRate, runs]
  );

  const runsOriginalAutosaveSignature = useMemo(
    () =>
      JSON.stringify(
        runsOriginal.map((run) => ({
          id: run.id ?? "",
          quote_item_id: run.quote_item_id ?? "",
          quantity: Math.max(1, Number(run.quantity) || 1),
          unit_price_model: Math.max(0, Number(run.unit_price_model) || 0),
          unit_price_print: Math.max(0, Number(run.unit_price_print) || 0),
          logistics_cost: Math.max(0, Number(run.logistics_cost) || 0),
          desired_manager_income: Math.max(0, Number(run.desired_manager_income) || 0),
          manager_rate: resolveNumericRate(run.manager_rate, currentManagerRate || DEFAULT_MANAGER_RATE),
          fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, companyRates.fixedCostRate),
          vat_rate: resolveNumericRate(run.vat_rate, companyRates.vatRate),
          is_approved: run.is_approved === true,
        }))
      ),
    [companyRates.fixedCostRate, companyRates.vatRate, currentManagerRate, runsOriginal]
  );

  const removeRun = async (index: number) => {
    if (quoteRequirements.length > 0) {
      const message = `Щоб зберегти розрахунок, заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`;
      setRunsError(message);
      toast.error(message);
      return;
    }
    const removed = runs[index];
    const next = runs.filter((_, i) => i !== index);
    setRuns(next);
    if (removed?.id && removed.id === selectedRunId) {
      setSelectedRunId(next[0]?.id ?? null);
    }
    if (removed?.id && removed.quote_item_id) {
      // Ключ окремою змінною, а не приведенням типу прямо в літералі: React
      // Compiler не вміє TSAsExpression у ключі обʼєкта й через нього пропускає
      // весь компонент (REQ-109).
      const removedItemId: string = removed.quote_item_id;
      const nextItemRun = next.find((run) => run.quote_item_id === removedItemId);
      setSelectedRunIdByItem((prev) => ({
        ...prev,
        [removedItemId]: nextItemRun?.id ?? "",
      }));
    }
    await saveRuns(next);
  };

  const handleDeleteQuote = async () => {
    if (deleteQuoteBusy) return;
    setDeleteQuoteBusy(true);
    setStatusError(null);

    const removed = await deleteQuoteById(quoteId, teamId);
    if (removed.ok) {
      toast.success("Прорахунок видалено");
      navigate("/orders/estimates", { replace: true });
    } else {
      setStatusError(removed.message);
      toast.error(removed.message);
    }
    setDeleteQuoteBusy(false);
    setDeleteQuoteDialogOpen(false);
  };

  const saveBrief = async () => {
    if (!quote || !teamId || briefSaving) return;
    if (quoteRequirements.length > 0) {
      const message = `Щоб зберегти ТЗ, заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`;
      setBriefError(message);
      toast.error(message);
      return;
    }
    setBriefSaving(true);
    setBriefError(null);

    const fail = (message: string) => {
      setBriefError(message);
      toast.error(message);
      setBriefSaving(false);
    };

    const nextBrief = briefText.trim();
    const saved = await updateQuoteFields(
      {
        quoteId,
        teamId,
        comment: nextBrief ? nextBrief : null,
        designBrief: nextBrief ? nextBrief : null,
      },
      "Не вдалося зберегти ТЗ."
    );
    if (!saved.ok) return fail(saved.message);

    const data = saved.data;
    setQuote((prev) =>
      prev
        ? {
            ...prev,
            comment: data?.comment ?? nextBrief ?? null,
            design_brief: data?.design_brief ?? nextBrief ?? null,
            updated_at: data?.updated_at ?? prev.updated_at,
          }
        : prev
    );
    setBriefDirty(false);
    setBriefInlineEditing(false);

    const logged = await logQuoteActivity(
      {
        teamId,
        action: "оновив ТЗ",
        entityType: "quotes",
        entityId: quoteId,
        title: `Оновив ТЗ для дизайнера${quote?.number ? ` (#${quote.number})` : ""}`,
        href: `/orders/estimates/${quoteId}`,
        metadata: { source: "quote_brief" },
      },
      "Не вдалося зберегти ТЗ."
    );
    if (!logged.ok) return fail(logged.message);

    await loadActivityLog();
    toast.success("ТЗ збережено");
    setBriefSaving(false);
  };

  /*
    «Доповнення» прибрано з картки 25.08.2026.

    Поле quotes.notes лишається в базі — його читає інший код і воно ще може
    знадобитись, — але окремого блока в боковій колонці більше немає: за
    заміром на проді текст був заповнений в 1 прорахунку з 285, і той єдиний
    запис читався як репліка в розмову («це має бути пошивна футболка… беремо
    сітку малфіні»), а не як стан справи. Місце в колонці віддане обговоренню,
    де такі уточнення й живуть.
  */

  const updatedMinutes = minutesAgo(quote?.updated_at ?? null);

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.qty * item.price, 0);
  }, [items]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? pickApprovedRun(runs) ?? runs[0] ?? null,
    [runs, selectedRunId]
  );

  const selectedRunPricing = useMemo(() => getRunPricing(selectedRun), [getRunPricing, selectedRun]);

  const selectedUnitCost = useMemo(() => {
    if (!selectedRun) return null;
    const qty = Number(selectedRun.quantity) || 0;
    if (qty <= 0) return null;
    const modelPrice = Number(selectedRun.unit_price_model) || 0;
    const printPrice = Number(selectedRun.unit_price_print) || 0;
    const logistics = Number(selectedRun.logistics_cost) || 0;
    return modelPrice + printPrice + logistics / qty;
  }, [selectedRun]);

  const getSelectedRunForItem = useCallback(
    (itemId: string) => {
      const itemRuns = runs.filter((run) =>
        run.quote_item_id ? run.quote_item_id === itemId : items.length === 1
      );
      if (itemRuns.length === 0) return null;
      const selectedForItem = selectedRunIdByItem[itemId];
      // Поки людина не перемкнула вкладку сама — показуємо й рахуємо ТОЙ тираж,
      // який погодив клієнт. Раніше типовим був просто перший створений, і
      // підсумок картки залежав від того, що давніше додали.
      return (
        itemRuns.find((run) => run.id && run.id === selectedForItem) ??
        pickApprovedRun(itemRuns) ??
        itemRuns[0] ??
        null
      );
    },
    [items.length, runs, selectedRunIdByItem]
  );

  const getRunIndex = useCallback(
    (targetRun: QuoteRun | null) => runs.findIndex((run) => run === targetRun),
    [runs]
  );

  const selectRunForItem = useCallback((run: QuoteRun, itemId?: string | null) => {
    setSelectedRunId(run.id ?? null);
    if (itemId && run.id) {
      setSelectedRunIdByItem((prev) => ({ ...prev, [itemId]: run.id ?? "" }));
    }
  }, []);

  const activeRunPricingSummaries = useMemo(() => {
    const itemSummaries = items
      .map((item) => {
        const run = getSelectedRunForItem(item.id);
        if (!run) return null;
        return {
          itemId: item.id,
          title: item.title,
          run,
          pricing: getRunPricing(run),
        };
      })
      .filter(
        (
          summary
        ): summary is {
          itemId: string;
          title: string;
          run: QuoteRun;
          pricing: ReturnType<typeof getRunPricing>;
        } => Boolean(summary)
      );

    if (itemSummaries.length > 0) return itemSummaries;
    if (!selectedRun) return [];

    return [
      {
        itemId: "",
        title: "Активний тираж",
        run: selectedRun,
        pricing: getRunPricing(selectedRun),
      },
    ];
  }, [getRunPricing, getSelectedRunForItem, items, selectedRun]);

  const activeRunPricingTotals = useMemo(
    () =>
      activeRunPricingSummaries.reduce(
        (totals, summary) => ({
          costTotal: totals.costTotal + summary.pricing.costTotal,
          requiredGrossProfit: totals.requiredGrossProfit + summary.pricing.requiredGrossProfit,
          fixedCosts: totals.fixedCosts + summary.pricing.fixedCosts,
          vatAmount: totals.vatAmount + summary.pricing.vatAmount,
          markupTotal: totals.markupTotal + summary.pricing.markupTotal,
          saleTotal: totals.saleTotal + summary.pricing.saleTotal,
        }),
        {
          costTotal: 0,
          requiredGrossProfit: 0,
          fixedCosts: 0,
          vatAmount: 0,
          markupTotal: 0,
          saleTotal: 0,
        }
      ),
    [activeRunPricingSummaries]
  );

  /**
   * З чого складається ціна — для смуги часток у боковому підсумку.
   *
   * Порядок сегментів фіксований і йде від найбільшого за змістом до
   * найдрібнішого: спершу те, що ми заплатили (собівартість), потім те, що
   * заробляємо (потрібний ВП), далі накладні. Нулі відкидаємо — сегмент
   * нульової ширини в смузі виглядав би як щілина між кольорами.
   *
   * Кольори — категоріальна палітра графіків, а не семантичні тони: це склад
   * суми, а не оцінка «добре/погано». Собівартість не «погана», вона просто
   * найбільша частка.
   */
  const priceBreakdownParts = useMemo(
    () =>
      [
        { key: "cost", label: "Собівартість", value: activeRunPricingTotals.costTotal, color: "bg-chart-1" },
        {
          key: "gross",
          label: "Потрібний ВП",
          value: activeRunPricingTotals.requiredGrossProfit,
          color: "bg-chart-3",
        },
        { key: "fixed", label: "Сталі витрати", value: activeRunPricingTotals.fixedCosts, color: "bg-chart-4" },
        { key: "vat", label: "ПДВ", value: activeRunPricingTotals.vatAmount, color: "bg-chart-7" },
      ].filter((part) => part.value > 0),
    [activeRunPricingTotals]
  );

  /**
   * Частка надцінки в сумі продажу — рівно для підпису біля числа.
   *
   * Це арифметика показу, а не нове правило ціни: обидві величини вже пораховані
   * тим самим computeRunSalePricing, і жодне збереження від цього рядка не
   * залежить. Порожньо, коли ділити нема на що.
   */
  const markupShareLabel = useMemo(() => {
    const sale = activeRunPricingTotals.saleTotal;
    const markup = activeRunPricingTotals.markupTotal;
    if (!Number.isFinite(sale) || sale <= 0 || markup <= 0) return null;
    return `${Math.round((markup / sale) * 100)}%`;
  }, [activeRunPricingTotals.markupTotal, activeRunPricingTotals.saleTotal]);

  const hasMultipleActiveProductSummaries = items.length > 1;
  const activeManagerRateLabel = useMemo(() => {
    const rates = Array.from(
      new Set(activeRunPricingSummaries.map((summary) => summary.pricing.managerRate))
    );
    if (rates.length === 0) return `${selectedRunPricing.managerRate}%`;
    if (rates.length === 1) return `${rates[0]}%`;
    return "Змішано";
  }, [activeRunPricingSummaries, selectedRunPricing.managerRate]);

  /**
   * Ставка менеджера різна між тиражами — єдиний випадок, коли її варто
   * показувати рядком.
   *
   * Однакова ставка на всі тиражі це стала величина: вона не міняється від
   * перегляду до перегляду, і власний рядок у вузькій колонці для неї — оренда
   * місця під те, що ніхто не перечитує. Значення нікуди не зникає (воно в
   * підказці суми), а на екран повертається саме тоді, коли з ним щось не так:
   * «Змішано» означає, що тиражі одного прорахунку рахувались за різними
   * ставками, і це або свідоме рішення, або помилка — але побачити її треба.
   */
  const managerRateNeedsAttention = activeManagerRateLabel === "Змішано";

  const quoteSectionsBootstrapping =
    (!itemsLoaded && items.length === 0) || (!runsLoaded && runs.length === 0);

  const combineDeadlineValue = (date?: string | null, time?: string | null) => {
    const normalizedDate = (date ?? "").trim();
    if (!normalizedDate) return "";
    const normalizedTime = (time ?? "").trim() || DEFAULT_DEADLINE_TIME;
    return `${normalizedDate}T${normalizedTime}:00`;
  };

  const formatDateInput = (value?: Date | null) => {
    if (!value) return "";
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const formatDeadlineDateOnlyLabel = (value?: string | null) => {
    const date = parseDeadlineDate(value);
    if (!date) return "Без дедлайну";
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatShortDeadlineLabel = (value?: string | null) => {
    const date = parseDeadlineDate(value);
    if (!date) return "Не вказано";
    const dateLabel = date.toLocaleDateString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
    });
    const hasTime = /T\d{2}:\d{2}/.test(value ?? "");
    if (!hasTime) return dateLabel;
    return `${dateLabel} до ${date.toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  const buildDeadlineBadgePreview = (value?: string | null) => {
    if (!value) {
      return {
        tone: "none" as QuoteDeadlineTone,
        label: "Без дедлайну",
        title: "Без дедлайну",
      };
    }
    const badge = getDeadlineBadge(value);
    const parsed = parseDeadlineDate(value);
    const hasTime = /T\d{2}:\d{2}/.test(value);
    const timeLabel = parsed && hasTime
      ? parsed.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
      : null;
    return {
      tone: badge.tone,
      label: timeLabel ? `${badge.label} · ${timeLabel}` : badge.label,
      title: formatDeadlineLabel(value),
    };
  };

  /**
   * Дедлайн для доріжки в боковій колонці — коротко.
   *
   * Повний підпис («Прострочено (15 дн.) · 14:00») у комірку завширшки третину
   * колонки не влазить і переносився на два рядки, через що доріжка ставала
   * вищою за все, що над нею. Тут лишається сам факт: скільки днів і в який
   * бік. Повний текст живе в `title` — під курсором.
   */
  const buildDeadlineTrackItem = (label: string, value?: string | null) => {
    const badge = getDeadlineBadge(value);
    if (!value || badge.tone === "none") {
      return { label, short: "—", tone: "none" as QuoteDeadlineTone, title: `${label}: не вказано` };
    }
    const date = parseDeadlineDate(value);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDeadline = date
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
      : startOfToday;
    const diffDays = Math.round(
      (startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)
    );
    const short =
      diffDays < 0
        ? `−${Math.abs(diffDays)} дн`
        : diffDays === 0
          ? "Сьогодні"
          : diffDays === 1
            ? "Завтра"
            : date
              ? date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })
              : badge.label;
    return { label, short, tone: badge.tone, title: `${label}: ${formatDeadlineLabel(value)}` };
  };

  const resolveDeadlinePreviewValue = (
    date?: string | null,
    time?: string | null,
    fallback?: string | null
  ) => {
    const normalizedDate = (date ?? "").trim();
    if (!normalizedDate) return fallback ?? null;
    return combineDeadlineValue(normalizedDate, time);
  };

  const formatDeliveryLabel = (value?: string | null) => {
    if (!value) return "Не вказано";
    const map: Record<string, string> = {
      nova_poshta: "Нова пошта",
      pickup: "Самовивіз",
      taxi: "Таксі / Uklon",
      cargo: "Вантажне перевезення",
    };
    return map[value] ?? value;
  };

  const formatReminderOffsetLabel = (value?: number | null) => {
    if (value === null || value === undefined) return null;
    if (value === 0) return "у момент дедлайну";
    if (value === 15) return "за 15 хвилин";
    if (value === 60) return "за 1 годину";
    if (value === 180) return "за 3 години";
    if (value === 1440) return "за 1 день";
    if (value > 0) return `за ${value} хв`;
    return null;
  };

  /**
   * Доставка й нагадування — лише коли заповнені.
   *
   * Обидва поля порожні в переважній більшості прорахунків, і рядок «Доставка —
   * Не вказано» не повідомляє нічого, крім того, що займає місце. Заповнені ж
   * вони важливі, тому не ховаються в меню, а стають рядком під доріжкою.
   */
  const sideExtras = useMemo(() => {
    const extras: Array<{ label: string; value: string }> = [];
    const delivery = quote?.delivery_type ?? quote?.print_type ?? null;
    if (delivery) extras.push({ label: "Доставка", value: formatDeliveryLabel(delivery) });
    const reminder = formatReminderOffsetLabel(quote?.deadline_reminder_offset_minutes ?? null);
    if (reminder) extras.push({ label: "Нагадування", value: reminder });
    return extras;
  }, [quote?.delivery_type, quote?.print_type, quote?.deadline_reminder_offset_minutes]);

  const getDeadlineBadge = (value?: string | null) => {
    if (!value) {
      return { label: "Без дедлайну", tone: "none" as QuoteDeadlineTone };
    }
    const date = parseDeadlineDate(value);
    if (!date) {
      return { label: "Без дедлайну", tone: "none" as QuoteDeadlineTone };
    }
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDeadline = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Прострочено (${Math.abs(diffDays)} дн.)`,
        tone: "overdue" as QuoteDeadlineTone,
      };
    }
    if (diffDays === 0) {
      return {
        label: "Сьогодні",
        tone: "today" as QuoteDeadlineTone,
      };
    }
    if (diffDays <= 2) {
      return {
        label: diffDays === 1 ? "Завтра" : `Через ${diffDays} дн.`,
        tone: "soon" as QuoteDeadlineTone,
      };
    }
    return {
      label: date.toLocaleDateString("uk-UA"),
      tone: "future" as QuoteDeadlineTone,
    };
  };

  const memberById = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member.label])),
    [teamMembers]
  );
  const memberAvatarById = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member.avatarUrl ?? null])),
    [teamMembers]
  );
  const hasRoleInfo = useMemo(() => teamMembers.some((member) => !!member.jobRole), [teamMembers]);
  const designerMembers = useMemo(() => {
    return teamMembers.filter(
      (member) => isDesignerJobRole(member.jobRole) && !memberInactiveById[member.id]
    );
  }, [teamMembers, memberInactiveById]);
  const selectedDesignOutputFile = useMemo(() => {
    const metadata = designTask?.metadata ?? {};
    const selectedId =
      typeof metadata.selected_design_output_file_id === "string"
        ? metadata.selected_design_output_file_id.trim()
        : "";
    const files = parseDesignOutputMetaFiles(metadata.design_output_files);
    return files.find((file) => file.id === selectedId) ?? null;
  }, [designTask?.metadata]);
  const selectedDesignOutputStoragePath = useMemo(() => {
    const value = designTask?.metadata?.selected_design_output_storage_path;
    if (typeof value === "string" && value.trim()) return value.trim();
    return selectedDesignOutputFile?.storage_path ?? null;
  }, [designTask?.metadata, selectedDesignOutputFile]);
  const selectedDesignOutputFileName = useMemo(() => {
    const value = designTask?.metadata?.selected_design_output_file_name;
    if (typeof value === "string" && value.trim()) return value.trim();
    return selectedDesignOutputFile?.file_name ?? null;
  }, [designTask?.metadata, selectedDesignOutputFile]);
  const visibleDesignVisualizations = useMemo(() => {
    const selected = designVisualizations.find(
      (file) =>
        (selectedDesignOutputStoragePath && file.storagePath === selectedDesignOutputStoragePath) ||
        (selectedDesignOutputFileName && file.name === selectedDesignOutputFileName)
    );
    const rest = designVisualizations.filter((file) => file.id !== selected?.id);
    return selected ? [selected, ...rest] : designVisualizations;
  }, [designVisualizations, selectedDesignOutputFileName, selectedDesignOutputStoragePath]);
  const getMemberLabel = (userId?: string | null) => {
    if (!userId) return "Не вказано";
    return memberById.get(userId) ?? userId;
  };
  const quoteLock = useEntityLock({
    teamId,
    entityType: "quote",
    entityId: quoteId,
    userId,
    userLabel: userId ? memberById.get(userId) ?? null : null,
    enabled: !!teamId && !!quoteId && !!userId,
  });
  const quoteLockedByOther = quoteLock.lockedByOther;
  const mentionSuggestions = useMemo<MentionSuggestion[]>(
    () =>
      teamMembers
        .filter((member) => member.id !== userId)
        .map((member) => {
          const label = (mentionLabelOverrides[member.id] ?? member.label ?? "").trim() || "Користувач";
          return {
            id: member.id,
            label,
            alias: buildMentionAlias(label, member.id),
            avatarUrl: member.avatarUrl ?? null,
          };
        })
        .sort((a, b) => {
          const aGeneric = isGenericMentionLabel(a.label);
          const bGeneric = isGenericMentionLabel(b.label);
          if (aGeneric !== bGeneric) return aGeneric ? 1 : -1;
          return a.label.localeCompare(b.label, "uk");
        }),
    [mentionLabelOverrides, teamMembers, userId]
  );
  const mentionLookup = useMemo(() => {
    const map = new Map<string, Set<string>>();

    const addKey = (raw: string | null | undefined, userId: string) => {
      const key = normalizeMentionKey(raw);
      if (!key) return;
      const existing = map.get(key) ?? new Set<string>();
      existing.add(userId);
      map.set(key, existing);
    };

    for (const suggestion of mentionSuggestions) {
      const label = suggestion.label;
      if (!label) continue;

      addKey(suggestion.id, suggestion.id);
      addKey(suggestion.alias, suggestion.id);
      addKey(label, suggestion.id);
      addKey(label.replace(/\s+/g, ""), suggestion.id);
      addKey(label.replace(/\s+/g, "."), suggestion.id);
      addKey(label.replace(/\s+/g, "_"), suggestion.id);
      addKey(toEmailLocalPart(label), suggestion.id);

      for (const part of label.split(/\s+/).filter((token) => token.length >= 2)) {
        addKey(part, suggestion.id);
      }
    }

    return map;
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

  // Індекс тримаємо в межах ПРИ ЧИТАННІ, а не ефектом.
  //
  // Ефект правив стан навздогін: список підказок уже перемалювався з коротшим
  // масивом, і лише наступним проходом індекс ставав валідним. Тепер обрізаємо
  // на місці — зайвий прохід зник, а поведінка та сама (REQ-109).
  const mentionActiveIndex =
    filteredMentionSuggestions.length === 0
      ? 0
      : Math.max(0, Math.min(mentionActiveIndexRaw, filteredMentionSuggestions.length - 1));
  // Поля дістаємо ДО ефектів: тоді їхні тіла читають лише рядки, а не весь
  // quote, і списки залежностей стають чесними. Якби в залежностях стояв сам
  // quote, набраний текст перезаписувався б на КОЖНЕ його перезавантаження —
  // навіть коли жодне з цих полів не змінилось (REQ-109).
  const quoteIdentity = quote?.id ?? null;
  const briefSourceText = quote?.design_brief ?? quote?.comment ?? "";

  const briefInputChanged = useSignatureChanged(
    `${quoteIdentity ?? ""}\u0000${briefDirty ? "1" : "0"}\u0000${briefSourceText}`
  );
  if (briefInputChanged && quoteIdentity && !briefDirty) {
    setBriefText(briefSourceText);
    setBriefError(null);
  }

  useEffect(() => {
    resizeBriefTextarea(briefTextareaRef.current, BRIEF_INLINE_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT);
    resizeBriefTextarea(briefDialogTextareaRef.current, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT);
  }, [briefEditorOpen, briefInlineEditing, briefText]);

  useEffect(() => {
    if (!briefInlineEditing) return;
    const frameId = requestAnimationFrame(() => {
      const textarea = briefTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      // Place the caret at the END so continuing to type appends to existing
      // ТЗ text instead of prepending at position 0.
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
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
      if (!textarea || briefSaving) return;
      const formatted = formatBriefSelection(textarea, formatter);
      setBriefText(formatted.nextValue);
      setBriefDirty(true);
      requestAnimationFrame(() => {
        const target = briefDialogTextareaRef.current;
        if (!target) return;
        target.focus();
        target.setSelectionRange(formatted.selectionStart, formatted.selectionEnd);
        setBriefSelection({ start: formatted.selectionStart, end: formatted.selectionEnd });
        resizeBriefTextarea(target, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT);
      });
    },
    [briefSaving]
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
    return briefText.slice(start, end);
  }, [briefSelection.end, briefSelection.start, briefText]);

  const briefSelectionStart = Math.min(briefSelection.start, briefSelection.end);
  const briefSelectionEnd = Math.max(briefSelection.start, briefSelection.end);
  const briefSelectionBeforeBold = briefText.slice(Math.max(0, briefSelectionStart - 2), briefSelectionStart);
  const briefSelectionAfterBold = briefText.slice(briefSelectionEnd, briefSelectionEnd + 2);
  const briefSelectionBeforeItalic = briefText.slice(Math.max(0, briefSelectionStart - 1), briefSelectionStart);
  const briefSelectionAfterItalic = briefText.slice(briefSelectionEnd, briefSelectionEnd + 1);

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
  const currentStatus = normalizeStatus(quote?.status);

  useEffect(() => {
    if (!runsLoaded || runsSaving || quoteRequirements.length > 0) return;
    if (runsAutosaveSignature === runsOriginalAutosaveSignature) return;

    const timer = window.setTimeout(() => {
      void saveRunsRef.current(undefined, { silent: true });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    quoteRequirements.length,
    runsAutosaveSignature,
    runsLoaded,
    runsOriginalAutosaveSignature,
    runsSaving,
  ]);

  const shortTaskText = briefText.trim();
  const designBriefPreview = [ 
    designDeadlineDate
      ? `Дедлайн дизайну: ${formatShortDeadlineLabel(
          combineDeadlineValue(designDeadlineDate, designDeadlineTime)
        )}`
      : null,
    shortTaskText || null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const nextAction = STATUS_NEXT_ACTION[currentStatus] ?? STATUS_NEXT_ACTION.new;

  /**
   * Чому перехід статусу зараз неможливий — людською мовою.
   *
   * Раніше ці три причини виражались одним способом: кнопка ставала сірою.
   * Сіра кнопка не каже НІЧОГО — ні того, що бракує поля, ні того, що картку
   * тримає колега. Тепер причина пишеться текстом там, куди людина клікає,
   * а кнопок-інвалідів у шапці немає взагалі.
   *
   * Порядок перевірок = порядок, у якому їх можна усунути: спершу права
   * (нічого не вдієш), потім чужий лок (можна попросити), потім поля (можна
   * заповнити самому).
   */
  const statusBlockReason = !canEditQuoteContent
    ? "Змінювати статус може менеджер цього прорахунку або керівник."
    : quoteLockedByOther
      ? `${quoteLock.holderName ?? "Інший користувач"} зараз редагує прорахунок — статус зміниться, коли редагування завершиться.`
      : quoteRequirements.length > 0
        ? `Спершу заповніть: ${quoteRequirements.join(", ")}.`
        : null;

  const canEditRuns = useMemo(
    () =>
      canEditQuoteContent &&
      ["new", "estimating", "estimated", "awaiting_approval", "approved"].includes(
        currentStatus ?? ""
      ),
    [canEditQuoteContent, currentStatus]
  );

  // Чи стало вже замовлення з цього прорахунку. Питаємо один раз на відкриття:
  // назад цей перехід не буває, а поки відповідь не прийшла, поводимось як із
  // вільним прорахунком — інакше мережева затримка виглядала б як заборона.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!teamId || !quoteId) {
        if (!cancelled) setQuoteOrderRef(null);
        return;
      }
      const found = await fetchQuoteOrderRef(teamId, quoteId);
      if (cancelled) return;
      if (found.ok) {
        setQuoteOrderRef(found.data);
        return;
      }
      // Замок, що клацнув від збою запиту, зупинив би роботу на рівному місці.
      // Тому невдала перевірка лишає позиції відкритими й тільки шумить у консоль.
      console.error("Не вдалося перевірити замовлення прорахунку", found.message);
      setQuoteOrderRef(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, quoteId]);

  // Позиції прорахунку: додавати, правити й видаляти можна доти, доки з нього не
  // зробили замовлення. Після замовлення в ньому лежить копія позицій, і зміна
  // прорахунку розвела б документи — тому далі це вже читання.
  const quoteConvertedToOrder = quoteOrderRef !== null;
  const canManageItems = canEditQuoteContent && !quoteConvertedToOrder;
  // «На погодженні» й «Затверджено» правити не забороняємо, але кожну таку
  // зміну лишаємо в стрічці подій: цифру вже бачив замовник.
  const itemChangeNeedsTrace =
    currentStatus === "awaiting_approval" || currentStatus === "approved";
  const itemsLockedHint = quoteConvertedToOrder
    ? `Замовлення${quoteOrderRef?.quoteNumber ? ` ${quoteOrderRef.quoteNumber}` : ""} вже зберегло копію позицій. Зміна прорахунку розвела б документи, тому позиції тут закриті.`
    : null;
  // Разове попередження про новий поріг заробітку (CEO 19.08: «попередь
  // команду — при вході в прорахунок вікно по центру екрану»). Прапорець у
  // localStorage, а не в базі: це оголошення, а не право. Побачив ще раз —
  // нічого страшного; не побачив зовсім — гірше.
  const marginNoticeKey = userId ? `tosho_margin_notice_v1_${userId}` : null;
  // Чи бачили підказку — читаємо сховище один раз на ключ, а не щорендеру.
  const marginNoticeAlreadySeen = useMemo(() => {
    if (!marginNoticeKey) return true;
    try {
      return Boolean(window.localStorage.getItem(marginNoticeKey));
    } catch {
      return true; // приватний режим — краще змовчати, ніж падати
    }
  }, [marginNoticeKey]);

  // Показ — похідне значення, а не окремий стан. Ефект виставляв його
  // синхронно, тобто підказка з'являлась лише другим проходом рендеру; тепер
  // видно одразу, і зайвого проходу немає (REQ-109).
  const [marginNoticeDismissed, setMarginNoticeDismissed] = useState(false);
  const showMarginNotice = canEditRuns && !marginNoticeAlreadySeen && !marginNoticeDismissed;

  const dismissMarginNotice = () => {
    setMarginNoticeDismissed(true);
    if (!marginNoticeKey) return;
    try {
      window.localStorage.setItem(marginNoticeKey, new Date().toISOString());
    } catch {
      // не змогли запам'ятати — покажемо ще раз, це не втрата
    }
  };

  // Кількість тиражу, додавання й видалення лишаються на спільному canEditRuns,
  // а чотири поля ціни розходяться по посадах. Статусний гейт зверху: у
  // закритому прорахунку не редагує ніхто, хоч би яка була посада.
  const runPriceFieldAccess = useMemo(() => {
    const byRole = resolveQuoteRunPriceFieldAccess({ viewerJobRole, permissions });
    return {
      unit_price_model: canEditRuns && byRole.unit_price_model,
      unit_price_print: canEditRuns && byRole.unit_price_print,
      logistics_cost: canEditRuns && byRole.logistics_cost,
      desired_manager_income: canEditRuns && byRole.desired_manager_income,
    };
  }, [canEditRuns, permissions, viewerJobRole]);

  // Параметри виробу редагує той самий, хто редагує тиражі: право на вміст
  // прорахунку плюс незакритий статус. Окремого гейта свідомо не заводимо — друге
  // правило про те саме рано чи пізно розійдеться з першим.
  const canEditPrintSpec = canEditRuns;

  /** Позиції, на які задача вже є (у старих задач позиції немає — вони нічого не «займають»). */
  const designTaskItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of designTasks) {
      const itemId = task.metadata?.quote_item_id;
      if (typeof itemId === "string" && itemId.trim()) ids.add(itemId.trim());
    }
    return ids;
  }, [designTasks]);

  const itemsWithoutDesignTask = useMemo(
    () => items.filter((item) => !designTaskItemIds.has(item.id)),
    [designTaskItemIds, items]
  );

  /**
   * Ще одну задачу пропонуємо лише тоді, коли позицій більше, ніж задач. На
   * прорахунку з однією позицією й однією задачею кнопки, як і раніше, немає —
   * інакше на старих прорахунках з'явилась би можливість наплодити дублів.
   */
  const canCreateMoreDesignTasks = items.length > designTasks.length;

  /**
   * Значення, які завантажувачі читають НА МОМЕНТ ВИКЛИКУ.
   *
   * Досі кожен load* був звичайною стрілкою — React перестворював її щорендеру,
   * тож усередині завжди опинялись найсвіжіші значення. useCallback це змінює:
   * він заморожує захоплені змінні до наступної зміни списку залежностей.
   *
   * Якби ці об'єкти просто поїхали в списки залежностей, змінилась би поведінка:
   * права й склад команди доїжджають пізніше за прорахунок, і ефект нижче, який
   * СКИДАЄ весь стан сторінки, спрацював би вдруге — рівно та подвійна хвиля,
   * про яку попереджає коментар усередині нього.
   *
   * Тому об'єктні значення читаємо через ref. Це не хитрість, а дослівний
   * переклад того, що було: «бери найсвіжіше, коли тебе покликали». Завдяки
   * цьому всі load* залежать лише від quoteId і teamId, тобто сталі на весь час
   * життя сторінки — і їх можна чесно вписати в залежності ефектів (REQ-109).
   */
  const loaderInputsRef = useRef({ memberById, permissions, userId, quote, designTask, canCreateMoreDesignTasks });
  useEffect(() => {
    loaderInputsRef.current = { memberById, permissions, userId, quote, designTask, canCreateMoreDesignTasks };
  });

  const runFieldLockHint = (allowed: boolean, who: string) =>
    canEditRuns && !allowed ? `Це поле заповнює ${who}` : undefined;

  const openStatusDialog = () => {
    if (quoteRequirements.length > 0) {
      const message = `Щоб змінити статус, заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`;
      setStatusError(message);
      toast.error(message);
      return;
    }
    setStatusTarget(currentStatus ?? "new");
    setStatusNote("");
    setStatusDialogOpen(true);
  };

  const handlePrimaryStatusAction = () => {
    if (statusBusy) return;
    if (quoteRequirements.length > 0) {
      const message = `Щоб змінити статус, заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`;
      setStatusError(message);
      toast.error(message);
      return;
    }
    if (!nextAction.nextStatus) {
      openStatusDialog();
      return;
    }
    void handleQuickStatusChange(nextAction.nextStatus, "");
  };

  const openCreateOrderDialog = async () => {
    if (currentStatus !== "approved") {
      const message = "Замовлення можна створити тільки із затвердженого прорахунку.";
      setCreateOrderError(message);
      toast.error(message);
      return;
    }
    setCreateOrderLoading(true);
    setCreateOrderError(null);
    setCreateOrderDialogOpen(true);
    const prepared = await fetchOrderCreationDraft(teamId, quoteId, userId);
    if (prepared.ok) {
      const draft = prepared.data;
      setCreateOrderDraft(draft);
      setCreateOrderSelectedItemIds(
        draft.selectableItems.map((item) => item.quoteItemId ?? item.id).filter(Boolean) as string[]
      );
    } else {
      setCreateOrderDraft(null);
      setCreateOrderSelectedItemIds([]);
      setCreateOrderError(prepared.message);
    }
    setCreateOrderLoading(false);
  };

  const toggleCreateOrderItem = (quoteItemId: string, checked: boolean) => {
    setCreateOrderSelectedItemIds((prev) => {
      if (checked) return Array.from(new Set([...prev, quoteItemId]));
      return prev.filter((id) => id !== quoteItemId);
    });
  };

  const handleCreateOrder = async () => {
    if (!createOrderDraft) return;
    setCreateOrderSubmitting(true);
    setCreateOrderError(null);
    const created = await createOrderFromQuote({
      teamId,
      quoteId,
      selectedQuoteItemIds: createOrderSelectedItemIds,
      userId,
    });
    if (created.ok) {
      toast.success(created.data.created ? "Замовлення створено" : "Замовлення вже існує");
      window.location.assign(`/orders/production/${created.data.id}`);
    } else {
      setCreateOrderError(created.message);
    }
    setCreateOrderSubmitting(false);
  };

  const activityEvents = useMemo<ActivityEvent[]>(() => {
    const statusEvents: ActivityEvent[] = history.map((item) => {
      const toStatus = normalizeStatus(item.to_status);
      const fromStatus = normalizeStatus(item.from_status);
      const Icon = statusIcons[toStatus] ?? Clock;
      const title = item.from_status
        ? `${formatStatusLabel(fromStatus)} → ${formatStatusLabel(toStatus)}`
        : `Статус: ${formatStatusLabel(toStatus)}`;
      return {
        id: `status-${item.id}`,
        type: "status",
        created_at: item.created_at ?? new Date().toISOString(),
        title,
        description: item.note ?? undefined,
        actorId: item.changed_by ?? null,
        actorLabel: item.changed_by
          ? memberById.get(item.changed_by) ?? "Невідомий користувач"
          : "Система",
        icon: Icon,
        accentClass: statusClasses[toStatus] ?? statusClasses.new,
      };
    });

    const commentEvents: ActivityEvent[] = comments.map((comment) => ({
      id: `comment-${comment.id}`,
      type: "comment",
      created_at: comment.created_at,
      title: "Додав коментар",
      description: comment.body,
      actorId: comment.created_by ?? null,
      actorLabel: comment.created_by
        ? memberById.get(comment.created_by) ?? "Невідомий користувач"
        : "Невідомий користувач",
      icon: MessageSquare as ActivityIcon,
      accentClass: "quote-activity-accent-comment",
    }));

    const hasHistory = history.length > 0;
    const activityLogEvents: ActivityEvent[] = activityRows
      .filter((row) => {
        const metadata = parseActivityMetadata(row.metadata);
        const source = typeof metadata?.source === "string" ? metadata.source : "";
        if (source === "quote_comment") return false;
        if (source === "quote_status" && hasHistory) return false;
        return true;
      })
      .map((row) => {
        const metadata = parseActivityMetadata(row.metadata);
        const source = typeof metadata?.source === "string" ? metadata.source : "";
        const type: ActivityEvent["type"] =
          source === "quote_runs"
            ? "runs"
            : source === "quote_status"
            ? "status"
            : source === "quote_deadline"
            ? "status"
            : "other";
        const itemTitle = typeof metadata?.item_title === "string" ? metadata.item_title : null;
        const actorLabel =
          row.user_id && memberById.has(row.user_id)
            ? memberById.get(row.user_id) ?? row.actor_name ?? "Користувач"
            : row.actor_name ?? "Користувач";
        const fromStatus =
          typeof metadata?.from === "string" ? normalizeStatus(metadata.from) : null;
        const toStatus =
          typeof metadata?.to === "string" ? normalizeStatus(metadata.to) : null;
        const fromDeadline =
          typeof metadata?.from === "string" ? (metadata.from as string) : null;
        const toDeadline =
          typeof metadata?.to === "string" ? (metadata.to as string) : null;
        const deadlineTitle =
          source === "quote_deadline"
            ? `Дедлайн: ${formatDeadlineLabel(fromDeadline)} → ${formatDeadlineLabel(toDeadline)}`
            : null;
        const title =
          source === "quote_status" && fromStatus && toStatus
            ? `${formatStatusLabel(fromStatus)} → ${formatStatusLabel(toStatus)}`
            : source === "quote_deadline" && deadlineTitle
            ? deadlineTitle
            : row.title?.trim() || `${actorLabel} ${row.action ?? "оновив"}`.trim();
        const description =
          typeof metadata?.note === "string"
            ? metadata.note
            : source === "quote_items" && itemTitle
            ? `Позиція: ${itemTitle}`
            : undefined;
        const Icon: ActivityIcon =
          source === "quote_runs"
            ? Calculator
            : source === "quote_items"
            ? Package
            : source === "quote_status" && toStatus
            ? (statusIcons[toStatus] as ActivityIcon) ?? Clock
            : source === "quote_deadline"
            ? Calendar
            : Clock;
        const accentClass =
          source === "quote_runs"
            ? "quote-activity-accent-runs"
            : source === "quote_items"
            ? "quote-activity-accent-items"
            : source === "quote_status" && toStatus
            ? statusClasses[toStatus] ?? statusClasses.new
            : source === "quote_deadline"
            ? "quote-activity-accent-deadline"
            : "quote-activity-accent-default";
        return {
          id: `activity-${row.id}`,
          type,
          created_at: row.created_at,
          title,
          description,
          actorId: row.user_id ?? null,
          actorLabel,
          icon: Icon,
          accentClass,
        };
      });

    return [...statusEvents, ...commentEvents, ...activityLogEvents].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [activityRows, comments, history, memberById]);

  const activityGroups = useMemo(() => {
    const groups: { label: string; items: ActivityEvent[] }[] = [];
    activityEvents.forEach((event) => {
      const label = formatActivityDayLabel(event.created_at);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.label !== label) {
        groups.push({ label, items: [event] });
      } else {
        lastGroup.items.push(event);
      }
    });
    return groups;
  }, [activityEvents]);

  const totals = useMemo(() => {
    const subtotal = activeRunPricingSummaries.length > 0 ? activeRunPricingTotals.saleTotal : itemsSubtotal;
    return {
      subtotal,
      discountAmount: 0,
      total: Math.max(0, subtotal),
    };
  }, [activeRunPricingSummaries.length, activeRunPricingTotals.saleTotal, itemsSubtotal]);

  const catalogSelectionIndex = useMemo(() => {
    const typeIdByKindId = new Map<string, string>();
    const pathByModelId = new Map<string, { typeId: string; kindId: string }>();

    catalogTypes.forEach((type) => {
      type.kinds.forEach((kind) => {
        typeIdByKindId.set(kind.id, type.id);
        kind.models.forEach((model) => {
          pathByModelId.set(model.id, { typeId: type.id, kindId: kind.id });
        });
      });
    });

    return { typeIdByKindId, pathByModelId };
  }, [catalogTypes]);

  const resolveCatalogSelection = useCallback(
    ({ typeId, kindId, modelId }: ResolvedCatalogSelection): ResolvedCatalogSelection => {
      if (modelId) {
        const modelPath = catalogSelectionIndex.pathByModelId.get(modelId);
        if (modelPath) return { typeId: modelPath.typeId, kindId: modelPath.kindId, modelId };
      }

      if (kindId) {
        return {
          typeId: catalogSelectionIndex.typeIdByKindId.get(kindId) ?? typeId,
          kindId,
          modelId,
        };
      }

      return { typeId, kindId, modelId };
    },
    [catalogSelectionIndex]
  );

  const runSections = useMemo(() => {
    const indexedRuns = runs.map((run, index) => ({ run, index }));
    type RunSection = {
      key: string;
      item: QuoteItem | null;
      title: string;
      meta: string;
      imageUrl: string | null;
      zoomImageUrl: string | null;
      runs: Array<{ run: QuoteRun; index: number }>;
    };

    const getItemSectionMeta = (item: QuoteItem, fallbackIndex: number): RunSection => {
      const { typeId: resolvedTypeId, kindId: resolvedKindId, modelId: resolvedModelId } =
        resolveCatalogSelection({
          typeId: item.catalogTypeId ?? item.productTypeId ?? undefined,
          kindId: item.catalogKindId ?? item.productKindId ?? undefined,
          modelId: item.catalogModelId ?? item.productModelId ?? undefined,
        });
      const typeLabel = item.resolvedTypeName ?? getTypeLabel(catalogTypes, resolvedTypeId);
      const kindLabel = item.resolvedKindName ?? getKindLabel(catalogTypes, resolvedTypeId, resolvedKindId);
      const modelLabel =
        item.resolvedModelName ?? getModelLabel(catalogTypes, resolvedTypeId, resolvedKindId, resolvedModelId);
      const catalogZoomImage =
        item.resolvedModelImageUrl ?? getModelImage(catalogTypes, resolvedTypeId, resolvedKindId, resolvedModelId);
      const catalogImage = item.resolvedModelThumbUrl ?? catalogZoomImage;
      const attachmentImage =
        !resolvedModelId && item.attachment?.url && item.attachment.type.startsWith("image/")
          ? item.attachment.url
          : null;

      return {
        key: item.id,
        item,
        title: item.title || modelLabel || `Товар ${fallbackIndex + 1}`,
        meta: [typeLabel, kindLabel].filter(Boolean).join(" / "),
        imageUrl: catalogImage ?? attachmentImage ?? null,
        zoomImageUrl: catalogZoomImage ?? attachmentImage ?? catalogImage ?? null,
        runs: indexedRuns.filter(({ run }) =>
          run.quote_item_id ? run.quote_item_id === item.id : items.length === 1
        ),
      };
    };

    if (items.length === 0) {
      return [
        {
          key: "all",
          item: null,
          title: "Тиражі прорахунку",
          meta: "",
          imageUrl: null,
          zoomImageUrl: null,
          runs: indexedRuns,
        },
      ];
    }

    const sections: RunSection[] = items.map(getItemSectionMeta);
    const unassignedRuns = indexedRuns.filter(({ run }) => !run.quote_item_id);
    if (items.length > 1 && unassignedRuns.length > 0) {
      sections.push({
        key: "unassigned",
        item: null,
        title: "Без прив'язки до товару",
        meta: "Старі або імпортовані тиражі",
        imageUrl: null,
        zoomImageUrl: null,
        runs: unassignedRuns,
      });
    }

    return sections;
  }, [catalogTypes, items, resolveCatalogSelection, runs]);

  const resolvedItemSelection = useMemo(
    () =>
      resolveCatalogSelection({
        typeId: itemTypeId || undefined,
        kindId: itemKindId || undefined,
        modelId: itemModelId || undefined,
      }),
    [itemKindId, itemModelId, itemTypeId, resolveCatalogSelection]
  );

  const effectiveItemTypeId = resolvedItemSelection.typeId ?? itemTypeId;
  const effectiveItemKindId = resolvedItemSelection.kindId ?? itemKindId;
  const effectiveItemModelId = resolvedItemSelection.modelId ?? itemModelId;

  const selectedType = useMemo(
    () => catalogTypes.find((type) => type.id === effectiveItemTypeId) ?? null,
    [catalogTypes, effectiveItemTypeId]
  );

  const availableKinds = selectedType?.kinds ?? [];
  const selectedKind = availableKinds.find((kind) => kind.id === effectiveItemKindId) ?? null;
  const availableModels = selectedKind?.models ?? [];
  // Лише methods обгорнуто: сусідні kinds/models у списки залежностей не
  // потрапляють, а цей масив читає ефект нижче — і без сталої тотожності
  // перезапускався б на кожен рендер сторінки.
  //
  // Рахуємо від кореня (catalogTypes + два id), а не від selectedKind поруч:
  // ланцюжок проміжних значень React Compiler незмінним визнати не може
  // («Existing memoization could not be preserved») і через це пропускає всю
  // сторінку. Від стану й двох рядків — вміє (REQ-109).
  const availableMethods = useMemo(
    () =>
      catalogTypes
        .find((type) => type.id === effectiveItemTypeId)
        ?.kinds.find((kind) => kind.id === effectiveItemKindId)?.methods ?? [],
    [catalogTypes, effectiveItemKindId, effectiveItemTypeId]
  );

  const catalogGroups = useMemo(() => {
    return catalogTypes.map((type) => ({
      id: type.id,
      label: type.name,
      items: type.kinds.flatMap((kind) =>
        kind.models.map((model) => ({
          typeId: type.id,
          kindId: kind.id,
          modelId: model.id,
          label: model.name,
          kindLabel: kind.name,
          price: model.price ?? 0,
        }))
      ),
    }));
  }, [catalogTypes]);

  const computedItemPrice = useMemo(() => {
    if (itemFormMode === "simple") {
      return Number(itemPrice) || 0;
    }
    const qty = Math.max(1, Number(itemQty) || 1);
    const base = getModelPrice(catalogTypes, effectiveItemTypeId, effectiveItemKindId, effectiveItemModelId, qty);
    const methodsTotal = itemMethods.reduce((sum, method) => {
      return sum + getMethodPrice(catalogTypes, effectiveItemTypeId, effectiveItemKindId, method.methodId) * method.count;
    }, 0);
    return Math.max(0, base + methodsTotal);
  }, [catalogTypes, effectiveItemKindId, effectiveItemModelId, effectiveItemTypeId, itemMethods, itemPrice, itemFormMode, itemQty]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);

      const base = await fetchCatalogBase(teamId);
      if (!base.ok) {
        if (!cancelled) {
          setCatalogError(base.message);
          setCatalogTypes([]);
          setCatalogLoading(false);
        }
        return;
      }
      const { typeRows, kindRows, modelRows } = base.data;

        const buildCatalog = ({
          methodsByKind,
          printPositionsByKind,
          methodIdsByModel,
          tiersByModel,
        }: {
          methodsByKind: Map<string, CatalogMethod[]>;
          printPositionsByKind: Map<string, CatalogPrintPosition[]>;
          methodIdsByModel: Map<string, string[]>;
          tiersByModel: Map<string, CatalogPriceTier[]>;
        }) => {
          const modelsByKind = new Map<string, CatalogModel[]>();
          ((modelRows ?? []) as Array<{
            id: string;
            kind_id: string;
            name: string;
            price?: number | null;
            image_url?: string | null;
            configuratorPreset?: "print_package" | "print_notebook" | "print_note_blocks" | "print_certificates" | null;
            specPreset?: string | null;
            supplierUrl?: string | null;
            avantprintUrl?: string | null;
          }>).forEach((row) => {
            const list = modelsByKind.get(row.kind_id) ?? [];
            list.push({
              id: row.id,
              name: row.name,
              price: row.price ?? undefined,
              imageUrl: row.image_url ?? undefined,
              metadata:
                row.configuratorPreset || row.specPreset || row.supplierUrl || row.avantprintUrl
                  ? {
                      configuratorPreset: row.configuratorPreset ?? undefined,
                      specPreset: row.specPreset ?? null,
                      supplierUrl: row.supplierUrl ?? null,
                      avantprintUrl: row.avantprintUrl ?? null,
                    }
                  : undefined,
              methodIds: methodIdsByModel.get(row.id) ?? [],
              priceTiers: tiersByModel.get(row.id),
            });
            modelsByKind.set(row.kind_id, list);
          });

          const kindsByType = new Map<string, CatalogKind[]>();
          (kindRows ?? []).forEach((row) => {
            const list = kindsByType.get(row.type_id) ?? [];
            const models = modelsByKind.get(row.id) ?? [];
            list.push({
              id: row.id,
              name: row.name,
              modelCount: models.length,
              models,
              methods: methodsByKind.get(row.id) ?? [],
              printPositions: printPositionsByKind.get(row.id) ?? [],
            });
            kindsByType.set(row.type_id, list);
          });

          return (typeRows ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            kinds: kindsByType.get(row.id) ?? [],
          }));
        };

        // Перший прохід: дерево видно одразу, без методів і позицій нанесення.
        // Другий прохід нижче їх дозаповнює — саме заради цього два запити, а
        // не один.
        if (!cancelled) {
          setCatalogTypes(
            buildCatalog({
              methodsByKind: new Map(),
              printPositionsByKind: new Map(),
              methodIdsByModel: new Map(),
              tiersByModel: new Map(),
            })
          );
          setCatalogLoading(false);
        }

        const enriched = await fetchCatalogEnrichment(
          teamId,
          modelRows.map((row) => row.id)
        );
        if (!enriched.ok) {
          if (!cancelled) {
            setCatalogError(enriched.message);
            setCatalogTypes([]);
            setCatalogLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setCatalogTypes(buildCatalog(enriched.data));
          setCatalogLoading(false);
        }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !userId) return;
    let active = true;
    const loadMembers = async () => {
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) {
          if (active) setTeamMembers([]);
          return;
        }
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        const nextInactiveById: Record<string, boolean> = {};
        const nextMembers = rows.map((row) => {
          nextInactiveById[row.userId] = isInactiveEmployment(row.employmentStatus);
          return {
            id: row.userId,
            label: row.label,
            avatarUrl: row.avatarDisplayUrl,
            jobRole: row.jobRole ?? null,
          } satisfies TeamMemberRow;
        });

        if (!active) return;
        setTeamMembers(nextMembers);
        setMemberInactiveById(nextInactiveById);
      } catch {
        if (active) {
          setTeamMembers([]);
          setMemberInactiveById({});
        }
      }
    };
    void loadMembers();
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  // Імена для згадок @ підтягуємо ЛИШЕ коли людина справді почала згадку.
  //
  // Раніше це висіло на монтуванні сторінки — і тягло за собою netlify-функцію
  // create-workspace-invite, яка на холодному старті відповідає 1.8-2.4 секунди
  // (заміряно на проді 21.08.2026). Тобто відкриття картки прорахунку чекало
  // на дані, потрібні хіба що тому, хто зараз писатиме коментар зі згадкою.
  // Поки список не підвантажився, у підказці стоять звичайні імена з
  // teamMembers — вона працює, просто без уточнених підписів.
  const mentionLabelsRequestedRef = useRef(false);
  const mentionLabelsNeeded = mentionContext !== null;

  useEffect(() => {
    if (!mentionLabelsNeeded) return;
    if (mentionLabelsRequestedRef.current) return;
    if (teamMembers.length === 0) return;
    if (import.meta.env.DEV) return;
    mentionLabelsRequestedRef.current = true;

    let active = true;
    const loadMentionLabelOverrides = async () => {
      const genericMemberIds = teamMembers
        .filter((member) => isGenericMentionLabel(member.label))
        .map((member) => member.id);

      const result = await fetchMentionLabelOverrides(genericMemberIds);
      if (!active) return;
      if (!result.ok) {
        setMentionLabelOverrides({});
        return;
      }
      // null — «міняти нема кого»: підписи лишаються ті, що були.
      if (result.data === null) return;
      setMentionLabelOverrides(result.data);
    };

    void loadMentionLabelOverrides();
    return () => {
      active = false;
    };
  }, [mentionLabelsNeeded, teamMembers]);

  useEffect(() => {
    if (!teamId || !editQuoteDialogOpen) return;
    let active = true;
    const loadCustomers = async () => {
      setEditQuoteCustomersLoading(true);
      const result = await fetchQuotePartyOptions(teamId, editQuoteCustomerSearch);
      // Пізня відповідь на вже скасований пошук нічого не чіпає.
      if (!active) return;
      setEditQuoteCustomers(result.ok ? result.data : []);
      setEditQuoteCustomersLoading(false);
    };
    void loadCustomers();
    return () => {
      active = false;
    };
  }, [teamId, editQuoteDialogOpen, editQuoteCustomerSearch]);

  const loadQuote = useCallback(async () => {
    const { userId: currentUserId, permissions: currentPermissions } = loaderInputsRef.current;
    setError(null);
    const result = await fetchQuoteSummaryForDetails(quoteId, teamId, {
      userId: currentUserId,
      permissions: currentPermissions,
    });
    if (!result.ok) {
      const message = result.message;
      if ((message ?? "").toLowerCase().includes("stack depth limit exceeded")) {
        setError("Помилка БД (stack depth limit exceeded). Перевірте RLS/policy у таблицях quote_*.");
      } else {
        setError(message);
      }
      setLoading(false);
      return;
    }
    {
      const summary = result.data;
      setQuote(summary);
      setDeadlineDate(toDateInputValue(summary.deadline_at ?? null));
      setDeadlineTime(toTimeInputValue(summary.deadline_at ?? null));
      setCustomerDeadlineDate(toDateInputValue(summary.customer_deadline_at ?? null));
      setCustomerDeadlineTime(toTimeInputValue(summary.customer_deadline_at ?? null));
      setDesignDeadlineDate(toDateInputValue(summary.design_deadline_at ?? null));
      setDesignDeadlineTime(toTimeInputValue(summary.design_deadline_at ?? null));
      setDeadlineNote(summary.deadline_note ?? "");
      setDeadlineReminderOffset(
        summary.deadline_reminder_offset_minutes === null || summary.deadline_reminder_offset_minutes === undefined
          ? "0"
          : String(summary.deadline_reminder_offset_minutes)
      );
      setDeadlineReminderComment(summary.deadline_reminder_comment ?? "");
      persistQuoteDetailsCache(teamId, quoteId, summary);
    }
    setLoading(false);
  }, [quoteId, teamId]);

  const loadDesignTask = useCallback(async () => {
    if (!quoteId || !teamId) {
      setDesignTasks([]);
      setDesignTask(null);
      setDesignAssigneeId(null);
      setDesignTaskType(null);
      return;
    }
    setDesignTaskLoading(true);
    setDesignTaskError(null);
    // «Основною» лишається найновіша задача (нею керує панель нижче), решта
    // видно списком — тому запит повертає всі, а не одну.
    const result = await fetchDesignTaskRows(quoteId, teamId);
    if (!result.ok) {
      setDesignTaskError(result.message);
      setDesignTasks([]);
      setDesignTask(null);
      setDesignTaskType(null);
      setDesignTaskLoading(false);
      return;
    }
    const rows = result.data;
    const row = rows[0] as DesignTaskRow | undefined;
    setDesignTasks(rows);
    if (!row) {
      setDesignTask(null);
      setDesignAssigneeId(null);
      setDesignTaskType(null);
      setDesignTaskLoading(false);
      return;
    }
    const metadata = row.metadata ?? {};
    const assigneeUserId = (metadata as { assignee_user_id?: string | null }).assignee_user_id ?? null;
    const assignedAt = (metadata as { assigned_at?: string | null }).assigned_at ?? null;
    setDesignTask({
      id: row.id,
      assigneeUserId,
      assignedAt,
      metadata,
    });
    setDesignAssigneeId(assigneeUserId);
    setDesignTaskType(parseDesignTaskType((metadata as { design_task_type?: unknown }).design_task_type));
    setDesignTaskLoading(false);
  }, [quoteId, teamId]);

  const loadDesignTaskCandidates = useCallback(async () => {
    // Знімок робимо один раз на виклик — див. пояснення біля loaderInputsRef.
    const {
      quote: currentQuote,
      designTask: currentDesignTask,
      canCreateMoreDesignTasks: canCreateMore,
    } = loaderInputsRef.current;
    if (!teamId || !currentQuote) {
      setDesignTaskCandidates([]);
      return;
    }
    // Раніше тут стояло «якщо задача вже є — кандидатів немає». Тепер на
    // прорахунку може бути кілька задач, тож закриваємось лише коли вільних
    // позицій не лишилось.
    if (currentDesignTask && !canCreateMore) {
      setDesignTaskCandidates([]);
      return;
    }
    setDesignTaskCandidatesLoading(true);
    const candidatesResult = await fetchTeamDesignTasks(teamId);
    if (!candidatesResult.ok) {
      setDesignTaskCandidates([]);
      setDesignTaskCandidatesLoading(false);
      return;
    }
    {
      const data = candidatesResult.data;

      const quoteCustomerId =
        typeof (currentQuote as unknown as { customer_id?: string | null }).customer_id === "string" &&
        (currentQuote as unknown as { customer_id?: string | null }).customer_id
          ? ((currentQuote as unknown as { customer_id?: string | null }).customer_id as string)
          : null;
      const quoteCustomerName = normalizePartyMatch(currentQuote.customer_name ?? null);

      const nextCandidates = ((data ?? []) as Array<{
        id: string;
        title: string | null;
        metadata?: Record<string, unknown> | null;
        created_at?: string | null;
      }>)
        .map((row) => {
          const metadata = row.metadata ?? {};
          const taskKind = typeof metadata.task_kind === "string" ? metadata.task_kind.trim() : null;
          const metaQuoteId = typeof metadata.quote_id === "string" ? metadata.quote_id.trim() : "";
          const customerId = typeof metadata.customer_id === "string" ? metadata.customer_id.trim() : "";
          const customerName =
            typeof metadata.customer_name === "string" ? normalizePartyMatch(metadata.customer_name) : "";
          const status = typeof metadata.status === "string" ? metadata.status.trim() : null;
          const files = parseDesignOutputMetaFiles(metadata.design_output_files);
          const selectedId =
            typeof metadata.selected_design_output_file_id === "string"
              ? metadata.selected_design_output_file_id.trim()
              : "";
          const selectedFile = files.find((file) => file.id === selectedId) ?? null;
          const sameCustomer =
            (quoteCustomerId && customerId && quoteCustomerId === customerId) ||
            (!!quoteCustomerName && !!customerName && quoteCustomerName === customerName);
          const isStandalone =
            !metaQuoteId &&
            (taskKind === "standalone" ||
              typeof metadata.source === "string" && metadata.source === "design_task_created_manual");
          if (!sameCustomer || !isStandalone || status === "cancelled") return null;
          return {
            id: row.id,
            title: row.title ?? null,
            createdAt: row.created_at ?? new Date().toISOString(),
            designTaskNumber:
              typeof metadata.design_task_number === "string" && metadata.design_task_number.trim()
                ? metadata.design_task_number.trim()
                : null,
            status,
            metadata,
            selectedFile,
            outputsCount: files.length,
          } satisfies DesignTaskCandidate;
        })
        .filter(Boolean) as DesignTaskCandidate[];

      setDesignTaskCandidates(nextCandidates);
    }
    setDesignTaskCandidatesLoading(false);
  }, [teamId]);

  const attachExistingDesignTask = async (candidate: DesignTaskCandidate) => {
    if (!teamId || !quote || attachingDesignTaskId) return;
    setAttachingDesignTaskId(candidate.id);
    setDesignTaskError(null);

    const fail = (message: string) => {
      setDesignTaskError(message);
      toast.error(message);
      setAttachingDesignTaskId(null);
    };
    const FAIL_MESSAGE = "Не вдалося прив’язати дизайн-задачу.";

    const actorName = userId ? memberById.get(userId) ?? userId : "System";
    const nextMetadata: Record<string, unknown> = {
      ...(candidate.metadata ?? {}),
      quote_id: quoteId,
      quote_number: quote.number ?? null,
      quote_type: quote.quote_type ?? null,
      customer_name: quote.customer_name ?? null,
      customer_logo_url: quote.customer_logo_url ?? null,
      task_kind: "linked",
      attached_quote_at: new Date().toISOString(),
      attached_quote_by: userId ?? null,
    };

    const attached = await attachDesignTaskToQuote(candidate.id, teamId, quoteId, nextMetadata);
    if (!attached.ok) return fail(attached.message);

    const synced = await syncDesignOutputFiles(
      {
        teamId,
        quoteId,
        files: parseDesignOutputMetaFiles(candidate.metadata.design_output_files),
        fallbackUploadedBy: userId ?? null,
      },
      FAIL_MESSAGE
    );
    if (!synced.ok) return fail(synced.message);

    const taskLogged = await logDesignTaskEvent(
      {
        teamId,
        designTaskId: candidate.id,
        quoteId,
        userId,
        actorName,
        action: "design_task_attachment",
        title: `Задачу прив’язано до прорахунку ${quote.number ?? quoteId.slice(0, 8)}`,
        metadata: {
          source: "design_task_attachment",
          from_quote_id: null,
          to_quote_id: quoteId,
          selected_design_output_file_id:
            typeof candidate.metadata.selected_design_output_file_id === "string"
              ? candidate.metadata.selected_design_output_file_id
              : null,
        },
      },
      FAIL_MESSAGE
    );
    if (!taskLogged.ok) return fail(taskLogged.message);

    const logged = await logQuoteActivity(
      {
        teamId,
        action: "привʼязав дизайн-задачу",
        entityType: "quotes",
        entityId: quoteId,
        title: `Привʼязав дизайн-задачу до прорахунку ${quote.number ?? ""}`.trim(),
        href: `/orders/estimates/${quoteId}`,
        metadata: {
          source: "design_task_attachment",
          design_task_id: candidate.id,
        },
      },
      FAIL_MESSAGE
    );
    if (!logged.ok) return fail(logged.message);

    setAttachDesignTaskDialogOpen(false);
    toast.success("Дизайн-задачу прив’язано");
    await Promise.all([loadDesignTask(), loadAttachments(), loadActivityLog()]);
    setAttachingDesignTaskId(null);
  };

  const createDesignTask = async (override?: {
    assigneeUserId?: string | null;
    collaboratorUserIds?: string[];
    modelName?: string | null;
    methodsCount?: number;
    designBrief?: string | null;
    designTaskType?: DesignTaskType | null;
    /**
     * Потрібен там, де файли щойно завантажили в тому самому оброблювачі:
     * `attachments` — це стан, і в межах одного рендера він ще порожній, тож
     * порахований із нього has_files збрехав би.
     */
    hasFiles?: boolean;
  }) => {
    if (!teamId) return;
    const nextDesignTaskType = override?.designTaskType ?? designTaskType;
    if (!nextDesignTaskType) {
      setDesignTaskError("Оберіть тип дизайнерської задачі.");
      setCreateDesignTaskDialogOpen(true);
      return;
    }
    setDesignTaskSaving(true);
    setDesignTaskError(null);

    const fail = (message: string) => {
      setDesignTaskError(message);
      toast.error(message);
      setDesignTaskSaving(false);
    };

    {
      const authUser = await getCurrentUser();
      const userId = authUser?.id ?? null;
      const actorName =
        (userId ? memberById.get(userId) : null) ||
        authUser?.email ||
        "System";
      // Позиція, на яку робимо задачу. Раніше тут завжди стояла items[0], тож
      // на прорахунку з двома моделями задача називалась першою, а друга не
      // згадувалась ніде.
      const targetItem =
        (designTaskItemId ? items.find((item) => item.id === designTaskItemId) : null) ??
        itemsWithoutDesignTask[0] ??
        items[0] ??
        null;
      const modelName = override?.modelName ?? targetItem?.title ?? "Позиція";
      const methodsCount = override?.methodsCount ?? targetItem?.methods?.length ?? 0;
      const designDeadline = quote?.design_deadline_at ?? quote?.deadline_at ?? null;
      const assigneeUserId = override?.assigneeUserId ?? designAssigneeId ?? null;
      const collaboratorUserIds = Array.from(
        new Set((override?.collaboratorUserIds ?? designCollaboratorIds).filter((value) => value && value !== assigneeUserId))
      );
      const assignedAt = assigneeUserId ? new Date().toISOString() : null;
      const createdAtIso = new Date().toISOString();
      const numbered = await fetchNextDesignTaskNumber(teamId, createdAtIso);
      if (!numbered.ok) return fail(numbered.message);
      const designTaskNumber = numbered.data;

      const designTaskMetadata = withDesignTaskCollaboratorMetadata(
        {
          source: "design_task_created",
          status: "new",
          design_task_number: designTaskNumber,
          quote_id: quoteId,
          design_task_id: null,
          assignee_user_id: assigneeUserId,
          assigned_at: assignedAt,
          design_task_type: nextDesignTaskType,
          quote_type: quote?.quote_type ?? null,
          methods_count: methodsCount,
          quote_item_id: targetItem?.id ?? null,
          quote_item_title: targetItem?.title ?? null,
          // Скріпка на дизайн-задачі має означати «є що подивитись ДИЗАЙНЕРУ».
          // Файли прорахунку її не вмикають: інакше дизайнер відкриває задачу
          // по скріпці й бачить договір, який його не стосується.
          has_files: override?.hasFiles ?? attachments.some((file) => file.audience === "design"),
          design_deadline: designDeadline,
          deadline: designDeadline,
          design_brief:
            override?.designBrief ??
            designBriefPreview ??
            quote?.design_brief ??
            quote?.comment ??
            null,
          model: modelName,
        },
        collaboratorUserIds,
        {
          assigneeUserId,
          resolveLabel: (memberId) => getMemberLabel(memberId),
          resolveAvatar: (memberId) => memberAvatarById.get(memberId) ?? null,
        }
      );

      const created = await insertDesignTaskRow({
        teamId,
        userId,
        actorName,
        quoteId,
        title: `Дизайн: ${modelName}`,
        metadata: designTaskMetadata,
      });
      if (!created.ok) return fail(created.message);

      const meta = created.data.metadata;
      const nextAssignee = (meta as { assignee_user_id?: string | null }).assignee_user_id ?? assigneeUserId;
      const nextAssignedAt = (meta as { assigned_at?: string | null }).assigned_at ?? assignedAt;
      setDesignTask({
        id: created.data.id,
        assigneeUserId: nextAssignee ?? null,
        assignedAt: nextAssignedAt ?? null,
        metadata: meta,
      });
      setCreateDesignTaskDialogOpen(false);
      setDesignTaskItemId(null);
      setDesignAssigneeId(nextAssignee ?? null);
      setDesignTaskType(nextDesignTaskType);

      try {
        await notifyDesignTaskStakeholdersOnCreate({
          quoteId,
          designTaskId: created.data.id,
          assigneeUserId,
          collaboratorUserIds,
          actorUserId: userId,
          actorName,
        });
      } catch (notifyError) {
        console.warn("Failed to notify stakeholders about new task", notifyError);
      }
      const createdTaskId = created.data.id;
      toast.success("Дизайн-задачу створено", {
        description: `Задача ${designTaskNumber}${nextAssignee ? ` · ${getMemberLabel(nextAssignee)}` : ""}`,
        action: {
          label: "Відкрити",
          onClick: () => navigate(`/design/${createdTaskId}`),
        },
      });
    }
    setDesignTaskSaving(false);
  };

  const updateDesignAssignee = async (nextAssigneeUserId: string | null) => {
    if (!designTask || !teamId) return;
    setDesignTaskSaving(true);
    setDesignTaskError(null);
    const previousAssignee = designTask.assigneeUserId ?? null;
    const previousAssignedAt = designTask.assignedAt ?? null;
    const nextAssignedAt = nextAssigneeUserId ? new Date().toISOString() : null;
    const nextMetadata: Record<string, unknown> = {
      ...(designTask.metadata ?? {}),
      assignee_user_id: nextAssigneeUserId,
      assigned_at: nextAssignedAt,
    };

    // Якщо запис не пройшов — повертаємо виконавця, якого бачили до спроби.
    // Інакше на екрані лишився б новий, а в базі старий.
    const rollback = (message: string) => {
      setDesignTask({
        ...designTask,
        assigneeUserId: previousAssignee,
        assignedAt: previousAssignedAt,
        metadata: designTask.metadata,
      });
      setDesignAssigneeId(previousAssignee);
      setDesignTaskError(message);
      toast.error(message);
      setDesignTaskSaving(false);
    };

    const authUser = await getCurrentUser();
    const actorUserId = authUser?.id ?? null;
    const actorName = (actorUserId ? memberById.get(actorUserId) : null) || authUser?.email || "System";

    const saved = await updateActivityMetadata(designTask.id, teamId, nextMetadata);
    if (!saved.ok) return rollback("Не вдалося оновити виконавця.");

    setDesignTask({
      ...designTask,
      assigneeUserId: nextAssigneeUserId,
      assignedAt: nextAssignedAt,
      metadata: nextMetadata,
    });
    setDesignAssigneeId(nextAssigneeUserId);

    // Журнал і сповіщення — не привід відкочувати призначення: воно вже в базі.
    const logged = await logDesignTaskEvent(
      {
        teamId,
        designTaskId: designTask.id,
        quoteId,
        userId: actorUserId,
        actorName,
        action: "design_task_assignment",
        title: nextAssigneeUserId
          ? `Призначено виконавця: ${getMemberLabel(nextAssigneeUserId)}`
          : `Знято виконавця (${getMemberLabel(previousAssignee)})`,
        metadata: {
          source: "design_task_assignment",
          from_assignee_user_id: previousAssignee,
          from_assignee_label: getMemberLabel(previousAssignee),
          to_assignee_user_id: nextAssigneeUserId,
          to_assignee_label: nextAssigneeUserId ? getMemberLabel(nextAssigneeUserId) : null,
        },
      },
      "Не вдалося оновити виконавця."
    );
    if (!logged.ok) {
      console.warn("Failed to log design task assignment event", logged.message);
    }

    const quoteLabel = quote?.number ? `#${quote.number}` : quoteId.slice(0, 8);
    await notifyDesignTaskAssignmentChange({
      designTaskId: designTask.id,
      quoteLabel,
      actorName,
      actorUserId,
      previousAssignee,
      nextAssigneeUserId,
    });

    toast.success(nextAssigneeUserId ? "Виконавця призначено" : "Призначення знято");
    setDesignTaskSaving(false);
  };

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(null);
    const result = await fetchQuoteItemsWithCatalog(quoteId, teamId);
    if (!result.ok) {
      setItemsError(result.message);
      setItems([]);
      setItemsLoading(false);
      setItemsLoaded(true);
      return;
    }
    {
      const { rows, kindById, modelById, methodById, typeById } = result.data;
      setItems(
        rows.map((row) => {
          const rawMethods = Array.isArray(row.methods) ? row.methods : [];
          const parsedMethods: ItemMethod[] = rawMethods
            .map((method: unknown) => {
              if (!method || typeof method !== "object") return null;
              const entry = method as Record<string, unknown>;
              const methodId = (entry.method_id ?? entry.methodId ?? entry.id ?? "") as string;
              if (!methodId) return null;
              const rawWidth = entry.print_width_mm ?? entry.printWidthMm ?? null;
              const rawHeight = entry.print_height_mm ?? entry.printHeightMm ?? null;
              const width =
                rawWidth === null || rawWidth === undefined || rawWidth === ""
                  ? null
                  : Number(rawWidth);
              const height =
                rawHeight === null || rawHeight === undefined || rawHeight === ""
                  ? null
                  : Number(rawHeight);
              return {
                id: createLocalId(),
                methodId,
                count: Number(entry.count ?? 1) || 1,
                printPositionId: (entry.print_position_id ?? entry.printPositionId ?? undefined) as
                  | string
                  | undefined,
                printWidthMm: Number.isNaN(width) ? null : width,
                printHeightMm: Number.isNaN(height) ? null : height,
              };
            })
            .filter(Boolean) as ItemMethod[];
          const attachment =
            row.attachment && typeof row.attachment === "object"
              ? {
                  name:
                    typeof (row.attachment as Record<string, unknown>).name === "string"
                      ? String((row.attachment as Record<string, unknown>).name)
                      : "file",
                  size: Number((row.attachment as Record<string, unknown>).size ?? 0),
                  type:
                    typeof (row.attachment as Record<string, unknown>).type === "string"
                      ? String((row.attachment as Record<string, unknown>).type)
                      : "application/octet-stream",
                  url:
                    typeof (row.attachment as Record<string, unknown>).url === "string"
                      ? String((row.attachment as Record<string, unknown>).url)
                      : "",
                }
              : undefined;
          const rawKindId = row.catalog_kind_id ?? undefined;
          const rawModelId = row.catalog_model_id ?? undefined;
          const resolvedModel = rawModelId ? modelById.get(rawModelId) : undefined;
          const resolvedKind = (resolvedModel?.kind_id ? kindById.get(resolvedModel.kind_id) : undefined) ??
            (rawKindId ? kindById.get(rawKindId) : undefined);
          const resolvedType = resolvedKind?.type_id ? typeById.get(resolvedKind.type_id) : undefined;
          const resolvedMethodNames = Object.fromEntries(
            parsedMethods
              .map((method) => [method.methodId, methodById.get(method.methodId)])
              .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1]))
          );
          return {
            id: typeof row.id === "string" && row.id ? row.id : createLocalId(),
            position: row.position ?? undefined,
            title: row.name ?? "",
            qty: Number(row.qty ?? 0) || 0,
            unit: normalizeUnitLabel(row.unit),
            price: Number(row.unit_price ?? 0) || 0,
            description: row.description ?? undefined,
            metadata: parseQuoteItemMetadata((row as Record<string, unknown>).metadata),
            catalogTypeId: row.catalog_type_id ?? undefined,
            catalogKindId: row.catalog_kind_id ?? undefined,
            catalogModelId: row.catalog_model_id ?? undefined,
            printPositionId: row.print_position_id ?? undefined,
            printWidthMm: row.print_width_mm ?? null,
            printHeightMm: row.print_height_mm ?? null,
            productTypeId: undefined,
            productKindId: undefined,
            productModelId: undefined,
            methods: parsedMethods.length > 0 ? parsedMethods : undefined,
            attachment,
            resolvedTypeId: resolvedType?.id ?? undefined,
            resolvedTypeName: resolvedType?.name ?? undefined,
            resolvedKindId: resolvedKind?.id ?? undefined,
            resolvedKindName: resolvedKind?.name ?? undefined,
            resolvedModelId: resolvedModel?.id ?? undefined,
            resolvedModelName: resolvedModel?.name ?? undefined,
            resolvedModelImageUrl: resolvedModel?.image_url ?? undefined,
            resolvedModelThumbUrl: resolvedModel?.thumb_url ?? undefined,
            resolvedMethodNames,
          };
        })
      );
    }
    setItemsLoading(false);
    setItemsLoaded(true);
  }, [quoteId, teamId]);

  useEffect(() => {
    if (!runsLoaded) return;
    if (runs.length === 0 && items.length > 0) {
      const firstQty = Number(items[0].qty) || 1;
      const newId = crypto.randomUUID();
      setRuns([
        {
          id: newId,
          quantity: firstQty,
          unit_price_model: 0,
          unit_price_print: 0,
          logistics_cost: 0,
          desired_manager_income: 0,
          manager_rate: currentManagerRate || DEFAULT_MANAGER_RATE,
          fixed_cost_rate: companyRates.fixedCostRate,
          vat_rate: companyRates.vatRate,
        },
      ]);
      setSelectedRunId(newId);
    }
  }, [companyRates.fixedCostRate, companyRates.vatRate, runsLoaded, runs.length, items, currentManagerRate]);

  useEffect(() => {
    if (!runsLoaded || !effectiveManagerId || runs.length === 0) return;
    const normalizedRate = currentManagerRate || DEFAULT_MANAGER_RATE;
    setRuns((prev) => {
      const hasMismatch = prev.some((run) => resolveNumericRate(run.manager_rate, normalizedRate) !== normalizedRate);
      if (!hasMismatch) return prev;
      return prev.map((run) => ({ ...run, manager_rate: normalizedRate }));
    });
    setRunsOriginal((prev) => {
      const hasMismatch = prev.some((run) => resolveNumericRate(run.manager_rate, normalizedRate) !== normalizedRate);
      if (!hasMismatch) return prev;
      return prev.map((run) => ({ ...run, manager_rate: normalizedRate }));
    });
  }, [runsLoaded, runs.length, effectiveManagerId, currentManagerRate]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    const result = await fetchStatusHistory(quoteId, teamId);
    if (result.ok) {
      setHistory(result.data);
    } else {
      setHistoryError(result.message);
      setHistory([]);
    }
    setHistoryLoading(false);
  }, [quoteId, teamId]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    const result = await fetchQuoteComments(quoteId, teamId);
    if (result.ok) {
      setComments(result.data);
    } else {
      setCommentsError(result.message);
      setComments([]);
    }
    setCommentsLoading(false);
  }, [quoteId, teamId]);

  const loadAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    const result = await fetchQuoteAttachments(quoteId, teamId, loaderInputsRef.current.memberById);
    if (result.ok) {
      setAttachments(result.data.attachments);
      setDesignVisualizations(result.data.designVisualizations);
    } else {
      setAttachmentsError(result.message);
      setAttachments([]);
      setDesignVisualizations([]);
    }
    setAttachmentsLoading(false);
  }, [quoteId, teamId]);

  const uploadAttachments = async (
    files: FileList | File[] | null,
    audience: QuoteAttachmentAudience = "project"
  ) => {
    if (!files || files.length === 0) return;
    if (attachmentsUploading) return;
    setAttachmentsUploadError(null);

    const existingCount = attachments.length;
    const remainingSlots = Math.max(0, MAX_QUOTE_ATTACHMENTS - existingCount);
    if (remainingSlots === 0) {
      setAttachmentsUploadError(`Можна додати не більше ${MAX_QUOTE_ATTACHMENTS} файлів.`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    const oversized = selected.filter((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    const allowed = selected.filter((file) => file.size <= MAX_ATTACHMENT_SIZE_BYTES);

    if (oversized.length > 0) {
      setAttachmentsUploadError("Деякі файли завеликі (максимум 50 MB).");
    }
    if (allowed.length === 0) return;

    setAttachmentsUploading(true);

    const finish = () => {
      setAttachmentsUploading(false);
      if (attachmentsInputRef.current) {
        attachmentsInputRef.current.value = "";
      }
    };

    const uploadedBy = await getCurrentUserId();
    if (!uploadedBy) {
      setAttachmentsUploadError("Користувач не авторизований");
      finish();
      return;
    }

    // Кожен файл окремо: один невдалий не має скасовувати решту, тому список
    // тих, що не долетіли, збирається й показується разом.
    const failures: string[] = [];
    for (const file of allowed) {
      const uploaded = await uploadQuoteAttachmentFile({
        teamId,
        quoteId,
        file,
        uploadedBy,
        audience,
        bucket: ITEM_VISUAL_BUCKET,
      });
      if (!uploaded.ok) {
        failures.push(file.name);
        console.error("Attachment upload failed", uploaded.message);
      }
    }

    if (failures.length > 0) {
      setAttachmentsUploadError(
        failures.length === allowed.length
          ? "Не вдалося завантажити файли."
          : `Не всі файли завантажилися (${failures.length}/${allowed.length}).`
      );
    }

    await loadAttachments();
    finish();
  };

  const requestDeleteAttachment = (attachment: QuoteAttachment) => {
    if (attachmentsDeletingId) return;
    if (!canDeleteDesignerBriefAttachment(attachment)) return;
    setDeleteAttachmentTarget(attachment);
    setDeleteAttachmentOpen(true);
  };

  const confirmDeleteAttachment = async () => {
    if (!deleteAttachmentTarget || attachmentsDeletingId) return;
    const attachment = deleteAttachmentTarget;
    if (!canDeleteDesignerBriefAttachment(attachment)) {
      setAttachmentsDeleteError("Видаляти ці файли може лише менеджер прорахунку, який їх завантажив.");
      setDeleteAttachmentOpen(false);
      setDeleteAttachmentTarget(null);
      toast.error("Недостатньо прав", {
        description: "Видаляти ці файли може лише менеджер прорахунку, який їх завантажив.",
      });
      return;
    }
    setAttachmentsDeletingId(attachment.id);
    setAttachmentsDeleteError(null);

    const fail = (message: string) => {
      setAttachmentsDeleteError(message);
      toast.error("Помилка видалення", { description: message });
      setAttachmentsDeletingId(null);
    };

    const removed = await deleteQuoteAttachmentRow(attachment);
    if (!removed.ok) return fail(removed.message);

    // Файл могли вибрати як візуалізацію в дизайн-задачі — прибираємо посилання
    // й там, інакше задача показуватиме те, чого вже немає у сховищі.
    if (quoteId && attachment.storageBucket && attachment.storagePath) {
      const linked = await fetchDesignTasksLinkedToQuote(quoteId, teamId);
      if (!linked.ok) return fail(linked.message);

      for (const row of linked.data) {
        const nextMetadata = removeDesignOutputReferencesFromMetadata(
          parseActivityMetadata(row.metadata),
          attachment.storageBucket,
          attachment.storagePath
        );
        if (!nextMetadata) continue;
        const synced = await updateActivityMetadata(row.id, teamId, nextMetadata);
        if (!synced.ok) return fail(synced.message);
      }
    }

    setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    setDeleteAttachmentOpen(false);
    setDeleteAttachmentTarget(null);
    toast.success("Файл видалено");
    setAttachmentsDeletingId(null);
  };

  useEffect(() => {
    if (!quoteId) return;
    // teamId resolves asynchronously after auth settles. Bail until it's known
    // so we don't fire every loader once with a null team (which throws a bogus
    // "Немає доступу" and fetches items/runs without the team filter) and then
    // re-fire the whole batch a second time once teamId lands.
    if (!teamId) return;
    const nextInitialCache = readQuoteDetailsCache(teamId, quoteId);
    setQuote(nextInitialCache?.quote ?? null);
    setLoading(!nextInitialCache?.quote);
    setError(null);
    setItems([]);
    setItemsError(null);
    setItemsLoaded(false);
    setRuns([]);
    setRunsOriginal([]);
    setRunsError(null);
    setRunsLoaded(false);
    setSelectedRunId(null);
    setComments([]);
    setCommentsError(null);
    setAttachments([]);
    setDesignVisualizations([]);
    setAttachmentsError(null);
    setDesignTask(null);
    setDesignTaskError(null);
    setDesignAssigneeId(null);
    setDesignTaskType(null);
    setDesignTaskCandidates([]);
    activityTabLoadedQuoteRef.current = null;
    setHistory([]);
    setHistoryError(null);
    setActivityRows([]);
    setActivityError(null);
    setActivityLoadedAll(false);
    filesTabLoadedQuoteRef.current = null;
    void loadQuote();
    void loadItems();
    void loadRuns();
    void loadComments();
    void loadDesignTask();
    void loadAttachments();
  }, [loadAttachments, loadComments, loadDesignTask, loadItems, loadQuote, loadRuns, quoteId, teamId]);

  useEffect(() => {
    if (!teamId || !quoteId) return;
    let active = true;
    const loadMembership = async () => {
      const result = await fetchQuoteSetMembership(teamId, quoteId);
      if (!active) return;
      setQuoteSetMembership(result.ok ? result.data : null);
    };
    // Обгортка з await — щоб правило побачило, що запис у стан тут лише ПІСЛЯ
    // мережевого виклику, а не синхронно в тілі ефекту (як у loadCurrentManagerRate).
    void (async () => {
      await loadMembership();
    })();
    return () => {
      active = false;
    };
  }, [quoteId, teamId]);

  useEffect(() => {
    if (!quote || quote.id !== quoteId || !teamId) {
      setDesignTaskCandidates([]);
      return;
    }
    if (!attachDesignTaskDialogOpen) return;
    void loadDesignTaskCandidates();
  }, [attachDesignTaskDialogOpen, designTask?.id, loadDesignTaskCandidates, quote, quoteId, teamId]);

  useEffect(() => {
    if (detailsTab !== "files") return;
    if (!quoteId || filesTabLoadedQuoteRef.current === quoteId) return;
    filesTabLoadedQuoteRef.current = quoteId;
    void loadAttachments();
  }, [detailsTab, loadAttachments, quoteId]);

  useEffect(() => {
    if (detailsTab !== "activity") return;
    if (!quote || quote.id !== quoteId || error) return;
    if (activityTabLoadedQuoteRef.current === quoteId) return;
    activityTabLoadedQuoteRef.current = quoteId;
    void loadHistory();
    void loadActivityLog();
  }, [detailsTab, error, loadActivityLog, loadHistory, quote, quoteId]);

  useEffect(() => {
    if (attachments.length === 0 || memberById.size === 0) return;
    setAttachments((prev) =>
      prev.map((item) => {
        if (!item.uploadedBy) return item;
        const nextLabel =
          memberById.get(item.uploadedBy) ?? item.uploadedByLabel ?? "Невідомий користувач";
        if (nextLabel === item.uploadedByLabel) return item;
        return { ...item, uploadedByLabel: nextLabel };
      })
    );
  }, [memberById, attachments.length]);

  useEffect(() => {
    if (!teamId || !quoteId || !selectedDesignOutputFile || designVisualizationSyncingRef.current) return;
    const alreadyVisible = designVisualizations.some(
      (file) =>
        file.storageBucket === selectedDesignOutputFile.storage_bucket &&
        file.storagePath === selectedDesignOutputFile.storage_path
    );
    if (alreadyVisible) return;

    let active = true;
    const syncSelectedVisualization = async () => {
      designVisualizationSyncingRef.current = true;
      const linked = await linkDesignVisualizationToQuote({
        teamId,
        quoteId,
        file: selectedDesignOutputFile,
        fallbackUploadedBy: userId ?? null,
      });
      if (!linked.ok) {
        // Фонове доповнення: не зриваємо через нього показ прорахунку.
        console.warn("Failed to backfill selected design visualization into quote", linked.message);
      } else if (active) {
        await loadAttachments();
      }
      if (active) {
        designVisualizationSyncingRef.current = false;
      }
    };

    void syncSelectedVisualization();
    return () => {
      active = false;
    };
  }, [designVisualizations, loadAttachments, quoteId, selectedDesignOutputFile, teamId, userId]);

  const didInitItemAttachmentRefreshRef = useRef(false);

  useEffect(() => {
    if (!didInitItemAttachmentRefreshRef.current) {
      didInitItemAttachmentRefreshRef.current = true;
      return;
    }
    if (itemAttachmentUploading) return;
    void loadAttachments();
  }, [itemAttachmentUploading, loadAttachments]);

  const handleAttachmentsDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAttachmentsDragActive(false);
    void uploadAttachments(event.dataTransfer.files);
  };

  const handleAttachmentsDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAttachmentsDragActive(true);
  };

  const handleAttachmentsDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAttachmentsDragActive(false);
  };

  const handleSaveDeadline = async (overrides?: {
    date?: string;
    note?: string;
    time?: string;
    reminderOffset?: string;
    reminderComment?: string;
  }) => {
    if (!quote) return;
    const nextDatePart = (overrides?.date ?? deadlineDate) || "";
    const nextTimePart = (overrides?.time ?? deadlineTime) || DEFAULT_DEADLINE_TIME;
    if (!nextDatePart) {
      const message = "Дедлайн прорахунку є обов'язковим.";
      setDeadlineError(message);
      toast.error(message);
      return;
    }
    setDeadlineSaving(true);
    setDeadlineError(null);
    {
      const prevDate = quote.deadline_at ?? "";
      const prevNote = quote.deadline_note ?? "";
      const prevReminderOffset = quote.deadline_reminder_offset_minutes;
      const prevReminderComment = quote.deadline_reminder_comment ?? "";
      const nextDate = combineDeadlineValue(nextDatePart, nextTimePart);
      const nextNote = (overrides?.note ?? deadlineNote).trim();
      const nextReminderOffsetRaw = overrides?.reminderOffset ?? deadlineReminderOffset;
      const nextReminderOffset =
        nextReminderOffsetRaw === "none" ? null : Number(nextReminderOffsetRaw || "0");
      const nextReminderComment = (overrides?.reminderComment ?? deadlineReminderComment).trim();
      const deadlineChanged =
        prevDate !== nextDate ||
        prevNote.trim() !== nextNote ||
        (prevReminderOffset ?? null) !== (Number.isFinite(nextReminderOffset ?? NaN) ? nextReminderOffset : null) ||
        prevReminderComment.trim() !== nextReminderComment;

      const payload = {
        deadline_at: nextDate || null,
        deadline_note: nextNote || null,
        deadline_reminder_offset_minutes:
          Number.isFinite(nextReminderOffset ?? NaN) ? nextReminderOffset : null,
        deadline_reminder_comment: nextReminderComment || null,
      };
      const saved = await updateQuoteFields(
        {
          quoteId: quote.id,
          teamId,
          deadlineAt: payload.deadline_at,
          deadlineNote: payload.deadline_note,
          deadlineReminderOffsetMinutes: payload.deadline_reminder_offset_minutes,
          deadlineReminderComment: payload.deadline_reminder_comment,
        },
        "Не вдалося оновити дедлайн."
      );
      if (!saved.ok) {
        setDeadlineError(saved.message);
        setDeadlineSaving(false);
        return;
      }
      const updatedQuote = saved.data;
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              deadline_at: (updatedQuote as Partial<QuoteSummaryRow> | null)?.deadline_at ?? payload.deadline_at,
              deadline_note: (updatedQuote as Partial<QuoteSummaryRow> | null)?.deadline_note ?? payload.deadline_note,
              deadline_reminder_offset_minutes:
                (updatedQuote as Partial<QuoteSummaryRow> | null)?.deadline_reminder_offset_minutes ??
                payload.deadline_reminder_offset_minutes,
              deadline_reminder_comment:
                (updatedQuote as Partial<QuoteSummaryRow> | null)?.deadline_reminder_comment ??
                payload.deadline_reminder_comment,
            }
          : prev
      );
      setDeadlineDate(toDateInputValue(payload.deadline_at));
      setDeadlineTime(toTimeInputValue(payload.deadline_at));
      setDeadlineNote(payload.deadline_note ?? "");
      setDeadlineReminderOffset(
        payload.deadline_reminder_offset_minutes === null || payload.deadline_reminder_offset_minutes === undefined
          ? "0"
          : String(payload.deadline_reminder_offset_minutes)
      );
      setDeadlineReminderComment(payload.deadline_reminder_comment ?? "");
      if (deadlineChanged) {
        const logged = await logQuoteActivity(
          {
            teamId,
            action: "змінив дедлайн",
            entityType: "quotes",
            entityId: quoteId,
            title: `Дедлайн: ${formatDeadlineLabel(prevDate)} → ${formatDeadlineLabel(nextDate)}`,
            href: `/orders/estimates/${quoteId}`,
            metadata: {
              source: "quote_deadline",
              from: prevDate || null,
              to: nextDate || null,
              note: nextNote || null,
              reminder_offset_minutes: payload.deadline_reminder_offset_minutes,
              reminder_comment: payload.deadline_reminder_comment,
            },
          },
          "Не вдалося оновити дедлайн."
        );
        if (!logged.ok) {
          setDeadlineError(logged.message);
          setDeadlineSaving(false);
          return;
        }
        await loadActivityLog();
      }
    }
    setDeadlineSaving(false);
  };

  const handleSaveSecondaryDeadline = async (
    field: "customer_deadline_at" | "design_deadline_at",
    options: {
      date: string;
      time: string;
      title: string;
      action: string;
      nextDate?: string;
      nextTime?: string;
    }
  ) => {
    if (!quote) return;
    const nextDatePart = options.nextDate ?? options.date;
    const nextTimePart = options.nextTime ?? options.time ?? DEFAULT_DEADLINE_TIME;
    const nextValue = nextDatePart ? combineDeadlineValue(nextDatePart, nextTimePart) : null;
    const prevValue =
      field === "customer_deadline_at"
        ? quote.customer_deadline_at ?? null
        : quote.design_deadline_at ?? null;
    if ((prevValue ?? null) === (nextValue ?? null)) return;

    setDeadlineSaving(true);
    setDeadlineError(null);
    {
      const saved = await updateQuoteFields(
        {
          quoteId: quote.id,
          teamId,
          customerDeadlineAt: field === "customer_deadline_at" ? nextValue : undefined,
          designDeadlineAt: field === "design_deadline_at" ? nextValue : undefined,
        },
        "Не вдалося оновити дедлайн."
      );
      if (!saved.ok) {
        setDeadlineError(saved.message);
        setDeadlineSaving(false);
        return;
      }
      const updatedQuote = saved.data;
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              customer_deadline_at:
                field === "customer_deadline_at"
                  ? ((updatedQuote as Partial<QuoteSummaryRow> | null)?.customer_deadline_at ?? nextValue)
                  : prev.customer_deadline_at,
              design_deadline_at:
                field === "design_deadline_at"
                  ? ((updatedQuote as Partial<QuoteSummaryRow> | null)?.design_deadline_at ?? nextValue)
                  : prev.design_deadline_at,
            }
          : prev
      );
      if (field === "customer_deadline_at") {
        setCustomerDeadlineDate(toDateInputValue(nextValue));
        setCustomerDeadlineTime(toTimeInputValue(nextValue));
      } else {
        setDesignDeadlineDate(toDateInputValue(nextValue));
        setDesignDeadlineTime(toTimeInputValue(nextValue));
      }
      const logged = await logQuoteActivity(
        {
          teamId,
          action: options.action,
          entityType: "quotes",
          entityId: quoteId,
          title: `${options.title}: ${formatDeadlineLabel(prevValue)} → ${formatDeadlineLabel(nextValue)}`,
          href: `/orders/estimates/${quoteId}`,
          metadata: {
            source: field,
            from: prevValue,
            to: nextValue,
          },
        },
        "Не вдалося оновити дедлайн."
      );
      if (!logged.ok) {
        setDeadlineError(logged.message);
        setDeadlineSaving(false);
        return;
      }
      await loadActivityLog();
    }
    setDeadlineSaving(false);
  };

  // Quick status change
  const handleQuickStatusChange = async (newStatus: string, noteOverride?: string) => {
    const nextStatus = normalizeStatus(newStatus);
    setStatusBusy(true);
    setStatusError(null);
    {
      const previousStatus = normalizeStatus(quote?.status);
      const note = (noteOverride ?? statusNote).trim();
      const changed = await changeQuoteStatus({
        quoteId,
        status: nextStatus,
        note: note ? note : undefined,
      });
      if (!changed.ok) {
        setStatusError(changed.message);
        setStatusBusy(false);
        return;
      }
      // Сповіщення ініціатора не має ламати зміну статусу: вона вже сталась.
      //
      // Значення рахуємо ДО try: будь-який «??», «&&» чи «?.» усередині
      // try/catch React Compiler не вміє й через нього пропускає всю сторінку
      // разом із перевірками лінту (REQ-109).
      const statusNotifyActorUserId = userId ?? null;
      // Сповіщаємо лише про СПРАВЖНІЙ перехід. Той самий статус (наприклад,
      // повторне «Затверджено» або збереження нотатки без зміни стану) база
      // ігнорує — і в історію статусів, і в аудит нічого не пише. Сповіщення
      // ж досі летіло щоразу, і в Telegram сипались однакові повідомлення.
      const statusActuallyChanged = previousStatus !== nextStatus;
      if (statusActuallyChanged) {
        try {
          await notifyQuoteInitiatorOnStatusChange({
            quoteId,
            fromStatus: previousStatus,
            toStatus: nextStatus,
            actorUserId: statusNotifyActorUserId,
          });
        } catch (notifyError) {
          console.warn("Failed to notify quote initiator about status change", notifyError);
        }
      }
      const logged = await logQuoteActivity(
        {
          teamId,
          action: "змінив статус",
          entityType: "quotes",
          entityId: quoteId,
          title: `Статус: ${formatStatusLabel(previousStatus)} → ${formatStatusLabel(nextStatus)}`,
          href: `/orders/estimates/${quoteId}`,
          metadata: { source: "quote_status", from: previousStatus, to: nextStatus, note },
        },
        "Помилка зміни статусу"
      );
      if (!logged.ok) {
        setStatusError(logged.message);
        setStatusBusy(false);
        return;
      }
      if (nextStatus === "approved" && normalizeStatus(quote?.status) !== "approved") {
        await Promise.allSettled([
          logActivity({
            teamId,
            action: "створив задачу",
            entityType: "quotes",
            entityId: quoteId,
            title: `Задача для дизайнера: макет для прорахунку ${quote?.number ?? ""}`.trim(),
            href: `/orders/estimates/${quoteId}`,
            metadata: { role: "designer", source: "quote_status", status: nextStatus },
          }),
          logActivity({
            teamId,
            action: "створив задачу",
            entityType: "quotes",
            entityId: quoteId,
            title: `Задача для бухгалтера: рахунок для прорахунку ${quote?.number ?? ""}`.trim(),
            href: `/orders/estimates/${quoteId}`,
            metadata: { role: "accountant", source: "quote_status", status: nextStatus },
          }),
        ]);
      }
      await loadQuote();
      await loadHistory();
      await loadActivityLog();
      setStatusNote("");
    }
    setStatusBusy(false);
  };

  const buildCancelNote = () => {
    const parts = [];
    if (cancelReason.trim()) parts.push(cancelReason.trim());
    if (cancelNote.trim()) parts.push(cancelNote.trim());
    return parts.join(". ").trim();
  };

  const handleConfirmCancel = async () => {
    const note = buildCancelNote();
    if (!note) {
      setCancelError("Оберіть причину або введіть її вручну.");
      return;
    }
    setCancelError(null);
    await handleQuickStatusChange("cancelled", note);
    setCancelDialogOpen(false);
    setCancelReason("");
    setCancelNote("");
  };

  const handleDuplicateQuote = async () => {
    if (!quote?.id) return;
    setDuplicateQuoteBusy(true);

    const effectiveTeamId = quote.team_id ?? teamId;
    if (!effectiveTeamId) {
      toast.error("Не вдалося визначити команду для дублювання.");
      setDuplicateQuoteBusy(false);
      return;
    }

    const duplicated = await duplicateQuoteWithContents({
      source: quote,
      teamId: effectiveTeamId,
      rates: {
        manager: currentManagerRate || DEFAULT_MANAGER_RATE,
        fixedCost: companyRates.fixedCostRate,
        vat: companyRates.vatRate,
      },
      forceManagerRate: Boolean(effectiveManagerId),
    });
    if (!duplicated.ok) {
      toast.error(duplicated.message);
      setDuplicateQuoteBusy(false);
      return;
    }

    const newQuoteId = duplicated.data.newQuoteId;

    // Три значення рахуємо ДО try — див. пояснення вище про value blocks.
    const duplicateNotifyActorUserId = userId ?? null;
    const duplicateNotifyActorName = userId ? memberById.get(userId) ?? null : null;
    const duplicateNotifyCustomerName = quote.customer_name ?? null;
    try {
      await notifyQuotesCreated({
        quoteIds: [newQuoteId],
        actorUserId: duplicateNotifyActorUserId,
        actorName: duplicateNotifyActorName,
        customerName: duplicateNotifyCustomerName,
      });
    } catch (notifyError) {
      console.warn("Failed to notify leadership about a duplicated quote", notifyError);
    }

    toast.success("Прорахунок продубльовано");
    navigate(`/orders/estimates/${newQuoteId}`);
    setDuplicateQuoteBusy(false);
  };

  const openEditQuote = () => {
    if (!quote) return;
    setEditQuoteOriginalRuns([]);
    const primaryItem = items[0] ?? null;
    const primaryRuns =
      runs.length > 0
        ? runs
        : primaryItem && Number(primaryItem.qty ?? 0) > 0
          ? [
              {
                id: undefined,
                quantity: Number(primaryItem.qty ?? 0),
              },
            ]
          : [];

    setEditQuoteOriginalRuns(runs);

    setEditQuoteCustomerSearch(!quote.customer_id ? quote.customer_name ?? "" : "");
    setEditQuoteInitialValues({
      customerId: quote.customer_id ?? "",
      customerType: quote.customer_id ? "customer" : "lead",
      status: normalizeStatus(quote.status),
      comment: quote.design_brief ?? quote.comment ?? "",
      managerId: quote.assigned_to ?? "",
      deadline:
        quote.deadline_at && !Number.isNaN(new Date(quote.deadline_at).getTime())
          ? new Date(quote.deadline_at)
          : undefined,
      deadlineNote: quote.deadline_note ?? "",
      deadlineReminderOffsetMinutes: quote.deadline_reminder_offset_minutes ?? 0,
      deadlineReminderComment: quote.deadline_reminder_comment ?? "",
      currency: quote.currency ?? "UAH",
      quoteType: quote.quote_type ?? "merch",
      deliveryType: quote.delivery_type ?? quote.print_type ?? "",
      deliveryDetails: {
        region: String((quote.delivery_details as Record<string, unknown> | null)?.region ?? ""),
        city: String((quote.delivery_details as Record<string, unknown> | null)?.city ?? ""),
        address: String((quote.delivery_details as Record<string, unknown> | null)?.address ?? ""),
        street: String((quote.delivery_details as Record<string, unknown> | null)?.street ?? ""),
        npDeliveryType: String((quote.delivery_details as Record<string, unknown> | null)?.npDeliveryType ?? ""),
        payer: String((quote.delivery_details as Record<string, unknown> | null)?.payer ?? ""),
        contactName: String((quote.delivery_details as Record<string, unknown> | null)?.contactName ?? ""),
        contactPhone: String((quote.delivery_details as Record<string, unknown> | null)?.contactPhone ?? ""),
        deliveryPointId: String((quote.delivery_details as Record<string, unknown> | null)?.deliveryPointId ?? ""),
        npCityRef: String((quote.delivery_details as Record<string, unknown> | null)?.npCityRef ?? ""),
        npWarehouseRef: String((quote.delivery_details as Record<string, unknown> | null)?.npWarehouseRef ?? ""),
      },
      categoryId: primaryItem?.catalogTypeId ?? "",
      kindId: primaryItem?.catalogKindId ?? "",
      modelId: primaryItem?.catalogModelId ?? "",
      quantity:
        Number(primaryRuns[0]?.quantity ?? primaryItem?.qty ?? 0) > 0
          ? Number(primaryRuns[0]?.quantity ?? primaryItem?.qty ?? 0)
          : undefined,
      runs: primaryRuns
        .map((run) => ({ id: run.id, quantity: Number(run.quantity) || 0 }))
        .filter((run) => run.quantity > 0),
      quantityUnit: normalizeUnitLabel(primaryItem?.unit ?? "шт."),
      printApplications: toPrintApplications(primaryItem),
      createDesignTask: false,
      files: [],
    });
    setEditQuoteError(null);
    setEditQuoteDialogOpen(true);
  };

  const handleEditQuoteSubmit = async (data: NewQuoteFormData) => {
    if (!quote) return;
    setEditQuoteSaving(true);
    setEditQuoteError(null);

    const fail = (message: string) => {
      setEditQuoteError(message);
      setEditQuoteSaving(false);
    };

    {
      const selectedParty = editQuoteCustomers.find(
        (item) => item.id === data.customerId && (item.entityType ?? "customer") === (data.customerType ?? "customer")
      );
      const customerIdForQuote = data.customerType === "lead" ? null : data.customerId?.trim() || null;
      const customerName =
        (selectedParty?.name || selectedParty?.legal_name || quote.customer_name || "").trim() || null;
      const customerLogoUrl = selectedParty?.logo_url ?? quote.customer_logo_url ?? null;
      const title = data.customerType === "lead" ? customerName : quote.title ?? null;

      const savedQuote = await updateQuoteFields(
        {
        quoteId,
        teamId,
        customerId: customerIdForQuote,
        customerName,
        customerLogoUrl,
        title,
        status: data.status,
        comment: data.comment?.trim() || null,
        designBrief: data.comment?.trim() || null,
        assignedTo: data.managerId?.trim() ? data.managerId : null,
        deadlineAt: data.deadline
          ? `${data.deadline.getFullYear()}-${String(data.deadline.getMonth() + 1).padStart(2, "0")}-${String(
              data.deadline.getDate()
            ).padStart(2, "0")}T${String(data.deadline.getHours()).padStart(2, "0")}:${String(
              data.deadline.getMinutes()
            ).padStart(2, "0")}:00`
          : null,
        deadlineNote: data.deadlineNote?.trim() || null,
        deadlineReminderOffsetMinutes: data.deadlineReminderOffsetMinutes ?? null,
        deadlineReminderComment: data.deadlineReminderComment?.trim() || null,
        quoteType: data.quoteType?.trim() ? data.quoteType : null,
        deliveryType: data.deliveryType?.trim() ? data.deliveryType : null,
        deliveryDetails: data.deliveryDetails ?? null,
        },
        "Не вдалося оновити прорахунок."
      );
      if (!savedQuote.ok) return fail(savedQuote.message);

      const primaryItem = items[0] ?? null;
      const normalizedRuns = (data.runs ?? []).filter((run) => Number(run.quantity) > 0);
      const primaryRunQuantity = normalizedRuns[0]?.quantity ?? Number(data.quantity ?? 0);
      const type = catalogTypes.find((entry) => entry.id === data.categoryId);
      const kind = type?.kinds.find((entry) => entry.id === data.kindId);
      const model = kind?.models.find((entry) => entry.id === data.modelId);
      const methodsPayload = data.printApplications.length > 0
        ? data.printApplications.map((app) => ({
            method_id: app.method || null,
            count: 1,
            print_position_id: app.position || null,
            print_width_mm: app.width ? Number(app.width) : null,
            print_height_mm: app.height ? Number(app.height) : null,
          }))
        : null;
      const primaryPrint = methodsPayload?.[0] ?? null;

      if (primaryItem?.id && data.modelId && Number.isFinite(primaryRunQuantity) && primaryRunQuantity > 0) {
        const savedItem = await updateQuoteItemRow(primaryItem.id, {
            name: model?.name ?? primaryItem.title ?? "Позиція",
            qty: primaryRunQuantity,
            unit: normalizeUnitLabel(data.quantityUnit || primaryItem.unit || "шт."),
            unit_price: model?.price ?? primaryItem.price ?? 0,
            line_total: primaryRunQuantity * (model?.price ?? primaryItem.price ?? 0),
            catalog_type_id: data.categoryId ?? null,
            catalog_kind_id: data.kindId ?? null,
            catalog_model_id: data.modelId ?? null,
            print_position_id: primaryPrint?.print_position_id ?? null,
            print_width_mm: primaryPrint?.print_width_mm ?? null,
            print_height_mm: primaryPrint?.print_height_mm ?? null,
            methods: methodsPayload,
        });
        if (!savedItem.ok) return fail(savedItem.message);

        if (normalizedRuns.length > 0) {
          const targetManagerRate = await getManagerRateForUser(data.managerId?.trim() || quote?.assigned_to || quote?.created_by || userId);
          const { payload, idsToDelete } = mergeQuoteRunsWithExisting({
            existingRuns: editQuoteOriginalRuns,
            nextRuns: normalizedRuns,
            quoteId,
            quoteItemId: primaryItem.id,
            managerRate: targetManagerRate,
            defaultManagerRate: DEFAULT_MANAGER_RATE,
            defaultFixedCostRate: companyRates.fixedCostRate,
            defaultVatRate: companyRates.vatRate,
          });
          const savedRuns = await persistQuoteRuns(quoteId, payload, idsToDelete);
          if (!savedRuns.ok) return fail(savedRuns.message);
        } else if (editQuoteOriginalRuns.length > 0) {
          const idsToDelete = editQuoteOriginalRuns
            .map((run) => run.id)
            .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
          const removed = await deleteQuoteRunsByIds(idsToDelete);
          if (!removed.ok) return fail(removed.message);
        }
      }

      // Файли з модалки вантажимо ДО створення дизайн-задачі: вона читає
      // `attachments`, щоб вирішити, ставити has_files чи ні, і на порожньому
      // списку поставила б «файлів немає» попри щойно прикріплені матеріали.
      if (data.projectFiles.length > 0) {
        await uploadAttachments(data.projectFiles, "project");
      }
      if (data.files.length > 0) {
        await uploadAttachments(data.files, "design");
      }

      if (data.createDesignTask && !designTask) {
        await createDesignTask({
          assigneeUserId: data.designAssigneeId ?? null,
          collaboratorUserIds: data.designCollaboratorIds ?? [],
          designTaskType: data.designTaskType ?? null,
          modelName: model?.name ?? primaryItem?.title ?? "Позиція",
          methodsCount: methodsPayload?.length ?? 0,
          designBrief: data.comment?.trim() || data.deadlineNote?.trim() || null,
          hasFiles: data.files.length > 0 || attachments.some((file) => file.audience === "design"),
        });
      }

      await Promise.all([loadQuote(), loadItems(), loadRuns()]);
      setEditQuoteDialogOpen(false);
      toast.success("Прорахунок оновлено");
    }
    setEditQuoteSaving(false);
  };

  // Inline quantity editing
  const startQtyEdit = (itemId: string, currentQty: number) => {
    setEditingQty(itemId);
    setQtyValue(currentQty.toString());
  };
  void startQtyEdit;

  const saveQtyEdit = async (itemId: string) => {
    const newQty = Math.max(1, parseInt(qtyValue) || 1);
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, qty: newQty } : item))
    );
    setEditingQty(null);
    // Пошук позиції й ціна — до try, див. пояснення про value blocks вище.
    const current = items.find((item) => item.id === itemId);
    if (!current) return;
    const unitPrice = Number(current.price ?? 0) || 0;
    try {
      const saved = await updateQuoteItemRow(itemId, {
        qty: newQty,
        line_total: unitPrice * newQty,
      });
      if (!saved.ok) setItemsError("Не вдалося оновити кількість.");
    } catch (e: unknown) {
      setItemsError(getErrorMessage(e, "Не вдалося оновити кількість."));
    }
  };
  void saveQtyEdit;

  const openNewItem = () => {
    setEditingItemId(null);
    setItemTitle("");
    setItemQty("1");
    setItemUnit("шт.");
    setItemPrice("0");
    setItemDescription("");
    setItemTypeId("");
    setItemKindId("");
    setItemModelId("");
    setItemMethods([]);
    setItemAttachment(null);
    setItemAttachmentError(null);
    setItemAttachmentUploading(false);
    setAutoMethodsApplied(false);
    setItemFormMode("simple");
    setCatalogSearchValue("");
    setLastAutoTitle("");
    setItemModalOpen(true);
  };

  const openEditItem = (item: QuoteItem) => {
    const resolvedSelection = resolveCatalogSelection({
      typeId: item.catalogTypeId ?? item.productTypeId ?? undefined,
      kindId: item.catalogKindId ?? item.productKindId ?? undefined,
      modelId: item.catalogModelId ?? item.productModelId ?? undefined,
    });
    setEditingItemId(item.id);
    setItemTitle(item.title);
    setItemQty(String(item.qty));
    setItemUnit(normalizeUnitLabel(item.unit));
    setItemPrice(String(item.price));
    setItemDescription(item.description ?? "");
    setItemTypeId(resolvedSelection.typeId ?? "");
    setItemKindId(resolvedSelection.kindId ?? "");
    setItemModelId(resolvedSelection.modelId ?? "");
    setItemMethods(item.methods ?? []);
    setItemAttachment(item.attachment ?? null);
    setItemAttachmentError(null);
    setItemAttachmentUploading(false);
    setAutoMethodsApplied(true);
    setItemFormMode(item.catalogTypeId || item.productTypeId ? "advanced" : "simple");
    setCatalogSearchValue("");
    setLastAutoTitle("");
    setItemModalOpen(true);
  };

  const handleTypeChange = (value: string) => {
    setItemTypeId(value);
    setItemKindId("");
    setItemModelId("");
    setItemMethods([]);
    setAutoMethodsApplied(false);
  };

  const handleKindChange = (value: string) => {
    setItemKindId(value);
    setItemModelId("");
    setItemMethods([]);
    setAutoMethodsApplied(false);
  };

  const handleModelChange = (value: string) => {
    setItemModelId(value);
    setItemMethods([]);
    setAutoMethodsApplied(false);
  };

  const handleAttachmentChange = async (file: File | null) => {
    if (!file) {
      setItemAttachment(null);
      return;
    }
    const effectiveTeamId = quote?.team_id ?? teamId;
    if (!effectiveTeamId) {
      setItemAttachmentError("Немає доступної команди.");
      return;
    }
    setItemAttachmentUploading(true);
    setItemAttachmentError(null);

    const uploaded = await uploadQuoteItemVisual({
      teamId: effectiveTeamId,
      quoteId,
      file,
      bucket: ITEM_VISUAL_BUCKET,
    });

    if (!uploaded.ok) {
      setItemAttachmentError(uploaded.message);
      setItemAttachment(null);
      setItemAttachmentUploading(false);
      return;
    }

    const { url: publicUrl, row: attachmentRow } = uploaded.data;

    setItemAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
      url: publicUrl,
    });

    if (attachmentRow) {
      const sizeLabel =
        attachmentRow.file_size != null
          ? `${(Number(attachmentRow.file_size) / 1024).toFixed(1)} KB`
          : `${(file.size / 1024).toFixed(1)} KB`;
      setAttachments((prev) => [
        {
          id: attachmentRow.id,
          name: attachmentRow.file_name ?? file.name,
          size: sizeLabel,
          created_at: attachmentRow.created_at ?? new Date().toISOString(),
          url: publicUrl,
        },
        ...prev,
      ]);
    }

    setItemAttachmentUploading(false);
  };

  // Назва позиції підставляється з обраної моделі.
  //
  // У підпис входять і itemTitle з lastAutoTitle — навмисно: коли назву
  // стирають руками, вона має підставитись знову. Саме так поводився ефект, і
  // цю поведінку тут збережено дослівно (REQ-109).
  const autoItemTitle =
    itemFormMode === "advanced" && effectiveItemModelId
      ? getModelLabel(catalogTypes, effectiveItemTypeId, effectiveItemKindId, effectiveItemModelId) ?? ""
      : "";
  const autoItemTitleChanged = useSignatureChanged(
    `${autoItemTitle}\u0000${itemTitle}\u0000${lastAutoTitle}`
  );
  if (autoItemTitleChanged && autoItemTitle && (!itemTitle.trim() || itemTitle === lastAutoTitle)) {
    setItemTitle(autoItemTitle);
    setLastAutoTitle(autoItemTitle);
  }

  // Перший метод нанесення підставляється сам — один раз на обрану модель.
  //
  // Ідентифікатор рядка тут передбачуваний, а не createLocalId(): той бере
  // Date.now() і Math.random(), а рендер React може відкинути й повторити —
  // тоді на кожну спробу виходив би інший id. Для ключа списку достатньо
  // походження методу, а руками додані рядки й далі отримують createLocalId.
  const autoMethodCandidateId = availableMethods[0]?.id ?? "";
  const autoMethodsInputChanged = useSignatureChanged(
    `${itemFormMode}\u0000${effectiveItemModelId}\u0000${autoMethodsApplied ? "1" : "0"}\u0000${autoMethodCandidateId}`
  );
  if (
    autoMethodsInputChanged &&
    itemFormMode === "advanced" &&
    effectiveItemModelId &&
    !autoMethodsApplied &&
    autoMethodCandidateId
  ) {
    setItemMethods([{ id: `auto-${autoMethodCandidateId}`, methodId: autoMethodCandidateId, count: 1 }]);
    setAutoMethodsApplied(true);
  }

  const handleSaveItem = async () => {
    if (!itemTitle.trim()) return;
    
    const effectiveTeamId = quote?.team_id ?? teamId;
    if (!effectiveTeamId) {
      setItemsError("Немає доступної команди.");
      return;
    }

  const methodsPayload =
    itemFormMode === "advanced" && itemMethods.length > 0
      ? itemMethods.map((method) => ({
          method_id: method.methodId,
          count: method.count,
          print_position_id: method.printPositionId ?? null,
          print_width_mm: method.printWidthMm ?? null,
          print_height_mm: method.printHeightMm ?? null,
        }))
      : null;
    const attachmentPayload = itemAttachment
      ? {
          name: itemAttachment.name,
          size: itemAttachment.size,
          type: itemAttachment.type,
          url: itemAttachment.url,
        }
      : null;
    // Carry the catalog model's supplier / Avantprint links into the quote item
    // so the link buttons on the quote product card light up. On edit we keep any
    // links already on the item and only fill in missing ones from the model.
    const selectedCatalogModel =
      itemFormMode === "advanced" && effectiveItemModelId
        ? catalogTypes
            .find((type) => type.id === effectiveItemTypeId)
            ?.kinds.find((kind) => kind.id === effectiveItemKindId)
            ?.models.find((model) => model.id === effectiveItemModelId)
        : undefined;
    const modelSupplierUrl = selectedCatalogModel?.metadata?.supplierUrl?.trim() || null;
    const modelAvantprintUrl = selectedCatalogModel?.metadata?.avantprintUrl?.trim() || null;
    const previousItemMetadata =
      editingItemId ? items.find((item) => item.id === editingItemId)?.metadata ?? null : null;
    const existingItemMetadata =
      previousItemMetadata || modelSupplierUrl || modelAvantprintUrl
        ? {
            ...(previousItemMetadata ?? {}),
            supplierUrl: previousItemMetadata?.supplierUrl ?? modelSupplierUrl,
            avantprintUrl: previousItemMetadata?.avantprintUrl ?? modelAvantprintUrl,
          }
        : null;

    const newItem: QuoteItem = {
      id: editingItemId || createLocalId(),
      position: undefined,
      title: itemTitle.trim(),
      qty: Math.max(1, Number(itemQty) || 1),
      unit: normalizeUnitLabel(itemUnit),
      price: computedItemPrice,
      description: itemDescription.trim() || undefined,
      metadata: existingItemMetadata,
      catalogTypeId: itemFormMode === "advanced" ? effectiveItemTypeId : undefined,
      catalogKindId: itemFormMode === "advanced" ? effectiveItemKindId : undefined,
      catalogModelId: itemFormMode === "advanced" ? effectiveItemModelId : undefined,
      productTypeId: itemFormMode === "advanced" ? effectiveItemTypeId : undefined,
      productKindId: itemFormMode === "advanced" ? effectiveItemKindId : undefined,
      productModelId: itemFormMode === "advanced" ? effectiveItemModelId : undefined,
      methods: itemFormMode === "advanced" ? itemMethods : undefined,
      attachment: itemAttachment
        ? {
            name: itemAttachment.name,
            size: itemAttachment.size,
            type: itemAttachment.type,
            url: itemAttachment.url,
          }
        : undefined,
    };

    // Без try/catch: обидва записи нижче — updateQuoteItemRow та
    // insertQuoteItemRow — повертають QueryResult і не кидають, а решта
    // (normalizeUnitLabel, parseQuoteItemMetadata, crypto.randomUUID) чиста.
    // Обидві відмови вже показує setItemsError у гілках `!ok`. Прибрано, бо
    // «??» усередині try/catch React Compiler не вміє — і через цей блок
    // пропускав усю сторінку разом із перевірками лінту (REQ-109).
    if (editingItemId) {
      const updatePayload = {
        name: newItem.title,
        description: newItem.description ?? null,
        metadata: newItem.metadata ?? null,
        qty: newItem.qty,
        unit: normalizeUnitLabel(newItem.unit),
        unit_price: newItem.price,
        line_total: newItem.qty * newItem.price,
        catalog_type_id: newItem.catalogTypeId ?? null,
        catalog_kind_id: newItem.catalogKindId ?? null,
        catalog_model_id: newItem.catalogModelId ?? null,
        methods: methodsPayload,
        attachment: attachmentPayload,
      };
      const savedItem = await updateQuoteItemRow(editingItemId, updatePayload, {
        retryWithoutMetadata: true,
      });
      if (!savedItem.ok) {
        setItemsError(savedItem.message);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (item.id === editingItemId ? newItem : item))
      );
      await logItemChange("update", newItem);
    } else {
      const newId = crypto.randomUUID();
      const nextPosition =
        items.length === 0 ? 1 : Math.max(...items.map((item) => item.position ?? 0)) + 1;
      const insertPayload = {
        id: newId,
        team_id: effectiveTeamId,
        quote_id: quoteId,
        position: nextPosition,
        name: newItem.title,
        description: newItem.description ?? null,
        metadata: newItem.metadata ?? null,
        qty: newItem.qty,
        unit: normalizeUnitLabel(newItem.unit),
        unit_price: newItem.price,
        line_total: newItem.qty * newItem.price,
        catalog_type_id: newItem.catalogTypeId ?? null,
        catalog_kind_id: newItem.catalogKindId ?? null,
        catalog_model_id: newItem.catalogModelId ?? null,
        methods: methodsPayload,
        attachment: attachmentPayload,
      };
      const insertedRow = await insertQuoteItemRow(insertPayload);
      if (!insertedRow.ok) {
        setItemsError(insertedRow.message);
        return;
      }
      // Рядок повертається як довільний обʼєкт: у запасному проході без
      // metadata набір колонок інший, тож поля читаємо поштучно.
      const data = insertedRow.data as
        | {
            id?: string | null;
            position?: number | null;
            qty?: number | null;
            unit?: string | null;
            unit_price?: number | null;
            description?: string | null;
            metadata?: unknown;
          }
        | null;
      const inserted: QuoteItem = {
        ...newItem,
        id: data?.id ?? newId,
        position: data?.position ?? nextPosition,
        qty: Number(data?.qty ?? newItem.qty),
        unit: normalizeUnitLabel(data?.unit ?? newItem.unit),
        price: Number(data?.unit_price ?? newItem.price),
        description: data?.description ?? newItem.description,
        metadata: parseQuoteItemMetadata(data?.metadata) ?? newItem.metadata ?? null,
      };
      setItems((prev) => [...prev, inserted]);
    }
    setItemModalOpen(false);
  };

  /**
   * Слід у стрічці подій про зміну позиції.
   *
   * Пишемо лише на «На погодженні» й «Затверджено» — до них правки це звичайна
   * робота, і журнал з них перетворився б на шум. Подробиці кожного поля веде
   * тригер audit_quote_items у базі; сюди йде рядок, який видно всій команді,
   * бо саму tosho.audit_log читають лише власник і CEO.
   */
  const logItemChange = async (kind: "update" | "delete", item: QuoteItem) => {
    if (!teamId || !itemChangeNeedsTrace) return;
    const verb = kind === "delete" ? "Видалив" : "Змінив";
    const logged = await logQuoteActivity(
      {
        teamId,
        action: kind === "delete" ? "видалив позицію" : "змінив позицію",
        entityType: "quotes",
        entityId: quoteId,
        title: `${verb} позицію «${item.title}» у статусі «${formatStatusLabel(currentStatus)}»`,
        href: `/orders/estimates/${quoteId}`,
        metadata: {
          source: "quote_items",
          op: kind,
          item_id: item.id,
          item_title: item.title,
          status: currentStatus,
        },
      },
      "Не вдалося записати зміну позиції у стрічку подій."
    );
    if (!logged.ok) {
      // Запис у журнал не скасовує вже збережену зміну — інакше позиція і база
      // розійшлись би через дрібницю. Просто кажемо про це вголос.
      toast.error(logged.message);
      return;
    }
    await loadActivityLog();
  };

  const requestDeleteItem = (item: QuoteItem) => {
    setDeleteItemTarget(item);
  };

  const confirmDeleteItem = async () => {
    const target = deleteItemTarget;
    if (!target || deleteItemBusy) return;
    setDeleteItemBusy(true);
    setItemsError(null);

    // Тиражі позиції зникають разом із нею каскадом у базі. Виняток — старі
    // рядки без quote_item_id: їх тримає лише правило «тиражі єдиної позиції»,
    // тож коли ця позиція остання, прибираємо їх окремим запитом.
    const orphanRunIds =
      items.length === 1
        ? runs.filter((run) => !run.quote_item_id && run.id).map((run) => run.id as string)
        : [];

    const removed = await deleteQuoteItemRow(target.id);
    if (!removed.ok) {
      setItemsError(removed.message);
      toast.error(removed.message);
      setDeleteItemBusy(false);
      return;
    }
    if (orphanRunIds.length > 0) {
      const removedRuns = await deleteQuoteRunsByIds(orphanRunIds);
      if (!removedRuns.ok) setItemsError(removedRuns.message);
    }

    setItems((prev) => prev.filter((item) => item.id !== target.id));
    setRuns((prev) =>
      prev.filter((run) => (run.quote_item_id ? run.quote_item_id !== target.id : items.length !== 1))
    );
    setDeleteItemTarget(null);
    setDeleteItemBusy(false);
    toast.success("Позицію видалено");
    await logItemChange("delete", target);
  };

  const handleAddComment = () => {
    if (!commentText.trim() || commentSaving) return;
    void saveComment(commentText.trim());
  };

  const measureMentionDropdown = () => {
    const textarea = commentTextareaRef.current;
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
    if (
      !nextContext ||
      !mentionContext ||
      mentionContext.start !== nextContext.start ||
      mentionContext.end !== nextContext.end ||
      mentionContext.query !== nextContext.query
    ) {
      setMentionActiveIndex(0);
    }
  };

  const applyMentionSuggestion = (suggestion: MentionSuggestion) => {
    if (!mentionContext) return;

    const before = commentText.slice(0, mentionContext.start);
    const after = commentText.slice(mentionContext.end);
    const mentionToken = `@${suggestion.alias}`;
    const needsSpaceAfter =
      after.length > 0 && !/^[\s,;:!?()[\]{}<>]/u.test(after);
    const insertText = `${mentionToken}${needsSpaceAfter ? " " : ""}`;
    const nextValue = `${before}${insertText}${after}`;
    const caretPosition = before.length + insertText.length;

    setCommentText(nextValue);
    setMentionContext(null);
    setMentionActiveIndex(0);

    requestAnimationFrame(() => {
      const input = commentTextareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(caretPosition, caretPosition);
    });
  };

  const handleCommentTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        filteredMentionSuggestions[Math.max(0, mentionActiveIndex)] ??
        filteredMentionSuggestions[0];
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

  const saveComment = async (body: string) => {
    setCommentSaving(true);
    setCommentsError(null);

    const authorId = await getCurrentUserId();
    if (!authorId) {
      setCommentsError("Не вдалося визначити користувача.");
      setCommentSaving(false);
      return;
    }
    const effectiveTeamId = quote?.team_id ?? teamId;
    if (!effectiveTeamId) {
      setCommentsError("Немає доступної команди.");
      setCommentSaving(false);
      return;
    }

    const mentionKeys = extractMentionKeys(body);
    const hasMentionsInBody = mentionKeys.length > 0;
    const mentionedUserIds = new Set<string>();
    for (const mentionKey of mentionKeys) {
      const candidates = mentionLookup.get(mentionKey);
      // Згадку розсилаємо лише коли ім'я однозначне: два однакові — не вгадуємо.
      if (!candidates || candidates.size !== 1) continue;
      const [mentionedUserId] = Array.from(candidates);
      if (mentionedUserId && mentionedUserId !== authorId) {
        mentionedUserIds.add(mentionedUserId);
      }
    }
    const mentionUserIdsList = Array.from(mentionedUserIds);

    const result = await createQuoteComment({
      quoteId,
      teamId: effectiveTeamId,
      body,
      userId: authorId,
      threadKey: threadKeyForQuote(quoteId),
      mentionedUserIds: mentionUserIdsList,
      hasMentionsInBody,
    });

    if (!result.ok) {
      setCommentsError(result.message);
      setCommentSaving(false);
      return;
    }

    const inserted: InsertedCommentRow = result.data.comment;
    setComments((prev) => [
      {
        id: inserted.id,
        body: inserted.body ?? body,
        created_at: inserted.created_at ?? new Date().toISOString(),
        created_by: inserted.created_by ?? authorId,
      },
      ...prev,
    ]);

    if (hasMentionsInBody && !result.data.mentionsHandledViaServer) {
      try {
        await invokeQuoteCommentsFunction({
          mode: "notify_mentions",
          quoteId,
          body,
          mentionedUserIds: mentionUserIdsList,
        });
      } catch (notifyError) {
        const actorLabel = memberById.get(authorId) ?? "Користувач";
        const quoteLabel = quote?.number ? `#${quote.number}` : quoteId;
        const trimmedBody = body.length > 220 ? `${body.slice(0, 217)}...` : body;
        try {
          await notifyUsers({
            userIds: mentionUserIdsList,
            title: `${actorLabel} згадав(ла) вас у коментарі`,
            body: `Прорахунок ${quoteLabel}: ${trimmedBody}`,
            href: `/orders/estimates/${quoteId}`,
            type: "info",
          });
        } catch (notificationsError) {
          console.warn("Failed to send mention notifications", notificationsError, notifyError);
        }
      }
    }

    setCommentText("");
    setMentionContext(null);
    setMentionActiveIndex(0);
    await loadActivityLog();
    setCommentSaving(false);
  };

  const toggleMethod = (methodId: string) => {
    setItemMethods(prev => {
      const existing = prev.find(m => m.methodId === methodId);
      if (existing) {
        return prev.filter(m => m.methodId !== methodId);
      } else {
        return [...prev, { id: createLocalId(), methodId, count: 1 }];
      }
    });
    setAutoMethodsApplied(true);
  };

  if (loading || quoteSectionsBootstrapping) {
    return <PageLoading />;
  }

  if (error || !quote) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">Помилка завантаження</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => navigate("/orders/estimates")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад до списку
          </Button>
        </div>
      </div>
    );
  }

  const deadlineTabBadge = quote.deadline_at ? buildDeadlineBadgePreview(quote.deadline_at).label : "Не вказано";
  const discussionCount = comments.length + attachments.length;
  const designBadge = designTask
    ? "Задача"
    : quote.design_brief?.trim()
    ? "ТЗ"
    : designVisualizations.length > 0
    ? String(designVisualizations.length)
    : null;
  const quotePageTabs: Array<{
    value: QuotePageTab;
    label: string;
    icon: LucideIcon;
    badge?: string | number | null;
    attention?: boolean;
    mobileOnly?: boolean;
    soon?: boolean;
  }> = [
    {
      value: "products",
      label: "Товари",
      icon: Package,
      badge: items.length || null,
      attention: Boolean(itemsError || runsError || quoteRequirements.length > 0),
    },
    {
      value: "design",
      label: "Дизайн",
      icon: Palette,
      badge: designBadge,
      attention: Boolean(designTaskError),
    },
    {
      value: "deadlines",
      label: "Дедлайни",
      icon: Calendar,
      badge: deadlineTabBadge,
      attention: Boolean(deadlineError || !quote.deadline_at),
    },
    {
      value: "discussion",
      label: "Обговорення",
      icon: MessageSquare,
      badge: discussionCount || null,
      attention: Boolean(commentsError || attachmentsError || activityError || historyError),
    },
    {
      value: "details",
      label: "Деталі",
      icon: FileText,
      badge: canViewSummarySection ? formatCurrency(totals.total, quote.currency) : null,
      mobileOnly: true,
    },
    // «Економіка» стоїть останньою і поки що веде на заглушку: вкладку ще
    // узгоджують (REQ-56), і доки рішення не ухвалені, формула ціни лишається
    // рівно такою, як зараз. Порожня вкладка з чесним «скоро» краща за
    // вигаданий макет, який доведеться переробляти.
    {
      value: "economics",
      label: "Економіка",
      icon: Banknote,
      soon: true,
    },
  ];

  return (
    <div ref={layoutRootRef} className="text-foreground">
      {/* Курсори колег — те саме, що на дошках: якщо в прорахунку є ще хтось,
          видно, куди він дивиться (REQ-163). Ключ каналу включає id, щоб
          зустрічались лише ті, хто в ЦЬОМУ прорахунку. */}
      <LiveCursorsLayer pageKey={`quote:${quoteId}`} />
      {/*
        Дві колонки на всю висоту вікна.

        Шапка прорахунку живе ВСЕРЕДИНІ лівої колонки, а не над обома: інакше
        права колонка починалась би на 81 px нижче й ніколи не діставала верху
        екрана. Тепер розмова праворуч отримує всю висоту, а номер зі статусом
        стоять рівно над тим, до чого належать — над вмістом прорахунку.
      */}
      <div className="grid grid-cols-1 xl:h-full xl:grid-cols-[minmax(0,1fr)_var(--quote-rail-w,380px)] xl:overflow-hidden">
        <div className="flex min-w-0 flex-col xl:h-full xl:min-h-0 xl:overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur xl:static xl:shrink-0 xl:bg-transparent xl:backdrop-blur-none">
        <div className="px-4 py-2 md:px-5 lg:px-6">
          {/*
            Один ряд і на телефоні теж.
            Було: колонка до lg — тобто на телефоні номер стояв окремим рядком,
            а під ним на всю ширину лягала смуга дій. Дві третини висоти екрана
            над контентом займала шапка. Тепер це один ряд, що переноситься лише
            коли справді не влазить, а дії тримаються праворуч у будь-якій ширині.
          */}
          <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
            {/* Номер і кнопка назад — те, що не має стискатись ніколи. */}
            <div className="flex shrink-0 items-center gap-2 lg:gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/orders/estimates")}
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Назад"
                title="Назад"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <HoverCopyText
                value={quote.number ?? quote.id}
                textClassName="font-mono text-[15px] font-medium tracking-wide text-foreground sm:text-[17px]"
                successMessage="Номер прорахунку скопійовано"
                copyLabel="Скопіювати номер прорахунку"
              >
                {quote.number ?? quote.id}
              </HoverCopyText>
            </div>

            {/*
              Мітки (тип, КП/набори, хто дивиться) на телефоні їдуть власним
              рядком під номером — `order-3 w-full`. Інакше вони змагаються за
              ширину зі статусом і номер обрізається до «TS-0226…», хоча саме
              номер тут головний. На lg усе повертається в один ряд.
            */}
            <div className="order-3 w-full lg:order-none lg:w-auto">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <QuoteTypeBadge quoteType={quote.quote_type} />
                  {quoteSetMembership && (quoteSetMembership.kp_count > 0 || quoteSetMembership.set_count > 0) ? (
                    <>
                      {quoteSetMembership.kp_names.map((name) => (
                        <QuoteKindBadge key={`header-kp-${name}`} kind="kp" label={name} />
                      ))}
                      {quoteSetMembership.set_names.map((name) => (
                        <QuoteKindBadge key={`header-set-${name}`} kind="set" label={name} />
                      ))}
                    </>
                  ) : null}

              </div>
            </div>

            <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 lg:order-none">
              {currentStatus === "approved" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => void openCreateOrderDialog()}
                >
                  <FileDown className="h-4 w-4" />
                  {/* На телефоні лишається сама іконка: підпис із трьох слів
                      з'їдав рядок, а поруч стоїть статус, який важливіший. */}
                  <span className="truncate max-sm:sr-only">Створити замовлення</span>
                </Button>
              ) : null}
              <QuoteStatusControl
                currentStatus={currentStatus}
                busy={statusBusy}
                blockReason={statusBlockReason}
                nextStatus={nextAction.nextStatus}
                nextActionLabel={nextAction.ctaLabel}
                onPrimaryAction={handlePrimaryStatusAction}
                onPickStatus={(status) => void handleQuickStatusChange(status, "")}
                onOpenStatusDialog={openStatusDialog}
                onOpenCancelDialog={() => setCancelDialogOpen(true)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(!designTask || canCreateMoreDesignTasks) && !designTaskLoading ? (
                    <>
                      <DropdownMenuItem
                        disabled={designTaskSaving || !canEditQuoteContent}
                        onSelect={(event) => {
                          event.preventDefault();
                          setDesignTaskError(null);
                          // Одразу підставляємо першу позицію без задачі — найчастіший
                          // сценарій, і людині лишається натиснути «Створити».
                          setDesignTaskItemId(itemsWithoutDesignTask[0]?.id ?? null);
                          setCreateDesignTaskDialogOpen(true);
                        }}
                      >
                        <Palette className="mr-2 h-4 w-4" />
                        {designTaskSaving
                          ? "Створення..."
                          : designTasks.length > 0
                            ? "Ще одна дизайн-задача"
                            : "Створити дизайн-задачу"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!quote || (!canEditQuoteContent && !isLogisticsJobRole(viewerJobRole))}
                    onSelect={(event) => {
                      event.preventDefault();
                      openEditQuote();
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Редагувати
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={duplicateQuoteBusy || !quote?.id || !canOpenCurrentQuote}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleDuplicateQuote();
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {duplicateQuoteBusy ? "Дублювання..." : "Дублювати"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!canEditQuoteContent}
                    className="text-destructive focus:text-destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      setDeleteQuoteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Видалити
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

        <main
          className={cn(
            // Відступи вдвічі менші за попередні (було px-4/5/6/8).
            // Колонка стала вужчою після того, як розмова забрала праву
            // частину, і поля по 24-32 px з'їдали ширину, якої бракує таблиці
            // тиражів. Дихання лишається, порожнього канта — ні.
            "min-w-0 px-2 pt-0 md:px-2.5 lg:px-3 xl:flex xl:h-full xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-hidden xl:pb-0 2xl:px-4",
            // На телефоні вкладка «Деталі» живе в боковій колонці, і тіло тут
            // порожнє — нижній відступ у такому разі малює 40 px дірки між
            // вкладками й першою карткою.
            activeQuoteTab === "details" ? "pb-0" : "pb-10"
          )}
        >
          {/*
            Вкладки — підкресленням, а не рамковими пігулками.
            Рамка навколо кожної вкладки давала другу сітку поверх шапки: чотири
            коробки в ряд читались як чотири кнопки дії, і активна вкладка
            губилась серед них. Тепер активна тримається вагою тексту і тонкою
            рискою знизу — рядок вкладок перестав сперечатися зі смугою дій.
          */}
          <div className="mb-4 -mx-4 border-b border-border/50 bg-background/95 px-4 backdrop-blur md:-mx-5 md:px-5 lg:-mx-6 lg:px-6 xl:shrink-0 2xl:-mx-8 2xl:px-8">
            <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {quotePageTabs.map((tab) => {
                const isActive = activeQuoteTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveQuoteTab(tab.value)}
                    className={cn(
                      "relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      // Підкреслення малюємо псевдоелементом на самій кнопці, а не
                      // окремим вузлом: інакше воно стрибає на 1px від нижньої
                      // межі контейнера при скролі вкладок.
                      "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                      isActive
                        ? "font-semibold text-foreground after:bg-primary"
                        : "font-medium text-muted-foreground after:bg-transparent hover:text-foreground",
                      tab.mobileOnly && "xl:hidden"
                    )}
                    aria-pressed={isActive}
                  >
                    <span>{tab.label}</span>
                    {tab.badge ? (
                      <span
                        className={cn(
                          "max-w-[96px] truncate text-2xs tabular-nums",
                          isActive ? "text-muted-foreground" : "text-muted-foreground/75"
                        )}
                      >
                        {tab.badge}
                      </span>
                    ) : null}
                    {tab.soon ? (
                      <span className="rounded-[5px] bg-accent-tone-soft px-1.5 py-px text-3xs font-bold uppercase tracking-caps-tight text-accent-tone-foreground">
                        скоро
                      </span>
                    ) : null}
                    {tab.attention ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pb-8">
            {quoteLockedByOther || quoteLock.releaseRequestedByName || quoteLock.idleSecondsLeft !== null || quoteLock.releasedReason || statusError || quoteRequirements.length > 0 ? (
              <div className="space-y-3">
                <EntityLockBanner
                  lock={quoteLock}
                  subject="прорахунок"
                  onRelease={quoteLock.release}
                  canForceRelease={accessRole === "owner" || jobRole === "seo"}
                />

                {statusError && (
                  <div className="tone-danger-subtle flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm">
                    <span
                      className="tone-danger grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
                      aria-hidden
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 self-center leading-relaxed">{statusError}</span>
                  </div>
                )}

                {/*
                  Чого бракує — списком, а не одним реченням.
                  Раніше це був суцільний рядок «Заповніть обов'язкові поля: A, B (тираж 30 шт),
                  C (тираж 30 шт)» — на трьох тиражах він розповзався на два рядки, і в ньому
                  неможливо було порахувати, скільки саме пунктів лишилось. Пункти окремими
                  чипами читаються перерахунком: видно кількість і видно кожен.
                  Текст пунктів беремо як є з quoteRequirements — це той самий гейт збереження.
                */}
                {quoteRequirements.length > 0 ? (
                  <div className="tone-warning-subtle rounded-xl border px-3.5 py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className="tone-warning grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
                        aria-hidden
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-relaxed">
                          Прорахунок не готовий до збереження або зміни статусу
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {quoteRequirements.map((requirement) => (
                            <li
                              key={`requirement-${requirement}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-current/25 bg-background/45 px-2.5 py-0.5 text-2xs font-medium"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-warning-solid" aria-hidden />
                              {requirement}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}

              </div>
            ) : null}

            <section className={cn("py-2", activeQuoteTab !== "products" && "hidden")}>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-base font-semibold tracking-tight text-foreground">Товари і тиражі</div>
                    <div className="text-xs text-muted-foreground">
                      {pluralUk(items.length, "товар", "товари", "товарів")} ·{" "}
                      {pluralUk(runs.length, "тираж", "тиражі", "тиражів")} · фіксовано
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canEditQuoteContent ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canManageItems}
                      title={itemsLockedHint ?? undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openNewItem();
                      }}
                      className="h-10 gap-2 rounded-xl"
                    >
                      <Plus className="h-4 w-4" />
                      Додати товар
                    </Button>
                  ) : null}
                </div>
              </div>

              {itemsLockedHint ? (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {itemsLockedHint}{" "}
                    <Link
                      to={`/orders/production/${quoteOrderRef?.id ?? ""}`}
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Відкрити замовлення
                    </Link>
                  </span>
                </div>
              ) : null}

              {quoteSectionsBootstrapping ? (
                <AppSectionLoader label="Завантаження..." />
              ) : itemsLoading ? (
                <AppSectionLoader label="Завантаження..." />
              ) : itemsError ? (
                <div className="py-4 text-sm text-destructive">{itemsError}</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30" />
                  <div>
                    <p className="font-medium">Модель не обрана</p>
                    <p className="text-sm text-muted-foreground">Оберіть модель для розрахунку</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={openNewItem}
                    disabled={!canManageItems}
                    title={itemsLockedHint ?? undefined}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Обрати модель
                  </Button>
                </div>
              ) : (
                <div>
                  {items.map((item, itemIndex) => {
                    const { typeId: resolvedTypeId, kindId: resolvedKindId, modelId: resolvedModelId } =
                      resolveCatalogSelection({
                        typeId: item.catalogTypeId ?? item.productTypeId ?? undefined,
                        kindId: item.catalogKindId ?? item.productKindId ?? undefined,
                        modelId: item.catalogModelId ?? item.productModelId ?? undefined,
                      });
                    const typeLabel =
                      item.resolvedTypeName ?? getTypeLabel(catalogTypes, resolvedTypeId);
                    const kindLabel =
                      item.resolvedKindName ?? getKindLabel(catalogTypes, resolvedTypeId, resolvedKindId);
                    const modelLabel =
                      item.resolvedModelName ??
                      getModelLabel(
                      catalogTypes,
                      resolvedTypeId,
                      resolvedKindId,
                      resolvedModelId
                    );
                    const metaLine = [typeLabel, kindLabel].filter(Boolean).join(" / ");
                    const positionLabel = getPrintPositionLabel(
                      catalogTypes,
                      resolvedTypeId,
                      resolvedKindId,
                      item.printPositionId
                    );
                    const sizeLabel =
                      item.printWidthMm && item.printHeightMm
                        ? `${item.printWidthMm}×${item.printHeightMm} мм`
                        : item.printWidthMm
                        ? `${item.printWidthMm} мм`
                        : item.printHeightMm
                        ? `${item.printHeightMm} мм`
                        : null;
                    const catalogZoomImage = item.resolvedModelImageUrl ?? getModelImage(
                      catalogTypes,
                      resolvedTypeId,
                      resolvedKindId,
                      resolvedModelId
                    );
                    const catalogImage = item.resolvedModelThumbUrl ?? catalogZoomImage;
                    const attachmentImage =
                      !resolvedModelId && item.attachment?.url && item.attachment.type.startsWith("image/")
                        ? item.attachment.url
                        : null;
                    const variantImageUrl = item.metadata?.catalogVariant?.imageUrl?.trim() || null;
                    const productPreview = variantImageUrl || catalogImage || attachmentImage
                      ? {
                          type: "image" as const,
                          url: variantImageUrl ?? catalogImage ?? attachmentImage ?? "",
                          zoomUrl: variantImageUrl ?? catalogZoomImage ?? attachmentImage ?? catalogImage ?? "",
                        }
                      : null;
                    const modelSpecPreset = getModelSpecPreset(
                      catalogTypes,
                      resolvedTypeId,
                      resolvedKindId,
                      resolvedModelId
                    );
                    const printProductConfig = getPrintProductConfig(item.metadata);
                    const packageSummary = printProductConfig ? formatPrintProductSummary(printProductConfig) : [];
                    const packageSections = printProductConfig ? getPrintProductDetailSections(printProductConfig) : [];
                    const packageSizeHint = null;
                    const catalogVariant =
                      item.metadata?.catalogVariant?.name.trim()
                        ? {
                            name: item.metadata.catalogVariant.name.trim(),
                            sku: item.metadata.catalogVariant.sku?.trim() || null,
                            imageUrl: item.metadata.catalogVariant.imageUrl?.trim() || null,
                          }
                        : null;
                    const itemSku = item.metadata?.sku?.trim() || catalogVariant?.sku || null;
                    const shouldShowDescription =
                      item.description && (!packageSummary.length || item.description !== packageSummary.join(" • "));
                    const isMerchQuote = (quote?.quote_type ?? "") === "merch";
                    const itemRuns = runs.filter((run) =>
                      run.quote_item_id ? run.quote_item_id === item.id : items.length === 1
                    );
                    const specHighlights = [
                      ...(!isMerchQuote
                        ? [
                            { label: "Кількість", value: `${item.qty}` },
                            { label: "Одиниця", value: normalizeUnitLabel(item.unit) },
                          ]
                        : []),
                      ...((positionLabel || sizeLabel) && (!item.methods || item.methods.length === 0)
                        ? [
                            {
                              label: "Нанесення",
                              value: [positionLabel ?? "Не вказано", sizeLabel].filter(Boolean).join(" · "),
                            },
                          ]
                        : []),
                    ];
                    const methodSections = item.methods && item.methods.length > 0
                      ? [
                          {
                            title: "Нанесення",
                            fields: item.methods.map((method) => {
                              const methodName =
                                item.resolvedMethodNames?.[method.methodId] ??
                                getMethodLabel(
                                  catalogTypes,
                                  resolvedTypeId,
                                  resolvedKindId,
                                  method.methodId
                                ) ?? "Метод";
                              const place =
                                getPrintPositionLabel(
                                  catalogTypes,
                                  resolvedTypeId,
                                  resolvedKindId,
                                  method.printPositionId
                                ) ?? positionLabel ?? "Місце не вказано";
                              const size =
                                method.printWidthMm && method.printHeightMm
                                  ? `${method.printWidthMm}×${method.printHeightMm} мм`
                                  : method.printWidthMm
                                  ? `${method.printWidthMm} мм`
                                  : method.printHeightMm
                                  ? `${method.printHeightMm} мм`
                                  : sizeLabel;

                              return {
                                label: method.count > 1 ? `${methodName} ×${method.count}` : methodName,
                                value: [place, size].filter(Boolean).join(" · "),
                              };
                            }),
                          },
                        ]
                      : [];
                    const defaultSpecSections = [
                      specHighlights.length > 0
                        ? {
                            title: "Параметри",
                            fields: specHighlights,
                          }
                        : null,
                      ...methodSections,
                    ].filter((section): section is { title: string; fields: Array<{ label: string; value: string }> } => Boolean(section));
                    const renderedSections = packageSections.length > 0 ? packageSections : defaultSpecSections;
                    const printSummaryPriority = [
                      "Розмір (Ш × В × Г)",
                      "Формат",
                      "Матеріал",
                      "Папір",
                      "Папір блоку",
                      "Щільність",
                      "Щільність блоку",
                      "Кількість аркушів",
                      "Тип нанесення",
                      "Друк",
                      "Друк обкладинки",
                      "Друк блоку",
                      "Ламінація",
                      "Додаткове оздоблення",
                      "Вибірковий лак",
                    ];
                    const printDetailFields = packageSections.flatMap((section) =>
                      section.fields.map((field) => ({ ...field, section: section.title }))
                    );
                    const compactPrintFields = printDetailFields
                      .filter((field) => printSummaryPriority.includes(field.label))
                      .sort(
                        (a, b) =>
                          printSummaryPriority.indexOf(a.label) - printSummaryPriority.indexOf(b.label)
                      )
                      .slice(0, 6);

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "overflow-hidden rounded-4xl border border-border/60 bg-background",
                          itemIndex > 0 && "mt-4"
                        )}
                      >
                        <div className="flex flex-col gap-3 p-2.5 sm:flex-row sm:items-start sm:gap-4 sm:p-3">
                          <div className="shrink-0">
                            {productPreview?.type === "image" ? (
                              <KanbanImageZoomPreview
                                imageUrl={productPreview.url}
                                zoomImageUrl={productPreview.zoomUrl}
                                alt={modelLabel ?? "Товар"}
                                loadStrategy="eager"
                                className="h-20 w-20 rounded-2xl border-border/50 bg-muted/20 ring-1 ring-border/50 [&>div]:rounded-2xl"
                                imageClassName="object-cover"
                              />
                            ) : (
                              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border/40 bg-muted/40">
                                <Package className="h-6 w-6 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* Reserve at least the image height so the full-width runs
                                section below never rides up under the product image when
                                there are no spec chips (e.g. merch without нанесення). */}
                            <div className="sm:min-h-20">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                  <div className="truncate text-xl font-semibold tracking-tight text-foreground">{item.title}</div>
                                  {metaLine ? (
                                    <div className="text-sm text-muted-foreground">{metaLine}</div>
                                  ) : null}
                                  {packageSizeHint ? (
                                    <span className="rounded-md border border-border/50 bg-muted/20 px-2 py-0.5 text-3xs font-medium uppercase tracking-caps text-muted-foreground">
                                      {packageSizeHint}
                                    </span>
                                  ) : null}
                                </div>
                                {catalogVariant || itemSku ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                    {catalogVariant ? (
                                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-2 py-1">
                                        <span className="truncate">{catalogVariant.name}</span>
                                      </span>
                                    ) : null}
                                    {itemSku ? (
                                      <span className="inline-flex items-center rounded-lg border border-border/50 bg-muted/20 px-2 py-1">
                                        Артикул: {itemSku}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                {(() => {
                                  const linkMeta = item.metadata as unknown as Record<string, unknown> | null;
                                  const snapshotSupplier =
                                    typeof linkMeta?.supplierUrl === "string" ? linkMeta.supplierUrl : "";
                                  const snapshotAvantprint =
                                    typeof linkMeta?.avantprintUrl === "string" ? linkMeta.avantprintUrl : "";
                                  // Prefer the live catalog model link so editing the model updates
                                  // every quote instantly; fall back to the snapshot on the item.
                                  const linkModel = catalogTypes
                                    .find((type) => type.id === resolvedTypeId)
                                    ?.kinds.find((kind) => kind.id === resolvedKindId)
                                    ?.models.find((model) => model.id === resolvedModelId);
                                  const supplierUrl = (linkModel?.metadata?.supplierUrl ?? snapshotSupplier).trim();
                                  const avantprintUrl = (
                                    linkModel?.metadata?.avantprintUrl ?? snapshotAvantprint
                                  ).trim();
                                  const renderLinkButton = (url: string, label: string, hint: string) =>
                                    url ? (
                                      <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 transition-colors">
                                        <a href={url} target="_blank" rel="noopener noreferrer">
                                          {label}
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1.5 border-dashed text-muted-foreground/70"
                                        disabled
                                        title={hint}
                                      >
                                        {label}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Button>
                                    );
                                  return (
                                    <>
                                      {renderLinkButton(
                                        supplierUrl,
                                        "Постачальник",
                                        "Посилання на товар у постачальника зʼявиться після його додавання в товарі"
                                      )}
                                      {renderLinkButton(
                                        avantprintUrl,
                                        "Аванпринт",
                                        "Посилання на товар на Аванпринті зʼявиться після його додавання в товарі"
                                      )}
                                    </>
                                  );
                                })()}
                                {canEditQuoteContent ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label={`Дії з позицією «${item.title}»`}
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {/* Без preventDefault: меню має згорнутись саме,
                                          інакше воно лишається розкритим під вікном
                                          підтвердження. */}
                                      <DropdownMenuItem
                                        disabled={!canManageItems}
                                        onSelect={() => openEditItem(item)}
                                      >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Редагувати
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        disabled={!canManageItems}
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() => requestDeleteItem(item)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Видалити
                                      </DropdownMenuItem>
                                      {itemsLockedHint ? (
                                        <>
                                          <DropdownMenuSeparator />
                                          <div className="max-w-64 px-2 py-1.5 text-xs text-muted-foreground">
                                            {itemsLockedHint}
                                          </div>
                                        </>
                                      ) : null}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            </div>

                            {packageSections.length > 0 ? (
                              <div className="mt-4 space-y-3">
                                {compactPrintFields.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {compactPrintFields.map((field) => (
                                      <span
                                        key={`print-summary:${field.label}:${field.value}`}
                                        className="inline-flex min-h-14 min-w-[112px] max-w-full flex-col justify-center gap-1 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                                        title={`${field.label}: ${field.value}`}
                                      >
                                        <span className="text-3xs font-semibold uppercase leading-none tracking-caps text-muted-foreground">
                                          {field.label === "Розмір (Ш × В × Г)" ? "Розмір" : field.label}
                                        </span>
                                        <span className="max-w-full truncate text-base font-semibold leading-none text-foreground/90">
                                          {field.value}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                <details className="group rounded-xl border border-border/50 bg-muted/[0.04]">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                                    <div>
                                      <div className="text-sm font-semibold text-foreground">Специфікація поліграфії</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">
                                        {printDetailFields.length} параметрів у {packageSections.length} секціях
                                      </div>
                                    </div>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                  </summary>
                                  <div className="grid gap-3 border-t border-border/50 p-3 md:grid-cols-2 xl:grid-cols-3">
                                    {packageSections.map((section) => (
                                      <div
                                        key={section.title}
                                        className="rounded-lg border border-border/40 bg-background/60 p-3"
                                      >
                                        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          {section.title}
                                        </div>
                                        <div className="space-y-2">
                                          {section.fields.map((field) => (
                                            <div
                                              key={`${section.title}:${field.label}`}
                                              className="grid grid-cols-[minmax(96px,0.8fr)_minmax(0,1.2fr)] gap-3 text-sm"
                                            >
                                              <div className="min-w-0 text-muted-foreground">{field.label}</div>
                                              <div className="min-w-0 font-semibold leading-snug text-foreground">
                                                {field.value}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            ) : renderedSections.length > 0 ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {renderedSections.map((section) => (
                                  <div
                                    key={section.title}
                                    className="contents"
                                  >
                                    {section.fields.map((field) => (
                                      <span
                                        key={`${section.title}:${field.label}`}
                                        className="inline-flex min-h-14 min-w-[112px] max-w-full flex-col justify-center gap-1 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                                        title={field.value ? `${field.label}: ${field.value}` : field.label}
                                      >
                                        <span className="text-3xs font-semibold uppercase leading-none tracking-caps text-muted-foreground">
                                          {field.label}
                                        </span>
                                        {field.value ? (
                                          <span className="max-w-full truncate text-base font-semibold leading-none text-foreground/90">
                                            {field.value}
                                          </span>
                                        ) : null}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <PrintSpecPanel
                              quoteItemId={item.id}
                              presetKey={modelSpecPreset}
                              saved={item.metadata?.printSpec ?? null}
                              canEdit={canEditPrintSpec}
                              onSaved={() => void loadItems()}
                            />

                            {shouldShowDescription ? (
                              <div className="mt-5">
                                <div className="mb-2 text-xs font-medium text-muted-foreground">Опис</div>
                                <div className="text-sm leading-relaxed text-foreground">{item.description}</div>
                              </div>
                            ) : null}

                            {item.attachment ? (
                              <div className="mt-5 flex items-center gap-3">
                                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-foreground">
                                    {item.attachment.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatFileSize(item.attachment.size)}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            </div>

                            <div className="mt-5 -mx-5 border-t border-border/50 px-5 pt-4 pb-0 sm:mr-0 sm:-ml-[6.5rem] sm:w-[calc(100%+6.5rem)] sm:px-0">
                              {(() => {
                                const activeItemRun = getSelectedRunForItem(item.id);
                                const activeItemRunIndex = getRunIndex(activeItemRun);
                                const activePricing = getRunPricing(activeItemRun);
                                const activeRunEconomics = activeItemRun
                                  ? validateRunEconomics({
                                      quantity: Number(activeItemRun.quantity) || 0,
                                      costTotal: activePricing.costTotal,
                                      desiredManagerIncome: activePricing.desiredManagerIncome,
                                      managerRate: activePricing.managerRate,
                                      fixedCostRate: activePricing.fixedCostRate,
                                      vatRate: activePricing.vatRate,
                                    })
                                  : null;

                                return (
                                  <div className="space-y-4">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                      <div className="mr-1 text-xs font-semibold uppercase tracking-caps text-muted-foreground">
                                        Тиражі
                                      </div>
                                      {itemRuns.map((run, runIndex) => {
                                        const qty = Number(run.quantity) || 0;
                                        const isSelected = !!run.id && activeItemRun?.id === run.id;
                                        const isApproved = run.is_approved === true;
                                        return (
                                          <button
                                            key={run.id ?? `${item.id}:run-pill:${runIndex}`}
                                            type="button"
                                            onClick={() => selectRunForItem(run, item.id)}
                                            title={isApproved ? "Цей тираж погодив клієнт" : undefined}
                                            className={cn(
                                              "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                                              isSelected
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : isApproved
                                                  ? "border-success-soft-border bg-success-soft text-success-foreground hover:bg-success-soft/70"
                                                  : "border-border/60 bg-background hover:bg-muted/40"
                                            )}
                                          >
                                            {isApproved ? (
                                              <Check
                                                className={cn(
                                                  "h-3.5 w-3.5 shrink-0",
                                                  isSelected ? "text-primary-foreground" : "text-success-foreground"
                                                )}
                                              />
                                            ) : null}
                                            <span className="font-mono text-base tabular-nums">{qty}</span>
                                            <span className={cn("text-xs", isSelected ? "text-primary-foreground/75" : "text-muted-foreground")}>
                                              {normalizeUnitLabel(item.unit)}
                                            </span>
                                          </button>
                                        );
                                      })}
                                      {canEditRuns ? (
                                        <button
                                          type="button"
                                          onClick={() => addRun(item.id)}
                                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                                          aria-label="Додати тираж"
                                        >
                                          <Plus className="h-4 w-4" />
                                        </button>
                                      ) : null}
                                    </div>

                                    {itemRuns.length === 0 ? (
                                      <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                                        Для цього товару ще немає тиражів
                                      </div>
                                    ) : activeItemRun && activeItemRunIndex >= 0 ? (
                                      <div className="rounded-xl border border-border/60 bg-muted/[0.03] p-4">
                                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                                            <span className="text-sm font-semibold text-foreground">Активний тираж</span>
                                            <span className="text-sm text-muted-foreground">·</span>
                                            <div className="relative h-8 w-32">
                                              <NumberInput
                                                value={activeItemRun.quantity}
                                                disabled={!canEditRuns}
                                                onValueChange={(next) => updateRunValue(activeItemRunIndex, "quantity", next)}
                                                min={1}
                                                emptyValue={1}
                                                className="h-8 w-full rounded-lg bg-background pl-3 pr-12 text-left font-mono text-sm font-semibold tabular-nums"
                                                aria-label="Кількість активного тиражу"
                                              />
                                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                                {normalizeUnitLabel(item.unit)}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {/* Рішення клієнта фіксується там, де воно ухвалюється, —
                                                на самому тиражі. Саме звідси беруться кількість і ціна
                                                в замовлення; без позначки замовлення бралось за першим
                                                створеним тиражем (25.08.2026). */}
                                            {canEditRuns ? (
                                              <Button
                                                variant={activeItemRun.is_approved ? "secondary" : "ghost"}
                                                size="sm"
                                                className={cn(
                                                  "h-8 gap-1.5",
                                                  activeItemRun.is_approved
                                                    ? "bg-success-soft text-success-foreground hover:bg-success-soft/70"
                                                    : "text-muted-foreground"
                                                )}
                                                onClick={() => toggleApprovedRun(activeItemRun.id, activeItemRun.quote_item_id ?? item.id)}
                                                title={
                                                  activeItemRun.is_approved
                                                    ? "Зняти позначку погодження"
                                                    : "Цей тираж погодив клієнт — саме він піде в замовлення"
                                                }
                                              >
                                                <Check className="h-3.5 w-3.5" />
                                                {activeItemRun.is_approved ? "Погоджено клієнтом" : "Погодив клієнт"}
                                              </Button>
                                            ) : activeItemRun.is_approved ? (
                                              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success-soft px-2.5 text-xs font-medium text-success-foreground">
                                                <Check className="h-3.5 w-3.5" />
                                                Погоджено клієнтом
                                              </span>
                                            ) : null}
                                            {canEditRuns ? (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                                                onClick={() => void removeRun(activeItemRunIndex)}
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Видалити
                                              </Button>
                                            ) : null}
                                          </div>
                                        </div>

                                        {/* Поки вибору немає, замовлення з прорахунку не зробити —
                                            краще сказати це тут, ніж за три кроки у вікні створення. */}
                                        {needsApprovedRunChoice(itemRuns) ? (
                                          <div className="mb-4 rounded-lg border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-copy">
                                            Тиражів кілька — позначте той, який погодив клієнт. Саме з нього
                                            підуть кількість і ціна в замовлення.
                                          </div>
                                        ) : null}

                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                          <div className="space-y-2">
                                            <Label className="block min-h-7 text-2xs uppercase leading-tight tracking-wide text-muted-foreground">
                                              Собівартість / од.
                                            </Label>
                                            <CurrencyAmountInput
                                              value={activeItemRun.unit_price_model}
                                              disabled={!runPriceFieldAccess.unit_price_model}
                                              title={runFieldLockHint(runPriceFieldAccess.unit_price_model, "менеджер")}
                                              onValueChange={(next) => updateRunValue(activeItemRunIndex, "unit_price_model", next)}
                                              min={0}
                                              aria-label="Собівартість за одиницю"
                                              currency={quote.currency}
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="block min-h-7 text-2xs uppercase leading-tight tracking-wide text-muted-foreground">
                                              В-ть нанесення
                                            </Label>
                                            <CurrencyAmountInput
                                              value={activeItemRun.unit_price_print}
                                              disabled={!runPriceFieldAccess.unit_price_print}
                                              title={runFieldLockHint(runPriceFieldAccess.unit_price_print, "проєктний менеджер")}
                                              onValueChange={(next) => updateRunValue(activeItemRunIndex, "unit_price_print", next)}
                                              min={0}
                                              aria-label="Вартість нанесення"
                                              currency={quote.currency}
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="block min-h-7 text-2xs uppercase leading-tight tracking-wide text-muted-foreground">
                                              Логістика
                                            </Label>
                                            <CurrencyAmountInput
                                              value={activeItemRun.logistics_cost}
                                              disabled={!runPriceFieldAccess.logistics_cost}
                                              title={runFieldLockHint(runPriceFieldAccess.logistics_cost, "проєктний менеджер або логіст")}
                                              onValueChange={(next) => updateRunValue(activeItemRunIndex, "logistics_cost", next)}
                                              min={0}
                                              aria-label="Логістика"
                                              currency={quote.currency}
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="block min-h-7 text-2xs uppercase leading-tight tracking-wide text-muted-foreground">
                                              Бажаний особистий заробіток
                                            </Label>
                                            <CurrencyAmountInput
                                              value={activeItemRun.desired_manager_income}
                                              disabled={!runPriceFieldAccess.desired_manager_income}
                                              title={runFieldLockHint(runPriceFieldAccess.desired_manager_income, "менеджер")}
                                              onValueChange={(next) => updateRunValue(activeItemRunIndex, "desired_manager_income", next)}
                                              className={cn(
                                                activeRunEconomics && "border-destructive focus-visible:ring-destructive/30"
                                              )}
                                              placeholder="0"
                                              min={0}
                                              currency={quote.currency}
                                            />
                                            {/* Пояснення важливіше за заборону: менеджер лишав нуль не
                                                зі злого наміру, а тому що не бачив зв'язку між цим полем
                                                і ціною. Тепер зв'язок стоїть під полем і рахується наживо. */}
                                            {activePricing.costTotal > 0 ? (
                                              <p
                                                className={cn(
                                                  "text-2xs leading-snug",
                                                  activeRunEconomics ? "text-destructive" : "text-muted-foreground"
                                                )}
                                              >
                                                {activeRunEconomics?.code === "empty_income" ? (
                                                  "Націнки немає — ціна дорівнює собівартості"
                                                ) : (
                                                  <>
                                                    дає націнку{" "}
                                                    <span className="font-semibold tabular-nums">
                                                      {formatCurrency(activePricing.markupTotal, quote.currency)}
                                                    </span>
                                                    {activePricing.saleUnitPrice === null ? null : (
                                                      <>
                                                        {" · ціна "}
                                                        <span className="font-semibold tabular-nums">
                                                          {formatCurrency(activePricing.saleUnitPrice, quote.currency)}
                                                        </span>
                                                      </>
                                                    )}
                                                    {activeRunEconomics?.code === "income_below_min"
                                                      ? ` · мінімум ${MIN_MANAGER_INCOME} ₴`
                                                      : activeRunEconomics?.code === "markup_below_min"
                                                        ? ` · націнка має бути від ${MIN_RUN_MARKUP} ₴`
                                                        : null}
                                                  </>
                                                )}
                                              </p>
                                            ) : null}
                                          </div>
                                        </div>

                                        <div className="my-4 border-t border-border/60" />

                                        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_1.2fr]">
                                          <div className="rounded-xl border border-border/40 bg-muted/[0.02] p-4">
                                            <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                                              Собівартість
                                            </div>
                                            <div className="mt-2 whitespace-nowrap font-mono text-xl font-semibold tabular-nums text-foreground">
                                              {formatCurrency(activePricing.costTotal, quote.currency)}
                                            </div>
                                          </div>
                                          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                                            <div className="text-2xs font-semibold uppercase tracking-wide text-primary/80">
                                              Ціна продажу / од.
                                            </div>
                                            <div className="mt-2 whitespace-nowrap font-mono text-xl font-semibold tabular-nums text-primary">
                                              {activePricing.saleUnitPrice === null
                                                ? "—"
                                                : formatCurrency(activePricing.saleUnitPrice, quote.currency)}
                                            </div>
                                          </div>
                                          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
                                            <div className="text-2xs font-semibold uppercase tracking-wide text-primary/80">
                                              Сума продажу
                                            </div>
                                            <div className="mt-2 whitespace-nowrap font-mono text-xl font-semibold tabular-nums text-primary">
                                              {formatCurrency(activePricing.saleTotal, quote.currency)}
                                            </div>
                                          </div>
                                        </div>

                                        <details className="group mt-3 rounded-xl border border-border/50 bg-muted/[0.03] px-3 py-2">
                                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                                            <div className="min-w-0">
                                              <div className="text-xs font-semibold text-foreground">Деталі ціни</div>
                                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                                Надцінка {formatCurrency(activePricing.markupTotal, quote.currency)}
                                              </div>
                                            </div>
                                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                          </summary>
                                          <div className="mt-3 grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-2 xl:grid-cols-4">
                                            <div>
                                              <div className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Потрібний ВП
                                              </div>
                                              <div className="mt-1 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">
                                                {formatCurrency(activePricing.requiredGrossProfit, quote.currency)}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Сталі витрати
                                              </div>
                                              <div className="mt-1 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">
                                                {formatCurrency(activePricing.fixedCosts, quote.currency)}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                ПДВ
                                              </div>
                                              <div className="mt-1 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">
                                                {formatCurrency(activePricing.vatAmount, quote.currency)}
                                              </div>
                                            </div>
                                            <div>
                                              <div className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Надцінка
                                              </div>
                                              <div className="mt-1 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">
                                                {formatCurrency(activePricing.markupTotal, quote.currency)}
                                              </div>
                                            </div>
                                          </div>
                                        </details>
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                                        Оберіть або додайте тираж
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </section>

            <details open className="hidden">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Тиражі</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      aria-label="Інформація про тиражі"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Тиражі для розрахунку цін і підсумкової суми по прорахунку.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {canEditRuns && items.length <= 1 ? (
                    <Button variant="ghost" size="sm" onClick={() => addRun()} className="h-8 gap-1.5 px-2.5 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Додати тираж
                    </Button>
                  ) : null}
                  {runs.length > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">({runs.length})</div>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </div>
              </summary>

              {quoteSectionsBootstrapping ? (
                <AppSectionLoader label="Завантаження..." />
              ) : runsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Завантаження...</span>
                </div>
              ) : runsError ? (
                <div className="py-4 text-sm text-destructive">{runsError}</div>
              ) : runs.length === 0 && items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Немає тиражів</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Додайте тираж для розрахунку вартості</p>
                  </div>
                  {canEditRuns ? (
                    <Button size="sm" variant="outline" onClick={() => addRun()} className="mt-1 h-8 gap-1.5 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Додати тираж
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {runSections.map((section) => (
                      <div key={section.key} className="rounded-2xl border border-border/50 bg-background/40 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {section.imageUrl ? (
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/20">
                                <KanbanImageZoomPreview
                                  imageUrl={section.imageUrl}
                                  zoomImageUrl={section.zoomImageUrl ?? section.imageUrl}
                                  alt={section.title}
                                  loadStrategy="eager"
                                  className="h-11 w-11 rounded-xl object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
                                <Package className="h-5 w-5 text-muted-foreground/60" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">{section.title}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {section.meta ? <span>{section.meta}</span> : null}
                                <span className="tabular-nums">{section.runs.length} тиражів</span>
                              </div>
                            </div>
                          </div>
                          {canEditRuns && section.item ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => addRun(section.item?.id ?? null)}
                              className="h-8 gap-1.5 px-2.5 text-xs"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Додати тираж
                            </Button>
                          ) : null}
                        </div>

                        {section.runs.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                            Для цього товару ще немає тиражів
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="hidden xl:block">
                              <div className="flex items-center gap-3 px-3 pb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                                <div className="grid min-w-0 flex-1 items-center gap-2 xl:grid-cols-[132px_76px_96px_112px_96px] 2xl:gap-3 2xl:grid-cols-[132px_minmax(84px,98px)_minmax(104px,122px)_minmax(126px,148px)_minmax(96px,116px)]">
                                  <div>Тираж</div>
                                  <div className="whitespace-nowrap">Кількість</div>
                                  <div className="whitespace-nowrap">{`В-ть за одиницю (${quote.currency})`}</div>
                                  <div className="whitespace-nowrap">{`В-ть нанесення (${quote.currency})`}</div>
                                  <div className="whitespace-nowrap">{`Логістика (${quote.currency})`}</div>
                                </div>
                                <div className="w-[120px] text-right 2xl:w-[132px]">Сума</div>
                                <div className="w-7" />
                              </div>
                            </div>

                            {section.runs.map(({ run, index: idx }, sectionRunIndex) => {
                      const qty = Number(run.quantity) || 0;
                      const modelPrice = Number(run.unit_price_model) || 0;
                      const printPrice = Number(run.unit_price_print) || 0;
                      const logistics = Number(run.logistics_cost) || 0;
                      const total = (modelPrice + printPrice) * qty + logistics;
                      const disabled = !canEditRuns;
                      const isSelected = !!run.id && run.id === selectedRunId;
                      return (
                        <div
                          key={run.id ?? idx}
                          onClick={() => setSelectedRunId(run.id ?? null)}
                          className={cn(
                            "group cursor-pointer rounded-xl border px-3 py-2.5 transition-colors",
                            isSelected
                              ? "border-primary/30 bg-primary/[0.04]"
                              : "border-border/40 hover:bg-muted/10"
                          )}
                        >
                          <div className="space-y-4 xl:hidden">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className={cn(
                                    "h-2.5 w-2.5 rounded-full transition-all",
                                    isSelected
                                      ? "scale-110 bg-primary"
                                      : "bg-border group-hover:bg-muted-foreground/40"
                                  )}
                                />
                                <div className="min-w-0">
                                  <div className="text-base font-semibold text-foreground">{`Тираж ${sectionRunIndex + 1}`}</div>
                                  {isSelected ? (
                                    <div className="mt-0.5 text-2xs font-medium text-primary">Активний</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="font-mono text-lg font-semibold tabular-nums text-foreground">
                                  {formatCurrency(total, quote.currency)}
                                </div>
                                <div className="mt-0.5 text-2xs text-muted-foreground">
                                  ({formatCurrencyCompact(modelPrice, quote.currency)} + {formatCurrencyCompact(printPrice, quote.currency)}) × {qty}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="text-2xs font-medium text-muted-foreground">Кількість</div>
                                <NumberInput
                                  className="h-10 cursor-text border-transparent bg-muted/15 px-3 font-mono text-base hover:border-border focus:border-border focus:bg-background"
                                  value={run.quantity}
                                  disabled={disabled}
                                  onClick={(e) => e.stopPropagation()}
                                  onValueChange={(next) => updateRunValue(idx, "quantity", next)}
                                  min={1}
                                  emptyValue={1}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-2xs font-medium text-muted-foreground">{`Модель · ${quote.currency}`}</div>
                                <NumberInput
                                  className="h-10 cursor-text border-transparent bg-muted/15 px-3 font-mono text-base hover:border-border focus:border-border focus:bg-background"
                                  value={run.unit_price_model}
                                  disabled={disabled}
                                  onClick={(e) => e.stopPropagation()}
                                  onValueChange={(next) => updateRunValue(idx, "unit_price_model", next)}
                                  min={0}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-2xs font-medium text-muted-foreground">{`Нанесення · ${quote.currency}`}</div>
                                <NumberInput
                                  className="h-10 cursor-text border-transparent bg-muted/15 px-3 font-mono text-base hover:border-border focus:border-border focus:bg-background"
                                  value={run.unit_price_print}
                                  disabled={disabled}
                                  onClick={(e) => e.stopPropagation()}
                                  onValueChange={(next) => updateRunValue(idx, "unit_price_print", next)}
                                  min={0}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-2xs font-medium text-muted-foreground">{`Логістика · ${quote.currency}`}</div>
                                <NumberInput
                                  className="h-10 cursor-text border-transparent bg-muted/15 px-3 font-mono text-base hover:border-border focus:border-border focus:bg-background placeholder:text-muted-foreground/40"
                                  value={run.logistics_cost}
                                  disabled={disabled}
                                  onClick={(e) => e.stopPropagation()}
                                  onValueChange={(next) => updateRunValue(idx, "logistics_cost", next)}
                                  placeholder="—"
                                  min={0}
                                />
                              </div>
                            </div>

                            {!disabled ? (
                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void removeRun(idx);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Видалити
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="hidden xl:block">
                            <div className="flex items-center gap-3 pr-2">
                              <div className="grid min-w-0 flex-1 items-center gap-2 xl:grid-cols-[132px_76px_96px_112px_96px] 2xl:gap-3 2xl:grid-cols-[132px_minmax(84px,98px)_minmax(104px,122px)_minmax(126px,148px)_minmax(96px,116px)]">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div
                                    className={cn(
                                      "h-2.5 w-2.5 rounded-full transition-all",
                                      isSelected
                                        ? "scale-110 bg-primary"
                                        : "bg-border group-hover:bg-muted-foreground/40"
                                    )}
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {`Тираж ${sectionRunIndex + 1}`}
                                    </div>
                                    {isSelected ? (
                                      <div className="mt-0.5 text-2xs font-medium text-primary">
                                        Активний
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <NumberInput
                                    controlSize="sm"
                                    className="cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background"
                                    value={run.quantity}
                                    disabled={disabled}
                                    onClick={(e) => e.stopPropagation()}
                                    onValueChange={(next) => updateRunValue(idx, "quantity", next)}
                                    min={1}
                                    emptyValue={1}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <NumberInput
                                    controlSize="sm"
                                    className="cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background"
                                    value={run.unit_price_model}
                                    disabled={disabled}
                                    onClick={(e) => e.stopPropagation()}
                                    onValueChange={(next) => updateRunValue(idx, "unit_price_model", next)}
                                    min={0}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <NumberInput
                                    controlSize="sm"
                                    className="cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background"
                                    value={run.unit_price_print}
                                    disabled={disabled}
                                    onClick={(e) => e.stopPropagation()}
                                    onValueChange={(next) => updateRunValue(idx, "unit_price_print", next)}
                                    min={0}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <NumberInput
                                    className="h-8 cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background placeholder:text-muted-foreground/40"
                                    value={run.logistics_cost}
                                    disabled={disabled}
                                    onClick={(e) => e.stopPropagation()}
                                    onValueChange={(next) => updateRunValue(idx, "logistics_cost", next)}
                                    placeholder="—"
                                    min={0}
                                  />
                                </div>
                              </div>

                              <div className="w-[120px] shrink-0 text-right 2xl:w-[132px]">
                                <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                                  {formatCurrency(total, quote.currency)}
                                </div>
                                <div className="mt-0.5 hidden truncate text-2xs text-muted-foreground 2xl:block">
                                  ({formatCurrencyCompact(modelPrice, quote.currency)} +{" "}
                                  {formatCurrencyCompact(printPrice, quote.currency)}) × {qty}
                                </div>
                              </div>

                              <div className="flex w-7 shrink-0 justify-end">
                                {!disabled ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    // focus-visible на кнопці, не group-focus-within на
                                    // рядку: у рядку тиражу є поля вводу, і клік у будь-яке
                                    // з них лишав кошик стирчати. Гірше — наведеш на сусідній
                                    // рядок, і кошики світяться в ДВОХ рядках одночасно.
                                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void removeRun(idx);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4">
                      {selectedUnitCost !== null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Собівартість / од.:</span>
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {formatCurrency(selectedUnitCost, quote.currency)}
                          </span>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground/60">
                        Обраний тираж використовується в підсумку
                      </span>
                    </div>
                    {canEditRuns && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void saveRuns()}
                        disabled={runsSaving || quoteRequirements.length > 0}
                        className="h-8 gap-1.5 text-xs"
                      >
                        {runsSaving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {runsSaving ? "Збереження..." : "Зберегти"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </details>

            <section className={cn("py-2", activeQuoteTab !== "deadlines" && "hidden")}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Дедлайни та задача</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      aria-label="Інформація про дедлайни та задачу"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Ключові дати прорахунку, нагадування і постановка задачі для дизайну.
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Tabs defaultValue="internal" className="w-full">
                  <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
                  <TabsList className="grid h-auto w-full grid-cols-1 gap-2 border-0 bg-transparent p-0">
                    <TabsTrigger
                      value="customer"
                      className="flex h-full min-h-[96px] flex-col items-start justify-between rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-4 text-left transition-colors hover:border-border/70 hover:bg-muted/[0.04] focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary/40 data-[state=active]:bg-primary/[0.04] data-[state=active]:ring-0"
                    >
                      <div className="relative flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Дедлайн замовника</div>
                        <span className="peer inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground">
                          <CircleHelp className="h-3.5 w-3.5" />
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100">
                          Готовність до відвантаження.
                        </div>
                      </div>
                      <div>
                        {resolveDeadlinePreviewValue(
                          customerDeadlineDate,
                          customerDeadlineTime,
                          quote?.customer_deadline_at ?? null
                        ) ? (
                          (() => {
                            const preview = buildDeadlineBadgePreview(
                              resolveDeadlinePreviewValue(
                                customerDeadlineDate,
                                customerDeadlineTime,
                                quote.customer_deadline_at
                              )
                            );
                            return (
                              <QuoteDeadlineBadge
                                tone={preview.tone}
                                label={preview.label}
                                title={preview.title}
                                compact
                              />
                            );
                          })()
                        ) : (
                          <Badge variant="outline" className="h-6 px-2 text-2xs quote-neutral-badge">
                            Не вказано
                          </Badge>
                        )}
                      </div>
                    </TabsTrigger>

                    <TabsTrigger
                      value="internal"
                      className="flex h-full min-h-[96px] flex-col items-start justify-between rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-4 text-left transition-colors hover:border-border/70 hover:bg-muted/[0.04] focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary/40 data-[state=active]:bg-primary/[0.04] data-[state=active]:ring-0"
                    >
                      <div className="relative flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Внутрішній дедлайн</div>
                        <span className="peer inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground">
                          <CircleHelp className="h-3.5 w-3.5" />
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100">
                          Відповідь замовнику.
                        </div>
                      </div>
                      <div>
                        {(() => {
                          const preview = buildDeadlineBadgePreview(
                            resolveDeadlinePreviewValue(deadlineDate, deadlineTime, quote?.deadline_at ?? null)
                          );
                          return (
                            <QuoteDeadlineBadge
                              tone={preview.tone}
                              label={preview.label}
                              title={preview.title}
                              compact
                            />
                          );
                        })()}
                      </div>
                    </TabsTrigger>

                    <TabsTrigger
                      value="design"
                      className="flex h-full min-h-[96px] flex-col items-start justify-between rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-4 text-left transition-colors hover:border-border/70 hover:bg-muted/[0.04] focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary/40 data-[state=active]:bg-primary/[0.04] data-[state=active]:ring-0"
                    >
                      <div className="relative flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Дедлайн дизайну</div>
                        <span className="peer inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground">
                          <CircleHelp className="h-3.5 w-3.5" />
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100">
                          Погодити макет.
                        </div>
                      </div>
                      <div>
                        {resolveDeadlinePreviewValue(
                          designDeadlineDate,
                          designDeadlineTime,
                          quote?.design_deadline_at ?? null
                        ) ? (
                          (() => {
                            const preview = buildDeadlineBadgePreview(
                              resolveDeadlinePreviewValue(
                                designDeadlineDate,
                                designDeadlineTime,
                                quote.design_deadline_at
                              )
                            );
                            return (
                              <QuoteDeadlineBadge
                                tone={preview.tone}
                                label={preview.label}
                                title={preview.title}
                                compact
                              />
                            );
                          })()
                        ) : (
                          <Badge variant="outline" className="h-6 px-2 text-2xs quote-neutral-badge">
                            Не вказано
                          </Badge>
                        )}
                      </div>
                    </TabsTrigger>
                  </TabsList>

                  <div className="rounded-xl border border-border/40 bg-muted/[0.02] p-4 md:p-5">
                    <TabsContent value="customer" className="mt-0">
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Дата</div>
                            <Popover open={customerDeadlinePopoverOpen} onOpenChange={setCustomerDeadlinePopoverOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="h-9 w-full justify-start gap-2 border-border/40 bg-muted/[0.03] font-normal hover:bg-muted/[0.06]"
                                  onClick={() => setCustomerDeadlinePopoverOpen(true)}
                                >
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  {customerDeadlineDate
                                    ? formatDeadlineDateOnlyLabel(customerDeadlineDate)
                                    : "Оберіть день"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-fit max-w-[calc(100vw-2rem)] p-0">
                                <CalendarPicker
                                  mode="single"
                                  selected={toLocalDate(customerDeadlineDate)}
                                  onSelect={(date) => {
                                    const nextDate = formatDateInput(date ?? null);
                                    setCustomerDeadlineDate(nextDate);
                                    setCustomerDeadlinePopoverOpen(false);
                                  }}
                                              />
                                <DateQuickActions
                                  onSelect={(date) => {
                                    const nextDate = formatDateInput(date ?? null);
                                    setCustomerDeadlineDate(nextDate);
                                    setCustomerDeadlinePopoverOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Час</div>
                            <TimeInput
                              controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]"
                              value={customerDeadlineTime}
                              onChange={(e) => setCustomerDeadlineTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            className="h-9 gap-2 border-border/40 bg-muted/[0.03]"
                            onClick={() =>
                              void handleSaveSecondaryDeadline("customer_deadline_at", {
                                date: customerDeadlineDate,
                                time: customerDeadlineTime,
                                title: "Дедлайн Замовника",
                                action: "змінив дедлайн замовника",
                              })
                            }
                            disabled={deadlineSaving || !customerDeadlineDate}
                          >
                            {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Зберегти
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="internal" className="mt-0">
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Дата</div>
                            <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="h-9 w-full justify-start gap-2 border-border/40 bg-muted/[0.03] font-normal hover:bg-muted/[0.06]"
                                  onClick={() => setDeadlinePopoverOpen(true)}
                                >
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  {deadlineDate
                                    ? formatDeadlineDateOnlyLabel(deadlineDate)
                                    : "Оберіть день"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-fit max-w-[calc(100vw-2rem)] p-0">
                                <CalendarPicker
                                  mode="single"
                                  selected={toLocalDate(deadlineDate)}
                                  onSelect={(date) => {
                                    const nextDate = formatDateInput(date ?? null);
                                    setDeadlineDate(nextDate);
                                    setDeadlinePopoverOpen(false);
                                  }}
                                              />
                                <DateQuickActions
                                  onSelect={(date) => {
                                    const nextDate = formatDateInput(date ?? null);
                                    setDeadlineDate(nextDate);
                                    setDeadlinePopoverOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Час</div>
                            <TimeInput
                              controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]"
                              value={deadlineTime}
                              onChange={(e) => setDeadlineTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Нагадування</div>
                            <Select
                              value={deadlineReminderOffset}
                              onValueChange={(value) => {
                                setDeadlineReminderOffset(value);
                                void handleSaveDeadline({ reminderOffset: value });
                              }}
                            >
                              <SelectTrigger
                          controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]">
                                <SelectValue placeholder="Коли нагадати" />
                              </SelectTrigger>
                              <SelectContent>
                                {DEADLINE_REMINDER_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Текст нагадування</div>
                            <Input
                              controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]"
                              placeholder="Напр. передзвонити клієнту"
                              value={deadlineReminderComment}
                              onChange={(e) => setDeadlineReminderComment(e.target.value)}
                              maxLength={200}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className={DEADLINE_FIELD_LABEL_CLASS}>Коментар</div>
                          <Input
                            controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]"
                            placeholder="Внутрішня примітка до дедлайну"
                            value={deadlineNote}
                            onChange={(e) => setDeadlineNote(e.target.value)}
                            maxLength={200}
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            className="h-9 gap-2 border-border/40 bg-muted/[0.03]"
                            onClick={() => void handleSaveDeadline()}
                            disabled={deadlineSaving}
                          >
                            {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Зберегти
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="design" className="mt-0">
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Дата</div>
                            <Popover open={designDeadlinePopoverOpen} onOpenChange={setDesignDeadlinePopoverOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="h-9 w-full justify-start gap-2 border-border/40 bg-muted/[0.03] font-normal hover:bg-muted/[0.06]"
                                  onClick={() => setDesignDeadlinePopoverOpen(true)}
                                >
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  {designDeadlineDate
                                    ? formatDeadlineDateOnlyLabel(designDeadlineDate)
                                    : "Оберіть день"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-fit max-w-[calc(100vw-2rem)] p-0">
                                <CalendarPicker
                                  mode="single"
                                  selected={toLocalDate(designDeadlineDate)}
                                  onSelect={(date) => {
                                    const nextDate = formatDateInput(date ?? null);
                                    setDesignDeadlineDate(nextDate);
                                    setDesignDeadlinePopoverOpen(false);
                                  }}
                                              />
                                <DateQuickActions
                                  onSelect={(date) => {
                                    const nextDate = formatDateInput(date ?? null);
                                    setDesignDeadlineDate(nextDate);
                                    setDesignDeadlinePopoverOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1.5">
                            <div className={DEADLINE_FIELD_LABEL_CLASS}>Час</div>
                            <TimeInput
                              controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]"
                              value={designDeadlineTime}
                              onChange={(e) => setDesignDeadlineTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            className="h-9 gap-2 border-border/40 bg-muted/[0.03]"
                            onClick={() =>
                              void handleSaveSecondaryDeadline("design_deadline_at", {
                                date: designDeadlineDate,
                                time: designDeadlineTime,
                                title: "Дедлайн дизайну",
                                action: "змінив дедлайн дизайну",
                              })
                            }
                            disabled={deadlineSaving || !designDeadlineDate}
                          >
                            {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Зберегти
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                  </div>
                </Tabs>
              </div>

              {deadlineError && <div className="mt-4 text-xs text-destructive">{deadlineError}</div>}
              {updatedMinutes !== null && <></>}
            </section>

            <section className={cn("py-2", activeQuoteTab !== "design" && "hidden")}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Palette className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Дизайн</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      aria-label="Інформація про дизайн"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      ТЗ для дизайнера і готові візуалізації в одному місці.
                    </div>
                  </div>
                </div>
              </div>

              <Tabs defaultValue="brief" className="w-full">
                <TabsList className="mb-5 h-auto justify-start rounded-none border-0 border-b border-border/30 bg-transparent p-0">
                  <TabsTrigger
                    value="brief"
                    className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"
                  >
                    ТЗ
                  </TabsTrigger>
                  <TabsTrigger
                    value="visuals"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"
                  >
                    Візуалізації
                    <span className="ml-2 text-xs text-muted-foreground">{visibleDesignVisualizations.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="task"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"
                  >
                    Задача
                    <span className="ml-2 text-xs text-muted-foreground">{designTasks.length}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="brief" className="mt-0">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">ТЗ для дизайнера</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Короткий опис задачі без дедлайнів і службових деталей.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DictationButton
                          textareaRef={briefTextareaRef}
                          value={briefText}
                          onChange={(next) => {
                            setBriefText(next);
                            setBriefDirty(true);
                            setBriefInlineEditing(true);
                          }}
                          onAfterInsert={() =>
                            resizeBriefTextarea(briefTextareaRef.current, BRIEF_INLINE_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT)
                          }
                          context="brief"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setBriefEditorOpen(true)}
                        >
                          Відкрити редактор
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {briefInlineEditing || briefDirty ? (
                        <Textarea
                          ref={briefTextareaRef}
                          value={briefText}
                          onChange={(event) => {
                            setBriefText(event.target.value);
                            setBriefDirty(true);
                            resizeBriefTextarea(event.currentTarget, BRIEF_INLINE_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT);
                          }}
                          onBlur={handleBriefInlineBlur}
                          placeholder="Опишіть задачу для дизайнера. Тут тільки зміст задачі, без дедлайнів."
                          className={cn(BRIEF_TEXTAREA_CLASS, "min-h-[180px]")}
                        />
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          className={cn(BRIEF_SURFACE_FRAME_CLASS, "px-4 py-4")}
                          aria-readonly="true"
                          onClick={() => setBriefInlineEditing(true)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setBriefInlineEditing(true);
                            }
                          }}
                        >
                          <div className={cn("min-h-[120px]", BRIEF_SURFACE_TEXT_CLASS)}>
                            {renderBriefRichText(briefText)}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{briefText.length} символів</span>
                        {briefDirty ? <span>Є незбережені зміни</span> : <span>Усі зміни збережено</span>}
                      </div>
                      {briefError ? <div className="text-sm text-destructive">{briefError}</div> : null}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setBriefText(quote?.design_brief ?? quote?.comment ?? "");
                            setBriefDirty(false);
                            setBriefInlineEditing(false);
                            setBriefError(null);
                          }}
                          disabled={!briefDirty}
                        >
                          Скинути
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveBrief()}
                          disabled={!briefDirty || briefSaving || quoteRequirements.length > 0}
                          className="gap-2"
                        >
                          {briefSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {briefSaving ? "Збереження..." : "Зберегти ТЗ"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="visuals" className="mt-0">
                  {visibleDesignVisualizations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/50 px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/20">
                          <Image className="h-5 w-5" />
                        </div>
                        <div className="text-sm font-medium text-foreground">Візуалізації ще не додані</div>
                        <div className="text-xs text-muted-foreground">
                          Тут будуть макети, превʼю та фінальні файли від дизайнера.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleDesignVisualizations.map((file) => {
                        const extension = getFileExtension(getAttachmentDisplayName(file));
                        const previewImage =
                          (canPreviewImage(extension) || canPreviewDocumentThumb(extension)) &&
                          Boolean(file.storageBucket && file.storagePath);
                        const isSelectedVisualization =
                          (selectedDesignOutputStoragePath && file.storagePath === selectedDesignOutputStoragePath) ||
                          (selectedDesignOutputFileName && file.name === selectedDesignOutputFileName);
                        return (
                          <div key={file.id} className="group rounded-xl border border-border/40 p-3 transition-colors hover:bg-muted/10">
                            <button
                              type="button"
                              className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-muted/20 text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:cursor-default disabled:hover:scale-100"
                              onClick={() => {
                                if (!previewImage) return;
                                void ensureAttachmentAccessUrl(file, { variant: "preview" }).then((url) => {
                                  if (!url) return;
                                  setVisualizationPreview({ ...file, url });
                                });
                              }}
                              disabled={!previewImage}
                              aria-label={previewImage ? `Переглянути ${getAttachmentDisplayName(file)}` : getAttachmentDisplayName(file)}
                            >
                              {previewImage ? (
                                <StorageObjectImage
                                  bucket={file.storageBucket}
                                  path={file.storagePath}
                                  alt={getAttachmentDisplayName(file)}
                                  variant="thumb"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex flex-col items-center gap-2 text-muted-foreground/70">
                                  <FileText className="h-8 w-8" />
                                  <span className="text-2xs font-semibold uppercase tracking-wide">
                                    {extension ?? "Файл"}
                                  </span>
                                </div>
                              )}
                            </button>
                            <div className="mt-3 truncate text-sm font-medium text-foreground" title={getAttachmentDisplayName(file)}>
                              {getAttachmentDisplayName(file)}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="text-xs text-muted-foreground">
                                {getFileExtension(getAttachmentDisplayName(file))?.toUpperCase() ?? "Файл"}
                              </div>
                              {isSelectedVisualization ? (
                                <Badge
                                  variant="outline"
                                  className="tone-success h-5 px-2 text-3xs"
                                >
                                  Обрано
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              {file.storageBucket && file.storagePath ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    void ensureAttachmentAccessUrl(file).then((url) => {
                                      if (url) {
                                        void downloadFileToDevice(
                                          url,
                                          getAttachmentDownloadFileName(file.name, file.storagePath, file.mimeType)
                                        );
                                      }
                                    });
                                  }}
                                >
                                  Завантажити
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="task" className="mt-0">
                  {designTaskLoading ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-muted/[0.02] px-4 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Завантаження...
                    </div>
                  ) : designTaskError ? (
                    <div className="text-sm text-destructive">{designTaskError}</div>
                  ) : designTask ? (
                    <div className="max-w-3xl space-y-3">
                      {designTasks.length > 1 ? (
                        <div className="rounded-xl border border-border/40 bg-muted/[0.02] p-4">
                          <div className="mb-3 text-sm font-semibold text-foreground">
                            Задачі прорахунку · {designTasks.length}
                          </div>
                          <div className="space-y-1.5">
                            {designTasks.map((task) => {
                              const metadata = task.metadata ?? {};
                              const number =
                                typeof metadata.design_task_number === "string" ? metadata.design_task_number : null;
                              const itemTitle =
                                typeof metadata.quote_item_title === "string" ? metadata.quote_item_title : null;
                              const assignee =
                                typeof metadata.assignee_user_id === "string" ? metadata.assignee_user_id : null;
                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  onClick={() => navigate(`/design/${task.id}`)}
                                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-border/60 hover:bg-muted/20"
                                >
                                  <span className="min-w-0 truncate text-sm text-foreground">
                                    {number ? `${number} · ` : ""}
                                    {itemTitle || task.title || "Дизайн-задача"}
                                  </span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {assignee ? memberById.get(assignee) ?? "Виконавець" : "Без виконавця"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    <div className="grid gap-4 rounded-xl border border-border/40 bg-muted/[0.02] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end md:p-5">
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-foreground">Дизайн-задача</div>
                        {selectedDesignOutputFileName ? (
                          <div className="text-xs text-muted-foreground">
                            Обраний візуал: <span className="font-medium text-foreground">{selectedDesignOutputFileName}</span>
                          </div>
                        ) : null}
                        {designTaskType ? (
                          <div className="inline-flex max-w-[360px] items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                            Тип задачі: {DESIGN_TASK_TYPE_LABELS[designTaskType]}
                          </div>
                        ) : null}
                        <div className="max-w-[360px]">
                          <div className="mb-2 text-xs font-medium text-muted-foreground">Виконавець</div>
                          <Select
                            value={designAssigneeId ?? "none"}
                            onValueChange={(value) => void updateDesignAssignee(value === "none" ? null : value)}
                            disabled={designTaskSaving}
                          >
                            <SelectTrigger
                          controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]">
                              {designAssigneeId ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  <AvatarBase
                                    src={memberAvatarById.get(designAssigneeId) ?? null}
                                    name={memberById.get(designAssigneeId) ?? designAssigneeId}
                                    fallback={getInitials(memberById.get(designAssigneeId) ?? designAssigneeId)}
                                    size={20}
                                    inactive={memberInactiveById[designAssigneeId] ?? false}
                                    className="text-3xs font-semibold"
                                  />
                                  <span className="truncate">
                                    {memberById.get(designAssigneeId) ?? designAssigneeId}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Без виконавця</span>
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Без виконавця</SelectItem>
                              {designerMembers.length > 0 ? (
                                designerMembers.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    <div className="flex items-center gap-2">
                                      <AvatarBase
                                        src={member.avatarUrl}
                                        name={member.label}
                                        fallback={getInitials(member.label)}
                                        size={20}
                                        inactive={memberInactiveById[member.id] ?? false}
                                        className="text-3xs font-semibold"
                                      />
                                      <span>{member.label}</span>
                                    </div>
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="empty" disabled>
                                  {teamMembers.length === 0
                                    ? "Немає учасників"
                                    : hasRoleInfo
                                    ? "Немає дизайнерів"
                                    : "Ролі не налаштовані"}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/design/${designTask.id}`)}
                      >
                        Відкрити
                      </Button>
                    </div>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-dashed border-border/40 bg-muted/[0.02] px-4 py-5">
                      <div className="text-sm font-medium text-foreground">
                        Дизайн-задача ще не створена
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Створи нову задачу або привʼяжи існуючу дизайн-задачу цього ж замовника.
                      </div>
                      <div className="grid gap-3 md:max-w-[760px] md:grid-cols-3">
                        <div>
                          <div className="mb-2 text-xs font-medium text-muted-foreground">Тип задачі</div>
                          <Select
                            value={designTaskType ?? "none"}
                            onValueChange={(value) => setDesignTaskType(value === "none" ? null : (value as DesignTaskType))}
                            disabled={designTaskSaving}
                          >
                            <SelectTrigger
                          controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]">
                              <SelectValue placeholder="Оберіть тип задачі">
                                {designTaskType ? (
                                  <span className="inline-flex items-center gap-2">
                                    {createElement(DESIGN_TASK_TYPE_ICONS[designTaskType], { className: "h-4 w-4 text-muted-foreground" })}
                                    <span>{DESIGN_TASK_TYPE_LABELS[designTaskType]}</span>
                                  </span>
                                ) : (
                                  "Оберіть тип задачі"
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" disabled>
                                Оберіть тип задачі
                              </SelectItem>
                              {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <span className="inline-flex items-center gap-2">
                                    {createElement(DESIGN_TASK_TYPE_ICONS[option.value], { className: "h-4 w-4 text-muted-foreground" })}
                                    <span>{option.label}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-medium text-muted-foreground">Виконавець</div>
                          <Select
                            value={designAssigneeId ?? "none"}
                            onValueChange={(value) => {
                              const nextAssigneeId = value === "none" ? null : value;
                              setDesignAssigneeId(nextAssigneeId);
                              setDesignCollaboratorIds((prev) => prev.filter((entry) => entry !== nextAssigneeId));
                            }}
                            disabled={designTaskSaving}
                          >
                            <SelectTrigger
                          controlSize="md"
                          className="w-full border-border/40 bg-muted/[0.03]">
                              {designAssigneeId ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  <AvatarBase
                                    src={memberAvatarById.get(designAssigneeId) ?? null}
                                    name={memberById.get(designAssigneeId) ?? designAssigneeId}
                                    fallback={getInitials(memberById.get(designAssigneeId) ?? designAssigneeId)}
                                    size={20}
                                    inactive={memberInactiveById[designAssigneeId] ?? false}
                                    className="text-3xs font-semibold"
                                  />
                                  <span className="truncate">{memberById.get(designAssigneeId) ?? designAssigneeId}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Без виконавця</span>
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Без виконавця</SelectItem>
                              {designerMembers.length > 0 ? (
                                designerMembers.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    <div className="flex items-center gap-2">
                                      <AvatarBase
                                        src={member.avatarUrl}
                                        name={member.label}
                                        fallback={getInitials(member.label)}
                                        size={20}
                                        inactive={memberInactiveById[member.id] ?? false}
                                        className="text-3xs font-semibold"
                                      />
                                      <span>{member.label}</span>
                                    </div>
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="empty" disabled>
                                  {teamMembers.length === 0
                                    ? "Немає учасників"
                                    : hasRoleInfo
                                    ? "Немає дизайнерів"
                                    : "Ролі не налаштовані"}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-medium text-muted-foreground">Співвиконавці</div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 w-full justify-start border-border/40 bg-muted/[0.03]"
                                disabled={designTaskSaving}
                              >
                                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span className="truncate">
                                  {designCollaboratorIds.length === 0
                                    ? "Не додано"
                                    : designCollaboratorIds.length === 1
                                    ? getMemberLabel(designCollaboratorIds[0])
                                    : `Співвиконавці · ${designCollaboratorIds.length}`}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-[280px]">
                              <DropdownMenuLabel>Співвиконавці</DropdownMenuLabel>
                              {designerMembers.filter((member) => member.id !== designAssigneeId).map((member) => {
                                const checked = designCollaboratorIds.includes(member.id);
                                return (
                                  <DropdownMenuCheckboxItem
                                    key={member.id}
                                    checked={checked}
                                    onCheckedChange={(nextChecked) => {
                                      setDesignCollaboratorIds((prev) =>
                                        nextChecked ? [...prev, member.id] : prev.filter((entry) => entry !== member.id)
                                      );
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <AvatarBase
                                        src={member.avatarUrl}
                                        name={member.label}
                                        fallback={getInitials(member.label)}
                                        size={20}
                                        inactive={memberInactiveById[member.id] ?? false}
                                        className="text-3xs font-semibold"
                                      />
                                      <span>{member.label}</span>
                                    </div>
                                  </DropdownMenuCheckboxItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void createDesignTask()}
                          disabled={designTaskSaving || !designTaskType}
                        >
                          {designTaskSaving ? "Створення..." : "Створити задачу"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAttachDesignTaskDialogOpen(true)}
                          disabled={designTaskCandidatesLoading || designTaskCandidates.length === 0}
                        >
                          {designTaskCandidatesLoading
                            ? "Пошук..."
                            : designTaskCandidates.length > 0
                            ? `Підтягнути з дизайну (${designTaskCandidates.length})`
                            : "Немає задач для привʼязки"}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </section>

            <section className={cn("py-2", activeQuoteTab !== "discussion" && "hidden")}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Обговорення</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      aria-label="Інформація про обговорення"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-2xs text-muted-foreground opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Загальні коментарі, вкладення від замовника і журнал активності по прорахунку.
                    </div>
                  </div>
                </div>
              </div>

              <Tabs value={detailsTab} onValueChange={(value) => setDetailsTab(value as "comments" | "files" | "activity")} className="w-full">
                <TabsList className="mb-5 h-auto w-full justify-start rounded-none border-0 border-b border-border/30 bg-transparent p-0">
                  <TabsTrigger
                    value="comments"
                    className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"
                  >
                    Коментарі
                    <span className="ml-2 text-xs text-muted-foreground">{comments.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="files"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"
                  >
                    Вкладення
                    <span className="ml-2 text-xs text-muted-foreground">{attachments.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="activity"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"
                  >
                    Активність
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="comments" className="mt-0">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/40 bg-muted/[0.02] p-4">
                      <div className="relative">
                        <Textarea
                          ref={commentTextareaRef}
                          value={commentText}
                          onChange={(event) => {
                            const cursor = event.target.selectionStart ?? event.target.value.length;
                            setCommentText(event.target.value);
                            syncMentionContext(event.target.value, cursor);
                          }}
                          onSelect={(event) => {
                            const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
                            syncMentionContext(event.currentTarget.value, cursor);
                          }}
                          onKeyDown={handleCommentTextKeyDown}
                          placeholder="Напишіть коментар... (використовуйте @ім'я для згадки)"
                          className="min-h-[88px] resize-none"
                        />

                        {mentionContext ? (
                          <div
                            className={cn(
                              "absolute left-0 right-0 z-30 overflow-hidden rounded-lg border border-border bg-popover",
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
                                      index === mentionActiveIndex
                                        ? "bg-primary/10 text-foreground"
                                        : "hover:bg-muted/60"
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
                                      className="text-3xs font-semibold"
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

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{commentText.length} символів</span>
                        <div className="flex items-center gap-2">
                          <DictationButton
                            textareaRef={commentTextareaRef}
                            value={commentText}
                            onChange={setCommentText}
                            context="comment"
                            disabled={commentSaving}
                          />
                          <Button
                            size="sm"
                            onClick={handleAddComment}
                            disabled={!commentText.trim() || commentSaving}
                            className="gap-2"
                          >
                            {commentSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            {commentSaving ? "Збереження..." : "Додати"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {commentsLoading ? (
                      <AppSectionLoader label="Завантаження..." className="border-none bg-transparent py-2" />
                    ) : commentsError ? (
                      <div className="text-sm text-destructive">{commentsError}</div>
                    ) : comments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/40 bg-muted/[0.02] py-8 text-center">
                        <MessageSquare className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Коментарів ще немає</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/40">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="py-4 transition-colors hover:bg-muted/10"
                          >
                            <div className="flex items-start gap-3">
                              <AvatarBase
                                src={comment.created_by ? memberAvatarById.get(comment.created_by) ?? null : null}
                                name={
                                  comment.created_by
                                    ? memberById.get(comment.created_by) ?? comment.created_by
                                    : "Користувач"
                                }
                                fallback={
                                  comment.created_by
                                    ? getInitials(memberById.get(comment.created_by) ?? comment.created_by)
                                    : "Не вказано"
                                }
                                size={32}
                                className="text-3xs font-semibold"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="min-w-0 truncate text-sm font-semibold">
                                    {comment.created_by
                                      ? memberById.get(comment.created_by) ?? "Користувач"
                                      : "Користувач"}
                                  </div>
                                  <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                                    {new Date(comment.created_at).toLocaleDateString("uk-UA", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                                  {renderTextWithMentions(comment.body ?? "")}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="files" className="mt-0">
                  <div className="space-y-4">
                    <input
                      ref={attachmentsInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept={ATTACHMENTS_ACCEPT}
                      onChange={(event) => uploadAttachments(event.target.files)}
                    />

                    {attachmentsUploading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Завантаження файлів...
                      </div>
                    )}

                    <div className="space-y-3">
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex w-full cursor-pointer items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={() => setFilesCustomerOpen((v) => !v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilesCustomerOpen((v) => !v);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          Від замовника
                          {attachments.length > 0 && (
                            <Badge variant="secondary" className="text-2xs">
                              {attachments.length}
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            attachmentsInputRef.current?.click();
                          }}
                          disabled={attachmentsUploading}
                        >
                          <Upload className="h-4 w-4" />
                          Додати
                        </Button>
                      </div>

                      <div hidden={!filesCustomerOpen} className="panel-reveal mt-3 space-y-2">
                        {attachmentsLoading ? (
                          <div className="py-4 text-center">
                            <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Завантаження...</p>
                          </div>
                        ) : attachmentsError ? (
                          <div className="text-sm text-destructive">{attachmentsError}</div>
                        ) : attachments.length === 0 ? (
                          <div
                            className={cn(
                              "cursor-pointer rounded-xl border border-dashed p-6 text-center transition-colors",
                              attachmentsDragActive
                                ? "border-primary/60 bg-primary/10"
                                : "border-border/60 hover:border-primary/40 hover:bg-primary/5"
                            )}
                            onClick={() => attachmentsInputRef.current?.click()}
                            onDrop={handleAttachmentsDrop}
                            onDragOver={handleAttachmentsDragOver}
                            onDragLeave={handleAttachmentsDragLeave}
                          >
                            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                            <p className="mb-1 text-sm font-medium">Перетягніть файли сюди</p>
                            <p className="text-xs text-muted-foreground">або натисніть для вибору</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              До {MAX_QUOTE_ATTACHMENTS} файлів · до 50 MB · PDF, AI, SVG, PNG, JPG, ZIP
                            </p>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "space-y-2 rounded-xl border border-dashed border-border/40 bg-muted/[0.02] p-2",
                              attachmentsDragActive && "border-primary/60 bg-primary/5"
                            )}
                            onDrop={handleAttachmentsDrop}
                            onDragOver={handleAttachmentsDragOver}
                            onDragLeave={handleAttachmentsDragLeave}
                          >
                            {attachments.map((file) => {
                              const displayName = getAttachmentDisplayName(file);
                              const extension = getFileExtension(displayName);
                              // Та сама умова й той самий шлях до прев'ю, що
                              // й у сітці візуалізацій нижче на цій сторінці:
                              // мініатюра лежить у storage поруч з оригіналом
                              // (uploadAttachmentWithVariants), і панель
                              // вкладень просто нею не користувалась.
                              const previewImage =
                                (canPreviewImage(extension) || canPreviewDocumentThumb(extension)) &&
                                Boolean(file.storageBucket && file.storagePath);
                              const openPreview = () => {
                                if (!previewImage) return;
                                // Варіант «preview» існує не в кожного файлу:
                                // getAttachmentVariantCandidatePaths шукає лише
                                // __preview.webp/.png і НЕ відкочується до
                                // оригіналу. Без запасного шляху клік по файлу
                                // без згенерованого прев'ю просто нічого не
                                // робив би — найгірший вид поламаного.
                                void ensureAttachmentAccessUrl(file, { variant: "preview" })
                                  .then((url) => url ?? ensureAttachmentAccessUrl(file, { variant: "original" }))
                                  .then((url) => {
                                    if (!url) {
                                      toast.error("Не вдалося відкрити превʼю файлу");
                                      return;
                                    }
                                    setVisualizationPreview({ ...file, url });
                                  });
                              };
                              return (
                                <div
                                  key={file.id}
                                  className="group flex items-center justify-between rounded-xl border border-border/30 p-3 transition-colors hover:bg-muted/10"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-3">
                                    {previewImage ? (
                                      /* Обгортка — div, а не button, хоча вона й
                                         клікабельна: hoverPreview усередині
                                         StorageObjectImage сам ставить tabIndex,
                                         а фокусований елемент у <button> — це
                                         вкладена інтерактивність, чого модель
                                         вмісту кнопки не допускає. З клавіатури
                                         прев'ю відкривається кнопкою на назві
                                         файлу поруч. */
                                      <div
                                        onClick={openPreview}
                                        className="h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-muted/20 transition-transform hover:scale-[1.04]"
                                      >
                                        {/* object-cover саме через imageClassName:
                                            className лягає на обгортку, і широка
                                            мініатюра в квадраті 44×44 інакше
                                            стискається в смужку. */}
                                        <StorageObjectImage
                                          bucket={file.storageBucket}
                                          path={file.storagePath}
                                          alt={displayName}
                                          variant="thumb"
                                          hoverPreview
                                          className="h-full w-full"
                                          imageClassName="object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-lg bg-primary/10">
                                        <Paperclip className="h-5 w-5 text-primary" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        {previewImage ? (
                                          <button
                                            type="button"
                                            onClick={openPreview}
                                            title={displayName}
                                            className="min-w-0 truncate text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                                          >
                                            {displayName}
                                          </button>
                                        ) : (
                                          <div className="truncate text-sm font-semibold" title={displayName}>
                                            {displayName}
                                          </div>
                                        )}
                                        {extension && (
                                          <Badge variant="secondary" className="text-3xs uppercase">
                                            {extension}
                                          </Badge>
                                        )}
                                        {/* Позначаємо лише дизайнерські:
                                            файли прорахунку тут більшість,
                                            і бейдж на кожному рядку був би
                                            шумом, а не інформацією. */}
                                        {file.audience === "design" && (
                                          <Badge variant="outline" className="shrink-0 text-3xs">
                                            Для дизайнера
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {file.size} ·{" "}
                                        {new Date(file.created_at).toLocaleString("uk-UA", {
                                          day: "2-digit",
                                          month: "2-digit",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                        {file.uploadedByLabel ? ` · ${file.uploadedByLabel}` : ""}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="ml-4 flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      // focus-visible на кнопці, не group-focus-within на
                                      // рядку: клік по «Завантажити» лишав фокус на ній, і
                                      // обидві кнопки рядка стирчали далі без наведення.
                                      className="shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                      onClick={() => {
                                        void ensureAttachmentAccessUrl(file).then((url) => {
                                          if (url) {
                                            void downloadFileToDevice(
                                              url,
                                              getAttachmentDownloadFileName(file.name, file.storagePath, file.mimeType)
                                            );
                                          }
                                        });
                                      }}
                                      disabled={!file.storageBucket || !file.storagePath}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    {canDeleteDesignerBriefAttachment(file) ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 text-destructive opacity-100 transition-opacity hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                                        onClick={() => requestDeleteAttachment(file)}
                                        disabled={attachmentsDeletingId === file.id}
                                      >
                                        {attachmentsDeletingId === file.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex w-full cursor-pointer items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={() => setFilesDocsOpen((v) => !v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFilesDocsOpen((v) => !v);
                          }
                        }}
                      >
                        <div className="text-sm font-semibold">Документи</div>
                        <Button size="sm" variant="ghost" className="gap-2" disabled>
                          <Upload className="h-4 w-4" />
                          Додати
                        </Button>
                      </div>
                      <div
                        hidden={!filesDocsOpen}
                        className="panel-reveal mt-3 rounded-xl border border-dashed border-border/40 bg-muted/[0.02] p-4 text-xs text-muted-foreground"
                      >
                        Рахунки, договори, акти — скоро буде доступно.
                      </div>
                    </div>

                    {attachmentsUploadError && (
                      <div className="text-xs text-destructive">{attachmentsUploadError}</div>
                    )}
                    {attachmentsDeleteError && (
                      <div className="text-xs text-destructive">{attachmentsDeleteError}</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-0">
                  <div className="space-y-4">
                    {activityLoading || historyLoading || commentsLoading ? (
                      <div className="py-6 text-center">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Завантаження...</p>
                      </div>
                    ) : activityEvents.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/40 bg-muted/[0.02] py-8 text-center">
                        <Clock className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Активність порожня</p>
                        {(activityError || historyError || commentsError) && (
                          <p className="mt-2 text-xs text-destructive">
                            {activityError ?? historyError ?? commentsError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        {(activityError || historyError || commentsError) && (
                          <div className="text-xs text-destructive">
                            {activityError ?? historyError ?? commentsError}
                          </div>
                        )}
                        <div className="space-y-6">
                          {activityGroups.map((group) => (
                            <div key={group.label} className="space-y-3">
                              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {group.label}
                              </div>
                              <div className="divide-y divide-border/40">
                                {group.items.map((event) => {
                                  const Icon = event.icon;
                                  return (
                                    <div
                                      key={event.id}
                                      className="flex items-start gap-3 py-4 transition-colors hover:bg-muted/10"
                                    >
                                      <div
                                        className={cn(
                                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                                          event.accentClass ?? "border-border bg-muted/20 text-muted-foreground"
                                        )}
                                      >
                                        <Icon className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="text-sm font-semibold">{event.title}</div>
                                          <div className="whitespace-nowrap text-xs text-muted-foreground">
                                            {formatActivityClock(event.created_at)}
                                          </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{event.actorLabel}</div>
                                        {event.description && (
                                          <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          {!activityLoadedAll ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              disabled={activityLoading}
                              onClick={() => void loadActivityLog({ full: true })}
                            >
                              {activityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Завантажити всю активність
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </section>

            {/*
              «Економіка» — заглушка, а не порожня вкладка.
              Розкладка ціни вже працює в «Активному підсумку» справа, тож тут
              чесно сказано, що саме додасться і чому воно ще не додане. Формулу
              ціни ця вкладка не чіпає: доки відкриті питання не закриті, все
              рахується рівно так, як рахувалось.
            */}
            <section className={cn("py-2", activeQuoteTab !== "economics" && "hidden")}>
              <EconomicsComingSoon />
            </section>
          </div>
        </main>
        </div>

        <aside
          className={cn(
            "self-start px-4 pb-10 pt-2 md:px-5 lg:px-6 xl:flex xl:min-h-0 xl:h-full xl:flex-col xl:self-stretch xl:overflow-hidden xl:border-l xl:border-[hsl(var(--app-structure-divider))] xl:bg-[hsl(var(--design-task-details-bg))] xl:px-0 xl:pb-0 xl:pt-0",
            activeQuoteTab !== "details" && "max-xl:hidden"
          )}
        >
          {/*
            Колонка — flex-стовпчик на всю висоту: властивості й підсумок
            тримають свою висоту, а розмова забирає весь залишок. Тому тут немає
            спільного `overflow-y-auto` на всю колонку — скролиться те, що
            справді довге (стрічка повідомлень), а не вся колонка разом із
            заголовками.
          */}
          <div className="flex flex-col gap-2 xl:h-full xl:min-h-0 xl:px-3 xl:pt-3">
            <QuotePartyCard
              customerName={quote.customer_name}
              customerLogoUrl={quote.customer_logo_url}
              customerInitials={getInitials(quote.customer_name)}
              managerName={quote.assigned_to ? memberById.get(quote.assigned_to) ?? quote.assigned_to : null}
              managerAvatarUrl={quote.assigned_to ? memberAvatarById.get(quote.assigned_to) ?? null : null}
              managerInitials={
                quote.assigned_to
                  ? getInitials(memberById.get(quote.assigned_to) ?? quote.assigned_to)
                  : undefined
              }
              createdAt={quote.created_at}
              deadlines={[
                buildDeadlineTrackItem("Відповідь", quote?.deadline_at ?? null),
                buildDeadlineTrackItem("Дизайн", quote?.design_deadline_at ?? null),
                buildDeadlineTrackItem("Відвантаження", quote?.customer_deadline_at ?? null),
              ]}
              extras={sideExtras}
              onOpenParty={() => setPartyCardOpen(true)}
              onOpenDeadlines={() => setActiveQuoteTab("deadlines")}
            />

            {canViewSummarySection ? (
              <QuotePriceSummary
                totalLabel={formatCurrencyCompact(totals.total, quote.currency)}
                totalTitle={`${hasMultipleActiveProductSummaries ? "Підсумок набору" : "Активний підсумок"}: ${formatCurrency(totals.total, quote.currency)} · ставка менеджера ${activeManagerRateLabel}`}
                markupLabel={
                  activeRunPricingTotals.markupTotal > 0
                    ? formatCurrencyCompact(activeRunPricingTotals.markupTotal, quote.currency)
                    : null
                }
                markupTitle={`Надцінка ${formatCurrency(activeRunPricingTotals.markupTotal, quote.currency)}`}
                markupShareLabel={markupShareLabel}
                managerRateNeedsAttention={managerRateNeedsAttention}
                managerRateLabel={activeManagerRateLabel}
                parts={priceBreakdownParts}
                formatFull={(value) => formatCurrency(value, quote.currency)}
                formatCompact={(value) => formatCurrencyCompact(value, quote.currency)}
                open={sideSummaryOpen}
                onToggle={() => setSideSummaryOpen((open) => !open)}
              />
            ) : null}

            {/*
              «Обговорення» — та сама рейка, що в дизайн-задачі.
              Нитка одна на справу (`quote:<id>`), і коментарі зі сторінки
              прорахунку вже сьогодні пишуться саме в неї — просто побачити їх
              можна було лише з дизайн-задачі. Тепер розмова відкрита з обох
              боків, без другої копії даних і без нової таблиці.

              Файли поки не чіпляємо: завантажувач вкладень прорахунку кладе їх
              у вкладення картки, а рейка чекає вкладення повідомлення — це
              різні місця, і зшивати їх наосліп означало б втрачати файли.
              Тому скріпка тут просто не показується (`canAttach` = false).
            */}
            {teamId ? (
              // Обгортка навмисно `div`, а не `section`: рейка сама рендерить
              // <section>, і другий такий самий тег навколо неї дав би вкладену
              // секцію без власного заголовка — зайвий орієнтир для читача екрана.
              <div className="flex min-h-[360px] flex-col pb-4 xl:min-h-0 xl:flex-1">
                <TaskThreadRail
                  threadKey={threadKeyForQuote(quoteId)}
                  eventActions={THREAD_EVENT_ACTIONS}
                  quoteId={quoteId}
                  teamId={teamId}
                  canManage={accessRole === "owner" || jobRole === "seo"}
                />
              </div>
            ) : null}
          </div>
        </aside>
      </div>

    {/* Разове попередження про поріг заробітку. Показуємо тим, хто реально

        редагує тиражі: бухгалтеру чи спостерігачу воно нічого не змінює. */}

    <Dialog open={showMarginNotice} onOpenChange={(open) => { if (!open) dismissMarginNotice(); }}>

      <DialogContent className="sm:max-w-lg">

        <DialogHeader>

          <DialogTitle>Прорахунок більше не збережеться з порожнім заробітком</DialogTitle>

        </DialogHeader>

        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">

          <p>

            Уся націнка рахується з поля <b className="font-semibold text-foreground">«Бажаний особистий

            заробіток»</b>. Якщо воно порожнє, націнки немає взагалі — ні прибутку, ні постійних

            витрат, ні податкового резерву, — і робота йде клієнту за собівартістю.

          </p>

          <p>

            За останні три місяці так пішли <b className="font-semibold text-foreground">44 тиражі</b>,

            два з них уже погодили.

          </p>

          <p>

            Тепер прорахунок не збережеться, поки заробіток менший за{" "}

            <b className="font-semibold text-foreground">{MIN_MANAGER_INCOME} ₴</b> на кожному тиражі.

            Під полем видно, яку націнку і яку ціну дає введене число.

          </p>

        </div>

        <DialogFooter>

          <Button onClick={dismissMarginNotice}>Зрозуміло</Button>

        </DialogFooter>

      </DialogContent>

    </Dialog>

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
              disabled={briefSaving}
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
              disabled={briefSaving}
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
              disabled={briefSaving}
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
              disabled={briefSaving}
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
              disabled={briefSaving}
              onClick={() =>
                applyBriefFormatting(({ selectedText }) =>
                  toggleLinePrefix(selectedText, (index) => `${index + 1}. `, /^\d+\.\s+/, "Пункт списку")
                )
              }
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            <div className="ml-auto">
              <DictationButton
                textareaRef={briefDialogTextareaRef}
                value={briefText}
                onChange={(next) => {
                  setBriefText(next);
                  setBriefDirty(true);
                }}
                onAfterInsert={() =>
                  resizeBriefTextarea(briefDialogTextareaRef.current, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT)
                }
                context="brief"
                disabled={briefSaving}
              />
            </div>
          </div>
          <Textarea
            ref={briefDialogTextareaRef}
            value={briefText}
            onChange={(event) => {
              setBriefText(event.target.value);
              setBriefDirty(true);
              resizeBriefTextarea(event.currentTarget, BRIEF_DIALOG_TEXTAREA_MAX_HEIGHT, BRIEF_MIN_HEIGHT);
            }}
            onSelect={syncBriefSelection}
            onKeyUp={syncBriefSelection}
            onClick={syncBriefSelection}
            onWheelCapture={(event) => event.stopPropagation()}
            placeholder="Опишіть задачу для дизайнера. Тут тільки зміст задачі, без дедлайнів."
            rows={10}
            disabled={briefSaving}
            className={cn(BRIEF_TEXTAREA_CLASS, "min-h-[240px] flex-1 overflow-y-auto overscroll-contain")}
          />
          <div className={BRIEF_DIALOG_PREVIEW_CLASS}>
            <div className="mb-2 text-xs text-muted-foreground">Попередній перегляд</div>
            <div className={cn("max-h-48 overflow-auto", BRIEF_SURFACE_TEXT_CLASS)}>
              {renderBriefRichText(designBriefPreview)}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBriefText(quote?.design_brief ?? quote?.comment ?? "");
              setBriefDirty(false);
              setBriefInlineEditing(false);
              setBriefError(null);
            }}
            disabled={!briefDirty}
          >
            Скинути
          </Button>
          <Button type="button" variant="outline" onClick={() => setBriefEditorOpen(false)}>
            Закрити
          </Button>
          <Button
            type="button"
            onClick={() => void saveBrief()}
            disabled={!briefDirty || briefSaving || quoteRequirements.length > 0}
            className="gap-2"
          >
            {briefSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {briefSaving ? "Збереження..." : "Зберегти ТЗ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={deleteQuoteDialogOpen}
      onOpenChange={setDeleteQuoteDialogOpen}
      title="Видалити прорахунок?"
        description={`Прорахунок #${quote.number ?? quote.id} буде видалено без можливості відновлення.`}
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onConfirm={handleDeleteQuote}
      loading={deleteQuoteBusy}
    />

    <Dialog open={attachDesignTaskDialogOpen} onOpenChange={setAttachDesignTaskDialogOpen}>
      <DialogContent
        // Список із дією, а не форма: «Привʼязати» виконується одразу, чернетки
        // тут нема. Без опт-ауту перший же клік по кнопці в списку вмикав
        // питання «Закрити без збереження?».
        dismissible
        className="sm:max-w-[720px]"
      >
        <DialogHeader>
          <DialogTitle>Привʼязати існуючу дизайн-задачу</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Показані standalone дизайн-задачі цього ж замовника. Якщо у задачі вже обрано візуал, він одразу
            підтягнеться у прорахунок.
          </div>
          {designTaskCandidatesLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Завантаження...
            </div>
          ) : designTaskCandidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/40 px-4 py-6 text-sm text-muted-foreground">
              Немає standalone дизайн-задач для цього замовника.
            </div>
          ) : (
            <div className="space-y-2">
              {designTaskCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/40 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-foreground">
                        {candidate.designTaskNumber ?? "Дизайн-задача"}
                      </div>
                      {candidate.status ? (
                        <Badge variant="outline" className="h-5 px-2 text-3xs">
                          {candidate.status}
                        </Badge>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        {new Date(candidate.createdAt).toLocaleDateString("uk-UA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-sm text-foreground">
                      {candidate.title ?? "Без назви"}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{candidate.outputsCount} файл(ів)</span>
                      {candidate.selectedFile ? (
                        <Badge
                          variant="outline"
                          className="tone-success h-5 px-2 text-3xs"
                        >
                          Обрано: {candidate.selectedFile.file_name}
                        </Badge>
                      ) : (
                        <span>Візуал ще не вибрано</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void attachExistingDesignTask(candidate)}
                    disabled={attachingDesignTaskId === candidate.id}
                    className="shrink-0"
                  >
                    {attachingDesignTaskId === candidate.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Привʼязати
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAttachDesignTaskDialogOpen(false)}>
            Закрити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={Boolean(visualizationPreview)}
      onOpenChange={(open) => {
        if (!open) setVisualizationPreview(null);
      }}
    >
      <DialogContent
        // Перегляд картинки — не форма: єдина кнопка тут «Завантажити», і саме
        // вона вмикала типовий захист від втрати введеного (позначку ставить
        // клік по будь-якій кнопці), після чого вихід питав «Закрити без
        // збереження?».
        dismissible
        className="w-fit max-h-[94vh] max-w-[calc(100vw-1.5rem)] overflow-hidden sm:max-w-[calc(100vw-3rem)]"
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            <span className="block max-w-[calc(100vw-6rem)] truncate sm:max-w-[min(72vw,960px)]">
              {visualizationPreview ? getAttachmentDisplayName(visualizationPreview) : "Візуалізація"}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-center overflow-auto rounded-xl bg-muted/15 p-2 sm:p-3">
          {visualizationPreview?.url ? (
            <img
              src={visualizationPreview.url}
              alt={getAttachmentDisplayName(visualizationPreview)}
              className="block max-h-[80vh] w-auto max-w-[calc(100vw-3rem)] rounded-lg object-contain sm:max-w-[calc(100vw-6rem)]"
            />
          ) : null}
        </div>
        <DialogFooter>
          {visualizationPreview?.url ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void ensureAttachmentAccessUrl(visualizationPreview, { variant: "original" }).then((url) => {
                  if (!url) return;
                  void downloadFileToDevice(
                    url,
                    getAttachmentDownloadFileName(
                      visualizationPreview.name,
                      visualizationPreview.storagePath,
                      visualizationPreview.mimeType
                    )
                  );
                });
              }}
            >
              Завантажити
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={statusDialogOpen}
        onOpenChange={(open) => {
          setStatusDialogOpen(open);
          if (!open) {
            setStatusNote("");
            setStatusTarget(currentStatus ?? "new");
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
          <DialogHeader className="border-b border-border/60 bg-muted/10 p-5">
            <DialogTitle className="text-lg">Зміна статусу</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="text-xs text-muted-foreground">
              Оберіть новий статус та залиште примітку, якщо потрібно.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {STATUS_OPTIONS.map((s) => {
                const Icon = statusIcons[s] ?? Clock;
                const isActive = s === statusTarget;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusTarget(s)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all",
                      isActive
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 hover:border-border"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{formatStatusLabel(s)}</span>
                    {isActive && <Check className="ml-auto h-4 w-4" />}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Примітка (опціонально)</Label>
              <Textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Додайте примітку до зміни статусу..."
                className="min-h-[88px]"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 bg-muted/5 px-5 py-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusDialogOpen(false)}
              disabled={statusBusy}
            >
              Закрити
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (statusTarget === currentStatus) {
                  setStatusDialogOpen(false);
                  return;
                }
                if (statusTarget === "cancelled") {
                  setStatusDialogOpen(false);
                  setCancelDialogOpen(true);
                  setCancelReason("");
                  setCancelNote("");
                  setCancelError(null);
                  return;
                }
                void handleQuickStatusChange(statusTarget, statusNote);
                setStatusDialogOpen(false);
              }}
              disabled={statusBusy || statusTarget === currentStatus || quoteRequirements.length > 0}
            >
              Застосувати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) {
            setCancelError(null);
            setCancelReason("");
            setCancelNote("");
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
          <DialogHeader className="border-b border-border/60 bg-muted/10 p-5">
            <DialogTitle className="text-lg">Скасування прорахунку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              Вкажи причину скасування — вона збережеться в історії та допоможе аналізу.
            </div>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Причина (з переліку)</Label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Оберіть причину" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANCEL_REASON_OPTIONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Коментар (опціонально)</Label>
                <Textarea
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  placeholder="Додай деталі, якщо потрібно..."
                  className="min-h-[96px]"
                />
              </div>
            </div>
            {cancelError && <div className="text-xs text-destructive">{cancelError}</div>}
          </div>
          <DialogFooter className="border-t border-border/60 bg-muted/5 px-5 py-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={statusBusy}
            >
              Закрити
            </Button>
            <Button
              size="sm"
              variant="destructiveSolid"
              onClick={handleConfirmCancel}
              disabled={statusBusy || (!cancelReason.trim() && !cancelNote.trim())}
            >
              Підтвердити скасування
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteAttachmentOpen}
        onOpenChange={setDeleteAttachmentOpen}
        title="Видалити файл?"
        description={deleteAttachmentTarget ? deleteAttachmentTarget.name : undefined}
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onConfirm={confirmDeleteAttachment}
        loading={!!attachmentsDeletingId}
      />

      <ConfirmDialog
        open={deleteItemTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteItemBusy) setDeleteItemTarget(null);
        }}
        title="Видалити позицію?"
        description={
          deleteItemTarget
            ? `«${deleteItemTarget.title}» зникне з прорахунку разом зі своїми тиражами. Відновити не вийде.`
            : undefined
        }
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onConfirm={() => void confirmDeleteItem()}
        loading={deleteItemBusy}
      />

      <Dialog open={createDesignTaskDialogOpen} onOpenChange={setCreateDesignTaskDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Створити дизайн-задачу</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {quote?.number
                ? `Прорахунок ${quote.number}. Вкажіть тип задачі й за потреби призначте виконавця.`
                : "Вкажіть тип задачі й за потреби призначте виконавця."}
            </div>

            {designTaskError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {designTaskError}
              </div>
            ) : null}

            {items.length > 1 ? (
              <div className="space-y-2">
                <Label>Позиція</Label>
                <Select
                  value={designTaskItemId ?? "all"}
                  onValueChange={(value) => setDesignTaskItemId(value === "all" ? null : value)}
                  disabled={designTaskSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Оберіть позицію" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Весь прорахунок</SelectItem>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id} disabled={designTaskItemIds.has(item.id)}>
                        {item.title || "Позиція"}
                        {designTaskItemIds.has(item.id) ? " — задача вже є" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Тип задачі</Label>
              <Select
                value={designTaskType ?? "none"}
                onValueChange={(value) => setDesignTaskType(value === "none" ? null : (value as DesignTaskType))}
                disabled={designTaskSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Оберіть тип задачі">
                    {designTaskType ? (
                      <span className="inline-flex items-center gap-2">
                        {createElement(DESIGN_TASK_TYPE_ICONS[designTaskType], { className: "h-4 w-4 text-muted-foreground" })}
                        <span>{DESIGN_TASK_TYPE_LABELS[designTaskType]}</span>
                      </span>
                    ) : (
                      "Оберіть тип задачі"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Оберіть тип задачі
                  </SelectItem>
                  {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="inline-flex items-center gap-2">
                        {createElement(DESIGN_TASK_TYPE_ICONS[option.value], { className: "h-4 w-4 text-muted-foreground" })}
                        <span>{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Виконавець</Label>
                <Select
                  value={designAssigneeId ?? "none"}
                  onValueChange={(value) => {
                    const nextAssigneeId = value === "none" ? null : value;
                    setDesignAssigneeId(nextAssigneeId);
                    setDesignCollaboratorIds((prev) => prev.filter((entry) => entry !== nextAssigneeId));
                  }}
                  disabled={designTaskSaving}
                >
                  <SelectTrigger>
                    {designAssigneeId ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarBase
                          src={memberAvatarById.get(designAssigneeId) ?? null}
                          name={memberById.get(designAssigneeId) ?? designAssigneeId}
                          fallback={getInitials(memberById.get(designAssigneeId) ?? designAssigneeId)}
                          size={20}
                          inactive={memberInactiveById[designAssigneeId] ?? false}
                          className="text-3xs font-semibold"
                        />
                        <span className="truncate">{memberById.get(designAssigneeId) ?? designAssigneeId}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Без виконавця</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без виконавця</SelectItem>
                    {designerMembers.length > 0 ? (
                      designerMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center gap-2">
                            <AvatarBase
                              src={member.avatarUrl}
                              name={member.label}
                              fallback={getInitials(member.label)}
                              size={20}
                              inactive={memberInactiveById[member.id] ?? false}
                              className="text-3xs font-semibold"
                            />
                            <span>{member.label}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>
                        {teamMembers.length === 0
                          ? "Немає учасників"
                          : hasRoleInfo
                          ? "Немає дизайнерів"
                          : "Ролі не налаштовані"}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Співвиконавці</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      disabled={designTaskSaving}
                    >
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="truncate">
                        {designCollaboratorIds.length === 0
                          ? "Не додано"
                          : designCollaboratorIds.length === 1
                          ? getMemberLabel(designCollaboratorIds[0])
                          : `Співвиконавці · ${designCollaboratorIds.length}`}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[280px]">
                    <DropdownMenuLabel>Співвиконавці</DropdownMenuLabel>
                    {designerMembers.filter((member) => member.id !== designAssigneeId).map((member) => {
                      const checked = designCollaboratorIds.includes(member.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={member.id}
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            setDesignCollaboratorIds((prev) =>
                              nextChecked ? [...prev, member.id] : prev.filter((entry) => entry !== member.id)
                            );
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <AvatarBase
                              src={member.avatarUrl}
                              name={member.label}
                              fallback={getInitials(member.label)}
                              size={20}
                              inactive={memberInactiveById[member.id] ?? false}
                              className="text-3xs font-semibold"
                            />
                            <span>{member.label}</span>
                          </div>
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDesignTaskDialogOpen(false)}
              disabled={designTaskSaving}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              onClick={() => void createDesignTask()}
              disabled={designTaskSaving || !designTaskType}
            >
              {designTaskSaving ? "Створення..." : "Створити задачу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
        <DialogContent className="w-[min(1040px,calc(100vw-32px))] max-h-[90vh] gap-0 overflow-hidden border border-border/60 bg-card p-0 text-foreground">
          <div className="border-b border-border bg-muted/5 p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingItemId ? "Редагувати позицію" : "Додати позицію"}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[calc(90vh-180px)] overflow-y-auto p-6">
            <Tabs
              value={itemFormMode}
              onValueChange={(v) => setItemFormMode(v as "simple" | "advanced")}
              className="w-full"
            >
              <TabsList className="mb-6 grid w-full grid-cols-2 rounded-xl bg-muted/30 p-1">
                <TabsTrigger
                  value="simple"
                  className="rounded-lg py-2.5 text-sm data-[state=active]:border data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground"
                >
                  Проста позиція
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="rounded-lg py-2.5 text-sm data-[state=active]:border data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground"
                >
                  Із каталогу
                </TabsTrigger>
              </TabsList>

              <TabsContent value="simple" className="mt-0 space-y-4">
                <div className="space-y-2">
                  <Label>Назва <span className="text-destructive">*</span></Label>
                  <Input
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                    placeholder="Наприклад: Футболки з логотипом"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Кількість</Label>
                    <NumberInput
                      value={itemQty === "" ? null : Number(itemQty)}
                      onValueChange={(next) => setItemQty(next === null ? "" : String(next))}
                      min={1}
                      emptyValue={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Одиниця</Label>
                    <Select value={itemUnit} onValueChange={setItemUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="шт.">шт.</SelectItem>
                        <SelectItem value="м">м</SelectItem>
                        <SelectItem value="кг">кг</SelectItem>
                        <SelectItem value="л">л</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ціна за од.</Label>
                    <NumberInput
                      value={itemPrice === "" ? null : Number(itemPrice)}
                      onValueChange={(next) => setItemPrice(next === null ? "" : String(next))}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Опис (опціонально)</Label>
                  <Textarea
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    placeholder="Додаткова інформація про позицію..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/30 p-4">
                  <div className="mb-2 text-xs text-muted-foreground">Попередній перегляд:</div>
                  <div className="space-y-1">
                    <div className="font-medium">{itemTitle || "Назва позиції"}</div>
                    <div className="text-sm text-muted-foreground">
                      {itemQty || "1"} {itemUnit} × {itemPrice || "0"} ={" "}
                      {((Number(itemQty) || 1) * (Number(itemPrice) || 0)).toLocaleString("uk-UA")}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="mt-0">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label>Назва <span className="text-destructive">*</span></Label>
                      <Input
                        value={itemTitle}
                        onChange={(e) => setItemTitle(e.target.value)}
                        placeholder="Наприклад: Футболки Malfini з DTF"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Швидкий пошук у каталозі</Label>
                      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                        <Command>
                          <CommandInput
                            placeholder="Пошук по моделях..."
                            leftIcon={<Search className="h-4 w-4" />}
                            value={catalogSearchValue}
                            onValueChange={setCatalogSearchValue}
                          />
                          <CommandList className="max-h-64">
                            <CommandEmpty>Нічого не знайдено</CommandEmpty>
                            {catalogGroups.map((group) => (
                              <CommandGroup key={group.id} heading={group.label}>
                                {group.items.map((option) => {
                                  const isSelected =
                                    itemTypeId === option.typeId &&
                                    itemKindId === option.kindId &&
                                    itemModelId === option.modelId;
                                  return (
                                    <CommandItem
                                      key={`${option.typeId}-${option.kindId}-${option.modelId}`}
                                      value={`${option.label} ${group.label} ${option.kindLabel}`}
                                      onSelect={() => {
                                        setItemTypeId(option.typeId);
                                        setItemKindId(option.kindId);
                                        setItemModelId(option.modelId);
                                        setItemMethods([]);
                                        setCatalogSearchValue("");
                                      }}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{option.label}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {group.label} / {option.kindLabel}
                                        </span>
                                      </div>
                                      <div className="ml-auto flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground">
                                          {option.price.toLocaleString("uk-UA")} ₴
                                        </span>
                                        {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Почніть вводити назву моделі — ми підставимо тип і вид.
                      </p>
                      {catalogLoading && (
                        <p className="text-xs text-muted-foreground">Каталог завантажується...</p>
                      )}
                      {catalogError && <p className="text-xs text-destructive">{catalogError}</p>}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Тип товару</Label>
                        <Select value={itemTypeId} onValueChange={handleTypeChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Оберіть тип" />
                          </SelectTrigger>
                          <SelectContent>
                            {catalogTypes.map((type) => (
                              <SelectItem key={type.id} value={type.id}>
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {itemTypeId && (
                        <div className="space-y-2">
                          <Label>Вид товару</Label>
                          <Select value={itemKindId} onValueChange={handleKindChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Оберіть вид" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableKinds.map((kind) => (
                                <SelectItem key={kind.id} value={kind.id}>
                                  {kind.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {itemKindId && (
                      <div className="space-y-2">
                        <Label>Модель</Label>
                        <Select value={itemModelId} onValueChange={handleModelChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Оберіть модель" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name} ({model.price ?? 0} UAH)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {itemKindId && availableMethods.length > 0 && (
                      <div className="space-y-2">
                        <Label>Методи нанесення</Label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {availableMethods.map((method) => {
                            const isSelected = itemMethods.some((m) => m.methodId === method.id);
                            return (
                              <button
                                key={method.id}
                                type="button"
                                onClick={() => toggleMethod(method.id)}
                                className={cn(
                                  "flex items-center justify-between rounded-lg border-2 p-3 text-left transition-all",
                                  isSelected
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:border-border/60"
                                )}
                              >
                                <span className="text-sm font-medium">{method.name}</span>
                                <span className="text-xs text-muted-foreground">{method.price ?? 0} UAH</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Опис (опціонально)</Label>
                      <Textarea
                        value={itemDescription}
                        onChange={(e) => setItemDescription(e.target.value)}
                        placeholder="Додаткова інформація..."
                        rows={2}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Кількість</Label>
                      <NumberInput
                        value={itemQty === "" ? null : Number(itemQty)}
                        onValueChange={(next) => setItemQty(next === null ? "" : String(next))}
                        min={1}
                        emptyValue={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Одиниця</Label>
                      <Select value={itemUnit} onValueChange={setItemUnit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="шт.">шт.</SelectItem>
                          <SelectItem value="м">м</SelectItem>
                          <SelectItem value="кг">кг</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Візуалізація (файл)</Label>
                      <div className="space-y-3 rounded-lg border border-dashed border-border/60 bg-muted/10 p-4">
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.pdf"
                          onChange={(e) => handleAttachmentChange(e.target.files?.[0] ?? null)}
                          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted/40 file:px-3 file:py-2 file:text-foreground"
                        />
                        {itemAttachmentUploading && (
                          <div className="text-xs text-muted-foreground">Завантаження файлу...</div>
                        )}
                        {itemAttachmentError && <div className="text-xs text-destructive">{itemAttachmentError}</div>}
                        {itemAttachment ? (
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {itemAttachment.name} • {(itemAttachment.size / 1024).toFixed(1)} KB
                            </div>
                            {itemAttachment.type.startsWith("image/") ? (
                              <img
                                src={itemAttachment.url}
                                alt={itemAttachment.name}
                                className="max-h-48 w-full rounded-md border border-border/50 bg-background object-contain"
                              />
                            ) : (
                              <button
                                type="button"
                                className="text-xs text-primary underline"
                                onClick={() => void downloadFileToDevice(itemAttachment.url, itemAttachment.name)}
                              >
                                Завантажити PDF
                              </button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setItemAttachment(null)}
                              className="w-full"
                            >
                              Прибрати файл
                            </Button>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Підтримуються PNG/JPG/PDF.</div>
                        )}
                      </div>
                    </div>

                    <div className="sticky top-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <div className="mb-2 text-xs text-muted-foreground">Розрахунок ціни:</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Базова ціна:</span>
                          <span className="font-mono">
                            {getModelPrice(catalogTypes, itemTypeId, itemKindId, itemModelId, Number(itemQty))}
                          </span>
                        </div>
                        {itemMethods.length > 0 && (
                          <div className="flex justify-between">
                            <span>Методи:</span>
                            <span className="font-mono">
                              +{itemMethods.reduce(
                                (sum, m) =>
                                  sum + getMethodPrice(catalogTypes, itemTypeId, itemKindId, m.methodId) * m.count,
                                0
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-primary/20 pt-2 font-semibold">
                          <span>Ціна за одиницю:</span>
                          <span className="font-mono text-primary">{computedItemPrice}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Загальна сума:</span>
                          <span className="font-mono">
                            {(computedItemPrice * (Number(itemQty) || 1)).toLocaleString("uk-UA")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="border-t border-border bg-muted/5 p-6">
            <Button variant="outline" onClick={() => setItemModalOpen(false)}>
              Скасувати
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={!itemTitle.trim() || itemAttachmentUploading}
              className="gap-2"
            >
              {editingItemId ? (
                <>
                  <Check className="h-4 w-4" />
                  {itemAttachmentUploading ? "Збереження..." : "Зберегти"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {itemAttachmentUploading ? "Збереження..." : "Додати"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerLeadQuickViewDialog
        open={partyCardOpen}
        onOpenChange={setPartyCardOpen}
        teamId={quote?.team_id ?? ""}
        userId={userId}
        customerId={quote?.customer_id ?? null}
        customerName={quote?.customer_name ?? null}
        customerLogoUrl={quote?.customer_logo_url ?? null}
      />

      <Dialog
        open={createOrderDialogOpen}
        onOpenChange={(open) => {
          setCreateOrderDialogOpen(open);
          if (!open) {
            setCreateOrderDraft(null);
            setCreateOrderSelectedItemIds([]);
            setCreateOrderError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Створити замовлення</DialogTitle>
          </DialogHeader>

          {createOrderLoading ? (
            <div className="py-6 text-sm text-muted-foreground">Готуємо дані для замовлення...</div>
          ) : createOrderDraft ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="text-sm font-semibold text-foreground">{createOrderDraft.quoteNumber}</div>
                <div className="mt-1 text-sm text-muted-foreground">{createOrderDraft.readiness.customerName}</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Що має бути готово</div>
                <div className="space-y-2">
                  {createOrderDraft.readiness.readinessSteps.map((step) => (
                    <div key={step.label} className="flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2">
                      <Checkbox checked={step.done} disabled />
                      <div className="text-sm text-foreground">{step.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Позиції, що підуть у замовлення</div>
                <div className="space-y-2">
                  {createOrderDraft.selectableItems.map((item) => {
                    const itemId = item.quoteItemId ?? item.id;
                    const checked = createOrderSelectedItemIds.includes(itemId);
                    return (
                      <label
                        key={itemId}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 px-3 py-2"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleCreateOrderItem(itemId, Boolean(value))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.qty} {item.unit} × {formatCurrency(item.unitPrice, quote.currency)} ={" "}
                            {formatCurrency(item.lineTotal, quote.currency)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {createOrderDraft.readiness.blockers.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Замовлення можна створити лише коли всі пункти вище мають галочку. Ще треба зробити: {createOrderDraft.readiness.blockers.join(", ")}.
                </div>
              ) : null}

              {createOrderError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {createOrderError}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">{createOrderError ?? "Не вдалося підготувати замовлення."}</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOrderDialogOpen(false)} disabled={createOrderSubmitting}>
              Скасувати
            </Button>
            <Button
              onClick={() => void handleCreateOrder()}
              disabled={
                createOrderSubmitting ||
                !createOrderDraft ||
                createOrderDraft.readiness.blockers.length > 0 ||
                createOrderSelectedItemIds.length === 0
              }
            >
              {createOrderSubmitting ? "Створення..." : "Створити замовлення"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewQuoteDialog
        open={editQuoteDialogOpen}
        onOpenChange={(open) => {
          setEditQuoteDialogOpen(open);
          if (!open) {
            setEditQuoteError(null);
            setEditQuoteInitialValues(null);
            setEditQuoteCustomerSearch("");
          }
        }}
        onSubmit={handleEditQuoteSubmit}
        mode="edit"
        submitting={editQuoteSaving}
        submitError={editQuoteError}
        quoteLabel={quote?.number ? `#${quote.number}` : quoteId}
        customerLabel={quote?.customer_name ?? null}
        initialValues={editQuoteInitialValues ?? undefined}
        teamId={teamId}
        quoteId={quoteId}
        customers={editQuoteCustomers}
        customersLoading={editQuoteCustomersLoading}
        onCustomerSearch={setEditQuoteCustomerSearch}
        teamMembers={teamMembers}
        catalogTypes={catalogTypes}
        currentUserId={userId ?? undefined}
      />
    </div>
  );
}
