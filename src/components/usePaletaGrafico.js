import { useEffect, useState } from 'react';

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
  };
};

/** La paleta actual; se vuelve a leer si el sistema cambia entre claro y oscuro. */
const usePaletaGrafico = () => {
  const [paleta, setPaleta] = useState(leerPaleta);
  useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!consulta) return undefined;
    const alCambiar = () => setPaleta(leerPaleta());
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);
  return paleta;
};

export default usePaletaGrafico;
