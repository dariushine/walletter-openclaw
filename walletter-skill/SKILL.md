---
name: "walletter"
description: "Operar el plugin walletter (wallets, transacciones, exchanges, tasas, recurrentes, pagos pendientes, stats, reportes) usando sus tools walletter_*."
---

# Skill: Walletter

Operar las finanzas de Freddy a través del plugin `walletter` usando sus tools `walletter_*`. NO usar curl: usar siempre las tools del plugin, disponibles en la sesión.

## Cuándo usar

Freddy pide cualquier operación sobre sus finanzas a través de Walletter (el rework .NET): ver billeteras/categorías/balance, registrar o editar transacciones, hacer exchanges (con su fee), ver tasas, pagos recurrentes, **pagos pendientes**, stats o reportes. Si menciona "usa el plugin" o "usa walletter", cargar esta skill y seguir su método.

## Tools del plugin (39)

| Tool | Función |
|---|---|
| `walletter_health` | Verifica que la API responde (`ok`, `status`). |
| `walletter_lookup` | **Resuelve billeteras, categorías y el timezone del usuario juntos** (ids y nombres), cacheado. Devuelve `wallets` + `categories` + `timezone` (IANA, ej. `America/Caracas`) + `cachedAt`/`cachedAtIso`. Usar `refresh:true` para forzar recarga. |
| `walletter_cache_refresh` | Fuerza recarga del cache de wallets/categorías. |
| `walletter_balance` | Balance consolidado por moneda **+ lista simplificada de billeteras** (`{ name, balance }`). Lee/rellena el cache. **Omite** las billeteras marcadas `hideInDashboard` o `excludeFromTotal`. |
| `walletter_wallets` / `walletter_wallet_get` | Lista / detalle de billeteras. **_No hay create/update/delete de billeteras_**: son de solo lectura. Para crear una billetera nueva NO existe tool; si hace falta, se le pregunta al usuario.** |
| `walletter_categories` | Lista categorías. |
| `walletter_category_create` | Crea categoría (name, type income/expense, color?). |
| `walletter_category_update` / `walletter_category_delete` | Edita / borra (soft) categoría. |
| `walletter_transactions` | Lista transacciones (filtros walletId/from/to/page/limit). |
| `walletter_transaction_get` | Detalle de una transacción por id. |
| `walletter_transaction_create` | Crea transacción (walletId, categoryName, type, amount, date, time). |
| `walletter_transaction_update` / `walletter_transaction_delete` | Edita / borra (soft) transacción por id. |
| `walletter_transaction_add_fee` | Añade una **comisión** (fee) como transacción hija (`POST /transactions/:id/fee`). Deduce del balance de la misma billetera. |
| `walletter_transaction_associate` | Crea una **transacción asociada** (hija) ligada a un padre (`POST /transactions/:id/associate`). |
| `walletter_exchanges` / `walletter_exchange_get` | Lista / detalle de exchanges. |
| `walletter_exchange_create` | Crea exchange (fromWalletId, toWalletId, fromAmount, toAmount, fee?, creditFee?, date, time). |
| `walletter_exchange_update` / `walletter_exchange_delete` | Edita / borra (soft) exchange. |
| `walletter_rates` | Tasa efectiva del día (BCV + paralelo) o de una fecha (`date` opcional `YYYY-MM-DD`). |
| `walletter_recurring` / `walletter_recurring_get` | Lista / detalle de pagos recurrentes. |
| `walletter_recurring_create` | Crea pago recurrente (name, amount, currency, type, categoryName?/categoryId?, walletId?, fee?). |
| `walletter_recurring_execute` | Ejecuta un pago recurrente generando una transacción real (date, time; overrides opcionales). |
| `walletter_recurring_update` / `walletter_recurring_delete` | Edita / borra pago recurrente. |
| `walletter_pending` | Lista **pagos pendientes** activos (no pagados ni cancelados). `includePaid:true` incluye el historial de pagados. |
| `walletter_pending_get` | Detalle de un pago pendiente por id. |
| `walletter_pending_create` | Crea pago pendiente (name, amount, currency, type, categoryName?, walletId?, fee?, dueDate? `YYYY-MM-DD`). |
| `walletter_pending_pay` | **Paga** un pendiente generando una transacción real (date, time; overrides opcionales). Igual que `recurring_execute`. |
| `walletter_pending_mark_paid` | Marca un pendiente como pagado **sin crear transacción** (cuando la transacción real ya se creó por otra vía). `transactionId?` opcional. |
| `walletter_pending_update` / `walletter_pending_delete` | Edita / cancela un pendiente. **No se puede** editar/cancelar uno ya pagado. |
| `walletter_stats` | Estadísticas (overview o `byCategory:true` para por-categoría). |
| `walletter_reports` | Reporte financiero (period?, rate?, tz?). |

## Paso 1 (SIEMPRE) — Resolver billeteras y categorías con `walletter_lookup`

**Cualquier operación de escritura (transacción, exchange, recurrente) empieza SIEMPRE por `walletter_lookup`.** No llames a la API aparte ni inventes ids.

- `walletter_lookup` devuelve `wallets` + `categories` + `timezone` (IANA, ej. `America/Caracas`). Úsalo también para conocer la zona horaria antes de operar con fechas.
- Si el user dio un **nombre** de billetera o categoría, búscalo por `name` o `alias` (case-insensitive) o por `id` dentro de lo devuelto.

## Regla si NO existe la billetera o la categoría (¡importante!)

1. Si lo que menciona el usuario **no aparece** en `walletter_lookup`:
2. **Refresca el cache** (`walletter_lookup` con `refresh:true`, o `walletter_cache_refresh`) y vuelve a buscar.
3. Si **sigue sin aparecer**, el tratamiento **difiere**:
   - **Billetera no existe** → **PREGUNTA al usuario** qué quiere hacer (esa billetera puede existir con otro nombre, o haberse creado en otro lado). **NO la crees por tu cuenta** ni la inventes. La billetera es un activo real; no se asume. Además **no existe tool de crear billetera** en el plugin (solo lecturas). Si la billetera no existe hay que preguntar; no hay forma de crearla desde aquí.
   - **Categoría no existe** → la puedes **crear sobre la marcha**: `walletter_transaction_create` toma `categoryName` como texto y el backend la crea si falta (con su `type` income/expense). No hace falta llamar a `walletter_category_create` previo; basta pasar `categoryName` correcto y el backend la crea.

## Cómo hacer una TRANSACCIÓN

1. `walletter_lookup` → resuelve `walletId` (debe existir; si no, preguntar al user) y el `categoryName` (texto; si no existe, el backend la crea).
2. `walletter_transaction_create` con `{walletId, categoryName, type, amount, date, time}`:
   - `type`: `income` o `expense`.
   - `amount`: en unidades (el backend lo convierte a centavos).
   - `date` `YYYY-MM-DD`, `time` `HH:MM`, `tz` opcional (ej. `America/Caracas`).
   - `fee` opcional: si lleva comisión, pásala inline y el backend crea el hijo `fee` automáticamente.

## Cómo hacer un EXCHANGE

1. `walletter_lookup` → resuelve `fromWalletId` y `toWalletId` (ambas billeteras deben existir; si falta alguna, preguntar al user).
2. `walletter_exchange_create` con `{fromWalletId, toWalletId, fromAmount, toAmount, date, time}`:
   - `fromAmount`: lo que sale de la billetera origen; `toAmount`: lo que entra a la destino (unidades).
   - Fee de débito en `fee`; fee de crédito en `creditFee` (unidades, opcionales).
   - El backend genera el débito y crédito como transacciones automáticamente (categorías de sistema `exchange_out`/`exchange_in`).

## Operaciones comunes

### Crear transacción / exchange
Ver arriba en "Cómo hacer una TRANSACCIÓN" y "Cómo hacer un EXCHANGE".

### Agregar comisión (fee) a una transacción
1. Obtén el `id` de la transacción padre (con `walletter_transactions` / `walletter_transaction_get`).
2. `walletter_transaction_add_fee` con `{id, amount, date, time}` — `amount` es la comisión en unidades; se deduce de la misma billetera. `category` será `fee` (sistema). `tz` opcional.
3. **Restricciones (back-end):** no se puede agregar fee a una comisión ni a una transacción que pertenezca a un exchange.

### Crear transacción asociada (hija)
1. Obtén el `id` de la transacción padre.
2. `walletter_transaction_associate` con `{id, amount, type, categoryName, date, time}` — `type` es `income`/`expense`, `categoryName` no puede ser de sistema (`fee`/`exchange`). `fee`, `description` y `tz` opcionales. Se liga al padre con `parentTransactionId`.
3. **Restricciones (back-end):** no se puede asociar a una comisión ni a una transacción de exchange; la fecha/hora no puede ser anterior a la del padre.

### Pagos recurrentes
1. `walletter_recurring` → lista los recurrentes existentes (para conocer `id`).
2. `walletter_recurring_create` para crear; `walletter_recurring_execute` con `{id, date, time}` para disparar una transacción real (con overrides opcionales `overrideAmount`, `overrideCategoryName`, etc.).

### Pagos pendientes
1. `walletter_pending` → lista los pendientes activos (para conocer `id` y estado). `includePaid:true` para ver historial de pagados.
2. `walletter_pending_create` para registrar una deuda/pendiente (name, amount, currency, type, categoryName, walletId?, fee?, dueDate?).
3. `walletter_pending_pay` con `{id, date, time, tz}` para **pagarlo**: genera una transacción real (monto + comisión) y marca el pendiente como pagado. Usa overrides (`overrideAmount`, `overrideWalletId`, etc.) si el pago difiere del registro.
4. **Editar/cancelar**: `walletter_pending_update` / `walletter_pending_delete`. Un pendiente **ya pagado NO se puede editar ni cancelar** (su transacción real quedó fijada).
5. `walletter_pending_mark_paid` SOLO para el caso en que la transacción real ya se creó por otra vía (p. ej. se registró a mano) y solo falta actualizar el estado del pendiente.

### Consultar (walletter)
- Balance: `walletter_balance`.
- Transacciones: `walletter_transactions`.
- Exchanges: `walletter_exchanges`.
- Stats: `walletter_stats`.
- Reportes: `walletter_reports`.

## Notas / trampas

- **Siempre usar las tools del plugin, nunca curl.**
- Montos en **unidades enteras** (el backend los convierte a centavos ×100); fechas/horas con formato estricto.
- `tz` opcional pero recomendado (`America/Caracas`).
- `walletter_balance` devuelve `{ currencies, wallets }`: `currencies` agrupa el total por moneda y `wallets` es la lista resumida de billeteras **con su saldo individual** (`name` + `balance`). **No incluye** billeteras con `hideInDashboard` o `excludeFromTotal` (no cuentan en el total). Si quieres el detalle completo de una billetera (alias, tipo, etc.) usa `walletter_wallets`/`walletter_wallet_get`.
- Si una tool de escritura da `401 API token inválido`, verifica con una de **lectura** (`walletter_lookup`, `walletter_stats`) en la misma sesión: si también da 401, es token/config, no permiso.
- El cache del plugin vive ~60s en memoria; `walletter_lookup refresh:true` lo fuerza.
- `walletter_wallets` y `walletter_categories` **sí existen** en este plugin (a diferencia de finance-system): devuelven los campos completos. Para resolver ids usa igual `walletter_lookup`.
- Los **write de billetera NO existen** (`walletter_wallet_create/update/delete/reactivate` están comentados en el código): las billeteras son de solo lectura. No intentes usarlos.
