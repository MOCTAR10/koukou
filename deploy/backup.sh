#!/bin/sh
# Nightly encrypted dump of the Fermia DB, 7 days kept. Cron: 30 2 * * * /opt/fermia/backup.sh
set -eu
DIR=/opt/fermia/backups; mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M)
docker exec fermia_postgres pg_dump -U fermia -Fc fermia \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/opt/fermia/backup.key -out "$DIR/fermia-$STAMP.dump.enc"
find "$DIR" -name 'fermia-*.dump.enc' -mtime +7 -delete
# Restore: openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/opt/fermia/backup.key -in X | docker exec -i fermia_postgres pg_restore -U fermia -d fermia --clean
