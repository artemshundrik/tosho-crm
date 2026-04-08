import { dropboxService } from "./_lib/dropbox.service";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
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

  const payload = readPayload(event);
  const action = payload.action?.trim() || "inspect";

  try {
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
