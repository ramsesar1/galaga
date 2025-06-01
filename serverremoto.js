class GameClient {
    constructor(serverIP = '26.98.46.140', serverPort = 3000) {
        this.baseURL = `http://${serverIP}:${serverPort}`;
        this.isConnected = false;
    }

    async checkServerConnection() {
        try {
            const response = await fetch(`${this.baseURL}/api/db-status`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.isConnected = data.connected;
                console.log('Estado del servidor:', data.connected ? 'Conectado' : 'Desconectado');
                return data.connected;
            }
            
            this.isConnected = false;
            return false;
        } catch (error) {
            console.error('Error conectando al servidor:', error);
            this.isConnected = false;
            return false;
        }
    }

    async guardarPuntuacion(nivel, puntuacion, tiempo, modo = 'single') {
        if (!this.isConnected) {
            console.log('Verificando conexión...');
            await this.checkServerConnection();
        }

        try {
            const response = await fetch(`${this.baseURL}/api/guardar-puntuacion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    nivel: nivel,
                    puntuacion: puntuacion,
                    tiempo: tiempo,
                    modo: modo
                })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('Puntuación guardada exitosamente');
                return true;
            } else {
                console.error('Error guardando puntuación:', result.message);
                return false;
            }
        } catch (error) {
            console.error('Error de red:', error);
            return false;
        }
    }

    async obtenerMejoresPuntuaciones(modo = 'single') {
        if (!this.isConnected) {
            console.log('Verificando conexión...');
            await this.checkServerConnection();
        }

        try {
            const response = await fetch(`${this.baseURL}/api/mejores-puntuaciones?modo=${modo}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('Puntuaciones obtenidas:', result.data);
                return result.data;
            } else {
                console.error('Error obteniendo puntuaciones:', result.message);
                return [];
            }
        } catch (error) {
            console.error('Error de red:', error);
            return [];
        }
    }

    setServerIP(newIP, newPort = 3000) {
        this.baseURL = `http://${newIP}:${newPort}`;
        this.isConnected = false;
        console.log(`Nueva URL del servidor: ${this.baseURL}`);
    }

    async autoDetectServer(possibleIPs = []) {
        for (const ip of possibleIPs) {
            console.log(`Probando servidor en: ${ip}`);
            this.setServerIP(ip);
            
            if (await this.checkServerConnection()) {
                console.log(`Servidor encontrado en: ${ip}`);
                return true;
            }
        }
        
        console.log('No se pudo encontrar el servidor en ninguna IP');
        return false;
    }
}

const cliente = new GameClient('26.98.46.140');

async function inicializarCliente() {
    console.log('Iniciando cliente...');
    
    const conectado = await cliente.checkServerConnection();
    
    if (conectado) {
        console.log('Cliente conectado al servidor exitosamente');
        
        await cliente.guardarPuntuacion(5, 1500, 120.5, 'single');
        
        const puntuaciones = await cliente.obtenerMejoresPuntuaciones('single');
        console.log('Mejores puntuaciones:', puntuaciones);
        
    } else {
        console.log('No se pudo conectar al servidor');
        
        const ipsHamachi = [
            '25.0.0.1',   
            '25.0.0.2',
            '25.0.0.3',
        ];
        
        await cliente.autoDetectServer(ipsHamachi);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameClient;
}

if (typeof window !== 'undefined') {
    window.GameClient = GameClient;
}

inicializarCliente();