import { useEffect, useState } from 'react';
import Icono from './Icono';
import { EVENTO_TEMA, elegirTema, leerPreferencia } from '../services/tema';

const OPCIONES = [
  { valor: 'claro', texto: 'Claro', icono: 'sol' },
  { valor: 'oscuro', texto: 'Oscuro', icono: 'luna' },
  { valor: 'sistema', texto: 'Auto', icono: 'monitor' },
];

/** Selector de tema del menú lateral: Claro, Oscuro o Auto (sigue a Windows o al navegador). */
const SelectorTema = () => {
  const [preferencia, setPreferencia] = useState(leerPreferencia);

  // Se pone al día si el tema cambia desde otra pestaña.
  useEffect(() => {
    const alCambiar = (e) => setPreferencia(e.detail?.preferencia ?? leerPreferencia());
    window.addEventListener(EVENTO_TEMA, alCambiar);
    return () => window.removeEventListener(EVENTO_TEMA, alCambiar);
  }, []);

  return (
    <div className="selector-tema" role="group" aria-label="Tema del panel">
      {OPCIONES.map((opcion) => {
        const activa = preferencia === opcion.valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activa}
            className={`selector-tema__opcion${activa ? ' selector-tema__opcion--activa' : ''}`}
            title={opcion.valor === 'sistema' ? 'Igual que Windows o el navegador' : `Tema ${opcion.texto.toLowerCase()}`}
            onClick={() => elegirTema(opcion.valor)}
          >
            <Icono nombre={opcion.icono} />
            <span>{opcion.texto}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SelectorTema;
