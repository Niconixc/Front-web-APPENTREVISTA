// Pruebas de los traductores formulario ↔ API del backend V2 (src/services/etiquetas.js).
// Corre con: npm test (usa el corredor de pruebas que trae Node, sin dependencias).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aSolicitudPregunta,
  desdeRespuestaPregunta,
  diasEntre,
  formatearDiaUtc,
  formatearUsd,
  formularioVacio,
  limpiarVacios,
  validarFormularioPregunta,
} from '../src/services/etiquetas.js';

const multiple = () => ({
  ...formularioVacio(),
  enunciado: '  ¿Qué es una corrutina?  ',
  cargoId: 'c-1',
  opciones: [
    { texto: ' Una función suspendible ', esCorrecta: true, explicacion: ' Correcto ' },
    { texto: 'Un hilo', esCorrecta: false, explicacion: '' },
  ],
});

const abierta = (cambios = {}) => ({
  ...formularioVacio(),
  tipo: 'abierta_texto',
  enunciado: 'Explica el patrón STAR',
  skillId: 's-1',
  opciones: [],
  ...cambios,
});

test('opción múltiple: SolicitudPregunta con opciones recortadas y sin explicaciones vacías', () => {
  const s = aSolicitudPregunta(multiple());
  assert.deepEqual(s, {
    tipo: 'opcion_multiple',
    categoria: 'tecnica',
    nivel: 'junior',
    enunciado: '¿Qué es una corrutina?',
    cargoId: 'c-1',
    opciones: [
      { texto: 'Una función suspendible', esCorrecta: true, explicacion: 'Correcto' },
      { texto: 'Un hilo', esCorrecta: false },
    ],
  });
  assert.equal('rubrica' in s, false, 'una pregunta de alternativas no lleva rúbrica');
});

test('abierta: rúbrica como objeto (criterios por línea, palabras por coma, tiempo) y sin opciones', () => {
  const s = aSolicitudPregunta(abierta({ rubricaCriterios: 'claridad\n\n estructura ', rubricaPalabrasClave: 'situación, tarea ,acción', rubricaTiempoSeg: '90' }));
  assert.deepEqual(s.rubrica, { criterios: ['claridad', 'estructura'], palabras_clave: ['situación', 'tarea', 'acción'], tiempo_esperado_seg: 90 });
  assert.equal('opciones' in s, false, 'V2 responde opciones_no_permitidas si una abierta trae opciones');
  assert.equal(s.skillId, 's-1');
});

test('editar conserva las claves de la rúbrica que el formulario no edita', () => {
  const pregunta = {
    id: 'p-1', tipo: 'abierta_texto', categoria: 'blanda', nivel: 'senior', enunciado: 'Cuéntame un conflicto',
    cargoId: null, skillId: 's-9', respuestaIdeal: null,
    rubrica: { metodo: 'STAR', criterios: ['empatia'], duracion_esperada_seg: 120 },
    opciones: [],
  };
  const form = desdeRespuestaPregunta(pregunta);
  assert.equal(form.rubricaCriterios, 'empatia');
  const s = aSolicitudPregunta(form);
  assert.deepEqual(s.rubrica, { metodo: 'STAR', criterios: ['empatia'], duracion_esperada_seg: 120 });
});

test('editar una pregunta de alternativas generada con IA no borra su respuesta ideal ni su rúbrica', () => {
  const pregunta = {
    tipo: 'opcion_multiple', categoria: 'tecnica', nivel: 'junior', enunciado: 'val o var', cargoId: 'c-1', skillId: null,
    respuestaIdeal: 'val no se reasigna', rubrica: { metodo: 'STAR', criterios: ['inmutabilidad'] },
    opciones: [{ texto: 'val', esCorrecta: true, explicacion: null, orden: 1 }, { texto: 'var', esCorrecta: false, explicacion: null, orden: 2 }],
  };
  const s = aSolicitudPregunta(desdeRespuestaPregunta(pregunta));
  assert.equal(s.respuestaIdeal, 'val no se reasigna');
  assert.deepEqual(s.rubrica, { metodo: 'STAR', criterios: ['inmutabilidad'] });
});

test('desdeRespuestaPregunta ordena las opciones por orden y vuelve a la misma solicitud', () => {
  const pregunta = {
    tipo: 'opcion_multiple', categoria: 'tecnica', nivel: 'semisenior', enunciado: 'HAVING o WHERE', cargoId: 'c-2', skillId: null,
    respuestaIdeal: null, rubrica: null,
    opciones: [
      { id: 'b', texto: 'WHERE', esCorrecta: false, explicacion: null, orden: 2 },
      { id: 'a', texto: 'HAVING', esCorrecta: true, explicacion: 'Filtra grupos', orden: 1 },
    ],
  };
  const s = aSolicitudPregunta(desdeRespuestaPregunta(pregunta));
  assert.deepEqual(s.opciones, [{ texto: 'HAVING', esCorrecta: true, explicacion: 'Filtra grupos' }, { texto: 'WHERE', esCorrecta: false }]);
  assert.equal(s.nivel, 'semisenior');
});

test('validación con las mismas reglas que V2', () => {
  assert.equal(validarFormularioPregunta(multiple()), null);
  assert.match(validarFormularioPregunta({ ...multiple(), enunciado: '   ' }), /enunciado/);
  assert.match(validarFormularioPregunta({ ...multiple(), enunciado: 'x'.repeat(2001) }), /2000/);
  assert.match(validarFormularioPregunta({ ...multiple(), cargoId: '', skillId: '' }), /cargo o la skill/);
  const conOpciones = (opciones) => validarFormularioPregunta({ ...multiple(), opciones });
  assert.match(conOpciones([{ texto: 'a', esCorrecta: true, explicacion: '' }]), /entre 2 y 6/);
  assert.match(conOpciones([{ texto: 'a', esCorrecta: true, explicacion: '' }, { texto: '', esCorrecta: false, explicacion: '' }]), /necesitan texto/);
  assert.match(conOpciones([{ texto: 'a', esCorrecta: true, explicacion: '' }, { texto: 'b', esCorrecta: true, explicacion: '' }]), /exactamente una/);
  assert.match(conOpciones([{ texto: 'Igual', esCorrecta: true, explicacion: '' }, { texto: ' igual ', esCorrecta: false, explicacion: '' }]), /repetidas/);
  assert.match(validarFormularioPregunta(abierta()), /respuesta ideal o una rúbrica/);
  assert.equal(validarFormularioPregunta(abierta({ respuestaIdeal: 'Situación, tarea, acción y resultado' })), null);
  assert.equal(validarFormularioPregunta(abierta({ rubricaPalabrasClave: 'situación' })), null);
});

test('una rúbrica vaciada al editar ya no cuenta como rúbrica', () => {
  const form = abierta({ rubricaOriginal: { criterios: ['x'] }, rubricaCriterios: '' });
  assert.equal(aSolicitudPregunta(form).rubrica, undefined);
  assert.match(validarFormularioPregunta(form), /respuesta ideal o una rúbrica/);
});

test('limpiarVacios quita vacíos y recorta textos, pero conserva false y 0', () => {
  assert.deepEqual(limpiarVacios({ a: '', b: null, c: undefined, d: ' x ', e: false, f: 0 }), { d: 'x', e: false, f: 0 });
});

test('días UTC sin correrse por la zona horaria', () => {
  assert.equal(formatearDiaUtc('2026-11-01'), '01-11-2026');
  assert.deepEqual(diasEntre('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(diasEntre('2026-11-05', '2026-11-04'), []);
});

test('montos en USD: 6 decimales si son fracciones de centavo', () => {
  assert.equal(formatearUsd(0.00045), 'US$ 0.000450');
  assert.equal(formatearUsd(1.5), 'US$ 1.5000');
  assert.equal(formatearUsd(null), 'US$ 0.0000');
});
