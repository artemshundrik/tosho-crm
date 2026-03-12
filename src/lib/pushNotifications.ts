import { supabase } from "@/lib/supabaseClient";

const PUSH_SW_URL = "/push-sw.js";
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined)?.trim() ?? "";

type PushSubscriptionRow = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  last_seen_at: string;
  disabled_at: string | null;
};

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return Notification.permission;
}

export function hasPushConfig() {
  return Boolean(VAPID_PUBLIC_KEY);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function upsertSubscription(userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON();
  const endpoint = typeof json.endpoint === "string" ? json.endpoint : "";
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is incomplete");
  }

  const row: PushSubscriptionRow = {
    endpoint,
    user_id: userId,
    p256dh,
    auth,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    last_seen_at: new Date().toISOString(),
    disabled_at: null,
  };

  const { error } = await supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) throw error;
}

async function getReadyServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active) {
    return existing;
  }

  await navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" });
  const ready = await navigator.serviceWorker.ready;
  if (!ready.active) {
    throw new Error("Service Worker is not active yet");
  }
  return ready;
}

export async function ensurePushSubscription(userId: string) {
  if (!isPushSupported()) return { enabled: false, reason: "unsupported" as const };
  if (!hasPushConfig()) return { enabled: false, reason: "missing_config" as const };
  if (getPushPermission() !== "granted") return { enabled: false, reason: "permission_not_granted" as const };

  const registration = await getReadyServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await upsertSubscription(userId, subscription);
  return { enabled: true as const, subscription };
}

export async function requestAndEnablePush(userId: string) {
  if (!isPushSupported()) throw new Error("Browser push is not supported");
  if (!hasPushConfig()) throw new Error("Missing VAPID public key");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { enabled: false as const, permission };
  }
  const result = await ensurePushSubscription(userId);
  return { ...result, permission };
}

export async function disablePush(userId: string) {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;

  if (subscription) {
    await subscription.unsubscribe();
  }

  if (endpoint) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ disabled_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
  }
}

export async function getPushEnabled(userId: string) {
  if (!isPushSupported() || !hasPushConfig()) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint)
    .is("disabled_at", null)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.endpoint);
}
