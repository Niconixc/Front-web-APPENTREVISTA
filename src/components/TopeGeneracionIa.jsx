import { notaTopeDesactualizado, textoTope, valorTextoMedidor } from '../services/topeGeneracion';
import './TopeGeneracionIa.css';

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
 */
const TopeGeneracionIa = ({ tope, encabezado = '', desactualizado = false }) => {
  const textos = textoTope(tope);
  if (!textos) return null;
  const nota = notaTopeDesactualizado(tope, desactualizado);
  return (
    <div className={`tope-ia tope-ia-${tope.nivel}`}>
      {encabezado && <p className="tope-ia-encabezado">{encabezado}</p>}
      {nota && <p className="tope-ia-nota">{nota}</p>}
      <p className="tope-ia-titulo">
        <span className="tope-ia-estado">{textos.estado}</span>
        <span>{textos.titulo}</span>
      </p>
      {!tope.desactivado && (
        <div
          className="tope-ia-barra"
          role="meter"
          aria-label="Gasto del mes en generar preguntas con IA"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={tope.porcentaje}
          aria-valuetext={valorTextoMedidor(tope)}
        >
          <div className="tope-ia-relleno" style={{ width: `${tope.porcentaje}%` }} />
        </div>
      )}
      <p className="tope-ia-detalle">{textos.detalle}</p>
    </div>
  );
};

export default TopeGeneracionIa;
