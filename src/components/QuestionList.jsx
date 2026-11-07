import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getQuestions,
  getCargos,
  approveQuestion,
  rejectQuestion,
  deleteQuestion,
  mensajeDeError,
  codigoDeError,
} from '../services/api';
import {
  NIVELES,
  CATEGORIAS,
  TIPOS,
  ESTADOS_PREGUNTA,
  LIMITES,
  etiqueta,
  formatearFecha,
} from '../services/etiquetas';
import './QuestionList.css';

// Filtros que viajan a V2 (y viven en la URL: /preguntas?estado=pendiente&generadaPorIa=true).
const CLAVES_FILTRO = ['estado', 'categoria', 'tipo', 'nivel', 'cargoId', 'generadaPorIa'];
const TAMANOS_PAGINA = [10, 20, 50, 100];
const TAMANO_POR_DEFECTO = 20;
const LETRAS = 'ABCDEFGHIJ';

// Solo se aceptan desde la URL valores que V2 conoce: uno inventado daría 400 y dejaría la página vacía.
const valoresDe = (lista) => lista.map((o) => o.value);
const VALORES_VALIDOS = {
  estado: valoresDe(ESTADOS_PREGUNTA),
  categoria: valoresDe(CATEGORIAS),
  tipo: valoresDe(TIPOS),
  nivel: valoresDe(NIVELES),
  generadaPorIa: ['true', 'false'],
};

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const leerFiltros = (params) => {
  const filtros = {};
  CLAVES_FILTRO.forEach((clave) => {
    const valor = (params.get(clave) || '').trim();
    const validos = VALORES_VALIDOS[clave];
    const uuidInvalido = clave === 'cargoId' && valor && !FORMATO_UUID.test(valor);
    filtros[clave] = !valor || uuidInvalido || (validos && !validos.includes(valor)) ? '' : valor;
  });
  const pagina = Number.parseInt(params.get('pagina'), 10);
  const tamano = Number.parseInt(params.get('tamano'), 10);
  filtros.pagina = pagina >= 1 ? pagina : 1;
  filtros.tamano = TAMANOS_PAGINA.includes(tamano) ? Math.min(tamano, LIMITES.tamanoPaginaMaximo) : TAMANO_POR_DEFECTO;
  filtros.buscar = params.get('buscar') || '';
  return filtros;
};

const recortar = (texto, largo) => (texto.length > largo ? `${texto.substring(0, largo)}...` : texto);

const nivelClase = (nivel) => (VALORES_VALIDOS.nivel.includes(nivel) ? `nivel-${nivel}` : 'badge-general');
const categoriaClase = (categoria) => (VALORES_VALIDOS.categoria.includes(categoria) ? `badge-${categoria}` : 'badge-general');
const estadoClase = (estado) => (VALORES_VALIDOS.estado.includes(estado) ? `badge-estado-${estado}` : 'badge-general');

/** Contenido de la rúbrica para la vista previa: lo conocido se muestra ordenado; el resto, como JSON. */
const Rubrica = ({ rubrica }) => {
  if (!rubrica || typeof rubrica !== 'object' || Object.keys(rubrica).length === 0) {
    return <p className="detalle-vacio">Sin rúbrica</p>;
  }
  const { metodo, criterios, palabras_clave: palabras, tiempo_esperado_seg: tiempo, ...resto } = rubrica;
  const conocida = Array.isArray(criterios) || Array.isArray(palabras) || tiempo != null || metodo != null;
  if (!conocida) return <pre className="detalle-json">{JSON.stringify(rubrica, null, 2)}</pre>;
  return (
    <div className="detalle-rubrica">
      {metodo != null && <p><strong>Método:</strong> {String(metodo)}</p>}
      {Array.isArray(criterios) && criterios.length > 0 && (
        <div>
          <strong>Criterios:</strong>
          <ul>
            {criterios.map((c, i) => <li key={i}>{typeof c === 'string' ? c : JSON.stringify(c)}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(palabras) && palabras.length > 0 && (
        <p><strong>Palabras clave:</strong> {palabras.map(String).join(', ')}</p>
      )}
      {tiempo != null && <p><strong>Tiempo esperado:</strong> {String(tiempo)} s</p>}
      {Object.keys(resto).length > 0 && (
        <>
          <strong>Otros datos:</strong>
          <pre className="detalle-json">{JSON.stringify(resto, null, 2)}</pre>
        </>
      )}
    </div>
  );
};

const QuestionList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filtros = useMemo(() => leerFiltros(searchParams), [searchParams]);

  const [questions, setQuestions] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  // Pregunta que no se pudo eliminar porque ya se usó: se ofrece rechazarla.
  const [preguntaEnUso, setPreguntaEnUso] = useState(null);

  const [cargos, setCargos] = useState([]);
  const [errorCargos, setErrorCargos] = useState('');

  const [expandidas, setExpandidas] = useState(() => new Set());
  const [ocupadas, setOcupadas] = useState({});
  const [seleccionadas, setSeleccionadas] = useState(() => new Set());
  const [masivo, setMasivo] = useState(null); // {hechas, total, errores: [{enunciado, mensaje}], corriendo}

  const [rechazo, setRechazo] = useState(null); // {pregunta, motivo, enviando, error}

  const ultimaPeticion = useRef(0);

  // ---------- Carga ----------

  const { estado, categoria, tipo, nivel, cargoId, generadaPorIa, pagina, tamano } = filtros;

  const fetchQuestions = useCallback(async () => {
    const peticion = ++ultimaPeticion.current;
    setLoading(true);
    try {
      const data = await getQuestions({ estado, categoria, tipo, nivel, cargoId, generadaPorIa, pagina, tamano });
      if (peticion !== ultimaPeticion.current) return;
      setQuestions(Array.isArray(data?.elementos) ? data.elementos : []);
      setTotalQuestions(Number(data?.total) || 0);
      setError('');
    } catch (err) {
      if (peticion !== ultimaPeticion.current) return;
      setQuestions([]);
      setTotalQuestions(0);
      setError(mensajeDeError(err, 'Error al cargar la lista de preguntas'));
    } finally {
      if (peticion === ultimaPeticion.current) setLoading(false);
    }
  }, [estado, categoria, tipo, nivel, cargoId, generadaPorIa, pagina, tamano]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Al cambiar de página o de filtros se limpian la selección y las filas abiertas.
  useEffect(() => {
    setSeleccionadas(new Set());
    setExpandidas(new Set());
  }, [estado, categoria, tipo, nivel, cargoId, generadaPorIa, pagina, tamano]);

  useEffect(() => {
    let vigente = true;
    getCargos()
      .then((lista) => { if (vigente) setCargos(Array.isArray(lista) ? lista : []); })
      .catch((err) => { if (vigente) setErrorCargos(mensajeDeError(err, 'No se pudo cargar el catálogo de cargos')); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const t = setTimeout(() => setSuccessMessage(''), 4000);
    return () => clearTimeout(t);
  }, [successMessage]);

  const totalPages = Math.max(1, Math.ceil(totalQuestions / tamano));

  // Si la página quedó fuera de rango (por ejemplo, tras eliminar la última pregunta de la última página), retroceder.
  useEffect(() => {
    if (!loading && !error && pagina > totalPages) {
      actualizarParams({ pagina: String(totalPages) }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, pagina, totalPages]);

  // ---------- Cargos ----------

  const nombreCargo = useMemo(() => {
    const mapa = new Map();
    cargos.forEach((c) => mapa.set(c.cargoId, c.nombre));
    return mapa;
  }, [cargos]);

  const cargosPorArea = useMemo(() => {
    const grupos = new Map();
    cargos.forEach((c) => {
      const area = c.area || 'Sin área';
      if (!grupos.has(area)) grupos.set(area, []);
      grupos.get(area).push(c);
    });
    return [...grupos.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([area, lista]) => [area, [...lista].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))]);
  }, [cargos]);

  // ---------- URL ----------

  function actualizarParams(cambios, reemplazar = false) {
    setSearchParams((previos) => {
      const nuevos = new URLSearchParams(previos);
      Object.entries(cambios).forEach(([clave, valor]) => {
        if (valor === '' || valor == null) nuevos.delete(clave);
        else nuevos.set(clave, String(valor));
      });
      if (nuevos.get('pagina') === '1') nuevos.delete('pagina');
      if (nuevos.get('tamano') === String(TAMANO_POR_DEFECTO)) nuevos.delete('tamano');
      return nuevos;
    }, { replace: reemplazar });
  }

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    actualizarParams({ [name]: value, pagina: '' });
  };

  const handleSearchChange = (e) => {
    actualizarParams({ buscar: e.target.value }, true);
  };

  const handleTamanoChange = (e) => {
    actualizarParams({ tamano: e.target.value, pagina: '' });
  };

  const irAPagina = (nueva) => {
    actualizarParams({ pagina: String(Math.min(Math.max(1, nueva), totalPages)) });
  };

  const hayFiltros = CLAVES_FILTRO.some((clave) => filtros[clave]) || Boolean(filtros.buscar);

  const clearFilters = () => {
    const tamanoActual = searchParams.get('tamano');
    setSearchParams(tamanoActual ? { tamano: tamanoActual } : {});
  };

  // ---------- Búsqueda en el cliente (solo la página actual) ----------

  const textoBusqueda = filtros.buscar.trim().toLowerCase();
  const visibles = useMemo(
    () => (textoBusqueda
      ? questions.filter((q) => String(q.enunciado || '').toLowerCase().includes(textoBusqueda))
      : questions),
    [questions, textoBusqueda]
  );

  // ---------- Acciones ----------

  const marcarOcupada = (id, valor) => {
    setOcupadas((prev) => {
      const siguiente = { ...prev };
      if (valor) siguiente[id] = true; else delete siguiente[id];
      return siguiente;
    });
  };

  const limpiarAvisos = () => {
    setError('');
    setSuccessMessage('');
    setPreguntaEnUso(null);
  };

  const handleApprove = async (question) => {
    limpiarAvisos();
    marcarOcupada(question.id, true);
    try {
      const data = await approveQuestion(question.id);
      setSuccessMessage(data?.mensaje || 'Pregunta aprobada');
      await fetchQuestions();
    } catch (err) {
      setError(mensajeDeError(err, 'Error al aprobar la pregunta'));
    } finally {
      marcarOcupada(question.id, false);
    }
  };

  const abrirRechazo = (question) => {
    setPreguntaEnUso(null);
    setRechazo({ pregunta: question, motivo: '', enviando: false, error: '' });
  };

  const cerrarRechazo = () => {
    setRechazo((actual) => (actual?.enviando ? actual : null));
  };

  const motivoLimpio = rechazo ? rechazo.motivo.trim() : '';
  const motivoValido = motivoLimpio.length >= 1 && motivoLimpio.length <= LIMITES.motivoRechazo;

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rechazo || rechazo.enviando || !motivoValido) return;
    const { pregunta } = rechazo;
    setRechazo((actual) => ({ ...actual, enviando: true, error: '' }));
    marcarOcupada(pregunta.id, true);
    try {
      const data = await rejectQuestion(pregunta.id, motivoLimpio);
      setRechazo(null);
      limpiarAvisos();
      setSuccessMessage(data?.mensaje || 'Pregunta rechazada');
      await fetchQuestions();
    } catch (err) {
      setRechazo((actual) => (actual ? { ...actual, enviando: false, error: mensajeDeError(err, 'Error al rechazar la pregunta') } : actual));
    } finally {
      marcarOcupada(pregunta.id, false);
    }
  };

  useEffect(() => {
    if (!rechazo) return undefined;
    const alPresionar = (ev) => { if (ev.key === 'Escape') cerrarRechazo(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechazo !== null]);

  const handleDeleteQuestion = async (question) => {
    const confirmText = recortar(String(question.enunciado || ''), 50);
    if (!window.confirm(`¿Eliminar la pregunta "${confirmText}"? Esta acción no se puede deshacer.`)) return;

    limpiarAvisos();
    marcarOcupada(question.id, true);
    try {
      const data = await deleteQuestion(question.id);
      setSuccessMessage(data?.mensaje || 'Pregunta eliminada');
      await fetchQuestions();
    } catch (err) {
      setError(mensajeDeError(err, 'Error al eliminar la pregunta'));
      if (codigoDeError(err) === 'pregunta_en_uso' && question.estado !== 'rechazada') setPreguntaEnUso(question);
    } finally {
      marcarOcupada(question.id, false);
    }
  };

  // ---------- Selección y aprobación masiva ----------

  const aprobables = visibles.filter((q) => q.estado !== 'aprobada');
  const todasSeleccionadas = aprobables.length > 0 && aprobables.every((q) => seleccionadas.has(q.id));

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
      return siguiente;
    });
  };

  const toggleTodas = () => {
    setSeleccionadas(todasSeleccionadas ? new Set() : new Set(aprobables.map((q) => q.id)));
  };

  const handleApproveSelected = async () => {
    const lote = questions.filter((q) => seleccionadas.has(q.id) && q.estado !== 'aprobada');
    if (lote.length === 0 || masivo?.corriendo) return;
    if (!window.confirm(`¿Aprobar ${lote.length} pregunta(s)? Quedarán visibles para los usuarios.`)) return;

    limpiarAvisos();
    const errores = [];
    setMasivo({ hechas: 0, total: lote.length, errores, corriendo: true });
    // Una por una (no en paralelo) para no saturar el servidor y poder informar el avance.
    for (let i = 0; i < lote.length; i += 1) {
      const q = lote[i];
      marcarOcupada(q.id, true);
      try {
        await approveQuestion(q.id);
      } catch (err) {
        errores.push({ id: q.id, enunciado: recortar(String(q.enunciado || ''), 60), mensaje: mensajeDeError(err, 'Error al aprobar') });
      } finally {
        marcarOcupada(q.id, false);
      }
      setMasivo({ hechas: i + 1, total: lote.length, errores: [...errores], corriendo: i + 1 < lote.length });
    }
    const aprobadas = lote.length - errores.length;
    if (aprobadas > 0) setSuccessMessage(`Preguntas aprobadas: ${aprobadas} de ${lote.length}`);
    setSeleccionadas(new Set());
    await fetchQuestions();
  };

  // ---------- Vista previa ----------

  const toggleExpandida = (id) => {
    setExpandidas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
      return siguiente;
    });
  };

  const contexto = (question) => {
    if (question.cargoId) {
      const nombre = nombreCargo.get(question.cargoId);
      return nombre
        ? { texto: nombre, titulo: `Cargo: ${nombre}` }
        : { texto: '—', titulo: `Cargo ${question.cargoId}` };
    }
    if (question.skillId) {
      return { texto: `Skill ${String(question.skillId).slice(0, 8)}`, titulo: `Skill ${question.skillId}` };
    }
    return { texto: '—', titulo: 'Sin cargo ni skill' };
  };

  const COLUMNAS = 11;

  const renderDetalle = (question) => {
    const opciones = [...(question.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return (
      <tr className="fila-detalle">
        <td colSpan={COLUMNAS}>
          <div className="detalle-contenido">
            <div className="detalle-bloque">
              <h4>Enunciado</h4>
              <p className="detalle-enunciado">{question.enunciado}</p>
            </div>

            {question.tipo === 'opcion_multiple' ? (
              <div className="detalle-bloque">
                <h4>Opciones</h4>
                {opciones.length === 0 ? (
                  <p className="detalle-vacio">Sin opciones</p>
                ) : (
                  <ol className="detalle-opciones">
                    {opciones.map((o, i) => (
                      <li key={o.id ?? i} className={o.esCorrecta ? 'opcion-correcta' : ''}>
                        <span className="opcion-letra">{LETRAS[i] ?? i + 1}</span>
                        <div>
                          <span>{o.texto}</span>
                          {o.esCorrecta && <span className="marca-correcta">Correcta</span>}
                          {o.explicacion && <p className="opcion-explicacion">{o.explicacion}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <>
                <div className="detalle-bloque">
                  <h4>Respuesta ideal</h4>
                  {question.respuestaIdeal
                    ? <p className="detalle-texto">{question.respuestaIdeal}</p>
                    : <p className="detalle-vacio">Sin respuesta ideal</p>}
                </div>
                <div className="detalle-bloque">
                  <h4>Rúbrica</h4>
                  <Rubrica rubrica={question.rubrica} />
                </div>
              </>
            )}

            {question.estado === 'rechazada' && question.motivoRechazo && (
              <div className="detalle-bloque">
                <h4>Motivo del rechazo</h4>
                <p className="detalle-texto">{question.motivoRechazo}</p>
              </div>
            )}

            <p className="detalle-meta">
              ID: {question.id}
              {question.cargoId && <> · Cargo: {question.cargoId}</>}
              {question.skillId && <> · Skill: {question.skillId}</>}
            </p>
          </div>
        </td>
      </tr>
    );
  };

  // ---------- Render ----------

  const subtitulo = hayFiltros && CLAVES_FILTRO.some((clave) => filtros[clave])
    ? `${totalQuestions} preguntas con estos filtros`
    : `Total: ${totalQuestions} preguntas`;

  return (
    <div className="question-list">
      <div className="header">
        <div className="header-content">
          <div>
            <h1>Gestión de Preguntas</h1>
            <p className="subtitle">{loading && questions.length === 0 ? 'Cargando...' : subtitulo}</p>
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/generar-preguntas')} className="btn btn-secondary btn-header">
              Generar con IA
            </button>
            <button onClick={() => navigate('/crear-pregunta')} className="btn btn-primary">
              Crear pregunta
            </button>
          </div>
        </div>
      </div>

      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            name="buscar"
            value={filtros.buscar}
            onChange={handleSearchChange}
            placeholder="Buscar en esta página"
            className="search-input"
            aria-label="Buscar en esta página"
          />
          <p className="search-hint">
            La búsqueda filtra solo las preguntas de la página actual; el servidor no ofrece búsqueda por texto.
          </p>
        </div>

        <div className="filters-row">
          <select name="estado" value={filtros.estado} onChange={handleFilterChange} className="filter-select" aria-label="Estado">
            <option value="">Todos los estados</option>
            {ESTADOS_PREGUNTA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select name="categoria" value={filtros.categoria} onChange={handleFilterChange} className="filter-select" aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select name="tipo" value={filtros.tipo} onChange={handleFilterChange} className="filter-select" aria-label="Tipo">
            <option value="">Todos los tipos</option>
            {TIPOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select name="nivel" value={filtros.nivel} onChange={handleFilterChange} className="filter-select" aria-label="Nivel">
            <option value="">Todos los niveles</option>
            {NIVELES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select name="cargoId" value={filtros.cargoId} onChange={handleFilterChange} className="filter-select" aria-label="Cargo">
            <option value="">Todos los cargos</option>
            {filtros.cargoId && !nombreCargo.has(filtros.cargoId) && (
              <option value={filtros.cargoId}>Cargo seleccionado</option>
            )}
            {cargosPorArea.map(([area, lista]) => (
              <optgroup key={area} label={area}>
                {lista.map((c) => <option key={c.cargoId} value={c.cargoId}>{c.nombre}</option>)}
              </optgroup>
            ))}
          </select>

          <select name="generadaPorIa" value={filtros.generadaPorIa} onChange={handleFilterChange} className="filter-select" aria-label="Origen">
            <option value="">Todos los orígenes</option>
            <option value="true">Generadas con IA</option>
            <option value="false">Manuales</option>
          </select>

          <select value={String(tamano)} onChange={handleTamanoChange} className="filter-select filter-select-sm" aria-label="Preguntas por página">
            {TAMANOS_PAGINA.map((n) => <option key={n} value={n}>{n} por página</option>)}
          </select>

          {hayFiltros && (
            <button onClick={clearFilters} className="btn btn-secondary btn-header">
              Limpiar filtros
            </button>
          )}
        </div>
        {errorCargos && <p className="search-hint">{errorCargos}</p>}
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          {preguntaEnUso && (
            <button
              type="button"
              className="btn btn-sm btn-danger alert-action"
              onClick={() => abrirRechazo(preguntaEnUso)}
            >
              Rechazar en su lugar
            </button>
          )}
        </div>
      )}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      {(seleccionadas.size > 0 || masivo) && (
        <div className="bulk-bar">
          {seleccionadas.size > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={handleApproveSelected}
              disabled={Boolean(masivo?.corriendo)}
            >
              Aprobar seleccionadas ({seleccionadas.size})
            </button>
          )}
          {masivo && (
            <div className="bulk-progress">
              <span>
                {masivo.corriendo
                  ? `Aprobando ${masivo.hechas} de ${masivo.total}...`
                  : `Listo: ${masivo.total - masivo.errores.length} aprobadas, ${masivo.errores.length} con error`}
              </span>
              {masivo.errores.length > 0 && (
                <ul className="bulk-errors">
                  {masivo.errores.map((e) => <li key={e.id}>"{e.enunciado}": {e.mensaje}</li>)}
                </ul>
              )}
              {!masivo.corriendo && (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setMasivo(null)}>
                  Cerrar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="table-container">
        <table className="questions-table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={todasSeleccionadas}
                  onChange={toggleTodas}
                  disabled={aprobables.length === 0 || Boolean(masivo?.corriendo)}
                  title="Seleccionar las no aprobadas de esta página"
                  aria-label="Seleccionar todas"
                />
              </th>
              <th>Enunciado</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Nivel</th>
              <th>Contexto</th>
              <th>Estado</th>
              <th>Origen</th>
              <th>Usos</th>
              <th>Creada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && questions.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS}>
                  <div className="loading">Cargando preguntas...</div>
                </td>
              </tr>
            ) : visibles.map((question) => {
              const ocupada = Boolean(ocupadas[question.id]);
              const abierta = expandidas.has(question.id);
              const ctx = contexto(question);
              const enUso = Number(question.vecesUsada) > 0;
              const numOpciones = Array.isArray(question.opciones) ? question.opciones.length : 0;
              return (
                <Fragment key={question.id}>
                <tr className={abierta ? 'fila-abierta' : ''}>
                  <td className="col-check">
                    {question.estado !== 'aprobada' && (
                      <input
                        type="checkbox"
                        checked={seleccionadas.has(question.id)}
                        onChange={() => toggleSeleccion(question.id)}
                        disabled={Boolean(masivo?.corriendo)}
                        aria-label="Seleccionar pregunta"
                      />
                    )}
                  </td>
                  <td className="question-text">
                    <div className="text-preview" title={question.enunciado}>
                      {recortar(String(question.enunciado || ''), 140)}
                    </div>
                    <button type="button" className="link-detalle" onClick={() => toggleExpandida(question.id)}>
                      {abierta ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${categoriaClase(question.categoria)}`}>
                      {etiqueta(CATEGORIAS, question.categoria)}
                    </span>
                  </td>
                  <td className="col-tipo">
                    {etiqueta(TIPOS, question.tipo)}
                    {question.tipo === 'opcion_multiple' && (
                      <span className="texto-secundario">{numOpciones} opciones</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${nivelClase(question.nivel)}`}>
                      {etiqueta(NIVELES, question.nivel)}
                    </span>
                  </td>
                  <td title={ctx.titulo}>{ctx.texto}</td>
                  <td>
                    <span
                      className={`badge ${estadoClase(question.estado)}`}
                      title={question.estado === 'rechazada' && question.motivoRechazo ? question.motivoRechazo : undefined}
                    >
                      {etiqueta(ESTADOS_PREGUNTA, question.estado)}
                    </span>
                    {question.estado === 'rechazada' && question.motivoRechazo && (
                      <div className="motivo-rechazo" title={question.motivoRechazo}>
                        {recortar(question.motivoRechazo, 60)}
                      </div>
                    )}
                  </td>
                  <td>
                    {question.generadaPorIa
                      ? <span className="badge badge-ia">IA</span>
                      : <span className="texto-secundario">Manual</span>}
                  </td>
                  <td className="col-numero">{question.vecesUsada ?? 0}</td>
                  <td className="col-fecha">{formatearFecha(question.fechaCreacion)}</td>
                  <td>
                    <div className="actions">
                      <button
                        onClick={() => navigate(`/editar-pregunta/${question.id}`)}
                        className="btn btn-sm btn-secondary"
                        title="Editar pregunta"
                        disabled={ocupada}
                      >
                        Editar
                      </button>
                      {question.estado !== 'aprobada' && (
                        <button
                          onClick={() => handleApprove(question)}
                          className="btn btn-sm btn-success"
                          title="Aprobar: quedará visible para los usuarios"
                          disabled={ocupada}
                        >
                          Aprobar
                        </button>
                      )}
                      {question.estado !== 'rechazada' && (
                        <button
                          onClick={() => abrirRechazo(question)}
                          className="btn btn-sm btn-warning"
                          title="Rechazar con un motivo"
                          disabled={ocupada}
                        >
                          Rechazar
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteQuestion(question)}
                        className="btn btn-sm btn-danger"
                        title={enUso ? 'Ya se usó en entrevistas; recházala en su lugar' : 'Eliminar pregunta'}
                        disabled={ocupada || enUso}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
                {abierta && renderDetalle(question)}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {!loading && visibles.length === 0 && !error && (
          <div className="empty-state">
            <p>
              {textoBusqueda && questions.length > 0
                ? 'Ninguna pregunta de esta página coincide con la búsqueda'
                : hayFiltros
                  ? 'No se encontraron preguntas con los filtros aplicados'
                  : 'No hay preguntas registradas'}
            </p>
          </div>
        )}
        {loading && questions.length > 0 && <div className="loading-inline">Actualizando...</div>}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => irAPagina(pagina - 1)}
            disabled={pagina <= 1 || loading}
            className="btn btn-secondary"
          >
            Anterior
          </button>

          <span className="pagination-info">
            Página {Math.min(pagina, totalPages)} de {totalPages}
          </span>

          <button
            onClick={() => irAPagina(pagina + 1)}
            disabled={pagina >= totalPages || loading}
            className="btn btn-secondary"
          >
            Siguiente
          </button>
        </div>
      )}

      {rechazo && (
        <div className="modal-backdrop" onClick={cerrarRechazo}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-rechazo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleReject}
          >
            <h2 id="titulo-rechazo">Rechazar pregunta</h2>
            <p className="modal-enunciado" title={rechazo.pregunta.enunciado}>
              "{recortar(String(rechazo.pregunta.enunciado || ''), 160)}"
            </p>
            <label htmlFor="motivo-rechazo">Motivo del rechazo (obligatorio)</label>
            <textarea
              id="motivo-rechazo"
              value={rechazo.motivo}
              onChange={(e) => setRechazo((actual) => ({ ...actual, motivo: e.target.value }))}
              maxLength={LIMITES.motivoRechazo}
              rows={5}
              autoFocus
              disabled={rechazo.enviando}
              placeholder="Explica qué debe corregirse"
            />
            <div className="contador-caracteres">
              {rechazo.motivo.length}/{LIMITES.motivoRechazo}
            </div>
            {rechazo.error && <div className="alert alert-error">{rechazo.error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary btn-header" onClick={cerrarRechazo} disabled={rechazo.enviando}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger btn-header" disabled={!motivoValido || rechazo.enviando}>
                {rechazo.enviando ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default QuestionList;
