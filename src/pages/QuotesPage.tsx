import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
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
  listCustomersBySearch,
  createQuote,
  deleteQuote,
  getQuoteSummary,
  listTeamMembers,
  setStatus as setQuoteStatus,
  updateQuote,
  type QuoteListRow,
  type TeamMemberRow,
  type CustomerRow,
} from "@/lib/toshoApi";
import { NewQuoteDialog } from "@/components/quotes";
import type { NewQuoteFormData } from "@/components/quotes";
import { CustomerDialog } from "@/components/customers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  X, 
  Filter, 
  Shirt,
  Printer,
  Layers,
  MoreVertical,
  Copy,
  Trash2,
  FileText,
  Plus as PlusIcon,
  Loader2,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Check,
  Hourglass,
  PlusCircle,
  CalendarClock,
  CalendarDays,
  Timer,
  Pencil,
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

const statusIcons: Record<string, ComponentType<{ className?: string }>> = {
  new: PlusCircle,
  estimating: PlayCircle,
  estimated: Check,
  awaiting_approval: Hourglass,
  approved: CheckCircle2,
  cancelled: XCircle,
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

const statusColorClass: Record<string, string> = {
  new: "text-muted-foreground",
  estimating: "text-sky-400",
  estimated: "text-violet-400",
  awaiting_approval: "text-amber-400",
  approved: "text-emerald-400",
  cancelled: "text-rose-400",
};

const KANBAN_COLUMNS = [
  { id: "new", label: statusLabels.new, dotClass: "bg-muted-foreground/60" },
  { id: "estimating", label: statusLabels.estimating, dotClass: "bg-sky-400" },
  { id: "estimated", label: statusLabels.estimated, dotClass: "bg-violet-400" },
  { id: "awaiting_approval", label: statusLabels.awaiting_approval, dotClass: "bg-amber-400" },
  { id: "approved", label: statusLabels.approved, dotClass: "bg-emerald-400" },
  { id: "cancelled", label: statusLabels.cancelled, dotClass: "bg-rose-400" },
];

type OwnershipOption = {
  value: string;
  label: string;
};

type VatOption = {
  value: string;
  label: string;
  rate: number | null;
};

const OWNERSHIP_OPTIONS: OwnershipOption[] = [
  { value: "tov", label: "ТОВ" },
  { value: "pp", label: "ПП" },
  { value: "vp", label: "ВП" },
  { value: "at", label: "АТ" },
  { value: "dp", label: "ДП" },
  { value: "fop", label: "ФОП" },
];

const VAT_OPTIONS: VatOption[] = [
  { value: "none", label: "немає", rate: null },
  { value: "0", label: "0%", rate: 0 },
  { value: "7", label: "7%", rate: 7 },
  { value: "14", label: "14%", rate: 14 },
  { value: "20", label: "20%", rate: 20 },
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
type PrintConfig = {
  id: string;
  methodId: string;
  positionId: string;
  widthMm: string;
  heightMm: string;
};

const createPrintConfig = (): PrintConfig => ({
  id: crypto.randomUUID(),
  methodId: "",
  positionId: "",
  widthMm: "",
  heightMm: "",
});

const QUOTE_TYPE_OPTIONS = [
  { id: "merch", label: "Мерч", icon: Shirt },
  { id: "print", label: "Поліграфія", icon: Printer },
  { id: "other", label: "Інше", icon: Layers },
];

const DELIVERY_TYPE_OPTIONS = [
  { id: "nova_poshta", label: "Нова пошта" },
  { id: "pickup", label: "Самовивіз" },
  { id: "taxi", label: "Таксі" },
];

  const quoteTypeLabel = (value?: string | null) =>
    QUOTE_TYPE_OPTIONS.find((item) => item.id === value)?.label ?? "—";

  const quoteTypeIcon = (value?: string | null) =>
    QUOTE_TYPE_OPTIONS.find((item) => item.id === value)?.icon;

const QUOTE_ATTACHMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_ITEM_VISUAL_BUCKET as string | undefined) || "attachments";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

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

  const selectedType = useMemo(
    () => catalogTypes.find((t) => t.id === selectedTypeId),
    [catalogTypes, selectedTypeId]
  );
  const selectedKinds = selectedType?.kinds ?? [];
  const selectedKind = useMemo(
    () => selectedKinds.find((k) => k.id === selectedKindId),
    [selectedKinds, selectedKindId]
  );
  const selectedModels = selectedKind?.models ?? [];
  const selectedModel = useMemo(
    () => selectedModels.find((m) => m.id === selectedModelId),
    [selectedModels, selectedModelId]
  );
  const availableMethods = selectedKind?.methods ?? [];
  const availablePrintPositions = selectedKind?.printPositions ?? [];
  const hasValidPrintConfigs =
    printConfigs.length > 0 && printConfigs.every((print) => print.methodId && print.positionId);

  const formatStatusLabel = (value: string | null | undefined) => {
    const normalized = normalizeStatus(value);
    return (normalized && statusLabels[normalized]) || value || "—";
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

  const getInitials = (name?: string | null) => {
    if (!name) return "—";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "—";
    const first = parts[0][0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
    return (first + last).toUpperCase();
  };

  const getDateLabels = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
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
    if (!value) return { label: "—", className: "text-muted-foreground", tone: "none" as const };
    const date = parseDateOnly(value);
    if (Number.isNaN(date.getTime())) {
      return { label: "—", className: "text-muted-foreground", tone: "none" as const };
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
      try {
        const data = await listTeamMembers(teamId);
        if (active) setTeamMembers(data);
      } catch {
        if (active) setTeamMembers([]);
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
      } catch (e: any) {
        if (!cancelled) {
          setCatalogError(e?.message ?? "Не вдалося завантажити каталог.");
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
    } catch (e: any) {
      setError(e?.message ?? "Не вдалося завантажити список.");
      setRows([]);
      setAttachmentCounts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!teamId) return;
    const delay = search.trim() ? 350 : 0;
    const id = window.setTimeout(() => {
      void loadQuotes();
    }, delay);
    return () => window.clearTimeout(id);
  }, [teamId, status, search]);

  const handleRowStatusChange = async (quoteId: string, nextStatus: string) => {
    setRowStatusBusy(quoteId);
    setRowStatusError(null);
    try {
      await setQuoteStatus({ quoteId, status: nextStatus });
      setRows((prev) =>
        prev.map((row) => (row.id === quoteId ? { ...row, status: nextStatus } : row))
      );
    } catch (e: any) {
      setRowStatusError(e?.message ?? "Не вдалося змінити статус.");
    } finally {
      setRowStatusBusy(null);
    }
  };

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
      setCatalogTypes((data as any[]) ?? []);
    } catch (e: any) {
      setCatalogError(e?.message ?? "Не вдалося завантажити каталог.");
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
        } catch (attachmentError: any) {
          attachmentWarning = attachmentError?.message ?? "Не вдалося завантажити файли.";
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
    } catch (e: any) {
      console.error("Error creating quote:", e);
      setCreateError(e?.message ?? "Не вдалося створити прорахунок.");
      toast.error("Помилка створення прорахунку", {
        description: e?.message,
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
    } catch (err: any) {
      setCustomerCreateError(err?.message ?? "Не вдалося створити клієнта.");
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

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const uploadPendingAttachments = async (quoteId: string) => {
    if (pendingAttachments.length === 0) return;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error(userError?.message ?? "Користувач не авторизований");
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
    } catch (error: any) {
      const message = error?.message?.toLowerCase?.() ?? "";
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
      throw new Error(userError?.message ?? "Користувач не авторизований");
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
    } catch (error: any) {
      const message = error?.message?.toLowerCase?.() ?? "";
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
      } catch (attachmentError: any) {
        attachmentWarning = attachmentError?.message ?? "Не вдалося завантажити файли замовника.";
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
    } catch (e: any) {
      setCreateError(e?.message ?? "Не вдалося створити прорахунок.");
    } finally {
      setCreating(false);
    }
  };

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

  useEffect(() => {
    localStorage.setItem("quotes_view_mode", viewMode);
  }, [viewMode]);

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
    } catch (e: any) {
      toast.error("Не вдалося змінити статус", { description: e?.message });
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
      });
    } catch (e: any) {
      setEditError(e?.message ?? "Не вдалося завантажити актуальні дані прорахунку.");
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
              }
            : row
        )
      );
      setEditDialogOpen(false);
      setEditInitialValues(null);
      toast.success("Прорахунок оновлено");
    } catch (e: any) {
      setEditError(e?.message ?? "Не вдалося оновити прорахунок.");
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
    } catch (e: any) {
      const message = e?.message ?? "Не вдалося видалити прорахунок.";
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
    } catch (e: any) {
      toast.error("Не вдалося змінити статус", { description: e?.message });
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
    } catch (e: any) {
      toast.error("Помилка видалення", { description: e?.message });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20">
      {/* Filters and Search */}
      <div className="rounded-xl border border-border bg-card/70 shadow-sm overflow-hidden mb-6 sticky top-4 z-10 backdrop-blur">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold">Прорахунки</h1>
              <p className="text-sm text-muted-foreground">Керуйте прорахунками та пропозиціями</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1">
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("table")}
                  aria-label="Табличний вигляд"
                >
                  ≡
                </Button>
                <Button
                  variant={viewMode === "kanban" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode("kanban")}
                  aria-label="Kanban вигляд"
                >
                  ▦
                </Button>
              </div>
              <Button onClick={openCreate} size="lg" className="gap-2">
                <PlusIcon className="h-4 w-4" />
                Новий прорахунок
              </Button>
            </div>
          </div>

          <ActiveHereCard entries={workspacePresence.activeHereEntries} />

          {/* Search Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук за назвою, номером або замовником..."
                className="pl-10 pr-12 h-11"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {loading && search && (
                <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Знайдено:</span>
              <Badge variant="secondary" className="font-semibold">
                {filteredAndSortedRows.length}
              </Badge>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                Скинути фільтри
              </Button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Button
              variant={quickFilter === "all" ? "primary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("all")}
            >
              Всі
            </Button>
            <Button
              variant={quickFilter === "new" ? "primary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("new")}
              className="gap-1.5"
            >
              <FileText className="h-3 w-3" />
              Нові
            </Button>
            <Button
              variant={quickFilter === "estimated" ? "primary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("estimated")}
            >
              Пораховано
            </Button>

            <div className="h-4 w-px bg-border mx-2" />

            <Select value={status} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-9">
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

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 ml-auto text-xs">
                {search.trim() && <Badge variant="outline">Пошук: “{search.trim()}”</Badge>}
                {quickFilter !== "all" && (
                  <Badge variant="outline">
                    {quickFilter === "new" ? "Тільки нові" : "Тільки пораховано"}
                  </Badge>
                )}
                {status !== "all" && <Badge variant="outline">{formatStatusLabel(status)}</Badge>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <div className="text-sm font-semibold">Вибрано: {selectedIds.size}</div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={() => handleBulkStatus("approved")}
            >
              Поставити “Затверджено”
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={() => handleBulkStatus("cancelled")}
            >
              Поставити “Скасовано”
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkBusy}
              onClick={handleBulkDelete}
            >
              Видалити
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
          >
            Скасувати вибір
          </Button>
        </div>
      )}

      {/* Views */}
      {viewMode === "table" ? (
        <div className="rounded-xl border border-border bg-card/70 shadow-sm overflow-hidden">
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
            <div className="overflow-x-auto">
              <Table className="[&_th]:px-4 [&_td]:px-4">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b [&>th+th]:border-l [&>th+th]:border-border/50">
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
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "hover:bg-muted/15 cursor-pointer group transition-colors [&>td+td]:border-l [&>td+td]:border-border/50",
                          isSelected && "bg-primary/5 border-primary/30"
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
                          <span className="group-hover:underline underline-offset-2">
                            {row.number ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.created_at ? (
                            (() => {
                              const labels = getDateLabels(row.created_at);
                              if (labels === "—") return "—";
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
                            "—"
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
                            <span className="truncate" title={row.customer_name ?? "—"}>
                              {row.customer_name ?? "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <AvatarBase
                              src={row.assigned_to ? memberAvatarById.get(row.assigned_to) ?? null : null}
                              name={row.assigned_to ? memberById.get(row.assigned_to) ?? row.assigned_to : "—"}
                              fallback={
                                row.assigned_to ? getInitials(memberById.get(row.assigned_to) ?? row.assigned_to) : "—"
                              }
                              size={28}
                              className="text-[10px] font-semibold"
                            />
                            <span>
                              {row.assigned_to ? memberById.get(row.assigned_to) ?? row.assigned_to : "—"}
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
        <div className="mt-2">
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
            <div className="overflow-x-auto">
              <div className="min-w-[1100px] flex gap-4 px-0 pb-6">
                {KANBAN_COLUMNS.map((column) => {
                  const items = groupedByStatus[column.id] ?? [];
                  return (
                    <div
                      key={column.id}
                      className="flex-1 min-w-[240px] max-w-[320px] bg-card/60 border border-border/60 rounded-lg shadow-sm flex flex-col"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropToStatus(column.id);
                      }}
                    >
                      <div className="flex items-center justify-between px-3 py-3 border-b border-border/70 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const Icon = statusIcons[column.id] ?? Clock;
                            return <Icon className={cn("h-4 w-4", statusColorClass[column.id] ?? "text-muted-foreground")} />;
                          })()}
                          <span>{column.label}</span>
                        </div>
                        <Badge variant="secondary" className="text-[11px] px-2 py-0.5 font-semibold">
                          {items.length}
                        </Badge>
                      </div>
                      <div
                        className={cn(
                          "p-3 space-y-3 flex-1 overflow-y-auto",
                          draggingId && "pb-5"
                        )}
                      >
                        {items.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 text-muted-foreground text-xs p-4 text-center">
                            Немає прорахунків
                          </div>
                        ) : (
                          items.map((row) => {
                            const badge = getDeadlineBadge(row.deadline_at ?? null);
                            const Icon = quoteTypeIcon(row.quote_type);
                            const normalizedStatus = normalizeStatus(row.status);
                            const statusClass = statusClasses[normalizedStatus] ?? statusClasses.new;
                            return (
                              <div
                                key={row.id}
                                draggable
                                onDragStart={() => handleDragStart(row.id)}
                                onDragEnd={() => setDraggingId(null)}
                                onClick={() => navigate(`/orders/estimates/${row.id}`)}
                                className={cn(
                                  "rounded-lg border border-border/70 bg-card/80 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
                                  draggingId === row.id && "ring-2 ring-primary/40"
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
                                      {row.number ?? "—"}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-3 space-y-2">
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
                                    <span className="truncate">{row.customer_name ?? "—"}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <AvatarBase
                                      src={row.assigned_to ? memberAvatarById.get(row.assigned_to) ?? null : null}
                                      name={row.assigned_to ? memberById.get(row.assigned_to) ?? row.assigned_to : "—"}
                                      fallback={
                                        row.assigned_to
                                          ? getInitials(memberById.get(row.assigned_to) ?? row.assigned_to)
                                          : "—"
                                      }
                                      size={22}
                                      className="text-[9px] font-semibold"
                                    />
                                    <span className="truncate">
                                      {row.assigned_to ? memberById.get(row.assigned_to) ?? row.assigned_to : "—"}
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
      )}

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
