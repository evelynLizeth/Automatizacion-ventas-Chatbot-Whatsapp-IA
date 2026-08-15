import { findItems, parseItemList, parseFile, formatPrice, buildPriceImage, matchListLines } from './utiles.js';
import { normalize } from './excel.js';

const STATES = {
  SALUDO: 'SALUDO',
  ESPERA_LISTA: 'ESPERA_LISTA',
  SELECCION: 'SELECCION',
  CANTIDAD: 'CANTIDAD',
  AGREGADO: 'AGREGADO',
  SUGERENCIA: 'SUGERENCIA',
  CONFIRMA_SUGERENCIA: 'CONFIRMA_SUGERENCIA',
  MODELO_MOCHILA: 'MODELO_MOCHILA',
  CONFIRMA_COTIZACION: 'CONFIRMA_COTIZACION',
  CONFIRMA_ARCHIVO: 'CONFIRMA_ARCHIVO',
  PREGUNTA_PRODUCTO: 'PREGUNTA_PRODUCTO',
  PREGUNTA_DISPONIBLE: 'PREGUNTA_DISPONIBLE',
  ENTREGA: 'ENTREGA',
  UBICACION: 'UBICACION',
  DIA_HORA: 'DIA_HORA',
  CONFIRMA_PEDIDO: 'CONFIRMA_PEDIDO',
  ESPERA_COMPROBANTE: 'ESPERA_COMPROBANTE',
  MODIFICAR: 'MODIFICAR',
  RETIRAR: 'RETIRAR',
  DESACTIVADO: 'DESACTIVADO',
};

const MIN_5 = 5 * 60 * 1000;
const MIN_2 = 2 * 60 * 1000;
const MIN_3 = 3 * 60 * 1000;

const SALUDO_REPLY =
  '¡Hola! Soy el asistente de útiles escolares. ¿Te interesa cotizar una lista de útiles?\n1. Sí, quiero enviar mi lista\n2. No\n\nPuedes enviarme tu lista por mensaje (un producto por línea) o adjuntarla como documento PDF o Excel, y te envío la cotización completa con precios.\n\nTambién puedes preguntarme por un producto específico (por ejemplo: goma en barra) y te digo su precio.';
const PIDE_LISTA =
  'Perfecto. Envíame tu lista de útiles: puedes escribirla en el chat o adjuntarla en PDF o Excel. Si son varios productos, escríbelos uno por línea.';
const DESPEDIDA = '¡Perfecto! Hasta luego. Si me necesitas, aquí estaré.';
const NO_ENCONTRADO =
  'No encontré ningún producto con ese nombre. Prueba con otro nombre o envíame tu lista completa de útiles.';
const NONE_FOUND_LIST =
  'No encontré ninguno de los productos de tu lista. Verifica los nombres y envíame la lista de nuevo, o escríbela en el chat.';
const PROCESANDO_LISTA =
  'Perfecto, recibí tu documento. Espera un momento, estoy armando tu cotización...';
const CONFIRMA_ARCHIVO_MSG = '¿Genero la cotización de este archivo?\n1. Sí\n2. No';
const PREGUNTA_PRODUCTO_MSG = '¿Deseas preguntar por un producto específico?\n1. Sí\n2. No';
const PREGUNTA_DISPONIBLE_MSG = '¿Deseas ver lo que tengo disponible?\n1. Sí\n2. No';
const PIDE_PRODUCTO = 'Perfecto. Dime qué producto deseas consultar.';
const ARCHIVO_NO_RECIBIDO =
  'Entiendo. No recibí tu archivo o no pude procesarlo. Por favor adjúntalo de nuevo en PDF o Excel, o escríbeme la lista por mensaje (un producto por línea).';
export const ESPERA_GENERANDO =
  'Estoy generando tu cotización, un momento. ¿Prefieres esperar a que termine, o escribes "completar el pedido" para detener la cotización y ajustar tu pedido?';
const PIDES_CANTIDAD = '¿Cuántas unidades deseas?';
const QTY_INVALID = 'No entendí la cantidad. Por favor dime cuántas unidades deseas (ejemplo: 3).';
const ALGO_MAS = '¿Deseas algo más o eso es todo?';
const CUAL_DESEAS = '¿Cuál deseas? Responde con el número o el nombre del producto.';
const PICK_INVALID = 'No entendí tu respuesta. ' + CUAL_DESEAS;
const SUGERENCIA_MSG = 'Tal vez te interesan mochilas, cartucheras o loncheras.\n1. Sí\n2. No';
const CONFIRMA_SUGERENCIA_MSG = 'En el catálogo puedes ver los modelos disponibles. ¿Deseas agregar al pedido?\n1. Sí\n2. No';
const MODELO_MSG = '¿Qué color o modelo deseas? Responde con el nombre o el número del producto.';
const CONFIRMA_COTIZACION_MSG = '¿Es esta la cotización que deseas?\n1. Sí\n2. No, deseo modificarla';
const ENTREGA_MSG = '¡Gracias! Tu pedido está listo. ¿Deseas entrega a domicilio (aplica recargo)?\n1. Sí\n2. No';
const SOLO_DOMICILIO =
  'Somos tienda online, solo realizamos entregas a domicilio. ¿Deseas continuar con la entrega a domicilio?\n1. Sí\n2. No';
const PIDE_UBICACION = '¿Cuál es la dirección donde quieres recibir tu pedido?';
const PIDE_DIA_HORA = '¿Qué día y en qué horario puedes recibir tu pedido?';
const MENU_COTIZACION =
  '¿Qué deseas hacer?\n1. Realizar el pedido\n2. Deseo modificarlo\n3. No estoy interesado';
const PIDE_COMPROBANTE =
  'Para completar tu pedido debes realizar la transferencia del 50% (no reembolsable) y el restante al recibir el producto. Por favor adjunta el comprobante de la transferencia.';
const PIDE_COMPROBANTE_OTRA_VEZ =
  'Espero tu comprobante de transferencia para poder procesar tu pedido. Por favor adjúntalo como imagen (captura) o documento.';
const COMPROBANTE_MANUAL =
  'Recibimos tu comprobante, gracias. Verificaremos que el anticipo del 50% (no reembolsable) se realizó a nombre de Evelyn Lizeth Zambrano y te confirmaremos tu pedido en breve.';
const DESPEDIDA_INTERES = 'No hay problema. Quedamos a tus órdenes para cuando lo necesites. ¡Hasta pronto!';
const MENU_MODIFICAR = '¿Qué deseas hacer?\n1. Agregar más productos\n2. Retirar productos';
const PIDE_AGREGAR = 'Perfecto. ¿Qué producto deseas agregar?';
const PIDE_RETIRAR = '¿Cuál deseas retirar? Responde con el número o el nombre del producto.';
const PAYMENT_REPLY =
  'El pago se realiza por transferencia: puedes enviar la mitad para confirmar tu pedido y el resto al momento de la entrega. ¿Te gustaría continuar?';
const FOTOS_REPLY = 'En nuestro catálogo puedes ver las fotos de los productos.';
const FOTO_NO_OCR = 'No puedo leer fotos. Por favor escribe tu lista de útiles por mensaje o adjúntala en PDF o Excel.';
const FILE_UNREADABLE = 'No pude leer el archivo. Envíalo en PDF o Excel, o escríbeme la lista por mensaje.';
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
  return /(foto|fotografia|imagen|imagenes|muestra|catalogo)/.test(t);
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
      direccion: null,
      diaHora: null,
      sugerido: false,
      pendingFile: null,
      busy: false,
      headers: [],
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

  function getAccesorioProducts() {
    return products.filter((p) => /(mochila|cartuchera|lonchera)/.test(normalize(p.producto)));
  }

  function addToSeleccion(session, product, qty = 1) {
    const key = normalize(product.producto);
    const prev = session.seleccion.get(key);
    session.seleccion.set(key, {
      nombre: product.producto,
      desc: product.descripcion || '',
      precio: product.precio,
      qty: (prev ? prev.qty : 0) + qty,
    });
  }

  function seleccionList(session) {
    let i = 1;
    const lines = [];
    for (const [, it] of session.seleccion) {
      lines.push(`${i}. ${it.nombre}${it.qty > 1 ? ` (${it.qty})` : ''}`);
      i += 1;
    }
    return `Tu pedido actual:\n${lines.join('\n')}`;
  }

  async function handleList(from, session, lines, aselection = false) {
    const { headers, items } = matchListLines(lines, products);
    if (items.length === 0) {
      await sendText(from, NONE_FOUND_LIST, session.businessFrom);
      return;
    }
    session.headers = headers;
    for (const r of items) {
      if (r.precio != null) addToSeleccion(session, { producto: r.nombre, descripcion: r.descripcion, precio: r.precio }, 1);
    }
    const png = await buildPriceImage(items, { headers });
    await sendImage(from, png, session.businessFrom);
    if (aselection && session.seleccion.size > 0) {
      await sendText(from, ALGO_MAS, session.businessFrom);
      session.state = STATES.AGREGADO;
    } else {
      await sendText(from, CONFIRMA_COTIZACION_MSG, session.businessFrom);
      session.state = STATES.CONFIRMA_COTIZACION;
    }
    session.lastOptions = [];
  }

  async function buildSeleccionImage(from, session, opts) {
    const rows = [];
    for (const [, it] of session.seleccion) {
      rows.push({ nombre: it.nombre, precio: it.precio, qty: it.qty });
    }
    const png = await buildPriceImage(rows, { ...opts, headers: session.headers || [] });
    await sendImage(from, png, session.businessFrom);
  }

  async function sendPreliminaryCotizacion(from, session) {
    await buildSeleccionImage(from, session);
    await sendText(from, CONFIRMA_COTIZACION_MSG, session.businessFrom);
    session.state = STATES.CONFIRMA_COTIZACION;
  }

  async function sendFinalCotizacion(from, session) {
    await buildSeleccionImage(from, session, {
      entrega: { direccion: session.direccion, diaHora: session.diaHora },
    });
    await sendText(from, MENU_COTIZACION, session.businessFrom);
    session.state = STATES.CONFIRMA_PEDIDO;
  }

  async function cotizarOrSugerir(from, session) {
    if (!session.sugerido && getAccesorioProducts().length > 0) {
      session.sugerido = true;
      await sendText(from, SUGERENCIA_MSG, session.businessFrom);
      session.state = STATES.SUGERENCIA;
      return;
    }
    if (session.direccion) return sendFinalCotizacion(from, session);
    return sendPreliminaryCotizacion(from, session);
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
    if (/(pdf|archivo|documento|adjunt|envie|mande|mando|reenviar|subi|recibi|recibio|ya te|te envie|te mando)/.test(t)) {
      await sendText(from, ARCHIVO_NO_RECIBIDO, session.businessFrom);
      return;
    }
    if (/(de donde|donde|por que|porque|para que|de que|que es|como)/.test(t)) {
      await sendText(from, PIDE_LISTA, session.businessFrom);
      return;
    }
    const hits = findItems(t, products);
    if (hits.length === 0) {
      await sendText(from, PIDE_LISTA, session.businessFrom);
      return;
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
    addToSeleccion(session, p, qty);
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
      return cotizarOrSugerir(from, session);
    }
    if (text.includes('\n')) {
      const lines = parseItemList(text);
      if (lines.length) return handleList(from, session, lines, true);
    }
    return handleProductQuery(from, session, text);
  }

  async function handleSugerencia(from, session, text, t) {
    if (matchesYes(t)) {
      const cats = getAccesorioProducts();
      const list = cats
        .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
        .join('\n');
      await sendText(from, `Encontré estos productos:\n${list}\n\n${CONFIRMA_SUGERENCIA_MSG}`, session.businessFrom);
      session.state = STATES.CONFIRMA_SUGERENCIA;
      return;
    }
    if (matchesNo(t)) {
      if (session.direccion) return sendFinalCotizacion(from, session);
      return sendPreliminaryCotizacion(from, session);
    }
    await sendText(from, SUGERENCIA_MSG, session.businessFrom);
  }

  async function handleConfirmaSugerencia(from, session, text, t) {
    if (matchesYes(t)) {
      await sendText(from, MODELO_MSG, session.businessFrom);
      session.state = STATES.MODELO_MOCHILA;
      return;
    }
    if (matchesNo(t)) {
      if (session.direccion) return sendFinalCotizacion(from, session);
      return sendPreliminaryCotizacion(from, session);
    }
    await sendText(from, CONFIRMA_SUGERENCIA_MSG, session.businessFrom);
  }

  async function handleModeloMochila(from, session, text, t) {
    const cats = getAccesorioProducts();
    if (cats.length === 0) {
      if (session.direccion) return sendFinalCotizacion(from, session);
      return sendPreliminaryCotizacion(from, session);
    }
    const hits = findItems(text, cats);
    if (hits.length === 1) {
      const p = hits[0];
      addToSeleccion(session, p, 1);
      const y = products.find((pp) => !session.seleccion.has(normalize(pp.producto)));
      const extra = y ? `\n¿Deseas algo más? Por ejemplo tenemos ${y.producto}.` : '';
      await sendText(from, `Agregado: ${p.producto}${extra}\n\n${ALGO_MAS}`, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    if (hits.length > 1) {
      session.lastOptions = hits;
      session.state = STATES.SELECCION;
      const list = hits
        .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
        .join('\n');
      await sendText(from, `Encontré varias opciones:\n${list}\n\n${CUAL_DESEAS}`, session.businessFrom);
      return;
    }
    session.lastOptions = cats;
    session.state = STATES.SELECCION;
    const list = cats
      .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
      .join('\n');
    await sendText(from, `No encontré ese modelo. Estos son los disponibles:\n${list}\n\n${CUAL_DESEAS}`, session.businessFrom);
  }

  async function handleConfirmaCotizacion(from, session, text, t) {
    if (/(detener|detener la cotizacion|completar el pedido|saltar)/.test(t)) {
      await sendText(from, MENU_MODIFICAR, session.businessFrom);
      session.state = STATES.MODIFICAR;
      return;
    }
    if (/(esperar|espera|aguanta|un momento)/.test(t)) {
      await sendText(from, CONFIRMA_COTIZACION_MSG, session.businessFrom);
      return;
    }
    if (matchesYes(t) || isEsoEsTodo(t)) {
      await sendText(from, ENTREGA_MSG, session.businessFrom);
      session.state = STATES.ENTREGA;
      return;
    }
    if (matchesNo(t)) {
      await sendText(from, MENU_MODIFICAR, session.businessFrom);
      session.state = STATES.MODIFICAR;
      return;
    }
    await sendText(from, CONFIRMA_COTIZACION_MSG, session.businessFrom);
  }

  async function handleConfirmaArchivo(from, session, text, t) {
    if (matchesYes(t)) {
      const pf = session.pendingFile;
      session.pendingFile = null;
      if (!pf) {
        await sendText(from, FILE_UNREADABLE, session.businessFrom);
        return;
      }
      session.busy = true;
      try {
        await sendText(from, PROCESANDO_LISTA, session.businessFrom);
        let lines = null;
        try {
          lines = await parseFile(pf.data, pf.filename);
        } catch {
          lines = null;
        }
        if (!lines || lines.length === 0) {
          await sendText(from, FILE_UNREADABLE, session.businessFrom);
          return;
        }
        return await handleList(from, session, lines);
      } finally {
        session.busy = false;
      }
    }
    if (matchesNo(t)) {
      session.pendingFile = null;
      await sendText(from, PREGUNTA_PRODUCTO_MSG, session.businessFrom);
      session.state = STATES.PREGUNTA_PRODUCTO;
      return;
    }
    await sendText(from, CONFIRMA_ARCHIVO_MSG, session.businessFrom);
  }

  async function handlePreguntaProducto(from, session, text, t) {
    if (matchesYes(t)) {
      await sendText(from, PIDE_PRODUCTO, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    if (matchesNo(t)) {
      await sendText(from, PREGUNTA_DISPONIBLE_MSG, session.businessFrom);
      session.state = STATES.PREGUNTA_DISPONIBLE;
      return;
    }
    await sendText(from, PREGUNTA_PRODUCTO_MSG, session.businessFrom);
  }

  async function handlePreguntaDisponible(from, session, text, t) {
    if (matchesYes(t)) {
      const cat = products
        .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
        .join('\n');
      await sendText(
        from,
        `Este es mi catálogo disponible:\n${cat}\n\nEscríbeme qué producto deseas agregar a tu cotización.`,
        session.businessFrom
      );
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    if (matchesNo(t)) {
      await sendText(from, DESPEDIDA, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, PREGUNTA_DISPONIBLE_MSG, session.businessFrom);
  }

  async function handleEntrega(from, session, text, t) {
    if (matchesYes(t)) {
      await sendText(from, PIDE_UBICACION, session.businessFrom);
      session.state = STATES.UBICACION;
      return;
    }
    if (matchesNo(t) || /retir|recog|retiro|donde entrego|donde retiro/.test(t)) {
      await sendText(from, SOLO_DOMICILIO, session.businessFrom);
      return;
    }
    await sendText(from, ENTREGA_MSG, session.businessFrom);
  }

  async function handleUbicacion(from, session, text, t) {
    if (text.length < 5) {
      await sendText(from, PIDE_UBICACION, session.businessFrom);
      return;
    }
    session.direccion = text;
    await sendText(from, PIDE_DIA_HORA, session.businessFrom);
    session.state = STATES.DIA_HORA;
  }

  async function handleDiaHora(from, session, text, t) {
    if (text.length < 5) {
      await sendText(from, PIDE_DIA_HORA, session.businessFrom);
      return;
    }
    session.diaHora = text;
    return sendFinalCotizacion(from, session);
  }

  async function handleConfirmarPedido(from, session, text, t) {
    if (matchesYes(t) || isEsoEsTodo(t) || /(realizar|pedido|confirmar|comprar)/.test(t)) {
      await sendText(from, PIDE_COMPROBANTE, session.businessFrom);
      session.state = STATES.ESPERA_COMPROBANTE;
      return;
    }
    if (/(^|[^0-9])2([^0-9]|$)/.test(t) || /(modificar|modific|modificar el pedido|cambiar)/.test(t)) {
      await sendText(from, MENU_MODIFICAR, session.businessFrom);
      session.state = STATES.MODIFICAR;
      return;
    }
    if (/(^|[^0-9])3([^0-9]|$)/.test(t) || matchesNo(t) || /(interesad|desistir)/.test(t)) {
      await sendText(from, DESPEDIDA_INTERES, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, MENU_COTIZACION, session.businessFrom);
  }

  async function handleEsperaComprobante(from, session, text, t) {
    await sendText(from, PIDE_COMPROBANTE_OTRA_VEZ, session.businessFrom);
  }

  async function handleComprobanteMedia(from, session) {
    const total = [...session.seleccion.values()].reduce(
      (s, it) => s + (it.precio != null ? Number(it.precio) * (Number(it.qty) || 1) : 0),
      0
    );
    const anticipo = Math.round(total * 0.5 * 100) / 100;
    log(
      `[utiles] COMPROBANTE recibido de ${from} | total cotización: ${formatPrice(total)} | anticipo esperado (50% no reembolsable): ${formatPrice(anticipo)} | titular esperado: Evelyn Lizeth Zambrano | VERIFICAR MANUALMENTE`
    );
    await sendText(from, COMPROBANTE_MANUAL, session.businessFrom);
    deactivate(from, session);
  }

  async function handleModificar(from, session, text, t) {
    if (matchesYes(t) || /agregar|anadir|agreg|mas/.test(t)) {
      await sendText(from, PIDE_AGREGAR, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    if (matchesNo(t) || /retirar|quitar|sacar|remover/.test(t)) {
      await sendText(from, `${seleccionList(session)}\n\n${PIDE_RETIRAR}`, session.businessFrom);
      session.state = STATES.RETIRAR;
      return;
    }
    await sendText(from, MENU_MODIFICAR, session.businessFrom);
  }

  async function handleRetirar(from, session, text, t) {
    const entries = [...session.seleccion.entries()];
    let idx = -1;
    const m = text.match(/^\s*(\d+)\s*$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= entries.length) idx = n - 1;
    } else {
      const names = entries.map(([, it]) => it.nombre);
      const hits = findItems(text, names.map((n) => ({ producto: n, descripcion: '', precio: null })));
      if (hits.length) {
        const hitName = hits[0].producto;
        idx = names.findIndex((n) => n === hitName);
      }
    }
    if (idx === -1) {
      await sendText(from, `${seleccionList(session)}\n\n${PIDE_RETIRAR}`, session.businessFrom);
      return;
    }
    const [key, it] = entries[idx];
    session.seleccion.delete(key);
    if (session.seleccion.size === 0) {
      await sendText(from, `Se retiró ${it.nombre}. Tu pedido quedó vacío.\n\n${PIDE_LISTA}`, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    await sendText(from, `Se retiró ${it.nombre}. Actualizando tu cotización...`, session.businessFrom);
    return sendFinalCotizacion(from, session);
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
      if (session.state === STATES.ESPERA_COMPROBANTE) {
        return handleComprobanteMedia(from, session);
      }
      await sendText(from, FOTO_NO_OCR, session.businessFrom);
      return;
    }

    if (msg.type === 'document') {
      if (session.state === STATES.ESPERA_COMPROBANTE) {
        return handleComprobanteMedia(from, session);
      }
      if (!msg.data) {
        await sendText(from, FILE_UNREADABLE, session.businessFrom);
        return;
      }
      session.pendingFile = { data: msg.data, filename: msg.filename };
      await sendText(from, CONFIRMA_ARCHIVO_MSG, session.businessFrom);
      session.state = STATES.CONFIRMA_ARCHIVO;
      return;
    }

    const text = String(msg.text || '').trim();
    if (!text) return;
    const t = normalize(text);

    if (session.state !== STATES.ESPERA_COMPROBANTE && isPaymentRequest(t)) {
      await sendText(from, PAYMENT_REPLY, session.businessFrom);
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && isPhotoRequest(t)) {
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
      case STATES.SUGERENCIA:
        return handleSugerencia(from, session, text, t);
      case STATES.CONFIRMA_SUGERENCIA:
        return handleConfirmaSugerencia(from, session, text, t);
      case STATES.MODELO_MOCHILA:
        return handleModeloMochila(from, session, text, t);
      case STATES.CONFIRMA_COTIZACION:
        return handleConfirmaCotizacion(from, session, text, t);
      case STATES.CONFIRMA_ARCHIVO:
        return handleConfirmaArchivo(from, session, text, t);
      case STATES.PREGUNTA_PRODUCTO:
        return handlePreguntaProducto(from, session, text, t);
      case STATES.PREGUNTA_DISPONIBLE:
        return handlePreguntaDisponible(from, session, text, t);
      case STATES.ENTREGA:
        return handleEntrega(from, session, text, t);
      case STATES.UBICACION:
        return handleUbicacion(from, session, text, t);
      case STATES.DIA_HORA:
        return handleDiaHora(from, session, text, t);
      case STATES.CONFIRMA_PEDIDO:
        return handleConfirmarPedido(from, session, text, t);
      case STATES.ESPERA_COMPROBANTE:
        return handleEsperaComprobante(from, session, text, t);
      case STATES.MODIFICAR:
        return handleModificar(from, session, text, t);
      case STATES.RETIRAR:
        return handleRetirar(from, session, text, t);
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
    isBusy: (from) => sessions.get(from)?.busy === true,
    getSeleccion: (from) => {
      const s = sessions.get(from);
      return s ? [...s.seleccion.values()] : [];
    },
    close,
    log,
  };
}
