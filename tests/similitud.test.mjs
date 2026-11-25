// Pruebas de las preguntas parecidas o duplicadas (src/services/similitud.js).
// Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTIVO_DUPLICADA,
  activasDelGrupo,
  avisoSimilares,
  duplicadasNoDisponible,
  esRutaNoDisponible,
  idSugeridaConservar,
  leerBusquedaDeUrl,
  leerDescartadas,
  leerGruposDuplicadas,
  leerResumenGeneracion,
  leerSimilar,
  leerSimilares,
  parametrosDuplicadas,
  porcentajeSimilitud,
  problemaBusquedaDuplicadas,
  resumenGeneracion,
  tituloResultadoGeneracion,
  traeSimilares,
} from '../src/services/similitud.js';

const CARGO = '11111111-1111-4111-8111-111111111111';
const SKILL = 'aaaaaaa1-0000-4000-8000-000000000001';

test('el motivo de una duplicada es exactamente «duplicada»', () => {
  assert.equal(MOTIVO_DUPLICADA, 'duplicada');
});

test('el parecido se muestra en porcentaje y nunca dice 100 % si no son idénticas', () => {
  assert.equal(porcentajeSimilitud(0.88), '88 %');
  assert.equal(porcentajeSimilitud(1), '100 %');
  assert.equal(porcentajeSimilitud(0.996), '99 %');
  assert.equal(porcentajeSimilitud(0.29), '29 %');
  assert.equal(porcentajeSimilitud('0.8'), '80 %');
  // Si llegara de 0 a 100 también se entiende.
  assert.equal(porcentajeSimilitud(85), '85 %');
  assert.equal(porcentajeSimilitud(null), '—');
  assert.equal(porcentajeSimilitud(undefined), '—');
  assert.equal(porcentajeSimilitud('mucho'), '—');
  assert.equal(porcentajeSimilitud(-0.1), '—');
  assert.equal(porcentajeSimilitud(150), '—');
});

test('una parecida se lee en camelCase o snake_case, y sin id ni enunciado no sirve', () => {
  assert.deepEqual(
    leerSimilar({ id: 'p-1', enunciado: ' ¿Qué es un índice? ', estado: 'aprobada', similitud: 0.9, vecesUsada: 3 }),
    { id: 'p-1', enunciado: '¿Qué es un índice?', estado: 'aprobada', similitud: 0.9, vecesUsada: 3 }
  );
  assert.deepEqual(
    leerSimilar({ pregunta_id: 'p-2', enunciado: 'Otra', veces_usada: 0 }),
    { id: 'p-2', enunciado: 'Otra', estado: null, similitud: null, vecesUsada: 0 }
  );
  // Otra del mismo lote: puede venir sin id.
  assert.equal(leerSimilar({ enunciado: 'Del lote', similitud: 0.81 }).id, null);
  assert.equal(leerSimilar({ estado: 'aprobada' }), null);
  assert.equal(leerSimilar(null), null);
  assert.equal(leerSimilar('texto'), null);
});

test('/similares se lee como objeto con similares, como arreglo o vacío', () => {
  const item = { id: 'p-1', enunciado: 'Uno', estado: 'pendiente', similitud: 0.8 };
  assert.equal(leerSimilares({ preguntaId: 'x', umbral: 0.8, similares: [item] }).length, 1);
  assert.equal(leerSimilares([item, {}]).length, 1);
  assert.equal(leerSimilares({ elementos: [item] }).length, 1);
  assert.deepEqual(leerSimilares(null), []);
  assert.deepEqual(leerSimilares({}), []);
  // Una respuesta de aprobar sin el campo (backend anterior): nada que mostrar.
  assert.deepEqual(leerSimilares({ id: 'p-9', estado: 'aprobada', mensaje: 'Pregunta aprobada' }), []);
});

test('crear, editar y aprobar traen similares solo con similitud; el aviso no bloquea', () => {
  assert.equal(traeSimilares({ id: 'p', similares: [] }), true);
  assert.equal(traeSimilares({ id: 'p' }), false);
  assert.equal(traeSimilares(null), false);
  assert.equal(avisoSimilares([]), '');
  assert.equal(avisoSimilares(undefined), '');
  assert.match(avisoSimilares([{}]), /^Se parece a 1 pregunta del banco\. Es solo un aviso/);
  assert.match(avisoSimilares([{}, {}]), /^Se parece a 2 preguntas del banco/);
});

test('el resumen de generar-ia se muestra como texto o como filas', () => {
  assert.deepEqual(leerResumenGeneracion('  Se pidieron 5: 3 guardadas y 2 descartadas. '), {
    texto: 'Se pidieron 5: 3 guardadas y 2 descartadas.', filas: [],
  });
  assert.equal(leerResumenGeneracion('   '), null);
  assert.equal(leerResumenGeneracion(null), null);
  assert.equal(leerResumenGeneracion([1, 2]), null);
  assert.equal(leerResumenGeneracion({}), null);

  const r = leerResumenGeneracion({
    solicitadas: 5, guardadas: 3, descartadas: 2, umbral: 0.8, modo: 'sombra', modo_sombra: true,
    mensaje: 'Modo sombra activo', detalleInterno: { no: 'se muestra' }, totalTokensUsados: 12,
  });
  assert.equal(r.texto, 'Modo sombra activo');
  assert.deepEqual(r.filas.map((f) => [f.etiqueta, f.valor]), [
    ['Pedidas a la IA', '5'],
    ['Guardadas', '3'],
    ['Descartadas por parecidas', '2'],
    ['Parecido mínimo', '80 %'],
    ['Modo', 'Sombra (solo informa, no filtra)'],
    ['Modo sombra', 'Sí'],
    // Una clave que el panel no conoce se muestra con su nombre legible.
    ['Total tokens usados', '12'],
  ]);
});

const descartada = (enunciado, similar) => ({ enunciado, similar_a: similar });

test('las descartadas dicen a qué se parecían y si igual se guardaron (modo sombra)', () => {
  const data = {
    preguntas: [{ pregunta_id: 'n-1', enunciado: 'Explica qué es un ÍNDICE  en SQL' }],
    descartadas: [
      descartada('Explica qué es un índice en SQL', { id: 'p-1', enunciado: 'Qué es un índice', estado: 'aprobada', similitud: 0.86 }),
      descartada('Describe PUT y PATCH', { enunciado: 'Otra del lote', similitud: 0.9 }),
      null,
    ],
  };
  const lista = leerDescartadas(data);
  assert.equal(lista.length, 2);
  // Mismo enunciado (sin importar mayúsculas, tildes ni espacios) que una guardada: modo sombra.
  assert.equal(lista[0].guardada, true);
  assert.equal(lista[0].guardadaId, 'n-1');
  assert.equal(lista[0].similarA.id, 'p-1');
  assert.equal(lista[0].similarA.similitud, 0.86);
  assert.equal(lista[1].guardada, false);
  assert.equal(lista[1].guardadaId, null);
  assert.equal(lista[1].similarA.id, null);
  assert.deepEqual(leerDescartadas({}), []);
  assert.deepEqual(leerDescartadas({ descartadas: 'no' }), []);
});

test('si se descartan todas, V2 responde 200 con preguntas vacías y el panel lo dice', () => {
  const data = {
    preguntas_generadas: 0,
    preguntas_con_error: 0,
    preguntas: [],
    preguntas_descartadas: 3,
    descartadas: [descartada('A', { id: 'p-1', enunciado: 'a' }), descartada('B', null), descartada('C', null)],
    resumen: 'Se pidieron 3: 0 guardadas y 3 descartadas.',
  };
  const r = resumenGeneracion(data);
  assert.equal(r.todasDescartadas, true);
  assert.equal(r.generadas, 0);
  assert.equal(r.numDescartadas, 3);
  assert.equal(r.modoSombra, false);
  assert.equal(r.resumen.texto, 'Se pidieron 3: 0 guardadas y 3 descartadas.');
  assert.equal(tituloResultadoGeneracion(r), 'No se guardó ninguna pregunta: las 3 se parecían a otras del banco');
  assert.equal(
    tituloResultadoGeneracion({ ...r, numDescartadas: 1 }),
    'No se guardó la pregunta: se parecía a otra del banco'
  );
});

test('con algunas descartadas el título cuenta cuántas; sin similitud queda como antes', () => {
  const parcial = resumenGeneracion({
    preguntas_generadas: 3,
    preguntas: [{ enunciado: 'x' }, { enunciado: 'y' }, { enunciado: 'z' }],
    preguntas_descartadas: 2,
    descartadas: [descartada('a', null), descartada('b', null)],
  });
  assert.equal(parcial.todasDescartadas, false);
  assert.equal(
    tituloResultadoGeneracion(parcial),
    'Preguntas generadas: 3. Quedan pendientes de aprobación. 2 se descartaron por parecerse a otras'
  );
  // Modo sombra: «se habrían descartado».
  const sombra = resumenGeneracion({
    preguntas: [{ pregunta_id: 'n-1', enunciado: 'a' }],
    descartadas: [descartada('a', null)],
  });
  assert.equal(sombra.modoSombra, true);
  assert.match(tituloResultadoGeneracion(sombra), /1 se habría descartado por parecerse a otras$/);

  // Backend anterior: sin descartadas ni resumen; con 0 generadas no es «todas descartadas».
  const viejo = resumenGeneracion({ preguntas_generadas: 2, preguntas_con_error: 1, preguntas: [{}, {}] });
  assert.deepEqual(
    { ...viejo, descartadas: viejo.descartadas.length },
    { generadas: 2, conError: 1, numDescartadas: 0, descartadas: 0, todasDescartadas: false, modoSombra: false, resumen: null }
  );
  assert.equal(resumenGeneracion({ preguntas: [] }).todasDescartadas, false);
  // El contador manda si la lista llega recortada.
  assert.equal(resumenGeneracion({ preguntas: [], preguntas_descartadas: 5, descartadas: [] }).numDescartadas, 5);
  assert.equal(resumenGeneracion(null).generadas, 0);
});

test('los grupos de /duplicadas se leen como objeto o arreglo y se ignoran los vacíos', () => {
  const grupos = leerGruposDuplicadas({
    grupos: [
      { similitudMaxima: 0.93, preguntas: [{ id: 'a', enunciado: 'A', estado: 'aprobada', vecesUsada: 4 }, { id: 'b', enunciado: 'B', estado: 'pendiente', vecesUsada: 0 }] },
      { similitud_maxima: '0.8', preguntas: [{ id: 'c', enunciado: 'C' }, { id: 'd', enunciado: 'D' }] },
      { similitudMaxima: 0.9, preguntas: [] },
      null,
    ],
    analizadas: 14,
  });
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].similitudMaxima, 0.93);
  assert.equal(grupos[0].preguntas[0].vecesUsada, 4);
  assert.equal(grupos[1].similitudMaxima, 0.8);
  assert.equal(leerGruposDuplicadas([{ preguntas: [{ id: 'x', enunciado: 'X' }] }]).length, 1);
  assert.deepEqual(leerGruposDuplicadas(undefined), []);
});

test('un grupo sabe cuántas siguen activas y cuál conviene dejar', () => {
  const grupo = {
    preguntas: [
      { id: 'pend', estado: 'pendiente', vecesUsada: 9 },
      { id: 'aprob-poco', estado: 'aprobada', vecesUsada: 1 },
      { id: 'aprob-mucho', estado: 'aprobada', vecesUsada: 30 },
      { id: 'rech', estado: 'rechazada', vecesUsada: 99 },
    ],
  };
  assert.equal(activasDelGrupo(grupo), 3);
  // La aprobada más usada, aunque una pendiente o una rechazada tengan más usos.
  assert.equal(idSugeridaConservar(grupo), 'aprob-mucho');
  assert.equal(idSugeridaConservar({ preguntas: [{ id: 'p1', estado: 'pendiente', vecesUsada: 0 }, { id: 'p2', estado: 'pendiente', vecesUsada: 0 }] }), 'p1');
  assert.equal(idSugeridaConservar({ preguntas: [{ id: 'r', estado: 'rechazada' }] }), null);
  assert.equal(activasDelGrupo({ preguntas: [{ estado: 'rechazada' }, { estado: 'aprobada' }] }), 1);
  assert.equal(activasDelGrupo(null), 0);
});

test('buscar duplicadas exige cargo o skill, y con skill se busca por la skill', () => {
  const base = { cargoId: '', skillId: '', nivel: 'junior', tipo: 'abierta_texto', categoria: 'tecnica', umbral: '' };
  assert.match(problemaBusquedaDuplicadas(base), /Elige un cargo o una skill/);
  assert.equal(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO }), null);
  assert.equal(problemaBusquedaDuplicadas({ ...base, skillId: SKILL }), null);
  assert.equal(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO, nivel: 'experto' }), 'Elige un nivel.');
  assert.equal(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO, tipo: 'x' }), 'Elige un tipo de pregunta.');
  assert.equal(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO, categoria: 'x' }), 'Elige una categoría.');
  assert.match(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO, umbral: '0.3' }), /50 % a 100 %/);
  assert.match(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO, umbral: 'abc' }), /50 % a 100 %/);
  assert.equal(problemaBusquedaDuplicadas({ ...base, cargoId: CARGO, umbral: '0.9' }), null);

  assert.deepEqual(parametrosDuplicadas({ ...base, cargoId: CARGO }), { nivel: 'junior', tipo: 'abierta_texto', categoria: 'tecnica', cargoId: CARGO });
  // Con cargo y skill elegidos, viaja solo la skill.
  assert.deepEqual(parametrosDuplicadas({ ...base, cargoId: CARGO, skillId: SKILL, umbral: '0.7' }), {
    nivel: 'junior', tipo: 'abierta_texto', categoria: 'tecnica', skillId: SKILL, umbral: '0.7',
  });
});

test('la búsqueda en la URL solo acepta valores conocidos e ids bien formados', () => {
  const p = new URLSearchParams({ cargoId: CARGO, nivel: 'senior', tipo: 'opcion_multiple', categoria: 'blanda', umbral: '0.9' });
  assert.deepEqual(leerBusquedaDeUrl(p), {
    busqueda: { cargoId: CARGO, skillId: '', nivel: 'senior', tipo: 'opcion_multiple', categoria: 'blanda', umbral: '0.9' },
    buscar: true,
  });
  const malo = new URLSearchParams({ cargoId: 'no-es-uuid', nivel: 'experto', umbral: '0.42' });
  assert.deepEqual(leerBusquedaDeUrl(malo), {
    busqueda: { cargoId: '', skillId: '', nivel: 'junior', tipo: 'abierta_texto', categoria: 'tecnica', umbral: '' },
    buscar: false,
  });
  assert.equal(leerBusquedaDeUrl(new URLSearchParams({ skillId: SKILL })).buscar, true);
  assert.equal(leerBusquedaDeUrl(null).buscar, false);
});

const errorHttp = (status, data) => ({ response: { status, data } });

test('un backend sin similitud se reconoce y no se confunde con otros errores', () => {
  // Ktor responde 404 sin cuerpo a una ruta que no existe.
  assert.equal(esRutaNoDisponible(errorHttp(404, '')), true);
  assert.equal(esRutaNoDisponible(errorHttp(404, undefined)), true);
  assert.equal(esRutaNoDisponible(errorHttp(405, {})), true);
  // Un 404 con código propio es otra cosa (por ejemplo, la pregunta no existe).
  assert.equal(esRutaNoDisponible(errorHttp(404, { error: 'pregunta_no_encontrada' })), false);
  assert.equal(esRutaNoDisponible(errorHttp(500, {})), false);
  assert.equal(esRutaNoDisponible({}), false);

  // /duplicadas en un backend anterior cae en /admin/preguntas/{id} y responde 400 id_invalido.
  assert.equal(duplicadasNoDisponible(errorHttp(400, { error: 'id_invalido' })), true);
  assert.equal(duplicadasNoDisponible(errorHttp(404, '')), true);
  assert.equal(duplicadasNoDisponible(errorHttp(400, { error: 'umbral_invalido' })), false);
  assert.equal(duplicadasNoDisponible(errorHttp(400, { error: 'nivel_invalido' })), false);
});
