import { useAuth } from "@/auth/AuthProvider";

export function useTeamData() {
  const { teamId, loading, session } = useAuth();
  return {
    teamId,
    teamLoading: loading,
    teamError: !loading && !session ? "User not authenticated" : null,
  };
}
