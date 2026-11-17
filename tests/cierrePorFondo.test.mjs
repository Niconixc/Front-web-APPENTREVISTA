// Pruebas del cierre de un diálogo con un clic en su fondo (src/services/cierrePorFondo.js) y de su uso en las
// confirmaciones (src/components/FondoModal.jsx). Las pruebas corren en Node sin DOM: el cableado de los componentes se
// revisa en su código fuente. Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESPERA_CIERRE_POR_FONDO_MS, debeCerrarPorFondo } from '../src/services/cierrePorFondo.js';

const leer = (archivo) => readFileSync(new URL(`../src/components/${archivo}`, import.meta.url), 'utf8');

/** Un clic simple en el fondo, empezado y terminado ahí, un rato después de abrir. */
const clic = (cambios = {}) => ({
  empezoEnFondo: true,
  terminoEnFondo: true,
  clicsSeguidos: 1,
  msDesdeApertura: 2000,
  ...cambios,
});

test('un clic simple en el fondo, pasada la espera, cierra el diálogo', () => {
  assert.equal(ESPERA_CIERRE_POR_FONDO_MS, 500);
  assert.equal(debeCerrarPorFondo(clic()), true);
  assert.equal(debeCerrarPorFondo(clic({ msDesdeApertura: ESPERA_CIERRE_POR_FONDO_MS })), true);
  // Un clic sintético (detail 0) cuenta como simple.
  assert.equal(debeCerrarPorFondo(clic({ clicsSeguidos: 0 })), true);
});

test('doble clic en el botón que abre: el 2.º clic cae en el fondo recién abierto y NO lo cierra', () => {
  // El 2.º pulsar del doble clic ya empieza en el fondo, así que «empezó en el fondo» no alcanza para descartarlo.
  assert.equal(debeCerrarPorFondo(clic({ clicsSeguidos: 2, msDesdeApertura: 120 })), false);
  // Aunque el navegador no cuente el doble clic en `detail`, llega antes de la espera.
  assert.equal(debeCerrarPorFondo(clic({ clicsSeguidos: 1, msDesdeApertura: 120 })), false);
  // Un doble clic lento (pasada la espera) igual llega con detail 2.
  assert.equal(debeCerrarPorFondo(clic({ clicsSeguidos: 2, msDesdeApertura: 700 })), false);
  assert.equal(debeCerrarPorFondo(clic({ clicsSeguidos: 3 })), false);
});

test('un arrastre que empezó dentro del diálogo y se soltó en el fondo no lo cierra', () => {
  assert.equal(debeCerrarPorFondo(clic({ empezoEnFondo: false })), false);
  assert.equal(debeCerrarPorFondo(clic({ terminoEnFondo: false })), false);
});

test('sin el momento de apertura no se cierra por el fondo', () => {
  assert.equal(debeCerrarPorFondo(clic({ msDesdeApertura: Number.NaN })), false);
  assert.equal(debeCerrarPorFondo(clic({ msDesdeApertura: undefined })), false);
});

test('FondoModal decide con debeCerrarPorFondo a partir del puntero, el detail y el momento en que se montó', () => {
  const fondo = leer('FondoModal.jsx');
  assert.match(fondo, /const \[abiertoEn\] = useState\(\(\) => performance\.now\(\)\);/);
  assert.match(fondo, /onPointerDown=\{alPresionar\}/);
  assert.match(fondo, /onClick=\{alHacerClic\}/);
  assert.match(fondo, /empezoEnFondo\.current = e\.target === e\.currentTarget;/);
  assert.match(fondo, /terminoEnFondo: e\.target === e\.currentTarget,/);
  assert.match(fondo, /clicsSeguidos: e\.detail,/);
  assert.match(fondo, /msDesdeApertura: performance\.now\(\) - abiertoEn,/);
  assert.match(fondo, /if \(cerrar\) onCerrar\(\);/);
});

test('las confirmaciones usan FondoModal: ningún fondo cierra con un onClick directo', () => {
  const usos = {
    'GenerarPreguntas.jsx': /<FondoModal onCerrar=\{cerrarModal\}>/,
    'QuestionList.jsx': /<FondoModal onCerrar=\{cerrarRechazo\}>/,
    'QuestionEdit.jsx': /<FondoModal className="qf-modal-fondo" onCerrar=\{cerrarRechazo\}>/,
  };
  for (const [archivo, uso] of Object.entries(usos)) {
    const codigo = leer(archivo);
    assert.match(codigo, uso, `${archivo} debe usar FondoModal`);
    assert.doesNotMatch(
      codigo,
      /className="(modal-backdrop|qf-modal-fondo)"[^>]*onClick=/,
      `${archivo}: el fondo no puede cerrar con un onClick directo`
    );
  }
});
