// server.js - Servidor WebSocket adaptado para tu sistema de conexión
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Crear servidor HTTP para servir archivos estáticos
const server = http.createServer((req, res) => {
    // Servir archivos estáticos del juego
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Determinar el tipo de contenido
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    switch (ext) {
        case '.js': contentType = 'application/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpeg'; break;
        case '.ico': contentType = 'image/x-icon'; break;
    }
    
    // CORS headers para desarrollo
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Leer y servir el archivo
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Archivo no encontrado');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

// Almacenar sesiones activas por clave de sesión
const gameSessions = new Map(); // sessionKey -> { host, client, sessionData }
const playerConnections = new Map(); // ws -> { playerId, sessionKey, isHost, playerIP }

// Función para obtener IP del cliente
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

// Enviar mensaje a un cliente específico
function sendMessage(ws, type, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, data }));
    }
}

// Enviar mensaje a todos los jugadores de una sesión
function broadcastToSession(sessionKey, type, data, excludeWs = null) {
    const session = gameSessions.get(sessionKey);
    if (!session) return;
    
    [session.host, session.client].forEach(ws => {
        if (ws && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            sendMessage(ws, type, data);
        }
    });
}

// Validar clave de sesión
function validateSessionKey(sessionKey) {
    return sessionKey && sessionKey.length >= 4;
}

// Manejar conexiones WebSocket
wss.on('connection', (ws, req) => {
    const clientIP = getClientIP(req);
    console.log(`Nueva conexión WebSocket desde ${clientIP}`);
    
    ws.on('message', (message) => {
        try {
            const { type, data } = JSON.parse(message);
            console.log(`Mensaje recibido: ${type}`, data);
            
            switch (type) {
                case 'startAsHost':
                    handleStartAsHost(ws, data, clientIP);
                    break;
                    
                case 'connectToHost':
                    handleConnectToHost(ws, data, clientIP);
                    break;
                    
                case 'gameSync':
                    handleGameSync(ws, data);
                    break;
                    
                case 'playerInput':
                    handlePlayerInput(ws, data);
                    break;
                    
                case 'ping':
                    handlePing(ws, data);
                    break;
                    
                case 'disconnect':
                    handlePlayerDisconnect(ws);
                    break;
                    
                default:
                    console.log(`Tipo de mensaje no reconocido: ${type}`);
            }
        } catch (error) {
            console.error('Error procesando mensaje:', error);
            sendMessage(ws, 'error', { message: 'Error procesando mensaje' });
        }
    });
    
    ws.on('close', () => {
        console.log(`Conexión WebSocket cerrada desde ${clientIP}`);
        handlePlayerDisconnect(ws);
    });
    
    ws.on('error', (error) => {
        console.error('Error WebSocket:', error);
        handlePlayerDisconnect(ws);
    });
});

// Manejar inicio como host
function handleStartAsHost(ws, data, clientIP) {
    const { sessionKey, playerName } = data;
    
    if (!validateSessionKey(sessionKey)) {
        sendMessage(ws, 'error', { message: 'Clave de sesión inválida' });
        return;
    }
    
    // Verificar si ya existe una sesión con esta clave
    if (gameSessions.has(sessionKey)) {
        sendMessage(ws, 'error', { message: 'Ya existe una sesión con esta clave' });
        return;
    }
    
    // Crear nueva sesión
    gameSessions.set(sessionKey, {
        host: ws,
        client: null,
        hostName: playerName,
        clientName: null,
        hostIP: clientIP,
        sessionData: {
            sessionKey: sessionKey,
            created: Date.now(),
            gameState: null
        }
    });
    
    // Registrar conexión del jugador
    playerConnections.set(ws, {
        playerId: playerName,
        sessionKey: sessionKey,
        isHost: true,
        playerIP: clientIP
    });
    
    console.log(`Host iniciado: ${playerName} en sesión ${sessionKey} desde ${clientIP}`);
    
    sendMessage(ws, 'hostStarted', {
        sessionKey: sessionKey,
        playerName: playerName,
        hostIP: clientIP,
        status: 'waiting_for_player'
    });
}

// Manejar conexión a host
function handleConnectToHost(ws, data, clientIP) {
    const { sessionKey, playerName, hostIP } = data;
    
    if (!validateSessionKey(sessionKey)) {
        sendMessage(ws, 'error', { message: 'Clave de sesión inválida' });
        return;
    }
    
    const session = gameSessions.get(sessionKey);
    
    if (!session) {
        sendMessage(ws, 'error', { message: 'Sesión no encontrada' });
        return;
    }
    
    if (session.client) {
        sendMessage(ws, 'error', { message: 'La sesión ya está llena' });
        return;
    }
    
    // Verificar IP del host si se especificó (opcional para validación adicional)
    if (hostIP && session.hostIP !== hostIP) {
        console.log(`Advertencia: IP del host especificada (${hostIP}) no coincide con la real (${session.hostIP})`);
        // No bloqueamos la conexión, solo advertimos
    }
    
    // Agregar cliente a la sesión
    session.client = ws;
    session.clientName = playerName;
    
    // Registrar conexión del jugador
    playerConnections.set(ws, {
        playerId: playerName,
        sessionKey: sessionKey,
        isHost: false,
        playerIP: clientIP
    });
    
    console.log(`Cliente conectado: ${playerName} a sesión ${sessionKey} desde ${clientIP}`);
    
    // Notificar al cliente que se conectó
    sendMessage(ws, 'connectedToHost', {
        sessionKey: sessionKey,
        playerName: playerName,
        hostName: session.hostName,
        status: 'connected'
    });
    
    // Notificar al host que alguien se conectó
    sendMessage(session.host, 'playerConnected', {
        playerName: playerName,
        playerCount: 2,
        status: 'ready_to_start'
    });
    
    // Enviar confirmación a ambos jugadores de que pueden empezar
    broadcastToSession(sessionKey, 'sessionReady', {
        hostName: session.hostName,
        clientName: playerName,
        playerCount: 2
    });
}

// Manejar sincronización del juego
function handleGameSync(ws, data) {
    const playerInfo = playerConnections.get(ws);
    if (!playerInfo) return;
    
    const session = gameSessions.get(playerInfo.sessionKey);
    if (!session) return;
    
    // Actualizar datos del juego en la sesión
    session.sessionData.gameState = data;
    session.sessionData.lastUpdate = Date.now();
    
    // Enviar sincronización al otro jugador
    const otherWs = playerInfo.isHost ? session.client : session.host;
    if (otherWs) {
        sendMessage(otherWs, 'gameSync', {
            ...data,
            from: playerInfo.playerId,
            timestamp: Date.now()
        });
    }
}

// Manejar entrada de jugador
function handlePlayerInput(ws, data) {
    const playerInfo = playerConnections.get(ws);
    if (!playerInfo) return;
    
    const session = gameSessions.get(playerInfo.sessionKey);
    if (!session) return;
    
    // Enviar entrada al otro jugador
    const otherWs = playerInfo.isHost ? session.client : session.host;
    if (otherWs) {
        sendMessage(otherWs, 'playerInput', {
            ...data,
            from: playerInfo.playerId,
            timestamp: Date.now()
        });
    }
}

// Manejar ping para mantener conexión
function handlePing(ws, data) {
    const playerInfo = playerConnections.get(ws);
    if (!playerInfo) return;
    
    // Responder con pong
    sendMessage(ws, 'pong', {
        timestamp: Date.now(),
        originalTimestamp: data.timestamp
    });
    
    // Reenviar ping al otro jugador para sincronización
    const session = gameSessions.get(playerInfo.sessionKey);
    if (session) {
        const otherWs = playerInfo.isHost ? session.client : session.host;
        if (otherWs) {
            sendMessage(otherWs, 'ping', {
                from: playerInfo.playerId,
                timestamp: Date.now()
            });
        }
    }
}

// Manejar desconexión de jugador
function handlePlayerDisconnect(ws) {
    const playerInfo = playerConnections.get(ws);
    if (!playerInfo) return;
    
    const session = gameSessions.get(playerInfo.sessionKey);
    if (session) {
        // Notificar al otro jugador
        const otherWs = playerInfo.isHost ? session.client : session.host;
        if (otherWs) {
            sendMessage(otherWs, 'playerDisconnected', {
                playerName: playerInfo.playerId,
                reason: 'connection_lost'
            });
        }
        
        // Si se desconecta el host, cerrar la sesión
        if (playerInfo.isHost) {
            if (session.client) {
                sendMessage(session.client, 'sessionClosed', { 
                    reason: 'Host desconectado' 
                });
            }
            gameSessions.delete(playerInfo.sessionKey);
            console.log(`Sesión cerrada: ${playerInfo.sessionKey}`);
        } else {
            // Si se desconecta el cliente, mantener la sesión pero actualizar estado
            session.client = null;
            session.clientName = null;
            if (session.host) {
                sendMessage(session.host, 'playerDisconnected', {
                    playerName: playerInfo.playerId,
                    playerCount: 1,
                    status: 'waiting_for_player'
                });
            }
        }
    }
    
    playerConnections.delete(ws);
    console.log(`Jugador desconectado: ${playerInfo.playerId} de sesión ${playerInfo.sessionKey}`);
}

// Limpiar sesiones inactivas periódicamente
setInterval(() => {
    const now = Date.now();
    const maxInactiveTime = 30 * 60 * 1000; // 30 minutos
    
    for (const [sessionKey, session] of gameSessions.entries()) {
        const lastActivity = session.sessionData.lastUpdate || session.sessionData.created;
        
        if (now - lastActivity > maxInactiveTime) {
            // Notificar a jugadores conectados y cerrar sesión
            [session.host, session.client].forEach(ws => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    sendMessage(ws, 'sessionClosed', { reason: 'Inactividad' });
                    ws.close();
                }
            });
            
            gameSessions.delete(sessionKey);
            console.log(`Sesión eliminada por inactividad: ${sessionKey}`);
        }
    }
}, 5 * 60 * 1000); // Revisar cada 5 minutos

// Iniciar servidor
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Servidor WebSocket iniciado en puerto ${PORT}`);
    console.log(`Accede a tu juego en: http://localhost:${PORT}`);
    console.log(`Sesiones activas: ${gameSessions.size}`);
});

// Estadísticas del servidor
setInterval(() => {
    console.log(`Estadísticas - Sesiones: ${gameSessions.size}, Conexiones: ${playerConnections.size}`);
}, 60000); // Cada minuto

// Manejar cierre del servidor
process.on('SIGINT', () => {
    console.log('Cerrando servidor...');
    
    // Notificar a todos los clientes
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            sendMessage(ws, 'serverShutdown', { message: 'Servidor cerrando' });
            ws.close();
        }
    });
    
    server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
    });
});

// Endpoint de estado para monitoreo
server.on('request', (req, res) => {
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'active',
            sessions: gameSessions.size,
            connections: playerConnections.size,
            uptime: process.uptime()
        }));
        return;
    }
});