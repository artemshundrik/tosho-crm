import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
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
import { supabase } from "@/lib/supabaseClient";
import { formatActivityClock, formatActivityDayLabel, type ActivityRow } from "@/lib/activity";
import { logActivity } from "@/lib/activityLogger";
import { logDesignTaskActivity, notifyUsers } from "@/lib/designTaskActivity";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { AvatarBase } from "@/components/app/avatar-kit";
import { EntityHeader } from "@/components/app/headers/EntityHeader";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { EntityViewersBar } from "@/components/app/workspace-presence-widgets";
import {
  getQuoteSummary,
  getQuoteRuns,
  upsertQuoteRuns,
  deleteQuote,
  listTeamMembers,
  listStatusHistory,
  setStatus,
  updateQuote,
  type TeamMemberRow,
  type QuoteStatusRow,
  type QuoteSummaryRow,
  type QuoteRun,
} from "@/lib/toshoApi";
import { isDesignerJobRole } from "@/lib/permissions";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Copy,
  FileDown,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Paperclip,
  MessageSquare,
  Check,
  Clock,
  Hourglass,
  PlusCircle,
  Send,
  Sparkles,
  XCircle,
  PlayCircle,
  CheckCircle2,
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
} from "lucide-react";

type QuoteDetailsPageProps = {
  teamId: string;
  quoteId: string;
};

const ITEM_VISUAL_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";

const MAX_QUOTE_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;
const ATTACHMENTS_ACCEPT =
  ".pdf,.ai,.svg,.eps,.cdr,.png,.jpg,.jpeg,.psd,.tiff,.zip,.rar,.doc,.docx,.xls,.xlsx";
const MENTION_REGEX = /(^|[\s(])@([^\s@,;:!?()[\]{}<>]+)/gu;
const MENTION_TOKEN_REGEX = /(@[^\s@,;:!?()[\]{}<>]+)/g;

const normalizeMentionKey = (value?: string | null) => (value ?? "").trim().toLowerCase();
const isMentionTerminator = (char: string) => /[\s,;:!?()[\]{}<>]/u.test(char);

const toEmailLocalPart = (value?: string | null) => {
  const text = (value ?? "").trim();
  if (!text.includes("@")) return "";
  return text.split("@")[0]?.trim() ?? "";
};

const sanitizeMentionAlias = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^\p{L}\p{N}._-]+/gu, "");

const buildMentionAlias = (label: string, userId: string) => {
  const base = toEmailLocalPart(label) || label;
  const alias = sanitizeMentionAlias(base);
  return alias || userId.slice(0, 8);
};

const extractMentionKeys = (text: string) => {
  const keys = new Set<string>();
  for (const match of text.matchAll(MENTION_REGEX)) {
    const key = normalizeMentionKey(match[2]);
    if (key) keys.add(key);
  }
  return Array.from(keys);
};

const renderTextWithMentions = (text: string) => {
  const parts = text.split(MENTION_TOKEN_REGEX);
  return parts.map((part, index) => {
    if (!part) return null;
    if (!part.startsWith("@")) return <span key={`text-${index}`}>{part}</span>;
    return (
      <span key={`mention-${index}`} className="font-semibold text-primary">
        {part}
      </span>
    );
  });
};

const shouldUseCommentsFallback = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("stack depth limit exceeded") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  );
};

const formatFileSize = (bytes?: number | null) => {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exp;
  return `${size.toFixed(size >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
};

const getFileExtension = (name?: string | null) => {
  if (!name) return null;
  const parts = name.split(".");
  if (parts.length < 2) return null;
  return parts[parts.length - 1]?.toUpperCase() ?? null;
};

const IMAGE_PREVIEW_EXTENSIONS = new Set(["PNG", "JPG", "JPEG", "WEBP", "GIF", "SVG"]);

const canPreviewImage = (extension?: string | null) =>
  !!extension && IMAGE_PREVIEW_EXTENSIONS.has(extension);

const canPreviewPdf = (extension?: string | null) => extension === "PDF";

const formatCurrencyCompact = (value: number, currency?: string | null) =>
  new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: currency ?? "UAH",
    maximumFractionDigits: 0,
  }).format(value || 0);

const CANCEL_REASON_OPTIONS = [
  "Бюджет не підходить",
  "Обрали іншого підрядника",
  "Змінились вимоги/бриф",
  "Втрата актуальності",
  "Немає відповіді від клієнта",
];

const normalizeStatus = (value?: string | null) => {
  if (!value) return "new";
  const legacy: Record<string, string> = {
    draft: "new",
    in_progress: "estimating",
    sent: "estimated",
    rejected: "cancelled",
    completed: "approved",
  };
  return legacy[value] ?? value;
};

type CatalogMethod = { id: string; name: string; price?: number };
type CatalogPrintPosition = { id: string; label: string; sort_order?: number | null };
type CatalogPriceTier = { id: string; min: number; max: number | null; price: number };
type CatalogModel = {
  id: string;
  name: string;
  price?: number;
  priceTiers?: CatalogPriceTier[];
  imageUrl?: string;
};
type CatalogKind = {
  id: string;
  name: string;
  models: CatalogModel[];
  methods: CatalogMethod[];
  printPositions: CatalogPrintPosition[];
};
type CatalogType = {
  id: string;
  name: string;
  kinds: CatalogKind[];
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

const STATUS_OPTIONS = [
  "new",
  "estimating",
  "estimated",
  "awaiting_approval",
  "approved",
  "cancelled",
];

const statusLabels: Record<string, string> = {
  new: "Новий",
  estimating: "На прорахунку",
  estimated: "Пораховано",
  awaiting_approval: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
  // legacy mapping (до міграції БД)
  draft: "Новий",
  in_progress: "На прорахунку",
  sent: "Пораховано",
  rejected: "Скасовано",
  completed: "Затверджено",
};

const statusClasses: Record<string, string> = {
  new: "bg-muted/40 text-muted-foreground border-border",
  estimating:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40",
  estimated:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/40",
  awaiting_approval:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/40",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/40",
  cancelled:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/40",
};

const statusIcons: Record<string, any> = {
  new: PlusCircle,
  estimating: PlayCircle,
  estimated: Send,
  awaiting_approval: Hourglass,
  approved: CheckCircle2,
  cancelled: XCircle,
};

const STATUS_FLOW: string[] = ["new", "estimating", "estimated", "awaiting_approval", "approved"];

const STATUS_NEXT_ACTION: Record<
  string,
  {
    ctaLabel: string;
    title: string;
    description: string;
    nextStatus: string | null;
  }
> = {
  new: {
    ctaLabel: "Почати прорахунок",
    title: "Етап старту",
    description: "Підготуйте позиції та дедлайн, після чого переведіть у роботу.",
    nextStatus: "estimating",
  },
  estimating: {
    ctaLabel: "Позначити як пораховано",
    title: "Етап розрахунку",
    description: "Зафіксуйте ціну та підсумок, коли розрахунок готовий.",
    nextStatus: "estimated",
  },
  estimated: {
    ctaLabel: "Відправити на погодження",
    title: "Етап узгодження",
    description: "Після фінальної перевірки переведіть прорахунок у погодження.",
    nextStatus: "awaiting_approval",
  },
  awaiting_approval: {
    ctaLabel: "Підтвердити",
    title: "Етап погодження",
    description: "Зафіксуйте фінальне рішення клієнта.",
    nextStatus: "approved",
  },
  approved: {
    ctaLabel: "Змінити статус",
    title: "Прорахунок завершено",
    description: "Статус затверджено. За потреби можна змінити вручну.",
    nextStatus: null,
  },
  cancelled: {
    ctaLabel: "Змінити статус",
    title: "Прорахунок скасовано",
    description: "Прорахунок зупинено. За потреби можна перевести в інший статус.",
    nextStatus: null,
  },
};

const QUOTE_TYPE_LABELS: Record<string, string> = {
  merch: "Мерч",
  print: "Поліграфія",
  other: "Інше",
};

function formatStatusLabel(value: string | null | undefined) {
  return (value && statusLabels[value]) || value || "Не вказано";
}

function formatQuoteType(value: string | null | undefined) {
  return (value && QUOTE_TYPE_LABELS[value]) || value || "Не вказано";
}

function formatCurrency(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "Не вказано";
  const label = currency ?? "UAH";
  return `${value.toLocaleString("uk-UA")} ${label}`;
}

function getInitials(value?: string | null) {
  if (!value) return "Не вказано";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Не вказано";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function minutesAgo(value: string | null | undefined) {
  if (!value) return null;
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.floor(diff / 60000));
}

function createLocalId() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function getTypeLabel(catalog: CatalogType[], typeId?: string) {
  return catalog.find((type) => type.id === typeId)?.name;
}

function getKindLabel(catalog: CatalogType[], typeId?: string, kindId?: string) {
  const type = catalog.find((item) => item.id === typeId);
  return type?.kinds.find((kind) => kind.id === kindId)?.name;
}

function getModelLabel(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  modelId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.models.find((model) => model.id === modelId)?.name;
}

function getModelImage(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  modelId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.models.find((model) => model.id === modelId)?.imageUrl ?? null;
}

function getMethodLabel(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  methodId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.methods.find((method) => method.id === methodId)?.name;
}

function getPrintPositionLabel(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  positionId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.printPositions.find((pos) => pos.id === positionId)?.label;
}

function getModelPrice(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  modelId?: string,
  qty?: number
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  const model = kind?.models.find((item) => item.id === modelId);
  if (!model) return 0;
  const tiers = model.priceTiers ?? [];
  if (tiers.length > 0 && qty !== undefined) {
    const match = tiers.find((tier) => {
      const max = tier.max ?? Number.POSITIVE_INFINITY;
      return qty >= tier.min && qty <= max;
    });
    if (match) return match.price;
  }
  return model.price ?? 0;
}

function getMethodPrice(
  catalog: CatalogType[],
  typeId?: string,
  kindId?: string,
  methodId?: string
) {
  const type = catalog.find((item) => item.id === typeId);
  const kind = type?.kinds.find((item) => item.id === kindId);
  return kind?.methods.find((method) => method.id === methodId)?.price ?? 0;
}

export function QuoteDetailsPage({ teamId, quoteId }: QuoteDetailsPageProps) {
  const navigate = useNavigate();
  const { getEntityViewers } = useWorkspacePresence();
  const quoteViewers = useMemo(
    () => getEntityViewers("quote", quoteId),
    [getEntityViewers, quoteId]
  );

  const [quote, setQuote] = useState<QuoteSummaryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusNote, setStatusNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteQuoteDialogOpen, setDeleteQuoteDialogOpen] = useState(false);
  const [deleteQuoteBusy, setDeleteQuoteBusy] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [history, setHistory] = useState<QuoteStatusRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [briefText, setBriefText] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefSaving, setBriefSaving] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [filesCustomerOpen, setFilesCustomerOpen] = useState(true);
  const [filesDesignOpen, setFilesDesignOpen] = useState(true);
  const [filesDocsOpen, setFilesDocsOpen] = useState(true);

  const [attachments, setAttachments] = useState<QuoteAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [attachmentsUploadError, setAttachmentsUploadError] = useState<string | null>(null);
  const [attachmentsDeletingId, setAttachmentsDeletingId] = useState<string | null>(null);
  const [attachmentsDeleteError, setAttachmentsDeleteError] = useState<string | null>(null);
  const [attachmentsDragActive, setAttachmentsDragActive] = useState(false);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteAttachmentOpen, setDeleteAttachmentOpen] = useState(false);
  const [deleteAttachmentTarget, setDeleteAttachmentTarget] = useState<QuoteAttachment | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
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

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemFormMode, setItemFormMode] = useState<"simple" | "advanced">("simple");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemUnit, setItemUnit] = useState("шт");
  const [itemPrice, setItemPrice] = useState("0");
  const [itemDescription, setItemDescription] = useState("");
  const [itemTypeId, setItemTypeId] = useState("");
  const [itemKindId, setItemKindId] = useState("");
  const [itemModelId, setItemModelId] = useState("");
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
  const [deadlineNote, setDeadlineNote] = useState("");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [deadlinePopoverOpen, setDeadlinePopoverOpen] = useState(false);

  // Inline editing for quantity
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");

  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState("new");

  const getRunTotal = (run: QuoteRun) => {
    const qty = Number(run.quantity) || 0;
    const model = Number(run.unit_price_model) || 0;
    const print = Number(run.unit_price_print) || 0;
    const logistics = Number(run.logistics_cost) || 0;
    return (model + print) * qty + logistics;
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
      },
    ]);
    setSelectedRunId(newId);
  };

  const updateRun = (index: number, field: keyof QuoteRun, value: number) => {
    setRuns((prev) =>
      prev.map((run, i) => (i === index ? { ...run, [field]: value } : run))
    );
  };

  const updateRunRaw = (index: number, field: keyof QuoteRun, raw: string) => {
    const parsed = raw === "" ? null : Number(raw);
    setRuns((prev) =>
      prev.map((run, i) => (i === index ? { ...run, [field]: parsed as any } : run))
    );
  };

  const saveRuns = async (nextRuns?: QuoteRun[] | unknown) => {
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
    } catch (e: any) {
      setRunsError(e?.message ?? "Не вдалося зберегти тиражі.");
      toast.error("Помилка збереження");
    } finally {
      setRunsSaving(false);
    }
  };

  const removeRun = async (index: number) => {
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
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося видалити прорахунок";
      setStatusError(message);
      toast.error(message);
    } finally {
      setDeleteQuoteBusy(false);
      setDeleteQuoteDialogOpen(false);
    }
  };

  const saveBrief = async () => {
    if (!quote || !teamId || briefSaving) return;
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
              comment: (data as any)?.comment ?? nextBrief ?? null,
              design_brief: (data as any)?.design_brief ?? nextBrief ?? null,
              updated_at: (data as any)?.updated_at ?? prev.updated_at,
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
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося зберегти ТЗ.";
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

  const selectedRunTotal = useMemo(() => {
    if (!selectedRun) return 0;
    return getRunTotal(selectedRun);
  }, [selectedRun]);

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
    const local = toLocalDate(value);
    if (local) return local;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const formatDeadlineLabel = (value?: string | null) => {
    const date = parseDeadlineDate(value);
    if (!date) return "Без дедлайну";
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDeliveryLabel = (value?: string | null) => {
    if (!value) return "Не вказано";
    const map: Record<string, string> = {
      nova_poshta: "Нова пошта",
      pickup: "Самовивіз",
      taxi: "Таксі",
    };
    return map[value] ?? value;
  };

  const getDeadlineBadge = (value?: string | null) => {
    if (!value) {
      return { label: "Без дедлайну", className: "border-border/60 text-muted-foreground bg-muted/20" };
    }
    const date = parseDeadlineDate(value);
    if (!date) {
      return { label: "Без дедлайну", className: "border-border/60 text-muted-foreground bg-muted/20" };
    }
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDeadline = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Прострочено (${Math.abs(diffDays)} дн.)`,
        className:
          "border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-500/40 dark:text-rose-200 dark:bg-rose-500/15",
      };
    }
    if (diffDays === 0) {
      return {
        label: "Сьогодні",
        className:
          "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/40 dark:text-amber-200 dark:bg-amber-500/15",
      };
    }
    if (diffDays <= 2) {
      return {
        label: diffDays === 1 ? "Завтра" : `Через ${diffDays} дн.`,
        className:
          "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-100 dark:bg-amber-500/10",
      };
    }
    return {
      label: date.toLocaleDateString("uk-UA"),
      className: "border-border/60 text-muted-foreground bg-muted/20",
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
  const getMemberLabel = (userId?: string | null) => {
    if (!userId) return "Не вказано";
    return memberById.get(userId) ?? userId;
  };
  const mentionSuggestions = useMemo<MentionSuggestion[]>(
    () =>
      teamMembers.map((member) => {
        const label = (member.label ?? "").trim() || "Користувач";
        return {
          id: member.id,
          label,
          alias: buildMentionAlias(label, member.id),
          avatarUrl: member.avatarUrl ?? null,
        };
      }),
    [teamMembers]
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
      .slice(0, 8);
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
  }, [quote?.design_brief, quote?.comment, quote?.id, briefDirty]);
  const currentStatus = normalizeStatus(quote?.status);
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
      ["estimating", "estimated", "awaiting_approval", "approved"].includes(
        currentStatus ?? ""
      ),
    [currentStatus]
  );

  const openStatusDialog = () => {
    setStatusTarget(currentStatus ?? "new");
    setStatusNote("");
    setStatusDialogOpen(true);
  };

  const handlePrimaryStatusAction = () => {
    if (statusBusy) return;
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
      accentClass: "bg-primary/10 text-primary border-primary/20",
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
            ? Sparkles
            : source === "quote_status" && toStatus
            ? (statusIcons[toStatus] as ActivityIcon) ?? Clock
            : source === "quote_deadline"
            ? Calendar
            : Clock;
        const accentClass =
          source === "quote_runs"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/40"
            : source === "quote_status" && toStatus
            ? statusClasses[toStatus] ?? statusClasses.new
            : source === "quote_deadline"
            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40"
            : "bg-muted/40 text-muted-foreground border-border";
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
    const subtotal = runs.length > 0 ? selectedRunTotal : itemsSubtotal;
    const discountPercent = Number(discount) || 0;
    const taxPercent = Number(tax) || 0;
    
    const discountAmount = (subtotal * discountPercent) / 100;
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = (afterDiscount * taxPercent) / 100;
    const total = afterDiscount + taxAmount;
    
    return { 
      subtotal, 
      discountAmount, 
      taxAmount, 
      total: Math.max(0, total) 
    };
  }, [itemsSubtotal, discount, tax, selectedRunTotal, runs.length]);

  const selectedType = useMemo(
    () => catalogTypes.find((type) => type.id === itemTypeId) ?? null,
    [catalogTypes, itemTypeId]
  );

  const availableKinds = selectedType?.kinds ?? [];
  const selectedKind = availableKinds.find((kind) => kind.id === itemKindId) ?? null;
  const availableModels = selectedKind?.models ?? [];
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
          .select("id,kind_id,name,price,image_url")
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
      } catch (e: any) {
        if (!cancelled) {
          setCatalogError(e?.message ?? "Не вдалося завантажити каталог.");
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
    if (!teamId) return;
    let active = true;
    const loadMembers = async () => {
      try {
        const data = await listTeamMembers(teamId);
        if (active) setTeamMembers(data);
      } catch {
        if (active) setTeamMembers([]);
      }
    };
    void loadMembers();
    return () => {
      active = false;
    };
  }, [teamId]);

  const loadQuote = async () => {
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const summary = await getQuoteSummary(quoteId);
      if (summary.team_id && summary.team_id !== teamId) {
        throw new Error("Немає доступу до цього прорахунку.");
      }
      setQuote(summary);
      setDeadlineDate(toDateInputValue(summary.deadline_at ?? null));
      setDeadlineNote(summary.deadline_note ?? "");
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося завантажити прорахунок.";
      if ((message ?? "").toLowerCase().includes("stack depth limit exceeded")) {
        setError("Помилка БД (stack depth limit exceeded). Перевірте RLS/policy у таблицях quote_*.");
      } else {
        setError(message);
      }
      setQuote(null);
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
      const row = (data ?? [])[0] as { id: string; metadata?: Record<string, unknown> | null } | undefined;
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
    } catch (e: any) {
      setDesignTaskError(e?.message ?? "Не вдалося завантажити дизайн-задачу.");
      setDesignTask(null);
    } finally {
      setDesignTaskLoading(false);
    }
  };

  const createDesignTask = async () => {
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
      const modelName = items[0]?.title ?? "Позиція";
      const methodsCount = items[0]?.methods?.length ?? 0;
      const designDeadline = quote?.deadline_at ?? null;
      const assigneeUserId = designAssigneeId ?? null;
      const assignedAt = assigneeUserId ? new Date().toISOString() : null;

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
            quote_id: quoteId,
            design_task_id: null,
            assignee_user_id: assigneeUserId,
            assigned_at: assignedAt,
            quote_type: quote?.quote_type ?? null,
            methods_count: methodsCount,
            has_files: attachments.length > 0,
            design_deadline: designDeadline,
            deadline: designDeadline,
            design_brief: quote?.design_brief ?? quote?.comment ?? null,
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
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося створити дизайн-задачу.";
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
    } catch (e: any) {
      setDesignTask({
        ...designTask,
        assigneeUserId: previousAssignee,
        assignedAt: previousAssignedAt,
        metadata: designTask.metadata,
      });
      setDesignAssigneeId(previousAssignee);
      const message = e?.message ?? "Не вдалося оновити виконавця.";
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
      const loadRows = async (withTeamFilter: boolean) => {
        let query = supabase
          .schema("tosho")
          .from("quote_items")
          .select("id, position, name, description, qty, unit, unit_price, methods, attachment, catalog_type_id, catalog_kind_id, catalog_model_id, print_position_id, print_width_mm, print_height_mm")
          .eq("quote_id", quoteId)
          .order("position", { ascending: true });
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
      setItems(
        rows.map((row) => {
          const rawMethods = Array.isArray(row.methods) ? row.methods : [];
          const parsedMethods: ItemMethod[] = rawMethods
            .map((method: any) => {
              const methodId = method?.method_id ?? method?.methodId ?? method?.id ?? "";
              if (!methodId) return null;
              const rawWidth = method?.print_width_mm ?? method?.printWidthMm ?? null;
              const rawHeight = method?.print_height_mm ?? method?.printHeightMm ?? null;
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
                count: Number(method?.count ?? 1) || 1,
                printPositionId: method?.print_position_id ?? method?.printPositionId ?? undefined,
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
            unit: row.unit ?? "шт",
            price: Number(row.unit_price ?? 0) || 0,
            description: row.description ?? undefined,
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
    } catch (e: any) {
      setItemsError(e?.message ?? "Не вдалося завантажити позиції.");
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
    } catch (e: any) {
      setRunsError(e?.message ?? "Не вдалося завантажити тиражі.");
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
    } catch (e: any) {
      setHistoryError(e?.message ?? "Не вдалося завантажити історію.");
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
        let parsed: any = {};
        if (rawText) {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            parsed = {};
          }
        }

        if (!response.ok) {
          throw new Error(parsed?.error || `HTTP ${response.status}`);
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
            comments.map((row: any) => ({
              id: row.id,
              body: row.body ?? "",
              created_at: row.created_at ?? new Date().toISOString(),
              created_by: row.created_by ?? null,
            }))
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
    } catch (e: any) {
      setCommentsError(e?.message ?? "Не вдалося завантажити коментарі.");
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
    } catch (e: any) {
      setActivityError(e?.message ?? "Не вдалося завантажити активність.");
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

      setAttachments(mapped);
    } catch (e: any) {
      setAttachmentsError(e?.message ?? "Не вдалося завантажити файли.");
      setAttachments([]);
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
        throw new Error(userError?.message ?? "Користувач не авторизований");
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
    } catch (e: any) {
      setAttachmentsUploadError(e?.message ?? "Не вдалося завантажити файли.");
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
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося видалити файл.";
      setAttachmentsDeleteError(message);
      toast.error("Помилка видалення", { description: message });
    } finally {
      setAttachmentsDeletingId(null);
    }
  };

  useEffect(() => {
    void loadQuote();
  }, [quoteId, teamId]);

  useEffect(() => {
    void loadDesignTask();
  }, [quoteId, teamId]);

  useEffect(() => {
    if (!quote || quote.id !== quoteId || error) return;
    void loadHistory();
    void loadItems();
    void loadRuns();
    void loadAttachments();
    void loadComments();
    void loadActivityLog();
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
    if (itemAttachmentUploading) return;
    void loadAttachments();
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

  const handleSaveDeadline = async () => {
    if (!quote) return;
    setDeadlineSaving(true);
    setDeadlineError(null);
    try {
      const prevDate = toDateInputValue(quote.deadline_at ?? null);
      const prevNote = quote.deadline_note ?? "";
      const nextDate = deadlineDate || "";
      const nextNote = deadlineNote.trim();
      const deadlineChanged = prevDate !== nextDate || prevNote.trim() !== nextNote;

      const payload = {
        deadline_at: deadlineDate || null,
        deadline_note: deadlineNote.trim() || null,
      };
      const { error } = await supabase
        .schema("tosho")
        .from("quotes")
        .update(payload)
        .eq("id", quote.id);
      if (error) throw error;
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
          },
        });
        await loadActivityLog();
      }
      await loadQuote();
    } catch (e: any) {
      setDeadlineError(e?.message ?? "Не вдалося оновити дедлайн.");
    } finally {
      setDeadlineSaving(false);
    }
  };

  const handleDeadlineQuickSet = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    setDeadlineDate(formatDateInput(date));
    setDeadlinePopoverOpen(false);
  };

  const handleDeadlineClear = () => {
    setDeadlineDate("");
    setDeadlinePopoverOpen(false);
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
    } catch (e: any) {
      setStatusError(e?.message ?? "Помилка зміни статусу");
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

  // Inline quantity editing
  const startQtyEdit = (itemId: string, currentQty: number) => {
    setEditingQty(itemId);
    setQtyValue(currentQty.toString());
  };

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
    } catch (e: any) {
      setItemsError(e?.message ?? "Не вдалося оновити кількість.");
    }
  };

  const openNewItem = () => {
    setEditingItemId(null);
    setItemTitle("");
    setItemQty("1");
    setItemUnit("шт");
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
    setItemUnit(item.unit);
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
        throw new Error(userError?.message ?? "User not authenticated");
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

      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
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
    } catch (error: any) {
      setItemAttachmentError(error?.message ?? "Не вдалося завантажити файл");
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

    const newItem: QuoteItem = {
      id: editingItemId || createLocalId(),
      position: undefined,
      title: itemTitle.trim(),
      qty: Math.max(1, Number(itemQty) || 1),
      unit: itemUnit,
      price: computedItemPrice,
      description: itemDescription.trim() || undefined,
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
        const { error } = await supabase
          .schema("tosho")
          .from("quote_items")
          .update({
            name: newItem.title,
            description: newItem.description ?? null,
            qty: newItem.qty,
            unit: newItem.unit,
            unit_price: newItem.price,
            line_total: newItem.qty * newItem.price,
            catalog_type_id: newItem.catalogTypeId ?? null,
            catalog_kind_id: newItem.catalogKindId ?? null,
            catalog_model_id: newItem.catalogModelId ?? null,
            methods: methodsPayload,
            attachment: attachmentPayload,
          })
          .eq("id", editingItemId);
        if (error) throw error;
        setItems((prev) =>
          prev.map((item) => (item.id === editingItemId ? newItem : item))
        );
      } else {
        const newId = crypto.randomUUID();
        const nextPosition =
          items.length === 0 ? 1 : Math.max(...items.map((item) => item.position ?? 0)) + 1;
        const { data, error } = await supabase
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
            unit: newItem.unit,
            unit_price: newItem.price,
            line_total: newItem.qty * newItem.price,
            catalog_type_id: newItem.catalogTypeId ?? null,
            catalog_kind_id: newItem.catalogKindId ?? null,
            catalog_model_id: newItem.catalogModelId ?? null,
            methods: methodsPayload,
            attachment: attachmentPayload,
          })
          .select("id, position, name, description, qty, unit, unit_price, methods, attachment")
          .single();
        if (error) throw error;
        const inserted: QuoteItem = {
          ...newItem,
          id: data?.id ?? newId,
          position: data?.position ?? nextPosition,
          qty: Number(data?.qty ?? newItem.qty),
          unit: data?.unit ?? newItem.unit,
          price: Number(data?.unit_price ?? newItem.price),
          description: data?.description ?? newItem.description,
        };
        setItems((prev) => [...prev, inserted]);
      }
      setItemModalOpen(false);
    } catch (e: any) {
      setItemsError(e?.message ?? "Не вдалося зберегти позицію.");
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
    } catch (e: any) {
      setItemsError(e?.message ?? "Не вдалося видалити позицію.");
    }
  };

  const handleAddComment = () => {
    if (!commentText.trim() || commentSaving) return;
    void saveComment(commentText.trim());
  };

  const resolveMentionContext = (text: string, cursor: number): MentionContext | null => {
    if (!text || cursor <= 0) return null;

    const start = text.lastIndexOf("@", Math.max(0, cursor - 1));
    if (start < 0) return null;

    const prevChar = start > 0 ? text[start - 1] : "";
    if (start > 0 && !/[\s(]/u.test(prevChar)) return null;

    const query = text.slice(start + 1, cursor);
    if (!query || query.includes("@")) return null;
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
    if (!mentionContext || filteredMentionSuggestions.length === 0) return;

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
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setMentionContext(null);
      setMentionActiveIndex(0);
    }
  };

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
        let parsed: any = {};
        if (rawText) {
          try {
            parsed = JSON.parse(rawText);
          } catch {
            parsed = {};
          }
        }

        if (!response.ok) {
          throw new Error(parsed?.error || `HTTP ${response.status}`);
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
          data = fallback?.comment as any;
          if (hasMentionsInBody) {
            mentionsHandledViaServer = !fallback?.mentionError;
          }
          error = null;
        } else {
          throw error;
        }
      }

      const inserted = data as QuoteComment;
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
          const notificationRows = mentionUserIdsList.map((mentionedUserId) => ({
            user_id: mentionedUserId,
            title: `${actorLabel} згадав(ла) вас у коментарі`,
            body: `Прорахунок ${quoteLabel}: ${trimmedBody}`,
            href: `/orders/estimates/${quoteId}`,
            type: "info",
          }));
          const { error: notificationsError } = await supabase.from("notifications").insert(notificationRows);
          if (notificationsError) {
            console.warn("Failed to send mention notifications", notificationsError, notifyError);
          }
        }
      }

      setCommentText("");
      setMentionContext(null);
      setMentionActiveIndex(0);
      await loadActivityLog();
    } catch (e: any) {
      setCommentsError(e?.message ?? "Не вдалося додати коментар.");
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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Завантаження прорахунку...</p>
        </div>
      </div>
    );
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
    <div className="w-full max-w-[1400px] mx-auto pb-20 space-y-6">
      <EntityHeader
        topBar={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/orders/estimates")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            До прорахунків
          </Button>
        }
        title={`Прорахунок #${quote.number ?? quote.id}`}
        subtitle={
          <>
            {formatQuoteType(quote.quote_type)}
            {(quote.delivery_type ?? quote.print_type)
              ? ` · ${formatDeliveryLabel(quote.delivery_type ?? quote.print_type)}`
              : ""}
          </>
        }
        viewers={
          <EntityViewersBar
            entries={quoteViewers}
            label="Переглядають прорахунок"
            className="mt-1"
          />
        }
        meta={
          <>
            <Badge className={cn("border", statusClasses[currentStatus] ?? statusClasses.new)}>
              {formatStatusLabel(currentStatus)}
            </Badge>
            {(() => {
              const badge = getDeadlineBadge(quote.deadline_at ?? null);
              const deadlineDate = parseDeadlineDate(quote.deadline_at ?? null);
              const titleParts = [
                deadlineDate
                  ? `Дата: ${deadlineDate.toLocaleDateString("uk-UA")}`
                  : "Дедлайн не задано",
                quote.deadline_note ? `Коментар: ${quote.deadline_note}` : null,
              ].filter(Boolean);
              return (
                <Badge
                  variant="outline"
                  className={cn("text-xs font-medium", badge.className)}
                  title={titleParts.join(" · ")}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  {badge.label}
                </Badge>
              );
            })()}
          </>
        }
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              className="gap-2 shadow-sm"
              disabled={statusBusy}
              onClick={handlePrimaryStatusAction}
            >
              {createElement(
                statusIcons[nextAction.nextStatus ?? currentStatus] ?? Clock,
                { className: "h-4 w-4" }
              )}
              {nextAction.ctaLabel}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={statusBusy}
              onClick={openStatusDialog}
            >
              Змінити статус
              <ChevronDown className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <FileDown className="mr-2 h-4 w-4" />
                  Експорт PDF
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Copy className="mr-2 h-4 w-4" />
                  Дублювати
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
          </>
        }
      />

      <Card className="border-border/70 bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FLOW.map((status, index) => {
              const reached = STATUS_FLOW.indexOf(currentStatus) >= index;
              const active = currentStatus === status;
              return (
                <div key={status} className="flex items-center gap-2">
                  {index > 0 ? (
                    <div className={cn("h-px w-5", reached ? "bg-primary/40" : "bg-border")} />
                  ) : null}
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold",
                      active
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : reached
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-600"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {reached ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {formatStatusLabel(status)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">{nextAction.title}</div>
              <div className="text-sm text-muted-foreground">{nextAction.description}</div>
              <div className="space-y-1.5 pt-1">
                {stageHints.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    {item.done ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    <span className={item.done ? "text-foreground/90" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={pendingHintsCount > 0 ? "secondary" : "outline"} className="text-xs">
                {pendingHintsCount > 0 ? `Потрібно: ${pendingHintsCount}` : "Готово"}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {statusError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          {statusError}
        </div>
      )}

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
        <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
          <DialogHeader className="p-5 border-b border-border/60 bg-muted/10">
            <DialogTitle className="text-lg">Зміна статусу</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
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
                    {isActive && <Check className="h-4 w-4 ml-auto" />}
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
          <DialogFooter className="px-5 py-4 border-t border-border/60 bg-muted/5">
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
              disabled={statusBusy || statusTarget === currentStatus}
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
        <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
          <DialogHeader className="p-5 border-b border-border/60 bg-muted/10">
            <DialogTitle className="text-lg">Скасування прорахунку</DialogTitle>
          </DialogHeader>
          <div className="p-5 space-y-4">
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
          <DialogFooter className="px-5 py-4 border-t border-border/60 bg-muted/5">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* Quote Info Card - Improved */}
          <Card className="p-6 bg-gradient-to-br from-card via-card to-muted/10 border-border/60 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    Замовник
                  </div>
                  <div className="flex items-center gap-3">
                    {quote.customer_logo_url ? (
                      <img
                        src={quote.customer_logo_url}
                        alt={quote.customer_name ?? "logo"}
                        className="h-10 w-10 rounded-full object-cover border border-border/60 bg-muted/20"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full border border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                        {getInitials(quote.customer_name)}
                      </div>
                    )}
                    <div className="font-semibold text-base">{quote.customer_name ?? "Не вказано"}</div>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Створено
                  </div>
                  <div className="font-medium">
                    {quote.created_at ? new Date(quote.created_at).toLocaleDateString("uk-UA", {
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    }) : "Не вказано"}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Менеджер
                  </div>
                  <div className="flex items-center gap-2">
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
                      size={28}
                      className="text-[10px] font-semibold"
                    />
                    <div className="font-medium">
                      {quote.assigned_to
                        ? memberById.get(quote.assigned_to) ?? quote.assigned_to
                        : "Не призначено"}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Shirt className="h-3.5 w-3.5" />
                    Тип прорахунку
                  </div>
                  <div className="font-medium">{formatQuoteType(quote.quote_type)}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    Доставка
                  </div>
                  <div className="font-medium">
                    {formatDeliveryLabel(quote.delivery_type ?? quote.print_type)}
                  </div>
                </div>

                {quote.design_brief || quote.comment ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      ТЗ (коротко)
                    </div>
                    <div className="font-medium text-sm line-clamp-2">{quote.design_brief ?? quote.comment}</div>
                  </div>
                ) : null}

                <div className="space-y-2 sm:col-span-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Дедлайн (готовність до відвантаження)
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[240px_1fr_auto]">
                    <Popover open={deadlinePopoverOpen} onOpenChange={setDeadlinePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 justify-start gap-2 font-normal"
                          onClick={() => setDeadlinePopoverOpen(true)}
                        >
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {deadlineDate ? formatDeadlineLabel(deadlineDate) : "Оберіть дату"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="p-0 w-auto">
                        <CalendarPicker
                          mode="single"
                          selected={toLocalDate(deadlineDate)}
                          onSelect={async (date) => {
                            setDeadlineDate(formatDateInput(date ?? null));
                            setDeadlinePopoverOpen(false);
                            await handleSaveDeadline();
                          }}
                          initialFocus
                        />
                        <div className="flex flex-wrap gap-2 p-3 border-t border-border/60">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              handleDeadlineQuickSet(0);
                              await handleSaveDeadline();
                            }}
                          >
                            Сьогодні
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              handleDeadlineQuickSet(1);
                              await handleSaveDeadline();
                            }}
                          >
                            Завтра
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              handleDeadlineQuickSet(7);
                              await handleSaveDeadline();
                            }}
                          >
                            +7 днів
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              handleDeadlineClear();
                              await handleSaveDeadline();
                            }}
                          >
                            Очистити
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Input
                      className="h-9"
                      placeholder="Коментар до дедлайну (опціонально)"
                      value={deadlineNote}
                      onChange={(e) => setDeadlineNote(e.target.value)}
                      onBlur={handleSaveDeadline}
                      maxLength={200}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={handleSaveDeadline}
                      disabled={deadlineSaving}
                      aria-label="Зберегти дедлайн"
                    >
                      {deadlineSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Поточний дедлайн: {formatDeadlineLabel(deadlineDate)}
                  </div>
                  {deadlineError && (
                    <div className="text-xs text-destructive">{deadlineError}</div>
                  )}
                </div>
              </div>
              
            </div>
            
            {updatedMinutes !== null && <></>}
          </Card>

          {/* Spec (read-only) */}
          <Card className="p-6 bg-muted/10 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold tracking-[0.08em] uppercase flex items-center gap-2">
                <span role="img" aria-hidden="true">📋</span> Специфікація
              </div>
              <Badge variant="secondary" className="gap-1 text-xs">
                <Lock className="h-3.5 w-3.5" />
                Зафіксовано
              </Badge>
            </div>
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/70 p-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30" />
                <div>
                  <p className="font-medium mb-1">Модель не обрана</p>
                  <p className="text-sm text-muted-foreground">Оберіть модель для розрахунку</p>
                </div>
                <Button size="sm" onClick={openNewItem} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Обрати модель
                </Button>
              </div>
            )}

            {itemsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Завантаження...</p>
              </div>
            ) : itemsError ? (
              <div className="text-sm text-destructive py-4">{itemsError}</div>
            ) : items.length === 0 ? null : (
              items.slice(0, 1).map((item) => {
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
                const hasMethodPrints = Boolean(
                  item.methods?.some(
                    (method) =>
                      method.printPositionId || method.printWidthMm || method.printHeightMm
                  )
                );
                const attachmentExtension = getFileExtension(item.attachment?.name);
                const catalogImage = getModelImage(
                  catalogTypes,
                  resolvedTypeId,
                  resolvedKindId,
                  resolvedModelId
                );
                const attachmentPreview =
                  item.attachment?.url && canPreviewImage(attachmentExtension)
                    ? { type: "image" as const, url: item.attachment.url }
                    : item.attachment?.url && canPreviewPdf(attachmentExtension)
                    ? { type: "pdf" as const, url: item.attachment.url }
                    : catalogImage
                    ? { type: "image" as const, url: catalogImage }
                    : null;

                return (
                  <div key={item.id} className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 rounded-xl border border-border/60 bg-muted/30 flex items-center justify-center text-xs text-muted-foreground overflow-hidden">
                        {attachmentPreview?.type === "image" ? (
                          <img
                            src={attachmentPreview.url}
                            alt={item.attachment?.name ?? modelLabel ?? "Візуалізація"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : attachmentPreview?.type === "pdf" ? (
                          <iframe
                            src={`${attachmentPreview.url}#page=1&view=FitH`}
                            title={`Preview ${item.attachment?.name ?? "PDF"}`}
                            className="h-full w-full pointer-events-none"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold truncate">{item.title}</div>
                        {metaLine && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{metaLine}</div>
                        )}
                        {!hasMethodPrints && (positionLabel || sizeLabel) && (
                          <div className="text-xs text-muted-foreground mt-2">
                            {positionLabel ? `Місце: ${positionLabel}` : "Місце: Н/Д"}
                            {sizeLabel ? ` · ${sizeLabel}` : ""}
                          </div>
                        )}
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>
                            Одиниця: <span className="text-foreground">{item.unit}</span>
                          </div>
                          {(positionLabel || sizeLabel) && (
                            <div className="sm:col-span-2 flex items-center gap-2">
                              <Badge variant="outline" className="text-[11px]">
                                Місце нанесення
                              </Badge>
                              <span className="text-foreground">
                                {positionLabel ?? "Не вказано"}
                                {sizeLabel ? ` · ${sizeLabel}` : ""}
                              </span>
                            </div>
                          )}
                          {item.description ? (
                            <div className="sm:col-span-2">
                              Опис: <span className="text-foreground">{item.description}</span>
                            </div>
                          ) : null}
                          {item.attachment ? (
                            <div className="sm:col-span-2">
                              Візуалізація:{" "}
                              <span className="text-foreground">
                                {item.attachment.name} ({formatFileSize(item.attachment.size)})
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {item.methods && item.methods.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {item.methods.map((method) => {
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
                          return (
                            <div
                              key={method.id}
                              className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 flex items-center gap-2"
                            >
                              <Badge variant="secondary" className="text-[11px] font-semibold">
                                {methodName}
                                {method.count > 1 && ` ×${method.count}`}
                              </Badge>
                              <div className="text-[11px] text-muted-foreground">
                                {place}
                                {size ? ` · ${size}` : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div className="mt-4 text-xs text-muted-foreground">
              Щоб змінити специфікацію — створіть новий прорахунок.
            </div>
          </Card>

          {/* Visualization placeholder */}
          <Card className="p-6 bg-muted/10 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold tracking-[0.08em] uppercase flex items-center gap-2">
                <span role="img" aria-hidden="true">🎨</span> Візуалізація
              </div>
            </div>
            <div className="border-2 border-dashed border-border/60 rounded-xl p-10 text-center bg-background/30">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="h-12 w-12 rounded-lg border border-border/60 flex items-center justify-center">
                  <Image className="h-6 w-6" />
                </div>
                <div className="text-sm font-medium text-foreground">Візуалізація ще не додана</div>
                <div className="text-xs text-muted-foreground">
                  Тут будуть макети від дизайнера після їх створення
                </div>
                <Badge variant="outline" className="text-[11px] px-3">
                  Скоро буде доступно
                </Badge>
              </div>
            </div>
          </Card>

          {/* Calculation (manager) */}
          <Card className="p-6 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold flex items-center gap-2">
                💰 Розрахунок
              </div>
              {canEditRuns ? (
                <Button variant="outline" size="sm" onClick={addRun} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Додати тираж
                </Button>
              ) : null}
            </div>

            {runsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Завантаження...</p>
              </div>
            ) : runsError ? (
              <div className="text-sm text-destructive py-4">{runsError}</div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/70 p-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30" />
                <div>
                  <p className="font-medium mb-1">Немає тиражів</p>
                  <p className="text-sm text-muted-foreground">Додайте перший тираж для розрахунку</p>
                </div>
                {canEditRuns ? (
                  <Button size="sm" onClick={addRun} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Додати тираж
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className="w-12"></TableHead>
                        <TableHead className="font-semibold w-32">Кількість</TableHead>
                        <TableHead className="font-semibold w-40">
                          Ціна модель, {quote.currency}
                        </TableHead>
                        <TableHead className="font-semibold w-44">
                          Ціна нанесення, {quote.currency}
                        </TableHead>
                        <TableHead className="font-semibold w-40 text-right">Сума</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run, idx) => {
                        const qty = Number(run.quantity) || 0;
                        const modelPrice = Number(run.unit_price_model) || 0;
                        const printPrice = Number(run.unit_price_print) || 0;
                        const logistics = Number(run.logistics_cost) || 0;
                        const total = (modelPrice + printPrice) * qty + logistics;
                        const disabled = !canEditRuns;
                        const isSelected = !!run.id && run.id === selectedRunId;
                        return (
                          <TableRow
                            key={run.id ?? idx}
                            className={cn(isSelected && "bg-primary/5 ring-1 ring-primary/20")}
                          >
                            <TableCell className="w-12">
                              <input
                                type="radio"
                                name="selected-run"
                                className="h-4 w-4 accent-primary"
                                checked={isSelected}
                                onChange={() => setSelectedRunId(run.id ?? null)}
                                aria-label="Обрати тираж"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-9"
                                value={run.quantity ?? ""}
                                disabled={disabled}
                                onChange={(e) => updateRunRaw(idx, "quantity", e.target.value)}
                                onFocus={(e) => {
                                  if (run.quantity === 0) e.target.select();
                                }}
                                min={1}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-9"
                                value={run.unit_price_model ?? ""}
                                disabled={disabled}
                                onChange={(e) => updateRunRaw(idx, "unit_price_model", e.target.value)}
                                onFocus={(e) => {
                                  if (run.unit_price_model === 0) e.target.select();
                                }}
                                min={0}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-9"
                                value={run.unit_price_print ?? ""}
                                disabled={disabled}
                                onChange={(e) => updateRunRaw(idx, "unit_price_print", e.target.value)}
                                onFocus={(e) => {
                                  if (run.unit_price_print === 0) e.target.select();
                                }}
                                min={0}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="text-right font-mono tabular-nums font-semibold">
                                {formatCurrency((modelPrice + printPrice) * qty, quote.currency)}
                                <div className="text-[11px] text-muted-foreground font-normal font-sans">
                                  ({formatCurrencyCompact(modelPrice, quote.currency)} +{" "}
                                  {formatCurrencyCompact(printPrice, quote.currency)}) × {qty}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {!disabled && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:text-destructive"
                                  onClick={() => removeRun(idx)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="text-xs text-muted-foreground">
                  У підсумку використовується обраний тираж.
                </div>
                {selectedUnitCost !== null && (
                  <div className="text-sm text-muted-foreground">
                    Собівартість / од.:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(selectedUnitCost, quote.currency)}
                    </span>
                  </div>
                )}
                {canEditRuns && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={saveRuns} disabled={runsSaving}>
                      {runsSaving ? "Збереження..." : "Зберегти розрахунок"}
                    </Button>
                  </div>
                )}

                <div className="border-t border-border/60 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-base font-semibold flex items-center gap-2">
                      🚚 Логістика
                    </div>
                  </div>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-b">
                          <TableHead className="w-32 font-semibold">Кількість</TableHead>
                          <TableHead className="w-48 font-semibold">Вартість доставки</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((run, idx) => {
                          const qty = Number(run.quantity) || 0;
                          const disabled = !canEditRuns;
                          const isSelected = !!run.id && run.id === selectedRunId;
                          return (
                            <TableRow key={`log-${run.id ?? idx}`} className={cn(isSelected && "bg-primary/5")}>
                              <TableCell className="font-mono tabular-nums">{qty}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="h-9"
                                  value={run.logistics_cost ?? ""}
                                  disabled={disabled}
                                  onChange={(e) => updateRunRaw(idx, "logistics_cost", e.target.value)}
                                  min={0}
                                  placeholder="очікує"
                                  onFocus={(e) => {
                                    if (!run.logistics_cost || Number(run.logistics_cost) === 0) e.target.select();
                                  }}
                                />
                                {(!run.logistics_cost || Number(run.logistics_cost) === 0) && (
                                  <div className="text-[11px] text-muted-foreground mt-1">очікує</div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {canEditRuns && (
                      <div className="flex justify-end gap-2 mt-4">
                        <Button size="sm" onClick={saveRuns} disabled={runsSaving}>
                          {runsSaving ? "Збереження..." : "Зберегти логістику"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Summary Card - Improved */}
          <Card className="p-6 bg-gradient-to-br from-card to-muted/5 border-border/60 shadow-sm">
            <div className="text-lg font-semibold mb-4">Підсумок</div>
            
            <div className="space-y-3">
              {/* Subtotal */}
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Підсумок</span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {formatCurrency(totals.subtotal, quote.currency)}
                </span>
              </div>
              
              {/* Discount */}
              <div className="flex justify-between items-center py-2 border-t border-dashed border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Знижка</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="h-8 w-16 text-right text-sm"
                      placeholder="0"
                      min="0"
                      max="100"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <span className="font-mono text-lg font-semibold text-destructive tabular-nums flex items-center gap-1">
                  <TrendingDown className="h-4 w-4" />
                  {formatCurrency(totals.discountAmount, quote.currency)}
                </span>
              </div>
              
              {/* Tax */}
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Податок</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      className="h-8 w-16 text-right text-sm"
                      placeholder="0"
                      min="0"
                      max="100"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <span className="font-mono text-lg font-semibold text-emerald-600 tabular-nums flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  {formatCurrency(totals.taxAmount, quote.currency)}
                </span>
              </div>
              
              {/* Total */}
              <div className="flex justify-between items-center py-4 border-t-2 border-border">
                <span className="font-semibold text-lg">Загальна сума</span>
                <span className="font-mono text-2xl font-bold text-primary tabular-nums">
                  {formatCurrency(totals.total, quote.currency)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Джерело: {runs.length > 0 ? "Обраний тираж" : "Позиції"}
              </div>
              <div className="text-xs text-muted-foreground">
                Формула: (Підсумок − Знижка) + Податок
              </div>
            </div>
            
            {/* Stats */}
            {items.length > 0 && (
              <div className="mt-4 pt-4 border-t border-dashed border-border/50">
                <div className="text-xs text-muted-foreground space-y-1.5">
                  <div className="flex justify-between">
                    <span>Позицій:</span>
                    <span className="font-medium text-foreground">{items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Середня ціна позиції:</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(totals.subtotal / items.length, quote.currency)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Designer brief */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <FileText className="h-5 w-5" />
                ТЗ для дизайнера
              </div>
              <div className="flex items-center gap-2">
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
                        "Дедлайн:",
                      ].join("\n")
                    );
                    setBriefDirty(true);
                    setBriefError(null);
                  }}
                >
                  Шаблон
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Textarea
                value={briefText}
                onChange={(event) => {
                  setBriefText(event.target.value);
                  setBriefDirty(true);
                }}
                placeholder="Опишіть задачу для дизайнера. Це основне ТЗ, яке бачить команда."
                className="min-h-[180px] resize-y"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{briefText.length} символів</span>
                {briefDirty ? <span>Є незбережені зміни</span> : <span>Усі зміни збережено</span>}
              </div>
              {briefError ? (
                <div className="text-sm text-destructive">{briefError}</div>
              ) : null}
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
                  disabled={!briefDirty || briefSaving}
                  className="gap-2"
                >
                  {briefSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {briefSaving ? "Збереження..." : "Зберегти ТЗ"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Design task */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="h-5 w-5" />
                Дизайн-задача
              </div>
              {designTask ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/design/${designTask.id}`)}
                >
                  Відкрити
                </Button>
              ) : null}
            </div>

            {designTaskLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Завантаження...
              </div>
            ) : designTaskError ? (
              <div className="text-sm text-destructive">{designTaskError}</div>
            ) : designTask ? (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">Виконавець (дизайнер)</div>
                <Select
                  value={designAssigneeId ?? "none"}
                  onValueChange={(value) => void updateDesignAssignee(value === "none" ? null : value)}
                  disabled={designTaskSaving}
                >
                  <SelectTrigger className="h-9 max-w-[280px]">
                    <SelectValue placeholder="Без виконавця" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без виконавця</SelectItem>
                    {designerMembers.length > 0 ? (
                      designerMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.label}
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
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Дизайн-задача ще не створена для цього прорахунку.
                </div>
                <Button size="sm" onClick={() => void createDesignTask()} disabled={designTaskSaving}>
                  {designTaskSaving ? "Створення..." : "Створити задачу"}
                </Button>
              </div>
            )}
          </Card>

          {/* Comments Card - Improved */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <MessageSquare className="h-5 w-5" />
                Коментарі
                {comments.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{comments.length}</Badge>
                )}
              </div>
            </div>
            
            {/* Add comment form first */}
            <div className="space-y-3 mb-4 pb-4 border-b border-border/40">
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
                  className="min-h-[80px] resize-none"
                />

                {mentionContext ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                    {filteredMentionSuggestions.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {filteredMentionSuggestions.map((member, index) => (
                          <button
                            key={member.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
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
                        Немає збігів для @{mentionContext.query}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  {commentText.length} символів
                </span>
                <Button 
                  size="sm" 
                  onClick={handleAddComment} 
                  disabled={!commentText.trim() || commentSaving}
                  className="gap-2"
                >
                  {commentSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {commentSaving ? "Збереження..." : "Додати"}
                </Button>
              </div>
            </div>
            
            {commentsLoading ? (
              <div className="text-center py-6">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Завантаження...</p>
              </div>
            ) : commentsError ? (
              <div className="text-sm text-destructive">{commentsError}</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Коментарів ще немає</p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div 
                    key={comment.id} 
                    className="rounded-lg border border-border/60 p-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-2">
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-medium">
                            {comment.created_by
                              ? memberById.get(comment.created_by) ?? "Користувач"
                              : "Користувач"}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(comment.created_at).toLocaleDateString("uk-UA", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed pl-11">{renderTextWithMentions(comment.body ?? "")}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Files Card - Categorized */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Paperclip className="h-5 w-5" />
                Файли
              </div>
            </div>

            <input
              ref={attachmentsInputRef}
              type="file"
              multiple
              className="hidden"
              accept={ATTACHMENTS_ACCEPT}
              onChange={(event) => uploadAttachments(event.target.files)}
            />

            {attachmentsUploading && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Завантаження файлів...
              </div>
            )}

            {/* Від замовника */}
            <div className="mb-4">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between text-left cursor-pointer"
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
                    <Badge variant="secondary" className="text-[11px]">{attachments.length}</Badge>
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
                <div className="mt-2 space-y-2">
                  {attachmentsLoading ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Завантаження...</p>
                    </div>
                  ) : attachmentsError ? (
                    <div className="text-sm text-destructive">{attachmentsError}</div>
                  ) : attachments.length === 0 ? (
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer",
                        attachmentsDragActive
                          ? "border-primary/60 bg-primary/10"
                          : "border-border/60 hover:border-primary/40 hover:bg-primary/5"
                      )}
                      onClick={() => attachmentsInputRef.current?.click()}
                      onDrop={handleAttachmentsDrop}
                      onDragOver={handleAttachmentsDragOver}
                      onDragLeave={handleAttachmentsDragLeave}
                    >
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm font-medium mb-1">Перетягніть файли сюди</p>
                      <p className="text-xs text-muted-foreground">або натисніть для вибору</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        До {MAX_QUOTE_ATTACHMENTS} файлів · до 50 MB · PDF, AI, SVG, PNG, JPG, ZIP
                      </p>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "space-y-2 rounded-xl border border-dashed border-border/50 p-2",
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
                            className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:bg-muted/20 transition-colors group"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 overflow-visible">
                                {showImagePreview ? (
                                  <img
                                    src={file.url}
                                    alt={file.name}
                                    className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-150"
                                    loading="lazy"
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
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium text-sm truncate" title={file.name}>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => {
                                if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
                              }}
                              disabled={!file.url}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-destructive hover:text-destructive"
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
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Візуалізації */}
            <div className="mb-4">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between text-left cursor-pointer"
                onClick={() => setFilesDesignOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFilesDesignOpen((v) => !v);
                  }
                }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  Візуалізації
                </div>
                <Badge variant="outline" className="text-[11px]">скоро</Badge>
              </div>
              {filesDesignOpen && (
                <div className="mt-2 border border-dashed border-border/50 rounded-xl p-4 text-center text-xs text-muted-foreground">
                  Буде доступно після створення макетів дизайнером.
                </div>
              )}
            </div>

            {/* Документи */}
            <div>
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between text-left cursor-pointer"
                onClick={() => setFilesDocsOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFilesDocsOpen((v) => !v);
                  }
                }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  Документи
                </div>
                <Button size="sm" variant="ghost" className="gap-2" disabled>
                  <Upload className="h-4 w-4" />
                  Додати
                </Button>
              </div>
              {filesDocsOpen && (
                <div className="mt-2 border border-dashed border-border/50 rounded-xl p-4 text-xs text-muted-foreground">
                  Рахунки, договори, акти — скоро буде доступно.
                </div>
              )}
            </div>

            {attachmentsUploadError && (
              <div className="text-xs text-destructive mt-2">{attachmentsUploadError}</div>
            )}
            {attachmentsDeleteError && (
              <div className="text-xs text-destructive mt-2">{attachmentsDeleteError}</div>
            )}
          </Card>

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

          {/* Activity Card */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="text-lg font-semibold mb-4">Активність</div>

            {activityLoading || historyLoading || commentsLoading ? (
              <div className="text-center py-6">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Завантаження...</p>
              </div>
            ) : activityEvents.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Активність порожня</p>
                {(activityError || historyError || commentsError) && (
                  <p className="text-xs text-destructive mt-2">
                    {activityError ?? historyError ?? commentsError}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {(activityError || historyError || commentsError) && (
                  <div className="text-xs text-destructive">
                    {activityError ?? historyError ?? commentsError}
                  </div>
                )}
                {activityGroups.map((group) => (
                  <div key={group.label} className="space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </div>
                    <div className="space-y-4">
                      {group.items.map((event) => {
                        const Icon = event.icon;
                        return (
                          <div key={event.id} className="flex items-start gap-3">
                            <div
                              className={cn(
                                "h-9 w-9 rounded-full border flex items-center justify-center shrink-0",
                                event.accentClass ?? "bg-muted/20 text-muted-foreground border-border"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-medium">{event.title}</div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatActivityClock(event.created_at)}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {event.actorLabel}
                              </div>
                              {event.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {event.description}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Item Modal - Improved with Tabs */}
      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
      <DialogContent className="w-[min(1040px,calc(100vw-32px))] max-h-[90vh] p-0 gap-0 overflow-hidden border border-border/60 bg-card text-foreground">
          <div className="p-6 border-b border-border bg-muted/5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingItemId ? "Редагувати позицію" : "Додати позицію"}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            <Tabs value={itemFormMode} onValueChange={(v) => setItemFormMode(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 rounded-xl bg-muted/30 p-1 shadow-inner">
                <TabsTrigger
                  value="simple"
                  className="rounded-lg py-2.5 text-sm data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50"
                >
                  Проста позиція
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="rounded-lg py-2.5 text-sm data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50"
                >
                  Із каталогу
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="simple" className="space-y-4 mt-0">
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
                        <SelectItem value="шт">шт</SelectItem>
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
                
                {/* Preview */}
                <div className="rounded-lg bg-muted/30 p-4 border border-border/40">
                  <div className="text-xs text-muted-foreground mb-2">Попередній перегляд:</div>
                  <div className="space-y-1">
                    <div className="font-medium">{itemTitle || "Назва позиції"}</div>
                    <div className="text-sm text-muted-foreground">
                      {itemQty || "1"} {itemUnit} × {itemPrice || "0"} = {
                        ((Number(itemQty) || 1) * (Number(itemPrice) || 0)).toLocaleString("uk-UA")
                      }
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
                      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
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
                                  "flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left",
                                  isSelected
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:border-border/60"
                                )}
                              >
                                <span className="font-medium text-sm">{method.name}</span>
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
                          <SelectItem value="шт">шт</SelectItem>
                          <SelectItem value="м">м</SelectItem>
                          <SelectItem value="кг">кг</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Візуалізація (файл)</Label>
                      <div className="rounded-lg border border-dashed border-border/60 p-4 bg-muted/10 space-y-3">
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
                                className="w-full max-h-48 object-contain rounded-md border border-border/50 bg-background"
                              />
                            ) : (
                              <a
                                href={itemAttachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline"
                              >
                                Відкрити PDF
                              </a>
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
                          <div className="text-xs text-muted-foreground">
                            Підтримуються PNG/JPG/PDF.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="sticky top-4 rounded-lg bg-primary/5 border border-primary/20 p-4">
                      <div className="text-xs text-muted-foreground mb-2">Розрахунок ціни:</div>
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
                        <div className="flex justify-between pt-2 border-t border-primary/20 font-semibold">
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

          <DialogFooter className="p-6 border-t border-border bg-muted/5">
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
    </div>
  );
}
