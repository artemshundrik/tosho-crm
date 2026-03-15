import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/lib/workspace";
import { buildUserNameFromMetadata, formatUserShortName } from "@/lib/userName";
import {
  formatPrintProductSummary,
  getPrintProductConfig,
  getPrintProductDetailSections,
  isPrintPackageMetadata,
  type QuoteItemMetadata,
} from "@/lib/printPackage";
import { normalizeUnitLabel } from "@/lib/units";
import { supabase } from "@/lib/supabaseClient";
import { formatActivityClock, formatActivityDayLabel, type ActivityRow } from "@/lib/activity";
import { logActivity } from "@/lib/activityLogger";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import { notifyQuoteInitiatorOnStatusChange } from "@/lib/workflowNotifications";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { EntityHeader } from "@/components/app/headers/EntityHeader";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { NewQuoteDialog } from "@/components/quotes";
import type { NewQuoteFormData } from "@/components/quotes";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { useEntityLock } from "@/hooks/useEntityLock";
import { resolveAvatarDisplayUrl } from "@/lib/avatarUrl";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import {
  createQuote,
  getQuoteSummary,
  getQuoteRuns,
  upsertQuoteRuns,
  deleteQuote,
  listCustomersBySearch,
  listLeadsBySearch,
  listStatusHistory,
  setStatus,
  updateQuote,
  listQuoteSetMemberships,
  type TeamMemberRow,
  type QuoteStatusRow,
  type QuoteSummaryRow,
  type QuoteRun,
  type QuoteSetMembershipInfo,
} from "@/lib/toshoApi";
import { isDesignerJobRole } from "@/lib/permissions";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Copy,
  Eye,
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
  Building2,
  Truck,
  Calendar,
  User,
  Upload,
  Download,
  Search,
  ChevronDown,
  Loader2,
  TrendingDown,
  TrendingUp,
  Package,
  Shirt,
  Image,
  Lock,
  Calculator,
  Palette,
} from "lucide-react";
import {
  ATTACHMENTS_ACCEPT,
  CANCEL_REASON_OPTIONS,
  ITEM_VISUAL_BUCKET,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_QUOTE_ATTACHMENTS,
  STATUS_FLOW,
  STATUS_NEXT_ACTION,
  STATUS_OPTIONS,
  buildMentionAlias,
  canPreviewImage,
  canPreviewPdf,
  createLocalId,
  extractMentionKeys,
  formatCurrency,
  formatCurrencyCompact,
  formatFileSize,
  formatQuoteType,
  formatStatusLabel,
  getErrorMessage,
  getFileExtension,
  getInitials,
  isMentionTerminator,
  minutesAgo,
  normalizeMentionKey,
  normalizeStatus,
  renderTextWithMentions,
  shouldUseCommentsFallback,
  statusClasses,
  statusIcons,
  toEmailLocalPart,
} from "@/features/quotes/quote-details/config";
import { quoteTypeIcon, quoteTypeLabel } from "@/features/quotes/quotes-page/config";
import {
  QuoteDeadlineBadge,
  type QuoteDeadlineTone,
} from "@/features/quotes/components/QuoteDeadlineBadge";
import { QuoteKindBadge } from "@/features/quotes/components/QuoteKindBadge";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
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
  getModelLabel,
  getModelPrice,
  getPrintPositionLabel,
  getTypeLabel,
  type CatalogType,
} from "@/features/quotes/quote-details/catalog-utils";

type QuoteDetailsPageProps = {
  teamId: string;
  quoteId: string;
};

type QuoteDetailsCachePayload = {
  quote: QuoteSummaryRow;
  cachedAt: number;
};

const DEFAULT_DEADLINE_TIME = "09:00";
const DEFAULT_MANAGER_RATE = 10;
const DEFAULT_FIXED_COST_RATE = 30;
const DEFAULT_VAT_RATE = 20;
const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";
const DEADLINE_REMINDER_OPTIONS = [
  { value: "none", label: "Без сповіщення" },
  { value: "0", label: "У момент дедлайну" },
  { value: "15", label: "За 15 хвилин" },
  { value: "60", label: "За 1 годину" },
  { value: "180", label: "За 3 години" },
  { value: "1440", label: "За 1 день" },
] as const;

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
};
type QuoteComment = {
  id: string;
  body: string;
  created_at: string;
  created_by?: string | null;
};
type MembershipRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  access_role?: string | null;
  job_role?: string | null;
};
type InsertedCommentRow = {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
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
type QuoteAttachment = {
  id: string;
  name: string;
  size: string;
  created_at: string;
  url?: string;
  uploadedBy?: string | null;
  uploadedByLabel?: string;
  storageBucket?: string | null;
  storagePath?: string | null;
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

const normalizePartyMatch = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");

const parseQuoteItemMetadata = (value: unknown): QuoteItemMetadata | null => {
  if (!isPrintPackageMetadata(value)) return null;
  return value;
};

function readQuoteDetailsCache(teamId: string, quoteId: string): QuoteDetailsCachePayload | null {
  if (typeof window === "undefined" || !teamId || !quoteId) return null;
  try {
    const raw = sessionStorage.getItem(`quote-details-cache:${teamId}:${quoteId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteDetailsCachePayload;
    if (!parsed.quote || typeof parsed.quote !== "object") return null;
    return {
      quote: parsed.quote,
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

export function QuoteDetailsPage({ teamId, quoteId }: QuoteDetailsPageProps) {
  const navigate = useNavigate();
  const { userId, accessRole, jobRole } = useAuth();
  const initialCache = readQuoteDetailsCache(teamId, quoteId);
  const { getEntityViewers } = useWorkspacePresence();
  const quoteViewers = useMemo(
    () => getEntityViewers("quote", quoteId),
    [getEntityViewers, quoteId]
  );

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

  const [runs, setRuns] = useState<QuoteRun[]>([]);
  const [runsOriginal, setRunsOriginal] = useState<QuoteRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runsSaving, setRunsSaving] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [comments, setComments] = useState<QuoteComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionDropdown, setMentionDropdown] = useState<MentionDropdownState>({
    side: "bottom",
    maxHeight: 224,
  });
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [briefText, setBriefText] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

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
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [mentionLabelOverrides, setMentionLabelOverrides] = useState<Record<string, string>>({});
  const [designTask, setDesignTask] = useState<{
    id: string;
    assigneeUserId: string | null;
    assignedAt: string | null;
    metadata: Record<string, unknown>;
  } | null>(null);
  const [designTaskLoading, setDesignTaskLoading] = useState(false);
  const [designTaskError, setDesignTaskError] = useState<string | null>(null);
  const [designTaskSaving, setDesignTaskSaving] = useState(false);
  const [designAssigneeId, setDesignAssigneeId] = useState<string | null>(null);
  const [designTaskCandidates, setDesignTaskCandidates] = useState<DesignTaskCandidate[]>([]);
  const [designTaskCandidatesLoading, setDesignTaskCandidatesLoading] = useState(false);
  const [attachDesignTaskDialogOpen, setAttachDesignTaskDialogOpen] = useState(false);
  const [attachingDesignTaskId, setAttachingDesignTaskId] = useState<string | null>(null);
  const [designVisualizationSyncing, setDesignVisualizationSyncing] = useState(false);

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

  const [currentManagerRate, setCurrentManagerRate] = useState(DEFAULT_MANAGER_RATE);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState("new");

  const downloadFileToDevice = useCallback(async (url: string, filename?: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
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

  const canViewAllManagerRates =
    accessRole === "owner" || (jobRole ?? "").trim().toLowerCase() === "seo";
  const effectiveManagerId = canViewAllManagerRates
    ? quote?.assigned_to?.trim() || userId || null
    : userId || null;

  const loadCurrentManagerRate = useCallback(async () => {
    if (!effectiveManagerId) {
      setCurrentManagerRate(DEFAULT_MANAGER_RATE);
      return;
    }

    try {
      const workspaceId = await resolveWorkspaceId(effectiveManagerId);
      if (!workspaceId) {
        setCurrentManagerRate(DEFAULT_MANAGER_RATE);
        return;
      }

      const { data, error } = await supabase
        .schema("tosho")
        .from("team_member_manager_rates")
        .select("manager_rate")
        .eq("workspace_id", workspaceId)
        .eq("user_id", effectiveManagerId)
        .maybeSingle<{ manager_rate?: number | null }>();

      if (error) {
        if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
          throw error;
        }
        setCurrentManagerRate(DEFAULT_MANAGER_RATE);
        return;
      }

      setCurrentManagerRate(Math.max(0, Number(data?.manager_rate) || DEFAULT_MANAGER_RATE));
    } catch (error) {
      console.error("Failed to load current manager rate", error);
      setCurrentManagerRate(DEFAULT_MANAGER_RATE);
    }
  }, [effectiveManagerId]);

  useEffect(() => {
    void loadCurrentManagerRate();
  }, [loadCurrentManagerRate]);

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

  const getRunPricing = (run: QuoteRun | null) => {
    if (!run) {
      return {
        costTotal: 0,
        costPerUnit: null as number | null,
        desiredManagerIncome: 0,
        managerRate: currentManagerRate,
        fixedCostRate: DEFAULT_FIXED_COST_RATE,
        vatRate: DEFAULT_VAT_RATE,
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
    const costPerUnit = quantity > 0 ? costTotal / quantity : null;
    const desiredManagerIncome = Math.max(0, Number(run.desired_manager_income) || 0);
    const managerRate = Math.max(0, currentManagerRate || DEFAULT_MANAGER_RATE);
    const fixedCostRate = DEFAULT_FIXED_COST_RATE;
    const vatRate = DEFAULT_VAT_RATE;
    const requiredGrossProfit = managerRate > 0 ? desiredManagerIncome / (managerRate / 100) : 0;
    const fixedCosts = requiredGrossProfit * (fixedCostRate / 100);
    const vatAmount = (requiredGrossProfit + fixedCosts) * (vatRate / 100);
    const markupTotal = requiredGrossProfit + fixedCosts + vatAmount;
    const saleTotal = costTotal + markupTotal;
    const saleUnitPrice = quantity > 0 ? saleTotal / quantity : null;

    return {
      costTotal,
      costPerUnit,
      desiredManagerIncome,
      managerRate,
      fixedCostRate,
      vatRate,
      requiredGrossProfit,
      fixedCosts,
      vatAmount,
      markupTotal,
      saleTotal,
      saleUnitPrice,
    };
  };

  // Runs (tirages)
  const addRun = () => {
    const newId = crypto.randomUUID();
    setRuns((prev) => [
      ...prev,
      {
        id: newId,
        quantity: 1,
        unit_price_model: 0,
        unit_price_print: 0,
        logistics_cost: 0,
        desired_manager_income: 0,
        manager_rate: DEFAULT_MANAGER_RATE,
        fixed_cost_rate: DEFAULT_FIXED_COST_RATE,
        vat_rate: DEFAULT_VAT_RATE,
      },
    ]);
    setSelectedRunId(newId);
  };

  const updateRun = (index: number, field: keyof QuoteRun, value: number) => {
    setRuns((prev) =>
      prev.map((run, i) => (i === index ? { ...run, [field]: value } : run))
    );
  };
  void updateRun;

  const updateRunRaw = (
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
    raw: string
  ) => {
    if (index < 0) return;
    const parsed = raw === "" ? null : Number(raw);
    setRuns((prev) =>
      prev.map((run, i) => (i === index ? { ...run, [field]: parsed } : run))
    );
  };

  const saveRuns = async (nextRuns?: QuoteRun[] | unknown) => {
    if (quoteRequirements.length > 0) {
      const message = `Щоб зберегти розрахунок, заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`;
      setRunsError(message);
      toast.error(message);
      return;
    }
    const targetRuns = Array.isArray(nextRuns) ? nextRuns : runs;
    setRunsSaving(true);
    setRunsError(null);
    try {
      const sanitized = targetRuns.map((run) => ({
        ...run,
        quantity: Math.max(1, Number(run.quantity) || 1),
        unit_price_model: Math.max(0, Number(run.unit_price_model) || 0),
        unit_price_print: Math.max(0, Number(run.unit_price_print) || 0),
        logistics_cost: Math.max(0, Number(run.logistics_cost) || 0),
        desired_manager_income: Math.max(0, Number(run.desired_manager_income) || 0),
        manager_rate: Math.max(0, Number(run.manager_rate) || DEFAULT_MANAGER_RATE),
        fixed_cost_rate: Math.max(0, Number(run.fixed_cost_rate) || DEFAULT_FIXED_COST_RATE),
        vat_rate: Math.max(0, Number(run.vat_rate) || DEFAULT_VAT_RATE),
      }));
      // delete missing (present before, absent now)
      const originalIds = new Set(
        runsOriginal.map((r) => r.id).filter((id): id is string => Boolean(id))
      );
      const keepIds = new Set(
        sanitized.map((r) => r.id).filter((id): id is string => Boolean(id))
      );
      const idsToDelete = Array.from(originalIds).filter((id) => !keepIds.has(id));
      if (idsToDelete.length > 0) {
        await supabase.schema("tosho").from("quote_item_runs").delete().in("id", idsToDelete);
      }

      await upsertQuoteRuns(quoteId, sanitized);
      await loadRuns();
      await logActivity({
        teamId,
        action: "прорахував тиражі",
        entityType: "quotes",
        entityId: quoteId,
        title: `Прорахував тиражі для прорахунку ${quote?.number ?? ""}`.trim(),
        href: `/orders/estimates/${quoteId}`,
        metadata: { source: "quote_runs" },
      });
      await loadActivityLog();
      toast.success("Тиражі збережено");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося зберегти тиражі.");
      if (/record\s+"new"\s+has\s+no\s+field\s+"team_id"/i.test(message)) {
        setRunsError(
          "Потрібно оновити SQL hotfix для блокувань (scripts/entity-locks-hotfix-quote-child-team-id.sql)."
        );
      } else {
        setRunsError(message);
      }
      toast.error("Помилка збереження");
    } finally {
      setRunsSaving(false);
    }
  };

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
    await saveRuns(next);
  };

  const handleDeleteQuote = async () => {
    if (deleteQuoteBusy) return;
    setDeleteQuoteBusy(true);
    setStatusError(null);
    try {
      await deleteQuote(quoteId, teamId);
      toast.success("Прорахунок видалено");
      navigate("/orders/estimates", { replace: true });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося видалити прорахунок");
      setStatusError(message);
      toast.error(message);
    } finally {
      setDeleteQuoteBusy(false);
      setDeleteQuoteDialogOpen(false);
    }
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
    try {
      const nextBrief = briefText.trim();
      const data = await updateQuote({
        quoteId,
        teamId,
        comment: nextBrief ? nextBrief : null,
        designBrief: nextBrief ? nextBrief : null,
      });
      setQuote((prev) =>
        prev
          ? {
              ...prev,
              comment: (data as Partial<QuoteSummaryRow> | null)?.comment ?? nextBrief ?? null,
              design_brief: (data as Partial<QuoteSummaryRow> | null)?.design_brief ?? nextBrief ?? null,
              updated_at: (data as Partial<QuoteSummaryRow> | null)?.updated_at ?? prev.updated_at,
            }
          : prev
      );
      setBriefDirty(false);
      await logActivity({
        teamId,
        action: "оновив ТЗ",
        entityType: "quotes",
        entityId: quoteId,
        title: `Оновив ТЗ для дизайнера${quote?.number ? ` (#${quote.number})` : ""}`,
        href: `/orders/estimates/${quoteId}`,
        metadata: { source: "quote_brief" },
      });
      await loadActivityLog();
      toast.success("ТЗ збережено");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося зберегти ТЗ.");
      setBriefError(message);
      toast.error(message);
    } finally {
      setBriefSaving(false);
    }
  };

  const updatedMinutes = minutesAgo(quote?.updated_at ?? null);

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.qty * item.price, 0);
  }, [items]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId]
  );
  const selectedRunIndex = useMemo(
    () => runs.findIndex((run) => run === selectedRun),
    [runs, selectedRun]
  );

  const selectedRunTotal = useMemo(() => {
    if (!selectedRun) return 0;
    return getRunTotal(selectedRun);
  }, [selectedRun]);

  const selectedRunPricing = useMemo(() => getRunPricing(selectedRun), [selectedRun]);

  const selectedUnitCost = useMemo(() => {
    if (!selectedRun) return null;
    const qty = Number(selectedRun.quantity) || 0;
    if (qty <= 0) return null;
    const modelPrice = Number(selectedRun.unit_price_model) || 0;
    const printPrice = Number(selectedRun.unit_price_print) || 0;
    const logistics = Number(selectedRun.logistics_cost) || 0;
    return modelPrice + printPrice + logistics / qty;
  }, [selectedRun]);

  const [runsLoaded, setRunsLoaded] = useState(false);

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

  const combineDeadlineValue = (date?: string | null, time?: string | null) => {
    const normalizedDate = (date ?? "").trim();
    if (!normalizedDate) return "";
    const normalizedTime = (time ?? "").trim() || DEFAULT_DEADLINE_TIME;
    return `${normalizedDate}T${normalizedTime}:00`;
  };

  const toLocalDate = (value?: string | null) => {
    if (!value) return undefined;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return undefined;
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  };

  const formatDateInput = (value?: Date | null) => {
    if (!value) return "";
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const parseDeadlineDate = (value?: string | null) => {
    if (!value) return null;
    const dateTimeMatch = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
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
    return teamMembers.filter((member) => isDesignerJobRole(member.jobRole));
  }, [teamMembers]);
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

  useEffect(() => {
    if (filteredMentionSuggestions.length === 0) {
      setMentionActiveIndex(0);
      return;
    }
    setMentionActiveIndex((prev) =>
      Math.max(0, Math.min(prev, filteredMentionSuggestions.length - 1))
    );
  }, [filteredMentionSuggestions.length]);
  useEffect(() => {
    if (!quote) return;
    if (briefDirty) return;
    setBriefText(quote.design_brief ?? quote.comment ?? "");
    setBriefError(null);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.design_brief, quote?.comment, quote?.id, briefDirty]);
  const currentStatus = normalizeStatus(quote?.status);
  const quoteRequirements = useMemo(() => {
    const issues: string[] = [];
    const hasParty = Boolean(quote?.customer_id || (quote?.customer_name ?? "").trim());
    const hasDeadline = Boolean((deadlineDate || "").trim() || (quote?.deadline_at ?? "").trim());
    if (!hasParty) issues.push("Замовник або Лід");
    if (!hasDeadline) issues.push("Дедлайн прорахунку");
    return issues;
  }, [deadlineDate, quote?.customer_id, quote?.customer_name, quote?.deadline_at]);
  const quoteRequirementsHint = quoteRequirements.length
    ? `Заповніть обов'язкові поля: ${quoteRequirements.join(", ")}.`
    : null;
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
  const baseTotalForStatus = runs.length > 0 ? selectedRunTotal : itemsSubtotal;
  const nextAction = STATUS_NEXT_ACTION[currentStatus] ?? STATUS_NEXT_ACTION.new;

  const stageHints = useMemo(() => {
    const hasItems = items.length > 0;
    const hasDeadline = Boolean(quote?.deadline_at);
    const hasTotal = baseTotalForStatus > 0;
    const hasBrief = Boolean(briefText.trim());

    if (currentStatus === "new") {
      return [
        { label: "Додано хоча б одну позицію", done: hasItems },
        { label: "Вказано дедлайн", done: hasDeadline },
      ];
    }
    if (currentStatus === "estimating") {
      return [
        { label: "Позиції заповнені", done: hasItems },
        { label: "Пораховано підсумок", done: hasTotal },
      ];
    }
    if (currentStatus === "estimated") {
      return [
        { label: "Є фінальна сума", done: hasTotal },
        { label: "Заповнено ТЗ/коментар", done: hasBrief },
      ];
    }
    if (currentStatus === "awaiting_approval") {
      return [{ label: "Після відповіді клієнта зафіксуйте результат", done: false }];
    }
    if (currentStatus === "approved") {
      return [{ label: "Готово. Можна переходити до наступного процесу", done: true }];
    }
    return [{ label: "Прорахунок скасовано", done: true }];
  }, [currentStatus, items.length, quote?.deadline_at, baseTotalForStatus, briefText]);

  const pendingHintsCount = stageHints.filter((item) => !item.done).length;

  const canEditRuns = useMemo(
    () =>
      ["new", "estimating", "estimated", "awaiting_approval", "approved"].includes(
        currentStatus ?? ""
      ),
    [currentStatus]
  );

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
          typeof metadata?.note === "string" ? metadata.note : undefined;
        const Icon: ActivityIcon =
          source === "quote_runs"
            ? Calculator
            : source === "quote_status" && toStatus
            ? (statusIcons[toStatus] as ActivityIcon) ?? Clock
            : source === "quote_deadline"
            ? Calendar
            : Clock;
        const accentClass =
          source === "quote_runs"
            ? "quote-activity-accent-runs"
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
// eslint-disable-next-line react-hooks/exhaustive-deps
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
    const subtotal = runs.length > 0 ? selectedRunPricing.saleTotal : itemsSubtotal;
    return {
      subtotal,
      discountAmount: 0,
      total: Math.max(0, subtotal),
    };
  }, [itemsSubtotal, runs.length, selectedRunPricing.saleTotal]);

  const selectedType = useMemo(
    () => catalogTypes.find((type) => type.id === itemTypeId) ?? null,
    [catalogTypes, itemTypeId]
  );

  const availableKinds = selectedType?.kinds ?? [];
  const selectedKind = availableKinds.find((kind) => kind.id === itemKindId) ?? null;
  const availableModels = selectedKind?.models ?? [];
// eslint-disable-next-line react-hooks/exhaustive-deps
  const availableMethods = selectedKind?.methods ?? [];

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
    const base = getModelPrice(catalogTypes, itemTypeId, itemKindId, itemModelId, qty);
    const methodsTotal = itemMethods.reduce((sum, method) => {
      return sum + getMethodPrice(catalogTypes, itemTypeId, itemKindId, method.methodId) * method.count;
    }, 0);
    return Math.max(0, base + methodsTotal);
  }, [catalogTypes, itemTypeId, itemKindId, itemModelId, itemMethods, itemPrice, itemFormMode, itemQty]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const { data: typeRows, error: typeError } = await supabase
          .schema("tosho")
          .from("catalog_types")
          .select("id,name,sort_order")
          .eq("team_id", teamId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (typeError) throw typeError;

        const { data: kindRows, error: kindError } = await supabase
          .schema("tosho")
          .from("catalog_kinds")
          .select("id,type_id,name,sort_order")
          .eq("team_id", teamId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (kindError) throw kindError;

        const { data: modelRows, error: modelError } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .select("id,kind_id,name,price,image_url,metadata")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        if (modelError) throw modelError;

        const { data: methodRows, error: methodError } = await supabase
          .schema("tosho")
          .from("catalog_methods")
          .select("id,kind_id,name,price")
          .eq("team_id", teamId)
          .order("name", { ascending: true });
        if (methodError) throw methodError;

        const { data: printRows, error: printError } = await supabase
          .schema("tosho")
          .from("catalog_print_positions")
          .select("id,kind_id,label,sort_order")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true });
        if (printError) throw printError;

        const modelIds = (modelRows ?? []).map((row) => row.id);

        const { data: modelMethodRows, error: modelMethodError } = modelIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_model_methods")
              .select("model_id,method_id")
              .in("model_id", modelIds)
          : { data: [], error: null };
        if (modelMethodError) throw modelMethodError;

        const { data: tierRows, error: tierError } = modelIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_price_tiers")
              .select("id,model_id,min_qty,max_qty,price")
              .in("model_id", modelIds)
              .order("min_qty", { ascending: true })
          : { data: [], error: null };
        if (tierError) throw tierError;

        const methodIdsByModel = new Map<string, string[]>();
        (modelMethodRows ?? []).forEach((row) => {
          const list = methodIdsByModel.get(row.model_id) ?? [];
          list.push(row.method_id);
          methodIdsByModel.set(row.model_id, list);
        });

        const tiersByModel = new Map<string, CatalogPriceTier[]>();
        (tierRows ?? []).forEach((row) => {
          const list = tiersByModel.get(row.model_id) ?? [];
          list.push({
            id: row.id,
            min: row.min_qty,
            max: row.max_qty,
            price: row.price,
          });
          tiersByModel.set(row.model_id, list);
        });

        const methodsByKind = new Map<string, CatalogMethod[]>();
        (methodRows ?? []).forEach((row) => {
          const list = methodsByKind.get(row.kind_id) ?? [];
          list.push({ id: row.id, name: row.name, price: row.price ?? undefined });
          methodsByKind.set(row.kind_id, list);
        });

        const printPositionsByKind = new Map<string, CatalogPrintPosition[]>();
        (printRows ?? []).forEach((row) => {
          const list = printPositionsByKind.get(row.kind_id) ?? [];
          list.push({ id: row.id, label: row.label, sort_order: row.sort_order ?? undefined });
          printPositionsByKind.set(row.kind_id, list);
        });

        const modelsByKind = new Map<string, CatalogModel[]>();
        (modelRows ?? []).forEach((row) => {
          const list = modelsByKind.get(row.kind_id) ?? [];
          list.push({
            id: row.id,
            name: row.name,
            price: row.price ?? undefined,
            imageUrl: row.image_url ?? undefined,
            metadata:
              row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as CatalogModel["metadata"])
                : undefined,
            priceTiers: tiersByModel.get(row.id),
          });
          modelsByKind.set(row.kind_id, list);
        });

        const kindsByType = new Map<string, CatalogKind[]>();
        (kindRows ?? []).forEach((row) => {
          const list = kindsByType.get(row.type_id) ?? [];
          list.push({
            id: row.id,
            name: row.name,
            models: modelsByKind.get(row.id) ?? [],
            methods: methodsByKind.get(row.id) ?? [],
            printPositions: printPositionsByKind.get(row.id) ?? [],
          });
          kindsByType.set(row.type_id, list);
        });

        const nextCatalog = (typeRows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          kinds: kindsByType.get(row.id) ?? [],
        }));

        if (!cancelled) {
          setCatalogTypes(nextCatalog);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCatalogError(getErrorMessage(e, "Не вдалося завантажити каталог."));
          setCatalogTypes([]);
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
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
        const nextMembers = rows.map((row) => {
          return {
            id: row.userId,
            label: row.label,
            avatarUrl: row.avatarDisplayUrl,
            jobRole: row.jobRole ?? null,
          } satisfies TeamMemberRow;
        });

        if (!active) return;
        setTeamMembers(nextMembers);
      } catch {
        if (active) setTeamMembers([]);
      }
    };
    void loadMembers();
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  useEffect(() => {
    if (teamMembers.length === 0) return;

    let active = true;
    const loadMentionLabelOverrides = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          const response = await fetch("/.netlify/functions/create-workspace-invite", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ mode: "list_workspace_member_profiles" }),
          });

          if (response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | {
                  profilesByUserId?: Record<
                    string,
                    {
                      firstName?: string;
                      lastName?: string;
                      fullName?: string;
                    }
                  >;
                }
              | null;

            const nextOverrides: Record<string, string> = {};
            for (const [memberId, profile] of Object.entries(payload?.profilesByUserId ?? {})) {
              const label = formatUserShortName({
                firstName: profile.firstName ?? null,
                lastName: profile.lastName ?? null,
                fullName: profile.fullName ?? null,
                fallback: "",
              });
              if (label) {
                nextOverrides[memberId] = label;
              }
            }
            if (!active) return;
            setMentionLabelOverrides(nextOverrides);
            return;
          }
        }

        const genericMemberIds = teamMembers
          .filter((member) => isGenericMentionLabel(member.label))
          .map((member) => member.id);
        if (genericMemberIds.length === 0) return;

        const [profilesResult, authResult] = await Promise.all([
          supabase
            .from("team_member_profiles")
            .select("user_id,first_name,last_name,full_name")
            .in("user_id", genericMemberIds),
          supabase.auth.getUser(),
        ]);

        const nextOverrides: Record<string, string> = {};
        const profileRows =
          ((profilesResult.data as Array<{
            user_id?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            full_name?: string | null;
          }> | null) ?? []);

        for (const row of profileRows) {
          const userId = row.user_id?.trim();
          if (!userId) continue;
          const label = formatUserShortName({
            firstName: row.first_name ?? null,
            lastName: row.last_name ?? null,
            fullName: row.full_name ?? null,
            fallback: "",
          });
          if (label) {
            nextOverrides[userId] = label;
          }
        }

        const currentUser = authResult.data.user ?? null;
        if (currentUser?.id && genericMemberIds.includes(currentUser.id)) {
          const currentUserName = buildUserNameFromMetadata(
            currentUser.user_metadata as Record<string, unknown> | undefined,
            currentUser.email
          ).displayName;
          if (currentUserName) {
            nextOverrides[currentUser.id] = currentUserName;
          }
        }

        if (!active) return;
        setMentionLabelOverrides(nextOverrides);
      } catch {
        if (active) setMentionLabelOverrides({});
      }
    };

    void loadMentionLabelOverrides();
    return () => {
      active = false;
    };
  }, [teamMembers]);

  useEffect(() => {
    if (!teamId || !editQuoteDialogOpen) return;
    let active = true;
    const loadCustomers = async () => {
      setEditQuoteCustomersLoading(true);
      try {
        const [customerRows, leadRows] = await Promise.all([
          listCustomersBySearch(teamId, editQuoteCustomerSearch),
          listLeadsBySearch(teamId, editQuoteCustomerSearch),
        ]);
        if (!active) return;
        setEditQuoteCustomers([
          ...customerRows.map((customer) => ({
            ...customer,
            entityType: "customer" as const,
          })),
          ...leadRows.map((lead) => ({
            id: lead.id,
            name: lead.company_name ?? lead.legal_name ?? null,
            legal_name: lead.legal_name ?? null,
            logo_url: lead.logo_url ?? null,
            entityType: "lead" as const,
          })),
        ]);
      } catch {
        if (active) setEditQuoteCustomers([]);
      } finally {
        if (active) setEditQuoteCustomersLoading(false);
      }
    };
    void loadCustomers();
    return () => {
      active = false;
    };
  }, [teamId, editQuoteDialogOpen, editQuoteCustomerSearch]);

  const loadQuote = async () => {
    if (!quote) setLoading(true);
    setError(null);
    try {
      const summary = await getQuoteSummary(quoteId);
      if (summary.team_id && summary.team_id !== teamId) {
        throw new Error("Немає доступу до цього прорахунку.");
      }
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
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            `quote-details-cache:${teamId}:${quoteId}`,
            JSON.stringify({
              quote: summary,
              cachedAt: Date.now(),
            } satisfies QuoteDetailsCachePayload)
          );
        } catch {
          // ignore cache persistence failures
        }
      }
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося завантажити прорахунок.");
      if ((message ?? "").toLowerCase().includes("stack depth limit exceeded")) {
        setError("Помилка БД (stack depth limit exceeded). Перевірте RLS/policy у таблицях quote_*.");
      } else {
        setError(message);
      }
      if (!quote) setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDesignTask = async () => {
    if (!quoteId || !teamId) {
      setDesignTask(null);
      setDesignAssigneeId(null);
      return;
    }
    setDesignTaskLoading(true);
    setDesignTaskError(null);
    try {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, metadata, created_at")
        .eq("action", "design_task")
        .eq("entity_id", quoteId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      let row = (data ?? [])[0] as { id: string; metadata?: Record<string, unknown> | null } | undefined;
      if (!row) {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("activity_log")
          .select("id, metadata, created_at")
          .eq("action", "design_task")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });
        if (fallbackError) throw fallbackError;
        row = ((fallbackRows ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>).find(
          (candidate) => {
            const metadata = candidate.metadata ?? {};
            return typeof metadata.quote_id === "string" && metadata.quote_id.trim() === quoteId;
          }
        );
      }
      if (!row) {
        setDesignTask(null);
        setDesignAssigneeId(null);
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
    } catch (e: unknown) {
      setDesignTaskError(getErrorMessage(e, "Не вдалося завантажити дизайн-задачу."));
      setDesignTask(null);
    } finally {
      setDesignTaskLoading(false);
    }
  };

  const loadDesignTaskCandidates = async () => {
    if (!teamId || !quote) {
      setDesignTaskCandidates([]);
      return;
    }
    if (designTask) {
      setDesignTaskCandidates([]);
      return;
    }
    setDesignTaskCandidatesLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, title, metadata, created_at")
        .eq("action", "design_task")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const quoteCustomerId =
        typeof (quote as unknown as { customer_id?: string | null }).customer_id === "string" &&
        (quote as unknown as { customer_id?: string | null }).customer_id
          ? ((quote as unknown as { customer_id?: string | null }).customer_id as string)
          : null;
      const quoteCustomerName = normalizePartyMatch(quote.customer_name ?? null);

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
    } catch (e) {
      console.warn("Failed to load standalone design task candidates", e);
      setDesignTaskCandidates([]);
    } finally {
      setDesignTaskCandidatesLoading(false);
    }
  };

  const attachExistingDesignTask = async (candidate: DesignTaskCandidate) => {
    if (!teamId || !quote || attachingDesignTaskId) return;
    setAttachingDesignTaskId(candidate.id);
    setDesignTaskError(null);
    try {
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

      const { error } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", candidate.id)
        .eq("team_id", teamId);
      if (error) throw error;

      if (candidate.selectedFile) {
        const { data: existing, error: existingError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .select("id")
          .eq("quote_id", quoteId)
          .eq("storage_bucket", candidate.selectedFile.storage_bucket)
          .eq("storage_path", candidate.selectedFile.storage_path)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing?.id) {
          const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
            team_id: teamId,
            quote_id: quoteId,
            file_name: candidate.selectedFile.file_name,
            mime_type: candidate.selectedFile.mime_type || null,
            file_size: candidate.selectedFile.file_size,
            storage_bucket: candidate.selectedFile.storage_bucket,
            storage_path: candidate.selectedFile.storage_path,
            uploaded_by: candidate.selectedFile.uploaded_by ?? userId ?? null,
          });
          if (insertError) throw insertError;
        }
      }

      await logDesignTaskActivity({
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
      });
      await logActivity({
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
      });

      setAttachDesignTaskDialogOpen(false);
      toast.success("Дизайн-задачу прив’язано");
      await Promise.all([loadDesignTask(), loadAttachments(), loadActivityLog()]);
    } catch (e) {
      const message = getErrorMessage(e, "Не вдалося прив’язати дизайн-задачу.");
      setDesignTaskError(message);
      toast.error(message);
    } finally {
      setAttachingDesignTaskId(null);
    }
  };

  const getNextDesignTaskNumber = async (teamIdValue: string, createdAtIso: string) => {
    const date = new Date(createdAtIso);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    const monthCode = `${month}${year}`;
    const monthStartIso = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const nextMonthStartIso = new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString();
    const { count, error } = await supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamIdValue)
      .eq("action", "design_task")
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthStartIso);
    if (error) throw error;
    return `TS-${monthCode}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  };

  const createDesignTask = async (override?: {
    assigneeUserId?: string | null;
    modelName?: string | null;
    methodsCount?: number;
    designBrief?: string | null;
  }) => {
    if (!teamId) return;
    setDesignTaskSaving(true);
    setDesignTaskError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      const actorName =
        (userId ? memberById.get(userId) : null) ||
        authData.user?.email ||
        "System";
      const modelName = override?.modelName ?? items[0]?.title ?? "Позиція";
      const methodsCount = override?.methodsCount ?? items[0]?.methods?.length ?? 0;
      const designDeadline = quote?.design_deadline_at ?? quote?.deadline_at ?? null;
      const assigneeUserId = override?.assigneeUserId ?? designAssigneeId ?? null;
      const assignedAt = assigneeUserId ? new Date().toISOString() : null;
      const createdAtIso = new Date().toISOString();
      const designTaskNumber = await getNextDesignTaskNumber(teamId, createdAtIso);

      const { data, error } = await supabase
        .from("activity_log")
        .insert({
          team_id: teamId,
          user_id: userId ?? null,
          actor_name: actorName,
          action: "design_task",
          entity_type: "design_task",
          entity_id: quoteId,
          title: `Дизайн: ${modelName}`,
          metadata: {
            source: "design_task_created",
            status: "new",
            design_task_number: designTaskNumber,
            quote_id: quoteId,
            design_task_id: null,
            assignee_user_id: assigneeUserId,
            assigned_at: assignedAt,
            quote_type: quote?.quote_type ?? null,
            methods_count: methodsCount,
            has_files: attachments.length > 0,
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
        })
        .select("id, metadata")
        .single();
      if (error) throw error;

      const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
      const nextAssignee = (meta as { assignee_user_id?: string | null }).assignee_user_id ?? assigneeUserId;
      const nextAssignedAt = (meta as { assigned_at?: string | null }).assigned_at ?? assignedAt;
      setDesignTask({
        id: (data as { id: string }).id,
        assigneeUserId: nextAssignee ?? null,
        assignedAt: nextAssignedAt ?? null,
        metadata: meta,
      });
      setDesignAssigneeId(nextAssignee ?? null);

      if (assigneeUserId && assigneeUserId !== userId) {
        const quoteLabel = quote?.number ? `#${quote.number}` : quoteId.slice(0, 8);
        try {
          await notifyUsers({
            userIds: [assigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: `${actorName} призначив(ла) вас на задачу по прорахунку ${quoteLabel}.`,
            href: `/design/${(data as { id: string }).id}`,
            type: "info",
          });
        } catch (notifyError) {
          console.warn("Failed to notify designer about new task", notifyError);
        }
      }
      toast.success("Дизайн-задачу створено");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося створити дизайн-задачу.");
      setDesignTaskError(message);
      toast.error(message);
    } finally {
      setDesignTaskSaving(false);
    }
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

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      const actorName =
        (userId ? memberById.get(userId) : null) ||
        authData.user?.email ||
        "System";

      const { error } = await supabase
        .from("activity_log")
        .update({ metadata: nextMetadata })
        .eq("id", designTask.id)
        .eq("team_id", teamId);
      if (error) throw error;

      setDesignTask({
        ...designTask,
        assigneeUserId: nextAssigneeUserId,
        assignedAt: nextAssignedAt,
        metadata: nextMetadata,
      });
      setDesignAssigneeId(nextAssigneeUserId);

      try {
        await logDesignTaskActivity({
          teamId,
          designTaskId: designTask.id,
          quoteId,
          userId,
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
        });
      } catch (logError) {
        console.warn("Failed to log design task assignment event", logError);
      }

      const quoteLabel = quote?.number ? `#${quote.number}` : quoteId.slice(0, 8);
      try {
        if (nextAssigneeUserId && nextAssigneeUserId !== userId) {
          await notifyUsers({
            userIds: [nextAssigneeUserId],
            title: "Вас призначено на дизайн-задачу",
            body: `${actorName} призначив(ла) вас на задачу по прорахунку ${quoteLabel}.`,
            href: `/design/${designTask.id}`,
            type: "info",
          });
        }
        if (previousAssignee && previousAssignee !== userId && previousAssignee !== nextAssigneeUserId) {
          await notifyUsers({
            userIds: [previousAssignee],
            title: "Вас знято з дизайн-задачі",
            body: `${actorName} зняв(ла) вас із задачі по прорахунку ${quoteLabel}.`,
            href: `/design/${designTask.id}`,
            type: "warning",
          });
        }
      } catch (notifyError) {
        console.warn("Failed to notify design task assignment change", notifyError);
      }

      toast.success(nextAssigneeUserId ? "Виконавця призначено" : "Призначення знято");
    } catch (e: unknown) {
      setDesignTask({
        ...designTask,
        assigneeUserId: previousAssignee,
        assignedAt: previousAssignedAt,
        metadata: designTask.metadata,
      });
      setDesignAssigneeId(previousAssignee);
      const message = getErrorMessage(e, "Не вдалося оновити виконавця.");
      setDesignTaskError(message);
      toast.error(message);
    } finally {
      setDesignTaskSaving(false);
    }
  };

  const loadItems = async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const quoteItemColumnsWithMetadata =
        "id, position, name, description, metadata, qty, unit, unit_price, methods, attachment, catalog_type_id, catalog_kind_id, catalog_model_id, print_position_id, print_width_mm, print_height_mm";
      const quoteItemColumnsWithoutMetadata =
        "id, position, name, description, qty, unit, unit_price, methods, attachment, catalog_type_id, catalog_kind_id, catalog_model_id, print_position_id, print_width_mm, print_height_mm";
      const loadRows = async (withTeamFilter: boolean, withMetadata: boolean) => {
        const quoteItemsTable: any = supabase.schema("tosho").from("quote_items");
        let query: any = quoteItemsTable
          .select(withMetadata ? quoteItemColumnsWithMetadata : quoteItemColumnsWithoutMetadata)
          .eq("quote_id", quoteId)
          .order("position", { ascending: true });
        if (withTeamFilter && teamId) {
          query = query.eq("team_id", teamId);
        }
        return await query;
      };

      let { data, error } = await loadRows(!!teamId, true);
      if (
        error &&
        /column/i.test(error.message ?? "") &&
        /metadata/i.test(error.message ?? "")
      ) {
        ({ data, error } = await loadRows(!!teamId, false));
      }
      if (
        error &&
        teamId &&
        /column/i.test(error.message ?? "") &&
        /team_id/i.test(error.message ?? "")
      ) {
        ({ data, error } = await loadRows(false, true));
        if (
          error &&
          /column/i.test(error.message ?? "") &&
          /metadata/i.test(error.message ?? "")
        ) {
          ({ data, error } = await loadRows(false, false));
        }
      }
      if (error) throw error;
      const rows = data ?? [];
      setItems(
        rows.map((row: any) => {
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
                  name: row.attachment.name ?? "file",
                  size: Number(row.attachment.size ?? 0),
                  type: row.attachment.type ?? "application/octet-stream",
                  url: row.attachment.url ?? "",
                }
              : undefined;
          return {
            id: row.id,
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
          };
        })
      );
    } catch (e: unknown) {
      setItemsError(getErrorMessage(e, "Не вдалося завантажити позиції."));
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  const loadRuns = async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await getQuoteRuns(quoteId, teamId);
      setRuns(data);
      setRunsOriginal(data);
    } catch (e: unknown) {
      setRunsError(getErrorMessage(e, "Не вдалося завантажити тиражі."));
      setRuns([]);
    } finally {
      setRunsLoading(false);
      setRunsLoaded(true);
    }
  };

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
          manager_rate: DEFAULT_MANAGER_RATE,
          fixed_cost_rate: DEFAULT_FIXED_COST_RATE,
          vat_rate: DEFAULT_VAT_RATE,
        },
      ]);
      setSelectedRunId(newId);
    }
  }, [runsLoaded, runs.length, items]);

  useEffect(() => {
    if (!runsLoaded) return;
    if (runs.length === 0) {
      setSelectedRunId(null);
      return;
    }
    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0]?.id ?? null);
    }
  }, [runsLoaded, runs, selectedRunId]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await listStatusHistory(quoteId, teamId);
      setHistory(data);
    } catch (e: unknown) {
      setHistoryError(getErrorMessage(e, "Не вдалося завантажити історію."));
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const invokeQuoteCommentsFunction = async (payload: Record<string, unknown>) => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Не вдалося визначити сесію користувача.");

        const response = await fetch("/.netlify/functions/quote-comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        let parsed: Record<string, unknown> = {};
        if (rawText) {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            parsed = {};
          }
        }

        if (!response.ok) {
          const parsedError = typeof parsed.error === "string" ? parsed.error : null;
          throw new Error(parsedError || `HTTP ${response.status}`);
        }

        return parsed;
      };

      const loadRows = async (withTeamFilter: boolean) => {
        let query = supabase
          .schema("tosho")
          .from("quote_comments")
          .select("id,body,created_at,created_by")
          .eq("quote_id", quoteId)
          .order("created_at", { ascending: false });
        if (withTeamFilter && teamId) {
          query = query.eq("team_id", teamId);
        }
        return await query;
      };

      let { data, error } = await loadRows(!!teamId);
      if (
        error &&
        teamId &&
        /column/i.test(error.message ?? "") &&
        /team_id/i.test(error.message ?? "")
      ) {
        ({ data, error } = await loadRows(false));
      }
      if (error) {
        if (shouldUseCommentsFallback(error.message)) {
          const fallback = await invokeQuoteCommentsFunction({
            mode: "list",
            quoteId,
          });
          const comments = Array.isArray(fallback?.comments) ? fallback.comments : [];
          setComments(
            comments.map((row: unknown) => {
              const entry = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
              return {
                id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
                body: typeof entry.body === "string" ? entry.body : "",
                created_at:
                  typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
                created_by: typeof entry.created_by === "string" ? entry.created_by : null,
              };
            })
          );
          return;
        }
        throw error;
      }
      setComments(
        (data ?? []).map((row) => ({
          id: row.id,
          body: row.body ?? "",
          created_at: row.created_at ?? new Date().toISOString(),
          created_by: row.created_by ?? null,
        }))
      );
    } catch (e: unknown) {
      setCommentsError(getErrorMessage(e, "Не вдалося завантажити коментарі."));
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const loadActivityLog = async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      let query = supabase
        .from("activity_log")
        .select("id,team_id,user_id,actor_name,action,entity_type,entity_id,title,href,metadata,created_at")
        .eq("entity_type", "quotes")
        .eq("entity_id", quoteId)
        .order("created_at", { ascending: false });
      if (teamId) {
        query = query.eq("team_id", teamId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setActivityRows((data as ActivityRow[]) ?? []);
    } catch (e: unknown) {
      setActivityError(getErrorMessage(e, "Не вдалося завантажити активність."));
      setActivityRows([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadAttachments = async () => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const loadRows = async (withTeamFilter: boolean) => {
        let query = supabase
          .schema("tosho")
          .from("quote_attachments")
          .select("id,file_name,file_size,created_at,storage_bucket,storage_path,uploaded_by")
          .eq("quote_id", quoteId)
          .order("created_at", { ascending: false });
        if (withTeamFilter && teamId) {
          query = query.eq("team_id", teamId);
        }
        return await query;
      };

      let { data, error } = await loadRows(!!teamId);
      if (
        error &&
        teamId &&
        /column/i.test(error.message ?? "") &&
        /team_id/i.test(error.message ?? "")
      ) {
        ({ data, error } = await loadRows(false));
      }
      if (error) throw error;

      const rows = data ?? [];
      const mapped = await Promise.all(
        rows.map(async (row) => {
          let url: string | undefined;
          if (row.storage_bucket && row.storage_path) {
            const { data: signed } = await supabase.storage
              .from(row.storage_bucket)
              .createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
            url = signed?.signedUrl;
          }
          return {
            id: row.id,
            name: row.file_name ?? "Файл",
            size: formatFileSize(row.file_size),
            created_at: row.created_at ?? new Date().toISOString(),
            url,
            uploadedBy: row.uploaded_by ?? null,
            uploadedByLabel:
              memberById.get(row.uploaded_by ?? "") ??
              (row.uploaded_by ? "Невідомий користувач" : undefined),
            storageBucket: row.storage_bucket ?? null,
            storagePath: row.storage_path ?? null,
          } satisfies QuoteAttachment;
        })
      );
      const isDesignVisualization = (file: QuoteAttachment) =>
        (file.storagePath ?? "").includes("design-outputs/");
      setAttachments(mapped.filter((file) => !isDesignVisualization(file)));
      setDesignVisualizations(mapped.filter((file) => isDesignVisualization(file)));
    } catch (e: unknown) {
      setAttachmentsError(getErrorMessage(e, "Не вдалося завантажити файли."));
      setAttachments([]);
      setDesignVisualizations([]);
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const uploadAttachments = async (files: FileList | null) => {
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
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error(getErrorMessage(userError, "Користувач не авторизований"));
      }
      const uploadedBy = userData.user.id;

      const failures: string[] = [];

      for (const file of allowed) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const baseName = `${Date.now()}-${safeName}`;
        const candidatePaths = [
          `teams/${teamId}/quote-attachments/${quoteId}/${baseName}`,
          `${teamId}/quote-attachments/${quoteId}/${baseName}`,
          `${uploadedBy}/quote-attachments/${quoteId}/${baseName}`,
          `${uploadedBy}/${teamId}/quote-attachments/${quoteId}/${baseName}`,
        ];

        let storagePath = "";
        let lastError: unknown = null;
        for (const candidate of candidatePaths) {
          const { error: uploadError } = await supabase.storage
            .from(ITEM_VISUAL_BUCKET)
            .upload(candidate, file, { upsert: true, contentType: file.type });
          if (!uploadError) {
            storagePath = candidate;
            lastError = null;
            break;
          }
          lastError = uploadError;
        }

        if (!storagePath) {
          failures.push(file.name);
          console.error("Attachment upload failed", lastError);
          continue;
        }

        const { error: insertError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .insert({
            team_id: teamId,
            quote_id: quoteId,
            file_name: file.name,
            mime_type: file.type || null,
            file_size: file.size,
            storage_bucket: ITEM_VISUAL_BUCKET,
            storage_path: storagePath,
            uploaded_by: uploadedBy,
          });

        if (insertError) {
          failures.push(file.name);
          console.error("Attachment insert failed", insertError);
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
    } catch (e: unknown) {
      setAttachmentsUploadError(getErrorMessage(e, "Не вдалося завантажити файли."));
    } finally {
      setAttachmentsUploading(false);
      if (attachmentsInputRef.current) {
        attachmentsInputRef.current.value = "";
      }
    }
  };

  const requestDeleteAttachment = (attachment: QuoteAttachment) => {
    if (attachmentsDeletingId) return;
    setDeleteAttachmentTarget(attachment);
    setDeleteAttachmentOpen(true);
  };

  const confirmDeleteAttachment = async () => {
    if (!deleteAttachmentTarget || attachmentsDeletingId) return;
    const attachment = deleteAttachmentTarget;
    setAttachmentsDeletingId(attachment.id);
    setAttachmentsDeleteError(null);
    try {
      if (attachment.storageBucket && attachment.storagePath) {
        const { error: storageError } = await supabase.storage
          .from(attachment.storageBucket)
          .remove([attachment.storagePath]);
        if (storageError) throw storageError;
      }

      const { error } = await supabase
        .schema("tosho")
        .from("quote_attachments")
        .delete()
        .eq("id", attachment.id);
      if (error) throw error;

      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
      setDeleteAttachmentOpen(false);
      setDeleteAttachmentTarget(null);
      toast.success("Файл видалено");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося видалити файл.");
      setAttachmentsDeleteError(message);
      toast.error("Помилка видалення", { description: message });
    } finally {
      setAttachmentsDeletingId(null);
    }
  };

  useEffect(() => {
    void loadQuote();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, teamId]);

  useEffect(() => {
    if (!teamId || !quoteId) return;
    let active = true;
    const loadMembership = async () => {
      try {
        const map = await listQuoteSetMemberships(teamId, [quoteId]);
        if (!active) return;
        setQuoteSetMembership(map.get(quoteId) ?? null);
      } catch {
        if (!active) return;
        setQuoteSetMembership(null);
      }
    };
    void loadMembership();
    return () => {
      active = false;
    };
  }, [quoteId, teamId]);

  useEffect(() => {
    void loadDesignTask();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, teamId]);

  useEffect(() => {
    if (!quote || quote.id !== quoteId || !teamId) {
      setDesignTaskCandidates([]);
      return;
    }
    void loadDesignTaskCandidates();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id, quoteId, teamId, designTask?.id]);

  useEffect(() => {
    if (!quote || quote.id !== quoteId || error) return;
    void loadHistory();
    void loadItems();
    void loadRuns();
    void loadAttachments();
    void loadComments();
    void loadActivityLog();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id, quoteId, error]);

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
    if (!teamId || !quoteId || !selectedDesignOutputFile || designVisualizationSyncing) return;
    const alreadyVisible = designVisualizations.some(
      (file) =>
        file.storageBucket === selectedDesignOutputFile.storage_bucket &&
        file.storagePath === selectedDesignOutputFile.storage_path
    );
    if (alreadyVisible) return;

    let active = true;
    const syncSelectedVisualization = async () => {
      setDesignVisualizationSyncing(true);
      try {
        const { data: existing, error: existingError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .select("id")
          .eq("quote_id", quoteId)
          .eq("storage_bucket", selectedDesignOutputFile.storage_bucket)
          .eq("storage_path", selectedDesignOutputFile.storage_path)
          .maybeSingle();
        if (existingError) throw existingError;

        if (!existing?.id) {
          const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert({
            team_id: teamId,
            quote_id: quoteId,
            file_name: selectedDesignOutputFile.file_name,
            mime_type: selectedDesignOutputFile.mime_type || null,
            file_size: selectedDesignOutputFile.file_size,
            storage_bucket: selectedDesignOutputFile.storage_bucket,
            storage_path: selectedDesignOutputFile.storage_path,
            uploaded_by: selectedDesignOutputFile.uploaded_by ?? userId ?? null,
          });
          if (insertError) throw insertError;
        }

        if (active) {
          await loadAttachments();
        }
      } catch (error) {
        console.warn("Failed to backfill selected design visualization into quote", error);
      } finally {
        if (active) {
          setDesignVisualizationSyncing(false);
        }
      }
    };

    void syncSelectedVisualization();
    return () => {
      active = false;
    };
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, quoteId, selectedDesignOutputFile, designVisualizations, userId]);

  useEffect(() => {
    if (itemAttachmentUploading) return;
    void loadAttachments();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemAttachmentUploading]);

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
    try {
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
      const updatedQuote = await updateQuote({
        quoteId: quote.id,
        teamId,
        deadlineAt: payload.deadline_at,
        deadlineNote: payload.deadline_note,
        deadlineReminderOffsetMinutes: payload.deadline_reminder_offset_minutes,
        deadlineReminderComment: payload.deadline_reminder_comment,
      });
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
        await logActivity({
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
        });
        await loadActivityLog();
      }
    } catch (e: unknown) {
      setDeadlineError(getErrorMessage(e, "Не вдалося оновити дедлайн."));
    } finally {
      setDeadlineSaving(false);
    }
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
    try {
      const updatedQuote = await updateQuote({
        quoteId: quote.id,
        teamId,
        customerDeadlineAt: field === "customer_deadline_at" ? nextValue : undefined,
        designDeadlineAt: field === "design_deadline_at" ? nextValue : undefined,
      });
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
      await logActivity({
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
      });
      await loadActivityLog();
    } catch (e: unknown) {
      setDeadlineError(getErrorMessage(e, "Не вдалося оновити дедлайн."));
    } finally {
      setDeadlineSaving(false);
    }
  };

  // Quick status change
  const handleQuickStatusChange = async (newStatus: string, noteOverride?: string) => {
    const nextStatus = normalizeStatus(newStatus);
    setStatusBusy(true);
    setStatusError(null);
    try {
      const previousStatus = normalizeStatus(quote?.status);
      const note = (noteOverride ?? statusNote).trim();
      await setStatus({
        quoteId,
        status: nextStatus,
        note: note ? note : undefined,
      });
      try {
        await notifyQuoteInitiatorOnStatusChange({
          quoteId,
          toStatus: nextStatus,
          actorUserId: userId ?? null,
        });
      } catch (notifyError) {
        console.warn("Failed to notify quote initiator about status change", notifyError);
      }
      await logActivity({
        teamId,
        action: "змінив статус",
        entityType: "quotes",
        entityId: quoteId,
        title: `Статус: ${formatStatusLabel(previousStatus)} → ${formatStatusLabel(nextStatus)}`,
        href: `/orders/estimates/${quoteId}`,
        metadata: { source: "quote_status", from: previousStatus, to: nextStatus, note },
      });
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
    } catch (e: unknown) {
      setStatusError(getErrorMessage(e, "Помилка зміни статусу"));
    } finally {
      setStatusBusy(false);
    }
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
    try {
      const sourceQuoteId = quote.id;
      const effectiveTeamId = quote.team_id ?? teamId;
      if (!effectiveTeamId) {
        throw new Error("Не вдалося визначити команду для дублювання.");
      }

      const created = await createQuote({
        teamId: effectiveTeamId,
        customerId: quote.customer_id ?? null,
        customerName: quote.customer_name ?? null,
        customerLogoUrl: quote.customer_logo_url ?? null,
        title: quote.title ?? null,
        quoteType: quote.quote_type ?? null,
        printType: quote.print_type ?? null,
        deliveryType: quote.delivery_type ?? null,
        deliveryDetails: quote.delivery_details ?? null,
        comment: quote.comment ?? null,
        designBrief: quote.design_brief ?? null,
        currency: quote.currency ?? "UAH",
        assignedTo: quote.assigned_to ?? null,
        deadlineAt: quote.deadline_at ?? null,
        customerDeadlineAt: quote.customer_deadline_at ?? null,
        designDeadlineAt: quote.design_deadline_at ?? null,
        deadlineNote: quote.deadline_note ?? null,
        deadlineReminderOffsetMinutes: quote.deadline_reminder_offset_minutes ?? null,
        deadlineReminderComment: quote.deadline_reminder_comment ?? null,
      });
      const newQuoteId = created?.id;
      if (!newQuoteId) throw new Error("Не вдалося створити дублікат прорахунку.");

      const loadSourceItems = async (withMetadata: boolean) =>
        await supabase
          .schema("tosho")
          .from("quote_items")
          .select(
            withMetadata
              ? "id,position,name,description,metadata,qty,unit,unit_price,line_total,catalog_type_id,catalog_kind_id,catalog_model_id,methods,attachment"
              : "id,position,name,description,qty,unit,unit_price,line_total,catalog_type_id,catalog_kind_id,catalog_model_id,methods,attachment"
          )
          .eq("quote_id", sourceQuoteId)
          .order("position", { ascending: true });
      let { data: sourceItems, error: sourceItemsError } = await loadSourceItems(true);
      if (
        sourceItemsError &&
        /column/i.test(sourceItemsError.message ?? "") &&
        /metadata/i.test(sourceItemsError.message ?? "")
      ) {
        ({ data: sourceItems, error: sourceItemsError } = await loadSourceItems(false));
      }
      if (sourceItemsError) throw sourceItemsError;

      const itemIdMap = new Map<string, string>();
      const itemRows = ((sourceItems as Array<Record<string, unknown>> | null) ?? []).map((row, index) => {
        const oldId = typeof row.id === "string" ? row.id : null;
        const nextId = crypto.randomUUID();
        if (oldId) itemIdMap.set(oldId, nextId);
        return {
          id: nextId,
          team_id: effectiveTeamId,
          quote_id: newQuoteId,
          position: Number(row.position ?? index + 1) || index + 1,
          name: (row.name as string | null) ?? "Позиція",
          description: (row.description as string | null) ?? null,
          metadata: ((row.metadata as Record<string, unknown> | null | undefined) ?? null),
          qty: Number(row.qty ?? 1) || 1,
          unit: normalizeUnitLabel(row.unit as string | null),
          unit_price: Number(row.unit_price ?? 0) || 0,
          line_total: Number(row.line_total ?? 0) || 0,
          catalog_type_id: (row.catalog_type_id as string | null) ?? null,
          catalog_kind_id: (row.catalog_kind_id as string | null) ?? null,
          catalog_model_id: (row.catalog_model_id as string | null) ?? null,
          methods: (row.methods as unknown) ?? null,
          attachment: (row.attachment as unknown) ?? null,
        };
      });
      if (itemRows.length > 0) {
        const { error: insertItemsError } = await supabase
          .schema("tosho")
          .from("quote_items")
          .insert(itemRows);
        if (insertItemsError) throw insertItemsError;
      }

      const sourceRuns = await getQuoteRuns(sourceQuoteId, effectiveTeamId);
      if (sourceRuns.length > 0) {
        const runsPayload: QuoteRun[] = sourceRuns.map((run) => ({
          quote_id: newQuoteId,
          quote_item_id: run.quote_item_id ? itemIdMap.get(run.quote_item_id) ?? null : null,
          quantity: Number(run.quantity ?? 1) || 1,
          unit_price_model: Number(run.unit_price_model ?? 0) || 0,
          unit_price_print: Number(run.unit_price_print ?? 0) || 0,
          logistics_cost: Number(run.logistics_cost ?? 0) || 0,
          desired_manager_income: Number(run.desired_manager_income ?? 0) || 0,
          manager_rate: Number(run.manager_rate ?? DEFAULT_MANAGER_RATE) || DEFAULT_MANAGER_RATE,
          fixed_cost_rate: Number(run.fixed_cost_rate ?? DEFAULT_FIXED_COST_RATE) || DEFAULT_FIXED_COST_RATE,
          vat_rate: Number(run.vat_rate ?? DEFAULT_VAT_RATE) || DEFAULT_VAT_RATE,
        }));
        await upsertQuoteRuns(newQuoteId, runsPayload);
      }

      const { data: sourceAttachments, error: sourceAttachmentsError } = await supabase
        .schema("tosho")
        .from("quote_attachments")
        .select("file_name,mime_type,file_size,storage_bucket,storage_path,uploaded_by")
        .eq("quote_id", sourceQuoteId);
      if (sourceAttachmentsError) throw sourceAttachmentsError;
      const attachmentRows = (sourceAttachments as Array<Record<string, unknown>> | null) ?? [];
      if (attachmentRows.length > 0) {
        const { error: insertAttachmentsError } = await supabase
          .schema("tosho")
          .from("quote_attachments")
          .insert(
            attachmentRows.map((row) => ({
              team_id: effectiveTeamId,
              quote_id: newQuoteId,
              file_name: (row.file_name as string | null) ?? null,
              mime_type: (row.mime_type as string | null) ?? null,
              file_size: (row.file_size as number | null) ?? null,
              storage_bucket: (row.storage_bucket as string | null) ?? null,
              storage_path: (row.storage_path as string | null) ?? null,
              uploaded_by: (row.uploaded_by as string | null) ?? null,
            }))
          );
        if (insertAttachmentsError) throw insertAttachmentsError;
      }

      toast.success("Прорахунок продубльовано");
      navigate(`/orders/estimates/${newQuoteId}`);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Не вдалося продублювати прорахунок."));
    } finally {
      setDuplicateQuoteBusy(false);
    }
  };

  const openEditQuote = () => {
    if (!quote) return;
    const primaryItem = items[0] ?? null;
    const primaryRuns =
      runs.length > 0
        ? runs
        : primaryItem && Number(primaryItem.qty ?? 0) > 0
          ? [
              {
                quantity: Number(primaryItem.qty ?? 0),
              },
            ]
          : [];

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
      },
      categoryId: primaryItem?.catalogTypeId ?? "",
      kindId: primaryItem?.catalogKindId ?? "",
      modelId: primaryItem?.catalogModelId ?? "",
      quantity:
        Number(primaryRuns[0]?.quantity ?? primaryItem?.qty ?? 0) > 0
          ? Number(primaryRuns[0]?.quantity ?? primaryItem?.qty ?? 0)
          : undefined,
      runs: primaryRuns
        .map((run) => ({ quantity: Number(run.quantity) || 0 }))
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
    try {
      const selectedParty = editQuoteCustomers.find(
        (item) => item.id === data.customerId && (item.entityType ?? "customer") === (data.customerType ?? "customer")
      );
      const customerIdForQuote = data.customerType === "lead" ? null : data.customerId?.trim() || null;
      const customerName =
        (selectedParty?.name || selectedParty?.legal_name || quote.customer_name || "").trim() || null;
      const customerLogoUrl = selectedParty?.logo_url ?? quote.customer_logo_url ?? null;
      const title = data.customerType === "lead" ? customerName : quote.title ?? null;

      await updateQuote({
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
      });

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
        const { error: itemError } = await supabase
          .schema("tosho")
          .from("quote_items")
          .update({
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
          })
          .eq("id", primaryItem.id);
        if (itemError) throw itemError;

        const { error: deleteRunsError } = await supabase
          .schema("tosho")
          .from("quote_item_runs")
          .delete()
          .eq("quote_id", quoteId);
        if (deleteRunsError) throw deleteRunsError;

        if (normalizedRuns.length > 0) {
          await upsertQuoteRuns(
            quoteId,
            normalizedRuns.map((run) => ({
              id: crypto.randomUUID(),
              quote_id: quoteId,
              quote_item_id: primaryItem.id,
              quantity: run.quantity,
              unit_price_model: 0,
              unit_price_print: 0,
              logistics_cost: 0,
              desired_manager_income: 0,
              manager_rate: DEFAULT_MANAGER_RATE,
              fixed_cost_rate: DEFAULT_FIXED_COST_RATE,
              vat_rate: DEFAULT_VAT_RATE,
            }))
          );
        }
      }

      if (data.createDesignTask && !designTask) {
        await createDesignTask({
          assigneeUserId: data.designAssigneeId ?? null,
          modelName: model?.name ?? primaryItem?.title ?? "Позиція",
          methodsCount: methodsPayload?.length ?? 0,
          designBrief: data.comment?.trim() || data.deadlineNote?.trim() || null,
        });
      }

      await Promise.all([loadQuote(), loadItems(), loadRuns()]);
      setEditQuoteDialogOpen(false);
      toast.success("Прорахунок оновлено");
    } catch (error: unknown) {
      setEditQuoteError(getErrorMessage(error, "Не вдалося оновити прорахунок."));
    } finally {
      setEditQuoteSaving(false);
    }
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
    try {
      const current = items.find((item) => item.id === itemId);
      if (!current) return;
      const unitPrice = Number(current.price ?? 0) || 0;
      const { error } = await supabase
        .schema("tosho")
        .from("quote_items")
        .update({
          qty: newQty,
          line_total: unitPrice * newQty,
        })
        .eq("id", itemId);
      if (error) throw error;
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
    setEditingItemId(item.id);
    setItemTitle(item.title);
    setItemQty(String(item.qty));
    setItemUnit(normalizeUnitLabel(item.unit));
    setItemPrice(String(item.price));
    setItemDescription(item.description ?? "");
    setItemTypeId(item.catalogTypeId ?? item.productTypeId ?? "");
    setItemKindId(item.catalogKindId ?? item.productKindId ?? "");
    setItemModelId(item.catalogModelId ?? item.productModelId ?? "");
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
  void openEditItem;

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
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error(getErrorMessage(userError, "User not authenticated"));
      }
      const uploadedBy = userData.user.id;
      const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", uploadedBy)
        .eq("team_id", effectiveTeamId)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) {
        throw new Error("Користувач не є членом команди для цього прорахунку.");
      }

      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const baseName = `${Date.now()}-${safeName}`;
      const candidatePaths = [
        `teams/${effectiveTeamId}/quote-items/${quoteId}/${baseName}`,
        `${effectiveTeamId}/quote-items/${quoteId}/${baseName}`,
        `${uploadedBy}/quote-items/${quoteId}/${baseName}`,
        `${uploadedBy}/${effectiveTeamId}/quote-items/${quoteId}/${baseName}`,
      ];

      let path = "";
      let lastError: unknown = null;
      for (const candidate of candidatePaths) {
        const { error: uploadError } = await supabase.storage
          .from(ITEM_VISUAL_BUCKET)
          .upload(candidate, file, { upsert: true, contentType: file.type });
        if (!uploadError) {
          path = candidate;
          lastError = null;
          break;
        }
        lastError = uploadError;
      }
      if (!path) {
        throw lastError ?? new Error("Не вдалося завантажити файл");
      }

      const { data: signed, error: signedError } = await supabase.storage
        .from(ITEM_VISUAL_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signedError) throw signedError;
      const publicUrl = signed.signedUrl;

      const { data: attachmentRow, error: attachError } = await supabase
        .schema("tosho")
        .from("quote_attachments")
        .insert({
          team_id: effectiveTeamId,
          quote_id: quoteId,
          file_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          storage_bucket: ITEM_VISUAL_BUCKET,
          storage_path: path,
          uploaded_by: uploadedBy,
        })
        .select("id,file_name,file_size,created_at")
        .single();
      if (attachError) throw attachError;

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
    } catch (error: unknown) {
      setItemAttachmentError(getErrorMessage(error, "Не вдалося завантажити файл"));
      setItemAttachment(null);
    } finally {
      setItemAttachmentUploading(false);
    }
  };

  useEffect(() => {
    if (itemFormMode !== "advanced") return;
    if (!itemModelId) return;
    const modelLabel = getModelLabel(catalogTypes, itemTypeId, itemKindId, itemModelId) ?? "";
    if (!modelLabel) return;
    if (!itemTitle.trim() || itemTitle === lastAutoTitle) {
      setItemTitle(modelLabel);
      setLastAutoTitle(modelLabel);
    }
  }, [catalogTypes, itemFormMode, itemTypeId, itemKindId, itemModelId, itemTitle, lastAutoTitle]);

  useEffect(() => {
    if (itemFormMode !== "advanced") return;
    if (!itemModelId) return;
    if (autoMethodsApplied) return;
    if (availableMethods.length === 0) return;
    setItemMethods([{ id: createLocalId(), methodId: availableMethods[0].id, count: 1 }]);
    setAutoMethodsApplied(true);
  }, [itemFormMode, itemModelId, availableMethods, autoMethodsApplied]);

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
    const existingItemMetadata =
      editingItemId ? items.find((item) => item.id === editingItemId)?.metadata ?? null : null;

    const newItem: QuoteItem = {
      id: editingItemId || createLocalId(),
      position: undefined,
      title: itemTitle.trim(),
      qty: Math.max(1, Number(itemQty) || 1),
      unit: normalizeUnitLabel(itemUnit),
      price: computedItemPrice,
      description: itemDescription.trim() || undefined,
      metadata: existingItemMetadata,
      catalogTypeId: itemFormMode === "advanced" ? itemTypeId : undefined,
      catalogKindId: itemFormMode === "advanced" ? itemKindId : undefined,
      catalogModelId: itemFormMode === "advanced" ? itemModelId : undefined,
      productTypeId: itemFormMode === "advanced" ? itemTypeId : undefined,
      productKindId: itemFormMode === "advanced" ? itemKindId : undefined,
      productModelId: itemFormMode === "advanced" ? itemModelId : undefined,
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

    try {
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
        let { error } = await supabase
          .schema("tosho")
          .from("quote_items")
          .update(updatePayload)
          .eq("id", editingItemId);
        if (error && /column/i.test(error.message ?? "") && /metadata/i.test(error.message ?? "")) {
          ({ error } = await supabase
            .schema("tosho")
            .from("quote_items")
            .update({
              name: newItem.title,
              description: newItem.description ?? null,
              qty: newItem.qty,
              unit: normalizeUnitLabel(newItem.unit),
              unit_price: newItem.price,
              line_total: newItem.qty * newItem.price,
              catalog_type_id: newItem.catalogTypeId ?? null,
              catalog_kind_id: newItem.catalogKindId ?? null,
              catalog_model_id: newItem.catalogModelId ?? null,
              methods: methodsPayload,
              attachment: attachmentPayload,
            })
            .eq("id", editingItemId));
        }
        if (error) throw error;
        setItems((prev) =>
          prev.map((item) => (item.id === editingItemId ? newItem : item))
        );
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
        let { data, error } = await supabase
          .schema("tosho")
          .from("quote_items")
          .insert(insertPayload)
          .select("id, position, name, description, metadata, qty, unit, unit_price, methods, attachment")
          .single();
        if (error && /column/i.test(error.message ?? "") && /metadata/i.test(error.message ?? "")) {
          ({ data, error } = await supabase
            .schema("tosho")
            .from("quote_items")
            .insert({
              id: newId,
              team_id: effectiveTeamId,
              quote_id: quoteId,
              position: nextPosition,
              name: newItem.title,
              description: newItem.description ?? null,
              qty: newItem.qty,
              unit: normalizeUnitLabel(newItem.unit),
              unit_price: newItem.price,
              line_total: newItem.qty * newItem.price,
              catalog_type_id: newItem.catalogTypeId ?? null,
              catalog_kind_id: newItem.catalogKindId ?? null,
              catalog_model_id: newItem.catalogModelId ?? null,
              methods: methodsPayload,
              attachment: attachmentPayload,
            })
            .select("id, position, name, description, qty, unit, unit_price, methods, attachment")
            .single());
        }
        if (error) throw error;
        const inserted: QuoteItem = {
          ...newItem,
          id: data?.id ?? newId,
          position: data?.position ?? nextPosition,
          qty: Number(data?.qty ?? newItem.qty),
          unit: normalizeUnitLabel((data?.unit as string | null | undefined) ?? newItem.unit),
          price: Number(data?.unit_price ?? newItem.price),
          description: data?.description ?? newItem.description,
          metadata: parseQuoteItemMetadata((data as Record<string, unknown> | null | undefined)?.metadata) ?? newItem.metadata ?? null,
        };
        setItems((prev) => [...prev, inserted]);
      }
      setItemModalOpen(false);
    } catch (e: unknown) {
      setItemsError(getErrorMessage(e, "Не вдалося зберегти позицію."));
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    try {
      const { error } = await supabase
        .schema("tosho")
        .from("quote_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    } catch (e: unknown) {
      setItemsError(getErrorMessage(e, "Не вдалося видалити позицію."));
    }
  };
  void handleDeleteItem;

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
    try {
      const invokeQuoteCommentsFunction = async (payload: Record<string, unknown>) => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Не вдалося визначити сесію користувача.");

        const response = await fetch("/.netlify/functions/quote-comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        let parsed: Record<string, unknown> = {};
        if (rawText) {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            parsed = {};
          }
        }

        if (!response.ok) {
          const parsedError = typeof parsed.error === "string" ? parsed.error : null;
          throw new Error(parsedError || `HTTP ${response.status}`);
        }

        return parsed;
      };

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      if (!userId) {
        throw new Error("Не вдалося визначити користувача.");
      }
      const effectiveTeamId = quote?.team_id ?? teamId;
      if (!effectiveTeamId) {
        throw new Error("Немає доступної команди.");
      }

      const mentionKeys = extractMentionKeys(body);
      const hasMentionsInBody = mentionKeys.length > 0;
      const mentionedUserIds = new Set<string>();
      for (const mentionKey of mentionKeys) {
        const candidates = mentionLookup.get(mentionKey);
        if (!candidates || candidates.size !== 1) continue;
        const [mentionedUserId] = Array.from(candidates);
        if (mentionedUserId && mentionedUserId !== userId) {
          mentionedUserIds.add(mentionedUserId);
        }
      }
      const mentionUserIdsList = Array.from(mentionedUserIds);
      let mentionsHandledViaServer = false;

      let { data, error } = await supabase
        .schema("tosho")
        .from("quote_comments")
        .insert({
          team_id: effectiveTeamId,
          quote_id: quoteId,
          body,
          created_by: userId,
        })
        .select("id,body,created_at,created_by")
        .single();
      if (error) {
        if (shouldUseCommentsFallback(error.message)) {
          const fallback = await invokeQuoteCommentsFunction({
            mode: "add",
            quoteId,
            body,
            mentionedUserIds: mentionUserIdsList,
          });
          data = (fallback?.comment as InsertedCommentRow | null) ?? null;
          if (hasMentionsInBody) {
            mentionsHandledViaServer = !fallback?.mentionError;
          }
          error = null;
        } else {
          throw error;
        }
      }

      const inserted = data as InsertedCommentRow;
      setComments((prev) => [
        {
          id: inserted.id,
          body: inserted.body ?? body,
          created_at: inserted.created_at ?? new Date().toISOString(),
          created_by: inserted.created_by ?? userId,
        },
        ...prev,
      ]);

      if (hasMentionsInBody && !mentionsHandledViaServer) {
        try {
          await invokeQuoteCommentsFunction({
            mode: "notify_mentions",
            quoteId,
            body,
            mentionedUserIds: mentionUserIdsList,
          });
          mentionsHandledViaServer = true;
        } catch (notifyError) {
          const actorLabel = memberById.get(userId) ?? "Користувач";
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
    } catch (e: unknown) {
      setCommentsError(getErrorMessage(e, "Не вдалося додати коментар."));
    } finally {
      setCommentSaving(false);
    }
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

  if (loading) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо прорахунок." />;
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

  return (
    <div className="text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-transparent">
        <div className="px-4 py-2 md:px-5 lg:px-6">
          <div className="flex min-h-10 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
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

              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="truncate text-[17px] font-semibold text-foreground">
                    {quote.number ?? quote.id}
                  </div>
                  {(() => {
                    const Icon = quoteTypeIcon(quote.quote_type);
                    return (
                      <div className="inline-flex h-6 items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2 text-[10px] font-semibold text-primary">
                        {Icon ? <Icon className="h-3 w-3" /> : null}
                        {quoteTypeLabel(quote.quote_type)}
                      </div>
                    );
                  })()}
                  <Badge className={cn("border", statusClasses[currentStatus] ?? statusClasses.new)}>
                    {formatStatusLabel(currentStatus)}
                  </Badge>
                  {quoteViewers.length > 0 ? (
                    <div className="ml-1 inline-flex items-center gap-1.5 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      <div className="flex items-center -space-x-1.5">
                        {quoteViewers.slice(0, 4).map((viewer) => (
                          <AvatarBase
                            key={viewer.userId}
                            src={viewer.avatarUrl}
                            name={viewer.displayName}
                            fallback={viewer.displayName.slice(0, 2).toUpperCase()}
                            size={20}
                            className="border-2 border-background"
                            fallbackClassName="text-[9px] font-semibold"
                          />
                        ))}
                      </div>
                      {quoteViewers.length > 4 ? (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          +{quoteViewers.length - 4}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {!designTask && !designTaskLoading ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2"
                  disabled={designTaskSaving}
                  onClick={() => void createDesignTask()}
                >
                  <Palette className="h-4 w-4" />
                  {designTaskSaving ? "Створення..." : "Створити дизайн-задачу"}
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                className="h-8 gap-2"
                disabled={statusBusy || quoteLockedByOther || quoteRequirements.length > 0}
                onClick={handlePrimaryStatusAction}
              >
                {createElement(statusIcons[nextAction.nextStatus ?? currentStatus] ?? Clock, {
                  className: "h-4 w-4",
                })}
                {nextAction.ctaLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2"
                disabled={statusBusy || quoteLockedByOther || quoteRequirements.length > 0}
                onClick={openStatusDialog}
              >
                Змінити статус
                <ChevronDown className="h-3 w-3" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={!quote}
                    onSelect={(event) => {
                      event.preventDefault();
                      openEditQuote();
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Редагувати
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={duplicateQuoteBusy || !quote?.id}
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

      <div className="flex w-full flex-col gap-6 px-4 pb-10 pt-2 md:px-5 lg:px-6 2xl:flex-row 2xl:gap-8">
        <main className="min-w-0 flex-1">
          <div className="space-y-6">
            {quoteLockedByOther || statusError || quoteRequirementsHint || (quoteSetMembership && (quoteSetMembership.kp_count > 0 || quoteSetMembership.set_count > 0)) ? (
              <div className="space-y-3">
                {quoteLockedByOther ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <span className="font-medium">Режим лише перегляду.</span>{" "}
                    Запис редагує {quoteLock.holderName ?? "інший користувач"}.
                  </div>
                ) : null}

                {statusError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <XCircle className="h-4 w-4" />
                    {statusError}
                  </div>
                )}

                {quoteRequirementsHint ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <span className="font-medium">Прорахунок не готовий до збереження або зміни статусу.</span>{" "}
                    {quoteRequirementsHint}
                  </div>
                ) : null}

                {quoteSetMembership && (quoteSetMembership.kp_count > 0 || quoteSetMembership.set_count > 0) ? (
                  <div className="flex flex-wrap gap-2">
                    {quoteSetMembership.kp_names.map((name) => (
                      <QuoteKindBadge key={`kp-${name}`} kind="kp" label={name} />
                    ))}
                    {quoteSetMembership.set_names.map((name) => (
                      <QuoteKindBadge key={`set-${name}`} kind="set" label={name} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <details open className="group py-2">
              <summary className="mb-3 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Специфікація</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про специфікацію"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Зафіксована модель і параметри позиції. Щоб змінити специфікацію, створіть новий прорахунок.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Lock className="h-3.5 w-3.5" />
                    Зафіксовано
                  </Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </div>
              </summary>

              {items.length === 0 && (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30" />
                  <div>
                    <p className="font-medium">Модель не обрана</p>
                    <p className="text-sm text-muted-foreground">Оберіть модель для розрахунку</p>
                  </div>
                  <Button size="sm" onClick={openNewItem} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Обрати модель
                  </Button>
                </div>
              )}

              {itemsLoading ? (
                <AppSectionLoader label="Завантаження..." />
              ) : itemsError ? (
                <div className="py-4 text-sm text-destructive">{itemsError}</div>
              ) : items.length === 0 ? null : (
                <div>
                  {items.slice(0, 1).map((item) => {
                    const resolvedTypeId = item.catalogTypeId ?? item.productTypeId;
                    const resolvedKindId = item.catalogKindId ?? item.productKindId;
                    const resolvedModelId = item.catalogModelId ?? item.productModelId;
                    const typeLabel = getTypeLabel(catalogTypes, resolvedTypeId);
                    const kindLabel = getKindLabel(catalogTypes, resolvedTypeId, resolvedKindId);
                    const modelLabel = getModelLabel(
                      catalogTypes,
                      resolvedTypeId,
                      resolvedKindId,
                      resolvedModelId
                    );
                    const metaLine = [typeLabel, kindLabel, modelLabel].filter(Boolean).join(" / ");
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
                    const catalogImage = getModelImage(
                      catalogTypes,
                      resolvedTypeId,
                      resolvedKindId,
                      resolvedModelId
                    );
                    const productPreview = catalogImage
                      ? { type: "image" as const, url: catalogImage }
                      : null;
                    const printProductConfig = getPrintProductConfig(item.metadata);
                    const packageSummary = printProductConfig ? formatPrintProductSummary(printProductConfig) : [];
                    const packageSections = printProductConfig ? getPrintProductDetailSections(printProductConfig) : [];
                    const shouldShowDescription =
                      item.description && (!packageSummary.length || item.description !== packageSummary.join(" • "));
                    const isMerchQuote = (quote?.quote_type ?? "") === "merch";
                    const specRuns = runs.length > 0
                      ? runs
                          .map((run) => Number(run.quantity) || 0)
                          .filter((qty) => qty > 0)
                      : item.qty > 0
                      ? [item.qty]
                      : [];

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
                                getMethodLabel(
                                  catalogTypes,
                                  item.catalogTypeId,
                                  item.catalogKindId,
                                  method.methodId
                                ) ?? "Метод";
                              const place =
                                getPrintPositionLabel(
                                  catalogTypes,
                                  item.catalogTypeId,
                                  item.catalogKindId,
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

                    return (
                      <div key={item.id} className="py-5">
                        <div className="flex items-start gap-4">
                          <div className="shrink-0">
                            {productPreview?.type === "image" ? (
                              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-muted/20">
                                <KanbanImageZoomPreview
                                  imageUrl={productPreview.url}
                                  alt={modelLabel ?? "Товар"}
                                  className="h-16 w-16 rounded-xl object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border/40 bg-muted/40">
                                <Package className="h-6 w-6 text-muted-foreground/50" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="truncate text-base font-semibold text-foreground">{item.title}</div>
                                {metaLine ? (
                                  <div className="mt-1 text-sm text-muted-foreground">{metaLine}</div>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap justify-end gap-2">
                                {specRuns.map((qty, index) => {
                                  const isActiveRun =
                                    selectedRun && (Number(selectedRun.quantity) || 0) === qty;
                                  return (
                                    <div
                                      key={`${item.id}:spec-run:${qty}:${index}`}
                                      className={cn(
                                        "rounded-lg border px-3 py-2",
                                        isActiveRun
                                          ? "border-primary/40 bg-primary/10"
                                          : "border-border/50 bg-muted/10"
                                      )}
                                    >
                                      <div className="flex items-baseline gap-1.5">
                                        <div className="text-lg font-semibold tabular-nums text-foreground">
                                          {qty}
                                        </div>
                                        <div className="text-[11px] font-medium text-muted-foreground">
                                          {normalizeUnitLabel(item.unit)}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {renderedSections.length > 0 ? (
                              <div className="mt-5 grid gap-6 lg:grid-cols-3">
                                {renderedSections.map((section) => (
                                  <div
                                    key={section.title}
                                    className="min-w-0 space-y-3"
                                  >
                                    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                      {section.title}
                                    </div>
                                    <div className="space-y-3">
                                      {section.fields.map((field) => (
                                        <div
                                          key={`${section.title}:${field.label}`}
                                          className="space-y-1"
                                        >
                                          <span className="text-xs font-medium text-muted-foreground">
                                            {field.label}
                                          </span>
                                          <div className="text-sm font-semibold text-foreground">
                                            {field.value}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}

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
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </details>

            <details open className="group py-2">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Тиражі</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про тиражі"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Тиражі для розрахунку цін і підсумкової суми по прорахунку.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {canEditRuns ? (
                    <Button variant="ghost" size="sm" onClick={addRun} className="h-8 gap-1.5 px-2.5 text-xs">
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

              {runsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Завантаження...</span>
                </div>
              ) : runsError ? (
                <div className="py-4 text-sm text-destructive">{runsError}</div>
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Немає тиражів</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Додайте тираж для розрахунку вартості</p>
                  </div>
                  {canEditRuns ? (
                    <Button size="sm" variant="outline" onClick={addRun} className="mt-1 h-8 gap-1.5 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Додати тираж
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="hidden items-center gap-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground 2xl:grid 2xl:grid-cols-[150px_minmax(92px,110px)_minmax(120px,138px)_minmax(150px,176px)_minmax(120px,138px)_minmax(160px,1fr)_32px]">
                      <div>Тираж</div>
                      <div>Кількість</div>
                      <div>{`Ціна модель (${quote.currency})`}</div>
                      <div>{`Ціна нанесення (${quote.currency})`}</div>
                      <div>{`Доставка (${quote.currency})`}</div>
                      <div className="text-right">Сума</div>
                      <div />
                    </div>

                    {runs.map((run, idx) => {
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
                          <div className="grid items-center gap-3 2xl:grid-cols-[150px_minmax(92px,110px)_minmax(120px,138px)_minmax(150px,176px)_minmax(120px,138px)_minmax(160px,1fr)_32px]">
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
                                  {`Тираж ${idx + 1}`}
                                </div>
                                {isSelected ? (
                                  <div className="mt-0.5 text-[11px] font-medium text-primary">
                                    Активний
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground 2xl:hidden">Кількість</div>
                              <Input
                                type="number"
                                className="h-8 cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background"
                                value={run.quantity ?? ""}
                                disabled={disabled}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateRunRaw(idx, "quantity", e.target.value)}
                                onFocus={(e) => {
                                  if (run.quantity === 0) e.target.select();
                                }}
                                min={1}
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground 2xl:hidden">
                                Ціна модель <span className="ml-1 text-muted-foreground/60">{quote.currency}</span>
                              </div>
                              <Input
                                type="number"
                                className="h-8 cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background"
                                value={run.unit_price_model ?? ""}
                                disabled={disabled}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateRunRaw(idx, "unit_price_model", e.target.value)}
                                onFocus={(e) => {
                                  if (run.unit_price_model === 0) e.target.select();
                                }}
                                min={0}
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground 2xl:hidden">
                                Ціна нанесення <span className="ml-1 text-muted-foreground/60">{quote.currency}</span>
                              </div>
                              <Input
                                type="number"
                                className="h-8 cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background"
                                value={run.unit_price_print ?? ""}
                                disabled={disabled}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateRunRaw(idx, "unit_price_print", e.target.value)}
                                onFocus={(e) => {
                                  if (run.unit_price_print === 0) e.target.select();
                                }}
                                min={0}
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="text-[11px] font-medium text-muted-foreground 2xl:hidden">
                                Доставка <span className="ml-1 text-muted-foreground/60">{quote.currency}</span>
                              </div>
                              <Input
                                type="number"
                                className="h-8 cursor-text border-transparent bg-muted/15 px-2 font-mono text-sm hover:border-border focus:border-border focus:bg-background placeholder:text-muted-foreground/40"
                                value={run.logistics_cost ?? ""}
                                disabled={disabled}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateRunRaw(idx, "logistics_cost", e.target.value)}
                                onFocus={(e) => {
                                  if (!run.logistics_cost || Number(run.logistics_cost) === 0) e.target.select();
                                }}
                                placeholder="—"
                                min={0}
                              />
                            </div>

                            <div className="min-w-0 text-right">
                              <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                                {formatCurrency(total, quote.currency)}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                ({formatCurrencyCompact(modelPrice, quote.currency)} +{" "}
                                {formatCurrencyCompact(printPrice, quote.currency)}) × {qty}
                              </div>
                            </div>

                            <div className="flex justify-end">
                              {!disabled ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
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
                      );
                    })}
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
                        onClick={saveRuns}
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

            <details open className="group py-2">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Дедлайни та задача</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про дедлайни та задачу"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Ключові дати прорахунку, нагадування і постановка задачі для дизайну.
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="space-y-4">
                <Tabs defaultValue="internal" className="w-full">
                  <TabsList className="mb-5 grid h-auto w-full grid-cols-1 auto-rows-fr gap-2 border-0 bg-transparent p-0 shadow-none md:grid-cols-3">
                    <TabsTrigger
                      value="customer"
                      className="flex h-full min-h-[96px] flex-col items-start justify-between rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-4 text-left transition-colors hover:border-border/70 hover:bg-muted/[0.04] data-[state=active]:border-primary/30 data-[state=active]:bg-primary/[0.04] data-[state=active]:shadow-none"
                    >
                      <div className="relative flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Дедлайн замовника</div>
                        <span className="peer inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground">
                          <CircleHelp className="h-3.5 w-3.5" />
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100">
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
                          <Badge variant="outline" className="h-6 px-2 text-[11px] quote-neutral-badge">
                            Не вказано
                          </Badge>
                        )}
                      </div>
                    </TabsTrigger>

                    <TabsTrigger
                      value="internal"
                      className="flex h-full min-h-[96px] flex-col items-start justify-between rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-4 text-left transition-colors hover:border-border/70 hover:bg-muted/[0.04] data-[state=active]:border-primary/30 data-[state=active]:bg-primary/[0.04] data-[state=active]:shadow-none"
                    >
                      <div className="relative flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Внутрішній дедлайн</div>
                        <span className="peer inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground">
                          <CircleHelp className="h-3.5 w-3.5" />
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100">
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
                      className="flex h-full min-h-[96px] flex-col items-start justify-between rounded-xl border border-border/40 bg-muted/[0.02] px-4 py-4 text-left transition-colors hover:border-border/70 hover:bg-muted/[0.04] data-[state=active]:border-primary/30 data-[state=active]:bg-primary/[0.04] data-[state=active]:shadow-none"
                    >
                      <div className="relative flex items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Дедлайн дизайну</div>
                        <span className="peer inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground">
                          <CircleHelp className="h-3.5 w-3.5" />
                        </span>
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100">
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
                          <Badge variant="outline" className="h-6 px-2 text-[11px] quote-neutral-badge">
                            Не вказано
                          </Badge>
                        )}
                      </div>
                    </TabsTrigger>
                  </TabsList>

                  <div className="p-0">
                    <TabsContent value="customer" className="mt-0">
                      <div className="grid max-w-[560px] gap-2 sm:grid-cols-[minmax(0,1fr)_112px_40px]">
                        <Popover open={customerDeadlinePopoverOpen} onOpenChange={setCustomerDeadlinePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 w-full justify-start gap-2 border-border/40 bg-muted/[0.03] font-normal hover:bg-muted/[0.06]"
                              onClick={() => setCustomerDeadlinePopoverOpen(true)}
                            >
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
                              initialFocus
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
                        <Input
                          type="time"
                          className="h-9 w-full border-border/40 bg-muted/[0.03]"
                          value={customerDeadlineTime}
                          onChange={(e) => setCustomerDeadlineTime(e.target.value)}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-10 border-border/40 bg-muted/[0.03]"
                          onClick={() =>
                            void handleSaveSecondaryDeadline("customer_deadline_at", {
                              date: customerDeadlineDate,
                              time: customerDeadlineTime,
                              title: "Дедлайн Замовника",
                              action: "змінив дедлайн замовника",
                            })
                          }
                          disabled={deadlineSaving || !customerDeadlineDate}
                          aria-label="Зберегти дедлайн замовника"
                        >
                          {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="internal" className="mt-0">
                      <div className="max-w-[560px] space-y-2">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px_40px]">
                          <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="h-9 w-full justify-start gap-2 border-border/40 bg-muted/[0.03] font-normal hover:bg-muted/[0.06]"
                                onClick={() => setDeadlinePopoverOpen(true)}
                              >
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
                                initialFocus
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
                          <Input
                            type="time"
                            className="h-9 w-full border-border/40 bg-muted/[0.03]"
                            value={deadlineTime}
                            onChange={(e) => setDeadlineTime(e.target.value)}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-10 border-border/40 bg-muted/[0.03]"
                            onClick={() => void handleSaveDeadline()}
                            disabled={deadlineSaving}
                            aria-label="Зберегти дедлайн прорахунку"
                          >
                            {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
                          <Select
                            value={deadlineReminderOffset}
                            onValueChange={(value) => {
                              setDeadlineReminderOffset(value);
                              void handleSaveDeadline({ reminderOffset: value });
                            }}
                          >
                            <SelectTrigger className="h-9 border-border/40 bg-muted/[0.03]">
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
                          <Input
                            className="h-9 border-border/40 bg-muted/[0.03]"
                            placeholder="Текст нагадування"
                            value={deadlineReminderComment}
                            onChange={(e) => setDeadlineReminderComment(e.target.value)}
                            maxLength={200}
                          />
                        </div>
                        <Input
                          className="h-9 max-w-[520px] border-border/40 bg-muted/[0.03]"
                          placeholder="Коментар до внутрішнього дедлайну"
                          value={deadlineNote}
                          onChange={(e) => setDeadlineNote(e.target.value)}
                          maxLength={200}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="design" className="mt-0">
                      <div className="grid max-w-[560px] gap-2 sm:grid-cols-[minmax(0,1fr)_112px_40px]">
                        <Popover open={designDeadlinePopoverOpen} onOpenChange={setDesignDeadlinePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-9 w-full justify-start gap-2 border-border/40 bg-muted/[0.03] font-normal hover:bg-muted/[0.06]"
                              onClick={() => setDesignDeadlinePopoverOpen(true)}
                            >
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
                              initialFocus
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
                        <Input
                          type="time"
                          className="h-9 w-full border-border/40 bg-muted/[0.03]"
                          value={designDeadlineTime}
                          onChange={(e) => setDesignDeadlineTime(e.target.value)}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-10 border-border/40 bg-muted/[0.03]"
                          onClick={() =>
                            void handleSaveSecondaryDeadline("design_deadline_at", {
                              date: designDeadlineDate,
                              time: designDeadlineTime,
                              title: "Дедлайн дизайну",
                              action: "змінив дедлайн дизайну",
                            })
                          }
                          disabled={deadlineSaving || !designDeadlineDate}
                          aria-label="Зберегти дедлайн дизайну"
                        >
                          {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>

              {deadlineError && <div className="mt-4 text-xs text-destructive">{deadlineError}</div>}
              {updatedMinutes !== null && <></>}
            </details>

            <details open className="group py-2">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Palette className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Дизайн</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про дизайн"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      ТЗ для дизайнера, превʼю задачі і готові візуалізації в одному місці.
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <Tabs defaultValue="brief" className="w-full">
                <TabsList className="mb-5 h-auto justify-start rounded-none border-0 border-b border-border/30 bg-transparent p-0 shadow-none">
                  <TabsTrigger
                    value="brief"
                    className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    ТЗ
                  </TabsTrigger>
                  <TabsTrigger
                    value="visuals"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    Візуалізації
                    <span className="ml-2 text-xs text-muted-foreground">{visibleDesignVisualizations.length}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="task"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    Задача
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBriefText(
                            [
                              "Мета:",
                              "Аудиторія:",
                              "Формат/носій:",
                              "Розмір/пропорції:",
                              "Лого/брендгайд:",
                              "Кольори/шрифти:",
                              "Референси:",
                              "Текст/копі:",
                              "Обмеження:",
                            ].join("\n")
                          );
                          setBriefDirty(true);
                          setBriefError(null);
                        }}
                      >
                        Шаблон
                      </Button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                      <div className="space-y-3">
                        <Textarea
                          value={briefText}
                          onChange={(event) => {
                            setBriefText(event.target.value);
                            setBriefDirty(true);
                          }}
                          placeholder="Опишіть задачу для дизайнера. Тут тільки зміст задачі, без дедлайнів."
                          className="min-h-[220px] resize-y border-border/40 bg-muted/[0.03]"
                        />
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

                      <div className="rounded-xl border border-border/30 bg-muted/[0.02] px-4 py-4">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">Превʼю задачі</div>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {designBriefPreview || "Спочатку вкажіть дедлайн дизайну або текст задачі."}
                        </div>
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
                        const extension = getFileExtension(file.name);
                        const previewImage = Boolean(file.url) && canPreviewImage(extension);
                        const isSelectedVisualization =
                          (selectedDesignOutputStoragePath && file.storagePath === selectedDesignOutputStoragePath) ||
                          (selectedDesignOutputFileName && file.name === selectedDesignOutputFileName);
                        return (
                          <div key={file.id} className="group rounded-xl border border-border/40 p-3 transition-colors hover:bg-muted/10">
                            <button
                              type="button"
                              className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-muted/20 text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:hover:scale-100"
                              onClick={() => {
                                if (previewImage && file.url) {
                                  setVisualizationPreview(file);
                                }
                              }}
                              disabled={!previewImage || !file.url}
                              aria-label={previewImage && file.url ? `Переглянути ${file.name}` : file.name}
                            >
                              {previewImage && file.url ? (
                                <KanbanImageZoomPreview
                                  imageUrl={file.url ?? ""}
                                  alt={file.name}
                                  className="h-40 w-full rounded-lg object-cover"
                                />
                              ) : (
                                <div className="text-xs text-muted-foreground">{extension}</div>
                              )}
                            </button>
                            <div className="mt-3 truncate text-sm font-medium text-foreground" title={file.name}>
                              {file.name}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="text-xs text-muted-foreground">
                                {extension ? extension.toUpperCase() : "Файл"}
                              </div>
                              {isSelectedVisualization ? (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-success/40 bg-success/10 px-2 text-[10px] text-success-foreground"
                                >
                                  Обрано
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              {file.url ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void downloadFileToDevice(file.url!, file.name)}
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
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-foreground">Дизайн-задача</div>
                        {selectedDesignOutputFileName ? (
                          <div className="text-xs text-muted-foreground">
                            Обраний візуал: <span className="font-medium text-foreground">{selectedDesignOutputFileName}</span>
                          </div>
                        ) : null}
                        <div className="max-w-[360px]">
                          <div className="mb-2 text-xs font-medium text-muted-foreground">Виконавець</div>
                          <Select
                            value={designAssigneeId ?? "none"}
                            onValueChange={(value) => void updateDesignAssignee(value === "none" ? null : value)}
                            disabled={designTaskSaving}
                          >
                            <SelectTrigger className="h-9 w-full border-border/40 bg-muted/[0.03]">
                              {designAssigneeId ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  <AvatarBase
                                    src={memberAvatarById.get(designAssigneeId) ?? null}
                                    name={memberById.get(designAssigneeId) ?? designAssigneeId}
                                    fallback={getInitials(memberById.get(designAssigneeId) ?? designAssigneeId)}
                                    size={20}
                                    className="text-[9px] font-semibold"
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
                                        className="text-[9px] font-semibold"
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
                  ) : (
                    <div className="space-y-3 rounded-xl border border-dashed border-border/40 bg-muted/[0.02] px-4 py-5">
                      <div className="text-sm font-medium text-foreground">
                        Дизайн-задача ще не створена
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Створи нову задачу або привʼяжи існуючу дизайн-задачу цього ж замовника.
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void createDesignTask()} disabled={designTaskSaving}>
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
            </details>

            <details open className="group py-2">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Обговорення</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про обговорення"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Загальні коментарі, вкладення від замовника і журнал активності по прорахунку.
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <Tabs defaultValue="comments" className="w-full">
                <TabsList className="mb-5 h-auto w-full justify-start rounded-none border-0 border-b border-border/30 bg-transparent p-0 shadow-none">
                  <TabsTrigger
                    value="comments"
                    className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    Коментарі
                    {comments.length > 0 ? (
                      <span className="ml-2 text-xs text-muted-foreground">{comments.length}</span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="files"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    Вкладення
                  </TabsTrigger>
                  <TabsTrigger
                    value="activity"
                    className="ml-6 h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
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

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{commentText.length} символів</span>
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
                                className="text-[10px] font-semibold"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="text-sm font-semibold">
                                    {comment.created_by
                                      ? memberById.get(comment.created_by) ?? "Користувач"
                                      : "Користувач"}
                                  </div>
                                  <div className="whitespace-nowrap text-xs text-muted-foreground">
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
                        className="flex w-full cursor-pointer items-center justify-between text-left"
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
                            <Badge variant="secondary" className="text-[11px]">
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

                      {filesCustomerOpen && (
                        <div className="mt-3 space-y-2">
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
                                const extension = getFileExtension(file.name);
                                const showImagePreview = !!file.url && canPreviewImage(extension);
                                const showPdfPreview = !!file.url && !showImagePreview && canPreviewPdf(extension);
                                return (
                                  <div
                                    key={file.id}
                                    className="group flex items-center justify-between rounded-xl border border-border/30 p-3 transition-colors hover:bg-muted/10"
                                  >
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-lg bg-primary/10">
                                        {showImagePreview ? (
                                          <KanbanImageZoomPreview
                                            imageUrl={file.url!}
                                            alt={file.name}
                                            className="h-10 w-10 rounded-lg border border-border/60 bg-primary/10"
                                          />
                                        ) : showPdfPreview ? (
                                          <iframe
                                            src={`${file.url}#page=1&view=FitH`}
                                            title={`Preview ${file.name}`}
                                            className="h-full w-full pointer-events-none transition-transform duration-200 ease-out group-hover:scale-150"
                                          />
                                        ) : (
                                          <Paperclip className="h-5 w-5 text-primary" />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <div className="truncate text-sm font-semibold" title={file.name}>
                                            {file.name}
                                          </div>
                                          {extension && (
                                            <Badge variant="secondary" className="text-[10px] uppercase">
                                              {extension}
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
                                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                        onClick={() => {
                                          if (file.url) {
                                            void downloadFileToDevice(file.url, file.name);
                                          }
                                        }}
                                        disabled={!file.url}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                        onClick={() => requestDeleteAttachment(file)}
                                        disabled={attachmentsDeletingId === file.id}
                                      >
                                        {attachmentsDeletingId === file.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex w-full cursor-pointer items-center justify-between text-left"
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
                      {filesDocsOpen && (
                        <div className="mt-3 rounded-xl border border-dashed border-border/40 bg-muted/[0.02] p-4 text-xs text-muted-foreground">
                          Рахунки, договори, акти — скоро буде доступно.
                        </div>
                      )}
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
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </details>
          </div>
        </main>

        <aside className="hidden w-full min-w-0 xl:block 2xl:w-[min(32vw,380px)] 2xl:min-w-[320px] 2xl:shrink-0">
          <div className="space-y-4 2xl:sticky 2xl:top-[4.5rem]">
            <details open className="group pb-2">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Контекст замовлення</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про контекст замовлення"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Основні дані по прорахунку, контакту і процесу.
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div>
                <div className="flex items-center gap-4 py-3">
                  <EntityAvatar
                    src={quote.customer_logo_url ?? null}
                    name={quote.customer_name ?? "Клієнт / Лід"}
                    fallback={getInitials(quote.customer_name)}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      {quote.customer_id ? "Клієнт" : "Лід"}
                    </div>
                    <div className="mt-0.5 truncate text-base font-semibold text-foreground">
                      {quote.customer_name ?? "Не вказано"}
                    </div>
                  </div>
                </div>

                <dl className="mt-1 space-y-0.5">
                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Менеджер</dt>
                    <dd className="min-w-0 max-w-[60%] text-right text-sm font-semibold text-foreground 2xl:max-w-[52%]">
                      <div className="flex items-center justify-end gap-2">
                        <AvatarBase
                          src={quote.assigned_to ? memberAvatarById.get(quote.assigned_to) ?? null : null}
                          name={
                            quote.assigned_to
                              ? memberById.get(quote.assigned_to) ?? quote.assigned_to
                              : "Не призначено"
                          }
                          fallback={
                            quote.assigned_to
                              ? getInitials(memberById.get(quote.assigned_to) ?? quote.assigned_to)
                              : "Не вказано"
                          }
                          size={20}
                          className="text-[9px] font-semibold"
                        />
                        <span className="truncate">
                          {quote.assigned_to
                            ? memberById.get(quote.assigned_to) ?? quote.assigned_to
                            : "Не призначено"}
                        </span>
                      </div>
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      {(() => {
                        const Icon = quoteTypeIcon(quote.quote_type);
                        return Icon ? (
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Shirt className="h-4 w-4 text-muted-foreground" />
                        );
                      })()}
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Тип прорахунку</dt>
                    <dd className="min-w-0 max-w-[60%] text-right 2xl:max-w-[52%]">
                      <div className="inline-flex h-6 items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 text-[10px] font-semibold text-primary">
                        {(() => {
                          const Icon = quoteTypeIcon(quote.quote_type);
                          return Icon ? <Icon className="h-3 w-3" /> : null;
                        })()}
                        {quoteTypeLabel(quote.quote_type)}
                      </div>
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Доставка</dt>
                    <dd className="min-w-0 max-w-[60%] text-right text-sm font-semibold text-foreground 2xl:max-w-[52%]">
                      {formatDeliveryLabel(quote.delivery_type ?? quote.print_type)}
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Дедлайн замовника</dt>
                    <dd className="min-w-0 max-w-[60%] text-right 2xl:max-w-[52%]">
                      {quote.customer_deadline_at ? (
                        (() => {
                          const badge = getDeadlineBadge(quote.customer_deadline_at);
                          const parsed = parseDeadlineDate(quote.customer_deadline_at);
                          const hasTime = /T\d{2}:\d{2}/.test(quote.customer_deadline_at ?? "");
                          const timeLabel = parsed && hasTime
                            ? parsed.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
                            : null;
                          return (
                            <QuoteDeadlineBadge
                              tone={badge.tone}
                              label={timeLabel ? `${badge.label} · ${timeLabel}` : badge.label}
                              title={formatDeadlineLabel(quote.customer_deadline_at)}
                              compact
                              className="justify-end"
                            />
                          );
                        })()
                      ) : (
                        <span className="text-sm font-semibold text-foreground">Не вказано</span>
                      )}
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Нагадування</dt>
                    <dd className="min-w-0 max-w-[60%] text-right text-sm font-semibold text-foreground 2xl:max-w-[52%]">
                      {formatReminderOffsetLabel(quote.deadline_reminder_offset_minutes ?? null) ?? "Без нагадування"}
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Створено</dt>
                    <dd className="min-w-0 max-w-[60%] text-right text-sm font-semibold text-foreground 2xl:max-w-[52%]">
                      {quote.created_at
                        ? new Date(quote.created_at).toLocaleDateString("uk-UA", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "Не вказано"}
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Внутрішній дедлайн</dt>
                    <dd className="min-w-0 max-w-[60%] text-right 2xl:max-w-[52%]">
                      {(() => {
                        const preview = buildDeadlineBadgePreview(quote?.deadline_at ?? null);
                        return (
                          <QuoteDeadlineBadge
                            tone={preview.tone}
                            label={preview.label}
                            title={preview.title}
                            compact
                            className="justify-end"
                          />
                        );
                      })()}
                    </dd>
                  </div>

                  <div className="flex items-start gap-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <dt className="min-w-0 flex-1 pt-1.5 text-sm font-medium text-muted-foreground">Дедлайн дизайну</dt>
                    <dd className="min-w-0 max-w-[60%] text-right text-sm font-semibold text-foreground 2xl:max-w-[52%]">
                      {quote?.design_deadline_at
                        ? formatDeadlineLabel(quote.design_deadline_at)
                        : "Не вказано"}
                    </dd>
                  </div>
                </dl>
              </div>
            </details>

            <details open className="group pb-1">
              <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div className="text-base font-semibold tracking-tight text-foreground">Підсумок</div>
                  <div className="relative">
                    <button
                      type="button"
                      className="peer flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Інформація про підсумок"
                      onClick={(event) => event.preventDefault()}
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-sm transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
                      Фінальний підсумок по вибраному тиражу: собівартість, бажаний заробіток, націнка та ціна продажу.
                    </div>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="space-y-3 px-0 py-0">
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-muted-foreground">Собівартість</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatCurrency(runs.length > 0 ? selectedRunPricing.costTotal : totals.subtotal, quote.currency)}
                  </span>
                </div>

                {selectedRun ? (
                  <>
                    <div className="rounded-xl border border-border/50 bg-muted/[0.08] p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Бажаний заробіток
                          </Label>
                          <Input
                            type="number"
                            value={selectedRun.desired_manager_income ?? ""}
                            onChange={(e) => updateRunRaw(selectedRunIndex, "desired_manager_income", e.target.value)}
                            onFocus={(e) => {
                              if ((Number(selectedRun.desired_manager_income) || 0) === 0) {
                                e.target.select();
                              }
                            }}
                            className="h-8 border-transparent bg-muted/20 px-2 text-sm hover:border-border focus:border-border focus:bg-background"
                            placeholder="0"
                            min="0"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Ціна продажу / од.
                          </Label>
                          <div className="flex h-8 items-center rounded-md border border-border/50 bg-background px-2 font-mono text-sm font-semibold tabular-nums text-primary">
                            {selectedRunPricing.saleUnitPrice === null
                              ? "—"
                              : formatCurrency(selectedRunPricing.saleUnitPrice, quote.currency)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-1">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">% менеджера</Label>
                          <div className="flex h-8 items-center rounded-md border border-border/50 bg-background px-2 font-mono text-sm font-semibold tabular-nums">
                            {selectedRunPricing.managerRate}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-muted-foreground">Потрібний валовий прибуток</span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatCurrency(selectedRunPricing.requiredGrossProfit, quote.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-muted-foreground">Сталі витрати</span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatCurrency(selectedRunPricing.fixedCosts, quote.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-muted-foreground">ПДВ</span>
                      <span className="font-mono font-medium tabular-nums text-emerald-600">
                        +{formatCurrency(selectedRunPricing.vatAmount, quote.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 text-sm">
                      <span className="text-muted-foreground">Націнка</span>
                      <span className="font-mono font-medium tabular-nums text-primary">
                        +{formatCurrency(selectedRunPricing.markupTotal, quote.currency)}
                      </span>
                    </div>
                  </>
                ) : null}

                <div className="border-t border-border/50 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{selectedRun ? "Сума продажу" : "Загальна сума"}</span>
                    <span className="font-mono text-2xl font-bold tabular-nums text-primary">
                      {formatCurrency(totals.total, quote.currency)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 border-t border-border/40 pt-3">
                  <div className="text-[11px] text-muted-foreground/60">
                    Джерело: {runs.length > 0 ? "Обраний тираж" : "Позиції"}
                  </div>
                  {items.length > 0 && (
                    <div className="flex justify-between text-[11px] text-muted-foreground/60">
                      <span>Позицій:</span>
                      <span className="font-medium text-muted-foreground">{items.length}</span>
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
        </aside>
      </div>

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
      <DialogContent className="sm:max-w-[720px]">
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
                        <Badge variant="outline" className="h-5 px-2 text-[10px]">
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
                          className="h-5 border-success/40 bg-success/10 px-2 text-[10px] text-success-foreground"
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
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-[min(1100px,92vw)]">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{visualizationPreview?.name ?? "Візуалізація"}</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto rounded-xl bg-muted/15 p-2">
          {visualizationPreview?.url ? (
            <img
              src={visualizationPreview.url}
              alt={visualizationPreview.name}
              className="mx-auto max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
            />
          ) : null}
        </div>
        <DialogFooter>
          {visualizationPreview?.url ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void downloadFileToDevice(visualizationPreview.url!, visualizationPreview.name)}
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
                        ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
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
              <TabsList className="mb-6 grid w-full grid-cols-2 rounded-xl bg-muted/30 p-1 shadow-inner">
                <TabsTrigger
                  value="simple"
                  className="rounded-lg py-2.5 text-sm data-[state=active]:border data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Проста позиція
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="rounded-lg py-2.5 text-sm data-[state=active]:border data-[state=active]:border-border/50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
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
                    <Input
                      type="number"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      min="1"
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
                    <Input
                      type="number"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      placeholder="0"
                      min="0"
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
                      <Input
                        type="number"
                        value={itemQty}
                        onChange={(e) => setItemQty(e.target.value)}
                        min="1"
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
