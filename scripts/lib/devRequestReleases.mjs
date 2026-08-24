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

import { execFileSync } from "node:child_process";

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

/**
 * Колонки, яких вистачає і для рішення, і для рядка в лозі.
 *
 * `checklist` тут не для показу — за ним вирішується, чи картку взагалі можна
 * закривати (див. hasOpenChecklist нижче).
 */
const SELECT_COLUMNS = "id,number,title,status,commit_shas,checklist";

/** Стеля вибірки: відкритих карток стільки не буває, це запобіжник від «усієї таблиці». */
const FETCH_LIMIT = 200;

/**
 * Чи лишився в картці незакритий хвіст.
 *
 * ЗАЧИМ ЦЕ ТУТ. «Викочено» означало одночасно два різні факти: код у проді і
 * задачу закрито. Для дрібної картки це те саме, для великої — ні: у REQ-36
 * поїхала половина, а 14 пунктів із 40 лишились, і картка все одно зникла з
 * черги, з бота й через місяць пішла б в архів. Разом із двома питаннями, на
 * які ніхто не відповів, і одним, що чекало СЕО тринадцятий день.
 *
 * Стан пунктів звіряє src/features/devRequests/checklist.ts — тут свідомо лише
 * «не done», без переліку станів. Другий список станів у цьому файлі розійшовся
 * би з першим рівно тоді, коли туди додадуть новий стан.
 */
export function hasOpenChecklist(card) {
  const items = card?.checklist;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => item && typeof item === "object" && item.state !== "done");
}

/**
 * Картки, які цей реліз викотив.
 *
 * Чиста функція навмисно: усе, що вирішує долю картки, має перевірятись без
 * мережі й без бази.
 *
 * Картку з незакритим хвостом деплой НЕ закриває — вона лишається там, де її
 * поставив коміт («Готово локально»), і далі видима в черзі. Коміти при цьому
 * все одно дописані, тож розділ «Релізи» бачить роботу: він будується з
 * комітів, а не зі статусів карток.
 */
export function pickCardsToRelease(cards, shas) {
  const wanted = (shas ?? []).filter((sha) => typeof sha === "string" && sha.trim().length >= SHA_MIN_LENGTH);
  if (wanted.length === 0) return [];

  return (cards ?? []).filter((card) => {
    if (!RELEASABLE_STATUSES.includes(card?.status)) return false;
    if (hasOpenChecklist(card)) return false;
    const known = Array.isArray(card?.commit_shas) ? card.commit_shas : [];
    return known.some((sha) => wanted.some((candidate) => shaMatches(sha, candidate)));
  });
}

/**
 * Картки, які гейт затримав раніше, а тепер їх нарешті дозакривали.
 *
 * БЕЗ ЦЬОГО ГЕЙТ — ПАСТКА. Основний прохід звіряє картку з комітами САМЕ ЦЬОГО
 * релізу (від попереднього запису до HEAD). Затриману картку наступний деплой
 * уже не бачить: її sha лишились у минулому діапазоні. А хвіст великої задачі
 * закривається переважно БЕЗ коду — відповів СЕО, проклацали, домовились, — і
 * нового коміта, з яким картка потрапила б у свіжий діапазон, може не бути
 * ніколи. Картка застрягла б у «Готово локально» назавжди, і ми поміняли б одну
 * тиху брехню на іншу.
 *
 * `isInProd` відповідає на єдине питання, яке тут важить: чи цей коміт уже
 * всередині того, що зараз викотили. Відповідь дає git (див. commitIsInHistory),
 * а не наше припущення.
 */
export function pickCardsToCatchUp(cards, shas, isInProd) {
  const wanted = (shas ?? []).filter((sha) => typeof sha === "string" && sha.trim().length >= SHA_MIN_LENGTH);

  return (cards ?? []).filter((card) => {
    // Лише «Готово локально»: саме там опиняється картка, яку затримав гейт —
    // її туди поставив коміт, а деплой не зрушив.
    if (card?.status !== "done_local") return false;
    // Хвіст ще живий — затримка чинна, наздоганяти нічого.
    if (hasOpenChecklist(card)) return false;
    // Картка без чекліста гейтом ніколи не затримувалась, тож і наздоганяти їй
    // нічого. Без цієї умови сюди потрапила б будь-яка щойно закомічена, але
    // ще НЕ ЗАПУШЕНА картка — і поїхала б у «Викочено» чужим деплоєм.
    if (!Array.isArray(card?.checklist) || card.checklist.length === 0) return false;

    const known = Array.isArray(card?.commit_shas) ? card.commit_shas : [];
    if (known.length === 0) return false;
    // Те, що приїхало цим релізом, уже забрав основний прохід.
    if (known.some((sha) => wanted.some((candidate) => shaMatches(sha, candidate)))) return false;

    return known.some((sha) => isInProd(sha));
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
 * Чи цей коміт уже всередині того, що зараз викочується.
 *
 * Питає git, а не здогадується: `merge-base --is-ancestor` відповідає рівно на
 * «чи лежить цей коміт у предках HEAD», і саме це означає «код у проді» в
 * момент успішного деплою.
 *
 * ПОМИЛКА ЧИТАЄТЬСЯ ЯК «НІ». Netlify клонує неглибоко, і старого sha в історії
 * може просто не бути — git тоді впаде. Відповідь «ні» лишає картку в «Готово
 * локально»: вона видима на дошці, і людина це виправить. Відповідь «так»
 * навмання відправила б у «Викочено» те, чого в проді може не бути, — тобто
 * рівно ту тиху брехню, від якої весь цей гейт і будували.
 */
export function commitIsInHistory(sha, run = defaultGit) {
  const value = String(sha ?? "").trim();
  if (value.length < SHA_MIN_LENGTH) return false;
  try {
    run(["merge-base", "--is-ancestor", value, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function defaultGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Увесь крок цілком: прочитати, звірити, перевести.
 *
 * Два набори, а не один: те, що приїхало цим релізом, і те, що гейт затримав
 * раніше, а тепер дозакрили. Обидва йдуть одним записом — для дошки різниці
 * немає, а два PATCH-и означали б два способи наполовину не спрацювати.
 *
 * Повертає оновлені картки — плагін пише з них рядок у лог деплою, щоб
 * «нічого не сталось» відрізнялось від «сталось, але нікому не сказали».
 */
export async function releaseDevRequests(shas, env, isInProd = commitIsInHistory) {
  const cards = await fetchCardsWithCommits(env);
  const matched = [...pickCardsToRelease(cards, shas), ...pickCardsToCatchUp(cards, shas, isInProd)];
  if (matched.length === 0) return [];
  return markCardsReleased(matched, env);
}
