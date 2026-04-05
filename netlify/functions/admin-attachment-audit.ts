import { createClient } from "@supabase/supabase-js";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type RequestBody = {
  workspaceId?: string;
};

type AuditRow = {
  path: string;
  sizeBytes: number;
  fileName: string;
  extension: string | null;
  previewable: boolean;
  entityKind: "design_task" | "quote" | "unknown";
  entityId: string | null;
  entityExists: boolean;
  route: string | null;
  hint: string;
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

function canonicalizeStoragePath(storagePath: string | null | undefined) {
  const normalizedPath = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!normalizedPath) return "";
  if (normalizedPath.startsWith("teams/")) return normalizedPath;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(normalizedPath)) {
    return `teams/${normalizedPath}`;
  }
  return normalizedPath;
}

function isPreviewable(path: string, fileName = "", mimeType = "") {
  const lowerPath = path.toLowerCase();
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  return (
    /\.(pdf|tif|tiff|png|jpg|jpeg|webp|gif|bmp)$/i.test(lowerPath) ||
    /\.(pdf|tif|tiff|png|jpg|jpeg|webp|gif|bmp)$/i.test(lowerName) ||
    [
      "application/pdf",
      "image/tiff",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/bmp",
    ].includes(lowerMime)
  );
}

function buildKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

function parseEntityFromPath(path: string) {
  const parts = path.split("/");
  const category = parts[2] ?? "";
  const rawEntityId = parts[3] ?? "";
  if (category === "quote-attachments" && rawEntityId) {
    return { entityKind: "quote" as const, entityId: rawEntityId, route: `/orders/estimates/${rawEntityId}` };
  }
  if (category === "design-briefs" || category === "design-brief-files" || category === "design-outputs") {
    const entityId = rawEntityId.startsWith("standalone-") ? rawEntityId.slice("standalone-".length) : rawEntityId;
    if (entityId) {
      return { entityKind: "design_task" as const, entityId, route: `/design/${entityId}` };
    }
  }
  return { entityKind: "unknown" as const, entityId: null, route: null };
}

async function listAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
) {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
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

  const workspaceId = (payload.workspaceId ?? "").trim();
  if (!workspaceId) return jsonResponse(400, { error: "Missing workspaceId" });

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

  const actorId = userData.user.id;

  const { data: membership, error: membershipError } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", actorId)
    .maybeSingle();
  if (membershipError) return jsonResponse(500, { error: "Failed to verify workspace access" });
  if ((membership?.access_role ?? "") !== "owner") {
    return jsonResponse(403, { error: "Only workspace owners can view attachment audit" });
  }

  const { data: teamMember, error: teamMemberError } = await adminClient
    .from("team_members")
    .select("team_id")
    .eq("user_id", actorId)
    .limit(1)
    .maybeSingle();
  if (teamMemberError) return jsonResponse(500, { error: "Failed to resolve team id" });
  const effectiveTeamId = teamMember?.team_id;
  if (!effectiveTeamId) return jsonResponse(404, { error: "No operational team found for this workspace" });

  const quoteAttachmentRows = await listAllRows((from, to) =>
    adminClient
      .schema("tosho")
      .from("quote_attachments")
      .select("storage_bucket,storage_path,file_name,mime_type")
      .eq("team_id", effectiveTeamId)
      .eq("storage_bucket", "attachments")
      .range(from, to)
  );

  const activityRows = await listAllRows((from, to) =>
    adminClient
      .from("activity_log")
      .select("metadata")
      .eq("team_id", effectiveTeamId)
      .eq("action", "design_task")
      .range(from, to)
  );

  const referencedOriginals = new Set<string>();
  const addSource = (bucket: string | null | undefined, path: string | null | undefined, fileName = "", mimeType = "") => {
    if ((bucket ?? "") !== "attachments") return;
    const canonicalPath = canonicalizeStoragePath(path);
    if (!canonicalPath) return;
    if (canonicalPath.includes("__thumb.") || canonicalPath.includes("__preview.")) return;
    if (!isPreviewable(canonicalPath, fileName, mimeType)) return;
    referencedOriginals.add(canonicalPath);
  };

  for (const row of quoteAttachmentRows) {
    addSource(row.storage_bucket, row.storage_path, row.file_name ?? "", row.mime_type ?? "");
  }

  for (const row of activityRows) {
    const metadata = row?.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null;
    const standaloneBriefFiles = Array.isArray(metadata?.standalone_brief_files) ? metadata.standalone_brief_files : [];
    const designOutputFiles = Array.isArray(metadata?.design_output_files) ? metadata.design_output_files : [];
    for (const entry of [...standaloneBriefFiles, ...designOutputFiles]) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      addSource(
        typeof item.storage_bucket === "string" ? item.storage_bucket : null,
        typeof item.storage_path === "string" ? item.storage_path : null,
        typeof item.file_name === "string" ? item.file_name : "",
        typeof item.mime_type === "string" ? item.mime_type : ""
      );
    }
    addSource(
      typeof metadata?.selected_design_output_storage_bucket === "string" ? metadata.selected_design_output_storage_bucket : null,
      typeof metadata?.selected_design_output_storage_path === "string" ? metadata.selected_design_output_storage_path : null,
      typeof metadata?.selected_design_output_file_name === "string" ? metadata.selected_design_output_file_name : "",
      typeof metadata?.selected_design_output_mime_type === "string" ? metadata.selected_design_output_mime_type : ""
    );
    addSource(
      typeof metadata?.selected_visual_output_storage_bucket === "string" ? metadata.selected_visual_output_storage_bucket : null,
      typeof metadata?.selected_visual_output_storage_path === "string" ? metadata.selected_visual_output_storage_path : null,
      typeof metadata?.selected_visual_output_file_name === "string" ? metadata.selected_visual_output_file_name : "",
      typeof metadata?.selected_visual_output_mime_type === "string" ? metadata.selected_visual_output_mime_type : ""
    );
    addSource(
      typeof metadata?.selected_layout_output_storage_bucket === "string" ? metadata.selected_layout_output_storage_bucket : null,
      typeof metadata?.selected_layout_output_storage_path === "string" ? metadata.selected_layout_output_storage_path : null,
      typeof metadata?.selected_layout_output_file_name === "string" ? metadata.selected_layout_output_file_name : "",
      typeof metadata?.selected_layout_output_mime_type === "string" ? metadata.selected_layout_output_mime_type : ""
    );
  }

  const storageRows = await listAllRows((from, to) =>
    adminClient
      .schema("storage")
      .from("objects")
      .select("name,metadata")
      .eq("bucket_id", "attachments")
      .like("name", `teams/${effectiveTeamId}/%`)
      .range(from, to)
  );

  const originals = storageRows
    .map((row) => {
      const name = canonicalizeStoragePath((row as { name?: string | null }).name);
      const sizeBytes = Number((row as { metadata?: Record<string, unknown> | null }).metadata?.size ?? 0) || 0;
      return { name, sizeBytes };
    })
    .filter((row) => row.name && !row.name.toLowerCase().includes("__thumb.") && !row.name.toLowerCase().includes("__preview."));

  const orphanRows = originals.filter((row) => !referencedOriginals.has(row.name));

  const entityMap = new Map<string, ReturnType<typeof parseEntityFromPath>>();
  for (const row of orphanRows) {
    entityMap.set(row.name, parseEntityFromPath(row.name));
  }

  const quoteIds = Array.from(
    new Set(Array.from(entityMap.values()).filter((row) => row.entityKind === "quote" && row.entityId).map((row) => row.entityId as string))
  );
  const designTaskIds = Array.from(
    new Set(Array.from(entityMap.values()).filter((row) => row.entityKind === "design_task" && row.entityId).map((row) => row.entityId as string))
  );

  const quoteExists = new Set<string>();
  if (quoteIds.length > 0) {
    const quoteRows = await listAllRows((from, to) =>
      adminClient
        .schema("tosho")
        .from("quotes")
        .select("id")
        .eq("team_id", effectiveTeamId)
        .in("id", quoteIds)
        .range(from, to)
    );
    quoteRows.forEach((row) => {
      if (typeof row.id === "string") quoteExists.add(row.id);
    });
  }

  const designTaskExists = new Set<string>();
  if (designTaskIds.length > 0) {
    const taskRows = await listAllRows((from, to) =>
      adminClient
        .from("activity_log")
        .select("id")
        .eq("team_id", effectiveTeamId)
        .eq("action", "design_task")
        .in("id", designTaskIds)
        .range(from, to)
    );
    taskRows.forEach((row) => {
      if (typeof row.id === "string") designTaskExists.add(row.id);
    });
  }

  const rows: AuditRow[] = orphanRows
    .map((row) => {
      const parsed = entityMap.get(row.name) ?? parseEntityFromPath(row.name);
      const fileName = row.name.split("/").pop() ?? row.name;
      const extensionMatch = fileName.match(/\.([^.]+)$/);
      const extension = extensionMatch?.[1]?.toLowerCase() ?? null;
      const entityExists =
        parsed.entityKind === "quote"
          ? !!parsed.entityId && quoteExists.has(parsed.entityId)
          : parsed.entityKind === "design_task"
            ? !!parsed.entityId && designTaskExists.has(parsed.entityId)
            : false;
      const previewable = isPreviewable(row.name, fileName, "");
      return {
        path: row.name,
        sizeBytes: row.sizeBytes,
        fileName,
        extension,
        previewable,
        entityKind: parsed.entityKind,
        entityId: parsed.entityId,
        entityExists,
        route: entityExists ? parsed.route : null,
        hint:
          parsed.entityKind === "unknown"
            ? "Тип джерела не розпізнано."
            : entityExists
              ? "Сутність ще існує. Потрібна ручна перевірка."
              : "Сутність не знайдена. Кандидат на видалення після перевірки.",
      };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return jsonResponse(200, {
    workspaceId,
    effectiveTeamId,
    count: rows.length,
    totalBytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
    rows,
  });
};
