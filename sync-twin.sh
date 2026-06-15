#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-twin.sh — Sincroniza el gemelo principal con su COPIA de xpaceos.com y
# bumpea la versión en los DOS xtanco-version.js + TWIN_BASE de admira-app.
#
# Los DOS despliegues del gemelo:
#   · carlossilva.info/01.-AdmiraXperience-Game/   (este repo, game.html)
#   · xpaceos.com/admira-xp/                        (xpaceos/admira-xp/index.html)
# La copia es IDÉNTICA a game.html salvo 2 líneas (<link canonical> + <meta og:url>)
# insertadas tras el <title>. Este script regenera la copia desde game.html, así
# que NUNCA hay que editarla a mano (fin del "se ve la versión vieja en xpaceos").
#
# Uso:
#   ./sync-twin.sh           Regenera copia + bumpea versión (no commitea).
#   ./sync-twin.sh --check   Solo comprueba que la copia está en sync (no escribe).
# Tras correrlo, revisa y commitea/pushea/taggea los 3 repos (te imprime los pasos).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="${ROOT:-$HOME/Documents/Admirito/github-csilvasantin}"
SRC="$ROOT/01.-AdmiraXperience-Game"
CP="$ROOT/xpaceos/admira-xp"
APPHTML="$ROOT/admira-app/index.html"
VER="$SRC/xtanco-version.js"
GAME="$SRC/game.html"

CANON='<link rel="canonical" href="https://www.xpaceos.com/admira-xp/">'
OG='<meta property="og:url" content="https://www.xpaceos.com/admira-xp/">'

[ -f "$GAME" ] || { echo "✗ no encuentro $GAME"; exit 1; }
[ -d "$CP" ]   || { echo "✗ no encuentro la copia $CP"; exit 1; }

# Regenera el index.html de la copia: game.html + las 2 líneas tras el <title>.
gen_copy(){
  awk -v c="$CANON" -v o="$OG" '
    {print}
    $0 ~ /<title>.*Xtanco<\/title>/ && !d {print c; print o; d=1}
  ' "$GAME" > "$1"
}

# ── modo --check: ¿la copia ya está sincronizada? ─────────────────────────────
if [ "${1:-}" = "--check" ]; then
  tmp="$(mktemp)"; gen_copy "$tmp"
  if diff -q "$tmp" "$CP/index.html" >/dev/null; then echo "✓ copia EN SYNC con game.html"; rm -f "$tmp"; exit 0
  else echo "✗ copia DESINCRONIZADA (corre ./sync-twin.sh)"; diff "$tmp" "$CP/index.html" | head -20; rm -f "$tmp"; exit 1; fi
fi

# ── 1) calcular versión nueva (seq reinicia cada día) ─────────────────────────
cur_build="$(grep -oE "build: '[0-9]{8}-[0-9]{4}'" "$VER" | grep -oE "[0-9]{8}-[0-9]{4}")"
[ -n "$cur_build" ] || { echo "✗ no pude leer el build actual de $VER"; exit 1; }
cur_date="${cur_build%%-*}"; cur_seq="${cur_build##*-}"
today="$(date +%Y%m%d)"
if [ "$cur_date" = "$today" ]; then seq="$(printf '%04d' $((10#$cur_seq + 1)))"; else seq="0001"; fi
new_build="${today}-${seq}"
yy="$(date +%y)"; mm="$(date +%m)"; dd="$(date +%d)"; r="$((10#$seq))"
new_version="AdmiraNext v${yy}.${mm}.${dd}.${r}"
new_cache="admiranext-v${yy}-${mm}-${dd}-${seq}"
echo "→ versión: ${cur_build}  →  ${new_build}   (${new_version})"

# ── 2) bump xtanco-version.js (fuente) ────────────────────────────────────────
perl -0pi -e "s/version: '[^']*'/version: '${new_version}'/; s/build: '[^']*'/build: '${new_build}'/; s/cacheName: '[^']*'/cacheName: '${new_cache}'/" "$VER"

# ── 3) regenerar la copia desde game.html (+2 líneas) ─────────────────────────
gen_copy "$CP/index.html"

# ── 4) copiar el version.js bumpeado a la copia (idéntico) ────────────────────
cp "$VER" "$CP/xtanco-version.js"

# ── 5) TWIN_BASE de admira-app ────────────────────────────────────────────────
if [ -f "$APPHTML" ]; then
  perl -0pi -e "s#(game\.html\?v=)[0-9]{8}-[0-9]{4}#\${1}${new_build}#g" "$APPHTML"
fi

# ── 6) verificación ───────────────────────────────────────────────────────────
ndiff="$(diff "$GAME" "$CP/index.html" | grep -cE '^[<>]' || true)"
echo "✓ copia regenerada · diff con game.html = ${ndiff} líneas (deben ser 2: canonical+og)"
grep -q "$new_build" "$CP/xtanco-version.js" && echo "✓ xtanco-version.js (copia) = ${new_build}"
[ -f "$APPHTML" ] && grep -q "v=${new_build}" "$APPHTML" && echo "✓ TWIN_BASE = ${new_build}"
[ "$ndiff" = "2" ] || echo "⚠ el diff no es 2 — revisa antes de publicar"

cat <<EOF

Listo. Para PUBLICAR (revisa primero), tag sugerido r${r}:
  cd "$SRC"        && git add game.html xtanco-version.js && git commit -m "..." && git push && git tag DigitalTwin-v.20$(date +%y).$(date +%m).$(date +%d).r${r} && git push --tags
  cd "$ROOT/xpaceos" && git add admira-xp && git commit -m "..." && git push && git tag XpaceOS-v.20$(date +%y).$(date +%m).$(date +%d).r${r} && git push --tags
  cd "$ROOT/admira-app" && git add index.html && git commit -m "..." && git push && git tag AdmiraApp-v.20$(date +%y).$(date +%m).$(date +%d).r${r} && git push --tags
EOF
