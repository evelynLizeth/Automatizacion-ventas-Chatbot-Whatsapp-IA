import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkbook, getLaptops, getAuthorizedPhones, isAuthorized, normalize } from './lib/excel.js';
import { generateReply, isActivationMessage, isDeactivationMessage } from './lib/search.js';

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

after(() => {
  console.log('\n===== NOTAS =====');
  console.log('1. Sin APP_SECRET en .env, el webhook acepta cualquier POST (la verificacion de firma esta desactivada). Ok para pruebas locales, no para produccion.');
  console.log('2. Corregidos: rama de serial por token (antes el regex agarraba "serial" primero), saludos muestran ayuda, intent mixto lista ambos estados, y typo "Lenvo" -> "Lenovo Thinkpad" en Laptops.xlsx.');
  console.log('==================');
});