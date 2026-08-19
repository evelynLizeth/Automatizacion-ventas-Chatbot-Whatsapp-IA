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
  IA_CONFIRMA_PEDIDO: 'IA_CONFIRMA_PEDIDO',
  CHATBOT: 'CHATBOT',
  CHATBOT_CONFIRMA: 'CHATBOT_CONFIRMA',
  CHATBOT_EDITAR: 'CHATBOT_EDITAR',
  RESOLVER_LISTA: 'RESOLVER_LISTA',
  DESACTIVADO: 'DESACTIVADO',
};

const MIN_5 = 5 * 60 * 1000;
const MIN_9 = 9 * 60 * 1000;

const CATALOGO_URL = 'https://wa.me/c/593987695938';
const DOMICILIO_RECARGO = Number(process.env.DOMICILIO_RECARGO) || 3;
const IA_CONFIRMA_PEDIDO_MSG = '¿Confirmas tu pedido?';

const SALUDO_REPLY =
  '¡Hola! Soy el asistente virtual.\n¿Qué deseas hacer?\n1. Realizar una cotización de útiles escolares con asistencia de IA.\n2. Comunicarme con Evelyn.\n3. Solicitar un Chatbot Inteligente para mi negocio.';
const PIDE_LISTA =
  'Perfecto. Envíame tu lista de útiles: puedes escribirla en el chat o adjuntarla en PDF o Excel. Si son varios productos, escríbelos uno por línea. También puedes ver los productos disponibles.';
const PIDE_NUMEROS =
  'Escríbeme los números de los artículos que deseas, separados por coma (ejemplo: 1,5,12).';
const NUMEROS_INVALID =
  'No entendí los números. Escríbelos separados por coma, por ejemplo: 1,5,12.';
const DESPEDIDA = '¡Perfecto! Hasta luego. Si me necesitas, aquí estaré.';
const SALUDO_NO_REPLY = 'Ok, de aquí en adelante Evelyn chateará contigo.';
const NO_ENCONTRADO =
  'No encontré ningún producto con ese nombre. Prueba con otro nombre o deseas ver los productos disponibles?.';
const NONE_FOUND_LIST =
  'No encontré ninguno de los productos de tu lista. Verifica los nombres y envíame la lista de nuevo.';
const PROCESANDO_LISTA =
  'Perfecto, recibí tu documento. Espera un momento, estoy armando tu cotización...';
const PROCESANDO_LISTA_IA =
  'He recibido tu lista de útiles y ya te estoy preparando la cotización inicial con los productos que tenemos disponibles. Espera un momento por favor';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iaImageReplyDelay = () => Number(process.env.IA_IMAGEN_REPLY_DELAY_MS) || 2000;
const CONFIRMA_ARCHIVO_MSG = 'Recibí tu archivo. ¿Genero la cotización con esa lista?';
const PREGUNTA_PRODUCTO_MSG = '¿Deseas preguntar por un producto específico?';
const PREGUNTA_DISPONIBLE_MSG = '¿Deseas ver lo que tengo disponible?';
const PIDE_PRODUCTO = 'Perfecto. Dime qué producto deseas consultar.';
const ARCHIVO_NO_RECIBIDO =
  'Entiendo. No recibí tu archivo o no pude procesarlo. Por favor adjúntalo de nuevo en PDF o Excel, o escríbeme la lista por mensaje (un producto por línea).';
export const ESPERA_GENERANDO =
  'Estoy generando tu cotización, un momento. ¿Prefieres esperar a que termine, o escribes "completar el pedido" para detener la cotización y ajustar tu pedido?';
const PIDES_CANTIDAD = '¿Cuántas unidades deseas? (ejemplo: 2)';
const QTY_INVALID = 'No entendí la cantidad. Por favor dime cuántas unidades deseas (ejemplo: 3).';
const MENU_AGREGADO =
  '¿Deseas agregar algo más a tu cotización, eliminar algún producto, o ver tu cotización final?';
const CUAL_DESEAS = '¿Cuál deseas? Responde con el número o el nombre del producto.';
const PICK_INVALID = 'No entendí tu respuesta. ' + CUAL_DESEAS;
const NO_DISPONIBLE_MSG = (nombre) => `No disponemos de "${nombre}" en este momento.`;
const NO_INCLUYO_MSG = (nombre) => `Entendido, no incluiré "${nombre}" en tu cotización.`;
const AGREGADO_LISTA_MSG = (producto) => `¡Listo! Agregué ${producto} a tu cotización.`;
const PIDE_AGREGAR = 'Perfecto. ¿Qué producto deseas agregar?';
const PIDE_ELIMINAR = '¿Cuál deseas eliminar? Responde con el número o el nombre del producto.';
const CONFIRMA_COTIZACION_MSG =
  '¿Estás de acuerdo con la cotización? Si deseas ajustar algo, dime qué producto agregar o quitar.';
const PIDE_GENERO = '¿Tu lista de útiles es para niña, niño, adolescente, hombre o mujer? Dime cuál.';
const ENTREGA_MSG = '¿Prefieres entrega a domicilio o ir a retirar tu pedido?';
const PIDE_UBICACION = 'Envíame la dirección donde quieres recibir tu pedido.';
const PIDE_DIA_HORA = '¿Qué día y a qué hora deseas que te entreguemos?';
const PIDE_NOMBRE_ENTREGA = '¿A nombre de quién realizamos la entrega?';
const CONFIRMA_ENTREGA_MSG =
  'Esta es tu cotización con los datos de entrega.\n¿Confirmas tu pedido o prefieres no continuar?';
const PAYMENT_REPLY = (anticipo) =>
  anticipo != null
    ? `El pago se realiza por transferencia: el anticipo del 50% (${formatPrice(anticipo)}) para confirmar tu pedido (no reembolsable) y el resto al momento de la entrega.`
    : 'El pago se realiza por transferencia: la mitad para confirmar tu pedido (no reembolsable) y el resto al momento de la entrega.';
const PAYMENT_TODO_RETIRO = (anticipo) =>
  anticipo != null
    ? `¡Claro que sí! Por políticas de seguridad, para confirmar tu pedido solicitamos el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) por transferencia a nombre de Evelyn Lizeth Zambrano y el restante al momento de la entrega o retiro. Así aseguramos tu reserva. ¿Te parece bien?`
    : '¡Claro que sí! Por políticas de seguridad, para confirmar tu pedido solicitamos el anticipo del 50% (no reembolsable) por transferencia a nombre de Evelyn Lizeth Zambrano y el restante al momento de la entrega o retiro. Así aseguramos tu reserva. ¿Te parece bien?';
const PAYMENT_PICKUP = (anticipo) =>
  `Para confirmar tu pedido, te agradezco que me envíes el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) a nombre de Evelyn Lizeth Zambrano y el resto al retirarlo. Envíame una foto de tu comprobante.`;
const PAYMENT_DELIVERY = (anticipo) =>
  `Para confirmar tu pedido, te agradezco que me envíes el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) a nombre de Evelyn Lizeth Zambrano y el resto al momento de la entrega. Envíame una foto de tu comprobante.`;
const PAYMENT_IA = (anticipo) =>
  `Para confirmar tu pedido, transfiere el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) a nombre de Evelyn Lizeth Zambrano y el resto al momento de la entrega o retiro. Envíame una foto de tu comprobante.`;
const COMPROBANTE_MANUAL = (anticipo) =>
  `Recibimos tu comprobante, gracias. Verificaremos que el anticipo del 50% (${formatPrice(anticipo)}) (no reembolsable) se realizó a nombre de Evelyn Lizeth Zambrano con fecha de hoy y te confirmaremos tu pedido en breve.`;
const COMPROBANTE_OK_IA = (monto) =>
  `¡Gracias! Verificamos tu comprobante por ${formatPrice(monto)} a nombre de Evelyn Lizeth Zambrano. Tu pedido quedó confirmado. ¡Muchas gracias por tu compra!`;
const COMPROBANTE_MAL_IA = (motivo, anticipo) =>
  `Revisamos tu comprobante y encontramos un detalle: ${motivo}. Recuerda que el anticipo debe ser ${formatPrice(anticipo)} (50% del total) a nombre de Evelyn Lizeth Zambrano. Verifica y reenvía tu comprobante.`;
const COMPROBANTE_MAL_VARIANTS = [
  (motivo, anticipo) =>
    `Con gusto revisamos tu imagen y encontramos un detalle: ${motivo}. El anticipo esperado es ${formatPrice(anticipo)} (50% del total) a nombre de Evelyn Lizeth Zambrano. Por favor verifica y reenvía el comprobante, estaré pendiente.`,
  (motivo, anticipo) =>
    `Gracias por tu paciencia. Aún hay un detalle: ${motivo}. Asegúrate de que el monto sea ${formatPrice(anticipo)} y que la cuenta figure a nombre de Evelyn Lizeth Zambrano, y envíame nuevamente la captura.`,
  (motivo) =>
    `No te preocupes, tranquilo(a). Todavía no logramos verificar el comprobante: ${motivo}. Si te resulta difícil, puedo conectar a un asesor para ayudarte a completar tu pedido sin problema. ¿Prefieres eso?`,
];
const COMPROBANTE_MISMA_IMAGEN =
  'Recibimos la misma imagen del comprobante anterior. Si los datos son correctos y el pago ya está hecho, escríbeme "ok" y la damos por confirmada; si prefieres, reenvía una nueva captura y con gusto la reviso.';
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
const SUGERENCIA_MSG =
  'Tal vez te interesen mochilas, cartucheras o loncheras. Si gustas, te muestro fotos de los modelos; o si prefieres, te presento tu cotización de los productos que agregaste.';
const CONFIRMA_SUGERENCIA_MSG =
  '¿Te gustaría agregar alguno de estos modelos a tu pedido? Dime cuál y te lo agrego.';
const MODELO_MSG = '¿Qué color o modelo deseas? Responde con el nombre o el número del producto.';
const FOTOS_REPLY = `Las fotos disponibles están en nuestro catálogo: ${CATALOGO_URL} (mochilas, cartucheras y loncheras). Para el resto de productos puedo darte precio y descripción.`;
const FOTO_NO_OCR = 'No puedo leer fotos. Por favor escribe tu lista de útiles por mensaje o adjúntala en PDF o Excel.';
const FILE_UNREADABLE = 'No pude leer el archivo. Envíalo en PDF o Excel, o escríbeme la lista por mensaje.';
const TIMEOUT_1 = '¿Sigues ahí? Si deseas continuar con tu cotización, solo escríbeme.';
const TIMEOUT_2 = 'El chat se cerrará por falta de respuesta.';
const AI_FALLBACK =
  'Disculpa, no pude procesar tu mensaje. Inténtalo de nuevo o escríbeme los productos que deseas (uno por línea).';
const AI_INTRO =
  '¡Perfecto! Ya puedes escribirme tu lista de útiles, adjuntarla en PDF o Excel, preguntarme por un producto o pedirme el catálogo. ¿Qué deseas hacer?';

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
const CHATBOT_SOLO_TEXTO =
  'Gracias. Por ahora solo necesito tus respuestas por texto para completar los requerimientos. Sigue con la pregunta actual.';

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

function isChatbotRequest(t) {
  return /(chatbot|bot inteligente|asistente para mi negocio)/.test(t);
}

function isQuoteRequest(t) {
  return /cotiza/.test(t);
}

function isTalkToEvelyn(t) {
  return /(comunic|habl|contact|convers|chate|atend|atiend|conect)[\s\S]{0,40}evelyn|evelyn[\s\S]{0,40}(comunic|habl|contact|convers|chate|atend|atiend|conect|necesito|necesita|por favor)/.test(t);
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

export function mergeListaRows(baseRows, currentRows) {
  const core = (s) => normalize(s).replace(/^\d{1,3}\s*/, '').trim();
  const used = new Set();
  const rows = [];
  for (const b of baseRows) {
    const bKey = normalize(b.nombre || b.linea);
    const bLinea = normalize(b.linea || b.nombre);
    const bCore = core(b.linea || b.nombre);
    const cur = currentRows.find(
      (c) =>
        !used.has(c) &&
        (normalize(c.nombre || c.linea) === bKey ||
          normalize(c.linea || c.nombre) === bLinea ||
          (bCore && core(c.linea || c.nombre) === bCore))
    );
    if (cur) {
      used.add(cur);
      rows.push({
        linea: b.linea || b.nombre,
        nombre: cur.catalogo || cur.nombre,
        precio: cur.precio,
        qty: cur.qty,
      });
    } else {
      rows.push({
        linea: b.linea || b.nombre,
        nombre: b.catalogo || b.nombre,
        precio: b.precio,
        qty: b.qty,
      });
    }
  }
  for (const c of currentRows) {
    if (!used.has(c)) {
      rows.push({ linea: c.linea || c.nombre, nombre: c.catalogo || c.nombre, precio: c.precio, qty: c.qty });
    }
  }
  return rows;
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
      iaHistory: [],
      sent: { catalogo: false, fotos: new Set(), quoteSig: null, finalSig: null },
      receiptAttempts: 0,
      lastReceiptSig: null,
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
    const ventaConcluida = () =>
      session.state === STATES.ESPERA_CONFIRMACION_RECIBO ||
      session.state === STATES.PICKUP_AGENDA;
    let paso = 0;
    const schedule = (delay) => {
      session.timer = setTimeout(async () => {
        if (session.state === STATES.DESACTIVADO) return;
        if (ventaConcluida()) {
          sessions.delete(from);
          log(`[utiles] sesión cerrada sin avisos (venta concluida) ${from}`);
          return;
        }
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

  function finalSig(session) {
    return `${cartSig(session)}|dir:${session.direccion || ''}|dia:${session.diaHora || ''}|nom:${session.nombreEntrega || ''}|gen:${session.genero || ''}|dom:${session.delivery ?? ''}`;
  }

  function addToSeleccion(session, product, qty = 1) {
    const key = normalize(product.producto);
    const prev = session.seleccion.get(key);
    const linea = typeof product.linea === 'string' && product.linea.trim() ? product.linea.trim() : product.producto;
    const catalogo = typeof product.catalogo === 'string' && product.catalogo.trim() ? product.catalogo.trim() : product.producto;
    session.seleccion.set(key, {
      nombre: product.producto,
      linea,
      catalogo,
      desc: product.descripcion || '',
      precio: product.precio,
      qty: (prev ? prev.qty : 0) + qty,
    });
  }

  function addNoDisponible(session, linea, qty = 1) {
    const text = String(linea).trim() || 'producto no disponible';
    const key = normalize(`no disponible|${text}`);
    const prev = session.seleccion.get(key);
    session.seleccion.set(key, {
      nombre: 'no disponible',
      linea: text,
      catalogo: 'no disponible',
      desc: '',
      precio: null,
      qty: (prev ? prev.qty : 0) + qty,
    });
  }

  function lineQty(line) {
    const m = String(line).trim().match(/^(\d{1,3})\s+/);
    const n = m ? Number(m[1]) : 1;
    return Number.isInteger(n) && n >= 1 ? n : 1;
  }

  function seedSeleccionFromItems(items) {
    const seeded = new Map();
    const usedKeys = new Map();
    for (const it of items) {
      const qty = lineQty(it.nombre);
      const pref = it.precio == null ? 'no disponible' : 'prod';
      const base = normalize(`${pref}|${it.nombre}`);
      const n = usedKeys.get(base) || 0;
      const key = n === 0 ? base : `${base}#${n + 1}`;
      usedKeys.set(base, n + 1);
      if (it.precio == null) {
        seeded.set(key, {
          nombre: 'no disponible',
          linea: it.nombre,
          catalogo: 'no disponible',
          desc: '',
          precio: null,
          qty,
        });
      } else {
        seeded.set(key, {
          nombre: it.producto,
          linea: it.nombre,
          catalogo: it.producto,
          desc: it.descripcion || '',
          precio: it.precio,
          qty,
        });
      }
    }
    return seeded;
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

  async function handleList(from, session, lines) {
    const { headers, items } = matchListLines(lines, products);
    if (items.length === 0) {
      await sendText(from, NONE_FOUND_LIST, session.businessFrom);
      return;
    }
    session.headers = headers;
    session.listaMode = true;
    session.listSteps = buildListSteps(headers, items, products, aiEnabled());
    session.pendingProduct = null;
    session.pendingList = null;
    session.lastOptions = [];
    session.pendingProposal = null;
    session.state = STATES.RESOLVER_LISTA;
    return processListStep(from, session);
  }

  function resolveProposal(result) {
    if (!result || result.disponible !== true) return null;
    const n = Number(result.propuesto);
    const product = products.find((x) => x.numero === n);
    if (!product) return null;
    return { product, motivo: String(result.motivo || '').trim() };
  }

  async function processListStep(from, session) {
    const step = session.listSteps[0];
    if (!step) {
      session.listSteps = [];
      session.lastOptions = [];
      session.state = STATES.AGREGADO;
      await sendText(from, MENU_AGREGADO, session.businessFrom);
      return;
    }
    if (step.type === 'add') {
      session.listSteps.shift();
      const it = step.item;
      addToSeleccion(session, { producto: it.nombre, linea: it.nombre, catalogo: it.producto, descripcion: it.descripcion, precio: it.precio }, 1);
      return processListStep(from, session);
    }
    if (step.type === 'unavailable') {
      session.listSteps.shift();
      addNoDisponible(session, step.nombre, 1);
      await sendText(from, NO_DISPONIBLE_MSG(step.nombre), session.businessFrom);
      return processListStep(from, session);
    }
    if (step.type === 'select') {
      session.lastOptions = step.options;
      const n = step.options.length;
      const list = step.options
        .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
        .join('\n');
      await sendText(from, `Para "${step.nombre}" encontré varias opciones:\n${list}\n${n + 1}. Ninguna de estas\n\n${CUAL_DESEAS}`, session.businessFrom);
      return;
    }
    if (step.type === 'similar') {
      let result = null;
      let aiResponded = false;
      if (aiEnabled() && typeof ai.askGeminiSimilar === 'function') {
        session.busy = true;
        try {
          result = await ai.askGeminiSimilar(step.nombre, products);
          aiResponded = result != null;
        } catch (err) {
          console.error('[utiles] error al buscar producto similar con IA', err);
        } finally {
          session.busy = false;
        }
      }
      const proposal = resolveProposal(result);
      if (proposal) {
        session.pendingProposal = { nombre: step.nombre, product: proposal.product };
        const p = proposal.product;
        const line = `No tengo exactamente "${step.nombre}". ¿Te sirve ${p.producto}${p.precio != null ? ` (${formatPrice(p.precio)})` : ''}?${proposal.motivo ? `\n${proposal.motivo}` : ''}`;
        await sendText(from, line, session.businessFrom);
        return;
      }
      if (aiResponded) {
        session.listSteps.shift();
        await sendText(from, NO_DISPONIBLE_MSG(step.nombre), session.businessFrom);
        return processListStep(from, session);
      }
      const hits = findItems(step.nombre, products);
      if (hits.length > 0) {
        session.listSteps[0] = { type: 'select', nombre: step.nombre, options: hits };
        return processListStep(from, session);
      }
      session.listSteps.shift();
      await sendText(from, NO_DISPONIBLE_MSG(step.nombre), session.businessFrom);
      return processListStep(from, session);
    }
    session.listSteps.shift();
    return processListStep(from, session);
  }

  async function handleResolverLista(from, session, text, t) {
    const step = session.listSteps[0];
    if (!step) {
      session.state = STATES.AGREGADO;
      await sendText(from, MENU_AGREGADO, session.businessFrom);
      return;
    }
    if (session.pendingProposal) {
      const { nombre, product } = session.pendingProposal;
      session.pendingProposal = null;
      session.listSteps.shift();
      if (matchesYes(t)) {
        addToSeleccion(session, { producto: nombre, linea: nombre, catalogo: product.producto, descripcion: product.descripcion, precio: product.precio }, 1);
        await sendText(from, AGREGADO_LISTA_MSG(product.producto), session.businessFrom);
      } else {
        await sendText(from, NO_DISPONIBLE_MSG(nombre), session.businessFrom);
      }
      return processListStep(from, session);
    }
    if (step.type === 'select') {
      const opts = session.lastOptions || [];
      let chosen = null;
      const m = t.match(/^\s*(\d+)\s*$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n === opts.length + 1 || /ninguna/.test(t)) {
          session.listSteps.shift();
          session.lastOptions = [];
          await sendText(from, NO_INCLUYO_MSG(step.nombre), session.businessFrom);
          return processListStep(from, session);
        }
        chosen = opts[n - 1] || null;
      } else {
        if (/ninguna|ninguno|ningun/.test(t)) {
          session.listSteps.shift();
          session.lastOptions = [];
          await sendText(from, NO_INCLUYO_MSG(step.nombre), session.businessFrom);
          return processListStep(from, session);
        }
        const hits = findItems(text, opts);
        chosen = hits[0] || null;
      }
      if (!chosen) {
        await sendText(from, PICK_INVALID, session.businessFrom);
        return;
      }
      session.listSteps.shift();
      session.lastOptions = [];
      addToSeleccion(session, { producto: step.nombre, linea: step.nombre, catalogo: chosen.producto, descripcion: chosen.descripcion, precio: chosen.precio }, 1);
      await sendText(from, AGREGADO_LISTA_MSG(chosen.producto), session.businessFrom);
      return processListStep(from, session);
    }
    session.listSteps.shift();
    return processListStep(from, session);
  }

  async function buildSeleccionImage(from, session, opts) {
    const png = await buildPriceImage(seleccionRows(session), {
      ...opts,
      lista: session.listaMode,
      headers: session.headers || [],
    });
    await sendImage(from, png, session.businessFrom);
  }

  async function sendPreliminaryCotizacion(from, session) {
    await buildSeleccionImage(from, session);
    await sleep(iaImageReplyDelay());
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
      recargo: session.delivery ? DOMICILIO_RECARGO : 0,
    });
    await sleep(iaImageReplyDelay());
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
      if (aiEnabled() && typeof ai.askGeminiSimilar === 'function') {
        session.listSteps = [{ type: 'similar', nombre: text }];
        session.pendingProduct = null;
        session.pendingList = null;
        session.lastOptions = [];
        session.pendingProposal = null;
        session.state = STATES.RESOLVER_LISTA;
        return processListStep(from, session);
      }
      await sendText(from, NO_ENCONTRADO, session.businessFrom);
      return;
    }
    if (hits.length === 1) {
      session.lastOptions = [hits[0]];
      session.state = STATES.UNICO;
      const p = hits[0];
      const price = p.precio != null ? formatPrice(p.precio) : 'No disponible';
      await sendText(from, `Encontré esta única opción:\n${p.producto} - ${price}\n¿Deseas que lo agregue a tu cotización?`, session.businessFrom);
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
        return goToEvelyn(from, session);
      }
      if (/^3$/.test(t)) {
        return startChatbot(from, session);
      }
      if (/asesor/.test(t)) {
        await sendText(from, ASESOR_MSG, session.businessFrom);
        session.state = STATES.ASESOR;
        return;
      }
      if (matchesYes(t)) {
        await ensureProducts();
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
      return startChatbot(from, session);
    }
    if (matchesYes(t)) {
      await ensureProducts();
      await sendText(from, PIDE_LISTA, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    if (matchesNo(t)) {
      return goToEvelyn(from, session);
    }
    await ensureProducts();
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

  function isChatbotState(state) {
    return state === STATES.CHATBOT || state === STATES.CHATBOT_CONFIRMA || state === STATES.CHATBOT_EDITAR;
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

  async function handleNumeros(from, session, text, t) {
    await ensureProducts();
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
    await sendText(from, `¡Listo! Agregué ${line} a tu cotización.\n\n${MENU_AGREGADO}`, session.businessFrom);
  }

  async function handleAgregado(from, session, text, t) {
    await ensureProducts();
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
      if (lines.length) return handleList(from, session, lines);
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
      await sendText(from, `Listo, eliminé ${it.nombre}. Tu pedido quedó vacío.\n\n${PIDE_LISTA}`, session.businessFrom);
      session.state = STATES.ESPERA_LISTA;
      return;
    }
    await sendText(from, `Listo, eliminé ${it.nombre} de tu cotización.\n\n${MENU_AGREGADO}`, session.businessFrom);
    session.state = STATES.AGREGADO;
  }

  async function handleSugerencia(from, session, text, t) {
    if (matchesYes(t) || /(mochil|cartucher|loncher|foto|fotos|modelo|muestra|verlas|verlos)/.test(t)) {
      const cats = getAccesorioProducts();
      const list = cats
        .map((p, i) => `${i + 1}. ${p.producto}${p.precio != null ? ' - ' + formatPrice(p.precio) : ''}`)
        .join('\n');
      await sendText(from, `Encontré estos productos:\n${list}\n\n${CONFIRMA_SUGERENCIA_MSG}`, session.businessFrom);
      session.state = STATES.CONFIRMA_SUGERENCIA;
      return;
    }
    if (matchesNo(t) || isEsoEsTodo(t) || /(cotiza|final)/.test(t)) {
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
    return handleModeloMochila(from, session, text, t);
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
      await sendText(from, `¡Listo! Agregué ${p.producto} a tu cotización.\n\n${MENU_AGREGADO}`, session.businessFrom);
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
    await sendText(from, MENU_AGREGADO, session.businessFrom);
    session.state = STATES.AGREGADO;
  }

  async function handleGenero(from, session, text, t) {
    const g = /ni[ñn]a/.test(t) || /(^|[^0-9])1([^0-9]|$)/.test(t)
      ? 'niña'
      : /ni[ñn]o/.test(t) || /(^|[^0-9])2([^0-9]|$)/.test(t)
        ? 'niño'
        : /adolescent/.test(t) && /hombre/.test(t)
          ? 'adolescente hombre'
          : /adolescent/.test(t) && /mujer/.test(t)
            ? 'adolescente mujer'
            : /adolescent/.test(t)
              ? 'adolescente'
              : /\bhombre\b/.test(t)
                ? 'hombre'
                : /\bmujer\b/.test(t)
                  ? 'mujer'
                  : /\badulto\b/.test(t)
                    ? 'adulto'
                    : null;
    if (!g) {
      await sendText(from, PIDE_GENERO, session.businessFrom);
      return;
    }
    session.genero = g;
    await sendText(from, ENTREGA_MSG, session.businessFrom);
    session.state = STATES.ENTREGA;
  }

  async function handleEntrega(from, session, text, t) {
    if (matchesYes(t) || /(domicili|enviar|env[íi]o|delivery|recibir en casa)/.test(t)) {
      session.delivery = true;
      await sendText(from, PIDE_UBICACION, session.businessFrom);
      session.state = STATES.UBICACION;
      return;
    }
    if (matchesNo(t) || /retir|recog|retiro/.test(t)) {
      session.delivery = false;
      await sendText(from, PAYMENT_PICKUP(anticipoDe(session)), session.businessFrom);
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
      await sendText(from, PAYMENT_DELIVERY(anticipoDe(session)), session.businessFrom);
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

  function seleccionTotal(session) {
    const subtotal = [...session.seleccion.values()].reduce(
      (s, it) => s + (it.precio != null ? Number(it.precio) * (Number(it.qty) || 1) : 0),
      0
    );
    return session.delivery ? subtotal + DOMICILIO_RECARGO : subtotal;
  }

  function anticipoDe(session) {
    const total = seleccionTotal(session);
    if (total <= 0) return null;
    return Math.round(total * 0.5 * 100) / 100;
  }

  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function parseFecha(str) {
    if (!str) return null;
    const s = String(str).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  function buildReceiptSystem(anticipo, hoy) {
  return `Eres un verificador de comprobantes de transferencia bancaria en Ecuador (USD). Revisa la imagen que envía el cliente y responde JSON:
- "es_comprobante": true solo si la imagen es realmente un comprobante de transferencia (captura de la app del banco o voucher con monto, titular y fecha). Si es otra cosa (selfie, foto de un producto, meme, etc.), pon false.
- "monto": número con el monto de la transferencia en USD que aparece en el comprobante (0 si no es comprobante).
- "titular": el nombre del titular de la cuenta que aparece en el comprobante.
- "fecha": la fecha de la transferencia que aparece en el comprobante, en formato DD/MM/AAAA (si no se distingue, pon "").
- "ok": true solo si es_comprobante es true, el monto es igual o mayor al anticipo esperado, el titular coincide con "Evelyn Lizeth Zambrano" y la fecha del comprobante es exactamente hoy (${hoy}).
- "motivo": explicación breve y amable en español del porqué no está correcto (solo cuando ok es false). Sé claro y útil para que el cliente sepa qué corregir.
Anticipo esperado (50% no reembolsable): ${formatPrice(anticipo)}. Titular esperado: Evelyn Lizeth Zambrano. Fecha de hoy: ${hoy}.`;
}

  async function handleComprobanteMedia(from, session, msg) {
    if (msg && msg.data) {
      const sig = msg.data.toString('base64');
      if (session.lastReceiptSig === sig) {
        await sendText(from, COMPROBANTE_MISMA_IMAGEN, session.businessFrom);
        return;
      }
      session.lastReceiptSig = sig;
    }
    const total = seleccionTotal(session);
    const anticipo = Math.round(total * 0.5 * 100) / 100;
    const hoy = todayStr();
    if (aiEnabled() && typeof ai.askGeminiReceipt === 'function' && msg && msg.data) {
      session.busy = true;
      try {
        const review = await ai.askGeminiReceipt(
          buildReceiptSystem(anticipo, hoy),
          msg.data.toString('base64'),
          msg.mimeType || 'image/jpeg'
        );
        if (review && typeof review.ok === 'boolean') {
          const monto = Number(review.monto);
          const fecha = String(review.fecha || '').trim();
          const fechaOk = parseFecha(fecha) === hoy;
          let motivo = '';
          if (review.ok && !fechaOk) {
            review.ok = false;
            motivo = fecha
              ? `la fecha del comprobante es ${fecha} y debe ser la de hoy (${hoy})`
              : 'no pude leer la fecha del comprobante, debe ser la de hoy';
          }
          if (review.ok) {
            await sendText(from, COMPROBANTE_OK_IA(Number.isFinite(monto) && monto > 0 ? monto : anticipo), session.businessFrom);
            deactivate(from, session);
          } else {
            session.receiptAttempts = (session.receiptAttempts || 0) + 1;
            const motivoFinal =
              review.es_comprobante === false
                ? String(review.motivo || 'la imagen no parece ser un comprobante de pago').trim()
                : motivo || String(review.motivo || 'el monto, el titular o la fecha no coinciden con lo esperado').trim();
            const variant = COMPROBANTE_MAL_VARIANTS[Math.min(session.receiptAttempts - 1, COMPROBANTE_MAL_VARIANTS.length - 1)];
            await sendText(from, variant(motivoFinal, anticipo), session.businessFrom);
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
      `[utiles] COMPROBANTE recibido de ${from} | total cotización: ${formatPrice(total)} | anticipo esperado (50% no reembolsable): ${formatPrice(anticipo)} | titular esperado: Evelyn Lizeth Zambrano | fecha esperada: ${hoy} | VERIFICAR MANUALMENTE`
    );
    await sendText(from, COMPROBANTE_MANUAL(anticipo), session.businessFrom);
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
    await ensureProducts();
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
      await ensureProducts();
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
      await ensureProducts();
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
      .map((it) => {
        const nombre = it.nombre;
        const solicitado =
          it.linea && typeof it.linea === 'string' && normalize(it.linea) !== normalize(nombre) ? it.linea : null;
        const precio = it.precio != null ? ` (${formatPrice(it.precio)})` : '';
        return `${it.qty} x ${nombre}${solicitado ? ` (solicitado: "${solicitado}")` : ''}${precio}`;
      })
      .join('\n');
    const conFotos = products.filter((p) => findProductImage(p));
    const fotosLine = conFotos.length
      ? `El sistema puede enviar la foto de estos productos si el cliente la pide (número y nombre):\n${conFotos.map((p) => `${p.numero}. ${p.producto}`).join('\n')}`
      : 'Por ahora no hay fotos de productos en la tienda.';
    return `Eres el asistente virtual de una tienda de útiles escolares y limpieza en Ecuador (precios en dólares USD). Atiendes por WhatsApp en español, con un tono cercano, natural y amable: habla como una vendedora de confianza, breve, sin jerga técnica y sin repetir fórmulas ni menús largos. Guías la venta con naturalidad, paso a paso, sin abrumar al cliente.

CATÁLOGO COMPLETO con precios (producto | precio). Solo puedes ofrecer estos productos exactos; NUNCA inventes productos ni precios:
${ai.buildCatalogContext(products)}

PEDIDO ACTUAL del cliente:
${cart || '(vacío)'}

REGLAS DE VENTA:
- UNA PREGUNTA A LA VEZ: haz UNA sola pregunta por mensaje y espera la respuesta del cliente antes de la siguiente pregunta. NUNCA amontones más de una pregunta en un mismo mensaje (ni de varios productos ni de otros temas como el género o la entrega).
- MISMO PRODUCTO: Si el producto solicitado es el MISMO que uno del catálogo aunque la redacción sea un poco diferente (por ejemplo: el cliente escribe "1 Cuaderno universitario de 100 hojas a cuadros" y el catálogo tiene "Cuaderno universitario cuadros de 100 hojas"), usa Gemini para reconocer que es el mismo producto y agrégalo DIRECTAMENTE al carrito (con su "linea" y cantidad exactas), SIN preguntar, sin ofrecer opciones y sin marcarlo como "no disponible". Un producto solo es NO disponible si NO existe en el catálogo (ni siquiera con redacción distinta).
- OPCIONES POR PRODUCTO: cuando el cliente pida un producto, muéstrale las opciones MÁS PARECIDAS del catálogo (máximo 4), numeradas y con su precio, y pregúntale cuál prefiere (puede responder con el número, el nombre, o "ninguna"). Si solo hay UNA SOLA opción que cumpla el objetivo, agrégalo al "carrito" directamente (con su "linea" del texto del cliente) sin preguntar. NO agregues un producto al "carrito" hasta que el cliente elija una opción cuando existan varias.
- Si pide algo que no existe, ofrécele el producto más parecido del catálogo (misma regla de opciones) o dile con amabilidad que no está disponible.
- ACCESORIOS: cuando el cliente termine de agregar productos (diga "eso es todo", "listo", "nada más", "no necesito más" o decline agregar algo más), ofrécele proactivamente y con naturalidad mochilas, cartucheras y loncheras (con su precio; si quiere verlas, envíale sus fotos con la regla FOTOS o el enlace del catálogo). Pregúntale si le interesa alguno. Si no le interesa, continúa con el Género de la lista.
- Género de la lista: En un solo mensaje pregunta, de forma natural y amable, si la lista solicitada es para niña, niño, adolescente, hombre o mujer. Espera a que responda y continúa con ENTREGA.
- ENTREGA: cuando el cliente indique el Género de la lista, pregúntale: ¿prefiere ENTREGA A DOMICILIO (con un recargo de ${formatPrice(DOMICILIO_RECARGO)}) o RETIRAR el pedido el viernes en la tienda? Espera que responda. Si elige entrega a domicilio, pídele la dirección, una vez que responda, preguntale: a nombre de quién se entrega, espera a que responda y le preguntas: qué día y a qué hora desea recibirlo. Si elige retiro, dile que su pedido estará listo el viernes y no hace falta dirección ni horario. 
- PEDIDO FINAL: Después de que el cliente proporciona la información de ENTREGA, marca "pedido_finalizado" como true SOLO cuando ya haya productos en el pedido Y los datos de entrega estén completos (domicilio: dirección, nombre, día y hora; retiro: la elección de retiro). 
  Y envía automáticamente una cotización indicando los productos que pidió, en la cabecera de la cotización adjunta la información de Género de la lista y ENTREGA.
  y envía el mensaje de CONFIRMACIÓN.
- CONFIRMACIÓN: Acompaña la cotización final con un mensaje breve y amable: "Te envío la cotización de lo solicitado. Revísalo y cuéntame si estás de acuerdo?" (debe terminar con signo de interrogación). 
  Si el cliente está de acuerdo, continúa con COBRO. Si no está de acuerdo, pregúntale con amabilidad qué necesita (¿agregar algo más?, ¿eliminar algún producto?) y ayúdale a realizarlo; luego continúa con ACCESORIOS.
- COBRO: Indica al cliente que para confirmar el pedido se solicita un anticipo del 50% del total (no reembolsable) y el resto al momento de la entrega o retiro. Pregunta si deseas que te envíe el número de cuenta. Si responde que sí, indícale que en breve le envías el número de cuenta. Espera a que te envíe el comprobante de pago y continúa con VERIFICACIÓN DE COMPROBANTE.
- VERIFICACIÓN DE COMPROBANTE: Cuando el cliente envíe el comprobante de transferencia, revisa que sea un comprobante válido (captura de la app del banco o voucher con monto, titular y fecha). Verifica que el monto sea igual o mayor al anticipo esperado, que el titular coincida con "Evelyn Lizeth Zambrano" y que la fecha del comprobante sea exactamente hoy. Si todo es correcto, confirma la recepción del comprobante y finaliza la venta. Si hay algún error, explica amablemente qué está mal y solicita un nuevo comprobante. 
- Método de pago: 50% de anticipo no reembolsable por transferencia a nombre de "Evelyn Lizeth Zambrano" y el resto al momento de la entrega o retiro. Si el cliente pide pagar todo al retirar o al recibir (sin adelanto), explícale con amabilidad que por políticas de seguridad se solicita el pago del 50% para confirmar el pedido (no reembolsable) y el restante al momento de la entrega o retiro.
- CUENTA DE TRANSFERENCIA: si el cliente pregunta a qué número de cuenta debe transferir (número de cuenta, cuenta bancaria, a dónde transfiero), respóndele EXACTAMENTE: "En breve te indico el número de cuenta." No des ni inventes ningún número de cuenta; el asesor lo enviará después.
- FOTOS: ${fotosLine} Cuando el cliente pida la foto de un producto (p.ej. "foto de la mochila", "muéstrame la mochila"), respóndele que se la envías y marca "enviar_foto" con el número de ese producto. Cuando pregunte qué mochilas, cartucheras o loncheras tienes (p.ej. "qué mochilas tienes", "otras mochilas", "muéstrame las cartucheras"), marca "enviar_foto" con los números de TODOS los productos con foto de esa categoría que aparecen en la lista anterior, para que el sistema le envíe todas esas imágenes. Si el producto no tiene foto, dile amablemente que no hay foto disponible de ese producto y ofrécele el precio y la descripción. Los modelos de mochilas, cartucheras y loncheras también pueden verse en el catálogo de WhatsApp: ${CATALOGO_URL}. NUNCA inventes fotos ni envíes imágenes que no estén en la lista.
- Si el cliente pide ver TODO lo que tienes disponible o el catálogo completo (p.ej. "qué tienes", "catálogo completo", "envíame tu lista"), marca "enviar_catalogo" como true. NO lo marques cuando solo pregunta por una categoría (mochilas, cartucheras, loncheras) o por un producto: en ese caso responde solo con esa información o con las fotos correspondientes, sin enviar la lista completa.
- Si el cliente pide la cotización del pedido actual ("la cotización", "dame la cotización", "cuánto sería", "pásame la cotización") y ya hay productos en el pedido, marca "enviar_cotizacion" como true; en "reply" dile que le envías la cotización. Si el pedido está vacío, no lo marques y pide que agregue productos.
- LISTA DE ÚTILES (una pregunta a la vez): cuando el cliente envíe una lista de productos (por mensaje, foto o documento):
1) COTIZACION INICIAL: marca "recibir_lista" como true. El SISTEMA (no tú) construye la imagen de la cotización inicial directamente desde el texto de la lista del cliente, sin agrupar: una fila por cada línea solicitada (columna "Descripción solicitada" con el texto EXACTO del cliente incluyendo la cantidad, "Cantidad" con el número inicial de la línea), asignando el precio del catálogo a las coincidencias y mostrando "no disponible" (0,00) a las que no coinciden. Tú NO construyes esa imagen: solo devuelve en "carrito" el pedido COMPLETO (con "linea" = texto EXACTO que escribió el cliente tal cual, INCLUYENDO la cantidad, ej. "1 masking grueso", y "cantidad" = exactamente la cantidad que pidió) para que la revisión posterior no pierda ningún ítem. NUNCA agrupes líneas distintas aunque parezcan parecidas (por ejemplo "1 masking grueso" y "1 masking delgado" son DOS filas separadas) ni modifiques cantidades.
  2) Después de que el sistema envía la COTIZACIÓN INICIAL en imagen, tu "reply" debe comenzar DIRECTAMENTE con la primera pregunta de la regla 3 sobre el primer producto NO disponible, siguiendo la regla 3. NO saludes de nuevo (nada de "Hola" ni "Qué gusto saludarte"), NO digas que recibiste la lista ni que estás trabajando en ella (el sistema ya envió el mensaje de recibido antes de la imagen), NO anuncies la cotización inicial ni menciones los "no disponible" (el sistema ya envió la imagen) y NO uses frases como "Permíteme empezar", "Empecemos por el primero" o "Vamos a revisar". Si el primer NO disponible no tiene opciones con el mismo uso, no lo menciones: tu reply comienza con el siguiente NO disponible que sí tenga opciones (o con el punto 4 si no queda ninguno). Ve directo a la pregunta.
  3) Revisar los productos faltantes.
  3) Aplica la regla de UNA PREGUNTA A LA VEZ: toma el primer producto NO disponible de la COTIZACIÓN INICIAL. 
    Usa Gemini para analizar la FUNCIÓN u OBJETIVO real de cada producto solicitado y ofrece SOLO productos del catálogo que cumplan la MISMA función. Nunca ofrezcas un producto de función distinta (por ejemplo: para "1 calculadora científica" NO ofrezcas un compás; para "corrector líquido en pluma" sí puedes ofrecer "corrector en cinta"; para "goma en barra marca X" sí "goma en barra marca Y" o líquida). Si un candidato no cumple la misma función, no lo ofrezcas. Ofrece máximo 4 alternativas.
    Interactúa de forma natural, amable y al grano, sin plantillas rígidas: menciona qué pide la lista y qué tienes disponible, cada opción en su propia línea y la pregunta final en su propia línea. Guíate por este patrón, adaptándolo con naturalidad:
    - Primer producto NO disponible (después de la cotización en imagen): "En la lista de útiles que me enviaste pide: [cantidad x línea solicitada], tengo disponible: [opciones con precio] ¿Deseas agregarlo?"
    - Siguiente producto (cuando el cliente rechazó las opciones anteriores): "Ok, en la lista pide: [cantidad x línea solicitada], tengo disponible: ... ¿Deseas agregarlo?"
    - Cuando el cliente acaba de agregar un producto, confirma brevemente ("Ya lo agregué") y continúa con el siguiente NO disponible.
    No uses frases de transición como "Entendido. Pasando al siguiente ítem".
    Sé flexible: si el cliente pregunta "¿por qué me ofreces este producto?" o "¿para qué sirve?", explícale con naturalidad por qué cumple la misma función del producto que pidió, y espera su decisión.
    Espera a que el usuario seleccione una opción o te diga que no desea ninguna.
    Repite esta accion por cada producto NO disponible de la COTIZACION INICIAL, hasta terminar con todos los productos NO disponibles de la COTIZACION INICIAL.
    Si NO hay ningún producto del catálogo que cumpla la MISMA función que el solicitado, NO envíes NINGÚN mensaje sobre ese producto: jamás digas "no lo tengo", "no tengo un producto que cumpla esa función", "no está disponible", "no lo tengo disponible" ni preguntes "¿Deseas continuar con el siguiente ítem?". El sistema ya lo muestra como "no disponible" (valor 0,00) en la cotización en imagen, así que no hace falta anunciarlo. Pasa en silencio al siguiente producto NO disponible de la COTIZACION INICIAL (o al punto 4 si no queda ninguno).
  4) OFERTA PROACTIVA: Una vez terminada la revisión de la lista, indícale que esos son todos los productos que me pediste en la lista. 
  y pregúntale si desea algo más, ofrécele proactivamente y con naturalidad mochilas, cartucheras y loncheras (con su precio; si quiere verlas, envíale sus fotos con la regla FOTOS o el enlace del catálogo). Pregúntale si le interesa alguno. Si no le interesa, continúa con el Género de la lista.
  5) Género de la lista 
  6) ENTREGA
  7) COTIZACION SEGUNDARIA: SÓLO cuando el cliente indique que ya no desea agregar nada más ("eso es todo", "listo", "no necesito más"), 
    toma la COTIZACIÓN INICIAL y modifica con todo lo que el cliente seleccionó; los demás productos que no seleccionó el cliente, déjalos tal como están en la COTIZACIÓN INICIAL, 
    en la cabecera de la cotización adjunta la información de Género de la lista y ENTREGA.
    marca "pedido_finalizado" como true (NUNCA "enviar_cotizacion": la final siempre cierra el pedido).
  6) CONFIRMACIÓN
  7) COBRO
  8) VERIFICACIÓN DE COMPROBANTE
  9) - NO TE REPITAS: si ya enviaste la cotización, el catálogo o una foto en este chat y el cliente no cambió su pedido, el sistema no los vuelve a enviar; tampoco repitas el mismo mensaje. Cuando el sistema acaba de enviar el mensaje de recibido de la lista y la imagen de la cotización, no saludes ni resumas lo que el sistema ya dijo: comienza directo con la siguiente pregunta de la revisión. Si el cliente insiste o repite la misma pregunta, responde distinto y pregúntale concretamente qué necesita. No vuelvas a ofrecer un producto que el cliente ya rechazó.

FORMATO DE RESPUESTA (JSON):
- "reply": mensaje de texto para el cliente (en español), natural y amable.
- "carrito": pedido COMPLETO y actualizado (nombres exactos del catálogo con su cantidad). Si el cliente no cambió nada, devuelve el pedido tal como está. Si el cliente escribió su lista o eligió una opción, incluye en cada item el campo "linea" con el texto EXACTO que escribió el cliente para ese producto, para que la cotización refleje su lista original. El carrito SIEMPRE incluye TODOS los ítems del pedido, incluidos los que no tienen coincidencia en el catálogo (con su "linea"), hasta que se cierre la venta; los ítems sin coincidencia el sistema los mostrará como "no disponible" con precio 0.00.
- "entrega": objeto con direccion, diaHora, nombre, genero ("niña"/"niño"/"adolescente"/"hombre"/"mujer"/"adulto") y domicilio (true si entrega a domicilio, false si retiro), solo con los datos que ya haya aportado el cliente.
- "pedido_finalizado", "despedirse", "enviar_catalogo", "enviar_cotizacion", "recibir_lista": booleanos según las reglas. "recibir_lista" (true al recibir una lista) hace que el sistema envíe la cotización rápida en imagen; después de enviarla, comienza la revisión de los productos NO disponibles de la cotización inicial, uno a la vez, y tu "reply" debe comenzar directamente con la primera pregunta de la regla 3, sin saludar ni repetir que recibiste la lista ni anunciar la cotización inicial. "enviar_cotizacion" (true SOLO cuando el cliente pide explícitamente la cotización del pedido actual en ese mensaje) hace que el sistema envíe la cotización en imagen; al terminar de resolver la lista siempre usa "pedido_finalizado", no "enviar_cotizacion".
- "enviar_foto": lista de números de productos cuya foto debe enviarse (puede tener varios números, por ejemplo todas las mochilas de una vez). Solo usa productos que aparecen en la lista de FOTOS.
`;
  }

  function deleteIaRow(session, linea, producto) {
    const l = normalize(linea);
    const p = normalize(producto);
    if (!l && !p) return;
    const byLinea = [];
    const byProd = [];
    for (const [k, v] of session.seleccion) {
      const vl = normalize(v.linea || v.nombre);
      if (l && vl === l) byLinea.push(k);
      if (p && normalize(v.nombre || v.catalogo) === p) byProd.push(k);
    }
    if (byLinea.length === 1) session.seleccion.delete(byLinea[0]);
    else if (byLinea.length === 0 && byProd.length === 1) session.seleccion.delete(byProd[0]);
  }

  function applyIaCarrito(session, carrito) {
    if (!Array.isArray(carrito) || carrito.length === 0) return;
    const usedKeys = new Map();
    for (const it of carrito) {
      const name = String(it?.producto || '').trim();
      const qty = Number(it?.cantidad) || 1;
      if (!name) continue;
      const linea = typeof it?.linea === 'string' && it.linea.trim() ? it.linea.trim() : name;
      if (qty <= 0) {
        const rkeys = [];
        for (const [k, v] of session.seleccion) {
          if (normalize(v.linea || v.nombre) === normalize(linea) || normalize(v.nombre || v.linea) === normalize(name)) {
            rkeys.push(k);
          }
        }
        for (const k of rkeys) session.seleccion.delete(k);
        continue;
      }
      const hit = findItems(name, products)[0];
      const pref = hit ? 'prod' : 'no disponible';
      const base = normalize(`${pref}|${linea}`);
      const n = usedKeys.get(base) || 0;
      const key = n === 0 ? base : `${base}#${n + 1}`;
      usedKeys.set(base, n + 1);
      if (!hit) {
        deleteIaRow(session, linea, '');
        session.seleccion.set(key, {
          nombre: 'no disponible',
          linea,
          catalogo: 'no disponible',
          desc: '',
          precio: null,
          qty,
        });
        continue;
      }
      deleteIaRow(session, linea, hit.producto);
      session.seleccion.set(key, {
        nombre: hit.producto,
        linea,
        desc: hit.descripcion || '',
        precio: hit.precio,
        qty,
      });
    }
  }

  function mergeIaEntrega(session, entrega) {
    if (!entrega || typeof entrega !== 'object') return;
    if (typeof entrega.direccion === 'string' && entrega.direccion.trim()) session.direccion = entrega.direccion.trim();
    if (typeof entrega.diaHora === 'string' && entrega.diaHora.trim()) session.diaHora = entrega.diaHora.trim();
    if (typeof entrega.nombre === 'string' && entrega.nombre.trim()) session.nombreEntrega = entrega.nombre.trim();
    if (typeof entrega.genero === 'string' && /ni[ñn]a/i.test(entrega.genero)) session.genero = 'niña';
    else if (typeof entrega.genero === 'string' && /ni[ñn]o/i.test(entrega.genero)) session.genero = 'niño';
    else if (typeof entrega.genero === 'string' && entrega.genero.trim()) session.genero = entrega.genero.trim().toLowerCase();
    if (typeof entrega.domicilio === 'boolean') session.delivery = entrega.domicilio;
  }

  function seleccionRows(session) {
    if (session.listaBase) {
      return mergeListaRows([...session.listaBase.values()], [...session.seleccion.values()]);
    }
    const rows = [];
    for (const [, it] of session.seleccion) {
      rows.push({ linea: it.linea || it.nombre, nombre: it.catalogo || it.nombre, precio: it.precio, qty: it.qty });
    }
    return rows;
  }

  async function sendCotizacionIa(from, session) {
    const png = await buildPriceImage(seleccionRows(session), { lista: session.listaMode, headers: session.headers || [] });
    await sendImage(from, png, session.businessFrom);
  }

  async function sendFinalCotizacionIa(from, session) {
    const png = await buildPriceImage(seleccionRows(session), {
      lista: session.listaMode,
      headers: session.headers || [],
      entrega: {
        direccion: session.direccion,
        diaHora: session.diaHora,
        nombre: session.nombreEntrega,
        genero: session.genero,
      },
      recargo: session.delivery ? DOMICILIO_RECARGO : 0,
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
    await ensureProducts();
    session.busy = true;
    try {
      let parts = [{ text: msg.text || '' }];
      let rawLines = null;
      if (msg.type === 'image' && msg.data) {
        parts = [{ inlineData: { mimeType: msg.mimeType || 'image/jpeg', data: msg.data.toString('base64') } }];
      } else if (msg.type === 'document') {
        let lines = null;
        try {
          lines = await parseFile(msg.data, msg.filename);
        } catch {
          lines = null;
        }
        rawLines = lines;
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
      const recibiendoLista = Boolean(result.recibir_lista);
      const listLines =
        msg.type === 'document' ? rawLines : msg.type === 'text' ? parseItemList(msg.text || '') : [];
      const isListMessage = msg.type === 'document' || (listLines?.length || 0) >= 2;
      if (recibiendoLista || isListMessage) {
        session.listaMode = true;
        if (isListMessage && listLines && listLines.length) {
          const { headers, items } = matchListLines(listLines, products, true);
          const seeded = seedSeleccionFromItems(items);
          const sig = [...seeded.values()].map((it) => `${normalize(it.linea || it.nombre)}:${it.qty}`).sort().join('|');
          if (session.lastListSig !== sig) {
            session.headers = headers;
            session.seleccion = seeded;
            session.lastListSig = sig;
          }
        }
        session.listaBase = new Map([...session.seleccion].map(([k, v]) => [k, { ...v }]));
      }
      const finalizing = result.pedido_finalizado && session.seleccion.size > 0;
      if (finalizing) {
        const sig = finalSig(session);
        if (sig !== session.sent.finalSig) {
          await sendFinalCotizacionIa(from, session);
          session.sent.finalSig = sig;
          await sleep(iaImageReplyDelay());
        }
      }
      if ((recibiendoLista || isListMessage) && !finalizing && session.seleccion.size > 0) {
        const sig = cartSig(session);
        if (sig !== session.sent.quoteSig) {
          await sendText(from, PROCESANDO_LISTA_IA, session.businessFrom);
          await sendCotizacionIa(from, session);
          session.sent.quoteSig = sig;
          await sleep(iaImageReplyDelay());
        }
      }
      session.iaHistory.push({ role: 'model', parts: [{ text: result.reply }] });

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
      await sendText(from, result.reply, session.businessFrom);
      if (finalizing) {
        if (!/[?¿]/.test(result.reply)) {
          await sendText(from, IA_CONFIRMA_PEDIDO_MSG, session.businessFrom);
        }
        session.state = STATES.IA_CONFIRMA_PEDIDO;
        return;
      }
      if (result.enviar_cotizacion && !recibiendoLista && !isListMessage && session.seleccion.size > 0) {
        const hasEntrega = Boolean(
          session.direccion || session.nombreEntrega || session.diaHora || session.genero || session.delivery != null
        );
        if (hasEntrega) {
          const sig = finalSig(session);
          if (sig !== session.sent.finalSig) {
            await sendFinalCotizacionIa(from, session);
            session.sent.finalSig = sig;
          }
        } else {
          const qsig = cartSig(session);
          if (qsig !== session.sent.quoteSig) {
            await sendCotizacionIa(from, session);
            session.sent.quoteSig = qsig;
          }
        }
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

  async function handleIaConfirmaPedido(from, session, msg) {
    if (msg.type !== 'text') {
      session.state = STATES.IA_CHAT;
      return handleIa(from, session, msg);
    }
    const text = String(msg.text || '').trim();
    const t = normalize(text);
    if (matchesYes(t) || /(confirm|confirmar|realiz|de acuerdo|deacuerdo|^ok$)/.test(t)) {
      const anticipo = anticipoDe(session);
      await sendText(from, PAYMENT_IA(anticipo), session.businessFrom);
      session.state = STATES.ESPERA_COMPROBANTE;
      return;
    }
    session.state = STATES.IA_CHAT;
    return handleIa(from, session, { type: 'text', text });
  }

  async function handleMessage(from, msg) {
    const session = getSession(from);
    if (session.state === STATES.DESACTIVADO) {
      log(`[utiles] chat en silencio para ${from} (Evelyn conversa con el cliente)`);
      return;
    }
    session.businessFrom = msg.businessFrom || session.businessFrom;
    resetTimer(from, session);

    if (!session.greeted) {
      session.greeted = true;
      session.state = STATES.SALUDO;
      await sendText(from, SALUDO_REPLY, session.businessFrom);
      return;
    }

    if (msg.type === 'image') {
      if (aiEnabled() && (session.state === STATES.IA_CHAT || session.state === STATES.SALUDO || session.state === STATES.IA_CONFIRMA_PEDIDO)) {
        session.state = STATES.IA_CHAT;
        return handleIa(from, session, msg);
      }
      if (isChatbotState(session.state)) {
        await sendText(from, CHATBOT_SOLO_TEXTO, session.businessFrom);
        return;
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
      if (aiEnabled() && (session.state === STATES.IA_CHAT || session.state === STATES.SALUDO || session.state === STATES.IA_CONFIRMA_PEDIDO)) {
        session.state = STATES.IA_CHAT;
        return handleIa(from, session, msg);
      }
      if (isChatbotState(session.state)) {
        await sendText(from, CHATBOT_SOLO_TEXTO, session.businessFrom);
        return;
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

    if (isTalkToEvelyn(t)) {
      log(`[utiles] ${from} pidió comunicarse con Evelyn`);
      return goToEvelyn(from, session);
    }

    if (isChatbotState(session.state)) {
      return handleChatbot(from, session, text, t);
    }
    if (isChatbotRequest(t)) {
      return startChatbot(from, session);
    }

    if (aiEnabled() && session.state === STATES.IA_CHAT) {
      return handleIa(from, session, { type: 'text', text });
    }

    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && session.state !== STATES.RESOLVER_LISTA && session.state !== STATES.IA_CONFIRMA_PEDIDO && isCatalogRequest(t)) {
      await ensureProducts();
      await sendCatalogoImage(from, session);
      await sendText(from, PIDE_NUMEROS, session.businessFrom);
      session.state = STATES.NUMEROS;
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && session.state !== STATES.RESOLVER_LISTA && isQuoteRequest(t)) {
      if (session.seleccion.size === 0) {
        await sendText(from, PIDE_LISTA, session.businessFrom);
        session.state = STATES.ESPERA_LISTA;
      } else {
        await sendPreliminaryCotizacion(from, session);
      }
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && session.state !== STATES.RESOLVER_LISTA && isPayAllOnPickup(t)) {
      await sendText(from, PAYMENT_TODO_RETIRO(anticipoDe(session)), session.businessFrom);
      return;
    }
    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && session.state !== STATES.RESOLVER_LISTA && isPaymentRequest(t)) {
      await sendText(from, PAYMENT_REPLY(anticipoDe(session)), session.businessFrom);
      return;
    }
    if (
      session.state !== STATES.ESPERA_COMPROBANTE &&
      session.state !== STATES.ASESOR &&
      session.state !== STATES.RESOLVER_LISTA &&
      session.state !== STATES.SUGERENCIA &&
      session.state !== STATES.CONFIRMA_SUGERENCIA &&
      isPhotoRequest(t)
    ) {
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
      case STATES.IA_CONFIRMA_PEDIDO:
        return handleIaConfirmaPedido(from, session, { type: 'text', text });
      case STATES.ESPERA_COMPROBANTE:
        return handleEsperaComprobante(from, session, text, t);
      case STATES.ESPERA_CONFIRMACION_RECIBO:
        return handleEsperaConfirmacionRecibo(from, session, text, t);
      case STATES.PICKUP_AGENDA:
        return handlePickupAgenda(from, session, text, t);
      case STATES.RESOLVER_LISTA:
        return handleResolverLista(from, session, text, t);
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