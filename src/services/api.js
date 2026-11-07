import axios from 'axios';
import { limpiarVacios } from './etiquetas';

// ============================================
// CLIENTE HTTP (backend V2)
// ============================================
// En producción (Vercel) se usa '/api' para pasar por el proxy de Vercel (api/[...path].js), que reenvía al backend
// de BACKEND_URL y evita el Mixed Content (HTTPS -> HTTP). Una ruta '/api/v1/...' sale como '/api/api/v1/...' y el
// proxy quita el primer 'api/'. En desarrollo se llama directo al backend de VITE_API_URL (por defecto el local).
const baseURL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:8080');

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/** Cliente sin interceptores: renovar o cerrar la sesión no debe volver a pasar por la lógica de 401. */
const crudo = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

// ============================================
// ERRORES (V2 responde {error: codigo, mensaje, message})
// ============================================

/** Texto para mostrar al usuario. Siempre devuelve un string (nunca un objeto que React no pueda pintar). */
export const mensajeDeError = (err, porDefecto = 'Ocurrió un error inesperado') => {
  const data = err?.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.mensaje === 'string' && data.mensaje) return data.mensaje;
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.error === 'string' && data.error) return data.error;
  }
  if (err?.code === 'ECONNABORTED') return 'La solicitud tardó demasiado';
  if (err && !err.response && err.request) return 'No se pudo conectar con el servidor';
  if (err && !err.response && typeof err.message === 'string' && err.message) return err.message;
  return porDefecto;
};

/** Código estable del error de V2 (ej: 'pregunta_en_uso'), para decidir qué hacer. */
export const codigoDeError = (err) => {
  const codigo = err?.response?.data?.error;
  return typeof codigo === 'string' ? codigo : null;
};

// ============================================
// SESIÓN (access token + refresh token de V2)
// ============================================

/** Decodifica el payload de un JWT (base64url). null si no se puede leer. */
export const decodificarJwt = (token) => {
  try {
    const parte = token.split('.')[1];
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

const leer = (clave) => {
  try { return localStorage.getItem(clave); } catch { return null; }
};

const guardarSesion = ({ accessToken, refreshToken }, correo) => {
  const payload = decodificarJwt(accessToken) || {};
  const anterior = usuarioActual();
  const usuario = { usuarioId: payload.sub, correo: correo ?? anterior?.correo ?? null, rol: payload.role };
  try {
    localStorage.setItem('token', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(usuario));
  } catch {
    // Sin almacenamiento (modo privado estricto): la sesión dura lo que la pestaña.
  }
  return usuario;
};

// Sube cada vez que se cierra la sesión: una renovación que estaba en vuelo no debe volver a guardarla después.
let epocaSesion = 0;

/** Borra la sesión y avisa a la app (App.jsx escucha 'auth:logout') sin recargar la página. */
export const limpiarSesion = () => {
  epocaSesion += 1;
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  } catch {
    // nada que limpiar
  }
  window.dispatchEvent(new Event('auth:logout'));
};

/** Usuario guardado ({usuarioId, correo, rol}) o null. */
export const usuarioActual = () => {
  try { return JSON.parse(leer('user')); } catch { return null; }
};

/** Hay sesión de admin utilizable: un access token vigente de admin, o un refresh token para renovarlo. */
export const sesionVigente = () => {
  const payload = decodificarJwt(leer('token') || '');
  if (payload?.role === 'admin' && payload.exp * 1000 > Date.now()) return true;
  return Boolean(leer('refreshToken')) && usuarioActual()?.rol === 'admin';
};

// Renovar la sesión, con cuidado: V2 rota el refresh token en cada uso y, si uno ya usado se vuelve a usar, lo toma
// como robo y cierra TODAS las sesiones del usuario (también las de la app). Por eso:
//  - una sola renovación a la vez dentro de la pestaña (renovacionEnCurso) y entre pestañas (navigator.locks);
//  - dentro del candado se vuelve a leer el refresh token: si otra pestaña ya renovó, se usa su token sin llamar al servidor.
let renovacionEnCurso = null;

/** Error de renovación que significa "la sesión ya no sirve" (no uno pasajero de red o del servidor). */
const finDeSesion = (mensaje) => Object.assign(new Error(mensaje), { finDeSesion: true });

const conCandadoEntrePestanas = (fn) =>
  (typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request('entrevistaapp-renovar-sesion', fn) : fn());

/** @param refreshAlEnviar el refresh token vigente cuando salió la petición que recibió el 401. */
const renovarSesion = (refreshAlEnviar) => {
  if (!renovacionEnCurso) {
    const epoca = epocaSesion;
    renovacionEnCurso = conCandadoEntrePestanas(async () => {
      const refreshToken = leer('refreshToken');
      if (!refreshToken) throw finDeSesion('Sin sesión');
      // Otra pestaña renovó mientras esperábamos el candado: su token nuevo ya está guardado.
      if (refreshAlEnviar && refreshToken !== refreshAlEnviar && leer('token')) return leer('token');
      let data;
      try {
        ({ data } = await crudo.post('/auth/refresh', { refreshToken }));
      } catch (err) {
        // 401/403: refresh inválido, revocado o cuenta inactiva. Cualquier otra cosa (5xx, red) es pasajera.
        const estado = err?.response?.status;
        if ((estado === 401 || estado === 403) && leer('refreshToken') === refreshToken) throw finDeSesion('La sesión expiró');
        throw err;
      }
      if (epoca !== epocaSesion) throw finDeSesion('La sesión se cerró mientras se renovaba');
      const usuario = guardarSesion(data);
      if (usuario.rol !== 'admin') {
        revocarYLimpiar(data.refreshToken);
        throw finDeSesion('La cuenta ya no es administradora');
      }
      return data.accessToken;
    }).finally(() => { renovacionEnCurso = null; });
  }
  return renovacionEnCurso;
};

/** Renueva antes de una operación que no se debe repetir (por ejemplo, generar con IA, que cuesta dinero). */
const renovarSiVencePronto = async () => {
  const payload = decodificarJwt(leer('token') || '');
  if (!payload || payload.exp * 1000 - Date.now() < 60_000) {
    try {
      await renovarSesion(leer('refreshToken'));
    } catch (err) {
      if (err?.finDeSesion) limpiarSesion();
      throw err;
    }
  }
};

api.interceptors.request.use((config) => {
  const token = leer('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config._refreshAlEnviar = leer('refreshToken');
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const estado = error.response?.status;
    // Las rutas de autenticación devuelven su propio error (ej: credenciales incorrectas): sin renovar ni redirigir.
    if ((config.url || '').startsWith('/auth/')) return Promise.reject(error);

    if (estado === 401 && !config._reintentado && leer('refreshToken')) {
      config._reintentado = true;
      let token;
      try {
        token = await renovarSesion(config._refreshAlEnviar);
      } catch (errRenovar) {
        // Solo se cierra la sesión si de verdad ya no sirve; un 5xx o un corte de red no deben expulsar al admin.
        if (errRenovar?.finDeSesion) limpiarSesion();
        return Promise.reject(errRenovar?.finDeSesion ? error : errRenovar);
      }
      if (config._sinReintento) {
        // Generar con IA no se repite sola (cuesta dinero). El 401 no llegó a la IA: se renovó la sesión y se avisa.
        const mensaje = 'Tu sesión se renovó. Vuelve a pulsar el botón (no se llamó a la IA).';
        return Promise.reject(Object.assign(new Error(mensaje), {
          config, response: { status: 401, data: { error: 'sesion_renovada', mensaje } },
        }));
      }
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
      return api(config);
    }
    if (estado === 401 || (estado === 403 && codigoDeError(error) === 'admin_required')) limpiarSesion();
    return Promise.reject(error);
  }
);

// ============================================
// AUTENTICACIÓN
// ============================================

/** Inicia sesión. Solo admin: a otro rol se le cierra la sesión recién creada y se lanza un error. */
export const login = async (correo, contrasena) => {
  const correoNormal = correo.trim().toLowerCase();
  const { data } = await api.post('/auth/login', { email: correoNormal, password: contrasena });
  const payload = decodificarJwt(data.accessToken);
  if (payload?.role !== 'admin') {
    await crudo.post('/auth/logout', { refreshToken: data.refreshToken }).catch(() => {});
    throw new Error('Acceso denegado. Solo administradores pueden acceder.');
  }
  return { usuario: guardarSesion(data, correoNormal) };
};

/** Revoca un refresh token en el servidor (sin esperar) y borra la sesión local. */
const revocarYLimpiar = (refreshToken) => {
  limpiarSesion();
  if (refreshToken) crudo.post('/auth/logout', { refreshToken }).catch(() => {});
};

/**
 * Cierra la sesión en el servidor (revoca el refresh token) y en el navegador. Si había una renovación en vuelo, la
 * espera antes: así se revoca el token vigente (no uno ya rotado) y la renovación no vuelve a guardar la sesión.
 */
export const logout = async () => {
  if (renovacionEnCurso) await renovacionEnCurso.catch(() => {});
  const refreshToken = leer('refreshToken');
  limpiarSesion();
  if (refreshToken) await crudo.post('/auth/logout', { refreshToken }).catch(() => {});
};

// ============================================
// USUARIOS (solo admin)
// ============================================

export const getUsers = async () => (await api.get('/admin/usuarios')).data;
export const createUser = async (usuario) => (await api.post('/admin/usuarios', usuario)).data;
export const updateUserRole = async (usuarioId, nuevoRol) => (await api.patch(`/admin/usuarios/${usuarioId}/rol`, { nuevoRol })).data;
/** V2 no borra: desactiva la cuenta y cierra sus sesiones. */
export const deleteUser = async (usuarioId) => (await api.delete(`/admin/usuarios/${usuarioId}`)).data;
export const activateUser = async (usuarioId) => (await api.patch(`/admin/usuarios/${usuarioId}/activar`)).data;
export const resetPassword = async (usuarioId, nuevaContrasena) =>
  (await api.patch(`/admin/usuarios/${usuarioId}/password`, { nuevaContrasena })).data;

// ============================================
// BANCO DE PREGUNTAS (solo admin) — /api/v1/admin/preguntas
// ============================================

const PREGUNTAS = '/api/v1/admin/preguntas';

/**
 * Página de preguntas. Filtros de V2: estado, tipo, categoria, nivel, cargoId, skillId, generadaPorIa ('true'|'false'),
 * pagina (desde 1) y tamano (1..100). Responde {elementos, total, pagina, tamano}.
 */
export const getQuestions = async (filtros = {}) => (await api.get(PREGUNTAS, { params: limpiarVacios(filtros) })).data;

/** Solo el total que cumple los filtros (pide una página de tamaño 1). */
export const contarPreguntas = async (filtros = {}) => (await getQuestions({ ...filtros, pagina: 1, tamano: 1 })).total;

export const getQuestion = async (id) => (await api.get(`${PREGUNTAS}/${id}`)).data;
/** Una pregunta creada por un admin queda aprobada. */
export const createQuestion = async (solicitud) => (await api.post(PREGUNTAS, solicitud)).data;
/** PUT completo: la pregunta vuelve a 'pendiente' y sus opciones se reemplazan. */
export const updateQuestion = async (id, solicitud) => (await api.put(`${PREGUNTAS}/${id}`, solicitud)).data;
export const approveQuestion = async (id) => (await api.patch(`${PREGUNTAS}/${id}/aprobar`)).data;
export const rejectQuestion = async (id, motivo) => (await api.patch(`${PREGUNTAS}/${id}/rechazar`, { motivo })).data;
/** Solo se puede borrar si nunca se usó (vecesUsada == 0); si no, V2 responde 409 pregunta_en_uso. */
export const deleteQuestion = async (id) => (await api.delete(`${PREGUNTAS}/${id}`)).data;

/**
 * Genera preguntas con IA (cuesta dinero). Body en snake_case: {cargo_id?, skill_id?, nivel, cantidad, tipo, categoria,
 * modelo}. Nunca se reintenta sola: si se corta, puede que el servidor igual haya terminado y cobrado.
 */
export const generateQuestionsAi = async (solicitud) => {
  await renovarSiVencePronto();
  const { data } = await api.post(`${PREGUNTAS}/generar-ia`, limpiarVacios(solicitud), { timeout: 120000, _sinReintento: true });
  return data;
};

// ============================================
// CATÁLOGO DEL MERCADO (público)
// ============================================

let cargosEnCache = null;

/** Cargos activos: [{cargoId, nombre, area, descripcion?, nivelBase, activo}]. Se guardan en memoria. */
export const getCargos = async () => {
  if (!cargosEnCache) {
    cargosEnCache = api.get('/api/v1/cargos').then((r) => r.data).catch((e) => { cargosEnCache = null; throw e; });
  }
  return cargosEnCache;
};

/** Matriz de un cargo: {cargoId, cargoNombre, area, skills: [{skillId, nombre, categoria, nivelRequerido, peso, obligatoria}]}. */
export const getSkillsDeCargo = async (cargoId) => (await api.get(`/api/v1/cargos/${cargoId}/skills`)).data;

/** Skills más demandadas: {skills: [{nombre, categoria, demandaScore, ...}]}. limit 1..100. */
export const getSkillsTrending = async ({ categoria, limit = 15 } = {}) =>
  (await api.get('/api/v1/skills/trending', { params: limpiarVacios({ categoria, limit }) })).data;

// ============================================
// COSTOS DE IA (solo admin)
// ============================================

/** Gasto en IA por día (UTC) y por modelo. desde/hasta 'AAAA-MM-DD' opcionales (sin ellos: últimos 30 días). */
export const getCostosIa = async ({ desde, hasta } = {}) =>
  (await api.get('/api/v1/admin/costos-ia', { params: limpiarVacios({ desde, hasta }) })).data;

// ============================================
// CÓDIGOS DE SUSCRIPCIÓN (solo admin)
// ============================================
// V2 permite crear códigos pero no listarlos (no hay GET): el panel muestra los creados en esta sesión.

/** Body: {days, max_uses, license_type, label?, expires_at? (ISO)}. Responde {code, expires_at, max_uses, license_type, mensaje}. */
export const createBillingCode = async (codigo) => (await api.post('/billing/admin/codes', limpiarVacios(codigo))).data;

export default api;
