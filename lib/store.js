import {
  findItems,
  parseItemList,
  parseFile,
  formatPrice,
  buildPriceImage,
  buildCatalogoImage,
  matchListLines,
  buildListSteps,
  findProductImage,
} from './utiles.js';
import { normalize } from './excel.js';
import * as aiModule from './ai.js';
import { readFile } from 'node:fs/promises';

const STATES = {
  SALUDO: 'SALUDO',
  ASESOR: 'ASESOR',
  IA_CHAT: 'IA_CHAT',
  CHATBOT: 'CHATBOT',
  CHATBOT_CONFIRMA: 'CHATBOT_CONFIRMA',
  CHATBOT_EDITAR: 'CHATBOT_EDITAR',
  DESACTIVADO: 'DESACTIVADO',
};
export const ESPERA_GENERANDO = 'ESPERA_GENERANDO';
const MIN_5 = 5 * 60 * 1000;
const MIN_9 = 9 * 60 * 1000;

const CATALOGO_URL = 'https://wa.me/c/593987695938';

const SALUDO_REPLY =
  '¡Hola! Soy el asistente virtual.\n¿Qué deseas hacer?\n1. Realizar una cotización de útiles escolares con asistencia de IA.\n2. Comunicarme con Evelyn.\n3. Solicitar un Chatbot Inteligente para mi negocio.';
const SALUDO_NO_REPLY = 'Ok, de aquí en adelante Evelyn chateará contigo.';
const TIMEOUT_1 = '¿Sigues ahí? Si deseas continuar, solo escríbeme.';
const TIMEOUT_2 = 'El chat se cerrará por falta de respuesta.';
const ASESOR_MSG =
  'Por favor sube tu documento y en cuanto pueda un asesor realizará la cotización personalmente y te la enviará. Si necesitas algo, estoy aquí.';
const ASESOR_GRACIAS = 'Gracias, en cuanto esté lista la cotización te la enviaremos.';

const CHATBOT_FIELDS = [
  { key: 'negocio', label: 'Nombre del negocio', q: 'Para empezar, ¿cuál es el nombre de tu negocio y a qué se dedica?' },
  { key: 'productos', label: 'Productos o servicios', q: '¿Qué productos o servicios ofreces?' },
  { key: 'canales', label: 'Canales de atención actuales', q: '¿Por qué medios atiendes hoy a tus clientes? (WhatsApp, Instagram, página web, tienda física...)' },
  { key: 'tareas', label: 'Tareas del chatbot', q: '¿Qué tareas debería realizar tu chatbot? (responder preguntas frecuentes, cotizaciones, ventas, agendar citas, recolectar datos...)' },
  { key: 'volumen', label: 'Consultas al día', q: '¿Aproximadamente cuántas consultas de clientes recibes al día?' },
  { key: 'catalogo', label: 'Catálogo o información disponible', q: '¿Ya tienes un catálogo de productos o precios en algún documento (Excel, PDF, web) que el chatbot pueda usar?' },
  { key: 'integraciones', label: 'Integraciones e idioma', q: '¿Necesitas integraciones (pagos, inventario, agenda, tu sistema) y en qué idioma atiendes a tus clientes?' },
  { key: 'contacto', label: 'Nombre y horario de contacto', q: 'Por último, ¿a qué nombre y en qué horario te contacta el asesor?' },
];
const CHATBOT_INTRO =
  '¡Claro! Con gusto te ayudo a levantar los requerimientos para tu chatbot inteligente. Te haré algunas preguntas rápidas.';
const CHATBOT_PIDE_APROBACION =
  '\n\n¿Estás de acuerdo con estos requerimientos? Responde sí, no, o dime qué deseas corregir.';
const CHATBOT_APROBADO =
  '¡Perfecto! Quedaron registrados los requerimientos de tu chatbot. Un asesor se pondrá en contacto contigo personalmente para concretar tu pedido. ¡Gracias por tu interés!';

const NUMEROS = {
  una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};

function matchesYes(t) {
  return /(^|[^a-z])s[ií]([^a-z]|$)/.test(t) || /(^|[^0-9])1([^0-9]|$)/.test(t);
}

function matchesNo(t) {
  return /(^|[^a-z])no([^a-z]|$)/.test(t) || /(^|[^0-9])2([^0-9]|$)/.test(t);
}

function isEsoEsTodo(t) {
  return /^(eso es todo|eso seria todo|eso seria|eso es|nada mas|listo|ya)$/.test(t);
}

function isGracias(t) {
  return /(gracias|graci|ok|perfecto|genial|excelente|buenisimo|de acuerdo)/.test(t);
}

export function createUtilesStore({ getProducts, sendText, sendImage, log = console.log, ai = aiModule }) {
  const sessions = new Map();
  let products = [];

  async function ensureProducts() {
    if (products.length === 0) products = await getProducts();
    return products;
  }

  function createSession() {
    return {
      state: STATES.SALUDO,
      greeted: false,
      seleccion: new Map(),
      businessFrom: null,
      timer: null,
      iaHistory: [],
      chatbotStep: 0,
      chatbotInfo: {},
      chatbotConfirm: false,
      chatbotEditField: null,
    };
  }

  function getSession(from) {
    let s = sessions.get(from);
    if (!s) {
      s = createSession();
      sessions.set(from, s);
    }
    return s;
  }

  function resetTimer(from, session) {
    if (session.timer) clearTimeout(session.timer);
    let paso = 0;
    const schedule = (delay) => {
      session.timer = setTimeout(async () => {
        if (session.state === STATES.DESACTIVADO) return;
        if (paso === 0) {
          await sendText(from, TIMEOUT_1, session.businessFrom);
          paso = 1;
          schedule(MIN_9);
        } else {
          await sendText(from, TIMEOUT_2, session.businessFrom);
          sessions.delete(from);
          log(`[utiles] sesión cerrada por inactividad ${from}`);
        }
      }, delay);
    };
    schedule(MIN_5);
  }

  function deactivate(from, session) {
    if (session.timer) clearTimeout(session.timer);
    sessions.delete(from);
  }

  async function goToEvelyn(from, session) {
    if (session.timer) clearTimeout(session.timer);
    session.state = STATES.DESACTIVADO;
    await sendText(from, SALUDO_NO_REPLY, session.businessFrom);
  }

  function buildChatbotSummary(info) {
    const lines = CHATBOT_FIELDS.map((f) => `• ${f.label}: ${info[f.key] || '(sin responder)'}`);
    return `RESUMEN DE TUS REQUERIMIENTOS:\n${lines.join('\n')}`;
  }

  function buildChatbotFieldList() {
    const lines = CHATBOT_FIELDS.map((f, i) => `${i + 1}. ${f.label}`);
    return `Estos son los campos de tus requerimientos:\n${lines.join('\n')}\n¿Cuál deseas corregir? Responde con su número, o escribe "listo" para volver al resumen.`;
  }

  async function startChatbot(from, session) {
    session.chatbotStep = 0;
    session.chatbotInfo = {};
    session.chatbotConfirm = false;
    session.chatbotEditField = null;
    session.state = STATES.CHATBOT;
    await sendText(from, `${CHATBOT_INTRO}\n\n${CHATBOT_FIELDS[0].q}`, session.businessFrom);
  }

  async function handleChatbot(from, session, text, t) {
    if (session.state === STATES.CHATBOT) {
      const step = session.chatbotStep;
      session.chatbotInfo[CHATBOT_FIELDS[step].key] = text;
      const next = step + 1;
      if (next < CHATBOT_FIELDS.length) {
        session.chatbotStep = next;
        await sendText(from, CHATBOT_FIELDS[next].q, session.businessFrom);
        return;
      }
      session.chatbotConfirm = true;
      await sendText(from, buildChatbotSummary(session.chatbotInfo) + CHATBOT_PIDE_APROBACION, session.businessFrom);
      session.state = STATES.CHATBOT_CONFIRMA;
      return;
    }
    if (session.state === STATES.CHATBOT_CONFIRMA) {
      if (matchesYes(t)) {
        log(`[utiles] REQUERIMIENTOS CHATBOT de ${from}:\n${buildChatbotSummary(session.chatbotInfo)}`);
        await sendText(from, CHATBOT_APROBADO, session.businessFrom);
        deactivate(from, session);
        return;
      }
      await sendText(from, buildChatbotFieldList(), session.businessFrom);
      session.state = STATES.CHATBOT_EDITAR;
      return;
    }
    if (session.chatbotEditField != null) {
      if (isEsoEsTodo(t) || /listo|terminar/.test(t)) {
        session.chatbotEditField = null;
      } else {
        session.chatbotInfo[CHATBOT_FIELDS[session.chatbotEditField].key] = text;
        session.chatbotEditField = null;
      }
      await sendText(from, buildChatbotSummary(session.chatbotInfo) + CHATBOT_PIDE_APROBACION, session.businessFrom);
      session.state = STATES.CHATBOT_CONFIRMA;
      return;
    }
    const m = text.match(/^\s*(\d+)\s*$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= CHATBOT_FIELDS.length) {
        session.chatbotEditField = n - 1;
        await sendText(from, `Perfecto. ¿Cuál es el nuevo valor para «${CHATBOT_FIELDS[n - 1].label}»?`, session.businessFrom);
        return;
      }
    }
    if (isEsoEsTodo(t) || /listo|terminar/.test(t)) {
      await sendText(from, buildChatbotSummary(session.chatbotInfo) + CHATBOT_PIDE_APROBACION, session.businessFrom);
      session.state = STATES.CHATBOT_CONFIRMA;
      return;
    }
    await sendText(from, buildChatbotFieldList(), session.businessFrom);
  }

  async function handleSaludo(from, session, text, t) {
    if (/^2$/.test(t) || /(comunicarse con evelyn|hablar con evelyn)/.test(t)) {
      return goToEvelyn(from, session);
    }
    if (/^3$/.test(t) || /(chatbot inteligente)/.test(t)) {
      return startChatbot(from, session);
    }
    if (/^1$/.test(t) || matchesYes(t) || /(cotizaci[oó]n|utiles)/.test(t)) {
      await ensureProducts();
      session.state = STATES.IA_CHAT;
      const intro = '¡Hola! Qué gusto saludarte. Con mucho gusto te ayudo a cotizar tu lista de útiles escolares de forma rápida y sencilla. ¿Cómo te gustaría enviarme tu lista (texto, foto o archivo PDF/Excel)?';
      await sendText(from, intro, session.businessFrom);
      return;
    }
    // Si el usuario escribe directamente sin marcar menú o ya está interactuando:
    await ensureProducts();
    session.state = STATES.IA_CHAT;
    return ai.handleIaMessage({ from, session, text, products, sendText, sendImage, log });
  }

  async function handleAsesor(from, session, text, t) {
    if (isGracias(t)) {
      await sendText(from, ASESOR_GRACIAS, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, ASESOR_MSG, session.businessFrom);
  }

  return {
    getSession,
    handleMessage: async (from, message, businessFrom = null) => {
      const session = getSession(from);
      session.businessFrom = businessFrom;
      resetTimer(from, session);

      const text = typeof message === 'string' ? message : message.text || '';
      const t = normalize(text);

      if (session.state === STATES.DESACTIVADO) return;

      if (session.state === STATES.SALUDO && !session.greeted) {
        session.greeted = true;
        await sendText(from, SALUDO_REPLY, session.businessFrom);
        return;
      }

      if (session.state === STATES.SALUDO) {
        return handleSaludo(from, session, text, t);
      }

      if (session.state === STATES.ASESOR) {
        return handleAsesor(from, session, text, t);
      }

      if (
        session.state === STATES.CHATBOT ||
        session.state === STATES.CHATBOT_CONFIRMA ||
        session.state === STATES.CHATBOT_EDITAR
      ) {
        return handleChatbot(from, session, text, t);
      }

      if (session.state === STATES.IA_CHAT) {
        await ensureProducts();
        return ai.handleIaMessage({ from, session, text: message, products, sendText, sendImage, log });
      }

      await sendText(from, SALUDO_REPLY, session.businessFrom);
      session.state = STATES.SALUDO;
    },
    close,
  };
}