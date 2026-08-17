import ExcelJS from 'exceljs';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { normalize } from './excel.js';

const UTILES_SHEET = 'Hoja1';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

function imagesDir() {
  return process.env.UTILES_IMAGES_DIR || path.join(process.cwd(), 'imagenes');
}

let _imgDir = null;
let _imgMtime = null;
let _imgFiles = [];

function listImages() {
  const dir = imagesDir();
  let st = null;
  try {
    st = fs.statSync(dir);
  } catch {
    _imgDir = dir;
    _imgFiles = [];
    return _imgFiles;
  }
  if (_imgDir !== dir || _imgMtime !== st.mtimeMs) {
    _imgDir = dir;
    _imgMtime = st.mtimeMs;
    _imgFiles = fs.readdirSync(dir).filter((f) => IMAGE_EXTS.some((e) => f.toLowerCase().endsWith(e)));
  }
  return _imgFiles;
}

function productCode(name) {
  const m = String(name || '').match(/cod\s*-?\s*(\d{3,6})/i);
  return m ? m[1] : null;
}

export function findProductImage(product) {
  if (!product || product.numero == null) return null;
  const dir = imagesDir();
  const base = path.join(dir, String(product.numero));
  for (const ext of IMAGE_EXTS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  const pcode = productCode(product.producto);
  const pname = normalize(product.producto);
  for (const f of listImages()) {
    const baseName = f.slice(0, f.lastIndexOf('.'));
    if (pcode && productCode(baseName) === pcode) return path.join(dir, f);
  }
  for (const f of listImages()) {
    const baseName = f.slice(0, f.lastIndexOf('.'));
    const fn = normalize(baseName);
    if (fn && pname && (fn.includes(pname) || pname.includes(fn))) return path.join(dir, f);
  }
  return null;
}

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
  'unidad', 'unidades', 'unids', 'pcs',
]);

export function getUtilesSheet(wb) {
  return wb.getWorksheet(UTILES_SHEET) || wb.worksheets[0];
}

export function getUtilesProducts(ws) {
  const headers = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = normalize(cell.text);
  });
  let colNumero = null;
  let colProducto = null;
  let colDesc = null;
  let colPrecio = null;
  for (const [col, h] of Object.entries(headers)) {
    if (h === 'numero de producto' && colNumero == null) colNumero = Number(col);
    else if (h === 'producto' && colProducto == null) colProducto = Number(col);
    else if (h === 'descripcion' && colDesc == null) colDesc = Number(col);
    else if (PRICE_ALIASES.includes(h) && colPrecio == null) colPrecio = Number(col);
  }
  const products = [];
  let idx = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const producto = colProducto != null ? row.getCell(colProducto).value : null;
    if (producto === null || producto === undefined || String(producto).trim() === '') return;
    idx += 1;
    const descripcion = colDesc != null ? row.getCell(colDesc).value : null;
    const precioVal = colPrecio != null ? row.getCell(colPrecio).value : null;
    const rawP = precioVal !== null && typeof precioVal === 'object' ? precioVal.result : precioVal;
    const precio = Number(rawP);
    const numeroVal = colNumero != null ? row.getCell(colNumero).value : null;
    const rawN = numeroVal !== null && typeof numeroVal === 'object' ? numeroVal.result : numeroVal;
    const numero = parseInt(String(rawN ?? '').trim(), 10);
    products.push({
      numero: Number.isFinite(numero) ? numero : idx,
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

function matchesWord(t, w) {
  if (w === t) return true;
  if (t.length >= 3 && w.length >= 3) return w.includes(t) || t.includes(w);
  return false;
}

export function findItems(query, products) {
  const q = normalize(query);
  const tokens = tokenizeUtiles(q).filter((t) => !/^[0-9]+$/.test(t));
  if (tokens.length === 0) return [];
  const df = new Map();
  for (const t of tokens) {
    let c = 0;
    for (const p of products) {
      const words = normalize(p.producto).split(/\s+/);
      if (words.some((w) => matchesWord(t, w))) c += 1;
    }
    df.set(t, c);
  }
  const idf = (t) => 1 + Math.log((products.length + 1) / (1 + (df.get(t) || 0)));
  const scored = [];
  for (const p of products) {
    const prod = normalize(p.producto);
    const desc = normalize(p.descripcion);
    const prodWords = prod ? prod.split(/\s+/) : [];
    const descWords = desc ? desc.split(/\s+/) : [];
    let score = 0;
    let hits = 0;
    let nameHits = 0;
    for (const t of tokens) {
      let nameMatch = false;
      let first = false;
      for (let i = 0; i < prodWords.length; i++) {
        if (matchesWord(t, prodWords[i])) {
          nameMatch = true;
          if (i === 0) first = true;
        }
      }
      if (nameMatch) {
        score += idf(t) + (first ? 1 : 0);
        nameHits += 1;
        hits += 1;
      } else if (descWords.some((w) => matchesWord(t, w))) {
        score += idf(t) * 0.4;
        hits += 1;
      }
    }
    if (hits === tokens.length) score += 1;
    if (nameHits >= 1) {
      scored.push({ product: p, score, hits: nameHits });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.hits - a.hits || normalize(a.product.producto).localeCompare(normalize(b.product.producto)));
  return scored.slice(0, 5).map((s) => s.product);
}

const SOFT_SPEC_TOKENS = new Set([
  'nina', 'nino', 'ninas', 'ninos', 'escolar', 'grande', 'grandes', 'mediano', 'medianos',
  'pequeno', 'pequenos', 'pequena', 'pequenas', 'chico', 'chica', 'chicos', 'chicas',
]);

export function isExactMatch(query, product) {
  const name = normalize(product.producto || '');
  const desc = normalize(product.descripcion || '');
  const q = normalize(query);
  const tokens = q
    .split(/[^a-z0-9\u00f1]+/)
    .filter((t) => t.length > 2 && !UTILES_STOPWORDS.has(t));
  const meaningful = tokens.filter((t) => !SOFT_SPEC_TOKENS.has(t));
  const specNumbers = (q.match(/\d{2,}/g) || []).map((n) => String(Number(n)));
  const haystack = `${name} ${desc}`;
  if (specNumbers.some((n) => !haystack.includes(n))) return false;
  if (meaningful.length === 0) return true;
  const nameWords = name.split(/\s+/);
  return meaningful.every((t) => nameWords.some((w) => matchesWord(t, w)));
}

const LIST_HEADER_RE =
  /(grado|curso|paralelo|escuela|colegio|unidad educativa)/;
const LIST_FOOTER_RE =
  /(fecha|entrega|firma|docente|profesor|maestro|nota|observacion|adicional|favor|por favor|agradec|gracias|atentamente|importante|recordar|presentar|presente lista|inicio de clases|debe|deber)/;
const LIST_OMIT_RE =
  /(libro|libros|novela|uniforme|direccion|domicilio|calle|avenida|cdla|urbanizacion|ciudadela|referencia|telefono|celular|correo|email|whatsapp)/;

const UTILES_ITEM_RE =
  /\b(cuaderno|cuadernos|libreta|libretas|carpeta|carpetas|folder|folders|block|bloques|hoja|hojas|papel|papeles|cartulina|cartulinas|a4|a3|pliego|pliegos|esfero|esferos|boligrafo|boligrafos|boli|bolis|lapiz|lapices|lapicera|lapiceras|goma|gomas|borrador|borradores|regla|reglas|escuadra|escuadras|transportador|transportadores|compas|tijera|tijeras|sacapuntas|marcador|marcadores|resaltador|resaltadores|corrector|correctores|punta redonda|punta gruesa|punta fina|colores|crayon|crayones|crayola|crayolas|pintura|pinturas|temperas|acuarela|acuarelas|pincel|pinceles|plastilina|fomix|foami|silicona|siliconas|barra|barras|pegamento|pegamentos|cola|colas|cinta|cintas|adhesivo|adhesivos|mochila|mochilas|cartuchera|cartucheras|lonchera|loncheras|lana|estuche|estuches|geometrico|didactico|escolar|delantal|delantales|forro|forros|diario escolar|archivador|archivadores|mandil|mandiles|rompecabezas|vaso|vasos|individual|individuales|pelota|pelotas)\b/;
const LIMPIEZA_ITEM_RE =
  /\b(escoba|escobas|escobillon|recogedor|recogedores|trapero|traperos|trapeador|trapeadores|trapear|limpion|balde|baldes|jabon|jabones|detergente|detergentes|deja|lavaloza|lavandina|cloro|desinfectante|desinfectantes|limpiador|limpiadores|cepillo|cepillos|dental|toalla|toallas|panitos|humedos|alcohol|higienico|protector solar|absorvent|absorbent|lavable|lavables|labable|labables|esponja|esponjas|guante|guantes)\b/;

const LIST_FRAGMENT_RE =
  /\b(a4|a3|a5|a6|oficio|carta|tamano|cm|mm|metro|metros|hojas|grande|grandes|mediano|medianos|pequeno|pequenos|pequena|pequenas|chico|chica|chicos|chicas|jumbo|triangular|triangulares|espiral|cosido|anillado|cuadriculad|rayad|surtido|surtidos|colores|con goma|con sacapuntas|pack|paquete|docena|nuevo|nueva|premium)\b/;

const SPLIT_LINE_RE = /^(unidades?|unids?|pcs|u)[\s)]*$/;

function mergeSplitLines(lines) {
  const out = [];
  for (const line of lines) {
    const t = normalize(line);
    if (!t) continue;
    const prev = out[out.length - 1];
    const prevT = prev ? normalize(prev) : '';
    if (prev && (/\d\s*\W*$/.test(prevT) && SPLIT_LINE_RE.test(t) || /^para\b/.test(t))) {
      out[out.length - 1] = prev + ' ' + line;
    } else {
      out.push(line);
    }
  }
  return out;
}

export function matchListLines(lines, products) {
  const headers = [];
  const items = [];
  for (const line of mergeSplitLines(lines)) {
    const t = normalize(line);
    if (!t) continue;
    if (/^para\b/.test(t)) continue;
    if (LIST_HEADER_RE.test(t)) {
      headers.push(line);
      continue;
    }
    if (LIST_FOOTER_RE.test(t) || LIST_OMIT_RE.test(t)) continue;
    const hit = findItems(line, products)[0] || null;
    if (hit) {
      items.push({
        nombre: line,
        producto: hit.producto,
        descripcion: hit.descripcion,
        precio: hit.precio,
        qty: 1,
      });
      continue;
    }
    const last = items[items.length - 1];
    if (last && LIST_FRAGMENT_RE.test(t)) {
      last.nombre = last.nombre + ' ' + line;
      const m = findItems(last.nombre, products)[0] || null;
      if (m) {
        last.producto = m.producto;
        last.descripcion = m.descripcion;
        last.precio = m.precio;
      }
      continue;
    }
    if (UTILES_ITEM_RE.test(t) || LIMPIEZA_ITEM_RE.test(t)) {
      items.push({ nombre: line, descripcion: '', precio: null, qty: 1 });
    }
  }
  return { headers, items };
}

export function buildListSteps(headers, items, products, aiOn = false) {
  const steps = [];
  for (const item of items) {
    if (item.precio != null && isExactMatch(item.nombre, { producto: item.producto, descripcion: item.descripcion })) {
      steps.push({ type: 'add', item });
      continue;
    }
    const hits = findItems(item.nombre, products);
    if (hits.length > 0) {
      if (aiOn) {
        steps.push({ type: 'similar', nombre: item.nombre });
      } else {
        steps.push({ type: 'select', nombre: item.nombre, options: hits });
      }
      continue;
    }
    steps.push({ type: 'unavailable', nombre: item.nombre });
  }
  return steps;
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

function wrap(str, max) {
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
}

export async function buildPriceImage(rows, opts = {}) {
  const { entrega, headers = [] } = opts;
  const width = 800;
  const pad = 32;
  const priceCol = 220;
  const qtyCol = 90;
  const qtyX = pad;
  const itemX = pad + qtyCol;
  const priceX = width - pad;
  const fontSize = 15;
  const lineH = 20;
  const body = [];

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
  body.push(`<text x="${qtyX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff">Cantidad</text>`);
  body.push(`<text x="${itemX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff">Producto</text>`);
  body.push(
    `<text x="${priceX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="end">Precio</text>`
  );
  y += 40;

  rows.forEach((r, idx) => {
    const lines = wrap(r.nombre || '', Math.floor((width - pad * 2 - qtyCol - priceCol - 24) / 8));
    const rowH = lines.length * lineH + 14;
    if (idx % 2 === 1) {
      body.push(`<rect x="${pad}" y="${y - 14}" width="${width - pad * 2}" height="${rowH}" rx="6" fill="#f3f4f6"/>`);
    }
    body.push(
      `<text x="${qtyX}" y="${y + (lines.length - 1) * lineH + 2}" font-size="15" font-weight="bold" fill="#111827">${Number(r.qty) || 1}</text>`
    );
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
    if (entrega.nombre) {
      for (const ln of wrap(`A nombre de: ${entrega.nombre}`, Math.floor((width - pad * 2) / 8))) {
        body.push(`<text x="${itemX}" y="${y}" font-size="14" fill="#111827">${esc(ln)}</text>`);
        y += 20;
      }
    }
    if (entrega.genero) {
      for (const ln of wrap(`Para: ${entrega.genero}`, Math.floor((width - pad * 2) / 8))) {
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

export async function buildCatalogoImage(products) {
  const width = 800;
  const pad = 32;
  const priceCol = 160;
  const numCol = 60;
  const itemX = pad + numCol;
  const priceX = width - pad;
  const fontSize = 15;
  const lineH = 20;
  const body = [];

  const total = products.reduce((s, p) => (p.precio != null ? s + Number(p.precio) : s), 0);

  let y = 100;
  body.push(
    `<text x="${pad}" y="${58}" font-size="26" font-weight="bold" fill="#111827">CATÁLOGO DE ÚTILES ESCOLARES</text>`
  );
  body.push(`<rect x="${pad}" y="${y - 16}" width="${width - pad * 2}" height="34" rx="6" fill="#111827"/>`);
  body.push(`<text x="${pad}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff">Nº</text>`);
  body.push(`<text x="${itemX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff">Producto</text>`);
  body.push(
    `<text x="${priceX}" y="${y + 8}" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="end">Precio</text>`
  );
  y += 40;

  products.forEach((p, idx) => {
    const lines = wrap(p.producto || '', Math.floor((width - pad * 2 - priceCol - numCol - 24) / 8));
    const rowH = lines.length * lineH + 14;
    if (idx % 2 === 1) {
      body.push(`<rect x="${pad}" y="${y - 14}" width="${width - pad * 2}" height="${rowH}" rx="6" fill="#f3f4f6"/>`);
    }
    body.push(`<text x="${pad}" y="${y + (lines.length - 1) * lineH + 2}" font-size="15" font-weight="bold" fill="#111827">${p.numero != null ? p.numero : idx + 1}</text>`);
    lines.forEach((ln, i) => body.push(`<text x="${itemX}" y="${y + i * lineH}" font-size="${fontSize}" fill="#111827">${esc(ln)}</text>`));
    body.push(
      `<text x="${priceX}" y="${y + (lines.length - 1) * lineH + 2}" font-size="15" font-weight="bold" text-anchor="end" fill="${p.precio != null ? '#111827' : '#dc2626'}">${p.precio != null ? esc(formatPrice(Number(p.precio))) : 'No disponible'}</text>`
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
    `<text x="${itemX}" y="${y}" font-size="13" fill="#6b7280">Los precios están en dólares (USD).</text>`
  );

  const height = y + 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${body.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function catalogoText(products) {
  const lines = products.map((p) => {
    const price = p.precio != null ? formatPrice(p.precio) : 'No disponible';
    return `${p.numero != null ? p.numero : products.indexOf(p) + 1}. ${p.producto} | ${price}`;
  });
  const header = 'Este es mi catálogo disponible (producto y precio):';
  const tail = 'Escríbeme los números de los productos que deseas, separados por coma.';
  const parts = [];
  let cur = header;
  for (const ln of lines) {
    if ((cur + '\n' + ln).length > 3800 && cur !== header) {
      parts.push(cur);
      cur = ln;
    } else {
      cur += '\n' + ln;
    }
  }
  if (cur) parts.push(cur + '\n\n' + tail);
  return parts;
}