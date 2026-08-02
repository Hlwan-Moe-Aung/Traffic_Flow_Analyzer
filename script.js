const canvas = document.getElementById('trafficCanvas');
const ctx = canvas.getContext('2d');

// System Variables (cars / minute)
let V_N = 20; // Pyae Road (7Miles)
let V_S = 15; // Pyae Road
let V_E = 8;  // Parami Road
let V_W = 12; // Parami Road (UIT)

const C = 60; // Total cycle length (seconds)
const L = 6;  // Total yellow lost time (seconds)

let g_NS = 34.3;
let g_EW = 19.7;
const yellowDuration = 3;

// Phase State Management: 0: NS_GREEN, 1: NS_YELLOW, 2: EW_GREEN, 3: EW_YELLOW
let currentPhase = 0; 
let phaseTime = 0; 

// Car Entities & Spawning Clocks
let cars = [];
let lastSpawnN = 0;
let lastSpawnS = 0;
let lastSpawnE = 0;
let lastSpawnW = 0;

function setPreset(type) {
    document.querySelectorAll('.preset-group .btn').forEach(b => b.classList.remove('active'));
    if (type === 'morning') {
        document.getElementById('btn-morning').classList.add('active');
        V_N = 25; V_S = 10; V_E = 8; V_W = 20; // High inbound to UIT / City
    } else if (type === 'evening') {
        document.getElementById('btn-evening').classList.add('active');
        V_N = 10; V_S = 25; V_E = 20; V_W = 8;
    } else {
        document.getElementById('btn-balanced').classList.add('active');
        V_N = 15; V_S = 15; V_E = 15; V_W = 15;
    }
    
    document.getElementById('input-vn').value = V_N;
    document.getElementById('input-vs').value = V_S;
    document.getElementById('input-ve').value = V_E;
    document.getElementById('input-vw').value = V_W;
    
    updateMath();
}

function updateMath() {
    V_N = parseInt(document.getElementById('input-vn').value);
    V_S = parseInt(document.getElementById('input-vs').value);
    V_E = parseInt(document.getElementById('input-ve').value);
    V_W = parseInt(document.getElementById('input-vw').value);
    
    document.getElementById('val-vn').innerText = V_N;
    document.getElementById('val-vs').innerText = V_S;
    document.getElementById('val-ve').innerText = V_E;
    document.getElementById('val-vw').innerText = V_W;

    const V_NS_total = V_N + V_S;
    const V_EW_total = V_E + V_W;
    const totalVolume = Math.max(1, V_NS_total + V_EW_total);

    const effectiveGreen = C - L;
    const ratioNS = V_NS_total / totalVolume;

    g_NS = Math.max(5, Math.round(effectiveGreen * ratioNS * 10) / 10);
    g_EW = Math.max(5, Math.round((effectiveGreen - g_NS) * 10) / 10);

    document.getElementById('res-gns').innerText = `${g_NS}s (${Math.round((g_NS/C)*100)}%)`;
    document.getElementById('res-gew').innerText = `${g_EW}s (${Math.round((g_EW/C)*100)}%)`;
}

// Car Entity Class (Supports 3 Lanes per Approach)
class Car {
    constructor(dir) {
        this.dir = dir; // 'N', 'S', 'E', 'W'
        this.lane = Math.floor(Math.random() * 3); // 3 Lanes: 0, 1, 2
        this.speed = 2;
        this.length = 18;
        this.width = 10;
        
        // 3-Lane offset coordinates (road is 120px wide: 60px incoming, 60px outgoing)
        const laneOffsets = [10, 30, 50]; // center offset inside each 20px lane
        const offset = laneOffsets[this.lane];

        if (dir === 'N') { this.x = 240 + offset; this.y = -20; }
        if (dir === 'S') { this.x = 300 + offset; this.y = 620; }
        if (dir === 'W') { this.x = -20; this.y = 300 + offset; }
        if (dir === 'E') { this.x = 620; this.y = 240 + offset; }
    }

    move() {
        let canMove = true;
        const stopN = 220, stopS = 380, stopW = 220, stopE = 380;

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

        // Check distance to car ahead IN THE SAME LANE
        cars.forEach(other => {
            if (other === this || other.dir !== this.dir || other.lane !== this.lane) return;
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

    // 3-Lane Roads (120px wide total)
    ctx.fillStyle = '#334155';
    ctx.fillRect(240, 0, 120, 600); // N-S Road (3 lanes down, 3 lanes up)
    ctx.fillRect(0, 240, 600, 120); // E-W Road (3 lanes right, 3 lanes left)

    // Center Double Solid Lines
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    
    // N-S Center line
    ctx.beginPath();
    ctx.moveTo(300, 0); ctx.lineTo(300, 240);
    ctx.moveTo(300, 360); ctx.lineTo(300, 600);
    ctx.stroke();

    // E-W Center line
    ctx.beginPath();
    ctx.moveTo(0, 300); ctx.lineTo(240, 300);
    ctx.moveTo(360, 300); ctx.lineTo(600, 300);
    ctx.stroke();

    // Dashed Lane Lines (Separating the 3 lanes)
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    
    // N-S Lane Dividers (at x = 260, 280, 320, 340)
    [260, 280, 320, 340].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, 240);
        ctx.moveTo(x, 360); ctx.lineTo(x, 600);
        ctx.stroke();
    });

    // E-W Lane Dividers (at y = 260, 280, 320, 340)
    [260, 280, 320, 340].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(240, y);
        ctx.moveTo(360, y); ctx.lineTo(600, y);
        ctx.stroke();
    });

    ctx.setLineDash([]); // Reset line dash

    // Stop Lines (Covering all 3 incoming lanes)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(240, 220, 60, 4); // North Stop Line
    ctx.fillRect(300, 376, 60, 4); // South Stop Line
    ctx.fillRect(220, 300, 4, 60); // West Stop Line
    ctx.fillRect(376, 240, 4, 60); // East Stop Line

    // Signal Colors
    const nsColor = (currentPhase === 0) ? '#4ade80' : (currentPhase === 1 ? '#facc15' : '#f43f5e');
    const ewColor = (currentPhase === 2) ? '#4ade80' : (currentPhase === 3 ? '#facc15' : '#f43f5e');

    // Draw Signal Lights
    drawSignal(225, 205, nsColor); // North (Pyae Road 7Miles)
    drawSignal(375, 395, nsColor); // South (Pyae Road)
    drawSignal(205, 375, ewColor); // West (Parami Road UIT)
    drawSignal(395, 225, ewColor); // East (Parami Road)
}

function drawSignal(x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
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

    // Spawn Traffic based on individual arrival rates (cars / minute)
    lastSpawnN += 0.016;
    lastSpawnS += 0.016;
    lastSpawnE += 0.016;
    lastSpawnW += 0.016;

    if (lastSpawnN >= (60 / V_N)) { cars.push(new Car('N')); lastSpawnN = 0; }
    if (lastSpawnS >= (60 / V_S)) { cars.push(new Car('S')); lastSpawnS = 0; }
    if (lastSpawnE >= (60 / V_E)) { cars.push(new Car('E')); lastSpawnE = 0; }
    if (lastSpawnW >= (60 / V_W)) { cars.push(new Car('W')); lastSpawnW = 0; }

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