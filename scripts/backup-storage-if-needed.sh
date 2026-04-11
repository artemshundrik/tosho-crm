#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups/storage}"

today_utc="$(date -u +%Y%m%d)"
day_of_week="$(date -u +%u)"
day_of_month="$(date -u +%d)"

if [[ "${day_of_week}" != "7" && "${day_of_month}" != "01" ]]; then
  echo "Storage backup is scheduled only on Sundays and on the 1st day of the month. Skipping."
  exit 0
fi

mkdir -p "${BACKUP_ROOT}"

if compgen -G "${BACKUP_ROOT}/${today_utc}-*-storage.tar.gz" >/dev/null 2>&1; then
  echo "Storage backup archive for ${today_utc} already exists. Skipping."
  exit 0
fi

find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "${today_utc}-*" -print0 2>/dev/null | while IFS= read -r -d '' stale_dir; do
  rm -rf "${stale_dir}"
done

BACKUP_ROOT="${BACKUP_ROOT}" /bin/bash "${SCRIPT_DIR}/backup-storage.sh"
