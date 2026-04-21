import { getSignedAttachmentUrl } from "@/lib/attachmentPreview";
import { supabase } from "@/lib/supabaseClient";

export type StoredDesignOutputKind = "visualization" | "layout";

export type StoredDesignOutputFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  group_label?: string | null;
  output_kind?: StoredDesignOutputKind | null;
};

const isStoredDesignOutputKind = (value: unknown): value is StoredDesignOutputKind =>
  value === "visualization" || value === "layout";

const toMetadataRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
};

const toUploadedFilesArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
};

const getFileKey = (file: Pick<StoredDesignOutputFile, "storage_bucket" | "storage_path">) =>
  `${file.storage_bucket}:${file.storage_path}`;

export function parseStoredDesignOutputFiles(
  value: unknown,
  fallbackKind?: StoredDesignOutputKind | null
): StoredDesignOutputFile[] {
  if (!Array.isArray(value)) return [];

  const seenKeys = new Set<string>();

  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const entry = row as Record<string, unknown>;
      const fileName = typeof entry.file_name === "string" && entry.file_name.trim() ? entry.file_name.trim() : null;
      const storageBucket =
        typeof entry.storage_bucket === "string" && entry.storage_bucket.trim() ? entry.storage_bucket.trim() : null;
      const storagePath =
        typeof entry.storage_path === "string" && entry.storage_path.trim() ? entry.storage_path.trim() : null;
      if (!fileName || !storageBucket || !storagePath) return null;

      const nextFile: StoredDesignOutputFile = {
        id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
        file_name: fileName,
        file_size: entry.file_size == null ? null : Number(entry.file_size),
        mime_type: typeof entry.mime_type === "string" ? entry.mime_type : null,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        uploaded_by: typeof entry.uploaded_by === "string" ? entry.uploaded_by : null,
        created_at: typeof entry.created_at === "string" && entry.created_at ? entry.created_at : new Date().toISOString(),
        group_label: typeof entry.group_label === "string" && entry.group_label.trim() ? entry.group_label.trim() : null,
        output_kind: isStoredDesignOutputKind(entry.output_kind) ? entry.output_kind : fallbackKind ?? null,
      };

      const key = getFileKey(nextFile);
      if (seenKeys.has(key)) return null;
      seenKeys.add(key);
      return nextFile;
    })
    .filter(Boolean) as StoredDesignOutputFile[];
}

export function serializeStoredDesignOutputFiles(files: StoredDesignOutputFile[]) {
  return files.map((file) => ({
    id: file.id,
    file_name: file.file_name,
    file_size: file.file_size,
    mime_type: file.mime_type,
    storage_bucket: file.storage_bucket,
    storage_path: file.storage_path,
    uploaded_by: file.uploaded_by,
    created_at: file.created_at,
    group_label: file.group_label ?? null,
    output_kind: file.output_kind ?? null,
  }));
}

export async function syncDesignOutputFilesToQuoteAttachments(params: {
  teamId: string;
  quoteId: string;
  files: StoredDesignOutputFile[];
  fallbackUploadedBy?: string | null;
}) {
  const uniqueFiles = parseStoredDesignOutputFiles(params.files);
  if (uniqueFiles.length === 0) return 0;

  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_attachments")
    .select("storage_bucket,storage_path")
    .eq("quote_id", params.quoteId);
  if (error) throw error;

  const existingKeys = new Set(
    ((data as Array<{ storage_bucket?: string | null; storage_path?: string | null }> | null) ?? [])
      .map((row) =>
        typeof row.storage_bucket === "string" && typeof row.storage_path === "string"
          ? `${row.storage_bucket}:${row.storage_path}`
          : null
      )
      .filter((value): value is string => Boolean(value))
  );

  const rowsToInsert = uniqueFiles
    .filter((file) => !existingKeys.has(getFileKey(file)))
    .map((file) => ({
      team_id: params.teamId,
      quote_id: params.quoteId,
      file_name: file.file_name,
      mime_type: file.mime_type || null,
      file_size: file.file_size,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: file.uploaded_by ?? params.fallbackUploadedBy ?? null,
    }));

  if (rowsToInsert.length === 0) return 0;

  const { error: insertError } = await supabase.schema("tosho").from("quote_attachments").insert(rowsToInsert);
  if (insertError) throw insertError;

  return rowsToInsert.length;
}

export async function recoverDesignOutputFilesFromHistory(designTaskId: string) {
  const { data, error } = await supabase
    .from("activity_log")
    .select("created_at,user_id,metadata")
    .eq("entity_type", "design_task")
    .eq("entity_id", designTaskId)
    .eq("action", "design_output_upload")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const candidates = ((data as Array<{ created_at?: string | null; user_id?: string | null; metadata?: unknown }> | null) ?? [])
    .flatMap((row) => {
      const metadata = toMetadataRecord(row.metadata);
      const outputKind = isStoredDesignOutputKind(metadata.output_kind) ? metadata.output_kind : null;
      return toUploadedFilesArray(metadata.uploaded_files).map((entry) => {
        const fileName = typeof entry.file_name === "string" && entry.file_name.trim() ? entry.file_name.trim() : null;
        const storageBucket =
          typeof entry.storage_bucket === "string" && entry.storage_bucket.trim() ? entry.storage_bucket.trim() : null;
        const storagePath =
          typeof entry.storage_path === "string" && entry.storage_path.trim() ? entry.storage_path.trim() : null;
        if (!fileName || !storageBucket || !storagePath) return null;
        return {
          id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : crypto.randomUUID(),
          file_name: fileName,
          file_size: entry.file_size == null ? null : Number(entry.file_size),
          mime_type: typeof entry.mime_type === "string" ? entry.mime_type : null,
          storage_bucket: storageBucket,
          storage_path: storagePath,
          uploaded_by: typeof row.user_id === "string" ? row.user_id : null,
          created_at: typeof row.created_at === "string" && row.created_at ? row.created_at : new Date().toISOString(),
          group_label: typeof entry.group_label === "string" && entry.group_label.trim() ? entry.group_label.trim() : null,
          output_kind: outputKind,
        } satisfies StoredDesignOutputFile;
      });
    })
    .filter(Boolean) as StoredDesignOutputFile[];

  const uniqueCandidates = parseStoredDesignOutputFiles(candidates);
  if (uniqueCandidates.length === 0) return [];

  const verifiedFiles = await Promise.all(
    uniqueCandidates.map(async (file) => {
      const signedUrl = await getSignedAttachmentUrl(file.storage_bucket, file.storage_path, "original", 120);
      return signedUrl ? file : null;
    })
  );

  return verifiedFiles.filter(Boolean) as StoredDesignOutputFile[];
}
