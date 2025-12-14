import { useEffect, useState, useCallback } from 'react';
import { getInformeGestion, downloadInformeExcel, downloadInformeCsv } from '../services/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Informes.css';

const Informes = () => {
  const [stats, setStats] = useState({
    usuariosRegistrados: 0,
    usuariosActivos: 0,
    usuariosInactivos: 0,

    cargosDistintos: 0,
    areasDistintas: 0,
    suscripcionesActivas: 0,
    suscripcionesInactivas: 0,
    usuariosConPremium: 0,
    usuariosConFree: 0,
  });
  const [informe, setInforme] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInforme = useCallback(async () => {
    try {
      const informeData = await getInformeGestion();

      setStats({
        usuariosRegistrados: informeData.totales.usuariosRegistrados,
        usuariosActivos: informeData.totales.usuariosActivos,
        usuariosInactivos: informeData.totales.usuariosInactivos,

        cargosDistintos: informeData.totales.cargosDistintos,
        areasDistintas: informeData.totales.areasDistintas,
        suscripcionesActivas: informeData.totales.suscripcionesActivas,
        suscripcionesInactivas: informeData.totales.suscripcionesInactivas,
        usuariosConPremium: informeData.totales.usuariosConPremium,
        usuariosConFree: informeData.totales.usuariosConFree,
      });

      setInforme(informeData);
    } catch (error) {
      console.error('❌ Error al cargar informe:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownloadExcel = async () => {
    try {
      const blob = await downloadInformeExcel();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'informe_gestion.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Error al descargar excel:', error);
      alert('Error al descargar el archivo Excel');
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const blob = await downloadInformeCsv();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'informe_gestion.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      console.error('Error al descargar csv:', error);
      alert('Error al descargar el archivo CSV');
    }
  };

  useEffect(() => {
    fetchInforme();
  }, [fetchInforme]);

  if (loading) {
    return (
      <div className="informes">
        <div className="loading">Cargando informes...</div>
      </div>
    );
  }

  return (
    <div className="informes">
      <div className="informes-header">
        <h1>Informes de Gestión</h1>
        <p className="subtitle">Análisis detallado de usuarios y métricas del sistema</p>
        <div className="download-buttons">
          <button className="btn btn-primary" onClick={handleDownloadExcel}>
            📊 Descargar Excel
          </button>
          <button className="btn btn-secondary" onClick={handleDownloadCsv}>
            📄 Descargar CSV
          </button>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-icon">👥</div>
          <div className="summary-content">
            <h3>{stats.usuariosRegistrados}</h3>
            <p>Total Usuarios</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">✅</div>
          <div className="summary-content">
            <h3>{stats.usuariosActivos}</h3>
            <p>Usuarios Activos</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">❌</div>
          <div className="summary-content">
            <h3>{stats.usuariosInactivos}</h3>
            <p>Usuarios Inactivos</p>
          </div>
        </div>



        <div className="summary-card">
          <div className="summary-icon">💎</div>
          <div className="summary-content">
            <h3>{stats.usuariosConPremium}</h3>
            <p>Suscripciones Premium</p>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon">🔓</div>
          <div className="summary-content">
            <h3>{stats.usuariosConFree}</h3>
            <p>Plan Gratuito</p>
          </div>
        </div>
      </div>

      {/* Sección de Gráficos */}
      {informe && (
        <>
          <div className="charts-section">
            <h2>Análisis Visual</h2>

            <div className="charts-grid">
              {/* Gráfico de Usuarios Activos vs Inactivos */}
              <div className="chart-card">
                <h3>Estado de Usuarios</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Activos', value: stats.usuariosActivos },
                        { name: 'Inactivos', value: stats.usuariosInactivos }
                      ].filter(item => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#4ade80" />
                      <Cell fill="#f87171" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>



              {/* Gráfico de Suscripciones Premium vs Free */}
              <div className="chart-card">
                <h3>Suscripciones</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Premium', value: stats.usuariosConPremium },
                        { name: 'Free', value: stats.usuariosConFree }
                      ].filter(item => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#a855f7" />
                      <Cell fill="#94a3b8" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico de Estados de Suscripción */}
              <div className="chart-card">
                <h3>Estado de Suscripciones</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Activas', value: stats.suscripcionesActivas },
                        { name: 'Inactivas', value: stats.suscripcionesInactivas }
                      ].filter(item => item.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de barras: Personas por Cargo */}
            {informe.personasPorCargo.length > 0 && (
              <div className="chart-card-full">
                <h3>Distribución por Cargo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={informe.personasPorCargo}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="metaCargo" stroke="#fff" />
                    <YAxis stroke="#fff" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    <Bar dataKey="cantidadPersonas" fill="#8b5cf6" name="Cantidad de Personas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Tabla de Usuarios */}
          <div className="users-table-section">
            <h2>Lista de Usuarios</h2>
            <div className="table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Estado</th>
                    <th>Suscripción</th>
                    <th>Estado Suscripción</th>
                    <th>Área</th>
                    <th>Cargo Meta</th>
                    <th>Nivel</th>
                    <th>Fecha Registro</th>
                    <th>Último Login</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.usuarios.map((usuario) => (
                    <tr key={usuario.usuarioId}>
                      <td>{usuario.nombre || 'Sin nombre'}</td>
                      <td>{usuario.correo}</td>
                      <td>
                        <span className={`status-badge ${usuario.estado}`}>
                          {usuario.estado === 'activo' ? '✅ Activo' : '❌ Inactivo'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${usuario.planSuscripcion === 'free' || !usuario.planSuscripcion ? 'free' : 'premium'}`}>
                          {usuario.planSuscripcion ? (usuario.planSuscripcion === 'free' ? '🔓 Free' : '💎 Premium') : '🔓 Free'}
                        </span>
                      </td>
                      <td>
                        {usuario.estadoSuscripcion ? (
                          <span className={`status-badge ${usuario.estadoSuscripcion}`}>
                            {usuario.estadoSuscripcion === 'activa' ? '✅ Activa' : '❌ Inactiva'}
                          </span>
                        ) : '-'}
                      </td>
                      <td>{usuario.area || '-'}</td>
                      <td>{usuario.metaCargo || '-'}</td>
                      <td>{usuario.nivel || '-'}</td>
                      <td>{usuario.fechaCreacion ? new Date(usuario.fechaCreacion).toLocaleDateString() : '-'}</td>
                      <td>{usuario.fechaUltimoLogin ? new Date(usuario.fechaUltimoLogin).toLocaleDateString() : 'Nunca'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Informes;
