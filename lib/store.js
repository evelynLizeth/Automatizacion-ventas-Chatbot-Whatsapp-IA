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
import { createSessionState, resetCarritoFields, createSessionBackend } from './sessionStore.js';
import {
  mergeListaRows,
  cartSig,
  finalSig,
  addToSeleccion,
  addNoDisponible,
  lineQty,
  seedSeleccionFromItems,
  seleccionList,
  seleccionRows,
  seleccionTotal,
  anticipoDe,
} from './cart.js';
import { isChatbotState, buildChatbotSummary, buildChatbotFieldList } from './chatbotForm.js';
import { BOT_CHALLENGE_ANSWER, botThreshold, botCooldownMs, isBotCooling, updateBotSignals } from './botGuard.js';
import { BOT_CHALLENGE_MSG, BOT_COOLDOWN_MSG, BOT_DEGRADED_NOTE } from './messages.js';
import {
  STATES,
  MIN_5,
  MIN_9,
  CATALOGO_URL,
  DOMICILIO_RECARGO,
  IA_CONFIRMA_PEDIDO_MSG,
  SALUDO_REPLY,
  SERVICIOS_REPLY,
  DEMO_INTRO,
  DEMO_OUTRO,
  SERVICIOS_SOLO_TEXTO,
  EXIT_DEMO_RE,
  PIDE_LISTA,
  PIDE_NUMEROS,
  NUMEROS_INVALID,
  DESPEDIDA,
  SALUDO_NO_REPLY,
  NO_ENCONTRADO,
  NONE_FOUND_LIST,
  PROCESANDO_LISTA,
  PROCESANDO_LISTA_IA,
  sleep,
  iaImageReplyDelay,
  CONFIRMA_ARCHIVO_MSG,
  PREGUNTA_PRODUCTO_MSG,
  PREGUNTA_DISPONIBLE_MSG,
  PIDE_PRODUCTO,
  ARCHIVO_NO_RECIBIDO,
  ESPERA_GENERANDO,
  PIDES_CANTIDAD,
  QTY_INVALID,
  MENU_AGREGADO,
  CUAL_DESEAS,
  PICK_INVALID,
  NO_DISPONIBLE_MSG,
  NO_INCLUYO_MSG,
  AGREGADO_LISTA_MSG,
  PIDE_AGREGAR,
  PIDE_ELIMINAR,
  CONFIRMA_COTIZACION_MSG,
  PIDE_GENERO,
  ENTREGA_MSG,
  PIDE_UBICACION,
  PIDE_DIA_HORA,
  PIDE_NOMBRE_ENTREGA,
  CONFIRMA_ENTREGA_MSG,
  PAYMENT_REPLY,
  PAYMENT_TODO_RETIRO,
  PAYMENT_PICKUP,
  PAYMENT_DELIVERY,
  PAYMENT_IA,
  COMPROBANTE_MANUAL,
  COMPROBANTE_OK_IA,
  COMPROBANTE_MAL_IA,
  COMPROBANTE_MAL_VARIANTS,
  COMPROBANTE_MISMA_IMAGEN,
  PIDE_COMPROBANTE_OTRA_VEZ,
  RETIRO_LISTO,
  RETIRO_DESPEDIDA,
  ENTREGA_MOTORIZADO,
  DESPEDIDA_ABANDONO,
  ASESOR_MSG,
  ASESOR_GRACIAS,
  ASESOR_DESPEDIDA,
  SUGERENCIA_MSG,
  CONFIRMA_SUGERENCIA_MSG,
  MODELO_MSG,
  FOTOS_REPLY,
  FOTO_NO_OCR,
  FILE_UNREADABLE,
  TIMEOUT_1,
  TIMEOUT_2,
  AI_FALLBACK,
  AI_INTRO,
  CHATBOT_FIELDS,
  CHATBOT_INTRO,
  CHATBOT_PIDE_APROBACION,
  CHATBOT_APROBADO,
  CHATBOT_SOLO_TEXTO,
} from './messages.js';
import {
  NUMEROS,
  matchesYes,
  matchesNo,
  isEsoEsTodo,
  isGracias,
  isPaymentRequest,
  isPayAllOnPickup,
  isPhotoRequest,
  isCatalogRequest,
  isChatbotRequest,
  isDemoRequest,
  isServiceRequest,
  isQuoteRequest,
  isTalkToEvelyn,
  isEliminarIntent,
  isAgregarIntent,
  parseQuantity,
} from './intents.js';

export { STATES, ESPERA_GENERANDO };

export { mergeListaRows };

export function createUtilesStore({ getProducts, sendText, sendImage, log = console.log, ai = aiModule, startInDemo = false, sessionBackend, botGuard = process.env.BOT_GUARD !== 'off' } = {}) {
  const sessions = sessionBackend || createSessionBackend({ log });
  let products = [];

  async function ensureProducts() {
    if (products.length === 0) products = await getProducts();
    return products;
  }

  function createSession() {
    return createSessionState(startInDemo);
  }

  function getSession(from) {
    let s = sessions.get(from);
    if (!s) {
      s = createSession();
      sessions.set(from, s);
    }
    return s;
  }

  function touchSession(from, session) {
    session.lastActivity = Date.now();
    if (typeof sessions.touch === 'function') sessions.touch(from);
    else sessions.set(from, session);
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

  // ===== DOMINIO: ciclo de vida demo/sesión =====
  function deactivate(from, session) {
    if (session.timer) clearTimeout(session.timer);
    sessions.delete(from);
  }

  async function exitDemo(from, session) {
    session.demoMode = false;
    session.state = STATES.SERVICIOS;
    resetCarritoFields(session);
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    await sendText(from, DEMO_OUTRO, session.businessFrom);
    await sendText(from, SERVICIOS_REPLY, session.businessFrom);
  }

  async function startDemo(from, session) {
    session.demoMode = true;
    session.state = STATES.SALUDO;
    resetCarritoFields(session);
    await sendText(from, DEMO_INTRO, session.businessFrom);
    await sendText(from, SALUDO_REPLY, session.businessFrom);
  }

  async function maybeClose(from, session) {
    if (session.demoMode) {
      log(`[utiles] demo finalizada para ${from}, volviendo al menú principal`);
      return exitDemo(from, session);
    }
    deactivate(from, session);
  }

  async function goToEvelyn(from, session) {
    if (session.demoMode) {
      log(`[utiles] práctica Evelyn pedida dentro de la demo para ${from}, volviendo al menú principal`);
      return exitDemo(from, session);
    }
    if (session.timer) clearTimeout(session.timer);
    session.state = STATES.DESACTIVADO;
    await sendText(from, SALUDO_NO_REPLY, session.businessFrom);
  }

  function getAccesorioProducts() {
    return products.filter((p) => /(mochila|cartuchera|lonchera)/.test(normalize(p.producto)));
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

  async function handleServicios(from, session, text, t) {
    const t0 = text.trim();

    if (isDemoRequest(t)) return startDemo(from, session);

    if (aiAllowed(session) && typeof ai.askGeminiServices === 'function') {
      session.serviciosHistory.push({ role: 'user', text });
      if (session.serviciosHistory.length > 48) {
        session.serviciosHistory = session.serviciosHistory.slice(-48);
      }
      let res = null;
      try {
        res = await ai.askGeminiServices(ai.buildServicesSystem ? ai.buildServicesSystem() : undefined, session.serviciosHistory);
      } catch (err) {
        console.error('[utiles] error al consultar Gemini (servicios)', err);
      }
      if (res && typeof res.reply === 'string') {
        session.serviciosHistory.push({ role: 'model', text: res.reply });
        if (res.evelyn && !res.ir_demo && !res.formulario) {
          await sendText(from, res.reply, session.businessFrom);
          return goToEvelyn(from, session);
        }
        await sendText(from, res.reply, session.businessFrom);
        if (res.ir_demo) return startDemo(from, session);
        if (res.formulario) return startChatbot(from, session);
        if (res.despedirse) {
          deactivate(from, session);
          return;
        }
        return;
      }
      if (res && (res.ir_demo || res.evelyn || res.formulario || res.despedirse)) {
        if (res.ir_demo) return startDemo(from, session);
        if (res.evelyn) return goToEvelyn(from, session);
        if (res.formulario) return startChatbot(from, session);
        if (res.despedirse) deactivate(from, session);
        return;
      }
      await sendText(from, SERVICIOS_REPLY, session.businessFrom);
      return;
    }

    if (/^3$/.test(t0)) {
      return goToEvelyn(from, session);
    }
    if (/^2$/.test(t0) || isServiceRequest(t) || isChatbotRequest(t)) {
      return startChatbot(from, session);
    }
    await sendText(from, SERVICIOS_REPLY, session.businessFrom);
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
      await maybeClose(from, session);
      return;
    }
    await sendText(from, ASESOR_MSG, session.businessFrom);
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
      if (session.listaMode && !session.genero) {
        await sendText(from, PIDE_GENERO, session.businessFrom);
        session.state = STATES.GENERO;
        return;
      }
      await sendText(from, ENTREGA_MSG, session.businessFrom);
      session.state = STATES.ENTREGA;
      return;
    }
    await sendText(from, `Te confirmo lo que llevo de tu cotización: ${formatPrice(seleccionTotal(session))}. ${MENU_AGREGADO}`, session.businessFrom);
    session.state = STATES.AGREGADO;
  }

  async function handleGenero(from, session, text, t) {
    if (session.demoMode && EXIT_DEMO_RE.test(t)) {
      log(`[utiles] ${from} pidió salir de la demo`);
      return exitDemo(from, session);
    }
    if (isTalkToEvelyn(t)) {
      log(`[utiles] ${from} pidió comunicarse con Evelyn`);
      return goToEvelyn(from, session);
    }
    if (isChatbotRequest(t) || (isServiceRequest(t) && t !== '2')) {
      log(`[utiles] ${from} pidió servicios en género, continúa con la venta de chatbots`);
      return startChatbot(from, session);
    }
    if (isAgregarIntent(t) || isEliminarIntent(t) || isQuoteRequest(t)) {
      await sendText(from, `Entendido, volvamos a tu cotización. ${MENU_AGREGADO}`, session.businessFrom);
      session.state = STATES.AGREGADO;
      return;
    }
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
      await maybeClose(from, session);
      return;
    }
    await sendText(from, CONFIRMA_ENTREGA_MSG, session.businessFrom);
  }

  async function handleEsperaComprobante(from, session, text, t) {
    await sendText(from, PIDE_COMPROBANTE_OTRA_VEZ, session.businessFrom);
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
            await maybeClose(from, session);
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
        await maybeClose(from, session);
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
    await maybeClose(from, session);
  }

  async function handleEsperaLista(from, session, text, t) {
    if (matchesNo(t)) {
      await sendText(from, DESPEDIDA, session.businessFrom);
      await maybeClose(from, session);
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
      await maybeClose(from, session);
      return;
    }
    await sendText(from, PREGUNTA_DISPONIBLE_MSG, session.businessFrom);
  }

  function aiEnabled() {
    return ai && typeof ai.isAiEnabled === 'function' ? ai.isAiEnabled() : false;
  }

  function aiAllowed(s) {
    return aiEnabled() && !(s && s.degraded);
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
- ACCESORIOS: cuando el cliente termine de agregar productos (diga "eso es todo", "listo", "nada más", "no necesito más" o decline agregar algo más), ofrécele proactivamente y con naturalidad mochilas, cartucheras y loncheras (con su precio; si quiere verlas, envíale sus fotos con la regla FOTOS o el enlace del catálogo). Pregúntale si le interesa alguno. Si no le interesa, continúa con el siguiente paso: si el pedido viene de una LISTA DE ÚTILES pregunta el Género; si son productos sueltos (uno o dos productos sin lista), OMITE el Género y ve directo a ENTREGA.
- Género de la lista (SOLO si hubo LISTA DE ÚTILES): En un solo mensaje pregunta, de forma natural y amable, si la lista solicitada es para niña, niño, adolescente, hombre o mujer. Espera a que responda y continúa con ENTREGA. Si el cliente pidió productos sueltos como esferos, borrador o reglas (sin lista), NUNCA preguntes el género: continúa directo con ENTREGA.
- ENTREGA: cuando el cliente indique el Género de la lista (o inmediatamente después de ACCESORIOS si no hubo lista y se omitió el Género), pregúntale: ¿prefiere ENTREGA A DOMICILIO (con un recargo de ${formatPrice(DOMICILIO_RECARGO)}) o RETIRAR el pedido el viernes en la tienda? Espera que responda. Si elige entrega a domicilio, pídele la dirección, una vez que responda, preguntale: a nombre de quién se entrega, espera a que responda y le preguntas: qué día y a qué hora desea recibirlo. Si elige retiro, dile que su pedido estará listo el viernes y no hace falta dirección ni horario. 
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
  1) COTIZACION INICIAL: marca "recibir_lista" como true. La cotización inicial incluye TODOS los ítems de la lista (no omitas ningun ítem), incluso los que no tengan coincidencia en el catálogo: para esos se muestra el texto EXACTO que escribió el cliente y el valor como "No disponible" con precio 0.00. El SISTEMA (no tú) construye la imagen directamente desde el texto de la lista del cliente, sin agrupar, ni quitar ítems aunque sean parecidos: una fila por cada línea solicitada (columna "Descripción solicitada" con el texto EXACTO del cliente incluyendo la cantidad, "Cantidad" con el número inicial de la línea), asignando el precio del catálogo a las coincidencias y mostrando "no disponible" (0,00) a las que no coinciden. Tú NO construyes esa imagen: solo devuelve en "carrito" el pedido COMPLETO (con "linea" = texto EXACTO que escribió el cliente tal cual, sin saltarse ninguna línea, INCLUYENDO la cantidad, ej. "1 masking grueso", y "cantidad" = exactamente la cantidad que pidió) para que la revisión posterior no pierda ningún ítem. Si la lista llegó como FOTO, léela completa y aplica la misma regla: el "carrito" debe incluir CADA ítem visible en la foto, sin omitir ningun item (los sin coincidencia como "No disponible" con su texto), para que la cotización inicial no omita nada. NUNCA agrupes líneas aunque parezcan parecidas (por ejemplo "1 masking grueso" y "1 masking delgado" son DOS items distintos) ni modifiques cantidades. Incluye TODOS los ítems de la lista, aunque no tengan coincidencia en el catálogo: en ese caso usa como "producto solicitado" el texto exacto que escribió el cliente y en "Producto" pon  "No disponible" con precio 0.00.
  2) Después de que el sistema envía la COTIZACIÓN INICIAL en imagen, tu "reply" debe comenzar DIRECTAMENTE con la primera pregunta de la regla 3 sobre el primer producto NO disponible, siguiendo la regla 3. NO saludes de nuevo (nada de "Hola" ni "Qué gusto saludarte"), NO digas que recibiste la lista ni que estás trabajando en ella (el sistema ya envió el mensaje de recibido antes de la imagen), NO anuncies la cotización inicial ni menciones los "no disponible" (el sistema ya envió la imagen) y NO uses frases como "Permíteme empezar", "Empecemos por el primero" o "Vamos a revisar". Si el primer NO disponible no tiene opciones con el mismo uso, no lo menciones: tu reply comienza con el siguiente NO disponible que sí tenga opciones que cumplan la misma función. (o con el punto 4 si no queda ninguno). Ve directo a la pregunta.



   3) OPCIONES PRODUCTOS NO DISPONIBLE: Aplica la regla de UNA PREGUNTA A LA VEZ:
    - PRODUCTO SOLICITADO NO DISPONIBLE: En la COTIZACION INICIAL, en la columna "Producto", busca desde el principio de la lista los productos No disponible con "Valor unitario": 0,00 y selecciona el "Producto solicitado" de esa linea.
    - OPCIONES PRODUCTO SOLICITADO: Usa Gemini para analizar la FUNCIÓN u OBJETIVO real del PRODUCTO SOLICITADO NO DISPONIBLE y busca en el catálogo, productos que cumplan la MISMA función que el PRODUCTO SOLICITADO NO DISPONIBLE (haz una lista de todos los productos del calago que cumplan la misma funcion que el PRODUCTO SOLICITADO NO DISPONIBLE), si no hay ningun producto en el catalo que cumpla la misma funcion que el PRODUCTO SOLICITADO NO DISPONIBLE responde exactamente "No disponible".
      Nunca ofrezcas un producto de función distinta al PRODUCTO SOLICITADO NO DISPONIBLE.
    Interactúa de forma natural, amable y al grano, sin plantillas rígidas: menciona qué pide la lista y qué tienes disponible (no menciones nada si la OPCIONES PRODUCTO SOLICITADO es: "No disponible" y sigue con el siguiente producto), cada opción en una línea y la pregunta final en la siguiente línea. Guíate por este patrón, adaptándolo con naturalidad:

    Primer PRODUCTO SOLICITADO NO DISPONIBLE que tiene OPCIONES PRODUCTO SOLICITADO (después de la cotización en imagen):
    "En la cotización que te envié hay algunos productos que no tengo disponibles.
    (salta a la siguiente línea) Para el producto solicitado(Solo muestra los PRODUCTO SOLICITADO NO DISPONIBLE que tiene OPCIONES PRODUCTO SOLICITADO. Si OPCIONES PRODUCTO SOLICITADO es "No disponible": saltar al siguiente producto, sin enviar el mensaje de este producto ): [cantidad x línea solicitada], tengo disponible:
    (salta a la siguiente línea) [OPCIONES PRODUCTO SOLICITADO con precio, enumeradas, cada opción en una línea diferente]
    (salta a la siguiente línea) ¿Deseas agregarlo?"

    Siguiente producto (cuando el cliente rechazó las opciones anteriores):
    "Ok, en vez de: [Solo muestra los PRODUCTO SOLICITADO NO DISPONIBLE que tiene OPCIONES PRODUCTO SOLICITADO. Si OPCIONES PRODUCTO SOLICITADO es "No disponible": saltar al siguiente producto, sin enviar el mensaje de este producto ): [cantidad x línea solicitada], tengo disponible:
    (salta a la siguiente línea) [OPCIONES PRODUCTO SOLICITADO con precio, enumeradas, cada opción en una línea diferente]
    (salta a la siguiente línea) ¿Deseas agregarlo?"

    Cuando el cliente acaba de agregar un producto, usa el formato:
    "confirma brevemente ("Ya lo agregué"), para: [Solo muestra los PRODUCTO SOLICITADO NO DISPONIBLE que tiene OPCIONES PRODUCTO SOLICITADO. Si OPCIONES PRODUCTO SOLICITADO es "No disponible": saltar al siguiente producto, sin enviar el mensaje de este producto ): [cantidad x línea solicitada], tengo disponible:
    (salta a la siguiente línea) [OPCIONES PRODUCTO SOLICITADO con precio, enumeradas, cada opción en una línea diferente]
    (salta a la siguiente línea) ¿Deseas agregarlo?"

    y continúa con el siguiente NO disponible.
    No uses frases de transición como "Entendido. Pasando al siguiente ítem".
    Sé flexible: si el cliente pregunta "¿por qué me ofreces este producto?" o "¿para qué sirve?", explícale con naturalidad por qué cumple la misma función del producto que pidió, y espera su decisión.
    Espera a que el usuario seleccione una opción o te diga que no desea ninguna.
    Repite esta acción por cada producto NO disponible de la COTIZACION INICIAL, hasta terminar con todos los productos NO disponibles de la COTIZACION INICIAL.

    REGLA ESTRICTA DE OMISIÓN: Si NO hay ningún producto en el catálogo que cumpla la MISMA función que el solicitado (ej. calculadoras científicas): PROHIBIDO ofrecer alternativas de otra categoría (NUNca ofrezcas un compás o algo que no sirva para lo mismo). NO envíes NINGÚN mensaje sobre ese producto, no digas que no lo tienes y pasa DIRECTAMENTE Y EN SILENCIO al siguiente producto NO disponible de la COTIZACION INICIAL (o al punto 4 si no queda ninguno).

    4) PRODUCTOS CON OPCIONES: Aplica la regla de UNA PREGUNTA A LA VEZ: 
    Selecciona los productos de la COTIZACIÓN INICIAL con valor unitario mayor que 0,00. 
    - REGLA ABSOLUTA DE COINCIDENCIA ÚNICA: Si el catálogo tiene **una sola opción disponible** que coincide con lo que pidió el cliente (sin importar si el texto tiene asteriscos, variaciones menores o palabras genéricas como "compás" o "corrector"), **agrégalo directamente al carrito en absoluto silencio**. PROHIBIDO preguntar "¿Deseas agregarlo?" o mostrar opciones. Pasa de inmediato y en silencio al siguiente producto.
    - Selecciona los productos que tengan MÁS DE UNA OPCIÓN real en el catálogo (por ejemplo: esfero azul y esfero negro). Solo en este caso, interactúa de forma natural siguiendo estos patrones:
    - Primer producto con más de una opción disponible: 
      "Tengo algunas opciones para: [cantidad x línea solicitada], 
      (salta a la siguiente línea) [opciones con precio, enumeradas, cada opción en una línea diferente]
      (salta a la siguiente línea) ¿Qué opción deseas?"
    - Siguiente producto (cuando el cliente rechazó las opciones anteriores): 
      "Ok, para: [cantidad x línea solicitada], tengo estas opciones: 
      (salta a la siguiente línea) [opciones con precio, enumeradas, cada opción en una línea diferente]
      (salta a la siguiente línea) ¿Qué opción deseas?"
    - Cuando el cliente acaba de agregar un producto, usa el formato:
      "confirma brevemente ("Ya lo agregué"), para: [cantidad x línea solicitada], tengo estas opciones:
      (salta a la siguiente línea) [opciones con precio, enumeradas, cada opción en una línea diferente]
      (salta a la siguiente línea) ¿Qué opción deseas?"  
      y continúa con el siguiente producto que tenga más de una opción.
    No uses frases de transición como "Entendido. Pasando al siguiente ítem".
    Repite esta acción por cada producto con más de una opción de la COTIZACION INICIAL, hasta terminar con todos los productos con más de una opción de la COTIZACION INICIAL.
  5) OFERTA PROACTIVA: Una vez terminada la revisión de la lista, indícale que terminamos de revisar los productos de la lista.
  y pregúntale si desea algo más? repite en varias ocasiones, hasta que el cliente indique que ya no desea agregar nada más, continua con ACCESORIOS.
  6) ACCESORIOS
  7) Género de la lista (SOLO si hubo LISTA DE ÚTILES; con productos sueltos se omite)
  8) ENTREGA
  9) COTIZACION SEGUNDARIA: Envia automáticamente la COTIZACION SEGUNDARIA en este paso 9) COTIZACION SEGUNDARIA ó cuando el cliente solicite la cotizacion: marca "recibir_lista" como true. 
    La cotización secundaria incluye TODOS los ítems de la LISTA DE ÚTILES, incluso los que no tengan coincidencia en el catálogo: muestra el texto EXACTO que escribió el cliente en "producto solicitado" y 
    en "Producto" pon lo que el cliente seleccionó en el punto 3) OPCIONES PRODUCTOS NO DISPONIBLE y en el punto 4) PRODUCTOS CON OPCIONES, Si el cliente no seleccionó nada, en un producto del punto 4) PRODUCTOS CON OPCIONES pon el producto con MEJOR coincidencia del catalogo. 
    Para TODOS LOS DEMAS productos (son los productos que el cliente dijo que no desea agregar en el punto 3) OPCIONES PRODUCTOS NO DISPONIBLE y que no tengan coincidencia en el catálogo) pon "No disponible" con precio 0.00. 
    En cantidad de producto, siempre pon la cantidad que el cliente solicitó en la lista original, no cambies la cantidad nunca.
    Si el cliente agrego productos adicionales que no estaban en la lista original, inclúyelos también en la cotización secundaria, con su cantidad y precio exacto al final de la lista solicitada, pon un subtema "Productos adicionales" y en la columna "producto solicitado" pon el texto EXACTO que escribió el cliente para ese producto, y en la columna "Producto" pon el texto del catalogo seleccionado, incluyendo la cantidad, y asignando el precio del catálogo. 
    Pon en "Producto solicitado" exactamente el texto de la LISTA DE ÚTILES, deben estar todos los items de la LISTA DE ÚTILES,  con la cantidad exacta solicita en la LISTA DE ÚTILES. Si hay productos agregados que no pertenecen a la LISTA DE ÚTILES, agrega abajo de todos los items de la LISTA DE ÚTILES un subtema "Productos adicionales" para agregar los productos adicionales.
      
    El SISTEMA (no tú) construye la imagen directamente desde el texto de la lista del cliente, sin agrupar: una fila por cada línea solicitada (columna "Descripción solicitada" con el texto EXACTO del cliente, columna "Producto" con el texto del catalogo seleccionado por el cliente o la MEJOR coincidencia del catalogo, incluyendo la cantidad, "Cantidad" con el número inicial de la línea y centrado), asignando el precio del catálogo. Tú NO construyes esa imagen: solo devuelve en "carrito" el pedido COMPLETO (con "linea" = texto EXACTO que escribió el cliente tal cual, INCLUYENDO la cantidad, ej. "1 masking grueso", y "cantidad" = exactamente la cantidad que pidió) para que la revisión posterior no pierda ningún ítem. Si la lista llegó como FOTO, léela completa y aplica la misma regla: el "carrito" debe incluir CADA ítem visible en la foto, para que la cotización secundaria no omita nada. NUNCA agrupes líneas distintas aunque parezcan parecidas (por ejemplo "1 masking grueso" y "1 masking delgado" son DOS filas separadas) ni modifiques cantidades.
    En la cabecera de la cotización adjunta la información de Género de la lista y ENTREGA. (si el cliente no indicó Género de la lista ni ENTREGA, no incluyas esa información en la cabecera de la cotización)
    marca "pedido_finalizado" como true, envia la cotización automaticamente y envía el mensaje de CONFIRMACIÓN.
  10) CONFIRMACIÓN
  11) COBRO
  12) VERIFICACIÓN DE COMPROBANTE
  - NO TE REPITAS: si ya enviaste la cotización, el catálogo o una foto en este chat y el cliente no cambió su pedido, el sistema no los vuelve a enviar; tampoco repitas el mismo mensaje. Cuando el sistema acaba de enviar el mensaje de recibido de la lista y la imagen de la cotización, no saludes ni resumas lo que el sistema ya dijo: comienza directo con la siguiente pregunta de la revisión. Si el cliente insiste o repite la misma pregunta, responde distinto y pregúntale concretamente qué necesita. No vuelvas a ofrecer un producto que el cliente ya rechazó.

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
        await maybeClose(from, session);
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
    if (botGuard && isBotCooling(session)) {
      log(`[bot] ${from} en cooldown, mensaje ignorado`);
      return;
    }
    session.businessFrom = msg.businessFrom || session.businessFrom;

    if (botGuard && msg.type === 'text') {
      const earlyText = String(msg.text || '').trim();
      if (earlyText) {
        const earlyT = normalize(earlyText);
        const sig = updateBotSignals(session, earlyT);
        if (sig.added > 0) log(`[bot] ${from} score=${sig.score} +${sig.added} (${sig.reasons.join(',')})`);
        if (session.challenged) {
          if (earlyText === BOT_CHALLENGE_ANSWER) {
            session.challenged = false;
            session.challengeFails = 0;
            session.botScore = 0;
            session.degraded = false;
            session.degradedNotified = false;
            session.msgTimes = [];
            session.lastTexts = [];
            log(`[bot] ${from} pasó el desafío humano`);
          } else {
            session.challengeFails = (session.challengeFails || 0) + 1;
            if (session.challengeFails >= 2) {
              session.botCoolUntil = Date.now() + botCooldownMs();
              session.challenged = false;
              log(`[bot] ${from} no pasó el desafío, cooldown`);
              await sendText(from, BOT_COOLDOWN_MSG, session.businessFrom);
              return;
            }
            await sendText(from, BOT_CHALLENGE_MSG, session.businessFrom);
            return;
          }
        } else if (session.botScore >= botThreshold()) {
          session.challenged = true;
          session.challengeFails = 0;
          log(`[bot] ${from} supera umbral, pido desafío`);
          await sendText(from, BOT_CHALLENGE_MSG, session.businessFrom);
          return;
        } else if (session.degraded && !session.degradedNotified) {
          session.degradedNotified = true;
          await sendText(from, BOT_DEGRADED_NOTE, session.businessFrom);
        }
      }
    }
    resetTimer(from, session);

    if (!session.greeted) {
      session.greeted = true;
      if (session.demoMode) {
        session.state = STATES.SALUDO;
        await sendText(from, SALUDO_REPLY, session.businessFrom);
        return;
      }
      session.state = STATES.SERVICIOS;
      if (msg.type === 'text' && String(msg.text || '').trim()) {
        return handleServicios(from, session, String(msg.text).trim(), normalize(String(msg.text).trim()));
      }
      await sendText(from, SERVICIOS_REPLY, session.businessFrom);
      return;
    }

    if (msg.type === 'image') {
      if (session.state === STATES.SERVICIOS) {
        await sendText(from, SERVICIOS_SOLO_TEXTO, session.businessFrom);
        return;
      }
      if (aiAllowed(session) && (session.state === STATES.IA_CHAT || session.state === STATES.SALUDO || session.state === STATES.IA_CONFIRMA_PEDIDO)) {
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
      if (session.state === STATES.SERVICIOS) {
        await sendText(from, SERVICIOS_SOLO_TEXTO, session.businessFrom);
        return;
      }
      if (aiAllowed(session) && (session.state === STATES.IA_CHAT || session.state === STATES.SALUDO || session.state === STATES.IA_CONFIRMA_PEDIDO)) {
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
        await maybeClose(from, session);
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

    if (session.demoMode && EXIT_DEMO_RE.test(t)) {
      log(`[utiles] ${from} pidió salir de la demo`);
      return exitDemo(from, session);
    }

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
    if (
      session.demoMode &&
      session.state !== STATES.SERVICIOS &&
      session.state !== STATES.ESPERA_COMPROBANTE &&
      session.state !== STATES.ESPERA_CONFIRMACION_RECIBO &&
      session.state !== STATES.PICKUP_AGENDA &&
      session.state !== STATES.ASESOR &&
      t !== '2' &&
      isServiceRequest(t)
    ) {
      log(`[utiles] ${from} pidió servicios en la demo, continúa con la venta de chatbots`);
      return startChatbot(from, session);
    }

    if (session.state === STATES.SERVICIOS) {
      return handleServicios(from, session, text, t);
    }

    if (aiAllowed(session) && session.state === STATES.IA_CHAT) {
      return handleIa(from, session, { type: 'text', text });
    }

    if (session.state !== STATES.ESPERA_COMPROBANTE && session.state !== STATES.ASESOR && session.state !== STATES.RESOLVER_LISTA && session.state !== STATES.IA_CONFIRMA_PEDIDO && isCatalogRequest(t)) {
      await ensureProducts();
      if (!session.degraded) await sendCatalogoImage(from, session);
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
      case STATES.SERVICIOS:
        return handleServicios(from, session, text, t);
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
    try {
      for (const [, s] of sessions.entries()) {
        if (s?.timer) try { clearTimeout(s.timer); } catch {}
      }
    } catch {}
    try {
      if (typeof sessions.close === 'function') sessions.close();
      else sessions.clear();
    } catch {
      try { sessions.clear(); } catch {}
    }
  }

  function persist(from) {
    try {
      const s = sessions.get(from);
      if (!s) return;
      if (typeof sessions.touch === 'function') sessions.touch(from);
      else sessions.set(from, s);
    } catch {}
  }

  async function handleMessageWrapped(from, msg) {
    try {
      return await handleMessage(from, msg);
    } finally {
      persist(from);
    }
  }

  return {
    handleMessage: handleMessageWrapped,
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