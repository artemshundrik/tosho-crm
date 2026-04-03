#!/usr/bin/env bash
set -euo pipefail

umask 077

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd pg_dump
require_cmd tar

DB_URL="${BACKUP_DB_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "Set BACKUP_DB_URL (or SUPABASE_DB_URL) before running backup." >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
TS="$(date -u +%Y%m%d-%H%M%SZ)"
WORK_DIR="${BACKUP_ROOT}/${TS}"
ARCHIVE_PATH="${BACKUP_ROOT}/${TS}.tar.gz"
LATEST_POINTER_PATH="${BACKUP_ROOT}/.latest-successful-archive"

mkdir -p "${WORK_DIR}/db" "${WORK_DIR}/storage"

echo "Backing up database..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "${WORK_DIR}/db/postgres.dump" \
  "${DB_URL}"

cat > "${WORK_DIR}/meta.txt" <<EOF
created_at_utc=${TS}
project=tosho-crm
hostname=$(hostname)
EOF

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${WORK_DIR}/db/postgres.dump" > "${WORK_DIR}/db/postgres.dump.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${WORK_DIR}/db/postgres.dump" > "${WORK_DIR}/db/postgres.dump.sha256"
fi

# Optional storage backup (S3-compatible).
# Enable by setting all:
# STORAGE_S3_ENDPOINT, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY, STORAGE_BUCKETS
if [[ -n "${STORAGE_S3_ENDPOINT:-}" && -n "${STORAGE_S3_ACCESS_KEY_ID:-}" && -n "${STORAGE_S3_SECRET_ACCESS_KEY:-}" && -n "${STORAGE_BUCKETS:-}" ]]; then
  require_cmd aws
  echo "Backing up storage buckets..."
  export AWS_ACCESS_KEY_ID="${STORAGE_S3_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${STORAGE_S3_SECRET_ACCESS_KEY}"
  export AWS_EC2_METADATA_DISABLED=true

  OLDIFS="$IFS"
  IFS=','
  read -r -a BUCKETS <<< "${STORAGE_BUCKETS}"
  IFS="$OLDIFS"

  for raw_bucket in "${BUCKETS[@]}"; do
    bucket="$(echo "${raw_bucket}" | xargs)"
    [[ -z "${bucket}" ]] && continue
    echo "  - ${bucket}"
    if ! aws --endpoint-url "${STORAGE_S3_ENDPOINT}" s3 ls "s3://${bucket}" >/dev/null 2>&1; then
      echo "  - skipping missing or inaccessible bucket: ${bucket}"
      continue
    fi
    aws --endpoint-url "${STORAGE_S3_ENDPOINT}" s3 sync "s3://${bucket}" "${WORK_DIR}/storage/${bucket}" --only-show-errors
  done
else
  echo "Skipping storage backup (STORAGE_* env vars are not fully set)."
fi

echo "Compressing backup..."
mkdir -p "${BACKUP_ROOT}"
tar -czf "${ARCHIVE_PATH}" -C "${BACKUP_ROOT}" "${TS}"
rm -rf "${WORK_DIR}"

echo "Backup created: ${ARCHIVE_PATH}"
printf '%s\n' "${ARCHIVE_PATH}" > "${LATEST_POINTER_PATH}"

# Keep newest N archives (default: 30)
KEEP_ARCHIVES="${KEEP_ARCHIVES:-30}"
if [[ "${KEEP_ARCHIVES}" =~ ^[0-9]+$ ]]; then
  archive_index=0
  while IFS= read -r old_archive; do
    archive_index=$((archive_index + 1))
    if (( archive_index > KEEP_ARCHIVES )); then
      rm -f "${old_archive}"
    fi
  done < <(ls -1t "${BACKUP_ROOT}"/*.tar.gz 2>/dev/null || true)
fi
