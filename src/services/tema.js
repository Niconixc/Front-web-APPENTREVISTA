/**
 * Tema claro u oscuro del panel. Cada persona elige en el menú lateral:
 *  - «sistema» (por defecto): sigue el modo claro u oscuro de Windows, macOS o el navegador, y cambia con él.
 *  - «claro» / «oscuro»: fijo, sin importar el sistema.
 * La elección queda en localStorage de ese navegador. El tema resuelto va en <html data-tema="claro|oscuro">, que es lo
 * que lee tokens.css. El script en línea de index.html hace lo mismo antes de pintar, para que no parpadee el tema
 * equivocado al cargar: si cambia CLAVE_TEMA o los valores, hay que cambiarlo también ahí.
 */

export const PREFERENCIAS_TEMA = ['sistema', 'claro', 'oscuro'];
export const CLAVE_TEMA = 'panel-tema';
export const EVENTO_TEMA = 'panel-tema-cambiado';

/** Color de la barra del navegador en el celular para cada tema (el mismo fondo que tokens.css). */
const COLOR_BARRA = { claro: '#f1efea', oscuro: '#141412' };

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

export const normalizarPreferencia = (valor) => (PREFERENCIAS_TEMA.includes(valor) ? valor : 'sistema');

/** El tema que se ve: la preferencia fija, o el del sistema cuando la preferencia es «sistema». */
export const resolverTema = (preferencia, sistemaOscuro) => {
  const p = normalizarPreferencia(preferencia);
  if (p === 'sistema') return sistemaOscuro ? 'oscuro' : 'claro';
  return p;
};

const almacenPorDefecto = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // algunos navegadores lanzan al tocar localStorage con los datos del sitio bloqueados
  }
};

/** La preferencia guardada; «sistema» si no hay, si es inválida o si el almacenamiento no está disponible. */
export const leerPreferencia = (almacen = almacenPorDefecto()) => {
  try {
    return normalizarPreferencia(almacen?.getItem(CLAVE_TEMA));
  } catch {
    return 'sistema';
  }
};

/** Guarda la preferencia. «sistema» borra la clave (es el valor por defecto). Si no se puede guardar, sigue igual. */
export const guardarPreferencia = (preferencia, almacen = almacenPorDefecto()) => {
  const p = normalizarPreferencia(preferencia);
  try {
    if (p === 'sistema') almacen?.removeItem(CLAVE_TEMA);
    else almacen?.setItem(CLAVE_TEMA, p);
  } catch {
    /* modo privado o almacenamiento bloqueado: el tema se aplica igual, solo no se recuerda */
  }
  return p;
};

const sistemaEstaOscuro = () => Boolean(globalThis.matchMedia?.(CONSULTA_OSCURO)?.matches);

/** Pone el tema en <html> y en la barra del navegador, y avisa a quien escuche (gráficos y el selector del menú). */
export const aplicarTema = (preferencia = leerPreferencia()) => {
  const p = normalizarPreferencia(preferencia);
  const tema = resolverTema(p, sistemaEstaOscuro());
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', COLOR_BARRA[tema]));
  window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: { preferencia: p, tema } }));
  return tema;
};

/** Cambia la preferencia (desde el menú): la guarda y la aplica de inmediato. */
export const elegirTema = (preferencia) => aplicarTema(guardarPreferencia(preferencia));

let iniciado = false;

/**
 * Se llama una vez al arrancar: aplica la preferencia guardada y se queda escuchando dos cosas, aunque no haya
 * menú en pantalla (p. ej. en el inicio de sesión): que el sistema cambie entre claro y oscuro (importa con
 * «sistema») y que otra pestaña del panel cambie la preferencia.
 */
export const iniciarTema = () => {
  aplicarTema();
  if (iniciado) return;
  iniciado = true;
  globalThis.matchMedia?.(CONSULTA_OSCURO)?.addEventListener?.('change', () => {
    if (leerPreferencia() === 'sistema') aplicarTema('sistema');
  });
  window.addEventListener('storage', (e) => {
    if (e.key === CLAVE_TEMA || e.key === null) aplicarTema();
  });
};
