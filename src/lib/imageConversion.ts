/**
 * Client-side image conversion utilities for the attachment download flow.
 *
 * Why this exists: visualizations are stored as WebP in Supabase (for storage
 * and CRM-preview efficiency). When a manager downloads one and forwards it
 * via Telegram, Telegram detects WebP content and treats it as a sticker
 * instead of a photo. Renaming the file to `.png` works on macOS Telegram
 * Desktop but **not on Windows** — the Windows client sniffs the bytes.
 *
 * So at download time we actually decode the WebP via Canvas and re-encode it.
 *
 * Format choice:
 *   - Default: JPEG quality 0.92 — typically ~1.5–2× the input WebP size.
 *     Telegram accepts JPEG as a photo on every platform. No transparency.
 *   - Fallback: PNG (lossless) — used only when the source has an alpha
 *     channel (e.g. cutout logos). PNG is ~5–10× the input size but preserves
 *     transparency that would otherwise be flattened to black in JPEG.
 *
 * Alpha detection: we scan ImageData and short-circuit on the first non-opaque
 * pixel. Cost is a few milliseconds for typical images.
 */

export const WEBP_EXTENSION = "webp" as const;
export const WEBP_MIME_TYPE = "image/webp" as const;
export const PNG_MIME_TYPE = "image/png" as const;
export const JPEG_MIME_TYPE = "image/jpeg" as const;

export type SharingImageFormat = "jpg" | "png";

/**
 * JPEG quality for the WebP-replacement encode. 0.88 roughly matches the
 * quality the source WebP was originally encoded at, so additional artifacts
 * from this second pass are minimal. Output ends up ~1.3–1.7× the WebP size.
 */
const JPEG_QUALITY = 0.88;

/**
 * Dimensional scale applied to the PNG-fallback path (used only when the
 * source has an alpha channel that JPEG cannot represent). PNG itself is
 * lossless — `canvas.toBlob('image/png', q)` ignores its quality argument —
 * so the only way to shrink the output is to downscale the image before
 * encoding. 0.8 gives ~64% of the pixels and roughly 60–70% of the file size
 * of an unscaled PNG, which keeps cutout logos manageable on Telegram.
 */
const PNG_DIMENSION_SCALE = 0.8;

export const getStoragePathExtension = (storagePath?: string | null): string => {
  if (!storagePath) return "";
  const lastDot = storagePath.lastIndexOf(".");
  if (lastDot < 0) return "";
  return storagePath.slice(lastDot + 1).toLowerCase();
};

export const isWebpStoragePath = (storagePath?: string | null): boolean =>
  getStoragePathExtension(storagePath) === WEBP_EXTENSION;

export const isWebpBlob = (blob: Blob | null | undefined): boolean =>
  blob?.type?.toLowerCase() === WEBP_MIME_TYPE;

/**
 * Swap the file extension on a filename. Preserves the basename; appends if
 * there was no extension.
 */
export const swapFilenameExtension = (
  filename: string | null | undefined,
  nextExtension: SharingImageFormat
): string => {
  const safe = (filename ?? "").trim() || "file";
  const dot = safe.lastIndexOf(".");
  if (dot < 0) return `${safe}.${nextExtension}`;
  return `${safe.slice(0, dot)}.${nextExtension}`;
};

const decodeImageToCanvasSource = async (
  blob: Blob
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Fall through to HTMLImageElement path.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Не вдалося декодувати зображення"));
    img.src = objectUrl;
  });

  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
};

const hasTransparentPixels = (ctx: CanvasRenderingContext2D, width: number, height: number): boolean => {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    // Iterate alpha channel only (every 4th byte). Short-circuit on first
    // non-opaque pixel.
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 255) return true;
    }
    return false;
  } catch {
    // getImageData can throw on tainted canvases; assume opaque to keep the
    // smaller JPEG output. Source is a blob we just decoded — should never
    // be tainted in practice.
    return false;
  }
};

export type ConvertedSharingImage = {
  blob: Blob;
  extension: SharingImageFormat;
  mimeType: typeof PNG_MIME_TYPE | typeof JPEG_MIME_TYPE;
};

/**
 * Re-encode an image blob (typically WebP) into a format suitable for sharing
 * via messengers / email. Returns JPEG by default; PNG only when the source
 * has transparency.
 */
export const convertWebpBlobForSharing = async (blob: Blob): Promise<ConvertedSharingImage> => {
  const { source, width, height, cleanup } = await decodeImageToCanvasSource(blob);
  try {
    if (!width || !height) {
      throw new Error("Зображення має нульові розміри");
    }

    // First pass: full-resolution canvas to inspect alpha. We use the same
    // canvas for JPEG encoding below if no alpha is detected.
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext("2d");
    if (!fullCtx) {
      throw new Error("Canvas 2D context недоступний у цьому браузері");
    }
    fullCtx.drawImage(source, 0, 0);

    const usePng = hasTransparentPixels(fullCtx, width, height);

    let encodeCanvas: HTMLCanvasElement = fullCanvas;
    let targetMime: typeof PNG_MIME_TYPE | typeof JPEG_MIME_TYPE = JPEG_MIME_TYPE;
    let quality: number | undefined = JPEG_QUALITY;

    if (usePng) {
      // Re-draw at reduced dimensions for the PNG path. Canvas uses bilinear
      // (or higher) downsampling under the hood when source > destination.
      const scaledWidth = Math.max(1, Math.round(width * PNG_DIMENSION_SCALE));
      const scaledHeight = Math.max(1, Math.round(height * PNG_DIMENSION_SCALE));
      const scaledCanvas = document.createElement("canvas");
      scaledCanvas.width = scaledWidth;
      scaledCanvas.height = scaledHeight;
      const scaledCtx = scaledCanvas.getContext("2d");
      if (!scaledCtx) {
        throw new Error("Canvas 2D context недоступний у цьому браузері");
      }
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = "high";
      scaledCtx.drawImage(source, 0, 0, scaledWidth, scaledHeight);
      encodeCanvas = scaledCanvas;
      targetMime = PNG_MIME_TYPE;
      quality = undefined;
    }

    const encoded = await new Promise<Blob | null>((resolve) =>
      encodeCanvas.toBlob((result) => resolve(result), targetMime, quality)
    );
    if (!encoded) {
      throw new Error(`Не вдалося згенерувати ${usePng ? "PNG" : "JPEG"}`);
    }
    return {
      blob: encoded,
      extension: usePng ? "png" : "jpg",
      mimeType: usePng ? PNG_MIME_TYPE : JPEG_MIME_TYPE,
    };
  } finally {
    cleanup();
  }
};
