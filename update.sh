#!/usr/bin/env bash
# Aktualisiert RiftGallery auf den neuesten Stand und startet den Container neu.
# Aufruf:  ./update.sh            (aktualisiert den aktuell ausgecheckten Branch)
#          ./update.sh <branch>   (aktualisiert einen bestimmten Branch)
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "→ Hole neuesten Stand von '$BRANCH' …"
git pull origin "$BRANCH"

echo "→ Baue und starte Container neu …"
docker compose up -d --build

echo "✓ Fertig – die aktuelle Version läuft."
