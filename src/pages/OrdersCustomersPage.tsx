import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
  TOOLBAR_CONTROL,
} from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CustomerDialog, LeadDialog, type CustomerContact, type CustomerFormState, type LeadFormState } from "@/components/customers";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { listCustomerQuotes, listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { buildUserNameFromMetadata, formatUserShortName } from "@/lib/userName";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import { isQuoteManagerJobRole } from "@/lib/permissions";
import {
  getCustomerLogoImportErrorMessage,
  ingestCustomerLogoFromFile,
  ingestCustomerLogoFromUrl,
  normalizeCustomerLogoUrl,
  removeManagedCustomerLogoByUrl,
} from "@/lib/customerLogo";
import {
  createEmptyCustomerLegalEntity,
  formatCustomerLegalEntitySummary,
  formatCustomerLegalEntityTitle,
  formatOwnershipTypeLabel,
  getPrimaryCustomerLegalEntity,
  hasCustomerLegalEntityIdentity,
  parseCustomerLegalEntities,
  serializeCustomerLegalEntities,
} from "@/lib/customerLegalEntities";
import {
  areCompanyNamesEquivalent,
  buildCompanySearchVariants,
  normalizeCompanyNameLooseKey,
  scoreCompanyNameMatch,
} from "@/lib/companyNameSearch";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Building2, ExternalLink, FilterX, Loader2, MoreHorizontal, PlusCircle, Search, Trash2, Unlink, Users, X } from "lucide-react";
import { OWNERSHIP_OPTIONS, VAT_OPTIONS } from "@/features/quotes/quotes-page/config";
import { toast } from "sonner";

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
  legal_entities?: unknown;
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
  dropbox_client_path?: string | null;
  dropbox_brand_path?: string | null;
  dropbox_shared_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadRow = {
  id: string;
  team_id?: string | null;
  company_name?: string | null;
  legal_name?: string | null;
  ownership_type?: string | null;
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

type SearchVisibilityMatch = {
  id: string;
  label: string;
  entityType: "customer" | "lead";
  managerLabel: string;
};

type QuoteHistoryRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
};

type LinkedDesignTaskRow = {
  id: string;
  number?: string | null;
  title?: string | null;
  status?: string | null;
  subtitle?: string | null;
  created_at?: string | null;
};

type DropboxManageCreateClientResponse = {
  ok: boolean;
  clientPath?: string | null;
  clientSharedUrl?: string | null;
  sharedUrl?: string | null;
  error?: string | null;
};

type CustomerDropboxLink = {
  clientPath: string;
  clientSharedUrl: string;
};

type CustomerDropboxAction = "open" | "create" | "attach" | "detach";

function getCustomerDropboxStorageKey(teamId: string) {
  return `customers-dropbox-links:${teamId}`;
}

function readCustomerDropboxLinks(teamId: string): Record<string, CustomerDropboxLink> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getCustomerDropboxStorageKey(teamId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CustomerDropboxLink>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCustomerDropboxLinks(teamId: string, payload: Record<string, CustomerDropboxLink>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getCustomerDropboxStorageKey(teamId), JSON.stringify(payload));
  } catch {
    // ignore persistence issues
  }
}

function normalizeCustomerDropboxPath(path: string) {
  return path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

function buildCustomerDropboxClientPath(clientFolderName: string) {
  const normalizedFolderName = normalizeCustomerDropboxPath(clientFolderName);
  return `Tosho Team Folder/Замовники/${normalizedFolderName}`;
}

function buildCustomerDropboxBrandPath(clientPath: string) {
  return `${normalizeCustomerDropboxPath(clientPath)}/Бренд`;
}

function extractCustomerDropboxLinks(rows: CustomerRow[]) {
  const links: Record<string, CustomerDropboxLink> = {};
  rows.forEach((row) => {
    const clientPath = normalizeCustomerDropboxPath(row.dropbox_client_path ?? "");
    const sharedUrl = (row.dropbox_shared_url ?? "").trim();
    if (!row.id || !clientPath || !sharedUrl) return;
    links[row.id] = {
      clientPath,
      clientSharedUrl: sharedUrl,
    };
  });
  return links;
}

function isMissingCustomerDropboxColumnsError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message)
        : "";
  return /column/i.test(message) && /dropbox_(client_path|brand_path|shared_url)/i.test(message);
}

const EMPTY_CUSTOMER_CONTACT: CustomerContact = {
  name: "",
  position: "",
  phone: "",
  email: "",
  birthday: "",
};

const createInitialCustomerFormState = (manager = "", managerId = ""): CustomerFormState => ({
  name: "",
  manager,
  managerId,
  website: "",
  logoUrl: "",
  logoFile: null,
  logoUploadMode: "url",
  legalEntities: [createEmptyCustomerLegalEntity()],
  contacts: [{ ...EMPTY_CUSTOMER_CONTACT }],
  reminderDate: "",
  reminderTime: "",
  reminderComment: "",
  eventName: "",
  eventDate: "",
  eventComment: "",
  notes: "",
});

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

const getInitials = (value?: string | null) => {
  if (!value) return "?";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
};


const getErrorMessage = (error: unknown, fallback: string) => {
  const resolveRawMessage = () => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "object" && error !== null) {
      const record = error as Record<string, unknown>;
      if (typeof record.message === "string" && record.message) return record.message;
    }
    return fallback;
  };
  const message = resolveRawMessage();
  const normalized = message.toLowerCase();
  if (normalized.includes("quota has been exceeded") || normalized.includes("quota exceeded")) {
    return "Не вдалося зберегти локальний кеш сторінки. Оновіть сторінку або спробуйте ще раз трохи пізніше.";
  }
  return message;
};

const ALL_MANAGERS_FILTER = "__all__";
const CUSTOMERS_PAGE_SIZE = 50;
const CUSTOMERS_SEARCH_FETCH_PAGE_SIZE = 500;
const CUSTOMER_BASE_COLUMNS = [
  "id",
  "team_id",
  "name",
  "legal_name",
  "manager",
  "manager_user_id",
  "ownership_type",
  "vat_rate",
  "tax_id",
  "website",
  "iban",
  "logo_url",
  "legal_entities",
  "contact_name",
  "contact_position",
  "contact_phone",
  "contact_email",
  "contact_birthday",
  "contacts",
  "signatory_name",
  "signatory_position",
  "reminder_at",
  "reminder_comment",
  "event_name",
  "event_at",
  "event_comment",
  "notes",
  "created_at",
  "updated_at",
];
const CUSTOMER_DROPBOX_COLUMNS = [
  "dropbox_client_path",
  "dropbox_brand_path",
  "dropbox_shared_url",
];
const CUSTOMER_COLUMNS = [...CUSTOMER_BASE_COLUMNS, ...CUSTOMER_DROPBOX_COLUMNS].join(",");
const CUSTOMER_COLUMNS_LEGACY = CUSTOMER_BASE_COLUMNS.join(",");
const LEAD_COLUMNS = [
  "id",
  "team_id",
  "company_name",
  "legal_name",
  "ownership_type",
  "logo_url",
  "first_name",
  "last_name",
  "email",
  "phone_numbers",
  "source",
  "website",
  "manager",
  "manager_user_id",
  "iban",
  "signatory_name",
  "signatory_position",
  "reminder_at",
  "reminder_comment",
  "event_name",
  "event_at",
  "event_comment",
  "notes",
  "created_at",
  "updated_at",
].join(",");
const isManagerFilterMember = (member: Pick<WorkspaceMemberDisplayRow, "accessRole" | "jobRole">) =>
  isQuoteManagerJobRole(member.jobRole) ||
  (member.jobRole ?? "").trim().toLowerCase() === "seo" ||
  (member.accessRole ?? "").trim().toLowerCase() === "owner" ||
  (member.accessRole ?? "").trim().toLowerCase() === "admin";

const normalizeManagerKey = (value?: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const escapePostgrestTerm = (value: string) => value.replace(/[%_,]/g, (char) => `\\${char}`);

type CustomersPageCachePayload = {
  activeTab: "customers" | "leads";
  search: string;
  customerManagerFilter: string;
  leadManagerFilter: string;
  cachedAt?: number;
};

const toManagerKey = (value?: string | null) => normalizeManagerKey(value);

const normalizePartyMatch = (value?: string | null) =>
  normalizeCompanyNameLooseKey(value);

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
    const raw = sessionStorage.getItem(`customers-page-ui:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomersPageCachePayload;
    const activeTab = parsed.activeTab === "leads" ? "leads" : "customers";
    return {
      activeTab,
      search: typeof parsed.search === "string" ? parsed.search : "",
      customerManagerFilter:
        typeof parsed.customerManagerFilter === "string" ? parsed.customerManagerFilter : ALL_MANAGERS_FILTER,
      leadManagerFilter: typeof parsed.leadManagerFilter === "string" ? parsed.leadManagerFilter : ALL_MANAGERS_FILTER,
      cachedAt: Number(parsed.cachedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function writeCustomersPageCache(teamId: string, payload: CustomersPageCachePayload) {
  if (typeof window === "undefined" || !teamId) return;
  try {
    sessionStorage.setItem(`customers-page-ui:${teamId}`, JSON.stringify(payload));
  } catch {
    // ignore cache persistence failures to avoid breaking the page on storage quota limits
  }
}

function clearLegacyCustomersPageCache(teamId: string) {
  if (typeof window === "undefined" || !teamId) return;
  try {
    sessionStorage.removeItem(`customers-page-cache:${teamId}`);
  } catch {
    // ignore storage cleanup failures
  }
}

function CustomersPage({ teamId }: { teamId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [searchParams] = useSearchParams();
  const { session, userId, jobRole } = useAuth();
  const initialCache = readCustomersPageCache(teamId);
  const restoredCache = shouldRestorePageUiState(navigationType, initialCache?.cachedAt) ? initialCache : null;
  const [activeTab, setActiveTab] = useState<"customers" | "leads">(() => restoredCache?.activeTab ?? "customers");
  const [search, setSearch] = useState(() => restoredCache?.search ?? "");
  const [customerManagerFilter, setCustomerManagerFilter] = useState<string>(
    () => restoredCache?.customerManagerFilter ?? ALL_MANAGERS_FILTER
  );
  const [leadManagerFilter, setLeadManagerFilter] = useState<string>(
    () => restoredCache?.leadManagerFilter ?? ALL_MANAGERS_FILTER
  );
  const [defaultManagerFilterApplied, setDefaultManagerFilterApplied] = useState(false);
  const [crossManagerMatches, setCrossManagerMatches] = useState<SearchVisibilityMatch[]>([]);
  const [crossManagerMatchesLoading, setCrossManagerMatchesLoading] = useState(false);

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const customersFullFetchCompletedKeyRef = useRef<string | null>(null);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersRefreshing, setCustomersRefreshing] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [customersHasMore, setCustomersHasMore] = useState(false);

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const leadsFullFetchCompletedKeyRef = useRef<string | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsRefreshing, setLeadsRefreshing] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsHasMore, setLeadsHasMore] = useState(false);
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDisplayRow[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormState>(() => createInitialCustomerFormState());

  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadEditingId, setLeadEditingId] = useState<string | null>(null);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadFormError, setLeadFormError] = useState<string | null>(null);
  const [leadDeleteDialogOpen, setLeadDeleteDialogOpen] = useState(false);
  const [leadDeleteTarget, setLeadDeleteTarget] = useState<LeadRow | null>(null);
  const [leadDeleteBusy, setLeadDeleteBusy] = useState(false);
  const [leadDeleteError, setLeadDeleteError] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState<LeadFormState>({
    companyName: "",
    legalName: "",
    ownershipType: "",
    logoUrl: "",
    logoFile: null,
    logoUploadMode: "url",
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
  const customerDropboxColumnsAvailableRef = useRef<boolean | null>(null);
  const [customerDropboxLinks, setCustomerDropboxLinks] = useState<Record<string, CustomerDropboxLink>>(() =>
    readCustomerDropboxLinks(teamId)
  );
  const [dropboxActionState, setDropboxActionState] = useState<{
    customerId: string;
    action: CustomerDropboxAction;
  } | null>(null);
  const [attachDropboxDialogOpen, setAttachDropboxDialogOpen] = useState(false);
  const [attachDropboxTarget, setAttachDropboxTarget] = useState<{ customerId: string; clientName: string } | null>(null);
  const [attachDropboxPath, setAttachDropboxPath] = useState("");

  useEffect(() => {
    setCustomerDropboxLinks(readCustomerDropboxLinks(teamId));
  }, [teamId]);

  useEffect(() => {
    writeCustomerDropboxLinks(teamId, customerDropboxLinks);
  }, [customerDropboxLinks, teamId]);

  useEffect(() => {
    if (customerDropboxColumnsAvailableRef.current === false) return;
    setCustomerDropboxLinks((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        delete next[row.id];
      });
      return {
        ...next,
        ...extractCustomerDropboxLinks(rows),
      };
    });
  }, [rows]);

  const runCustomerSelect = useCallback(
    async <T extends { error: unknown | null }>(factory: (columns: string) => Promise<T>) => {
      if (customerDropboxColumnsAvailableRef.current !== false) {
        const fullResult = await factory(CUSTOMER_COLUMNS);
        if (!fullResult.error) {
          customerDropboxColumnsAvailableRef.current = true;
          return fullResult;
        }
        if (!isMissingCustomerDropboxColumnsError(fullResult.error)) {
          return fullResult;
        }
        customerDropboxColumnsAvailableRef.current = false;
      }

      return await factory(CUSTOMER_COLUMNS_LEGACY);
    },
    []
  );

  const syncCustomerDropboxLinkToDatabase = useCallback(
    async (customerId: string, link: CustomerDropboxLink | null) => {
      if (customerDropboxColumnsAvailableRef.current === false) return false;

      const updatePayload = link
        ? {
            dropbox_client_path: normalizeCustomerDropboxPath(link.clientPath),
            dropbox_brand_path: buildCustomerDropboxBrandPath(link.clientPath),
            dropbox_shared_url: link.clientSharedUrl.trim(),
          }
        : {
            dropbox_client_path: null,
            dropbox_brand_path: null,
            dropbox_shared_url: null,
          };

      const { error } = await supabase
        .schema("tosho")
        .from("customers")
        .update(updatePayload)
        .eq("id", customerId)
        .eq("team_id", teamId);

      if (error) {
        if (isMissingCustomerDropboxColumnsError(error)) {
          customerDropboxColumnsAvailableRef.current = false;
          return false;
        }
        throw error;
      }

      customerDropboxColumnsAvailableRef.current = true;
      setRows((current) =>
        current.map((row) =>
          row.id === customerId
            ? {
                ...row,
                ...updatePayload,
              }
            : row
        )
      );
      return true;
    },
    [teamId]
  );

  const persistCustomerDropboxLink = useCallback(
    async (customerId: string, link: CustomerDropboxLink) => {
      const previous = customerDropboxLinks[customerId];
      setCustomerDropboxLinks((prev) => ({
        ...prev,
        [customerId]: link,
      }));

      try {
        await syncCustomerDropboxLinkToDatabase(customerId, link);
      } catch (error) {
        setCustomerDropboxLinks((prev) => {
          const next = { ...prev };
          if (previous) next[customerId] = previous;
          else delete next[customerId];
          return next;
        });
        throw error;
      }
    },
    [customerDropboxLinks, syncCustomerDropboxLinkToDatabase]
  );

  const removeCustomerDropboxLink = useCallback(
    async (customerId: string) => {
      const previous = customerDropboxLinks[customerId];
      setCustomerDropboxLinks((prev) => {
        const next = { ...prev };
        delete next[customerId];
        return next;
      });

      try {
        await syncCustomerDropboxLinkToDatabase(customerId, null);
      } catch (error) {
        if (previous) {
          setCustomerDropboxLinks((prev) => ({
            ...prev,
            [customerId]: previous,
          }));
        }
        throw error;
      }
    },
    [customerDropboxLinks, syncCustomerDropboxLinkToDatabase]
  );

  const getConflictingCustomerDropboxLink = useCallback(
    (customerId: string, targetPath: string) => {
      const normalizedTarget = normalizeCustomerDropboxPath(targetPath).toLowerCase();
      return Object.entries(customerDropboxLinks).find(([linkedCustomerId, link]) => {
        if (linkedCustomerId === customerId) return false;
        return normalizeCustomerDropboxPath(link.clientPath).toLowerCase() === normalizedTarget;
      });
    },
    [customerDropboxLinks]
  );

  const ensureCustomerDropboxFolders = useCallback(async (clientName: string) => {
    const response = await fetch("/.netlify/functions/dropbox-manage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "create-client",
        clientName,
      }),
    });

    const payload = (await response.json().catch(() => null)) as DropboxManageCreateClientResponse | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "Не вдалося підготувати Dropbox-папки замовника.");
    }

    return payload;
  }, []);

  const inspectCustomerDropboxFolder = useCallback(async (clientPath: string) => {
    const response = await fetch(
      `/.netlify/functions/dropbox-manage?action=inspect&path=${encodeURIComponent(normalizeCustomerDropboxPath(clientPath))}`
    );
    const payload = (await response.json().catch(() => null)) as DropboxManageCreateClientResponse | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "Не вдалося отримати Dropbox-папку замовника.");
    }
    return payload;
  }, []);

  const openCustomerDropboxFolder = useCallback(async (customerId: string, clientName: string) => {
    const normalizedClientName = clientName.trim();
    if (!normalizedClientName || typeof window === "undefined") return;

    const linked = customerDropboxLinks[customerId];
    let targetUrl = linked?.clientSharedUrl ?? "";
    const fallbackPath = `Tosho Team Folder/Замовники/${normalizedClientName}`;

    try {
      if (!targetUrl) {
        const clientPath = linked?.clientPath || fallbackPath;
        const payload = await inspectCustomerDropboxFolder(clientPath);
        targetUrl = payload.sharedUrl || payload.clientSharedUrl || "";
        if (targetUrl && clientPath) {
          await persistCustomerDropboxLink(customerId, {
            clientPath,
            clientSharedUrl: targetUrl,
          });
        }
      }
    } catch (error) {
      if (!linked?.clientPath || normalizeCustomerDropboxPath(linked.clientPath) === normalizeCustomerDropboxPath(fallbackPath)) {
        throw error;
      }

      const payload = await inspectCustomerDropboxFolder(fallbackPath).catch(() => null);
      const fallbackUrl = payload?.sharedUrl || payload?.clientSharedUrl || "";
      if (!fallbackUrl) {
        throw new Error("Прив'язана Dropbox-папка недоступна. Переприв'яжіть її ще раз.");
      }

      await persistCustomerDropboxLink(customerId, {
        clientPath: fallbackPath,
        clientSharedUrl: fallbackUrl,
      });
      targetUrl = fallbackUrl;
    }

    if (!targetUrl) {
      throw new Error("Не вдалося отримати посилання на папку замовника.");
    }

    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [customerDropboxLinks, inspectCustomerDropboxFolder, persistCustomerDropboxLink]);

  const createCustomerDropboxFolder = useCallback(async (customerId: string, clientName: string) => {
    const normalizedClientName = clientName.trim();
    if (!normalizedClientName) return;
    const defaultPath = `Tosho Team Folder/Замовники/${normalizedClientName}`;
    const conflictingLink = getConflictingCustomerDropboxLink(customerId, defaultPath);
    if (conflictingLink) {
      const conflictingCustomer = rows.find((row) => row.id === conflictingLink[0]);
      throw new Error(
        `Ця Dropbox-папка вже прив'язана до ${conflictingCustomer?.name ?? conflictingCustomer?.legal_name ?? "іншого замовника"}.`
      );
    }

    try {
      const payload = await ensureCustomerDropboxFolders(normalizedClientName);
      if (payload.clientPath && payload.clientSharedUrl) {
        await persistCustomerDropboxLink(customerId, {
          clientPath: payload.clientPath,
          clientSharedUrl: payload.clientSharedUrl,
        });
      }
    } catch (error) {
      const inspected = await inspectCustomerDropboxFolder(defaultPath).catch(() => null);
      const fallbackUrl = inspected?.sharedUrl || inspected?.clientSharedUrl;
      if (inspected && fallbackUrl) {
        await persistCustomerDropboxLink(customerId, {
          clientPath: defaultPath,
          clientSharedUrl: fallbackUrl,
        });
        return;
      }
      throw error;
    }
  }, [ensureCustomerDropboxFolders, getConflictingCustomerDropboxLink, inspectCustomerDropboxFolder, persistCustomerDropboxLink, rows]);

  const attachCustomerDropboxFolder = useCallback(async (customerId: string, normalizedPath: string) => {
    const normalizedTargetPath = normalizeCustomerDropboxPath(normalizedPath);
    if (!normalizedTargetPath) return;

    const conflictingLink = getConflictingCustomerDropboxLink(customerId, normalizedTargetPath);
    if (conflictingLink) {
      const conflictingCustomer = rows.find((row) => row.id === conflictingLink[0]);
      throw new Error(
        `Ця Dropbox-папка вже прив'язана до ${conflictingCustomer?.name ?? conflictingCustomer?.legal_name ?? "іншого замовника"}.`
      );
    }

    const payload = await inspectCustomerDropboxFolder(normalizedTargetPath);
    const targetUrl = payload.sharedUrl || payload.clientSharedUrl;
    if (!targetUrl) {
      throw new Error("Не вдалося прив'язати Dropbox-папку.");
    }

    await persistCustomerDropboxLink(customerId, {
      clientPath: normalizedTargetPath,
      clientSharedUrl: targetUrl,
    });
  }, [getConflictingCustomerDropboxLink, inspectCustomerDropboxFolder, persistCustomerDropboxLink, rows]);

  const runCustomerDropboxAction = useCallback(
    async (
      customerId: string,
      action: CustomerDropboxAction,
      handler: () => Promise<void>,
      successMessage?: string
    ) => {
      setDropboxActionState({ customerId, action });
      try {
        await handler();
        if (successMessage) toast.success(successMessage);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Помилка Dropbox");
      } finally {
        setDropboxActionState((current) =>
          current?.customerId === customerId && current.action === action ? null : current
        );
      }
    },
    []
  );

  const detachCustomerDropboxFolder = useCallback(async (customerId: string) => {
    await removeCustomerDropboxLink(customerId);
  }, [removeCustomerDropboxLink]);

  const openAttachDropboxDialog = useCallback((customerId: string, clientName: string) => {
    const suggestedFolderName = clientName.trim();
    setAttachDropboxTarget({ customerId, clientName });
    setAttachDropboxPath(suggestedFolderName);
    setAttachDropboxDialogOpen(true);
  }, []);

  const submitAttachDropboxDialog = useCallback(async () => {
    if (!attachDropboxTarget) return;
    const normalizedFolderName = normalizeCustomerDropboxPath(attachDropboxPath);
    if (!normalizedFolderName) {
      toast.error("Вкажіть назву папки клієнта");
      return;
    }
    const normalizedPath = buildCustomerDropboxClientPath(normalizedFolderName);

    await runCustomerDropboxAction(
      attachDropboxTarget.customerId,
      "attach",
      async () => {
        await attachCustomerDropboxFolder(attachDropboxTarget.customerId, normalizedPath);
        setAttachDropboxDialogOpen(false);
        setAttachDropboxTarget(null);
        setAttachDropboxPath("");
      },
      "Папку Dropbox прив'язано"
    );
  }, [attachCustomerDropboxFolder, attachDropboxPath, attachDropboxTarget, runCustomerDropboxAction]);
  const [linkedQuotes, setLinkedQuotes] = useState<QuoteHistoryRow[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<QuoteHistoryRow[]>([]);
  const [linkedDesignTasks, setLinkedDesignTasks] = useState<LinkedDesignTaskRow[]>([]);
  const [linkedQuotesLoading, setLinkedQuotesLoading] = useState(false);
  const [handledDeepLink, setHandledDeepLink] = useState<string | null>(null);
  const previousPathnameRef = useRef(location.pathname);
  const rowsRef = useRef<CustomerRow[]>([]);
  const leadsRef = useRef<LeadRow[]>([]);

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
    const managerMembers = teamMembers.filter((member) => isManagerFilterMember(member));
    const filterSource = managerMembers.length > 0 ? managerMembers : teamMembers;
    return filterSource
      .map((member) => member.label)
      .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
  }, [teamMembers]);

  const leadManagerOptions = customerManagerOptions;
  const currentManagerLabel = useMemo(() => {
    const fromMember = userId ? memberById.get(userId)?.label?.trim() : "";
    if (fromMember) return fromMember;
    return defaultManagerName.trim();
  }, [defaultManagerName, memberById, userId]);
  const isManagerUser = useMemo(() => isQuoteManagerJobRole(jobRole), [jobRole]);
  const activeManagerFilter = activeTab === "customers" ? customerManagerFilter : leadManagerFilter;
  const hasActiveFilters = search.trim().length > 0 || (!isManagerUser && activeManagerFilter !== ALL_MANAGERS_FILTER);
  const clearFilters = useCallback(() => {
    setSearch("");
    if (!isManagerUser) {
      setCustomerManagerFilter(ALL_MANAGERS_FILTER);
      setLeadManagerFilter(ALL_MANAGERS_FILTER);
    }
  }, [isManagerUser]);
  const filteredRows = rows;

  const filteredLeads = leads;

  useEffect(() => {
    if (!isManagerUser || !userId || !teamId || !search.trim()) {
      setCrossManagerMatches([]);
      setCrossManagerMatchesLoading(false);
      return;
    }

    let cancelled = false;
    const loadCrossManagerMatches = async () => {
      setCrossManagerMatchesLoading(true);
      try {
        const [customerMatches, leadMatches] = await Promise.all([
          listCustomersBySearch(teamId, search),
          listLeadsBySearch(teamId, search).catch(() => []),
        ]);
        if (cancelled) return;

        const nextMatches = [
          ...customerMatches
            .filter((row) => (row.manager_user_id?.trim() ?? "") && row.manager_user_id?.trim() !== userId)
            .map((row) => ({
              id: row.id,
              label: row.name?.trim() || row.legal_name?.trim() || "Замовник без назви",
              entityType: "customer" as const,
              managerLabel: resolveManagerLabel(row.manager_user_id, row.manager) || "Не вказано",
              score: scoreCompanyNameMatch(search, [row.name ?? null, row.legal_name ?? null]),
            })),
          ...leadMatches
            .filter((row) => (row.manager_user_id?.trim() ?? "") && row.manager_user_id?.trim() !== userId)
            .map((row) => ({
              id: row.id,
              label:
                row.company_name?.trim() ||
                row.legal_name?.trim() ||
                [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(" ") ||
                "Лід без назви",
              entityType: "lead" as const,
              managerLabel: resolveManagerLabel(row.manager_user_id, row.manager) || "Не вказано",
              score: scoreCompanyNameMatch(search, [
                row.company_name ?? null,
                row.legal_name ?? null,
                [row.first_name, row.last_name].filter(Boolean).join(" "),
              ]),
            })),
        ]
          .filter((row) => row.score > 0)
          .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "uk"))
          .slice(0, 5)
          .map(({ score, ...row }) => row);

        setCrossManagerMatches(nextMatches);
      } catch {
        if (!cancelled) setCrossManagerMatches([]);
      } finally {
        if (!cancelled) setCrossManagerMatchesLoading(false);
      }
    };

    const timeoutId = window.setTimeout(loadCrossManagerMatches, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isManagerUser, resolveManagerLabel, search, teamId, userId]);

  const calculationQuotes = useMemo(
    () => linkedQuotes.filter((row) => (row.status ?? "").toLowerCase() !== "approved"),
    [linkedQuotes]
  );
  const orderQuotes = useMemo(() => linkedOrders, [linkedOrders]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

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

  const renderManagerFilterValue = useCallback(
    (value: string) => {
      if (value === ALL_MANAGERS_FILTER) return <span>Всі менеджери</span>;
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
    },
    [memberByLabel]
  );

  const getCustomerLegalEntities = (row: CustomerRow) => parseCustomerLegalEntities(row);
  const getCustomerPrimaryLegalEntity = (row: CustomerRow) => getCustomerLegalEntities(row)[0] ?? null;
  const getCustomerPrimaryLegalEntityType = (row: CustomerRow) => {
    const primary = getCustomerPrimaryLegalEntity(row);
    if (!primary || !hasCustomerLegalEntityIdentity(primary)) return null;
    return formatOwnershipTypeLabel(primary.ownershipType) || null;
  };
  const getCustomerPrimaryLegalEntityTypeDescription = (row: CustomerRow) => {
    const primary = getCustomerPrimaryLegalEntity(row);
    if (!primary || !hasCustomerLegalEntityIdentity(primary)) return null;
    const option = OWNERSHIP_OPTIONS.find((entry) => entry.value === (primary.ownershipType ?? "").trim().toLowerCase());
    return option?.description ?? null;
  };
  const renderPrimaryEntityLabel = (row: CustomerRow) => {
    const primary = getCustomerPrimaryLegalEntity(row);
    if (!primary) return "Не вказано";
    if (!hasCustomerLegalEntityIdentity(primary)) return "Реквізити не заповнені";
    return formatCustomerLegalEntityTitle(primary);
  };

  const resetForm = useCallback(() => {
    setForm(createInitialCustomerFormState(currentManagerLabel || defaultManagerName, userId ?? ""));
    setLinkedQuotes([]);
    setLinkedQuotesLoading(false);
    setFormError(null);
  }, [currentManagerLabel, defaultManagerName, userId]);

  const resetLeadForm = useCallback(() => {
    setLeadForm({
      companyName: "",
      legalName: "",
      ownershipType: "",
      logoUrl: "",
      logoFile: null,
      logoUploadMode: "url",
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
  }, [currentManagerLabel, defaultManagerName, userId]);

  const loadCustomerLinkedEntities = useCallback(async (customer: Pick<CustomerRow, "id" | "name" | "legal_name">) => {
    setLinkedQuotesLoading(true);
    try {
      const candidateNames = Array.from(
        new Set([customer.name ?? "", customer.legal_name ?? ""].map((value) => value.trim()).filter(Boolean))
      );
      const normalizedNames = new Set(candidateNames.map((value) => normalizePartyMatch(value)));
      const [quotesById, quotesByName, quotesByTitle] = await Promise.allSettled([
        listCustomerQuotes({ teamId, customerId: customer.id, limit: 100 }),
        candidateNames.length > 0
          ? supabase
              .schema("tosho")
              .from("quotes")
              .select("id,number,status,total,created_at,customer_id,customer_name,title")
              .eq("team_id", teamId)
              .in("customer_name", candidateNames)
              .order("created_at", { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
        candidateNames.length > 0
          ? supabase
              .schema("tosho")
              .from("quotes")
              .select("id,number,status,total,created_at,customer_id,customer_name,title")
              .eq("team_id", teamId)
              .in("title", candidateNames)
              .order("created_at", { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const quoteMap = new Map<string, QuoteHistoryRow>();
      if (quotesById.status === "fulfilled") {
        for (const row of quotesById.value as QuoteHistoryRow[]) quoteMap.set(row.id, row);
      }
      const mergeNamedQuotes = (rows: Array<{
        id: string;
        number?: string | null;
        status?: string | null;
        total?: number | null;
        created_at?: string | null;
        customer_id?: string | null;
        customer_name?: string | null;
        title?: string | null;
      }>) => {
        rows.forEach((row) => {
          if (
            row.customer_id === customer.id ||
            normalizedNames.has(normalizePartyMatch(row.customer_name ?? row.title ?? null))
          ) {
            quoteMap.set(row.id, row);
          }
        });
      };
      if (quotesByName.status === "fulfilled") {
        mergeNamedQuotes((((quotesByName.value.data ?? []) as unknown) as Array<{
          id: string;
          number?: string | null;
          status?: string | null;
          total?: number | null;
          created_at?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          title?: string | null;
        }>) ?? []);
      }
      if (quotesByTitle.status === "fulfilled") {
        mergeNamedQuotes((((quotesByTitle.value.data ?? []) as unknown) as Array<{
          id: string;
          number?: string | null;
          status?: string | null;
          total?: number | null;
          created_at?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          title?: string | null;
        }>) ?? []);
      }
      const rows = Array.from(quoteMap.values()).sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      setLinkedQuotes(rows as QuoteHistoryRow[]);
      const quoteIds = rows.map((row) => row.id).filter(Boolean);
      const [ordersResult, designTasksResult] = await Promise.allSettled([
        loadDerivedOrders(teamId, userId),
        supabase
          .from("activity_log")
          .select("id,title,created_at,status:metadata->>status,design_task_number:metadata->>design_task_number,design_task_type:metadata->>design_task_type,entity_id,customer_id:metadata->>customer_id,customer_name:metadata->>customer_name,quote_id:metadata->>quote_id")
          .eq("team_id", teamId)
          .eq("action", "design_task")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (ordersResult.status === "fulfilled") {
        setLinkedOrders(
          ordersResult.value
            .filter(
              (row) =>
                row.customerId === customer.id ||
                quoteIds.includes(row.quoteId) ||
                normalizedNames.has(normalizePartyMatch(row.customerName))
            )
            .map((row) => ({
              id: row.id,
              number: row.quoteNumber,
              status: row.orderStatus,
              total: row.total,
              created_at: row.createdAt,
            }))
        );
      } else {
        console.warn("Failed to load related customer orders", ordersResult.reason);
        setLinkedOrders([]);
      }
      if (designTasksResult.status === "fulfilled") {
        const taskRows = (((designTasksResult.value.data ?? []) as unknown) as Array<{
          id: string;
          title?: string | null;
          created_at?: string | null;
          status?: string | null;
          design_task_number?: string | null;
          design_task_type?: string | null;
          customer_id?: string | null;
          customer_name?: string | null;
          quote_id?: string | null;
          entity_id?: string | null;
        }>) ?? [];
        setLinkedDesignTasks(
          taskRows
            .filter((row) => {
              const linkedQuoteId = row.quote_id ?? row.entity_id ?? null;
              return (
                row.customer_id === customer.id ||
                (linkedQuoteId ? quoteIds.includes(linkedQuoteId) : false) ||
                normalizedNames.has(normalizePartyMatch(row.customer_name ?? null))
              );
            })
            .map((row) => ({
            id: row.id,
            number: row.design_task_number ?? null,
            title: row.title ?? "Дизайн-задача",
            status: row.status ?? "new",
            subtitle: row.design_task_type ? `Тип: ${row.design_task_type}` : null,
            created_at: row.created_at ?? null,
          }))
        );
      } else {
        console.warn("Failed to load related customer design tasks", designTasksResult.reason);
        setLinkedDesignTasks([]);
      }
    } catch {
      setLinkedQuotes([]);
      setLinkedOrders([]);
      setLinkedDesignTasks([]);
    } finally {
      setLinkedQuotesLoading(false);
    }
  }, [teamId, userId]);

  const loadLeadLinkedEntities = useCallback(async (lead: Pick<LeadRow, "company_name" | "legal_name">) => {
    const candidateNames = Array.from(
      new Set([lead.company_name ?? "", lead.legal_name ?? ""].map((value) => value.trim()).filter(Boolean))
    );
    const normalizedNames = new Set(candidateNames.map((value) => normalizePartyMatch(value)));
    setLinkedQuotesLoading(true);
    try {
      const quotesQuery = supabase
        .schema("tosho")
        .from("quotes")
        .select("id,number,status,total,created_at,customer_id,customer_name,title")
        .eq("team_id", teamId)
        .is("customer_id", null)
        .order("created_at", { ascending: false })
        .limit(200);
      const { data: rawQuotes, error: quotesError } = await quotesQuery;
      if (quotesError) throw quotesError;
      const quoteRows = (((rawQuotes ?? []) as unknown) as Array<{
        id: string;
        number?: string | null;
        status?: string | null;
        total?: number | null;
        created_at?: string | null;
        customer_name?: string | null;
        title?: string | null;
      }>) ?? [];
      const matchingQuotes = quoteRows.filter((row) =>
        normalizedNames.has(normalizePartyMatch(row.customer_name ?? row.title ?? null))
      );
      const quoteIds = matchingQuotes.map((row) => row.id).filter(Boolean);
      setLinkedQuotes(matchingQuotes as QuoteHistoryRow[]);
      const [ordersResult, designTasksResult] = await Promise.allSettled([
        loadDerivedOrders(teamId, userId),
        supabase
          .from("activity_log")
          .select("id,title,created_at,status:metadata->>status,design_task_number:metadata->>design_task_number,design_task_type:metadata->>design_task_type,entity_id,customer_name:metadata->>customer_name,quote_id:metadata->>quote_id")
          .eq("team_id", teamId)
          .eq("action", "design_task")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (ordersResult.status === "fulfilled") {
        setLinkedOrders(
          ordersResult.value
            .filter(
              (row) =>
                quoteIds.includes(row.quoteId) ||
                normalizedNames.has(normalizePartyMatch(row.customerName))
            )
            .map((row) => ({
              id: row.id,
              number: row.quoteNumber,
              status: row.orderStatus,
              total: row.total,
              created_at: row.createdAt,
            }))
        );
      } else {
        console.warn("Failed to load related lead orders", ordersResult.reason);
        setLinkedOrders([]);
      }
      if (designTasksResult.status === "fulfilled") {
        const taskRows = (((designTasksResult.value.data ?? []) as unknown) as Array<{
          id: string;
          title?: string | null;
          created_at?: string | null;
          status?: string | null;
          design_task_number?: string | null;
          design_task_type?: string | null;
          customer_name?: string | null;
          quote_id?: string | null;
          entity_id?: string | null;
        }>) ?? [];
        setLinkedDesignTasks(
          taskRows
            .filter((row) => {
              const linkedQuoteId = row.quote_id ?? row.entity_id ?? null;
              return (
                (linkedQuoteId ? quoteIds.includes(linkedQuoteId) : false) ||
                normalizedNames.has(normalizePartyMatch(row.customer_name ?? null))
              );
            })
            .map((row) => ({
            id: row.id,
            number: row.design_task_number ?? null,
            title: row.title ?? "Дизайн-задача",
            status: row.status ?? "new",
            subtitle: row.design_task_type ? `Тип: ${row.design_task_type}` : null,
            created_at: row.created_at ?? null,
          }))
        );
      } else {
        console.warn("Failed to load related lead design tasks", designTasksResult.reason);
        setLinkedDesignTasks([]);
      }
    } catch {
      setLinkedQuotes([]);
      setLinkedOrders([]);
      setLinkedDesignTasks([]);
    } finally {
      setLinkedQuotesLoading(false);
    }
  }, [teamId, userId]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    resetForm();
    setDialogOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((row: CustomerRow) => {
    const contacts = parseCustomerContacts(row);
    setEditingId(row.id);
    setForm({
      name: row.name ?? "",
      manager: resolveManagerLabel(row.manager_user_id, row.manager),
      managerId: row.manager_user_id ?? "",
      website: row.website ?? "",
      logoUrl: normalizeCustomerLogoUrl(row.logo_url) ?? "",
      logoFile: null,
      logoUploadMode: "url",
      legalEntities: parseCustomerLegalEntities(row),
      contacts,
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
    void loadCustomerLinkedEntities({ id: row.id, name: row.name, legal_name: row.legal_name });
  }, [loadCustomerLinkedEntities, resolveManagerLabel]);

  const openDelete = (row: CustomerRow) => {
    setDeleteTarget(row);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const openCreateLead = useCallback(() => {
    setLeadEditingId(null);
    resetLeadForm();
    setLeadDialogOpen(true);
  }, [resetLeadForm]);

  const openEditLead = useCallback((lead: LeadRow) => {
    setLeadEditingId(lead.id);
    setLeadForm({
      companyName: lead.company_name ?? "",
      legalName: lead.legal_name ?? "",
      ownershipType: lead.ownership_type ?? "",
      logoUrl: normalizeCustomerLogoUrl(lead.logo_url) ?? "",
      logoFile: null,
      logoUploadMode: "url",
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
    void loadLeadLinkedEntities({ company_name: lead.company_name, legal_name: lead.legal_name });
  }, [currentManagerLabel, defaultManagerName, loadLeadLinkedEntities, resolveManagerLabel]);

  const openDeleteLead = (lead: LeadRow) => {
    setLeadDeleteTarget(lead);
    setLeadDeleteError(null);
    setLeadDeleteDialogOpen(true);
  };

  const fetchCustomerById = useCallback(
    async (customerId: string) => {
      const { data, error } = await runCustomerSelect(async (columns) =>
        await supabase
          .schema("tosho")
          .from("customers")
          .select(columns)
          .eq("team_id", teamId)
          .eq("id", customerId)
          .maybeSingle<CustomerRow>()
      );
      if (error) throw error;
      return data ?? null;
    },
    [runCustomerSelect, teamId]
  );

  const fetchCustomerByName = useCallback(
    async (customerName: string) => {
      const matches = await listCustomersBySearch(teamId, customerName);
      const matchedCustomer =
        matches.find((row) => areCompanyNamesEquivalent(row.name ?? row.legal_name ?? null, customerName)) ?? matches[0] ?? null;
      if (!matchedCustomer?.id) return null;
      return await fetchCustomerById(matchedCustomer.id);
    },
    [fetchCustomerById, teamId]
  );

  const fetchLeadById = useCallback(
    async (leadId: string) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("leads")
        .select(LEAD_COLUMNS)
        .eq("team_id", teamId)
        .eq("id", leadId)
        .maybeSingle<LeadRow>();
      if (error) throw error;
      return data ?? null;
    },
    [teamId]
  );

  const fetchLeadByName = useCallback(
    async (leadName: string) => {
      const matches = await listLeadsBySearch(teamId, leadName);
      const matchedLead =
        matches.find((row) => areCompanyNamesEquivalent(row.company_name ?? row.legal_name ?? null, leadName)) ?? matches[0] ?? null;
      if (!matchedLead?.id) return null;
      return await fetchLeadById(matchedLead.id);
    },
    [fetchLeadById, teamId]
  );

  const loadCustomers = useCallback(async (options?: { append?: boolean; fetchAll?: boolean; fullFetchKey?: string }) => {
    const append = !!options?.append;
    const fetchAll = !!options?.fetchAll && !append;
    if (fetchAll && options?.fullFetchKey && customersFullFetchCompletedKeyRef.current === options.fullFetchKey) {
      return;
    }
    const offset = append ? rowsRef.current.length : 0;
    if (append || rowsRef.current.length > 0) {
      setCustomersRefreshing(true);
    } else {
      setCustomersLoading(true);
    }
    setCustomersError(null);
    try {
      const buildCustomersQuery = (columns: string, searchTerm?: string | null) => {
        let query = supabase
          .schema("tosho")
          .from("customers")
          .select(columns, { count: "exact" })
          .eq("team_id", teamId)
          .order("name", { ascending: true });

        if (isManagerUser && userId) {
          query = query.eq("manager_user_id", userId);
        } else if (customerManagerFilter !== ALL_MANAGERS_FILTER) {
          const selectedManager = memberByLabel.get(customerManagerFilter);
          if (selectedManager?.userId) {
            query = query.or(`manager_user_id.eq.${selectedManager.userId},manager.eq.${customerManagerFilter}`);
          } else {
            query = query.eq("manager", customerManagerFilter);
          }
        }

        const normalizedSearch = searchTerm?.trim() ?? "";
        if (normalizedSearch) {
          const escaped = escapePostgrestTerm(normalizedSearch);
          query = query.or(
            `name.ilike.%${escaped}%,legal_name.ilike.%${escaped}%,manager.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,contact_phone.ilike.%${escaped}%,contact_email.ilike.%${escaped}%,website.ilike.%${escaped}%,tax_id.ilike.%${escaped}%`
          );
        }

        return query;
      };

      const nextRows: CustomerRow[] = [];
      let nextOffset = offset;
      let totalCount: number | null = null;
      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        const pageSize = fetchAll ? CUSTOMERS_SEARCH_FETCH_PAGE_SIZE : CUSTOMERS_PAGE_SIZE;
        const variants = buildCompanySearchVariants(normalizedSearch);
        const responses = await Promise.all(
          variants.map(async (term) => {
            const { data, error: loadError } = await runCustomerSelect(async (columns) =>
              await buildCustomersQuery(columns, term).range(0, pageSize - 1)
            );
            if (loadError) throw loadError;
            return ((data as unknown) as CustomerRow[]) ?? [];
          })
        );

        const deduped = new Map<string, CustomerRow>();
        responses.flat().forEach((row) => {
          if (!deduped.has(row.id)) deduped.set(row.id, row);
        });

        const rankedRows = Array.from(deduped.values())
          .map((row) => ({
            row,
            score: Math.max(
              scoreCompanyNameMatch(normalizedSearch, [row.name ?? null, row.legal_name ?? null]),
              scoreCompanyNameMatch(normalizedSearch, [
                row.manager ?? null,
                row.contact_name ?? null,
                row.contact_phone ?? null,
                row.contact_email ?? null,
                row.website ?? null,
                row.tax_id ?? null,
              ])
            ),
          }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score || (left.row.name ?? "").localeCompare(right.row.name ?? "", "uk"))
          .map((entry) => entry.row);

        setCustomersTotal(rankedRows.length);
        setCustomersHasMore(false);
        if (!append) {
          customersFullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
        }
        setRows(rankedRows);
        return;
      }

      while (true) {
        const pageSize = fetchAll ? CUSTOMERS_SEARCH_FETCH_PAGE_SIZE : CUSTOMERS_PAGE_SIZE;
        const { data, error: loadError, count } = await runCustomerSelect(async (columns) =>
          await buildCustomersQuery(columns).range(nextOffset, nextOffset + pageSize - 1)
        );
        if (loadError) throw loadError;
        const pageRows = ((data as unknown) as CustomerRow[]) ?? [];
        nextRows.push(...pageRows);
        totalCount = count ?? totalCount;
        if (!fetchAll || pageRows.length < pageSize) break;
        nextOffset += pageSize;
      }

      setCustomersTotal(totalCount ?? nextRows.length);
      setCustomersHasMore(fetchAll ? false : offset + nextRows.length < (totalCount ?? nextRows.length));
      if (!append) {
        customersFullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
      }
      setRows((current) => (append ? [...current, ...nextRows.filter((row) => !current.some((item) => item.id === row.id))] : nextRows));
    } catch (err: unknown) {
      setCustomersError(getErrorMessage(err, "Не вдалося завантажити замовників."));
      if (!append) {
        setRows([]);
        setCustomersTotal(0);
        setCustomersHasMore(false);
      }
    } finally {
      setCustomersLoading(false);
      setCustomersRefreshing(false);
    }
  }, [customerManagerFilter, isManagerUser, memberByLabel, runCustomerSelect, search, teamId, userId]);

  const loadLeads = useCallback(async (options?: { append?: boolean; fetchAll?: boolean; fullFetchKey?: string }) => {
    const append = !!options?.append;
    const fetchAll = !!options?.fetchAll && !append;
    if (fetchAll && options?.fullFetchKey && leadsFullFetchCompletedKeyRef.current === options.fullFetchKey) {
      return;
    }
    const offset = append ? leadsRef.current.length : 0;
    if (append || leadsRef.current.length > 0) {
      setLeadsRefreshing(true);
    } else {
      setLeadsLoading(true);
    }
    setLeadsError(null);
    try {
      const runLoadLeads = async (
        variant: "full" | "no_ownership",
        rangeOffset: number,
        pageSize: number,
        searchTerm?: string | null
      ) => {
        let query = supabase
          .schema("tosho")
          .from("leads")
          .select(variant === "full" ? LEAD_COLUMNS : LEAD_COLUMNS.replace("ownership_type,", ""), { count: "exact" })
          .eq("team_id", teamId)
          .order("company_name", { ascending: true });

        if (isManagerUser && userId) {
          query = query.eq("manager_user_id", userId);
        } else if (leadManagerFilter !== ALL_MANAGERS_FILTER) {
          const selectedManager = memberByLabel.get(leadManagerFilter);
          if (selectedManager?.userId) {
            query = query.or(`manager_user_id.eq.${selectedManager.userId},manager.eq.${leadManagerFilter}`);
          } else {
            query = query.eq("manager", leadManagerFilter);
          }
        }

        const normalizedSearch = searchTerm?.trim() ?? "";
        if (normalizedSearch) {
          const escaped = escapePostgrestTerm(normalizedSearch);
          query = query.or(
            `company_name.ilike.%${escaped}%,legal_name.ilike.%${escaped}%,first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%,source.ilike.%${escaped}%,manager.ilike.%${escaped}%,website.ilike.%${escaped}%`
          );
        }

        return await query.range(rangeOffset, rangeOffset + pageSize - 1);
      };

      const nextLeads: LeadRow[] = [];
      let nextOffset = offset;
      let totalCount: number | null = null;
      let variant: "full" | "no_ownership" = "full";
      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        const pageSize = fetchAll ? CUSTOMERS_SEARCH_FETCH_PAGE_SIZE : CUSTOMERS_PAGE_SIZE;
        const variants = buildCompanySearchVariants(normalizedSearch);
        const responses = await Promise.all(
          variants.map(async (term) => {
            let activeVariant: "full" | "no_ownership" = "full";
            let { data, error: loadError } = await runLoadLeads(activeVariant, 0, pageSize, term);
            if (
              loadError &&
              activeVariant === "full" &&
              /column/i.test(loadError.message ?? "") &&
              /ownership_type/i.test(loadError.message ?? "")
            ) {
              activeVariant = "no_ownership";
              ({ data, error: loadError } = await runLoadLeads(activeVariant, 0, pageSize, term));
            }
            if (loadError) throw loadError;
            return ((data as unknown) as LeadRow[]) ?? [];
          })
        );

        const deduped = new Map<string, LeadRow>();
        responses.flat().forEach((row) => {
          if (!deduped.has(row.id)) deduped.set(row.id, row);
        });

        const rankedLeads = Array.from(deduped.values())
          .map((row) => ({
            row,
            score: Math.max(
              scoreCompanyNameMatch(normalizedSearch, [
                row.company_name ?? null,
                row.legal_name ?? null,
                [row.first_name, row.last_name].filter(Boolean).join(" "),
              ]),
              scoreCompanyNameMatch(normalizedSearch, [
                row.email ?? null,
                row.source ?? null,
                row.manager ?? null,
                row.website ?? null,
              ])
            ),
          }))
          .filter((entry) => entry.score > 0)
          .sort(
            (left, right) =>
              right.score - left.score || (left.row.company_name ?? "").localeCompare(right.row.company_name ?? "", "uk")
          )
          .map((entry) => entry.row);

        setLeadsTotal(rankedLeads.length);
        setLeadsHasMore(false);
        if (!append) {
          leadsFullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
        }
        setLeads(rankedLeads);
        return;
      }

      while (true) {
        const pageSize = fetchAll ? CUSTOMERS_SEARCH_FETCH_PAGE_SIZE : CUSTOMERS_PAGE_SIZE;
        let { data, error: loadError, count } = await runLoadLeads(variant, nextOffset, pageSize);
        if (
          loadError &&
          variant === "full" &&
          /column/i.test(loadError.message ?? "") &&
          /ownership_type/i.test(loadError.message ?? "")
        ) {
          variant = "no_ownership";
          ({ data, error: loadError, count } = await runLoadLeads(variant, nextOffset, pageSize));
        }
        if (loadError) throw loadError;
        const pageRows = ((data as unknown) as LeadRow[]) ?? [];
        nextLeads.push(...pageRows);
        totalCount = count ?? totalCount;
        if (!fetchAll || pageRows.length < pageSize) break;
        nextOffset += pageSize;
      }

      setLeadsTotal(totalCount ?? nextLeads.length);
      setLeadsHasMore(fetchAll ? false : offset + nextLeads.length < (totalCount ?? nextLeads.length));
      if (!append) {
        leadsFullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
      }
      setLeads((current) => (append ? [...current, ...nextLeads.filter((lead) => !current.some((item) => item.id === lead.id))] : nextLeads));
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Не вдалося завантажити ліди.");
      if (message.includes("relation") && message.includes("leads")) {
        setLeadsError("Таблиця lead ще не створена. Запустіть SQL-скрипт scripts/leads-schema.sql.");
      } else {
        setLeadsError(message);
      }
      if (!append) {
        setLeads([]);
        setLeadsTotal(0);
        setLeadsHasMore(false);
      }
    } finally {
      setLeadsLoading(false);
      setLeadsRefreshing(false);
    }
  }, [isManagerUser, leadManagerFilter, memberByLabel, search, teamId, userId]);

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

  const handleLoadMoreCustomers = useCallback(() => {
    if (customersLoading || customersRefreshing || !customersHasMore) return;
    void loadCustomers({ append: true });
  }, [customersHasMore, customersLoading, customersRefreshing, loadCustomers]);

  const handleLoadMoreLeads = useCallback(() => {
    if (leadsLoading || leadsRefreshing || !leadsHasMore) return;
    void loadLeads({ append: true });
  }, [leadsHasMore, leadsLoading, leadsRefreshing, loadLeads]);

  useEffect(() => {
    writeCustomersPageCache(teamId, {
      activeTab,
      search,
      customerManagerFilter,
      leadManagerFilter,
      cachedAt: Date.now(),
    } satisfies CustomersPageCachePayload);
  }, [activeTab, customerManagerFilter, leadManagerFilter, search, teamId]);

  useEffect(() => {
    clearLegacyCustomersPageCache(teamId);
  }, [teamId]);

  useEffect(() => {
    void loadTeamMembers();
  }, [teamId, userId]);

  useEffect(() => {
    const delay = search.trim() ? 250 : 0;
    const timeoutId = window.setTimeout(() => {
      void loadCustomers();
      void loadLeads();
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [customerManagerFilter, leadManagerFilter, loadCustomers, loadLeads, search]);

  useEffect(() => {
    if (!search.trim()) return;
    if (activeTab === "customers") {
      if (customersLoading || customersRefreshing) return;
      if (!customersHasMore && rows.length < CUSTOMERS_PAGE_SIZE) return;
      void loadCustomers({
        fetchAll: true,
        fullFetchKey: `search:customers:${teamId}:${search.trim().toLowerCase()}:${customerManagerFilter}`,
      });
      return;
    }

    if (leadsLoading || leadsRefreshing) return;
    if (!leadsHasMore && leads.length < CUSTOMERS_PAGE_SIZE) return;
    void loadLeads({
      fetchAll: true,
      fullFetchKey: `search:leads:${teamId}:${search.trim().toLowerCase()}:${leadManagerFilter}`,
    });
  }, [
    activeTab,
    customersHasMore,
    customersLoading,
    customersRefreshing,
    leads.length,
    leadsHasMore,
    leadsLoading,
    leadsRefreshing,
    loadCustomers,
    loadLeads,
    rows.length,
    search,
  ]);

  useEffect(() => {
    const activeManagerFilter =
      activeTab === "customers" ? customerManagerFilter : leadManagerFilter;
    if (activeManagerFilter === ALL_MANAGERS_FILTER) return;

    if (activeTab === "customers") {
      if (customersLoading || customersRefreshing) return;
      if (!customersHasMore && rows.length < CUSTOMERS_PAGE_SIZE) return;
      void loadCustomers({
        fetchAll: true,
        fullFetchKey: `manager:customers:${teamId}:${customerManagerFilter}`,
      });
      return;
    }

    if (leadsLoading || leadsRefreshing) return;
    if (!leadsHasMore && leads.length < CUSTOMERS_PAGE_SIZE) return;
    void loadLeads({
      fetchAll: true,
      fullFetchKey: `manager:leads:${teamId}:${leadManagerFilter}`,
    });
  }, [
    activeTab,
    customerManagerFilter,
    customersHasMore,
    customersLoading,
    customersRefreshing,
    leadManagerFilter,
    leads.length,
    leadsHasMore,
    leadsLoading,
    leadsRefreshing,
    loadCustomers,
    loadLeads,
    rows.length,
  ]);

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

  useEffect(() => {
    const customerId = searchParams.get("customerId")?.trim() ?? "";
    const leadId = searchParams.get("leadId")?.trim() ?? "";
    const customerName = searchParams.get("customerName")?.trim() ?? "";
    const leadName = searchParams.get("leadName")?.trim() ?? "";
    const tab = searchParams.get("tab")?.trim() ?? "";
    const linkKey = searchParams.toString();
    if (!customerId && !leadId && !customerName && !leadName) {
      if (handledDeepLink !== null) setHandledDeepLink(null);
      return;
    }
    if (handledDeepLink === linkKey) return;
    let cancelled = false;

    const openDeepLinkedEntity = async () => {
      if (leadId) {
        setActiveTab("leads");
        const localLead = leads.find((row) => row.id === leadId);
        const lead = localLead ?? (await fetchLeadById(leadId));
        if (!lead || cancelled) return;
        openEditLead(lead);
        setHandledDeepLink(linkKey);
        return;
      }

      if (leadName) {
        setActiveTab("leads");
        const normalizedLeadName = normalizePartyMatch(leadName);
        const localLead = leads.find((row) =>
          [row.company_name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedLeadName)
        );
        const lead = localLead ?? (await fetchLeadByName(leadName));
        if (!lead || cancelled) return;
        openEditLead(lead);
        setHandledDeepLink(linkKey);
        return;
      }

      if (customerId) {
        if (tab === "customers" || !tab) setActiveTab("customers");
        const localCustomer = rows.find((row) => row.id === customerId);
        const customer = localCustomer ?? (await fetchCustomerById(customerId));
        if (!customer || cancelled) return;
        openEdit(customer);
        setHandledDeepLink(linkKey);
        return;
      }

      if (customerName) {
        setActiveTab("customers");
        const normalizedCustomerName = normalizePartyMatch(customerName);
        const localCustomer = rows.find((row) =>
          [row.name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedCustomerName)
        );
        const customer = localCustomer ?? (await fetchCustomerByName(customerName));
        if (!customer || cancelled) return;
        openEdit(customer);
        setHandledDeepLink(linkKey);
      }
    };

    void openDeepLinkedEntity();

    return () => {
      cancelled = true;
    };
  }, [
    fetchCustomerById,
    fetchCustomerByName,
    fetchLeadById,
    fetchLeadByName,
    handledDeepLink,
    leads,
    openEdit,
    openEditLead,
    rows,
    searchParams,
  ]);

  useEffect(() => {
    if (previousPathnameRef.current === location.pathname) {
      return;
    }

    previousPathnameRef.current = location.pathname;
    setDialogOpen(false);
    setLeadDialogOpen(false);
    setDeleteDialogOpen(false);
    setLeadDeleteDialogOpen(false);

    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
      document.body.removeAttribute("data-scroll-locked");
    }
  }, [location.pathname]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Вкажіть назву компанії.");
      return;
    }

    const normalizedLogoUrl = normalizeCustomerLogoUrl(form.logoUrl);
    if (form.logoUploadMode === "url" && form.logoUrl.trim() && !normalizedLogoUrl) {
      setFormError("Вкажіть звичайний URL логотипа. `data:image/...;base64,...` більше не підтримується.");
      return;
    }

    setSaving(true);
    setFormError(null);

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

    if (!editingId && !contacts.some((contact) => contact.phone)) {
      setSaving(false);
      setFormError("Для замовника обовʼязково вкажіть мобільний номер телефону.");
      return;
    }

    if (!editingId && !contacts.some((contact) => contact.email)) {
      setSaving(false);
      setFormError("Для замовника обовʼязково вкажіть email.");
      return;
    }

    const primaryContact = contacts[0] ?? null;
    const legalEntities = serializeCustomerLegalEntities(form.legalEntities);
    const primaryLegalEntity = getPrimaryCustomerLegalEntity(form.legalEntities);
    let optimizedLogoUrl: string | null = null;
    const previousLogoUrl =
      editingId ? rows.find((row) => row.id === editingId)?.logo_url ?? null : null;

    try {
      if (form.logoUploadMode === "file" && form.logoFile) {
        const optimized = await ingestCustomerLogoFromFile({
          teamId,
          file: form.logoFile,
          entityType: "customer",
          entityId: editingId,
          preferredName: form.name.trim(),
        });
        optimizedLogoUrl = optimized.logoUrl;
      } else if (normalizedLogoUrl) {
        const optimized = await ingestCustomerLogoFromUrl({
          teamId,
          sourceUrl: normalizedLogoUrl,
          entityType: "customer",
          entityId: editingId,
          preferredName: form.name.trim(),
        });
        optimizedLogoUrl = optimized.logoUrl;
      } else {
        optimizedLogoUrl = null;
      }
    } catch (error: unknown) {
      setSaving(false);
      setFormError(getCustomerLogoImportErrorMessage(error, "логотип"));
      return;
    }

    const payload: Record<string, unknown> = {
      team_id: teamId,
      name: form.name.trim(),
      legal_name: primaryLegalEntity?.legal_name ?? null,
      manager: editingId
        ? (selectedManagerLabel || null)
        : (selectedManagerLabel || currentManagerLabel || defaultManagerName || null),
      manager_user_id: form.managerId || null,
      ownership_type: primaryLegalEntity?.ownership_type ?? null,
      vat_rate: primaryLegalEntity?.vat_rate ?? null,
      tax_id: primaryLegalEntity?.tax_id ?? null,
      website: form.website.trim() || null,
      iban: primaryLegalEntity?.iban ?? null,
      logo_url: optimizedLogoUrl,
      legal_entities: legalEntities.length > 0 ? legalEntities : null,
      contacts: contacts.length > 0 ? contacts : null,
      contact_name: primaryContact?.name || null,
      contact_position: primaryContact?.position || null,
      contact_phone: primaryContact?.phone || null,
      contact_email: primaryContact?.email || null,
      contact_birthday: primaryContact?.birthday || null,
      signatory_name: primaryLegalEntity?.signatory_name ?? null,
      signatory_position: primaryLegalEntity?.signatory_position ?? null,
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
      legal_name: primaryLegalEntity?.legal_name ?? null,
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
      delete clone.legal_entities;
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

      if (editingId && previousLogoUrl && previousLogoUrl !== optimizedLogoUrl) {
        void removeManagedCustomerLogoByUrl(previousLogoUrl);
      }

      setDialogOpen(false);
      resetForm();
      await loadCustomers();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      }
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

    const normalizedLogoUrl = normalizeCustomerLogoUrl(leadForm.logoUrl);
    if (leadForm.logoUploadMode === "url" && leadForm.logoUrl.trim() && !normalizedLogoUrl) {
      setLeadFormError("Вкажіть звичайний URL логотипа. `data:image/...;base64,...` більше не підтримується.");
      return;
    }

    const phones = leadForm.phones.map((phone) => phone.trim()).filter(Boolean);
    if (phones.length === 0) {
      setLeadFormError("Вкажіть хоча б один номер телефону.");
      return;
    }

    setLeadSaving(true);
    setLeadFormError(null);

    let optimizedLogoUrl: string | null = null;
    const previousLogoUrl =
      leadEditingId ? leads.find((lead) => lead.id === leadEditingId)?.logo_url ?? null : null;

    try {
      if (leadForm.logoUploadMode === "file" && leadForm.logoFile) {
        const optimized = await ingestCustomerLogoFromFile({
          teamId,
          file: leadForm.logoFile,
          entityType: "lead",
          entityId: leadEditingId,
          preferredName: leadForm.companyName.trim(),
        });
        optimizedLogoUrl = optimized.logoUrl;
      } else if (normalizedLogoUrl) {
        const optimized = await ingestCustomerLogoFromUrl({
          teamId,
          sourceUrl: normalizedLogoUrl,
          entityType: "lead",
          entityId: leadEditingId,
          preferredName: leadForm.companyName.trim(),
        });
        optimizedLogoUrl = optimized.logoUrl;
      } else {
        optimizedLogoUrl = null;
      }
    } catch (error: unknown) {
      setLeadSaving(false);
      setLeadFormError(getCustomerLogoImportErrorMessage(error, "логотип"));
      return;
    }

    const managerValue = leadForm.manager.trim();
    const selectedManagerLabel = leadForm.managerId
      ? memberById.get(leadForm.managerId)?.label ?? managerValue
      : managerValue;
    const payload: Record<string, unknown> = {
      team_id: teamId,
      company_name: leadForm.companyName.trim(),
      legal_name: leadForm.legalName.trim() || null,
      ownership_type: leadForm.ownershipType || null,
      logo_url: optimizedLogoUrl,
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
          } else if (message.includes("column") && message.includes("ownership_type")) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.ownership_type;
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
          } else if (message.includes("column") && message.includes("ownership_type")) {
            const fallbackPayload = { ...payload };
            delete fallbackPayload.ownership_type;
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

      if (leadEditingId && previousLogoUrl && previousLogoUrl !== optimizedLogoUrl) {
        void removeManagedCustomerLogoByUrl(previousLogoUrl);
      }

      setLeadDialogOpen(false);
      resetLeadForm();
      await loadLeads();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      }
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      }
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("design:customers-updated", { detail: { teamId } }));
      }
    } catch (err: unknown) {
      setLeadDeleteError(getErrorMessage(err, "Не вдалося видалити ліда."));
    } finally {
      setLeadDeleteBusy(false);
    }
  };

  const customersHeaderActions = useMemo(() => (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex bg-muted/40 p-1 rounded-xl w-full lg:w-auto border border-border/50 shadow-inner">
          <button
            aria-pressed={activeTab === "customers"}
            onClick={() => setActiveTab("customers")}
            className={cn(
              "relative flex flex-1 lg:flex-none items-center justify-center gap-2 h-9 px-5 rounded-lg text-sm font-medium transition-all duration-200 ease-out",
              activeTab === "customers" 
                ? "bg-background text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Building2 className="h-4 w-4" />
            Замовники
            <span className={cn(
              "ml-1.5 rounded-md px-2 py-0.5 text-[10px] tabular-nums font-semibold", 
              activeTab === "customers" ? "bg-muted text-foreground" : "bg-muted-foreground/10 text-muted-foreground"
            )}>
              {customersTotal}
            </span>
          </button>
          <button
            aria-pressed={activeTab === "leads"}
            onClick={() => setActiveTab("leads")}
            className={cn(
              "relative flex flex-1 lg:flex-none items-center justify-center gap-2 h-9 px-5 rounded-lg text-sm font-medium transition-all duration-200 ease-out",
              activeTab === "leads" 
                ? "bg-background text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10" 
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Users className="h-4 w-4" />
            Ліди
            <span className={cn(
              "ml-1.5 rounded-md px-2 py-0.5 text-[10px] tabular-nums font-semibold", 
              activeTab === "leads" ? "bg-muted text-foreground" : "bg-muted-foreground/10 text-muted-foreground"
            )}>
              {leadsTotal}
            </span>
          </button>
        </div>
        <Button
          onClick={activeTab === "customers" ? openCreate : openCreateLead}
          className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
        >
          <PlusCircle className="h-4 w-4" />
          {activeTab === "customers" ? "Новий замовник" : "Новий лід"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "customers" ? "Пошук замовника..." : "Пошук ліда..."}
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
        {isManagerUser ? (
          <div
            className={cn(
              TOOLBAR_CONTROL,
              "flex w-full min-w-0 items-center gap-2 cursor-default opacity-100 sm:w-[220px]"
            )}
            aria-disabled="true"
            title="Показуються тільки ваші замовники та ліди"
          >
            <AvatarBase
              src={memberById.get(userId ?? "")?.avatarDisplayUrl ?? null}
              name={currentManagerLabel || defaultManagerName || "Менеджер"}
              fallback={(currentManagerLabel || defaultManagerName || "ME").slice(0, 2).toUpperCase()}
              size={20}
              className="shrink-0 border-border/60"
              fallbackClassName="text-[10px] font-semibold"
            />
            <span className="truncate">{currentManagerLabel || defaultManagerName || "Менеджер"}</span>
          </div>
        ) : (
          <Select
            value={activeTab === "customers" ? customerManagerFilter : leadManagerFilter}
            onValueChange={(value) => {
              if (activeTab === "customers") setCustomerManagerFilter(value);
              else setLeadManagerFilter(value);
            }}
          >
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[220px]")}>
              <div className="min-w-0 flex items-center">
                {renderManagerFilterValue(activeTab === "customers" ? customerManagerFilter : leadManagerFilter)}
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MANAGERS_FILTER}>Всі менеджери</SelectItem>
              {(activeTab === "customers" ? customerManagerOptions : leadManagerOptions).map((manager) => (
                <SelectItem key={manager} value={manager}>
                  {renderManagerFilterValue(manager)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
          <span className="tabular-nums">{activeTab === "customers" ? customersTotal : leadsTotal}</span>
          {(activeTab === "customers" ? (customersLoading || customersRefreshing) : (leadsLoading || leadsRefreshing)) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </div>
    </div>
  ), [
    activeTab,
    customerManagerFilter,
    customerManagerOptions,
    currentManagerLabel,
    defaultManagerName,
    customersLoading,
    customersRefreshing,
    customersTotal,
    isManagerUser,
    leadManagerFilter,
    leadManagerOptions,
    leadsLoading,
    leadsRefreshing,
    leadsTotal,
    memberById,
    openCreate,
    openCreateLead,
    renderManagerFilterValue,
    clearFilters,
    hasActiveFilters,
    search,
    userId,
  ]);

  usePageHeaderActions(customersHeaderActions, [customersHeaderActions]);

  return (
    <div className="w-full pb-20 md:pb-0 space-y-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "customers" | "leads")}>
        {isManagerUser && search.trim() ? (
          <div className="mb-4 rounded-[var(--radius-xl)] border border-amber-300/70 bg-amber-50/80 p-3">
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-sm font-medium text-amber-950">Схожі компанії в інших менеджерів</p>
                <p className="text-xs text-amber-900/80">
                  Ви й далі бачите тільки свої записи, але пошук підсвічує можливі дублікати в команді.
                </p>
              </div>
              {crossManagerMatchesLoading ? (
                <p className="text-xs text-amber-900/80">Шукаю збіги по команді…</p>
              ) : crossManagerMatches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {crossManagerMatches.map((match) => (
                    <div
                      key={`${match.entityType}-${match.id}`}
                      className="min-w-[220px] rounded-[var(--radius-lg)] border border-amber-200 bg-white/80 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-100 text-[10px] uppercase tracking-wide text-amber-950"
                        >
                          {match.entityType === "lead" ? "Лід" : "Замовник"}
                        </Badge>
                        <span className="truncate text-sm font-medium text-foreground">{match.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Менеджер: {match.managerLabel}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-900/80">Схожих записів в інших менеджерів не знайдено.</p>
              )}
            </div>
          </div>
        ) : null}
        <TabsContent value="customers" className="mt-0 pt-4">
          <div className="overflow-hidden">
            {customersLoading ? (
              <AppSectionLoader label="Завантаження..." />
            ) : customersError ? (
              <div className="p-6 text-sm text-destructive">{customersError}</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Немає замовників. Додайте першого.</div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredRows.map((row) => (
                    (() => {
                      const legalEntities = getCustomerLegalEntities(row);
                      const primaryEntity = getCustomerPrimaryLegalEntity(row);

                      return (
                        <div
                          key={row.id}
                          className="rounded-[var(--radius-inner)] border border-border bg-card p-4"
                          onClick={() => openEdit(row)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <EntityAvatar
                                src={row.logo_url ?? null}
                                name={row.name ?? row.legal_name ?? "Компанія"}
                                fallback={getInitials(row.name ?? row.legal_name)}
                                size={40}
                              />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{row.name ?? "Не вказано"}</div>
                                {legalEntities.length > 1 ? (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {legalEntities.length} юр. ос.
                                  </div>
                                ) : null}
                              </div>
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
                                  {customerDropboxLinks[row.id] ? (
                                    <>
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "open", () => openCustomerDropboxFolder(row.id, row.name ?? row.legal_name ?? ""))}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Відкрити папку Dropbox
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "detach", () => detachCustomerDropboxFolder(row.id), "Папку Dropbox відв'язано")}>
                                        <Unlink className="mr-2 h-4 w-4" />
                                        Відв'язати папку Dropbox
                                      </DropdownMenuItem>
                                    </>
                                  ) : (
                                    <>
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "create", () => createCustomerDropboxFolder(row.id, row.name ?? row.legal_name ?? ""), "Папку Dropbox створено")}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Створити папку Dropbox
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openAttachDropboxDialog(row.id, row.name ?? row.legal_name ?? "")}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Прив'язати папку Dropbox
                                      </DropdownMenuItem>
                                    </>
                                  )}
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
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">
                                {legalEntities.length > 1 ? "Основна юр. особа:" : "Юр. особа:"}
                              </span>{" "}
                              {renderPrimaryEntityLabel(row)}
                            </div>
                            {!primaryEntity || !hasCustomerLegalEntityIdentity(primaryEntity) ? (
                              <div>
                                <span className="text-muted-foreground">ЄДРПОУ / ІПН:</span> Додайте реквізити
                              </div>
                            ) : primaryEntity.taxId ? (
                              <div>
                                <span className="text-muted-foreground">ЄДРПОУ / ІПН:</span> {primaryEntity.taxId}
                              </div>
                            ) : null}
                            <div className="sm:col-span-2">
                              <span className="text-muted-foreground">Менеджер:</span>{" "}
                              {resolveManagerLabel(row.manager_user_id, row.manager) || "Не вказано"}
                            </div>
                            {legalEntities.length > 1 ? (
                              <div className="text-xs text-muted-foreground">
                                Також: {legalEntities.slice(1).map((entity) => formatCustomerLegalEntitySummary(entity)).join(", ")}
                              </div>
                            ) : null}
                            {row.website ? (
                              <div className="sm:col-span-2">
                                <a
                                  href={row.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline underline-offset-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {row.website}
                                </a>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table className="border-collapse">
                    <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
                      <TableRow className="border-b border-border/40 hover:bg-transparent">
                        <TableHead className="w-[34%] pl-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Компанія</TableHead>
                        <TableHead className="w-[92px] px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Тип</TableHead>
                        <TableHead className="w-[30%] pl-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Юрособа</TableHead>
                        <TableHead className="w-[18%] text-xs font-medium text-muted-foreground uppercase tracking-wider">Сайт</TableHead>
                        <TableHead className="w-[16%] text-xs font-medium text-muted-foreground uppercase tracking-wider">Менеджер</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => {
                        const legalEntities = getCustomerLegalEntities(row);
                        const primaryEntity = getCustomerPrimaryLegalEntity(row);
                        const primaryEntityType = getCustomerPrimaryLegalEntityType(row);
                        const primaryEntityTypeDescription = getCustomerPrimaryLegalEntityTypeDescription(row);

                        return (
                          <TableRow
                            key={row.id}
                            className="group hover:bg-muted/30 cursor-pointer border-b border-border/30 last:border-0 transition-colors"
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
                                  {legalEntities.length > 1 ? (
                                    <div className="text-xs text-muted-foreground">{legalEntities.length} юр. ос.</div>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top px-2">
                              {primaryEntityType ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full px-2.5 py-0.5 text-[11px]"
                                >
                                  {primaryEntityType}
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top pl-2 max-w-[360px]">
                              <div className="space-y-1">
                                <div className="truncate font-medium">{renderPrimaryEntityLabel(row)}</div>
                                {(primaryEntity && hasCustomerLegalEntityIdentity(primaryEntity) && primaryEntity.taxId) || legalEntities.length > 1 ? (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {primaryEntity && hasCustomerLegalEntityIdentity(primaryEntity) && primaryEntity.taxId ? (
                                      <span>{`Код ${primaryEntity.taxId}`}</span>
                                    ) : null}
                                    {legalEntities.length > 1 ? (
                                      <span className="rounded-full border border-border/70 px-2 py-0.5">
                                        +{legalEntities.length - 1} ще
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="align-top max-w-[220px]">
                              {row.website ? (
                                <a
                                  href={row.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-primary underline underline-offset-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {row.website}
                                </a>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top">{renderManagerCell(row.manager_user_id, row.manager)}</TableCell>
                            <TableCell
                              className="text-right pr-4 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100"
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
                                  {customerDropboxLinks[row.id] ? (
                                    <>
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "open", () => openCustomerDropboxFolder(row.id, row.name ?? row.legal_name ?? ""))}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Відкрити папку Dropbox
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "detach", () => detachCustomerDropboxFolder(row.id), "Папку Dropbox відв'язано")}>
                                        <Unlink className="mr-2 h-4 w-4" />
                                        Відв'язати папку Dropbox
                                      </DropdownMenuItem>
                                    </>
                                  ) : (
                                    <>
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "create", () => createCustomerDropboxFolder(row.id, row.name ?? row.legal_name ?? ""), "Папку Dropbox створено")}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Створити папку Dropbox
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openAttachDropboxDialog(row.id, row.name ?? row.legal_name ?? "")}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Прив'язати папку Dropbox
                                      </DropdownMenuItem>
                                    </>
                                  )}
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
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {customersHasMore ? (
                  <div className="flex items-center justify-center px-4 pb-6 pt-4 md:px-6">
                    <Button variant="outline" onClick={handleLoadMoreCustomers} disabled={customersRefreshing}>
                      {customersRefreshing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Оновлення...
                        </>
                      ) : (
                        `Показати ще ${CUSTOMERS_PAGE_SIZE}`
                      )}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="leads" className="mt-0 pt-4">
          <div className="overflow-hidden">
            {leadsLoading ? (
              <AppSectionLoader label="Завантаження..." />
            ) : leadsError ? (
              <div className="p-6 text-sm text-destructive">{leadsError}</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Немає лідів. Додайте першого.</div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="rounded-[var(--radius-inner)] border border-border bg-card p-4"
                      onClick={() => openEditLead(lead)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <EntityAvatar
                            src={lead.logo_url ?? null}
                            name={lead.company_name ?? lead.legal_name ?? "Лід"}
                            fallback={getInitials(lead.company_name ?? lead.legal_name)}
                            size={40}
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{lead.company_name ?? "Не вказано"}</div>
                            {lead.legal_name ? (
                              <div className="text-xs text-muted-foreground truncate">{lead.legal_name}</div>
                            ) : null}
                          </div>
                        </div>
                        <div onClick={(event) => event.stopPropagation()}>
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
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Контакт:</span> {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Не вказано"}</div>
                        <div><span className="text-muted-foreground">Email:</span> {lead.email ?? "Не вказано"}</div>
                        <div><span className="text-muted-foreground">Телефони:</span> {lead.phone_numbers?.length ? lead.phone_numbers.join(", ") : "Не вказано"}</div>
                        <div><span className="text-muted-foreground">Джерело:</span> {lead.source ?? "Не вказано"}</div>
                        <div><span className="text-muted-foreground">Менеджер:</span> {resolveManagerLabel(lead.manager_user_id, lead.manager) || "Не вказано"}</div>
                        {lead.website ? (
                          <div>
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {lead.website}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <Table className="border-collapse">
                    <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
                      <TableRow className="border-b border-border/40 hover:bg-transparent">
                        <TableHead className="pl-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Компанія</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Контакт</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Телефони</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Джерело</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Сайт</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Менеджер</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((lead) => (
                        <TableRow
                          key={lead.id}
                          className="group hover:bg-muted/30 cursor-pointer border-b border-border/30 last:border-0 transition-colors"
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
                            className="text-right pr-4 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100"
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
                </div>
                {leadsHasMore ? (
                  <div className="flex items-center justify-center px-4 pb-6 pt-4 md:px-6">
                    <Button variant="outline" onClick={handleLoadMoreLeads} disabled={leadsRefreshing}>
                      {leadsRefreshing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Оновлення...
                        </>
                      ) : (
                        `Показати ще ${CUSTOMERS_PAGE_SIZE}`
                      )}
                    </Button>
                  </div>
                ) : null}
              </>
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
            setLinkedOrders([]);
            setLinkedDesignTasks([]);
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
        submitLabel={editingId ? "Зберегти" : "Створити замовника"}
        calculations={calculationQuotes}
        orders={orderQuotes}
        designTasks={linkedDesignTasks}
        linkedLoading={linkedQuotesLoading}
        onOpenCalculation={(id) => navigate(`/orders/estimates/${id}`)}
        onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
        onOpenDesignTask={(id) => navigate(`/design/${id}`)}
        isDropboxLinked={!!(editingId && customerDropboxLinks[editingId])}
        dropboxAction={
          editingId && dropboxActionState?.customerId === editingId ? dropboxActionState.action : null
        }
        onOpenClientFiles={
          editingId && form.name.trim()
            ? () => void runCustomerDropboxAction(editingId, "open", () => openCustomerDropboxFolder(editingId, form.name.trim()))
            : undefined
        }
        onCreateDropboxFolder={
          editingId && form.name.trim()
            ? () => void runCustomerDropboxAction(editingId, "create", () => createCustomerDropboxFolder(editingId, form.name.trim()), "Папку Dropbox створено")
            : undefined
        }
        onAttachDropboxFolder={
          editingId && form.name.trim()
            ? () => openAttachDropboxDialog(editingId, form.name.trim())
            : undefined
        }
        onDetachDropboxFolder={
          editingId && customerDropboxLinks[editingId]
            ? () => void runCustomerDropboxAction(editingId, "detach", () => detachCustomerDropboxFolder(editingId), "Папку Dropbox відв'язано")
            : undefined
        }
        onSubmit={handleSave}
      />

      <Dialog
        open={attachDropboxDialogOpen}
        onOpenChange={(open) => {
          setAttachDropboxDialogOpen(open);
          if (!open && dropboxActionState?.action !== "attach") {
            setAttachDropboxTarget(null);
            setAttachDropboxPath("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Прив'язати папку Dropbox
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Вкажіть тільки назву папки клієнта{attachDropboxTarget?.clientName ? ` для ${attachDropboxTarget.clientName}` : ""}. Шлях `Tosho Team Folder/Замовники/` підставиться автоматично.
            </div>
            <div className="grid gap-2">
              <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                Tosho Team Folder/Замовники/
              </div>
              <Input
                value={attachDropboxPath}
                onChange={(event) => setAttachDropboxPath(event.target.value)}
                placeholder="LG"
                className="h-10"
              />
              <div className="text-xs text-muted-foreground">
                Приклад: `LG`
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => {
                setAttachDropboxDialogOpen(false);
                setAttachDropboxTarget(null);
                setAttachDropboxPath("");
              }}
              disabled={dropboxActionState?.action === "attach"}
            >
              Скасувати
            </Button>
            <Button onClick={() => void submitAttachDropboxDialog()} disabled={dropboxActionState?.action === "attach"}>
              {dropboxActionState?.action === "attach" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Прив'язати папку Dropbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadDialog
        open={leadDialogOpen}
        onOpenChange={(open) => {
          setLeadDialogOpen(open);
          if (!open && !leadEditingId) {
            resetLeadForm();
          }
          if (!open && leadEditingId) {
            setLinkedQuotes([]);
            setLinkedOrders([]);
            setLinkedDesignTasks([]);
            setLinkedQuotesLoading(false);
          }
        }}
        form={leadForm}
        setForm={setLeadForm}
        ownershipOptions={OWNERSHIP_OPTIONS}
        teamMembers={managerDialogMembers}
        saving={leadSaving}
        error={leadFormError}
        title={leadEditingId ? "Редагувати ліда" : "Новий лід"}
        description={leadEditingId ? undefined : "Додайте всі дані ліда для першого контакту."}
        submitLabel={leadEditingId ? "Зберегти" : "Створити ліда"}
        calculations={calculationQuotes}
        orders={orderQuotes}
        designTasks={linkedDesignTasks}
        linkedLoading={linkedQuotesLoading}
        onOpenCalculation={(id) => navigate(`/orders/estimates/${id}`)}
        onOpenOrder={(id) => navigate(`/orders/production/${id}`)}
        onOpenDesignTask={(id) => navigate(`/design/${id}`)}
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
