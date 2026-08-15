import ExcelJS from 'exceljs';

const LAPTOPS_SHEET = 'Laptos';
const AUTH_SHEET = 'Autorizacion';

const FIELD_ALIASES = {
  'marca y modelo': 'modelo',
  'n° serial': 'serial',
  'nº serial': 'serial',
  'no serial': 'serial',
  'n serial': 'serial',
  'serial': 'serial',
  'codigo': 'codigo',
  'código': 'codigo',
  'empresa': 'empresa',
  'usuario': 'usuario',
  'caracteristicas': 'caracteristicas',
  'características': 'caracteristicas',
  'celular': 'celular',
  'correo': 'correo',
  'estado': 'estado',
};

let cache = { key: '', laptops: null, phones: null };

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export async function loadWorkbook(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  return wb;
}

export function getLaptops(ws) {
  const headerRow = 4;
  const laptops = [];
  const headers = {};
  ws.getRow(headerRow).eachCell((cell, colNumber) => {
    headers[colNumber] = normalize(cell.value);
  });
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const rec = {};
    let hasData = false;
    for (const [colNumber, key] of Object.entries(headers)) {
      const v = row.getCell(Number(colNumber)).value;
      if (v !== null && v !== undefined && String(v).trim() !== '') hasData = true;
      const finalKey = FIELD_ALIASES[key] || key;
      rec[finalKey] = v !== null && v !== undefined ? String(v).trim() : '';
    }
    if (hasData) laptops.push(rec);
  });
  return laptops;
}

export function getAuthorizedPhones(ws) {
  const phones = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = row.getCell(1).value;
    const phone = row.getCell(2).value;
    if (phone !== null && phone !== undefined && String(phone).trim() !== '') {
      phones.push({ name: name ? String(name).trim() : '', phone: String(phone).trim() });
    }
  });
  return phones;
}

export function normalizePhone(p) {
  return String(p).replace(/\D/g, '');
}

export function isAuthorized(senderPhone, phones) {
  const s = normalizePhone(senderPhone);
  if (!s || phones.length === 0) return false;
  return phones.some(({ phone }) => {
    const a = normalizePhone(phone);
    if (!a) return false;
    if (a === s) return true;
    const suffix = Math.min(9, a.length, s.length);
    if (suffix < 7) return false;
    return s.endsWith(a.slice(-suffix));
  });
}