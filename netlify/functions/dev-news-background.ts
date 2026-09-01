import { createClient } from "@supabase/supabase-js";

import { assertCronAuthorized } from "./_cronAuth";
import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { isCategoryVisibleForRole } from "./_notificationCategories";
import { loadMembers, sendDigest, type AdminClient, type MemberRow } from "./_lib/digestDelivery";
import { STACK_SNAPSHOT } from "../../src/data/stackSnapshot.generated";
import {
  applyPicks,
  extractArticleText,
  readableSourceUrl,
  atomUrl,
  buildPickPrompt,
  claudeCodeItem,
  claudePlatformItem,
  bestEntry,
  cleanReleaseTitle,
  isRecent,
  parseFeed,
  parseClaudeNotes,
  renderDevNews,
  stackItems,
  CLAUDE_CODE_REPO,
  CLAUDE_PLATFORM_NOTES,
  WATCH_REPOS,
  READING_FEEDS,
  HN_MIN_POINTS,
  GITHUB_MIN_STARS,
  GITHUB_FRESH_DAYS,
  type DevNewsItem,
  type ModelPick,
  type WatchCandidate,
} from "../../src/lib/devNews";

// Ранкова підбірка для розробки (REQ-239): о 09:00 за Києвом власнику йде одне
// повідомлення про те, що нового у стеку, у Claude і поруч.
//
//   ?dry=1        — зібрати й віддати текст у відповіді, нікому не надсилаючи;
//   ?only=<email> — надіслати по-справжньому, але одній людині;
//   ?force=1      — не займати добовий слот у digest_log.
//
// ЧОМУ ФОНОВА, ХОЧА СПЕРШУ БУЛА СИНХРОННОЮ. Синхронна функція Netlify живе 10
// секунд, і в них уміщався збір із моделлю-відбором — ледве, з дедлайном на 5 с.
// Але тепер підбірка ще й ЧИТАЄ обрані статті й переказує їх людською мовою: це
// чотири завантаження сторінок плюс другий виклик моделі, тобто ще секунд
// п'ять-вісім. У десять не влазить ніяк, а різати розбір заради стелі означало б
// викинути те, заради чого підбірку й переробляли.
//
// ЦІНА РІШЕННЯ: фонова функція віддає 202 і ВИКИДАЄ тіло відповіді, тож ?dry=1
// більше нічого не показав би у відповіді. Тому готовий текст лягає в
// tosho.dev_news_last — звідти його видно і psql-ем, і майбутньою сторінкою.
// Тобто «подивитись очима, перш ніж піде людині» лишилось, просто дивимось не
// у відповідь, а в базу.
//
// РОЗКЛАД ТУТ НЕ ОГОЛОШУЄТЬСЯ. Планувальник Netlify у нас мертвий, усі крони
// запускає pg_cron із самої бази — розклад лежить у scripts/dev-news-cron.sql.

const TIME_ZONE = "Europe/Kiev";

/** Стеля на весь етап читання статей. Фонова функція живе 15 хвилин. */
const EXPLAIN_DEADLINE_MS = 45_000;

/** Скільки статей читаємо вглиб. Стільки ж, скільки вміщає блок. */
const EXPLAIN_LIMIT = 4;

/** Стеля на одну статтю. Довші все одно обрізає extractArticleText. */
const ARTICLE_TIMEOUT_MS = 6_000;

/**
 * Дедлайн на збір. Синхронна функція Netlify живе 10 секунд, і впертись у цю
 * межу означало б не надіслати НІЧОГО. Тому після дедлайну припиняємо питати
 * й складаємо повідомлення з того, що вже маємо: підбірка без блоку «варте
 * уваги» — це трохи бідніша підбірка, а не зламана.
 *
 * У фоновій функції стеля 15 хвилин, тож числа тут щедріші за колишні (5 с на
 * збір, 2,5 на джерело). Але дедлайн лишається: чужа стрічка, яка висить
 * хвилину, не має права затримати розсилку, а типовий збір і так укладається
 * у дві секунди.
 */
const COLLECT_DEADLINE_MS = 20_000;

/** Стеля на ОДНЕ джерело. Повільний не має права забрати з собою решту. */
const SOURCE_TIMEOUT_MS = 6_000;

/**
 * Стеля на відбір моделлю — ВЛАСНА, не рештка від дедлайну збору.
 *
 * СПІЙМАНО НА ПЕРШІЙ ЖЕ СПРАВЖНІЙ ВІДПРАВЦІ 02.09.2026. Раніше тут стояла
 * умова «викликати модель, лише якщо від дедлайну збору лишилось ≥2,5 с» —
 * правило з тих часів, коли функція була синхронною зі стелею в десять секунд.
 * Функція давно фонова й живе п'ятнадцять хвилин, а умова лишилась: збір того
 * разу забрав майже всі двадцять секунд (джерела пригальмували після кількох
 * прогонів поспіль), і підбірка МОВЧКИ поїхала без двох найкращих блоків —
 * «Варте уваги» й «Можна застосувати». У журналі AI за той запуск немає жодного
 * рядка, тобто модель не викликали взагалі.
 *
 * Урок ширший за цей баг: обмеження, успадковане від старої архітектури, не
 * зникає саме — воно тихо продовжує різати те, що різати вже не треба.
 */
const PICK_DEADLINE_MS = 60_000;

/**
 * Скільки стрічок тягнемо одночасно.
 *
 * Було вісім, як у stack-versions. Стало дванадцять, бо джерел тепер не десять,
 * а тридцять п'ять: релізи сусідів, двадцять одна стрічка й два широкі улови. Усі
 * запити — до різних доменів, тож це не шквал на чужий сервер, а рівно те
 * розпаралелювання, без якого збір не влазить у дедлайн.
 */
const CONCURRENCY = 20;

/** Реліз, старший за це, у підбірку не потрапляє. Доба + запас на збій крона. */
const FRESH_HOURS = 30;

/**
 * А для статей вікно МІСЯЦЬ, і це не недогляд, а замір.
 *
 * ЖИВИЙ ПРОГІН 02.09.2026, двічі. З вікном 30 годин із десяти блогів не
 * потрапив ЖОДЕН запис; з тижневим — три блоги з десяти. Пішов дивитись, чи це
 * не баг розбору дат, і виявилось, що ні: у react.dev найсвіжіший запис за
 * лютий, у web.dev — за травень, у Supabase — за 24 серпня. Вони просто пишуть
 * рідко, і це нормально для якісних джерел.
 *
 * ЧОМУ ШИРОКЕ ВІКНО НЕ ДАЄ ПОВТОРІВ. Те, що вже показували, відсіює пам'ять
 * (tosho.dev_news_seen), тож кожна стаття приїде рівно один раз за всю історію.
 * Для статей мірою новизни є саме дедуплікація, а не вік — на відміну від
 * релізів, де новина це власне поява версії, і там вікно лишається добовим.
 *
 * ЧИМ ПЛАТИМО: у блок може потрапити стаття тритижневої давнини. Але «можна
 * застосувати» — питання про придатність, а не про свіжість, і для блогу, який
 * пише чотири рази на рік, тримісячна стаття і є найновішим, що в нього є.
 */
const READING_FRESH_HOURS = 30 * 24;

/** Скільки історій HN беремо за прохід. Далі — лише довший промпт без користі. */
const HN_LIMIT = 12;

/** Скільки днів пам'ятаємо, що вже надсилали. */
const SEEN_RETENTION_DAYS = 60;

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

const kievDayKey = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, dateStyle: "short" }).format(now);

const kievDayLabel = (now: Date) =>
  new Intl.DateTimeFormat("uk-UA", { timeZone: TIME_ZONE, day: "numeric", month: "long" }).format(now);

/**
 * Чужий сервіс, який не відповів, не має права завалити підбірку.
 *
 * Тому кожен похід назовні повертає `null` замість того, щоб кинути: три
 * блоки складаються незалежно, і мовчання React-репозиторію не може забрати
 * рядок про наш власний стек.
 */
async function fetchText(url: string, signal: AbortSignal, timeoutMs = SOURCE_TIMEOUT_MS): Promise<string | null> {
  try {
    // ВЛАСНИЙ ТАЙМАУТ НА КОЖЕН ЗАПИТ, а не лише спільний дедлайн на весь збір.
    // Заміряно 02.09.2026: тридцять п'ять джерел зібрались за 9,1 с при стелі
    // функції в 10 — і винні були не всі, а кілька повільних (Reddit, стрічка
    // Vercel на півтори тисячі записів). Спільний дедлайн від цього не рятує:
    // він обриває ВСЕ разом, тобто через одного мовчуна втрачаються і ті, що
    // вже майже відповіли. Три секунди на джерело — і повільний випадає сам.
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      headers: { "User-Agent": "tosho-crm-dev-news" },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Обхід списку пачками — щоб не влаштовувати GitHub шквал із десяти з'єднань. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

// --- Блок «Стек» ------------------------------------------------------------

/**
 * Що з наших пакетів випередила npm.
 *
 * Дані вже лежать у базі — їх щоночі складає крон stack-versions. Тобто
 * підбірка не робить ЖОДНОГО нового запиту в реєстр: це та сама половина
 * правди, яку показує сторінка Dev → Стек.
 */
async function collectStack(admin: AdminClient): Promise<DevNewsItem[]> {
  const { data, error } = await admin
    .schema("tosho")
    .from("stack_versions")
    .select("name,latest_version");
  if (error) {
    console.error("stack_versions:", error.message);
    return [];
  }

  const latest = new Map(
    ((data ?? []) as Array<{ name: string; latest_version: string | null }>).map((row) => [
      row.name,
      row.latest_version,
    ])
  );

  return stackItems(
    STACK_SNAPSHOT.packages.map((pkg) => ({
      name: pkg.name,
      installed: pkg.version,
      latest: latest.get(pkg.name) ?? null,
    }))
  );
}

// --- Блок «Claude» ----------------------------------------------------------

async function collectClaude(now: Date, freshHours: number, signal: AbortSignal): Promise<DevNewsItem[]> {
  const [releases, notes] = await Promise.all([
    fetchText(atomUrl(CLAUDE_CODE_REPO), signal),
    fetchText(CLAUDE_PLATFORM_NOTES, signal),
  ]);

  const items: DevNewsItem[] = [];
  if (releases) {
    const item = claudeCodeItem(parseFeed(releases), now, freshHours);
    if (item) items.push(item);
  }
  if (notes) {
    const item = claudePlatformItem(parseClaudeNotes(notes));
    if (item) items.push(item);
  }
  return items;
}

// --- Блок «Варте уваги» -----------------------------------------------------

async function collectCandidates(now: Date, freshHours: number, signal: AbortSignal): Promise<WatchCandidate[]> {
  const feeds = await mapWithConcurrency(WATCH_REPOS, CONCURRENCY, async (source) => {
    const xml = await fetchText(atomUrl(source.repo), signal);
    if (!xml) return [];
    const entry = bestEntry(parseFeed(xml), now, freshHours);
    if (!entry) return [];
    return [
      {
        kind: "release" as const,
        label: source.label,
        title: cleanReleaseTitle(entry.title),
        url: entry.url,
        updated: entry.updated,
      },
    ];
  });
  return feeds.flat();
}

// --- Блок «Можна застосувати» -----------------------------------------------

/** Статті з блогів, які пишуть по суті. Одне джерело — один найсвіжіший запис. */
async function collectReading(now: Date, signal: AbortSignal): Promise<WatchCandidate[]> {
  const feeds = await mapWithConcurrency(READING_FEEDS, CONCURRENCY, async (source) => {
    const xml = await fetchText(source.url, signal);
    if (!xml) return [];
    return parseFeed(xml)
      .filter((entry) => isRecent(entry.updated, now, READING_FRESH_HOURS))
      .slice(0, 3)
      .map((entry) => ({
        kind: "reading" as const,
        label: source.label,
        title: entry.title,
        url: entry.url,
        updated: entry.updated,
        summary: entry.summary,
      }));
  });
  return feeds.flat();
}

/**
 * Широкий улов: Hacker News і свіжі репозиторії GitHub.
 *
 * ЧОМУ ЦЕ ТУТ, ПОПРИ ШУМ. Заміряно 02.09.2026: HN від 80 балів дає за добу
 * ~35 історій, з яких фронтендових одиниці, а GitHub — п'ять репозиторіїв,
 * здебільшого чужої тематики. Але саме в цьому шумі трапилось те, чого не було
 * в жодному кураторському блозі: `anti-slop` — правила oxlint проти слабкого
 * TypeScript, а ми якраз на oxlint. Один самородок на добу вартий того, щоб
 * модель прочитала два десятки заголовків: це третина копійки.
 */
async function collectWideNet(days: number, signal: AbortSignal): Promise<WatchCandidate[]> {
  const dayAgo = Math.floor(Date.now() / 1000) - days * 86_400;
  const since = new Date(Date.now() - GITHUB_FRESH_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [hn, gh] = await Promise.all([
    fetchText(
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=" +
        encodeURIComponent(`points>${HN_MIN_POINTS},created_at_i>${dayAgo}`),
      signal
    ),
    fetchText(
      "https://api.github.com/search/repositories?q=" +
        encodeURIComponent(`language:TypeScript created:>${since} stars:>${GITHUB_MIN_STARS}`) +
        "&sort=stars&order=desc&per_page=8",
      signal
    ),
  ]);

  const candidates: WatchCandidate[] = [];

  try {
    const payload = JSON.parse(hn ?? "{}") as {
      hits?: Array<{ title?: string; url?: string; objectID?: string; points?: number }>;
    };
    for (const hit of (payload.hits ?? []).slice(0, HN_LIMIT)) {
      if (!hit.title) continue;
      candidates.push({
        kind: "reading",
        label: "HN",
        title: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        updated: null,
        summary: hit.points ? `${hit.points} балів` : undefined,
      });
    }
  } catch {
    // Чужий JSON зламався — блок просто бідніший, решта підбірки ціла.
  }

  try {
    const payload = JSON.parse(gh ?? "{}") as {
      items?: Array<{ full_name?: string; html_url?: string; description?: string; stargazers_count?: number }>;
    };
    for (const repo of payload.items ?? []) {
      if (!repo.full_name || !repo.html_url) continue;
      candidates.push({
        kind: "reading",
        label: "GitHub",
        title: repo.full_name,
        url: repo.html_url,
        updated: null,
        summary: [repo.description, repo.stargazers_count ? `${repo.stargazers_count}★` : null]
          .filter(Boolean)
          .join(" · "),
      });
    }
  } catch {
    // Те саме.
  }

  return candidates;
}

type PickResult = { items: DevNewsItem[]; usage: { model: string; input: number; output: number } | null };

/**
 * Відбір моделлю — єдине місце в підбірці, де вона взагалі бере участь.
 *
 * Модель повертає НОМЕРИ кандидатів, а не текст: заголовок і посилання
 * підставляє applyPicks зі свого списку. Тому найгірше, що тут може статись, —
 * невдалий вибір, а не вигадане посилання чи перекручений номер версії.
 *
 * Не вийшло (немає ключа, бракує часу, зламана відповідь) — блок просто не
 * з'явиться. Дві інші третини підбірки від цього не залежать.
 */
async function pickWorthReading(
  candidates: WatchCandidate[],
  signal: AbortSignal
): Promise<PickResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || candidates.length === 0) return { items: [], usage: null };

  const model = (process.env.OPENAI_MODEL || "").trim() || "gpt-5.6-luna";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: buildPickPrompt(candidates) }],
        max_output_tokens: 1_800,
        text: {
          format: {
            type: "json_schema",
            name: "dev_news_picks",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["picks"],
              properties: {
                picks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["n", "why"],
                    properties: { n: { type: "integer" }, why: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      console.error("dev-news: модель відповіла", response.status);
      return { items: [], usage: null };
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const raw =
      payload.output_text ??
      payload.output?.flatMap((part) => part.content ?? []).map((part) => part.text ?? "").join("") ??
      "";
    // Обрізана відповідь — найпідступніший збій цього етапу: JSON не
    // розбереться, вибір стане порожнім, і підбірка мовчки втратить найкращий
    // блок, не сказавши ні слова. Спіймано 02.09.2026, коли довший промпт
    // штовхнув відповідь рівно в стелю max_output_tokens.
    if (!raw.trim().endsWith("}")) {
      console.error("dev-news: відповідь відбору обрізано — підніми max_output_tokens");
      return { items: [], usage: null };
    }
    const parsed = JSON.parse(raw) as { picks?: ModelPick[] };

    return {
      items: applyPicks(candidates, Array.isArray(parsed.picks) ? parsed.picks : []),
      usage: {
        model,
        input: payload.usage?.input_tokens ?? 0,
        output: payload.usage?.output_tokens ?? 0,
      },
    };
  } catch (error) {
    // Зіпсований JSON, обрив, дедлайн — усе це означає рівно «блоку не буде».
    console.error("dev-news: відбір не вдався:", error instanceof Error ? error.message : error);
    return { items: [], usage: null };
  }
}

// --- Розбір: прочитати статтю й пояснити, що вона дає ---------------------

/**
 * Кожен обраний пункт — прочитаний і переказаний людською мовою.
 *
 * НАВІЩО ЦЕ ПОНАД РЕЧЕННЯ-ВЕРДИКТ. Речення від відбору відповідає на «чи це
 * варте уваги». Але щоб вирішити, чи витрачати на статтю пів години, треба
 * знати, ПРО ЩО вона й що конкретно змінить у нас, — а цього із заголовка не
 * видно. Тому обрані чотири читаються насправді: сторінка → текст → модель
 * переказує суть, користь для НАШОЇ CRM і чесний вердикт.
 *
 * ОДИН ВИКЛИК НА ВСІ ЧОТИРИ, а не чотири виклики. Так дешевше й швидше, і
 * головне — модель бачить їх поруч і не повторює той самий висновок чотири
 * рази різними словами.
 *
 * Ціна: ~24 тис. вхідних токенів і ~800 вихідних на добу, тобто менше за цент.
 *
 * Не вдалось (пейволл, сторінка на JS, обрив) — пункт лишається з реченням від
 * відбору. Порожній розбір краще за переказ тексту, якого ми не бачили.
 */
async function explainPicks(
  items: DevNewsItem[],
  signal: AbortSignal
): Promise<Map<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  const targets = items.filter((item) => item.source === "apply").slice(0, EXPLAIN_LIMIT);
  if (!apiKey || targets.length === 0) return new Map();

  const texts = await mapWithConcurrency(targets, EXPLAIN_LIMIT, async (item) => {
    const html = await fetchText(readableSourceUrl(item.url), signal, ARTICLE_TIMEOUT_MS);
    return html ? extractArticleText(html) : "";
  });

  const readable = targets
    .map((item, i) => ({ item, text: texts[i] }))
    .filter((row) => row.text.length > 0);
  if (readable.length === 0) return new Map();

  const prompt = [
    "Нижче — статті, які ти щойно обрав для розробника CRM друкарні (React 19 з",
    "чотирма сторінками-гігантами й боротьбою за рендер, Vite на Rolldown,",
    "Supabase з RLS, Tailwind 4, oxlint, функції Netlify, бот у Telegram).",
    "",
    "Про КОЖНУ напиши три-чотири речення живою українською, ніби переказуєш",
    "колезі за кавою:",
    "  1) про що вона насправді — суть, а не заголовок;",
    "  2) що це дало б САМЕ в його CRM, якомога конкретніше;",
    "  3) чесний вердикт: варто читати цілком, глянути по діагоналі чи забити.",
    "",
    "Пиши просто. Без «у сучасному вебі», без «важливо зазначити», без переліку",
    "буллетів. Якщо стаття виявилась слабкою або не про те — так і скажи, це",
    "нормальна відповідь і вона цінніша за ввічливість.",
    "",
    ...readable.map((row, i) => `--- ${i + 1}. ${row.item.title}\n${row.text}`),
    "",
    'Відповідь — JSON: {"writeups":[{"n":<номер>,"text":"<три-чотири речення>"}]}',
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (process.env.OPENAI_MODEL || "").trim() || "gpt-5.6-luna",
        input: [{ role: "user", content: prompt }],
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema",
            name: "dev_news_writeups",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["writeups"],
              properties: {
                writeups: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["n", "text"],
                    properties: { n: { type: "integer" }, text: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!response.ok) return new Map();

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const raw =
      payload.output_text ??
      payload.output?.flatMap((part) => part.content ?? []).map((part) => part.text ?? "").join("") ??
      "";
    const parsed = JSON.parse(raw) as { writeups?: Array<{ n: number; text: string }> };

    const byKey = new Map<string, string>();
    for (const writeup of parsed.writeups ?? []) {
      const row = readable[Math.trunc(Number(writeup.n)) - 1];
      if (!row || typeof writeup.text !== "string") continue;
      byKey.set(row.item.key, writeup.text.replace(/\s+/g, " ").trim().slice(0, 700));
    }
    return byKey;
  } catch (error) {
    console.error("dev-news: розбір не вдався:", error instanceof Error ? error.message : error);
    return new Map();
  }
}

// --- Пам'ять про вже надіслане ----------------------------------------------

async function loadSeen(admin: AdminClient): Promise<Set<string>> {
  const { data, error } = await admin.schema("tosho").from("dev_news_seen").select("key");
  if (error) {
    // Не змогли прочитати пам'ять — краще промовчати, ніж надіслати вчорашнє
    // вдруге. Повторна підбірка дратує сильніше за пропущений день.
    throw new Error(`dev_news_seen: ${error.message}`);
  }
  return new Set(((data ?? []) as Array<{ key: string }>).map((row) => row.key));
}

async function rememberSeen(admin: AdminClient, items: DevNewsItem[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await admin
    .schema("tosho")
    .from("dev_news_seen")
    .upsert(items.map((item) => ({ key: item.key })), { onConflict: "key" });
  if (error) console.error("dev_news_seen upsert:", error.message);

  const cutoff = new Date(Date.now() - SEEN_RETENTION_DAYS * 86_400_000).toISOString();
  await admin.schema("tosho").from("dev_news_seen").delete().lt("first_seen_at", cutoff);
}

// --- Handler ----------------------------------------------------------------

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  // Той самий беззастережний гейт, що й у daily-digest: ?dry=1 віддає готовий
  // текст у тілі відповіді, тож забутий env-var не має перетворюватись на
  // відкритий ендпоінт.
  if (!process.env.CRON_SHARED_SECRET) {
    return jsonResponse(503, { error: "CRON_SHARED_SECRET is not configured" });
  }
  const denial = assertCronAuthorized(event);
  if (denial) return denial;

  const query = event.queryStringParameters ?? {};
  const dryRun = query.dry === "1" || query.dry === "true";

  /**
   * ?days=N — надолуження. Перший справжній запуск має підняти не одну добу, а
   * тиждень: інакше все, що вийшло, поки розсилки не існувало, просто
   * провалиться в минуле й ніколи не приїде. Далі щоденний крон ходить без
   * цього параметра, тобто з добовим вікном.
   *
   * Статей це не стосується — у них вікно й так місяць (див. READING_FRESH_HOURS).
   */
  const catchUpDays = Math.min(30, Math.max(0, Number(query.days) || 0));
  const freshHours = catchUpDays > 0 ? catchUpDays * 24 : FRESH_HOURS;
  const force = query.force === "1" || query.force === "true";

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const startedAt = Date.now();
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), COLLECT_DEADLINE_MS);

  try {
    const now = new Date();
    const todayKey = kievDayKey(now);

    const [stack, claude, releases, reading, wide, seen, members] = await Promise.all([
      collectStack(admin),
      collectClaude(now, freshHours, controller.signal),
      collectCandidates(now, freshHours, controller.signal),
      collectReading(now, controller.signal),
      collectWideNet(catchUpDays || 1, controller.signal),
      loadSeen(admin),
      loadMembers(admin),
    ]);
    const candidates = [...releases, ...reading, ...wide];

    // Відсіюємо вже надіслане ДО моделі: інакше вона щоранку обирала б із того
    // самого списку й витрачала токени на відбір, який ми потім викинемо.
    const freshCandidates = candidates.filter(
      (candidate) => !seen.has(`watch:${candidate.url}`) && !seen.has(`apply:${candidate.url}`)
    );
    // Свій годинник, не рештка від збору: збір міг забрати весь свій дедлайн,
    // але це не причина лишати підбірку без двох найкращих блоків.
    const pickController = new AbortController();
    const pickTimer = setTimeout(() => pickController.abort(), PICK_DEADLINE_MS);
    let picked: PickResult;
    try {
      picked = await pickWorthReading(freshCandidates, pickController.signal);
    } finally {
      clearTimeout(pickTimer);
    }
    if (freshCandidates.length > 0 && picked.items.length === 0) {
      // Порожній вибір при живих кандидатах буває чесним («сьогодні нічого
      // вартого»), але буває й збоєм — і зовні вони НЕРОЗРІЗНЕННІ. Тому слід
      // у логах лишаємо завжди.
      console.log(`dev-news: із ${freshCandidates.length} кандидатів не обрано жодного`);
    }

    const items = [...stack, ...claude, ...picked.items].filter((item) => !seen.has(item.key));

    // Читання статей — окремий годинник. Дедлайн збору вже міг спрацювати, а
    // цей етап найдовший і найцінніший: обривати його тим самим сигналом
    // означало б регулярно втрачати саме те, заради чого підбірку переробляли.
    const readController = new AbortController();
    const readTimer = setTimeout(() => readController.abort(), EXPLAIN_DEADLINE_MS);
    let explained = new Map<string, string>();
    try {
      explained = await explainPicks(items, readController.signal);
    } finally {
      clearTimeout(readTimer);
    }
    for (const item of items) {
      const writeup = explained.get(item.key);
      if (writeup) item.note = writeup;
    }

    const message = renderDevNews(items, kievDayLabel(now));

    if (picked.usage) {
      const cost = chatCostUsd(picked.usage.model, picked.usage.input, picked.usage.output);
      const workspaceId = members[0]?.workspaceId;
      if (workspaceId) {
        await logAiUsage(admin, {
          workspaceId,
          userId: null,
          actorName: "Підбірка для розробки",
          kind: "chat",
          model: picked.usage.model,
          inputTokens: picked.usage.input,
          outputTokens: picked.usage.output,
          costUsd: cost.costUsd,
          metadata: { feature: "dev_news", candidates: freshCandidates.length, picked: picked.items.length },
        });
      }
    }

    // Порожня підбірка — штатний вихід, а не помилка: сьогодні мовчимо.
    if (!message) {
      return jsonResponse(200, { success: true, skipped: "nothing-new", date: todayKey, candidates: candidates.length });
    }

    let recipients: MemberRow[] = members.filter((member) =>
      isCategoryVisibleForRole("dev_news", { accessRole: member.accessRole, jobRole: member.jobRole })
    );
    const only = (query.only ?? "").trim().toLowerCase();
    if (only) {
      // Як у daily-digest: фільтр застосовується ПІСЛЯ рольового гейта, тож він
      // може лише звузити коло, ніколи не розширити.
      recipients = recipients.filter((member) => (member.email ?? "").trim().toLowerCase() === only);
      if (recipients.length === 0) return jsonResponse(404, { error: `No recipient of dev_news matches ${only}` });
    }

    // Готовий текст завжди лягає в базу: фонова функція не віддає тіло, тож це
    // єдине місце, де підбірку можна побачити очима до того, як вона піде людям.
    await admin
      .schema("tosho")
      .from("dev_news_last")
      .upsert(
        { id: 1, body: message.text, items: message.items.length, dry: dryRun, built_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (dryRun) {
      return jsonResponse(200, {
        success: true,
        dryRun: true,
        date: todayKey,
        recipients: recipients.length,
        items: message.items.length,
        candidates: candidates.length,
        tookMs: Date.now() - startedAt,
        catchUpDays: catchUpDays || null,
        message: message.text,
      });
    }

    if (!force) {
      const claim = await admin
        .schema("tosho")
        .from("digest_log")
        .insert([{ kind: "dev_news", digest_date: todayKey, tone: "neutral" }]);
      if (claim.error) {
        const duplicate = claim.error.code === "23505" || /duplicate key/i.test(claim.error.message ?? "");
        if (duplicate) return jsonResponse(200, { success: true, skipped: "already-sent", date: todayKey });
        throw new Error(`digest_log: ${claim.error.message}`);
      }
    }

    const { delivered, failed, eligible } = await sendDigest(
      admin,
      recipients,
      "dev_news",
      message.text,
      message.keyboard
    );

    // Запам'ятовуємо лише те, що справді пішло. Якщо доставити не вдалось
    // нікому, пункти лишаються новими й приїдуть завтра — це навмисно.
    if (delivered > 0) await rememberSeen(admin, message.items);

    if (!force) {
      await admin
        .schema("tosho")
        .from("digest_log")
        .update({ recipients: eligible, delivered, failed })
        .eq("kind", "dev_news")
        .eq("digest_date", todayKey);
    }

    return jsonResponse(200, {
      success: true,
      date: todayKey,
      items: message.items.length,
      recipients: recipients.length,
      eligible,
      delivered,
      failed,
      tookMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse(500, { error: message });
  } finally {
    clearTimeout(abortTimer);
  }
};
