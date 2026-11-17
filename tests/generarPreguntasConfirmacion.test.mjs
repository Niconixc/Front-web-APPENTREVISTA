// Cableado del tope en src/components/GenerarPreguntas.jsx: la confirmación y el aviso del 429.
// Las pruebas corren en Node sin DOM (no hay jsdom ni Testing Library), así que se revisa el código fuente del
// componente: que use las funciones puras de topeGeneracion.js (probadas en tests/topeGeneracion.test.mjs) donde
// corresponde. Corre con: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fuente = readFileSync(new URL('../src/components/GenerarPreguntas.jsx', import.meta.url), 'utf8');

/** Cuerpo de una función del componente (`  const nombre = ... => {` hasta su cierre: `  };` o, con useCallback, `  }, [...]);`). */
const cuerpoDe = (nombre, cierre = '\n  };') => {
  const inicio = fuente.indexOf(`  const ${nombre} = `);
  assert.notEqual(inicio, -1, `no se encontró ${nombre}`);
  const fin = fuente.indexOf(cierre, inicio);
  assert.notEqual(fin, -1, `no se encontró el final de ${nombre}`);
  return fuente.slice(inicio, fin);
};

/** Desde role="dialog" hasta el final del componente (el diálogo es lo último que se pinta). */
const dialogo = () => {
  const inicio = fuente.indexOf('role="dialog"');
  assert.notEqual(inicio, -1, 'no se encontró el diálogo de confirmación');
  return fuente.slice(inicio);
};

test('al abrir la confirmación se vuelve a leer el tope y, mientras llega, la línea dice que es la última lectura', () => {
  const abrir = cuerpoDe('abrirConfirmacion');
  const pide = abrir.indexOf('cargarReferencia()');
  assert.notEqual(pide, -1, 'abrirConfirmacion debe volver a pedir Costos IA');
  assert.ok(pide < abrir.indexOf('setModalAbierto(true)'), 'se pide antes de abrir: el diálogo ya nace «actualizando»');
  // Lo que el lector de pantalla va a oír al abrir, para anunciar solo si la lectura nueva lo cambia.
  assert.match(abrir, /setAvisoAlAbrir\(avisoAntesDeGenerar\(tope, costoEstimado\)\)/);

  assert.match(
    fuente,
    /lineaTopeEnConfirmacion\(tope, costoEstimado, \{\s*actualizando: leyendoTope,\s*sinActualizar: lecturaTopeFallida,?\s*\}\)/
  );
  const cargar = cuerpoDe('cargarReferencia', '\n  }, []);');
  assert.match(cargar, /setLeyendoTope\(true\)/);
  assert.match(cargar, /finally \{\s*if \(vigente\(\)\) setLeyendoTope\(false\);/);
});

test('si falla la relectura, el tope conocido no se borra: queda marcado «no se pudo actualizar» y se anuncia', () => {
  const cargar = cuerpoDe('cargarReferencia', '\n  }, []);');
  const captura = cargar.slice(cargar.indexOf('} catch'), cargar.indexOf('} finally'));
  assert.ok(captura.length > 0, 'no se encontró el catch de cargarReferencia');
  // Sin comentarios: lo que importa es lo que hace.
  const codigoCaptura = captura.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(codigoCaptura, /setTope\(/, 'el catch no puede borrar el tope que ya se sabía');
  assert.match(codigoCaptura, /if \(vigente\(\)\) setLecturaTopeFallida\(true\);/);
  // La nota del 429 no se arma con un dato viejo: sigue devolviendo null si la lectura falla.
  assert.match(codigoCaptura, /return null;/);
  const exito = cargar.slice(cargar.indexOf('try {'), cargar.indexOf('} catch'));
  assert.match(exito, /setTope\(leido\);\s*setLecturaTopeFallida\(false\);/);

  // El diálogo lo dice en palabras (región viva) y la página marca el bloque del tope.
  assert.match(fuente, /anuncioTopeActualizado\(\{[^}]*lecturaFallida: lecturaTopeFallida/);
  assert.match(fuente, /<TopeGeneracionIa[^>]*desactualizado=\{lecturaTopeFallida\}/);
  const bloque = readFileSync(new URL('../src/components/TopeGeneracionIa.jsx', import.meta.url), 'utf8');
  assert.match(bloque, /const nota = notaTopeDesactualizado\(tope, desactualizado\);/);
  assert.match(bloque, /\{nota && <p className="tope-ia-nota">\{nota\}<\/p>\}/);
});

test('tras el 429 del tope no se dice «Generando…»: se lee el tope sin pedir que no se cierre ni contar segundos', () => {
  const generar = cuerpoDe('generar');
  const marca = generar.indexOf('setLeyendoNotaTope(true)');
  assert.notEqual(marca, -1, 'la rama del 429 del tope debe pasar a la fase de lectura');
  assert.ok(marca < generar.indexOf('await notaTopeConLecturaNueva('), 'antes de esperar la lectura del tope');
  assert.match(generar.slice(generar.indexOf('} finally {')), /setLeyendoNotaTope\(false\)/);

  // La advertencia al salir y el reloj solo corren mientras de verdad se genera.
  const efecto = fuente.slice(
    fuente.lastIndexOf('useEffect(() => {', fuente.indexOf("addEventListener('beforeunload'")),
    fuente.indexOf("removeEventListener('beforeunload'")
  );
  assert.match(efecto, /if \(!generando \|\| leyendoNotaTope\) return undefined;/);
  assert.match(fuente, /\}, \[generando, leyendoNotaTope\]\);/);

  // La región de progreso cambia de texto en esa fase.
  const region = fuente.slice(fuente.indexOf('className="gp-progress"'), fuente.indexOf('className="form-actions"'));
  const inicioLectura = region.indexOf('{leyendoNotaTope ? (');
  assert.notEqual(inicioLectura, -1, 'la región de progreso debe distinguir la fase de lectura del tope');
  const ramaLectura = region.slice(inicioLectura, region.indexOf(') : (', inicioLectura)).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.match(ramaLectura, /No se generaron preguntas \(sin costo\)\. Leyendo el tope del mes/);
  assert.doesNotMatch(ramaLectura, /Generando|no cierres|segundos/);
  // El botón tampoco dice «Generando…» en esa fase.
  assert.match(fuente, /if \(generando\) textoBotonGenerar = leyendoNotaTope \? 'Leyendo el tope\.\.\.' : 'Generando\.\.\.';/);
});

test('el diálogo se describe con el aviso del tope (aria-describedby) y nombra ids que existen', () => {
  const texto = dialogo();
  const apertura = texto.slice(0, texto.indexOf('<h2'));
  const ids = /aria-describedby=\{idsDescripcionConfirmacion\(lineaTope, '([\w-]+)', '([\w-]+)'\)\}/.exec(apertura);
  assert.ok(ids, 'el elemento role="dialog" debe tener aria-describedby con idsDescripcionConfirmacion');
  for (const id of ids.slice(1)) {
    assert.match(texto, new RegExp(`id="${id}"`), `falta el elemento con id="${id}" dentro del diálogo`);
  }
  // Región viva dentro del diálogo para el cambio de aviso que llega con el diálogo ya abierto.
  assert.match(texto, /role="status">\{anuncioTope\}</);
});

test('el aviso del 429 muestra la nota ya armada con la lectura nueva, sin recalcularla con el tope de la página', () => {
  const inicio = fuente.indexOf('role="alert">'); // el elemento, no los comentarios que lo nombran
  assert.notEqual(inicio, -1, 'no se encontró el aviso de error de la generación');
  const aviso = fuente.slice(inicio, fuente.indexOf('gp-result-actions', inicio));
  assert.match(aviso, /\{errorGeneracion\.nota && <p>\{errorGeneracion\.nota\}<\/p>\}/);
  assert.doesNotMatch(aviso, /\btope\b/, 'el texto del role="alert" no puede depender del tope que cambia después');

  const generar = cuerpoDe('generar');
  assert.match(generar, /await notaTopeConLecturaNueva\(cargarReferencia\)/);
  // Esa lectura ya cuenta como la de después de generar: no se pide dos veces.
  assert.match(generar, /if \(!referenciaPedida\) cargarReferencia\(\)/);
});
