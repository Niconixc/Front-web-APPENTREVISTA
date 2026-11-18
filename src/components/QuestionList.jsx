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
import FondoModal from './FondoModal';
import Icono from './Icono';
import './QuestionList.css';

// Filtros que viajan a V2 (y viven en la URL: /preguntas?estado=pendiente&generadaPorIa=true).
// skillId y paraCargoId no tienen selector: llegan desde Cobertura (las pendientes que cuenta una celda: de la skill y
// del cargo o sin cargo) y se quitan juntos con su aviso.
const CLAVES_FILTRO = ['estado', 'categoria', 'tipo', 'nivel', 'cargoId', 'skillId', 'paraCargoId', 'generadaPorIa'];
const CLAVES_UUID = ['cargoId', 'skillId', 'paraCargoId'];
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
    const uuidInvalido = CLAVES_UUID.includes(clave) && valor && !FORMATO_UUID.test(valor);
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

// Variante de insignia por estado; un estado desconocido queda con la insignia neutra.
const INSIGNIA_ESTADO = { pendiente: 'insignia--aviso', aprobada: 'insignia--exito', rechazada: 'insignia--peligro' };
const estadoClase = (estado) => (VALORES_VALIDOS.estado.includes(estado) ? INSIGNIA_ESTADO[estado] : '');

/** Contenido de la rúbrica para la vista previa: lo conocido se muestra ordenado; el resto, como JSON. */
const Rubrica = ({ rubrica }) => {
  if (!rubrica || typeof rubrica !== 'object' || Object.keys(rubrica).length === 0) {
    return <p className="lista-preguntas__vacio">Sin rúbrica</p>;
  }
  const { metodo, criterios, palabras_clave: palabras, tiempo_esperado_seg: tiempo, ...resto } = rubrica;
  const conocida = Array.isArray(criterios) || Array.isArray(palabras) || tiempo != null || metodo != null;
  if (!conocida) return <pre className="lista-preguntas__json">{JSON.stringify(rubrica, null, 2)}</pre>;
  return (
    <div className="lista-preguntas__rubrica">
      {metodo != null && <p><span className="lista-preguntas__clave">Método:</span> {String(metodo)}</p>}
      {Array.isArray(criterios) && criterios.length > 0 && (
        <div>
          <span className="lista-preguntas__clave">Criterios:</span>
          <ul>
            {criterios.map((c, i) => <li key={i}>{typeof c === 'string' ? c : JSON.stringify(c)}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(palabras) && palabras.length > 0 && (
        <p><span className="lista-preguntas__clave">Palabras clave:</span> {palabras.map(String).join(', ')}</p>
      )}
      {tiempo != null && <p><span className="lista-preguntas__clave">Tiempo esperado:</span> <span className="num">{String(tiempo)} s</span></p>}
      {Object.keys(resto).length > 0 && (
        <div>
          <span className="lista-preguntas__clave">Otros datos:</span>
          <pre className="lista-preguntas__json">{JSON.stringify(resto, null, 2)}</pre>
        </div>
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

  const { estado, categoria, tipo, nivel, cargoId, skillId, paraCargoId, generadaPorIa, pagina, tamano } = filtros;

  const fetchQuestions = useCallback(async () => {
    const peticion = ++ultimaPeticion.current;
    setLoading(true);
    try {
      const data = await getQuestions({ estado, categoria, tipo, nivel, cargoId, skillId, paraCargoId, generadaPorIa, pagina, tamano });
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
  }, [estado, categoria, tipo, nivel, cargoId, skillId, paraCargoId, generadaPorIa, pagina, tamano]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Al cambiar de página o de filtros se limpian la selección y las filas abiertas.
  useEffect(() => {
    setSeleccionadas(new Set());
    setExpandidas(new Set());
  }, [estado, categoria, tipo, nivel, cargoId, skillId, paraCargoId, generadaPorIa, pagina, tamano]);

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

  const COLUMNAS = 8;

  const renderDetalle = (question) => {
    const opciones = [...(question.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return (
      <tr className="lista-preguntas__fila-detalle">
        <td colSpan={COLUMNAS}>
          <div className="lista-preguntas__detalle">
            <div className="lista-preguntas__bloque">
              <h4 className="lista-preguntas__bloque-titulo">Enunciado</h4>
              <p className="lista-preguntas__texto-largo">{question.enunciado}</p>
            </div>

            {question.tipo === 'opcion_multiple' ? (
              <div className="lista-preguntas__bloque">
                <h4 className="lista-preguntas__bloque-titulo">Opciones</h4>
                {opciones.length === 0 ? (
                  <p className="lista-preguntas__vacio">Sin opciones</p>
                ) : (
                  <ol className="lista-preguntas__opciones">
                    {opciones.map((o, i) => (
                      <li key={o.id ?? i} className={o.esCorrecta ? 'lista-preguntas__opcion--correcta' : ''}>
                        <span className="lista-preguntas__letra">{LETRAS[i] ?? i + 1}</span>
                        <div className="lista-preguntas__opcion-texto">
                          <span>{o.texto}</span>
                          {o.esCorrecta && (
                            <span className="insignia insignia--exito">
                              <Icono nombre="check" tamano={12} />
                              Correcta
                            </span>
                          )}
                          {o.explicacion && <p className="lista-preguntas__explicacion">{o.explicacion}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <>
                <div className="lista-preguntas__bloque">
                  <h4 className="lista-preguntas__bloque-titulo">Respuesta ideal</h4>
                  {question.respuestaIdeal
                    ? <p className="lista-preguntas__texto-largo">{question.respuestaIdeal}</p>
                    : <p className="lista-preguntas__vacio">Sin respuesta ideal</p>}
                </div>
                <div className="lista-preguntas__bloque">
                  <h4 className="lista-preguntas__bloque-titulo">Rúbrica</h4>
                  <Rubrica rubrica={question.rubrica} />
                </div>
              </>
            )}

            {question.estado === 'rechazada' && question.motivoRechazo && (
              <div className="lista-preguntas__bloque">
                <h4 className="lista-preguntas__bloque-titulo">Motivo del rechazo</h4>
                <p className="lista-preguntas__texto-largo">{question.motivoRechazo}</p>
              </div>
            )}

            <p className="lista-preguntas__meta mono">
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
    <div className="pagina lista-preguntas">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <h1 className="encabezado-pagina__titulo">Preguntas</h1>
          <p className="encabezado-pagina__descripcion num">
            {loading && questions.length === 0 ? 'Cargando...' : subtitulo}
          </p>
        </div>
        <div className="encabezado-pagina__acciones">
          <button type="button" onClick={() => navigate('/generar-preguntas')} className="boton">
            <Icono nombre="generar" />
            Generar con IA
          </button>
          <button type="button" onClick={() => navigate('/crear-pregunta')} className="boton boton--primario">
            <Icono nombre="mas" />
            Crear pregunta
          </button>
        </div>
      </header>

      <div className="pila pila--chica">
        <div className="filtros">
          <div className="campo campo--busqueda">
            <label htmlFor="lista-preguntas-buscar" className="campo__etiqueta">Buscar</label>
            <input
              id="lista-preguntas-buscar"
              type="text"
              name="buscar"
              value={filtros.buscar}
              onChange={handleSearchChange}
              placeholder="Buscar en esta página"
              aria-label="Buscar en esta página"
              aria-describedby="lista-preguntas-buscar-ayuda"
            />
          </div>

          <div className="campo">
            <label htmlFor="lista-preguntas-estado" className="campo__etiqueta">Estado</label>
            <select id="lista-preguntas-estado" name="estado" value={filtros.estado} onChange={handleFilterChange} aria-label="Estado">
              <option value="">Todos los estados</option>
              {ESTADOS_PREGUNTA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="lista-preguntas-categoria" className="campo__etiqueta">Categoría</label>
            <select id="lista-preguntas-categoria" name="categoria" value={filtros.categoria} onChange={handleFilterChange} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="lista-preguntas-tipo" className="campo__etiqueta">Tipo</label>
            <select id="lista-preguntas-tipo" name="tipo" value={filtros.tipo} onChange={handleFilterChange} aria-label="Tipo">
              <option value="">Todos los tipos</option>
              {TIPOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="lista-preguntas-nivel" className="campo__etiqueta">Nivel</label>
            <select id="lista-preguntas-nivel" name="nivel" value={filtros.nivel} onChange={handleFilterChange} aria-label="Nivel">
              <option value="">Todos los niveles</option>
              {NIVELES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="lista-preguntas-cargo" className="campo__etiqueta">Cargo</label>
            <select id="lista-preguntas-cargo" name="cargoId" value={filtros.cargoId} onChange={handleFilterChange} aria-label="Cargo">
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
          </div>

          <div className="campo">
            <label htmlFor="lista-preguntas-origen" className="campo__etiqueta">Origen</label>
            <select id="lista-preguntas-origen" name="generadaPorIa" value={filtros.generadaPorIa} onChange={handleFilterChange} aria-label="Origen">
              <option value="">Todos los orígenes</option>
              <option value="true">Generadas con IA</option>
              <option value="false">Manuales</option>
            </select>
          </div>

          <div className="campo lista-preguntas__campo-tamano">
            <label htmlFor="lista-preguntas-tamano" className="campo__etiqueta">Por página</label>
            <select id="lista-preguntas-tamano" value={String(tamano)} onChange={handleTamanoChange} aria-label="Preguntas por página">
              {TAMANOS_PAGINA.map((n) => <option key={n} value={n}>{n} por página</option>)}
            </select>
          </div>

          {hayFiltros && (
            <button type="button" onClick={clearFilters} className="boton boton--sutil">
              Limpiar filtros
            </button>
          )}
        </div>

        <p id="lista-preguntas-buscar-ayuda" className="nota nota--chica">
          La búsqueda filtra solo las preguntas de la página actual; el servidor no ofrece búsqueda por texto.
        </p>

        {(filtros.skillId || filtros.paraCargoId) && (
          <div className="aviso aviso--info">
            <Icono nombre="filtro" className="aviso__icono" />
            <p className="aviso__contenido">
              <span>
                {filtros.paraCargoId
                  ? `Mostrando las preguntas de una skill que sirven para ${nombreCargo.get(filtros.paraCargoId) || 'un cargo'} (las de ese cargo y las sin cargo), abierto desde Cobertura.`
                  : 'Mostrando solo las preguntas de una skill (abierto desde Cobertura).'}{' '}
                <button
                  type="button"
                  className="lista-preguntas__enlace"
                  onClick={() => {
                    const nuevos = new URLSearchParams(searchParams);
                    ['skillId', 'paraCargoId', 'pagina'].forEach((clave) => nuevos.delete(clave));
                    setSearchParams(nuevos);
                  }}
                >
                  Ver todas las skills
                </button>
              </span>
            </p>
          </div>
        )}
        {errorCargos && <p className="nota nota--chica texto-peligro">{errorCargos}</p>}
      </div>

      {error && (
        <div className="aviso aviso--peligro">
          <Icono nombre="alerta" className="aviso__icono" />
          <div className="aviso__contenido">
            <span>{error}</span>
            {preguntaEnUso && (
              <div>
                <button
                  type="button"
                  className="boton boton--chico"
                  onClick={() => abrirRechazo(preguntaEnUso)}
                >
                  Rechazar en su lugar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {successMessage && (
        <div className="aviso aviso--exito">
          <Icono nombre="check-circulo" className="aviso__icono" />
          <div className="aviso__contenido">{successMessage}</div>
        </div>
      )}

      {(seleccionadas.size > 0 || masivo) && (
        <div className="lista-preguntas__masivo">
          {seleccionadas.size > 0 && (
            <button
              type="button"
              className="boton boton--chico"
              onClick={handleApproveSelected}
              disabled={Boolean(masivo?.corriendo)}
            >
              <Icono nombre="check" />
              Aprobar seleccionadas ({seleccionadas.size})
            </button>
          )}
          {masivo && (
            <div className="lista-preguntas__masivo-progreso">
              <span className="num">
                {masivo.corriendo
                  ? `Aprobando ${masivo.hechas} de ${masivo.total}...`
                  : `Listo: ${masivo.total - masivo.errores.length} aprobadas, ${masivo.errores.length} con error`}
              </span>
              {masivo.errores.length > 0 && (
                <ul className="lista-preguntas__masivo-errores">
                  {masivo.errores.map((e) => <li key={e.id}>"{e.enunciado}": {e.mensaje}</li>)}
                </ul>
              )}
              {!masivo.corriendo && (
                <button type="button" className="boton boton--sutil boton--chico" onClick={() => setMasivo(null)}>
                  Cerrar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla tabla--compacta lista-preguntas__tabla">
          <thead>
            <tr>
              <th className="lista-preguntas__col-check">
                <input
                  type="checkbox"
                  checked={todasSeleccionadas}
                  onChange={toggleTodas}
                  disabled={aprobables.length === 0 || Boolean(masivo?.corriendo)}
                  title="Seleccionar las no aprobadas de esta página"
                  aria-label="Seleccionar todas"
                />
              </th>
              <th className="lista-preguntas__col-enunciado">Enunciado</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Contexto</th>
              <th>Estado y origen</th>
              <th>Creada y usos</th>
              <th className="celda-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && questions.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS}>
                  <div className="cargando cargando--bloque">Cargando preguntas...</div>
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
                <tr className={abierta ? 'lista-preguntas__fila--abierta' : ''}>
                  <td className="lista-preguntas__col-check">
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
                  <td className="lista-preguntas__col-enunciado">
                    <div className="lista-preguntas__enunciado" title={question.enunciado}>
                      {String(question.enunciado || '')}
                    </div>
                    <button
                      type="button"
                      className="lista-preguntas__enlace"
                      aria-expanded={abierta}
                      onClick={() => toggleExpandida(question.id)}
                    >
                      {abierta ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                  </td>
                  <td>
                    {etiqueta(CATEGORIAS, question.categoria)}
                    <span className="lista-preguntas__sub">{etiqueta(NIVELES, question.nivel)}</span>
                  </td>
                  <td>
                    {etiqueta(TIPOS, question.tipo)}
                    {question.tipo === 'opcion_multiple' && (
                      <span className="lista-preguntas__sub num">{numOpciones} opciones</span>
                    )}
                  </td>
                  <td className="lista-preguntas__col-contexto" title={ctx.titulo}>
                    <div className="lista-preguntas__contexto">{ctx.texto}</div>
                  </td>
                  <td>
                    <span
                      className={`insignia insignia--punto ${estadoClase(question.estado)}`.trim()}
                      title={question.estado === 'rechazada' && question.motivoRechazo ? question.motivoRechazo : undefined}
                    >
                      {etiqueta(ESTADOS_PREGUNTA, question.estado)}
                    </span>
                    {question.estado === 'rechazada' && question.motivoRechazo && (
                      <div className="lista-preguntas__motivo" title={question.motivoRechazo}>
                        {recortar(question.motivoRechazo, 60)}
                      </div>
                    )}
                    <span className="lista-preguntas__sub">{question.generadaPorIa ? 'Generada con IA' : 'Manual'}</span>
                  </td>
                  <td className="lista-preguntas__col-fecha">
                    {formatearFecha(question.fechaCreacion)}
                    <span className="lista-preguntas__sub">
                      {question.vecesUsada ?? 0} {Number(question.vecesUsada) === 1 ? 'uso' : 'usos'}
                    </span>
                  </td>
                  <td className="celda-acciones">
                    <div className="grupo-botones">
                      {question.estado !== 'aprobada' && (
                        <button
                          type="button"
                          onClick={() => handleApprove(question)}
                          className="boton boton--chico"
                          title="Aprobar: quedará visible para los usuarios"
                          disabled={ocupada}
                        >
                          Aprobar
                        </button>
                      )}
                      {question.estado !== 'rechazada' && (
                        <button
                          type="button"
                          onClick={() => abrirRechazo(question)}
                          className="boton boton--chico"
                          title="Rechazar con un motivo"
                          disabled={ocupada}
                        >
                          Rechazar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/editar-pregunta/${question.id}`)}
                        className="boton boton--chico boton--icono"
                        title="Editar pregunta"
                        aria-label="Editar"
                        disabled={ocupada}
                      >
                        <Icono nombre="editar" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(question)}
                        className="boton boton--chico boton--icono boton--peligro-suave"
                        title={enUso ? 'Ya se usó en entrevistas; recházala en su lugar' : 'Eliminar pregunta'}
                        aria-label="Eliminar"
                        disabled={ocupada || enUso}
                      >
                        <Icono nombre="borrar" />
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
          <div className="vacio">
            <p>
              {textoBusqueda && questions.length > 0
                ? 'Ninguna pregunta de esta página coincide con la búsqueda'
                : hayFiltros
                  ? 'No se encontraron preguntas con los filtros aplicados'
                  : 'No hay preguntas registradas'}
            </p>
          </div>
        )}
        {loading && questions.length > 0 && (
          <div className="lista-preguntas__actualizando">
            <span className="cargando">Actualizando...</span>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="paginacion" aria-label="Paginación">
          <span>
            Página {Math.min(pagina, totalPages)} de {totalPages}
          </span>
          <div className="grupo-botones">
            <button
              type="button"
              onClick={() => irAPagina(pagina - 1)}
              disabled={pagina <= 1 || loading}
              className="boton boton--chico"
            >
              <Icono nombre="chevron-izquierda" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => irAPagina(pagina + 1)}
              disabled={pagina >= totalPages || loading}
              className="boton boton--chico"
            >
              Siguiente
              <Icono nombre="chevron-derecha" />
            </button>
          </div>
        </nav>
      )}

      {rechazo && (
        // El fondo no cierra con el 2.º clic de un doble clic en «Rechazar» ni al arrastrar desde el motivo (FondoModal).
        <FondoModal onCerrar={cerrarRechazo}>
          <form
            className="dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-rechazo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleReject}
          >
            <div className="dialogo__encabezado">
              <h2 id="titulo-rechazo" className="dialogo__titulo">Rechazar pregunta</h2>
            </div>
            <div className="dialogo__cuerpo">
              <blockquote className="lista-preguntas__cita" title={rechazo.pregunta.enunciado}>
                {recortar(String(rechazo.pregunta.enunciado || ''), 160)}
              </blockquote>
              <div className="campo">
                <label htmlFor="motivo-rechazo" className="campo__etiqueta">Motivo del rechazo (obligatorio)</label>
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
                <div className="campo__contador">
                  {rechazo.motivo.length}/{LIMITES.motivoRechazo}
                </div>
              </div>
              {rechazo.error && (
                <div className="aviso aviso--peligro">
                  <Icono nombre="alerta" className="aviso__icono" />
                  <div className="aviso__contenido">{rechazo.error}</div>
                </div>
              )}
            </div>
            <div className="dialogo__pie">
              <button type="button" className="boton" onClick={cerrarRechazo} disabled={rechazo.enviando}>
                Cancelar
              </button>
              <button type="submit" className="boton boton--peligro" disabled={!motivoValido || rechazo.enviando}>
                {rechazo.enviando ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </form>
        </FondoModal>
      )}
    </div>
  );
};

export default QuestionList;
