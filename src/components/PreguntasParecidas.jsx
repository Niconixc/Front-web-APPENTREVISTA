import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSimilares, mensajeDeError, rejectQuestion } from '../services/api';
import { ESTADOS_PREGUNTA, etiqueta } from '../services/etiquetas';
import {
  MOTIVO_DUPLICADA,
  esRutaNoDisponible,
  leerSimilares,
  porcentajeSimilitud,
} from '../services/similitud';
import FondoModal from './FondoModal';
import Icono from './Icono';

// Piezas de la similitud (preguntas parecidas) que comparten Preguntas, Editar, Crear, Generar con IA y Duplicadas.

const INSIGNIA_ESTADO = { pendiente: 'insignia--aviso', aprobada: 'insignia--exito', rechazada: 'insignia--peligro' };

const recortar = (texto, largo) => {
  const t = String(texto || '');
  return t.length > largo ? `${t.slice(0, largo)}...` : t;
};

const textoUsos = (n) => (n === 1 ? '1 uso' : `${n} usos`);

const tienePorcentaje = (s) => s.similitud !== null && s.similitud !== undefined;

/** Insignia del estado de una pregunta, con texto (el color solo no basta). */
export const InsigniaEstado = ({ estado }) => (
  estado
    ? <span className={`insignia insignia--punto ${INSIGNIA_ESTADO[estado] || ''}`.trim()}>{etiqueta(ESTADOS_PREGUNTA, estado)}</span>
    : null
);

/**
 * Lista de preguntas parecidas: parecido (%), enunciado, estado, usos y «Abrir».
 * extra(similar) agrega algo al final de los datos de cada fila; lado(similar) reemplaza el botón «Abrir».
 */
export const ListaParecidas = ({ similares, etiquetaLista = 'Preguntas parecidas', extra, lado }) => (
  <ul className="parecidas" aria-label={etiquetaLista}>
    {similares.map((s, i) => (
      <li
        key={s.id || `${i}-${s.enunciado}`}
        className={`parecidas__item${tienePorcentaje(s) ? '' : ' parecidas__item--sin-porcentaje'}`}
      >
        {/* Los grupos de /duplicadas no traen el parecido de cada pregunta: sin dato no se muestra el recuadro. */}
        {tienePorcentaje(s) && (
          <span className="parecidas__porcentaje mono" title="Parecido por palabras compartidas">
            <span className="sr-only">Parecido: </span>{porcentajeSimilitud(s.similitud)}
          </span>
        )}
        <div className="parecidas__textos">
          <p className="parecidas__enunciado">{s.enunciado || 'Sin enunciado'}</p>
          <p className="parecidas__datos">
            <InsigniaEstado estado={s.estado} />
            {s.vecesUsada !== null && s.vecesUsada !== undefined && <span className="num">{textoUsos(s.vecesUsada)}</span>}
            {extra ? extra(s) : null}
          </p>
        </div>
        <div className="parecidas__lado">
          {lado
            ? lado(s)
            : s.id && (
              <Link to={`/editar-pregunta/${s.id}`} className="boton boton--chico" aria-label={`Abrir: ${recortar(s.enunciado, 60)}`}>
                Abrir
              </Link>
            )}
        </div>
      </li>
    ))}
  </ul>
);

/**
 * Carga GET /similares de una pregunta. estado: 'inactivo' | 'cargando' | 'listo' | 'error' | 'no_disponible'
 * (backend sin similitud: la sección no se muestra). reemplazar(lista) usa la lista que trajo crear, editar o aprobar.
 */
export const useParecidas = (preguntaId, activo = true) => {
  const [estado, setEstado] = useState(activo ? 'cargando' : 'inactivo');
  const [similares, setSimilares] = useState([]);
  const [error, setError] = useState('');
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    if (!preguntaId) return;
    const n = ++pedido.current;
    setEstado('cargando');
    setError('');
    try {
      const data = await getSimilares(preguntaId);
      if (n !== pedido.current) return;
      setSimilares(leerSimilares(data));
      setEstado('listo');
    } catch (err) {
      if (n !== pedido.current) return;
      setSimilares([]);
      if (esRutaNoDisponible(err)) {
        setEstado('no_disponible');
        return;
      }
      setError(mensajeDeError(err, 'No se pudieron buscar las preguntas parecidas'));
      setEstado('error');
    }
  }, [preguntaId]);

  useEffect(() => {
    if (activo) cargar();
    else setEstado((actual) => (actual === 'no_disponible' ? actual : 'inactivo'));
    // Una respuesta que llegue después de desmontar o de cambiar de pregunta se descarta.
    return () => { pedido.current += 1; };
  }, [activo, cargar]);

  const reemplazar = useCallback((lista) => {
    pedido.current += 1;
    setSimilares(Array.isArray(lista) ? lista : []);
    setError('');
    setEstado('listo');
  }, []);

  return { estado, similares, error, recargar: cargar, reemplazar };
};

/**
 * Contenido de «Se parece a…» para una pregunta en revisión: cargando, error, vacío o la lista.
 * accion: lo que va bajo la lista (por ejemplo, «Rechazar por duplicada»).
 */
export const CuerpoParecidas = ({ parecidas, accion }) => {
  const { estado, similares, error, recargar } = parecidas;
  if (estado === 'cargando') {
    return <p className="cargando parecidas__cargando" role="status">Buscando preguntas parecidas...</p>;
  }
  if (estado === 'error') {
    return (
      <p className="nota texto-peligro">
        {error}{' '}
        <button type="button" className="boton-enlace" onClick={recargar}>Reintentar</button>
      </p>
    );
  }
  if (similares.length === 0) {
    return (
      <p className="nota">
        No se parece a ninguna aprobada o pendiente del mismo cargo o skill, tipo, categoría y nivel.
      </p>
    );
  }
  return (
    <>
      <ListaParecidas similares={similares} />
      {accion}
    </>
  );
};

/** Aviso corto de qué mide el parecido (va bajo las listas). */
export const NotaParecido = () => (
  <p className="nota nota--chica">
    Solo compara palabras compartidas: una pregunta dicha con otras palabras no aparece.
  </p>
);

/**
 * Confirmación de «Rechazar por duplicada»: rechaza con el motivo exacto «duplicada» (PATCH .../rechazar).
 * parecida (opcional) es la pregunta a la que se parece, para mostrarla al lado.
 */
const DialogoRechazarDuplicada = ({ dialogo, onConfirmar, onCerrar }) => {
  const { pregunta, parecida, enviando, error, aviso } = dialogo;

  useEffect(() => {
    const alPresionar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    // El fondo no cierra con el 2.º clic de un doble clic en el botón que lo abrió (FondoModal).
    <FondoModal onCerrar={onCerrar}>
      <div
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicada-titulo"
        aria-describedby="duplicada-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialogo__encabezado">
          <h2 id="duplicada-titulo" className="dialogo__titulo">Rechazar por duplicada</h2>
        </div>
        <div className="dialogo__cuerpo">
          <p id="duplicada-desc">
            Se rechaza con el motivo <strong>«{MOTIVO_DUPLICADA}»</strong> y deja de mostrarse a los usuarios. Si fue un
            error, se puede editar y vuelve a quedar pendiente.
          </p>
          <div className="parecidas-par">
            <span className="parecidas-par__etiqueta">Se rechaza</span>
            <blockquote className="parecidas-par__cita">{recortar(pregunta.enunciado, 220)}</blockquote>
            {parecida && (
              <>
                <span className="parecidas-par__etiqueta">
                  Se queda la que se parece{parecida.similitud !== null && parecida.similitud !== undefined
                    ? ` (${porcentajeSimilitud(parecida.similitud)})`
                    : ''}
                </span>
                <blockquote className="parecidas-par__cita">{recortar(parecida.enunciado, 220)}</blockquote>
              </>
            )}
          </div>
          {aviso && (
            <div className="aviso aviso--aviso">
              <Icono nombre="alerta" className="aviso__icono" />
              <div className="aviso__contenido">{aviso}</div>
            </div>
          )}
          {error && (
            <div className="aviso aviso--peligro" role="alert">
              <Icono nombre="alerta" className="aviso__icono" />
              <div className="aviso__contenido">{error}</div>
            </div>
          )}
        </div>
        <div className="dialogo__pie">
          <button type="button" className="boton" onClick={onCerrar} disabled={enviando} autoFocus>
            Cancelar
          </button>
          <button type="button" className="boton boton--peligro" onClick={onConfirmar} disabled={enviando}>
            {enviando ? 'Rechazando...' : 'Rechazar por duplicada'}
          </button>
        </div>
      </div>
    </FondoModal>
  );
};

/**
 * Estado y diálogo de «Rechazar por duplicada». abrir(pregunta, parecida?, aviso?) lo muestra; al confirmar llama a
 * alRechazar(pregunta, respuesta). elemento es el diálogo para pintar (o null). enviandoId: la que se está rechazando.
 */
export const useRechazoDuplicada = (alRechazar) => {
  const [dialogo, setDialogo] = useState(null); // {pregunta, parecida, aviso, enviando, error}
  const alRechazarRef = useRef(alRechazar);
  alRechazarRef.current = alRechazar;

  const abrir = useCallback((pregunta, parecida = null, aviso = '') => {
    if (!pregunta?.id) return;
    setDialogo({ pregunta, parecida, aviso, enviando: false, error: '' });
  }, []);

  const cerrar = useCallback(() => setDialogo((actual) => (actual?.enviando ? actual : null)), []);

  const confirmar = async () => {
    if (!dialogo || dialogo.enviando) return;
    const { pregunta } = dialogo;
    setDialogo((actual) => ({ ...actual, enviando: true, error: '' }));
    try {
      const data = await rejectQuestion(pregunta.id, MOTIVO_DUPLICADA);
      setDialogo(null);
      alRechazarRef.current?.(pregunta, data);
    } catch (err) {
      setDialogo((actual) => (actual
        ? { ...actual, enviando: false, error: mensajeDeError(err, 'No se pudo rechazar la pregunta') }
        : actual));
    }
  };

  const elemento = dialogo
    ? <DialogoRechazarDuplicada dialogo={dialogo} onConfirmar={confirmar} onCerrar={cerrar} />
    : null;

  return { abrir, elemento, enviandoId: dialogo?.enviando ? dialogo.pregunta.id : null };
};
