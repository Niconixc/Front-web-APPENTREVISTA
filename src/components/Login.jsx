import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, mensajeDeError } from '../services/api';
import Icono from './Icono';
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
    <main className="acceso">
      <div className="acceso__contenido">
        <div className="tarjeta acceso__tarjeta">
          <div className="tarjeta__cuerpo acceso__cuerpo">
            <div className="acceso-marca">
              <span className="acceso-marca__logo" aria-hidden="true">
                E
              </span>
              <span className="acceso-marca__texto">EntrevistaApp</span>
            </div>

            <div className="acceso__textos">
              <h1 className="acceso__titulo">Panel de administración</h1>
              <p className="acceso__descripcion">Ingresa con tu cuenta de administrador.</p>
            </div>

            <form onSubmit={handleSubmit} className="formulario acceso__formulario">
              <div className="campo">
                <label htmlFor="correo" className="campo__etiqueta">
                  Correo electrónico
                </label>
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

              <div className="campo">
                <label htmlFor="contrasena" className="campo__etiqueta">
                  Contraseña
                </label>
                <input
                  type="password"
                  id="contrasena"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="aviso aviso--peligro" role="alert">
                  <Icono nombre="alerta" className="aviso__icono" />
                  <div className="aviso__contenido">{error}</div>
                </div>
              )}

              <button type="submit" className="boton boton--primario boton--bloque" disabled={loading}>
                {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Login;
