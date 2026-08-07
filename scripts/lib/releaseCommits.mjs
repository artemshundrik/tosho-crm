/**
 * Спільна логіка запису релізів: розбір комітів, переказ їх людською через AI
 * і запис у tosho.releases.
 *
 * Використовується з двох місць — build-плагіна Netlify (автоматично на кожен
 * успішний деплой) і ручного scripts/record-release.mjs. Логіка мусить бути
 * однією: інакше історія, зібрана руками, відрізнялася б від зібраної
 * автоматично, і порівнювати періоди стало б неможливо.
 */

import { execFileSync } from "node:child_process";

/** `feat(features): текст` → {type, scope, subject}. Без конвенції — type "other". */
export function parse(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
  if (!match) return { type: "other", scope: null, subject };
  return { type: match[1], scope: match[2] ?? null, subject: match[3] };
}

const SEP = "\x1f";

/**
 * Коміти діапазону. Раніше docs і chore відкидались як «про процес», але
 * `chore(design): бекфіл версій` — це реальна робота, просто названа службово.
 * Тепер беремо все: у зведеннях невідомі типи й так падають у «решту».
 */
export function collect(range, cwd = process.cwd()) {
  const args = ["log", "--no-merges", `--format=%H${SEP}%cI${SEP}%s`];
  if (range) args.splice(1, 0, range);
  const raw = execFileSync("git", args, { encoding: "utf8", cwd }).trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, at, subject] = line.split(SEP);
      return { sha: sha.slice(0, 8), ...parse(subject ?? ""), at };
    });
}

/**
 * Переказує теми комітів людською мовою.
 *
 * НАВІЩО: «DateTimeInput і DateTimePicker» для керівника — набір літер. Але
 * переписаний текст може й збрехати, тому оригінал ми НЕ викидаємо: людський
 * стає заголовком, технічний лишається поруч. Якщо AI щось перекрутив, це
 * видно за один клік.
 *
 * Помилка AI ніколи не зриває запис: без переказу історія просто лишається
 * технічною, і це набагато краще, ніж її відсутність.
 */
/**
 * Ознаки того, що тему писали для програміста, а не для людини: склеєні слова
 * (DateTimeInput), службові імена (_lib), розширення файлів, латинські
 * абревіатури.
 *
 * НАВІЩО: замір по 60 останніх комітах — технічних лише 10%. Решта вже
 * читається нормально, і переказувати їх означає платити за те, щоб AI
 * переставив слова місцями, а заразом ризикувати, що він щось перекрутить.
 * Дешевше й безпечніше писати теми людською одразу, а AI лишити на ті випадки,
 * де без технічної назви не обійтись.
 */
const TECHNICAL =
  /(?:[a-zа-яіїєґ][A-ZА-ЯІЇЄҐ])|(?:^|[\s(«"])_[a-z]|\.(?:ts|tsx|mjs|sql|json)\b|(?:^|\s)(?:RLS|RPC|SQL|IDOR|JWT|CTE|DOM|SSR|CORS)\b/;

export function needsRewrite(subject) {
  return TECHNICAL.test(subject);
}

export async function rewriteSubjects(all, env = process.env) {
  const key = env.OPENAI_API_KEY;
  const changes = all.filter((change) => needsRewrite(change.subject));
  if (!key || changes.length === 0) return new Map();

  const list = changes.map((c) => `${c.sha}\t${c.scope ?? "—"}\t${c.subject}`).join("\n");

  const prompt = [
    "Ти переказуєш технічні коміти CRM для керівника, який не програміст.",
    "На кожен рядок (sha, розділ, тема) дай короткий опис українською.",
    "",
    "Правила:",
    "- Пиши, ЩО тепер працює інакше з погляду людини, яка користується CRM.",
    "- НЕ ВИГАДУЙ. Якщо з теми незрозуміло, що змінилось, перекажи її буквально.",
    "- Технічні назви (DateTimeInput, DateInput, _lib, RLS, hook, esbuild) ПРИБИРАЙ",
    "  зовсім, а не переписуй малими літерами. Заміни на те, що бачить людина:",
    "  «поле дати», «службовий модуль». Якщо без назви речення розсипається —",
    "  скажи, що саме стало працювати інакше.",
    "- Власні назви лишай як є: Netlify, Telegram, Нова Пошта, Dropbox.",
    "- З малої літери починається лише ПЕРШЕ слово, і то якщо це не власна назва.",
    "- Без крапки в кінці, до 90 символів.",
    "- Зберігай назви розділів CRM і слова в лапках, якщо вони є.",
    "",
    "Відповідь — JSON: {\"items\":[{\"sha\":\"...\",\"plain\":\"...\"}]}",
    "",
    list,
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    const map = new Map();
    for (const item of parsed.items ?? []) {
      if (item?.sha && typeof item.plain === "string" && item.plain.trim()) {
        map.set(item.sha, item.plain.trim());
      }
    }
    return map;
  } catch (error) {
    console.warn(`[release] переказ не вдався, лишаємо технічні теми: ${error.message}`);
    return new Map();
  }
}

/** Останній записаний коміт — від нього рахуємо наступний діапазон. */
export async function lastCommitRef(env = process.env) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/releases?select=commit_ref&order=released_at.desc&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "accept-profile": "tosho",
      },
    }
  );
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  const rows = await response.json();
  return rows[0]?.commit_ref ?? null;
}

export async function writeRelease(commitRef, changes, env = process.env) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/releases`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      "content-profile": "tosho",
      // Той самий деплой може прийти двічі — повтор має бути безпечним.
      prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({ commit_ref: commitRef, changes }),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
}

/**
 * Діапазон від останнього запису до HEAD. Netlify клонує репозиторій неглибоко,
 * тож попереднього коміта в клоні може не бути — тоді беремо обмежений зріз,
 * а не падаємо. Дублікати відсіються за sha на боці читача.
 */
export function rangeFrom(lastRef, cwd = process.cwd()) {
  if (!lastRef) return "-30";
  try {
    execFileSync("git", ["cat-file", "-e", `${lastRef}^{commit}`], { cwd, stdio: "ignore" });
    return `${lastRef}..HEAD`;
  } catch {
    console.warn("[release] попереднього коміта немає в клоні — беремо останні 30");
    return "-30";
  }
}
