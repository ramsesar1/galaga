const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

class ClusterSetup {
    constructor() {
        this.configFile = 'cluster-config.json';
        this.knownNodesFile = 'known_nodes.json';
    }

    getLocalIPs() {
        const interfaces = os.networkInterfaces();
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

    async createDefaultConfig() {
        const localIPs = this.getLocalIPs();
        const defaultPort = 3000;
        
        const config = {
            nodeId: localIPs.length > 0 ? `${localIPs[0]}:${defaultPort}` : `localhost:${defaultPort}`,
            port: defaultPort,
            database: {
                host: 'localhost',
                user: 'root',
                password: 'password',
                database: 'galaga'
            },
            cluster: {
                heartbeatInterval: 5000,
                replicationTimeout: 5000,
                maxReconnectAttempts: 3,
                healthCheckFrequency: 10000
            },
            knownNodes: [],
            autoDiscovery: {
                enabled: true,
                ipRanges: [
                    '192.168.1.0/24',
                    '25.0.0.0/24'
                ],
                ports: [3000, 3001, 3002]
            }
        };

        try {
            await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
            console.log(`✅ Archivo de configuración creado: ${this.configFile}`);
            return config;
        } catch (error) {
            console.error('❌ Error creando configuración:', error);
            throw error;
        }
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configFile, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.log('⚙️ No se encontró configuración, creando una nueva...');
            return await this.createDefaultConfig();
        }
    }

    async updateKnownNodes(nodes) {
        try {
            const uniqueNodes = [...new Set(nodes)];
            await fs.writeFile(this.knownNodesFile, JSON.stringify(uniqueNodes, null, 2));
            console.log(`📝 Nodos conocidos actualizados: ${uniqueNodes.length} nodos`);
        } catch (error) {
            console.error('❌ Error actualizando nodos conocidos:', error);
        }
    }

    async scanNetwork(ipRange, ports) {
        console.log(`🔍 Escaneando red ${ipRange} en puertos ${ports.join(', ')}...`);
        
        const [network, cidr] = ipRange.split('/');
        const [baseIP] = network.split('.');
        const baseNetwork = network.substring(0, network.lastIndexOf('.'));
        
        const foundNodes = [];
        const scanPromises = [];

        // Escanear rango de IPs
        for (let i = 1; i < 255; i++) {
            const ip = `${baseNetwork}.${i}`;
            
            for (const port of ports) {
                scanPromises.push(
                    this.checkNode(`${ip}:${port}`)
                        .then(isAlive => {
                            if (isAlive) {
                                foundNodes.push(`${ip}:${port}`);
                                console.log(`✅ Nodo encontrado: ${ip}:${port}`);
                            }
                        })
                        .catch(() => {}) // Ignorar errores de conexión
                );
            }
        }

        await Promise.allSettled(scanPromises);
        return foundNodes;
    }

    async checkNode(nodeAddress) {
        try {
            const response = await fetch(`http://${nodeAddress}/api/ping`, {
                method: 'GET',
                timeout: 2000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async discoverNodes() {
        const config = await this.loadConfig();
        const allFoundNodes = [];

        if (config.autoDiscovery.enabled) {
            for (const ipRange of config.autoDiscovery.ipRanges) {
                const foundNodes = await this.scanNetwork(ipRange, config.autoDiscovery.ports);
                allFoundNodes.push(...foundNodes);
            }
        }

        // Agregar nodos conocidos manualmente
        allFoundNodes.push(...config.knownNodes);

        // Remover duplicados y el nodo actual
        const uniqueNodes = [...new Set(allFoundNodes)].filter(node => node !== config.nodeId);
        
        await this.updateKnownNodes(uniqueNodes);
        return uniqueNodes;
    }

    async generateStartupScript() {
        const config = await this.loadConfig();
        const localIPs = this.getLocalIPs();

        const startupScript = `#!/bin/bash
# Script de inicio del cluster de base de datos

echo "🚀 Iniciando nodo del cluster..."
echo "📡 IPs locales disponibles:"
${localIPs.map(ip => `echo "  - ${ip}:${config.port}"`).join('\n')}
echo ""

# Verificar dependencias
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    exit 1
fi

if ! command -v mysql &> /dev/null; then
    echo "⚠️ MySQL no está disponible en PATH"
fi

# Verificar archivos necesarios
if [ ! -f "server.js" ]; then
    echo "❌ server.js no encontrado"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo "📦 Instalando dependencias..."
    npm init -y
    npm install express mysql2 cors
fi

# Crear base de datos si no existe
echo "🗄️ Configurando base de datos..."
mysql -u${config.database.user} -p${config.database.password} -e "CREATE DATABASE IF NOT EXISTS ${config.database.database};" 2>/dev/null || echo "⚠️ No se pudo crear la base de datos automáticamente"

# Iniciar servidor
echo "▶️ Iniciando servidor en puerto ${config.port}..."
export PORT=${config.port}
node server.js

echo "🛑 Servidor detenido"
`;

        await fs.writeFile('start-cluster.sh', startupScript);
        
        // Hacer ejecutable en sistemas Unix
        try {
            execSync('chmod +x start-cluster.sh');
        } catch (error) {
            // En Windows, ignorar este error
        }

        console.log('✅ Script de inicio creado: start-cluster.sh');
    }

    async generateDocumentation() {
        const doc = `# Cluster de Base de Datos - Documentación

## Descripción General

Este sistema implementa un cluster de base de datos MySQL con replicación automática y failover entre múltiples nodos. Los nodos pueden actuar tanto como servidor principal (líder) como réplicas.

## Características

- ✅ **Elección automática de líder**: El nodo con menor ID se convierte en líder
- ✅ **Replicación en tiempo real**: Los datos se replican automáticamente a todas las réplicas
- ✅ **Failover automático**: Los clientes se reconectan automáticamente si el líder falla
- ✅ **Descubrimiento de nodos**: Los nodos se encuentran automáticamente en la red
- ✅ **Monitoreo de salud**: Heartbeat continuo entre todos los nodos
- ✅ **Sincronización completa**: Los nodos nuevos se sincronizan automáticamente

## Instalación y Configuración

### 1. Dependencias
\`\`\`bash
npm install express mysql2 cors
\`\`\`

### 2. Configurar MySQL
\`\`\`sql
CREATE DATABASE galaga;
CREATE USER 'root'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON galaga.* TO 'root'@'%';
FLUSH PRIVILEGES;
\`\`\`

### 3. Iniciar Nodos
En cada máquina que participará en el cluster:

\`\`\`bash
# Generar configuración inicial
node setup-cluster.js

# Iniciar servidor
./start-cluster.sh
# o
node server.js
\`\`\`

## Archivos del Sistema

- **server.js**: Servidor principal con capacidades de replicación
- **serverremoto.js**: Cliente con failover automático
- **setup-cluster.js**: Script de configuración del cluster
- **cluster-config.json**: Configuración del nodo
- **known_nodes.json**: Lista de nodos conocidos en el cluster

## API Endpoints

### Endpoints Originales
- \`GET /api/ping\` - Estado del servidor
- \`POST /api/guardar-puntuacion\` - Guardar puntuación de juego
- \`GET /api/mejores-puntuaciones\` - Obtener mejores puntuaciones
- \`GET /api/db-status\` - Estado de la base de datos

### Endpoints de Cluster
- \`POST /api/heartbeat\` - Heartbeat entre nodos
- \`POST /api/replicate\` - Replicar operación a réplica
- \`GET /api/full-sync\` - Sincronización completa de datos
- \`GET /api/cluster-status\` - Estado del cluster

## Monitoreo

### Ver Estado del Cluster
\`\`\`bash
curl http://localhost:3000/api/cluster-status
\`\`\`

### Logs Importantes
- **🏆 Nodo elegido como LÍDER**: El nodo se convirtió en líder
- **📋 Nodo ahora es RÉPLICA**: El nodo se convirtió en réplica
- **🔄 Cambiando al servidor líder**: Cliente detectó nuevo líder
- **✅ Failover exitoso**: Cliente se reconectó después de falla

## Solución de Problemas

### Problema: Nodo no se conecta al cluster
1. Verificar conectividad de red entre nodos
2. Revisar archivo \`known_nodes.json\`
3. Verificar que los puertos estén abiertos
4. Comprobar logs de heartbeat

### Problema: Datos no se replican
1. Verificar que el nodo sea líder (\`isLeader: true\`)
2. Comprobar que las réplicas estén marcadas como "healthy"
3. Revisar logs de replicación
4. Verificar conectividad con réplicas

### Problema: Cliente no puede conectar
1. Verificar lista de servidores en el cliente
2. Comprobar que al menos un servidor esté funcionando
3. Revisar logs de failover automático
4. Verificar descubrimiento automático de servidores

## Configuración Avanzada

### Personalizar Intervalos
Editar \`cluster-config.json\`:
\`\`\`json
{
  "cluster": {
    "heartbeatInterval": 5000,      // Frecuencia de heartbeat
    "replicationTimeout": 5000,     // Timeout para replicación
    "maxReconnectAttempts": 3,      // Intentos de reconexión
    "healthCheckFrequency": 10000   // Frecuencia de verificación de salud
  }
}
\`\`\`

### Agregar Nodos Manualmente
\`\`\`json
{
  "knownNodes": [
    "192.168.1.100:3000",
    "192.168.1.101:3000",
    "25.0.0.1:3000"
  ]
}
\`\`\`

## Arquitectura del Sistema

\`\`\`
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nodo 1 (LÍDER)│◄──►│   Nodo 2        │◄──►│   Nodo 3        │
│   MySQL + API   │    │   MySQL + API   │    │   MySQL + API   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │              Heartbeat & Replication          │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │     Cliente     │
                    │  (Auto-failover)│
                    └─────────────────┘
\`\`\`

## Seguridad

- Cambiar contraseñas por defecto en producción
- Configurar firewall para permitir solo IPs autorizadas
- Usar HTTPS en lugar de HTTP para producción
- Implementar autenticación entre nodos si es necesario
`;

        await fs.writeFile('CLUSTER-README.md', doc);
        console.log('✅ Documentación generada: CLUSTER-README.md');
    }

    async setup() {
        console.log('🔧 Configurando cluster de base de datos...\n');

        try {
            // 1. Cargar/crear configuración
            const config = await this.loadConfig();
            console.log('📋 Configuración cargada');

            // 2. Descubrir nodos en la red
            const foundNodes = await this.discoverNodes();
            console.log(`🔍 Descubrimiento completado: ${foundNodes.length} nodos encontrados`);

            // 3. Generar script de inicio
            await this.generateStartupScript();

            // 4. Generar documentación
            await this.generateDocumentation();

            console.log('\n✅ Configuración del cluster completada');
            console.log('\n📋 Próximos pasos:');
            console.log('1. Revisar cluster-config.json y ajustar según sea necesario');
            console.log('2. Ejecutar ./start-cluster.sh en cada nodo');
            console.log('3. Verificar estado del cluster con: curl http://localhost:3000/api/cluster-status');
            console.log('4. Leer CLUSTER-README.md para más información');

        } catch (error) {
            console.error('❌ Error durante la configuración:', error);
            throw error;
        }
    }
}

// Ejecutar configuración si se llama directamente
if (require.main === module) {
    const setup = new ClusterSetup();
    setup.setup().catch(console.error);
}

module.exports = ClusterSetup;