const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function isAiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function buildServicesSystem() {
  return `Eres el asesor comercial del estudio digital que vende servicios para negocios. Conversa SIEMPRE en español, con tono cordial, cercano y breve.

SERVICIOS QUE VENDES:
- Agentes de WhatsApp con inteligencia artificial para negocios (venden, cotizan y atienden clientes automáticamente, 24/7).
- Aplicaciones web a medida.
- Páginas web para empresas y emprendimientos.
- Automatización de procesos (tareas manuales repetitivas del negocio).

REGLAS:
- Preséntate y pregunta qué necesita el cliente. En el primer mensaje ofrece ver una DEMO real de un agente de ventas de útiles escolares, para que el cliente vea cómo funciona un agente en acción.
- Si el cliente quiere VER LA DEMO, ver cómo funciona un agente, una muestra/ejemplo de ventas, o pregunta por útiles escolares: responde breve y pon "ir_demo": true.
- NO inventes precios ni tarifas de los servicios: para precios y cotizaciones se coordina con un asesor humano (Evelyn).
- Si el cliente quiere CONTRATAR o COTIZAR un servicio: responde breve y pon "formulario": true para pasar a una encuesta estructurada.
- Si el cliente pide hablar con una persona real: pon "evelyn": true.
- Si el cliente se despide o no le interesa y no queda nada más: responde cordial y pon "despedirse": true.
- Guarda los datos que el cliente te dé (tipo de servicio, nombre del negocio, necesidades, tiempos, presupuesto, etc.) en "requerimientos" como objeto clave-valor.`;
}

export function buildCatalogContext(products) {
  return products
    .map((p) => {
      const price = p.precio != null ? `$${Number(p.precio).toFixed(2)}` : 'no disponible';
      return `${p.numero != null ? p.numero : '?'}. ${p.producto} | ${price}`;
    })
    .join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    carrito: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          producto: { type: 'string' },
          cantidad: { type: 'integer' },
          linea: { type: 'string' },
        },
        required: ['producto', 'cantidad'],
      },
    },
    entrega: {
      type: 'object',
      properties: {
        direccion: { type: 'string' },
        diaHora: { type: 'string' },
        nombre: { type: 'string' },
        genero: { type: 'string' },
        domicilio: { type: 'boolean' },
      },
    },
    pedido_finalizado: { type: 'boolean' },
    despedirse: { type: 'boolean' },
    enviar_catalogo: { type: 'boolean' },
    enviar_cotizacion: { type: 'boolean' },
    recibir_lista: { type: 'boolean' },
    enviar_foto: { type: 'array', items: { type: 'integer' } },
    sugerir_accesorios: { type: 'boolean' },
  },
  required: ['reply'],
};

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    es_comprobante: { type: 'boolean' },
    monto: { type: 'number' },
    titular: { type: 'string' },
    fecha: { type: 'string' },
    ok: { type: 'boolean' },
    motivo: { type: 'string' },
  },
  required: ['ok'],
};

const SIMILAR_SCHEMA = {
  type: 'object',
  properties: {
    disponible: { type: 'boolean' },
    propuesto: { type: 'integer' },
    motivo: { type: 'string' },
  },
  required: ['disponible', 'propuesto', 'motivo'],
};

const SERVICES_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    ir_demo: { type: 'boolean' },
    formulario: { type: 'boolean' },
    evelyn: { type: 'boolean' },
    despedirse: { type: 'boolean' },
    requerimientos: { type: 'object' },
  },
  required: ['reply'],
};

const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 15000;

async function geminiFetch(url, body) {
  let lastErr = null;
  for (let i = 0; i <= 1; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if ((res.status === 429 || res.status >= 500) && i === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i === 0) await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr ?? new Error('Gemini fetch fallido');
}

function geminiUrl() {
  return `${API_URL}/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
}

export async function askGeminiReceipt(system, image, imageMimeType = 'image/jpeg') {
  if (!isAiEnabled()) return null;
  let res;
  try {
    res = await geminiFetch(geminiUrl(), {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: imageMimeType, data: image } }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: RECEIPT_SCHEMA,
      },
    });
  } catch (err) {
    console.error('[ai] timeout/red Gemini (comprobante)', err?.name || err);
    return null;
  }
  if (!res.ok) {
    console.error('[ai] error Gemini (comprobante)', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return parseJsonText(text);
  } catch (err) {
    console.error('[ai] respuesta JSON inválida de Gemini (comprobante):', err.message, text.slice(0, 300));
    return null;
  }
}

function parseJsonText(text) {
  if (!text) return null;
  const direct = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  if (direct && typeof direct === 'object') return direct;
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return JSON.parse(m[1].trim());
  return null;
}

export async function askGeminiSimilar(query, products) {
  if (!isAiEnabled() || !Array.isArray(products) || products.length === 0) return null;
  const system = `Eres un asesor de una tienda de útiles escolares y limpieza en Ecuador (precios en dólares USD). El cliente pidió un producto que quizás no existe tal cual en el catálogo. Debes decidir si ALGÚN producto del catálogo cumple el MISMO OBJETIVO del pedido, aunque sea otra marca, tamaño o presentación (por ejemplo: un cuaderno de 60 hojas se cubre con uno de 100 hojas; un juego de reglas de 20 cm se cubre con el juego geométrico de 20 cm). NUNCA inventes productos ni precios.

CATÁLOGO (numero | producto | precio):
${buildCatalogContext(products)}

Pedido del cliente: "${query}"

Responde JSON:
- "disponible": true solo si existe un producto del catálogo que cumple el mismo objetivo del pedido; false si NINGÚN producto lo cumple.
- "propuesto": el número (numero) del producto que mejor cumple el objetivo cuando disponible es true; 0 cuando no.
- "motivo": breve y amable en español (máximo 2 frases) explicando por qué ese producto cubre el pedido, o por qué no disponemos del producto.`;
  let res;
  try {
    res = await geminiFetch(geminiUrl(), {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: '¿Qué producto del catálogo cubre este pedido?' }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: SIMILAR_SCHEMA,
      },
    });
  } catch (err) {
    console.error('[ai] timeout/red Gemini (similar)', err?.name || err);
    return null;
  }
  if (!res.ok) {
    console.error('[ai] error Gemini (similar)', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return parseJsonText(text);
  } catch (err) {
    console.error('[ai] respuesta JSON inválida de Gemini (similar):', err.message, text.slice(0, 300));
    return null;
  }
}

export function resolveSimilarResult(result, products) {
  if (!result || result.disponible !== true) return null;
  const n = Number(result.propuesto);
  const product = Array.isArray(products) ? products.find((x) => x.numero === n) : null;
  if (!product) return null;
  return { product, motivo: String(result.motivo || '').trim() };
}

export async function askGeminiServices(system, history) {
  if (!isAiEnabled()) return null;
  const contents = (history || []).map((m) => ({
    role: m.role,
    parts: Array.isArray(m.parts) ? m.parts : [{ text: String(m.text ?? '') }],
  }));
  let res;
  try {
    res = await geminiFetch(geminiUrl(), {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: SERVICES_SCHEMA,
      },
    });
  } catch (err) {
    console.error('[ai] timeout/red Gemini (servicios)', err?.name || err);
    return null;
  }
  if (!res.ok) {
    console.error('[ai] error Gemini (servicios)', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return parseJsonText(text);
  } catch (err) {
    console.error('[ai] respuesta JSON inválida de Gemini (servicios):', err.message, text.slice(0, 300));
    return null;
  }
}

export async function askGemini(system, history, opts = {}) {
  if (!isAiEnabled()) return null;
  const { image, imageMimeType } = opts;
  const contents = (history || []).map((m) => ({
    role: m.role,
    parts: Array.isArray(m.parts) ? m.parts : [{ text: String(m.text ?? '') }],
  }));
  if (image) {
    contents.push({
      role: 'user',
      parts: [{ inlineData: { mimeType: imageMimeType || 'image/jpeg', data: image } }],
    });
  }
  let res;
  try {
    res = await geminiFetch(geminiUrl(), {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });
  } catch (err) {
    console.error('[ai] timeout/red Gemini', err?.name || err);
    return null;
  }
  if (!res.ok) {
    console.error('[ai] error Gemini', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return parseJsonText(text);
  } catch (err) {
    console.error('[ai] respuesta JSON inválida de Gemini:', err.message, text.slice(0, 300));
    return null;
  }
}