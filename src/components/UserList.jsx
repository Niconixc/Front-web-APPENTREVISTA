import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  getUsers,
  updateUserRole,
  deleteUser,
  activateUser,
  resetPassword,
  mensajeDeError,
  usuarioActual,
} from '../services/api';
import { LIMITES, formatearFecha, iniciales, tonoAvatar } from '../services/etiquetas';
import Icono from './Icono';
import './UserList.css';

const IDIOMAS = { es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', de: 'Alemán' };

// Texto y variante de insignia para los valores que entrega V2; un valor desconocido se muestra tal cual.
const ROLES = {
  admin: { texto: 'Admin', clase: 'insignia--info' },
  user: { texto: 'Usuario', clase: '' },
};
const ESTADOS = {
  activo: { texto: 'Activo', clase: 'insignia--exito' },
  inactivo: { texto: 'Inactivo', clase: '' },
};

/** «1 usuario» / «3 usuarios»: singular o plural según la cantidad. */
const contar = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

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

  const encabezado = (descripcion) => (
    <header className="encabezado-pagina">
      <div className="encabezado-pagina__textos">
        <h1 className="encabezado-pagina__titulo">Usuarios</h1>
        {descripcion && <p className="encabezado-pagina__descripcion">{descripcion}</p>}
      </div>
      <div className="encabezado-pagina__acciones">
        <Link to="/crear-usuario" className="boton boton--primario">
          <Icono nombre="usuario-mas" />
          Crear usuario
        </Link>
      </div>
    </header>
  );

  // Números clave calculados de la lista ya cargada (sin otra llamada a V2).
  const total = users.length;
  const activos = users.filter((u) => u.estado === 'activo').length;
  const inactivos = users.filter((u) => u.estado === 'inactivo').length;
  const admins = users.filter((u) => u.rol === 'admin').length;
  const porcentajeActivos = total > 0 ? Math.round((activos / total) * 100) : 0;

  if (loading) {
    return (
      <div className="pagina">
        {encabezado()}
        <p className="cargando cargando--bloque" role="status">
          Cargando usuarios…
        </p>
      </div>
    );
  }

  return (
    <div className="pagina">
      {encabezado('Cuentas de la app y del panel: sus roles, su acceso y sus contraseñas.')}

      {error && (
        <div className="aviso aviso--peligro" role="alert">
          <Icono nombre="alerta" className="aviso__icono" />
          <div className="aviso__contenido">{error}</div>
        </div>
      )}
      {successMessage && (
        <div className="aviso aviso--exito" role="status">
          <Icono nombre="check-circulo" className="aviso__icono" />
          <div className="aviso__contenido">{successMessage}</div>
        </div>
      )}

      {total > 0 && (
        <section aria-labelledby="usuarios-metricas-titulo">
          <h2 id="usuarios-metricas-titulo" className="sr-only">Números clave</h2>
          <div className="metricas usuarios-metricas">
            <div className="metrica metrica--neutra usuarios-aparece" style={{ '--orden': 0 }}>
              <span className="metrica__etiqueta">
                <span className="metrica__icono" aria-hidden="true"><Icono nombre="usuarios" tamano={15} /></span>
                Total
              </span>
              <span className="metrica__valor usuarios-metrica__valor">{total}</span>
              <span className="metrica__pie">
                {inactivos > 0 ? contar(inactivos, 'cuenta inactiva', 'cuentas inactivas') : 'Todas las cuentas están activas'}
              </span>
            </div>
            <div className="metrica metrica--verde usuarios-aparece" style={{ '--orden': 1 }}>
              <span className="metrica__etiqueta">
                <span className="metrica__icono" aria-hidden="true"><Icono nombre="check-circulo" tamano={15} /></span>
                Activos
              </span>
              <span className="metrica__valor usuarios-metrica__valor">{activos}</span>
              <span className="metrica__pie">
                <span className="metrica__destacado mono">{porcentajeActivos} %</span> del total puede iniciar sesión
              </span>
            </div>
            <div className="metrica usuarios-aparece" style={{ '--orden': 2 }}>
              <span className="metrica__etiqueta">
                <span className="metrica__icono" aria-hidden="true"><Icono nombre="escudo" tamano={15} /></span>
                Administradores
              </span>
              <span className="metrica__valor usuarios-metrica__valor">{admins}</span>
              <span className="metrica__pie">
                <span className="metrica__destacado">{contar(total - admins, 'usuario regular', 'usuarios regulares')}</span>
              </span>
            </div>
          </div>
        </section>
      )}

      {users.length === 0 ? (
        <div className="tarjeta">
          <div className="vacio">
            <p className="vacio__titulo">No hay usuarios registrados</p>
          </div>
        </div>
      ) : (
        <section className="tarjeta usuarios-tarjeta usuarios-aparece" style={{ '--orden': 3 }} aria-labelledby="usuarios-tabla-titulo">
          <div className="usuarios-tarjeta__cabecera">
            <div>
              <h2 id="usuarios-tabla-titulo" className="usuarios-tarjeta__titulo">Todas las cuentas</h2>
              <p className="usuarios-tarjeta__sub">
                {contar(total, 'usuario', 'usuarios')} · {contar(admins, 'administrador', 'administradores')}
              </p>
            </div>
          </div>
        <div className="tabla-contenedor usuarios-tabla-contenedor">
          <table className="tabla usuarios-tabla">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Idioma</th>
                <th scope="col">Fecha de creación</th>
                <th scope="col" className="celda-acciones">
                  Acciones
                </th>
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
                const rol = ROLES[user.rol];
                const estado = ESTADOS[user.estado];

                return (
                  <tr key={user.usuarioId}>
                    <td>
                      <div className="usuarios-persona">
                        <span
                          className={`avatar usuarios-persona__avatar ${user.nombre ? `avatar--tono-${tonoAvatar(user.correo)}` : 'avatar--neutro'}`}
                          aria-hidden="true"
                        >
                          {user.nombre ? iniciales(user.nombre) : <Icono nombre="usuarios" tamano={16} />}
                        </span>
                        <span className="usuarios-persona__textos">
                          <span className={`usuarios-persona__nombre${user.nombre ? '' : ' texto-3'}`}>
                            {user.nombre || 'Sin nombre'}
                            {esPropio && <span className="usuarios-persona__propio"> (tú)</span>}
                          </span>
                          <span className="usuarios-persona__correo">{user.correo}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`insignia ${rol?.clase ?? ''}`.trim()}>{rol?.texto ?? user.rol}</span>
                    </td>
                    <td>
                      <span className={`insignia insignia--punto ${estado?.clase ?? ''}`.trim()}>
                        {estado?.texto ?? user.estado}
                      </span>
                    </td>
                    <td className="usuarios-tabla__idioma">{IDIOMAS[user.idioma] ?? user.idioma ?? '-'}</td>
                    <td className="usuarios-tabla__fecha mono">{formatearFecha(user.fechaCreacion)}</td>
                    <td className="celda-acciones">
                      <div className="grupo-botones">
                        <button
                          type="button"
                          onClick={() => handleChangeRole(user)}
                          className="boton boton--chico boton--icono"
                          title={tituloRol}
                          aria-label={tituloRol}
                          disabled={ocupado || bloquearRol}
                        >
                          <Icono nombre={user.rol === 'admin' ? 'usuarios' : 'escudo'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(user)}
                          className="boton boton--chico boton--icono"
                          title="Cambiar contraseña (cierra sus sesiones)"
                          aria-label="Cambiar contraseña"
                          disabled={ocupado}
                        >
                          <Icono nombre="llave" />
                        </button>
                        {user.estado === 'activo' ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivateUser(user)}
                            className="boton boton--chico boton--peligro-suave usuarios-tabla__estado-accion"
                            title={esPropio ? 'No puedes desactivar tu propia cuenta' : 'Desactivar usuario (cierra sus sesiones)'}
                            aria-label="Desactivar"
                            disabled={ocupado || esPropio}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivateUser(user)}
                            className="boton boton--chico usuarios-tabla__estado-accion"
                            title="Activar usuario"
                            aria-label="Activar"
                            disabled={ocupado}
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
        </div>
        </section>
      )}
    </div>
  );
};

export default UserList;
