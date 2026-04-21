#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_STATUS=0
STORAGE_STATUS=0

/bin/bash "${SCRIPT_DIR}/backup-database-and-upload.sh" || DB_STATUS=$?
/bin/bash "${SCRIPT_DIR}/backup-storage-and-upload.sh" || STORAGE_STATUS=$?

if (( DB_STATUS != 0 || STORAGE_STATUS != 0 )); then
  exit 1
fi
