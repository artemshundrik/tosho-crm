import { useCallback, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/auth/AuthProvider";
import { fetchTournamentHtml } from "./api";
import { computeStandingsDiff, type StandingRow } from "./diff";
import { parseStandingsFromHtmlDom } from "./parseDom";

type TournamentInfo = {
  id: string;
  name: string;
  external_url: string | null;
  season: string | null;
};

type PreviewState = {
  loading: boolean;
  error: string | null;
  previewRows: StandingRow[];
  diff: ReturnType<typeof computeStandingsDiff> | null;
  canWrite: boolean;
  lastFetchedAt: string | null;
  tournament: TournamentInfo | null;
  linkRequired: boolean;
};

type Actions = {
  runPreview: () => Promise<void>;
  confirmApply: () => Promise<void>;
  resetPreview: () => void;
  linkTournamentToTeam: () => Promise<void>;
};

export function useStandingsPreview({ tournamentId }: { tournamentId: string }): PreviewState & Actions {
  const { userId, teamId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<StandingRow[]>([]);
  const [diff, setDiff] = useState<ReturnType<typeof computeStandingsDiff> | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [linkRequired, setLinkRequired] = useState(false);

  const resolveAccess = useCallback(async () => {
    if (!teamId || !userId) {
      setCanWrite(false);
      return;
    }

    const { data: memberRow, error: memberError } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError) {
      console.error("team_members lookup failed", memberError);
      setCanWrite(false);
      return;
    }

    const role = memberRow?.role ?? null;
    setCanWrite(role === "manager" || role === "super_admin");
  }, [teamId, userId]);

  const ensureTournamentLink = useCallback(async () => {
    if (!teamId) {
      throw new Error("No team selected");
    }

    const { data: linkRow, error: linkError } = await supabase
      .from("tournament_teams")
      .select("tournament_id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (linkError) {
      throw linkError;
    }

    return Boolean(linkRow);
  }, [teamId, tournamentId]);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLinkRequired(false);

    try {
      if (!tournamentId) {
        throw new Error("Tournament ID is required");
      }

      if (!teamId || !userId) {
        throw new Error("Не знайдено команду або користувача");
      }

      await resolveAccess();

      const { data: tournamentRow, error: tournamentError } = await supabase
        .from("tournaments")
        .select("id, name, external_url, season")
        .eq("id", tournamentId)
        .maybeSingle();

      if (tournamentError || !tournamentRow) {
        throw new Error("Tournament not found");
      }

      const tournamentInfo: TournamentInfo = {
        id: tournamentRow.id,
        name: tournamentRow.name,
        external_url: tournamentRow.external_url,
        season: tournamentRow.season,
      };

      setTournament(tournamentInfo);

      if (!tournamentRow.external_url) {
        throw new Error("Tournament external_url is missing");
      }

      const isLinked = await ensureTournamentLink();
      if (!isLinked) {
        setLinkRequired(true);
        throw new Error("Tournament is not linked to this team.");
      }

      const html = await fetchTournamentHtml(tournamentRow.external_url);
      const parsed = parseStandingsFromHtmlDom(html);

      const { data: currentRows, error: currentError } = await supabase
        .from("tournament_standings_current")
        .select("team_name, position, played, points, wins, draws, losses, goals_for, goals_against, logo_url")
        .eq("tournament_id", tournamentId);

      if (currentError) {
        throw currentError;
      }

      const oldRows = (currentRows ?? []) as StandingRow[];
      const diffResult = computeStandingsDiff(oldRows, parsed.rows);

      setPreviewRows(parsed.rows);
      setDiff(diffResult);
      setLastFetchedAt(new Date().toISOString());

      if (import.meta.env.DEV) {
        console.info("Standings preview fetched", {
          tournamentId,
          rows: parsed.rows.length,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [ensureTournamentLink, resolveAccess, teamId, tournamentId, userId]);

  const confirmApply = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!tournamentId) {
        throw new Error("Tournament ID is required");
      }

      if (!tournament?.external_url) {
        throw new Error("Tournament external_url is missing");
      }

      if (!canWrite) {
        throw new Error("Недостатньо прав для запису");
      }

      if (previewRows.length === 0) {
        throw new Error("Немає даних для збереження");
      }

      const { data: runRow, error: runError } = await supabase
        .from("tournament_standings_runs")
        .insert({
          tournament_id: tournamentId,
          rows_count: previewRows.length,
          source_url: tournament.external_url,
          status: "completed",
        })
        .select("id")
        .single();

      if (runError || !runRow) {
        throw runError ?? new Error("Failed to create run");
      }

      const updatedAt = new Date().toISOString();
      const upsertRows = previewRows.map((row) => ({
        tournament_id: tournamentId,
        team_name: row.team_name,
        position: row.position,
        played: row.played,
        points: row.points,
        wins: row.wins ?? null,
        draws: row.draws ?? null,
        losses: row.losses ?? null,
        goals_for: row.goals_for ?? null,
        goals_against: row.goals_against ?? null,
        logo_url: row.logo_url ?? null,
        updated_at: updatedAt,
      }));

      const { error: upsertError } = await supabase
        .from("tournament_standings_current")
        .upsert(upsertRows, {
          onConflict: "tournament_id,team_name",
        });

      if (upsertError) {
        throw upsertError;
      }

      const runRows = previewRows.map((row) => ({
        run_id: runRow.id,
        tournament_id: tournamentId,
        team_name: row.team_name,
        position: row.position,
        played: row.played,
        points: row.points,
        wins: row.wins ?? null,
        draws: row.draws ?? null,
        losses: row.losses ?? null,
        goals_for: row.goals_for ?? null,
        goals_against: row.goals_against ?? null,
        logo_url: row.logo_url ?? null,
      }));

      const { error: runRowsError } = await supabase
        .from("tournament_standings_rows")
        .insert(runRows);

      if (runRowsError) {
        throw runRowsError;
      }

      if (import.meta.env.DEV) {
        console.info("Standings saved", {
          tournamentId,
          runId: runRow.id,
          rows: previewRows.length,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [canWrite, previewRows, tournament, tournamentId]);

  const resetPreview = useCallback(() => {
    setPreviewRows([]);
    setDiff(null);
    setLastFetchedAt(null);
    setError(null);
  }, []);

  const linkTournamentToTeam = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!teamId) {
        throw new Error("No team selected");
      }
      if (!tournamentId) {
        throw new Error("Tournament ID is required");
      }

      const { error: linkError } = await supabase
        .from("tournament_teams")
        .insert({
          tournament_id: tournamentId,
          team_id: teamId,
        });

      if (linkError) {
        throw linkError;
      }

      setLinkRequired(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [teamId, tournamentId]);

  return useMemo(
    () => ({
      loading,
      error,
      previewRows,
      diff,
      canWrite,
      lastFetchedAt,
      tournament,
      linkRequired,
      runPreview,
      confirmApply,
      resetPreview,
      linkTournamentToTeam,
    }),
    [
      loading,
      error,
      previewRows,
      diff,
      canWrite,
      lastFetchedAt,
      tournament,
      linkRequired,
      runPreview,
      confirmApply,
      resetPreview,
      linkTournamentToTeam,
    ],
  );
}
