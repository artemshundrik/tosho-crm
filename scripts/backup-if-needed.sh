#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"

today_utc="$(date -u +%Y%m%d)"
mkdir -p "${BACKUP_ROOT}"

if compgen -G "${BACKUP_ROOT}/${today_utc}-*.tar.gz" >/dev/null 2>&1; then
  echo "Backup archive for ${today_utc} already exists. Skipping."
  exit 0
fi

# Clean up stale partial backup directories from a failed run so the next hourly
# retry can produce the archive instead of getting blocked for the whole day.
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "${today_utc}-*" -print0 2>/dev/null | while IFS= read -r -d '' stale_dir; do
  rm -rf "${stale_dir}"
done

"${SCRIPT_DIR}/backup.sh"
