import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Bell,
  Building2,
  Calculator,
  Factory,
  FolderKanban,
  History,
  Palette,
  Search,
  Sparkles,
  Truck,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCompanySearchVariants, matchesCompanyNameSearch, scoreCompanyNameMatch } from "@/lib/companyNameSearch";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { supabase } from "@/lib/supabaseClient";
import { listCustomersBySearch, listLeadsBySearch, listQuotes } from "@/lib/toshoApi";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";
import { InlineLoading } from "@/components/app/loading-primitives";
import { TOSHO_AI_ROUTE } from "@/lib/toshoAi";

type RouteItem = {
  key: string;
  label: string;
  description: string;
  kindLabel?: string;
  keywords: string[];
  to: string;
  icon: React.ElementType;
};

type ActionItem = {
  key: string;
  label: string;
  description: string;
  keywords: string[];
  to: string;
  icon: React.ElementType;
};

type RecentItem = {
  label: string;
  to: string;
  ts: number;
  description?: string;
  kindLabel?: string;
};

type SearchResultItem = {
  key: string;
  label: string;
  description: string;
  value: string;
  to: string;
  icon: React.ElementType;
  logoUrl?: string | null;
  avatarName?: string | null;
  kindLabel: string;
  score: number;
  group: "companies" | "records";
  managerLabel?: string | null;
  managerAvatarUrl?: string | null;
  metaLabel?: string | null;
};

const RECENTS_KEY = "fayna_cmdk_recents_v1";
const MAX_RECENTS = 8;
const GENERIC_RECENT_LABELS = new Set(["Дизайн", "Замовники", "Замовлення", "Команда", "Каталог продукції", "Сторінка"]);

function normalizeText(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function buildCommandSearchValue(parts: Array<string | null | undefined>) {
  const normalizedParts = parts.map((part) => normalizeText(part ?? "")).filter(Boolean);
  const variantParts = normalizedParts.flatMap((part) => buildCompanySearchVariants(part));
  return Array.from(new Set([...normalizedParts, ...variantParts])).join(" ");
}

function sanitizeImageReference(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (
    lower.includes("/rest/v1/") ||
    lower.includes("?select=") ||
    lower.includes("&select=") ||
    lower.includes("status=eq.") ||
    lower.includes("order=") ||
    lower.includes("&limit=")
  ) {
    return null;
  }
  return normalized;
}

function renderHighlightedText(value: string, query: string, className?: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return <span className={className}>{value}</span>;
  const matchIndex = value.toLowerCase().indexOf(trimmedQuery.toLowerCase());
  if (matchIndex < 0) return <span className={className}>{value}</span>;
  const before = value.slice(0, matchIndex);
  const match = value.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = value.slice(matchIndex + trimmedQuery.length);

  return (
    <span className={className}>
      {before}
      <mark className="cmd-highlight rounded px-0.5">{match}</mark>
      {after}
    </span>
  );
}

function getKindBadgeClass(kindLabel: string) {
  switch (kindLabel) {
    case "Замовник":
      return "cmd-kind-customer";
    case "Лід":
      return "cmd-kind-lead";
    case "Прорахунок":
      return "cmd-kind-quote";
    case "Замовлення":
      return "cmd-kind-order";
    case "Дизайн":
      return "cmd-kind-design";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getPathSummary(path: string) {
  if (path.startsWith(TOSHO_AI_ROUTE)) return "Командний центр ToSho AI";
  if (path.startsWith("/settings/members")) return "Налаштування доступів і ролей команди";
  if (path.startsWith("/admin/observability")) return "Системний контроль, storage і технічні метрики";
  if (path.startsWith("/design/")) return "Конкретна дизайн-задача";
  if (path === "/design") return "Розділ дизайн-задач";
  if (path.startsWith("/orders/estimates/")) return "Конкретний прорахунок";
  if (path === "/orders/estimates") return "Список прорахунків";
  if (path.startsWith("/orders/production/")) return "Конкретне замовлення";
  if (path.startsWith("/orders/customers")) return "База замовників і лідів";
  if (path.startsWith("/orders/production")) return "Черга замовлень";
  if (path.startsWith("/catalog/products")) return "Каталог продукції";
  if (path.startsWith("/team")) return "Сторінка команди";
  if (path.startsWith("/notifications")) return "Центр сповіщень";
  if (path.startsWith("/profile")) return "Профіль користувача";
  return "Нещодавно відкрито";
}

function getRoutePresentation(path: string) {
  if (path.startsWith(TOSHO_AI_ROUTE)) {
    return {
      label: "ToSho AI",
      description: "Командний центр з ескалацією, знаннями і чергою кейсів",
      kindLabel: "Команда",
    };
  }
  if (path.startsWith("/settings/members")) {
    return {
      label: "Управління командою",
      description: "Налаштування ролей, доступів і учасників",
      kindLabel: "Налаштування",
    };
  }
  if (path.startsWith("/admin/observability")) {
    return {
      label: "Контроль системи",
      description: "Observability, storage, orphan files і технічні метрики",
      kindLabel: "Адмін",
    };
  }
  if (path.startsWith("/design/")) {
    return {
      label: "Дизайн-задача",
      description: "Конкретна дизайн-задача",
      kindLabel: "Дизайн",
    };
  }
  if (path.startsWith("/orders/estimates/")) {
    return {
      label: "Прорахунок",
      description: "Конкретний прорахунок",
      kindLabel: "Прорахунок",
    };
  }
  if (path.startsWith("/orders/production/")) {
    return {
      label: "Замовлення",
      description: "Конкретне замовлення",
      kindLabel: "Замовлення",
    };
  }
  if (path.startsWith("/orders/customers")) {
    return {
      label: "Замовники",
      description: "База замовників і лідів",
      kindLabel: "Сторінка",
    };
  }
  if (path.startsWith("/orders/production")) {
    return {
      label: "Замовлення",
      description: "Черга замовлень і виробництво",
      kindLabel: "Сторінка",
    };
  }
  if (path.startsWith("/catalog/products")) {
    return {
      label: "Каталог продукції",
      description: "Каталог товарів і моделей",
      kindLabel: "Сторінка",
    };
  }
  if (path.startsWith("/notifications")) {
    return {
      label: "Сповіщення",
      description: "Центр сповіщень",
      kindLabel: "Сторінка",
    };
  }
  if (path.startsWith("/team")) {
    return {
      label: "Команда",
      description: "Стан команди, події і присутність",
      kindLabel: "Сторінка",
    };
  }
  return null;
}

function isLikelyLegacyRecent(item: RecentItem) {
  if (item.description || item.kindLabel) return false;
  if (GENERIC_RECENT_LABELS.has(item.label) && /\/[0-9a-f]{8}-/i.test(item.to)) return true;
  if (item.to.includes("?customerId=") || item.to.includes("?leadId=")) return true;
  if (item.label === "Сторінка") return true;
  return false;
}

function loadRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x) =>
          typeof x?.to === "string" && typeof x?.label === "string" && typeof x?.ts === "number"
      )
      .filter((item) => !isLikelyLegacyRecent(item))
      .map((item) => ({
        ...item,
        ...(getRoutePresentation(item.to) ?? {}),
        description:
          typeof item.description === "string" && item.description.trim()
            ? item.description.trim()
            : getPathSummary(item.to),
        kindLabel:
          typeof item.kindLabel === "string" && item.kindLabel.trim()
            ? item.kindLabel.trim()
            : "Нещодавно",
      }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function saveRecents(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
  } catch {
    // ignore
  }
}

function pushRecent(next: { label: string; to: string; description?: string; kindLabel?: string }) {
  const current = loadRecents();
  const now = Date.now();
  const filtered = current.filter((x) => x.to !== next.to);
  const updated: RecentItem[] = [{ ...next, ts: now }, ...filtered].slice(0, MAX_RECENTS);
  saveRecents(updated);
}

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { teamId, userId, permissions } = useAuth();

  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDisplayRow[]>([]);
  const activeSearchQuery = query.trim();
  const shouldSearchCRM = open && Boolean(teamId) && activeSearchQuery.length >= 2;

  const routes: RouteItem[] = useMemo(
    () => [
      {
        key: "route-tosho-ai",
        label: "ToSho AI",
        description: "Командний центр з ескалацією, знаннями і чергою кейсів",
        kindLabel: "Команда",
        keywords: ["ai", "assistant", "support", "help", "tosho ai", "помічник", "ескалація"],
        to: TOSHO_AI_ROUTE,
        icon: Sparkles,
      },
      {
        key: "route-estimates",
        label: "Прорахунки замовлень",
        description: "Список прорахунків і комерційних пропозицій",
        kindLabel: "Сторінка",
        keywords: ["прорахунок", "кп", "estimate", "quotes"],
        to: "/orders/estimates",
        icon: Calculator,
      },
      {
        key: "route-customers",
        label: "Замовники",
        description: "База замовників і лідів",
        kindLabel: "Сторінка",
        keywords: ["замовники", "customers", "companies"],
        to: "/orders/customers",
        icon: Building2,
      },
      {
        key: "route-production",
        label: "Замовлення",
        description: "Черга замовлень і виробництво",
        kindLabel: "Сторінка",
        keywords: ["виробництво", "production", "orders"],
        to: "/orders/production",
        icon: Factory,
      },
      {
        key: "route-ready-to-ship",
        label: "Готові до відвантаження",
        description: "Замовлення, готові до відправки",
        kindLabel: "Сторінка",
        keywords: ["доставка", "відвантаження", "shipping"],
        to: "/orders/ready-to-ship",
        icon: Truck,
      },
      {
        key: "route-catalog",
        label: "Каталог продукції",
        description: "Каталог товарів і моделей",
        kindLabel: "Сторінка",
        keywords: ["каталог", "products", "items"],
        to: "/catalog/products",
        icon: FolderKanban,
      },
      {
        key: "route-design",
        label: "Дизайн",
        description: "Черга дизайн-задач і макетів",
        kindLabel: "Сторінка",
        keywords: ["дизайн", "design", "tasks"],
        to: "/design",
        icon: Palette,
      },
      {
        key: "route-notifications",
        label: "Сповіщення",
        description: "Центр сповіщень",
        kindLabel: "Сторінка",
        keywords: ["notifications", "alerts", "події"],
        to: "/notifications",
        icon: Bell,
      },
      {
        key: "route-team",
        label: "Команда",
        description: "Стан команди, події і присутність",
        kindLabel: "Сторінка",
        keywords: ["команда", "люди", "статуси", "відпустка", "лікарняний", "birthday"],
        to: "/team",
        icon: Users,
      },
      ...(permissions.isSuperAdmin || permissions.isAdmin
        ? [
            {
              key: "route-admin-observability",
              label: "Контроль системи",
              description: "Observability, storage і технічні метрики",
              kindLabel: "Адмін",
              keywords: ["observability", "admin", "контроль", "панель", "адмін", "метрики", "storage", "orphan files"],
              to: "/admin/observability",
              icon: Search,
            },
          ]
        : []),
    ],
    [permissions.isAdmin, permissions.isSuperAdmin]
  );

  const actions: ActionItem[] = useMemo(
    () => [
      {
        key: "action-open-tosho-ai",
        label: "Відкрити ToSho AI",
        description: "Командний центр допомоги, маршрутизації і knowledge base",
        keywords: ["ai", "assistant", "help", "support"],
        to: TOSHO_AI_ROUTE,
        icon: Sparkles,
      },
      {
        key: "action-open-estimates",
        label: "Відкрити прорахунки",
        description: "Швидкий перехід до прорахунків",
        keywords: ["швидко", "прорахунки", "quotes"],
        to: "/orders/estimates",
        icon: Calculator,
      },
      {
        key: "action-open-design",
        label: "Відкрити дизайн-задачі",
        description: "Швидкий перехід до дизайну",
        keywords: ["швидко", "design", "дизайн"],
        to: "/design",
        icon: Palette,
      },
      {
        key: "action-open-profile",
        label: "Відкрити профіль",
        description: "Ваш профіль і персональні налаштування",
        keywords: ["profile", "акаунт"],
        to: "/profile",
        icon: User,
      },
    ],
    []
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingField =
        tag === "input" || tag === "textarea" || target?.getAttribute?.("contenteditable") === "true";

      if (isMac && e.metaKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }

      if (!isMac && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "k" && !isTypingField) {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }

      if (e.key === "/") {
        if (!isTypingField) {
          e.preventDefault();
          onOpenChange(true);
        }
      }

      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

// eslint-disable-next-line react-hooks/exhaustive-deps
  const recents = useMemo(() => loadRecents(), [open]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;

    const loadMembers = async () => {
      try {
        const workspaceId = await resolveWorkspaceId(userId);
        if (!workspaceId) {
          if (!cancelled) setTeamMembers([]);
          return;
        }
        const rows = await listWorkspaceMembersForDisplay(workspaceId);
        if (!cancelled) setTeamMembers(rows);
      } catch {
        if (!cancelled) setTeamMembers([]);
      }
    };

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const memberById = useMemo(() => new Map(teamMembers.map((member) => [member.userId, member])), [teamMembers]);
  const memberByLabel = useMemo(
    () =>
      new Map(
        teamMembers.flatMap((member) => {
          const full = member.label.trim();
          const short = full
            .split(" ")
            .map((part, index) => (index === 0 ? part : `${part[0] ?? ""}.`))
            .join(" ")
            .trim();
          return [
            [full.toLowerCase(), member] as const,
            short ? ([short.toLowerCase(), member] as const) : null,
          ].filter(Boolean) as Array<readonly [string, WorkspaceMemberDisplayRow]>;
        })
      ),
    [teamMembers]
  );

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!open || !teamId || trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const normalizedQuery = normalizeText(trimmedQuery);
        const loadDesignTaskRows = async () => {
          const matchedRows: Array<{
            id?: string | null;
            title?: string | null;
            entity_id?: string | null;
            metadata?: Record<string, unknown> | null;
          }> = [];
          const pageSize = 120;
          const maxRowsToScan = 480;
          let offset = 0;

          while (offset < maxRowsToScan) {
            const { data, error } = await supabase
              .from("activity_log")
              .select("id,title,entity_id,metadata,created_at")
              .eq("team_id", teamId)
              .eq("action", "design_task")
              .order("created_at", { ascending: false })
              .range(offset, offset + pageSize - 1);

            if (error) throw error;

            const pageRows = ((data ?? []) as Array<{
              id?: string | null;
              title?: string | null;
              entity_id?: string | null;
              metadata?: Record<string, unknown> | null;
            }>).filter((row) => {
              const metadata = row.metadata ?? {};
              const taskNumber =
                typeof metadata.design_task_number === "string" ? metadata.design_task_number.trim() : "";
              const model =
                typeof metadata.model === "string" ? metadata.model.trim() : "";
              const customerName =
                typeof metadata.customer_name === "string" ? metadata.customer_name.trim() : "";
              const quoteNumber =
                typeof metadata.quote_number === "string" ? metadata.quote_number.trim() : "";
              const quoteTitle =
                typeof metadata.quote_title === "string" ? metadata.quote_title.trim() : "";
              const haystack = buildCommandSearchValue([row.title ?? "", taskNumber, model, customerName, quoteNumber, quoteTitle]);
              return haystack.includes(normalizedQuery);
            });

            matchedRows.push(...pageRows);

            if (matchedRows.length >= 6 || !data || data.length < pageSize) break;
            offset += pageSize;
          }

          return matchedRows.slice(0, 6);
        };

        const queryVariants = buildCompanySearchVariants(trimmedQuery);
        const quoteResponses = await Promise.all(
          queryVariants.map((variant) => listQuotes({ teamId, search: variant, limit: 10 }))
        );
        const [customers, leads, orderRows, designTaskResponse] = await Promise.all([
          listCustomersBySearch(teamId, trimmedQuery),
          listLeadsBySearch(teamId, trimmedQuery),
          loadDerivedOrders(teamId, userId),
          loadDesignTaskRows(),
        ]);
        const resolveManagerMeta = (managerUserId?: string | null, managerLabel?: string | null) => {
          const byId = managerUserId?.trim() ? memberById.get(managerUserId.trim()) : undefined;
          const byLabel = managerLabel?.trim() ? memberByLabel.get(managerLabel.trim().toLowerCase()) : undefined;
          const member = byId ?? byLabel;
          return {
            label: managerLabel?.trim() || member?.label?.trim() || "",
            avatarUrl: member?.avatarDisplayUrl ?? null,
          };
        };
        const quotes = Array.from(
          new Map(
            quoteResponses.flat().map((quote) => [quote.id, quote])
          ).values()
        );
        const nextResults: SearchResultItem[] = [];

        quotes
          .map((quote) => {
            const quoteLabel = quote.number?.trim() || "Прорахунок";
            const description = [quote.customer_name?.trim(), quote.title?.trim(), quote.status?.trim()]
              .filter(Boolean)
              .join(" · ");
            return {
              quote,
              quoteLabel,
              description,
              score: Math.max(
                scoreCompanyNameMatch(trimmedQuery, [
                  quote.customer_name ?? null,
                  quote.title ?? null,
                  quote.number ?? null,
                ]),
                normalizeText([quoteLabel, description, quote.id].filter(Boolean).join(" ")).includes(normalizedQuery) ? 70 : 0
              ),
            };
          })
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 6)
          .forEach(({ quote, quoteLabel, description, score }) => {
            nextResults.push({
              key: `quote-${quote.id}`,
              label: quoteLabel,
              description: description || "Прорахунок",
              value: buildCommandSearchValue([quoteLabel, description, quote.id, quote.customer_name, quote.title, quote.number]),
              to: `/orders/estimates/${quote.id}`,
              icon: Calculator,
              logoUrl: quote.customer_logo_url ?? null,
              avatarName: quote.customer_name?.trim() || quote.title?.trim() || quoteLabel,
              kindLabel: "Прорахунок",
              score,
              group: "records",
            });
          });

        orderRows
          .map((order) => {
            const orderLabel = order.quoteNumber?.trim() || "Замовлення";
            const description = [order.customerName?.trim(), order.orderStatus?.trim()]
              .filter(Boolean)
              .join(" · ");
            const itemNames = order.items.slice(0, 3).map((item) => item.name).filter(Boolean);
            const searchScore = Math.max(
              scoreCompanyNameMatch(trimmedQuery, [
                order.customerName ?? null,
                order.quoteNumber ?? null,
                ...itemNames,
              ]),
              normalizeText(
                [
                  orderLabel,
                  description,
                  order.id,
                  order.customerName,
                  order.quoteNumber,
                  order.paymentRail,
                  ...itemNames,
                ]
                  .filter(Boolean)
                  .join(" ")
              ).includes(normalizedQuery)
                ? 72
                : 0
            );
            return {
              order,
              orderLabel,
              description,
              score: searchScore,
            };
          })
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 6)
          .forEach(({ order, orderLabel, description, score }) => {
            nextResults.push({
              key: `order-${order.id}`,
              label: orderLabel,
              description: description || "Замовлення",
              value: buildCommandSearchValue([
                orderLabel,
                description,
                order.id,
                order.customerName,
                order.quoteNumber,
                order.paymentRail,
                ...order.items.slice(0, 3).map((item) => item.name),
              ]),
              to: `/orders/production/${order.id}`,
              icon: Factory,
              logoUrl: order.customerLogoUrl ?? null,
              avatarName: order.customerName?.trim() || orderLabel,
              kindLabel: "Замовлення",
              score,
              group: "records",
            });
          });

        customers
          .filter((customer) =>
            matchesCompanyNameSearch(trimmedQuery, [customer.name ?? null, customer.legal_name ?? null])
          )
          .slice(0, 4)
          .forEach((customer) => {
            const label = customer.name?.trim() || customer.legal_name?.trim() || "Замовник";
            const managerMeta = resolveManagerMeta(customer.manager_user_id ?? null, customer.manager ?? null);
            const description =
              customer.legal_name?.trim() && customer.legal_name?.trim() !== label ? customer.legal_name.trim() : "Замовник";
            nextResults.push({
              key: `customer-${customer.id}`,
              label,
              description,
              value: buildCommandSearchValue([label, description, customer.id, customer.name, customer.legal_name]),
              to: `/orders/customers?tab=customers&customerId=${customer.id}`,
              icon: Building2,
              logoUrl: customer.logo_url ?? null,
              avatarName: label,
              kindLabel: "Замовник",
              score: scoreCompanyNameMatch(trimmedQuery, [customer.name ?? null, customer.legal_name ?? null]),
              group: "companies",
              managerLabel: managerMeta.label || null,
              managerAvatarUrl: managerMeta.avatarUrl,
              metaLabel: customer.legal_name?.trim() && customer.legal_name?.trim() !== label ? customer.legal_name.trim() : null,
            });
          });

        leads
          .filter((lead) =>
            matchesCompanyNameSearch(trimmedQuery, [
              lead.company_name ?? null,
              lead.legal_name ?? null,
              [lead.first_name, lead.last_name].filter(Boolean).join(" "),
            ])
          )
          .slice(0, 4)
          .forEach((lead) => {
            const label =
              lead.company_name?.trim() ||
              lead.legal_name?.trim() ||
              [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
              "Лід";
            const managerMeta = resolveManagerMeta(lead.manager_user_id ?? null, lead.manager ?? null);
            const description =
              lead.legal_name?.trim() && lead.legal_name?.trim() !== label ? lead.legal_name.trim() : "Лід";
            nextResults.push({
              key: `lead-${lead.id}`,
              label,
              description,
              value: buildCommandSearchValue([
                label,
                description,
                lead.id,
                lead.company_name,
                lead.legal_name,
                [lead.first_name, lead.last_name].filter(Boolean).join(" "),
              ]),
              to: `/orders/customers?tab=leads&leadId=${lead.id}`,
              icon: User,
              logoUrl: lead.logo_url ?? null,
              avatarName: label,
              kindLabel: "Лід",
              score: scoreCompanyNameMatch(trimmedQuery, [
                lead.company_name ?? null,
                lead.legal_name ?? null,
                [lead.first_name, lead.last_name].filter(Boolean).join(" "),
              ]),
              group: "companies",
              managerLabel: managerMeta.label || null,
              managerAvatarUrl: managerMeta.avatarUrl,
              metaLabel: lead.legal_name?.trim() && lead.legal_name?.trim() !== label ? lead.legal_name.trim() : null,
            });
          });

        const designTaskRows = designTaskResponse;
        const designQuoteIds = Array.from(
          new Set(
            designTaskRows
              .map((task) => {
                const metadata = task.metadata ?? {};
                return typeof metadata.quote_id === "string" && metadata.quote_id.trim() ? metadata.quote_id.trim() : "";
              })
              .filter(Boolean)
          )
        );
        const designCustomerIds = Array.from(
          new Set(
            designTaskRows
              .map((task) => {
                const metadata = task.metadata ?? {};
                return typeof metadata.customer_id === "string" && metadata.customer_id.trim() ? metadata.customer_id.trim() : "";
              })
              .filter(Boolean)
          )
        );
        const designCustomerTypeById = new Map(
          designTaskRows.flatMap((task) => {
            const metadata = task.metadata ?? {};
            const customerId = typeof metadata.customer_id === "string" && metadata.customer_id.trim() ? metadata.customer_id.trim() : "";
            const customerType = typeof metadata.customer_type === "string" && metadata.customer_type.trim()
              ? metadata.customer_type.trim().toLowerCase()
              : "";
            return customerId ? [[customerId, customerType]] as const : [];
          })
        );
        const quoteLogoById = new Map<string, string | null>();
        const customerLogoById = new Map<string, string | null>();
        const leadLogoById = new Map<string, string | null>();

        if (designQuoteIds.length > 0) {
          const { data: quoteRows } = await supabase
            .schema("tosho")
            .from("quotes")
            .select("id, customer_logo_url")
            .in("id", designQuoteIds);
          ((quoteRows ?? []) as Array<{ id?: string | null; customer_logo_url?: string | null }>).forEach((row) => {
            if (!row.id) return;
            quoteLogoById.set(row.id, sanitizeImageReference(normalizeCustomerLogoUrl(row.customer_logo_url ?? null)));
          });
        }

        const customerIds = designCustomerIds.filter((id) => designCustomerTypeById.get(id) !== "lead");
        const leadIds = designCustomerIds.filter((id) => designCustomerTypeById.get(id) === "lead");

        if (customerIds.length > 0) {
          const { data: customerRows } = await supabase
            .schema("tosho")
            .from("customers")
            .select("id, logo_url")
            .in("id", customerIds);
          ((customerRows ?? []) as Array<{ id?: string | null; logo_url?: string | null }>).forEach((row) => {
            if (!row.id) return;
            customerLogoById.set(row.id, sanitizeImageReference(normalizeCustomerLogoUrl(row.logo_url ?? null)));
          });
        }

        if (leadIds.length > 0) {
          const { data: leadRows } = await supabase
            .schema("tosho")
            .from("leads")
            .select("id, logo_url")
            .eq("team_id", teamId)
            .in("id", leadIds);
          ((leadRows ?? []) as Array<{ id?: string | null; logo_url?: string | null }>).forEach((row) => {
            if (!row.id) return;
            leadLogoById.set(row.id, sanitizeImageReference(normalizeCustomerLogoUrl(row.logo_url ?? null)));
          });
        }

        designTaskRows.slice(0, 6).forEach((task) => {
          const taskId = task.id ?? task.entity_id ?? "";
          if (!taskId) return;
          const metadata = task.metadata ?? {};
          const taskNumber =
            typeof metadata.design_task_number === "string" && metadata.design_task_number.trim()
              ? metadata.design_task_number.trim()
              : "Дизайн-задача";
          const model =
            typeof metadata.model === "string" && metadata.model.trim()
              ? metadata.model.trim()
              : task.title?.trim() || "Дизайн";
          const customerName =
            typeof metadata.customer_name === "string" && metadata.customer_name.trim()
              ? metadata.customer_name.trim()
              : "";
          const quoteNumber =
            typeof metadata.quote_number === "string" && metadata.quote_number.trim()
              ? metadata.quote_number.trim()
              : "";
          const quoteTitle =
            typeof metadata.quote_title === "string" && metadata.quote_title.trim()
              ? metadata.quote_title.trim()
              : "";
          const customerId =
            typeof metadata.customer_id === "string" && metadata.customer_id.trim()
              ? metadata.customer_id.trim()
              : "";
          const customerType =
            typeof metadata.customer_type === "string" && metadata.customer_type.trim()
              ? metadata.customer_type.trim().toLowerCase()
              : "";
          const quoteId =
            typeof metadata.quote_id === "string" && metadata.quote_id.trim()
              ? metadata.quote_id.trim()
              : "";
          const customerLogoUrl =
            (typeof metadata.customer_logo_url === "string" && metadata.customer_logo_url.trim()
              ? sanitizeImageReference(normalizeCustomerLogoUrl(metadata.customer_logo_url))
              : null) ??
            (customerId
              ? customerType === "lead"
                ? (leadLogoById.get(customerId) ?? null)
                : (customerLogoById.get(customerId) ?? null)
              : null) ??
            (quoteId ? (quoteLogoById.get(quoteId) ?? null) : null);
          const description = [customerName, quoteNumber || quoteTitle || model].filter(Boolean).join(" · ") || model;
          nextResults.push({
            key: `design-${taskId}`,
            label: taskNumber,
            description,
            value: buildCommandSearchValue([taskNumber, model, task.title ?? "", customerName, quoteNumber, quoteTitle]),
            to: `/design/${taskId}`,
            icon: Palette,
            logoUrl: customerLogoUrl,
            avatarName: customerName || model || taskNumber,
            kindLabel: "Дизайн",
            score: 68,
            group: "records",
          });
        });

        if (!cancelled) {
          setSearchResults(
            nextResults
              .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "uk"))
              .slice(0, 14)
          );
        }
      } catch (error) {
        console.warn("Failed to load global search results", error);
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [memberById, memberByLabel, open, query, teamId, userId]);

  function go(to: string) {
    const matchedResult = searchResults.find((result) => result.to === to);
    const matchedAction = actions.find((item) => item.to === to);
    const matchedRoute = routes.find((item) => item.to === to);
    pushRecent({
      label: matchedResult?.label ?? matchedAction?.label ?? matchedRoute?.label ?? to,
      to,
      description:
        matchedResult?.description ??
        (matchedAction ? "Швидка дія в команд палеті" : undefined) ??
        getPathSummary(to),
      kindLabel:
        matchedResult?.kindLabel ??
        (matchedAction ? "Дія" : undefined) ??
        matchedRoute?.kindLabel ??
        "Нещодавно",
    });
    onOpenChange(false);
    navigate(to);
  }

  function clearQuery(e?: React.SyntheticEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setQuery("");
  }

  const companyResults = useMemo(
    () => searchResults.filter((result) => result.group === "companies"),
    [searchResults]
  );
  const recordResults = useMemo(
    () => searchResults.filter((result) => result.group === "records"),
    [searchResults]
  );
  const normalizedQuery = normalizeText(query);
  const hasActiveQuery = activeSearchQuery.length > 0;
  const filteredRecents = useMemo(() => {
    if (!hasActiveQuery) return recents.slice(0, 6);
    return recents.filter((item) =>
      buildCommandSearchValue([item.label, item.to]).includes(normalizedQuery)
    );
  }, [hasActiveQuery, normalizedQuery, recents]);
  const filteredActions = useMemo(() => {
    if (!hasActiveQuery) return actions;
    return actions.filter((item) =>
      buildCommandSearchValue([item.label, ...item.keywords, item.to]).includes(normalizedQuery)
    );
  }, [actions, hasActiveQuery, normalizedQuery]);
  const filteredRoutes = useMemo(() => {
    if (!hasActiveQuery) return [];
    return routes.filter((item) =>
      buildCommandSearchValue([item.label, ...item.keywords, item.to]).includes(normalizedQuery)
    );
  }, [hasActiveQuery, normalizedQuery, routes]);
  const showHomeState = !hasActiveQuery;

  function renderResultItem(result: SearchResultItem) {
    const Icon = result.icon;
    return (
      <CommandItem
        key={result.key}
        value={result.value}
        onSelect={() => go(result.to)}
      >
        {result.logoUrl ? (
          <EntityAvatar
            src={result.logoUrl}
            name={result.avatarName ?? result.label}
            size={28}
            className="mr-2"
            fallbackClassName="text-[10px] font-semibold"
          />
        ) : (
          <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renderHighlightedText(result.label, query, "truncate")}
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getKindBadgeClass(result.kindLabel)}`}
            >
              {result.kindLabel}
            </span>
          </div>
          {result.group === "companies" ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {result.metaLabel ? (
                <span className="truncate">{renderHighlightedText(result.metaLabel, query)}</span>
              ) : null}
              {result.metaLabel && result.managerLabel ? <span className="shrink-0">·</span> : null}
              {result.managerLabel ? (
                <span className="cmd-manager-chip inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5">
                  <AvatarBase
                    src={result.managerAvatarUrl ?? null}
                    name={result.managerLabel}
                    size={16}
                    className="shrink-0 border-border/60"
                    fallbackClassName="text-[8px] font-semibold"
                  />
                  <span className="truncate">{renderHighlightedText(result.managerLabel, query)}</span>
                </span>
              ) : null}
            </div>
          ) : (
            <div className="truncate text-xs text-muted-foreground">
              {renderHighlightedText(result.description, query)}
            </div>
          )}
        </div>
      </CommandItem>
    );
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Пошук сторінок та дій…"
        leftIcon={<Search className="h-4 w-4" />}
        rightSlot={
          <div className="flex items-center gap-2">
            {query.length > 0 && (
              <Button
                type="button"
                variant="control"
                size="iconSm"
                aria-label="Очистити пошук"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={clearQuery}
              >
                <X className="h-4 w-4" />
              </Button>
            )}

            <kbd className="inline-flex h-7 select-none items-center gap-1 rounded-[var(--radius-md)] border border-border bg-muted px-2 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-[11px]">⌘</span>K
              <span className="opacity-60">/</span>
              <span>Shift+K</span>
            </kbd>
          </div>
        }
      />

      <CommandList className="py-1">
        <CommandEmpty>Нічого не знайдено.</CommandEmpty>

        {shouldSearchCRM && searchLoading ? (
          <>
            <CommandGroup heading="Пошук у CRM">
              <CommandItem
                value={buildCommandSearchValue([activeSearchQuery, "crm loading 1"])}
                disabled
                className="opacity-100"
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                  <Search className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <InlineLoading
                    label={`Шукаємо в CRM за запитом “${activeSearchQuery}”...`}
                    className="min-h-5 text-sm"
                    spinnerClassName="h-3.5 w-3.5"
                    textClassName="text-sm"
                  />
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Замовники, ліди, прорахунки, замовлення та дизайн-задачі
                  </div>
                </div>
              </CommandItem>
              <CommandItem
                value={buildCommandSearchValue([activeSearchQuery, "crm loading 2"])}
                disabled
                className="opacity-100"
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/20" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-44 animate-pulse rounded-full bg-muted/70" />
                  <div className="mt-2 h-3 w-64 animate-pulse rounded-full bg-muted/50" />
                </div>
              </CommandItem>
              <CommandItem
                value={buildCommandSearchValue([activeSearchQuery, "crm loading 3"])}
                disabled
                className="opacity-100"
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/20" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-36 animate-pulse rounded-full bg-muted/70" />
                  <div className="mt-2 h-3 w-52 animate-pulse rounded-full bg-muted/50" />
                </div>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {companyResults.length > 0 && (
          <>
            <CommandGroup heading="Компанії">
              {companyResults.map(renderResultItem)}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {recordResults.length > 0 && (
          <>
            <CommandGroup heading="Результати">
              {recordResults.map(renderResultItem)}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {showHomeState && filteredRecents.length > 0 && (
          <>
            <CommandGroup heading="Останні">
              {filteredRecents.map((r) => (
              <CommandItem
                key={`recent-${r.to}`}
                value={buildCommandSearchValue([r.label, r.description, r.kindLabel, r.to])}
                onSelect={() => go(r.to)}
              >
                  <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                    <History className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{r.label}</span>
                      {r.kindLabel ? (
                        <span className="shrink-0 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {r.kindLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.description || getPathSummary(r.to)}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {filteredActions.length > 0 ? <CommandSeparator /> : null}
          </>
        )}

        {filteredActions.length > 0 ? (
        <CommandGroup heading={showHomeState ? "Швидкі дії" : "Дії"}>
          {filteredActions.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem
                key={a.key}
                value={buildCommandSearchValue([a.label, ...a.keywords, a.to])}
                onSelect={() => go(a.to)}
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{a.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.description}</div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        ) : null}

        {!showHomeState && filteredActions.length > 0 && filteredRoutes.length > 0 ? <CommandSeparator /> : null}

        {!showHomeState && filteredRoutes.length > 0 ? (
        <CommandGroup heading="Сторінки">
          {filteredRoutes.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem
                key={r.key}
                value={buildCommandSearchValue([r.label, ...r.keywords, r.to])}
                onSelect={() => go(r.to)}
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{r.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.description}</div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
