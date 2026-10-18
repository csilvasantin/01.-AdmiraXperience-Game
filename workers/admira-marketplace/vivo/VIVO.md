# admira-marketplace · código en producción

`vivo/index.js` es el código que corre en producción desde el 15-sep-2026 (versión de Cloudflare `c9f3544b`), descargado tal cual el 18-oct-2026. No estaba en git: lo publicaron durante el incidente IN-79380980 (purga de `admira-marketplace-db`) y añade, frente a `src/index.js`:

- `EMERGENCY_NO_D1`: con `1` las pujas se pausan y el inventario no toca D1.
- Una caché de inventario de 5 s (`INVENTORY_CACHE_TTL_MS`).

**No publicar `src/index.js` sin pasarle antes esos cambios**: se perdería el modo de emergencia.

Publicar el código vivo (desde esta carpeta del worker, con la clave de la bóveda exportada):

```sh
wrangler deploy vivo/index.js --no-bundle --message "…"
```

`wrangler.toml` lleva todas las variables de producción, `EMERGENCY_NO_D1` incluida. El secreto `ADMIN_TOKEN` se conserva al publicar.

18-oct-2026: `ALLOWED_ORIGINS` suma `https://www.admira.store` (el gemelo de www.admira.store no podía leer `/active-campaigns`). NeoMacStudio · MacStudio.
