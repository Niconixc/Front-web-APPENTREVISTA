// Pruebas del tema claro/oscuro (src/services/tema.js) y de su cableado. Corren en Node sin DOM: lo que depende del
// navegador (index.html, tokens.css, el menú) se revisa en el código fuente. Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLAVE_TEMA,
  guardarPreferencia,
  leerPreferencia,
  normalizarPreferencia,
  resolverTema,
} from '../src/services/tema.js';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

/** Un localStorage de mentira. */
const almacen = (inicial = {}) => {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    datos,
  };
};

const almacenQueFalla = {
  getItem() { throw new Error('bloqueado'); },
  setItem() { throw new Error('bloqueado'); },
  removeItem() { throw new Error('bloqueado'); },
};

test('una preferencia desconocida o vacía vale «sistema»', () => {
  assert.equal(normalizarPreferencia('claro'), 'claro');
  assert.equal(normalizarPreferencia('oscuro'), 'oscuro');
  assert.equal(normalizarPreferencia('sistema'), 'sistema');
  for (const valor of [null, undefined, '', 'dark', 'OSCURO']) assert.equal(normalizarPreferencia(valor), 'sistema');
});

test('«sistema» sigue al sistema; claro y oscuro lo ignoran', () => {
  assert.equal(resolverTema('sistema', true), 'oscuro');
  assert.equal(resolverTema('sistema', false), 'claro');
  assert.equal(resolverTema('claro', true), 'claro');
  assert.equal(resolverTema('oscuro', false), 'oscuro');
  assert.equal(resolverTema('cualquiera', true), 'oscuro');
});

test('la preferencia se guarda y se vuelve a leer; «sistema» borra la clave', () => {
  const a = almacen();
  assert.equal(leerPreferencia(a), 'sistema');
  guardarPreferencia('oscuro', a);
  assert.equal(a.datos.get(CLAVE_TEMA), 'oscuro');
  assert.equal(leerPreferencia(a), 'oscuro');
  guardarPreferencia('sistema', a);
  assert.equal(a.datos.has(CLAVE_TEMA), false);
  assert.equal(leerPreferencia(a), 'sistema');
});

test('un valor guardado inválido se lee como «sistema»', () => {
  assert.equal(leerPreferencia(almacen({ [CLAVE_TEMA]: 'morado' })), 'sistema');
});

test('si el almacenamiento está bloqueado no se cae: lee «sistema» y guardar no lanza', () => {
  assert.equal(leerPreferencia(almacenQueFalla), 'sistema');
  assert.doesNotThrow(() => guardarPreferencia('claro', almacenQueFalla));
  assert.equal(leerPreferencia(null), 'sistema');
});

test('el script de index.html usa la misma clave y pone data-tema antes de pintar', () => {
  const html = leer('index.html');
  const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  assert.ok(html.indexOf('<script>') < html.indexOf('<div id="root">'), 'el script va en <head>, antes de la app');
  assert.ok(script.includes(`localStorage.getItem('${CLAVE_TEMA}')`));
  assert.ok(script.includes("setAttribute('data-tema'"));
});

test('el tema oscuro depende de data-tema, no solo del sistema', () => {
  const tokens = leer('src/styles/tokens.css');
  assert.ok(tokens.includes(':root[data-tema="oscuro"] {'));
  assert.ok(!tokens.includes('prefers-color-scheme'), 'una media query ignoraría la elección «Claro»');
});

test('el menú lateral muestra el selector y los gráficos escuchan el cambio de tema', () => {
  assert.ok(leer('src/components/Navbar.jsx').includes('<SelectorTema />'));
  const paleta = leer('src/components/usePaletaGrafico.js');
  assert.ok(paleta.includes('EVENTO_TEMA'));
  assert.ok(leer('src/main.jsx').includes('iniciarTema()'));
});
