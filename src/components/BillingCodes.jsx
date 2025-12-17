import { useEffect, useState, useCallback } from 'react';
import { getBillingCodes, createBillingCode } from '../services/api';
import './BillingCodes.css';

const BillingCodes = () => {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    days: 30,
    label: '',
    max_uses: 1,
    license_type: 'PROM'
  });

  /* 
   * NOTA: Deshabilitamos fetchCodes al inicio porque el backend no tiene un endpoint GET /billing/admin/codes
   * Solo soportan POST para crear. Mantendremos una lista local de la sesión actual.
   */
  const fetchCodes = useCallback(async () => {
    // try {
    //   setLoading(true);
    //   const data = await getBillingCodes();
    //   setCodes(data);
    // } catch (err) {
    //   console.error('Error fetching codes:', err);
    //   // Silenciamos el error para no alarmar al usuario, ya que sabemos que GET no existe
    //   // setError('Error al cargar los códigos'); 
    // } finally {
    //   setLoading(false);
    // }
    setLoading(false); // Simplemente terminamos carga
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'days' || name === 'max_uses' ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      const newCode = await createBillingCode(formData);
      setSuccess(`Código creado: ${newCode.code}`);
      setFormData({ days: 30, label: '', max_uses: 1, license_type: 'PROM' });

      // Agregamos manualmente el código a la lista (ya que no podemos hacer refetch)
      setCodes(prev => [
        {
          ...newCode,
          // Mapeamos campos para que coincidan con la tabla si es necesario
          codigo_id: newCode.code,
          duracion_dias: formData.days,
          uses_count: 0,
          created_at: new Date().toISOString(),
          activo: true
        },
        ...prev
      ]);

    } catch (err) {
      console.error('Error creating code:', err);
      // Extraer mensaje de error seguro del proxy
      const msg = err.response?.data?.error || err.response?.data || 'Error al crear el código';
      setError(typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Sin expiración';
    return new Date(isoString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getLicenseTypeBadge = (type) => {
    const badges = {
      'PROM': { label: 'Promocional', class: 'badge-promo' },
      'INST': { label: 'Institucional', class: 'badge-inst' },
      'GOOG': { label: 'Google', class: 'badge-google' },
      'GEN': { label: 'General', class: 'badge-general' }
    };
    return badges[type] || badges['GEN'];
  };

  if (loading) {
    return (
      <div className="billing-codes">
        <div className="loading">Cargando códigos...</div>
      </div>
    );
  }

  return (
    <div className="billing-codes">
      <div className="billing-header">
        <h1>Gestión de Códigos de Suscripción</h1>
        <p className="subtitle">Crea y administra códigos promocionales para suscripciones premium</p>
      </div>

      {/* Formulario de creación */}
      <div className="create-code-section">
        <h2>Crear Nuevo Código</h2>
        <form onSubmit={handleSubmit} className="create-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="license_type">Tipo de Licencia</label>
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

            <div className="form-group">
              <label htmlFor="days">Duración (días)</label>
              <input
                type="number"
                id="days"
                name="days"
                value={formData.days}
                onChange={handleInputChange}
                min="1"
                max="365"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="max_uses">Usos Máximos</label>
              <input
                type="number"
                id="max_uses"
                name="max_uses"
                value={formData.max_uses}
                onChange={handleInputChange}
                min="1"
                max="1000"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group form-group-wide">
              <label htmlFor="label">Etiqueta (opcional)</label>
              <input
                type="text"
                id="label"
                name="label"
                value={formData.label}
                onChange={handleInputChange}
                placeholder="Ej: Campaña Navidad 2024"
                maxLength="80"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-create" disabled={creating}>
            {creating ? '⏳ Creando...' : '➕ Crear Código'}
          </button>
        </form>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
      </div>

      {/* Lista de códigos */}
      <div className="codes-list-section">
        <h2>Códigos Existentes ({codes.length})</h2>

        {codes.length === 0 ? (
          <div className="empty-state">
            <p>No hay códigos creados en esta sesión.</p>
            <small>(El historial completo no está disponible en este momento)</small>
          </div>
        ) : (
          <div className="codes-table-container">
            <table className="codes-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Etiqueta</th>
                  <th>Duración</th>
                  <th>Usos</th>
                  <th>Creado</th>
                  <th>Expira</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => {
                  const badge = getLicenseTypeBadge(code.license_type);
                  const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
                  const isFullyUsed = code.uses_count >= code.max_uses;

                  return (
                    <tr key={code.codigo_id} className={!code.activo || isExpired || isFullyUsed ? 'inactive-row' : ''}>
                      <td className="code-cell">
                        <code>{code.code}</code>
                      </td>
                      <td>
                        <span className={`badge ${badge.class}`}>{badge.label}</span>
                      </td>
                      <td>{code.label || '-'}</td>
                      <td>{code.duracion_dias} días</td>
                      <td>
                        <span className={isFullyUsed ? 'uses-full' : ''}>
                          {code.uses_count} / {code.max_uses}
                        </span>
                      </td>
                      <td>{formatDate(code.created_at)}</td>
                      <td className={isExpired ? 'expired' : ''}>
                        {formatDate(code.expires_at)}
                      </td>
                      <td>
                        {!code.activo ? (
                          <span className="status inactive">Inactivo</span>
                        ) : isExpired ? (
                          <span className="status expired">Expirado</span>
                        ) : isFullyUsed ? (
                          <span className="status used">Agotado</span>
                        ) : (
                          <span className="status active">Activo</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-copy"
                          onClick={() => copyToClipboard(code.code)}
                          title="Copiar código"
                        >
                          {copiedCode === code.code ? '✅' : '📋'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingCodes;
