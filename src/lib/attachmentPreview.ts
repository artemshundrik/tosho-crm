import { supabase } from "@/lib/supabaseClient";

export type AttachmentPreviewVariant = "original" | "thumb" | "preview";

type UploadAttachmentWithVariantsParams = {
  bucket: string;
  storagePath: string;
  file: File;
  cacheControl?: string;
};

type UploadedAttachmentResult = {
  storagePath: string;
  contentType: string;
  size: number;
  optimizedOriginal: boolean;
};

// Signed-URL cache, persisted to sessionStorage (mirrors the avatar pipeline).
// The stored objects are immutable (1-year Cache-Control), but the signed URL's
// token is the browser's HTTP cache key — if we re-sign on every reload, every
// thumbnail re-downloads even though the bytes never change. Persisting the
// token for its whole TTL keeps URLs stable across reloads, so the browser
// cache actually gets hits. TTL matches avatars (7 days).
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const SIGNED_URL_CACHE_STORAGE_KEY = "attachment-signed-url-cache-v1";
const SIGNED_URL_EXPIRY_SKEW_MS = 5 * 60 * 1000;

type SignedUrlCacheEntry = { url: string; expiresAt: number };

const loadPersistedSignedUrlCache = (): Map<string, SignedUrlCacheEntry> => {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.sessionStorage.getItem(SIGNED_URL_CACHE_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, SignedUrlCacheEntry>;
    const now = Date.now();
    const entries = Object.entries(parsed).filter(
      ([, entry]) =>
        entry && typeof entry.url === "string" && typeof entry.expiresAt === "number" && entry.expiresAt > now
    );
    return new Map(entries);
  } catch {
    return new Map();
  }
};

const SIGNED_URL_CACHE = loadPersistedSignedUrlCache();

let signedUrlPersistScheduled = false;
const persistSignedUrlCache = () => {
  if (typeof window === "undefined" || signedUrlPersistScheduled) return;
  signedUrlPersistScheduled = true;
  window.setTimeout(() => {
    signedUrlPersistScheduled = false;
    try {
      window.sessionStorage.setItem(
        SIGNED_URL_CACHE_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(SIGNED_URL_CACHE))
      );
    } catch {
      // Quota/serialization failures just mean we fall back to in-memory only.
    }
  }, 250);
};

const getCachedSignedUrl = (cacheKey: string): string | null => {
  const entry = SIGNED_URL_CACHE.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    SIGNED_URL_CACHE.delete(cacheKey);
    persistSignedUrlCache();
    return null;
  }
  return entry.url;
};

const setCachedSignedUrl = (cacheKey: string, url: string, ttlSeconds: number) => {
  SIGNED_URL_CACHE.set(cacheKey, {
    url,
    expiresAt: Date.now() + ttlSeconds * 1000 - SIGNED_URL_EXPIRY_SKEW_MS,
  });
  persistSignedUrlCache();
};
const THUMB_MAX_SIZE = 160;
const PREVIEW_MAX_SIZE = 640;
const SERVER_PREVIEW_RETRY_DELAY_MS = 1500;
const SERVER_PREVIEW_RETRY_ATTEMPTS = 8;
const OPTIMIZED_ORIGINAL_QUALITY = 0.88;

const RASTER_PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
const SERVER_PREVIEW_EXTENSIONS = new Set(["pdf", "tif", "tiff"]);
const OPTIMIZABLE_RASTER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "bmp"]);
const OPTIMIZABLE_RASTER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/bmp"]);
let pdfRuntimePromise: Promise<{ getDocument: typeof import("pdfjs-dist")["getDocument"] }> | null = null;

function splitStoragePath(storagePath: string) {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  return {
    basename: match?.[1] ?? storagePath,
    extension: match?.[2] ?? "",
  };
}

export function getAttachmentVariantPath(storagePath: string, variant: AttachmentPreviewVariant) {
  if (variant === "original") return storagePath;
  const { basename } = splitStoragePath(storagePath);
  return `${basename}__${variant}.webp`;
}

function replaceStoragePathExtension(storagePath: string, extension: string) {
  const { basename } = splitStoragePath(storagePath);
  return `${basename}.${extension}`;
}

function getSignedUrlDownloadFileName(fileName?: string | null) {
  const normalized = fileName
    ?.trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\/:*?"<>|&=#%]/g, "_")
    .replace(/\s+/g, " ");
  return normalized || null;
}

export function getAttachmentVariantCandidatePaths(storagePath: string, variant: AttachmentPreviewVariant) {
  if (variant === "original") return [storagePath];
  const { basename } = splitStoragePath(storagePath);
  return [`${basename}__${variant}.webp`, `${basename}__${variant}.png`];
}

export function getAttachmentVariantCacheKey(
  bucket: string,
  storagePath: string,
  variant: AttachmentPreviewVariant
) {
  return `${bucket}:${getAttachmentVariantPath(storagePath, variant)}`;
}

export function getFileExtensionFromStoragePath(storagePath: string) {
  return storagePath.split(".").pop()?.toLowerCase() ?? "";
}

function resolveAttachmentFileNameByStorage(
  fileName?: string | null,
  storagePath?: string | null,
  mimeType?: string | null
) {
  const baseName = (fileName && fileName.trim()) || "file";
  const storageExtension =
    typeof storagePath === "string" && storagePath ? getFileExtensionFromStoragePath(storagePath) : "";
  const normalizedMime = mimeType?.toLowerCase?.() ?? "";

  let targetExtension = storageExtension;
  if (!targetExtension) {
    if (normalizedMime === "image/webp") targetExtension = "webp";
    else if (normalizedMime === "image/png") targetExtension = "png";
    else if (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg") targetExtension = "jpg";
    else if (normalizedMime === "image/bmp") targetExtension = "bmp";
    else if (normalizedMime === "application/pdf") targetExtension = "pdf";
  }

  if (!targetExtension) return baseName;

  const dot = baseName.lastIndexOf(".");
  if (dot < 0) return `${baseName}.${targetExtension}`;

  const currentExtension = baseName.slice(dot + 1).toLowerCase();
  if (currentExtension === targetExtension.toLowerCase()) return baseName;
  return `${baseName.slice(0, dot)}.${targetExtension}`;
}

/**
 * Filename used when the user clicks "Download". For WebP attachments we lie
 * about the extension and return ".png" — the bytes stay WebP, but Telegram
 * (and a few other clients) refuse to render `.webp` as a photo and instead
 * treat it as a sticker. Modern image viewers happily decode WebP bytes inside
 * a `.png` file, so the practical UX is: download → drop into Telegram → shows
 * as a normal photo.
 */
export function getAttachmentDownloadFileName(
  fileName?: string | null,
  storagePath?: string | null,
  mimeType?: string | null
) {
  const truthful = resolveAttachmentFileNameByStorage(fileName, storagePath, mimeType);
  const dot = truthful.lastIndexOf(".");
  if (dot < 0) return truthful;
  const currentExtension = truthful.slice(dot + 1).toLowerCase();
  if (currentExtension !== "webp") return truthful;
  return `${truthful.slice(0, dot)}.png`;
}

/**
 * Filename shown in the CRM UI. Stays truthful (returns `.webp` for WebP) so
 * the team can audit what's actually in storage. Diverges from the download
 * filename above.
 */
export function getAttachmentDisplayFileName(
  fileName?: string | null,
  storagePath?: string | null,
  mimeType?: string | null
) {
  return resolveAttachmentFileNameByStorage(fileName, storagePath, mimeType);
}

export function isServerPreviewableStoragePath(storagePath: string) {
  return SERVER_PREVIEW_EXTENSIONS.has(getFileExtensionFromStoragePath(storagePath));
}

export function isRasterPreviewableFile(file: Pick<File, "type" | "name">) {
  const mime = file.type?.toLowerCase?.() ?? "";
  if (mime.startsWith("image/") && mime !== "image/tiff" && mime !== "image/svg+xml") return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return RASTER_PREVIEW_EXTENSIONS.has(extension);
}

function shouldOptimizeRasterOriginal(file: Pick<File, "type" | "name">) {
  const mime = file.type?.toLowerCase?.() ?? "";
  if (OPTIMIZABLE_RASTER_MIME_TYPES.has(mime)) return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return OPTIMIZABLE_RASTER_EXTENSIONS.has(extension);
}

export function isPdfPreviewableFile(file: Pick<File, "type" | "name">) {
  const mime = file.type?.toLowerCase?.() ?? "";
  if (mime === "application/pdf") return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extension === "pdf";
}

async function loadImageElement(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderImageVariantBlob(file: File, maxSize: number) {
  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width || maxSize;
  const height = image.naturalHeight || image.height || maxSize;
  if (!width || !height) return null;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", 0.86);
  });
}

async function renderOptimizedOriginalBlob(file: File) {
  const image = await loadImageElement(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", OPTIMIZED_ORIGINAL_QUALITY);
  });
}

async function renderPdfVariantBlob(file: File, maxSize: number) {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, workerModule]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return { getDocument: pdfjs.getDocument };
    });
  }

  const { getDocument } = await pdfRuntimePromise;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1, maxSize / Math.max(initialViewport.width, initialViewport.height));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    await pdf.destroy();
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/webp", 0.88);
  });
  await pdf.destroy();
  return blob;
}

export async function uploadAttachmentWithVariants({
  bucket,
  storagePath,
  file,
  cacheControl = "31536000, immutable",
}: UploadAttachmentWithVariantsParams): Promise<UploadedAttachmentResult> {
  const optimizedOriginal =
    typeof document !== "undefined" && shouldOptimizeRasterOriginal(file)
      ? await renderOptimizedOriginalBlob(file)
      : null;
  const originalBlob = optimizedOriginal ?? file;
  const originalContentType = optimizedOriginal ? "image/webp" : file.type;
  const originalStoragePath = optimizedOriginal ? replaceStoragePathExtension(storagePath, "webp") : storagePath;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(originalStoragePath, originalBlob, {
    upsert: true,
    contentType: originalContentType,
    cacheControl,
  });
  if (uploadError) throw uploadError;

  if (typeof document === "undefined" || (!isRasterPreviewableFile(file) && !isPdfPreviewableFile(file))) {
    const mime = file.type?.toLowerCase?.() ?? "";
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const needsServerPreview =
      mime === "application/pdf" || mime === "image/tiff" || extension === "pdf" || extension === "tif" || extension === "tiff";
    if (needsServerPreview) {
      void requestServerAttachmentPreview(bucket, originalStoragePath);
    }
    return {
      storagePath: originalStoragePath,
      contentType: originalContentType,
      size: originalBlob.size,
      optimizedOriginal: Boolean(optimizedOriginal),
    };
  }

  const variants: Array<{ variant: AttachmentPreviewVariant; maxSize: number }> = [
    { variant: "thumb", maxSize: THUMB_MAX_SIZE },
    { variant: "preview", maxSize: PREVIEW_MAX_SIZE },
  ];

  await Promise.all(
    variants.map(async ({ variant, maxSize }) => {
      try {
        const blob = isPdfPreviewableFile(file)
          ? await renderPdfVariantBlob(file, maxSize)
          : await renderImageVariantBlob(file, maxSize);
        if (!blob) return;
        const variantPath = getAttachmentVariantPath(originalStoragePath, variant);
        const { error } = await supabase.storage.from(bucket).upload(variantPath, blob, {
          upsert: true,
          contentType: "image/webp",
          cacheControl,
        });
        if (error) {
          console.warn(`Failed to upload ${variant} variant`, error);
        }
      } catch (error) {
        console.warn(`Failed to generate ${variant} variant`, error);
      }
    })
  );

  return {
    storagePath: originalStoragePath,
    contentType: originalContentType,
    size: originalBlob.size,
    optimizedOriginal: Boolean(optimizedOriginal),
  };
}

export async function removeAttachmentWithVariants(bucket: string, storagePath: string) {
  const paths = [
    storagePath,
    ...getAttachmentVariantCandidatePaths(storagePath, "thumb"),
    ...getAttachmentVariantCandidatePaths(storagePath, "preview"),
  ];
  await supabase.storage.from(bucket).remove(paths);
  paths.forEach((path) => {
    const cacheKey = `${bucket}:${path}`;
    SIGNED_URL_CACHE.delete(cacheKey);
    Array.from(SIGNED_URL_CACHE.keys()).forEach((key) => {
      if (key.startsWith(`${cacheKey}:download:`)) SIGNED_URL_CACHE.delete(key);
    });
  });
  persistSignedUrlCache();
}

export async function getSignedAttachmentUrl(
  bucket: string,
  storagePath: string,
  variant: AttachmentPreviewVariant = "original",
  ttlSeconds = SIGNED_URL_TTL_SECONDS
) {
  for (const targetPath of getAttachmentVariantCandidatePaths(storagePath, variant)) {
    const cacheKey = `${bucket}:${targetPath}`;
    const cached = getCachedSignedUrl(cacheKey);
    if (cached) return cached;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(targetPath, ttlSeconds);
    const signedUrl = typeof data?.signedUrl === "string" ? data.signedUrl : null;
    if (signedUrl && !error) {
      setCachedSignedUrl(cacheKey, signedUrl, ttlSeconds);
      return signedUrl;
    }
  }
  return null;
}

export async function getSignedAttachmentDownloadUrl(
  bucket: string,
  storagePath: string,
  fileName?: string | null,
  ttlSeconds = SIGNED_URL_TTL_SECONDS
) {
  const normalizedFileName = getSignedUrlDownloadFileName(fileName);
  const cacheKey = `${bucket}:${storagePath}:download:${normalizedFileName ?? ""}`;
  const cached = getCachedSignedUrl(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, ttlSeconds, {
      download: normalizedFileName || true,
    });
  const signedUrl = typeof data?.signedUrl === "string" ? data.signedUrl : null;
  if (signedUrl && !error) {
    setCachedSignedUrl(cacheKey, signedUrl, ttlSeconds);
    return signedUrl;
  }
  return null;
}

async function requestServerAttachmentPreview(bucket: string, storagePath: string) {
  if (typeof window === "undefined") return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/.netlify/functions/attachment-preview-generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ bucket, storagePath }),
    });
  } catch (error) {
    console.warn("Failed to queue server attachment preview generation", error);
  }
}

export async function ensureServerAttachmentPreviewQueued(bucket: string, storagePath: string) {
  if (!isServerPreviewableStoragePath(storagePath)) return;
  await requestServerAttachmentPreview(bucket, storagePath);
}

export async function waitForSignedAttachmentUrl(
  bucket: string,
  storagePath: string,
  variant: AttachmentPreviewVariant,
  options?: { attempts?: number; delayMs?: number; ttlSeconds?: number; queueServerPreview?: boolean }
) {
  const attempts = Math.max(1, options?.attempts ?? SERVER_PREVIEW_RETRY_ATTEMPTS);
  const delayMs = Math.max(250, options?.delayMs ?? SERVER_PREVIEW_RETRY_DELAY_MS);
  const ttlSeconds = options?.ttlSeconds ?? SIGNED_URL_TTL_SECONDS;

  if (options?.queueServerPreview && variant !== "original" && isServerPreviewableStoragePath(storagePath)) {
    // Only queue server-side generation when the variant doesn't exist yet.
    // Queuing unconditionally made every render of a PDF/TIFF attachment invoke
    // the Netlify function, which re-downloads the multi-MB original from
    // storage each time — that was the main driver of storage egress.
    const existingUrl = await getSignedAttachmentUrl(bucket, storagePath, variant, ttlSeconds);
    if (existingUrl) return existingUrl;
    await ensureServerAttachmentPreviewQueued(bucket, storagePath);
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const signedUrl = await getSignedAttachmentUrl(bucket, storagePath, variant, ttlSeconds);
    if (signedUrl) return signedUrl;
    if (attempt === attempts - 1) break;
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  return null;
}
