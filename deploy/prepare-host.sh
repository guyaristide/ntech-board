#!/bin/sh
# Prépare sur le serveur Coolify les répertoires persistants, si l'on préfère des dossiers
# de l'hôte aux volumes Docker nommés (voir docs/DEPLOIEMENT.md, « Volumes »).
# Usage : sudo sh deploy/prepare-host.sh [/data/ntech-board]
set -eu
ROOT="${1:-/data/ntech-board}"

# PostgreSQL (image alpine) tourne sous l'uid 70 et exige un dossier de données en 700.
mkdir -p "$ROOT/postgres" "$ROOT/backups"
chown -R 70:70 "$ROOT/postgres" "$ROOT/backups"
chmod 700 "$ROOT/postgres"
chmod 750 "$ROOT/backups"

# L'application tourne sous l'utilisateur « node » (uid 1000).
mkdir -p "$ROOT/storage/imports" "$ROOT/storage/backups"
chown -R 1000:1000 "$ROOT/storage"
chmod -R 750 "$ROOT/storage"

ls -ln "$ROOT"
echo "Répertoires prêts sous $ROOT"
