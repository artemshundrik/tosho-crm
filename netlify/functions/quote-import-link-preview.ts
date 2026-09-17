import { z } from "zod";

import { createClient } from "@supabase/supabase-js";

import { parseBody } from "./_lib/parseBody";
import { fetchProductPage } from "./_lib/externalFetch";
import { extractOgTags } from "./_lib/ogTags";
import { extractProductSku } from "./_lib/productSku";
import { findPoolByArticle, findPoolByUrl, type SupplierPoolMatch } from "./_lib/supplierPoolLookup";

/**
 * Фото товару для ПРЕВ'Ю імпорту (REQ-236).
 *
 * ДРАБИНКА З ТРЬОХ СХОДИНОК (REQ-285). Спершу шукаємо товар у власному пулі
 * постачальників за адресою, потім — за артикулом у межах того ж постачальника,
 * і лише потім ідемо читати чужу сторінку, як робили досі. Чому саме в такому
 * порядку й чому ключем є адреса, а не артикул — у заголовку
 * `_lib/supplierPoolLookup.ts`, там же й заміри.
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
/**
 * Друга спроба крізь проксі. Сім секунд — із заміру 02.09.2026: холодна
 * сторінка Розетки приїжджає за 4–7 с, тепла — за півсекунди.
 */
const PROXY_TIMEOUT_MS = 7_000;
/**
 * Стеля на обидві спроби разом: звичайна функція Netlify живе десять секунд, і
 * останню лишаємо на те, щоб зібрати відповідь і чесно її віддати.
 */
const TOTAL_BUDGET_MS = 9_000;
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
 * браузерних заголовків його не обходить (перевірено 01.09.2026).
 *
 * Із 02.09.2026 Розетку й midocean забирає читач-проксі (`fetchProductPage`),
 * а от dok.ua тримає стіну й проти нього — тобто цей текст досі має кому
 * показуватись. Менеджеру треба сказати саме це, щоб він відкрив сайт сам, а
 * не чекав на картинку, якої не буде.
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

/** Відповідь, зібрана з рядка пулу, — однакова для обох сходинок драбинки. */
function poolResponse(url: string, match: SupplierPoolMatch) {
  return jsonResponse(200, {
    url,
    status: (match.imageUrl ? "done" : "no_image") satisfies PreviewStatus,
    reason: match.imageUrl ? null : "У пулі цей товар без фото",
    title: match.name,
    imageUrl: match.imageUrl,
    imageSource: "pool",
    sku: match.article,
    skuSource: "pool",
    source: "pool",
    supplierSlug: match.supplierSlug,
    matchedBy: match.matchedBy,
    price: match.price,
    currency: match.currency,
    priceKind: match.priceKind,
    poolRowId: match.rowId,
    // Артикул мовчить, поки кольори не розведені: у Е-Сувеніра він у кожного
    // кольору свій, і перший-ліпший означав би замовлення не того кольору.
    ambiguousArticle: match.ambiguousArticle,
    // Самі рядки їдуть до клієнта, а не лише їх кількість: з них збирається
    // вибір кольору тим самим `groupSupplierPoolRows`, що й у пошуку пулу
    // (REQ-285#p7). Поля вже обрізані — важкої `attrs` серед них немає.
    variants: match.rows,
    variantCount: match.rows.length,
  });
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

  // ПЕРША СХОДИНКА — НАШ ПУЛ, і лише потім чужий сайт (REQ-285#p3). Товар,
  // який у нас уже є, не треба ні качати, ні вгадувати: там і назва, і фото, і
  // артикул, і наша ціна. На 22 посиланнях, вставлених на проді, пул закрив
  // усі 17, що вели на наші сайти. Читаємо клієнтом користувача — RLS та сама,
  // що у вікні пошуку пулу.
  const pooled = await findPoolByUrl(userClient, url);
  if (pooled) return poolResponse(url, pooled);

  try {
    // Сторожа від SSRF кличе сам `fetchProductPage` — і на кожному переході,
    // і на адресі, яку віддаємо проксі.
    const page = await fetchProductPage(url, {
      timeoutMs: SITE_TIMEOUT_MS,
      proxyTimeoutMs: PROXY_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      budgetMs: TOTAL_BUDGET_MS,
    });

    if (page.status !== "ok") {
      return jsonResponse(200, {
        url,
        ...describeHttpStatus(page.httpStatus),
        title: null,
        imageUrl: null,
        sku: null,
        source: "page",
      });
    }

    const tags = extractOgTags(page.html, page.baseUrl);
    // Артикул читається з ТІЄЇ САМОЇ сторінки, що вже в руках (REQ-247), —
    // жодного зайвого походу по сайту. Він їде і в невдалій відповіді теж:
    // сторінка без фото цілком може мати артикул у розмітці.
    const sku = extractProductSku(page.html);

    // ДРУГА СХОДИНКА. Артикул є лише тепер, тож походу по сайту вона не
    // економить — вона рятує його результат: рядок пулу точніший за розмітку
    // магазину і в назві, і у фото, і в ціні.
    const pooledByArticle = await findPoolByArticle(userClient, url, sku?.value);
    if (pooledByArticle) return poolResponse(url, pooledByArticle);

    if (!tags.imageUrl) {
      return jsonResponse(200, {
        url,
        status: "no_image" satisfies PreviewStatus,
        reason: "На сторінці немає фото товару",
        title: tags.title,
        imageUrl: null,
        sku: sku?.value ?? null,
        source: "page",
      });
    }

    return jsonResponse(200, {
      url,
      status: "done" satisfies PreviewStatus,
      reason: null,
      title: tags.title,
      imageUrl: tags.imageUrl,
      imageSource: tags.imageSource,
      sku: sku?.value ?? null,
      skuSource: sku?.source ?? null,
      source: "page",
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Не вдалося відкрити сторінку";
    return jsonResponse(200, {
      url,
      status: "failed" satisfies PreviewStatus,
      reason: /timeout|abort/i.test(message) ? "Сайт не відповів вчасно" : message,
      title: null,
      imageUrl: null,
      sku: null,
      source: "page",
    });
  }
};
