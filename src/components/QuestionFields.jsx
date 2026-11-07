import { useEffect, useId, useMemo, useState } from 'react';
import { getCargos, getSkillsDeCargo, mensajeDeError } from '../services/api';
import { CATEGORIAS, LIMITES, NIVELES, TIPOS, etiqueta, opcionVacia } from '../services/etiquetas';
import './QuestionForm.css';

// Campos compartidos por "Crear pregunta" (QuestionForm) y "Editar pregunta" (QuestionEdit).
// Recibe el estado del formulario (ver formularioVacio / desdeRespuestaPregunta en etiquetas.js) y su setter.
// El área no se envía a V2: se deriva del cargo elegido o se guarda aquí mientras no hay cargo.

const letra = (i) => String.fromCharCode(65 + i);
const idCorto = (id) => String(id || '').slice(0, 8);
const CLAVES_RUBRICA_EDITABLES = ['criterios', 'palabras_clave', 'tiempo_esperado_seg'];

const QuestionFields = ({ form, setForm }) => {
  const radioName = `correcta-${useId()}`;

  // ---------- Catálogo de cargos ----------
  const [cargos, setCargos] = useState([]);
  const [cargandoCargos, setCargandoCargos] = useState(true);
  const [errorCargos, setErrorCargos] = useState('');
  const [intentoCargos, setIntentoCargos] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargandoCargos(true);
    setErrorCargos('');
    getCargos()
      .then((lista) => { if (vigente) setCargos(Array.isArray(lista) ? lista : []); })
      .catch((err) => { if (vigente) setErrorCargos(mensajeDeError(err, 'No se pudieron cargar los cargos')); })
      .finally(() => { if (vigente) setCargandoCargos(false); });
    return () => { vigente = false; };
  }, [intentoCargos]);

  const areas = useMemo(
    () => [...new Set(cargos.map((c) => c.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [cargos]
  );

  const cargoActual = cargos.find((c) => c.cargoId === form.cargoId) || null;
  const [areaElegida, setAreaElegida] = useState('');
  const area = cargoActual?.area ?? areaElegida;

  const cargosDelArea = useMemo(
    () => cargos.filter((c) => c.area === area).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es')),
    [cargos, area]
  );

  // ---------- Skills del cargo ----------
  const [skills, setSkills] = useState([]);
  const [cargandoSkills, setCargandoSkills] = useState(false);
  const [errorSkills, setErrorSkills] = useState('');

  useEffect(() => {
    if (!form.cargoId) {
      setSkills([]);
      setErrorSkills('');
      return undefined;
    }
    let vigente = true;
    setCargandoSkills(true);
    setErrorSkills('');
    getSkillsDeCargo(form.cargoId)
      .then((data) => { if (vigente) setSkills(Array.isArray(data?.skills) ? data.skills : []); })
      .catch((err) => {
        if (vigente) {
          setSkills([]);
          setErrorSkills(mensajeDeError(err, 'No se pudieron cargar las skills del cargo'));
        }
      })
      .finally(() => { if (vigente) setCargandoSkills(false); });
    return () => { vigente = false; };
  }, [form.cargoId]);

  const skillEnLista = skills.some((s) => s.skillId === form.skillId);

  // ---------- Cambios ----------
  const actualizar = (cambios) => setForm((prev) => ({ ...prev, ...cambios }));

  const handleChange = (e) => {
    const { name, value } = e.target;
    actualizar({ [name]: value });
  };

  const handleArea = (e) => {
    const nueva = e.target.value;
    setAreaElegida(nueva);
    if (cargoActual && cargoActual.area !== nueva) actualizar({ cargoId: '', skillId: '' });
  };

  const handleCargo = (e) => {
    // Al cambiar de cargo, la skill elegida puede no pertenecer al nuevo: se limpia.
    actualizar({ cargoId: e.target.value, skillId: '' });
  };

  const handleTipo = (e) => {
    const tipo = e.target.value;
    setForm((prev) => {
      let { opciones } = prev;
      if (tipo === 'opcion_multiple' && opciones.length < LIMITES.opcionesMinimas) {
        opciones = opciones.length === 0
          ? [opcionVacia(), opcionVacia(), opcionVacia(), opcionVacia()]
          : [...opciones, ...Array.from({ length: LIMITES.opcionesMinimas - opciones.length }, opcionVacia)];
      }
      return { ...prev, tipo, opciones };
    });
  };

  const cambiarOpcion = (indice, cambios) =>
    setForm((prev) => ({
      ...prev,
      opciones: prev.opciones.map((o, i) => (i === indice ? { ...o, ...cambios } : o)),
    }));

  const marcarCorrecta = (indice) =>
    setForm((prev) => ({
      ...prev,
      opciones: prev.opciones.map((o, i) => ({ ...o, esCorrecta: i === indice })),
    }));

  const agregarOpcion = () =>
    setForm((prev) => (prev.opciones.length >= LIMITES.opcionesMaximas
      ? prev
      : { ...prev, opciones: [...prev.opciones, opcionVacia()] }));

  const quitarOpcion = (indice) =>
    setForm((prev) => (prev.opciones.length <= LIMITES.opcionesMinimas
      ? prev
      : { ...prev, opciones: prev.opciones.filter((_, i) => i !== indice) }));

  const esMultiple = form.tipo === 'opcion_multiple';
  const clavesExtraRubrica = form.rubricaOriginal && typeof form.rubricaOriginal === 'object'
    ? Object.keys(form.rubricaOriginal).filter((k) => !CLAVES_RUBRICA_EDITABLES.includes(k))
    : [];

  return (
    <div className="form-grid">
      {/* Enunciado */}
      <div className="form-group full-width">
        <label htmlFor="enunciado">
          Enunciado <span className="required">*</span>
        </label>
        <textarea
          id="enunciado"
          name="enunciado"
          value={form.enunciado}
          onChange={handleChange}
          required
          maxLength={LIMITES.enunciado}
          placeholder="Escribe el enunciado de la pregunta..."
          rows={4}
        />
        <small className={`form-help qf-contador${form.enunciado.length >= LIMITES.enunciado ? ' qf-contador-limite' : ''}`}>
          {form.enunciado.length}/{LIMITES.enunciado}
        </small>
      </div>

      {/* Categoría */}
      <div className="form-group">
        <label htmlFor="categoria">
          Categoría <span className="required">*</span>
        </label>
        <select id="categoria" name="categoria" value={form.categoria} onChange={handleChange} required>
          {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Tipo */}
      <div className="form-group">
        <label htmlFor="tipo">
          Tipo <span className="required">*</span>
        </label>
        <select id="tipo" name="tipo" value={form.tipo} onChange={handleTipo} required>
          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Nivel */}
      <div className="form-group">
        <label htmlFor="nivel">
          Nivel <span className="required">*</span>
        </label>
        <select id="nivel" name="nivel" value={form.nivel} onChange={handleChange} required>
          {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
      </div>

      {/* Contexto: Área → Cargo → Skill */}
      <div className="form-group full-width">
        <label>
          Contexto <span className="required">*</span>
        </label>
        <small className="form-help qf-ayuda-arriba">
          Indica el cargo o la skill que evalúa la pregunta (al menos uno de los dos).
        </small>
        {errorCargos && (
          <div className="error-message qf-error-inline">
            {errorCargos}{' '}
            <button type="button" className="qf-link" onClick={() => setIntentoCargos((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="area">Área</label>
        <select id="area" value={area} onChange={handleArea} disabled={cargandoCargos || areas.length === 0}>
          <option value="">{cargandoCargos ? 'Cargando áreas...' : 'Selecciona un área'}</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="cargoId">Cargo</label>
        <select
          id="cargoId"
          name="cargoId"
          value={form.cargoId}
          onChange={handleCargo}
          disabled={cargandoCargos || (!area && !form.cargoId)}
        >
          <option value="">{area ? 'Sin cargo' : 'Primero selecciona un área'}</option>
          {/* Cargo guardado que ya no está en el catálogo activo: se muestra para no perderlo al guardar. */}
          {form.cargoId && !cargoActual && !cargandoCargos && (
            <option value={form.cargoId}>Cargo actual (no está en el catálogo activo · {idCorto(form.cargoId)})</option>
          )}
          {cargosDelArea.map((c) => <option key={c.cargoId} value={c.cargoId}>{c.nombre}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="skillId">Skill (opcional)</label>
        <select
          id="skillId"
          name="skillId"
          value={form.skillId}
          onChange={handleChange}
          disabled={cargandoSkills || (!form.cargoId && !form.skillId)}
        >
          <option value="">
            {cargandoSkills ? 'Cargando skills...' : (form.cargoId ? 'Sin skill específica' : 'Primero selecciona un cargo')}
          </option>
          {form.skillId && !skillEnLista && !cargandoSkills && (
            <option value={form.skillId}>Skill actual ({idCorto(form.skillId)})</option>
          )}
          {skills.map((s) => (
            <option key={s.skillId} value={s.skillId}>
              {s.categoria ? `${s.nombre} (${s.categoria})` : s.nombre}
            </option>
          ))}
        </select>
        {errorSkills && <small className="form-help qf-texto-error">{errorSkills}</small>}
        {form.cargoId && !cargandoSkills && !errorSkills && skills.length === 0 && (
          <small className="form-help">Este cargo no tiene skills cargadas.</small>
        )}
      </div>

      {/* Opción múltiple: opciones */}
      {esMultiple && (
        <div className="form-group full-width">
          <label>
            Opciones de respuesta <span className="required">*</span>
          </label>
          <small className="form-help qf-ayuda-arriba">
            Entre {LIMITES.opcionesMinimas} y {LIMITES.opcionesMaximas} opciones, sin repetir, con exactamente una correcta.
            La explicación es opcional.
          </small>
          <div className="opciones-container">
            {form.opciones.map((opcion, i) => (
              <div key={i} className={`qf-opcion${opcion.esCorrecta ? ' qf-opcion-correcta' : ''}`}>
                <div className="opcion-row qf-opcion-fila">
                  <span className="opcion-label">{letra(i)}.</span>
                  <input
                    type="text"
                    className="opcion-input"
                    value={opcion.texto}
                    onChange={(e) => cambiarOpcion(i, { texto: e.target.value })}
                    placeholder={`Opción ${letra(i)}`}
                    aria-label={`Texto de la opción ${letra(i)}`}
                    required
                  />
                  <label className="opcion-correcta">
                    <input
                      type="radio"
                      name={radioName}
                      checked={opcion.esCorrecta}
                      onChange={() => marcarCorrecta(i)}
                    />
                    Correcta
                  </label>
                  <button
                    type="button"
                    onClick={() => quitarOpcion(i)}
                    className="btn-remove-opcion"
                    title={form.opciones.length <= LIMITES.opcionesMinimas
                      ? `Debe haber al menos ${LIMITES.opcionesMinimas} opciones`
                      : 'Quitar opción'}
                    disabled={form.opciones.length <= LIMITES.opcionesMinimas}
                  >
                    ✕
                  </button>
                </div>
                <input
                  type="text"
                  className="opcion-input qf-explicacion"
                  value={opcion.explicacion}
                  onChange={(e) => cambiarOpcion(i, { explicacion: e.target.value })}
                  placeholder={`Explicación de la opción ${letra(i)} (opcional)`}
                  aria-label={`Explicación de la opción ${letra(i)}`}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={agregarOpcion}
              className="btn-add-opcion"
              disabled={form.opciones.length >= LIMITES.opcionesMaximas}
            >
              {form.opciones.length >= LIMITES.opcionesMaximas
                ? `Máximo ${LIMITES.opcionesMaximas} opciones`
                : '+ Agregar opción'}
            </button>
          </div>
        </div>
      )}

      {/* Abierta / simulación: respuesta ideal + rúbrica */}
      {!esMultiple && (
        <>
          <div className="form-group full-width">
            <label htmlFor="respuestaIdeal">Respuesta ideal</label>
            <textarea
              id="respuestaIdeal"
              name="respuestaIdeal"
              value={form.respuestaIdeal}
              onChange={handleChange}
              placeholder="Describe cómo sería una buena respuesta..."
              rows={4}
            />
            <small className="form-help">
              Para una pregunta {etiqueta(TIPOS, form.tipo).toLowerCase()} se exige una respuesta ideal o una rúbrica con
              al menos un criterio o una palabra clave.
            </small>
          </div>

          <div className="form-group full-width qf-rubrica">
            <span className="qf-rubrica-titulo">Rúbrica (opcional)</span>
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="rubricaCriterios">Criterios (uno por línea)</label>
                <textarea
                  id="rubricaCriterios"
                  name="rubricaCriterios"
                  value={form.rubricaCriterios}
                  onChange={handleChange}
                  placeholder={'Describe la situación con claridad\nExplica las acciones que tomó\nCuantifica el resultado'}
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label htmlFor="rubricaPalabrasClave">Palabras clave (separadas por coma)</label>
                <input
                  type="text"
                  id="rubricaPalabrasClave"
                  name="rubricaPalabrasClave"
                  value={form.rubricaPalabrasClave}
                  onChange={handleChange}
                  placeholder="ej: liderazgo, prioridades, comunicación"
                />
                <small className="form-help">Las usa la evaluación automática del plan gratuito.</small>
              </div>
              <div className="form-group">
                <label htmlFor="rubricaTiempoSeg">Tiempo esperado (segundos)</label>
                <input
                  type="number"
                  id="rubricaTiempoSeg"
                  name="rubricaTiempoSeg"
                  value={form.rubricaTiempoSeg}
                  onChange={handleChange}
                  min={1}
                  step={1}
                  placeholder="ej: 120"
                />
              </div>
            </div>
            {clavesExtraRubrica.length > 0 && (
              <small className="form-help">
                La rúbrica guardada tiene otros datos que se conservan al guardar: {clavesExtraRubrica.join(', ')}.
              </small>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default QuestionFields;
