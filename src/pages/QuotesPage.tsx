import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import {
  listQuotes,
  listCustomersBySearch,
  createQuote,
  deleteQuote,
  listTeamMembers,
  setStatus as setQuoteStatus,
  type QuoteListRow,
  type TeamMemberRow,
  type CustomerRow,
} from "@/lib/toshoApi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { AvatarBase } from "@/components/app/avatar-kit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, 
  X, 
  Filter, 
  Calendar, 
  User, 
  Building2, 
  Hash,
  Shirt,
  Printer,
  Layers,
  MoreVertical,
  Copy,
  Trash2,
  FileText,
  Plus as PlusIcon,
  UserPlus,
  Loader2,
  ArrowUpDown,
  ChevronRight,
  Upload,
  Paperclip,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_OPTIONS = ["draft", "sent", "approved", "rejected", "in_progress", "completed"];

const statusLabels: Record<string, string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  approved: "Погоджено",
  rejected: "Відхилено",
  in_progress: "В роботі",
  completed: "Завершено",
};

const statusIcons: Record<string, ComponentType<{ className?: string }>> = {
  draft: Clock,
  sent: PlayCircle,
  approved: CheckCircle2,
  rejected: XCircle,
  in_progress: PlayCircle,
  completed: Check,
};

const statusClasses: Record<string, string> = {
  draft: "bg-muted/40 text-muted-foreground border-border",
  sent: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/40",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/40",
  rejected:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/40",
  in_progress:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40",
  completed:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-500/50",
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

const QUOTE_TYPE_OPTIONS = [
  { id: "merch", label: "Мерч", icon: Shirt },
  { id: "print", label: "Поліграфія", icon: Printer },
  { id: "other", label: "Інше", icon: Layers },
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quoteType, setQuoteType] = useState("merch");
  const [catalogTypes, setCatalogTypes] = useState<CatalogType[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [selectedKindId, setSelectedKindId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedMethodIds, setSelectedMethodIds] = useState<string[]>([]);
  const [selectedPrintPositionId, setSelectedPrintPositionId] = useState("");
  const [printWidthMm, setPrintWidthMm] = useState("");
  const [printHeightMm, setPrintHeightMm] = useState("");
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
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<"date" | "number" | null>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [quickFilter, setQuickFilter] = useState<"all" | "draft" | "sent">("all");

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

  const formatStatusLabel = (value: string | null | undefined) =>
    (value && statusLabels[value]) || value || "—";

  const statusPillClasses = (value: string | null | undefined) =>
    statusClasses[value ?? ""] ?? "bg-muted/40 text-muted-foreground border-border";

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
    const time = date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 0) return { primary: `Сьогодні, ${time}`, secondary: null };
    if (diffDays === 1) return { primary: `Вчора, ${time}`, secondary: date.toLocaleDateString("uk-UA") };
    return { primary: date.toLocaleDateString("uk-UA"), secondary: null };
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
          setSelectedMethodIds([]);
          setSelectedPrintPositionId("");
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
    void loadQuotes();
  }, [teamId, status]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadQuotes();
    }, 350);
    return () => window.clearTimeout(id);
  }, [search]);

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
    setCatalogTypes([]);
    setSelectedTypeId("");
    setSelectedKindId("");
    setSelectedModelId("");
    setSelectedMethodIds([]);
    setSelectedPrintPositionId("");
    setPrintWidthMm("");
    setPrintHeightMm("");
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
    if (attachmentsInputRef.current) {
      attachmentsInputRef.current.value = "";
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

  const handleCreate = async () => {
    setCreateError(null);
    if (!customerId) {
      setCreateError("Оберіть клієнта.");
      return;
    }
    if (!selectedTypeId) {
      setCreateError("Оберіть категорію.");
      return;
    }
    if (!selectedKindId) {
      setCreateError("Оберіть вид продукції.");
      return;
    }
    if (!selectedModelId) {
      setCreateError("Оберіть модель.");
      return;
    }
    if (!selectedPrintPositionId) {
      setCreateError("Оберіть місце нанесення.");
      return;
    }
    const qtyValue = Number(itemQty);
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setCreateError("Вкажіть коректну кількість.");
      return;
    }
    setCreating(true);
    try {
      const created = await createQuote({
        teamId,
        customerId,
        quoteType,
        comment: comment.trim() || null,
        currency,
        assignedTo: assignedTo === "unassigned" ? null : assignedTo,
        deadlineAt: deadlineDate || null,
        deadlineNote: deadlineNote.trim() || null,
      });
      const basePrice = selectedModel?.price ?? 0;
      const qty = Math.max(1, Math.floor(qtyValue));
      const width = printWidthMm.trim() ? Number(printWidthMm) : null;
      const height = printHeightMm.trim() ? Number(printHeightMm) : null;
      const methodsPayload =
        selectedMethodIds.length > 0
          ? selectedMethodIds.map((id) => ({ method_id: id, count: 1 }))
          : null;

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
          unit: "шт",
          unit_price: basePrice,
          line_total: qty * basePrice,
          catalog_type_id: selectedTypeId,
          catalog_kind_id: selectedKindId,
          catalog_model_id: selectedModelId,
          print_position_id: selectedPrintPositionId,
          print_width_mm: width,
          print_height_mm: height,
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
      setSelectedMethodIds([]);
      setSelectedPrintPositionId("");
      setPrintWidthMm("");
      setPrintHeightMm("");
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

  const filteredAndSortedRows = useMemo(() => {
    let filtered = [...rows];
    
    // Quick filters
    if (quickFilter === "draft") {
      filtered = filtered.filter(row => row.status === "draft");
    } else if (quickFilter === "sent") {
      filtered = filtered.filter(row => row.status === "sent");
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
        const numA = parseInt(a.number || "0");
        const numB = parseInt(b.number || "0");
        return sortOrder === "asc" ? numA - numB : numB - numA;
      });
    }
    
    return filtered;
  }, [rows, quickFilter, sortBy, sortOrder]);

  const handleDuplicate = async (quoteId: string) => {
    // TODO: Implement duplicate functionality
    console.log("Duplicate quote:", quoteId);
  };

  const requestDelete = (quoteId: string) => {
    setDeleteTargetId(quoteId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setRowDeleteBusy(deleteTargetId);
    setRowDeleteError(null);
    try {
      await deleteQuote(deleteTargetId);
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

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Прорахунки</h1>
          <p className="text-sm text-muted-foreground mt-1">Керуйте прорахунками та пропозиціями</p>
        </div>
        <Button onClick={openCreate} size="lg" className="gap-2">
          <PlusIcon className="h-4 w-4" />
          Новий прорахунок
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="rounded-xl border border-border bg-card/70 shadow-sm overflow-hidden mb-6">
        <div className="p-4 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за назвою, номером або замовником..."
              className="pl-10 pr-10 h-11"
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
              variant={quickFilter === "draft" ? "primary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("draft")}
              className="gap-1.5"
            >
              <FileText className="h-3 w-3" />
              Чернетки
            </Button>
            <Button
              variant={quickFilter === "sent" ? "primary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("sent")}
            >
              Надіслані
            </Button>
            
            <div className="h-4 w-px bg-border mx-2" />
            
            <Select value={status} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-9">
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

            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Знайдено:</span>
              <Badge variant="secondary" className="font-semibold">
                {filteredAndSortedRows.length}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                  <TableHead className="w-[140px] min-w-[140px] pl-6">
                    <button
                      onClick={() => handleSort("number")}
                      className="flex items-center gap-1.5 hover:text-foreground transition-colors font-semibold"
                    >
                      <Hash className="h-3.5 w-3.5" />
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
                      <Calendar className="h-3.5 w-3.5" />
                      Дата
                      {sortBy === "date" && (
                        <ArrowUpDown className={cn("h-3.5 w-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="w-[220px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Building2 className="h-3.5 w-3.5" />
                      Замовник
                    </div>
                  </TableHead>
                  <TableHead className="w-[200px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <User className="h-3.5 w-3.5" />
                      Менеджер
                    </div>
                  </TableHead>
                  <TableHead className="w-[140px] font-semibold text-center">
                    Дедлайн
                  </TableHead>
                  <TableHead className="w-[120px] font-semibold text-center">Статус</TableHead>
                  <TableHead className="w-[80px] font-semibold text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" />
                      Файли
                    </div>
                  </TableHead>
                  <TableHead className="w-[120px] font-semibold text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Shirt className="h-3.5 w-3.5" />
                      Тип
                    </div>
                  </TableHead>
                  <TableHead className="w-[60px] pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-muted/20 cursor-pointer group transition-colors odd:bg-muted/10"
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
                    <TableCell className="font-mono font-semibold text-sm whitespace-nowrap min-w-[140px] pl-6">
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
                    <TableCell className="font-medium max-w-[220px] truncate">
                      <span title={row.customer_name ?? "—"}>{row.customer_name ?? "—"}</span>
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
                    <TableCell className="text-center px-2">
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
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-center px-2">
                      {(() => {
                        const Icon = statusIcons[row.status ?? "draft"] ?? Clock;
                        return (
                      <Badge
                        className={cn("cursor-pointer transition-all hover:shadow-sm", statusClasses[row.status ?? "draft"])}
                        variant="outline"
                      >
                        <Icon className="h-3.5 w-3.5 mr-1" />
                        {formatStatusLabel(row.status)}
                      </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center px-2">
                      {attachmentCounts[row.id] ? (
                        <div
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-xs font-medium"
                          title={`Файлів: ${attachmentCounts[row.id]}`}
                        >
                          <Paperclip className="h-3 w-3" />
                          {attachmentCounts[row.id]}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Файлів немає">
                          <Paperclip className="h-3 w-3 opacity-50" />
                          0
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center px-2">
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
                    <TableCell onClick={(e) => e.stopPropagation()} className="pr-6">
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
                ))}
              </TableBody>
            </Table>
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
      </div>

      {/* Create Dialog - Improved */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="p-6 border-b border-border bg-gradient-to-r from-muted/10 to-transparent">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <PlusIcon className="h-5 w-5" />
                Новий прорахунок
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-2">
                Створіть прорахунок для клієнта. Після створення ви зможете додати позиції.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-180px)]">
            {/* Customer Search */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Клієнт <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-11 pl-10"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Почніть вводити назву клієнта..."
                  disabled={creating}
                />
              </div>
              
              {customerSearch.trim() && (
                <div className="max-h-48 overflow-auto rounded-lg border border-border bg-background">
                  {customersLoading ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Завантаження...
                    </div>
                  ) : customers.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-muted-foreground mb-3">Клієнтів не знайдено</p>
                      <Button size="sm" variant="outline" className="gap-2">
                        <UserPlus className="h-4 w-4" />
                        Створити нового клієнта
                      </Button>
                    </div>
                  ) : (
                    customers.map((c) => {
                      const label = c.name || c.legal_name || "Без назви";
                      const isSelected = customerId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCustomerId(c.id);
                            setCustomerSearch(label);
                          }}
                          className={cn(
                            "w-full px-4 py-3 text-left text-sm hover:bg-muted/60 transition-colors flex items-center justify-between",
                            isSelected && "bg-primary/10 hover:bg-primary/20"
                          )}
                          disabled={creating}
                        >
                          <span className="font-medium">{label}</span>
                          {isSelected && <ChevronRight className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              
              {customerLabel && (
                <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md flex items-center gap-2">
                  <Building2 className="h-3 w-3" />
                  Обрано: <span className="font-medium">{customerLabel}</span>
                </div>
              )}
            </div>

            {/* Quote Type */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Тип прорахунку</Label>
              <Tabs value={quoteType} onValueChange={setQuoteType}>
                <TabsList className="grid w-full grid-cols-3 gap-2 bg-transparent p-0">
                  {QUOTE_TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <TabsTrigger
                        key={option.id}
                        value={option.id}
                        className={cn(
                          "h-11 gap-2 rounded-xl border border-border/60 bg-muted/20 text-sm font-semibold",
                          "data-[state=active]:bg-primary/10 data-[state=active]:border-primary/40 data-[state=active]:text-foreground",
                          "hover:bg-muted/40"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            </div>

            {/* Catalog Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Категорія</Label>
              <Select value={selectedTypeId} onValueChange={(value) => {
                setSelectedTypeId(value);
                const nextKindId = catalogTypes.find((t) => t.id === value)?.kinds[0]?.id ?? "";
                const nextModelId = catalogTypes.find((t) => t.id === value)?.kinds[0]?.models[0]?.id ?? "";
                setSelectedKindId(nextKindId);
                setSelectedModelId(nextModelId);
                setSelectedMethodIds([]);
                setSelectedPrintPositionId("");
              }}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={catalogLoading ? "Завантаження..." : "Оберіть категорію"} />
                </SelectTrigger>
                <SelectContent>
                  {catalogTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {catalogError && (
                <div className="text-xs text-destructive">{catalogError}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Вид продукції</Label>
                <Select value={selectedKindId} onValueChange={(value) => {
                  setSelectedKindId(value);
                  const nextModelId = selectedKinds.find((k) => k.id === value)?.models[0]?.id ?? "";
                  setSelectedModelId(nextModelId);
                  setSelectedMethodIds([]);
                  setSelectedPrintPositionId("");
                }}>
                  <SelectTrigger className="h-11" disabled={!selectedTypeId}>
                    <SelectValue placeholder={selectedTypeId ? "Оберіть вид" : "Спочатку категорія"} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedKinds.map((kind) => (
                      <SelectItem key={kind.id} value={kind.id}>
                        {kind.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Модель</Label>
                <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                  <SelectTrigger className="h-11" disabled={!selectedKindId}>
                    <SelectValue placeholder={selectedKindId ? "Оберіть модель" : "Спочатку вид"} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Methods */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Типи нанесення</Label>
              {availableMethods.length === 0 ? (
                <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg px-3 py-2">
                  Немає доступних методів для цього виду
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableMethods.map((method) => {
                    const checked = selectedMethodIds.includes(method.id);
                    return (
                      <label
                        key={method.id}
                        className={cn(
                          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                          checked
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border/60 bg-muted/20 text-foreground"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            setSelectedMethodIds((prev) =>
                              prev.includes(method.id)
                                ? prev.filter((id) => id !== method.id)
                                : [...prev, method.id]
                            );
                          }}
                        />
                        <span>{method.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Print Position */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Місце нанесення</Label>
              <Select value={selectedPrintPositionId} onValueChange={setSelectedPrintPositionId}>
                <SelectTrigger className="h-11" disabled={!selectedKindId}>
                  <SelectValue placeholder={selectedKindId ? "Оберіть місце" : "Спочатку вид"} />
                </SelectTrigger>
                <SelectContent>
                  {availablePrintPositions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Print size */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Висота (мм)</Label>
                <Input
                  className="h-11"
                  value={printHeightMm}
                  onChange={(e) => setPrintHeightMm(e.target.value)}
                  placeholder="Напр. 80"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Ширина (мм)</Label>
                <Input
                  className="h-11"
                  value={printWidthMm}
                  onChange={(e) => setPrintWidthMm(e.target.value)}
                  placeholder="Напр. 120"
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Кількість</Label>
                <Input
                  className="h-11"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  placeholder="Напр. 100"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Одиниця</Label>
                <Select value={itemUnit} onValueChange={setItemUnit}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="шт">шт</SelectItem>
                    <SelectItem value="тираж">тираж</SelectItem>
                    <SelectItem value="набір">набір</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Дедлайн (готовність до відвантаження)</Label>
              <Input
                type="date"
                className="h-11"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
              />
              <Input
                className="h-11"
                value={deadlineNote}
                onChange={(e) => setDeadlineNote(e.target.value)}
                placeholder="Коментар до дедлайну (опціонально)"
                maxLength={200}
              />
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Коментар (опціонально)</Label>
              <Textarea
                className="min-h-[80px] resize-none"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Додайте короткий опис або примітки..."
                maxLength={200}
                disabled={creating}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Максимум 200 символів</span>
                <span>{comment.length}/200</span>
              </div>
            </div>

            {/* Customer Files */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Файл від замовника
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => attachmentsInputRef.current?.click()}
                  disabled={creating || pendingAttachments.length >= MAX_ATTACHMENTS}
                >
                  <Upload className="h-4 w-4" />
                  Додати
                </Button>
              </div>

              <input
                ref={attachmentsInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => handleAttachmentSelect(e.target.files)}
              />

              {pendingAttachments.length === 0 ? (
                <button
                  type="button"
                  onClick={() => attachmentsInputRef.current?.click()}
                  disabled={creating}
                  className={cn(
                    "w-full rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                    "border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
                    creating && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <div className="text-sm font-medium text-foreground mb-1">
                    Додайте файли для цього прорахунку
                  </div>
                  <div className="text-xs text-muted-foreground">
                    До {MAX_ATTACHMENTS} файлів, до 50 MB кожен
                  </div>
                </button>
              ) : (
                <div className="space-y-2">
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/10 p-3"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted/40 flex items-center justify-center">
                        {attachment.previewUrl ? (
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Paperclip className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{attachment.file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.file.size)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        disabled={creating}
                        aria-label={`Видалити ${attachment.file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>
                      Додано {pendingAttachments.length} / {MAX_ATTACHMENTS}
                    </span>
                    {pendingAttachments.length < MAX_ATTACHMENTS && (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => attachmentsInputRef.current?.click()}
                        disabled={creating}
                      >
                        Додати ще
                      </button>
                    )}
                  </div>
                </div>
              )}

              {attachmentsError && (
                <div className="text-xs text-destructive">{attachmentsError}</div>
              )}
            </div>

            {/* Row with Assigned To and Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Відповідальний
                </Label>
                <Select value={assignedTo} onValueChange={setAssignedTo} disabled={creating}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Не призначати" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Не призначати</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Валюта</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={creating}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UAH">UAH (₴)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {createError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <span>{createError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="p-6 border-t border-border bg-gradient-to-r from-muted/10 to-transparent">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Скасувати
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                creating ||
                !customerId ||
                !selectedTypeId ||
                !selectedKindId ||
                !selectedModelId ||
                !selectedPrintPositionId
              }
              className="gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Створення...
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4" />
                  Створити
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Видалити прорахунок?"
        description="Це видалить прорахунок і пов'язані дані. Дію не можна скасувати."
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onConfirm={handleDelete}
        loading={!!rowDeleteBusy}
      />
    </div>
  );
}
