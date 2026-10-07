import fs from 'node:fs';
import path from 'node:path';
import { STATES } from './messages.js';

export function createSessionState(startInDemo = false) {
  return {
    state: startInDemo ? STATES.SALUDO : STATES.SERVICIOS,
    greeted: false,
    demoMode: Boolean(startInDemo),
    serviciosHistory: [],
    seleccion: new Map(),
    lastOptions: [],
    pendingProduct: null,
    pendingList: null,
    listSteps: [],
    pendingProposal: null,
    direccion: null,
    diaHora: null,
    nombreEntrega: null,
    genero: null,
    delivery: null,
    sugerido: false,
    pendingFile: null,
    busy: false,
    headers: [],
    businessFrom: null,
    timer: null,
    lastActivity: Date.now(),
    iaHistory: [],
    sent: { catalogo: false, fotos: new Set(), quoteSig: null, finalSig: null },
    receiptAttempts: 0,
    lastReceiptSig: null,
    lastListSig: null,
    listaMode: false,
    listaBase: null,
    chatbotStep: 0,
    chatbotInfo: {},
    chatbotConfirm: false,
    chatbotEditField: null,
    botScore: 0,
    degraded: false,
    msgTimes: [],
    lastTexts: [],
    msgHourStart: 0,
    msgHourCount: 0,
    challenged: false,
    challengeFails: 0,
    botCoolUntil: 0,
  };
}

export function resetCarritoFields(session) {
  session.seleccion = new Map();
  session.lastOptions = [];
  session.pendingProduct = null;
  session.pendingList = null;
  session.listSteps = [];
  session.pendingProposal = null;
  session.direccion = null;
  session.diaHora = null;
  session.nombreEntrega = null;
  session.genero = null;
  session.delivery = null;
  session.sugerido = false;
  session.pendingFile = null;
  session.headers = [];
  session.iaHistory = [];
  session.sent = { catalogo: false, fotos: new Set(), quoteSig: null, finalSig: null };
  session.receiptAttempts = 0;
  session.lastReceiptSig = null;
  session.lastListSig = null;
  session.listaMode = false;
  session.listaBase = null;
  session.chatbotStep = 0;
  session.chatbotInfo = {};
  session.chatbotConfirm = false;
  session.chatbotEditField = null;
}

function encodeFile(f) {
  if (!f) return null;
  if (Buffer.isBuffer(f?.data)) {
    if (f.data.length > 5 * 1024 * 1024) return { ...f, data: null, truncated: true };
    return { ...f, data: f.data.toString('base64'), encoding: 'base64' };
  }
  if (Buffer.isBuffer(f)) {
    if (f.length > 5 * 1024 * 1024) return null;
    return { data: f.toString('base64'), encoding: 'base64' };
  }
  return f;
}

function decodeFile(f) {
  if (!f) return null;
  if (f.encoding === 'base64' && typeof f.data === 'string') {
    const { encoding, ...rest } = f;
    return { ...rest, data: Buffer.from(f.data, 'base64') };
  }
  return f;
}

export function serializeSession(s) {
  const { timer, ...rest } = s;
  return {
    ...rest,
    seleccion: [...(s.seleccion instanceof Map ? s.seleccion.entries() : Object.entries(s.seleccion || {}))],
    sent: {
      ...(s.sent || {}),
      fotos: [...(s.sent?.fotos instanceof Set ? s.sent.fotos : (s.sent?.fotos || []))],
    },
    listaBase: s.listaBase instanceof Map ? [...s.listaBase.entries()] : s.listaBase,
    pendingFile: encodeFile(s.pendingFile),
    lastActivity: s.lastActivity || Date.now(),
  };
}

export function deserializeSession(o) {
  if (!o || typeof o !== 'object') return null;
  const s = { ...o, timer: null };
  try {
    s.seleccion = new Map(Array.isArray(o.seleccion) ? o.seleccion : []);
  } catch { s.seleccion = new Map(); }
  s.sent = {
    catalogo: Boolean(o.sent?.catalogo),
    fotos: new Set(Array.isArray(o.sent?.fotos) ? o.sent.fotos : []),
    quoteSig: o.sent?.quoteSig ?? null,
    finalSig: o.sent?.finalSig ?? null,
  };
  if (Array.isArray(o.listaBase)) {
    try { s.listaBase = new Map(o.listaBase); } catch { s.listaBase = o.listaBase; }
  }
  s.pendingFile = decodeFile(o.pendingFile);
  s.lastActivity = Number(o.lastActivity) || Date.now();
  s.botScore = Number(o.botScore) || 0;
  s.degraded = Boolean(o.degraded);
  s.msgTimes = Array.isArray(o.msgTimes) ? o.msgTimes.slice(-6) : [];
  s.lastTexts = Array.isArray(o.lastTexts) ? o.lastTexts.slice(-4) : [];
  s.msgHourStart = Number(o.msgHourStart) || 0;
  s.msgHourCount = Number(o.msgHourCount) || 0;
  s.challenged = Boolean(o.challenged);
  s.challengeFails = Number(o.challengeFails) || 0;
  s.botCoolUntil = Number(o.botCoolUntil) || 0;
  return s;
}

export function createMemorySessions() {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); },
    delete: (k) => map.delete(k),
    clear: () => map.clear(),
    entries: () => map.entries(),
    size: () => map.size,
    close: () => {},
  };
}

export function createFileSessions({ filePath, ttlMs = 14 * 60 * 1000, maxEntries = 1000, log = () => {} } = {}) {
  const mem = createMemorySessions();
  let saveTimer = null;
  const dir = path.dirname(filePath);

  function load() {
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const now = Date.now();
      let n = 0;
      for (const [k, v] of Object.entries(raw)) {
        const s = deserializeSession(v);
        if (!s) continue;
        if (now - (s.lastActivity || 0) > ttlMs) continue;
        if (mem.size() >= maxEntries) break;
        mem.set(k, s);
        n += 1;
      }
      if (n) log(`[sessions] restauradas ${n} sesiones desde ${filePath}`);
    } catch (err) {
      log(`[sessions] no se pudo cargar ${filePath}: ${err.message}`);
    }
  }

  function save() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of mem.entries()) obj[k] = serializeSession(v);
      fs.writeFileSync(filePath, JSON.stringify(obj).slice(0, 20 * 1024 * 1024));
    } catch (err) {
      log(`[sessions] no se pudo guardar: ${err.message}`);
    }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; save(); }, 500);
    saveTimer.unref?.();
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of mem.entries()) {
      if (now - (v.lastActivity || 0) > ttlMs) {
        if (v.timer) try { clearTimeout(v.timer); } catch {}
        mem.delete(k);
      }
    }
  }, 60 * 1000);
  sweeper.unref?.();

  load();

  return {
    get: (k) => mem.get(k),
    set: (k, v) => { v.lastActivity = Date.now(); mem.set(k, v); scheduleSave(); },
    touch: (k) => { const s = mem.get(k); if (s) { s.lastActivity = Date.now(); scheduleSave(); } },
    delete: (k) => { mem.delete(k); scheduleSave(); },
    clear: () => { mem.clear(); scheduleSave(); },
    entries: () => mem.entries(),
    size: () => mem.size(),
    close: () => { try { clearInterval(sweeper); } catch {} if (saveTimer) clearTimeout(saveTimer); save(); },
  };
}

export function createSessionBackend({ log = () => {} } = {}) {
  const file = process.env.SESSION_FILE || '';
  if (file) return createFileSessions({ filePath: file, log });
  return createMemorySessions();
}
