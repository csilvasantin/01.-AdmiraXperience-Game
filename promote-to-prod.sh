#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# promote-to-prod.sh — Promociona el gemelo YA VALIDADO de PREPROD a PRODUCCIÓN.
#
#   PREPROD  (donde iteramos y validamos):  https://www.xpaceos.com/admira-xp/
#            repo: xpaceos/admira-xp   (lo regenera sync-twin.sh en cada build)
#   PRODUCCIÓN (estable, cara al público): https://www.admira.store/
#            repo: admira-store   (CNAME admira.store; antes era el site de robots,
#            que se movió a admira.shop)
#
# Producción = snapshot del gemelo de preprod. SOLO cambia cuando corres esto a mano
# → release gate: nada llega a admira.store sin que tú lo promociones tras validar.
# NO toca preprod ni el repo canónico.
#
# Uso:
#   ./promote-to-prod.sh           Copia preprod → prod (no commitea; imprime los pasos).
#   ./promote-to-prod.sh --check   Muestra qué cambiaría (diff), no escribe.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="${ROOT:-$HOME/Documents/Admirito/github-csilvasantin}"
SRC="$ROOT/xpaceos/admira-xp"      # preprod (origen validado)
DST="$ROOT/admira-store"           # producción (destino)
PROD_URL="https://admira.store/"
PREPROD_URL="https://www.xpaceos.com/admira-xp/"

[ -d "$SRC" ]      || { echo "✗ no encuentro preprod $SRC"; exit 1; }
[ -d "$DST/.git" ] || { echo "✗ no encuentro el clon de prod $DST (haz: git clone https://github.com/csilvasantin/admira-store.git \"$DST\")"; exit 1; }

# Branding de PRODUCCIÓN en el index: canonical/og al dominio prod + título "Admira
# Digital Twin" (preprod conserva su título de dev "Admira XP // The Xpace OS — Xtanco").
PROD_TITLE="Admira Digital Twin"
rewrite_urls(){
  perl -0pi -e 's{\Q'"$PREPROD_URL"'\E}{'"$PROD_URL"'}g' "$1" 2>/dev/null || true
  perl -0pi -e 's{<title>.*?</title>}{<title>'"$PROD_TITLE"'</title>}s' "$1" 2>/dev/null || true
}

# rsync preprod → prod: replica TODO el gemelo. Conserva CNAME y .git de prod; no
# copia el backup .orig. --delete limpia restos del site anterior (robots).
RSYNC_OPTS=(-a --delete --exclude='.git' --exclude='CNAME' --exclude='index.html.orig' --exclude='.DS_Store')

if [ "${1:-}" = "--check" ]; then
  tmp="$(mktemp -d)"
  rsync "${RSYNC_OPTS[@]}" "$SRC"/ "$tmp"/
  [ -f "$tmp/index.html" ] && rewrite_urls "$tmp/index.html"
  echo "→ Diff PREPROD(reescrito) vs PRODUCCIÓN actual:"
  diff -rq --exclude='.git' --exclude='CNAME' "$tmp" "$DST" || true
  rm -rf "$tmp"
  exit 0
fi

rsync "${RSYNC_OPTS[@]}" "$SRC"/ "$DST"/
[ -f "$DST/index.html" ] && rewrite_urls "$DST/index.html"

BUILD="$(grep -oE "build: '[0-9]{8}-[0-9]{4}'" "$DST/xtanco-version.js" 2>/dev/null | grep -oE "[0-9]{8}-[0-9]{4}" || echo '?')"
CANON="$(grep -oE 'rel="canonical" href="[^"]+"' "$DST/index.html" 2>/dev/null | head -1)"
echo "✓ producción sincronizada con preprod · build $BUILD"
echo "✓ CNAME prod  : $(cat "$DST/CNAME" 2>/dev/null)"
echo "✓ canonical   : $CANON"
echo ""
echo "Para PUBLICAR producción (revisa y luego):"
echo "  cd \"$DST\" && git add -A && git commit -m \"promote: gemelo build $BUILD → producción (admira.store)\" && git push && git tag AdmiraStore-prod-$BUILD && git push --tags"
