#!/usr/bin/env bash
# Arranca suno-local en :3777 y lo expone via Tailscale Funnel en /suno
# Stop:  pkill -f "suno-local/server.js"; tailscale funnel --set-path=/suno off

set -euo pipefail
cd "$(dirname "$0")"

PORT="${SUNO_LOCAL_PORT:-3777}"
PUBLIC_PATH="${SUNO_LOCAL_PATH:-/suno}"
LOG="/tmp/suno-local.log"

# 1. Sanity: .env con cookie
if [ ! -f .env ]; then
  echo "✗ .env no existe. Crea uno desde .env.example y pega la cookie." >&2
  exit 1
fi
if ! grep -qE '^SUNO_COOKIE=.+' .env; then
  echo "✗ SUNO_COOKIE vacia en .env. Pega la cookie completa de clerk.suno.com." >&2
  exit 1
fi
echo "✓ .env presente con SUNO_COOKIE"

# 2. Liberar el puerto si esta ocupado por una instancia antigua
if lsof -nP -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ℹ Killing stale process on port $PORT"
  pkill -f "suno-local/server.js" 2>/dev/null || true
  sleep 1
fi

# 3. Arrancar server
nohup node server.js > "$LOG" 2>&1 &
PID=$!
sleep 1.5
if ! kill -0 "$PID" 2>/dev/null; then
  echo "✗ server.js no arranco. Tail $LOG:" >&2
  tail -30 "$LOG" >&2
  exit 1
fi
echo "✓ suno-local listening on http://127.0.0.1:$PORT (PID $PID, log: $LOG)"

# 4. /healthz (no aborta si falla — la cookie puede ser invalida pero el server arranco)
HEALTH="$(curl -fsS "http://127.0.0.1:$PORT/healthz" || echo '{}')"
echo "  /healthz → $HEALTH"

# 5. Funnel mapping /suno
if tailscale funnel status 2>/dev/null | grep -q "$PUBLIC_PATH"; then
  echo "ℹ Funnel ya expone $PUBLIC_PATH — leaving as is"
else
  echo "↻ tailscale funnel --bg --set-path=$PUBLIC_PATH http://127.0.0.1:$PORT"
  tailscale funnel --bg --set-path="$PUBLIC_PATH" "http://127.0.0.1:$PORT"
fi

# 6. Print URL publica
TAILNET="$(tailscale status --json 2>/dev/null | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  print(d["Self"]["DNSName"].rstrip("."))
except Exception:
  print("macmini.tail48b61c.ts.net")')"
echo
echo "✓ Public URL: https://$TAILNET$PUBLIC_PATH"
echo "  Test:       curl -s https://$TAILNET$PUBLIC_PATH/healthz"
echo
echo "Ahora desde Pixer.ai (URL publica) la pestaña Musica → motor 'Suno (local)' funciona."
