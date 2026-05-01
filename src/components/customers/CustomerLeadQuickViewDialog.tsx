import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { supabase } from "@/lib/supabaseClient";
import { listCustomerQuotes, listCustomersBySearch, listLeadsBySearch } from "@/lib/toshoApi";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { resolveWorkspaceId } from "@/lib/workspace";
import { areCompanyNamesEquivalent } from "@/lib/companyNameSearch";
import {
  parseCustomerLegalEntities,
  formatCustomerLegalEntitySummary,
} from "@/lib/customerLegalEntities";
import { statusLabels as quoteStatusLabels, statusClasses as quoteStatusClasses } from "@/features/quotes/quotes-page/config";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { DESIGN_TASK_TYPE_ICONS, DESIGN_TASK_TYPE_LABELS, parseDesignTaskType } from "@/lib/designTaskType";
import {
  Building2,
  CalendarDays,
  Loader2,
  Mail,
  PackageCheck,
  Phone,
  ReceiptText,
  User,
  ExternalLink,
} from "lucide-react";

type CustomerRow = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  website?: string | null;
  logo_url?: string | null;
  legal_entities?: unknown;
  contacts?: Array<{
    name?: string | null;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
  }> | null;
  contact_name?: string | null;
  contact_position?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
};

type LeadRow = {
  id: string;
  company_name?: string | null;
  legal_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_numbers?: string[] | null;
  source?: string | null;
  website?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  logo_url?: string | null;
};

type RelatedQuoteRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
};

type RelatedOrderRow = {
  id: string;
  quoteNumber?: string | null;
  orderStatus?: string | null;
  total?: number | null;
  createdAt?: string | null;
};

type RelatedDesignRow = {
  id: string;
  number?: string | null;
  title?: string | null;
  status?: string | null;
  type?: string | null;
  created_at?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  userId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerLogoUrl?: string | null;
};

const CUSTOMER_COLUMNS = [
  "id",
  "name",
  "legal_name",
  "manager",
  "manager_user_id",
  "website",
  "logo_url",
  "legal_entities",
  "contacts",
  "contact_name",
  "contact_position",
  "contact_phone",
  "contact_email",
].join(",");

const LEAD_COLUMNS = [
  "id",
  "company_name",
  "legal_name",
  "first_name",
  "last_name",
  "email",
  "phone_numbers",
  "source",
  "website",
  "manager",
  "manager_user_id",
  "logo_url",
].join(",");
const LEAD_COLUMNS_WITHOUT_MANAGER_USER_ID = LEAD_COLUMNS.replace("manager_user_id,", "");
const LEAD_COLUMNS_BASE = LEAD_COLUMNS_WITHOUT_MANAGER_USER_ID.replace("logo_url,", "");

type LeadColumnsVariant = "full" | "no_manager_user_id" | "base";

const getLeadColumns = (variant: LeadColumnsVariant) => {
  if (variant === "base") return LEAD_COLUMNS_BASE;
  if (variant === "no_manager_user_id") return LEAD_COLUMNS_WITHOUT_MANAGER_USER_ID;
  return LEAD_COLUMNS;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
};

const getFallbackLeadColumnsVariant = (variant: LeadColumnsVariant, message: string): LeadColumnsVariant | null => {
  if (!/column/i.test(message)) return null;
  if (variant === "full" && /manager_user_id/i.test(message)) return "no_manager_user_id";
  if ((variant === "full" || variant === "no_manager_user_id") && /logo_url/i.test(message)) return "base";
  return null;
};

const normalizePartyMatch = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");

const normalizeMemberKey = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const escapePostgrestTerm = (value: string) => value.replace(/[%_]/g, (char) => `\\${char}`);

const pickBestLeadMatch = (rows: LeadRow[], name: string) => {
  const normalizedName = normalizePartyMatch(name);
  return (
    rows.find((row) =>
      [row.company_name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedName)
    ) ??
    rows.find((row) =>
      [row.company_name ?? "", row.legal_name ?? ""].some((value) => areCompanyNamesEquivalent(value, name))
    ) ??
    rows.find((row) =>
      [row.company_name ?? "", row.legal_name ?? ""].some((value) => {
        const normalizedValue = normalizePartyMatch(value);
        return Boolean(normalizedName && normalizedValue && (normalizedValue.includes(normalizedName) || normalizedName.includes(normalizedValue)));
      })
    ) ??
    rows[0] ??
    null
  );
};

const getInitials = (value?: string | null) => {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase();
};

const formatLinkedMoney = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const orderStatusLabels: Record<string, string> = {
  new: "Нове",
  awaiting_payment: "Очікує оплату",
  paid: "Оплачено",
  not_shipped: "Не відвантажено",
  shipped: "Відвантажено",
};

function buildPrimaryContact(customer: CustomerRow | null) {
  if (!customer) return null;
  const firstContact = Array.isArray(customer.contacts) ? customer.contacts.find((entry) => entry && Object.values(entry).some(Boolean)) : null;
  return {
    name: firstContact?.name?.trim() || customer.contact_name?.trim() || null,
    position: firstContact?.position?.trim() || customer.contact_position?.trim() || null,
    phone: firstContact?.phone?.trim() || customer.contact_phone?.trim() || null,
    email: firstContact?.email?.trim() || customer.contact_email?.trim() || null,
  };
}

export function CustomerLeadQuickViewDialog({
  open,
  onOpenChange,
  teamId,
  userId,
  customerId,
  customerName,
  customerLogoUrl,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<"overview" | "quotes" | "orders" | "design">("overview");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [entityKind, setEntityKind] = React.useState<"customer" | "lead" | null>(null);
  const [customer, setCustomer] = React.useState<CustomerRow | null>(null);
  const [lead, setLead] = React.useState<LeadRow | null>(null);
  const [quotes, setQuotes] = React.useState<RelatedQuoteRow[]>([]);
  const [orders, setOrders] = React.useState<RelatedOrderRow[]>([]);
  const [designTasks, setDesignTasks] = React.useState<RelatedDesignRow[]>([]);
  const [memberAvatarById, setMemberAvatarById] = React.useState<Record<string, string | null>>({});
  const [memberAvatarByLabel, setMemberAvatarByLabel] = React.useState<Record<string, string | null>>({});

  React.useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;

    const loadMembers = async () => {
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) return;
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        if (cancelled) return;
        setMemberAvatarById(
          rows.reduce<Record<string, string | null>>((acc, row) => {
            acc[row.userId] = row.avatarDisplayUrl ?? row.avatarUrl ?? null;
            return acc;
          }, {})
        );
        setMemberAvatarByLabel(
          rows.reduce<Record<string, string | null>>((acc, row) => {
            const normalizedLabel = normalizeMemberKey(row.label);
            if (normalizedLabel) acc[normalizedLabel] = row.avatarDisplayUrl ?? row.avatarUrl ?? null;
            return acc;
          }, {})
        );
      } catch {
        if (!cancelled) {
          setMemberAvatarById({});
          setMemberAvatarByLabel({});
        }
      }
    };

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  React.useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const normalizedName = normalizePartyMatch(customerName);

        let nextCustomer: CustomerRow | null = null;
        let nextLead: LeadRow | null = null;

        const loadCustomerById = async (id: string) => {
          const { data, error: customerError } = await supabase
            .schema("tosho")
            .from("customers")
            .select(CUSTOMER_COLUMNS)
            .eq("team_id", teamId)
            .eq("id", id)
            .maybeSingle<CustomerRow>();
          if (customerError) throw customerError;
          return data ?? null;
        };

        const loadLeadById = async (id: string) => {
          const runLeadQuery = async (variant: LeadColumnsVariant) =>
            await supabase
              .schema("tosho")
              .from("leads")
              .select(getLeadColumns(variant))
              .eq("team_id", teamId)
              .eq("id", id)
              .maybeSingle<LeadRow>();

          let variant: LeadColumnsVariant = "full";
          let { data, error: leadError } = await runLeadQuery(variant);
          let fallbackVariant: LeadColumnsVariant | null = leadError
            ? getFallbackLeadColumnsVariant(variant, getErrorMessage(leadError))
            : null;
          while (leadError && fallbackVariant) {
            variant = fallbackVariant;
            ({ data, error: leadError } = await runLeadQuery(variant));
            fallbackVariant = leadError ? getFallbackLeadColumnsVariant(variant, getErrorMessage(leadError)) : null;
          }
          if (leadError) throw leadError;
          return data ?? null;
        };

        const loadLeadByName = async (name: string) => {
          const trimmedName = name.trim();
          if (!trimmedName) return null;
          const escapedName = escapePostgrestTerm(trimmedName);

          const runQueryWithFallback = async (
            buildQuery: (columns: string) => any
          ) => {
            let variant: LeadColumnsVariant = "full";
            let response = await buildQuery(getLeadColumns(variant));
            let fallbackVariant: LeadColumnsVariant | null = response.error
              ? getFallbackLeadColumnsVariant(variant, getErrorMessage(response.error))
              : null;
            while (response.error && fallbackVariant) {
              variant = fallbackVariant;
              response = await buildQuery(getLeadColumns(variant));
              fallbackVariant = response.error
                ? getFallbackLeadColumnsVariant(variant, getErrorMessage(response.error))
                : null;
            }
            if (response.error) throw response.error;
            return (((response.data ?? []) as unknown) as LeadRow[]);
          };

          const [companyRows, legalRows] = await Promise.all([
            runQueryWithFallback((columns) =>
              supabase
                .schema("tosho")
                .from("leads")
                .select(columns)
                .eq("team_id", teamId)
                .ilike("company_name", `%${escapedName}%`)
                .limit(20)
            ),
            runQueryWithFallback((columns) =>
              supabase
                .schema("tosho")
                .from("leads")
                .select(columns)
                .eq("team_id", teamId)
                .ilike("legal_name", `%${escapedName}%`)
                .limit(20)
            ),
          ]);
          const directMatches = [...companyRows, ...legalRows].filter(
            (row, index, rows) => row.id && rows.findIndex((candidate) => candidate.id === row.id) === index
          );
          const directMatch = pickBestLeadMatch(directMatches, trimmedName);
          if (directMatch) return directMatch;

          const allRows = await runQueryWithFallback((columns) =>
            supabase
              .schema("tosho")
              .from("leads")
              .select(columns)
              .eq("team_id", teamId)
              .order("company_name", { ascending: true })
              .limit(1000)
          );
          return pickBestLeadMatch(allRows, trimmedName);
        };

        if (customerId) {
          nextCustomer = await loadCustomerById(customerId);
        }

        if (!nextCustomer && normalizedName) {
          nextLead = await loadLeadByName(customerName ?? "");

          const [leadMatches, customerMatches] = nextLead
            ? [[], await listCustomersBySearch(teamId, customerName ?? "")]
            : await Promise.all([
                listLeadsBySearch(teamId, customerName ?? ""),
                listCustomersBySearch(teamId, customerName ?? ""),
              ]);

          const matchedLead = nextLead
            ? null
            : leadMatches.find((row) =>
                [row.company_name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedName)
              ) ?? leadMatches[0] ?? null;
          if (!nextLead && matchedLead?.id) {
            nextLead = await loadLeadById(matchedLead.id);
          }

          if (!nextLead) {
            const matchedCustomer =
              customerMatches.find((row) =>
                [row.name ?? "", row.legal_name ?? ""].some((value) => normalizePartyMatch(value) === normalizedName)
              ) ?? customerMatches[0] ?? null;
            if (matchedCustomer?.id) {
              nextCustomer = await loadCustomerById(matchedCustomer.id);
            }
          }
        }

        if (!nextCustomer && !nextLead) {
          throw new Error("Не вдалося знайти замовника або ліда.");
        }

        const quoteMap = new Map<string, RelatedQuoteRow>();
        if (nextCustomer?.id) {
          const directQuotes = await listCustomerQuotes({ teamId, customerId: nextCustomer.id, limit: 100 });
          directQuotes.forEach((row) => quoteMap.set(row.id, row));
        }

        const names = new Set<string>();
        if (nextCustomer) {
          [nextCustomer.name, nextCustomer.legal_name].forEach((value) => {
            if (value?.trim()) names.add(value.trim());
          });
        }
        if (nextLead) {
          [nextLead.company_name, nextLead.legal_name].forEach((value) => {
            if (value?.trim()) names.add(value.trim());
          });
        }

        if (names.size > 0) {
          const orFilter = Array.from(names)
            .flatMap((value) => [`customer_name.eq.${value}`, `title.eq.${value}`])
            .join(",");
          const { data: quoteRows, error: quoteError } = await supabase
            .schema("tosho")
            .from("quotes")
            .select("id,number,status,total,created_at,customer_id,customer_name,title")
            .eq("team_id", teamId)
            .or(orFilter)
            .order("created_at", { ascending: false })
            .limit(100);
          if (quoteError) throw quoteError;
          ((((quoteRows as unknown) as Array<RelatedQuoteRow & { customer_id?: string | null; customer_name?: string | null; title?: string | null }>) ?? [])).forEach((row) => {
            const rowName = normalizePartyMatch(row.customer_name ?? row.title ?? null);
            if (nextCustomer?.id && row.customer_id === nextCustomer.id) {
              quoteMap.set(row.id, row);
              return;
            }
            if (!nextCustomer?.id && rowName && Array.from(names).some((value) => normalizePartyMatch(value) === rowName)) {
              quoteMap.set(row.id, row);
            }
          });
        }

        const quoteIds = Array.from(quoteMap.keys());

        const [ordersResult, designResult] = await Promise.allSettled([
          loadDerivedOrders(teamId, userId),
          supabase
            .from("activity_log")
            .select(
              "id,title,created_at,status:metadata->>status,design_task_number:metadata->>design_task_number,design_task_type:metadata->>design_task_type,entity_id,customer_id:metadata->>customer_id,customer_name:metadata->>customer_name,quote_id:metadata->>quote_id"
            )
            .eq("team_id", teamId)
            .eq("action", "design_task")
            .order("created_at", { ascending: false })
            .limit(200),
        ]);

        const nextOrders =
          ordersResult.status === "fulfilled"
            ? ordersResult.value
                .filter((row) => {
                  const orderName = normalizePartyMatch(row.customerName ?? null);
                  if (nextCustomer?.id && row.customerId === nextCustomer.id) return true;
                  if (quoteIds.includes(row.quoteId)) return true;
                  return orderName && Array.from(names).some((value) => normalizePartyMatch(value) === orderName);
                })
                .map((row) => ({
                  id: row.id,
                  quoteNumber: row.quoteNumber ?? null,
                  orderStatus: row.orderStatus ?? null,
                  total: row.total ?? null,
                  createdAt: row.createdAt ?? null,
                }))
            : [];

        const nextDesignTasks =
          designResult.status === "fulfilled"
            ? (((designResult.value.data ?? []) as unknown) as Array<{
                id: string;
                title?: string | null;
                created_at?: string | null;
                status?: string | null;
                design_task_number?: string | null;
                design_task_type?: string | null;
                entity_id?: string | null;
                customer_id?: string | null;
                customer_name?: string | null;
                quote_id?: string | null;
              }>)
                .filter((row) => {
                  if (nextCustomer?.id && row.customer_id === nextCustomer.id) return true;
                  if (row.quote_id && quoteIds.includes(row.quote_id)) return true;
                  const taskName = normalizePartyMatch(row.customer_name ?? null);
                  return taskName && Array.from(names).some((value) => normalizePartyMatch(value) === taskName);
                })
                .map((row) => ({
                  id: row.id,
                  number: row.design_task_number ?? null,
                  title: row.title ?? "Дизайн-задача",
                  status: row.status ?? "new",
                  type: row.design_task_type ?? null,
                  created_at: row.created_at ?? null,
                }))
            : [];

        if (cancelled) return;
        setEntityKind(nextCustomer ? "customer" : "lead");
        setCustomer(nextCustomer);
        setLead(nextLead);
        setQuotes(Array.from(quoteMap.values()).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")));
        setOrders(nextOrders);
        setDesignTasks(nextDesignTasks);
      } catch (loadError) {
        if (cancelled) return;
        setEntityKind(null);
        setCustomer(null);
        setLead(null);
        setQuotes([]);
        setOrders([]);
        setDesignTasks([]);
        setError(loadError instanceof Error ? loadError.message : "Не вдалося завантажити картку.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [customerId, customerName, open, teamId, userId]);

  React.useEffect(() => {
    if (!open) {
      setTab("overview");
    }
  }, [open]);

  const title = entityKind === "customer" ? customer?.name ?? customer?.legal_name ?? customerName : lead?.company_name ?? lead?.legal_name ?? customerName;
  const avatarSrc = customer?.logo_url ?? lead?.logo_url ?? customerLogoUrl ?? null;
  const primaryContact = buildPrimaryContact(customer);
  const primaryLegalEntity = customer ? parseCustomerLegalEntities(customer)[0] ?? null : null;
  const managerLabel = customer?.manager ?? lead?.manager ?? null;
  const managerUserId = customer?.manager_user_id ?? lead?.manager_user_id ?? null;
  const managerAvatarUrl =
    (managerUserId ? memberAvatarById[managerUserId] ?? null : null) ??
    (managerLabel ? memberAvatarByLabel[normalizeMemberKey(managerLabel)] ?? null : null);

  const renderRelationCard = React.useCallback(
    (
      kind: "quote" | "order" | "design",
      item: RelatedQuoteRow | RelatedOrderRow | RelatedDesignRow,
      onOpen: () => void
    ) => {
      if (kind === "quote") {
        const row = item as RelatedQuoteRow;
        return (
          <button
            key={row.id}
            type="button"
            onClick={onOpen}
            className="w-full rounded-xl border border-border/60 bg-card/80 p-4 text-left transition-colors hover:border-primary/35 hover:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ReceiptText className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{row.number ?? "Прорахунок"}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge className={quoteStatusClasses[row.status ?? "new"] ?? "bg-muted text-muted-foreground"}>
                      {quoteStatusLabels[row.status ?? "new"] ?? row.status ?? "Статус невідомий"}
                    </Badge>
                    {formatLinkedMoney(row.total) ? <Badge variant="outline">{formatLinkedMoney(row.total)}</Badge> : null}
                  </div>
                </div>
              </div>
              {formatDate(row.created_at) ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(row.created_at)}
                </div>
              ) : null}
            </div>
          </button>
        );
      }

      if (kind === "order") {
        const row = item as RelatedOrderRow;
        return (
          <button
            key={row.id}
            type="button"
            onClick={onOpen}
            className="w-full rounded-xl border border-border/60 bg-card/80 p-4 text-left transition-colors hover:border-primary/35 hover:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border tone-icon-box-success">
                  <PackageCheck className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{row.quoteNumber ?? "Замовлення"}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="outline">{orderStatusLabels[row.orderStatus ?? "new"] ?? "Нове"}</Badge>
                    {formatLinkedMoney(row.total) ? <Badge variant="outline">{formatLinkedMoney(row.total)}</Badge> : null}
                  </div>
                </div>
              </div>
              {formatDate(row.createdAt) ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(row.createdAt)}
                </div>
              ) : null}
            </div>
          </button>
        );
      }

      const row = item as RelatedDesignRow;
      const normalizedType = parseDesignTaskType(row.type) ?? "creative";
      const designStatusKey = (row.status ?? "new") as keyof typeof DESIGN_STATUS_LABELS;
      const DesignTypeIcon = DESIGN_TASK_TYPE_ICONS[normalizedType];
      return (
        <button
          key={row.id}
          type="button"
          onClick={onOpen}
          className="w-full rounded-xl border border-border/60 bg-card/80 p-4 text-left transition-colors hover:border-primary/35 hover:bg-muted/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border tone-icon-box-accent">
                <DesignTypeIcon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-foreground">{row.number ?? row.title ?? "Дизайн-задача"}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge variant="outline">{DESIGN_STATUS_LABELS[designStatusKey] ?? "Нова"}</Badge>
                  <Badge variant="outline">{DESIGN_TASK_TYPE_LABELS[normalizedType]}</Badge>
                </div>
              </div>
            </div>
            {formatDate(row.created_at) ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(row.created_at)}
              </div>
            ) : null}
          </div>
        </button>
      );
    },
    [navigate]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[3vh] max-h-[92vh] max-w-[780px] translate-y-0 overflow-y-auto sm:top-[4vh]">
        <DialogHeader>
          <DialogTitle>Картка {entityKind === "lead" ? "ліда" : "замовника"}</DialogTitle>
          <DialogDescription>Швидкий перегляд пов’язаної сутності без переходу на сторінку замовників.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <AppSectionLoader />
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border/60 bg-card/90 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <EntityAvatar src={avatarSrc} name={title ?? undefined} fallback={getInitials(title)} size={52} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-xl font-semibold text-foreground">{title ?? "Не вказано"}</div>
                      <Badge variant="outline">{entityKind === "lead" ? "Лід" : "Замовник"}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {managerLabel ? (
                        <span className="inline-flex items-center gap-2">
                          <AvatarBase
                            src={managerAvatarUrl}
                            name={managerLabel}
                            fallback={getInitials(managerLabel)}
                            size={22}
                            className="border-border/70"
                          />
                          {managerLabel}
                        </span>
                      ) : null}
                      {(customer?.website || lead?.website) ? (
                        <a
                          href={customer?.website ?? lead?.website ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-primary hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Сайт
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (entityKind === "customer" && customer?.id) {
                      navigate(`/orders/customers?customerId=${customer.id}`);
                      return;
                    }
                    if (entityKind === "lead" && lead?.id) {
                      navigate(`/orders/customers?tab=leads&leadId=${lead.id}`);
                      return;
                    }
                    if (entityKind === "lead" && title) {
                      navigate(`/orders/customers?tab=leads&leadName=${encodeURIComponent(title)}`);
                    }
                  }}
                  disabled={entityKind === "customer" ? !customer?.id : !lead?.id && !title}
                >
                  Відкрити у замовниках
                </Button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {entityKind === "customer" ? (
                  <>
                    <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">Юридичні дані</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {primaryLegalEntity ? formatCustomerLegalEntitySummary(primaryLegalEntity) : customer?.legal_name ?? "Не вказано"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">Основний контакт</div>
                      <div className="mt-1 space-y-1 text-sm font-medium text-foreground">
                        <div>{primaryContact?.name ?? "Не вказано"}</div>
                        {primaryContact?.position ? <div className="text-muted-foreground">{primaryContact.position}</div> : null}
                        {primaryContact?.phone ? <div className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{primaryContact.phone}</div> : null}
                        {primaryContact?.email ? <div className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{primaryContact.email}</div> : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">Контакт</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {[lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || "Не вказано"}
                      </div>
                      {lead?.source ? <div className="mt-1 text-sm text-muted-foreground">Джерело: {lead.source}</div> : null}
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">Комунікація</div>
                      <div className="mt-1 space-y-1 text-sm font-medium text-foreground">
                        {lead?.phone_numbers?.[0] ? <div className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{lead.phone_numbers.join(", ")}</div> : <div>Не вказано</div>}
                        {lead?.email ? <div className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{lead.email}</div> : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Огляд</TabsTrigger>
                <TabsTrigger value="quotes">Прорахунки <span className="ml-1 text-xs text-muted-foreground">{quotes.length}</span></TabsTrigger>
                <TabsTrigger value="orders">Замовлення <span className="ml-1 text-xs text-muted-foreground">{orders.length}</span></TabsTrigger>
                <TabsTrigger value="design">Дизайн <span className="ml-1 text-xs text-muted-foreground">{designTasks.length}</span></TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Прорахунки</div>
                    <div className="mt-2 text-2xl font-semibold">{quotes.length}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Замовлення</div>
                    <div className="mt-2 text-2xl font-semibold">{orders.length}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Дизайн-задачі</div>
                    <div className="mt-2 text-2xl font-semibold">{designTasks.length}</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="quotes" className="mt-4 space-y-3">
                {quotes.length > 0 ? quotes.map((row) => renderRelationCard("quote", row, () => navigate(`/orders/estimates/${row.id}`))) : (
                  <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">Немає пов’язаних прорахунків.</div>
                )}
              </TabsContent>

              <TabsContent value="orders" className="mt-4 space-y-3">
                {orders.length > 0 ? orders.map((row) => renderRelationCard("order", row, () => navigate(`/orders/production/${row.id}`))) : (
                  <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">Немає пов’язаних замовлень.</div>
                )}
              </TabsContent>

              <TabsContent value="design" className="mt-4 space-y-3">
                {designTasks.length > 0 ? designTasks.map((row) => renderRelationCard("design", row, () => navigate(`/design/${row.id}`))) : (
                  <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">Немає пов’язаних дизайн-задач.</div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
