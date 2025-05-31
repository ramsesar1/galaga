class GameWebSocket {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.sessionKey = null;
        this.playerName = null;
        this.isHost = false;
        this.callbacks = {};
    }

    connect(serverUrl, sessionData) {
        try {
            this.socket = new WebSocket(serverUrl);
            this.sessionKey = sessionData.sessionKey;
            this.playerName = sessionData.playerName;
            this.isHost = sessionData.isHost;

            this.socket.onopen = () => {
                console.log('WebSocket conectado');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Autenticar sesión
                this.emit('joinSession', {
                    sessionKey: this.sessionKey,
                    playerName: this.playerName,
                    isHost: this.isHost
                });
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            this.socket.onclose = () => {
                console.log('WebSocket desconectado');
                this.isConnected = false;
                this.attemptReconnect();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
            };

        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            this.fallbackToMockSocket();
        }
    }

    emit(event, data) {
        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: event,
                data: data,
                timestamp: Date.now()
            }));
        } else {
            console.log(`Mock emit - ${event}:`, data);
            // Simular respuesta para desarrollo
            setTimeout(() => this.simulateResponse(event, data), 50);
        }
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    handleMessage(message) {
        const { type, data } = message;
        if (this.callbacks[type]) {
            this.callbacks[type](data);
        }
    }

    simulateResponse(event, data) {
        // Simulaciones básicas para desarrollo local
        if (event === 'vsResult') {
            this.handleMessage({ type: 'vsResultReceived', data: data });
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Intentando reconectar... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                if (this.sessionKey) {
                    this.connect(this.lastServerUrl, {
                        sessionKey: this.sessionKey,
                        playerName: this.playerName,
                        isHost: this.isHost
                    });
                }
            }, 2000 * this.reconnectAttempts);
        }
    }

    fallbackToMockSocket() {
        console.log('Fallback a mock socket para desarrollo local');
        this.isConnected = false; // Marcar como no conectado para usar mock
    }
}

// SISTEMA DE SINCRONIZACIÓN DE ESTADOS
class GameStateManager {
    constructor() {
        this.gameState = {
            players: {
                player1: { x: 0, y: 0, lives: 3, score: 0 },
                player2: { x: 0, y: 0, lives: 3, score: 0 }
            },
            bullets: [],
            enemies: [],
            boss: null,
            level: 1,
            enemiesDestroyed: 0,
            gamePhase: 'waiting', // 'waiting', 'playing', 'gameOver', 'vsWin'
            winner: null,
            lastUpdate: 0
        };
        
        this.pendingUpdates = [];
        this.syncInterval = 100; // ms
        this.lastSyncTime = 0;
    }

    updatePlayerState(playerId, playerData) {
        this.gameState.players[playerId] = {
            ...this.gameState.players[playerId],
            ...playerData
        };
        this.gameState.lastUpdate = Date.now();
    }

    updateGameElements(elements) {
        Object.assign(this.gameState, elements);
        this.gameState.lastUpdate = Date.now();
    }

    checkVictoryConditions() {
        const p1Lives = this.gameState.players.player1.lives;
        const p2Lives = this.gameState.players.player2.lives;
        
        // Verificar si alguien perdió todas las vidas
        if (p1Lives <= 0 && p2Lives > 0) {
            this.setWinner(2, 'lives');
            return { winner: 2, reason: 'lives' };
        } else if (p2Lives <= 0 && p1Lives > 0) {
            this.setWinner(1, 'lives');
            return { winner: 1, reason: 'lives' };
        } else if (p1Lives <= 0 && p2Lives <= 0) {
            this.setWinner(0, 'draw');
            return { winner: 0, reason: 'draw' };
        }

        // Verificar si alguien derrotó al jefe final
        if (this.gameState.level === 3 && !this.gameState.boss) {
            // El jefe fue derrotado - determinar ganador por quien lo mató
            return this.gameState.winner ? 
                { winner: this.gameState.winner, reason: 'boss' } : 
                null;
        }

        return null;
    }

    setWinner(winner, reason) {
        this.gameState.winner = winner;
        this.gameState.gamePhase = 'vsWin';
        this.gameState.winReason = reason;
        console.log(`Victory: Player ${winner} wins by ${reason}`);
    }

    needsSync() {
        const now = Date.now();
        return (now - this.lastSyncTime) >= this.syncInterval;
    }

    markSynced() {
        this.lastSyncTime = Date.now();
    }
}

// INTEGRACIÓN CON EL JUEGO EXISTENTE
let gameSocket = null;
let stateManager = null;
let bothPlayersReady = false;
let waitingForOtherPlayer = true;

// Reemplazar la función initializeMultiplayer existente
function initializeMultiplayer() {
    const savedData = sessionStorage.getItem('multiplayerData');
    if (savedData) {
        multiplayerData = JSON.parse(savedData);
        isHost = multiplayerData.isHost;
        isConnected = multiplayerData.isConnected;
        
        // Inicializar sistemas de red
        gameSocket = new GameWebSocket();
        stateManager = new GameStateManager();
        
        // Configurar callbacks del socket
        setupSocketCallbacks();
        
        // Intentar conectar al servidor (o usar mock)
        const serverUrl = multiplayerData.serverUrl || 'ws://localhost:8080';
        gameSocket.connect(serverUrl, {
            sessionKey: multiplayerData.sessionKey,
            playerName: multiplayerData.playerName,
            isHost: isHost
        });
        
        sessionKey = multiplayerData.sessionKey || 'mock-session-' + Date.now();
        playerName = multiplayerData.playerName || ('Player' + (isHost ? '1' : '2'));
        
        console.log('Sistema multijugador inicializado');
        console.log('Es host:', isHost);
        console.log('Jugador:', playerName);
        
        // Esperar a que ambos jugadores estén listos
        showWaitingScreen();
        
    } else {
        console.log('Sin datos de multijugador, volviendo al menú');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }
}

function setupSocketCallbacks() {
    // Cuando ambos jugadores se conectan
    gameSocket.on('bothPlayersReady', (data) => {
        bothPlayersReady = true;
        waitingForOtherPlayer = false;
        console.log('Ambos jugadores conectados, iniciando juego');
        startMultiplayerGame();
    });

    // Recibir sincronización de estado
    gameSocket.on('gameSync', (data) => {
        receiveGameSync(data);
    });

    // Resultado de victoria
    gameSocket.on('vsResult', (data) => {
        receiveVSResult(data);
    });

    // Reinicio de juego
    gameSocket.on('gameReset', (data) => {
        resetVSGame();
    });

    // Desconexión del otro jugador
    gameSocket.on('playerDisconnected', (data) => {
        showPlayerDisconnectedMessage();
    });
}

function showWaitingScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'waitingOverlay';
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
        z-index: 1000;
        text-align: center;
    `;
    
    overlay.innerHTML = `
        <div>
            <h2 style="color: #00ffff; margin-bottom: 20px;">MODO MULTIJUGADOR VS</h2>
            <p style="font-size: 18px;">Jugador: ${playerName}</p>
            <p style="font-size: 16px;">Rol: ${isHost ? 'HOST (Jugador 1)' : 'CLIENTE (Jugador 2)'}</p>
            <p style="font-size: 16px; color: #ffff00; margin-top: 30px;">
                ${waitingForOtherPlayer ? '⏳ Esperando al otro jugador...' : '✅ Ambos jugadores conectados'}
            </p>
            <div style="margin-top: 30px;">
                <div style="color: #00ff00;">🎮 CONTROLES:</div>
                <p>Jugador 1: ← → para mover, ESPACIO para disparar</p>
                <p>Jugador 2: A D para mover, W para disparar</p>
            </div>
            <div style="margin-top: 20px; color: #ff6600;">
                <strong>OBJETIVO:</strong><br>
                Derrota al jefe final o sobrevive más que tu oponente
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function startMultiplayerGame() {
    const overlay = document.getElementById('waitingOverlay');
    if (overlay) {
        overlay.innerHTML = `
            <div style="text-align: center;">
                <h2 style="color: #00ff00;">¡LISTOS PARA BATALLAR!</h2>
                <p style="font-size: 24px; color: #ffff00;">El juego comenzará en 3 segundos...</p>
            </div>
        `;
        
        setTimeout(() => {
            document.body.removeChild(overlay);
            gameState = 'playing';
            // Sincronizar estado inicial
            if (isHost) {
                syncGameState();
            }
        }, 3000);
    }
}

// NUEVAS FUNCIONES DE SINCRONIZACIÓN

function syncGameState() {
    if (!isHost || !stateManager.needsSync()) return;
    
    // Actualizar estado del manager
    stateManager.updatePlayerState('player1', {
        x: player1.x,
        y: player1.y,
        lives: player1.lives
    });
    
    stateManager.updatePlayerState('player2', {
        x: player2.x,
        y: player2.y,
        lives: player2.lives
    });
    
    stateManager.updateGameElements({
        bullets: bullets.map(b => ({
            x: b.x,
            y: b.y,
            player: b.player,
            size: b.size,
            speed: b.speed
        })),
        enemies: enemies.map(e => ({
            x: e.x,
            y: e.y,
            hp: e.hp,
            state: e.state || 'normal',
            type: e.type
        })),
        boss: boss ? {
            x: boss.x,
            y: boss.y,
            hp: boss.hp,
            maxHp: boss.maxHp,
            state: boss.state
        } : null,
        level: currentLevel,
        enemiesDestroyed: enemiesDestroyed,
        score: score
    });
    
    // Verificar condiciones de victoria
    const victoryCheck = stateManager.checkVictoryConditions();
    if (victoryCheck) {
        handleVictory(victoryCheck.winner, victoryCheck.reason);
    }
    
    // Enviar sincronización
    gameSocket.emit('gameSync', stateManager.gameState);
    stateManager.markSynced();
}

function receiveGameSync(data) {
    if (isHost) return; // El host no recibe, solo envía
    
    // Actualizar jugadores (pero no el propio)
    if (data.players) {
        if (!isHost && data.players.player1) {
            player1.x = data.players.player1.x;
            player1.y = data.players.player1.y;
            player1.lives = data.players.player1.lives;
        }
        if (isHost && data.players.player2) {
            player2.x = data.players.player2.x;
            player2.y = data.players.player2.y;
            player2.lives = data.players.player2.lives;
        }
    }
    
    // Sincronizar elementos del juego
    if (data.bullets) {
        bullets = data.bullets;
    }
    
    if (data.enemies) {
        // Actualizar enemigos existentes o crear nuevos si es necesario
        while (enemies.length < data.enemies.length) {
            enemies.push({});
        }
        while (enemies.length > data.enemies.length) {
            enemies.pop();
        }
        
        for (let i = 0; i < data.enemies.length; i++) {
            Object.assign(enemies[i], data.enemies[i]);
        }
    }
    
    if (data.boss !== undefined) {
        if (data.boss === null) {
            boss = null;
        } else if (boss) {
            Object.assign(boss, data.boss);
        }
    }
    
    // Sincronizar estado del juego
    if (data.level !== currentLevel) {
        currentLevel = data.level;
    }
    
    if (data.enemiesDestroyed !== undefined) {
        enemiesDestroyed = data.enemiesDestroyed;
    }
    
    if (data.score !== undefined) {
        score = data.score;
    }
    
    // Verificar estado de victoria
    if (data.winner !== undefined && data.winner !== gameWinner) {
        gameWinner = data.winner;
        gameState = 'vsWin';
    }
}

function handleVictory(winner, reason) {
    gameWinner = winner;
    gameState = 'vsWin';
    
    // Enviar resultado a ambos jugadores
    const resultData = {
        type: 'vsGameEnd',
        winner: winner,
        reason: reason,
        sessionKey: sessionKey,
        playerName: playerName,
        isHost: isHost,
        timestamp: Date.now(),
        finalStats: {
            player1Lives: player1.lives,
            player2Lives: player2.lives,
            level: currentLevel,
            score: score
        }
    };
    
    gameSocket.emit('vsResult', resultData);
    
    // Detener música
    if (backgroundMusic && backgroundMusic.isPlaying && backgroundMusic.isPlaying()) {
        backgroundMusic.pause();
    }
}

function receiveVSResult(data) {
    gameWinner = data.winner;
    gameState = 'vsWin';
    
    // Actualizar estados de victoria
    playerWinState.player1Won = (data.winner === 1);
    playerWinState.player2Won = (data.winner === 2);
    
    console.log(`Resultado VS recibido: Jugador ${data.winner} gana por ${data.reason}`);
}

// FUNCIONES ACTUALIZADAS DE VERIFICACIÓN

function checkVSGameEnd() {
    if (!bothPlayersReady) return;
    
    // Solo el host verifica las condiciones de fin
    if (!isHost) return;
    
    let winner = null;
    let reason = '';
    
    // Verificar vidas
    if (player1.lives <= 0 && player2.lives > 0) {
        winner = 2;
        reason = 'lives';
    } else if (player2.lives <= 0 && player1.lives > 0) {
        winner = 1;
        reason = 'lives';
    } else if (player1.lives <= 0 && player2.lives <= 0) {
        winner = 0; // Empate
        reason = 'draw';
    }
    
    if (winner !== null) {
        handleVictory(winner, reason);
    }
}

// Actualizar función de reset
function resetVSGame() {
    // Reiniciar estados
    gameWinner = null;
    playerWinState.player1Won = false;
    playerWinState.player2Won = false;
    
    // Reiniciar jugadores
    player1.lives = 3;
    player2.lives = 3;
    player1.x = width / 3;
    player1.y = height - 50;
    player2.x = (width * 2) / 3;
    player2.y = height - 50;
    
    // Reiniciar juego
    score = 0;
    enemiesDestroyed = 0;
    currentLevel = 1;
    gameState = 'playing';
    bullets = [];
    enemyBullets = [];
    boss = null;
    
    createEnemies();
    levelStartTime = millis();
    
    // Sincronizar reset
    if (isHost) {
        gameSocket.emit('gameReset', {
            sessionKey: sessionKey,
            timestamp: Date.now()
        });
    }
    
    console.log('Juego reiniciado');
}

// ACTUALIZAR LA FUNCIÓN updateGame PRINCIPAL
// Agregar al final de updateGame():
function updateGame() {
    // ... código existente ...
    
    // NUEVA LÍNEA: Sincronizar estado si es host
    if (isHost && bothPlayersReady) {
        syncGameState();
    }
    
    // NUEVA LÍNEA: Verificar condiciones VS
    if (bothPlayersReady) {
        checkVSGameEnd();
    }
}

// NUEVA FUNCIÓN drawVSWin MEJORADA
function drawVSWin() {
    drawSpaceBackground();
    
    fill(0, 0, 0, 200);
    noStroke();
    rect(0, 0, width, height);
    
    textAlign(CENTER);
    textSize(48);
    
    if (gameWinner === 0) {
        fill(255, 255, 0);
        text("¡EMPATE!", width/2, height/2 - 100);
        fill(255);
        textSize(24);
        text("Ambos jugadores fueron derrotados", width/2, height/2 - 50);
    } else {
        let winColor = gameWinner === 1 ? colors.cyan : colors.green;
        fill(...winColor);
        text(`¡JUGADOR ${gameWinner} GANA!`, width/2, height/2 - 100);
        
        fill(255);
        textSize(24);
        // Mostrar razón de victoria SIN redundancia
        if (stateManager && stateManager.gameState.winReason === 'boss') {
            text(`Derrotó al jefe final`, width/2, height/2 - 50);
        } else if (stateManager && stateManager.gameState.winReason === 'lives') {
            text(`El oponente perdió todas las vidas`, width/2, height/2 - 50);
        }
    }
    
    // Estadísticas finales
    fill(255);
    textSize(18);
    text(`Score Final: ${score}`, width/2, height/2);
    text(`Nivel Alcanzado: ${currentLevel}`, width/2, height/2 + 25);
    textSize(16);
    text(`P1 Vidas: ${player1.lives} | P2 Vidas: ${player2.lives}`, width/2, height/2 + 55);
    
    // Controles
    fill(colors.yellow);
    textSize(18);
    text("Presiona R para nueva partida", width/2, height/2 + 100);
    text("Presiona ESC para volver al menú", width/2, height/2 + 125);
}

function showPlayerDisconnectedMessage() {
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
        z-index: 1000;
        text-align: center;
    `;
    
    overlay.innerHTML = `
        <div>
            <h2 style="color: #ff0000;">JUGADOR DESCONECTADO</h2>
            <p>El otro jugador se ha desconectado de la partida</p>
            <p style="margin-top: 20px;">
                <button onclick="returnToMenu()" style="padding: 10px 20px; font-size: 16px;">
                    Volver al Menú
                </button>
            </p>
        </div>
    `;
    
    document.body.appendChild(overlay);
    gameState = 'gameOver';
}

// EXPORTAR PARA USO EN connection.js
window.GameWebSocket = GameWebSocket;
window.GameStateManager = GameStateManager;

