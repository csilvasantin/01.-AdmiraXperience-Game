# Demo LIVE — Plataforma agéntica de Admira (3 navegadores)

Guion para operar **las 3 capas en vivo** y grabar la pantalla. Todo contra el
**mismo punto**: `loc = xtanco-bcn` (Xtanco Barcelona). Si los `loc` no coinciden,
la campaña no aparece en el gemelo y el presupuesto no baja.

## Setup (antes de grabar)

| Ventana | Capa | URL |
|---|---|---|
| **A · PixerIA** | Creación de contenido | `https://www.pixeria.com` |
| **B · Gemelo** | El punto físico digital | `https://www.xpaceos.com/admira-xp/?loc=xtanco-bcn` |
| **C · admira.app** | Programática (RTB) | `https://admira.app` (y `https://admira.app/help` en otra pestaña para el relato) |

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

*Builds de referencia: gemelo `20260614-0037`; admira.app con CPM editable, compra
de campaña + creatividad PixerIA y presupuesto multi-día.*
