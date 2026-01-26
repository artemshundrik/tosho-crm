// src/layout/AppLayout.tsx
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Calculator,
  ChevronRight,
  Factory,
  FileCheck,
  FileMinus,
  FolderKanban,
  Menu,
  Moon,
  Palette,
  ReceiptText,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Truck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/app/UserMenu";
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsValue,
} from "@/components/app/page-header-actions";
import { AvatarBase } from "@/components/app/avatar-kit";
import { preloadRoute } from "@/routes/routePreload";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { supabase } from "@/lib/supabaseClient";
import { getAgencyLogo } from "@/lib/agencyAssets";
import { useAuth } from "@/auth/AuthProvider";
import { mapNotificationRow, type NotificationItem, type NotificationRow } from "@/lib/notifications";

import { CommandPalette } from "@/components/app/CommandPalette";

import { AppDropdown } from "@/components/app/AppDropdown";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageReveal } from "@/components/app/PageReveal";
import { TabBar } from "@/components/app/TabBar";

// --- Types ---
type AppLayoutProps = {
  children: ReactNode;
};

type SidebarGroupKey = "orders" | "finance" | "operations" | "account";

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
  // Замовлення
  { label: "Прорахунки замовлень", to: ROUTES.ordersEstimates, group: "orders", icon: Calculator },
  { label: "У виробництві", to: ROUTES.ordersProduction, group: "orders", icon: Factory },
  { label: "Готові до відвантаження", to: ROUTES.ordersReadyToShip, group: "orders", icon: Truck },

  // Фінанси
  { label: "Рахунки", to: ROUTES.financeInvoices, group: "finance", icon: ReceiptText },
  { label: "Видаткові накладні", to: ROUTES.financeExpenseInvoices, group: "finance", icon: FileMinus },
  { label: "Акти виконаних робіт", to: ROUTES.financeActs, group: "finance", icon: FileCheck },

  // Операції
  { label: "Каталог продукції", to: ROUTES.catalogProducts, group: "operations", icon: FolderKanban },
  { label: "Логістика", to: ROUTES.logistics, group: "operations", icon: Truck },
  { label: "Дизайн", to: ROUTES.design, group: "operations", icon: Palette },
  { label: "Підрядники", to: ROUTES.contractors, group: "operations", icon: Users },

  // Акаунт
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
    };
  if (pathname.startsWith(ROUTES.ordersEstimates))
    return {
      title: "Прорахунки замовлень",
      subtitle: "Підготовка розрахунків і комерційних пропозицій.",
      breadcrumbLabel: "Прорахунки замовлень",
      breadcrumbTo: ROUTES.ordersEstimates,
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
    };
  if (pathname.startsWith(ROUTES.financeInvoices))
    return {
      title: "Рахунки",
      subtitle: "Рахунки для клієнтів і статуси оплат.",
      breadcrumbLabel: "Рахунки",
      breadcrumbTo: ROUTES.financeInvoices,
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
    };
  if (pathname.startsWith(ROUTES.contractors))
    return {
      title: "Підрядники",
      subtitle: "База партнерів, договори та взаємодія.",
      breadcrumbLabel: "Підрядники",
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
  const { userId, teamId } = useAuth();
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

  // Стан для динамічного логотипу команди
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null>(null);

useEffect(() => {
  async function fetchLogo() {
    try {
      // 1. Отримуємо ID команди (з таблиці team_members)
      const { data: teamId } = await supabase.rpc('current_team_id');
      if (!teamId) return;

      // 2. Отримуємо логотип через зв'язок: Team -> Club
      const { data, error } = await supabase
        .from('teams')
        .select(`
          club:clubs (
            logo_url
          )
        `)
        .eq('id', teamId)
        .maybeSingle();

      if (error) throw error;

      // Дістаємо вкладений logo_url
      const logoUrl = (data as any)?.club?.logo_url;
      if (logoUrl) {
        setWorkspaceLogo(logoUrl);
      }
    } catch (err) {
      console.error("Помилка завантаження лого через зв'язок:", err);
    }
  }
  fetchLogo();
}, []);

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
        : "—:—";

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

  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);
  const agencyLogo = useMemo(() => getAgencyLogo(theme), [theme]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);


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
          toast(item.title, { description: item.description || undefined });
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
    <div className="min-h-screen min-h-[100dvh] bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex fixed inset-y-0 z-30 w-[270px] flex-col border-r border-border bg-card/60 backdrop-blur-xl">
        <div className="px-4 pt-5">
          <AppDropdown
            align="start"
            contentClassName="w-[250px]"
            triggerClassName="flex w-full"
            trigger={
                <Button
                  type="button"
                  variant="menu"
                  size="md"
                  className={cn(
                  "w-full h-auto rounded-[var(--radius-lg)] px-2 py-2.5 text-left hover:bg-transparent active:bg-transparent"
                  )}
                >
                <div className="flex items-center">
                  <img src={agencyLogo || workspaceLogo || ""} alt="ToSho CRM" className="h-7 w-auto" />
                </div>
              </Button>
            }
            items={[
              { type: "label", label: "Workspace" },
              { type: "separator" },
              {
                label: (
                  <>
                    <FolderKanban className="mr-2 h-4 w-4" />
                    FAYNA TEAM
                  </>
                ),
                onSelect: () => navigate(ROUTES.overview),
              },
              { type: "separator" },
              {
                label: (
                  <>
                    <Settings className="mr-2 h-4 w-4" />
                    Налаштування workspace
                  </>
                ),
                onSelect: () => navigate(ROUTES.workspaceSettings),
              },
            ]}
          />
        </div>

        {/* Search (Cmd+K) */}
        <div className="px-4 pt-3">
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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          <SidebarGroup
            label="Замовлення"
            links={sidebarLinks.filter((l) => l.group === "orders")}
            currentPath={location.pathname}
          />
          <SidebarGroup
            label="Фінанси"
            links={sidebarLinks.filter((l) => l.group === "finance")}
            currentPath={location.pathname}
          />
          <SidebarGroup
            label="Операції"
            links={sidebarLinks.filter((l) => l.group === "operations")}
            currentPath={location.pathname}
          />
          <SidebarGroup
            label="Акаунт"
            links={sidebarLinks.filter((l) => l.group === "account")}
            currentPath={location.pathname}
          />
        </nav>

        {/* Footer / Profile */}
<div className="border-t border-border p-4">
  <UserMenu />
</div>
      </aside>

      {/* MAIN */}
      <div className="md:pl-[270px]">
        {/* HEADER */}
        <header
          key={theme}
          className="sticky top-0 z-20 border-b border-border bg-background/75 backdrop-blur-xl"
        >
          <div className="flex h-16 items-center justify-between px-3 md:px-6">
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
                        label="Замовлення"
                        links={sidebarLinks.filter((l) => l.group === "orders")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                      <SidebarGroup
                        label="Фінанси"
                        links={sidebarLinks.filter((l) => l.group === "finance")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                      <SidebarGroup
                        label="Операції"
                        links={sidebarLinks.filter((l) => l.group === "operations")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                      <SidebarGroup
                        label="Акаунт"
                        links={sidebarLinks.filter((l) => l.group === "account")}
                        currentPath={location.pathname}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                      <div className="mt-6 pt-2 border-t border-border">
                        <UserMenu mobile onNavigate={() => setMobileMenuOpen(false)} />
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Breadcrumb */}
              <div className="hidden md:flex items-center text-xs font-medium text-muted-foreground">
                <Link
                  to={ROUTES.overview}
                  className="rounded-[var(--radius-md)] px-1.5 py-1 hover:bg-muted/60 hover:text-foreground transition-colors"
                >
                  ToSho CRM
                </Link>
                <ChevronRight className="h-3.5 w-3.5 mx-1.5 text-muted-foreground/80" />
                <Link
                  to={header.breadcrumbTo}
                  className="rounded-[var(--radius-md)] bg-muted/50 px-2 py-1 text-foreground hover:bg-muted transition-colors"
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
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {unreadCount}
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
        <main className="w-full overflow-x-hidden px-4 py-6 pb-[calc(var(--tabbar-height)+var(--tabbar-inset-bottom)+16px)] md:px-6 md:pb-6 lg:px-8 xl:px-8">
          <div className="mx-auto max-w-[1320px] space-y-8 min-w-0">
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

      <TabBar hidden={mobileMenuOpen} />
      <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
    </div>
  );
}

function SidebarGroup({
  label,
  links,
  currentPath,
  onNavigate,
}: {
  label: string;
  links: SidebarLink[];
  currentPath: string;
  onNavigate?: () => void;
}) {
  if (links.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </h4>

      <div className="space-y-1">
        {links.map((link) => {
          const active = isActivePath(currentPath, link.to);
          const Icon = link.icon;

          return (
            <Link
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              onMouseEnter={() => preloadRoute(link.to)}
              onFocus={() => preloadRoute(link.to)}
              onTouchStart={() => preloadRoute(link.to)}
              className={cn(
                "relative group flex items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2 text-[13px] font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "absolute left-1 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full transition-opacity",
                  active ? "bg-primary opacity-100" : "bg-primary opacity-0 group-hover:opacity-40"
                )}
              />

              <Icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />

              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
