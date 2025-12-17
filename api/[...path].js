import axios from 'axios';

export default async function handler(req, res) {
    // obtener la ruta dinámica capturada por el archivo [...path].js
    // 1. Intentar obtener el path desde req.query (Estándar de Vercel)
    let { path } = req.query;
    let pathStr = '';

    if (path) {
        pathStr = Array.isArray(path) ? path.join('/') : path;
    } else {
        // 2. Fallback: Parsear manualmente req.url si req.query falla
        // req.url ej: "/api/auth/login?foo=bar"
        const urlPath = req.url.split('?')[0];
        // Eliminamos el prefijo "/api/" para obtener "auth/login"
        pathStr = urlPath.replace(/^\/?api\//, '');
    }

    if (!pathStr) {
        return res.status(400).json({
            error: 'Path not provided',
            details: 'Could not extract path from query or URL',
            debug: { url: req.url, query: req.query }
        });
    }

    // URL Real del Backend
    const targetUrl = `http://68.211.160.206:8080/${pathStr}`;

    console.log(`Proxying request to: ${targetUrl}`);

    // Definir headers de CORS para responder al navegador
    const corsHeaders = {
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400', // Cache preflight 24h
    };

    // 1. Manejar preflight (OPTIONS) directamente en el proxy
    if (req.method === 'OPTIONS') {
        Object.entries(corsHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        return res.status(200).end();
    }

    // Asegurarnos de que los headers CORS estén presentes en cualquier respuesta
    Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    try {
        // Limpiamos los headers conflictivos
        // Al eliminar 'host', 'origin' y 'referer', el backend pensará que es una petición directa (como Postman o Android)
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;
        delete headers['content-length']; // Important: axios recalculates this

        // Eliminamos 'path' de los query params para no enviarlo duplicado
        const queryParams = { ...req.query };
        delete queryParams.path;

        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: headers,
            data: req.body,
            params: queryParams,
            validateStatus: () => true, // No lanzar error en 401/403/500, queremos devolver la respuesta tal cual
        });

        // Devolver la respuesta del backend al frontend
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).json({
            error: 'Error interno del proxy',
            details: error.message
        });
    }
}
