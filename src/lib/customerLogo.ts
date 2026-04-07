import { supabase } from "@/lib/supabaseClient";

export type CustomerLeadLogoDirectoryEntry = {
  id: string;
  label: string;
  legalName: string | null;
  entityType: "customer" | "lead";
  logoUrl: string | null;
};

const CUSTOMER_LOGO_DIRECTORY_CACHE_TTL_MS = 10 * 60 * 1000;
const CUSTOMER_LOGO_BUCKET = "public-assets";
const CUSTOMER_LOGO_SIZE = 128;

type CustomerLeadLogoDirectoryCachePayload = {
  entries: CustomerLeadLogoDirectoryEntry[];
  cachedAt: number;
};

export function isInlineCustomerLogoDataUrl(value?: string | null) {
  return (value?.trim().toLowerCase() ?? "").startsWith("data:image/");
}

export function normalizeCustomerLogoUrl(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (isInlineCustomerLogoDataUrl(normalized)) return null;
  if (/\/rest\/v1\//i.test(normalized)) return null;
  return normalized;
}

export function shouldFallbackToOriginalCustomerLogoUrl(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message?: string }).message ?? "")
        : "";
  return /\((403|429)\)/.test(message);
}

export function getCustomerLogoImportErrorMessage(error: unknown, entityLabel = "логотип") {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message?: string }).message ?? "")
        : "";

  if (/\((403|429)\)/.test(message)) {
    return `Сайт із цим ${entityLabel} не дав завантажити картинку. Встав пряме посилання на зображення або завантаж файл.`;
  }
  if (/cors/i.test(message)) {
    return `Сайт із цим ${entityLabel} блокує завантаження картинки. Спробуй пряме посилання на зображення або завантаж файл.`;
  }
  if (/вести напряму на зображення/i.test(message)) {
    return "Потрібне пряме посилання саме на картинку, а не на сторінку сайту.";
  }
  return `Не вдалося підготувати ${entityLabel}. Спробуй інше посилання або завантаж файл.`;
}

function getPublicStorageUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function sanitizeStorageSegment(value: string) {
  return value.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "logo";
}

function getContentTypeExtension(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("bmp")) return "bmp";
  if (normalized.includes("svg")) return "svg";
  return "img";
}

async function loadImageFromBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Не вдалося декодувати логотип."));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderCustomerLogoBlob(blob: Blob, size = CUSTOMER_LOGO_SIZE) {
  const image = await loadImageFromBlob(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error("Не вдалося визначити розмір логотипа.");
  }

  const sourceSize = Math.min(width, height);
  const sourceX = Math.max(0, Math.round((width - sourceSize) / 2));
  const sourceY = Math.max(0, Math.round((height - sourceSize) / 2));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не вдалося підготувати canvas для логотипа.");
  }

  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  const output = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/webp", 0.9);
  });
  if (!output) {
    throw new Error("Не вдалося згенерувати WebP-лого.");
  }
  return output;
}

export function getManagedCustomerLogoStoragePath(url?: string | null) {
  const normalized = normalizeCustomerLogoUrl(url);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const marker = `/storage/v1/object/public/${CUSTOMER_LOGO_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = parsed.pathname.slice(markerIndex + marker.length);
    if (!/\/customer-logos\//i.test(path)) return null;
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

export async function removeManagedCustomerLogoByUrl(url?: string | null) {
  const storagePath = getManagedCustomerLogoStoragePath(url);
  if (!storagePath) return;
  await supabase.storage.from(CUSTOMER_LOGO_BUCKET).remove([storagePath]);
}

export async function ingestCustomerLogoFromUrl(params: {
  teamId: string;
  sourceUrl: string;
  entityType: "customer" | "lead";
  entityId?: string | null;
  preferredName?: string | null;
}) {
  const normalizedSourceUrl = normalizeCustomerLogoUrl(params.sourceUrl);
  if (!normalizedSourceUrl) {
    throw new Error("Вкажіть прямий URL на зображення логотипа.");
  }
  if (getManagedCustomerLogoStoragePath(normalizedSourceUrl)) {
    return {
      logoUrl: normalizedSourceUrl,
      storagePath: getManagedCustomerLogoStoragePath(normalizedSourceUrl),
    };
  }

  let response: Response;
  try {
    response = await fetch(normalizedSourceUrl, { mode: "cors", cache: "no-store" });
  } catch {
    throw new Error("Не вдалося завантажити логотип за URL. Перевірте посилання або CORS на стороні джерела.");
  }

  if (!response.ok) {
    throw new Error(`Не вдалося завантажити логотип за URL (${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("URL логотипа має вести напряму на зображення.");
  }

  const sourceBlob = await response.blob();
  const optimizedBlob = await renderCustomerLogoBlob(sourceBlob);
  const nameSeed =
    sanitizeStorageSegment(params.preferredName ?? "") ||
    sanitizeStorageSegment(
      (() => {
        try {
          return new URL(normalizedSourceUrl).pathname.split("/").pop() ?? "";
        } catch {
          return "";
        }
      })()
    ) ||
    `logo.${getContentTypeExtension(contentType)}`;
  const ownerKey = sanitizeStorageSegment(params.entityId ?? crypto.randomUUID());
  const storagePath = `teams/${params.teamId}/customer-logos/${params.entityType}/${ownerKey}/${Date.now()}-${nameSeed}.webp`;

  const { error } = await supabase.storage.from(CUSTOMER_LOGO_BUCKET).upload(storagePath, optimizedBlob, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
  });
  if (error) throw error;

  return {
    logoUrl: getPublicStorageUrl(CUSTOMER_LOGO_BUCKET, storagePath),
    storagePath,
  };
}

export async function ingestCustomerLogoFromFile(params: {
  teamId: string;
  file: File;
  entityType: "customer" | "lead";
  entityId?: string | null;
  preferredName?: string | null;
}) {
  const contentType = params.file.type?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Потрібно вибрати файл зображення.");
  }

  const optimizedBlob = await renderCustomerLogoBlob(params.file);
  const ownerKey = sanitizeStorageSegment(params.entityId ?? crypto.randomUUID());
  const fileNameSeed = sanitizeStorageSegment(params.preferredName ?? params.file.name.replace(/\.[^.]+$/, ""));
  const storagePath = `teams/${params.teamId}/customer-logos/${params.entityType}/${ownerKey}/${Date.now()}-${fileNameSeed}.webp`;

  const { error } = await supabase.storage.from(CUSTOMER_LOGO_BUCKET).upload(storagePath, optimizedBlob, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
  });
  if (error) throw error;

  return {
    logoUrl: getPublicStorageUrl(CUSTOMER_LOGO_BUCKET, storagePath),
    storagePath,
  };
}

function readCustomerLeadLogoDirectoryCache(teamId: string): CustomerLeadLogoDirectoryCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`customer-lead-logo-directory:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerLeadLogoDirectoryCachePayload;
    if (!Array.isArray(parsed.entries)) return null;
    return {
      entries: parsed.entries,
      cachedAt: Number(parsed.cachedAt ?? 0),
    };
  } catch {
    return null;
  }
}

function writeCustomerLeadLogoDirectoryCache(teamId: string, entries: CustomerLeadLogoDirectoryEntry[]) {
  if (typeof window === "undefined" || !teamId) return;
  try {
    sessionStorage.setItem(
      `customer-lead-logo-directory:${teamId}`,
      JSON.stringify({
        entries,
        cachedAt: Date.now(),
      } satisfies CustomerLeadLogoDirectoryCachePayload)
    );
  } catch {
    // ignore cache persistence failures
  }
}

export async function listCustomerLeadLogoDirectory(
  teamId: string,
  options?: { force?: boolean; maxAgeMs?: number }
): Promise<CustomerLeadLogoDirectoryEntry[]> {
  const maxAgeMs = options?.maxAgeMs ?? CUSTOMER_LOGO_DIRECTORY_CACHE_TTL_MS;
  if (!options?.force) {
    const cached = readCustomerLeadLogoDirectoryCache(teamId);
    if (cached && Date.now() - cached.cachedAt < maxAgeMs) {
      return cached.entries;
    }
  }

  const [customersRes, leadsRes] = await Promise.all([
    supabase
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url")
      .eq("team_id", teamId)
      .order("name", { ascending: true }),
    supabase
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,logo_url")
      .eq("team_id", teamId)
      .order("company_name", { ascending: true }),
  ]);

  if (customersRes.error) throw customersRes.error;

  const customerEntries =
    ((customersRes.data as Array<{ id: string; name?: string | null; legal_name?: string | null; logo_url?: string | null }> | null) ?? [])
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.legal_name?.trim() || "Замовник без назви",
        legalName: row.legal_name?.trim() || null,
        entityType: "customer" as const,
        logoUrl: normalizeCustomerLogoUrl(row.logo_url ?? null),
      }));

  const leadEntries = !leadsRes.error
    ? (((leadsRes.data as Array<{ id: string; company_name?: string | null; legal_name?: string | null; logo_url?: string | null }> | null) ?? [])
        .map((row) => ({
          id: row.id,
          label: row.company_name?.trim() || row.legal_name?.trim() || "Лід без назви",
          legalName: row.legal_name?.trim() || null,
          entityType: "lead" as const,
          logoUrl: normalizeCustomerLogoUrl(row.logo_url ?? null),
        })))
    : [];

  const entries = [...customerEntries, ...leadEntries].sort((a, b) => a.label.localeCompare(b.label, "uk"));
  writeCustomerLeadLogoDirectoryCache(teamId, entries);
  return entries;
}
