import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import QuestionFields from './QuestionFields';
import './QuestionForm.css';

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

  // ---------- Estados de carga ----------

  if (cargando) {
    return (
      <div className="create-question">
        <div className="loading">Cargando pregunta...</div>
      </div>
    );
  }

  if (errorCarga || !pregunta || !form) {
    return (
      <div className="create-question">
        <div className="form-container qf-estado-vacio">
          <h1>{errorCarga?.noExiste ? 'La pregunta no existe' : 'No se pudo cargar la pregunta'}</h1>
          {!errorCarga?.noExiste && <div className="error-message">{errorCarga?.mensaje || 'Error al cargar la pregunta'}</div>}
          {errorCarga?.noExiste && (
            <p className="subtitle">Puede que se haya eliminado o que el enlace no sea correcto.</p>
          )}
          <div className="form-actions">
            {!errorCarga?.noExiste && (
              <button type="button" className="btn btn-secondary" onClick={cargarPregunta}>
                Reintentar
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => navigate('/preguntas')}>
              Volver al listado
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ocupado = Boolean(accion);
  const reemplazaOpciones = pregunta.vecesUsada > 0 && form.tipo === 'opcion_multiple';

  return (
    <div className="create-question">
      <div className="form-container">
        <h1>Editar Pregunta</h1>
        <p className="subtitle">Puedes cambiar todos los campos, incluidos tipo, categoría y nivel</p>

        {/* Cabecera informativa (solo lectura) */}
        <div className="qf-cabecera">
          <span className={`qf-badge qf-estado-${pregunta.estado}`}>{etiqueta(ESTADOS_PREGUNTA, pregunta.estado)}</span>
          {pregunta.generadaPorIa && <span className="qf-badge qf-badge-ia">Generada con IA</span>}
          <span className="qf-dato">
            {pregunta.vecesUsada === 1 ? 'Usada 1 vez' : `Usada ${pregunta.vecesUsada ?? 0} veces`}
          </span>
          <span className="qf-dato">Creada el {formatearFecha(pregunta.fechaCreacion)}</span>
        </div>
        {pregunta.estado === 'rechazada' && (
          <div className="qf-aviso qf-aviso-rechazo">
            <strong>Motivo del rechazo:</strong> {pregunta.motivoRechazo || 'Sin motivo registrado'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="question-form" noValidate>
          <fieldset className="qf-fieldset" disabled={ocupado}>
            <QuestionFields form={form} setForm={setForm} />
          </fieldset>

          <div className="qf-aviso qf-aviso-alerta">
            Al guardar, la pregunta vuelve a <strong>Pendiente</strong> y deja de mostrarse a los usuarios hasta que se
            apruebe.
          </div>
          {reemplazaOpciones && (
            <div className="qf-aviso qf-aviso-alerta">
              Esta pregunta ya se usó en entrevistas: editar reemplaza las opciones (cambian sus IDs).
            </div>
          )}

          {error && <div className="error-message" role="alert">{error}</div>}
          {exito && <div className="qf-exito" role="status">{exito}</div>}

          <div className="form-actions qf-acciones">
            <button type="button" onClick={() => navigate('/preguntas')} className="btn btn-secondary" disabled={ocupado}>
              Volver al listado
            </button>
            {pregunta.estado !== 'rechazada' && (
              <button type="button" onClick={abrirRechazo} className="btn qf-btn-peligro" disabled={ocupado}>
                Rechazar
              </button>
            )}
            <button type="submit" className="btn btn-secondary" disabled={ocupado}>
              {accion === 'guardar' ? 'Guardando...' : 'Guardar (queda pendiente)'}
            </button>
            <button type="button" onClick={() => guardar(true)} className="btn btn-primary" disabled={ocupado}>
              {accion === 'aprobar' ? 'Guardando y aprobando...' : 'Guardar y aprobar'}
            </button>
          </div>
        </form>
      </div>

      {modalRechazo && (
        <div className="qf-modal-fondo" onClick={cerrarRechazo}>
          <div
            className="qf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qf-modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="qf-modal-titulo">Rechazar pregunta</h2>
            <p className="qf-modal-texto">
              La pregunta dejará de mostrarse a los usuarios. Los cambios del formulario que no hayas guardado no se
              envían al rechazar.
            </p>
            <div className="form-group">
              <label htmlFor="motivoRechazo">
                Motivo <span className="required">*</span>
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
              <small className="form-help qf-contador">{motivo.length}/{LIMITES.motivoRechazo}</small>
            </div>
            {errorRechazo && <div className="error-message" role="alert">{errorRechazo}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={cerrarRechazo} disabled={accion === 'rechazar'}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn qf-btn-peligro"
                onClick={confirmarRechazo}
                disabled={accion === 'rechazar' || !motivo.trim()}
              >
                {accion === 'rechazar' ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionEdit;
