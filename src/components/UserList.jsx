import { useEffect, useState } from 'react';
import { getUsers, updateUserRole, deleteUser, resetPassword } from '../services/api';
import './UserList.css';

const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
      setError('');
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      setError('Error al cargar la lista de usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeRole = async (usuarioId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';

    if (
      !window.confirm(
        `¿Cambiar rol de ${currentRole} a ${newRole}?`
      )
    ) {
      return;
    }

    try {
      await updateUserRole(usuarioId, newRole);
      setSuccessMessage(`Rol actualizado a ${newRole} exitosamente`);
      fetchUsers();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error al cambiar rol:', err);
      setError(err.response?.data?.error || 'Error al cambiar el rol');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleDeleteUser = async (usuarioId, correo) => {
    if (!window.confirm(`¿Eliminar usuario ${correo}?`)) {
      return;
    }

    try {
      await deleteUser(usuarioId);
      setSuccessMessage('Usuario eliminado exitosamente');
      fetchUsers();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error al eliminar usuario:', err);
      setError(err.response?.data?.error || 'Error al eliminar usuario');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleResetPassword = async (usuarioId, correo) => {
    const nuevaContrasena = window.prompt(
      `Ingrese la nueva contraseña para ${correo} (mínimo 6 caracteres):`
    );

    if (!nuevaContrasena) {
      return;
    }

    if (nuevaContrasena.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      await resetPassword(usuarioId, nuevaContrasena);
      setSuccessMessage('Contraseña actualizada exitosamente');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error al resetear contraseña:', err);
      setError(err.response?.data?.error || 'Error al resetear contraseña');
      setTimeout(() => setError(''), 3000);
    }
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
      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}

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
            {users.map((user) => (
              <tr key={user.usuarioId}>
                <td>{user.correo}</td>
                <td>{user.nombre || '-'}</td>
                <td>
                  <span className={`badge badge-${user.rol}`}>
                    {user.rol}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-${user.estado}`}>
                    {user.estado}
                  </span>
                </td>
                <td>{user.idioma}</td>
                <td>{new Date(user.fechaCreacion).toLocaleDateString()}</td>
                <td>
                  <div className="actions">
                    <button
                      onClick={() =>
                        handleChangeRole(user.usuarioId, user.rol)
                      }
                      className="btn btn-sm btn-primary"
                      title={
                        user.rol === 'admin'
                          ? 'Cambiar a usuario'
                          : 'Cambiar a admin'
                      }
                    >
                      {user.rol === 'admin' ? '👤' : '🔑'}
                    </button>
                    <button
                      onClick={() =>
                        handleResetPassword(user.usuarioId, user.correo)
                      }
                      className="btn btn-sm btn-warning"
                      title="Resetear contraseña"
                    >
                      🔒
                    </button>
                    <button
                      onClick={() =>
                        handleDeleteUser(user.usuarioId, user.correo)
                      }
                      className="btn btn-sm btn-danger"
                      title="Eliminar usuario"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
