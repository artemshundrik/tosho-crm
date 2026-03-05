#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd pg_restore
require_cmd tar

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-archive.tar.gz>" >&2
  exit 1
fi

ARCHIVE_PATH="$1"
if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

TARGET_DB_URL="${TARGET_DB_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "${TARGET_DB_URL}" ]]; then
  echo "Set TARGET_DB_URL (or SUPABASE_DB_URL) before restore." >&2
  exit 1
fi

if [[ "${RESTORE_CONFIRM:-}" != "YES" ]]; then
  echo "Restore is destructive. Set RESTORE_CONFIRM=YES to proceed." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "Extracting backup..."
tar -xzf "${ARCHIVE_PATH}" -C "${TMP_DIR}"

DUMP_PATH="$(find "${TMP_DIR}" -type f -name 'postgres.dump' | head -n 1)"
if [[ -z "${DUMP_PATH}" ]]; then
  echo "postgres.dump not found in archive." >&2
  exit 1
fi

echo "Restoring database..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "${TARGET_DB_URL}" \
  "${DUMP_PATH}"

echo "Database restore completed."

# Optional storage restore (disabled by default).
# Requires:
# RESTORE_STORAGE=1
# STORAGE_S3_ENDPOINT, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY
if [[ "${RESTORE_STORAGE:-0}" == "1" ]]; then
  require_cmd aws
  echo "Restoring storage buckets..."
  export AWS_ACCESS_KEY_ID="${STORAGE_S3_ACCESS_KEY_ID:?Missing STORAGE_S3_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${STORAGE_S3_SECRET_ACCESS_KEY:?Missing STORAGE_S3_SECRET_ACCESS_KEY}"
  export AWS_EC2_METADATA_DISABLED=true

  while IFS= read -r -d '' bucket_dir; do
    bucket="$(basename "${bucket_dir}")"
    echo "  - ${bucket}"
    aws --endpoint-url "${STORAGE_S3_ENDPOINT:?Missing STORAGE_S3_ENDPOINT}" s3 sync "${bucket_dir}" "s3://${bucket}" --only-show-errors
  done < <(find "${TMP_DIR}" -type d -path '*/storage/*' -mindepth 2 -maxdepth 2 -print0)

  echo "Storage restore completed."
fi
