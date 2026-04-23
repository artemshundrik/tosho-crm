// src/layout/AppLayout.tsx
import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Calculator,
  Factory,
  FolderKanban,
  KeyRound,
  LayoutGrid,
  Menu,
  Moon,
  Palette,
  X as CloseIcon,
  Route,
  Search,
  ShieldAlert,
  Sun,
  Truck,
  Users,
  X,
  BadgeCheck,
  CircleDot,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/app/UserMenu";
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsValue,
} from "@/components/app/page-header-actions";
import { preloadRoute } from "@/routes/routePreload";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getCachedCurrentWorkspaceMemberDirectoryEntry,
  getCurrentWorkspaceMemberDirectoryEntry,
  WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT,
} from "@/lib/workspaceMemberDirectory";

import {
  disableRealtimeForSession,
  enableRealtimeForSession,
  isRealtimeDisabledForSession,
  supabase,
} from "@/lib/supabaseClient";
import { getAgencyLogo } from "@/lib/agencyAssets";
import { notifyUsers } from "@/lib/designTaskActivity";
import { useAuth } from "@/auth/AuthProvider";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useWorkspacePresenceState } from "@/hooks/useWorkspacePresenceState";
import { WorkspacePresenceProvider } from "@/components/app/workspace-presence-context";
import { OnlineNowDropdown } from "@/components/app/workspace-presence-widgets";
import { buildUserNameFromMetadata } from "@/lib/userName";
import { playNotificationSound } from "@/lib/notificationSound";
import {
  IN_APP_NOTIFICATION_PREFERENCES_UPDATED_EVENT,
  readInAppNotificationPreferences,
} from "@/lib/inAppNotificationPreferences";
import { MINFIN_MB_URL, type MinfinFxResponse } from "@/lib/minfinFx";

import { CommandPalette } from "@/components/app/CommandPalette";
import { SidebarIconTooltip } from "@/components/app/SidebarIconTooltip";

import { AppDropdown } from "@/components/app/AppDropdown";
import { toast } from "sonner";
import { ToShoAiConsole } from "@/features/tosho-ai/ToShoAiConsole";
import { buildToShoAiRouteContext, saveToShoAiLastContext, TOSHO_AI_ROUTE } from "@/lib/toshoAi";

import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageReveal } from "@/components/app/PageReveal";
import { TabBar } from "@/components/app/TabBar";

type AppLayoutProps = {
  children?: ReactNode;
};

type SidebarGroupKey = "overview" | "orders" | "operations" | "account";

type SidebarLink = {
  label: string;
  to: string;
  group: SidebarGroupKey;
  icon: React.ElementType;
  moduleKey?: "overview" | "orders" | "design" | "logistics" | "catalog" | "contractors" | "team";
};

type HeaderConfig = {
  title: string;
  subtitle: string;
  breadcrumbLabel: string;
  breadcrumbTo: string;
  eyebrow?: string;
  showPageHeader?: boolean;
};

const IN_APP_NOTIFICATION_TOAST_MS = 6500;
const IN_APP_WARNING_NOTIFICATION_TOAST_MS = 9000;
const FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_POLL_INTERVAL_MS = 10 * 60 * 1000;

function isDocumentVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function getInAppNotificationDuration(tone?: NotificationItem["tone"]) {
  if (tone === "warning") return IN_APP_WARNING_NOTIFICATION_TOAST_MS;
  return IN_APP_NOTIFICATION_TOAST_MS;
}

function getInAppNotificationIcon(tone?: NotificationItem["tone"]) {
  if (tone === "warning") return <ShieldAlert className="h-4 w-4 text-warning-foreground" />;
  if (tone === "success") return <BadgeCheck className="h-4 w-4 text-success-foreground" />;
  return <Bell className="h-4 w-4 text-primary" />;
}

function formatFxDelta(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.abs(value)
    .toFixed(3)
    .replace(/\.?0+$/u, "");
}

function getFxSourceText(sourceLabel: string | null, hasRates: boolean) {
  if (sourceLabel) return `Мінфін міжбанк · ${sourceLabel}`;
  if (hasRates) return "Мінфін міжбанк";
  return "Ще не оновлено на Мінфіні";
}

const FX_RATES_STORAGE_KEY = "tosho_fx_rates";
const FX_RATES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FX_RATES_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function parseFxSourceLabel(label: string | null) {
  if (!label) return null;
  const match = label.match(/^(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})$/u);
  if (!match) return null;
  const [, day, month, year, hours, minutes] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFxStaleWarning(sourceLabel: string | null) {
  const parsed = parseFxSourceLabel(sourceLabel);
  if (!parsed) return null;
  if (Date.now() - parsed.getTime() <= FX_RATES_STALE_AFTER_MS) return null;
  return `Дані Мінфіну застаріли (${sourceLabel}). Перевір парсер у /.netlify/functions/fx-rates або саму сторінку джерела.`;
}

function getFxErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Невідома помилка завантаження курсу.";
}

type FxCurrencyCode = "USD" | "EUR";

function FxCurrencyBadge({
  code,
  className,
}: {
  code: FxCurrencyCode;
  className?: string;
}) {
  const accentClassName = code === "USD"
    ? "border-info-soft-border bg-info-soft text-info-foreground"
    : "border-warning-soft-border bg-warning-soft text-warning-foreground";
  const label = code === "USD" ? "$" : "€";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold leading-none",
        accentClassName,
        className
      )}
    >
      {label}
    </span>
  );
}

async function fetchMinfinFxRates(signal?: AbortSignal) {
  const endpoints = ["/.netlify/functions/fx-rates", "/api/fx-rates"];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        let detail = "";
        try {
          const payload = await response.json();
          if (payload && typeof payload === "object" && typeof payload.error === "string" && payload.error.trim()) {
            detail = payload.error.trim();
          }
        } catch {
          // Ignore invalid error payloads.
        }
        throw new Error(detail ? `${detail} (${endpoint})` : `HTTP ${response.status} for ${endpoint}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(`Unexpected content-type for ${endpoint}: ${contentType || "unknown"}`);
      }

      const payload = await response.json();
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown fetch error");
    }
  }

  throw lastError ?? new Error("Failed to load Minfin rates");
}

function renderInAppToastContent({
  title,
  description,
  tone,
  actionLabel,
  onAction,
  onClose,
}: {
  title: string;
  description?: string;
  tone?: NotificationItem["tone"];
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="w-[min(420px,calc(100vw-32px))] rounded-[24px] border border-border bg-card p-4 text-card-foreground ring-1 ring-[hsl(var(--soft-ring))] shadow-[var(--shadow-elevated-lg)]">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
            tone === "success" && "border-success-soft-border bg-success-soft text-success-foreground",
            tone === "warning" && "border-warning-soft-border bg-warning-soft text-warning-foreground",
            (!tone || tone === "info") && "border-info-soft-border bg-info-soft text-info-foreground"
          )}
        >
          {getInAppNotificationIcon(tone)}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[15px] font-semibold leading-5 text-foreground">{title}</div>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Закрити сповіщення"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {description ? <div className="text-sm leading-5 text-muted-foreground">{description}</div> : null}
          <div className="flex items-center justify-end gap-3 pt-1">
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted/70"
              >
                {actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeNotificationHref(href?: string) {
  if (!href) return "";
  const trimmed = href.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

function trimNotificationDescription(text?: string, limit = 160) {
  const normalized = (text ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function shouldSuppressInAppNotificationToast(currentPath: string, href?: string) {
  const normalizedHref = normalizeNotificationHref(href);
  if (!normalizedHref) return false;
  if (normalizedHref === currentPath) return true;

  const currentPathname = currentPath.split("?")[0] ?? currentPath;
  const hrefPathname = normalizedHref.split("?")[0] ?? normalizedHref;

  if (hrefPathname === currentPathname) return true;

  const entityRoutes = [ROUTES.ordersEstimates, ROUTES.ordersCustomers, ROUTES.ordersProduction, ROUTES.design, ROUTES.contractors];
  return entityRoutes.some((route) => currentPathname.startsWith(`${route}/`) && hrefPathname === currentPathname);
}

function getNotificationActionLabel(href?: string) {
  const normalizedHref = normalizeNotificationHref(href);
  if (!normalizedHref) return "Відкрити";
  if (normalizedHref.startsWith(ROUTES.design)) return "До задачі";
  if (normalizedHref.startsWith(ROUTES.ordersEstimates)) return "До прорахунку";
  if (normalizedHref.startsWith(ROUTES.ordersCustomers)) return "До замовника";
  if (normalizedHref.startsWith(ROUTES.ordersProduction)) return "До замовлення";
  if (normalizedHref.startsWith(ROUTES.notifications)) return "До сповіщень";
  return "Відкрити";
}

// --- Routes ---
const ROUTES = {
  overview: "/overview",
  activity: "/activity",

  ordersEstimates: "/orders/estimates",
  ordersCustomers: "/orders/customers",
  ordersProduction: "/orders/production",
  ordersReadyToShip: "/orders/ready-to-ship",
  catalogProducts: "/catalog/products",

  logistics: "/logistics",
  design: "/design",
  contractors: "/contractors",
  team: "/team",

  workspaceSettings: "/workspace-settings",
  membersAccess: "/settings/members",
  notifications: "/notifications",
  accountSettings: "/account-settings",
  profile: "/profile",
  observability: "/admin/observability",
  toshoAi: TOSHO_AI_ROUTE,
} as const;

// --- Sidebar Config ---
const baseSidebarLinks: SidebarLink[] = [
  // Головне
  { label: "Огляд", to: ROUTES.overview, group: "overview", icon: LayoutGrid, moduleKey: "overview" },

  // Замовлення
  { label: "Замовники", to: ROUTES.ordersCustomers, group: "orders", icon: Building2, moduleKey: "orders" },
  { label: "Прорахунки", to: ROUTES.ordersEstimates, group: "orders", icon: Calculator, moduleKey: "orders" },
  { label: "Замовлення", to: ROUTES.ordersProduction, group: "orders", icon: Factory, moduleKey: "orders" },
  { label: "До відвантаження", to: ROUTES.ordersReadyToShip, group: "orders", icon: Truck, moduleKey: "orders" },
  // Операції
  { label: "Каталог", to: ROUTES.catalogProducts, group: "operations", icon: FolderKanban, moduleKey: "catalog" },
  { label: "Логістика", to: ROUTES.logistics, group: "operations", icon: Route, moduleKey: "logistics" },
  { label: "Дизайн", to: ROUTES.design, group: "operations", icon: Palette, moduleKey: "design" },
  {
    label: "Підрядники",
    to: ROUTES.contractors,
    group: "operations",
    icon: BriefcaseBusiness,
    moduleKey: "contractors",
  },

  // Акаунт
  { label: "Команда", to: ROUTES.team, group: "account", icon: Users },
  { label: "Сповіщення", to: ROUTES.notifications, group: "account", icon: Bell },
  { label: "Доступи", to: ROUTES.membersAccess, group: "account", icon: KeyRound, moduleKey: "team" },
  { label: "Observability", to: ROUTES.observability, group: "account", icon: BarChart3 },
];

const sidebarLinks: SidebarLink[] = baseSidebarLinks;

// --- Header Logic ---
const getHeaderConfig = (pathname: string): HeaderConfig => {
  if (pathname === ROUTES.overview)
    return {
      title: "Огляд",
      subtitle: "Пульс команди, найближчі події та швидкі дії.",
      breadcrumbLabel: "Огляд",
      breadcrumbTo: ROUTES.overview,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersEstimates))
    return {
      title: "Прорахунки замовлень",
      subtitle: "Підготовка розрахунків і комерційних пропозицій.",
      breadcrumbLabel: "Прорахунки замовлень",
      breadcrumbTo: ROUTES.ordersEstimates,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersCustomers))
    return {
      title: "Замовники",
      subtitle: "База компаній, реквізитів та контактної інформації.",
      breadcrumbLabel: "Замовники",
      breadcrumbTo: ROUTES.ordersCustomers,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersProduction))
    return {
      title: "Замовлення",
      subtitle: "Черга оформлення, оплати, виробництва та відвантаження.",
      breadcrumbLabel: "Замовлення",
      breadcrumbTo: ROUTES.ordersProduction,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.ordersReadyToShip))
    return {
      title: "Готові до відвантаження",
      subtitle: "Замовлення, що готові до логістики.",
      breadcrumbLabel: "Готові до відвантаження",
      breadcrumbTo: ROUTES.ordersReadyToShip,
    };
  if (pathname.startsWith(ROUTES.catalogProducts))
    return {
      title: "Каталог продукції",
      subtitle: "Довідники типів, видів, моделей та методів нанесення.",
      breadcrumbLabel: "Каталог продукції",
      breadcrumbTo: ROUTES.catalogProducts,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.logistics))
    return {
      title: "Логістика",
      subtitle: "Доставка, маршрути та статуси відвантаження.",
      breadcrumbLabel: "Логістика",
      breadcrumbTo: ROUTES.logistics,
    };
  if (pathname.startsWith(ROUTES.design))
    return {
      title: "Дизайн",
      subtitle: "Макети, правки та задачі на дизайн.",
      breadcrumbLabel: "Дизайн",
      breadcrumbTo: ROUTES.design,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.contractors))
    return {
      title: "Підрядники",
      subtitle: "",
      breadcrumbLabel: "Підрядники",
      breadcrumbTo: ROUTES.contractors,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.team))
    return {
      title: "Команда",
      subtitle: "Статуси команди, присутність і найближчі події.",
      breadcrumbLabel: "Команда",
      breadcrumbTo: ROUTES.team,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.notifications))
    return {
      title: "Сповіщення",
      subtitle: "Всі події та оновлення в одному місці.",
      breadcrumbLabel: "Сповіщення",
      breadcrumbTo: ROUTES.notifications,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.toshoAi))
    return {
      title: "ToSho AI",
      subtitle: "Командний центр, який пояснює, маршрутизує і дотискає CRM-кейси.",
      breadcrumbLabel: "ToSho AI",
      breadcrumbTo: ROUTES.toshoAi,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.activity))
    return {
      title: "Активність",
      subtitle: "Останні дії команди та зміни в системі.",
      breadcrumbLabel: "Активність",
      breadcrumbTo: ROUTES.activity,
    };
  if (pathname.startsWith(ROUTES.observability))
    return {
      title: "Admin Observability",
      subtitle: "Щоденні snapshots по базі, storage і важких SQL-шляхах.",
      breadcrumbLabel: "Observability",
      breadcrumbTo: ROUTES.observability,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.membersAccess))
    return {
      title: "Управління командою",
      subtitle: "Учасники, ролі, доступи та керування профілями команди.",
      breadcrumbLabel: "Управління командою",
      breadcrumbTo: ROUTES.membersAccess,
      showPageHeader: false,
    };
if (pathname === ROUTES.profile)
    return {
      title: "Мій профіль",
      subtitle: "Керуй своїм обліковим записом та налаштуваннями.",
      breadcrumbLabel: "Профіль",
      breadcrumbTo: ROUTES.profile,
      showPageHeader: false,
    };
  // fallback
  return {
    title: "Огляд",
    subtitle: "Пульс команди, найближчі події та швидкі дії.",
    breadcrumbLabel: "Огляд",
    breadcrumbTo: ROUTES.overview,
  };
};

// --- Small helpers ---
function isActivePath(currentPath: string, to: string) {
  return currentPath === to || currentPath.startsWith(to + "/");
}

type ThemeMode = "light" | "dark";

function getInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  try {
    localStorage.setItem("theme", mode);
  } catch {
    // ignore
  }
}

function formatDateTimeUA(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${date} • ${time}`;
}

function normalizeIdentity(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function reminderKeyFromHref(href?: string | null) {
  if (!href) return null;
  const queryIndex = href.indexOf("?");
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  const value = params.get("reminder");
  return value?.trim() || null;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <PageHeaderActionsProvider>
      <div className="notranslate" translate="no">
        <AppLayoutInner>{children}</AppLayoutInner>
      </div>
    </PageHeaderActionsProvider>
  );
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, teamId, session, permissions } = useAuth();
  const pageNode = children ?? <Outlet />;
  const baseHeader = useMemo(() => getHeaderConfig(location.pathname), [location.pathname]);
  const headerActions = usePageHeaderActionsValue();
  const isToShoAiRoute = location.pathname.startsWith(ROUTES.toshoAi);
  const toshoAiContext = useMemo(
    () =>
      buildToShoAiRouteContext({
        pathname: location.pathname,
        search: location.search,
        title: baseHeader.title,
      }),
    [baseHeader.title, location.pathname, location.search]
  );
  const [currentModuleAccess, setCurrentModuleAccess] = useState<Record<string, boolean> | null | undefined>(() => {
    if (!userId) return null;
    return getCachedCurrentWorkspaceMemberDirectoryEntry()?.moduleAccess;
  });
  const visibleSidebarLinks = useMemo(
    () =>
      sidebarLinks.filter((link) => {
        if (link.to === ROUTES.observability && !(permissions.isSuperAdmin || permissions.isAdmin)) {
          return false;
        }
        if (link.moduleKey) {
          if (link.moduleKey === "contractors" && permissions.isSuperAdmin) {
            return true;
          }
          if (currentModuleAccess === undefined) {
            return false;
          }
          return currentModuleAccess?.[link.moduleKey] !== false || (link.to === ROUTES.membersAccess && permissions.canEditMemberRoles);
        }
        return true;
      }),
    [currentModuleAccess, permissions.canEditMemberRoles, permissions.isAdmin, permissions.isSuperAdmin]
  );
  const sidebarRoutes = useMemo(() => visibleSidebarLinks.map((link) => link.to), [visibleSidebarLinks]);
  const shouldReveal = useMemo(() => {
    return sidebarRoutes.some((route) => {
      if (location.pathname === route) return true;
      return location.pathname.startsWith(`${route}/`);
    });
  }, [location.pathname, sidebarRoutes]);
  const pageContent = shouldReveal ? (
    <PageReveal activeKey={location.pathname}>
      {pageNode}
    </PageReveal>
  ) : (
    pageNode
  );
  const isCanvasMode =
    location.pathname === ROUTES.ordersEstimates ||
    location.pathname.startsWith(`${ROUTES.ordersEstimates}/`) ||
    location.pathname.startsWith(ROUTES.ordersCustomers) ||
    location.pathname.startsWith(ROUTES.ordersProduction) ||
    location.pathname.startsWith(ROUTES.design) ||
    location.pathname.startsWith(ROUTES.contractors) ||
    location.pathname.startsWith(ROUTES.notifications) ||
    location.pathname.startsWith(ROUTES.membersAccess);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentModuleAccess = async () => {
      if (!userId) {
        if (!cancelled) setCurrentModuleAccess(null);
        return;
      }

      try {
        const entry = await getCurrentWorkspaceMemberDirectoryEntry();
        if (!cancelled) {
          setCurrentModuleAccess(entry?.moduleAccess ?? null);
        }
      } catch (error) {
        console.error("Failed to resolve current member module access", error);
        if (!cancelled) {
          setCurrentModuleAccess(null);
        }
      }
    };

    void loadCurrentModuleAccess();

    const handleDirectoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === userId) {
        void loadCurrentModuleAccess();
      }
    };

    window.addEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleDirectoryUpdate as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleDirectoryUpdate as EventListener);
    };
  }, [userId]);

  // Optional workspace logo (kept null by default to avoid heavy legacy team queries)
  const [workspaceLogo] = useState<string | null>(null);

  const header = baseHeader;

  const workspacePresence = useWorkspacePresenceState({
    teamId,
    userId,
    session,
    pathname: location.pathname,
    currentLabel: header.title,
  });

  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [toshoAiOpen, setToshoAiOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("app_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [usdRateOpen, setUsdRateOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [realtimeDisabled, setRealtimeDisabled] = useState(() => isRealtimeDisabledForSession());
  const [inAppNotificationsEnabled, setInAppNotificationsEnabled] = useState(() => readInAppNotificationPreferences().enabled);
  const [inAppNotificationSoundEnabled, setInAppNotificationSoundEnabled] = useState(
    () => readInAppNotificationPreferences().soundEnabled
  );
  const shownInAppNotificationIdsRef = useRef<Set<string>>(new Set());
  const lastInAppNotificationSoundAtRef = useRef(0);
  const push = usePushNotifications(userId);
  const [, setActivityUnreadCount] = useState(0);
  const [usdUahRate, setUsdUahRate] = useState<number | null>(null);
  const [eurUahRate, setEurUahRate] = useState<number | null>(null);
  const [usdUahDelta, setUsdUahDelta] = useState<number | null>(null);
  const [eurUahDelta, setEurUahDelta] = useState<number | null>(null);
  const [, setUsdUahUpdatedAt] = useState<string | null>(null);
  const [usdUahSourceLabel, setUsdUahSourceLabel] = useState<string | null>(null);
  const [usdUahLoading, setUsdUahLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxStaleWarning, setFxStaleWarning] = useState<string | null>(null);
  const agencyLogo = useMemo(() => getAgencyLogo(theme), [theme]);
  const reminderAssigneeKeys = useMemo(() => {
    const keys = new Set<string>();
    const resolvedName = buildUserNameFromMetadata(
      session?.user?.user_metadata as Record<string, unknown> | undefined,
      session?.user?.email
    );
    if (resolvedName.displayName) {
      keys.add(normalizeIdentity(resolvedName.displayName));
    }
    if (resolvedName.fullName) {
      keys.add(normalizeIdentity(resolvedName.fullName));
    }
    const email = session?.user?.email ?? "";
    if (email) {
      keys.add(normalizeIdentity(email));
      const localPart = email.split("@")[0];
      if (localPart) keys.add(normalizeIdentity(localPart));
    }
    return keys;
  }, [session]);

  useEffect(() => {
    try {
      localStorage.setItem("app_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (isToShoAiRoute) return;
    saveToShoAiLastContext(toshoAiContext);
  }, [isToShoAiRoute, toshoAiContext]);

  useEffect(() => {
    const syncPreferences = () => {
      const next = readInAppNotificationPreferences();
      setInAppNotificationsEnabled(next.enabled);
      setInAppNotificationSoundEnabled(next.soundEnabled);
    };

    syncPreferences();
    window.addEventListener("storage", syncPreferences);
    window.addEventListener(IN_APP_NOTIFICATION_PREFERENCES_UPDATED_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener(IN_APP_NOTIFICATION_PREFERENCES_UPDATED_EVENT, syncPreferences);
    };
  }, []);

  const loadUsdUahRate = React.useCallback(async ({ signal, showToast = false }: { signal?: AbortSignal; showToast?: boolean } = {}) => {
    setUsdUahLoading(true);
    try {
      const payload = (await fetchMinfinFxRates(signal)) as Partial<MinfinFxResponse>;
      const usdToUah = payload?.usd?.sell;
      const eurToUah = payload?.eur?.sell;
      if (
        typeof usdToUah !== "number" ||
        !Number.isFinite(usdToUah) ||
        usdToUah <= 0 ||
        typeof eurToUah !== "number" ||
        !Number.isFinite(eurToUah) ||
        eurToUah <= 0
      ) {
        throw new Error("Invalid Minfin rate payload");
      }
      const nextUsdUahRate = usdToUah;
      const nextEurUahRate = eurToUah;
      const nextUsdUahDelta =
        typeof payload?.usd?.sellChange === "number" && Number.isFinite(payload.usd.sellChange)
          ? payload.usd.sellChange
          : null;
      const nextEurUahDelta =
        typeof payload?.eur?.sellChange === "number" && Number.isFinite(payload.eur.sellChange)
          ? payload.eur.sellChange
          : null;
      const nowIso =
        typeof payload.fetchedAt === "string" && !Number.isNaN(new Date(payload.fetchedAt).getTime())
          ? payload.fetchedAt
          : new Date().toISOString();
      const sourceLabel = typeof payload.updatedAtLabel === "string" ? payload.updatedAtLabel : null;
      const staleWarning = getFxStaleWarning(sourceLabel);
      setUsdUahRate(nextUsdUahRate);
      setEurUahRate(nextEurUahRate);
      setUsdUahDelta(nextUsdUahDelta);
      setEurUahDelta(nextEurUahDelta);
      setUsdUahUpdatedAt(nowIso);
      setUsdUahSourceLabel(sourceLabel);
      setFxError(null);
      setFxStaleWarning(staleWarning);
      try {
        localStorage.setItem(
          FX_RATES_STORAGE_KEY,
          JSON.stringify({
            usdUah: nextUsdUahRate,
            eurUah: nextEurUahRate,
            usdUahDelta: nextUsdUahDelta,
            eurUahDelta: nextEurUahDelta,
            updatedAt: nowIso,
            sourceLabel,
          })
        );
      } catch {
        // Ignore storage failures (private mode, quota etc).
      }
      if (showToast) {
        if (staleWarning) {
          toast.warning("Курс оновлено, але дані застарілі", {
            description: staleWarning,
          });
        } else {
          toast.success("Курс валют оновлено");
        }
      }
    } catch (error) {
      const message = getFxErrorMessage(error);
      setFxError(message);
      setFxStaleWarning(null);
      if (import.meta.env.DEV) {
        console.warn("Failed to refresh Minfin rates", error);
      }
      if (showToast) {
        toast.error("Не вдалося оновити курс", {
          description: message,
        });
      }
    } finally {
      setUsdUahLoading(false);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FX_RATES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        usdUah?: unknown;
        eurUah?: unknown;
        usdUahDelta?: unknown;
        eurUahDelta?: unknown;
        updatedAt?: unknown;
        sourceLabel?: unknown;
      };
      const cachedAt =
        typeof parsed.updatedAt === "string" && !Number.isNaN(new Date(parsed.updatedAt).getTime())
          ? new Date(parsed.updatedAt).getTime()
          : null;
      if (cachedAt === null || Date.now() - cachedAt > FX_RATES_MAX_AGE_MS) {
        localStorage.removeItem(FX_RATES_STORAGE_KEY);
        return;
      }
      if (typeof parsed.usdUah === "number" && Number.isFinite(parsed.usdUah) && parsed.usdUah > 0) {
        setUsdUahRate(parsed.usdUah);
      }
      if (typeof parsed.eurUah === "number" && Number.isFinite(parsed.eurUah) && parsed.eurUah > 0) {
        setEurUahRate(parsed.eurUah);
      }
      if (typeof parsed.usdUahDelta === "number" && Number.isFinite(parsed.usdUahDelta)) {
        setUsdUahDelta(parsed.usdUahDelta);
      }
      if (typeof parsed.eurUahDelta === "number" && Number.isFinite(parsed.eurUahDelta)) {
        setEurUahDelta(parsed.eurUahDelta);
      }
      if (typeof parsed.updatedAt === "string" && parsed.updatedAt) {
        setUsdUahUpdatedAt(parsed.updatedAt);
      }
      if (typeof parsed.sourceLabel === "string" && parsed.sourceLabel) {
        setUsdUahSourceLabel(parsed.sourceLabel);
        setFxStaleWarning(getFxStaleWarning(parsed.sourceLabel));
      }
    } catch {
      // Ignore invalid local cache.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsdUahRate({ signal: controller.signal });
    const intervalId = window.setInterval(() => {
      void loadUsdUahRate();
    }, 15 * 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [loadUsdUahRate]);


  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const loadActivityUnread = React.useCallback(async () => {
    if (!teamId || !userId) return;
    const { data: state } = await supabase
      .from("activity_read_state")
      .select("last_seen_at")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();

    const lastSeen = state?.last_seen_at ?? null;
    const baseQuery = supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);
    const { count } = lastSeen ? await baseQuery.gt("created_at", lastSeen) : await baseQuery;
    setActivityUnreadCount(count || 0);
  }, [teamId, userId]);

  const loadNotifications = React.useCallback(async () => {
    if (!userId) return;
    setNotificationsLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, href, created_at, read_at, type")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) {
      setNotifications(((data || []) as NotificationRow[]).map(mapNotificationRow));
    }
    setNotificationsLoading(false);
  }, [userId]);

  const playInAppNotificationSound = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!inAppNotificationSoundEnabled) return;
    if (document.visibilityState !== "visible") return;

    const now = Date.now();
    if (now - lastInAppNotificationSoundAtRef.current < 2500) return;
    lastInAppNotificationSoundAtRef.current = now;

    await playNotificationSound();
  }, [inAppNotificationSoundEnabled]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId) return;
    if (!realtimeDisabled) return;
    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void loadNotifications();
    }, FALLBACK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications, realtimeDisabled, userId]);

  useEffect(() => {
    if (!userId || !teamId || reminderAssigneeKeys.size === 0) return;

    let disposed = false;
    let inFlight = false;

    const run = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const now = new Date();
        const nowIso = now.toISOString();
        const fromIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [customersResult, leadsResult, existingResult] = await Promise.all([
          supabase
            .schema("tosho")
            .from("customers")
            .select("id,name,manager,manager_user_id,reminder_at,reminder_comment")
            .eq("team_id", teamId)
            .not("reminder_at", "is", null)
            .lte("reminder_at", nowIso)
            .gte("reminder_at", fromIso)
            .order("reminder_at", { ascending: false })
            .limit(100),
          supabase
            .schema("tosho")
            .from("leads")
            .select("id,company_name,manager,manager_user_id,reminder_at,reminder_comment")
            .eq("team_id", teamId)
            .not("reminder_at", "is", null)
            .lte("reminder_at", nowIso)
            .gte("reminder_at", fromIso)
            .order("reminder_at", { ascending: false })
            .limit(100),
          supabase
            .from("notifications")
            .select("href")
            .eq("user_id", userId)
            .not("href", "is", null)
            .like("href", "/orders/customers%")
            .gte("created_at", fromIso)
            .limit(500),
        ]);

        if (customersResult.error || leadsResult.error || existingResult.error) return;

        const existingKeys = new Set(
          (((existingResult.data ?? []) as Array<{ href?: string | null }>).map((row) =>
            reminderKeyFromHref(row.href)
          ).filter((value): value is string => Boolean(value)))
        );

        const toInsert: Array<{
          user_id: string;
          title: string;
          body: string;
          href: string;
          type: "warning";
        }> = [];

        const pushReminder = (kind: "customer" | "lead", id: string, name: string, reminderAt: string, comment?: string) => {
          const key = `${kind}:${id}:${reminderAt}`;
          if (existingKeys.has(key)) return;
          existingKeys.add(key);
          const title = `Нагадування: ${name}`;
          const description = comment?.trim()
            ? `${comment.trim()}\nЗаплановано на ${formatDateTimeUA(reminderAt)}`
            : `Заплановано на ${formatDateTimeUA(reminderAt)}`;
          const params = new URLSearchParams({
            reminder: key,
            tab: kind === "lead" ? "leads" : "customers",
            [kind === "lead" ? "leadId" : "customerId"]: id,
          });
          const href = `/orders/customers?${params.toString()}`;
          toInsert.push({
            user_id: userId,
            title,
            body: description,
            href,
            type: "warning",
          });
        };

        for (const row of (customersResult.data ?? []) as Array<{
          id: string;
          name?: string | null;
          manager?: string | null;
          manager_user_id?: string | null;
          reminder_at?: string | null;
          reminder_comment?: string | null;
        }>) {
          if (!row.reminder_at) continue;
          if (row.manager_user_id && row.manager_user_id !== userId) continue;
          const manager = normalizeIdentity(row.manager);
          if (manager && !reminderAssigneeKeys.has(manager)) continue;
          pushReminder("customer", row.id, row.name?.trim() || "Замовник", row.reminder_at, row.reminder_comment ?? "");
        }

        for (const row of (leadsResult.data ?? []) as Array<{
          id: string;
          company_name?: string | null;
          manager?: string | null;
          manager_user_id?: string | null;
          reminder_at?: string | null;
          reminder_comment?: string | null;
        }>) {
          if (!row.reminder_at) continue;
          if (row.manager_user_id && row.manager_user_id !== userId) continue;
          const manager = normalizeIdentity(row.manager);
          if (manager && !reminderAssigneeKeys.has(manager)) continue;
          pushReminder("lead", row.id, row.company_name?.trim() || "Лід", row.reminder_at, row.reminder_comment ?? "");
        }

        if (toInsert.length > 0) {
          await Promise.all(
            toInsert.map((row) =>
              notifyUsers({
                userIds: [row.user_id],
                title: row.title,
                body: row.body,
                href: row.href,
                type: row.type,
              })
            )
          );
        }
      } finally {
        inFlight = false;
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void run();
    }, REMINDER_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [reminderAssigneeKeys, teamId, userId]);

  useEffect(() => {
    loadActivityUnread();
  }, [loadActivityUnread]);

  useEffect(() => {
    if (!teamId || !userId) return;
    if (!realtimeDisabled) return;
    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void loadActivityUnread();
    }, FALLBACK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadActivityUnread, realtimeDisabled, teamId, userId]);

  useEffect(() => {
    const handler = () => {
      loadActivityUnread();
    };
    window.addEventListener("activity_read", handler);
    return () => {
      window.removeEventListener("activity_read", handler);
    };
  }, [loadActivityUnread]);

  const openNotification = React.useCallback(async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
  }, [navigate]);

  const showInAppNotificationToast = React.useCallback(
    (item: NotificationItem) => {
      if (typeof window === "undefined") return;
      if (!inAppNotificationsEnabled) return;
      if (location.pathname.startsWith("/notifications")) return;
      if (document.visibilityState !== "visible") return;

      const currentRoute = `${location.pathname}${location.search}`;
      if (shouldSuppressInAppNotificationToast(currentRoute, item.href)) return;

      const toastId = `notification:${item.id}`;
      if (shownInAppNotificationIdsRef.current.has(toastId)) return;
      shownInAppNotificationIdsRef.current.add(toastId);

      const description = trimNotificationDescription(item.description);
      toast.custom(
        (t) =>
          renderInAppToastContent({
            title: item.title?.trim() || "Нове сповіщення",
            description,
            tone: item.tone,
            actionLabel: item.href ? getNotificationActionLabel(item.href) : undefined,
            onAction: item.href
              ? () => {
                  void openNotification(item);
                }
              : undefined,
            onClose: () => toast.dismiss(t),
          }),
        {
        id: toastId,
        position: "top-right",
        duration: getInAppNotificationDuration(item.tone),
        className: "!border-0 !bg-transparent !p-0 !shadow-none",
        }
      );

      void playInAppNotificationSound();
    },
    [inAppNotificationsEnabled, location.pathname, location.search, openNotification, playInAppNotificationSound]
  );

  useEffect(() => {
    if (realtimeDisabled) return;
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          const item = mapNotificationRow(row);
          setNotifications((prev) => [item, ...prev].slice(0, 20));
          showInAppNotificationToast(item);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          enableRealtimeForSession();
          setRealtimeDisabled(false);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          disableRealtimeForSession();
          setRealtimeDisabled(true);
          void loadNotifications();
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications, realtimeDisabled, showInAppNotificationToast, userId]);

  useEffect(() => {
    if (realtimeDisabled) return;
    if (!teamId) return;
    const channel = supabase
      .channel(`activity:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_log",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          if (location.pathname.startsWith(ROUTES.activity)) {
            setActivityUnreadCount(0);
            return;
          }
          setActivityUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          enableRealtimeForSession();
          setRealtimeDisabled(false);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          disableRealtimeForSession();
          setRealtimeDisabled(true);
          void loadActivityUnread();
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActivityUnread, location.pathname, realtimeDisabled, teamId]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const unreadNotifications = notifications.filter((n) => !n.read);

  const markAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("Усі сповіщення прочитані");
    } else {
      toast.error("Не вдалося оновити сповіщення");
    }
  };

  return (
    <WorkspacePresenceProvider value={workspacePresence}>
      <div
        className={cn(
          "min-h-screen min-h-[100dvh] text-foreground selection:bg-primary/20 selection:text-primary",
          "bg-[hsl(var(--page-underlay-bg))]"
        )}
      >
      {/* DESKTOP SIDEBAR */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 z-30 flex-col bg-[hsl(var(--sidebar-surface-bg))] border-r border-border/40",
          "transition-[width,background-color,border-color] duration-[220ms] ease-linear",
          sidebarCollapsed ? "w-[84px]" : "w-[290px]"
        )}
      >
        <div className={cn("h-14 border-b border-border/40", sidebarCollapsed ? "px-3" : "px-4")}>
          <div className={cn("flex h-full items-center", sidebarCollapsed ? "justify-center" : "justify-between")}>
            <Link
              to={ROUTES.overview}
              onMouseEnter={() => preloadRoute(ROUTES.overview)}
              onFocus={() => preloadRoute(ROUTES.overview)}
              onTouchStart={() => preloadRoute(ROUTES.overview)}
              className={cn(
                "inline-flex items-center justify-center overflow-hidden rounded-[10px] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                sidebarCollapsed
                  ? "h-0 w-0 opacity-0 -translate-x-2 pointer-events-none"
                  : "h-9 w-auto px-1 opacity-100 translate-x-0 translate-y-[2px]"
              )}
              aria-label="ToSho CRM"
              aria-hidden={sidebarCollapsed}
              tabIndex={sidebarCollapsed ? -1 : undefined}
            >
              <img src={agencyLogo || workspaceLogo || ""} alt="ToSho CRM" className="h-[22px] w-auto" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-[var(--radius-lg)] text-muted-foreground hover:text-foreground transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] translate-y-[2px]",
                sidebarCollapsed ? "rounded-[12px] bg-background/35" : ""
              )}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"}
              title={sidebarCollapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4 transition-transform duration-300" />
              ) : (
                <PanelLeftClose className="h-4 w-4 transition-transform duration-300 rotate-0" />
              )}
            </Button>
          </div>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overflow-x-hidden transition-[padding] duration-[220ms] ease-linear",
            sidebarCollapsed ? "px-2 py-2" : "px-4 py-3"
          )}
        >
          {currentModuleAccess === undefined ? (
            <SidebarNavSkeleton collapsed={sidebarCollapsed} />
          ) : (
          <div
            className={cn(
              sidebarCollapsed
                ? "[&>div+div]:relative [&>div+div]:before:absolute [&>div+div]:before:left-1/2 [&>div+div]:before:top-0 [&>div+div]:before:h-px [&>div+div]:before:w-6 [&>div+div]:before:-translate-x-1/2 [&>div+div]:before:bg-border/70"
                : "space-y-4"
            )}
          >
            <div className={cn("relative", sidebarCollapsed ? "py-2.5 first:pt-0" : "")}>
              <SidebarGroup
                label="Головне"
                links={visibleSidebarLinks.filter((l) => l.group === "overview")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
                hideLabel
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Збут"
                links={visibleSidebarLinks.filter((l) => l.group === "orders")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Операції"
                links={visibleSidebarLinks.filter((l) => l.group === "operations")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5 pb-0" : "")}>
              <SidebarGroup
                label="Акаунт"
                links={visibleSidebarLinks.filter((l) => l.group === "account")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
          </div>
          )}
        </nav>

        {/* Footer / Profile */}
<div className={cn("border-t border-border/40", sidebarCollapsed ? "p-2" : "p-4")}>
  <UserMenu compact={sidebarCollapsed} />
</div>
      </aside>

      {/* MAIN */}
      <div
        className={cn(
          "transition-[padding] duration-[220ms] ease-linear",
          sidebarCollapsed ? "md:pl-[84px]" : "md:pl-[290px]"
        )}
      >
        <div>
        {/* HEADER */}
        <header
          key={theme}
          className={cn(
            "fixed top-0 right-0 z-20 border-b border-border/40 transition-[background-color,backdrop-filter,border-color] duration-200",
            "bg-[hsl(var(--page-underlay-bg))]/80 supports-[backdrop-filter]:backdrop-blur-lg",
            sidebarCollapsed ? "md:left-[84px]" : "md:left-[290px]",
            "left-0"
          )}
        >
          <div className="flex h-14 items-center gap-3 px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)_minmax(0,1fr)] md:items-center md:gap-4 md:px-5 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {/* Mobile menu */}
              <div className="md:hidden">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-[var(--radius-lg)]">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>

                  <SheetContent
                    side="left"
                    hideClose
                    className={cn(
                      "min-h-[100dvh] w-[min(92vw,340px)] max-w-[340px] overflow-hidden border-r border-border/70 bg-[hsl(var(--sidebar-surface-bg))]/95 p-0 shadow-2xl backdrop-blur-xl",
                      "pb-[env(safe-area-inset-bottom)] will-change-transform",
                      "data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:ease-out data-[state=closed]:ease-in"
                    )}
                  >
                    <div className="flex h-full min-w-0 flex-col overflow-hidden">
                      <div className="shrink-0 border-b border-border/70 bg-background/55">
                        <SheetHeader className="px-4 pb-2 pt-4">
                          <div className="flex items-center justify-between gap-3">
                            <SheetTitle className="flex items-center">
                              <Link
                                to={ROUTES.overview}
                                onClick={() => setMobileMenuOpen(false)}
                                className="inline-flex items-center justify-center rounded-[10px] px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                                aria-label="ToSho CRM"
                              >
                                <img src={agencyLogo || workspaceLogo || ""} alt="ToSho CRM" className="h-[24px] w-auto" />
                              </Link>
                            </SheetTitle>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                variant="control"
                                size="iconMd"
                                onClick={toggleTheme}
                                aria-label={theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
                                title={theme === "dark" ? "Світла тема" : "Темна тема"}
                              >
                                {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
                              </Button>
                              <SheetClose asChild>
                                <Button
                                  variant="control"
                                  size="iconMd"
                                  aria-label="Закрити меню"
                                  title="Закрити меню"
                                >
                                  <X className="h-4.5 w-4.5" />
                                </Button>
                              </SheetClose>
                            </div>
                          </div>
                        </SheetHeader>

                        <div className="px-4 pb-3">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              readOnly
                              value=""
                              placeholder="Пошук…"
                              className={cn(
                                "h-10 rounded-[var(--radius-lg)] border border-input bg-background/75 pl-10 pr-16",
                                "cursor-pointer",
                                "focus-visible:ring-2 focus-visible:ring-primary/30"
                              )}
                              onClick={() => setCmdkOpen(true)}
                            />
                            <div className="absolute inset-y-0 right-2 flex items-center">
                              <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-[6px] border border-border bg-muted/70 px-2.5 font-mono text-[10px] font-medium text-muted-foreground">
                                <span className="text-[11px]">⌘</span>K
                              </kbd>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 pb-8">
                        <div className="space-y-5">
                          <SidebarGroup
                            label="Головне"
                            links={visibleSidebarLinks.filter((l) => l.group === "overview")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                            hideLabel
                          />
                          <SidebarGroup
                            label="Замовлення"
                            links={visibleSidebarLinks.filter((l) => l.group === "orders")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                          />
                          <SidebarGroup
                            label="Операції"
                            links={visibleSidebarLinks.filter((l) => l.group === "operations")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                          />
                          <SidebarGroup
                            label="Акаунт"
                            links={visibleSidebarLinks.filter((l) => l.group === "account")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                          />
                        </div>
                        <div className="mt-6 border-t border-border/70 pt-4">
                          <UserMenu mobile onNavigate={() => setMobileMenuOpen(false)} />
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Breadcrumb */}
              <div className="hidden md:flex h-7 items-center gap-1 text-[12px] leading-none font-medium text-muted-foreground">
                <Link
                  to={ROUTES.overview}
                  className="inline-flex h-7 items-center rounded-[var(--radius-md)] px-1.5 leading-none hover:bg-muted/60 hover:text-foreground transition-colors duration-150"
                >
                  ToSho CRM
                </Link>
                <span className="text-muted-foreground/40 select-none">/</span>
                <Link
                  to={header.breadcrumbTo}
                  className="inline-flex h-7 items-center rounded-[var(--radius-md)] bg-muted/50 px-2 leading-none text-foreground/90 hover:bg-muted hover:text-foreground transition-colors duration-150"
                >
                  {header.breadcrumbLabel}
                </Link>
              </div>

              {/* Mobile title */}
              <div className="min-w-0 flex-1 md:hidden">
                <div className="truncate text-[1.25rem] font-semibold leading-tight tracking-tight text-foreground">
                  {header.title}
                </div>
              </div>
            </div>

            {/* CENTER SEARCH */}
            <div className="hidden md:flex min-w-0 items-center justify-center">
              <button
                type="button"
                onClick={() => setCmdkOpen(true)}
                className="inline-flex h-10 w-full max-w-[520px] items-center gap-2 rounded-xl border border-border/50 bg-muted/40 shadow-inner pl-3.5 pr-1.5 text-sm text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground cursor-pointer"
              >
                <Search className="h-4 w-4 shrink-0 opacity-70" />
                <span className="flex-1 text-left">Пошук...</span>
                <kbd className="inline-flex h-6 select-none items-center rounded-md border border-border bg-background/60 px-2 font-mono text-[10px] font-medium opacity-80">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* RIGHT ACTIONS */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0 md:justify-self-end md:gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="hidden lg:inline-flex h-10 rounded-full border-border/50 bg-muted/40 px-4 shadow-inner"
                onClick={() => setToshoAiOpen(true)}
              >
                <Sparkles className="h-4 w-4" />
                ToSho AI
              </Button>

              <AppDropdown
                align="end"
                sideOffset={10}
                contentClassName="w-[308px] p-0"
                open={usdRateOpen}
                onOpenChange={setUsdRateOpen}
                trigger={
                  <button
                    type="button"
                    className="hidden lg:inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-border/50 bg-muted/40 shadow-inner px-3 text-xs transition-all duration-200 hover:bg-muted/60 cursor-pointer"
                    aria-label="Курси валют"
                    title={fxError ?? fxStaleWarning ?? "Мінфін міжбанк · продаж"}
                  >
                    {fxError || fxStaleWarning ? (
                      <ShieldAlert className="h-3.5 w-3.5 text-danger-foreground" />
                    ) : null}
                    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-foreground/90">
                      <FxCurrencyBadge code="USD" />
                      USD {usdUahRate ? usdUahRate.toFixed(2) : "Не вказано"}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-foreground/90">
                      <FxCurrencyBadge code="EUR" />
                      EUR {eurUahRate ? eurUahRate.toFixed(2) : "Не вказано"}
                    </span>
                  </button>
                }
                content={
                  <div className="space-y-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">Курси валют</div>
                      {usdUahLoading ? <CircleDot className="h-3.5 w-3.5 animate-pulse text-muted-foreground" /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getFxSourceText(usdUahSourceLabel, Boolean(usdUahRate || eurUahRate))}
                    </div>
                    {fxError ? (
                      <div className="rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger-foreground">
                        <div className="font-semibold">Курс не оновився</div>
                        <div className="mt-1">{fxError}</div>
                        <div className="mt-1 text-[11px] opacity-90">
                          Перевір `/.netlify/functions/fx-rates`, доступність Мінфіну або парсинг HTML.
                        </div>
                      </div>
                    ) : null}
                    {!fxError && fxStaleWarning ? (
                      <div className="rounded-md border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                        <div className="font-semibold">Потрібна перевірка джерела</div>
                        <div className="mt-1">{fxStaleWarning}</div>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-2.5">
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <FxCurrencyBadge code="USD" className="h-4 w-7" />
                          Долар США
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap pr-0.5">
                          <div className="text-[17px] font-semibold tabular-nums text-foreground">
                            {usdUahRate ? usdUahRate.toFixed(2) : "Не вказано"}
                          </div>
                          {usdUahDelta !== null && usdUahDelta !== 0 ? (
                            <div
                              className={cn(
                                "text-[13px] font-medium tabular-nums",
                                usdUahDelta > 0 ? "text-success-foreground" : "text-danger-foreground"
                              )}
                            >
                              {usdUahDelta > 0 ? "↑" : "↓"} {formatFxDelta(usdUahDelta)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-2.5">
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <FxCurrencyBadge code="EUR" className="h-4 w-7" />
                          Євро
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap pr-0.5">
                          <div className="text-[17px] font-semibold tabular-nums text-foreground">
                            {eurUahRate ? eurUahRate.toFixed(2) : "Не вказано"}
                          </div>
                          {eurUahDelta !== null && eurUahDelta !== 0 ? (
                            <div
                              className={cn(
                                "text-[13px] font-medium tabular-nums",
                                eurUahDelta > 0 ? "text-success-foreground" : "text-danger-foreground"
                              )}
                            >
                              {eurUahDelta > 0 ? "↑" : "↓"} {formatFxDelta(eurUahDelta)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => void loadUsdUahRate({ showToast: true })}
                      disabled={usdUahLoading}
                    >
                      Оновити
                    </Button>
                    <a
                      href={MINFIN_MB_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Відкрити джерело на Мінфіні
                    </a>
                  </div>
                }
              />

              <OnlineNowDropdown
                entries={workspacePresence.onlineEntries}
                loading={workspacePresence.loading}
                compact
              />

              {/* Theme toggle */}
              <Button
                variant="control"
                size="iconMd"
                className="hidden md:inline-flex"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
                title={theme === "dark" ? "Світла тема" : "Темна тема"}
              >
                {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
              </Button>

              <AppDropdown
                align="end"
                sideOffset={10}
                contentClassName="w-[340px]"
                open={notificationsOpen}
                onOpenChange={setNotificationsOpen}
                trigger={
                  <Button
                    type="button"
                    variant="control"
                    size="iconMd"
                    className="relative rounded-xl border border-border/50 bg-muted/40 shadow-inner hover:bg-muted/60 h-10 w-10 transition-all duration-200"
                    aria-label="Сповіщення"
                    title="Сповіщення"
                  >
                    <Bell className="h-4.5 w-4.5" />
                    {unreadCount > 0 ? (
                      <span className="pointer-events-none absolute right-0 top-0 inline-flex h-5 min-w-5 -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </Button>
                }
                content={
                  <>
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold tracking-tight text-foreground">Сповіщення</div>
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          {push.supported && push.configured ? (
                            <Button
                              type="button"
                              variant={push.enabled ? "secondary" : "outline"}
                              size="xs"
                              className="rounded-full"
                              onClick={push.enabled ? push.disable : push.enable}
                              disabled={push.busy}
                            >
                              {push.enabled ? "Push увімкнено" : "Push вимкнено"}
                            </Button>
                          ) : null}
                          {unreadCount > 0 ? (
                            <Button
                              type="button"
                              variant="textMuted"
                              size="xs"
                              onClick={markAllRead}
                              className="h-auto px-0 py-0.5"
                            >
                              Позначити всі
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="h-px bg-border/70" />
                    <div className="max-h-[320px] overflow-auto">
                      {notificationsLoading ? (
                        <div className="px-4 py-6 text-center text-xs text-muted-foreground">Завантаження...</div>
                      ) : unreadNotifications.length === 0 ? (
                        <div className="px-4 py-4">
                          <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-5 text-center">
                            <div className="text-sm font-medium text-foreground">Немає непрочитаних</div>
                            <div className="mt-1 text-xs text-muted-foreground">Нові події з’являться тут автоматично.</div>
                          </div>
                        </div>
                      ) : (
                        unreadNotifications.map((n) => (
                          <Button
                            key={n.id}
                            type="button"
                            variant="menu"
                            size="sm"
                            className="h-auto w-full items-start justify-start gap-3 px-4 py-3 text-left"
                            onClick={() => {
                              openNotification(n);
                              setNotificationsOpen(false);
                            }}
                          >
                            <span
                              className={cn(
                                "mt-1 h-2 w-2 rounded-full",
                                !n.read && n.tone === "success" && "tone-dot-success",
                                !n.read && n.tone === "warning" && "tone-dot-warning",
                                !n.read && n.tone === "info" && "tone-dot-info",
                                !n.read && !n.tone && "bg-muted-foreground",
                                n.read && "bg-muted-foreground/40"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-foreground truncate">{n.title}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.description}</div>
                              <div className="mt-1 text-[10px] text-muted-foreground/70">{n.time}</div>
                            </div>
                          </Button>
                        ))
                      )}
                    </div>
                    <div className="h-px bg-border/70" />
                    <Button
                      type="button"
                      variant="menu"
                      size="sm"
                      className="h-auto w-full justify-between px-4 py-3 text-left"
                      onClick={() => {
                        navigate("/notifications");
                        setNotificationsOpen(false);
                      }}
                    >
                      <span className="font-medium">Всі сповіщення</span>
                      <span className="text-xs text-muted-foreground">Відкрити</span>
                    </Button>
                  </>
                }
              />

            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main
          className={cn(
            "w-full overflow-x-hidden pb-[calc(var(--tabbar-height)+var(--tabbar-inset-bottom)+16px)] md:pb-0",
            isCanvasMode ? "px-0 pt-14 md:px-0 lg:px-0" : "px-4 pt-[76px] md:px-5 lg:px-6"
          )}
          data-canvas-mode={isCanvasMode ? "on" : "off"}
        >
          <div className={cn(isCanvasMode ? "min-w-0" : "mx-auto max-w-[1600px] space-y-6 min-w-0")}>
            {/* Page header / page-level actions */}
            {header.showPageHeader === false ? (
              headerActions ? (
                <div className="border-b border-[hsl(var(--app-structure-divider))] bg-[hsl(var(--page-underlay-bg)/0.72)] supports-[backdrop-filter]:backdrop-blur-md">
                  <div className={cn("px-4 py-3 md:px-5 lg:px-6", !isCanvasMode && "px-0 py-0 md:px-0 lg:px-0")}>
                    {headerActions}
                  </div>
                </div>
              ) : header.eyebrow ? (
                <div className="hidden md:flex">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {header.eyebrow}
                  </span>
                </div>
              ) : null
            ) : (
              <div className="hidden md:flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-semibold tracking-tight">{header.title}</h1>
                  <p className="text-sm text-muted-foreground">{header.subtitle}</p>
                </div>
                {headerActions ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
                ) : null}
              </div>
            )}

            <div>{pageContent}</div>
          </div>
        </main>
        </div>
      </div>

      <TabBar hidden={mobileMenuOpen} />
      <Sheet open={toshoAiOpen} onOpenChange={setToshoAiOpen}>
        <SheetContent
          side="right"
          hideClose
          className="w-full max-w-none overflow-hidden border-l border-border/70 bg-[linear-gradient(180deg,hsl(var(--page-underlay-bg)),hsl(var(--card)))] p-0 sm:max-w-[920px]"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-border/70 bg-background/70 px-4 py-4 backdrop-blur-xl md:px-5">
              <SheetHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      ToSho AI
                    </div>
                    <SheetTitle className="text-[1.65rem] leading-tight tracking-[-0.04em]">
                      Шо треба?
                    </SheetTitle>
                    <div className="max-w-[40rem] text-sm leading-6 text-muted-foreground">
                      Пояснить. Полагодить. Передасть. Дотисне. І одразу прикрутить контекст поточної CRM-сторінки.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigate(ROUTES.toshoAi);
                        setToshoAiOpen(false);
                      }}
                    >
                      Відкрити як сторінку
                    </Button>
                    <SheetClose asChild>
                      <Button type="button" variant="ghost" size="iconSm" aria-label="Закрити ToSho AI">
                        <CloseIcon className="h-4 w-4" />
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </SheetHeader>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
              <ToShoAiConsole
                active={toshoAiOpen}
                surface="sheet"
                initialContext={isToShoAiRoute ? undefined : toshoAiContext}
                onOpenFullPage={() => {
                  navigate(ROUTES.toshoAi);
                  setToshoAiOpen(false);
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {!isToShoAiRoute ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-end px-4 pb-[calc(var(--tabbar-height)+var(--tabbar-inset-bottom)+18px)] md:right-0 md:px-6 md:pb-6">
          <Button
            type="button"
            size="lg"
            className="pointer-events-auto h-12 rounded-full px-4 shadow-[var(--shadow-elevated-lg)]"
            onClick={() => setToshoAiOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            ToSho AI
            <span className="hidden text-background/70 sm:inline">Шо треба?</span>
          </Button>
        </div>
      ) : null}
      <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
      </div>
    </WorkspacePresenceProvider>
  );
}

function SidebarNavSkeleton({ collapsed }: { collapsed: boolean }) {
  const groups = [
    { count: 1, showLabel: false },
    { count: 4, showLabel: true },
    { count: 3, showLabel: true },
    { count: 5, showLabel: true },
  ] as const;

  return (
    <div className={cn("space-y-4", collapsed && "space-y-0")}>
      {groups.map((group, groupIndex) => (
        <div key={`${group.count}-${groupIndex}`} className="space-y-1">
          {!collapsed && group.showLabel ? <Skeleton className="mx-3 mb-2 h-2.5 w-12 rounded-md" /> : null}
          {Array.from({ length: group.count }).map((_, itemIndex) => (
            <div
              key={`${groupIndex}-${itemIndex}`}
              className={cn("flex items-center gap-2.5", collapsed ? "mx-auto h-10 w-10 justify-center" : "h-9 px-3")}
            >
              <Skeleton className="h-[18px] w-[18px] shrink-0 rounded-md" />
              {!collapsed ? <Skeleton className="h-4 w-[100px] max-w-full rounded-md" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SidebarGroup({
  label,
  links,
  currentPath,
  onNavigate,
  notificationsUnreadCount = 0,
  collapsed = false,
  hideLabel = false,
}: {
  label: string;
  links: SidebarLink[];
  currentPath: string;
  onNavigate?: () => void;
  notificationsUnreadCount?: number;
  collapsed?: boolean;
  hideLabel?: boolean;
}) {
  if (links.length === 0) return null;
  const isMobileDrawer = !collapsed && Boolean(onNavigate);

  return (
    <div className={cn(hideLabel ? "space-y-1" : isMobileDrawer ? "space-y-2.5" : "space-y-2")}>
      {!collapsed && !hideLabel ? (
        <h4
          className={cn(
            "px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/65",
            isMobileDrawer ? "px-4 tracking-widest text-muted-foreground/75" : undefined
          )}
        >
          {label}
        </h4>
      ) : null}

      <div className={cn(isMobileDrawer ? "space-y-1.5" : "space-y-1")}>
        {links.map((link) => {
          const active = isActivePath(currentPath, link.to);
          const Icon = link.icon;
          const showNotificationsBadge = link.to === ROUTES.notifications && notificationsUnreadCount > 0;

          const navLink = (
            <Link
              to={link.to}
              onClick={() => {
                onNavigate?.();
              }}
              onMouseEnter={() => preloadRoute(link.to)}
              onFocus={() => preloadRoute(link.to)}
              onTouchStart={() => preloadRoute(link.to)}
              className={cn(
                "relative group flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2 text-sm font-medium",
                "transition-colors duration-150 ease-linear",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                collapsed
                  ? "mx-auto h-10 w-10 justify-center gap-0 rounded-[14px] px-0 py-0"
                  : isMobileDrawer
                    ? "min-h-11 rounded-[16px] px-4 py-2.5"
                    : "h-9 rounded-[10px]",
                active
                  ? collapsed
                    ? "bg-foreground/5 text-foreground shadow-sm ring-1 ring-border/20"
                    : isMobileDrawer
                      ? "bg-foreground/5 text-foreground shadow-sm ring-1 ring-border/20"
                      : "bg-foreground/5 text-foreground shadow-sm ring-1 ring-border/20 font-medium"
                  : isMobileDrawer
                    ? "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >

              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />

              {!collapsed ? (
                <span className={cn("truncate", isMobileDrawer ? "text-[14px] font-medium" : undefined)}>
                  {link.label}
                </span>
              ) : null}
              {showNotificationsBadge ? (
                collapsed ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                ) : (
                  <span
                    className={cn(
                      "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground",
                      isMobileDrawer ? "h-6 px-1.5" : "h-5"
                    )}
                  >
                    {notificationsUnreadCount > 99 ? "99+" : notificationsUnreadCount}
                  </span>
                )
              ) : null}
            </Link>
          );

          return (
            <SidebarIconTooltip key={link.to} label={link.label} collapsed={collapsed}>
              {navLink}
            </SidebarIconTooltip>
          );
        })}
      </div>
    </div>
  );
}
