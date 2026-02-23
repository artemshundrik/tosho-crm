import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_SIGN_TTL_SECONDS = 60 * 60 * 24 * 7;
const AVATAR_CACHE_KEY = "avatar-url-cache-v1";
const avatarResolvedCache = new Map<string, string | null>();
const avatarInflightCache = new Map<string, Promise<string | null>>();

function loadCacheFromSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    for (const [key, value] of Object.entries(parsed)) {
      avatarResolvedCache.set(key, value);
    }
  } catch {
    // ignore malformed cache
  }
}

function persistCacheToSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    const payload = Object.fromEntries(avatarResolvedCache.entries());
    window.sessionStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota/availability errors
  }
}

loadCacheFromSessionStorage();

function extractObjectPath(url: string, bucket: string): string | null {
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ];

  for (const marker of markers) {
    const markerIndex = url.indexOf(marker);
    if (markerIndex === -1) continue;
    const tail = url.slice(markerIndex + marker.length);
    const pathPart = tail.split("?")[0] ?? "";
    if (!pathPart) return null;
    return decodeURIComponent(pathPart);
  }

  return null;
}

export async function resolveAvatarDisplayUrl(
  supabase: SupabaseClient,
  rawUrl: string | null | undefined,
  bucket: string
): Promise<string | null> {
  if (!rawUrl) return null;
  if (avatarResolvedCache.has(rawUrl)) {
    return avatarResolvedCache.get(rawUrl) ?? null;
  }
  const inflight = avatarInflightCache.get(rawUrl);
  if (inflight) return inflight;

  const promise = (async () => {
    const objectPath = extractObjectPath(rawUrl, bucket);
    if (!objectPath) {
      avatarResolvedCache.set(rawUrl, rawUrl);
      persistCacheToSessionStorage();
      return rawUrl;
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, AVATAR_SIGN_TTL_SECONDS);

    const resolved = error || !data?.signedUrl ? rawUrl : data.signedUrl;
    avatarResolvedCache.set(rawUrl, resolved);
    persistCacheToSessionStorage();
    return resolved;
  })();

  avatarInflightCache.set(rawUrl, promise);
  try {
    return await promise;
  } finally {
    avatarInflightCache.delete(rawUrl);
  }
}

export function getCachedAvatarDisplayUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  return avatarResolvedCache.get(rawUrl) ?? null;
}
