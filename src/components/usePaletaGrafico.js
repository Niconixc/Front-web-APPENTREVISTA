import { useEffect, useState } from 'react';
import { EVENTO_TEMA } from '../services/tema';

/** Colores de los gráficos (recharts) leídos de los tokens de tokens.css: cambian con el tema claro u oscuro. */
export const leerPaleta = () => {
  const estilos = getComputedStyle(document.documentElement);
  const token = (nombre) => estilos.getPropertyValue(nombre).trim() || 'currentColor';
  return {
    series: ['--grafico-1', '--grafico-2', '--grafico-3', '--grafico-4'].map(token),
    rejilla: token('--grafico-rejilla'),
    ejes: token('--texto-3'),
    texto: token('--texto'),
    texto2: token('--texto-2'),
    superficie: token('--superficie'),
    borde: token('--borde'),
    cursor: token('--superficie-hover'),
    peligro: token('--peligro'),
    coral: token('--grafico-5'),
  };
};

/** La paleta actual; se vuelve a leer cada vez que cambia el tema (botón del menú o el sistema, con «Sistema»). */
const usePaletaGrafico = () => {
  const [paleta, setPaleta] = useState(leerPaleta);
  useEffect(() => {
    const alCambiar = () => setPaleta(leerPaleta());
    window.addEventListener(EVENTO_TEMA, alCambiar);
    return () => window.removeEventListener(EVENTO_TEMA, alCambiar);
  }, []);
  return paleta;
};

export default usePaletaGrafico;
