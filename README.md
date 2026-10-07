# Chatbot IA para Ventas por WhatsApp Business

Agente de WhatsApp con IA que vende servicios digitales y demuestra la venta automática con una demo real de útiles escolares.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-3.1_flash_lite-4285F4?logo=google&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Business-25D366?logo=whatsapp&logoColor=white)
![YCloud](https://img.shields.io/badge/YCloud-BSP-111827)
![Render](https://img.shields.io/badge/Render-Deployed-46E3B7?logo=render&logoColor=white)

## 🎬 Demo visual

> [COMPLETAR: subir un GIF de 30 segundos a `docs/demo.gif` y reemplazar este bloque]

![Demo del chatbot](docs/demo.gif)

Flujo sugerido para la grabación: menú principal → opción 1 (demo) → envío de lista → imagen de cotización → confirmación del pedido. Sin métricas aún.

## ❓ Problema que resuelve

Las PYMES pierden ventas por no responder a tiempo en WhatsApp: los clientes preguntan fuera de horario, piden cotizaciones en texto o PDF y nadie les da un precio claro en minutos. Además, muchos negocios quieren un agente propio pero no pueden ver antes cómo trabajaría.

## 💡 Solución

Un agente principal que atiende en español 24/7, explica servicios digitales (agentes de WhatsApp con IA, apps y páginas web) y, cuando el cliente quiere verlo en acción, abre una demo real de ventas: cotiza listas de útiles desde texto, PDF o Excel, revalida cada precio contra el catálogo y genera la cotización en imagen. Al cerrar la demo, siempre vuelve al menú principal.

## ✨ Características principales

- Menú de servicios con IA (Gemini) y fallback por reglas sin clave.
- Demo de ventas on-demand con entrada y salida controladas.
- Cotizador de listas: texto multilínea, PDF y Excel, con tolerancia a tildes y NBSP.
- Cotización en imagen (5 columnas en modo lista) y catálogo en imagen.
- Cálculo de anticipo del 50% y verificación de comprobante con visión.
- Handoff a humano (Evelyn) y cierre por inactividad a los 14 minutos.
- Formulario de requerimientos de 9 campos con resumen aprobable y editable.
- Sesiones persistibles en archivo, rate-limit, firmas YCloud/Meta y `/health`.

## 🛠️ Stack tecnológico

- **Backend:** Node.js (>=20, ESM), Express 4, helmet, express-rate-limit.
- **IA:** Google Gemini (`gemini-3.1-flash-lite` por defecto) vía `fetch` nativo, respuestas JSON con schema.
- **Mensajería:** WhatsApp vía YCloud BSP, fallback a Meta Graph API.
- **Datos:** Excel (`exceljs`, `UtilesEscolares.xlsx` ~59 productos), PDF (`pdf-parse`), imágenes (`sharp`).
- **DevOps:** Render Web Service, variables en dashboard, `node --test`.

## 🏗️ Arquitectura

Flujo en texto: `YCloud (whatsapp.inbound_message.received) → Express POST /webhook → verificación HMAC → runSerialized por remitente → utilesStore (SERVICIOS → demo) → Gemini (JSON) → revalidación contra catálogo → YCloud send text/image`.

Diagrama sugerido (Mermaid): crear `docs/architecture.mmd` con nodos `Cliente → YCloud → API → Store → Gemini/Catálogo → YCloud → Cliente`, más rama `Render + UptimeRobot → /health`.

## 🚀 Instalación y uso

1. Clonar y entrar al proyecto:
   ```bash
   git clone [COMPLETAR: url-del-repo] pc-venta-ia
   cd pc-venta-ia
   npm install
   ```
2. Copiar variables:
   ```bash
   cp .env.example .env
   ```
3. Completar `.env` mínimo:
   ```env
   PORT=3000
   UTILES_PATH=./UtilesEscolares.xlsx
   VERIFY_TOKEN=cambia-este-token
   YCLOUD_API_KEY=
   YCLOUD_PHONE=+593987695938
   YCLOUD_WEBHOOK_SECRET=
   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-3.1-flash-lite
   DOMICILIO_RECARGO=3
   SESSION_FILE=./data/sessions.json
   ```
4. Arrancar y probar:
   ```bash
   npm start
   npm test
   ```
5. Webhook local con túnel: `cloudflared tunnel --url http://localhost:3000` y apuntar YCloud a `https://<tunel>/webhook`. En producción el endpoint es `https://[COMPLETAR: tu-app].onrender.com/webhook`.

## 📁 Estructura del proyecto

```text
pc-venta-ia/
├── server.js              # Express, firmas, media, envío, /health
├── lib/
│   ├── store.js           # Orquestador de estados (SERVICIOS → demo)
│   ├── messages.js        # Textos y constantes
│   ├── intents.js         # Regex de intenciones
│   ├── cart.js            # Carrito y totales
│   ├── chatbotForm.js     # Formulario 9 campos
│   ├── sessionStore.js    # Sesiones memoria/archivo
│   ├── ai.js              # Gemini JSON + visión
│   ├── utiles.js          # Catálogo, búsqueda, imágenes precio
│   └── excel.js           # Carga .xlsx + normalize
├── UtilesEscolares.xlsx   # Catálogo (~59 productos)
├── test-usability.mjs     # Tests (145 pass / 1 fail conocido)
└── .env.example
```

## 🗺️ Roadmap

- [x] Agente principal de servicios con Gemini + fallback.
- [x] Demo de útiles on-demand con retorno al menú.
- [x] Cotizador PDF/Excel con imagen y anticipo 50%.
- [x] Persistencia de sesiones en archivo y endurecimiento básico.
- [ ] Panel admin para editar precios sin redeploy.
- [ ] Soporte multilenguaje y plantillas por negocio.
- [ ] Métricas reales (tiempo de respuesta, conversión) con dashboard.

## 📄 Licencia

MIT. Ver `LICENSE` o usar el texto estándar MIT con `[COMPLETAR: tu nombre y año]`.

## 📬 Contacto

- LinkedIn: [COMPLETAR: tu-url-de-linkedin]
- Email: [COMPLETAR: tu-email]

---

> Nota para publicar: 1) graba el GIF de 30s y súbelo a `docs/demo.gif` para que el placeholder no quede vacío; 2) reemplaza los `[COMPLETAR]` (repo, app Render, LinkedIn, email, nombre en licencia) y verifica que los badges apunten a tus versiones reales; 3) añade una captura de la imagen de cotización en `docs/` y enlázala en Demo visual, los reclutadores entienden el valor en segundos con una imagen real.
