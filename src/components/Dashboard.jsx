import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getUsers, contarPreguntas, getQuestions, getCostosIa, mensajeDeError } from '../services/api';
import {
  CATEGORIAS, NIVELES, diasEntre, etiqueta, formatearDiaSinZona, formatearDiaUtc, formatearPesos, iniciales, tonoAvatar,
} from '../services/etiquetas';
import { leerTopeGeneracion, resumenCortoTope } from '../services/topeGeneracion';
import TopeGeneracionIa from './TopeGeneracionIa';
import Icono from './Icono';
import usePaletaGrafico from './usePaletaGrafico';
import './Dashboard.css';

/** Resultado de Promise.allSettled → {ok, valor, error} con el error ya convertido a texto. */
const resultado = (r, porDefecto) =>
  r.status === 'fulfilled'
    ? { ok: true, valor: r.value, error: '' }
    : { ok: false, valor: null, error: mensajeDeError(r.reason, porDefecto) };

const numero = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '—');

/** «1 inactivo», «3 inactivos»: el número con la palabra en singular o plural. */
const contar = (n, singular, plural) => `${numero(n)} ${n === 1 ? singular : plural}`;

/** Porcentaje de una parte (para el ancho de las barras apiladas). */
const pct = (parte, total) => (total > 0 ? (parte / total) * 100 : 0);

/** «Miércoles 18 de noviembre», en la hora de Chile. */
const hoyEnChile = () => {
  const texto = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago',
  }).format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const PENDIENTES_VISIBLES = 5;
const USUARIOS_RECIENTES = 5;

/** Error de un bloque: el texto lo dice; el ícono y el color solo lo acompañan. */
const ErrorMetrica = ({ children }) => (
  <p className="resumen-error">
    <Icono nombre="alerta" tamano={14} />
    <span>{children}</span>
  </p>
);

/** Esqueleto mientras carga: la forma de la página, sin números. */
const EsqueletoResumen = () => (
  <div className="pila pila--grande" aria-hidden="true">
    <div className="metricas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="metrica">
          <span className="esqueleto resumen-esq resumen-esq--etiqueta" />
          <span className="esqueleto resumen-esq resumen-esq--valor" />
          <span className="esqueleto resumen-esq resumen-esq--detalle" />
        </div>
      ))}
    </div>
    <div className="resumen-fila resumen-fila--grafico">
      <div className="tarjeta"><span className="esqueleto resumen-esq resumen-esq--grafico" /></div>
      <div className="tarjeta"><span className="esqueleto resumen-esq resumen-esq--grafico" /></div>
    </div>
  </div>
);

const Dashboard = () => {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const paleta = usePaletaGrafico();

  const fetchStats = useCallback(async () => {
    setLoading(true);
    // Cada petición por separado: si una falla, su bloque muestra el error y los demás siguen funcionando.
    const [usuarios, total, aprobadas, pendientes, rechazadas, pendientesIa, costos] = await Promise.allSettled([
      getUsers(),
      contarPreguntas({}),
      contarPreguntas({ estado: 'aprobada' }),
      // La primera página de pendientes da el total y las más recientes para la lista.
      getQuestions({ estado: 'pendiente', pagina: 1, tamano: PENDIENTES_VISIBLES }),
      contarPreguntas({ estado: 'rechazada' }),
      contarPreguntas({ estado: 'pendiente', generadaPorIa: 'true' }),
      getCostosIa({}),
    ]);

    setDatos({
      usuarios: resultado(usuarios, 'No se pudieron cargar los usuarios'),
      total: resultado(total, 'No se pudo contar el banco de preguntas'),
      aprobadas: resultado(aprobadas, 'No se pudieron contar las preguntas aprobadas'),
      pendientes: resultado(pendientes, 'No se pudieron contar las preguntas pendientes'),
      rechazadas: resultado(rechazadas, 'No se pudieron contar las preguntas rechazadas'),
      pendientesIa: resultado(pendientesIa, 'No se pudieron contar las preguntas generadas con IA'),
      costos: resultado(costos, 'No se pudo cargar el gasto de IA'),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const costosPorDia = useMemo(() => {
    const c = datos?.costos?.valor;
    if (!c?.desde || !c?.hasta) return [];
    const porFecha = new Map((c.porDia || []).map((d) => [d.fecha, d]));
    return diasEntre(c.desde, c.hasta).map((fecha) => {
      const d = porFecha.get(fecha);
      const reportes = Number(d?.reportes?.costoUsd) || 0;
      const generacion = Number(d?.generacionPreguntas?.costoUsd) || 0;
      return { fecha, reportes, generacion, total: d ? Number(d.costoUsd) || reportes + generacion : 0 };
    });
  }, [datos]);

  const encabezado = (
    <header className="encabezado-pagina">
      <div className="encabezado-pagina__textos">
        <p className="resumen-fecha">{hoyEnChile()}</p>
        <h1 className="encabezado-pagina__titulo">Resumen</h1>
        <p className="encabezado-pagina__descripcion">
          Usuarios, banco de preguntas y gasto de IA de los últimos 30 días.
        </p>
      </div>
      <div className="encabezado-pagina__acciones">
        <Link to="/generar-preguntas" className="boton">
          <Icono nombre="generar" />
          Generar con IA
        </Link>
        <Link to="/crear-pregunta" className="boton boton--primario">
          <Icono nombre="mas" />
          Crear pregunta
        </Link>
      </div>
    </header>
  );

  // La región de estado queda montada siempre: así se anuncia el cambio de «cargando» a «listo».
  const estadoCarga = (
    <p className="sr-only" role="status">{loading || !datos ? 'Cargando el resumen…' : 'Resumen cargado.'}</p>
  );

  if (loading || !datos) {
    return (
      <div className="pagina">
        {encabezado}
        {estadoCarga}
        <EsqueletoResumen />
      </div>
    );
  }

  const { usuarios, total, aprobadas, pendientes, rechazadas, pendientesIa, costos } = datos;
  const lista = Array.isArray(usuarios.valor) ? usuarios.valor : [];
  const admins = lista.filter((u) => u.rol === 'admin').length;
  const regulares = lista.filter((u) => u.rol === 'user').length;
  const inactivos = lista.filter((u) => u.estado === 'inactivo').length;
  const activos = lista.length - inactivos;
  const recientes = [...lista]
    .sort((a, b) => String(b.fechaCreacion || '').localeCompare(String(a.fechaCreacion || '')))
    .slice(0, USUARIOS_RECIENTES);

  const numPendientes = pendientes.ok ? Number(pendientes.valor?.total) || 0 : null;
  const listaPendientes = pendientes.ok && Array.isArray(pendientes.valor?.elementos) ? pendientes.valor.elementos : [];
  const numAprobadas = aprobadas.ok ? aprobadas.valor : null;
  const numRechazadas = rechazadas.ok ? rechazadas.valor : 0;
  const totalBanco = total.ok ? total.valor : null;

  const gasto = costos.valor?.total;
  // Tope de generación del mes (D23): viene en la misma respuesta de costos, sin otra petición. Sin él, no se muestra.
  const topeGeneracion = leerTopeGeneracion(costos.valor);
  const resumenTope = resumenCortoTope(topeGeneracion);
  const hayGastoDiario = costosPorDia.some((d) => d.total > 0);

  const tooltip = {
    contentStyle: {
      backgroundColor: paleta.superficie, border: `1px solid ${paleta.borde}`, borderRadius: 8, fontSize: 13,
    },
    labelStyle: { color: paleta.texto, fontWeight: 600 },
    itemStyle: { color: paleta.texto2 },
    cursor: { fill: paleta.cursor },
  };
  const eje = { stroke: paleta.rejilla, tick: { fill: paleta.ejes, fontSize: 12 }, tickLine: false };

  return (
    <div className="pagina">
      {encabezado}
      {estadoCarga}

      {/* ---------- Números clave ---------- */}
      <section aria-labelledby="resumen-metricas-titulo">
        <h2 id="resumen-metricas-titulo" className="sr-only">Números clave</h2>
        <div className="metricas resumen-metricas">
          <article className="metrica">
            <div className="metrica__cabecera">
              <p className="metrica__etiqueta">Usuarios</p>
              <span className="chip-icono" aria-hidden="true"><Icono nombre="usuarios" tamano={18} /></span>
            </div>
            <p className="metrica__valor">{usuarios.ok ? numero(lista.length) : '—'}</p>
            {usuarios.ok ? (
              <>
                <div className="barra-apilada" aria-hidden="true">
                  {activos > 0 && (
                    <span className="barra-apilada__parte barra-apilada__parte--3" style={{ width: `${pct(activos, lista.length)}%` }} />
                  )}
                  {inactivos > 0 && (
                    <span className="barra-apilada__parte barra-apilada__parte--4" style={{ width: `${pct(inactivos, lista.length)}%` }} />
                  )}
                </div>
                <ul className="leyenda">
                  <li><span className="leyenda__marca leyenda__marca--3" aria-hidden="true" />{contar(activos, 'activo', 'activos')}</li>
                  <li><span className="leyenda__marca leyenda__marca--4" aria-hidden="true" />{contar(inactivos, 'inactivo', 'inactivos')}</li>
                </ul>
                <p className="metrica__detalle">
                  {contar(admins, 'administrador', 'administradores')} · {contar(regulares, 'regular', 'regulares')}
                </p>
              </>
            ) : (
              <ErrorMetrica>{usuarios.error}</ErrorMetrica>
            )}
            <Link to="/usuarios" className="metrica__enlace resumen-enlace">
              Ver usuarios
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </article>

          <article className="metrica">
            <div className="metrica__cabecera">
              <p className="metrica__etiqueta">Preguntas aprobadas</p>
              <span className="chip-icono chip-icono--verde" aria-hidden="true"><Icono nombre="check-circulo" tamano={18} /></span>
            </div>
            <p className="metrica__valor">
              {aprobadas.ok ? numero(numAprobadas) : '—'}
              {aprobadas.ok && totalBanco !== null && <span className="resumen-de"> de {numero(totalBanco)}</span>}
            </p>
            {aprobadas.ok ? (
              totalBanco > 0 ? (
                <>
                  <div className="barra-apilada" aria-hidden="true">
                    {numAprobadas > 0 && (
                      <span className="barra-apilada__parte barra-apilada__parte--3" style={{ width: `${pct(numAprobadas, totalBanco)}%` }} />
                    )}
                    {numPendientes > 0 && (
                      <span className="barra-apilada__parte barra-apilada__parte--2" style={{ width: `${pct(numPendientes, totalBanco)}%` }} />
                    )}
                    {numRechazadas > 0 && (
                      <span className="barra-apilada__parte barra-apilada__parte--peligro" style={{ width: `${pct(numRechazadas, totalBanco)}%` }} />
                    )}
                  </div>
                  <ul className="leyenda">
                    <li><span className="leyenda__marca leyenda__marca--3" aria-hidden="true" />{contar(numAprobadas, 'aprobada', 'aprobadas')}</li>
                    {numPendientes !== null && (
                      <li><span className="leyenda__marca leyenda__marca--2" aria-hidden="true" />{contar(numPendientes, 'pendiente', 'pendientes')}</li>
                    )}
                    {rechazadas.ok && (
                      <li><span className="leyenda__marca leyenda__marca--peligro" aria-hidden="true" />{contar(numRechazadas, 'rechazada', 'rechazadas')}</li>
                    )}
                  </ul>
                </>
              ) : (
                <p className="metrica__detalle">{total.ok ? 'El banco todavía no tiene preguntas.' : 'Total del banco no disponible'}</p>
              )
            ) : (
              <ErrorMetrica>{aprobadas.error}</ErrorMetrica>
            )}
            <Link to="/preguntas" className="metrica__enlace resumen-enlace">
              Ver preguntas
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </article>

          <article className="metrica">
            <div className="metrica__cabecera">
              <p className="metrica__etiqueta">Pendientes de revisión</p>
              <span className="chip-icono chip-icono--ambar" aria-hidden="true"><Icono nombre="reloj" tamano={18} /></span>
            </div>
            <p className="metrica__valor">{pendientes.ok ? numero(numPendientes) : '—'}</p>
            {pendientes.ok ? (
              <>
                {numPendientes > 0 ? (
                  <span className="insignia insignia--punto insignia--aviso resumen-insignia">Esperan tu revisión</span>
                ) : (
                  <span className="insignia insignia--punto insignia--exito resumen-insignia">Al día</span>
                )}
                <p className="metrica__detalle">
                  {pendientesIa.ok ? `${contar(pendientesIa.valor, 'generada', 'generadas')} con IA` : 'Origen IA no disponible'}
                </p>
              </>
            ) : (
              <ErrorMetrica>{pendientes.error}</ErrorMetrica>
            )}
            <Link to="/preguntas?estado=pendiente" className="metrica__enlace resumen-enlace">
              Revisar pendientes
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </article>

          <article className="metrica">
            <div className="metrica__cabecera">
              <p className="metrica__etiqueta">Gasto en IA (30 días)</p>
              <span className="chip-icono chip-icono--violeta" aria-hidden="true"><Icono nombre="dinero" tamano={18} /></span>
            </div>
            <p className="metrica__valor">{costos.ok && gasto ? formatearPesos(gasto.costoUsd) : '—'}</p>
            {costos.ok && gasto ? (
              <>
                {hayGastoDiario && (
                  <div className="resumen-chispa" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={costosPorDia} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke={paleta.series[3]}
                          strokeWidth={1.75}
                          fill={paleta.series[3]}
                          fillOpacity={0.14}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="metrica__detalle">
                  {contar(gasto.usos, 'uso', 'usos')} (reportes + preguntas) · {contar(gasto.fallidas, 'fallida', 'fallidas')}
                </p>
              </>
            ) : (
              <ErrorMetrica>{costos.error || 'Respuesta de costos sin totales'}</ErrorMetrica>
            )}
            {resumenTope && (
              <p className={`metrica__detalle resumen-tope resumen-tope--${topeGeneracion.nivel}`}>{resumenTope}</p>
            )}
            <Link to="/informes" className="metrica__enlace resumen-enlace">
              Ver informe de costos
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </article>
        </div>
      </section>

      {/* ---------- Gasto por día y tope del mes ---------- */}
      <div className="resumen-fila resumen-fila--grafico">
        <section className="tarjeta" aria-labelledby="resumen-gasto-titulo">
          <div className="tarjeta__encabezado">
            <h2 id="resumen-gasto-titulo" className="tarjeta__titulo">Gasto de IA por día</h2>
            {costos.ok && gasto && <span className="texto-chico texto-2 num">{formatearPesos(gasto.costoUsd)} en 30 días</span>}
          </div>
          <div className="tarjeta__cuerpo">
            {!costos.ok ? (
              // El error ya se muestra (y se anuncia) en la métrica «Gasto en IA»: aquí no se repite.
              <p className="nota">No disponible.</p>
            ) : !hayGastoDiario ? (
              <div className="vacio resumen-vacio">
                <p className="vacio__titulo">Sin gasto en estos 30 días</p>
                <p>Cuando se evalúen entrevistas o se generen preguntas con IA, el gasto aparecerá aquí.</p>
              </div>
            ) : (
              <>
                <div
                  className="resumen-grafico"
                  role="img"
                  aria-label={`Gasto diario en IA de los últimos 30 días, separado en reportes de entrevista y generación de preguntas. Total: ${formatearPesos(gasto.costoUsd)}. El detalle está en Informes.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costosPorDia} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
                      <CartesianGrid vertical={false} stroke={paleta.rejilla} />
                      <XAxis dataKey="fecha" {...eje} tickFormatter={(f) => formatearDiaUtc(f).slice(0, 5)} minTickGap={24} />
                      <YAxis {...eje} tickFormatter={(v) => formatearPesos(v)} width={64} />
                      <Tooltip
                        {...tooltip}
                        labelFormatter={formatearDiaUtc}
                        formatter={(valor, nombre) => [formatearPesos(valor), nombre]}
                      />
                      <Bar dataKey="reportes" name="Reportes de entrevista" stackId="g" fill={paleta.series[0]} isAnimationActive={false} />
                      <Bar dataKey="generacion" name="Generación de preguntas" stackId="g" fill={paleta.series[1]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="leyenda" aria-hidden="true">
                  <li><span className="leyenda__marca" />Reportes de entrevista</li>
                  <li><span className="leyenda__marca leyenda__marca--2" />Generación de preguntas</li>
                </ul>
              </>
            )}
          </div>
        </section>

        <section className="tarjeta" aria-labelledby="resumen-tope-titulo">
          <div className="tarjeta__encabezado">
            <h2 id="resumen-tope-titulo" className="tarjeta__titulo">Tope de generación del mes</h2>
          </div>
          <div className="tarjeta__cuerpo">
            {topeGeneracion ? (
              <TopeGeneracionIa tope={topeGeneracion} />
            ) : (
              <p className="nota">{costos.ok ? 'El servidor no informó el tope del mes.' : 'No disponible.'}</p>
            )}
            <Link to="/informes" className="resumen-enlace texto-chico">
              Cómo se calcula
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </div>
        </section>
      </div>

      {/* ---------- Pendientes y usuarios recientes ---------- */}
      <div className="resumen-fila">
        <section className="tarjeta resumen-lista" aria-labelledby="resumen-pendientes-titulo">
          <div className="tarjeta__encabezado">
            <h2 id="resumen-pendientes-titulo" className="tarjeta__titulo">Preguntas por revisar</h2>
            {pendientes.ok && numPendientes > 0 && (
              <span className="insignia insignia--punto insignia--aviso">{numero(numPendientes)} en espera</span>
            )}
          </div>
          {!pendientes.ok ? (
            // El error ya se muestra (y se anuncia) en la métrica «Pendientes de revisión»: aquí no se repite.
            <div className="tarjeta__cuerpo"><p className="nota">No disponible.</p></div>
          ) : listaPendientes.length === 0 ? (
            <div className="vacio resumen-vacio">
              <span className="chip-icono chip-icono--verde" aria-hidden="true"><Icono nombre="check" tamano={18} /></span>
              <p className="vacio__titulo">Todo al día</p>
              <p>No hay preguntas esperando revisión.</p>
            </div>
          ) : (
            <ul className="filas">
              {listaPendientes.map((p) => (
                <li key={p.id} className="fila-item">
                  <span className={`chip-icono chip-icono--chico ${p.generadaPorIa ? 'chip-icono--violeta' : ''}`.trim()} aria-hidden="true">
                    <Icono nombre={p.generadaPorIa ? 'generar' : 'preguntas'} tamano={15} />
                  </span>
                  <span className="fila-item__textos">
                    <span className="fila-item__titulo resumen-enunciado" title={p.enunciado}>{p.enunciado}</span>
                    <span className="fila-item__detalle">
                      <span>{etiqueta(CATEGORIAS, p.categoria)} · {etiqueta(NIVELES, p.nivel)}</span>
                      <span>{p.generadaPorIa ? 'Generada con IA' : 'Manual'}</span>
                    </span>
                  </span>
                  <span className="fila-item__lado">
                    <Link
                      to={`/editar-pregunta/${p.id}`}
                      className="boton boton--chico"
                      aria-label={`Revisar la pregunta: ${p.enunciado}`}
                    >
                      Revisar
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="tarjeta__pie resumen-pie">
            <Link to="/preguntas?estado=pendiente&generadaPorIa=true" className="boton boton--chico boton--sutil">
              Solo las generadas con IA
            </Link>
            <Link to="/preguntas?estado=pendiente" className="boton boton--chico">
              Ver todas las pendientes
            </Link>
          </div>
        </section>

        <section className="tarjeta resumen-lista" aria-labelledby="resumen-usuarios-titulo">
          <div className="tarjeta__encabezado">
            <h2 id="resumen-usuarios-titulo" className="tarjeta__titulo">Usuarios recientes</h2>
            {usuarios.ok && <span className="texto-chico texto-2">{contar(lista.length, 'usuario', 'usuarios')} en total</span>}
          </div>
          {!usuarios.ok ? (
            // El error ya se muestra en la métrica «Usuarios».
            <div className="tarjeta__cuerpo"><p className="nota">No disponible.</p></div>
          ) : recientes.length === 0 ? (
            <div className="vacio resumen-vacio">
              <p className="vacio__titulo">Todavía no hay usuarios</p>
            </div>
          ) : (
            <ul className="filas">
              {recientes.map((u) => (
                <li key={u.usuarioId} className="fila-item">
                  <span className={`avatar avatar--tono-${tonoAvatar(u.correo)}`} aria-hidden="true">
                    {iniciales(u.nombre || u.correo)}
                  </span>
                  <span className="fila-item__textos">
                    <span className="fila-item__titulo truncar">{u.nombre || u.correo}</span>
                    <span className="fila-item__detalle">
                      {u.nombre && <span className="truncar">{u.correo}</span>}
                      <span className="num">Desde el {formatearDiaSinZona(u.fechaCreacion)}</span>
                    </span>
                  </span>
                  <span className="fila-item__lado">
                    {u.rol === 'admin' && <span className="insignia insignia--info">Admin</span>}
                    {u.estado === 'inactivo' && <span className="insignia">Inactivo</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="tarjeta__pie resumen-pie">
            <Link to="/crear-usuario" className="boton boton--chico boton--sutil">
              <Icono nombre="usuario-mas" />
              Crear usuario
            </Link>
            <Link to="/usuarios" className="boton boton--chico">
              Ver todos
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
