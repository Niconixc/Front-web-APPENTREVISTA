import { useRef, useState } from 'react';
import { debeCerrarPorFondo } from '../services/cierrePorFondo';

/**
 * Fondo oscuro de un diálogo modal. Un clic simple en él (fuera de la caja) cierra el diálogo con onCerrar, pero no el
 * 2.º clic de un doble clic sobre el botón que lo abrió (ese clic ya cae en el fondo) ni un arrastre que empezó dentro
 * del diálogo: lo decide debeCerrarPorFondo. Se monta junto con el diálogo, así que desde ahí cuenta la espera.
 * Cerrar sigue siendo posible con el botón Cancelar del diálogo y con Escape.
 *
 * className: la clase del fondo de cada pantalla (por defecto 'dialogo-fondo', de styles/componentes.css).
 */
const FondoModal = ({ className = 'dialogo-fondo', onCerrar, children }) => {
  const [abiertoEn] = useState(() => performance.now());
  const empezoEnFondo = useRef(false);

  const alPresionar = (e) => {
    empezoEnFondo.current = e.target === e.currentTarget;
  };

  const alHacerClic = (e) => {
    const cerrar = debeCerrarPorFondo({
      empezoEnFondo: empezoEnFondo.current,
      terminoEnFondo: e.target === e.currentTarget,
      clicsSeguidos: e.detail,
      msDesdeApertura: performance.now() - abiertoEn,
    });
    empezoEnFondo.current = false;
    if (cerrar) onCerrar();
  };

  return (
    <div className={className} onPointerDown={alPresionar} onClick={alHacerClic}>
      {children}
    </div>
  );
};

export default FondoModal;
