# Plan de modularización de `game.html`

`game.html` tiene ~900 KB con TODO el JS inline en un único `<script>`. Esto:

- Hace difícil revisar diffs.
- Bloquea el carga inicial hasta que el HTML completo llega.
- Impide caching granular (un cambio en una función fuerza re-descargar todo).
- Complica que varios desarrolladores/IAs trabajen en paralelo.

Refactorizar a módulos NO se puede hacer en una pasada sin romper cosas
porque hay variables y funciones compartidas a lo largo de todo el script.
Aquí queda el plan ordenado por **independencia** (los más independientes
primero), para hacerlo en sesiones dedicadas.

## Fase 0 — preparación (sin cambios funcionales)
- [ ] Renombrar a `game.html` el monolito y crear `assets/js/` para los módulos extraídos.
- [ ] Cargar todo con `<script type="module">` para garantizar orden y estricto mode.
- [ ] Tests Playwright (`smoke.mjs` + workflow `page-loads.yml`) ya existen y deben pasar verde tras cada extracción.

## Fase 1 — módulos sin dependencias del estado del juego (más fácil)
Cada uno puede salir aislado, exporta su API, se importa al inicio del IIFE de `game.html`.

1. **`assets/js/sfx.js`** — el SFX engine completo (líneas ~568-620). Solo depende de `AudioContext` y de un getter de volumen `vol()`. Puede recibir `volGetter` como parámetro al inicializar.
2. **`assets/js/ambient.js`** — el AMBIENT engine (líneas ~625-720). Igual que SFX.
3. **`assets/js/sky.js`** — `getSkyColors(hour)` + render del sol/luna/estrellas. Depende solo de `tt`, `cx`, `W`, `skyTop`, `skyH`. Recibe `ctxBundle`.
4. **`assets/js/heatmap.js`** — render del overlay de socios (~líneas 11203-11230). Recibe `G.socioHeat`, `cx`, `ISO`, `tt`.

## Fase 2 — módulos con estado compartido pero contenido (medio)
5. **`assets/js/sponsor-render.js`** — `drawSponsorScrooge()`.
6. **`assets/js/loyalty-bridge.js`** — toda la lógica de socios web (LoyaltyBridge wrapper, registerSocio, etc).
7. **`assets/js/admira-grok.js`** — `grokFetch`, `grokAsk`, `grokDraw`, `setComunicado`, end-of-day comment.
8. **`assets/js/telegram-bridge.js`** — `telegramSend`, `executeTelegramText` (el dispatcher completo).

## Fase 3 — núcleo del juego (más difícil, más impacto)
9. **`assets/js/iso-engine.js`** — `toIso`, `screenToIso`, `drawIsoTile`, `drawIsoBlock`, `chibi`, `drawShop`. Es el corazón visual.
10. **`assets/js/game-loop.js`** — `updateGame`, `loop`, `spawnCust`, lógica de NPCs (thief, gc, opinador, bot).
11. **`assets/js/ui.js`** — `drawHUD`, `drawBottomBar`, `drawCharacterGroupsPanel`, `drawNPCEditor`, todo lo que pinta UI sobre el canvas.

## Reglas de oro durante la refactorización
- **Una extracción por commit**, con su pasada de smoke test.
- **No tocar funcionalidad** en el mismo commit que la extracción (refactor puro).
- **Mantener nombres globales** (`window.SFX`, `window.AMBIENT`, etc) durante el periodo de transición para no romper código que aún no está modularizado.
- **Tests Playwright** (`smoke.mjs`) deben pasar tras cada extracción — si fallan, revertir y replantear.
- **Bumpear cacheName** (`xtanco-version.js`) en cada commit para invalidar el SW.

## Estimación
- Fase 1: 1 sesión por módulo (4 sesiones, ~30 min cada una).
- Fase 2: 1-2 sesiones por módulo (4-8 sesiones).
- Fase 3: 2-3 sesiones por módulo (6-9 sesiones).

Total: ~14-21 sesiones cortas.
