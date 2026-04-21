#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERAL_BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"
DATABASE_BACKUP_ROOT="${BACKUP_DATABASE_ROOT:-${GENERAL_BACKUP_ROOT}/database}"
today_utc="$(date -u +%Y%m%d)"

mkdir -p "${DATABASE_BACKUP_ROOT}"

if compgen -G "${DATABASE_BACKUP_ROOT}/${today_utc}-*-database.tar.gz" >/dev/null 2>&1; then
  echo "Database archive for ${today_utc} already exists. Skipping."
  exit 0
fi

/bin/bash "${SCRIPT_DIR}/backup-database.sh"
