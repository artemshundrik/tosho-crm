import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import {
  assertSafeExternalUrl,
  fetchWithLimits,
  getBrowserLikeHeaders,
  isAllowedImageContentType,
} from "./_lib/externalFetch";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

/** Форма запиту — і перевірка, і тип (REQ-137). */
const requestSchema = z
  .object({
    bucket: z.string().optional(),
    storagePath: z.string().optional(),
    sourceUrl: z.string().optional(),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

const OPTIMIZED_ORIGINAL_QUALITY = 88;

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

function getOptimizedOriginalPath(storagePath: string) {
  const { basename } = splitStoragePath(storagePath);
  return `${basename}.webp`;
}

/** Стеля картинки — та сама, що у фонового дослідження лінків (REQ-233). */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 20_000;

async function fetchSourceImage(sourceUrl: string) {
  let last: { response: Response; body: Buffer } | null = null;
  let lastError: unknown = null;

  for (const includeReferer of [false, true]) {
    try {
      // fetchWithLimits, а не голий fetch: він перевіряє SSRF-сторожем КОЖЕН
      // перехід, а `redirect: "follow"` перевіряв лише першу адресу — тобто
      // будь-який сайт міг 302-м завести нас на внутрішню адресу.
      const result = await fetchWithLimits(sourceUrl, {
        timeoutMs: IMAGE_TIMEOUT_MS,
        maxBytes: MAX_IMAGE_BYTES,
        headers: getBrowserLikeHeaders(sourceUrl, { includeReferer }),
      });

      if (result.response.ok) return result;
      last = result;

      if (![403, 404, 429].includes(result.response.status)) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (last) return last;
  throw lastError ?? new Error("Failed to fetch source image");
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

async function renderOptimizedOriginal(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .webp({ quality: OPTIMIZED_ORIGINAL_QUALITY })
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

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const payload: RequestBody = parsed.data;

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

  try {
    await assertSafeExternalUrl(sourceUrl);
  } catch (error) {
    return jsonResponse(400, { error: error instanceof Error ? error.message : "Заборонений URL." });
  }

  let fetched: { response: Response; body: Buffer };
  try {
    fetched = await fetchSourceImage(sourceUrl);
  } catch {
    return jsonResponse(502, { error: "Failed to fetch source image" });
  }

  const { response } = fetched;
  if (!response.ok) {
    return jsonResponse(response.status, { error: `Source responded with ${response.status}` });
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!isAllowedImageContentType(contentType)) {
    return jsonResponse(415, { error: "Source URL did not return an image" });
  }

  const sourceBuffer = fetched.body;

  let originalBuffer: Buffer;
  let thumbBuffer: Buffer;
  let previewBuffer: Buffer;
  const originalPath = getOptimizedOriginalPath(storagePath);
  try {
    originalBuffer = await renderOptimizedOriginal(sourceBuffer);
    thumbBuffer = await renderVariant(sourceBuffer, 160);
    previewBuffer = await renderVariant(sourceBuffer, 640);
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Failed to generate image variants",
    });
  }

  const previewPath = getVariantPath(originalPath, "preview");
  const thumbPath = getVariantPath(originalPath, "thumb");

  const [{ error: originalError }, { error: previewError }, { error: thumbError }] = await Promise.all([
    adminClient.storage.from(bucket).upload(originalPath, originalBuffer, {
      upsert: true,
      contentType: "image/webp",
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
    storagePath: originalPath,
    previewPath,
    thumbPath,
    contentType: "image/webp",
    sizeBytes: originalBuffer.length,
  });
};
