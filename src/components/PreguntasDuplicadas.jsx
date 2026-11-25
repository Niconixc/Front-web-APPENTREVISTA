import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCargos, getDuplicadas, getSkillsDeCargo, mensajeDeError } from '../services/api';
import { CATEGORIAS, NIVELES, TIPOS, etiqueta, limpiarVacios } from '../services/etiquetas';
import {
  MOTIVO_DUPLICADA,
  UMBRALES,
  activasDelGrupo,
  duplicadasNoDisponible,
  idSugeridaConservar,
  leerBusquedaDeUrl,
  leerGruposDuplicadas,
  parametrosDuplicadas,
  porcentajeSimilitud,
  problemaBusquedaDuplicadas,
} from '../services/similitud';
import Icono from './Icono';
import { ListaParecidas, NotaParecido, useRechazoDuplicada } from './PreguntasParecidas';
import './PreguntasDuplicadas.css';

/** La búsqueda que queda en la URL (/duplicadas?cargoId=…): recargar o compartir el enlace repite la búsqueda. */
const aUrl = (b) => limpiarVacios({
  cargoId: b.cargoId, skillId: b.skillId, nivel: b.nivel, tipo: b.tipo, categoria: b.categoria, umbral: b.umbral,
});

const textoUsos = (n) => (n === 1 ? 'usada 1 vez' : `usada ${n} veces`);

/**
 * Limpiar el banco: grupos de preguntas parecidas entre sí dentro de un cargo o una skill, con nivel, tipo y
 * categoría. Para dejar una se rechazan las demás con motivo «duplicada». No llama a la IA ni tiene costo.
 */
const PreguntasDuplicadas = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(() => ({ area: '', ...leerBusquedaDeUrl(searchParams).busqueda }));
  const [problema, setProblema] = useState('');

  const [cargos, setCargos] = useState([]);
  const [cargandoCargos, setCargandoCargos] = useState(true);
  const [errorCargos, setErrorCargos] = useState('');
  const [skills, setSkills] = useState([]);
  const [cargandoSkills, setCargandoSkills] = useState(false);
  const [errorSkills, setErrorSkills] = useState('');

  const [resultado, setResultado] = useState(null); // {grupos, analizadas, busqueda}
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [noDisponible, setNoDisponible] = useState(false);
  const [exito, setExito] = useState('');
  const pedido = useRef(0);

  // ---------- Catálogo ----------

  const cargarCargos = useCallback(async () => {
    setCargandoCargos(true);
    setErrorCargos('');
    try {
      const lista = await getCargos();
      setCargos(Array.isArray(lista) ? lista.filter((c) => c.activo !== false) : []);
    } catch (err) {
      setErrorCargos(mensajeDeError(err, 'No se pudieron cargar los cargos'));
    } finally {
      setCargandoCargos(false);
    }
  }, []);

  useEffect(() => { cargarCargos(); }, [cargarCargos]);

  useEffect(() => {
    if (!form.cargoId) {
      setSkills([]);
      setErrorSkills('');
      return undefined;
    }
    let vigente = true;
    setCargandoSkills(true);
    setErrorSkills('');
    getSkillsDeCargo(form.cargoId)
      .then((matriz) => {
        if (!vigente) return;
        const lista = Array.isArray(matriz?.skills) ? [...matriz.skills] : [];
        lista.sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'));
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
  const nombreCargo = (id) => cargos.find((c) => c.cargoId === id)?.nombre || null;
  const nombreSkill = (id) => skills.find((s) => s.skillId === id)?.nombre || null;

  // ---------- Búsqueda ----------

  const buscar = useCallback(async (busqueda) => {
    const n = ++pedido.current;
    setBuscando(true);
    setError('');
    setExito('');
    setNoDisponible(false);
    try {
      const data = await getDuplicadas(parametrosDuplicadas(busqueda));
      if (n !== pedido.current) return;
      const analizadas = Number(data?.analizadas ?? data?.total);
      setResultado({
        grupos: leerGruposDuplicadas(data),
        analizadas: Number.isFinite(analizadas) ? analizadas : null,
        busqueda,
      });
    } catch (err) {
      if (n !== pedido.current) return;
      setResultado(null);
      if (duplicadasNoDisponible(err)) setNoDisponible(true);
      else setError(mensajeDeError(err, 'No se pudo buscar preguntas duplicadas'));
    } finally {
      if (n === pedido.current) setBuscando(false);
    }
  }, []);

  // La URL manda: al abrir un enlace con la búsqueda (o volver atrás) se busca sola.
  useEffect(() => {
    const { busqueda, buscar: lista } = leerBusquedaDeUrl(searchParams);
    if (!lista || problemaBusquedaDuplicadas(busqueda)) return;
    setForm((actual) => ({ ...actual, ...busqueda }));
    buscar(busqueda);
  }, [searchParams, buscar]);

  useEffect(() => () => { pedido.current += 1; }, []);

  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    setProblema('');
    setForm((prev) => {
      const siguiente = { ...prev, [campo]: valor };
      if (campo === 'area') {
        const cargo = cargos.find((c) => c.cargoId === prev.cargoId);
        if (cargo && valor && cargo.area !== valor) {
          siguiente.cargoId = '';
          siguiente.skillId = '';
        }
      }
      if (campo === 'cargoId') siguiente.skillId = '';
      if (campo === 'skillId') {
        const skill = skills.find((s) => s.skillId === valor);
        if (skill && CATEGORIAS.some((c) => c.value === skill.categoria)) siguiente.categoria = skill.categoria;
      }
      return siguiente;
    });
  };

  const alBuscar = (e) => {
    e.preventDefault();
    const falta = problemaBusquedaDuplicadas(form);
    if (falta) {
      setProblema(falta);
      return;
    }
    const nueva = new URLSearchParams(aUrl(form)).toString();
    if (nueva === searchParams.toString()) buscar(form); // misma búsqueda: la URL no cambia, se repite a mano
    else setSearchParams(aUrl(form));
  };

  // ---------- Rechazar por duplicada ----------

  const rechazo = useRechazoDuplicada((pregunta) => {
    setResultado((actual) => (actual
      ? {
        ...actual,
        grupos: actual.grupos.map((g) => ({
          ...g,
          preguntas: g.preguntas.map((p) => (p.id === pregunta.id ? { ...p, estado: 'rechazada' } : p)),
        })),
      }
      : actual));
    setExito(`Pregunta rechazada por duplicada: «${String(pregunta.enunciado || '').slice(0, 90)}»`);
  });

  const abrirRechazo = (grupo, pregunta) => {
    const sugerida = idSugeridaConservar(grupo);
    const otras = grupo.preguntas.filter((p) => p.id !== pregunta.id && p.estado !== 'rechazada');
    const queda = otras.find((p) => p.id === sugerida) || otras[0] || null;
    const usada = Number(pregunta.vecesUsada) > 0
      ? `Ya se ${textoUsos(pregunta.vecesUsada)} en entrevistas: rechazarla no cambia las que ya se rindieron (guardan su copia).`
      : '';
    rechazo.abrir(pregunta, queda ? { ...queda, similitud: grupo.similitudMaxima } : null, usada);
  };

  // ---------- Textos ----------

  const grupos = resultado?.grupos || [];
  const porRevisar = grupos.filter((g) => activasDelGrupo(g) > 1).length;
  const totalPreguntas = grupos.reduce((suma, g) => suma + g.preguntas.length, 0);
  const alcance = resultado
    ? [
      resultado.busqueda.skillId
        ? `Skill ${nombreSkill(resultado.busqueda.skillId) || 'elegida'}`
        : nombreCargo(resultado.busqueda.cargoId) || 'Cargo elegido',
      etiqueta(NIVELES, resultado.busqueda.nivel),
      etiqueta(TIPOS, resultado.busqueda.tipo),
      etiqueta(CATEGORIAS, resultado.busqueda.categoria),
      resultado.busqueda.umbral ? `parecido desde ${porcentajeSimilitud(resultado.busqueda.umbral)}` : 'parecido del servidor',
    ].join(' · ')
    : '';
  const sinContexto = !form.cargoId && !form.skillId;

  return (
    <div className="pagina dup-pagina">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <h1 className="encabezado-pagina__titulo">Preguntas duplicadas</h1>
          <p className="encabezado-pagina__descripcion">
            Busca preguntas parecidas entre sí dentro de un cargo o una skill y deja solo una. No llama a la IA ni tiene costo.
          </p>
        </div>
      </header>

      <form onSubmit={alBuscar} className="tarjeta dup-formulario" noValidate aria-describedby="dup-ayuda">
        <div className="tarjeta__cuerpo">
          <div className="dup-seccion">
            <h2 className="dup-seccion__titulo">Dónde buscar</h2>
            <div className="rejilla-campos dup-rejilla">
              <div className="campo">
                <label htmlFor="dup-area" className="campo__etiqueta">
                  Área <span className="campo__opcional">(opcional)</span>
                </label>
                <select id="dup-area" value={form.area} onChange={cambiar('area')} disabled={cargandoCargos || Boolean(errorCargos)}>
                  <option value="">Todas las áreas</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="dup-cargo" className="campo__etiqueta">Cargo</label>
                <select id="dup-cargo" value={form.cargoId} onChange={cambiar('cargoId')} disabled={cargandoCargos || Boolean(errorCargos)}>
                  <option value="">{cargandoCargos ? 'Cargando cargos...' : 'Elige un cargo'}</option>
                  {form.cargoId && !nombreCargo(form.cargoId) && !cargandoCargos && <option value={form.cargoId}>Cargo elegido</option>}
                  {cargosDelArea.map((c) => (
                    <option key={c.cargoId} value={c.cargoId}>{form.area ? c.nombre : `${c.nombre} (${c.area})`}</option>
                  ))}
                </select>
                {errorCargos && (
                  <div className="campo__error">
                    {errorCargos}{' '}
                    <button type="button" className="boton-enlace" onClick={cargarCargos}>Reintentar</button>
                  </div>
                )}
              </div>

              <div className="campo">
                <label htmlFor="dup-skill" className="campo__etiqueta">
                  Skill <span className="campo__opcional">(opcional)</span>
                </label>
                <select id="dup-skill" value={form.skillId} onChange={cambiar('skillId')} disabled={(!form.cargoId && !form.skillId) || cargandoSkills}>
                  <option value="">
                    {!form.cargoId ? 'Primero elige un cargo' : cargandoSkills ? 'Cargando skills...' : 'Todo el cargo (sin una skill concreta)'}
                  </option>
                  {form.skillId && !nombreSkill(form.skillId) && !cargandoSkills && <option value={form.skillId}>Skill elegida</option>}
                  {skills.map((s) => (
                    <option key={s.skillId} value={s.skillId}>{s.nombre} · {etiqueta(CATEGORIAS, s.categoria)}</option>
                  ))}
                </select>
                {errorSkills && <div className="campo__error">{errorSkills}</div>}
              </div>
            </div>
            <p className="nota nota--chica">
              Con una skill se comparan las preguntas de esa skill; sin ella, las del cargo. Hay que elegir un cargo o una
              skill para no comparar todo el banco contra todo.
            </p>
          </div>

          <div className="dup-seccion">
            <h2 className="dup-seccion__titulo">Qué preguntas</h2>
            <div className="rejilla-campos dup-rejilla dup-rejilla--cuatro">
              <div className="campo">
                <label htmlFor="dup-nivel" className="campo__etiqueta">Nivel</label>
                <select id="dup-nivel" value={form.nivel} onChange={cambiar('nivel')}>
                  {NIVELES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="dup-tipo" className="campo__etiqueta">Tipo</label>
                <select id="dup-tipo" value={form.tipo} onChange={cambiar('tipo')}>
                  {TIPOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="dup-categoria" className="campo__etiqueta">Categoría</label>
                <select id="dup-categoria" value={form.categoria} onChange={cambiar('categoria')}>
                  {CATEGORIAS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="dup-umbral" className="campo__etiqueta">Parecido mínimo</label>
                <select id="dup-umbral" value={form.umbral} onChange={cambiar('umbral')}>
                  {UMBRALES.map((o) => <option key={o.value || 'servidor'} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <p id="dup-ayuda" className="nota nota--chica">
              Se comparan hasta las 200 preguntas más recientes de ese alcance, del mismo nivel, tipo y categoría.
            </p>
          </div>

          {problema && (
            <div className="aviso aviso--peligro" role="alert">
              <Icono nombre="alerta" className="aviso__icono" />
              <p className="aviso__contenido">{problema}</p>
            </div>
          )}
        </div>
        <div className="tarjeta__pie dup-formulario__pie">
          {sinContexto && <span className="nota dup-formulario__falta">Elige un cargo o una skill para buscar.</span>}
          <button type="submit" className="boton boton--primario" disabled={buscando || sinContexto}>
            <Icono nombre="buscar" />
            {buscando ? 'Buscando...' : 'Buscar duplicadas'}
          </button>
        </div>
      </form>

      <p className={`dup-estado${buscando ? ' cargando' : ''}`} role="status" aria-live="polite">
        {buscando ? 'Buscando preguntas parecidas…' : ''}
      </p>

      {noDisponible && (
        <div className="aviso aviso--info" role="status">
          <Icono nombre="info" className="aviso__icono" />
          <div className="aviso__contenido">
            <p className="aviso__titulo">El servidor todavía no tiene la búsqueda de duplicadas.</p>
            <p>Llega con la versión del backend que detecta preguntas parecidas. Cuando esté desplegada, esta pantalla funciona sola.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="aviso aviso--peligro" role="alert">
          <Icono nombre="alerta" className="aviso__icono" />
          <div className="aviso__contenido">
            <p>{error}</p>
          </div>
        </div>
      )}

      {exito && (
        <div className="aviso aviso--exito" role="status">
          <Icono nombre="check-circulo" className="aviso__icono" />
          <div className="aviso__contenido">{exito}</div>
        </div>
      )}

      {!resultado && !buscando && !noDisponible && !error && (
        <div className="tarjeta vacio dup-vacio">
          <span className="chip-icono" aria-hidden="true"><Icono nombre="copiar" tamano={18} /></span>
          <p>Elige dónde buscar y pulsa «Buscar duplicadas». Para dejar una, se rechazan las demás con el motivo «{MOTIVO_DUPLICADA}».</p>
        </div>
      )}

      {resultado && (
        <section className="seccion" aria-labelledby="dup-resultado-titulo" aria-busy={buscando}>
          <div className="seccion__encabezado dup-resultado__encabezado">
            <div>
              <h2 id="dup-resultado-titulo" className="seccion__titulo">
                {grupos.length === 0
                  ? 'Sin preguntas parecidas'
                  : `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'} de preguntas parecidas`}
              </h2>
              <p className="seccion__descripcion">{alcance}</p>
            </div>
            {grupos.length > 0 && (
              <p className="dup-resultado__conteo num">
                <span className="mono">{totalPreguntas}</span> preguntas en grupos
                {resultado.analizadas !== null && <> · <span className="mono">{resultado.analizadas}</span> revisadas</>}
                {' · '}
                {porRevisar === 0 ? 'todo limpio' : `${porRevisar} por limpiar`}
              </p>
            )}
          </div>

          {grupos.length === 0 && (
            <div className="tarjeta vacio dup-vacio">
              <span className="chip-icono" aria-hidden="true"><Icono nombre="check" tamano={18} /></span>
              <p>No hay preguntas parecidas entre sí en este alcance. Con un parecido mínimo más bajo podrían aparecer más.</p>
            </div>
          )}

          {grupos.map((grupo, i) => {
            const activas = activasDelGrupo(grupo);
            const limpio = activas <= 1;
            const sugerida = limpio ? null : idSugeridaConservar(grupo);
            return (
              <section key={grupo.preguntas.map((p) => p.id).join('|') || i} className="tarjeta dup-grupo" aria-labelledby={`dup-grupo-${i}`}>
                <div className="dup-grupo__cabecera">
                  <h3 id={`dup-grupo-${i}`} className="dup-grupo__titulo">Grupo {i + 1}</h3>
                  {grupo.similitudMaxima !== null && (
                    <span className="dup-grupo__parecido mono">Parecido máximo {porcentajeSimilitud(grupo.similitudMaxima)}</span>
                  )}
                  <span className={`insignia insignia--punto ${limpio ? 'insignia--exito' : 'insignia--aviso'}`}>
                    {limpio ? 'Limpio' : `${activas} activas`}
                  </span>
                </div>
                <div className="dup-grupo__cuerpo">
                  <ListaParecidas
                    similares={grupo.preguntas}
                    etiquetaLista={`Preguntas del grupo ${i + 1}`}
                    extra={(p) => (p.id && p.id === sugerida ? <span className="insignia insignia--info">Sugerida para dejar</span> : null)}
                    lado={(p) => (
                      <>
                        {p.id && (
                          <Link to={`/editar-pregunta/${p.id}`} className="boton boton--chico">Abrir</Link>
                        )}
                        {p.id && p.estado !== 'rechazada' && !limpio && (
                          <button
                            type="button"
                            className="boton boton--chico boton--peligro-suave"
                            onClick={() => abrirRechazo(grupo, p)}
                            disabled={Boolean(rechazo.enviandoId)}
                          >
                            Rechazar por duplicada
                          </button>
                        )}
                      </>
                    )}
                  />
                </div>
              </section>
            );
          })}

          {grupos.length > 0 && <NotaParecido />}
        </section>
      )}

      {rechazo.elemento}
    </div>
  );
};

export default PreguntasDuplicadas;
