import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUsers } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminUsers: 0,
    regularUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const users = await getUsers();
      const adminCount = users.filter((u) => u.rol === 'admin').length;
      const regularCount = users.filter((u) => u.rol === 'user').length;

      setStats({
        totalUsers: users.length,
        adminUsers: adminCount,
        regularUsers: regularCount,
      });
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <p className="welcome">Bienvenido al panel de administración</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>{stats.totalUsers}</h3>
            <p>Total Usuarios</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔑</div>
          <div className="stat-content">
            <h3>{stats.adminUsers}</h3>
            <p>Administradores</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-content">
            <h3>{stats.regularUsers}</h3>
            <p>Usuarios Regulares</p>
          </div>
        </div>
      </div>

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
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
