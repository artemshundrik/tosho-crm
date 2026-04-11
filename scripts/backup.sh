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
BACKUP_SKIP_DB="${BACKUP_SKIP_DB:-0}"
if [[ "${BACKUP_SKIP_DB}" != "1" && -z "${DB_URL}" ]]; then
  echo "Set BACKUP_DB_URL (or SUPABASE_DB_URL) before running backup." >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
TS="$(date -u +%Y%m%d-%H%M%SZ)"
ARCHIVE_SUFFIX="${BACKUP_ARCHIVE_SUFFIX:-}"
WORK_DIR="${BACKUP_ROOT}/${TS}"
ARCHIVE_PATH="${BACKUP_ROOT}/${TS}${ARCHIVE_SUFFIX}.tar.gz"
LATEST_POINTER_PATH="${LATEST_POINTER_PATH:-${BACKUP_ROOT}/.latest-successful-archive}"

mkdir -p "${WORK_DIR}/db" "${WORK_DIR}/storage"

if [[ "${BACKUP_SKIP_DB}" != "1" ]]; then
  echo "Backing up database..."
  pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file "${WORK_DIR}/db/postgres.dump" \
    "${DB_URL}"
fi

cat > "${WORK_DIR}/meta.txt" <<EOF
created_at_utc=${TS}
project=tosho-crm
hostname=$(hostname)
backup_skip_db=${BACKUP_SKIP_DB}
backup_include_storage=${BACKUP_INCLUDE_STORAGE:-0}
EOF

if [[ "${BACKUP_SKIP_DB}" != "1" && -f "${WORK_DIR}/db/postgres.dump" ]]; then
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${WORK_DIR}/db/postgres.dump" > "${WORK_DIR}/db/postgres.dump.sha256"
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${WORK_DIR}/db/postgres.dump" > "${WORK_DIR}/db/postgres.dump.sha256"
  fi
fi

# Optional storage backup (S3-compatible).
# Enable only when explicitly requested:
# BACKUP_INCLUDE_STORAGE=1
# and all STORAGE_* vars are set.
if [[ "${BACKUP_INCLUDE_STORAGE:-0}" == "1" && -n "${STORAGE_S3_ENDPOINT:-}" && -n "${STORAGE_S3_ACCESS_KEY_ID:-}" && -n "${STORAGE_S3_SECRET_ACCESS_KEY:-}" && -n "${STORAGE_BUCKETS:-}" ]]; then
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
  echo "Skipping storage backup (set BACKUP_INCLUDE_STORAGE=1 with valid STORAGE_* vars to enable)."
fi

echo "Compressing backup..."
mkdir -p "${BACKUP_ROOT}"
tar -czf "${ARCHIVE_PATH}" -C "${BACKUP_ROOT}" "${TS}"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"
fi
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
      rm -f "${old_archive}.sha256"
    fi
  done < <(ls -1t "${BACKUP_ROOT}"/*.tar.gz 2>/dev/null || true)
fi
