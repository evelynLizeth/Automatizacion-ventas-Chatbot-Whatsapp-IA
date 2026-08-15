import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import { loadWorkbook, getLaptops, getAuthorizedPhones, isAuthorized } from './lib/excel.js';
import { generateReply, HELP, DEACTIVATION_REPLY, isActivationMessage, isDeactivationMessage } from './lib/search.js';
import { getUtilesProducts, getUtilesSheet } from './lib/utiles.js';
import { createUtilesStore } from './lib/store.js';

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'cambia-este-token';
const APP_SECRET = process.env.APP_SECRET || '';
const EXCEL_PATH = process.env.EXCEL_PATH || './Laptops.xlsx';
const UTILES_PATH = process.env.UTILES_PATH || './UtilesEscolares.xlsx';

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v22.0';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY || '';
const YCLOUD_PHONE = process.env.YCLOUD_PHONE || '';
const YCLOUD_WEBHOOK_SECRET = process.env.YCLOUD_WEBHOOK_SECRET || '';

let cached = { key: '', laptops: null, phones: null, utiles: null };

const activeSessions = new Set();

async function getData() {
  const key = `${EXCEL_PATH}|${UTILES_PATH}`;
  if (cached.key === key && cached.utiles) return cached;
  const wb = await loadWorkbook(EXCEL_PATH);
  const laptops = getLaptops(wb.getWorksheet('Laptos'));
  const phones = getAuthorizedPhones(wb.getWorksheet('Autorizacion'));
  const uwb = await loadWorkbook(UTILES_PATH);
  const utiles = getUtilesProducts(getUtilesSheet(uwb));
  cached = { key, laptops, phones, utiles };
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

async function uploadYCloudMedia(from, buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);
  const res = await fetch(`https://api.ycloud.com/v2/whatsapp/media/${encodeURIComponent(from)}/upload`, {
    method: 'POST',
    headers: { 'X-API-Key': YCLOUD_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`upload YCloud: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function sendWhatsAppImage(to, buffer, businessFrom) {
  if (YCLOUD_API_KEY) {
    const from = YCLOUD_PHONE || (businessFrom ? `+${businessFrom}` : '');
    if (!from) {
      console.log('[enviar] falta configurar YCLOUD_PHONE. Imagen no enviada');
      return;
    }
    try {
      const id = await uploadYCloudMedia(from, buffer, 'cotizacion.png');
      const res = await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
        method: 'POST',
        headers: {
          'X-API-Key': YCLOUD_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: `+${to}`, type: 'image', image: { id } }),
      });
      if (res.ok) console.log('[enviar] imagen enviada via YCloud a', to);
      else console.log('[enviar] error imagen', res.status, await res.text());
    } catch (err) {
      console.error('[enviar] error al enviar imagen via YCloud', err);
    }
    return;
  }
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.log('[enviar] modo dev, imagen no enviada (', buffer.length, 'bytes )');
    return;
  }
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'image/png');
  form.append('file', new Blob([buffer], { type: 'image/png' }));
  const up = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: form,
  });
  if (!up.ok) {
    console.log('[enviar] error upload imagen', up.status, await up.text());
    return;
  }
  const upData = await up.json();
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'image', image: { id: upData.id } }),
  });
  if (!res.ok) console.log('[enviar] error imagen', res.status, await res.text());
}

async function downloadMedia(msg) {
  const link = msg.link;
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) {
    const headers = YCLOUD_API_KEY ? { 'X-API-Key': YCLOUD_API_KEY } : {};
    let res = await fetch(link, { headers });
    if (!res.ok && YCLOUD_API_KEY) {
      res = await fetch(link);
    }
    if (!res.ok) throw new Error(`descarga media: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!ACCESS_TOKEN) throw new Error('sin ACCESS_TOKEN para descargar media');
  const infoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${link}?phone_number_id=${PHONE_NUMBER_ID}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!infoRes.ok) throw new Error(`info media: ${infoRes.status}`);
  const info = await infoRes.json();
  if (!info.url) throw new Error('media id sin url');
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
  if (!res.ok) throw new Error(`descarga media: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function normalizeInbound(msg) {
  if (msg.type === 'image') {
    return { type: 'image', businessFrom: msg.businessFrom };
  }
  if (msg.type === 'document') {
    let data = null;
    try {
      data = await downloadMedia(msg);
    } catch (err) {
      console.error('[webhook] no se pudo descargar el archivo', err);
    }
    return { type: 'document', data, filename: msg.filename || 'archivo', businessFrom: msg.businessFrom };
  }
  return { type: 'text', text: msg.text?.body ?? '', businessFrom: msg.businessFrom };
}

const utilesStore = createUtilesStore({
  getProducts: async () => (await getData()).utiles,
  sendText: (to, body, businessFrom) => sendWhatsApp(to, body, businessFrom),
  sendImage: (to, buffer, businessFrom) => sendWhatsAppImage(to, buffer, businessFrom),
  log: console.log,
});

const pendingByFrom = new Map();

function runSerialized(from, fn) {
  const prev = pendingByFrom.get(from) || Promise.resolve();
  const next = prev.then(fn, fn);
  pendingByFrom.set(from, next.catch(() => {}));
  return next;
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
    const out = { from: m.from, businessFrom: m.to, type: m.type, text: m.text };
    const media = m.image || m.document;
    if (media) {
      out.link = media.link;
      out.mimeType = media.mime_type;
      out.mediaId = media.id;
      out.filename = media.filename;
    }
    return [out];
  }
  const changes = event?.entry?.[0]?.changes ?? [];
  const messages = [];
  for (const change of changes) {
    const value = change.value ?? {};
    const businessFrom = value.metadata?.phone_number_id;
    for (const m of value.messages ?? []) {
      const out = { from: m.from, businessFrom, type: m.type, text: m.text };
      const media = m.image || m.document;
      if (media) {
        out.link = media.id;
        out.mimeType = media.mime_type;
        out.mediaId = media.id;
        out.filename = media.filename;
      }
      messages.push(out);
    }
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
    if (!msg.from) continue;
    runSerialized(msg.from, async () => {
      try {
        const isText = msg.type === 'text';
        const text = msg.text?.body ?? '';
        console.log('[webhook] mensaje de', msg.from, ':', text || `[${msg.type}]`);
        const { laptops, phones } = await getData();
        const authorized = isAuthorized(msg.from, phones);
        const activeLaptop = activeSessions.has(msg.from);

        if (authorized && activeLaptop && isText) {
          if (isDeactivationMessage(text)) {
            activeSessions.delete(msg.from);
            await sendWhatsApp(msg.from, DEACTIVATION_REPLY, msg.businessFrom);
            return;
          }
          const reply = generateReply(text, laptops);
          await sendWhatsApp(msg.from, reply, msg.businessFrom);
          return;
        }

        if (authorized && activeLaptop) {
          console.log('[webhook] media en sesion de equipos ignorada', msg.from);
          return;
        }

        if (authorized && !activeLaptop && isActivationMessage(text)) {
          activeSessions.add(msg.from);
          await sendWhatsApp(msg.from, HELP, msg.businessFrom);
          return;
        }

        if (!authorized && isActivationMessage(text)) {
          console.log('[webhook] numero no autorizado intenta activar el bot', msg.from);
          return;
        }

        const normalized = await normalizeInbound(msg);
        await utilesStore.handleMessage(msg.from, normalized);
      } catch (err) {
        console.error('[webhook] error', err);
      }
    });
  }
});

app.get('/', (req, res) => {
  res.send('Bot de consulta de equipos y útiles escolares activo');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});