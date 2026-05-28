/**
 * Client-side image conversion utilities for the attachment download flow.
 *
 * Why this exists: visualizations are stored as WebP in Supabase (for storage
 * and CRM-preview efficiency). When a manager downloads one and forwards it
 * via Telegram, Telegram detects WebP content and treats it as a sticker
 * instead of a photo. Renaming the file to `.png` works on macOS Telegram
 * Desktop but **not on Windows** — the Windows client sniffs the bytes.
 *
 * So at download time we actually decode the WebP via Canvas and re-encode as
 * PNG. The output is lossless w.r.t. pixel data (Canvas reads the decoded
 * pixels), preserves transparency, and is universally treated as a photo.
 *
 * Trade-off: PNG is bigger (typically 3-5× the WebP size for the same image).
 * Conversion adds 0.2-1.5s to the download click, depending on image size.
 */

export const WEBP_EXTENSION = "webp" as const;
export const WEBP_MIME_TYPE = "image/webp" as const;
export const PNG_MIME_TYPE = "image/png" as const;

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

/**
 * Convert an image blob (typically WebP) into a PNG blob via the browser's
 * Canvas implementation. Throws if decoding or encoding fails.
 */
export const convertImageBlobToPng = async (blob: Blob): Promise<Blob> => {
  const { source, width, height, cleanup } = await decodeImageToCanvasSource(blob);
  try {
    if (!width || !height) {
      throw new Error("Зображення має нульові розміри");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context недоступний у цьому браузері");
    }
    ctx.drawImage(source, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), PNG_MIME_TYPE)
    );
    if (!pngBlob) {
      throw new Error("Не вдалося згенерувати PNG");
    }
    return pngBlob;
  } finally {
    cleanup();
  }
};
