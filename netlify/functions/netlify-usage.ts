import { createClient } from "@supabase/supabase-js";

import { resolveAccessLevel } from "./_lib/assistantAccess";
import { DEPLOY_CREDITS, forecastNetlify, loadNetlifyUsage, type NetlifyUsage } from "./_netlifyUsage";

/**
 * Справжній залишок кредитів Netlify — для картки «Інтеграції» в CRM.
 *
 * ЩО БУЛО НЕ ТАК (REQ-217). Картка рахувала кредити сама: «1000 мінус 15 за
 * кожен реліз від 2-го числа». Формула була звірена з кабінетом 15.08.2026 і
 * тоді сходилась. За три тижні розійшлась двічі:
 *   • білінг-цикл переїхав на 27-ме (тариф Personal діє з 27 серпня), тож вікно
 *     «з 2-го» відрізало п'ять днів циклу;
 *   • фон (функції, запити, трафік) виріс із 1,6 кредита на 26 релізів до
 *     ≈116 за цикл, тобто до чверті всієї витрати.
 * 07.09.2026 картка показувала 850 кредитів і 56 деплоїв, у кабінеті було 621 і
 * ~31 деплой. Помилка на 229 кредитів — і саме в бік «усе гаразд».
 *
 * ЧОМУ ЕНДПОІНТ, А НЕ ЗАПИТ ІЗ БРАУЗЕРА. `NETLIFY_API_TOKEN` дає повний доступ
 * до акаунта; у клієнтський бандл він не потрапляє ніколи. Тут же лежить і
 * готовий `_netlifyUsage` — той самий, з якого живуть сигнал «Здоров'я» й
 * телеграм-бот. Тобто це не нове джерело, а підключення картки до наявного:
 * три читачі одного факту тепер кажуть одне й те саме.
 *
 * КОМУ ВІДДАЄМО. Тим самим, кому CRM показує інфраструктурні картки: модуль
 * `dev` обмежений власником і CEO (`restrictedTo: ownerOrSeo` у
 * src/lib/moduleAccess.ts), і це `resolveAccessLevel(...) === "full"`. Клієнтський
 * гейт тут не рахується — рівень перевіряється на сервері за токеном.
 */

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

/**
 * Скільки тримаємо відповідь у пам'яті інстансу.
 *
 * Кредити оновлюються в Netlify за хвилини, а картку відкривають кілька разів
 * на день — тож п'ять хвилин нікого не обманюють, зате повторний вхід у розділ
 * не коштує ні трьох запитів у чужий API, ні зайвого виклику функції (а
 * зменшення викликів — це рівно те, заради чого REQ-217 і заведено).
 */
const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; body: Record<string, unknown> } | null = null;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/** Рівно ті числа, які показує картка. Решту `NetlifyUsage` не віддаємо. */
function toPayload(usage: NetlifyUsage, now: Date) {
  const forecast = forecastNetlify(usage, now);
  return {
    planLeft: usage.planLeft,
    planTotal: usage.planTotal,
    addonLeft: usage.addonLeft,
    spent: usage.spent,
    deploys: usage.deploys,
    deployCredits: usage.deployCredits,
    computeCredits: usage.computeCredits,
    requestCredits: usage.requestCredits,
    bandwidthCredits: usage.bandwidthCredits,
    aiCredits: usage.aiCredits,
    backgroundPerDay: usage.backgroundPerDay,
    backgroundYesterday: usage.backgroundYesterday,
    insightsThrough: usage.insightsThrough,
    periodStart: usage.periodStart ? usage.periodStart.toISOString() : null,
    periodEnd: usage.periodEnd ? usage.periodEnd.toISOString() : null,
    deployCost: DEPLOY_CREDITS,
    forecast: {
      daysLeft: forecast.daysLeft,
      deploysLeft: forecast.deploysLeft,
      burnPerDay: forecast.burnPerDay,
      runsOutBeforeCycleEnd: forecast.runsOutBeforeCycleEnd,
      zeroAt: forecast.zeroAt ? forecast.zeroAt.toISOString() : null,
    },
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  if (!token) return jsonResponse(401, { error: "Unauthorized" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: membership, error: membershipError } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle<{ access_role: string | null; job_role: string | null }>();
  if (membershipError) return jsonResponse(500, { error: "Failed to verify access" });

  const level = resolveAccessLevel({
    accessRole: membership?.access_role ?? null,
    jobRole: membership?.job_role ?? null,
  });
  if (level !== "full") return jsonResponse(403, { error: "Forbidden" });

  const apiToken = process.env.NETLIFY_API_TOKEN?.trim();
  // Не 500: «токен не заведено» — це не поломка, а незроблене налаштування.
  // Картка на таку відповідь чесно каже, що точного балансу не знає.
  if (!apiToken) return jsonResponse(200, { ok: false, reason: "no_token" });

  const now = new Date();
  if (cache && now.getTime() - cache.at < CACHE_MS) {
    return jsonResponse(200, cache.body);
  }

  try {
    const usage = await loadNetlifyUsage(apiToken);
    const body = { ok: true, usage: toPayload(usage, now) };
    cache = { at: now.getTime(), body };
    return jsonResponse(200, body);
  } catch (error) {
    // Netlify — зовнішній сервіс: його недоступність не привід віддавати 500 і
    // фарбувати картку в «поламано». Картка покаже, що баланс недоступний.
    const message = error instanceof Error ? error.message : "невідома помилка";
    return jsonResponse(200, { ok: false, reason: "unavailable", message });
  }
};
