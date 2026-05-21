-- Remove ghost entries from public.activity_log metadata.design_output_files
-- where the referenced storage object no longer exists.
--
-- Ghosts originate from recoverDesignOutputFilesFromHistory restoring a deleted
-- file because createSignedUrl could be observed as "ok" during a delete race.
-- After the source fix this script should be idempotent (no rows changed).

BEGIN;

WITH affected AS (
  SELECT
    al.id,
    al.metadata,
    COALESCE(
      (
        SELECT jsonb_agg(f)
        FROM jsonb_array_elements(al.metadata->'design_output_files') f
        WHERE EXISTS (
          SELECT 1 FROM storage.objects o
          WHERE o.bucket_id = f->>'storage_bucket'
            AND o.name = f->>'storage_path'
        )
      ),
      '[]'::jsonb
    ) AS new_files,
    jsonb_array_length(al.metadata->'design_output_files') AS old_count
  FROM public.activity_log al
  WHERE al.action = 'design_task'
    AND jsonb_array_length(COALESCE(al.metadata->'design_output_files', '[]'::jsonb)) > 0
)
UPDATE public.activity_log al
SET metadata = jsonb_set(al.metadata, '{design_output_files}', a.new_files)
FROM affected a
WHERE al.id = a.id
  AND jsonb_array_length(a.new_files) <> a.old_count
RETURNING
  al.id,
  al.metadata->>'design_task_number' AS design_task_number,
  jsonb_array_length(al.metadata->'design_output_files') AS files_now;

COMMIT;
