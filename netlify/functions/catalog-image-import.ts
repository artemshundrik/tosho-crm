import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type RequestBody = {
  bucket?: string;
  storagePath?: string;
  sourceUrl?: string;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

function splitStoragePath(storagePath: string) {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  return {
    basename: match?.[1] ?? storagePath,
  };
}

function getVariantPath(storagePath: string, variant: "thumb" | "preview") {
  const { basename } = splitStoragePath(storagePath);
  return `${basename}__${variant}.webp`;
}

function isAllowedImageContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("image/jpeg") ||
    normalized.startsWith("image/png") ||
    normalized.startsWith("image/webp") ||
    normalized.startsWith("image/gif") ||
    normalized.startsWith("image/bmp") ||
    normalized.startsWith("image/tiff")
  );
}

async function renderVariant(buffer: Buffer, maxSize: number) {
  return sharp(buffer)
    .resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toBuffer();
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const bucket = (payload.bucket ?? "").trim();
  const storagePath = (payload.storagePath ?? "").trim();
  const sourceUrl = (payload.sourceUrl ?? "").trim();
  if (!bucket || !storagePath || !sourceUrl) {
    return jsonResponse(400, { error: "Missing bucket, storagePath, or sourceUrl" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "ToSho CRM catalog importer",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
  } catch {
    return jsonResponse(502, { error: "Failed to fetch source image" });
  }

  if (!response.ok) {
    return jsonResponse(response.status, { error: `Source responded with ${response.status}` });
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!isAllowedImageContentType(contentType)) {
    return jsonResponse(415, { error: "Source URL did not return an image" });
  }

  const arrayBuffer = await response.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);

  let thumbBuffer: Buffer;
  let previewBuffer: Buffer;
  try {
    thumbBuffer = await renderVariant(originalBuffer, 160);
    previewBuffer = await renderVariant(originalBuffer, 640);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Failed to generate image variants",
    });
  }

  const previewPath = getVariantPath(storagePath, "preview");
  const thumbPath = getVariantPath(storagePath, "thumb");

  const [{ error: originalError }, { error: previewError }, { error: thumbError }] = await Promise.all([
    adminClient.storage.from(bucket).upload(storagePath, originalBuffer, {
      upsert: true,
      contentType,
      cacheControl: "31536000, immutable",
    }),
    adminClient.storage.from(bucket).upload(previewPath, previewBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
    adminClient.storage.from(bucket).upload(thumbPath, thumbBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
  ]);

  if (originalError || previewError || thumbError) {
    return jsonResponse(500, {
      error: originalError?.message || previewError?.message || thumbError?.message || "Failed to upload imported image",
    });
  }

  return jsonResponse(200, {
    success: true,
    bucket,
    storagePath,
    previewPath,
    thumbPath,
    contentType,
    sizeBytes: originalBuffer.length,
  });
};
