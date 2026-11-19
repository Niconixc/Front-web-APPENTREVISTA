import { useEffect, useRef, useState } from 'react';
import { createBillingCode, mensajeDeError } from '../services/api';
import Icono from './Icono';
import './BillingCodes.css';

// V2 no tiene GET /billing/admin/codes: la tabla muestra solo los códigos creados en esta sesión del navegador.
// Se guardan en sessionStorage para no perderlos al cambiar de pantalla del panel (se borran al cerrar la pestaña).
const CLAVE_SESION = 'panel:codigosCreados';
const LARGO_MAXIMO_ETIQUETA = 80;

const FORMULARIO_INICIAL = { days: '30', label: '', max_uses: '1', license_type: 'PROM', expires_at: '' };

const leerCodigosGuardados = () => {
  try {
    const guardados = JSON.parse(sessionStorage.getItem(CLAVE_SESION));
    return Array.isArray(guardados) ? guardados : [];
  } catch {
    return [];
  }
};

const guardarCodigos = (codigos) => {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(codigos));
  } catch {
    // Sin almacenamiento disponible: la lista dura lo que la pantalla.
  }
};

/** Fecha y hora local actuales en el formato de <input type="datetime-local"> (AAAA-MM-DDTHH:MM). */
const ahoraLocal = () => {
  const ahora = new Date();
  ahora.setSeconds(0, 0);
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString('es-CL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TIPOS_LICENCIA = {
  PROM: { label: 'Promocional' },
  INST: { label: 'Institucional' },
  GOOG: { label: 'Google' },
};

const getLicenseTypeBadge = (type) => TIPOS_LICENCIA[type] || { label: type || '—' };

/** Ícono del botón copiar: los dos están montados y se cruzan (el check entra con escala y desenfoque). */
const IconoCopiar = ({ copiado }) => (
  <span className={`codigos-copiar__iconos${copiado ? ' codigos-copiar__iconos--hecho' : ''}`}>
    <Icono nombre="copiar" className="codigos-copiar__icono codigos-copiar__icono--copiar" />
    <Icono nombre="check" className="codigos-copiar__icono codigos-copiar__icono--check" />
  </span>
);

const BillingCodes = () => {
  const [codes, setCodes] = useState(leerCodigosGuardados);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [copiedCode, setCopiedCode] = useState('');
  const [formData, setFormData] = useState(FORMULARIO_INICIAL);
  const temporizadorCopia = useRef(null);

  useEffect(() => () => clearTimeout(temporizadorCopia.current), []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /** Mismas reglas que V2 (SERVICIO_SUSCRIPCION.crearCodigo), para avisar antes de enviar. */
  const validar = () => {
    const dias = Number(formData.days);
    const usos = Number(formData.max_uses);
    if (!Number.isInteger(dias) || dias < 1) {
      return 'La duración del premium debe ser de al menos 1 día';
    }
    if (!Number.isInteger(usos) || usos < 1) return 'Los usos máximos deben ser al menos 1';
    if (formData.label.trim().length > LARGO_MAXIMO_ETIQUETA) {
      return `La etiqueta no puede superar ${LARGO_MAXIMO_ETIQUETA} caracteres`;
    }
    if (formData.expires_at) {
      const limite = new Date(formData.expires_at);
      if (Number.isNaN(limite.getTime())) return 'La fecha "Canjeable hasta" no es válida';
      if (limite.getTime() <= Date.now()) return 'La fecha "Canjeable hasta" debe ser futura';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (creating) return;
    setError('');
    setSuccess(null);

    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }

    const etiqueta = formData.label.trim();
    const dias = Number(formData.days);
    const solicitud = {
      days: dias,
      max_uses: Number(formData.max_uses),
      license_type: formData.license_type,
    };
    if (etiqueta) solicitud.label = etiqueta;
    // datetime-local está en hora local; V2 espera un Instant ISO-8601 con zona (Instant.parse).
    if (formData.expires_at) solicitud.expires_at = new Date(formData.expires_at).toISOString();

    setCreating(true);
    try {
      const newCode = await createBillingCode(solicitud);
      const fila = {
        code: newCode.code,
        codigo_id: newCode.code,
        license_type: newCode.license_type ?? solicitud.license_type,
        max_uses: newCode.max_uses ?? solicitud.max_uses,
        expires_at: newCode.expires_at ?? null,
        label: etiqueta || null,
        duracion_dias: dias,
        created_at: new Date().toISOString(),
      };
      setCodes((prev) => {
        const lista = [fila, ...prev.filter((c) => c.codigo_id !== fila.codigo_id)];
        guardarCodigos(lista);
        return lista;
      });
      setSuccess({
        texto: (typeof newCode.mensaje === 'string' && newCode.mensaje) || 'Código promocional creado',
        code: newCode.code,
      });
      setFormData(FORMULARIO_INICIAL);
    } catch (err) {
      console.error('Error al crear el código:', err);
      setError(mensajeDeError(err, 'Error al crear el código'));
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      clearTimeout(temporizadorCopia.current);
      temporizadorCopia.current = setTimeout(() => setCopiedCode(''), 2000);
    } catch {
      setError('No se pudo copiar al portapapeles; selecciona el código y cópialo a mano');
    }
  };

  const limpiarLista = () => {
    if (!window.confirm('¿Quitar la lista de esta sesión? Los códigos siguen existiendo en el servidor; solo se dejan de mostrar aquí.')) {
      return;
    }
    setCodes([]);
    guardarCodigos([]);
  };

  const diasTexto = Number.isInteger(Number(formData.days)) && Number(formData.days) > 0 ? Number(formData.days) : 'N';

  return (
    <div className="pagina">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <h1 className="encabezado-pagina__titulo">Códigos de suscripción</h1>
          <p className="encabezado-pagina__descripcion">Crea códigos promocionales para suscripciones premium</p>
        </div>
      </header>

      {/* Formulario de creación */}
      <p className="sr-only" role="status">{copiedCode ? `Código ${copiedCode} copiado al portapapeles.` : ''}</p>

      <section className="tarjeta codigos-tarjeta" aria-labelledby="codigos-crear-titulo">
        <div className="codigos-cabecera">
          <span className="codigos-cabecera__icono" aria-hidden="true"><Icono nombre="codigos" tamano={18} /></span>
          <div className="codigos-cabecera__textos">
            <h2 id="codigos-crear-titulo" className="codigos-cabecera__titulo">Crear nuevo código</h2>
            <p className="codigos-cabecera__sub">El servidor genera el código; aquí eliges qué entrega y cuántas veces se puede canjear.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="tarjeta__cuerpo">
            <div className="codigos-campos">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="license_type">Tipo de licencia</label>
                <select
                  id="license_type"
                  name="license_type"
                  value={formData.license_type}
                  onChange={handleInputChange}
                  required
                >
                  <option value="PROM">Promocional (PROM)</option>
                  <option value="INST">Institucional (INST)</option>
                  <option value="GOOG">Google Play (GOOG)</option>
                </select>
              </div>

              <div className="campo">
                <label className="campo__etiqueta" htmlFor="days">Duración del premium (días)</label>
                <input
                  type="number"
                  id="days"
                  name="days"
                  value={formData.days}
                  onChange={handleInputChange}
                  min="1"
                  max="365"
                  step="1"
                  required
                />
              </div>

              <div className="campo">
                <label className="campo__etiqueta" htmlFor="max_uses">Usos máximos</label>
                <input
                  type="number"
                  id="max_uses"
                  name="max_uses"
                  value={formData.max_uses}
                  onChange={handleInputChange}
                  min="1"
                  max="1000"
                  step="1"
                  required
                />
              </div>

              <div className="campo codigos-campo-etiqueta">
                <label className="campo__etiqueta" htmlFor="label">
                  Etiqueta <span className="campo__opcional">(opcional)</span>
                </label>
                <input
                  type="text"
                  id="label"
                  name="label"
                  value={formData.label}
                  onChange={handleInputChange}
                  placeholder="Ej: Campaña Navidad 2026"
                  maxLength={LARGO_MAXIMO_ETIQUETA}
                />
              </div>

              <div className="campo">
                <label className="campo__etiqueta" htmlFor="expires_at">
                  Canjeable hasta <span className="campo__opcional">(opcional)</span>
                </label>
                <input
                  type="datetime-local"
                  id="expires_at"
                  name="expires_at"
                  value={formData.expires_at}
                  onChange={handleInputChange}
                  min={ahoraLocal()}
                  aria-describedby="expires_at-ayuda"
                />
                <small id="expires_at-ayuda" className="campo__ayuda">
                  Si lo dejas vacío, el código deja de poder canjearse a los {diasTexto} días de creado (la misma
                  duración del premium).
                </small>
              </div>
            </div>

            {error && (
              <div className="aviso aviso--peligro" role="alert">
                <Icono nombre="alerta" className="aviso__icono" />
                <div className="aviso__contenido">{error}</div>
              </div>
            )}
            {success && (
              <div className="aviso aviso--exito" role="status">
                <Icono nombre="check-circulo" className="aviso__icono" />
                <div className="aviso__contenido codigos-exito">
                  <span className="codigos-exito__texto">
                    {success.texto}: <code className="mono codigos-exito__codigo">{success.code}</code>
                  </span>
                  <button
                    type="button"
                    className={`boton boton--chico boton--icono codigos-copiar${copiedCode === success.code ? ' codigos-copiar--hecho' : ''}`}
                    onClick={() => copyToClipboard(success.code)}
                    title={copiedCode === success.code ? 'Código copiado' : 'Copiar código'}
                    aria-label={copiedCode === success.code ? `Código ${success.code} copiado` : `Copiar el código ${success.code}`}
                  >
                    <IconoCopiar copiado={copiedCode === success.code} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="tarjeta__pie">
            <button type="submit" className="boton boton--primario" disabled={creating}>
              {!creating && <Icono nombre="mas" />}
              {creating ? 'Creando…' : 'Crear código'}
            </button>
          </div>
        </form>
      </section>

      {/* Lista local de códigos */}
      <section className="tarjeta codigos-tarjeta" aria-labelledby="codigos-lista-titulo">
        <div className="codigos-cabecera">
          <div className="codigos-cabecera__textos">
            <h2 id="codigos-lista-titulo" className="codigos-cabecera__titulo">
              Códigos creados en esta sesión <span className="codigos-contador mono">{codes.length}</span>
            </h2>
            <p className="codigos-cabecera__sub">
              El servidor V2 todavía no permite listar códigos: aquí ves solo los creados en esta sesión del navegador.
              Los usos no se actualizan en tiempo real.
            </p>
          </div>
          {codes.length > 0 && (
            <button type="button" className="boton boton--chico" onClick={limpiarLista}>
              Quitar lista
            </button>
          )}
        </div>

        {codes.length === 0 ? (
          <div className="vacio codigos-vacio">
            <span className="chip-icono" aria-hidden="true"><Icono nombre="codigos" tamano={18} /></span>
            <p>No hay códigos creados en esta sesión.</p>
          </div>
        ) : (
          <ul className="codigos-filas">
            {codes.map((code) => {
              const badge = getLicenseTypeBadge(code.license_type);
              const vence = code.expires_at ? Date.parse(code.expires_at) : Number.NaN;
              const isExpired = !Number.isNaN(vence) && vence < Date.now();
              const tipo = TIPOS_LICENCIA[code.license_type] ? code.license_type : 'otro';

              return (
                <li key={code.codigo_id} className={`codigos-fila${isExpired ? ' codigos-fila--expirada' : ''}`}>
                  <span className={`codigos-fila__icono codigos-fila__icono--${tipo}`} aria-hidden="true">
                    <Icono nombre="codigos" tamano={16} />
                  </span>
                  <div className="codigos-fila__principal">
                    <div className="codigos-fila__linea">
                      <span className="mono codigos-codigo">{code.code}</span>
                      <span className="insignia">{badge.label}</span>
                      {isExpired ? (
                        <span className="insignia insignia--punto">Expirado</span>
                      ) : (
                        <span className="insignia insignia--punto insignia--exito">Vigente</span>
                      )}
                    </div>
                    <dl className="codigos-datos">
                      <div className="codigos-dato codigos-dato--etiqueta">
                        <dt>Etiqueta</dt>
                        <dd>{code.label || '-'}</dd>
                      </div>
                      <div className="codigos-dato">
                        <dt>Duración</dt>
                        <dd className="mono">{code.duracion_dias != null ? `${code.duracion_dias} días` : '—'}</dd>
                      </div>
                      <div className="codigos-dato">
                        <dt>Usos</dt>
                        <dd>
                          <span className="codigos-usos mono" title="No disponible en V2">
                            —/{code.max_uses ?? '—'}
                          </span>
                        </dd>
                      </div>
                      <div className="codigos-dato">
                        <dt>Creado</dt>
                        <dd className="mono">{formatDate(code.created_at)}</dd>
                      </div>
                      <div className="codigos-dato">
                        <dt>Canjeable hasta</dt>
                        <dd className="mono">{formatDate(code.expires_at)}</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    className={`boton boton--sutil boton--chico boton--icono codigos-copiar${copiedCode === code.code ? ' codigos-copiar--hecho' : ''}`}
                    onClick={() => copyToClipboard(code.code)}
                    title={copiedCode === code.code ? 'Código copiado' : 'Copiar código'}
                    aria-label={copiedCode === code.code ? `Código ${code.code} copiado` : `Copiar el código ${code.code}`}
                  >
                    <IconoCopiar copiado={copiedCode === code.code} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default BillingCodes;
