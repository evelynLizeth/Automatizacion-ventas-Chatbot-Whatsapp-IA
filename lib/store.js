import { findItems, parseItemList, parseFile, formatPrice, buildPriceImage } from './utiles.js';
import { normalize } from './excel.js';

const STATES = {
  SALUDO: 'SALUDO',
  ESPERA_LISTA: 'ESPERA_LISTA',
  SELECCION: 'SELECCION',
  CANTIDAD: 'CANTIDAD',
  AGREGADO: 'AGREGADO',
  CONFIRMA_PEDIDO: 'CONFIRMA_PEDIDO',
  ENTREGA: 'ENTREGA',
  UBICACION_HORA: 'UBICACION_HORA',
  SEGUIMIENTO: 'SEGUIMIENTO',
  DESACTIVADO: 'DESACTIVADO',
};

const MIN_5 = 5 * 60 * 1000;
const MIN_2 = 2 * 60 * 1000;
const MIN_3 = 3 * 60 * 1000;

const SALUDO_REPLY =
  '¡Hola! Soy el asistente de útiles escolares. ¿Te interesa cotizar una lista de útiles?\n1. Sí \n2. No\n\nTambién puedes preguntarme por un producto (por ejemplo: goma en barra) y te digo su precio.';
const PIDE_LISTA =
  'Perfecto. Envíame tu lista de útiles: puedes escribirla en el chat. Si son varios productos, escríbelos uno por línea.';
const DESPEDIDA = '¡Perfecto! Hasta luego. Si me necesitas, aquí estaré.';
const DESPEDIDA_ASESOR = '¡Con gusto! Un asesor se comunicará contigo pronto. ¡Hasta luego!';
const NO_ENCONTRADO =
  'No encontré ningún producto con ese nombre. Prueba con otro nombre.';
const NONE_FOUND_LIST =
  'No encontré ninguno de los productos de tu lista. Escríbeme el producto que deseas.';
const PIDES_CANTIDAD = '¿Cuántas unidades deseas? (ejemplo: 2)';
const QTY_INVALID = 'No entendí la cantidad. Por favor dime cuántas unidades deseas (ejemplo: 3).';
const ALGO_MAS = '¿Deseas algo más o eso es todo?';
const CUAL_DESEAS = '¿Cuál deseas? Responde con el número o el nombre del producto.';
const PICK_INVALID = 'No entendí tu respuesta. ' + CUAL_DESEAS;
const CONFIRMA_ORDEN = '¿Deseas realizar el pedido?\n1. Sí\n2. No';
const ENTREGA_MSG = '¡Gracias! Tu pedido está listo. ¿Deseas entrega a domicilio (aplica recargo)?\n1. Sí\n2. No';
const PIDE_UBICACION = 'Enviame tu ubicación y en qué horario prefieres recibir tu pedido.';
const ORDEN_CONFIRMADA =
  '¡Pedido registrado! El pago se realiza por transferencia: la mitad para confirmar tu pedido y el resto al momento de la entrega. Te contactaremos para coordinar la entrega.';
const SEGUIMIENTO_MSG = '¿En qué más te ayudo?\n1. ¿Quieres algo más?\n2. Necesito hablar con un asesor';
const PAYMENT_REPLY =
  'El pago se realiza por transferencia: puedes enviar la mitad para confirmar tu pedido y el resto al momento de la entrega. ¿Te gustaría continuar?';
const FOTOS_REPLY = 'En nuestro catálogo puedes ver las fotos de los productos. https://wa.me/c/593987695938';
const FOTO_NO_OCR = 'No puedo leer fotos. Por favor escribe tu lista de útiles por mensaje.';
const FILE_UNREADABLE = 'No pude leer el archivo. Escríbeme la lista por mensaje.';
const TIMEOUT_1 = '¿Sigues ahí? Si deseas continuar con tu cotización, solo escríbeme.';
const TIMEOUT_2 = 'El chat se cerrará en 3 minutos si no hay respuesta.';

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

function isPaymentRequest(t) {
  return /(pago|pagar|pague|paga|pagos|transferencia|transferir|transfero|anticipo|deposito|abono)/.test(t);
}

function isPhotoRequest(t) {
  return /(foto|fotografia|imagen|imagenes|muestra)/.test(t);
}

function parseQuantity(t) {
  const m = t.match(/\d+/);
  if (m) {
    const n = parseInt(m[0], 10);
    if (n > 0 && n <= 999) return n;
  }
  const words = t.replace(/[^a-z\s]/g, ' ').trim().split(/\s+/);
  for (const w of words) {
    if (NUMEROS[w]) return NUMEROS[w];
  }
  return null;
}

export function createUtilesStore({ getProducts, sendText, sendImage, log = console.log }) {
  const sessions = new Map();
  let products = [];

  function createSession() {
    return {
      state: STATES.SALUDO,
      greeted: false,
      seleccion: new Map(),
      lastOptions: [],
      pendingProduct: null,
      businessFrom: null,
      timer: null,
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
    let step = 0;
    const schedule = () => {
      const delay = [MIN_5, MIN_2, MIN_3][step];
      if (delay === undefined) return;
      session.timer = setTimeout(async () => {
        if (session.state === STATES.DESACTIVADO) return;
        if (step === 0) {
          await sendText(from, TIMEOUT_1, session.businessFrom);
          step = 1;
          schedule();
        } else if (step === 1) {
          await sendText(from, TIMEOUT_2, session.businessFrom);
          step = 2;
          schedule();
        } else {
          sessions.delete(from);
          log(`[utiles] sesión cerrada por inactividad ${from}`);
        }
      }, delay);
    };
    schedule();
  }

  function deactivate(from, session) {
    if (session.timer) clearTimeout(session.timer);
    sessions.delete(from);
  }

  async function handleList(from, session, lines, aselection = false) {
    const results = [];
    for (const line of lines) {
      const hits = findItems(line, products);
      const hit = hits[0] || null;
      results.push({
        nombre: hit ? hit.producto : line,
        precio: hit ? hit.precio : null,
        qty: 1,
      });
    }
    if (results.every((r) => r.precio == null)) {
      await sendText(from, NONE_FOUND_LIST, session.businessFrom);
      return;
    }
    const png = await buildPriceImage(results);
    await sendImage(from, png, session.businessFrom);
    if (aselection && session.seleccion.size > 0) {
      await sendText(from, ALGO_MAS, session.businessFrom);
      session.state = STATES.AGREGADO;
    } else {
      await sendText(from, CONFIRMA_ORDEN, session.businessFrom);
      session.state = STATES.CONFIRMA_ORDEN;
    }
    session.lastOptions = [];
  }

  async function buildSeleccionImage(from, session) {
    const rows = [];
    for (const [, it] of session.seleccion) {
      rows.push({ nombre: it.nombre, precio: it.precio, qty: it.qty });
    }
    const png = await buildPriceImage(rows);
    await sendImage(from, png, session.businessFrom);
  }

  async function askQuantity(from, session, product) {
    session.pendingProduct = product;
    session.state = STATES.CANTIDAD;
    const lines = [
      product.producto,
      product.descripcion ? product.descripcion : null,
      product.precio != null ? `Precio: ${formatPrice(product.precio)}` : 'Precio: no disponible',
      `\n${PIDES_CANTIDAD}`,
    ];
    await sendText(from, lines.filter(Boolean).join('\n'), session.businessFrom);
  }

  async function handleProductQuery(from, session, text) {
    const hits = findItems(text, products);
    if (hits.length === 0) {
      await sendText(from, NO_ENCONTRADO, session.businessFrom);
      return;
    }
    if (hits.length === 1) {
      session.lastOptions = [];
      await askQuantity(from, session, hits[0]);
      return;
    }
    session.lastOptions = hits;
    session.state = STATES.SELECCION;
    const list = hits
      .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
      .join('\n');
    await sendText(from, `Encontré varias opciones:\n${list}\n\n${CUAL_DESEAS}`, session.businessFrom);
  }

  async function handleSaludo(from, session, text, t) {
    if (matchesYes(t)) {
      await sendText(from, PIDE_LISTA, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    if (matchesNo(t)) {
      await sendText(from, DESPEDIDA, session.businessFrom);
      deactivate(from, session);
      return;
    }
    if (text.includes('\n')) {
      const lines = parseItemList(text);
      if (lines.length) return handleList(from, session, lines);
    }
    return handleProductQuery(from, session, text);
  }

  async function handleEsperaLista(from, session, text, t) {
    if (matchesNo(t)) {
      await sendText(from, DESPEDIDA, session.businessFrom);
      deactivate(from, session);
      return;
    }
    if (text.includes('\n')) {
      const lines = parseItemList(text);
      if (lines.length) return handleList(from, session, lines);
    }
    return handleProductQuery(from, session, text);
  }

  async function handleSeleccion(from, session, text, t) {
    const opts = session.lastOptions || [];
    let chosen = null;
    const m = t.match(/^\s*(\d+)\s*$/);
    if (m) {
      chosen = opts[parseInt(m[1], 10) - 1] || null;
    } else {
      const hits = findItems(text, opts);
      chosen = hits[0] || null;
    }
    if (!chosen) {
      await sendText(from, PICK_INVALID, session.businessFrom);
      return;
    }
    session.lastOptions = [];
    await askQuantity(from, session, chosen);
  }

  async function handleCantidad(from, session, text, t) {
    const qty = parseQuantity(t);
    if (qty == null) {
      await sendText(from, QTY_INVALID, session.businessFrom);
      return;
    }
    const p = session.pendingProduct;
    if (!p) {
      await sendText(from, ALGO_MAS, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    const key = normalize(p.producto);
    session.seleccion.set(key, { nombre: p.producto, desc: p.descripcion, precio: p.precio, qty });
    session.pendingProduct = null;
    session.state = STATES.AGREGADO;
    const line = `${qty} x ${p.producto}${p.precio != null ? ` (${formatPrice(p.precio * qty)})` : ''}`;
    await sendText(from, `Agregado: ${line}\n\n${ALGO_MAS}`, session.businessFrom);
  }

  async function handleAgregado(from, session, text, t) {
    if (isEsoEsTodo(t) || matchesNo(t)) {
      if (session.seleccion.size === 0) {
        await sendText(from, PIDE_LISTA, session.businessFrom);
        session.state = STATES.ESPERA_LISTA;
        return;
      }
      await buildSeleccionImage(from, session);
      await sendText(from, CONFIRMA_ORDEN, session.businessFrom);
      session.state = STATES.CONFIRMA_ORDEN;
      return;
    }
    if (text.includes('\n')) {
      const lines = parseItemList(text);
      if (lines.length) return handleList(from, session, lines, true);
    }
    return handleProductQuery(from, session, text);
  }

  async function handleConfirmar(from, session, text, t) {
    if (matchesYes(t) || isEsoEsTodo(t)) {
      await sendText(from, ENTREGA_MSG, session.businessFrom);
      session.state = STATES.ENTREGA;
      return;
    }
    if (matchesNo(t)) {
      await sendText(from, SEGUIMIENTO_MSG, session.businessFrom);
      session.state = STATES.SEGUIMIENTO;
      return;
    }
    await sendText(from, CONFIRMA_ORDEN, session.businessFrom);
  }

  async function handleEntrega(from, session, text, t) {
    if (matchesYes(t)) {
      await sendText(from, PIDE_UBICACION, session.businessFrom);
      session.state = STATES.UBICACION_HORA;
      return;
    }
    await sendText(from, ENTREGA_MSG, session.businessFrom);
  }

  async function handleUbicacion(from, session, text, t) {
    if (text.length < 5) {
      await sendText(from, PIDE_UBICACION, session.businessFrom);
      return;
    }
    await sendText(from, ORDEN_CONFIRMADA, session.businessFrom);
    session.state = STATES.SEGUIMIENTO;
  }

  async function handleSeguimiento(from, session, text, t) {
    if (matchesYes(t) || /algo mas/.test(t)) {
      session.seleccion.clear();
      session.lastOptions = [];
      await sendText(from, ALGO_MAS, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    if (matchesNo(t) || /asesor|persona|humano|hablar con/.test(t)) {
      await sendText(from, DESPEDIDA_ASESOR, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, SEGUIMIENTO_MSG, session.businessFrom);
  }

  async function handleMessage(from, msg) {
    products = await getProducts();
    const session = getSession(from);
    session.businessFrom = msg.businessFrom || session.businessFrom;
    resetTimer(from, session);

    if (!session.greeted) {
      session.greeted = true;
      session.state = STATES.SALUDO;
      await sendText(from, SALUDO_REPLY, session.businessFrom);
      return;
    }

    if (msg.type === 'image') {
      await sendText(from, FOTO_NO_OCR, session.businessFrom);
      return;
    }

    if (msg.type === 'document') {
      if (!msg.data) {
        await sendText(from, FILE_UNREADABLE, session.businessFrom);
        return;
      }
      const lines = await parseFile(msg.data, msg.filename);
      if (!lines || lines.length === 0) {
        await sendText(from, FILE_UNREADABLE, session.businessFrom);
        return;
      }
      return handleList(from, session, lines);
    }

    const text = String(msg.text || '').trim();
    if (!text) return;
    const t = normalize(text);

    if (isPaymentRequest(t)) {
      await sendText(from, PAYMENT_REPLY, session.businessFrom);
      return;
    }
    if (isPhotoRequest(t)) {
      await sendText(from, FOTOS_REPLY, session.businessFrom);
      return;
    }

    switch (session.state) {
      case STATES.ESPERA_LISTA:
        return handleEsperaLista(from, session, text, t);
      case STATES.SELECCION:
        return handleSeleccion(from, session, text, t);
      case STATES.CANTIDAD:
        return handleCantidad(from, session, text, t);
      case STATES.AGREGADO:
        return handleAgregado(from, session, text, t);
      case STATES.CONFIRMA_ORDEN:
        return handleConfirmar(from, session, text, t);
      case STATES.ENTREGA:
        return handleEntrega(from, session, text, t);
      case STATES.UBICACION_HORA:
        return handleUbicacion(from, session, text, t);
      case STATES.SEGUIMIENTO:
        return handleSeguimiento(from, session, text, t);
      default:
        return handleSaludo(from, session, text, t);
    }
  }

  function close() {
    for (const [, s] of sessions) {
      if (s.timer) clearTimeout(s.timer);
    }
    sessions.clear();
  }

  return {
    handleMessage,
    getState: (from) => sessions.get(from)?.state,
    getSeleccion: (from) => {
      const s = sessions.get(from);
      return s ? [...s.seleccion.values()] : [];
    },
    close,
    log,
  };
}
