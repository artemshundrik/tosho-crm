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

function normalizeAvatarKey(rawUrl: string) {
  return rawUrl.trim();
}

function extractObjectPath(url: string, bucket: string): string | null {
  const normalizedUrl = normalizeAvatarKey(url);
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ];

  for (const marker of markers) {
    const markerIndex = normalizedUrl.indexOf(marker);
    if (markerIndex === -1) continue;
    const tail = normalizedUrl.slice(markerIndex + marker.length);
    const pathPart = tail.split("?")[0] ?? "";
    if (!pathPart) return null;
    return decodeURIComponent(pathPart);
  }

  if (/^(https?:)?\/\//i.test(normalizedUrl) || normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
    return null;
  }

  const pathPart = normalizedUrl.replace(/^\/+/, "").split("?")[0] ?? "";
  if (!pathPart) return null;
  return decodeURIComponent(pathPart);
}

function isPublicStorageUrl(url: string, bucket: string) {
  return url.includes(`/storage/v1/object/public/${bucket}/`);
}

function isSupabaseStorageUrl(url: string, bucket: string) {
  return (
    url.includes(`/storage/v1/object/public/${bucket}/`) ||
    url.includes(`/storage/v1/object/sign/${bucket}/`) ||
    url.includes(`/storage/v1/object/${bucket}/`)
  );
}

function shouldResolveFromStorage(rawUrl: string, bucket: string) {
  const normalizedUrl = normalizeAvatarKey(rawUrl);
  if (!normalizedUrl) return false;
  if (isSupabaseStorageUrl(normalizedUrl, bucket)) return true;
  return !/^(https?:)?\/\//i.test(normalizedUrl) && !normalizedUrl.startsWith("data:") && !normalizedUrl.startsWith("blob:");
}

function setResolvedAvatar(rawUrl: string, resolved: string | null) {
  avatarResolvedCache.set(normalizeAvatarKey(rawUrl), resolved);
  persistCacheToSessionStorage();
}

export async function resolveAvatarDisplayUrl(
  supabase: SupabaseClient,
  rawUrl: string | null | undefined,
  bucket: string,
  options?: { forceRefresh?: boolean }
): Promise<string | null> {
  if (!rawUrl) return null;
  const normalizedRawUrl = normalizeAvatarKey(rawUrl);
  if (!normalizedRawUrl) return null;

  if (!options?.forceRefresh && avatarResolvedCache.has(normalizedRawUrl)) {
    return avatarResolvedCache.get(normalizedRawUrl) ?? null;
  }
  const inflight = !options?.forceRefresh ? avatarInflightCache.get(normalizedRawUrl) : null;
  if (inflight) return inflight;

  const promise = (async () => {
    const objectPath = extractObjectPath(normalizedRawUrl, bucket);
    if (!objectPath || !shouldResolveFromStorage(normalizedRawUrl, bucket)) {
      setResolvedAvatar(normalizedRawUrl, normalizedRawUrl);
      return normalizedRawUrl;
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, AVATAR_SIGN_TTL_SECONDS);

    const resolved = error || !data?.signedUrl ? normalizedRawUrl : data.signedUrl;
    setResolvedAvatar(normalizedRawUrl, resolved);
    return resolved;
  })();

  avatarInflightCache.set(normalizedRawUrl, promise);
  try {
    return await promise;
  } finally {
    avatarInflightCache.delete(normalizedRawUrl);
  }
}

export function getCachedAvatarDisplayUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const normalizedRawUrl = normalizeAvatarKey(rawUrl);
  if (!normalizedRawUrl) return null;
  return avatarResolvedCache.get(normalizedRawUrl) ?? null;
}
