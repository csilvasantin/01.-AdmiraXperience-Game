# La Plataforma Agéntica de Admira — Documentación y guion de vídeo

> Documento de referencia para entender, demostrar y grabar un vídeo explicativo de
> la plataforma agéntica de Admira. Escrito el 14-jun-2026 sobre la build
> `20260614-0036` del gemelo Admira XP. Pensado para que **cualquiera** —anunciante,
> retailer, inversor— entienda las ventajas en 3 minutos.

---

## 0. La idea en una frase

**Admira convierte cualquier punto físico (un estanco, una tienda) en un gemelo
digital vivo que mide su audiencia real, genera su propia publicidad con IA y la
vende de forma programática y segmentada — todo en un bucle automático.**

Tres piezas, una sola plataforma agéntica:

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Gemelo Admira XP** | El "digital twin" jugable del punto físico: simula clientes, ventas, pantallas y audiencia en tiempo real. | `carlossilva.info/01.-AdmiraXperience-Game` y `xpaceos.com/admira-xp` |
| **PixerIA** | El motor de creación de contenido por IA: imágenes de producto, humanos foto-realistas, creatividades por segmento, locución, vídeo, música. | `pixeria.com` + worker `pixer-eleven` |
| **admira.app** | La capa programática (RTB): define audiencias, fija el CPM por segmento, lanza campañas y ve los impactos reales en vivo. | `admira.app` |

Todo se comunica por un backend común (Cloudflare Workers + KV/R2): el gemelo
**mide y reporta**, PixerIA **crea**, admira.app **fija precio y vende**, y el bucle
se cierra solo.

---

## 1. El gemelo digital (Admira XP)

Es la réplica jugable y configurable de un punto real (hoy, el estanco "Xtanco").
Cada punto se autoconfigura desde el KV de `omnipublicity` (pantallas, hilo musical,
cámaras, equipo, ubicación): un mismo motor sirve a toda la **red de tiendas**.

Lo que simula y muestra en vivo:
- **Clientes y viandantes** entrando, paseando y comprando (NPCs "chibi").
- **Pantallas de señalización**: escaparate, TFT de la pared larga, monitores, tótem.
- **Ventas (TPV)**, satisfacción, fama, ingresos.
- **Ciclo de día**: a la hora de cierre se vacía el Xpacio, se muestran los
  **resultados del día** y arranca uno nuevo (botón "NUEVO DÍA").

### Calendario histórico + DVR
- **Calendario** (clic en la fecha del topbar o `/calendario`): desde el 1-ene-2026
  hasta hoy, panel flotante movible/redimensionable, con **selector de KPIs**
  (Audiencia, Facturación, Ticket Medio, Producto top) que colorea el mes.
- **DVR**: rebobina el día como una **cámara de seguridad anónima** — puedes ir al
  3 de junio y darle al play para ver entrar y salir a la gente. Los días reales
  usan datos guardados; los no jugados se reconstruyen de forma determinista.
- **Persistencia real**: al cerrar cada día, el gemelo guarda en KV su resumen
  (clientes, ventas, beneficio, curva por horas, compras por producto, impactos de
  publi por segmento). El calendario lo marca como **real** (🟢) vs estimación.

---

## 2. Audiencia real y medición (la base del valor publicitario)

El gemelo no inventa la audiencia: la **mide**.

- **Dos cámaras MUPI**:
  - **Exterior** — fotografía a los **viandantes** que pasan por el escaparate
    (impactos de **calle**).
  - **Interior** — fotografía a los **clientes** dentro de la tienda (impactos de
    **tienda**).
  - Galería con selector Exterior/Interior; en modo DVR filtra a la gente de ese momento.
- **Panel de impactos / CPM** (`/impactos`): aforo real (**en tienda ahora** vs
  acumulado del día), audiencia por franja horaria con detección de **prime time**,
  impactos por pantalla, **atención real** (quién mira ≠ quién pasa), CPM de
  referencia e **ingreso estimado**.
- **CPM dinámico (Modelo 3)**: el precio sube con la **demanda** (ocupación +
  prime) y la **calidad** (atención medida). Es RTB: el inventario vale más cuando
  hay más y mejor audiencia.

### Segmentación de la audiencia (género × edad)
Los NPCs llevan **género marcado** (las mujeres con falda) y **edad** visible:
- **Niño** (más bajito), **Joven**, **Adulto**, **Senior** (encogido, pelo cano y bastón).

Esto permite **medir y vender por segmento**, no por bulto.

---

## 3. PixerIA — el contenido lo hace la IA

PixerIA genera todo el contenido que consume el gemelo, y lo publica al **Stock**
reutilizable. Casos ya operativos:

- **Imágenes de producto** (tabaco, vapeadores, prensa, lotería, chuches, recarga,
  premium, accesorios): generadas con Grok, se ven en el TPV y el cross-selling.
- **NPC → humano real**: en la galería de la cámara, un botón ✨ convierte el
  muñequito capturado en una **persona foto-realista** que se le parece (img2img),
  "como si hubiera estado allí". Botón 📌 para guardarla en el Stock.
- **Creatividades publicitarias por segmento**: chuches (niño), vapeadores (joven
  ♂/♀), perfume (adulto ♂/♀), prensa·lotería (senior ♂/♀) — el escaparate muestra
  la adecuada a quién pasa.
- **Avatar 3D / Metahuman** foto-realista en el tótem y la pared (DigitalAvatar.ai),
  con voz e idioma de la plataforma; se le habla o se le pregunta por CLI.
- Además: locución, música, vídeo, edición de imagen con IA (todo con tag de
  calidad good/better/best).

---

## 4. admira.app — la capa programática (RTB)

Es donde se hace la parte programática:
- **Circuitos y puntos**: selección de inventario (la red de tiendas).
- **Target de campaña**: emplazamiento (exterior/interior), **género**, **edad**,
  **franja horaria** — la misma taxonomía que mide el gemelo.
- **CPM por segmento editable** ("✎ CPM por segmento (RTB)"): fijas el precio de
  cada segmento (♂♀ × niño/joven/adulto/senior) y se guarda en KV.
- **Monitor en vivo** ("📡 PUBLI EXTERIOR · GEMELO"): muestra los **impactos reales
  por segmento** que reporta el gemelo, multiplicados por tu CPM, con el **ingreso
  de publi exterior de hoy**.

---

## 5. El loop agéntico completo (cómo encaja todo)

```
   admira.app                 PixerIA                 Gemelo Admira XP
  (programática)            (creación IA)              (medición + display)
        │                        │                            │
  1. Defino target          2. Genera la                3. Muestra la creatividad
     (segmento) y              creatividad por             en la pantalla al pasar
     fijo CPM/segmento ──────► segmento, la ──────────►    el viandante de ese
        │                      publica al Stock            segmento (escaparate)
        │                                                       │
        │                                                  4. MIDE el impacto real
        │                                                     (cámaras MUPI) por
        │                                                     género × edad
        │                                                       │
  6. Veo en vivo los         5. El gemelo REPORTA          ◄────┘
     impactos × CPM   ◄────────  los impactos por
     y el ingreso              segmento al KV (día)
```

Backend común: **pixer-eleven** (Workers) con **KV** (`day:<loc>:<fecha>` para los
resúmenes, `segcpm:<loc>` para los precios, `signage` para empujar creatividades) y
**R2** (Stock de assets). El gemelo lee el CPM cada 60 s, así un cambio de precio en
admira.app se aplica casi al instante.

> **Próximo cierre del bucle (en construcción):** comprar una campaña en admira.app
> (segmento + fechas + presupuesto) → PixerIA genera la creatividad → se empuja al
> gemelo por `/signage` → el presupuesto se descuenta según los impactos por
> segmento reales hasta agotarse. La medición y el precio por segmento ya están; lo
> que falta es el **ledger de presupuesto** y el push automático de la campaña.

---

## 6. Otras piezas de retail que ya funcionan

- **TPV con cross-selling**: cada venta dispara en la pantalla de la pared una
  sugerencia complementaria ("¿TE LLEVAS TAMBIÉN?") con imagen del producto.
- **Gestor de turnos partido**: arriba la imagen de lo que se compra en tiempo real,
  abajo el turno/caja.
- **Avatar 3D conversacional** en tótem y pared, con audio on/off y cambio de avatar
  (Ready Player Me) por CLI.

---

## 7. Las ventajas (el "por qué" para el vídeo)

1. **Mide audiencia real, no estimaciones.** Cámaras que cuentan quién pasa, quién
   entra, quién mira — segmentado por género y edad. El anunciante paga por
   impactos reales y cualificados.
2. **El contenido se crea solo.** PixerIA genera la creatividad adecuada a cada
   segmento; no hace falta una agencia para cada versión.
3. **Programática real en el punto físico (DOOH agéntico).** Fijas el CPM por
   segmento y la pantalla muestra a cada persona el anuncio que le toca,
   automáticamente.
4. **Bucle cerrado y transparente.** Lo que se muestra, se mide; lo que se mide, se
   valora; lo que se valora, se ve en vivo en admira.app. Mismo dato de punta a
   punta.
5. **Escala a una red.** Un solo motor, config por punto: lo que vale para un
   estanco vale para toda la red de tiendas.
6. **Es un gemelo, no un PowerPoint.** Todo es demostrable en vivo, jugable, con
   histórico y DVR.

---

## 8. Guion sugerido para el vídeo (≈ 2-3 min)

**Escena 1 — El punto cobra vida (15s).** Plano del gemelo del estanco con gente
entrando/saliendo. Voz: *"Esto es un estanco real… y su gemelo digital. Mismo
mobiliario, misma gente, mismas pantallas."*

**Escena 2 — Mide quién pasa (25s).** Abrir la cámara MUPI: viandantes capturados,
hombres y mujeres, niños, jóvenes, mayores. Voz: *"Admira mide su audiencia real:
cuántos pasan, cuántos entran, quién mira la pantalla — por género y edad."*

**Escena 3 — La publi se adapta sola (25s).** Pasa una mujer joven → el escaparate
muestra vapeadores; pasa un señor mayor → muestra prensa y lotería. Voz: *"Cada
persona ve el anuncio que le corresponde. La creatividad la genera la IA de
PixerIA, en segundos, para cada segmento."*

**Escena 4 — Se vende como programática (25s).** admira.app: fijar el CPM por
segmento, ver el panel "PUBLI EXTERIOR · GEMELO" con los impactos reales × CPM y el
ingreso del día. Voz: *"Tú fijas el precio por segmento. La plataforma muestra los
impactos reales y lo que vale ese inventario, en vivo."*

**Escena 5 — El histórico y el DVR (20s).** Calendario + DVR de un día pasado. Voz:
*"Cada día queda registrado. Puedes rebobinar y ver qué pasó, como una cámara de
seguridad anónima."*

**Escena 6 — El bucle (15s).** El diagrama del loop. Voz: *"admira.app fija el
precio, PixerIA crea, el gemelo muestra y mide, y todo vuelve a admira.app. Un
bucle agéntico que se gestiona solo."*

**Cierre (10s).** Logo Admira. *"Admira: la plataforma agéntica que convierte tu
espacio físico en medio publicitario inteligente."*

---

## 9. Cómo demostrarlo en directo (checklist)

1. Abrir el gemelo (`xpaceos.com/admira-xp`), `/velocidad 8` para acelerar.
2. `/mupicam` → enseñar la galería de viandantes; ✨ humanizar uno.
3. Mirar el escaparate cambiar de creatividad según pasa gente (♀/♂ + edad).
4. `/impactos` → enseñar aforo real, franjas, **impactos por segmento × CPM**.
5. En **admira.app**: abrir "✎ CPM por segmento", cambiar un precio, Guardar →
   volver al gemelo y ver el ingreso recalcularse.
6. Cerrar el día (NUEVO DÍA) → abrir el **calendario** → abrir el **DVR visual** de
   un día → play.

---

*Builds de referencia (jun-2026): gemelo `20260614-0036`; workers pixer-eleven /
omnipublicity-api; admira.app con editor de CPM por segmento y monitor en vivo.*
