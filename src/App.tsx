// src/App.tsx
import React, { Suspense, lazy, useEffect, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  Link,
  useNavigationType,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./lib/supabaseClient";
import { logActivity } from "@/lib/activityLogger";
import { resolveWorkspaceId } from "@/lib/workspace";
import { useAuth } from "@/auth/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { AppLayout } from "@/layout/AppLayout";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { AppShell } from "@/components/app/AppShell";
import { migrateAndPruneSessionCaches } from "@/lib/sessionCache";
import {
  getCachedCurrentWorkspaceMemberDirectoryEntry,
  getCurrentWorkspaceMemberDirectoryEntry,
  WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT,
} from "@/lib/workspaceMemberDirectory";

// =======================
// Helpers UI
// =======================
function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function lazyWithRetry<T extends { default: React.ComponentType<unknown> }>(
  importer: () => Promise<T>
) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkLikeError(error) && reloadOnceForChunkError()) {
        return await new Promise<T>(() => {
          // Keep suspense pending while the hard reload is in progress.
        });
      }
      throw error;
    }
  });
}

const InvitePage = lazyWithRetry(() => import("./pages/InvitePage"));
const TeamMembersPage = lazyWithRetry(() =>
  import("./pages/TeamMembersPage").then((module) => ({ default: module.TeamMembersPage }))
);
const AdminPage = lazyWithRetry(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage }))
);
const ProfilePage = lazyWithRetry(() =>
  import("./pages/ProfilePage").then((module) => ({ default: module.ProfilePage }))
);
const OrdersEstimatesPage = lazyWithRetry(() => import("./pages/OrdersEstimatesPage"));
const OrdersCustomersPage = lazyWithRetry(() => import("./pages/OrdersCustomersPage"));
const OrdersEstimateDetailsPage = lazyWithRetry(() => import("./pages/OrdersEstimateDetailsPage"));
const ProductCatalogPage = lazyWithRetry(() => import("./features/catalog/ProductCatalogPage"));
const OrdersProductionPage = lazyWithRetry(() => import("./pages/OrdersProductionPage"));
const OrdersProductionDetailsRoutePage = lazyWithRetry(() => import("./pages/OrdersProductionDetailsRoutePage"));
const OrdersReadyToShipPage = lazyWithRetry(() => import("./pages/OrdersReadyToShipPage"));
const FinanceInvoicesPage = lazyWithRetry(() => import("./pages/FinanceInvoicesPage"));
const FinanceExpenseInvoicesPage = lazyWithRetry(() => import("./pages/FinanceExpenseInvoicesPage"));
const FinanceActsPage = lazyWithRetry(() => import("./pages/FinanceActsPage"));
const LogisticsPage = lazyWithRetry(() => import("./pages/LogisticsPage"));
const DesignPage = lazyWithRetry(() => import("./pages/DesignPage"));
const DesignTaskPage = lazyWithRetry(() => import("./pages/DesignTaskPage"));
const ContractorsPage = lazyWithRetry(() => import("./pages/ContractorsPage"));
const FinancePage = lazyWithRetry(() =>
  import("./pages/FinancePage").then((module) => ({ default: module.FinancePage }))
);
const FinanceTransactionCreatePage = lazyWithRetry(() =>
  import("./pages/FinanceTransactionCreatePage").then((module) => ({
    default: module.FinanceTransactionCreatePage,
  }))
);
const FinanceInvoiceCreatePage = lazyWithRetry(() =>
  import("./pages/FinanceInvoiceCreatePage").then((module) => ({
    default: module.FinanceInvoiceCreatePage,
  }))
);
const FinancePoolCreatePage = lazyWithRetry(() =>
  import("./pages/FinancePoolCreatePage").then((module) => ({
    default: module.FinancePoolCreatePage,
  }))
);
const FinancePoolDetailsPage = lazyWithRetry(() =>
  import("./pages/FinancePoolDetailsPage").then((module) => ({
    default: module.FinancePoolDetailsPage,
  }))
);
const OverviewPage = lazyWithRetry(() =>
  import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage }))
);
const ResetPasswordPage = lazyWithRetry(() => import("./pages/ResetPasswordPage"));
const UpdatePasswordPage = lazyWithRetry(() => import("./pages/UpdatePasswordPage"));
const NotificationsPage = lazyWithRetry(() => import("./pages/NotificationsPage"));
const ActivityPage = lazyWithRetry(() => import("./pages/ActivityPage"));
const RuntimeErrorsPage = lazyWithRetry(() => import("./pages/RuntimeErrorsPage"));
const AdminObservabilityPage = lazyWithRetry(() => import("./pages/AdminObservabilityPage"));

function RouteSuspense({
  children,
  shell = false,
}: {
  children: React.ReactNode;
  shell?: boolean;
}) {
  return <Suspense fallback={shell ? <AppShell /> : <PageSkeleton />}>{children}</Suspense>;
}

const CHUNK_RELOAD_GUARD_KEY = "app_chunk_reload_once";
const RUNTIME_ERROR_LOG_GUARD_KEY = "app_runtime_error_log_once";
const RUNTIME_RECOVERY_RELOAD_COOLDOWN_MS = 30_000;

type ReloadGuardPayload = {
  path: string;
  ts: number;
};

function getRuntimeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

function isChunkLikeError(error: unknown): boolean {
  const message = getRuntimeErrorMessage(error).toLowerCase();
  return (
    message.includes("chunkloaderror") ||
    message.includes("loading chunk") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("dynamically imported module")
  );
}

function isDomDetachRaceError(error: unknown): boolean {
  const message = getRuntimeErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to execute 'removechild'") ||
    (message.includes("the node to be removed is not a child of this node") &&
      message.includes("removechild"))
  );
}

function isIgnorableWindowError(error: unknown): boolean {
  const message = getRuntimeErrorMessage(error).toLowerCase();
  return (
    message.includes("resizeobserver loop completed with undelivered notifications") ||
    message.includes("resizeobserver loop limit exceeded")
  );
}

function consumeReloadGuard(key: string): boolean {
  if (typeof window === "undefined") return false;

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const now = Date.now();

  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReloadGuardPayload>;
      if (
        parsed.path === path &&
        typeof parsed.ts === "number" &&
        now - parsed.ts < RUNTIME_RECOVERY_RELOAD_COOLDOWN_MS
      ) {
        return false;
      }
    }

    const payload: ReloadGuardPayload = { path, ts: now };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function consumeRuntimeErrorLogGuard(signature: string): boolean {
  if (typeof window === "undefined") return false;

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const now = Date.now();

  try {
    const raw = window.sessionStorage.getItem(RUNTIME_ERROR_LOG_GUARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReloadGuardPayload> & { signature?: string };
      if (
        parsed.path === path &&
        parsed.signature === signature &&
        typeof parsed.ts === "number" &&
        now - parsed.ts < RUNTIME_RECOVERY_RELOAD_COOLDOWN_MS
      ) {
        return false;
      }
    }

    window.sessionStorage.setItem(
      RUNTIME_ERROR_LOG_GUARD_KEY,
      JSON.stringify({ path, ts: now, signature })
    );
    return true;
  } catch {
    return false;
  }
}

async function resolveRuntimeLogTeamId(userId?: string | null) {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return null;

  try {
    const { data, error } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ team_id?: string | null }>();
    if (!error && data?.team_id) return data.team_id;
  } catch {
    // ignore and try workspace fallback
  }

  try {
    return await resolveWorkspaceId(normalizedUserId);
  } catch {
    return null;
  }
}

function summarizeComponentStack(info?: ErrorInfo | null) {
  const stack = info?.componentStack?.trim();
  if (!stack) return null;
  return stack.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8).join(" | ");
}

function getRuntimeRouteContext(pathname: string) {
  const normalized = pathname.trim() || "/";

  const routeMatchers: Array<{
    pattern: string;
    scope: string;
    group: string;
    test: (value: string) => boolean;
  }> = [
    { pattern: "/overview", scope: "page", group: "overview", test: (value) => value === "/overview" },
    { pattern: "/notifications", scope: "page", group: "account", test: (value) => value.startsWith("/notifications") },
    { pattern: "/activity", scope: "page", group: "account", test: (value) => value.startsWith("/activity") },
    { pattern: "/profile", scope: "page", group: "account", test: (value) => value === "/profile" },
    { pattern: "/settings/members", scope: "page", group: "account", test: (value) => value.startsWith("/settings/members") },
    { pattern: "/admin", scope: "page", group: "admin", test: (value) => value === "/admin" },
    { pattern: "/admin/observability", scope: "page", group: "admin", test: (value) => value.startsWith("/admin/observability") },
    { pattern: "/admin/runtime-errors", scope: "page", group: "admin", test: (value) => value.startsWith("/admin/runtime-errors") },
    { pattern: "/orders/customers", scope: "page", group: "orders", test: (value) => value.startsWith("/orders/customers") },
    { pattern: "/orders/estimates", scope: "page", group: "orders", test: (value) => value === "/orders/estimates" },
    { pattern: "/orders/estimates/:id", scope: "details", group: "orders", test: (value) => /^\/orders\/estimates\/[^/]+$/.test(value) },
    { pattern: "/orders/production", scope: "page", group: "orders", test: (value) => value === "/orders/production" },
    { pattern: "/orders/production/:id", scope: "details", group: "orders", test: (value) => /^\/orders\/production\/[^/]+$/.test(value) },
    { pattern: "/orders/ready-to-ship", scope: "page", group: "orders", test: (value) => value.startsWith("/orders/ready-to-ship") },
    { pattern: "/catalog/products", scope: "page", group: "catalog", test: (value) => value.startsWith("/catalog/products") },
    { pattern: "/logistics", scope: "page", group: "operations", test: (value) => value.startsWith("/logistics") },
    { pattern: "/design", scope: "page", group: "operations", test: (value) => value === "/design" },
    { pattern: "/design/:id", scope: "details", group: "operations", test: (value) => /^\/design\/[^/]+$/.test(value) },
    { pattern: "/contractors", scope: "page", group: "operations", test: (value) => value.startsWith("/contractors") },
    { pattern: "/finance", scope: "page", group: "finance", test: (value) => value === "/finance" },
    { pattern: "/finance/invoices", scope: "page", group: "finance", test: (value) => value === "/finance/invoices" },
    { pattern: "/finance/invoices/new", scope: "create", group: "finance", test: (value) => value === "/finance/invoices/new" },
    { pattern: "/finance/expense-invoices", scope: "page", group: "finance", test: (value) => value.startsWith("/finance/expense-invoices") },
    { pattern: "/finance/acts", scope: "page", group: "finance", test: (value) => value.startsWith("/finance/acts") },
    { pattern: "/finance/transactions/new", scope: "create", group: "finance", test: (value) => value === "/finance/transactions/new" },
    { pattern: "/finance/pools/new", scope: "create", group: "finance", test: (value) => value === "/finance/pools/new" },
    { pattern: "/finance/pools/:id", scope: "details", group: "finance", test: (value) => /^\/finance\/pools\/[^/]+$/.test(value) },
  ];

  const matched = routeMatchers.find((entry) => entry.test(normalized));
  if (matched) {
    return {
      route_pattern: matched.pattern,
      route_scope: matched.scope,
      route_group: matched.group,
    };
  }

  const rootSegment = normalized.split("/").filter(Boolean)[0] ?? "root";
  return {
    route_pattern: null,
    route_scope: "unknown",
    route_group: rootSegment,
  };
}

function reportRuntimeError(params: { error: unknown; info?: ErrorInfo | null; source: "boundary" | "window_error" | "unhandledrejection" }) {
  const message = getRuntimeErrorMessage(params.error) || "Unknown runtime error";
  const path = typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : "/";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const routeContext = getRuntimeRouteContext(pathname);
  const signature = `${params.source}:${message.slice(0, 200)}:${path}`;
  if (!consumeRuntimeErrorLogGuard(signature)) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      const userId = user?.id ?? null;
      const teamId = await resolveRuntimeLogTeamId(userId);
      if (!teamId || !userId) return;

      await logActivity({
        teamId,
        userId,
        action: "app_runtime_error",
        entityType: "app_runtime_error",
        entityId: path,
        title: `${params.source}: ${message.slice(0, 180)}`,
        href: path,
        metadata: {
          source: params.source,
          message,
          path,
          pathname,
          search,
          hash,
          route_pattern: routeContext.route_pattern,
          route_scope: routeContext.route_scope,
          route_group: routeContext.route_group,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          language: typeof navigator !== "undefined" ? navigator.language ?? null : null,
          platform: typeof navigator !== "undefined" ? navigator.platform ?? null : null,
          viewport:
            typeof window !== "undefined"
              ? {
                  width: window.innerWidth,
                  height: window.innerHeight,
                  devicePixelRatio: window.devicePixelRatio ?? 1,
                }
              : null,
          component_stack: summarizeComponentStack(params.info),
        },
      });
    } catch (loggingError) {
      console.warn("Failed to log runtime error", loggingError);
    }
  })();
}

function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  if (!consumeReloadGuard(CHUNK_RELOAD_GUARD_KEY)) {
    return false;
  }
  window.location.reload();
  return true;
}

type AppBoundaryProps = { children: ReactNode };
type AppBoundaryState = { hasError: boolean; message: string };

class AppRuntimeBoundary extends React.Component<AppBoundaryProps, AppBoundaryState> {
  state: AppBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): AppBoundaryState {
    return {
      hasError: true,
      message: getRuntimeErrorMessage(error) || "Сталася помилка рендеру сторінки.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("App runtime error:", error, info);
    reportRuntimeError({ error, info, source: "boundary" });
    if (isChunkLikeError(error)) {
      const reloaded = reloadOnceForChunkError();
      if (!reloaded) {
        this.setState({
          hasError: true,
          message: "Не вдалося завантажити оновлення сторінки. Спробуйте оновити сторінку.",
        });
      }
      return;
    }
    if (isDomDetachRaceError(error)) {
      this.setState({
        hasError: true,
        message:
          "Сталася тимчасова помилка DOM. Спробуйте ще раз без авто-перекладу та браузерних розширень, що змінюють сторінку.",
      });
      return;
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg rounded-[var(--radius-inner)] border border-border bg-card p-5">
          <div className="text-base font-semibold">Сталася помилка інтерфейсу</div>
          <div className="mt-2 text-sm text-muted-foreground">{this.state.message}</div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={() => window.location.reload()}>
              Оновити сторінку
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/overview">На головну</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

// =======================
// Route guards
// =======================
function RequireAuth({
  children,
  session,
  loading,
}: {
  children: React.ReactNode;
  session: Session | null;
  loading: boolean;
}) {
  const location = useLocation();

  if (loading) return <AppShell />;

  if (!session) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${redirect}`} replace />;
  }

  return <>{children}</>;
}

function ProtectedAppLayout({
  session,
  loading,
}: {
  session: Session | null;
  loading: boolean;
}) {
  return (
    <RequireAuth session={session} loading={loading}>
      <AppLayout />
    </RequireAuth>
  );
}

function PermissionGate({
  allowed,
  requirement,
  accessRole,
  jobRole,
  children,
}: {
  allowed: boolean;
  requirement: string;
  accessRole: string | null;
  jobRole: string | null;
  children: React.ReactNode;
}) {
  if (!allowed) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="font-semibold">Немає доступу</div>
          <div className="text-muted-foreground mt-1">
            Потрібно: <code className="px-1 py-0.5 rounded bg-muted">{requirement}</code>
          </div>
          <div className="text-muted-foreground mt-1">
            Твій доступ: <code className="px-1 py-0.5 rounded bg-muted">{accessRole ?? "member"}</code>
            {" · "}
            роль у команді: <code className="px-1 py-0.5 rounded bg-muted">{jobRole ?? "member"}</code>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function TeamMembersRouteGate({
  accessRole,
  jobRole,
  canEditMemberRoles,
  children,
}: {
  accessRole: string | null;
  jobRole: string | null;
  canEditMemberRoles: boolean;
  children: React.ReactNode;
}) {
  const [hasTeamModuleAccess, setHasTeamModuleAccess] = useState<boolean>(() => {
    if (canEditMemberRoles) return true;
    return getCachedCurrentWorkspaceMemberDirectoryEntry()?.moduleAccess?.team === true;
  });

  useEffect(() => {
    let cancelled = false;

    const syncAccess = async () => {
      if (canEditMemberRoles) {
        if (!cancelled) setHasTeamModuleAccess(true);
        return;
      }

      const entry = await getCurrentWorkspaceMemberDirectoryEntry();
      if (!cancelled) {
        setHasTeamModuleAccess(entry?.moduleAccess?.team === true);
      }
    };

    void syncAccess();

    const handleUpdate = () => {
      void syncAccess();
    };

    window.addEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleUpdate);
    };
  }, [canEditMemberRoles]);

  return (
    <PermissionGate
      allowed={canEditMemberRoles || hasTeamModuleAccess}
      requirement="картка доступів: Управління командою або access_role: owner/admin"
      accessRole={accessRole}
      jobRole={jobRole}
    >
      {children}
    </PermissionGate>
  );
}

function RuntimeErrorsRouteGate({
  accessRole,
  jobRole,
  isSuperAdmin,
  children,
}: {
  accessRole: string | null;
  jobRole: string | null;
  isSuperAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <PermissionGate
      allowed={isSuperAdmin}
      requirement="access_role: owner (Super Admin)"
      accessRole={accessRole}
      jobRole={jobRole}
    >
      {children}
    </PermissionGate>
  );
}

// =======================
// Login page
// =======================
// src/App.tsx (Заміни тільки функцію LoginPage)

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const rawNext = params.get("next") ? decodeURIComponent(params.get("next") as string) : "/overview";
  const next = rawNext.startsWith("/") ? rawNext : "/overview";
  const isInviteFlow = next.startsWith("/invite");

  const [mode] = useState<"password" | "magic">(isInviteFlow ? "magic" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setLoading(true);

    try {
      if (!email.trim()) {
        setError("Вкажи email.");
        return;
      }

      if (mode === "password") {
        if (!password) {
          setError("Вкажи пароль.");
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        navigate(next, { replace: true });
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}${next}`,
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        setError(otpError.message);
        return;
      }

      setMsg("Готово. Я надіслав magic link на пошту. Відкрий лист і перейди за посиланням.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-card shadow-surface p-6 text-card-foreground">
        <div className="mb-5">
          <div className="text-xl font-extrabold text-foreground">
            {isInviteFlow ? "Вхід за інвайтом" : "Вхід у ToSho CRM"}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {isInviteFlow
              ? "Увійди, щоб прийняти запрошення в команду."
              : "Увійди, щоб бачити матчі, тренування й фінанси (як дозволяє роль)."}
          </div>
        </div>

        {(error || msg) && (
          <div
            className={cx(
              "mb-4 rounded-xl border p-3 text-sm font-medium",
              error 
                ? "bg-danger-soft border-danger-soft-border text-danger-foreground" 
                : "bg-success-soft border-success-soft-border text-success-foreground"
            )}
          >
            <div className="font-bold">{error ? "Помилка" : "Ок"}</div>
            <div className="mt-0.5 opacity-90">{error ?? msg}</div>
          </div>
        )}


        <form onSubmit={onLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              className="mt-1.5 w-full rounded-[var(--radius-lg)] border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
            />
          </div>

          {mode === "password" && !isInviteFlow && (
            <div>
              <label className="text-sm font-medium text-foreground">Пароль</label>
              <PasswordInput
                wrapperClassName="mt-1.5"
                inputClassName="w-full rounded-[var(--radius-lg)] border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? "..." : "Увійти"}
          </Button>
        </form>

        {!isInviteFlow ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Link className="underline hover:text-primary transition-colors" to="/reset-password">
              Забув пароль?
            </Link>
          </div>
        ) : null}

        {!isInviteFlow ? (
          <div className="mt-6 text-center text-xs text-muted-foreground">
            Для інвайтів: <Link className="underline hover:text-primary transition-colors" to="/invite">перейти до /invite</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --- ТУТ БУЛА СТАРА ФУНКЦІЯ InvitePage (MVP). Я ЇЇ ВИДАЛИВ. ---

// =======================
// App routes
// =======================
function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.hash, location.pathname, location.search, navigationType]);

  return null;
}

type BrowserLocationSnapshot = {
  pathname: string;
  search: string;
  hash: string;
};

let cachedBrowserLocationSnapshot: BrowserLocationSnapshot | null = null;

function getBrowserLocationSnapshot(): BrowserLocationSnapshot {
  const nextSnapshot = {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
  if (
    cachedBrowserLocationSnapshot &&
    cachedBrowserLocationSnapshot.pathname === nextSnapshot.pathname &&
    cachedBrowserLocationSnapshot.search === nextSnapshot.search &&
    cachedBrowserLocationSnapshot.hash === nextSnapshot.hash
  ) {
    return cachedBrowserLocationSnapshot;
  }
  cachedBrowserLocationSnapshot = nextSnapshot;
  return nextSnapshot;
}

function subscribeToBrowserLocation(onStoreChange: () => void) {
  const historyState = window.history as History & {
    __toshoRoutesPatched?: boolean;
    __toshoPushState?: History["pushState"];
    __toshoReplaceState?: History["replaceState"];
  };

  if (!historyState.__toshoRoutesPatched) {
    historyState.__toshoRoutesPatched = true;
    historyState.__toshoPushState = window.history.pushState.bind(window.history);
    historyState.__toshoReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function (...args) {
      const result = historyState.__toshoPushState!.apply(this, args);
      window.dispatchEvent(new Event("tosho:browser-location-change"));
      return result;
    };

    window.history.replaceState = function (...args) {
      const result = historyState.__toshoReplaceState!.apply(this, args);
      window.dispatchEvent(new Event("tosho:browser-location-change"));
      return result;
    };
  }

  const handleChange = () => onStoreChange();
  window.addEventListener("popstate", handleChange);
  window.addEventListener("tosho:browser-location-change", handleChange);
  return () => {
    window.removeEventListener("popstate", handleChange);
    window.removeEventListener("tosho:browser-location-change", handleChange);
  };
}

function AppRoutes() {
  const { session, loading, accessRole, jobRole, permissions } = useAuth();
  const browserLocation = useSyncExternalStore(
    subscribeToBrowserLocation,
    getBrowserLocationSnapshot,
    () => ({ pathname: "/", search: "", hash: "" })
  );
  return (
    <Routes location={browserLocation}>
      {/* public */}
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/reset-password"
        element={
          <RouteSuspense>
            <ResetPasswordPage />
          </RouteSuspense>
        }
      />
      <Route
        path="/update-password"
        element={
          <RouteSuspense>
            <UpdatePasswordPage />
          </RouteSuspense>
        }
      />
      {/* --- ВИПРАВЛЕНО: Інвайт тепер "публічний" (має свій лейаут всередині) --- */}
      <Route
        path="/invite"
        element={
          <RouteSuspense>
            <InvitePage />
          </RouteSuspense>
        }
      />

      <Route element={<ProtectedAppLayout session={session} loading={loading} />}>
        <Route
          path="notifications"
          element={
            <RouteSuspense shell>
              <NotificationsPage />
            </RouteSuspense>
          }
        />
        <Route
          path="activity"
          element={
            <RouteSuspense shell>
              <ActivityPage />
            </RouteSuspense>
          }
        />
        <Route
          path="overview"
          element={
            <RouteSuspense shell>
              <OverviewPage />
            </RouteSuspense>
          }
        />
        <Route
          path="orders/customers"
          element={
            <RouteSuspense shell>
              <OrdersCustomersPage />
            </RouteSuspense>
          }
        />
        <Route
          path="orders/estimates"
          element={
            <RouteSuspense shell>
              <OrdersEstimatesPage />
            </RouteSuspense>
          }
        />
        <Route
          path="orders/estimates/:id"
          element={
            <RouteSuspense shell>
              <OrdersEstimateDetailsPage />
            </RouteSuspense>
          }
        />
        <Route
          path="orders/production"
          element={
            <RouteSuspense shell>
              <OrdersProductionPage />
            </RouteSuspense>
          }
        />
        <Route
          path="orders/production/:id"
          element={
            <RouteSuspense shell>
              <OrdersProductionDetailsRoutePage />
            </RouteSuspense>
          }
        />
        <Route
          path="orders/ready-to-ship"
          element={
            <RouteSuspense shell>
              <OrdersReadyToShipPage />
            </RouteSuspense>
          }
        />
        <Route
          path="catalog/products"
          element={
            <RouteSuspense shell>
              <ProductCatalogPage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/invoices"
          element={
            <RouteSuspense shell>
              <FinanceInvoicesPage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/expense-invoices"
          element={
            <RouteSuspense shell>
              <FinanceExpenseInvoicesPage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/acts"
          element={
            <RouteSuspense shell>
              <FinanceActsPage />
            </RouteSuspense>
          }
        />
        <Route
          path="logistics"
          element={
            <RouteSuspense shell>
              <LogisticsPage />
            </RouteSuspense>
          }
        />
        <Route
          path="design"
          element={
            <RouteSuspense shell>
              <DesignPage />
            </RouteSuspense>
          }
        />
        <Route
          path="design/:id"
          element={
            <RouteSuspense shell>
              <DesignTaskPage />
            </RouteSuspense>
          }
        />
        <Route
          path="contractors"
          element={
            <RouteSuspense shell>
              <ContractorsPage />
            </RouteSuspense>
          }
        />
        <Route
          path="settings/members"
          element={
            <TeamMembersRouteGate
              accessRole={accessRole}
              jobRole={jobRole}
              canEditMemberRoles={permissions.canEditMemberRoles}
            >
              <RouteSuspense shell>
                <TeamMembersPage />
              </RouteSuspense>
            </TeamMembersRouteGate>
          }
        />
        <Route
          path="finance"
          element={
            <RouteSuspense shell>
              <FinancePage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/transactions/new"
          element={
            <RouteSuspense shell>
              <FinanceTransactionCreatePage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/invoices/new"
          element={
            <RouteSuspense shell>
              <FinanceInvoiceCreatePage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/pools/new"
          element={
            <RouteSuspense shell>
              <FinancePoolCreatePage />
            </RouteSuspense>
          }
        />
        <Route
          path="finance/pools/:id"
          element={
            <RouteSuspense shell>
              <FinancePoolDetailsPage />
            </RouteSuspense>
          }
        />
        <Route
          path="profile"
          element={
            <RouteSuspense shell>
              <ProfilePage />
            </RouteSuspense>
          }
        />
        <Route
          path="admin"
          element={
            <RouteSuspense shell>
              <AdminPage />
            </RouteSuspense>
          }
        />
        <Route
          path="admin/observability"
          element={
            <PermissionGate
              allowed={permissions.isSuperAdmin || permissions.isAdmin}
              requirement="access_role: owner/admin"
              accessRole={accessRole}
              jobRole={jobRole}
            >
              <RouteSuspense shell>
                <AdminObservabilityPage />
              </RouteSuspense>
            </PermissionGate>
          }
        />
        <Route
          path="admin/runtime-errors"
          element={
            <RuntimeErrorsRouteGate
              accessRole={accessRole}
              jobRole={jobRole}
              isSuperAdmin={permissions.isSuperAdmin}
            >
              <RouteSuspense shell>
                <RuntimeErrorsPage />
              </RouteSuspense>
            </RuntimeErrorsRouteGate>
          }
        />
      </Route>

      {/* Default */}
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.lang = "uk";
    document.documentElement.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");
    document.body.setAttribute("translate", "no");
    document.body.classList.add("notranslate");
  }, []);

  useEffect(() => {
    migrateAndPruneSessionCaches();
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportRuntimeError({ error: event.reason, source: "unhandledrejection" });
      if (!isChunkLikeError(event.reason)) return;
      event.preventDefault();
      reloadOnceForChunkError();
    };

    const handleWindowError = (event: ErrorEvent) => {
      const error = event.error ?? event.message;
      if (isIgnorableWindowError(error)) {
        event.preventDefault();
        return;
      }
      reportRuntimeError({ error, source: "window_error" });
      if (!isChunkLikeError(error)) return;
      reloadOnceForChunkError();
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRuntimeBoundary>
        <AppRoutes />
      </AppRuntimeBoundary>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}
