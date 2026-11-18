import axios from 'axios';

/**
 * Proxy de Vercel hacia el backend V2: el panel se sirve por HTTPS y así evita el Mixed Content (HTTPS -> HTTP).
 * Reenvía la solicitud tal cual y devuelve la respuesta del backend sin tocarla (incluidos sus errores
 * {error, mensaje, message}, que el panel muestra). La URL del backend nunca llega al navegador.
 */

// Un poco menos que maxDuration (60 s, vercel.json): así el proxy alcanza a responder su propio 504 'servidor_tardo'
// en vez de que Vercel corte la función con un error en texto. Una generación con IA que tarde más de esto no se
// puede esperar a través de Vercel (puede haber terminado y cobrado: el panel manda a revisar las pendientes).
const TIEMPO_MAXIMO_MS = 55000;

export default async function handler(req, res) {
    // Ruta capturada por [...path].js: desde req.query (estándar de Vercel) o, si falta, desde req.url.
    let { path } = req.query;
    let pathStr = path ? (Array.isArray(path) ? path.join('/') : path) : req.url.split('?')[0].replace(/^\/?api\//, '');

    const corsHeaders = {
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
    };
    Object.entries(corsHeaders).forEach(([clave, valor]) => res.setHeader(clave, valor));

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!pathStr) {
        return res.status(400).json({ error: 'ruta_requerida', mensaje: 'Falta la ruta a la que llamar' });
    }

    // Sin BACKEND_URL no se adivina: antes se caía en silencio a la IP del backend viejo.
    const backendUrl = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendUrl) {
        console.error('Proxy: falta la variable BACKEND_URL en Vercel');
        return res.status(500).json({ error: 'backend_no_configurado', mensaje: 'El panel no tiene configurada la dirección del servidor (BACKEND_URL)' });
    }
    const targetUrl = `${backendUrl}/${pathStr}`;

    try {
        // Sin host/origin/referer: el backend la ve como una solicitud directa (como la app Android).
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;
        delete headers['content-length']; // axios lo recalcula

        const queryParams = { ...req.query };
        delete queryParams.path;

        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers,
            data: req.body,
            params: queryParams,
            timeout: TIEMPO_MAXIMO_MS,
            validateStatus: () => true, // los 4xx/5xx del backend se devuelven tal cual
        });

        if (response.status >= 400) console.warn(`Proxy: ${req.method} /${pathStr} → ${response.status}`);
        if (response.headers['content-type']) res.setHeader('content-type', response.headers['content-type']);

        // Una ruta o método que el backend no tiene (404/405 sin cuerpo): un error legible con el mismo formato.
        const sinCuerpo = response.data === undefined || response.data === null || response.data === '';
        if (sinCuerpo && response.status === 404) {
            return res.status(404).json({ error: 'ruta_no_encontrada', mensaje: 'El servidor no tiene esta ruta' });
        }
        if (sinCuerpo && response.status === 405) {
            return res.status(405).json({ error: 'metodo_no_permitido', mensaje: 'El servidor no permite esta operación en esta ruta' });
        }
        return res.status(response.status).send(response.data);
    } catch (error) {
        console.error('Proxy: no se pudo contactar al backend', error.code || error.message);
        const tardo = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
        return res.status(tardo ? 504 : 502).json({
            error: tardo ? 'servidor_tardo' : 'proxy_error',
            mensaje: tardo ? 'El servidor tardó demasiado en responder' : 'No se pudo contactar al servidor',
        });
    }
}
