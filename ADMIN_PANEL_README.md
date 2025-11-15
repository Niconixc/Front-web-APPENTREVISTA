# Panel de Administración - Entrevista App

Panel de administración React para gestionar usuarios del sistema.

## 🚀 Características

- ✅ Login de administradores con JWT
- ✅ Dashboard con estadísticas
- ✅ Listado de usuarios
- ✅ Crear nuevos usuarios
- ✅ Cambiar rol de usuario (user ↔ admin)
- ✅ Eliminar usuarios
- ✅ Rutas protegidas
- ✅ CORS configurado

## 📋 Requisitos Previos

- Node.js 16+ instalado
- Backend Ktor ejecutándose en http://localhost:8080
- CORS configurado en el backend

## 🔧 Instalación

Las dependencias ya están instaladas. Si necesitas reinstalar:

```bash
cd admin-panel
npm install
```

## ▶️ Ejecutar

```bash
npm run dev
```

El panel estará disponible en: http://localhost:5173

## 📁 Estructura de Archivos

```
admin-panel/src/
├── components/
│   ├── Login.jsx           # Formulario de login
│   ├── Login.css
│   ├── Dashboard.jsx       # Panel principal
│   ├── Dashboard.css
│   ├── UserList.jsx        # Lista de usuarios
│   ├── UserList.css
│   ├── CreateUser.jsx      # Crear usuario
│   ├── CreateUser.css
│   ├── Navbar.jsx          # Barra de navegación
│   └── Navbar.css
├── services/
│   └── api.js             # Configuración axios + endpoints
├── App.jsx                # Router principal
├── App.css                # Estilos globales
└── main.jsx               # Entry point
```

## 🔑 Uso

### 1. Login
- Navega a http://localhost:5173
- Ingresa credenciales de administrador
- Solo usuarios con rol "admin" pueden acceder

### 2. Dashboard
- Ver estadísticas de usuarios
- Acceso rápido a funciones principales

### 3. Gestión de Usuarios
- **Ver usuarios**: Lista completa con filtros
- **Crear usuario**: Formulario con validación
- **Cambiar rol**: Convertir user ↔ admin
- **Eliminar**: Eliminar usuarios del sistema

## 🌐 Endpoints del Backend

El panel consume estos endpoints del backend:

```
POST   /auth/login                         # Login
GET    /admin/usuarios                     # Listar usuarios
POST   /admin/usuarios                     # Crear usuario
PATCH  /admin/usuarios/:id/rol            # Cambiar rol
DELETE /admin/usuarios/:id                # Eliminar usuario
```

## 🔒 Autenticación

- El token JWT se guarda en `localStorage`
- Se envía en header `Authorization: Bearer <token>`
- Interceptor de axios agrega el token automáticamente
- Si el token expira, redirige al login

## 🎨 Personalización

### Cambiar colores del tema

Edita los gradientes en los archivos CSS:

```css
/* Gradiente principal */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

### Agregar más rutas

En `App.jsx`:

```jsx
<Route
  path="/nueva-ruta"
  element={
    <ProtectedRoute isAuthenticated={isAuthenticated}>
      <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
        <NuevoComponente />
      </ProtectedLayout>
    </ProtectedRoute>
  }
/>
```

## ⚠️ Notas Importantes

1. **Backend debe estar corriendo**: El backend Ktor debe estar en http://localhost:8080
2. **CORS configurado**: El backend debe permitir http://localhost:5173
3. **Solo admins**: Solo usuarios con rol "admin" pueden acceder
4. **Token expira**: Si el token expira, se redirige automáticamente al login

## 🐛 Troubleshooting

### Error de CORS
```
El backend debe tener configurado CORS para permitir:
- Host: localhost:5173
- Headers: Authorization, Content-Type
- Credentials: true
```

### Error 401 Unauthorized
```
El token expiró o es inválido. Vuelve a iniciar sesión.
```

### No puede crear usuarios
```
Verifica que el endpoint POST /admin/usuarios existe en el backend.
```

## 📦 Dependencias Principales

- **React 18**: Framework UI
- **React Router DOM 7**: Enrutamiento
- **Axios 1**: Cliente HTTP
- **Vite 6**: Build tool

## 🚢 Deploy

Para producción:

```bash
npm run build
```

Los archivos estáticos estarán en `dist/`.

Configura el backend para aceptar el dominio de producción en CORS.

## 📝 Changelog

### Versión 1.0.0
- Login de administradores
- Dashboard con estadísticas
- CRUD de usuarios
- Cambio de roles
- Rutas protegidas
