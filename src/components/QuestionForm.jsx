import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createQuestion, mensajeDeError } from '../services/api';
import { aSolicitudPregunta, formularioVacio, validarFormularioPregunta } from '../services/etiquetas';
import QuestionFields from './QuestionFields';
import './QuestionForm.css';

/** Tiempo que se muestra el mensaje de éxito antes de volver al listado. */
const ESPERA_ANTES_DE_VOLVER_MS = 1500;

const QuestionForm = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(formularioVacio);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [loading, setLoading] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || exito) return;
    setError('');

    const problema = validarFormularioPregunta(form);
    if (problema) {
      setError(problema);
      return;
    }

    setLoading(true);
    try {
      const data = await createQuestion(aSolicitudPregunta(form));
      const mensaje = data?.mensaje || 'Pregunta creada y aprobada';
      setExito(mensaje);
      // El listado puede leer location.state.mensaje para repetir el aviso.
      temporizador.current = setTimeout(() => navigate('/preguntas', { state: { mensaje } }), ESPERA_ANTES_DE_VOLVER_MS);
    } catch (err) {
      console.error('Error al crear pregunta:', err);
      setError(mensajeDeError(err, 'Error al crear la pregunta'));
    } finally {
      setLoading(false);
    }
  };

  const bloqueado = loading || Boolean(exito);

  return (
    <div className="create-question">
      <div className="form-container">
        <h1>Crear Nueva Pregunta</h1>
        <p className="subtitle">Complete el formulario para agregar una pregunta al banco</p>

        <div className="qf-aviso qf-aviso-info">
          Las preguntas creadas por un administrador quedan aprobadas y disponibles de inmediato.
        </div>

        <form onSubmit={handleSubmit} className="question-form" noValidate>
          <fieldset className="qf-fieldset" disabled={bloqueado}>
            <QuestionFields form={form} setForm={setForm} />
          </fieldset>

          {error && <div className="error-message" role="alert">{error}</div>}
          {exito && <div className="qf-exito" role="status">{exito}. Volviendo al listado...</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/preguntas')}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={bloqueado}>
              {loading ? 'Creando...' : 'Crear Pregunta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestionForm;
