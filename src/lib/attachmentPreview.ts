import { supabase } from "@/lib/supabaseClient";

export type AttachmentPreviewVariant = "original" | "thumb" | "preview";

type UploadAttachmentWithVariantsParams = {
  bucket: string;
  storagePath: string;
  file: File;
  cacheControl?: string;
};

const SIGNED_URL_CACHE = new Map<string, string>();
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const THUMB_MAX_SIZE = 160;
const PREVIEW_MAX_SIZE = 1280;

const RASTER_PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

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

export function isRasterPreviewableFile(file: Pick<File, "type" | "name">) {
  const mime = file.type?.toLowerCase?.() ?? "";
  if (mime.startsWith("image/") && mime !== "image/tiff" && mime !== "image/svg+xml") return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return RASTER_PREVIEW_EXTENSIONS.has(extension);
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

export async function uploadAttachmentWithVariants({
  bucket,
  storagePath,
  file,
  cacheControl = "31536000, immutable",
}: UploadAttachmentWithVariantsParams) {
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert: true,
    contentType: file.type,
    cacheControl,
  });
  if (uploadError) throw uploadError;

  if (typeof document === "undefined" || !isRasterPreviewableFile(file)) {
    const mime = file.type?.toLowerCase?.() ?? "";
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const needsServerPreview =
      mime === "application/pdf" || mime === "image/tiff" || extension === "pdf" || extension === "tif" || extension === "tiff";
    if (needsServerPreview) {
      void requestServerAttachmentPreview(bucket, storagePath);
    }
    return;
  }

  const variants: Array<{ variant: AttachmentPreviewVariant; maxSize: number }> = [
    { variant: "thumb", maxSize: THUMB_MAX_SIZE },
    { variant: "preview", maxSize: PREVIEW_MAX_SIZE },
  ];

  await Promise.all(
    variants.map(async ({ variant, maxSize }) => {
      try {
        const blob = await renderImageVariantBlob(file, maxSize);
        if (!blob) return;
        const variantPath = getAttachmentVariantPath(storagePath, variant);
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
}

export async function removeAttachmentWithVariants(bucket: string, storagePath: string) {
  const paths = [
    storagePath,
    ...getAttachmentVariantCandidatePaths(storagePath, "thumb"),
    ...getAttachmentVariantCandidatePaths(storagePath, "preview"),
  ];
  await supabase.storage.from(bucket).remove(paths);
  paths.forEach((path) => {
    SIGNED_URL_CACHE.delete(`${bucket}:${path}`);
  });
}

export async function getSignedAttachmentUrl(
  bucket: string,
  storagePath: string,
  variant: AttachmentPreviewVariant = "original",
  ttlSeconds = SIGNED_URL_TTL_SECONDS
) {
  for (const targetPath of getAttachmentVariantCandidatePaths(storagePath, variant)) {
    const cacheKey = `${bucket}:${targetPath}`;
    const cached = SIGNED_URL_CACHE.get(cacheKey);
    if (cached) return cached;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(targetPath, ttlSeconds);
    const signedUrl = typeof data?.signedUrl === "string" ? data.signedUrl : null;
    if (signedUrl && !error) {
      SIGNED_URL_CACHE.set(cacheKey, signedUrl);
      return signedUrl;
    }
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
