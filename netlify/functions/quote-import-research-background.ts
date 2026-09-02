import { z } from "zod";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { parseBody } from "./_lib/parseBody";
import {
  fetchProductPage,
  fetchWithLimits,
  getBrowserLikeHeaders,
  isAllowedImageContentType,
} from "./_lib/externalFetch";
import { extractOgTags } from "./_lib/ogTags";

/**
 * Дослідження лінків постачальників після імпорту (REQ-233, §3.4).
 *
 * ЩО РОБИТЬ. Для кожної щойно імпортованої позиції відкриває посилання з
 * `metadata.supplierUrl`, читає og:title / og:image ЗВИЧАЙНИМ КОДОМ (жодної
 * моделі — тут нема чого розуміти, є що прочитати), стискає картинку в webp і
 * кладе її в Storage. У позицію дописується лише `metadata`: назва товару
 * постачальника й адреса картинки. Цін ця функція не торкається взагалі.
 *
 * ЧОМУ ФОНОВА. Тридцять сайтів по 2–10 секунд не влазять у звичайний ліміт
 * функції, а менеджер не має чекати на них, щоб побачити позиції: вони вже
 * створені, картинки доїжджають слідом.
 *
 * ПИШЕ КЛІЄНТОМ КОРИСТУВАЧА, А НЕ СЛУЖБОВИМ, і це не стиль, а єдиний робочий
 * шлях. На `quote_items` висить `trg_quote_items_recalc_upd`, який звіряє
 * `is_team_member()`, — а службове зʼєднання членом команди не є, бо в нього
 * немає `auth.uid()`. Тому будь-який адмінський update позиції падає з «Not
 * allowed» (це вже описано в scripts/catalog-method-directory.sql, де тригер
 * довелось глушити на час міграції).
 *
 * Знайдено живим прогоном: функція звітувала «researched: 4», а в metadata не
 * зʼявлялось нічого — помилку запису вона лише писала в консоль. Тепер невдалі
 * записи рахуються окремо й повертаються у відповіді.
 *
 * Службовий клієнт лишається рівно на одне — покласти стиснуту картинку в
 * Storage за шляхом, зібраним із значень бази (teamId/quoteId/itemId), уже
 * після перевірки доступу. У саму таблицю пишемо тільки під RLS.
 */

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

/** Скільки посилань обходимо за запуск. Більше — це вже не імпорт, а краулер. */
const MAX_ITEMS = 40;
const SITE_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Той самий бакет, у якому живуть картинки моделей каталогу. */
const IMPORT_IMAGE_BUCKET = "public-assets";

const requestSchema = z
  .object({
    quoteId: z.string().uuid(),
    itemIds: z.array(z.string().uuid()).min(1).max(MAX_ITEMS),
  })
  .strict();

type ItemRow = {
  id: string;
  quote_id: string;
  team_id: string | null;
  metadata: Record<string, unknown> | null;
};

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

function readSupplierUrl(metadata: Record<string, unknown> | null): string | null {
  const raw = metadata?.supplierUrl;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Сторінку тягне `fetchProductPage`: прямо, а для сайтів із антибот-стіною
 * (Розетка, midocean) — крізь читач-проксі (REQ-237#p15).
 *
 * ТУТ БЮДЖЕТ ШИРШИЙ, ніж у прев'ю: фонова функція живе п'ятнадцять хвилин, і
 * на неї ніхто не дивиться. Тому другій спробі можна дати повний таймаут, не
 * ділячи його з першою.
 *
 * САМЕ ФОТО проксі не потребує: перевірено 02.09.2026, `content*.rozetka.com.ua`
 * і `cdn1.midocean.com` віддають картинки звичайному запиту. Стіна стоїть на
 * сторінках, не на сховищі, тож `storeImage` лишається як був.
 */
async function fetchOgTags(url: string) {
  const page = await fetchProductPage(url, {
    timeoutMs: SITE_TIMEOUT_MS,
    proxyTimeoutMs: SITE_TIMEOUT_MS,
    maxBytes: MAX_HTML_BYTES,
  });
  if (page.status === "blocked") throw new Error("Сайт не пускає роботів.");
  if (page.status !== "ok") throw new Error(`Сайт відповів ${page.httpStatus}.`);
  return extractOgTags(page.html, page.baseUrl);
}

async function storeImage(params: {
  admin: SupabaseClient;
  imageUrl: string;
  teamId: string;
  quoteId: string;
  itemId: string;
}): Promise<string | null> {
  const { response, body } = await fetchWithLimits(params.imageUrl, {
    timeoutMs: SITE_TIMEOUT_MS,
    maxBytes: MAX_IMAGE_BYTES,
    headers: getBrowserLikeHeaders(params.imageUrl, { includeReferer: true }),
  });
  if (!response.ok) return null;
  if (!isAllowedImageContentType(response.headers.get("content-type")?.toLowerCase() ?? "")) return null;

  const webp = await sharp(body)
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();

  const storagePath = `teams/${params.teamId}/quote-imports/${params.quoteId}/${params.itemId}.webp`;
  const { error } = await params.admin.storage.from(IMPORT_IMAGE_BUCKET).upload(storagePath, webp, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
  });
  if (error) throw new Error(error.message);

  return params.admin.storage.from(IMPORT_IMAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
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
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const body = parsed.data;

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  // Позиції читаємо КЛІЄНТОМ КОРИСТУВАЧА і одразу звужуємо до одного
  // прорахунку: те, що RLS не віддала, для нас не існує, а чужий itemId у
  // списку просто не доїде до запису.
  const { data: itemRows, error: itemsError } = await userClient
    .schema("tosho")
    .from("quote_items")
    .select("id, quote_id, team_id, metadata")
    .eq("quote_id", body.quoteId)
    .in("id", body.itemIds);
  if (itemsError) return jsonResponse(500, { error: itemsError.message });

  const items = ((itemRows ?? []) as ItemRow[]).filter((row) => row.quote_id === body.quoteId);
  if (items.length === 0) return jsonResponse(200, { researched: 0, skipped: 0 });

  const outcomes: Array<"done" | "skipped" | "failed" | "not_saved"> = [];

  for (const item of items) {
    const supplierUrl = readSupplierUrl(item.metadata);
    const metadata: Record<string, unknown> = { ...(item.metadata ?? {}) };
    const fetchedAt = new Date().toISOString();
    let outcome: "done" | "skipped" | "failed" = "failed";

    if (!supplierUrl || !item.team_id) {
      outcome = "skipped";
      metadata.research = { status: "skipped", fetchedAt };
    } else {
      try {
        const tags = await fetchOgTags(supplierUrl);
        let imageUrl: string | null = null;
        if (tags.imageUrl) {
          imageUrl = await storeImage({
            admin: adminClient,
            imageUrl: tags.imageUrl,
            teamId: item.team_id,
            quoteId: body.quoteId,
            itemId: item.id,
          });
        }

        if (tags.title || imageUrl) {
          // Пишемо в `catalogVariant` навмисно: картка позиції рендерить це
          // поле вже сьогодні, тож картинка й назва з'являються без жодної
          // зміни в UI. `id` штучний — товару каталогу за цим нічого не стоїть.
          metadata.catalogVariant = {
            id: `import:${item.id}`,
            name: (tags.title ?? "").slice(0, 160) || "Товар постачальника",
            sku: null,
            imageUrl,
          };
          metadata.research = { status: "done", fetchedAt };
          outcome = "done";
        } else {
          metadata.research = { status: "failed", fetchedAt, error: "Сторінка не віддала ні назви, ні картинки." };
        }
      } catch (error) {
        // Один упертий сайт не має валити решту черги.
        metadata.research = {
          status: "failed",
          fetchedAt,
          error: error instanceof Error ? error.message : "Не вдалося прочитати сторінку.",
        };
      }
    }

    const { error: updateError } = await userClient
      .schema("tosho")
      .from("quote_items")
      .update({ metadata } as never)
      .eq("id", item.id)
      .eq("quote_id", body.quoteId);
    if (updateError) {
      console.error("quote-import-research: metadata update failed", updateError.message);
      outcomes.push("not_saved");
      continue;
    }
    outcomes.push(outcome);
  }

  const count = (value: string) => outcomes.filter((entry) => entry === value).length;

  return jsonResponse(200, {
    researched: count("done"),
    skipped: count("skipped"),
    failed: count("failed"),
    notSaved: count("not_saved"),
    total: items.length,
  });
};
