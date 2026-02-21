// src/App.tsx
import { Suspense, lazy, useEffect, useState } from "react";
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

// =======================
// Helpers UI
// =======================
function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const InvitePage = lazy(() => import("./pages/InvitePage"));
const TeamMembersPage = lazy(() =>
  import("./pages/TeamMembersPage").then((module) => ({ default: module.TeamMembersPage }))
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((module) => ({ default: module.ProfilePage }))
);
const OrdersEstimatesPage = lazy(() => import("./pages/OrdersEstimatesPage"));
const OrdersCustomersPage = lazy(() => import("./pages/OrdersCustomersPage"));
const OrdersEstimateDetailsPage = lazy(() => import("./pages/OrdersEstimateDetailsPage"));
const ProductCatalogPage = lazy(() => import("./features/catalog/ProductCatalogPage"));
const OrdersProductionPage = lazy(() => import("./pages/OrdersProductionPage"));
const OrdersReadyToShipPage = lazy(() => import("./pages/OrdersReadyToShipPage"));
const FinanceInvoicesPage = lazy(() => import("./pages/FinanceInvoicesPage"));
const FinanceExpenseInvoicesPage = lazy(() => import("./pages/FinanceExpenseInvoicesPage"));
const FinanceActsPage = lazy(() => import("./pages/FinanceActsPage"));
const LogisticsPage = lazy(() => import("./pages/LogisticsPage"));
const DesignPage = lazy(() => import("./pages/DesignPage"));
const DesignTaskPage = lazy(() => import("./pages/DesignTaskPage"));
const ContractorsPage = lazy(() => import("./pages/ContractorsPage"));
const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage }))
);
const FinancePage = lazy(() =>
  import("./pages/FinancePage").then((module) => ({ default: module.FinancePage }))
);
const FinanceTransactionCreatePage = lazy(() =>
  import("./pages/FinanceTransactionCreatePage").then((module) => ({
    default: module.FinanceTransactionCreatePage,
  }))
);
const FinanceInvoiceCreatePage = lazy(() =>
  import("./pages/FinanceInvoiceCreatePage").then((module) => ({
    default: module.FinanceInvoiceCreatePage,
  }))
);
const FinancePoolCreatePage = lazy(() =>
  import("./pages/FinancePoolCreatePage").then((module) => ({
    default: module.FinancePoolCreatePage,
  }))
);
const FinancePoolDetailsPage = lazy(() =>
  import("./pages/FinancePoolDetailsPage").then((module) => ({
    default: module.FinancePoolDetailsPage,
  }))
);
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const UpdatePasswordPage = lazy(() => import("./pages/UpdatePasswordPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));

function RouteSuspense({
  children,
  shell = false,
}: {
  children: React.ReactNode;
  shell?: boolean;
}) {
  return <Suspense fallback={shell ? <AppShell /> : <PageSkeleton />}>{children}</Suspense>;
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

function AppRoutes() {
  const { session, loading, accessRole, jobRole, permissions } = useAuth();
  const location = useLocation();




  return (
    <Routes location={location}>
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
      <Route
        path="/notifications"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <NotificationsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/activity"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <ActivityPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
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

      {/* Orders */}
      <Route
        path="/overview"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <OverviewPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/orders/customers"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <OrdersCustomersPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/orders/estimates"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <OrdersEstimatesPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/orders/estimates/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <OrdersEstimateDetailsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/orders/production"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <OrdersProductionPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/orders/ready-to-ship"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <OrdersReadyToShipPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/catalog/products"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <ProductCatalogPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Finance */}
      <Route
        path="/finance/invoices"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinanceInvoicesPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/expense-invoices"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinanceExpenseInvoicesPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/acts"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinanceActsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Logistics / Design / Contractors */}
      <Route
        path="/logistics"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <LogisticsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/design"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <DesignPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/design/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <DesignTaskPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/contractors"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <ContractorsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/settings/members"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <PermissionGate
                allowed={permissions.canEditMemberRoles}
                requirement="access_role: owner"
                accessRole={accessRole}
                jobRole={jobRole}
              >
                <RouteSuspense shell>
                  <TeamMembersPage />
                </RouteSuspense>
              </PermissionGate>
            </AppLayout>
          </RequireAuth>
        }
      />
      {/* Finance (viewer read-only ок) */}
      <Route
        path="/finance"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinancePage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/transactions/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinanceTransactionCreatePage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/invoices/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinanceInvoiceCreatePage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/pools/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinancePoolCreatePage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/pools/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <FinancePoolDetailsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/profile"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <ProfilePage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Legacy admin page (якщо треба) */}
      <Route
        path="/admin"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense shell>
                <AdminPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Default */}
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppRoutes />
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}
