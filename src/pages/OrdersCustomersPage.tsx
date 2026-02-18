import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerDialog } from "@/components/customers";
import { PageHeader } from "@/components/app/headers/PageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, MoreHorizontal, PlusCircle, Search, Trash2 } from "lucide-react";

type OwnershipOption = {
  value: string;
  label: string;
};

type VatOption = {
  value: string;
  label: string;
  rate: number | null;
};

type CustomerRow = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  legal_name?: string | null;
  ownership_type?: string | null;
  vat_rate?: number | null;
  tax_id?: string | null;
  website?: string | null;
  iban?: string | null;
  logo_url?: string | null;
  contact_name?: string | null;
  contact_position?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_birthday?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

const formatOwnership = (value?: string | null) => {
  if (!value) return "Не вказано";
  const match = OWNERSHIP_OPTIONS.find((option) => option.value === value);
  return match?.label ?? value;
};

const formatVat = (value?: number | null) => {
  if (value === null || value === undefined) return "немає";
  const match = VAT_OPTIONS.find((option) => option.rate === value);
  return match?.label ?? `${value}%`;
};

const getInitials = (value?: string | null) => {
  if (!value) return "Не вказано";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Не вказано";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

function CustomersPage({ teamId }: { teamId: string }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [form, setForm] = useState({
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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = row.name?.toLowerCase() ?? "";
      const legal = row.legal_name?.toLowerCase() ?? "";
      return name.includes(q) || legal.includes(q);
    });
  }, [rows, search]);

  const resetForm = () => {
    setForm({
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
    setFormError(null);
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (row: CustomerRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name ?? "",
      legalName: row.legal_name ?? "",
      ownershipType: row.ownership_type ?? "",
      vatRate:
        row.vat_rate === null || row.vat_rate === undefined ? "none" : String(row.vat_rate),
      taxId: row.tax_id ?? "",
      website: row.website ?? "",
      iban: row.iban ?? "",
      logoUrl: row.logo_url ?? "",
      contactName: row.contact_name ?? "",
      contactPosition: row.contact_position ?? "",
      contactPhone: row.contact_phone ?? "",
      contactEmail: row.contact_email ?? "",
      contactBirthday: row.contact_birthday ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openDelete = (row: CustomerRow) => {
    setDeleteTarget(row);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .schema("tosho")
        .from("customers")
        .select("*")
        .eq("team_id", teamId)
        .order("name", { ascending: true });
      if (loadError) throw loadError;
      setRows((data as CustomerRow[]) ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Не вдалося завантажити замовників.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, [teamId]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Вкажіть назву компанії.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const vatOption = VAT_OPTIONS.find((option) => option.value === form.vatRate);
    const payload: Record<string, unknown> = {
      team_id: teamId,
      name: form.name.trim(),
      legal_name: form.legalName.trim() || null,
      ownership_type: form.ownershipType || null,
      vat_rate: vatOption?.rate ?? null,
      tax_id: form.taxId.trim() || null,
      website: form.website.trim() || null,
      iban: form.iban.trim() || null,
      logo_url: form.logoUrl.trim() || null,
      contact_name: form.contactName.trim() || null,
      contact_position: form.contactPosition || null,
      contact_phone: form.contactPhone.trim() || null,
      contact_email: form.contactEmail.trim() || null,
      contact_birthday: form.contactBirthday || null,
    };

    const basePayload: Record<string, unknown> = {
      name: form.name.trim(),
      legal_name: form.legalName.trim() || null,
    };

    const removeOptionalFields = () => {
      const clone = { ...payload };
      delete clone.ownership_type;
      delete clone.vat_rate;
      delete clone.tax_id;
      delete clone.website;
      delete clone.iban;
      delete clone.logo_url;
      delete clone.contact_name;
      delete clone.contact_position;
      delete clone.contact_phone;
      delete clone.contact_email;
      delete clone.contact_birthday;
      return clone;
    };

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .schema("tosho")
          .from("customers")
          .update(payload)
          .eq("id", editingId)
          .eq("team_id", teamId);
        if (updateError) {
          const message = updateError.message ?? "";
          if (message.includes("column")) {
            const fallbackPayload = removeOptionalFields();
            const { error: fallbackError } = await supabase
              .schema("tosho")
              .from("customers")
              .update(fallbackPayload)
              .eq("id", editingId)
              .eq("team_id", teamId);
            if (fallbackError) throw fallbackError;
          } else {
            throw updateError;
          }
        }
      } else {
        const { error: insertError } = await supabase
          .schema("tosho")
          .from("customers")
          .insert(payload);
        if (insertError) {
          const message = insertError.message ?? "";
          if (message.includes("column")) {
            const fallbackPayload = { ...basePayload, team_id: teamId };
            const { error: fallbackError } = await supabase
              .schema("tosho")
              .from("customers")
              .insert(fallbackPayload);
            if (fallbackError) throw fallbackError;
          } else {
            throw insertError;
          }
        }
      }

      setDialogOpen(false);
      resetForm();
      await loadCustomers();
    } catch (err: any) {
      setFormError(err?.message ?? "Не вдалося зберегти замовника.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { error: deleteError } = await supabase
        .schema("tosho")
        .from("customers")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("team_id", teamId);
      if (deleteError) throw deleteError;
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      await loadCustomers();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Не вдалося видалити замовника.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20 space-y-6">
      <PageHeader
        title="Замовники"
        subtitle="База компаній, реквізитів та контактної інформації."
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Новий замовник
          </Button>
        }
      >
        <div className="relative min-w-[240px] max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук замовника..."
            className="pl-9"
          />
        </div>
      </PageHeader>

      <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Немає замовників. Додайте першого.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="pl-6">Компанія</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>ПДВ</TableHead>
                <TableHead>ЄДРПОУ / ІПН</TableHead>
                <TableHead>Сайт</TableHead>
                <TableHead>IBAN</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/10 cursor-pointer"
                  onClick={() => openEdit(row)}
                >
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      {row.logo_url ? (
                        <img
                          src={row.logo_url}
                          alt={row.name ?? "logo"}
                          className="h-9 w-9 rounded-full object-cover border border-border/60 bg-muted/20"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full border border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                          {getInitials(row.name)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{row.name ?? "Не вказано"}</div>
                        {row.legal_name && (
                          <div className="text-xs text-muted-foreground">{row.legal_name}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{formatOwnership(row.ownership_type)}</TableCell>
                  <TableCell>{formatVat(row.vat_rate ?? null)}</TableCell>
                  <TableCell>{row.tax_id ?? "Не вказано"}</TableCell>
                  <TableCell className="truncate max-w-[200px]">
                    {row.website ? (
                      <a
                        href={row.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {row.website}
                      </a>
                    ) : (
                      "Не вказано"
                    )}
                  </TableCell>
                  <TableCell className="truncate max-w-[200px]">{row.iban ?? "Не вказано"}</TableCell>
                  <TableCell
                    className="text-right pr-4"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(row)}>
                          Редагувати
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDelete(row)}
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
        )}
      </div>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open && !editingId) {
            resetForm();
          }
        }}
        form={form}
        setForm={setForm}
        ownershipOptions={OWNERSHIP_OPTIONS}
        vatOptions={VAT_OPTIONS}
        saving={saving}
        error={formError}
        title={editingId ? "Редагувати замовника" : "Новий замовник"}
        description={
          editingId
            ? undefined
            : "Додайте всі дані замовника, щоб одразу підхопити їх у прорахунку."
        }
        submitLabel={editingId ? "Зберегти" : "Створити клієнта"}
        onSubmit={handleSave}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Видалити замовника?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {deleteTarget?.name ?? "Цей замовник"} буде видалений. Дію не можна скасувати.
          </div>
          {deleteError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteBusy}>
              Скасувати
            </Button>
            <Button variant="destructiveSolid" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? "Видалення..." : "Видалити"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrdersCustomersPage() {
  const { teamId, loading, session } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>;
  }

  if (!session) {
    return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  return <CustomersPage teamId={teamId} />;
}
