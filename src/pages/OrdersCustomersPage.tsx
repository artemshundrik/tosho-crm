import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerDialog, LeadDialog } from "@/components/customers";
import { PageHeader } from "@/components/app/headers/PageHeader";
import { listCustomerQuotes, listTeamMembers, type TeamMemberRow } from "@/lib/toshoApi";
import { AvatarBase } from "@/components/app/avatar-kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MoreHorizontal, PlusCircle, Search, Trash2, Users } from "lucide-react";

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
  manager?: string | null;
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
  signatory_name?: string | null;
  signatory_position?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadRow = {
  id: string;
  team_id?: string | null;
  company_name?: string | null;
  legal_name?: string | null;
  logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_numbers?: string[] | null;
  source?: string | null;
  website?: string | null;
  manager?: string | null;
  iban?: string | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type QuoteHistoryRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
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
  if (!value) return "?";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
};

const COMPANY_AVATAR_TONES = [
  { shell: "border-sky-400/40 bg-sky-500/10", fallback: "bg-sky-500/25 text-sky-100" },
  { shell: "border-emerald-400/40 bg-emerald-500/10", fallback: "bg-emerald-500/25 text-emerald-100" },
  { shell: "border-amber-400/40 bg-amber-500/10", fallback: "bg-amber-500/25 text-amber-100" },
  { shell: "border-rose-400/40 bg-rose-500/10", fallback: "bg-rose-500/25 text-rose-100" },
  { shell: "border-violet-400/40 bg-violet-500/10", fallback: "bg-violet-500/25 text-violet-100" },
  { shell: "border-cyan-400/40 bg-cyan-500/10", fallback: "bg-cyan-500/25 text-cyan-100" },
];

const getAvatarTone = (seed?: string | null) => {
  const normalized = (seed ?? "").trim().toLowerCase();
  if (!normalized) return COMPANY_AVATAR_TONES[0];
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COMPANY_AVATAR_TONES[hash % COMPANY_AVATAR_TONES.length];
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

function CustomersPage({ teamId }: { teamId: string }) {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<"customers" | "leads">("customers");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);

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

  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadEditingId, setLeadEditingId] = useState<string | null>(null);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadFormError, setLeadFormError] = useState<string | null>(null);
  const [leadDeleteDialogOpen, setLeadDeleteDialogOpen] = useState(false);
  const [leadDeleteTarget, setLeadDeleteTarget] = useState<LeadRow | null>(null);
  const [leadDeleteBusy, setLeadDeleteBusy] = useState(false);
  const [leadDeleteError, setLeadDeleteError] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({
    companyName: "",
    legalName: "",
    logoUrl: "",
    firstName: "",
    lastName: "",
    email: "",
    phones: [""],
    source: "",
    website: "",
    manager: "",
    iban: "",
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
  const [linkedQuotes, setLinkedQuotes] = useState<QuoteHistoryRow[]>([]);
  const [linkedQuotesLoading, setLinkedQuotesLoading] = useState(false);

  const defaultManagerName = useMemo(() => {
    const fullNameRaw = session?.user?.user_metadata?.full_name;
    const fullName = typeof fullNameRaw === "string" ? fullNameRaw.trim() : "";
    if (fullName) return fullName;
    const email = session?.user?.email ?? "";
    const local = email.split("@")[0]?.trim() ?? "";
    return local;
  }, [session]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = row.name?.toLowerCase() ?? "";
      const legal = row.legal_name?.toLowerCase() ?? "";
      const manager = row.manager?.toLowerCase() ?? "";
      return name.includes(q) || legal.includes(q) || manager.includes(q);
    });
  }, [rows, search]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const company = lead.company_name?.toLowerCase() ?? "";
      const legal = lead.legal_name?.toLowerCase() ?? "";
      const first = lead.first_name?.toLowerCase() ?? "";
      const last = lead.last_name?.toLowerCase() ?? "";
      const email = lead.email?.toLowerCase() ?? "";
      const source = lead.source?.toLowerCase() ?? "";
      const manager = lead.manager?.toLowerCase() ?? "";
      const phones = (lead.phone_numbers ?? []).join(" ").toLowerCase();
      return (
        company.includes(q) ||
        legal.includes(q) ||
        first.includes(q) ||
        last.includes(q) ||
        email.includes(q) ||
        source.includes(q) ||
        manager.includes(q) ||
        phones.includes(q)
      );
    });
  }, [leads, search]);

  const memberByLabel = useMemo(
    () => new Map(teamMembers.map((member) => [member.label, member])),
    [teamMembers]
  );
  const calculationQuotes = useMemo(
    () => linkedQuotes.filter((row) => (row.status ?? "").toLowerCase() !== "approved"),
    [linkedQuotes]
  );
  const orderQuotes = useMemo(
    () => linkedQuotes.filter((row) => (row.status ?? "").toLowerCase() === "approved"),
    [linkedQuotes]
  );

  const renderManagerCell = (manager?: string | null) => {
    const managerLabel = manager?.trim();
    if (!managerLabel) return "Не вказано";
    const member = memberByLabel.get(managerLabel);
    return (
      <div className="flex items-center gap-2 min-w-0">
        <AvatarBase
          src={member?.avatarUrl ?? null}
          name={managerLabel}
          fallback={managerLabel.slice(0, 2).toUpperCase()}
          size={20}
          className="border-border/60 shrink-0"
          fallbackClassName="text-[10px] font-semibold"
        />
        <span className="truncate">{managerLabel}</span>
      </div>
    );
  };

  const resetForm = () => {
    setForm({
      name: "",
      legalName: "",
      manager: defaultManagerName,
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
    setLinkedQuotes([]);
    setLinkedQuotesLoading(false);
    setFormError(null);
  };

  const resetLeadForm = () => {
    setLeadForm({
      companyName: "",
      legalName: "",
      logoUrl: "",
      firstName: "",
      lastName: "",
      email: "",
      phones: [""],
      source: "",
      website: "",
      manager: defaultManagerName,
      iban: "",
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
    setLeadFormError(null);
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
      manager: row.manager ?? "",
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
      signatoryName: row.signatory_name ?? "",
      signatoryPosition: row.signatory_position ?? "",
      reminderDate: row.reminder_at ? row.reminder_at.slice(0, 10) : "",
      reminderTime: row.reminder_at ? row.reminder_at.slice(11, 16) : "",
      reminderComment: row.reminder_comment ?? "",
      eventName: row.event_name ?? "",
      eventDate: row.event_at ? row.event_at.slice(0, 10) : "",
      eventComment: row.event_comment ?? "",
      notes: row.notes ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
    void loadCustomerLinkedQuotes(row.id);
  };

  const openDelete = (row: CustomerRow) => {
    setDeleteTarget(row);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const openCreateLead = () => {
    setLeadEditingId(null);
    resetLeadForm();
    setLeadDialogOpen(true);
  };

  const openEditLead = (lead: LeadRow) => {
    setLeadEditingId(lead.id);
    setLeadForm({
      companyName: lead.company_name ?? "",
      legalName: lead.legal_name ?? "",
      logoUrl: lead.logo_url ?? "",
      firstName: lead.first_name ?? "",
      lastName: lead.last_name ?? "",
      email: lead.email ?? "",
      phones: lead.phone_numbers?.length ? lead.phone_numbers : [""],
      source: lead.source ?? "",
      website: lead.website ?? "",
      manager: lead.manager ?? defaultManagerName,
      iban: lead.iban ?? "",
      signatoryName: lead.signatory_name ?? "",
      signatoryPosition: lead.signatory_position ?? "",
      reminderDate: lead.reminder_at ? lead.reminder_at.slice(0, 10) : "",
      reminderTime: lead.reminder_at ? lead.reminder_at.slice(11, 16) : "",
      reminderComment: lead.reminder_comment ?? "",
      eventName: lead.event_name ?? "",
      eventDate: lead.event_at ? lead.event_at.slice(0, 10) : "",
      eventComment: lead.event_comment ?? "",
      notes: lead.notes ?? "",
    });
    setLeadFormError(null);
    setLeadDialogOpen(true);
  };

  const loadCustomerLinkedQuotes = async (customerId: string) => {
    setLinkedQuotesLoading(true);
    try {
      const rows = await listCustomerQuotes({ teamId, customerId, limit: 100 });
      setLinkedQuotes(rows as QuoteHistoryRow[]);
    } catch {
      setLinkedQuotes([]);
    } finally {
      setLinkedQuotesLoading(false);
    }
  };

  const openDeleteLead = (lead: LeadRow) => {
    setLeadDeleteTarget(lead);
    setLeadDeleteError(null);
    setLeadDeleteDialogOpen(true);
  };

  const loadCustomers = async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const { data, error: loadError } = await supabase
        .schema("tosho")
        .from("customers")
        .select("*")
        .eq("team_id", teamId)
        .order("name", { ascending: true });
      if (loadError) throw loadError;
      setRows((data as CustomerRow[]) ?? []);
    } catch (err: unknown) {
      setCustomersError(getErrorMessage(err, "Не вдалося завантажити замовників."));
    } finally {
      setCustomersLoading(false);
    }
  };

  const loadLeads = async () => {
    setLeadsLoading(true);
    setLeadsError(null);
    try {
      const { data, error: loadError } = await supabase
        .schema("tosho")
        .from("leads")
        .select("*")
        .eq("team_id", teamId)
        .order("company_name", { ascending: true });
      if (loadError) throw loadError;
      setLeads((data as LeadRow[]) ?? []);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Не вдалося завантажити ліди.");
      if (message.includes("relation") && message.includes("leads")) {
        setLeadsError("Таблиця lead ще не створена. Запустіть SQL-скрипт scripts/leads-schema.sql.");
      } else {
        setLeadsError(message);
      }
    } finally {
      setLeadsLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const members = await listTeamMembers(teamId);
      setTeamMembers(members);
    } catch {
      setTeamMembers([]);
    }
  };

  useEffect(() => {
    void loadCustomers();
    void loadLeads();
    void loadTeamMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Вкажіть назву компанії.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const vatOption = VAT_OPTIONS.find((option) => option.value === form.vatRate);
    const managerValue = form.manager.trim();
    const payload: Record<string, unknown> = {
      team_id: teamId,
      name: form.name.trim(),
      legal_name: form.legalName.trim() || null,
      manager: editingId
        ? (managerValue || null)
        : (managerValue || defaultManagerName || null),
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
      signatory_name: form.signatoryName.trim() || null,
      signatory_position: form.signatoryPosition.trim() || null,
      reminder_at:
        form.reminderDate && form.reminderTime
          ? `${form.reminderDate}T${form.reminderTime}:00`
          : null,
      reminder_comment: form.reminderComment.trim() || null,
      event_name: form.eventName.trim() || null,
      event_at: form.eventDate || null,
      event_comment: form.eventComment.trim() || null,
      notes: form.notes.trim() || null,
    };

    const basePayload: Record<string, unknown> = {
      name: form.name.trim(),
      legal_name: form.legalName.trim() || null,
    };

    const removeOptionalFields = () => {
      const clone = { ...payload };
      delete clone.manager;
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
      delete clone.signatory_name;
      delete clone.signatory_position;
      delete clone.reminder_at;
      delete clone.reminder_comment;
      delete clone.event_name;
      delete clone.event_at;
      delete clone.event_comment;
      delete clone.notes;
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
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, "Не вдалося зберегти замовника."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLead = async () => {
    if (!leadForm.companyName.trim()) {
      setLeadFormError("Вкажіть назву компанії.");
      return;
    }
    if (!leadForm.firstName.trim()) {
      setLeadFormError("Вкажіть імʼя.");
      return;
    }
    if (!leadForm.source.trim()) {
      setLeadFormError("Вкажіть джерело.");
      return;
    }

    const phones = leadForm.phones.map((phone) => phone.trim()).filter(Boolean);
    if (phones.length === 0) {
      setLeadFormError("Вкажіть хоча б один номер телефону.");
      return;
    }

    setLeadSaving(true);
    setLeadFormError(null);

    const managerValue = leadForm.manager.trim();
    const payload: Record<string, unknown> = {
      team_id: teamId,
      company_name: leadForm.companyName.trim(),
      legal_name: leadForm.legalName.trim() || null,
      logo_url: leadForm.logoUrl.trim() || null,
      first_name: leadForm.firstName.trim(),
      last_name: leadForm.lastName.trim() || null,
      email: leadForm.email.trim() || null,
      phone_numbers: phones,
      source: leadForm.source.trim(),
      website: leadForm.website.trim() || null,
      manager: managerValue || defaultManagerName || null,
      iban: leadForm.iban.trim() || null,
      signatory_name: leadForm.signatoryName.trim() || null,
      signatory_position: leadForm.signatoryPosition.trim() || null,
      reminder_at:
        leadForm.reminderDate && leadForm.reminderTime
          ? `${leadForm.reminderDate}T${leadForm.reminderTime}:00`
          : null,
      reminder_comment: leadForm.reminderComment.trim() || null,
      event_name: leadForm.eventName.trim() || null,
      event_at: leadForm.eventDate || null,
      event_comment: leadForm.eventComment.trim() || null,
      notes: leadForm.notes.trim() || null,
    };

    try {
      if (leadEditingId) {
        const { error: updateError } = await supabase
          .schema("tosho")
          .from("leads")
          .update(payload)
          .eq("id", leadEditingId)
          .eq("team_id", teamId);
        if (updateError) {
          const message = updateError.message ?? "";
          if (message.includes("column") && message.includes("logo_url")) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.logo_url;
            const { error: fallbackError } = await supabase
              .schema("tosho")
              .from("leads")
              .update(fallbackPayload)
              .eq("id", leadEditingId)
              .eq("team_id", teamId);
            if (fallbackError) throw fallbackError;
          } else {
            throw updateError;
          }
        }
      } else {
        const { error: insertError } = await supabase
          .schema("tosho")
          .from("leads")
          .insert(payload);
        if (insertError) {
          const message = insertError.message ?? "";
          if (message.includes("column") && message.includes("logo_url")) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.logo_url;
            const { error: fallbackError } = await supabase
              .schema("tosho")
              .from("leads")
              .insert(fallbackPayload);
            if (fallbackError) throw fallbackError;
          } else {
            throw insertError;
          }
        }
      }

      setLeadDialogOpen(false);
      resetLeadForm();
      await loadLeads();
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Не вдалося зберегти ліда.");
      if (message.includes("relation") && message.includes("leads")) {
        setLeadFormError("Таблиця lead ще не створена. Запустіть SQL-скрипт scripts/leads-schema.sql.");
      } else {
        setLeadFormError(message);
      }
    } finally {
      setLeadSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const { error: removeError } = await supabase
        .schema("tosho")
        .from("customers")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("team_id", teamId);
      if (removeError) throw removeError;
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      await loadCustomers();
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, "Не вдалося видалити замовника."));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!leadDeleteTarget) return;
    setLeadDeleteBusy(true);
    setLeadDeleteError(null);
    try {
      const { error: removeError } = await supabase
        .schema("tosho")
        .from("leads")
        .delete()
        .eq("id", leadDeleteTarget.id)
        .eq("team_id", teamId);
      if (removeError) throw removeError;
      setLeadDeleteDialogOpen(false);
      setLeadDeleteTarget(null);
      await loadLeads();
    } catch (err: unknown) {
      setLeadDeleteError(getErrorMessage(err, "Не вдалося видалити ліда."));
    } finally {
      setLeadDeleteBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto pb-20 md:pb-0 space-y-6">
      <PageHeader
        title="Замовники та ліди"
        subtitle="База компаній, контактів, лідів і відповідальних менеджерів."
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <Button onClick={activeTab === "customers" ? openCreate : openCreateLead} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            {activeTab === "customers" ? "Новий замовник" : "Новий лід"}
          </Button>
        }
      >
        <div className="relative min-w-[240px] max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "customers" ? "Пошук замовника..." : "Пошук ліда..."}
            className="pl-9"
          />
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "customers" | "leads")}>
        <TabsList className="w-fit">
          <TabsTrigger value="customers" className="gap-2">
            <Building2 className="h-4 w-4" />
            Замовники
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <Users className="h-4 w-4" />
            Ліди
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-4">
          <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
            {customersLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>
            ) : customersError ? (
              <div className="p-6 text-sm text-destructive">{customersError}</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Немає замовників. Додайте першого.</div>
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
                    <TableHead>Менеджер</TableHead>
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
                          {(() => {
                            const tone = getAvatarTone(row.name ?? row.legal_name ?? row.id);
                            return (
                              <AvatarBase
                                src={row.logo_url ?? null}
                                name={row.name ?? row.legal_name ?? "Компанія"}
                                fallback={getInitials(row.name ?? row.legal_name)}
                                size={36}
                                className={`shrink-0 ${tone.shell}`}
                                fallbackClassName={`text-xs font-semibold ${tone.fallback}`}
                              />
                            );
                          })()}
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
                            onClick={(event) => event.stopPropagation()}
                          >
                            {row.website}
                          </a>
                        ) : (
                          "Не вказано"
                        )}
                      </TableCell>
                      <TableCell className="truncate max-w-[200px]">{row.iban ?? "Не вказано"}</TableCell>
                      <TableCell>{renderManagerCell(row.manager)}</TableCell>
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
                            <DropdownMenuItem onClick={() => openEdit(row)}>Редагувати</DropdownMenuItem>
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
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
            {leadsLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>
            ) : leadsError ? (
              <div className="p-6 text-sm text-destructive">{leadsError}</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Немає лідів. Додайте першого.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="pl-6">Компанія</TableHead>
                    <TableHead>Контакт</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Телефони</TableHead>
                    <TableHead>Джерело</TableHead>
                    <TableHead>Сайт</TableHead>
                    <TableHead>Менеджер</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="hover:bg-muted/10 cursor-pointer"
                      onClick={() => openEditLead(lead)}
                    >
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const tone = getAvatarTone(lead.company_name ?? lead.legal_name ?? lead.id);
                            return (
                              <AvatarBase
                                src={lead.logo_url ?? null}
                                name={lead.company_name ?? lead.legal_name ?? "Лід"}
                                fallback={getInitials(lead.company_name ?? lead.legal_name)}
                                size={36}
                                className={`shrink-0 ${tone.shell}`}
                                fallbackClassName={`text-xs font-semibold ${tone.fallback}`}
                              />
                            );
                          })()}
                          <div>
                            <div className="font-medium">{lead.company_name ?? "Не вказано"}</div>
                            {lead.legal_name ? (
                              <div className="text-xs text-muted-foreground">{lead.legal_name}</div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Не вказано"}
                      </TableCell>
                      <TableCell className="truncate max-w-[220px]">{lead.email ?? "Не вказано"}</TableCell>
                      <TableCell className="truncate max-w-[220px]">
                        {lead.phone_numbers?.length ? lead.phone_numbers.join(", ") : "Не вказано"}
                      </TableCell>
                      <TableCell>{lead.source ?? "Не вказано"}</TableCell>
                      <TableCell className="truncate max-w-[200px]">
                        {lead.website ? (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline underline-offset-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {lead.website}
                          </a>
                        ) : (
                          "Не вказано"
                        )}
                      </TableCell>
                      <TableCell>{renderManagerCell(lead.manager)}</TableCell>
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
                            <DropdownMenuItem onClick={() => openEditLead(lead)}>Редагувати</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => openDeleteLead(lead)}
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
        </TabsContent>
      </Tabs>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open && !editingId) {
            resetForm();
          }
          if (!open && editingId) {
            setLinkedQuotes([]);
            setLinkedQuotesLoading(false);
          }
        }}
        form={form}
        setForm={setForm}
        ownershipOptions={OWNERSHIP_OPTIONS}
        vatOptions={VAT_OPTIONS}
        teamMembers={teamMembers}
        saving={saving}
        error={formError}
        title={editingId ? "Редагувати замовника" : "Новий замовник"}
        description={
          editingId
            ? undefined
            : "Додайте всі дані замовника, щоб одразу підхопити їх у прорахунку."
        }
        submitLabel={editingId ? "Зберегти" : "Створити клієнта"}
        calculations={calculationQuotes}
        orders={orderQuotes}
        linkedLoading={linkedQuotesLoading}
        onSubmit={handleSave}
      />

      <LeadDialog
        open={leadDialogOpen}
        onOpenChange={(open) => {
          setLeadDialogOpen(open);
          if (!open && !leadEditingId) {
            resetLeadForm();
          }
        }}
        form={leadForm}
        setForm={setLeadForm}
        teamMembers={teamMembers}
        saving={leadSaving}
        error={leadFormError}
        title={leadEditingId ? "Редагувати ліда" : "Новий лід"}
        description={leadEditingId ? undefined : "Додайте всі дані ліда для першого контакту."}
        submitLabel={leadEditingId ? "Зберегти" : "Створити ліда"}
        calculations={[]}
        orders={[]}
        linkedLoading={false}
        onSubmit={handleSaveLead}
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

      <Dialog open={leadDeleteDialogOpen} onOpenChange={setLeadDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Видалити ліда?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {leadDeleteTarget?.company_name ?? "Цей лід"} буде видалений. Дію не можна скасувати.
          </div>
          {leadDeleteError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {leadDeleteError}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLeadDeleteDialogOpen(false)}
              disabled={leadDeleteBusy}
            >
              Скасувати
            </Button>
            <Button variant="destructiveSolid" onClick={handleDeleteLead} disabled={leadDeleteBusy}>
              {leadDeleteBusy ? "Видалення..." : "Видалити"}
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
