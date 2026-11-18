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
  formatearPesos,
  NOTA_TIPO_CAMBIO,
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
import Icono from './Icono';
import TopeGeneracionIa from './TopeGeneracionIa';
import './GenerarPreguntas.css';

const RUTA_PENDIENTES_IA = '/preguntas?estado=pendiente&generadaPorIa=true';

// Variante de insignia de cada estado de pregunta (solo presentación: el texto de la insignia dice el estado).
const INSIGNIA_ESTADO = {
  pendiente: 'insignia--aviso',
  aprobada: 'insignia--exito',
  rechazada: 'insignia--peligro',
};

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
    <div className="pagina gp-pagina">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <h1 className="encabezado-pagina__titulo">Generar preguntas con IA</h1>
          <p className="encabezado-pagina__descripcion">
            Las preguntas generadas quedan <strong>pendientes</strong> hasta que un administrador las revise y apruebe.
          </p>
        </div>
      </header>

      {mostrarOrigen && !generando && (
        <div className="aviso aviso--info">
          <Icono nombre="cobertura" className="aviso__icono" />
          <p className="aviso__contenido">
            <span>
              Abierto desde <Link to="/cobertura">Cobertura</Link>: el cargo, la skill, el nivel y la cantidad
              ya están puestos con lo que le falta al banco. Revísalos antes de generar.
            </span>
          </p>
        </div>
      )}

      <div className="aviso aviso--aviso" role="note">
        <Icono nombre="dinero" className="aviso__icono" />
        <div className="aviso__contenido">
          <p className="aviso__titulo">Cada generación tiene un costo real.</p>
          <p>
            Se cobra aunque después rechaces las preguntas, y también si la IA responde algo que no pasa la validación.
            {costoPromedio !== null && (
              <>
                {' '}Referencia del último mes: <span className="num">{formatearPesos(costoPromedio)}</span> por pregunta generada.
              </>
            )}
          </p>
          <p className="nota--chica">{NOTA_TIPO_CAMBIO}</p>
        </div>
      </div>

      <TopeGeneracionIa
        tope={tope}
        desactualizado={lecturaTopeFallida}
        encabezado="Tope mensual de gasto en generar preguntas con IA (todos los administradores)"
      />

      <form onSubmit={abrirConfirmacion} className="tarjeta" noValidate>
        <div className="tarjeta__cuerpo">
          <fieldset disabled={generando} className="gp-fieldset">
            <div className="rejilla-campos">
              <div className="campo">
                <label htmlFor="gp-area" className="campo__etiqueta">
                  Área <span className="campo__opcional">(opcional)</span>
                </label>
                <select id="gp-area" value={form.area} onChange={cambiar('area')} disabled={cargandoCargos || !!errorCargos}>
                  <option value="">Todas las áreas</option>
                  {areas.map((area) => <option key={area} value={area}>{area}</option>)}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="gp-cargo" className="campo__etiqueta">Cargo</label>
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
                  <div className="campo__error">
                    {errorCargos}{' '}
                    <button type="button" className="gp-boton-enlace" onClick={cargarCargos}>Reintentar</button>
                  </div>
                )}
              </div>

              <div className="campo campo--ancho">
                <label htmlFor="gp-skill" className="campo__etiqueta">
                  Skill <span className="campo__opcional">(opcional)</span>
                </label>
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
                {errorSkills && <div className="campo__error">{errorSkills}</div>}
                {form.cargoId && !form.skillId && !cargandoSkills && !errorSkills && skills.length === 0 && (
                  <small className="campo__ayuda">Este cargo no tiene skills asociadas: se generará para el cargo completo.</small>
                )}
              </div>

              <div className="campo">
                <label htmlFor="gp-nivel" className="campo__etiqueta">Nivel</label>
                <select id="gp-nivel" value={form.nivel} onChange={cambiar('nivel')}>
                  {NIVELES.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="gp-categoria" className="campo__etiqueta">Categoría</label>
                <select id="gp-categoria" value={form.categoria} onChange={cambiar('categoria')}>
                  {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="gp-tipo" className="campo__etiqueta">Tipo de pregunta</label>
                <select id="gp-tipo" value={form.tipo} onChange={cambiar('tipo')}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="gp-cantidad" className="campo__etiqueta">Cantidad</label>
                <input
                  id="gp-cantidad"
                  type="number"
                  min="1"
                  max={LIMITES.preguntasPorGeneracion}
                  step="1"
                  value={form.cantidad}
                  onChange={cambiar('cantidad')}
                />
                <small className="campo__ayuda">Entre 1 y {LIMITES.preguntasPorGeneracion} preguntas por generación.</small>
              </div>

              <div className="campo campo--ancho">
                <label htmlFor="gp-modelo" className="campo__etiqueta">Modelo de IA</label>
                <select id="gp-modelo" value={form.modelo} onChange={cambiar('modelo')}>
                  {MODELOS_IA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div className="campo campo--ancho gp-campo-mercado">
                <label className="casilla" htmlFor="gp-mercado">
                  <input id="gp-mercado" type="checkbox" checked={form.usarMercado} onChange={cambiar('usarMercado')} />
                  Usar lo que piden las ofertas de empleo de este cargo (recomendado)
                </label>
                <small className="campo__ayuda gp-ayuda-casilla">
                  Se intenta darle a la IA las skills más pedidas y frases cortas de ofertas de empleo de este cargo, para que
                  las preguntas se parezcan a las entrevistas de hoy. Si no hay ofertas que sirvan o las APIs de empleo no
                  responden, se genera sin ellas (o con ofertas de referencia), y el resultado lo dice. Usar ofertas alarga el
                  pedido a la IA y puede subir un poco el costo por pregunta.
                </small>
              </div>
            </div>
          </fieldset>

          {errorFormulario && (
            <div className="aviso aviso--peligro">
              <Icono nombre="alerta" className="aviso__icono" />
              <p className="aviso__contenido">{errorFormulario}</p>
            </div>
          )}

          {generando && (
            <div className="gp-progress" role="status" aria-live="polite">
              <span className="cargando" aria-hidden="true" />
              {leyendoNotaTope ? (
                <div className="gp-progress__texto">
                  {/* El 429 del tope ya llegó: no se genera nada y cerrar la página no pierde nada. Corto, porque el
                      aviso completo (role="alert") llega enseguida. */}
                  <strong>No se generaron preguntas (sin costo). Leyendo el tope del mes...</strong>
                </div>
              ) : (
                <div className="gp-progress__texto">
                  <strong>Generando {cantidad ?? ''} preguntas con {etiquetaModelo}... (<span className="num">{segundos}</span> s)</strong>
                  <p className="nota">Puede tardar hasta 1 minuto; no cierres ni recargues la página ni cambies de sección.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="boton" onClick={() => navigate('/preguntas')} disabled={generando}>
            Volver al banco
          </button>
          <button type="submit" className="boton boton--primario" disabled={generando || cargandoCargos || cargandoSkills}>
            <Icono nombre="generar" />
            {textoBotonGenerar}
          </button>
        </div>
      </form>

      {errorGeneracion && (
        <div className={`aviso ${errorGeneracion.tipo === 'sin_costo' ? 'aviso--peligro' : 'aviso--aviso'}`} role="alert">
          <Icono nombre="alerta" className="aviso__icono" />
          <div className="aviso__contenido">
            <p className="aviso__titulo">{errorGeneracion.mensaje}</p>
            {errorGeneracion.nota && <p>{errorGeneracion.nota}</p>}
            {errorGeneracion.tipo !== 'sin_costo' && (
              <div className="grupo-botones gp-result-actions">
                <Link to={RUTA_PENDIENTES_IA} className="boton boton--chico">Revisar pendientes</Link>
                <Link to="/informes" className="boton boton--chico boton--sutil">Ver Costos IA</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {resultado && (
        <section className="seccion" aria-label="Resultado de la generación">
          <div className="aviso aviso--exito">
            <Icono nombre="check-circulo" className="aviso__icono" />
            <p className="aviso__contenido">
              {resultado.mensaje || `Preguntas generadas: ${resultado.generadas}. Quedan pendientes de aprobación`}
            </p>
          </div>

          <dl className="metricas gp-metricas">
            <div className="metrica">
              <dt className="metrica__etiqueta">Generadas</dt>
              <dd className="metrica__valor">{resultado.generadas}</dd>
            </div>
            {resultado.conError > 0 && (
              <div className="metrica">
                <dt className="metrica__etiqueta">Con error</dt>
                <dd className="metrica__valor">{resultado.conError}</dd>
              </div>
            )}
            <div className="metrica">
              <dt className="metrica__etiqueta">Modelo</dt>
              <dd className="metrica__valor gp-metrica-texto">{etiqueta(MODELOS_IA, resultado.modelo)}</dd>
            </div>
            <div className="metrica">
              <dt className="metrica__etiqueta">Tokens (entrada / salida)</dt>
              <dd className="metrica__valor">{tokensEntrada ?? '—'} / {tokensSalida ?? '—'}</dd>
            </div>
            <div className="metrica">
              <dt className="metrica__etiqueta">Costo total</dt>
              <dd className="metrica__valor">{costoTotal === null ? '—' : formatearPesos(costoTotal)}</dd>
            </div>
          </dl>

          {resultado.mercado && (
            <div className="tarjeta">
              <div className="tarjeta__encabezado">
                <h2 className="tarjeta__titulo">Ofertas de empleo</h2>
              </div>
              <div className="tarjeta__cuerpo gp-mercado__cuerpo">
                <p className="texto-fuerte">{resultado.mercado.titulo}</p>
                {resultado.mercado.detalle && <p className="nota">{resultado.mercado.detalle}</p>}
                {resultado.mercado.skills?.length > 0 && (
                  <dl className="datos">
                    <dt>Skills más pedidas</dt>
                    <dd>
                      <ul className="gp-mercado__skills">
                        {resultado.mercado.skills.map((s, i) => <li key={i} className="insignia">{s}</li>)}
                      </ul>
                    </dd>
                  </dl>
                )}
                {resultado.mercado.fragmentos?.length > 0 && (
                  <details className="desplegable">
                    <summary>Ver las frases de ofertas que recibió la IA ({resultado.mercado.fragmentos.length})</summary>
                    <ul className="desplegable__cuerpo gp-mercado__fragmentos">
                      {resultado.mercado.fragmentos.map((f, i) => (
                        <li key={i}>
                          <span className="gp-mercado__frase">«{f.texto}»</span>{' '}
                          <span className="texto-3 texto-mini">{f.oferta}{f.fuente ? ` · ${f.fuente}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}

          {preguntasResultado.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla tabla--compacta gp-tabla">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Enunciado</th>
                    <th>Estado</th>
                    <th className="num">Tokens entrada</th>
                    <th className="num">Tokens salida</th>
                    <th className="num">Costo</th>
                    <th><span className="sr-only">Acción</span></th>
                  </tr>
                </thead>
                <tbody>
                  {preguntasResultado.map((p, i) => (
                    <tr key={p.pregunta_id || i}>
                      <td className="num texto-3">{i + 1}</td>
                      <td className="gp-enunciado">{p.enunciado}</td>
                      <td>
                        <span className={`insignia ${INSIGNIA_ESTADO[p.estado] || ''}`.trim()}>{etiqueta(ESTADOS_PREGUNTA, p.estado)}</span>
                      </td>
                      <td className="num">{p.tokens_input ?? '—'}</td>
                      <td className="num">{p.tokens_output ?? '—'}</td>
                      <td className="num">{typeof p.costo_usd === 'number' ? formatearPesos(p.costo_usd) : '—'}</td>
                      <td className="celda-acciones">
                        {p.pregunta_id
                          ? <Link to={`/editar-pregunta/${p.pregunta_id}`}>Revisar / editar</Link>
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
                    <td className="num">{costoTotal === null ? '—' : formatearPesos(costoTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="grupo-botones gp-result-actions">
            <button type="button" className="boton" onClick={() => navigate(RUTA_PENDIENTES_IA)}>
              Revisar pendientes
              <Icono nombre="flecha-derecha" />
            </button>
            {origen.desdeCobertura && (
              <button type="button" className="boton" onClick={() => navigate(origen.volverA)}>
                Volver a cobertura
              </button>
            )}
            <button type="button" className="boton boton--sutil" onClick={() => setResultado(null)}>
              Cerrar resultado
            </button>
          </div>
        </section>
      )}

      {modalAbierto && (
        // El fondo no cierra con el 2.º clic de un doble clic en «Generar preguntas» (FondoModal).
        // Sin className: el fondo usa la clase por defecto de FondoModal (.dialogo-fondo).
        <FondoModal onCerrar={cerrarModal}>
          <div
            className="dialogo"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gp-modal-titulo"
            aria-describedby={idsDescripcionConfirmacion(lineaTope, 'gp-modal-desc', 'gp-modal-tope')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialogo__encabezado">
              <h2 id="gp-modal-titulo" className="dialogo__titulo">Confirmar generación con IA</h2>
            </div>
            <div className="dialogo__cuerpo">
              <p id="gp-modal-desc">
                Esta acción llama a <strong>{etiquetaModelo}</strong> y genera un costo real. Se generarán{' '}
                <strong>{cantidad}</strong> preguntas para <strong>{contexto}</strong>, nivel{' '}
                <strong>{etiqueta(NIVELES, form.nivel)}</strong>. ¿Continuar?
              </p>
              <ul className="gp-modal-detalle">
                <li>Categoría: {etiqueta(CATEGORIAS, form.categoria)}</li>
                <li>Tipo: {etiqueta(TIPOS, form.tipo)}</li>
                <li>Ofertas de empleo: {form.usarMercado ? 'se intentan usar las del cargo (alargan el pedido y pueden subir un poco el costo)' : 'no se usan'}</li>
                {costoEstimado !== null && (
                  <li>
                    Referencia (promedio del último mes): unos {formatearPesos(costoEstimado)}. El costo real puede ser distinto.
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
              <p className="sr-only" role="status">{anuncioTope}</p>
              <label className="casilla gp-confirmar">
                <input type="checkbox" checked={entiendeCosto} onChange={(e) => setEntiendeCosto(e.target.checked)} autoFocus />
                Entiendo que tiene costo
              </label>
            </div>
            <div className="dialogo__pie">
              <button type="button" className="boton" onClick={cerrarModal}>Cancelar</button>
              <button type="button" className="boton boton--primario" onClick={generar} disabled={!entiendeCosto || generando}>
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
