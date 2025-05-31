// Variables de estado
let isHost = false;
let isConnected = false;
let playerName = '';
let sessionKey = '';
let hostIP = '';
let connectionStatus = 'disconnected';
let connectedPlayers = 0;

// Elementos del DOM
const connectBtn = document.getElementById('connectBtn');
const hostBtn = document.getElementById('hostBtn');
const statusDiv = document.getElementById('status');
const connectionInfo = document.getElementById('connectionInfo');
const connectionStatusSpan = document.getElementById('connectionStatus');
const playerCountSpan = document.getElementById('playerCount');

// Mostrar mensaje de oponente desconectado
function showOpponentDisconnected() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Courier New;
        z-index: 2000;
        text-align: center;
    `;

    overlay.innerHTML = `
        <div>
            <h2 style="color: #ff0000;">OPONENTE DESCONECTADO</h2>
            <p>El otro jugador se ha desconectado de la partida</p>
            <p style="color: #ffff00;">¡Ganaste por abandono!</p>
            <button onclick="returnToMenu()" style="
                background: #00ffff;
                color: #000;
                border: none;
                padding: 10px 20px;
                margin: 10px;
                font-family: Courier New;
                cursor: pointer;
            ">Volver al Menú</button>
        </div>
    `;

    document.body.appendChild(overlay);
}

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
document.addEventListener('DOMContentLoaded', function () {
    createStars();

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

    showStatus('connecting', 'Iniciando como host...');

    setTimeout(() => {
        connectionStatus = 'hosting';
        connectedPlayers = 1;
        updateConnectionInfo();
        showStatus('connected', 'Host iniciado - Esperando jugador...');

        // Simular llegada de oponente
        setTimeout(() => {
            if (connectionStatus === 'hosting') {
                connectedPlayers = 2;
                updateConnectionInfo();
                showStatus('connected', '¡Ambos jugadores conectados! Iniciando juego...');

                setTimeout(() => {
                    startMultiplayerGame();
                }, 2000);
            }
        }, 3000 + Math.random() * 5000);
    }, 2000);
}

// Conectarse a host (simulado)
function attemptConnection() {
    if (!validateForm()) return;

    if (!hostIP) {
        showStatus('error', 'Debes ingresar la IP del host para conectarte');
        return;
    }

    isHost = false;
    connectBtn.disabled = true;
    hostBtn.disabled = true;

    let connectionAttempts = 0;
    const maxAttempts = 5;

    function tryConnect() {
        connectionAttempts++;
        showStatus('connecting', `Conectando... (Intento ${connectionAttempts}/${maxAttempts})`);

        setTimeout(() => {
            const success = Math.random() > 0.3;

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
                    setTimeout(tryConnect, 3000);
                } else {
                    showStatus('error', 'No se pudo conectar después de ' + maxAttempts + ' intentos');
                    resetConnection();
                }
            }
        }, 2000 + Math.random() * 3000);
    }

    tryConnect();
}

// Actualizar visualmente info de conexión
function updateConnectionInfo() {
    connectionInfo.style.display = 'block';
    connectionStatusSpan.textContent = connectionStatus;
    playerCountSpan.textContent = connectedPlayers + '/2';
}

// Resetear simulación de conexión
function resetConnection() {
    connectBtn.disabled = false;
    hostBtn.disabled = false;
    isConnected = false;
    connectionStatus = 'disconnected';
    connectedPlayers = 0;
    connectionInfo.style.display = 'none';
}

// Iniciar juego multijugador simulado
function startMultiplayerGame() {
    const gameData = {
        isHost: isHost,
        playerName: playerName,
        sessionKey: sessionKey,
        hostIP: hostIP,
        isConnected: true,
        connectionTime: Date.now(),
        vsMode: true
    };

    sessionStorage.setItem('multiplayerData', JSON.stringify(gameData));

    // Simulación: sin conexión real
    window.location.href = 'multiplayer.html';
}

// Chequeo simulado de conexión perdida
function checkConnection() {
    if (isConnected) {
        const connectionTime = Date.now() - (JSON.parse(sessionStorage.getItem('multiplayerData') || '{}').connectionTime || 0);

        if (connectionTime > 30000) {
            showStatus('error', 'Conexión perdida');
            resetConnection();
        }
    }
}

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

// Aviso antes de cerrar ventana
window.addEventListener('beforeunload', function (e) {
    if (isConnected) {
        e.preventDefault();
        e.returnValue = '';
        return 'Se perderá la conexión multijugador';
    }
});
