import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TOOLBAR_ACTION_BUTTON,
  TOOLBAR_CONTROL,
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
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import {
  Archive,
  ArrowDown,
  ArrowUp,
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
  "is_archived",
  "created_at",
  "updated_at",
].join(",");

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

export default function SampleStockPage() {
  const { teamId, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<SampleStockItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_FILTER);
  const [locationFilter, setLocationFilter] = useState(ALL_LOCATIONS_FILTER);
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>("all");

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

    if (options?.silent) setRefreshing(true);
    else setLoading(true);

    setError(null);
    setSchemaMissing(false);

    try {
      const { data, error: queryError } = await supabase
        .schema("tosho")
        .from("sample_stock_items")
        .select(SAMPLE_STOCK_COLUMNS)
        .eq("team_id", teamId)
        .order("is_archived", { ascending: true })
        .order("name", { ascending: true, nullsFirst: false })
        .order("color", { ascending: true, nullsFirst: false });

      if (queryError) throw queryError;
      setRows((((data ?? []) as unknown) as SampleStockItemRow[]) ?? []);
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
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

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
    return rows.filter((row) => {
      if (categoryFilter !== ALL_CATEGORIES_FILTER && (row.category?.trim() ?? "") !== categoryFilter) return false;
      if (locationFilter !== ALL_LOCATIONS_FILTER && (row.location?.trim() ?? "") !== locationFilter) return false;
      if (statusFilter !== "all" && getStockStatus(row) !== statusFilter) return false;
      if (!query) return true;

      const haystack = [
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

      return haystack.includes(query);
    });
  }, [categoryFilter, locationFilter, rows, search, statusFilter]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    categoryFilter !== ALL_CATEGORIES_FILTER ||
    locationFilter !== ALL_LOCATIONS_FILTER ||
    statusFilter !== "all";

  const clearFilters = useCallback(() => {
    setSearch("");
    setCategoryFilter(ALL_CATEGORIES_FILTER);
    setLocationFilter(ALL_LOCATIONS_FILTER);
    setStatusFilter("all");
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

  const headerActions = useMemo(() => (
    <UnifiedPageToolbar
      topLeft={
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">Склад</div>
            <div className="text-sm text-muted-foreground">Залишки товарів, резерви та складські рухи.</div>
          </div>
        </div>
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
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StockStatusFilter)}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[170px]")}>
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as StockStatusFilter[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[190px]")}>
              <SelectValue placeholder="Категорія" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES_FILTER}>Всі категорії</SelectItem>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[180px]")}>
              <SelectValue placeholder="Місце" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LOCATIONS_FILTER}>Всі місця</SelectItem>
              {locationOptions.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
    categoryFilter,
    categoryOptions,
    clearFilters,
    filteredRows.length,
    hasActiveFilters,
    locationFilter,
    locationOptions,
    openCreate,
    refreshing,
    schemaMissing,
    search,
    statusFilter,
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
      is_archived: form.isArchived,
    };

    try {
      if (editingRow?.id) {
        const { error: updateError } = await supabase
          .schema("tosho")
          .from("sample_stock_items")
          .update(payload)
          .eq("id", editingRow.id)
          .eq("team_id", teamId);
        if (updateError) throw updateError;
        toast.success("Товар оновлено");
      } else {
        const { error: insertError } = await supabase
          .schema("tosho")
          .from("sample_stock_items")
          .insert(payload);
        if (insertError) throw insertError;
        toast.success("Товар додано");
      }

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

  if (authLoading || loading) {
    return <AppPageLoader title="Завантаження" subtitle="Готуємо склад." />;
  }

  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Не вдалося визначити команду для складу.</div>;
  }

  return (
    <div className="w-full space-y-5 pb-20 md:pb-0">
      <div className="overflow-hidden">
        {error ? (
          <div className="rounded-inner border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
        ) : schemaMissing ? (
          <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
            Таблиця складу ще не створена в Supabase. Потрібно застосувати{" "}
            <span className="font-medium text-foreground">scripts/sample-stock-schema.sql</span>, а стартові дані лежать у{" "}
            <span className="font-medium text-foreground">scripts/sample-stock-seed-from-numbers.sql</span>.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-inner border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
            {rows.length === 0 ? "Склад ще порожній. Додайте перший товар або застосуйте seed із таблиці." : "За цими фільтрами нічого не знайдено."}
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-inner border border-border bg-card p-4"
                  onClick={() => openEdit(row)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <ProductIdentity row={row} />
                    <div onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(row)}>Редагувати</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openMovement(row, "incoming")}>
                            <ArrowUp className="mr-2 h-4 w-4" />
                            Поповнити
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMovement(row, "outgoing")}>
                            <ArrowDown className="mr-2 h-4 w-4" />
                            Списати
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMovement(row, "reserve")}>
                            <Lock className="mr-2 h-4 w-4" />
                            Зарезервувати
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMovement(row, "release")}>
                            <Unlock className="mr-2 h-4 w-4" />
                            Зняти резерв
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(row)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Видалити
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

            <div className="hidden md:block">
              <Table variant="list" size="md">
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
                  {filteredRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="group cursor-pointer hover:bg-muted/10"
                      onClick={() => openEdit(row)}
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(row)}>Редагувати</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openMovement(row, "incoming")}>
                              <ArrowUp className="mr-2 h-4 w-4" />
                              Поповнити
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMovement(row, "outgoing")}>
                              <ArrowDown className="mr-2 h-4 w-4" />
                              Списати
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMovement(row, "reserve")}>
                              <Lock className="mr-2 h-4 w-4" />
                              Зарезервувати
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMovement(row, "release")}>
                              <Unlock className="mr-2 h-4 w-4" />
                              Зняти резерв
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMovement(row, "adjustment")}>
                              <Archive className="mr-2 h-4 w-4" />
                              Виставити залишок
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(row)}
                              className="text-destructive focus:text-destructive"
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
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[760px]">
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

          <div className="space-y-6 px-6 py-6">
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

            <SheetFooter className="border-t border-border/50 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Скасувати
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingRow ? "Зберегти зміни" : "Створити товар"}
              </Button>
            </SheetFooter>
          </div>
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
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[520px]">
          <div className="border-b bg-muted/20 px-6 py-4">
            <SheetHeader>
              <SheetTitle className="text-base font-medium">{MOVEMENT_LABELS[movement.type]}</SheetTitle>
              <SheetDescription>{movementTarget?.name ?? "Товар складу"}</SheetDescription>
            </SheetHeader>
          </div>

          <div className="space-y-5 px-6 py-6">
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

            <SheetFooter className="border-t border-border/50 pt-4">
              <Button variant="outline" onClick={() => setMovementTarget(null)} disabled={movementSaving}>
                Скасувати
              </Button>
              <Button onClick={handleMovement} disabled={movementSaving}>
                {movementSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Застосувати
              </Button>
            </SheetFooter>
          </div>
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
