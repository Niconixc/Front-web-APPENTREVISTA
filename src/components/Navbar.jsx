import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../services/api';
import './Navbar.css';

const Navbar = ({ setIsAuthenticated }) => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    logout();
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
        </div>

        <div className="navbar-user">
          <span className="user-email">{user.correo}</span>
          <button onClick={handleLogout} className="btn-logout">
            Cerrar Sesión
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
