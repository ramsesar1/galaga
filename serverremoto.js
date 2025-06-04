const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');

class GameClient {
    constructor(servers = ['25.46.132.85:3000', '25.2.184.111:3000', '25.2.129.231:3000','25.2.230.25:3000']) {
        this.servers = [...servers];
        this.currentIndex = 0;
        this.isConnected = false;
        this.healthInterval = null;
        this.fallbackMode = false;
        this.fallbackServer = null;
        this.localDB = null;
        this.localApp = null;
        this.localPort = 3001;
        this.dbConfig = { host: 'localhost', user: 'root', password: '1234', database: 'galaga' };
        this.nodeId = Math.random().toString(36).substr(2, 9);
        this.isLocalHost = false;
        
        // NUEVO: Variables para replicación en tiempo real
        this.realtimeRequest = null;
        this.realtimeConnected = false;
        this.pendingChanges = [];
        this.lastSyncTimestamp = Date.now();
        this.replicationInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.startHealthMonitoring();
        this.initializeLocalDB();
        this.startRealtimeReplication();
    }

    // NUEVA FUNCIÓN: Hacer peticiones HTTP sin node-fetch
    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'GameClient/1.0',
                    ...options.headers
                },
                timeout: options.timeout || 8000
            };

            const req = client.request(requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = {
                            ok: res.statusCode >= 200 && res.statusCode < 300,
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            headers: res.headers,
                            json: async () => JSON.parse(data),
                            text: async () => data
                        };
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }

            req.end();
        });
    }

    // NUEVA FUNCIÓN: Iniciar replicación en tiempo real
    async startRealtimeReplication() {
        console.log('🔄 Iniciando replicación en tiempo real...');
        
        // Intentar conectar al stream de cambios cada 10 segundos
        this.replicationInterval = setInterval(() => {
            if (this.isConnected && !this.realtimeConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.connectToRealtimeStream();
            }
        }, 10000);
        
        // Intentar conexión inicial
        setTimeout(() => this.connectToRealtimeStream(), 3000);
        
        // Procesar cambios pendientes cada 5 segundos
        setInterval(() => this.processPendingChanges(), 5000);
        
        // Reset intentos de reconexión cada minuto
        setInterval(() => {
            if (this.reconnectAttempts > 0) {
                this.reconnectAttempts = Math.max(0, this.reconnectAttempts - 1);
            }
        }, 60000);
    }

    // NUEVA FUNCIÓN: Conectar al stream de cambios en tiempo real usando HTTP requests
    async connectToRealtimeStream() {
        if (this.realtimeConnected || !this.isConnected || this.fallbackMode) return;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`⚠️ Máximo de intentos de reconexión alcanzado (${this.maxReconnectAttempts})`);
            return;
        }
        
        try {
            console.log(`🔗 Intentando conectar al stream: ${this.baseURL}/api/subscribe-changes`);
            this.reconnectAttempts++;
            
            const urlObj = new URL(`${this.baseURL}/api/subscribe-changes`);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || 80,
                path: urlObj.pathname,
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                }
            };

            this.realtimeRequest = client.request(requestOptions, (res) => {
                if (res.statusCode === 200) {
                    console.log('✅ Conectado al stream de cambios en tiempo real');
                    this.realtimeConnected = true;
                    this.reconnectAttempts = 0;
                    
                    let buffer = '';
                    
                    res.on('data', (chunk) => {
                        buffer += chunk.toString();
                        
                        // Procesar líneas completas
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // Guardar línea incompleta
                        
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.substring(6));
                                    this.handleRealtimeMessage(data);
                                } catch (error) {
                                    console.error('❌ Error parseando mensaje:', error.message);
                                }
                            }
                        }
                    });
                    
                    res.on('end', () => {
                        console.log('🔌 Stream cerrado por el servidor');
                        this.realtimeConnected = false;
                        this.realtimeRequest = null;
                        
                        // Intentar reconectar en 10 segundos
                        setTimeout(() => this.connectToRealtimeStream(), 10000);
                    });
                    
                } else {
                    console.log(`❌ Error en stream: ${res.statusCode} ${res.statusMessage}`);
                    this.realtimeConnected = false;
                }
            });

            this.realtimeRequest.on('error', (error) => {
                console.log(`❌ Error de conexión al stream: ${error.message}`);
                this.realtimeConnected = false;
                this.realtimeRequest = null;
                
                // Intentar reconectar en 15 segundos
                setTimeout(() => this.connectToRealtimeStream(), 15000);
            });

            this.realtimeRequest.on('timeout', () => {
                console.log('⏰ Timeout en conexión al stream');
                if (this.realtimeRequest) {
                    this.realtimeRequest.destroy();
                }
                this.realtimeConnected = false;
                this.realtimeRequest = null;
            });

            // Timeout de 30 segundos para la conexión inicial
            this.realtimeRequest.setTimeout(30000);
            this.realtimeRequest.end();
            
        } catch (error) {
            console.error('❌ Error conectando al stream:', error.message);
            this.realtimeConnected = false;
            this.realtimeRequest = null;
            
            // Intentar reconectar en 20 segundos
            setTimeout(() => this.connectToRealtimeStream(), 20000);
        }
    }

    // NUEVA FUNCIÓN: Manejar mensajes en tiempo real
    async handleRealtimeMessage(data) {
        switch (data.type) {
            case 'connected':
                console.log(`🔗 Cliente conectado al stream: ${data.clientId}`);
                break;
                
            case 'dataChange':
                console.log('📥 Cambio recibido en tiempo real:', {
                    tabla: data.data.table_name,
                    accion: data.data.action,
                    puntuacion: data.data.data?.puntuacion
                });
                await this.applyRealtimeChange(data.data);
                break;
                
            case 'ping':
                // Mantener conexión activa
                break;
                
            default:
                console.log('📨 Mensaje desconocido:', data.type);
        }
    }

    // NUEVA FUNCIÓN: Aplicar cambio en tiempo real a BD local
    async applyRealtimeChange(changeData) {
        if (!this.localDB) {
            this.pendingChanges.push({
                changeData,
                timestamp: Date.now(),
                retries: 0
            });
            return;
        }
        
        try {
            const { table_name, action, data, timestamp, node_id } = changeData;
            
            // Evitar aplicar nuestros propios cambios
            if (node_id === this.nodeId) {
                console.log('⚠️ Ignorando cambio propio');
                return;
            }
            
            // Solo procesar si el timestamp es más reciente
            if (timestamp <= this.lastSyncTimestamp) {
                console.log('⚠️ Cambio antiguo ignorado');
                return;
            }
            
            if (action === 'INSERT' && (table_name === 'Jugador1' || table_name === 'Jugadores2')) {
                // Verificar si ya existe para evitar duplicados
                const [existing] = await this.localDB.execute(
                    `SELECT id FROM ${table_name} WHERE nivel = ? AND puntuacion = ? AND tiempo = ?`,
                    [data.nivel, data.puntuacion, data.tiempo]
                );
                
                if (existing.length === 0) {
                    await this.localDB.execute(
                        `INSERT INTO ${table_name} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
                        [data.nivel, data.puntuacion, data.tiempo]
                    );
                    
                    // Registrar en tabla de cambios recibidos
                    await this.localDB.execute(
                        'INSERT INTO realtime_changes (table_name, action, data, timestamp, source_node) VALUES (?, ?, ?, ?, ?)',
                        [table_name, action, JSON.stringify(data), timestamp, node_id]
                    );
                    
                    console.log(`✅ Cambio aplicado: ${table_name} - Nivel ${data.nivel}, ${data.puntuacion}pts`);
                    this.lastSyncTimestamp = timestamp;
                } else {
                    console.log(`⚠️ Registro duplicado ignorado: ${table_name} - ${data.puntuacion}pts`);
                }
            }
            
        } catch (error) {
            console.error('❌ Error aplicando cambio en tiempo real:', error.message);
            
            // Agregar a cambios pendientes para procesar después
            this.pendingChanges.push({
                changeData,
                timestamp: Date.now(),
                retries: 0
            });
        }
    }

    // NUEVA FUNCIÓN: Procesar cambios pendientes
    async processPendingChanges() {
        if (this.pendingChanges.length === 0) return;
        
        console.log(`🔄 Procesando ${this.pendingChanges.length} cambios pendientes...`);
        
        const processed = [];
        
        for (const pending of this.pendingChanges) {
            try {
                await this.applyRealtimeChange(pending.changeData);
                processed.push(pending);
            } catch (error) {
                pending.retries++;
                
                // Descartar después de 3 intentos
                if (pending.retries >= 3) {
                    console.error(`❌ Descartando cambio después de 3 intentos:`, error.message);
                    processed.push(pending);
                }
            }
        }
        
        // Remover cambios procesados
        this.pendingChanges = this.pendingChanges.filter(p => !processed.includes(p));
        
        if (processed.length > 0) {
            console.log(`✅ ${processed.length} cambios pendientes procesados`);
        }
    }

    // NUEVA FUNCIÓN: Enviar cambio local a servidor inmediatamente
    async propagateLocalChange(tableName, data) {
        if (!this.isConnected || this.fallbackMode) return;
        
        try {
            const changeData = {
                action: 'INSERT',
                table_name: tableName,
                data: data,
                timestamp: Date.now(),
                node_id: this.nodeId
            };
            
            const response = await this.makeRequest(`${this.baseURL}/api/real-time-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ change: changeData }),
                timeout: 5000
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Cambio propagado en tiempo real: ${tableName}`);
            } else {
                console.log(`⚠️ Error propagando cambio: ${result.message}`);
            }
            
        } catch (error) {
            console.log(`❌ Error en propagación inmediata: ${error.message}`);
        }
    }

    // Inicializar BD local (MODIFICADA para incluir replicación)
    async initializeLocalDB() {
        try {
            this.localDB = await mysql.createConnection(this.dbConfig);
            
            // Crear tablas locales si no existen
            await Promise.all([
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS Jugador1 (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    nivel INT NOT NULL, 
                    puntuacion INT NOT NULL, 
                    tiempo FLOAT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`),
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS Jugadores2 (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    nivel INT NOT NULL, 
                    puntuacion INT NOT NULL, 
                    tiempo FLOAT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )`),
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS sync_log (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    table_name VARCHAR(50) NOT NULL, 
                    record_id INT NOT NULL,
                    action VARCHAR(10) NOT NULL, 
                    data JSON, 
                    node_id VARCHAR(50) NOT NULL, 
                    synced BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`),
                // NUEVA: Tabla para cambios en tiempo real
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS realtime_changes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    table_name VARCHAR(50) NOT NULL,
                    action VARCHAR(10) NOT NULL,
                    data JSON,
                    timestamp BIGINT NOT NULL,
                    source_node VARCHAR(50) NOT NULL,
                    applied BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_table (table_name)
                )`)
            ]);
            
            console.log('✅ BD local inicializada con soporte tiempo real');
            
            // Intentar sincronizar datos iniciales después de un momento
            setTimeout(() => this.syncInitialData(), 5000);
            
        } catch (error) {
            console.error('❌ Error BD local:', error.message);
        }
    }

    // Sincronizar datos iniciales (MEJORADA)
    async syncInitialData() {
        if (!this.isConnected || this.fallbackMode) return;
        
        try {
            console.log('🔄 Sincronizando datos iniciales...');
            
            const [jugador1, jugadores2] = await Promise.all([
                this.obtenerMejoresPuntuaciones('single'),
                this.obtenerMejoresPuntuaciones('coop')
            ]);
            
            if (!this.localDB) return;
            
            // No limpiar completamente, solo sincronizar nuevos
            let syncedCount = 0;
            
            // Insertar datos de Jugador1 que no existan
            for (const record of jugador1) {
                const [existing] = await this.localDB.execute(
                    'SELECT id FROM Jugador1 WHERE nivel = ? AND puntuacion = ? AND tiempo = ?',
                    [record.nivel, record.puntuacion, record.tiempo]
                );
                
                if (existing.length === 0) {
                    await this.localDB.execute(
                        'INSERT INTO Jugador1 (nivel, puntuacion, tiempo) VALUES (?, ?, ?)',
                        [record.nivel, record.puntuacion, record.tiempo]
                    );
                    syncedCount++;
                }
            }
            
            // Insertar datos de Jugadores2 que no existan
            for (const record of jugadores2) {
                const [existing] = await this.localDB.execute(
                    'SELECT id FROM Jugadores2 WHERE nivel = ? AND puntuacion = ? AND tiempo = ?',
                    [record.nivel, record.puntuacion, record.tiempo]
                );
                
                if (existing.length === 0) {
                    await this.localDB.execute(
                        'INSERT INTO Jugadores2 (nivel, puntuacion, tiempo) VALUES (?, ?, ?)',
                        [record.nivel, record.puntuacion, record.tiempo]
                    );
                    syncedCount++;
                }
            }
            
            if (syncedCount > 0) {
                console.log(`✅ ${syncedCount} registros nuevos sincronizados`);
            } else {
                console.log('✅ Datos locales actualizados');
            }
            
            this.lastSyncTimestamp = Date.now();
            
        } catch (error) {
            console.log('⚠️ Error sincronización inicial:', error.message);
        }
    }

    // Guardar puntuación (MODIFICADA para replicación inmediata)
    async guardarPuntuacion(nivel, puntuacion, tiempo, modo = 'single') {
        return await this.executeWithFailover(async () => {
            const response = await this.makeRequest(`${this.baseURL}/api/guardar-puntuacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nivel, puntuacion, tiempo, modo }),
                timeout: 8000
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Puntuación guardada remotamente: Nivel ${nivel}, ${puntuacion}pts`);
                
                // NUEVO: También guardar localmente para replicación inmediata
                if (this.localDB) {
                    try {
                        const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
                        
                        // Verificar duplicado local
                        const [existing] = await this.localDB.execute(
                            `SELECT id FROM ${tabla} WHERE nivel = ? AND puntuacion = ? AND tiempo = ?`,
                            [nivel, puntuacion, tiempo]
                        );
                        
                        if (existing.length === 0) {
                            await this.localDB.execute(
                                `INSERT INTO ${tabla} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
                                [nivel, puntuacion, tiempo]
                            );
                            
                            // Registrar para tracking
                            await this.localDB.execute(
                                'INSERT INTO realtime_changes (table_name, action, data, timestamp, source_node) VALUES (?, ?, ?, ?, ?)',
                                [tabla, 'INSERT', JSON.stringify({nivel, puntuacion, tiempo}), Date.now(), this.nodeId]
                            );
                            
                            console.log(`✅ Puntuación replicada localmente: ${tabla}`);
                        }
                    } catch (localError) {
                        console.log('⚠️ Error replicación local:', localError.message);
                    }
                }
                
                return true;
            } else {
                throw new Error(result.message || 'Error guardando');
            }
        });
    }

    // Manejar reconexión (MODIFICADA)
    updateConnection(healthyServers, primaryFound) {
        if (healthyServers.length === 0) {
            this.handleNoServersAvailable();
            return;
        }

        // Si había un servidor local corriendo y ahora hay servidores disponibles
        if (this.isLocalHost && healthyServers.length > 0) {
            console.log('🔄 Servidor principal disponible - Sincronizando...');
            this.syncWithMainServer();
            this.isLocalHost = false;
            this.fallbackMode = false;
        }

        // Priorizar servidor primario
        let bestServer = healthyServers.find(s => s.isPrimary) || healthyServers[0];
        
        if (bestServer.index !== this.currentIndex || !this.isConnected) {
            this.currentIndex = bestServer.index;
            this.isConnected = true;
            this.fallbackMode = false;
            console.log(`✅ Conectado a: ${this.currentServer} ${bestServer.isPrimary ? '(Primario)' : ''}`);
            
            // NUEVO: Reiniciar conexión de tiempo real cuando cambie el servidor
            this.realtimeConnected = false;
            this.reconnectAttempts = 0;
            
            if (this.realtimeRequest) {
                this.realtimeRequest.destroy();
                this.realtimeRequest = null;
            }
            
            // Conectar al stream del nuevo servidor
            setTimeout(() => this.connectToRealtimeStream(), 2000);
            
            // Sincronizar datos cuando se reconecte
            setTimeout(() => this.syncInitialData(), 3000);
        }
    }

    // Iniciar servidor local como host (MODIFICADA)
    async startLocalHost() {
        if (this.localApp || this.isLocalHost) return;
        
        try {
            this.localApp = express();
            this.localApp.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
            this.localApp.use(express.json());
            
            // Endpoints principales
            this.localApp.get('/api/ping', (req, res) => {
                res.json({
                    message: 'OK',
                    nodeId: this.nodeId,
                    isPrimary: true,
                    activeNodes: [],
                    timestamp: Date.now()
                });
            });
            
            this.localApp.post('/api/guardar-puntuacion', async (req, res) => {
                const { nivel, puntuacion, tiempo, modo } = req.body;
                
                try {
                    const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
                    await this.localDB.execute(
                        `INSERT INTO ${tabla} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
                        [nivel, puntuacion, tiempo]
                    );
                    
                    // NUEVO: Registrar para sincronización posterior
                    await this.localDB.execute(
                        'INSERT INTO realtime_changes (table_name, action, data, timestamp, source_node) VALUES (?, ?, ?, ?, ?)',
                        [tabla, 'INSERT', JSON.stringify({nivel, puntuacion, tiempo}), Date.now(), this.nodeId]
                    );
                    
                    console.log(`💾 Puntuación guardada localmente: ${tabla} - ${puntuacion}pts`);
                    res.json({ success: true, message: 'Puntuación guardada localmente' });
                } catch (error) {
                    res.json({ success: false, message: error.message });
                }
            });
            
            // NUEVO: Endpoint para datos en tiempo real mientras está en modo local
            this.localApp.get('/api/subscribe-changes', (req, res) => {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                });
                
                res.write(`data: ${JSON.stringify({ type: 'connected', clientId: 'local-fallback' })}\n\n`);
                
                // Mantener conexión activa en modo local
                const keepAlive = setInterval(() => {
                    res.write(`data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
                }, 30000);
                
                req.on('close', () => {
                    clearInterval(keepAlive);
                    console.log('📤 Cliente local desconectado del stream');
                });
                
                console.log('📥 Cliente local conectado al stream fallback');
            });
            
            // Mantener otros endpoints existentes...
            this.localApp.get('/api/mejores-puntuaciones', async (req, res) => {
                const modo = req.query.modo || 'single';
                
                try {
                    const tabla = modo === 'coop' ? 'Jugadores2' : 'Jugador1';
                    const [rows] = await this.localDB.execute(
                        `SELECT nivel, puntuacion, tiempo FROM ${tabla} ORDER BY puntuacion DESC LIMIT 10`
                    );
                    
                    res.json({ success: true, data: rows });
                } catch (error) {
                    res.json({ success: false, data: [], message: error.message });
                }
            });
            
            this.localApp.get('/api/cluster-status', (req, res) => {
                res.json({
                    nodeId: this.nodeId,
                    isPrimary: true,
                    activeNodes: [],
                    totalNodes: 1,
                    fallbackMode: true
                });
            });
            
            this.localApp.listen(this.localPort, '0.0.0.0', () => {
                console.log(`🆘 Servidor local iniciado en puerto ${this.localPort} con replicación`);
                this.isLocalHost = true;
                this.fallbackServer = `localhost:${this.localPort}`;
            });
            
        } catch (error) {
            console.error('❌ Error iniciando servidor local:', error.message);
        }
    }

    // Obtener estado (MODIFICADO)
    getStatus() {
        return {
            servidores: this.servers,
            actual: this.currentServer,
            conectado: this.isConnected,
            fallback: this.fallbackMode,
            indice: this.currentIndex,
            hostLocal: this.isLocalHost,
            puertoLocal: this.localPort,
            // NUEVO: Estado de replicación
            replicacionTiempoReal: this.realtimeConnected,
            cambiosPendientes: this.pendingChanges.length,
            ultimaSync: new Date(this.lastSyncTimestamp).toLocaleTimeString(),
            intentosReconexion: this.reconnectAttempts
        };
    }

    // Destruir (MODIFICADO para limpiar conexiones de tiempo real)
    destroy() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = null;
        }
        
        if (this.replicationInterval) {
            clearInterval(this.replicationInterval);
            this.replicationInterval = null;
        }
        
        if (this.realtimeRequest) {
            this.realtimeRequest.destroy();
            this.realtimeRequest = null;
        }
        
        if (this.localDB) {
            this.localDB.end();
        }
        
        if (this.localApp) {
            this.localApp.close?.();
        }
        
        this.realtimeConnected = false;
        console.log('🧹 Cliente destruido (incluyendo replicación tiempo real)');
    }

    // Mantener métodos existentes
    get currentServer() {
        return this.fallbackMode ? this.fallbackServer : this.servers[this.currentIndex];
    }

    get baseURL() {
        return `http://${this.currentServer}`;
    }

    startHealthMonitoring() {
        this.healthInterval = setInterval(() => this.checkHealth(), 8000);
        this.checkHealth(); 
    }

    async checkHealth() {
        const healthyServers = [];
        let primaryFound = false;

        const checks = this.servers.map(async (server, index) => {
            try {
                const response = await this.makeRequest(`http://${server}/api/cluster-status`, {
                    method: 'GET',
                    timeout: 3000
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const result = {
                        index,
                        server,
                        healthy: true,
                        isPrimary: data.isPrimary,
                        nodeId: data.nodeId,
                        activeNodes: data.activeNodes || []
                    };
                    
                    if (data.isPrimary) primaryFound = true;
                    this.discoverNodes(data.activeNodes);
                    return result
                }
            } catch (error) {
                return { index, server, healthy: false };
            }
            return { index, server, healthy: false };
        });

        const results = await Promise.allSettled(checks);
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.healthy) {
                healthyServers.push(result.value);
            }
        });

        this.updateConnection(healthyServers, primaryFound);
    }

    discoverNodes(activeNodes) {
        if (!Array.isArray(activeNodes)) return;
        
        activeNodes.forEach(node => {
            if (!this.servers.includes(node)) {
                this.servers.push(node);
                console.log(`🔍 Nuevo nodo: ${node}`);
            }
        });
    }

    async handleNoServersAvailable() {
        if (!this.fallbackMode) {
            console.log('⚠️ Sin servidores - Activando modo host local');
            this.fallbackMode = true;
            await this.startLocalHost();
        }
        this.isConnected = this.isLocalHost;
        this.realtimeConnected = false;
    }

    async executeWithFailover(operation, maxRetries = 3) {
        let lastError = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (!this.isConnected && attempt === 0) {
                    await this.checkHealth();
                }
                
                if (this.isConnected) {
                    return await operation();
                }
                
                throw new Error('Sin conexión a servidores');
                
            } catch (error) {
                lastError = error;
                console.log(`❌ Intento ${attempt + 1} falló: ${error.message}`);
                
                if (attempt < maxRetries - 1) {
                    await this.switchServer();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        throw new Error(`Operación falló después de ${maxRetries} intentos: ${lastError?.message}`);
    }

    async switchServer() {
        const originalIndex = this.currentIndex;
        
        for (let i = 0; i < this.servers.length; i++) {
            this.currentIndex = (this.currentIndex + 1) % this.servers.length;
            
            try {
                const response = await fetch(`${this.baseURL}/api/ping`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(2000)
                });
                
                if (response.ok) {
                    this.isConnected = true;
                    console.log(`🔄 Cambiado a: ${this.currentServer}`);
                    return true;
                }
            } catch (error) {
                // Continuar con el siguiente servidor
            }
        }
        
        this.currentIndex = originalIndex;
        this.isConnected = false;
        return false;
    }

    async obtenerMejoresPuntuaciones(modo = 'single') {
        return await this.executeWithFailover(async () => {
            const response = await fetch(`${this.baseURL}/api/mejores-puntuaciones?modo=${modo}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(8000)
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`📊 ${result.data.length} puntuaciones obtenidas`);
                return result.data;
            } else {
                throw new Error(result.message || 'Error obteniendo datos');
            }
        });
    }

    async syncWithMainServer() {
        if (!this.localDB || this.isLocalHost) return;
        
        try {            
            const [localJugador1] = await this.localDB.execute('SELECT * FROM Jugador1');
            const [localJugadores2] = await this.localDB.execute('SELECT * FROM Jugadores2');
            
            if (localJugador1.length > 0 || localJugadores2.length > 0) {
                const response = await fetch(`${this.baseURL}/api/sync-from-remote`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        data: { 
                            Jugador1: localJugador1, 
                            Jugadores2: localJugadores2 
                        } 
                    }),
                    signal: AbortSignal.timeout(10000)
                });
                
                const result = await response.json();
                if (result.success) {
                    console.log(`✅ ${result.count} registros sincronizados con servidor principal`);
                }
            }
            
            await this.syncInitialData();
            
        } catch (error) {
            console.log('⚠️ Error sincronizando con servidor principal:', error.message);
        }
    }
}

// Inicialización automática
const cliente = new GameClient();

async function inicializarSistema() {
    console.log('🚀 Iniciando cliente distribuido con replicación tiempo real...');
    
    try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('📊 Estado inicial:', cliente.getStatus());
        
        if (cliente.isConnected || cliente.isLocalHost) {
            console.log('✅ Sistema listo con replicación en tiempo real');
            
            try {
                const puntuaciones = await cliente.obtenerMejoresPuntuaciones();
                console.log(`🏆 ${puntuaciones.length} puntuaciones en ranking`);
            } catch (error) {
                console.log('⚠️ Error en prueba:', error.message);
            }
        } else {
            console.log('🔄 Esperando conexión...');
        }
        
    } catch (error) {
        console.error('❌ Error inicialización:', error);
    }
}

// Limpieza al cerrar
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando sistema...');
    cliente.destroy();
    process.exit(0);
});

// Exportar para uso en diferentes entornos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameClient;
}

if (typeof window !== 'undefined') {
    window.GameClient = GameClient;
    window.cliente = cliente;
}

// Inicializar
inicializarSistema();