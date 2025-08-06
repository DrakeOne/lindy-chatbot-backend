// Archivo: /api/index.js
// Servidor intermediario para Lindy AI, optimizado para Vercel.

const fetch = require('node-fetch');

// Objeto para almacenar las respuestas de las peticiones pendientes.
const pendingResponses = {};

module.exports = async (req, res) => {
    // Cabeceras CORS para permitir la comunicación desde cualquier frontend.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Petición de pre-vuelo (preflight) del navegador.
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // --- RUTA 1: Llamada desde el frontend del chatbot ---
    if (req.body && req.body.message) {
        const { message, requestId } = req.body;

        if (!requestId) {
            return res.status(400).json({ error: 'Falta requestId.' });
        }

        try {
            // Construye la URL de callback apuntando a este mismo servidor.
            const callbackURL = `https://${req.headers.host}/api?requestId=${requestId}`;
            
            // Llama al webhook de Lindy, pasando el mensaje y la callbackURL.
            // Las claves secretas se leen de las Variables de Entorno de Vercel.
            await fetch(process.env.LINDY_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.LINDY_SECRET_KEY}`
                },
                body: JSON.stringify({ message: message, callbackURL: callbackURL })
            });

            // Almacena la función de respuesta para usarla cuando Lindy llame de vuelta.
            pendingResponses[requestId] = res;

            // Establece un timeout de 25 segundos.
            setTimeout(() => {
                if (pendingResponses[requestId]) {
                    pendingResponses[requestId].status(504).json({ response: "El asistente tardó mucho en responder." });
                    delete pendingResponses[requestId];
                }
            }, 25000);

        } catch (error) {
            res.status(500).json({ error: 'Error interno del servidor al contactar a Lindy.' });
        }
        return;
    }

    // --- RUTA 2: Llamada de vuelta (callback) desde Lindy ---
    if (req.query.requestId) {
        const { requestId } = req.query;
        const lindyCallbackBody = req.body;

        const originalResponse = pendingResponses[requestId];

        if (originalResponse) {
            // Envía la respuesta de Lindy al frontend que estaba esperando.
            originalResponse.status(200).json(lindyCallbackBody);
            delete pendingResponses[requestId];
        } else {
            res.status(200).send('Callback recibido pero la petición original ya no estaba esperando.');
        }
        return;
    }

    res.status(404).send('Ruta no encontrada. Asegúrate de estar llamando a la ruta correcta.');
};