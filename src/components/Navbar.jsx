import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logout, usuarioActual } from '../services/api';
import Icono from './Icono';
import { iniciales } from '../services/etiquetas';
import './Navbar.css';

/** Menú lateral por secciones. En pantallas angostas se vuelve una barra superior con un botón «Menú». */
const SECCIONES = [
  {
    id: 'general',
    titulo: 'General',
    enlaces: [
      { a: '/dashboard', texto: 'Resumen', icono: 'resumen' },
      { a: '/informes', texto: 'Informes y costos IA', icono: 'informes' },
    ],
  },
  {
    id: 'usuarios',
    titulo: 'Usuarios',
    enlaces: [
      { a: '/usuarios', texto: 'Usuarios', icono: 'usuarios' },
      { a: '/crear-usuario', texto: 'Crear usuario', icono: 'usuario-mas' },
    ],
  },
  {
    id: 'banco',
    titulo: 'Banco de preguntas',
    enlaces: [
      { a: '/preguntas', texto: 'Preguntas', icono: 'preguntas' },
      { a: '/crear-pregunta', texto: 'Crear pregunta', icono: 'pregunta-mas' },
      { a: '/generar-preguntas', texto: 'Generar con IA', icono: 'generar' },
      { a: '/cobertura', texto: 'Cobertura', icono: 'cobertura' },
    ],
  },
  {
    id: 'suscripciones',
    titulo: 'Suscripciones',
    enlaces: [{ a: '/codigos', texto: 'Códigos', icono: 'codigos' }],
  },
];

const Navbar = ({ setIsAuthenticated }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = usuarioActual() || {};
  const [saliendo, setSaliendo] = useState(false);
  const [abierto, setAbierto] = useState(false);

  // Al navegar se cierra el menú del celular.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  const handleLogout = async () => {
    setSaliendo(true);
    await logout(); // revoca el refresh token en el servidor
    setIsAuthenticated(false);
    navigate('/');
  };

  return (
    <>
      <header className="barra-movil">
        <span className="marca">
          <span className="marca__logo" aria-hidden="true">E</span>
          <span className="marca__texto">EntrevistaApp</span>
        </span>
        <button
          type="button"
          className="boton boton--sutil boton--chico"
          aria-expanded={abierto}
          aria-controls="menu-lateral"
          onClick={() => setAbierto((v) => !v)}
        >
          <Icono nombre={abierto ? 'cerrar' : 'menu'} />
          Menú
        </button>
      </header>

      {abierto && <div className="lateral-fondo" onClick={() => setAbierto(false)} aria-hidden="true" />}

      <aside id="menu-lateral" className={`lateral${abierto ? ' lateral--abierto' : ''}`}>
        <div className="lateral__marca">
          <span className="marca">
            <span className="marca__logo" aria-hidden="true">E</span>
            <span className="marca__texto">
              EntrevistaApp
              <span className="marca__sub">Administración</span>
            </span>
          </span>
        </div>

        <nav className="lateral__nav" aria-label="Secciones del panel">
          {SECCIONES.map((seccion) => (
            <div key={seccion.id} className="lateral__grupo">
              <p className="lateral__titulo-grupo" id={`grupo-${seccion.id}`}>
                {seccion.titulo}
              </p>
              <ul aria-labelledby={`grupo-${seccion.id}`}>
                {seccion.enlaces.map((enlace) => (
                  <li key={enlace.a}>
                    <NavLink to={enlace.a} className="lateral__enlace">
                      <Icono nombre={enlace.icono} />
                      <span>{enlace.texto}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="lateral__pie">
          <div className="lateral__usuario">
            <span className="avatar avatar--chico" aria-hidden="true">{iniciales(user.correo)}</span>
            <span className="lateral__usuario-textos">
              <span className="lateral__correo truncar" title={user.correo || undefined}>{user.correo}</span>
              <span className="lateral__rol">Administrador</span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="boton boton--sutil boton--chico lateral__salir"
            disabled={saliendo}
          >
            <Icono nombre="salir" />
            {saliendo ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Navbar;
