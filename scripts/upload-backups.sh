#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 1
  fi
}

require_cmd aws

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
require_env B2_S3_ENDPOINT
require_env B2_BUCKET
require_env B2_KEY_ID
require_env B2_APPLICATION_KEY
LATEST_POINTER_PATH="${BACKUP_ROOT}/.latest-successful-archive"

if [[ ! -f "${LATEST_POINTER_PATH}" ]]; then
  echo "No latest backup pointer found in ${BACKUP_ROOT}. Nothing to upload."
  exit 0
fi

LATEST_ARCHIVE="$(cat "${LATEST_POINTER_PATH}")"
if [[ -z "${LATEST_ARCHIVE}" || ! -f "${LATEST_ARCHIVE}" ]]; then
  echo "Latest backup archive is missing. Nothing to upload."
  exit 0
fi

export AWS_ACCESS_KEY_ID="${B2_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${B2_APPLICATION_KEY}"
export AWS_EC2_METADATA_DISABLED=true

archive_name="$(basename "${LATEST_ARCHIVE}")"
echo "Uploading latest backup '${archive_name}' to B2 bucket '${B2_BUCKET}'..."
aws --endpoint-url "${B2_S3_ENDPOINT}" s3 cp "${LATEST_ARCHIVE}" "s3://${B2_BUCKET}/${archive_name}" --only-show-errors

echo "Upload completed."
