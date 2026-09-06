#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the clean restore database}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

test -f "$BACKUP_FILE"
gunzip -c "$BACKUP_FILE" | pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL"
echo "restore completed into the configured clean database"
