import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_SIGN_TTL_SECONDS = 60 * 60 * 24 * 7;

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

  const objectPath = extractObjectPath(rawUrl, bucket);
  if (!objectPath) return rawUrl;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, AVATAR_SIGN_TTL_SECONDS);

  if (error || !data?.signedUrl) return rawUrl;
  return data.signedUrl;
}

