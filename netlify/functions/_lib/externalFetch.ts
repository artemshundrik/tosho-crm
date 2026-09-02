import dnsPromises from "node:dns/promises";
import net from "node:net";

/**
 * Похід у зовнішній інтернет із функції — спільні правила.
 *
 * ЧОМУ СПІЛЬНЕ. Той самий SSRF-сторож був написаний усередині
 * `catalog-image-import.ts`, і друга функція, яка ходить за чужим URL
 * (`quote-import-research-background.ts`, REQ-233), або скопіювала б його, або
 * — що ймовірніше — обійшлася б без нього. Правило, яке захищає лише того, хто
 * його кличе, мусить мати одне місце, звідки його кличуть усі.
 */

export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT
    );
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return (
      low === "::1" ||
      low === "::" ||
      low.startsWith("fc") ||
      low.startsWith("fd") || // unique local
      low.startsWith("fe80") || // link-local
      low.startsWith("::ffff:127.") ||
      low.startsWith("::ffff:10.") ||
      low.startsWith("::ffff:192.168.") ||
      low.startsWith("::ffff:169.254.")
    );
  }
  return true; // unrecognised → treat as unsafe
}

/**
 * SSRF guard: only fetch http(s) URLs that resolve to public addresses. Blocks the prior
 * hole where any authenticated caller could point a URL at internal/metadata endpoints.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Некоректний URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Дозволені лише http(s) посилання.");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("Внутрішні адреси заборонені.");
  }
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dnsPromises.lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new Error("Не вдалося розпізнати адресу джерела.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new Error("Джерело вказує на внутрішню/зарезервовану адресу — заборонено.");
  }
  return parsed;
}

export function getSourceOrigin(sourceUrl: string): string | undefined {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return undefined;
  }
}

/**
 * Заголовки «як у браузера». Половина сайтів постачальників віддає 403 голому
 * fetch — не з міркувань безпеки, а через антибот на CDN.
 */
export function getBrowserLikeHeaders(
  sourceUrl: string,
  options?: { includeReferer?: boolean; accept?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      options?.accept ?? "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  const origin = options?.includeReferer ? getSourceOrigin(sourceUrl) : undefined;
  if (origin) headers.Referer = `${origin}/`;
  return headers;
}

export const HTML_ACCEPT_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/**
 * ЧИТАЧ-ПРОКСІ ДЛЯ САЙТІВ ІЗ АНТИБОТ-СТІНОЮ (REQ-237#p15).
 *
 * ЧОМУ ВЗАГАЛІ. Розетка, dok.ua і midocean віддають голому запиту 403 зі
 * сторінкою Cloudflare «Just a moment…». Заміряно 01.09 і перезаміряно
 * 02.09.2026: справа НЕ в заголовках. Стіна дивиться на відбиток самого
 * з'єднання, а Node ніколи не виглядатиме як Chrome, скільки в нього не пиши
 * `User-Agent`. Тобто це не та поломка, яку лагодять підбором хедерів.
 *
 * ЧОМУ НЕ ВЛАСНИЙ API РОЗЕТКИ. Перевірено того ж дня: `search.rozetka.com.ua`
 * справді відкритий, але віддає самі `id` без назв і фото, а деталі лежать за
 * `xl-catalog-api` — тобто за тією самою стіною. Глухий кут.
 *
 * ЩО ВИЙШЛО. Читач-проксі в режимі сирого HTML повертає сторінку цілком, разом
 * з og-тегами, — тож `extractOgTags` лишається недоторканим. Проксі тут не
 * розумник, а просто інший спосіб донести ту саму сторінку.
 */
const DEFAULT_READER_PROXY = "https://r.jina.ai/{url}";

/**
 * Змінна оточення важить більше за константу: чужий безкоштовний сервіс може
 * померти або почати різати ліміти в будь-який вівторок, і тоді проксі треба
 * замінити чи вимкнути (порожнім значенням) без викочування коду.
 */
function readerProxyTemplate(): string {
  const configured = process.env.LINK_PREVIEW_PROXY_TEMPLATE;
  return configured === undefined ? DEFAULT_READER_PROXY : configured.trim();
}

/**
 * Домени, де перший стук завідомо марний.
 *
 * Для них ідемо в проксі ОДРАЗУ. Не з ощадливості: у функції всього 10 секунд,
 * а холодна відповідь проксі — 4–7 з них. Зайвий похід «а раптом сьогодні
 * пустить» з'їдає бюджет, якого потім бракує на справжню спробу.
 */
const ANTIBOT_HOSTS = ["rozetka.com.ua", "midocean.com"];

export function isKnownAntibotHost(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ANTIBOT_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

/** 401/403/429 — це «нас не пустили», а не «сторінки немає». Лише тут є сенс у другій спробі. */
export function isBotWallStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}

/**
 * Стіна, яка прикидається успіхом.
 *
 * Проксі віддає 200 навіть тоді, коли сам упрів у ту саму стіну: на dok.ua він
 * повертає сторінку «Just a moment…» з кодом 200. Без цієї перевірки менеджер
 * побачив би «на сторінці немає фото товару» — тобто ми звалили б чужу стіну
 * на биту сторінку й відправили людину шукати неіснуючу проблему.
 */
export function looksLikeBotWall(html: string): boolean {
  const head = html.slice(0, 4000);
  return (
    /<title>\s*(just a moment|attention required|один момент)/i.test(head) ||
    /challenge-platform|cf-browser-verification|_cf_chl_opt/i.test(head)
  );
}

export type PageFetchOutcome = {
  /** HTML сторінки; порожній рядок, якщо не дістали нічого. */
  html: string;
  /** Адреса, ВІДНОСНО ЯКОЇ добудовувати шляхи картинок. Крізь проксі це завжди адреса САЙТУ, не проксі. */
  baseUrl: string;
  /** `blocked` — стіна; `http_error` — сайт відповів помилкою; `ok` — сторінка в руках. */
  status: "ok" | "blocked" | "http_error";
  /** Код відповіді для повідомлення людині; при стіні — код першої, не проксі. */
  httpStatus: number;
  viaProxy: boolean;
};

function decodeHtml(response: Response, body: Buffer): string {
  // Кодування беремо з відповіді: чимало українських магазинів досі віддає
  // windows-1251, і в utf-8 назва перетворилась би на питання в ромбиках.
  const charset = response.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1];
  return new TextDecoder(charset && charset.toLowerCase() !== "utf-8" ? charset : "utf-8", {
    fatal: false,
  }).decode(body);
}

/**
 * Сторінка товару: прямо, а якщо не пустили — крізь читач-проксі.
 *
 * ТАЙМАУТ НЕ Є ПРИВОДОМ ДЛЯ ДРУГОЇ СПРОБИ, і це головне обмеження з замірів.
 * Відмова від стіни приходить за 0,15 с — після неї повтор майже безплатний і
 * влазить у ліміт функції. А от повтор після шести секунд мовчання не влазить
 * уже ні в що: ми просто з'їмо весь бюджет і не віддамо нічого.
 */
export async function fetchProductPage(
  url: string,
  options: { timeoutMs: number; proxyTimeoutMs: number; maxBytes: number; budgetMs?: number }
): Promise<PageFetchOutcome> {
  const startedAt = Date.now();
  const proxyTemplate = readerProxyTemplate();
  const proxyAvailable = proxyTemplate.includes("{url}");
  const skipDirect = proxyAvailable && isKnownAntibotHost(url);

  /**
   * Скільки часу лишилось на проксі.
   *
   * Стіни відповідають миттєво, тож у житті після відмови лишається майже весь
   * бюджет. Але «майже завжди» — не «завжди»: повільний 403 плюс повний
   * таймаут проксі вилізли б за ліміт функції, і менеджер побачив би не
   * причину, а обрив. Тому другу спробу ріжемо тим, що справді лишилось.
   */
  const proxyBudget = () => {
    const spent = Date.now() - startedAt;
    const room = options.budgetMs === undefined ? options.proxyTimeoutMs : options.budgetMs - spent;
    return Math.min(options.proxyTimeoutMs, Math.max(0, room));
  };

  /** Код ПЕРШОЇ відповіді: саме його показуємо людині, а не код проксі. */
  let firstStatus: number;

  if (!skipDirect) {
    const { response, body } = await fetchWithLimits(url, {
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      headers: getBrowserLikeHeaders(url, { includeReferer: false, accept: HTML_ACCEPT_HEADER }),
    });
    firstStatus = response.status;

    if (response.ok) {
      const html = decodeHtml(response, body);
      if (!looksLikeBotWall(html)) {
        return {
          html,
          baseUrl: response.url || url,
          status: "ok",
          httpStatus: response.status,
          viaProxy: false,
        };
      }
      // 200 зі стіною в тілі — той самий блок, лише ввічливіший.
      firstStatus = 403;
    }

    const blocked = firstStatus === 403 || isBotWallStatus(response.status);
    if (!blocked || !proxyAvailable) {
      return {
        html: "",
        baseUrl: url,
        status: blocked ? "blocked" : "http_error",
        httpStatus: firstStatus,
        viaProxy: false,
      };
    }
  } else {
    // Прямого походу не буде — отже, нікому покликати SSRF-сторожа за нас.
    // Без цього рядка адресу на внутрішню мережу ми б слухняно передали
    // проксі, і сторож, який дивиться лише на першу адресу, не захистив би ні
    // від чого.
    await assertSafeExternalUrl(url);
    firstStatus = 403;
  }

  const remaining = proxyBudget();
  // Часу не лишилось — чесніше сказати «не пустили», ніж витратити ще секунду
  // на запит, який усе одно обірве ліміт функції.
  if (remaining < 500) {
    return { html: "", baseUrl: url, status: "blocked", httpStatus: firstStatus, viaProxy: false };
  }

  const { response, body } = await fetchWithLimits(proxyTemplate.replace("{url}", url), {
    timeoutMs: remaining,
    maxBytes: options.maxBytes,
    /**
     * ЖОДНИХ БРАУЗЕРНИХ ЗАГОЛОВКІВ, І ЦЕ НЕ ДРІБНИЦЯ.
     *
     * Проксі передає наші заголовки далі на сайт. Варто додати `User-Agent`
     * Chrome — і Cloudflare бачить браузер, який прийшов не по-браузерному:
     * блок за 32 мс проти 590 мс успіху (бісекція 02.09.2026, решта
     * заголовків нешкідлива). Тобто тут `getBrowserLikeHeaders` — не
     * покращення, а рівно те, що ламає запит: без нього проксі підставляє свій
     * власний, узгоджений із власним з'єднанням.
     *
     * `x-return-format: html` — те, заради чого це взагалі працює: сирий HTML
     * із og-тегами, а не переказ сторінки в markdown, де фото товару вже не
     * відрізнити від банера.
     */
    headers: { "x-return-format": "html" },
  });

  // База для картинок — адреса САЙТУ. Інакше відносний `/img/mug.jpg`
  // добудувався б до адреси проксі й вказував у нікуди.
  if (!response.ok) {
    return { html: "", baseUrl: url, status: "blocked", httpStatus: firstStatus, viaProxy: true };
  }

  const html = decodeHtml(response, body);
  if (looksLikeBotWall(html)) {
    return { html: "", baseUrl: url, status: "blocked", httpStatus: firstStatus, viaProxy: true };
  }

  return { html, baseUrl: url, status: "ok", httpStatus: 200, viaProxy: true };
}

export function isAllowedImageContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("image/jpeg") ||
    normalized.startsWith("image/png") ||
    normalized.startsWith("image/webp") ||
    normalized.startsWith("image/gif") ||
    normalized.startsWith("image/bmp") ||
    normalized.startsWith("image/tiff")
  );
}

/**
 * Fetch із таймаутом, стелею розміру й ПЕРЕВІРКОЮ КОЖНОГО ПЕРЕХОДУ.
 *
 * РЕДІРЕКТИ — ДІРКА, ЯКУ ЛЕГКО НЕ ПОМІТИТИ. `redirect: "follow"` перевіряє
 * адресу лише на вході: сайт відповідає публічним IP, проходить сторожа, а
 * далі віддає 302 на `http://169.254.169.254/…` — і fetch слухняно йде туди
 * сам. Тобто SSRF-guard, який дивиться тільки на першу адресу, не захищає ні
 * від чого, бо чужий сервер вирішує, куди піде другий запит.
 *
 * Тому переходи робимо руками й кожну наступну адресу проганяємо крізь того
 * самого сторожа.
 *
 * Стелі розміру й часу тут не заради ощадливості: без них один сайт із
 * гігабайтним «зображенням» кладе фонову функцію, а інший тримає її всі 15
 * хвилин, поки решта посилань стоїть у черзі.
 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchWithLimits(
  url: string,
  options: {
    timeoutMs: number;
    maxBytes: number;
    headers?: Record<string, string>;
    maxRedirects?: number;
  }
): Promise<{ response: Response; body: Buffer }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const maxRedirects = options.maxRedirects ?? 3;
  try {
    let current = url;
    for (let hop = 0; ; hop += 1) {
      await assertSafeExternalUrl(current);
      const response = await fetch(current, {
        redirect: "manual",
        headers: options.headers,
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location || hop >= maxRedirects) return { response, body: Buffer.alloc(0) };
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok || !response.body) return { response, body: Buffer.alloc(0) };

      const chunks: Buffer[] = [];
      let total = 0;
      // Node дає асинхронний ітератор на тілі відповіді; типи DOM його не
      // описують, тож звужуємо самі.
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        const buffer = Buffer.from(chunk as Uint8Array);
        total += buffer.length;
        if (total > options.maxBytes) {
          throw new Error("Відповідь більша за дозволену.");
        }
        chunks.push(buffer);
      }
      return { response, body: Buffer.concat(chunks) };
    }
  } finally {
    clearTimeout(timer);
  }
}
