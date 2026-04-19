#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERAL_BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"
STORAGE_BACKUP_ROOT="${BACKUP_STORAGE_ROOT:-${GENERAL_BACKUP_ROOT}/storage}"
today_utc="$(date -u +%Y%m%d)"
day_of_month="$(date -u +%d)"
day_of_week="$(date -u +%u)"

if [[ "${day_of_month}" != "01" && "${day_of_week}" != "7" ]]; then
  echo "Storage backup is scheduled for Sundays and the first day of the month. Skipping."
  exit 0
fi

mkdir -p "${STORAGE_BACKUP_ROOT}"

if compgen -G "${STORAGE_BACKUP_ROOT}/${today_utc}-*-storage.tar.gz" >/dev/null 2>&1; then
  echo "Storage archive for ${today_utc} already exists. Skipping."
  exit 0
fi

"${SCRIPT_DIR}/backup-storage.sh"
