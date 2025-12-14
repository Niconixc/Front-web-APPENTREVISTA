import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getQuestions, deleteQuestion } from '../services/api';
import './QuestionList.css';

const QuestionList = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [filters, setFilters] = useState({
    search: '',
    tipo: '',
    nivel: '',
    sector: '',
    activa: '',
  });

  const [pagination, setPagination] = useState({
    page: 1,
    size: 20,
  });

  useEffect(() => {
    fetchQuestions();
  }, [filters, pagination]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (filters.search) params.append('q', filters.search);
      if (filters.tipo) params.append('tipoBanco', filters.tipo);
      if (filters.nivel) params.append('nivel', filters.nivel);
      if (filters.sector) params.append('sector', filters.sector);
      if (filters.activa) params.append('activa', filters.activa);
      params.append('page', pagination.page);
      params.append('size', pagination.size);

      const data = await getQuestions(params.toString());

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

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setFilters(prev => ({ ...prev, search: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      tipo: '',
      nivel: '',
      sector: '',
      activa: '',
    });
    setPagination({ page: 1, size: 20 });
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

  const totalPages = Math.ceil(totalQuestions / pagination.size);

  return (
    <div className="question-list">
      <div className="header">
        <div className="header-content">
          <div>
            <h1>Gestión de Preguntas</h1>
            <p className="subtitle">Total: {totalQuestions} preguntas</p>
          </div>
          <button
            onClick={() => navigate('/crear-pregunta')}
            className="btn btn-primary"
          >
            Nueva Pregunta
          </button>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleSearchChange}
            placeholder="Buscar por texto..."
            className="search-input"
          />
        </div>

        <div className="filters-row">
          <select
            name="tipo"
            value={filters.tipo}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">Todos los tipos</option>
            <option value="tec">Técnica</option>
            <option value="soft">Habilidad Blanda</option>
            <option value="mix">Mixta</option>
          </select>

          <select
            name="nivel"
            value={filters.nivel}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">Todos los niveles</option>
            <option value="jr">Junior</option>
            <option value="mid">Mid-Level</option>
            <option value="sr">Senior</option>
          </select>

          <select
            name="sector"
            value={filters.sector}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">Todos los sectores</option>
            <option value="TI">TI</option>
            <option value="Analista TI">Analista TI</option>
            <option value="Analisis TI">Analisis TI</option>
            <option value="Desarrollo">Desarrollo</option>
            <option value="Desarrollador">Desarrollador</option>
            <option value="Administracion">Administracion</option>
            <option value="General">General</option>
          </select>

          <select
            name="activa"
            value={filters.activa}
            onChange={handleFilterChange}
            className="filter-select"
          >
            <option value="">Todas</option>
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
          </select>

          {(filters.search || filters.tipo || filters.nivel || filters.sector || filters.activa) && (
            <button onClick={clearFilters} className="btn btn-secondary">
              Limpiar Filtros
            </button>
          )}
        </div>
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

              const getTipoLabel = (tipo) => {
                const map = {
                  'tec': 'Técnica',
                  'soft': 'Habilidad Blanda',
                  'mix': 'Mixta'
                };
                return map[tipo] || tipo;
              };

              const getNivelClass = (nivel) => {
                const map = {
                  'jr': 'facil',
                  'mid': 'media',
                  'sr': 'dificil'
                };
                return map[nivel] || 'media';
              };

              const getNivelLabel = (nivel) => {
                const map = {
                  'jr': 'Junior',
                  'mid': 'Mid-Level',
                  'sr': 'Senior'
                };
                return map[nivel] || nivel;
              };

              return (
                <tr key={question.id}>
                  <td className="question-text">
                    <div className="text-preview">
                      {question.texto}
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${getCategoriaClass(question.tipoBanco)}`}>
                      {getTipoLabel(question.tipoBanco)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${getNivelClass(question.nivel)}`}>
                      {getNivelLabel(question.nivel)}
                    </span>
                  </td>
                  <td>{new Date(question.fechaCreacion).toLocaleDateString()}</td>
                  <td>
                    <div className="actions">
                      <button
                        onClick={() => navigate(`/editar-pregunta/${question.id}`)}
                        className="btn btn-sm btn-secondary"
                        title="Editar pregunta"
                      >
                        ✏️
                      </button>
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

        {questions.length === 0 && !loading && (
          <div className="empty-state">
            <p>
              {filters.search || filters.tipo || filters.nivel || filters.sector || filters.activa
                ? 'No se encontraron preguntas con los filtros aplicados'
                : 'No hay preguntas registradas'}
            </p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
            className="btn btn-secondary"
          >
            Anterior
          </button>

          <span className="pagination-info">
            Página {pagination.page} de {totalPages}
          </span>

          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page >= totalPages}
            className="btn btn-secondary"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestionList;
