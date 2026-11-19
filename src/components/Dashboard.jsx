import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getUsers, contarPreguntas, getQuestions, getCostosIa, mensajeDeError, usuarioActual } from '../services/api';
import {
  CATEGORIAS, NIVELES, TIPO_CAMBIO_CLP, diaUtc, diasEntre, etiqueta, formatearDiaSinZona, formatearDiaUtc,
  formatearPesos, iniciales, tonoAvatar,
} from '../services/etiquetas';
import { leerTopeGeneracion, resumenCortoTope, textoTope, valorTextoMedidor } from '../services/topeGeneracion';
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

/** «Miércoles, 18 de noviembre», en la hora de Chile. */
const hoyEnChile = () => {
  const texto = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago',
  }).format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/** «admin@entrevistaapp.test» → «admin». */
const nombreCorto = (correo) => String(correo || '').split('@')[0] || 'admin';

/** Días enteros desde hoy (UTC) hasta un día AAAA-MM-DD (UTC). */
const diasHasta = (dia) => {
  const fin = Date.parse(`${dia}T00:00:00Z`);
  const hoy = Date.parse(`${diaUtc(0)}T00:00:00Z`);
  return Number.isFinite(fin) ? Math.round((fin - hoy) / 86_400_000) : null;
};

const PENDIENTES_VISIBLES = 5;
const USUARIOS_RECIENTES = 5;
const MAX_PUNTOS_USUARIOS = 24;

/** Error de un bloque: el texto lo dice; el ícono y el color solo lo acompañan. */
const ErrorMetrica = ({ children }) => (
  <p className="resumen-error">
    <Icono nombre="alerta" tamano={14} />
    <span>{children}</span>
  </p>
);

/** Dona del banco: aprobadas, pendientes y rechazadas sobre el total (SVG; el texto lo da la leyenda). */
const DonaBanco = ({ aprobadas, pendientes, rechazadas, total, colores }) => {
  const partes = [
    { valor: aprobadas, color: colores.aprobada },
    { valor: pendientes, color: colores.pendiente },
    { valor: rechazadas, color: colores.rechazada },
  ];
  const separacion = 1.5;
  let inicio = 0;
  return (
    <span className="resumen-dona" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="resumen-dona__svg">
        <circle cx="32" cy="32" r="26" className="resumen-dona__pista" />
        {partes.map((p, i) => {
          if (!total || !p.valor) return null;
          const largo = Math.max(0, (p.valor / total) * 100 - separacion);
          const arco = (
            <circle
              key={i}
              cx="32"
              cy="32"
              r="26"
              pathLength="100"
              stroke={p.color}
              strokeDasharray={`${largo} 100`}
              strokeDashoffset={-inicio}
              className="resumen-dona__arco"
            />
          );
          inicio += (p.valor / total) * 100;
          return arco;
        })}
      </svg>
      <span className="resumen-dona__centro">{total ? Math.round((aprobadas / total) * 100) : 0} %</span>
    </span>
  );
};

/** Medidor semicircular del tope del mes (role=meter, con su valor en palabras). */
const MedidorTope = ({ tope }) => {
  if (tope.desactivado) return null;
  return (
    <div
      className={`resumen-medidor resumen-medidor--${tope.nivel}`}
      role="meter"
      aria-label="Gasto del mes en generar preguntas con IA"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={tope.porcentaje}
      aria-valuetext={valorTextoMedidor(tope)}
    >
      <svg viewBox="0 0 236 128" className="resumen-medidor__svg" aria-hidden="true">
        <path d="M 18 118 A 100 100 0 0 1 218 118" pathLength="100" className="resumen-medidor__pista" />
        {tope.porcentaje > 0 && (
          <path
            d="M 18 118 A 100 100 0 0 1 218 118"
            pathLength="100"
            className="resumen-medidor__relleno"
            style={{ strokeDasharray: `${tope.porcentaje} 100` }}
          />
        )}
      </svg>
      <div className="resumen-medidor__valor" aria-hidden="true">
        <span className="resumen-medidor__cifra num">{formatearPesos(tope.gastado)}</span>
        <span className="resumen-medidor__de">
          de {formatearPesos(tope.tope)} · <span className="mono">{tope.porcentaje} %</span>
        </span>
      </div>
    </div>
  );
};

/** Globo del gráfico diario: oscuro, con el total y cada serie. */
const GloboGasto = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="resumen-globo">
      <p className="resumen-globo__dia mono">{formatearDiaUtc(label)}</p>
      <p className="resumen-globo__total">{formatearPesos(fila.total, 1)}</p>
      <p className="resumen-globo__fila">
        <span><i className="resumen-globo__marca" />Reportes</span>
        <b className="mono">{formatearPesos(fila.reportes, 1)}</b>
      </p>
      <p className="resumen-globo__fila">
        <span><i className="resumen-globo__marca resumen-globo__marca--2" />Generación</span>
        <b className="mono">{formatearPesos(fila.generacion, 1)}</b>
      </p>
    </div>
  );
};

/** Esqueleto mientras carga: la forma de la página, sin números. */
const EsqueletoResumen = () => (
  <div className="pila pila--grande" aria-hidden="true">
    <div className="metricas resumen-metricas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="metrica metrica--neutra">
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
  const yo = usuarioActual() || {};

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
      const total = d ? Number(d.costoUsd) || reportes + generacion : 0;
      // En pesos: el eje del gráfico se divide en montos redondos de pesos, no de dólares convertidos.
      return {
        fecha,
        reportes: reportes * TIPO_CAMBIO_CLP,
        generacion: generacion * TIPO_CAMBIO_CLP,
        total: total * TIPO_CAMBIO_CLP,
      };
    });
  }, [datos]);

  const resumenGasto = useMemo(() => {
    const conUso = costosPorDia.filter((d) => d.total > 0);
    return {
      reportes: costosPorDia.reduce((s, d) => s + d.reportes, 0),
      generacion: costosPorDia.reduce((s, d) => s + d.generacion, 0),
      promedio: conUso.length ? conUso.reduce((s, d) => s + d.total, 0) / conUso.length : 0,
      dias: conUso.length,
    };
  }, [costosPorDia]);

  const listo = !loading && datos;
  const numPendientes = listo && datos.pendientes.ok ? Number(datos.pendientes.valor?.total) || 0 : null;

  const encabezado = (
    <header className="resumen-cabecera">
      <div className="resumen-cabecera__textos">
        <p className="resumen-saludo">
          <span className="texto-fuerte">Hola, {nombreCorto(yo.correo)}</span>
          <span className="resumen-saludo__punto" aria-hidden="true" />
          <span>{hoyEnChile()}</span>
        </p>
        <div className="resumen-cabecera__titulo">
          <h1 className="encabezado-pagina__titulo">Resumen</h1>
          {numPendientes > 0 && (
            <Link to="/preguntas?estado=pendiente" className="resumen-pastilla">
              <span className="resumen-pulso" aria-hidden="true" />
              {numPendientes === 1 ? '1 pregunta espera tu revisión' : `${numero(numPendientes)} preguntas esperan tu revisión`}
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          )}
        </div>
        <p className="encabezado-pagina__descripcion">Usuarios, banco de preguntas y gasto de IA de los últimos 30 días.</p>
      </div>
      <div className="encabezado-pagina__acciones">
        <Link to="/generar-preguntas" className="boton">
          <Icono nombre="generar" className="resumen-icono-ia" />
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
    <p className="sr-only" role="status">{listo ? 'Resumen cargado.' : 'Cargando el resumen…'}</p>
  );

  if (!listo) {
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

  const listaPendientes = pendientes.ok && Array.isArray(pendientes.valor?.elementos) ? pendientes.valor.elementos : [];
  const numAprobadas = aprobadas.ok ? aprobadas.valor : null;
  const numRechazadas = rechazadas.ok ? rechazadas.valor : 0;
  const totalBanco = total.ok ? total.valor : null;

  const gasto = costos.valor?.total;
  // Tope de generación del mes (D23): viene en la misma respuesta de costos, sin otra petición. Sin él, no se muestra.
  const topeGeneracion = leerTopeGeneracion(costos.valor);
  const resumenTope = resumenCortoTope(topeGeneracion);
  const textosTope = textoTope(topeGeneracion);
  const diasReposicion = topeGeneracion?.fechaReposicion ? diasHasta(topeGeneracion.fechaReposicion) : null;
  const hayGastoDiario = costosPorDia.some((d) => d.total > 0);
  const primerDia = costosPorDia[0]?.fecha;
  const ultimoDia = costosPorDia[costosPorDia.length - 1]?.fecha;

  const colorEstado = { aprobada: paleta.series[2], pendiente: paleta.series[3], rechazada: paleta.peligro };
  const eje = {
    stroke: paleta.rejilla,
    tick: { fill: paleta.ejes, fontSize: 13, fontFamily: 'Geist Mono, ui-monospace, monospace' },
    tickLine: false,
    axisLine: false,
  };
  const claseInsigniaTope = {
    agotado: 'insignia--peligro', cerca: 'insignia--aviso', ok: 'insignia--exito', desactivado: '',
  };

  return (
    <div className="pagina resumen">
      {encabezado}
      {estadoCarga}

      {/* ---------- Números clave: cada uno lleva a su pantalla ---------- */}
      <section aria-labelledby="resumen-metricas-titulo">
        <h2 id="resumen-metricas-titulo" className="sr-only">Números clave</h2>
        <div className="metricas resumen-metricas">
          <Link to="/usuarios" className="metrica resumen-aparece" style={{ '--orden': 1 }}>
            <span className="metrica__etiqueta">
              <span className="metrica__icono" aria-hidden="true"><Icono nombre="usuarios" tamano={15} /></span>
              Usuarios
              <Icono nombre="flecha-derecha" tamano={14} className="resumen-ir" />
            </span>
            <span className="resumen-cuerpo">
              <span className="resumen-cuerpo__cifras">
                <span className="metrica__valor">{usuarios.ok ? numero(lista.length) : '—'}</span>
                {usuarios.ok && (
                  <span className="resumen-sub">
                    <span className="metrica__destacado">{contar(activos, 'activo', 'activos')}</span>
                    {' · '}{contar(inactivos, 'inactivo', 'inactivos')}
                  </span>
                )}
              </span>
              {usuarios.ok && lista.length > 0 && lista.length <= MAX_PUNTOS_USUARIOS && (
                <span className="resumen-puntos" aria-hidden="true">
                  {lista.map((u) => (
                    <i
                      key={u.usuarioId}
                      className={`resumen-punto${u.rol === 'admin' ? ' resumen-punto--admin' : ''}${u.estado === 'inactivo' ? ' resumen-punto--inactivo' : ''}`}
                    />
                  ))}
                </span>
              )}
            </span>
            {usuarios.ok ? (
              <span className="metrica__pie">
                <span className="resumen-clave"><i className="resumen-muestra resumen-muestra--admin" />{contar(admins, 'administrador', 'administradores')}</span>
                <span className="resumen-clave"><i className="resumen-muestra" />{contar(regulares, 'regular', 'regulares')}</span>
              </span>
            ) : (
              <ErrorMetrica>{usuarios.error}</ErrorMetrica>
            )}
          </Link>

          <Link to="/preguntas" className="metrica metrica--verde resumen-aparece" style={{ '--orden': 2 }}>
            <span className="metrica__etiqueta">
              <span className="metrica__icono" aria-hidden="true"><Icono nombre="check-circulo" tamano={15} /></span>
              Preguntas aprobadas
              <Icono nombre="flecha-derecha" tamano={14} className="resumen-ir" />
            </span>
            <span className="resumen-cuerpo">
              <span className="resumen-cuerpo__cifras">
                <span className="metrica__valor">
                  {aprobadas.ok ? numero(numAprobadas) : '—'}
                  {aprobadas.ok && totalBanco !== null && <span className="resumen-de">de {numero(totalBanco)}</span>}
                </span>
                {aprobadas.ok && (
                  <span className="resumen-sub">
                    <span className="metrica__destacado">{contar(numAprobadas, 'aprobada', 'aprobadas')}</span> en el banco
                  </span>
                )}
              </span>
              {aprobadas.ok && totalBanco > 0 && (
                <DonaBanco
                  aprobadas={numAprobadas}
                  pendientes={numPendientes || 0}
                  rechazadas={numRechazadas}
                  total={totalBanco}
                  colores={colorEstado}
                />
              )}
            </span>
            {aprobadas.ok && !total.ok ? (
              <span className="metrica__pie">Total del banco no disponible</span>
            ) : aprobadas.ok && totalBanco === 0 ? (
              <span className="metrica__pie">El banco todavía no tiene preguntas.</span>
            ) : aprobadas.ok ? (
              <span className="metrica__pie">
                {numPendientes !== null && (
                  <span className="resumen-clave"><i className="resumen-muestra resumen-muestra--pendiente" />{contar(numPendientes, 'pendiente', 'pendientes')}</span>
                )}
                {rechazadas.ok && (
                  <span className="resumen-clave"><i className="resumen-muestra resumen-muestra--rechazada" />{contar(numRechazadas, 'rechazada', 'rechazadas')}</span>
                )}
              </span>
            ) : (
              <ErrorMetrica>{aprobadas.error}</ErrorMetrica>
            )}
          </Link>

          <Link
            to="/preguntas?estado=pendiente"
            className={`metrica ${pendientes.ok && numPendientes === 0 ? 'metrica--verde' : 'metrica--ambar'} resumen-aparece`}
            style={{ '--orden': 3 }}
          >
            <span className="metrica__etiqueta">
              <span className="metrica__icono" aria-hidden="true"><Icono nombre="reloj" tamano={15} /></span>
              Pendientes de revisión
              <Icono nombre="flecha-derecha" tamano={14} className="resumen-ir" />
            </span>
            <span className="resumen-cuerpo">
              <span className="resumen-cuerpo__cifras">
                <span className="metrica__valor">{pendientes.ok ? numero(numPendientes) : '—'}</span>
                {pendientes.ok && (
                  <span className="resumen-sub">
                    {pendientesIa.ok
                      ? <span className="metrica__destacado">{contar(pendientesIa.valor, 'generada', 'generadas')} con IA</span>
                      : 'Origen IA no disponible'}
                  </span>
                )}
              </span>
              {pendientesIa.ok && pendientesIa.valor > 0 && (
                <span className="resumen-pila-ia" aria-hidden="true">
                  {Array.from({ length: Math.min(3, pendientesIa.valor) }, (_, i) => (
                    <span key={i}><Icono nombre="generar" tamano={15} /></span>
                  ))}
                </span>
              )}
            </span>
            {pendientes.ok ? (
              <span className="metrica__pie">
                {numPendientes > 0 ? (
                  <span className="resumen-clave metrica__destacado"><span className="resumen-pulso" aria-hidden="true" />Esperan tu revisión</span>
                ) : (
                  <span className="resumen-clave metrica__destacado">Al día</span>
                )}
              </span>
            ) : (
              <ErrorMetrica>{pendientes.error}</ErrorMetrica>
            )}
          </Link>

          <Link to="/informes" className="metrica metrica--coral resumen-aparece" style={{ '--orden': 4 }}>
            <span className="metrica__etiqueta">
              <span className="metrica__icono" aria-hidden="true"><Icono nombre="dinero" tamano={15} /></span>
              Gasto en IA (30 días)
              <Icono nombre="flecha-derecha" tamano={14} className="resumen-ir" />
            </span>
            <span className="resumen-cuerpo">
              <span className="resumen-cuerpo__cifras">
                <span className="metrica__valor">{costos.ok && gasto ? formatearPesos(gasto.costoUsd) : '—'}</span>
                {costos.ok && gasto && (
                  <span className="resumen-sub">
                    <span className="metrica__destacado">{contar(gasto.usos, 'uso', 'usos')}</span>
                    {' · '}{contar(gasto.fallidas, 'fallida', 'fallidas')}
                  </span>
                )}
              </span>
              {costos.ok && hayGastoDiario && (
                <span className="resumen-chispa" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={costosPorDia} margin={{ top: 4, right: 2, bottom: 0, left: 2 }} accessibilityLayer={false}>
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke={paleta.coral}
                        strokeWidth={1.75}
                        fill={paleta.coral}
                        fillOpacity={0.16}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </span>
              )}
            </span>
            {costos.ok && gasto ? (
              <span className="metrica__pie">
                {resumenTope ? (
                  <>
                    <span className={`resumen-clave resumen-tope resumen-tope--${topeGeneracion.nivel}`}>{resumenTope}</span>
                    {topeGeneracion.porcentaje !== null && (
                      <span className="resumen-mini-barra" aria-hidden="true">
                        <i style={{ transform: `scaleX(${topeGeneracion.porcentaje / 100})` }} />
                      </span>
                    )}
                  </>
                ) : (
                  <span className="resumen-clave">Reportes y preguntas generadas</span>
                )}
              </span>
            ) : (
              <ErrorMetrica>{costos.error || 'Respuesta de costos sin totales'}</ErrorMetrica>
            )}
          </Link>
        </div>
      </section>

      {/* ---------- Gasto por día y tope del mes ---------- */}
      <div className="resumen-fila resumen-fila--grafico">
        <section className="tarjeta resumen-aparece" style={{ '--orden': 5 }} aria-labelledby="resumen-gasto-titulo">
          <div className="resumen-tarjeta__cabecera">
            <div>
              <h2 id="resumen-gasto-titulo" className="resumen-tarjeta__titulo">Gasto de IA por día</h2>
              <p className="resumen-tarjeta__sub">
                Últimos 30 días{primerDia && ultimoDia && (
                  <> · <span className="mono">{formatearDiaUtc(primerDia).slice(0, 5)} al {formatearDiaUtc(ultimoDia).slice(0, 5)}</span></>
                )}
              </p>
            </div>
            {costos.ok && gasto && (
              <div className="resumen-total">
                <span className="resumen-total__cifra num">{formatearPesos(gasto.costoUsd)}</span>
                <span className="resumen-tarjeta__sub">{contar(gasto.usos, 'uso', 'usos')} · {contar(gasto.fallidas, 'fallida', 'fallidas')}</span>
              </div>
            )}
          </div>
          {!costos.ok ? (
            // El error ya se muestra (y se anuncia) en la métrica «Gasto en IA»: aquí no se repite.
            <div className="tarjeta__cuerpo"><p className="nota">No disponible.</p></div>
          ) : !hayGastoDiario ? (
            <div className="vacio resumen-vacio">
              <p className="vacio__titulo">Sin gasto en estos 30 días</p>
              <p>Cuando se evalúen entrevistas o se generen preguntas con IA, el gasto aparecerá aquí.</p>
            </div>
          ) : (
            <>
              <ul className="leyenda resumen-leyenda" aria-label="Series del gráfico">
                <li><span className="leyenda__marca" aria-hidden="true" />Reportes de entrevista <span className="mono texto-3">{formatearPesos(resumenGasto.reportes, 1)}</span></li>
                <li><span className="leyenda__marca leyenda__marca--2" aria-hidden="true" />Generación de preguntas <span className="mono texto-3">{formatearPesos(resumenGasto.generacion, 1)}</span></li>
              </ul>
              <div
                className="resumen-grafico"
                role="img"
                aria-label={`Gasto diario en IA de los últimos 30 días: total ${formatearPesos(gasto.costoUsd)}, con ${contar(resumenGasto.dias, 'día', 'días')} de uso y un promedio de ${formatearPesos(resumenGasto.promedio, 1)} esos días. El detalle está en Informes.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costosPorDia} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%" accessibilityLayer={false}>
                    <CartesianGrid vertical={false} stroke={paleta.rejilla} strokeDasharray="2 4" />
                    <XAxis dataKey="fecha" {...eje} tickFormatter={(f) => formatearDiaUtc(f).slice(0, 5)} minTickGap={28} />
                    <YAxis {...eje} tickFormatter={(v) => formatearPesos(v, 1)} width={64} />
                    <Tooltip content={<GloboGasto />} cursor={{ fill: paleta.cursor }} />
                    <Bar dataKey="reportes" name="Reportes de entrevista" stackId="g" fill={paleta.series[0]} stroke={paleta.superficie} strokeWidth={1} isAnimationActive={false} />
                    <Bar dataKey="generacion" name="Generación de preguntas" stackId="g" fill={paleta.series[1]} stroke={paleta.superficie} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    {resumenGasto.promedio > 0 && (
                      <ReferenceLine
                        y={resumenGasto.promedio}
                        stroke={paleta.texto}
                        strokeOpacity={0.45}
                        strokeDasharray="4 4"
                        label={{
                          value: `Promedio de los días con uso · ${formatearPesos(resumenGasto.promedio, 1)}`,
                          position: 'insideTopLeft',
                          fill: paleta.texto2,
                          fontSize: 13,
                        }}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>

        <section className="tarjeta resumen-tope-tarjeta resumen-aparece" style={{ '--orden': 6 }} aria-labelledby="resumen-tope-titulo">
          <div className="resumen-tarjeta__cabecera">
            <div>
              <h2 id="resumen-tope-titulo" className="resumen-tarjeta__titulo">Tope de generación del mes</h2>
              <p className="resumen-tarjeta__sub">Generación de preguntas con IA</p>
            </div>
            {textosTope && (
              <span className={`insignia insignia--punto ${claseInsigniaTope[topeGeneracion.nivel] || ''}`.trim()}>
                {textosTope.estado}
              </span>
            )}
          </div>
          {topeGeneracion ? (
            <>
              <MedidorTope tope={topeGeneracion} />
              <div className={`resumen-tope-nota resumen-tope-nota--${topeGeneracion.nivel}`}>
                {topeGeneracion.desactivado && <p className="texto-fuerte">{textosTope.titulo}</p>}
                <p>{textosTope.detalle}</p>
              </div>
              {!topeGeneracion.desactivado && (
                <dl className="resumen-tope-datos">
                  <div>
                    <dt>Usado</dt>
                    <dd className="num">{formatearPesos(topeGeneracion.gastado)} <span className="texto-3">de {formatearPesos(topeGeneracion.tope)}</span></dd>
                  </div>
                  <div>
                    <dt>Reposición</dt>
                    <dd>{diasReposicion === null ? '—' : diasReposicion <= 0 ? 'Hoy' : `en ${contar(diasReposicion, 'día', 'días')}`}</dd>
                  </div>
                </dl>
              )}
            </>
          ) : (
            <div className="tarjeta__cuerpo">
              <p className="nota">{costos.ok ? 'El servidor no informó el tope del mes.' : 'No disponible.'}</p>
            </div>
          )}
        </section>
      </div>

      {/* ---------- Pendientes y usuarios recientes ---------- */}
      <div className="resumen-fila resumen-fila--listas">
        <section className="tarjeta resumen-lista resumen-aparece" style={{ '--orden': 7 }} aria-labelledby="resumen-pendientes-titulo">
          <div className="resumen-tarjeta__cabecera">
            <div>
              <h2 id="resumen-pendientes-titulo" className="resumen-tarjeta__titulo">
                Preguntas por revisar
                {numPendientes > 0 && <span className="resumen-contador mono">{numero(numPendientes)}</span>}
              </h2>
              <p className="resumen-tarjeta__sub">Apruébalas o recházalas antes de que lleguen a las entrevistas.</p>
            </div>
            <span className="resumen-accesos">
              <Link to="/preguntas?estado=pendiente&generadaPorIa=true" className="resumen-ver resumen-ver--suave">Solo con IA</Link>
              <Link to="/preguntas?estado=pendiente" className="resumen-ver">
                Ver todas <Icono nombre="flecha-derecha" tamano={14} />
              </Link>
            </span>
          </div>
          {!pendientes.ok ? (
            // El error ya se muestra (y se anuncia) en la métrica «Pendientes de revisión»: aquí no se repite.
            <div className="tarjeta__cuerpo"><p className="nota">No disponible.</p></div>
          ) : listaPendientes.length === 0 ? (
            <div className="vacio resumen-vacio">
              <span className="chip-icono" aria-hidden="true"><Icono nombre="check" tamano={18} /></span>
              <p className="vacio__titulo">Todo al día</p>
              <p>No hay preguntas esperando revisión.</p>
            </div>
          ) : (
            <ul className="resumen-filas">
              {listaPendientes.map((p) => (
                <li key={p.id} className="resumen-pregunta">
                  <span className={`resumen-pregunta__icono${p.generadaPorIa ? ' resumen-pregunta__icono--ia' : ''}`} aria-hidden="true">
                    <Icono nombre={p.generadaPorIa ? 'generar' : 'preguntas'} tamano={16} />
                  </span>
                  <span className="resumen-pregunta__textos">
                    <span className="resumen-pregunta__enunciado" title={p.enunciado}>{p.enunciado}</span>
                    <span className="resumen-etiquetas">
                      <span className="resumen-etiqueta">{etiqueta(CATEGORIAS, p.categoria)}</span>
                      <span className="resumen-etiqueta">{etiqueta(NIVELES, p.nivel)}</span>
                      <span className={`resumen-etiqueta${p.generadaPorIa ? ' resumen-etiqueta--ia' : ''}`}>
                        {p.generadaPorIa ? 'Generada con IA' : 'Manual'}
                      </span>
                    </span>
                  </span>
                  <Link
                    to={`/editar-pregunta/${p.id}`}
                    className="boton boton--chico resumen-revisar"
                    aria-label={`Revisar la pregunta: ${p.enunciado}`}
                  >
                    Revisar <Icono nombre="flecha-derecha" tamano={14} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta resumen-lista resumen-aparece" style={{ '--orden': 8 }} aria-labelledby="resumen-usuarios-titulo">
          <div className="resumen-tarjeta__cabecera">
            <div>
              <h2 id="resumen-usuarios-titulo" className="resumen-tarjeta__titulo">Usuarios recientes</h2>
              <p className="resumen-tarjeta__sub">
                {usuarios.ok ? `Las últimas cuentas creadas · ${contar(lista.length, 'usuario', 'usuarios')} en total` : 'Las últimas cuentas creadas'}
              </p>
            </div>
            <span className="resumen-accesos">
              <Link to="/crear-usuario" className="resumen-ver resumen-ver--suave">Crear usuario</Link>
              <Link to="/usuarios" className="resumen-ver">
                Ver todos <Icono nombre="flecha-derecha" tamano={14} />
              </Link>
            </span>
          </div>
          {!usuarios.ok ? (
            // El error ya se muestra en la métrica «Usuarios».
            <div className="tarjeta__cuerpo"><p className="nota">No disponible.</p></div>
          ) : recientes.length === 0 ? (
            <div className="vacio resumen-vacio">
              <p className="vacio__titulo">Todavía no hay usuarios</p>
              <Link to="/crear-usuario">Crear el primero</Link>
            </div>
          ) : (
            <ul className="resumen-filas">
              {recientes.map((u) => (
                <li key={u.usuarioId} className="resumen-usuario">
                  <span
                    className={`avatar resumen-usuario__avatar ${u.nombre ? `avatar--tono-${tonoAvatar(u.correo)}` : 'avatar--neutro'}`}
                    aria-hidden="true"
                  >
                    {u.nombre ? iniciales(u.nombre) : <Icono nombre="usuarios" tamano={16} />}
                  </span>
                  <span className="resumen-usuario__textos">
                    <span className={`resumen-usuario__nombre truncar${u.nombre ? '' : ' texto-3'}`}>{u.nombre || 'Sin nombre'}</span>
                    <span className="resumen-usuario__correo truncar">{u.correo}</span>
                  </span>
                  <span className="resumen-usuario__lado">
                    {u.rol === 'admin' && <span className="insignia insignia--info">Admin</span>}
                    {u.estado === 'inactivo' && <span className="insignia">Inactivo</span>}
                    <span className="resumen-usuario__fecha mono">{formatearDiaSinZona(u.fechaCreacion)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
