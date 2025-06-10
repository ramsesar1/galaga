const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { networkInterfaces } = require('os');
const EventEmitter = require('events');

const app = express();
const PORT = process.env.PORT || 3000;

// Event emitter para sincronización en tiempo real
const syncEmitter = new EventEmitter();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración unificada de red
const NETWORK_CONFIG = {
    nodes: ['25.2.184.111:3000', '25.46.132.85:3000', '25.2.129.231:3000','25.2.230.25:3000','25.53.168.17:3000','25.56.66.184:3000','25.0.172.108:3000','100.115.98.60:3000','100.66.170.97:3000'], 
    get selfAddress() {
        const localIP = this.getLocalIP();
        return `${localIP}:${PORT}`;
    },
    get otherNodes() {
        return this.nodes.filter(node => node !== this.selfAddress);
    },
    getLocalIP() {
        const interfaces = networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('25.')) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }
};

const NODE_STATE = {
    id: Math.random().toString(36).substr(2, 9),
    isPrimary: false,
    activeNodes: new Set(),
    dbConnection: null,
    lastSyncTime: Date.now(),
    connectedClients: new Set() // Para trackear clientes conectados
};

const dbConfig = { host: 'localhost', user: 'root', password: 'password', database: 'galaga' };

// Conexión a base de datos con auto-reconexión
async function ensureDBConnection() {
    if (NODE_STATE.dbConnection) {
        try {
            await NODE_STATE.dbConnection.ping();
            return NODE_STATE.dbConnection;
        } catch (error) {
            NODE_STATE.dbConnection = null;
        }
    }
    
    try {
        NODE_STATE.dbConnection = await mysql.createConnection(dbConfig);
        
        // Crear tablas si no existen
        await Promise.all([
            NODE_STATE.dbConnection.execute(`CREATE TABLE IF NOT EXISTS Jugador1 (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                nivel INT NOT NULL, 
                puntuacion INT NOT NULL, 
                tiempo FLOAT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`),
            NODE_STATE.dbConnection.execute(`CREATE TABLE IF NOT EXISTS Jugadores2 (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                nivel INT NOT NULL, 
                puntuacion INT NOT NULL, 
                tiempo FLOAT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`),
            NODE_STATE.dbConnection.execute(`CREATE TABLE IF NOT EXISTS sync_log (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                table_name VARCHAR(50) NOT NULL, 
                record_id INT NOT NULL,
                action VARCHAR(10) NOT NULL, 
                data JSON, 
                node_id VARCHAR(50) NOT NULL, 
                synced BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`),
            // Nueva tabla para trackear cambios en tiempo real
            NODE_STATE.dbConnection.execute(`CREATE TABLE IF NOT EXISTS change_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                table_name VARCHAR(50) NOT NULL,
                record_id INT NOT NULL,
                action VARCHAR(10) NOT NULL,
                old_data JSON,
                new_data JSON,
                timestamp BIGINT NOT NULL,
                node_id VARCHAR(50) NOT NULL,
                INDEX idx_timestamp (timestamp),
                INDEX idx_table (table_name)
            )`)
        ]);
        
        console.log('✅ Conectado a MySQL');
        return NODE_STATE.dbConnection;
    } catch (error) {
        console.error('❌ Error MySQL:', error.message);
        return null;
    }
}

// Sistema de red simplificado
async function discoverNodes() {
    const alive = new Set();
    
    await Promise.allSettled(NETWORK_CONFIG.otherNodes.map(async (node) => {
        try {
            const response = await axios.get(`http://${node}/api/ping`, { timeout: 2000 });
            if (response.data) {
                alive.add(node);
                if (response.data.isPrimary) NODE_STATE.isPrimary = false;
            }
        } catch (error) {
            // Nodo no disponible
        }
    }));
    
    // Elegir primario: nodo con menor IP
    if (alive.size === 0 || NETWORK_CONFIG.selfAddress < Math.min(...alive)) {
        NODE_STATE.isPrimary = true;
    }
    
    NODE_STATE.activeNodes = alive;
    console.log(`📡 Nodos activos: ${alive.size}, Soy primario: ${NODE_STATE.isPrimary}`);
}

// NUEVA FUNCIÓN: Monitorear cambios en tiempo real usando polling inteligente
async function startChangeMonitoring() {
    console.log('🔍 Iniciando monitoreo de cambios en tiempo real...');
    
    setInterval(async () => {
        await checkForChanges();
    }, 2000); // Verificar cada 2 segundos
}

// NUEVA FUNCIÓN: Verificar cambios desde la última sincronización
async function checkForChanges() {
    const db = await ensureDBConnection();
    if (!db || NODE_STATE.activeNodes.size === 0) return;
    
    try {
        // Obtener cambios desde la última verificación
        const [changes] = await db.execute(`
            SELECT 'Jugador1' as table_name, id, nivel, puntuacion, tiempo, 
                   UNIX_TIMESTAMP(modified_at) * 1000 as timestamp
            FROM Jugador1 
            WHERE UNIX_TIMESTAMP(modified_at) * 1000 > ?
            UNION ALL
            SELECT 'Jugadores2' as table_name, id, nivel, puntuacion, tiempo,
                   UNIX_TIMESTAMP(modified_at) * 1000 as timestamp
            FROM Jugadores2 
            WHERE UNIX_TIMESTAMP(modified_at) * 1000 > ?
            ORDER BY timestamp DESC
        `, [NODE_STATE.lastSyncTime, NODE_STATE.lastSyncTime]);
        
        if (changes.length > 0) {
            console.log(`🔄 Detectados ${changes.length} cambios nuevos`);
            
            // Sincronizar cambios con otros nodos
            for (const change of changes) {
                await propagateChange(change);
            }
            
            // Actualizar timestamp de última sincronización
            NODE_STATE.lastSyncTime = Date.now();
        }
        
    } catch (error) {
        console.error('❌ Error verificando cambios:', error.message);
    }
}

// NUEVA FUNCIÓN: Propagar cambio a otros nodos
async function propagateChange(change) {
    const syncData = {
        action: 'INSERT', // Simplificado para este caso
        table_name: change.table_name,
        data: {
            nivel: change.nivel,
            puntuacion: change.puntuacion,
            tiempo: change.tiempo
        },
        timestamp: change.timestamp,
        node_id: NODE_STATE.id
    };
    
    // Enviar a todos los nodos activos
    const syncPromises = Array.from(NODE_STATE.activeNodes).map(node =>
        axios.post(`http://${node}/api/real-time-sync`, { change: syncData }, { timeout: 3000 })
            .then(() => console.log(`✅ Cambio sincronizado con ${node}`))
            .catch(error => console.log(`❌ Error sincronizando con ${node}:`, error.message))
    );
    
    await Promise.allSettled(syncPromises);
    
    // Emitir evento para clientes conectados
    syncEmitter.emit('dataChange', syncData);
}

// Sincronización optimizada (mantener la existente)
async function syncData() {
    const db = await ensureDBConnection();
    if (!db || NODE_STATE.activeNodes.size === 0) return;
    
    try {
        const [records] = await db.execute(
            'SELECT * FROM sync_log WHERE synced = FALSE AND node_id = ? LIMIT 10',
            [NODE_STATE.id]
        );
        
        for (const record of records) {
            const syncPromises = Array.from(NODE_STATE.activeNodes).map(node =>
                axios.post(`http://${node}/api/sync-data`, { syncRecord: record }, { timeout: 3000 })
                    .catch(() => {}) // Ignorar errores individuales
            );
            
            await Promise.allSettled(syncPromises);
            await db.execute('UPDATE sync_log SET synced = TRUE WHERE id = ?', [record.id]);
        }
    } catch (error) {
        console.error('❌ Error sync:', error.message);
    }
}

async function logSync(tableName, recordId, action, data) {
    const db = await ensureDBConnection();
    if (!db) return;
    
    try {
        await db.execute(
            'INSERT INTO sync_log (table_name, record_id, action, data, node_id) VALUES (?, ?, ?, ?, ?)',
            [tableName, recordId, action, JSON.stringify(data), NODE_STATE.id]
        );
        
        // NUEVO: También log en change_log para tiempo real
        await db.execute(
            'INSERT INTO change_log (table_name, record_id, action, new_data, timestamp, node_id) VALUES (?, ?, ?, ?, ?, ?)',
            [tableName, recordId, action, JSON.stringify(data), Date.now(), NODE_STATE.id]
        );
        
    } catch (error) {
        console.error('❌ Error log sync:', error.message);
    }
}

// API Endpoints (mantener los existentes)
app.get('/api/ping', (req, res) => {
    res.json({
        message: 'OK',
        nodeId: NODE_STATE.id,
        isPrimary: NODE_STATE.isPrimary,
        activeNodes: Array.from(NODE_STATE.activeNodes),
        timestamp: Date.now()
    });
});

// NUEVO ENDPOINT: Sincronización en tiempo real
app.post('/api/real-time-sync', async (req, res) => {
    const { change } = req.body;
    const db = await ensureDBConnection();
    
    if (!db) return res.json({ success: false, message: 'DB no disponible' });
    
    try {
        const { table_name, action, data, timestamp, node_id } = change;
        
        // Verificar si ya tenemos este cambio (evitar duplicados)
        const [existing] = await db.execute(
            'SELECT id FROM change_log WHERE table_name = ? AND timestamp = ? AND node_id = ?',
            [table_name, timestamp, node_id]
        );
        
        if (existing.length > 0) {
            return res.json({ success: true, message: 'Cambio ya existe' });
        }
        
        // Insertar el registro si no existe
        if (action === 'INSERT' && (table_name === 'Jugador1' || table_name === 'Jugadores2')) {
            const [duplicateCheck] = await db.execute(
                `SELECT id FROM ${table_name} WHERE nivel = ? AND puntuacion = ? AND tiempo = ?`,
                [data.nivel, data.puntuacion, data.tiempo]
            );
            
            if (duplicateCheck.length === 0) {
                await db.execute(
                    `INSERT INTO ${table_name} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
                    [data.nivel, data.puntuacion, data.tiempo]
                );
                
                // Registrar el cambio recibido
                await db.execute(
                    'INSERT INTO change_log (table_name, record_id, action, new_data, timestamp, node_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [table_name, 0, action, JSON.stringify(data), timestamp, node_id]
                );
                
                console.log(`📥 Cambio recibido de ${node_id}: ${table_name}`);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error procesando cambio en tiempo real:', error.message);
        res.json({ success: false, message: error.message });
    }
});

// NUEVO ENDPOINT: WebSocket-like para clientes que quieren updates en tiempo real
app.get('/api/subscribe-changes', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    const clientId = Math.random().toString(36).substr(2, 9);
    NODE_STATE.connectedClients.add(clientId);
    
    // Enviar ping inicial
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
    
    // Listener para cambios
    const changeListener = (changeData) => {
        res.write(`data: ${JSON.stringify({ type: 'dataChange', data: changeData })}\n\n`);
    };
    
    syncEmitter.on('dataChange', changeListener);
    
    // Cleanup cuando se desconecta el cliente
    req.on('close', () => {
        NODE_STATE.connectedClients.delete(clientId);
        syncEmitter.removeListener('dataChange', changeListener);
        console.log(`📤 Cliente ${clientId} desconectado`);
    });
    
    console.log(`📥 Cliente ${clientId} suscrito a cambios en tiempo real`);
});

// Mantener endpoints existentes...
app.post('/api/sync-data', async (req, res) => {
    const { syncRecord } = req.body;
    const db = await ensureDBConnection();
    
    if (!db) return res.json({ success: false, message: 'DB no disponible' });
    
    try {
        const { table_name, action, data } = syncRecord;
        const recordData = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (action === 'INSERT' && (table_name === 'Jugador1' || table_name === 'Jugadores2')) {
            const [existing] = await db.execute(
                `SELECT id FROM ${table_name} WHERE nivel = ? AND puntuacion = ? AND tiempo = ?`,
                [recordData.nivel, recordData.puntuacion, recordData.tiempo]
            );
            
            if (existing.length === 0) {
                await db.execute(
                    `INSERT INTO ${table_name} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
                    [recordData.nivel, recordData.puntuacion, recordData.tiempo]
                );
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/sync-from-remote', async (req, res) => {
    const { data } = req.body;
    const db = await ensureDBConnection();
    
    if (!db) return res.json({ success: false, message: 'DB no disponible' });
    
    try {
        let syncedCount = 0;
        
        // Sincronizar tabla Jugador1
        if (data.Jugador1 && Array.isArray(data.Jugador1)) {
            for (const record of data.Jugador1) {
                const [existing] = await db.execute(
                    'SELECT id FROM Jugador1 WHERE nivel = ? AND puntuacion = ? AND tiempo = ?',
                    [record.nivel, record.puntuacion, record.tiempo]
                );
                
                if (existing.length === 0) {
                    await db.execute(
                        'INSERT INTO Jugador1 (nivel, puntuacion, tiempo) VALUES (?, ?, ?)',
                        [record.nivel, record.puntuacion, record.tiempo]
                    );
                    syncedCount++;
                }
            }
        }
        
        // Sincronizar tabla Jugadores2
        if (data.Jugadores2 && Array.isArray(data.Jugadores2)) {
            for (const record of data.Jugadores2) {
                const [existing] = await db.execute(
                    'SELECT id FROM Jugadores2 WHERE nivel = ? AND puntuacion = ? AND tiempo = ?',
                    [record.nivel, record.puntuacion, record.tiempo]
                );
                
                if (existing.length === 0) {
                    await db.execute(
                        'INSERT INTO Jugadores2 (nivel, puntuacion, tiempo) VALUES (?, ?, ?)',
                        [record.nivel, record.puntuacion, record.tiempo]
                    );
                    syncedCount++;
                }
            }
        }
        
        console.log(`✅ Sincronizados ${syncedCount} registros desde cliente remoto`);
        res.json({ success: true, message: `${syncedCount} registros sincronizados`, count: syncedCount });
        
    } catch (error) {
        console.error('❌ Error sincronizando desde remoto:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/get-all-data', async (req, res) => {
    const db = await ensureDBConnection();
    
    if (!db) return res.json({ success: false, message: 'DB no disponible' });
    
    try {
        const [jugador1] = await db.execute('SELECT * FROM Jugador1');
        const [jugadores2] = await db.execute('SELECT * FROM Jugadores2');
        
        res.json({ 
            success: true, 
            data: { 
                Jugador1: jugador1, 
                Jugadores2: jugadores2 
            } 
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/guardar-puntuacion', async (req, res) => {
    const { nivel, puntuacion, tiempo, modo } = req.body;
    const db = await ensureDBConnection();
    
    if (!db) return res.json({ success: false, message: 'DB no disponible' });
    
    try {
        const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
        const [result] = await db.execute(
            `INSERT INTO ${tabla} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
            [nivel, puntuacion, tiempo]
        );
        
        await logSync(tabla, result.insertId, 'INSERT', { nivel, puntuacion, tiempo });
        
        // NUEVO: Trigger inmediato de sincronización en tiempo real
        const changeData = {
            table_name: tabla,
            id: result.insertId,
            nivel,
            puntuacion,
            tiempo,
            timestamp: Date.now()
        };
        
        // Propagar inmediatamente
        await propagateChange(changeData);
        
        res.json({ success: true, message: 'Puntuación guardada' });
    } catch (error) {
        res.json({ success: false, message: 'Error guardando puntuación' });
    }
});

app.get('/api/mejores-puntuaciones', async (req, res) => {
    const modo = req.query.modo || 'single';
    const db = await ensureDBConnection();
    
    if (!db) return res.json({ success: false, data: [], message: 'DB no disponible' });
    
    try {
        const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
        const [rows] = await db.execute(
            `SELECT nivel, puntuacion, tiempo FROM ${tabla} ORDER BY puntuacion DESC LIMIT 10`
        );
        
        res.json({ success: true, data: rows });
    } catch (error) {
        res.json({ success: false, data: [], message: 'Error obteniendo datos' });
    }
});

app.get('/api/db-status', async (req, res) => {
    const db = await ensureDBConnection();
    const isConnected = db !== null;
    
    res.json({ 
        connected: isConnected,
        nodeId: NODE_STATE.id,
        isPrimary: NODE_STATE.isPrimary,
        activeNodes: Array.from(NODE_STATE.activeNodes),
        nodesCount: NODE_STATE.activeNodes.size,
        connectedClients: NODE_STATE.connectedClients.size,
        lastSyncTime: NODE_STATE.lastSyncTime
    });
});

app.get('/api/cluster-status', (req, res) => {
    res.json({
        nodeId: NODE_STATE.id,
        isPrimary: NODE_STATE.isPrimary,
        activeNodes: Array.from(NODE_STATE.activeNodes),
        totalNodes: NODE_STATE.activeNodes.size + 1,
        selfAddress: NETWORK_CONFIG.selfAddress,
        connectedClients: NODE_STATE.connectedClients.size
    });
});

// Tareas periódicas optimizadas
setInterval(discoverNodes, 5000);
setInterval(syncData, 8000);

// Inicialización
async function startServer() {
    await ensureDBConnection();
    
    // NUEVO: Iniciar monitoreo de cambios en tiempo real
    await startChangeMonitoring();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
        console.log(`📡 Dirección: ${NETWORK_CONFIG.selfAddress}`);
        console.log(`🔗 Nodos conocidos: ${NETWORK_CONFIG.nodes.join(', ')}`);
        console.log(`🔍 Monitoreo en tiempo real: ACTIVO`);
        discoverNodes();
    });
}

startServer();