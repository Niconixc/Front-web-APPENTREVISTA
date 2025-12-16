import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import './Login.css';

const Login = ({ setIsAuthenticated }) => {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(correo, contrasena);

      // Verificar que el usuario sea admin
      if (data.usuario.rol !== 'admin') {
        setError('Acceso denegado. Solo administradores pueden acceder.');
        setLoading(false);
        return;
      }

      // Guardar token y datos del usuario
      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.usuario));

      setIsAuthenticated(true);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error de login:', err);
      const errorMsg = err.response?.data?.error;
      // Aseguramos que sea string para no romper React (Error #31)
      if (typeof errorMsg === 'string') {
        setError(errorMsg);
      } else if (typeof errorMsg === 'object' && errorMsg !== null) {
        // Si es un objeto, intentamos mostrar su mensaje o lo pasamos a string
        setError(errorMsg.message || JSON.stringify(errorMsg));
      } else {
        setError('Error al iniciar sesión. Verifica tus credenciales.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Panel de Administración</h1>
        <p className="subtitle">Entrevista App</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              type="email"
              id="correo"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="contrasena">Contraseña</label>
            <input
              type="password"
              id="contrasena"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
