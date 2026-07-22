// Довідник сервісів-підписок: домен → лого + підказка валюти/періоду.
// Лого беремо як фавікон домену (той самий трюк, що й для логотипів клієнтів у CRM):
// не тягне бандл, працює для будь-якого сервісу, який користувач допише сам.
// Якщо лого не завантажилось — EntityAvatar сам покаже монограму, нічого не ламається.

import type { FxCurrency } from "@/lib/fxRates";

export type SubscriptionBrand = {
  key: string;
  label: string;
  domain: string | null;
  /** Типова валюта — підставляється у формі, але користувач може змінити. */
  currency: FxCurrency;
  /** Слова, за якими впізнаємо сервіс у вже введеній назві постачальника. */
  match: string[];
};

export const SUBSCRIPTION_BRANDS: SubscriptionBrand[] = [
  { key: "dropbox", label: "Dropbox", domain: "dropbox.com", currency: "USD", match: ["dropbox", "дропбокс"] },
  { key: "adobe", label: "Adobe (Acrobat, CC)", domain: "adobe.com", currency: "USD", match: ["adobe", "acrobat", "адоб", "акробат"] },
  { key: "supabase", label: "Supabase", domain: "supabase.com", currency: "USD", match: ["supabase", "супабейс"] },
  { key: "openai", label: "ChatGPT (OpenAI)", domain: "openai.com", currency: "USD", match: ["openai", "chatgpt", "chat gpt", "чат гпт", "чатгпт"] },
  { key: "google", label: "Google Workspace (пошта, домени)", domain: "google.com", currency: "USD", match: ["google", "gmail", "workspace", "гугл", "домен"] },
  { key: "freepik", label: "Freepik", domain: "freepik.com", currency: "USD", match: ["freepik", "фріпік", "фрипик"] },
  { key: "magnific", label: "Magnific", domain: "magnific.com", currency: "USD", match: ["magnific", "магніфік"] },
  { key: "vchasno", label: "Вчасно", domain: "vchasno.ua", currency: "UAH", match: ["вчасно", "vchasno"] },
  { key: "medoc", label: "М.Е.Doc (Медок)", domain: "medoc.ua", currency: "UAH", match: ["медок", "medoc", "m.e.doc", "медок"] },
  { key: "bas", label: "BAS Бухгалтерія", domain: "bas-soft.eu", currency: "UAH", match: ["bas", "бас", "баз", "бухгалтерія bas"] },
  { key: "1c", label: "1С", domain: "1c.ru", currency: "UAH", match: ["1с", "1c", "1 с", "1 c"] },
  { key: "tucha", label: "Tucha", domain: "tucha.ua", currency: "UAH", match: ["tucha", "туча"] },
  { key: "crm", label: "CRM-система", domain: null, currency: "UAH", match: ["crm", "срм", "црм"] },
  { key: "anthropic", label: "Claude (Anthropic)", domain: "anthropic.com", currency: "USD", match: ["anthropic", "claude", "клод"] },
  { key: "figma", label: "Figma", domain: "figma.com", currency: "USD", match: ["figma", "фігма", "фигма"] },
  { key: "netlify", label: "Netlify", domain: "netlify.com", currency: "USD", match: ["netlify", "нетліфай"] },
];

const BRAND_BY_KEY = new Map(SUBSCRIPTION_BRANDS.map((brand) => [brand.key, brand]));

export const getSubscriptionBrand = (key?: string | null): SubscriptionBrand | null =>
  (key ? BRAND_BY_KEY.get(key) : null) ?? null;

/** Впізнаємо сервіс у довільному тексті — щоб старі рядки теж отримали лого. */
export function guessSubscriptionBrand(...texts: (string | null | undefined)[]): SubscriptionBrand | null {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack.trim()) return null;
  for (const brand of SUBSCRIPTION_BRANDS) {
    if (brand.match.some((token) => haystack.includes(token))) return brand;
  }
  return null;
}

/**
 * Чи це підписка на зовнішній сервіс (Dropbox, Adobe…), а не регулярний платіж
 * на кшталт оренди чи комуналки. Маркер — впізнаваний бренд або домен: рівно те,
 * що бачить око в списку (є лого = сервіс).
 */
export const isServiceExpense = (input: {
  logoUrl?: string | null;
  vendorKey?: string | null;
  supplierName?: string | null;
  notes?: string | null;
}): boolean => Boolean(resolveSubscriptionLogo(input));

const faviconUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

/** Лого підписки: ручне перевизначення → бренд із довідника → домен із назви. */
export function resolveSubscriptionLogo(input: {
  logoUrl?: string | null;
  vendorKey?: string | null;
  supplierName?: string | null;
  notes?: string | null;
}): string | null {
  const manual = input.logoUrl?.trim();
  if (manual) return manual;

  const brand = getSubscriptionBrand(input.vendorKey) ?? guessSubscriptionBrand(input.supplierName, input.notes);
  if (brand?.domain) return faviconUrl(brand.domain);

  // Користувач написав домен руками («figma.com», «https://vercel.com/pricing»).
  const raw = input.supplierName?.trim() ?? "";
  const domainMatch = raw.match(/([a-z0-9-]+\.[a-z]{2,})(?:\/|$)/i);
  if (domainMatch) return faviconUrl(domainMatch[1]);

  return null;
}
