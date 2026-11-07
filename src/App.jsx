import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Informes from './components/Informes';
import UserList from './components/UserList';
import CreateUser from './components/CreateUser';
import QuestionList from './components/QuestionList';
import QuestionForm from './components/QuestionForm';
import QuestionEdit from './components/QuestionEdit';
import BillingCodes from './components/BillingCodes';
import GenerarPreguntas from './components/GenerarPreguntas';
import Navbar from './components/Navbar';
import { sesionVigente } from './services/api';
import './App.css';

// Componente para proteger rutas
const ProtectedRoute = ({ children, isAuthenticated }) => {
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Layout con Navbar para rutas protegidas
const ProtectedLayout = ({ children, setIsAuthenticated }) => {
  return (
    <>
      <Navbar setIsAuthenticated={setIsAuthenticated} />
      <main className="main-content">{children}</main>
    </>
  );
};

function App() {
  // Se lee al cargar: al recargar una página protegida no hay un salto al login y de vuelta.
  const [isAuthenticated, setIsAuthenticated] = useState(() => sesionVigente());

  // El cliente HTTP avisa con 'auth:logout' cuando la sesión ya no sirve (refresh inválido, rol perdido).
  // Y si la sesión cambia en otra pestaña (se cerró, o se inició), esta la sigue.
  useEffect(() => {
    const alCerrarSesion = () => setIsAuthenticated(false);
    const alCambiarOtraPestana = (e) => {
      if (e.key === null || e.key === 'token' || e.key === 'refreshToken' || e.key === 'user') setIsAuthenticated(sesionVigente());
    };
    window.addEventListener('auth:logout', alCerrarSesion);
    window.addEventListener('storage', alCambiarOtraPestana);
    return () => {
      window.removeEventListener('auth:logout', alCerrarSesion);
      window.removeEventListener('storage', alCambiarOtraPestana);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          {/* Ruta pública: Login */}
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login setIsAuthenticated={setIsAuthenticated} />
              )
            }
          />

          {/* Rutas protegidas */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <Dashboard />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/usuarios"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <UserList />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/informes"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <Informes />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/crear-usuario"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <CreateUser />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/preguntas"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <QuestionList />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/crear-pregunta"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <QuestionForm />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/editar-pregunta/:id"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <QuestionEdit />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/generar-preguntas"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <GenerarPreguntas />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/codigos"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated}>
                <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
                  <BillingCodes />
                </ProtectedLayout>
              </ProtectedRoute>
            }
          />

          {/* Ruta por defecto */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
