import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderFirstPagePreviewFiles } from "../../scripts/attachment-preview-renderer.mjs";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type RequestBody = {
  bucket?: string;
  storagePath?: string;
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

function getVariantPath(storagePath: string, variant: "thumb" | "preview") {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  const basename = match?.[1] ?? storagePath;
  return `${basename}__${variant}.png`;
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

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const bucket = (payload.bucket ?? "").trim();
  const storagePath = (payload.storagePath ?? "").trim();
  if (!bucket || !storagePath) {
    return jsonResponse(400, { error: "Missing bucket or storagePath" });
  }

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

  const extension = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "tif", "tiff"].includes(extension)) {
    return jsonResponse(200, { success: true, skipped: true, reason: "unsupported-extension" });
  }

  const { data: fileBlob, error: downloadError } = await adminClient.storage.from(bucket).download(storagePath);
  if (downloadError || !fileBlob) {
    return jsonResponse(404, { error: "Failed to download source file" });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attachment-preview-src-"));
  const inputPath = path.join(tempDir, path.basename(storagePath));
  try {
    await fs.writeFile(inputPath, Buffer.from(await fileBlob.arrayBuffer()));
    const { previewBuffer, thumbBuffer, contentType } = await renderFirstPagePreviewFiles(inputPath);

    const previewPath = getVariantPath(storagePath, "preview");
    const thumbPath = getVariantPath(storagePath, "thumb");

    const [{ error: previewError }, { error: thumbError }] = await Promise.all([
      adminClient.storage.from(bucket).upload(previewPath, previewBuffer, {
        upsert: true,
        contentType,
        cacheControl: "31536000, immutable",
      }),
      adminClient.storage.from(bucket).upload(thumbPath, thumbBuffer, {
        upsert: true,
        contentType,
        cacheControl: "31536000, immutable",
      }),
    ]);

    if (previewError) throw previewError;
    if (thumbError) throw thumbError;

    return jsonResponse(200, {
      success: true,
      bucket,
      storagePath,
      previewPath,
      thumbPath,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Failed to generate preview",
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
