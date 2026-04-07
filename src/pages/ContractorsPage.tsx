import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { Button } from "@/components/ui/button";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
  TOOLBAR_CONTROL,
} from "@/components/ui/controlStyles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import {
  Building2,
  FilterX,
  Loader2,
  MoreHorizontal,
  PlusCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";

type ContractorRow = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  services?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  address?: string | null;
  delivery_info?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ContractorFormState = {
  name: string;
  services: string;
  contactName: string;
  phone: string;
  address: string;
  deliveryInfo: string;
  reminderDate: string;
  reminderTime: string;
  reminderComment: string;
  notes: string;
};

const ALL_SERVICES_FILTER = "__all__";
const CONTRACTOR_COLUMNS = [
  "id",
  "team_id",
  "name",
  "services",
  "contact_name",
  "phone",
  "address",
  "delivery_info",
  "reminder_at",
  "reminder_comment",
  "notes",
  "created_at",
  "updated_at",
].join(",");

const EMPTY_FORM: ContractorFormState = {
  name: "",
  services: "",
  contactName: "",
  phone: "",
  address: "",
  deliveryInfo: "",
  reminderDate: "",
  reminderTime: "",
  reminderComment: "",
  notes: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function normalizeScientificNumber(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) return normalized;

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;

  const digits = Math.round(numeric).toString();
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

function normalizeMultilineValue(value?: string | null) {
  if (!value) return "";

  return value
    .split(/\r?\n/)
    .map((part) => normalizeScientificNumber(part).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeFormFromRow(row?: ContractorRow | null): ContractorFormState {
  const contact = normalizeMultilineValue(row?.contact_name);
  const phone = normalizeMultilineValue(row?.phone);

  if (/\d/.test(contact) && !/\d/.test(phone)) {
    return {
      name: row?.name?.trim() ?? "",
      services: row?.services?.trim() ?? "",
      contactName: phone,
      phone: contact,
      address: normalizeMultilineValue(row?.address),
      deliveryInfo: normalizeMultilineValue(row?.delivery_info),
      reminderDate: row?.reminder_at ? row.reminder_at.slice(0, 10) : "",
      reminderTime: row?.reminder_at ? row.reminder_at.slice(11, 16) : "",
      reminderComment: normalizeMultilineValue(row?.reminder_comment),
      notes: normalizeMultilineValue(row?.notes),
    };
  }

  return {
    name: row?.name?.trim() ?? "",
    services: row?.services?.trim() ?? "",
    contactName: contact,
    phone,
    address: normalizeMultilineValue(row?.address),
    deliveryInfo: normalizeMultilineValue(row?.delivery_info),
    reminderDate: row?.reminder_at ? row.reminder_at.slice(0, 10) : "",
    reminderTime: row?.reminder_at ? row.reminder_at.slice(11, 16) : "",
    reminderComment: normalizeMultilineValue(row?.reminder_comment),
    notes: normalizeMultilineValue(row?.notes),
  };
}

function splitIntoLines(value?: string | null) {
  return normalizeMultilineValue(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getLineHref(line: string) {
  const trimmed = line.trim();
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(trimmed)) return `mailto:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function renderLinkedLines(value?: string | null, emptyLabel = "—") {
  const lines = splitIntoLines(value);
  if (lines.length === 0) return <span className="text-muted-foreground">{emptyLabel}</span>;

  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        const href = getLineHref(line);
        return href ? (
          <a
            key={`${line}-${index}`}
            href={href}
            target={href.startsWith("mailto:") ? undefined : "_blank"}
            rel={href.startsWith("mailto:") ? undefined : "noreferrer"}
            className="block whitespace-pre-wrap break-words text-primary underline underline-offset-2"
          >
            {line}
          </a>
        ) : (
          <div key={`${line}-${index}`} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        );
      })}
    </div>
  );
}

export default function ContractorsPage() {
  const { teamId, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<ContractorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<"contractors" | "suppliers">("contractors");
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState(ALL_SERVICES_FILTER);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ContractorRow | null>(null);
  const [form, setForm] = useState<ContractorFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ContractorRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadContractors = useCallback(async (options?: { silent?: boolean }) => {
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
        .from("contractors")
        .select(CONTRACTOR_COLUMNS)
        .eq("team_id", teamId)
        .order("name", { ascending: true, nullsFirst: false });

      if (queryError) throw queryError;
      setRows((((data ?? []) as unknown) as ContractorRow[]) ?? []);
    } catch (loadError) {
      const message = getErrorMessage(loadError, "Не вдалося завантажити підрядників.");
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
    void loadContractors();
  }, [authLoading, loadContractors]);

  const serviceOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.services?.trim() ?? "")
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, "uk"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesService = serviceFilter === ALL_SERVICES_FILTER || (row.services?.trim() ?? "") === serviceFilter;
      if (!matchesService) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        row.name,
        row.services,
        row.contact_name,
        row.phone,
        row.address,
        row.delivery_info,
        row.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [rows, search, serviceFilter]);

  const hasActiveFilters = Boolean(search.trim()) || serviceFilter !== ALL_SERVICES_FILTER;
  const activeTabCount = filteredRows.length;

  const openCreate = useCallback(() => {
    setEditingRow(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: ContractorRow) => {
    setEditingRow(row);
    setForm(normalizeFormFromRow(row));
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setServiceFilter(ALL_SERVICES_FILTER);
  }, []);

  const headerActions = useMemo(() => (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "contractors"}
            onClick={() => setActiveTab("contractors")}
            className={cn(SEGMENTED_TRIGGER, "gap-2")}
          >
            <Building2 className="h-4 w-4" />
            Підрядники
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{rows.length}</span>
          </Button>
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "suppliers"}
            onClick={() => setActiveTab("suppliers")}
            className={cn(SEGMENTED_TRIGGER, "gap-2")}
          >
            <Building2 className="h-4 w-4" />
            Постачальники
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{rows.length}</span>
          </Button>
        </div>
        <Button
          onClick={openCreate}
          disabled={schemaMissing}
          className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
        >
          <PlusCircle className="h-4 w-4" />
          {activeTab === "contractors" ? "Новий підрядник" : "Новий постачальник"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={activeTab === "contractors" ? "Пошук підрядника..." : "Пошук постачальника..."}
            className={cn(TOOLBAR_CONTROL, "pl-9 pr-9")}
          />
          {search ? (
            <Button
              type="button"
              variant="control"
              size="iconSm"
              aria-label="Очистити пошук"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[220px]")}>
            <SelectValue placeholder="Всі послуги" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SERVICES_FILTER}>Всі послуги</SelectItem>
            {serviceOptions.map((service) => (
              <SelectItem key={service} value={service}>
                {service}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 text-sm font-semibold text-foreground sm:ml-auto">
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearFilters}
              className="h-8 w-8 shrink-0 text-muted-foreground"
              title="Скинути фільтри"
              aria-label="Скинути фільтри"
            >
              <FilterX className="h-4 w-4" />
            </Button>
          ) : null}
          <span className="tabular-nums">{activeTabCount}</span>
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
      </div>
    </div>
  ), [activeTab, activeTabCount, clearFilters, hasActiveFilters, openCreate, refreshing, rows.length, schemaMissing, search, serviceFilter, serviceOptions]);

  usePageHeaderActions(headerActions, [headerActions]);

  const handleSave = useCallback(async () => {
    if (!teamId) {
      setFormError("Не вдалося визначити команду.");
      return;
    }

    if (!form.name.trim()) {
      setFormError("Вкажіть назву підрядника.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      team_id: teamId,
      name: form.name.trim(),
      services: form.services.trim() || null,
      contact_name: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      delivery_info: form.deliveryInfo.trim() || null,
      reminder_at:
        form.reminderDate && form.reminderTime
          ? `${form.reminderDate}T${form.reminderTime}:00`
          : null,
      reminder_comment: form.reminderComment.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingRow?.id) {
        const { error: updateError } = await supabase
          .schema("tosho")
          .from("contractors")
          .update(payload)
          .eq("id", editingRow.id)
          .eq("team_id", teamId);

        if (updateError) throw updateError;
        toast.success("Підрядника оновлено");
      } else {
        const { error: insertError } = await supabase
          .schema("tosho")
          .from("contractors")
          .insert(payload);

        if (insertError) throw insertError;
        toast.success("Підрядника додано");
      }

      setDialogOpen(false);
      setEditingRow(null);
      setForm(EMPTY_FORM);
      await loadContractors({ silent: true });
    } catch (saveError) {
      setFormError(getErrorMessage(saveError, "Не вдалося зберегти підрядника."));
    } finally {
      setSaving(false);
    }
  }, [editingRow?.id, form, loadContractors, teamId]);

  const handleDelete = useCallback(async () => {
    if (!teamId || !deleteTarget?.id) return;

    setDeleteLoading(true);
    try {
      const { error: deleteError } = await supabase
        .schema("tosho")
        .from("contractors")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("team_id", teamId);

      if (deleteError) throw deleteError;

      setDeleteTarget(null);
      toast.success("Підрядника видалено");
      await loadContractors({ silent: true });
    } catch (deleteError) {
      toast.error("Не вдалося видалити підрядника", {
        description: getErrorMessage(deleteError, "Спробуйте ще раз."),
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, loadContractors, teamId]);

  if (authLoading || loading) {
    return <AppSectionLoader label="Завантаження підрядників..." />;
  }

  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Не вдалося визначити команду для модуля підрядників.</div>;
  }

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "contractors" | "suppliers")}>
        <TabsContent value="contractors" className="mt-4">
          <div className="-mx-4 overflow-hidden md:-mx-5 lg:-mx-6">
            {error ? (
              <div className="px-4 py-6 text-sm text-destructive md:px-5 lg:px-6">{error}</div>
            ) : schemaMissing ? (
              <div className="mx-4 rounded-[var(--radius-inner)] border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground md:mx-5 lg:mx-6">
                Таблиця підрядників ще не створена в Supabase. Потрібно застосувати
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-schema.sql</span>
                {" "}
                і, якщо треба стартові дані,
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-seed-from-xlsx.sql</span>.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="mx-4 rounded-[var(--radius-inner)] border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground md:mx-5 lg:mx-6">
                {rows.length === 0
                  ? "Підрядників ще немає. Додайте першого або залийте seed у Supabase."
                  : "За цими фільтрами нічого не знайдено."}
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[var(--radius-inner)] border border-border bg-card p-4"
                      onClick={() => openEdit(row)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{row.name ?? "Без назви"}</div>
                          <div className="truncate text-xs text-muted-foreground">{row.services?.trim() || "Послугу не вказано"}</div>
                        </div>
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

                      <div className="mt-3 grid gap-3 text-sm">
                        <div>
                          <div className="mb-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">Контакт</div>
                          {renderLinkedLines(row.contact_name)}
                        </div>
                        <div>
                          <div className="mb-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">Телефон / реквізити</div>
                          {renderLinkedLines(row.phone)}
                        </div>
                        <div>
                          <div className="mb-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">Адреса / сайт</div>
                          {renderLinkedLines(row.address)}
                        </div>
                        {splitIntoLines(row.delivery_info).length > 0 ? (
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">Нова Пошта / доставка</div>
                            {renderLinkedLines(row.delivery_info)}
                          </div>
                        ) : null}
                        {splitIntoLines(row.notes).length > 0 ? (
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">Нотатки</div>
                            {renderLinkedLines(row.notes)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="w-[34%] pl-6">Підрядник</TableHead>
                        <TableHead className="w-[92px] px-2">Послуги</TableHead>
                        <TableHead className="w-[30%] pl-2">Контакт</TableHead>
                        <TableHead className="w-[18%]">Телефон / реквізити</TableHead>
                        <TableHead className="w-[16%]">Адреса / сайт</TableHead>
                        <TableHead className="w-[16%]">Нова Пошта</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/10"
                          onClick={() => openEdit(row)}
                        >
                          <TableCell className="pl-6 align-top">
                            <div className="min-w-0">
                              <div className="font-medium">{row.name ?? "Без назви"}</div>
                              {row.notes?.trim() ? (
                                <div className="line-clamp-2 text-xs text-muted-foreground">{row.notes}</div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top px-2 whitespace-pre-wrap break-words">
                            {row.services?.trim() || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="align-top pl-2">{renderLinkedLines(row.contact_name)}</TableCell>
                          <TableCell className="align-top">{renderLinkedLines(row.phone)}</TableCell>
                          <TableCell className="align-top">{renderLinkedLines(row.address)}</TableCell>
                          <TableCell className="align-top">{renderLinkedLines(row.delivery_info)}</TableCell>
                          <TableCell
                            className="pr-4 text-right align-top"
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
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <div className="-mx-4 overflow-hidden md:-mx-5 lg:-mx-6">
            {error ? (
              <div className="px-4 py-6 text-sm text-destructive md:px-5 lg:px-6">{error}</div>
            ) : schemaMissing ? (
              <div className="mx-4 rounded-[var(--radius-inner)] border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground md:mx-5 lg:mx-6">
                Таблиця підрядників ще не створена в Supabase. Потрібно застосувати
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-schema.sql</span>
                {" "}
                і, якщо треба стартові дані,
                {" "}
                <span className="font-medium text-foreground">scripts/contractors-seed-from-xlsx.sql</span>.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="mx-4 rounded-[var(--radius-inner)] border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground md:mx-5 lg:mx-6">
                За цими фільтрами нічого не знайдено.
              </div>
            ) : (
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="w-[34%] pl-6">Постачальник</TableHead>
                      <TableHead className="w-[92px] px-2">Послуги</TableHead>
                      <TableHead className="w-[30%] pl-2">Контакт</TableHead>
                      <TableHead className="w-[18%]">Телефон / реквізити</TableHead>
                      <TableHead className="w-[16%]">Адреса / сайт</TableHead>
                      <TableHead className="w-[16%]">Нова Пошта</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow
                        key={`supplier-${row.id}`}
                        className="cursor-pointer hover:bg-muted/10"
                        onClick={() => openEdit(row)}
                        >
                          <TableCell className="pl-6 align-top">
                            <div className="min-w-0">
                              <div className="font-medium">{row.name ?? "Без назви"}</div>
                              {row.notes?.trim() ? (
                                <div className="line-clamp-2 text-xs text-muted-foreground">{row.notes}</div>
                              ) : null}
                            </div>
                          </TableCell>
                        <TableCell className="align-top px-2 whitespace-pre-wrap break-words">
                          {row.services?.trim() || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="align-top pl-2">{renderLinkedLines(row.contact_name)}</TableCell>
                        <TableCell className="align-top">{renderLinkedLines(row.phone)}</TableCell>
                        <TableCell className="align-top">{renderLinkedLines(row.address)}</TableCell>
                        <TableCell className="align-top">{renderLinkedLines(row.delivery_info)}</TableCell>
                        <TableCell
                          className="pr-4 text-right align-top"
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
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
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
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>
              {editingRow
                ? (activeTab === "contractors" ? "Редагувати підрядника" : "Редагувати постачальника")
                : (activeTab === "contractors" ? "Новий підрядник" : "Новий постачальник")}
            </DialogTitle>
            <DialogDescription>
              Зберігається в `tosho.contractors` і доступне всій вашій команді.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Назва</label>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Наприклад, ТОВ «СВ-Друк»"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Послуги</label>
              <Input
                value={form.services}
                onChange={(event) => setForm((current) => ({ ...current, services: event.target.value }))}
                placeholder="УФ-друк, висічка, вишивка..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Контактна особа</label>
              <Input
                value={form.contactName}
                onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                placeholder="Імʼя, менеджер, представник"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Телефон / контакти</label>
              <Input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Телефони, email, месенджери"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Адреса / сайт</label>
              <Textarea
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="Адреса складу, сайт або email"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Нова Пошта / доставка</label>
              <Textarea
                value={form.deliveryInfo}
                onChange={(event) => setForm((current) => ({ ...current, deliveryInfo: event.target.value }))}
                placeholder="Відділення, ЄДРПОУ, ПІБ отримувача"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Дата нагадування</label>
              <Input
                type="date"
                value={form.reminderDate}
                onChange={(event) => setForm((current) => ({ ...current, reminderDate: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Час нагадування</label>
              <Input
                type="time"
                value={form.reminderTime}
                onChange={(event) => setForm((current) => ({ ...current, reminderTime: event.target.value }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Коментар до нагадування</label>
              <Textarea
                value={form.reminderComment}
                onChange={(event) => setForm((current) => ({ ...current, reminderComment: event.target.value }))}
                placeholder="Що саме потрібно не забути"
                rows={3}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Нотатки</label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Будь-які додаткові умови співпраці"
                rows={4}
              />
            </div>
          </div>

          {formError ? <div className="text-sm text-destructive">{formError}</div> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingRow
                ? "Зберегти зміни"
                : (activeTab === "contractors" ? "Створити підрядника" : "Створити постачальника")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Видалити підрядника?"
        description={deleteTarget?.name ? `Запис «${deleteTarget.name}» буде видалено без можливості відновлення.` : undefined}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        onConfirm={handleDelete}
        loading={deleteLoading}
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      />
    </div>
  );
}
