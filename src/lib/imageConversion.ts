/**
 * Client-side image conversion utilities for the attachment download flow.
 *
 * Why this exists: visualizations are stored as WebP in Supabase (for storage
 * and CRM-preview efficiency). When a manager downloads one and forwards it
 * via Telegram, Telegram detects WebP content and treats it as a sticker
 * instead of a photo. Renaming the file to `.png` works on macOS Telegram
 * Desktop but **not on Windows** — the Windows client sniffs the bytes.
 *
 * So at download time we actually decode the WebP via Canvas and re-encode it
 * as PNG. PNG is lossless, universally treated as a photo by every messenger,
 * and supports transparency. Trade-off: PNG files are several times larger
 * than the source WebP. That's acceptable here — files are downloaded to a
 * desktop and then shared from there.
 */

export const WEBP_EXTENSION = "webp" as const;
export const WEBP_MIME_TYPE = "image/webp" as const;
export const PNG_MIME_TYPE = "image/png" as const;

export type SharingImageFormat = "png";

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

export type ConvertedSharingImage = {
  blob: Blob;
  extension: SharingImageFormat;
  mimeType: typeof PNG_MIME_TYPE;
};

/**
 * Re-encode an image blob (typically WebP) as PNG via the browser's Canvas.
 * Lossless, preserves transparency, universally rendered as a photo by every
 * messenger and image viewer.
 */
export const convertWebpBlobForSharing = async (blob: Blob): Promise<ConvertedSharingImage> => {
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

    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), PNG_MIME_TYPE)
    );
    if (!encoded) {
      throw new Error("Не вдалося згенерувати PNG");
    }
    return {
      blob: encoded,
      extension: "png",
      mimeType: PNG_MIME_TYPE,
    };
  } finally {
    cleanup();
  }
};
