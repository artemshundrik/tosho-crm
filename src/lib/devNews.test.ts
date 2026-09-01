import { describe, expect, it } from "vitest";

import {
  applyPicks,
  bestEntry,
  classifyBump,
  packageFamily,
  cleanReleaseTitle,
  isPrerelease,
  claudeCodeItem,
  claudePlatformItem,
  decodeXmlText,
  dedupe,
  htmlToLines,
  isRecent,
  parseFeed,
  parseClaudeNotes,
  releaseNotesUrl,
  renderDevNews,
  stackItems,
  trimSentence,
  type WatchCandidate,
} from "@/lib/devNews";

/**
 * Підбірка для розробки (REQ-239).
 *
 * ЧОМУ ТЕСТИ САМЕ НА ЦЕ. Уся функція ходить у чужі сервіси, тож єдине, що
 * можна перевірити чесно й щоразу однаково, — перетворення над сталими
 * рядками. Два місця тут коштують дорого, якщо зламаються тихо:
 *
 *   1. РОЗБІР ЧУЖОГО XML. Зміниться формат — підбірка не впаде, вона просто
 *      стане порожньою й мовчатиме, а мовчання тут виглядає як «сьогодні
 *      нічого нового». Тому фікстури нижче — справжні шматки стрічки GitHub.
 *   2. ВІДБІР МОДЕЛЛЮ. Це єдине місце, де в підбірку потрапляє текст, якого
 *      ми не писали. Тести нижче перевіряють головне: вигадати посилання чи
 *      номер версії модель не може, бо їх беруть із кандидата за номером.
 */

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from claude-code</title>
  <entry>
    <id>tag:github.com,2008:Repository/1/v2.1.257</id>
    <updated>2026-09-01T17:53:52Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/anthropics/claude-code/releases/tag/v2.1.257"/>
    <title>v2.1.257</title>
    <content type="html">&lt;ul&gt;&lt;li&gt;Added &lt;code&gt;/rewind&lt;/code&gt; to restore a previous checkpoint. It works everywhere.&lt;/li&gt;&lt;li&gt;Fixed a crash in the file watcher&lt;/li&gt;&lt;/ul&gt;</content>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1/v2.1.252</id>
    <updated>2026-08-31T19:46:55Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/anthropics/claude-code/releases/tag/v2.1.252"/>
    <title>v2.1.252</title>
    <content type="html">&lt;ul&gt;&lt;li&gt;Tweaks&lt;/li&gt;&lt;/ul&gt;</content>
  </entry>
</feed>`;

const NOW = new Date("2026-09-01T20:00:00Z");

describe("розбір стрічки релізів", () => {
  it("дістає заголовок, адресу й дату кожного релізу", () => {
    const entries = parseFeed(ATOM);

    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("v2.1.257");
    expect(entries[0].url).toBe("https://github.com/anthropics/claude-code/releases/tag/v2.1.257");
    expect(entries[0].updated).toBe("2026-09-01T17:53:52Z");
  });

  it("розгортає тіло релізу в рядки без розмітки", () => {
    const entries = parseFeed(ATOM);

    expect(entries[0].body.split("\n")).toEqual([
      "• Added /rewind to restore a previous checkpoint. It works everywhere.",
      "• Fixed a crash in the file watcher",
    ]);
  });

  it("не з'їдає рівень екранування в подвійних сутностях", () => {
    // `&amp;lt;` — це текст «&lt;», а не «<». Прохід по амперсанду мусить бути
    // останнім, інакше розбір мовчки перетворює текст на розмітку.
    expect(decodeXmlText("&amp;lt;div&amp;gt;")).toBe("&lt;div&gt;");
    expect(decodeXmlText("&lt;div&gt;")).toBe("<div>");
  });

  it("порожню або чужу стрічку віддає порожнім списком, а не падає", () => {
    expect(parseFeed("")).toEqual([]);
    expect(parseFeed("<html><body>404</body></html>")).toEqual([]);
  });

  it("пункти списку стають рядками з маркером", () => {
    expect(htmlToLines("<ul><li>перше</li><li>друге</li></ul>")).toEqual(["• перше", "• друге"]);
  });
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Articles on Smashing Magazine</title>
    <item>
      <title><![CDATA[Rendering Tables Without Killing The Main Thread]]></title>
      <link>https://smashingmagazine.com/2026/09/tables/</link>
      <pubDate>Mon, 01 Sep 2026 11:00:00 GMT</pubDate>
      <description><![CDATA[A practical look at virtualising long tables. It goes deep on measurement.]]></description>
    </item>
  </channel>
</rss>`;

describe("розбір RSS — дванадцять із тринадцяти джерел саме такі", () => {
  it("бере заголовок із CDATA, посилання з тіла тега й дату з pubDate", () => {
    const entries = parseFeed(RSS);

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Rendering Tables Without Killing The Main Thread");
    expect(entries[0].url).toBe("https://smashingmagazine.com/2026/09/tables/");
    expect(entries[0].updated).toBe("Mon, 01 Sep 2026 11:00:00 GMT");
  });

  it("опис зі стрічки доїжджає — саме його читає модель при відборі", () => {
    expect(parseFeed(RSS)[0].summary).toBe("A practical look at virtualising long tables.");
  });

  it("дату у форматі RSS вікно свіжості розуміє нарівні з ISO", () => {
    expect(isRecent(parseFeed(RSS)[0].updated, new Date("2026-09-01T20:00:00Z"), 30)).toBe(true);
  });
});

describe("що НЕ пускаємо в підбірку (знайдено живим прогоном 01.09.2026)", () => {
  const entries = [
    { title: "v2.113.0-canary.0", url: "https://e/1", updated: "2026-09-01T13:36:13Z", body: "" },
    { title: "oxlint_v1.81.0: release(apps): oxlint v1.81.0 && oxfmt v0.66.0 (#26199)", url: "https://e/2", updated: "2026-09-01T08:25:16Z", body: "" },
    { title: "oxfmt_v0.66.0: release(apps): oxlint v1.81.0 && oxfmt v0.66.0 (#26199)", url: "https://e/3", updated: "2026-09-01T08:27:31Z", body: "" },
  ];

  it("канарки, беточки й нічні збірки — не новини", () => {
    expect(isPrerelease("v2.113.0-canary.0")).toBe(true);
    expect(isPrerelease("v1.0.0-rc.2")).toBe(true);
    expect(isPrerelease("v8.2.2")).toBe(false);
    // «next» як частина назви, а не як мітка передрелізу, лишається новиною.
    expect(isPrerelease("next-auth v5")).toBe(false);
  });

  it("з монорепозиторію бере ОДИН запис, найсвіжіший і не передрелізний", () => {
    const best = bestEntry(entries, NOW, 30);

    expect(best?.url).toBe("https://e/3");
  });

  it("ріже хвіст комітного повідомлення, але не втрачає осмислений підзаголовок", () => {
    expect(cleanReleaseTitle("oxlint_v1.81.0: release(apps): oxlint v1.81.0 && oxfmt (#26199)")).toBe("oxlint_v1.81.0");
    expect(cleanReleaseTitle("v8.2.2")).toBe("v8.2.2");
    expect(cleanReleaseTitle("create-vite@9.2.0")).toBe("create-vite@9.2.0");
    // Ліворуч від двокрапки є пробіл — це не мітка версії, а текст. Не ріжемо.
    expect(cleanReleaseTitle("React 19.3: Server Components stable")).toBe("React 19.3: Server Components stable");
  });

  it("порожньо, коли все свіже виявилось передрелізами", () => {
    expect(bestEntry([entries[0]], NOW, 30)).toBeNull();
  });
});

describe("вікно свіжості", () => {
  it("рахує години від зазначеного моменту", () => {
    expect(isRecent("2026-09-01T17:53:52Z", NOW, 24)).toBe(true);
    expect(isRecent("2026-08-28T17:53:52Z", NOW, 24)).toBe(false);
  });

  it("без дати або зі сміттям замість дати — не свіже", () => {
    expect(isRecent(null, NOW, 24)).toBe(false);
    expect(isRecent("позавчора", NOW, 24)).toBe(false);
  });
});

describe("блок Claude", () => {
  it("згортає кілька релізів Claude Code в один пункт із найновішим", () => {
    const item = claudeCodeItem(parseFeed(ATOM), NOW, 48);

    expect(item?.title).toBe("Claude Code v2.1.257");
    expect(item?.url).toContain("/releases/tag/v2.1.257");
    // Два перші пункти релізу, кожен обрізаний до речення.
    expect(item?.note).toBe("Added /rewind to restore a previous checkpoint.\nFixed a crash in the file watcher");
  });

  it("мовчить, коли за добу релізів не було", () => {
    expect(claudeCodeItem(parseFeed(ATOM), new Date("2026-09-20T00:00:00Z"), 24)).toBeNull();
  });

  it("ключ не містить дати — той самий реліз двічі не пройде", () => {
    const first = claudeCodeItem(parseFeed(ATOM), NOW, 48);
    const later = claudeCodeItem(parseFeed(ATOM), new Date("2026-09-02T09:00:00Z"), 48);

    expect(first?.key).toBe(later?.key);
  });

  it("бере найсвіжішу дату платформних нотаток з обома видами маркерів", () => {
    const section = parseClaudeNotes(
      [
        "# Release notes",
        "",
        "### September 1, 2026",
        "",
        "* Ми запустили [Claude Fable 5.1](https://example.com/fable) — наступник **Fable 5**.",
        "- Ціни на кеш знижено.",
        "",
        "### August 27, 2026",
        "",
        "* Старе, сюди не потрапляє.",
      ].join("\n")
    );

    expect(section?.date).toBe("September 1, 2026");
    expect(section?.bullets).toEqual([
      "Ми запустили Claude Fable 5.1 — наступник Fable 5.",
      "Ціни на кеш знижено.",
    ]);
  });

  it("нотатки без жодного пункту не стають пунктом підбірки", () => {
    expect(claudePlatformItem(parseClaudeNotes("### September 1, 2026\n\nсуцільний текст"))).toBeNull();
    expect(claudePlatformItem(null)).toBeNull();
  });
});

describe("блок «Стек»", () => {
  it("бере лише ті пакети, де npm випередив встановлену версію", () => {
    const items = stackItems([
      { name: "vite", installed: "8.1.0", latest: "8.2.0" },
      { name: "zod", installed: "4.0.1", latest: "4.0.1" },
      { name: "sharp", installed: "0.35.0", latest: null },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("vite 8.1.0 → 8.2.0");
    expect(items[0].key).toBe("stack:vite@8.2.0");
  });

  it("патчі не показує — це список справ, а не новина", () => {
    // Справжній результат прогону 02.09.2026 без цього фільтра: чотири рядки
    // @tiptap/* 3.30.2 → 3.30.6 і жодного слова про те, що змінилось.
    expect(stackItems([{ name: "vitest", installed: "4.1.11", latest: "4.1.12" }])).toEqual([]);
    expect(classifyBump("4.1.11", "4.1.12")).toBe("patch");
    expect(classifyBump("8.1.0", "8.2.0")).toBe("minor");
    expect(classifyBump("3.6.0", "4.4.0")).toBe("major");
  });

  it("родину скоупних пакетів згортає в один рядок", () => {
    const items = stackItems([
      { name: "@tiptap/react", installed: "3.30.2", latest: "3.31.0" },
      { name: "@tiptap/pm", installed: "3.30.2", latest: "3.31.0" },
      { name: "@tiptap/extension-link", installed: "3.30.2", latest: "3.31.0" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("@tiptap/* 3.30.2 → 3.31.0 · 3 пакети");
    expect(packageFamily("@tiptap/react")).toBe("@tiptap");
    expect(packageFamily("vite")).toBe("vite");
  });

  it("мажор підписує як такий, що може зламати", () => {
    const items = stackItems([{ name: "date-fns", installed: "3.6.0", latest: "4.4.0" }]);

    expect(items[0].note).toBe("мажор — може зламати");
  });

  it("веде на репозиторій, коли його знаємо, і на npm, коли ні", () => {
    expect(releaseNotesUrl("vite")).toBe("https://github.com/vitejs/vite/releases");
    expect(releaseNotesUrl("якийсь-пакет")).toContain("npmjs.com/package/якийсь-пакет");
  });
});

describe("відбір моделлю", () => {
  const candidates: WatchCandidate[] = [
    { kind: "release", label: "React", title: "v19.3.0", url: "https://github.com/facebook/react/releases/tag/v19.3.0", updated: null },
    { kind: "release", label: "Vite", title: "v8.2.0", url: "https://github.com/vitejs/vite/releases/tag/v8.2.0", updated: null },
  ];

  it("бере заголовок і адресу з кандидата, а не з відповіді моделі", () => {
    const items = applyPicks(candidates, [{ n: 2, why: "збірка стала швидшою" }]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Vite — v8.2.0");
    expect(items[0].url).toBe("https://github.com/vitejs/vite/releases/tag/v8.2.0");
    expect(items[0].note).toBe("збірка стала швидшою");
  });

  it("відкидає номери поза списком, повтори й сміття замість номера", () => {
    const items = applyPicks(candidates, [
      { n: 99 },
      { n: 0 },
      { n: 1 },
      { n: 1 },
      { n: Number.NaN },
      { n: "2" as unknown as number },
    ]);

    expect(items.map((i) => i.title)).toEqual(["React — v19.3.0", "Vite — v8.2.0"]);
  });

  it("тримає стелю окремо на релізи й окремо на читво", () => {
    const many: WatchCandidate[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: "release" as const, label: `Пакет ${i}`, title: `v${i}`, url: `https://example.com/r${i}`, updated: null,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        kind: "reading" as const, label: `Блог ${i}`, title: `Стаття ${i}`, url: `https://example.com/a${i}`, updated: null,
      })),
    ];

    const items = applyPicks(many, many.map((_, i) => ({ n: i + 1 })));

    expect(items.filter((i) => i.source === "watch")).toHaveLength(3);
    expect(items.filter((i) => i.source === "apply")).toHaveLength(4);
  });

  it("блок вирішує ґатунок кандидата, а не думка моделі", () => {
    // Модель не має жодного способу сказати «поклади це в інший блок»: вона
    // повертає лише номер, а ґатунок приїхав із джерела.
    const mixed: WatchCandidate[] = [
      { kind: "reading", label: "web.dev", title: "Нова техніка", url: "https://web.dev/x", updated: null },
    ];

    const items = applyPicks(mixed, [{ n: 1, why: "спробувати в картці прорахунку" }]);

    expect(items[0].source).toBe("apply");
    expect(items[0].key).toBe("apply:https://web.dev/x");
  });

  it("порожній вибір — нормальна відповідь, а не помилка", () => {
    expect(applyPicks(candidates, [])).toEqual([]);
  });
});

describe("складання повідомлення", () => {
  it("порожня підбірка не перетворюється на повідомлення", () => {
    expect(renderDevNews([], "1 вересня")).toBeNull();
  });

  it("розкладає пункти по блоках у сталому порядку", () => {
    const message = renderDevNews(
      [
        { source: "watch", key: "w1", title: "React — v19.3.0", url: "https://example.com/react" },
        { source: "stack", key: "s1", title: "vite 8.1.0 → 8.2.0", url: "https://example.com/vite" },
        { source: "claude", key: "c1", title: "Claude Code v2.1.257", url: "https://example.com/cc" },
      ],
      "1 вересня"
    );

    const blocks = message!.text.split("\n").filter((line) => line.startsWith("<b>"));
    expect(blocks).toEqual([
      "<b>Підбірка для розробки — 1 вересня</b>",
      "<b>📦 Наш стек</b>",
      "<b>🤖 Claude</b>",
      "<b>🌐 Варте уваги</b>",
    ]);
  });

  it("екранує кутові дужки в заголовку, щоб Telegram не відкинув повідомлення", () => {
    const message = renderDevNews(
      [{ source: "stack", key: "s1", title: "<script> 1 → 2", url: "https://example.com/?a=1&b=2" }],
      "1 вересня"
    );

    expect(message!.text).toContain("&lt;script&gt; 1 → 2");
    expect(message!.text).toContain("https://example.com/?a=1&amp;b=2");
  });

  it("першого ранку блок «Стек» не перетворюється на стіну", () => {
    // Пам'ять порожня рівно один раз, і того дня «новим» стає весь накопичений
    // відрив. У тексті лишається вісім рядків плюс підсумок, а в items —
    // УСІ дванадцять, щоб решта не приїхала хвостом наступними днями.
    const many = Array.from({ length: 12 }, (_, i) => ({
      source: "stack" as const,
      key: `stack:пакет-${i}`,
      title: `пакет-${i} 1.0.0 → 2.0.0`,
      url: `https://example.com/${i}`,
    }));

    const message = renderDevNews(many, "1 вересня")!;
    const bullets = message.text.split("\n").filter((line) => line.startsWith("• "));

    expect(bullets).toHaveLength(9);
    expect(bullets[8]).toContain("…і ще 4");
    expect(message.items).toHaveLength(12);
  });

  it("той самий ключ двічі показується один раз", () => {
    const items = dedupe([
      { source: "stack" as const, key: "stack:vite@8.2.0", title: "перший", url: "https://example.com/1" },
      { source: "stack" as const, key: "stack:vite@8.2.0", title: "другий", url: "https://example.com/2" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("перший");
  });
});

describe("обрізання тексту", () => {
  it("бере перше речення", () => {
    expect(trimSentence("Перше речення. Друге речення.", 200)).toBe("Перше речення.");
  });

  it("довге речення ріже по слову, а не посеред нього", () => {
    const out = trimSentence("а".repeat(20) + " " + "б".repeat(20) + " " + "в".repeat(20), 30);

    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out).not.toContain("аб");
  });
});
