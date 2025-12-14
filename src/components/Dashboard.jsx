import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getUsers, getQuestions } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminUsers: 0,
    regularUsers: 0,
    totalQuestions: 0,
    activeQuestions: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [users, questionsData] = await Promise.all([
        getUsers(),
        getQuestions('size=10000')
      ]);

      const adminCount = users.filter((u) => u.rol === 'admin').length;
      const regularCount = users.filter((u) => u.rol === 'user').length;

      const questions = questionsData.items || questionsData || [];
      const activeCount = questions.filter((q) => q.activa !== false).length;

      setStats({
        totalUsers: users.length,
        adminUsers: adminCount,
        regularUsers: regularCount,
        totalQuestions: questions.length,
        activeQuestions: activeCount,
      });
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="welcome">Bienvenido al panel de administración</p>
      </div>

      {/* Métricas principales en 2 columnas */}
      <div className="main-stats">
        <div className="stat-card-large">
          <div className="stat-icon-large">👥</div>
          <div className="stat-content-large">
            <h2>{stats.totalUsers}</h2>
            <p>Total Usuarios</p>
            <div className="stat-detail">
              {stats.adminUsers} Admin · {stats.regularUsers} Regulares
            </div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-large">✅</div>
          <div className="stat-content-large">
            <h2>{stats.activeQuestions}</h2>
            <p>Preguntas Activas</p>
            <div className="stat-detail">
              {stats.totalQuestions} Total
            </div>
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
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
