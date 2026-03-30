# XTANCO — Manual del Juego
**Simulador de Estanco Digital · v3.2 · 2026**

---

## Índice
1. [Objetivo del juego](#1-objetivo-del-juego)
2. [Menú principal](#2-menú-principal)
3. [Los clientes](#3-los-clientes)
4. [El stock](#4-el-stock)
5. [Tu equipo](#5-tu-equipo)
6. [La competencia](#6-la-competencia)
7. [Eventos especiales](#7-eventos-especiales)
8. [Gestión económica](#8-gestión-económica)
9. [Controles](#9-controles)
10. [Calificaciones y fin de año](#10-calificaciones-y-fin-de-año)
11. [Modos de juego](#11-modos-de-juego)

---

## 1. Objetivo del juego

Gestiona tu estanco durante **5 años**. Cada año tiene un objetivo de ingresos que debes superar para avanzar.

| Año | Objetivo |
|-----|----------|
| 1   | €2.200   |
| 2   | €5.800   |
| 3   | €12.000  |
| 4   | €23.000  |
| 5   | €40.000  |

**Fin de partida anticipado:**
- No alcanzas el objetivo anual **2 veces** seguidas.
- Tu caja cae por debajo de **€1.000** al pagar las nóminas semanales.

---

## 2. Menú principal

### Selección de idioma
Elige **Castellano** o **English** con las teclas de flecha. El idioma afecta a todos los textos y diálogos.

### Selección de plataforma
- **8 bits (Spectrum)** — Estética pixel art, colores planos, sin gradientes.
- **16 bits (Amiga)** — Gradientes, copper bar animado, sprites detallados.

### Selección de modelo
| Modelo        | Dificultad | Empleados | Productos | Dinero inicial |
|---------------|------------|-----------|-----------|----------------|
| GENERIC       | ★★★ Normal | 4         | 6         | €3.500         |
| GOOD          | ★★ Fácil   | 2         | 4         | €2.800         |
| BETTER        | ★★★★ Difícil| 5        | 6         | €4.500         |
| BEST          | ★★★★★ Experto| 6       | 8         | €6.000         |

### Cómo jugar (intro animado)
Pulsa **▶ CÓMO JUGAR** en el menú principal para ver el tutorial interactivo de 8 slides. Navega con `←` `→` o espera a que avance solo. `ESC` para volver.

---

## 3. Los clientes

Los clientes entran por la puerta derecha, buscan un producto específico y compran (o no) antes de salir.

### Ciclo completo

```
ENTRA → CAMINA AL OBJETIVO → BUSCA (60-80 frames) → COMPRA / SALE
```

### Lógica de compra real (v3.2)

Cada cliente llega con un **producto deseado** (`wantsProdIdx`):
- 70% de probabilidad de querer un producto **que tenga stock**.
- Los **clientes VIP** eligen siempre el producto de **mayor precio** disponible.

#### Si hay stock
- Stock del producto −1.
- Ingresos = precio × factor aleatorio (0.8–1.4) × 1.5 si VIP.
- Satisfacción +0.5.
- Diálogo de compra satisfecha.

#### Si no hay stock
| Situación | Resultado |
|-----------|-----------|
| Empleado a menos de 85 px | Rescata la venta con producto alternativo · `🤝` float · ingreso menor |
| Ningún empleado cerca | Float **SIN STOCK** · satisfacción −2 · cliente sale insatisfecho |

#### Clientes VIP ⭐
- Borde dorado en el sprite.
- Diálogo exclusivo al entrar.
- Compran el producto más caro disponible.
- Pagan ×1.5 el precio base.

---

## 4. El stock

Cada producto tiene un nivel de stock independiente (barra visual en la tienda y en la pestaña STOCK).

### Cuándo reponer
- Stock < 25% → advertencia visual `⚠`.
- Stock = 0 → clientes se van sin comprar y la satisfacción baja.
- Stock < 40% durante una **inspección** → multa automática.

### Cómo reponer
1. Abre el panel lateral (☰ MENU → pestaña **STOCK**).
2. Pulsa **REPONER** junto al producto deseado.
3. Coste: **€150** por producto (llena al máximo).

### Oferta proveedor 📦
Evento aleatorio que reduce el coste de restock a **€75 (−50%)** para un producto durante ~300 frames. Aprovéchalo.

---

## 5. Tu equipo

Hasta **5 empleados** por tienda (más en modelos BETTER/BEST). Cada uno ocupa un puesto fijo en el espacio isométrico.

### Roles

| Rol           | Función principal                     | Contratar | Salario/sem |
|---------------|---------------------------------------|-----------|-------------|
| CAJERO/A      | Ventas automáticas + cobro            | €500      | €130        |
| REPOSITOR/A   | Repone stock visualmente              | €400      | €105        |
| AZAFATA       | Atención al cliente, +ventas          | €450      | €115        |
| STORE MANAGER | Controlado por el jugador (Q/A/O/P)  | €1.200    | €210        |
| DJ            | Efecto strobe + fiesta cuando toca a cliente | €800 | €160   |

### Formación
- Niveles 1 a 5. Cada nivel multiplica las ventas y sube el salario.
- Coste: €200–€380 según rol.
- Acceso: panel lateral → pestaña **PERSONAL** → **FORMAR**.

### Empleado del mes 🏆
Evento aleatorio: un empleado activo sube 1 nivel y recibe +30 de moral de golpe. Badge visible en la barra superior.

### Despido
El empleado camina hasta la puerta y desaparece. El hueco queda libre para contratar a otro.

### Energía y moral
- **Energía**: baja con cada venta (−0.04/frame activo) y se recupera sola.
- **Moral**: baja −2 por semana. Factor multiplicador de ventas: 0.7 (moral=0) a 1.0 (moral=100).

---

## 6. La competencia

Las cuatro marcas del mercado (Altadis, JTI, PM, BAT) están activas y reaccionan al estado de tu tienda.

### Cuotas de mercado
- Visibles en tiempo real en la **barra superior**.
- Si tu **satisfacción sube** → los competidores pierden cuota poco a poco.
- Si tu **satisfacción baja** → los competidores ganan cuota.

### Promo Rival 📢
Evento aleatorio (probabilidad 0.05%/frame):
- Un competidor lanza una promoción agresiva.
- Tu tasa de spawn de clientes se reduce **−35%** durante ~280 frames.
- Su barra en el top se vuelve **roja** y aparece el texto PROMO!
- Float `PROMO RIVAL` en pantalla + sonido de alarma.

### Cómo contraatacar

| Campaña publicitaria | Presión a competidores | Efecto extra |
|----------------------|------------------------|--------------|
| BÁSICA (€350)        | −1 pt a todos          | —            |
| MEDIA (€800)         | −2.5 pt a todos        | —            |
| PREMIUM (€1.800)     | −5 pt a todos          | **Cancela la promo rival activa al instante** |

---

## 7. Eventos especiales

Todos los eventos son aleatorios y pueden ocurrir en cualquier momento durante el día.

| Evento | Probabilidad | Efecto |
|--------|-------------|--------|
| ⚡ Hora Punta | 0.25%/frame | Ventas ×2.4 · Clientes ×2 · Dura ~160 frames |
| 🔍 Inspección | 0.06%/frame | Stock>40%+1 empleado → +8 sat · Si no → multa €600-1.000 + −15 sat |
| 🎉 Festivo | 0.1%/frame | Clientes ×1.6 · Ventas ×1.8 |
| 🌧 Lluvia | 0.04%/frame | Clientes ×0.5 · Thunder flash |
| ☀ Sol | 0.04%/frame | Clientes ×1.5 |
| ⭐ VIP | 0.05%/frame | Cliente premium, paga ×1.5 |
| 🚨 Hurto | 0.04%/frame | <3 empleados → −30% stock · ≥3 → frustrado |
| 📦 Oferta proveedor | 0.08%/frame | Restock −50% para un producto |
| 📢 Promo rival | 0.05%/frame | −35% spawn clientes (~280 frames) |
| 🏆 Empleado del mes | 0.03%/frame | +30 moral · +1 nivel empleado aleatorio |

### Fiesta 🎊
Cuando el **Store Manager** (jugador) toca físicamente a un cliente en la tienda → efecto de fiesta en los monitores TFT durante 180 frames. Evento cosmético.

---

## 8. Gestión económica

### Ingresos
- **Ventas de empleados**: cada empleado tiene una probabilidad base de venta por frame (`SALE_PROB = 0.055`) modificada por moral, nivel, rush y festivo.
- **Compras de clientes**: precio × factor aleatorio (0.8–1.4) por cada cliente que encuentra stock.

### Gastos
- **Nóminas**: se pagan al final de cada semana. Salario × nivel del empleado.
- **Restock**: €150 por producto (o €75 con oferta proveedor).
- **Formación**: €200–€380 por empleado.
- **Publicidad**: €350 / €800 / €1.800.
- **Mejora del local**: €4.500 (nivel 1→2, +15 satisfacción).
- **Multas de inspección**: €600–€1.000.

### Resumen semanal (PAUSA)
Al final de cada semana (480 ticks) se muestra:
- Ingresos semanales
- Gastos semanales
- Neto semanal
- Satisfacción actual

---

## 9. Controles

### Teclado

| Tecla | Acción |
|-------|--------|
| `Q` | Mover manager arriba-izquierda |
| `A` | Mover manager abajo-izquierda |
| `O` | Mover manager arriba-derecha |
| `P` | Mover manager abajo-derecha |
| `ESC` | Pausa / cerrar panel / volver al menú |
| `Enter` / `Space` | Confirmar selección |
| `←` `→` | Navegar entre páginas (intro, help, model select) |

### Interfaz de usuario

| Elemento | Función |
|----------|---------|
| ☰ MENU (botón) | Abre/cierra el panel lateral (4 pestañas) |
| Pestaña VENTAS | Ingresos del año, objetivo, satisfacción, fama |
| Pestaña PERSONAL | Contratar / formar / despedir empleados |
| Pestaña STOCK | Reponer productos, publicidad, mejora del local |
| Pestaña LOCAL | Visitas (comercial, técnico, delegación, GC) |
| ✏ EDIT | Editor de layout de tienda (drag & drop muebles) |
| Top bar | Reloj, ventas, beneficio, satisfacción, clientes, competencia |

---

## 10. Calificaciones y fin de año

Al final de cada año (8 semanas × 480 ticks):

| Calificación | Criterio | Bonus |
|--------------|----------|-------|
| S — LEGENDARIO | ≥150% del objetivo | +€2.500 |
| A — EXCELENTE  | ≥120% del objetivo | +€1.200 |
| B — BIEN       | ≥100% del objetivo | +€400  |
| C — MEJORABLE  | ≥80% del objetivo  | €0     |
| D — INSUFICIENTE | <80% del objetivo | −€600 |

### Ranking final (5 años completos)

| Puntuación | Título |
|-----------|--------|
| < 20.000  | Kiosco de Barrio |
| < 40.000  | Estanco Conocido |
| < 70.000  | Estanco Popular |
| < 100.000 | Estanco Referente |
| ≥ 100.000 | **Xtanco Legendario** |

---

## 11. Modos de juego

### 8 bits — ZX Spectrum
- Tiles planos, sin gradientes.
- Sprites pixel art, contornos duros.
- Borde pixelado (dots 3×3).
- Scanlines CRT sobre los botones.

### 16 bits — Commodore Amiga
- Tiles con `createLinearGradient` (claro arriba, oscuro abajo).
- Bloques isométricos con las 3 caras diferenciadas y líneas de arista.
- Sprites con gradientes de ropa, pelo y piel, iris+pupila, rubor, sonrisa.
- Copper bar animado en la home.
- Sombra radial bajo cada personaje.

### Demo automático
Si no hay input durante **30 segundos** en el menú, arranca el modo demo (IA controla la partida). Cualquier input lo cancela.

### Auto-inicio
Si no hay input durante **5 segundos** en el menú, comienza la partida automáticamente con la última configuración seleccionada.

---

## Historial de versiones

| Versión | Fecha | Cambios |
|---------|-------|---------|
| v3.2 | 2026-03-30 | Clientes con compra real (stock awareness + manager rescue) · Competencia activa (promos rivales + shares dinámicos) |
| v3.1 | 2026-03-29 | Modo 16 bits (Amiga) · Botones home 8/16 bit · Selección de plataforma |
| v2.50 | 2026-03-25 | Versión base — 5 años, 4 modelos, eventos, HUD completo |
