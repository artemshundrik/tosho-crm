import { describe, it } from "vitest";
import {
  applyPicks, atomUrl, buildPickPrompt, claudeCodeItem, claudePlatformItem, bestEntry, cleanReleaseTitle,
  parseFeed, parseClaudeNotes, renderDevNews, stackItems, isRecent,
  CLAUDE_CODE_REPO, CLAUDE_PLATFORM_NOTES, WATCH_REPOS, READING_FEEDS, HN_MIN_POINTS, GITHUB_MIN_STARS, GITHUB_FRESH_DAYS,
  type DevNewsItem, type WatchCandidate,
} from "@/lib/devNews";
import { STACK_SNAPSHOT } from "@/data/stackSnapshot.generated";

const get = async (url: string) => {
  try { const r = await fetch(url, { headers: { "User-Agent": "tosho-crm-dev-news" } }); return r.ok ? await r.text() : null; }
  catch { return null; }
};

/**
 * Живий прогін підбірки — по справжніх стрічках, а не по фікстурах.
 *
 * ЗА ЗАМОВЧУВАННЯМ ПРОПУСКАЄТЬСЯ, і це принципово: він ходить у GitHub і
 * docs.claude.com, тобто в наборі перед пушем був би джерелом випадкових
 * падінь через чужу мережу. Пуш, зупинений тим, що GitHub моргнув, коштує
 * дорожче за все, що цей тест ловить.
 *
 * АЛЕ ЛОВИТЬ ВІН ГОЛОВНЕ. 01.09.2026 саме він показав те, чого фікстури
 * показати не могли: у кандидати лізли канарки supabase-js, монорепозиторій
 * oxc давав три рядки про одну подію, а в заголовках висіли хвости комітних
 * повідомлень. Тести на сталих рядках усе це проходили.
 *
 * Запуск, коли міняєш розбір або додаєш джерело:
 *   DEV_NEWS_LIVE=1 npx vitest run src/lib/devNewsLive.test.ts --disable-console-intercept --reporter=verbose
 */
describe("живий прогін", () => {
  it.skipIf(!process.env.DEV_NEWS_LIVE)("збирає підбірку зі справжніх джерел", async () => {
    const now = new Date();
    const H = 30;

    const [cc, notes] = await Promise.all([get(atomUrl(CLAUDE_CODE_REPO)), get(CLAUDE_PLATFORM_NOTES)]);
    const claude: DevNewsItem[] = [];
    if (cc) { const i = claudeCodeItem(parseFeed(cc), now, H); if (i) claude.push(i); }
    if (notes) { const i = claudePlatformItem(parseClaudeNotes(notes)); if (i) claude.push(i); }

    const feeds = await Promise.all(WATCH_REPOS.map(async (s) => {
      const xml = await get(atomUrl(s.repo));
      if (!xml) return [] as WatchCandidate[];
      const e = bestEntry(parseFeed(xml), now, H);
      return e ? [{ kind: "release" as const, label: s.label, title: cleanReleaseTitle(e.title), url: e.url, updated: e.updated }] : [];
    }));

    const reading = await Promise.all(READING_FEEDS.map(async (src) => {
      const xml = await get(src.url);
      if (!xml) { console.log("  ✖ мовчить:", src.label); return [] as WatchCandidate[]; }
      const items = parseFeed(xml).filter((e) => isRecent(e.updated, now, 30 * 24)).slice(0, 3);
      console.log(`  ${src.label}: ${parseFeed(xml).length} записів, свіжих ${items.length}`);
      return items.map((e) => ({ kind: "reading" as const, label: src.label, title: e.title, url: e.url, updated: e.updated, summary: e.summary }));
    }));

    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    const since = new Date(Date.now() - GITHUB_FRESH_DAYS * 86400000).toISOString().slice(0, 10);
    const hnRaw = await get(`https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=${encodeURIComponent(`points>${HN_MIN_POINTS},created_at_i>${dayAgo}`)}`);
    const ghRaw = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(`language:TypeScript created:>${since} stars:>${GITHUB_MIN_STARS}`)}&sort=stars&order=desc&per_page=8`);
    const wide: WatchCandidate[] = [];
    for (const h of (JSON.parse(hnRaw ?? "{}").hits ?? []).slice(0, 12)) if (h.title) wide.push({ kind: "reading", label: "HN", title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, updated: null, summary: h.points ? `${h.points} балів` : undefined });
    for (const r of (JSON.parse(ghRaw ?? "{}").items ?? [])) if (r.full_name) wide.push({ kind: "reading", label: "GitHub", title: r.full_name, url: r.html_url, updated: null, summary: [r.description, r.stargazers_count ? `${r.stargazers_count}★` : null].filter(Boolean).join(" · ") });

    const candidates = [...feeds.flat(), ...reading.flat(), ...wide];

    // Стек: симулюємо відповідь бази — нехай три пакети відстали.
    const stack = stackItems([
      { name: "vite", installed: STACK_SNAPSHOT.packages.find((p) => p.name === "vite")?.version ?? "8.0.0", latest: "8.9.9" },
      { name: "zod", installed: "4.0.0", latest: "4.0.0" },
      { name: "@supabase/supabase-js", installed: "2.112.0", latest: "2.115.0" },
    ]);

    // Відбір без моделі: беремо перші три як «нібито обрані».
    const picked = applyPicks(candidates, candidates.slice(0, 3).map((_, i) => ({ n: i + 1, why: "перевірка" })));

    console.log("\n=== КАНДИДАТИ (" + candidates.length + ") ===");
    for (const c of candidates) console.log(`  [${c.label}] ${c.title.slice(0, 70)}${c.summary ? " — " + c.summary.slice(0, 50) : ""}`);
    console.log("\n=== ПРОМПТ: " + buildPickPrompt(candidates).length + " символів ===");

    const msg = renderDevNews([...stack, ...claude, ...picked], "1 вересня");
    console.log("\n=== ПОВІДОМЛЕННЯ ===\n" + (msg?.text ?? "(порожньо — нічого не шлемо)"));
    console.log("\n=== довжина: " + (msg?.text.length ?? 0) + " символів, пунктів: " + (msg?.items.length ?? 0) + " ===");
  }, 90_000);
});
