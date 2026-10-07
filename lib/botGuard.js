import { isBotSelfDisclosure } from './intents.js';

export const BOT_CHALLENGE_ANSWER = '7';

export function botThreshold() {
  return Number(process.env.BOT_SCORE_THRESHOLD) || 3;
}

export function botMaxPerHour() {
  return Number(process.env.BOT_MAX_HORA) || 20;
}

export function botCooldownMs() {
  return Number(process.env.BOT_COOLDOWN_MS) || 60 * 60 * 1000;
}

export function isBotCooling(session, now = Date.now()) {
  return Boolean(session?.botCoolUntil && now < Number(session.botCoolUntil));
}

export function updateBotSignals(session, normalizedText, now = Date.now()) {
  const reasons = [];
  let added = 0;
  const t = String(normalizedText || '');

  session.msgTimes = Array.isArray(session.msgTimes) ? session.msgTimes : [];
  session.lastTexts = Array.isArray(session.lastTexts) ? session.lastTexts : [];
  if (!session.msgHourStart || now - session.msgHourStart > 60 * 60 * 1000) {
    session.msgHourStart = now;
    session.msgHourCount = 0;
  }
  session.msgHourCount = (session.msgHourCount || 0) + 1;
  session.msgTimes.push(now);
  if (session.msgTimes.length > 6) session.msgTimes = session.msgTimes.slice(-6);
  session.lastTexts.push(t);
  if (session.lastTexts.length > 4) session.lastTexts = session.lastTexts.slice(-4);

  if (session.msgHourCount > botMaxPerHour()) {
    added += 3;
    reasons.push('hour-cap');
  }
  if (session.msgTimes.length >= 5 && now - session.msgTimes[0] <= 15000) {
    added += 2;
    reasons.push('speed');
  }
  const last3 = session.lastTexts.slice(-3);
  if (last3.length === 3 && last3[0] && last3.every((x) => x === last3[0])) {
    added += 2;
    reasons.push('repeat');
  }
  const last4 = session.lastTexts.slice(-4);
  if (last4.length >= 3 && last4.every((x) => /^[123]$/.test(x))) {
    added += 1;
    reasons.push('menu-loop');
  }
  if (isBotSelfDisclosure(t)) {
    added += 3;
    reasons.push('self-disclosure');
  }
  if (t.includes('"reply"') || t.includes('ir_demo') || t.includes('quieres ver una demo')) {
    added += 1;
    reasons.push('echo');
  }

  session.botScore = (session.botScore || 0) + added;
  if (session.botScore >= 1) session.degraded = session.botScore >= 1;
  return { added, reasons, score: session.botScore };
}
