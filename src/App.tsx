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
import { useAuth } from "@/auth/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { AppLayout } from "@/layout/AppLayout";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { AppShell } from "@/components/app/AppShell";
import { OverviewPage } from "@/pages/OverviewPage";

// =======================
// Helpers UI
// =======================
function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function lazyWithRetry<T extends { default: React.ComponentType<any> }>(
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
const ResetPasswordPage = lazyWithRetry(() => import("./pages/ResetPasswordPage"));
const UpdatePasswordPage = lazyWithRetry(() => import("./pages/UpdatePasswordPage"));
const NotificationsPage = lazyWithRetry(() => import("./pages/NotificationsPage"));
const ActivityPage = lazyWithRetry(() => import("./pages/ActivityPage"));

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
const DOM_RECOVERY_RELOAD_GUARD_KEY = "app_dom_recovery_reload_once";

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

function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1") {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

function reloadOnceForDomError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(DOM_RECOVERY_RELOAD_GUARD_KEY) === "1") {
      return false;
    }
    window.sessionStorage.setItem(DOM_RECOVERY_RELOAD_GUARD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
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
      const reloaded = reloadOnceForDomError();
      if (!reloaded) {
        this.setState({
          hasError: true,
          message:
            "Сталася тимчасова помилка DOM. Оновіть сторінку та вимкніть розширення перекладу/інʼєкції сторінки для цього сайту.",
        });
      }
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
            <PermissionGate
              allowed={permissions.canManageMembers}
              requirement="access_role: owner або access_role: admin, або job_role: seo"
              accessRole={accessRole}
              jobRole={jobRole}
            >
              <RouteSuspense shell>
                <TeamMembersPage />
              </RouteSuspense>
            </PermissionGate>
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
      </Route>

      {/* Default */}
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
      window.sessionStorage.removeItem(DOM_RECOVERY_RELOAD_GUARD_KEY);
    } catch {
      // ignore sessionStorage access issues
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLikeError(event.reason)) return;
      event.preventDefault();
      reloadOnceForChunkError();
    };

    const handleWindowError = (event: ErrorEvent) => {
      if (!isChunkLikeError(event.error ?? event.message)) return;
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
