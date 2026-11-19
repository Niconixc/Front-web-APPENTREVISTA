import { notaTopeDesactualizado, textoTope, valorTextoMedidor } from '../services/topeGeneracion';
import Icono from './Icono';
import './TopeGeneracionIa.css';

/** Piezas compartidas según el nivel del tope: el aviso, la insignia del estado, la barra y el ícono. */
const ESTILO_POR_NIVEL = {
  ok: { aviso: '', insignia: 'insignia--exito', medidor: '', icono: 'info' },
  cerca: { aviso: 'aviso--aviso', insignia: 'insignia--aviso', medidor: 'medidor--aviso', icono: 'alerta' },
  agotado: { aviso: 'aviso--peligro', insignia: 'insignia--peligro', medidor: 'medidor--peligro', icono: 'alerta' },
  desactivado: { aviso: '', insignia: '', medidor: '', icono: 'candado' },
};

/**
 * Gasto del mes (UTC) en generar preguntas con IA frente al tope del servidor (D23). Solo presenta lo que ya leyó
 * leerTopeGeneracion de Costos IA: no recalcula si está agotado (eso lo decide el servidor). Sin dato no muestra nada.
 *
 * Accesible: el estado va escrito en palabras (no solo con el color), la barra es un medidor (role="meter") con su valor
 * en texto para los lectores de pantalla y, con alto contraste del sistema (forced-colors), sigue viéndose.
 *
 * encabezado: texto que dice de qué es el bloque cuando la pantalla no tiene ya un título para él (opcional).
 * desactualizado: la última lectura de Costos IA falló y `tope` es el de una lectura anterior. Se dice en palabras antes
 * de los montos (notaTopeDesactualizado), para que no se lean como el saldo actual (opcional).
 * plano: dentro de una tarjeta que ya tiene su marco (el Resumen) se pinta sin el recuadro del aviso, para no poner
 * una caja dentro de otra (opcional).
 */
const TopeGeneracionIa = ({ tope, encabezado = '', desactualizado = false, plano = false }) => {
  const textos = textoTope(tope);
  if (!textos) return null;
  const nota = notaTopeDesactualizado(tope, desactualizado);
  const estilo = ESTILO_POR_NIVEL[tope.nivel] ?? ESTILO_POR_NIVEL.ok;
  return (
    <div className={`aviso tope-ia tope-ia-${tope.nivel} ${estilo.aviso}${plano ? ' tope-ia--plano' : ''}`.trim()}>
      <span className="tope-ia-icono" aria-hidden="true">
        <Icono nombre={estilo.icono} className="aviso__icono" />
      </span>
      <div className="aviso__contenido tope-ia-contenido">
        {encabezado && <p className="tope-ia-encabezado">{encabezado}</p>}
        {nota && <p className="tope-ia-nota">{nota}</p>}
        <p className="tope-ia-titulo">
          <span className={`insignia insignia--punto tope-ia-estado ${estilo.insignia}`.trim()}>{textos.estado}</span>
          <span className="tope-ia-titulo__texto">{textos.titulo}</span>
        </p>
        {!tope.desactivado && (
          <div
            className={`medidor tope-ia-barra ${estilo.medidor}`.trim()}
            role="meter"
            aria-label={tope.unidad === 'creditos' ? 'Credits usados del Token Plan de MiMo' : 'Gasto del mes en generar preguntas con IA'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={tope.porcentaje}
            aria-valuetext={valorTextoMedidor(tope)}
          >
            <div className="medidor__relleno tope-ia-relleno" style={{ transform: `scaleX(${tope.porcentaje / 100})` }} />
          </div>
        )}
        <p className="tope-ia-detalle">{textos.detalle}</p>
      </div>
    </div>
  );
};

export default TopeGeneracionIa;
