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
  updateQuoteSetName,
  deleteQuoteSet,
  removeQuoteSetItem,
  addQuotesToQuoteSet,
  listCustomersBySearch,
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
  type TeamMemberRow,
  type CustomerRow,
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
  CalendarClock,
  CalendarDays,
  Timer,
  Pencil,
  Calculator,
  LayoutGrid,
  List,
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

type QuotesPageProps = {
  teamId: string;
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

export function QuotesPage({ teamId }: QuotesPageProps) {
  const navigate = useNavigate();
  const workspacePresence = useWorkspacePresence();
  const [rows, setRows] = useState<QuoteListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState("all");
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [teamMembersLoaded, setTeamMembersLoaded] = useState(false);
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
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
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
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
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
  >(new Map());
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
  const [quoteSetDialogOpen, setQuoteSetDialogOpen] = useState(false);
  const [quoteSetName, setQuoteSetName] = useState("");
  const [quoteSetSaving, setQuoteSetSaving] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTargetQuote, setQuickAddTargetQuote] = useState<QuoteListRow | null>(null);
  const [quickAddTargetSetId, setQuickAddTargetSetId] = useState("");
  const [quickAddKindFilter, setQuickAddKindFilter] = useState<"all" | "kp" | "set">("all");
  const [quickAddLoadingSets, setQuickAddLoadingSets] = useState(false);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>();

  // Get current user ID
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id);
    });
  }, []);

  const memberById = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member.label])),
    [teamMembers]
  );
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
    if (!value) return { label: "Не вказано", className: "text-muted-foreground", tone: "none" as const };
    const date = parseDateOnly(value);
    if (Number.isNaN(date.getTime())) {
      return { label: "Не вказано", className: "text-muted-foreground", tone: "none" as const };
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
        tone: "overdue" as const,
      };
    }
    if (diffDays === 0) {
      return {
        label: "Сьогодні",
        className:
          "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/40 dark:text-amber-200 dark:bg-amber-500/15",
        tone: "today" as const,
      };
    }
    if (diffDays <= 2) {
      return {
        label: diffDays === 1 ? "Завтра" : `Через ${diffDays} дн.`,
        className:
          "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-100 dark:bg-amber-500/10",
        tone: "soon" as const,
      };
    }
    return {
      label: date.toLocaleDateString("uk-UA"),
      className: "border-border/60 text-muted-foreground bg-muted/20",
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
        }
      } catch {
        if (active) {
          setTeamMembers([]);
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
    setLoading(true);
    setError(null);
    try {
      const data = await listQuotes({ teamId, search, status });
      setRows(data);
      const ids = data.map((row) => row.id).filter(Boolean);
      try {
        const membershipMap = await listQuoteSetMemberships(teamId, ids);
        setQuoteMembershipByQuoteId(membershipMap);
      } catch {
        setQuoteMembershipByQuoteId(new Map());
      }
      if (ids.length === 0) {
        setAttachmentCounts({});
      } else {
        try {
          const { data: attachmentRows, error: attachmentsError } = await supabase
            .schema("tosho")
            .from("quote_attachments")
            .select("quote_id")
            .in("quote_id", ids);
          if (attachmentsError) throw attachmentsError;
          const counts: Record<string, number> = {};
          (attachmentRows ?? []).forEach((row) => {
            const quoteId = row.quote_id as string | undefined;
            if (!quoteId) return;
            counts[quoteId] = (counts[quoteId] ?? 0) + 1;
          });
          setAttachmentCounts(counts);
        } catch {
          setAttachmentCounts({});
        }
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Не вдалося завантажити список."));
      setRows([]);
      setAttachmentCounts({});
      setQuoteMembershipByQuoteId(new Map());
    } finally {
      setLoading(false);
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
      const data = await listCustomersBySearch(teamId, search);
      setCustomers(data);
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

      const created = await createQuote({
        teamId,
        customerId: data.customerId!,
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

  const hasActiveFilters = useMemo(
    () => Boolean(search.trim()) || quickFilter !== "all" || status !== "all",
    [search, quickFilter, status]
  );

  const clearFilters = () => {
    setSearch("");
    setQuickFilter("all");
    setStatusFilter("all");
  };

  const filteredAndSortedRows = useMemo(() => {
    let filtered = [...rows];

    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((row) => {
        const hay = [
          row.number,
          row.comment,
          row.title,
          row.customer_name,
          row.quote_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Quick filters
    if (quickFilter === "new") {
      filtered = filtered.filter((row) => normalizeStatus(row.status) === "new");
    } else if (quickFilter === "estimated") {
      filtered = filtered.filter((row) => normalizeStatus(row.status) === "estimated");
    }

    // Status dropdown
    if (status && status !== "all") {
      filtered = filtered.filter((row) => normalizeStatus(row.status) === status);
    }

    // Sorting
    if (sortBy === "date") {
      filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      });
    } else if (sortBy === "number") {
      filtered.sort((a, b) => {
        const numA = parseInt(a.number || "0", 10);
        const numB = parseInt(b.number || "0", 10);
        return sortOrder === "asc" ? numA - numB : numB - numA;
      });
    }

    return filtered;
  }, [rows, search, quickFilter, status, sortBy, sortOrder]);

  const filteredQuoteSets = useMemo(() => {
    const q = quoteSetSearch.trim().toLowerCase();
    return quoteSets.filter((set) => {
      if (quoteSetKindFilter !== "all" && (set.kind ?? "set") !== quoteSetKindFilter) return false;
      if (!q) return true;
      const hay = [set.name, set.customer_name, set.kind].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [quoteSets, quoteSetKindFilter, quoteSetSearch]);
  const quoteSetKpCount = useMemo(
    () => filteredQuoteSets.filter((set) => (set.kind ?? "set") === "kp").length,
    [filteredQuoteSets]
  );
  const quoteSetSetCount = useMemo(
    () => filteredQuoteSets.filter((set) => (set.kind ?? "set") === "set").length,
    [filteredQuoteSets]
  );
  const quickAddAvailableSets = useMemo(() => {
    if (!quickAddTargetQuote?.customer_id) return [];
    const membership = quoteMembershipByQuoteId.get(quickAddTargetQuote.id);
    const existingSetIds = new Set((membership?.refs ?? []).map((ref) => ref.id));
    return quoteSets.filter((set) => {
      const matchesCustomer = set.customer_id === quickAddTargetQuote.customer_id;
      const matchesKind = quickAddKindFilter === "all" || (set.kind ?? "set") === quickAddKindFilter;
      const notMemberYet = !existingSetIds.has(set.id);
      return matchesCustomer && matchesKind && notMemberYet;
    });
  }, [quickAddKindFilter, quickAddTargetQuote, quoteMembershipByQuoteId, quoteSets]);

  const foundCount = contentView === "sets" ? filteredQuoteSets.length : filteredAndSortedRows.length;

  const groupedQuotesView = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; name: string; kind: "set" | "kp"; rows: QuoteListRow[] }
    >();
    const ungrouped: QuoteListRow[] = [];

    filteredAndSortedRows.forEach((row) => {
      const refs = quoteMembershipByQuoteId.get(row.id)?.refs ?? [];
      if (refs.length === 0) {
        ungrouped.push(row);
        return;
      }
      refs.forEach((ref) => {
        const current = groups.get(ref.id) ?? { id: ref.id, name: ref.name, kind: ref.kind, rows: [] };
        current.rows.push(row);
        groups.set(ref.id, current);
      });
    });

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "kp" ? -1 : 1;
      return a.name.localeCompare(b.name, "uk-UA");
    });

    return { groups: sortedGroups, ungrouped };
  }, [filteredAndSortedRows, quoteMembershipByQuoteId]);

  useEffect(() => {
    localStorage.setItem("quotes_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (quoteListMode === "grouped" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [quoteListMode, selectedIds.size]);

  const groupedByStatus = useMemo(() => {
    const buckets: Record<string, QuoteListRow[]> = {
      new: [],
      estimating: [],
      estimated: [],
      awaiting_approval: [],
      approved: [],
      cancelled: [],
    };
    filteredAndSortedRows.forEach((row) => {
      const s = normalizeStatus(row.status);
      if (!buckets[s]) buckets[s] = [];
      buckets[s].push(row);
    });
    return buckets;
  }, [filteredAndSortedRows]);

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const selectedRows = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => rowsById.get(id))
        .filter((row): row is QuoteListRow => Boolean(row)),
    [rowsById, selectedIds]
  );

  const selectedCustomers = useMemo(() => {
    const unique = new Set<string>();
    selectedRows.forEach((row) => {
      const key = (row.customer_id ?? row.customer_name ?? "").trim().toLowerCase();
      if (key) unique.add(key);
    });
    return unique;
  }, [selectedRows]);

  const canRunGroupedActions = selectedRows.length >= 2 && selectedCustomers.size === 1;
  const bulkValidationMessage =
    selectedRows.length < 2
      ? "Оберіть щонайменше 2 прорахунки."
      : selectedCustomers.size > 1
      ? "Масові дії доступні тільки для одного замовника."
      : null;

  const addableSelectedCountForOpenSet = useMemo(() => {
    if (!quoteSetDetailsTarget) return 0;
    const existingQuoteIds = new Set(quoteSetDetailsItems.map((item) => item.quote_id));
    return selectedRows.filter(
      (row) => row.customer_id === quoteSetDetailsTarget.customer_id && !existingQuoteIds.has(row.id)
    ).length;
  }, [quoteSetDetailsItems, quoteSetDetailsTarget, selectedRows]);

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

  return (
    <div className="w-full pb-16 space-y-5">
      {/* Modern Linea-style Header Block */}
      <div className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden sticky top-0 z-10">
        <div className="px-5 pt-2 pb-4 space-y-4">
          {/* Header Section */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 min-w-0 lg:min-h-[84px]">
              <div className="h-12 w-12 rounded-[var(--radius-lg)] border border-primary/30 bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Calculator className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex flex-col justify-center gap-1.5">
                <h1 className="text-2xl font-semibold leading-none tracking-tight">Прорахунки</h1>
                <p className="text-sm leading-6 text-muted-foreground">Керуйте прорахунками та пропозиціями</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* View Mode Switcher */}
              <div className="inline-flex h-10 items-center rounded-[var(--radius-lg)] p-1 bg-muted border border-border">
                <Button
                  variant="segmented"
                  size="xs"
                  aria-pressed={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                  className="gap-1.5"
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Список</span>
                </Button>
                <Button
                  variant="segmented"
                  size="xs"
                  aria-pressed={viewMode === "kanban"}
                  onClick={() => setViewMode("kanban")}
                  className="gap-1.5"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Kanban</span>
                </Button>
              </div>
              <Button onClick={openCreate} size="sm" className="gap-2 h-10">
                <PlusIcon className="h-4 w-4" />
                Новий прорахунок
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-start">
            <ActiveHereCard
              entries={workspacePresence.activeHereEntries}
              title="Активні тут"
              className="h-8 px-3 py-0"
            />
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
                  className="h-10 pl-9 pr-9 bg-background border-input hover:bg-muted/20 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40 transition-colors"
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
                {loading && contentView !== "sets" && search && (
                  <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Results Count */}
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="font-semibold px-2.5 py-1 h-10 flex items-center gap-1.5">
                  <span className="tabular-nums">{foundCount}</span>
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
          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
                  Group Mode
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {contentView !== "sets" && selectedIds.size > 0 && (
        <div className="rounded-[var(--radius-section)] border border-border bg-card px-5 py-4 shadow-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-semibold px-2.5 py-1 h-9">
                  Вибрано: {selectedIds.size}
                </Badge>
                {bulkValidationMessage ? (
                  <Badge variant="outline" className="h-9 border-amber-500/40 text-amber-300 bg-amber-500/10">
                    {bulkValidationMessage}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-9 border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                    Можна виконувати об'єднані дії
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={bulkBusy || quoteSetSaving || !canRunGroupedActions}
              onClick={handleBulkCreateKp}
              className="h-9"
            >
              Створити КП
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkBusy || quoteSetSaving || !canRunGroupedActions}
              onClick={openQuoteSetDialog}
              className="h-9"
            >
              Сформувати набір
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy || quoteSetSaving}
              onClick={() => handleBulkStatus("approved")}
              className="h-9"
            >
              Поставити “Затверджено”
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy || quoteSetSaving}
              onClick={() => handleBulkStatus("cancelled")}
              className="h-9"
            >
              Поставити “Скасовано”
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkBusy || quoteSetSaving}
              onClick={handleBulkDelete}
              className="h-9"
            >
              Видалити
            </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0 h-9"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy || quoteSetSaving}
            >
              Скасувати вибір
            </Button>
          </div>
        </div>
      )}

      {contentView !== "quotes" && (
      <div className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden">
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
                <TableRow className="bg-muted/30 border-b border-border/60">
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
                        : "data-[state=selected]:bg-emerald-500/5"
                    )}
                    onClick={() => openQuoteSetDetails(set)}
                  >
                    <TableCell className="pr-0">
                      <div
                        className={cn(
                          "h-8 w-1.5 rounded-full",
                          (set.kind ?? "set") === "kp" ? "bg-sky-400/80" : "bg-emerald-400/80"
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
                            className="h-5 px-1.5 text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10"
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
                      <Badge
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          set.kind === "kp"
                            ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                        )}
                        variant="outline"
                      >
                        {set.kind === "kp" ? <FileText className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                        {set.kind === "kp" ? "КП" : "Набір"}
                      </Badge>
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
      </div>
      )}

      {/* Views */}
      {contentView !== "sets" && (viewMode === "table" ? (
        <div className="rounded-[var(--radius-section)] border border-border bg-card shadow-none overflow-hidden">
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
          ) : quoteListMode === "grouped" ? (
            <div className="p-5 space-y-4">
              {groupedQuotesView.groups.map((group) => (
                <div key={group.id} className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "h-7 w-1.5 rounded-full",
                          group.kind === "kp" ? "bg-sky-400/80" : "bg-emerald-400/80"
                        )}
                      />
                      <Badge
                        variant="outline"
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          group.kind === "kp"
                            ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                        )}
                      >
                        {group.kind === "kp" ? <FileText className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                        {group.kind === "kp" ? "КП" : "Набір"}
                      </Badge>
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
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/60">
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
                                      ? "bg-sky-400/80"
                                      : membership.set_count > 0
                                      ? "bg-emerald-400/80"
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
                                    className="h-5 px-1.5 text-[10px] border-sky-500/40 text-sky-300 bg-sky-500/10 inline-flex items-center gap-1"
                                  >
                                    <FileText className="h-3 w-3" />
                                    КП{membership.kp_count > 1 ? ` +${membership.kp_count - 1}` : ""}
                                  </Badge>
                                ) : null}
                                {membership.set_count > 0 ? (
                                  <Badge
                                    variant="outline"
                                    title={membership.set_names.join(", ")}
                                    className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10 inline-flex items-center gap-1"
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
                              <Badge
                                variant="outline"
                                className={cn("text-xs font-medium", badge.className)}
                                title={titleParts.join(" · ")}
                              >
                                {badge.label}
                              </Badge>
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
        </div>
      ) : (
        <div className="mt-1">
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
            <div className="overflow-x-auto -mx-1">
              <div className="min-w-[1000px] flex gap-3 px-1 pb-4">
                {KANBAN_COLUMNS.map((column) => {
                  const items = groupedByStatus[column.id] ?? [];
                  return (
                    <div
                      key={column.id}
                      className="flex-1 min-w-[220px] max-w-[280px] rounded-[var(--radius-lg)] bg-muted/30 border border-border/50 flex flex-col"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropToStatus(column.id);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 shrink-0">
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
                          "flex-1 overflow-y-auto px-2 pb-3 space-y-2 min-h-[120px]",
                          draggingId && "pb-4"
                        )}
                      >
                        {items.length === 0 ? (
                          <div className="rounded-md border border-dashed border-border/50 bg-transparent text-muted-foreground/70 text-[11px] py-6 px-3 text-center">
                            Немає прорахунків
                          </div>
                        ) : (
                          items.map((row) => {
                            const badge = getDeadlineBadge(row.deadline_at ?? null);
                            const Icon = quoteTypeIcon(row.quote_type);
                            const normalizedStatus = normalizeStatus(row.status);
                            const membership = quoteMembershipByQuoteId.get(row.id);
                            return (
                              <div
                                key={row.id}
                                draggable
                                onDragStart={() => handleDragStart(row.id)}
                                onDragEnd={() => setDraggingId(null)}
                                onClick={() => navigate(`/orders/estimates/${row.id}`)}
                                className={cn(
                                  "rounded-[var(--radius-md)] border border-border/60 bg-card p-3 transition-all hover:border-border hover:bg-card/90 cursor-pointer active:scale-[0.995]",
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
                                <div className="mt-3 space-y-2">
                                  {membership ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {membership.kp_count > 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 text-[10px] border-sky-500/40 text-sky-300 bg-sky-500/10 inline-flex items-center gap-1"
                                        >
                                          <FileText className="h-3 w-3" />
                                          КП{membership.kp_count > 1 ? ` +${membership.kp_count - 1}` : ""}
                                        </Badge>
                                      ) : null}
                                      {membership.set_count > 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10 inline-flex items-center gap-1"
                                        >
                                          <Layers className="h-3 w-3" />
                                          Набір{membership.set_count > 1 ? ` +${membership.set_count - 1}` : ""}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <div className="flex items-center gap-2 text-sm font-medium">
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
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                                  <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2 py-1 font-semibold">
                                    {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                                    {quoteTypeLabel(row.quote_type)}
                                  </div>
                                  {row.deadline_at ? (
                                    (() => {
                                      const shortLabel = formatDeadlineShort(row.deadline_at!);
                                      const pillTone = badge.tone;
                                      const pillClass = {
                                        overdue:
                                          "border-rose-500/30 bg-rose-500/10 text-rose-200",
                                        today:
                                          "border-amber-400/40 bg-amber-500/10 text-amber-100",
                                        soon:
                                          "border-amber-400/30 bg-amber-500/10 text-amber-100",
                                        future:
                                          "border-border/60 bg-muted/20 text-muted-foreground",
                                        none: "hidden",
                                      }[pillTone] ?? "border-border/60 bg-muted/20 text-muted-foreground";
                                      const pillIcon = {
                                        overdue: XCircle,
                                        today: CalendarClock,
                                        soon: Timer,
                                        future: CalendarDays,
                                        none: CalendarDays,
                                      }[pillTone] ?? CalendarDays;
                                      const PillIcon = pillIcon;
                                      if (!shortLabel) return null;
                                      return (
                                        <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-semibold", pillClass)}>
                                          <PillIcon className="h-3.5 w-3.5" />
                                          <span className="leading-tight">{shortLabel}</span>
                                        </div>
                                      );
                                    })()
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
          }
        }}
      >
        <DialogContent className="sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {quoteSetDetailsTarget?.name ?? "Деталі набору"}
              {quoteSetDetailsTarget ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    quoteSetDetailsTarget.kind === "kp"
                      ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
                      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                  )}
                >
                  {quoteSetDetailsTarget.kind === "kp" ? (
                    <FileText className="h-3.5 w-3.5" />
                  ) : (
                    <Layers className="h-3.5 w-3.5" />
                  )}
                  {quoteSetDetailsTarget.kind === "kp" ? "КП" : "Набір"}
                </Badge>
              ) : null}
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
          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
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
                Зберегти назву
              </Button>
            </div>
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
                Додати прорахунок
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddSelectedToQuoteSet}
                disabled={quoteSetActionBusy || addableSelectedCountForOpenSet <= 0}
              >
                Додати вибрані ({addableSelectedCountForOpenSet})
              </Button>
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
          {quoteSetDetailsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Завантаження складу...</div>
          ) : quoteSetDetailsItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              У цьому наборі поки немає прорахунків.
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="w-[80px]">#</TableHead>
                    <TableHead>Прорахунок</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Створено</TableHead>
                    <TableHead className="w-[200px] text-right">Дії</TableHead>
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
              <div className="text-xs text-amber-500">{bulkValidationMessage}</div>
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
    </div>
  );
}
