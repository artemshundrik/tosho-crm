/**
 * Кладе аватарки, що лежать повз конвенцію, на канонічні ключі (REQ-175#p91).
 *
 * ЩО НЕ ТАК. Завантажувач (`src/features/team/avatarUpload.ts`) пише ключ як
 * `avatars/<user>/<ts>/<variant>.webp` — саме так, із іменем відра всередині
 * самого відра `avatars`. У базі (`tosho.team_member_profiles.avatar_path`)
 * лежить той самий рядок. Але чотири файли двох профілів у сховищі лежать БЕЗ
 * цього префікса, тож `resolveAvatarDisplayUrl` для них завжди витрачає першу
 * спробу дарма: просить `avatars/<user>/…`, дістає 400, і лише другою спробою
 * (без префікса) влучає.
 *
 * ЧОМУ КОПІЯ, А НЕ ПЕРЕНЕСЕННЯ. Копія нічого не руйнує: оригінал лишається на
 * місці, тож крок відкотний, а старі посилання, якщо десь є, не ламаються.
 * Прибрати оригінали можна колись потім і окремо — це вже видалення, і його
 * робить людина.
 *
 * ЧОМУ НЕ SQL. Правити `avatar_path` у базі означало б, що два рядки з
 * двадцяти одного почнуть відрізнятись від конвенції, за якою пише
 * завантажувач, — і наступне ж перезавантаження фото поверне їх назад.
 * Дешевше покласти файл туди, де його шукають.
 *
 * Запуск: node --env-file=.env.local scripts/copy-avatar-objects.mjs
 * Повторний запуск безпечний: уже скопійовані ключі пропускаються.
 */

const BUCKET = process.env.VITE_SUPABASE_AVATAR_BUCKET || "avatars";
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Немає SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY — запускай із --env-file=.env.local");
  process.exit(1);
}

/** Ключі, знайдені запитом: bucket_id='avatars' and name not like 'avatars/%'. */
const SOURCE_KEYS = [
  "061497cc-be90-4b94-bd44-db6df5b3c0a6/1785062120139/hero.webp",
  "061497cc-be90-4b94-bd44-db6df5b3c0a6/1785062120139/md.webp",
  "061497cc-be90-4b94-bd44-db6df5b3c0a6/1785062120139/xs.webp",
  "e328c5fc-1773-48c0-a5d4-a73f42687c66/bot.svg",
];

const headers = {
  "Content-Type": "application/json",
  apikey: key,
  Authorization: `Bearer ${key}`,
};

let copied = 0;
let skipped = 0;
let failed = 0;

for (const sourceKey of SOURCE_KEYS) {
  const destinationKey = `${BUCKET}/${sourceKey}`;
  const response = await fetch(`${url}/storage/v1/object/copy`, {
    method: "POST",
    headers,
    body: JSON.stringify({ bucketId: BUCKET, sourceKey, destinationKey }),
  });

  if (response.ok) {
    copied += 1;
    console.log(`✅ ${destinationKey}`);
    continue;
  }

  const body = await response.text();
  // 409 — ключ уже існує: значить, скрипт уже ганяли, і це не помилка.
  if (response.status === 409 || /already exists|Duplicate/i.test(body)) {
    skipped += 1;
    console.log(`↷ ${destinationKey} — уже на місці`);
    continue;
  }

  failed += 1;
  console.error(`✖ ${destinationKey} — ${response.status} ${body.slice(0, 200)}`);
}

console.log(`\nСкопійовано ${copied}, пропущено ${skipped}, помилок ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
