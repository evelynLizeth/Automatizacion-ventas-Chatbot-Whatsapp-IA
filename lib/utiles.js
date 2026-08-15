import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { normalize } from './excel.js';

const UTILES_SHEET = 'Hoja1';

const PRICE_ALIASES = [
  'precio',
  'precio de venta al publico',
  'precio de venta',
  'precio publico',
  'pvp',
  'valor',
];

const UTILES_STOPWORDS = new Set([
  'que', 'cual', 'cuales', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'con', 'para', 'por', 'en', 'a', 'o', 'y', 'al', 'se', 'me', 'te', 'mi', 'mis', 'quiero',
  'necesito', 'dame', 'dime', 'favor', 'porfa', 'pls', 'marca', 'producto', 'cuanto', 'cual',
]);

export function getUtilesSheet(wb) {
  return wb.getWorksheet(UTILES_SHEET) || wb.worksheets[0];
}

export function getUtilesProducts(ws) {
  const headers = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = normalize(cell.text);
  });
  let colProducto = null;
  let colDesc = null;
  let colPrecio = null;
  for (const [col, h] of Object.entries(headers)) {
    if (h === 'producto' && colProducto == null) colProducto = Number(col);
    else if (h === 'descripcion' && colDesc == null) colDesc = Number(col);
    else if (PRICE_ALIASES.includes(h) && colPrecio == null) colPrecio = Number(col);
  }
  const products = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const producto = colProducto != null ? row.getCell(colProducto).value : null;
    if (producto === null || producto === undefined || String(producto).trim() === '') return;
    const descripcion = colDesc != null ? row.getCell(colDesc).value : null;
    const precioVal = colPrecio != null ? row.getCell(colPrecio).value : null;
    const raw = precioVal !== null && typeof precioVal === 'object' ? precioVal.result : precioVal;
    const precio = Number(raw);
    products.push({
      producto: String(producto).trim(),
      descripcion: descripcion !== null && descripcion !== undefined && String(descripcion).trim() !== ''
        ? String(descripcion).trim()
        : '',
      precio: Number.isFinite(precio) ? precio : null,
    });
  });
  return products;
}

export function tokenizeUtiles(text) {
  return normalize(text)
    .split(/[^a-z0-9\u00f1]+/)
    .filter((t) => t.length > 2 && !UTILES_STOPWORDS.has(t));
}

export function findItems(query, products) {
  const q = normalize(query);
  const tokens = tokenizeUtiles(q);
  if (tokens.length === 0) return [];
  const scored = [];
  for (const p of products) {
    const prod = normalize(p.producto);
    const desc = normalize(p.descripcion);
    let score = 0;
    let hits = 0;
    if (prod && q.length > 1 && prod.includes(q)) score += 10;
    for (const t of tokens) {
      let hit = false;
      for (const f of [prod, desc]) {
        if (!f) continue;
        if (f === t) {
          score += 5;
          hit = true;
        } else if (f.includes(t)) {
          score += 2;
          hit = true;
        }
      }
      if (hit) hits += 1;
    }
    if (hits === tokens.length) score += 2;
    if (score > 0 && hits >= Math.min(2, tokens.length) && hits / tokens.length >= 0.5) {
      scored.push({ product: p, score, hits });
    }
  }
  scored.sort((a, b) => b.score - a.score || normalize(a.product.producto).localeCompare(normalize(b.product.producto)));
  return scored.slice(0, 5).map((s) => s.product);
}

const LIST_HEADER_RE =
  /(grado|curso|paralelo|estudiante|alumno|escuela|colegio|unidad educativa|ano lectivo|lista de utiles|lista escolar|nombre)/;
const LIST_FOOTER_RE =
  /(fecha|entrega|firma|docente|profesor|maestro|nota|observacion|adicional|favor|por favor|agradec|gracias|atentamente|importante|recordar|presentar|presente lista|inicio de clases|debe|deber)/;
const LIST_OMIT_RE =
  /(libro|libros|novela|direccion|domicilio|calle|avenida|cdla|urbanizacion|ciudadela|referencia|telefono|celular|correo|email|whatsapp)/;

export function matchListLines(lines, products) {
  const headers = [];
  const items = [];
  for (const line of lines) {
    const t = normalize(line);
    if (!t) continue;
    if (LIST_HEADER_RE.test(t)) {
      headers.push(line);
      continue;
    }
    if (LIST_FOOTER_RE.test(t) || LIST_OMIT_RE.test(t)) continue;
    const hit = findItems(line, products)[0] || null;
    items.push({
      nombre: hit ? hit.producto : line,
      descripcion: hit ? hit.descripcion : '',
      precio: hit ? hit.precio : null,
      qty: 1,
    });
  }
  return { headers, items };
}

export function parseItemList(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .map((l) => l.replace(/^\s*[-•·▪◦]+\s*/, '').replace(/^\s*\d+[.)]\s*/, ''))
    .map((l) => l.replace(/\s+/g, ' '))
    .filter((l) => l.length > 0);
}

export async function parseFile(buffer, filename) {
  const name = normalize(filename || '');
  if (name.includes('.xlsx') || name.includes('.xls')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const lines = [];
    for (const ws of wb.worksheets) {
      ws.eachRow({ includeEmpty: false }, (row) => {
        const cells = [];
        row.eachCell((cell) => {
          const v = cell.value;
          if (v !== null && v !== undefined && String(v).trim() !== '') cells.push(String(v).trim());
        });
        if (cells.length) lines.push(cells.join(' '));
      });
    }
    return lines;
  }
  if (name.includes('.pdf')) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.pages
        .map((p) => p.text)
        .join('\n')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    } finally {
      await parser.destroy();
    }
  }
  return null;
}

export function formatPrice(n) {
  if (n === null || n === undefined || n === '') return 'No disponible';
  const v = Number(n);
  if (!Number.isFinite(v)) return 'No disponible';
  return `$${v.toFixed(2)}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function buildPriceImage(rows, opts = {}) {
  const { entrega, headers = [] } = opts;
  const width = 800;
  const pad = 32;
  const priceCol = 220;
  const itemX = pad;
  const priceX = width - pad;
  const fontSize = 15;
  const lineH = 20;
  const body = [];

  const wrap = (str, max) => {
    const words = String(str).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  const total = rows.reduce(
    (s, r) => (r.precio != null ? s + Number(r.precio) * (Number(r.qty) || 1) : s),
    0
  );

  let y = 100;
  body.push(
    `<text x="${itemX}" y="${58}" font-size="26" font-weight="bold" fill="#111827">COTIZACIÓN DE ÚTILES ESCOLARES</text>`
  );
  for (const h of headers) {
    for (const ln of wrap(h, Math.floor((width - pad * 2) / 8))) {
      body.push(`<text x="${itemX}" y="${y}" font-size="14" fill="#6b7280">${esc(ln)}</text>`);
      y += 20;
    }
  }
  if (headers.length) y += 8;
  body.push(`<rect x="${pad}" y="${y - 16}" width="${width - pad * 2}" height="34" rx="6" fill="#111827"/>`);
  body.push(`<text x="${itemX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff">Producto</text>`);
  body.push(
    `<text x="${priceX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="end">Precio</text>`
  );
  y += 40;

  rows.forEach((r, idx) => {
    const label = (Number(r.qty) > 1 ? `${r.qty} x ` : '') + (r.nombre || '');
    const lines = wrap(label, Math.floor((width - pad * 2 - priceCol - 24) / 8));
    const rowH = lines.length * lineH + 14;
    if (idx % 2 === 1) {
      body.push(`<rect x="${pad}" y="${y - 14}" width="${width - pad * 2}" height="${rowH}" rx="6" fill="#f3f4f6"/>`);
    }
    lines.forEach((ln, i) => body.push(`<text x="${itemX}" y="${y + i * lineH}" font-size="${fontSize}" fill="#111827">${esc(ln)}</text>`));
    body.push(
      `<text x="${priceX}" y="${y + (lines.length - 1) * lineH + 2}" font-size="15" font-weight="bold" text-anchor="end" fill="${r.precio != null ? '#111827' : '#dc2626'}">${r.precio != null ? esc(formatPrice(Number(r.precio) * (Number(r.qty) || 1))) : 'No disponible'}</text>`
    );
    y += rowH;
  });

  y += 10;
  body.push(`<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="#111827" stroke-width="3"/>`);
  y += 30;
  body.push(`<text x="${itemX}" y="${y}" font-size="22" font-weight="bold" fill="#111827">TOTAL</text>`);
  body.push(
    `<text x="${priceX}" y="${y}" font-size="22" font-weight="bold" fill="#111827" text-anchor="end">${esc(formatPrice(total))}</text>`
  );
  y += 26;
  body.push(
    `<text x="${itemX}" y="${y}" font-size="13" fill="#6b7280">Los precios están en dólares (USD) y no incluyen recargo por entrega a domicilio.</text>`
  );

  if (entrega && (entrega.direccion || entrega.diaHora)) {
    y += 24;
    body.push(`<rect x="${pad}" y="${y - 16}" width="${width - pad * 2}" height="34" rx="6" fill="#111827"/>`);
    body.push(`<text x="${itemX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff">ENTREGA</text>`);
    y += 42;
    if (entrega.direccion) {
      for (const ln of wrap(`Dirección: ${entrega.direccion}`, Math.floor((width - pad * 2) / 8))) {
        body.push(`<text x="${itemX}" y="${y}" font-size="14" fill="#111827">${esc(ln)}</text>`);
        y += 20;
      }
    }
    if (entrega.diaHora) {
      for (const ln of wrap(`Día/horario: ${entrega.diaHora}`, Math.floor((width - pad * 2) / 8))) {
        body.push(`<text x="${itemX}" y="${y}" font-size="14" fill="#111827">${esc(ln)}</text>`);
        y += 20;
      }
    }
    y += 6;
  }

  const height = y + 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${body.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
