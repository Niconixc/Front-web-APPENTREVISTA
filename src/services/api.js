import axios from 'axios';

// Configuración base de axios
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Interceptor para agregar token JWT a todas las requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar respuestas y errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inv�lido
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// ============================================
// FUNCIONES DE AUTENTICACI�N
// ============================================

export const login = async (correo, contrasena) => {
  // El backend espera 'email' y 'password'
  const response = await api.post('/auth/login', {
    email: correo,
    password: contrasena
  });

  // El backend responde con { accessToken, refreshToken }
  // Necesitamos obtener los datos del usuario del token JWT
  const { accessToken } = response.data;

  // Decodificar el JWT para obtener el subject (usuarioId) y el rol
  const payload = JSON.parse(atob(accessToken.split('.')[1]));

  // Crear objeto usuario compatible con el frontend
  const usuario = {
    usuarioId: payload.sub,
    correo: correo,
    rol: payload.role || 'user'
  };

  return {
    accessToken,
    usuario
  };
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// ============================================
// FUNCIONES DE ADMINISTRACI�N DE USUARIOS
// ============================================

export const getUsers = async () => {
  const response = await api.get('/admin/usuarios');
  return response.data;
};

export const createUser = async (userData) => {
  const response = await api.post('/admin/usuarios', userData);
  return response.data;
};

export const updateUserRole = async (usuarioId, nuevoRol) => {
  const response = await api.patch(`/admin/usuarios/${usuarioId}/rol`, { nuevoRol });
  return response.data;
};

export const deleteUser = async (usuarioId) => {
  const response = await api.delete(`/admin/usuarios/${usuarioId}`);
  return response.data;
};

export const activateUser = async (usuarioId) => {
  const response = await api.patch(`/admin/usuarios/${usuarioId}/activar`);
  return response.data;
};

export const resetPassword = async (usuarioId, nuevaContrasena) => {
  const response = await api.patch(`/admin/usuarios/${usuarioId}/password`, { nuevaContrasena });
  return response.data;
};

// ============================================
// FUNCIONES DE ADMINISTRACIÓN DE PREGUNTAS
// ============================================

export const getQuestions = async (queryParams = '') => {
  const url = queryParams ? `/admin/preguntas?${queryParams}` : '/admin/preguntas';
  const response = await api.get(url);
  return response.data;
};

export const getQuestion = async (preguntaId) => {
  const response = await api.get(`/admin/preguntas/${preguntaId}`);
  return response.data;
};

export const createQuestion = async (questionData) => {
  const response = await api.post('/admin/preguntas', questionData);
  return response.data;
};

export const updateQuestion = async (preguntaId, questionData) => {
  const response = await api.patch(`/admin/preguntas/${preguntaId}`, questionData);
  return response.data;
};

export const deleteQuestion = async (preguntaId) => {
  const response = await api.delete(`/admin/preguntas/${preguntaId}`);
  return response.data;
};

// ============================================
// FUNCIONES DE INFORMES Y ESTADÍSTICAS
// ============================================

export const getInformeGestion = async () => {
  const response = await api.get('/admin/informes/gestion');
  return response.data;
};

export const downloadInformeExcel = async () => {
  const response = await api.get('/admin/informes/gestion/excel', {
    responseType: 'blob', // Importante para archivos binarios
  });
  return response.data;
};

export const downloadInformeCsv = async () => {
  const response = await api.get('/admin/informes/gestion/csv', {
    responseType: 'blob',
  });
  return response.data;
};

// ========== BILLING CODES ==========
export const getBillingCodes = async () => {
  const response = await api.get('/billing/admin/codes');
  return response.data;
};

export const createBillingCode = async (data) => {
  const response = await api.post('/billing/admin/codes', data);
  return response.data;
};

export default api;
