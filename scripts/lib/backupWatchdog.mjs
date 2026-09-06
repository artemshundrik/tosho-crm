/**
 * Сторож бекапа — чиста половина: пороги й вердикт.
 *
 * НАВІЩО ОКРЕМИЙ СТОРОЖ, КОЛИ Є system-alerts. Крон на Netlify читає
 * `tosho.backup_runs` і бачить рівно те, що туди записали скрипти: «дамп
 * пройшов». Чого він не бачить узагалі — файлів на маку Артема, бо їх немає в
 * жодній базі. А саме там і живуть найдорожчі поломки:
 *
 *   • Дзеркало `backups/storage/.mirror/` зникло чи спорожніло. Наступний
 *     тижневий запуск мовчки витягне зі сховища всі 8,5 ГБ заново — це та сама
 *     дірка в egress, яку закривали в липні. Журнал при цьому скаже «успіх».
 *   • Архів записався порожнім. 12.07.2026 офлайновий запуск поклав у Dropbox
 *     280-байтовий файл і позначив його вдалим.
 *   • На диску скінчилось місце. Дзеркало плюс tar потребують удвічі більше,
 *     ніж важить саме дзеркало, і без запасу наступний запуск обірветься.
 *
 * ЧОМУ ПОРОГИ ТУТ, А НЕ В САМОМУ СКРИПТІ: «скільки днів архіву можна бути
 * старим» — це правило, а не робота з файлами. Правило має бути видно з тестів,
 * інакше сторож, який мовчить помилково, нічим не кращий за відсутнього.
 */

/** Дамп бази робиться щодня; дві доби — це вже пропущений запуск, а не пізній. */
export const DB_ARCHIVE_MAX_AGE_DAYS = 2;

/**
 * Сховище — раз на тиждень, і `backup-storage-if-needed.sh` сам себе лікує до
 * восьми діб. Тому тривожимось рівно тоді, коли не спрацювало й самолікування.
 */
export const STORAGE_ARCHIVE_MAX_AGE_DAYS = 8;

/**
 * Менший архів — це порожній архів. 280 байтів того самого інциденту сюди не
 * пролізуть, а справжній найменший (avatars, 1,2 МБ) — пролізе з великим
 * запасом.
 */
export const MIN_ARCHIVE_BYTES = 64 * 1024;

/**
 * Скільки вільного місця треба відносно розміру дзеркала. Півтора, бо tar
 * будується з хардлінків у дзеркало й займає місце лише під стиснуту копію.
 */
export const FREE_SPACE_RATIO = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function ageInDays(iso, now) {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.floor(Math.max(0, now.getTime() - at) / DAY_MS);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${bytes} Б`;
}

/**
 * Вердикт зі зібраних фактів.
 *
 * `facts` — те, що зміряв виклик у файловій системі й базі; тут жодного вводу-
 * виводу, лише правила. Повертає перелік проблем: порожній — усе гаразд, і
 * сторож мовчить.
 *
 * @param {object} facts
 * @param {Array<{bucket: string, exists: boolean, fileCount: number}>} facts.mirrors
 * @param {number|null} facts.mirrorBytes    сумарний розмір дзеркала
 * @param {number|null} facts.freeBytes      вільне місце на томі бекапів
 * @param {{name: string|null, mtime: string|null, bytes: number|null}} facts.newestDbArchive
 * @param {{name: string|null, mtime: string|null, bytes: number|null}} facts.newestStorageArchive
 * @param {Array<{section: string, status: string, finishedAt: string|null, error: string|null}>} facts.lastRuns
 * @param {Date} now
 */
export function assessBackups(facts, now) {
  const problems = [];

  // 1. Дзеркало. Найдорожча з поломок і єдина, якої не видно з хмари.
  for (const mirror of facts.mirrors ?? []) {
    if (!mirror.exists) {
      problems.push(
        `Дзеркало ${mirror.bucket} зникло — наступний тижневий запуск витягне все сховище заново`
      );
    } else if (mirror.fileCount === 0) {
      problems.push(
        `Дзеркало ${mirror.bucket} порожнє — наступний тижневий запуск витягне все сховище заново`
      );
    }
  }

  // 2. Свіжість архівів. Журнал каже «запуск був», файл каже «результат є».
  const dbAge = ageInDays(facts.newestDbArchive?.mtime, now);
  if (!facts.newestDbArchive?.name) {
    problems.push("Архівів бази на диску немає жодного");
  } else if (dbAge !== null && dbAge >= DB_ARCHIVE_MAX_AGE_DAYS) {
    problems.push(`Свіжому архіву бази ${dbAge} дн — дамп не робиться`);
  }

  const storageAge = ageInDays(facts.newestStorageArchive?.mtime, now);
  if (!facts.newestStorageArchive?.name) {
    problems.push("Архівів сховища на диску немає жодного");
  } else if (storageAge !== null && storageAge >= STORAGE_ARCHIVE_MAX_AGE_DAYS) {
    problems.push(`Свіжому архіву сховища ${storageAge} дн — не спрацювало й самолікування`);
  }

  // 3. Порожній архів. Він виглядає як успіх усюди, крім розміру.
  for (const [label, archive] of [
    ["бази", facts.newestDbArchive],
    ["сховища", facts.newestStorageArchive],
  ]) {
    if (archive?.name && Number.isFinite(archive.bytes) && archive.bytes < MIN_ARCHIVE_BYTES) {
      problems.push(`Архів ${label} ${archive.name} важить ${formatBytes(archive.bytes)} — він порожній`);
    }
  }

  // 4. Місце. Перевіряємо ДО того, як воно скінчиться посеред дампа.
  if (Number.isFinite(facts.freeBytes) && Number.isFinite(facts.mirrorBytes)) {
    const needed = facts.mirrorBytes * FREE_SPACE_RATIO;
    if (facts.freeBytes < needed) {
      problems.push(
        `Вільно ${formatBytes(facts.freeBytes)}, а наступному запуску треба ~${formatBytes(needed)}`
      );
    }
  }

  // 5. Журнал. Крон про це вже пише, тож сюди береться лише останній рядок і
  //    лише коли він червоний — щоб сторож не дублював чужий алерт щоранку.
  for (const run of facts.lastRuns ?? []) {
    if (run.status && run.status !== "success") {
      const tail = run.error ? ` — ${run.error.slice(0, 120)}` : "";
      problems.push(`Останній запуск (${run.section}) впав${tail}`);
    }
  }

  return problems;
}

/**
 * Повідомлення в Telegram. `null` — писати нічого.
 *
 * ЧОМУ МОВЧАННЯ НА ЗЕЛЕНОМУ: щоденне «бекап у нормі» перетворює сторожа на фон
 * за тиждень, і тоді він не спрацює й тоді, коли справді горітиме. Те саме
 * правило, що й у кошика запитів у ранковому звіті.
 */
export function watchdogMessage(problems, dayLabel) {
  if (problems.length === 0) return null;
  const head = `🔴 Бекап: ${problems.length === 1 ? "проблема" : `проблем ${problems.length}`} — ${dayLabel}`;
  return [head, "", ...problems.map((line) => `• ${line}`)].join("\n");
}
