import { STATES, CHATBOT_FIELDS, CHATBOT_INTRO, CHATBOT_PIDE_APROBACION, CHATBOT_APROBADO } from './messages.js';
import { matchesYes, isEsoEsTodo } from './intents.js';

export function isChatbotState(state) {
  return state === STATES.CHATBOT || state === STATES.CHATBOT_CONFIRMA || state === STATES.CHATBOT_EDITAR;
}

export function buildChatbotSummary(info) {
  const lines = CHATBOT_FIELDS.map((f) => `• ${f.label}: ${info[f.key] || '(sin responder)'}`);
  return `RESUMEN DE TUS REQUERIMIENTOS:\n${lines.join('\n')}`;
}

export function buildChatbotFieldList() {
  const lines = CHATBOT_FIELDS.map((f, i) => `${i + 1}. ${f.label}`);
  return `Estos son los campos de tus requerimientos:\n${lines.join('\n')}\n¿Cuál deseas corregir? Responde con su número, o escribe "listo" para volver al resumen.`;
}

export function createChatbotHandlers({ sendText, log, maybeClose }) {
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
        log(`[utiles] REQUERIMIENTOS SERVICIO de ${from}:\n${buildChatbotSummary(session.chatbotInfo)}`);
        await sendText(from, CHATBOT_APROBADO, session.businessFrom);
        await maybeClose(from, session);
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

  return { startChatbot, handleChatbot };
}
