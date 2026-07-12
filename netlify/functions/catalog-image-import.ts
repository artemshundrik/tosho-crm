import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import dnsPromises from "node:dns/promises";
import net from "node:net";

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

function getSourceOrigin(sourceUrl: string) {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return undefined;
  }
}

function getBrowserLikeHeaders(sourceUrl: string, includeReferer: boolean) {
  const origin = getSourceOrigin(sourceUrl);
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
  };

  if (includeReferer && origin) {
    headers.Referer = `${origin}/`;
  }

  return headers;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT
    );
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return (
      low === "::1" ||
      low === "::" ||
      low.startsWith("fc") ||
      low.startsWith("fd") || // unique local
      low.startsWith("fe80") || // link-local
      low.startsWith("::ffff:127.") ||
      low.startsWith("::ffff:10.") ||
      low.startsWith("::ffff:192.168.") ||
      low.startsWith("::ffff:169.254.")
    );
  }
  return true; // unrecognised → treat as unsafe
}

// SSRF guard: only fetch http(s) URLs that resolve to public addresses. Blocks the prior
// hole where any authenticated caller could point sourceUrl at internal/metadata endpoints.
async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Некоректний URL зображення.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Дозволені лише http(s) посилання.");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("Внутрішні адреси заборонені.");
  }
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dnsPromises.lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new Error("Не вдалося розпізнати адресу джерела.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new Error("Джерело вказує на внутрішню/зарезервовану адресу — заборонено.");
  }
}

async function fetchSourceImage(sourceUrl: string) {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const includeReferer of [false, true]) {
    try {
      const response = await fetch(sourceUrl, {
        redirect: "follow",
        headers: getBrowserLikeHeaders(sourceUrl, includeReferer),
      });

      if (response.ok) return response;
      lastResponse = response;

      if (![403, 404, 429].includes(response.status)) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
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

  try {
    await assertSafeExternalUrl(sourceUrl);
  } catch (error) {
    return jsonResponse(400, { error: error instanceof Error ? error.message : "Заборонений URL." });
  }

  let response: Response;
  try {
    response = await fetchSourceImage(sourceUrl);
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
  const sourceBuffer = Buffer.from(arrayBuffer);

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
