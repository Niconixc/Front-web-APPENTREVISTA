import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  generateQuestionsAi,
  getCargos,
  getCostosIa,
  getSkillsDeCargo,
  mensajeDeError,
  codigoDeError,
} from '../services/api';
import {
  CATEGORIAS,
  ESTADOS_PREGUNTA,
  LIMITES,
  MODELOS_IA,
  NIVELES,
  TIPOS,
  etiqueta,
  formatearUsd,
} from '../services/etiquetas';
import { textoContextoMercado } from '../services/cobertura';
import {
  anuncioTopeActualizado,
  avisoAntesDeGenerar,
  idsDescripcionConfirmacion,
  leerTopeGeneracion,
  lineaTopeEnConfirmacion,
  notaTopeConLecturaNueva,
} from '../services/topeGeneracion';
import FondoModal from './FondoModal';
import TopeGeneracionIa from './TopeGeneracionIa';
import './GenerarPreguntas.css';

const RUTA_PENDIENTES_IA = '/preguntas?estado=pendiente&generadaPorIa=true';

// Códigos 502 de V2 que llegan DESPUÉS de que el proveedor respondió (la llamada probablemente se pagó).
// V2 guarda los tokens que el proveedor informó (siempre en provider_invalid_output; en los demás, si venían en la
// respuesta): aparecen en Costos IA con su costo estimado y cuentan para el tope mensual de gasto (D23).
const CODIGOS_CON_COSTO = new Set([
  'provider_invalid_output',
  'provider_invalid_response',
  'provider_missing_content',
  'provider_truncated',
  'provider_refusal',
]);

const formularioInicial = () => ({
  area: '',
  cargoId: '',
  skillId: '',
  nivel: 'junior',
  categoria: 'tecnica',
  tipo: 'abierta_texto',
  cantidad: '5',
  modelo: MODELOS_IA[0].value,
  // D26: el prompt lleva lo que piden las ofertas de empleo del cargo (V2 lo usa por defecto).
  usarMercado: true,
});

/** Cantidad válida (entero de 1 a LIMITES.preguntasPorGeneracion) o null. */
const leerCantidad = (texto) => {
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= LIMITES.preguntasPorGeneracion ? n : null;
};

/**
 * Traduce un error de la generación a lo que el admin necesita saber: si se cobró o no, y qué hacer.
 * tipo: 'sin_costo' | 'con_costo' | 'incierto'.
 */
const clasificarError = (err) => {
  const estado = err?.response?.status;
  const codigo = codigoDeError(err);
  // ¿Llegó a salir el POST de generación? (si falló la renovación previa de la sesión, no se llamó a la IA)
  const llegoAGenerar = String(err?.config?.url || '').includes('generar-ia');

  // Antes que nada: si el POST de generación no salió (falló la renovación previa de la sesión), no hubo IA.
  if (!llegoAGenerar || codigo === 'sesion_renovada') {
    return { tipo: 'sin_costo', mensaje: mensajeDeError(err, 'No se pudo iniciar la generación'), nota: 'No se llamó a la IA: no hubo costo.' };
  }

  if (!err?.response) {
    if (err?.code === 'ECONNABORTED') {
      return {
        tipo: 'incierto',
        mensaje: 'La respuesta tardó demasiado. Es posible que el servidor haya terminado y cobrado.',
        nota: 'No reintentes: revisa primero las preguntas pendientes generadas con IA.',
      };
    }
    return {
      tipo: 'incierto',
      mensaje: 'Se perdió la conexión con el servidor mientras se generaban las preguntas. Es posible que el servidor haya terminado y cobrado.',
      nota: 'No reintentes: revisa primero las preguntas pendientes generadas con IA.',
    };
  }

  if (estado === 504 || codigo === 'servidor_tardo') {
    return {
      tipo: 'incierto',
      mensaje: 'La respuesta tardó demasiado. Es posible que el servidor haya terminado y cobrado.',
      nota: 'No reintentes: revisa primero las preguntas pendientes generadas con IA.',
    };
  }

  if (estado === 503) {
    if (codigo === 'provider_not_configured') {
      return { tipo: 'sin_costo', mensaje: 'El proveedor de IA no está configurado en el servidor.', nota: 'No se llamó a la IA: no hubo costo.' };
    }
    return { tipo: 'sin_costo', mensaje: mensajeDeError(err, 'El servicio de IA no está disponible en este momento'), nota: 'No se llamó a la IA: no hubo costo.' };
  }

  if (estado === 502) {
    if (CODIGOS_CON_COSTO.has(codigo)) {
      const mensaje = codigo === 'provider_invalid_output'
        ? 'La IA respondió pero el lote no pasó la validación.'
        : mensajeDeError(err, 'La IA respondió algo que no se pudo usar.');
      return {
        tipo: 'con_costo',
        mensaje,
        nota: codigo === 'provider_invalid_output'
          ? 'Este intento SÍ tuvo costo: aparece en Costos IA como llamada fallida con su costo estimado. No se guardó ninguna pregunta.'
          : 'El proveedor probablemente cobró este intento: si informó sus tokens, aparece en Costos IA como llamada fallida con su costo estimado y cuenta para el tope mensual. No se guardó ninguna pregunta.',
      };
    }
    if (codigo === 'provider_timeout') {
      return {
        tipo: 'incierto',
        mensaje: mensajeDeError(err, 'El proveedor de IA tardó demasiado en responder.'),
        nota: 'Es posible que el proveedor haya cobrado: el servidor no reintentó para no pagar dos veces. En Costos IA aparece como fallida sin costo. No se guardó ninguna pregunta.',
      };
    }
    if (codigo === 'provider_http_error') {
      return {
        tipo: 'incierto',
        mensaje: mensajeDeError(err, 'El proveedor de IA no respondió correctamente.'),
        nota: 'Un error HTTP del proveedor normalmente no se cobra; en Costos IA aparece como fallida sin costo. No se guardó ninguna pregunta.',
      };
    }
    // 502 del proxy (proxy_error) o sin código: no se sabe si el backend alcanzó a terminar.
    return {
      tipo: 'incierto',
      mensaje: mensajeDeError(err, 'No se pudo completar la comunicación con el servidor.'),
      nota: 'Es posible que el servidor haya terminado y cobrado. No reintentes: revisa primero las preguntas pendientes generadas con IA.',
    };
  }

  if (estado >= 500) {
    return {
      tipo: 'incierto',
      mensaje: mensajeDeError(err, 'El servidor tuvo un error inesperado.'),
      nota: 'No se sabe si alcanzó a llamar a la IA. Revisa las pendientes y Costos IA antes de volver a intentar.',
    };
  }

  if (estado === 429 && codigo === 'tope_generacion_ia_alcanzado') {
    // Todavía sin nota: generar la arma UNA vez con el tope leído después de este 429 (notaTopeConLecturaNueva) y la
    // guarda ya armada, así el texto del aviso (role="alert") no cambia después de mostrarse y, si el tope quedó
    // desactivado (vale 0), no promete que se repone el día 1.
    return {
      tipo: 'sin_costo',
      mensaje: mensajeDeError(err, 'Se alcanzó el tope mensual de gasto en IA para generar preguntas.'),
      nota: null,
      esTope: true,
    };
  }

  // 400 (validación), 401/403 (sesión), 404 (cargo/skill inexistente), 429...: V2 valida todo antes de llamar a la IA.
  return { tipo: 'sin_costo', mensaje: mensajeDeError(err, 'No se pudo generar las preguntas'), nota: 'No se llamó a la IA: no hubo costo.' };
};

const sumar = (lista, campo) => {
  const valores = lista.map((p) => p[campo]).filter((v) => typeof v === 'number');
  return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
};

const GenerarPreguntas = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Desde Cobertura llega con el cargo, la skill, el nivel y la cantidad ya puestos. Se lee una sola vez y se borra del
  // historial: así volver atrás o recargar no rellena de nuevo el formulario (y no invita a pagar dos veces lo mismo).
  const [origen] = useState(() => ({
    desdeCobertura: location.state?.desde === 'cobertura',
    volverA: typeof location.state?.volverA === 'string' ? location.state.volverA : '/cobertura',
    prellenado: location.state?.prellenado || null,
  }));
  const [mostrarOrigen, setMostrarOrigen] = useState(origen.desdeCobertura);
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState(() => ({ ...formularioInicial(), ...(origen.prellenado || {}) }));
  const [errorFormulario, setErrorFormulario] = useState('');

  const [cargos, setCargos] = useState([]);
  const [cargandoCargos, setCargandoCargos] = useState(true);
  const [errorCargos, setErrorCargos] = useState('');

  const [skills, setSkills] = useState([]);
  const [cargandoSkills, setCargandoSkills] = useState(false);
  const [errorSkills, setErrorSkills] = useState('');

  const [costoPromedio, setCostoPromedio] = useState(null); // USD por pregunta generada (últimos 30 días)
  const [tope, setTope] = useState(null); // gasto del mes frente al tope (D23); null si no se sabe
  const [leyendoTope, setLeyendoTope] = useState(false); // hay una lectura de Costos IA en curso: el tope puede cambiar
  // La última lectura de Costos IA falló: `tope` es el de una lectura anterior y se muestra marcado como tal.
  const [lecturaTopeFallida, setLecturaTopeFallida] = useState(false);
  const pedidoReferencia = useRef(0);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [entiendeCosto, setEntiendeCosto] = useState(false);
  // Aviso del tope que el lector de pantalla oyó al abrir la confirmación (va en su descripción); null si no había.
  const [avisoAlAbrir, setAvisoAlAbrir] = useState(null);

  const [generando, setGenerando] = useState(false);
  const generandoRef = useRef(false); // bloquea el doble clic antes de que React vuelva a pintar
  // Tras el 429 del tope el servidor ya rechazó la generación sin llamar a la IA: solo falta leer el tope para armar el
  // aviso. El formulario sigue bloqueado (generando), pero la pantalla no dice «Generando…» ni pide no cerrar la página.
  const [leyendoNotaTope, setLeyendoNotaTope] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const [resultado, setResultado] = useState(null);
  const [errorGeneracion, setErrorGeneracion] = useState(null);

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // ---------- Catálogo ----------

  const cargarCargos = useCallback(async () => {
    setCargandoCargos(true);
    setErrorCargos('');
    try {
      const lista = await getCargos();
      if (!montadoRef.current) return;
      setCargos(Array.isArray(lista) ? lista.filter((c) => c.activo !== false) : []);
    } catch (err) {
      if (montadoRef.current) setErrorCargos(mensajeDeError(err, 'No se pudieron cargar los cargos'));
    } finally {
      if (montadoRef.current) setCargandoCargos(false);
    }
  }, []);

  useEffect(() => { cargarCargos(); }, [cargarCargos]);

  // Referencia de costo y tope del mes. V2 no da un presupuesto previo: se muestra el promedio real por pregunta del
  // último mes y lo que queda del tope (D23). Se vuelve a pedir al abrir la confirmación y después de cada generación: el
  // GET no llama a la IA ni cuesta. Solo vale la respuesta del último pedido (una más vieja que llegue tarde se descarta).
  // Devuelve el tope leído (null si falló), aunque otro pedido lo haya superado: sigue siendo una lectura posterior a
  // quien la pidió (la nota del 429 la usa así).
  const cargarReferencia = useCallback(async () => {
    const pedido = ++pedidoReferencia.current;
    const vigente = () => montadoRef.current && pedido === pedidoReferencia.current;
    setLeyendoTope(true);
    try {
      const data = await getCostosIa();
      const leido = leerTopeGeneracion(data);
      if (vigente()) {
        const gasto = data?.generacionPreguntas;
        setCostoPromedio(gasto && gasto.usos > 0 ? gasto.costoUsd / gasto.usos : null);
        setTope(leido);
        setLecturaTopeFallida(false);
      }
      return leido;
    } catch {
      // Es solo una referencia: sin ella la pantalla funciona igual (el servidor igual aplica el tope). El tope que ya se
      // sabía NO se borra: si desapareciera (por ejemplo, el aviso de agotado justo después de decir «se está
      // actualizando») parecería que la actualización lo quitó. Se sigue mostrando, marcado como la última lectura que no
      // se pudo actualizar, en la página y en la confirmación, y la región viva del diálogo lo dice. El promedio del mes
      // sigue sirviendo. Devuelve null: la nota del 429 no se arma con un dato viejo (notaTopeConLecturaNueva).
      if (vigente()) setLecturaTopeFallida(true);
      return null;
    } finally {
      if (vigente()) setLeyendoTope(false);
    }
  }, []);

  useEffect(() => { cargarReferencia(); }, [cargarReferencia]);

  useEffect(() => {
    if (!form.cargoId) {
      setSkills([]);
      setErrorSkills('');
      return undefined;
    }
    let vigente = true;
    setCargandoSkills(true);
    setErrorSkills('');
    setSkills([]);
    getSkillsDeCargo(form.cargoId)
      .then((matriz) => {
        if (!vigente) return;
        const lista = Array.isArray(matriz?.skills) ? [...matriz.skills] : [];
        lista.sort((a, b) => Number(b.obligatoria) - Number(a.obligatoria) || String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'));
        setSkills(lista);
      })
      .catch((err) => { if (vigente) setErrorSkills(mensajeDeError(err, 'No se pudieron cargar las skills del cargo')); })
      .finally(() => { if (vigente) setCargandoSkills(false); });
    return () => { vigente = false; };
  }, [form.cargoId]);

  const areas = useMemo(
    () => [...new Set(cargos.map((c) => c.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [cargos]
  );

  const cargosDelArea = useMemo(
    () => cargos
      .filter((c) => !form.area || c.area === form.area)
      .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es')),
    [cargos, form.area]
  );

  const cargoElegido = cargos.find((c) => c.cargoId === form.cargoId) || null;
  const skillElegida = skills.find((s) => s.skillId === form.skillId) || null;
  const cantidad = leerCantidad(form.cantidad);
  const costoEstimado = costoPromedio !== null && cantidad !== null ? costoPromedio * cantidad : null;

  // Un cargo o una skill que vino de Cobertura y no está en las listas (lista en caché, o falló la carga) se sigue
  // mostrando con su nombre: lo que se ve en el formulario y en la confirmación es lo que se envía.
  const delPrellenado = (campo, id) => (id && origen.prellenado?.[campo] === id ? origen.prellenado : null);
  const nombreCargo = cargoElegido?.nombre || delPrellenado('cargoId', form.cargoId)?.cargoNombre || null;
  const nombreSkill = skillElegida?.nombre || delPrellenado('skillId', form.skillId)?.skillNombre || null;
  const cargoFueraDeLista = Boolean(form.cargoId) && !cargoElegido && !cargandoCargos;
  const skillFueraDeLista = Boolean(form.skillId) && !skillElegida && !cargandoSkills;

  // ---------- Aviso al salir mientras genera ----------

  useEffect(() => {
    // Solo mientras de verdad se genera: tras el 429 del tope ya no hay nada que perder al cerrar ni tiempo que contar.
    if (!generando || leyendoNotaTope) return undefined;
    const avisar = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', avisar);
    const inicio = Date.now();
    setSegundos(0);
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => {
      window.removeEventListener('beforeunload', avisar);
      clearInterval(reloj);
    };
  }, [generando, leyendoNotaTope]);

  // ---------- Formulario ----------

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setErrorFormulario('');
    setForm((prev) => {
      const siguiente = { ...prev, [campo]: valor };
      if (campo === 'area') {
        const cargo = cargos.find((c) => c.cargoId === prev.cargoId);
        if (cargo && valor && cargo.area !== valor) {
          siguiente.cargoId = '';
          siguiente.skillId = '';
        }
      }
      if (campo === 'cargoId') {
        siguiente.skillId = '';
        const cargo = cargos.find((c) => c.cargoId === valor);
        if (cargo && !prev.area) siguiente.area = cargo.area;
      }
      if (campo === 'skillId') {
        // La categoría de la skill (tecnica/blanda) es la natural para sus preguntas; se puede cambiar después.
        const skill = skills.find((s) => s.skillId === valor);
        if (skill && CATEGORIAS.some((c) => c.value === skill.categoria)) siguiente.categoria = skill.categoria;
      }
      return siguiente;
    });
  };

  const validar = () => {
    if (!form.cargoId && !form.skillId) return 'Elige un cargo (y, si quieres, una skill concreta de ese cargo)';
    if (cargandoCargos || cargandoSkills) return 'Espera a que terminen de cargar los cargos y las skills';
    if (cantidad === null) return `La cantidad debe ser un número entero entre 1 y ${LIMITES.preguntasPorGeneracion}`;
    if (!NIVELES.some((n) => n.value === form.nivel)) return 'Elige un nivel';
    if (!CATEGORIAS.some((c) => c.value === form.categoria)) return 'Elige una categoría';
    if (!TIPOS.some((t) => t.value === form.tipo)) return 'Elige un tipo de pregunta';
    if (!MODELOS_IA.some((m) => m.value === form.modelo)) return 'Elige un modelo de IA';
    return null;
  };

  const abrirConfirmacion = (e) => {
    e.preventDefault();
    if (generandoRef.current) return;
    const problema = validar();
    if (problema) {
      setErrorFormulario(problema);
      return;
    }
    // El tope se vuelve a leer al abrir (el GET no llama a la IA ni cuesta): el de la página puede tener horas, ser del mes
    // anterior o no incluir lo que gastó otro administrador. Mientras llega, la línea del tope dice «Según la última
    // lectura»; si al llegar cambia el aviso que el lector de pantalla ya oyó, o si la lectura falla (la línea sigue, con
    // «no se pudo actualizar»), se anuncia (anuncioTopeActualizado).
    setAvisoAlAbrir(avisoAntesDeGenerar(tope, costoEstimado));
    cargarReferencia();
    setEntiendeCosto(false);
    setModalAbierto(true);
  };

  const cerrarModal = useCallback(() => {
    if (generandoRef.current) return;
    setModalAbierto(false);
    setEntiendeCosto(false);
  }, []);

  useEffect(() => {
    if (!modalAbierto) return undefined;
    const alPresionar = (e) => { if (e.key === 'Escape') cerrarModal(); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [modalAbierto, cerrarModal]);

  // ---------- Generación (sin reintentos automáticos en ningún camino) ----------

  const generar = async () => {
    if (generandoRef.current || !entiendeCosto) return;
    const problema = validar();
    if (problema) {
      setModalAbierto(false);
      setErrorFormulario(problema);
      return;
    }
    generandoRef.current = true;
    setGenerando(true);
    setModalAbierto(false);
    setEntiendeCosto(false);
    setResultado(null);
    setErrorGeneracion(null);

    // Body EXACTO de SolicitudGenerarPreguntas (snake_case). cargoId/skillId en camelCase se ignorarían (400 contexto_requerido).
    const solicitud = {
      cargo_id: form.cargoId || undefined,
      skill_id: form.skillId || undefined,
      nivel: form.nivel,
      cantidad: Number(form.cantidad),
      tipo: form.tipo,
      categoria: form.categoria,
      modelo: form.modelo,
      usar_mercado: form.usarMercado,
    };

    let referenciaPedida = false;
    try {
      const data = await generateQuestionsAi(solicitud);
      if (!montadoRef.current) return;
      setMostrarOrigen(false); // lo que faltaba ya cambió: el aviso dejaría de ser cierto
      setResultado({
        mensaje: typeof data?.mensaje === 'string' ? data.mensaje : '',
        generadas: data?.preguntas_generadas ?? (data?.preguntas?.length || 0),
        conError: data?.preguntas_con_error ?? 0,
        preguntas: Array.isArray(data?.preguntas) ? data.preguntas : [],
        modelo: form.modelo,
        mercado: textoContextoMercado(data?.contexto_mercado),
      });
    } catch (err) {
      if (montadoRef.current) {
        const error = clasificarError(err);
        if (error.esTope) {
          // 429 del tope (sin costo): la nota se arma una sola vez con el tope leído ahora, y el aviso se muestra ya
          // completo. Mientras llega la lectura (unos segundos como mucho) el formulario sigue bloqueado, pero el
          // indicador pasa a decir que no se generó nada y que se está leyendo el tope (leyendoNotaTope).
          referenciaPedida = true;
          setLeyendoNotaTope(true);
          const nota = await notaTopeConLecturaNueva(cargarReferencia);
          if (montadoRef.current) setErrorGeneracion({ tipo: error.tipo, mensaje: error.mensaje, nota });
        } else {
          setErrorGeneracion(error);
        }
      }
    } finally {
      generandoRef.current = false;
      if (montadoRef.current) {
        setGenerando(false);
        setLeyendoNotaTope(false);
        // El gasto del mes cambió: se vuelve a leer (tras el 429 del tope ya se leyó para su nota).
        if (!referenciaPedida) cargarReferencia();
      }
    }
  };

  // ---------- Textos derivados ----------

  const contexto = [nombreCargo, nombreSkill].filter(Boolean).join(' / ') || '—';
  const etiquetaModelo = etiqueta(MODELOS_IA, form.modelo);
  let textoBotonGenerar = 'Generar preguntas';
  if (generando) textoBotonGenerar = leyendoNotaTope ? 'Leyendo el tope...' : 'Generando...';
  // Solo informa: el botón no se deshabilita por el tope (el dato puede estar viejo y el que decide es el servidor, cuyo
  // 429 no cobra). Mientras se vuelve a leer, o si esa lectura falla, la línea lo dice («Según la última lectura»).
  const lineaTope = lineaTopeEnConfirmacion(tope, costoEstimado, {
    actualizando: leyendoTope,
    sinActualizar: lecturaTopeFallida,
  });
  const anuncioTope = modalAbierto
    ? anuncioTopeActualizado({
      avisoAlAbrir, tope, costoEstimado, actualizando: leyendoTope, lecturaFallida: lecturaTopeFallida,
    })
    : '';

  const preguntasResultado = resultado?.preguntas || [];
  const costoTotal = sumar(preguntasResultado, 'costo_usd');
  const tokensEntrada = sumar(preguntasResultado, 'tokens_input');
  const tokensSalida = sumar(preguntasResultado, 'tokens_output');

  return (
    <div className="generar-preguntas">
      <div className="gp-container">
        <h1>Generar preguntas con IA</h1>
        <p className="gp-subtitle">
          Las preguntas generadas quedan <strong>pendientes</strong> hasta que un administrador las revise y apruebe.
        </p>

        {mostrarOrigen && !generando && (
          <p className="gp-origen">
            Abierto desde <Link to="/cobertura" className="gp-link">Cobertura</Link>: el cargo, la skill, el nivel y la cantidad
            ya están puestos con lo que le falta al banco. Revísalos antes de generar.
          </p>
        )}

        <div className="cost-warning" role="note">
          <strong>Cada generación tiene un costo real en USD.</strong> Se cobra aunque después rechaces las preguntas,
          y también si la IA responde algo que no pasa la validación.
          {costoPromedio !== null && (
            <span className="cost-warning-ref">
              {' '}Referencia del último mes: {formatearUsd(costoPromedio)} por pregunta generada.
            </span>
          )}
        </div>

        <TopeGeneracionIa
          tope={tope}
          desactualizado={lecturaTopeFallida}
          encabezado="Tope mensual de gasto en generar preguntas con IA (todos los administradores)"
        />

        <form onSubmit={abrirConfirmacion} className="gp-form" noValidate>
          <fieldset disabled={generando} className="gp-fieldset">
            <div className="gp-grid">
              <div className="form-group">
                <label htmlFor="gp-area">Área</label>
                <select id="gp-area" value={form.area} onChange={cambiar('area')} disabled={cargandoCargos || !!errorCargos}>
                  <option value="">Todas las áreas</option>
                  {areas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-cargo">
                  Cargo <span className="required">*</span>
                </label>
                <select id="gp-cargo" value={form.cargoId} onChange={cambiar('cargoId')} disabled={cargandoCargos || !!errorCargos}>
                  <option value="">{cargandoCargos ? 'Cargando cargos...' : 'Selecciona un cargo'}</option>
                  {cargoFueraDeLista && <option value={form.cargoId}>{nombreCargo || 'Cargo elegido en Cobertura'}</option>}
                  {cargosDelArea.map((c) => (
                    <option key={c.cargoId} value={c.cargoId}>
                      {form.area ? c.nombre : `${c.nombre} (${c.area})`}
                    </option>
                  ))}
                </select>
                {errorCargos && (
                  <div className="gp-inline-error">
                    {errorCargos}{' '}
                    <button type="button" className="gp-link-button" onClick={cargarCargos}>Reintentar</button>
                  </div>
                )}
              </div>

              <div className="form-group full-width">
                <label htmlFor="gp-skill">Skill (opcional)</label>
                <select id="gp-skill" value={form.skillId} onChange={cambiar('skillId')} disabled={!form.cargoId || cargandoSkills}>
                  <option value="">
                    {!form.cargoId ? 'Primero elige un cargo' : cargandoSkills ? 'Cargando skills...' : 'Todo el cargo (sin una skill concreta)'}
                  </option>
                  {skillFueraDeLista && <option value={form.skillId}>{nombreSkill || 'Skill elegida en Cobertura'}</option>}
                  {skills.map((s) => (
                    <option key={s.skillId} value={s.skillId}>
                      {s.nombre} · {etiqueta(CATEGORIAS, s.categoria)}{s.obligatoria ? ' · obligatoria' : ''}
                    </option>
                  ))}
                </select>
                {errorSkills && <div className="gp-inline-error">{errorSkills}</div>}
                {form.cargoId && !form.skillId && !cargandoSkills && !errorSkills && skills.length === 0 && (
                  <small className="form-help">Este cargo no tiene skills asociadas: se generará para el cargo completo.</small>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="gp-nivel">Nivel <span className="required">*</span></label>
                <select id="gp-nivel" value={form.nivel} onChange={cambiar('nivel')}>
                  {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-categoria">Categoría <span className="required">*</span></label>
                <select id="gp-categoria" value={form.categoria} onChange={cambiar('categoria')}>
                  {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-tipo">Tipo de pregunta <span className="required">*</span></label>
                <select id="gp-tipo" value={form.tipo} onChange={cambiar('tipo')}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gp-cantidad">Cantidad <span className="required">*</span></label>
                <input
                  id="gp-cantidad"
                  type="number"
                  min="1"
                  max={LIMITES.preguntasPorGeneracion}
                  step="1"
                  value={form.cantidad}
                  onChange={cambiar('cantidad')}
                />
                <small className="form-help">Entre 1 y {LIMITES.preguntasPorGeneracion} preguntas por generación.</small>
              </div>

              <div className="form-group full-width">
                <label htmlFor="gp-modelo">Modelo de IA <span className="required">*</span></label>
                <select id="gp-modelo" value={form.modelo} onChange={cambiar('modelo')}>
                  {MODELOS_IA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div className="form-group full-width">
                <label className="checkbox-label gp-check-neutro" htmlFor="gp-mercado">
                  <input id="gp-mercado" type="checkbox" checked={form.usarMercado} onChange={cambiar('usarMercado')} />
                  Usar lo que piden las ofertas de empleo de este cargo (recomendado)
                </label>
                <small className="form-help">
                  Se intenta darle a la IA las skills más pedidas y frases cortas de ofertas de empleo de este cargo, para que
                  las preguntas se parezcan a las entrevistas de hoy. Si no hay ofertas que sirvan o las APIs de empleo no
                  responden, se genera sin ellas (o con ofertas de referencia), y el resultado lo dice. Usar ofertas alarga el
                  pedido a la IA y puede subir un poco el costo por pregunta.
                </small>
              </div>
            </div>
          </fieldset>

          {errorFormulario && <div className="error-message">{errorFormulario}</div>}

          {generando && (
            <div className="gp-progress" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              {leyendoNotaTope ? (
                <div>
                  {/* El 429 del tope ya llegó: no se genera nada y cerrar la página no pierde nada. Corto, porque el
                      aviso completo (role="alert") llega enseguida. */}
                  <strong>No se generaron preguntas (sin costo). Leyendo el tope del mes...</strong>
                </div>
              ) : (
                <div>
                  <strong>Generando {cantidad ?? ''} preguntas con {etiquetaModelo}... ({segundos} s)</strong>
                  <p>Puede tardar hasta 1 minuto; no cierres ni recargues la página ni cambies de sección.</p>
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/preguntas')} disabled={generando}>
              Volver al banco
            </button>
            <button type="submit" className="btn btn-primary" disabled={generando || cargandoCargos || cargandoSkills}>
              {textoBotonGenerar}
            </button>
          </div>
        </form>

        {errorGeneracion && (
          <div className={`gp-result-error gp-result-error-${errorGeneracion.tipo}`} role="alert">
            <p className="gp-result-error-title">{errorGeneracion.mensaje}</p>
            {errorGeneracion.nota && <p>{errorGeneracion.nota}</p>}
            {errorGeneracion.tipo !== 'sin_costo' && (
              <div className="gp-result-actions">
                <Link to={RUTA_PENDIENTES_IA} className="btn btn-primary">Revisar pendientes</Link>
                <Link to="/informes" className="btn btn-secondary">Ver Costos IA</Link>
              </div>
            )}
          </div>
        )}

        {resultado && (
          <section className="gp-result" aria-label="Resultado de la generación">
            <div className="success-message">
              {resultado.mensaje || `Preguntas generadas: ${resultado.generadas}. Quedan pendientes de aprobación`}
            </div>

            <div className="gp-summary">
              <div><span>Generadas</span><strong>{resultado.generadas}</strong></div>
              {resultado.conError > 0 && <div><span>Con error</span><strong>{resultado.conError}</strong></div>}
              <div><span>Modelo</span><strong>{etiqueta(MODELOS_IA, resultado.modelo)}</strong></div>
              <div><span>Tokens (entrada / salida)</span><strong>{tokensEntrada ?? '—'} / {tokensSalida ?? '—'}</strong></div>
              <div className="total-cost"><span>Costo total</span><strong>{costoTotal === null ? '—' : formatearUsd(costoTotal)}</strong></div>
            </div>

            {resultado.mercado && (
              <div className={`gp-mercado ${resultado.mercado.usado ? 'gp-mercado-usado' : 'gp-mercado-sin'}`}>
                <p className="gp-mercado-titulo">{resultado.mercado.titulo}</p>
                {resultado.mercado.detalle && <p>{resultado.mercado.detalle}</p>}
                {resultado.mercado.skills?.length > 0 && (
                  <p>Skills más pedidas: {resultado.mercado.skills.join(', ')}</p>
                )}
                {resultado.mercado.fragmentos?.length > 0 && (
                  <details>
                    <summary>Ver las frases de ofertas que recibió la IA ({resultado.mercado.fragmentos.length})</summary>
                    <ul>
                      {resultado.mercado.fragmentos.map((f, i) => (
                        <li key={i}>«{f.texto}» <span className="gp-mercado-oferta">{f.oferta}{f.fuente ? ` · ${f.fuente}` : ''}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {preguntasResultado.length > 0 && (
              <div className="gp-table-wrapper">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Enunciado</th>
                      <th>Estado</th>
                      <th className="num">Tokens entrada</th>
                      <th className="num">Tokens salida</th>
                      <th className="num">Costo</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preguntasResultado.map((p, i) => (
                      <tr key={p.pregunta_id || i}>
                        <td>{i + 1}</td>
                        <td className="gp-enunciado">{p.enunciado}</td>
                        <td>
                          <span className={`gp-estado gp-estado-${p.estado}`}>{etiqueta(ESTADOS_PREGUNTA, p.estado)}</span>
                        </td>
                        <td className="num">{p.tokens_input ?? '—'}</td>
                        <td className="num">{p.tokens_output ?? '—'}</td>
                        <td className="num">{typeof p.costo_usd === 'number' ? formatearUsd(p.costo_usd) : '—'}</td>
                        <td>
                          {p.pregunta_id
                            ? <Link to={`/editar-pregunta/${p.pregunta_id}`} className="gp-link">Revisar / editar</Link>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td className="num">{tokensEntrada ?? '—'}</td>
                      <td className="num">{tokensSalida ?? '—'}</td>
                      <td className="num total-cost">{costoTotal === null ? '—' : formatearUsd(costoTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="gp-result-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate(RUTA_PENDIENTES_IA)}>
                Revisar pendientes
              </button>
              {origen.desdeCobertura && (
                <button type="button" className="btn btn-secondary" onClick={() => navigate(origen.volverA)}>
                  Volver a cobertura
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setResultado(null)}>
                Cerrar resultado
              </button>
            </div>
          </section>
        )}
      </div>

      {modalAbierto && (
        // El fondo no cierra con el 2.º clic de un doble clic en «Generar preguntas» (FondoModal).
        <FondoModal onCerrar={cerrarModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gp-modal-titulo"
            aria-describedby={idsDescripcionConfirmacion(lineaTope, 'gp-modal-desc', 'gp-modal-tope')}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="gp-modal-titulo">Confirmar generación con IA</h2>
            <p id="gp-modal-desc">
              Esta acción llama a <strong>{etiquetaModelo}</strong> y genera un costo real en USD. Se generarán{' '}
              <strong>{cantidad}</strong> preguntas para <strong>{contexto}</strong>, nivel{' '}
              <strong>{etiqueta(NIVELES, form.nivel)}</strong>. ¿Continuar?
            </p>
            <ul className="gp-modal-detalle">
              <li>Categoría: {etiqueta(CATEGORIAS, form.categoria)}</li>
              <li>Tipo: {etiqueta(TIPOS, form.tipo)}</li>
              <li>Ofertas de empleo: {form.usarMercado ? 'se intentan usar las del cargo (alargan el pedido y pueden subir un poco el costo)' : 'no se usan'}</li>
              {costoEstimado !== null && (
                <li>
                  Referencia (promedio del último mes): unos {formatearUsd(costoEstimado)}. El costo real puede ser distinto.
                </li>
              )}
              {lineaTope && (
                <li id="gp-modal-tope" className={lineaTope.esAviso ? 'gp-modal-aviso' : undefined}>
                  {lineaTope.esAviso && <strong>Aviso del tope mensual: </strong>}
                  {lineaTope.texto}
                </li>
              )}
            </ul>
            {/* Región viva: está desde que se abre el diálogo y solo recibe texto si la lectura nueva del tope cambia el
                aviso que ya se leyó al abrirlo (la línea de arriba cambia en pantalla, pero no se anuncia sola). */}
            <p className="gp-solo-lector" role="status">{anuncioTope}</p>
            <label className="checkbox-label gp-check">
              <input type="checkbox" checked={entiendeCosto} onChange={(e) => setEntiendeCosto(e.target.checked)} autoFocus />
              Entiendo que tiene costo
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cerrarModal}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={generar} disabled={!entiendeCosto || generando}>
                Generar
              </button>
            </div>
          </div>
        </FondoModal>
      )}
    </div>
  );
};

export default GenerarPreguntas;
