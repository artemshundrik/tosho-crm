/**
 * Ранкова підбірка для розробки (REQ-239): що з'явилось нового у стеку, у
 * Claude і у світі навколо.
 *
 * ЩО ТУТ ЛЕЖИТЬ, А ЧОГО НЕМАЄ. Тут — самі перетворення: розбір стрічок, ключі
 * дедуплікації, відбір, складання повідомлення. Мережа, база й модель живуть у
 * netlify/functions/dev-news.ts. Поділ не косметичний: розбір чужого
 * XML і правила «що вважати новим» — це рівно те, що ламається мовчки, і
 * перевірити його можна лише тестами на сталих рядках, без походу в інтернет.
 *
 * ТРИ БЛОКИ — ТРИ РІЗНІ СПОСОБИ ЗДОБУТТЯ, і це навмисно:
 *
 *   «Стек»       — з tosho.stack_versions, яку щоночі наповнює крон
 *                  stack-versions. Жодного нового запиту в npm.
 *   «Claude»     — з releases.atom і платформних нотаток. Детерміновано:
 *                  що написали, те й показуємо.
 *   «Варте уваги» — єдине місце, де працює модель, і працює вона ВІДБОРОМ:
 *                  бачить готовий список кандидатів і повертає номери. Написати
 *                  свій заголовок чи посилання вона не може — див. applyPicks.
 *
 * ГОЛОВНЕ ПРАВИЛО: порожня підбірка не шлеться взагалі. Розсилка, яка щодня
 * каже «сьогодні порожньо», за тиждень перестає читатись — а разом із нею
 * перестають читатись і ті дні, коли їй було що сказати.
 */

/** Звідки прийшов пункт. Визначає блок у повідомленні й префікс ключа. */
export type DevNewsSource = "stack" | "claude" | "watch" | "apply";

export type DevNewsItem = {
  source: DevNewsSource;
  /**
   * Ключ дедуплікації. Стабільний між запусками й НЕ містить дати: те саме
   * оновлення, побачене двічі, має дати той самий ключ, інакше підбірка
   * повторюватиметься щоранку.
   */
  key: string;
  title: string;
  url: string;
  /** Рядок під заголовком: чим це для нас цікаво. Порожній — рядка немає. */
  note?: string;
  publishedAt?: string | null;
};

// ─────────────────────────── реєстр джерел ───────────────────────────

/**
 * Пакети, для яких ми знаємо репозиторій, — щоб у блоці «Стек» вести на
 * справжні нотатки релізу, а не на картку npm.
 *
 * ЧОМУ СПИСОК, А НЕ ЗАПИТ У NPM. Адресу репозиторію знає packument, але це
 * зайвий похід у чужий реєстр на кожен пакет заради посилання. Тут перелічені
 * ті, чиї оновлення справді читають; для решти є чесний запасний шлях на
 * сторінку версій у npm (див. releaseNotesUrl).
 */
export const PACKAGE_REPOS: Record<string, string> = {
  react: "facebook/react",
  "react-dom": "facebook/react",
  "react-router-dom": "remix-run/react-router",
  vite: "vitejs/vite",
  typescript: "microsoft/TypeScript",
  tailwindcss: "tailwindlabs/tailwindcss",
  "@supabase/supabase-js": "supabase/supabase-js",
  "@tanstack/react-query": "TanStack/query",
  "@tanstack/react-virtual": "TanStack/virtual",
  vitest: "vitest-dev/vitest",
  oxlint: "oxc-project/oxc",
  zod: "colinhacks/zod",
  "lucide-react": "lucide-icons/lucide",
  "react-day-picker": "gpbl/react-day-picker",
  "@playwright/test": "microsoft/playwright",
  sharp: "lovell/sharp",
  "pdfjs-dist": "mozilla/pdf.js",
};

/**
 * Сусіди по стеку, за якими стежимо, хоч і не тримаємо в залежностях.
 *
 * ЧОМУ БІЛИЙ СПИСОК, А НЕ ПОШУК. Це половина відповіді на «щоб не перетворитись
 * на смітник»: сюди потрапляє лише те, чим ми справді могли б скористатись.
 * Другу половину робить модель у блоці «Варте уваги», і саме тому їй дістається
 * вже відфільтрований список, а не весь інтернет.
 */
export const WATCH_REPOS: Array<{ repo: string; label: string }> = [
  { repo: "facebook/react", label: "React" },
  { repo: "vitejs/vite", label: "Vite" },
  { repo: "microsoft/TypeScript", label: "TypeScript" },
  { repo: "supabase/supabase-js", label: "Supabase JS" },
  { repo: "TanStack/query", label: "TanStack Query" },
  { repo: "tailwindlabs/tailwindcss", label: "Tailwind" },
  { repo: "shadcn-ui/ui", label: "shadcn/ui" },
  { repo: "oxc-project/oxc", label: "oxc" },
  { repo: "vitest-dev/vitest", label: "Vitest" },
  { repo: "nodejs/node", label: "Node" },
];

/**
 * Блоги, які пишуть по суті. Одне джерело — окремі статті, а не дайджест.
 *
 * ЧОМУ ТУТ НЕМАЄ РОЗСИЛОК (Frontend Focus, JavaScript Weekly, React Status).
 * Перевірено 02.09.2026: усі три віддають ОДИН запис на тиждень — цілий випуск
 * листа, з тілом у вигляді HTML-таблиць і заголовком-заманухою («The asteroid
 * hitting frontend development»). Це обкладинка журналу, а не техніка, яку
 * можна застосувати в понеділок, і на питання «чи міг би він це зробити
 * цього тижня» вона не відповідає ніколи.
 */
export const READING_FEEDS: Array<{ url: string; label: string }> = [
  { url: "https://web.dev/static/blog/feed.xml", label: "web.dev" },
  { url: "https://developer.chrome.com/static/blog/feed.xml", label: "Chrome" },
  { url: "https://developer.mozilla.org/en-US/blog/rss.xml", label: "MDN" },
  { url: "https://react.dev/rss.xml", label: "React" },
  { url: "https://tailwindcss.com/feeds/feed.xml", label: "Tailwind" },
  { url: "https://supabase.com/rss.xml", label: "Supabase" },
  { url: "https://v8.dev/blog.atom", label: "V8" },
  { url: "https://nodejs.org/en/feed/blog.xml", label: "Node" },
  { url: "https://www.smashingmagazine.com/feed/", label: "Smashing" },
  { url: "https://css-tricks.com/feed/", label: "CSS-Tricks" },
];

/**
 * Широкий улов. Пороги підібрані так, щоб за добу приходило кілька десятків
 * рядків, а не кілька сотень: далі їх звужує модель, і платити токенами за
 * очевидне сміття немає сенсу.
 *
 * Заміряно 02.09.2026: HN від 80 балів дає ~35 історій за добу, з них
 * фронтендових одиниці; GitHub за цим запитом — п'ять репозиторіїв, серед яких
 * трапляється точне влучання (`anti-slop`, правила oxlint — а ми на oxlint).
 * Тобто обидва джерела дають приблизно один самородок на добу, і саме заради
 * нього вони тут.
 */
export const HN_MIN_POINTS = 80;
export const GITHUB_MIN_STARS = 400;
export const GITHUB_FRESH_DAYS = 30;

export const CLAUDE_CODE_REPO = "anthropics/claude-code";
export const CLAUDE_PLATFORM_NOTES = "https://docs.claude.com/en/release-notes/api.md";

export const atomUrl = (repo: string) => `https://github.com/${repo}/releases.atom`;

/** Куди вести по нотатки релізу пакета: репозиторій, якщо знаємо, інакше npm. */
export function releaseNotesUrl(pkg: string): string {
  const repo = PACKAGE_REPOS[pkg];
  if (repo) return `https://github.com/${repo}/releases`;
  return `https://www.npmjs.com/package/${pkg}?activeTab=versions`;
}

// ─────────────────────────── розбір стрічок ───────────────────────────

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

/**
 * Розгортання сутностей. Амперсанд ОСТАННІМ і окремим проходом: інакше
 * `&amp;lt;` перетвориться на `<` замість `&lt;`, тобто розбір з'їсть один
 * рівень екранування, якого не було.
 */
export function decodeXmlText(value: string): string {
  let out = value;
  for (const [entity, char] of Object.entries(XML_ENTITIES)) {
    if (entity === "&amp;") continue;
    out = out.split(entity).join(char);
  }
  out = out.split("&#x27;").join("'");
  return out.split("&amp;").join("&");
}

export type AtomEntry = {
  title: string;
  url: string;
  updated: string | null;
  /** Тіло релізу як текст: HTML уже знято, лишились рядки. */
  body: string;
  /** Короткий опис зі стрічки, якщо він там був. Підказка для відбору. */
  summary?: string;
};

/**
 * Вміст тега — разом із розгортанням CDATA.
 *
 * CDATA тут не екзотика: Smashing і CSS-Tricks кладуть у неї КОЖЕН заголовок,
 * і без цього рядка підбірка мовчки лишалась би без половини джерел.
 */
const tagContent = (block: string, tag: string): string | null => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  const cdata = match[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : match[1];
};

/** HTML тіла релізу → плаский текст. Нас цікавлять рядки, а не розмітка. */
export function htmlToLines(html: string): string[] {
  return decodeXmlText(html)
    .replace(/<li[^>]*>/g, "\n• ")
    .replace(/<\/(p|div|h\d|ul|ol)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Стрічка → перелік записів. РОЗУМІЄ ОБИДВА ДІАЛЕКТИ.
 *
 * ЧОМУ ОБИДВА, А НЕ ЛИШЕ ATOM. GitHub віддає Atom (`<entry>`, посилання
 * атрибутом `href`), а майже всі блоги — RSS 2.0 (`<item>`, посилання текстом
 * тега, дата в `pubDate`). Заміряно 02.09.2026: з тринадцяти джерел, які ми
 * читаємо, дванадцять — RSS. Парсер «тільки для Atom» мовчки повертав би
 * порожньо, а порожньо тут виглядає як «сьогодні нічого нового».
 *
 * Свідомо на регулярках, а не на XML-парсері: у проєкті його немає, тягнути
 * залежність заради чотирьох тегів дорожче за сам розбір. Зламається — тести
 * покажуть на сталому рядку, а живий прогін (devNewsLive.test.ts) — на справжніх.
 */
export function parseFeed(xml: string): AtomEntry[] {
  const entries: AtomEntry[] = [];
  for (const match of xml.matchAll(/<(entry|item)[\s>]([\s\S]*?)<\/\1>/g)) {
    const block = match[2];
    const title = tagContent(block, "title");
    // Atom кладе адресу в атрибут, RSS — у тіло тега. Пробуємо в тому порядку,
    // бо в Atom тіло `<link>` порожнє й перевірка «непорожній рядок» його б
    // не врятувала.
    const href = block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? tagContent(block, "link")?.trim();
    if (!title || !href) continue;
    const content = tagContent(block, "content") ?? tagContent(block, "content:encoded") ?? "";
    const summary = tagContent(block, "description") ?? tagContent(block, "summary") ?? "";
    entries.push({
      title: decodeXmlText(title).trim(),
      url: decodeXmlText(href),
      updated: tagContent(block, "updated") ?? tagContent(block, "pubDate"),
      body: htmlToLines(content).join("\n"),
      summary: trimSentence(htmlToLines(summary).join(" "), 200),
    });
  }
  return entries;
}

/**
 * Передреліз — не новина.
 *
 * ЗНАЙДЕНО ЖИВИМ ПРОГОНОМ 01.09.2026: у кандидати першим рядком приїхав
 * `supabase-js v2.113.0-canary.0`. Канарки виходять по кілька на тиждень, і
 * підбірка з них складалась би щодня — тобто перетворилась би рівно на те
 * сміття, від якого її будували.
 */
export function isPrerelease(title: string): boolean {
  return /-(canary|alpha|beta|rc|next|nightly|preview|dev)\b/i.test(title);
}

/**
 * Заголовок релізу → без хвоста комітного повідомлення.
 *
 * ТЕЖ ІЗ ЖИВОГО ПРОГОНУ: монорепозиторії пишуть у заголовок усе підряд —
 * «oxlint_v1.81.0: release(apps): oxlint v1.81.0 && oxfmt v0.66.0 (#26199)».
 * Ріжемо по першому «: », але ЛИШЕ якщо ліва половина схожа на мітку версії
 * (без пробілів і з цифрою). Інакше «React 19.3: Server Components stable»
 * втратив би саме ту половину, заради якої його читають.
 */
export function cleanReleaseTitle(title: string): string {
  const trimmed = title.replace(/\s*\(#\d+\)\s*$/, "").trim();
  const at = trimmed.indexOf(": ");
  if (at <= 0) return trimmed;
  const head = trimmed.slice(0, at);
  if (/\s/.test(head) || !/\d/.test(head)) return trimmed;
  return head;
}

/** Чи вийшов запис у вікні останніх `hours` годин від `now`. */
export function isRecent(updated: string | null | undefined, now: Date, hours: number): boolean {
  if (!updated) return false;
  const at = new Date(updated).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= hours * 3_600_000;
}

// ─────────────────────────── блок «Claude» ───────────────────────────

/**
 * Релізи Claude Code за добу — ОДНИМ рядком, а не по рядку на реліз.
 *
 * ЧОМУ ЗГОРТАЄМО. Клод-код виходить по кілька разів на тиждень, часто патчами
 * (v2.1.251, v2.1.252, v2.1.257 — за чотири дні). Рядок на кожен зробив би
 * підбірку щоденною й одноманітною, тобто рівно тим, від чого ми тікаємо.
 * Показуємо найновіший і скільки їх було, а подробиці — за посиланням.
 */
export function claudeCodeItem(entries: AtomEntry[], now: Date, windowHours = 24): DevNewsItem | null {
  const fresh = entries.filter((entry) => isRecent(entry.updated, now, windowHours));
  if (fresh.length === 0) return null;

  const newest = fresh[0];
  const highlights = newest.body
    .split("\n")
    .filter((line) => line.startsWith("• "))
    .slice(0, 2)
    .map((line) => trimSentence(line.slice(2), 120));

  return {
    source: "claude",
    key: `claude-code:${newest.title}`,
    title: `Claude Code ${newest.title}`,
    url: newest.url,
    note:
      highlights.length > 0
        ? highlights.join("\n")
        : fresh.length > 1
          ? `${fresh.length} релізи за добу`
          : undefined,
    publishedAt: newest.updated,
  };
}

export type ClaudeNotesSection = { date: string; bullets: string[] };

/**
 * Платформні нотатки Anthropic (маркдаун) → найсвіжіша дата з її пунктами.
 *
 * Пункти там бувають і на `*`, і на `-` — в одному документі водночас, тож
 * ловимо обидва маркери.
 */
export function parseClaudeNotes(markdown: string): ClaudeNotesSection | null {
  const sections = [...markdown.matchAll(/^### (.+)$/gm)];
  if (sections.length === 0) return null;

  const first = sections[0];
  const from = first.index! + first[0].length;
  const to = sections[1]?.index ?? markdown.length;
  const bullets = markdown
    .slice(from, to)
    .split("\n")
    .filter((line) => /^[*-] /.test(line))
    .map((line) => stripMarkdownLinks(line.slice(2)).trim())
    .filter(Boolean);

  if (bullets.length === 0) return null;
  return { date: first[1].trim(), bullets };
}

export function claudePlatformItem(section: ClaudeNotesSection | null, maxBullets = 3): DevNewsItem | null {
  if (!section) return null;
  return {
    source: "claude",
    key: `claude-platform:${section.date}`,
    title: `Платформа Claude — ${section.date}`,
    url: "https://docs.claude.com/en/release-notes/api",
    note: section.bullets.slice(0, maxBullets).map((b) => trimSentence(b, 140)).join("\n"),
  };
}

/** `[текст](адреса)` → `текст`. У Telegram посилання в тілі рядка тільки заважають. */
export function stripMarkdownLinks(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").replace(/`/g, "");
}

/** Перше речення, але не довше за `limit`. Обрізаємо по слову, не посеред нього. */
export function trimSentence(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  const sentenceEnd = text.search(/[.!?](\s|$)/);
  const sentence = sentenceEnd > 0 ? text.slice(0, sentenceEnd + 1) : text;
  if (sentence.length <= limit) return sentence;
  const cut = sentence.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// ─────────────────────────── блок «Стек» ───────────────────────────

export type StackBumpInput = {
  name: string;
  /** Що стоїть у нас. */
  installed: string;
  /** Що лежить у npm. */
  latest: string | null;
};

/**
 * Пакети, у яких з'явилась версія, новіша за встановлену.
 *
 * ЧОМУ ТУТ НЕМАЄ ПОРІВНЯННЯ ВЕРСІЙ ЗА SEMVER. Дані вже пораховані кроном
 * stack-versions, наше завдання — лише скласти рядки. Порівняння рядками
 * ловить рівно те, що треба: «latest не дорівнює встановленому». Питання
 * «мажор це чи патч» тут не ставиться навмисно — воно живе на сторінці Стек,
 * а в підбірці зайве: рішення оновлюватись ухвалюється не о дев'ятій ранку.
 */
export function stackItems(bumps: StackBumpInput[]): DevNewsItem[] {
  return bumps
    .filter((bump) => bump.latest && bump.latest !== bump.installed)
    .map((bump) => ({
      source: "stack" as const,
      key: `stack:${bump.name}@${bump.latest}`,
      title: `${bump.name} ${bump.installed} → ${bump.latest}`,
      url: releaseNotesUrl(bump.name),
    }));
}

// ─────────────────────────── блок «Варте уваги» ───────────────────────────

/**
 * Ґатунок кандидата вирішує, у який блок він потрапить, — і вирішує це КОД, а
 * не модель. Модель обирає лише «варте / не варте»; куди це покласти, вона не
 * знає й знати не має.
 */
export type CandidateKind = "release" | "reading";

export type WatchCandidate = {
  kind: CandidateKind;
  label: string;
  title: string;
  url: string;
  updated: string | null;
  /** Один рядок опису, якщо джерело його дало. Модель читає саме його. */
  summary?: string;
};

/**
 * Найсвіжіший НЕпередрелізний запис репозиторію — і не більше одного.
 *
 * ЧОМУ РІВНО ОДИН. Монорепозиторій випускає пачку тегів одним заходом (oxc дав
 * три за одну хвилину: oxlint, oxfmt і крейти). Три рядки про одну подію
 * витіснили б із трійки «варте уваги» два інші проєкти — тобто підбірка
 * розповідала б щоразу про один репозиторій.
 */
export function bestEntry(entries: AtomEntry[], now: Date, hours: number): AtomEntry | null {
  const fresh = entries
    .filter((entry) => isRecent(entry.updated, now, hours))
    .filter((entry) => !isPrerelease(entry.title))
    .sort((a, b) => new Date(b.updated ?? 0).getTime() - new Date(a.updated ?? 0).getTime());
  return fresh[0] ?? null;
}

/**
 * Промпт для відбору. Модель бачить пронумерований список і повертає номери.
 *
 * ЧОМУ САМЕ ТАК. Це єдине місце в підбірці, де працює модель, і їй свідомо не
 * дають писати текст: заголовок і посилання беруться з кандидата за номером.
 * Помилитись вона може лише у виборі — не у номері версії й не в адресі.
 */
export function buildPickPrompt(candidates: WatchCandidate[]): string {
  const list = candidates
    .map((c, i) => `${i + 1}. [${c.label}] ${c.title}${c.summary ? ` — ${c.summary}` : ""}`)
    .join("\n");
  return [
    "Ти добираєш читво для розробника, який САМ веде CRM друкарні. Ось вона:",
    "",
    "• React 19, чотири сторінки-гіганти (6–13 тис. рядків), головний біль —",
    "  зайві проходи рендеру; React Compiler ще не ввімкнено.",
    "• Vite 8 на Rolldown, TypeScript 7, лінт — oxlint, тести — Vitest.",
    "• Дані — Supabase з RLS; уся логіка доступу тримається на політиках.",
    "• Стилі — Tailwind 4 і власна дизайн-система на Radix.",
    "• Сервер — функції Netlify, крони — pg_cron із самої бази.",
    "• Є бот у Telegram і кілька інтеграцій: Нова Пошта, Dropbox, OpenAI.",
    "• Працює він здебільшого сам, разом із кодовим агентом.",
    "",
    "Нижче — свіжі релізи, статті й інструменти. Питання до кожного НЕ «чи це",
    "цікава новина», а «чи міг би він застосувати це у СВОЇЙ CRM найближчим",
    "часом» — або «чи зламає це його код при оновленні».",
    "",
    "Бери щонайбільше шість. Не бери: патчі без змісту, релізи документації,",
    "новини про ШІ-моделі взагалі, стартапи, залізо, політику, все, що просто",
    "цікаво почитати. Якщо вартого немає ЖОДНОГО — поверни порожній список:",
    "це нормальна й часта відповідь.",
    "",
    list,
    "",
    'Відповідь — JSON: {"picks":[{"n":<номер>,"why":"<що саме він з цим зробить, до 90 символів, українською>"}]}',
  ].join("\n");
}

export type ModelPick = { n: number; why?: string };

/**
 * Відповідь моделі → пункти підбірки.
 *
 * ВСЕ, ЩО МОДЕЛЬ НЕ ВГАДАЛА, ВІДКИДАЄТЬСЯ МОВЧКИ: номер поза списком, повтор,
 * четвертий пункт понад ліміт. Заголовок і адреса беруться з кандидата, а від
 * моделі лишається тільки `why` — і те обрізане. Тобто вигадати посилання або
 * переписати номер версії вона не може за побудовою, а не за домовленістю.
 */
export function applyPicks(
  candidates: WatchCandidate[],
  picks: ModelPick[],
  limits: Record<CandidateKind, number> = { release: 3, reading: 4 }
): DevNewsItem[] {
  const seen = new Set<number>();
  const taken: Record<CandidateKind, number> = { release: 0, reading: 0 };
  const items: DevNewsItem[] = [];

  for (const pick of picks) {
    const index = Math.trunc(Number(pick?.n)) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) continue;
    if (seen.has(index)) continue;
    seen.add(index);

    const candidate = candidates[index];
    if (taken[candidate.kind] >= limits[candidate.kind]) continue;
    taken[candidate.kind] += 1;

    items.push({
      // Ґатунок кандидата — а не думка моделі — вирішує блок.
      source: candidate.kind === "release" ? "watch" : "apply",
      key: `${candidate.kind === "release" ? "watch" : "apply"}:${candidate.url}`,
      title: `${candidate.label} — ${candidate.title}`,
      url: candidate.url,
      note: pick.why ? trimSentence(String(pick.why), 90) : undefined,
      publishedAt: candidate.updated,
    });
  }
  return items;
}

// ─────────────────────────── складання повідомлення ───────────────────────────

const BLOCK_TITLES: Record<DevNewsSource, string> = {
  stack: "📦 Наш стек",
  claude: "🤖 Claude",
  watch: "🌐 Варте уваги",
  apply: "💡 Можна застосувати",
};

const BLOCK_ORDER: DevNewsSource[] = ["stack", "claude", "watch", "apply"];

/**
 * Стеля на блок.
 *
 * НАВІЩО САМЕ СТЕКУ. Пам'ять про надіслане порожня рівно один раз — першого
 * ранку, — і в цей день «новим» виявиться ВЕСЬ накопичений відрив: усі пакети,
 * що встигли відстати від npm за місяці. Без стелі перше ж повідомлення було б
 * стіною з чотирьох десятків рядків, тобто найгіршим першим враженням від
 * розсилки, яку заводили заради стислості.
 *
 * Обрізається лише ТЕКСТ. У пам'ять лягають усі пункти (див. renderDevNews →
 * items), тож завтра решта не приїде хвостом по вісім на день: цей відрив уже
 * видно на сторінці Стек, і дублювати його добірками немає сенсу.
 */
const BLOCK_LIMITS: Partial<Record<DevNewsSource, number>> = { stack: 8 };

/** Мінімальне екранування під parse_mode=HTML у Telegram. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DevNewsMessage = {
  text: string;
  keyboard: Array<Array<{ text: string; url: string }>>;
  items: DevNewsItem[];
};

/**
 * Повідомлення — або `null`, якщо показувати нічого.
 *
 * `null` тут не помилка й не порожній стан, а штатна відповідь: у такий день
 * підбірка мовчить. Див. головне правило в шапці файлу.
 */
export function renderDevNews(items: DevNewsItem[], dateLabel: string): DevNewsMessage | null {
  const fresh = dedupe(items);
  if (fresh.length === 0) return null;

  const lines: string[] = [`<b>Підбірка для розробки — ${escapeHtml(dateLabel)}</b>`];

  for (const source of BLOCK_ORDER) {
    const block = fresh.filter((item) => item.source === source);
    if (block.length === 0) continue;
    lines.push("", `<b>${BLOCK_TITLES[source]}</b>`);
    const limit = BLOCK_LIMITS[source] ?? block.length;
    const hidden = Math.max(0, block.length - limit);
    for (const item of block.slice(0, limit)) {
      lines.push(`• <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>`);
      if (!item.note) continue;
      for (const noteLine of item.note.split("\n")) {
        lines.push(`  <i>${escapeHtml(noteLine)}</i>`);
      }
    }
    if (hidden > 0) lines.push(`• <i>…і ще ${hidden} — весь відрив видно на сторінці «Стек»</i>`);
  }

  return {
    text: lines.join("\n"),
    keyboard: [[{ text: "Стек у CRM", url: "https://tosho.pro/dev/stack" }]],
    items: fresh,
  };
}

/** Той самий ключ двічі — лишаємо перший. Порядок блоків від цього не залежить. */
export function dedupe(items: DevNewsItem[]): DevNewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}
