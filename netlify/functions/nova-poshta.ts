import { createClient } from "@supabase/supabase-js";

// Проксі до API Нової Пошти (Phase 1 — довідник адрес).
// Ключ NOVA_POSHTA_API_KEY живе лише тут, у серверних env, і НЕ потрапляє у фронт.
// Викликати може лише автентифікований учасник воркспейсу; методи — білий список.
//
// API-контракт (публічний v2.0): єдиний POST-ендпоінт, JSON-тіло
//   { apiKey, modelName, calledMethod, methodProperties }
//   відповідь: { success, data: [...], errors: [...], warnings, info }
// ⚠️ Форму відповіді (поля Ref/Description/...) звірити при першому живому виклику.

const NOVA_POSHTA_BASE = "https://api.novaposhta.ua/v2.0/json/";

// Білий список: лише читання довідника адрес. Жодних дій з ТТН/платежами.
const ALLOWED_METHODS: Record<string, string> = {
  searchSettlements: "Address",
  searchSettlementStreets: "Address",
  getWarehouses: "Address",
  getSettlementAreas: "Address",
};

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

type NovaPoshtaRequest = {
  calledMethod?: string;
  methodProperties?: Record<string, unknown>;
};

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const npApiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }
  if (!npApiKey) {
    return jsonResponse(500, { error: "Nova Poshta API key is not configured" });
  }

  // Авторизація: валідний JWT + учасник воркспейсу (як в інших приватних функціях).
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  const workspaceId = await resolveWorkspaceId(userClient, userData.user.id);
  if (!workspaceId) return jsonResponse(403, { error: "Workspace not found" });

  let payload: NovaPoshtaRequest;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const calledMethod = (payload.calledMethod ?? "").trim();
  const modelName = ALLOWED_METHODS[calledMethod];
  if (!modelName) {
    return jsonResponse(400, { error: `Method not allowed: ${calledMethod || "(empty)"}` });
  }

  try {
    const npResponse = await fetch(NOVA_POSHTA_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: npApiKey,
        modelName,
        calledMethod,
        methodProperties: payload.methodProperties ?? {},
      }),
    });

    const raw = (await npResponse.json().catch(() => null)) as
      | { success?: boolean; data?: unknown[]; errors?: unknown[]; warnings?: unknown[] }
      | null;

    if (!raw) {
      return jsonResponse(502, { error: "Nova Poshta returned an unreadable response" });
    }
    if (raw.success === false) {
      const message =
        Array.isArray(raw.errors) && raw.errors.length > 0
          ? String(raw.errors[0])
          : "Nova Poshta request failed";
      return jsonResponse(502, { error: message, errors: raw.errors ?? [] });
    }

    return jsonResponse(200, { data: Array.isArray(raw.data) ? raw.data : [] });
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : "Nova Poshta request failed",
    });
  }
};

export default handler;
