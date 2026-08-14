import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { loadWorkbook, getLaptops, getAuthorizedPhones, isAuthorized } from './lib/excel.js';
import { generateReply, HELP, DEACTIVATION_REPLY, isActivationMessage, isDeactivationMessage } from './lib/search.js';

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'cambia-este-token';
const APP_SECRET = process.env.APP_SECRET || '';
const EXCEL_PATH = process.env.EXCEL_PATH || './Laptops.xlsx';

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v22.0';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY || '';
const YCLOUD_PHONE = process.env.YCLOUD_PHONE || '';
const YCLOUD_WEBHOOK_SECRET = process.env.YCLOUD_WEBHOOK_SECRET || '';

let cached = { key: '', laptops: null, phones: null };

const activeSessions = new Set();

async function getData() {
  if (cached.key === EXCEL_PATH && cached.laptops) return cached;
  const wb = await loadWorkbook(EXCEL_PATH);
  const laptops = getLaptops(wb.getWorksheet('Laptos'));
  const phones = getAuthorizedPhones(wb.getWorksheet('Autorizacion'));
  cached = { key: EXCEL_PATH, laptops, phones };
  return cached;
}

function verifySignature(req, rawBody) {
  if (!APP_SECRET) return true;
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyYCloudSignature(req, rawBody) {
  if (!YCLOUD_WEBHOOK_SECRET) return true;
  const sig = req.headers['ycloud-signature'];
  if (!sig) return false;
  const parts = {};
  for (const piece of String(sig).split(',')) {
    const idx = piece.indexOf('=');
    if (idx > 0) parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const t = parts.t;
  const s = parts.s;
  if (!t || !s) return false;
  const expected = crypto.createHmac('sha256', YCLOUD_WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function sendWhatsApp(to, body, businessFrom) {
  if (YCLOUD_API_KEY) {
    const from = YCLOUD_PHONE || (businessFrom ? `+${businessFrom}` : '');
    if (!from) {
      console.log('[enviar] falta configurar YCLOUD_PHONE. Mensaje:', body);
      return;
    }
    const res = await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
      method: 'POST',
      headers: {
        'X-API-Key': YCLOUD_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: `+${to}`,
        type: 'text',
        text: { body },
      }),
    });
    if (res.ok) {
      console.log('[enviar] mensaje enviado via YCloud a', to);
    } else {
      console.log('[enviar] error', res.status, await res.text());
    }
    return;
  }
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.log('[enviar] falta configurar PHONE_NUMBER_ID / ACCESS_TOKEN. Mensaje:', body);
    return;
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) console.log('[enviar] error', res.status, await res.text());
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

function toMessages(event) {
  if (event?.type === 'whatsapp.inbound_message.received' && event?.whatsappInboundMessage) {
    const m = event.whatsappInboundMessage;
    return [{
      from: m.from,
      businessFrom: m.to,
      type: m.type,
      text: m.text,
    }];
  }
  const changes = event?.entry?.[0]?.changes ?? [];
  const messages = [];
  for (const change of changes) {
    const value = change.value ?? {};
    messages.push(...(value.messages ?? []));
  }
  return messages;
}

app.post('/webhook', async (req, res) => {
  const raw = req.rawBody ?? JSON.stringify(req.body);
  const parts = {};
  const h = req.headers['ycloud-signature'];
  if (h) for (const piece of String(h).split(',')) {
    const idx = piece.indexOf('=');
    if (idx > 0) parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const expected = parts.t ? crypto.createHmac('sha256', YCLOUD_WEBHOOK_SECRET).update(`${parts.t}.${raw}`).digest('hex') : '';
  console.log('[debug] t=', parts.t, 's_recibida=', parts.s, 's_esperada=', expected, 'secret_len=', YCLOUD_WEBHOOK_SECRET.length);
  if (!verifySignature(req, raw) || !verifyYCloudSignature(req, raw)) return res.sendStatus(401);
  res.sendStatus(200);

  for (const msg of toMessages(req.body)) {
    try {
      const from = msg.from;
      if (msg.type !== 'text') continue;
      const text = msg.text?.body ?? '';
      console.log('[webhook] mensaje de', from, ':', text);
      const { laptops, phones } = await getData();
      const authorized = isAuthorized(from, phones);
      if (!authorized) {
        console.log('[webhook] numero no autorizado', from, 'se deja para atencion manual:', text);
        continue;
      }
      if (!activeSessions.has(from)) {
        if (isActivationMessage(text)) {
          activeSessions.add(from);
          await sendWhatsApp(from, HELP, msg.businessFrom);
        } else {
          console.log('[webhook] sin sesion activa, no se responde', from, ':', text);
        }
        continue;
      }
      if (isDeactivationMessage(text)) {
        activeSessions.delete(from);
        await sendWhatsApp(from, DEACTIVATION_REPLY, msg.businessFrom);
        continue;
      }
      const reply = generateReply(text, laptops);
      await sendWhatsApp(from, reply, msg.businessFrom);
    } catch (err) {
      console.error('[webhook] error', err);
    }
  }
});

app.get('/', (req, res) => {
  res.send('Bot de consulta de equipos activo');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});