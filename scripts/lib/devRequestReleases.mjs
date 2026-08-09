/**
 * Друга половина кола «коміт → деплой»: після успішного деплою картки, чиї
 * коміти в нього приїхали, переходять у «Викочено».
 *
 * Перша половина — git-хук (scripts/hooks/post-commit): він дописує sha в
 * dev_requests.commit_shas і ставить «Готово локально». Тут ми звіряємо ті самі
 * sha зі складом релізу. Обидва кінці тримаються на sha, а не на словах: тіло
 * коміта в конвеєр релізів не потрапляє, а тему чіпати не можна (§9
 * docs/DEV_REQUESTS_DESIGN.md).
 *
 * Окремим файлом від releaseCommits.mjs навмисно: там — історія релізів, яку
 * читає керівництво, тут — стан дошки розробки. Спільного в них рівно один
 * список sha, і зрощувати їх означало б, що падіння дошки псує звіт.
 */

/** Мінімум, з якого sha взагалі можна порівнювати. Коротше git і сам не видає. */
const SHA_MIN_LENGTH = 7;

/**
 * Один і той самий коміт, записаний по-різному.
 *
 * ПРЕФІКСОМ, а не дослівно: collect() у releaseCommits.mjs ріже sha до 8
 * символів, хук шле короткий (7), а `git rev-parse` віддає всі 40. Дослівне
 * порівняння означало б, що картка ніколи не збігається зі своїм же релізом —
 * тихо й без жодної помилки в логах.
 */
export function shaMatches(a, b) {
  const left = String(a ?? "").trim().toLowerCase();
  const right = String(b ?? "").trim().toLowerCase();
  if (left.length < SHA_MIN_LENGTH || right.length < SHA_MIN_LENGTH) return false;
  const length = Math.min(left.length, right.length);
  return left.slice(0, length) === right.slice(0, length);
}

/**
 * Статуси, з яких деплой картку піднімає у «Викочено».
 *
 * Перелік ДОЗВОЛЕНИХ, а не заборонених — з тієї ж причини, що й OPEN_STATUSES
 * у netlify/functions/_lib/devRequestBoard.ts: новий стан за замовчуванням
 * лишається поза автоматикою, поки хтось свідомо не додасть його сюди.
 *
 * Кого немає: `released` (уже там — повторний деплой не має переписувати
 * released_at) і `wont_do` (рішення людини «не робимо» деплой не скасовує, так
 * само як його не скасовує коміт).
 */
export const RELEASABLE_STATUSES = ["triage", "queued", "in_progress", "done_local"];

/** Колонки, яких вистачає і для рішення, і для рядка в лозі. */
const SELECT_COLUMNS = "id,number,title,status,commit_shas";

/** Стеля вибірки: відкритих карток стільки не буває, це запобіжник від «усієї таблиці». */
const FETCH_LIMIT = 200;

/**
 * Картки, які цей реліз викотив.
 *
 * Чиста функція навмисно: усе, що вирішує долю картки, має перевірятись без
 * мережі й без бази.
 */
export function pickCardsToRelease(cards, shas) {
  const wanted = (shas ?? []).filter((sha) => typeof sha === "string" && sha.trim().length >= SHA_MIN_LENGTH);
  if (wanted.length === 0) return [];

  return (cards ?? []).filter((card) => {
    if (!RELEASABLE_STATUSES.includes(card?.status)) return false;
    const known = Array.isArray(card?.commit_shas) ? card.commit_shas : [];
    return known.some((sha) => wanted.some((candidate) => shaMatches(sha, candidate)));
  });
}

function headers(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/**
 * Відкриті картки з бодай одним записаним комітом.
 *
 * Без фільтра по команді: дошка запитів одна на весь проєкт, а службовий ключ
 * і так бачить усе. Зайвий параметр тут означав би ще одну змінну оточення в
 * збірці — і ще одну причину, чому крок мовчки не спрацював.
 */
export async function fetchCardsWithCommits(env) {
  const query = new URLSearchParams({
    select: SELECT_COLUMNS,
    status: `in.(${RELEASABLE_STATUSES.join(",")})`,
    limit: String(FETCH_LIMIT),
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/dev_requests?${query}`, {
    headers: headers(env, { "accept-profile": "tosho" }),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);

  const rows = await response.json();
  return rows.filter((row) => Array.isArray(row.commit_shas) && row.commit_shas.length > 0);
}

/**
 * Перевести картки у «Викочено».
 *
 * Фільтр по статусу повторюється і в PATCH — не з недовіри до попереднього
 * читання, а тому що між читанням і записом картку могли зрушити руками.
 * Дешевий запобіжник проти єдиного справді неприємного результату: знятого
 * released_at або воскреслого «Не робимо».
 */
export async function markCardsReleased(cards, env, now = new Date()) {
  if (cards.length === 0) return [];

  const query = new URLSearchParams({
    id: `in.(${cards.map((card) => card.id).join(",")})`,
    status: `in.(${RELEASABLE_STATUSES.join(",")})`,
    select: SELECT_COLUMNS,
  });

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/dev_requests?${query}`, {
    method: "PATCH",
    headers: headers(env, {
      "content-type": "application/json",
      "content-profile": "tosho",
      prefer: "return=representation",
    }),
    body: JSON.stringify({ status: "released", released_at: now.toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);

  return response.json();
}

/**
 * Увесь крок цілком: прочитати, звірити, перевести.
 *
 * Повертає оновлені картки — плагін пише з них рядок у лог деплою, щоб
 * «нічого не сталось» відрізнялось від «сталось, але нікому не сказали».
 */
export async function releaseDevRequests(shas, env) {
  const cards = await fetchCardsWithCommits(env);
  const matched = pickCardsToRelease(cards, shas);
  if (matched.length === 0) return [];
  return markCardsReleased(matched, env);
}
