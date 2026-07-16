#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERAL_BACKUP_ROOT="${BACKUP_ROOT:-${SCRIPT_DIR}/../backups}"
STORAGE_BACKUP_ROOT="${BACKUP_STORAGE_ROOT:-${GENERAL_BACKUP_ROOT}/storage}"
today_utc="$(date -u +%Y%m%d)"
day_of_month="$(date -u +%d)"
day_of_week="$(date -u +%u)"

# Self-heal for missed schedules. The base cadence is Sundays + the 1st, but if the
# machine was offline/asleep on the scheduled day (or that run failed), we'd otherwise
# wait a whole week for the next slot — leaving the offsite copy dangerously stale
# (this is how the 2026-07-12 gap sat unnoticed for 11 days). So on any day, if the
# newest local storage archive is missing or older than STORAGE_MAX_AGE_DAYS, run
# anyway. Once a fresh archive lands, staleness clears and hourly ticks go quiet again.
STORAGE_MAX_AGE_DAYS="${STORAGE_MAX_AGE_DAYS:-8}"

newest_storage_mtime() {
  local newest
  newest="$(ls -1t "${STORAGE_BACKUP_ROOT}"/*-storage.tar.gz 2>/dev/null | head -n 1 || true)"
  [[ -z "${newest}" ]] && return 1
  stat -f %m "${newest}" 2>/dev/null || stat -c %Y "${newest}" 2>/dev/null || return 1
}

storage_is_stale() {
  local mtime now age_limit
  mtime="$(newest_storage_mtime)" || return 0   # no archive at all => stale
  now="$(date -u +%s)"
  age_limit=$(( STORAGE_MAX_AGE_DAYS * 86400 ))
  (( now - mtime > age_limit ))
}

if [[ "${day_of_month}" != "01" && "${day_of_week}" != "7" ]]; then
  if storage_is_stale; then
    echo "Off-schedule, but newest storage archive is missing/older than ${STORAGE_MAX_AGE_DAYS}d — running to close the gap."
  else
    echo "Storage backup is scheduled for Sundays and the first day of the month. Skipping."
    exit 0
  fi
fi

mkdir -p "${STORAGE_BACKUP_ROOT}"

if compgen -G "${STORAGE_BACKUP_ROOT}/${today_utc}-*-storage.tar.gz" >/dev/null 2>&1; then
  echo "Storage archive for ${today_utc} already exists. Skipping."
  exit 0
fi

/bin/bash "${SCRIPT_DIR}/backup-storage.sh"
