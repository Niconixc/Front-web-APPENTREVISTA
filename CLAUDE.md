# CLAUDE.md - AI Assistant Guide for EntrevistaApp Admin Panel

## Project Overview

**EntrevistaApp Admin Panel** is a React-based administrative dashboard for managing users in the EntrevistaApp system. This is a frontend application that communicates with a Ktor backend API running on `http://localhost:8080`.

### Key Features
- Admin-only JWT authentication
- User management (CRUD operations)
- Role management (user ↔ admin)
- Dashboard with statistics
- Protected routes with automatic token validation
- Responsive UI with gradient theme

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| React Router DOM | 7.9.6 | Client-side routing |
| Axios | 1.13.2 | HTTP client |
| Vite | 6.0.11 | Build tool & dev server |
| JavaScript | ES6+ | Programming language (ESM modules) |

**Note**: This project uses ES Modules (`"type": "module"` in package.json).

---

## Project Structure

```
Front-web-APPENTREVISTA/
├── src/
│   ├── components/          # React components
│   │   ├── Login.jsx        # Login form (admin authentication)
│   │   ├── Login.css
│   │   ├── Dashboard.jsx    # Main dashboard with stats
│   │   ├── Dashboard.css
│   │   ├── UserList.jsx     # User management table
│   │   ├── UserList.css
│   │   ├── CreateUser.jsx   # User creation form
│   │   ├── CreateUser.css
│   │   ├── Navbar.jsx       # Navigation bar
│   │   └── Navbar.css
│   ├── services/
│   │   └── api.js           # Axios configuration & API functions
│   ├── App.jsx              # Main app component with routing
│   ├── App.css              # Global styles
│   └── main.jsx             # Application entry point
├── index.html               # HTML entry point
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies & scripts
├── ADMIN_PANEL_README.md    # User-facing documentation (Spanish)
└── CLAUDE.md                # This file (AI assistant guide)
```

### Key Files to Know

- **`src/main.jsx`**: Application entry point, renders App component
- **`src/App.jsx`**: Router configuration and authentication state management
- **`src/services/api.js`**: All backend API interactions (centralized)
- **`index.html`**: HTML entry point (Spanish language)

---

## Architecture & Design Patterns

### 1. Component Architecture

**Pattern**: Functional components with React Hooks

```jsx
// Standard component structure
import { useState, useEffect } from 'react';
import { apiFunction } from '../services/api';
import './ComponentName.css';

const ComponentName = ({ props }) => {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  return (
    <div className="component-name">
      {/* JSX */}
    </div>
  );
};

export default ComponentName;
```

### 2. Routing Pattern

**File**: `src/App.jsx:50-104`

The app uses a three-layer protection pattern:
1. **ProtectedRoute**: Redirects unauthenticated users to login
2. **ProtectedLayout**: Adds Navbar to protected pages
3. **Route-level authentication check**: Login page redirects authenticated users to dashboard

```jsx
// Protected route structure
<Route
  path="/path"
  element={
    <ProtectedRoute isAuthenticated={isAuthenticated}>
      <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
        <ComponentName />
      </ProtectedLayout>
    </ProtectedRoute>
  }
/>
```

### 3. Authentication Flow

**Files**: `src/App.jsx:32-48`, `src/services/api.js:44-69`, `src/components/Login.jsx`

1. User submits credentials via Login component
2. `login()` function calls `/auth/login` endpoint
3. Backend returns JWT access token
4. Frontend decodes JWT to extract user data (usuarioId, role)
5. Token stored in `localStorage.token`
6. User data stored in `localStorage.user` (JSON string)
7. **Admin role verification**: Only users with `rol === 'admin'` can access the panel
8. `isAuthenticated` state set to `true`
9. Axios interceptor automatically adds token to all subsequent requests

**Token Storage Format**:
```javascript
localStorage.token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
localStorage.user = '{"usuarioId":"123","correo":"admin@example.com","rol":"admin"}'
```

### 4. API Service Pattern

**File**: `src/services/api.js`

**Centralized API client** with:
- Base URL configuration (`http://localhost:8080`)
- Request interceptor: Auto-adds JWT token to Authorization header
- Response interceptor: Auto-logout on 401 (token expired/invalid)
- Named export functions for each endpoint

**Convention**: All API functions are async and return `response.data`

```javascript
// API function pattern
export const functionName = async (params) => {
  const response = await api.method('/endpoint', data);
  return response.data;
};
```

### 5. State Management

**Pattern**: Component-level state with `useState`

- No global state management library (Redux, Zustand, etc.)
- Authentication state managed in `App.jsx` and passed down as props
- Local state for forms, loading states, errors

---

## Key Conventions

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `CreateUser.jsx` |
| Component files | PascalCase.jsx | `Dashboard.jsx` |
| CSS files | PascalCase.css | `Dashboard.css` |
| Functions | camelCase | `fetchStats()` |
| API functions | camelCase | `getUsers()`, `createUser()` |
| CSS classes | kebab-case | `.login-container`, `.stat-card` |
| Variables (Spanish) | camelCase | `correo`, `contrasena`, `usuarioId` |

### Language Conventions

- **Code variables**: Mixed Spanish (`correo`, `contrasena`, `usuarioId`, `rol`)
- **UI text**: Spanish (`"Iniciar Sesión"`, `"Panel de Administración"`)
- **Code comments**: Spanish
- **Documentation**: Spanish (ADMIN_PANEL_README.md) and English (this file)

**Important**: Backend API expects English field names (`email`, `password`), so `api.js` translates Spanish frontend names to English.

### CSS Conventions

- **Co-located styles**: Each component has a corresponding `.css` file
- **Import pattern**: `import './ComponentName.css'` in component file
- **Global styles**: `App.css` for app-wide styles
- **Class naming**: BEM-like structure (`.component-name`, `.component-name__element`)
- **Theme**: Purple gradient theme (`#667eea` → `#764ba2`)

### Error Handling Pattern

```javascript
try {
  const data = await apiFunction();
  // Success handling
} catch (err) {
  console.error('Descriptive error message:', err);
  setError(err.response?.data?.error || 'Fallback error message');
} finally {
  setLoading(false);
}
```

---

## Authentication & Authorization

### Admin-Only Access

**Critical**: Only users with `rol === 'admin'` can access the admin panel.

**Enforcement points**:
1. **Login component** (`src/components/Login.jsx:22-26`): Checks role after login
2. **App component** (`src/App.jsx:39`): Checks role when restoring session
3. **Backend**: Should also enforce admin role on API endpoints

### Token Management

**Storage**: `localStorage` (not cookies)

**Lifecycle**:
1. **Login**: Token saved to `localStorage.token`
2. **Requests**: Token auto-added via axios interceptor (`src/services/api.js:13-24`)
3. **Expiration**: 401 response triggers auto-logout (`src/services/api.js:30-37`)
4. **Logout**: Token and user data removed from localStorage

**Security Note**: `withCredentials: true` is set in axios config for CORS cookies, but JWT is sent via Authorization header.

---

## API Integration

### Backend Endpoints

Base URL: `http://localhost:8080`

| Method | Endpoint | Purpose | Request Body | Auth |
|--------|----------|---------|--------------|------|
| POST | `/auth/login` | Admin login | `{email, password}` | No |
| GET | `/admin/usuarios` | List all users | - | Yes |
| POST | `/admin/usuarios` | Create user | `{userData}` | Yes |
| PATCH | `/admin/usuarios/:id/rol` | Change user role | `{nuevoRol}` | Yes |
| DELETE | `/admin/usuarios/:id` | Delete user | - | Yes |
| PATCH | `/admin/usuarios/:id/password` | Reset password | `{nuevaContrasena}` | Yes |

**Note**: Password reset endpoint exists in `api.js` but may not be used in UI.

### CORS Requirements

Backend must allow:
- **Origin**: `http://localhost:5173`
- **Headers**: `Authorization`, `Content-Type`
- **Credentials**: `true`

### Request/Response Format

**Login Request**:
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Login Response**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "..."
}
```

**JWT Payload** (decoded from `accessToken`):
```json
{
  "sub": "user-id-123",
  "role": "admin",
  "exp": 1234567890
}
```

**User Object** (frontend format):
```json
{
  "usuarioId": "123",
  "correo": "admin@example.com",
  "rol": "admin"
}
```

---

## Component Patterns

### Form Components

**Pattern**: Controlled inputs with validation

```jsx
const [formValue, setFormValue] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    await apiFunction(formValue);
    // Success handling (navigate, show message, etc.)
  } catch (err) {
    setError(err.response?.data?.error || 'Fallback message');
  } finally {
    setLoading(false);
  }
};

return (
  <form onSubmit={handleSubmit}>
    <input
      type="text"
      value={formValue}
      onChange={(e) => setFormValue(e.target.value)}
      required
    />
    {error && <div className="error-message">{error}</div>}
    <button disabled={loading}>
      {loading ? 'Processing...' : 'Submit'}
    </button>
  </form>
);
```

### Data Fetching Components

**Pattern**: `useEffect` with async function

```jsx
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchData();
}, []); // Empty deps = fetch once on mount

const fetchData = async () => {
  try {
    const result = await apiFunction();
    setData(result);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};

if (loading) return <div className="loading">Cargando...</div>;
```

### Navigation Components

**Pattern**: React Router's `Link` for internal navigation, `useNavigate` for programmatic navigation

```jsx
import { Link, useNavigate } from 'react-router-dom';

// Declarative navigation
<Link to="/path">Navigate</Link>

// Programmatic navigation
const navigate = useNavigate();
navigate('/dashboard');
```

---

## Development Workflows

### Running the Application

```bash
# Development server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Dev server**: `http://localhost:5173` (configured in `vite.config.js:7`)

### Making Changes

**Standard workflow for AI assistants**:

1. **Read relevant files** before making changes
2. **Understand the context** (authentication state, routing, API dependencies)
3. **Follow existing patterns** (component structure, naming conventions)
4. **Test changes** by running `npm run dev`
5. **Check for errors** in browser console and terminal

### Adding a New Component

1. Create `ComponentName.jsx` in `src/components/`
2. Create corresponding `ComponentName.css`
3. Follow the standard component structure (useState, useEffect, return JSX)
4. Import component in `App.jsx`
5. Add route if needed

**Example**:
```jsx
// src/components/NewFeature.jsx
import { useState } from 'react';
import './NewFeature.css';

const NewFeature = () => {
  return (
    <div className="new-feature">
      <h1>New Feature</h1>
    </div>
  );
};

export default NewFeature;
```

### Adding a New Route

**File**: `src/App.jsx`

```jsx
import NewFeature from './components/NewFeature';

// Inside <Routes> component
<Route
  path="/new-feature"
  element={
    <ProtectedRoute isAuthenticated={isAuthenticated}>
      <ProtectedLayout setIsAuthenticated={setIsAuthenticated}>
        <NewFeature />
      </ProtectedLayout>
    </ProtectedRoute>
  }
/>
```

### Adding a New API Endpoint

**File**: `src/services/api.js`

```javascript
export const newApiFunction = async (params) => {
  const response = await api.method('/endpoint', data);
  return response.data;
};
```

**Convention**: Export named functions, not default export for API functions.

---

## Styling Guidelines

### Theme Colors

**Primary gradient**: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`

**Common colors**:
- Primary purple: `#667eea`
- Secondary purple: `#764ba2`
- Success green: `#48bb78`
- Error red: `#f56565`
- White: `#ffffff`
- Light gray: `#f7fafc`, `#edf2f7`
- Dark gray: `#2d3748`, `#1a202c`

### Component Styling Pattern

```css
/* ComponentName.css */

/* Container (outermost element) */
.component-name {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

/* Card pattern (used extensively) */
.component-card {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Button pattern */
.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-primary:hover {
  transform: translateY(-2px);
}
```

### Responsive Design

**Convention**: Desktop-first with mobile adjustments

```css
/* Desktop styles first */
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
```

---

## Common Pitfalls & Best Practices

### Do's ✅

1. **Always read files** before modifying them
2. **Follow existing naming conventions** (Spanish variable names for user data)
3. **Use centralized API functions** in `services/api.js`
4. **Handle loading and error states** in forms and data fetching
5. **Check admin role** when adding new protected features
6. **Use the axios instance** from `api.js`, not raw axios
7. **Co-locate styles** with components
8. **Use React Router's `Link`** for navigation, not `<a>` tags
9. **Clear errors** before new form submissions (`setError('')`)
10. **Add `finally` blocks** to always reset loading states

### Don'ts ❌

1. **Don't use global variables** for state management
2. **Don't hardcode API URLs** in components (use `api.js`)
3. **Don't skip error handling** in async functions
4. **Don't store sensitive data** beyond token/user in localStorage
5. **Don't allow non-admin users** to access protected routes
6. **Don't forget to remove tokens** on logout (`localStorage.removeItem`)
7. **Don't use `var`** (use `const`/`let`)
8. **Don't mix English/Spanish** inconsistently (follow existing patterns)
9. **Don't create new state management** (use existing pattern)
10. **Don't bypass axios interceptors** (they handle auth automatically)

### Security Considerations

1. **XSS Protection**: React automatically escapes JSX content
2. **CSRF**: JWT in Authorization header (not cookies) mitigates CSRF
3. **Token Exposure**: localStorage is vulnerable to XSS; consider httpOnly cookies for production
4. **Role Validation**: Backend MUST validate admin role on all `/admin/*` endpoints
5. **Input Validation**: Always validate user input on backend
6. **HTTPS**: Use HTTPS in production (not HTTP)

---

## Common Tasks for AI Assistants

### Task: Add a new user field to the create form

**Files to modify**:
1. `src/components/CreateUser.jsx` - Add input field and state
2. Backend - Update user model (outside this repo)

**Steps**:
1. Read `CreateUser.jsx` to understand form structure
2. Add new state: `const [newField, setNewField] = useState('')`
3. Add input in form JSX
4. Include field in `userData` object passed to `createUser()`
5. Update backend model to accept new field

### Task: Add a new statistics card to dashboard

**File**: `src/components/Dashboard.jsx:49-73`

**Steps**:
1. Read `Dashboard.jsx` to understand stats structure
2. Add new stat to `stats` state object
3. Calculate stat in `fetchStats()` function
4. Add new card in JSX grid (copy existing card pattern)
5. Update CSS if needed

### Task: Modify authentication to allow a new role

**Files to modify**:
1. `src/components/Login.jsx:22-26` - Role check
2. `src/App.jsx:39` - Session restoration role check
3. Backend - Role validation (outside this repo)

**Steps**:
1. Update role check to accept new role: `if (data.usuario.rol !== 'admin' && data.usuario.rol !== 'newRole')`
2. Update session restoration check similarly
3. Update backend role validation

### Task: Add a new navigation link

**Files to modify**:
1. `src/components/Navbar.jsx` - Add new link
2. `src/App.jsx` - Add new route

**Steps**:
1. Read `Navbar.jsx` to understand nav structure
2. Add `<Link to="/new-path">New Page</Link>`
3. Create new component file
4. Add route in `App.jsx` using protected route pattern

### Task: Change API base URL for production

**File**: `src/services/api.js:4`

**Current**: `baseURL: 'http://localhost:8080'`

**Production approach**:
```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
  // ...
});
```

Then create `.env.production`:
```
VITE_API_URL=https://api.production.com
```

---

## Testing Recommendations

**Current state**: No automated tests in the project.

**Recommended testing setup**:
1. **Unit tests**: Vitest (Vite's testing framework)
2. **Component tests**: React Testing Library
3. **E2E tests**: Playwright or Cypress

**Priority test cases**:
1. Login flow (admin vs. non-admin)
2. Protected route access
3. Token expiration handling (401 response)
4. User CRUD operations
5. Role change functionality

---

## Environment Variables

**Current**: No environment variables used.

**Recommended for production**:

```env
# .env.production
VITE_API_URL=https://api.production.com
VITE_APP_NAME=EntrevistaApp Admin
```

**Usage in code**:
```javascript
const apiUrl = import.meta.env.VITE_API_URL;
```

**Note**: Vite requires `VITE_` prefix for env vars to be exposed to client code.

---

## Browser Support

**Target**: Modern browsers (ES6+ support required)

**Required features**:
- ES6 Modules
- Async/await
- Fetch API (axios uses it)
- LocalStorage
- CSS Grid & Flexbox

**Note**: No polyfills included; IE11 not supported.

---

## Deployment Considerations

### Build for Production

```bash
npm run build
```

**Output**: `dist/` directory with static files

### Production Checklist

- [ ] Update API base URL to production backend
- [ ] Enable HTTPS
- [ ] Configure CORS on backend for production domain
- [ ] Set up environment variables
- [ ] Consider moving JWT to httpOnly cookies (security)
- [ ] Add error tracking (Sentry, LogRocket, etc.)
- [ ] Add analytics if needed
- [ ] Optimize images and assets
- [ ] Test with production backend
- [ ] Set up CDN for static assets (optional)

### Hosting Options

- **Static hosting**: Vercel, Netlify, GitHub Pages
- **Container**: Docker + Nginx
- **Server**: Node.js + serve package

**Important**: This is a pure frontend app; backend must be deployed separately.

---

## Troubleshooting Guide

### Common Issues

#### 1. CORS Error
**Symptom**: `Access-Control-Allow-Origin` error in console

**Solution**: Configure backend to allow `http://localhost:5173`:
```kotlin
// Backend CORS config
install(CORS) {
    allowHost("localhost:5173", schemes = listOf("http"))
    allowHeader(HttpHeaders.Authorization)
    allowHeader(HttpHeaders.ContentType)
    allowCredentials = true
}
```

#### 2. 401 Unauthorized on API Calls
**Symptom**: Automatic logout, redirected to login

**Causes**:
- Token expired
- Token invalid
- Backend not receiving token

**Debug**:
1. Check token in localStorage: `localStorage.getItem('token')`
2. Decode JWT at jwt.io to check expiration
3. Check Network tab for Authorization header
4. Verify backend is validating token correctly

#### 3. Admin Check Failing
**Symptom**: "Acceso denegado" message after login

**Causes**:
- User doesn't have admin role
- JWT doesn't contain role claim
- Role field name mismatch

**Debug**:
1. Decode JWT to check role claim
2. Verify backend sets `role` claim in JWT
3. Check `Login.jsx:22` for role check logic

#### 4. Routes Not Working After Refresh
**Symptom**: 404 error on refresh

**Solution**: Configure server to redirect all routes to `index.html` (SPA routing)

**Nginx example**:
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

#### 5. Styles Not Applying
**Symptom**: Components look unstyled

**Checks**:
1. CSS file imported in component: `import './Component.css'`
2. CSS class names match JSX className attributes
3. No CSS syntax errors
4. Check browser DevTools for CSS loading errors

---

## Git Workflow

**Current branch structure**:
- `main` or `master`: Production-ready code
- Feature branches: `feature/feature-name` or `claude/session-id`

**Commit message conventions**:
Follow existing style in repository.

**Example**:
```
git commit -m "Add user search functionality to UserList component"
```

---

## Additional Resources

### Related Documentation
- **User Documentation**: `ADMIN_PANEL_README.md` (Spanish, for end users)
- **Backend API**: Check backend repository for API documentation

### External Documentation
- [React Documentation](https://react.dev/)
- [React Router v7](https://reactrouter.com/)
- [Vite Documentation](https://vite.dev/)
- [Axios Documentation](https://axios-http.com/)

---

## Quick Reference

### File Import Paths

```javascript
// Components
import ComponentName from './components/ComponentName'

// Services
import { apiFunction } from '../services/api'

// CSS
import './ComponentName.css'

// React Router
import { Link, useNavigate, Navigate } from 'react-router-dom'

// React
import { useState, useEffect } from 'react'
```

### Common Code Snippets

**Get current user**:
```javascript
const user = JSON.parse(localStorage.getItem('user'));
console.log(user.rol); // 'admin'
```

**Check if authenticated**:
```javascript
const isAuth = !!localStorage.getItem('token');
```

**Navigate programmatically**:
```javascript
const navigate = useNavigate();
navigate('/dashboard');
```

**API call with error handling**:
```javascript
try {
  const data = await apiFunction();
  // Handle success
} catch (err) {
  console.error('Error:', err);
  setError(err.response?.data?.error || 'Default error message');
}
```

---

## Summary for AI Assistants

When working on this codebase:

1. **Always read files first** before making changes
2. **Follow React functional component patterns** with hooks
3. **Use centralized API functions** from `services/api.js`
4. **Respect Spanish naming** for user-facing variables
5. **Maintain admin-only access** for all protected features
6. **Handle errors and loading states** in all async operations
7. **Follow the protected route pattern** for new pages
8. **Co-locate styles** with components
9. **Use the axios interceptor pattern** (don't bypass it)
10. **Test with `npm run dev`** before committing

**Remember**: This is an admin-only panel. Security and role validation are critical.

---

**Last Updated**: 2025-11-15
**Version**: 1.0.0
**Maintained by**: AI Assistant (Claude)
