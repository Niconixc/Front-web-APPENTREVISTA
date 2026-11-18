import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  approveQuestion,
  codigoDeError,
  getQuestion,
  mensajeDeError,
  rejectQuestion,
  updateQuestion,
} from '../services/api';
import {
  ESTADOS_PREGUNTA,
  LIMITES,
  aSolicitudPregunta,
  desdeRespuestaPregunta,
  etiqueta,
  formatearFecha,
  validarFormularioPregunta,
} from '../services/etiquetas';
import FondoModal from './FondoModal';
import Icono from './Icono';
import QuestionFields from './QuestionFields';
import './QuestionForm.css';

/** Variante de insignia según el estado de la pregunta (el texto lo da ESTADOS_PREGUNTA). */
const CLASE_ESTADO = {
  pendiente: 'insignia--aviso',
  aprobada: 'insignia--exito',
  rechazada: 'insignia--peligro',
};

const QuestionEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pregunta, setPregunta] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null); // {mensaje, noExiste}
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [accion, setAccion] = useState(null); // 'guardar' | 'aprobar' | 'rechazar'

  const [modalRechazo, setModalRechazo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errorRechazo, setErrorRechazo] = useState('');

  const cargarPregunta = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    setError('');
    setExito('');
    try {
      const data = await getQuestion(id);
      setPregunta(data);
      setForm(desdeRespuestaPregunta(data));
    } catch (err) {
      console.error('Error al cargar pregunta:', err);
      const noExiste = err?.response?.status === 404 || codigoDeError(err) === 'pregunta_no_encontrada'
        || codigoDeError(err) === 'id_invalido';
      setErrorCarga({
        noExiste,
        mensaje: noExiste ? 'La pregunta no existe' : mensajeDeError(err, 'Error al cargar la pregunta'),
      });
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargarPregunta();
  }, [cargarPregunta]);

  /** Refresca la cabecera y el formulario con la pregunta que devolvió V2. */
  const aplicarRespuesta = (data) => {
    if (!data || typeof data !== 'object' || !data.id) return;
    setPregunta(data);
    setForm(desdeRespuestaPregunta(data));
  };

  const guardar = async (aprobar) => {
    if (accion) return;
    setError('');
    setExito('');

    const problema = validarFormularioPregunta(form);
    if (problema) {
      setError(problema);
      return;
    }

    setAccion(aprobar ? 'aprobar' : 'guardar');
    let guardada = null;
    try {
      guardada = await updateQuestion(id, aSolicitudPregunta(form));
      aplicarRespuesta(guardada);
    } catch (err) {
      console.error('Error al actualizar pregunta:', err);
      setError(mensajeDeError(err, 'Error al guardar la pregunta'));
      setAccion(null);
      return;
    }

    if (!aprobar) {
      setExito(guardada?.mensaje || 'Pregunta actualizada; queda pendiente de aprobación');
      setAccion(null);
      return;
    }

    try {
      const aprobada = await approveQuestion(id);
      aplicarRespuesta(aprobada);
      setExito(aprobada?.mensaje ? `Cambios guardados. ${aprobada.mensaje}` : 'Cambios guardados. Pregunta aprobada');
    } catch (err) {
      console.error('Error al aprobar pregunta:', err);
      setError(
        `La pregunta se guardó, pero no se pudo aprobar: ${mensajeDeError(err, 'error desconocido')}. Quedó pendiente.`
      );
    } finally {
      setAccion(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    guardar(false);
  };

  const abrirRechazo = () => {
    setMotivo('');
    setErrorRechazo('');
    setModalRechazo(true);
  };

  const cerrarRechazo = () => {
    if (accion === 'rechazar') return;
    setModalRechazo(false);
  };

  const confirmarRechazo = async () => {
    const texto = motivo.trim();
    if (!texto) {
      setErrorRechazo('Escribe el motivo del rechazo');
      return;
    }
    if (texto.length > LIMITES.motivoRechazo) {
      setErrorRechazo(`El motivo no puede superar ${LIMITES.motivoRechazo} caracteres`);
      return;
    }
    setAccion('rechazar');
    setErrorRechazo('');
    try {
      const data = await rejectQuestion(id, texto);
      // Solo se actualiza la cabecera: los cambios del formulario que no se guardaron se mantienen.
      if (data?.id) setPregunta(data);
      setModalRechazo(false);
      setError('');
      setExito(data?.mensaje || 'Pregunta rechazada');
    } catch (err) {
      console.error('Error al rechazar pregunta:', err);
      setErrorRechazo(mensajeDeError(err, 'Error al rechazar la pregunta'));
    } finally {
      setAccion(null);
    }
  };

  useEffect(() => {
    if (!modalRechazo) return undefined;
    const alPresionar = (e) => { if (e.key === 'Escape') cerrarRechazo(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  });

  const miga = (
    <nav className="miga" aria-label="Ruta de navegación">
      <Link to="/preguntas">Preguntas</Link> / <span aria-current="page">Editar pregunta</span>
    </nav>
  );

  // ---------- Estados de carga ----------

  if (cargando) {
    return (
      <div className="pagina pagina--angosta">
        <div className="cargando cargando--bloque">Cargando pregunta...</div>
      </div>
    );
  }

  if (errorCarga || !pregunta || !form) {
    return (
      <div className="pagina pagina--angosta">
        {miga}
        <div className="tarjeta">
          <div className="vacio">
            <Icono nombre="alerta" tamano={24} />
            <h1 className="vacio__titulo">
              {errorCarga?.noExiste ? 'La pregunta no existe' : 'No se pudo cargar la pregunta'}
            </h1>
            {!errorCarga?.noExiste && (
              <div className="aviso aviso--peligro">
                <div className="aviso__contenido">{errorCarga?.mensaje || 'Error al cargar la pregunta'}</div>
              </div>
            )}
            {errorCarga?.noExiste && <p>Puede que se haya eliminado o que el enlace no sea correcto.</p>}
            <div className="grupo-botones qform-vacio-acciones">
              {!errorCarga?.noExiste && (
                <button type="button" className="boton" onClick={cargarPregunta}>
                  Reintentar
                </button>
              )}
              <button type="button" className="boton boton--primario" onClick={() => navigate('/preguntas')}>
                Volver al listado
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const ocupado = Boolean(accion);
  const reemplazaOpciones = pregunta.vecesUsada > 0 && form.tipo === 'opcion_multiple';

  return (
    <div className="pagina pagina--angosta">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          {miga}
          <h1 className="encabezado-pagina__titulo">Editar pregunta</h1>
          <p className="encabezado-pagina__descripcion">
            Puedes cambiar todos los campos, incluidos tipo, categoría y nivel.
          </p>
          {/* Cabecera informativa (solo lectura) */}
          <div className="qform-meta">
            <span className={`insignia insignia--punto ${CLASE_ESTADO[pregunta.estado] || ''}`.trim()}>
              {etiqueta(ESTADOS_PREGUNTA, pregunta.estado)}
            </span>
            {pregunta.generadaPorIa && <span className="insignia insignia--info">Generada con IA</span>}
            <span className="num">
              {pregunta.vecesUsada === 1 ? 'Usada 1 vez' : `Usada ${pregunta.vecesUsada ?? 0} veces`}
            </span>
            <span className="num">Creada el {formatearFecha(pregunta.fechaCreacion)}</span>
          </div>
        </div>
        {pregunta.estado !== 'rechazada' && (
          <div className="encabezado-pagina__acciones">
            <button type="button" onClick={abrirRechazo} className="boton boton--peligro-suave" disabled={ocupado}>
              Rechazar
            </button>
          </div>
        )}
      </header>

      {pregunta.estado === 'rechazada' && (
        <div className="aviso aviso--peligro">
          <Icono nombre="x-circulo" className="aviso__icono" />
          <div className="aviso__contenido">
            <span className="aviso__titulo">Motivo del rechazo</span>
            <span>{pregunta.motivoRechazo || 'Sin motivo registrado'}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="tarjeta" noValidate>
        <div className="tarjeta__cuerpo">
          <fieldset className="qform-bloqueo" disabled={ocupado}>
            <QuestionFields form={form} setForm={setForm} />
          </fieldset>

          <div className="aviso aviso--aviso">
            <Icono nombre="info" className="aviso__icono" />
            <div className="aviso__contenido">
              <p>
                Al guardar, la pregunta vuelve a <strong>Pendiente</strong> y deja de mostrarse a los usuarios hasta
                que se apruebe.
              </p>
            </div>
          </div>
          {reemplazaOpciones && (
            <div className="aviso aviso--aviso">
              <Icono nombre="alerta" className="aviso__icono" />
              <div className="aviso__contenido">
                Esta pregunta ya se usó en entrevistas: editar reemplaza las opciones (cambian sus IDs).
              </div>
            </div>
          )}

          {error && (
            <div className="aviso aviso--peligro" role="alert">
              <Icono nombre="alerta" className="aviso__icono" />
              <div className="aviso__contenido">{error}</div>
            </div>
          )}
          {exito && (
            <div className="aviso aviso--exito" role="status">
              <Icono nombre="check-circulo" className="aviso__icono" />
              <div className="aviso__contenido">{exito}</div>
            </div>
          )}
        </div>

        <div className="tarjeta__pie qform-pie">
          <button
            type="button"
            onClick={() => navigate('/preguntas')}
            className="boton boton--sutil qform-pie__volver"
            disabled={ocupado}
          >
            Volver al listado
          </button>
          <button type="submit" className="boton" disabled={ocupado}>
            {accion === 'guardar' ? 'Guardando...' : 'Guardar (queda pendiente)'}
          </button>
          <button type="button" onClick={() => guardar(true)} className="boton boton--primario" disabled={ocupado}>
            {accion === 'aprobar' ? 'Guardando y aprobando...' : 'Guardar y aprobar'}
          </button>
        </div>
      </form>

      {modalRechazo && (
        // El fondo no cierra con el 2.º clic de un doble clic en «Rechazar» ni al arrastrar desde el motivo (FondoModal).
        <FondoModal onCerrar={cerrarRechazo}>
          <div
            className="dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qf-modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialogo__encabezado">
              <h2 id="qf-modal-titulo" className="dialogo__titulo">Rechazar pregunta</h2>
            </div>
            <div className="dialogo__cuerpo">
              <p className="nota">
                La pregunta dejará de mostrarse a los usuarios. Los cambios del formulario que no hayas guardado no se
                envían al rechazar.
              </p>
              <div className="campo">
                <label htmlFor="motivoRechazo" className="campo__etiqueta">
                  Motivo <span className="qform-obligatorio">*</span>
                </label>
                <textarea
                  id="motivoRechazo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={LIMITES.motivoRechazo}
                  rows={4}
                  placeholder="Explica por qué se rechaza..."
                  autoFocus
                  disabled={accion === 'rechazar'}
                />
                <small className="campo__contador">{motivo.length}/{LIMITES.motivoRechazo}</small>
              </div>
              {errorRechazo && (
                <div className="aviso aviso--peligro" role="alert">
                  <Icono nombre="alerta" className="aviso__icono" />
                  <div className="aviso__contenido">{errorRechazo}</div>
                </div>
              )}
            </div>
            <div className="dialogo__pie">
              <button type="button" className="boton" onClick={cerrarRechazo} disabled={accion === 'rechazar'}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--peligro"
                onClick={confirmarRechazo}
                disabled={accion === 'rechazar' || !motivo.trim()}
              >
                {accion === 'rechazar' ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </FondoModal>
      )}
    </div>
  );
};

export default QuestionEdit;
