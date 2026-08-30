/**
 * Файли-виходи дизайн-задачі: тип і розбір із metadata.
 *
 * Лежать у `activity_log.metadata.design_output_files` як довільний JSON, тож
 * читати їх без перевірок не можна — половина полів у старих записах відсутня,
 * а без `storage_bucket`/`storage_path` файл не показати й не завантажити.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. Розбір потрібен трьом читачам одразу: картці прорахунку
 * (візуали задачі), доборові кандидатів на привʼязку і перенесенню файлів у
 * вкладення. Поки він жив у тілі сторінки, кожен новий читач тягнув за собою
 * сторінку цілком.
 */

export type DesignOutputMetaFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

export const parseDesignOutputMetaFiles = (value: unknown): DesignOutputMetaFile[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const entry = row as Record<string, unknown>;
      const fileName = typeof entry.file_name === "string" && entry.file_name ? entry.file_name : null;
      const storageBucket =
        typeof entry.storage_bucket === "string" && entry.storage_bucket ? entry.storage_bucket : null;
      const storagePath = typeof entry.storage_path === "string" && entry.storage_path ? entry.storage_path : null;
      if (!fileName || !storageBucket || !storagePath) return null;
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
        file_name: fileName,
        file_size: entry.file_size == null ? null : Number(entry.file_size),
        mime_type: typeof entry.mime_type === "string" ? entry.mime_type : null,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        uploaded_by: typeof entry.uploaded_by === "string" ? entry.uploaded_by : null,
        created_at: typeof entry.created_at === "string" ? entry.created_at : new Date().toISOString(),
      } satisfies DesignOutputMetaFile;
    })
    .filter(Boolean) as DesignOutputMetaFile[];
};

const filterSelectedOutputIds = (value: unknown, removedIds: Set<string>) =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .filter((entry) => !removedIds.has(entry))
    : [];

const filterSelectedOutputLabels = (value: unknown, removedIds: Set<string>) => {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !removedIds.has(key))
  );
};

/**
 * Прибрати з метаданих задачі всі згадки видаленого файлу: сам файл зі списку,
 * його id зі списків обраного, підписи й розгорнуті поля обраного візуала та
 * макета. Пропустити хоч одне поле — і задача покаже «обрано» на файлі, якого
 * вже немає.
 */
export function removeDesignOutputReferencesFromMetadata(
  metadata: Record<string, unknown>,
  storageBucket: string,
  storagePath: string
) {
  const files = parseDesignOutputMetaFiles(metadata.design_output_files);
  const remainingFiles = files.filter(
    (file) => !(file.storage_bucket === storageBucket && file.storage_path === storagePath)
  );
  if (remainingFiles.length === files.length) return null;

  const removedIds = new Set(
    files
      .filter((file) => file.storage_bucket === storageBucket && file.storage_path === storagePath)
      .map((file) => file.id)
  );
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    design_output_files: remainingFiles.map((file) => ({
      id: file.id,
      file_name: file.file_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      uploaded_by: file.uploaded_by,
      created_at: file.created_at,
    })),
    selected_design_output_file_ids: filterSelectedOutputIds(metadata.selected_design_output_file_ids, removedIds),
    selected_visual_output_file_ids: filterSelectedOutputIds(metadata.selected_visual_output_file_ids, removedIds),
    selected_layout_output_file_ids: filterSelectedOutputIds(metadata.selected_layout_output_file_ids, removedIds),
    selected_visual_output_labels: filterSelectedOutputLabels(metadata.selected_visual_output_labels, removedIds),
    selected_layout_output_labels: filterSelectedOutputLabels(metadata.selected_layout_output_labels, removedIds),
  };

  if (
    metadata.selected_design_output_storage_bucket === storageBucket &&
    metadata.selected_design_output_storage_path === storagePath
  ) {
    nextMetadata.selected_design_output_file_id = null;
    nextMetadata.selected_design_output_file_name = null;
    nextMetadata.selected_design_output_storage_bucket = null;
    nextMetadata.selected_design_output_storage_path = null;
    nextMetadata.selected_design_output_mime_type = null;
    nextMetadata.selected_design_output_file_size = null;
    nextMetadata.selected_design_output_selected_at = null;
    nextMetadata.selected_design_output_selected_by = null;
    nextMetadata.selected_design_output_selected_by_label = null;
  }
  if (
    metadata.selected_visual_output_storage_bucket === storageBucket &&
    metadata.selected_visual_output_storage_path === storagePath
  ) {
    nextMetadata.selected_visual_output_file_id = null;
    nextMetadata.selected_visual_output_file_name = null;
    nextMetadata.selected_visual_output_storage_bucket = null;
    nextMetadata.selected_visual_output_storage_path = null;
    nextMetadata.selected_visual_output_mime_type = null;
    nextMetadata.selected_visual_output_file_size = null;
    nextMetadata.selected_visual_output_selected_at = null;
    nextMetadata.selected_visual_output_selected_by = null;
    nextMetadata.selected_visual_output_selected_by_label = null;
  }
  if (
    metadata.selected_layout_output_storage_bucket === storageBucket &&
    metadata.selected_layout_output_storage_path === storagePath
  ) {
    nextMetadata.selected_layout_output_file_id = null;
    nextMetadata.selected_layout_output_file_name = null;
    nextMetadata.selected_layout_output_storage_bucket = null;
    nextMetadata.selected_layout_output_storage_path = null;
    nextMetadata.selected_layout_output_mime_type = null;
    nextMetadata.selected_layout_output_file_size = null;
    nextMetadata.selected_layout_output_selected_at = null;
    nextMetadata.selected_layout_output_selected_by = null;
    nextMetadata.selected_layout_output_selected_by_label = null;
  }

  return nextMetadata;
}
