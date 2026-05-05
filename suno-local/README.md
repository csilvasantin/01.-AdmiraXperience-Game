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

1. Login en `https://suno.com` en Chrome.
2. F12 → Network → recarga.
3. Filtra por `clerk` y abre cualquier request a `clerk.suno.com`.
4. Pestaña Headers → copia el valor entero del header `Cookie:`.
5. `cp .env.example .env`
6. Pega la cookie en `SUNO_COOKIE=` del `.env`.

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
- **`clerk response missing jwt`** → versión Clerk JS cambió. Mira un request real
  a `clerk.suno.com/v1/...` y actualiza `SUNO_CLERK_JS_VERSION` en `.env`.
- **`suno generate 401|403`** → JWT no autorizado o `mv` desconocido. Comprueba
  que `chirp-v4-5` sigue activo en tu cuenta.

## Riesgos asumidos

- Funnel pública = cualquiera con la URL puede pegarle (rate-limit + origin gating
  mitigan, no eliminan).
- Suno puede banear la cuenta si detecta uso fuera de la web. Uso personal moderado.
- Cookie = control total de la cuenta. Solo en `.env`. Si filtras la cookie,
  `Settings → Sign out of all devices` en suno.com la invalida.
