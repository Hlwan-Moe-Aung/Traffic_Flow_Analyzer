const canvas = document.getElementById('trafficCanvas');
const ctx = canvas.getContext('2d');

let isRunning = false;
let animId = null;

// System Variables (cars / minute)
let V_N = 20; // Pyae Road (7Miles)
let V_S = 10; // Pyae Road
let V_E = 8;  // Parami Road
let V_W = 7;  // Parami Road (UIT)

const C = 60;          // Total cycle length (seconds)
const L = 12;          // Total lost time (4 yellow phases x 3s)
const yellowDuration = 3;

// 4-Phase Green Split Allocations
let g_NS_Left = 8.0;
let g_NS_Thru = 24.0;
let g_EW_Left = 4.0;
let g_EW_Thru = 12.0;

/* 
  8 Signal States (4 Green + 4 Yellow Transitions):
  0: NS_LEFT_GREEN,    1: NS_LEFT_YELLOW
  2: NS_THRU_GREEN,    3: NS_THRU_YELLOW
  4: EW_LEFT_GREEN,    5: EW_LEFT_YELLOW
  6: EW_THRU_GREEN,    7: EW_THRU_YELLOW
*/
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
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

function startSim() {
    if (!isRunning) {
        isRunning = true;
        animId = requestAnimationFrame(gameLoop);
    }
}

function stopSim() {
    isRunning = false;
    if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
    }
}

function resetSim() {
    stopSim();
    
    currentPhase = 0;
    phaseTime = 0;
    cars = [];
    lastSpawnN = 0; lastSpawnS = 0; lastSpawnE = 0; lastSpawnW = 0;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-centerX, -centerY);
    drawIntersection();
    ctx.restore();
}

function changeZoom(delta) {
    zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel + delta));
    document.getElementById('btn-zoom-reset').innerText = `${Math.round(zoomLevel * 100)}%`;
}

function resetZoom() {
    zoomLevel = 1.0;
    document.getElementById('btn-zoom-reset').innerText = '100%';
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
        changeZoom(0.08);
    } else {
        changeZoom(-0.08);
    }
}, { passive: false });

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

    const effectiveGreen = C - L; // 48 seconds
    const ratioNS = V_NS_total / totalVolume;
    const ratioEW = V_EW_total / totalVolume;

    const g_NS_total = effectiveGreen * ratioNS;
    const g_EW_total = effectiveGreen * ratioEW;

    // Allocate 25% to Left Turns, 75% to Through/Right
    g_NS_Left = Math.max(3, Math.round(g_NS_total * 0.25 * 10) / 10);
    g_NS_Thru = Math.max(5, Math.round(g_NS_total * 0.75 * 10) / 10);
    g_EW_Left = Math.max(3, Math.round(g_EW_total * 0.25 * 10) / 10);
    g_EW_Thru = Math.max(5, Math.round((effectiveGreen - (g_NS_Left + g_NS_Thru + g_EW_Left)) * 10) / 10);

    document.getElementById('res-gns-left').innerText = `${g_NS_Left}s`;
    document.getElementById('res-gns-thru').innerText = `${g_NS_Thru}s`;
    document.getElementById('res-gew-left').innerText = `${g_EW_Left}s`;
    document.getElementById('res-gew-thru').innerText = `${g_EW_Thru}s`;
}

function getNextSpawnInterval(volumePerMin) {
    const lambda = volumePerMin / 60;
    if (lambda <= 0) return Infinity;
    return -Math.log(1 - Math.random()) / lambda;
}

let nextSpawnN = getNextSpawnInterval(V_N);
let nextSpawnS = getNextSpawnInterval(V_S);
let nextSpawnE = getNextSpawnInterval(V_E);
let nextSpawnW = getNextSpawnInterval(V_W);

function trySpawnVehicle(dir, elapsed, nextInterval, currentVolume) {
    if (elapsed >= nextInterval) {
        const candidateCar = new Car(dir);
        
        // Ensure spawn lane entry node is physically clearance-checked
        const isOccupied = cars.some(other => {
            if (other.dir !== dir || other.lane !== candidateCar.lane) return false;
            const distance = Math.hypot(other.x - candidateCar.x, other.y - candidateCar.y);
            return distance < 35;
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
        
        // Dedicated Lane Allocation & Movement Intent:
        // Lane 0: Inner Lane -> Dedicated Left Turn
        // Lane 1: Middle Lane -> Straight / Through
        // Lane 2: Outer Lane -> Dedicated Right Turn
        this.lane = Math.floor(Math.random() * 3);
        if (this.lane === 0) this.turnIntent = 'LEFT';
        else if (this.lane === 1) this.turnIntent = 'STRAIGHT';
        else if (this.lane === 2) this.turnIntent = 'RIGHT';

        this.state = 'APPROACH'; // 'APPROACH', 'TURNING', 'EXIT'
        this.progress = 0;       // Parametric curve progress u in [0, 1]
        
        this.maxSpeed = 1.8 + Math.random() * 0.8;
        this.speed = this.maxSpeed;
        this.accel = 0.006 + Math.random() * 0.004;
        this.decel = 0.05;
        this.reactionTime = 0.5 + Math.random() * 0.5;
        this.reactionTimer = 0;
        
        this.length = 18;
        this.width = 10;
        
        this.initCoordinatesAndCurve();
    }

    initCoordinatesAndCurve() {
        // Approach lane offsets
        if (this.dir === 'N') {
            const laneX = [290, 270, 250];
            this.x = laneX[this.lane];
            this.y = -260;
            this.angle = Math.PI / 2; // Facing South
        } else if (this.dir === 'S') {
            const laneX = [310, 330, 350];
            this.x = laneX[this.lane];
            this.y = 860;
            this.angle = -Math.PI / 2; // Facing North
        } else if (this.dir === 'W') {
            const laneY = [310, 330, 350];
            this.x = -260;
            this.y = laneY[this.lane];
            this.angle = 0; // Facing East
        } else if (this.dir === 'E') {
            const laneY = [290, 270, 250];
            this.x = 860;
            this.y = laneY[this.lane];
            this.angle = Math.PI; // Facing West
        }

        // Define Quadratic Bézier Control Points (P0, P1, P2) for Turns
        this.curve = null;
        this.curveLength = 100;

        if (this.turnIntent === 'LEFT') {
            if (this.dir === 'N') this.curve = { p0: {x: 290, y: 220}, p1: {x: 290, y: 310}, p2: {x: 380, y: 310} };
            if (this.dir === 'S') this.curve = { p0: {x: 310, y: 380}, p1: {x: 310, y: 290}, p2: {x: 220, y: 290} };
            if (this.dir === 'W') this.curve = { p0: {x: 220, y: 310}, p1: {x: 310, y: 310}, p2: {x: 310, y: 220} };
            if (this.dir === 'E') this.curve = { p0: {x: 380, y: 290}, p1: {x: 290, y: 290}, p2: {x: 290, y: 380} };
            this.curveLength = 141; // Approximate arc length
        } else if (this.turnIntent === 'RIGHT') {
            if (this.dir === 'N') this.curve = { p0: {x: 250, y: 220}, p1: {x: 250, y: 250}, p2: {x: 220, y: 250} };
            if (this.dir === 'S') this.curve = { p0: {x: 350, y: 380}, p1: {x: 350, y: 350}, p2: {x: 380, y: 350} };
            if (this.dir === 'W') this.curve = { p0: {x: 220, y: 350}, p1: {x: 250, y: 350}, p2: {x: 250, y: 380} };
            if (this.dir === 'E') this.curve = { p0: {x: 380, y: 250}, p1: {x: 350, y: 250}, p2: {x: 350, y: 220} };
            this.curveLength = 47; // Approximate arc length
        }
    }

    isGreenSignal() {
        if (this.dir === 'N' || this.dir === 'S') {
            if (this.turnIntent === 'LEFT') return currentPhase === 0;
            return currentPhase === 2; // Straight & Right turn
        } else {
            if (this.turnIntent === 'LEFT') return currentPhase === 4;
            return currentPhase === 6; // Straight & Right turn
        }
    }

    move() {
        let targetSpeed = this.maxSpeed;
        const carBuffer = 12;
        const stopLineBuffer = 4;

        const stopN = 220, stopS = 380, stopW = 220, stopE = 380;

        // 1. Distance to Stop Line Clearance
        let distToStop = Infinity;
        if (this.state === 'APPROACH' && !this.isGreenSignal()) {
            if (this.dir === 'N' && this.y < stopN) distToStop = (stopN - (this.y + this.length / 2)) - stopLineBuffer;
            else if (this.dir === 'S' && this.y > stopS) distToStop = ((this.y - this.length / 2) - stopS) - stopLineBuffer;
            else if (this.dir === 'W' && this.x < stopW) distToStop = (stopW - (this.x + this.length / 2)) - stopLineBuffer;
            else if (this.dir === 'E' && this.x > stopE) distToStop = ((this.x - this.length / 2) - stopE) - stopLineBuffer;
        }

        // 2. Vector Projection Car-Following Headway Check across all paths
        let distToCar = Infinity;
        const headingCos = Math.cos(this.angle);
        const headingSin = Math.sin(this.angle);

        cars.forEach(other => {
            if (other === this) return;
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;

            // Longitudinal distance along current travel vector
            const longDist = dx * headingCos + dy * headingSin;
            // Lateral offset perpendicular to travel vector
            const latDist = Math.abs(-dx * headingSin + dy * headingCos);

            if (longDist > 0 && latDist < 14) {
                const gap = longDist - (this.length / 2 + other.length / 2 + carBuffer);
                if (gap < distToCar) distToCar = gap;
            }
        });

        const netGap = Math.min(distToStop, distToCar);

        // 3. Acceleration / Deceleration Dynamics with Perception Delay
        if (netGap <= 0) {
            targetSpeed = 0;
            this.speed = 0;
            this.reactionTimer = 0;
        } else {
            if (this.speed === 0) {
                if (this.reactionTimer < this.reactionTime) {
                    this.reactionTimer += 0.016;
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

        if (this.speed < targetSpeed) this.speed = Math.min(this.speed + this.accel, targetSpeed);
        else if (this.speed > targetSpeed) this.speed = Math.max(this.speed - this.decel, targetSpeed);

        if (targetSpeed === 0 && this.speed < 0.05) this.speed = 0;

        // 4. Update Position & Heading Kinematics
        if (this.state === 'APPROACH') {
            if (this.dir === 'N') this.y += this.speed;
            if (this.dir === 'S') this.y -= this.speed;
            if (this.dir === 'W') this.x += this.speed;
            if (this.dir === 'E') this.x -= this.speed;

            // Check boundary to trigger turn or straight exit
            let reachedBoundary = false;
            if (this.dir === 'N' && this.y >= 220) reachedBoundary = true;
            if (this.dir === 'S' && this.y <= 380) reachedBoundary = true;
            if (this.dir === 'W' && this.x >= 220) reachedBoundary = true;
            if (this.dir === 'E' && this.x <= 380) reachedBoundary = true;

            if (reachedBoundary) {
                if (this.turnIntent === 'STRAIGHT') {
                    this.state = 'EXIT';
                } else {
                    this.state = 'TURNING';
                    this.progress = 0;
                }
            }
        } else if (this.state === 'TURNING') {
            this.progress += this.speed / this.curveLength;

            if (this.progress >= 1.0) {
                this.progress = 1.0;
                this.state = 'EXIT';
                
                // Snap final exit heading angle
                if (this.turnIntent === 'LEFT') {
                    if (this.dir === 'N') this.angle = 0;            // Eastbound
                    if (this.dir === 'S') this.angle = Math.PI;     // Westbound
                    if (this.dir === 'W') this.angle = -Math.PI / 2; // Northbound
                    if (this.dir === 'E') this.angle = Math.PI / 2;  // Southbound
                } else if (this.turnIntent === 'RIGHT') {
                    if (this.dir === 'N') this.angle = Math.PI;     // Westbound
                    if (this.dir === 'S') this.angle = 0;            // Eastbound
                    if (this.dir === 'W') this.angle = Math.PI / 2;  // Southbound
                    if (this.dir === 'E') this.angle = -Math.PI / 2; // Northbound
                }
            } else {
                // Quadratic Bézier Parametric Evaluation B(u)
                const u = this.progress;
                const p0 = this.curve.p0, p1 = this.curve.p1, p2 = this.curve.p2;

                this.x = (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * p1.x + u * u * p2.x;
                this.y = (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * p1.y + u * u * p2.y;

                // Tangent Derivative Vector B'(u) for Heading Angle theta
                const dx = 2 * (1 - u) * (p1.x - p0.x) + 2 * u * (p2.x - p1.x);
                const dy = 2 * (1 - u) * (p1.y - p0.y) + 2 * u * (p2.y - p1.y);
                this.angle = Math.atan2(dy, dx);
            }
        } else if (this.state === 'EXIT') {
            this.x += this.speed * Math.cos(this.angle);
            this.y += this.speed * Math.sin(this.angle);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Corridor color coding
        ctx.fillStyle = (this.dir === 'N' || this.dir === 'S') ? '#38bdf8' : '#fbbf24';
        
        // Centered Vehicle Rectangle
        ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);

        // Windshield Front Indicator
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.length / 2 - 3, -this.width / 2 + 1, 3, this.width - 2);

        ctx.restore();
    }
}

function drawPavementArrow(x, y, angle, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.6)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'STRAIGHT') {
        ctx.beginPath();
        ctx.moveTo(-8, 0); ctx.lineTo(6, 0);
        ctx.moveTo(2, -4); ctx.lineTo(8, 0); ctx.lineTo(2, 4);
        ctx.stroke();
    } else if (type === 'LEFT') {
        ctx.beginPath();
        ctx.moveTo(-8, 0); ctx.lineTo(0, 0); ctx.lineTo(0, -6);
        ctx.moveTo(-4, -2); ctx.lineTo(0, -8); ctx.lineTo(4, -2);
        ctx.stroke();
    } else if (type === 'RIGHT') {
        ctx.beginPath();
        ctx.moveTo(-8, 0); ctx.lineTo(0, 0); ctx.lineTo(0, 6);
        ctx.moveTo(-4, 2); ctx.lineTo(0, 8); ctx.lineTo(4, 2);
        ctx.stroke();
    }
    ctx.restore();
}

function drawIntersection() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-600, -600, 1800, 1800);

    // 3-Lane Road surface
    ctx.fillStyle = '#334155';
    ctx.fillRect(240, -600, 120, 1800);
    ctx.fillRect(-600, 240, 1800, 120);

    // Center Double Yellow Lines
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(300, -600); ctx.lineTo(300, 240);
    ctx.moveTo(300, 360); ctx.lineTo(300, 1200);
    ctx.moveTo(-600, 300); ctx.lineTo(240, 300);
    ctx.moveTo(360, 300); ctx.lineTo(1200, 300);
    ctx.stroke();

    // Dashed White Lane Markings
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

    // Pavement Directional Arrows
    // North Approach (heading South: angle = PI/2)
    drawPavementArrow(290, 150, Math.PI / 2, 'LEFT');
    drawPavementArrow(270, 150, Math.PI / 2, 'STRAIGHT');
    drawPavementArrow(250, 150, Math.PI / 2, 'RIGHT');

    // South Approach (heading North: angle = -PI/2)
    drawPavementArrow(310, 450, -Math.PI / 2, 'LEFT');
    drawPavementArrow(330, 450, -Math.PI / 2, 'STRAIGHT');
    drawPavementArrow(350, 450, -Math.PI / 2, 'RIGHT');

    // West Approach (heading East: angle = 0)
    drawPavementArrow(150, 310, 0, 'LEFT');
    drawPavementArrow(150, 330, 0, 'STRAIGHT');
    drawPavementArrow(150, 350, 0, 'RIGHT');

    // East Approach (heading West: angle = PI)
    drawPavementArrow(450, 290, Math.PI, 'LEFT');
    drawPavementArrow(450, 270, Math.PI, 'STRAIGHT');
    drawPavementArrow(450, 250, Math.PI, 'RIGHT');

    // Stop Lines
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(240, 220, 60, 4);
    ctx.fillRect(300, 376, 60, 4);
    ctx.fillRect(220, 300, 4, 60);
    ctx.fillRect(376, 240, 4, 60);

    // Dual Signal Heads per approach (Inner = Left Turn, Outer = Through/Right)
    const nsLeftColor = (currentPhase === 0) ? '#4ade80' : (currentPhase === 1 ? '#facc15' : '#f43f5e');
    const nsThruColor = (currentPhase === 2) ? '#4ade80' : (currentPhase === 3 ? '#facc15' : '#f43f5e');
    const ewLeftColor = (currentPhase === 4) ? '#4ade80' : (currentPhase === 5 ? '#facc15' : '#f43f5e');
    const ewThruColor = (currentPhase === 6) ? '#4ade80' : (currentPhase === 7 ? '#facc15' : '#f43f5e');

    // North Signal Heads
    drawSignal(290, 205, nsLeftColor);
    drawSignal(250, 205, nsThruColor);

    // South Signal Heads
    drawSignal(310, 395, nsLeftColor);
    drawSignal(350, 395, nsThruColor);

    // West Signal Heads
    drawSignal(205, 310, ewLeftColor);
    drawSignal(205, 350, ewThruColor);

    // East Signal Heads
    drawSignal(395, 290, ewLeftColor);
    drawSignal(395, 250, ewThruColor);
}

function drawSignal(x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function gameLoop() {
    phaseTime += 0.016;

    let targetDuration = 0;
    if (currentPhase === 0) targetDuration = g_NS_Left;
    else if (currentPhase === 1) targetDuration = yellowDuration;
    else if (currentPhase === 2) targetDuration = g_NS_Thru;
    else if (currentPhase === 3) targetDuration = yellowDuration;
    else if (currentPhase === 4) targetDuration = g_EW_Left;
    else if (currentPhase === 5) targetDuration = yellowDuration;
    else if (currentPhase === 6) targetDuration = g_EW_Thru;
    else if (currentPhase === 7) targetDuration = yellowDuration;

    if (phaseTime >= targetDuration) {
        phaseTime = 0;
        currentPhase = (currentPhase + 1) % 8;
    }

    const phaseNames = [
        "N-S LEFT GREEN", "N-S LEFT YELLOW", 
        "N-S THRU GREEN", "N-S THRU YELLOW",
        "E-W LEFT GREEN", "E-W LEFT YELLOW", 
        "E-W THRU GREEN", "E-W THRU YELLOW"
    ];
    const phaseColors = [
        "#4ade80", "#facc15", 
        "#4ade80", "#facc15",
        "#4ade80", "#facc15", 
        "#4ade80", "#facc15"
    ];

    const hud = document.getElementById('current-phase-display');
    hud.innerText = phaseNames[currentPhase];
    hud.style.color = phaseColors[currentPhase];
    document.getElementById('phase-timer').innerText = Math.max(0, targetDuration - phaseTime).toFixed(1);

    lastSpawnN += 0.016;
    lastSpawnS += 0.016;
    lastSpawnE += 0.016;
    lastSpawnW += 0.016;

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

    for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        car.move();
        car.draw();
        
        // Remove entities that exit the extended coordinate bounds
        if (car.x < -450 || car.x > 1050 || car.y < -450 || car.y > 1050) {
            cars.splice(i, 1);
        }
    }

    ctx.restore();

    if (isRunning) {
        animId = requestAnimationFrame(gameLoop);
    }
}

updateMath();
startSim();