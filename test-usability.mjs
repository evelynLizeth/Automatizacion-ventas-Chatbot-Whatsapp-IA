import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { loadWorkbook, getLaptops, getAuthorizedPhones, isAuthorized, normalize } from './lib/excel.js';
import { generateReply, isActivationMessage, isDeactivationMessage } from './lib/search.js';
import { getUtilesProducts, getUtilesSheet, findItems, matchListLines, parseItemList, buildPriceImage, buildCatalogoImage, catalogoText, formatPrice, parseFile, findProductImage } from './lib/utiles.js';
import { createUtilesStore } from './lib/store.js';
import { buildCatalogContext } from './lib/ai.js';

const EXCEL_PATH = process.env.EXCEL_PATH || './Laptops.xlsx';
const wb = await loadWorkbook(EXCEL_PATH);
const laptops = getLaptops(wb.getWorksheet('Laptos'));
const phones = getAuthorizedPhones(wb.getWorksheet('Autorizacion'));

const disponibles = laptops.filter((l) => normalize(l.estado) === 'disponible').length;
const arrendados = laptops.filter((l) => normalize(l.estado) === 'arrendado').length;
const sinSerial = laptops.filter((l) => normalize(l.serial) === '').length;

function check(query, label, fn) {
  test(`${label} (consulta: "${query}")`, () => {
    const reply = generateReply(query, laptops);
    console.log(`\n[consulta] "${query}"\n${reply}`);
    fn(reply);
  });
}

const hallazgos = [];

test('datos cargados del Excel', () => {
  assert.ok(laptops.length >= 1, 'debería haber equipos en la hoja Laptos');
  assert.ok(phones.length >= 1, 'debería haber números en la hoja Autorizacion');
});

check('equipos disponibles', 'intent disponible', (r) => {
  assert.match(r, /^Equipos disponibles \(\d+\):/);
  assert.ok(r.includes(`Equipos disponibles (${disponibles}):`));
  assert.ok(r.includes('PF2Z5CQE'));
});

check('equipos arrendados', 'intent arrendado', (r) => {
  assert.match(r, /^Equipos arrendados \(\d+\):/);
  assert.ok(r.includes(`Equipos arrendados (${arrendados}):`));
  assert.ok(r.includes('Tetrapack'));
});

check('cuantos equipos hay', 'intent inventario (frase)', (r) => {
  assert.ok(r.includes('Inventario actual:'));
  assert.ok(r.includes(`Disponibles: ${disponibles}`));
  assert.ok(r.includes(`Arrendados: ${arrendados}`));
  assert.ok(r.includes(`Total: ${laptops.length}`));
});

check('inventario', 'intent inventario (palabra clave)', (r) => {
  assert.ok(r.includes('Inventario actual:'));
  assert.ok(r.includes(`Total: ${laptops.length}`));
});

check('serial 7D9J4M3', 'serial con palabra "serial"', (r) => {
  assert.ok(r.includes('Resultado para serial 7D9J4M3:'));
  assert.ok(r.includes('Dell Latitude 5420'));
  assert.ok(r.includes('Mondeles'));
});

check('7D9J4M3', 'serial suelto', (r) => {
  assert.ok(r.includes('Resultado para serial 7D9J4M3:'));
  assert.ok(r.includes('Jose Becera'));
});

check('68SRN73', 'serial suelto (2)', (r) => {
  assert.ok(r.includes('Resultado para serial 68SRN73:'));
  assert.ok(r.includes('Luis Ceron'));
});

check('que equipo no tiene registrado el serial', 'intent sin serial', (r) => {
  assert.ok(r.includes(`Equipos sin serial registrado (${sinSerial}):`));
  assert.ok(r.includes('Lenovo Thinkpad'));
});

check('equipos sin serial', 'intent sin serial (variante)', (r) => {
  assert.ok(r.includes(`Equipos sin serial registrado (${sinSerial}):`));
});

check('codigo 8', 'código de 1 dígito', (r) => {
  assert.ok(r.includes('Resultado para codigo 8:'));
  assert.ok(r.includes('Dell Latitude 5420'));
});

check('codigo 13', 'código de 2 dígitos', (r) => {
  assert.ok(r.includes('Resultado para codigo 13:'));
  assert.ok(r.includes('Lenovo Thinkpad 20S1SCG100'));
});

check('empresa Tetrapack', 'búsqueda por empresa', (r) => {
  assert.ok(r.includes('Lenovo 20X6501R00'));
  assert.ok(r.includes('Tetrapack'));
});

check('usuario Luis Ceron', 'búsqueda por usuario', (r) => {
  assert.ok(r.includes('Dell Latitude 5410'));
  assert.ok(r.includes('Luis Ceron'));
});

check('modelo Dell Latitude 5410', 'búsqueda por modelo', (r) => {
  assert.match(r, /^Encontre \d+ coincidencia/);
  assert.ok(r.includes('Dell Latitude 5410'));
});

check('caracteristicas 16gb', 'búsqueda por características', (r) => {
  assert.match(r, /^Encontre \d+ coincidencia/);
  assert.ok(r.includes('16Gb ram'));
});

check('estado disponible', 'búsqueda por estado', (r) => {
  assert.ok(r.includes(`Equipos disponibles (${disponibles}):`));
});

check('dell', 'búsqueda por marca', (r) => {
  assert.match(r, /^Encontre \d+ coincidencia/);
  assert.ok(r.includes('Dell 3420'));
  assert.ok(r.includes('coincidencia(s)'));
});

check('mercado libre', 'búsqueda por empresa', (r) => {
  assert.match(r, /^Encontre \d+ coincidencia/);
  assert.ok(r.includes('Mercado libre'));
  assert.ok(r.includes('Juan Sebastian Reyes'));
});

check('Luis Ceron', 'búsqueda por usuario', (r) => {
  assert.match(r, /^Encontre \d+ coincidencia/);
  assert.ok(r.includes('Luis Ceron'));
  assert.ok(r.includes('Cengage'));
});

check('¿CÚANTOS EQUIPOS HAY?', 'normalización mayúsculas/acentos', (r) => {
  assert.ok(r.includes('Inventario actual:'));
  assert.ok(r.includes(`Total: ${laptops.length}`));
});

check('xyzxyz qwerty', 'texto sin coincidencias', (r) => {
  assert.ok(r.includes('No encontre informacion sobre eso'));
});

check('', 'texto vacío', (r) => {
  assert.ok(r.includes('Puedo ayudarte'));
});

check('hola', 'saludo muestra ayuda', (r) => {
  assert.ok(r.includes('Puedo ayudarte'));
});

check('equipos disponibles y arrendados', 'intent mixto lista ambos', (r) => {
  assert.ok(r.includes(`Equipos disponibles (${disponibles}):`));
  assert.ok(r.includes(`Equipos arrendados (${arrendados}):`));
});

check('lenovo', 'marca encuentra todos (incluye disponibles)', (r) => {
  assert.ok(r.includes('Lenovo 20X6501R00'));
  assert.ok(r.includes('PF2Z5CQE'));
});

test('autorización — número exacto', () => {
  assert.equal(isAuthorized('593987695938', phones), true);
});

test('autorización — sufijo de 9 dígitos', () => {
  assert.equal(isAuthorized('987695938', phones), true);
});

test('autorización — con formato +593', () => {
  assert.equal(isAuthorized('+593 98 769 5938', phones), true);
});

test('autorización — segundo número exacto', () => {
  assert.equal(isAuthorized('593995844888', phones), true);
});

test('autorización — 8 dígitos con cero inicial no coincide', () => {
  assert.equal(isAuthorized('09544888', phones), false);
});

test('autorización — sufijo de 7 dígitos no coincide', () => {
  assert.equal(isAuthorized('9954488', phones), false);
});

test('autorización — menos de 7 dígitos rechazado', () => {
  assert.equal(isAuthorized('12345', phones), false);
});

test('autorización — número no listado rechazado', () => {
  assert.equal(isAuthorized('999999999', phones), false);
});

test('activación — "Hola Bot"', () => {
  assert.equal(isActivationMessage('Hola Bot'), true);
});

test('activación — minúsculas "hola bot"', () => {
  assert.equal(isActivationMessage('hola bot'), true);
});

test('activación — frase que contiene "hola bot"', () => {
  assert.equal(isActivationMessage('hola bot, buenos dias'), true);
});

test('activación — "hola" solo no activa', () => {
  assert.equal(isActivationMessage('hola'), false);
});

test('activación — consulta normal no activa', () => {
  assert.equal(isActivationMessage('equipos disponibles'), false);
  assert.equal(isActivationMessage('cuantos equipos hay'), false);
});

test('desactivación — "chao bot"', () => {
  assert.equal(isDeactivationMessage('chao bot'), true);
});

test('desactivación — mayúsculas "CHAO BOT!"', () => {
  assert.equal(isDeactivationMessage('CHAO BOT!'), true);
});

test('desactivación — "chao" solo no desactiva', () => {
  assert.equal(isDeactivationMessage('chao'), false);
});

test('desactivación — "hola bot" no desactiva', () => {
  assert.equal(isDeactivationMessage('hola bot'), false);
});

// ===== FLUJO DE ÚTILES ESCOLARES =====

const UWB = await loadWorkbook('./UtilesEscolares.xlsx');
const utiles = getUtilesProducts(getUtilesSheet(UWB));

function makeXlsx(lines) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  for (const l of lines) ws.addRow([l]);
  return wb.xlsx.writeBuffer();
}

test('útiles — catálogo cargado con número de producto', () => {
  assert.ok(utiles.length >= 57, `el catálogo debe tener al menos 57 productos (actual: ${utiles.length})`);
  utiles.forEach((p, i) => assert.equal(p.numero, i + 1));
  const goma = utiles.find((p) => normalize(p.producto).includes('goma en barra bester 8 g'));
  assert.ok(goma, 'debería existir Goma en Barra Bester 8 g');
  assert.equal(goma.precio, 0.56);
});

test('útiles — findItems encuentra "goma en barra"', () => {
  const hits = findItems('goma en barra', utiles);
  assert.ok(hits.length >= 2);
  assert.ok(normalize(hits[0].producto).includes('goma en barra'));
});

test('útiles — findItems sin resultados', () => {
  assert.equal(findItems('xyzxyz qwerty', utiles).length, 0);
});

test('útiles — findItems "caja de 12 lapices" elige la Caja de 12', () => {
  const hits = findItems('caja de 12 lapices', utiles);
  assert.ok(normalize(hits[0].producto).includes('staedtler tradition hb'));
});

test('útiles — findItems elige Pintura Jumbo para pinturas', () => {
  for (const q of ['caja de pinturas triangulares', 'pinturas triangulares gigantes', 'pinturas', 'pinturas jumbo']) {
    const hits = findItems(q, utiles);
    assert.ok(hits.length >= 1, `${q} debería encontrar algo`);
    assert.ok(normalize(hits[0].producto).includes('pintura jumbo triangulare'), `${q} -> ${hits[0].producto}`);
  }
  assert.equal(findItems('caja de pinturas triangulares', utiles)[0].precio, 7.2);
});

test('útiles — findItems no confunde pinturas con la Caja de lápices', () => {
  const hits = findItems('caja de pinturas triangulares', utiles);
  assert.ok(!normalize(hits[0].producto).includes('caja de 12 lapices'));
});

test('útiles — findItems elige Regla y no el Juego Geométrico', () => {
  const hits = findItems('regla de 30 cm', utiles);
  assert.ok(hits.length >= 1, 'debería haber resultados');
  assert.ok(normalize(hits[0].producto).includes('regla plastica'), `-> ${hits[0].producto}`);
});

test('útiles — findItems no cotiza "unidades" suelta', () => {
  assert.equal(findItems('unidades', utiles).length, 0);
});

test('útiles — findItems no confunde "ya te envié el pdf" con cinta', () => {
  assert.deepEqual(findItems('si ya te envié el pdf', utiles), []);
});

test('útiles — parseItemList limpia bullets y numeración', () => {
  const lines = parseItemList('- goma\n2. lapiz\n• borrador\n');
  assert.deepEqual(lines, ['goma', 'lapiz', 'borrador']);
});

test('útiles — formatPrice', () => {
  assert.equal(formatPrice(1.58), '$1.58');
  assert.equal(formatPrice(0.4), '$0.40');
  assert.equal(formatPrice(null), 'No disponible');
});

test('útiles — buildPriceImage genera PNG', async () => {
  const png = await buildPriceImage([
    { nombre: 'Goma en Barra Bester 8 g', precio: 0.56, qty: 2 },
    { nombre: 'Producto inexistente', precio: null, qty: 1 },
  ]);
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
});

test('útiles — buildPriceImage con cabeceras y entrega genera PNG', async () => {
  const png = await buildPriceImage(
    [{ nombre: 'Goma en Barra Bester 8 g', precio: 0.56, qty: 2 }],
    { headers: ['Unidad Educativa San José', 'Grado: 5to'], entrega: { direccion: 'Av 5 de Junio', diaHora: 'mañana', nombre: 'Juan' } }
  );
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
});

test('útiles — buildCatalogoImage genera PNG de todo el catálogo', async () => {
  const png = await buildCatalogoImage(utiles);
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
});

test('útiles — catalogoText numera los productos', () => {
  const parts = catalogoText(utiles);
  assert.ok(parts.length >= 1);
  const first = parts[0];
  assert.ok(first.includes('1. '));
  assert.ok(normalize(first).includes('barras de silicona'));
  assert.ok(first.includes('separados por coma'));
});

test('útiles — parseFile lee xlsx desde buffer', async () => {
  const buf = await makeXlsx(['Goma en barra', 'Borrador blanco de queso Bester']);
  const lines = await parseFile(Buffer.from(buf), 'lista.xlsx');
  assert.ok(lines.length >= 2);
  assert.ok(lines.some((l) => l.includes('Goma')));
});

test('útiles — matchListLines separa cabecera, productos y omite dirección/libros', () => {
  const { headers, items } = matchListLines(
    ['Unidad Educativa San José', 'Grado: 5to Paralelo A', 'goma en barra', 'borrador', 'xyzfoo', 'Dirección: Av 5 de Junio', 'Libro de lectura'],
    utiles
  );
  assert.deepEqual(headers, ['Unidad Educativa San José', 'Grado: 5to Paralelo A']);
  assert.ok(items.some((it) => it.nombre === 'goma en barra' && it.precio != null));
  assert.ok(items.some((it) => it.nombre === 'borrador' && it.precio != null));
  assert.ok(!items.some((it) => it.nombre === 'xyzfoo'), 'xyzfoo no pertenece a útiles y debe descartarse');
  assert.ok(!items.some((it) => /Dirección|Libro/.test(it.nombre)));
});

test('útiles — matchListLines omite el pie de página', () => {
  const { headers, items } = matchListLines(
    ['Unidad Educativa X', 'goma en barra', 'Fecha de entrega: 3 de marzo', 'Firma del docente', 'Recuerde presentar la lista'],
    utiles
  );
  assert.deepEqual(headers, ['Unidad Educativa X']);
  assert.equal(items.length, 1);
  assert.ok(items[0].nombre === 'goma en barra');
  assert.ok(!items.some((it) => /Fecha|Firma|Recuerde/.test(it.nombre)));
});

test('útiles — matchListLines conserva el orden del documento', () => {
  const { items } = matchListLines(['borrador', 'goma en barra', 'cartuchera', 'xyzfoo'], utiles);
  assert.equal(items.length, 3);
  assert.ok(items[0].nombre === 'borrador');
  assert.ok(items[1].nombre === 'goma en barra');
  assert.ok(items[2].nombre === 'cartuchera');
  assert.ok(!items.some((it) => it.nombre === 'xyzfoo'));
});

test('útiles — cabecera solo curso/grado y unidad educativa/escuela/colegio', () => {
  const { headers, items } = matchListLines(
    ['Lista de útiles 2025', 'Unidad Educativa San José', 'Nombre del estudiante: Juan Pérez', 'Grado: 5to', 'goma en barra'],
    utiles
  );
  assert.deepEqual(headers, ['Unidad Educativa San José', 'Grado: 5to']);
  assert.equal(items.length, 1);
  assert.ok(items[0].nombre === 'goma en barra');
});

test('útiles — ítems fuera del catálogo van como No disponible', () => {
  const { items } = matchListLines(['escoba', 'cepillo dental'], utiles);
  assert.equal(items.length, 2);
  for (const it of items) assert.equal(it.precio, null);
});

test('útiles — uniforme se omite de la cotización', () => {
  const { headers, items } = matchListLines(['Unidad Educativa X', 'uniforme escolar', 'goma en barra'], utiles);
  assert.deepEqual(headers, ['Unidad Educativa X']);
  assert.equal(items.length, 1);
  assert.ok(!items.some((it) => /uniforme/i.test(it.nombre)));
});

test('útiles — juego geométrico por nombre se cotiza con precio', () => {
  const { items } = matchListLines(['juego geometrico'], utiles);
  assert.equal(items.length, 1);
  assert.equal(items[0].nombre, 'juego geometrico');
  assert.ok(normalize(items[0].producto).includes('juego geometrico'));
  assert.notEqual(items[0].precio, null);
});

test('útiles — matchListLines fusiona la línea partida "12" + "unidades)"', () => {
  const { items } = matchListLines(['1 caja de pinturas triangulares gigantes 12', 'unidades)'], utiles);
  assert.equal(items.length, 1);
  assert.equal(items[0].nombre, '1 caja de pinturas triangulares gigantes 12 unidades)');
  assert.equal(items[0].precio, 7.2);
  assert.ok(normalize(items[0].producto).includes('pintura jumbo triangulare'));
});

test('útiles — matchListLines descarta "unidades)" huérfana', () => {
  const { items } = matchListLines(['unidades)'], utiles);
  assert.equal(items.length, 0);
});

const stores = [];
function makeStore(opts = {}) {
  const sent = [];
  const store = createUtilesStore({
    getProducts: async () => utiles,
    sendText: async (to, body) => sent.push({ to, body }),
    sendImage: async (to, buffer) => sent.push({ to, image: buffer }),
    log: () => {},
    ...opts,
  });
  stores.push(store);
  return { store, sent };
}

function makeIaStore(reply) {
  return makeStore({
    ai: {
      isAiEnabled: () => true,
      buildCatalogContext,
      askGemini: async () => reply,
    },
  });
}

function makeIaCaptureStore(reply) {
  const sent = [];
  const last = { system: null, history: null };
  const store = createUtilesStore({
    getProducts: async () => utiles,
    sendText: async (to, body) => sent.push({ to, body }),
    sendImage: async (to, buffer) => sent.push({ to, image: buffer }),
    log: () => {},
    ai: {
      isAiEnabled: () => true,
      buildCatalogContext,
      askGemini: async (system, history) => {
        last.system = system;
        last.history = history;
        return reply;
      },
    },
  });
  stores.push(store);
  return { store, sent, last };
}

function makeIaReceiptStore(reply, receiptReply) {
  const sent = [];
  const store = createUtilesStore({
    getProducts: async () => utiles,
    sendText: async (to, body) => sent.push({ to, body }),
    sendImage: async (to, buffer) => sent.push({ to, image: buffer }),
    log: () => {},
    ai: {
      isAiEnabled: () => true,
      buildCatalogContext,
      askGemini: async () => reply,
      askGeminiReceipt: async (system, image, mimeType) => receiptReply,
    },
  });
  stores.push(store);
  return { store, sent };
}

function hoy() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function fechaHoy() {
  const m = hoy().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

test('útiles — saludo inicial muestra las 3 opciones (sin catálogo, sin asesor)', async () => {
  const { store, sent } = makeStore();
  await store.handleMessage('59399990001', { type: 'text', text: 'hola' });
  const body = sent.find((m) => m.body).body;
  assert.ok(body.includes('Realizar una cotización de útiles escolares'));
  assert.ok(body.includes('Comunicarme con Evelyn'));
  assert.ok(body.includes('Solicitar un Chatbot Inteligente para mi negocio'));
  assert.ok(!body.includes('Ver los útiles escolares que tienes disponibles'), 'el catálogo ya no debe mostrarse en el saludo');
  assert.ok(!body.includes('que la cotice un asesor'), 'la opción del asesor ya no debe mostrarse');
  assert.equal(store.getState('59399990001'), 'SALUDO');
});

test('útiles — opción 3: chatbot, recolecta requerimientos, resumen y cierre', async () => {
  const { store, sent } = makeStore();
  const from = '59399990150';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  assert.equal(store.getState(from), 'CHATBOT');
  assert.ok(sent[sent.length - 1].body.includes('nombre de tu negocio'), 'debe arrancar con la primera pregunta');
  await store.handleMessage(from, { type: 'text', text: 'Mi papelería El Estudiante, venta de útiles' });
  await store.handleMessage(from, { type: 'text', text: 'cuadernos, mochilas y uniformes' });
  await store.handleMessage(from, { type: 'text', text: 'WhatsApp e Instagram' });
  await store.handleMessage(from, { type: 'text', text: 'responder dudas frecuentes y cotizaciones' });
  await store.handleMessage(from, { type: 'text', text: 'unos 30 mensajes al día' });
  await store.handleMessage(from, { type: 'text', text: 'sí, tengo un catálogo en Excel' });
  await store.handleMessage(from, { type: 'text', text: 'no por ahora, atendemos en español' });
  await store.handleMessage(from, { type: 'text', text: 'María, en la tarde' });
  assert.equal(store.getState(from), 'CHATBOT_CONFIRMA');
  const summary = sent.filter((m) => m.body).pop().body;
  assert.ok(summary.includes('RESUMEN DE TUS REQUERIMIENTOS'), 'debe enviar el resumen');
  assert.ok(summary.includes('Mi papelería El Estudiante'), 'debe incluir la respuesta del negocio');
  assert.ok(summary.includes('María, en la tarde'), 'debe incluir la respuesta de contacto');
  assert.ok(summary.includes('¿Estás de acuerdo'), 'debe pedir la aprobación');
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.ok(sent.some((m) => m.body && m.body.includes('asesor se pondrá en contacto')), 'debe avisar del contacto del asesor');
  assert.equal(store.getState(from), undefined, 'la sesión debe cerrarse');
});

test('útiles — opción 3: se pueden corregir los campos del resumen', async () => {
  const { store, sent } = makeStore();
  const from = '59399990151';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'Mi negocio' });
  await store.handleMessage(from, { type: 'text', text: 'productos' });
  await store.handleMessage(from, { type: 'text', text: 'WhatsApp' });
  await store.handleMessage(from, { type: 'text', text: 'ventas' });
  await store.handleMessage(from, { type: 'text', text: 'pocas' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: 'Pedro' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.equal(store.getState(from), 'CHATBOT_EDITAR');
  const list = sent.filter((m) => m.body).pop().body;
  assert.ok(list.includes('Canales de atención actuales'), 'debe listar los campos');
  await store.handleMessage(from, { type: 'text', text: '3' });
  assert.ok(sent[sent.length - 1].body.includes('nuevo valor para «Canales de atención actuales»'), 'debe pedir el nuevo valor');
  await store.handleMessage(from, { type: 'text', text: 'Instagram y TikTok' });
  assert.equal(store.getState(from), 'CHATBOT_CONFIRMA');
  const summary = sent.filter((m) => m.body).pop().body;
  assert.ok(summary.includes('Instagram y TikTok'), 'el resumen debe reflejar el campo corregido');
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.equal(store.getState(from), undefined);
});

test('útiles — "quiero un chatbot" en texto libre arranca el flujo', async () => {
  const { store, sent } = makeStore();
  const from = '59399990152';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'quiero un chatbot para mi negocio' });
  assert.equal(store.getState(from), 'CHATBOT');
  assert.ok(sent[sent.length - 1].body.includes('nombre de tu negocio'));
});

test('útiles IA — opción 3 (chatbot) arranca el flujo sin pasar por Gemini', async () => {
  const { store, sent } = makeIaStore({ reply: 'no debería usarse' });
  const from = '59399990153';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  assert.equal(store.getState(from), 'CHATBOT');
  assert.ok(sent[sent.length - 1].body.includes('nombre de tu negocio'), 'debe preguntar sin usar la IA');
});

test('útiles — "no" en saludo pasa el chat a Evelyn y el bot queda en silencio', async () => {
  const { store, sent } = makeStore();
  const from = '59399990004';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  const last = sent[sent.length - 1].body;
  assert.ok(last.includes('Evelyn chateará contigo'), 'debe indicar que Evelyn toma la conversación');
  assert.equal(store.getState(from), 'DESACTIVADO');
  const count = sent.length;
  await store.handleMessage(from, { type: 'text', text: 'necesito ayuda' });
  assert.equal(sent.length, count, 'el bot no debe responder más mensajes');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(sent.length, count, 'el bot no debe responder más mensajes');
});

test('útiles IA — "no" en saludo también pasa el chat a Evelyn y queda en silencio', async () => {
  const { store, sent } = makeIaStore({ reply: 'no debería usarse' });
  const from = '59399990131';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  const last = sent[sent.length - 1].body;
  assert.ok(last.includes('Evelyn chateará contigo'), 'debe indicar que Evelyn toma la conversación');
  assert.equal(store.getState(from), 'DESACTIVADO');
  const count = sent.length;
  await store.handleMessage(from, { type: 'text', text: 'hola, necesito una mochila' });
  assert.equal(sent.length, count, 'el bot no debe responder más mensajes');
});

test('útiles — "necesito comunicarme con Evelyn" pasa el chat a Evelyn y queda en silencio', async () => {
  const { store, sent } = makeStore();
  const from = '59399990051';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'Necesito comunicarme con Evelyn' });
  const last = sent[sent.length - 1].body;
  assert.ok(last.includes('Evelyn chateará contigo'), 'debe indicar que Evelyn toma la conversación');
  assert.equal(store.getState(from), 'DESACTIVADO');
  const count = sent.length;
  await store.handleMessage(from, { type: 'text', text: 'hola, seguimos?' });
  assert.equal(sent.length, count, 'el bot no debe responder más mensajes');
});

test('útiles — "quiero hablar con Evelyn" también pasa el chat a Evelyn', async () => {
  const { store, sent } = makeStore();
  const from = '59399990052';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'quiero hablar con Evelyn' });
  assert.ok(sent[sent.length - 1].body.includes('Evelyn chateará contigo'));
  assert.equal(store.getState(from), 'DESACTIVADO');
});

test('útiles — "quién es Evelyn" NO pasa el chat a Evelyn (sigue en saludo)', async () => {
  const { store, sent } = makeStore();
  const from = '59399990053';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'quién es Evelyn' });
  assert.equal(store.getState(from), 'SALUDO', 'no debe activarse el modo silencio');
  assert.ok(!sent.some((m) => m.body && m.body.includes('Evelyn chateará contigo')));
});

test('útiles — el catálogo se carga en memoria solo al entrar al flujo (opción 1)', async () => {
  let calls = 0;
  const sent = [];
  const store = createUtilesStore({
    getProducts: async () => { calls += 1; return utiles; },
    sendText: async (to, body) => sent.push({ to, body }),
    sendImage: async () => {},
    log: () => {},
  });
  stores.push(store);
  const from = '59399990054';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  assert.equal(calls, 0, 'el saludo no debe cargar el catálogo');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(calls, 1, 'la opción 1 carga el catálogo una vez');
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  assert.equal(calls, 1, 'el catálogo ya está en memoria, no se recarga');
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — la opción 2 (Evelyn) y la palabra "asesor" no cargan el catálogo', async () => {
  let calls = 0;
  const store = createUtilesStore({
    getProducts: async () => { calls += 1; return utiles; },
    sendText: async () => {},
    sendImage: async () => {},
    log: () => {},
  });
  stores.push(store);
  await store.handleMessage('59399990055', { type: 'text', text: 'hola' });
  await store.handleMessage('59399990055', { type: 'text', text: '2' });
  assert.equal(calls, 0, 'la opción 2 no debe cargar el catálogo');
  assert.equal(store.getState('59399990055'), 'DESACTIVADO');

  await store.handleMessage('59399990056', { type: 'text', text: 'hola' });
  await store.handleMessage('59399990056', { type: 'text', text: 'asesor' });
  assert.equal(calls, 0, 'la palabra asesor no debe cargar el catálogo');
  assert.equal(store.getState('59399990056'), 'ASESOR');
});

test('útiles IA — "necesito comunicarme con Evelyn" también pasa el chat a Evelyn', async () => {
  const { store, sent } = makeIaStore({ reply: 'no debería usarse' });
  const from = '59399990132';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'necesito comunicarme con evelyn' });
  assert.ok(sent[sent.length - 1].body.includes('Evelyn chateará contigo'));
  assert.equal(store.getState(from), 'DESACTIVADO');
  const count = sent.length;
  await store.handleMessage(from, { type: 'text', text: 'quiero una mochila' });
  assert.equal(sent.length, count, 'el bot no debe responder más mensajes');
});

test('útiles — "catálogo" envía el catálogo y pide números', async () => {
  const { store, sent } = makeStore();
  const from = '59399990031';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  const img = sent.find((m) => m.image);
  assert.ok(img, 'debería enviar imagen del catálogo');
  assert.ok(sent[sent.length - 1].body.includes('separados por coma'));
  assert.equal(store.getState(from), 'NUMEROS');
});

test('útiles — números inválidos se re-preguntan', async () => {
  const { store, sent } = makeStore();
  const from = '59399990032';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: 'abc def' });
  assert.ok(sent[sent.length - 1].body.includes('No entendí los números'));
  assert.equal(store.getState(from), 'NUMEROS');
});

test('útiles — números válidos piden cantidad de cada uno y muestran el menú', async () => {
  const { store, sent } = makeStore();
  const from = '59399990033';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22,23' });
  assert.equal(store.getState(from), 'CANTIDAD');
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.equal(store.getState(from), 'CANTIDAD');
  await store.handleMessage(from, { type: 'text', text: '3' });
  const last = sent[sent.length - 1].body;
  assert.ok(last.includes('agregar algo más'));
  assert.ok(last.includes('eliminar algún producto'));
  assert.equal(store.getState(from), 'AGREGADO');
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, 2);
});

test('útiles — palabra "asesor": gracias desactiva', async () => {
  const { store, sent } = makeStore();
  const from = '59399990034';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'asesor' });
  assert.equal(store.getState(from), 'ASESOR');
  await store.handleMessage(from, { type: 'text', text: 'gracias' });
  assert.ok(sent[sent.length - 1].body.includes('en cuanto esté lista la cotización'));
  assert.equal(store.getState(from), undefined);
});

test('útiles — palabra "asesor": documento cierra la sesión', async () => {
  const { store, sent } = makeStore();
  const from = '59399990035';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'asesor' });
  await store.handleMessage(from, { type: 'document', data: Buffer.from('x'), filename: 'lista.pdf' });
  assert.ok(sent[sent.length - 1].body.includes('Un asesor revisará tu documento'));
  assert.equal(store.getState(from), undefined);
});

test('útiles — palabra "asesor": otro texto re-pregunta', async () => {
  const { store, sent } = makeStore();
  const from = '59399990036';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'asesor' });
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  assert.ok(sent[sent.length - 1].body.includes('Por favor sube tu documento'));
  assert.equal(store.getState(from), 'ASESOR');
});

test('útiles — producto único: "no" va al menú agregar/eliminar', async () => {
  const { store, sent } = makeStore();
  const from = '59399990037';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'caja de 12 lapices' });
  assert.ok(sent[sent.length - 1].body.includes('única opción'));
  assert.equal(store.getState(from), 'UNICO');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.ok(sent[sent.length - 1].body.includes('agregar algo más'));
  assert.equal(store.getState(from), 'AGREGADO');
});

test('útiles — producto único: "sí" pide cantidad', async () => {
  const { store, sent } = makeStore();
  const from = '59399990038';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'caja de 12 lapices' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'CANTIDAD');
  await store.handleMessage(from, { type: 'text', text: '2' });
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].qty, 2);
  assert.equal(store.getState(from), 'AGREGADO');
});

test('útiles — varias opciones incluyen "Ninguna" y llevan al menú', async () => {
  const { store, sent } = makeStore();
  const from = '59399990039';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra' });
  assert.ok(sent[sent.length - 1].body.includes('Ninguna'));
  assert.equal(store.getState(from), 'SELECCION');
  await store.handleMessage(from, { type: 'text', text: 'ninguna' });
  assert.ok(sent[sent.length - 1].body.includes('agregar algo más'));
  assert.equal(store.getState(from), 'AGREGADO');
});

test('útiles — eliminar un producto del pedido', async () => {
  const { store, sent } = makeStore();
  const from = '59399990040';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.equal(store.getState(from), 'AGREGADO');
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.ok(sent[sent.length - 1].body.includes('Tu pedido actual'));
  assert.equal(store.getState(from), 'ELIMINAR');
  const count0 = store.getSeleccion(from).length;
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.ok(sent[sent.length - 1].body.includes('eliminé'));
  assert.equal(store.getSeleccion(from).length, count0 - 1);
  assert.equal(store.getState(from), 'AGREGADO');
});

test('útiles — finalizar pedido pasa por sugerencia y confirma cotización', async () => {
  const { store, sent } = makeStore();
  const from = '59399990041';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  assert.equal(store.getState(from), 'SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.ok(sent.some((m) => m.image));
  assert.ok(sent[sent.length - 1].body.includes('Estás de acuerdo'));
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — "dame la cotización" envía la cotización', async () => {
  const { store, sent } = makeStore();
  const from = '59399990042';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: 'dame la cotización' });
  assert.ok(sent.some((m) => m.image));
  assert.ok(sent[sent.length - 1].body.includes('Estás de acuerdo'));
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — pedido por retiro: comprobante, viernes y despedida', async () => {
  const { store, sent } = makeStore();
  const from = '59399990043';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'GENERO');
  assert.ok(sent.some((m) => m.body && m.body.includes('niña')));
  await store.handleMessage(from, { type: 'text', text: 'niña' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  assert.ok(sent.some((m) => m.body && m.body.includes('50%')));
  await store.handleMessage(from, { type: 'image' });
  assert.ok(sent.some((m) => m.body && m.body.includes('Evelyn Lizeth Zambrano')));
  assert.equal(store.getState(from), 'ESPERA_CONFIRMACION_RECIBO');
  await store.handleMessage(from, { type: 'text', text: 'ok' });
  assert.ok(sent[sent.length - 1].body.includes('estará listo el día viernes'));
  assert.equal(store.getState(from), 'PICKUP_AGENDA');
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 9am' });
  assert.ok(sent[sent.length - 1].body.includes('nos vemos el viernes'));
  assert.equal(store.getState(from), undefined);
});

test('útiles — pedido con entrega a domicilio completa', async () => {
  const { store, sent } = makeStore();
  const from = '59399990044';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'niño' });
  assert.equal(store.getState(from), 'ENTREGA');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'UBICACION');
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  assert.equal(store.getState(from), 'DIA_HORA');
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  assert.equal(store.getState(from), 'NOMBRE_ENTREGA');
  await store.handleMessage(from, { type: 'text', text: 'Juan Perez' });
  assert.ok(sent.some((m) => m.image));
  assert.ok(sent[sent.length - 1].body.includes('Confirmas'));
  assert.equal(store.getState(from), 'CONFIRMA_ENTREGA');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  await store.handleMessage(from, { type: 'image' });
  await store.handleMessage(from, { type: 'text', text: 'gracias' });
  assert.ok(sent[sent.length - 1].body.includes('motorizado'));
  assert.equal(store.getState(from), undefined);
});

test('útiles — abandonar el pedido de entrega cierra la sesión', async () => {
  const { store, sent } = makeStore();
  const from = '59399990045';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'niña' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  await store.handleMessage(from, { type: 'text', text: 'Juan Perez' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.ok(sent[sent.length - 1].body.includes('Quedamos a tus órdenes'));
  assert.equal(store.getState(from), undefined);
});

test('útiles — lista por texto genera imagen y pide confirmar', async () => {
  const { store, sent } = makeStore();
  const from = '59399990002';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'ESPERA_LISTA');
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador\nxyzfoo' });
  const img = sent.find((m) => m.image);
  assert.ok(img, 'debería enviar imagen');
  assert.ok(sent[sent.length - 1].body.includes('Estás de acuerdo'));
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — texto "ya te envié el pdf" en ESPERA_LISTA no busca producto', async () => {
  const { store, sent } = makeStore();
  const from = '59399990020';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'si ya te envié el pdf' });
  assert.ok(sent[sent.length - 1].body.includes('No recibí tu archivo'));
  assert.equal(store.getState(from), 'ESPERA_LISTA');
});

test('útiles — documento pide confirmación antes de generar', async () => {
  const { store, sent } = makeStore();
  const from = '59399990021';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  const buf = Buffer.from(await makeXlsx(['Goma en barra']));
  await store.handleMessage(from, { type: 'document', data: buf, filename: 'lista.xlsx' });
  assert.ok(sent.some((m) => m.body && m.body.includes('¿Genero la cotización')));
  assert.equal(store.getState(from), 'CONFIRMA_ARCHIVO');
});

test('útiles — confirmar "sí" al documento genera la cotización', async () => {
  const { store, sent } = makeStore();
  const from = '59399990022';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  const buf = Buffer.from(await makeXlsx(['Goma en barra']));
  await store.handleMessage(from, { type: 'document', data: buf, filename: 'lista.xlsx' });
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.ok(sent.some((m) => m.body && m.body.includes('armando tu cotización')));
  const img = sent.find((m) => m.image);
  assert.ok(img, 'debería enviar imagen');
  assert.ok(sent[sent.length - 1].body.includes('Estás de acuerdo'));
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — isBusy true mientras genera la cotización del archivo', async () => {
  const { store, sent } = makeStore();
  const from = '59399990025';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  const buf = Buffer.from(await makeXlsx(['Goma en barra']));
  await store.handleMessage(from, { type: 'document', data: buf, filename: 'lista.xlsx' });
  assert.equal(store.isBusy(from), false);
  const p = store.handleMessage(from, { type: 'text', text: 'sí' });
  await new Promise((r) => setImmediate(r));
  assert.equal(store.isBusy(from), true);
  await p;
  assert.equal(store.isBusy(from), false);
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — "no" al documento: pregunta producto, luego catálogo disponible', async () => {
  const { store, sent } = makeStore();
  const from = '59399990023';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  const buf = Buffer.from(await makeXlsx(['Goma en barra']));
  await store.handleMessage(from, { type: 'document', data: buf, filename: 'lista.xlsx' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.ok(sent[sent.length - 1].body.includes('¿Deseas preguntar por un producto específico'));
  assert.equal(store.getState(from), 'PREGUNTA_PRODUCTO');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.ok(sent[sent.length - 1].body.includes('¿Deseas ver lo que tengo disponible'));
  assert.equal(store.getState(from), 'PREGUNTA_DISPONIBLE');
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.ok(sent.some((m) => m.image), 'debería enviar la imagen del catálogo');
  assert.ok(sent[sent.length - 1].body.includes('separados por coma'));
  assert.equal(store.getState(from), 'NUMEROS');
});

test('útiles — lista solo con cabeceras responde que no encontró', async () => {
  const { store, sent } = makeStore();
  const from = '59399990030';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Unidad Educativa San José\nGrado: 5to' });
  assert.ok(sent.some((m) => m.body && m.body.includes('No encontré ninguno')));
  assert.ok(!sent.some((m) => m.image));
  assert.equal(store.getState(from), 'ESPERA_LISTA');
});

test('útiles — lista con cabeceras + productos cotiza solo los productos', async () => {
  const { store, sent } = makeStore();
  const from = '59399990024';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Unidad Educativa San José\nGrado: 5to\ngoma en barra\nborrador' });
  const img = sent.find((m) => m.image);
  assert.ok(img, 'debería enviar imagen');
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
  const sel = store.getSeleccion(from);
  assert.ok(sel.some((it) => it.nombre === 'goma en barra'));
  assert.ok(sel.some((it) => it.nombre === 'borrador'));
  assert.equal(sel.length, 2);
});

test('útiles IA — opción 1 entra al chat con IA', async () => {
  const { store, sent } = makeIaStore({ reply: '¡Perfecto! ¿Qué productos necesitas?' });
  const from = '59399990101';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body.includes('Ya puedes escribirme tu lista')));
  await store.handleMessage(from, { type: 'text', text: 'quiero una mochila' });
  assert.ok(sent.some((m) => m.body === '¡Perfecto! ¿Qué productos necesitas?'));
});

test('útiles IA — aplica carrito del JSON de Gemini', async () => {
  const { store, sent } = makeIaStore({
    reply: 'Listo, agregué 2 gomas.',
    carrito: [{ producto: 'Goma en barra bester 8 g', cantidad: 2 }],
  });
  const from = '59399990102';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'quiero 2 gomas en barra' });
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].qty, 2);
  assert.ok(sent.some((m) => m.body === 'Listo, agregué 2 gomas.'));
});

test('útiles IA — pedido_finalizado envía imagen final, confirma y detalla el monto del 50%', async () => {
  const { store, sent } = makeIaStore({
    reply: '¡Perfecto! Tu pedido está confirmado.',
    carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
    entrega: { direccion: 'Av 6 de Diciembre y Amazonas', diaHora: 'Viernes 9am', nombre: 'Ana', genero: 'niña', domicilio: true },
    pedido_finalizado: true,
  });
  const from = '59399990103';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  assert.ok(sent.some((m) => m.image), 'debería enviar la imagen final');
  assert.ok(sent.some((m) => m.body === '¡Perfecto! Tu pedido está confirmado.'), 'debe confirmar el pedido');
  const lastMsg = sent.filter((m) => m.body).pop();
  assert.ok(lastMsg.body.includes('50%'), 'debe indicar el anticipo del 50%');
  assert.ok(lastMsg.body.includes('$'), 'debe indicar el monto exacto a transferir');
  assert.ok(lastMsg.body.includes('Evelyn Lizeth Zambrano'), 'debe indicar el titular');
  assert.equal(store.getSeleccion(from).length, 1);
});

test('útiles IA — comprobante válido con IA: agradece y cierra la sesión', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: '¡Excelente! Tu pedido está confirmado.',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { ok: true, monto: 1.25, titular: 'Evelyn Lizeth Zambrano', fecha: fechaHoy() }
  );
  const from = '59399990118';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png', filename: 'comprobante.png' });
  assert.ok(sent.some((m) => m.body && m.body.includes('Verificamos tu comprobante')), 'debe agradecer tras verificar');
  assert.ok(sent.some((m) => m.body && m.body.includes('1.25')), 'debe mencionar el monto verificado');
  assert.equal(store.getState(from), undefined, 'la sesión debe cerrarse');
});

test('útiles IA — comprobante inválido con IA: avisa el detalle y sigue esperando', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { ok: false, monto: 0.5, titular: 'Juan Pérez', motivo: 'el monto es menor al anticipo esperado' }
  );
  const from = '59399990119';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png', filename: 'comprobante.png' });
  assert.ok(sent.some((m) => m.body && m.body.includes('encontramos un detalle')), 'debe avisar el detalle con amabilidad');
  assert.ok(sent.some((m) => m.body && m.body.includes('el monto es menor al anticipo esperado')), 'debe incluir el motivo');
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE', 'debe seguir esperando el comprobante');
});

test('útiles IA — si la imagen no es un comprobante lo avisa y sigue esperando', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { es_comprobante: false, monto: 0, titular: '', ok: false, motivo: 'esa imagen no parece ser un comprobante de pago' }
  );
  const from = '59399990128';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png', filename: 'foto.png' });
  assert.ok(sent.some((m) => m.body && m.body.includes('no parece ser un comprobante')), 'debe indicar que no es un comprobante');
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE', 'debe seguir esperando el comprobante');
});

test('útiles IA — no repite el mismo aviso si reenvía el mismo comprobante', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { ok: false, monto: 0.5, titular: 'Juan Pérez', motivo: 'el titular no coincide' }
  );
  const from = '59399990129';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  const img = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  await store.handleMessage(from, { type: 'image', data: img, mimeType: 'image/png', filename: 'comprobante.png' });
  await store.handleMessage(from, { type: 'image', data: img, mimeType: 'image/png', filename: 'comprobante.png' });
  const bodies = sent.filter((m) => m.body).map((m) => m.body);
  assert.equal(bodies.filter((b) => b.includes('encontramos un detalle')).length, 1, 'el aviso del detalle debe enviarse solo la primera vez');
  assert.ok(bodies.some((b) => b.includes('misma imagen')), 'debe indicar que es la misma imagen');
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE', 'debe seguir esperando');
});

test('útiles IA — varía la respuesta en comprobantes inválidos y ofrece asesor', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { ok: false, monto: 0.5, titular: 'Juan Pérez', motivo: 'el titular no coincide' }
  );
  const from = '59399990130';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]), mimeType: 'image/png' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]), mimeType: 'image/png' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 3]), mimeType: 'image/png' });
  const bodies = sent.filter((m) => m.body).map((m) => m.body);
  const receiptBodies = bodies.slice(-3);
  assert.equal(new Set(receiptBodies).size, receiptBodies.length, 'las respuestas deben variar, no repetirse');
  assert.ok(receiptBodies[2].includes('asesor'), 'al tercer intento debe ofrecer ayuda de un asesor');
});

test('útiles IA — fallo de Gemini al revisar comprobante cae a verificación manual', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    null
  );
  const from = '59399990120';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png', filename: 'comprobante.png' });
  assert.ok(sent.some((m) => m.body && m.body.includes('Recibimos tu comprobante')), 'debe caer a verificación manual');
  assert.equal(store.getState(from), 'ESPERA_CONFIRMACION_RECIBO');
});

test('útiles IA — comprobante con fecha antigua: se rechaza y sigue esperando', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { ok: true, monto: 5, titular: 'Evelyn Lizeth Zambrano', fecha: '01/01/2020' }
  );
  const from = '59399990131';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' });
  const bodies = sent.filter((m) => m.body).map((m) => m.body);
  assert.ok(bodies.some((b) => b.includes('fecha del comprobante es 01/01/2020')), 'debe indicar que la fecha no corresponde');
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE', 'debe seguir esperando');
});

test('útiles IA — comprobante sin fecha legible: se rechaza y sigue esperando', async () => {
  const { store, sent } = makeIaReceiptStore(
    {
      reply: 'ok',
      carrito: [{ producto: 'Borrador blanco de queso bester', cantidad: 1 }],
      pedido_finalizado: true,
    },
    { ok: true, monto: 5, titular: 'Evelyn Lizeth Zambrano', fecha: '' }
  );
  const from = '59399990132';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'confirmo mi pedido' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' });
  const bodies = sent.filter((m) => m.body).map((m) => m.body);
  assert.ok(bodies.some((b) => b.includes('no pude leer la fecha')), 'debe indicar que no leyó la fecha');
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE', 'debe seguir esperando');
});

test('útiles — el pedido por retiro indica el monto exacto del anticipo', async () => {
  const { store, sent } = makeStore();
  const from = '59399990133';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'niña' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  const lastMsg = sent.filter((m) => m.body).pop();
  assert.ok(lastMsg.body.includes('50%'), 'debe pedir el anticipo del 50%');
  assert.ok(lastMsg.body.includes('$'), 'debe indicar el monto exacto');
  assert.ok(lastMsg.body.includes('Evelyn Lizeth Zambrano'), 'debe indicar el titular');
});

test('útiles IA — despedirse cierra la sesión', async () => {
  const { store, sent } = makeIaStore({ reply: '¡Hasta luego!', despedirse: true });
  const from = '59399990104';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'chao' });
  assert.equal(store.getState(from), undefined);
  assert.ok(sent.some((m) => m.body.includes('Hasta luego')));
});

test('útiles IA — fallo de Gemini no rompe el chat', async () => {
  const { store, sent } = makeIaStore(null);
  const from = '59399990105';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'necesito una lista' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body.includes('no pude procesar')));
});

test('útiles IA — "catálogo" y palabra "asesor" siguen en reglas', async () => {
  const { store, sent } = makeIaStore({ reply: 'no debería usarse' });
  const from = '59399990106';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  assert.equal(store.getState(from), 'NUMEROS');
  assert.ok(sent.some((m) => m.image), 'debería enviar el catálogo');

  const from2 = '59399990107';
  await store.handleMessage(from2, { type: 'text', text: 'hola' });
  await store.handleMessage(from2, { type: 'text', text: 'asesor' });
  assert.equal(store.getState(from2), 'ASESOR');
});

test('útiles IA — una foto en el chat se envía a Gemini', async () => {
  const { store, sent } = makeIaStore({ reply: 'Vi la lista, son 3 productos.' });
  const from = '59399990108';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'image', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png', filename: 'lista.png' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body === 'Vi la lista, son 3 productos.'));
});

test('útiles IA — documento se parsea y va a Gemini', async () => {
  const { store, sent } = makeIaStore({ reply: 'Recibí tu documento.' });
  const from = '59399990109';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  const buf = await makeXlsx(['goma en barra', 'borrador']);
  await store.handleMessage(from, { type: 'document', data: Buffer.from(buf), filename: 'lista.xlsx' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body === 'Recibí tu documento.'));
});

test('útiles IA — el prompt incluye la regla de fotos con el enlace del catálogo', async () => {
  const { store, last } = makeIaCaptureStore({ reply: 'ok' });
  const from = '59399990110';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '¿tienes foto de la goma?' });
  assert.ok(last.system.includes('wa.me/c/593987695938'), 'debería tener el enlace del catálogo');
  assert.ok(last.system.includes('no hay foto disponible'), 'debería decir que no hay foto');
  assert.ok(last.system.includes('mochilas, cartucheras y loncheras'), 'debería aclarar las categorías con fotos');
});

test('útiles IA — el prompt pide enviar todas las fotos de la categoría y no el catálogo completo', async () => {
  const { store, last } = makeIaCaptureStore({ reply: 'ok' });
  const from = '59399990121';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '¿qué mochilas tienes?' });
  assert.ok(last.system.includes('TODOS los productos con foto'), 'debe pedir enviar todas las fotos de la categoría');
  assert.ok(last.system.includes('qué mochilas tienes'), 'debe ejemplificar la pregunta por categoría');
  assert.ok(last.system.includes('sin enviar la lista completa'), 'no debe enviar la lista completa salvo que la pidan');
});

test('útiles IA — el prompt incluye la regla de cotización', async () => {
  const { store, last } = makeIaCaptureStore({ reply: 'ok' });
  const from = '59399990111';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'dame la cotización' });
  assert.ok(last.system.includes('enviar_cotizacion'), 'debería mencionar enviar_cotizacion');
  assert.ok(last.system.includes('la cotización'), 'debería mencionar la cotización');
});

test('útiles IA — el prompt incluye la regla de la cuenta de transferencia', async () => {
  const { store, last } = makeIaCaptureStore({ reply: 'ok' });
  const from = '59399990112';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '¿a qué cuenta transfiero?' });
  assert.ok(last.system.includes('En breve te indico el número de cuenta'), 'debería responder sin número de cuenta');
  assert.ok(last.system.includes('número de cuenta'), 'debería hablar del número de cuenta');
});

test('útiles IA — el prompt explica la política del 50% si quiere pagar todo al retirar', async () => {
  const { store, last } = makeIaCaptureStore({ reply: 'ok' });
  const from = '59399990125';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '¿puedo pagar todo al retirar?' });
  assert.ok(last.system.includes('políticas de seguridad'), 'debe mencionar las políticas de seguridad');
  assert.ok(last.system.includes('pago del 50% para confirmar el pedido'), 'debe pedir el 50% para confirmar');
});

test('útiles — si pide pagar todo al retirar, explica amablemente la política del 50%', async () => {
  const { store, sent } = makeStore();
  const from = '59399990126';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '¿puedo pagar todo cuando lo retire?' });
  const lastMsg = sent.filter((m) => m.body).pop();
  assert.ok(lastMsg.body.includes('políticas de seguridad'), 'debe explicar la política de seguridad');
  assert.ok(lastMsg.body.includes('50%'), 'debe pedir el anticipo del 50%');
});

test('útiles — la pregunta de pago normal sigue respondiendo las condiciones de pago', async () => {
  const { store, sent } = makeStore();
  const from = '59399990127';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '¿cómo es el pago?' });
  const lastMsg = sent.filter((m) => m.body).pop();
  assert.ok(lastMsg.body.includes('transferencia'), 'debe hablar de la transferencia');
});

test('útiles IA — enviar_cotizacion envía la imagen y sigue en IA_CHAT', async () => {
  const { store, sent } = makeIaStore({
    reply: 'Claro, aquí está tu cotización.',
    carrito: [{ producto: 'Goma en barra bester 8 g', cantidad: 1, linea: '1 goma en barra' }],
    enviar_cotizacion: true,
  });
  const from = '59399990113';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'dame la cotización' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body === 'Claro, aquí está tu cotización.'));
  assert.ok(sent.some((m) => m.image), 'debería enviar la imagen de cotización');
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].linea, '1 goma en barra');
});

test('útiles IA — no repite la imagen de cotización si el pedido no cambió', async () => {
  const { store, sent } = makeIaStore({
    reply: 'Aquí está tu cotización.',
    carrito: [{ producto: 'Goma en barra bester 8 g', cantidad: 1, linea: '1 goma en barra' }],
    enviar_cotizacion: true,
  });
  const from = '59399990123';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'dame la cotización' });
  await store.handleMessage(from, { type: 'text', text: 'otra vez la cotización' });
  await store.handleMessage(from, { type: 'text', text: 'repite la cotización' });
  assert.equal(store.getState(from), 'IA_CHAT');
  const images = sent.filter((m) => m.image);
  assert.equal(images.length, 1, 'no debe reenviar la misma cotización sin cambios');
});

test('útiles IA — no repite el catálogo ni las fotos ya enviadas', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'utiles-img-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  writeFileSync(path.join(dir, '1.png'), png);
  process.env.UTILES_IMAGES_DIR = dir;
  try {
    const { store, sent } = makeIaStore({ reply: 'ok', enviar_catalogo: true, enviar_foto: [1] });
    const from = '59399990124';
    await store.handleMessage(from, { type: 'text', text: 'hola' });
    await store.handleMessage(from, { type: 'text', text: '1' });
    await store.handleMessage(from, { type: 'text', text: 'muéstrame todo y la mochila' });
    await store.handleMessage(from, { type: 'text', text: 'repite el catálogo y la foto' });
    const images = sent.filter((m) => m.image);
    assert.equal(images.length, 2, 'catálogo + foto solo la primera vez (1 cada uno)');
  } finally {
    delete process.env.UTILES_IMAGES_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('útiles IA — documento .docx sin parser se envía como inlineData', async () => {
  const { store, last } = makeIaCaptureStore({ reply: 'Leí tu documento Word.' });
  const from = '59399990114';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'document', data: Buffer.from('no soy un xlsx ni pdf'), filename: 'lista.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  assert.equal(store.getState(from), 'IA_CHAT');
  const userPart = last.history.find((h) => h.role === 'user');
  const parts = userPart && userPart.parts ? userPart.parts : [];
  const inline = parts.find((p) => p.inlineData);
  assert.ok(inline, 'el documento debe ir como inlineData a Gemini');
  assert.ok(inline.inlineData.mimeType.includes('wordprocessingml.document'));
});

test('útiles IA — al recibir una lista marca recibir_lista y envía la cotización', async () => {
  const { store, sent } = makeIaStore({
    reply: 'Encontré tus útiles. ¿Deseas agregar algo más a la cotización? También te recomiendo una mochila.',
    carrito: [
      { producto: 'Goma en barra bester 8 g', cantidad: 2, linea: '2 goma en barra' },
      { producto: 'Regla bester de 30 cm', cantidad: 1, linea: 'regla de 30 cm' },
    ],
    recibir_lista: true,
  });
  const from = '59399990115';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra, regla de 30 cm' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body.includes('¿Deseas agregar algo más')), 'debe preguntar si desea agregar más');
  assert.ok(sent.some((m) => m.image), 'debe enviar la imagen de cotización');
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, 2);
  assert.equal(sel[0].linea, '2 goma en barra');
  assert.equal(sel[0].qty, 2);
});

test('fotos — findProductImage resuelve la imagen por número, código o nombre', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'utiles-img-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  writeFileSync(path.join(dir, '3.png'), png);
  writeFileSync(path.join(dir, 'Mochila cod 99999.jpeg'), png);
  writeFileSync(path.join(dir, 'Otra mochila.png'), png);
  process.env.UTILES_IMAGES_DIR = dir;
  try {
    const hitNum = findProductImage({ numero: 3 });
    assert.ok(hitNum, 'debería resolver por número');
    assert.ok(hitNum.endsWith(`${path.sep}3.png`));
    const hitCod = findProductImage({ numero: 5, producto: 'Mochila cod 99999' });
    assert.ok(hitCod, 'debería resolver por código del producto');
    assert.ok(hitCod.endsWith(`${path.sep}Mochila cod 99999.jpeg`));
    const hitName = findProductImage({ numero: 6, producto: 'Otra mochila escolar' });
    assert.ok(hitName, 'debería resolver por nombre');
    assert.ok(hitName.endsWith(`${path.sep}Otra mochila.png`));
    assert.equal(findProductImage({ numero: 99 }), null);
    assert.equal(findProductImage(null), null);
  } finally {
    delete process.env.UTILES_IMAGES_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('útiles IA — enviar_foto envía la foto del producto', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'utiles-img-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  writeFileSync(path.join(dir, '1.png'), png);
  process.env.UTILES_IMAGES_DIR = dir;
  try {
    const { store, sent } = makeIaStore({ reply: 'Aquí tienes la foto.', enviar_foto: [1] });
    const from = '59399990116';
    await store.handleMessage(from, { type: 'text', text: 'hola' });
    await store.handleMessage(from, { type: 'text', text: '1' });
    await store.handleMessage(from, { type: 'text', text: 'muéstrame la foto' });
    assert.equal(store.getState(from), 'IA_CHAT');
    assert.ok(sent.some((m) => m.image), 'debería enviar la foto del producto');
  } finally {
    delete process.env.UTILES_IMAGES_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('útiles IA — enviar_foto con varios números envía todas las fotos (mochilas)', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'utiles-img-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  writeFileSync(path.join(dir, '1.png'), png);
  writeFileSync(path.join(dir, '2.png'), png);
  writeFileSync(path.join(dir, '3.png'), png);
  process.env.UTILES_IMAGES_DIR = dir;
  try {
    const { store, sent } = makeIaStore({ reply: 'Estas son las mochilas.', enviar_foto: [1, 2, 3] });
    const from = '59399990122';
    await store.handleMessage(from, { type: 'text', text: 'hola' });
    await store.handleMessage(from, { type: 'text', text: '1' });
    await store.handleMessage(from, { type: 'text', text: '¿qué mochilas tienes?' });
    assert.equal(store.getState(from), 'IA_CHAT');
    const images = sent.filter((m) => m.image);
    assert.equal(images.length, 3, 'debería enviar una imagen por cada producto');
  } finally {
    delete process.env.UTILES_IMAGES_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('útiles IA — enviar_foto sin archivo avisa que no hay foto', async () => {
  const { store, sent } = makeIaStore({ reply: 'Te envío la foto.', enviar_foto: [99] });
  const from = '59399990117';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'muéstrame la foto' });
  assert.equal(store.getState(from), 'IA_CHAT');
  assert.ok(sent.some((m) => m.body.includes('No tengo una foto disponible')), 'debe avisar que no hay foto');
  assert.ok(!sent.some((m) => m.image), 'no debe enviar imagen');
});

test('útiles — sugerencia: "muéstrame las mochilas" muestra los modelos', async () => {
  const { store, sent } = makeStore();
  const from = '59399990140';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  assert.equal(store.getState(from), 'SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'muéstrame las mochilas' });
  assert.equal(store.getState(from), 'CONFIRMA_SUGERENCIA');
  assert.ok(sent[sent.length - 1].body.includes('Te gustaría agregar'));
});

test('útiles — sugerencia: "prefiero ver mi cotización" muestra la cotización', async () => {
  const { store, sent } = makeStore();
  const from = '59399990141';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'prefiero ver mi cotización' });
  assert.ok(sent.some((m) => m.image));
  assert.ok(sent[sent.length - 1].body.includes('Estás de acuerdo'));
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — confirmar sugerencia: responder un producto va al catálogo de modelos', async () => {
  const { store, sent } = makeStore();
  const from = '59399990142';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.equal(store.getState(from), 'CONFIRMA_SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'xyzfoo' });
  assert.equal(store.getState(from), 'SELECCION');
  await store.handleMessage(from, { type: 'text', text: 'ninguna' });
  assert.equal(store.getState(from), 'AGREGADO');
});

test('útiles — "domicilio" en entrega pide dirección', async () => {
  const { store, sent } = makeStore();
  const from = '59399990143';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'caja de 12 lapices' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'niña' });
  assert.equal(store.getState(from), 'ENTREGA');
  await store.handleMessage(from, { type: 'text', text: 'domicilio' });
  assert.equal(store.getState(from), 'UBICACION');
});

test('útiles — respuesta no reconocida en confirmar cotización permite modificar', async () => {
  const { store, sent } = makeStore();
  const from = '59399990144';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'catálogo' });
  await store.handleMessage(from, { type: 'text', text: '22' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
  await store.handleMessage(from, { type: 'text', text: 'otro producto' });
  assert.equal(store.getState(from), 'AGREGADO');
  assert.ok(sent[sent.length - 1].body.includes('agregar algo más'));
});

after(() => {
  for (const s of stores) s.close();
  console.log('\n===== NOTAS =====');
  console.log('1. Flujo de utiles escolares: SALUDO (1 IA / 2 Evelyn / 3 chatbot para tu negocio; sin opcion de catalogo en el saludo: el catalogo se pide por palabra "catalogo" o tras la opcion 1) -> ESPERA_LISTA | NUMEROS (numeros por coma -> cantidad por articulo) -> AGREGADO (agregar/eliminar/finalizar) -> CONFIRMA_COTIZACION (de acuerdo/modificar) -> GENERO -> ENTREGA (domicilio o retiro) -> comprobante manual -> confirmacion -> cierre. La imagen de cotizacion tiene columnas Cantidad | Producto | Precio.');
  console.log('2. El Excel de útiles tiene la columna "Número de producto" (1..59); la numeración del catálogo proviene de esa columna.');
  console.log('3. Sin APP_SECRET en .env, el webhook acepta cualquier POST (la verificacion de firma esta desactivada).');
  console.log('==================');
});