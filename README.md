# Bot WhatsApp de venta de útiles escolares

Bot de WhatsApp que atiende (sin autorización, público) el flujo de **venta de útiles escolares** leyendo un catálogo en `UtilesEscolares.xlsx`: cota listas de útiles, muestra precios con imagen y registra pedidos.

Además, el **primer mensaje** entra al **agente principal**, que vende los servicios de desarrollo (agentes de WhatsApp, apps web y páginas web). El diálogo lo lleva Gemini; las opciones del menú son `1. Ver una DEMO de un agente de ventas` / `2. Comunicarme con Evelyn` / `3. Solicitar una APP, Página web o Chatbot`. El flujo de útiles escolares quedó como **demo** que se abre con la opción 1 (o diciendo "demo") y, al cerrarse, **vuelve siempre al menú principal**.

> Histórico: este bot era una consulta de equipos (laptops) + útiles escolares. El flujo de equipos fue eliminado; queda solo el de útiles.

**Producción**: desplegado en Render en `https://pc-venta-ia.onrender.com`, con YCloud como proveedor (BSP) para recibir/enviar mensajes. El endpoint del webhook es permanente y **no cambia**: `https://pc-venta-ia.onrender.com/webhook`.

### Estructura de `UtilesEscolares.xlsx`

| Hoja | Contenido |
|---|---|
| `Hoja1` | Fila 1 encabezado `Producto | Descripcion | Precio de venta al publico`; desde fila 2 los ~59 productos |

- Los precios se leen de la columna cuyo encabezado normalizado sea `precio de venta al publico` (tolera mayúsculas, acentos, NBSP y espacios finales).
- Este catálogo es de uso público: cualquier persona que escriba al bot puede cotizar.
- El catálogo se carga en memoria solo cuando se necesita (al entrar al flujo, ver el catálogo o consultar un producto); el saludo y la opción Evelyn no lo cargan.

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

El servidor lee `UtilesEscolares.xlsx` al arrancar y lo cachea durante toda la vida del proceso. Para reflejar cambios:

1. Editar el archivo `.xlsx` localmente.
2. Subir el archivo actualizado a GitHub (rama `main`) — el nombre debe seguir siendo `UtilesEscolares.xlsx`.
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

El **primer mensaje** de cualquier persona abre el **menú principal** (agente de servicios):

- Se ofrece `1. Ver una DEMO de un agente de ventas` / `2. Comunicarme con Evelyn` / `3. Solicitar una APP, Página web o Chatbot para tu negocio`.
- Con `GEMINI_API_KEY`, el diálogo de servicios lo maneja Gemini (sin IA se responde con un menú estático); los JSON que puede devolver son `ir_demo`, `formulario` (arranca el formulario de requerimientos), `evelyn`, `despedirse` y `requerimientos`.
- La **opción 1** (o palabras como "demo") inicia la **demo** del agente de útiles escolares: streaming del comportamiento real del bot. Al terminar la demo (compra confirmada, despedida, pasar a Evelyn, etc.) se envía un aviso de cierre y se **vuelve al menú principal**.
- La **opción 2** (o "necesito comunicarme con Evelyn") pasa la conversación del cliente a la humana Evelyn.
- La **opción 3** (o un texto con "chatbot") abre un **formulario de requerimientos** cuya primera pregunta es el tipo de servicio (Agente de WhatsApp / App web / Página web) seguida de 8 preguntas de negocio; al final hay un resumen aprobable y editable campo por campo. Al aprobar, los requerimientos se registran en el log y un asesor contacta al cliente.
- "Salir de la demo", "volver al menú principal" o "terminar la demo" salen de la demo hacia el menú en cualquier momento.
- Dentro de la demo, el agente de útiles responde con el flujo de abajo.

El flujo de **útiles escolares** (dentro de la demo):

- Al entrar a la demo responde con un saludo: `1. Realizar una cotización de útiles escolares` / `2. Comunicarme con Evelyn` / `3. Solicitar un Chatbot Inteligente para mi negocio`. El catálogo no está en el saludo: se muestra al pedirlo por palabra (ej. "catálogo", "qué tienes") o después de la opción 1 (pregunta "¿Deseas ver lo que tengo disponible?").
- La opción 3 (o escribir "quiero un chatbot") levanta los **requerimientos de un chatbot** para el negocio del cliente: 8 preguntas (además del tipo de servicio de la primera pregunta del agente principal, que no se repite), resumen final, aprobación y la opción de corregir campo por campo. Al aprobar, se registran los requerimientos en el log y se indica que un asesor lo contactará personalmente.
- El resto del flujo habla de forma natural (sin menús `1. Sí / 2. No`): se responde con "sí", "no", "domicilio", "retiro", el nombre de un producto, etc.
- Con `1` o `sí`, el bot pide la lista: puede escribirla por mensaje (un producto por línea) o adjuntarla en **PDF o Excel**.
- Con una lista, el bot busca cada ítem en `Producto`+`Descripcion` y envía una **imagen con la cotización** (precio por ítem y total) y pregunta si desea realizar el pedido.
- También se puede preguntar por un producto directo (ej. `goma en barra`): muestra el precio y pide la cantidad; al final se arma la cotización.
- Las **fotos no se leen** (sin OCR): se pide escribir la lista o adjuntarla en PDF/Excel.
- Preguntas sobre `pago`/`transferencia` responden las condiciones de pago indicando el monto exacto del anticipo del 50% (mitad al confirmar, mitad al entregar o retirar). Al enviar el comprobante, el bot verifica (con Gemini vision) que el monto sea ≥ el 50%, que esté a nombre de Evelyn Lizeth Zambrano y que la fecha sea la de hoy.
- Si el pedido se confirma, se pregunta por entrega a domicilio (con recargo) y luego la dirección y horario.
- El chat se cierra por inactividad a los 14 minutos (aviso "¿Sigues ahí?" a los 5 min, y "El chat se cerrará por falta de respuesta." al cierre). Si la venta ya se concretó (comprobante enviado o retiro agendado) no se envían avisos.
- El catálogo (Excel) se carga en memoria solo cuando se necesita (al entrar al flujo con la opción 1, ver el catálogo o consultar un producto); el saludo y la opción 2 no lo cargan.

## IA opcional (Gemini)

Si hay `GEMINI_API_KEY`, además del diálogo de servicios del **agente principal** (`askGeminiServices`), el flujo de útiles usa IA (modelo `GEMINI_MODEL`, default `gemini-3.1-flash-lite`) para el diálogo libre, el armado de listas, la revisión de disponibilidad y la verificación del comprobante con visión. Sin la clave, el bot funciona 100% con las reglas (el agente principal muestra un menú estático). El bot **nunca confía en la IA para los precios**: cada ítem se revalida contra el catálogo y las imágenes de cotización se arman con los datos reales.

## Archivos

- `server.js` — servidor Express, verificación de firmas (Meta y YCloud), routing del flujo de servicios/útiles, media (upload/descarga) y envío por YCloud o Graph API
- `lib/excel.js` — carga del `.xlsx` (`loadWorkbook`) y `normalize()`
- `lib/utiles.js` — catálogo de útiles, búsqueda `findItems`, parseo de listas/archivos, `buildPriceImage` (sharp) y `formatPrice`
- `lib/store.js` — agente principal (estado `SERVICIOS`), demo de útiles y máquina de estados por sesión, caché y timers de inactividad
- `lib/ai.js` — integración opcional con Gemini (`isAiEnabled`, `askGemini` JSON, `askGeminiServices`, `buildCatalogContext`)
- `UtilesEscolares.xlsx` — catálogo de útiles (se cachea al arrancar; se actualiza vía push a GitHub + redeploy)
- `test-usability.mjs` — tests de usabilidad (ejecutar con `npm test`)