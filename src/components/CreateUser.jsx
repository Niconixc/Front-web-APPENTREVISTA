import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUser } from '../services/api';
import './CreateUser.css';

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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await createUser(formData);
      alert('Usuario creado exitosamente');
      navigate('/usuarios');
    } catch (err) {
      console.error('Error al crear usuario:', err);
      setError(
        err.response?.data?.error || 'Error al crear el usuario'
      );
    } finally {
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
                placeholder="••••••••"
                minLength={6}
              />
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
              />
            </div>

            <div className="form-group">
              <label htmlFor="rol">
                Rol <span className="required">*</span>
              </label>
              <select
                id="rol"
                name="rol"
                value={formData.rol}
                onChange={handleChange}
                required
              >
                <option value="user">Usuario Regular</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="idioma">
                Idioma <span className="required">*</span>
              </label>
              <select
                id="idioma"
                name="idioma"
                value={formData.idioma}
                onChange={handleChange}
                required
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="pt">Portugués</option>
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creando...' : 'Crear Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateUser;
