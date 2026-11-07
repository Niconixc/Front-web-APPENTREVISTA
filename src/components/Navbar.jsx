import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logout, usuarioActual } from '../services/api';
import './Navbar.css';

const Navbar = ({ setIsAuthenticated }) => {
  const navigate = useNavigate();
  const user = usuarioActual() || {};
  const [saliendo, setSaliendo] = useState(false);

  const handleLogout = async () => {
    setSaliendo(true);
    await logout(); // revoca el refresh token en el servidor
    setIsAuthenticated(false);
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/dashboard" className="navbar-brand">
          📊 Panel de Administrador
        </Link>

        <div className="navbar-menu">
          <Link to="/dashboard" className="nav-link">
            Dashboard
          </Link>
          <Link to="/informes" className="nav-link">
            Informes y costos IA
          </Link>
          <Link to="/usuarios" className="nav-link">
            Usuarios
          </Link>
          <Link to="/crear-usuario" className="nav-link">
            Crear Usuario
          </Link>
          <Link to="/preguntas" className="nav-link">
            Preguntas
          </Link>
          <Link to="/crear-pregunta" className="nav-link">
            Crear Pregunta
          </Link>
          <Link to="/generar-preguntas" className="nav-link">
            Generar con IA
          </Link>
          <Link to="/codigos" className="nav-link">
            Códigos
          </Link>
        </div>

        <div className="navbar-user">
          <span className="user-email">{user.correo}</span>
          <button onClick={handleLogout} className="btn-logout" disabled={saliendo}>
            {saliendo ? 'Cerrando…' : 'Cerrar Sesión'}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
