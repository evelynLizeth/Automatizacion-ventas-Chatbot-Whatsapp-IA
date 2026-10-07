import { normalize } from './excel.js';
import { DOMICILIO_RECARGO } from './messages.js';

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

export function cartSig(session) {
  const rows = [...session.seleccion.values()]
    .map((it) => `${normalize(it.linea || it.nombre)}:${it.qty}`)
    .sort()
    .join('|');
  return rows || '(vacío)';
}

export function finalSig(session) {
  return `${cartSig(session)}|dir:${session.direccion || ''}|dia:${session.diaHora || ''}|nom:${session.nombreEntrega || ''}|gen:${session.genero || ''}|dom:${session.delivery ?? ''}`;
}

export function addToSeleccion(session, product, qty = 1) {
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

export function addNoDisponible(session, linea, qty = 1) {
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

export function lineQty(line) {
  const m = String(line).trim().match(/^(\d{1,3})\s+/);
  const n = m ? Number(m[1]) : 1;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function seedSeleccionFromItems(items) {
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

export function seleccionList(session) {
  let i = 1;
  const lines = [];
  for (const [, it] of session.seleccion) {
    lines.push(`${i}. ${it.nombre}${it.qty > 1 ? ` (${it.qty})` : ''}`);
    i += 1;
  }
  return `Tu pedido actual:\n${lines.join('\n')}`;
}

export function seleccionRows(session) {
  if (session.listaBase) {
    const base = session.listaBase instanceof Map ? [...session.listaBase.values()] : session.listaBase;
    return mergeListaRows(base, [...session.seleccion.values()]);
  }
  const rows = [];
  for (const [, it] of session.seleccion) {
    rows.push({ linea: it.linea || it.nombre, nombre: it.catalogo || it.nombre, precio: it.precio, qty: it.qty });
  }
  return rows;
}

export function seleccionTotal(session, recargo = DOMICILIO_RECARGO) {
  const subtotal = [...session.seleccion.values()].reduce(
    (s, it) => s + (it.precio != null ? Number(it.precio) * (Number(it.qty) || 1) : 0),
    0
  );
  return session.delivery ? subtotal + recargo : subtotal;
}

export function anticipoDe(session, recargo = DOMICILIO_RECARGO) {
  const total = seleccionTotal(session, recargo);
  if (total <= 0) return null;
  return Math.round(total * 0.5 * 100) / 100;
}
