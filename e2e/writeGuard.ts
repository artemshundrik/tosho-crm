import type { Page, Route } from "@playwright/test";

import { supabaseHost } from "./env";

/**
 * ГАЛЬМО НА ЗАПИСИ — головна умова, за якої ці перевірки взагалі можна ганяти.
 *
 * Supabase у проєкті ОДИН, і він продівський: набір заходить у застосунок під
 * справжнім обліковим записом і бачить справжні дані. Тому запис має бути не
 * «ми домовились нічого не натискати», а фізично неможливий.
 *
 * ЧОМУ САМЕ `page.route`, А НЕ ПІДМІНА `window.fetch`. Підміна глобального
 * fetch зі сторінки НЕ ЛОВИТЬ клієнт supabase-js: він тримає власне посилання
 * на fetch, узяте в момент створення клієнта. Перевірено дорогою ціною
 * 24.08.2026 — «заблокований» запит спокійно доїхав до бази й змінив статус
 * прорахунку в проді. `page.route` перехоплює на рівні браузера, нижче за
 * будь-який застосунковий код, і обійти його зі сторінки не можна.
 *
 * ЩО ПРОПУСКАЄМО:
 *   • GET/HEAD/OPTIONS — читання, заради них усе й затіяно;
 *   • `/auth/v1/*` — вхід і поновлення токена, без них немає сесії;
 *   • `/rest/v1/rpc/<name>` для функцій, що лише читають.
 *
 * ЩО ГЛУШИМО: запис у таблиці, сховище, мутуючі RPC і не-GET у Netlify-функції.
 *
 * Перелік мутуючих RPC — дзеркало MUTATING_RPCS із src/lib/viewOnlyGuard.ts.
 * Дзеркало, а не імпорт: той модуль тягне за собою браузерний код застосунку,
 * а сторож має лишатись самостійним. Розбіжність ловить тест writeGuard.test.ts.
 */
export const MUTATING_RPCS = [
  "accept_workspace_invite",
  "acquire_entity_lock",
  "adjust_sample_stock_item",
  "archive_activity_log_all",
  "bot_submit_absence",
  "capture_admin_observability_snapshot",
  "force_release_entity_lock",
  "next_design_task_number",
  "next_dev_request_number",
  "next_document_number",
  "release_entity_lock",
  "request_entity_lock_release",
  "set_quote_status",
] as const;

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type BlockedWrite = { method: string; url: string; why: string };

/**
 * Чи цей запит змінює дані. Винесено окремо від маршрутизації, щоб рішення
 * можна було перевірити тестом, не піднімаючи браузер.
 */
export function classifyRequest(
  method: string,
  url: string,
  host: string
): { blocked: false } | { blocked: true; why: string } {
  const upper = method.toUpperCase();
  if (READ_METHODS.has(upper)) return { blocked: false };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { blocked: false };
  }

  // Netlify-функції ходять повз клієнт Supabase, звичайним fetch, і частина з
  // них пише (створює документи, шле сповіщення). Хост тут свій — той, на
  // якому підняте прев'ю, — тож звіряємось за шляхом.
  if (parsed.pathname.startsWith("/.netlify/functions/")) {
    return { blocked: true, why: `Netlify-функція ${parsed.pathname.split("/").pop()}` };
  }

  if (!host || parsed.host !== host) return { blocked: false };

  // Вхід і поновлення токена. Без них сесія помирає посеред прогону.
  if (parsed.pathname.startsWith("/auth/v1/")) return { blocked: false };

  if (parsed.pathname.startsWith("/rest/v1/rpc/")) {
    const name = parsed.pathname.slice("/rest/v1/rpc/".length);
    return (MUTATING_RPCS as readonly string[]).includes(name)
      ? { blocked: true, why: `rpc ${name}` }
      : { blocked: false };
  }

  if (parsed.pathname.startsWith("/rest/v1/")) {
    return { blocked: true, why: `${upper} ${parsed.pathname.slice("/rest/v1/".length)}` };
  }

  if (parsed.pathname.startsWith("/storage/v1/")) {
    return { blocked: true, why: `сховище ${parsed.pathname}` };
  }

  return { blocked: false };
}

/**
 * Вішає гальмо на сторінку й повертає список того, що воно спинило.
 *
 * Спинений запит повертається помилкою 423 у тій самій формі, яку застосунок
 * уже вміє показувати (так само робить режим перегляду), — щоб сторінка не
 * падала в порожній екран, а чесно сказала тостом.
 */
export function installWriteGuard(page: Page): BlockedWrite[] {
  const host = supabaseHost();
  const blocked: BlockedWrite[] = [];

  void page.route("**/*", (route: Route) => {
    const request = route.request();
    const verdict = classifyRequest(request.method(), request.url(), host);
    if (!verdict.blocked) return route.fallback();

    blocked.push({ method: request.method(), url: request.url(), why: verdict.why });
    return route.fulfill({
      status: 423,
      contentType: "application/json",
      body: JSON.stringify({
        code: "E2E_READ_ONLY",
        message: "Наскрізні перевірки працюють лише на читання",
        details: verdict.why,
      }),
    });
  });

  return blocked;
}
