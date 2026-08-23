import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { PageLoading } from "@/components/app/page-loading";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { usePageCache } from "@/hooks/usePageCache";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetBody,
  SheetTitle,
} from "@/components/ui/sheet";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_STOCK_KIND,
  STOCK_KINDS,
  STOCK_KIND_HINTS,
  STOCK_KIND_LABELS,
  normalizeStockKind,
  type StockKind,
} from "@/lib/sampleStockKind";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Boxes,
  Loader2,
  Lock,
  MoreHorizontal,
  Package,
  PlusCircle,
  Trash2,
  Unlock,
} from "lucide-react";

type SampleStockItemRow = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  visual_ref?: string | null;
  sku?: string | null;
  category?: string | null;
  color?: string | null;
  specifications?: string | null;
  quantity_on_hand?: number | null;
  reserved_quantity?: number | null;
  unit_price?: number | string | null;
  currency?: "UAH" | "USD" | "EUR" | string | null;
  location?: string | null;
  comments?: string | null;
  stock_kind?: string | null;
  is_archived?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SampleStockFormState = {
  name: string;
  visualRef: string;
  sku: string;
  category: string;
  color: string;
  specifications: string;
  quantityOnHand: string;
  reservedQuantity: string;
  unitPrice: string;
  location: string;
  comments: string;
  stockKind: StockKind;
  isArchived: boolean;
};

type StockStatusFilter = "all" | "in_stock" | "reserved" | "low_stock" | "out_of_stock" | "archived";
type StockMovementType = "incoming" | "outgoing" | "reserve" | "release" | "adjustment";

type StockMovementState = {
  type: StockMovementType;
  quantity: string;
  comment: string;
};

const ALL_CATEGORIES_FILTER = "__all__";
const ALL_LOCATIONS_FILTER = "__all__";
const LOW_STOCK_THRESHOLD = 10;

const SAMPLE_STOCK_COLUMNS = [
  "id",
  "team_id",
  "name",
  "visual_ref",
  "sku",
  "category",
  "color",
  "specifications",
  "quantity_on_hand",
  "reserved_quantity",
  "unit_price",
  "currency",
  "location",
  "comments",
  "stock_kind",
  "is_archived",
  "created_at",
  "updated_at",
].join(",");

/** Той самий перелік без stock_kind — запасний захід, поки міграцію не застосовано. */
const SAMPLE_STOCK_COLUMNS_LEGACY = SAMPLE_STOCK_COLUMNS.split(",")
  .filter((column) => column !== "stock_kind")
  .join(",");

const EMPTY_FORM: SampleStockFormState = {
  name: "",
  visualRef: "",
  sku: "",
  category: "",
  color: "",
  specifications: "",
  quantityOnHand: "0",
  reservedQuantity: "0",
  unitPrice: "0",
  location: "",
  comments: "",
  stockKind: DEFAULT_STOCK_KIND,
  isArchived: false,
};

const DEFAULT_MOVEMENT: StockMovementState = {
  type: "incoming",
  quantity: "1",
  comment: "",
};

const STATUS_LABELS: Record<StockStatusFilter, string> = {
  all: "Всі статуси",
  in_stock: "В наявності",
  reserved: "Є резерв",
  low_stock: "Мало",
  out_of_stock: "Немає",
  archived: "Архів",
};

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  incoming: "Поповнити",
  outgoing: "Списати",
  reserve: "Зарезервувати",
  release: "Зняти резерв",
  adjustment: "Виставити залишок",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function normalizeText(value?: string | null) {
  return value?.trim() ?? "";
}

function parseIntegerInput(value: string, fallback = 0) {
  const normalized = Number.parseInt(value.replace(/\s+/g, ""), 10);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0, normalized);
}

function parseMoneyInput(value: string) {
  const normalized = Number.parseFloat(value.replace(",", ".").replace(/\s+/g, ""));
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.round(normalized * 100) / 100);
}

function toNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getQuantity(row: SampleStockItemRow) {
  return Math.max(0, Number(row.quantity_on_hand ?? 0));
}

function getReservedQuantity(row: SampleStockItemRow) {
  return Math.max(0, Number(row.reserved_quantity ?? 0));
}

function getAvailableQuantity(row: SampleStockItemRow) {
  return Math.max(0, getQuantity(row) - getReservedQuantity(row));
}

function getTotalValue(row: SampleStockItemRow) {
  return getQuantity(row) * toNumber(row.unit_price);
}

function getStockStatus(row: SampleStockItemRow): Exclude<StockStatusFilter, "all"> {
  if (row.is_archived) return "archived";
  const quantity = getQuantity(row);
  const reserved = getReservedQuantity(row);
  const available = getAvailableQuantity(row);
  if (quantity <= 0) return "out_of_stock";
  if (reserved > 0) return "reserved";
  if (available <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

function getStatusBadge(row: SampleStockItemRow) {
  const status = getStockStatus(row);
  if (status === "archived") return <Badge tone="neutral" size="sm">Архів</Badge>;
  if (status === "out_of_stock") return <Badge tone="danger" size="sm">Немає</Badge>;
  if (status === "reserved") return <Badge tone="warning" size="sm">Резерв</Badge>;
  if (status === "low_stock") return <Badge tone="warning" size="sm">Мало</Badge>;
  return <Badge tone="success" size="sm">В наявності</Badge>;
}

/** Поля, по яких шукає рядок пошуку. Один рецепт на список і на лічильники вкладок. */
function buildStockHaystack(row: SampleStockItemRow) {
  return [
    row.name,
    row.visual_ref,
    row.sku,
    row.category,
    row.color,
    row.specifications,
    row.location,
    row.comments,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number, currency = "UAH") {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeFormFromRow(row?: SampleStockItemRow | null): SampleStockFormState {
  if (!row) return EMPTY_FORM;
  return {
    name: normalizeText(row.name),
    visualRef: normalizeText(row.visual_ref),
    sku: normalizeText(row.sku),
    category: normalizeText(row.category),
    color: normalizeText(row.color),
    specifications: normalizeText(row.specifications),
    quantityOnHand: String(getQuantity(row)),
    reservedQuantity: String(getReservedQuantity(row)),
    unitPrice: String(toNumber(row.unit_price)),
    location: normalizeText(row.location),
    comments: normalizeText(row.comments),
    stockKind: normalizeStockKind(row.stock_kind),
    isArchived: row.is_archived === true,
  };
}

function ProductIdentity({ row }: { row: SampleStockItemRow }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <div className="min-w-0 font-medium text-foreground">{row.name?.trim() || "Без назви"}</div>
        {getStatusBadge(row)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {row.sku?.trim() ? <span>Артикул: {row.sku}</span> : null}
        {row.category?.trim() ? <span>{row.category}</span> : null}
        {row.visual_ref?.trim() ? <span>Візуал: {row.visual_ref}</span> : null}
      </div>
      {row.specifications?.trim() || row.comments?.trim() ? (
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {[row.specifications?.trim(), row.comments?.trim()].filter(Boolean).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function QuantityCell({ row }: { row: SampleStockItemRow }) {
  const quantity = getQuantity(row);
  const reserved = getReservedQuantity(row);
  const available = getAvailableQuantity(row);
  return (
    <div className="space-y-1 tabular-nums">
      <div className="text-base font-semibold">{formatQuantity(quantity)}</div>
      <div className="text-xs text-muted-foreground">
        Доступно {formatQuantity(available)}
        {reserved > 0 ? ` · резерв ${formatQuantity(reserved)}` : ""}
      </div>
    </div>
  );
}

type StockRowHandlers = {
  onEdit: (row: SampleStockItemRow) => void;
  onMovement: (row: SampleStockItemRow, type: StockMovementType) => void;
  onDelete: (row: SampleStockItemRow) => void;
};

/**
 * Меню рядка — одне на обидві розкладки.
 *
 * Раніше мобільна й десктопна копії розійшлись: на телефоні бракувало
 * «Виставити залишок». Розкладка складу на підрозділи множила б це розходження
 * ще на два, тож меню тепер спільне.
 */
function StockRowActions({ row, handlers }: { row: SampleStockItemRow; handlers: StockRowHandlers }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlers.onEdit(row)}>Редагувати</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlers.onMovement(row, "incoming")}>
          <ArrowUp className="mr-2 h-4 w-4" />
          Поповнити
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onMovement(row, "outgoing")}>
          <ArrowDown className="mr-2 h-4 w-4" />
          Списати
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onMovement(row, "reserve")}>
          <Lock className="mr-2 h-4 w-4" />
          Зарезервувати
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onMovement(row, "release")}>
          <Unlock className="mr-2 h-4 w-4" />
          Зняти резерв
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlers.onMovement(row, "adjustment")}>
          <Archive className="mr-2 h-4 w-4" />
          Виставити залишок
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handlers.onDelete(row)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Видалити
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StockCardsMobile({ rows, handlers }: { rows: SampleStockItemRow[]; handlers: StockRowHandlers }) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-inner border border-border bg-card p-4"
          onClick={() => handlers.onEdit(row)}
        >
          <div className="flex items-start justify-between gap-3">
            <ProductIdentity row={row} />
            <div onClick={(event) => event.stopPropagation()}>
              <StockRowActions row={row} handlers={handlers} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-caps-tight text-muted-foreground">Залишок</div>
              <QuantityCell row={row} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-caps-tight text-muted-foreground">Ціна / сума</div>
              <div className="font-medium">{formatMoney(toNumber(row.unit_price))}</div>
              <div className="text-xs text-muted-foreground">{formatMoney(getTotalValue(row))}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-caps-tight text-muted-foreground">Колір</div>
              <div>{row.color?.trim() || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-caps-tight text-muted-foreground">Місце</div>
              <div>{row.location?.trim() || "—"}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StockTable({ rows, handlers }: { rows: SampleStockItemRow[]; handlers: StockRowHandlers }) {
  return (
    <div className="hidden md:block">
      {/* Колонки у відсотках, горизонтальний скрол не потрібен — умова для
          stickyHeader виконана. */}
      <Table variant="list" size="md" stickyHeader>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[34%] pl-6">Товар</TableHead>
            <TableHead className="w-[15%]">Колір</TableHead>
            <TableHead className="w-[16%]">Залишок</TableHead>
            <TableHead className="w-[12%]">Ціна</TableHead>
            <TableHead className="w-[12%]">Сума</TableHead>
            <TableHead className="w-[14%]">Місце</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="group cursor-pointer hover:bg-muted/10"
              onClick={() => handlers.onEdit(row)}
            >
              <TableCell className="pl-6 align-top">
                <ProductIdentity row={row} />
              </TableCell>
              <TableCell className="align-top">
                <div className="font-medium">{row.color?.trim() || "—"}</div>
                {row.category?.trim() ? <div className="text-xs text-muted-foreground">{row.category}</div> : null}
              </TableCell>
              <TableCell className="align-top">
                <QuantityCell row={row} />
              </TableCell>
              <TableCell className="align-top tabular-nums">{formatMoney(toNumber(row.unit_price))}</TableCell>
              <TableCell className="align-top tabular-nums font-medium">{formatMoney(getTotalValue(row))}</TableCell>
              <TableCell className="align-top">{row.location?.trim() || <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell
                className="pr-4 text-right align-top opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                <StockRowActions row={row} handlers={handlers} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SampleStockPage() {
  const { teamId, loading: authLoading } = useAuth();
  /**
   * Повторний вхід у розділ — миттєвий (REQ-19): дані беруться з кешу сторінки,
   * каркас не показується взагалі, а свіжі рядки доїжджають тихо.
   */
  const { cached, setCache, clearCache } = usePageCache<SampleStockItemRow[]>(teamId ? `sample-stock:${teamId}` : "sample-stock:none");
  const hasCacheRef = useRef(Boolean(cached));
  const [rows, setRows] = useState<SampleStockItemRow[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_FILTER);
  const [locationFilter, setLocationFilter] = useState(ALL_LOCATIONS_FILTER);
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>("all");
  /**
   * Активний підрозділ. Не фільтр, а вкладка: склад — це два різні склади, і
   * дивляться в один із них, а не в обидва одразу. Тому «Всіх підрозділів»
   * тут немає, і скидання фільтрів вкладку не чіпає.
   */
  const [activeKind, setActiveKind] = useState<StockKind>(STOCK_KINDS[0]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SampleStockItemRow | null>(null);
  const [form, setForm] = useState<SampleStockFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [movementTarget, setMovementTarget] = useState<SampleStockItemRow | null>(null);
  const [movement, setMovement] = useState<StockMovementState>(DEFAULT_MOVEMENT);
  const [movementError, setMovementError] = useState<string | null>(null);
  const [movementSaving, setMovementSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SampleStockItemRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadItems = useCallback(async (options?: { silent?: boolean }) => {
    if (!teamId) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Є що показати — оновлюємось тихо, без каркаса поверх наявних даних.
    const silent = options?.silent ?? hasCacheRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError(null);
    setSchemaMissing(false);

    const fetchItems = (columns: string) =>
      supabase
        .schema("tosho")
        .from("sample_stock_items")
        .select(columns)
        .eq("team_id", teamId)
        .order("is_archived", { ascending: true })
        .order("name", { ascending: true, nullsFirst: false })
        .order("color", { ascending: true, nullsFirst: false });

    try {
      let { data, error: queryError } = await fetchItems(SAMPLE_STOCK_COLUMNS);

      // Колонка stock_kind їде окремою міграцією (scripts/sample-stock-kind.sql),
      // і деплой може випередити її застосування. Без цього запасного заходу
      // невідома колонка вбивала б УСЮ сторінку складу, а не лише поділ на
      // підрозділи — тож на такій помилці перечитуємо без неї, і весь склад
      // просто показується як «Взірці», поки міграцію не застосують.
      if (queryError && /stock_kind/i.test(queryError.message ?? "")) {
        ({ data, error: queryError } = await fetchItems(SAMPLE_STOCK_COLUMNS_LEGACY));
      }

      if (queryError) throw queryError;
      const nextRows = (((data ?? []) as unknown) as SampleStockItemRow[]) ?? [];
      setRows(nextRows);
      setCache(nextRows);
      hasCacheRef.current = true;
    } catch (loadError) {
      const message = getErrorMessage(loadError, "Не вдалося завантажити склад.");
      const normalized = message.toLowerCase();
      if (
        normalized.includes("could not find the table") ||
        normalized.includes("schema cache") ||
        normalized.includes("does not exist")
      ) {
        setSchemaMissing(true);
        setRows([]);
        // Таблиці ще немає (міграція не доїхала) — старий кеш показувати не
        // можна: наступний вхід засіяв би сторінку даними, яких уже нема.
        clearCache();
        hasCacheRef.current = false;
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearCache, setCache, teamId]);

  useEffect(() => {
    if (authLoading) return;
    void loadItems();
  }, [authLoading, loadItems]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.category?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk")),
    [rows]
  );

  const locationOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.location?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk")),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    // Порядок рядків не чіпаємо — його вже задав запит (архівні вниз, далі за
    // назвою й кольором). Сортувати ще й за підрозділом тепер нема сенсу:
    // у списку завжди рівно один підрозділ, той, чия вкладка відкрита.
    return rows.filter((row) => {
      if (normalizeStockKind(row.stock_kind) !== activeKind) return false;
      if (categoryFilter !== ALL_CATEGORIES_FILTER && (row.category?.trim() ?? "") !== categoryFilter) return false;
      if (locationFilter !== ALL_LOCATIONS_FILTER && (row.location?.trim() ?? "") !== locationFilter) return false;
      if (statusFilter !== "all" && getStockStatus(row) !== statusFilter) return false;
      if (!query) return true;
      return buildStockHaystack(row).includes(query);
    });
  }, [activeKind, categoryFilter, locationFilter, rows, search, statusFilter]);

  /**
   * Скільки позицій у кожній вкладці — з урахуванням пошуку й решти фільтрів,
   * але НЕ самої вкладки. Інакше лічильник на неактивній вкладці показував би
   * повний склад і суперечив тому, що там насправді знайдеться.
   */
  const countByKind = useMemo(() => {
    const query = search.trim().toLowerCase();
    const counts: Record<StockKind, number> = { sample: 0, supply: 0 };
    for (const row of rows) {
      if (categoryFilter !== ALL_CATEGORIES_FILTER && (row.category?.trim() ?? "") !== categoryFilter) continue;
      if (locationFilter !== ALL_LOCATIONS_FILTER && (row.location?.trim() ?? "") !== locationFilter) continue;
      if (statusFilter !== "all" && getStockStatus(row) !== statusFilter) continue;
      if (query && !buildStockHaystack(row).includes(query)) continue;
      counts[normalizeStockKind(row.stock_kind)] += 1;
    }
    return counts;
  }, [categoryFilter, locationFilter, rows, search, statusFilter]);

  /** Усе, крім підрозділу: підрозділ — це «де шукаємо», решта — «що шукаємо». */
  const hasOtherFilters =
    Boolean(search.trim()) ||
    categoryFilter !== ALL_CATEGORIES_FILTER ||
    locationFilter !== ALL_LOCATIONS_FILTER ||
    statusFilter !== "all";

  // Вкладка сюди не входить: «скинути фільтри» не має перекидати людину
  // в інший склад.
  const hasActiveFilters = hasOtherFilters;

  const clearFilters = useCallback(() => {
    setSearch("");
    setCategoryFilter(ALL_CATEGORIES_FILTER);
    setLocationFilter(ALL_LOCATIONS_FILTER);
    setStatusFilter("all");
    // Вкладку не чіпаємо навмисно — див. hasActiveFilters вище.
  }, []);

  const openCreate = useCallback(() => {
    setEditingRow(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: SampleStockItemRow) => {
    setEditingRow(row);
    setForm(normalizeFormFromRow(row));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openMovement = useCallback((row: SampleStockItemRow, type: StockMovementType) => {
    setMovementTarget(row);
    setMovement({
      type,
      quantity: type === "adjustment" ? String(getQuantity(row)) : "1",
      comment: "",
    });
    setMovementError(null);
  }, []);

  /**
   * Порожній екран — той самий EmptyStateCard, що й на інших сторінках, а не
   * власний сірий прямокутник.
   *
   * Три різні причини порожнечі — три різні тексти: склад ще не заповнювали,
   * підрозділ обрано, але він порожній, або фільтри звузили все до нуля. Одне
   * «нічого не знайдено» на всі випадки не каже, що робити далі.
   */
  const emptyState = useMemo(() => {
    if (rows.length === 0) {
      return (
        <EmptyStateCard
          badgeLabel="Склад"
          title="Склад ще порожній"
          description="Додайте перший товар — або застосуйте seed із таблиці scripts/sample-stock-seed-from-numbers.sql."
          actionLabel="Новий товар"
          onAction={openCreate}
        />
      );
    }
    if (!hasOtherFilters) {
      return (
        <EmptyStateCard
          badgeLabel={STOCK_KIND_LABELS[activeKind]}
          title={`У підрозділі «${STOCK_KIND_LABELS[activeKind]}» поки нічого немає`}
          description={`${STOCK_KIND_HINTS[activeKind]}. Додайте позицію або перекладіть наявні в цей підрозділ у картці товару.`}
          actionLabel="Новий товар"
          onAction={openCreate}
        />
      );
    }
    return (
      <EmptyStateCard
        badgeLabel="Пошук"
        title="За цими фільтрами нічого не знайдено"
        description="Спробуйте прибрати частину умов або очистити фільтри."
        actionLabel="Скинути фільтри"
        onAction={clearFilters}
      />
    );
  }, [activeKind, clearFilters, hasOtherFilters, openCreate, rows.length]);

  const rowHandlers = useMemo<StockRowHandlers>(
    () => ({ onEdit: openEdit, onMovement: openMovement, onDelete: setDeleteTarget }),
    [openEdit, openMovement]
  );

  const headerActions = useMemo(() => (
    <UnifiedPageToolbar
      topLeft={
        /* Той самий сегментований перемикач, що «Замовники / Ліди», і на тому
           самому місці — замість заголовка сторінки. Назва «Склад» і так стоїть
           у шапці застосунку, тож дублювати її тут нема потреби. */
        <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
          {STOCK_KINDS.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="segmented"
              size="xs"
              aria-pressed={activeKind === kind}
              onClick={() => setActiveKind(kind)}
              className={cn(SEGMENTED_TRIGGER, "gap-2 px-5")}
            >
              {kind === "supply" ? <Boxes className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              {STOCK_KIND_LABELS[kind]}
              <CountBadge value={countByKind[kind]} className="ml-1.5" />
            </Button>
          ))}
        </SegmentedGroup>
      }
      topRight={
        <Button
          onClick={openCreate}
          disabled={schemaMissing}
          className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
        >
          <PlusCircle className="h-4 w-4" />
          Новий товар
        </Button>
      }
      search={
        <ToolbarSearch value={search} onChange={setSearch} placeholder="Пошук товару, артикулу, кольору..." />
      }
      filters={
        <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <ToolbarFilterSelect
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StockStatusFilter)}
            neutralValue="all"
            className="sm:w-[170px]"
            options={(Object.keys(STATUS_LABELS) as StockStatusFilter[]).map((status) => ({
              value: status,
              label: STATUS_LABELS[status],
            }))}
          />
          <ToolbarFilterSelect
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            neutralValue={ALL_CATEGORIES_FILTER}
            className="sm:w-[190px]"
            options={[
              { value: ALL_CATEGORIES_FILTER, label: "Всі категорії" },
              ...categoryOptions.map((category) => ({ value: category, label: category })),
            ]}
          />
          <ToolbarFilterSelect
            value={locationFilter}
            onValueChange={setLocationFilter}
            neutralValue={ALL_LOCATIONS_FILTER}
            className="sm:w-[180px]"
            options={[
              { value: ALL_LOCATIONS_FILTER, label: "Всі місця" },
              ...locationOptions.map((location) => ({ value: location, label: location })),
            ]}
          />
        </div>
      }
      meta={
        <ToolbarMeta
          count={filteredRows.length}
          onReset={clearFilters}
          showReset={hasActiveFilters}
          loading={refreshing}
        />
      }
      searchClassName="xl:max-w-[420px]"
    />
  ), [
    activeKind,
    categoryFilter,
    categoryOptions,
    clearFilters,
    countByKind,
    hasActiveFilters,
    locationFilter,
    locationOptions,
    openCreate,
    refreshing,
    schemaMissing,
    search,
    statusFilter,
    filteredRows.length,
  ]);

  usePageHeaderActions(headerActions, [headerActions]);

  const handleSave = useCallback(async () => {
    if (!teamId) {
      setFormError("Не вдалося визначити команду.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Вкажіть назву товару.");
      return;
    }

    const quantityOnHand = parseIntegerInput(form.quantityOnHand);
    const reservedQuantity = parseIntegerInput(form.reservedQuantity);
    if (reservedQuantity > quantityOnHand) {
      setFormError("Резерв не може бути більшим за залишок.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      team_id: teamId,
      name: form.name.trim(),
      visual_ref: form.visualRef.trim() || null,
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      color: form.color.trim() || null,
      specifications: form.specifications.trim() || null,
      quantity_on_hand: quantityOnHand,
      reserved_quantity: reservedQuantity,
      unit_price: parseMoneyInput(form.unitPrice),
      currency: "UAH",
      location: form.location.trim() || null,
      comments: form.comments.trim() || null,
      stock_kind: form.stockKind,
      is_archived: form.isArchived,
    };

    // Та сама причина, що й у loadItems: поки міграцію не застосовано, поле
    // stock_kind не має куди лягти, і без цього запасного заходу зламалось би
    // збереження БУДЬ-ЯКОГО товару, а не лише вибір підрозділу.
    const { stock_kind: _omitted, ...payloadWithoutKind } = payload;
    const savePayload = async (body: typeof payload | typeof payloadWithoutKind) =>
      editingRow?.id
        ? supabase
            .schema("tosho")
            .from("sample_stock_items")
            .update(body)
            .eq("id", editingRow.id)
            .eq("team_id", teamId)
        : supabase.schema("tosho").from("sample_stock_items").insert(body);

    try {
      let { error: saveError } = await savePayload(payload);
      if (saveError && /stock_kind/i.test(saveError.message ?? "")) {
        ({ error: saveError } = await savePayload(payloadWithoutKind));
      }
      if (saveError) throw saveError;
      toast.success(editingRow?.id ? "Товар оновлено" : "Товар додано");

      setDialogOpen(false);
      setEditingRow(null);
      setForm(EMPTY_FORM);
      await loadItems({ silent: true });
    } catch (saveError) {
      setFormError(getErrorMessage(saveError, "Не вдалося зберегти товар."));
    } finally {
      setSaving(false);
    }
  }, [editingRow?.id, form, loadItems, teamId]);

  const handleMovement = useCallback(async () => {
    if (!teamId || !movementTarget?.id) return;
    const quantity = parseIntegerInput(movement.quantity);
    if (quantity <= 0) {
      setMovementError("Вкажіть кількість більше нуля.");
      return;
    }

    setMovementSaving(true);
    setMovementError(null);

    try {
      const { error: movementErrorResponse } = await supabase
        .schema("tosho")
        .rpc("adjust_sample_stock_item", {
          p_item_id: movementTarget.id,
          p_team_id: teamId,
          p_movement_type: movement.type,
          p_quantity: quantity,
          p_comment: movement.comment.trim() || undefined,
        });

      if (movementErrorResponse) throw movementErrorResponse;
      toast.success(`${MOVEMENT_LABELS[movement.type]}: ${movementTarget.name ?? "товар"}`);
      setMovementTarget(null);
      setMovement(DEFAULT_MOVEMENT);
      await loadItems({ silent: true });
    } catch (error) {
      setMovementError(getErrorMessage(error, "Не вдалося виконати складську дію."));
    } finally {
      setMovementSaving(false);
    }
  }, [loadItems, movement, movementTarget, teamId]);

  const handleDelete = useCallback(async () => {
    if (!teamId || !deleteTarget?.id) return;

    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .schema("tosho")
        .from("sample_stock_items")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("team_id", teamId);
      if (deleteError) throw deleteError;
      toast.success("Товар видалено");
      setDeleteTarget(null);
      await loadItems({ silent: true });
    } catch (deleteError) {
      toast.error("Не вдалося видалити товар", {
        description: getErrorMessage(deleteError, "Спробуйте ще раз."),
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, loadItems, teamId]);

  if (loading) {
    return <PageLoading />;
  }

  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Не вдалося визначити команду для складу.</div>;
  }

  return (
    <div className="w-full space-y-5 pb-20 md:pb-0">
      {/* clip, а не hidden — інакше цей div стає контейнером скролу й гасить
          липку шапку таблиці всередині (див. AppLayout і проп stickyHeader). */}
      <div className="overflow-x-clip">
        {error ? (
          <div className="rounded-inner border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
        ) : schemaMissing ? (
          <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
            Таблиця складу ще не створена в Supabase. Потрібно застосувати{" "}
            <span className="font-medium text-foreground">scripts/sample-stock-schema.sql</span>, а стартові дані лежать у{" "}
            <span className="font-medium text-foreground">scripts/sample-stock-seed-from-numbers.sql</span>.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10">{emptyState}</div>
        ) : (
          <>
            <StockCardsMobile rows={filteredRows} handlers={rowHandlers} />
            <StockTable rows={filteredRows} handlers={rowHandlers} />
          </>
        )}
      </div>

      <Sheet
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingRow(null);
            setForm(EMPTY_FORM);
            setFormError(null);
          }
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-[760px]">
          <div className="shrink-0 border-b bg-muted/20 px-6 py-4">
            <SheetHeader>
              <SheetTitle className="text-base font-medium">
                {editingRow ? "Редагувати товар" : "Новий товар на склад"}
              </SheetTitle>
              <SheetDescription>
                Товар зберігається в складі і доступний команді.
              </SheetDescription>
            </SheetHeader>
          </div>

          <SheetBody className="space-y-6 px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Назва</label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Наприклад, Термос Smart"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Артикул</label>
                <Input
                  value={form.sku}
                  onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                  placeholder="SKU або код"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Візуал / бренд</label>
                <Input
                  value={form.visualRef}
                  onChange={(event) => setForm((current) => ({ ...current, visualRef: event.target.value }))}
                  placeholder="Наприклад, Wookie"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Підрозділ складу</label>
                <Select
                  value={form.stockKind}
                  onValueChange={(value) => setForm((current) => ({ ...current, stockKind: value as StockKind }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {STOCK_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{STOCK_KIND_HINTS[form.stockKind]}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Категорія</label>
                <Input
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="Пакування, посуд, аксесуари..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Колір</label>
                <Input
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  placeholder="Колір / варіант"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Характеристики / розміри</label>
                <Input
                  value={form.specifications}
                  onChange={(event) => setForm((current) => ({ ...current, specifications: event.target.value }))}
                  placeholder="500 мл, 33 х 24 х 10,5 см..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Залишок, шт.</label>
                <Input
                  inputMode="numeric"
                  value={form.quantityOnHand}
                  onChange={(event) => setForm((current) => ({ ...current, quantityOnHand: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Резерв, шт.</label>
                <Input
                  inputMode="numeric"
                  value={form.reservedQuantity}
                  onChange={(event) => setForm((current) => ({ ...current, reservedQuantity: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Ціна, грн.</label>
                <Input
                  inputMode="decimal"
                  value={form.unitPrice}
                  onChange={(event) => setForm((current) => ({ ...current, unitPrice: event.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Місце зберігання</label>
                <Input
                  value={form.location}
                  onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Склад, полиця, коробка..."
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Коментарі</label>
                <Textarea
                  value={form.comments}
                  onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))}
                  placeholder="Бронювання, стан, додаткові умови"
                  rows={4}
                />
              </div>

              <label className="flex items-center gap-3 rounded-inner border border-border bg-muted/25 px-3 py-3 text-sm sm:col-span-2">
                <Checkbox
                  checked={form.isArchived}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isArchived: checked === true }))}
                />
                <span>
                  <span className="font-medium text-foreground">Архівувати товар</span>
                  <span className="block text-xs text-muted-foreground">Залишиться в історії, але не буде рахуватись як активна позиція.</span>
                </span>
              </label>
            </div>

            {formError ? <div className="text-sm text-destructive">{formError}</div> : null}
          </SheetBody>

          <SheetFooter className="border-t border-border/50 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Скасувати
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingRow ? "Зберегти зміни" : "Створити товар"}
              </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(movementTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setMovementTarget(null);
            setMovement(DEFAULT_MOVEMENT);
            setMovementError(null);
          }
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-[520px]">
          <div className="border-b bg-muted/20 px-6 py-4">
            <SheetHeader>
              <SheetTitle className="text-base font-medium">{MOVEMENT_LABELS[movement.type]}</SheetTitle>
              <SheetDescription>{movementTarget?.name ?? "Товар складу"}</SheetDescription>
            </SheetHeader>
          </div>

          <SheetBody className="space-y-5 px-6 py-6">
            {movementTarget ? (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-inner border border-border bg-card/70 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Залишок</div>
                  <div className="font-semibold tabular-nums">{formatQuantity(getQuantity(movementTarget))}</div>
                </div>
                <div className="rounded-inner border border-border bg-card/70 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Резерв</div>
                  <div className="font-semibold tabular-nums">{formatQuantity(getReservedQuantity(movementTarget))}</div>
                </div>
                <div className="rounded-inner border border-border bg-card/70 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Доступно</div>
                  <div className="font-semibold tabular-nums">{formatQuantity(getAvailableQuantity(movementTarget))}</div>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Дія</label>
              <Select value={movement.type} onValueChange={(value) => setMovement((current) => ({ ...current, type: value as StockMovementType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MOVEMENT_LABELS) as StockMovementType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {MOVEMENT_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {movement.type === "adjustment" ? "Новий залишок, шт." : "Кількість, шт."}
              </label>
              <Input
                inputMode="numeric"
                value={movement.quantity}
                onChange={(event) => setMovement((current) => ({ ...current, quantity: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Коментар</label>
              <Textarea
                value={movement.comment}
                onChange={(event) => setMovement((current) => ({ ...current, comment: event.target.value }))}
                placeholder="Причина руху, клієнт, відповідальний"
                rows={3}
              />
            </div>

            {movementError ? <div className="text-sm text-destructive">{movementError}</div> : null}
          </SheetBody>

          <SheetFooter className="border-t border-border/50 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setMovementTarget(null)} disabled={movementSaving}>
                Скасувати
              </Button>
              <Button onClick={handleMovement} disabled={movementSaving}>
                {movementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Застосувати
              </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Видалити товар?"
        description={deleteTarget?.name ? `Позиція «${deleteTarget.name}» буде видалена зі складу.` : undefined}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        onConfirm={handleDelete}
        loading={deleteLoading}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      />
    </div>
  );
}
