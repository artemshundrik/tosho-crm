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

    const [{ data: teamIdData, error: teamIdError }, { data: roleData, error: roleError }] =
      await Promise.all([
        supabase.rpc('current_team_id'),
        supabase.rpc('current_team_role'),
      ]);

    if (teamIdError) console.error('current_team_id error', teamIdError);
    if (roleError) console.error('current_team_role error', roleError);

    setTeamId(teamIdData ?? null);
    setRole((roleData as TeamRole) ?? null);
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
