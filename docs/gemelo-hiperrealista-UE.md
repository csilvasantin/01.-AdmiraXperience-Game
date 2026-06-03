# Gemelo Hiperrealista — Unreal Engine 5 + Pixel Streaming

Spec de integración para construir un **gemelo digital fotorrealista** de un punto de
Admira.app, accesible **desde el navegador** vía Pixel Streaming, reutilizando el mismo
"cerebro" que el gemelo 2D actual (`01.-AdmiraXperience-Game/game.html`).

> **Objetivo inmediato: Shoptalk Europe (Fira BCN, 9–11 jun 2026), stand Lenovo × Nvidia.**
> Demo de UN punto estrella corriendo nativo en la workstation del stand y emitido por
> Pixel Streaming. El pipeline multipunto/cloud es Fase 2 (ver al final).

---

## 1. Principio rector: una config, dos gemelos

No se inventa un backend nuevo. El gemelo UE **lee exactamente las mismas fuentes** que
el 2D, identificando el punto por `?loc=<id>`:

```
                    ┌─────────────────────────────────────────────┐
 admira.app (mapa)  │  KV omnipublicity  ·  signage feed  ·  IA    │
   ?loc=<id> ──────►│  (fuente única de verdad, ya en producción)  │
        │           └─────────────────────────────────────────────┘
        │                         ▲                  ▲
        ├──► Gemelo 2D (game.html) ┘                  │
        └──► Gemelo HD (UE5 + Pixel Streaming) ───────┘   ← ESTO
```

- **Config del punto** → `GET https://omnipublicity-api.csilvasantin.workers.dev/locations`
- **Contenido de las pantallas (signage real)** → `https://pixer-eleven.csilvasantin.workers.dev/signage/feed?screen=<screenId>&limit=1`
- **IA del MetaHuman** → mismo backend que `askAdmiraGrok` (ver §6)

---

## 2. Stack y decisiones (confirmadas con Carlos)

| Decisión | Elección |
|---|---|
| Motor | **Unreal Engine 5.4+** (Lumen + Nanite) |
| Entrega | **Pixel Streaming → navegador** (WebRTC). Se abre desde admira.app |
| Render host (Shoptalk) | **Workstation Lenovo × Nvidia RTX del stand** (nativo, sin coste cloud) |
| Exposición web | **Tailscale Funnel** desde el host (igual que el server Yarig) |
| Quién monta UE | Freelance/3rd party UE. **Carlos/Claude entregan esta spec + la web ya cableada** |

La parte web (botón en admira.app + convención `?loc=`) **ya está hecha** (ver §7); el dev
UE solo necesita levantar el proyecto + signalling y darnos la URL pública.

---

## 3. Proyecto UE5 — alcance realista para 6 días

**No modelar desde cero.** Partir de un entorno de tienda de Fab/UE Marketplace
(convenience store / modern retail / kiosk) y **redecorarlo como Xtanco**:

- Branding Admira/Xtanco en fachada y corona LED (ver §4 banner).
- Materiales Megascans para realismo (suelo, mostrador, estanterías).
- **N pantallas de signage** colocadas según `STORE_CFG.screens` (ver §4): 1 TFT pared larga
  + 0–2 monitores pared corta + escaparate exterior. Cada una es un `MediaTexture` (ver §5).
- **1 MetaHuman** como asistente/dependiente en el punto del tótem (ver §6).
- Iluminación cálida de tienda, hora del día fija (no hace falta ciclo día/noche para el MVP).

Entregable mínimo: el punto se ve fotorrealista, las pantallas muestran el creativo real
que está sonando, y el MetaHuman saluda y responde por voz.

---

## 4. Contrato de configuración (KV → escena)

Al arrancar, UE recibe `loc` (ver §7 cómo llega) y hace:

```
GET https://omnipublicity-api.csilvasantin.workers.dev/locations
→ { "locations": [ { …punto… }, … ] }
```

Busca el objeto con `id === loc` (case-insensitive) y mapea:

| Campo KV | Tipo | Uso en la escena UE |
|---|---|---|
| `id` | string | clave del punto |
| `name` | string | rótulo en la corona LED + escaparate ("WELCOME TO …") |
| `addr` | string | 2ª línea del rótulo / dirección |
| `kind` | string | `'supermercado'` → variante súper; resto → Xtanco |
| `surfaces` | array | superficies; cuenta de `surface ∈ {pantalla, escaparate}` define el nº de pantallas |
| `screens` | number | nº de pantallas a mostrar (= surfaces de pantalla+escaparate). 1→solo TFT larga; 2→+1 corta; ≥3→+2 cortas |
| `music` | string | hilo musical (lounge/techno/dj/pop/flamenco/seoul/trap…) → ambiente de audio |
| `cameras` | bool | si `false`, ocultar la cámara de seguridad / LiveCam |
| `employees` | `[{name, role, since}]` | personajes del equipo (role: cajero·repositor·azafata·manager·dj). `since` = antigüedad ISO |

> Misma estructura exacta que `window.STORE_CFG` en `game.html` (ver `loadStoreCfg` ~L990).
> Si el `fetch` falla, reintentar 4× con backoff (el worker arranca en frío). Sin punto → escena genérica.

**CORS:** el worker ya permite `https://www.carlossilva.info`. Para el host del stand
(dominio Tailscale Funnel) habrá que **añadir ese origen** a `DEFAULT_ALLOWED_ORIGINS` del
worker `omnipublicity-api` (avisar a Carlos/Claude con el hostname final).

---

## 5. Signage real en las pantallas (el "wow" del demo)

Cada pantalla de la escena = un **`UMediaPlayer` + `UMediaTexture`** que refleja lo que se
emite de verdad. Cada surface de pantalla del KV puede traer `pixerScreens: [screenId,…]`.

- Polling cada **~5 s** (igual que el 2D): 
  `GET https://pixer-eleven.csilvasantin.workers.dev/signage/feed?screen=<screenId>&limit=1`
- La respuesta da el último item del feed para esa pantalla: un objeto con la **URL del
  creativo** (imagen o vídeo MP4/HLS) y su tipo. Cargar esa URL en el MediaPlayer.
- Si no hay `pixerScreens` en la surface, usar el feed global: `/signage/feed?limit=1`.
- Pantallas sin contenido → mostrar el "rótulo del local" (name + addr) como fallback,
  igual que hace el 2D.

> Resultado: el creativo que gana la subasta RTB en admira.app aparece, en tiempo casi real,
> en la pantalla del gemelo fotorrealista. (Opcional Fase 2: empujar desde admira.app vía
> `POST /signage/push` con `target=<screenId>` y verlo caer en la escena.)

---

## 6. MetaHuman + IA (Nvidia ACE)

El tótem "Metahuman" del 2D pasa a ser un **MetaHuman de UE**:

- **Voz/labios:** Nvidia **Audio2Face / ACE** (encaja con el stand Nvidia) o Convai.
- **Cerebro:** mismo backend conversacional que `askAdmiraGrok` del juego. Contrato sugerido
  (un thin proxy/worker que UE llama por HTTP):

```
POST <AI_ENDPOINT>
{
  "loc": "<id>",
  "question": "¿tenéis tabaco de liar?",
  "context": "<resumen del punto: nombre, dirección, nº pantallas, música,
               cámaras, y EQUIPO con nombres/roles/antigüedad>"
}
→ { "answer": "Sí, en la estantería 2…", "voice": "<url mp3 opcional>" }
```

- El `context` lo construye el equivalente de `buildTeamContext()` del juego (el MetaHuman
  conoce al equipo real del punto: nombres, roles, antigüedad). Reusar esa lógica.
- Para el MVP basta texto→voz; el avatar foto-real ya es el diferencial.

---

## 7. Entrada web (YA CABLEADO — no requiere trabajo UE)

`admira.app` ya tiene el punto de entrada:

- Constante `TWIN_HD_BASE` en `admira-app/index.html` (hoy **vacía** → botón oculto).
- Botón `#p-twin-hd` "🎥 Gemelo Hiperrealista" en la ficha de cada punto.
- Cuando se rellene `TWIN_HD_BASE` con la **URL pública del player de Pixel Streaming**
  (o un punto defina `twinHD` en `locations.js`), el botón aparece y abre
  `TWIN_HD_BASE?loc=<id>` en nueva pestaña.

**Lo único que tiene que entregar el dev UE:** la URL pública del player (p.ej.
`https://<host-stand>.tailXXXX.ts.net/`). Con eso, Carlos/Claude rellena `TWIN_HD_BASE`.

### Cómo llega `?loc=<id>` a Unreal
Pixel Streaming permite pasar parámetros del navegador al juego:
- Vía la **query string del frontend** de Pixel Streaming → leer en UE el parámetro de URL
  con el plugin de PS (`PixelStreamingInput` / mensajes del data channel), **o**
- Vía la **Remote Control API** de UE (HTTP/WebSocket) si se prefiere control externo.

Al recibir `loc`, UE ejecuta el flujo de §4 (fetch KV → configurar escena).

---

## 8. Hosting Pixel Streaming (Shoptalk, coste cero cloud)

En la **workstation Lenovo × Nvidia del stand**:

1. Empaquetar el proyecto UE con el plugin **Pixel Streaming** habilitado.
2. Levantar el **Signalling/Web server** de Epic (`SignallingWebServer`, incluido con el plugin).
3. Exponer el puerto del web player con **Tailscale Funnel** (mismo patrón que el server Yarig
   del gemelo): `tailscale funnel <puerto>` → URL pública `https://<host>.tailXXXX.ts.net/`.
4. Dar esa URL → se pone en `TWIN_HD_BASE`.

> Latencia mínima y **0 € de cloud**: la GPU es la del stand. (Fase 2 remota: GPU cloud
> bajo demanda AWS g5 / Azure NV, encendida solo cuando se use — **pasar por Carlos** antes,
> regla "no pagar más sin aprobar".)

---

## 9. Plan de 6 días (orientativo)

| Día | Hito |
|---|---|
| 1 | Proyecto UE5 + Pixel Streaming local OK. Entorno tienda prefab elegido y abierto. |
| 2 | Redecorar como Xtanco (branding, corona LED, materiales). Hora/luz fijada. |
| 3 | N pantallas como MediaTexture + polling al signage feed (1 pantalla real funcionando). |
| 4 | Fetch KV `/locations` por `?loc=` → name/addr en rótulos, nº pantallas, audio musical. |
| 5 | MetaHuman + voz (ACE/Audio2Face) conectado al backend IA. |
| 6 | Empaquetar + Signalling + Tailscale Funnel + dar URL. Pruebas en la workstation del stand. |

---

## 10. Checklist para el dev/artista UE

- [ ] UE 5.4+, plugins **Pixel Streaming** + **MetaHuman** + (ACE/Audio2Face o Convai).
- [ ] Entorno de tienda prefab redecorado como Xtanco.
- [ ] Lee `?loc=<id>` (PS frontend o Remote Control) y hace `fetch` al KV (§4).
- [ ] Pantallas = `MediaTexture` con polling al signage feed (§5).
- [ ] MetaHuman con voz, cableado al backend IA (§6).
- [ ] Empaquetado + Signalling server + **URL pública por Tailscale Funnel** (§8).
- [ ] Avisar del **hostname final** para añadirlo al CORS del worker omnipublicity.

## 11. Riesgos / fallback
- **Tiempo (6 días):** si la IA del MetaHuman no llega, dejarlo con respuestas pregrabadas;
  lo crítico es el entorno foto-real + signage real.
- **Red del stand:** tener el build **nativo** como plan B si el WiFi del recinto no da para
  WebRTC fluido (Pixel Streaming local por LAN, o pantalla directa de la workstation).
- **CORS:** no olvidar añadir el origen del host al worker (si no, ni KV ni signage cargan).

---

## 12. Fase 2 (post-Shoptalk)
- Config-driven multipunto (cualquier `?loc=` del KV abre su gemelo HD).
- Shell web con chrome Admira alrededor del player.
- GPU cloud on-demand para acceso remoto 24/7.
- Paridad de estado con el 2D (empleados en vivo, DVR/replay, `/report` al diario).
- Empujar creativo desde admira.app (`/signage/push target`) y verlo en la escena UE.
