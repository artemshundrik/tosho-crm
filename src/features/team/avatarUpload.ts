/**
 * Аватарка: обрізання, три розміри, заливка в сховище.
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ. Досі цей код жив усередині `ProfilePage` — і поки
 * фото міг міняти лише його власник, це нікому не заважало. Тепер те саме
 * робить власник і СЕО в картці людини (`/team/:userId`), тобто зʼявився
 * ДРУГИЙ виклик. Копія розійшлася б із першою так само, як свого часу
 * розійшлися шість списків модулів (`src/lib/moduleAccess.ts`): досить, щоб в
 * одному місці змінився розмір або якість webp — і половина команди має
 * аватарки іншого кадру.
 *
 * Модуль нічого не знає про React і про те, ЧИЮ аватарку заливає: він
 * приймає картинку з рамкою кадру й повертає шляхи у сховищі. Хто це має
 * право робити, вирішує сторінка, а хто пише результат у профіль — теж вона:
 * власний профіль додатково оновлює метадані сесії (`auth.updateUser`), а
 * адмінська картка цього зробити не може й не мусить — усі поверхні читають
 * аватарку спершу з довідника.
 */

import type { Area } from "react-easy-crop";

import { supabase } from "@/lib/supabaseClient";

export const AVATAR_BUCKET =
  (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET as string | undefined) || "avatars";

/** Рік і `immutable`: шлях містить мітку часу, тож старий кадр ніколи не перезаписується. */
const STORAGE_CACHE_CONTROL = "31536000, immutable";

const AVATAR_XS_SIZE = 40;
const AVATAR_MD_SIZE = 64;
const AVATAR_HERO_SIZE = 192;

/** Більше за це не приймаємо на вхід — обрізане все одно поїде як webp на 192 px. */
export const AVATAR_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type AvatarVariantPaths = {
  xs: string;
  md: string;
  hero: string;
};

export function getAvatarVariantPaths(basePath: string): AvatarVariantPaths {
  const normalizedBase = basePath.replace(/\/+$/, "");
  return {
    xs: `${normalizedBase}/xs.webp`,
    md: `${normalizedBase}/md.webp`,
    hero: `${normalizedBase}/hero.webp`,
  };
}

/**
 * Шляхи, які треба прибрати після заміни фото.
 *
 * `sm`/`lg` у переліку — сліди старої схеми імен: у мігрованих рядках вони ще
 * трапляються, і без них у сховищі лишалося сміття.
 */
export function getAvatarCleanupPaths(path: string | null | undefined): string[] {
  if (!path) return [];
  if (/\/(xs|md|hero|sm|lg)\.[^/.]+$/i.test(path)) {
    const basePath = path.replace(/\/(xs|md|hero|sm|lg)\.[^/.]+$/i, "");
    const variants = getAvatarVariantPaths(basePath);
    return [variants.xs, variants.md, variants.hero];
  }
  return [path];
}

/** Перевірка вибраного файлу; повертає причину відмови або `null`, якщо все гаразд. */
export function describeAvatarFileProblem(file: File): { title: string; description: string } | null {
  if (!file.type.startsWith("image/")) {
    return {
      title: "Потрібне зображення",
      description: "Оберіть файл зображення (JPG, PNG, WebP тощо).",
    };
  }
  if (file.size > AVATAR_MAX_FILE_BYTES) {
    return { title: "Занадто великий файл", description: "Максимальний розмір — 5 MB." };
  }
  return null;
}

async function getCroppedBlob(imageSrc: string, cropArea: Area, outputSize: number): Promise<Blob | null> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.drawImage(
    image,
    cropArea.x * scaleX,
    cropArea.y * scaleY,
    cropArea.width * scaleX,
    cropArea.height * scaleY,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      canvas.toBlob((fallbackBlob) => resolve(fallbackBlob), "image/png");
    }, "image/webp", 0.86);
  });
}

/**
 * Обрізати, зробити три розміри й залити їх у сховище.
 *
 * Повертає шляхи варіантів; канонічним посиланням у профілі стає `hero`
 * (`avatar_path`), а `avatar_url` при цьому обнуляється — див.
 * `getCanonicalAvatarReference`.
 */
export async function uploadAvatarVariants({
  userId,
  imageSrc,
  cropArea,
}: {
  userId: string;
  imageSrc: string;
  cropArea: Area;
}): Promise<AvatarVariantPaths> {
  const [xsBlob, mdBlob, heroBlob] = await Promise.all([
    getCroppedBlob(imageSrc, cropArea, AVATAR_XS_SIZE),
    getCroppedBlob(imageSrc, cropArea, AVATAR_MD_SIZE),
    getCroppedBlob(imageSrc, cropArea, AVATAR_HERO_SIZE),
  ]);
  if (!xsBlob || !mdBlob || !heroBlob) {
    throw new Error("Не вдалося підготувати аватар.");
  }

  const variantPaths = getAvatarVariantPaths(`avatars/${userId}/${Date.now()}`);
  for (const entry of [
    { path: variantPaths.xs, blob: xsBlob },
    { path: variantPaths.md, blob: mdBlob },
    { path: variantPaths.hero, blob: heroBlob },
  ]) {
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(entry.path, entry.blob, {
        upsert: true,
        contentType: entry.blob.type || "image/webp",
        cacheControl: STORAGE_CACHE_CONTROL,
      });
    if (uploadError) throw uploadError;
  }

  return variantPaths;
}

/** Прибрати попередній кадр. Помилка тут нікого не блокує — фото вже замінене. */
export function cleanupPreviousAvatar(previousPath: string | null | undefined, nextPaths: AvatarVariantPaths) {
  const stale = getAvatarCleanupPaths(previousPath).filter(
    (path) => path !== nextPaths.xs && path !== nextPaths.md && path !== nextPaths.hero
  );
  if (stale.length === 0) return;
  void supabase.storage
    .from(AVATAR_BUCKET)
    .remove(stale)
    .catch(() => {
      // ignore cleanup failures for old avatars
    });
}
