import { z } from "zod";

import { createClient } from "@supabase/supabase-js";

import { parseBody } from "./_lib/parseBody";
import { HTML_ACCEPT_HEADER, fetchWithLimits, getBrowserLikeHeaders } from "./_lib/externalFetch";
import { extractOgTags } from "./_lib/ogTags";

/**
 * Фото товару для ПРЕВ'Ю імпорту (REQ-236).
 *
 * ЧОМУ НЕ ФОНОВА `quote-import-research-background`. Та працює з уже
 * створеними позиціями: читає `metadata.supplierUrl`, стискає картинку й
 * кладе її в Storage. У прев'ю позицій ще немає — там є самі посилання з
 * файлу, і прорахунок з'явиться, лише якщо менеджер натисне «Створити».
 * Плюс фонова функція за визначенням не має відповіді: Netlify віддає 202 і
 * забуває про неї. Тут потрібне саме зворотне — швидка синхронна відповідь.
 *
 * ЧОМУ ОДНЕ ПОСИЛАННЯ ЗА ВИКЛИК. Сайти відповідають від пів секунди до восьми,
 * а звичайна функція живе десять. Пачка з п'яти посилань означала б, що один
 * повільний магазин з'їдає ліміт і разом із собою забирає чотири вдалі
 * відповіді. Один виклик — одне посилання — одна картка в прев'ю, яка
 * оновлюється рівно тоді, коли її фото доїхало.
 *
 * КАРТИНКА НЕ ЗАВАНТАЖУЄТЬСЯ І НЕ ЗБЕРІГАЄТЬСЯ. Ми віддаємо чужу адресу, і
 * браузер тягне її сам: у прев'ю картинка живе хвилину-дві й у половині
 * випадків так і не знадобиться. Свою копію в Storage робить фонова функція —
 * уже для створених позицій, які лишаться в прорахунку надовго.
 */

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const SITE_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

const requestSchema = z.object({ url: z.string().url().max(2000) }).strict();

/** Чим закінчилась розвідка — це показується менеджеру словами, а не мовчанкою. */
type PreviewStatus = "done" | "no_image" | "blocked" | "failed";

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Відповідь сайту → зрозуміла людині причина.
 *
 * 403 від dok.ua, rozetka й midocean — це не наша поломка й не биті дані: три
 * магазини з референсного файлу KMZ тримають антибот, і повніший набір
 * браузерних заголовків його не обходить (перевірено 01.09.2026). Менеджеру
 * треба сказати саме це, щоб він відкрив сайт сам, а не чекав на картинку,
 * якої не буде.
 */
function describeHttpStatus(status: number): { status: PreviewStatus; reason: string } {
  if (status === 401 || status === 403 || status === 429) {
    return { status: "blocked", reason: "Сайт не пускає роботів" };
  }
  if (status === 404 || status === 410) {
    return { status: "failed", reason: "Сторінки вже немає" };
  }
  return { status: "failed", reason: `Сайт відповів ${status}` };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });

  // Ходити по чужих адресах може лише той, хто зайшов у CRM: інакше це
  // відкритий проксі, яким чужі люди сканують мережу нашими руками. Доступу до
  // конкретного прорахунку тут не питаємо — його ще не існує, а саме посилання
  // прийшло з файлу, який людина щойно відкрила у себе.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  const url = parsed.data.url;

  try {
    // Сторожа від SSRF кличе сам `fetchWithLimits` — і на кожному переході.
    const { response, body } = await fetchWithLimits(url, {
      timeoutMs: SITE_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      headers: getBrowserLikeHeaders(url, { includeReferer: false, accept: HTML_ACCEPT_HEADER }),
    });

    if (!response.ok) {
      return jsonResponse(200, {
        url,
        ...describeHttpStatus(response.status),
        title: null,
        description: null,
        imageUrl: null,
      });
    }

    // Кодування беремо з відповіді: чимало українських магазинів досі віддає
    // windows-1251, і в utf-8 назва перетворилась би на питання в ромбиках.
    const charset = response.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1];
    const html = new TextDecoder(charset && charset.toLowerCase() !== "utf-8" ? charset : "utf-8", {
      fatal: false,
    }).decode(body);
    const tags = extractOgTags(html, response.url || url);

    if (!tags.imageUrl) {
      return jsonResponse(200, {
        url,
        status: "no_image" satisfies PreviewStatus,
        reason: "На сторінці немає фото товару",
        title: tags.title,
        description: tags.description,
        imageUrl: null,
      });
    }

    return jsonResponse(200, {
      url,
      status: "done" satisfies PreviewStatus,
      reason: null,
      title: tags.title,
      description: tags.description,
      imageUrl: tags.imageUrl,
      imageSource: tags.imageSource,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Не вдалося відкрити сторінку";
    return jsonResponse(200, {
      url,
      status: "failed" satisfies PreviewStatus,
      reason: /timeout|abort/i.test(message) ? "Сайт не відповів вчасно" : message,
      title: null,
      description: null,
      imageUrl: null,
    });
  }
};
