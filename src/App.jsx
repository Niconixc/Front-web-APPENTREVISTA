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
import Navbar from './components/Navbar';
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Verificar si el usuario ya está autenticado al cargar la app
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
      try {
        const userData = JSON.parse(user);
        if (userData.rol === 'admin') {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error al parsear usuario:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
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
