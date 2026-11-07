import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, mensajeDeError } from '../services/api';
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
      // login() guarda la sesión y rechaza a quien no es admin (cerrándole la sesión recién creada).
      await login(correo, contrasena);
      setIsAuthenticated(true);
      navigate('/dashboard');
    } catch (err) {
      // Mensajes de V2: credenciales incorrectas (401), demasiados intentos (429), cuenta inactiva (403).
      setError(mensajeDeError(err, 'Error al iniciar sesión. Verifica tus credenciales.'));
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
