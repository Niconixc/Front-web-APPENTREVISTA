// Valores EXACTOS del backend V2 y utilidades compartidas por las pantallas del panel.
// Ver BackAppEntrevistaV2: ESQUEMAS/ESQUEMA_PREGUNTA.kt y SERVICIOS/SERVICIO_PREGUNTA.kt.

/** V2 acepta jr/mid/sr al recibir, pero siempre responde junior/semisenior/senior: el panel usa los largos. */
export const NIVELES = [
  { value: 'junior', label: 'Junior' },
  { value: 'semisenior', label: 'Semi Senior' },
  { value: 'senior', label: 'Senior' },
];

export const CATEGORIAS = [
  { value: 'tecnica', label: 'Técnica' },
  { value: 'blanda', label: 'Blanda' },
];

export const TIPOS = [
  { value: 'opcion_multiple', label: 'Opción múltiple' },
  { value: 'abierta_texto', label: 'Abierta (texto)' },
  { value: 'simulacion_video', label: 'Simulación (video)' },
];

export const ESTADOS_PREGUNTA = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
];

/** Modelos con precio cargado en V2 (costoLlmUsd): con otro modelo el costo se registraría como 0. */
export const MODELOS_IA = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Anthropic)' },
];

/** Límites de V2. */
export const LIMITES = {
  enunciado: 2000,
  motivoRechazo: 500,
  opcionesMinimas: 2,
  opcionesMaximas: 6,
  preguntasPorGeneracion: 10,
  tamanoPaginaMaximo: 100,
  diasCostosMaximo: 92,
  contrasenaMinima: 8,
  contrasenaMaxima: 128,
};

/** Etiqueta para un valor de una de las listas de arriba; si no la conoce, el valor crudo (o '—'). */
export const etiqueta = (lista, valor) => lista.find((o) => o.value === valor)?.label ?? valor ?? '—';

/** Quita '', null y undefined (y recorta textos) para no mandar parámetros vacíos que V2 rechaza con 400. */
export const limpiarVacios = (objeto = {}) =>
  Object.fromEntries(
    Object.entries(objeto)
      .map(([clave, valor]) => [clave, typeof valor === 'string' ? valor.trim() : valor])
      .filter(([, valor]) => valor !== '' && valor !== null && valor !== undefined)
  );

// ---------- Fechas ----------

/** Fecha con zona u offset (ej. fechaCreacion de una pregunta) en formato local corto. */
export const formatearFecha = (iso) => {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleDateString('es-CL');
};

/** Día UTC 'AAAA-MM-DD' (costos de IA) como DD-MM-AAAA, sin new Date: así no se corre un día en Chile. */
export const formatearDiaUtc = (dia) => {
  const [anio, mes, d] = String(dia || '').split('-');
  return anio && mes && d ? `${d}-${mes}-${anio}` : (dia || '—');
};

/** 'AAAA-MM-DD' de hoy en UTC menos [dias] días (para rangos de costos de IA). */
export const diaUtc = (diasAtras = 0) => new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);

/** Todos los días 'AAAA-MM-DD' entre desde y hasta (incluidos). */
export const diasEntre = (desde, hasta) => {
  const dias = [];
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin && dias.length <= 400; t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
};

/** USD con 4 decimales, o 6 si es un monto muy chico (los costos de IA suelen ser fracciones de centavo). */
export const formatearUsd = (monto) => {
  const n = Number(monto) || 0;
  return `US$ ${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 6 : 4)}`;
};

// ---------- Preguntas: formulario ↔ API ----------

const lineas = (texto) => String(texto || '').split('\n').map((s) => s.trim()).filter(Boolean);
const porComas = (texto) => String(texto || '').split(',').map((s) => s.trim()).filter(Boolean);

export const opcionVacia = () => ({ texto: '', esCorrecta: false, explicacion: '' });

/** Formulario vacío para crear una pregunta. */
export const formularioVacio = () => ({
  enunciado: '',
  categoria: 'tecnica',
  tipo: 'opcion_multiple',
  nivel: 'junior',
  cargoId: '',
  skillId: '',
  respuestaIdeal: '',
  rubricaCriterios: '',
  rubricaPalabrasClave: '',
  rubricaTiempoSeg: '',
  rubricaOriginal: null,
  opciones: [opcionVacia(), opcionVacia(), opcionVacia(), opcionVacia()],
});

/** RespuestaPregunta de V2 → estado del formulario (para editar). */
export const desdeRespuestaPregunta = (p) => {
  const rubrica = p.rubrica && typeof p.rubrica === 'object' ? p.rubrica : null;
  const lista = (v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    enunciado: p.enunciado ?? '',
    categoria: p.categoria ?? 'tecnica',
    tipo: p.tipo ?? 'opcion_multiple',
    nivel: p.nivel ?? 'junior',
    cargoId: p.cargoId ?? '',
    skillId: p.skillId ?? '',
    respuestaIdeal: p.respuestaIdeal ?? '',
    rubricaCriterios: lista(rubrica?.criterios).join('\n'),
    rubricaPalabrasClave: lista(rubrica?.palabras_clave).join(', '),
    rubricaTiempoSeg: rubrica?.tiempo_esperado_seg != null ? String(rubrica.tiempo_esperado_seg) : '',
    // Se conserva entera para no perder claves que el formulario no edita (por ejemplo, las que agrega la IA).
    rubricaOriginal: rubrica,
    opciones: [...(p.opciones || [])]
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((o) => ({ texto: o.texto ?? '', esCorrecta: Boolean(o.esCorrecta), explicacion: o.explicacion ?? '' })),
  };
};

/**
 * Errores de validación del formulario con las mismas reglas que V2 (así el admin los ve antes de enviar).
 * Devuelve un mensaje o null si está bien.
 */
export const validarFormularioPregunta = (form) => {
  const enunciado = form.enunciado.trim();
  if (!enunciado) return 'Escribe el enunciado de la pregunta';
  if (enunciado.length > LIMITES.enunciado) return `El enunciado no puede superar ${LIMITES.enunciado} caracteres`;
  if (!form.cargoId && !form.skillId) return 'Indica el cargo o la skill que evalúa la pregunta';
  if (form.tipo === 'opcion_multiple') {
    const opciones = form.opciones;
    if (opciones.length < LIMITES.opcionesMinimas || opciones.length > LIMITES.opcionesMaximas) {
      return `Una pregunta de opción múltiple lleva entre ${LIMITES.opcionesMinimas} y ${LIMITES.opcionesMaximas} opciones`;
    }
    if (opciones.some((o) => !o.texto.trim())) return 'Todas las opciones necesitan texto';
    if (opciones.filter((o) => o.esCorrecta).length !== 1) return 'Debe haber exactamente una opción correcta';
    const textos = opciones.map((o) => o.texto.trim().toLowerCase());
    if (new Set(textos).size !== textos.length) return 'Hay opciones repetidas';
  } else {
    // Igual que V2: lo que cuenta es lo que realmente se enviará (una rúbrica vaciada al editar no sirve).
    const solicitud = aSolicitudPregunta(form);
    if (!solicitud.respuestaIdeal && !solicitud.rubrica) {
      return 'Indica una respuesta ideal o una rúbrica (criterios o palabras clave) para poder evaluarla';
    }
  }
  return null;
};

/** Estado del formulario → SolicitudPregunta de V2 (POST y PUT). */
export const aSolicitudPregunta = (form) => {
  const esMultiple = form.tipo === 'opcion_multiple';
  const solicitud = {
    tipo: form.tipo,
    categoria: form.categoria,
    nivel: form.nivel,
    enunciado: form.enunciado.trim(),
  };
  if (form.cargoId) solicitud.cargoId = form.cargoId;
  if (form.skillId) solicitud.skillId = form.skillId;

  if (esMultiple) {
    solicitud.opciones = form.opciones.map((o) => {
      const opcion = { texto: o.texto.trim(), esCorrecta: Boolean(o.esCorrecta) };
      if (o.explicacion.trim()) opcion.explicacion = o.explicacion.trim();
      return opcion;
    });
    // El formulario no los muestra para alternativas, pero una pregunta generada con IA puede traerlos: un PUT sin
    // ellos los borraría en V2. Se reenvían tal como vinieron.
    if (form.respuestaIdeal.trim()) solicitud.respuestaIdeal = form.respuestaIdeal.trim();
    if (form.rubricaOriginal && Object.keys(form.rubricaOriginal).length) solicitud.rubrica = form.rubricaOriginal;
    return solicitud;
  }

  if (form.respuestaIdeal.trim()) solicitud.respuestaIdeal = form.respuestaIdeal.trim();
  const criterios = lineas(form.rubricaCriterios);
  const palabras = porComas(form.rubricaPalabrasClave);
  const tiempo = Number.parseInt(form.rubricaTiempoSeg, 10);
  const rubrica = { ...(form.rubricaOriginal || {}) };
  if (criterios.length) rubrica.criterios = criterios; else delete rubrica.criterios;
  if (palabras.length) rubrica.palabras_clave = palabras; else delete rubrica.palabras_clave;
  if (tiempo > 0) rubrica.tiempo_esperado_seg = tiempo; else delete rubrica.tiempo_esperado_seg;
  // V2 exige un objeto (nunca un arreglo) y no acepta una rúbrica vacía como "hay rúbrica".
  if (Object.keys(rubrica).length) solicitud.rubrica = rubrica;
  return solicitud;
};
