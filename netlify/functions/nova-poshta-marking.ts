import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient } from "@supabase/supabase-js";

// Друк маркування (наліпки 100×100) для вже створеної ТТН.
//
// ЧОМУ ОКРЕМА ФУНКЦІЯ, А НЕ nova-poshta.ts: друк у НП живе не на JSON-API, а на
// my.novaposhta.ua, і ключ передається ПРЯМО В URL. Тобто посилання не можна
// віддати у фронт — воно саме є секретом. Тому тягнемо PDF тут і повертаємо
// байти; ключ не залишає сервер.
//
// Формат: /orders/printMarking100x100/orders[]=<ref>/type/pdf/apiKey/<key>

const PRINT_BASE = "https://my.novaposhta.ua/orders";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
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

const resolveWorkspaceId = async (
  userClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> => {
  for (const rpcName of ["my_workspace_id", "current_workspace_id"] as const) {
    const { data, error } = await userClient.schema("tosho").rpc(rpcName);
    if (!error && data) return data as string;
  }
  const { data } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();
  return data?.workspace_id ?? null;
};

/** Форма запиту — і перевірка, і тип (REQ-137). Формат ref дожимає UUID_RE нижче. */
const requestSchema = z.object({ ref: z.string().optional() }).strict();

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  // Авторизація першою — неавторизованому не розкриваємо навіть стан конфігу.
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  const workspaceId = await resolveWorkspaceId(userClient, userData.user.id);
  if (!workspaceId) return jsonResponse(403, { error: "Workspace not found" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const payload = parsed.data;

  // Ref підставляється в URL, тож формат перевіряємо суворо — жодних скісних
  // рисок і крапок, інакше можна було б увести шлях у запит до my.novaposhta.ua.
  const ref = (payload.ref ?? "").trim();
  if (!UUID_RE.test(ref)) return jsonResponse(400, { error: "Invalid document ref" });

  // Ref має належати замовленню, яке цей користувач і так бачить. Запит іде
  // КЛІЄНТОМ КОРИСТУВАЧА, тож RLS сама відсіює чужі команди: без цієї перевірки
  // будь-який залогінений міг би роздрукувати наліпку з ПІБ, телефоном і адресою
  // отримувача за чужою ТТН, знаючи лише її ref.
  const { data: orderRow } = await userClient
    .schema("tosho")
    .from("orders")
    .select("id")
    .eq("np_ttn_ref", ref)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!orderRow) return jsonResponse(404, { error: "ТТН не знайдена серед ваших замовлень" });

  const npApiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!npApiKey) return jsonResponse(500, { error: "Nova Poshta API key is not configured" });

  try {
    const printUrl = `${PRINT_BASE}/printMarking100x100/orders[]=${ref}/type/pdf/apiKey/${npApiKey}`;
    const npResponse = await fetch(printUrl);
    if (!npResponse.ok) {
      return jsonResponse(502, { error: `Нова Пошта не віддала маркування (${npResponse.status})` });
    }

    const contentType = npResponse.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await npResponse.arrayBuffer());
    // На помилку НП відповідає HTML-сторінкою зі статусом 200 — віддавати її як
    // PDF не можна, бо у вкладці відкриється порожнеча без пояснення.
    if (!contentType.includes("pdf") && buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
      return jsonResponse(502, { error: "Нова Пошта повернула не PDF — перевір, чи ТТН ще існує" });
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="marking-${ref}.pdf"`,
        "Cache-Control": "no-store",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch {
    // Повідомлення помилки НАЗОВНІ не віддаємо: у цьому запиті URL містить ключ
    // НП, і будь-який текст, що його зачепив би, злив би ключ у браузер.
    return jsonResponse(502, { error: "Не вдалося отримати маркування від Нової Пошти" });
  }
};

export default handler;
