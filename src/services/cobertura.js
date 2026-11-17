// Cobertura del banco frente al mercado (D26 del backend V2) y textos del contexto de mercado de una generación.
// Funciones puras: se prueban en tests/cobertura.test.mjs.
import { CATEGORIAS, LIMITES } from './etiquetas.js';

/**
 * Una celda de la tabla (skill × nivel) de GET /api/v1/admin/preguntas/cobertura.
 * estado: 'ok' (llega al mínimo), 'revisar' (las pendientes alcanzan: aprobarlas no cuesta) o 'falta' (hay que generar).
 * generar: cuántas pedir a la IA (lo que falta menos lo pendiente, entre 1 y el máximo por generación); 0 si no hace falta.
 */
export const celdaCobertura = (skill, nivel) => {
  const leer = (campo) => Math.max(0, Number(skill?.[campo]?.[nivel]) || 0);
  const aprobadas = leer('aprobadas');
  const pendientes = leer('pendientes');
  const faltan = leer('faltan');
  if (faltan === 0) return { aprobadas, pendientes, faltan, estado: 'ok', generar: 0 };
  if (pendientes >= faltan) return { aprobadas, pendientes, faltan, estado: 'revisar', generar: 0 };
  const generar = Math.min(Math.max(faltan - pendientes, 1), LIMITES.preguntasPorGeneracion);
  return { aprobadas, pendientes, faltan, estado: 'falta', generar };
};

/**
 * Lo que recibe Generar con IA al abrirse desde la cobertura (cargo, skill, nivel y cantidad ya puestos). Los nombres van
 * aparte para mostrarlos aunque el cargo o la skill no estén en las listas del formulario.
 */
export const prellenadoGenerar = (cargo, skill, nivel, cantidad) => ({
  area: cargo?.area || '',
  cargoId: cargo?.cargoId || '',
  cargoNombre: cargo?.nombre || '',
  skillId: skill?.skillId || '',
  skillNombre: skill?.nombre || '',
  nivel,
  categoria: CATEGORIAS.some((c) => c.value === skill?.categoria) ? skill.categoria : 'tecnica',
  cantidad: String(Math.min(Math.max(Number(cantidad) || 1, 1), LIMITES.preguntasPorGeneracion)),
});

/**
 * Banco filtrado en las mismas pendientes que cuenta la celda: de la skill y el nivel, y del cargo o sin cargo
 * (paraCargoId en V2). Las de otros cargos no le sirven a este y no se muestran.
 */
export const rutaPendientesSkill = (skillId, nivel, cargoId) =>
  `/preguntas?${new URLSearchParams({ estado: 'pendiente', skillId, nivel, ...(cargoId ? { paraCargoId: cargoId } : {}) }).toString()}`;

/** Totales de toda la respuesta, para el encabezado. */
export const resumenCobertura = (data) => {
  const cargos = Array.isArray(data?.cargos) ? data.cargos : [];
  return {
    cargos: cargos.length,
    cargosIncompletos: cargos.filter((c) => Number(c.preguntasFaltantes) > 0).length,
    // Sin skills del mercado no se puede decir que estén completos: es otro estado.
    cargosSinSkills: cargos.filter((c) => !Array.isArray(c.skills) || c.skills.length === 0).length,
    preguntasFaltantes: cargos.reduce((suma, c) => suma + (Number(c.preguntasFaltantes) || 0), 0),
  };
};

/** Fecha de la última lectura de ofertas (LocalDateTime sin zona: es la hora del servidor) en formato corto. */
export const formatearSincronizacion = (texto) => {
  if (!texto) return 'nunca';
  const [fecha, hora = ''] = String(texto).split('T');
  const [anio, mes, dia] = fecha.split('-');
  return anio && mes && dia ? `${dia}-${mes}-${anio} ${hora.slice(0, 5)}`.trim() : String(texto);
};

/**
 * contexto_mercado de la respuesta de generar-ia → lo que se muestra al admin.
 * Sin contexto (backend anterior a D26) devuelve null.
 */
export const textoContextoMercado = (ctx) => {
  if (!ctx || typeof ctx !== 'object') return null;
  if (!ctx.usado) {
    return { usado: false, titulo: 'Se generó sin ofertas de empleo', detalle: ctx.mensaje || '' };
  }
  const n = Number(ctx.ofertas_analizadas) || 0;
  const fuentes = Array.isArray(ctx.fuentes) && ctx.fuentes.length ? ` de ${ctx.fuentes.join(', ')}` : '';
  const titulo = ctx.es_respaldo
    ? `Se usaron ${n} ofertas de referencia (las APIs de empleo no respondieron)`
    : `${n === 1 ? 'Se usó 1 oferta de empleo real' : `Se usaron ${n} ofertas de empleo reales`}${fuentes}`;
  const skills = (Array.isArray(ctx.skills_frecuentes) ? ctx.skills_frecuentes : [])
    .map((s) => `${s.nombre} (${s.ofertas} de ${n})`);
  const fragmentos = (Array.isArray(ctx.fragmentos) ? ctx.fragmentos : [])
    .map((f) => ({ texto: String(f.texto ?? ''), oferta: String(f.titulo_oferta ?? ''), fuente: String(f.fuente ?? '') }));
  return { usado: true, titulo, detalle: ctx.consulta ? `Búsqueda: ${ctx.consulta}` : '', skills, fragmentos };
};
