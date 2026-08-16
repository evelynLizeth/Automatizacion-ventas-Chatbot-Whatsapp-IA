const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function isAiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
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

function parseJsonText(text) {
  if (!text) return null;
  const direct = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  if (direct && typeof direct === 'object') return direct;
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return JSON.parse(m[1].trim());
  return null;
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
  const res = await fetch(
    `${API_URL}/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );
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