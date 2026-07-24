import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

type AppVersionPayload = {
  version: string;
  buildId: string;
  builtAt: string;
};

const VERSION_CHECK_URL = "/version.json";
const VERSION_POLL_INTERVAL_MS = 180_000;
const VERSION_RETRY_INTERVAL_MS = 5_000;
const SAFE_RELOAD_IDLE_MS = 15_000;
const VERSION_BROADCAST_KEY = "tosho:app-version-update";
const VERSION_RELOAD_GUARD_KEY = "tosho:app-version-reload";

function isEditableElement(value: Element | null): value is HTMLElement {
  if (!(value instanceof HTMLElement)) return false;
  const tag = value.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    value.isContentEditable ||
    value.getAttribute("role") === "textbox"
  );
}

function editableFocused() {
  return typeof document !== "undefined" && isEditableElement(document.activeElement);
}

function shouldSkipReload(buildId: string) {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(VERSION_RELOAD_GUARD_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { buildId?: string; ts?: number };
    return (
      parsed.buildId === buildId &&
      typeof parsed.ts === "number" &&
      Date.now() - parsed.ts < 60_000
    );
  } catch {
    return false;
  }
}

function markReload(buildId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      VERSION_RELOAD_GUARD_KEY,
      JSON.stringify({ buildId, ts: Date.now() })
    );
  } catch {
    // ignore storage access issues
  }
}

/**
 * Silent auto-update. When a new deploy is detected the tab reloads itself at
 * the first SAFE moment — no toast, no button (review feedback: nobody presses
 * "Оновити", stale tabs then run broken bundles for weeks):
 *
 *  1. the tab goes to the background, or the user returns to it — unless the
 *     focus is in an editable field (an unsent draft must survive);
 *  2. an SPA navigation happens — the new page just mounted, nothing is typed;
 *  3. the tab is visible but quiet: no click/keystroke for 15s and no editable
 *     focused. Mouse movement deliberately does NOT count as interaction —
 *     counting it kept the reload from ever firing for active users.
 */
export function AppVersionWatcher() {
  const pendingVersionRef = useRef<AppVersionPayload | null>(null);
  const lastInteractionAtRef = useRef(Date.now());
  const retryTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const location = useLocation();

  // Rule 2: a route change is the safest reload moment — the destination just
  // mounted and nothing is typed yet. Reloading here loads the SAME url on the
  // fresh bundle, so the user lands exactly where they navigated.
  useEffect(() => {
    const pending = pendingVersionRef.current;
    if (!pending || editableFocused() || shouldSkipReload(pending.buildId)) return;
    markReload(pending.buildId);
    window.location.reload();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const clearPollTimer = () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const reloadForVersion = (version: AppVersionPayload) => {
      if (shouldSkipReload(version.buildId)) return;
      markReload(version.buildId);
      window.location.reload();
    };

    const canReloadSafely = () => {
      if (typeof document === "undefined") return false;
      if (document.hidden) return !editableFocused();
      if (editableFocused()) return false;
      return Date.now() - lastInteractionAtRef.current >= SAFE_RELOAD_IDLE_MS;
    };

    // Rule 3: visible but quiet — keep probing until the pause comes.
    const scheduleRetry = () => {
      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        if (!pendingVersionRef.current) return;
        if (canReloadSafely()) {
          reloadForVersion(pendingVersionRef.current);
          return;
        }
        scheduleRetry();
      }, VERSION_RETRY_INTERVAL_MS);
    };

    const announceVersion = (version: AppVersionPayload) => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage(version);
      }
      try {
        window.localStorage.setItem(
          VERSION_BROADCAST_KEY,
          JSON.stringify({ ...version, ts: Date.now() })
        );
      } catch {
        // ignore storage access issues
      }
    };

    const activatePendingVersion = (
      version: AppVersionPayload,
      options: { broadcast?: boolean; immediate?: boolean } = {}
    ) => {
      if (!version.buildId || version.buildId === __APP_VERSION__.buildId) return;
      if (pendingVersionRef.current?.buildId !== version.buildId) {
        pendingVersionRef.current = version;
        if (options.broadcast) announceVersion(version);
      }
      // Rule 1 (return leg): the user just came back — reload before they start
      // doing anything, unless a draft is focused.
      if (options.immediate && !editableFocused()) {
        reloadForVersion(version);
        return;
      }
      if (canReloadSafely()) {
        reloadForVersion(version);
        return;
      }
      scheduleRetry();
    };

    const fetchCurrentVersion = async (options: { immediate?: boolean } = {}) => {
      try {
        const response = await fetch(`${VERSION_CHECK_URL}?t=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as Partial<AppVersionPayload>;
        if (
          typeof payload.buildId !== "string" ||
          typeof payload.version !== "string" ||
          typeof payload.builtAt !== "string"
        ) {
          return;
        }
        activatePendingVersion(payload as AppVersionPayload, {
          broadcast: true,
          immediate: options.immediate,
        });
      } catch {
        // ignore transient polling issues
      }
    };

    // Only real input counts. Mouse movement is NOT interaction: with it in the
    // list, an active user never reached the idle window and the auto-reload
    // never fired (that is why the old toast just sat there forever).
    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Rule 1 (leave leg): reload the backgrounded tab so the user returns
        // to a fresh one — but never discard a focused draft.
        if (pendingVersionRef.current && !editableFocused()) {
          reloadForVersion(pendingVersionRef.current);
        }
        return;
      }
      // Returning is NOT interaction — marking it used to postpone the reload
      // exactly when it was safest. Check the version and reload right away.
      void fetchCurrentVersion({ immediate: true });
    };

    const handleWindowFocus = () => {
      void fetchCurrentVersion({ immediate: true });
    };

    const handleOnline = () => {
      void fetchCurrentVersion();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== VERSION_BROADCAST_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as Partial<AppVersionPayload>;
        if (
          typeof payload.buildId !== "string" ||
          typeof payload.version !== "string" ||
          typeof payload.builtAt !== "string"
        ) {
          return;
        }
        activatePendingVersion(payload as AppVersionPayload);
      } catch {
        // ignore malformed storage events
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markInteraction, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("storage", handleStorage);

    if ("BroadcastChannel" in window) {
      broadcastChannelRef.current = new BroadcastChannel(VERSION_BROADCAST_KEY);
      broadcastChannelRef.current.onmessage = (event: MessageEvent<AppVersionPayload>) => {
        if (!event.data) return;
        activatePendingVersion(event.data);
      };
    }

    pollTimerRef.current = window.setInterval(() => {
      void fetchCurrentVersion();
    }, VERSION_POLL_INTERVAL_MS);

    void fetchCurrentVersion();

    return () => {
      clearRetryTimer();
      clearPollTimer();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markInteraction);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("storage", handleStorage);
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  return null;
}
