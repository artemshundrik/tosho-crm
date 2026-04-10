import { dropboxService } from "./_lib/dropbox.service";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
};

type ExportFilePayload = {
  sourceUrl?: string;
  targetPath?: string;
  sourceFileId?: string;
  fileName?: string;
  outputKind?: string;
  role?: string;
};

type RequestPayload = {
  projectPath?: string;
  files?: ExportFilePayload[];
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function readPayload(event: HttpEvent): RequestPayload {
  try {
    return JSON.parse(event.body ?? "{}") as RequestPayload;
  } catch {
    return {};
  }
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const payload = readPayload(event);
  const projectPath = payload.projectPath?.trim();
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (!projectPath) return jsonResponse(400, { error: "projectPath is required" });
  if (files.length === 0) return jsonResponse(400, { error: "files are required" });

  try {
    await Promise.all([
      dropboxService.createFolder(dropboxService.joinDropboxPath(projectPath, "Фінал")),
      dropboxService.createFolder(dropboxService.joinDropboxPath(projectPath, "Архів")),
    ]);

    const uploaded = [];
    for (const file of files) {
      const sourceUrl = file.sourceUrl?.trim();
      const targetPath = file.targetPath?.trim();
      if (!sourceUrl || !targetPath) continue;

      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Не вдалося отримати файл для експорту: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const metadata = await dropboxService.uploadFile(Buffer.from(arrayBuffer), targetPath);
      const sharedLink = await dropboxService.getOrCreateSharedLink(targetPath);
      uploaded.push({
        sourceFileId: file.sourceFileId ?? null,
        fileName: file.fileName ?? metadata.name ?? null,
        outputKind: file.outputKind ?? null,
        role: file.role ?? null,
        dropboxPath: metadata.path_display ?? targetPath,
        dropboxSharedUrl: sharedLink.url,
      });
    }

    const folderSharedLink = await dropboxService.getOrCreateSharedLink(projectPath);

    return jsonResponse(200, {
      ok: true,
      projectPath,
      projectSharedUrl: folderSharedLink.url,
      uploaded,
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Dropbox export error",
      status: typeof error === "object" && error && "status" in error ? (error as { status?: number }).status ?? null : null,
      details: typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details ?? null : null,
    });
  }
};
