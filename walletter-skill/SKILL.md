---
name: "walletter"
description: "Operar el plugin walletter (wallets, transacciones, exchanges, tasas, recurrentes, pagos pendientes, stats, reportes) usando sus tools walletter_*."
---

# Skill: Walletter

Operar las finanzas de Freddy a través del plugin `walletter` usando sus tools `walletter_*`. NO usar curl: usar siempre las tools del plugin, disponibles en la sesión.

## Cuándo usar

Freddy pide cualquier operación sobre sus finanzas a través de Walletter (el rework .NET): ver billeteras/categorías/balance, registrar o editar transacciones, hacer exchanges (con su fee), ver tasas, pagos recurrentes, **pagos pendientes**, stats o reportes. Si menciona "usa el plugin" o "usa walletter", cargar esta skill y seguir su método.

## Tools del plugin (40)

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
| `walletter_import_transactions` | **Carga por lote (CSV)** de transacciones (`POST /import/transactions`). Args: `csv` (texto), `tz?`, `dryRun?` (**default `true`**). Columnas: `fecha,hora,tipo,billetera,categoria,monto,fee,descripcion`. Rechaza categorías de sistema (`exchange_in`/`exchange_out`/`fee`) por fila. |
| `walletter_import_exchanges` | **Carga por lote (CSV)** de exchanges (`POST /import/exchanges`). Args: `csv` (texto), `tz?`, `dryRun?` (**default `true`**). Columnas: `fecha,hora,origen,destino,monto enviado,monto recibido,fee,creditfee,descripcion`. |
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

### Corregir un EXCHANGE (montos o descripción)
- `walletter_exchange_update` es **parcial**: pasa `id` + solo los campos a cambiar. El rate se recalcula de los montos nuevos.
- **No actualiza la `description`** ni las descripciones de las transacciones hijas (débito/crédito/fee) al cambiar montos: si la descripción embebe el monto queda obsoleta. Pasa la descripción corregida en la misma llamada para no dejar texto viejo.
- Verifica tras corregir con `walletter_exchange_get` (rate, fee, transacciones hijas) y `walletter_balance` (saldos finales).

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

### Carga por lote desde CSV (`walletter_import_transactions` / `walletter_import_exchanges`)

Usar cuando haya **varias filas** que registrar (estados de cuenta, capturas, conciliaciones). Cada fila se procesa con la **misma lógica que la creación individual**, así que balances, fees y reglas quedan idénticos; y va **secuencial en un solo request**, lo que evita el lost-update de las altas sueltas.

1. Resolver billeteras con `walletter_lookup` (acepta id o nombre/alias en la columna `billetera`).
2. Armar el CSV **separado por comas** (RFC 4180, comillas dobles para escapar). Convertir los CSV que usan `;` o tabuladores. Montos con **punto decimal y sin separador de miles** (`17582.45`), para no chocar con el delimitador.
3. Columnas reconocidas (alias, case/acento-insensible):
   - transacciones: `fecha` · `hora` · `tipo` (ingreso/gasto, income/expense) · `billetera` · `categoria` · `monto` · `fee` · `descripcion`
   - exchanges: `fecha` · `hora` · `origen` · `destino` · `monto enviado` · `monto recibido` · `fee` · `creditfee` · `descripcion`
4. **Siempre primero con `dryRun:true`** (que además es el default) y revisar el preview: `total/imported/failed` + `rows[]` con `row/ok/error/data`. Solo entonces repetir con `dryRun:false`.
5. Una fila fallida **no aborta el resto**; el resultado trae el error por fila (ej. "Fondos insuficientes"). Arreglar esas filas y reimportar solo las que fallaron.
6. **Nunca mezclar tipos**: los `exchange_in`/`exchange_out` NO se registran como transacciones, van por `walletter_import_exchanges` (o `walletter_exchange_create`). Meterlos como transacción duplica el movimiento y descuadra el saldo.

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
- Los **write de billetera NO existen como tools** (`walletter_wallet_create/update/delete/reactivate` están comentados en el código): no los busques ni los inventes. **Pero el backend SÍ expone los endpoints** (`POST /wallets`, `PUT /wallets/:id`, `PUT /wallets/:id/reactivate`, `DELETE /wallets/:id`). Si el usuario pide crear/editar una billetera y **autoriza explícitamente usar la API**, usa el procedimiento "Crear/editar billetera vía API" de abajo; si no autoriza, pregunta antes (la billetera es un activo real, no se asume ni se inventa).

### Crear/editar billetera vía API (fallback autorizado)

Usar SOLO cuando una operación de billetera no tiene tool y el usuario autoriza la API (ej. "puedes usar la api"). No es un fallback general: el resto de operaciones siguen por tools.

1. Antes de escribir, confirma el contrato en el código del proyecto (`~/ .openclaw/workspace/projects/walletter/backend`): controlador en `src/Walletter.Api/Controllers/WalletsController.cs` y campos en `src/Walletter.Application/Wallets/WalletCommands.cs`.
2. Campos de `POST /wallets`: `name`, `type`, `currency`, `balance` (unidades; el backend lo convierte a centavos ×100), `alias`, `description`, `icon`, `color`, `excludeFromTotal`, `hideInDashboard`. `type` ∈ `cash|bank|card|crypto|other`; `currency` ∈ `USD|VES` (según el frontend `wallet-dialog.ts`). `PUT /wallets/:id` es parcial. No hay `GET /wallets/deleted` útil aquí.
3. Escribe un script Node en `/tmp` (no `curl` con la key en la línea de comandos) que **lea `baseUrl` y `apiKey` de `~/.openclaw/openclaw.json` → `plugins.entries.walletter.config`** y haga el request con header `X-Api-Key` (el backend usa el esquema dual `X-Api-Key`/Bearer definido en `ApiOrBearerHandler.cs`). **Nunca imprimas ni repitas la key**; no la pongas en logs, URLs ni argumentos.
4. Ejecuta con `node /tmp/<script>.js` y **borra el script** (`rm -f`) al terminar.
5. Verifica: el `POST` debe devolver 200 con el objeto creado (id nuevo); luego `walletter_cache_refresh` y `walletter_wallets`/`walletter_balance` para confirmar que aparece (el cache dura ~60s).

## Registrar movimientos desde una captura o estado de cuenta bancario

1. `walletter_lookup` → identificar la billetera del banco por `name`/`alias` (ej. Bancamiga/BAMI) y el `timezone`. Si la billetera no existe, preguntar (no inventar).
2. **Detectar duplicados antes de crear**: el banco imprime un número de **Ref** por movimiento y walletter lo guarda dentro de `description`. Lista primero con `walletter_transactions {walletId, from, to}` sobre las fechas de la captura y compara por **Ref + monto + fecha**. Lo que ya existe no se recrea: se reporta como registrado.
3. Crear solo lo que falta con `walletter_transaction_create {walletId, categoryName, type:"expense", amount, date, time}`, usando la fecha y la hora locales que muestra la captura.
   - **Crear de a UNA transacción, en llamadas secuenciales; nunca varias en paralelo.** El backend actualiza el balance con leer→restar→guardar: dos altas concurrentes leen el mismo saldo y una sobreescribe a la otra (lost update), dejando el balance de la billetera por encima de la suma real del ledger.
   - Si el balance de la billetera no cuadra con la suma de sus transacciones, **no intentes corregirlo editando montos**: `walletter_transaction_update` con el monto que ya tiene es no-op, y con monto ±1 solo desplaza ese delta sobre el balance almacenado (no recalcula desde el ledger). Pregunta al usuario el saldo real que muestra el banco y decide con él qué corregir; deja constancia del descuadre.
4. Comisiones: una comisión listada como **línea propia** del banco (p. ej. "Comision Solicitud Transf. …") se registra como `expense` con la categoría `comisiones bancarias`; la comisión propia de un movimiento puntual va inline en el campo `fee` del `transaction_create` (el backend crea el hijo con categoría de sistema `fee` + `parentTransactionId`).
5. Antes de crear, preguntar lo que falte: categoría de cada línea y si alguna transferencia debe ligarse a un pendiente/recurrente existente.
6. Verificar: `walletter_transactions` de esas fechas (sin duplicados, montos cuadran) y `walletter_balance` (saldo final igual al de la captura).

## Registrar exchanges desde capturas (banco + exchange)

Caso típico: el banco debita un monto (compra POS/P2P), el exchange acredita menos, y la diferencia es spread del banco + comisión bancaria.

1. `walletter_lookup` → resolver `fromWalletId` (banco) y `toWalletId` (exchange) y el `timezone`. Si el exchange no aparece como billetera, ver "Crear/editar billetera vía API".
2. **Antes de calcular, confirma con el usuario lo ambiguo con `ask_user`:** qué cargo del banco corresponde a cada exchange, el monto acreditado exacto (redondeado vs. el de la captura) y qué fecha/hora usar. No inventes el emparejamiento.
3. Fee del exchange = **total debitado por el banco en esa operación − `fromAmount`**. Se descompone en (resto sobre el monto enviado) + (comisión bancaria). Pásalo en `fee`; el backend crea el hijo `fee`. Comprueba: `fromAmount + fee` debe igualar exactamente la suma de cargos del banco de esa operación.
4. `walletter_exchange_create` con `{fromWalletId, toWalletId, fromAmount, toAmount, fee, date, time, tz, description}`. **Secuencial**, nunca en paralelo (misma razón que en "Registrar movimientos desde una captura": el balance se lee→resta→guarda).
5. **Huso horario de la captura del exchange — verificar antes de convertir**: NO apliques a ciegas el offset del encabezado (un label `Time(UTC+8)` en Binance puede ser engañoso). Cruza una fila de la captura del exchange con la fila del banco del mismo movimiento: si los relojes coinciden **al minuto**, la captura ya está en la hora local del usuario (`timezone` de `walletter_lookup`) → usa esa hora tal cual, sin restar. Solo si difieren, calcula el offset real por la diferencia observada. Evidencia: Binance `10:35:07` ↔ banco `10:35`, `19:52:40` ↔ `07:57 PM`, `12:32:28` ↔ `12:32` → misma hora local. Esta verificación manda también sobre la nota del "reloj UTC+8" en «Clasificar pantallas de Binance». Si ya registraste horas con una conversión equivocada, corrige cada fila con `walletter_exchange_update {id, date, time, tz}` (y `walletter_transaction_update` para la transacción) y confirma con `walletter_exchange_get`.
6. Si ya creaste con hora equivocada, corrígelo con `walletter_exchange_update {id, date, time, tz, description}` (el update es parcial; la descripción no se recalcula, pásala corregida si embebe montos/horas) y confirma con `walletter_exchange_get`.
7. Verificar: `walletter_exchange_get` de cada id (rate, fee, transacciones hijas) y `walletter_balance` (el saldo del exchange sube exactamente la suma de los `toAmount`).

### Clasificar pantallas de Binance: exchange vs. gasto

- *Order Completed* con «Sell USDT» (`Fiat amount` / `Price` / `Total Quantity` + contraparte Pago Móvil) → **exchange** cripto → banco (`walletter_exchange_create`).
- *Payment Details* con `Paid With … USDT` y destinatario email/usuario (ej. `To: …@hotmail.com`, `User-4820b`), sin monto fiat → **NO es exchange**: es un envío interno = **gasto** de la billetera cripto (`walletter_transaction_create`, `type:"expense"` en esa billetera). Si el usuario no dio categoría, pregúntala (hardware → `tech`).
- Ambas pantallas usan el reloj UTC+8 de Binance: aplica la conversión de la regla de huso de arriba.

### Cuadrar saldos contra capturas del usuario

Tras registrar los movimientos, compara el saldo de cada billetera (`walletter_balance`) con el saldo de las capturas del usuario. Si queda un descuadre persistente de un importe redondo, normalmente es un **movimiento aún sin registrar**, no un monto mal escrito: pregunta al usuario ese movimiento (monto y fee exactos), regístralo (`walletter_exchange_create` / `walletter_transaction_create`), y vuelve a verificar el balance. Evidencia de éxito: el saldo del banco coincide **exactamente** con el de la captura.

### Leer tablas de capturas de baja resolución

Si `image` sobre un recorte devuelve vacío o ilegible ("no hay números visibles"), amplía el recorte antes de reintentar: recorta la franja con `sharp.extract({left,top,width,height})` y `resize({width: ~2500–5000, kernel:'nearest'})` a un archivo en `/tmp` o `media/analysis/`, y vuelve a llamar `image` sobre la versión ampliada. Funciona para encabezados y columnas de montos.
