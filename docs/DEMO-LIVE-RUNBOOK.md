# Demo LIVE — Plataforma agéntica de Admira (3 navegadores)

Guion para operar **las 3 capas en vivo** y grabar la pantalla. Todo contra el
**mismo punto**: `loc = xtanco-bcn` (Xtanco Barcelona). Si los `loc` no coinciden,
la campaña no aparece en el gemelo y el presupuesto no baja.

## ✨ Opción TOP: 3 ORDENADORES (una capa por máquina)

Lo más espectacular: cada capa en **su propio ordenador**. La extensión Chrome
conecta **varios navegadores a la misma cuenta** Anthropic; Morfeo controla los 3
saltando con `select_browser` (uno cada vez, salto instantáneo; el bucle es
secuencial igual). Ventajas: vista simultánea en 3 máquinas + **sin throttling**.

Cada PC: Chrome con extensión **Claude in Chrome** + **misma cuenta** (csilva@admira.com)
+ **Connect** (ponle nombre: `PixerIA-PC` / `Gemelo-PC` / `Admira-PC`). Mismo
`loc=xtanco-bcn`. Morfeo: `list_connected_browsers` → `select_browser` por máquina.

**Burn en vivo (build 0039):** el gemelo empuja sus impactos exteriores al KV cada
45 s, así en la máquina de admira.app se ve el **presupuesto bajar en tiempo real**
mientras el gemelo mide en otra máquina.

---

## Alternativa: UNA CAPA POR MONITOR (1 ordenador, 3 monitores)
*(Aviso: la extensión solo conduce UNA ventana a la vez. Con 3 ventanas en 3
monitores, Morfeo conduce admira.app y Carlos teclea 2-3 comandos en el gemelo;
o todo en 1 ventana con pestañas y Morfeo conduce el 100%.)*

Tenemos 3 monitores → **una ventana de Chrome por monitor**, así se ve el bucle
agéntico **en directo y simultáneo** entre las 3 pantallas (sin cambiar de pestaña).
Grabación: captura el escritorio extendido (o un plano de los 3 monitores).

| Monitor | Capa | URL |
|---|---|---|
| **Izquierda · A · PixerIA** | Creación de contenido | `https://www.pixeria.com` |
| **Centro · B · Gemelo** | El punto físico digital | `https://www.xpaceos.com/admira-xp/?loc=xtanco-bcn` |
| **Derecha · C · admira.app** | Programática (RTB) | `https://admira.app` (+ pestaña `https://admira.app/help` para el relato) |

> **Ventaja clave del 3-monitor:** cada ventana queda **siempre visible** en su
> monitor, así el navegador **no congela** el gemelo (el throttle de rAF solo ocurre
> con pestañas ocultas/minimizadas). El gemelo corre a tope aunque el foco del SO
> esté en otra ventana. Y el espectador ve, a la vez: lanzar campaña (derecha) →
> PixerIA crear (izquierda) → el gemelo mostrarla y medir (centro) → el presupuesto
> bajar (derecha).
>
> Morfeo conduce las 3 por la extensión Chrome (acción por `tabId`, da igual en qué
> monitor esté cada ventana, mientras sean del mismo Chrome conectado).

Preparación del **Gemelo (B)**:
- Recarga dura (Cmd+Shift+R) para coger la última build.
- `/velocidad 8` (acelera el día para que se vea audiencia ya).
- Opcional: `/avatar3d off` para no distraer.
- El gemelo refresca **CPM cada 60 s** y **campañas cada 45 s**: tras tocar algo en
  admira.app, espera ~1 min o recarga el gemelo.

Verificación rápida (las 3 deben dar 200): `pixeria.com`, `xpaceos.com/admira-xp/`,
`admira.app`. Backend: `pixer-eleven` (KV/R2). 

## Guion (orden de la demo)

**0. Relato (C · admira.app/help).** Abrir la página de ayuda: las 3 piezas en 3
pasos. *"Admira: el espacio mide, la IA crea, la plataforma vende."*

**1. El punto cobra vida (B · Gemelo).** Plano del estanco con gente entrando y
saliendo, pantallas encendidas. *"Esto es un estanco real y su gemelo digital."*

**2. Mide la audiencia (B · Gemelo).** `/mupicam` → galería de viandantes (♂♀,
niños, jóvenes, mayores con bastón). Pulsar **✨** en uno → **PixerIA lo convierte
en una persona real**. *"Medimos quién pasa, por género y edad — y la IA puede
recrearlo."*

**3. El motor de contenido (A · PixerIA).** Enseñar `pixeria.com`: música, imagen,
vídeo, locución, y el **Stock** donde caen los assets. *"Todo el contenido lo crea
la IA y queda reutilizable."*

**4. Fijar precios RTB (C · admira.app).** Panel **"✎ CPM por segmento"** → poner,
p.ej., ♀ Joven = 9 €, ♂ Senior = 5 € → **Guardar**. *"Tú fijas el precio de cada
segmento."*

**5. Comprar campaña (C · admira.app).** Panel **"🛒 Comprar campaña"** → Segmento
**♀ Joven** · Producto **"vapeador sabor menta"** · Presupuesto **500 €** →
**Lanzar**. Aparece el **preview de la creatividad generada por PixerIA**. *"En
segundos, la IA crea el anuncio para ese público exacto."*

**6. Se muestra a quien toca (B · Gemelo).** Mirar el **escaparate**: cuando pasa
una **mujer joven** → muestra **esa** creatividad con el badge **"· CAMPAÑA ·"**.
`/impactos` → **impactos por segmento × CPM**. *"Cada persona ve el anuncio que le
corresponde, y se mide."*

**7. El presupuesto baja solo (C · admira.app).** Monitor **"📡 PUBLI EXTERIOR ·
GEMELO"** + la tarjeta de la campaña: la **barra de presupuesto** baja con los
**impactos reales** (multi-día); al tope, **AGOTADA**. *"Lo que se muestra se mide,
y lo que se mide se cobra — en vivo."*

**8. Histórico y DVR (B · Gemelo).** Cerrar el día (NUEVO DÍA) → **calendario**
(clic en la fecha) → **DVR visual** de un día → play. *"Cada día queda registrado;
puedes rebobinar como una cámara de seguridad anónima."*

**9. Cierre.** Diagrama del loop (en admira.app/help). *"Comprar → crear → mostrar
→ medir → cobrar. Automático, segmentado y transparente. La plataforma agéntica de
Admira."*

## Quién opera

Lo conduce **Morfeo** (el agente) sobre los 3 navegadores vía la extensión Chrome
(claude-in-chrome): hace falta tener la extensión conectada y las 3 pestañas
abiertas. Carlos da la señal de "grabando" y Morfeo ejecuta el guion paso a paso.

## Trucos / por si algo no aparece

- **loc desalineado** = la causa nº1. Gemelo SIEMPRE con `?loc=xtanco-bcn`;
  admira.app con Xtanco Barcelona seleccionado (o por defecto, que es el primero).
- Tras Guardar CPM / Lanzar campaña, da **~1 min** o recarga el gemelo (refrescos de
  60/45 s).
- Si quieres **empezar de cero** (sin campañas de prueba previas), usa un loc nuevo:
  gemelo `?loc=demo-live` y, en admira.app, selecciona/usa ese mismo punto.
- Para forzar audiencia rápido en el gemelo: `/velocidad 8`.

## Hallazgos del ENSAYO (14-jun, importantes para que salga perfecta)

1. **La pestaña del gemelo debe estar EN PRIMER PLANO mientras grabas.** El navegador
   *throttlea* `requestAnimationFrame` cuando la pestaña está en segundo plano → los
   viandantes se congelan y no se acumulan impactos. Con la pestaña visible (grabando)
   corre normal. (Por eso conviene grabar el gemelo a pantalla y cambiar de capa con
   Cmd+Tab, no dejarlo detrás.)
2. **Presupuesto pequeño para que se vea AGOTAR.** El CPM es €/1000 impactos: con
   presupuestos grandes (500€) la barra no se mueve a ojo. Para la demo usa **2–5 €**:
   p.ej. ♀ Joven a 11€ CPM con ~300 impactos = 3,30€ → **AGOTADA** (validado por API).
3. **Generar audiencia exterior:** `/velocidad 8` + repetir **`/audienciaOUT 14`** un
   par de veces (el cap de viandantes activos es 2, drena poco a poco). Cuantos más
   pasen, más impactos por segmento.
4. **Re-enfocar el cuadro de comandos** del gemelo antes de cada `/comando` (tras
   enviar uno, vuelve a hacer click en el textarea).
5. **Bug corregido en el ensayo (build 0038):** la clave de segmento de los impactos
   exteriores se generaba `gender_age` en el gemelo y `age_gender` en el resto →
   ahora ambos `age_gender` (`joven_f`). Sin esto el CPM por segmento y el consumo de
   presupuesto NO casaban. **Ya arreglado y validado** (300 imp × 11€ = AGOTADA).
6. **loc limpio para la demo:** `xtanco-bcn` arrastra datos de pruebas; para empezar
   de cero usa **`?loc=demo-live`** en el gemelo y el mismo punto en admira.app.

*Builds de referencia: gemelo `20260614-0038`; admira.app con CPM editable, compra
de campaña + creatividad PixerIA, presupuesto multi-día y claves de segmento
alineadas. Ensayo realizado vía extensión Chrome el 14-jun.*
