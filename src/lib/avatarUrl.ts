import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_SIGN_TTL_SECONDS = 60 * 60 * 24 * 7;
const AVATAR_CACHE_SKEW_MS = 5 * 60 * 1000;
const AVATAR_FAILURE_TTL_MS = 5 * 60 * 1000;
const AVATAR_CACHE_KEY = "avatar-url-cache-v4";
const LEGACY_AVATAR_CACHE_KEYS = ["avatar-url-cache-v1", "avatar-url-cache-v2", "avatar-url-cache-v3"];
type AvatarCacheEntry = {
  value: string | null;
  expiresAt: number | null;
};
const avatarResolvedCache = new Map<string, AvatarCacheEntry>();
const avatarInflightCache = new Map<string, Promise<string | null>>();

export type AvatarAssetVariant = "xs" | "md" | "hero";

function isExpired(entry?: AvatarCacheEntry | null) {
  if (!entry) return true;
  return entry.expiresAt !== null && entry.expiresAt <= Date.now();
}

function loadCacheFromSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const legacyKey of LEGACY_AVATAR_CACHE_KEYS) {
      window.sessionStorage.removeItem(legacyKey);
    }
    const raw = window.sessionStorage.getItem(AVATAR_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, AvatarCacheEntry | string | null>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || value === null) {
        avatarResolvedCache.set(key, { value, expiresAt: null });
        continue;
      }
      if (value && typeof value === "object") {
        avatarResolvedCache.set(key, {
          value: "value" in value ? value.value ?? null : null,
          expiresAt: "expiresAt" in value && typeof value.expiresAt === "number" ? value.expiresAt : null,
        });
      }
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

function getAvatarAssetVariant(variant?: AvatarAssetVariant): AvatarAssetVariant {
  return variant ?? "xs";
}

function getAvatarCacheKey(rawUrl: string, variant: AvatarAssetVariant) {
  return `${normalizeAvatarKey(rawUrl)}::${variant}`;
}

function replaceAvatarVariantInPath(path: string, variant: AvatarAssetVariant): string {
  return path.replace(/\/(xs|md|hero|sm|lg)(\.[^/.?]+)$/i, `/${variant}$2`);
}

function getAvatarVariantPath(objectPath: string, variant: AvatarAssetVariant): string {
  if (/\/(xs|md|hero|sm|lg)(\.[^/.?]+)$/i.test(objectPath)) {
    return replaceAvatarVariantInPath(objectPath, variant);
  }
  return objectPath;
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

  let pathPart = normalizedUrl.replace(/^\/+/, "").split("?")[0] ?? "";
  if (pathPart.startsWith(`${bucket}/`)) {
    pathPart = pathPart.slice(bucket.length + 1);
  }
  if (!pathPart) return null;
  return decodeURIComponent(pathPart);
}

function extractObjectPathCandidates(url: string, bucket: string): string[] {
  const normalizedUrl = normalizeAvatarKey(url);
  if (!normalizedUrl) return [];

  const directCandidates = new Set<string>();
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ];

  for (const marker of markers) {
    const markerIndex = normalizedUrl.indexOf(marker);
    if (markerIndex === -1) continue;
    const tail = normalizedUrl.slice(markerIndex + marker.length);
    const pathPart = decodeURIComponent((tail.split("?")[0] ?? "").replace(/^\/+/, ""));
    if (!pathPart) continue;
    directCandidates.add(pathPart);
    if (pathPart.startsWith(`${bucket}/`)) {
      directCandidates.add(pathPart.slice(bucket.length + 1));
    } else {
      directCandidates.add(`${bucket}/${pathPart}`);
    }
  }

  if (directCandidates.size > 0) {
    return Array.from(directCandidates).filter(Boolean);
  }

  if (/^(https?:)?\/\//i.test(normalizedUrl) || normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
    return [];
  }

  const pathPart = decodeURIComponent((normalizedUrl.replace(/^\/+/, "").split("?")[0] ?? "").trim());
  if (!pathPart) return [];
  if (pathPart.startsWith(`${bucket}/`)) {
    return [pathPart, pathPart.slice(bucket.length + 1)].filter(Boolean);
  }
  return [pathPart, `${bucket}/${pathPart}`];
}

function isDirectAvatarHttpUrl(value: string) {
  return (
    /^(https?:)?\/\//i.test(value) &&
    !/\/rest\/v1\//i.test(value) &&
    !/\/storage\/v1\/object\//i.test(value) &&
    !/[?&]select=/i.test(value)
  );
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
  if (normalizedUrl.includes(`/storage/v1/object/public/${bucket}/`)) return true;
  if (normalizedUrl.includes(`/storage/v1/object/sign/${bucket}/`)) return true;
  if (normalizedUrl.includes(`/storage/v1/object/${bucket}/`)) return true;
  if (/^(https?:)?\/\//i.test(normalizedUrl) || normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
    return false;
  }

  const objectPath = extractObjectPath(normalizedUrl, bucket);
  return Boolean(objectPath && objectPath.includes("/"));
}

export function sanitizeAvatarReference(rawUrl: string | null | undefined, bucket: string): string | null {
  if (!rawUrl) return null;
  const normalizedRawUrl = normalizeAvatarKey(rawUrl);
  if (!normalizedRawUrl) return null;
  const lower = normalizedRawUrl.toLowerCase();

  if (lower.includes("/rest/v1/") || lower.includes("?select=") || lower.includes("&select=")) {
    return null;
  }

  if (isDirectAvatarHttpUrl(normalizedRawUrl) || normalizedRawUrl.startsWith("data:") || normalizedRawUrl.startsWith("blob:")) {
    return normalizedRawUrl;
  }

  const objectPath = extractObjectPath(normalizedRawUrl, bucket);
  if (!objectPath) return null;
  if (!objectPath.includes("/")) return null;
  return normalizedRawUrl;
}

export function getCanonicalAvatarReference(
  params: { avatarUrl?: string | null; avatarPath?: string | null },
  bucket: string
): string | null {
  const directUrl = sanitizeAvatarReference(params.avatarUrl ?? null, bucket);
  if (directUrl && isDirectAvatarHttpUrl(directUrl)) {
    return directUrl;
  }

  const path = sanitizeAvatarReference(params.avatarPath ?? null, bucket);
  if (path) return path;

  return directUrl;
}

export function getImmediateAvatarDisplayUrl(
  rawUrl: string | null | undefined,
  bucket: string,
  variant?: AvatarAssetVariant
): string | null {
  const normalizedRawUrl = sanitizeAvatarReference(rawUrl, bucket);
  if (!normalizedRawUrl) return null;
  if (!shouldResolveFromStorage(normalizedRawUrl, bucket)) {
    return normalizedRawUrl;
  }
  void variant;
  return null;
}

function getCachedResolvedAvatar(rawUrl: string | null | undefined, variant?: AvatarAssetVariant) {
  if (!rawUrl) return null;
  const key = getAvatarCacheKey(rawUrl, getAvatarAssetVariant(variant));
  if (!key) return null;
  const entry = avatarResolvedCache.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    avatarResolvedCache.delete(key);
    persistCacheToSessionStorage();
    return null;
  }
  return entry.value ?? null;
}

function setResolvedAvatar(rawUrl: string, variant: AvatarAssetVariant | undefined, resolved: string | null, expiresAt: number | null = null) {
  avatarResolvedCache.set(getAvatarCacheKey(rawUrl, getAvatarAssetVariant(variant)), { value: resolved, expiresAt });
  persistCacheToSessionStorage();
}

export async function resolveAvatarDisplayUrl(
  supabase: SupabaseClient,
  rawUrl: string | null | undefined,
  bucket: string,
  options?: { forceRefresh?: boolean; preferOriginal?: boolean; assetVariant?: AvatarAssetVariant }
): Promise<string | null> {
  const normalizedRawUrl = sanitizeAvatarReference(rawUrl, bucket);
  if (!normalizedRawUrl) return null;
  const variant = getAvatarAssetVariant(options?.assetVariant);

  if (!options?.forceRefresh) {
    const cached = getCachedResolvedAvatar(normalizedRawUrl, variant);
    if (cached !== null) return cached;
  }
  const inflightKey = getAvatarCacheKey(normalizedRawUrl, variant);
  const inflight = !options?.forceRefresh ? avatarInflightCache.get(inflightKey) : null;
  if (inflight) return inflight;

  const promise = (async () => {
    const objectPath = extractObjectPath(normalizedRawUrl, bucket);
    if (!objectPath || !shouldResolveFromStorage(normalizedRawUrl, bucket)) {
      setResolvedAvatar(normalizedRawUrl, variant, normalizedRawUrl, null);
      return normalizedRawUrl;
    }

    const candidatePaths = extractObjectPathCandidates(normalizedRawUrl, bucket);
    for (const candidatePath of candidatePaths) {
      const variantPath = getAvatarVariantPath(candidatePath, variant);
      const preferredPath = options?.preferOriginal ? candidatePath : variantPath;
      const fallbackPath = options?.preferOriginal ? variantPath : candidatePath;

      for (const path of [preferredPath, fallbackPath]) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, AVATAR_SIGN_TTL_SECONDS);

        if (error || !data?.signedUrl) continue;

        const expiresAt = Date.now() + AVATAR_SIGN_TTL_SECONDS * 1000 - AVATAR_CACHE_SKEW_MS;
        setResolvedAvatar(normalizedRawUrl, variant, data.signedUrl, expiresAt);
        return data.signedUrl;
      }
    }

    setResolvedAvatar(normalizedRawUrl, variant, null, Date.now() + AVATAR_FAILURE_TTL_MS);
    return null;
  })();

  avatarInflightCache.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    avatarInflightCache.delete(inflightKey);
  }
}

export function getCachedAvatarDisplayUrl(rawUrl: string | null | undefined, variant?: AvatarAssetVariant): string | null {
  return getCachedResolvedAvatar(rawUrl, getAvatarAssetVariant(variant));
}
