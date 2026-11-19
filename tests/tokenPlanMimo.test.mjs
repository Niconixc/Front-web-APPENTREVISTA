// Credits del Token Plan de MiMo en el bloque del tope (planTokenMimo de Costos IA, D31 del backend). Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  avisoAntesDeGenerar,
  formatearCreditos,
  leerPlanTokenMimo,
  leerTopeGeneracion,
  lineaTopeEnConfirmacion,
  notaTopeAlcanzado,
  porcentajeTexto,
  resumenCortoTope,
  textoTope,
  valorTextoMedidor,
} from '../src/services/topeGeneracion.js';

const plan = (cambios = {}) => ({
  desde: '2026-11-18',
  hasta: '2026-12-18',
  creditosPlan: 4_100_000_000,
  creditosUsados: 2_924_200,
  creditosRestantes: 4_097_075_800,
  llamadas: 3,
  estaAgotado: false,
  ...cambios,
});

const topeEnPesos = {
  mes: '2026-11', gastadoUsd: 1.25, topeUsd: 5, restanteUsd: 3.75,
  fechaReposicion: '2026-12-01', estaDesactivado: false, estaAgotado: false,
};

test('los Credits se muestran en millones desde un millón', () => {
  assert.equal(formatearCreditos(2_924_200), '2,92 M');
  assert.equal(formatearCreditos(4_100_000_000), '4.100 M');
  assert.equal(formatearCreditos(950_000), '950.000');
  assert.equal(formatearCreditos(0), '0');
});

test('con Token Plan el tope pasa a Credits y reemplaza al de pesos', () => {
  const tope = leerTopeGeneracion({ topeGeneracionPreguntas: topeEnPesos, planTokenMimo: plan() });
  assert.equal(tope.unidad, 'creditos');
  assert.equal(tope.gastado, 2_924_200);
  assert.equal(tope.tope, 4_100_000_000);
  assert.equal(tope.fechaReposicion, '2026-12-18');
  assert.equal(tope.porcentaje, 0);
  assert.equal(tope.nivel, 'ok');
  assert.equal(porcentajeTexto(tope), '0,07 %', 'bajo 1 % se muestran decimales, como la consola de MiMo');
});

test('sin Token Plan (null o ausente) sigue el tope en pesos', () => {
  assert.equal(leerTopeGeneracion({ topeGeneracionPreguntas: topeEnPesos, planTokenMimo: null }).unidad, 'pesos');
  assert.equal(leerTopeGeneracion({ topeGeneracionPreguntas: topeEnPesos }).unidad, 'pesos');
});

test('un plan roto no se muestra (y no tapa al tope en pesos)', () => {
  const rotos = [
    plan({ creditosPlan: 0 }), plan({ creditosUsados: -1 }), plan({ creditosUsados: 1.5 }), plan({ hasta: '18-12-2026' }),
    plan({ estaAgotado: 'no' }), [], 'plan',
  ];
  for (const roto of rotos) {
    assert.equal(leerPlanTokenMimo({ planTokenMimo: roto }), null, JSON.stringify(roto));
    assert.equal(leerTopeGeneracion({ topeGeneracionPreguntas: topeEnPesos, planTokenMimo: roto }).unidad, 'pesos');
  }
});

test('desde el 80 % avisa y agotado lo decide el servidor', () => {
  const cerca = leerPlanTokenMimo({ planTokenMimo: plan({ creditosUsados: 3_300_000_000, creditosRestantes: 800_000_000 }) });
  assert.equal(cerca.nivel, 'cerca');
  assert.equal(cerca.porcentaje, 80);
  const agotado = leerPlanTokenMimo({ planTokenMimo: plan({ creditosUsados: 4_200_000_000, creditosRestantes: 0, estaAgotado: true }) });
  assert.equal(agotado.nivel, 'agotado');
  assert.equal(agotado.porcentaje, 100);
  assert.equal(textoTope(agotado).estado, 'Plan agotado');
  assert.match(avisoAntesDeGenerar(agotado, 0.01), /Token Plan de MiMo/);
  assert.match(notaTopeAlcanzado(agotado), /se renueva el 18-12-2026/);
});

test('los textos hablan de Credits del plan, no de pesos', () => {
  const tope = leerPlanTokenMimo({ planTokenMimo: plan() });
  const textos = textoTope(tope);
  assert.equal(textos.estado, 'Disponible');
  assert.equal(textos.titulo, '2,92 M Credits de 4.100 M Credits usados desde el 18-11-2026 (0,07 %)');
  assert.match(textos.detalle, /Quedan 4\.097,08 M Credits|Quedan 4\.097 M Credits/);
  assert.match(textos.detalle, /se renueva el 18-12-2026/);
  assert.doesNotMatch(`${textos.titulo} ${textos.detalle}`, /\$/);
  assert.equal(valorTextoMedidor(tope), '2,92 M Credits de 4.100 M Credits (0,07 %)');
  assert.equal(resumenCortoTope(tope), 'Token Plan de MiMo: 0,07 % usado (2,92 M Credits de 4.100 M Credits)');
  assert.equal(avisoAntesDeGenerar(tope, 999), null, 'un costo en dinero no se compara con Credits');
  assert.match(lineaTopeEnConfirmacion(tope, 0.05).texto, /^Quedan .* del Token Plan de MiMo/);
});

test('el Resumen, Informes y Generar cambian el título con el Token Plan', () => {
  const leer = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
  assert.match(leer('Dashboard.jsx'), /esPlanMimo \? 'Token Plan de MiMo'/);
  assert.match(leer('Informes.jsx'), /'Token Plan de MiMo'/);
  assert.match(leer('GenerarPreguntas.jsx'), /Credits del Token Plan de MiMo/);
});
