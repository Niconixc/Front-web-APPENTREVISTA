import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getUsers,
  updateUserRole,
  deleteUser,
  activateUser,
  resetPassword,
  mensajeDeError,
  usuarioActual,
} from '../services/api';
import { LIMITES, formatearFecha } from '../services/etiquetas';
import './UserList.css';

const IDIOMAS = { es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', de: 'Alemán' };

// UserList.css no define estilo para botones deshabilitados; se marca aquí para no tocar la hoja de estilos compartida.
const estiloDeshabilitado = { opacity: 0.4, cursor: 'not-allowed' };

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [procesando, setProcesando] = useState(null);
  const temporizadores = useRef({});
  const location = useLocation();
  const navigate = useNavigate();

  const miUsuarioId = usuarioActual()?.usuarioId ?? null;

  /** Muestra un aviso por unos segundos sin que un temporizador viejo borre uno nuevo. */
  const avisar = useCallback((tipo, texto, ms = 4000) => {
    const asignar = tipo === 'error' ? setError : setSuccessMessage;
    clearTimeout(temporizadores.current[tipo]);
    asignar(texto);
    temporizadores.current[tipo] = setTimeout(() => asignar(''), ms);
  }, []);

  useEffect(() => {
    const actuales = temporizadores.current;
    return () => Object.values(actuales).forEach(clearTimeout);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      setError(mensajeDeError(err, 'Error al cargar usuarios'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Mensaje que deja CreateUser al volver (ej. 'Usuario creado exitosamente'); se limpia del historial.
  useEffect(() => {
    const mensaje = location.state?.mensaje;
    if (typeof mensaje === 'string' && mensaje) {
      avisar('success', mensaje);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, avisar]);

  /** Ejecuta una acción sobre un usuario con bloqueo de doble clic y mensajes de V2. */
  const ejecutar = async (usuarioId, accion, exitoPorDefecto, errorPorDefecto, recargar = true) => {
    setProcesando(usuarioId);
    try {
      const data = await accion();
      avisar('success', (data && typeof data.mensaje === 'string' && data.mensaje) || exitoPorDefecto);
      if (recargar) await fetchUsers();
    } catch (err) {
      console.error(errorPorDefecto, err);
      avisar('error', mensajeDeError(err, errorPorDefecto), 6000);
    } finally {
      setProcesando(null);
    }
  };

  const handleChangeRole = (user) => {
    const newRole = user.rol === 'admin' ? 'user' : 'admin';
    if (user.usuarioId === miUsuarioId && user.rol === 'admin') {
      avisar('error', 'No puedes quitarte el rol de administrador a ti mismo', 6000);
      return;
    }
    if (!window.confirm(`¿Cambiar el rol de ${user.correo} de ${user.rol} a ${newRole}?`)) return;
    ejecutar(
      user.usuarioId,
      () => updateUserRole(user.usuarioId, newRole),
      `Rol actualizado a ${newRole}`,
      'Error al cambiar el rol'
    );
  };

  const handleDeactivateUser = (user) => {
    if (user.usuarioId === miUsuarioId) {
      avisar('error', 'No puedes desactivar tu propia cuenta', 6000);
      return;
    }
    if (!window.confirm(`¿Desactivar a ${user.correo}?\n\nSe desactivará la cuenta y se cerrarán todas sus sesiones.`)) return;
    ejecutar(user.usuarioId, () => deleteUser(user.usuarioId), 'Usuario desactivado', 'Error al desactivar usuario');
  };

  const handleActivateUser = (user) => {
    if (!window.confirm(`¿Activar a ${user.correo}?`)) return;
    ejecutar(user.usuarioId, () => activateUser(user.usuarioId), 'Usuario activado', 'Error al activar usuario');
  };

  const handleResetPassword = (user) => {
    const { contrasenaMinima: min, contrasenaMaxima: max } = LIMITES;
    const nuevaContrasena = window.prompt(
      `Nueva contraseña para ${user.correo} (mínimo ${min} caracteres, máximo ${max}).\n\n` +
        'Al cambiarla se cerrarán todas las sesiones abiertas de este usuario.'
    );
    if (!nuevaContrasena) return;

    if (nuevaContrasena.length < min) {
      avisar('error', `La contraseña debe tener al menos ${min} caracteres`, 6000);
      return;
    }
    if (nuevaContrasena.length > max) {
      avisar('error', `La contraseña no puede superar ${max} caracteres`, 6000);
      return;
    }
    if (!window.confirm(`¿Confirmas el cambio de contraseña de ${user.correo}? Se cerrarán todas sus sesiones.`)) return;

    ejecutar(
      user.usuarioId,
      () => resetPassword(user.usuarioId, nuevaContrasena),
      'Contraseña actualizada',
      'Error al cambiar la contraseña',
      false
    );
  };

  if (loading) {
    return (
      <div className="user-list">
        <div className="loading">Cargando usuarios...</div>
      </div>
    );
  }

  return (
    <div className="user-list">
      <div className="header">
        <h1>Gestión de Usuarios</h1>
        <p className="subtitle">Total: {users.length} usuarios</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Correo</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Idioma</th>
              <th>Fecha Creación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const esPropio = user.usuarioId === miUsuarioId;
              const ocupado = procesando === user.usuarioId;
              const bloquearRol = esPropio && user.rol === 'admin';
              const tituloRol = bloquearRol
                ? 'No puedes quitarte el rol de administrador a ti mismo'
                : user.rol === 'admin'
                  ? 'Cambiar a usuario'
                  : 'Cambiar a admin';

              return (
                <tr key={user.usuarioId}>
                  <td>
                    {user.correo}
                    {esPropio && <span className="subtitle"> (tú)</span>}
                  </td>
                  <td>{user.nombre ?? '-'}</td>
                  <td>
                    <span className={`badge badge-${user.rol}`}>{user.rol}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${user.estado}`}>{user.estado}</span>
                  </td>
                  <td>{IDIOMAS[user.idioma] ?? user.idioma ?? '-'}</td>
                  <td>{formatearFecha(user.fechaCreacion)}</td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => handleChangeRole(user)}
                        className="btn btn-sm btn-primary"
                        title={tituloRol}
                        aria-label={tituloRol}
                        disabled={ocupado || bloquearRol}
                        style={ocupado || bloquearRol ? estiloDeshabilitado : undefined}
                      >
                        {user.rol === 'admin' ? '👤' : '🔑'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPassword(user)}
                        className="btn btn-sm btn-warning"
                        title="Cambiar contraseña (cierra sus sesiones)"
                        aria-label="Cambiar contraseña"
                        disabled={ocupado}
                        style={ocupado ? estiloDeshabilitado : undefined}
                      >
                        🔒
                      </button>
                      {user.estado === 'activo' ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivateUser(user)}
                          className="btn btn-sm btn-danger"
                          title={esPropio ? 'No puedes desactivar tu propia cuenta' : 'Desactivar usuario (cierra sus sesiones)'}
                          aria-label="Desactivar"
                          disabled={ocupado || esPropio}
                          style={ocupado || esPropio ? estiloDeshabilitado : undefined}
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleActivateUser(user)}
                          className="btn btn-sm btn-success"
                          title="Activar usuario"
                          aria-label="Activar"
                          disabled={ocupado}
                          style={ocupado ? estiloDeshabilitado : undefined}
                        >
                          Activar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="empty-state">
            <p>No hay usuarios registrados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserList;
