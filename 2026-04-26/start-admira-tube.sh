#!/usr/bin/env bash
# Start the Admira XP elgato-proxy on its own port and expose it via Tailscale Funnel
# at https://macmini.tail48b61c.ts.net/admira so /importTube works from the public
# GitHub Pages URL.
#
# Usage:  ./start-admira-tube.sh
# Stop:   pkill -f "elgato-proxy.js" ; tailscale funnel --set-path=/admira off

set -euo pipefail

cd "$(dirname "$0")"

PORT="${ADMIRA_TUBE_PORT:-9126}"
PUBLIC_PATH="${ADMIRA_TUBE_PATH:-/admira}"
LOG="/tmp/admira-tube-proxy.log"

# 1. Sanity: yt-dlp present
if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "✗ yt-dlp not found. Install with: brew install yt-dlp" >&2
  exit 1
fi
echo "✓ yt-dlp $(yt-dlp --version)"

# 2. Free the port if a stale instance is holding it
if lsof -nP -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ℹ Killing stale process on port $PORT"
  pkill -f "elgato-proxy.js" 2>/dev/null || true
  sleep 1
fi

# 3. Start elgato-proxy in the background
XTANCO_PORT="$PORT" nohup node elgato-proxy.js > "$LOG" 2>&1 &
PROXY_PID=$!
sleep 1.2
if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "✗ elgato-proxy.js failed to start. Tail of $LOG:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi
echo "✓ elgato-proxy listening on http://127.0.0.1:$PORT (PID $PROXY_PID, log: $LOG)"

# 4. Verify /tube/health
HEALTH="$(curl -fsS "http://127.0.0.1:$PORT/tube/health" || true)"
echo "  /tube/health → $HEALTH"

# 5. Add or refresh the Funnel mapping
if tailscale funnel status 2>/dev/null | grep -q "$PUBLIC_PATH"; then
  echo "ℹ Funnel already exposes $PUBLIC_PATH — leaving as is"
else
  echo "↻ tailscale funnel --bg --set-path=$PUBLIC_PATH http://127.0.0.1:$PORT"
  tailscale funnel --bg --set-path="$PUBLIC_PATH" "http://127.0.0.1:$PORT"
fi

# 6. Print the public URL
TAILNET="$(tailscale status --json 2>/dev/null | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  print(d["Self"]["DNSName"].rstrip("."))
except Exception:
  print("macmini.tail48b61c.ts.net")')"
echo
echo "✓ Public URL: https://$TAILNET$PUBLIC_PATH"
echo "  Test:       curl -s https://$TAILNET$PUBLIC_PATH/tube/health"
echo
echo "Now from GitHub Pages /importTube <youtube-url> reaches this proxy."
