# 🧾 Walletter – Plugin para OpenClaw

El plugin que le permite a tu **agente de OpenClaw** manejar tus finanzas personales a través del sistema **Walletter**:

- 💰 ver y gestionar tus **billeteras**
- 🧾 registrar, editar y borrar **transacciones** (ingresos y gastos)
- 🔁 hacer **exchanges** entre monedas (con sus comisiones)
- 📈 consultar la **tasa del día** (BCV y paralelo)
- ⏰ programar **pagos recurrentes**
- 📊 ver **estadísticas** y **reportes** de tu dinero

En cristiano: en vez de decirle a tu agente "hazme el favor de anotar este gasto" y que tenga que usar comandos raros, este plugin le da las herramientas ya preparadas para que las use directo. Tú solo le hablas normal y él/ella hace el trabajo.

> ⚙️ Técnicamente, es el puente entre OpenClaw y la API del sistema Walletter. Si quieres saber cómo levantar el sistema Walletter desde cero, mira el README de [dariushine/walletter](https://github.com/dariushine/walletter).

---

## Antes de empezar (requisitos)

Para que el plugin funcione necesitas que el sistema **Walletter** ya esté corriendo y accesible por internet o por tu red. Si todavía no lo tienes, primero sigue el **"Cómo correrlo desde cero"** del README del sistema.

---

## 🚀 Cómo instalarlo

> 💡 El comando de instalación lo hace el operador de OpenClaw (o tu agente si tiene permisos de terminal). Si tú solo usas a tu agente por el chat, el plugin probablemente ya esté instalado: solo asegúrate de que esté **activado** (paso 3).

### 1. Clona el repositorio

```bash
git clone https://github.com/dariushine/walletter-openclaw.git
cd walletter-openclaw
```

### 2. Compila el plugin

```bash
cd walletter-plugin
npm run setup   # instala las dependencias
npm run build   # genera el plugin listo para usar
cd ..
```

### 3. Instálalo en OpenClaw

Desde la carpeta del repositorio:

```bash
openclaw plugins install ./walletter-plugin
```

Si ya lo tenías instalado antes y quieres actualizarlo con los cambios:

```bash
openclaw plugins install ./walletter-plugin --force
```

> 📌 **Importante:** después de instalar, **reinicia OpenClaw** (o el servicio del gateway) para que tome la configuración nueva. Verifica que aparezca activado con `openclaw plugins list`.

---

## ⚙️ Cómo configurarlo

Una vez instalado, hay que decirle al plugin **dónde está la API** de Walletter y **con qué llave** conectarse. Esto se hace en el archivo de configuración de OpenClaw (`openclaw.json`), en la sección `plugins.entries.walletter`:

```json
"walletter": {
  "enabled": true,
  "config": {
    "baseUrl": "https://tu-dominio.com/api",
    "apiKey": "tu-api-token-de-walletter"
  }
}
```

### Qué va en cada campo

| Campo | Qué es | Cómo lo consigo |
|-------|--------|-----------------|
| `baseUrl` | La dirección de la API de Walletter, **terminando en `/api`**. | Es la misma URL donde abres el frontend de Walletter, pero agregándole `/api`. Ejemplo: si abres Walletter en `https://tu-dominio.com`, usa `https://tu-dominio.com/api`. |
| `apiKey` | La llave secreta que identifica al plugin. | Se crea dentro de Walletter (más abajo te explico). |

> 🔒 **Nunca compartas tu `apiKey`** ni la pongas en chats ni en capturas. Es como una contraseña.

### Cómo generar un API token en Walletter

La forma más fácil es pedírselo a tu agente de OpenClaw cuando el sistema ya esté corriendo:

> _"Créame un API token para el plugin de Walletter."_

Él/ella lo crea con `POST /api/auth/tokens` y te devuelve un valor como `{ id, token }`. Ese `token` es tu `apiKey`. (Requiere que tengas sesión iniciada en Walletter.)

---

## ✅ Cómo saber que funciona

En el chat con tu agente, escribe algo como:

> _"¿Cómo está mi balance?"_

Si responde con tus billeteras y montos, el plugin está instalado y conectado correctamente. 🎉

Si te da error, revisa:
- Que la API de Walletter esté corriendo y accesible en el `baseUrl` configurado.
- Que `apiKey` sea válida (el agente verá un error tipo `401 API token inválido`).
- Que hayas reiniciado OpenClaw después de instalar.

---

## 🧰 Qué puede hacer el plugin (resumen para humanos)

- **Balance** → cuánto tienes en total, por moneda.
- **Billeteras** → crear, renombrar, desactivar.
- **Transacciones** → anotar ingresos/gastos, editarlos, borrarlos, agregar comisiones.
- **Exchanges** → cambiar de un dinero a otro (ej. VES → USD) con su comisión.
- **Tasas** → la tasa del día (BCV y paralelo).
- **Pagos recurrentes** → programar pagos que se repiten y ejecutarlos.
- **Stats y reportes** → ver cómo va tu dinero por categoría y por período.

Todas estas acciones se activan simplemente pidiéndoselas a tu agente en lenguaje natural.

---

## 🐛 Problemas comunes

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `401 API token inválido` | El `apiKey` no sirve o caducó | Genera un token nuevo y actualiza la config |
| "No encontrado" de tool Walletter | Plugin no activado o OpenClaw sin reiniciar | Actívalo y reinicia OpenClaw |
| No conecta a la API | Red/URL mal configurada o sistema apagado | Verifica `baseUrl` y que Walletter esté corriendo |

---

## 👩‍💻 Para desarrolladores

- **Stack:** TypeScript, compilado con esbuild (plugin autocontenido, embebe sus dependencias).
- **Pruebas:** `npm test` (Vitest).
- **Regenerar** tras cambiar código: `npm run build`.

¿Quieres contribuir o reportar un problema? Abre un *issue* en este repositorio.

---

## ✍️ Autoría

Proyecto desarrollado y escrito por **Mara** (asistente de OpenClaw) para su humano. ☀️
