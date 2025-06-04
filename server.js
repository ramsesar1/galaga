const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración del nodo actual
const NODE_CONFIG = {
    id: process.env.NODE_ID || Math.random().toString(36).substr(2, 9),
    ip: process.env.NODE_IP || 'localhost',
    port: PORT,
    isPrimary: process.env.IS_PRIMARY === 'true' || false
};

// Lista de nodos conocidos (IPs de la VPN)
const KNOWN_NODES = [
    '26.98.46.140:3000',
    '25.46.132.85:3000', 
    '25.2.184.111:3000',
    '25.2.230.25:3000'
    // Agregar más IPs de nodos según sea necesario
].filter(node => node !== `${NODE_CONFIG.ip}:${NODE_CONFIG.port}`);

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '1234', 
    database: 'galaga' 
};

let dbConnection = null;
let activeNodes = new Set();
let isPrimaryNode = NODE_CONFIG.isPrimary;
let lastHeartbeat = Date.now();

// Sistema de heartbeat y detección de nodos
setInterval(checkNodesHealth, 5000);
setInterval(sendHeartbeat, 3000);
setInterval(syncWithNodes, 10000);

async function connectToDatabase() {
    try {
        dbConnection = await mysql.createConnection(dbConfig);
        console.log('Conectado a la base de datos MySQL');
        
        await dbConnection.execute(`
            CREATE TABLE IF NOT EXISTS Jugador1 (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nivel INT NOT NULL,
                puntuacion INT NOT NULL,
                tiempo FLOAT NOT NULL
            )
        `);
        await dbConnection.execute(`
            CREATE TABLE IF NOT EXISTS Jugadores2 (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nivel INT NOT NULL,
                puntuacion INT NOT NULL,
                tiempo FLOAT NOT NULL
            )
        `);
        
        // Tabla de sincronización
        await dbConnection.execute(`
            CREATE TABLE IF NOT EXISTS sync_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                table_name VARCHAR(50) NOT NULL,
                record_id INT NOT NULL,
                action VARCHAR(10) NOT NULL,
                data JSON,
                node_id VARCHAR(50) NOT NULL,
                synced BOOLEAN DEFAULT FALSE
            )
        `);
        
        return true;
    } catch (error) {
        console.error('Error conectando a la base de datos:', error);
        dbConnection = null;
        return false;
    }
}

async function checkConnection() {
    if (!dbConnection) return false;
    
    try {
        await dbConnection.ping();
        return true;
    } catch (error) {
        console.error('Conexión perdida:', error);
        dbConnection = null;
        await connectToDatabase();
        return dbConnection !== null;
    }
}

async function checkNodesHealth() {
    const currentNodes = new Set();
    
    for (const nodeAddress of KNOWN_NODES) {
        try {
            const response = await axios.get(`http://${nodeAddress}/api/ping`, {
                timeout: 2000
            });
            
            if (response.data) {
                currentNodes.add(nodeAddress);
            }
        } catch (error) {
            // Nodo no disponible
        }
    }
    
    // Detectar cambios en los nodos activos
    const newNodes = [...currentNodes].filter(node => !activeNodes.has(node));
    const lostNodes = [...activeNodes].filter(node => !currentNodes.has(node));
    
    if (newNodes.length > 0) {
        console.log('Nuevos nodos detectados:', newNodes);
    }
    
    if (lostNodes.length > 0) {
        console.log('Nodos perdidos:', lostNodes);
        
        // Si perdemos el nodo primario, elegir nuevo primario
        if (lostNodes.some(node => node.includes('primary'))) {
            await electNewPrimary();
        }
    }
    
    activeNodes = currentNodes;
}

async function electNewPrimary() {
    // Algoritmo simple: el nodo con menor IP se convierte en primario
    const allNodes = [NODE_CONFIG.ip, ...Array.from(activeNodes).map(node => node.split(':')[0])];
    allNodes.sort();
    
    const shouldBePrimary = allNodes[0] === NODE_CONFIG.ip;
    
    if (shouldBePrimary && !isPrimaryNode) {
        isPrimaryNode = true;
        console.log('🔥 Este nodo se ha convertido en PRIMARIO');
    } else if (!shouldBePrimary && isPrimaryNode) {
        isPrimaryNode = false;
        console.log('📡 Este nodo ya no es primario');
    }
}

async function sendHeartbeat() {
    const heartbeatData = {
        nodeId: NODE_CONFIG.id,
        ip: NODE_CONFIG.ip,
        port: NODE_CONFIG.port,
        isPrimary: isPrimaryNode,
        timestamp: Date.now()
    };
    
    for (const nodeAddress of activeNodes) {
        try {
            await axios.post(`http://${nodeAddress}/api/heartbeat`, heartbeatData, {
                timeout: 1000
            });
        } catch (error) {
            // Error de heartbeat - el nodo podría estar caído
        }
    }
}

async function syncWithNodes() {
    if (!await checkConnection()) return;
    
    try {
        // Obtener registros no sincronizados
        const [unsyncedRecords] = await dbConnection.execute(
            'SELECT * FROM sync_log WHERE synced = FALSE AND node_id = ?',
            [NODE_CONFIG.id]
        );
        
        // Enviar a otros nodos
        for (const record of unsyncedRecords) {
            for (const nodeAddress of activeNodes) {
                try {
                    await axios.post(`http://${nodeAddress}/api/sync-data`, {
                        syncRecord: record
                    }, { timeout: 3000 });
                } catch (error) {
                    console.log(`Error sincronizando con ${nodeAddress}:`, error.message);
                }
            }
            
            // Marcar como sincronizado
            await dbConnection.execute(
                'UPDATE sync_log SET synced = TRUE WHERE id = ?',
                [record.id]
            );
        }
    } catch (error) {
        console.error('Error en sincronización:', error);
    }
}

async function logSyncRecord(tableName, recordId, action, data) {
    if (!await checkConnection()) return;
    
    try {
        await dbConnection.execute(
            'INSERT INTO sync_log (table_name, record_id, action, data, node_id) VALUES (?, ?, ?, ?, ?)',
            [tableName, recordId, action, JSON.stringify(data), NODE_CONFIG.id]
        );
    } catch (error) {
        console.error('Error logging sync record:', error);
    }
}

// API Endpoints
app.get('/api/ping', (req, res) => {
    res.json({ 
        message: 'Servidor funcionando', 
        timestamp: new Date().toISOString(),
        clientIP: req.ip || req.connection.remoteAddress,
        nodeId: NODE_CONFIG.id,
        isPrimary: isPrimaryNode,
        activeNodes: Array.from(activeNodes)
    });
});

app.post('/api/heartbeat', (req, res) => {
    const { nodeId, ip, port, isPrimary, timestamp } = req.body;
    lastHeartbeat = Date.now();
    
    // Actualizar información del nodo
    const nodeAddress = `${ip}:${port}`;
    activeNodes.add(nodeAddress);
    
    res.json({ 
        success: true, 
        nodeId: NODE_CONFIG.id,
        isPrimary: isPrimaryNode 
    });
});

app.post('/api/sync-data', async (req, res) => {
    const { syncRecord } = req.body;
    
    if (!await checkConnection()) {
        return res.json({ success: false, message: 'Base de datos no disponible' });
    }
    
    try {
        const { table_name, action, data } = syncRecord;
        const recordData = JSON.parse(data);
        
        if (action === 'INSERT') {
            if (table_name === 'Jugador1' || table_name === 'Jugadores2') {
                // Verificar si el registro ya existe para evitar duplicados
                const [existing] = await dbConnection.execute(
                    `SELECT id FROM ${table_name} WHERE nivel = ? AND puntuacion = ? AND tiempo = ?`,
                    [recordData.nivel, recordData.puntuacion, recordData.tiempo]
                );
                
                if (existing.length === 0) {
                    await dbConnection.execute(
                        `INSERT INTO ${table_name} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
                        [recordData.nivel, recordData.puntuacion, recordData.tiempo]
                    );
                    console.log(`Sincronizado: ${table_name} desde nodo ${syncRecord.node_id}`);
                }
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error sincronizando datos:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/guardar-puntuacion', async (req, res) => {
    const { nivel, puntuacion, tiempo, modo } = req.body;
    
    console.log(`Nueva puntuación recibida de ${req.ip}: Nivel ${nivel}, Puntos ${puntuacion}`);
    
    if (!await checkConnection()) {
        return res.json({ 
            success: false, 
            message: 'Base de datos no disponible' 
        });
    }
    
    try {
        const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
        
        const [result] = await dbConnection.execute(
            `INSERT INTO ${tabla} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
            [nivel, puntuacion, tiempo]
        );
        
        // Registrar para sincronización
        await logSyncRecord(tabla, result.insertId, 'INSERT', {
            nivel, puntuacion, tiempo
        });
        
        res.json({ success: true, message: 'Puntuación guardada' });
    } catch (error) {
        console.error('Error guardando puntuación:', error);
        res.json({ success: false, message: 'Error guardando puntuación' });
    }
});

app.get('/api/mejores-puntuaciones', async (req, res) => {
    const modo = req.query.modo || 'single';
    
    console.log(`Solicitud de puntuaciones de ${req.ip}: Modo ${modo}`);
    
    if (!await checkConnection()) {
        return res.json({ 
            success: false, 
            data: [],
            message: 'Base de datos no disponible' 
        });
    }
    
    try {
        const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
        const [rows] = await dbConnection.execute(
            `SELECT nivel, puntuacion, tiempo FROM ${tabla} ORDER BY puntuacion DESC LIMIT 10`
        );
        
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error obteniendo puntuaciones:', error);
        res.json({ success: false, data: [], message: 'Error obteniendo datos' });
    }
});

app.get('/api/db-status', async (req, res) => {
    const isConnected = await checkConnection();
    res.json({ 
        connected: isConnected,
        nodeId: NODE_CONFIG.id,
        isPrimary: isPrimaryNode,
        activeNodes: Array.from(activeNodes),
        nodesCount: activeNodes.size
    });
});

app.get('/api/cluster-status', (req, res) => {
    res.json({
        nodeId: NODE_CONFIG.id,
        isPrimary: isPrimaryNode,
        activeNodes: Array.from(activeNodes),
        totalNodes: activeNodes.size + 1, // +1 para incluir este nodo
        uptime: process.uptime()
    });
});

function getLocalIPs() {
    const interfaces = require('os').networkInterfaces();
    const addresses = [];
    
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                addresses.push(interface.address);
            }
        }
    }
    
    return addresses;
}

async function startServer() {
    await connectToDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Nodo ${NODE_CONFIG.id} corriendo en puerto ${PORT}`);
        console.log(`📡 Tipo: ${isPrimaryNode ? 'PRIMARIO' : 'SECUNDARIO'}`);
        console.log('🌐 IPs disponibles para conexiones remotas:');
        
        const localIPs = getLocalIPs();
        localIPs.forEach(ip => {
            console.log(`  http://${ip}:${PORT}`);
        });
        
        console.log('\n🔗 Nodos conocidos:');
        KNOWN_NODES.forEach(node => {
            console.log(`  http://${node}`);
        });
        
        console.log('\n✅ Sistema de replicación iniciado');
    });
    
    // Iniciar detección de nodos después de un breve retraso
    setTimeout(() => {
        checkNodesHealth();
    }, 2000);
}

startServer();