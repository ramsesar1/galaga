class GameClient {
    constructor(servers = ['25.46.132.85:3000', '25.2.184.111:3000', '25.2.129.231:3000','25.2.230.25:3000']) {
        this.servers = [...servers];
        this.currentIndex = 0;
        this.isConnected = false;
        this.healthInterval = null;
        this.fallbackMode = false;
        this.fallbackServer = null;
        
        this.startHealthMonitoring();
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

        // Priorizar servidor primario
        let bestServer = healthyServers.find(s => s.isPrimary) || healthyServers[0];
        
        if (bestServer.index !== this.currentIndex || !this.isConnected) {
            this.currentIndex = bestServer.index;
            this.isConnected = true;
            this.fallbackMode = false;
            console.log(`✅ Conectado a: ${this.currentServer} ${bestServer.isPrimary ? '(Primario)' : ''}`);
        }
    }

    async handleNoServersAvailable() {
        if (!this.fallbackMode) {
            console.log('⚠️ Sin servidores - Activando modo fallback');
            this.fallbackMode = true;
            await this.startFallbackServer();
        }
        this.isConnected = false;
    }

    async startFallbackServer() {
        try {
            // Simular inicio de servidor local como fallback
            this.fallbackServer = 'localhost:3000';
            console.log('🆘 Servidor fallback iniciado en localhost:3000');
            
            // En implementación real, aquí iniciarías un servidor Express local
            // con las mismas funcionalidades que server.js
        } catch (error) {
            console.error('❌ Error iniciando fallback:', error.message);
        }
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
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Espera breve
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
            
            // Intentar con el siguiente servidor
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
        
        // Si no se encontró ningún servidor, volver al original
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
            indice: this.currentIndex
        };
    }

    destroy() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = null;
        }
        console.log('🧹 Cliente destruido');
    }
}

// Inicialización automática
const cliente = new GameClient();

async function inicializarSistema() {
    console.log('🚀 Iniciando cliente distribuido...');
    
    try {
        // Esperar a que se establezca la conexión
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('📊 Estado inicial:', cliente.getStatus());
        
        if (cliente.isConnected) {
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