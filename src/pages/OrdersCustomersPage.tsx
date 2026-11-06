import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
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
import { TableTitleCell } from "@/components/app/table-kit";
import { ResizableHead } from "@/components/app/table-columns/ResizableHead";
import { useTableColumns } from "@/components/app/table-columns/useTableColumns";
import { CUSTOMERS_TABLE_COLUMNS, LEADS_TABLE_COLUMNS } from "@/features/orders/customersTableColumns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCustomerLeadCreate } from "@/components/customers";
import type { CustomerContact } from "@/components/customers/partyFormTypes";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { usePageCache } from "@/hooks/usePageCache";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarFilterBar, ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { InlineLoading } from "@/components/app/loading-primitives";
import { listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { loadDerivedOrders, formatOrderMoney } from "@/features/orders/orderRecords";
// LTV (MVP, frontend-only): see src/lib/customerLtv.ts
import {
  aggregateCustomerLtv,
  buildCustomerLtvTooltip,
  buildSegmentMap,
  RFM_SEGMENT_LABELS,
  RFM_SEGMENT_TONE,
  type CustomerLtvEntry,
  type RfmSegment,
} from "@/lib/customerLtv";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { buildUserNameFromMetadata, formatUserShortName } from "@/lib/userName";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import { isInactiveEmployment } from "@/lib/employment";
import { resolveWorkspaceId } from "@/lib/workspace";
import { isQuoteManagerJobRole } from "@/lib/permissions";
import {
  formatCustomerLegalEntitySummary,
  formatCustomerLegalEntityTitle,
  formatOwnershipTypeLabel,
  getCustomerLegalEntityDocumentMissingFields,
  hasCustomerLegalEntityDocumentEssentials,
  hasCustomerLegalEntityIdentity,
  parseCustomerLegalEntities,
} from "@/lib/customerLegalEntities";
import {
  areCompanyNamesEquivalent,
  buildCompanySearchVariants,
  buildShortQueryPrefixVariants,
  normalizeCompanyNameLooseKey,
  scoreCompanyNameMatch,
} from "@/lib/companyNameSearch";
import { useOpenPartyCard } from "@/components/customers/partyCardContext";
import { CustomerHoverCard } from "@/components/customers/card/CustomerHoverCard";
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
import { Building2, ChevronDown, ChevronsUpDown, ChevronUp, ExternalLink, Loader2, MoreHorizontal, Plus, Trash2, Unlink, Users } from "@/components/icons/appIcons";
import { formatTelegramHandle } from "@/lib/telegramContact";
import { leadContactLabel } from "@/components/customers/leadContact";
import {
  getFallbackLeadColumnsVariant,
  getLeadColumns,
  type LeadColumnsVariant,
  type LeadRow,
} from "@/components/customers/leadRecord";
import { toast } from "sonner";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { EmptyFieldAction } from "@/components/app/EmptyFieldAction";
import { ExternalSiteLink } from "@/components/app/ExternalSiteLink";
import {
  buildCustomerDropboxBrandPath,
  buildCustomerDropboxClientPath,
  extractCustomerDropboxLinks,
  isMissingCustomerDropboxColumnsError,
  normalizeCustomerDropboxPath,
  readCustomerDropboxLinks,
  writeCustomerDropboxLinks,
  type CustomerDropboxAction,
  type CustomerDropboxLink,
  type DropboxManageCreateClientResponse,
} from "@/components/customers/customerDropbox";

type CustomerRow = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  payment_type?: string | null;
  source?: string | null;
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
  accountant_name?: string | null;
  accountant_email?: string | null;
  accountant_edrpou?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
  delivery_points?: unknown;
  dropbox_client_path?: string | null;
  dropbox_brand_path?: string | null;
  dropbox_shared_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SearchVisibilityMatch = {
  id: string;
  label: string;
  entityType: "customer" | "lead";
  managerLabel: string;
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
  "payment_type",
  "source",
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
  "accountant_name",
  "accountant_email",
  "accountant_edrpou",
  "reminder_at",
  "reminder_comment",
  "event_name",
  "event_at",
  "event_comment",
  "notes",
  "delivery_points",
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

/**
 * Дані списку, збережені для миттєвого повторного входу (REQ-19).
 *
 * Окремо від `CustomersPageCachePayload`: той тримає стан інтерфейсу (вкладка,
 * пошук, фільтри) і відновлюється лише при поверненні «назад», а це — самі
 * рядки, і потрібні вони при будь-якому вході в розділ.
 */
type CustomersListCache = {
  rows: CustomerRow[];
  total: number;
  hasMore: boolean;
};

type LeadsListCache = {
  leads: LeadRow[];
  total: number;
  hasMore: boolean;
};

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
  const { containerRef: customersTableRef, ...customersColumns } = useTableColumns(CUSTOMERS_TABLE_COLUMNS); // чому окремо — TableColumnsResizer
  const { containerRef: leadsTableRef, ...leadsColumns } = useTableColumns(LEADS_TABLE_COLUMNS);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { session, userId, jobRole } = useAuth();
  // Кеш читається ОДИН раз, а не на кожен рендер: значення потрібні лише для
  // початкових станів нижче. Чому це важливо — див. readInitialDesignPageState.
  const initialPageState = useMemo(() => {
    const cache = readCustomersPageCache(teamId);
    return { restored: shouldRestorePageUiState(cache?.cachedAt) ? cache : null };
  }, [teamId]);
  const restoredCache = initialPageState.restored;
  const [activeTab, setActiveTab] = useState<"customers" | "leads">(() => restoredCache?.activeTab ?? "customers");
  const [search, setSearch] = useState(() => restoredCache?.search ?? "");
  const [customerManagerFilter, setCustomerManagerFilter] = useState<string>(
    () => restoredCache?.customerManagerFilter ?? ALL_MANAGERS_FILTER
  );
  const [leadManagerFilter, setLeadManagerFilter] = useState<string>(
    () => restoredCache?.leadManagerFilter ?? ALL_MANAGERS_FILTER
  );
  const [defaultManagerFilterApplied, setDefaultManagerFilterApplied] = useState(false);
  // For manager users: delay list fetch until team members are loaded and filter is set
  const [teamMembersReady, setTeamMembersReady] = useState(() => !isQuoteManagerJobRole(jobRole));
  const [crossManagerMatches, setCrossManagerMatches] = useState<SearchVisibilityMatch[]>([]);
  const [crossManagerMatchesLoading, setCrossManagerMatchesLoading] = useState(false);

  /**
   * Миттєве відкриття розділу (REQ-19): рядки беруться з кешу сторінки, каркас
   * не показується, свіжі дані доїжджають тихо (loadCustomers сам перемикається
   * на `refreshing`, коли рядки вже є).
   *
   * Кешуємо лише вигляд БЕЗ пошуку: із запитом у полі попередній результат
   * показав би не ті рядки, а користі з нього нуль — пошук усе одно йде на
   * сервер. Ключ містить фільтр менеджера, тож чужий зріз не підставляється.
   */
  const customersCacheKey = `customers-rows:${teamId}:${customerManagerFilter}`;
  const leadsCacheKey = `leads-rows:${teamId}:${leadManagerFilter}`;
  const { cached: cachedCustomers, setCache: setCustomersCache } = usePageCache<CustomersListCache>(customersCacheKey);
  const { cached: cachedLeads, setCache: setLeadsCache } = usePageCache<LeadsListCache>(leadsCacheKey);
  const seededCustomers = search.trim() ? null : cachedCustomers;
  const seededLeads = search.trim() ? null : cachedLeads;

  const [rows, setRows] = useState<CustomerRow[]>(seededCustomers?.rows ?? []);
  const customersFullFetchCompletedKeyRef = useRef<string | null>(null);
  const [customersLoading, setCustomersLoading] = useState(!seededCustomers);
  const [customersRefreshing, setCustomersRefreshing] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customersTotal, setCustomersTotal] = useState(seededCustomers?.total ?? 0);
  const [customersHasMore, setCustomersHasMore] = useState(seededCustomers?.hasMore ?? false);

  const [leads, setLeads] = useState<LeadRow[]>(seededLeads?.leads ?? []);
  const leadsFullFetchCompletedKeyRef = useRef<string | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(!seededLeads);
  const [leadsRefreshing, setLeadsRefreshing] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [leadsTotal, setLeadsTotal] = useState(seededLeads?.total ?? 0);
  const [leadsHasMore, setLeadsHasMore] = useState(seededLeads?.hasMore ?? false);
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDisplayRow[]>([]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [leadDeleteDialogOpen, setLeadDeleteDialogOpen] = useState(false);
  const [leadDeleteTarget, setLeadDeleteTarget] = useState<LeadRow | null>(null);
  const [leadDeleteBusy, setLeadDeleteBusy] = useState(false);
  const [leadDeleteError, setLeadDeleteError] = useState<string | null>(null);
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

  // LTV (MVP, frontend-only): map customer.id -> aggregated lifetime value.
  // Loaded lazily once per teamId; failures are swallowed (LTV column shows "—").
  const [customerLtvMap, setCustomerLtvMap] = useState<Map<string, CustomerLtvEntry>>(new Map());
  // LTV (MVP): start in "default" (server order) so the 50-row pagination
  // optimization is preserved on first paint. User explicitly opting into
  // LTV sort triggers a one-shot full-fetch below. Cycle: default -> desc -> asc -> default.
  const [ltvSortDirection, setLtvSortDirection] = useState<"default" | "desc" | "asc">("default");
  // LTV (MVP): "all" disables segment filtering.
  const [segmentFilter, setSegmentFilter] = useState<RfmSegment | "all">("all");

  useEffect(() => {
    if (!teamId) {
      setCustomerLtvMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const orders = await loadDerivedOrders(teamId, userId);
        if (cancelled) return;
        setCustomerLtvMap(aggregateCustomerLtv(orders));
      } catch (err) {
        // Silent: LTV is purely additive — log for debug, keep the page working.
        console.warn("[LTV] failed to load derived orders for customer LTV", err);
        if (!cancelled) setCustomerLtvMap(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, userId]);

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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch("/.netlify/functions/dropbox-manage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch(
      `/.netlify/functions/dropbox-manage?action=inspect&path=${encodeURIComponent(normalizeCustomerDropboxPath(clientPath))}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    );
    const payload = (await response.json().catch(() => null)) as DropboxManageCreateClientResponse | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "Не вдалося отримати Dropbox-папку замовника.");
    }
    return payload;
  }, []);

  /**
   * Тека «Бренд» замовника — матеріали ВІД клієнта (брендбук, лого, шрифти).
   * Окремо від теки клієнта: саме туди їх треба класти, а не у вкладення задач.
   * Бекенд ідемпотентно створює теку й видає посилання.
   */
  const openCustomerBrandFolder = useCallback(async (customerId: string, clientName: string) => {
    const normalizedClientName = clientName.trim();
    if (!normalizedClientName || typeof window === "undefined") return;

    // Вікно відкриваємо ДО запиту: після await браузер вважає це не кліком.
    const pending = window.open("", "_blank", "noopener");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch("/.netlify/functions/dropbox-manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "brand-link",
          clientPath: customerDropboxLinks[customerId]?.clientPath || undefined,
          clientName: normalizedClientName,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; brandSharedUrl?: string | null; error?: string | null }
        | null;
      if (!response.ok || !payload?.ok || !payload.brandSharedUrl) {
        throw new Error(payload?.error || "Не вдалося відкрити теку матеріалів.");
      }
      const url = payload.brandSharedUrl.trim();
      await supabase
        .schema("tosho")
        .from("customers")
        .update({ dropbox_brand_shared_url: url })
        .eq("id", customerId);
      if (pending) pending.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (error) {
      pending?.close();
      throw error;
    }
  }, [customerDropboxLinks]);

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
        throw new Error("Прив'язана Dropbox-папка недоступна. Переприв'яжіть її ще раз.", { cause: error });
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
  const [handledDeepLink, setHandledDeepLink] = useState<string | null>(null);
  const previousPathnameRef = useRef(location.pathname);
  const rowsRef = useRef<CustomerRow[]>([]);
  const leadsRef = useRef<LeadRow[]>([]);
  const customerDeepLink = useMemo(() => {
    const customerId = searchParams.get("customerId")?.trim() ?? "";
    const leadId = searchParams.get("leadId")?.trim() ?? "";
    const customerName = searchParams.get("customerName")?.trim() ?? "";
    const leadName = searchParams.get("leadName")?.trim() ?? "";
    const tab = searchParams.get("tab")?.trim() ?? "";
    const key = searchParams.toString();
    return {
      customerId,
      leadId,
      customerName,
      leadName,
      tab,
      key: customerId || leadId || customerName || leadName ? key : "",
    };
  }, [searchParams]);
  const shouldPrioritizeDeepLink = Boolean(customerDeepLink.key && handledDeepLink !== customerDeepLink.key);

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
  // LTV (MVP): derived segment map + counts, recomputed when LTV data changes.
  const customerSegmentMap = useMemo(() => buildSegmentMap(customerLtvMap), [customerLtvMap]);
  const segmentCounts = useMemo(() => {
    const counts: Record<RfmSegment | "all", number> = {
      all: rows.length,
      champion: 0,
      new: 0,
      loyal: 0,
      at_risk: 0,
      dormant: 0,
      none: 0,
    };
    for (const row of rows) {
      const seg = customerSegmentMap.get(row.id) ?? "none";
      counts[seg] += 1;
    }
    return counts;
  }, [rows, customerSegmentMap]);

  // LTV (MVP): apply segment filter then LTV sort (stable, in-place copy).
  const filteredRows = useMemo(() => {
    let next = rows;
    if (segmentFilter !== "all") {
      next = next.filter((row) => (customerSegmentMap.get(row.id) ?? "none") === segmentFilter);
    }
    if (ltvSortDirection !== "default") {
      next = [...next].sort((a, b) => {
        const av = customerLtvMap.get(a.id)?.lifetimeRevenue ?? -1;
        const bv = customerLtvMap.get(b.id)?.lifetimeRevenue ?? -1;
        // desc → bigger first (positive when av < bv pushes 'a' after 'b'); asc → smaller first.
        return ltvSortDirection === "desc" ? bv - av : av - bv;
      });
    }
    return next;
  }, [rows, segmentFilter, customerSegmentMap, ltvSortDirection, customerLtvMap]);

  // LTV (MVP): only show segment-filter pills when at least one customer has a non-empty segment.
  const hasAnyLtv = customerLtvMap.size > 0;

  const cycleLtvSort = useCallback(() => {
    setLtvSortDirection((dir) => (dir === "default" ? "desc" : dir === "desc" ? "asc" : "default"));
  }, []);

  // LTV (MVP): when user interacts with LTV sort or segment filter, the
  // paginated 50-row default is incorrect — segment counts and sort would
  // reflect a subset only. Only trigger fetchAll AFTER LTV data has loaded,
  // so the first paint stays fast. Actual trigger lives further down — search
  // for "LTV (MVP): full-fetch trigger".
  const ltvNeedsFullFetch =
    (ltvSortDirection !== "default" || segmentFilter !== "all") && customerLtvMap.size > 0;

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
          .map((entry) => ({
            id: entry.id,
            label: entry.label,
            entityType: entry.entityType,
            managerLabel: entry.managerLabel,
          }));

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
      <div className="flex max-w-full min-w-0 items-center gap-2" title={managerLabel}>
        <AvatarBase
          src={member?.avatarDisplayUrl ?? null}
          name={managerLabel}
          fallback={managerLabel.slice(0, 2).toUpperCase()}
          size={20}
          className="border-border/60 shrink-0"
          fallbackClassName="text-3xs font-semibold"
          inactive={member ? isInactiveEmployment(member.employmentStatus) : false}
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
            fallbackClassName="text-3xs font-semibold"
            inactive={member ? isInactiveEmployment(member.employmentStatus) : false}
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
  const getCustomerMissingRequisitesLabel = (row: CustomerRow) => {
    const missing = getCustomerLegalEntityDocumentMissingFields(getCustomerPrimaryLegalEntity(row));
    if (missing.length === 0) return null;
    return `Заповніть ${missing.join(", ")}`;
  };
  const renderPrimaryEntityLabel = (row: CustomerRow) => {
    const primary = getCustomerPrimaryLegalEntity(row);
    if (!primary || !hasCustomerLegalEntityIdentity(primary)) return null;
    if (!hasCustomerLegalEntityDocumentEssentials(primary)) return primary.legalName.trim() || null;
    return formatCustomerLegalEntityTitle(primary);
  };

  const openDelete = (row: CustomerRow) => {
    setDeleteTarget(row);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

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
      const loadLead = async (variant: LeadColumnsVariant) =>
        await supabase
          .schema("tosho")
          .from("leads")
          .select(getLeadColumns(variant))
          .eq("team_id", teamId)
          .eq("id", leadId)
          .maybeSingle<LeadRow>();

      let variant: LeadColumnsVariant = "full";
      let { data, error } = await loadLead(variant);
      let fallbackVariant: LeadColumnsVariant | null = error
        ? getFallbackLeadColumnsVariant(variant, error.message ?? "")
        : null;
      while (error && fallbackVariant) {
        variant = fallbackVariant;
        ({ data, error } = await loadLead(variant));
        fallbackVariant = error ? getFallbackLeadColumnsVariant(variant, error.message ?? "") : null;
      }
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
      type CustomerQueryMode = "rich-substring" | "prefix-name-only";
      /**
       * УСІ ВАРІАНТИ НАПИСАННЯ — ОДНИМ ЗАПИТОМ (REQ-302). Було по запиту на
       * варіант: «fantom» давало чотири, українська назва — сім, і стільки ж
       * окремо по лідах. Кожен коштує 230–280 мс дороги, а не бази.
       */
      const buildCustomersQuery = (
        columns: string,
        searchTerms: string[] = [],
        mode: CustomerQueryMode = "rich-substring"
      ) => {
        let query = supabase
          .schema("tosho")
          .from("customers")
          .select(columns, { count: "exact" })
          .eq("team_id", teamId)
          .order("name", { ascending: true });

        if (isManagerUser && userId) {
          if (currentManagerLabel) {
            query = query.or(`manager_user_id.eq.${userId},manager.eq.${currentManagerLabel}`);
          } else {
            query = query.eq("manager_user_id", userId);
          }
        } else if (customerManagerFilter !== ALL_MANAGERS_FILTER) {
          const selectedManager = memberByLabel.get(customerManagerFilter);
          if (selectedManager?.userId) {
            query = query.or(`manager_user_id.eq.${selectedManager.userId},manager.eq.${customerManagerFilter}`);
          } else {
            query = query.eq("manager", customerManagerFilter);
          }
        }

        // Short-query path: match only the trade name. legal_name/manager/contact_*
        // would dominate single-letter queries with rows where someone's email or
        // legal-form prefix (ФОП/ТОВ/ПП) starts with that letter.
        const conditions = searchTerms
          .filter((term) => term.trim())
          .flatMap((term) => {
            const escaped = escapePostgrestTerm(term.trim());
            return mode === "prefix-name-only"
              ? [`name.ilike.${escaped}%`]
              : [
                  `name.ilike.%${escaped}%`,
                  `legal_name.ilike.%${escaped}%`,
                  `manager.ilike.%${escaped}%`,
                  `contact_name.ilike.%${escaped}%`,
                  `contact_phone.ilike.%${escaped}%`,
                  `contact_email.ilike.%${escaped}%`,
                  `website.ilike.%${escaped}%`,
                  `tax_id.ilike.%${escaped}%`,
                ];
          });
        if (conditions.length > 0) query = query.or(conditions.join(","));

        return query;
      };

      const nextRows: CustomerRow[] = [];
      let nextOffset = offset;
      let totalCount: number | null = null;
      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        const pageSize = fetchAll ? CUSTOMERS_SEARCH_FETCH_PAGE_SIZE : CUSTOMERS_PAGE_SIZE;

        // Short query (1-2 chars): prefix-name-only with Latin↔Cyrillic transliteration.
        // The fuzzy variants engine drops length-1 items entirely; substring on a single
        // letter would return ~every ФОП/ТОВ/manager whose initial matches. See the
        // matching short-query path in `src/lib/toshoApi.ts` (listCustomersBySearch).
        if (normalizedSearch.length < 3) {
          const { data, error: loadError } = await runCustomerSelect(async (columns) =>
            await buildCustomersQuery(
              columns,
              buildShortQueryPrefixVariants(normalizedSearch),
              "prefix-name-only"
            ).range(0, pageSize - 1)
          );
          if (loadError) throw loadError;
          const rankedRows = (((data as unknown) as CustomerRow[]) ?? []).sort((left, right) =>
            (left.name ?? "").localeCompare(right.name ?? "", "uk")
          );
          setCustomersTotal(rankedRows.length);
          setCustomersHasMore(false);
          if (!append) {
            customersFullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
          }
          setRows(rankedRows);
          return;
        }

        const { data, error: loadError } = await runCustomerSelect(async (columns) =>
          await buildCustomersQuery(columns, buildCompanySearchVariants(normalizedSearch)).range(0, pageSize - 1)
        );
        if (loadError) throw loadError;

        const rankedRows = (((data as unknown) as CustomerRow[]) ?? [])
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

      const nextTotal = totalCount ?? nextRows.length;
      const nextHasMore = fetchAll ? false : offset + nextRows.length < nextTotal;
      setCustomersTotal(nextTotal);
      setCustomersHasMore(nextHasMore);
      if (!append && !search.trim()) {
        setCustomersCache({ rows: nextRows, total: nextTotal, hasMore: nextHasMore });
      }
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
  }, [currentManagerLabel, customerManagerFilter, isManagerUser, memberByLabel, runCustomerSelect, search, setCustomersCache, teamId, userId]);

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
      type LeadQueryMode = "rich-substring" | "prefix-name-only";
      const runLoadLeads = async (
        variant: LeadColumnsVariant,
        rangeOffset: number,
        pageSize: number,
        searchTerms: string[] = [],
        mode: LeadQueryMode = "rich-substring"
      ) => {
        let query = supabase
          .schema("tosho")
          .from("leads")
          .select(getLeadColumns(variant), { count: "exact" })
          .eq("team_id", teamId)
          .order("company_name", { ascending: true });

        if (isManagerUser && userId) {
          if (currentManagerLabel) {
            query = query.or(`manager_user_id.eq.${userId},manager.eq.${currentManagerLabel}`);
          } else {
            query = query.eq("manager_user_id", userId);
          }
        } else if (leadManagerFilter !== ALL_MANAGERS_FILTER) {
          const selectedManager = memberByLabel.get(leadManagerFilter);
          if (selectedManager?.userId) {
            query = query.or(`manager_user_id.eq.${selectedManager.userId},manager.eq.${leadManagerFilter}`);
          } else {
            query = query.eq("manager", leadManagerFilter);
          }
        }

        // Усі варіанти написання — одним `or`; чому, див. buildCustomersQuery.
        const conditions = searchTerms
          .filter((term) => term.trim())
          .flatMap((term) => {
            const escaped = escapePostgrestTerm(term.trim());
            return mode === "prefix-name-only"
              ? [`company_name.ilike.${escaped}%`]
              : [
                  `company_name.ilike.%${escaped}%`,
                  `legal_name.ilike.%${escaped}%`,
                  `first_name.ilike.%${escaped}%`,
                  `last_name.ilike.%${escaped}%`,
                  `email.ilike.%${escaped}%`,
                  `source.ilike.%${escaped}%`,
                  `manager.ilike.%${escaped}%`,
                  `website.ilike.%${escaped}%`,
                ];
          });
        if (conditions.length > 0) query = query.or(conditions.join(","));

        return await query.range(rangeOffset, rangeOffset + pageSize - 1);
      };

      const nextLeads: LeadRow[] = [];
      let nextOffset = offset;
      let totalCount: number | null = null;
      let variant: LeadColumnsVariant = "full";
      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        const pageSize = fetchAll ? CUSTOMERS_SEARCH_FETCH_PAGE_SIZE : CUSTOMERS_PAGE_SIZE;

        // Short query (1-2 chars): prefix-name-only with Latin↔Cyrillic transliteration.
        // Mirrors the customer-table and picker fix.
        if (normalizedSearch.length < 3) {
          const terms = buildShortQueryPrefixVariants(normalizedSearch);
          let activeVariant: LeadColumnsVariant = "full";
          let { data, error: loadError } = await runLoadLeads(activeVariant, 0, pageSize, terms, "prefix-name-only");
          let fallbackVariant: LeadColumnsVariant | null = loadError
            ? getFallbackLeadColumnsVariant(activeVariant, loadError.message ?? "")
            : null;
          while (loadError && fallbackVariant) {
            activeVariant = fallbackVariant;
            ({ data, error: loadError } = await runLoadLeads(activeVariant, 0, pageSize, terms, "prefix-name-only"));
            fallbackVariant = loadError ? getFallbackLeadColumnsVariant(activeVariant, loadError.message ?? "") : null;
          }
          if (loadError) throw loadError;
          const rankedLeads = (((data as unknown) as LeadRow[]) ?? []).sort((left, right) =>
            (left.company_name ?? "").localeCompare(right.company_name ?? "", "uk")
          );
          setLeadsTotal(rankedLeads.length);
          setLeadsHasMore(false);
          if (!append) {
            leadsFullFetchCompletedKeyRef.current = fetchAll ? (options?.fullFetchKey ?? "__full__") : null;
          }
          setLeads(rankedLeads);
          return;
        }

        const terms = buildCompanySearchVariants(normalizedSearch);
        let activeVariant: LeadColumnsVariant = "full";
        let { data, error: loadError } = await runLoadLeads(activeVariant, 0, pageSize, terms);
        let fallbackVariant: LeadColumnsVariant | null = loadError
          ? getFallbackLeadColumnsVariant(activeVariant, loadError.message ?? "")
          : null;
        while (loadError && fallbackVariant) {
          activeVariant = fallbackVariant;
          ({ data, error: loadError } = await runLoadLeads(activeVariant, 0, pageSize, terms));
          fallbackVariant = loadError ? getFallbackLeadColumnsVariant(activeVariant, loadError.message ?? "") : null;
        }
        if (loadError) throw loadError;

        const rankedLeads = (((data as unknown) as LeadRow[]) ?? [])
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
        let fallbackVariant: LeadColumnsVariant | null = loadError
          ? getFallbackLeadColumnsVariant(variant, loadError.message ?? "")
          : null;
        while (loadError && fallbackVariant) {
          variant = fallbackVariant;
          ({ data, error: loadError, count } = await runLoadLeads(variant, nextOffset, pageSize));
          fallbackVariant = loadError ? getFallbackLeadColumnsVariant(variant, loadError.message ?? "") : null;
        }
        if (loadError) throw loadError;
        const pageRows = ((data as unknown) as LeadRow[]) ?? [];
        nextLeads.push(...pageRows);
        totalCount = count ?? totalCount;
        if (!fetchAll || pageRows.length < pageSize) break;
        nextOffset += pageSize;
      }

      const nextTotal = totalCount ?? nextLeads.length;
      const nextHasMore = fetchAll ? false : offset + nextLeads.length < nextTotal;
      setLeadsTotal(nextTotal);
      setLeadsHasMore(nextHasMore);
      if (!append && !search.trim()) {
        setLeadsCache({ leads: nextLeads, total: nextTotal, hasMore: nextHasMore });
      }
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
  }, [currentManagerLabel, isManagerUser, leadManagerFilter, memberByLabel, search, setLeadsCache, teamId, userId]);

  const loadTeamMembers = useCallback(async () => {
    try {
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) {
        setTeamMembers([]);
        setTeamMembersReady(true);
        return;
      }
      const rows = await listWorkspaceMembersForDisplay(workspaceId);
      // React 18 batches all setState calls in async context → single re-render
      setTeamMembers(rows);
      if (isManagerUser && userId && !defaultManagerFilterApplied) {
        const memberLabel = rows.find((r) => r.userId === userId)?.label?.trim();
        if (memberLabel) {
          setCustomerManagerFilter(memberLabel);
          setLeadManagerFilter(memberLabel);
          setDefaultManagerFilterApplied(true);
        }
      }
      setTeamMembersReady(true);
    } catch {
      setTeamMembers([]);
      setTeamMembersReady(true);
    }
  }, [defaultManagerFilterApplied, isManagerUser, userId]);

  const handleLoadMoreCustomers = useCallback(() => {
    if (customersLoading || customersRefreshing || !customersHasMore) return;
    void loadCustomers({ append: true });
  }, [customersHasMore, customersLoading, customersRefreshing, loadCustomers]);

  const handleLoadMoreLeads = useCallback(() => {
    if (leadsLoading || leadsRefreshing || !leadsHasMore) return;
    void loadLeads({ append: true });
  }, [leadsHasMore, leadsLoading, leadsRefreshing, loadLeads]);

  // Клік по рядку відкриває ту саму панель, що й з прорахунку (REQ-349#p8).
  const openPartyCard = useOpenPartyCard();
  const openEdit = useCallback(
    (row: Pick<CustomerRow, "id" | "name">) =>
      openPartyCard?.({ customerId: row.id, name: row.name }, { onSaved: () => void loadCustomers() }),
    [loadCustomers, openPartyCard]
  );
  const openEditLead = useCallback(
    (lead: Pick<LeadRow, "id" | "company_name">) =>
      openPartyCard?.({ leadId: lead.id, name: lead.company_name }, { onSaved: () => void Promise.all([loadLeads(), loadCustomers()]) }),
    [loadCustomers, loadLeads, openPartyCard]
  );

  // Створену сторону одразу відкриваємо в панелі: там дозаповнюють реквізити.
  const { openCustomerCreate, openLeadCreate, dialogs: partyCreateDialogs } = useCustomerLeadCreate({
    teamId,
    defaultManagerLabel: currentManagerLabel || defaultManagerName,
    resolveErrorMessage: getErrorMessage,
    onCreated: (created) => {
      if (created.entityType === "customer") {
        void loadCustomers();
        openEdit({ id: created.id, name: created.name });
      } else {
        void loadLeads();
        openEditLead({ id: created.id, company_name: created.name });
      }
    },
  });

  // Infinite scroll: auto-load the next page when the bottom sentinel nears the
  // viewport. Loads the same batches as the "Показати ще" button (which stays as
  // a fallback), so it's no heavier than today — just no click required.
  const customersSentinelRef = useRef<HTMLDivElement | null>(null);
  const leadsSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = customersSentinelRef.current;
    if (!el || !customersHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handleLoadMoreCustomers();
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMoreCustomers, customersHasMore]);

  useEffect(() => {
    const el = leadsSentinelRef.current;
    if (!el || !leadsHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) handleLoadMoreLeads();
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleLoadMoreLeads, leadsHasMore]);

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
  }, [loadTeamMembers, teamId, userId]);

  useEffect(() => {
    if (!teamMembersReady) return;
    if (shouldPrioritizeDeepLink) return;
    const delay = search.trim() ? 250 : 0;
    const timeoutId = window.setTimeout(() => {
      void loadCustomers();
      void loadLeads();
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [teamMembersReady, customerManagerFilter, leadManagerFilter, loadCustomers, loadLeads, search, shouldPrioritizeDeepLink]);

  useEffect(() => {
    if (shouldPrioritizeDeepLink) return;
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
    customerManagerFilter,
    leadManagerFilter,
    loadCustomers,
    loadLeads,
    rows.length,
    search,
    shouldPrioritizeDeepLink,
    teamId,
  ]);

  // LTV (MVP): full-fetch trigger — see `ltvNeedsFullFetch` above.
  // Reuses the same `loadCustomers({ fetchAll, fullFetchKey })` pattern as
  // search, so a second toggle is cached and won't re-fetch.
  useEffect(() => {
    if (!ltvNeedsFullFetch || !teamId) return;
    if (activeTab !== "customers") return;
    if (customersLoading || customersRefreshing) return;
    if (!customersHasMore && rows.length >= (customersTotal || rows.length)) return;
    void loadCustomers({
      fetchAll: true,
      fullFetchKey: `ltv:${teamId}`,
    });
  }, [
    ltvNeedsFullFetch,
    teamId,
    activeTab,
    customersLoading,
    customersRefreshing,
    customersHasMore,
    customersTotal,
    rows.length,
    loadCustomers,
  ]);

  useEffect(() => {
    if (shouldPrioritizeDeepLink) return;
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
    shouldPrioritizeDeepLink,
    teamId,
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
    const { customerId, leadId, customerName, leadName, tab, key: linkKey } = customerDeepLink;
    if (!customerId && !leadId && !customerName && !leadName) {
      if (handledDeepLink !== null) setHandledDeepLink(null);
      return;
    }
    if (handledDeepLink === linkKey) return;
    let cancelled = false;

    const openDeepLinkedEntity = async () => {
      try {
        if (leadId) {
          setActiveTab("leads");
          const localLead = leadsRef.current.find((row) => row.id === leadId);
          const lead = localLead ?? (await fetchLeadById(leadId));
          if (!lead || cancelled) return;
          openEditLead(lead);
          return;
        }

        if (leadName) {
          setActiveTab("leads");
          const normalizedLeadName = normalizePartyMatch(leadName);
          const localLead = leadsRef.current.find((row) =>
            [row.company_name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedLeadName)
          );
          const lead = localLead ?? (await fetchLeadByName(leadName));
          if (!lead || cancelled) return;
          openEditLead(lead);
          return;
        }

        if (customerId) {
          if (tab === "customers" || !tab) setActiveTab("customers");
          const localCustomer = rowsRef.current.find((row) => row.id === customerId);
          const customer = localCustomer ?? (await fetchCustomerById(customerId));
          if (!customer || cancelled) return;
          openEdit(customer);
          return;
        }

        if (customerName) {
          setActiveTab("customers");
          const normalizedCustomerName = normalizePartyMatch(customerName);
          const localCustomer = rowsRef.current.find((row) =>
            [row.name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedCustomerName)
          );
          const customer = localCustomer ?? (await fetchCustomerByName(customerName));
          if (!customer || cancelled) return;
          openEdit(customer);
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Не вдалося відкрити картку.");
        if (leadId || leadName) {
          setActiveTab("leads");
          setLeadsError(message);
          return;
        }
        setActiveTab("customers");
        setCustomersError(message);
      } finally {
        if (!cancelled) setHandledDeepLink(linkKey);
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
    openEdit,
    openEditLead,
    customerDeepLink,
  ]);

  useEffect(() => {
    if (previousPathnameRef.current === location.pathname) {
      return;
    }

    previousPathnameRef.current = location.pathname;
    setDeleteDialogOpen(false);
    setLeadDeleteDialogOpen(false);

    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
      document.body.removeAttribute("data-scroll-locked");
    }
  }, [location.pathname]);


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
    <UnifiedPageToolbar
      topLeft={
        <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "customers"}
            onClick={() => setActiveTab("customers")}
            className={SEGMENTED_TRIGGER}
          >
            <Building2 className="h-4 w-4" />
            Замовники
            <CountBadge value={customersTotal} className="ml-1.5" />
          </Button>
          <Button
            type="button"
            variant="segmented"
            size="xs"
            aria-pressed={activeTab === "leads"}
            onClick={() => setActiveTab("leads")}
            className={SEGMENTED_TRIGGER}
          >
            <Users className="h-4 w-4" />
            Ліди
            <CountBadge value={leadsTotal} className="ml-1.5" />
          </Button>
        </SegmentedGroup>
      }
      topRight={
        <Button
          onClick={() => (activeTab === "customers" ? openCustomerCreate() : openLeadCreate())}
          className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
        >
          <Plus className="h-4 w-4" />
          {activeTab === "customers" ? "Новий замовник" : "Новий лід"}
        </Button>
      }
      search={
        <ToolbarSearch
          value={search}
          onChange={setSearch}
          placeholder={activeTab === "customers" ? "Пошук замовника..." : "Пошук ліда..."}
        />
      }
      filters={
        <>
        <ToolbarFilterBar>
        {/* Сегмент — між пошуком і менеджером, як просив Артем: спершу «кого
            саме» за поведінкою, потім «чий». Показуємо лише коли є дані LTV:
            без них усі 100% замовників були б «Без замовлень». */}
        {activeTab === "customers" && hasAnyLtv ? (
          <ToolbarFilterSelect
            label="Сегмент" value={segmentFilter}
            onValueChange={(value) => setSegmentFilter(value as RfmSegment | "all")}
            neutralValue="all"
            className="sm:w-[190px]"
            options={[
              { value: "all", label: `Усі сегменти (${segmentCounts.all})` },
              ...(["champion", "loyal", "new", "at_risk", "dormant", "none"] as const)
                // Порожній сегмент у списку — це вибір, який гарантовано дає
                // порожню таблицю. Ховаємо, як ховала й смуга пігулок.
                .filter((segment) => segmentCounts[segment] > 0)
                .map((segment) => ({
                  value: segment,
                  label: `${RFM_SEGMENT_LABELS[segment]} (${segmentCounts[segment]})`,
                })),
            ]}
          />
        ) : null}
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
              fallbackClassName="text-3xs font-semibold"
              inactive={isInactiveEmployment(memberById.get(userId ?? "")?.employmentStatus)}
            />
            <span className="truncate">{currentManagerLabel || defaultManagerName || "Менеджер"}</span>
          </div>
        ) : (
          <ToolbarFilterSelect
            label="Менеджер" value={activeTab === "customers" ? customerManagerFilter : leadManagerFilter}
            onValueChange={(value) => {
              if (activeTab === "customers") setCustomerManagerFilter(value);
              else setLeadManagerFilter(value);
            }}
            neutralValue={ALL_MANAGERS_FILTER}
            className="sm:w-[220px]"
            options={[
              { value: ALL_MANAGERS_FILTER, label: "Всі менеджери" },
              ...(activeTab === "customers" ? customerManagerOptions : leadManagerOptions).map((manager) => ({
                value: manager,
                label: renderManagerFilterValue(manager),
              })),
            ]}
          />
        )}
        </ToolbarFilterBar>
        </>
      }
      meta={
        <ToolbarMeta
          count={activeTab === "customers" ? customersTotal : leadsTotal} unit={activeTab === "customers" ? ["замовник", "замовники", "замовників"] : ["лід", "ліди", "лідів"]}
          onReset={clearFilters}
          showReset={hasActiveFilters}
          loading={
            activeTab === "customers"
              ? customersLoading || customersRefreshing
              : leadsLoading || leadsRefreshing
          }
        />
      }
      searchClassName="xl:max-w-[420px]"
    />
  ), [
    activeTab,
    hasAnyLtv,
    segmentCounts,
    segmentFilter,
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
    openCustomerCreate,
    openLeadCreate,
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
          <div className="mb-4 rounded-xl border tone-warning-subtle p-3">
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-sm font-medium tone-text-warning">Схожі компанії в інших менеджерів</p>
                <p className="text-xs tone-text-warning">
                  Ви й далі бачите тільки свої записи, але пошук підсвічує можливі дублікати в команді.
                </p>
              </div>
              {crossManagerMatchesLoading ? (
                <InlineLoading
                  label="Шукаємо збіги по команді..."
                  className="min-h-6 text-xs tone-text-warning"
                  spinnerClassName="h-3 w-3 tone-text-warning"
                  textClassName="text-xs tone-text-warning"
                />
              ) : crossManagerMatches.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {crossManagerMatches.map((match) => (
                    <div
                      key={`${match.entityType}-${match.id}`}
                      className="min-w-[220px] rounded-lg border border-warning-soft-border bg-background/85 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          tone="warning"
                          className="text-3xs uppercase tracking-wide"
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
                <p className="text-xs tone-text-warning">Схожих записів в інших менеджерів не знайдено.</p>
              )}
            </div>
          </div>
        ) : null}
        <TabsContent value="customers" className="mt-0 pt-0">
            {/* clip, а не hidden: hidden робить цей div контейнером скролу й
                гасить липку шапку таблиці всередині (див. проп stickyHeader). */}
            <div className="overflow-x-clip">
              {/* Смуга пігулок сегментів переїхала в тулбар — фільтром між пошуком
                  і «Всі менеджери». Вона займала окремий рядок над таблицею й
                  розповзалась на сім бейджів, хоч питання те саме, що в решти
                  фільтрів: «кого показувати». */}
              {customersLoading ? (
              <AppSectionLoader label="Готуємо список замовників..." variant="table" />
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
                      const missingRequisitesLabel = getCustomerMissingRequisitesLabel(row);
                      const missingRequisitesTooltip = missingRequisitesLabel ?? "Реквізити не заповнені";

                      return (
                        <div
                          key={row.id}
                          className="rounded-inner border border-border bg-card p-4"
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
                                {/* LTV (MVP): mobile — compact line with sum + segment chip */}
                                {(() => {
                                  const ltv = customerLtvMap.get(row.id);
                                  const segment = customerSegmentMap.get(row.id) ?? "none";
                                  if (!ltv) {
                                    return legalEntities.length > 1 ? (
                                      <div className="text-xs text-muted-foreground truncate">
                                        {legalEntities.length} юр. ос.
                                      </div>
                                    ) : null;
                                  }
                                  return (
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground tabular-nums">
                                        {formatOrderMoney(ltv.lifetimeRevenue, ltv.currency)}
                                      </span>
                                      <span className="opacity-70">· {ltv.ordersCount} зам.</span>
                                      {segment !== "none" ? (
                                        <Badge
                                          tone={RFM_SEGMENT_TONE[segment]}
                                          variant="outline"
                                          className="rounded-full px-1.5 py-0 text-3xs font-medium normal-case tracking-normal"
                                        >
                                          {RFM_SEGMENT_LABELS[segment]}
                                        </Badge>
                                      ) : null}
                                      {legalEntities.length > 1 ? (
                                        <span className="opacity-70">· {legalEntities.length} юр.ос.</span>
                                      ) : null}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            <div onClick={(event) => event.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="iconSm">
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
                                      <DropdownMenuItem onClick={() => void runCustomerDropboxAction(row.id, "open", () => openCustomerBrandFolder(row.id, row.name ?? row.legal_name ?? ""))}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Матеріали замовника (Бренд)
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
                            {renderPrimaryEntityLabel(row) ? (
                              <div>
                                <span className="text-muted-foreground">
                                  {legalEntities.length > 1 ? "Основна юр. особа:" : "Юр. особа:"}
                                </span>{" "}
                                <span>{renderPrimaryEntityLabel(row)}</span>
                              </div>
                            ) : null}
                            {missingRequisitesLabel ? (
                              <EmptyFieldAction label="Додати реквізити" title={missingRequisitesTooltip} onClick={() => openEdit(row)} className="justify-self-start" />
                            ) : null}
                            {primaryEntity?.taxId ? (
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
                            {row.website ? <ExternalSiteLink url={row.website} className="sm:col-span-2" /> : null}
                          </div>
                        </div>
                      );
                    })()
                  ))}
                </div>
                <div ref={customersTableRef} className="hidden md:block">
                  {/* Горизонтальний скрол знято свідомо (рішення Артема):
                      колонки стискаються на вузькому екрані, зате шапка
                      липне — без цього обгортка з overflow-auto лишалась би
                      контейнером скролу й гасила липкість. */}
                  <Table variant="list" size="md" stickyHeader className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <ResizableHead spec={CUSTOMERS_TABLE_COLUMNS} columnId="company" controller={customersColumns} />
                        <TableHead className="w-[76px] px-2">Тип</TableHead>
                        <ResizableHead spec={CUSTOMERS_TABLE_COLUMNS} columnId="entity" controller={customersColumns} className="pl-2" />
                        <ResizableHead spec={CUSTOMERS_TABLE_COLUMNS} columnId="site" controller={customersColumns} />
                        <ResizableHead spec={CUSTOMERS_TABLE_COLUMNS} columnId="manager" controller={customersColumns} />
                        {/* LTV (MVP) */}
                        <ResizableHead spec={CUSTOMERS_TABLE_COLUMNS} columnId="ltv" controller={customersColumns} className="text-right pr-2">
                          <button
                            type="button"
                            onClick={cycleLtvSort}
                            className={cn(
                              "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 -mr-1.5 font-medium transition-colors",
                              "hover:bg-muted/60 cursor-pointer",
                              ltvSortDirection !== "default" ? "text-foreground bg-muted/40" : "text-muted-foreground hover:text-foreground"
                            )}
                            title={
                              ltvSortDirection === "desc"
                                ? "Сортовано: від найбільшої. Клік: від найменшої"
                                : ltvSortDirection === "asc"
                                ? "Сортовано: від найменшої. Клік: скинути сортування"
                                : "Lifetime Value — клік щоб сортувати від найбільшої. Завантажить всіх клієнтів"
                            }
                          >
                            LTV
                            {ltvSortDirection === "desc" ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : ltvSortDirection === "asc" ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        </ResizableHead>
                        <TableHead className="min-w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => {
                        const legalEntities = getCustomerLegalEntities(row);
                        const primaryEntity = getCustomerPrimaryLegalEntity(row);
                        const primaryEntityType = getCustomerPrimaryLegalEntityType(row);
                        const missingRequisitesLabel = getCustomerMissingRequisitesLabel(row);
                        const missingRequisitesTooltip = missingRequisitesLabel ?? "Реквізити не заповнені";

                        return (
                          <TableRow
                            key={row.id}
                            className={cn(
                              "group cursor-pointer border-b border-border/30 last:border-0 transition-colors",
                              "hover:bg-muted/30"
                            )}
                            onClick={() => openEdit(row)}
                          >
                            <TableCell>
                              <CustomerHoverCard teamId={teamId} userId={userId} customerId={row.id} onOpenPanel={() => openEdit(row)}>
                                <TableTitleCell
                                  leading={
                                    <EntityAvatar
                                      src={row.logo_url ?? null}
                                      name={row.name ?? row.legal_name ?? "Компанія"}
                                      fallback={getInitials(row.name ?? row.legal_name)}
                                      size={28}
                                    />
                                  }
                                  title={row.name ?? "Не вказано"}
                                  meta={[legalEntities.length > 1 ? `${legalEntities.length} юр. ос.` : null]}
                                />
                              </CustomerHoverCard>
                            </TableCell>
                            <TableCell className="px-2">
                              {primaryEntityType ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full px-2.5 py-0.5 text-2xs"
                                >
                                  {primaryEntityType}
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="pl-2">
                              {/* Два рядки максимум: юрназва і сірий «Код · +N ще». Без
                                  юрназви — лише дія «Додати реквізити». */}
                              {renderPrimaryEntityLabel(row) ? (
                                <TableTitleCell
                                  title={renderPrimaryEntityLabel(row)}
                                  meta={[
                                    primaryEntity && hasCustomerLegalEntityDocumentEssentials(primaryEntity) && primaryEntity.taxId
                                      ? `Код ${primaryEntity.taxId}`
                                      : null,
                                    missingRequisitesLabel ? (
                                      <EmptyFieldAction key="add" label="Додати реквізити" title={missingRequisitesTooltip} onClick={() => openEdit(row)} />
                                    ) : null,
                                    legalEntities.length > 1 ? `+${legalEntities.length - 1} ще` : null,
                                  ]}
                                />
                              ) : missingRequisitesLabel ? (
                                <EmptyFieldAction label="Додати реквізити" title={missingRequisitesTooltip} onClick={() => openEdit(row)} />
                              ) : null}
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              {row.website ? <ExternalSiteLink url={row.website} className="block" /> : null}
                            </TableCell>
                            <TableCell>{renderManagerCell(row.manager_user_id, row.manager)}</TableCell>
                            {/* LTV (MVP) */}
                            <TableCell className="text-right pr-2">
                              {(() => {
                                const ltv = customerLtvMap.get(row.id);
                                const segment = customerSegmentMap.get(row.id) ?? "none";
                                if (!ltv) {
                                  return <span className="text-muted-foreground">—</span>;
                                }
                                return (
                                  <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                    {segment !== "none" ? (
                                      <Badge
                                        tone={RFM_SEGMENT_TONE[segment]}
                                        variant="outline"
                                        className="rounded-full px-2 py-0 text-3xs font-medium normal-case tracking-normal"
                                      >
                                        {RFM_SEGMENT_LABELS[segment]}
                                      </Badge>
                                    ) : null}
                                    <span
                                      className="font-medium"
                                      title={buildCustomerLtvTooltip(ltv)}
                                    >
                                      {formatOrderMoney(ltv.lifetimeRevenue, ltv.currency)}
                                      {ltv.mixedCurrencies ? <sup className="ml-0.5 text-muted-foreground">*</sup> : null}
                                    </span>
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell
                              className="w-12 pr-4 text-right"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="iconSm"
                                    className="opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                                    aria-label="Дії замовника"
                                  >
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
                  <div className="flex flex-col items-center justify-center gap-2 px-4 pb-6 pt-4 md:px-6">
                    <div ref={customersSentinelRef} aria-hidden className="h-px w-full" />
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

        <TabsContent value="leads" className="mt-0 pt-0">
          <div className="overflow-x-clip">
            {leadsLoading ? (
              <AppSectionLoader label="Готуємо список лідів..." variant="table" />
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
                      className="rounded-inner border border-border bg-card p-4"
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
                              <Button variant="ghost" size="iconSm">
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
                        {lead.telegram ? <div><span className="text-muted-foreground">Telegram:</span> {formatTelegramHandle(lead.telegram)}</div> : null}
                        <div><span className="text-muted-foreground">Джерело:</span> {lead.source ?? "Не вказано"}</div>
                        <div><span className="text-muted-foreground">Менеджер:</span> {resolveManagerLabel(lead.manager_user_id, lead.manager) || "Не вказано"}</div>
                        {lead.website ? <ExternalSiteLink url={lead.website} className="block" /> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div ref={leadsTableRef} className="hidden md:block">
                  <Table variant="list" size="md" stickyHeader className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {LEADS_TABLE_COLUMNS.ids.map((id) => <ResizableHead key={id} spec={LEADS_TABLE_COLUMNS} columnId={id} controller={leadsColumns} />)}
                        <TableHead className="min-w-12"></TableHead>
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
                            <div className="flex min-w-0 items-center gap-3">
                              <EntityAvatar
                                src={lead.logo_url ?? null}
                                name={lead.company_name ?? lead.legal_name ?? "Лід"}
                                fallback={getInitials(lead.company_name ?? lead.legal_name)}
                                size={36}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{lead.company_name ?? "Не вказано"}</div>
                                {lead.legal_name ? (
                                  <div className="truncate text-xs text-muted-foreground">{lead.legal_name}</div>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="truncate">
                              {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Не вказано"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="truncate" title={lead.email ?? undefined}>
                              {lead.email ?? "Не вказано"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="truncate" title={leadContactLabel(lead)}>
                              {leadContactLabel(lead)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="truncate" title={lead.source ?? undefined}>
                              {lead.source ?? "Не вказано"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lead.website ? (
                              <ExternalSiteLink url={lead.website} className="block" />
                            ) : (
                              "Не вказано"
                            )}
                          </TableCell>
                          <TableCell>{renderManagerCell(lead.manager_user_id, lead.manager)}</TableCell>
                          <TableCell
                            className="w-12 pr-4 text-right"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="iconSm"
                                  className="opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                                  aria-label="Дії ліда"
                                >
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
                  <div className="flex flex-col items-center justify-center gap-2 px-4 pb-6 pt-4 md:px-6">
                    <div ref={leadsSentinelRef} aria-hidden className="h-px w-full" />
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

      {partyCreateDialogs}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        {/* Підтвердження, а не форма: тут нема введеного, яке можна втратити. */}
        <DialogContent dismissible className="sm:max-w-[420px]">
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
        {/* Підтвердження, а не форма: тут нема введеного, яке можна втратити. */}
        <DialogContent dismissible className="sm:max-w-[420px]">
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
  const { teamId, session } = useAuth();

  // Гейта на auth loading тут немає свідомо: поки він true, RequireAuth малює
  // оболонку застосунку, і жодна сторінка не монтується. Дубль лише додавав ще
  // один кадр із лоадером (REQ-19).
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
