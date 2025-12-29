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

// === ВИПРАВЛЕННЯ: Імпортуємо єдиний екземпляр клієнта ===
import { supabase } from "./lib/supabaseClient";

// === твої сторінки ===
import { AuthProvider } from "@/auth/AuthProvider"; // Перевір шлях!
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
import { DesignSystemPage } from "./pages/DesignSystemPage";
import { MatchesShadcnPage } from "@/pages/MatchesShadcnPage";
import PlaygroundPage from "./pages/PlaygroundPage";
import { AppLayout } from "@/layout/AppLayout";
import { CreateMatchPage } from "./pages/CreateMatchPage";
import { OverviewPage } from "./pages/OverviewPage";
import { TournamentDetailsPage } from "./pages/TournamentDetailsPage";
import { FinancePage } from "./pages/FinancePage";

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
      // якщо нема сесії — контекст порожній
      const s = (await supabase.auth.getSession()).data.session;
      if (!s) {
        setTeam({ teamId: null, role: null });
        return;
      }

      // RPC з твоєї бази
      const [{ data: teamId, error: e1 }, { data: role, error: e2 }] = await Promise.all([
        supabase.rpc("current_team_id"),
        supabase.rpc("current_team_role"),
      ]);

      if (e1 || e2) {
        // eslint-disable-next-line no-console
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

  // src/App.tsx -> всередині useAuthAndTeam

// src/App.tsx -> всередині useAuthAndTeam

  useEffect(() => {
    let mounted = true;

    // 1. Таймер безпеки (скоротили до 1.5с)
    // Якщо Supabase "затупить", ми просто покажемо інтерфейс.
    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("⚠️ Auth took too long - releasing UI");
        setLoading(false);
      }
    }, 1500);

    const init = async () => {
      // 2. Слухаємо зміни стану (Це працює надійніше при перезагрузці)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        
        setSession(session);

        if (session) {
          // Якщо є юзер - підтягуємо команду у фоні
          refreshTeamContext().finally(() => {
             // Вимикаємо лоадер, коли підтягнули команду
             if (mounted) setLoading(false);
          });
        } else {
          // Якщо юзера немає - відразу вимикаємо лоадер
          setTeam({ teamId: null, role: null });
          if (mounted) setLoading(false);
        }
      });

      // 3. Додаткова перевірка (getSession), але ми на неї не блокуємось жорстко
      // Це потрібно для першого рендеру, якщо onAuthStateChange не стрельне миттєво
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted && data.session) {
           // Якщо сесія вже є, записуємо її, щоб не чекати події
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
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const next = params.get("next") ? decodeURIComponent(params.get("next") as string) : "/overview";

  const [mode, setMode] = useState<"password" | "magic">("password");
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

      // magic link
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // IMPORTANT: в Supabase Auth settings має бути дозволений redirect
          emailRedirectTo: `${window.location.origin}/overview`,
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
    <div className="min-h-screen w-full flex items-center justify-center bg-[linear-gradient(135deg,_#f7f9fc_0%,_#eef1f6_50%,_#f7f9fc_100%)] p-6">
      <div className="w-full max-w-md rounded-[28px] border bg-white shadow-sm p-6">
        <div className="mb-5">
          <div className="text-xl font-extrabold">Вхід у FAYNA TEAM</div>
          <div className="text-sm text-muted-foreground mt-1">
            Увійди, щоб бачити матчі, тренування й фінанси (як дозволяє роль).
          </div>
        </div>

        {(error || msg) && (
          <div
            className={cx(
              "mb-4 rounded-xl border p-3 text-sm",
              error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            )}
          >
            <div className="font-semibold">{error ? "Помилка" : "Ок"}</div>
            <div className="mt-0.5">{error ?? msg}</div>
          </div>
        )}

        <div className="mb-4 inline-flex rounded-xl bg-muted p-1">
          <button
            type="button"
            className={cx(
              "px-3 py-1.5 rounded-lg text-sm transition",
              mode === "magic" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
            onClick={() => setMode("magic")}
          >
            Magic link
          </button>
          <button
            type="button"
            className={cx(
              "px-3 py-1.5 rounded-lg text-sm transition",
              mode === "password" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
            onClick={() => setMode("password")}
          >
            Пароль
          </button>
        </div>

        <form onSubmit={onLogin} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
            />
          </div>

          {mode === "password" && (
            <div>
              <label className="text-sm font-medium">Пароль</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
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
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "..." : "Увійти"}
          </button>
        </form>

        <div className="mt-4 text-xs text-muted-foreground">
          Для інвайтів: <Link className="underline" to="/invite">перейти до /invite</Link>
        </div>
      </div>
    </div>
  );
}

// =======================
// Invite (MVP link)
// =======================
function InvitePage({ teamId, role }: { teamId: string | null; role: TeamRole }) {
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);

  const initialTeamId = params.get("team_id") || teamId || "";
  const initialRole = (params.get("role") as TeamRole) || "viewer";

  const [inviteTeamId, setInviteTeamId] = useState(initialTeamId);
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, null>>(
    (initialRole as Exclude<TeamRole, null>) || "viewer"
  );

  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const link = useMemo(() => {
    const u = new URL(window.location.origin);
    u.pathname = "/invite";
    u.searchParams.set("team_id", inviteTeamId || "");
    u.searchParams.set("role", inviteRole);
    return u.toString();
  }, [inviteTeamId, inviteRole]);

  async function copy() {
    setErr(null);
    setStatus(null);
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Скопійовано. Скинь цей лінк людині — вона залогіниться й натисне “Приєднатися”.");
    } catch {
      setErr("Не вдалося скопіювати. Скопіюй вручну.");
    }
  }

  async function join() {
    setErr(null);
    setStatus(null);

    const team_id = params.get("team_id");
    const joinRole = (params.get("role") as Exclude<TeamRole, null>) || "viewer";

    if (!team_id) {
      setErr("Немає team_id в URL. Відкрий інвайт-лінк із team_id.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const s = data.session;

    if (!s?.user?.id) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
      return;
    }

    // MVP: прямий upsert у team_members
    // IMPORTANT: RLS має дозволяти insert/upsert (або тимчасово вимкнено).
    const { error } = await supabase
      .from("team_members")
      .upsert(
        { team_id, user_id: s.user.id, role: joinRole },
        { onConflict: "team_id,user_id" }
      );

    if (error) {
      setErr(error.message);
      return;
    }

    setStatus("Готово! Ти в команді. Перекидаю на overview…");
    setTimeout(() => navigate("/overview", { replace: true }), 600);
  }

  const canInvite = role === "super_admin" || role === "manager";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-5">
        <div className="text-lg font-extrabold">Інвайт у команду (MVP)</div>
        <div className="text-sm text-muted-foreground mt-1">
          Генерує лінк із <code className="px-1 py-0.5 rounded bg-muted">team_id</code> та <code className="px-1 py-0.5 rounded bg-muted">role</code>.
        </div>

        {(err || status) && (
          <div
            className={cx(
              "mt-4 rounded-xl border p-3 text-sm",
              err ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            )}
          >
            <div className="font-semibold">{err ? "Помилка" : "Ок"}</div>
            <div className="mt-0.5">{err ?? status}</div>
          </div>
        )}

        <div className="mt-5 grid gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Team ID</label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={inviteTeamId}
              onChange={(e) => setInviteTeamId(e.target.value)}
              placeholder="uuid…"
              disabled={!canInvite}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium">Роль</label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Exclude<TeamRole, null>)}
              disabled={!canInvite}
            >
              <option value="viewer">viewer</option>
              <option value="manager">manager</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium">Лінк</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
                value={link}
                readOnly
              />
              <button
                className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-muted"
                onClick={copy}
                disabled={!canInvite}
                type="button"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-between mt-2">
            <div className="text-xs text-muted-foreground">
              Твоя роль зараз: <code className="px-1 py-0.5 rounded bg-muted">{String(role)}</code>
            </div>

            <button
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
              onClick={join}
              type="button"
            >
              Приєднатися по інвайту
            </button>
          </div>

          {!canInvite && (
            <div className="text-xs text-muted-foreground">
              Генерувати інвайти можуть тільки <b>super_admin</b> або <b>manager</b>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =======================
// App routes
// =======================
function AppRoutes() {
  const { session, team, loading } = useAuthAndTeam();

  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<LoginPage />} />

      {/* protected invite (щоб бачити team_id/роль в інтерфейсі), але join працює і з /invite?team_id=... */}
      <Route
        path="/invite"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <InvitePage teamId={team.teamId} role={team.role} />
            </AppLayout>
          </RequireAuth>
        }
      />

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
        {/* Тільки адміни можуть заходити сюди */}
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

      {/* Dev pages */}
      <Route
        path="/design-system"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <DesignSystemPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/playground"
        element={
          <RequireAuth session={session} loading={loading}>
            <AppLayout>
              <PlaygroundPage />
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
      <Toaster position="top-center" /> {/* <-- Додали тут */}
    </BrowserRouter>
  );
}