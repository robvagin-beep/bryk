#!/usr/bin/env bash
# BRYK — local server.
# Mandatory: getUserMedia / getDisplayMedia / enumerateDevices are gated to secure
# contexts, and file:// is not one. The panel also loads audio-core.js via <script src>,
# which file:// blocks on CORS. So: always through here, never by double-clicking.
set -euo pipefail
PORT="${1:-8931}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
echo "BRYK  →  http://localhost:${PORT}/audio-panel.html"
echo "        (fixtures: add ?fix=1 to the URL)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
