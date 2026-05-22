# Draw Things local bridge

Bridge local para que `www.admira.studio/studio/` pueda generar imagenes usando Draw Things en este Mac.

## Arranque

```bash
cd "/Users/csilvasantin/Documents/New project/csilvasantin-repos/01.-AdmiraXperience-Game"
python3 drawthings-local/server.py
```

Por defecto escucha en `http://127.0.0.1:7869` y usa `flux_2_klein_4b_q6p.ckpt`.

En este Mac queda instalado ademas como LaunchAgent:

```bash
launchctl print gui/$(id -u)/studio.admira.drawthings-bridge
```

## Variables utiles

```bash
DRAWTHINGS_MODEL=flux_2_klein_4b_q6p.ckpt
DRAWTHINGS_BRIDGE_PORT=7869
DRAWTHINGS_OUTPUT_DIR=./drawthings-local/outputs
```

La CLI descarga el modelo si falta. La primera generacion puede tardar bastante porque baja pesos y prepara cache local.
