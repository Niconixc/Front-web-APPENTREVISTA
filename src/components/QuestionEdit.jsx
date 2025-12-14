import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getQuestion, updateQuestion } from '../services/api';
import './QuestionForm.css';

const QuestionEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    texto: '',
    tipo: 'tec',
    nivel: 'mid',
    sector: '',
    respuestaModelo: '',
    pistas: '',
    activa: true,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadQuestion();
  }, [id]);

  const loadQuestion = async () => {
    try {
      setLoading(true);
      const question = await getQuestion(id);

      setFormData({
        texto: question.texto || '',
        tipo: question.tipoBanco || 'tec',
        nivel: question.nivel || 'mid',
        sector: question.sector || '',
        respuestaModelo: question.respuestaModelo || '',
        pistas: question.pistas ? JSON.stringify(question.pistas, null, 2) : '',
        activa: question.activa !== false,
      });
      setError('');
    } catch (err) {
      console.error('Error al cargar pregunta:', err);
      setError('Error al cargar la pregunta');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    let pistasJson = null;
    if (formData.pistas.trim()) {
      try {
        pistasJson = JSON.parse(formData.pistas);
      } catch (err) {
        setError('El campo Pistas debe ser un JSON válido (ej: {"pista1": "..."})');
        setSubmitting(false);
        return;
      }
    }

    const payload = {
      texto: formData.texto,
      sector: formData.sector || null,
      activa: formData.activa,
      pistas: pistasJson,
    };

    try {
      await updateQuestion(id, payload);
      alert('Pregunta actualizada exitosamente');
      navigate('/preguntas');
    } catch (err) {
      console.error('Error al actualizar pregunta:', err);
      setError(
        err.response?.data?.error || 'Error al actualizar la pregunta'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="create-question">
        <div className="loading">Cargando pregunta...</div>
      </div>
    );
  }

  return (
    <div className="create-question">
      <div className="form-container">
        <h1>Editar Pregunta</h1>
        <p className="subtitle">Modifica los campos que desees actualizar</p>

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
                Tipo <span className="info-text">(No editable)</span>
              </label>
              <select
                id="tipo"
                name="tipo"
                value={formData.tipo}
                disabled
                className="disabled-field"
              >
                <option value="tec">Técnica</option>
                <option value="soft">Habilidad Blanda</option>
                <option value="mix">Mixta</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="nivel">
                Nivel <span className="info-text">(No editable)</span>
              </label>
              <select
                id="nivel"
                name="nivel"
                value={formData.nivel}
                disabled
                className="disabled-field"
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

            <div className="form-group full-width">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="activa"
                  checked={formData.activa}
                  onChange={handleChange}
                />
                <span>Pregunta Activa</span>
              </label>
              <small className="form-help">
                Las preguntas inactivas no aparecen en las entrevistas
              </small>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/preguntas')}
              className="btn btn-secondary"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Actualizando...' : 'Actualizar Pregunta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestionEdit;
