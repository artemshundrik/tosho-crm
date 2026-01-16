// src/App.tsx
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
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
import { AuthProvider } from "@/auth/AuthProvider"; 
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/layout/AppLayout";
import { PageSkeleton } from "@/components/ui/page-skeleton";

// =======================
// Types
// =======================
type TeamRole = "super_admin" | "manager" | "viewer" | null;

type TeamContext = {
  teamId: string | null;
  role: TeamRole;
};

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
const PlayersAdminPage = lazy(() =>
  import("./pages/PlayersAdminPage").then((module) => ({ default: module.PlayersAdminPage }))
);
const MatchEventsAdminPage = lazy(() =>
  import("./pages/MatchEventsAdminPage").then((module) => ({ default: module.MatchEventsAdminPage }))
);
const TournamentsAdminPage = lazy(() =>
  import("./pages/TournamentsAdminPage").then((module) => ({ default: module.TournamentsAdminPage }))
);
const StatsPage = lazy(() =>
  import("./pages/StatsPage").then((module) => ({ default: module.StatsPage }))
);
const PlayerPage = lazy(() =>
  import("./pages/PlayerPage").then((module) => ({ default: module.PlayerPage }))
);
const MatchDetailsPage = lazy(() =>
  import("./pages/MatchDetailsPage").then((module) => ({ default: module.MatchDetailsPage }))
);
const TrainingsListPage = lazy(() =>
  import("./pages/AdminTrainings/TrainingsListPage").then((module) => ({
    default: module.TrainingsListPage,
  }))
);
const TrainingCreatePage = lazy(() =>
  import("./pages/AdminTrainings/TrainingCreatePage").then((module) => ({
    default: module.TrainingCreatePage,
  }))
);
const TrainingDetailPage = lazy(() =>
  import("./pages/AdminTrainings/TrainingDetailPage").then((module) => ({
    default: module.TrainingDetailPage,
  }))
);
const TrainingsAnalyticsPage = lazy(() =>
  import("./pages/AdminTrainings/TrainingsAnalyticsPage").then((module) => ({
    default: module.TrainingsAnalyticsPage,
  }))
);
const MatchesShadcnPage = lazy(() =>
  import("./pages/MatchesShadcnPage").then((module) => ({ default: module.MatchesShadcnPage }))
);
const CreateMatchPage = lazy(() =>
  import("./pages/CreateMatchPage").then((module) => ({ default: module.CreateMatchPage }))
);
const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage }))
);
const TournamentDetailsPage = lazy(() =>
  import("./pages/TournamentDetailsPage").then((module) => ({
    default: module.TournamentDetailsPage,
  }))
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
const TournamentImportLabPage = lazy(() => import("./pages/dev/TournamentImportLabPage"));
const TournamentStandingsImportPage = lazy(() => import("./pages/dev/TournamentStandingsImportPage"));

function RouteSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

// =======================
// Auth + Team context hook
// =======================
function useAuthAndTeam() {
  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<TeamContext>({ teamId: null, role: null });
  const [loading, setLoading] = useState(true);

  const refreshTeamContext = useMemo(() => {
    return async () => {
      const s = (await supabase.auth.getSession()).data.session;
      if (!s) {
        setTeam({ teamId: null, role: null });
        return;
      }

      const [{ data: teamId, error: e1 }, { data: role, error: e2 }] = await Promise.all([
        supabase.rpc("current_team_id"),
        supabase.rpc("current_team_role"),
      ]);

      if (e1 || e2) {
        console.error("Failed to load team context:", e1 ?? e2);
        setTeam({ teamId: null, role: null });
        return;
      }

      setTeam({
        teamId: (teamId as string | null) ?? null,
        role: (role as TeamRole) ?? null,
      });
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("⚠️ Auth took too long - releasing UI");
        setLoading(false);
      }
    }, 1500);

    const init = async () => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        
        setSession(session);

        if (session) {
          refreshTeamContext().finally(() => {
             if (mounted) setLoading(false);
          });
        } else {
          setTeam({ teamId: null, role: null });
          if (mounted) setLoading(false);
        }
      });

      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data.session) {
           setSession(data.session);
           await refreshTeamContext();
           if (mounted) setLoading(false);
        }
      } catch (err) {
        console.error("Session check error", err);
      }
      
      return subscription;
    };

    let sub: any;
    init().then(s => sub = s);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      if (sub) sub.unsubscribe();
    };
  }, [refreshTeamContext]);
  return { session, team, loading, refreshTeamContext };
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

  if (loading) return <PageSkeleton />;

  if (!session) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${redirect}`} replace />;
  }

  return <>{children}</>;
}

function RoleGate({
  allow,
  role,
  children,
}: {
  allow: Array<Exclude<TeamRole, null>>;
  role: TeamRole;
  children: React.ReactNode;
}) {
  if (!role) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="font-semibold">Немає ролі в команді</div>
          <div className="text-muted-foreground mt-1">
            Або ти ще не доданий у <code className="px-1 py-0.5 rounded bg-muted">team_members</code>,
            або не вибрано команду/контекст.
          </div>
          <div className="text-muted-foreground mt-1">
            Відкрий сторінку інвайту або додай себе в <code className="px-1 py-0.5 rounded bg-muted">team_members</code>.
          </div>
        </div>
      </div>
    );
  }

  if (!allow.includes(role as Exclude<TeamRole, null>)) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="font-semibold">Немає доступу</div>
          <div className="text-muted-foreground mt-1">
            Твоя роль: <code className="px-1 py-0.5 rounded bg-muted">{role}</code>
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
            {isInviteFlow ? "Вхід за інвайтом" : "Вхід у FAYNA TEAM"}
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
              <input
                className="mt-1.5 w-full rounded-[var(--radius-lg)] border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
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
  const { session, team, loading } = useAuthAndTeam();

  return (
    <Routes>
      {/* public */}
      {import.meta.env.DEV ? (
        <>
      <Route
        path="/dev/tournament-import-lab"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TournamentImportLabPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/dev/tournament-standings"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TournamentStandingsImportPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
        </>
      ) : null}
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
              <RouteSuspense>
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
              <RouteSuspense>
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

      {/* Overview */}
      <Route
        path="/overview"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <OverviewPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Матчі */}
      <Route
        path="/matches-shadcn"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <MatchesShadcnPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Деталі матчу */}
      <Route
        path="/matches/:matchId"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <MatchDetailsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Події матчу (manager/super_admin) */}
      <Route
        path="/matches/:matchId/events"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RoleGate allow={["super_admin", "manager"]} role={team.role}>
                <RouteSuspense>
                  <MatchEventsAdminPage />
                </RouteSuspense>
              </RoleGate>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Створення матчу (manager/super_admin) */}
      <Route
        path="/matches/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RoleGate allow={["super_admin", "manager"]} role={team.role}>
                <RouteSuspense>
                  <CreateMatchPage />
                </RouteSuspense>
              </RoleGate>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Trainings */}
      <Route
        path="/admin/trainings"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TrainingsListPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/trainings/create"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RoleGate allow={["super_admin", "manager"]} role={team.role}>
                <RouteSuspense>
                  <TrainingCreatePage />
                </RouteSuspense>
              </RoleGate>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/trainings/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TrainingDetailPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/trainings/analytics"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TrainingsAnalyticsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Players */}
      <Route
        path="/admin/players"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <PlayersAdminPage />
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
              <RoleGate allow={["super_admin"]} role={team.role}>
                <RouteSuspense>
                  <TeamMembersPage />
                </RouteSuspense>
              </RoleGate>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/player/:playerId"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <PlayerPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Tournaments */}
      <Route
        path="/admin/tournaments"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TournamentsAdminPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/tournaments/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <TournamentDetailsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* Analytics */}
      <Route
        path="/analytics/players"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <StatsPage />
              </RouteSuspense>
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/analytics/team"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <RouteSuspense>
                <StatsPage />
              </RouteSuspense>
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
              <RouteSuspense>
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
              <RouteSuspense>
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
              <RouteSuspense>
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
              <RouteSuspense>
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
              <RouteSuspense>
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
              <RouteSuspense>
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
              <RouteSuspense>
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
