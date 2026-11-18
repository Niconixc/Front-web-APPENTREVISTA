import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUser, mensajeDeError } from '../services/api';
import { LIMITES } from '../services/etiquetas';
import Icono from './Icono';
import './CreateUser.css';

const LARGO_MAXIMO_NOMBRE = 120;

// Idiomas que acepta V2 (UTILIDAD_VALIDACION_USUARIO: es, en, pt, fr, de).
const IDIOMAS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'pt', label: 'Portugués' },
  { value: 'fr', label: 'Francés' },
  { value: 'de', label: 'Alemán' },
];

const CreateUser = () => {
  const [formData, setFormData] = useState({
    correo: '',
    contrasena: '',
    nombre: '',
    rol: 'user',
    idioma: 'es',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validar = () => {
    const { contrasenaMinima: min, contrasenaMaxima: max } = LIMITES;
    if (!formData.correo.trim()) return 'Ingresa el correo electrónico';
    if (formData.contrasena.length < min) return `La contraseña debe tener al menos ${min} caracteres`;
    if (formData.contrasena.length > max) return `La contraseña no puede superar ${max} caracteres`;
    if (formData.nombre.trim().length > LARGO_MAXIMO_NOMBRE) {
      return `El nombre no puede superar ${LARGO_MAXIMO_NOMBRE} caracteres`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }

    setLoading(true);
    try {
      // Campos de SolicitudCrearUsuarioAdmin en V2. nombre vacío no se envía (undefined no viaja en el JSON).
      const data = await createUser({
        correo: formData.correo.trim(),
        contrasena: formData.contrasena,
        nombre: formData.nombre.trim() || undefined,
        rol: formData.rol,
        idioma: formData.idioma,
      });
      const mensaje = (data && typeof data.mensaje === 'string' && data.mensaje) || 'Usuario creado exitosamente';
      // UserList muestra este mensaje al volver (la respuesta trae 'id', no 'usuarioId').
      navigate('/usuarios', { state: { mensaje, nuevoId: data?.id ?? null } });
    } catch (err) {
      console.error('Error al crear usuario:', err);
      setError(mensajeDeError(err, 'Error al crear usuario'));
      setLoading(false);
    }
  };

  return (
    <div className="pagina pagina--angosta">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <p className="miga">
            <Link to="/usuarios">Usuarios</Link> / Crear
          </p>
          <h1 className="encabezado-pagina__titulo">Crear usuario</h1>
          <p className="encabezado-pagina__descripcion">Completa el formulario para agregar un usuario.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="tarjeta">
        <div className="tarjeta__cuerpo formulario">
          <div className="rejilla-campos">
            <div className="campo">
              <label htmlFor="correo" className="campo__etiqueta">
                Correo electrónico
              </label>
              <input
                type="email"
                id="correo"
                name="correo"
                value={formData.correo}
                onChange={handleChange}
                required
                autoComplete="off"
                placeholder="usuario@example.com"
              />
            </div>

            <div className="campo">
              <label htmlFor="contrasena" className="campo__etiqueta">
                Contraseña
              </label>
              <input
                type="password"
                id="contrasena"
                name="contrasena"
                value={formData.contrasena}
                onChange={handleChange}
                required
                autoComplete="new-password"
                minLength={LIMITES.contrasenaMinima}
                maxLength={LIMITES.contrasenaMaxima}
                aria-describedby="contrasena-ayuda"
              />
              <p id="contrasena-ayuda" className="campo__ayuda">
                Entre {LIMITES.contrasenaMinima} y {LIMITES.contrasenaMaxima} caracteres.
              </p>
            </div>

            <div className="campo campo--ancho">
              <label htmlFor="nombre" className="campo__etiqueta">
                Nombre completo <span className="campo__opcional">(opcional)</span>
              </label>
              <input
                type="text"
                id="nombre"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Juan Pérez"
                maxLength={LARGO_MAXIMO_NOMBRE}
              />
            </div>

            <div className="campo">
              <label htmlFor="rol" className="campo__etiqueta">
                Rol
              </label>
              <select id="rol" name="rol" value={formData.rol} onChange={handleChange} required>
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="campo">
              <label htmlFor="idioma" className="campo__etiqueta">
                Idioma
              </label>
              <select id="idioma" name="idioma" value={formData.idioma} onChange={handleChange} required>
                {IDIOMAS.map((idioma) => (
                  <option key={idioma.value} value={idioma.value}>
                    {idioma.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="aviso aviso--peligro" role="alert">
              <Icono nombre="alerta" className="aviso__icono" />
              <div className="aviso__contenido">{error}</div>
            </div>
          )}
        </div>

        <div className="tarjeta__pie crear-usuario-pie">
          <button type="button" onClick={() => navigate('/usuarios')} className="boton" disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={loading}>
            {loading ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateUser;
