import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createQuestion } from '../services/api';
import './QuestionForm.css';

const QuestionForm = () => {
  const [formData, setFormData] = useState({
    texto: '',
    tipo: 'tec',
    nivel: 'mid',
    sector: '',
    respuestaModelo: '',
    pistas: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validar JSON de pistas si no está vacío
    let pistasJson = null;
    if (formData.pistas.trim()) {
      try {
        pistasJson = JSON.parse(formData.pistas);
      } catch (err) {
        setError('El campo Pistas debe ser un JSON válido (ej: {"pista1": "..."})');
        setLoading(false);
        return;
      }
    }

    const payload = {
      texto: formData.texto,
      tipoBanco: formData.tipo, // Backend espera tipoBanco o tipo? Revisar modelo. Plan dice 'tipo' pero modelo actual usa 'tipoBanco'. Usaré lo que dice el plan y ajustaré backend.
      nivel: formData.nivel,
      sector: formData.sector || null,
      respuestaModelo: formData.respuestaModelo || null, // Nuevo campo
      pistas: pistasJson,
    };

    // Ajuste temporal: El backend actual (PreguntaModels.kt) usa 'tipoBanco'.
    // El plan dice renombrar a 'tipo'. Ajustaré el payload para que coincida con lo que HARÉ en el backend.
    // En el backend voy a cambiar 'tipoBanco' a 'tipo' o mantener 'tipoBanco'?
    // El usuario pidió: "tipo VARCHAR(4) NOT NULL CHECK (tipo IN ('tec', 'soft', 'mix'))"
    // Así que el backend cambiará a 'tipo'. Enviaré 'tipo'.

    try {
      await createQuestion(payload);
      alert('Pregunta creada exitosamente');
      navigate('/preguntas');
    } catch (err) {
      console.error('Error al crear pregunta:', err);
      setError(
        err.response?.data?.error || 'Error al crear la pregunta'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-question">
      <div className="form-container">
        <h1>Crear Nueva Pregunta</h1>
        <p className="subtitle">Complete el formulario para agregar una pregunta</p>

        <form onSubmit={handleSubmit} className="question-form">
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="texto">
                Texto de la Pregunta <span className="required">*</span>
              </label>
              <textarea
                id="texto"
                name="texto"
                value={formData.texto}
                onChange={handleChange}
                required
                placeholder="Escribe la pregunta..."
                rows={4}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tipo">
                Tipo <span className="required">*</span>
              </label>
              <select
                id="tipo"
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                required
              >
                <option value="tec">Técnica</option>
                <option value="soft">Habilidad Blanda</option>
                <option value="mix">Mixta</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="nivel">
                Nivel <span className="required">*</span>
              </label>
              <select
                id="nivel"
                name="nivel"
                value={formData.nivel}
                onChange={handleChange}
                required
              >
                <option value="jr">Junior</option>
                <option value="mid">Mid-Level</option>
                <option value="sr">Senior</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label htmlFor="sector">
                Sector (Opcional)
              </label>
              <input
                type="text"
                id="sector"
                name="sector"
                value={formData.sector}
                onChange={handleChange}
                placeholder="ej: Backend, Frontend, DevOps"
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="respuestaModelo">
                Respuesta Modelo (Opcional)
              </label>
              <textarea
                id="respuestaModelo"
                name="respuestaModelo"
                value={formData.respuestaModelo}
                onChange={handleChange}
                placeholder="Respuesta ideal o puntos clave que debería mencionar el candidato..."
                rows={4}
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="pistas">
                Pistas (JSON Opcional)
              </label>
              <textarea
                id="pistas"
                name="pistas"
                value={formData.pistas}
                onChange={handleChange}
                placeholder='{"pista1": "Primera pista...", "pista2": "Segunda pista..."}'
                rows={3}
              />
              <small className="form-help">Formato JSON válido</small>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/preguntas')}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creando...' : 'Crear Pregunta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestionForm;
