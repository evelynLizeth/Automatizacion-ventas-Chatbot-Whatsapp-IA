export const NUMEROS = {
  una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};

export function matchesYes(t) {
  return /(^|[^a-z])s[ií]([^a-z]|$)/.test(t) || /(^|[^0-9])1([^0-9]|$)/.test(t);
}

export function matchesNo(t) {
  return /(^|[^a-z])no([^a-z]|$)/.test(t) || /(^|[^0-9])2([^0-9]|$)/.test(t);
}

export function isEsoEsTodo(t) {
  return /^(eso es todo|eso seria todo|eso seria|eso es|nada mas|listo|ya)$/.test(t);
}

export function isGracias(t) {
  return /(gracias|graci|ok|perfecto|genial|excelente|buenisimo|de acuerdo)/.test(t);
}

export function isPaymentRequest(t) {
  return /(pago|pagar|pague|paga|pagos|transferencia|transferir|transfero|anticipo|deposito|abono)/.test(t);
}

export function isPayAllOnPickup(t) {
  return /(pagar|pago|pague)/.test(t) && /(todo|completo|entero|100|retir|recog|cuando|al momento de)/.test(t);
}

export function isPhotoRequest(t) {
  return /(foto|fotografia|imagen|imagenes|muestra)/.test(t);
}

export function isCatalogRequest(t) {
  return /(que tienes|que tiene|que hay|que vendes|que vende|que venden|que productos|que ofreces|que me ofreces|que maneja|que manejan|lista de productos|todos los productos|catalogo|disponible|inventario)/.test(t);
}

export function isChatbotRequest(t) {
  return /(chatbot|bot inteligente|asistente para mi negocio)/.test(t);
}

export function isDemoRequest(t) {
  return /(^1$|demo|muestra|ejemplo|simulacion|simulaci|ver como funciona|ver como trabaja|como funciona un agente|utiles escolares|util escolar|lista de utiles|ver el agente|agente en accion|agente en acción|como vendes|prueba)/.test(t);
}

export function isServiceRequest(t) {
  return /^(2$|pagina web|página web|app web|aplicacion web|aplicación web|agente de whatsapp|automatizacion|automatizaci|mi negocio|quiero.*(agente|web|app)|me interesa.*(agente|web|app)|desarrollar|implementar|lanzar|crear)/.test(t);
}

export function isQuoteRequest(t) {
  return /cotiza/.test(t);
}

export function isBotSelfDisclosure(t) {
  return /(soy (un )?bot|chat ?bot|chatgpt|gemini|claude|asistente virtual|gpt[-\s]?[345]|soy una ia|inteligencia artificial)/.test(String(t || ''));
}

export function isTalkToEvelyn(t) {
  return /(comunic|habl|contact|convers|chate|atend|atiend|conect)[\s\S]{0,40}evelyn|evelyn[\s\S]{0,40}(comunic|habl|contact|convers|chate|atend|atiend|conect|necesito|necesita|por favor)/.test(t);
}

export function isEliminarIntent(t) {
  return /(eliminar|quitar|sacar|remover|^2$)/.test(t);
}

export function isAgregarIntent(t) {
  return /(agregar|anadir|mas|^1$)/.test(t);
}

export function parseQuantity(t) {
  const m = String(t ?? '').match(/\d+/);
  if (m) {
    const n = parseInt(m[0], 10);
    if (n > 0 && n <= 999) return n;
  }
  const words = String(t ?? '').replace(/[^a-z\s]/g, ' ').trim().split(/\s+/);
  for (const w of words) {
    if (NUMEROS[w]) return NUMEROS[w];
  }
  return null;
}
