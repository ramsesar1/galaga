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
let boss = null;
let levelStartTime = 0;

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
    levelStartTime = millis();
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
                lastShot: 0,
                state: 'descending'
            });
        }
        //nivel 3
    } else if (currentLevel === 3){
        totalEnemies = 16;

        //enemigos con distintos estados y patrones

        for (let i = 0; i < totalEnemies; i++){
            let isResistant = i < 2; 
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
        hp: 7,
        maxHp: 7,
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
            if (currentTime > enemy.enterTime){
                //mueve enemigos al centro para comenzar circulo
                let dx = enemy.circleCenterX - enemy.x;
                let dy = enemy.circleCenterY - enemy.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist > 10){
                    enemy.x += (dx/dist)*enemy.speed;
                    enemy.y += (dy/dist)*enemy.speed;
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
            //manda a los enemigos a formacion despues de 2.4 segundos
            if (currentTime * enemy.circleTime > 2000 + Math.random() * 2000){
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
            }
            break;
        
        case 'attacking':
            let playerDx = player.x - enemy.x;
            let playerDy = player.y - enemy.y;
            let playerDist = Math.sqrt(playerDx*playerDx + playerDy*playerDy);

            if (playerDist > 20){
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
    if (collision(boss, player)){
        lives -= 2;
        if (lives <= 0){
            gameState = 'gameOver';
        }
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
            if (collision(enemyBullets[i], player)) {
                enemyBullets.splice(i, 1);
                lives--;
                if (lives <= 0) {
                    gameState = 'gameOver';
                }
            }
        }
    }


    updateEnemies();

    if (boss){
        updateBoss();
    }

    if (enemies.length === 0 && !boss){
        gameState = 'levelComplete';
    }
}

function updateEnemies(){    
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

        if (boss){
            drawBoss();
        }
    }
    
    drawUI();
}

function drawBoss(){
    if (boss.isCharging){
        fill(255,255,0,150);
        noStroke();
        ellipse(boss.x,boss.y,boss.size * 1.5);
    }

    //hurtbox del jefe
    let healthRatio = boss.hp/boss.maxHp;
    fill(255*(1-healthRatio),50,255*healthRatio);
    stroke(255);
    strokeWeight(3);

    drawOctagon(boss.x, boss.y, boss.size/2);

    //barra de vida
    fill(255,0,0);
    noStroke();
    rect(boss.x-40,boss.y-boss.size/2-20,80,8);
    fill(0,255,0);
    rect(boss.x - 40,boss.y-boss.size/2-20, 80 * healthRatio, 8);

    //vida en texto
    fill(255);
    textAlign(CENTER);
    textSize(16);
    text(`JEFE: ${boss.hp}/${boss.maxHp}`, boss.x, boss.y + 10);
}

function drawHexagon(x,y,radius){
    beginShape();
    for(let i = 0; i < 6; i++){
        let angle = (i/6) * Math.PI * 2;
        let px = x + Math.cos(angle)*radius;
        let py = y + Math.sin(angle)*radius;
        vertex(px,py);
    }
endShape(CLOSE);
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

    if (currentLevel === 3){
        textAlign(RIGHT);
        textSize(14);
        fill(100,255,150);
        text("Verde: Galaga",width - 20,30);
        fill(255,100,100);
        text("Rojo: Resistente",width - 20,50);
        if (boss){
            fill(255,50,255);
            text("ALERTA ALERTA ALERTA", width - 20, 70);
        }
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