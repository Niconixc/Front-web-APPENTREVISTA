// Pruebas de la cobertura del banco frente al mercado y del contexto de mercado (src/services/cobertura.js).
// Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  celdaCobertura,
  formatearSincronizacion,
  prellenadoGenerar,
  resumenCobertura,
  rutaPendientesSkill,
  textoContextoMercado,
} from '../src/services/cobertura.js';

const skill = {
  skillId: 's-1',
  nombre: 'Kotlin',
  categoria: 'tecnica',
  aprobadas: { junior: 5, semisenior: 1, senior: 0 },
  pendientes: { junior: 0, semisenior: 4, senior: 2 },
  faltan: { junior: 0, semisenior: 4, senior: 5 },
};

test('una celda dice si alcanza, si basta revisar las pendientes o cuántas generar', () => {
  assert.deepEqual(celdaCobertura(skill, 'junior'), { aprobadas: 5, pendientes: 0, faltan: 0, estado: 'ok', generar: 0 });
  // Faltan 4 y hay 4 pendientes: aprobarlas no cuesta, no se sugiere generar.
  assert.equal(celdaCobertura(skill, 'semisenior').estado, 'revisar');
  assert.equal(celdaCobertura(skill, 'semisenior').generar, 0);
  // Faltan 5 y hay 2 pendientes: se sugiere generar 3.
  assert.deepEqual(celdaCobertura(skill, 'senior'), { aprobadas: 0, pendientes: 2, faltan: 5, estado: 'falta', generar: 3 });
});

test('lo sugerido nunca pasa el máximo por generación ni baja de 1, y tolera datos raros', () => {
  assert.equal(celdaCobertura({ faltan: { junior: 40 } }, 'junior').generar, 10);
  assert.equal(celdaCobertura({ faltan: { junior: '3' }, pendientes: { junior: -2 } }, 'junior').generar, 3);
  assert.deepEqual(celdaCobertura(null, 'junior'), { aprobadas: 0, pendientes: 0, faltan: 0, estado: 'ok', generar: 0 });
});

test('el prellenado lleva cargo, skill, nivel, categoría y una cantidad válida', () => {
  const cargo = { cargoId: 'c-1', nombre: 'Backend Developer', area: 'backend' };
  assert.deepEqual(prellenadoGenerar(cargo, skill, 'senior', 3), {
    area: 'backend', cargoId: 'c-1', cargoNombre: 'Backend Developer', skillId: 's-1', skillNombre: 'Kotlin',
    nivel: 'senior', categoria: 'tecnica', cantidad: '3',
  });
  assert.equal(prellenadoGenerar(cargo, { ...skill, categoria: 'blanda' }, 'junior', 50).cantidad, '10');
  assert.equal(prellenadoGenerar(cargo, { ...skill, categoria: 'rara' }, 'junior', 0).categoria, 'tecnica');
  assert.equal(prellenadoGenerar(cargo, skill, 'junior', 0).cantidad, '1');
});

test('la ruta de pendientes muestra las mismas que cuenta la celda: skill, nivel y del cargo o sin cargo', () => {
  assert.equal(
    rutaPendientesSkill('s-1', 'senior', 'c-1'),
    '/preguntas?estado=pendiente&skillId=s-1&nivel=senior&paraCargoId=c-1'
  );
  assert.equal(rutaPendientesSkill('s-1', 'junior'), '/preguntas?estado=pendiente&skillId=s-1&nivel=junior');
});

test('el resumen suma lo que falta y separa los cargos sin skills del mercado', () => {
  const conSkills = [{ skillId: 's' }];
  const data = {
    cargos: [
      { preguntasFaltantes: 10, skills: conSkills },
      { preguntasFaltantes: 0, skills: [] },
      { preguntasFaltantes: '3', skills: conSkills },
    ],
  };
  assert.deepEqual(resumenCobertura(data), { cargos: 3, cargosIncompletos: 2, cargosSinSkills: 1, preguntasFaltantes: 13 });
  assert.deepEqual(resumenCobertura(null), { cargos: 0, cargosIncompletos: 0, cargosSinSkills: 0, preguntasFaltantes: 0 });
});

test('la fecha de sincronización se muestra corta y "nunca" si no hubo', () => {
  assert.equal(formatearSincronizacion('2026-11-10T03:15:42.123'), '10-11-2026 03:15');
  assert.equal(formatearSincronizacion(null), 'nunca');
});

test('el contexto de mercado se explica con ofertas, skills y fragmentos o con el motivo', () => {
  const usado = textoContextoMercado({
    usado: true,
    consulta: 'Backend Developer',
    ofertas_analizadas: 12,
    fuentes: ['Remotive API'],
    es_respaldo: false,
    skills_frecuentes: [{ nombre: 'Kotlin', ofertas: 9 }],
    fragmentos: [{ texto: '5+ years with Kotlin', titulo_oferta: 'Senior Backend', fuente: 'Remotive API' }],
  });
  assert.equal(usado.titulo, 'Se usaron 12 ofertas de empleo reales de Remotive API');
  assert.deepEqual(usado.skills, ['Kotlin (9 de 12)']);
  assert.equal(usado.fragmentos[0].oferta, 'Senior Backend');
  assert.equal(usado.detalle, 'Búsqueda: Backend Developer');

  assert.equal(textoContextoMercado({ usado: true, ofertas_analizadas: 1, fuentes: [] }).titulo, 'Se usó 1 oferta de empleo real');
  assert.match(textoContextoMercado({ usado: true, ofertas_analizadas: 4, es_respaldo: true }).titulo, /referencia/);

  const sin = textoContextoMercado({ usado: false, motivo: 'apis_sin_respuesta', mensaje: 'Las APIs no respondieron' });
  assert.deepEqual(sin, { usado: false, titulo: 'Se generó sin ofertas de empleo', detalle: 'Las APIs no respondieron' });
  assert.equal(textoContextoMercado(undefined), null);
});
