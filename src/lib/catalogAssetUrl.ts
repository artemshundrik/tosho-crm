import { supabase } from "@/lib/supabaseClient";

import type { CatalogImageAsset } from "@/types/catalog";

/**
 * Адреси картинки каталогу — з одного шляху, а не з чотирьох збережених
 * рядків (REQ-250#p2).
 *
 * ЩО БУЛО НЕ ТАК. У `metadata` кожна картинка несла `originalUrl`,
 * `previewUrl`, `thumbUrl` і сам `path` — чотири майже однакові рядки, що
 * різняться суфіксом. На 440 варіантах це 563 кБ із 660 усієї їхньої ваги:
 * сторінка каталогу вантажила переважно повторений префікс Supabase Storage.
 *
 * ЧОМУ ВИВЕДЕННЯ БЕЗПЕЧНЕ. Правило перевірено на живих даних 04.09.2026:
 * 439 із 440 варіантів (у 440-го немає bucket) і 220 із 220 моделей дають
 * рівно ті самі рядки, що збережені. Тобто збережені URL не несли жодної
 * інформації, якої немає в `bucket` + `path`.
 *
 * ЯКЩО ПРАВИЛО ЗМІНИТЬСЯ — зміниться воно в одному місці: у конвеєрі
 * `netlify/functions/catalog-image-import.ts`, який ці `__thumb` / `__preview`
 * і робить. Тоді правити тут, а не шукати по базі.
 */

/** Похідні `__thumb` / `__preview` кладуться поруч з оригіналом і завжди webp. */
const derivedPath = (path: string, suffix: "__thumb" | "__preview") =>
  `${path.replace(/\.[^.]+$/, "")}${suffix}.webp`;

const publicUrl = (bucket: string, path: string) =>
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

/**
 * `bucket` + `path` → той самий об'єкт, який раніше лежав у базі цілком.
 * `null`, якщо шляху немає: картинки просто не буде, і це нормальний стан.
 */
export function buildCatalogImageAsset(
  bucket: string | null | undefined,
  path: string | null | undefined
): CatalogImageAsset | null {
  const cleanBucket = bucket?.trim();
  const cleanPath = path?.trim();
  if (!cleanBucket || !cleanPath) return null;
  return {
    bucket: cleanBucket,
    path: cleanPath,
    originalUrl: publicUrl(cleanBucket, cleanPath),
    previewUrl: publicUrl(cleanBucket, derivedPath(cleanPath, "__preview")),
    thumbUrl: publicUrl(cleanBucket, derivedPath(cleanPath, "__thumb")),
  };
}
