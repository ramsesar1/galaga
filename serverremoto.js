const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

class GameClient {
    constructor(servers = ['25.46.132.85:3000', '25.2.184.111:3000', '25.2.129.231:3000']) {
        this.servers = [...servers];
        this.currentIndex = 0;
        this.isConnected = false;
        this.healthInterval = null;
        this.fallbackMode = false;
        this.fallbackServer = null;
        this.localDB = null;
        this.localApp = null;
        this.localPort = 3001; // Puerto diferente para evitar conflictos
        this.dbConfig = { host: 'localhost', user: 'root', password: 'password', database: 'galaga' };
        this.nodeId = Math.random().toString(36).substr(2, 9);
        this.isLocalHost = false;
        
        this.startHealthMonitoring();
        this.initializeLocalDB();
    }

    // Nueva función: Inicializar BD local
    async initializeLocalDB() {
        try {
            this.localDB = await mysql.createConnection(this.dbConfig);
            
            // Crear tablas locales si no existen
            await Promise.all([
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS Jugador1 (
                    id INT AUTO_INCREMENT PRIMARY KEY, nivel INT NOT NULL, puntuacion INT NOT NULL, tiempo FLOAT NOT NULL
                )`),
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS Jugadores2 (
                    id INT AUTO_INCREMENT PRIMARY KEY, nivel INT NOT NULL, puntuacion INT NOT NULL, tiempo FLOAT NOT NULL
                )`),
                this.localDB.execute(`CREATE TABLE IF NOT EXISTS sync_log (
                    id INT AUTO_INCREMENT PRIMARY KEY, table_name VARCHAR(50) NOT NULL, record_id INT NOT NULL,
                    action VARCHAR(10) NOT NULL, data JSON, node_id VARCHAR(50) NOT NULL, synced BOOLEAN DEFAULT FALSE
                )`)
            ]);
            
            console.log('✅ BD local inicializada');
            
            // Intentar sincronizar datos iniciales
            await this.syncInitialData();
            
        } catch (error) {
            console.error('❌ Error BD local:', error.message);
        }
    }

    // Nueva función: Sincronizar datos iniciales desde servidor remoto
    async syncInitialData() {
        if (!this.isConnected) return;
        
        try {
            // Obtener datos de ambas tablas
            const [jugador1, jugadores2] = await Promise.all([
                this.obtenerMejoresPuntuaciones('single'),
                this.obtenerMejoresPuntuaciones('coop')
            ]);
            
            // Limpiar y replicar datos localmente
            await this.localDB.execute('DELETE FROM Jugador1');
            await this.localDB.execute('DELETE FROM Jugadores2');
            
            // Insertar datos de Jugador1
            for (const record of jugador1) {
                await this.localDB.execute(
                    'INSERT INTO Jugador1 (nivel, puntuacion, tiempo) VALUES (?, ?, ?)',
                    [record.nivel, record.puntuacion, record.tiempo]
                );
            }
            
            // Insertar datos de Jugadores2
            for (const record of jugadores2) {
                await this.localDB.execute(
                    'INSERT INTO Jugadores2 (nivel, puntuacion, tiempo) VALUES (?, ?, ?)',
                    [record.nivel, record.puntuacion, record.tiempo]
                );
            }
            
            console.log(`✅ Sincronizados ${jugador1.length + jugadores2.length} registros localmente`);
            
        } catch (error) {
            console.log('⚠️ Error sincronización inicial:', error.message);
        }
    }

    // Nueva función: Iniciar servidor local como host
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
            
            this.localApp.get('/api/cluster-status', (req, res) => {
                res.json({
                    nodeId: this.nodeId,
                    isPrimary: true,
                    activeNodes: [],
                    totalNodes: 1,
                    selfAddress: `localhost:${this.localPort}`
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
                    
                    res.json({ success: true, message: 'Puntuación guardada localmente' });
                } catch (error) {
                    res.json({ success: false, message: error.message });
                }
            });
            
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
            
            this.localApp.get('/api/db-status', (req, res) => {
                res.json({ 
                    connected: this.localDB !== null,
                    nodeId: this.nodeId,
                    isPrimary: true,
                    activeNodes: [],
                    nodesCount: 0
                });
            });
            
            // Nueva función: Endpoint para sincronizar con servidor principal cuando regrese
            this.localApp.get('/api/get-all-data', async (req, res) => {
                try {
                    const [jugador1] = await this.localDB.execute('SELECT * FROM Jugador1');
                    const [jugadores2] = await this.localDB.execute('SELECT * FROM Jugadores2');
                    
                    res.json({ 
                        success: true, 
                        data: { Jugador1: jugador1, Jugadores2: jugadores2 } 
                    });
                } catch (error) {
                    res.json({ success: false, message: error.message });
                }
            });
            
            this.localApp.listen(this.localPort, '0.0.0.0', () => {
                console.log(`🆘 Servidor local iniciado en puerto ${this.localPort}`);
                this.isLocalHost = true;
                this.fallbackServer = `localhost:${this.localPort}`;
            });
            
        } catch (error) {
            console.error('❌ Error iniciando servidor local:', error.message);
        }
    }

    // Nueva función: Sincronizar datos con servidor principal cuando regrese
    async syncWithMainServer() {
        if (!this.localDB || this.isLocalHost) return;
        
        try {
            // Obtener datos locales que pueden ser nuevos
            const [localJugador1] = await this.localDB.execute('SELECT * FROM Jugador1');
            const [localJugadores2] = await this.localDB.execute('SELECT * FROM Jugadores2');
            
            // Enviar datos locales al servidor principal usando el endpoint específico
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
                } else {
                    console.log('⚠️ Error en sincronización:', result.message);
                }
            }
            
            // Después de sincronizar, actualizar datos locales con los del servidor
            await this.syncInitialData();
            
        } catch (error) {
            console.log('⚠️ Error sincronizando con servidor principal:', error.message);
        }
    }

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

        // Verificar todos los servidores en paralelo
        const checks = this.servers.map(async (server, index) => {
            try {
                const response = await fetch(`http://${server}/api/cluster-status`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(3000)
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
                    return result;
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
            
            // Sincronizar datos cuando se reconecte
            setTimeout(() => this.syncInitialData(), 2000);
        }
    }

    async handleNoServersAvailable() {
        if (!this.fallbackMode) {
            console.log('⚠️ Sin servidores - Activando modo host local');
            this.fallbackMode = true;
            await this.startLocalHost();
        }
        this.isConnected = this.isLocalHost; // Conectado si el servidor local está corriendo
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

    async checkServerConnection() {
        try {
            const response = await fetch(`${this.baseURL}/api/db-status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                this.isConnected = data.connected;
                
                console.log(`📊 Estado del servidor ${this.currentServer}:`, {
                    conectado: data.connected,
                    nodeId: data.nodeId,
                    esPrimario: data.isPrimary,
                    nodosActivos: data.nodesCount
                });
                
                return data.connected;
            }
            
            this.isConnected = false;
            return false;
        } catch (error) {
            console.error(`❌ Error conectando al servidor ${this.currentServer}:`, error.message);
            this.isConnected = false;
            
            await this.switchToNextServer();
            return false;
        }
    }

    async switchToNextServer() {
        const originalIndex = this.currentIndex;
        let attempts = 0;
        
        while (attempts < this.servers.length) {
            this.currentIndex = (this.currentIndex + 1) % this.servers.length;
            attempts++;
            
            console.log(`🔄 Probando servidor: ${this.currentServer}`);
            
            try {
                const response = await fetch(`${this.baseURL}/api/ping`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(3000)
                });
                
                if (response.ok) {
                    console.log(`✅ Conectado exitosamente a: ${this.currentServer}`);
                    this.isConnected = true;
                    return true;
                }
            } catch (error) {
                console.log(`❌ Servidor ${this.currentServer} no disponible`);
            }
        }
        
        this.currentIndex = originalIndex;
        this.isConnected = false;
        console.log('⚠️ No se encontró ningún servidor disponible');
        return false;
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

    async guardarPuntuacion(nivel, puntuacion, tiempo, modo = 'single') {
        return await this.executeWithFailover(async () => {
            const response = await fetch(`${this.baseURL}/api/guardar-puntuacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nivel, puntuacion, tiempo, modo }),
                signal: AbortSignal.timeout(8000)
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Puntuación guardada: ${nivel}/${puntuacion}`);
                return true;
            } else {
                throw new Error(result.message || 'Error guardando');
            }
        });
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

    getStatus() {
        return {
            servidores: this.servers,
            actual: this.currentServer,
            conectado: this.isConnected,
            fallback: this.fallbackMode,
            indice: this.currentIndex,
            hostLocal: this.isLocalHost,
            puertoLocal: this.localPort
        };
    }

    destroy() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = null;
        }
        
        if (this.localDB) {
            this.localDB.end();
        }
        
        console.log('🧹 Cliente destruido');
    }
}

// Inicialización automática
const cliente = new GameClient();

async function inicializarSistema() {
    console.log('🚀 Iniciando cliente distribuido con replicación BD...');
    
    try {
        // Esperar a que se establezca la conexión
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log('📊 Estado inicial:', cliente.getStatus());
        
        if (cliente.isConnected || cliente.isLocalHost) {
            console.log('✅ Sistema listo');
            
            // Prueba opcional del sistema
            try {
                await cliente.guardarPuntuacion(1, 100, 30.5);
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