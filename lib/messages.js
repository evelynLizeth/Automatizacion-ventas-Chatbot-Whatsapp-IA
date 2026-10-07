import { formatPrice } from './utiles.js';

export const STATES = {
  SERVICIOS: 'SERVICIOS',
  SALUDO: 'SALUDO',
  ESPERA_LISTA: 'ESPERA_LISTA',
  ASESOR: 'ASESOR',
  NUMEROS: 'NUMEROS',
  SELECCION: 'SELECCION',
  UNICO: 'UNICO',
  CANTIDAD: 'CANTIDAD',
  AGREGADO: 'AGREGADO',
  ELIMINAR: 'ELIMINAR',
  SUGERENCIA: 'SUGERENCIA',
  CONFIRMA_SUGERENCIA: 'CONFIRMA_SUGERENCIA',
  MODELO_MOCHILA: 'MODELO_MOCHILA',
  CONFIRMA_COTIZACION: 'CONFIRMA_COTIZACION',
  GENERO: 'GENERO',
  CONFIRMA_ARCHIVO: 'CONFIRMA_ARCHIVO',
  PREGUNTA_PRODUCTO: 'PREGUNTA_PRODUCTO',
  PREGUNTA_DISPONIBLE: 'PREGUNTA_DISPONIBLE',
  ENTREGA: 'ENTREGA',
  UBICACION: 'UBICACION',
  DIA_HORA: 'DIA_HORA',
  NOMBRE_ENTREGA: 'NOMBRE_ENTREGA',
  CONFIRMA_ENTREGA: 'CONFIRMA_ENTREGA',
  ESPERA_COMPROBANTE: 'ESPERA_COMPROBANTE',
  ESPERA_CONFIRMACION_RECIBO: 'ESPERA_CONFIRMACION_RECIBO',
  PICKUP_AGENDA: 'PICKUP_AGENDA',
  IA_CHAT: 'IA_CHAT',
  IA_CONFIRMA_PEDIDO: 'IA_CONFIRMA_PEDIDO',
  CHATBOT: 'CHATBOT',
  CHATBOT_CONFIRMA: 'CHATBOT_CONFIRMA',
  CHATBOT_EDITAR: 'CHATBOT_EDITAR',
  RESOLVER_LISTA: 'RESOLVER_LISTA',
  DESACTIVADO: 'DESACTIVADO',
};

export const MIN_5 = 5 * 60 * 1000;
export const MIN_9 = 9 * 60 * 1000;

export const CATALOGO_URL = 'https://wa.me/c/593987695938';
export const DOMICILIO_RECARGO = Number(process.env.DOMICILIO_RECARGO) || 3;
export const IA_CONFIRMA_PEDIDO_MSG = '¿Confirmas tu pedido?';

export const SALUDO_REPLY =
  '¡Hola! Soy el asistente virtual.\n¿Qué deseas hacer?\n1. Realizar una cotización de útiles escolares con asistencia de IA.\n2. Comunicarme con Evelyn.\n3. Solicitar un Chatbot Inteligente para mi negocio.';
export const SERVICIOS_REPLY =
  '¡Hola! Soy el agente virtual del estudio de desarrollo.\nDiseñamos agentes de WhatsApp con IA para tu negocio, aplicaciones web, páginas web a medida y automatización de procesos.\n¿Qué deseas hacer?\n1. Ver una DEMO de un agente de ventas de útiles escolares en acción.\n2. Información o cotización de un servicio.\n3. Hablar con Evelyn.';
export const DEMO_INTRO =
  '¡Perfecto! Te muestro una demo real de un agente de ventas de útiles escolares. Observa cómo conversa, cotiza y vende automáticamente.\n\nPara terminar la demo y volver al menú principal, escribe "salir de la demo".';
export const DEMO_OUTRO =
  '¡Gracias por ver la demo! Así trabaja un agente con IA: atiende, cotiza y vende por ti 24/7.\n¿Te gustaría uno similar para tu negocio?';
export const SERVICIOS_SOLO_TEXTO =
  'Gracias. Por ahora solo respondo por texto en el menú principal. Escríbeme tu consulta o elige una opción del menú.';
export const EXIT_DEMO_RE =
  /(salir de la demo|salir de demo|terminar la demo|terminar demo|finalizar la demo|finalizar demo|cerrar la demo|cerrar demo|volver al menu principal|volver al menu|volver al inicio|fin de la demo|fin demo|ya entendi|ya entendí|ya vi la demo|ya vi como funciona)/;
export const PIDE_LISTA =
  'Perfecto. Envíame tu lista de útiles: puedes escribirla en el chat o adjuntarla en PDF o Excel. Si son varios productos, escríbelos uno por línea. También puedes ver los productos disponibles.';
export const PIDE_NUMEROS =
  'Escríbeme los números de los artículos que deseas, separados por coma (ejemplo: 1,5,12).';
export const NUMEROS_INVALID =
  'No entendí los números. Escríbelos separados por coma, por ejemplo: 1,5,12.';
export const DESPEDIDA = '¡Perfecto! Hasta luego. Si me necesitas, aquí estaré.';
export const SALUDO_NO_REPLY = 'Ok, de aquí en adelante Evelyn chateará contigo.';
export const NO_ENCONTRADO =
  'No encontré ningún producto con ese nombre. Prueba con otro nombre o deseas ver los productos disponibles?.';
export const NONE_FOUND_LIST =
  'No encontré ninguno de los productos de tu lista. Verifica los nombres y envíame la lista de nuevo.';
export const PROCESANDO_LISTA =
  'Perfecto, recibí tu documento. Espera un momento, estoy armando tu cotización...';
export const PROCESANDO_LISTA_IA =
  'He recibido tu lista de útiles y ya te estoy preparando la cotización inicial con los productos que tenemos disponibles. Espera un momento por favor';
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const iaImageReplyDelay = () => Number(process.env.IA_IMAGEN_REPLY_DELAY_MS) || 2000;
export const CONFIRMA_ARCHIVO_MSG = 'Recibí tu archivo. ¿Genero la cotización con esa lista?';
export const PREGUNTA_PRODUCTO_MSG = '¿Deseas preguntar por un producto específico?';
export const PREGUNTA_DISPONIBLE_MSG = '¿Deseas ver lo que tengo disponible?';
export const PIDE_PRODUCTO = 'Perfecto. Dime qué producto deseas consultar.';
export const ARCHIVO_NO_RECIBIDO =
  'Entiendo. No recibí tu archivo o no pude procesarlo. Por favor adjúntalo de nuevo en PDF o Excel, o escríbeme la lista por mensaje (un producto por línea).';
export const ESPERA_GENERANDO =
  'Estoy generando tu cotización, un momento. ¿Prefieres esperar a que termine, o escribes "completar el pedido" para detener la cotización y ajustar tu pedido?';
export const PIDES_CANTIDAD = '¿Cuántas unidades deseas? (ejemplo: 2)';
export const QTY_INVALID = 'No entendí la cantidad. Por favor dime cuántas unidades deseas (ejemplo: 3).';
export const MENU_AGREGADO =
  '¿Deseas agregar algo más a tu cotización, eliminar algún producto, o ver tu cotización final?';
export const CUAL_DESEAS = '¿Cuál deseas? Responde con el número o el nombre del producto.';
export const PICK_INVALID = 'No entendí tu respuesta. ' + CUAL_DESEAS;
export const NO_DISPONIBLE_MSG = (nombre) => `No disponemos de "${nombre}" en este momento.`;
export const NO_INCLUYO_MSG = (nombre) => `Entendido, no incluiré "${nombre}" en tu cotización.`;
export const AGREGADO_LISTA_MSG = (producto) => `¡Listo! Agregué ${producto} a tu cotización.`;
export const PIDE_AGREGAR = 'Perfecto. ¿Qué producto deseas agregar?';
export const PIDE_ELIMINAR = '¿Cuál deseas eliminar? Responde con el número o el nombre del producto.';
export const CONFIRMA_COTIZACION_MSG =
  '¿Estás de acuerdo con la cotización? Si deseas ajustar algo, dime qué producto agregar o quitar.';
export const PIDE_GENERO = '¿Tu lista de útiles es para niña, niño, adolescente, hombre o mujer? Dime cuál.';
export const ENTREGA_MSG = '¿Prefieres entrega a domicilio o ir a retirar tu pedido?';
export const PIDE_UBICACION = 'Envíame la dirección donde quieres recibir tu pedido.';
export const PIDE_DIA_HORA = '¿Qué día y a qué hora deseas que te entreguemos?';
export const PIDE_NOMBRE_ENTREGA = '¿A nombre de quién realizamos la entrega?';
export const CONFIRMA_ENTREGA_MSG =
  'Esta es tu cotización con los datos de entrega.\n¿Confirmas tu pedido o prefieres no continuar?';
export const PAYMENT_REPLY = (anticipo) =>
  anticipo != null
    ? `El pago se realiza por transferencia: el anticipo del 50% (${formatPrice(anticipo)}) para confirmar tu pedido (no reembolsable) y el resto al momento de la entrega.`
    : 'El pago se realiza por transferencia: la mitad para confirmar tu pedido (no reembolsable) y el resto al momento de la entrega.';
export const PAYMENT_TODO_RETIRO = (anticipo) =>
  anticipo != null
    ? `¡Claro que sí! Por políticas de seguridad, para confirmar tu pedido solicitamos el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) por transferencia a nombre de Evelyn Lizeth Zambrano y el restante al momento de la entrega o retiro. Así aseguramos tu reserva. ¿Te parece bien?`
    : '¡Claro que sí! Por políticas de seguridad, para confirmar tu pedido solicitamos el anticipo del 50% (no reembolsable) por transferencia a nombre de Evelyn Lizeth Zambrano y el restante al momento de la entrega o retiro. Así aseguramos tu reserva. ¿Te parece bien?';
export const PAYMENT_PICKUP = (anticipo) =>
  `Para confirmar tu pedido, te agradezco que me envíes el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) a nombre de Evelyn Lizeth Zambrano y el resto al retirarlo. Envíame una foto de tu comprobante.`;
export const PAYMENT_DELIVERY = (anticipo) =>
  `Para confirmar tu pedido, te agradezco que me envíes el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) a nombre de Evelyn Lizeth Zambrano y el resto al momento de la entrega. Envíame una foto de tu comprobante.`;
export const PAYMENT_IA = (anticipo) =>
  `Para confirmar tu pedido, transfiere el anticipo del 50%: ${formatPrice(anticipo)} (no reembolsable) a nombre de Evelyn Lizeth Zambrano y el resto al momento de la entrega o retiro. Envíame una foto de tu comprobante.`;
export const COMPROBANTE_MANUAL = (anticipo) =>
  `Recibimos tu comprobante, gracias. Verificaremos que el anticipo del 50% (${formatPrice(anticipo)}) (no reembolsable) se realizó a nombre de Evelyn Lizeth Zambrano con fecha de hoy y te confirmaremos tu pedido en breve.`;
export const COMPROBANTE_OK_IA = (monto) =>
  `¡Gracias! Verificamos tu comprobante por ${formatPrice(monto)} a nombre de Evelyn Lizeth Zambrano. Tu pedido quedó confirmado. ¡Muchas gracias por tu compra!`;
export const COMPROBANTE_MAL_IA = (motivo, anticipo) =>
  `Revisamos tu comprobante y encontramos un detalle: ${motivo}. Recuerda que el anticipo debe ser ${formatPrice(anticipo)} (50% del total) a nombre de Evelyn Lizeth Zambrano. Verifica y reenvía tu comprobante.`;
export const COMPROBANTE_MAL_VARIANTS = [
  (motivo, anticipo) =>
    `Con gusto revisamos tu imagen y encontramos un detalle: ${motivo}. El anticipo esperado es ${formatPrice(anticipo)} (50% del total) a nombre de Evelyn Lizeth Zambrano. Por favor verifica y reenvía el comprobante, estaré pendiente.`,
  (motivo, anticipo) =>
    `Gracias por tu paciencia. Aún hay un detalle: ${motivo}. Asegúrate de que el monto sea ${formatPrice(anticipo)} y que la cuenta figure a nombre de Evelyn Lizeth Zambrano, y envíame nuevamente la captura.`,
  (motivo) =>
    `No te preocupes, tranquilo(a). Todavía no logramos verificar el comprobante: ${motivo}. Si te resulta difícil, puedo conectar a un asesor para ayudarte a completar tu pedido sin problema. ¿Prefieres eso?`,
];
export const COMPROBANTE_MISMA_IMAGEN =
  'Recibimos la misma imagen del comprobante anterior. Si los datos son correctos y el pago ya está hecho, escríbeme "ok" y la damos por confirmada; si prefieres, reenvía una nueva captura y con gusto la reviso.';
export const PIDE_COMPROBANTE_OTRA_VEZ =
  'Espero tu comprobante de transferencia para poder procesar tu pedido. Por favor adjúntalo como imagen (captura) o documento.';
export const RETIRO_LISTO =
  'Tu pedido estará listo el día viernes, por favor me escribes indicándome a qué hora lo puedes retirar.';
export const RETIRO_DESPEDIDA = 'Gracias por tu compra, nos vemos el viernes.';
export const ENTREGA_MOTORIZADO =
  'Gracias por realizar tu pedido, un motorizado realizará la entrega según lo acordado.';
export const DESPEDIDA_ABANDONO =
  'No hay problema. Quedamos a tus órdenes para cuando lo necesites. ¡Hasta pronto!';
export const ASESOR_MSG =
  'Por favor sube tu documento y en cuanto pueda un asesor realizará la cotización personalmente y te la enviará. Si necesitas algo, estoy aquí.';
export const ASESOR_GRACIAS = 'Gracias, en cuanto esté lista la cotización te la enviaremos.';
export const ASESOR_DESPEDIDA =
  '¡Perfecto! Un asesor revisará tu documento y te enviará la cotización. ¡Hasta luego!';
export const SUGERENCIA_MSG =
  'Tal vez te interesen mochilas, cartucheras o loncheras. Si gustas, te muestro fotos de los modelos; o si prefieres, te presento tu cotización de los productos que agregaste.';
export const CONFIRMA_SUGERENCIA_MSG =
  '¿Te gustaría agregar alguno de estos modelos a tu pedido? Dime cuál y te lo agrego.';
export const MODELO_MSG = '¿Qué color o modelo deseas? Responde con el nombre o el número del producto.';
export const FOTOS_REPLY = `Las fotos disponibles están en nuestro catálogo: ${CATALOGO_URL} (mochilas, cartucheras y loncheras). Para el resto de productos puedo darte precio y descripción.`;
export const FOTO_NO_OCR = 'No puedo leer fotos. Por favor escribe tu lista de útiles por mensaje o adjúntala en PDF o Excel.';
export const FILE_UNREADABLE = 'No pude leer el archivo. Envíalo en PDF o Excel, o escríbeme la lista por mensaje.';
export const TIMEOUT_1 = '¿Sigues ahí? Si deseas continuar con tu cotización, solo escríbeme.';
export const TIMEOUT_2 = 'El chat se cerrará por falta de respuesta.';
export const BOT_CHALLENGE_MSG =
  'Para seguir atendiéndote, por favor escríbeme solo el número 7.';
export const BOT_COOLDOWN_MSG =
  'Te paso con Evelyn para seguir por humano. Volveré a responderte en un rato.';
export const BOT_DEGRADED_NOTE =
  'Te atiendo en modo simple (sin IA) por ahora.';
export const AI_FALLBACK =
  'Disculpa, no pude procesar tu mensaje. Inténtalo de nuevo o escríbeme los productos que deseas (uno por línea).';
export const AI_INTRO =
  '¡Perfecto! Ya puedes escribirme tu lista de útiles, adjuntarla en PDF o Excel, preguntarme por un producto o pedirme el catálogo. ¿Qué deseas hacer?';

export const CHATBOT_FIELDS = [
  { key: 'servicio', label: 'Tipo de servicio', q: '¿Qué tipo de servicio deseas?\n1. Agente de WhatsApp para tu negocio\n2. Aplicación web\n3. Página web a medida\n4. Automatización de procesos' },
  { key: 'negocio', label: 'Nombre del negocio', q: 'Para empezar, ¿cuál es el nombre de tu negocio y a qué se dedica?' },
  { key: 'productos', label: 'Productos o servicios', q: '¿Qué productos o servicios ofreces?' },
  { key: 'canales', label: 'Canales de atención actuales', q: '¿Por qué medios atiendes hoy a tus clientes? (WhatsApp, Instagram, página web, tienda física...)' },
  { key: 'tareas', label: 'Tareas del agente', q: '¿Qué tareas debería realizar tu agente? (responder preguntas frecuentes, cotizaciones, ventas, agendar citas, recolectar datos...)' },
  { key: 'volumen', label: 'Consultas al día', q: '¿Aproximadamente cuántas consultas de clientes recibes al día?' },
  { key: 'catalogo', label: 'Catálogo o información disponible', q: '¿Ya tienes un catálogo de productos, precios o procesos en algún documento (Excel, PDF, web) que el agente pueda usar?' },
  { key: 'integraciones', label: 'Integraciones e idioma', q: '¿Necesitas integraciones (pagos, inventario, agenda, tu sistema) y en qué idioma atiendes a tus clientes?' },
  { key: 'contacto', label: 'Nombre y horario de contacto', q: 'Por último, ¿a qué nombre y en qué horario te contacta el asesor?' },
];
export const CHATBOT_INTRO =
  '¡Claro! Con gusto te ayudo a levantar los requerimientos de tu servicio. Te haré algunas preguntas rápidas.';
export const CHATBOT_PIDE_APROBACION =
  '\n\n¿Estás de acuerdo con estos requerimientos? Responde sí, no, o dime qué deseas corregir.';
export const CHATBOT_APROBADO =
  '¡Perfecto! Quedaron registrados los requerimientos de tu servicio. Un asesor se pondrá en contacto contigo personalmente para concretar tu pedido. ¡Gracias por tu interés!';
export const CHATBOT_SOLO_TEXTO =
  'Gracias. Por ahora solo necesito tus respuestas por texto para completar los requerimientos. Sigue con la pregunta actual.';
