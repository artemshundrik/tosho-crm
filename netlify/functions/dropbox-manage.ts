import { createClient } from "@supabase/supabase-js";
import { dropboxService } from "./_lib/dropbox.service";
import { collectDropboxHealth } from "./_lib/dropboxHealth";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined> | null;
  queryStringParameters?: Record<string, string | undefined> | null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

type RequestPayload = {
  action?: string;
  clientName?: string;
  clientPath?: string;
  projectName?: string;
  path?: string;
};

function readPayload(event: HttpEvent): RequestPayload {
  if (event.httpMethod === "GET") {
    return {
      action: event.queryStringParameters?.action,
      clientName: event.queryStringParameters?.clientName,
      clientPath: event.queryStringParameters?.clientPath,
      projectName: event.queryStringParameters?.projectName,
      path: event.queryStringParameters?.path,
    };
  }

  try {
    return JSON.parse(event.body ?? "{}") as RequestPayload;
  } catch {
    return {};
  }
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // Auth: any signed-in member may inspect/create Dropbox folders for their work.
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!token) {
    return jsonResponse(401, { error: "Unauthorized" });
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const payload = readPayload(event);
  const action = payload.action?.trim() || "inspect";

  try {
    /**
     * Стан зв'язку CRM ↔ Dropbox для картки в Observability.
     *
     * Лише власнику, на відміну від решти дій: у звіті перелічені назви всіх
     * замовників і лідів разом із тим, у кого тека загубилась. Решта дій цієї
     * функції працюють зі своїм клієнтом і такого зрізу не дають.
     *
     * Рахуємо службовим ключем: перевірка має бачити ВСІ картки, інакше
     * «прив'язок без теки» буде рівно стільки, скільки бачить конкретний
     * користувач, і звіт брехатиме.
     */
    if (action === "health") {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) return jsonResponse(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

      const { data: membership } = await admin
        .schema("tosho")
        .from("memberships_view")
        .select("access_role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if ((membership?.access_role ?? "").trim().toLowerCase() !== "owner") {
        return jsonResponse(403, { error: "Forbidden" });
      }

      const health = await collectDropboxHealth(admin as never, { verifyLinks: true });
      return jsonResponse(200, { ok: true, action, health });
    }

    /**
     * Скільки місця зайнято й скільки оплачено. Свідомо БЕЗ owner-гейта і без
     * службового ключа: це квота спільного акаунта компанії, а не чиїсь дані,
     * і один HTTP-запит до Dropbox — не та вартість, заради якої варто ще раз
     * ходити в базу по роль.
     */
    if (action === "space") {
      const space = await dropboxService.getSpaceUsage();
      return jsonResponse(200, { ok: true, action, space });
    }

    if (action === "create-client") {
      const clientName = payload.clientName?.trim();
      if (!clientName) return jsonResponse(400, { error: "clientName is required" });

      const created = await dropboxService.createClientFolder(clientName);
      const [clientFolder, clientSharedLink] = await Promise.all([
        dropboxService.listFolder(created.clientPath),
        dropboxService.getOrCreateSharedLink(created.clientPath),
      ]);

      return jsonResponse(200, {
        ok: true,
        action,
        ...created,
        clientSharedUrl: clientSharedLink.url,
        entries: clientFolder.entries.map((entry) => ({
          tag: entry[".tag"] ?? null,
          id: entry.id ?? null,
          name: entry.name ?? null,
          path_display: entry.path_display ?? null,
        })),
      });
    }

    // Посилання на теку «Бренд» замовника — матеріали ВІД клієнта (брендбук,
    // лого, шрифти). Тека створюється разом із клієнтською, але у старих
    // замовників її могло не бути, тож перед видачею посилання переконуємось,
    // що вона існує: createFolder ідемпотентний.
    if (action === "brand-link") {
      const clientPath = payload.clientPath?.trim();
      const clientName = payload.clientName?.trim();
      if (!clientPath && !clientName) {
        return jsonResponse(400, { error: "clientPath or clientName is required" });
      }

      const basePath = clientPath || (await dropboxService.createClientFolder(clientName as string)).clientPath;
      const brandPath = dropboxService.joinDropboxPath(basePath, "Бренд");
      await dropboxService.createFolder(brandPath);
      const brandSharedLink = await dropboxService.getOrCreateSharedLink(brandPath);

      return jsonResponse(200, {
        ok: true,
        action,
        clientPath: basePath,
        brandPath,
        brandSharedUrl: brandSharedLink.url,
      });
    }

    if (action === "create-project") {
      const clientPath = payload.clientPath?.trim();
      const projectName = payload.projectName?.trim();
      if (!clientPath || !projectName) {
        return jsonResponse(400, { error: "clientPath and projectName are required" });
      }

      const created = await dropboxService.createProjectFolder(clientPath, projectName);
      const [projectFolder, projectSharedLink] = await Promise.all([
        dropboxService.listFolder(created.projectPath),
        dropboxService.getOrCreateSharedLink(created.projectPath),
      ]);

      return jsonResponse(200, {
        ok: true,
        action,
        ...created,
        projectSharedUrl: projectSharedLink.url,
        entries: projectFolder.entries.map((entry) => ({
          tag: entry[".tag"] ?? null,
          id: entry.id ?? null,
          name: entry.name ?? null,
          path_display: entry.path_display ?? null,
        })),
      });
    }

    const requestedPath = payload.path?.trim() || payload.clientPath?.trim() || "Tosho Team Folder/Замовники/LG";
    const [folder, sharedLink] = await Promise.all([
      dropboxService.listFolder(requestedPath),
      dropboxService.getOrCreateSharedLink(requestedPath),
    ]);

    return jsonResponse(200, {
      ok: true,
      action: "inspect",
      requestedPath,
      sharedUrl: sharedLink.url,
      entries: folder.entries.map((entry) => ({
        tag: entry[".tag"] ?? null,
        id: entry.id ?? null,
        name: entry.name ?? null,
        path_display: entry.path_display ?? null,
      })),
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      action,
      error: error instanceof Error ? error.message : "Unknown Dropbox error",
      status: typeof error === "object" && error && "status" in error ? (error as { status?: number }).status ?? null : null,
      details: typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details ?? null : null,
    });
  }
};
