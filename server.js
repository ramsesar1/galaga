const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'password', 
    database: 'galaga' 
};

let dbConnection = null;

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
        return false;
    }
}

app.get('/api/ping', (req, res) => {
    res.json({ 
        message: 'Servidor funcionando', 
        timestamp: new Date().toISOString(),
        clientIP: req.ip || req.connection.remoteAddress
    });
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
        await dbConnection.execute(
            `INSERT INTO ${tabla} (nivel, puntuacion, tiempo) VALUES (?, ?, ?)`,
            [nivel, puntuacion, tiempo]
        );
        
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
    res.json({ connected: isConnected });
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
        console.log(`Servidor corriendo en puerto ${PORT}`);
        console.log('IPs disponibles para conexiones remotas:');
        
        const localIPs = getLocalIPs();
        localIPs.forEach(ip => {
            console.log(`  http://${ip}:${PORT}`);
        });
        
        console.log('\nPara conectar desde otra máquina, usa una de estas IPs en tu cliente.');
    });
}

startServer();