import { useEffect, useId, useMemo, useState } from 'react';
import { getCargos, getSkillsDeCargo, mensajeDeError } from '../services/api';
import { CATEGORIAS, LIMITES, NIVELES, TIPOS, etiqueta, opcionVacia } from '../services/etiquetas';
import Icono from './Icono';
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
  const enMinimoDeOpciones = form.opciones.length <= LIMITES.opcionesMinimas;
  const enMaximoDeOpciones = form.opciones.length >= LIMITES.opcionesMaximas;

  return (
    <div className="formulario">
      <div className="rejilla-campos qform-rejilla">
        {/* Enunciado */}
        <div className="campo campo--ancho">
          <label htmlFor="enunciado" className="campo__etiqueta">
            Enunciado <span className="qform-obligatorio">*</span>
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
          <small
            className={`campo__contador${form.enunciado.length >= LIMITES.enunciado ? ' qform-contador--limite' : ''}`}
          >
            {form.enunciado.length}/{LIMITES.enunciado}
          </small>
        </div>

        {/* Categoría */}
        <div className="campo">
          <label htmlFor="categoria" className="campo__etiqueta">
            Categoría <span className="qform-obligatorio">*</span>
          </label>
          <select id="categoria" name="categoria" value={form.categoria} onChange={handleChange} required>
            {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Tipo */}
        <div className="campo">
          <label htmlFor="tipo" className="campo__etiqueta">
            Tipo <span className="qform-obligatorio">*</span>
          </label>
          <select id="tipo" name="tipo" value={form.tipo} onChange={handleTipo} required>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Nivel */}
        <div className="campo">
          <label htmlFor="nivel" className="campo__etiqueta">
            Nivel <span className="qform-obligatorio">*</span>
          </label>
          <select id="nivel" name="nivel" value={form.nivel} onChange={handleChange} required>
            {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </div>
      </div>

      {/* Contexto: Área → Cargo → Skill */}
      <fieldset className="conjunto">
        <legend>
          Contexto <span className="qform-obligatorio">*</span>
        </legend>
        <p className="campo__ayuda">Indica el cargo o la skill que evalúa la pregunta (al menos uno de los dos).</p>
        {errorCargos && (
          <div className="aviso aviso--peligro">
            <Icono nombre="alerta" className="aviso__icono" />
            <div className="aviso__contenido qform-error-cargos">
              <span>{errorCargos}</span>
              <button
                type="button"
                className="boton boton--chico"
                onClick={() => setIntentoCargos((n) => n + 1)}
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        <div className="rejilla-campos qform-rejilla">
          <div className="campo">
            <label htmlFor="area" className="campo__etiqueta">Área</label>
            <select id="area" value={area} onChange={handleArea} disabled={cargandoCargos || areas.length === 0}>
              <option value="">{cargandoCargos ? 'Cargando áreas...' : 'Selecciona un área'}</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="cargoId" className="campo__etiqueta">Cargo</label>
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

          <div className="campo">
            <label htmlFor="skillId" className="campo__etiqueta">
              Skill <span className="campo__opcional">(opcional)</span>
            </label>
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
            {errorSkills && <small className="campo__error">{errorSkills}</small>}
            {form.cargoId && !cargandoSkills && !errorSkills && skills.length === 0 && (
              <small className="campo__ayuda">Este cargo no tiene skills cargadas.</small>
            )}
          </div>
        </div>
      </fieldset>

      {/* Opción múltiple: opciones */}
      {esMultiple && (
        <fieldset className="conjunto">
          <legend>
            Opciones de respuesta <span className="qform-obligatorio">*</span>
          </legend>
          <p className="campo__ayuda">
            Entre {LIMITES.opcionesMinimas} y {LIMITES.opcionesMaximas} opciones, sin repetir, con exactamente una correcta.
            La explicación es opcional.
          </p>
          <ol className="qform-opciones">
            {form.opciones.map((opcion, i) => (
              <li key={i} className={`qform-opcion${opcion.esCorrecta ? ' qform-opcion--correcta' : ''}`}>
                <span className="qform-opcion__letra">{letra(i)}.</span>
                <div className="qform-opcion__textos">
                  <input
                    type="text"
                    value={opcion.texto}
                    onChange={(e) => cambiarOpcion(i, { texto: e.target.value })}
                    placeholder={`Opción ${letra(i)}`}
                    aria-label={`Texto de la opción ${letra(i)}`}
                    required
                  />
                  <input
                    type="text"
                    className="qform-opcion__explicacion"
                    value={opcion.explicacion}
                    onChange={(e) => cambiarOpcion(i, { explicacion: e.target.value })}
                    placeholder={`Explicación de la opción ${letra(i)} (opcional)`}
                    aria-label={`Explicación de la opción ${letra(i)}`}
                  />
                </div>
                <div className="qform-opcion__acciones">
                  <label className="casilla texto-chico">
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
                    className="boton boton--sutil boton--icono boton--chico"
                    aria-label={`Quitar la opción ${letra(i)}`}
                    title={enMinimoDeOpciones
                      ? `Debe haber al menos ${LIMITES.opcionesMinimas} opciones`
                      : 'Quitar opción'}
                    disabled={enMinimoDeOpciones}
                  >
                    <Icono nombre="cerrar" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div>
            <button
              type="button"
              onClick={agregarOpcion}
              className="boton boton--chico"
              disabled={enMaximoDeOpciones}
            >
              {!enMaximoDeOpciones && <Icono nombre="mas" />}
              {enMaximoDeOpciones ? `Máximo ${LIMITES.opcionesMaximas} opciones` : 'Agregar opción'}
            </button>
          </div>
        </fieldset>
      )}

      {/* Abierta / simulación: respuesta ideal + rúbrica */}
      {!esMultiple && (
        <>
          <div className="campo">
            <label htmlFor="respuestaIdeal" className="campo__etiqueta">Respuesta ideal</label>
            <textarea
              id="respuestaIdeal"
              name="respuestaIdeal"
              value={form.respuestaIdeal}
              onChange={handleChange}
              placeholder="Describe cómo sería una buena respuesta..."
              rows={4}
            />
            <small className="campo__ayuda">
              Para una pregunta {etiqueta(TIPOS, form.tipo).toLowerCase()} se exige una respuesta ideal o una rúbrica con
              al menos un criterio o una palabra clave.
            </small>
          </div>

          <fieldset className="conjunto">
            <legend>
              Rúbrica <span className="campo__opcional">(opcional)</span>
            </legend>
            <div className="rejilla-campos">
              <div className="campo campo--ancho">
                <label htmlFor="rubricaCriterios" className="campo__etiqueta">Criterios (uno por línea)</label>
                <textarea
                  id="rubricaCriterios"
                  name="rubricaCriterios"
                  value={form.rubricaCriterios}
                  onChange={handleChange}
                  placeholder={'Describe la situación con claridad\nExplica las acciones que tomó\nCuantifica el resultado'}
                  rows={4}
                />
              </div>
              <div className="campo">
                <label htmlFor="rubricaPalabrasClave" className="campo__etiqueta">Palabras clave (separadas por coma)</label>
                <input
                  type="text"
                  id="rubricaPalabrasClave"
                  name="rubricaPalabrasClave"
                  value={form.rubricaPalabrasClave}
                  onChange={handleChange}
                  placeholder="ej: liderazgo, prioridades, comunicación"
                />
                <small className="campo__ayuda">Las usa la evaluación automática del plan gratuito.</small>
              </div>
              <div className="campo">
                <label htmlFor="rubricaTiempoSeg" className="campo__etiqueta">Tiempo esperado (segundos)</label>
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
              <small className="campo__ayuda">
                La rúbrica guardada tiene otros datos que se conservan al guardar: {clavesExtraRubrica.join(', ')}.
              </small>
            )}
          </fieldset>
        </>
      )}
    </div>
  );
};

export default QuestionFields;
