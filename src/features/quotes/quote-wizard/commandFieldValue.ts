import { normalizeProductUrl } from "@/features/quotes/quote-import/productUrl";

/**
 * Що набране в полі позиції — адреса чи назва (REQ-182#p14).
 *
 * Окремо від самого поля, бо це чиста логіка, і перевіряти її браузером було б
 * і повільно, і зайво. Відселилась із `QuoteItemCommandField.tsx`, коли те поле
 * почало ходити в базу за артикулами (REQ-248): компонент потягнув за собою
 * клієнт Supabase, і тест логіки в `node` перестав вантажитись через `window`.
 */

export type CommandFieldMode = "link" | "search";

/**
 * Чи це адреса. Приймаємо не лише `https://…`, а й те, як посилання виглядає в
 * чаті: `www.prom.ua/p123` і `prom.ua/p123` — менеджери копіюють їх без схеми.
 * Голий домен без шляху («prom.ua») — ні: це ще не товар, і назва «prom.ua»
 * у каталозі теоретично можлива.
 */
function looksLikeUrl(token: string): boolean {
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(token)) return true;
  return /^[\w-]+(\.[\w-]+)+\/\S+/.test(token);
}

function withScheme(token: string): string {
  return /^https?:\/\//i.test(token) ? token : `https://${token}`;
}

export function detectCommandFieldMode(value: string): CommandFieldMode {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return "search";
  return tokens.some(looksLikeUrl) ? "link" : "search";
}

/**
 * Список адрес із того, що вставили: перенос, пробіл чи кома між ними —
 * менеджери копіюють посилання пачкою з листа. Рекламний хвіст зрізаємо тут,
 * бо далі ця адреса піде і в запит по фото, і в `metadata.supplierUrl`.
 */
export function parseCommandFieldLinks(value: string): { urls: string[]; bad: string | null } {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  const urls: string[] = [];
  for (const token of tokens) {
    if (!looksLikeUrl(token)) return { urls, bad: token };
    const url = normalizeProductUrl(withScheme(token));
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { urls, bad: token };
    } catch {
      return { urls, bad: token };
    }
    if (!urls.includes(url)) urls.push(url);
  }
  return { urls, bad: null };
}
