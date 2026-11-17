// Gasto del mes frente al tope de generación de preguntas con IA (D23 del backend V2). Llega en
// GET /api/v1/admin/costos-ia como topeGeneracionPreguntas y es el mismo cálculo que hace el servidor antes de cada
// generación para responder 429 (tope_generacion_ia_alcanzado). Por eso el panel no recalcula si está agotado: usa los
// booleanos tal como llegan (los montos vienen redondeados a 6 decimales y podrían decir otra cosa en el borde).
// Funciones puras: se prueban en tests/topeGeneracion.test.mjs.
import { formatearDiaUtc, formatearUsd } from './etiquetas.js';

/** Desde qué parte del tope (80 %) se avisa que queda poco. */
export const UMBRAL_AVISO_TOPE = 0.8;

/** Variable del backend que fija el tope. Se lee al arrancar: cambiarla exige volver a desplegar el backend. */
export const VARIABLE_TOPE = 'LIMITE_GASTO_GENERACION_IA_MENSUAL_USD';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const PATRON_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PATRON_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Tolerancia para la coma flotante al sacar el porcentaje (0.57 * 100 da 56.99999999999999). */
const EPSILON_PORCENTAJE = 1e-9;

const esMonto = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * 'AAAA-MM' (mes UTC) → 'noviembre de 2026'. Sin new Date: en Chile '2026-11' se leería como el 31 de octubre.
 * Un valor que no es un mes se devuelve tal cual; null, undefined o '' dan '—'.
 */
export const formatearMesUtc = (mes) => {
  if (mes === null || mes === undefined || mes === '') return '—';
  const coincide = PATRON_MES.exec(String(mes));
  return coincide ? `${MESES[Number(coincide[2]) - 1]} de ${coincide[1]}` : String(mes);
};

/**
 * topeGeneracionPreguntas de la respuesta de Costos IA → datos listos para mostrar, o null si el campo no viene (backend
 * anterior al tope en Costos IA) o viene roto (tipos, NaN, estados incompatibles). Con null el panel oculta el bloque:
 * el servidor igual aplica el tope.
 *
 * Devuelve {mes, gastado, tope, restante, fechaReposicion, desactivado, agotado, porcentaje, nivel}:
 * - porcentaje: 100 solo si el servidor dice que está agotado; si no, como máximo 99 (no se muestra 100 % sin estar
 *   agotado). null si está desactivado (no hay medidor).
 * - nivel: 'desactivado' | 'agotado' | 'cerca' (desde UMBRAL_AVISO_TOPE) | 'ok'.
 * - restante: nunca negativo (dos generaciones simultáneas pueden pasar el tope: no hay reserva previa).
 */
export const leerTopeGeneracion = (respuestaCostos) => {
  const t = respuestaCostos?.topeGeneracionPreguntas;
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  const { mes, gastadoUsd, topeUsd, restanteUsd, fechaReposicion, estaDesactivado, estaAgotado } = t;
  if (typeof mes !== 'string' || !PATRON_MES.test(mes)) return null;
  if (!esMonto(gastadoUsd) || gastadoUsd < 0 || !esMonto(topeUsd) || !esMonto(restanteUsd)) return null;
  if (typeof estaDesactivado !== 'boolean' || typeof estaAgotado !== 'boolean') return null;
  // El servidor nunca manda los dos en verdadero: si llegan así, el dato no es confiable.
  if (estaDesactivado && estaAgotado) return null;

  if (estaDesactivado) {
    return {
      mes,
      gastado: gastadoUsd,
      tope: topeUsd,
      restante: 0,
      fechaReposicion: null,
      desactivado: true,
      agotado: false,
      porcentaje: null,
      nivel: 'desactivado',
    };
  }

  // Con el tope activo, el monto es mayor que 0 y hay un día de reposición.
  if (topeUsd <= 0 || typeof fechaReposicion !== 'string' || !PATRON_DIA.test(fechaReposicion)) return null;

  const porcentaje = estaAgotado
    ? 100
    : Math.min(99, Math.floor((gastadoUsd / topeUsd) * 100 + EPSILON_PORCENTAJE));
  let nivel = 'ok';
  if (estaAgotado) nivel = 'agotado';
  else if (porcentaje >= Math.round(UMBRAL_AVISO_TOPE * 100)) nivel = 'cerca';

  return {
    mes,
    gastado: gastadoUsd,
    tope: topeUsd,
    restante: estaAgotado ? 0 : Math.max(0, restanteUsd),
    fechaReposicion,
    desactivado: false,
    agotado: estaAgotado,
    porcentaje,
    nivel,
  };
};

const usadoDeTope = (tope) => `${formatearUsd(tope.gastado)} de ${formatearUsd(tope.tope)}`;

/**
 * Textos del bloque del tope: {estado, titulo, detalle}. El estado va en palabras (no solo con el color). Desactivado no
 * dice que se repone: con el tope en 0 no vuelve solo el día 1. null si no hay dato.
 */
export const textoTope = (tope) => {
  if (!tope) return null;
  const mes = formatearMesUtc(tope.mes);
  const repone = formatearDiaUtc(tope.fechaReposicion);
  if (tope.desactivado) {
    return {
      estado: 'Desactivada',
      titulo: 'Generación con IA desactivada en el servidor',
      detalle: `${VARIABLE_TOPE} vale 0 o no es un monto válido: el servidor rechaza cada generación sin llamar a la IA `
        + '(sin costo). Para activarla hay que darle un monto mayor que 0 y volver a desplegar el backend. '
        + `Gastado en ${mes} (UTC): ${formatearUsd(tope.gastado)}.`,
    };
  }
  if (tope.agotado) {
    return {
      estado: 'Tope alcanzado',
      titulo: `Tope mensual alcanzado: ${usadoDeTope(tope)}`,
      detalle: `Hasta el ${repone} (UTC), día en que se repone, cada generación responde «tope alcanzado» sin llamar a `
        + 'la IA (sin costo).',
    };
  }
  return {
    estado: tope.nivel === 'cerca' ? 'Cerca del tope' : 'Disponible',
    titulo: `${usadoDeTope(tope)} usados en ${mes} (UTC)`,
    detalle: `Quedan ${formatearUsd(tope.restante)}. Se repone el ${repone} (UTC).`,
  };
};

/** aria-valuetext del medidor: 'US$ X de US$ Y (N %)'. Vacío si no hay medidor (sin dato o desactivado). */
export const valorTextoMedidor = (tope) =>
  (tope && !tope.desactivado ? `${usadoDeTope(tope)} (${tope.porcentaje} %)` : '');

/**
 * Nota del bloque del tope cuando la última lectura de Costos IA falló y se sigue mostrando la anterior (por ejemplo,
 * después de una generación que gastó): dice en palabras que el dato puede no ser el actual. null si no hay dato del tope
 * o si la última lectura salió bien.
 */
export const notaTopeDesactualizado = (tope, desactualizado) =>
  (tope && desactualizado
    ? 'No se pudo actualizar: se muestra la última lectura y puede haber cambiado. El servidor igual aplica el tope '
      + '(su rechazo por tope no cobra).'
    : null);

/**
 * Aviso para la confirmación de una generación, o null si no hace falta. No bloquea: el dato puede estar viejo (cambió
 * el mes, se subió el tope al redesplegar u otro administrador gastó lo que quedaba) y el que decide es el servidor, cuyo
 * 429 no cobra. Por eso la confirmación vuelve a leer el tope al abrirse y presenta este texto como «Según la última
 * lectura» mientras llega la lectura nueva o si esa lectura falla (lineaTopeEnConfirmacion con actualizando o
 * sinActualizar).
 * costoEstimado: USD de esta generación según el promedio del último mes (null si no hay referencia).
 */
export const avisoAntesDeGenerar = (tope, costoEstimado) => {
  if (!tope) return null;
  if (tope.desactivado) {
    return 'La generación con IA está desactivada en el servidor: la rechazará sin llamar a la IA (sin costo).';
  }
  const repone = formatearDiaUtc(tope.fechaReposicion);
  if (tope.agotado) {
    return `Ya se alcanzó el tope del mes (${formatearUsd(tope.tope)}): el servidor responderá «tope alcanzado» sin `
      + `llamar a la IA (sin costo) hasta el ${repone} (UTC).`;
  }
  if (esMonto(costoEstimado) && costoEstimado > tope.restante) {
    return `Esta generación (unos ${formatearUsd(costoEstimado)}) supera lo que queda del tope del mes `
      + `(${formatearUsd(tope.restante)}). El servidor no reserva saldo: mientras el gasto esté bajo el tope la deja pasar `
      + `y se cobra entera, pero lo más probable es que las siguientes respondan «tope alcanzado» hasta el ${repone} (UTC).`;
  }
  return null;
};

/** Prefijo de la línea del tope mientras se vuelve a leer: lo que se ve es lo leído antes, no un hecho actual. */
export const PREFIJO_LECTURA_ANTERIOR = 'Según la última lectura (se está actualizando), ';

/**
 * Prefijo de la línea del tope cuando la lectura nueva falló: se sigue mostrando la anterior, marcada como tal (si la
 * línea desapareciera, parecería que la actualización quitó el aviso).
 */
export const PREFIJO_LECTURA_FALLIDA = 'Según la última lectura (no se pudo actualizar), ';

/** Línea del tope en la confirmación cuando no hay ninguna lectura del tope y la última falló. */
export const TEXTO_TOPE_SIN_LECTURA =
  'No se pudo leer el tope del mes; el servidor igual lo aplica (su rechazo por tope no cobra).';

/** Anuncio de la región viva de la confirmación cuando falla la lectura nueva y queda la anterior a la vista. */
export const ANUNCIO_LECTURA_FALLIDA =
  'No se pudo actualizar el tope del mes; se muestra la última lectura. El servidor igual aplica el tope (su rechazo '
  + 'por tope no cobra).';

const conMinusculaInicial = (texto) => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1);

/**
 * Línea del tope en la confirmación: el aviso si corresponde ({texto, esAviso: true}) o cuánto queda
 * ({texto, esAviso: false}). null si no hay dato del tope (y la última lectura no falló).
 * actualizando: hay una lectura nueva del tope en curso (la confirmación la pide al abrirse). Mientras tanto el texto
 * empieza con PREFIJO_LECTURA_ANTERIOR, para no presentar como actual un dato que puede haber cambiado.
 * sinActualizar: la última lectura falló y `tope` es el de una lectura anterior. El texto empieza con
 * PREFIJO_LECTURA_FALLIDA y el aviso se mantiene (esAviso no cambia). Sin ninguna lectura, la línea es
 * TEXTO_TOPE_SIN_LECTURA. Si llegan las dos opciones, gana actualizando: hay otra lectura en curso.
 */
export const lineaTopeEnConfirmacion = (tope, costoEstimado, { actualizando = false, sinActualizar = false } = {}) => {
  if (!tope) {
    return sinActualizar && !actualizando ? { texto: TEXTO_TOPE_SIN_LECTURA, esAviso: false } : null;
  }
  const aviso = avisoAntesDeGenerar(tope, costoEstimado);
  const texto = aviso
    || `Quedan ${formatearUsd(tope.restante)} del tope del mes (${formatearUsd(tope.tope)}); se repone el `
      + `${formatearDiaUtc(tope.fechaReposicion)} (UTC).`;
  let prefijo = '';
  if (actualizando) prefijo = PREFIJO_LECTURA_ANTERIOR;
  else if (sinActualizar) prefijo = PREFIJO_LECTURA_FALLIDA;
  return {
    texto: prefijo ? `${prefijo}${conMinusculaInicial(texto)}` : texto,
    esAviso: Boolean(aviso),
  };
};

/**
 * aria-describedby del diálogo de confirmación: lo que el lector de pantalla lee al abrirlo, antes de la casilla que
 * recibe el foco. Si la línea del tope es un aviso (agotado, desactivado o esta generación supera lo que queda) se agrega
 * y va primero, porque es lo que decide; la línea informativa («Quedan US$ X») no se agrega, para no alargar el anuncio.
 * Solo nombra idTope cuando hay aviso, y entonces esa línea está pintada (nunca un id que no existe en la página).
 */
export const idsDescripcionConfirmacion = (lineaTope, idTexto, idTope) =>
  (lineaTope?.esAviso ? `${idTope} ${idTexto}` : idTexto);

/**
 * Texto para la región viva (role="status") del diálogo de confirmación cuando la lectura nueva del tope llega con el
 * diálogo ya abierto, o '' si no hay nada que anunciar. Al abrirse, el lector de pantalla leyó la descripción con el aviso
 * que había entonces (avisoAlAbrir: avisoAntesDeGenerar de ese momento, o null). Se anuncia solo si el aviso cambió:
 * apareció, cambió su texto o dejó de haberlo (entonces se dice cuánto queda). Mientras la lectura sigue en curso no se
 * anuncia nada.
 * lecturaFallida: la lectura nueva falló. Se dice en palabras (la línea del diálogo pasa a «no se pudo actualizar» y no
 * debe parecer que el aviso se resolvió): ANUNCIO_LECTURA_FALLIDA si sigue a la vista la lectura anterior, o
 * TEXTO_TOPE_SIN_LECTURA si no hay ninguna. Sin dato del tope y sin falla (backend que no lo manda), nada.
 */
export const anuncioTopeActualizado = ({
  avisoAlAbrir = null, tope, costoEstimado, actualizando = false, lecturaFallida = false,
}) => {
  if (actualizando) return '';
  if (lecturaFallida) return tope ? ANUNCIO_LECTURA_FALLIDA : TEXTO_TOPE_SIN_LECTURA;
  if (!tope) return '';
  const aviso = avisoAntesDeGenerar(tope, costoEstimado);
  if (aviso === (avisoAlAbrir ?? null)) return '';
  return `Tope del mes actualizado. ${aviso ?? lineaTopeEnConfirmacion(tope, costoEstimado).texto}`;
};

/** Una línea para la tarjeta de gasto del Dashboard, o null si no hay dato del tope. */
export const resumenCortoTope = (tope) => {
  if (!tope) return null;
  if (tope.desactivado) return 'Generación con IA desactivada en el servidor';
  if (tope.agotado) return `Tope de generación alcanzado: se repone el ${formatearDiaUtc(tope.fechaReposicion)} (UTC)`;
  const prefijo = tope.nivel === 'cerca' ? 'Cerca del tope de generación' : 'Tope de generación del mes';
  return `${prefijo}: ${tope.porcentaje} % usado (${usadoDeTope(tope)})`;
};

/**
 * Nota para el 429 tope_generacion_ia_alcanzado (el mensaje del servidor ya dice el día en que se repone). Con el tope
 * desactivado no promete reposición: con 0 no vuelve solo el día 1; sin dato del tope tampoco la promete.
 * tope: el leído de Costos IA DESPUÉS del 429 (notaTopeConLecturaNueva), no el que tenía la página antes: ese pudo ser
 * otro (por ejemplo 'ok' con el backend ya redesplegado con el tope en 0) y la nota prometería una reposición falsa.
 * Agotado o no da el mismo texto: el día exacto lo dice el mensaje del servidor.
 */
export const notaTopeAlcanzado = (tope) => {
  const base = 'No se llamó a la IA: no hubo costo.';
  if (!tope) {
    return `${base} El tope mensual lo define ${VARIABLE_TOPE} en el servidor; si vale 0, la generación queda `
      + 'desactivada hasta cambiarlo.';
  }
  if (tope.desactivado) {
    return `${base} La generación con IA está desactivada: ${VARIABLE_TOPE} vale 0 o no es un monto válido. Para `
      + 'activarla hay que darle un monto mayor que 0 y volver a desplegar el backend.';
  }
  return `${base} El tope mensual (${VARIABLE_TOPE}) se repone el día 1 de cada mes (UTC).`;
};

/** Cuánto se espera, tras un 429 del tope, la lectura nueva del tope para armar la nota (ms). */
export const ESPERA_TOPE_TRAS_429_MS = 5000;

/**
 * Nota del 429 tope_generacion_ia_alcanzado armada UNA sola vez con el tope leído después del rechazo, para guardarla ya
 * armada junto al error: el texto del aviso (role="alert") no cambia después de mostrarse ni se vuelve a leer.
 * pedirTope: vuelve a pedir Costos IA y resuelve con lo que leyó leerTopeGeneracion (o null si no se pudo).
 * Si la lectura falla o tarda más de esperaMaxMs, la nota se arma sin dato (no promete reposición) y el aviso no se
 * demora más; el bloque del tope se actualiza solo cuando llegue la lectura.
 */
export const notaTopeConLecturaNueva = async (pedirTope, esperaMaxMs = ESPERA_TOPE_TRAS_429_MS) => {
  let reloj;
  const sinDato = new Promise((resolver) => { reloj = setTimeout(resolver, esperaMaxMs, null); });
  try {
    const tope = await Promise.race([Promise.resolve().then(pedirTope), sinDato]);
    return notaTopeAlcanzado(tope ?? null);
  } catch {
    return notaTopeAlcanzado(null);
  } finally {
    clearTimeout(reloj);
  }
};
