# OpenClaw Plugin — Walletter

Plugin de OpenClaw para operar la API **Walletter** (el rework en .NET/EF Core del sistema financiero):
billeteras, transacciones, exchanges, tasas, pagos recurrentes, stats y reportes.

Es el equivalente a `finance-system`, pero apuntando a Walletter (backend ASP.NET Core + EF Core,
Clean Architecture, montos en centavos ×100, tasas ×10000).

## Tools expuestas (34)

| Tool | Función |
|---|---|
| `walletter_health` | Verifica que la API responde. |
| `walletter_lookup` | Resuelve **billeteras, categorías y timezone** juntos, cacheado. |
| `walletter_cache_refresh` | Fuerza recarga del cache de wallets/categorías. |
| `walletter_balance` | Balance consolidado por moneda. |
| `walletter_wallets` / `walletter_wallet_get` | Lista / detalle de billeteras. |
| `walletter_wallet_create/update/delete/reactivate` | CRUD de billeteras. |
| `walletter_categories` / `walletter_category_create/update/delete` | CRUD de categorías. |
| `walletter_transactions` / `walletter_transaction_get` | Lista / detalle de transacciones. |
| `walletter_transaction_create/update/delete` | CRUD de transacciones. |
| `walletter_transaction_add_fee` | Añade comisión (`POST /transactions/:id/fee`). |
| `walletter_transaction_associate` | Crea transacción asociada (`POST /transactions/:id/associate`). |
| `walletter_exchanges` / `walletter_exchange_get` | Lista / detalle de exchanges. |
| `walletter_exchange_create/update/delete` | CRUD de exchanges. |
| `walletter_rates` | Tasa efectiva del día (BCV + paralelo) o de una fecha. |
| `walletter_recurring(/_get/create/execute/update/delete)` | Pagos recurrentes. |
| `walletter_stats` | Estadísticas (overview o by-category). |
| `walletter_reports` | Reporte financiero (period, rate, tz). |

## Configuración

En `openclaw.json` → `plugins.entries.walletter`:

```json
"walletter": {
  "enabled": true,
  "config": {
    "baseUrl": "https://<host>:<puerto>/api",
    "apiKey": "<walletter api token>"
  }
}
```

- `baseUrl`: base de la API **con** `/api`. En producción usa la URL del **frontend** (mismo dominio y puerto), no el backend directo: el frontend (nginx) hace de reverse proxy reenviando `/api` → backend. Ej. si el front sirve en `:3000`: `http://localhost:3000/api` (o `https://tu-dominio/api` si tienes TLS).
- `apiKey`: API token de Walletter (se crea con `POST /api/auth/tokens` → devuelve `{ id, token }`).
  Se envía como header `X-Api-Key` (el backend también acepta `Authorization: Bearer`).

## Build

```bash
npm run setup   # npm install --include=dev
npm run build   # esbuild → dist/index.js + d.ts
```

El plugin es **autocontenido** (`typebox` embebido con esbuild), porque OpenClaw no instala
`dependencies` al instalar desde un path local → evita `Cannot find module 'typebox'`.

## Notas de la API

- Los montos van en **unidades** (el plugin los manda así); el backend los convierte a centavos (×100).
- Fechas: `date` `YYYY-MM-DD`, `time` `HH:MM`, `tz` IANA opcional (default `America/Caracas`).
- Auth: si la API está sin auth (sin `AUTH_USERNAME`/`AUTH_PASSWORD`), igual se envía el token; el
  backend la acepta. Si hay auth, se requiere un API token válido.
