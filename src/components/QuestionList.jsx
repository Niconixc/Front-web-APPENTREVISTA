import { useEffect, useState } from 'react';
import { getQuestions, deleteQuestion } from '../services/api';
import './QuestionList.css';

const QuestionList = () => {
  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const data = await getQuestions();
      // El backend devuelve un objeto paginado { items: [...], ... }
      // o un array directo si cambiara la API. Manejamos ambos casos.
      if (data.items && Array.isArray(data.items)) {
        setQuestions(data.items);
        setTotalQuestions(data.total || data.items.length);
      } else if (Array.isArray(data)) {
        setQuestions(data);
        setTotalQuestions(data.length);
      } else {
        console.error('Formato de respuesta inesperado:', data);
        setQuestions([]);
        setTotalQuestions(0);
      }
      setError('');
    } catch (err) {
      console.error('Error al cargar preguntas:', err);
      setError('Error al cargar la lista de preguntas');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (preguntaId, textoEspanol) => {
    const confirmText = textoEspanol.length > 50
      ? textoEspanol.substring(0, 50) + '...'
      : textoEspanol;

    if (!window.confirm(`¿Eliminar pregunta "${confirmText}"?`)) {
      return;
    }

    try {
      await deleteQuestion(preguntaId);
      setSuccessMessage('Pregunta eliminada exitosamente');
      fetchQuestions();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error al eliminar pregunta:', err);
      setError(err.response?.data?.error || 'Error al eliminar pregunta');
      setTimeout(() => setError(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="question-list">
        <div className="loading">Cargando preguntas...</div>
      </div>
    );
  }

  return (
    <div className="question-list">
      <div className="header">
        <h1>Gestión de Preguntas</h1>
        <p className="subtitle">Total: {totalQuestions} preguntas</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}

      <div className="table-container">
        <table className="questions-table">
          <thead>
            <tr>
              <th>Pregunta</th>
              <th>Categoría</th>
              <th>Dificultad</th>
              <th>Fecha Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => {
              // Mapeo de clases para badges
              const getCategoriaClass = (tipo) => {
                const map = {
                  'tec': 'tecnica',
                  'soft': 'comportamental',
                  'mix': 'situacional'
                };
                return map[tipo] || 'general';
              };

              const getNivelClass = (nivel) => {
                const map = {
                  'jr': 'facil',
                  'mid': 'media',
                  'sr': 'dificil'
                };
                return map[nivel] || 'media';
              };

              return (
                <tr key={question.id}>
                  <td className="question-text">
                    <div className="text-preview">
                      {question.texto}
                    </div>
                    {/* Se ocultan traducciones hasta que el backend las provea
                    <div className="translations">
                      <span className="lang-tag">🇬🇧 {question.textoIngles}</span>
                      <span className="lang-tag">🇧🇷 {question.textoPortugues}</span>
                    </div>
                    */}
                  </td>
                  <td>
                    <span className={`badge badge-${getCategoriaClass(question.tipoBanco)}`}>
                      {question.tipoBanco}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${getNivelClass(question.nivel)}`}>
                      {question.nivel}
                    </span>
                  </td>
                  <td>{new Date(question.fechaCreacion).toLocaleDateString()}</td>
                  <td>
                    <div className="actions">
                      <button
                        onClick={() =>
                          handleDeleteQuestion(question.id, question.texto)
                        }
                        className="btn btn-sm btn-danger"
                        title="Eliminar pregunta"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {questions.length === 0 && (
          <div className="empty-state">
            <p>No hay preguntas registradas</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionList;
