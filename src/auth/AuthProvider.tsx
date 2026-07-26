import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { invalidateWorkspaceResolution, resolveWorkspaceId, resolveWorkspaceMembership } from '@/lib/workspace';
import { buildPermissions, mapAccessRoleToTeamRole, type AccessRole, type AppPermissions, type JobRole, type TeamRole } from '@/lib/permissions';
import { readViewAs, VIEW_AS_CHANGED_EVENT, type ViewAsTarget } from '@/auth/viewAs';
import { defaultModuleAccess, type ModuleAccess } from '@/lib/moduleAccess';
import {
  getCachedCurrentWorkspaceMemberDirectoryEntry,
  getCurrentWorkspaceMemberDirectoryEntry,
  listWorkspaceMemberDirectory,
  WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT,
} from '@/lib/workspaceMemberDirectory';

type AuthState = {
  session: Session | null;
  userId: string | null;
  teamId: string | null;
  role: TeamRole;
  accessRole: AccessRole;
  jobRole: JobRole;
  permissions: AppPermissions;
  /**
   * Дозволені модулі — вже з урахуванням режиму «Дивитись як».
   *
   * `undefined` = ще вантажиться (не показуй меню, бо блимне зайвим). Якщо
   * запису в довіднику немає, повертаємо дефолти за роллю, а не null: інакше
   * сайдбар (який трактував відсутність як «дозволено») і роут-гейт (який
   * вимагав явне true) розходилися, і людина бачила пункт меню, але на кліку
   * отримувала «потрібен доступ».
   *
   * Раніше кожен споживач сам кликав `getCurrentWorkspaceMemberDirectoryEntry()`,
   * а та функція вміє повертати ЛИШЕ власний запис — тому в режимі перегляду
   * підмінялись ролі, але не галочки модулів, і owner бачив своє меню очима
   * дизайнера. Тепер підміна одна на весь застосунок, тут.
   */
  moduleAccess: ModuleAccess | undefined;
  /** Активна ціль режиму «Дивитись як» (лише owner); null — звичайний режим. */
  viewAs: ViewAsTarget | null;
  /** Чи має право вмикати режим (owner). */
  canUseViewAs: boolean;
  /**
   * Чиї дані ПОКАЗУВАТИ. У режимі «Дивитись як» — id обраної людини, інакше
   * власний. Навмисно окремо від `userId`: той лишається справжнім, бо на ньому
   * будуються записи (автор задачі, коментаря), і підміна зробила б фальшиве
   * авторство. Використовуй лише для читання/відображення.
   */
  viewUserId: string | null;
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
        .from("team_members" as never)
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

    // Hard lockout: if the user has been offboarded (employment_status
    // inactive/rejected) they must not stay in the app — even with a currently
    // open tab. The RLS gates already deny their data, this forces a clean
    // logout instead of a broken UI. Runs on every focus/visibility refresh.
    try {
      const { data: blocked, error: blockedError } = await supabase
        .schema("tosho")
        .rpc("current_user_blocked");
      if (!blockedError && blocked === true) {
        resetTeamContext();
        await supabase.auth.signOut();
        return;
      }
    } catch (error) {
      // RPC not deployed yet or transient failure — fall through, never lock a
      // legitimate user out because the check itself errored.
      console.error("Failed to check access lockout", error);
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

  /**
   * Режим «Дивитись як» (тільки owner): підміняємо ролі в ОДНІЙ точці, тому
   * весь застосунок автоматично рендериться очима обраної людини — окремих
   * перевірок по компонентах не треба. Сесія Supabase не змінюється, тож RLS
   * лишається owner-івською: це UI-режим, не безпека (див. src/auth/viewAs.ts).
   */
  const [viewAs, setViewAs] = useState<ViewAsTarget | null>(() => readViewAs());
  useEffect(() => {
    const sync = () => setViewAs(readViewAs());
    window.addEventListener(VIEW_AS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(VIEW_AS_CHANGED_EVENT, sync);
  }, []);

  const realPermissions = useMemo(
    () => buildPermissions({ role, accessRole, jobRole }),
    [role, accessRole, jobRole],
  );
  // Вмикати може лише owner — інакше режим став би дірою в правах.
  const activeViewAs = realPermissions.isSuperAdmin ? viewAs : null;

  const effectiveRole = activeViewAs ? mapAccessRoleToTeamRole(activeViewAs.accessRole) : role;
  const effectiveAccessRole = (activeViewAs ? activeViewAs.accessRole : accessRole) as AccessRole | null;
  const effectiveJobRole = (activeViewAs ? activeViewAs.jobRole : jobRole) as JobRole | null;

  const permissions = useMemo(
    () =>
      activeViewAs
        ? buildPermissions({
            role: effectiveRole,
            accessRole: effectiveAccessRole,
            jobRole: effectiveJobRole,
          })
        : realPermissions,
    [activeViewAs, effectiveRole, effectiveAccessRole, effectiveJobRole, realPermissions],
  );

  /**
   * Дозволені модулі тієї людини, чиїми очима дивимось.
   *
   * У звичайному режимі це власний запис із довідника; у режимі «Дивитись як» —
   * запис обраної людини, який доводиться шукати в повному списку, бо
   * `getCurrentWorkspaceMemberDirectoryEntry` вміє лише «поточного».
   */
  const targetUserId = activeViewAs?.userId ?? userId;
  const [moduleAccess, setModuleAccess] = useState<ModuleAccess | undefined>(() =>
    activeViewAs ? undefined : getCachedCurrentWorkspaceMemberDirectoryEntry()?.moduleAccess,
  );

  useEffect(() => {
    let cancelled = false;
    // Немає запису в довіднику — беремо дефолти за роллю, а не «нічого».
    const fallback = () =>
      defaultModuleAccess({ accessRole: effectiveAccessRole, jobRole: effectiveJobRole });

    if (!targetUserId) {
      setModuleAccess(fallback());
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      try {
        if (!activeViewAs) {
          const entry = await getCurrentWorkspaceMemberDirectoryEntry();
          if (!cancelled) setModuleAccess(entry?.moduleAccess ?? fallback());
          return;
        }
        const workspaceId = await resolveWorkspaceId(userId!);
        if (!workspaceId) {
          if (!cancelled) setModuleAccess(fallback());
          return;
        }
        const rows = await listWorkspaceMemberDirectory(workspaceId);
        const entry = rows.find((row) => row.userId === targetUserId);
        if (!cancelled) setModuleAccess(entry?.moduleAccess ?? fallback());
      } catch (error) {
        console.error('Failed to resolve module access', error);
        if (!cancelled) setModuleAccess(fallback());
      }
    };

    void load();

    // Змінили комусь доступи — перечитуємо, не чекаючи перезавантаження.
    const handleDirectoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === targetUserId) void load();
    };
    window.addEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleDirectoryUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKSPACE_MEMBER_DIRECTORY_UPDATED_EVENT, handleDirectoryUpdate);
    };
  }, [activeViewAs, effectiveAccessRole, effectiveJobRole, targetUserId, userId]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId,
      teamId,
      role: effectiveRole,
      accessRole: effectiveAccessRole,
      jobRole: effectiveJobRole,
      permissions,
      moduleAccess,
      loading,
      refreshTeamContext,
      signOut,
      viewAs: activeViewAs,
      canUseViewAs: realPermissions.isSuperAdmin,
      viewUserId: activeViewAs?.userId ?? userId,
    }),
    [
      session,
      userId,
      teamId,
      effectiveRole,
      effectiveAccessRole,
      effectiveJobRole,
      permissions,
      moduleAccess,
      loading,
      refreshTeamContext,
      activeViewAs,
      realPermissions.isSuperAdmin,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
