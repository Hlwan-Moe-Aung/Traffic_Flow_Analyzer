# 4-Way Traffic Signal Timing Simulator

An interactive, web-based microscopic traffic simulation and signal timing optimization system built with vanilla JavaScript and HTML5 Canvas. The simulator models real-time vehicle kinematics, driver perception-reaction delays, car-following behavior, and stochastic arrival rates at a major 4-way intersection (Pyay Road & Parami Road, Yangon).

---

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Mathematical & Kinematic Models](#mathematical--kinematic-models)
  - [1. Traffic Signal Timing Optimization](#1-traffic-signal-timing-optimization)
  - [2. Stochastic Vehicle Generation](#2-stochastic-vehicle-generation)
  - [3. Microscopic Car-Following & Kinematics](#3-microscopic-car-following--kinematics)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
- [User Interface Controls](#user-interface-controls)
- [Technical Specifications](#technical-specifications)
- [License](#license)

---

## Overview

Urban intersection efficiency relies on balancing traffic signal green allocations based on incoming vehicle arrival rates. This project provides a real-time 2D visual simulation of a 4-way, 3-lane intersection, dynamically calculating optimal green phase durations for North-South and East-West corridors using real-world arrival volume inputs.

---

## Key Features

* **Microscopic Traffic Simulation:** Models individual vehicle entity kinematics, including acceleration, deceleration, reaction time delay, and safe stopping headway.
* **Dynamic Signal Timing Calculation:** Recalculates effective green split allocations ($g_{NS}$ and $g_{EW}$) in real time whenever approach arrival rates change.
* **Stochastic Arrival Modeling:** Uses Poisson arrival processes with exponential inter-arrival distribution for realistic, non-uniform vehicle spawning.
* **Interactive Controls:** Includes simulation control execution (Start, Stop, Reset), live approach volume sliders, and viewport zoom controls (mouse wheel and UI buttons).
* **Zero External Dependencies:** Built entirely with native HTML5 Canvas, CSS3, and vanilla JavaScript (ES6+).

---

## Mathematical & Kinematic Models

### 1. Traffic Signal Timing Optimization

Given a fixed cycle length $C = 60\text{ seconds}$ and total lost time $L = 6\text{ seconds}$ (yellow transition phases):

$$\text{Effective Green Time } (g_{\text{eff}}) = C - L = 54\text{ seconds}$$

Approach arrival rates $V_N, V_S, V_E, V_W$ (vehicles/minute) determine corridor demand ratios:

$$V_{NS} = V_N + V_S, \quad V_{EW} = V_E + V_W$$

$$R_{NS} = \frac{V_{NS}}{\max(1, V_{NS} + V_{EW})}$$

$$g_{NS} = \max\left(5.0, \text{round}\left(g_{\text{eff}} \times R_{NS}, 1\right)\right)$$

$$g_{EW} = \max\left(5.0, \text{round}\left(g_{\text{eff}} - g_{NS}, 1\right)\right)$$

---

### 2. Stochastic Vehicle Generation

Vehicles spawn according to a Poisson arrival process. For an arrival rate $V$ (cars/min), the arrival rate parameter $\lambda$ (cars/second) is:

$$\lambda = \frac{V}{60}$$

The time headway $\Delta t$ between successive vehicle arrivals follows an exponential distribution:

$$\Delta t = - \frac{\ln(1 - U)}{\lambda}$$

where $U \sim \text{Uniform}(0, 1)$. Spatial clearance checks are enforced at entry nodes to prevent physical vehicle overlapping upon spawn.

---

### 3. Microscopic Car-Following & Kinematics

Each vehicle $i$ updates its speed $v_i$ and position $(x_i, y_i)$ at $60\text{ FPS}$ based on the minimum gap distance to either the traffic stop line or the preceding vehicle in the same lane:

1. **Perception-Reaction Time Delay:** Stopped vehicles experience a delayed acceleration trigger ($t_{\text{rxn}} \in [0.5, 1.0]\text{s}$) when light switches to green or queue clears.
2. **Safe Speed Calculation:**
   $$v_{\text{target}} = \min\left(v_{\text{max}}, \sqrt{2 \cdot d \cdot x_{\text{net}}}\right)$$
   where $d = 0.05\text{ px/frame}^2$ (deceleration) and $x_{\text{net}}$ is the net spatial headway clearance.
3. **Acceleration / Deceleration Profile:**
   $$v(t + \Delta t) = \min\Big(v(t) + a, v_{\text{target}}\Big) \quad \text{where } a \in [0.006, 0.010]\text{ px/frame}^2$$

---

## Project Architecture

```
├── index.html   # Main application markup & UI drawer structure
├── style.css    # Dark-theme styling, sidebar layout, and viewport canvas rules
├── script.js   # Canvas renderer, state engine, vehicle kinematics, & math models
└── README.md    # Documentation
```

---

## Getting Started

### Prerequisites
No build tools, bundlers, or web servers are required. Any modern web browser supporting HTML5 Canvas and ES6 JavaScript will run the application.

### Installation & Execution
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/4way-traffic-simulator.git
   cd 4way-traffic-simulator
   ```
2. Open `index.html` directly in your browser or serve via Local Web Server:
   ```bash
   # Using Python simple HTTP server
   python3 -m http.server 8000
   ```
3. Navigate to `http://localhost:8000` in your web browser.

---

## User Interface Controls

| Panel / Component | Description |
| :--- | :--- |
| **Start / Stop / Reset** | Manually start execution loop, pause rendering state, or reset phase timers and clear active vehicle entities. |
| **Approach Sliders** | Real-time arrival volume controls ($V_N, V_S, V_E, V_W$) ranging from $2$ to $50$ cars/min. |
| **Optimized Timing Output** | Live HUD showing total cycle duration, lost time, and calculated green allocations ($g_{NS}, g_{EW}$). |
| **Active Phase HUD** | Upper-right overlay displaying active signal state (Green/Yellow) and countdown timer. |
| **Zoom Controls** | Floating `+`, `-`, and `100%` buttons, plus mouse scroll wheel zooming over the intersection viewport. |

---

## Technical Specifications

* **Rendering Engine:** HTML5 2D Canvas API (`CanvasRenderingContext2D`)
* **Execution Loop:** `requestAnimationFrame()` frame-rate locked loop
* **Layout Structure:** Flexbox container with interactive sidebar drawer and responsive canvas viewport
* **Coordinate Space:** Offset canvas transformation grid supporting continuous scaling and multi-lane positioning

---

## License

This project is open-source and available under the [MIT License](LICENSE).
