#!/usr/bin/env node
/**
 * Записує реліз в історію: бере коміти від попереднього запису до HEAD,
 * розбирає їх за конвенцією `type(scope): subject` і кладе в tosho.releases.
 *
 * НАВІЩО: стрічка «Що нового» навмисно фільтрована — там лише те, що помітить
 * людина. Обсяг роботи по ній не побачиш. Git бачить усе, тож історія релізів
 * будується з нього, а не з анонсів.
 *
 * Запуск (після пушу в main):
 *   set -a; source .env.backup; set +a
 *   node scripts/record-release.mjs
 *
 * Ідемпотентно: якщо HEAD уже записаний, нічого не робить.
 * Аргумент --dry друкує, що буде записано, і виходить.
 */

import { execFileSync } from "node:child_process";

const DRY = process.argv.includes("--dry");
const DB_URL = process.env.BACKUP_DB_URL;

if (!DB_URL) {
  console.error("Немає BACKUP_DB_URL. Спершу: set -a; source .env.backup; set +a");
  process.exit(1);
}

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const psql = (sql) =>
  execFileSync("psql", [DB_URL, "-tAq", "-c", sql], { encoding: "utf8" }).trim();

/** `feat(features): текст` → {type, scope, subject}. Без конвенції — type "other". */
function parse(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!match) return { type: "other", scope: null, subject };
  return { type: match[1], scope: match[2] ?? null, subject: match[3] };
}

/** Документи й службові коміти в обсяг роботи не рахуємо: вони про процес. */
const isProductChange = (change) => !["docs", "chore"].includes(change.type);

/**
 * Відновлення історії: один запис на календарний день, бо релізи в цьому
 * проєкті день-у-день і збігаються з пушами. Точніше з git не витягти —
 * дат деплоїв він не знає, — але для питання «скільки зроблено за місяць»
 * добовий крок правдивий.
 */
if (process.argv.includes("--backfill")) {
  const raw = git(["log", "--no-merges", "--format=%H%x1f%cI%x1f%s", "-300"]);
  const byDay = new Map();

  for (const line of raw.split("\n").filter(Boolean)) {
    const [sha, iso, subject] = line.split("");
    const change = { sha: sha.slice(0, 8), ...parse(subject ?? ""), at: iso };
    if (!isProductChange(change)) continue;
    const day = iso.slice(0, 10);
    const bucket = byDay.get(day) ?? { day, iso, head: sha, changes: [] };
    // git іде від найновішого — перший побачений у дні і є головою дня.
    bucket.changes.push(change);
    byDay.set(day, bucket);
  }

  const days = Array.from(byDay.values()).filter((bucket) => bucket.changes.length > 0);
  console.log(`Відновлюємо ${days.length} днів, ${days.reduce((n, d) => n + d.changes.length, 0)} змін`);

  if (DRY) {
    days.slice(0, 10).forEach((d) => console.log(`  ${d.day}: ${d.changes.length}`));
    process.exit(0);
  }

  for (const bucket of days) {
    const payload = JSON.stringify(bucket.changes).replace(/'/g, "''");
    psql(
      `insert into tosho.releases (commit_ref, released_at, changes)
       values ('${bucket.head}', '${bucket.iso}'::timestamptz, '${payload}'::jsonb)
       on conflict (commit_ref) do update set changes = excluded.changes`
    );
  }
  console.log("Історію відновлено.");
  process.exit(0);
}

/**
 * Дозаписує час коміта в уже збережені записи.
 *
 * НАВІЩО ОКРЕМИЙ РЕЖИМ, А НЕ ПОВТОРНИЙ --backfill: бекфіл ключується головою
 * дня, а голова дня змінюється з кожним новим комітом. Повторний запуск створив
 * би НОВИЙ рядок на той самий день поруч зі старим, і всі зміни того дня
 * порахувались би двічі. Тут ми не чіпаємо склад записів — лише додаємо полю
 * `at` значення з git, і тільки там, де його ще немає.
 */
if (process.argv.includes("--enrich")) {
  // Ключ — рівно ті 8 символів, які зберігає сам записувач: %h скорочує до 7.
  const times = new Map(
    git(["log", "--no-merges", "--format=%H%x1f%cI", "-500"])
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, at] = line.split("\x1f");
        return [sha.slice(0, 8), at];
      })
  );

  const rows = psql(
    "select id || '\x1f' || changes::text from tosho.releases order by released_at"
  ).split("\n").filter(Boolean);

  let touched = 0;
  let filled = 0;

  for (const row of rows) {
    const [id, json] = row.split("\x1f");
    const changes = JSON.parse(json);
    let changed = false;

    for (const change of changes) {
      if (change.at) continue;
      const at = times.get(change.sha);
      if (!at) continue; // коміта вже немає в зрізі git — лишаємо без часу
      change.at = at;
      changed = true;
      filled += 1;
    }

    if (!changed) continue;
    if (!DRY) {
      const payload = JSON.stringify(changes).replace(/'/g, "''");
      psql(`update tosho.releases set changes = '${payload}'::jsonb where id = '${id}'`);
    }
    touched += 1;
  }

  console.log(`${DRY ? "[dry] " : ""}Записів оновлено: ${touched}, проставлено часів: ${filled}.`);
  process.exit(0);
}

const head = git(["rev-parse", "HEAD"]);

const already = psql(`select 1 from tosho.releases where commit_ref = '${head}' limit 1`);
if (already) {
  console.log(`HEAD ${head.slice(0, 8)} уже записаний — нічого не робимо.`);
  process.exit(0);
}

const lastRef = psql("select commit_ref from tosho.releases order by released_at desc limit 1");
// Перший запуск: беремо розумний зріз, а не всю історію проєкту.
const range = lastRef ? `${lastRef}..HEAD` : "HEAD~40..HEAD";

const raw = git(["log", range, "--no-merges", "--format=%H%x1f%cI%x1f%s"]);
if (!raw) {
  console.log("Нових комітів немає.");
  process.exit(0);
}

const changes = raw
  .split("\n")
  .map((line) => {
    const [sha, iso, subject] = line.split("");
    return { sha: sha.slice(0, 8), ...parse(subject ?? ""), at: iso };
  })
  .filter(isProductChange);

if (changes.length === 0) {
  console.log("Змістовних змін немає (лише docs/chore).");
  process.exit(0);
}

const byType = changes.reduce((acc, change) => {
  acc[change.type] = (acc[change.type] ?? 0) + 1;
  return acc;
}, {});

console.log(`Реліз ${head.slice(0, 8)}: ${changes.length} змін`);
console.log(
  Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `  ${type}: ${count}`)
    .join("\n")
);

if (DRY) {
  console.log("\n--dry: нічого не записано.");
  process.exit(0);
}

const payload = JSON.stringify(changes).replace(/'/g, "''");
psql(
  `insert into tosho.releases (commit_ref, changes) values ('${head}', '${payload}'::jsonb)
   on conflict (commit_ref) do nothing`
);

console.log("Записано в tosho.releases.");
