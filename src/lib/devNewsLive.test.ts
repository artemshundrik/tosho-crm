import { describe, it } from "vitest";
import {
  applyPicks, atomUrl, buildPickPrompt, claudeCodeItem, claudePlatformItem, bestEntry, cleanReleaseTitle,
  parseAtomFeed, parseClaudeNotes, renderDevNews, stackItems,
  CLAUDE_CODE_REPO, CLAUDE_PLATFORM_NOTES, WATCH_REPOS,
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
    if (cc) { const i = claudeCodeItem(parseAtomFeed(cc), now, H); if (i) claude.push(i); }
    if (notes) { const i = claudePlatformItem(parseClaudeNotes(notes)); if (i) claude.push(i); }

    const feeds = await Promise.all(WATCH_REPOS.map(async (s) => {
      const xml = await get(atomUrl(s.repo));
      if (!xml) return [] as WatchCandidate[];
      const e = bestEntry(parseAtomFeed(xml), now, H);
      return e ? [{ label: s.label, title: cleanReleaseTitle(e.title), url: e.url, updated: e.updated }] : [];
    }));
    const candidates = feeds.flat();

    // Стек: симулюємо відповідь бази — нехай три пакети відстали.
    const stack = stackItems([
      { name: "vite", installed: STACK_SNAPSHOT.packages.find((p) => p.name === "vite")?.version ?? "8.0.0", latest: "8.9.9" },
      { name: "zod", installed: "4.0.0", latest: "4.0.0" },
      { name: "@supabase/supabase-js", installed: "2.112.0", latest: "2.115.0" },
    ]);

    // Відбір без моделі: беремо перші три як «нібито обрані».
    const picked = applyPicks(candidates, candidates.slice(0, 3).map((_, i) => ({ n: i + 1, why: "перевірка" })));

    console.log("\n=== КАНДИДАТИ (" + candidates.length + ") ===");
    for (const c of candidates) console.log(`  [${c.label}] ${c.title}  ${c.updated}`);
    console.log("\n=== ПРОМПТ (перші 400) ===\n" + buildPickPrompt(candidates, ["react", "vite"]).slice(0, 400));

    const msg = renderDevNews([...stack, ...claude, ...picked], "1 вересня");
    console.log("\n=== ПОВІДОМЛЕННЯ ===\n" + (msg?.text ?? "(порожньо — нічого не шлемо)"));
    console.log("\n=== довжина: " + (msg?.text.length ?? 0) + " символів, пунктів: " + (msg?.items.length ?? 0) + " ===");
  }, 90_000);
});
