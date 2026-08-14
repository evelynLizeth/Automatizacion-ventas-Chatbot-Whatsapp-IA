# AGENTS.md

WhatsApp bot (Node.js/Express, ESM) answering laptop queries from `Laptops.xlsx` via exceljs. User-facing replies and console logs are in Spanish.

## Commands
- `npm start` runs the server.
- `npm test` runs `node --test test-usability.mjs` (unit/usability tests, read-only). There is no lint/typecheck setup.

## Excel quirks (easy to miss)
- Sheets are named `Laptos` (typo — keep it) and `Autorizacion`. Don't rename them.
- `Laptos` header row is row **4**; data starts at row 5. Columns map to `FIELD_ALIASES` in `lib/excel.js:6`.
- `Autorizacion` header row 1 (`Nombre`, `Celular`); rows 2+ are the only authorized numbers. Matching compares the last 9 digits (min 7) of the sender's number.
- All matching/text goes through `normalize()` in `lib/excel.js:26` (lowercase + strip accents).

## Gotchas
- `server.js:19-28` caches the workbook for the process lifetime (keyed only by `EXCEL_PATH`). Edits to `Laptops.xlsx` require restarting the server; in production (Render) that means pushing the updated file to GitHub `main` → auto-redeploy. The YCloud webhook URL never changes.
- **Production runs on Render** (`pc-venta-ia.onrender.com`). Env vars live in the Render dashboard (`YCLOUD_API_KEY`, `YCLOUD_PHONE`, `YCLOUD_WEBHOOK_SECRET`), not in `.env`. The repo is private; `.env` and `node_modules` must never be committed.
- Without `PHONE_NUMBER_ID`/`ACCESS_TOKEN` in `.env`, replies are only logged to console (dev mode). `.env` is gitignored; copy `.env.example`. Signature verification (Meta `x-hub-signature-256` and YCloud `ycloud-signature`) is skipped only when the corresponding secret is empty; when a secret is set, a request missing its signature header is rejected with `401` (`server.js:34-62`).
- **Unauthorized senders are left for manual handling** (`server.js:90-92`): the bot logs `[webhook] numero no autorizado <from> se deja para atencion manual: <text>` and does NOT reply. This works with WhatsApp Business App coexistence (number used in the app while the bot runs on it), so a human answers those chats from the app.
- **Session-based activation** (`server.js`, before `generateReply`): the bot only replies to authorized senders inside an active session. A `Set` keyed by sender `from` (in-memory, resets on restart) is used. Without an active session, a message containing `hola bot` (`isActivationMessage()` in `lib/search.js`, substring match on normalized text) activates it and replies with `HELP`; any other message is only logged as `[webhook] sin sesion activa, no se responde <from>: <text>` (no reply). Inside a session, a message containing `chao bot` (`isDeactivationMessage()`) deactivates it and replies with `DEACTIVATION_REPLY`; everything else is answered normally. Add new session-control phrases to the checks in `server.js` before the query path.
- Reply routing in `lib/search.js:73` is keyword-based and checked in order: both `disponible`+`arrendad` → `disponible` → `arrendad` → `cuant|total|inventario` → serial token match → `codigo <n>` (exact `l.codigo` match, handles 1+ digit codes) → "sin serial" (serial + `sin|no|falt|vacio|registr`, lists laptops with empty `serial`) → token scoring (greetings-only messages return the help text). New intents must slot into this order.
- **YCloud adapter** (`server.js`): if `YCLOUD_API_KEY` is set, sends via `POST https://api.ycloud.com/v2/whatsapp/messages` with `X-API-Key`, body `{ from, to, type: "text", text: { body } }` (E.164 with `+`). `from` uses `YCLOUD_PHONE` or falls back to the inbound message's `to`. Incoming events are `whatsapp.inbound_message.received` under `event.whatsappInboundMessage` (`from`, `to`, `text.body`); both YCloud and Meta (`entry[].changes[]`) payloads are parsed by `toMessages()`. Signature header `YCloud-Signature` (`t=<ts>,s=<hex>` over `<ts>.<rawBody>`, HMAC-SHA256 with `YCLOUD_WEBHOOK_SECRET`) is verified when that secret is set. Otherwise the Graph API path is used (requires `PHONE_NUMBER_ID`/`ACCESS_TOKEN`).

## Layout
- `server.js` — Express server, webhook verify/signature, Graph API send
- `lib/excel.js` — workbook load/parse + authorization
- `lib/search.js` — query interpretation and reply generation