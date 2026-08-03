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

// View Control / Zoom State Variables
let zoomLevel = 1.0;
const MIN_ZOOM = 0.5; // 50% Zoom Out
const MAX_ZOOM = 2.0; // 200% Zoom In

function changeZoom(delta) {
    zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel + delta));
    document.getElementById('btn-zoom-reset').innerText = `${Math.round(zoomLevel * 100)}%`;
}

function resetZoom() {
    zoomLevel = 1.0;
    document.getElementById('btn-zoom-reset').innerText = '100%';
}

// Enable Mouse Scroll Wheel Zooming
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
        changeZoom(0.08);
    } else {
        changeZoom(-0.08);
    }
}, { passive: false });

function setPreset(type) {
    document.querySelectorAll('.preset-group .btn').forEach(b => b.classList.remove('active'));
    if (type === 'morning') {
        document.getElementById('btn-morning').classList.add('active');
        V_N = 25; V_S = 10; V_E = 8; V_W = 20;
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

function getNextSpawnInterval(volumePerMin) {
    const lambda = volumePerMin / 60; // Arrival rate in vehicles per second
    if (lambda <= 0) return Infinity;
    // Exponential inter-arrival distribution
    return -Math.log(1 - Math.random()) / lambda;
}

let nextSpawnN = getNextSpawnInterval(V_N);
let nextSpawnS = getNextSpawnInterval(V_S);
let nextSpawnE = getNextSpawnInterval(V_E);
let nextSpawnW = getNextSpawnInterval(V_W);

// Helper function to dynamically attempt spawning with spatial headway check
function trySpawnVehicle(dir, elapsed, nextInterval, currentVolume) {
    if (elapsed >= nextInterval) {
        const candidateCar = new Car(dir);
        
        // Check if the spawn entry location is physically occupied
        const isOccupied = cars.some(other => {
            if (other.dir !== dir || other.lane !== candidateCar.lane) return false;
            const distance = Math.hypot(other.x - candidateCar.x, other.y - candidateCar.y);
            return distance < 35; // Safe headway clearance (car length + buffer)
        });

        if (!isOccupied) {
            cars.push(candidateCar);
            return { spawned: true, newInterval: getNextSpawnInterval(currentVolume) };
        }
    }
    return { spawned: false, newInterval: nextInterval };
}

class Car {
    constructor(dir) {
        this.dir = dir; // 'N', 'S', 'E', 'W'
        this.lane = Math.floor(Math.random() * 3); // 3 Lanes: 0, 1, 2
        
        // Kinematic & Behavior Properties
        this.maxSpeed = 1.8 + Math.random() * 0.8; // Desired cruising speed (1.8 - 2.6 px/frame)
        this.speed = this.maxSpeed;                // Current speed
        
        // REALISTIC ACCELERATION: 0.006 to 0.010 px/frame²
        // Takes ~4.5 seconds (~270 frames @ 60 FPS) to reach max speed from 0
        this.accel = 0.006 + Math.random() * 0.004; 
        
        // Smooth comfortable deceleration rate
        this.decel = 0.05; 
        
        // Perception-Reaction Time Delay (0.5 to 1.0s)
        this.reactionTime = 0.5 + Math.random() * 0.5;
        this.reactionTimer = 0;
        
        this.length = 18;
        this.width = 10;
        
        // 3-Lane offset coordinates
        const laneOffsets = [10, 30, 50];
        const offset = laneOffsets[this.lane];

        // Spawn positions 2x farther back (-260px / 860px)
        if (dir === 'N') { this.x = 240 + offset; this.y = -260; }
        if (dir === 'S') { this.x = 300 + offset; this.y = 860; }
        if (dir === 'W') { this.x = -260; this.y = 300 + offset; }
        if (dir === 'E') { this.x = 860; this.y = 240 + offset; }
    }

    move() {
        let targetSpeed = this.maxSpeed;
        const stopN = 220, stopS = 380, stopW = 220, stopE = 380;
        
        const carBuffer = 15;      // 15px safe bumper-to-bumper gap when queued
        const stopLineBuffer = 4; // 4px stop line clearance

        // 1. Check Distance to Traffic Signal Stop Line
        let distToStop = Infinity;
        if (this.dir === 'N' && currentPhase !== 0 && this.y < stopN) {
            distToStop = (stopN - (this.y + this.length / 2)) - stopLineBuffer;
        } else if (this.dir === 'S' && currentPhase !== 0 && this.y > stopS) {
            distToStop = ((this.y - this.length / 2) - stopS) - stopLineBuffer;
        } else if (this.dir === 'W' && currentPhase !== 2 && this.x < stopW) {
            distToStop = (stopW - (this.x + this.length / 2)) - stopLineBuffer;
        } else if (this.dir === 'E' && currentPhase !== 2 && this.x > stopE) {
            distToStop = ((this.x - this.length / 2) - stopE) - stopLineBuffer;
        }

        // 2. Check Distance to Vehicle Directly Ahead in Same Lane
        let distToCar = Infinity;
        cars.forEach(other => {
            if (other === this || other.dir !== this.dir || other.lane !== this.lane) return;
            
            let isAhead = false;
            let gap = Infinity;

            if (this.dir === 'N' && other.y > this.y) {
                isAhead = true;
                gap = (other.y - other.length / 2) - (this.y + this.length / 2) - carBuffer;
            } else if (this.dir === 'S' && other.y < this.y) {
                isAhead = true;
                gap = (this.y - this.length / 2) - (other.y + other.length / 2) - carBuffer;
            } else if (this.dir === 'W' && other.x > this.x) {
                isAhead = true;
                gap = (other.x - other.length / 2) - (this.x + this.length / 2) - carBuffer;
            } else if (this.dir === 'E' && other.x < this.x) {
                isAhead = true;
                gap = (this.x - this.length / 2) - (other.x + other.length / 2) - carBuffer;
            }

            if (isAhead && gap < distToCar) {
                distToCar = gap;
            }
        });

        // 3. Determine Nearest Obstacle Headway
        const netGap = Math.min(distToStop, distToCar);

        // 4. Compute Velocity Profile with Reaction Delay
        if (netGap <= 0) {
            targetSpeed = 0;
            this.speed = 0;
            this.reactionTimer = 0; // Reset timer while stopped
        } else {
            // Path is clear! If car is currently stopped, enforce driver reaction delay
            if (this.speed === 0) {
                if (this.reactionTimer < this.reactionTime) {
                    this.reactionTimer += 0.016; // Increment timer (~60 FPS)
                    targetSpeed = 0;
                } else {
                    const maxSafeSpeed = Math.sqrt(2 * this.decel * netGap);
                    targetSpeed = Math.min(this.maxSpeed, maxSafeSpeed);
                }
            } else {
                const maxSafeSpeed = Math.sqrt(2 * this.decel * netGap);
                targetSpeed = Math.min(this.maxSpeed, maxSafeSpeed);
            }
        }

        // 5. Accelerate or Decelerate towards Target Speed
        if (this.speed < targetSpeed) {
            this.speed = Math.min(this.speed + this.accel, targetSpeed);
        } else if (this.speed > targetSpeed) {
            this.speed = Math.max(this.speed - this.decel, targetSpeed);
        }

        // Snap negligible coasting values to 0
        if (targetSpeed === 0 && this.speed < 0.05) {
            this.speed = 0;
        }

        // 6. Update Position
        if (this.dir === 'N') this.y += this.speed;
        if (this.dir === 'S') this.y -= this.speed;
        if (this.dir === 'W') this.x += this.speed;
        if (this.dir === 'E') this.x -= this.speed;
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
    // Extended ground fill so zooming out reveals ground instead of empty space
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-600, -600, 1800, 1800);

    // 3-Lane Roads (120px wide total extended beyond canvas edges for zoom out)
    ctx.fillStyle = '#334155';
    ctx.fillRect(240, -600, 120, 1800);
    ctx.fillRect(-600, 240, 1800, 120);

    // Center Double Solid Lines
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(300, -600); ctx.lineTo(300, 240);
    ctx.moveTo(300, 360); ctx.lineTo(300, 1200);
    ctx.moveTo(-600, 300); ctx.lineTo(240, 300);
    ctx.moveTo(360, 300); ctx.lineTo(1200, 300);
    ctx.stroke();

    // Dashed Lane Lines
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    
    [260, 280, 320, 340].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, -600); ctx.lineTo(x, 240);
        ctx.moveTo(x, 360); ctx.lineTo(x, 1200);
        ctx.stroke();
    });

    [260, 280, 320, 340].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(-600, y); ctx.lineTo(240, y);
        ctx.moveTo(360, y); ctx.lineTo(1200, y);
        ctx.stroke();
    });

    ctx.setLineDash([]);

    // Stop Lines
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(240, 220, 60, 4);
    ctx.fillRect(300, 376, 60, 4);
    ctx.fillRect(220, 300, 4, 60);
    ctx.fillRect(376, 240, 4, 60);

    // Signals
    const nsColor = (currentPhase === 0) ? '#4ade80' : (currentPhase === 1 ? '#facc15' : '#f43f5e');
    const ewColor = (currentPhase === 2) ? '#4ade80' : (currentPhase === 3 ? '#facc15' : '#f43f5e');

    drawSignal(225, 205, nsColor);
    drawSignal(375, 395, nsColor);
    drawSignal(205, 375, ewColor);
    drawSignal(395, 225, ewColor);
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

function gameLoop() {
    phaseTime += 0.016;

    let targetDuration = 0;
    if (currentPhase === 0) targetDuration = g_NS;
    else if (currentPhase === 1) targetDuration = yellowDuration;
    else if (currentPhase === 2) targetDuration = g_EW;
    else if (currentPhase === 3) targetDuration = yellowDuration;

    if (phaseTime >= targetDuration) {
        phaseTime = 0;
        currentPhase = (currentPhase + 1) % 4;
    }

    const phaseNames = ["N-S GREEN", "N-S YELLOW", "E-W GREEN", "E-W YELLOW"];
    const phaseColors = ["#4ade80", "#facc15", "#4ade80", "#facc15"];
    const hud = document.getElementById('current-phase-display');
    hud.innerText = phaseNames[currentPhase];
    hud.style.color = phaseColors[currentPhase];
    document.getElementById('phase-timer').innerText = (targetDuration - phaseTime).toFixed(1);

    lastSpawnN += 0.016;
    lastSpawnS += 0.016;
    lastSpawnE += 0.016;
    lastSpawnW += 0.016;

    // --- Dynamic Stochastic Vehicle Generation ---
    let resN = trySpawnVehicle('N', lastSpawnN, nextSpawnN, V_N);
    if (resN.spawned) { lastSpawnN = 0; nextSpawnN = resN.newInterval; }

    let resS = trySpawnVehicle('S', lastSpawnS, nextSpawnS, V_S);
    if (resS.spawned) { lastSpawnS = 0; nextSpawnS = resS.newInterval; }

    let resE = trySpawnVehicle('E', lastSpawnE, nextSpawnE, V_E);
    if (resE.spawned) { lastSpawnE = 0; nextSpawnE = resE.newInterval; }

    let resW = trySpawnVehicle('W', lastSpawnW, nextSpawnW, V_W);
    if (resW.spawned) { lastSpawnW = 0; nextSpawnW = resW.newInterval; }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-centerX, -centerY);

    drawIntersection();

    cars.forEach((car, index) => {
        car.move();
        car.draw();
        
        // Expanded despawn boundaries corresponding to extended approach paths
        if (car.x < -450 || car.x > 1050 || car.y < -450 || car.y > 1050) {
            cars.splice(index, 1);
        }
    });

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

updateMath();
gameLoop();