// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./lib/supabaseClient";

// === ІМПОРТУЄМО НОВУ СТОРІНКУ ЗАПРОШЕНЬ ===
import InvitePage from "./pages/InvitePage"; // <--- ДОДАЛИ ІМПОРТ

import { AuthProvider } from "@/auth/AuthProvider"; 
import { TeamMembersPage } from "./pages/TeamMembersPage";
import { Toaster } from "@/components/ui/sonner";
import { AdminPage } from "./pages/AdminPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PlayersAdminPage } from "./pages/PlayersAdminPage";
import { MatchEventsAdminPage } from "./pages/MatchEventsAdminPage";
import { TournamentsAdminPage } from "./pages/TournamentsAdminPage";
import { StatsPage } from "./pages/StatsPage";
import { PlayerPage } from "./pages/PlayerPage";
import { MatchDetailsPage } from "./pages/MatchDetailsPage";
import { TrainingsListPage } from "./pages/AdminTrainings/TrainingsListPage";
import { TrainingCreatePage } from "./pages/AdminTrainings/TrainingCreatePage";
import { TrainingDetailPage } from "./pages/AdminTrainings/TrainingDetailPage";
import { TrainingsAnalyticsPage } from "./pages/AdminTrainings/TrainingsAnalyticsPage";
import { MatchesShadcnPage } from "@/pages/MatchesShadcnPage";
import { AppLayout } from "@/layout/AppLayout";
import { CreateMatchPage } from "./pages/CreateMatchPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TournamentDetailsPage } from "./pages/TournamentDetailsPage";
import { FinancePage } from "./pages/FinancePage";
import { FinanceTransactionCreatePage } from "./pages/FinanceTransactionCreatePage";
import { FinanceInvoiceCreatePage } from "./pages/FinanceInvoiceCreatePage";
import { FinancePoolCreatePage } from "./pages/FinancePoolCreatePage";
import { FinancePoolDetailsPage } from "./pages/FinancePoolDetailsPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UpdatePasswordPage from "./pages/UpdatePasswordPage";
import NotificationsPage from "./pages/NotificationsPage";
import ActivityPage from "./pages/ActivityPage";

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

function Spinner({ label = "Завантаження..." }: { label?: string }) {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>{label}</span>
      </div>
    </div>
  );
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

  if (loading) return <Spinner label="Перевіряю сесію..." />;

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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[var(--btn-radius)] bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Увійти"}
          </button>
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
function AppRoutes() {
  const { session, team, loading } = useAuthAndTeam();

  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />
      <Route
        path="/notifications"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <NotificationsPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/activity"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <ActivityPage />
            </AppLayout>
          </RequireAuth>
        }
      />

      {/* --- ВИПРАВЛЕНО: Інвайт тепер "публічний" (має свій лейаут всередині) --- */}
      <Route path="/invite" element={<InvitePage />} />

      {/* Overview */}
      <Route
        path="/overview"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <OverviewPage />
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
              <MatchesShadcnPage />
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
              <MatchDetailsPage />
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
                <MatchEventsAdminPage />
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
                <CreateMatchPage />
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
              <TrainingsListPage />
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
                <TrainingCreatePage />
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
              <TrainingDetailPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/trainings/analytics"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <TrainingsAnalyticsPage />
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
              <PlayersAdminPage />
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
                <TeamMembersPage />
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
              <PlayerPage />
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
              <TournamentsAdminPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/tournaments/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <TournamentDetailsPage />
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
              <StatsPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/analytics/team"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <StatsPage />
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
              <FinancePage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/transactions/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <FinanceTransactionCreatePage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/invoices/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <FinanceInvoiceCreatePage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/pools/new"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <FinancePoolCreatePage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance/pools/:id"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <FinancePoolDetailsPage />
            </AppLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/profile"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <ProfilePage />
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
              <AdminPage />
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
      <AppRoutes />
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}
