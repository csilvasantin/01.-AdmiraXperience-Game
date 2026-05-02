# layouts/

Layouts "perfect" portables del Xpace OS. Cada fichero define la posición
canónica del mobiliario y del staff para un modelo concreto del cliente.

## Convención de nombres

```
layouts/xtanco-{modelKey}-perfect.json
```

Modelos válidos para Xtanco: `generic`, `good`, `better`, `best`.

## Cómo funcionan

- **`/layout`** (sin args) en el CLI/Telegram del juego hace fetch de
  `layouts/xtanco-{modelKey activo}-perfect.json`, lo aplica y guarda en
  localStorage. Si el fichero no existe, cae al canónico del código.
- **`/layout save`** intenta POST al proxy local (`elgato-proxy.js`,
  endpoint `/layout/save`) que escribe directo en este directorio. Si el
  proxy no responde, descarga el JSON al disco para que lo coloques aquí
  manualmente y hagas commit.
- **`/layout default`** ignora este fichero y aplica el `DEFAULT_LAYOUT`
  hardcoded en `game.html`.
- **`/layout factory`** wipe completo de localStorage + canónico.

## Estructura de cada fichero

```json
{
  "name": "xtanco-generic-perfect",
  "client": "xtanco",
  "modelKey": "generic",
  "schemaVersion": "20260426-public-canonical-1",
  "savedAt": "2026-05-02T15:20:00Z",
  "savedFrom": "AdmiraNext v26.02.05.3",
  "shopLayout": [...],
  "shopStaffPos": [...],
  "shopStaffZones": [...]
}
```

## Flujo recomendado

1. Coloca el mobiliario en pantalla como te guste (modo Editor o `/equipo`,
   `/mobiliario`, etc.).
2. Ejecuta `/layout save` desde la consola Telegram del juego.
3. Si el proxy local está corriendo: el JSON se escribe directo aquí,
   solo tienes que hacer `git add layouts/ && git commit && git push`.
4. Si no: el navegador te descarga el JSON, lo mueves a `layouts/` con el
   nombre correcto y commiteas.
5. Desde cualquier otra máquina/navegador: `/layout` recupera el "perfect"
   sin tener que reconfigurar nada.
