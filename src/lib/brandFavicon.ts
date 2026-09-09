/**
 * Лого сервісу чи постачальника за доменом — фавікон через Google.
 * Одна копія на CRM: досі та сама адреса була в «Інтеграціях» і в лого
 * підписок у Фінансах, а третю (для постачальників) заводити не стали.
 */
export const faviconUrl = (domain: string): string =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
