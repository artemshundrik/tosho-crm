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

if ! compgen -G "${BACKUP_ROOT}/*.tar.gz" >/dev/null 2>&1; then
  echo "No backup archives found in ${BACKUP_ROOT}. Nothing to upload."
  exit 0
fi

export AWS_ACCESS_KEY_ID="${B2_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${B2_APPLICATION_KEY}"
export AWS_EC2_METADATA_DISABLED=true

echo "Uploading backups to B2 bucket '${B2_BUCKET}'..."
aws --endpoint-url "${B2_S3_ENDPOINT}" s3 sync "${BACKUP_ROOT}/" "s3://${B2_BUCKET}/" \
  --exclude "*" \
  --include "*.tar.gz" \
  --only-show-errors

echo "Upload completed."
