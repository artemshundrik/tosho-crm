import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { notifyUsers } from "@/lib/designTaskActivity";
import {
  listQuotes,
  listQuoteSets,
  listQuoteSetItems,
  listQuoteSetMemberships,
  findQuoteSetsByExactComposition,
  listCustomerQuotes,
  listQuoteItemsForQuotes,
  updateQuoteSetName,
  deleteQuoteSet,
  removeQuoteSetItem,
  addQuotesToQuoteSet,
  listCustomersBySearch,
  listLeadsBySearch,
  createQuote,
  createQuoteSet,
  deleteQuote,
  getQuoteSummary,
  listTeamMembers,
  setStatus as setQuoteStatus,
  updateQuote,
  type QuoteListRow,
  type QuoteSetListRow,
  type QuoteSetItemRow,
  type QuoteSetMembershipInfo,
  type CustomerQuoteRow,
  type QuoteItemExportRow,
  type TeamMemberRow,
  type CustomerRow,
  type LeadSearchRow,
} from "@/lib/toshoApi";
import { NewQuoteDialog } from "@/components/quotes";
import type { NewQuoteFormData } from "@/components/quotes";
import { CustomerDialog } from "@/components/customers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AvatarBase } from "@/components/app/avatar-kit";
import { 
  Search, 
  X, 
  Layers,
  MoreVertical,
  Copy,
  Trash2,
  FileText,
  Plus as PlusIcon,
  Loader2,
  ArrowUpDown,
  Clock,
  XCircle,
  Pencil,
  Calculator,
  Eye,
  Printer,
  Download,
  FileDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ActiveHereCard } from "@/components/app/workspace-presence-widgets";
import {
  DELIVERY_TYPE_OPTIONS,
  KANBAN_COLUMNS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE_BYTES,
  OWNERSHIP_OPTIONS,
  QUOTE_ATTACHMENTS_BUCKET,
  STATUS_OPTIONS,
  VAT_OPTIONS,
  createPrintConfig,
  emptyDeliveryDetails,
  getErrorMessage,
  normalizeStatus,
  quoteTypeIcon,
  quoteTypeLabel,
  statusClasses,
  statusColorClass,
  statusIcons,
  statusLabels,
  type PrintConfig,
} from "@/features/quotes/quotes-page/config";
import { useQuotesPageViewState } from "@/features/quotes/quotes-page/useQuotesPageViewState";
import {
  CONTROL_BASE,
} from "@/components/ui/controlStyles";
import { QuoteDeadlineBadge } from "@/features/quotes/components/QuoteDeadlineBadge";
import { QuoteKindBadge } from "@/features/quotes/components/QuoteKindBadge";
import { PageCanvas, PageCanvasBody, PageCanvasHeader } from "@/components/canvas/PageCanvas";
import { EstimatesModeSwitch } from "@/features/quotes/components/EstimatesModeSwitch";
import { EstimatesTableCanvas } from "@/features/quotes/components/EstimatesTableCanvas";
import { EstimatesKanbanCanvas } from "@/features/quotes/components/EstimatesKanbanCanvas";

type QuotesPageProps = {
  teamId: string;
};

type QuotePartyOption = CustomerRow & {
  entityType?: "customer" | "lead";
};

type CatalogMethod = { id: string; name: string; price?: number };
type CatalogModel = { id: string; name: string; price?: number };
type CatalogPrintPosition = { id: string; label: string; sort_order?: number | null };
type CatalogKind = {
  id: string;
  name: string;
  models: CatalogModel[];
  methods: CatalogMethod[];
  printPositions: CatalogPrintPosition[];
};
type CatalogType = { id: string; name: string; quote_type?: string | null; kinds: CatalogKind[] };
void DELIVERY_TYPE_OPTIONS;

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
};

type CommercialItemRow = {
  id: string;
  position: number;
  imageUrl: string;
  name: string;
  catalogPath: string;
  description: string;
  methodsSummary: string;
  placementSummary: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

type CommercialQuoteSection = {
  quoteId: string;
  quoteNumber: string;
  status: string;
  createdAt: string;
  visualizations: Array<{
    url: string;
    name: string;
  }>;
  items: CommercialItemRow[];
  total: number;
};

type CommercialDocument = {
  title: string;
  kindLabel: string;
  customerName: string;
  createdAt: string;
  generatedAt: string;
  currency: string;
  sections: CommercialQuoteSection[];
  total: number;
};

type QuotesPageCachePayload = {
  rows: QuoteListRow[];
  attachmentCounts: Record<string, number>;
  quoteMembershipEntries?: Array<[string, QuoteSetMembershipInfo]>;
  cachedAt: number;
};

function readQuotesPageCache(teamId: string): QuotesPageCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`quotes-page-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuotesPageCachePayload;
    if (!Array.isArray(parsed.rows)) return null;
    return {
      rows: parsed.rows,
      attachmentCounts:
        parsed.attachmentCounts && typeof parsed.attachmentCounts === "object"
          ? parsed.attachmentCounts
          : {},
      quoteMembershipEntries: Array.isArray(parsed.quoteMembershipEntries)
        ? parsed.quoteMembershipEntries.filter(
            (entry): entry is [string, QuoteSetMembershipInfo] =>
              Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string"
          )
        : [],
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function readQuotesPageMembersCache(teamId: string): TeamMemberRow[] {
  if (typeof window === "undefined" || !teamId) return [];
  try {
    const raw = sessionStorage.getItem(`quotes-page-members:${teamId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is TeamMemberRow =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as TeamMemberRow).id === "string" &&
        typeof (row as TeamMemberRow).label === "string"
    );
  } catch {
    return [];
  }
}

function isBrokenSupabaseRestUrl(value?: string | null): boolean {
  if (!value) return false;
  return /\/rest\/v1\//i.test(value);
}

export function QuotesPage({ teamId }: QuotesPageProps) {
  const initialCache = readQuotesPageCache(teamId);
  const initialTeamMembers = readQuotesPageMembersCache(teamId);
  const navigate = useNavigate();
  const workspacePresence = useWorkspacePresence();
  const [rows, setRows] = useState<QuoteListRow[]>(() => initialCache?.rows ?? []);
  const [loading, setLoading] = useState(() => !(initialCache && initialCache.rows.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState("all");
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>(() => initialTeamMembers);
  const [teamMembersLoaded, setTeamMembersLoaded] = useState(() => initialTeamMembers.length > 0);
  const [rowStatusBusy, setRowStatusBusy] = useState<string | null>(null);
  const [rowStatusError, setRowStatusError] = useState<string | null>(null);
  const [rowDeleteBusy, setRowDeleteBusy] = useState<string | null>(null);
  const [rowDeleteError, setRowDeleteError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuoteListRow | null>(null);
  const [editInitialValues, setEditInitialValues] = useState<Partial<NewQuoteFormData> | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<QuotePartyOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDropdownTimer = useRef<number | null>(null);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [customerCreateSaving, setCustomerCreateSaving] = useState(false);
  const [customerCreateError, setCustomerCreateError] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    legalName: "",
    manager: "",
    ownershipType: "",
    vatRate: "none",
    taxId: "",
    website: "",
    iban: "",
    logoUrl: "",
    contactName: "",
    contactPosition: "",
    contactPhone: "",
    contactEmail: "",
    contactBirthday: "",
    signatoryName: "",
    signatoryPosition: "",
    reminderDate: "",
    reminderTime: "",
    reminderComment: "",
    eventName: "",
    eventDate: "",
    eventComment: "",
    notes: "",
  });
  const [quoteType, setQuoteType] = useState("merch");
  const [catalogTypes, setCatalogTypes] = useState<CatalogType[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedKindId, setSelectedKindId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [printConfigs, setPrintConfigs] = useState<PrintConfig[]>(() => [createPrintConfig()]);
  const [printMode, setPrintMode] = useState<"with_print" | "no_print">("with_print");
  const [itemQty, setItemQty] = useState("1");
  const [itemUnit, setItemUnit] = useState("шт");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineNote, setDeadlineNote] = useState("");
  const [comment, setComment] = useState("");
  const [assignedTo, setAssignedTo] = useState("unassigned");
  const [currency, setCurrency] = useState("UAH");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "kanban">(() => {
    const saved = localStorage.getItem("quotes_view_mode");
    return saved === "kanban" ? "kanban" : "table";
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [dragPlaceholder, setDragPlaceholder] = useState<{
    columnId: string;
    index: number;
  } | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>(
    () => initialCache?.attachmentCounts ?? {}
  );
  const [createStep, setCreateStep] = useState<1 | 2 | 3 | 4>(1);
  const [sortBy, setSortBy] = useState<"date" | "number" | null>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [quickFilter, setQuickFilter] = useState<"all" | "new" | "estimated">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [quoteSets, setQuoteSets] = useState<QuoteSetListRow[]>([]);
  const [quoteSetsLoading, setQuoteSetsLoading] = useState(false);
  const [quoteMembershipByQuoteId, setQuoteMembershipByQuoteId] = useState<
    Map<string, QuoteSetMembershipInfo>
  >(
    () =>
      new Map<string, QuoteSetMembershipInfo>(
        initialCache?.quoteMembershipEntries ?? []
      )
  );
  const [contentView, setContentView] = useState<"quotes" | "sets" | "all">("quotes");
  const [quoteListMode, setQuoteListMode] = useState<"flat" | "grouped">("flat");
  const [quoteSetSearch, setQuoteSetSearch] = useState("");
  const [quoteSetKindFilter, setQuoteSetKindFilter] = useState<"all" | "kp" | "set">("all");
  const [quoteSetDetailsOpen, setQuoteSetDetailsOpen] = useState(false);
  const [quoteSetDetailsLoading, setQuoteSetDetailsLoading] = useState(false);
  void rowStatusBusy;
  void customerDropdownOpen;
  void catalogLoading;
  void catalogError;
  void setPrintMode;
  void createError;
  void creating;
  void attachmentsError;
  void attachmentCounts;
  const [quoteSetDetailsItems, setQuoteSetDetailsItems] = useState<QuoteSetItemRow[]>([]);
  const [quoteSetDetailsTarget, setQuoteSetDetailsTarget] = useState<QuoteSetListRow | null>(null);
  const [quoteSetEditName, setQuoteSetEditName] = useState("");
  const [quoteSetActionBusy, setQuoteSetActionBusy] = useState(false);
  const [quoteSetCandidateQuotes, setQuoteSetCandidateQuotes] = useState<CustomerQuoteRow[]>([]);
  const [quoteSetCandidateId, setQuoteSetCandidateId] = useState("");
  const [quoteSetCandidatesLoading, setQuoteSetCandidatesLoading] = useState(false);
  const [quoteSetPreviewOpen, setQuoteSetPreviewOpen] = useState(false);
  const [quoteSetCommercialDoc, setQuoteSetCommercialDoc] = useState<CommercialDocument | null>(null);
  const [quoteSetCommercialLoading, setQuoteSetCommercialLoading] = useState(false);
  const [quoteSetDialogOpen, setQuoteSetDialogOpen] = useState(false);
  const [quoteSetName, setQuoteSetName] = useState("");
  const [quoteSetSaving, setQuoteSetSaving] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTargetQuote, setQuickAddTargetQuote] = useState<QuoteListRow | null>(null);
  const [quickAddTargetSetId, setQuickAddTargetSetId] = useState("");
  const [quickAddKindFilter, setQuickAddKindFilter] = useState<"all" | "kp" | "set">("all");
  const [quickAddLoadingSets, setQuickAddLoadingSets] = useState(false);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [bulkAddExistingOpen, setBulkAddExistingOpen] = useState(false);
  const [bulkAddKindFilter, setBulkAddKindFilter] = useState<"all" | "kp" | "set">("all");
  const [bulkAddTargetSetId, setBulkAddTargetSetId] = useState("");
  const [bulkAddBusy, setBulkAddBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [currentUserManagerLabel, setCurrentUserManagerLabel] = useState("");
  const quotesLoadRequestIdRef = useRef(0);
  const cacheKey = `quotes-page-cache:${teamId}`;

  // Get current user ID
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setCurrentUserId(user?.id);
      const fullNameRaw = user?.user_metadata?.full_name;
      const fullName = typeof fullNameRaw === "string" ? fullNameRaw.trim() : "";
      const emailLocalPart = user?.email?.split("@")[0]?.trim() ?? "";
      setCurrentUserManagerLabel(fullName || emailLocalPart);
    });
  }, []);

  const memberById = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member.label])),
    [teamMembers]
  );
  useEffect(() => {
    if (!currentUserId) return;
    const label = memberById.get(currentUserId)?.trim();
    if (label) setCurrentUserManagerLabel(label);
  }, [currentUserId, memberById]);
  const memberAvatarById = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member.avatarUrl ?? null])),
    [teamMembers]
  );
  const getManagerLabel = (assignedTo?: string | null) => {
    if (!assignedTo) return "Не вказано";
    const label = memberById.get(assignedTo);
    if (label) return label;
    return teamMembersLoaded ? "Користувач" : "Не вказано";
  };

  const selectedType = useMemo(
    () => catalogTypes.find((t) => t.id === selectedTypeId),
    [catalogTypes, selectedTypeId]
  );
// eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedKinds = selectedType?.kinds ?? [];
  const selectedKind = useMemo(
    () => selectedKinds.find((k) => k.id === selectedKindId),
    [selectedKinds, selectedKindId]
  );
// eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedModels = selectedKind?.models ?? [];
  const selectedModel = useMemo(
    () => selectedModels.find((m) => m.id === selectedModelId),
    [selectedModels, selectedModelId]
  );
  const availableMethods = selectedKind?.methods ?? [];
  const availablePrintPositions = selectedKind?.printPositions ?? [];
  const hasValidPrintConfigs =
    printConfigs.length > 0 && printConfigs.every((print) => print.methodId && print.positionId);
  void availableMethods;
  void availablePrintPositions;
  void hasValidPrintConfigs;

  const formatStatusLabel = (value: string | null | undefined) => {
    const normalized = normalizeStatus(value);
    return (normalized && statusLabels[normalized]) || value || "Не вказано";
  };

  const statusPillClasses = (value: string | null | undefined) => {
    const normalized = normalizeStatus(value);
    return statusClasses[normalized] ?? "bg-muted/40 text-muted-foreground border-border";
  };

  const customerLabel = useMemo(() => {
    if (!customerId) return "";
    const match = customers.find((c) => c.id === customerId);
    return match?.name || match?.legal_name || "";
  }, [customers, customerId]);
  void customerLabel;

  const getInitials = (name?: string | null) => {
    if (!name) return "Не вказано";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "Не вказано";
    const first = parts[0][0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
    return (first + last).toUpperCase();
  };

  const getDateLabels = (value?: string | null) => {
    if (!value) return "Не вказано";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Не вказано";
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24));
    const dateLabel = date.toLocaleDateString("uk-UA");
    const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 0) return { primary: "Сьогодні", secondary: `${dateLabel} · ${time}` };
    if (diffDays === 1) return { primary: "Вчора", secondary: `${dateLabel} · ${time}` };
    return { primary: dateLabel, secondary: time };
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
    if (Number.isNaN(date.getTime())) {
      return { label: "Не вказано", tone: "none" as const };
    }
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDeadline = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Прострочено (${Math.abs(diffDays)} дн.)`,
        tone: "overdue" as const,
      };
    }
    if (diffDays === 0) {
      return {
        label: "Сьогодні",
        tone: "today" as const,
      };
    }
    if (diffDays <= 2) {
      return {
        label: diffDays === 1 ? "Завтра" : `Через ${diffDays} дн.`,
        tone: "soon" as const,
      };
    }
    return {
      label: date.toLocaleDateString("uk-UA"),
      tone: "future" as const,
    };
  };

  const formatDeadlineShort = (value: string) => {
    const date = parseDateOnly(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  };

  const formatFileSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exp;
    return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
  };
  void formatFileSize;

  const isImageFile = (file: File) => file.type.startsWith("image/");

  const revokeAttachmentPreviews = (attachments: PendingAttachment[]) => {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
  };

  useEffect(() => {
    if (createOpen) return;
    if (pendingAttachments.length === 0) return;
    revokeAttachmentPreviews(pendingAttachments);
    setPendingAttachments([]);
    setAttachmentsError(null);
    if (attachmentsInputRef.current) {
      attachmentsInputRef.current.value = "";
    }
  }, [createOpen, pendingAttachments]);

  useEffect(() => {
    let active = true;
    const loadMembers = async () => {
      if (active) setTeamMembersLoaded(false);
      try {
        const data = await listTeamMembers(teamId);
        if (active) {
          setTeamMembers(data);
          setTeamMembersLoaded(true);
          try {
            sessionStorage.setItem(`quotes-page-members:${teamId}`, JSON.stringify(data));
          } catch {
            // ignore cache persistence failures
          }
        }
      } catch {
        if (active) {
          setTeamMembersLoaded(true);
        }
      }
    };
    if (teamId) void loadMembers();
    return () => {
      active = false;
    };
  }, [teamId]);

  useEffect(() => {
    if (!createOpen) return;
    if (!customerSearch.trim()) {
      setCustomers([]);
      setCustomersLoading(false);
      return;
    }
    const id = window.setTimeout(async () => {
      setCustomersLoading(true);
      try {
        const data = await listCustomersBySearch(teamId, customerSearch);
        setCustomers(data);
      } catch {
        setCustomers([]);
      } finally {
        setCustomersLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [customerSearch, createOpen, teamId]);

  useEffect(() => {
    if (!createOpen || !teamId) return;
    let cancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const { data: typeRows, error: typeError } = await supabase
          .schema("tosho")
          .from("catalog_types")
          .select("id,name,quote_type,sort_order")
          .eq("team_id", teamId)
          .eq("quote_type", quoteType)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (typeError) throw typeError;

        const typeIds = (typeRows ?? []).map((row) => row.id);

        const { data: kindRows, error: kindError } = typeIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_kinds")
              .select("id,type_id,name,sort_order")
              .eq("team_id", teamId)
              .in("type_id", typeIds)
              .order("sort_order", { ascending: true })
              .order("name", { ascending: true })
          : { data: [], error: null };
        if (kindError) throw kindError;

        const kindIds = (kindRows ?? []).map((row) => row.id);

        const { data: modelRows, error: modelError } = kindIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_models")
              .select("id,kind_id,name,price")
              .eq("team_id", teamId)
              .in("kind_id", kindIds)
              .order("name", { ascending: true })
          : { data: [], error: null };
        if (modelError) throw modelError;

        const { data: methodRows, error: methodError } = kindIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_methods")
              .select("id,kind_id,name,price")
              .eq("team_id", teamId)
              .in("kind_id", kindIds)
              .order("name", { ascending: true })
          : { data: [], error: null };
        if (methodError) throw methodError;

        const { data: printRows, error: printError } = kindIds.length
          ? await supabase
              .schema("tosho")
              .from("catalog_print_positions")
              .select("id,kind_id,label,sort_order")
              .in("kind_id", kindIds)
              .order("sort_order", { ascending: true })
              .order("label", { ascending: true })
          : { data: [], error: null };
        if (printError) throw printError;

        const methodsByKind = new Map<string, CatalogMethod[]>();
        (methodRows ?? []).forEach((row) => {
          const list = methodsByKind.get(row.kind_id) ?? [];
          list.push({ id: row.id, name: row.name, price: row.price ?? undefined });
          methodsByKind.set(row.kind_id, list);
        });

        const modelsByKind = new Map<string, CatalogModel[]>();
        (modelRows ?? []).forEach((row) => {
          const list = modelsByKind.get(row.kind_id) ?? [];
          list.push({ id: row.id, name: row.name, price: row.price ?? undefined });
          modelsByKind.set(row.kind_id, list);
        });

        const printPositionsByKind = new Map<string, CatalogPrintPosition[]>();
        (printRows ?? []).forEach((row) => {
          const list = printPositionsByKind.get(row.kind_id) ?? [];
          list.push({ id: row.id, label: row.label, sort_order: row.sort_order ?? undefined });
          printPositionsByKind.set(row.kind_id, list);
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
          quote_type: row.quote_type ?? null,
          kinds: kindsByType.get(row.id) ?? [],
        }));

        if (!cancelled) {
          setCatalogTypes(nextCatalog);
          const nextTypeId = nextCatalog[0]?.id ?? "";
          const nextKindId = nextCatalog[0]?.kinds[0]?.id ?? "";
          const nextModelId = nextCatalog[0]?.kinds[0]?.models[0]?.id ?? "";
          setSelectedTypeId(nextTypeId);
          setSelectedKindId(nextKindId);
          setSelectedModelId(nextModelId);
          setPrintConfigs([createPrintConfig()]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setCatalogError(getErrorMessage(e, "Не вдалося завантажити каталог."));
          setCatalogTypes([]);
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [createOpen, teamId, quoteType]);

  const loadQuotes = async () => {
    const requestId = ++quotesLoadRequestIdRef.current;
    const isBlockingLoad = rows.length === 0;
    if (isBlockingLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const data = await listQuotes({ teamId, search, status });
      const normalizeLogo = (url?: string | null) =>
        url && !isBrokenSupabaseRestUrl(url) ? url : null;

      const missingCustomerIds = Array.from(
        new Set(
          data
            .filter((row) => row.customer_id && !row.customer_name)
            .map((row) => row.customer_id as string)
        )
      );
      let customerMetaById = new Map<string, { name?: string | null; legal_name?: string | null; logo_url?: string | null }>();
      if (missingCustomerIds.length > 0) {
        const loadCustomers = async (withLogo: boolean) => {
          const columns = withLogo ? "id,name,legal_name,logo_url" : "id,name,legal_name";
          return await supabase.schema("tosho").from("customers").select(columns).in("id", missingCustomerIds);
        };
        let { data: customerRows, error: customersError } = await loadCustomers(true);
        if (
          customersError &&
          /column/i.test(customersError.message ?? "") &&
          /logo_url/i.test(customersError.message ?? "")
        ) {
          ({ data: customerRows, error: customersError } = await loadCustomers(false));
        }
        if (!customersError) {
          const rows = ((customerRows ?? []) as unknown) as Array<{
            id: string;
            name?: string | null;
            legal_name?: string | null;
            logo_url?: string | null;
          }>;
          customerMetaById = new Map(rows.map((row) => [row.id, row]));
        }
      }

      const previousById = new Map(rows.map((row) => [row.id, row]));
      const mergedRows = data.map((row) => {
        const prev = previousById.get(row.id);
        const customerMeta = row.customer_id ? customerMetaById.get(row.customer_id) : undefined;
        return {
          ...row,
          customer_name: row.customer_name ?? customerMeta?.name ?? customerMeta?.legal_name ?? prev?.customer_name ?? null,
          customer_logo_url: normalizeLogo(
            row.customer_logo_url ?? customerMeta?.logo_url ?? prev?.customer_logo_url ?? null
          ),
        };
      });
      const ids = mergedRows.map((row) => row.id).filter(Boolean);
      const [membershipMap, counts] = await Promise.all([
        (async () => {
          if (ids.length === 0) return new Map<string, QuoteSetMembershipInfo>();
          try {
            return await listQuoteSetMemberships(teamId, ids);
          } catch {
            return new Map<string, QuoteSetMembershipInfo>();
          }
        })(),
        (async () => {
          if (ids.length === 0) return {} as Record<string, number>;
          try {
            const { data: attachmentRows, error: attachmentsError } = await supabase
              .schema("tosho")
              .from("quote_attachments")
              .select("quote_id")
              .in("quote_id", ids);
            if (attachmentsError) throw attachmentsError;
            const nextCounts: Record<string, number> = {};
            (attachmentRows ?? []).forEach((row) => {
              const quoteId = row.quote_id as string | undefined;
              if (!quoteId) return;
              nextCounts[quoteId] = (nextCounts[quoteId] ?? 0) + 1;
            });
            return nextCounts;
          } catch {
            return {} as Record<string, number>;
          }
        })(),
      ]);

      if (requestId !== quotesLoadRequestIdRef.current) return;
      setRows(mergedRows);
      setQuoteMembershipByQuoteId(membershipMap);
      setAttachmentCounts(counts);

      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            rows: mergedRows,
            attachmentCounts: counts,
            quoteMembershipEntries: Array.from(membershipMap.entries()),
            cachedAt: Date.now(),
          })
        );
      } catch {
        // ignore cache persistence failures
      }
    } catch (e: unknown) {
      if (requestId !== quotesLoadRequestIdRef.current) return;
      setError(getErrorMessage(e, "Не вдалося завантажити список."));
      setRows([]);
      setAttachmentCounts({});
      setQuoteMembershipByQuoteId(new Map());
    } finally {
      if (requestId === quotesLoadRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const loadQuoteSets = async () => {
    if (!teamId) return;
    setQuoteSetsLoading(true);
    try {
      const data = await listQuoteSets(teamId, 20);
      setQuoteSets(data);
    } catch {
      setQuoteSets([]);
    } finally {
      setQuoteSetsLoading(false);
    }
  };

  const openQuoteSetDetails = async (target: QuoteSetListRow) => {
    setQuoteSetDetailsTarget(target);
    setQuoteSetEditName(target.name ?? "");
    setQuoteSetDetailsOpen(true);
    setQuoteSetDetailsLoading(true);
    try {
      const items = await listQuoteSetItems(teamId, target.id);
      setQuoteSetDetailsItems(items);
      const excludedIds = new Set(items.map((item) => item.quote_id));
      setQuoteSetCandidatesLoading(true);
      try {
        const customerQuotes = await listCustomerQuotes({
          teamId,
          customerId: target.customer_id,
          limit: 300,
        });
        const available = customerQuotes.filter((quote) => !excludedIds.has(quote.id));
        setQuoteSetCandidateQuotes(available);
        setQuoteSetCandidateId(available[0]?.id ?? "");
      } catch {
        setQuoteSetCandidateQuotes([]);
        setQuoteSetCandidateId("");
      } finally {
        setQuoteSetCandidatesLoading(false);
      }
    } catch {
      setQuoteSetDetailsItems([]);
      setQuoteSetCandidateQuotes([]);
      setQuoteSetCandidateId("");
    } finally {
      setQuoteSetDetailsLoading(false);
    }
  };

  useEffect(() => {
    const cached = readQuotesPageCache(teamId);
    if (cached && cached.rows.length > 0) {
      setRows(cached.rows);
      setAttachmentCounts(cached.attachmentCounts ?? {});
      setQuoteMembershipByQuoteId(new Map(cached.quoteMembershipEntries ?? []));
      setLoading(false);
      return;
    }
    try {
      sessionStorage.removeItem(cacheKey);
    } catch {
      // ignore storage errors
    }
    setRows([]);
    setAttachmentCounts({});
    setQuoteMembershipByQuoteId(new Map());
    setLoading(true);
  }, [cacheKey, teamId]);

  useEffect(() => {
    if (!teamId) return;
    const delay = search.trim() ? 350 : 0;
    const id = window.setTimeout(() => {
      void loadQuotes();
    }, delay);
    return () => window.clearTimeout(id);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, status, search]);

  useEffect(() => {
    if (!teamId) return;
    void loadQuoteSets();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const handleRowStatusChange = async (quoteId: string, nextStatus: string) => {
    setRowStatusBusy(quoteId);
    setRowStatusError(null);
    try {
      await setQuoteStatus({ quoteId, status: nextStatus });
      setRows((prev) =>
        prev.map((row) => (row.id === quoteId ? { ...row, status: nextStatus } : row))
      );
    } catch (e: unknown) {
      setRowStatusError(getErrorMessage(e, "Не вдалося змінити статус."));
    } finally {
      setRowStatusBusy(null);
    }
  };
  void handleRowStatusChange;

  const openCreate = () => {
    revokeAttachmentPreviews(pendingAttachments);
    setCreateOpen(true);
    setCustomerSearch("");
    setCustomerId("");
    setQuoteType("merch");
    setSelectedTypeId("");
    setSelectedKindId("");
    setSelectedModelId("");
    setPrintConfigs([createPrintConfig()]);
    setItemQty("1");
    setItemUnit("шт");
    setDeadlineDate("");
    setDeadlineNote("");
    setComment("");
    setAssignedTo("unassigned");
    setCurrency("UAH");
    setCreateError(null);
    setCustomers([]);
    setPendingAttachments([]);
    setAttachmentsError(null);
    setCreateStep(1);
    setCustomerDropdownOpen(false);
    if (attachmentsInputRef.current) {
      attachmentsInputRef.current.value = "";
    }
    // Load catalog for new form
    loadCatalog();
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const { data, error } = await supabase
        .schema("tosho")
        .from("catalog_types")
        .select(`
          id,
          name,
          quote_type,
          kinds:catalog_kinds!inner(
            id,
            name,
            models:catalog_models!inner(id, name, price)
          )
        `)
        .eq("team_id", teamId)
        .order("name");
      if (error) throw error;
      setCatalogTypes(((data as unknown) as CatalogType[]) ?? []);
    } catch (e: unknown) {
      setCatalogError(getErrorMessage(e, "Не вдалося завантажити каталог."));
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleCustomerSearchChange = async (search: string) => {
    if (!search.trim()) {
      setCustomers([]);
      return;
    }
    setCustomersLoading(true);
    try {
      const [customerRows, leadRows] = await Promise.all([
        listCustomersBySearch(teamId, search),
        listLeadsBySearch(teamId, search).catch(() => [] as LeadSearchRow[]),
      ]);
      const leadOptions: QuotePartyOption[] = leadRows.map((lead) => ({
        id: lead.id,
        name: lead.company_name ?? lead.legal_name ?? null,
        legal_name: lead.legal_name ?? null,
        entityType: "lead",
      }));
      const customerOptions: QuotePartyOption[] = customerRows.map((customer) => ({
        ...customer,
        entityType: "customer",
      }));
      setCustomers([...customerOptions, ...leadOptions]);
    } catch {
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  // ✨ New Linear-style form submit handler
  const handleNewFormSubmit = async (data: NewQuoteFormData) => {
    setCreating(true);
    setCreateError(null);

    try {
      if (!teamId) {
        throw new Error("Команда не визначена. Оновіть сторінку й спробуйте ще раз.");
      }
      // 1. Create quote
      const formatDateOnly = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };
      const deadlineAt = data.deadline ? formatDateOnly(data.deadline) : null;
      const selectedParty = customers.find(
        (item) => item.id === data.customerId && (item.entityType ?? "customer") === (data.customerType ?? "customer")
      );
      const customerIdForQuote = data.customerType === "lead" ? null : data.customerId ?? null;
      const quoteTitleFromLead =
        data.customerType === "lead"
          ? (selectedParty?.name || selectedParty?.legal_name || "Лід").trim()
          : null;

      const created = await createQuote({
        teamId,
        customerId: customerIdForQuote,
        title: quoteTitleFromLead,
        quoteType: data.quoteType,
        deliveryType: data.deliveryType?.trim() ? data.deliveryType : null,
        deliveryDetails: data.deliveryDetails ?? null,
        comment: data.comment?.trim() || data.deadlineNote?.trim() || null,
        designBrief: data.comment?.trim() || data.deadlineNote?.trim() || null,
        currency: data.currency,
        assignedTo: data.managerId || null,
        deadlineAt,
        deadlineNote: data.deadlineNote?.trim() || null,
      });

      if (!created?.id) {
        throw new Error("Failed to create quote");
      }

      // Resolve catalog selections (may be reused below)
      const type = catalogTypes.find((t) => t.id === data.categoryId);
      const kind = type?.kinds.find((k) => k.id === data.kindId);
      const model = kind?.models.find((m) => m.id === data.modelId);

      // 2. Create quote item if model is selected
      if (data.modelId && data.quantity) {

        // Prepare methods payload from print applications
        const isUuid = (value?: string | null) =>
          typeof value === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
          );
        const methodsPayload = data.printApplications.length > 0
          ? data.printApplications.map((app) => ({
              method_id: isUuid(app.method) ? app.method : null,
              count: 1,
              print_position_id: isUuid(app.position) ? app.position : null,
              print_width_mm: app.width ? Number(app.width) : null,
              print_height_mm: app.height ? Number(app.height) : null,
            }))
          : null;

        const primaryPrint = methodsPayload?.[0] ?? null;

        const { error: itemError } = await supabase
          .schema("tosho")
          .from("quote_items")
          .insert({
            id: crypto.randomUUID(),
            team_id: teamId,
            quote_id: created.id,
            position: 1,
            name: model?.name ?? "Позиція",
            description: null,
            qty: data.quantity,
            unit_price: model?.price ?? 0,
            line_total: data.quantity * (model?.price ?? 0),
            catalog_type_id: data.categoryId,
            catalog_kind_id: data.kindId,
            catalog_model_id: data.modelId,
            print_position_id: primaryPrint?.print_position_id ?? null,
            print_width_mm: primaryPrint?.print_width_mm ?? null,
            print_height_mm: primaryPrint?.print_height_mm ?? null,
            methods: methodsPayload,
            unit: data.quantityUnit,
          });
        if (itemError) throw itemError;
      }

      // 3. Optionally create design task (lightweight, via activity_log)
      const shouldCreateDesignTask =
        data.createDesignTask &&
        (data.printApplications.length > 0 || data.files.length > 0);
      let createdDesignTaskId: string | null = null;
      if (shouldCreateDesignTask && teamId) {
        const actorName =
          currentUserId && memberById.get(currentUserId)
            ? (memberById.get(currentUserId) as string)
            : "System";
        const modelName = model?.name ?? "Позиція";
        const designDeadline = deadlineAt;
        const assigneeUserId = data.designAssigneeId ?? null;
        const assignedAt = assigneeUserId ? new Date().toISOString() : null;
        const { data: designTaskRow, error: designTaskError } = await supabase
          .from("activity_log")
          .insert({
            team_id: teamId,
            user_id: currentUserId ?? null,
            actor_name: actorName,
            action: "design_task",
            entity_type: "design_task",
            entity_id: created.id,
            title: `Дизайн: ${modelName}`,
            metadata: {
              source: "design_task_created",
              status: "new",
              quote_id: created.id,
              design_task_id: null,
              assignee_user_id: assigneeUserId,
              assigned_at: assignedAt,
              quote_type: data.quoteType,
              methods_count: data.printApplications.length,
              has_files: data.files.length > 0,
              design_deadline: designDeadline,
              deadline: designDeadline,
              design_brief: data.comment?.trim() || data.deadlineNote?.trim() || null,
              model: modelName,
            },
          })
          .select("id")
          .single();
        if (designTaskError) throw designTaskError;

        createdDesignTaskId = (designTaskRow as { id?: string } | null)?.id ?? null;

        if (createdDesignTaskId) {
          try {
            const workspaceId = currentUserId ? await resolveWorkspaceId(currentUserId) : null;
            if (workspaceId) {
              const { data: membersData, error: membersError } = await supabase
                .schema("tosho")
                .from("memberships_view")
                .select("user_id,job_role")
                .eq("workspace_id", workspaceId);
              if (membersError) throw membersError;

              const designerUserIds = Array.from(
                new Set(
                  ((membersData as Array<{ user_id: string; job_role: string | null }> | null) ?? [])
                    .filter((row) => {
                      const normalized = (row.job_role ?? "").trim().toLowerCase();
                      return normalized === "designer" || normalized === "дизайнер";
                    })
                    .map((row) => row.user_id)
                    .filter((userId) => !!userId && userId !== currentUserId)
                )
              );

              const quoteLabel = `#${created.id.slice(0, 8)}`;
              if (assigneeUserId) {
                if (assigneeUserId !== currentUserId) {
                  await notifyUsers({
                    userIds: [assigneeUserId],
                    title: "Вас призначено на дизайн-задачу",
                    body: `${actorName} призначив(ла) вас на задачу по прорахунку ${quoteLabel}.`,
                    href: `/design/${createdDesignTaskId}`,
                    type: "info",
                  });
                }
              } else if (designerUserIds.length > 0) {
                await notifyUsers({
                  userIds: designerUserIds,
                  title: "Нова дизайн-задача",
                  body: `${actorName} створив(ла) дизайн-задачу по прорахунку ${quoteLabel}.`,
                  href: `/design/${createdDesignTaskId}`,
                  type: "info",
                });
              }
            }
          } catch (notifyError) {
            console.warn("Failed to notify designers about new design task", notifyError);
          }
        }
      }

      // 3. Upload files if any
      let attachmentWarning: string | null = null;
      if (data.files.length > 0) {
        try {
          await uploadFilesForQuote(created.id, data.files);
        } catch (attachmentError: unknown) {
          attachmentWarning = getErrorMessage(attachmentError, "Не вдалося завантажити файли.");
        }
      }

      // 4. Success - close form and navigate
      setCreateOpen(false);

      await loadQuotes();
      navigate(`/orders/estimates/${created.id}`);

      // Show toast
      if (attachmentWarning) {
        toast.error("Файли не завантажено повністю", {
          description: attachmentWarning,
        });
      } else {
        toast.success("Прорахунок створено!", {
          description: `#${created.id.slice(0, 8)}`,
        });
      }
    } catch (e: unknown) {
      console.error("Error creating quote:", e);
      setCreateError(getErrorMessage(e, "Не вдалося створити прорахунок."));
      toast.error("Помилка створення прорахунку", {
        description: getErrorMessage(e, ""),
      });
    } finally {
      setCreating(false);
    }
  };

  const validateStep1 = () => {
    setCreateError(null);
    if (!customerId) {
      setCreateError("Оберіть клієнта.");
      return false;
    }
    return true;
  };

  const closeCustomerDropdown = () => {
    if (customerDropdownTimer.current) {
      window.clearTimeout(customerDropdownTimer.current);
      customerDropdownTimer.current = null;
    }
    setCustomerDropdownOpen(false);
  };

  const resetCustomerForm = (prefillName = "") => {
    setCustomerForm({
      name: prefillName,
      legalName: "",
      manager: currentUserManagerLabel,
      ownershipType: "",
      vatRate: "none",
      taxId: "",
      website: "",
      iban: "",
      logoUrl: "",
      contactName: "",
      contactPosition: "",
      contactPhone: "",
      contactEmail: "",
      contactBirthday: "",
      signatoryName: "",
      signatoryPosition: "",
      reminderDate: "",
      reminderTime: "",
      reminderComment: "",
      eventName: "",
      eventDate: "",
      eventComment: "",
      notes: "",
    });
    setCustomerCreateError(null);
  };

  const openCustomerCreate = (prefillName = "") => {
    resetCustomerForm(prefillName);
    setCustomerCreateOpen(true);
  };
  void openCustomerCreate;

  const handleCustomerCreate = async () => {
    if (!teamId) {
      setCustomerCreateError("Не вдалося визначити команду.");
      return;
    }
    if (!customerForm.name.trim()) {
      setCustomerCreateError("Вкажіть назву компанії.");
      return;
    }

    setCustomerCreateSaving(true);
    setCustomerCreateError(null);

    const vatOption = VAT_OPTIONS.find((option) => option.value === customerForm.vatRate);
    const payload: Record<string, unknown> = {
      team_id: teamId,
      name: customerForm.name.trim(),
      legal_name: customerForm.legalName.trim() || null,
      manager: customerForm.manager.trim() || currentUserManagerLabel || null,
      ownership_type: customerForm.ownershipType || null,
      vat_rate: vatOption?.rate ?? null,
      tax_id: customerForm.taxId.trim() || null,
      website: customerForm.website.trim() || null,
      iban: customerForm.iban.trim() || null,
      logo_url: customerForm.logoUrl.trim() || null,
      contact_name: customerForm.contactName.trim() || null,
      contact_position: customerForm.contactPosition || null,
      contact_phone: customerForm.contactPhone.trim() || null,
      contact_email: customerForm.contactEmail.trim() || null,
      contact_birthday: customerForm.contactBirthday || null,
      signatory_name: customerForm.signatoryName.trim() || null,
      signatory_position: customerForm.signatoryPosition.trim() || null,
      reminder_at:
        customerForm.reminderDate && customerForm.reminderTime
          ? `${customerForm.reminderDate}T${customerForm.reminderTime}:00`
          : null,
      reminder_comment: customerForm.reminderComment.trim() || null,
      event_name: customerForm.eventName.trim() || null,
      event_at: customerForm.eventDate || null,
      event_comment: customerForm.eventComment.trim() || null,
      notes: customerForm.notes.trim() || null,
    };

    try {
      const { data, error } = await supabase
        .schema("tosho")
        .from("customers")
        .insert(payload)
        .select("id,name,legal_name")
        .single();
      if (error) throw error;

      const created = data as CustomerRow;
      setCustomers((prev) => {
        const exists = prev.some((row) => row.id === created.id);
        if (exists) return prev;
        return [created, ...prev];
      });
      const label = created.name || created.legal_name || customerForm.name.trim();
      setCustomerId(created.id);
      setCustomerSearch(label);
      closeCustomerDropdown();
      setCustomerCreateOpen(false);
    } catch (err: unknown) {
      setCustomerCreateError(getErrorMessage(err, "Не вдалося створити клієнта."));
    } finally {
      setCustomerCreateSaving(false);
    }
  };

  const validateStep2 = () => {
    setCreateError(null);
    if (!selectedTypeId) {
      setCreateError("Оберіть категорію.");
      return false;
    }
    if (!selectedKindId) {
      setCreateError("Оберіть вид продукції.");
      return false;
    }
    if (!selectedModelId) {
      setCreateError("Оберіть модель.");
      return false;
    }
    const qtyValue = Number(itemQty);
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setCreateError("Вкажіть коректну кількість.");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    setCreateError(null);
    if (printMode === "with_print") {
      if (printConfigs.length === 0) {
        setCreateError("Додайте хоча б одне нанесення або оберіть “Без нанесення”.");
        return false;
      }
      const invalidIndex = printConfigs.findIndex(
        (print) => !print.methodId || !print.positionId
      );
      if (invalidIndex !== -1) {
        const target = printConfigs[invalidIndex];
        setCreateError(
          !target.methodId
            ? `Оберіть тип нанесення у блоці №${invalidIndex + 1}.`
            : `Оберіть місце нанесення у блоці №${invalidIndex + 1}.`
        );
        return false;
      }
      const invalidSizeIndex = printConfigs.findIndex((print) => {
        const width = print.widthMm.trim() ? Number(print.widthMm) : null;
        const height = print.heightMm.trim() ? Number(print.heightMm) : null;
        return (
          (print.widthMm.trim() && Number.isNaN(width)) ||
          (print.heightMm.trim() && Number.isNaN(height))
        );
      });
      if (invalidSizeIndex !== -1) {
        setCreateError(`Вкажіть коректні розміри у блоці №${invalidSizeIndex + 1}.`);
        return false;
      }
    }
    return true;
  };

  const handleStepChange = (target: 1 | 2 | 3 | 4) => {
    if (target <= createStep) {
      setCreateStep(target);
      return;
    }
    if (target === 2 && validateStep1()) {
      setCreateStep(2);
    }
    if (target === 3 && validateStep1() && validateStep2()) {
      setCreateStep(3);
    }
    if (target === 4 && validateStep1() && validateStep2() && validateStep3()) {
      setCreateStep(4);
    }
  };
  void handleStepChange;

  const handleNextStep = () => {
    if (createStep === 1 && validateStep1()) {
      setCreateStep(2);
    }
    if (createStep === 2 && validateStep2()) {
      setCreateStep(3);
    }
    if (createStep === 3 && validateStep3()) {
      setCreateStep(4);
    }
  };
  void handleNextStep;

  const handleAttachmentSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setAttachmentsError(null);

    const currentCount = pendingAttachments.length;
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - currentCount);

    if (remainingSlots === 0) {
      toast.error("Досягнуто ліміт файлів", {
        description: `Можна додати не більше ${MAX_ATTACHMENTS} файлів.`,
      });
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    const rejectedBySize = selected.filter((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    const accepted = selected.filter((file) => file.size <= MAX_ATTACHMENT_SIZE_BYTES);

    if (rejectedBySize.length > 0) {
      toast.error("Деякі файли завеликі", {
        description: `Максимальний розмір одного файлу — 50 MB.`,
      });
    }

    if (accepted.length === 0) return;

    const nextAttachments: PendingAttachment[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
    }));

    setPendingAttachments((prev) => [...prev, ...nextAttachments]);

    if (attachmentsInputRef.current) {
      attachmentsInputRef.current.value = "";
    }
  };
  void handleAttachmentSelect;

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };
  void handleRemoveAttachment;

  const uploadPendingAttachments = async (quoteId: string) => {
    if (pendingAttachments.length === 0) return;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error(getErrorMessage(userError, "Користувач не авторизований"));
    }

    const uploadedBy = userData.user.id;

    let membershipVerified = false;
    let membershipFound = false;
    try {
      const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", uploadedBy)
        .eq("team_id", teamId)
        .maybeSingle();
      if (membershipError) {
        const message = membershipError.message?.toLowerCase?.() ?? "";
        if (!message.includes("does not exist") && !message.includes("relation")) {
          throw membershipError;
        }
        membershipVerified = false;
      }
      if (!membershipError) {
        membershipVerified = true;
        membershipFound = !!membership;
      }
      if (membershipVerified && !membershipFound) {
        throw new Error("Користувач не є членом команди для цього прорахунку.");
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, "").toLowerCase();
      if (!message.includes("does not exist") && !message.includes("relation")) {
        throw error;
      }
    }

    const failures: string[] = [];

    for (const attachment of pendingAttachments) {
      const file = attachment.file;
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
          .from(QUOTE_ATTACHMENTS_BUCKET)
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
          storage_bucket: QUOTE_ATTACHMENTS_BUCKET,
          storage_path: storagePath,
          uploaded_by: uploadedBy,
        });

      if (insertError) {
        failures.push(file.name);
        console.error("Attachment insert failed", insertError);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        failures.length === pendingAttachments.length
          ? "Не вдалося завантажити файли замовника."
          : `Не всі файли завантажилися (${failures.length}/${pendingAttachments.length}).`
      );
    }
  };

  const uploadFilesForQuote = async (quoteId: string, files: File[]) => {
    if (!files || files.length === 0) return;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error(getErrorMessage(userError, "Користувач не авторизований"));
    }

    const uploadedBy = userData.user.id;

    let membershipVerified = false;
    let membershipFound = false;
    try {
      const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", uploadedBy)
        .eq("team_id", teamId)
        .maybeSingle();
      if (membershipError) {
        const message = membershipError.message?.toLowerCase?.() ?? "";
        if (!message.includes("does not exist") && !message.includes("relation")) {
          throw membershipError;
        }
        membershipVerified = false;
      }
      if (!membershipError) {
        membershipVerified = true;
        membershipFound = !!membership;
      }
      if (membershipVerified && !membershipFound) {
        throw new Error("Користувач не є членом команди для цього прорахунку.");
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, "").toLowerCase();
      if (!message.includes("does not exist") && !message.includes("relation")) {
        throw error;
      }
    }

    const failures: string[] = [];

    for (const file of files) {
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
          .from(QUOTE_ATTACHMENTS_BUCKET)
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
          storage_bucket: QUOTE_ATTACHMENTS_BUCKET,
          storage_path: storagePath,
          uploaded_by: uploadedBy,
        });

      if (insertError) {
        failures.push(file.name);
        console.error("Attachment insert failed", insertError);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        failures.length === files.length
          ? "Не вдалося завантажити файли замовника."
          : `Не всі файли завантажилися (${failures.length}/${files.length}).`
      );
    }
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!validateStep1() || !validateStep2() || !validateStep3()) return;
    const qtyValue = Number(itemQty);
    setCreating(true);
    try {
      const created = await createQuote({
        teamId,
        customerId,
        quoteType,
        comment: comment.trim() || null,
        designBrief: comment.trim() || null,
        currency,
        assignedTo: assignedTo === "unassigned" ? null : assignedTo,
        deadlineAt: deadlineDate || null,
        deadlineNote: deadlineNote.trim() || null,
      });
      const basePrice = selectedModel?.price ?? 0;
      const qty = Math.max(1, Math.floor(qtyValue));
      const methodsPayload =
        printMode === "with_print" && printConfigs.length > 0
          ? printConfigs.map((print) => {
              const width = print.widthMm.trim() ? Number(print.widthMm) : null;
              const height = print.heightMm.trim() ? Number(print.heightMm) : null;
              return {
                method_id: print.methodId,
                count: 1,
                print_position_id: print.positionId || null,
                print_width_mm: Number.isNaN(width) ? null : width,
                print_height_mm: Number.isNaN(height) ? null : height,
              };
            })
          : null;
      const primaryPrint = methodsPayload?.[0] ?? null;

      const { error: itemError } = await supabase
        .schema("tosho")
        .from("quote_items")
        .insert({
          id: crypto.randomUUID(),
          team_id: teamId,
          quote_id: created.id,
          position: 1,
          name: selectedModel?.name ?? "Позиція",
          description: null,
          qty,
          unit_price: basePrice,
          line_total: qty * basePrice,
          catalog_type_id: selectedTypeId,
          catalog_kind_id: selectedKindId,
          catalog_model_id: selectedModelId,
          print_position_id: primaryPrint?.print_position_id ?? null,
          print_width_mm: primaryPrint?.print_width_mm ?? null,
          print_height_mm: primaryPrint?.print_height_mm ?? null,
          methods: methodsPayload,
          unit: itemUnit,
        });
      if (itemError) throw itemError;

      let attachmentWarning: string | null = null;
      try {
        await uploadPendingAttachments(created.id);
      } catch (attachmentError: unknown) {
        attachmentWarning = getErrorMessage(attachmentError, "Не вдалося завантажити файли замовника.");
      }

      revokeAttachmentPreviews(pendingAttachments);
      setCreateOpen(false);
      setCustomerId("");
      setCustomerSearch("");
      setQuoteType("merch");
      setSelectedTypeId("");
      setSelectedKindId("");
      setSelectedModelId("");
      setPrintConfigs([createPrintConfig()]);
      setItemQty("1");
      setItemUnit("шт");
      setDeadlineDate("");
      setDeadlineNote("");
      setComment("");
      setAssignedTo("unassigned");
      setCurrency("UAH");
      setCreateError(null);
      setPendingAttachments([]);
      setAttachmentsError(attachmentWarning);
      await loadQuotes();
      navigate(`/orders/estimates/${created.id}`);

      if (attachmentWarning) {
        toast.error("Файли не завантажено повністю", {
          description: attachmentWarning,
        });
      } else if (pendingAttachments.length > 0) {
        toast.success("Файли замовника додано");
      }
    } catch (e: unknown) {
      setCreateError(getErrorMessage(e, "Не вдалося створити прорахунок."));
    } finally {
      setCreating(false);
    }
  };
  void handleCreate;

  const handleSort = (field: "date" | "number") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const {
    addableSelectedCountForOpenSet,
    bulkValidationMessage,
    canRunGroupedActions,
    filteredAndSortedRows,
    filteredQuoteSets,
    foundCount,
    groupedByStatus,
    groupedQuotesView,
    hasActiveFilters,
    quickAddAvailableSets,
    quoteSetKpCount,
    quoteSetSetCount,
    selectionContext,
    selectedRows,
  } = useQuotesPageViewState({
    rows,
    search,
    quickFilter,
    status,
    sortBy,
    sortOrder,
    quoteSets,
    quoteSetSearch,
    quoteSetKindFilter,
    quickAddKindFilter,
    quickAddTargetQuote,
    quoteMembershipByQuoteId,
    contentView,
    selectedIds,
    quoteSetDetailsTarget,
    quoteSetDetailsItems,
  });

  const bulkAddAvailableSets = useMemo(() => {
    if (!canRunGroupedActions || selectedRows.length === 0) return [] as QuoteSetListRow[];
    const customerId = selectedRows[0]?.customer_id ?? null;
    if (!customerId) return [] as QuoteSetListRow[];
    const selectedIdsSet = new Set(selectedRows.map((row) => row.id));
    return quoteSets.filter((set) => {
      if (set.customer_id !== customerId) return false;
      if (bulkAddKindFilter !== "all" && (set.kind ?? "set") !== bulkAddKindFilter) return false;
      return Array.from(selectedIdsSet).some((quoteId) => {
        const refs = quoteMembershipByQuoteId.get(quoteId)?.refs ?? [];
        return !refs.some((ref) => ref.id === set.id);
      });
    });
  }, [
    bulkAddKindFilter,
    canRunGroupedActions,
    quoteMembershipByQuoteId,
    quoteSets,
    selectedRows,
  ]);

  const selectedQuoteCandidate = useMemo(
    () => quoteSetCandidateQuotes.find((quote) => quote.id === quoteSetCandidateId) ?? null,
    [quoteSetCandidateId, quoteSetCandidateQuotes]
  );
  const quoteSetTotalAmount = useMemo(
    () =>
      quoteSetDetailsItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.quote_total ?? NaN) ? Number(item.quote_total) : 0),
        0
      ),
    [quoteSetDetailsItems]
  );
  const quoteSetAverageAmount = useMemo(() => {
    if (quoteSetDetailsItems.length === 0) return 0;
    return quoteSetTotalAmount / quoteSetDetailsItems.length;
  }, [quoteSetDetailsItems.length, quoteSetTotalAmount]);
  const formatMoney = (value: number) =>
    `${new Intl.NumberFormat("uk-UA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)} грн`;
  const formatMoneyPlain = (value: number) =>
    new Intl.NumberFormat("uk-UA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const normalizeTextCell = (value: string) =>
    value.replaceAll(/\s+/g, " ").replaceAll("\t", " ").trim();
  const parseMethodsSummary = (methods: QuoteItemExportRow["methods"]) => {
    if (!Array.isArray(methods) || methods.length === 0) return "";
    const labels = methods
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const row = entry as Record<string, unknown>;
        const methodName = String(row.method_name ?? row.methodName ?? row.name ?? "").trim();
        const count = Number(row.count ?? 1) || 1;
        if (!methodName) return "";
        return count > 1 ? `${methodName} x${count}` : methodName;
      })
      .filter(Boolean);
    return labels.join(", ");
  };
  const parsePlacementSummary = (
    methods: QuoteItemExportRow["methods"],
    printPositionLabelById: Map<string, string>,
    fallbackPositionId?: string | null,
    fallbackWidthMm?: number | null,
    fallbackHeightMm?: number | null
  ) => {
    const parts: string[] = [];
    if (Array.isArray(methods)) {
      methods.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const row = entry as Record<string, unknown>;
        const posId = String(row.print_position_id ?? row.printPositionId ?? "").trim();
        const posLabelRaw = String(row.print_position_label ?? row.printPositionLabel ?? "").trim();
        const widthRaw = row.print_width_mm ?? row.printWidthMm ?? null;
        const heightRaw = row.print_height_mm ?? row.printHeightMm ?? null;
        const width = widthRaw == null || widthRaw === "" ? null : Number(widthRaw);
        const height = heightRaw == null || heightRaw === "" ? null : Number(heightRaw);
        const sizeLabel =
          Number.isFinite(width) && Number.isFinite(height) ? `${width}x${height} мм` : "";
        const posLabel = posLabelRaw || (posId ? printPositionLabelById.get(posId) ?? "" : "");
        const chunk = [posLabel, sizeLabel].filter(Boolean).join(" · ");
        if (chunk) parts.push(chunk);
      });
    }
    if (parts.length > 0) return parts.join(", ");
    const fallbackPositionLabel = fallbackPositionId ? printPositionLabelById.get(fallbackPositionId) ?? "" : "";
    const fallbackSize =
      Number.isFinite(Number(fallbackWidthMm)) && Number.isFinite(Number(fallbackHeightMm))
        ? `${Number(fallbackWidthMm)}x${Number(fallbackHeightMm)} мм`
        : "";
    return [fallbackPositionLabel, fallbackSize].filter(Boolean).join(" · ");
  };

  const getCommercialDocFilename = (doc: CommercialDocument, extension: "xls" | "html") => {
    const raw = `${doc.kindLabel}_${doc.customerName}_${doc.createdAt}`;
    const sanitized = raw
      .toLowerCase()
      .replaceAll(/[^a-zа-яіїєґ0-9]+/gi, "_")
      .replaceAll(/^_+|_+$/g, "")
      .slice(0, 96);
    return `${sanitized || "commercial_offer"}.${extension}`;
  };

  const buildCommercialDocument = async (): Promise<CommercialDocument | null> => {
    if (!quoteSetDetailsTarget) return null;
    const quoteIds = quoteSetDetailsItems.map((item) => item.quote_id).filter(Boolean);
    if (quoteIds.length === 0) return null;

    const itemRows = await listQuoteItemsForQuotes({ teamId, quoteIds });
    const { data: visualizationRows, error: visualizationsError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("quote_id,file_name,mime_type,storage_bucket,storage_path,created_at")
      .in("quote_id", quoteIds)
      .order("created_at", { ascending: false });
    if (visualizationsError) throw visualizationsError;
    const typeIds = Array.from(new Set(itemRows.map((row) => row.catalog_type_id ?? "").filter(Boolean)));
    const kindIds = Array.from(new Set(itemRows.map((row) => row.catalog_kind_id ?? "").filter(Boolean)));
    const modelIds = Array.from(new Set(itemRows.map((row) => row.catalog_model_id ?? "").filter(Boolean)));
    const printPositionIds = Array.from(
      new Set(
        itemRows
          .flatMap((row) => {
            const fromMethods = Array.isArray(row.methods)
              ? row.methods
                  .map((entry) => {
                    if (!entry || typeof entry !== "object") return "";
                    const value = (entry as Record<string, unknown>).print_position_id;
                    return typeof value === "string" ? value : "";
                  })
                  .filter(Boolean)
              : [];
            return [row.print_position_id ?? "", ...fromMethods];
          })
          .filter(Boolean)
      )
    );

    const [typeRows, kindRows, modelRows, printPositionRows] = await Promise.all([
      typeIds.length > 0
        ? supabase
            .schema("tosho")
            .from("catalog_types")
            .select("id,name")
            .in("id", typeIds)
        : Promise.resolve({ data: [], error: null }),
      kindIds.length > 0
        ? supabase
            .schema("tosho")
            .from("catalog_kinds")
            .select("id,name")
            .in("id", kindIds)
        : Promise.resolve({ data: [], error: null }),
      modelIds.length > 0
        ? supabase
            .schema("tosho")
            .from("catalog_models")
            .select("id,name,image_url")
            .in("id", modelIds)
        : Promise.resolve({ data: [], error: null }),
      printPositionIds.length > 0
        ? supabase
            .schema("tosho")
            .from("catalog_print_positions")
            .select("id,label")
            .in("id", printPositionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (typeRows.error) throw typeRows.error;
    if (kindRows.error) throw kindRows.error;
    if (modelRows.error) throw modelRows.error;
    if (printPositionRows.error) throw printPositionRows.error;

    const typeNameById = new Map(
      (((typeRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null }>).map((row) => [
        row.id,
        row.name ?? "",
      ])
    );
    const kindNameById = new Map(
      (((kindRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null }>).map((row) => [
        row.id,
        row.name ?? "",
      ])
    );
    const modelById = new Map(
      (
        ((modelRows.data ?? []) as unknown) as Array<{ id: string; name?: string | null; image_url?: string | null }>
      ).map((row) => [row.id, { name: row.name ?? "", imageUrl: row.image_url ?? "" }])
    );
    const printPositionLabelById = new Map(
      (((printPositionRows.data ?? []) as unknown) as Array<{ id: string; label?: string | null }>).map((row) => [
        row.id,
        row.label ?? "",
      ])
    );
    const visualizationsByQuoteId = new Map<string, Array<{ url: string; name: string }>>();
    const typedVisualizations = ((visualizationRows ?? []) as unknown) as Array<{
      quote_id?: string | null;
      file_name?: string | null;
      mime_type?: string | null;
      storage_bucket?: string | null;
      storage_path?: string | null;
      created_at?: string | null;
    }>;
    for (const row of typedVisualizations) {
      const quoteId = row.quote_id ?? "";
      if (!quoteId) continue;
      if (!row.storage_bucket || !row.storage_path) continue;
      const storagePath = row.storage_path;
      const isDesignVisualization = storagePath.includes("design-outputs/");
      if (!isDesignVisualization) continue;
      const mimeType = row.mime_type?.toLowerCase() ?? "";
      const fileName = row.file_name?.toLowerCase() ?? "";
      const isImage =
        mimeType.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(fileName);
      if (!isImage) continue;

      const signed = await supabase.storage
        .from(row.storage_bucket)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      const signedUrl =
        signed.data?.signedUrl ??
        supabase.storage.from(row.storage_bucket).getPublicUrl(storagePath).data.publicUrl;
      if (!signedUrl) continue;
      const list = visualizationsByQuoteId.get(quoteId) ?? [];
      if (!list.some((item) => item.url === signedUrl)) {
        list.push({
          url: signedUrl,
          name: row.file_name ?? "visualization",
        });
      }
      visualizationsByQuoteId.set(quoteId, list);
    }

    const itemsByQuoteId = new Map<string, QuoteItemExportRow[]>();
    itemRows.forEach((row) => {
      const quoteId = row.quote_id;
      if (!quoteId) return;
      const existing = itemsByQuoteId.get(quoteId) ?? [];
      existing.push(row);
      itemsByQuoteId.set(quoteId, existing);
    });

    const sections: CommercialQuoteSection[] = quoteSetDetailsItems.map((quoteRef) => {
      const rows = (itemsByQuoteId.get(quoteRef.quote_id) ?? []).slice().sort((a, b) => {
        const aPosition = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
        const bPosition = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
        return aPosition - bPosition;
      });

      const mappedItems: CommercialItemRow[] = rows.map((row, index) => {
        const qty = Number(row.qty ?? 0) || 0;
        const unitPrice = Number(row.unit_price ?? 0) || 0;
        const computedLineTotal = qty * unitPrice;
        const lineTotal =
          Number.isFinite(Number(row.line_total)) && row.line_total !== null
            ? Number(row.line_total)
            : computedLineTotal;
        const modelMeta = row.catalog_model_id ? modelById.get(row.catalog_model_id) : undefined;
        const imageUrl = modelMeta?.imageUrl || "";
        const catalogPath = [
          row.catalog_type_id ? typeNameById.get(row.catalog_type_id) ?? "" : "",
          row.catalog_kind_id ? kindNameById.get(row.catalog_kind_id) ?? "" : "",
          modelMeta?.name ?? "",
        ]
          .filter(Boolean)
          .join(" / ");
        const placementSummary = parsePlacementSummary(
          row.methods,
          printPositionLabelById,
          row.print_position_id,
          row.print_width_mm,
          row.print_height_mm
        );
        return {
          id: row.id,
          position: typeof row.position === "number" ? row.position : index + 1,
          imageUrl,
          name: row.name?.trim() || "Без назви",
          catalogPath,
          description: row.description?.trim() || "",
          methodsSummary: parseMethodsSummary(row.methods),
          placementSummary,
          qty,
          unit: row.unit?.trim() || "шт",
          unitPrice,
          lineTotal,
        };
      });

      const itemsTotal = mappedItems.reduce((sum, row) => sum + row.lineTotal, 0);
      const quoteTotalFromSummary =
        typeof quoteRef.quote_total === "number" && Number.isFinite(quoteRef.quote_total)
          ? Number(quoteRef.quote_total)
          : null;

      return {
        quoteId: quoteRef.quote_id,
        quoteNumber: quoteRef.quote_number ?? quoteRef.quote_id.slice(0, 8),
        status: formatStatusLabel(quoteRef.quote_status ?? null),
        createdAt: formatDateTime(quoteRef.quote_created_at),
        visualizations: visualizationsByQuoteId.get(quoteRef.quote_id) ?? [],
        items: mappedItems,
        total: quoteTotalFromSummary ?? itemsTotal,
      };
    });

    const total = sections.reduce((sum, section) => sum + section.total, 0);
    const now = new Date();
    const createdAt = quoteSetDetailsTarget.created_at
      ? new Date(quoteSetDetailsTarget.created_at).toLocaleDateString("uk-UA")
      : now.toLocaleDateString("uk-UA");

    return {
      title: quoteSetDetailsTarget.name ?? "Комерційна пропозиція",
      kindLabel: quoteSetDetailsTarget.kind === "kp" ? "КП" : "Набір",
      customerName: quoteSetDetailsTarget.customer_name ?? "Замовник не вказаний",
      createdAt,
      generatedAt: formatDateTime(now.toISOString()),
      currency: "грн",
      sections,
      total,
    };
  };

  const renderCommercialDocumentHtml = (doc: CommercialDocument) => {
    const sectionsHtml = doc.sections
      .map((section, sectionIndex) => {
        const rowsHtml =
          section.items.length === 0
            ? `<tr><td colspan="10" class="empty">У цьому прорахунку немає товарних позицій.</td></tr>`
            : section.items
                .map(
                  (item) => `
                    <tr>
                      <td>${item.position}</td>
                      <td>${
                        item.imageUrl
                          ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" class="thumb" />`
                          : `<div class="thumb placeholder">—</div>`
                      }</td>
                      <td>${escapeHtml(item.name)}${
                        item.description ? `<div class="cell-muted">${escapeHtml(item.description)}</div>` : ""
                      }</td>
                      <td>${escapeHtml(item.catalogPath || "—")}</td>
                      <td>${escapeHtml(item.placementSummary || "—")}</td>
                      <td>${escapeHtml(item.methodsSummary || "—")}</td>
                      <td class="num">${formatMoneyPlain(item.qty)}</td>
                      <td>${escapeHtml(item.unit)}</td>
                      <td class="num">${formatMoneyPlain(item.unitPrice)}</td>
                      <td class="num">${formatMoneyPlain(item.lineTotal)}</td>
                    </tr>
                  `
                )
                .join("");

        return `
          <section class="quote-section">
            <div class="section-head">
              <div class="section-title">${sectionIndex + 1}. ${escapeHtml(section.quoteNumber)}</div>
              <div class="section-meta">${escapeHtml(section.status)} · ${escapeHtml(section.createdAt)}</div>
            </div>
            ${
              section.visualizations.length > 0
                ? `<div class="visual-group">
                     <div class="visual-label">Візуалізації (${section.visualizations.length})</div>
                     <div class="visual-grid">
                       ${section.visualizations
                         .map(
                           (file) =>
                             `<img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.name || section.quoteNumber)}" class="visual-thumb" />`
                         )
                         .join("")}
                     </div>
                   </div>`
                : ""
            }
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Фото</th>
                  <th>Товар</th>
                  <th>Категорія / модель</th>
                  <th>Місце / розмір</th>
                  <th>Нанесення</th>
                  <th>К-сть</th>
                  <th>Од.</th>
                  <th>Ціна</th>
                  <th>Сума</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="section-total">Разом по ${escapeHtml(section.quoteNumber)}: <b>${formatMoney(
              section.total
            )}</b></div>
          </section>
        `;
      })
      .join("");

    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(doc.title)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Inter", "Segoe UI", sans-serif; color: #0f172a; background: #ffffff; }
    .page { max-width: 1120px; margin: 0 auto; padding: 24px; }
    .head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
    .title { font-size: 28px; font-weight: 700; margin: 0 0 6px; }
    .muted { color: #475569; font-size: 13px; }
    .summary { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin: 14px 0 22px; }
    .summary strong { font-size: 18px; }
    .quote-section { margin-bottom: 18px; }
    .section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .section-title { font-size: 17px; font-weight: 700; }
    .section-meta { color: #334155; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; vertical-align: top; }
    th { background: #f8fafc; text-align: left; font-weight: 600; }
    td.num { text-align: right; white-space: nowrap; }
    td.empty { text-align: center; color: #475569; padding: 16px; }
    .thumb { width: 56px; height: 56px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; display: block; }
    .thumb.placeholder { display: inline-flex; align-items: center; justify-content: center; color: #64748b; font-size: 12px; }
    .cell-muted { margin-top: 4px; color: #475569; font-size: 12px; }
    .visual-group { margin: 0 0 10px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .visual-label { font-size: 12px; color: #334155; }
    .visual-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .visual-thumb { width: 180px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; }
    .section-total { display: flex; justify-content: flex-end; margin-top: 8px; font-size: 14px; }
    .total { margin-top: 20px; padding-top: 10px; border-top: 2px solid #0f172a; display: flex; justify-content: flex-end; font-size: 20px; font-weight: 700; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 0; }
      @page { size: A4 landscape; margin: 10mm; }
      tr, td, th { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="head">
      <div>
        <h1 class="title">${escapeHtml(doc.title)}</h1>
        <div class="muted">${escapeHtml(doc.kindLabel)} · Замовник: ${escapeHtml(doc.customerName)}</div>
        <div class="muted">Дата формування: ${escapeHtml(doc.generatedAt)}</div>
      </div>
    </header>
    <section class="summary">
      <div><b>Прорахунків у документі:</b> ${doc.sections.length}</div>
      <div><b>Номери:</b> ${escapeHtml(doc.sections.map((s) => s.quoteNumber).join(", "))}</div>
      <div><b>Підсумок "Разом":</b> <strong>${formatMoney(doc.total)}</strong></div>
    </section>
    ${sectionsHtml}
    <div class="total">Разом: ${formatMoney(doc.total)}</div>
  </main>
</body>
</html>`;
  };

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const buildCommercialExcelTsv = (doc: CommercialDocument) => {
    const lines: string[] = [];
    lines.push(normalizeTextCell(doc.title));
    lines.push(`Тип:\t${normalizeTextCell(doc.kindLabel)}`);
    lines.push(`Замовник:\t${normalizeTextCell(doc.customerName)}`);
    lines.push(`Сформовано:\t${normalizeTextCell(doc.generatedAt)}`);
    lines.push(`Прорахунків:\t${doc.sections.length}`);
    lines.push(`Разом:\t${formatMoneyPlain(doc.total)}`);
    lines.push("");
    doc.sections.forEach((section, index) => {
      lines.push(`${index + 1}. ${normalizeTextCell(section.quoteNumber)}\t${normalizeTextCell(section.status)}\t${normalizeTextCell(section.createdAt)}`);
      lines.push(
        `Візуалізації\t${normalizeTextCell(
          section.visualizations.length > 0 ? section.visualizations.map((item) => item.url).join(" | ") : "—"
        )}`
      );
      lines.push("№\tТовар\tОпис\tКатегорія/модель\tМісце/розмір\tНанесення\tК-сть\tОд.\tЦіна\tСума\tФото URL");
      if (section.items.length === 0) {
        lines.push("\tНемає товарних позицій");
      } else {
        section.items.forEach((item) => {
          lines.push(
            [
              item.position,
              normalizeTextCell(item.name),
              normalizeTextCell(item.description || "—"),
              normalizeTextCell(item.catalogPath || "—"),
              normalizeTextCell(item.placementSummary || "—"),
              normalizeTextCell(item.methodsSummary || "—"),
              formatMoneyPlain(item.qty),
              normalizeTextCell(item.unit),
              formatMoneyPlain(item.unitPrice),
              formatMoneyPlain(item.lineTotal),
              normalizeTextCell(item.imageUrl || "—"),
            ].join("\t")
          );
        });
      }
      lines.push(`\t\t\t\t\t\t\t\tРазом по прорахунку\t${formatMoneyPlain(section.total)}`);
      lines.push("");
    });
    lines.push(`Загальна сума\t${formatMoneyPlain(doc.total)}`);
    return lines.join("\r\n");
  };
  const printCommercialHtml = (html: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    iframe.onload = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) return;
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
      }, 120);
    };
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 60_000);
  };

  const clearFilters = () => {
    setSearch("");
    setQuickFilter("all");
    setStatusFilter("all");
  };

  useEffect(() => {
    localStorage.setItem("quotes_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (quoteListMode === "grouped" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [quoteListMode, selectedIds.size]);

  const handleDragStart = (id: string) => {
    setDraggingId(id);
  };

  const handleDropToStatus = async (status: string) => {
    if (!draggingId) return;
    try {
      await setQuoteStatus({ quoteId: draggingId, status });
      setRows((prev) =>
        prev.map((row) => (row.id === draggingId ? { ...row, status } : row))
      );
    } catch (e: unknown) {
      toast.error("Не вдалося змінити статус", { description: getErrorMessage(e, "") });
    } finally {
      setDraggingId(null);
      setDragOverColumnId(null);
      setDragPlaceholder(null);
    }
  };

  const toggleSelectAll = () => {
    const allIds = filteredAndSortedRows.map((row) => row.id).filter(Boolean);
    setSelectedIds((prev) => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDuplicate = async (quoteId: string) => {
    // TODO: Implement duplicate functionality
    console.log("Duplicate quote:", quoteId);
  };

  const requestDelete = (quoteId: string) => {
    setDeleteTargetId(quoteId);
    setDeleteDialogOpen(true);
  };

  const openEdit = async (row: QuoteListRow) => {
    setEditLoading(true);
    setEditTarget(row);
    const initialDeadline =
      row.deadline_at && row.deadline_at.length >= 10
        ? new Date(
            Number(row.deadline_at.slice(0, 4)),
            Number(row.deadline_at.slice(5, 7)) - 1,
            Number(row.deadline_at.slice(8, 10))
          )
        : undefined;
    setEditInitialValues({
      status: normalizeStatus(row.status),
      comment: row.design_brief ?? row.comment ?? "",
      managerId: row.assigned_to ?? "",
      deadline: initialDeadline,
      deadlineNote: row.deadline_note ?? "",
      currency: row.currency ?? "UAH",
      quoteType: row.quote_type ?? "merch",
      deliveryType: row.delivery_type ?? row.print_type ?? "",
      deliveryDetails: emptyDeliveryDetails(),
    });
    setEditError(null);
    setEditDialogOpen(true);
    try {
      const fresh = await getQuoteSummary(row.id);
      setEditTarget((prev) => ({ ...(prev ?? row), ...fresh }));
      const freshDeadline =
        fresh.deadline_at && fresh.deadline_at.length >= 10
          ? new Date(
              Number(fresh.deadline_at.slice(0, 4)),
              Number(fresh.deadline_at.slice(5, 7)) - 1,
              Number(fresh.deadline_at.slice(8, 10))
            )
          : undefined;
      setEditInitialValues({
        status: normalizeStatus(fresh.status),
        comment: fresh.design_brief ?? fresh.comment ?? row.design_brief ?? row.comment ?? "",
        managerId: fresh.assigned_to ?? "",
        deadline: freshDeadline,
        deadlineNote: fresh.deadline_note ?? "",
        currency: fresh.currency ?? row.currency ?? "UAH",
        quoteType: fresh.quote_type ?? "merch",
        deliveryType: fresh.delivery_type ?? fresh.print_type ?? "",
        deliveryDetails: {
          ...emptyDeliveryDetails(),
          ...((fresh.delivery_details as Record<string, string> | null) ?? {}),
        },
      });
    } catch (e: unknown) {
      setEditError(getErrorMessage(e, "Не вдалося завантажити актуальні дані прорахунку."));
    } finally {
      setEditLoading(false);
    }
  };

  const formatDateOnly = (date?: Date) => {
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const handleEditSubmit = async (data: NewQuoteFormData) => {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateQuote({
        quoteId: editTarget.id,
        teamId,
        status: data.status,
        comment: data.comment?.trim() || null,
        designBrief: data.comment?.trim() || null,
        assignedTo: data.managerId?.trim() ? data.managerId : null,
        deadlineAt: formatDateOnly(data.deadline),
        deadlineNote: data.deadlineNote?.trim() || null,
        quoteType: data.quoteType?.trim() ? data.quoteType : null,
        deliveryType: data.deliveryType?.trim() ? data.deliveryType : null,
        deliveryDetails: data.deliveryDetails ?? null,
      });
      setRows((prev) =>
        prev.map((row) =>
          row.id === editTarget.id
            ? {
                ...row,
                status: data.status,
                comment: data.comment?.trim() || null,
                design_brief: data.comment?.trim() || null,
                assigned_to: data.managerId?.trim() ? data.managerId : null,
                deadline_at: formatDateOnly(data.deadline),
                deadline_note: data.deadlineNote?.trim() || null,
                quote_type: data.quoteType?.trim() ? data.quoteType : null,
                delivery_type: data.deliveryType?.trim() ? data.deliveryType : null,
                delivery_details: data.deliveryDetails ?? null,
              }
            : row
        )
      );
      setEditDialogOpen(false);
      setEditInitialValues(null);
      toast.success("Прорахунок оновлено");
    } catch (e: unknown) {
      setEditError(getErrorMessage(e, "Не вдалося оновити прорахунок."));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setRowDeleteBusy(deleteTargetId);
    setRowDeleteError(null);
    try {
      await deleteQuote(deleteTargetId, teamId);
      setRows((prev) => prev.filter((row) => row.id !== deleteTargetId));
      toast.success("Прорахунок видалено");
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Не вдалося видалити прорахунок.");
      setRowDeleteError(message);
      toast.error("Помилка видалення", { description: message });
    } finally {
      setRowDeleteBusy(null);
    }
  };

  const handleBulkStatus = async (nextStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(async (id) => {
          await setQuoteStatus({ quoteId: id, status: nextStatus });
          setRows((prev) =>
            prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row))
          );
        })
      );
      toast.success(`Статус оновлено (${selectedIds.size})`);
      setSelectedIds(new Set());
    } catch (e: unknown) {
      toast.error("Не вдалося змінити статус", { description: getErrorMessage(e, "") });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => deleteQuote(id, teamId)));
      setRows((prev) => prev.filter((row) => !selectedIds.has(row.id)));
      toast.success(`Видалено ${selectedIds.size}`);
      setSelectedIds(new Set());
    } catch (e: unknown) {
      toast.error("Помилка видалення", { description: getErrorMessage(e, "") });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkCreateKp = async () => {
    if (!canRunGroupedActions) {
      toast.error("Не можна створити КП", {
        description: bulkValidationMessage ?? "Перевірте вибрані прорахунки.",
      });
      return;
    }

    const quoteIds = selectedRows.map((row) => row.id);
    const customerName = selectedRows[0]?.customer_name?.trim() || "замовника";
    try {
      const exactMatches = await findQuoteSetsByExactComposition(teamId, quoteIds);
      const sameKind = exactMatches.filter((item) => item.kind === "kp");
      const crossKind = exactMatches.filter((item) => item.kind !== "kp");
      if (sameKind.length > 0) {
        const list = sameKind.map((item) => `КП: ${item.name}`).join("\n");
        toast.error("Такий КП уже існує", {
          description: `Однаковий склад уже є:\n${list}`,
        });
        return;
      }
      if (crossKind.length > 0) {
        const list = crossKind.map((item) => `Набір: ${item.name}`).join("\n");
        toast.message("Знайдено набір з таким самим складом", {
          description: `Створюю окремий КП.\n${list}`,
        });
      }
    } catch {
      // ignore duplicate-precheck failures
    }
    setQuoteSetSaving(true);
    try {
      const created = await createQuoteSet({
        teamId,
        quoteIds,
        name: `КП ${customerName} ${new Date().toLocaleDateString("uk-UA")}`,
        kind: "kp",
      });
      toast.success("КП сформовано", { description: `ID: ${created.id}` });
      setSelectedIds(new Set());
      await loadQuoteSets();
    } catch (e: unknown) {
      toast.error("Не вдалося сформувати КП", {
        description: getErrorMessage(e, "Спробуйте ще раз."),
      });
    } finally {
      setQuoteSetSaving(false);
    }
  };

  const openQuoteSetDialog = () => {
    if (!canRunGroupedActions) {
      toast.error("Не можна сформувати набір", {
        description: bulkValidationMessage ?? "Перевірте вибрані прорахунки.",
      });
      return;
    }

    const customerName = selectedRows[0]?.customer_name?.trim() || "замовника";
    const dateLabel = new Date().toLocaleDateString("uk-UA");
    setQuoteSetName(`Набір ${customerName} ${dateLabel}`);
    setQuoteSetDialogOpen(true);
  };

  const openBulkAddExistingDialog = () => {
    if (!canRunGroupedActions) {
      toast.error("Не можна додати в існуючий КП/набір", {
        description: bulkValidationMessage ?? "Перевірте вибрані прорахунки.",
      });
      return;
    }
    setBulkAddKindFilter("all");
    setBulkAddExistingOpen(true);
  };

  const handleCreateQuoteSet = async () => {
    if (!canRunGroupedActions) {
      toast.error("Не можна сформувати набір", {
        description: bulkValidationMessage ?? "Перевірте вибрані прорахунки.",
      });
      return;
    }

    const safeName = quoteSetName.trim();
    if (!safeName) {
      toast.error("Вкажіть назву набору");
      return;
    }

    try {
      const exactMatches = await findQuoteSetsByExactComposition(
        teamId,
        selectedRows.map((row) => row.id)
      );
      const sameKind = exactMatches.filter((item) => item.kind === "set");
      const crossKind = exactMatches.filter((item) => item.kind !== "set");
      if (sameKind.length > 0) {
        const list = sameKind.map((item) => `Набір: ${item.name}`).join("\n");
        toast.error("Такий набір уже існує", {
          description: `Однаковий склад уже є:\n${list}`,
        });
        return;
      }
      if (crossKind.length > 0) {
        const list = crossKind.map((item) => `КП: ${item.name}`).join("\n");
        toast.message("Знайдено КП з таким самим складом", {
          description: `Створюю окремий набір.\n${list}`,
        });
      }
    } catch {
      // ignore duplicate-precheck failures
    }

    setQuoteSetSaving(true);
    try {
      const created = await createQuoteSet({
        teamId,
        quoteIds: selectedRows.map((row) => row.id),
        name: safeName,
        kind: "set",
      });
      toast.success("Набір сформовано", { description: `ID: ${created.id}` });
      setQuoteSetDialogOpen(false);
      setSelectedIds(new Set());
      await loadQuoteSets();
    } catch (e: unknown) {
      toast.error("Не вдалося сформувати набір", {
        description: getErrorMessage(e, "Спробуйте ще раз."),
      });
    } finally {
      setQuoteSetSaving(false);
    }
  };

  const handleBulkAddToExistingSet = async () => {
    if (!bulkAddTargetSetId) {
      toast.error("Оберіть КП або набір");
      return;
    }
    if (!canRunGroupedActions) {
      toast.error("Не можна додати в існуючий КП/набір", {
        description: bulkValidationMessage ?? "Перевірте вибрані прорахунки.",
      });
      return;
    }

    const selectedSet = bulkAddAvailableSets.find((set) => set.id === bulkAddTargetSetId);
    if (!selectedSet) {
      toast.error("Оберіть валідний КП або набір");
      return;
    }

    const candidateQuoteIds = selectedRows
      .filter((row) => row.customer_id === selectedSet.customer_id)
      .map((row) => row.id)
      .filter((quoteId) => {
        const refs = quoteMembershipByQuoteId.get(quoteId)?.refs ?? [];
        return !refs.some((ref) => ref.id === selectedSet.id);
      });

    if (candidateQuoteIds.length === 0) {
      toast.message("Усі вибрані прорахунки вже в цьому КП/наборі");
      return;
    }

    setBulkAddBusy(true);
    try {
      const added = await addQuotesToQuoteSet({
        teamId,
        quoteSetId: selectedSet.id,
        quoteIds: candidateQuoteIds,
      });
      if (added > 0) {
        toast.success(`Додано ${added} позицій до ${selectedSet.kind === "kp" ? "КП" : "набору"}`);
      } else {
        toast.message("Нових позицій для додавання немає");
      }
      setBulkAddExistingOpen(false);
      setSelectedIds(new Set());
      await Promise.all([loadQuoteSets(), loadQuotes()]);
    } catch (e: unknown) {
      toast.error("Не вдалося додати в існуючий КП/набір", {
        description: getErrorMessage(e, "Спробуйте ще раз."),
      });
    } finally {
      setBulkAddBusy(false);
    }
  };

  const handleRenameQuoteSet = async () => {
    if (!quoteSetDetailsTarget) return;
    const safeName = quoteSetEditName.trim();
    if (!safeName) {
      toast.error("Вкажіть назву");
      return;
    }
    if (safeName === quoteSetDetailsTarget.name) return;

    setQuoteSetActionBusy(true);
    try {
      await updateQuoteSetName({
        teamId,
        quoteSetId: quoteSetDetailsTarget.id,
        name: safeName,
      });
      setQuoteSetDetailsTarget((prev) => (prev ? { ...prev, name: safeName } : prev));
      setQuoteSets((prev) => prev.map((set) => (set.id === quoteSetDetailsTarget.id ? { ...set, name: safeName } : set)));
      toast.success("Назву оновлено");
    } catch (e: unknown) {
      toast.error("Не вдалося оновити назву", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetActionBusy(false);
    }
  };

  const handleDeleteQuoteSet = async (targetOverride?: QuoteSetListRow | null) => {
    const target = targetOverride ?? quoteSetDetailsTarget;
    if (!target) return;
    const approved = window.confirm("Видалити цей набір/КП? Дію не можна скасувати.");
    if (!approved) return;

    setQuoteSetActionBusy(true);
    try {
      await deleteQuoteSet({ teamId, quoteSetId: target.id });
      setQuoteSets((prev) => prev.filter((set) => set.id !== target.id));
      setQuoteSetDetailsOpen(false);
      setQuoteSetDetailsItems([]);
      setQuoteSetDetailsTarget(null);
      toast.success("Набір видалено");
    } catch (e: unknown) {
      toast.error("Не вдалося видалити набір", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetActionBusy(false);
    }
  };

  const handlePreviewQuoteSet = async () => {
    if (!quoteSetDetailsTarget) return;
    setQuoteSetCommercialLoading(true);
    try {
      const doc = await buildCommercialDocument();
      if (!doc) {
        toast.error("Немає даних для прев'ю");
        return;
      }
      setQuoteSetCommercialDoc(doc);
      setQuoteSetPreviewOpen(true);
    } catch (e: unknown) {
      toast.error("Не вдалося підготувати прев'ю", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetCommercialLoading(false);
    }
  };

  const handlePrintQuoteSet = async () => {
    setQuoteSetCommercialLoading(true);
    try {
      const doc = await buildCommercialDocument();
      if (!doc) {
        toast.error("Немає даних для друку");
        return;
      }
      setQuoteSetCommercialDoc(doc);
      const html = renderCommercialDocumentHtml(doc);
      printCommercialHtml(html);
    } catch (e: unknown) {
      toast.error("Не вдалося підготувати друк", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetCommercialLoading(false);
    }
  };

  const handleExportQuoteSet = async (format: "pdf" | "xls") => {
    setQuoteSetCommercialLoading(true);
    try {
      const doc = await buildCommercialDocument();
      if (!doc) {
        toast.error("Немає даних для експорту");
        return;
      }
      setQuoteSetCommercialDoc(doc);
      const html = renderCommercialDocumentHtml(doc);

      if (format === "xls") {
        const tsv = buildCommercialExcelTsv(doc);
        const blob = new Blob([`\ufeff${tsv}`], {
          type: "text/tab-separated-values;charset=utf-8",
        });
        downloadBlob(getCommercialDocFilename(doc, "xls"), blob);
        toast.success("Excel файл згенеровано");
        return;
      }

      printCommercialHtml(html);
      toast.message("У вікні друку оберіть «Зберегти як PDF»");
    } catch (e: unknown) {
      toast.error(`Не вдалося експортувати ${format.toUpperCase()}`, { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetCommercialLoading(false);
    }
  };

  const handleRemoveItemFromQuoteSet = async (itemId: string) => {
    if (!quoteSetDetailsTarget) return;
    setQuoteSetActionBusy(true);
    try {
      await removeQuoteSetItem({ teamId, quoteSetItemId: itemId });
      const nextItems = quoteSetDetailsItems.filter((item) => item.id !== itemId);
      setQuoteSetDetailsItems(nextItems);
      const excludedIds = new Set(nextItems.map((item) => item.quote_id));
      const customerQuotes = await listCustomerQuotes({
        teamId,
        customerId: quoteSetDetailsTarget.customer_id,
        limit: 300,
      });
      const available = customerQuotes.filter((quote) => !excludedIds.has(quote.id));
      setQuoteSetCandidateQuotes(available);
      setQuoteSetCandidateId((prev) => (prev && available.some((q) => q.id === prev) ? prev : (available[0]?.id ?? "")));
      setQuoteSets((prev) =>
        prev.map((set) =>
          set.id === quoteSetDetailsTarget.id ? { ...set, item_count: Math.max(0, set.item_count - 1) } : set
        )
      );
      toast.success("Позицію прибрано");
    } catch (e: unknown) {
      toast.error("Не вдалося прибрати позицію", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetActionBusy(false);
    }
  };

  const handleAddSelectedToQuoteSet = async () => {
    if (!quoteSetDetailsTarget) return;
    const existingQuoteIds = new Set(quoteSetDetailsItems.map((item) => item.quote_id));
    const candidateRows = selectedRows.filter(
      (row) => row.customer_id === quoteSetDetailsTarget.customer_id && !existingQuoteIds.has(row.id)
    );
    if (candidateRows.length === 0) {
      toast.error("Немає сумісних вибраних прорахунків для додавання");
      return;
    }

    setQuoteSetActionBusy(true);
    try {
      const added = await addQuotesToQuoteSet({
        teamId,
        quoteSetId: quoteSetDetailsTarget.id,
        quoteIds: candidateRows.map((row) => row.id),
      });
      if (added <= 0) {
        toast.message("Нових позицій для додавання немає");
      } else {
        toast.success(`Додано ${added} позицій`);
      }
      const fresh = await listQuoteSetItems(teamId, quoteSetDetailsTarget.id);
      setQuoteSetDetailsItems(fresh);
      const excludedIds = new Set(fresh.map((item) => item.quote_id));
      const customerQuotes = await listCustomerQuotes({
        teamId,
        customerId: quoteSetDetailsTarget.customer_id,
        limit: 300,
      });
      const available = customerQuotes.filter((quote) => !excludedIds.has(quote.id));
      setQuoteSetCandidateQuotes(available);
      setQuoteSetCandidateId(available[0]?.id ?? "");
      setQuoteSets((prev) =>
        prev.map((set) => (set.id === quoteSetDetailsTarget.id ? { ...set, item_count: fresh.length } : set))
      );
      setSelectedIds(new Set());
    } catch (e: unknown) {
      toast.error("Не вдалося додати позиції", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetActionBusy(false);
    }
  };

  const handleAddQuoteToOpenSet = async () => {
    if (!quoteSetDetailsTarget || !quoteSetCandidateId) return;
    setQuoteSetActionBusy(true);
    try {
      const added = await addQuotesToQuoteSet({
        teamId,
        quoteSetId: quoteSetDetailsTarget.id,
        quoteIds: [quoteSetCandidateId],
      });
      if (added <= 0) {
        toast.message("Цей прорахунок вже в наборі/КП");
      } else {
        toast.success("Прорахунок додано");
      }
      const fresh = await listQuoteSetItems(teamId, quoteSetDetailsTarget.id);
      setQuoteSetDetailsItems(fresh);
      const excludedIds = new Set(fresh.map((item) => item.quote_id));
      const customerQuotes = await listCustomerQuotes({
        teamId,
        customerId: quoteSetDetailsTarget.customer_id,
        limit: 300,
      });
      const available = customerQuotes.filter((quote) => !excludedIds.has(quote.id));
      setQuoteSetCandidateQuotes(available);
      setQuoteSetCandidateId(available[0]?.id ?? "");
      setQuoteSets((prev) =>
        prev.map((set) => (set.id === quoteSetDetailsTarget.id ? { ...set, item_count: fresh.length } : set))
      );
    } catch (e: unknown) {
      toast.error("Не вдалося додати прорахунок", { description: getErrorMessage(e, "") });
    } finally {
      setQuoteSetActionBusy(false);
    }
  };

  const handleOpenQuickAddToSet = async (row: QuoteListRow) => {
    if (!row.customer_id) {
      toast.error("У прорахунку не заданий замовник");
      return;
    }
    setQuickAddTargetQuote(row);
    setQuickAddKindFilter("all");
    setQuickAddTargetSetId("");
    setQuickAddOpen(true);
    setQuickAddLoadingSets(true);
    try {
      const latestSets = await listQuoteSets(teamId, 200);
      setQuoteSets(latestSets);
    } catch {
      // keep current sets if refresh fails
    } finally {
      setQuickAddLoadingSets(false);
    }
  };

  const handleQuickAddToSet = async () => {
    if (!quickAddTargetQuote || !quickAddTargetSetId) return;
    setQuickAddBusy(true);
    try {
      const added = await addQuotesToQuoteSet({
        teamId,
        quoteSetId: quickAddTargetSetId,
        quoteIds: [quickAddTargetQuote.id],
      });
      if (added <= 0) {
        toast.message("Цей прорахунок вже є в обраному КП/наборі");
      } else {
        toast.success("Прорахунок додано в КП/набір");
      }
      setQuickAddOpen(false);
      setQuickAddTargetQuote(null);
      setQuickAddTargetSetId("");
      await Promise.all([loadQuoteSets(), loadQuotes()]);
    } catch (e: unknown) {
      toast.error("Не вдалося додати прорахунок", { description: getErrorMessage(e, "Спробуйте ще раз.") });
    } finally {
      setQuickAddBusy(false);
    }
  };

  useEffect(() => {
    if (!quickAddOpen) return;
    if (quickAddAvailableSets.length === 0) {
      setQuickAddTargetSetId("");
      return;
    }
    setQuickAddTargetSetId((prev) =>
      prev && quickAddAvailableSets.some((set) => set.id === prev) ? prev : quickAddAvailableSets[0].id
    );
  }, [quickAddAvailableSets, quickAddOpen]);

  useEffect(() => {
    if (!bulkAddExistingOpen) return;
    if (bulkAddAvailableSets.length === 0) {
      setBulkAddTargetSetId("");
      return;
    }
    setBulkAddTargetSetId((prev) =>
      prev && bulkAddAvailableSets.some((set) => set.id === prev) ? prev : bulkAddAvailableSets[0].id
    );
  }, [bulkAddAvailableSets, bulkAddExistingOpen]);

  return (
    <PageCanvas>
      {/* Modern Linea-style Header Block */}
      <PageCanvasHeader sticky>
        <div className="px-5 pt-4 pb-4 space-y-4">
          {/* Header Section */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0 flex items-center gap-3">
                <h1 className="text-2xl leading-none font-semibold tracking-tight">Прорахунки</h1>
                <ActiveHereCard
                  entries={workspacePresence.activeHereEntries}
                  title="Тут"
                  className="h-8 px-3 py-0 bg-muted/20 border-border/50"
                />
              </div>
              <p className="hidden xl:block text-sm text-muted-foreground">Керуйте прорахунками та пропозиціями</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* View Mode Switcher */}
              <EstimatesModeSwitch viewMode={viewMode} onChange={setViewMode} />
              <Button onClick={openCreate} size="sm" className="gap-2 h-10">
                <PlusIcon className="h-4 w-4" />
                Новий прорахунок
              </Button>
            </div>
          </div>

          {/* Search and Filters Row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Content Type Tabs */}
            <div className="inline-flex h-10 w-full items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border sm:w-auto">
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={contentView === "quotes"}
                onClick={() => setContentView("quotes")}
              >
                Прорахунки
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={contentView === "sets"}
                onClick={() => setContentView("sets")}
              >
                КП та набори
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={contentView === "all"}
                onClick={() => setContentView("all")}
              >
                Все
              </Button>
            </div>

            {/* Right Side: Search, Results Count, Clear Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-1 sm:justify-end">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[240px] max-w-[520px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={contentView === "sets" ? quoteSetSearch : search}
                  onChange={(e) =>
                    contentView === "sets" ? setQuoteSetSearch(e.target.value) : setSearch(e.target.value)
                  }
                  placeholder={
                    contentView === "sets"
                      ? "Пошук по КП та наборах..."
                      : "Пошук за назвою, номером або замовником..."
                  }
                  className={cn(CONTROL_BASE, "h-10 pl-9 pr-9")}
                />
                {(contentView === "sets" ? quoteSetSearch : search) && (
                  <Button
                    type="button"
                    variant="control"
                    size="iconSm"
                    aria-label="Очистити пошук"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => (contentView === "sets" ? setQuoteSetSearch("") : setSearch(""))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {(loading || refreshing) && contentView !== "sets" && search && (
                  <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Results Count */}
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="font-semibold px-2.5 py-1 h-10 flex items-center gap-1.5">
                  <span className="tabular-nums">{loading && rows.length === 0 ? "…" : foundCount}</span>
                  <span className="text-muted-foreground text-xs hidden sm:inline">знайдено</span>
                </Badge>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground shrink-0">
                  Скинути фільтри
                </Button>
              )}
            </div>
          </div>

          {/* Status Filters Row */}
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {contentView !== "sets" ? (
                <>
                  {/* Quick Filter Buttons */}
                  <div className="inline-flex h-9 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
                    <Button
                      variant="segmented"
                      size="xs"
                      aria-pressed={quickFilter === "all"}
                      onClick={() => setQuickFilter("all")}
                    >
                      Всі
                    </Button>
                    <Button
                      variant="segmented"
                      size="xs"
                      aria-pressed={quickFilter === "new"}
                      onClick={() => setQuickFilter("new")}
                      className="gap-1.5"
                    >
                      <FileText className="h-3 w-3" />
                      Нові
                    </Button>
                    <Button
                      variant="segmented"
                      size="xs"
                      aria-pressed={quickFilter === "estimated"}
                      onClick={() => setQuickFilter("estimated")}
                    >
                      Пораховано
                    </Button>
                  </div>
                  {/* Status Select */}
                  <Select value={status} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 w-[180px] bg-background border-input hover:bg-muted/20 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40">
                      <SelectValue placeholder="Статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Всі статуси</SelectItem>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {formatStatusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  {/* Quote Set Kind Filters */}
                  <div className="inline-flex h-9 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
                    <Button
                      variant="segmented"
                      size="xs"
                      aria-pressed={quoteSetKindFilter === "all"}
                      onClick={() => setQuoteSetKindFilter("all")}
                    >
                      Всі
                    </Button>
                    <Button
                      variant="segmented"
                      size="xs"
                      aria-pressed={quoteSetKindFilter === "kp"}
                      onClick={() => setQuoteSetKindFilter("kp")}
                    >
                      КП
                    </Button>
                    <Button
                      variant="segmented"
                      size="xs"
                      aria-pressed={quoteSetKindFilter === "set"}
                      onClick={() => setQuoteSetKindFilter("set")}
                    >
                      Набори
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* List Mode Toggle (only for table view) */}
            {contentView !== "sets" && viewMode === "table" ? (
              <div className="inline-flex h-9 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
                <Button
                  variant="segmented"
                  size="xs"
                  aria-pressed={quoteListMode === "flat"}
                  onClick={() => setQuoteListMode("flat")}
                >
                  Список
                </Button>
                <Button
                  variant="segmented"
                  size="xs"
                  aria-pressed={quoteListMode === "grouped"}
                  onClick={() => setQuoteListMode("grouped")}
                >
                  Групи
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </PageCanvasHeader>

      {/* Bulk actions */}
      {contentView !== "sets" && selectedIds.size > 0 && (
        <PageCanvasBody className="px-5 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <Badge variant="outline" className="font-semibold h-8 px-2.5">
                  Вибрано: {selectedIds.size}
                </Badge>
                {bulkValidationMessage ? (
                  <p className="text-xs text-warning-foreground">
                    {selectedRows.length < 2
                      ? `Оберіть ще ${Math.max(0, 2 - selectedRows.length)} прорахунок(и), щоб створити КП або набір.`
                      : bulkValidationMessage}
                  </p>
                ) : (
                  <p className="text-xs text-success-foreground">Готово до групових дій.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="h-7 quote-neutral-badge">
                  Звичайні: {selectionContext.plainCount}
                </Badge>
                {selectionContext.withKpCount > 0 ? (
                  <Badge variant="outline" className="h-7 quote-kind-badge-kp">
                    У КП: {selectionContext.withKpCount}
                  </Badge>
                ) : null}
                {selectionContext.withSetCount > 0 ? (
                  <Badge variant="outline" className="h-7 quote-kind-badge-set">
                    У наборах: {selectionContext.withSetCount}
                  </Badge>
                ) : null}
                {selectionContext.refs.slice(0, 2).map((ref) => (
                  <Badge
                    key={ref.id}
                    variant="outline"
                    className={cn("h-7", ref.kind === "kp" ? "quote-kind-badge-kp" : "quote-kind-badge-set")}
                    title={`${ref.name} · вибрано ${ref.selectedCount}`}
                  >
                    {ref.kind === "kp" ? "КП" : "Набір"}: {ref.name} ({ref.selectedCount})
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={bulkBusy || quoteSetSaving || !canRunGroupedActions}
                onClick={handleBulkCreateKp}
                className="h-8"
              >
                Створити КП
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={bulkBusy || quoteSetSaving || !canRunGroupedActions}
                onClick={openQuoteSetDialog}
                className="h-8"
              >
                Сформувати набір
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkBusy || quoteSetSaving || !canRunGroupedActions || bulkAddAvailableSets.length === 0}
                onClick={openBulkAddExistingDialog}
                className="h-8"
                title={
                  bulkAddAvailableSets.length === 0
                    ? "Немає існуючих КП/наборів, куди можна додати вибрані"
                    : undefined
                }
              >
                Додати в існуючий
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={bulkBusy || quoteSetSaving}
                  >
                    Інші дії
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleBulkStatus("approved");
                    }}
                    disabled={bulkBusy || quoteSetSaving}
                  >
                    Поставити “Затверджено”
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleBulkStatus("cancelled");
                    }}
                    disabled={bulkBusy || quoteSetSaving}
                  >
                    Поставити “Скасовано”
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleBulkDelete();
                    }}
                    disabled={bulkBusy || quoteSetSaving}
                  >
                    Видалити
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkBusy || quoteSetSaving}
              >
                Очистити
              </Button>
            </div>
          </div>
        </PageCanvasBody>
      )}

      {contentView !== "quotes" && (
      <EstimatesTableCanvas>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div>
            <div className="text-base font-semibold">КП та набори</div>
            <div className="text-sm text-muted-foreground mt-1">Натисніть на рядок, щоб подивитися склад</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                КП: {quoteSetKpCount}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Набори: {quoteSetSetCount}
              </Badge>
            </div>
          </div>
          <Badge variant="outline" className="font-semibold px-2.5 py-1 h-9">
            {filteredQuoteSets.length}
          </Badge>
        </div>
        {quoteSetsLoading ? (
          <div className="px-5 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Завантаження...</p>
          </div>
        ) : filteredQuoteSets.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Немає КП або наборів</h3>
            <p className="text-sm text-muted-foreground">
              Поки немає створених КП або наборів.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="[&_th]:px-5 [&_td]:px-5">
                <TableHeader>
                  <TableRow className="bg-transparent border-b border-border/40">
                  <TableHead className="w-[12px]"></TableHead>
                  <TableHead>Назва</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Замовник</TableHead>
                  <TableHead>Позицій</TableHead>
                  <TableHead>Створено</TableHead>
                  <TableHead className="w-[120px] text-right">Дія</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuoteSets.map((set) => (
                  <TableRow
                    key={set.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/10 transition-colors border-b border-border/50",
                      (set.kind ?? "set") === "kp"
                        ? "data-[state=selected]:bg-primary/5"
                        : "data-[state=selected]:bg-success-soft"
                    )}
                    onClick={() => openQuoteSetDetails(set)}
                  >
                    <TableCell className="pr-0">
                      <div
                        className={cn(
                          "h-8 w-1.5 rounded-full",
                          (set.kind ?? "set") === "kp" ? "quote-kind-stripe-kp" : "quote-kind-stripe-set"
                        )}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 min-w-0">
                        {set.customer_logo_url ? (
                          <img
                            src={set.customer_logo_url}
                            alt={set.customer_name ?? "logo"}
                            className="h-7 w-7 rounded-full object-cover border border-border/60 bg-muted/20 shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full border border-border/60 bg-muted/20 text-[9px] font-semibold text-muted-foreground flex items-center justify-center shrink-0">
                            {getInitials(set.customer_name)}
                          </div>
                        )}
                        <span className="truncate">{set.name}</span>
                      </div>
                      {set.preview_quote_numbers && set.preview_quote_numbers.length > 0 ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {set.preview_quote_numbers.join(" · ")}
                          {set.item_count > set.preview_quote_numbers.length ? " · ..." : ""}
                        </div>
                      ) : null}
                      {set.duplicate_count && set.duplicate_count > 0 ? (
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] quote-warning-badge"
                            title="Є ще КП/набір з таким самим складом прорахунків"
                          >
                            Той самий склад
                            {set.has_same_composition_kp ? " · є КП" : ""}
                            {set.has_same_composition_set ? " · є Набір" : ""}
                          </Badge>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <QuoteKindBadge kind={set.kind} />
                    </TableCell>
                    <TableCell>{set.customer_name ?? "Не вказано"}</TableCell>
                    <TableCell>{set.item_count}</TableCell>
                    <TableCell>
                      {set.created_at
                        ? new Date(set.created_at).toLocaleString("uk-UA", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-70 hover:opacity-100"
                            aria-label="Дії"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(event) => {
                              event.preventDefault();
                              void handleDeleteQuoteSet(set);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Видалити
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </EstimatesTableCanvas>
      )}

      {/* Views */}
      {contentView !== "sets" && (viewMode === "table" ? (
        <EstimatesTableCanvas>
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Завантаження прорахунків...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <XCircle className="h-9 w-9 mx-auto mb-3 text-destructive/80" />
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          ) : filteredAndSortedRows.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Немає прорахунків</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search ? "Спробуйте змінити пошуковий запит" : "Створіть перший прорахунок для клієнта"}
              </p>
              {!search && (
                <Button onClick={openCreate} variant="outline" className="gap-2">
                  <PlusIcon className="h-4 w-4" />
                  Створити прорахунок
                </Button>
              )}
            </div>
          ) : quoteListMode === "grouped" ? (
            <div className="p-5 space-y-4">
              {groupedQuotesView.groups.map((group) => (
                <div key={group.id} className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "h-7 w-1.5 rounded-full",
                          group.kind === "kp" ? "quote-kind-stripe-kp" : "quote-kind-stripe-set"
                        )}
                      />
                      <QuoteKindBadge kind={group.kind} />
                      <div className="truncate text-sm font-semibold">{group.name}</div>
                    </div>
                    <Badge variant="outline" className="font-semibold">{group.rows.length}</Badge>
                  </div>
                  <div className="divide-y divide-border/50">
                    {group.rows.map((row) => (
                      <div
                        key={`${group.id}-${row.id}`}
                        className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/10 cursor-pointer transition-colors"
                        onClick={() => navigate(`/orders/estimates/${row.id}`)}
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-semibold truncate">{row.number ?? "Не вказано"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {row.customer_name ?? "Не вказано"} · {getManagerLabel(row.assigned_to)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={cn("border", statusPillClasses(row.status))} variant="outline">
                            {formatStatusLabel(row.status)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {groupedQuotesView.ungrouped.length > 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/60 text-sm font-semibold">Без групи</div>
                  <div className="divide-y divide-border/50">
                    {groupedQuotesView.ungrouped.map((row) => (
                      <div
                        key={`ungrouped-${row.id}`}
                        className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/10 cursor-pointer transition-colors"
                        onClick={() => navigate(`/orders/estimates/${row.id}`)}
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-semibold truncate">{row.number ?? "Не вказано"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {row.customer_name ?? "Не вказано"} · {getManagerLabel(row.assigned_to)}
                          </div>
                        </div>
                        <Badge className={cn("border", statusPillClasses(row.status))} variant="outline">
                          {formatStatusLabel(row.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="[&_th]:px-5 [&_td]:px-5">
                <TableHeader>
                  <TableRow className="bg-transparent hover:bg-transparent border-b border-border/40">
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={
                          selectedIds.size === 0
                            ? false
                            : selectedIds.size === filteredAndSortedRows.length
                            ? true
                            : "indeterminate"
                        }
                        onCheckedChange={() => toggleSelectAll()}
                        aria-label="Вибрати всі"
                      />
                    </TableHead>
                    <TableHead className="w-[140px] min-w-[140px]">
                      <button
                        onClick={() => handleSort("number")}
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors font-semibold"
                      >
                        Номер
                        {sortBy === "number" && (
                          <ArrowUpDown className={cn("h-3.5 w-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="w-[160px]">
                      <button
                        onClick={() => handleSort("date")}
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors font-semibold"
                      >
                        Дата
                        {sortBy === "date" && (
                          <ArrowUpDown className={cn("h-3.5 w-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="w-[220px]">
                      <div className="flex items-center font-semibold">
                        Замовник
                      </div>
                    </TableHead>
                    <TableHead className="w-[200px]">
                      <div className="flex items-center font-semibold">
                        Менеджер
                      </div>
                    </TableHead>
                    <TableHead className="w-[140px] font-semibold">
                      Дедлайн
                    </TableHead>
                    <TableHead className="w-[120px] font-semibold">Статус</TableHead>
                    <TableHead className="w-[120px] font-semibold">
                      <div className="flex items-center">
                        Тип
                      </div>
                    </TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedRows.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    const membership = quoteMembershipByQuoteId.get(row.id);
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "hover:bg-muted/10 cursor-pointer group transition-colors border-b border-border/50",
                          isSelected && "bg-primary/5"
                        )}
                        onClick={() => navigate(`/orders/estimates/${row.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/orders/estimates/${row.id}`);
                          }
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(row.id)}
                            aria-label="Вибрати рядок"
                          />
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-sm whitespace-nowrap min-w-[140px]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {membership ? (
                                <div
                                  className={cn(
                                    "h-5 w-1.5 rounded-full",
                                    membership.kp_count > 0
                                      ? "quote-kind-stripe-kp"
                                      : membership.set_count > 0
                                      ? "quote-kind-stripe-set"
                                      : "bg-transparent"
                                  )}
                                />
                              ) : null}
                              <span className="group-hover:underline underline-offset-2">
                                {row.number ?? "Не вказано"}
                              </span>
                            </div>
                            {membership ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {membership.kp_count > 0 ? (
                                  <Badge
                                    variant="outline"
                                    title={membership.kp_names.join(", ")}
                                    className="h-5 px-1.5 text-[10px] inline-flex items-center gap-1 quote-kind-badge-kp"
                                  >
                                    <FileText className="h-3 w-3" />
                                    КП{membership.kp_count > 1 ? ` +${membership.kp_count - 1}` : ""}
                                  </Badge>
                                ) : null}
                                {membership.set_count > 0 ? (
                                  <Badge
                                    variant="outline"
                                    title={membership.set_names.join(", ")}
                                    className="h-5 px-1.5 text-[10px] inline-flex items-center gap-1 quote-kind-badge-set"
                                  >
                                    <Layers className="h-3 w-3" />
                                    Набір{membership.set_count > 1 ? ` +${membership.set_count - 1}` : ""}
                                  </Badge>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.created_at ? (
                            (() => {
                              const labels = getDateLabels(row.created_at);
                              if (labels === "Не вказано") return "Не вказано";
                              return (
                                <div title={new Date(row.created_at).toLocaleString("uk-UA")}>
                                  <div className="font-medium">{labels.primary}</div>
                                  {labels.secondary ? (
                                    <div className="text-xs text-muted-foreground">{labels.secondary}</div>
                                  ) : null}
                                </div>
                              );
                            })()
                          ) : (
                            "Не вказано"
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-[260px]">
                          <div className="flex items-center gap-3 min-w-0">
                            {row.customer_logo_url ? (
                              <img
                                src={row.customer_logo_url}
                                alt={row.customer_name ?? "logo"}
                                className="h-9 w-9 rounded-full object-cover border border-border/60 bg-muted/20"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  target.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-full border border-border/60 bg-muted/20 text-[10px] font-semibold text-muted-foreground flex items-center justify-center">
                                {getInitials(row.customer_name)}
                              </div>
                            )}
                            <span className="truncate" title={row.customer_name ?? "Не вказано"}>
                              {row.customer_name ?? "Не вказано"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-2 min-w-0">
                            <AvatarBase
                              src={row.assigned_to ? memberAvatarById.get(row.assigned_to) ?? null : null}
                              name={getManagerLabel(row.assigned_to)}
                              fallback={
                                row.assigned_to ? getInitials(getManagerLabel(row.assigned_to)) : "Не вказано"
                              }
                              size={28}
                              className="text-[10px] font-semibold"
                            />
                            <span className="truncate">
                              {getManagerLabel(row.assigned_to)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const badge = getDeadlineBadge(row.deadline_at ?? null);
                            const titleParts = [
                              row.deadline_at
                                ? `Дата: ${new Date(row.deadline_at).toLocaleDateString("uk-UA")}`
                                : "Дедлайн не задано",
                              row.deadline_note ? `Коментар: ${row.deadline_note}` : null,
                            ].filter(Boolean);
                            return (
                              <QuoteDeadlineBadge
                                tone={badge.tone}
                                label={badge.label}
                                title={titleParts.join(" · ")}
                              />
                            );
                          })()}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const normalizedStatus = normalizeStatus(row.status);
                            const Icon = statusIcons[normalizedStatus] ?? Clock;
                            return (
                              <Badge
                                className={cn(
                                  "cursor-pointer transition-all hover:shadow-sm",
                                  statusClasses[normalizedStatus] ?? statusClasses.new
                                )}
                                variant="outline"
                              >
                                <Icon className="h-3.5 w-3.5 mr-1" />
                                {formatStatusLabel(normalizedStatus)}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const Icon = quoteTypeIcon(row.quote_type);
                            return (
                              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1 text-xs font-semibold">
                                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                                {quoteTypeLabel(row.quote_type)}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-all"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/orders/estimates/${row.id}`)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Відкрити
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Редагувати
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(row.id)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Дублювати
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleOpenQuickAddToSet(row)}>
                              <Layers className="mr-2 h-4 w-4" />
                              Додати в КП/набір
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => requestDelete(row.id)}
                                className="text-destructive focus:text-destructive"
                                disabled={rowDeleteBusy === row.id}
                              >
                                {rowDeleteBusy === row.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                Видалити
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </EstimatesTableCanvas>
      ) : (
        <EstimatesKanbanCanvas>
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Завантаження прорахунків...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-destructive mb-2 text-2xl">⚠️</div>
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          ) : filteredAndSortedRows.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Немає прорахунків</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search ? "Спробуйте змінити пошуковий запит" : "Створіть перший прорахунок для клієнта"}
              </p>
              {!search && (
                <Button onClick={openCreate} variant="outline" className="gap-2">
                  <PlusIcon className="h-4 w-4" />
                  Створити прорахунок
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto px-4 pb-2 pt-3 md:px-5">
              <div className="w-max flex gap-4 pb-5">
                {KANBAN_COLUMNS.map((column) => {
                  const items = groupedByStatus[column.id] ?? [];
                  return (
                    <div
                      key={column.id}
                      className={cn(
                        "kanban-column-surface",
                        `kanban-column-status-${column.id}`,
                        draggingId && dragOverColumnId === column.id && "kanban-column-drop-target",
                        "basis-[300px] shrink-0 flex flex-col"
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverColumnId !== column.id) {
                          setDragOverColumnId(column.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        const nextTarget = e.relatedTarget;
                        if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
                          return;
                        }
                        if (dragOverColumnId === column.id) {
                          setDragOverColumnId(null);
                        }
                        if (dragPlaceholder?.columnId === column.id) {
                          setDragPlaceholder(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropToStatus(column.id);
                      }}
                    >
                      <div className="kanban-column-header flex items-center justify-between gap-2 px-3.5 py-3 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {(() => {
                            const Icon = statusIcons[column.id] ?? Clock;
                            return <Icon className={cn("h-3.5 w-3.5 shrink-0", statusColorClass[column.id] ?? "text-muted-foreground")} />;
                          })()}
                          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                            {column.label}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/80">
                          {items.length}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "flex-1 overflow-y-auto px-2.5 pb-3.5 pt-2.5 space-y-2 min-h-[120px]",
                          draggingId && "pb-4"
                        )}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!draggingId) return;
                          if (dragOverColumnId !== column.id) {
                            setDragOverColumnId(column.id);
                          }
                          const listNode = e.currentTarget;
                          const cardNodes = Array.from(
                            listNode.querySelectorAll<HTMLElement>("[data-kanban-card='true']")
                          );
                          let nextIndex = cardNodes.length;
                          for (let i = 0; i < cardNodes.length; i += 1) {
                            const rect = cardNodes[i].getBoundingClientRect();
                            if (e.clientY < rect.top + rect.height / 2) {
                              nextIndex = i;
                              break;
                            }
                          }
                          if (
                            dragPlaceholder?.columnId !== column.id ||
                            dragPlaceholder.index !== nextIndex
                          ) {
                            setDragPlaceholder({ columnId: column.id, index: nextIndex });
                          }
                        }}
                      >
                        {items.length === 0 ? (
                          draggingId && dragPlaceholder?.columnId === column.id ? (
                            <div className="kanban-drop-placeholder rounded-[var(--radius-md)] border-2 border-dashed px-3 py-5" />
                          ) : (
                            <div className="kanban-empty-state rounded-md border border-dashed border-border/50 text-muted-foreground/70 text-[11px] py-6 px-3 text-center">
                              <div className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-muted/20">
                                {(() => {
                                  const Icon = statusIcons[column.id] ?? Clock;
                                  return (
                                    <Icon className={cn("h-3.5 w-3.5", statusColorClass[column.id] ?? "text-muted-foreground")} />
                                  );
                                })()}
                              </div>
                              <p className="text-[11px] font-medium">Немає прорахунків</p>
                              <p className="mt-1 text-[10px] text-muted-foreground/60">Перетягніть картку сюди</p>
                            </div>
                          )
                        ) : (
                          items.map((row, index) => {
                            const badge = getDeadlineBadge(row.deadline_at ?? null);
                            const Icon = quoteTypeIcon(row.quote_type);
                            const normalizedStatus = normalizeStatus(row.status);
                            const membership = quoteMembershipByQuoteId.get(row.id);
                            return (
                              <div key={row.id}>
                                {draggingId && dragPlaceholder?.columnId === column.id && dragPlaceholder.index === index ? (
                                  <div className="kanban-drop-placeholder-inline" />
                                ) : null}
                                <div
                                  data-kanban-card="true"
                                  draggable
                                  onDragStart={() => handleDragStart(row.id)}
                                  onDragEnd={() => {
                                    setDraggingId(null);
                                    setDragOverColumnId(null);
                                    setDragPlaceholder(null);
                                  }}
                                  onClick={() => navigate(`/orders/estimates/${row.id}`)}
                                  className={cn(
                                    "kanban-estimate-card rounded-[var(--radius-md)] border border-border/60 bg-card p-2.5 transition-all hover:border-border hover:bg-card/90 cursor-pointer active:scale-[0.995]",
                                    draggingId === row.id && "ring-2 ring-primary/30 opacity-90"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {(() => {
                                        const StatusIcon = statusIcons[normalizedStatus] ?? Clock;
                                        return (
                                          <StatusIcon
                                            className={cn(
                                              "h-4 w-4 shrink-0",
                                              statusColorClass[normalizedStatus] ?? "text-muted-foreground"
                                            )}
                                          />
                                        );
                                      })()}
                                      <span className="font-mono text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">
                                        {row.number ?? "Не вказано"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-2.5 space-y-1.5">
                                    {membership ? (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {membership.kp_count > 0 ? (
                                          <Badge
                                            variant="outline"
                                            className="h-5 px-1.5 text-[10px] inline-flex items-center gap-1 quote-kind-badge-kp"
                                          >
                                            <FileText className="h-3 w-3" />
                                            КП{membership.kp_count > 1 ? ` +${membership.kp_count - 1}` : ""}
                                          </Badge>
                                        ) : null}
                                        {membership.set_count > 0 ? (
                                          <Badge
                                            variant="outline"
                                            className="h-5 px-1.5 text-[10px] inline-flex items-center gap-1 quote-kind-badge-set"
                                          >
                                            <Layers className="h-3 w-3" />
                                            Набір{membership.set_count > 1 ? ` +${membership.set_count - 1}` : ""}
                                          </Badge>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    <div className="flex items-center gap-2 text-[15px] font-medium">
                                      {row.customer_logo_url ? (
                                        <img
                                          src={row.customer_logo_url}
                                          alt={row.customer_name ?? "logo"}
                                          className="h-7 w-7 rounded-full object-cover border border-border/60 bg-muted/20"
                                          loading="lazy"
                                          onError={(e) => {
                                            const target = e.currentTarget;
                                            target.style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        <div className="h-7 w-7 rounded-full border border-border/60 bg-muted/20 text-[9px] font-semibold text-muted-foreground flex items-center justify-center">
                                          {getInitials(row.customer_name)}
                                        </div>
                                      )}
                                      <span className="truncate">{row.customer_name ?? "Не вказано"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                                      <AvatarBase
                                        src={row.assigned_to ? memberAvatarById.get(row.assigned_to) ?? null : null}
                                        name={getManagerLabel(row.assigned_to)}
                                        fallback={
                                          row.assigned_to
                                            ? getInitials(getManagerLabel(row.assigned_to))
                                            : "Не вказано"
                                        }
                                        size={22}
                                        className="text-[9px] font-semibold"
                                      />
                                      <span className="truncate">
                                        {getManagerLabel(row.assigned_to)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                                    <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2 py-1 font-semibold">
                                      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                                      {quoteTypeLabel(row.quote_type)}
                                    </div>
                                    {row.deadline_at ? (
                                      (() => {
                                        const shortLabel = formatDeadlineShort(row.deadline_at!);
                                        if (!shortLabel) return null;
                                        return (
                                          <QuoteDeadlineBadge
                                            tone={badge.tone}
                                            label={shortLabel}
                                            compact
                                          />
                                        );
                                      })()
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                        {items.length > 0 &&
                        draggingId &&
                        dragPlaceholder?.columnId === column.id &&
                        dragPlaceholder.index === items.length ? (
                          <div className="kanban-drop-placeholder-inline" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </EstimatesKanbanCanvas>
      ))}

      {rowStatusError && (
        <div className="px-6 pb-4 text-sm text-destructive flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          {rowStatusError}
        </div>
      )}

      {rowDeleteError && (
        <div className="px-6 pb-4 text-sm text-destructive flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          {rowDeleteError}
        </div>
      )}

      {/* ✨ New Linear-style Quote Form */}
      <NewQuoteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleNewFormSubmit}
        teamId={teamId}
        customers={customers}
        customersLoading={customersLoading}
        onCustomerSearch={handleCustomerSearchChange}
        onCreateCustomer={(name) => {
          resetCustomerForm(name || "");
          setCustomerCreateOpen(true);
        }}
        teamMembers={teamMembers}
        catalogTypes={catalogTypes}
        currentUserId={currentUserId}
      />

      {/* Old multi-step form removed - using NewQuoteDialog instead */}

      <CustomerDialog
        open={customerCreateOpen}
        onOpenChange={(open) => {
          setCustomerCreateOpen(open);
          if (!open) {
            resetCustomerForm();
          }
        }}
        form={customerForm}
        setForm={setCustomerForm}
        ownershipOptions={OWNERSHIP_OPTIONS}
        vatOptions={VAT_OPTIONS}
        teamMembers={teamMembers}
        saving={customerCreateSaving}
        error={customerCreateError}
        title="Новий замовник"
        description="Додайте всі дані замовника, щоб одразу підхопити їх у прорахунку."
        submitLabel="Створити клієнта"
        onSubmit={handleCustomerCreate}
      />

      <Dialog
        open={quoteSetDetailsOpen}
        onOpenChange={(open) => {
          setQuoteSetDetailsOpen(open);
          if (!open) {
            setQuoteSetDetailsItems([]);
            setQuoteSetDetailsTarget(null);
            setQuoteSetDetailsLoading(false);
            setQuoteSetEditName("");
            setQuoteSetActionBusy(false);
            setQuoteSetCandidateQuotes([]);
            setQuoteSetCandidateId("");
            setQuoteSetCandidatesLoading(false);
            setQuoteSetPreviewOpen(false);
            setQuoteSetCommercialDoc(null);
            setQuoteSetCommercialLoading(false);
          }
        }}
      >
        <DialogContent className="w-[min(980px,calc(100vw-32px))] max-h-[88vh] overflow-hidden p-0">
          <DialogHeader className="px-5 py-4 border-b border-border/60 bg-muted/10">
            <DialogTitle className="flex items-center gap-2">
              {quoteSetDetailsTarget?.name ?? "Деталі набору"}
              {quoteSetDetailsTarget ? <QuoteKindBadge kind={quoteSetDetailsTarget.kind} /> : null}
            </DialogTitle>
            <DialogDescription>
              {quoteSetDetailsTarget?.customer_name ?? "Замовник не вказаний"} ·{" "}
              {quoteSetDetailsTarget?.created_at
                ? new Date(quoteSetDetailsTarget.created_at).toLocaleString("uk-UA", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Дата не вказана"}
            </DialogDescription>
          </DialogHeader>

          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
                <div className="text-sm font-semibold">Керування</div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">Назва</div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={quoteSetEditName}
                      onChange={(event) => setQuoteSetEditName(event.target.value)}
                      placeholder="Назва набору"
                      disabled={quoteSetActionBusy}
                    />
                    <Button
                      variant="outline"
                      onClick={handleRenameQuoteSet}
                      disabled={quoteSetActionBusy || !quoteSetDetailsTarget}
                    >
                      Зберегти
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">Додати один прорахунок</div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Select
                      value={quoteSetCandidateId}
                      onValueChange={setQuoteSetCandidateId}
                      disabled={quoteSetCandidatesLoading || quoteSetActionBusy || quoteSetCandidateQuotes.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            quoteSetCandidatesLoading
                              ? "Завантаження прорахунків..."
                              : quoteSetCandidateQuotes.length === 0
                              ? "Немає доступних прорахунків для додавання"
                              : "Оберіть прорахунок"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {quoteSetCandidateQuotes.map((quote) => (
                          <SelectItem key={quote.id} value={quote.id}>
                            {(quote.number ?? quote.id.slice(0, 8)) +
                              (quote.status ? ` · ${formatStatusLabel(quote.status)}` : "") +
                              (typeof quote.total === "number" ? ` · ${formatMoney(quote.total)}` : "") +
                              (quote.created_at
                                ? ` · ${new Date(quote.created_at).toLocaleDateString("uk-UA")}`
                                : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={handleAddQuoteToOpenSet}
                      disabled={quoteSetActionBusy || !quoteSetCandidateId}
                    >
                      Додати
                    </Button>
                  </div>
                  {selectedQuoteCandidate ? (
                    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Попередній перегляд
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {selectedQuoteCandidate.number ?? selectedQuoteCandidate.id.slice(0, 8)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedQuoteCandidate.status
                          ? formatStatusLabel(selectedQuoteCandidate.status)
                          : "Статус не вказано"}
                        {typeof selectedQuoteCandidate.total === "number"
                          ? ` · ${formatMoney(selectedQuoteCandidate.total)}`
                          : ""}
                        {selectedQuoteCandidate.created_at
                          ? ` · ${new Date(selectedQuoteCandidate.created_at).toLocaleDateString("uk-UA")}`
                          : ""}
                      </div>
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => navigate(`/orders/estimates/${selectedQuoteCandidate.id}`)}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          Відкрити прорахунок
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                <div className="text-sm font-semibold">Комерційний підсумок</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Позиції</div>
                    <div className="text-sm font-semibold">{quoteSetDetailsItems.length}</div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Середня сума</div>
                    <div className="text-sm font-semibold">{formatMoney(quoteSetAverageAmount)}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Разом</div>
                  <div className="text-base font-semibold">{formatMoney(quoteSetTotalAmount)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handlePreviewQuoteSet();
                    }}
                    disabled={quoteSetCommercialLoading}
                  >
                    <Eye className="mr-1.5 h-4 w-4" />
                    Прев'ю
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handlePrintQuoteSet();
                    }}
                    disabled={quoteSetCommercialLoading}
                  >
                    <Printer className="mr-1.5 h-4 w-4" />
                    Друк
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleExportQuoteSet("pdf");
                    }}
                    disabled={quoteSetCommercialLoading}
                  >
                    <FileDown className="mr-1.5 h-4 w-4" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleExportQuoteSet("xls");
                    }}
                    disabled={quoteSetCommercialLoading}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    XLS
                  </Button>
                </div>
                {quoteSetCommercialLoading ? (
                  <div className="text-xs text-muted-foreground">Генерація комерційного документа...</div>
                ) : null}
                {selectedRows.length > 0 ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      Вибрано в таблиці:{" "}
                      <span className="font-medium text-foreground">{selectedRows.length}</span>
                      {addableSelectedCountForOpenSet > 0
                        ? ` · можна додати: ${addableSelectedCountForOpenSet}`
                        : " · усі вибрані вже всередині або не підходять"}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAddSelectedToQuoteSet}
                      disabled={quoteSetActionBusy || addableSelectedCountForOpenSet <= 0}
                    >
                      Додати вибрані ({addableSelectedCountForOpenSet})
                    </Button>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                    Щоб додати кілька прорахунків, закрийте модалку і виділіть їх у списку.
                  </div>
                )}
                <div className="pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDeleteQuoteSet()}
                    disabled={quoteSetActionBusy || !quoteSetDetailsTarget}
                  >
                    Видалити {quoteSetDetailsTarget?.kind === "kp" ? "КП" : "набір"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20 text-sm font-semibold">
                Склад {quoteSetDetailsTarget?.kind === "kp" ? "КП" : "набору"}
              </div>
              {quoteSetDetailsLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Завантаження складу...</div>
              ) : quoteSetDetailsItems.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  У цьому {quoteSetDetailsTarget?.kind === "kp" ? "КП" : "наборі"} поки немає прорахунків.
                </div>
              ) : (
                <div className="max-h-[48vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="w-[64px]">#</TableHead>
                        <TableHead>Прорахунок</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Створено</TableHead>
                        <TableHead className="w-[190px] text-right">Дії</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quoteSetDetailsItems.map((item, idx) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-mono font-semibold">
                            {item.quote_number ?? item.quote_id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("border", statusPillClasses(item.quote_status))} variant="outline">
                              {formatStatusLabel(item.quote_status ?? null)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {item.quote_created_at
                              ? new Date(item.quote_created_at).toLocaleString("uk-UA", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/orders/estimates/${item.quote_id}`)}
                              >
                                Відкрити
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => handleRemoveItemFromQuoteSet(item.id)}
                                disabled={quoteSetActionBusy}
                              >
                                Прибрати
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteSetPreviewOpen} onOpenChange={setQuoteSetPreviewOpen}>
        <DialogContent className="w-[min(980px,calc(100vw-32px))] max-h-[88vh] overflow-hidden p-0">
          <DialogHeader className="px-5 py-4 border-b border-border/60 bg-muted/10">
            <DialogTitle className="flex items-center gap-2">
              Комерційний прев'ю
              {quoteSetDetailsTarget ? <QuoteKindBadge kind={quoteSetDetailsTarget.kind} label={quoteSetDetailsTarget.name} /> : null}
            </DialogTitle>
            <DialogDescription>
              Разом: {formatMoney(quoteSetCommercialDoc?.total ?? quoteSetTotalAmount)} · Позицій:{" "}
              {quoteSetCommercialDoc?.sections.length ?? quoteSetDetailsItems.length}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 space-y-4 overflow-y-auto">
            {quoteSetCommercialLoading ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                Генерація прев'ю...
              </div>
            ) : !quoteSetCommercialDoc ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                Немає даних для відображення.
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 grid gap-2 sm:grid-cols-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Замовник:</span>{" "}
                    <span className="font-medium">{quoteSetCommercialDoc.customerName}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Прорахунків:</span>{" "}
                    <span className="font-medium">{quoteSetCommercialDoc.sections.length}</span>
                  </div>
                </div>
                {quoteSetCommercialDoc.sections.map((section, sectionIndex) => (
                  <div key={`preview-group-${section.quoteId}`} className="rounded-xl border border-border/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {sectionIndex + 1}. {section.quoteNumber}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {section.status} · {section.createdAt}
                      </div>
                    </div>
                    {section.visualizations.length > 0 ? (
                      <div className="px-4 py-3 border-b border-border/60 bg-muted/10">
                        <div className="text-xs text-muted-foreground mb-2">
                          Візуалізації ({section.visualizations.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.visualizations.map((visual, idx) => (
                            <img
                              key={`${section.quoteId}-visual-${idx}`}
                              src={visual.url}
                              alt={visual.name || `${section.quoteNumber} visual ${idx + 1}`}
                              className="h-24 w-40 rounded-md border border-border/60 object-cover bg-muted/20"
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/10">
                          <TableHead className="w-[60px]">#</TableHead>
                          <TableHead className="w-[84px]">Фото</TableHead>
                          <TableHead>Товар</TableHead>
                          <TableHead>Специфікація</TableHead>
                          <TableHead className="text-right">К-сть</TableHead>
                          <TableHead className="text-right">Од.</TableHead>
                          <TableHead className="text-right">Ціна</TableHead>
                          <TableHead className="text-right">Сума</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                              У цьому прорахунку немає товарних позицій.
                            </TableCell>
                          </TableRow>
                        ) : (
                          section.items.map((item) => (
                            <TableRow key={`preview-item-${item.id}`}>
                              <TableCell className="text-muted-foreground">{item.position}</TableCell>
                              <TableCell>
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-12 w-12 rounded-md border border-border/60 object-cover bg-muted/20"
                                  />
                                ) : (
                                  <div className="h-12 w-12 rounded-md border border-border/60 bg-muted/20 grid place-items-center text-xs text-muted-foreground">
                                    —
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{item.name}</div>
                                {item.description ? (
                                  <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                {item.catalogPath ? (
                                  <div className="text-xs text-muted-foreground">{item.catalogPath}</div>
                                ) : null}
                                {item.placementSummary ? (
                                  <div className="text-xs text-muted-foreground">{item.placementSummary}</div>
                                ) : null}
                                {item.methodsSummary ? (
                                  <div className="text-xs text-muted-foreground">{item.methodsSummary}</div>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right">{formatMoneyPlain(item.qty)}</TableCell>
                              <TableCell className="text-right">{item.unit}</TableCell>
                              <TableCell className="text-right">{formatMoneyPlain(item.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">{formatMoney(item.lineTotal)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <div className="px-4 py-3 border-t border-border/60 bg-muted/10 flex items-center justify-end text-sm font-medium">
                      Разом по прорахунку: {formatMoney(section.total)}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Загальна сума</span>
                  <span className="text-lg font-semibold">{formatMoney(quoteSetCommercialDoc.total)}</span>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="px-5 py-4 border-t border-border/60 bg-muted/5">
            <Button variant="outline" onClick={() => setQuoteSetPreviewOpen(false)}>
              Закрити
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void handlePrintQuoteSet();
              }}
              disabled={quoteSetCommercialLoading}
            >
              <Printer className="mr-1.5 h-4 w-4" />
              Друк
            </Button>
            <Button
              onClick={() => {
                void handleExportQuoteSet("pdf");
              }}
              disabled={quoteSetCommercialLoading}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Експорт PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void handleExportQuoteSet("xls");
              }}
              disabled={quoteSetCommercialLoading}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Експорт XLS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={quoteSetDialogOpen}
        onOpenChange={(open) => {
          if (quoteSetSaving) return;
          setQuoteSetDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Сформувати набір</DialogTitle>
            <DialogDescription>
              У набір увійдуть {selectedRows.length} прорахунків одного замовника.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Назва набору</div>
              <Input
                value={quoteSetName}
                onChange={(event) => setQuoteSetName(event.target.value)}
                placeholder="Напр. Набір для весняної кампанії"
                disabled={quoteSetSaving}
              />
            </div>
            {bulkValidationMessage ? (
              <div className="text-xs text-warning-foreground">{bulkValidationMessage}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuoteSetDialogOpen(false)}
              disabled={quoteSetSaving}
            >
              Скасувати
            </Button>
            <Button onClick={handleCreateQuoteSet} disabled={quoteSetSaving || !canRunGroupedActions}>
              {quoteSetSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Створити набір
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkAddExistingOpen}
        onOpenChange={(open) => {
          if (bulkAddBusy) return;
          setBulkAddExistingOpen(open);
          if (!open) {
            setBulkAddTargetSetId("");
            setBulkAddKindFilter("all");
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Додати вибрані в існуючий КП/набір</DialogTitle>
            <DialogDescription>
              Додаємо {selectedRows.length} вибраних прорахунків до вже створеної групи.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={bulkAddKindFilter === "all" ? "primary" : "outline"}
                onClick={() => setBulkAddKindFilter("all")}
                disabled={bulkAddBusy}
              >
                Всі
              </Button>
              <Button
                size="sm"
                variant={bulkAddKindFilter === "kp" ? "primary" : "outline"}
                onClick={() => setBulkAddKindFilter("kp")}
                disabled={bulkAddBusy}
              >
                КП
              </Button>
              <Button
                size="sm"
                variant={bulkAddKindFilter === "set" ? "primary" : "outline"}
                onClick={() => setBulkAddKindFilter("set")}
                disabled={bulkAddBusy}
              >
                Набори
              </Button>
            </div>
            <Select
              value={bulkAddTargetSetId}
              onValueChange={setBulkAddTargetSetId}
              disabled={bulkAddBusy || bulkAddAvailableSets.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    bulkAddAvailableSets.length === 0
                      ? "Немає доступних КП/наборів для додавання"
                      : "Оберіть КП або набір"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {bulkAddAvailableSets.map((set) => (
                  <SelectItem key={set.id} value={set.id}>
                    {set.kind === "kp" ? "КП" : "Набір"} · {set.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bulkAddAvailableSets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Серед цього замовника немає існуючих КП/наборів для додавання нових позицій.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkAddExistingOpen(false)}
              disabled={bulkAddBusy}
            >
              Скасувати
            </Button>
            <Button
              onClick={handleBulkAddToExistingSet}
              disabled={bulkAddBusy || !bulkAddTargetSetId}
            >
              {bulkAddBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={quickAddOpen}
        onOpenChange={(open) => {
          if (quickAddBusy) return;
          setQuickAddOpen(open);
          if (!open) {
            setQuickAddTargetQuote(null);
            setQuickAddTargetSetId("");
            setQuickAddKindFilter("all");
            setQuickAddLoadingSets(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Додати в існуючий КП/набір</DialogTitle>
            <DialogDescription>
              {quickAddTargetQuote?.number ?? "Прорахунок"} ·{" "}
              {quickAddTargetQuote?.customer_name ?? "Замовник не вказаний"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={quickAddKindFilter === "all" ? "primary" : "outline"}
                onClick={() => setQuickAddKindFilter("all")}
                disabled={quickAddBusy}
              >
                Всі
              </Button>
              <Button
                size="sm"
                variant={quickAddKindFilter === "kp" ? "primary" : "outline"}
                onClick={() => setQuickAddKindFilter("kp")}
                disabled={quickAddBusy}
              >
                КП
              </Button>
              <Button
                size="sm"
                variant={quickAddKindFilter === "set" ? "primary" : "outline"}
                onClick={() => setQuickAddKindFilter("set")}
                disabled={quickAddBusy}
              >
                Набори
              </Button>
            </div>
            <Select
              value={quickAddTargetSetId}
              onValueChange={setQuickAddTargetSetId}
              disabled={quickAddBusy || quickAddLoadingSets || quickAddAvailableSets.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    quickAddLoadingSets
                      ? "Завантаження КП/наборів..."
                      : quickAddAvailableSets.length === 0
                      ? "Немає доступних КП/наборів для додавання"
                      : "Оберіть КП або набір"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {quickAddAvailableSets.map((set) => (
                  <SelectItem key={set.id} value={set.id}>
                    {(set.kind === "kp" ? "КП" : "Набір") +
                      ` · ${set.name}` +
                      ` · ${set.item_count} поз.`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {quickAddAvailableSets.length === 0 && !quickAddLoadingSets ? (
              <div className="text-xs text-muted-foreground">
                Для цього замовника немає сумісних КП/наборів, або прорахунок уже входить у всі доступні.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddOpen(false)} disabled={quickAddBusy}>
              Скасувати
            </Button>
            <Button onClick={handleQuickAddToSet} disabled={quickAddBusy || !quickAddTargetSetId}>
              {quickAddBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Додати
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-border/60 bg-muted/10">
            <DialogTitle className="text-lg">Видалити прорахунок?</DialogTitle>
            <DialogDescription>Це видалить прорахунок і пов’язані дані. Дію не можна скасувати.</DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-3">
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Це видалить прорахунок і пов'язані дані. Дію не можна скасувати.
            </div>
          </div>
          <DialogFooter className="px-4 py-3 border-t border-border/60 bg-muted/5">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={!!rowDeleteBusy}>
              Скасувати
            </Button>
            <Button
              variant="destructiveSolid"
              size="sm"
              onClick={handleDelete}
              disabled={!!rowDeleteBusy}
              className="gap-2"
            >
              {rowDeleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Видалити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (reused create dialog) */}
      <NewQuoteDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditTarget(null);
            setEditInitialValues(null);
            setEditError(null);
            setEditLoading(false);
          }
        }}
        onSubmit={handleEditSubmit}
        mode="edit"
        submitting={editSaving || editLoading}
        submitError={editError}
        quoteLabel={editTarget?.number ? `#${editTarget.number}` : editTarget?.id ?? null}
        customerLabel={editTarget?.customer_name ?? null}
        initialValues={editInitialValues ?? undefined}
        teamId={teamId}
        customers={customers}
        customersLoading={customersLoading}
        onCustomerSearch={handleCustomerSearchChange}
        teamMembers={teamMembers}
        catalogTypes={catalogTypes}
        currentUserId={currentUserId}
      />
    </PageCanvas>
  );
}
