# Bot WhatsApp para consulta de equipos

Bot que responde por WhatsApp las consultas sobre laptops (arrendadas/disponibles) leyendo directamente el archivo Excel `Laptops.xlsx`. Solo usuarios cuyos números estén en la hoja `Autorizacion` del Excel pueden consultar.

**Producción**: desplegado en Render en `https://pc-venta-ia.onrender.com`, con YCloud como proveedor (BSP) para recibir/enviar mensajes. El endpoint del webhook es permanente y **no cambia**: `https://pc-venta-ia.onrender.com/webhook`.

## Estructura del Excel

| Hoja | Contenido |
|---|---|
| `Laptos` | Datos con fila de encabezado en la **fila 4** (desde la fila 5), columnas en este orden: Código, Empresa, Usuario, Marca y modelo, Características, N° Serial, Celular, Correo, Estado |
| `Autorizacion` | Fila 1 encabezado `Nombre`, `Celular`; desde fila 2 los números permitidos |

- El número de celular se compara por sus últimos 9 dígitos, así que sirve tanto `593987695938` como `0987695938`.
- Para que una persona pueda consultar, su número debe estar en `Autorizacion`.
- `Laptops.xlsx` contiene datos personales (Celular/Correo) → el repositorio de GitHub debe ser **privado**.

## Despliegue en Render (producción)

1. Código en un repositorio de GitHub **privado**. NO subir `node_modules/` ni `.env`.
2. En [render.com](https://render.com): **New → Web Service** → conectar el repo.
3. Configuración:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Región: `Virginia` (o `Ohio`); instancia `Free`.
4. Variables de entorno en el dashboard de Render (**no** en un `.env`):
   - `YCLOUD_API_KEY` — API key de YCloud
   - `YCLOUD_PHONE` — número de negocio en E.164 (ej: `+593987695938`)
   - `YCLOUD_WEBHOOK_SECRET` — secreto del endpoint webhook de YCloud
   - Render asigna `PORT` automáticamente (default 10000); `server.js` ya lo usa.
5. El servicio queda en `https://<nombre>.onrender.com`.

### Configurar el webhook en YCloud

1. Endpoint URL: `https://<nombre>.onrender.com/webhook`
2. Evento: `whatsapp.inbound_message.received`
3. Signing secret: el mismo valor de `YCLOUD_WEBHOOK_SECRET` (debe coincidir exacto en YCloud y en Render).
4. El servidor verifica la firma `YCloud-Signature` (`t=<ts>,s=<hex>`, HMAC-SHA256 sobre `<ts>.<body>`). Un POST sin firma válida recibe `401`.

### Mantener el plan free despierto

Render free duerme tras ~15 min de inactividad. Configurar un monitor gratuito en **UptimeRobot** con GET a `https://<nombre>.onrender.com/` cada 5 minutos. Para garantía total, usar el plan de $7/mes.

## Cómo se actualizan los datos del Excel

El servidor lee `Laptops.xlsx` al arrancar y lo cachea durante toda la vida del proceso. Para reflejar cambios:

1. Editar `Laptops.xlsx` localmente.
2. Subir el archivo actualizado a GitHub (rama `main`) — el nombre debe seguir siendo `Laptops.xlsx`.
3. Render redeploya automáticamente con cada push y el bot usa los datos nuevos.

El endpoint de YCloud **no cambia** en este ciclo.

## Desarrollo local

1. Instalar dependencias: `npm install`.
2. Copiar `.env.example` a `.env` y completar `YCLOUD_API_KEY`, `YCLOUD_PHONE`, `YCLOUD_WEBHOOK_SECRET`.
3. Arrancar: `npm start` → queda en el puerto 3000.
4. Para probar el webhook en local con HTTPS, usar un túnel efímero:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
   y apuntar el webhook de YCloud a `https://<url-del-tunel>/webhook`. Ojo: esa URL cambia en cada reinicio; solo sirve para desarrollo.

Sin `YCLOUD_API_KEY`/`PHONE_NUMBER_ID` configurados, las respuestas solo se loguean en consola (modo desarrollo).

## Consultas que entiende el bot

El bot solo responde a números autorizados (hoja `Autorizacion`) y **dentro de una sesión activa**. Un número no autorizado nunca recibe respuesta (la atiende un humano).

- Escribe `hola bot` para activar el bot (responde con el texto de ayuda). Mientras la sesión esté activa responde todas las consultas.
- Escribe `chao bot` para desactivarlo (responde una despedida). Sin sesión activa el bot no responde nada.

Consultas dentro de una sesión:

- `equipos disponibles` → lista los que están `Disponible`
- `equipos arrendados` → lista los `Arrendado`
- `cuantos equipos hay` / `inventario` → totales por estado
- `serial 7D9J4M3` (o un serial suelto) → detalle del equipo con ese serial
- Cualquier texto con marca, empresa o usuario (`Dell`, `Mercado libre`, `Luis Ceron`) → coincidencias relevantes con su detalle

## Archivos

- `server.js` — servidor Express, verificación de firmas (Meta y YCloud) y envío de respuestas por YCloud o Graph API
- `lib/excel.js` — carga y parseo del `.xlsx` + validación de autorización
- `lib/search.js` — lógica de interpretación de la pregunta y generación de la respuesta
- `Laptops.xlsx` — datos (se cachea al arrancar; se actualiza vía push a GitHub + redeploy)
- `test-usability.mjs` — tests de usabilidad (ejecutar con `npm test`)