/**
 * useTeamData Hook
 * 
 * Manages team ID loading and authentication state
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { STORAGE_KEYS } from "@/constants/catalog";

export function useTeamData() {
  const [teamId, setTeamId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.TEAM_ID);
    } catch {
      return null;
    }
  });
  
  const [teamLoading, setTeamLoading] = useState(!teamId);
  const [teamError, setTeamError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTeamId = async () => {
      setTeamLoading(true);
      setTeamError(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (!cancelled) {
          setTeamError(userError?.message ?? "User not authenticated");
          setTeamId(null);
          setTeamLoading(false);
        }
        return;
      }

      const { data, error: teamError } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        if (teamError) {
          setTeamError(teamError.message);
          setTeamId(null);
        } else {
          const nextTeamId = (data as { team_id?: string } | null)?.team_id ?? null;
          setTeamId(nextTeamId);
          try {
            if (nextTeamId) localStorage.setItem(STORAGE_KEYS.TEAM_ID, nextTeamId);
          } catch {
            // ignore storage errors
          }
        }
        setTeamLoading(false);
      }
    };

    void loadTeamId();

    return () => {
      cancelled = true;
    };
  }, []);

  return { teamId, teamLoading, teamError };
}
