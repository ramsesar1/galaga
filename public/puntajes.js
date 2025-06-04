// Variables de conexión
let isHost = false;
let isConnected = false;
let playerName = '';
let sessionKey = '';
let hostIP = '';
let connectionStatus = 'disconnected';
let connectedPlayers = 0;
let socket = null;
let connectionAttempts = 0;
let maxAttempts = 5;

// Elementos del DOM
const connectBtn = document.getElementById('connectBtn');
const hostBtn = document.getElementById('hostBtn');
const statusDiv = document.getElementById('status');
const connectionInfo = document.getElementById('connectionInfo');
const connectionStatusSpan = document.getElementById('connectionStatus');
const playerCountSpan = document.getElementById('playerCount');

// Generar estrellas de fondo
function createStars() {
    for (let i = 0; i < 50; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.width = star.style.height = Math.random() * 3 + 1 + 'px';
        star.style.animationDelay = Math.random() * 2 + 's';
        document.body.appendChild(star);
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    createStars();
    
    // Cargar datos guardados si existen
    const savedPlayerName = localStorage.getItem('galagaPlayerName');
    if (savedPlayerName) {
        document.getElementById('playerName').value = savedPlayerName;
    }
});

// Validar formulario
function validateForm() {
    const sessionKeyInput = document.getElementById('sessionKey');
    const playerNameInput = document.getElementById('playerName');
    const hostIPInput = document.getElementById('hostIP');
    
    sessionKey = sessionKeyInput.value.trim();
    playerName = playerNameInput.value.trim();
    hostIP = hostIPInput.value.trim();
    
    if (!sessionKey) {
        showStatus('error', 'Debes ingresar una clave de sesión');
        return false;
    }
    
    if (!playerName) {
        showStatus('error', 'Debes ingresar tu nombre');
        return false;
    }
    
    if (sessionKey.length < 4) {
        showStatus('error', 'La clave debe tener al menos 4 caracteres');
        return false;
    }
    
    // Guardar nombre del jugador
    localStorage.setItem('galagaPlayerName', playerName);
    
    return true;
}

// Mostrar estado de conexión
function showStatus(type, message) {
    statusDiv.style.display = 'block';
    statusDiv.className = 'status ' + type;
    statusDiv.textContent = message;
}

// Ser host
function startAsHost() {
    if (!validateForm()) return;
    
    isHost = true;
    connectBtn.disabled = true;
    hostBtn.disabled = true;
    
    showStatus('connecting', 'Iniciando como host WebRTC...');
    
    setTimeout(() => {
        connectionStatus = 'hosting';
        connectedPlayers = 1;
        updateConnectionInfo();
        showStatus('connected', 'Host iniciado - El cliente debe ir a webrtc-client.html');
        
        setTimeout(() => {
            startMultiplayerGame();
        }, 3000);
        
    }, 2000);
}
// Conectarse a host
function attemptConnection() {
    if (!validateForm()) return;
    
    isHost = false;
    connectBtn.disabled = true;
    hostBtn.disabled = true;
    
    showStatus('connecting', 'Preparando conexión WebRTC...');
    
    setTimeout(() => {
        connectionStatus = 'ready-to-connect';
        connectedPlayers = 1;
        isConnected = true;
        updateConnectionInfo();
        showStatus('connected', 'Listo para conectar - Abriendo cliente WebRTC...');
        
        setTimeout(() => {
            startMultiplayerGame();
        }, 2000);
    }, 1500);
}

function tryConnect() {
    connectionAttempts++;
    showStatus('connecting', `Conectando... (Intento ${connectionAttempts}/${maxAttempts})`);
    
    // Simular intento de conexión
    setTimeout(() => {
        const success = Math.random() > 0.3; // 70% de probabilidad de éxito
        
        if (success) {
            connectionStatus = 'connected';
            connectedPlayers = 2;
            isConnected = true;
            updateConnectionInfo();
            showStatus('connected', '¡Conectado exitosamente! Iniciando juego...');
            
            setTimeout(() => {
                startMultiplayerGame();
            }, 2000);
        } else {
            if (connectionAttempts < maxAttempts) {
                showStatus('error', `Conexión fallida. Reintentando en 3 segundos...`);
                setTimeout(() => {
                    tryConnect();
                }, 3000);
            } else {
                showStatus('error', 'No se pudo conectar después de ' + maxAttempts + ' intentos');
                resetConnection();
            }
        }
    }, 2000 + Math.random() * 3000);
}

// Actualizar información de conexión
function updateConnectionInfo() {
    connectionInfo.style.display = 'block';
    connectionStatusSpan.textContent = connectionStatus;
    playerCountSpan.textContent = connectedPlayers + '/2';
}

// Reiniciar conexión
function resetConnection() {
    connectBtn.disabled = false;
    hostBtn.disabled = false;
    connectionAttempts = 0;
    isConnected = false;
    connectionStatus = 'disconnected';
    connectedPlayers = 0;
    connectionInfo.style.display = 'none';
}

// Iniciar juego multijugador
function startMultiplayerGame() {
    // Guardar datos de conexión para el juego
    const gameData = {
        isHost: isHost,
        playerName: playerName,
        sessionKey: sessionKey,
        hostIP: hostIP,
        isConnected: true,
        connectionTime: Date.now(),
        useWebRTC: true  // Nuevo parámetro
    };
    
    // Guardar en sessionStorage para que multijugador.js pueda acceder
    sessionStorage.setItem('multiplayerData', JSON.stringify(gameData));
    
    if (isHost) {
        // El host va directo al juego principal
        window.location.href = 'multiplayer.html';
    } else {
        // El cliente va a la página de cliente WebRTC
        window.location.href = 'webrtc-client.html';
    }
}

// Validación de conexión en tiempo real (se ejecutaría periódicamente)
function checkConnection() {
    if (isConnected) {
        // Aquí iría la lógica para verificar que la conexión sigue activa
        // Por ejemplo, enviando pings al otro jugador
        
        const connectionTime = Date.now() - (JSON.parse(sessionStorage.getItem('multiplayerData') || '{}').connectionTime || 0);
        
        // Si han pasado más de 30 segundos sin respuesta, considerar desconectado
        if (connectionTime > 30000) {
            showStatus('error', 'Conexión perdida');
            resetConnection();
        }
    }
}

// Verificar conexión cada 5 segundos
setInterval(checkConnection, 5000);

// Volver al menú principal
function returnToMenu() {
    if (isConnected) {
        if (confirm('¿Estás seguro de que quieres salir? Se perderá la conexión.')) {
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
}

// Manejar cierre de ventana
window.addEventListener('beforeunload', function(e) {
    if (isConnected) {
        e.preventDefault();
        e.returnValue = '';
        return 'Se perderá la conexión multijugador';
    }
});

// Funciones auxiliares para la implementación real
// Estas se usarían con WebRTC o Socket.IO en una implementación completa

function initializeWebRTC() {
    // Configuración de WebRTC para conexión P2P
    // Esto requeriría un servidor de señalización
}

function initializeSocketConnection() {
    // Conexión con Socket.IO si se usa un servidor
    socket = io('http://26.98.46.140:3000:3000');
}

// Función para sincronizar datos del juego
function syncGameData(data) {
    if (isConnected && socket) {
        socket.emit('gameSync', {
            sessionKey: sessionKey,
            playerName: playerName,
            data: data
        });
    }
}

// Escuchar datos de sincronización
function onGameDataReceived(callback) {
    if (socket) {
        socket.on('gameSync', callback);
    }
}