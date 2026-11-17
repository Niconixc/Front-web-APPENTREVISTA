import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getCargos, getCoberturaPreguntas, mensajeDeError } from '../services/api';
import { CATEGORIAS, NIVELES, etiqueta } from '../services/etiquetas';
import {
  celdaCobertura,
  formatearSincronizacion,
  prellenadoGenerar,
  resumenCobertura,
  rutaPendientesSkill,
} from '../services/cobertura';
import './CoberturaMercado.css';

const MINIMO_POR_DEFECTO = '5';
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mínimo válido (1 a 50) o null. */
const leerMinimo = (texto) => {
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
};

/** Lo que dice cada celda a un lector de pantalla (el color solo no basta). */
const TEXTO_ESTADO = {
  ok: 'alcanza el mínimo',
  revisar: 'faltan, pero las pendientes alcanzan',
  falta: 'faltan preguntas',
};

const sinSkills = (cargo) => !Array.isArray(cargo?.skills) || cargo.skills.length === 0;

/**
 * Cobertura del banco frente al mercado: por cada cargo, las skills que piden las ofertas de empleo y cuántas preguntas
 * aprobadas hay por nivel. Desde cada celda se abre Generar con IA ya preparado o el banco filtrado en las pendientes que
 * cuenta esa celda, que se pueden aprobar sin costo. Los filtros viven en la URL: volver desde Generar los conserva.
 */
const CoberturaMercado = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const cargoParam = searchParams.get('cargoId') || '';
  const cargoId = FORMATO_UUID.test(cargoParam) ? cargoParam : '';
  const minimoTexto = searchParams.get('minimo') ?? MINIMO_POR_DEFECTO;
  const soloIncompletos = searchParams.get('todos') !== '1';
  const minimo = leerMinimo(minimoTexto);

  const [cargos, setCargos] = useState([]);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const ultimaPeticion = useRef(0);

  const cambiarFiltro = (clave, valor, porDefecto = '') => {
    const nuevos = new URLSearchParams(searchParams);
    if (valor === porDefecto) nuevos.delete(clave); else nuevos.set(clave, valor);
    setSearchParams(nuevos, { replace: true });
  };

  useEffect(() => {
    let vigente = true;
    getCargos()
      .then((lista) => { if (vigente) setCargos(Array.isArray(lista) ? lista.filter((c) => c.activo !== false) : []); })
      .catch(() => { /* el filtro por cargo es opcional: sin la lista se ven todos */ });
    return () => { vigente = false; };
  }, []);

  const cargar = useCallback(async () => {
    if (minimo === null) return;
    const peticion = ++ultimaPeticion.current;
    setCargando(true);
    setError('');
    try {
      const respuesta = await getCoberturaPreguntas({ cargoId, minimo });
      if (peticion === ultimaPeticion.current) setDatos(respuesta);
    } catch (err) {
      if (peticion === ultimaPeticion.current) {
        setDatos(null);
        setError(mensajeDeError(err, 'No se pudo cargar la cobertura del banco'));
      }
    } finally {
      if (peticion === ultimaPeticion.current) setCargando(false);
    }
  }, [cargoId, minimo]);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => resumenCobertura(datos), [datos]);
  const cargosVisibles = useMemo(() => {
    const lista = Array.isArray(datos?.cargos) ? datos.cargos : [];
    // Un cargo sin skills del mercado no está "completo": se muestra siempre.
    return soloIncompletos && !cargoId ? lista.filter((c) => Number(c.preguntasFaltantes) > 0 || sinSkills(c)) : lista;
  }, [datos, soloIncompletos, cargoId]);

  const generar = (cargo, skill, nivel, cantidad) =>
    navigate('/generar-preguntas', {
      state: {
        prellenado: prellenadoGenerar(cargo, skill, nivel, cantidad),
        desde: 'cobertura',
        volverA: `${location.pathname}${location.search}`,
      },
    });

  const cargosOrdenados = useMemo(
    () => [...cargos].sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es')),
    [cargos]
  );

  const textoVacio = () => {
    if (resumen.cargos === 0) return 'No hay cargos activos en el catálogo.';
    return `Todos los cargos con skills del mercado tienen al menos ${datos.minimo} preguntas aprobadas por nivel en cada skill.`;
  };

  return (
    <div className="cobertura">
      <header className="cob-cabecera">
        <h1>Cobertura del banco</h1>
        <p className="cob-bajada">
          Las skills que piden las ofertas de empleo para cada cargo y cuántas preguntas <strong>aprobadas</strong> tiene el
          banco por nivel. Al generar desde aquí se intenta usar lo que piden esas ofertas.
        </p>
      </header>

      <div className="cob-filtros">
        <div className="cob-campo">
          <label htmlFor="cob-cargo">Cargo</label>
          <select id="cob-cargo" value={cargoId} onChange={(e) => cambiarFiltro('cargoId', e.target.value)}>
            <option value="">Todos los cargos</option>
            {cargoId && !cargos.some((c) => c.cargoId === cargoId) && <option value={cargoId}>Cargo seleccionado</option>}
            {cargosOrdenados.map((c) => <option key={c.cargoId} value={c.cargoId}>{c.nombre} ({c.area})</option>)}
          </select>
        </div>
        <div className="cob-campo cob-campo-chico">
          <label htmlFor="cob-minimo">Mínimo por nivel</label>
          <input
            id="cob-minimo"
            type="number"
            min="1"
            max="50"
            step="1"
            value={minimoTexto}
            onChange={(e) => cambiarFiltro('minimo', e.target.value, MINIMO_POR_DEFECTO)}
            aria-invalid={minimo === null}
            aria-describedby={minimo === null ? 'cob-minimo-error' : undefined}
          />
        </div>
        {!cargoId && (
          <label className="cob-check" htmlFor="cob-incompletos">
            <input
              id="cob-incompletos"
              type="checkbox"
              checked={soloIncompletos}
              onChange={(e) => cambiarFiltro('todos', e.target.checked ? '' : '1')}
            />
            Solo cargos a los que les faltan preguntas
          </label>
        )}
        <button type="button" className="cob-boton cob-boton-secundario" onClick={cargar} disabled={cargando || minimo === null}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      {minimo === null && <p id="cob-minimo-error" className="cob-error-campo">El mínimo debe ser un número entero entre 1 y 50.</p>}

      <p className="cob-estado-carga" role="status" aria-live="polite">
        {cargando ? 'Cargando la cobertura del banco…' : ''}
      </p>

      {error && (
        <div className="cob-alerta" role="alert">
          {error}{' '}
          <button type="button" className="cob-enlace" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {datos && (
        <div className="cob-resumen" aria-busy={cargando}>
          <div><span>Faltan</span><strong>{resumen.preguntasFaltantes}</strong><small>preguntas aprobadas</small></div>
          <div>
            <span>Cargos incompletos</span><strong>{resumen.cargosIncompletos}</strong>
            <small>de {resumen.cargos}{resumen.cargosSinSkills > 0 ? ` · ${resumen.cargosSinSkills} sin skills del mercado` : ''}</small>
          </div>
          <div>
            <span>Ofertas leídas</span>
            <strong className="cob-fecha">{formatearSincronizacion(datos.ultimaSincronizacionMercado)}</strong>
            <small>hora del servidor · se leen solas cada 7 días</small>
          </div>
        </div>
      )}

      {datos && !cargando && cargosVisibles.length === 0 && <p className="cob-vacio">{textoVacio()}</p>}

      {cargosVisibles.map((cargo) => {
        const vacio = sinSkills(cargo);
        const falta = Number(cargo.preguntasFaltantes) > 0;
        return (
          <section key={cargo.cargoId} className="cob-cargo" aria-labelledby={`cob-${cargo.cargoId}`}>
            <div className="cob-cargo-cabeza">
              <h2 id={`cob-${cargo.cargoId}`}>{cargo.nombre}</h2>
              <span className="cob-area">{cargo.area}</span>
              <span className={`cob-pill ${vacio ? 'cob-pill-sin' : falta ? 'cob-pill-falta' : 'cob-pill-ok'}`}>
                {vacio ? 'Sin skills del mercado' : falta ? `Faltan ${cargo.preguntasFaltantes} en ${cargo.skillsIncompletas} skills` : 'Completo'}
              </span>
            </div>

            {vacio ? (
              <p className="cob-vacio">
                El mercado todavía no tiene skills para este cargo: se completan en la próxima lectura semanal de ofertas.
                Mientras tanto no se puede saber qué preguntas le faltan.
              </p>
            ) : (
              <div className="cob-tabla-envoltura">
                <table className="cob-tabla">
                  <caption className="cob-solo-lector">Preguntas aprobadas por skill y nivel para {cargo.nombre}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Skill</th>
                      <th scope="col" className="cob-num">Peso</th>
                      {NIVELES.map((n) => <th key={n.value} scope="col">{n.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {cargo.skills.map((skill) => (
                      <tr key={skill.skillId}>
                        <th scope="row" className="cob-skill">
                          <span className="cob-skill-nombre">{skill.nombre}</span>
                          <span className="cob-skill-meta">
                            {etiqueta(CATEGORIAS, skill.categoria)}
                            {skill.obligatoria && <span className="cob-obligatoria">obligatoria</span>}
                          </span>
                        </th>
                        <td className="cob-num">{skill.peso}</td>
                        {NIVELES.map((n) => {
                          const celda = celdaCobertura(skill, n.value);
                          return (
                            <td key={n.value} className={`cob-celda cob-celda-${celda.estado}`}>
                              <span className="cob-conteo">
                                {celda.aprobadas}<small>/{datos.minimo}</small>
                                <span className="cob-solo-lector"> aprobadas, {TEXTO_ESTADO[celda.estado]}</span>
                              </span>
                              {celda.pendientes > 0 && (
                                <Link className="cob-enlace cob-pendientes" to={rutaPendientesSkill(skill.skillId, n.value, cargo.cargoId)}>
                                  {celda.pendientes} pendiente{celda.pendientes === 1 ? '' : 's'}
                                </Link>
                              )}
                              {celda.estado === 'falta' && (
                                <button
                                  type="button"
                                  className="cob-boton cob-boton-generar"
                                  onClick={() => generar(cargo, skill, n.value, celda.generar)}
                                  aria-label={`Generar ${celda.generar} preguntas de ${skill.nombre}, nivel ${n.label}`}
                                >
                                  Generar {celda.generar}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <p className="cob-nota">
        Cuentan las preguntas de la skill para este cargo y las de la skill sin cargo (las que la entrevista puede elegir).
        Las pendientes no se sirven hasta aprobarlas: si alcanzan, revisarlas no cuesta nada. Generar con IA tiene costo y
        las preguntas nuevas quedan pendientes.
      </p>
    </div>
  );
};

export default CoberturaMercado;
