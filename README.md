# Bot WhatsApp para consulta de equipos y útiles escolares

Bot con dos flujos en WhatsApp:

1. **Consulta de equipos** (laptops arrendadas/disponibles) leyendo `Laptops.xlsx`. Solo usuarios cuyos números estén en la hoja `Autorizacion` pueden activarlo (escribiendo `hola bot`).
2. **Venta de útiles escolares** (público, sin autorización) leyendo `UtilesEscolares.xlsx`: cotiza listas de útiles, muestra precios con imagen y registra pedidos.

**Producción**: desplegado en Render en `https://pc-venta-ia.onrender.com`, con YCloud como proveedor (BSP) para recibir/enviar mensajes. El endpoint del webhook es permanente y **no cambia**: `https://pc-venta-ia.onrender.com/webhook`.

## Estructura del Excel

| Hoja | Contenido |
|---|---|
| `Laptos` | Datos con fila de encabezado en la **fila 4** (desde la fila 5), columnas en este orden: Código, Empresa, Usuario, Marca y modelo, Características, N° Serial, Celular, Correo, Estado |
| `Autorizacion` | Fila 1 encabezado `Nombre`, `Celular`; desde fila 2 los números permitidos |

- El número de celular se compara por sus últimos 9 dígitos, así que sirve tanto `593987695938` como `0987695938`.
- Para que una persona pueda consultar equipos, su número debe estar en `Autorizacion` y escribir `hola bot`.
- `Laptops.xlsx` contiene datos personales (Celular/Correo) → el repositorio de GitHub debe ser **privado**.

### Estructura de `UtilesEscolares.xlsx`

| Hoja | Contenido |
|---|---|
| `Hoja1` | Fila 1 encabezado `Producto | Descripcion | Precio de venta al publico`; desde fila 2 los ~40 productos |

- Los precios se leen de la columna cuyo encabezado normalizado sea `precio de venta al publico` (tolera mayúsculas, acentos, NBSP y espacios finales).
- Este catálogo es de uso público: cualquier persona que escriba al bot puede cotizar.

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
   - `UTILES_PATH` — ruta del catálogo de útiles (default `./UtilesEscolares.xlsx`)
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

El servidor lee `Laptops.xlsx` y `UtilesEscolares.xlsx` al arrancar y los cachea durante toda la vida del proceso. Para reflejar cambios:

1. Editar el archivo `.xlsx` localmente.
2. Subir el archivo actualizado a GitHub (rama `main`) — los nombres deben seguir siendo `Laptops.xlsx` y `UtilesEscolares.xlsx`.
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

### Flujo de equipos (autorizados)

El bot de equipos solo responde a números autorizados (hoja `Autorizacion`) y **dentro de una sesión activa**.

- Escribe `hola bot` para activar el bot (responde con el texto de ayuda). Mientras la sesión esté activa responde todas las consultas.
- Escribe `chao bot` para desactivarlo (responde una despedida). Sin sesión activa el bot no responde nada.

Consultas dentro de una sesión:

- `equipos disponibles` → lista los que están `Disponible`
- `equipos arrendados` → lista los `Arrendado`
- `cuantos equipos hay` / `inventario` → totales por estado
- `serial 7D9J4M3` (o un serial suelto) → detalle del equipo con ese serial
- Cualquier texto con marca, empresa o usuario (`Dell`, `Mercado libre`, `Luis Ceron`) → coincidencias relevantes con su detalle

### Flujo de útiles escolares (público)

Cualquier persona que escriba al número recibe el flujo de útiles:

- El primer mensaje responde con un saludo: `1. Sí, quiero enviar mi lista` / `2. No`.
- Con `1` o `sí`, el bot pide la lista: puede escribirla por mensaje (un producto por línea) o adjuntarla en **PDF o Excel**.
- Al adjuntar un **PDF o Excel** el bot pregunta primero `¿Genero la cotización de este archivo?` (`1. Sí` / `2. No`). Con `sí` arma la cotización; con `no` pregunta `¿Deseas preguntar por un producto específico?`; si también dice `no`, pregunta `¿Deseas ver lo que tengo disponible?` y con `sí` envía el catálogo completo con precios (el flujo continúa desde ahí).
- Mientras se genera la cotización de un archivo, si el cliente escribe algo el bot responde que espere o que escriba `completar el pedido` para detener la cotización y ajustar el pedido (agregar/quitar productos). Escribir `completar el pedido` o `detener` en la confirmación de la cotización lleva directo al menú de agregar/quitar.
- Con una lista, el bot busca cada ítem en `Producto`+`Descripcion` y envía una **imagen preliminar con la cotización** (precio por ítem y total) y pregunta si es la cotización deseada (`1. Sí` / `2. No, deseo modificarla`).
- También se puede preguntar por un producto directo (ej. `goma en barra`): muestra el precio y pide la cantidad; al terminar puede sugerir mochilas/cartucheras/loncheras y luego se arma la cotización.
- Si en el estado de "envíame tu lista" el mensaje menciona un archivo (ej. `ya te envié el pdf`), el bot avisa que no recibió/procesó el archivo y pide reenviarlo o escribir la lista; las preguntas/quejas re-piden la lista en vez de buscar un producto.
- Al procesar una lista o documento, el bot separa la **cabecera** (solo curso/grado/paralelo y unidad educativa/escuela/colegio → se dibuja arriba de la imagen de cotización), el **cuerpo** (los ítems → cada uno busca su precio en el catálogo, o "No disponible", conservando el orden del documento) y descarta el **pie de página** (fechas de entrega, notas, firma del docente…), líneas de dirección/libros/uniforme, y cualquier línea que **no pertenezca a útiles escolares o productos de limpieza** (no se cotiza ni aparece como "No disponible"). Un ítem solo obtiene precio si coincide con el **nombre** de un producto del catálogo; si pertenece a útiles/limpieza pero no está en el catálogo, sale "No disponible".
- Al confirmar la cotización se pregunta por entrega a domicilio (con recargo), luego la **dirección** y el **día/horario de entrega**, y se envía la **imagen final de cotización con el bloque ENTREGA** más el menú `1. Realizar el pedido / 2. Deseo modificarlo / 3. No estoy interesado`.
- Con `1`, el bot indica transferir el **50% (no reembolsable)** y el restante al recibir el producto, y pide adjuntar el comprobante. Al recibirlo, **no se verifica automáticamente (sin OCR)**: se agradece, se registra para el operador (cliente, total y 50% esperado, a nombre de Evelyn Lizeth Zambrano) y se cierra el chat.
- Las **fotos no se leen** (sin OCR): se pide escribir la lista o adjuntarla en PDF/Excel.
- Preguntas sobre `pago`/`transferencia` responden las condiciones de pago (mitad al confirmar, mitad al entregar).
- El chat se cierra por inactividad tras ~10 minutos (con avisos a los 5 y 7 minutos).

## Archivos

- `server.js` — servidor Express, verificación de firmas (Meta y YCloud), routing de ambos flujos, media (upload/descarga) y envío por YCloud o Graph API
- `lib/excel.js` — carga y parseo de los `.xlsx` + validación de autorización + `normalize()`
- `lib/search.js` — lógica del flujo de equipos (interpretación y generación de respuesta)
- `lib/utiles.js` — catálogo de útiles, búsqueda `findItems`, parseo de listas/archivos, `buildPriceImage` (sharp) y `formatPrice`
- `lib/store.js` — máquina de estados del flujo de útiles, caché por sesión y timers de inactividad
- `Laptops.xlsx` — datos de equipos (se cachea al arrancar; se actualiza vía push a GitHub + redeploy)
- `UtilesEscolares.xlsx` — catálogo de útiles (idem)
- `test-usability.mjs` — tests de usabilidad (ejecutar con `npm test`)