#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-}"
FORCE_WEEKLY="${DROPBOX_BACKUP_FORCE_WEEKLY:-0}"
FORCE_MONTHLY="${DROPBOX_BACKUP_FORCE_MONTHLY:-0}"
RUN_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RUN_LOG="$(mktemp)"
RUN_STATUS="success"
RUN_ERROR_MESSAGE=""
BACKUP_ATTEMPTED="0"

cleanup() {
  rm -f "${RUN_LOG}"
}
trap cleanup EXIT

if [[ -z "${NODE_BIN}" ]]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  else
    echo "Node.js is required for Dropbox upload flow." >&2
    exit 1
  fi
fi

before_pointer=""
if [[ -f "${SCRIPT_DIR}/../backups/storage/.latest-successful-storage-archive" ]]; then
  before_pointer="$(cat "${SCRIPT_DIR}/../backups/storage/.latest-successful-storage-archive")"
fi

if [[ "${FORCE_WEEKLY}" == "1" || "${FORCE_MONTHLY}" == "1" ]]; then
  BACKUP_ATTEMPTED="1"
  if ! BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups/storage}" /bin/bash "${SCRIPT_DIR}/backup-storage.sh" >>"${RUN_LOG}" 2>&1; then
    RUN_STATUS="failed"
  fi
else
  if ! /bin/bash "${SCRIPT_DIR}/backup-storage-if-needed.sh" >>"${RUN_LOG}" 2>&1; then
    RUN_STATUS="failed"
    BACKUP_ATTEMPTED="1"
  else
    after_pointer=""
    if [[ -f "${SCRIPT_DIR}/../backups/storage/.latest-successful-storage-archive" ]]; then
      after_pointer="$(cat "${SCRIPT_DIR}/../backups/storage/.latest-successful-storage-archive")"
    fi
    if [[ -n "${after_pointer}" && "${after_pointer}" != "${before_pointer}" ]]; then
      BACKUP_ATTEMPTED="1"
    fi
  fi
fi

if [[ "${RUN_STATUS}" == "success" && "${BACKUP_ATTEMPTED}" == "0" ]]; then
  cat "${RUN_LOG}"
  exit 0
fi

export DROPBOX_BACKUP_POINTER_PATH="${SCRIPT_DIR}/../backups/storage/.latest-successful-storage-archive"
export DROPBOX_BACKUP_SECTION="storage"
export DROPBOX_BACKUP_UPLOAD_DAILY="0"
export DROPBOX_BACKUP_UPLOAD_WEEKLY="1"
export DROPBOX_BACKUP_UPLOAD_MONTHLY="1"
export DROPBOX_BACKUP_FORCE_WEEKLY="${FORCE_WEEKLY}"
export DROPBOX_BACKUP_FORCE_MONTHLY="${FORCE_MONTHLY}"

if [[ "${RUN_STATUS}" == "success" ]]; then
  if ! "${NODE_BIN}" "${SCRIPT_DIR}/upload-backups-dropbox.mjs" >>"${RUN_LOG}" 2>&1; then
    RUN_STATUS="failed"
  fi
fi

if [[ "${RUN_STATUS}" != "success" ]]; then
  RUN_ERROR_MESSAGE="$(tail -n 20 "${RUN_LOG}" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-900)"
fi

latest_archive=""
archive_name=""
archive_size_bytes=""
dropbox_path=""
if [[ -f "${DROPBOX_BACKUP_POINTER_PATH}" ]]; then
  latest_archive="$(cat "${DROPBOX_BACKUP_POINTER_PATH}")"
fi
if [[ -n "${latest_archive}" && -f "${latest_archive}" ]]; then
  archive_name="$(basename "${latest_archive}")"
  archive_size_bytes="$(stat -f %z "${latest_archive}" 2>/dev/null || stat -c %s "${latest_archive}" 2>/dev/null || true)"
fi
if [[ -n "${archive_name}" ]]; then
  if [[ "${FORCE_MONTHLY}" == "1" ]]; then
    dropbox_path="/Tosho Team Folder/CRM Backups/storage/monthly/${archive_name}"
  else
    dropbox_path="/Tosho Team Folder/CRM Backups/storage/weekly/${archive_name}"
  fi
fi

BACKUP_RUN_SECTION="storage" \
BACKUP_RUN_STATUS="${RUN_STATUS}" \
BACKUP_RUN_SCHEDULE="$([[ "${FORCE_MONTHLY}" == "1" ]] && echo "monthly" || echo "weekly")" \
BACKUP_RUN_STARTED_AT="${RUN_STARTED_AT}" \
BACKUP_RUN_FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
BACKUP_RUN_ARCHIVE_NAME="${archive_name}" \
BACKUP_RUN_ARCHIVE_SIZE_BYTES="${archive_size_bytes}" \
BACKUP_RUN_DROPBOX_PATH="${dropbox_path}" \
BACKUP_RUN_ERROR_MESSAGE="${RUN_ERROR_MESSAGE}" \
BACKUP_RUN_MACHINE_NAME="$(hostname)" \
"${NODE_BIN}" "${SCRIPT_DIR}/report-backup-run.mjs" >>"${RUN_LOG}" 2>&1 || true

cat "${RUN_LOG}"

if [[ "${RUN_STATUS}" != "success" ]]; then
  exit 1
fi
