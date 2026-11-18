// Pruebas del gasto del mes frente al tope de generación con IA (src/services/topeGeneracion.js).
// Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANUNCIO_LECTURA_FALLIDA,
  PREFIJO_LECTURA_ANTERIOR,
  PREFIJO_LECTURA_FALLIDA,
  TEXTO_TOPE_SIN_LECTURA,
  UMBRAL_AVISO_TOPE,
  anuncioTopeActualizado,
  avisoAntesDeGenerar,
  formatearMesUtc,
  idsDescripcionConfirmacion,
  leerTopeGeneracion,
  lineaTopeEnConfirmacion,
  notaTopeAlcanzado,
  notaTopeConLecturaNueva,
  notaTopeDesactualizado,
  resumenCortoTope,
  textoTope,
  valorTextoMedidor,
} from '../src/services/topeGeneracion.js';

/** Respuesta de Costos IA con topeGeneracionPreguntas tal como lo manda el backend (las 7 claves). */
const respuesta = (cambios = {}) => ({
  desde: '2026-10-01',
  hasta: '2026-10-31',
  topeGeneracionPreguntas: {
    mes: '2026-11',
    gastadoUsd: 1.25,
    topeUsd: 5.0,
    restanteUsd: 3.75,
    fechaReposicion: '2026-12-01',
    estaDesactivado: false,
    estaAgotado: false,
    ...cambios,
  },
});

const desactivado = () => respuesta({ topeUsd: 0, restanteUsd: 0, fechaReposicion: null, estaDesactivado: true });
const agotado = () => respuesta({ gastadoUsd: 5.3, restanteUsd: 0, estaAgotado: true });

test('sin el campo (backend anterior) o sin respuesta no hay tope: el panel oculta el bloque', () => {
  assert.equal(leerTopeGeneracion({ desde: '2026-11-01', hasta: '2026-11-30', total: {} }), null);
  assert.equal(leerTopeGeneracion(null), null);
  assert.equal(leerTopeGeneracion(undefined), null);
  assert.equal(leerTopeGeneracion({ topeGeneracionPreguntas: null }), null);
  assert.equal(leerTopeGeneracion({ topeGeneracionPreguntas: [] }), null);
  assert.equal(leerTopeGeneracion({ topeGeneracionPreguntas: 'tope' }), null);
});

test('un tope con datos rotos (tipos, NaN, estados incompatibles) se descarta en vez de mostrar algo falso', () => {
  const rotos = [
    { gastadoUsd: '1.25' },
    { gastadoUsd: Number.NaN },
    { gastadoUsd: -0.5 },
    { topeUsd: null },
    { topeUsd: Number.POSITIVE_INFINITY },
    { restanteUsd: undefined },
    { estaAgotado: 'false' },
    { estaDesactivado: 0 },
    { mes: '2026-13' },
    { mes: '11-2026' },
    { mes: 202611 },
    { fechaReposicion: null },
    { fechaReposicion: '01-12-2026' },
    { fechaReposicion: '2026-12-01T00:00:00Z' },
    { topeUsd: 0 },
    { estaDesactivado: true, estaAgotado: true, fechaReposicion: null },
  ];
  for (const cambio of rotos) {
    assert.equal(leerTopeGeneracion(respuesta(cambio)), null, JSON.stringify(cambio));
  }
});

test('normal: 1.25 de 5 es 25 % y nivel ok, con los montos tal como llegan', () => {
  assert.deepEqual(leerTopeGeneracion(respuesta()), {
    mes: '2026-11',
    gastado: 1.25,
    tope: 5,
    restante: 3.75,
    fechaReposicion: '2026-12-01',
    desactivado: false,
    agotado: false,
    porcentaje: 25,
    nivel: 'ok',
  });
});

test('el contrato exacto del backend se lee sin problemas', () => {
  const tope = leerTopeGeneracion({
    topeGeneracionPreguntas: {
      mes: '2026-11', gastadoUsd: 0.001234, topeUsd: 5.0, restanteUsd: 4.998766,
      fechaReposicion: '2026-12-01', estaDesactivado: false, estaAgotado: false,
    },
  });
  assert.equal(tope.nivel, 'ok');
  assert.equal(tope.porcentaje, 0);
  assert.equal(tope.restante, 4.998766);
});

test(`desde el ${UMBRAL_AVISO_TOPE * 100} % el nivel es cerca; justo bajo el umbral sigue ok`, () => {
  assert.equal(leerTopeGeneracion(respuesta({ gastadoUsd: 4.0, restanteUsd: 1.0 })).nivel, 'cerca');
  assert.equal(leerTopeGeneracion(respuesta({ gastadoUsd: 4.0, restanteUsd: 1.0 })).porcentaje, 80);
  assert.equal(leerTopeGeneracion(respuesta({ gastadoUsd: 3.99, restanteUsd: 1.01 })).nivel, 'ok');
  assert.equal(leerTopeGeneracion(respuesta({ gastadoUsd: 3.99, restanteUsd: 1.01 })).porcentaje, 79);
  // 0.24 / 0.3 da 0.7999999999999999 en coma flotante: igual es el 80 %.
  assert.equal(leerTopeGeneracion(respuesta({ gastadoUsd: 0.24, topeUsd: 0.3, restanteUsd: 0.06 })).nivel, 'cerca');
  // 0.57 * 100 da 56.99999999999999: el porcentaje es 57, no 56.
  assert.equal(leerTopeGeneracion(respuesta({ gastadoUsd: 0.57, topeUsd: 1, restanteUsd: 0.43 })).porcentaje, 57);
});

test('sin agotar nunca muestra 100 % aunque el monto redondeado llegue al tope', () => {
  const casi = leerTopeGeneracion(respuesta({ gastadoUsd: 4.9999995, restanteUsd: 0.0000005 }));
  assert.equal(casi.porcentaje, 99);
  assert.equal(casi.nivel, 'cerca');
  // El backend redondea a 6 decimales: 4.9999996 llega como 5.000000 sin estar agotado. Manda el booleano.
  const redondeado = leerTopeGeneracion(respuesta({ gastadoUsd: 5.0, restanteUsd: 0 }));
  assert.equal(redondeado.porcentaje, 99);
  assert.equal(redondeado.agotado, false);
  assert.equal(redondeado.nivel, 'cerca');
});

test('agotado según el backend es 100 % aunque el monto redondeado quede bajo el tope', () => {
  const tope = leerTopeGeneracion(respuesta({ gastadoUsd: 4.999999, restanteUsd: 0.000001, estaAgotado: true }));
  assert.equal(tope.porcentaje, 100);
  assert.equal(tope.nivel, 'agotado');
  assert.equal(tope.restante, 0, 'agotado: no queda saldo para generar');
});

test('exceso por generaciones simultáneas: 5.3 de 5 es 100 % y el restante nunca es negativo', () => {
  const tope = leerTopeGeneracion(agotado());
  assert.equal(tope.porcentaje, 100);
  assert.equal(tope.restante, 0);
  assert.equal(leerTopeGeneracion(respuesta({ restanteUsd: -0.3 })).restante, 0);
});

test('desactivado: sin medidor, sin fecha y sin prometer que se repone', () => {
  const tope = leerTopeGeneracion(desactivado());
  assert.equal(tope.nivel, 'desactivado');
  assert.equal(tope.desactivado, true);
  assert.equal(tope.agotado, false);
  assert.equal(tope.porcentaje, null);
  assert.equal(tope.fechaReposicion, null);
  assert.equal(tope.restante, 0);
  // Aunque llegara una fecha, desactivado no la usa.
  assert.equal(leerTopeGeneracion(respuesta({ topeUsd: 0, estaDesactivado: true })).fechaReposicion, null);

  const { estado, titulo, detalle } = textoTope(tope);
  assert.equal(estado, 'Desactivada');
  assert.equal(titulo, 'Generación con IA desactivada en el servidor');
  for (const texto of [titulo, detalle, resumenCortoTope(tope), avisoAntesDeGenerar(tope, 0.5), notaTopeAlcanzado(tope)]) {
    assert.doesNotMatch(texto, /repon/i, texto);
  }
  assert.match(detalle, /vale 0 o no es un monto válido/);
  assert.match(detalle, /Gastado en noviembre de 2026 \(UTC\): US\$ 1\.2500/);
  assert.equal(valorTextoMedidor(tope), '');
});

test('textos del bloque: estado en palabras y fechas DD-MM-AAAA sin correrse un día en Chile', () => {
  assert.deepEqual(textoTope(leerTopeGeneracion(respuesta())), {
    estado: 'Disponible',
    titulo: 'US$ 1.2500 de US$ 5.0000 usados en noviembre de 2026 (UTC)',
    detalle: 'Quedan US$ 3.7500. Se repone el 01-12-2026 (UTC).',
  });
  assert.equal(textoTope(leerTopeGeneracion(respuesta({ gastadoUsd: 4.5, restanteUsd: 0.5 }))).estado, 'Cerca del tope');

  const agotadoTexto = textoTope(leerTopeGeneracion(agotado()));
  assert.equal(agotadoTexto.estado, 'Tope alcanzado');
  assert.equal(agotadoTexto.titulo, 'Tope mensual alcanzado: US$ 5.3000 de US$ 5.0000');
  assert.match(agotadoTexto.detalle, /^Hasta el 01-12-2026 \(UTC\)/);
  assert.match(agotadoTexto.detalle, /sin llamar a la IA \(sin costo\)/);

  // Diciembre se repone el 1 de enero del año siguiente (el backend manda la fecha; el panel no la calcula).
  const diciembre = leerTopeGeneracion(respuesta({ mes: '2026-12', fechaReposicion: '2027-01-01' }));
  assert.match(textoTope(diciembre).titulo, /diciembre de 2026/);
  assert.match(textoTope(diciembre).detalle, /01-01-2027/);
  assert.equal(textoTope(null), null);
});

test('formatearMesUtc: mes en palabras sin new Date, el crudo si no sirve y — si no hay', () => {
  assert.equal(formatearMesUtc('2026-11'), 'noviembre de 2026');
  assert.equal(formatearMesUtc('2027-01'), 'enero de 2027');
  assert.equal(formatearMesUtc('2026-12'), 'diciembre de 2026');
  assert.equal(formatearMesUtc('2026-13'), '2026-13');
  assert.equal(formatearMesUtc('noviembre'), 'noviembre');
  assert.equal(formatearMesUtc(null), '—');
  assert.equal(formatearMesUtc(undefined), '—');
  assert.equal(formatearMesUtc(''), '—');
});

test('valor del medidor para lectores de pantalla: montos y porcentaje', () => {
  assert.equal(valorTextoMedidor(leerTopeGeneracion(respuesta())), 'US$ 1.2500 de US$ 5.0000 (25 %)');
  assert.equal(valorTextoMedidor(leerTopeGeneracion(agotado())), 'US$ 5.3000 de US$ 5.0000 (100 %)');
  assert.equal(valorTextoMedidor(null), '');
});

test('aviso antes de generar: solo si está agotado, desactivado o si esta generación supera lo que queda', () => {
  const casiSinSaldo = leerTopeGeneracion(respuesta({ gastadoUsd: 4.99, restanteUsd: 0.01 }));
  const aviso = avisoAntesDeGenerar(casiSinSaldo, 0.02);
  assert.match(aviso, /supera lo que queda del tope del mes \(US\$ 0\.0100\)/);
  assert.match(aviso, /no reserva saldo/);
  assert.match(aviso, /01-12-2026/);
  assert.equal(avisoAntesDeGenerar(casiSinSaldo, null), null, 'sin referencia de costo no se adivina');
  assert.equal(avisoAntesDeGenerar(casiSinSaldo, Number.NaN), null);
  assert.equal(avisoAntesDeGenerar(casiSinSaldo, 0.01), null, 'igual a lo que queda no lo supera');
  assert.equal(avisoAntesDeGenerar(null, 0.02), null);

  const agotadoAviso = avisoAntesDeGenerar(leerTopeGeneracion(agotado()), null);
  assert.match(agotadoAviso, /Ya se alcanzó el tope del mes \(US\$ 5\.0000\)/);
  assert.match(agotadoAviso, /«tope alcanzado» sin llamar a la IA \(sin costo\) hasta el 01-12-2026 \(UTC\)/);
  assert.match(avisoAntesDeGenerar(leerTopeGeneracion(desactivado()), 0.02), /desactivada en el servidor/);
});

test('línea del tope en la confirmación: el aviso o cuánto queda', () => {
  assert.deepEqual(lineaTopeEnConfirmacion(leerTopeGeneracion(respuesta()), 0.05), {
    texto: 'Quedan US$ 3.7500 del tope del mes (US$ 5.0000); se repone el 01-12-2026 (UTC).',
    esAviso: false,
  });
  assert.equal(lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), 0.05).esAviso, true);
  assert.equal(lineaTopeEnConfirmacion(null, 0.05), null);
  // Con el tope ya leído de nuevo no se antepone nada.
  assert.doesNotMatch(lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), 0.05).texto, /última lectura/);
});

test('línea del tope mientras se vuelve a leer al abrir la confirmación: se presenta como la última lectura', () => {
  assert.equal(PREFIJO_LECTURA_ANTERIOR, 'Según la última lectura (se está actualizando), ');
  assert.deepEqual(lineaTopeEnConfirmacion(leerTopeGeneracion(respuesta()), 0.05, { actualizando: true }), {
    texto: 'Según la última lectura (se está actualizando), quedan US$ 3.7500 del tope del mes (US$ 5.0000); se repone '
      + 'el 01-12-2026 (UTC).',
    esAviso: false,
  });

  // El aviso de agotado no se afirma como un hecho actual: puede ser del mes anterior.
  const agotadoViejo = lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), null, { actualizando: true });
  assert.equal(agotadoViejo.esAviso, true);
  assert.match(agotadoViejo.texto, /^Según la última lectura \(se está actualizando\), ya se alcanzó el tope del mes/);

  const supera = lineaTopeEnConfirmacion(
    leerTopeGeneracion(respuesta({ gastadoUsd: 4.99, restanteUsd: 0.01 })), 0.02, { actualizando: true }
  );
  assert.equal(supera.esAviso, true);
  assert.match(supera.texto, /^Según la última lectura \(se está actualizando\), esta generación \(unos US\$ 0\.0200\)/);

  const desactivadoViejo = lineaTopeEnConfirmacion(leerTopeGeneracion(desactivado()), 0.02, { actualizando: true });
  assert.match(desactivadoViejo.texto, /^Según la última lectura \(se está actualizando\), la generación con IA está desactivada/);

  assert.equal(lineaTopeEnConfirmacion(null, 0.05, { actualizando: true }), null, 'sin dato no hay línea');
});

test('línea del tope si falla la relectura: se mantiene la última lectura, marcada «no se pudo actualizar»', () => {
  assert.equal(PREFIJO_LECTURA_FALLIDA, 'Según la última lectura (no se pudo actualizar), ');

  // El aviso de agotado que se leyó al abrir no desaparece ni pierde su marca de aviso.
  const agotadoFallido = lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), null, { sinActualizar: true });
  assert.equal(agotadoFallido.esAviso, true);
  assert.match(agotadoFallido.texto, /^Según la última lectura \(no se pudo actualizar\), ya se alcanzó el tope del mes/);

  // «Supera lo que queda»: justo el caso en que el servidor la deja pasar y se cobra entera.
  const supera = lineaTopeEnConfirmacion(
    leerTopeGeneracion(respuesta({ gastadoUsd: 4.99, restanteUsd: 0.01 })), 0.02, { sinActualizar: true }
  );
  assert.equal(supera.esAviso, true);
  assert.match(supera.texto, /^Según la última lectura \(no se pudo actualizar\), esta generación \(unos US\$ 0\.0200\)/);

  const desactivadoFallido = lineaTopeEnConfirmacion(leerTopeGeneracion(desactivado()), 0.02, { sinActualizar: true });
  assert.equal(desactivadoFallido.esAviso, true);
  assert.match(desactivadoFallido.texto, /^Según la última lectura \(no se pudo actualizar\), la generación con IA está desactivada/);

  assert.deepEqual(lineaTopeEnConfirmacion(leerTopeGeneracion(respuesta()), 0.05, { sinActualizar: true }), {
    texto: 'Según la última lectura (no se pudo actualizar), quedan US$ 3.7500 del tope del mes (US$ 5.0000); se '
      + 'repone el 01-12-2026 (UTC).',
    esAviso: false,
  });

  // Si hay otra lectura en curso, gana «se está actualizando».
  assert.match(
    lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), null, { actualizando: true, sinActualizar: true }).texto,
    /^Según la última lectura \(se está actualizando\), /
  );

  // Sin ninguna lectura y la última falló: se dice en palabras (no es aviso: no hay dato que avisar).
  assert.deepEqual(lineaTopeEnConfirmacion(null, 0.05, { sinActualizar: true }), {
    texto: TEXTO_TOPE_SIN_LECTURA,
    esAviso: false,
  });
  assert.match(TEXTO_TOPE_SIN_LECTURA, /No se pudo leer el tope del mes; el servidor igual lo aplica/);
  assert.equal(lineaTopeEnConfirmacion(null, 0.05, { actualizando: true, sinActualizar: true }), null);
  // Sin falla y sin dato (backend que no manda el tope): no hay línea.
  assert.equal(lineaTopeEnConfirmacion(null, 0.05), null);
});

test('nota del bloque del tope cuando la última lectura falló', () => {
  const ok = leerTopeGeneracion(respuesta());
  assert.match(notaTopeDesactualizado(ok, true), /^No se pudo actualizar: se muestra la última lectura/);
  assert.match(notaTopeDesactualizado(ok, true), /El servidor igual aplica el tope/);
  assert.equal(notaTopeDesactualizado(ok, false), null, 'con la lectura al día no hay nota');
  assert.equal(notaTopeDesactualizado(null, true), null, 'sin dato no se muestra el bloque');
});

test('descripción del diálogo (aria-describedby): el aviso del tope va primero; la línea informativa no se agrega', () => {
  const ids = (linea) => idsDescripcionConfirmacion(linea, 'gp-modal-desc', 'gp-modal-tope');
  assert.equal(ids(lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), null)), 'gp-modal-tope gp-modal-desc');
  assert.equal(ids(lineaTopeEnConfirmacion(leerTopeGeneracion(desactivado()), null)), 'gp-modal-tope gp-modal-desc');
  assert.equal(
    ids(lineaTopeEnConfirmacion(leerTopeGeneracion(respuesta({ gastadoUsd: 4.99, restanteUsd: 0.01 })), 0.02)),
    'gp-modal-tope gp-modal-desc'
  );
  // Sigue siendo aviso mientras se vuelve a leer: también se lee al abrir.
  assert.equal(
    ids(lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), null, { actualizando: true })),
    'gp-modal-tope gp-modal-desc'
  );
  // Si falla la relectura el aviso sigue pintado y sigue en la descripción.
  assert.equal(
    ids(lineaTopeEnConfirmacion(leerTopeGeneracion(agotado()), null, { sinActualizar: true })),
    'gp-modal-tope gp-modal-desc'
  );
  assert.equal(ids(lineaTopeEnConfirmacion(leerTopeGeneracion(respuesta()), 0.05)), 'gp-modal-desc');
  // La línea «No se pudo leer el tope» es informativa: no se agrega.
  assert.equal(ids(lineaTopeEnConfirmacion(null, 0.05, { sinActualizar: true })), 'gp-modal-desc');
  // Sin línea del tope no se nombra un id que no está en la página.
  assert.equal(ids(null), 'gp-modal-desc');
});

test('anuncio al llegar la lectura nueva con la confirmación abierta: solo si cambió el aviso que ya se leyó', () => {
  const ok = leerTopeGeneracion(respuesta());
  const agotadoAhora = leerTopeGeneracion(agotado());
  const avisoAgotado = avisoAntesDeGenerar(agotadoAhora, null);

  // Mientras la lectura sigue en curso no se anuncia nada.
  assert.equal(anuncioTopeActualizado({ avisoAlAbrir: null, tope: agotadoAhora, costoEstimado: null, actualizando: true }), '');

  // Al abrir quedaba saldo; otro administrador lo gastó: el aviso nuevo se anuncia.
  assert.equal(
    anuncioTopeActualizado({ avisoAlAbrir: null, tope: agotadoAhora, costoEstimado: null, actualizando: false }),
    `Tope del mes actualizado. ${avisoAgotado}`
  );

  // Al abrir decía agotado (dato del mes anterior) y ya se repuso: se dice cuánto queda.
  const repuesto = leerTopeGeneracion(respuesta({ mes: '2026-12', gastadoUsd: 0, restanteUsd: 5, fechaReposicion: '2027-01-01' }));
  assert.equal(
    anuncioTopeActualizado({ avisoAlAbrir: avisoAgotado, tope: repuesto, costoEstimado: 0.05 }),
    'Tope del mes actualizado. Quedan US$ 5.0000 del tope del mes (US$ 5.0000); se repone el 01-01-2027 (UTC).'
  );

  // Mismo aviso que se oyó al abrir, o sin aviso antes ni ahora: nada que anunciar.
  assert.equal(anuncioTopeActualizado({ avisoAlAbrir: avisoAgotado, tope: agotadoAhora, costoEstimado: null }), '');
  assert.equal(anuncioTopeActualizado({ avisoAlAbrir: null, tope: ok, costoEstimado: 0.05 }), '');
  assert.equal(anuncioTopeActualizado({ tope: ok, costoEstimado: 0.05 }), '');

  // Lectura correcta pero sin el campo del tope (backend anterior): nada que anunciar.
  assert.equal(anuncioTopeActualizado({ avisoAlAbrir: avisoAgotado, tope: null, costoEstimado: null }), '');
});

test('anuncio si la relectura falla con la confirmación abierta: se dice en palabras, no se calla', () => {
  const agotadoAntes = leerTopeGeneracion(agotado());
  const avisoAgotado = avisoAntesDeGenerar(agotadoAntes, null);

  // El caso del hallazgo: al abrir se oyó «ya se alcanzó el tope… (se está actualizando)» y el GET responde 502/504.
  // El tope anterior sigue a la vista y la región viva dice que no se pudo actualizar (antes quedaba en silencio).
  const fallo = anuncioTopeActualizado({
    avisoAlAbrir: avisoAgotado, tope: agotadoAntes, costoEstimado: null, lecturaFallida: true,
  });
  assert.equal(fallo, ANUNCIO_LECTURA_FALLIDA);
  assert.match(fallo, /^No se pudo actualizar el tope del mes; se muestra la última lectura\./);

  // También sin aviso al abrir (la línea «Quedan…» cambia a «no se pudo actualizar»).
  assert.equal(
    anuncioTopeActualizado({ tope: leerTopeGeneracion(respuesta()), costoEstimado: 0.05, lecturaFallida: true }),
    ANUNCIO_LECTURA_FALLIDA
  );

  // Sin ninguna lectura del tope: se dice que no se pudo leer.
  assert.equal(anuncioTopeActualizado({ tope: null, costoEstimado: null, lecturaFallida: true }), TEXTO_TOPE_SIN_LECTURA);

  // Mientras hay otra lectura en curso, nada.
  assert.equal(
    anuncioTopeActualizado({ avisoAlAbrir: avisoAgotado, tope: agotadoAntes, actualizando: true, lecturaFallida: true }),
    ''
  );
});

test('resumen corto para el Dashboard', () => {
  assert.equal(resumenCortoTope(leerTopeGeneracion(respuesta())), 'Tope de generación del mes: 25 % usado (US$ 1.2500 de US$ 5.0000)');
  assert.equal(
    resumenCortoTope(leerTopeGeneracion(respuesta({ gastadoUsd: 4.5, restanteUsd: 0.5 }))),
    'Cerca del tope de generación: 90 % usado (US$ 4.5000 de US$ 5.0000)'
  );
  assert.equal(resumenCortoTope(leerTopeGeneracion(agotado())), 'Tope de generación alcanzado: se repone el 01-12-2026 (UTC)');
  assert.equal(resumenCortoTope(leerTopeGeneracion(desactivado())), 'Generación con IA desactivada en el servidor');
  assert.equal(resumenCortoTope(null), null);
});

test('nota del 429: se repone el día 1; sin prometerlo si está desactivado o no hay dato', () => {
  assert.match(notaTopeAlcanzado(leerTopeGeneracion(agotado())), /se repone el día 1 de cada mes \(UTC\)/);
  // Mismo texto agotado o no: el día exacto lo dice el mensaje del servidor.
  assert.equal(notaTopeAlcanzado(leerTopeGeneracion(respuesta())), notaTopeAlcanzado(leerTopeGeneracion(agotado())));
  assert.match(notaTopeAlcanzado(leerTopeGeneracion(desactivado())), /desactivada/);
  const sinDato = notaTopeAlcanzado(null);
  assert.match(sinDato, /^No se llamó a la IA: no hubo costo\./);
  assert.doesNotMatch(sinDato, /repon/i);
});

test('nota del 429 armada una vez con el tope leído después del rechazo, no con el que tenía la página', async () => {
  // La página tenía el tope en 'ok' y el backend se redesplegó con el tope en 0: la nota dice lo que lee ahora y no
  // promete una reposición el día 1 (con el tope anterior lo habría prometido).
  const conTopeAnterior = notaTopeAlcanzado(leerTopeGeneracion(respuesta()));
  assert.match(conTopeAnterior, /se repone el día 1/);
  let pedidos = 0;
  const nota = await notaTopeConLecturaNueva(async () => { pedidos += 1; return leerTopeGeneracion(desactivado()); });
  assert.equal(pedidos, 1, 'la lectura se pide una sola vez');
  assert.equal(typeof nota, 'string', 'se guarda ya armada: no se recalcula en cada render');
  assert.equal(nota, notaTopeAlcanzado(leerTopeGeneracion(desactivado())));
  assert.doesNotMatch(nota, /repon/i);

  // La página no tenía dato (falló el GET inicial) y ahora está agotado: la nota ya sale con la reposición.
  assert.match(await notaTopeConLecturaNueva(async () => leerTopeGeneracion(agotado())), /se repone el día 1 de cada mes/);
});

test('nota del 429 sin lectura nueva (falla, sin dato o tarda): no promete reposición y no espera de más', async () => {
  const sinDato = notaTopeAlcanzado(null);
  assert.equal(await notaTopeConLecturaNueva(async () => null), sinDato);
  assert.equal(await notaTopeConLecturaNueva(async () => undefined), sinDato);
  assert.equal(await notaTopeConLecturaNueva(async () => { throw new Error('sin red'); }), sinDato);
  assert.equal(await notaTopeConLecturaNueva(() => { throw new Error('falla al pedir'); }), sinDato);

  const inicio = Date.now();
  const nota = await notaTopeConLecturaNueva(() => new Promise(() => {}), 20);
  assert.equal(nota, sinDato, 'si la lectura no llega a tiempo, se arma sin dato');
  assert.ok(Date.now() - inicio < 2000, 'no se queda esperando la lectura');
});
