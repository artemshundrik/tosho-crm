import { supabase } from "@/lib/supabaseClient";

const BUCKET = "public-assets";

const fileNameOf = (sourceUrl: string) => {
  let name = "item-image";
  try {
    name = new URL(sourceUrl).pathname.split("/").pop() || name;
  } catch {
    // Адреса без шляху: лишається стандартна назва.
  }
  const safe = name.replace(/[^\w.-]+/g, "_");
  return safe.includes(".") ? safe : `${safe}.jpg`;
};

const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Фото вже в нашому сховищі: копіювати нема чого. */
const isOwnImage = (url: string) => {
  try {
    return new URL(url).origin === new URL(publicUrl("x")).origin;
  } catch {
    return false;
  }
};

export type StoredItemImage = { imageUrl: string; thumbUrl: string };

/**
 * Копіює фото зі стороннього сайту до нас. Без цього картка замовлення за місяць
 * показуватиме порвану картинку: постачальники міняють адреси й ховають товари.
 * Кидає помилку, якщо сайт не віддав фото; рішення, що далі, за тим, хто викликав.
 */
export async function storeItemImage(teamId: string, sourceUrl: string): Promise<StoredItemImage> {
  if (isOwnImage(sourceUrl)) return { imageUrl: sourceUrl, thumbUrl: sourceUrl };

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Немає сесії для копіювання фото.");

  const storagePath = `teams/${teamId}/order-items/${crypto.randomUUID()}/${fileNameOf(sourceUrl)}`;
  const response = await fetch("/.netlify/functions/catalog-image-import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bucket: BUCKET, storagePath, sourceUrl }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    storagePath?: string;
    previewPath?: string;
    thumbPath?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.error || `Фото не скопіювалось (${response.status}).`);

  const original = payload?.storagePath?.trim() || storagePath;
  return {
    imageUrl: publicUrl(payload?.previewPath?.trim() || original),
    thumbUrl: publicUrl(payload?.thumbPath?.trim() || original),
  };
}

/**
 * Фото для кількох позицій. Невдача нікого не зупиняє: замовлення важливіше за
 * картинку, тож лишається зовнішня адреса. `cache` тримає вже скопійоване на
 * випадок повторного «Створити» після помилки збереження.
 */
export async function storeItemImages(
  teamId: string,
  sources: Array<{ key: string; url: string }>,
  cache: Map<string, StoredItemImage>
): Promise<Map<string, StoredItemImage>> {
  const result = new Map<string, StoredItemImage>();
  await Promise.all(
    sources.map(async ({ key, url }) => {
      const cached = cache.get(url);
      if (cached) {
        result.set(key, cached);
        return;
      }
      try {
        const stored = await storeItemImage(teamId, url);
        cache.set(url, stored);
        result.set(key, stored);
      } catch {
        result.set(key, { imageUrl: url, thumbUrl: url });
      }
    })
  );
  return result;
}
