// src/layout/AppLayout.tsx
import React, { ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Banknote,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ChevronDown,
  Loader2,
  Factory,
  FolderKanban,
  Activity,
  GitCommitVertical,
  GitPullRequestArrow,
  KeyRound,
  LayoutGrid,
  Plug,
  Megaphone,
  Menu,
  Moon,
  Palette,
  X as CloseIcon,
  Search,
  ShieldAlert,
  Sun,
  Truck,
  Users,
  X,
  BadgeCheck,
  CircleDot,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/app/UserMenu";
import { TelegramPromoModal } from "@/components/app/TelegramPromoModal";

/** Плаваюча кнопка AI-помічника: приховано візуально, функціонал лишається. */
const SHOW_AI_LAUNCHER = false;
import {
  PageHeaderActionsProvider,
  usePageHeaderActionsValue,
} from "@/components/app/page-header-actions";
import { preloadRoute } from "@/routes/routePreload";
import { SidebarFeaturePlate } from "@/features/features/SidebarFeaturePlate";
import { ProductUpdateModal } from "@/features/features/ProductUpdateModal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getModuleDefinition, hasModuleAccess, type ModuleKey } from "@/lib/moduleAccess";
import { DEV_LABELS, DEV_PATHS, DEV_ROOT, resolveDevSurface } from "@/lib/devSection";
import { readCollapsedGroups, writeCollapsedGroups } from "@/lib/sidebarGroupState";
import { WHATS_NEW_FEATURES } from "@/components/app/WhatsNewTabs";

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
import { FX_RATES_UPDATED_EVENT } from "@/lib/fxRates";

import { CommandPalette } from "@/components/app/CommandPalette";
import { SidebarIconTooltip } from "@/components/app/SidebarIconTooltip";
import { ToShoAiLauncherButton } from "@/components/app/ToShoAiLauncherButton";

import { DesignerEarningsWidget } from "@/components/design/DesignerEarningsWidget";
import { ViewAsBar } from "@/components/app/ViewAsBar";
import { AppDropdown } from "@/components/app/AppDropdown";
import { NotificationsMenu } from "@/components/app/NotificationsMenu";
import {
  DesignerFloatingTimerWidget,
  DesignerHeaderTimerWidget,
  useDesignerTimerController,
} from "@/components/app/DesignerTimerWidget";
import { resolveAiSuggestions } from "@/lib/aiSuggestions";
import { toast } from "sonner";
import { ToShoAiMark, ToShoAiWordmark } from "@/features/tosho-ai/ToShoAiWordmark";

// Консоль ToSho AI (110+ KB) — lazy: SheetContent демонтується в закритому
// стані (без forceMount), тож чанк їде лише при першому відкритті шторки.
// Раніше вона сиділа в головному чанку і вантажилась усім на кожній сторінці.
const ToShoAiConsole = lazy(() =>
  import("@/features/tosho-ai/ToShoAiConsole").then((m) => ({ default: m.ToShoAiConsole }))
);
import { buildToShoAiRouteContext, saveToShoAiLastContext } from "@/lib/toshoAi";

import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageReveal } from "@/components/app/PageReveal";
import { TabBar } from "@/components/app/TabBar";

type AppLayoutProps = {
  children?: ReactNode;
};

type SidebarGroupKey = "dev" | "overview" | "orders" | "operations" | "account";

type SidebarLink = {
  label: string;
  to: string;
  group: SidebarGroupKey;
  icon: React.ElementType;
  moduleKey?: ModuleKey;
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
const ACTIVE_REMINDER_POLL_INTERVAL_MS = 60 * 1000;
const ACTIVE_REMINDER_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

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
const FX_INTERBANK_UPDATE_GRACE_HOUR = 10;
const FX_INTERBANK_UPDATE_GRACE_MINUTE = 30;
const DESIGNER_TIMER_FLOATING_VISIBLE_KEY = "designer-timer-floating-visible";

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

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getPreviousBusinessDay(date: Date) {
  const previous = startOfLocalDay(date);
  do {
    previous.setDate(previous.getDate() - 1);
  } while (isWeekend(previous));
  return previous;
}

function getExpectedMinfinInterbankDate(now = new Date()) {
  const today = startOfLocalDay(now);
  if (isWeekend(today)) return getPreviousBusinessDay(today);

  const afterDailyUpdateGrace =
    now.getHours() > FX_INTERBANK_UPDATE_GRACE_HOUR ||
    (now.getHours() === FX_INTERBANK_UPDATE_GRACE_HOUR &&
      now.getMinutes() >= FX_INTERBANK_UPDATE_GRACE_MINUTE);

  return afterDailyUpdateGrace ? today : getPreviousBusinessDay(today);
}

function compareLocalDateOnly(a: Date, b: Date) {
  const aTime = startOfLocalDay(a).getTime();
  const bTime = startOfLocalDay(b).getTime();
  return aTime === bTime ? 0 : aTime > bTime ? 1 : -1;
}

function getFxStaleWarning(sourceLabel: string | null) {
  const parsed = parseFxSourceLabel(sourceLabel);
  if (!parsed) return null;
  if (Date.now() - parsed.getTime() <= FX_RATES_STALE_AFTER_MS) return null;
  if (compareLocalDateOnly(parsed, getExpectedMinfinInterbankDate()) >= 0) return null;
  return [
    `Мінфін показує останнє оновлення ${sourceLabel}.`,
    "Сторінка джерела могла ще не оновитися або змінити формат даних.",
  ].join(" ");
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
        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-3xs font-semibold leading-none",
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
    <div className="w-[min(420px,calc(100vw-32px))] rounded-4xl border border-border bg-card p-4 text-card-foreground ring-1 ring-[hsl(var(--soft-ring))] shadow-elevated-lg">
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

  const entityRoutes = [
    ROUTES.ordersEstimates,
    ROUTES.ordersCustomers,
    ROUTES.ordersProduction,
    ROUTES.design,
    ROUTES.contractors,
    ROUTES.sampleStock,
  ];
  return entityRoutes.some((route) => currentPathname.startsWith(`${route}/`) && hrefPathname === currentPathname);
}

function getNotificationActionLabel(href?: string) {
  const normalizedHref = normalizeNotificationHref(href);
  if (!normalizedHref) return "Відкрити";
  if (normalizedHref.startsWith(ROUTES.design)) return "До задачі";
  if (normalizedHref.startsWith(ROUTES.ordersEstimates)) return "До прорахунку";
  if (normalizedHref.startsWith(ROUTES.ordersCustomers)) return "До замовника";
  if (normalizedHref.startsWith(ROUTES.ordersProduction)) return "До замовлення";
  if (normalizedHref.startsWith(ROUTES.sampleStock)) return "До складу";
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
  sampleStock: "/stock/samples",
  finances: "/finances",
  marketing: "/marketing",
  team: "/team",

  workspaceSettings: "/workspace-settings",
  membersAccess: "/settings/members",
  integrations: "/integrations",
  notifications: "/notifications",
  accountSettings: "/account-settings",
  profile: "/profile",
  features: "/features",
  whatsNew: "/whats-new",
  // Розділ «Dev» — беклог, релізи, здоровʼя системи; шляхи в src/lib/devSection.ts.
  // Старі адреси (/releases, /dev-requests, /admin/observability) лишились
  // редиректами заради закладок і href у вже розісланих сповіщеннях.
} as const;

// --- Sidebar Config ---
const baseSidebarLinks: SidebarLink[] = [
  // Головне
  { label: "Огляд", to: ROUTES.overview, group: "overview", icon: LayoutGrid, moduleKey: "overview" },

  // Замовлення
  { label: "Замовники", to: ROUTES.ordersCustomers, group: "orders", icon: Building2, moduleKey: "customers" },
  { label: "Прорахунки", to: ROUTES.ordersEstimates, group: "orders", icon: Calculator, moduleKey: "quotes" },
  { label: "Замовлення", to: ROUTES.ordersProduction, group: "orders", icon: Factory, moduleKey: "orders" },
  { label: "До відвантаження", to: ROUTES.ordersReadyToShip, group: "orders", icon: Truck, moduleKey: "shipping" },
  // Операції
  { label: "Каталог", to: ROUTES.catalogProducts, group: "operations", icon: FolderKanban, moduleKey: "catalog" },
  { label: "Дизайн", to: ROUTES.design, group: "operations", icon: Palette, moduleKey: "design" },
  {
    label: "Підрядники",
    to: ROUTES.contractors,
    group: "operations",
    icon: BriefcaseBusiness,
    moduleKey: "contractors",
  },
  {
    label: "Склад",
    to: ROUTES.sampleStock,
    group: "operations",
    icon: Package,
    moduleKey: "stock",
  },
  {
    label: "Фінанси",
    to: ROUTES.finances,
    group: "operations",
    icon: Banknote,
    moduleKey: "finance",
  },
  {
    label: "Маркетинг",
    to: ROUTES.marketing,
    group: "operations",
    icon: Megaphone,
    moduleKey: "marketing",
  },
  // Акаунт
  //
  // Заміри 2026-08-05: власник бачив 17 пунктів, SEO — 14, решта — 8. При
  // висоті рядка 36 px меню власника вже не вміщалось у 13-дюймовий екран.
  // Прибрано назавжди:
  //   • «Сповіщення» — дублікат: у дзвіночку в шапці вже є «Усі сповіщення»
  //     (NotificationsMenu). Пункт бачили всі шістнадцятеро.
  //   • «Логістика» — модуль вимкнений усім, крім власника, а точки доставки
  //     заповнені у 3 клієнтів зі 128 і в 0 лідів. Маршрут лишається.
  // «Ролі та доступи» лишились поруч із «Командою»: це не конфіг системи, а
  // щоденна робота з людьми — і ходять туди з того ж місця, що й до складу
  // команди. Маршрути ніде не чіпалися — рухались лише пункти навігації.
  { label: "Команда", to: ROUTES.team, group: "account", icon: Users, moduleKey: "team" },
  { label: "Ролі та доступи", to: ROUTES.membersAccess, group: "account", icon: KeyRound, moduleKey: "members_access" },
  // «Інтеграції» — окремий розділ, а не рядок у меню акаунта: зовнішніх
  // сервісів уже кілька (Нова Пошта, Вчасно, Telegram, Dropbox), і кожен новий
  // додавав би ще один рядок туди, де його ніхто не шукає. Поки що всередині
  // самі налаштування Нової Пошти — решта інтеграцій чекає на своїй картці.
  { label: "Інтеграції", to: ROUTES.integrations, group: "account", icon: Plug, moduleKey: "nova_poshta" },

  /**
   * Dev — найнижча група в меню.
   *
   * Її бачать двоє (власник і SEO), і це кухня самої CRM, а не робота компанії,
   * тож вона стоїть під усім робочим. Три пункти замість трьох поверхонь у
   * трьох різних місцях: беклог сидів у сайдбарі серед «Операцій», релізи й
   * здоровʼя — рядками в меню акаунта.
   */
  { label: DEV_LABELS.backlog, to: DEV_PATHS.backlog, group: "dev", icon: GitPullRequestArrow, moduleKey: "dev" },
  // Іконка комітів, а не «ракета» чи годинник: розділ буквально будується з
  // комітів релізу (scripts/lib/releaseCommits.mjs), і це видно з першого разу.
  { label: DEV_LABELS.releases, to: DEV_PATHS.releases, group: "dev", icon: GitCommitVertical, moduleKey: "dev" },
  { label: DEV_LABELS.health, to: DEV_PATHS.health, group: "dev", icon: Activity, moduleKey: "dev" },
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
  if (pathname.startsWith(ROUTES.sampleStock))
    return {
      title: "Склад",
      subtitle: "Залишки товарів, резерви та складські рухи.",
      breadcrumbLabel: "Склад",
      breadcrumbTo: ROUTES.sampleStock,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.finances))
    return {
      title: "Фінанси",
      subtitle: "Рахунки, видаткові накладні, акти, звірки та витрати компанії.",
      breadcrumbLabel: "Фінанси",
      breadcrumbTo: ROUTES.finances,
      showPageHeader: false,
    };
  if (pathname.startsWith(ROUTES.marketing))
    return {
      title: "Маркетинг",
      subtitle: "Галерея дизайн-візуалів для зйомки та промо.",
      breadcrumbLabel: "Маркетинг",
      breadcrumbTo: ROUTES.marketing,
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
  if (pathname.startsWith(ROUTES.activity))
    return {
      title: "Активність",
      subtitle: "Останні дії команди та зміни в системі.",
      breadcrumbLabel: "Активність",
      breadcrumbTo: ROUTES.activity,
      // Сторінка малює власний UnifiedPageToolbar — типовий заголовок задвоївся б.
      showPageHeader: false,
    };
  // Три окремі пункти меню — отже три власні заголовки, а не один на розділ.
  if (pathname.startsWith(DEV_ROOT)) {
    const surface = resolveDevSurface(pathname);
    const subtitle =
      surface === "releases"
        ? "Скільки роботи зроблено — по днях і за період."
        : surface === "health"
          ? "Щоденні snapshots по базі, storage і важких SQL-шляхах."
          : "Що просить команда і що ми вирішили зробити.";
    return {
      title: DEV_LABELS[surface],
      subtitle,
      breadcrumbLabel: DEV_LABELS[surface],
      breadcrumbTo: DEV_PATHS[surface],
      showPageHeader: false,
    };
  }
  if (pathname.startsWith(ROUTES.membersAccess))
    return {
      title: "Ролі та доступи",
      subtitle: "Учасники, ролі, доступи та керування профілями команди.",
      breadcrumbLabel: "Ролі та доступи",
      breadcrumbTo: ROUTES.membersAccess,
      showPageHeader: false,
    };
  // Налаштування конкретного сервісу — перед загальною гілкою, інакше
  // startsWith нижче забере підмаршрут собі й крихта загубить, де ми є.
  if (pathname.startsWith(`${ROUTES.integrations}/nova-poshta`))
    return {
      title: "Нова Пошта",
      subtitle: "Відправник, дефолти ТТН і власні розміри коробок.",
      breadcrumbLabel: "Нова Пошта",
      breadcrumbTo: `${ROUTES.integrations}/nova-poshta`,
      showPageHeader: false,
    };
  // Без власної гілки сторінка падала у fallback і показувала шапку «Огляд ·
  // Пульс команди», ще й із зайвим блоком заголовка, що зсував контент униз.
  if (pathname.startsWith(ROUTES.integrations))
    return {
      title: "Інтеграції",
      subtitle: "Зовнішні сервіси, підключені до CRM.",
      breadcrumbLabel: "Інтеграції",
      breadcrumbTo: ROUTES.integrations,
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
  if (pathname.startsWith(ROUTES.whatsNew)) {
    const onFeatures = pathname.startsWith(WHATS_NEW_FEATURES);
    return {
      title: "Що нового",
      subtitle: onFeatures
        ? "Що вміє CRM і що з цього ти ще не пробував."
        : "Історія змін у CRM.",
      breadcrumbLabel: onFeatures ? "Можливості" : "Оновлення",
      breadcrumbTo: ROUTES.whatsNew,
      showPageHeader: false,
    };
  }
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

function normalizeIdentity(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function reminderKeyFromHref(href?: string | null) {
  if (!href) return null;
  const queryIndex = href.indexOf("?");
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  const value = params.get("reminder");
  return value?.trim() || null;
}

function formatDateTimeUA(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const datePart = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart} • ${timePart}`;
}

const TOSHO_AI_OPEN_PARAM = "tosho_ai";
const TOSHO_AI_REQUEST_PARAM = "tosho_ai_request";
const FLOATING_LAUNCHER_BLOCKING_SURFACE_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

function readToShoAiIntent(search: string) {
  const params = new URLSearchParams(search);
  const shouldOpen = params.get(TOSHO_AI_OPEN_PARAM)?.trim() === "open";
  const requestId = params.get(TOSHO_AI_REQUEST_PARAM)?.trim() || null;
  return {
    shouldOpen,
    requestId,
  };
}

function stripToShoAiIntent(search: string) {
  const params = new URLSearchParams(search);
  params.delete(TOSHO_AI_OPEN_PARAM);
  params.delete(TOSHO_AI_REQUEST_PARAM);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
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
  const { userId, teamId, session, permissions, accessRole, jobRole, viewUserId, moduleAccess } = useAuth();
  const isFinanceJobRole = ["seo", "accountant", "chief_accountant"].includes((jobRole ?? "").trim().toLowerCase());
  const showDesignerTimerWidget = Boolean(permissions.isDesigner && teamId && userId);
  const designerTimerController = useDesignerTimerController({
    teamId,
    userId,
    enabled: showDesignerTimerWidget,
  });
  const [designerTimerFloatingOpen, setDesignerTimerFloatingOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(DESIGNER_TIMER_FLOATING_VISIBLE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const pageNode = children ?? <Outlet />;
  const baseHeader = useMemo(() => getHeaderConfig(location.pathname), [location.pathname]);
  const headerActions = usePageHeaderActionsValue();
  const toshoAiContext = useMemo(
    () =>
      buildToShoAiRouteContext({
        pathname: location.pathname,
        search: location.search,
        title: baseHeader.title,
      }),
    [baseHeader.title, location.pathname, location.search]
  );
  /**
   * Видимість пунктів меню.
   *
   * Доступи беремо з `useAuth()` — вони вже враховують режим «Дивитись як».
   * Раніше тут стояв власний виклик довідника, який умів повертати лише
   * власний запис, тому owner у режимі перегляду бачив своє меню.
   */
  const visibleSidebarLinks = useMemo(
    () =>
      sidebarLinks.filter((link) => {
        if (!link.moduleKey) return true;
        // Доступи ще вантажаться — краще не показати пункт, ніж блимнути ним.
        if (moduleAccess === undefined) return false;

        /**
         * Явно знята галочка ховає пункт навіть у власника.
         *
         * Це не обмеження прав: доступ у нього лишається (роут-гейт пропускає,
         * RLS не змінюється) — ховається саме пункт меню. Власник має право
         * прибрати з очей те, чим не користується; ігнорувати його ж свідомий
         * вибір і показувати пункт назад — просто незручно. Права за
         * замовчуванням не звужуються: незаписаний ключ і далі означає
         * «показувати».
         */
        const hiddenExplicitly = moduleAccess[link.moduleKey] === false;

        /**
         * Обмежений модуль («Dev») — рішення лише за нормалізованим доступом.
         *
         * Гілку власника нижче тут проходити НЕ можна: вона повертає true для
         * будь-якого ключа, і перший же модуль, до якого власника не пускає
         * база, показав би пункт у меню повз власне обмеження. Роль уже
         * врахована в normalizeModuleAccess, а hasModuleAccess для таких
         * ключів вимагає явного true — знята галочка ховає пункт тим самим.
         */
        if (getModuleDefinition(link.moduleKey)?.restrictedTo) {
          // «Здоровʼя» додатково закрите access_role — той самий гейт, що
          // стояв на Observability. SEO має Dev, але не має цієї сторінки, і
          // показувати пункт, який одразу викине, немає сенсу.
          if (link.to === DEV_PATHS.health && !(permissions.isSuperAdmin || permissions.isAdmin)) {
            return false;
          }
          return hasModuleAccess(moduleAccess, link.moduleKey);
        }

        // Фінанси обмежені роллю в самій БД (RLS) — тримаємо UI у згоді з нею.
        if (link.moduleKey === "finance") {
          return (permissions.isSuperAdmin || isFinanceJobRole) && !hiddenExplicitly;
        }
        if (permissions.isSuperAdmin) return !hiddenExplicitly;
        return hasModuleAccess(moduleAccess, link.moduleKey);
      }),
    [moduleAccess, isFinanceJobRole, permissions.isAdmin, permissions.isSuperAdmin]
  );
  /**
   * Згорнуті секції меню. Ключ — SidebarGroupKey, стан у localStorage.
   * Читаємо в ініціалізаторі, щоб на першому кадрі меню вже було таким, яким
   * людина його лишила, а не розгорталось на мить після монтування.
   */
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    readCollapsedGroups()
  );
  const toggleGroup = React.useCallback((key: SidebarGroupKey) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeCollapsedGroups(next);
      return next;
    });
  }, []);

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
    location.pathname.startsWith(ROUTES.sampleStock) ||
    location.pathname.startsWith(ROUTES.notifications) ||
    location.pathname.startsWith(ROUTES.membersAccess) ||
    // Тільки беклог: він канбан і має поводитись як дошки дизайну й
    // прорахунків — іти наскрізь до правого краю, щоб колонки заїжджали під
    // сайдбар при горизонтальному скролі. «Релізи» й «Здоровʼя» — звичайні
    // сторінки з читомою шириною, їм полотно нашкодило б.
    location.pathname.startsWith(DEV_PATHS.backlog) ||
    location.pathname.startsWith(ROUTES.finances);

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
  const [toshoAiRequestedThreadId, setToshoAiRequestedThreadId] = useState<string | null>(null);
  /** Питання, набране в палітрі: консоль підставить його й відправить сама. */
  const [toshoAiInitialQuestion, setToshoAiInitialQuestion] = useState<string | null>(null);

  /**
   * Приклад питання під полем пошуку. Беремо найкоротший із трьох перших
   * підказок для цієї посади й сторінки: підказка має прочитатись за мить,
   * тож довге питання тут гірше за коротке, хай і менш влучне.
   */
  const searchHintExample = useMemo(() => {
    const suggestions = resolveAiSuggestions({
      accessRole,
      jobRole,
      pathname: location.pathname,
      dayKey: new Date().toISOString().slice(0, 10),
      limit: 3,
    });
    if (suggestions.length === 0) return null;
    return suggestions.reduce((shortest, item) =>
      item.question.length < shortest.question.length ? item : shortest
    ).question;
  }, [accessRole, jobRole, location.pathname]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [floatingLauncherBlocked, setFloatingLauncherBlocked] = useState(false);
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
  const activeReminderAssigneeKeys = useMemo(() => {
    const keys = new Set<string>();
    const resolvedName = buildUserNameFromMetadata(
      session?.user?.user_metadata as Record<string, unknown> | undefined,
      session?.user?.email
    );
    const email = session?.user?.email ?? "";
    const emailLocalPart = email.split("@")[0] ?? "";

    const fullNameParts = resolvedName.fullName.split(/\s+/).filter(Boolean);
    const shortForward =
      fullNameParts.length >= 2 ? `${fullNameParts[0]} ${fullNameParts[1][0]}.` : "";
    const shortReversed =
      fullNameParts.length >= 2 ? `${fullNameParts[1]} ${fullNameParts[0][0]}.` : "";

    [resolvedName.displayName, resolvedName.fullName, shortForward, shortReversed, email, emailLocalPart]
      .map(normalizeIdentity)
      .filter(Boolean)
      .forEach((key) => keys.add(key));

    return keys;
  }, [session]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    let animationFrame = 0;

    const syncFloatingLauncherBlocked = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const hasBlockingSurface = Boolean(
          document.querySelector(FLOATING_LAUNCHER_BLOCKING_SURFACE_SELECTOR)
        );
        setFloatingLauncherBlocked((prev) => (prev === hasBlockingSurface ? prev : hasBlockingSurface));
      });
    };

    syncFloatingLauncherBlocked();

    const observer = new MutationObserver(syncFloatingLauncherBlocked);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("app_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    saveToShoAiLastContext(toshoAiContext);
  }, [toshoAiContext]);

  useEffect(() => {
    try {
      localStorage.setItem(DESIGNER_TIMER_FLOATING_VISIBLE_KEY, designerTimerFloatingOpen ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [designerTimerFloatingOpen]);

  useEffect(() => {
    const intent = readToShoAiIntent(location.search);
    if (!intent.shouldOpen) return;

    setToshoAiRequestedThreadId(intent.requestId);
    setToshoAiOpen(true);

    const nextSearch = stripToShoAiIntent(location.search);
    navigate(`${location.pathname}${nextSearch}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

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
        // Сторінки, які рахують валюту (напр. підписки у Фінансах), слухають цю подію,
        // бо localStorage не сповіщає ту саму вкладку.
        window.dispatchEvent(new Event(FX_RATES_UPDATED_EVENT));
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
    if (showDesignerTimerWidget) return;
    const controller = new AbortController();
    void loadUsdUahRate({ signal: controller.signal });
    const intervalId = window.setInterval(() => {
      void loadUsdUahRate();
    }, 15 * 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [loadUsdUahRate, showDesignerTimerWidget]);


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

  useEffect(() => {
    const handler = () => {
      void loadNotifications();
    };
    window.addEventListener("notifications_read", handler);
    return () => {
      window.removeEventListener("notifications_read", handler);
    };
  }, [loadNotifications]);

  const handleToShoAiOpenChange = React.useCallback((open: boolean) => {
    setToshoAiOpen(open);
    if (!open) {
      setToshoAiRequestedThreadId(null);
      // Інакше наступне відкриття шторки — з меню чи з палітри команд — знову
      // відправило б старе питання й списало б за нього гроші.
      setToshoAiInitialQuestion(null);
    }
  }, []);

  const openNotification = React.useCallback(async (n: NotificationItem) => {
    setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
    if (!n.read) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    if (n.href) navigate(n.href);
  }, [navigate]);

  const showInAppNotificationToast = React.useCallback(
    (item: NotificationItem, options?: { skipRouteSuppression?: boolean }) => {
      if (typeof window === "undefined") return;
      if (!inAppNotificationsEnabled) return;
      if (location.pathname.startsWith("/notifications")) return;
      if (document.visibilityState !== "visible") return;

      const currentRoute = `${location.pathname}${location.search}`;
      if (!options?.skipRouteSuppression && shouldSuppressInAppNotificationToast(currentRoute, item.href)) return;

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
    if (!userId || !teamId || activeReminderAssigneeKeys.size === 0) return;

    let disposed = false;
    let inFlight = false;

    const deliverActiveReminder = async (row: {
      title: string;
      body: string;
      href: string;
    }) => {
      try {
        await notifyUsers({
          userIds: [userId],
          title: row.title,
          body: row.body,
          href: row.href,
          type: "warning",
          dedupeByHref: true,
        });
      } catch {
        const { error } = await supabase.from("notifications").insert({
          user_id: userId,
          title: row.title,
          body: row.body,
          href: row.href,
          type: "warning",
        });
        if (error && !(error.code === "23505" || /duplicate key/i.test(error.message ?? ""))) {
          throw error;
        }
      }
    };

    const shouldShowLocalReminderToast = (href: string) => {
      if (realtimeDisabled) return true;
      const currentRoute = `${location.pathname}${location.search}`;
      return shouldSuppressInAppNotificationToast(currentRoute, href);
    };

    const run = async () => {
      if (disposed || inFlight || !isDocumentVisible()) return;
      inFlight = true;

      try {
        const now = new Date();
        const nowIso = now.toISOString();
        const fromIso = new Date(now.getTime() - ACTIVE_REMINDER_LOOKBACK_MS).toISOString();

        const [customersResult, leadsResult, existingResult] = await Promise.all([
          supabase
            .schema("tosho")
            .from("customers")
            .select("id,name,manager,manager_user_id,reminder_at,reminder_comment")
            .eq("team_id", teamId)
            .not("reminder_at", "is", null)
            .lte("reminder_at", nowIso)
            .gte("reminder_at", fromIso)
            .order("reminder_at", { ascending: true })
            .limit(200),
          supabase
            .schema("tosho")
            .from("leads")
            .select("id,company_name,legal_name,manager,manager_user_id,reminder_at,reminder_comment")
            .eq("team_id", teamId)
            .not("reminder_at", "is", null)
            .lte("reminder_at", nowIso)
            .gte("reminder_at", fromIso)
            .order("reminder_at", { ascending: true })
            .limit(200),
          supabase
            .from("notifications")
            .select("href")
            .eq("user_id", userId)
            .not("href", "is", null)
            .like("href", "/orders/customers%")
            .gte("created_at", fromIso)
            .limit(1000),
        ]);

        if (customersResult.error || leadsResult.error || existingResult.error) return;

        const existingKeys = new Set(
          ((existingResult.data ?? []) as Array<{ href?: string | null }>)
            .map((row) => reminderKeyFromHref(row.href))
            .filter((value): value is string => Boolean(value))
        );
        const pendingRows: Array<{ title: string; body: string; href: string }> = [];

        const enqueue = (params: {
          kind: "customer" | "lead";
          id: string;
          name: string;
          manager?: string | null;
          managerUserId?: string | null;
          reminderAt?: string | null;
          comment?: string | null;
        }) => {
          if (!params.id || !params.reminderAt) return;
          if (params.managerUserId && params.managerUserId !== userId) return;
          if (!params.managerUserId) {
            const managerKey = normalizeIdentity(params.manager);
            if (managerKey && !activeReminderAssigneeKeys.has(managerKey)) return;
          }

          const reminderKey = `${params.kind}:${params.id}:${params.reminderAt}`;
          if (existingKeys.has(reminderKey)) return;
          existingKeys.add(reminderKey);

          const search = new URLSearchParams({
            reminder: reminderKey,
            tab: params.kind === "lead" ? "leads" : "customers",
            [params.kind === "lead" ? "leadId" : "customerId"]: params.id,
          });
          const body = params.comment?.trim()
            ? `${params.comment.trim()}\nЗаплановано на ${formatDateTimeUA(params.reminderAt)}`
            : `Заплановано на ${formatDateTimeUA(params.reminderAt)}`;

          pendingRows.push({
            title: `Нагадування: ${params.name}`,
            body,
            href: `/orders/customers?${search.toString()}`,
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
          enqueue({
            kind: "customer",
            id: row.id,
            name: row.name?.trim() || "Замовник",
            manager: row.manager,
            managerUserId: row.manager_user_id,
            reminderAt: row.reminder_at,
            comment: row.reminder_comment,
          });
        }

        for (const row of (leadsResult.data ?? []) as Array<{
          id: string;
          company_name?: string | null;
          legal_name?: string | null;
          manager?: string | null;
          manager_user_id?: string | null;
          reminder_at?: string | null;
          reminder_comment?: string | null;
        }>) {
          enqueue({
            kind: "lead",
            id: row.id,
            name: row.company_name?.trim() || row.legal_name?.trim() || "Лід",
            manager: row.manager,
            managerUserId: row.manager_user_id,
            reminderAt: row.reminder_at,
            comment: row.reminder_comment,
          });
        }

        await Promise.all(
          pendingRows.map(async (row) => {
            await deliverActiveReminder(row);
            if (!shouldShowLocalReminderToast(row.href)) return;
            showInAppNotificationToast(
              {
                id: `active-reminder:${row.href}`,
                title: row.title,
                description: row.body,
                time: formatDateTimeUA(new Date().toISOString()),
                createdAt: new Date().toISOString(),
                href: row.href,
                read: false,
                tone: "warning",
              },
              { skipRouteSuppression: true }
            );
          })
        );
        if (pendingRows.length > 0) {
          void loadNotifications();
        }
      } finally {
        inFlight = false;
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, ACTIVE_REMINDER_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeReminderAssigneeKeys,
    loadNotifications,
    location.pathname,
    location.search,
    realtimeDisabled,
    showInAppNotificationToast,
    teamId,
    userId,
  ]);

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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          const item = mapNotificationRow(row);
          setNotifications((prev) => prev.map((existing) => (existing.id === item.id ? item : existing)));
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
  const hideToShoAiLauncher = toshoAiOpen || mobileMenuOpen || cmdkOpen || floatingLauncherBlocked;

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
          sidebarCollapsed ? "w-[72px]" : "w-[232px]"
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
                "inline-flex items-center justify-center overflow-hidden rounded-lg transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
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
                sidebarCollapsed ? "rounded-xl bg-background/35" : ""
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
          {moduleAccess === undefined ? (
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
                groupCollapsed={collapsedGroups.orders}
                onToggleGroup={() => toggleGroup("orders")}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Операції"
                links={visibleSidebarLinks.filter((l) => l.group === "operations")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
                groupCollapsed={collapsedGroups.operations}
                onToggleGroup={() => toggleGroup("operations")}
              />
            </div>
            <div className={cn("relative", sidebarCollapsed ? "py-2.5" : "")}>
              <SidebarGroup
                label="Акаунт"
                links={visibleSidebarLinks.filter((l) => l.group === "account")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
                groupCollapsed={collapsedGroups.account}
                onToggleGroup={() => toggleGroup("account")}
              />
            </div>
            {/* «Dev» — найнижча група: це кухня самої CRM, а не робота
                компанії, і бачать її двоє. SidebarGroup сам повертає null на
                нуль посилань, тож у решти команди блок не займає й пікселя. */}
            <div className={cn("relative", sidebarCollapsed ? "py-2.5 pb-0" : "")}>
              <SidebarGroup
                label="Dev"
                links={visibleSidebarLinks.filter((l) => l.group === "dev")}
                currentPath={location.pathname}
                notificationsUnreadCount={unreadCount}
                collapsed={sidebarCollapsed}
                groupCollapsed={collapsedGroups.dev}
                onToggleGroup={() => toggleGroup("dev")}
              />
            </div>
          </div>
          )}
        </nav>

        {/* Footer / Profile
            Плашка «Можливості» прибита сюди, до блоку акаунта: у хвості
            навігації вона зависала посеред порожнечі. Flex із gap, а не
            margin, — коли плашці нема чого сказати, вона рендерить null і
            відступ зникає разом із нею. */}
<div
  className={cn(
    "flex flex-col border-t border-border/40",
    sidebarCollapsed ? "gap-2 p-2" : "gap-2.5 p-4"
  )}
>
  <SidebarFeaturePlate collapsed={sidebarCollapsed} />
  <UserMenu compact={sidebarCollapsed} />
</div>
      </aside>

      {/* MAIN */}
      <div
        className={cn(
          "transition-[padding] duration-[220ms] ease-linear",
          sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[232px]"
        )}
      >
        <div>
        {/* HEADER */}
        <header
          key={theme}
          className={cn(
            "fixed top-0 right-0 z-20 border-b border-border/40 transition-[background-color,backdrop-filter,border-color] duration-200",
            "bg-[hsl(var(--page-underlay-bg))]/80 supports-[backdrop-filter]:backdrop-blur-lg",
            sidebarCollapsed ? "md:left-[72px]" : "md:left-[232px]",
            "left-0"
          )}
        >
          {/* Права колонка — minmax(max-content,1fr): її вміст (віджети таймера,
              заробітку, сповіщень) має shrink-0, тож при minmax(0,1fr) колонка
              ставала вужчою за вміст і той налазив на центральний пошук.
              max-content гарантує колонці щонайменше ширину вмісту, а пошук
              віддає простір, стискаючись у своїх межах. */}
          <div className="flex h-14 items-center gap-3 px-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(260px,380px)_minmax(max-content,1fr)] md:items-center md:gap-4 md:px-5 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {/* Mobile menu */}
              <div className="md:hidden">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-[var(--radius-lg)]">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>

                  {/* Мобільне меню: дотик повз — універсальний жест закриття
                      навігації, і втрачати тут нічого. */}
                  <SheetContent
                    side="left"
                    hideClose
                    dismissible
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
                                className="inline-flex items-center justify-center rounded-lg px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
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
                                "focus-visible:ring-2 focus-visible:ring-foreground/20"
                              )}
                              onClick={() => setCmdkOpen(true)}
                            />
                            <div className="absolute inset-y-0 right-2 flex items-center">
                              <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-md border border-border bg-muted/70 px-2.5 font-mono text-3xs font-medium text-muted-foreground">
                                <span className="text-2xs">⌘</span>K
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
                            groupCollapsed={collapsedGroups.orders}
                            onToggleGroup={() => toggleGroup("orders")}
                          />
                          <SidebarGroup
                            label="Операції"
                            links={visibleSidebarLinks.filter((l) => l.group === "operations")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                            groupCollapsed={collapsedGroups.operations}
                            onToggleGroup={() => toggleGroup("operations")}
                          />
                          <SidebarGroup
                            label="Акаунт"
                            links={visibleSidebarLinks.filter((l) => l.group === "account")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                            groupCollapsed={collapsedGroups.account}
                            onToggleGroup={() => toggleGroup("account")}
                          />
                          {/* Найнижча група — як і в десктопному сайдбарі. */}
                          <SidebarGroup
                            label="Dev"
                            links={visibleSidebarLinks.filter((l) => l.group === "dev")}
                            currentPath={location.pathname}
                            onNavigate={() => setMobileMenuOpen(false)}
                            notificationsUnreadCount={unreadCount}
                            groupCollapsed={collapsedGroups.dev}
                            onToggleGroup={() => toggleGroup("dev")}
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

              {/* Назва сторінки замість хлібних крихт.
                  Крихти були завжди дворівневі: «ToSho CRM» вело на «Огляд»
                  (перший пункт сайдбару), а друга ланка — на сторінку, де ти
                  вже стоїш. На сторінках деталей повернення до списку й так
                  дає власна кнопка «Назад до списку». Тобто це був підпис, а
                  не навігація — лишаємо тільки підпис. */}
              <div className="hidden min-w-0 md:flex h-7 items-center">
                <span className="truncate text-sm font-semibold leading-none tracking-tight text-foreground">
                  {header.breadcrumbLabel}
                </span>
              </div>

              {/* Mobile title */}
              <div className="min-w-0 flex-1 md:hidden">
                <div className="truncate text-[1.25rem] font-semibold leading-tight tracking-tight text-foreground">
                  {header.title}
                </div>
              </div>
            </div>

            {/* CENTER SEARCH
                Компактна фіксована ширина, а не max-w-[520px]: праворуч живуть
                плашка виробітку дизайнера, таймер, курси й дзвіночок, і широке
                поле забирало в них місце. Сама середня колонка сітки центрована
                по вікну, тож ширина назви сторінки ліворуч на неї не впливає —
                кнопка не стрибає між сторінками. */}
            <div className="group relative hidden md:flex min-w-0 items-center justify-center">
              <button
                type="button"
                onClick={() => setCmdkOpen(true)}
                aria-label="Знайти або спитати ToSho AI"
                // pr-1 (4px), а не pr-1.5: пігулка всередині має відступ 4px
                // зверху й знизу (h-8 у полі h-10), тож праворуч мусить бути
                // рівно стільки ж — інакше вона висить не по центру рамки.
                // Наведення нейтральне, як у решти полів: світлішає фон, рамка
                // лишається своя. Рожевий обідок робив із поля рекламу модуля —
                // сам колір бренду живе в пігулці праворуч, і цього досить.
                className="group/search inline-flex h-10 w-[320px] cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-muted/40 pl-3.5 pr-1 text-sm text-muted-foreground shadow-inner transition-all duration-200 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:border-foreground/50"
              >
                <Search className="h-4 w-4 shrink-0 opacity-70" />
                {/* Не «Пошук»: те саме поле тепер і шукає, і питає ToSho AI.
                    Перше слово лишили знайомим, щоб ніхто не гадав, куди подівся
                    пошук. */}
                <span className="flex-1 truncate text-left">Знайти або спитати</span>
                {/* Пігулка НЕ окрема кнопка: обидві половини поля відкривають те
                    саме вікно, а режим вибирає набраний текст (див.
                    looksLikeQuestion). Тому вона декоративна — pointer-events-none,
                    без власного hover — інакше виглядала б як кнопка, що нічого
                    не робить. Кнопку в кнопку вкласти й не можна: браузер такого
                    не приймає, а з клавіатури до внутрішньої не дійти.

                    Радіус ВКЛАДЕНИЙ, а не такий самий: зовні rounded-xl (12px),
                    усередині rounded-lg (8px) — 12 мінус відступ 4px. Однаковий
                    радіус на вкладених прямокутниках читається як помилка, а
                    капсула всередині прямокутника — тим паче. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none relative inline-flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-ai-accent/25 bg-ai-accent/[0.08] px-2.5 text-2xs font-medium text-ai-accent transition-colors duration-200 group-hover:border-ai-accent/45 group-hover:bg-ai-accent/15"
                >
                  {/* Блиск сам пробігає раз на сім із половиною секунд — щоб про
                      можливість спитати згадували й ті, хто сюди не наводить.

                      Маска гасить смугу біля лівого й правого країв: без неї
                      блиск виринає й зникає об рамку різким зрізом, і рух
                      читається як дешевий банер. Позицію веде ТІЛЬКИ анімація —
                      статичний -translate-x-full тут ставити не можна: у
                      Tailwind v4 translate і transform різні властивості, вони
                      склались би й зсунули всю траєкторію. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)] motion-reduce:hidden"
                  >
                    <span className="absolute inset-y-0 left-0 w-full animate-ai-shimmer bg-[linear-gradient(100deg,transparent_0%,hsl(var(--ai-accent)/0.10)_35%,hsl(var(--ai-accent)/0.42)_50%,hsl(var(--ai-accent)/0.10)_65%,transparent_100%)] blur-[1px]" />
                  </span>
                  <ToShoAiMark className="relative h-3.5 w-3.5 [&>path:last-child]:animate-ai-spark motion-reduce:[&>path:last-child]:animate-none" />
                  <span className="relative">ToSho AI</span>
                </span>
              </button>

              {/* Підштовхування: живий приклад питання під полем. Абсолютний, щоб
                  шапка не смикалась, і pointer-events-none, щоб не перехоплював
                  клік по самому полю. Приклад береться з того самого реєстру, що
                  й підказки в палітрі, — тобто залежить від посади й сторінки. */}
              {searchHintExample ? (
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 max-w-[420px] -translate-x-1/2 truncate rounded-lg border border-border/60 bg-popover px-2.5 py-1 text-xs text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                  наприклад: {searchHintExample}
                </span>
              ) : null}
            </div>

            {/* RIGHT ACTIONS */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0 md:justify-self-end md:gap-2">
              {/* Заробіток — поруч із таймером; сам вирішує, чи показуватись
                  (рендерить null, якщо в людини немає чинної ставки). */}
              {permissions.isDesigner ? <DesignerEarningsWidget teamId={teamId} userId={viewUserId} /> : null}
              {showDesignerTimerWidget ? (
                <DesignerHeaderTimerWidget
                  controller={designerTimerController}
                  floatingOpen={designerTimerFloatingOpen}
                  onShowFloating={() => setDesignerTimerFloatingOpen(true)}
                />
              ) : (
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
                          <div className="mt-1 text-2xs opacity-90">
                            Перевір `/.netlify/functions/fx-rates`, доступність Мінфіну або парсинг HTML.
                          </div>
                        </div>
                      ) : null}
                      {!fxError && fxStaleWarning ? (
                        <div className="rounded-md tone-warning-subtle border px-3 py-2 text-xs">
                          <div className="font-semibold">Потрібна перевірка джерела</div>
                          <div className="mt-1">{fxStaleWarning}</div>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-2.5">
                          <div className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
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
                          <div className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
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
              )}

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

              <NotificationsMenu
                open={notificationsOpen}
                onOpenChange={setNotificationsOpen}
                items={unreadNotifications}
                unreadCount={unreadCount}
                loading={notificationsLoading}
                push={push}
                onOpenItem={openNotification}
                onMarkAllRead={markAllRead}
                onOpenTelegramSetup={() => {
                  setNotificationsOpen(false);
                  navigate(ROUTES.profile);
                }}
                onOpenAll={() => navigate("/notifications")}
              />

            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main
          className={cn(
            "w-full overflow-x-hidden pb-[calc(var(--tabbar-height)+var(--tabbar-inset-bottom)+16px)] md:pb-0",
            isCanvasMode ? "px-0 pt-14 md:px-0 lg:px-0" : "pt-[76px]"
          )}
          data-canvas-mode={isCanvasMode ? "on" : "off"}
        >
          {/* Нагадування про режим «Дивитись як» — над усім контентом, щоб
              випадково не сплутати чужий вигляд зі своїм. */}
          <ViewAsBar />
          {/* Анонс релізу при вході. Сам вирішує, показуватись чи ні, і
              тримає інваріант «одна модалка за сеанс». */}
          <ProductUpdateModal />
          {/* Смуга шапки з дивайдером — на всю ширину контентної колонки (від сайдбара
              до правого краю). Бічні падінги живуть на внутрішніх обгортках, а не на
              <main>, інакше роздільник обрізався б по краях max-width. */}
          {header.showPageHeader === false && headerActions ? (
            <div className="border-b border-[hsl(var(--app-structure-divider))] bg-[hsl(var(--page-underlay-bg)/0.72)] supports-[backdrop-filter]:backdrop-blur-md">
              <div
                className={cn(
                  "min-w-0",
                  isCanvasMode
                    ? "px-4 py-3 md:px-5 lg:px-6"
                    : "mx-auto w-full max-w-[1600px] px-4 pb-4 md:px-5 lg:px-6"
                )}
              >
                {headerActions}
              </div>
            </div>
          ) : null}

          <div className={cn(isCanvasMode ? "" : "px-4 md:px-5 lg:px-6")}>
            <div
              className={cn(
                isCanvasMode ? "min-w-0" : "mx-auto max-w-[1600px] min-w-0 space-y-6 pt-6"
              )}
            >
              {/* Заголовок у контентній колонці: тільки коли немає окремої смуги дій. */}
              {header.showPageHeader === false ? (
                headerActions ? null : header.eyebrow ? (
                  <div className="hidden md:flex">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
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
          </div>
        </main>
        </div>
      </div>

      {/* cmdkOpen теж ховає смугу: на телефоні палітра — аркуш знизу, і смуга
          лягала просто поверх її поля вводу. */}
      <TabBar hidden={mobileMenuOpen || toshoAiOpen || cmdkOpen} onAsk={() => setCmdkOpen(true)} />
      <Sheet open={toshoAiOpen} onOpenChange={handleToShoAiOpenChange}>
        <SheetContent
          side="right"
          hideClose
          // Розмова, а не форма: усе надіслане вже збережено на сервері, а
          // ненадісланий рядок у полі — не робота, яку шкода втратити. Без цього
          // спрацьовував типовий захист і питав «Закрити без збереження?» навіть
          // із порожнім полем: позначку «щось міняли» ставить сам факт набору,
          // і відправлене питання її не знімає.
          dismissible
          className="inset-0 z-overlay h-[100dvh] max-h-[100dvh] w-[100dvw] max-w-[100dvw] overflow-hidden overscroll-none border-l border-border/70 bg-[linear-gradient(180deg,hsl(var(--page-underlay-bg)),hsl(var(--card)))] p-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-[620px]"
        >
          <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border/70 bg-background/82 px-3 py-3 backdrop-blur-xl sm:px-4 sm:py-4 md:px-5">
              <SheetHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <ToShoAiWordmark />
                    <SheetTitle className="sr-only">Шо треба?</SheetTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <SheetClose asChild>
                      <Button type="button" variant="ghost" size="iconSm" className="h-9 w-9 rounded-full" aria-label="Закрити ToSho AI">
                        <CloseIcon className="h-4 w-4" />
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </SheetHeader>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-0">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Завантаження ToSho AI…
                  </div>
                }
              >
                <ToShoAiConsole
                  // Питання входить у ключ: інакше друге питання поспіль
                  // потрапило б у вже змонтовану консоль і не відправилось.
                  key={`${toshoAiContext.href}:${toshoAiRequestedThreadId ?? "new"}:${toshoAiInitialQuestion ?? ""}`}
                  active={toshoAiOpen}
                  surface="sheet"
                  initialContext={toshoAiContext}
                  initialRequestId={toshoAiRequestedThreadId}
                  initialQuestion={toshoAiInitialQuestion}
                />
              </Suspense>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Плаваючу кнопку AI-помічника сховано на прохання CEO (2026-08-03).
          Сам помічник працює: відкривається з командної палітри (Cmd+K) і з
          усіх наявних точок входу — прибрано лише візуальну кнопку.
          Щоб повернути — досить змінити прапорець на !hideToShoAiLauncher. */}
      {SHOW_AI_LAUNCHER && !hideToShoAiLauncher ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-docked flex justify-end px-4 pb-[calc(var(--tabbar-height)+var(--tabbar-inset-bottom)+14px)] md:right-0 md:px-5 md:pb-5">
          <div className="flex flex-col items-end gap-2">
            <ToShoAiLauncherButton
              variant="nova"
              onClick={() => {
                setToshoAiRequestedThreadId(null);
                setToshoAiOpen(true);
              }}
            />
          </div>
        </div>
      ) : null}
      {showDesignerTimerWidget && designerTimerFloatingOpen ? (
        <DesignerFloatingTimerWidget
          controller={designerTimerController}
          onClose={() => setDesignerTimerFloatingOpen(false)}
        />
      ) : null}
      <CommandPalette
        open={cmdkOpen}
        onOpenChange={setCmdkOpen}
        onAskAi={(question) => {
          // Питання з палітри веде в ту саму шторку, що й решта входів, — просто
          // з уже набраним текстом. Нову розмову починаємо навмисно: людина
          // питає про те, що бачить зараз, а не продовжує вчорашню гілку.
          setToshoAiRequestedThreadId(null);
          setToshoAiInitialQuestion(question);
          setToshoAiOpen(true);
        }}
      />
      <TelegramPromoModal />
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
  groupCollapsed = false,
  onToggleGroup,
}: {
  label: string;
  links: SidebarLink[];
  currentPath: string;
  onNavigate?: () => void;
  notificationsUnreadCount?: number;
  collapsed?: boolean;
  hideLabel?: boolean;
  /** Секцію згорнуто людиною. Діє лише там, де є заголовок. */
  groupCollapsed?: boolean;
  /** Без обробника заголовок лишається звичайним написом, як і був. */
  onToggleGroup?: () => void;
}) {
  if (links.length === 0) return null;
  const isMobileDrawer = !collapsed && Boolean(onNavigate);
  // Згортати нема чого там, де немає заголовка: у вузькому сайдбарі (72px) і
  // в групі «Головне», яка малюється без підпису.
  const collapsible = Boolean(onToggleGroup) && !collapsed && !hideLabel;
  const isCollapsed = collapsible && groupCollapsed;

  /**
   * Активний пункт видно навіть у згорнутій секції.
   *
   * Інакше людина, згорнувши «Збут», перестає розуміти, де вона: сторінка
   * відкрита, а в меню жодної підсвітки. Slack так само лишає видимими канали
   * з непрочитаними — згорнута секція ховає рутину, а не поточний контекст.
   */
  const shownLinks = isCollapsed ? links.filter((link) => isActivePath(currentPath, link.to)) : links;

  return (
    <div className={cn(hideLabel ? "space-y-1" : isMobileDrawer ? "space-y-2.5" : "space-y-2")}>
      {!collapsed && !hideLabel ? (
        collapsible ? (
          <button
            type="button"
            onClick={onToggleGroup}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? `Розгорнути «${label}»` : `Згорнути «${label}»`}
            className={cn(
              "group/grp flex w-full items-center gap-1 rounded-md py-0.5 text-3xs font-semibold uppercase tracking-wider",
              "text-muted-foreground/65 transition-colors hover:text-foreground",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              isMobileDrawer ? "px-4 tracking-widest text-muted-foreground/75" : "px-3"
            )}
          >
            {/* Назва притиснута до лівого краю — на одній вертикалі з
                підписами решти секцій і з текстом пунктів під нею. */}
            <span>{label}</span>
            {/* Шеврон збоку від назви, через відступ, а не впритул: приліплений
                до тексту він читався б як частина слова. Місце за собою тримає
                завжди (прозорість, не display) — інакше підпис смикався б
                убік на кожному ховері. */}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "ml-1.5 h-3 w-3 shrink-0 transition-all duration-200",
                isCollapsed ? "-rotate-90 opacity-100" : "rotate-0 opacity-0 group-hover/grp:opacity-100"
              )}
            />
            {/* Скільки пунктів сховано — інакше згорнута секція виглядає як
                порожня, а не як згорнута. */}
            {isCollapsed ? (
              <span className="ml-auto font-mono text-3xs tabular-nums text-muted-foreground/50">
                {links.length}
              </span>
            ) : null}
          </button>
        ) : (
          <h4
            className={cn(
              "px-3 text-3xs font-semibold uppercase tracking-wider text-muted-foreground/65",
              isMobileDrawer ? "px-4 tracking-widest text-muted-foreground/75" : undefined
            )}
          >
            {label}
          </h4>
        )
      ) : null}

      <div className={cn(isMobileDrawer ? "space-y-1.5" : "space-y-1")}>
        {shownLinks.map((link) => {
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
                // Ховер підсвічує САМУ область, а не лише текст з іконкою.
                // Було hover:bg-muted/40 — у світлій темі muted (95.5%) майже
                // збігається з тлом сайдбару (96.4%), різниця 0.4% і плашки не
                // видно взагалі. bg-background світліший за сайдбар в обох
                // темах, тож ефект однаковий і там, і там.
                "transition-colors duration-150 ease-linear",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                collapsed
                  ? "mx-auto h-10 w-10 justify-center gap-0 rounded-xl px-0 py-0"
                  : isMobileDrawer
                    ? "min-h-11 rounded-2xl px-4 py-2.5"
                    : "h-9 rounded-lg",
                active
                  ? collapsed
                    ? "bg-foreground/5 text-foreground shadow-sm ring-1 ring-border/20"
                    : isMobileDrawer
                      ? "bg-foreground/5 text-foreground shadow-sm ring-1 ring-border/20"
                      : "bg-foreground/5 text-foreground shadow-sm ring-1 ring-border/20 font-medium"
                  : isMobileDrawer
                    ? "text-muted-foreground hover:bg-background hover:text-foreground"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
              )}
            >

              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors pointer-events-none",
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
                  <span className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                ) : (
                  <span
                    className={cn(
                      "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground",
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
