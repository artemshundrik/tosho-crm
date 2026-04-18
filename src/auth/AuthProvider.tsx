import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invalidateWorkspaceResolution, resolveWorkspaceId, resolveWorkspaceMembership } from '@/lib/workspace';
import { buildPermissions, mapAccessRoleToTeamRole, type AccessRole, type AppPermissions, type JobRole, type TeamRole } from '@/lib/permissions';

type AuthState = {
  session: Session | null;
  userId: string | null;
  teamId: string | null;
  role: TeamRole;
  accessRole: AccessRole;
  jobRole: JobRole;
  permissions: AppPermissions;
  loading: boolean;
  refreshTeamContext: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const isMissingRelationError = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("does not exist") || normalized.includes("relation");
};

async function resolveOperationalTeamId(userId: string, workspaceId: string | null) {
  const attempts = [
    () =>
      supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ team_id?: string | null }>(),
    () =>
      supabase
        .schema("tosho")
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ team_id?: string | null }>(),
  ];

  for (const run of attempts) {
    const { data, error } = await run();
    if (!error && data?.team_id) {
      return data.team_id;
    }
    if (error && !isMissingRelationError(error.message)) {
      throw error;
    }
  }

  return workspaceId;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>(null);
  const [accessRole, setAccessRole] = useState<AccessRole>(null);
  const [jobRole, setJobRole] = useState<JobRole>(null);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id ?? null;
  const userIdRef = useRef<string | null>(null);

  const resetTeamContext = useCallback(() => {
    setTeamId(null);
    setRole(null);
    setAccessRole(null);
    setJobRole(null);
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const refreshTeamContext = useCallback(async (targetUserId?: string | null, options?: { forceRefresh?: boolean }) => {
    const effectiveUserId = targetUserId ?? userId;
    if (!effectiveUserId) {
      resetTeamContext();
      return;
    }

    if (options?.forceRefresh) {
      invalidateWorkspaceResolution(effectiveUserId);
    }

    const workspaceId = await resolveWorkspaceId(effectiveUserId, options);

    let roleValue: TeamRole = null;
    let accessRoleValue: AccessRole = null;
    let jobRoleValue: JobRole = null;
    if (workspaceId) {
      const membership = await resolveWorkspaceMembership(workspaceId, effectiveUserId, options);
      if (membership) {
        accessRoleValue = (membership.accessRole as AccessRole) ?? null;
        jobRoleValue = (membership.jobRole as JobRole) ?? null;
        roleValue = mapAccessRoleToTeamRole(accessRoleValue);
      }
    }

    const operationalTeamId = await resolveOperationalTeamId(effectiveUserId, workspaceId);
    setTeamId(operationalTeamId);
    setRole(roleValue);
    setAccessRole(accessRoleValue);
    setJobRole(jobRoleValue);
  }, [resetTeamContext, userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const nextSession = data.session ?? null;
        setSession(nextSession);
        if (nextSession?.user?.id) {
          try {
            await refreshTeamContext(nextSession.user.id, { forceRefresh: true });
          } catch (error) {
            console.error("Failed to initialize team context", error);
            if (mounted) {
              resetTeamContext();
            }
          }
        } else {
          resetTeamContext();
        }
      } catch (error) {
        console.error("Failed to initialize auth state", error);
        if (!mounted) return;
        setSession(null);
        resetTeamContext();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);

      // Do not block UI on token refresh events. They happen in background and
      // should not remount protected routes.
      if (event === "TOKEN_REFRESHED") {
        return;
      }

      // Lightweight handling for sign-out.
      if (event === "SIGNED_OUT") {
        resetTeamContext();
        setLoading(false);
        return;
      }

      const nextUserId = nextSession?.user?.id ?? null;
      if (!nextUserId) {
        resetTeamContext();
        setLoading(false);
        return;
      }

      // Keep UI stable for any auth event affecting the same user
      // (token refresh, session sync, user profile updates, etc).
      if (nextUserId === userIdRef.current) {
        void refreshTeamContext(nextUserId, { forceRefresh: true }).catch((error) => {
          console.error("Failed to refresh auth context", error);
        });
        return;
      }

      // Only block UI when auth context switches to another user.
      setLoading(true);
      void (async () => {
        try {
          await refreshTeamContext(nextUserId, { forceRefresh: true });
        } catch (error) {
          console.error("Failed to switch auth context", error);
          if (mounted) {
            resetTeamContext();
          }
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshTeamContext, resetTeamContext]);

  useEffect(() => {
    if (!userId) return;

    const refreshAccess = () => {
      void refreshTeamContext(userId, { forceRefresh: true }).catch((error) => {
        console.error("Failed to refresh auth context on visibility change", error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAccess();
      }
    };

    window.addEventListener("focus", refreshAccess);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshAccess);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshTeamContext, userId]);

  const permissions = useMemo(
    () => buildPermissions({ role, accessRole, jobRole }),
    [role, accessRole, jobRole],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId,
      teamId,
      role,
      accessRole,
      jobRole,
      permissions,
      loading,
      refreshTeamContext,
      signOut,
    }),
    [session, userId, teamId, role, accessRole, jobRole, permissions, loading, refreshTeamContext],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
