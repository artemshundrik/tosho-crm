import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  FileCheck,
  FileMinus,
  FolderKanban,
  History,
  Palette,
  ReceiptText,
  Search,
  Truck,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCompanySearchVariants, matchesCompanyNameSearch, scoreCompanyNameMatch } from "@/lib/companyNameSearch";
import { supabase } from "@/lib/supabaseClient";
import { listCustomersBySearch, listLeadsBySearch, listQuotes } from "@/lib/toshoApi";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay, type WorkspaceMemberDisplayRow } from "@/lib/workspaceMemberDirectory";

type RouteItem = {
  key: string;
  label: string;
  keywords: string[];
  to: string;
  icon: React.ElementType;
};

type ActionItem = {
  key: string;
  label: string;
  keywords: string[];
  to: string;
  icon: React.ElementType;
};

type RecentItem = {
  label: string;
  to: string;
  ts: number;
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

function normalizeText(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
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
      <mark className="rounded bg-info-soft px-0.5 text-info-foreground">{match}</mark>
      {after}
    </span>
  );
}

function getKindBadgeClass(kindLabel: string) {
  switch (kindLabel) {
    case "Замовник":
      return "border-success-soft-border bg-success-soft text-success-foreground";
    case "Лід":
      return "border-warning-soft-border bg-warning-soft text-warning-foreground";
    case "Прорахунок":
      return "border-info-soft-border bg-info-soft text-info-foreground";
    case "Дизайн":
      return "border-neutral-soft-border bg-neutral-soft text-neutral-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
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

function pushRecent(next: { label: string; to: string }) {
  const current = loadRecents();
  const now = Date.now();
  const filtered = current.filter((x) => x.to !== next.to);
  const updated: RecentItem[] = [{ ...next, ts: now }, ...filtered].slice(0, MAX_RECENTS);
  saveRecents(updated);
}

function pathToLabel(pathname: string): string {
  if (pathname.startsWith("/orders/estimates")) return "Прорахунки замовлень";
  if (pathname.startsWith("/orders/customers")) return "Замовники";
  if (pathname.startsWith("/orders/production")) return "Замовлення";
  if (pathname.startsWith("/orders/ready-to-ship")) return "Готові до відвантаження";
  if (pathname.startsWith("/catalog/products")) return "Каталог продукції";
  if (pathname.startsWith("/design")) return "Дизайн";
  if (pathname.startsWith("/logistics")) return "Логістика";
  if (pathname.startsWith("/contractors")) return "Підрядники та постачальники";
  if (pathname.startsWith("/finance/invoices")) return "Рахунки";
  if (pathname.startsWith("/finance/expense-invoices")) return "Видаткові накладні";
  if (pathname.startsWith("/finance/acts")) return "Акти виконаних робіт";
  if (pathname.startsWith("/finance")) return "Фінанси";
  if (pathname.startsWith("/activity")) return "Активність";
  if (pathname.startsWith("/notifications")) return "Сповіщення";
  if (pathname.startsWith("/team")) return "Команда";
  if (pathname.startsWith("/settings/members")) return "Управління командою";
  if (pathname.startsWith("/profile")) return "Профіль";
  return "Сторінка";
}

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { teamId, userId } = useAuth();

  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDisplayRow[]>([]);

  const routes: RouteItem[] = useMemo(
    () => [
      {
        key: "route-estimates",
        label: "Прорахунки замовлень",
        keywords: ["прорахунок", "кп", "estimate", "quotes"],
        to: "/orders/estimates",
        icon: Calculator,
      },
      {
        key: "route-customers",
        label: "Замовники",
        keywords: ["замовники", "customers", "companies"],
        to: "/orders/customers",
        icon: Building2,
      },
      {
        key: "route-production",
        label: "Замовлення",
        keywords: ["виробництво", "production", "orders"],
        to: "/orders/production",
        icon: Factory,
      },
      {
        key: "route-ready-to-ship",
        label: "Готові до відвантаження",
        keywords: ["доставка", "відвантаження", "shipping"],
        to: "/orders/ready-to-ship",
        icon: Truck,
      },
      {
        key: "route-catalog",
        label: "Каталог продукції",
        keywords: ["каталог", "products", "items"],
        to: "/catalog/products",
        icon: FolderKanban,
      },
      {
        key: "route-design",
        label: "Дизайн",
        keywords: ["дизайн", "design", "tasks"],
        to: "/design",
        icon: Palette,
      },
      {
        key: "route-finance",
        label: "Фінанси",
        keywords: ["фінанси", "finance", "payments"],
        to: "/finance",
        icon: ReceiptText,
      },
      {
        key: "route-finance-invoices",
        label: "Рахунки",
        keywords: ["рахунок", "invoice"],
        to: "/finance/invoices",
        icon: ReceiptText,
      },
      {
        key: "route-finance-expense-invoices",
        label: "Видаткові накладні",
        keywords: ["видаткова", "expense invoice"],
        to: "/finance/expense-invoices",
        icon: FileMinus,
      },
      {
        key: "route-finance-acts",
        label: "Акти виконаних робіт",
        keywords: ["акт", "acts"],
        to: "/finance/acts",
        icon: FileCheck,
      },
      {
        key: "route-notifications",
        label: "Сповіщення",
        keywords: ["notifications", "alerts", "події"],
        to: "/notifications",
        icon: Bell,
      },
      {
        key: "route-team",
        label: "Команда",
        keywords: ["команда", "люди", "статуси", "відпустка", "лікарняний", "birthday"],
        to: "/team",
        icon: Users,
      },
    ],
    []
  );

  const actions: ActionItem[] = useMemo(
    () => [
      {
        key: "action-open-estimates",
        label: "Відкрити прорахунки",
        keywords: ["швидко", "прорахунки", "quotes"],
        to: "/orders/estimates",
        icon: Calculator,
      },
      {
        key: "action-open-design",
        label: "Відкрити дизайн-задачі",
        keywords: ["швидко", "design", "дизайн"],
        to: "/design",
        icon: Palette,
      },
      {
        key: "action-open-profile",
        label: "Відкрити профіль",
        keywords: ["profile", "акаунт"],
        to: "/profile",
        icon: User,
      },
    ],
    []
  );

  useEffect(() => {
    const label = pathToLabel(location.pathname);
    pushRecent({ label, to: location.pathname });
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }

      if (e.key === "/") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isTypingField =
          tag === "input" || tag === "textarea" || target?.getAttribute?.("contenteditable") === "true";

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
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const queryVariants = buildCompanySearchVariants(trimmedQuery);
        const quoteResponses = await Promise.all(
          queryVariants.map((variant) => listQuotes({ teamId, search: variant, limit: 10 }))
        );
        const [customers, leads, designTaskResponse] = await Promise.all([
          listCustomersBySearch(teamId, trimmedQuery),
          listLeadsBySearch(teamId, trimmedQuery),
          supabase
            .from("activity_log")
            .select("id,title,entity_id,metadata,created_at")
            .eq("team_id", teamId)
            .eq("action", "design_task")
            .order("created_at", { ascending: false })
            .limit(80),
        ]);

        const normalizedQuery = normalizeText(trimmedQuery);
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
              value: normalizeText([quoteLabel, description, quote.id].filter(Boolean).join(" ")),
              to: `/orders/estimates/${quote.id}`,
              icon: Calculator,
              logoUrl: quote.customer_logo_url ?? null,
              avatarName: quote.customer_name?.trim() || quote.title?.trim() || quoteLabel,
              kindLabel: "Прорахунок",
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
              value: normalizeText([label, description, customer.id].join(" ")),
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
              value: normalizeText([label, description, lead.id].join(" ")),
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

        const designTaskRows = ((designTaskResponse.data ?? []) as Array<{
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
          const haystack = normalizeText([row.title ?? "", taskNumber, model].join(" "));
          return haystack.includes(normalizedQuery);
        });

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
          nextResults.push({
            key: `design-${taskId}`,
            label: taskNumber,
            description: model,
            value: normalizeText([taskNumber, model, task.title ?? ""].join(" ")),
            to: `/design/${taskId}`,
            icon: Palette,
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
  }, [memberById, memberByLabel, open, query, teamId]);

  function go(to: string) {
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
                <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-neutral-soft-border bg-neutral-soft px-1.5 py-0.5 text-foreground">
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
              <span>Ctrl+K</span>
            </kbd>
          </div>
        }
      />

      <CommandList className="py-1">
        <CommandEmpty>{searchLoading ? "Шукаю..." : "Нічого не знайдено."}</CommandEmpty>

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

        {recents.length > 0 && (
          <>
            <CommandGroup heading="Останні">
              {recents.map((r) => (
              <CommandItem
                key={`recent-${r.to}`}
                value={normalizeText(`${r.label} ${r.to}`)}
                onSelect={() => go(r.to)}
              >
                  <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                    <History className="h-4 w-4" />
                  </span>
                  <span className="flex-1">{r.label}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">{r.to}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Швидкі дії">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem
                key={a.key}
                value={normalizeText([a.label, ...a.keywords, a.to].join(" "))}
                onSelect={() => go(a.to)}
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{a.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Сторінки">
          {routes.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem
                key={r.key}
                value={normalizeText([r.label, ...r.keywords, r.to].join(" "))}
                onSelect={() => go(r.to)}
              >
                <span className="mr-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1">{r.label}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">{r.to}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
