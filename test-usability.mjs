import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWorkbook, getLaptops, getAuthorizedPhones, isAuthorized, normalize } from './lib/excel.js';
import { generateReply, isActivationMessage, isDeactivationMessage } from './lib/search.js';
import { getUtilesProducts, getUtilesSheet, findItems, parseItemList, buildPriceImage, formatPrice, parseFile } from './lib/utiles.js';
import { createUtilesStore, ESPERA_GENERANDO } from './lib/store.js';

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

const UWB = await loadWorkbook('./UtilesEscolares.xlsx');
const utiles = getUtilesProducts(getUtilesSheet(UWB));

test('útiles — catálogo cargado', () => {
  assert.equal(utiles.length, 40);
});

test('útiles — campos parseados', () => {
  const goma = utiles.find((p) => p.producto.includes('Goma en Barra Bester 8 g'));
  assert.ok(goma, 'debería existir Goma en Barra Bester 8 g');
  assert.equal(goma.precio, 0.56);
});

test('útiles — findItems encuentra "goma en barra"', () => {
  const hits = findItems('goma en barra', utiles);
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].producto.includes('Goma en Barra'));
});

test('útiles — findItems sin resultados', () => {
  assert.equal(findItems('xyzxyz qwerty', utiles).length, 0);
});

test('útiles — findItems por caja de lápices', () => {
  const hits = findItems('caja de 12 lapices', utiles);
  assert.ok(hits.some((p) => p.producto.includes('STAEDTLER Tradition HB')));
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

test('útiles — parseFile lee xlsx desde buffer', async () => {
  const buf = readFileSync('./UtilesEscolares.xlsx');
  const lines = await parseFile(buf, 'lista.xlsx');
  assert.ok(lines.length > 5);
  assert.ok(lines.some((l) => l.includes('Goma')));
});

function makePdf(text) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  const stream = `BT /F1 14 Tf 50 200 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let body = '%PDF-1.4\n';
  const offsets = {};
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(body, 'ascii');
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(body, 'ascii');
  body += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(body, 'ascii');
}

test('útiles — parseFile lee pdf desde buffer', async () => {
  const buf = makePdf('Goma en barra');
  const lines = await parseFile(buf, 'lista.pdf');
  assert.ok(lines.length >= 1);
  assert.ok(lines.some((l) => l.includes('Goma en barra')));
});

const stores = [];
function makeStore() {
  const sent = [];
  const store = createUtilesStore({
    getProducts: async () => utiles,
    sendText: async (to, body) => sent.push({ to, body }),
    sendImage: async (to, buffer) => sent.push({ to, image: buffer }),
    log: () => {},
  });
  stores.push(store);
  return { store, sent };
}

test('útiles — ESPERA_GENERANDO se exporta para el webhook', () => {
  assert.equal(typeof ESPERA_GENERANDO, 'string');
  assert.ok(ESPERA_GENERANDO.length > 0);
});

test('útiles — saludo inicial en primer mensaje', async () => {
  const { store, sent } = makeStore();
  await store.handleMessage('59399990001', { type: 'text', text: 'hola' });
  assert.ok(sent.some((m) => m.body.includes('¿Te interesa cotizar')));
  assert.equal(store.getState('59399990001'), 'SALUDO');
});

test('útiles — "no" en saludo se despide', async () => {
  const { store, sent } = makeStore();
  await store.handleMessage('59399990004', { type: 'text', text: 'hola' });
  await store.handleMessage('59399990004', { type: 'text', text: 'no' });
  assert.ok(sent.some((m) => m.body.includes('Hasta luego')));
  assert.equal(store.getState('59399990004'), undefined);
});

test('útiles — pregunta de pago responde transferencia', async () => {
  const { store, sent } = makeStore();
  await store.handleMessage('59399990005', { type: 'text', text: 'hola' });
  await store.handleMessage('59399990005', { type: 'text', text: '¿cómo puedo pagar?' });
  assert.ok(sent.some((m) => m.body.includes('transferencia')));
});

test('útiles — foto no se procesa (sin OCR)', async () => {
  const { store, sent } = makeStore();
  await store.handleMessage('59399990006', { type: 'text', text: 'hola' });
  await store.handleMessage('59399990006', { type: 'image' });
  assert.ok(sent.some((m) => m.body.includes('No puedo leer fotos')));
});

test('útiles — lista por texto genera imagen y pide confirmar la cotización', async () => {
  const { store, sent } = makeStore();
  await store.handleMessage('59399990002', { type: 'text', text: 'hola' });
  await store.handleMessage('59399990002', { type: 'text', text: '1' });
  assert.equal(store.getState('59399990002'), 'ESPERA_LISTA');
  await store.handleMessage('59399990002', { type: 'text', text: 'goma en barra\nborrador\nxyzfoo' });
  const img = sent.find((m) => m.image);
  assert.ok(img, 'debería enviar imagen');
  assert.equal(img.image[0], 0x89);
  assert.ok(sent[sent.length - 1].body.includes('¿Es esta la cotización'));
  assert.equal(store.getState('59399990002'), 'CONFIRMA_COTIZACION');
});

test('útiles — pedido completo hasta comprobante', async () => {
  const { store, sent } = makeStore();
  const from = '59399990008';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'ENTREGA');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'UBICACION');
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  assert.equal(store.getState(from), 'DIA_HORA');
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  assert.equal(store.getState(from), 'CONFIRMA_PEDIDO');
  assert.ok(sent.some((m) => m.body && m.body.includes('Realizar el pedido')));
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  assert.ok(sent.some((m) => m.body && m.body.includes('50%')));
  await store.handleMessage(from, { type: 'image' });
  assert.ok(sent.some((m) => m.body && m.body.includes('Evelyn Lizeth Zambrano')));
  assert.equal(store.getState(from), undefined);
});

test('útiles — consulta de producto con varias opciones y cantidad', async () => {
  const { store, sent } = makeStore();
  const from = '59399990003';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra' });
  assert.equal(store.getState(from), 'SELECCION');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'CANTIDAD');
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.ok(sent[sent.length - 1].body.includes('2 x Goma en Barra'));
  assert.equal(store.getState(from), 'AGREGADO');
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].qty, 2);
});

test('útiles — "eso es todo" ofrece sugerencia y luego cotización preliminar', async () => {
  const { store, sent } = makeStore();
  const from = '59399990007';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: 'eso es todo' });
  assert.equal(store.getState(from), 'SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  const imgs = sent.filter((m) => m.image);
  assert.equal(imgs.length, 1);
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — flujo de sugerencias agrega un accesorio al pedido', async () => {
  const { store, sent } = makeStore();
  const from = '59399990009';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: 'eso es todo' });
  assert.equal(store.getState(from), 'SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.equal(store.getState(from), 'CONFIRMA_SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.equal(store.getState(from), 'MODELO_MOCHILA');
  await store.handleMessage(from, { type: 'text', text: 'cartuchera' });
  assert.equal(store.getState(from), 'SELECCION');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'CANTIDAD');
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'AGREGADO');
  assert.ok(store.getSeleccion(from).some((it) => it.nombre === 'Cartuchera'));
  await store.handleMessage(from, { type: 'text', text: 'eso es todo' });
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — modificar: retirar un producto', async () => {
  const { store, sent } = makeStore();
  const from = '59399990010';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  assert.equal(store.getState(from), 'CONFIRMA_PEDIDO');
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.equal(store.getState(from), 'MODIFICAR');
  await store.handleMessage(from, { type: 'text', text: '2' });
  assert.equal(store.getState(from), 'RETIRAR');
  assert.ok(sent.some((m) => m.body && m.body.includes('Tu pedido actual')));
  const count0 = store.getSeleccion(from).length;
  await store.handleMessage(from, { type: 'text', text: '1' });
  const sel = store.getSeleccion(from);
  assert.equal(sel.length, count0 - 1);
  assert.equal(store.getState(from), 'CONFIRMA_PEDIDO');
});

test('útiles — modificar: agregar productos y volver a cotización final', async () => {
  const { store, sent } = makeStore();
  const from = '59399990011';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  await store.handleMessage(from, { type: 'text', text: '2' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'AGREGADO');
  await store.handleMessage(from, { type: 'text', text: 'cartuchera' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'AGREGADO');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.equal(store.getState(from), 'SUGERENCIA');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.equal(store.getState(from), 'CONFIRMA_PEDIDO');
});

test('útiles — "no estoy interesado" despide y cierra', async () => {
  const { store, sent } = makeStore();
  const from = '59399990012';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  await store.handleMessage(from, { type: 'text', text: '3' });
  assert.ok(sent.some((m) => m.body && m.body.includes('órdenes')));
  assert.equal(store.getState(from), undefined);
});

test('útiles — dirección corta se re-pregunta', async () => {
  const { store, sent } = makeStore();
  const from = '59399990013';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'UBICACION');
  await store.handleMessage(from, { type: 'text', text: 'x' });
  assert.equal(store.getState(from), 'UBICACION');
  assert.ok(sent[sent.length - 1].body.includes('dirección'));
});

test('útiles — comprobante por documento se registra y cierra', async () => {
  const { store, sent } = makeStore();
  const from = '59399990014';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  await store.handleMessage(from, { type: 'document', data: Buffer.from('x'), filename: 'comprobante.pdf' });
  assert.ok(sent.some((m) => m.body && m.body.includes('Evelyn Lizeth Zambrano')));
  assert.equal(store.getState(from), undefined);
});

test('útiles — texto en espera de comprobante re-pide el comprobante', async () => {
  const { store, sent } = makeStore();
  const from = '59399990015';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'Av siempre viva 123' });
  await store.handleMessage(from, { type: 'text', text: 'mañana a las 3pm' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  await store.handleMessage(from, { type: 'text', text: 'ya transferí' });
  assert.equal(store.getState(from), 'ESPERA_COMPROBANTE');
  assert.ok(sent[sent.length - 1].body.includes('comprobante'));
});

test('útiles — findItems no confunde "ya te envié el pdf" con cinta', () => {
  assert.deepEqual(findItems('si ya te envié el pdf', utiles), []);
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
  assert.equal(store.getState(from), 'ESPERA_LISTA');
  await store.handleMessage(from, { type: 'document', data: makePdf('Goma en barra'), filename: 'lista.pdf' });
  assert.ok(sent.some((m) => m.body && m.body.includes('¿Genero la cotización')));
  assert.equal(store.getState(from), 'CONFIRMA_ARCHIVO');
});

test('útiles — confirmar "sí" al documento genera la cotización', async () => {
  const { store, sent } = makeStore();
  const from = '59399990022';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'document', data: makePdf('Goma en barra'), filename: 'lista.pdf' });
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  assert.ok(sent.some((m) => m.body && m.body.includes('armando tu cotización')));
  const img = sent.find((m) => m.image);
  assert.ok(img, 'debería enviar imagen');
  assert.ok(sent[sent.length - 1].body.includes('¿Es esta la cotización'));
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

test('útiles — "no" al documento: pregunta producto, luego catálogo disponible', async () => {
  const { store, sent } = makeStore();
  const from = '59399990023';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'document', data: makePdf('Goma en barra'), filename: 'lista.pdf' });
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.ok(sent[sent.length - 1].body.includes('¿Deseas preguntar por un producto específico'));
  assert.equal(store.getState(from), 'PREGUNTA_PRODUCTO');
  await store.handleMessage(from, { type: 'text', text: 'no' });
  assert.ok(sent[sent.length - 1].body.includes('¿Deseas ver lo que tengo disponible'));
  assert.equal(store.getState(from), 'PREGUNTA_DISPONIBLE');
  await store.handleMessage(from, { type: 'text', text: 'sí' });
  const cat = sent[sent.length - 1].body;
  assert.ok(cat.includes('Este es mi catálogo disponible'));
  assert.ok(cat.includes('Goma'));
  assert.equal(store.getState(from), 'ESPERA_LISTA');
});

test('útiles — "completar el pedido" en confirmación va a modificar', async () => {
  const { store, sent } = makeStore();
  const from = '59399990024';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'text', text: 'goma en barra\nborrador' });
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
  await store.handleMessage(from, { type: 'text', text: 'completar el pedido' });
  assert.ok(sent[sent.length - 1].body.includes('Agregar más productos'));
  assert.equal(store.getState(from), 'MODIFICAR');
});

test('útiles — isBusy true mientras genera la cotización del archivo', async () => {
  const { store, sent } = makeStore();
  const from = '59399990025';
  await store.handleMessage(from, { type: 'text', text: 'hola' });
  await store.handleMessage(from, { type: 'text', text: '1' });
  await store.handleMessage(from, { type: 'document', data: makePdf('Goma en barra'), filename: 'lista.pdf' });
  assert.equal(store.isBusy(from), false);
  const p = store.handleMessage(from, { type: 'text', text: 'sí' });
  await new Promise((r) => setImmediate(r));
  assert.equal(store.isBusy(from), true);
  await p;
  assert.equal(store.isBusy(from), false);
  assert.equal(store.getState(from), 'CONFIRMA_COTIZACION');
});

after(() => {
  for (const s of stores) s.close();
  console.log('\n===== NOTAS =====');
  console.log('1. Sin APP_SECRET en .env, el webhook acepta cualquier POST (la verificacion de firma esta desactivada). Ok para pruebas locales, no para produccion.');
  console.log('2. Corregidos: rama de serial por token (antes el regex agarraba "serial" primero), saludos muestran ayuda, intent mixto lista ambos estados, y typo "Lenvo" -> "Lenovo Thinkpad" en Laptops.xlsx.');
  console.log('3. Flujo de utiles escolares: bot publico con estados SALUDO -> ESPERA_LISTA/SELECCION/CANTIDAD -> AGREGADO -> (SUGERENCIA -> CONFIRMA_SUGERENCIA -> MODELO_MOCHILA) -> CONFIRMA_COTIZACION | CONFIRMA_ARCHIVO (confirmacion de PDF/Excel) -> PREGUNTA_PRODUCTO -> PREGUNTA_DISPONIBLE -> ENTREGA -> UBICACION -> DIA_HORA -> CONFIRMA_PEDIDO (menú 1/2/3) -> ESPERA_COMPROBANTE (verificación manual del 50% a nombre de Evelyn Lizeth Zambrano) | MODIFICAR (agregar/retirar).');
  console.log('==================');
});