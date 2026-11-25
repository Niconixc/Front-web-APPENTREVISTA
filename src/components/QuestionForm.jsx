import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createQuestion, mensajeDeError } from '../services/api';
import { aSolicitudPregunta, formularioVacio, validarFormularioPregunta } from '../services/etiquetas';
import { avisoSimilares, leerSimilares } from '../services/similitud';
import Icono from './Icono';
import QuestionFields from './QuestionFields';
import { ListaParecidas, NotaParecido } from './PreguntasParecidas';
import './QuestionForm.css';

/** Tiempo que se muestra el mensaje de éxito antes de volver al listado. */
const ESPERA_ANTES_DE_VOLVER_MS = 1500;

const QuestionForm = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(formularioVacio);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [loading, setLoading] = useState(false);
  // Similitud: la pregunta creada se parece a otras del banco. Solo avisa: ya quedó creada y aprobada.
  const [creada, setCreada] = useState(null); // {id, similares}
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || exito) return;
    setError('');

    const problema = validarFormularioPregunta(form);
    if (problema) {
      setError(problema);
      return;
    }

    setLoading(true);
    try {
      const data = await createQuestion(aSolicitudPregunta(form));
      const mensaje = data?.mensaje || 'Pregunta creada y aprobada';
      setExito(mensaje);
      const similares = leerSimilares(data);
      if (similares.length > 0) {
        // Con parecidas no se vuelve solo al listado: el admin decide si la deja o la revisa.
        setCreada({ id: typeof data?.id === 'string' ? data.id : null, similares });
        return;
      }
      // El listado puede leer location.state.mensaje para repetir el aviso.
      temporizador.current = setTimeout(() => navigate('/preguntas', { state: { mensaje } }), ESPERA_ANTES_DE_VOLVER_MS);
    } catch (err) {
      console.error('Error al crear pregunta:', err);
      setError(mensajeDeError(err, 'Error al crear la pregunta'));
    } finally {
      setLoading(false);
    }
  };

  const bloqueado = loading || Boolean(exito);

  return (
    <div className="pagina pagina--angosta">
      <header className="encabezado-pagina">
        <div className="encabezado-pagina__textos">
          <nav className="miga" aria-label="Ruta de navegación">
            <Link to="/preguntas">Preguntas</Link> / <span aria-current="page">Crear pregunta</span>
          </nav>
          <h1 className="encabezado-pagina__titulo">Crear pregunta</h1>
          <p className="encabezado-pagina__descripcion">Completa el formulario para agregar una pregunta al banco.</p>
        </div>
      </header>

      <div className="aviso aviso--exito qform-aviso-aprobada">
        <Icono nombre="check-circulo" className="aviso__icono" />
        <div className="aviso__contenido">
          Las preguntas creadas por un administrador quedan aprobadas y disponibles de inmediato.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="tarjeta qform-tarjeta" noValidate>
        <div className="qform-cabecera">
          <span className="qform-cabecera__icono" aria-hidden="true"><Icono nombre="pregunta-mas" tamano={18} /></span>
          <div className="qform-cabecera__textos">
            <h2 className="qform-cabecera__titulo">Datos de la pregunta</h2>
            <p className="qform-cabecera__sub">Los campos marcados con * son obligatorios.</p>
          </div>
        </div>
        <div className="tarjeta__cuerpo">
          <fieldset className="qform-bloqueo" disabled={bloqueado}>
            <QuestionFields form={form} setForm={setForm} />
          </fieldset>

          {error && (
            <div className="aviso aviso--peligro" role="alert">
              <Icono nombre="alerta" className="aviso__icono" />
              <div className="aviso__contenido">{error}</div>
            </div>
          )}
          {exito && !creada && (
            <div className="aviso aviso--exito" role="status">
              <Icono nombre="check-circulo" className="aviso__icono" />
              <div className="aviso__contenido">{exito}. Volviendo al listado...</div>
            </div>
          )}
          {exito && creada && (
            <div className="aviso aviso--aviso qform-aviso-parecidas" role="status">
              <Icono nombre="copiar" className="aviso__icono" />
              <div className="aviso__contenido">
                <p className="aviso__titulo">{exito}. {avisoSimilares(creada.similares)}</p>
                <p>Si es la misma pregunta, ábrela y recházala como duplicada.</p>
                <ListaParecidas similares={creada.similares} etiquetaLista="Preguntas del banco parecidas a la creada" />
                <NotaParecido />
              </div>
            </div>
          )}
        </div>

        <div className="tarjeta__pie qform-pie">
          {creada ? (
            <>
              {creada.id && (
                <button type="button" onClick={() => navigate(`/editar-pregunta/${creada.id}`)} className="boton">
                  Revisar la creada
                </button>
              )}
              <button type="button" onClick={() => navigate('/preguntas', { state: { mensaje: exito } })} className="boton boton--primario">
                Volver al listado
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => navigate('/preguntas')} className="boton" disabled={loading}>
                Cancelar
              </button>
              <button type="submit" className="boton boton--primario" disabled={bloqueado}>
                {loading ? 'Creando...' : 'Crear pregunta'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};

export default QuestionForm;
