import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

type TeamRole = 'super_admin' | 'manager' | 'viewer' | null;

type AuthState = {
  session: Session | null;
  userId: string | null;
  teamId: string | null;
  role: TeamRole;
  loading: boolean;
  refreshTeamContext: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>(null);
  const [loading, setLoading] = useState(true);

  const userId = session?.user?.id ?? null;

  const refreshTeamContext = async () => {
    if (!userId) {
      setTeamId(null);
      setRole(null);
      return;
    }

    let workspaceId: string | null = null;

    const { data: workspaceRpcData, error: workspaceRpcError } = await supabase
      .schema("tosho")
      .rpc("current_workspace_id");

    if (!workspaceRpcError && workspaceRpcData) {
      workspaceId = workspaceRpcData as string;
    }

    if (!workspaceId) {
      const { data, error } = await supabase
        .schema("tosho")
        .from("workspaces")
        .select("id")
        .limit(1)
        .single();

      if (!error) {
        workspaceId = (data as { id?: string } | null)?.id ?? null;
      }
    }

    let roleValue: TeamRole = null;
    if (workspaceId) {
      const { data: membership, error: membershipError } = await supabase
        .schema("tosho")
        .from("memberships_view")
        .select("access_role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .single();

      if (membershipError) {
        console.error("memberships_view error", membershipError);
      } else {
        const accessRole = (membership as { access_role?: string } | null)?.access_role ?? null;
        if (accessRole === "owner") roleValue = "super_admin";
        else if (accessRole === "admin") roleValue = "manager";
        else if (accessRole) roleValue = "viewer";
      }
    }

    setTeamId(null);
    setRole(roleValue);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!session?.user?.id) {
        setTeamId(null);
        setRole(null);
        return;
      }
      await refreshTeamContext();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId,
      teamId,
      role,
      loading,
      refreshTeamContext,
      signOut,
    }),
    [session, userId, teamId, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
