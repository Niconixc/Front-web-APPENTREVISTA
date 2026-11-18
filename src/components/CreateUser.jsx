import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUser, mensajeDeError } from '../services/api';
import { LIMITES } from '../services/etiquetas';
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

// CreateUser.css no tiene clase de ayuda; se usa un estilo mínimo en línea para no tocar la hoja compartida.
const estiloAyuda = { display: 'block', marginTop: '0.35rem', fontSize: '0.8rem', opacity: 0.7 };

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
    <div className="create-user">
      <div className="form-container">
        <h1>Crear Nuevo Usuario</h1>
        <p className="subtitle">Complete el formulario para agregar un usuario</p>

        <form onSubmit={handleSubmit} className="user-form">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="correo">
                Correo Electrónico <span className="required">*</span>
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

            <div className="form-group">
              <label htmlFor="contrasena">
                Contraseña <span className="required">*</span>
              </label>
              <input
                type="password"
                id="contrasena"
                name="contrasena"
                value={formData.contrasena}
                onChange={handleChange}
                required
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                minLength={LIMITES.contrasenaMinima}
                maxLength={LIMITES.contrasenaMaxima}
              />
              <small style={estiloAyuda}>
                Entre {LIMITES.contrasenaMinima} y {LIMITES.contrasenaMaxima} caracteres.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="nombre">Nombre Completo</label>
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

            <div className="form-group">
              <label htmlFor="rol">
                Rol <span className="required">*</span>
              </label>
              <select id="rol" name="rol" value={formData.rol} onChange={handleChange} required>
                <option value="user">Usuario Regular</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="idioma">
                Idioma <span className="required">*</span>
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

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate('/usuarios')}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateUser;
