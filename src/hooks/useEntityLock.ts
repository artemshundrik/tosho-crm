import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  acquireEntityLock,
  forceReleaseEntityLock,
  readEntityLock,
  releaseEntityLock,
  requestEntityLockRelease,
  type EntityLockType,
} from "@/lib/entityLock";
import { buildUserNameFromMetadata } from "@/lib/userName";
import { getCurrentUser } from "@/lib/currentUser";

/**
 * Блокування редагування з передачею.
 *
 * ГОЛОВНА ЗМІНА проти першої версії: heartbeat прив'язаний до ЖИВОЇ ЛЮДИНИ, а
 * не до відкритої вкладки. Раніше він цокав кожну хвилину незалежно від того,
 * чи хтось торкався клавіатури, тож людина, яка відкрила задачу й пішла
 * говорити по телефону, тримала її вічно — і навіть не знала про це. Саме
 * звідси бралися дзвінки «вийди, будь ласка, із задачі».
 *
 * Тепер простій сам віддає лок, а перед тим показує зворотний відлік.
 */

type UseEntityLockParams = {
  teamId?: string | null;
  entityType: EntityLockType;
  entityId?: string | null;
  userId?: string | null;
  userLabel?: string | null;
  enabled?: boolean;
  heartbeatMs?: number;
  ttlSeconds?: number;
  /** Скільки простою до автозвільнення. */
  idleReleaseMs?: number;
  /** За скільки до автозвільнення почати попереджати. */
  idleWarningMs?: number;
  /**
   * Зберегти роботу ПЕРЕД тим, як віддати лок.
   *
   * Викликається і при автозвільненні через простій, і коли людина віддає лок
   * сама. Сторінка тут зберігає чернетку й кладе знімок в історію версій —
   * щоб недописане не зникло разом із доступом.
   */
  onBeforeRelease?: () => Promise<void> | void;
};

export type EntityLockState = {
  loading: boolean;
  acquired: boolean;
  lockedByOther: boolean;
  holderName: string | null;
  error: string | null;
  /** Хто просить звільнити — бачить ТРИМАЧ. */
  releaseRequestedByName: string | null;
  /** Запит уже надіслано — бачить ПРОХАЧ. */
  releaseRequestSent: boolean;
  /** Секунди до автозвільнення; null — поки не попереджаємо. */
  idleSecondsLeft: number | null;
  /** Лок віддано, людина ще на сторінці: сама («manual») чи через простій («idle»). */
  releasedReason: "idle" | "manual" | null;
  requestRelease: () => Promise<void>;
  forceRelease: () => Promise<void>;
  /** Віддати лок самому — для стану «мене просять звільнити». */
  release: () => void;
  /** «Я тут» — гасить попередження. */
  keepAlive: () => void;
  /** Повернутись до редагування після автозвільнення. */
  resume: () => void;
};

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel"] as const;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

const fallbackUserLabelFromAuth = async () => {
  const user = await getCurrentUser();
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
  heartbeatMs = 30000,
  ttlSeconds = 180,
  idleReleaseMs = 5 * 60_000,
  idleWarningMs = 60_000,
  onBeforeRelease,
}: UseEntityLockParams): EntityLockState {
  const [state, setState] = useState({
    loading: !!enabled,
    acquired: false,
    lockedByOther: false,
    holderName: null as string | null,
    error: null as string | null,
    releaseRequestedByName: null as string | null,
  });
  const [releaseRequestSent, setReleaseRequestSent] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);
  const [releasedReason, setReleasedReason] = useState<"idle" | "manual" | null>(null);
  /** Ручний «стоп»: після автозвільнення не хапаємо лок назад без прохання. */
  const [paused, setPaused] = useState(false);

  const hasLockRef = useRef(false);
  const disabledAfterErrorRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  // Колбек у ref: інакше він потрапляє в залежності ефекту й перезапускає
  // весь цикл блокування на кожному рендері сторінки.
  const releaseNowRef = useRef<null | ((reason: "idle" | "manual") => Promise<void>)>(null);
  const onBeforeReleaseRef = useRef(onBeforeRelease);
  onBeforeReleaseRef.current = onBeforeRelease;

  const isEnabled = useMemo(
    () => !!enabled && !!teamId && !!entityId && !!userId && !paused,
    [enabled, teamId, entityId, userId, paused]
  );

  const keepAlive = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!isEnabled || !teamId || !entityId || !userId) {
      setState({
        loading: false,
        acquired: false,
        lockedByOther: false,
        holderName: null,
        error: null,
        releaseRequestedByName: null,
      });
      hasLockRef.current = false;
      return;
    }

    let alive = true;
    disabledAfterErrorRef.current = false;
    lastActivityRef.current = Date.now();

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true });
    }

    const attemptAcquire = async () => {
      if (disabledAfterErrorRef.current) return;
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
          releaseRequestedByName: result.acquired ? result.releaseRequestedByName : null,
        });
        // Лок звільнився й ми його взяли — власний запит більше не актуальний.
        if (result.acquired) setReleaseRequestSent(false);
      } catch (error: unknown) {
        if (!alive) return;
        disabledAfterErrorRef.current = true;
        hasLockRef.current = false;
        setState({
          loading: false,
          acquired: false,
          lockedByOther: false,
          holderName: null,
          error: getErrorMessage(error, "Не вдалося отримати блокування запису."),
          releaseRequestedByName: null,
        });
      }
    };

    /** Віддати лок, спершу зберігши роботу. */
    const releaseNow = async (reason: "idle" | "manual" | null) => {
      if (!hasLockRef.current) return;
      hasLockRef.current = false;
      try {
        await onBeforeReleaseRef.current?.();
      } catch {
        // Збереження не вдалося — лок однаково віддаємо: тримати задачу
        // заручником через невдалий запис гірше, ніж втратити його.
      }
      await releaseEntityLock({ teamId, entityType, entityId, userId }).catch(() => undefined);
      if (!alive) return;
      if (reason) {
        // Пауза обов'язкова: без неї heartbeat забрав би лок назад за 30 секунд,
        // і людина, яка щойно його віддала, знову тримала б задачу.
        setReleasedReason(reason);
        setPaused(true);
        setIdleSecondsLeft(null);
      }
    };
    releaseNowRef.current = releaseNow;

    setState((prev) => ({ ...prev, loading: true }));
    void attemptAcquire();

    const heartbeat = window.setInterval(() => {
      if (disabledAfterErrorRef.current) return;
      // Простій — не продовжуємо. Хай TTL добиває, якщо відлік не спрацював.
      if (Date.now() - lastActivityRef.current >= idleReleaseMs) return;
      void attemptAcquire();
    }, heartbeatMs);

    // Окремий секундний тікер лише для відліку — heartbeat для цього надто
    // рідкий, а робити його частішим означало б бити по базі щосекунди.
    const ticker = window.setInterval(() => {
      if (!hasLockRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;
      const leftMs = idleReleaseMs - idleMs;
      if (leftMs <= 0) {
        void releaseNow("idle");
        return;
      }
      setIdleSecondsLeft(leftMs <= idleWarningMs ? Math.ceil(leftMs / 1000) : null);
    }, 1000);

    // Realtime замість опитування: «звільнилось» і «просять звільнити» доходять
    // одразу. Без нього запит доїжджав би з затримкою до heartbeat — рівно та
    // затримка, через яку зараз дзвонять по телефону.
    const channel = supabase
      .channel(`entity-lock:${entityType}:${entityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "tosho", table: "entity_locks", filter: `entity_id=eq.${entityId}` },
        () => {
          if (!alive || disabledAfterErrorRef.current) return;
          if (hasLockRef.current) {
            // Ми тримач: читаємо рядок, щоб побачити прохання. Саме читаємо, а
            // не acquire — інакше оновлення стану перехоплювало б чужий лок.
            void readEntityLock({ teamId, entityType, entityId })
              .then((row) => {
                if (!alive || !row) return;
                setState((prev) => ({ ...prev, releaseRequestedByName: row.releaseRequestedByName }));
              })
              .catch(() => undefined);
            return;
          }
          void attemptAcquire();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      window.clearInterval(heartbeat);
      window.clearInterval(ticker);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActivity);
      void supabase.removeChannel(channel);
      if (hasLockRef.current) void releaseNow(null);
      hasLockRef.current = false;
    };
  }, [
    entityId,
    entityType,
    heartbeatMs,
    idleReleaseMs,
    idleWarningMs,
    isEnabled,
    teamId,
    ttlSeconds,
    userId,
    userLabel,
  ]);

  const requestRelease = useCallback(async () => {
    if (!teamId || !entityId || !userId) return;
    const label = userLabel?.trim() || (await fallbackUserLabelFromAuth());
    const result = await requestEntityLockRelease({
      teamId,
      entityType,
      entityId,
      userId,
      userLabel: label || null,
    });
    // Лока вже немає — просити нема кого, просто беремо.
    if (!result.requested && !result.lockedBy) return;
    setReleaseRequestSent(true);
  }, [entityId, entityType, teamId, userId, userLabel]);

  const forceRelease = useCallback(async () => {
    if (!teamId || !entityId) return;
    await forceReleaseEntityLock({ teamId, entityType, entityId });
  }, [entityId, entityType, teamId]);

  const release = useCallback(() => {
    void releaseNowRef.current?.("manual");
  }, []);

  const resume = useCallback(() => {
    lastActivityRef.current = Date.now();
    setReleasedReason(null);
    setIdleSecondsLeft(null);
    setPaused(false);
  }, []);

  return {
    ...state,
    releaseRequestSent,
    idleSecondsLeft,
    releasedReason,
    requestRelease,
    forceRelease,
    release,
    keepAlive,
    resume,
  };
}
