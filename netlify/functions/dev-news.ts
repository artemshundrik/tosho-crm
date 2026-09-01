import { createClient } from "@supabase/supabase-js";

import { assertCronAuthorized } from "./_cronAuth";
import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { isCategoryVisibleForRole } from "./_notificationCategories";
import { loadMembers, sendDigest, type AdminClient, type MemberRow } from "./_lib/digestDelivery";
import { STACK_SNAPSHOT } from "../../src/data/stackSnapshot.generated";
import {
  applyPicks,
  atomUrl,
  buildPickPrompt,
  claudeCodeItem,
  claudePlatformItem,
  bestEntry,
  cleanReleaseTitle,
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
// ЧОМУ СИНХРОННА, А НЕ ФОНОВА. Фонова віддає 202 і викидає тіло відповіді —
// тобто ?dry=1 не показав би нічого, а саме він тут головний інструмент: підбірку
// треба вміти подивитись очима, перш ніж вона піде живій людині. Ціна рішення —
// десятисекундна стеля, і нижче з нею живуть тим самим способом, що й
// stack-versions: дедлайн на збір, після якого шлемо те, що встигли.
//
// РОЗКЛАД ТУТ НЕ ОГОЛОШУЄТЬСЯ. Планувальник Netlify у нас мертвий, усі крони
// запускає pg_cron із самої бази — розклад лежить у scripts/dev-news-cron.sql.

const TIME_ZONE = "Europe/Kiev";

/**
 * Дедлайн на збір. Синхронна функція Netlify живе 10 секунд, і впертись у цю
 * межу означало б не надіслати НІЧОГО. Тому на сьомій секунді припиняємо
 * питати й складаємо повідомлення з того, що вже маємо: підбірка без блоку
 * «варте уваги» — це трохи бідніша підбірка, а не зламана.
 */
const COLLECT_DEADLINE_MS = 7_000;

/** Скільки часу лишити моделі. Менше — не викликаємо її взагалі. */
const MODEL_BUDGET_MS = 3_000;

/**
 * Скільки стрічок тягнемо одночасно.
 *
 * Було вісім, як у stack-versions. Стало дванадцять, бо джерел тепер не десять,
 * а двадцять п'ять: релізи сусідів, десять блогів і два широкі улови. Усі
 * запити — до різних доменів, тож це не шквал на чужий сервер, а рівно те
 * розпаралелювання, без якого збір не влазить у дедлайн.
 */
const CONCURRENCY = 12;

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
async function fetchText(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { signal, headers: { "User-Agent": "tosho-crm-dev-news" } });
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

async function collectClaude(now: Date, signal: AbortSignal): Promise<DevNewsItem[]> {
  const [releases, notes] = await Promise.all([
    fetchText(atomUrl(CLAUDE_CODE_REPO), signal),
    fetchText(CLAUDE_PLATFORM_NOTES, signal),
  ]);

  const items: DevNewsItem[] = [];
  if (releases) {
    const item = claudeCodeItem(parseFeed(releases), now, FRESH_HOURS);
    if (item) items.push(item);
  }
  if (notes) {
    const item = claudePlatformItem(parseClaudeNotes(notes));
    if (item) items.push(item);
  }
  return items;
}

// --- Блок «Варте уваги» -----------------------------------------------------

async function collectCandidates(now: Date, signal: AbortSignal): Promise<WatchCandidate[]> {
  const feeds = await mapWithConcurrency(WATCH_REPOS, CONCURRENCY, async (source) => {
    const xml = await fetchText(atomUrl(source.repo), signal);
    if (!xml) return [];
    const entry = bestEntry(parseFeed(xml), now, FRESH_HOURS);
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
async function collectWideNet(signal: AbortSignal): Promise<WatchCandidate[]> {
  const dayAgo = Math.floor(Date.now() / 1000) - 86_400;
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
  msLeft: number,
  signal: AbortSignal
): Promise<PickResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || candidates.length === 0 || msLeft < MODEL_BUDGET_MS) return { items: [], usage: null };

  const model = (process.env.OPENAI_MODEL || "").trim() || "gpt-5.6-luna";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: buildPickPrompt(candidates) }],
        max_output_tokens: 900,
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
      collectClaude(now, controller.signal),
      collectCandidates(now, controller.signal),
      collectReading(now, controller.signal),
      collectWideNet(controller.signal),
      loadSeen(admin),
      loadMembers(admin),
    ]);
    const candidates = [...releases, ...reading, ...wide];

    // Відсіюємо вже надіслане ДО моделі: інакше вона щоранку обирала б із того
    // самого списку й витрачала токени на відбір, який ми потім викинемо.
    const freshCandidates = candidates.filter(
      (candidate) => !seen.has(`watch:${candidate.url}`) && !seen.has(`apply:${candidate.url}`)
    );
    const picked = await pickWorthReading(
      freshCandidates,
      COLLECT_DEADLINE_MS - (Date.now() - startedAt),
      controller.signal
    );

    const items = [...stack, ...claude, ...picked.items].filter((item) => !seen.has(item.key));
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

    if (dryRun) {
      return jsonResponse(200, {
        success: true,
        dryRun: true,
        date: todayKey,
        recipients: recipients.length,
        items: message.items.length,
        candidates: candidates.length,
        tookMs: Date.now() - startedAt,
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
