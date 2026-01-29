import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { QuotesPage } from "@/pages/QuotesPage";

export default function OrdersEstimatesPage() {
  const [teamId, setTeamId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("tosho.teamId");
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!teamId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTeamId = async () => {
      if (!teamId) {
        setLoading(true);
      }
      setError(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (!cancelled) {
          setError(userError?.message ?? "User not authenticated");
          setTeamId(null);
          setLoading(false);
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
          setError(teamError.message);
          setTeamId(null);
        } else {
          const nextTeamId = (data as { team_id?: string } | null)?.team_id ?? null;
          setTeamId(nextTeamId);
          try {
            if (nextTeamId) localStorage.setItem("tosho.teamId", nextTeamId);
          } catch {
            // ignore storage errors
          }
        }
        setLoading(false);
      }
    };

    void loadTeamId();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  return <QuotesPage teamId={teamId} />;
}
