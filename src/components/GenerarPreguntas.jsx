import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  generateQuestionsAi,
  getCargos,
  getCostosIa,
  getSkillsDeCargo,
  mensajeDeError,
  codigoDeError,
} from '../services/api';
import {
  CATEGORIAS,
  ESTADOS_PREGUNTA,
  LIMITES,
  MODELOS_IA,
  NIVELES,
  TIPOS,
  etiqueta,
  formatearUsd,
} from '../services/etiquetas';
import './GenerarPreguntas.css';

const RUTA_PENDIENTES_IA = '/preguntas?estado=pendiente&generadaPorIa=true';

// Códigos 502 de V2 que llegan DESPUÉS de que el proveedor respondió (la llamada probablemente se pagó).
// V2 guarda los tokens que el proveedor informó (siempre en provider_invalid_output; en los demás, si venían en la
// respuesta): aparecen en Costos IA con su costo estimado y cuentan para el tope mensual de gasto (D23).
const CODIGOS_CON_COSTO = new Set([
  'provider_invalid_output',
  'provider_invalid_response',
  'provider_missing_content',
  'provider_truncated',
  'provider_refusal',
]);

const formularioInicial = () => ({
  area: '',
  cargoId: '',
  skillId: '',
  nivel: 'junior',
  categoria: 'tecnica',
  tipo: 'abierta_texto',
  cantidad: '5',
  modelo: MODELOS_IA[0].value,
});

/** Cantidad válida (entero de 1 a LIMITES.preguntasPorGeneracion) o null. */
const leerCantidad = (texto) => {
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= LIMITES.preguntasPorGeneracion ? n : null;
};

/**
 * Traduce un error de la generación a lo que el admin necesita saber: si se cobró o no, y qué hacer.
 * tipo: 'sin_costo' | 'con_costo' | 'incierto'.
 */
const clasificarError = (err) => {
  const estado = err?.response?.status;
  const codigo = codigoDeError(err);
  // ¿Llegó a salir el POST de generación? (si falló la renovación previa de la sesión, no se llamó a la IA)
  const llegoAGenerar = String(err?.config?.url || '').includes('generar-ia');

  // Antes que nada: si el POST de generación no salió (falló la renovación previa de la sesión), no hubo IA.
  if (!llegoAGenerar || codigo === 'sesion_renovada') {
    return { tipo: 'sin_costo', mensaje: mensajeDeError(err, 'No se pudo iniciar la generación'), nota: 'No se llamó a la IA: no hubo costo.' };
  }

  if (!err?.response) {
    if (err?.code === 'ECONNABORTED') {
      return {
        tipo: 'incierto',
        mensaje: 'La respuesta tardó demasiado. Es posible que el servidor haya terminado y cobrado.',
        nota: 'No reintentes: revisa primero las preguntas pendientes generadas con IA.',
      };
    }
    return {
      tipo: 'incierto',
      mensaje: 'Se perdió la conexión con el servidor mientras se generaban las preguntas. Es posible que el servidor haya terminado y cobrado.',
      nota: 'No reintentes: revisa primero las preguntas pendientes generadas con IA.',
    };
  }

  if (estado === 504 || codigo === 'servidor_tardo') {
    return {
      tipo: 'incierto',
      mensaje: 'La respuesta tardó demasiado. Es posible que el servidor haya terminado y cobrado.',
      nota: 'No reintentes: revisa primero las preguntas pendientes generadas con IA.',
    };
  }

  if (estado === 503) {
    if (codigo === 'provider_not_configured') {
      return { tipo: 'sin_costo', mensaje: 'El proveedor de IA no está configurado en el servidor.', nota: 'No se llamó a la IA: no hubo costo.' };
    }
    return { tipo: 'sin_costo', mensaje: mensajeDeError(err, 'El servicio de IA no está disponible en este momento'), nota: 'No se llamó a la IA: no hubo costo.' };
  }

  if (estado === 502) {
    if (CODIGOS_CON_COSTO.has(codigo)) {
      const mensaje = codigo === 'provider_invalid_output'
        ? 'La IA respondió pero el lote no pasó la validación.'
        : mensajeDeError(err, 'La IA respondió algo que no se pudo usar.');
      return {
        tipo: 'con_costo',
        mensaje,
        nota: codigo === 'provider_invalid_output'
          ? 'Este intento SÍ tuvo costo: aparece en Costos IA como llamada fallida con su costo estimado. No se guardó ninguna pregunta.'
          : 'El proveedor probablemente cobró este intento: si informó sus tokens, aparece en Costos IA como llamada fallida con su costo estimado y cuenta para el tope mensual. No se guardó ninguna pregunta.',
      };
    }
    if (codigo === 'provider_timeout') {
      return {
        tipo: 'incierto',
        mensaje: mensajeDeError(err, 'El proveedor de IA tardó demasiado en responder.'),
        nota: 'Es posible que el proveedor haya cobrado: el servidor no reintentó para no pagar dos veces. En Costos IA aparece como fallida sin costo. No se guardó ninguna pregunta.',
      };
    }
    if (codigo === 'provider_http_error') {
      return {
        tipo: 'incierto',
        mensaje: mensajeDeError(err, 'El proveedor de IA no respondió correctamente.'),
        nota: 'Un error HTTP del proveedor normalmente no se cobra; en Costos IA aparece como fallida sin costo. No se guardó ninguna pregunta.',
      };
    }
    // 502 del proxy (proxy_error) o sin código: no se sabe si el backend alcanzó a terminar.
    return {
      tipo: 'incierto',
      mensaje: mensajeDeError(err, 'No se pudo completar la comunicación con el servidor.'),
      nota: 'Es posible que el servidor haya terminado y cobrado. No reintentes: revisa primero las preguntas pendientes generadas con IA.',
    };
  }

  if (estado >= 500) {
    return {
      tipo: 'incierto',
      mensaje: mensajeDeError(err, 'El servidor tuvo un error inesperado.'),
      nota: 'No se sabe si alcanzó a llamar a la IA. Revisa las pendientes y Costos IA antes de volver a intentar.',
    };
  }

  if (estado === 429 && codigo === 'tope_generacion_ia_alcanzado') {
    return {
      tipo: 'sin_costo',
      mensaje: mensajeDeError(err, 'Se alcanzó el tope mensual de gasto en IA para generar preguntas.'),
      nota: 'No se llamó a la IA: no hubo costo. El tope lo define LIMITE_GASTO_GENERACION_IA_MENSUAL_USD en el servidor y se repone el día 1 de cada mes (UTC).',
    };
  }

  // 400 (validación), 401/403 (sesión), 404 (cargo/skill inexistente), 429...: V2 valida todo antes de llamar a la IA.
  return { tipo: 'sin_costo', mensaje: mensajeDeError(err, 'No se pudo generar las preguntas'), nota: 'No se llamó a la IA: no hubo costo.' };
};

const sumar = (lista, campo) => {
  const valores = lista.map((p) => p[campo]).filter((v) => typeof v === 'number');
  return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
};

const GenerarPreguntas = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState(formularioInicial);
  const [errorFormulario, setErrorFormulario] = useState('');

  const [cargos, setCargos] = useState([]);
  const [cargandoCargos, setCargandoCargos] = useState(true);
  const [errorCargos, setErrorCargos] = useState('');

  const [skills, setSkills] = useState([]);
  const [cargandoSkills, setCargandoSkills] = useState(false);
  const [errorSkills, setErrorSkills] = useState('');

  const [costoPromedio, setCostoPromedio] = useState(null); // USD por pregunta generada (últimos 30 días)

  const [modalAbierto, setModalAbierto] = useState(false);
  const [entiendeCosto, setEntiendeCosto] = useState(false);

  const [generando, setGenerando] = useState(false);
  const generandoRef = useRef(false); // bloquea el doble clic antes de que React vuelva a pintar
  const [segundos, setSegundos] = useState(0);

  const [resultado, setResultado] = useState(null);
  const [errorGeneracion, setErrorGeneracion] = useState(null);

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // ---------- Catálogo ----------

  const cargarCargos = useCallback(async () => {
    setCargandoCargos(true);
    setErrorCargos('');
    try {
      const lista = await getCargos();
      if (!montadoRef.current) return;
      setCargos(Array.isArray(lista) ? lista.filter((c) => c.activo !== false) : []);
    } catch (err) {
      if (montadoRef.current) setErrorCargos(mensajeDeError(err, 'No se pudieron cargar los cargos'));
    } finally {
      if (montadoRef.current) setCargandoCargos(false);
    }
  }, []);

  useEffect(() => { cargarCargos(); }, [cargarCargos]);

  // Referencia de costo: V2 no da un presupuesto previo; se muestra el promedio real por pregunta del último mes.
  useEffect(() => {
    let vigente = true;
    getCostosIa()
      .then((data) => {
        const gasto = data?.generacionPreguntas;
        if (vigente && gasto && gasto.usos > 0) setCostoPromedio(gasto.costoUsd / gasto.usos);
      })
      .catch(() => { /* es solo una referencia: sin ella la pantalla funciona igual */ });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (!form.cargoId) {
      setSkills([]);
      setErrorSkills('');
      return undefined;
    }
    let vigente = true;
    setCargandoSkills(true);
    setErrorSkills('');
    setSkills([]);
    getSkillsDeCargo(form.cargoId)
      .then((matriz) => {
        if (!vigente) return;
        const lista = Array.isArray(matriz?.skills) ? [...matriz.skills] : [];
        lista.sort((a, b) => Number(b.obligatoria) - Number(a.obligatoria) || String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'));
        setSkills(lista);
      })
      .catch((err) => { if (vigente) setErrorSkills(mensajeDeError(err, 'No se pudieron cargar las skills del cargo')); })
      .finally(() => { if (vigente) setCargandoSkills(false); });
    return () => { vigente = false; };
  }, [form.cargoId]);

  const areas = useMemo(
    () => [...new Set(cargos.map((c) => c.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [cargos]
  );

  const cargosDelArea = useMemo(
    () => cargos
      .filter((c) => !form.area || c.area === form.area)
      .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es')),
    [cargos, form.area]
  );

  const cargoElegido = cargos.find((c) => c.cargoId === form.cargoId) || null;
  const skillElegida = skills.find((s) => s.skillId === form.skillId) || null;
  const cantidad = leerCantidad(form.cantidad);

  // ---------- Aviso al salir mientras genera ----------

  useEffect(() => {
    if (!generando) return undefined;
    const avisar = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', avisar);
    const inicio = Date.now();
    setSegundos(0);
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => {
      window.removeEventListener('beforeunload', avisar);
      clearInterval(reloj);
    };
  }, [generando]);

  // ---------- Formulario ----------

  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    setErrorFormulario('');
    setForm((prev) => {
      const siguiente = { ...prev, [campo]: valor };
      if (campo === 'area') {
        const cargo = cargos.find((c) => c.cargoId === prev.cargoId);
        if (cargo && valor && cargo.area !== valor) {
          siguiente.cargoId = '';
          siguiente.skillId = '';
        }
      }
      if (campo === 'cargoId') {
        siguiente.skillId = '';
        const cargo = cargos.find((c) => c.cargoId === valor);
        if (cargo && !prev.area) siguiente.area = cargo.area;
      }
      if (campo === 'skillId') {
        // La categoría de la skill (tecnica/blanda) es la natural para sus preguntas; se puede cambiar después.
        const skill = skills.find((s) => s.skillId === valor);
        if (skill && CATEGORIAS.some((c) => c.value === skill.categoria)) siguiente.categoria = skill.categoria;
      }
      return siguiente;
    });
  };

  const validar = () => {
    if (!form.cargoId && !form.skillId) return 'Elige un cargo (y, si quieres, una skill concreta de ese cargo)';
    if (cantidad === null) return `La cantidad debe ser un número entero entre 1 y ${LIMITES.preguntasPorGeneracion}`;
    if (!NIVELES.some((n) => n.value === form.nivel)) return 'Elige un nivel';
    if (!CATEGORIAS.some((c) => c.value === form.categoria)) return 'Elige una categoría';
    if (!TIPOS.some((t) => t.value === form.tipo)) return 'Elige un tipo de pregunta';
    if (!MODELOS_IA.some((m) => m.value === form.modelo)) return 'Elige un modelo de IA';
    return null;
  };

  const abrirConfirmacion = (e) => {
    e.preventDefault();
    if (generandoRef.current) return;
    const problema = validar();
    if (problema) {
      setErrorFormulario(problema);
      return;
    }
    setEntiendeCosto(false);
    setModalAbierto(true);
  };

  const cerrarModal = useCallback(() => {
    if (generandoRef.current) return;
    setModalAbierto(false);
    setEntiendeCosto(false);
  }, []);

  useEffect(() => {
    if (!modalAbierto) return undefined;
    const alPresionar = (e) => { if (e.key === 'Escape') cerrarModal(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [modalAbierto, cerrarModal]);

  // ---------- Generación (sin reintentos automáticos en ningún camino) ----------

  const generar = async () => {
    if (generandoRef.current || !entiendeCosto) return;
    const problema = validar();
    if (problema) {
      setModalAbierto(false);
      setErrorFormulario(problema);
      return;
    }
    generandoRef.current = true;
    setGenerando(true);
    setModalAbierto(false);
    setEntiendeCosto(false);
    setResultado(null);
    setErrorGeneracion(null);

    // Body EXACTO de SolicitudGenerarPreguntas (snake_case). cargoId/skillId en camelCase se ignorarían (400 contexto_requerido).
    const solicitud = {
      cargo_id: form.cargoId || undefined,
      skill_id: form.skillId || undefined,
      nivel: form.nivel,
      cantidad: Number(form.cantidad),
      tipo: form.tipo,
      categoria: form.categoria,
      modelo: form.modelo,
    };

    try {
      const data = await generateQuestionsAi(solicitud);
      if (!montadoRef.current) return;
      setResultado({
        mensaje: typeof data?.mensaje === 'string' ? data.mensaje : '',
        generadas: data?.preguntas_generadas ?? (data?.preguntas?.length || 0),
        conError: data?.preguntas_con_error ?? 0,
        preguntas: Array.isArray(data?.preguntas) ? data.preguntas : [],
        modelo: form.modelo,
      });
    } catch (err) {
      if (montadoRef.current) setErrorGeneracion(clasificarError(err));
    } finally {
      generandoRef.current = false;
      if (montadoRef.current) setGenerando(false);
    }
  };

  // ---------- Textos derivados ----------

  const contexto = [cargoElegido?.nombre, skillElegida?.nombre].filter(Boolean).join(' / ') || '—';
  const etiquetaModelo = etiqueta(MODELOS_IA, form.modelo);
  const costoEstimado = costoPromedio !== null && cantidad !== null ? costoPromedio * cantidad : null;

  const preguntasResultado = resultado?.preguntas || [];
  const costoTotal = sumar(preguntasResultado, 'costo_usd');
  const tokensEntrada = sumar(preguntasResultado, 'tokens_input');
  const tokensSalida = sumar(preguntasResultado, 'tokens_output');

  return (
    <div className="generar-preguntas">
      <div className="gp-container">
        <h1>Generar preguntas con IA</h1>
        <p className="gp-subtitle">
          Las preguntas generadas quedan <strong>pendientes</strong> hasta que un administrador las revise y apruebe.
        </p>

        <div className="cost-warning" role="note">
          <strong>Cada generación tiene un costo real en USD.</strong> Se cobra aunque después rechaces las preguntas,
          y también si la IA responde algo que no pasa la validación.
          {costoPromedio !== null && (
            <span className="cost-warning-ref">
              {' '}Referencia del último mes: {formatearUsd(costoPromedio)} por pregunta generada.
            </span>
          )}
        </div>

        <form onSubmit={abrirConfirmacion} className="gp-form" noValidate>
          <fieldset disabled={generando} className="gp-fieldset">
            <div className="gp-grid">
              <div className="form-group">
                <label htmlFor="gp-area">Área</label>
                <select id="gp-area" value={form.area} onChange={cambiar('area')} disabled={cargandoCargos || !!errorCargos}>
                  <option value="">Todas las áreas</option>
                  {areas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-cargo">
                  Cargo <span className="required">*</span>
                </label>
                <select id="gp-cargo" value={form.cargoId} onChange={cambiar('cargoId')} disabled={cargandoCargos || !!errorCargos}>
                  <option value="">{cargandoCargos ? 'Cargando cargos...' : 'Selecciona un cargo'}</option>
                  {cargosDelArea.map((c) => (
                    <option key={c.cargoId} value={c.cargoId}>
                      {form.area ? c.nombre : `${c.nombre} (${c.area})`}
                    </option>
                  ))}
                </select>
                {errorCargos && (
                  <div className="gp-inline-error">
                    {errorCargos}{' '}
                    <button type="button" className="gp-link-button" onClick={cargarCargos}>Reintentar</button>
                  </div>
                )}
              </div>

              <div className="form-group full-width">
                <label htmlFor="gp-skill">Skill (opcional)</label>
                <select id="gp-skill" value={form.skillId} onChange={cambiar('skillId')} disabled={!form.cargoId || cargandoSkills}>
                  <option value="">
                    {!form.cargoId ? 'Primero elige un cargo' : cargandoSkills ? 'Cargando skills...' : 'Todo el cargo (sin una skill concreta)'}
                  </option>
                  {skills.map((s) => (
                    <option key={s.skillId} value={s.skillId}>
                      {s.nombre} · {etiqueta(CATEGORIAS, s.categoria)}{s.obligatoria ? ' · obligatoria' : ''}
                    </option>
                  ))}
                </select>
                {errorSkills && <div className="gp-inline-error">{errorSkills}</div>}
                {form.cargoId && !cargandoSkills && !errorSkills && skills.length === 0 && (
                  <small className="form-help">Este cargo no tiene skills asociadas: se generará para el cargo completo.</small>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="gp-nivel">Nivel <span className="required">*</span></label>
                <select id="gp-nivel" value={form.nivel} onChange={cambiar('nivel')}>
                  {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-categoria">Categoría <span className="required">*</span></label>
                <select id="gp-categoria" value={form.categoria} onChange={cambiar('categoria')}>
                  {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-tipo">Tipo de pregunta <span className="required">*</span></label>
                <select id="gp-tipo" value={form.tipo} onChange={cambiar('tipo')}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-cantidad">Cantidad <span className="required">*</span></label>
                <input
                  id="gp-cantidad"
                  type="number"
                  min="1"
                  max={LIMITES.preguntasPorGeneracion}
                  step="1"
                  value={form.cantidad}
                  onChange={cambiar('cantidad')}
                />
                <small className="form-help">Entre 1 y {LIMITES.preguntasPorGeneracion} preguntas por generación.</small>
              </div>

              <div className="form-group full-width">
                <label htmlFor="gp-modelo">Modelo de IA <span className="required">*</span></label>
                <select id="gp-modelo" value={form.modelo} onChange={cambiar('modelo')}>
                  {MODELOS_IA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          {errorFormulario && <div className="error-message">{errorFormulario}</div>}

          {generando && (
            <div className="gp-progress" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <div>
                <strong>Generando {cantidad ?? ''} preguntas con {etiquetaModelo}... ({segundos} s)</strong>
                <p>Puede tardar hasta 1 minuto; no cierres ni recargues la página ni cambies de sección.</p>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/preguntas')} disabled={generando}>
              Volver al banco
            </button>
            <button type="submit" className="btn btn-primary" disabled={generando || cargandoCargos}>
              {generando ? 'Generando...' : 'Generar preguntas'}
            </button>
          </div>
        </form>

        {errorGeneracion && (
          <div className={`gp-result-error gp-result-error-${errorGeneracion.tipo}`} role="alert">
            <p className="gp-result-error-title">{errorGeneracion.mensaje}</p>
            {errorGeneracion.nota && <p>{errorGeneracion.nota}</p>}
            {errorGeneracion.tipo !== 'sin_costo' && (
              <div className="gp-result-actions">
                <Link to={RUTA_PENDIENTES_IA} className="btn btn-primary">Revisar pendientes</Link>
                <Link to="/informes" className="btn btn-secondary">Ver Costos IA</Link>
              </div>
            )}
          </div>
        )}

        {resultado && (
          <section className="gp-result" aria-label="Resultado de la generación">
            <div className="success-message">
              {resultado.mensaje || `Preguntas generadas: ${resultado.generadas}. Quedan pendientes de aprobación`}
            </div>

            <div className="gp-summary">
              <div><span>Generadas</span><strong>{resultado.generadas}</strong></div>
              {resultado.conError > 0 && <div><span>Con error</span><strong>{resultado.conError}</strong></div>}
              <div><span>Modelo</span><strong>{etiqueta(MODELOS_IA, resultado.modelo)}</strong></div>
              <div><span>Tokens (entrada / salida)</span><strong>{tokensEntrada ?? '—'} / {tokensSalida ?? '—'}</strong></div>
              <div className="total-cost"><span>Costo total</span><strong>{costoTotal === null ? '—' : formatearUsd(costoTotal)}</strong></div>
            </div>

            {preguntasResultado.length > 0 && (
              <div className="gp-table-wrapper">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Enunciado</th>
                      <th>Estado</th>
                      <th className="num">Tokens entrada</th>
                      <th className="num">Tokens salida</th>
                      <th className="num">Costo</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preguntasResultado.map((p, i) => (
                      <tr key={p.pregunta_id || i}>
                        <td>{i + 1}</td>
                        <td className="gp-enunciado">{p.enunciado}</td>
                        <td>
                          <span className={`gp-estado gp-estado-${p.estado}`}>{etiqueta(ESTADOS_PREGUNTA, p.estado)}</span>
                        </td>
                        <td className="num">{p.tokens_input ?? '—'}</td>
                        <td className="num">{p.tokens_output ?? '—'}</td>
                        <td className="num">{typeof p.costo_usd === 'number' ? formatearUsd(p.costo_usd) : '—'}</td>
                        <td>
                          {p.pregunta_id
                            ? <Link to={`/editar-pregunta/${p.pregunta_id}`} className="gp-link">Revisar / editar</Link>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td className="num">{tokensEntrada ?? '—'}</td>
                      <td className="num">{tokensSalida ?? '—'}</td>
                      <td className="num total-cost">{costoTotal === null ? '—' : formatearUsd(costoTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="gp-result-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate(RUTA_PENDIENTES_IA)}>
                Revisar pendientes
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setResultado(null)}>
                Cerrar resultado
              </button>
            </div>
          </section>
        )}
      </div>

      {modalAbierto && (
        <div className="modal-backdrop" onClick={cerrarModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gp-modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="gp-modal-titulo">Confirmar generación con IA</h2>
            <p>
              Esta acción llama a <strong>{etiquetaModelo}</strong> y genera un costo real en USD. Se generarán{' '}
              <strong>{cantidad}</strong> preguntas para <strong>{contexto}</strong>, nivel{' '}
              <strong>{etiqueta(NIVELES, form.nivel)}</strong>. ¿Continuar?
            </p>
            <ul className="gp-modal-detalle">
              <li>Categoría: {etiqueta(CATEGORIAS, form.categoria)}</li>
              <li>Tipo: {etiqueta(TIPOS, form.tipo)}</li>
              {costoEstimado !== null && (
                <li>
                  Referencia (promedio del último mes): unos {formatearUsd(costoEstimado)}. El costo real puede ser distinto.
                </li>
              )}
            </ul>
            <label className="checkbox-label gp-check">
              <input type="checkbox" checked={entiendeCosto} onChange={(e) => setEntiendeCosto(e.target.checked)} autoFocus />
              Entiendo que tiene costo
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cerrarModal}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={generar} disabled={!entiendeCosto || generando}>
                Generar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerarPreguntas;
