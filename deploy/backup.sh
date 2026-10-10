#!/bin/sh
# Sauvegarde de la base, à lancer dans le conteneur « db » (tâche planifiée Coolify) :
#   sh -c "$(cat deploy/backup.sh)"   ou en recopiant la commande ci-dessous.
# Format personnalisé de pg_dump (restaurable avec pg_restore), conservation 14 jours.
set -eu
DEST=/backups
KEEP_DAYS="${KEEP_DAYS:-14}"
FILE="$DEST/board-$(date +%Y%m%d-%H%M).dump"
pg_dump -U board -d board -Fc -f "$FILE"
find "$DEST" -name 'board-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Sauvegarde : $FILE ($(du -h "$FILE" | cut -f1))"
