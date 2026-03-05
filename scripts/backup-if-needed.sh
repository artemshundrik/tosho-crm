#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"

today_utc="$(date -u +%Y%m%d)"
if compgen -G "${BACKUP_ROOT}/${today_utc}-*.tar.gz" >/dev/null 2>&1; then
  echo "Backup for ${today_utc} already exists. Skipping."
  exit 0
fi

"${SCRIPT_DIR}/backup.sh"
