let player;
let bullets = [];
let enemies = [];
let lives = 3;
let score = 0;
let gameState = 'playing'; // 'playing', 'gameOver', 'levelComplete'
let enemiesDestroyed = 0;
let totalEnemies = 15;

function setup() {
    createCanvas(800, 600);
    
    // jugador
    player = {
        x: width / 2,
        y: height - 50,
        size: 30,
        speed: 5
    };
    
    // enemigos del nivel 1
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
    for (let i = 0; i < totalEnemies; i++) {
        enemies.push({
            x: 50 + (i % 5) * 140,
            y: -50 - Math.floor(i / 5) * 80,
            size: 25,
            speed: 1
        });
    }
}

function updateGame() {
    // Mover jugador
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
                enemies.splice(j, 1);
                score += 10;
                enemiesDestroyed++;
                break;
            }
        }
    }
    
    // Actualizar enemigos
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].y += enemies[i].speed;
        
        // Colision enemigo-jugador
        if (collision(enemies[i], player)) {
            enemies.splice(i, 1);
            lives--;
            if (lives <= 0) {
                gameState = 'gameOver';
            }
            continue;
        }
        
        // Enemigo llega al fondo
        if (enemies[i].y > height) {
            enemies.splice(i, 1);
            lives--;
            if (lives <= 0) {
                gameState = 'gameOver';
            }
        }
    }
    
    // Verificar si se completo el nivel
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
    
    // Dibujar balas
    fill(255, 255, 100);
    noStroke();
    for (let bullet of bullets) {
        rect(bullet.x - bullet.size/2, bullet.y - bullet.size/2, bullet.size, bullet.size);
    }
    
    // Dibujar enemigos
    fill(255, 100, 100);
    stroke(255);
    strokeWeight(1);
    for (let enemy of enemies) {
        rect(enemy.x - enemy.size/2, enemy.y - enemy.size/2, enemy.size, enemy.size);
    }
    
    // Dibujar UI
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
    text("NIVEL 1", width/2, 30);
    text("Usa las flechas para moverte, ESPACIO para disparar", width/2, height - 20);
}

function drawGameOver() {
    fill(255, 0, 0);
    textAlign(CENTER);
    textSize(48);
    text("GAME OVER", width/2, height/2 - 50);
    
    fill(255);
    textSize(24);
    text(`Score Final: ${score}`, width/2, height/2);
    text("Presiona R para reiniciar", width/2, height/2 + 50);
}

function drawLevelComplete() {
    fill(0, 255, 0);
    textAlign(CENTER);
    textSize(48);
    text("¡NIVEL COMPLETADO!", width/2, height/2 - 50);
    
    fill(255);
    textSize(24);
    text(`Score: ${score}`, width/2, height/2);
    text("Presiona R para reiniciar", width/2, height/2 + 50);
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
    
    if (key === 'r' || key === 'R') {
        // Reiniciar juego
        lives = 3;
        score = 0;
        enemiesDestroyed = 0;
        gameState = 'playing';
        bullets = [];
        createEnemies();
        player.x = width / 2;
        player.y = height - 50;
    }
}