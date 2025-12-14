import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createQuestion } from '../services/api';
import './QuestionForm.css';

const QuestionForm = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    texto: '',
    tipoBanco: 'PR',           // PR, BL, NV
    nivel: 'jr',               // jr, mid, sr
    sector: '',                // Administracion, TI, Desarrollo, etc.
    cargo: '',                 // meta_cargo: Soporte TI, Desarrollador Backend, etc.
    tipoPregunta: 'opcion_multiple',  // opcion_multiple o abierta
    pistas: '',
    activa: true,
  });

  // Opciones para preguntas de opción múltiple
  const [opciones, setOpciones] = useState([
    { id: 'A', texto: '' },
    { id: 'B', texto: '' },
    { id: 'C', texto: '' },
  ]);
  const [respuestaCorrecta, setRespuestaCorrecta] = useState('');

  // Opciones de cargos según sector
  const cargosPorSector = {
    'Administracion': ['Jefe de Administración', 'Asistente Administrativo', 'Analista Contable', 'Encargado de Administración'],
    'Analista TI': ['Analista de Negocios', 'Analista de Datos', 'Analista QA', 'Analista Funcional'],
    'TI': ['Soporte TI', 'SysAdmin'],
    'Desarrollo': ['Desarrollador FullStack', 'Desarrollador Backend', 'Desarrollador Frontend', 'Desarrollador Android'],
    'Desarrollador': ['DevOps Engineer', 'QA Automation'],
    'General': ['General']
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Si cambia el sector, resetear el cargo
    if (name === 'sector') {
      setFormData((prev) => ({
        ...prev,
        sector: value,
        cargo: ''
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }));
    }
  };

  const handleOpcionChange = (id, texto) => {
    setOpciones(opciones.map(opc =>
      opc.id === id ? { ...opc, texto } : opc
    ));
  };

  const handleAddOpcion = () => {
    const nextId = String.fromCharCode(65 + opciones.length); // A, B, C, D, E...
    setOpciones([...opciones, { id: nextId, texto: '' }]);
  };

  const handleRemoveOpcion = (id) => {
    if (opciones.length <= 2) {
      alert('Debe haber al menos 2 opciones');
      return;
    }
    setOpciones(opciones.filter(opc => opc.id !== id));
    if (respuestaCorrecta === id) {
      setRespuestaCorrecta('');
    }
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
        // Validar que sea un objeto (Map), no un array
        if (Array.isArray(pistasJson)) {
          setError('El campo Pistas debe ser un objeto JSON (no un array). Ejemplo: {"pista1": "texto", "pista2": "texto"}');
          setLoading(false);
          return;
        }
        if (typeof pistasJson !== 'object' || pistasJson === null) {
          setError('El campo Pistas debe ser un objeto JSON válido');
          setLoading(false);
          return;
        }
      } catch (err) {
        setError('El campo Pistas debe ser un JSON válido');
        setLoading(false);
        return;
      }
    }

    // Validar opciones múltiples si aplica
    if (formData.tipoPregunta === 'opcion_multiple') {
      const opcionesValidas = opciones.filter(opc => opc.texto.trim());
      if (opcionesValidas.length < 2) {
        setError('Debe haber al menos 2 opciones con texto');
        setLoading(false);
        return;
      }
      if (!respuestaCorrecta) {
        setError('Debe seleccionar una respuesta correcta');
        setLoading(false);
        return;
      }
    }

    // Mapear valores de formulario a valores que el backend acepta
    const tipoBancoMap = { 'PR': 'tec', 'BL': 'soft', 'NV': 'mix' };

    const payload = {
      texto: formData.texto,
      tipoBanco: tipoBancoMap[formData.tipoBanco] || 'tec',
      nivel: formData.nivel,
      sector: formData.sector || 'General',
      metaCargo: formData.cargo,
      pistas: pistasJson,
      activa: formData.activa,
    }

    try {
      await createQuestion(payload);
      alert('Pregunta creada exitosamente');
      navigate('/preguntas');
    } catch (err) {
      console.error('Error al crear pregunta:', err);
      setError(err.response?.data?.error || err.response?.data || 'Error al crear la pregunta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-question">
      <div className="form-container">
        <h1>Crear Nueva Pregunta</h1>
        <p className="subtitle">Complete el formulario para agregar una pregunta al banco</p>

        <form onSubmit={handleSubmit} className="question-form">
          <div className="form-grid">
            {/* Texto de la pregunta */}
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
                placeholder="Escribe el enunciado de la pregunta..."
                rows={4}
              />
            </div>

            {/* Tipo de Banco */}
            <div className="form-group">
              <label htmlFor="tipoBanco">
                Tipo de Banco <span className="required">*</span>
              </label>
              <select
                id="tipoBanco"
                name="tipoBanco"
                value={formData.tipoBanco}
                onChange={handleChange}
                required
              >
                <option value="PR">Práctica (Técnica)</option>
                <option value="BL">Blandas (Soft Skills)</option>
                <option value="NV">Nivelación (Mixta)</option>
              </select>
            </div>

            {/* Nivel */}
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

            {/* Sector */}
            <div className="form-group">
              <label htmlFor="sector">
                Sector <span className="required">*</span>
              </label>
              <select
                id="sector"
                name="sector"
                value={formData.sector}
                onChange={handleChange}
                required
              >
                <option value="">Selecciona un sector</option>
                <option value="Administracion">Administración</option>
                <option value="Analista TI">Analista TI</option>
                <option value="TI">TI</option>
                <option value="Desarrollo">Desarrollo</option>
                <option value="Desarrollador">Desarrollador</option>
                <option value="General">General</option>
              </select>
            </div>

            {/* Cargo */}
            <div className="form-group">
              <label htmlFor="cargo">
                Cargo <span className="required">*</span>
              </label>
              <select
                id="cargo"
                name="cargo"
                value={formData.cargo}
                onChange={handleChange}
                required
                disabled={!formData.sector}
              >
                <option value="">
                  {formData.sector ? 'Selecciona un cargo' : 'Primero selecciona un sector'}
                </option>
                {formData.sector && cargosPorSector[formData.sector]?.map((cargo) => (
                  <option key={cargo} value={cargo}>
                    {cargo}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Pregunta */}
            <div className="form-group">
              <label htmlFor="tipoPregunta">
                Tipo de Pregunta <span className="required">*</span>
              </label>
              <select
                id="tipoPregunta"
                name="tipoPregunta"
                value={formData.tipoPregunta}
                onChange={handleChange}
                required
              >
                <option value="opcion_multiple">Opción Múltiple</option>
                <option value="abierta">Abierta</option>
              </select>
            </div>

            {/* Opciones Múltiples (solo si es opcion_multiple) */}
            {formData.tipoPregunta === 'opcion_multiple' && (
              <div className="form-group full-width">
                <label>
                  Opciones de Respuesta <span className="required">*</span>
                </label>
                <div className="opciones-container">
                  {opciones.map((opcion) => (
                    <div key={opcion.id} className="opcion-row">
                      <span className="opcion-label">{opcion.id}.</span>
                      <input
                        type="text"
                        className="opcion-input"
                        value={opcion.texto}
                        onChange={(e) => handleOpcionChange(opcion.id, e.target.value)}
                        placeholder={`Opción ${opcion.id}`}
                        required
                      />
                      <label className="opcion-correcta">
                        <input
                          type="radio"
                          name="respuesta_correcta"
                          value={opcion.id}
                          checked={respuestaCorrecta === opcion.id}
                          onChange={(e) => setRespuestaCorrecta(e.target.value)}
                        />
                        Correcta
                      </label>
                      {opciones.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOpcion(opcion.id)}
                          className="btn-remove-opcion"
                          title="Eliminar opción"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddOpcion}
                    className="btn-add-opcion"
                  >
                    + Agregar Opción
                  </button>
                </div>
              </div>
            )}

            {/* Pistas */}
            <div className="form-group full-width">
              <label htmlFor="pistas">
                Pistas / Hints (JSON Opcional)
              </label>
              <textarea
                id="pistas"
                name="pistas"
                value={formData.pistas}
                onChange={handleChange}
                placeholder='{"pista1": "Revisa la documentación", "pista2": "Piensa en el patrón", "pista3": "Considera el constructor"}'
                rows={3}
              />
              <small className="form-help">Objeto JSON con claves y valores string (ejemplo: {`{"pista1": "texto", "pista2": "texto"}`})</small>
            </div>

            {/* Activa */}
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
