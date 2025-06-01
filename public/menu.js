const menuSketch = (p) => {
    let selectedOption = 0;
    let maxOptions = 3; // Ahora son 3 opciones
    let stars = [];
    let titleColor = 0;
    let blinkTimer = 0;
    let selectSound;

    const colors = {
        yellow: [255, 255, 0],
        cyan: [0, 255, 255],
        white: [255, 255, 255],
        red: [255, 100, 100],
        blue: [100, 150, 255]
    };

    p.preload = function() {
        selectSound = p.loadSound('menu_select.mp3');
    };
    
    p.setup = function() {
        p.userStartAudio();
        p.createCanvas(800, 600);
        for (let i = 0; i < 100; i++) {
            stars.push({
                x: p.random(p.width),
                y: p.random(p.height),
                size: p.random(1, 3),
                speed: p.random(0.5, 2)
            });
        }
    };
    
    p.draw = function() {
        p.background(0);
        
        drawStars();
        
        drawTitle();
        
        drawMenuOptions();
        
        drawInstructions();
        
        drawCredits();
        
        blinkTimer += 0.1;
    };
    
    function drawStars() {
        p.fill(255);
        p.noStroke();
        
        for (let star of stars) {
            p.circle(star.x, star.y, star.size);
            star.y += star.speed;
            
            if (star.y > p.height) {
                star.y = 0;
                star.x = p.random(p.width);
            }
        }
    }
    
    function drawTitle() {
        p.textAlign(p.CENTER);
        p.textSize(72);
        p.textStyle(p.BOLD);
        
        titleColor = (titleColor + 2) % 360;
        p.fill(p.color(`hsl(${titleColor}, 100%, 70%)`));
        
        p.text("GALAGA", p.width/2, 120);
        
        p.textSize(24);
        p.fill(...colors.cyan);
        p.text("CLASSIC ARCADE SHOOTER", p.width/2, 160);
    }
    
    function drawMenuOptions() {
        p.textAlign(p.CENTER);
        p.textSize(32);
        p.textStyle(p.NORMAL);
        
        // Opción 1: 1 jugador
        if (selectedOption === 0) {
            p.fill(...colors.yellow);
            p.text(">", p.width/2 - 120, 260);
            p.text("<", p.width/2 + 120, 260);
        } else {
            p.fill(...colors.white);
        }
        p.text("1 JUGADOR", p.width/2, 260);
        
        // Opción 2: 2 jugadores local
        if (selectedOption === 1) {
            p.fill(...colors.yellow);
            p.text(">", p.width/2 - 160, 320);
            p.text("<", p.width/2 + 160, 320);
        } else {
            p.fill(...colors.white);
        }
        p.text("2 JUGADORES", p.width/2, 320);

        
        // Efecto de parpadeo para la opción seleccionada
        if (p.sin(blinkTimer * 10) > 0) {
            if (selectedOption === 0) {
                p.fill(...colors.red);
                p.text("1 JUGADOR", p.width/2, 260);
            } else if (selectedOption === 1) {
                p.fill(...colors.red);
                p.text("2 JUGADORES", p.width/2, 320);
            } 
        }
    }
    
    function drawInstructions() {
        p.textAlign(p.CENTER);
        p.textSize(16);
        p.fill(...colors.cyan);
        
        p.text("CONTROLES:", p.width/2, 450);
        p.text("↑ ↓ - SELECCIONAR", p.width/2, 475);
        p.text("ENTER - CONFIRMAR", p.width/2, 495);
    }
    
    function drawCredits() {
        p.textAlign(p.CENTER);
        p.textSize(12);
        p.fill(...colors.blue);
        p.text("© 2025 - GALAGA REMAKE", p.width/2, p.height - 20);
    }
    
    // controles menu
    p.keyPressed = function() {
        switch(p.keyCode) {
            case p.UP_ARROW:
                selectedOption = (selectedOption - 1 + maxOptions) % maxOptions;
                if (selectSound && selectSound.isLoaded()) selectSound.play();
                break;
                    
            case p.DOWN_ARROW:
                selectedOption = (selectedOption + 1) % maxOptions;
                if (selectSound && selectSound.isLoaded()) selectSound.play();
                break;
                    
            case p.ENTER:
                startSelectedGame();
                break;
        }
    };
    
    function startSelectedGame() {
        if (selectSound && selectSound.isLoaded()) {
            selectSound.play();
        }

        if (selectedOption === 0) {
            startGame('single');
        } else if (selectedOption === 1) {
            startGame('multiplayer_local');
        } else if (selectedOption === 2) {
            startGame('multiplayer_online');
        }
    }
};