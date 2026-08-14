import { normalize } from './excel.js';

const FIELDS = ['empresa', 'usuario', 'modelo', 'caracteristicas', 'serial', 'estado', 'codigo'];

const STOPWORDS = new Set([
  'que', 'cual', 'cuales', 'cuanto', 'cuantas', 'cuantos', 'hay', 'de', 'del', 'la', 'el', 'los', 'las',
  'un', 'una', 'unos', 'unas', 'me', 'te', 'se', 'por', 'para', 'en', 'con', 'a', 'y', 'o', 'como',
  'quiero', 'saber', 'informacion', 'dame', 'dime', 'estado', 'equipos', 'equipo', 'laptop', 'laptops',
  'portatil', 'portatiles', 'puedes', 'decirme', 'consultar', 'consulta', 'favor', 'porfa', 'pls',
  'actualmente', 'cuantos', 'cuantas', 'hay', 'tiene', 'tienen', 'esta', 'estan', 'se',
]);

const GREETINGS = new Set(['hola', 'hello', 'hi', 'hey', 'saludos', 'buenas', 'buenos', 'buen', 'dia', 'dias', 'tardes', 'buendia']);

export const HELP = '¡Hola! Es un gusto saludarte, soy el asistente del inventario de equipos. Puedo ayudarte con: "equipos disponibles", "arrendados", "inventario", un serial (ej. 7D9J4M3), "sin serial", o buscar por marca (Dell, Lenovo), empresa, usuario, caracteristicas o codigo (ej. "codigo 8"). ¿En que te puedo ayudar?';

export const DEACTIVATION_REPLY = '¡Listo, bot desactivado! Cuando me necesites, escríbeme "hola bot".';

export function isActivationMessage(text) {
  return normalize(text).includes('hola bot');
}

export function isDeactivationMessage(text) {
  return normalize(text).includes('chao bot');
}

export function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9\u00f1]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function score(record, tokens) {
  let s = 0;
  for (const t of tokens) {
    for (const f of FIELDS) {
      const v = normalize(record[f]);
      if (!v) continue;
      if (v === t) {
        s += f === 'serial' ? 5 : 3;
      } else if (v.includes(t)) {
        s += f === 'serial' ? 3 : 1;
      }
      if (f === 'modelo' && t === 'dell' && record.modelo.includes('Dell')) s += 2;
    }
  }
  return s;
}

function formatLaptop(l) {
  const line = [
    l.modelo,
    l.caracteristicas,
    l.serial ? `Serial: ${l.serial}` : null,
    l.empresa ? `Empresa: ${l.empresa}` : null,
    l.usuario ? `Usuario: ${l.usuario}` : null,
    l.codigo ? `Codigo: ${l.codigo}` : null,
    l.estado ? `Estado: ${l.estado}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return line;
}

function groupSections(laptops) {
  const disponibles = laptops.filter((l) => normalize(l.estado) === 'disponible');
  const arrendados = laptops.filter((l) => normalize(l.estado) === 'arrendado');
  return { disponibles, arrendados };
}

function formatDisponibles(list) {
  if (list.length === 0) return 'Actualmente no hay equipos disponibles.';
  const head = `Equipos disponibles (${list.length}):`;
  return [head, ...list.map((l, i) => `${i + 1}. ${l.modelo} - ${l.caracteristicas || ''} (Serial: ${l.serial || 'n/d'})`)].join('\n');
}

function formatArrendados(list) {
  if (list.length === 0) return 'No hay equipos arrendados actualmente.';
  const head = `Equipos arrendados (${list.length}):`;
  return [head, ...list.map((l, i) => `${i + 1}. ${l.modelo} - ${l.empresa || 's/n'} ${l.usuario ? '(' + l.usuario + ')' : ''}`)].join('\n');
}

function formatSinSerial(list) {
  if (list.length === 0) return 'Todos los equipos tienen serial registrado.';
  const head = `Equipos sin serial registrado (${list.length}):`;
  return [head, ...list.map((l, i) => `${i + 1}. ${l.modelo} - ${l.caracteristicas || ''} (Codigo: ${l.codigo || 'n/d'})`)].join('\n');
}

export function generateReply(text, laptops) {
  const t = normalize(text);

  const matches = (w) => t.includes(w);

  if (matches('disponible') && matches('arrendad')) {
    const { disponibles, arrendados } = groupSections(laptops);
    return `${formatDisponibles(disponibles)}\n\n${formatArrendados(arrendados)}`;
  }

  if (matches('disponible')) {
    const { disponibles } = groupSections(laptops);
    return formatDisponibles(disponibles);
  }

  if (matches('arrendad')) {
    const { arrendados } = groupSections(laptops);
    return formatArrendados(arrendados);
  }

  if (matches('cuant') || matches('total') || matches('inventario')) {
    const { disponibles, arrendados } = groupSections(laptops);
    return `Inventario actual:\n- Disponibles: ${disponibles.length}\n- Arrendados: ${arrendados.length}\n- Total: ${laptops.length}`;
  }

  const serialToken = normalize(text)
    .split(/[^a-z0-9]+/)
    .find((token) => token.length >= 5 && laptops.some((l) => normalize(l.serial) === token));
  if (serialToken) {
    const hit = laptops.find((l) => normalize(l.serial) === serialToken);
    return `Resultado para serial ${serialToken.toUpperCase()}:\n${formatLaptop(hit)}`;
  }

  const codigoMatch = t.match(/codigo\s*(\d+)/);
  if (codigoMatch) {
    const hit = laptops.find((l) => normalize(l.codigo) === codigoMatch[1]);
    if (hit) return `Resultado para codigo ${codigoMatch[1]}:\n${formatLaptop(hit)}`;
  }

  if (t.includes('serial') && (t.includes('sin') || t.includes('no') || t.includes('falt') || t.includes('vacio') || t.includes('registr'))) {
    return formatSinSerial(laptops.filter((l) => !normalize(l.serial)));
  }

  const tokens = tokenize(text);
  if (tokens.length === 0 || tokens.every((tok) => GREETINGS.has(tok))) {
    return HELP;
  }

  const ranked = laptops
    .map((l) => ({ l, s: score(l, tokens) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s);

  if (ranked.length === 0) {
    return 'No encontre informacion sobre eso en la base de equipos. Intenta con un serial, una marca (Dell, Lenovo, Asus), un nombre de empresa o "disponibles".';
  }

  const top = ranked.slice(0, 3);
  return `Encontre ${ranked.length} coincidencia(s):\n\n${top.map((r) => formatLaptop(r.l)).join('\n\n---\n\n')}`;
}