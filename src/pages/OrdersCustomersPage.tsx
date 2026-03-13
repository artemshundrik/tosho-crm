import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CustomerDialog, LeadDialog, type CustomerContact } from "@/components/customers";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { listCustomerQuotes } from "@/lib/toshoApi";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { buildUserNameFromMetadata, formatUserShortName } from "@/lib/userName";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
  manager_user_id?: string | null;
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
  contacts?: CustomerContact[] | null;
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
  manager_user_id?: string | null;
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
  { value: "go", label: "ГО" },
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

const EMPTY_CUSTOMER_CONTACT: CustomerContact = {
  name: "",
  position: "",
  phone: "",
  email: "",
  birthday: "",
};

const parseCustomerContacts = (row?: Partial<CustomerRow> | null): CustomerContact[] => {
  const raw = Array.isArray(row?.contacts) ? row?.contacts : [];
  const normalized = raw
    .map((entry) => {
      const contact = typeof entry === "object" && entry ? (entry as Partial<CustomerContact>) : null;
      return {
        name: contact?.name?.trim() ?? "",
        position: contact?.position?.trim() ?? "",
        phone: contact?.phone?.trim() ?? "",
        email: contact?.email?.trim() ?? "",
        birthday: contact?.birthday?.trim() ?? "",
      };
    })
    .filter((contact) => Object.values(contact).some(Boolean));

  if (normalized.length > 0) return normalized;

  const legacy = {
    name: row?.contact_name?.trim?.() ?? "",
    position: row?.contact_position?.trim?.() ?? "",
    phone: row?.contact_phone?.trim?.() ?? "",
    email: row?.contact_email?.trim?.() ?? "",
    birthday: row?.contact_birthday?.trim?.() ?? "",
  };

  return Object.values(legacy).some(Boolean) ? [legacy] : [{ ...EMPTY_CUSTOMER_CONTACT }];
};

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


const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

const ALL_MANAGERS_FILTER = "__all__";
const NO_MANAGER_FILTER = "__none__";
const normalizeManagerKey = (value?: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

type CustomersPageCachePayload = {
  rows: CustomerRow[];
  leads: LeadRow[];
  teamMembers: WorkspaceMemberDisplayRow[];
  cachedAt: number;
};

const toManagerKey = (value?: string | null) => normalizeManagerKey(value);

const buildManagerAliases = (member: WorkspaceMemberDisplayRow) => {
  const aliases = new Set<string>();
  const firstName = member.firstName.trim();
  const lastName = member.lastName.trim();
  const fullName = member.fullName.trim();
  const label = member.label.trim();
  const emailAlias = member.email?.split("@")[0]?.trim() ?? "";

  [label, fullName, `${firstName} ${lastName}`.trim(), `${lastName} ${firstName}`.trim(), firstName, emailAlias]
    .filter(Boolean)
    .forEach((value) => aliases.add(toManagerKey(value)));

  if (firstName && lastName) {
    aliases.add(toManagerKey(`${firstName} ${lastName[0]}.`));
    aliases.add(toManagerKey(`${lastName} ${firstName[0]}.`));
  }

  return Array.from(aliases).filter(Boolean);
};

function readCustomersPageCache(teamId: string): CustomersPageCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`customers-page-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomersPageCachePayload;
    const cachedTeamMembers = Array.isArray(parsed.teamMembers)
      ? parsed.teamMembers.filter(
          (row): row is WorkspaceMemberDisplayRow =>
            typeof row?.userId === "string" &&
            typeof row?.label === "string" &&
            typeof row?.workspaceId === "string"
        )
      : [];
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      teamMembers: cachedTeamMembers,
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function CustomersPage({ teamId }: { teamId: string }) {
  const { session, userId, accessRole, jobRole } = useAuth();
  const initialCache = readCustomersPageCache(teamId);
  const [activeTab, setActiveTab] = useState<"customers" | "leads">("customers");
  const [search, setSearch] = useState("");
  const [customerManagerFilter, setCustomerManagerFilter] = useState<string>(ALL_MANAGERS_FILTER);
  const [leadManagerFilter, setLeadManagerFilter] = useState<string>(ALL_MANAGERS_FILTER);
  const [defaultManagerFilterApplied, setDefaultManagerFilterApplied] = useState(false);

  const [rows, setRows] = useState<CustomerRow[]>(() => initialCache?.rows ?? []);
  const [customersLoading, setCustomersLoading] = useState(() => !initialCache);
  const [customersRefreshing, setCustomersRefreshing] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadRow[]>(() => initialCache?.leads ?? []);
  const [leadsLoading, setLeadsLoading] = useState(() => !initialCache);
  const [leadsRefreshing, setLeadsRefreshing] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDisplayRow[]>(() => initialCache?.teamMembers ?? []);

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
    managerId: "",
    ownershipType: "",
    vatRate: "none",
    taxId: "",
    website: "",
    iban: "",
    logoUrl: "",
    contacts: [{ ...EMPTY_CUSTOMER_CONTACT }],
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
    managerId: "",
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
    const resolved = buildUserNameFromMetadata(
      session?.user?.user_metadata as Record<string, unknown> | undefined,
      session?.user?.email
    );
    return resolved.displayName;
  }, [session]);
  const memberById = useMemo(() => new Map(teamMembers.map((member) => [member.userId, member])), [teamMembers]);
  const memberByLabel = useMemo(
    () => new Map(teamMembers.map((member) => [member.label, member])),
    [teamMembers]
  );
  const managerDialogMembers = useMemo(
    () =>
      teamMembers.map((member) => ({
        id: member.userId,
        label: member.label,
        avatarUrl: member.avatarDisplayUrl,
      })),
    [teamMembers]
  );
  const memberByAlias = useMemo(() => {
    const counts = new Map<string, number>();
    teamMembers.forEach((member) => {
      buildManagerAliases(member).forEach((key) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
    const map = new Map<string, WorkspaceMemberDisplayRow>();
    teamMembers.forEach((member) => {
      buildManagerAliases(member).forEach((key) => {
        if ((counts.get(key) ?? 0) === 1) map.set(key, member);
      });
    });
    return map;
  }, [teamMembers]);
  const memberByUniqueFirstToken = useMemo(() => {
    const counts = new Map<string, number>();
    teamMembers.forEach((member) => {
      const token = toManagerKey(member.firstName || member.label).split(" ")[0] ?? "";
      if (!token) return;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    });
    const map = new Map<string, WorkspaceMemberDisplayRow>();
    teamMembers.forEach((member) => {
      const token = toManagerKey(member.firstName || member.label).split(" ")[0] ?? "";
      if (!token) return;
      if ((counts.get(token) ?? 0) === 1) map.set(token, member);
    });
    return map;
  }, [teamMembers]);
  const resolveManagerMember = useCallback(
    (managerUserId?: string | null, manager?: string | null) => {
      const byId = managerUserId ? memberById.get(managerUserId) : undefined;
      if (byId) return byId;
      const normalized = toManagerKey(manager);
      if (!normalized) return undefined;
      const byAlias = memberByAlias.get(normalized);
      if (byAlias) return byAlias;
      const token = normalized.split(" ")[0] ?? "";
      return token ? memberByUniqueFirstToken.get(token) : undefined;
    },
    [memberByAlias, memberById, memberByUniqueFirstToken]
  );
  const resolveManagerLabel = useCallback(
    (managerUserId?: string | null, manager?: string | null) => {
      const resolvedMember = resolveManagerMember(managerUserId, manager);
      if (resolvedMember?.label?.trim()) return resolvedMember.label.trim();
      const fallback = manager?.trim() ?? "";
      if (!fallback) return "";
      return formatUserShortName({ fullName: fallback, fallback });
    },
    [resolveManagerMember]
  );

  const customerManagerOptions = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      const value = resolveManagerLabel(row.manager_user_id, row.manager);
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
  }, [resolveManagerLabel, rows]);

  const leadManagerOptions = useMemo(() => {
    const values = new Set<string>();
    leads.forEach((lead) => {
      const value = resolveManagerLabel(lead.manager_user_id, lead.manager);
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
  }, [leads, resolveManagerLabel]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = rows.filter((row) => {
      const name = row.name?.toLowerCase() ?? "";
      const legal = row.legal_name?.toLowerCase() ?? "";
      const manager = resolveManagerLabel(row.manager_user_id, row.manager).toLowerCase();
      const contacts = parseCustomerContacts(row);
      const contactBlob = contacts
        .map((contact) => [contact.name, contact.position, contact.phone, contact.email].filter(Boolean).join(" "))
        .join(" ")
        .toLowerCase();
      return !q || name.includes(q) || legal.includes(q) || manager.includes(q) || contactBlob.includes(q);
    });

    if (customerManagerFilter === NO_MANAGER_FILTER) {
      next = next.filter((row) => !resolveManagerLabel(row.manager_user_id, row.manager));
    } else if (customerManagerFilter !== ALL_MANAGERS_FILTER) {
      next = next.filter((row) => resolveManagerLabel(row.manager_user_id, row.manager) === customerManagerFilter);
    }

    return next;
  }, [customerManagerFilter, resolveManagerLabel, rows, search]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = leads.filter((lead) => {
      const company = lead.company_name?.toLowerCase() ?? "";
      const legal = lead.legal_name?.toLowerCase() ?? "";
      const first = lead.first_name?.toLowerCase() ?? "";
      const last = lead.last_name?.toLowerCase() ?? "";
      const email = lead.email?.toLowerCase() ?? "";
      const source = lead.source?.toLowerCase() ?? "";
      const manager = resolveManagerLabel(lead.manager_user_id, lead.manager).toLowerCase();
      const phones = (lead.phone_numbers ?? []).join(" ").toLowerCase();
      return (
        !q ||
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

    if (leadManagerFilter === NO_MANAGER_FILTER) {
      next = next.filter((lead) => !resolveManagerLabel(lead.manager_user_id, lead.manager));
    } else if (leadManagerFilter !== ALL_MANAGERS_FILTER) {
      next = next.filter((lead) => resolveManagerLabel(lead.manager_user_id, lead.manager) === leadManagerFilter);
    }

    return next;
  }, [leadManagerFilter, leads, resolveManagerLabel, search]);
  const currentManagerLabel = useMemo(() => {
    const fromMember = userId ? memberById.get(userId)?.label?.trim() : "";
    if (fromMember) return fromMember;
    return defaultManagerName.trim();
  }, [defaultManagerName, memberById, userId]);
  const isManagerUser = useMemo(() => {
    const access = (accessRole ?? "").trim().toLowerCase();
    const job = (jobRole ?? "").trim().toLowerCase();
    return access === "owner" || access === "admin" || job === "manager" || job === "менеджер";
  }, [accessRole, jobRole]);
  const calculationQuotes = useMemo(
    () => linkedQuotes.filter((row) => (row.status ?? "").toLowerCase() !== "approved"),
    [linkedQuotes]
  );
  const orderQuotes = useMemo(
    () => linkedQuotes.filter((row) => (row.status ?? "").toLowerCase() === "approved"),
    [linkedQuotes]
  );

  const renderManagerCell = (managerUserId?: string | null, manager?: string | null) => {
    const managerLabel = resolveManagerLabel(managerUserId, manager);
    if (!managerLabel) return "Не вказано";
    const member =
      resolveManagerMember(managerUserId, manager) ??
      memberByLabel.get(managerLabel);
    return (
      <div className="flex items-center gap-2 min-w-0">
        <AvatarBase
          src={member?.avatarDisplayUrl ?? null}
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

  const renderManagerFilterValue = (value: string) => {
    if (value === ALL_MANAGERS_FILTER) return <span>Всі менеджери</span>;
    if (value === NO_MANAGER_FILTER) return <span>Без менеджера</span>;
    const member = memberByLabel.get(value);
    return (
      <span className="flex items-center gap-2 min-w-0">
        <AvatarBase
          src={member?.avatarDisplayUrl ?? null}
          name={value}
          fallback={value.slice(0, 2).toUpperCase()}
          size={18}
          className="border-border/60 shrink-0"
          fallbackClassName="text-[9px] font-semibold"
        />
        <span className="truncate">{value}</span>
      </span>
    );
  };

  const resetForm = () => {
    setForm({
      name: "",
      legalName: "",
      manager: currentManagerLabel || defaultManagerName,
      managerId: userId ?? "",
      ownershipType: "",
      vatRate: "none",
      taxId: "",
      website: "",
      iban: "",
      logoUrl: "",
      contacts: [{ ...EMPTY_CUSTOMER_CONTACT }],
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
      manager: currentManagerLabel || defaultManagerName,
      managerId: userId ?? "",
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
    const contacts = parseCustomerContacts(row);
    const primaryContact = contacts[0] ?? EMPTY_CUSTOMER_CONTACT;
    setEditingId(row.id);
    setForm({
      name: row.name ?? "",
      legalName: row.legal_name ?? "",
      manager: resolveManagerLabel(row.manager_user_id, row.manager),
      managerId: row.manager_user_id ?? "",
      ownershipType: row.ownership_type ?? "",
      vatRate:
        row.vat_rate === null || row.vat_rate === undefined ? "none" : String(row.vat_rate),
      taxId: row.tax_id ?? "",
      website: row.website ?? "",
      iban: row.iban ?? "",
      logoUrl: row.logo_url ?? "",
      contacts,
      contactName: primaryContact.name,
      contactPosition: primaryContact.position,
      contactPhone: primaryContact.phone,
      contactEmail: primaryContact.email,
      contactBirthday: primaryContact.birthday,
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
      manager: resolveManagerLabel(lead.manager_user_id, lead.manager) || (currentManagerLabel || defaultManagerName),
      managerId: lead.manager_user_id ?? "",
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
    if (rows.length > 0) {
      setCustomersRefreshing(true);
    } else {
      setCustomersLoading(true);
    }
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
      setCustomersRefreshing(false);
    }
  };

  const loadLeads = async () => {
    if (leads.length > 0) {
      setLeadsRefreshing(true);
    } else {
      setLeadsLoading(true);
    }
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
      setLeadsRefreshing(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) {
        setTeamMembers([]);
        return;
      }
      const rows = await listWorkspaceMembersForDisplay(workspaceId);
      setTeamMembers(rows);
    } catch {
      setTeamMembers([]);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !teamId) return;
    sessionStorage.setItem(
      `customers-page-cache:${teamId}`,
      JSON.stringify({
        rows,
        leads,
        teamMembers,
        cachedAt: Date.now(),
      } satisfies CustomersPageCachePayload)
    );
  }, [leads, rows, teamId, teamMembers]);

  useEffect(() => {
    void loadCustomers();
    void loadLeads();
    void loadTeamMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId]);

  useEffect(() => {
    if (defaultManagerFilterApplied) return;
    if (!isManagerUser) return;
    if (!currentManagerLabel) return;
    const hasManager =
      customerManagerOptions.includes(currentManagerLabel) || leadManagerOptions.includes(currentManagerLabel);
    if (!hasManager) return;
    setCustomerManagerFilter(currentManagerLabel);
    setLeadManagerFilter(currentManagerLabel);
    setDefaultManagerFilterApplied(true);
  }, [
    currentManagerLabel,
    customerManagerOptions,
    defaultManagerFilterApplied,
    isManagerUser,
    leadManagerOptions,
  ]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Вкажіть назву компанії.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const vatOption = VAT_OPTIONS.find((option) => option.value === form.vatRate);
    const managerValue = form.manager.trim();
    const selectedManagerLabel = form.managerId
      ? memberById.get(form.managerId)?.label ?? managerValue
      : managerValue;
    const contacts = form.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        position: contact.position.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
        birthday: contact.birthday.trim(),
      }))
      .filter((contact) => Object.values(contact).some(Boolean));
    const primaryContact = contacts[0] ?? null;
    const payload: Record<string, unknown> = {
      team_id: teamId,
      name: form.name.trim(),
      legal_name: form.legalName.trim() || null,
      manager: editingId
        ? (selectedManagerLabel || null)
        : (selectedManagerLabel || currentManagerLabel || defaultManagerName || null),
      manager_user_id: form.managerId || null,
      ownership_type: form.ownershipType || null,
      vat_rate: vatOption?.rate ?? null,
      tax_id: form.taxId.trim() || null,
      website: form.website.trim() || null,
      iban: form.iban.trim() || null,
      logo_url: form.logoUrl.trim() || null,
      contacts: contacts.length > 0 ? contacts : null,
      contact_name: primaryContact?.name || null,
      contact_position: primaryContact?.position || null,
      contact_phone: primaryContact?.phone || null,
      contact_email: primaryContact?.email || null,
      contact_birthday: primaryContact?.birthday || null,
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
      delete clone.manager_user_id;
      delete clone.ownership_type;
      delete clone.vat_rate;
      delete clone.tax_id;
      delete clone.website;
      delete clone.iban;
      delete clone.logo_url;
      delete clone.contacts;
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
    const selectedManagerLabel = leadForm.managerId
      ? memberById.get(leadForm.managerId)?.label ?? managerValue
      : managerValue;
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
      manager: selectedManagerLabel || currentManagerLabel || defaultManagerName || null,
      manager_user_id: leadForm.managerId || null,
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
          } else if (message.includes("column") && message.includes("manager_user_id")) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.manager_user_id;
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
          } else if (message.includes("column") && message.includes("manager_user_id")) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.manager_user_id;
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

  const customersHeaderActions = useMemo(() => (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex h-10 w-full items-center rounded-[var(--radius-lg)] border border-border bg-muted p-1 lg:w-auto">
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "customers"}
            onClick={() => setActiveTab("customers")}
            className="gap-2"
          >
            <Building2 className="h-4 w-4" />
            Замовники
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{rows.length}</span>
          </Button>
          <Button
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "leads"}
            onClick={() => setActiveTab("leads")}
            className="gap-2"
          >
            <Users className="h-4 w-4" />
            Ліди
            <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] tabular-nums">{leads.length}</span>
          </Button>
        </div>
        <Button onClick={activeTab === "customers" ? openCreate : openCreateLead} className="h-10 gap-2">
          <PlusCircle className="h-4 w-4" />
          {activeTab === "customers" ? "Новий замовник" : "Новий лід"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "customers" ? "Пошук замовника..." : "Пошук ліда..."}
            className="pl-9"
          />
        </div>
        <Select
          value={activeTab === "customers" ? customerManagerFilter : leadManagerFilter}
          onValueChange={(value) => {
            if (activeTab === "customers") setCustomerManagerFilter(value);
            else setLeadManagerFilter(value);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <div className="min-w-0 flex items-center">
              {renderManagerFilterValue(activeTab === "customers" ? customerManagerFilter : leadManagerFilter)}
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MANAGERS_FILTER}>Всі менеджери</SelectItem>
            <SelectItem value={NO_MANAGER_FILTER}>Без менеджера</SelectItem>
            {(activeTab === "customers" ? customerManagerOptions : leadManagerOptions).map((manager) => (
              <SelectItem key={manager} value={manager}>
                {renderManagerFilterValue(manager)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm font-semibold text-foreground">
          {activeTab === "customers" ? filteredRows.length : filteredLeads.length}
          <span className="ml-1 text-muted-foreground">знайдено</span>
        </div>
      </div>
    </div>
  ), [
    activeTab,
    customerManagerFilter,
    customerManagerOptions,
    filteredLeads.length,
    filteredRows.length,
    leadManagerFilter,
    leadManagerOptions,
    leads.length,
    rows.length,
    search,
  ]);

  usePageHeaderActions(customersHeaderActions, [customersHeaderActions]);

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "customers" | "leads")}>
        <TabsContent value="customers" className="mt-4">
          <div className="overflow-hidden">
            {customersLoading ? (
              <AppSectionLoader label="Завантаження..." />
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
                          <EntityAvatar
                            src={row.logo_url ?? null}
                            name={row.name ?? row.legal_name ?? "Компанія"}
                            fallback={getInitials(row.name ?? row.legal_name)}
                            size={36}
                          />
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
                      <TableCell>{renderManagerCell(row.manager_user_id, row.manager)}</TableCell>
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
          <div className="overflow-hidden">
            {leadsLoading ? (
              <AppSectionLoader label="Завантаження..." />
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
                          <EntityAvatar
                            src={lead.logo_url ?? null}
                            name={lead.company_name ?? lead.legal_name ?? "Лід"}
                            fallback={getInitials(lead.company_name ?? lead.legal_name)}
                            size={36}
                          />
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
                      <TableCell>{renderManagerCell(lead.manager_user_id, lead.manager)}</TableCell>
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
        teamMembers={managerDialogMembers}
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
        teamMembers={managerDialogMembers}
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
