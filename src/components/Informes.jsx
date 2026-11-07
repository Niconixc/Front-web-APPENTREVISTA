import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  getUsers, contarPreguntas, getCostosIa, getCargos, getSkillsTrending, mensajeDeError,
} from '../services/api';
import {
  CATEGORIAS, ESTADOS_PREGUNTA, LIMITES, etiqueta, formatearDiaUtc, diaUtc, diasEntre, formatearUsd,
} from '../services/etiquetas';
import './Informes.css';

// ============================================
// Utilidades locales
// ============================================

const COLORES = ['#8b5cf6', '#22d3ee', '#f59e0b', '#4ade80', '#f87171', '#94a3b8', '#ec4899', '#a3e635'];
const COLOR_REPORTES = '#8b5cf6';
const COLOR_GENERACION = '#22d3ee';
const COLORES_ESTADO = { pendiente: '#f59e0b', aprobada: '#4ade80', rechazada: '#f87171' };

const ESTILO_TOOLTIP = {
  contentStyle: { backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 },
  labelStyle: { color: '#fff' },
  itemStyle: { color: '#e5e5e5' },
};

const PRESETS = [7, 30, 90];
const USUARIOS_VISIBLES = 50;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const numero = (n) => (typeof n === 'number' ? n.toLocaleString('es-CL') : '—');

/** Monto corto para el eje Y (los costos de IA son fracciones de dólar). */
const usdEje = (v) => {
  const n = Number(v) || 0;
  if (n === 0) return '$0';
  return `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
};

/** fechaCreacion de usuarios es LocalDateTime sin zona: se toma el día tal cual, sin pasar por new Date. */
const formatearFechaLocal = (valor) => (valor ? formatearDiaUtc(String(valor).slice(0, 10)) : '—');

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

const TarjetaResumen = ({ icono, valor, texto, chico = false }) => (
  <div className="summary-card">
    <div className="summary-icon">{icono}</div>
    <div className="summary-content">
      <h3 className={chico ? 'summary-value-small' : undefined}>{valor}</h3>
      <p>{texto}</p>
    </div>
  </div>
);

const ErrorSeccion = ({ mensaje, onReintentar }) => (
  <div className="section-error">
    <span>{mensaje}</span>
    {onReintentar && (
      <button type="button" className="btn-link" onClick={onReintentar}>Reintentar</button>
    )}
  </div>
);

const Cargando = ({ texto = 'Cargando...' }) => <div className="section-loading">{texto}</div>;

const SinDatos = ({ texto }) => <div className="empty-chart">{texto}</div>;

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
        { name: 'Activos', value: activos, color: '#4ade80' },
        { name: 'Inactivos', value: inactivos, color: '#f87171' },
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
    <div className="informes">
      <div className="informes-header">
        <h1>Informes y costos IA</h1>
        <p className="subtitle">Gasto en IA, usuarios, banco de preguntas y catálogo del mercado (datos reales del backend)</p>
        <div className="download-buttons">
          <button
            type="button"
            className="btn-informe"
            onClick={handleCsvUsuarios}
            disabled={usuarios.cargando || Boolean(usuarios.error) || usuarios.lista.length === 0}
          >
            📄 CSV de usuarios
          </button>
          <button
            type="button"
            className="btn-informe"
            onClick={handleCsvCostos}
            disabled={costos.cargando || !datosCostos}
            title="Costo por día del rango consultado en la sección Costos de IA"
          >
            📄 CSV de costos por día
          </button>
        </div>
      </div>

      {/* ============ Sección 1: Costos de IA ============ */}
      <section className="informe-seccion">
        <h2 className="section-title">Costos de IA</h2>

        <form className="date-range" onSubmit={handleAplicar}>
          <label>
            <span>Desde</span>
            <input
              type="date"
              value={rango.desde}
              max={rango.hasta || undefined}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            />
          </label>
          <label>
            <span>Hasta</span>
            <input
              type="date"
              value={rango.hasta}
              min={rango.desde || undefined}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
            />
          </label>
          <button type="submit" className="btn-informe btn-informe-primary" disabled={costos.cargando}>
            {costos.cargando ? 'Cargando...' : 'Aplicar'}
          </button>
          <div className="date-presets">
            {PRESETS.map((dias) => (
              <button
                key={dias}
                type="button"
                className="btn-preset"
                onClick={() => handlePreset(dias)}
                disabled={costos.cargando}
              >
                Últimos {dias} días
              </button>
            ))}
          </div>
        </form>
        {errorRango && <ErrorSeccion mensaje={errorRango} />}

        {costos.error && (
          <ErrorSeccion mensaje={costos.error} onReintentar={() => aplicarRango(rango.desde, rango.hasta)} />
        )}
        {costos.cargando && !datosCostos && <Cargando texto="Cargando costos de IA..." />}

        {datosCostos && totalCostos && (
          <div className={costos.cargando ? 'is-refreshing' : undefined}>
            <p className="info-note">
              Rango consultado: <strong>{formatearDiaUtc(datosCostos.desde)}</strong> a{' '}
              <strong>{formatearDiaUtc(datosCostos.hasta)}</strong> ({costosPorDia.length} días). Los días se
              cuentan en UTC, por lo que el gasto de la noche en Chile puede aparecer en el día siguiente.
            </p>

            <div className="summary-cards">
              <TarjetaResumen icono="💵" valor={formatearUsd(totalCostos.costoUsd)} texto="Gasto total" chico />
              <TarjetaResumen icono="📊" valor={formatearUsd(datosCostos.reportes?.costoUsd)} texto="Reportes de entrevista" chico />
              <TarjetaResumen icono="🤖" valor={formatearUsd(datosCostos.generacionPreguntas?.costoUsd)} texto="Generación de preguntas" chico />
              <TarjetaResumen icono="✅" valor={numero(totalCostos.usos)} texto="Usos con IA (reportes + preguntas generadas)" />
              <TarjetaResumen icono="⚠️" valor={numero(totalCostos.fallidas)} texto="Fallidas" />
              <TarjetaResumen
                icono="🔤"
                valor={numero((Number(totalCostos.tokensEntrada) || 0) + (Number(totalCostos.tokensSalida) || 0))}
                texto="Tokens (entrada + salida)"
              />
            </div>

            <p className="info-note">
              En la generación de preguntas, cada pregunta generada cuenta como un uso (una llamada genera varias).
              El gasto total incluye {formatearUsd(totalCostos.costoEstimadoUsd)} estimado de llamadas fallidas que no
              guardaron su costo (se calcula con la tabla de precios); ese monto ya está sumado (no se suma dos veces).
            </p>

            {sinGasto ? (
              <SinDatos texto="Sin gasto de IA en este rango" />
            ) : (
              <>
                <div className="chart-card-full">
                  <h3>Gasto por día (USD)</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={costosPorDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="fecha" stroke="#fff" tickFormatter={formatearDiaUtc} minTickGap={16} />
                      <YAxis stroke="#fff" tickFormatter={usdEje} width={80} />
                      <Tooltip
                        {...ESTILO_TOOLTIP}
                        labelFormatter={(fecha) => `${formatearDiaUtc(fecha)} (UTC)`}
                        formatter={(valor, nombre) => [formatearUsd(valor), nombre]}
                      />
                      <Legend />
                      <Bar dataKey="reportes" stackId="a" fill={COLOR_REPORTES} name="Reportes de entrevista" />
                      <Bar dataKey="generacion" stackId="a" fill={COLOR_GENERACION} name="Generación de preguntas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="charts-grid">
                  <div className="chart-card">
                    <h3>Gasto por modelo</h3>
                    {costosPorModelo.length === 0 ? (
                      <SinDatos texto="Ningún modelo registra costo en este rango" />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={costosPorModelo} cx="50%" cy="45%" outerRadius={90} dataKey="value" nameKey="name">
                            {costosPorModelo.map((m, i) => (
                              <Cell key={m.name} fill={COLORES[i % COLORES.length]} />
                            ))}
                          </Pie>
                          <Tooltip {...ESTILO_TOOLTIP} formatter={(valor, nombre) => [formatearUsd(valor), nombre]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="chart-card">
                    <h3>Detalle por modelo</h3>
                    <div className="table-container table-container-inner">
                      <table className="users-table costs-table">
                        <thead>
                          <tr>
                            <th>Modelo</th>
                            <th>Usos</th>
                            <th>Fallidas</th>
                            <th>Tokens entrada</th>
                            <th>Tokens salida</th>
                            <th>Costo USD</th>
                            <th>Estimado USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(datosCostos.porModelo || []).map((m) => (
                            <tr key={m.modelo}>
                              <td>{m.modelo}</td>
                              <td>{numero(m.gasto?.usos)}</td>
                              <td>{numero(m.gasto?.fallidas)}</td>
                              <td>{numero(m.gasto?.tokensEntrada)}</td>
                              <td>{numero(m.gasto?.tokensSalida)}</td>
                              <td>{formatearUsd(m.gasto?.costoUsd)}</td>
                              <td>{formatearUsd(m.gasto?.costoEstimadoUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ============ Sección 2: Usuarios ============ */}
      <section className="informe-seccion">
        <h2 className="section-title">Usuarios</h2>
        {usuarios.error && <ErrorSeccion mensaje={usuarios.error} onReintentar={cargarUsuarios} />}
        {usuarios.cargando && <Cargando texto="Cargando usuarios..." />}

        {!usuarios.cargando && !usuarios.error && (
          <>
            <div className="summary-cards">
              <TarjetaResumen icono="👥" valor={numero(resumenUsuarios.total)} texto="Total usuarios" />
              <TarjetaResumen icono="✅" valor={numero(resumenUsuarios.activos)} texto="Activos" />
              <TarjetaResumen icono="❌" valor={numero(resumenUsuarios.inactivos)} texto="Inactivos" />
              <TarjetaResumen icono="🛡️" valor={numero(resumenUsuarios.admins)} texto="Administradores" />
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Estado de usuarios</h3>
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
                      >
                        {resumenUsuarios.porEstado.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip {...ESTILO_TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card">
                <h3>Altas por mes (últimos 12 meses)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={resumenUsuarios.altasPorMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="mes" stroke="#fff" minTickGap={8} />
                    <YAxis stroke="#fff" allowDecimals={false} />
                    <Tooltip {...ESTILO_TOOLTIP} />
                    <Bar dataKey="altas" fill="#8b5cf6" name="Usuarios nuevos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="users-table-section">
              <h3 className="subsection-title">Lista de usuarios</h3>
              <div className="table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Correo</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Idioma</th>
                      <th>Fecha registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosVisibles.map((usuario) => (
                      <tr key={usuario.usuarioId}>
                        <td>{usuario.nombre ?? '-'}</td>
                        <td>{usuario.correo}</td>
                        <td>{ROLES[usuario.rol] ?? usuario.rol}</td>
                        <td>
                          <span className={`status-badge ${usuario.estado}`}>
                            {usuario.estado === 'activo' ? '✅ Activo' : '❌ Inactivo'}
                          </span>
                        </td>
                        <td>{usuario.idioma || '-'}</td>
                        <td>{formatearFechaLocal(usuario.fechaCreacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resumenUsuarios.ordenados.length > USUARIOS_VISIBLES && (
                <button type="button" className="btn-link table-more" onClick={() => setVerTodosUsuarios((v) => !v)}>
                  {verTodosUsuarios
                    ? `Mostrar solo los ${USUARIOS_VISIBLES} más recientes`
                    : `Ver los ${resumenUsuarios.ordenados.length} usuarios`}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ============ Sección 3: Banco de preguntas ============ */}
      <section className="informe-seccion">
        <h2 className="section-title">Banco de preguntas</h2>
        {banco.cargando && <Cargando texto="Contando preguntas..." />}

        {!banco.cargando && (
          <>
            {totalBanco !== null && (
              <p className="info-note">Total en el banco: <strong>{numero(totalBanco)}</strong> preguntas.</p>
            )}
            <div className="charts-grid">
              <div className="chart-card">
                <h3>Por estado</h3>
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
                      >
                        {banco.porEstado.filter((e) => e.value > 0).map((e) => (
                          <Cell key={e.estado} fill={COLORES_ESTADO[e.estado] || '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip {...ESTILO_TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card">
                <h3>Por categoría</h3>
                {banco.errorCategoria ? (
                  <ErrorSeccion mensaje={banco.errorCategoria} onReintentar={cargarBanco} />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={banco.porCategoria}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="categoria" stroke="#fff" />
                      <YAxis stroke="#fff" allowDecimals={false} />
                      <Tooltip {...ESTILO_TOOLTIP} />
                      <Bar dataKey="cantidad" name="Preguntas" fill="#22d3ee" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ============ Sección 4: Mercado ============ */}
      <section className="informe-seccion">
        <h2 className="section-title">Mercado</h2>

        <div className="charts-grid">
          <div className="chart-card">
            <h3>Cargos por área</h3>
            {mercado.errorCargos ? (
              <ErrorSeccion mensaje={mercado.errorCargos} onReintentar={() => cargarMercado(categoriaSkills)} />
            ) : !mercado.cargosPorArea ? (
              <Cargando />
            ) : mercado.cargosPorArea.length === 0 ? (
              <SinDatos texto="No hay cargos activos en el catálogo" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={mercado.cargosPorArea}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="area" stroke="#fff" interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis stroke="#fff" allowDecimals={false} />
                  <Tooltip {...ESTILO_TOOLTIP} />
                  <Bar dataKey="cantidadCargos" fill="#8b5cf6" name="Cargos" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <h3>Skills en tendencia</h3>
              <select
                className="chart-select"
                value={categoriaSkills}
                onChange={(e) => setCategoriaSkills(e.target.value)}
                aria-label="Categoría de skills"
              >
                <option value="">Todas</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {mercado.errorSkills ? (
              <ErrorSeccion mensaje={mercado.errorSkills} onReintentar={() => cargarMercado(categoriaSkills)} />
            ) : !mercado.skills ? (
              <Cargando />
            ) : mercado.skills.length === 0 ? (
              <SinDatos texto="No hay skills con demanda registrada" />
            ) : (
              <div className={mercado.cargando ? 'is-refreshing' : undefined}>
                <ResponsiveContainer width="100%" height={alturaSkills}>
                  <BarChart data={mercado.skills} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" stroke="#fff" allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" stroke="#fff" width={140} interval={0} />
                    <Tooltip {...ESTILO_TOOLTIP} />
                    <Bar dataKey="demandaScore" fill="#f59e0b" name="Demanda" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="info-note info-note-footer">
        El backend V2 no expone a nivel admin datos de suscripciones (plan, estado) ni del perfil de los usuarios (área,
        cargo meta, nivel, último acceso), por eso este informe no los incluye. Los conteos de preguntas se calculan con
        consultas al banco y los datos de usuarios se agrupan en el navegador.
      </p>
    </div>
  );
};

export default Informes;
