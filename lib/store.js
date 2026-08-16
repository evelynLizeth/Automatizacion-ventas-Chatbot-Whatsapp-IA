import {
  findItems,
  parseItemList,
  parseFile,
  formatPrice,
  buildPriceImage,
  buildCatalogoImage,
  matchListLines,
  findProductImage,
} from './utiles.js';
import { normalize } from './excel.js';
import * as aiModule from './ai.js';
import { readFile } from 'node:fs/promises';

const STATES = {
  SALUDO: 'SALUDO',
  ESPERA_LISTA: 'ESPERA_LISTA',
  ASESOR: 'ASESOR',
  NUMEROS: 'NUMEROS',
  SELECCION: 'SELECCION',
  UNICO: 'UNICO',
  CANTIDAD: 'CANTIDAD',
  AGREGADO: 'AGREGADO',
  ELIMINAR: 'ELIMINAR',
  SUGERENCIA: 'SUGERENCIA',
  CONFIRMA_SUGERENCIA: 'CONFIRMA_SUGERENCIA',
  MODELO_MOCHILA: 'MODELO_MOCHILA',
  CONFIRMA_COTIZACION: 'CONFIRMA_COTIZACION',
  GENERO: 'GENERO',
  CONFIRMA_ARCHIVO: 'CONFIRMA_ARCHIVO',
  PREGUNTA_PRODUCTO: 'PREGUNTA_PRODUCTO',
  PREGUNTA_DISPONIBLE: 'PREGUNTA_DISPONIBLE',
  ENTREGA: 'ENTREGA',
  UBICACION: 'UBICACION',
  DIA_HORA: 'DIA_HORA',
  NOMBRE_ENTREGA: 'NOMBRE_ENTREGA',
  CONFIRMA_ENTREGA: 'CONFIRMA_ENTREGA',
  ESPERA_COMPROBANTE: 'ESPERA_COMPROBANTE',
  ESPERA_CONFIRMACION_RECIBO: 'ESPERA_CONFIRMACION_RECIBO',
  PICKUP_AGENDA: 'PICKUP_AGENDA',
  IA_CHAT: 'IA_CHAT',
  DESACTIVADO: 'DESACTIVADO',
};

const MIN_5 = 5 * 60 * 1000;
const MIN_2 = 2 * 60 * 1000;
const MIN_3 = 3 * 60 * 1000;

const CATALOGO_URL = 'https://wa.me/c/593987695938';

const SALUDO_REPLY =
  '¡Hola! Soy el asistente de útiles escolares. ¿Te interesa cotizar una lista de útiles?\n1. Sí con asistente IA\n2. No\n3. Deseo ver lo que tienes disponible\n\nTambién puedes preguntarme por un producto (por ejemplo: goma en barra) y te digo su precio.';
const PIDE_LISTA =
  'Perfecto. Envíame tu lista de útiles: puedes escribirla en el chat o adjuntarla en PDF o Excel. Si son varios productos, escríbelos uno por línea.';
const PIDE_NUMEROS =
  'Escríbeme los números de los artículos que deseas, separados por coma (ejemplo: 1,5,12).';
const NUMEROS_INVALID =
  'No entendí los números. Escríbelos separados por coma, por ejemplo: 1,5,12.';
const DESPEDIDA = '¡Perfecto! Hasta luego. Si me necesitas, aquí estaré.';
const NO_ENCONTRADO =
  'No encontré ningún producto con ese nombre. Prueba con otro nombre o envíame tu lista completa de útiles.';
const NONE_FOUND_LIST =
  'No encontré ninguno de los productos de tu lista. Verifica los nombres y envíame la lista de nuevo.';
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
const PIDES_CANTIDAD = '¿Cuántas unidades deseas? (ejemplo: 2)';
const QTY_INVALID = 'No entendí la cantidad. Por favor dime cuántas unidades deseas (ejemplo: 3).';
const MENU_AGREGADO = '1. Agregar productos\n2. Eliminar productos\n3. Finalizar pedido';
const CUAL_DESEAS = '¿Cuál deseas? Responde con el número o el nombre del producto.';
const PICK_INVALID = 'No entendí tu respuesta. ' + CUAL_DESEAS;
const PIDE_AGREGAR = 'Perfecto. ¿Qué producto deseas agregar?';
const PIDE_ELIMINAR = '¿Cuál deseas eliminar? Responde con el número o el nombre del producto.';
const CONFIRMA_COTIZACION_MSG =
  '¿Estás de acuerdo con la cotización?\n1. Estoy de acuerdo\n2. Modificar pedido';
const PIDE_GENERO = '¿La lista de útiles es para niña o para niño?\n1. Niña\n2. Niño';
const ENTREGA_MSG = '¿Deseas entrega a domicilio?\n1. Sí\n2. No';
const PIDE_UBICACION = 'Envíame la dirección donde quieres recibir tu pedido.';
const PIDE_DIA_HORA = '¿Qué día y a qué hora deseas que te entreguemos?';
const PIDE_NOMBRE_ENTREGA = '¿A nombre de quién realizamos la entrega?';
const CONFIRMA_ENTREGA_MSG =
  'Esta es tu cotización con los datos de entrega.\n¿Confirmas el pedido o deseas abandonarlo?\n1. Confirmar\n2. Abandonar';
const PAYMENT_REPLY =
  'El pago se realiza por transferencia: la mitad para confirmar tu pedido (no reembolsable) y el resto al momento de la entrega.';
const PAYMENT_TODO_RETIRO =
  '¡Claro que sí! Por políticas de seguridad, para confirmar tu pedido solicitamos el anticipo del 50% (no reembolsable) por transferencia a nombre de Evelyn Lizeth Zambrano y el restante al momento de la entrega o retiro. Así aseguramos tu reserva. ¿Te parece bien?';
const PAYMENT_PICKUP =
  'Para confirmar tu pedido, te agradezco que me envíes el anticipo del 50% (no reembolsable) y el resto al retirarlo. Envíame una foto de tu comprobante.';
const PAYMENT_DELIVERY =
  'Para confirmar tu pedido, te agradezco que me envíes el anticipo del 50% (no reembolsable) y el resto al momento de la entrega. Envíame una foto de tu comprobante.';
const COMPROBANTE_MANUAL =
  'Recibimos tu comprobante, gracias. Verificaremos que el anticipo del 50% (no reembolsable) se realizó a nombre de Evelyn Lizeth Zambrano y te confirmaremos tu pedido en breve.';
const COMPROBANTE_OK_IA = (monto) =>
  `¡Gracias! Verificamos tu comprobante por ${formatPrice(monto)} a nombre de Evelyn Lizeth Zambrano. Tu pedido quedó confirmado. ¡Muchas gracias por tu compra!`;
const COMPROBANTE_MAL_IA = (motivo, anticipo) =>
  `Revisamos tu comprobante y encontramos un detalle: ${motivo}. Recuerda que el anticipo debe ser ${formatPrice(anticipo)} (50% del total) a nombre de Evelyn Lizeth Zambrano. Verifica y reenvía tu comprobante.`;
const PIDE_COMPROBANTE_OTRA_VEZ =
  'Espero tu comprobante de transferencia para poder procesar tu pedido. Por favor adjúntalo como imagen (captura) o documento.';
const RETIRO_LISTO =
  'Tu pedido estará listo el día viernes, por favor me escribes indicándome a qué hora lo puedes retirar.';
const RETIRO_DESPEDIDA = 'Gracias por tu compra, nos vemos el viernes.';
const ENTREGA_MOTORIZADO =
  'Gracias por realizar tu pedido, un motorizado realizará la entrega según lo acordado.';
const DESPEDIDA_ABANDONO =
  'No hay problema. Quedamos a tus órdenes para cuando lo necesites. ¡Hasta pronto!';
const ASESOR_MSG =
  'Por favor sube tu documento y en cuanto pueda un asesor realizará la cotización personalmente y te la enviará. Si necesitas algo, estoy aquí.';
const ASESOR_GRACIAS = 'Gracias, en cuanto esté lista la cotización te la enviaremos.';
const ASESOR_DESPEDIDA =
  '¡Perfecto! Un asesor revisará tu documento y te enviará la cotización. ¡Hasta luego!';
const SUGERENCIA_MSG = `Tal vez te interesan mochilas, cartucheras o loncheras. Puedes ver los modelos en nuestro catálogo: ${CATALOGO_URL}\n1. Sí\n2. No`;
const CONFIRMA_SUGERENCIA_MSG = `En el catálogo puedes ver los modelos disponibles: ${CATALOGO_URL} ¿Deseas agregar al pedido?\n1. Sí\n2. No`;
const MODELO_MSG = '¿Qué color o modelo deseas? Responde con el nombre o el número del producto.';
const FOTOS_REPLY = `Las fotos disponibles están en nuestro catálogo: ${CATALOGO_URL} (mochilas, cartucheras y loncheras). Para el resto de productos puedo darte precio y descripción.`;
const FOTO_NO_OCR = 'No puedo leer fotos. Por favor escribe tu lista de útiles por mensaje o adjúntala en PDF o Excel.';
const FILE_UNREADABLE = 'No pude leer el archivo. Envíalo en PDF o Excel, o escríbeme la lista por mensaje.';
const TIMEOUT_1 = '¿Sigues ahí? Si deseas continuar con tu cotización, solo escríbeme.';
const TIMEOUT_2 = 'El chat se cerrará en 3 minutos si no hay respuesta.';
const AI_FALLBACK =
  'Disculpa, no pude procesar tu mensaje. Inténtalo de nuevo o escríbeme los productos que deseas (uno por línea).';
const AI_INTRO =
  '¡Perfecto! Ya puedes escribirme tu lista de útiles o preguntarme lo que necesites. También puedes enviarme una foto o un archivo PDF/Excel y lo reviso por ti.';

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

function isPaymentRequest(t) {
  return /(pago|pagar|pague|paga|pagos|transferencia|transferir|transfero|anticipo|deposito|abono)/.test(t);
}

function isPayAllOnPickup(t) {
  return /(pagar|pago|pague)/.test(t) && /(todo|completo|entero|100|retir|recog|cuando|al momento de)/.test(t);
}

function isPhotoRequest(t) {
  return /(foto|fotografia|imagen|imagenes|muestra)/.test(t);
}

function isCatalogRequest(t) {
  return /(que tienes|que tiene|que hay|que vendes|que vende|que venden|que productos|que ofreces|que me ofreces|que maneja|que manejan|lista de productos|todos los productos|catalogo|disponible|inventario)/.test(t);
}

function isQuoteRequest(t) {
  return /cotiza/.test(t);
}

function isEliminarIntent(t) {
  return /(eliminar|quitar|sacar|remover|^2$)/.test(t);
}

function isAgregarIntent(t) {
  return /(agregar|anadir|mas|^1$)/.test(t);
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

export function createUtilesStore({ getProducts, sendText, sendImage, log = console.log, ai = aiModule }) {
  const sessions = new Map();
  let products = [];

  function createSession() {
    return {
      state: STATES.SALUDO,
      greeted: false,
      seleccion: new Map(),
      lastOptions: [],
      pendingProduct: null,
      pendingList: null,
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
      iaHistory: [],
      sent: { catalogo: false, fotos: new Set(), quoteSig: null },
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

  function cartSig(session) {
    const rows = [...session.seleccion.values()]
      .map((it) => `${normalize(it.linea || it.nombre)}:${it.qty}`)
      .sort()
      .join('|');
    return rows || '(vacío)';
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

  async function sendCatalogoImage(from, session) {
    const png = await buildCatalogoImage(products);
    await sendImage(from, png, session.businessFrom);
  }

  async function sendProductPhoto(from, session, numero) {
    const p = products.find((x) => x.numero === Number(numero));
    const file = findProductImage(p);
    if (!file) {
      await sendText(from, `No tengo una foto disponible de ese producto. Los modelos de mochilas, cartucheras y loncheras pueden verse aquí: ${CATALOGO_URL}`, session.businessFrom);
      return;
    }
    const data = await readFile(file);
    await sendImage(from, data, session.businessFrom);
  }

  async function handleList(from, session, lines, aselection = false) {
    const { headers, items } = matchListLines(lines, products);
    if (items.length === 0) {
      await sendText(from, NONE_FOUND_LIST, session.businessFrom);
      return;
    }
    session.headers = headers;
    for (const r of items) {
      if (r.precio != null) {
        addToSeleccion(session, { producto: r.nombre, descripcion: r.descripcion, precio: r.precio }, 1);
      }
    }
    const png = await buildPriceImage(items, { headers });
    await sendImage(from, png, session.businessFrom);
    if (aselection && session.seleccion.size > 0) {
      await sendText(from, MENU_AGREGADO, session.businessFrom);
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
      entrega: {
        direccion: session.direccion,
        diaHora: session.diaHora,
        nombre: session.nombreEntrega,
        genero: session.genero,
      },
    });
    await sendText(from, CONFIRMA_ENTREGA_MSG, session.businessFrom);
    session.state = STATES.CONFIRMA_ENTREGA;
  }

  async function cotizarOrSugerir(from, session) {
    if (session.seleccion.size === 0) {
      await sendText(from, PIDE_LISTA, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    if (!session.sugerido && getAccesorioProducts().length > 0) {
      session.sugerido = true;
      await sendText(from, SUGERENCIA_MSG, session.businessFrom);
      session.state = STATES.SUGERENCIA;
      return;
    }
    return sendPreliminaryCotizacion(from, session);
  }

  async function askQuantity(from, session, product) {
    session.pendingProduct = product;
    session.state = STATES.CANTIDAD;
    const lines = [
      product.producto,
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
      session.lastOptions = [hits[0]];
      session.state = STATES.UNICO;
      const p = hits[0];
      const price = p.precio != null ? formatPrice(p.precio) : 'No disponible';
      await sendText(from, `Encontré esta única opción:\n${p.producto} - ${price}\n¿Deseas que lo agregue?\n1. Sí\n2. No`, session.businessFrom);
      return;
    }
    session.lastOptions = hits;
    session.state = STATES.SELECCION;
    const n = hits.length;
    const list = hits
      .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
      .join('\n');
    await sendText(from, `Encontré varias opciones:\n${list}\n${n + 1}. Ninguna\n\n${CUAL_DESEAS}`, session.businessFrom);
  }

  async function handleSaludo(from, session, text, t) {
    if (aiEnabled()) {
      if (/^2$/.test(t) || /^no$/.test(t)) {
        await sendText(from, DESPEDIDA, session.businessFrom);
        deactivate(from, session);
        return;
      }
      if (/^3$/.test(t)) {
        await sendCatalogoImage(from, session);
        await sendText(from, PIDE_NUMEROS, session.businessFrom);
        session.state = STATES.NUMEROS;
        return;
      }
      if (/asesor/.test(t)) {
        await sendText(from, ASESOR_MSG, session.businessFrom);
        session.state = STATES.ASESOR;
        return;
      }
      if (matchesYes(t)) {
        session.state = STATES.IA_CHAT;
        await sendText(from, AI_INTRO, session.businessFrom);
        return;
      }
      session.state = STATES.IA_CHAT;
      return handleIa(from, session, { type: 'text', text });
    }
    if (/asesor/.test(t)) {
      await sendText(from, ASESOR_MSG, session.businessFrom);
      session.state = STATES.ASESOR;
      return;
    }
    if (/^3$/.test(t)) {
      await sendCatalogoImage(from, session);
      await sendText(from, PIDE_NUMEROS, session.businessFrom);
      session.state = STATES.NUMEROS;
      return;
    }
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

  async function handleAsesor(from, session, text, t) {
    if (isGracias(t)) {
      await sendText(from, ASESOR_GRACIAS, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, ASESOR_MSG, session.businessFrom);
  }

  async function handleNumeros(from, session, text, t) {
    const nums = [...new Set((text.match(/\d+/g) || []).map(Number))].filter(
      (n) => n >= 1 && n <= products.length && products.some((p) => p.numero === n)
    );
    if (nums.length === 0) {
      await sendText(from, NUMEROS_INVALID, session.businessFrom);
      return;
    }
    const chosen = [];
    for (const n of nums) {
      const p = products.find((pp) => pp.numero === n);
      if (p) chosen.push(p);
    }
    session.lastOptions = [];
    const first = chosen[0];
    session.pendingProduct = first;
    session.pendingList = chosen.slice(1);
    await askQuantity(from, session, first);
  }

  async function handleSeleccion(from, session, text, t) {
    const opts = session.lastOptions || [];
    let chosen = null;
    const m = t.match(/^\s*(\d+)\s*$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n === opts.length + 1 || /ninguna/.test(t)) {
        session.lastOptions = [];
        await sendText(from, MENU_AGREGADO, session.businessFrom);
        session.state = STATES.AGREGADO;
        return;
      }
      chosen = opts[n - 1] || null;
    } else {
      if (/ninguna|ninguno|ningun/.test(t)) {
        session.lastOptions = [];
        await sendText(from, MENU_AGREGADO, session.businessFrom);
        session.state = STATES.AGREGADO;
        return;
      }
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

  async function handleUnico(from, session, text, t) {
    if (matchesYes(t)) {
      const p = session.lastOptions[0] || session.pendingProduct;
      if (p) return askQuantity(from, session, p);
    }
    if (matchesNo(t) || isEsoEsTodo(t) || /ninguna/.test(t)) {
      session.lastOptions = [];
      await sendText(from, MENU_AGREGADO, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    await sendText(from, PICK_INVALID, session.businessFrom);
  }

  async function handleCantidad(from, session, text, t) {
    const qty = parseQuantity(t);
    if (qty == null) {
      await sendText(from, QTY_INVALID, session.businessFrom);
      return;
    }
    const p = session.pendingProduct;
    if (!p) {
      await sendText(from, MENU_AGREGADO, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    addToSeleccion(session, p, qty);
    const line = `${qty} x ${p.producto}${p.precio != null ? ` (${formatPrice(p.precio * qty)})` : ''}`;
    if (session.pendingList && session.pendingList.length > 0) {
      const next = session.pendingList.shift();
      session.pendingProduct = next;
      await askQuantity(from, session, next);
      return;
    }
    session.pendingProduct = null;
    session.pendingList = null;
    session.state = STATES.AGREGADO;
    await sendText(from, `Agregado: ${line}\n\n${MENU_AGREGADO}`, session.businessFrom);
  }

  async function handleAgregado(from, session, text, t) {
    if (isEliminarIntent(t)) {
      await sendText(from, `${seleccionList(session)}\n\n${PIDE_ELIMINAR}`, session.businessFrom);
      session.state = STATES.ELIMINAR;
      return;
    }
    if (matchesNo(t) || isEsoEsTodo(t) || /(finalizar|^3$|ninguna|ninguno|terminar|nada mas)/.test(t)) {
      return cotizarOrSugerir(from, session);
    }
    if (isAgregarIntent(t) || matchesYes(t)) {
      await sendText(from, PIDE_AGREGAR, session.businessFrom);
      return;
    }
    if (text.includes('\n')) {
      const lines = parseItemList(text);
      if (lines.length) return handleList(from, session, lines, true);
    }
    return handleProductQuery(from, session, text);
  }

  async function handleEliminar(from, session, text, t) {
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
      await sendText(from, `${seleccionList(session)}\n\n${PIDE_ELIMINAR}`, session.businessFrom);
      return;
    }
    const [key, it] = entries[idx];
    session.seleccion.delete(key);
    if (session.seleccion.size === 0) {
      await sendText(from, `Se eliminó ${it.nombre}. Tu pedido quedó vacío.\n\n${PIDE_LISTA}`, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    await sendText(from, `Se eliminó ${it.nombre}.\n\n${MENU_AGREGADO}`, session.businessFrom);
    session.state = STATES.AGREGADO;
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
      return sendPreliminaryCotizacion(from, session);
    }
    await sendText(from, CONFIRMA_SUGERENCIA_MSG, session.businessFrom);
  }

  async function handleModeloMochila(from, session, text, t) {
    const cats = getAccesorioProducts();
    if (cats.length === 0) {
      return sendPreliminaryCotizacion(from, session);
    }
    const hits = findItems(text, cats);
    if (hits.length === 1) {
      const p = hits[0];
      addToSeleccion(session, p, 1);
      await sendText(from, `Agregado: ${p.producto}\n\n${MENU_AGREGADO}`, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    if (hits.length > 1) {
      session.lastOptions = hits;
      session.state = STATES.SELECCION;
      const list = hits
        .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
        .join('\n');
      await sendText(from, `Encontré varias opciones:\n${list}\n${hits.length + 1}. Ninguna\n\n${CUAL_DESEAS}`, session.businessFrom);
      return;
    }
    session.lastOptions = cats;
    session.state = STATES.SELECCION;
    const list = cats
      .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
      .join('\n');
    await sendText(from, `No encontré ese modelo. Estos son los disponibles:\n${list}\n${cats.length + 1}. Ninguna\n\n${CUAL_DESEAS}`, session.businessFrom);
  }

  async function handleConfirmaCotizacion(from, session, text, t) {
    if (/(^|[^0-9])2([^0-9]|$)/.test(t) || /(modificar|modific|no,|no ).*(cotiza)|^no$/.test(t) || matchesNo(t)) {
      await sendText(from, MENU_AGREGADO, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
    if (matchesYes(t) || isEsoEsTodo(t) || /de acuerdo|deacuerdo/.test(t)) {
      if (!session.genero) {
        await sendText(from, PIDE_GENERO, session.businessFrom);
        session.state = STATES.GENERO;
        return;
      }
      await sendText(from, ENTREGA_MSG, session.businessFrom);
      session.state = STATES.ENTREGA;
      return;
    }
    await sendText(from, CONFIRMA_COTIZACION_MSG, session.businessFrom);
  }

  async function handleGenero(from, session, text, t) {
    if (/ni[ñn]a/.test(t) || /(^|[^0-9])1([^0-9]|$)/.test(t)) {
      session.genero = 'niña';
    } else if (/ni[ñn]o/.test(t) || /(^|[^0-9])2([^0-9]|$)/.test(t)) {
      session.genero = 'niño';
    } else {
      await sendText(from, PIDE_GENERO, session.businessFrom);
      return;
    }
    await sendText(from, ENTREGA_MSG, session.businessFrom);
    session.state = STATES.ENTREGA;
  }

  async function handleEntrega(from, session, text, t) {
    if (matchesYes(t)) {
      session.delivery = true;
      await sendText(from, PIDE_UBICACION, session.businessFrom);
      session.state = STATES.UBICACION;
      return;
    }
    if (matchesNo(t) || /retir|recog|retiro/.test(t)) {
      session.delivery = false;
      await sendText(from, PAYMENT_PICKUP, session.businessFrom);
      session.state = STATES.ESPERA_COMPROBANTE;
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
    await sendText(from, PIDE_NOMBRE_ENTREGA, session.businessFrom);
    session.state = STATES.NOMBRE_ENTREGA;
  }

  async function handleNombreEntrega(from, session, text, t) {
    if (text.length < 3) {
      await sendText(from, PIDE_NOMBRE_ENTREGA, session.businessFrom);
      return;
    }
    session.nombreEntrega = text;
    return sendFinalCotizacion(from, session);
  }

  async function handleConfirmaEntrega(from, session, text, t) {
    if (matchesYes(t) || /(confirmar|confirm|realizar|pedido)/.test(t)) {
      await sendText(from, PAYMENT_DELIVERY, session.businessFrom);
      session.state = STATES.ESPERA_COMPROBANTE;
      return;
    }
    if (matchesNo(t) || /(abandon|abandona|^2$)/.test(t)) {
      await sendText(from, DESPEDIDA_ABANDONO, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, CONFIRMA_ENTREGA_MSG, session.businessFrom);
  }

  async function handleEsperaComprobante(from, session, text, t) {
    await sendText(from, PIDE_COMPROBANTE_OTRA_VEZ, session.businessFrom);
  }

  function buildReceiptSystem(anticipo) {
  return `Eres un verificador de comprobantes de transferencia bancaria en Ecuador (USD). Revisa la imagen del comprobante que envía el cliente y responde JSON:
- "monto": número con el monto de la transferencia en USD que aparece en el comprobante.
- "titular": el nombre del titular de la cuenta que aparece en el comprobante.
- "ok": true solo si el monto es igual o mayor al anticipo esperado y el titular coincide con "Evelyn Lizeth Zambrano".
- "motivo": explicación breve en español del porqué no coincide (solo cuando ok es false).
Anticipo esperado (50% no reembolsable): ${formatPrice(anticipo)}. Titular esperado: Evelyn Lizeth Zambrano.`;
}

  async function handleComprobanteMedia(from, session, msg) {
    const total = [...session.seleccion.values()].reduce(
      (s, it) => s + (it.precio != null ? Number(it.precio) * (Number(it.qty) || 1) : 0),
      0
    );
    const anticipo = Math.round(total * 0.5 * 100) / 100;
    if (aiEnabled() && typeof ai.askGeminiReceipt === 'function' && msg && msg.data) {
      session.busy = true;
      try {
        const review = await ai.askGeminiReceipt(
          buildReceiptSystem(anticipo),
          msg.data.toString('base64'),
          msg.mimeType || 'image/jpeg'
        );
        if (review && typeof review.ok === 'boolean') {
          const monto = Number(review.monto);
          if (review.ok) {
            await sendText(from, COMPROBANTE_OK_IA(Number.isFinite(monto) && monto > 0 ? monto : anticipo), session.businessFrom);
            deactivate(from, session);
          } else {
            await sendText(from, COMPROBANTE_MAL_IA(String(review.motivo || 'el monto o el titular no coinciden con lo esperado').trim(), anticipo), session.businessFrom);
          }
          return;
        }
      } catch (err) {
        console.error('[utiles] error al revisar el comprobante con IA', err);
      } finally {
        session.busy = false;
      }
    }
    log(
      `[utiles] COMPROBANTE recibido de ${from} | total cotización: ${formatPrice(total)} | anticipo esperado (50% no reembolsable): ${formatPrice(anticipo)} | titular esperado: Evelyn Lizeth Zambrano | VERIFICAR MANUALMENTE`
    );
    await sendText(from, COMPROBANTE_MANUAL, session.businessFrom);
    session.state = STATES.ESPERA_CONFIRMACION_RECIBO;
  }

  async function handleEsperaConfirmacionRecibo(from, session, text, t) {
    if (isGracias(t)) {
      if (session.delivery) {
        await sendText(from, ENTREGA_MOTORIZADO, session.businessFrom);
        deactivate(from, session);
      } else {
        await sendText(from, RETIRO_LISTO, session.businessFrom);
        session.state = STATES.PICKUP_AGENDA;
      }
      return;
    }
    await sendText(from, 'Cuando confirmes tu comprobante, escríbeme "ok".', session.businessFrom);
  }

  async function handlePickupAgenda(from, session, text, t) {
    await sendText(from, RETIRO_DESPEDIDA, session.businessFrom);
    deactivate(from, session);
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
    if (/^para\b/.test(t)) {
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
      await sendCatalogoImage(from, session);
      await sendText(from, PIDE_NUMEROS, session.businessFrom);
      session.state = STATES.NUMEROS;
      return;
    }
    if (matchesNo(t)) {
      await sendText(from, DESPEDIDA, session.businessFrom);
      deactivate(from, session);
      return;
    }
    await sendText(from, PREGUNTA_DISPONIBLE_MSG, session.businessFrom);
  }

  function aiEnabled() {
    return ai && typeof ai.isAiEnabled === 'function' ? ai.isAiEnabled() : false;
  }

  function buildIaSystem(session) {
    const cart = [...session.seleccion.values()]
      .map((it) => `${it.qty} x ${it.nombre}${it.precio != null ? ` (${formatPrice(it.precio)})` : ''}`)
      .join('\n');
    const conFotos = products.filter((p) => findProductImage(p));
    const fotosLine = conFotos.length
      ? `El sistema puede enviar la foto de estos productos si el cliente la pide (número y nombre):\n${conFotos.map((p) => `${p.numero}. ${p.producto}`).join('\n')}`
      : 'Por ahora no hay fotos de productos en la tienda.';
    return `Eres el asistente virtual de una tienda de útiles escolares y limpieza en Ecuador (precios en dólares USD). Atiendes clientes por WhatsApp, siempre en español, de forma breve y amable.

CATÁLOGO COMPLETO con precios (producto | precio). Solo puedes ofrecer estos productos exactos; NUNCA inventes productos ni precios:
${ai.buildCatalogContext(products)}

PEDIDO ACTUAL del cliente:
${cart || '(vacío)'}

REGLAS DE VENTA:
- Para armar el pedido usa únicamente los nombres del catálogo. Pregunta cantidades cuando haga falta.
- Si el cliente pide algo que no está en el catálogo, respóndele que no está disponible y ofrécele el producto más parecido del catálogo.
- Averigua si la lista es para niña o para niño cuando sea relevante.
- Pregunta si desea entrega a domicilio. Si es a domicilio, pide dirección, día y hora, y a nombre de quién se entrega.
- Si el cliente quiere retirar, indica que el pedido estará listo el viernes y no hace falta dirección.
- Método de pago: 50% de anticipo no reembolsable por transferencia a nombre de "Evelyn Lizeth Zambrano" y el resto al momento de la entrega o retiro. No pidas el comprobante aquí; el sistema lo solicitará después.
- Si el cliente pide pagar todo el valor al retirar o al recibir el pedido (sin adelanto), explícale con amabilidad que por políticas de seguridad se solicita el pago del 50% para confirmar el pedido (no reembolsable) y el restante al momento de la entrega o retiro.
- Si menciona mochilas, cartucheras o loncheras, ofrécelas con su precio y, si el cliente quiere verlas, envíale sus fotos (ver regla FOTOS).
- Cuando el cliente confirme el pedido final y los datos de entrega estén completos, marca "pedido_finalizado" como true y en "reply" confirma el pedido.
- Si el cliente se despide, agradece o dice que no le interesa, marca "despedirse" como true.
- Si pide ver TODO lo que tienes disponible o el catálogo completo de la tienda (p.ej. "qué tienes", "catálogo completo", "envíame tu lista"), marca "enviar_catalogo" como true. NO lo marques cuando solo pregunta por una categoría (mochilas, cartucheras, loncheras) o por un producto: en ese caso responde solo con esa información o con las fotos correspondientes, sin enviar la lista completa.
- Si el cliente pide la cotización del pedido actual ("la cotización", "dame la cotización", "cuánto sería", "pásame la cotización") y ya hay productos en el pedido, marca "enviar_cotizacion" como true; en "reply" dile que le envías la cotización. Si el pedido está vacío, no lo marques y pide que agregue productos.
- LISTA DE ÚTILES: cuando el cliente envíe una lista de productos (por mensaje, foto o documento), identifica los productos, arma el carrito y marca "recibir_lista" como true. El sistema enviará automáticamente la cotización en imagen (columnas Cantidad | Producto | Precio). En "reply" confirma los productos encontrados y SIEMPRE pregunta si desea agregar algo más a la cotización, ofreciendo artículos complementarios de la tienda (por ejemplo: mochila, cartuchera, lonchera, cuadernos, lápices, colores, tijeras, gomas, etc.). Eres un vendedor proactivo: sugiere productos útiles para la lista que el cliente ya tiene.
- FOTOS: ${fotosLine} Cuando el cliente pida la foto de un producto (p.ej. "foto de la mochila", "muéstrame la mochila"), respóndele que se la envías y marca "enviar_foto" con el número de ese producto. Cuando pregunte qué mochilas, cartucheras o loncheras tienes (p.ej. "qué mochilas tienes", "otras mochilas", "muéstrame las cartucheras"), marca "enviar_foto" con los números de TODOS los productos con foto de esa categoría que aparecen en la lista anterior, para que el sistema le envíe todas esas imágenes. Si el producto no tiene foto, dile amablemente que no hay foto disponible de ese producto y ofrécele el precio y la descripción. Los modelos de mochilas, cartucheras y loncheras también pueden verse en el catálogo de WhatsApp: ${CATALOGO_URL}. NUNCA inventes fotos ni envíes imágenes que no estén en la lista.
- CUENTA DE TRANSFERENCIA: si el cliente pregunta a qué número de cuenta debe hacer la transferencia (número de cuenta, cuenta bancaria, a dónde transfiero), respóndele EXACTAMENTE: "En breve te indico el número de cuenta." No des ni inventes ningún número de cuenta; el asesor lo enviará después.
- NO TE REPITAS: si ya enviaste la cotización, el catálogo o una foto en este chat y el cliente no cambió su pedido, el sistema no los vuelve a enviar; tampoco repitas el mismo mensaje. Si el cliente insiste o repite la misma pregunta, responde distinto y pregúntale concretamente qué necesita. No vuelvas a ofrecer un producto que el cliente ya rechazó.

FORMATO DE RESPUESTA (JSON):
- "reply": mensaje de texto para el cliente (en español).
- "carrito": pedido COMPLETO y actualizado (nombres exactos del catálogo con su cantidad). Si el cliente no cambió nada, devuelve el pedido tal como está. Si el cliente escribió su lista, incluye en cada item el campo "linea" con el texto EXACTO que escribió el cliente para ese producto, para que la cotización refleje su lista original.
- "entrega": objeto con direccion, diaHora, nombre, genero ("niña"/"niño") y domicilio (true si entrega a domicilio, false si retiro), solo con los datos que ya haya aportado el cliente.
- "pedido_finalizado", "despedirse", "enviar_catalogo", "enviar_cotizacion", "recibir_lista": booleanos según las reglas.
- "enviar_foto": lista de números de productos cuya foto debe enviarse (puede tener varios números, por ejemplo todas las mochilas de una vez). Solo usa productos que aparecen en la lista de FOTOS.
`;
  }

  function applyIaCarrito(session, carrito) {
    if (!Array.isArray(carrito) || carrito.length === 0) return;
    const nuevo = new Map();
    for (const it of carrito) {
      const name = String(it?.producto || '').trim();
      const qty = Number(it?.cantidad) || 1;
      if (!name || qty <= 0) continue;
      const hit = findItems(name, products)[0];
      if (!hit) continue;
      const key = normalize(hit.producto);
      const linea = typeof it?.linea === 'string' && it.linea.trim() ? it.linea.trim() : hit.producto;
      const prev = nuevo.get(key);
      nuevo.set(key, {
        nombre: hit.producto,
        linea,
        desc: hit.descripcion || '',
        precio: hit.precio,
        qty: (prev ? prev.qty : 0) + qty,
      });
    }
    if (nuevo.size > 0) session.seleccion = nuevo;
  }

  function mergeIaEntrega(session, entrega) {
    if (!entrega || typeof entrega !== 'object') return;
    if (typeof entrega.direccion === 'string' && entrega.direccion.trim()) session.direccion = entrega.direccion.trim();
    if (typeof entrega.diaHora === 'string' && entrega.diaHora.trim()) session.diaHora = entrega.diaHora.trim();
    if (typeof entrega.nombre === 'string' && entrega.nombre.trim()) session.nombreEntrega = entrega.nombre.trim();
    if (typeof entrega.genero === 'string' && /ni[ñn]a/i.test(entrega.genero)) session.genero = 'niña';
    else if (typeof entrega.genero === 'string' && /ni[ñn]o/i.test(entrega.genero)) session.genero = 'niño';
    if (typeof entrega.domicilio === 'boolean') session.delivery = entrega.domicilio;
  }

  function seleccionRows(session) {
    const rows = [];
    for (const [, it] of session.seleccion) {
      rows.push({ nombre: it.linea || it.nombre, precio: it.precio, qty: it.qty });
    }
    return rows;
  }

  async function sendCotizacionIa(from, session) {
    const png = await buildPriceImage(seleccionRows(session));
    await sendImage(from, png, session.businessFrom);
  }

  async function sendFinalCotizacionIa(from, session) {
    const png = await buildPriceImage(seleccionRows(session), {
      entrega: {
        direccion: session.direccion,
        diaHora: session.diaHora,
        nombre: session.nombreEntrega,
        genero: session.genero,
      },
    });
    await sendImage(from, png, session.businessFrom);
  }

  function docMimeType(filename) {
    const n = normalize(filename || '');
    if (n.includes('.pdf')) return 'application/pdf';
    if (n.includes('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (n.includes('.xls')) return 'application/vnd.ms-excel';
    if (n.includes('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (n.includes('.doc')) return 'application/msword';
    if (n.includes('.txt')) return 'text/plain';
    return 'application/octet-stream';
  }

  async function handleIa(from, session, msg) {
    session.busy = true;
    try {
      let parts = [{ text: msg.text || '' }];
      if (msg.type === 'image' && msg.data) {
        parts = [{ inlineData: { mimeType: msg.mimeType || 'image/jpeg', data: msg.data.toString('base64') } }];
      } else if (msg.type === 'document') {
        let lines = null;
        try {
          lines = await parseFile(msg.data, msg.filename);
        } catch {
          lines = null;
        }
        const textDoc = lines && lines.length ? lines.join('\n') : null;
        if (textDoc) {
          parts = [{ text: `El cliente adjuntó un documento con esta lista de útiles:\n${textDoc}` }];
        } else if (msg.data) {
          parts = [{
            inlineData: {
              mimeType: msg.mimeType || docMimeType(msg.filename),
              data: msg.data.toString('base64'),
            },
          }];
        } else {
          parts = [{ text: '(El cliente adjuntó un documento que no se pudo leer)' }];
        }
      }
      session.iaHistory.push({ role: 'user', parts });
      if (session.iaHistory.length > 24) session.iaHistory = session.iaHistory.slice(-24);

      const result = await ai.askGemini(buildIaSystem(session), session.iaHistory);
      if (!result || typeof result.reply !== 'string' || !result.reply.trim()) {
        await sendText(from, AI_FALLBACK, session.businessFrom);
        return;
      }

      applyIaCarrito(session, result.carrito);
      mergeIaEntrega(session, result.entrega);
      const finalizing = result.pedido_finalizado && session.seleccion.size > 0;
      if (finalizing) {
        await sendFinalCotizacionIa(from, session);
      }
      session.iaHistory.push({ role: 'model', parts: [{ text: result.reply }] });

      await sendText(from, result.reply, session.businessFrom);
      if (!finalizing) {
        if (result.enviar_catalogo && !session.sent.catalogo) {
          await sendCatalogoImage(from, session);
          session.sent.catalogo = true;
        }
        if (Array.isArray(result.enviar_foto)) {
          for (const n of result.enviar_foto) {
            if (session.sent.fotos.has(n)) continue;
            await sendProductPhoto(from, session, n);
            session.sent.fotos.add(n);
          }
        }
        if ((result.enviar_cotizacion || result.recibir_lista) && session.seleccion.size > 0) {
          const sig = cartSig(session);
          if (sig !== session.sent.quoteSig) {
            await sendCotizacionIa(from, session);
            session.sent.quoteSig = sig;
          }
        }
      }
      if (finalizing) {
        session.state = STATES.ESPERA_COMPROBANTE;
        return;
      }
      if (result.despedirse) {
        await sendText(from, DESPEDIDA, session.businessFrom);
        deactivate(from, session);
        return;
      }
      session.state = STATES.IA_CHAT;
    } finally {
      session.busy = false;
    }
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
      if (aiEnabled() && (session.state === STATES.IA_CHAT || session.state === STATES.SALUDO)) {
        session.state = STATES.IA_CHAT;
        return handleIa(from, session, msg);
      }
      if (session.state === STATES.ESPERA_COMPROBANTE) {
        return handleComprobanteMedia(from, session, msg);
      }
      if (session.state === STATES.ASESOR) {
        await sendText(from, FOTO_NO_OCR, session.businessFrom);
        return;
      }
      await sendText(from, FOTO_NO_OCR, session.businessFrom);
      return;
    }

    if (msg.type === 'document') {
      if (aiEnabled() && (session.state === STATES.IA_CHAT || session.state === STATES.SALUDO)) {
        session.state = STATES.IA_CHAT;
        return handleIa(from, session, msg);
      }
      if (session.state === STATES.ESPERA_COMPROBANTE) {
        return handleComprobanteMedia(from, session, msg);
      }
      if (session.state === STATES.ASESOR) {
        await sendText(from, ASESOR_DESPEDIDA, session.businessFrom);
        deactivate(from, session);
        return;
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

    if (aiEnabled() && session.state === STATES.IA_CHAT) {
      return handleIa(from, session, { type: 'text', text });
    }

    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && isCatalogRequest(t)) {
      await sendCatalogoImage(from, session);
      await sendText(from, PIDE_NUMEROS, session.businessFrom);
      session.state = STATES.NUMEROS;
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && isQuoteRequest(t)) {
      if (session.seleccion.size === 0) {
        await sendText(from, PIDE_LISTA, session.businessFrom);
        session.state = STATES.ESPERA_LISTA;
      } else {
        await sendPreliminaryCotizacion(from, session);
      }
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && isPayAllOnPickup(t)) {
      await sendText(from, PAYMENT_TODO_RETIRO, session.businessFrom);
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && isPaymentRequest(t)) {
      await sendText(from, PAYMENT_REPLY, session.businessFrom);
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && isPhotoRequest(t)) {
      await sendText(from, FOTOS_REPLY, session.businessFrom);
      return;
    }

    switch (session.state) {
      case STATES.ESPERA_LISTA:
        return handleEsperaLista(from, session, text, t);
      case STATES.ASESOR:
        return handleAsesor(from, session, text, t);
      case STATES.NUMEROS:
        return handleNumeros(from, session, text, t);
      case STATES.SELECCION:
        return handleSeleccion(from, session, text, t);
      case STATES.UNICO:
        return handleUnico(from, session, text, t);
      case STATES.CANTIDAD:
        return handleCantidad(from, session, text, t);
      case STATES.AGREGADO:
        return handleAgregado(from, session, text, t);
      case STATES.ELIMINAR:
        return handleEliminar(from, session, text, t);
      case STATES.SUGERENCIA:
        return handleSugerencia(from, session, text, t);
      case STATES.CONFIRMA_SUGERENCIA:
        return handleConfirmaSugerencia(from, session, text, t);
      case STATES.MODELO_MOCHILA:
        return handleModeloMochila(from, session, text, t);
      case STATES.CONFIRMA_COTIZACION:
        return handleConfirmaCotizacion(from, session, text, t);
      case STATES.GENERO:
        return handleGenero(from, session, text, t);
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
      case STATES.NOMBRE_ENTREGA:
        return handleNombreEntrega(from, session, text, t);
      case STATES.CONFIRMA_ENTREGA:
        return handleConfirmaEntrega(from, session, text, t);
      case STATES.ESPERA_COMPROBANTE:
        return handleEsperaComprobante(from, session, text, t);
      case STATES.ESPERA_CONFIRMACION_RECIBO:
        return handleEsperaConfirmacionRecibo(from, session, text, t);
      case STATES.PICKUP_AGENDA:
        return handlePickupAgenda(from, session, text, t);
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