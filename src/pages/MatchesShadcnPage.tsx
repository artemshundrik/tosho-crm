// src/pages/MatchesShadcnPage.tsx
import * as React from "react";
import { Link, useNavigate, useSearchParams, useNavigationType } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

import {
  MatchCard,
  mapDbMatchToCardData,
  type MatchCardData,
  type MatchCardStatus,
} from "@/components/app/MatchCard";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/app/FilterBar";
import { cn } from "@/lib/utils";
import { OperationalSummary } from "@/components/app/OperationalSummary";
import { Swords, Target, Activity, Plus, RotateCw, Trophy } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { formatUpdatedAgo, getContextRows, type StandingsRowView } from "@/features/standingsImport/standingsUtils";

const TEAM_ID = "389719a7-5022-41da-bc49-11e7a3afbd98";
const TEAM_NAME = "FAYNA TEAM";
const PAGE_SIZE = 24;

type DbTournament = {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  logo_url: string | null;
  league_name: string | null;
};

type PrimaryTournament = {
  id: string;
  name: string;
  season: string | null;
};

type StandingsRow = StandingsRowView & {
  updated_at: string | null;
};

type DbMatch = {
  id: string;
  opponent_name: string;
  opponent_logo_url?: string | null;
  match_date: string;
  status: "scheduled" | "played" | "canceled";
  score_team: number | null;
  score_opponent: number | null;
  home_away: "home" | "away" | "neutral";
  tournament_id: string | null;
  stage: string | null;
  matchday: number | null;
  tournaments?: DbTournament | DbTournament[] | null;
};

type SortValue =
  | "date_desc"
  | "date_asc"
  | "opponent_az"
  | "opponent_za"
  | "tournament_az";

type Filters = {
  status: "all" | MatchCardStatus;
  tournamentId: "all" | string;
  season: "all" | string;
  sort: SortValue;
  query: string;
};




function normalize(s: string) {
  return s.trim().toLowerCase();
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiffLocal(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  const da = startOfDayLocal(a).getTime();
  const db = startOfDayLocal(b).getTime();
  return Math.round((db - da) / ms);
}

function monthKeyUA(iso: string) {
  const d = new Date(iso);
  const m = new Intl.DateTimeFormat("uk-UA", { month: "long" }).format(d);
  const y = new Intl.DateTimeFormat("uk-UA", { year: "numeric" }).format(d);
  const mm = m.charAt(0).toUpperCase() + m.slice(1);
  return `${mm} ${y}`;
}

function effectiveStatusFromCard(m: MatchCardData): MatchCardStatus {
  if (m.status === "canceled") return "canceled";
  const hasScore =
    typeof m.scoreTeam === "number" && typeof m.scoreOpponent === "number";
  return hasScore ? "played" : "scheduled";
}

function getNextMatch(list: MatchCardData[]) {
  const now = new Date();

  const scheduled = list
    .filter((m) => effectiveStatusFromCard(m) === "scheduled")
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const future = scheduled.find(
    (m) => new Date(m.date).getTime() >= now.getTime()
  );
  return future ?? scheduled[0] ?? null;
}

function formatNextMatchLine(m: MatchCardData) {
  const d = new Date(m.date);

  const datePart = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

  const timePart = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  const diff = dayDiffLocal(new Date(), d);
  const rel =
    diff === 0
      ? "Сьогодні"
      : diff === 1
      ? "Завтра"
      : diff >= 2 && diff <= 6
      ? (() => {
          const wd = new Intl.DateTimeFormat("uk-UA", {
            weekday: "short",
          }).format(d);
          const cleaned = wd.replace(".", "");
          return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        })()
      : null;

  const meta = rel ? `${rel} • ${datePart}, ${timePart}` : `${datePart}, ${timePart}`;
  return { meta };
}

function normalizeLogoUrl(url?: string | null) {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
    /\/+$/,
    ""
  );
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !supabaseAnonKey) return trimmed;

  const looksRelative = trimmed.startsWith("/") || !/^https?:\/\//i.test(trimmed);
  const absoluteUrl = looksRelative
    ? `${supabaseUrl}/${trimmed.replace(/^\/+/, "")}`
    : trimmed;

  if (!absoluteUrl.startsWith(supabaseUrl)) return absoluteUrl;
  if (absoluteUrl.includes("apikey=")) return absoluteUrl;

  const sep = absoluteUrl.includes("?") ? "&" : "?";
  return `${absoluteUrl}${sep}apikey=${supabaseAnonKey}`;
}

function tournamentLabelFromDbMatch(m: DbMatch): string {
  const t = Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments;
  return ((t?.league_name || t?.short_name || t?.name || "").trim() || "Турнір");
}

function tournamentLabelById(matchesDb: DbMatch[], tournamentId: string | null): string {
  if (!tournamentId) return "Турнір";
  const found = matchesDb.find((m) => m.tournament_id === tournamentId);
  if (!found) return "Турнір";
  return tournamentLabelFromDbMatch(found);
}

function getDbTournamentFromMatch(m: DbMatch): DbTournament | null {
  const t = Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments;
  return t ?? null;
}

function resolveCurrentTournamentId(params: {
  filtersTournamentId: "all" | string;
  matchesDb: DbMatch[];
  cardsAll: MatchCardData[];
}): string | null {
  if (params.filtersTournamentId !== "all") return params.filtersTournamentId;

  const next = getNextMatch(params.cardsAll);
  if (next) {
    const idFromDb =
      params.matchesDb.find((m) => m.id === next.id)?.tournament_id ?? null;
    if (idFromDb) return idFromDb;
  }

  const freq = new Map<string, number>();
  for (const m of params.matchesDb) {
    if (!m.tournament_id) continue;
    const inList = params.cardsAll.some((c) => c.id === m.id);
    if (!inList) continue;
    freq.set(m.tournament_id, (freq.get(m.tournament_id) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of freq.entries()) {
    if (count > bestCount) {
      bestCount = count;
      best = id;
    }
  }
  return best;
}

function computeTournamentSummary(params: { cardsInTournament: MatchCardData[] }) {
  const totalCount = params.cardsInTournament.length;

  const played = params.cardsInTournament
    .filter((m) => effectiveStatusFromCard(m) === "played")
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const scheduledCount = params.cardsInTournament.filter(
    (m) => effectiveStatusFromCard(m) === "scheduled"
  ).length;

  let w = 0;
  let d = 0;
  let l = 0;
  let gf = 0;
  let ga = 0;

  for (const m of played) {
    const a = m.scoreTeam;
    const b = m.scoreOpponent;
    if (typeof a !== "number" || typeof b !== "number") continue;

    gf += a;
    ga += b;

    if (a > b) w++;
    else if (a < b) l++;
    else d++;
  }

  const streakN = Math.min(5, played.length);
  const streakParts = played.slice(0, streakN).map((m) => {
    const a = m.scoreTeam;
    const b = m.scoreOpponent;
    if (typeof a !== "number" || typeof b !== "number") return "—";
    if (a > b) return "W";
    if (a < b) return "L";
    return "D";
  });

  return {
    wdlText: `${w}–${d}–${l}`,
    goalsText: `${gf} / ${ga}`,
    streakText: streakParts.length ? streakParts.join(" ") : "—",
    streakCount: streakN,
    playedCount: played.length,
    totalCount,
    scheduledCount,
  };
}

// ----------------------------
// ✅ State in URL + Scroll restore
// ----------------------------
const DEFAULT_FILTERS: Filters = {
  status: "all",
  tournamentId: "all",
  season: "all",
  sort: "date_desc",
  query: "",
};

function isMatchStatus(x: string): x is MatchCardStatus {
  return x === "scheduled" || x === "played" || x === "canceled";
}

function isSortValue(x: string): x is SortValue {
  return x === "date_desc" || x === "date_asc" || x === "opponent_az" || x === "opponent_za" || x === "tournament_az";
}

function readFiltersFromSearchParams(sp: URLSearchParams): Filters {
  const statusRaw = (sp.get("status") || "all").trim();
  const tournamentId = (sp.get("tournamentId") || "all").trim() || "all";
  const season = (sp.get("season") || "all").trim() || "all";
  const sortRaw = (sp.get("sort") || "date_desc").trim();
  const query = sp.get("q") || "";

  const status: Filters["status"] =
    statusRaw === "all" ? "all" : isMatchStatus(statusRaw) ? statusRaw : "all";

  const sort: Filters["sort"] = isSortValue(sortRaw) ? sortRaw : "date_desc";

  return { status, tournamentId, season, sort, query };
}

function filtersEqual(a: Filters, b: Filters) {
  return (
    a.status === b.status &&
    a.tournamentId === b.tournamentId &&
    a.season === b.season &&
    a.sort === b.sort &&
    a.query === b.query
  );
}

function writeFiltersToSearchParams(filters: Filters, current: URLSearchParams) {
  const next = new URLSearchParams(current);

  if (filters.status !== DEFAULT_FILTERS.status) next.set("status", filters.status);
  else next.delete("status");

  if (filters.tournamentId !== DEFAULT_FILTERS.tournamentId) next.set("tournamentId", filters.tournamentId);
  else next.delete("tournamentId");

  if (filters.season !== DEFAULT_FILTERS.season) next.set("season", filters.season);
  else next.delete("season");

  if (filters.sort !== DEFAULT_FILTERS.sort) next.set("sort", filters.sort);
  else next.delete("sort");

  if (filters.query.trim()) next.set("q", filters.query.trim());
  else next.delete("q");

  return next;
}

function listStateKeyFromParams(sp: URLSearchParams) {
  const s = sp.toString();
  return `matches:list_state:${s || "default"}`;
}

type ListState = {
  visibleCount: number;
  scrollY: number;
  ts: number;
};

function safeParseListState(raw: string | null): ListState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ListState>;
    if (typeof v.visibleCount !== "number" || v.visibleCount <= 0) return null;
    if (typeof v.scrollY !== "number" || v.scrollY < 0) return null;
    return { visibleCount: v.visibleCount, scrollY: v.scrollY, ts: typeof v.ts === "number" ? v.ts : Date.now() };
  } catch {
    return null;
  }
}

export function MatchesShadcnPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [primaryTournament, setPrimaryTournament] = React.useState<PrimaryTournament | null>(null);
  const [standingsRow, setStandingsRow] = React.useState<StandingsRowView | null>(null);
  const [standingsUpdatedAt, setStandingsUpdatedAt] = React.useState<string | null>(null);

  const [teamLogo, setTeamLogo] = React.useState<string | null>(null);
  const [matchesDb, setMatchesDb] = React.useState<DbMatch[]>([]);
  const [cards, setCards] = React.useState<MatchCardData[]>([]);

  // ✅ filters from URL (so Back keeps filters)
  const [filters, setFilters] = React.useState<Filters>(() => readFiltersFromSearchParams(searchParams));

  const [visibleCount, setVisibleCount] = React.useState<number>(PAGE_SIZE);

  // ✅ restore list state (scroll + visibleCount) when returning back
  const pendingRestoreRef = React.useRef<ListState | null>(null);

  // read initial restore state once (based on initial URL params)
  React.useEffect(() => {
    if (navigationType !== "POP") return;
    const key = listStateKeyFromParams(searchParams);
    const saved = safeParseListState(sessionStorage.getItem(key));
    if (saved) pendingRestoreRef.current = saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync filters when URL changes (back/forward/manual)
  React.useEffect(() => {
    const fromUrl = readFiltersFromSearchParams(searchParams);
    if (!filtersEqual(fromUrl, filters)) {
      setFilters(fromUrl);

      // also try to restore state for this exact filter URL (if any) on back/forward
      if (navigationType === "POP") {
        const key = listStateKeyFromParams(searchParams);
        const saved = safeParseListState(sessionStorage.getItem(key));
        pendingRestoreRef.current = saved;
        if (saved?.visibleCount) setVisibleCount(saved.visibleCount);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadStandings() {
      const { data: primaryRow, error: primaryError } = await supabase
        .from("team_tournaments")
        .select("tournament:tournament_id (id, name, season)")
        .eq("team_id", TEAM_ID)
        .eq("is_primary", true)
        .maybeSingle();

      if (cancelled) return;

      const tournamentRaw = Array.isArray(primaryRow?.tournament)
        ? primaryRow?.tournament[0]
        : primaryRow?.tournament;

      if (!primaryError && tournamentRaw) {
        const tournament = tournamentRaw as PrimaryTournament;
        setPrimaryTournament(tournament);

        const { data: standingsData, error: standingsError } = await supabase
          .from("tournament_standings_current")
          .select("team_name, position, played, points, wins, draws, losses, goals_for, goals_against, logo_url, updated_at")
          .eq("tournament_id", tournament.id)
          .order("position", { ascending: true });

        if (cancelled) return;

        if (!standingsError) {
          const rows = (standingsData ?? []) as StandingsRow[];
          const latestUpdated = rows.reduce<string | null>((latest, row) => {
            if (!row.updated_at) return latest;
            if (!latest || row.updated_at > latest) return row.updated_at;
            return latest;
          }, null);
          const context = getContextRows(rows, TEAM_NAME, 0);
          setStandingsRow(context.teamRow);
          setStandingsUpdatedAt(latestUpdated);
        } else {
          console.error("Matches standings load error", standingsError);
        }
      } else if (primaryError) {
        console.error("Matches primary tournament load error", primaryError);
      }
    }

    loadStandings();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveListState = React.useCallback(
    (opts?: { forceScrollTop?: boolean }) => {
      const key = listStateKeyFromParams(searchParams);
      const payload: ListState = {
        visibleCount,
        scrollY: opts?.forceScrollTop ? 0 : window.scrollY || 0,
        ts: Date.now(),
      };
      sessionStorage.setItem(key, JSON.stringify(payload));
    },
    [searchParams, visibleCount]
  );

  // save on unmount (safety)
  React.useEffect(() => {
    return () => {
      try {
        saveListState();
      } catch {
        // ignore
      }
    };
  }, [saveListState]);

  const updateFilters = React.useCallback(
    (updater: (prev: Filters) => Filters) => {
      setFilters((prev) => {
        const nextFilters = updater(prev);
        const nextParams = writeFiltersToSearchParams(nextFilters, searchParams);
        setSearchParams(nextParams, { replace: true });

        // UX: new filter => reset pagination + scroll top
        setVisibleCount(PAGE_SIZE);
        // and store state for this filter URL
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: "auto" });
          try {
            saveListState({ forceScrollTop: true });
          } catch {
            // ignore
          }
        });

        return nextFilters;
      });
    },
    [searchParams, setSearchParams, saveListState]
  );

  React.useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: matchesError } = await supabase
        .from("matches")
        .select(
          `
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
          matchday,
          tournaments (
            id,
            name,
            short_name,
            season,
            logo_url,
            league_name
          )
        `
        )
        .eq("team_id", TEAM_ID)
        .order("match_date", { ascending: false });

      if (matchesError) {
        setError(matchesError.message);
        setMatchesDb([]);
        setCards([]);
        setLoading(false);
        return;
      }

      const rawMatches = (data || []) as DbMatch[];

      let logo: string | null = null;

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("club_id")
        .eq("id", TEAM_ID)
        .single();

      if (!teamError && teamData?.club_id) {
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("logo_url")
          .eq("id", teamData.club_id)
          .single();

        if (!clubError) {
          const raw =
            (clubData as { logo_url?: string | null } | null)?.logo_url || null;
          logo = normalizeLogoUrl(raw);
        }
      }

      setTeamLogo(logo);

      const normalizedMatches: DbMatch[] = rawMatches.map((m) => ({
        ...m,
        opponent_logo_url: normalizeLogoUrl(m.opponent_logo_url ?? null),
        tournaments: m.tournaments
          ? Array.isArray(m.tournaments)
            ? m.tournaments.map((t) => ({
                ...t,
                logo_url: normalizeLogoUrl(t.logo_url ?? null),
              }))
            : {
                ...m.tournaments,
                logo_url: normalizeLogoUrl(m.tournaments.logo_url ?? null),
              }
          : null,
      }));

      setMatchesDb(normalizedMatches);

      const mapped = normalizedMatches.map((match) =>
        mapDbMatchToCardData({
          match,
          teamName: "FAYNA TEAM",
          teamLogo: logo,
        })
      );

      setCards(mapped);

      // restore visibleCount for current URL (if any)
      if (navigationType === "POP") {
        const key = listStateKeyFromParams(searchParams);
        const saved = safeParseListState(sessionStorage.getItem(key));
        if (saved?.visibleCount) {
          setVisibleCount(saved.visibleCount);
          pendingRestoreRef.current = saved;
        } else {
          setVisibleCount(PAGE_SIZE);
        }
      } else {
        setVisibleCount(PAGE_SIZE);
      }

      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // after loading, restore scroll position once (if we have pending restore)
  React.useEffect(() => {
    if (loading) return;
    const pending = pendingRestoreRef.current;
    if (!pending) return;

    pendingRestoreRef.current = null;

    // after DOM paint
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: pending.scrollY, behavior: "auto" });
    });
  }, [loading]);

  const tournamentOptions = React.useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const m of matchesDb) {
      const t = Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments;
      if (t?.id) map.set(t.id, { id: t.id, label: t.short_name || t.name });
    }
    return Array.from(map.values());
  }, [matchesDb]);

  const seasonOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const m of matchesDb) {
      const t = Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments;
      if (t?.season) set.add(t.season);
    }
    return Array.from(set.values());
  }, [matchesDb]);

  const matchTournamentLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matchesDb) {
      map.set(m.id, tournamentLabelFromDbMatch(m));
    }
    return map;
  }, [matchesDb]);

  const filteredAll = React.useMemo(() => {
    let list = cards.slice();

    if (filters.status !== "all") {
      list = list.filter((m) => effectiveStatusFromCard(m) === filters.status);
    }

    if (filters.tournamentId !== "all" || filters.season !== "all") {
      const allowedIds = new Set<string>();
      for (const m of matchesDb) {
        const t = Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments;
        if (filters.tournamentId !== "all" && m.tournament_id !== filters.tournamentId) continue;
        if (filters.season !== "all" && t?.season !== filters.season) continue;
        allowedIds.add(m.id);
      }
      list = list.filter((c) => allowedIds.has(c.id));
    }

    if (filters.query.trim()) {
      const q = normalize(filters.query);
      list = list.filter((m) => {
        const tournamentLabel = matchTournamentLabelById.get(m.id) ?? "";
        return (
          normalize(m.opponent.name).includes(q) ||
          normalize(m.team.name).includes(q) ||
          normalize(m.tournament?.name ?? "").includes(q) ||
          normalize(m.tournament?.shortName ?? "").includes(q) ||
          normalize(m.tournament?.leagueName ?? "").includes(q) ||
          normalize(tournamentLabel).includes(q)
        );
      });
    }

    const byDateDesc = (a: MatchCardData, b: MatchCardData) =>
      new Date(b.date).getTime() - new Date(a.date).getTime();
    const byDateAsc = (a: MatchCardData, b: MatchCardData) =>
      new Date(a.date).getTime() - new Date(b.date).getTime();
    const byOpponentAZ = (a: MatchCardData, b: MatchCardData) =>
      a.opponent.name.localeCompare(b.opponent.name, "uk-UA", { sensitivity: "base" });
    const byOpponentZA = (a: MatchCardData, b: MatchCardData) =>
      b.opponent.name.localeCompare(a.opponent.name, "uk-UA", { sensitivity: "base" });
    const byTournamentAZ = (a: MatchCardData, b: MatchCardData) => {
      const ta = (matchTournamentLabelById.get(a.id) ?? "").trim();
      const tb = (matchTournamentLabelById.get(b.id) ?? "").trim();
      const c = ta.localeCompare(tb, "uk-UA", { sensitivity: "base" });
      if (c !== 0) return c;
      return byDateDesc(a, b);
    };

    const sorted = list.slice();
    if (filters.sort === "date_desc") sorted.sort(byDateDesc);
    if (filters.sort === "date_asc") sorted.sort(byDateAsc);
    if (filters.sort === "opponent_az") sorted.sort(byOpponentAZ);
    if (filters.sort === "opponent_za") sorted.sort(byOpponentZA);
    if (filters.sort === "tournament_az") sorted.sort(byTournamentAZ);

    return sorted;
  }, [cards, filters, matchesDb, matchTournamentLabelById]);

  const visibleList = React.useMemo(
    () => filteredAll.slice(0, visibleCount),
    [filteredAll, visibleCount]
  );

  const grouped = React.useMemo(() => {
    const map = new Map<string, MatchCardData[]>();
    for (const m of visibleList) {
      const key = monthKeyUA(m.date);
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [visibleList]);

  const canLoadMore = visibleCount < filteredAll.length;

  const currentTournamentId = React.useMemo(() => {
    return resolveCurrentTournamentId({
      filtersTournamentId: "all",
      matchesDb,
      cardsAll: cards,
    });
  }, [matchesDb, cards]);

  const currentTournamentLabel = React.useMemo(
    () => tournamentLabelById(matchesDb, currentTournamentId),
    [matchesDb, currentTournamentId]
  );

  const currentTournamentDb = React.useMemo(() => {
    if (!currentTournamentId) return null;
    const found = matchesDb.find((m) => m.tournament_id === currentTournamentId);
    if (!found) return null;
    return getDbTournamentFromMatch(found);
  }, [matchesDb, currentTournamentId]);

  const currentTournamentName = React.useMemo(() => {
    const t = currentTournamentDb;
    return (t?.name || t?.short_name || currentTournamentLabel || "Турнір").trim();
  }, [currentTournamentDb, currentTournamentLabel]);

  const currentLeagueName = React.useMemo(() => {
    const t = currentTournamentDb;
    return (t?.league_name || currentTournamentLabel || "Ліга").trim();
  }, [currentTournamentDb, currentTournamentLabel]);

  const currentLeagueLogoUrl = React.useMemo(() => {
    return currentTournamentDb?.logo_url ?? null;
  }, [currentTournamentDb]);

  const cardsInCurrentTournament = React.useMemo(() => {
    if (!currentTournamentId) return [];
    const allowedIds = new Set<string>();
    for (const m of matchesDb) if (m.tournament_id === currentTournamentId) allowedIds.add(m.id);
    return cards.filter((c) => allowedIds.has(c.id));
  }, [cards, matchesDb, currentTournamentId]);

  const summary = React.useMemo(
    () => computeTournamentSummary({ cardsInTournament: cardsInCurrentTournament }),
    [cardsInCurrentTournament]
  );

  const nextMatch = React.useMemo(() => {
    const list = cardsInCurrentTournament.length ? cardsInCurrentTournament : cards;
    return getNextMatch(list);
  }, [cardsInCurrentTournament, cards]);

  const nextLine = nextMatch ? formatNextMatchLine(nextMatch) : null;
  const nextMatchTo = nextMatch ? `/matches/${nextMatch.id}` : null;

  const leagueLogoUrl = currentLeagueLogoUrl ?? (nextMatch?.tournament?.logoUrl ?? null);
  const canWrite = role === "manager" || role === "super_admin";

  function orderNextUpSides(m: MatchCardData) {
  const team = { name: m.team.name, logoUrl: m.team.logoUrl ?? null };
  const opp = { name: m.opponent.name, logoUrl: m.opponent.logoUrl ?? null };

  const ha =
    matchesDb.find((x) => x.id === m.id)?.home_away ??
    "home"; // дефолт, якщо раптом не знайшло

  // якщо FAYNA "away" => зліва господар (суперник), справа FAYNA
  if (ha === "away") {
    return { left: opp, right: team };
  }

  // home / neutral
  return { left: team, right: opp };
}



  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <OperationalSummary
          title="Огляд"
          subtitle="Поточний стан команди в турнірі та найближчий матч."
          nextUpLoading={loading}
          nextUp={
            !loading && nextLine && nextMatchTo && nextMatch
              ? (() => {
                  const sides = orderNextUpSides(nextMatch);

                  return {
                    eyebrow: `Наступний матч · ${currentTournamentLabel}`,
                    primary: nextLine.meta,
                    secondary: `${sides.left.name} — ${sides.right.name}`,
                    icon: Swords,
                    to: nextMatchTo,
                    leagueLogoUrl,
                    avatars: [
                      { name: sides.left.name, src: sides.left.logoUrl },
                      { name: sides.right.name, src: sides.right.logoUrl },
                    ],
                    tournamentName: currentTournamentName,
                    leagueName: currentLeagueName,
                    tourLabel:
                      typeof nextMatch.matchday === "number" && !Number.isNaN(nextMatch.matchday)
                        ? `Тур ${nextMatch.matchday}`
                        : nextMatch.stage
                        ? nextMatch.stage
                        : "",
                  };
                })()
              : undefined
          }

          primaryAction={{
            label: "Новий матч",
            to: "/matches/new",
          }}
          secondaryAction={undefined}
          kpis={[
            {
              key: "tournament",
              label: (() => {
                const tournamentLabel =
                  currentTournamentDb?.short_name ||
                  currentTournamentDb?.name ||
                  currentTournamentLabel;
                const leagueLabel =
                  currentTournamentDb?.league_name ||
                  primaryTournament?.name ||
                  currentLeagueName;
                const seasonLabel = currentTournamentDb?.season || primaryTournament?.season;
                const base = [tournamentLabel, leagueLabel].filter(Boolean).join(" · ").trim();
                return [base, seasonLabel].filter(Boolean).join(" ").trim() || "Турнір";
              })(),
              value: standingsRow?.position ? `#${standingsRow.position}` : "—",
              secondaryValue:
                typeof standingsRow?.points === "number" ? `${standingsRow.points} очок` : "—",
              icon: Trophy,
              iconTone: "bg-amber-500/10 text-amber-600",
              hint: standingsUpdatedAt
                ? formatUpdatedAgo(standingsUpdatedAt)
                    .replace(/^Оновлено\s*/i, "")
                    .replace(/\b1 дн\b/i, "1 день")
                : "—",
              footerCta: primaryTournament
                ? {
                    label: "Таблиця",
                    to: `/admin/tournaments/${primaryTournament.id}?tab=standings`,
                  }
                : undefined,
            },
            {
              key: "wdl",
              label: "Матчі",
              value: summary.wdlText,
              hint: "Перемоги – Нічиї – Поразки",
              icon: Swords,
              iconTone: "bg-sky-500/10 text-sky-600",
            },
            {
              key: "goals",
              label: "Голи",
              value: summary.goalsText,
              hint: "Забито / пропущено",
              icon: Target,
              iconTone: "bg-emerald-500/10 text-emerald-600",
            },
            {
              key: "streak",
              label: "Серія",
              value: summary.streakText,
              hint: `Останні ${summary.streakCount}`,
              icon: Activity,
              iconTone: "bg-rose-500/10 text-rose-600",
            },
          ]}
        />

      </div>

      <FilterBar
        tabs={{
          value: filters.status,
          onChange: (v) => updateFilters((p) => ({ ...p, status: v })),
          items: [
            { value: "all", label: "Всі" },
            { value: "played", label: "Зіграні" },
            { value: "scheduled", label: "Заплановані" },
          ],
        }}
        selects={[
          {
            key: "tournament",
            value: filters.tournamentId,
            onChange: (v) => updateFilters((p) => ({ ...p, tournamentId: v })),
            placeholder: "Всі турніри",
            widthClassName: "sm:w-52",
            options: [
              { value: "all", label: "Всі турніри" },
              ...tournamentOptions.map((t) => ({ value: t.id, label: t.label })),
            ],
          },
          {
            key: "season",
            value: filters.season,
            onChange: (v) => updateFilters((p) => ({ ...p, season: v })),
            placeholder: "Всі сезони",
            widthClassName: "sm:w-44",
            options: [
              { value: "all", label: "Всі сезони" },
              ...seasonOptions.map((s) => ({ value: s, label: s })),
            ],
          },
        ]}
        search={{
          value: filters.query,
          onChange: (v) => updateFilters((p) => ({ ...p, query: v })),
          placeholder: "Пошук (суперник / турнір)",
          widthClassName: "sm:max-w-[520px]",
        }}
        bottomLeft={
          !loading && !error ? (
            <>
              Показано:{" "}
              <span className="font-medium text-foreground">
                {Math.min(visibleCount, filteredAll.length)}
              </span>{" "}
              з{" "}
              <span className="font-medium text-foreground">
                {filteredAll.length}
              </span>
            </>
          ) : null
        }
        bottomRight={
          !loading && !error
            ? canLoadMore
              ? "Натисни “Показати ще”, щоб відкрити наступні матчі."
              : "Це всі матчі за поточними фільтрами."
            : null
        }
      />

      {loading ? (
        <Card className="rounded-3xl border border-border bg-card p-10">
          <div className="text-sm text-muted-foreground">Завантаження матчів…</div>
        </Card>
      ) : error ? (
        <Card className="rounded-3xl border border-border bg-card p-10">
          <div className="text-base font-semibold text-foreground">Помилка</div>
          <div className="mt-2 text-sm text-destructive">{error}</div>
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="rounded-3xl border border-border bg-card p-10 text-center">
          <div className="text-base font-semibold text-foreground">Нічого не знайдено</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Зміни фільтри або спробуй інший запит пошуку.
          </div>
        </Card>
      ) : (
        <>
          <div className="space-y-8">
            {grouped.map(([month, list]) => (
              <section key={month} className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">{month}</h2>
                  <span className="text-xs text-muted-foreground">
                    {list.length} матч(і/ів)
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="text-left"
                      onClick={() => {
                        // ✅ save state before going to details
                        saveListState();
                        navigate(`/matches/${m.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          saveListState();
                          navigate(`/matches/${m.id}`);
                        }
                      }}
                    >
                      <MatchCard data={m} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {canLoadMore ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                className="rounded-2xl"
                onClick={() => {
                  setVisibleCount((c) => {
                    const next = Math.min(c + PAGE_SIZE, filteredAll.length);
                    // ✅ keep state updated as user loads more
                    window.requestAnimationFrame(() => {
                      try {
                        sessionStorage.setItem(
                          listStateKeyFromParams(searchParams),
                          JSON.stringify({ visibleCount: next, scrollY: window.scrollY || 0, ts: Date.now() })
                        );
                      } catch {
                        // ignore
                      }
                    });
                    return next;
                  });
                }}
              >
                Показати ще {Math.min(PAGE_SIZE, filteredAll.length - visibleCount)}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
