// Cierre de un diálogo con un clic en su fondo oscuro (fuera de la caja). Lo usa src/components/FondoModal.jsx.
// Función pura: se prueba en tests/cierrePorFondo.test.mjs.

/**
 * Tiempo (ms) desde que se abre el diálogo durante el que un clic en el fondo no lo cierra. Es el intervalo de doble clic
 * por defecto de Windows: el fondo cubre toda la pantalla apenas se abre el diálogo, así que el 2.º clic de un doble clic
 * sobre el botón que lo abrió cae en el fondo y lo cerraría al instante (el diálogo parpadea y parece que el botón no
 * funciona).
 */
export const ESPERA_CIERRE_POR_FONDO_MS = 500;

/**
 * ¿Este clic en el fondo debe cerrar el diálogo? Solo un clic simple que empezó y terminó en el propio fondo, pasados
 * ESPERA_CIERRE_POR_FONDO_MS desde que se abrió. No cierran:
 * - el 2.º (o 3.º) clic de un doble clic: clicsSeguidos (el `detail` del evento) mayor que 1;
 * - un clic que empezó dentro del diálogo y se soltó en el fondo (por ejemplo, al seleccionar texto de un campo y
 *   arrastrar hacia afuera): se perdería lo escrito;
 * - un clic en los primeros ESPERA_CIERRE_POR_FONDO_MS, por si el navegador no cuenta el doble clic en `detail`.
 * clicsSeguidos 0 (clic sintético, sin contador) cuenta como un clic simple.
 */
export const debeCerrarPorFondo = ({ empezoEnFondo, terminoEnFondo, clicsSeguidos = 1, msDesdeApertura }) =>
  empezoEnFondo === true
  && terminoEnFondo === true
  && !(clicsSeguidos > 1)
  && Number.isFinite(msDesdeApertura)
  && msDesdeApertura >= ESPERA_CIERRE_POR_FONDO_MS;
