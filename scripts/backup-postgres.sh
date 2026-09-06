#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required for the temporary local file}"
: "${BACKUP_S3_URI:?BACKUP_S3_URI is required, for example s3://neo-avo-backups/postgres}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/neo-avo-$stamp.dump.gz"
umask 077
pg_dump --format=custom "$DATABASE_URL" | gzip -c > "$file"
aws s3 cp "$file" "$BACKUP_S3_URI/$(basename "$file")" --only-show-errors
rm -f "$file"
echo "backup uploaded: $(basename "$file")"
