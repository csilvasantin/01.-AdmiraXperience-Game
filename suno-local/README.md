# suno-local

Proxy mínimo a la API privada de Suno usando cookie de sesión (Clerk). Reverse
engineering — frágil, puede romper cualquier semana cuando Suno cambie endpoints.

## Endpoints

```
GET  /healthz           → { ok, total_credits_left, monthly_limit, monthly_usage }
POST /generate          → { clips: [...] }
                          body: { prompt, instrumental?, model: 'chirp-v4'|'chirp-v4-5' }
GET  /status?ids=a,b    → [ {id, status, audio_url, ...} ]
```

`POST /generate` está gated por `Origin` (`https://csilvasantin.github.io`,
`http://localhost`, `http://127.0.0.1` por defecto) y rate-limit `3/min/IP`.
`/status` rate-limit `60/min/IP`. `/healthz` abierto.

## Setup (1 vez)

Suno usa **Clerk v5** y el host de Clerk es **`auth.suno.com`** (no `clerk.suno.com`).

1. Login en `https://suno.com` en Chrome.
2. F12 → Network → recarga.
3. Filtra por `auth.suno.com` y abre **la primera request a `/v1/client?_clerk_js_version=...`**.
   - **NO** la del bundle JS (`/npm/@clerk/clerk-js@5/dist/clerk.browser.js`) — ese fichero estático no lleva cookie.
   - Sí la API call: `auth.suno.com/v1/client?_clerk_js_version=...` (status 200, content-type JSON).
4. Pestaña Headers → bloque Request Headers → copia el valor entero del header `Cookie:`
   (la línea larguísima que empieza por `__client_uat=...; __client=...; __session=...`).
5. `cp .env.example .env`
6. Pega la cookie en `SUNO_COOKIE=` del `.env` (todo en una sola línea, sin comillas).

## Arrancar

```sh
./start-suno-local.sh
```

Levanta el server en `127.0.0.1:3777` y refresca la ruta Tailscale Funnel
`/suno → http://127.0.0.1:3777`. La URL pública queda
`https://macmini.tail48b61c.ts.net/suno`.

## Comprobaciones

```sh
curl -s http://127.0.0.1:3777/healthz
curl -s https://macmini.tail48b61c.ts.net/suno/healthz
```

Ambas deben devolver `{"ok":true,"total_credits_left":<n>,...}`.

## Cuándo recoplar la cookie

- Cambias de IP o pasas tiempo desconectado → Suno te desloguea.
- `/healthz` empieza a devolver `{ok:false,error:"clerk client list failed 401"}`.
- Repite los pasos 1-6 de Setup.

## Troubleshooting

- **`SUNO_COOKIE no esta definido`** → revisa `.env` (no debe llevar comillas).
- **`clerk client list failed 401`** → cookie expiró, recopia.
- **`clerk client list failed 404`** → host Clerk cambió. Mira el dominio real en
  devtools (filtra por `clerk` o `auth.suno`) y pon `SUNO_CLERK_HOST=...` en `.env`.
- **`clerk response missing jwt`** → versión Clerk JS cambió. Mira un request real
  a `auth.suno.com/v1/...` y actualiza `SUNO_CLERK_JS_VERSION` en `.env`.
- **`suno generate 401|403`** → JWT no autorizado o `mv` desconocido. Comprueba
  que `chirp-v4-5` sigue activo en tu cuenta.
- **`billing http 503` ("Service Suspended")** → Suno ha movido el host de la API.
  Mira en devtools cualquier request a un host `studio-api-*.suno.*` o `api.suno.*`
  y pon ese host en `SUNO_API_BASE` del `.env`. El default actual (mayo 2026) es
  `https://studio-api-prod.suno.com`. El antiguo `studio-api.suno.ai` esta apagado.

## Riesgos asumidos

- Funnel pública = cualquiera con la URL puede pegarle (rate-limit + origin gating
  mitigan, no eliminan).
- Suno puede banear la cuenta si detecta uso fuera de la web. Uso personal moderado.
- Cookie = control total de la cuenta. Solo en `.env`. Si filtras la cookie,
  `Settings → Sign out of all devices` en suno.com la invalida.
