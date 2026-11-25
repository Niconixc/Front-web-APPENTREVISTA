// Preguntas parecidas o duplicadas (similitud del backend V2): descartadas y resumen de generar-ia, GET /similares,
// GET /duplicadas y `similares` en las respuestas de crear, editar y aprobar.
// Todo es aditivo: un backend anterior no manda estos campos ni tiene esas rutas, y el panel sigue funcionando igual.
// El parecido solo mide palabras compartidas: una paráfrasis con otro vocabulario no aparece.
// Funciones puras: se prueban en tests/similitud.test.mjs.
import { CATEGORIAS, NIVELES, TIPOS } from './etiquetas.js';

/** Motivo EXACTO con que se rechaza una duplicada: no hay endpoint aparte, se usa PATCH .../rechazar con este motivo. */
export const MOTIVO_DUPLICADA = 'duplicada';

/** Variable del backend con el parecido mínimo (0.80 por defecto; 0 apaga el filtro de generar-ia). */
export const VARIABLE_UMBRAL = 'UMBRAL_SIMILITUD_PREGUNTAS';

/** Parecido mínimo que se puede elegir al buscar duplicadas. '' deja el del servidor. V2 acepta de 0.5 a 1. */
export const UMBRALES = [
  { value: '', label: 'Por defecto' },
  { value: '0.95', label: '95 % (casi idénticas)' },
  { value: '0.9', label: '90 %' },
  { value: '0.85', label: '85 %' },
  { value: '0.8', label: '80 %' },
  { value: '0.7', label: '70 %' },
  { value: '0.6', label: '60 %' },
  { value: '0.5', label: '50 % (muy amplio)' },
];

const texto = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

const numero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Para comparar enunciados: minúsculas, sin tildes y con un solo espacio. */
const normalizar = (t) => texto(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Similitud de 0 a 1 → «92 %» (también acepta 0 a 100). Sin un dato válido, '—'. Bajo 1 nunca dice «100 %»: eso
 * queda para las idénticas.
 */
export const porcentajeSimilitud = (similitud) => {
  const n = numero(similitud);
  if (n === null || n < 0) return '—';
  const pct = n <= 1 ? n * 100 : n;
  if (pct > 100) return '—';
  const redondeado = Math.round(pct);
  return `${redondeado === 100 && pct < 100 ? 99 : redondeado} %`;
};

/**
 * Una pregunta parecida, venga de /similares, de `similares` (crear, editar, aprobar), de `similar_a` (generar-ia) o de
 * un grupo de /duplicadas. Acepta camelCase y snake_case. null si no trae ni id ni enunciado.
 * id puede faltar: en generar-ia, la parecida puede ser otra del mismo lote que no se guardó.
 */
export const leerSimilar = (item) => {
  if (!item || typeof item !== 'object') return null;
  const id = texto(item.id ?? item.preguntaId ?? item.pregunta_id).trim() || null;
  const enunciado = texto(item.enunciado).trim();
  if (!id && !enunciado) return null;
  return {
    id,
    enunciado,
    estado: texto(item.estado).trim() || null,
    similitud: numero(item.similitud),
    vecesUsada: numero(item.vecesUsada ?? item.veces_usada),
  };
};

/** Lista de parecidas: un arreglo o un objeto con `similares` (o `elementos`). Sin datos, []. */
export const leerSimilares = (data) => {
  let lista = [];
  if (Array.isArray(data)) lista = data;
  else if (Array.isArray(data?.similares)) lista = data.similares;
  else if (Array.isArray(data?.elementos)) lista = data.elementos;
  return lista.map(leerSimilar).filter(Boolean);
};

/** La respuesta de crear, editar o aprobar trae `similares`. Un backend anterior no lo manda. */
export const traeSimilares = (data) => Boolean(data) && typeof data === 'object' && Array.isArray(data.similares);

/** Texto corto para avisar después de crear, editar o aprobar. '' si no hay parecidas. */
export const avisoSimilares = (similares) => {
  const n = Array.isArray(similares) ? similares.length : 0;
  if (n === 0) return '';
  return n === 1
    ? 'Se parece a 1 pregunta del banco. Es solo un aviso: no bloquea nada.'
    : `Se parece a ${n} preguntas del banco. Es solo un aviso: no bloquea nada.`;
};

// ---------- Generar con IA ----------

const ETIQUETAS_RESUMEN = {
  solicitadas: 'Pedidas a la IA',
  pedidas: 'Pedidas a la IA',
  recibidas: 'Recibidas de la IA',
  generadas: 'Generadas',
  guardadas: 'Guardadas',
  descartadas: 'Descartadas por parecidas',
  con_error: 'Con error',
  conError: 'Con error',
  umbral: 'Parecido mínimo',
  modo: 'Modo',
  modo_sombra: 'Modo sombra',
  modoSombra: 'Modo sombra',
};

const CLAVES_TEXTO_RESUMEN = ['mensaje', 'texto', 'detalle'];

const etiquetaResumen = (clave) => {
  if (ETIQUETAS_RESUMEN[clave]) return ETIQUETAS_RESUMEN[clave];
  const palabras = clave.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
};

const valorResumen = (clave, valor) => {
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (clave === 'umbral' && typeof valor === 'number') return porcentajeSimilitud(valor);
  if (clave === 'modo' && valor === 'sombra') return 'Sombra (solo informa, no filtra)';
  return String(valor);
};

/**
 * `resumen` de generar-ia para mostrarlo: {texto, filas: [{clave, etiqueta, valor}]}. Si llega como texto se muestra tal
 * cual; si llega como objeto, sus datos simples van en filas. null si no vino o viene vacío.
 */
export const leerResumenGeneracion = (resumen) => {
  if (typeof resumen === 'string') return resumen.trim() ? { texto: resumen.trim(), filas: [] } : null;
  if (!resumen || typeof resumen !== 'object' || Array.isArray(resumen)) return null;
  const textoResumen = CLAVES_TEXTO_RESUMEN.map((c) => resumen[c]).find((v) => typeof v === 'string' && v.trim());
  const filas = Object.entries(resumen)
    .filter(([clave, v]) => !CLAVES_TEXTO_RESUMEN.includes(clave) && ['string', 'number', 'boolean'].includes(typeof v))
    .map(([clave, valor]) => ({ clave, etiqueta: etiquetaResumen(clave), valor: valorResumen(clave, valor) }));
  if (!textoResumen && filas.length === 0) return null;
  return { texto: textoResumen ? textoResumen.trim() : null, filas };
};

/**
 * Descartadas de generar-ia: [{enunciado, similarA, guardada, guardadaId}]. similarA es la pregunta a la que se parecía.
 * guardada dice si igual quedó guardada (modo sombra: el backend informa qué descartaría, pero no filtra), y guardadaId
 * es su id para revisarla.
 */
export const leerDescartadas = (data) => {
  const lista = Array.isArray(data?.descartadas) ? data.descartadas : [];
  const guardadas = Array.isArray(data?.preguntas) ? data.preguntas : [];
  return lista
    .filter((d) => d && typeof d === 'object')
    .map((d) => {
      const enunciado = texto(d.enunciado).trim();
      const guardada = enunciado
        ? guardadas.find((p) => p && normalizar(p.enunciado) === normalizar(enunciado))
        : null;
      return {
        enunciado,
        similarA: leerSimilar(d.similar_a ?? d.similarA),
        guardada: Boolean(guardada),
        guardadaId: guardada ? texto(guardada.pregunta_id ?? guardada.id).trim() || null : null,
      };
    });
};

/**
 * Lo que dice la respuesta de generar-ia sobre lo guardado y lo descartado.
 * todasDescartadas: V2 responde 200 (no 201) con preguntas: [] cuando la IA generó, pero todo se parecía a otras.
 */
export const resumenGeneracion = (data) => {
  const preguntas = Array.isArray(data?.preguntas) ? data.preguntas : [];
  const descartadas = leerDescartadas(data);
  const generadas = numero(data?.preguntas_generadas) ?? preguntas.length;
  const numDescartadas = Math.max(numero(data?.preguntas_descartadas) ?? 0, descartadas.length);
  return {
    generadas,
    conError: numero(data?.preguntas_con_error) ?? 0,
    numDescartadas,
    descartadas,
    todasDescartadas: generadas === 0 && preguntas.length === 0 && numDescartadas > 0,
    modoSombra: descartadas.some((d) => d.guardada),
    resumen: leerResumenGeneracion(data?.resumen),
  };
};

/** Título del resultado de una generación según lo que se guardó y lo que se descartó. */
export const tituloResultadoGeneracion = ({ generadas, numDescartadas, todasDescartadas, modoSombra }) => {
  if (todasDescartadas) {
    return numDescartadas === 1
      ? 'No se guardó la pregunta: se parecía a otra del banco'
      : `No se guardó ninguna pregunta: las ${numDescartadas} se parecían a otras del banco`;
  }
  const base = `Preguntas generadas: ${generadas}. Quedan pendientes de aprobación`;
  if (!numDescartadas) return base;
  if (modoSombra) return `${base}. ${numDescartadas === 1 ? '1 se habría descartado' : `${numDescartadas} se habrían descartado`} por parecerse a otras`;
  return `${base}. ${numDescartadas === 1 ? '1 se descartó' : `${numDescartadas} se descartaron`} por parecerse a otras`;
};

// ---------- Duplicadas del banco ----------

/** Grupos de GET /duplicadas: [{similitudMaxima, preguntas: [{id, enunciado, estado, vecesUsada, similitud}]}]. */
export const leerGruposDuplicadas = (data) => {
  let lista = [];
  if (Array.isArray(data)) lista = data;
  else if (Array.isArray(data?.grupos)) lista = data.grupos;
  else if (Array.isArray(data?.elementos)) lista = data.elementos;
  return lista
    .filter((g) => g && typeof g === 'object')
    .map((g) => ({
      similitudMaxima: numero(g.similitudMaxima ?? g.similitud_maxima),
      preguntas: (Array.isArray(g.preguntas) ? g.preguntas : []).map(leerSimilar).filter(Boolean),
    }))
    .filter((g) => g.preguntas.length > 0);
};

/** Cuántas del grupo siguen activas (no rechazadas). Con 1 o menos, el grupo ya quedó limpio. */
export const activasDelGrupo = (grupo) => (grupo?.preguntas || []).filter((p) => p.estado !== 'rechazada').length;

const PRIORIDAD_ESTADO = { aprobada: 2, pendiente: 1 };

/**
 * La que conviene dejar (solo una sugerencia): entre las no rechazadas, la aprobada antes que la pendiente y, a igualdad,
 * la más usada; si empatan, la primera. null si no queda ninguna activa o falta el id.
 */
export const idSugeridaConservar = (grupo) => {
  let mejor = null;
  (grupo?.preguntas || []).forEach((p) => {
    if (p.estado === 'rechazada' || !p.id) return;
    const clave = [PRIORIDAD_ESTADO[p.estado] || 0, p.vecesUsada || 0];
    if (!mejor || clave[0] > mejor.clave[0] || (clave[0] === mejor.clave[0] && clave[1] > mejor.clave[1])) {
      mejor = { id: p.id, clave };
    }
  });
  return mejor ? mejor.id : null;
};

/** Búsqueda vacía: sin cargo ni skill (el admin tiene que elegir uno antes de buscar). */
export const busquedaDuplicadasInicial = () => ({
  cargoId: '',
  skillId: '',
  nivel: 'junior',
  tipo: 'abierta_texto',
  categoria: 'tecnica',
  umbral: '',
});

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valores = (lista) => lista.map((o) => o.value);

/**
 * Búsqueda guardada en la URL (/duplicadas?cargoId=…&nivel=…): solo se aceptan valores que V2 conoce, y un id mal
 * formado se ignora. buscar dice si ya se puede buscar sola (trae cargo o skill).
 */
export const leerBusquedaDeUrl = (params) => {
  const leer = (clave) => texto(params?.get?.(clave)).trim();
  const inicial = busquedaDuplicadasInicial();
  const uuid = (clave) => (FORMATO_UUID.test(leer(clave)) ? leer(clave) : '');
  const de = (clave, lista) => (lista.includes(leer(clave)) ? leer(clave) : inicial[clave]);
  const busqueda = {
    cargoId: uuid('cargoId'),
    skillId: uuid('skillId'),
    nivel: de('nivel', valores(NIVELES)),
    tipo: de('tipo', valores(TIPOS)),
    categoria: de('categoria', valores(CATEGORIAS)),
    umbral: de('umbral', valores(UMBRALES)),
  };
  return { busqueda, buscar: Boolean(busqueda.cargoId || busqueda.skillId) };
};

/** Qué falta para buscar duplicadas, o null si está todo. V2 exige cargo o skill más nivel, tipo y categoría. */
export const problemaBusquedaDuplicadas = (b) => {
  if (!b?.cargoId && !b?.skillId) return 'Elige un cargo o una skill: la búsqueda no compara todo el banco contra todo.';
  if (!valores(NIVELES).includes(b.nivel)) return 'Elige un nivel.';
  if (!valores(TIPOS).includes(b.tipo)) return 'Elige un tipo de pregunta.';
  if (!valores(CATEGORIAS).includes(b.categoria)) return 'Elige una categoría.';
  if (b.umbral) {
    const n = numero(b.umbral);
    if (n === null || n < 0.5 || n > 1) return 'El parecido mínimo va de 50 % a 100 %.';
  }
  return null;
};

/** Parámetros de GET /duplicadas. Con una skill se busca por la skill (las preguntas de esa skill); sin ella, por el cargo. */
export const parametrosDuplicadas = (b) => {
  const params = { nivel: b.nivel, tipo: b.tipo, categoria: b.categoria };
  if (b.skillId) params.skillId = b.skillId;
  else params.cargoId = b.cargoId;
  if (b.umbral) params.umbral = b.umbral;
  return params;
};

// ---------- Backend sin similitud ----------

/** El backend todavía no tiene la ruta: Ktor responde 404 sin código propio a una ruta que no existe (o 405/501). */
export const esRutaNoDisponible = (err) => {
  const estado = err?.response?.status;
  if (estado === 405 || estado === 501) return true;
  return estado === 404 && typeof err?.response?.data?.error !== 'string';
};

/**
 * GET /duplicadas en un backend sin similitud: cae en la ruta /admin/preguntas/{id} con id = «duplicadas» y responde
 * 400 id_invalido. El panel solo manda ids del catálogo, así que ese código aquí significa «no disponible».
 */
export const duplicadasNoDisponible = (err) => {
  if (esRutaNoDisponible(err)) return true;
  const codigo = err?.response?.data?.error;
  return err?.response?.status === 400 && (codigo === 'id_invalido' || codigo === 'invalid_uuid');
};
