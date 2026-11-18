import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  getUsers, contarPreguntas, getCostosIa, getCargos, getSkillsTrending, mensajeDeError,
} from '../services/api';
import {
  CATEGORIAS, ESTADOS_PREGUNTA, LIMITES, etiqueta, formatearDiaUtc, diaUtc, diasEntre, formatearPesos, NOTA_TIPO_CAMBIO, formatearDiaSinZona,
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

/** Monto del eje Y en pesos (el gráfico recibe USD, como los guarda el backend). */
const pesosEje = (v) => formatearPesos(v);

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

/** Celda de la fila de números clave (.metricas). */
const TarjetaResumen = ({ valor, texto, detalle }) => (
  <div className="metrica">
    <span className="metrica__etiqueta">{texto}</span>
    <span className="metrica__valor">{valor}</span>
    {detalle && <span className="metrica__detalle">{detalle}</span>}
  </div>
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

/** Tarjeta de un gráfico o tabla: título, control opcional a la derecha y contenido. */
const TarjetaGrafico = ({ titulo, control, children, sinRelleno = false }) => (
  <div className="tarjeta informes-tarjeta">
    <div className="tarjeta__encabezado">
      <h3 className="tarjeta__titulo">{titulo}</h3>
      {control}
    </div>
    <div className={sinRelleno ? 'informes-tarjeta__tabla' : 'tarjeta__cuerpo'}>{children}</div>
  </div>
);

/** Etiqueta "Nombre: valor (x%)" para los PieChart de conteos. */
const etiquetaTorta = ({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`;

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
    const [serie1, serie2, serie3] = paleta.series;
    return {
      series: paleta.series,
      reportes: serie1,
      generacion: serie2,
      barra: serie1,
      tonos: { activo: serie3, inactivo: paleta.ejes },
      estados: { pendiente: serie2, aprobada: serie3, rechazada: paleta.peligro },
      neutro: paleta.ejes,
      separador: paleta.superficie,
      rejilla: { stroke: paleta.rejilla },
      eje: { stroke: paleta.rejilla, tick: { fill: paleta.ejes, fontSize: 12 }, tickLine: false },
      tooltip: {
        contentStyle: {
          backgroundColor: paleta.superficie,
          border: `1px solid ${paleta.borde}`,
          borderRadius: 6,
          fontSize: 13,
        },
        labelStyle: { color: paleta.texto, fontWeight: 600 },
        itemStyle: { color: paleta.texto2 },
        cursor: { fill: paleta.cursor },
      },
      leyenda: {
        iconType: 'square',
        iconSize: 10,
        wrapperStyle: { fontSize: 13 },
        formatter: (valor) => <span style={{ color: paleta.texto2 }}>{valor}</span>,
      },
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

  return (
    <div className="pagina">
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
          <h2 className="seccion__titulo" id="informes-costos">Costos de IA</h2>
        </div>

        {topeGeneracion && (
          <div className={`informes-bloque${costos.cargando ? ' informes-actualizando' : ''}`}>
            <h3 className="informes-subtitulo">Tope mensual de generación de preguntas (mes en curso, UTC)</h3>
            <TopeGeneracionIa tope={topeGeneracion} />
            <details className="desplegable">
              <summary>Cómo se calcula el tope</summary>
              <div className="desplegable__cuerpo">
                <p>
                  Este bloque no depende del rango de abajo: siempre muestra el mes en curso (UTC). Es el mismo cálculo
                  que hace el servidor antes de cada generación: suma lo que gastaron todos los administradores,
                  incluidas las llamadas fallidas con su costo estimado. Una llamada que se cortó por tiempo
                  (provider_timeout) no suma, porque el proveedor no informó tokens, así que lo cobrado de verdad
                  puede ser algo mayor.
                </p>
              </div>
            </details>
          </div>
        )}

        <div className="informes-bloque">
          <h3 className="informes-subtitulo">Gasto por rango de fechas (UTC)</h3>
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
            <p className="nota">
              Rango consultado: <strong>{formatearDiaUtc(datosCostos.desde)}</strong> a{' '}
              <strong>{formatearDiaUtc(datosCostos.hasta)}</strong> ({costosPorDia.length} días). Los días se
              cuentan en UTC, por lo que el gasto de la noche en Chile puede aparecer en el día siguiente.{' '}
              {NOTA_TIPO_CAMBIO} El CSV trae los montos exactos en dólares.
            </p>

            <div className="metricas informes-metricas informes-metricas--costos">
              <TarjetaResumen
                valor={formatearPesos(totalCostos.costoUsd)}
                texto="Gasto total"
                detalle={`Incluye ${formatearPesos(totalCostos.costoEstimadoUsd)} estimado`}
              />
              <TarjetaResumen valor={formatearPesos(datosCostos.reportes?.costoUsd)} texto="Reportes de entrevista" />
              <TarjetaResumen valor={formatearPesos(datosCostos.generacionPreguntas?.costoUsd)} texto="Generación de preguntas" />
              <TarjetaResumen valor={numero(totalCostos.usos)} texto="Usos con IA" detalle="Reportes + preguntas generadas" />
              <TarjetaResumen valor={numero(totalCostos.fallidas)} texto="Fallidas" />
              <TarjetaResumen
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
                <TarjetaGrafico titulo="Gasto por día">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={costosPorDia}>
                      <CartesianGrid {...grafico.rejilla} vertical={false} />
                      <XAxis dataKey="fecha" {...grafico.eje} tickFormatter={formatearDiaUtc} minTickGap={16} />
                      <YAxis {...grafico.eje} tickFormatter={pesosEje} width={80} />
                      <Tooltip
                        {...grafico.tooltip}
                        labelFormatter={(fecha) => `${formatearDiaUtc(fecha)} (UTC)`}
                        formatter={(valor, nombre) => [formatearPesos(valor), nombre]}
                      />
                      <Legend {...grafico.leyenda} />
                      <Bar dataKey="reportes" stackId="a" fill={grafico.reportes} name="Reportes de entrevista" />
                      <Bar dataKey="generacion" stackId="a" fill={grafico.generacion} name="Generación de preguntas" />
                    </BarChart>
                  </ResponsiveContainer>
                </TarjetaGrafico>

                <div className="informes-rejilla informes-rejilla--modelos">
                  <TarjetaGrafico titulo="Gasto por modelo">
                    {costosPorModelo.length === 0 ? (
                      <SinDatos texto="Ningún modelo registra costo en este rango" />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={costosPorModelo}
                            cx="50%"
                            cy="45%"
                            outerRadius={90}
                            dataKey="value"
                            nameKey="name"
                            stroke={grafico.separador}
                          >
                            {costosPorModelo.map((m, i) => (
                              <Cell key={m.name} fill={grafico.series[i % grafico.series.length]} />
                            ))}
                          </Pie>
                          <Tooltip {...grafico.tooltip} formatter={(valor, nombre) => [formatearPesos(valor), nombre]} />
                          <Legend {...grafico.leyenda} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </TarjetaGrafico>

                  <TarjetaGrafico titulo="Detalle por modelo" sinRelleno>
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
                              <td className="num">{formatearPesos(m.gasto?.costoUsd)}</td>
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
          <h2 className="seccion__titulo" id="informes-usuarios">Usuarios</h2>
        </div>
        {usuarios.error && <ErrorSeccion mensaje={usuarios.error} onReintentar={cargarUsuarios} />}
        {usuarios.cargando && <Cargando texto="Cargando usuarios..." />}

        {!usuarios.cargando && !usuarios.error && (
          <>
            <div className="metricas informes-metricas informes-metricas--usuarios">
              <TarjetaResumen valor={numero(resumenUsuarios.total)} texto="Total usuarios" />
              <TarjetaResumen valor={numero(resumenUsuarios.activos)} texto="Activos" />
              <TarjetaResumen valor={numero(resumenUsuarios.inactivos)} texto="Inactivos" />
              <TarjetaResumen valor={numero(resumenUsuarios.admins)} texto="Administradores" />
            </div>

            <div className="informes-rejilla">
              <TarjetaGrafico titulo="Estado de usuarios">
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
                        label={etiquetaTorta}
                        outerRadius={80}
                        dataKey="value"
                        stroke={grafico.separador}
                      >
                        {resumenUsuarios.porEstado.map((item) => (
                          <Cell key={item.name} fill={grafico.tonos[item.tono]} />
                        ))}
                      </Pie>
                      <Tooltip {...grafico.tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </TarjetaGrafico>

              <TarjetaGrafico titulo="Altas por mes (últimos 12 meses)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={resumenUsuarios.altasPorMes}>
                    <CartesianGrid {...grafico.rejilla} vertical={false} />
                    <XAxis dataKey="mes" {...grafico.eje} minTickGap={8} />
                    <YAxis {...grafico.eje} allowDecimals={false} />
                    <Tooltip {...grafico.tooltip} />
                    <Bar dataKey="altas" fill={grafico.barra} name="Usuarios nuevos" />
                  </BarChart>
                </ResponsiveContainer>
              </TarjetaGrafico>
            </div>

            <div className="informes-bloque">
              <h3 className="informes-subtitulo">Lista de usuarios</h3>
              <div className="tabla-contenedor">
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
                        <td>{usuario.nombre ?? '-'}</td>
                        <td>{usuario.correo}</td>
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
                        <td>{usuario.idioma || '-'}</td>
                        <td className="num">{formatearFechaLocal(usuario.fechaCreacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resumenUsuarios.ordenados.length > USUARIOS_VISIBLES && (
                <div>
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
          <h2 className="seccion__titulo" id="informes-banco">Banco de preguntas</h2>
          {!banco.cargando && totalBanco !== null && (
            <p className="seccion__descripcion">Total en el banco: <strong>{numero(totalBanco)}</strong> preguntas.</p>
          )}
        </div>
        {banco.cargando && <Cargando texto="Contando preguntas..." />}

        {!banco.cargando && (
          <div className="informes-rejilla">
            <TarjetaGrafico titulo="Por estado">
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
                      label={etiquetaTorta}
                      outerRadius={80}
                      dataKey="value"
                      stroke={grafico.separador}
                    >
                      {banco.porEstado.filter((e) => e.value > 0).map((e) => (
                        <Cell key={e.estado} fill={grafico.estados[e.estado] || grafico.neutro} />
                      ))}
                    </Pie>
                    <Tooltip {...grafico.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </TarjetaGrafico>

            <TarjetaGrafico titulo="Por categoría">
              {banco.errorCategoria ? (
                <ErrorSeccion mensaje={banco.errorCategoria} onReintentar={cargarBanco} />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={banco.porCategoria}>
                    <CartesianGrid {...grafico.rejilla} vertical={false} />
                    <XAxis dataKey="categoria" {...grafico.eje} />
                    <YAxis {...grafico.eje} allowDecimals={false} />
                    <Tooltip {...grafico.tooltip} />
                    <Bar dataKey="cantidad" name="Preguntas" fill={grafico.barra} />
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
          <h2 className="seccion__titulo" id="informes-mercado">Mercado</h2>
        </div>

        <div className="informes-rejilla">
          <TarjetaGrafico titulo="Cargos por área">
            {mercado.errorCargos ? (
              <ErrorSeccion mensaje={mercado.errorCargos} onReintentar={() => cargarMercado(categoriaSkills)} />
            ) : !mercado.cargosPorArea ? (
              <Cargando />
            ) : mercado.cargosPorArea.length === 0 ? (
              <SinDatos texto="No hay cargos activos en el catálogo" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mercado.cargosPorArea}>
                  <CartesianGrid {...grafico.rejilla} vertical={false} />
                  <XAxis dataKey="area" {...grafico.eje} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis {...grafico.eje} allowDecimals={false} />
                  <Tooltip {...grafico.tooltip} />
                  <Bar dataKey="cantidadCargos" fill={grafico.barra} name="Cargos" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </TarjetaGrafico>

          <TarjetaGrafico
            titulo="Skills en tendencia"
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
                    <YAxis type="category" dataKey="nombre" {...grafico.eje} width={140} interval={0} />
                    <Tooltip {...grafico.tooltip} />
                    <Bar dataKey="demandaScore" fill={grafico.barra} name="Demanda" />
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
