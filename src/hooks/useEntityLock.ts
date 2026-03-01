import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { acquireEntityLock, releaseEntityLock, type EntityLockType } from "@/lib/entityLock";
import { buildUserNameFromMetadata } from "@/lib/userName";

type UseEntityLockParams = {
  teamId?: string | null;
  entityType: EntityLockType;
  entityId?: string | null;
  userId?: string | null;
  userLabel?: string | null;
  enabled?: boolean;
  heartbeatMs?: number;
  ttlSeconds?: number;
};

type UseEntityLockState = {
  loading: boolean;
  acquired: boolean;
  lockedByOther: boolean;
  holderName: string | null;
  error: string | null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

const fallbackUserLabelFromAuth = async () => {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return "";
  const resolved = buildUserNameFromMetadata(
    user.user_metadata as Record<string, unknown> | undefined,
    user.email
  );
  return resolved.displayName || user.email?.split("@")[0]?.trim() || "";
};

export function useEntityLock({
  teamId,
  entityType,
  entityId,
  userId,
  userLabel,
  enabled = true,
  heartbeatMs = 15000,
  ttlSeconds = 45,
}: UseEntityLockParams): UseEntityLockState {
  const [state, setState] = useState<UseEntityLockState>({
    loading: !!enabled,
    acquired: false,
    lockedByOther: false,
    holderName: null,
    error: null,
  });
  const hasLockRef = useRef(false);

  const isEnabled = useMemo(
    () => !!enabled && !!teamId && !!entityId && !!userId,
    [enabled, teamId, entityId, userId]
  );

  useEffect(() => {
    if (!isEnabled || !teamId || !entityId || !userId) {
      setState({
        loading: false,
        acquired: false,
        lockedByOther: false,
        holderName: null,
        error: null,
      });
      hasLockRef.current = false;
      return;
    }

    let alive = true;

    const attemptAcquire = async () => {
      try {
        const effectiveUserLabel = userLabel?.trim() || (await fallbackUserLabelFromAuth());
        const result = await acquireEntityLock({
          teamId,
          entityType,
          entityId,
          userId,
          userLabel: effectiveUserLabel || null,
          ttlSeconds,
        });
        if (!alive) return;
        hasLockRef.current = result.acquired;
        setState({
          loading: false,
          acquired: result.acquired,
          lockedByOther: !result.acquired,
          holderName: result.lockedByName || result.lockedBy || null,
          error: null,
        });
      } catch (error: unknown) {
        if (!alive) return;
        hasLockRef.current = false;
        setState({
          loading: false,
          acquired: false,
          lockedByOther: false,
          holderName: null,
          error: getErrorMessage(error, "Не вдалося отримати блокування запису."),
        });
      }
    };

    setState((prev) => ({ ...prev, loading: true }));
    void attemptAcquire();

    const interval = window.setInterval(() => {
      void attemptAcquire();
    }, heartbeatMs);

    return () => {
      alive = false;
      window.clearInterval(interval);
      if (hasLockRef.current) {
        void releaseEntityLock({
          teamId,
          entityType,
          entityId,
          userId,
        }).catch(() => undefined);
      }
      hasLockRef.current = false;
    };
  }, [entityId, entityType, heartbeatMs, isEnabled, teamId, ttlSeconds, userId, userLabel]);

  return state;
}
