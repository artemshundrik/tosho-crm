#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"

today_utc="$(date -u +%Y%m%d)"
mkdir -p "${BACKUP_ROOT}"
ATTEMPT_STAMP="${BACKUP_ROOT}/.${today_utc}.attempted"

if compgen -G "${BACKUP_ROOT}/${today_utc}-*.tar.gz" >/dev/null 2>&1; then
  echo "Backup archive for ${today_utc} already exists. Skipping."
  exit 0
fi

if compgen -G "${BACKUP_ROOT}/${today_utc}-*" >/dev/null 2>&1; then
  echo "Backup attempt artifacts for ${today_utc} already exist. Skipping retry to avoid repeated load."
  exit 0
fi

if [[ -f "${ATTEMPT_STAMP}" ]]; then
  echo "Backup attempt for ${today_utc} already ran. Skipping retry to avoid repeated load."
  exit 0
fi

date -u +"%Y-%m-%dT%H:%M:%SZ" > "${ATTEMPT_STAMP}"
"${SCRIPT_DIR}/backup.sh"
