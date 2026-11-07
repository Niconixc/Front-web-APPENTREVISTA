import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getUsers, contarPreguntas, getCostosIa, mensajeDeError } from '../services/api';
import { formatearUsd } from '../services/etiquetas';
import './Dashboard.css';

/** Resultado de Promise.allSettled → {ok, valor, error} con el error ya convertido a texto. */
const resultado = (r, porDefecto) =>
  r.status === 'fulfilled'
    ? { ok: true, valor: r.value, error: '' }
    : { ok: false, valor: null, error: mensajeDeError(r.reason, porDefecto) };

const numero = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '—');

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
      <div className="dashboard">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  const { usuarios, total, aprobadas, pendientes, rechazadas, pendientesIa, costos } = datos;
  const lista = Array.isArray(usuarios.valor) ? usuarios.valor : [];
  const admins = lista.filter((u) => u.rol === 'admin').length;
  const regulares = lista.filter((u) => u.rol === 'user').length;
  const inactivos = lista.filter((u) => u.estado === 'inactivo').length;
  const gasto = costos.valor?.total;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="welcome">Bienvenido al panel de administración</p>
      </div>

      {/* Métricas principales */}
      <div className="main-stats">
        <div className="stat-card-large">
          <div className="stat-icon-large">👥</div>
          <div className="stat-content-large">
            <h2>{usuarios.ok ? numero(lista.length) : '—'}</h2>
            <p>Usuarios</p>
            {usuarios.ok ? (
              <div className="stat-detail">
                {numero(admins)} Admin · {numero(regulares)} Regulares · {numero(inactivos)} inactivos
              </div>
            ) : (
              <div className="stat-error">{usuarios.error}</div>
            )}
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-large">✅</div>
          <div className="stat-content-large">
            <h2>{aprobadas.ok ? numero(aprobadas.valor) : '—'}</h2>
            <p>Preguntas aprobadas</p>
            {aprobadas.ok ? (
              <div className="stat-detail">
                {total.ok ? `de ${numero(total.valor)} en total` : 'Total del banco no disponible'}
                {rechazadas.ok && rechazadas.valor > 0 ? ` · ${numero(rechazadas.valor)} rechazadas` : ''}
              </div>
            ) : (
              <div className="stat-error">{aprobadas.error}</div>
            )}
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-large">🕒</div>
          <div className="stat-content-large">
            <h2>{pendientes.ok ? numero(pendientes.valor) : '—'}</h2>
            <p>Pendientes de revisión</p>
            {pendientes.ok ? (
              <div className="stat-detail">
                {pendientesIa.ok ? `${numero(pendientesIa.valor)} generadas con IA` : 'Origen IA no disponible'}
              </div>
            ) : (
              <div className="stat-error">{pendientes.error}</div>
            )}
            <Link to="/preguntas?estado=pendiente" className="stat-link">Revisar pendientes →</Link>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-large">💵</div>
          <div className="stat-content-large">
            <h2 className="stat-value-money">{costos.ok && gasto ? formatearUsd(gasto.costoUsd) : '—'}</h2>
            <p>Gasto IA (30 días)</p>
            {costos.ok && gasto ? (
              <div className="stat-detail">
                {numero(gasto.usos)} usos (reportes + preguntas) · {numero(gasto.fallidas)} fallidas
              </div>
            ) : (
              <div className="stat-error">{costos.error || 'Respuesta de costos sin totales'}</div>
            )}
            <Link to="/informes" className="stat-link">Ver informe de costos →</Link>
          </div>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <div className="quick-actions">
        <h2>Acciones Rápidas</h2>
        <div className="actions-grid">
          <Link to="/usuarios" className="action-card">
            <div className="action-icon">📋</div>
            <h3>Ver Usuarios</h3>
            <p>Gestionar lista de usuarios</p>
          </Link>

          <Link to="/crear-usuario" className="action-card">
            <div className="action-icon">➕</div>
            <h3>Crear Usuario</h3>
            <p>Agregar nuevo usuario al sistema</p>
          </Link>

          <Link to="/preguntas" className="action-card">
            <div className="action-icon">📝</div>
            <h3>Ver Preguntas</h3>
            <p>Gestionar banco de preguntas</p>
          </Link>

          <Link to="/crear-pregunta" className="action-card">
            <div className="action-icon">✏️</div>
            <h3>Crear Pregunta</h3>
            <p>Agregar nueva pregunta al banco</p>
          </Link>

          <Link to="/generar-preguntas" className="action-card">
            <div className="action-icon">🤖</div>
            <h3>Generar con IA</h3>
            <p>Crear preguntas con IA (quedan pendientes de revisión)</p>
          </Link>

          <Link to="/preguntas?estado=pendiente&generadaPorIa=true" className="action-card">
            <div className="action-icon">🔍</div>
            <h3>Revisar pendientes</h3>
            <p>Aprobar o rechazar las preguntas generadas con IA</p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
