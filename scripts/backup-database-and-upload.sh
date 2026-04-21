#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-}"
FORCE_BACKUP="${DROPBOX_BACKUP_FORCE_DATABASE:-0}"
FORCE_WEEKLY="${DROPBOX_BACKUP_FORCE_WEEKLY:-0}"
FORCE_MONTHLY="${DROPBOX_BACKUP_FORCE_MONTHLY:-0}"
RUN_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RUN_LOG="$(mktemp)"
RUN_STATUS="success"
RUN_ERROR_MESSAGE=""
BACKUP_ATTEMPTED="0"
DATABASE_POINTER_PATH="${SCRIPT_DIR}/../backups/database/.latest-successful-database-archive"
DATABASE_UPLOAD_STATE_PATH="${SCRIPT_DIR}/../backups/database/.latest-dropbox-uploaded-database"

current_archive_needs_upload() {
  local pointer_path="$1"
  local upload_state_path="$2"

  if [[ ! -f "${pointer_path}" ]]; then
    return 1
  fi

  local latest_archive
  latest_archive="$(cat "${pointer_path}")"
  if [[ -z "${latest_archive}" || ! -f "${latest_archive}" ]]; then
    return 1
  fi

  local current_archive_name
  current_archive_name="$(basename "${latest_archive}")"

  if [[ ! -f "${upload_state_path}" ]]; then
    return 0
  fi

  local uploaded_archive_name
  uploaded_archive_name="$(tr -d '\r\n' < "${upload_state_path}")"
  [[ "${uploaded_archive_name}" != "${current_archive_name}" ]]
}

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
if [[ -f "${DATABASE_POINTER_PATH}" ]]; then
  before_pointer="$(cat "${DATABASE_POINTER_PATH}")"
fi

if [[ "${FORCE_BACKUP}" == "1" ]]; then
  BACKUP_ATTEMPTED="1"
  if ! BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}" /bin/bash "${SCRIPT_DIR}/backup-database.sh" >>"${RUN_LOG}" 2>&1; then
    RUN_STATUS="failed"
  fi
else
  if ! /bin/bash "${SCRIPT_DIR}/backup-database-if-needed.sh" >>"${RUN_LOG}" 2>&1; then
    RUN_STATUS="failed"
    BACKUP_ATTEMPTED="1"
  else
    after_pointer=""
    if [[ -f "${DATABASE_POINTER_PATH}" ]]; then
      after_pointer="$(cat "${DATABASE_POINTER_PATH}")"
    fi
    if [[ -n "${after_pointer}" && "${after_pointer}" != "${before_pointer}" ]]; then
      BACKUP_ATTEMPTED="1"
    elif current_archive_needs_upload "${DATABASE_POINTER_PATH}" "${DATABASE_UPLOAD_STATE_PATH}"; then
      BACKUP_ATTEMPTED="1"
    fi
  fi
fi

if [[ "${RUN_STATUS}" == "success" && "${BACKUP_ATTEMPTED}" == "0" ]]; then
  cat "${RUN_LOG}"
  exit 0
fi

export DROPBOX_BACKUP_POINTER_PATH="${DATABASE_POINTER_PATH}"
export DROPBOX_BACKUP_SECTION="database"
export DROPBOX_BACKUP_UPLOAD_DAILY="1"
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
  base_root="${DROPBOX_BACKUP_ROOT:-/Tosho Team Folder/CRM Backups}"
  if [[ "${FORCE_MONTHLY}" == "1" || "$(date -u +%d)" == "01" ]]; then
    dropbox_path="${base_root}/database/monthly/${archive_name}"
  elif [[ "${FORCE_WEEKLY}" == "1" || "$(date -u +%u)" == "7" ]]; then
    dropbox_path="${base_root}/database/weekly/${archive_name}"
  else
    dropbox_path="${base_root}/database/daily/${archive_name}"
  fi
fi

BACKUP_RUN_SECTION="database" \
BACKUP_RUN_STATUS="${RUN_STATUS}" \
BACKUP_RUN_SCHEDULE="$([[ "${FORCE_MONTHLY}" == "1" || "$(date -u +%d)" == "01" ]] && echo "monthly" || ([[ "${FORCE_WEEKLY}" == "1" || "$(date -u +%u)" == "7" ]] && echo "weekly" || echo "daily"))" \
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
