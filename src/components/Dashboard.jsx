import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getUsers, contarPreguntas, getCostosIa, mensajeDeError } from '../services/api';
import { formatearPesos } from '../services/etiquetas';
import { leerTopeGeneracion, resumenCortoTope } from '../services/topeGeneracion';
import Icono from './Icono';
import './Dashboard.css';

/** Resultado de Promise.allSettled → {ok, valor, error} con el error ya convertido a texto. */
const resultado = (r, porDefecto) =>
  r.status === 'fulfilled'
    ? { ok: true, valor: r.value, error: '' }
    : { ok: false, valor: null, error: mensajeDeError(r.reason, porDefecto) };

const numero = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '—');

/** «1 inactivo», «3 inactivos»: el número con la palabra en singular o plural. */
const contar = (n, singular, plural) => `${numero(n)} ${n === 1 ? singular : plural}`;

/** Accesos a las tareas de creación: la navegación general ya está en el menú lateral. */
const ACCESOS = [
  { a: '/crear-usuario', icono: 'usuario-mas', titulo: 'Crear usuario', detalle: 'Agregar un usuario nuevo al sistema' },
  { a: '/crear-pregunta', icono: 'pregunta-mas', titulo: 'Crear pregunta', detalle: 'Agregar una pregunta al banco' },
  {
    a: '/generar-preguntas',
    icono: 'generar',
    titulo: 'Generar preguntas con IA',
    detalle: 'Quedan pendientes de revisión hasta que se aprueben',
  },
];

/** Error de una métrica: el texto lo dice; el ícono y el color solo lo acompañan. */
const ErrorMetrica = ({ children }) => (
  <p className="resumen-error">
    <Icono nombre="alerta" tamano={14} />
    <span>{children}</span>
  </p>
);

const Dashboard = () => {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    // Cada petición por separado: si una falla, su tarjeta muestra el error y las demás siguen funcionando.
    const [usuarios, total, aprobadas, pendientes, rechazadas, pendientesIa, costos] = await Promise.allSettled([
      getUsers(),
      contarPreguntas({}),
      contarPreguntas({ estado: 'aprobada' }),
      contarPreguntas({ estado: 'pendiente' }),
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

  if (loading || !datos) {
    return (
      <div className="pagina">
        <p className="cargando cargando--bloque">Cargando…</p>
      </div>
    );
  }

  const { usuarios, total, aprobadas, pendientes, rechazadas, pendientesIa, costos } = datos;
  const lista = Array.isArray(usuarios.valor) ? usuarios.valor : [];
  const admins = lista.filter((u) => u.rol === 'admin').length;
  const regulares = lista.filter((u) => u.rol === 'user').length;
  const inactivos = lista.filter((u) => u.estado === 'inactivo').length;
  const gasto = costos.valor?.total;
  // Tope de generación del mes (D23): viene en la misma respuesta de costos, sin otra petición. Sin él, no se muestra.
  const topeGeneracion = leerTopeGeneracion(costos.valor);
  const resumenTope = resumenCortoTope(topeGeneracion);

  return (
    <div className="pagina">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <h1 className="encabezado-pagina__titulo">Resumen</h1>
          <p className="encabezado-pagina__descripcion">
            Usuarios, estado del banco de preguntas y gasto de IA de los últimos 30 días.
          </p>
        </div>
      </header>

      {/* Números clave */}
      <section aria-labelledby="resumen-metricas-titulo">
        <h2 id="resumen-metricas-titulo" className="sr-only">Números clave</h2>
        <div className="metricas">
          <div className="metrica">
            <p className="metrica__etiqueta">Usuarios</p>
            <p className="metrica__valor">{usuarios.ok ? numero(lista.length) : '—'}</p>
            {usuarios.ok ? (
              <p className="metrica__detalle">
                {contar(admins, 'admin', 'admins')} · {contar(regulares, 'regular', 'regulares')} · {contar(inactivos, 'inactivo', 'inactivos')}
              </p>
            ) : (
              <ErrorMetrica>{usuarios.error}</ErrorMetrica>
            )}
            <Link to="/usuarios" className="metrica__enlace resumen-enlace">
              Ver usuarios
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </div>

          <div className="metrica">
            <p className="metrica__etiqueta">Preguntas aprobadas</p>
            <p className="metrica__valor">{aprobadas.ok ? numero(aprobadas.valor) : '—'}</p>
            {aprobadas.ok ? (
              <p className="metrica__detalle">
                {total.ok ? `de ${numero(total.valor)} en total` : 'Total del banco no disponible'}
                {rechazadas.ok && rechazadas.valor > 0 ? ` · ${contar(rechazadas.valor, 'rechazada', 'rechazadas')}` : ''}
              </p>
            ) : (
              <ErrorMetrica>{aprobadas.error}</ErrorMetrica>
            )}
            <Link to="/preguntas" className="metrica__enlace resumen-enlace">
              Ver preguntas
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </div>

          <div className="metrica">
            <p className="metrica__etiqueta">Pendientes de revisión</p>
            <p className="metrica__valor">{pendientes.ok ? numero(pendientes.valor) : '—'}</p>
            {pendientes.ok ? (
              <p className="metrica__detalle">
                {pendientesIa.ok ? `${contar(pendientesIa.valor, 'generada', 'generadas')} con IA` : 'Origen IA no disponible'}
              </p>
            ) : (
              <ErrorMetrica>{pendientes.error}</ErrorMetrica>
            )}
            <Link to="/preguntas?estado=pendiente" className="metrica__enlace resumen-enlace">
              Revisar pendientes
              <Icono nombre="flecha-derecha" tamano={14} />
            </Link>
          </div>

          <div className="metrica">
            <p className="metrica__etiqueta">Gasto IA (30 días)</p>
            <p className="metrica__valor">{costos.ok && gasto ? formatearPesos(gasto.costoUsd) : '—'}</p>
            {costos.ok && gasto ? (
              <p className="metrica__detalle">
                {contar(gasto.usos, 'uso', 'usos')} (reportes + preguntas) · {contar(gasto.fallidas, 'fallida', 'fallidas')}
              </p>
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
          </div>
        </div>
      </section>

      <div className="resumen-columnas">
        {/* Lo que espera una decisión del administrador */}
        <section className="tarjeta" aria-labelledby="resumen-pendientes-titulo">
          <div className="tarjeta__encabezado">
            <h2 id="resumen-pendientes-titulo" className="tarjeta__titulo">Pendiente de revisión</h2>
            {pendientes.ok && (
              <span className={`insignia insignia--punto ${pendientes.valor > 0 ? 'insignia--aviso' : 'insignia--exito'}`}>
                {pendientes.valor > 0 ? `${numero(pendientes.valor)} por revisar` : 'Al día'}
              </span>
            )}
          </div>
          <div className="tarjeta__cuerpo">
            {pendientes.ok ? (
              <>
                <p className="nota">
                  {pendientes.valor > 0
                    ? 'Preguntas que esperan que un administrador las apruebe o las rechace.'
                    : 'No hay preguntas pendientes de revisión.'}
                </p>
                <dl className="datos">
                  <dt>Pendientes</dt>
                  <dd>{numero(pendientes.valor)}</dd>
                  <dt>Generadas con IA</dt>
                  <dd>{pendientesIa.ok ? numero(pendientesIa.valor) : 'No disponible'}</dd>
                </dl>
              </>
            ) : (
              // El error ya se muestra (y se anuncia) en la métrica «Pendientes de revisión»: aquí no se repite.
              <p className="nota">No disponible.</p>
            )}
          </div>
          <div className="tarjeta__pie resumen-pie">
            <Link to="/preguntas?estado=pendiente&generadaPorIa=true" className="boton boton--chico">
              Solo las generadas con IA
            </Link>
            <Link to="/preguntas?estado=pendiente" className="boton boton--primario boton--chico">
              Revisar pendientes
            </Link>
          </div>
        </section>

        <section className="tarjeta" aria-labelledby="resumen-accesos-titulo">
          <div className="tarjeta__encabezado">
            <h2 id="resumen-accesos-titulo" className="tarjeta__titulo">Accesos directos</h2>
          </div>
          <ul className="resumen-accesos">
            {ACCESOS.map((acceso) => (
              <li key={acceso.a}>
                <Link to={acceso.a} className="resumen-acceso">
                  <Icono nombre={acceso.icono} tamano={18} className="resumen-acceso__icono" />
                  <span className="resumen-acceso__textos">
                    <span className="resumen-acceso__titulo">{acceso.titulo}</span>
                    <span className="resumen-acceso__detalle">{acceso.detalle}</span>
                  </span>
                  <Icono nombre="chevron-derecha" className="resumen-acceso__flecha" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
