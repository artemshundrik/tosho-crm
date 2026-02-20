import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

const RECENTS_KEY = "fayna_cmdk_recents_v1";
const MAX_RECENTS = 8;

function normalizeText(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
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
  if (pathname.startsWith("/contractors")) return "Підрядники та Постачальники";
  if (pathname.startsWith("/finance/invoices")) return "Рахунки";
  if (pathname.startsWith("/finance/expense-invoices")) return "Видаткові накладні";
  if (pathname.startsWith("/finance/acts")) return "Акти виконаних робіт";
  if (pathname.startsWith("/finance")) return "Фінанси";
  if (pathname.startsWith("/activity")) return "Активність";
  if (pathname.startsWith("/notifications")) return "Сповіщення";
  if (pathname.startsWith("/settings/members")) return "Доступ / Ролі";
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

  const [query, setQuery] = useState("");

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
        keywords: ["клієнти", "customers", "companies"],
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

  const recents = useMemo(() => loadRecents(), [open]);

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  function clearQuery(e?: React.SyntheticEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setQuery("");
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
        <CommandEmpty>Нічого не знайдено.</CommandEmpty>

        {recents.length > 0 && (
          <>
            <CommandGroup heading="Останні">
              {recents.map((r) => (
                <CommandItem
                  key={`recent-${r.to}`}
                  value={normalizeText(`${r.label} ${r.to}`)}
                  onSelect={() => go(r.to)}
                >
                  <History className="mr-2 h-4 w-4" />
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
                <Icon className="mr-2 h-4 w-4" />
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
                <Icon className="mr-2 h-4 w-4" />
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
