let bullets = [];
let enemies = [];
let enemyBullets = [];
let player1, player2;
let lives1 = 3, lives2 = 3;
let score = 0;
let enemiesDestroyed = 0;
let totalEnemies = 20;
let currentLevel = 1;
let lastEnemyShot = 0;
let boss = null;
let levelStartTime = 0;
let shootSound;
let enemyShootSound;
let bossShootSound;
let backgroundMusic;
let musicStarted = false;
let isWebRTCHost = false;
let webrtcInitialized = false;


let peerConnection = null;
let dataChannel = null;
let localStream = null;
let remoteInputs = { left: false, right: false, shoot: false };
let lastRemoteInputs = { left: false, right: false, shoot: false };

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};



let stars = [];
let titleColor = 0;

const colors = {
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    white: [255, 255, 255],
    red: [255, 100, 100],
    blue: [100, 150, 255],
    green: [100, 255, 150]
};

function setup() {
    createCanvas(800, 900);
    gameState = 'playing';

    //  estrellas para el fondo
    for (let i = 0; i < 150; i++) {
        stars.push({
            x: random(width),
            y: random(height),
            size: random(1, 4),
            speed: random(0.3, 1.5),
            brightness: random(100, 255)
        });
    }

    // jugador
    player1 = {
        x: width / 3,
        y: height - 50,
        size: 30,
        speed: 5
    };
    
    player2 = {
        x: (width * 2) / 3,
        y: height - 50,
        size: 30,
        speed: 5
    };
    
    // enemigos del nivel actual
    createEnemies();
    levelStartTime = millis();
    shootSound = createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMZBTOH0fPTgjAFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMZBTOH0fPTgjAF');
    enemyShootSound = createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMZBTOH0fPTgjAFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMZBTOH0fPTgjAF');
    bossShootSound = createAudio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMZBTOH0fPTgjAFJHfH8N2QQAoUXrTp66hVFApGn+DyvmMZBTOH0fPTgjAF');

    // Música de fondo
    backgroundMusic = createAudio('Galaga_Medley_(Ultimate).mp3');
    backgroundMusic.volume(0.1);

    initializeMultiplayer();

}

function initializeMultiplayer() {
    const multiplayerData = sessionStorage.getItem('multiplayerData');
    if (multiplayerData) {
        const data = JSON.parse(multiplayerData);
        if (data.isHost && data.isConnected) {
            isWebRTCHost = true;
            setTimeout(initWebRTCConnection, 1000);
        }
    }
}

async function initWebRTCConnection() {
    if (!webrtcInitialized) {
        const result = await initWebRTCHost();
        if (result.success) {
            webrtcInitialized = true;
            console.log('WebRTC inicializado como host');
            console.log('Comparte esta oferta con el cliente:');
            console.log(JSON.stringify(result.offer));
            
            // Mostrar UI para compartir oferta
            showWebRTCSetup(result.offer);
        } else {
            console.error('Error inicializando WebRTC:', result.error);
        }
    }
}

async function initWebRTCHost() {
    try {
        console.log('Inicializando WebRTC como host...');
        
        // Crear conexión peer
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Configurar eventos importantes ANTES de crear el canal de datos
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate generado');
            } else {
                console.log('Recolección de ICE candidates completada');
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Estado de conexión:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                console.log('¡Conexión WebRTC establecida exitosamente!');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('Estado ICE:', peerConnection.iceConnectionState);
        };
        
        // IMPORTANTE: Agregar el evento ondatachannel
        peerConnection.ondatachannel = (event) => {
            console.log('Canal de datos recibido del cliente');
            const channel = event.channel;
            
            channel.onopen = () => {
                console.log('Canal de datos del cliente abierto - Listo para recibir inputs');
            };
            
            channel.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'input') {
                        lastRemoteInputs = { ...remoteInputs };
                        remoteInputs = message.inputs;
                    }
                } catch (error) {
                    console.error('Error procesando mensaje del cliente:', error);
                }
            };
            
            channel.onerror = (error) => {
                console.error('Error en canal de datos del cliente:', error);
            };
        };
        
        // Crear canal de datos para comunicación
        dataChannel = peerConnection.createDataChannel('gameInputs', {
            ordered: true
        });
        
        dataChannel.onopen = () => {
            console.log('Canal de datos del host abierto');
        };
        
        dataChannel.onerror = (error) => {
            console.error('Error en canal de datos del host:', error);
        };
        
        // Capturar el stream del canvas
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const canvas = document.querySelector('canvas');
        if (!canvas) {
            throw new Error('Canvas no encontrado');
        }

        try {
            localStream = canvas.captureStream(30);
            console.log('Stream capturado del canvas');
            
            if (localStream.getTracks().length === 0) {
                throw new Error('No se pudieron obtener tracks del canvas');
            }
            
            localStream.getTracks().forEach(track => {
                console.log('Agregando track:', track.kind);
                peerConnection.addTrack(track, localStream);
            });
            
        } catch (streamError) {
            console.error('Error capturando stream:', streamError);
            throw streamError;
        }
        
        // Crear oferta
        const offer = await peerConnection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false
        });
        
        await peerConnection.setLocalDescription(offer);
        
        // Esperar ICE candidates
        await new Promise((resolve) => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const timeout = setTimeout(() => {
                    console.log('Timeout esperando ICE candidates, continuando...');
                    resolve();
                }, 5000);
                
                peerConnection.addEventListener('icegatheringstatechange', () => {
                    if (peerConnection.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            }
        });
        
        return {
            success: true,
            offer: peerConnection.localDescription
        };
        
    } catch (error) {
        console.error('Error inicializando WebRTC:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

function showWebRTCSetup(offer) {
    const setupDiv = document.createElement('div');
    setupDiv.id = 'webrtc-setup';
    setupDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid #00ffff;
        border-radius: 10px;
        padding: 20px;
        z-index: 1000;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        color: white;
        font-family: 'Courier New', monospace;
    `;
    
    setupDiv.innerHTML = `
        <h3 style="color: #00ffff; margin-top: 0;">🚀 Configuración WebRTC - HOST</h3>
        <p><strong>Paso 1:</strong> Comparte esta oferta con el cliente:</p>
        <textarea readonly id="offer-text" style="width: 100%; height: 120px; background: #111; color: #00ff00; border: 1px solid #666; padding: 10px; font-family: monospace; font-size: 11px;">${JSON.stringify(offer)}</textarea>
        <button onclick="copyOffer()" style="background: #ff6b35; border: none; color: white; padding: 8px 16px; margin: 5px; border-radius: 5px; cursor: pointer;">📋 Copiar Oferta</button>
        <br><br>
        <p><strong>Paso 2:</strong> Pega aquí la respuesta del cliente:</p>
        <textarea id="client-answer" placeholder="Pega la respuesta JSON del cliente aquí..." style="width: 100%; height: 120px; background: #111; color: #ffff00; border: 1px solid #666; padding: 10px; font-family: monospace; font-size: 11px;"></textarea>
        <br>
        <button onclick="processAnswer()" style="background: #00ff00; color: black; border: none; padding: 10px 20px; margin: 5px; border-radius: 5px; cursor: pointer; font-weight: bold;">🔗 Conectar</button>
        <button onclick="closeWebRTCSetup()" style="background: #666; border: none; color: white; padding: 8px 16px; margin: 5px; border-radius: 5px; cursor: pointer;">❌ Cancelar</button>
        <div id="connection-status" style="margin-top: 15px; padding: 10px; background: #333; border-radius: 5px; display: none;">
            <p style="margin: 0; color: #ffff00;">🔄 Estado de conexión: <span id="status-text">Esperando...</span></p>
        </div>
    `;
    
    document.body.appendChild(setupDiv);
}

async function processAnswer() {
    const answerText = document.getElementById('client-answer').value.trim();
    if (!answerText) {
        alert('❌ Debes pegar la respuesta del cliente');
        return;
    }
    
    // Mostrar estado de conexión
    const statusDiv = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    statusDiv.style.display = 'block';
    statusText.textContent = 'Procesando respuesta...';
    
    try {
        const answer = JSON.parse(answerText);
        const result = await processClientAnswer(answer);
        if (result.success) {
            statusText.textContent = 'Conexión establecida ✅';
            statusText.style.color = '#00ff00';
            
            setTimeout(() => {
                alert('🎮 ¡Conexión establecida! El cliente debería ver el juego ahora.');
                closeWebRTCSetup();
            }, 1000);
        } else {
            statusText.textContent = 'Error: ' + result.error;
            statusText.style.color = '#ff0000';
        }
    } catch (error) {
        statusText.textContent = 'Error: Respuesta JSON inválida';
        statusText.style.color = '#ff0000';
        console.error('Error parsing JSON:', error);
    }
}

async function processClientAnswer(answer) {
    try {
        console.log('Procesando respuesta del cliente...');
        
        if (!peerConnection) {
            throw new Error('Conexión peer no existe');
        }
        
        if (!answer || !answer.type || answer.type !== 'answer') {
            throw new Error('Respuesta inválida del cliente');
        }
        
        // Verificar estado antes de procesar
        if (peerConnection.signalingState !== 'have-local-offer') {
            throw new Error(`Estado incorrecto: ${peerConnection.signalingState}`);
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Respuesta del cliente procesada exitosamente');
        
        // Esperar a que se establezca la conexión
        return new Promise((resolve) => {
            const checkConnection = () => {
                console.log('Estado de conexión:', peerConnection.connectionState);
                console.log('Estado ICE:', peerConnection.iceConnectionState);
                
                if (peerConnection.connectionState === 'connected') {
                    resolve({ success: true });
                } else if (peerConnection.connectionState === 'failed') {
                    resolve({ success: false, error: 'Conexión fallida' });
                } else {
                    // Seguir verificando
                    setTimeout(checkConnection, 1000);
                }
            };
            
            checkConnection();
            
            // Timeout después de 10 segundos
            setTimeout(() => {
                if (peerConnection.connectionState !== 'connected') {
                    resolve({ 
                        success: false, 
                        error: 'Timeout en conexión' 
                    });
                }
            }, 10000);
        });
        
    } catch (error) {
        console.error('Error procesando respuesta:', error);
        return {
            success: false,
            error: error.message
        };
    }
}


function closeWebRTCSetup() {
    const setupDiv = document.getElementById('webrtc-setup');
    if (setupDiv) {
        setupDiv.remove();
    }
}

function draw() {
    // Fondo espacial con degradado
    drawSpaceBackground();
    
    if (gameState === 'playing') {
        updateGame();
        drawGame();
    } else if (gameState === 'gameOver') {
        drawGameOver();
    } else if (gameState === 'levelComplete') {
        drawLevelComplete();
    }
}

function drawSpaceBackground() {
    // Degradado de fondo
    for (let i = 0; i <= height; i++) {
        let inter = map(i, 0, height, 0, 1);
        let c = lerpColor(color(10, 10, 30), color(0, 0, 15), inter);
        stroke(c);
        line(0, i, width, i);
    }
    
    // Dibujar estrellas en movimiento
    fill(255);
    noStroke();
    
    for (let star of stars) {
        fill(255, star.brightness);
        circle(star.x, star.y, star.size);
        star.y += star.speed;
        
        // Algunas estrellas parpadean
        if (random() < 0.01) {
            star.brightness = random(100, 255);
        }
        
        if (star.y > height) {
            star.y = 0;
            star.x = random(width);
        }
    }
}

//enemigos por nivel
function createEnemies() {
    enemies = [];
    enemyBullets = [];
    boss = null;
    
    if (currentLevel === 1) {
        // Nivel 1: enemigos normales
        for (let i = 0; i < totalEnemies; i++) {
            enemies.push({
                x: 50 + (i % 5) * 140,
                y: -50 - Math.floor(i / 5) * 80,
                size: 25,
                speed: 1,
                hp: 1,
                maxHp: 1,
                zigzagOffset: 0,
                canShoot: false,
                type: 'normal',
                state: 'descending'
            });
        }
    } else if (currentLevel === 2) {
        // Nivel 2: enemigos con zigzag y algunos que disparan
        totalEnemies = 20;
        for (let i = 0; i < totalEnemies; i++) {
            let canShoot = Math.random() < 0.4; // 40% de enemigos disparan
            let isResistant = i < 3; 
            
            enemies.push({
                x: 50 + (i % 5) * 140,
                y: -50 - Math.floor(i / 5) * 80,
                size: isResistant ? 35 : 25,
                speed: 1,
                hp: isResistant ? 3 : 1,
                maxHp: isResistant ? 3 : 1,
                zigzagOffset: Math.random() * Math.PI * 2,
                canShoot: canShoot,
                type: isResistant ? 'resistant' : 'normal',
                lastShot: 0,
                state: 'descending'
            });
        }
        //nivel 3
    } else if (currentLevel === 3){
        totalEnemies = 40;

        //enemigos con distintos estados y patrones

        for (let i = 0; i < totalEnemies; i++){
            let isResistant = i < 15; 
            let targetRow = Math.floor(i/4);
            let targetCol = i % 4;

            let targetX = 100 + targetCol * 150;
            let targetY = 80 + targetRow * 60;

            let appearSide = Math.random() < 0.5 ? 'left' : 'right';
            let startX = appearSide === 'left' ? -50 : width + 50;

            enemies.push({
                x: startX,
                y: Math.random() * 200 + 50,
                targetX: targetX,
                targetY: targetY,
                size: isResistant ? 35 : 28,
                speed: 2,
                hp: isResistant ? 3 : 1,
                maxHp: isResistant ? 3 : 1,
                canShoot: true,
                type: isResistant ? 'resistant' : 'galaga',
                lastShot: 0,
                state: 'entering', // 'entering', 'circling', 'formation', 'attacking'

                //patron circular
                circlePhase: Math.random() * Math.PI * 2,
                circleRadius: 80 + Math.random()*40,
                circleSpeed: 0.08,
                circleCenterX: width/2,
                circleCenterY: 200,

                enterTime: millis() + i *500,
                circleTime: 0,
                formationTime: 0,

                nextAttackTime: millis() + Math.random() * 5000 + 3000
            });
        }

        setTimeout(()=>{
            if (currentLevel === 3 && gameState === 'playing'){
                createBoss();
            }
        },10000); //hace que el jefe aparezca en 10 segundos
    }
}

function createBoss(){
    boss = {
        x: width / 2,
        y: -100,
        size: 80,
        speed: 3,
        hp: 50,
        maxHp: 50,
        canShoot: true,
        type: 'boss',
        lastShot: 0,
        state: 'entering',

        //movimiento del jefe

        movePattern: 0,
        moveTimer: 0,
        targetX: width /2,

        //ataque especial
        specialAttackTimer: 0,
        isCharging: false
    };
}

function updateGalagaEnemy(enemy){
    let currentTime = millis();

    switch (enemy.state){
        case 'entering':
            if (currentTime > enemy.enterTime) {
                let dx = enemy.circleCenterX - enemy.x;
                let dy = enemy.circleCenterY - enemy.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist > 10) {
                    enemy.x += (dx / dist) * enemy.speed;
                    enemy.y += (dy / dist) * enemy.speed;
                } else {
                    enemy.state = 'circling';           
                    enemy.circleTime = currentTime;
                }
            }
            break;
        
        case 'circling':
            //formacion ciruclar
            enemy.circlePhase += enemy.circleSpeed;
            enemy.x = enemy.circleCenterX + Math.cos(enemy.circlePhase) * enemy.circleRadius;
            enemy.y = enemy.circleCenterY + Math.sin(enemy.circlePhase) * enemy.circleRadius * 0.6;
            //manda a los enemigos a formacion despues de 2a 4 segundos
            if (currentTime - enemy.circleTime > 2000 + Math.random() * 2000){
                enemy.state = 'formation';
                enemy.formationTime = currentTime;
            }
            break;

        case 'formation':
            let dx = enemy.targetX - enemy.x;
            let dy = enemy.targetY - enemy.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            if (dist > 5){
                enemy.x += (dx/dist)*enemy.speed;
                enemy.y += (dy/dist)*enemy.speed;
            } else {
                enemy.state = 'inFormation';
            }
        break;

        case 'inFormation':

            enemy.y += 0.5;
            enemy.x += Math.sin(currentTime * 0.002 + enemy.circlePhase) * 0.5;

            if (currentTime > enemy.nextAttackTime){
                if (Math.random() < 0.3){
                    enemy.state = 'attacking';
                    enemy.attackStartTime = currentTime;
                }
                enemy.nextAttackTime = currentTime + Math.random()*8000 + 5000;
            }
            //hace que disparen regularmente
            if (enemy.canShoot && currentTime - enemy.lastShot > 1500 + Math.random() * 1000) {
                enemyBullets.push({
                    x: enemy.x,
                    y: enemy.y + enemy.size/2,
                    size: 5,
                    speed: 4
                });
                enemy.lastShot = currentTime;
                enemyShootSound.play();
                }
        break;
        
        case 'attacking':
            let targetPlayer = null;
            let minDist = Infinity;
            
            if (lives1 > 0) {
                let dist1 = Math.sqrt((player1.x - enemy.x)**2 + (player1.y - enemy.y)**2);
                if (dist1 < minDist) {
                    minDist = dist1;
                    targetPlayer = player1;
                }
            }
            
            if (lives2 > 0) {
                let dist2 = Math.sqrt((player2.x - enemy.x)**2 + (player2.y - enemy.y)**2);
                if (dist2 < minDist) {
                    minDist = dist2;
                    targetPlayer = player2;
                }
            }
            
            if (targetPlayer && minDist > 20) {
                let playerDx = targetPlayer.x - enemy.x;
                let playerDy = targetPlayer.y - enemy.y;
                let playerDist = Math.sqrt(playerDx*playerDx + playerDy*playerDy);
                
                enemy.x += (playerDx / playerDist) * (enemy.speed * 2);
                enemy.y += (playerDy / playerDist) * (enemy.speed * 2);
            }
        
            if (currentTime - enemy.attackStartTime > 3000){
                enemy.state = 'formation';
            }
        break;
    }    
}

function updateBoss(){
    let currentTime = millis();

    switch (boss.state){
        case 'entering':
            boss.y += boss.speed;
            if (boss.y >= 100){
                boss.state = 'active';
                boss.y = 100;
            }
            break;

        case 'active':
            //patron de movimiento para el jefe

            boss.moveTimer += 1;

            if (boss.moveTimer % 120 === 0){
                boss.movePattern = (boss.movePattern + 1)%3;
                boss.targetX = 100 + Math.random()*(width - 200);
            }
            //movimiento al objetivo
            let dx = boss.targetX - boss.x;
            if (Math.abs(dx) > 5){
                boss.x += dx > 0 ? boss.speed : -boss.speed;
            }
            //patrones de disparo
            if (currentTime - boss.lastShot > 800){
                //diparo triple
                for (let angle = -0.3; angle <= 0.3; angle += 0.3){
                    enemyBullets.push({
                        x: boss.x + Math.sin(angle) * 30,
                        y: boss.y + boss.size/2,
                        size: 6,
                        speed: 5,
                        vx: Math.sin(angle)*2,
                        vy: 5
                    });
                }
                bossShootSound.play();
                boss.lastShot = currentTime;
            }

            if (currentTime - boss.specialAttackTimer > 5000){
                bossSpecialAttack();
                boss.specialAttackTimer = currentTime;
            }
            break;
    }
    
    for (let i = enemyBullets.length - 1; i >= 0; i--){
        let bullet = enemyBullets[i];
        if (bullet.vx !== undefined){
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
        }
    }
    //colision del jefe con el jugador
    if (collision(boss, player1)){
        lives1 -= 2;
    } else if (collision(boss, player2)){
        lives2 -= 2;
    }
    if (lives1 <= 0 && lives2 <= 0){
        gameState = 'gameOver';
    }
}

function bossSpecialAttack(){
    //ataque espiral
    for (let i = 0; i < 8; i++){
        let angle = (i/8)*Math.PI * 2;
        enemyBullets.push({
            x:boss.x,
            y:boss.y + boss.size/2,
            size: 8,
            speed: 3,
            vx: Math.cos(angle)*3,
            vy: Math.sin(angle)*3 + 2
        });
    }
    bossShootSound.play();

}

function getRemoteInputs() {
    return remoteInputs;
}


let lastRemoteShootState = false;

function wasShootPressed() {
    const currentShoot = remoteInputs.shoot;
    const wasPressed = currentShoot && !lastRemoteShootState;
    lastRemoteShootState = currentShoot;
    return wasPressed;
}

function copyOffer() {
    const setupDiv = document.getElementById('webrtc-setup');
    const textarea = setupDiv.querySelector('textarea');
    textarea.select();
    document.execCommand('copy');
    alert('Oferta copiada al portapapeles');
}



function updateGame() {
    // Jugador 1 - Flechas
    if (keyIsDown(LEFT_ARROW) && player1.x > player1.size/2) {
        player1.x -= player1.speed;
    }
    if (keyIsDown(RIGHT_ARROW) && player1.x < width - player1.size/2) {
        player1.x += player1.speed;
    }

    // Jugador 2 - A/D
    if (isWebRTCHost && webrtcInitialized) {
        // Usar inputs del cliente remoto
        const remoteInputs = getRemoteInputs();
        if (remoteInputs.left && player2.x > player2.size/2) {
            player2.x -= player2.speed;
        }
        if (remoteInputs.right && player2.x < width - player2.size/2) {
            player2.x += player2.speed;
        }
    } else {
        // Controles locales normales
        if ((keyIsDown(65) || keyIsDown(97)) && player2.x > player2.size/2) { // A
            player2.x -= player2.speed;
        }
        if ((keyIsDown(68) || keyIsDown(100)) && player2.x < width - player2.size/2) { // D
            player2.x += player2.speed;
        }
    }
    
    // Actualizar balas del jugador
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bullets[i].speed;
        
        // Eliminar balas que salen de pantalla
        if (bullets[i].y < 0) {
            bullets.splice(i, 1);
            continue;
        }
        
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (collision(bullets[i], enemies[j])) {
                bullets.splice(i, 1);
                enemies[j].hp--;
                
                if (enemies[j].hp <= 0) {
                    let points = 10;
                    if (enemies[j].type === 'resistant') points = 30;
                    else if (enemies[j].type === 'galaga') points = 20;
                    
                    score += points;
                    enemies.splice(j, 1);
                    enemiesDestroyed++;
                }
                break;
            }
        }

        if (i >= bullets.length) continue;

        //colision de balas con jefe
        if (boss && collision(bullets[i],boss)){
            bullets.splice(i,1);
            boss.hp--;

            if (boss.hp <= 0){
                score += 100;
                boss = null;

                if (enemies.length === 0){
                    gameState = 'levelComplete';
                }
            }
        }
    }
    
    // Actualizar balas enemigas (solo nivel 2)
    if (currentLevel >= 2) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            enemyBullets[i].y += enemyBullets[i].speed;
            
            // Eliminar balas que salen de pantalla
            if (enemyBullets[i].y > height) {
                enemyBullets.splice(i, 1);
                continue;
            }
            
            // Colision bala enemiga-jugador
            if (collision(enemyBullets[i], player1)) {
                enemyBullets.splice(i, 1);
                lives1--;
            } else if (collision(enemyBullets[i], player2)) {
                enemyBullets.splice(i, 1);
                lives2--;
            }
            
            if (lives1 <= 0 && lives2 <= 0) {
                gameState = 'gameOver';
            }
        }
    }

    updateEnemies();
    handleRemoteShooting();

    if (boss){
        updateBoss();
    }

    if (enemies.length === 0 && !boss){
        gameState = 'levelComplete';
    }
}

//actualiza enemigos
function updateEnemies(){    
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        
        if (currentLevel === 1) {
            // Movimiento simple nivel 1
            enemy.y += enemy.speed;
        } else if (currentLevel === 2) {
            // Movimiento zigzag nivel 2
            enemy.y += enemy.speed;
            enemy.zigzagOffset += 0.1;
            enemy.x += Math.sin(enemy.zigzagOffset) * 2;
            
            // Disparar si puede y está en rango
            if (enemy.canShoot && enemy.y > 0 && enemy.y < height - 100) {
                if (millis() - enemy.lastShot > 2000 + Math.random() * 1000) {
                    enemyBullets.push({
                        x: enemy.x,
                        y: enemy.y + enemy.size/2,
                        size: 4,
                        speed: 3
                    });
                    enemy.lastShot = millis();
                }
            }
        } else if (currentLevel === 3){
            //patrones de movimiento en nivel 3
            updateGalagaEnemy(enemy);
        }
        
        // Colision enemigo-jugador
        if (collision(enemy, player1)) {
            enemies.splice(i, 1);
            lives1--;
        } else if (collision(enemy, player2)) {
            enemies.splice(i, 1);
            lives2--;
        }
        
        if (lives1 <= 0 && lives2 <= 0) {
            gameState = 'gameOver';
        }
        
        // Enemigo llega al fondo
        if (enemy.y > height) {
            enemies.splice(i, 1);
            lives1--;
            lives2--;

            if (lives1 <= 0 && lives2 <= 0) {
                gameState = 'gameOver';
            }
        }
    }
}

function drawGame() {
    drawPlayers();
    
    drawPlayerBullets();
    
    drawEnemyBullets();
    
    // dibuja enemigos
    for (let enemy of enemies) {
        drawEnemy(enemy);
    }
    
    if (boss) {
        drawBoss();
    }
    
    // Dibujar UI
    drawUI();
}

function drawSinglePlayer(player, playerColor) {
    push();
    translate(player.x, player.y);
    
    // Cuerpo principal de la nave
    fill(...playerColor);
    stroke(...colors.cyan);
    strokeWeight(2);
    
    // forma de nave espacial
    beginShape();
    vertex(0, -player.size/2);          
    vertex(-player.size/3, player.size/4); 
    vertex(-player.size/2, player.size/2);
    vertex(player.size/2, player.size/2);  
    vertex(player.size/3, player.size/4); 
    endShape(CLOSE);
    
    fill(...colors.cyan);
    noStroke();
    ellipse(0, 0, 8, 8); //cabinita
    
    fill(...colors.yellow);
    rect(-player.size/4, player.size/3, 4, 8);
    rect(player.size/4 - 4, player.size/3, 4, 8);
    
    pop();
}

function drawPlayers() {
    // Jugador 1
    if (lives1 > 0) {
        drawSinglePlayer(player1, colors.blue);
    }
    
    // Jugador 2
    if (lives2 > 0) {
        drawSinglePlayer(player2, colors.green);
    }
}

function drawPlayerBullets() {
    for (let bullet of bullets) {
        push();
        translate(bullet.x, bullet.y);
        
        fill(...colors.yellow, 150);
        noStroke();
        ellipse(0, 0, bullet.size * 2, bullet.size * 4);
        
        fill(...colors.yellow);
        ellipse(0, 0, bullet.size, bullet.size * 2);
        
        pop();
    }
}

function drawEnemyBullets() {
    for (let bullet of enemyBullets) {
        push();
        translate(bullet.x, bullet.y);
        
        fill(255, 100, 255, 100);
        noStroke();
        ellipse(0, 0, bullet.size * 2);
        
        fill(255, 100, 255);
        ellipse(0, 0, bullet.size);
        
        pop();
    }
}

function drawEnemy(enemy) {
    push();
    translate(enemy.x, enemy.y);
    
    // color en base del tipo de enemigo
    if (enemy.type === 'resistant') {
        let healthRatio = enemy.hp / enemy.maxHp;
        fill(255, 100 * healthRatio, 100 * healthRatio);
        stroke(255, 50, 50);
    } else if (enemy.type === 'galaga') {
        if (enemy.state === 'attacking') {
            fill(...colors.yellow);
            stroke(...colors.red);
        } else {
            fill(...colors.green);
            stroke(...colors.cyan);
        }
    } else if (enemy.canShoot) {
        fill(255, 150, 50);
        stroke(255, 200, 100);
    } else {
        fill(...colors.red);
        stroke(255, 150, 150);
    }
    
    strokeWeight(2);
    
    if (currentLevel === 3) {
        drawSpaceship(enemy.size/2, enemy.type === 'galaga');
    } else if (currentLevel === 2) {
        drawRoboticEnemy(enemy.size/2);
    } else {
        drawBasicEnemy(enemy.size/2);
    }
    
    // indicador de vida de enemigos
    if (enemy.type === 'resistant' && enemy.hp > 1) {
        fill(255);
        noStroke();
        textAlign(CENTER);
        textSize(10);
        text(enemy.hp, 0, enemy.size/2 + 15);
    }
    
    pop();
}

function drawBasicEnemy(size) {
    beginShape();
    vertex(0, -size);
    vertex(size, 0);
    vertex(0, size);
    vertex(-size, 0);
    endShape(CLOSE);
    
    fill(255, 150);
    noStroke();
    ellipse(0, 0, size/2);
}

//enemigo cuadrado que dispara
function drawRoboticEnemy(size) {
    rect(-size, -size, size*2, size*2);
    
    fill(255);
    noStroke();
    rect(-size/2, -size/2, size, size/4);
    rect(-size/4, -size/3, size/2, size/6);
    
    fill(255, 0, 0);
    ellipse(-size/3, -size/4, 4);
    ellipse(size/3, -size/4, 4);
}

function drawSpaceship(size, isGalaga) {
    if (isGalaga) {
        beginShape();
        vertex(0, -size);
        vertex(size*0.8, -size*0.3);
        vertex(size, size*0.5);
        vertex(size*0.6, size);
        vertex(-size*0.6, size);
        vertex(-size, size*0.5);
        vertex(-size*0.8, -size*0.3);
        endShape(CLOSE);
        
        fill(255, 200);
        noStroke();
        ellipse(0, -size*0.2, size*0.6, size*0.3);
    } else {
        drawHexagon(0, 0, size);
    }
}

function drawBoss(){
    push();
    translate(boss.x, boss.y);
    
    if (boss.isCharging){
        fill(255, 255, 0, 150);
        noStroke();
        ellipse(0, 0, boss.size * 1.5);
    }

    // cuerpo del jefe
    let healthRatio = boss.hp/boss.maxHp;
    fill(255*(1-healthRatio), 50, 255*healthRatio);
    stroke(255);
    strokeWeight(3);

    drawOctagon(0, 0, boss.size/2);
    
    fill(255, 100);
    noStroke();
    drawOctagon(0, 0, boss.size/3);
    
    // nucleo
    fill(255, 0, 0, 150 + sin(millis() * 0.01) * 100);
    ellipse(0, 0, boss.size/4);
    
    pop();

    // Barra de vida
    let barWidth = 80;
    let barHeight = 8;
    let barX = boss.x - barWidth/2;
    let barY = boss.y - boss.size/2 - 20;
    
    fill(255, 0, 0);
    noStroke();
    rect(barX, barY, barWidth, barHeight);
    fill(0, 255, 0);
    rect(barX, barY, barWidth * healthRatio, barHeight);
    
    // Borde de la barra
    stroke(255);
    strokeWeight(1);
    noFill();
    rect(barX, barY, barWidth, barHeight);

    // Texto de vida
    fill(255);
    noStroke();
    textAlign(CENTER);
    textSize(12);
    text(`JEFE: ${boss.hp}/${boss.maxHp}`, boss.x, boss.y + boss.size/2 + 20);
}

function drawHexagon(x, y, radius){
    beginShape();
    for(let i = 0; i < 6; i++){
        let angle = (i/6) * Math.PI * 2;
        let px = x + Math.cos(angle)*radius;
        let py = y + Math.sin(angle)*radius;
        vertex(px, py);
    }
    endShape(CLOSE);
}

function drawOctagon(x, y, radius) {
    beginShape();
    for (let i = 0; i < 8; i++) {
        let angle = (i / 8) * Math.PI * 2;
        let px = x + Math.cos(angle) * radius;
        let py = y + Math.sin(angle) * radius;
        vertex(px, py);
    }
    endShape(CLOSE);
}

function drawUI() {
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, 0, width, 100);
    
    fill(...colors.white);
    textSize(18);
    textAlign(LEFT);
    text(`P1 Vidas: ${lives1}`, 20, 25);
    text(`P2 Vidas: ${lives2}`, 20, 45);
    text(`Puntos: ${score}`, 20, 65);
    text(`Enemigos: ${enemies.length}`, 20, 85);
    
    textAlign(CENTER);
    textSize(16);
    titleColor = (titleColor + 1) % 360;
    fill(color(`hsl(${titleColor}, 100%, 70%)`));
    text(`NIVEL ${currentLevel}`, width/2, 25);
    
    fill(...colors.cyan);
    textSize(12);
    text("P1: ←→ mover, ESPACIO disparar | P2: A/D mover, W disparar", width/2, height - 15);
    
    // leyenda de enemigos 
    if (currentLevel === 2) {
        textAlign(RIGHT);
        textSize(12);
        fill(255, 150, 50);
        text("● Naranja: Dispara", width - 20, 25);
        fill(255, 100, 100);
        text("● Rojo: Resistente", width - 20, 40);
    }

    if (currentLevel === 3){
        textAlign(RIGHT);
        textSize(12);
        fill(...colors.green);
        text("● Verde: Galaga", width - 20, 25);
        fill(...colors.red);
        text("● Rojo: Resistente", width - 20, 40);
        if (boss){
            fill(255, 50, 255);
            textSize(14);
            text("¡¡¡ ALERTA DE JEFE !!!", width - 20, 60);
        }
    }
}

function drawGameOver() {
    fill(0, 0, 0, 200);
    noStroke();
    rect(0, 0, width, height);
    
    fill(...colors.red);
    textAlign(CENTER);
    textSize(48);
    text("GAME OVER", width/2, height/2 - 50);
    
    fill(...colors.white);
    textSize(24);
    text(`Score Final: ${score}`, width/2, height/2);
    text(`Llegaste al Nivel: ${currentLevel}`, width/2, height/2 + 30);
    
    fill(...colors.yellow);
    textSize(18);
    text("Presiona R para reiniciar", width/2, height/2 + 70);

    backgroundMusic.pause();

}

function drawLevelComplete() {
   // fondo espacial con degradado
   drawSpaceBackground();
   
   // fondo oscuro trasnsparente
   fill(0, 0, 0, 200);
   noStroke();
   rect(0, 0, width, height);
   
   fill(0, 255, 0);
   textAlign(CENTER);
   textSize(48);
   text("¡NIVEL COMPLETADO!", width/2, height/2 - 50);
   
   fill(255);
   textSize(24);
   text(`Score: ${score}`, width/2, height/2);
   
   if (currentLevel < 3) {
       text("Presiona N para siguiente nivel", width/2, height/2 + 30);
       text("Presiona R para reiniciar", width/2, height/2 + 60);
   } else {
       text("¡Felicidades! Completaste todos los niveles", width/2, height/2 + 30);
       text("Derrotaste al jefe final", width/2, height/2 + 60);
       text("Presiona R para reiniciar", width/2, height/2 + 90);
   }
}

function collision(obj1, obj2) {
   return (obj1.x < obj2.x + obj2.size/2 &&
           obj1.x + obj1.size/2 > obj2.x - obj2.size/2 &&
           obj1.y < obj2.y + obj2.size/2 &&
           obj1.y + obj1.size/2 > obj2.y - obj2.size/2);
}


function keyPressed() {
    if (!musicStarted) {
        backgroundMusic.loop();
        musicStarted = true;
    }

    if (key === ' ' && gameState === 'playing' && lives1 > 0) {
        bullets.push({
            x: player1.x,
            y: player1.y - player1.size / 2,
            size: 5,
            speed: 8
        });
        shootSound.play();
    }

    // Disparo jugador 2
    if ((key === 'w' || key === 'W') && gameState === 'playing' && lives2 > 0) {
        if (!isWebRTCHost || !webrtcInitialized) {
            // Solo disparar localmente si no es host WebRTC
            bullets.push({
                x: player2.x,
                y: player2.y - player2.size / 2,
                size: 5,
                speed: 8
            });
            shootSound.play();
        }
    }

    if (key === 'n' || key === 'N') {
        if (gameState === 'levelComplete' && currentLevel < 3) {
            currentLevel++;
            gameState = 'playing';
            bullets = [];
            enemyBullets = [];
            createEnemies();
            player1.x = width / 3;
            player1.y = height - 50;
            player2.x = (width * 2) / 3;
            player2.y = height - 50;
            levelStartTime = millis();
        }
    }

    if (key === 'r' || key === 'R') {
        lives1 = 3;
        lives2 = 3;
        score = 0;
        enemiesDestroyed = 0;
        currentLevel = 1;
        gameState = 'playing';
        bullets = [];
        enemyBullets = [];
        createEnemies();
        player1.x = width / 3;
        player1.y = height - 50;
        player2.x = (width * 2) / 3;
        player2.y = height - 50;
        levelStartTime = millis();
    }

    if (keyCode === ESCAPE) {
        returnToMenu();
    }
}

function returnToMenu() {
   window.location.href = 'index.html';
}

function handleRemoteShooting() {
    if (isWebRTCHost && webrtcInitialized && wasShootPressed() && lives2 > 0) {
        bullets.push({
            x: player2.x,
            y: player2.y - player2.size / 2,
            size: 5,
            speed: 8
        });
        shootSound.play();
    }
}

function cleanupWebRTC() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            console.log('Track detenido:', track.kind);
        });
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    
    webrtcInitialized = false;
    console.log('Recursos WebRTC limpiados');
}

let remoteShootPressed = false;

function updateRemoteInputs() {
    // Esta función debe ser llamada una vez por frame
    // Resetear el estado de disparo después de procesarlo
    if (remoteShootPressed) {
        remoteShootPressed = false;
    }
}

// Limpiar al salir de la página
window.addEventListener('beforeunload', cleanupWebRTC);