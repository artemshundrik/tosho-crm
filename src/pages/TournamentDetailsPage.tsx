// src/pages/TournamentDetailsPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { usePageCache } from "@/hooks/usePageCache";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Minus, Trophy } from "lucide-react";
import { StandingsPreviewModal } from "@/features/standingsImport/StandingsPreviewModal";
import { StandingsUpdatePanel } from "@/features/standingsImport/StandingsUpdatePanel";
import { useStandingsPreview } from "@/features/standingsImport/useStandingsPreview";
import { formatUpdatedAgo, type StandingsRowView } from "@/features/standingsImport/standingsUtils";

/* ================= TYPES ================= */

type Tournament = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  league_name: string | null;
  age_group: string | null;
  external_url: string | null;
  logo_url: string | null;
};

type TeamTournamentRow = {
  is_primary: boolean;
  tournament: Tournament | null;
};

type MatchStatus = "scheduled" | "played" | "canceled";

type MatchRow = {
  id: string;
  opponent_name: string;
  match_date: string;
  status: MatchStatus;
  score_team: number | null;
  score_opponent: number | null;
  home_away: "home" | "away" | "neutral";
  opponent_logo_url?: string | null;
  tournament_id: string | null;
  stage: string | null;
  matchday: number | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  photo_url: string | null;
  status: "active" | "injured" | "sick" | "away" | "inactive"; // Додано
};

type StandingsRow = StandingsRowView & {
  updated_at: string | null;
  position_delta: number | null;
};

type TournamentFormState = {
  name: string;
  short_name: string;
  season: string;
  league_name: string;
  age_group: string;
  external_url: string;
  logo_url: string;
  is_primary: boolean;
};

type TournamentDetailsCache = {
  tRow: TeamTournamentRow | null;
  matches: MatchRow[];
  players: Player[];
  registeredIds: string[];
};

/* ================= CONFIG ================= */

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const EMPTY_FORM: TournamentFormState = {
  name: "",
  short_name: "",
  season: "",
  league_name: "",
  age_group: "",
  external_url: "",
  logo_url: "",
  is_primary: false,
};

/* ================= HELPERS ================= */

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

function matchStatusBadge(
  status: MatchStatus,
  scoreTeam: number | null,
  scoreOpp: number | null
) {
  if (status === "scheduled") return <Badge variant="secondary">Запланований</Badge>;
  if (status === "canceled") return <Badge variant="outline">Скасований</Badge>;
  if (scoreTeam == null || scoreOpp == null) return <Badge variant="secondary">Зіграний</Badge>;
  if (scoreTeam > scoreOpp) return <Badge variant="default">Перемога</Badge>;
  if (scoreTeam < scoreOpp) return <Badge variant="destructive">Поразка</Badge>;
  return <Badge variant="secondary">Нічия</Badge>;
}

function playerInitials(firstName: string, lastName: string) {
  return `${(firstName || "")[0] ?? ""}${(lastName || "")[0] ?? ""}`.trim().toUpperCase() || "•";
}

function normalizeNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function PlayerAvatar({ player, size = 36 }: { player: Player; size?: number }) {
  const initials = playerInitials(player.first_name, player.last_name);
  // Перевірка наявності обмежень
  const isUnavailable = player.status === 'injured' || player.status === 'sick' || player.status === 'away';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={cn(
          "grid h-full w-full place-items-center overflow-hidden rounded-full bg-muted ring-1 ring-border",
          isUnavailable && "opacity-60 grayscale-[0.5]"
        )}
        title={`${player.last_name} ${player.first_name}`.trim()}
      >
        {player.photo_url ? (
          <img src={player.photo_url} alt={player.last_name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">{initials}</span>
        )}
      </div>
      
      {/* Пульсуючий індикатор для будь-якого статусу, крім активного */}
      {player.status !== 'active' && (
        <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive animate-pulse shadow-sm" />
      )}
    </div>
  );
}

/* ================= PAGE ================= */

export function TournamentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const cacheKey = id ? `tournament-details:${id}` : "tournament-details:unknown";
  const { cached, setCache } = usePageCache<TournamentDetailsCache>(cacheKey);
  
  // Перевіряємо наявність кешу - важливо перевіряти кожен раз
  const hasCache = Boolean(cached);

  const [loading, setLoading] = useState(!hasCache);
  const [playersLoading, setPlayersLoading] = useState(!hasCache);
  
  // Оновлюємо loading коли з'являється кеш (важливо для повторних відвідувань)
  useEffect(() => {
    if (hasCache && loading) {
      setLoading(false);
      setPlayersLoading(false);
    }
  }, [hasCache, loading]);
  
  // Показуємо skeleton тільки якщо немає кешу
  const shouldShowSkeleton = loading && !hasCache;
  const [rosterSavingId, setRosterSavingId] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsRows, setStandingsRows] = useState<StandingsRow[]>([]);
  const [standingsUpdatedAt, setStandingsUpdatedAt] = useState<string | null>(null);
  const [standingsModalOpen, setStandingsModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TournamentFormState>(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [tRow, setTRow] = useState<TeamTournamentRow | null>(cached?.tRow ?? null);
  const [matches, setMatches] = useState<MatchRow[]>(cached?.matches ?? []);
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(
    new Set(cached?.registeredIds ?? [])
  );

  const standingsPreview = useStandingsPreview({ tournamentId: id ?? "" });

  const loadStandings = useCallback(async () => {
    if (!id) return;
    setStandingsLoading(true);
    const { data, error } = await supabase
      .from("tournament_standings_current")
      .select("team_name, position, played, points, wins, draws, losses, goals_for, goals_against, logo_url, updated_at")
      .eq("tournament_id", id)
      .order("position", { ascending: true });

    if (error) {
      console.error("Standings load error", error);
      setStandingsRows([]);
      setStandingsUpdatedAt(null);
      setStandingsLoading(false);
      return;
    }

    const { data: runsData, error: runsError } = await supabase
      .from("tournament_standings_runs")
      .select("id, fetched_at")
      .eq("tournament_id", id)
      .order("fetched_at", { ascending: false, nullsFirst: false })
      .limit(2);

    if (runsError) {
      console.error("Standings runs load error", runsError);
    }

    const previousRunId = runsData && runsData.length >= 2 ? runsData[1]?.id : null;
    let previousPositions = new Map<string, number>();

    if (previousRunId) {
      const { data: prevRows, error: prevError } = await supabase
        .from("tournament_standings_rows")
        .select("team_name, position")
        .eq("tournament_id", id)
        .eq("run_id", previousRunId);

      if (prevError) {
        console.error("Standings previous rows load error", prevError);
      } else {
        previousPositions = new Map(
          (prevRows ?? []).map((row) => [row.team_name, row.position as number]),
        );
      }
    }

    const rows = ((data ?? []) as StandingsRow[]).map((row) => {
      const prevPosition = previousPositions.get(row.team_name);
      const delta =
        typeof prevPosition === "number" ? prevPosition - row.position : null;
      return {
        ...row,
        position_delta: delta,
      };
    });
    const latestUpdated = rows.reduce<string | null>((latest, row) => {
      if (!row.updated_at) return latest;
      if (!latest || row.updated_at > latest) return row.updated_at;
      return latest;
    }, null);

    setStandingsRows(rows);
    setStandingsUpdatedAt(latestUpdated);
    setStandingsLoading(false);
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;

      // Завантажуємо тільки якщо немає кешу
      if (!hasCache) {
        setLoading(true);
        setPlayersLoading(true);
      }

      const [
        tournamentRes,
        matchesRes,
        playersRes,
        regRes,
      ] = await Promise.all([
        supabase
          .from("team_tournaments")
          .select(`
            is_primary,
            tournament:tournament_id (
              id,
              name,
              short_name,
              season,
              league_name,
              age_group,
              external_url,
              logo_url
            )
          `)
          .eq("team_id", TEAM_ID)
          .eq("tournament_id", id)
          .maybeSingle(),

        supabase
          .from("matches")
          .select(`
            id,
            opponent_name,
            match_date,
            status,
            score_team,
            score_opponent,
            home_away,
            opponent_logo_url,
            tournament_id,
            stage,
            matchday
          `)
          .eq("team_id", TEAM_ID)
          .eq("tournament_id", id)
          .order("match_date", { ascending: false }),

        supabase
          .from("players")
  .select("id, first_name, last_name, shirt_number, photo_url, status") // Додано status
  .eq("team_id", TEAM_ID)
  .neq("status", "inactive") // ❗ ХОВАЄМО КОЛИШНІХ З ВИБОРУ
  .order("last_name"),

        supabase
          .from("team_tournament_players")
          .select("player_id")
          .eq("team_id", TEAM_ID)
          .eq("tournament_id", id),
      ]);

      if (cancelled) return;

      const row = (tournamentRes.data ?? null) as TeamTournamentRow | null;
      setTRow(row && row.tournament ? row : null);
      setMatches((matchesRes.data ?? []) as MatchRow[]);
      setPlayers((playersRes.data ?? []) as Player[]);
      const nextRegistered = new Set((regRes.data ?? []).map((r) => r.player_id));
      setRegisteredIds(nextRegistered);

      setCache({
        tRow: row && row.tournament ? row : null,
        matches: (matchesRes.data ?? []) as MatchRow[],
        players: (playersRes.data ?? []) as Player[],
        registeredIds: Array.from(nextRegistered),
      });

      setLoading(false);
      setPlayersLoading(false);
    }

    // Завантажуємо тільки якщо немає кешу
    if (!hasCache) {
      load();
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCache, id]);

  useEffect(() => {
    loadStandings();
  }, [loadStandings]);

  const tournament = tRow?.tournament ?? null;

  useEffect(() => {
    if (!tournament) return;
    setDraft({
      name: tournament.name ?? "",
      short_name: tournament.short_name ?? "",
      season: tournament.season ?? "",
      league_name: tournament.league_name ?? "",
      age_group: tournament.age_group ?? "",
      external_url: tournament.external_url ?? "",
      logo_url: tournament.logo_url ?? "",
      is_primary: tRow?.is_primary ?? false,
    });
  }, [tournament, tRow?.is_primary]);

  const handleUpdateTournament = useCallback(async () => {
    if (!id) return;
    if (!draft.name.trim()) {
      setEditError("Вкажи назву турніру.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    const { error: updateError } = await supabase
      .from("tournaments")
      .update({
        name: draft.name.trim(),
        short_name: normalizeNullable(draft.short_name),
        season: normalizeNullable(draft.season),
        league_name: normalizeNullable(draft.league_name),
        age_group: normalizeNullable(draft.age_group),
        external_url: normalizeNullable(draft.external_url),
        logo_url: normalizeNullable(draft.logo_url),
      })
      .eq("id", id);

    if (updateError) {
      setEditError(updateError.message || "Не вдалося оновити турнір.");
      setEditSaving(false);
      return;
    }

    const { error: linkError } = await supabase
      .from("team_tournaments")
      .update({ is_primary: draft.is_primary })
      .eq("team_id", TEAM_ID)
      .eq("tournament_id", id);

    if (linkError) {
      setEditError(linkError.message || "Не вдалося оновити статус основного турніру.");
      setEditSaving(false);
      return;
    }

    setTRow((prev) => {
      if (!prev) return prev;
      const updated = prev.tournament
        ? {
            ...prev.tournament,
            name: draft.name.trim(),
            short_name: normalizeNullable(draft.short_name),
            season: normalizeNullable(draft.season),
            league_name: normalizeNullable(draft.league_name),
            age_group: normalizeNullable(draft.age_group),
            external_url: normalizeNullable(draft.external_url),
            logo_url: normalizeNullable(draft.logo_url),
          }
        : prev.tournament;
      return { ...prev, is_primary: draft.is_primary, tournament: updated };
    });

    if (draft.is_primary) {
      const { error: resetError } = await supabase
        .from("team_tournaments")
        .update({ is_primary: false })
        .eq("team_id", TEAM_ID)
        .neq("tournament_id", id);

      if (resetError) {
        setEditError(resetError.message || "Не вдалося оновити основний турнір.");
        setEditSaving(false);
        return;
      }
    }

    setEditSaving(false);
    setEditOpen(false);
  }, [draft, id]);

  const handleDeleteTournament = useCallback(async () => {
    if (!id) return;
    setDeleteSaving(true);
    setDeleteError(null);

    const { error: rosterError } = await supabase
      .from("team_tournament_players")
      .delete()
      .eq("team_id", TEAM_ID)
      .eq("tournament_id", id);

    if (rosterError) {
      setDeleteError(rosterError.message || "Не вдалося видалити заявку турніру.");
      setDeleteSaving(false);
      return;
    }

    const { error: linkError } = await supabase
      .from("tournament_teams")
      .delete()
      .eq("team_id", TEAM_ID)
      .eq("tournament_id", id);

    if (linkError) {
      setDeleteError(linkError.message || "Не вдалося видалити звʼязок турніру.");
      setDeleteSaving(false);
      return;
    }

    const { error } = await supabase
      .from("team_tournaments")
      .delete()
      .eq("team_id", TEAM_ID)
      .eq("tournament_id", id);

    if (error) {
      setDeleteError(error.message || "Не вдалося видалити турнір.");
      setDeleteSaving(false);
      return;
    }

    setDeleteSaving(false);
    setDeleteOpen(false);
    navigate("/admin/tournaments");
  }, [id, navigate]);

  const header = useMemo(() => {
    if (loading) {
      return (
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-14 w-14 rounded-[var(--radius-md)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" />
        </div>
      );
    }

    if (!tournament) {
      return (
        <Button asChild variant="outline">
          <Link to="/admin/tournaments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Link>
        </Button>
      );
    }

    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-muted">
            {tournament.logo_url ? (
              <img src={tournament.logo_url} className="h-full w-full object-cover" />
            ) : (
              <Trophy className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <div className="text-lg font-semibold">{tournament.name}</div>
              {tRow?.is_primary && <Badge variant="secondary">Основний</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {tournament.league_name} {tournament.season && `• ${tournament.season}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setEditOpen(true)}
          >
            Редагувати
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Видалити
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/tournaments">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Турніри
            </Link>
          </Button>
        </div>
      </div>
    );
  }, [loading, tournament, tRow]);

  const defaultTab = useMemo(() => {
    const candidate = searchParams.get("tab");
    return candidate === "roster" || candidate === "matches" || candidate === "standings"
      ? candidate
      : "roster";
  }, [searchParams]);

  if (loading) {
    if (shouldShowSkeleton) return <PageSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <Card className="rounded-[var(--radius-section)]">
        <CardContent className="p-4">{header}</CardContent>
      </Card>

      {/* TABS */}
      <Card className="rounded-[var(--radius-section)]">
        <Tabs defaultValue={defaultTab}>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base">Турнір</CardTitle>
              <TabsList>
                <TabsTrigger value="roster">Заявка на турнір</TabsTrigger>
                <TabsTrigger value="standings">Таблиця</TabsTrigger>
                <TabsTrigger value="matches">Матчі</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          <CardContent>
            <TabsContent value="roster" className="mt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  У заявці: <span className="font-semibold text-foreground tabular-nums">{registeredIds.size}</span>
                </div>
                <Badge variant="secondary" className="rounded-full">Клік по гравцю = toggle</Badge>
              </div>

              <Separator className="my-4" />

              {rosterError ? (
                <div className="mb-4 rounded-[var(--radius-inner)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {rosterError}
                </div>
              ) : null}

              {playersLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array(6).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-[var(--radius-inner)]" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {players.map((p) => {
  const checked = registeredIds.has(p.id);
  const saving = rosterSavingId === p.id;
  
  // Визначаємо стан доступності
  const isUnavailable = p.status === 'injured' || p.status === 'sick' || p.status === 'away';
  
  // Словник для підписів
  const statusLabels: Record<string, string> = {
    injured: "Травмований",
    sick: "Хворіє",
    away: "Поїхав",
  };

  return (
    <Button
      key={p.id}
      type="button"
      variant="card"
      size="md"
      data-state={checked ? "active" : "inactive"}
      data-status={isUnavailable ? "unavailable" : "available"}
      onClick={async () => {
        if (!id || saving) return;
        setRosterError(null);
        setRosterSavingId(p.id);

        if (checked) {
          const { error } = await supabase
            .from("team_tournament_players")
            .delete()
            .eq("team_id", TEAM_ID)
            .eq("tournament_id", id)
            .eq("player_id", p.id);

          if (error) {
            setRosterError(error.message || "Не вдалося видалити зі заявки");
          } else {
            setRegisteredIds(prev => {
              const n = new Set(prev);
              n.delete(p.id);
              return n;
            });
          }
        } else {
          const { error } = await supabase
            .from("team_tournament_players")
            .insert({
              team_id: TEAM_ID,
              tournament_id: id,
              player_id: p.id,
            });

          if (error) {
            setRosterError(error.message || "Не вдалося додати у заявку");
          } else {
            setRegisteredIds(prev => new Set(prev).add(p.id));
          }
        }
        setRosterSavingId(null);
      }}
      className={cn(
        "h-auto flex items-center justify-between gap-3 px-4 py-3",
        "shadow-sm hover:shadow-md active:scale-[0.98]",
        saving ? "opacity-70 cursor-wait" : ""
      )}
      disabled={saving}
    >
      <div className="flex items-center gap-3 min-w-0">
        <PlayerAvatar player={p} size={36} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-foreground">
            {p.last_name} {p.first_name}
          </div>
          <div className={cn(
            "text-[10px] font-black uppercase tracking-tight",
            isUnavailable ? "text-red-500" : "text-muted-foreground"
          )}>
            {isUnavailable 
              ? statusLabels[p.status] || p.status 
              : (p.shirt_number ? `#${p.shirt_number}` : "Без номера")}
          </div>
        </div>
      </div>

      <Badge 
        variant={checked ? "default" : "secondary"} 
        className={cn("rounded-full h-6 px-2.5 text-[10px] font-bold uppercase tracking-wider")}
      >
        {checked ? "У заявці" : "Додати"}
      </Badge>
    </Button>
  );
})}
                </div>
              )}
            </TabsContent>

            <TabsContent value="standings" className="mt-0">
              <div className="space-y-4">
                <StandingsUpdatePanel
                  loading={standingsPreview.loading}
                  error={standingsPreview.error}
                  diff={standingsPreview.diff}
                  canWrite={standingsPreview.canWrite}
                  lastFetchedAt={standingsPreview.lastFetchedAt}
                  linkRequired={standingsPreview.linkRequired}
                  onPreview={standingsPreview.runPreview}
                  onOpenModal={() => setStandingsModalOpen(true)}
                  onReset={standingsPreview.resetPreview}
                  onLink={standingsPreview.linkTournamentToTeam}
                />

                <StandingsPreviewModal
                  open={standingsModalOpen}
                  onOpenChange={setStandingsModalOpen}
                  rows={standingsPreview.diff?.rows ?? []}
                  canWrite={standingsPreview.canWrite}
                  onConfirm={async () => {
                    await standingsPreview.confirmApply();
                    setStandingsModalOpen(false);
                    await loadStandings();
                  }}
                  loading={standingsPreview.loading}
                />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Повна турнірна таблиця</span>
                  <span>{formatUpdatedAgo(standingsUpdatedAt)}</span>
                </div>

                {standingsLoading ? (
                  <Skeleton className="h-24 w-full rounded-[var(--radius-inner)]" />
                ) : standingsRows.length === 0 ? (
                  <div className="rounded-[var(--radius-inner)] border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                    Таблиця поки не завантажена.
                  </div>
                ) : (
                <div className="overflow-hidden rounded-[var(--radius-inner)] border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                      <TableHead className="w-[56px]">№</TableHead>
                      <TableHead className="w-[28px] text-center"></TableHead>
                      <TableHead>Команда</TableHead>
                        <TableHead className="w-[80px]">І</TableHead>
                        <TableHead className="w-[80px]">В</TableHead>
                        <TableHead className="w-[80px]">Н</TableHead>
                        <TableHead className="w-[80px]">П</TableHead>
                        <TableHead className="w-[120px]">Г</TableHead>
                        <TableHead className="w-[80px]">О</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {standingsRows.map((row) => (
                          <TableRow key={row.team_name}>
                            <TableCell className="font-semibold tabular-nums">{row.position}</TableCell>
                            <TableCell className="text-center tabular-nums">
                              {row.position_delta === null ? (
                                <span className="inline-flex items-center justify-center text-xs text-muted-foreground">
                                  <Minus className="h-3.5 w-3.5" />
                                </span>
                              ) : row.position_delta > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                                  <ArrowUp className="h-3.5 w-3.5" />
                                  {row.position_delta}
                                </span>
                              ) : row.position_delta < 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500">
                                  <ArrowDown className="h-3.5 w-3.5" />
                                  {Math.abs(row.position_delta)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center text-xs text-muted-foreground">
                                  <Minus className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {row.logo_url ? (
                                <img
                                  src={row.logo_url}
                                  alt={row.team_name}
                                  className="h-7 w-7 rounded-full border border-border object-cover"
                                  loading="lazy"
                                />
                              ) : null}
                              <span className="font-medium">{row.team_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="tabular-nums">{row.played ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{row.wins ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{row.draws ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{row.losses ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">
                            {row.goals_for ?? "—"}-{row.goals_against ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">{row.points ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="matches" className="mt-0">
              {matches.length === 0 ? (
                <div className="rounded-[var(--radius-inner)] border border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
                  Поки немає матчів у цьому турнірі.
                </div>
              ) : (
                <div className="space-y-3">
                  {matches.map((m) => (
                    <Link
                      key={m.id}
                      to={`/matches/${m.id}`}
                      className={cn("block rounded-[var(--radius-inner)] border p-4 hover:bg-muted/40")}
                    >
                      <div className="flex justify-between">
                        <div>
                          <div className="flex gap-2">
                            <span className="font-medium">{m.opponent_name}</span>
                            {matchStatusBadge(m.status, m.score_team, m.score_opponent)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <CalendarDays className="inline h-3.5 w-3.5 mr-1" />
                            {formatDateTimeUA(m.match_date)}
                          </div>
                        </div>

                        <div className="text-lg font-bold">
                          {m.score_team != null ? `${m.score_team}:${m.score_opponent}` : "—"}
                        </div>
                      </div>
                      <Separator className="mt-3" />
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditError(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl overflow-hidden border-border bg-card/95 p-0">
          <div className="border-b border-border bg-card/70 px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-lg text-foreground">Редагувати турнір</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Онови назву, сезон, лігу та інші параметри турніру.
              </DialogDescription>
            </DialogHeader>
            {editError ? (
              <div className="mt-4 rounded-[var(--radius-inner)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {editError}
              </div>
            ) : null}
          </div>

          <div className="max-h-[70vh] overflow-auto px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Назва турніру *</Label>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Коротка назва</Label>
                <Input
                  value={draft.short_name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, short_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Сезон</Label>
                <Input
                  value={draft.season}
                  onChange={(event) => setDraft((prev) => ({ ...prev, season: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Ліга</Label>
                <Input
                  value={draft.league_name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, league_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Вікова група</Label>
                <Input
                  value={draft.age_group}
                  onChange={(event) => setDraft((prev) => ({ ...prev, age_group: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Посилання на турнір</Label>
                <Input
                  value={draft.external_url}
                  onChange={(event) => setDraft((prev) => ({ ...prev, external_url: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Лого (URL)</Label>
                <Input
                  value={draft.logo_url}
                  onChange={(event) => setDraft((prev) => ({ ...prev, logo_url: event.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={draft.is_primary}
                  onCheckedChange={(value) => setDraft((prev) => ({ ...prev, is_primary: Boolean(value) }))}
                />
                <span className="text-sm text-foreground">Основний турнір команди</span>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-card/70 px-6 py-4">
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Скасувати
            </Button>
            <Button onClick={handleUpdateTournament} disabled={editSaving}>
              {editSaving ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити турнір?</AlertDialogTitle>
            <AlertDialogDescription>
              Турнір зникне зі списку команди, а заявка буде очищена. Матчі та статистика залишаться.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <div className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {deleteError}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTournament}
              disabled={deleteSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSaving ? "Видалення..." : "Видалити"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
