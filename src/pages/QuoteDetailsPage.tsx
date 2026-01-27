import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import {
  getQuoteSummary,
  listTeamMembers,
  listStatusHistory,
  setStatus,
  type TeamMemberRow,
  type QuoteStatusRow,
  type QuoteSummaryRow,
} from "@/lib/toshoApi";
import {
  ArrowLeft,
  Copy,
  FileDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Paperclip,
  MessageSquare,
  Check,
  Clock,
  Send,
  XCircle,
  PlayCircle,
  CheckCircle2,
  Building2,
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

const STATUS_OPTIONS = ["draft", "sent", "approved", "rejected", "in_progress", "completed"];

const statusLabels: Record<string, string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  approved: "Погоджено",
  rejected: "Відхилено",
  in_progress: "В роботі",
  completed: "Завершено",
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

const statusIcons: Record<string, any> = {
  draft: Clock,
  sent: Send,
  approved: Check,
  rejected: XCircle,
  in_progress: PlayCircle,
  completed: CheckCircle2,
};

const QUOTE_TYPE_LABELS: Record<string, string> = {
  merch: "Мерч",
  print: "Поліграфія",
  other: "Інше",
};

function formatStatusLabel(value: string | null | undefined) {
  return (value && statusLabels[value]) || value || "—";
}

function formatQuoteType(value: string | null | undefined) {
  return (value && QUOTE_TYPE_LABELS[value]) || value || "—";
}

function formatCurrency(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "—";
  const label = currency ?? "UAH";
  return `${value.toLocaleString("uk-UA")} ${label}`;
}

function shortenId(value: string | null | undefined) {
  if (!value) return "Не призначено";
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
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

  const [quote, setQuote] = useState<QuoteSummaryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusValue, setStatusValue] = useState("draft");
  const [statusNote, setStatusNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [history, setHistory] = useState<QuoteStatusRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [items, setItems] = useState<QuoteItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [comments, setComments] = useState<QuoteComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

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

  // Inline editing for quantity
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState("");

  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");

  const updatedMinutes = minutesAgo(quote?.updated_at ?? null);

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.qty * item.price, 0);
  }, [items]);

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

  const formatDeadlineLabel = (value?: string | null) => {
    if (!value) return "Без дедлайну";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Без дедлайну";
    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const getDeadlineBadge = (value?: string | null) => {
    if (!value) {
      return { label: "Без дедлайну", className: "border-border/60 text-muted-foreground bg-muted/20" };
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
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

  const totals = useMemo(() => {
    const subtotal = itemsSubtotal;
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
  }, [itemsSubtotal, discount, tax]);

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
    try {
      const summary = await getQuoteSummary(quoteId);
      if (summary.team_id && summary.team_id !== teamId) {
        throw new Error("Немає доступу до цього прорахунку.");
      }
      setQuote(summary);
      setStatusValue(summary.status ?? "draft");
      setDeadlineDate(toDateInputValue(summary.deadline_at ?? null));
      setDeadlineNote(summary.deadline_note ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Не вдалося завантажити прорахунок.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const { data, error } = await supabase
        .schema("tosho")
        .from("quote_items")
        .select("id, position, name, description, qty, unit, unit_price, methods, attachment, catalog_type_id, catalog_kind_id, catalog_model_id, print_position_id, print_width_mm, print_height_mm")
        .eq("quote_id", quoteId)
        .order("position", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      setItems(
        rows.map((row) => {
          const rawMethods = Array.isArray(row.methods) ? row.methods : [];
          const parsedMethods: ItemMethod[] = rawMethods
            .map((method: any) => ({
              id: createLocalId(),
              methodId: method?.method_id ?? method?.methodId ?? method?.id ?? "",
              count: Number(method?.count ?? 1),
            }))
            .filter((method) => method.methodId);
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

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await listStatusHistory(quoteId);
      setHistory(data);
    } catch (e: any) {
      setHistoryError(e?.message ?? "Не вдалося завантажити історію.");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadAttachments = async () => {
    setAttachmentsLoading(true);
    setAttachmentsError(null);
    try {
      const { data, error } = await supabase
        .schema("tosho")
        .from("quote_attachments")
        .select("id,file_name,file_size,created_at,storage_bucket,storage_path,uploaded_by")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
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
    void loadHistory();
    void loadItems();
    void loadAttachments();
  }, [quoteId, teamId, memberById]);

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
    } catch (e: any) {
      setDeadlineError(e?.message ?? "Не вдалося оновити дедлайн.");
    } finally {
      setDeadlineSaving(false);
    }
  };

  // Quick status change
  const handleQuickStatusChange = async (newStatus: string) => {
    setStatusValue(newStatus);
    setStatusBusy(true);
    setStatusError(null);
    try {
      const note = statusNote.trim();
      await setStatus({
        quoteId,
        status: newStatus,
        note: note ? note : undefined,
      });
      await loadQuote();
      await loadHistory();
      setStatusNote("");
    } catch (e: any) {
      setStatusError(e?.message ?? "Помилка зміни статусу");
    } finally {
      setStatusBusy(false);
    }
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
    if (!commentText.trim()) return;
    
    const newComment: QuoteComment = {
      id: createLocalId(),
      body: commentText.trim(),
      created_at: new Date().toISOString(),
    };
    
    setComments(prev => [newComment, ...prev]);
    setCommentText("");
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
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/orders/estimates")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">
                Прорахунок #{quote.number ?? quote.id}
              </h1>
              <Badge className={cn("border", statusClasses[quote.status ?? "draft"])}>
                {formatStatusLabel(quote.status)}
              </Badge>
              {(() => {
                const badge = getDeadlineBadge(quote.deadline_at ?? null);
                const titleParts = [
                  quote.deadline_at
                    ? `Дата: ${new Date(quote.deadline_at).toLocaleDateString("uk-UA")}`
                    : "Дедлайн не задано",
                  quote.deadline_note ? `Коментар: ${quote.deadline_note}` : null,
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
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {formatQuoteType(quote.quote_type)}
              {quote.print_type ? ` · ${quote.print_type}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Status Change Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" disabled={statusBusy}>
                {createElement(statusIcons[quote.status ?? "draft"], { className: "h-4 w-4" })}
                Змінити статус
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="p-2">
                <p className="text-xs text-muted-foreground mb-3 font-medium">Оберіть новий статус</p>
                {STATUS_OPTIONS.map((s) => {
                  const Icon = statusIcons[s];
                  const isActive = s === quote.status;
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => !isActive && handleQuickStatusChange(s)}
                      className={cn(
                        "gap-2 cursor-pointer",
                        isActive && "bg-primary/10 text-primary cursor-default"
                      )}
                      disabled={isActive}
                    >
                      <Icon className="h-4 w-4" />
                      {formatStatusLabel(s)}
                      {isActive && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                  );
                })}
              </div>
              <DropdownMenuSeparator />
              <div className="p-2">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Примітка (опціонально)</Label>
                <Input
                  placeholder="Додати примітку..."
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  className="h-8 text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

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
              <DropdownMenuItem disabled className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Видалити
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {statusError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          {statusError}
        </div>
      )}

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
                  <div className="font-semibold text-base">{quote.customer_name ?? "—"}</div>
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
                    }) : "—"}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Менеджер
                  </div>
                  <div className="font-medium">{shortenId(quote.assigned_to ?? null)}</div>
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
                    <MessageSquare className="h-3.5 w-3.5" />
                    Коментар
                  </div>
                  <div className="font-medium text-sm line-clamp-2">{quote.comment ?? "—"}</div>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Дедлайн (готовність до відвантаження)
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[220px_1fr_auto]">
                    <Input
                      type="date"
                      className="h-9"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                    />
                    <Input
                      className="h-9"
                      placeholder="Коментар до дедлайну (опціонально)"
                      value={deadlineNote}
                      onChange={(e) => setDeadlineNote(e.target.value)}
                      maxLength={200}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveDeadline}
                      disabled={deadlineSaving}
                    >
                      {deadlineSaving ? "Збереження..." : "Зберегти"}
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
              
              <div className="flex flex-col items-end justify-center px-6 py-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="text-xs text-muted-foreground mb-1">Загальна сума</div>
                <div className="text-3xl font-bold text-primary tabular-nums">
                  {formatCurrency(totals.total, quote.currency)}
                </div>
                {items.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {items.length} {items.length === 1 ? "позиція" : "позицій"}
                  </div>
                )}
              </div>
            </div>
            
            {updatedMinutes !== null && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/40">
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <Clock className="h-3 w-3" />
                  Оновлено {updatedMinutes} хв тому
                </Badge>
              </div>
            )}
          </Card>

          {/* Items Card */}
          <Card className="p-6 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-semibold flex items-center gap-2">
                <Package className="h-5 w-5" />
                Позиції
              </div>
              <Button variant="outline" size="sm" onClick={openNewItem} className="gap-2">
                <Plus className="h-4 w-4" />
                Додати позицію
              </Button>
            </div>

            {itemsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Завантаження...</p>
              </div>
            ) : itemsError ? (
              <div className="text-sm text-destructive py-4">{itemsError}</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/70 p-8 text-center">
                <Package className="h-12 w-12 text-muted-foreground/30" />
                <div>
                  <p className="font-medium mb-1">Немає позицій</p>
                  <p className="text-sm text-muted-foreground">Додайте першу позицію для розрахунку</p>
                </div>
                <Button size="sm" onClick={openNewItem} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Додати позицію
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="font-semibold">Назва</TableHead>
                      <TableHead className="w-24 font-semibold">К-сть</TableHead>
                      <TableHead className="w-20 font-semibold">Од.</TableHead>
                      <TableHead className="w-32 text-right font-semibold">Ціна</TableHead>
                      <TableHead className="w-32 text-right font-semibold">Сума</TableHead>
                      <TableHead className="w-24 text-right font-semibold">Дії</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
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

                      return (
                        <TableRow key={item.id} className="group">
                          <TableCell>
                            <div className="font-medium">{item.title}</div>
                            {metaLine && (
                              <div className="text-xs text-muted-foreground mt-0.5">{metaLine}</div>
                            )}
                            {(positionLabel || sizeLabel) && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {positionLabel ? `Місце: ${positionLabel}` : "Місце: —"}
                                {sizeLabel ? ` · ${sizeLabel}` : ""}
                              </div>
                            )}
                            {item.methods && item.methods.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.methods.map((method) => (
                                  <Badge key={method.id} variant="outline" className="text-xs">
                                    {getMethodLabel(
                                      catalogTypes,
                                      item.catalogTypeId,
                                      item.catalogKindId,
                                      method.methodId
                                    ) ?? "—"}
                                    {method.count > 1 && ` ×${method.count}`}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {item.attachment && (
                              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                                <Paperclip className="h-3.5 w-3.5" />
                                <a
                                  href={item.attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-dotted"
                                >
                                  {item.attachment.name}
                                </a>
                              </div>
                            )}
                            {item.description && (
                              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {item.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingQty === item.id ? (
                              <Input
                                type="number"
                                value={qtyValue}
                                onChange={(e) => setQtyValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveQtyEdit(item.id);
                                  if (e.key === "Escape") setEditingQty(null);
                                }}
                                onBlur={() => saveQtyEdit(item.id)}
                                className="h-8 w-20"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => startQtyEdit(item.id, item.qty)}
                                className="hover:text-primary transition-colors font-semibold w-full text-left"
                              >
                                {item.qty}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {item.price.toLocaleString("uk-UA")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold tabular-nums">
                            {(item.qty * item.price).toLocaleString("uk-UA")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => openEditItem(item)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8 hover:text-destructive"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Напишіть коментар..."
                className="min-h-[80px] resize-none"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  {commentText.length} символів
                </span>
                <Button 
                  size="sm" 
                  onClick={handleAddComment} 
                  disabled={!commentText.trim()}
                  className="gap-2"
                >
                  <Send className="h-3 w-3" />
                  Додати
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
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold shrink-0">
                        👤
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-medium">Користувач</div>
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
                    <p className="text-sm leading-relaxed pl-11">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Attachments Card - Improved */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Paperclip className="h-5 w-5" />
                Файли від замовника
                {attachments.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{attachments.length}</Badge>
                )}
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={() => attachmentsInputRef.current?.click()}
                disabled={attachmentsUploading}
                aria-label="Завантажити файли"
              >
                <Upload className="h-4 w-4" />
              </Button>
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
            
            {attachmentsLoading ? (
              <div className="text-center py-6">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Завантаження...</p>
              </div>
            ) : attachmentsError ? (
              <div className="text-sm text-destructive">{attachmentsError}</div>
            ) : attachments.length === 0 ? (
              <div 
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                  attachmentsDragActive
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 hover:border-primary/40 hover:bg-primary/5"
                )}
                onClick={() => attachmentsInputRef.current?.click()}
                onDrop={handleAttachmentsDrop}
                onDragOver={handleAttachmentsDragOver}
                onDragLeave={handleAttachmentsDragLeave}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
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
                  return (
                    <div 
                      key={file.id} 
                      className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:bg-muted/20 transition-colors group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Paperclip className="h-5 w-5 text-primary" />
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
                            {file.size} · {new Date(file.created_at).toLocaleDateString("uk-UA")}
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

          {/* History Card - Timeline */}
          <Card className="p-5 bg-card/70 border-border/60 shadow-sm">
            <div className="text-lg font-semibold mb-4">Історія змін</div>
            
            {historyLoading ? (
              <div className="text-center py-6">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Завантаження...</p>
              </div>
            ) : historyError ? (
              <div className="text-sm text-destructive">{historyError}</div>
            ) : history.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Історія порожня</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border/40" />
                
                <div className="space-y-6">
                  {history.map((item) => {
                    const Icon = statusIcons[item.to_status ?? "draft"] || Clock;
                    
                    return (
                      <div key={item.id} className="relative pl-12">
                        {/* Timeline dot */}
                        <div className="absolute left-0 flex items-center justify-center">
                          <div className={cn(
                            "h-8 w-8 rounded-full border-2 bg-background flex items-center justify-center",
                            statusClasses[item.to_status ?? "draft"]
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>
                        
                        {/* Content */}
                        <div className="rounded-lg border border-border/60 p-3 bg-card hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between mb-1">
                            <div className="font-medium text-sm">
                              {formatStatusLabel(item.from_status)} → {formatStatusLabel(item.to_status)}
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                              {item.created_at && new Date(item.created_at).toLocaleString("uk-UA", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </div>
                          </div>
                          {item.note && (
                            <p className="text-xs text-muted-foreground mt-1">{item.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
