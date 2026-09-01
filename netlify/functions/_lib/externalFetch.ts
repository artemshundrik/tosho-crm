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
      // @ts-expect-error — Node дає асинхронний ітератор на тілі відповіді.
      for await (const chunk of response.body) {
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
