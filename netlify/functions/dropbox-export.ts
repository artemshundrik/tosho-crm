import { createClient } from "@supabase/supabase-js";
import { dropboxService } from "./_lib/dropbox.service";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type ExportFilePayload = {
  sourceUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  targetPath?: string;
  sourceFileId?: string;
  fileName?: string;
  outputKind?: string;
  role?: string;
};

type RequestPayload = {
  teamId?: string;
  taskId?: string;
  projectPath?: string;
  files?: ExportFilePayload[];
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  const teamId = payload.teamId?.trim();
  const taskId = payload.taskId?.trim();
  const projectPath = payload.projectPath?.trim();
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (!teamId || !taskId) return jsonResponse(400, { error: "teamId and taskId are required" });
  if (!projectPath) return jsonResponse(400, { error: "projectPath is required" });
  if (files.length === 0) return jsonResponse(400, { error: "files are required" });

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

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const { data: taskRow, error: taskError } = await userClient
    .from("activity_log")
    .select("id,team_id,action,metadata")
    .eq("id", taskId)
    .eq("team_id", teamId)
    .eq("action", "design_task")
    .maybeSingle<{ id: string; team_id: string; action: string; metadata?: Record<string, unknown> | null }>();
  if (taskError) return jsonResponse(500, { error: taskError.message });
  if (!taskRow?.id) return jsonResponse(403, { error: "Forbidden" });

  const designOutputFiles = Array.isArray(taskRow.metadata?.design_output_files)
    ? taskRow.metadata.design_output_files
    : [];
  const allowedFileKeys = new Set(
    designOutputFiles
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const record = entry as Record<string, unknown>;
        const bucket = typeof record.storage_bucket === "string" ? record.storage_bucket.trim() : "";
        const path = typeof record.storage_path === "string" ? record.storage_path.trim() : "";
        return bucket && path ? `${bucket}:${path}` : "";
      })
      .filter(Boolean)
  );

  try {
    const finalFolderPath = dropboxService.joinDropboxPath(projectPath, "Фінал");
    const archiveFolderPath = dropboxService.joinDropboxPath(projectPath, "Архів");
    await Promise.all([
      dropboxService.createFolder(finalFolderPath),
      dropboxService.createFolder(archiveFolderPath),
    ]);

    const desiredFinalPaths = new Set(
      files
        .filter((file) => file.role === "final")
        .map((file) => file.targetPath?.trim())
        .filter((value): value is string => !!value)
    );

    try {
      const existingFinalEntries = await dropboxService.listFolder(finalFolderPath);
      const staleFinalEntries = existingFinalEntries.entries.filter((entry) => {
        if (entry[".tag"] !== "file") return false;
        const path = typeof entry.path_display === "string" ? entry.path_display.trim() : "";
        return !!path && !desiredFinalPaths.has(path);
      });
      for (const entry of staleFinalEntries) {
        if (!entry.path_display) continue;
        await dropboxService.deleteFile(entry.path_display);
      }
    } catch {
      // Do not fail the whole export if final-folder cleanup could not be completed.
    }

    const uploaded = [];
    for (const file of files) {
      const sourceUrl = file.sourceUrl?.trim();
      const storageBucket = file.storageBucket?.trim();
      const storagePath = file.storagePath?.trim();
      const targetPath = file.targetPath?.trim();
      if (!targetPath) continue;

      let buffer: Buffer | null = null;
      if (storageBucket && storagePath) {
        if (!allowedFileKeys.has(`${storageBucket}:${storagePath}`)) {
          throw new Error("Файл не належить до цієї дизайн-задачі.");
        }
        const { data: fileBlob, error: downloadError } = await adminClient.storage
          .from(storageBucket)
          .download(storagePath);
        if (downloadError || !fileBlob) {
          throw new Error(`Не вдалося отримати файл для експорту: ${downloadError?.message ?? "storage download failed"}`);
        }
        buffer = Buffer.from(await fileBlob.arrayBuffer());
      } else if (sourceUrl) {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`Не вдалося отримати файл для експорту: HTTP ${response.status}`);
        }
        buffer = Buffer.from(await response.arrayBuffer());
      }

      if (!buffer) {
        throw new Error("Не вдалося отримати файл для експорту.");
      }

      const metadata = await dropboxService.uploadFile(buffer, targetPath, { overwrite: true });
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
