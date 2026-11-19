import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Rectangle, ResponsiveContainer,
} from 'recharts';
import {
  getUsers, contarPreguntas, getCostosIa, getCargos, getSkillsTrending, mensajeDeError,
} from '../services/api';
import {
  CATEGORIAS, ESTADOS_PREGUNTA, LIMITES, etiqueta, formatearDiaUtc, diaUtc, diasEntre, formatearPesos, NOTA_TIPO_CAMBIO, formatearDiaSinZona, TIPO_CAMBIO_CLP,
  iniciales, tonoAvatar,
} from '../services/etiquetas';
import { leerTopeGeneracion } from '../services/topeGeneracion';
import TopeGeneracionIa from './TopeGeneracionIa';
import Icono from './Icono';
import usePaletaGrafico from './usePaletaGrafico';
import './Informes.css';

// ============================================
// Utilidades locales
// ============================================

const PRESETS = [7, 30, 90];
const USUARIOS_VISIBLES = 50;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const numero = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '—');

/** Monto del eje Y: el gráfico diario ya viene en pesos (así las divisiones del eje son redondas en pesos). */
const pesosEje = (v) => formatearPesos(v, 1);

/** fechaCreacion de usuarios es LocalDateTime sin zona: se toma el día tal cual, sin pasar por new Date. */
const formatearFechaLocal = formatearDiaSinZona;

/** 'AAAA-MM' → 'ene 2026'. */
const etiquetaMes = (mes) => {
  const [anio, m] = String(mes).split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} ${anio}` : mes;
};

/** Últimos 12 meses 'AAAA-MM' (del más antiguo al actual), en hora local. */
const ultimosDoceMeses = () => {
  const hoy = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  });
};

const ROLES = { admin: 'Admin', user: 'Usuario' };

/** Error del rango antes de llamar a V2 (mismas reglas: hasta >= desde y como máximo 92 días). */
const validarRango = (desde, hasta) => {
  if (!desde || !hasta) return 'Indica la fecha desde y la fecha hasta';
  if (hasta < desde) return "La fecha 'hasta' no puede ser anterior a 'desde'";
  if (diasEntre(desde, hasta).length > LIMITES.diasCostosMaximo) {
    return `Se pueden consultar como máximo ${LIMITES.diasCostosMaximo} días de una vez`;
  }
  return null;
};

// ---------- CSV (generado en el cliente) ----------

/** Campo de texto para CSV con ';'. Evita que Excel interprete fórmulas (=, +, -, @) en datos de usuarios. */
const campoTexto = (valor) => {
  let texto = valor == null ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** Número con coma decimal: con separador ';' Excel en español espera la coma. */
const campoNumero = (valor, decimales = 6) => (Number(valor) || 0).toFixed(decimales).replace('.', ',');

const descargarCsv = (nombreArchivo, encabezados, filas) => {
  const contenido = [encabezados.map(campoTexto).join(';'), ...filas.map((f) => f.join(';'))].join('\r\n');
  // BOM para que Excel abra el archivo como UTF-8 (tildes y ñ).
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ============================================
// Componentes pequeños
// ============================================

/** Porcentaje entero de una parte sobre el total (0 si no hay total). */
const porcentaje = (parte, total) => (total > 0 ? Math.round(((Number(parte) || 0) / total) * 100) : 0);

/**
 * Celda de la fila de números clave (.metricas). tono: color de identidad de .metrica (verde, ambar, coral, neutra;
 * sin tono, azul). icono: nombre de Icono para el cuadro de la etiqueta.
 */
const TarjetaResumen = ({ valor, texto, detalle, tono = '', icono = '' }) => (
  <div className={`metrica${tono ? ` metrica--${tono}` : ''}`}>
    <span className="metrica__etiqueta">
      {icono && (
        <span className="metrica__icono" aria-hidden="true"><Icono nombre={icono} tamano={15} /></span>
      )}
      {texto}
    </span>
    <span className="metrica__valor">{valor}</span>
    {detalle && <span className="metrica__pie">{detalle}</span>}
  </div>
);

/** Ícono de color junto al título de cada sección (solo identidad: el título ya lo dice en palabras). */
const IconoSeccion = ({ nombre, tono }) => (
  <span className={`informes-seccion__icono informes-seccion__icono--${tono}`} aria-hidden="true">
    <Icono nombre={nombre} tamano={16} />
  </span>
);

const ErrorSeccion = ({ mensaje, onReintentar }) => (
  <div className="aviso aviso--peligro informes-error">
    <Icono nombre="alerta" className="aviso__icono" />
    <div className="aviso__contenido informes-error__texto">{mensaje}</div>
    {onReintentar && (
      <button type="button" className="boton boton--chico" onClick={onReintentar}>Reintentar</button>
    )}
  </div>
);

const Cargando = ({ texto = 'Cargando...' }) => <div className="cargando informes-cargando">{texto}</div>;

const SinDatos = ({ texto }) => (
  <div className="vacio informes-vacio">
    <p>{texto}</p>
  </div>
);

/** Tarjeta de un gráfico o tabla: título display con subtítulo, control opcional a la derecha y contenido. */
const TarjetaGrafico = ({ titulo, subtitulo, control, children, sinRelleno = false }) => (
  <div className="tarjeta informes-tarjeta">
    <div className="informes-tarjeta__cabecera">
      <div className="informes-tarjeta__textos">
        <h3 className="informes-tarjeta__titulo">{titulo}</h3>
        {subtitulo && <p className="informes-tarjeta__sub">{subtitulo}</p>}
      </div>
      {control}
    </div>
    <div className={sinRelleno ? 'informes-tarjeta__tabla' : 'informes-tarjeta__cuerpo'}>{children}</div>
  </div>
);

/** Etiqueta "Nombre: valor (x%)" para los PieChart de conteos. */
const etiquetaTorta = ({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`;

/** La misma etiqueta dibujada en tinta secundaria (no del color del sector, que en los tonos claros no se lee). */
const etiquetaTortaEn = (color) => {
  const EtiquetaTorta = (props) => (
    <text x={props.x} y={props.y} fill={color} fontSize={13} textAnchor={props.textAnchor} dominantBaseline="central">
      {etiquetaTorta(props)}
    </text>
  );
  return EtiquetaTorta;
};

/** Barra de abajo del gasto diario: si el día no tiene generación, ella es la cima y lleva las esquinas redondeadas. */
const BarraReportes = (props) => (
  <Rectangle {...props} radius={props.payload?.generacion > 0 ? 0 : [5, 5, 0, 0]} />
);

/** Globo del gasto diario (el del Resumen): oscuro, con el día, el total y cada serie. */
const GloboGastoDia = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="informes-globo">
      <p className="informes-globo__titulo mono">{formatearDiaUtc(label)} (UTC)</p>
      <p className="informes-globo__total">{formatearPesos(fila.total, 1)}</p>
      <p className="informes-globo__fila">
        <span><i className="informes-globo__marca" />Reportes de entrevista</span>
        <b className="mono">{formatearPesos(fila.reportes, 1)}</b>
      </p>
      <p className="informes-globo__fila">
        <span><i className="informes-globo__marca informes-globo__marca--2" />Generación de preguntas</span>
        <b className="mono">{formatearPesos(fila.generacion, 1)}</b>
      </p>
    </div>
  );
};

/**
 * Globo oscuro para los demás gráficos: el nombre de la barra (si lo hay) y una fila por serie con su color.
 * Recharts le pasa active, payload y label; formatoValor da el texto de cada valor.
 */
const GloboInformes = ({ active, payload, label, formatoValor = numero, conEtiqueta = true }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="informes-globo">
      {conEtiqueta && label != null && label !== '' && <p className="informes-globo__titulo">{label}</p>}
      {payload.map((item) => (
        <p key={`${item.dataKey}-${item.name}`} className="informes-globo__fila">
          <span>
            <i className="informes-globo__marca" style={{ background: item.payload?.fill || item.color }} />
            {item.name}
          </span>
          <b className="mono">{formatoValor(item.value)}</b>
        </p>
      ))}
    </div>
  );
};

// ============================================
// Pantalla
// ============================================

const Informes = () => {
  // ---------- Costos de IA ----------
  const [rango, setRango] = useState(() => ({ desde: diaUtc(29), hasta: diaUtc(0) }));
  const [errorRango, setErrorRango] = useState('');
  const [costos, setCostos] = useState({ cargando: true, datos: null, error: '' });
  const pedidoCostos = useRef(0);

  // ---------- Usuarios ----------
  const [usuarios, setUsuarios] = useState({ cargando: true, lista: [], error: '' });
  const [verTodosUsuarios, setVerTodosUsuarios] = useState(false);

  // ---------- Banco de preguntas ----------
  const [banco, setBanco] = useState({ cargando: true, porEstado: null, errorEstado: '', porCategoria: null, errorCategoria: '' });

  // ---------- Mercado ----------
  const [categoriaSkills, setCategoriaSkills] = useState('');
  const [mercado, setMercado] = useState({ cargando: true, cargosPorArea: null, errorCargos: '', skills: null, errorSkills: '' });
  const pedidoMercado = useRef(0);

  // ---------- Estilo de los gráficos (desde los tokens) ----------
  const paleta = usePaletaGrafico();
  const grafico = useMemo(() => {
    const [serie1, serie2, serie3, serie4] = paleta.series;
    // Ejes sin línea ni marcas: las cifras y fechas en mono 13 px; los nombres (categorías, áreas, skills) en la letra
    // del texto, que se lee mejor.
    const ejeBase = { stroke: paleta.rejilla, tickLine: false, axisLine: false };
    return {
      series: paleta.series,
      reportes: serie1,
      generacion: serie2,
      barra: serie1,
      // Mismo significado que en el Resumen: verde = activo o aprobado, ámbar = pendiente.
      tonos: { activo: serie3, inactivo: paleta.ejes },
      estados: { pendiente: serie4, aprobada: serie3, rechazada: paleta.peligro },
      neutro: paleta.ejes,
      separador: paleta.superficie,
      textoEtiqueta: paleta.texto2,
      rejilla: { stroke: paleta.rejilla, strokeDasharray: '2 4' },
      eje: { ...ejeBase, tick: { fill: paleta.ejes, fontSize: 13, fontFamily: 'Geist Mono, ui-monospace, monospace' } },
      ejeTexto: { ...ejeBase, tick: { fill: paleta.ejes, fontSize: 13 } },
      cursor: { fill: paleta.cursor },
      // Esquinas redondeadas arriba (o a la derecha en las barras horizontales).
      radioArriba: [6, 6, 0, 0],
      radioDerecha: [0, 6, 6, 0],
    };
  }, [paleta]);

  const cargarCostos = useCallback(async (desde, hasta) => {
    const pedido = ++pedidoCostos.current;
    setCostos((prev) => ({ ...prev, cargando: true, error: '' }));
    try {
      const datos = await getCostosIa({ desde, hasta });
      if (pedido !== pedidoCostos.current) return;
      setCostos({ cargando: false, datos, error: '' });
    } catch (err) {
      if (pedido !== pedidoCostos.current) return;
      setCostos({ cargando: false, datos: null, error: mensajeDeError(err, 'No se pudieron cargar los costos de IA') });
    }
  }, []);

  const cargarUsuarios = useCallback(async () => {
    setUsuarios((prev) => ({ ...prev, cargando: true, error: '' }));
    const [r] = await Promise.allSettled([getUsers()]);
    if (r.status === 'fulfilled') {
      setUsuarios({ cargando: false, lista: Array.isArray(r.value) ? r.value : [], error: '' });
    } else {
      setUsuarios({ cargando: false, lista: [], error: mensajeDeError(r.reason, 'No se pudieron cargar los usuarios') });
    }
  }, []);

  const cargarBanco = useCallback(async () => {
    setBanco((prev) => ({ ...prev, cargando: true }));
    const estados = ESTADOS_PREGUNTA.map((e) => e.value);
    const categorias = CATEGORIAS.map((c) => c.value);
    const resultados = await Promise.allSettled([
      ...estados.map((estado) => contarPreguntas({ estado })),
      ...categorias.map((categoria) => contarPreguntas({ categoria })),
    ]);
    const deEstado = resultados.slice(0, estados.length);
    const deCategoria = resultados.slice(estados.length);
    const primerError = (lista, porDefecto) => {
      const fallo = lista.find((r) => r.status === 'rejected');
      return fallo ? mensajeDeError(fallo.reason, porDefecto) : '';
    };
    // Un gráfico con una parte faltante engañaría: si falla un conteo, ese gráfico muestra el error.
    const errorEstado = primerError(deEstado, 'No se pudieron contar las preguntas por estado');
    const errorCategoria = primerError(deCategoria, 'No se pudieron contar las preguntas por categoría');
    setBanco({
      cargando: false,
      porEstado: errorEstado ? null : estados.map((estado, i) => ({
        estado,
        name: etiqueta(ESTADOS_PREGUNTA, estado),
        value: Number(deEstado[i].value) || 0,
      })),
      errorEstado,
      porCategoria: errorCategoria ? null : categorias.map((categoria, i) => ({
        categoria: etiqueta(CATEGORIAS, categoria),
        cantidad: Number(deCategoria[i].value) || 0,
      })),
      errorCategoria,
    });
  }, []);

  const cargarMercado = useCallback(async (categoria) => {
    const pedido = ++pedidoMercado.current;
    setMercado((prev) => ({ ...prev, cargando: true }));
    // getCargos queda en memoria en api.js: volver a pedirlo al cambiar la categoría no genera otra petición.
    const [cargos, tendencias] = await Promise.allSettled([getCargos(), getSkillsTrending({ limit: 15, categoria })]);
    if (pedido !== pedidoMercado.current) return;

    let cargosPorArea = null;
    let errorCargos = '';
    if (cargos.status === 'fulfilled') {
      const conteo = {};
      (Array.isArray(cargos.value) ? cargos.value : []).forEach((c) => {
        const area = c.area || 'Sin área';
        conteo[area] = (conteo[area] || 0) + 1;
      });
      cargosPorArea = Object.entries(conteo)
        .map(([area, cantidadCargos]) => ({ area, cantidadCargos }))
        .sort((a, b) => b.cantidadCargos - a.cantidadCargos || a.area.localeCompare(b.area));
    } else {
      errorCargos = mensajeDeError(cargos.reason, 'No se pudieron cargar los cargos');
    }

    let skills = null;
    let errorSkills = '';
    if (tendencias.status === 'fulfilled') {
      skills = (tendencias.value?.skills || []).map((s) => ({
        nombre: s.nombre,
        categoria: etiqueta(CATEGORIAS, s.categoria),
        demandaScore: Number(s.demandaScore) || 0,
      }));
    } else {
      errorSkills = mensajeDeError(tendencias.reason, 'No se pudieron cargar las skills en tendencia');
    }

    setMercado({ cargando: false, cargosPorArea, errorCargos, skills, errorSkills });
  }, []);

  // Carga inicial: cada sección por su lado, para que una caída no deje la página en blanco.
  useEffect(() => {
    cargarCostos(rango.desde, rango.hasta);
    cargarUsuarios();
    cargarBanco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarCostos, cargarUsuarios, cargarBanco]);

  useEffect(() => {
    cargarMercado(categoriaSkills);
  }, [cargarMercado, categoriaSkills]);

  // ---------- Acciones de costos ----------

  const aplicarRango = (desde, hasta) => {
    const error = validarRango(desde, hasta);
    setErrorRango(error || '');
    if (!error) cargarCostos(desde, hasta);
  };

  const handleAplicar = (e) => {
    e.preventDefault();
    aplicarRango(rango.desde, rango.hasta);
  };

  const handlePreset = (dias) => {
    const nuevo = { desde: diaUtc(dias - 1), hasta: diaUtc(0) };
    setRango(nuevo);
    aplicarRango(nuevo.desde, nuevo.hasta);
  };

  // ---------- Datos derivados ----------

  const datosCostos = costos.datos;
  const totalCostos = datosCostos?.total;
  // Tope de generación del mes en curso (D23): viene en la misma respuesta y no depende del rango. Sin él (backend
  // anterior), el bloque no se muestra.
  const topeGeneracion = useMemo(() => leerTopeGeneracion(datosCostos), [datosCostos]);
  const sinGasto = Boolean(totalCostos) && (totalCostos.usos || 0) + (totalCostos.fallidas || 0) === 0;

  /** porDia solo trae los días con gasto: se rellenan con 0 todos los días del rango efectivo. */
  const costosPorDia = useMemo(() => {
    if (!datosCostos?.desde || !datosCostos?.hasta) return [];
    const porFecha = new Map((datosCostos.porDia || []).map((d) => [d.fecha, d]));
    return diasEntre(datosCostos.desde, datosCostos.hasta).map((fecha) => {
      const d = porFecha.get(fecha);
      const reportes = Number(d?.reportes?.costoUsd) || 0;
      const generacion = Number(d?.generacionPreguntas?.costoUsd) || 0;
      return { fecha, reportes, generacion, total: d ? Number(d.costoUsd) || reportes + generacion : 0 };
    });
  }, [datosCostos]);

  // Copia en pesos solo para el gráfico (el CSV sigue en dólares exactos con costosPorDia).
  const gastoDiarioPesos = useMemo(
    () => costosPorDia.map((d) => ({
      ...d,
      reportes: d.reportes * TIPO_CAMBIO_CLP,
      generacion: d.generacion * TIPO_CAMBIO_CLP,
      total: d.total * TIPO_CAMBIO_CLP,
    })),
    [costosPorDia]
  );

  const costosPorModelo = useMemo(
    () => (datosCostos?.porModelo || [])
      .map((m) => ({ name: m.modelo, value: Number(m.gasto?.costoUsd) || 0 }))
      .filter((m) => m.value > 0),
    [datosCostos]
  );

  const resumenUsuarios = useMemo(() => {
    const lista = usuarios.lista;
    const activos = lista.filter((u) => u.estado === 'activo').length;
    const inactivos = lista.filter((u) => u.estado === 'inactivo').length;
    const admins = lista.filter((u) => u.rol === 'admin').length;
    const meses = ultimosDoceMeses();
    const conteo = Object.fromEntries(meses.map((m) => [m, 0]));
    lista.forEach((u) => {
      const mes = String(u.fechaCreacion || '').slice(0, 7);
      if (mes in conteo) conteo[mes] += 1;
    });
    const ordenados = [...lista].sort((a, b) => String(b.fechaCreacion || '').localeCompare(String(a.fechaCreacion || '')));
    return {
      total: lista.length,
      activos,
      inactivos,
      admins,
      porEstado: [
        // tono: clave de la paleta del gráfico (se resuelve al dibujar, según el tema).
        { name: 'Activos', value: activos, tono: 'activo' },
        { name: 'Inactivos', value: inactivos, tono: 'inactivo' },
      ].filter((item) => item.value > 0),
      altasPorMes: meses.map((mes) => ({ mes: etiquetaMes(mes), altas: conteo[mes] })),
      ordenados,
    };
  }, [usuarios.lista]);

  const totalBanco = banco.porEstado ? banco.porEstado.reduce((s, e) => s + e.value, 0) : null;

  // ---------- Exportación ----------

  const handleCsvUsuarios = () => {
    const filas = resumenUsuarios.ordenados.map((u) => [
      campoTexto(u.usuarioId),
      campoTexto(u.correo),
      campoTexto(u.nombre ?? ''),
      campoTexto(u.rol),
      campoTexto(u.estado),
      campoTexto(u.idioma),
      campoTexto(u.fechaCreacion),
    ]);
    descargarCsv(
      `usuarios_${diaUtc(0)}.csv`,
      ['usuarioId', 'correo', 'nombre', 'rol', 'estado', 'idioma', 'fechaCreacion'],
      filas
    );
  };

  const handleCsvCostos = () => {
    const filas = costosPorDia.map((d) => [
      campoTexto(d.fecha),
      campoNumero(d.reportes),
      campoNumero(d.generacion),
      campoNumero(d.total),
    ]);
    descargarCsv(
      `costos_ia_${datosCostos.desde}_${datosCostos.hasta}.csv`,
      ['fecha (UTC)', 'costo reportes (USD)', 'costo generación de preguntas (USD)', 'costo total (USD)'],
      filas
    );
  };

  const alturaSkills = Math.max(300, (mercado.skills?.length || 0) * 30 + 40);
  const usuariosVisibles = verTodosUsuarios
    ? resumenUsuarios.ordenados
    : resumenUsuarios.ordenados.slice(0, USUARIOS_VISIBLES);

  // Solo para mostrar: participación de cada parte en el gasto del rango.
  const costoTotal = Number(totalCostos?.costoUsd) || 0;
  const totalModelos = costosPorModelo.reduce((s, m) => s + m.value, 0);
  const fallidasCostos = Number(totalCostos?.fallidas) || 0;

  return (
    <div className="pagina informes">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <h1 className="encabezado-pagina__titulo">Informes y costos IA</h1>
          <p className="encabezado-pagina__descripcion">
            Gasto en IA, usuarios, banco de preguntas y catálogo del mercado (datos reales del backend)
          </p>
        </div>
        <div className="encabezado-pagina__acciones">
          <button
            type="button"
            className="boton"
            onClick={handleCsvUsuarios}
            disabled={usuarios.cargando || Boolean(usuarios.error) || usuarios.lista.length === 0}
          >
            <Icono nombre="descargar" />
            CSV de usuarios
          </button>
          <button
            type="button"
            className="boton"
            onClick={handleCsvCostos}
            disabled={costos.cargando || !datosCostos}
            title="Costo por día del rango consultado en la sección Costos de IA"
          >
            <Icono nombre="descargar" />
            CSV de costos por día
          </button>
        </div>
      </header>

      {/* ============ Sección 1: Costos de IA ============ */}
      <section className="seccion informes-seccion" aria-labelledby="informes-costos">
        <div className="seccion__encabezado">
          <h2 className="seccion__titulo informes-seccion__titulo" id="informes-costos">
            <IconoSeccion nombre="dinero" tono="coral" />
            Costos de IA
          </h2>
        </div>

        {topeGeneracion && (
          <div className={`tarjeta informes-tope${costos.cargando ? ' informes-actualizando' : ''}`}>
            <div className="informes-tarjeta__cabecera">
              <div className="informes-tarjeta__textos">
                <h3 className="informes-tarjeta__titulo">
                  {topeGeneracion.unidad === 'creditos' ? 'Token Plan de MiMo' : 'Tope mensual de generación de preguntas'}
                </h3>
                <p className="informes-tarjeta__sub">
                  {topeGeneracion.unidad === 'creditos'
                    ? 'Periodo del plan en curso (UTC) · no depende del rango de fechas'
                    : 'Mes en curso (UTC) · no depende del rango de fechas'}
                </p>
              </div>
            </div>
            <div className="informes-tope__cuerpo">
              <TopeGeneracionIa tope={topeGeneracion} plano />
              <details className="desplegable">
                <summary>Cómo se calcula el tope</summary>
                <div className="desplegable__cuerpo">
                  {topeGeneracion.unidad === 'creditos' ? (
                    <p>
                      El Token Plan de MiMo es de precio fijo y trae una cuota de Credits por periodo. MiMo no tiene una
                      API para leer el saldo, así que el servidor lo calcula: suma los tokens de cada llamada de la app a
                      MiMo (reportes y generación, también las fallidas) y los convierte con la tabla oficial de Credits
                      (flash: 100 por token de entrada y 200 de salida; pro: 300 y 600), sin descontar la caché. Por eso
                      puede marcar algo más que la consola de MiMo, y no incluye lo que se use con la misma clave fuera
                      de la app. Con el plan agotado, generar con MiMo responde «tope alcanzado» sin llamar a la IA.
                    </p>
                  ) : (
                  <p>
                    Este bloque no depende del rango de abajo: siempre muestra el mes en curso (UTC). Es el mismo cálculo
                    que hace el servidor antes de cada generación: suma lo que gastaron todos los administradores,
                    incluidas las llamadas fallidas con su costo estimado. Una llamada que se cortó por tiempo
                    (provider_timeout) no suma, porque el proveedor no informó tokens, así que lo cobrado de verdad
                    puede ser algo mayor.
                  </p>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}

        <div className="informes-bloque">
          <div className="informes-bloque__cabecera">
            <h3 className="informes-bloque__titulo">Gasto por rango de fechas</h3>
            <p className="informes-bloque__sub">
              Días en UTC · hasta <span className="mono">{LIMITES.diasCostosMaximo}</span> días por consulta
            </p>
          </div>
          <form className="filtros informes-rango" onSubmit={handleAplicar}>
            <label className="campo">
              <span className="campo__etiqueta">Desde</span>
              <input
                type="date"
                value={rango.desde}
                max={rango.hasta || undefined}
                onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
              />
            </label>
            <label className="campo">
              <span className="campo__etiqueta">Hasta</span>
              <input
                type="date"
                value={rango.hasta}
                min={rango.desde || undefined}
                onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
              />
            </label>
            <button type="submit" className="boton boton--primario" disabled={costos.cargando}>
              {costos.cargando ? 'Cargando...' : 'Aplicar'}
            </button>
            <div className="informes-segmentado" role="group" aria-label="Rangos rápidos">
              {PRESETS.map((dias) => (
                <button
                  key={dias}
                  type="button"
                  className="informes-segmentado__opcion"
                  onClick={() => handlePreset(dias)}
                  disabled={costos.cargando}
                >
                  Últimos {dias} días
                </button>
              ))}
            </div>
          </form>
          {errorRango && <ErrorSeccion mensaje={errorRango} />}
        </div>

        {costos.error && (
          <ErrorSeccion mensaje={costos.error} onReintentar={() => aplicarRango(rango.desde, rango.hasta)} />
        )}
        {costos.cargando && !datosCostos && <Cargando texto="Cargando costos de IA..." />}

        {datosCostos && totalCostos && (
          <div className={`informes-bloque${costos.cargando ? ' informes-actualizando' : ''}`}>
            <p className="nota informes-nota-rango">
              Rango consultado: <strong className="mono">{formatearDiaUtc(datosCostos.desde)}</strong> a{' '}
              <strong className="mono">{formatearDiaUtc(datosCostos.hasta)}</strong> ({costosPorDia.length} días). Los días se
              cuentan en UTC, por lo que el gasto de la noche en Chile puede aparecer en el día siguiente.{' '}
              {NOTA_TIPO_CAMBIO} El CSV trae los montos exactos en dólares.
            </p>

            <div className="metricas informes-metricas informes-metricas--costos">
              <TarjetaResumen
                tono="coral"
                icono="dinero"
                valor={formatearPesos(totalCostos.costoUsd)}
                texto="Gasto total"
                detalle={`Incluye ${formatearPesos(totalCostos.costoEstimadoUsd)} estimado`}
              />
              <TarjetaResumen
                tono="coral"
                icono="informes"
                valor={formatearPesos(datosCostos.reportes?.costoUsd)}
                texto="Reportes de entrevista"
                detalle={`${porcentaje(datosCostos.reportes?.costoUsd, costoTotal)} % del gasto`}
              />
              <TarjetaResumen
                tono="coral"
                icono="generar"
                valor={formatearPesos(datosCostos.generacionPreguntas?.costoUsd)}
                texto="Generación de preguntas"
                detalle={`${porcentaje(datosCostos.generacionPreguntas?.costoUsd, costoTotal)} % del gasto`}
              />
              <TarjetaResumen icono="check-circulo" valor={numero(totalCostos.usos)} texto="Usos con IA" detalle="Reportes + preguntas generadas" />
              <TarjetaResumen
                tono={fallidasCostos > 0 ? 'ambar' : 'neutra'}
                icono="alerta"
                valor={numero(totalCostos.fallidas)}
                texto="Fallidas"
              />
              <TarjetaResumen
                tono="neutra"
                icono="codigos"
                valor={numero((Number(totalCostos.tokensEntrada) || 0) + (Number(totalCostos.tokensSalida) || 0))}
                texto="Tokens"
                detalle="Entrada + salida"
              />
            </div>

            <details className="desplegable">
              <summary>Cómo se calcula el gasto</summary>
              <div className="desplegable__cuerpo">
                <p>
                  En la generación de preguntas, cada pregunta generada cuenta como un uso (una llamada genera
                  varias). El gasto total incluye {formatearPesos(totalCostos.costoEstimadoUsd)} estimado de llamadas
                  fallidas que no guardaron su costo (se calcula con la tabla de precios); ese monto ya está sumado (no
                  se suma dos veces).
                </p>
              </div>
            </details>

            {sinGasto ? (
              <div className="tarjeta">
                <SinDatos texto="Sin gasto de IA en este rango" />
              </div>
            ) : (
              <>
                <TarjetaGrafico
                  titulo="Gasto por día"
                  subtitulo={(
                    <>
                      <span className="mono">{formatearDiaUtc(datosCostos.desde)} al {formatearDiaUtc(datosCostos.hasta)}</span>
                      {' · '}{costosPorDia.length} días (UTC)
                    </>
                  )}
                  control={(
                    <div className="informes-total">
                      <span className="informes-total__cifra num">{formatearPesos(totalCostos.costoUsd)}</span>
                      <span className="informes-tarjeta__sub">Total del rango</span>
                    </div>
                  )}
                >
                  <ul className="leyenda informes-leyenda">
                    <li>
                      <span className="leyenda__marca" />Reportes de entrevista{' '}
                      <span className="mono texto-3">{formatearPesos(datosCostos.reportes?.costoUsd)}</span>
                    </li>
                    <li>
                      <span className="leyenda__marca leyenda__marca--2" />Generación de preguntas{' '}
                      <span className="mono texto-3">{formatearPesos(datosCostos.generacionPreguntas?.costoUsd)}</span>
                    </li>
                  </ul>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={gastoDiarioPesos} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="24%">
                      <CartesianGrid {...grafico.rejilla} vertical={false} />
                      <XAxis dataKey="fecha" {...grafico.eje} tickFormatter={(f) => formatearDiaUtc(f).slice(0, 5)} minTickGap={24} />
                      <YAxis {...grafico.eje} tickFormatter={pesosEje} width={72} />
                      <Tooltip content={<GloboGastoDia />} cursor={grafico.cursor} />
                      <Bar
                        dataKey="reportes"
                        stackId="a"
                        fill={grafico.reportes}
                        name="Reportes de entrevista"
                        maxBarSize={28}
                        shape={BarraReportes}
                      />
                      <Bar
                        dataKey="generacion"
                        stackId="a"
                        fill={grafico.generacion}
                        name="Generación de preguntas"
                        maxBarSize={28}
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </TarjetaGrafico>

                <div className="informes-rejilla informes-rejilla--modelos">
                  <TarjetaGrafico titulo="Gasto por modelo" subtitulo="Qué parte del gasto se llevó cada modelo">
                    {costosPorModelo.length === 0 ? (
                      <SinDatos texto="Ningún modelo registra costo en este rango" />
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={costosPorModelo}
                              cx="50%"
                              cy="50%"
                              innerRadius={58}
                              outerRadius={92}
                              paddingAngle={costosPorModelo.length > 1 ? 2 : 0}
                              cornerRadius={4}
                              dataKey="value"
                              nameKey="name"
                              stroke={grafico.separador}
                              strokeWidth={2}
                            >
                              {costosPorModelo.map((m, i) => (
                                <Cell key={m.name} fill={grafico.series[i % grafico.series.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={<GloboInformes conEtiqueta={false} formatoValor={(valor) => formatearPesos(valor)} />}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <ul className="informes-modelos">
                          {costosPorModelo.map((m, i) => (
                            <li key={m.name} className="informes-modelos__fila">
                              <span className="informes-modelos__nombre">
                                <i
                                  className="informes-modelos__marca"
                                  style={{ background: grafico.series[i % grafico.series.length] }}
                                />
                                <span className="mono truncar">{m.name}</span>
                              </span>
                              <span className="informes-modelos__cifras">
                                <span className="num">{formatearPesos(m.value)}</span>
                                <span className="mono texto-3">{porcentaje(m.value, totalModelos)} %</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </TarjetaGrafico>

                  <TarjetaGrafico titulo="Detalle por modelo" subtitulo="Usos, tokens y costo de cada modelo en el rango" sinRelleno>
                    <div className="tabla-contenedor informes-tabla-contenedor">
                      <table className="tabla tabla--compacta informes-tabla">
                        <thead>
                          <tr>
                            <th>Modelo</th>
                            <th className="num">Usos</th>
                            <th className="num">Fallidas</th>
                            <th className="num">Tokens entrada</th>
                            <th className="num">Tokens salida</th>
                            <th className="num">Costo</th>
                            <th className="num">Estimado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(datosCostos.porModelo || []).map((m) => (
                            <tr key={m.modelo}>
                              <td className="mono informes-modelo">{m.modelo}</td>
                              <td className="num">{numero(m.gasto?.usos)}</td>
                              <td className="num">{numero(m.gasto?.fallidas)}</td>
                              <td className="num">{numero(m.gasto?.tokensEntrada)}</td>
                              <td className="num">{numero(m.gasto?.tokensSalida)}</td>
                              <td className="num informes-tabla__monto">{formatearPesos(m.gasto?.costoUsd)}</td>
                              <td className="num">{formatearPesos(m.gasto?.costoEstimadoUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TarjetaGrafico>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ============ Sección 2: Usuarios ============ */}
      <section className="seccion informes-seccion" aria-labelledby="informes-usuarios">
        <div className="seccion__encabezado">
          <h2 className="seccion__titulo informes-seccion__titulo" id="informes-usuarios">
            <IconoSeccion nombre="usuarios" tono="azul" />
            Usuarios
          </h2>
        </div>
        {usuarios.error && <ErrorSeccion mensaje={usuarios.error} onReintentar={cargarUsuarios} />}
        {usuarios.cargando && <Cargando texto="Cargando usuarios..." />}

        {!usuarios.cargando && !usuarios.error && (
          <>
            <div className="metricas informes-metricas informes-metricas--usuarios">
              <TarjetaResumen icono="usuarios" valor={numero(resumenUsuarios.total)} texto="Total usuarios" />
              <TarjetaResumen
                tono="verde"
                icono="check-circulo"
                valor={numero(resumenUsuarios.activos)}
                texto="Activos"
                detalle={`${porcentaje(resumenUsuarios.activos, resumenUsuarios.total)} % del total`}
              />
              <TarjetaResumen tono="neutra" icono="reloj" valor={numero(resumenUsuarios.inactivos)} texto="Inactivos" />
              <TarjetaResumen icono="escudo" valor={numero(resumenUsuarios.admins)} texto="Administradores" />
            </div>

            <div className="informes-rejilla">
              <TarjetaGrafico titulo="Estado de usuarios" subtitulo="Cuentas activas e inactivas">
                {resumenUsuarios.porEstado.length === 0 ? (
                  <SinDatos texto="No hay usuarios registrados" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={resumenUsuarios.porEstado}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={etiquetaTortaEn(grafico.textoEtiqueta)}
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={resumenUsuarios.porEstado.length > 1 ? 2 : 0}
                        cornerRadius={4}
                        dataKey="value"
                        stroke={grafico.separador}
                        strokeWidth={2}
                      >
                        {resumenUsuarios.porEstado.map((item) => (
                          <Cell key={item.name} fill={grafico.tonos[item.tono]} />
                        ))}
                      </Pie>
                      <Tooltip content={<GloboInformes conEtiqueta={false} />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </TarjetaGrafico>

              <TarjetaGrafico titulo="Altas por mes (últimos 12 meses)" subtitulo="Cuentas nuevas según su fecha de registro">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={resumenUsuarios.altasPorMes} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid {...grafico.rejilla} vertical={false} />
                    <XAxis dataKey="mes" {...grafico.eje} minTickGap={8} />
                    <YAxis {...grafico.eje} allowDecimals={false} width={40} />
                    <Tooltip content={<GloboInformes />} cursor={grafico.cursor} />
                    <Bar dataKey="altas" fill={grafico.barra} name="Usuarios nuevos" maxBarSize={32} radius={grafico.radioArriba} />
                  </BarChart>
                </ResponsiveContainer>
              </TarjetaGrafico>
            </div>

            <div className="tarjeta informes-tarjeta informes-usuarios">
              <div className="informes-tarjeta__cabecera">
                <div className="informes-tarjeta__textos">
                  <h3 className="informes-tarjeta__titulo">Lista de usuarios</h3>
                  <p className="informes-tarjeta__sub">
                    Del más reciente al más antiguo · {numero(resumenUsuarios.total)}{' '}
                    {resumenUsuarios.total === 1 ? 'usuario' : 'usuarios'}
                  </p>
                </div>
              </div>
              <div className="informes-tarjeta__tabla">
                <div className="tabla-contenedor informes-tabla-contenedor">
                  <table className="tabla tabla--compacta informes-tabla">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Correo</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Idioma</th>
                        <th className="num">Fecha registro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosVisibles.map((usuario) => (
                        <tr key={usuario.usuarioId}>
                          <td>
                            <span className="informes-persona">
                              <span
                                className={`avatar avatar--chico informes-persona__avatar ${usuario.nombre ? `avatar--tono-${tonoAvatar(usuario.correo)}` : 'avatar--neutro'}`}
                                aria-hidden="true"
                              >
                                {usuario.nombre ? iniciales(usuario.nombre) : <Icono nombre="usuarios" tamano={14} />}
                              </span>
                              <span className={usuario.nombre ? 'informes-persona__nombre' : 'texto-3'}>{usuario.nombre ?? '-'}</span>
                            </span>
                          </td>
                          <td className="texto-2">{usuario.correo}</td>
                          <td>
                            <span className={`insignia${usuario.rol === 'admin' ? ' insignia--info' : ''}`}>
                              {ROLES[usuario.rol] ?? usuario.rol}
                            </span>
                          </td>
                          <td>
                            <span className={`insignia insignia--punto${usuario.estado === 'activo' ? ' insignia--exito' : ''}`}>
                              {usuario.estado === 'activo' ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="mono texto-2">{usuario.idioma || '-'}</td>
                          <td className="num mono texto-2">{formatearFechaLocal(usuario.fechaCreacion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {resumenUsuarios.ordenados.length > USUARIOS_VISIBLES && (
                <div className="informes-tarjeta__pie">
                  <button
                    type="button"
                    className="boton boton--sutil boton--chico"
                    onClick={() => setVerTodosUsuarios((v) => !v)}
                  >
                    {verTodosUsuarios
                      ? `Mostrar solo los ${USUARIOS_VISIBLES} más recientes`
                      : `Ver los ${resumenUsuarios.ordenados.length} usuarios`}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ============ Sección 3: Banco de preguntas ============ */}
      <section className="seccion informes-seccion" aria-labelledby="informes-banco">
        <div className="seccion__encabezado">
          <h2 className="seccion__titulo informes-seccion__titulo" id="informes-banco">
            <IconoSeccion nombre="preguntas" tono="verde" />
            Banco de preguntas
          </h2>
          {!banco.cargando && totalBanco !== null && (
            <p className="seccion__descripcion">Total en el banco: <strong>{numero(totalBanco)}</strong> preguntas.</p>
          )}
        </div>
        {banco.cargando && <Cargando texto="Contando preguntas..." />}

        {!banco.cargando && (
          <div className="informes-rejilla">
            <TarjetaGrafico titulo="Por estado" subtitulo="Aprobadas, pendientes y rechazadas">
              {banco.errorEstado ? (
                <ErrorSeccion mensaje={banco.errorEstado} onReintentar={cargarBanco} />
              ) : totalBanco === 0 ? (
                <SinDatos texto="El banco de preguntas está vacío" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={banco.porEstado.filter((e) => e.value > 0)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={etiquetaTortaEn(grafico.textoEtiqueta)}
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={banco.porEstado.filter((e) => e.value > 0).length > 1 ? 2 : 0}
                      cornerRadius={4}
                      dataKey="value"
                      stroke={grafico.separador}
                      strokeWidth={2}
                    >
                      {banco.porEstado.filter((e) => e.value > 0).map((e) => (
                        <Cell key={e.estado} fill={grafico.estados[e.estado] || grafico.neutro} />
                      ))}
                    </Pie>
                    <Tooltip content={<GloboInformes conEtiqueta={false} />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </TarjetaGrafico>

            <TarjetaGrafico titulo="Por categoría" subtitulo="Preguntas del banco en cada categoría">
              {banco.errorCategoria ? (
                <ErrorSeccion mensaje={banco.errorCategoria} onReintentar={cargarBanco} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={banco.porCategoria} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid {...grafico.rejilla} vertical={false} />
                    <XAxis dataKey="categoria" {...grafico.ejeTexto} />
                    <YAxis {...grafico.eje} allowDecimals={false} width={40} />
                    <Tooltip content={<GloboInformes />} cursor={grafico.cursor} />
                    <Bar dataKey="cantidad" name="Preguntas" fill={grafico.barra} maxBarSize={48} radius={grafico.radioArriba} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </TarjetaGrafico>
          </div>
        )}
      </section>

      {/* ============ Sección 4: Mercado ============ */}
      <section className="seccion informes-seccion" aria-labelledby="informes-mercado">
        <div className="seccion__encabezado">
          <h2 className="seccion__titulo informes-seccion__titulo" id="informes-mercado">
            <IconoSeccion nombre="informes" tono="ambar" />
            Mercado
          </h2>
        </div>

        <div className="informes-rejilla">
          <TarjetaGrafico titulo="Cargos por área" subtitulo="Cargos activos del catálogo en cada área">
            {mercado.errorCargos ? (
              <ErrorSeccion mensaje={mercado.errorCargos} onReintentar={() => cargarMercado(categoriaSkills)} />
            ) : !mercado.cargosPorArea ? (
              <Cargando />
            ) : mercado.cargosPorArea.length === 0 ? (
              <SinDatos texto="No hay cargos activos en el catálogo" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mercado.cargosPorArea} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid {...grafico.rejilla} vertical={false} />
                  <XAxis dataKey="area" {...grafico.ejeTexto} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis {...grafico.eje} allowDecimals={false} width={40} />
                  <Tooltip content={<GloboInformes />} cursor={grafico.cursor} />
                  <Bar dataKey="cantidadCargos" fill={grafico.barra} name="Cargos" maxBarSize={40} radius={grafico.radioArriba} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </TarjetaGrafico>

          <TarjetaGrafico
            titulo="Skills en tendencia"
            subtitulo="Las 15 con más demanda"
            control={(
              <select
                className="informes-selector"
                value={categoriaSkills}
                onChange={(e) => setCategoriaSkills(e.target.value)}
                aria-label="Categoría de skills"
              >
                <option value="">Todas</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            )}
          >
            {mercado.errorSkills ? (
              <ErrorSeccion mensaje={mercado.errorSkills} onReintentar={() => cargarMercado(categoriaSkills)} />
            ) : !mercado.skills ? (
              <Cargando />
            ) : mercado.skills.length === 0 ? (
              <SinDatos texto="No hay skills con demanda registrada" />
            ) : (
              <div className={mercado.cargando ? 'informes-actualizando' : undefined}>
                <ResponsiveContainer width="100%" height={alturaSkills}>
                  <BarChart data={mercado.skills} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid {...grafico.rejilla} horizontal={false} />
                    <XAxis type="number" {...grafico.eje} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" {...grafico.ejeTexto} width={140} interval={0} />
                    <Tooltip content={<GloboInformes />} cursor={grafico.cursor} />
                    <Bar dataKey="demandaScore" fill={grafico.barra} name="Demanda" maxBarSize={18} radius={grafico.radioDerecha} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </TarjetaGrafico>
        </div>
      </section>

      <p className="nota nota--chica informes-pie">
        El backend V2 no expone a nivel admin datos de suscripciones (plan, estado) ni del perfil de los usuarios (área,
        cargo meta, nivel, último acceso), por eso este informe no los incluye. Los conteos de preguntas se calculan con
        consultas al banco y los datos de usuarios se agrupan en el navegador.
      </p>
    </div>
  );
};

export default Informes;
