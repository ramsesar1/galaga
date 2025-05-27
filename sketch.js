let player;
let bullets = [];
let enemies = [];
let enemyBullets = [];
let lives = 3;
let score = 0;
let gameState = 'playing'; // 'playing', 'gameOver', 'levelComplete'
let enemiesDestroyed = 0;
let totalEnemies = 10;
let currentLevel = 1;
let lastEnemyShot = 0;

function setup() {
    createCanvas(800, 900);
    
    // jugador
    player = {
        x: width / 2,
        y: height - 50,
        size: 30,
        speed: 5
    };
    
    // enemigos del nivel actual
    createEnemies();
}

function draw() {
    background(20, 20, 40);
    
    if (gameState === 'playing') {
        updateGame();
        drawGame();
    } else if (gameState === 'gameOver') {
        drawGameOver();
    } else if (gameState === 'levelComplete') {
        drawLevelComplete();
    }
}

function createEnemies() {
    enemies = [];
    enemyBullets = [];
    
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
                type: 'normal'
            });
        }
    } else if (currentLevel === 2) {
        // Nivel 2: enemigos con zigzag y algunos que disparan
        totalEnemies = 12;
        for (let i = 0; i < totalEnemies; i++) {
            let canShoot = Math.random() < 0.4; // 40% de enemigos disparan
            let isResistant = i === 5; // enemigo resistente en posicion
            
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
                lastShot: 0
            });
        }
    }
}

function updateGame() {
    if (keyIsDown(LEFT_ARROW) && player.x > player.size/2) {
        player.x -= player.speed;
    }
    if (keyIsDown(RIGHT_ARROW) && player.x < width - player.size/2) {
        player.x += player.speed;
    }
    
    // Actualizar balas del jugador
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bullets[i].speed;
        
        // Eliminar balas que salen de pantalla
        if (bullets[i].y < 0) {
            bullets.splice(i, 1);
            continue;
        }
        
        // Colision bala-enemigo
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (collision(bullets[i], enemies[j])) {
                bullets.splice(i, 1);
                enemies[j].hp--;
                
                if (enemies[j].hp <= 0) {
                    enemies.splice(j, 1);
                    score += enemies[j] && enemies[j].type === 'resistant' ? 30 : 10;
                    enemiesDestroyed++;
                }
                break;
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
            if (collision(enemyBullets[i], player)) {
                enemyBullets.splice(i, 1);
                lives--;
                if (lives <= 0) {
                    gameState = 'gameOver';
                }
            }
        }
    }
    
    // Actualizar enemigos
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
        }
        
        // Colision enemigo-jugador
        if (collision(enemy, player)) {
            enemies.splice(i, 1);
            lives--;
            if (lives <= 0) {
                gameState = 'gameOver';
            }
            continue;
        }
        
        // Enemigo llega al fondo
        if (enemy.y > height) {
            enemies.splice(i, 1);
            lives--;
            if (lives <= 0) {
                gameState = 'gameOver';
            }
        }
    }
    
    // verificar nivel completo
    if (enemies.length === 0) {
        gameState = 'levelComplete';
    }
}

function drawGame() {
    // Dibujar jugador
    fill(100, 150, 255);
    stroke(255);
    strokeWeight(2);
    rect(player.x - player.size/2, player.y - player.size/2, player.size, player.size);
    
    // Dibujar balas del jugador
    fill(255, 255, 100);
    noStroke();
    for (let bullet of bullets) {
        rect(bullet.x - bullet.size/2, bullet.y - bullet.size/2, bullet.size, bullet.size);
    }
    
    // Dibujar balas enemigas
    fill(255, 100, 255);
    for (let bullet of enemyBullets) {
        rect(bullet.x - bullet.size/2, bullet.y - bullet.size/2, bullet.size, bullet.size);
    }
    
    // Dibujar enemigos
    for (let enemy of enemies) {
        if (enemy.type === 'resistant') {
            // enemigo resistente con vida extra
            let healthRatio = enemy.hp / enemy.maxHp;
            fill(255, 100 * healthRatio, 100 * healthRatio);
        } else if (enemy.canShoot) {
            // enemigo que dispara - color naranja
            fill(255, 150, 50);
        } else {
            // Enemigo normal - rojo
            fill(255, 100, 100);
        }
        
        stroke(255);
        strokeWeight(1);
        rect(enemy.x - enemy.size/2, enemy.y - enemy.size/2, enemy.size, enemy.size);
        
        // vida para enemigos resistentes
        if (enemy.type === 'resistant') {
            fill(255);
            textAlign(CENTER);
            textSize(12);
            text(enemy.hp, enemy.x, enemy.y + 5);
        }
    }
    
    drawUI();
}

function drawUI() {
    fill(255);
    textSize(20);
    textAlign(LEFT);
    text(`Vidas: ${lives}`, 20, 30);
    text(`Puntos: ${score}`, 20, 55);
    text(`Enemigos: ${enemies.length}`, 20, 80);
    
    textAlign(CENTER);
    textSize(16);
    text(`NIVEL ${currentLevel}`, width/2, 30);
    text("Usa las flechas para moverte, ESPACIO para disparar", width/2, height - 20);
    
    if (currentLevel === 2) {
        textAlign(RIGHT);
        textSize(14);
        fill(255, 150, 50);
        text("Naranja: Dispara", width - 20, 30);
        fill(255, 100, 100);
        text("Rojo oscuro: Resistente", width - 20, 50);
    }
}

function drawGameOver() {
    fill(255, 0, 0);
    textAlign(CENTER);
    textSize(48);
    text("GAME OVER", width/2, height/2 - 50);
    
    fill(255);
    textSize(24);
    text(`Score Final: ${score}`, width/2, height/2);
    text(`Llegaste al Nivel: ${currentLevel}`, width/2, height/2 + 30);
    text("Presiona R para reiniciar", width/2, height/2 + 60);
}

function drawLevelComplete() {
    fill(0, 255, 0);
    textAlign(CENTER);
    textSize(48);
    text("¡NIVEL COMPLETADO!", width/2, height/2 - 50);
    
    fill(255);
    textSize(24);
    text(`Score: ${score}`, width/2, height/2);
    
    if (currentLevel < 2) {
        text("Presiona N para siguiente nivel", width/2, height/2 + 30);
        text("Presiona R para reiniciar", width/2, height/2 + 60);
    } else {
        text("¡Felicidades! Completaste todos los niveles", width/2, height/2 + 30);
        text("Presiona R para reiniciar", width/2, height/2 + 60);
    }
}

function collision(obj1, obj2) {
    return (obj1.x < obj2.x + obj2.size/2 &&
            obj1.x + obj1.size/2 > obj2.x - obj2.size/2 &&
            obj1.y < obj2.y + obj2.size/2 &&
            obj1.y + obj1.size/2 > obj2.y - obj2.size/2);
}

function keyPressed() {
    if (key === ' ' && gameState === 'playing') {
        // Disparar
        bullets.push({
            x: player.x,
            y: player.y - player.size/2,
            size: 5,
            speed: 8
        });
    }
    
    if (key === 'n' || key === 'N') {
        if (gameState === 'levelComplete' && currentLevel < 2) {
            // siguiente nivel
            currentLevel++;
            gameState = 'playing';
            bullets = [];
            enemyBullets = [];
            createEnemies();
            player.x = width / 2;
            player.y = height - 50;
        }
    }
    
    if (key === 'r' || key === 'R') {
        // reinicia juego
        lives = 3;
        score = 0;
        enemiesDestroyed = 0;
        currentLevel = 1;
        gameState = 'playing';
        bullets = [];
        enemyBullets = [];
        createEnemies();
        player.x = width / 2;
        player.y = height - 50;
    }
}