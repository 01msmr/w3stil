#!/bin/sh
# ios-sync.sh — legt die Safari-Fassungen (dist/safari/*.user.css) und das
# Userscript in den iCloud-Ordner der Userscripts-App. iPhone/iPad ziehen die
# Dateien über iCloud Drive automatisch nach; "Aktualisieren" heißt schlicht:
# dieses Skript erneut ausführen.
#
#   tools/ios-sync.sh                 # pull + build + kopieren
#   USERSCRIPTS_DIR=... tools/ios-sync.sh   # abweichender App-Ordner
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Kandidaten: erst der App-eigene iCloud-Container, sonst ein gewoehnlicher
# iCloud-Drive-Ordner "Userscripts" — den kann man in der App (Mac wie iOS)
# als Skript-Verzeichnis auswaehlen, und er synchronisiert ueberall hin.
KANDIDATEN="$HOME/Library/Mobile Documents/iCloud~com~userscripts~macos/Documents
$HOME/Library/Mobile Documents/com~apple~CloudDocs/Userscripts"

ZIEL="${USERSCRIPTS_DIR:-}"
if [ -z "$ZIEL" ]; then
  while IFS= read -r k; do
    [ -d "$k" ] && ZIEL="$k" && break
  done <<EOF2
$KANDIDATEN
EOF2
fi

if [ -z "$ZIEL" ] || [ ! -d "$ZIEL" ]; then
  echo "✗ Userscripts-Ordner nicht gefunden: $ZIEL"
  echo "  Ist die App 'Userscripts' installiert und ihr Ordner auf iCloud gestellt?"
  echo "  Abweichenden Ordner mit USERSCRIPTS_DIR=... angeben."
  exit 1
fi

cd "$ROOT"
git pull --ff-only -q || echo "! git pull übersprungen (offline oder lokale Änderungen)"
node build.mjs
cp -f dist/safari/*.user.css reduce.user.js "$ZIEL/"

echo "✓ kopiert nach: $ZIEL"
ls -1 "$ZIEL" | grep -E '\.user\.(css|js)$' | sed 's/^/  /'
