import { useEffect, useRef } from "react";
import { toast } from "sonner";

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
const VERSION_TOAST_ID = "app-version-update";

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

function canReloadSafely(lastInteractionAt: number) {
  if (typeof document === "undefined") return false;
  if (document.hidden) return true;
  if (isEditableElement(document.activeElement)) return false;
  return Date.now() - lastInteractionAt >= SAFE_RELOAD_IDLE_MS;
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

export function AppVersionWatcher() {
  const pendingVersionRef = useRef<AppVersionPayload | null>(null);
  const lastInteractionAtRef = useRef(Date.now());
  const retryTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

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
      toast.dismiss(VERSION_TOAST_ID);
      markReload(version.buildId);
      window.location.reload();
    };

    const ensureVersionToast = () => {
      toast.info("CRM оновлено", {
        id: VERSION_TOAST_ID,
        duration: Infinity,
        description: "Вкладка перезавантажиться автоматично, коли ви завершите поточну дію.",
        action: {
          label: "Оновити зараз",
          onClick: () => {
            if (pendingVersionRef.current) {
              reloadForVersion(pendingVersionRef.current);
            }
          },
        },
      });
    };

    const scheduleRetry = () => {
      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        if (!pendingVersionRef.current) return;
        if (canReloadSafely(lastInteractionAtRef.current)) {
          reloadForVersion(pendingVersionRef.current);
          return;
        }
        ensureVersionToast();
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

    const activatePendingVersion = (version: AppVersionPayload, shouldBroadcast = false) => {
      if (!version.buildId || version.buildId === __APP_VERSION__.buildId) return;
      if (pendingVersionRef.current?.buildId === version.buildId) return;
      pendingVersionRef.current = version;
      if (shouldBroadcast) announceVersion(version);
      if (canReloadSafely(lastInteractionAtRef.current)) {
        reloadForVersion(version);
        return;
      }
      ensureVersionToast();
      scheduleRetry();
    };

    const fetchCurrentVersion = async () => {
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
        activatePendingVersion(payload as AppVersionPayload, true);
      } catch {
        // ignore transient polling issues
      }
    };

    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pendingVersionRef.current) {
          reloadForVersion(pendingVersionRef.current);
          return;
        }
        return;
      }
      markInteraction();
      void fetchCurrentVersion();
    };

    const handleWindowFocus = () => {
      markInteraction();
      void fetchCurrentVersion();
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
        activatePendingVersion(payload as AppVersionPayload, false);
      } catch {
        // ignore malformed storage events
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "mousemove",
      "touchstart",
      "focus",
    ];

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
        activatePendingVersion(event.data, false);
      };
    }

    pollTimerRef.current = window.setInterval(() => {
      void fetchCurrentVersion();
    }, VERSION_POLL_INTERVAL_MS);

    void fetchCurrentVersion();

    return () => {
      clearRetryTimer();
      clearPollTimer();
      toast.dismiss(VERSION_TOAST_ID);
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
