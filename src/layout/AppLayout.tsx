// src/layout/AppLayout.tsx
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  Calculator,
  ChevronRight,
  Factory,
  FileCheck,
  FileMinus,
  FolderKanban,
  LayoutGrid,
  Menu,
  Moon,
  Palette,
  ReceiptText,
  Search,
  ShieldAlert,
  Sun,
  Truck,
  Users,
  CircleDot,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/app/UserMenu";
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsValue,
} from "@/components/app/page-header-actions";
import { preloadRoute } from "@/routes/routePreload";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { supabase } from "@/lib/supabaseClient";
import { getAgencyLogo } from "@/lib/agencyAssets";
import { notifyUsers } from "@/lib/designTaskActivity";
import { useAuth } from "@/auth/AuthProvider";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";
import { useWorkspacePresenceState } from "@/hooks/useWorkspacePresenceState";
import { WorkspacePresenceProvider } from "@/components/app/workspace-presence-context";
import { OnlineNowDropdown } from "@/components/app/workspace-presence-widgets";
import { buildUserNameFromMetadata } from "@/lib/userName";

import { CommandPalette } from "@/components/app/CommandPalette";
import { SidebarIconTooltip } from "@/components/app/SidebarIconTooltip";

import { AppDropdown } from "@/components/app/AppDropdown";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageReveal } from "@/components/app/PageReveal";
import { TabBar } from "@/components/app/TabBar";

// --- Types ---
type AppLayoutProps = {
  children: ReactNode;
};

type SidebarGroupKey = "overview" | "orders" | "finance" | "operations" | "account";

type SidebarLink = {
  label: string;
  to: string;
  group: SidebarGroupKey;
  icon: React.ElementType;
};

type HeaderConfig = {
  title: string;
  subtitle: string;
  breadcrumbLabel: string;
  breadcrumbTo: string;
  eyebrow?: string;
  showPageHeader?: boolean;
};

type MatchMeta = {
  opponent_name: string;
  match_date: string;
  score_team: number | null;
  score_opponent: number | null;
};

// --- Routes ---
const ROUTES = {
  overview: "/overview",

  matches: "/matches-shadcn",
  trainings: "/admin/trainings",
  players: "/admin/players",
  tournaments: "/admin/tournaments",
  finance: "/finance",
  activity: "/activity",

  analyticsPlayers: "/analytics/players",
  analyticsTeam: "/analytics/team",
  trainingsAnalytics: "/admin/trainings/analytics",

  ordersEstimates: "/orders/estimates",
  ordersCustomers: "/orders/customers",
  ordersProduction: "/orders/production",
  ordersReadyToShip: "/orders/ready-to-ship",
  catalogProducts: "/catalog/products",

  financeInvoices: "/finance/invoices",
  financeExpenseInvoices: "/finance/expense-invoices",
  financeActs: "/finance/acts",

  logistics: "/logistics",
  design: "/design",
  contractors: "/contractors",

  workspaceSettings: "/workspace-settings",
  membersAccess: "/settings/members",
  notifications: "/notifications",
  accountSettings: "/account-settings",
  profile: "/profile",
} as const;

// --- Sidebar Config ---
const baseSidebarLinks: SidebarLink[] = [
  // Головне
  { label: "Огляд", to: ROUTES.overview, group: "overview", icon: LayoutGrid },

  // Замовлення
  { label: "Замовники", to: ROUTES.ordersCustomers, group: "orders", icon: Building2 },
  { label: "Прорахунки замовлень", to: ROUTES.ordersEstimates, group: "orders", icon: Calculator },
  { label: "Замовлення", to: ROUTES.ordersProduction, group: "orders", icon: Factory },
  { label: "Готові до відвантаження", to: ROUTES.ordersReadyToShip, group: "orders", icon: Truck },

  // Фінанси
  { label: "Рахунки", to: ROUTES.financeInvoices, group: "finance", icon: ReceiptText },
  { label: "Видаткові накладні", to: ROUTES.financeExpenseInvoices, group: "finance", icon: FileMinus },
  { label: "Акти виконаних робіт", to: ROUTES.financeActs, group: "finance", icon: FileCheck },

  // Операції
  { label: "Каталог продукції", to: ROUTES.catalogProducts, group: "operations", icon: FolderKanban },
  { label: "Логістика", to: ROUTES.logistics, group: "operations", icon: Truck },
  { label: "Дизайн", to: ROUTES.design, group: "operations", icon: Palette },
  {
    label: "Підрядники та Постачальники",
    to: ROUTES.contractors,
    group: "operations",
    icon: Users,
  },

  // Акаунт
  { label: "Сповіщення", to: ROUTES.notifications, group: "account", icon: Bell },
  { label: "Доступ / Ролі", to: ROUTES.membersAccess, group: "account", icon: ShieldAlert },
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
      title: "У виробництві",
      subtitle: "Активні замовлення, що зараз виконуються.",
      breadcrumbLabel: "У виробництві",
      breadcrumbTo: ROUTES.ordersProduction,
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
  if (pathname.startsWith(ROUTES.financeInvoices))
    return {
      title: "Рахунки",
      subtitle: "Рахунки для клієнтів і статуси оплат.",
      breadcrumbLabel: "Рахунки",
      breadcrumbTo: ROUTES.financeInvoices,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.financeExpenseInvoices))
    return {
      title: "Видаткові накладні",
      subtitle: "Документи відвантаження та облік витрат.",
      breadcrumbLabel: "Видаткові накладні",
      breadcrumbTo: ROUTES.financeExpenseInvoices,
    };
  if (pathname.startsWith(ROUTES.financeActs))
    return {
      title: "Акти виконаних робіт",
      subtitle: "Акти для закриття робіт і звітності.",
      breadcrumbLabel: "Акти виконаних робіт",
      breadcrumbTo: ROUTES.financeActs,
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
      title: "Підрядники та Постачальники",
      subtitle: "База партнерів, постачальників, договорів та взаємодії.",
      breadcrumbLabel: "Підрядники та Постачальники",
      breadcrumbTo: ROUTES.contractors,
    };

  if (pathname === ROUTES.analyticsTeam)
    return {
      title: "Аналітика команди",
      subtitle: "Тренди, форма та інсайти (висновки, не таблиці).",
      breadcrumbLabel: "Аналітика команди",
      breadcrumbTo: ROUTES.analyticsTeam,
    };

  if (pathname.includes("trainings/analytics"))
    return {
      title: "Аналітика тренувань",
      subtitle: "Відстежуй відвідуваність, лідерів присутності та тренувальні тренди.",
      breadcrumbLabel: "Аналітика тренувань",
      breadcrumbTo: ROUTES.trainingsAnalytics,
    };

  if (pathname.includes("analytics"))
    return {
      title: "Статистика гравців",
      subtitle: "Голи, асисти та інші метрики по гравцях з фільтрами.",
      breadcrumbLabel: "Статистика гравців",
      breadcrumbTo: ROUTES.analyticsPlayers,
    };

  if (pathname.includes("players"))
    return {
      title: "Гравці",
      subtitle: "Склад команди та профілі гравців.",
      breadcrumbLabel: "Гравці",
      breadcrumbTo: ROUTES.players,
    };

  if (pathname.startsWith("/player/"))
    return {
      title: "Профіль гравця",
      subtitle: "Статистика, матчі та участь у тренуваннях.",
      breadcrumbLabel: "Гравці",
      breadcrumbTo: ROUTES.players,
    };

  if (pathname.includes("matches-shadcn"))
    return {
      title: "Матчі",
      subtitle: "Розклад, результати та події матчу.",
      breadcrumbLabel: "Матчі",
      breadcrumbTo: ROUTES.matches,
    };

  if (pathname.includes("trainings"))
    return {
      title: "Тренування",
      subtitle: "Планування, відвідуваність та нотатки.",
      breadcrumbLabel: "Тренування",
      breadcrumbTo: ROUTES.trainings,
    };

  if (pathname.includes("tournaments"))
    return {
      title: "Турніри",
      subtitle: "Сезони, формати, матчі та таблиці.",
      breadcrumbLabel: "Турніри",
      breadcrumbTo: ROUTES.tournaments,
    };

  if (pathname.startsWith("/finance/transactions/new"))
    return {
      title: "Новий платіж",
      subtitle: "Додай дохід або витрату та привʼяжи до гравця за потреби.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finance,
    };

  if (pathname.startsWith("/finance/invoices/new"))
    return {
      title: "Новий рахунок",
      subtitle: "Створи рахунок для гравця або команди.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finance,
    };

  if (pathname.startsWith("/finance/pools/new"))
    return {
      title: "Новий збір",
      subtitle: "Збір на оренду або внески з контролем оплати.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finance,
    };

  if (pathname.startsWith("/finance/pools/"))
    return {
      title: "Збір",
      subtitle: "Прогрес збору та список оплат.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finance,
    };

  if (pathname.includes("finance"))
    return {
      title: "Фінанси",
      subtitle: "Оплати, плани, нарахування та фінансова аналітика.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finance,
    };
  if (pathname.startsWith(ROUTES.notifications))
    return {
      title: "Сповіщення",
      subtitle: "Всі події та оновлення в одному місці.",
      breadcrumbLabel: "Сповіщення",
      breadcrumbTo: ROUTES.notifications,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.activity))
    return {
      title: "Активність",
      subtitle: "Останні дії команди та зміни в системі.",
      breadcrumbLabel: "Активність",
      breadcrumbTo: ROUTES.activity,
    };
  if (pathname.startsWith(ROUTES.membersAccess))
    return {
      title: "Доступ / Ролі",
      subtitle: "Керування учасниками та запрошеннями команди.",
      breadcrumbLabel: "Доступ / Ролі",
      breadcrumbTo: ROUTES.membersAccess,
      showPageHeader: false,
    };
if (pathname === ROUTES.profile)
    return {
      title: "Мій профіль",
      subtitle: "Керуй своїм обліковим записом та налаштуваннями.",
      breadcrumbLabel: "Профіль",
      breadcrumbTo: ROUTES.profile,
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
  if (to === ROUTES.trainings) {
    return (
      currentPath === to ||
      (currentPath.startsWith(to + "/") && !currentPath.startsWith(ROUTES.trainingsAnalytics))
    );
  }
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
      <AppLayoutInner>{children}</AppLayoutInner>
    </PageHeaderActionsProvider>
  );
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId, teamId, session } = useAuth();
  const baseHeader = useMemo(() => getHeaderConfig(location.pathname), [location.pathname]);
  const headerActions = usePageHeaderActionsValue();
  const sidebarRoutes = useMemo(() => sidebarLinks.map((link) => link.to), []);
  const shouldReveal = useMemo(() => {
    return sidebarRoutes.some((route) => {
      if (location.pathname === route) return true;
      return location.pathname.startsWith(`${route}/`);
    });
  }, [location.pathname, sidebarRoutes]);
  const pageContent = shouldReveal ? (
    <PageReveal key={location.pathname} activeKey={location.pathname}>
      {children}
    </PageReveal>
  ) : (
    children
  );
  const isCanvasMode = location.pathname === ROUTES.ordersEstimates;

  // /matches/:matchId/events
  const matchEventsRoute = useMemo(() => {
    return matchPath({ path: "/matches/:matchId/events", end: true }, location.pathname);
  }, [location.pathname]);

  const matchDetailsRoute = useMemo(() => {
    return matchPath({ path: "/matches/:matchId", end: true }, location.pathname);
  }, [location.pathname]);

  const matchId =
    ((matchEventsRoute?.params as { matchId?: string } | undefined)?.matchId) ||
    ((matchDetailsRoute?.params as { matchId?: string } | undefined)?.matchId);

  const [matchMeta, setMatchMeta] = useState<MatchMeta | null>(null);

  // Optional workspace logo (kept null by default to avoid heavy legacy team queries)
  const [workspaceLogo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMatchMeta() {
      if (!matchId) {
        setMatchMeta(null);
        return;
      }

      const { data, error } = await supabase
        .from("matches")
        .select("opponent_name, match_date, score_team, score_opponent")
        .eq("id", matchId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setMatchMeta(null);
        return;
      }

      setMatchMeta(data as MatchMeta);
    }

    loadMatchMeta();

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const header = useMemo(() => {
    if (!matchId) return baseHeader;

    const score =
      matchMeta && matchMeta.score_team !== null && matchMeta.score_opponent !== null
        ? `${matchMeta.score_team}:${matchMeta.score_opponent}`
        : "Н/Д:Н/Д";

    const metaSubtitle = matchMeta
      ? `${matchMeta.opponent_name} • ${formatDateTimeUA(matchMeta.match_date)} • ${score}`
      : "Деталі матчу, склад, події та статистика.";

    if (matchEventsRoute) {
      return {
        title: "Події матчу",
        subtitle: matchMeta
          ? `${matchMeta.opponent_name} • ${formatDateTimeUA(matchMeta.match_date)} • ${score}`
          : "Голи, асисти, картки та відвідуваність матчу.",
        breadcrumbLabel: "Матчі",
        breadcrumbTo: ROUTES.matches,
      };
    }

    return {
      title: "Деталі матчу",
      subtitle: metaSubtitle,
      breadcrumbLabel: "Матчі",
      breadcrumbTo: ROUTES.matches,
    };
  }, [baseHeader, matchId, matchMeta, matchEventsRoute]);

  const workspacePresence = useWorkspacePresenceState({
    teamId,
    userId,
    session,
    pathname: location.pathname,
    currentLabel: header.title,
  });

  const [cmdkOpen, setCmdkOpen] = useState(false);
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
  const [, setActivityUnreadCount] = useState(0);
  const [usdUahRate, setUsdUahRate] = useState<number | null>(null);
  const [eurUahRate, setEurUahRate] = useState<number | null>(null);
  const [usdUahUpdatedAt, setUsdUahUpdatedAt] = useState<string | null>(null);
  const [usdUahLoading, setUsdUahLoading] = useState(false);
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

  const loadUsdUahRate = React.useCallback(async (signal?: AbortSignal) => {
    setUsdUahLoading(true);
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { rates?: Record<string, number | undefined> };
      const usdToUah = payload?.rates?.UAH;
      const usdToEur = payload?.rates?.EUR;
      if (
        typeof usdToUah !== "number" ||
        !Number.isFinite(usdToUah) ||
        usdToUah <= 0 ||
        typeof usdToEur !== "number" ||
        !Number.isFinite(usdToEur) ||
        usdToEur <= 0
      ) {
        throw new Error("Invalid USD/UAH rate payload");
      }
      const nextUsdUahRate = usdToUah;
      const nextEurUahRate = usdToUah / usdToEur;
      const nowIso = new Date().toISOString();
      setUsdUahRate(nextUsdUahRate);
      setEurUahRate(nextEurUahRate);
      setUsdUahUpdatedAt(nowIso);
      try {
        localStorage.setItem(
          "tosho_fx_rates",
          JSON.stringify({ usdUah: nextUsdUahRate, eurUah: nextEurUahRate, updatedAt: nowIso })
        );
      } catch {
        // Ignore storage failures (private mode, quota etc).
      }
    } catch {
      // Keep previous value if fetch failed.
    } finally {
      setUsdUahLoading(false);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tosho_fx_rates");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { usdUah?: unknown; eurUah?: unknown; updatedAt?: unknown };
      if (typeof parsed.usdUah === "number" && Number.isFinite(parsed.usdUah) && parsed.usdUah > 0) {
        setUsdUahRate(parsed.usdUah);
      }
      if (typeof parsed.eurUah === "number" && Number.isFinite(parsed.eurUah) && parsed.eurUah > 0) {
        setEurUahRate(parsed.eurUah);
      }
      if (typeof parsed.updatedAt === "string" && parsed.updatedAt) {
        setUsdUahUpdatedAt(parsed.updatedAt);
      }
    } catch {
      // Ignore invalid local cache.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsdUahRate(controller.signal);
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

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

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
            .select("id,name,manager,reminder_at,reminder_comment")
            .eq("team_id", teamId)
            .not("reminder_at", "is", null)
            .lte("reminder_at", nowIso)
            .gte("reminder_at", fromIso)
            .order("reminder_at", { ascending: false })
            .limit(100),
          supabase
            .schema("tosho")
            .from("leads")
            .select("id,company_name,manager,reminder_at,reminder_comment")
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
            .like("href", "/orders/customers?reminder=%")
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
          const href = `/orders/customers?reminder=${encodeURIComponent(key)}`;
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
          reminder_at?: string | null;
          reminder_comment?: string | null;
        }>) {
          if (!row.reminder_at) continue;
          const manager = normalizeIdentity(row.manager);
          if (manager && !reminderAssigneeKeys.has(manager)) continue;
          pushReminder("customer", row.id, row.name?.trim() || "Замовник", row.reminder_at, row.reminder_comment ?? "");
        }

        for (const row of (leadsResult.data ?? []) as Array<{
          id: string;
          company_name?: string | null;
          manager?: string | null;
          reminder_at?: string | null;
          reminder_comment?: string | null;
        }>) {
          if (!row.reminder_at) continue;
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
      void run();
    }, 60 * 1000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [reminderAssigneeKeys, teamId, userId]);

  useEffect(() => {
    loadActivityUnread();
  }, [loadActivityUnread]);

  useEffect(() => {
    const handler = () => {
      loadActivityUnread();
    };
    window.addEventListener("activity_read", handler);
    return () => {
      window.removeEventListener("activity_read", handler);
    };
  }, [loadActivityUnread]);

  useEffect(() => {
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
          const toastTitle = item.title?.trim() || "Нове сповіщення";
          const toastDescription = item.description?.trim() || undefined;
          toast(toastTitle, { description: toastDescription });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, location.pathname]);

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

  const openNotification = async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
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
          "hidden md:flex fixed inset-y-0 z-30 flex-col bg-[hsl(var(--sidebar-surface-bg))] border-r border-border",
          "transition-[width,background-color,border-color] duration-[220ms] ease-linear",
          sidebarCollapsed ? "w-[84px]" : "w-[270px]"
        )}
      >
        <div className={cn("h-14", sidebarCollapsed ? "px-3" : "px-4")}>
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
            "flex-1 overflow-visible transition-[padding] duration-[220ms] ease-linear",
            sidebarCollapsed ? "px-2 py-3" : "px-4 py-5"
          )}
        >
          <div
            className={cn(
              sidebarCollapsed
                ? "[&>div+div]:relative [&>div+div]:before:absolute [&>div+div]:before:left-1/2 [&>div+div]:before:top-0 [&>div+div]:before:h-px [&>div+div]:before:w-6 [&>div+div]:before:-translate-x-1/2 [&>div+div]:before:bg-border/70"
                : "space-y-6"
            )}
          >
            <div className={cn("relative", sidebarCollapsed ? "py-2.5 first:pt-0" : "")}>
              <SidebarGroup
                label="Головне"
                links={sidebarLinks.filter((l) => l.group === "overview")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Замовлення"
                links={sidebarLinks.filter((l) => l.group === "orders")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Фінанси"
                links={sidebarLinks.filter((l) => l.group === "finance")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Операції"
                links={sidebarLinks.filter((l) => l.group === "operations")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5 pb-0" : "")}>
              <SidebarGroup
                label="Акаунт"
                links={sidebarLinks.filter((l) => l.group === "account")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
              />
            </div>
          </div>
        </nav>

        {/* Footer / Profile */}
<div className={cn(sidebarCollapsed ? "p-2" : "p-4")}>
  <UserMenu compact={sidebarCollapsed} />
</div>
      </aside>

      {/* MAIN */}
      <div
        className={cn(
          "transition-[padding] duration-[220ms] ease-linear",
          sidebarCollapsed ? "md:pl-[84px]" : "md:pl-[270px]"
        )}
      >
        <div>
        {/* HEADER */}
        <header
          key={theme}
          className={cn(
            "fixed top-0 right-0 z-20 border-b border-border transition-[background-color,backdrop-filter,border-color] duration-200",
            "bg-[hsl(var(--page-underlay-bg)/0.78)] supports-[backdrop-filter]:backdrop-blur-md",
            sidebarCollapsed ? "md:left-[84px]" : "md:left-[270px]",
            "left-0"
          )}
        >
          <div className="flex h-14 items-center justify-between px-4 md:px-5 lg:px-6">
            <div className="flex items-center gap-3">
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
                    className="h-full w-full max-w-none overflow-y-auto p-0 pb-[env(safe-area-inset-bottom)] sm:w-[310px] sm:max-w-[310px] min-h-[100dvh] will-change-transform data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:ease-out data-[state=closed]:ease-in"
                  >
                    <SheetHeader className="p-4 pb-2">
                    <SheetTitle>ToSho CRM</SheetTitle>
                    </SheetHeader>

                    <div className="px-4 pb-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          readOnly
                          value=""
                          placeholder="Пошук…"
                          className={cn(
                            "h-10 rounded-[var(--radius-lg)] pl-10 pr-16 bg-background/60",
                            "border border-input",
                            "cursor-pointer",
                            "focus-visible:ring-2 focus-visible:ring-primary/30"
                          )}
                          onClick={() => setCmdkOpen(true)}
                        />
                        <div className="absolute right-2 inset-y-0 flex items-center">
                          <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-[6px] border border-border bg-muted/70 px-2.5 font-mono text-[10px] font-medium text-muted-foreground">
                            <span className="text-[11px]">⌘</span>K
                          </kbd>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border px-4 py-4 pb-8">
                      <SidebarGroup
                        label="Головне"
                        links={sidebarLinks.filter((l) => l.group === "overview")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                        notificationsUnreadCount={unreadCount}
                      />
                      <SidebarGroup
                        label="Замовлення"
                        links={sidebarLinks.filter((l) => l.group === "orders")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                        notificationsUnreadCount={unreadCount}
                      />
                      <SidebarGroup
                        label="Фінанси"
                        links={sidebarLinks.filter((l) => l.group === "finance")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                        notificationsUnreadCount={unreadCount}
                      />
                      <SidebarGroup
                        label="Операції"
                        links={sidebarLinks.filter((l) => l.group === "operations")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                        notificationsUnreadCount={unreadCount}
                      />
                      <SidebarGroup
                        label="Акаунт"
                        links={sidebarLinks.filter((l) => l.group === "account")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                        notificationsUnreadCount={unreadCount}
                      />
                      <div className="mt-6 pt-2 border-t border-border">
                        <UserMenu mobile onNavigate={() => setMobileMenuOpen(false)} />
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Breadcrumb */}
              <div className="hidden md:flex h-7 items-center gap-1.5 text-[12px] leading-none font-medium text-muted-foreground">
                <Link
                  to={ROUTES.overview}
                  className="inline-flex h-7 items-center rounded-[var(--radius-md)] px-1.5 leading-none hover:bg-muted/60 hover:text-foreground transition-colors"
                >
                  ToSho CRM
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/80" />
                <Link
                  to={header.breadcrumbTo}
                  className="inline-flex h-7 items-center rounded-[var(--radius-md)] bg-muted/50 px-2 leading-none text-foreground hover:bg-muted transition-colors"
                >
                  {header.breadcrumbLabel}
                </Link>
              </div>

              {/* Mobile title */}
              <div className="md:hidden">
                <div className="text-sm font-semibold leading-none">{header.title}</div>
                <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{header.subtitle}</div>
              </div>
            </div>

            {/* RIGHT ACTIONS */}
            <div className="flex items-center gap-2.5">
              <AppDropdown
                align="end"
                sideOffset={10}
                contentClassName="w-[280px]"
                open={usdRateOpen}
                onOpenChange={setUsdRateOpen}
                trigger={
                  <button
                    type="button"
                    className="hidden lg:inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-card/50 px-2.5 text-xs transition-colors hover:bg-card/80"
                    aria-label="Курси валют"
                    title="USD/UAH · EUR/UAH"
                  >
                    <span className="font-medium tabular-nums text-foreground/90">
                      USD {usdUahRate ? usdUahRate.toFixed(2) : "Не вказано"}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-medium tabular-nums text-foreground/90">
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
                      {usdUahUpdatedAt
                        ? `Оновлено ${new Date(usdUahUpdatedAt).toLocaleString("uk-UA", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : "Ще не оновлено"}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-2">
                        <div className="text-[11px] text-muted-foreground">USD/UAH</div>
                        <div className="text-base font-semibold tabular-nums text-foreground">
                          {usdUahRate ? usdUahRate.toFixed(2) : "Не вказано"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-2">
                        <div className="text-[11px] text-muted-foreground">EUR/UAH</div>
                        <div className="text-base font-semibold tabular-nums text-foreground">
                          {eurUahRate ? eurUahRate.toFixed(2) : "Не вказано"}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => void loadUsdUahRate()}
                      disabled={usdUahLoading}
                    >
                      Оновити
                    </Button>
                  </div>
                }
              />

              <OnlineNowDropdown entries={workspacePresence.onlineEntries} loading={workspacePresence.loading} />

              {/* Theme toggle */}
              <Button
                variant="control"
                size="iconMd"
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
                    className="relative"
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
                    <div className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-foreground">Сповіщення</div>
                        {unreadCount > 0 ? (
                          <Button
                            type="button"
                            variant="textMuted"
                            size="xs"
                            onClick={markAllRead}
                            className="h-auto p-0"
                          >
                            Позначити всі
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {unreadCount > 0 ? `Непрочитані: ${unreadCount}` : "Все прочитано"}
                      </div>
                    </div>
                    <div className="h-px bg-border/70" />
                    <div className="max-h-[320px] overflow-auto">
                      {notificationsLoading ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">Завантаження...</div>
                      ) : unreadNotifications.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">Немає непрочитаних.</div>
                      ) : (
                        unreadNotifications.map((n) => (
                          <Button
                            key={n.id}
                            type="button"
                            variant="menu"
                            size="sm"
                            className="h-auto w-full justify-start items-start gap-3 px-3 py-2.5 text-left"
                            onClick={() => {
                              openNotification(n);
                              setNotificationsOpen(false);
                            }}
                          >
                            <span
                              className={cn(
                                "mt-1 h-2 w-2 rounded-full",
                                !n.read && n.tone === "success" && "bg-emerald-500",
                                !n.read && n.tone === "warning" && "bg-amber-500",
                                !n.read && n.tone === "info" && "bg-sky-500",
                                !n.read && !n.tone && "bg-muted-foreground",
                                n.read && "bg-muted-foreground/40"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-foreground truncate">{n.title}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">{n.description}</div>
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
                      className="h-auto w-full justify-start px-3 py-2.5 text-left"
                      onClick={() => {
                        navigate("/notifications");
                        setNotificationsOpen(false);
                      }}
                    >
                      Всі сповіщення
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
            {/* Page header (desktop) */}
            {header.showPageHeader === false ? (
              header.eyebrow ? (
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
      <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
      </div>
    </WorkspacePresenceProvider>
  );
}

function SidebarGroup({
  label,
  links,
  currentPath,
  onNavigate,
  notificationsUnreadCount = 0,
  collapsed = false,
}: {
  label: string;
  links: SidebarLink[];
  currentPath: string;
  onNavigate?: () => void;
  notificationsUnreadCount?: number;
  collapsed?: boolean;
}) {
  if (links.length === 0) return null;

  return (
    <div className="space-y-2">
      {!collapsed ? (
        <h4 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</h4>
      ) : null}

      <div className="space-y-1">
        {links.map((link) => {
          const active = isActivePath(currentPath, link.to);
          const Icon = link.icon;
          const showNotificationsBadge = link.to === ROUTES.notifications && notificationsUnreadCount > 0;

          const navLink = (
            <Link
              to={link.to}
              onClick={onNavigate}
              onMouseEnter={() => preloadRoute(link.to)}
              onFocus={() => preloadRoute(link.to)}
              onTouchStart={() => preloadRoute(link.to)}
              className={cn(
                "relative group flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2 text-[13px] font-normal",
                "transition-colors duration-150 ease-linear",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                collapsed && "mx-auto w-10 justify-center gap-0 rounded-[12px] px-0 py-0",
                active
                  ? collapsed
                    ? "bg-primary/15 text-foreground"
                    : "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "absolute left-1 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-opacity",
                  collapsed
                    ? "hidden"
                    : active
                    ? "bg-primary opacity-100"
                    : "bg-primary opacity-0 group-hover:opacity-40"
                )}
              />

              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />

              {!collapsed ? <span className="truncate">{link.label}</span> : null}
              {showNotificationsBadge ? (
                collapsed ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                ) : (
                  <span className="ml-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground">
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
