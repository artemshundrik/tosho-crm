#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERAL_BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"
STORAGE_BACKUP_ROOT="${BACKUP_STORAGE_ROOT:-${GENERAL_BACKUP_ROOT}/storage}"
# Dropbox is the offsite history (8 weekly + 6 monthly, see upload-backups-dropbox.mjs).
# Locally keep only the newest archive: backup-storage-if-needed.sh reads its age to
# decide when to run, and it is the one pending upload. More local copies just
# duplicate Dropbox (8 × ~13 GB filled the laptop disk by Nov 2026).
STORAGE_KEEP_ARCHIVES="${KEEP_STORAGE_ARCHIVES:-1}"

BACKUP_SKIP_DB=1 \
BACKUP_INCLUDE_STORAGE=1 \
BACKUP_ROOT="${STORAGE_BACKUP_ROOT}" \
BACKUP_ARCHIVE_SUFFIX="-storage" \
LATEST_POINTER_PATH="${STORAGE_BACKUP_ROOT}/.latest-successful-storage-archive" \
KEEP_ARCHIVES="${STORAGE_KEEP_ARCHIVES}" \
/bin/bash "${SCRIPT_DIR}/backup.sh"
