#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export BACKUP_SKIP_DB="1"
export BACKUP_INCLUDE_STORAGE="1"
export BACKUP_ARCHIVE_SUFFIX="-storage"
export BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups/storage}"
export LATEST_POINTER_PATH="${LATEST_POINTER_PATH:-${BACKUP_ROOT}/.latest-successful-storage-archive}"
export KEEP_ARCHIVES="${KEEP_STORAGE_ARCHIVES:-12}"

/bin/bash "${SCRIPT_DIR}/backup.sh"
