const canvas = document.getElementById('trafficCanvas');
const ctx = canvas.getContext('2d');

// System Variables
let V_NS = 1200;
let V_EW = 400;
const C = 60; // Total cycle length (seconds)
const L = 6;  // Total yellow lost time (seconds)

let g_NS = 40.5;
let g_EW = 13.5;
const yellowDuration = 3;

// Phase State Management: 0: NS_GREEN, 1: NS_YELLOW, 2: EW_GREEN, 3: EW_YELLOW
let currentPhase = 0; 
let phaseTime = 0; 

// Car Entities Storage
let cars = [];
let lastSpawnNS = 0;
let lastSpawnEW = 0;

function setPreset(type) {
    document.querySelectorAll('.preset-group .btn').forEach(b => b.classList.remove('active'));
    if (type === 'morning') {
        document.getElementById('btn-morning').classList.add('active');
        V_NS = 1400; V_EW = 400;
    } else if (type === 'evening') {
        document.getElementById('btn-evening').classList.add('active');
        V_NS = 300; V_EW = 1300;
    } else {
        document.getElementById('btn-balanced').classList.add('active');
        V_NS = 800; V_EW = 800;
    }
    document.getElementById('input-vns').value = V_NS;
    document.getElementById('input-vew').value = V_EW;
    updateMath();
}

function updateMath() {
    V_NS = parseInt(document.getElementById('input-vns').value);
    V_EW = parseInt(document.getElementById('input-vew').value);
    
    document.getElementById('val-vns').innerText = V_NS;
    document.getElementById('val-vew').innerText = V_EW;

    const effectiveGreen = C - L;
    const ratioNS = V_NS / (V_NS + V_EW);
    const ratioEW = V_EW / (V_NS + V_EW);

    g_NS = Math.max(5, Math.round(effectiveGreen * ratioNS * 10) / 10);
    g_EW = Math.max(5, Math.round((effectiveGreen - g_NS) * 10) / 10);

    document.getElementById('res-gns').innerText = `${g_NS}s (${Math.round((g_NS/C)*100)}%)`;
    document.getElementById('res-gew').innerText = `${g_EW}s (${Math.round((g_EW/C)*100)}%)`;
}

// Car Object Constructor
class Car {
    constructor(dir) {
        this.dir = dir; // 'N', 'S', 'E', 'W'
        this.speed = 2;
        this.length = 18;
        this.width = 10;
        
        if (dir === 'N') { this.x = 275; this.y = -20; }
        if (dir === 'S') { this.x = 315; this.y = 620; }
        if (dir === 'W') { this.x = -20; this.y = 315; }
        if (dir === 'E') { this.x = 620; this.y = 275; }
    }

    move() {
        let canMove = true;
        const stopN = 230, stopS = 370, stopW = 230, stopE = 370;

        // Traffic light check
        if (this.dir === 'N' && this.y + this.length >= stopN - 5 && this.y < stopN) {
            if (currentPhase !== 0) canMove = false;
        } else if (this.dir === 'S' && this.y <= stopS + 5 && this.y > stopS) {
            if (currentPhase !== 0) canMove = false;
        } else if (this.dir === 'W' && this.x + this.length >= stopW - 5 && this.x < stopW) {
            if (currentPhase !== 2) canMove = false;
        } else if (this.dir === 'E' && this.x <= stopE + 5 && this.x > stopE) {
            if (currentPhase !== 2) canMove = false;
        }

        // Check distance to car ahead
        cars.forEach(other => {
            if (other === this || other.dir !== this.dir) return;
            if (this.dir === 'N' && other.y > this.y && other.y - this.y < 25) canMove = false;
            if (this.dir === 'S' && other.y < this.y && this.y - other.y < 25) canMove = false;
            if (this.dir === 'W' && other.x > this.x && other.x - this.x < 25) canMove = false;
            if (this.dir === 'E' && other.x < this.x && this.x - other.x < 25) canMove = false;
        });

        if (canMove) {
            if (this.dir === 'N') this.y += this.speed;
            if (this.dir === 'S') this.y -= this.speed;
            if (this.dir === 'W') this.x += this.speed;
            if (this.dir === 'E') this.x -= this.speed;
        }
    }

    draw() {
        ctx.fillStyle = (this.dir === 'N' || this.dir === 'S') ? '#38bdf8' : '#fbbf24';
        if (this.dir === 'N' || this.dir === 'S') {
            ctx.fillRect(this.x - this.width/2, this.y - this.length/2, this.width, this.length);
        } else {
            ctx.fillRect(this.x - this.length/2, this.y - this.width/2, this.length, this.width);
        }
    }
}

function drawIntersection() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 600, 600);

    // Roads
    ctx.fillStyle = '#334155';
    ctx.fillRect(250, 0, 100, 600); // N-S Road
    ctx.fillRect(0, 250, 600, 100); // E-W Road

    // Lane Dividers
    ctx.strokeStyle = '#f8fafc';
    ctx.setLineDash([10, 10]);
    
    ctx.beginPath();
    ctx.moveTo(300, 0); ctx.lineTo(300, 250);
    ctx.moveTo(300, 350); ctx.lineTo(300, 600);
    ctx.moveTo(0, 300); ctx.lineTo(250, 300);
    ctx.moveTo(350, 300); ctx.lineTo(600, 300);
    ctx.stroke();
    ctx.setLineDash([]);

    // Stop Lines
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(250, 230, 50, 4); // North Stop
    ctx.fillRect(300, 366, 50, 4); // South Stop
    ctx.fillRect(230, 300, 4, 50); // West Stop
    ctx.fillRect(366, 250, 4, 50); // East Stop

    // Signals
    const nsColor = (currentPhase === 0) ? '#4ade80' : (currentPhase === 1 ? '#facc15' : '#f43f5e');
    const ewColor = (currentPhase === 2) ? '#4ade80' : (currentPhase === 3 ? '#facc15' : '#f43f5e');

    // Draw Signal Bulbs
    drawSignal(235, 210, nsColor); // North
    drawSignal(355, 380, nsColor); // South
    drawSignal(210, 355, ewColor); // West
    drawSignal(380, 235, ewColor); // East
}

function drawSignal(x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Logic Step & Animation Loop
function gameLoop() {
    phaseTime += 0.016; // ~60fps step

    // Signal Phase Manager
    let targetDuration = 0;
    if (currentPhase === 0) targetDuration = g_NS;
    else if (currentPhase === 1) targetDuration = yellowDuration;
    else if (currentPhase === 2) targetDuration = g_EW;
    else if (currentPhase === 3) targetDuration = yellowDuration;

    if (phaseTime >= targetDuration) {
        phaseTime = 0;
        currentPhase = (currentPhase + 1) % 4;
    }

    // Update HUD
    const phaseNames = ["N-S GREEN", "N-S YELLOW", "E-W GREEN", "E-W YELLOW"];
    const phaseColors = ["#4ade80", "#facc15", "#4ade80", "#facc15"];
    const hud = document.getElementById('current-phase-display');
    hud.innerText = phaseNames[currentPhase];
    hud.style.color = phaseColors[currentPhase];
    document.getElementById('phase-timer').innerText = (targetDuration - phaseTime).toFixed(1);

    // Spawn Traffic proportionally based on Volume (cars/hr)
    lastSpawnNS += 0.016;
    lastSpawnEW += 0.016;

    if (lastSpawnNS >= (3600 / V_NS)) {
        cars.push(new Car('N'));
        cars.push(new Car('S'));
        lastSpawnNS = 0;
    }
    if (lastSpawnEW >= (3600 / V_EW)) {
        cars.push(new Car('W'));
        cars.push(new Car('E'));
        lastSpawnEW = 0;
    }

    // Render Canvas Frame
    drawIntersection();

    cars.forEach((car, index) => {
        car.move();
        car.draw();
        // Clean offscreen cars
        if (car.x < -40 || car.x > 640 || car.y < -40 || car.y > 640) {
            cars.splice(index, 1);
        }
    });

    requestAnimationFrame(gameLoop);
}

// Initial setup
updateMath();
gameLoop();