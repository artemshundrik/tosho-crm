/**
 * Рішення перевірки «чи поїхав цей SQL на прод» — окремо від походів у базу й git.
 *
 * НАВІЩО ОКРЕМИМ МОДУЛЕМ (REQ-104). Сам `check-sql-journal.mjs` — це psql, git і
 * `process.exit`; такий код не перевіриш нічим, крім як зламавши прод-пуш. А
 * помилитись тут дорого в обидва боки: пропустимо незастосований SQL — код і
 * схема розійдуться мовчки; вирішимо навпаки — заблокуємо кожен пуш і перевірку
 * просто вимкнуть. Тож два справжні рішення живуть тут і покриті тестами.
 */

import { createHash } from "node:crypto";

/** sha256 вмісту файлу — саме він відповідає «а це та сама редакція?». */
export function sqlFingerprint(body) {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Позначка в самому файлі, що застосовувати його автоматом не треба.
 *
 * ЩО РАХУЄТЬСЯ. Рядок-коментар, який ПОЧИНАЄТЬСЯ з `-- manual` або
 * `-- rollback`. Навмисно не «слово manual десь у файлі»: інакше будь-яка
 * згадка в поясненні («цей індекс раніше створювали manual») мовчки вимикала б
 * перевірку для цілого файлу.
 */
export function manualMarker(body) {
  const match = String(body).match(/^[ \t]*--[ \t]*(manual|rollback)\b/im);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Чи є САМЕ ЦЯ редакція в журналі.
 *
 * `applied` — набір рядків «шлях|sha», як їх віддає база. Ключем іде пара, а не
 * лише ім'я: файл, який після застосування ще правили, має вважатись
 * незастосованим — інакше журнал підтверджував би те, чого на проді немає.
 */
export function isJournaled(applied, name, sha) {
  return applied.has(`${name}|${sha}`);
}

/**
 * Розкласти список змінених файлів на три купки: застосовані, позначені
 * вручну й ті, через які пуш треба зупинити.
 *
 * `readFile` віддає вміст або null, якщо файлу вже немає (видалений файл нічого
 * застосовувати не просить).
 */
export function triageSqlFiles({ changed, applied, readFile }) {
  const journaled = [];
  const marked = [];
  const missing = [];

  for (const name of changed) {
    const body = readFile(name);
    if (body === null || body === undefined) continue;

    const sha = sqlFingerprint(body);
    if (isJournaled(applied, name, sha)) {
      journaled.push(name);
      continue;
    }
    const marker = manualMarker(body);
    if (marker) {
      marked.push({ name, kind: marker });
      continue;
    }
    missing.push(name);
  }

  return { journaled, marked, missing };
}
