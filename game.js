'use strict';

const CONFIG = {
  levels: [
    { name: 'DEPTH CORE 01', mazeW: 13, mazeH: 13, enemyCount: 3, viewDist: 14.0, detectRadius: 8.0, loopChance: 0.1, searchPersistence: 3.0 },
    { name: 'DEPTH CORE 02', mazeW: 17, mazeH: 17, enemyCount: 6, viewDist: 12.0, detectRadius: 10.0, loopChance: 0.15, searchPersistence: 4.5 },
    { name: 'DEPTH CORE 03', mazeW: 23, mazeH: 23, enemyCount: 9, viewDist: 10.0, detectRadius: 12.0, loopChance: 0.2, searchPersistence: 6.0 }
  ],
  fov: Math.PI / 3.2,
  moveSpeed: 2.2,
  runMultiplier: 1.6,
  turnSpeed: 2.2,
  mouseSensitivity: 0.0032,
  mousePitchSensitivity: 0.16,
  playerRadius: 0.28,
  maxHealth: 100,
  fireDamageMin: 20,
  fireDamageMax: 35,
  fireRange: 30,
  fireCooldown: 0.35,
  fireCone: 0.08,
  enemyHealth: 75,
  enemySpeed: 1.8,
  enemyRadius: 0.35,
  enemyContactDamage: 15,
  enemyAttackRange: 1.1,
  enemyAttackCooldown: 0.7,
  enemyRepathInterval: 0.4
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }

function hashCell(x, y) {
  let h = (x * 374761393 + y * 668265263) ^ 0x9E3779B9;
  return ((Math.imul(h ^ (h >>> 13), 1274126177) ^ 0x1243) >>> 0) / 4294967295;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

class MazeGenerator {
  constructor(w, h, rng, loopChance) {
    this.w = w % 2 === 0 ? w + 1 : w;
    this.h = h % 2 === 0 ? h + 1 : h;
    this.rng = rng;
    this.grid = new Uint8Array(this.w * this.h).fill(1);
    this.decorations = new Uint8Array(this.w * this.h).fill(0); // 1=Sculpture, 2=Chair, 3=Table, 4=Wardrobe
    this._carve();
    this._addLoops(loopChance);
    this._populateDecorations();
  }
  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 1;
    return this.grid[this.idx(x, y)];
  }
  set(x, y, v) { this.grid[this.idx(x, y)] = v; }

  _carve() {
    const stack = [[1, 1]];
    this.set(1, 1, 0);
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = [];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (this.inBounds(nx, ny) && this.get(nx, ny) === 1) opts.push([nx, ny, dx, dy]);
      }
      if (opts.length === 0) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = opts[Math.floor(this.rng() * opts.length)];
      this.set(cx + dx / 2, cy + dy / 2, 0);
      this.set(nx, ny, 0);
      stack.push([nx, ny]);
    }
  }

  _addLoops(chance) {
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.get(x, y) === 1 && this.rng() < chance) {
          const n = this.get(x, y - 1), s = this.get(x, y + 1);
          const e = this.get(x + 1, y), wv = this.get(x - 1, y);
          if ((n === 0 && s === 0) || (e === 0 && wv === 0)) this.set(x, y, 0);
        }
      }
    }
  }

  _populateDecorations() {
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (this.grid[this.idx(x, y)] === 0 && (x !== 1 || y !== 1)) {
          let h = hashCell(x, y);
          if (h < 0.16) {
            let type = Math.floor(h * 25) % 4 + 1;
            this.decorations[this.idx(x, y)] = type;
          }
        }
      }
    }
  }

  findFarthestCell(fromX, fromY) {
    const w = this.w, h = this.h;
    const visited = new Uint8Array(w * h);
    const queue = [[fromX, fromY, 0]];
    visited[this.idx(fromX, fromY)] = 1;
    let farthest = [fromX, fromY, 0];
    let qi = 0;
    while (qi < queue.length) {
      const [cx, cy, d] = queue[qi++];
      if (d > farthest[2]) farthest = [cx, cy, d];
      const neigh = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of neigh) {
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !visited[this.idx(nx, ny)] && this.get(nx, ny) === 0) {
          visited[this.idx(nx, ny)] = 1;
          queue.push([nx, ny, d + 1]);
        }
      }
    }
    return { x: farthest[0], y: farthest[1] };
  }

  getOpenCells() {
    const cells = [];
    for (let y = 1; y < this.h - 1; y++) for (let x = 1; x < this.w - 1; x++) if (this.get(x, y) === 0) cells.push([x, y]);
    return cells;
  }

  hasLineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist * 6);
    if (steps <= 1) return true;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.get(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t)) === 1) return false;
    }
    return true;
  }

  bfsPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [[sx, sy]];
    const w = this.w, h = this.h;
    const visited = new Uint8Array(w * h);
    const prev = new Int32Array(w * h).fill(-1);
    const startIdx = this.idx(sx, sy), targetIdx = this.idx(tx, ty);
    visited[startIdx] = 1;
    const queue = [startIdx];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (cur === targetIdx) break;
      const cx = cur % w, cy = (cur / w) | 0;
      const neigh = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of neigh) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = this.idx(nx, ny);
        if (!visited[ni] && this.get(nx, ny) === 0) { visited[ni] = 1; prev[ni] = cur; queue.push(ni); }
      }
    }
    if (!visited[targetIdx]) return null;
    const path = [];
    let cur = targetIdx;
    while (cur !== -1) { path.push([cur % w, (cur / w) | 0]); cur = prev[cur]; }
    path.reverse();
    return path;
  }
}

function castRay(px, py, angle, maze, maxDist) {
  const rayDirX = Math.cos(angle), rayDirY = Math.sin(angle);
  let mapX = Math.floor(px), mapY = Math.floor(py);
  const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
  const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
  let stepX, stepY, sideDistX, sideDistY;
  if (rayDirX < 0) { stepX = -1; sideDistX = (px - mapX) * deltaDistX; }
  else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaDistX; }
  if (rayDirY < 0) { stepY = -1; sideDistY = (py - mapY) * deltaDistY; }
  else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaDistY; }
  let hit = 0, side = 0, dist = 0;
  let guard = 0;
  while (hit === 0 && dist < maxDist && guard < 512) {
    guard++;
    if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
    else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
    if (maze.get(mapX, mapY) === 1) hit = 1;
    dist = side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
  }
  if (hit === 0) return null;
  let wallX = side === 0 ? py + dist * rayDirY : px + dist * rayDirX;
  wallX -= Math.floor(wallX);
  return { dist, side, mapX, mapY, wallX };
}

class Player {
  constructor(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.health = CONFIG.maxHealth;
    this.fireCooldownTimer = 0;
    this.footstepTimer = 0;
    this.bobPhase = 0;
    this.recoil = 0;
    this.pitch = 0;
    this.isMoving = false;
    this.isRunning = false;
  }
}

let enemyIdCounter = 0;
class Enemy {
  constructor(x, y) {
    this.id = enemyIdCounter++;
    this.x = x; this.y = y;
    this.health = CONFIG.enemyHealth;
    this.state = 'patrol';
    this.path = null;
    this.pathIndex = 0;
    this.repathTimer = Math.random() * 0.4;
    this.lastKnownPlayer = null;
    this.searchTimer = 0;
    this.attackCooldown = 0;
    this.growlCooldown = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.deathTimer = 0;
    this.alive = true;
    this.removed = false;
    this.hitFlash = 0;
    this.patrolTarget = null;
  }
}

class AudioManager {
  constructor() { this.ctx = null; this.ready = false; }
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.ready = true;
      this._startAmbient();
    } catch (e) { this.ready = false; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
  _noiseBuffer(duration) {
    const sr = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.max(1, Math.floor(sr * duration)), sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  playGunshot() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(0.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(1200, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    noise.start(t);
  }
  playFootstep() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(55 + Math.random() * 15, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.13);
  }
  playEnemyGrowl() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(50, t); osc.frequency.linearRampToValueAtTime(30, t + 0.6);
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 300;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t); gain.gain.linearRampToValueAtTime(0.3, t + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.61);
  }
  playHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.11);
  }
  playPlayerHurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.36);
  }
  playEnemyDeath() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.81);
  }
  playGameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [110, 98, 87, 65].forEach((f, i) => {
      const osc = this.ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.4);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t + i * 0.4); gain.gain.linearRampToValueAtTime(0.3, t + i * 0.4 + 0.1); gain.gain.linearRampToValueAtTime(0.001, t + i * 0.4 + 0.7);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t + i * 0.4); osc.stop(t + i * 0.4 + 0.75);
    });
  }
  playVictory() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [261, 329, 392, 523].forEach((f, i) => {
      const osc = this.ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.15);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t + i * 0.15); gain.gain.linearRampToValueAtTime(0.2, t + i * 0.15 + 0.05); gain.gain.linearRampToValueAtTime(0.001, t + i * 0.15 + 0.5);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + 0.55);
    });
  }
  _startAmbient() {
    const osc1 = this.ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = 40;
    const osc2 = this.ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 41.5;
    const gain = this.ctx.createGain(); gain.gain.value = 0.06;
    osc1.connect(gain); osc2.connect(gain); gain.connect(this.ctx.destination);
    osc1.start(); osc2.start();
  }
}

class Joystick {
  constructor(zoneEl, stickEl, radius) {
    this.zone = zoneEl; this.stick = stickEl; this.radius = radius;
    this.active = false; this.pointerId = null;
    this.value = { x: 0, y: 0 };
    this.centerX = 0; this.centerY = 0;
    zoneEl.style.touchAction = 'none';
    zoneEl.addEventListener('pointerdown', (e) => this._onDown(e));
    zoneEl.addEventListener('pointermove', (e) => this._onMove(e));
    zoneEl.addEventListener('pointerup', (e) => this._onUp(e));
    zoneEl.addEventListener('pointercancel', (e) => this._onUp(e));
  }
  _onDown(e) {
    if (this.active) return;
    this.active = true; this.pointerId = e.pointerId;
    try { this.zone.setPointerCapture(e.pointerId); } catch (err) {}
    const rect = this.zone.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this._update(e.clientX, e.clientY);
    e.preventDefault();
  }
  _onMove(e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this._update(e.clientX, e.clientY);
    e.preventDefault();
  }
  _onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.active = false; this.pointerId = null;
    this.value.x = 0; this.value.y = 0;
    this.stick.style.transform = 'translate(-50%, -50%)';
  }
  _update(px, py) {
    let dx = px - this.centerX, dy = py - this.centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > this.radius) { dx = (dx / dist) * this.radius; dy = (dy / dist) * this.radius; }
    this.value.x = dx / this.radius; this.value.y = dy / this.radius;
    this.stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('viewCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioManager();
    this.state = 'popup'; // popup | menu | playing | paused | gameover | victory
    this.platformMode = null; // 'pc' | 'mobile'
    this.seedNumeric = 0;
    this.rng = mulberry32(1);
    this.levelIndex = 0;
    this.maze = null;
    this.exitPos = null;
    this.player = null;
    this.enemies = [];
    this.tracers = [];
    this.zbuffer = new Float32Array(1);
    this.score = 0;
    this.kills = 0;
    this.startTime = 0;
    this.isFiring = false;

    this.keys = {};
    this.mobileLookOffset = { angle: 0, pitch: 0 };

    this._bindPlatformPopup();
    this._bindDom();
    this._bindInput();
    this._bindPointerLockUI();
    this._resize();

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));

    this._newSeedForMenu();
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _bindPlatformPopup() {
    document.getElementById('choosePcBtn').addEventListener('click', () => this._setPlatform('pc'));
    document.getElementById('chooseMobileBtn').addEventListener('click', () => this._setPlatform('mobile'));
  }

  _setPlatform(mode) {
    this.platformMode = mode;
    document.getElementById('platformPopup').classList.add('hidden');

    const instr = document.getElementById('controlInstructions');
    const touchLayer = document.getElementById('touchLayer');

    if (mode === 'pc') {
      instr.innerHTML = "PC PROTOCOL :: MOVE via Arrow/WASD Keys &middot; AIM via Mouse Motion &middot; DISCHARGE via F Key";
      touchLayer.classList.add('hidden');
      this.canvas.addEventListener('click', () => {
        if (this.state === 'playing' && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
      });
    } else {
      instr.innerHTML = "MOBILE PROTOCOL :: MOVE via Left Joystick &middot; DRAG Screen to Pan View &middot; AUTOMATIC Combat Systems Engaged";
      touchLayer.classList.remove('hidden');
      this._initDeviceMotion();
    }

    this.state = 'menu';
    this._showScreen('menu');
  }

  _initDeviceMotion() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      this.canvas.addEventListener('click', () => {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') window.addEventListener('deviceorientation', (e) => this._handleMotion(e));
        }).catch(console.error);
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', (e) => this._handleMotion(e));
    }

    // Canvas touch sweep look mechanics for fallback mobile setups
    let startX = 0, startY = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    });
    this.canvas.addEventListener('touchmove', (e) => {
      if (this.state !== 'playing') return;
      let dx = e.touches[0].clientX - startX;
      let dy = e.touches[0].clientY - startY;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      if (this.player) {
        this.player.angle += dx * 0.005;
        this.player.pitch = clamp(this.player.pitch - dy * 0.3, -50, 50);
      }
    });
  }

  _handleMotion(e) {
    if (this.state !== 'playing' || !this.player) return;
    if (e.gamma !== null && e.beta !== null) {
      // Direct landscape gyroscope orientation projection mapping
      let rotationSpeed = window.orientation === 90 ? -e.beta : e.beta;
      if (Math.abs(rotationSpeed) > 1.5) this.player.angle += rotationSpeed * 0.0003;
    }
  }

  _bindDom() {
    this.el = {
      menu: document.getElementById('menuScreen'),
      pause: document.getElementById('pauseScreen'),
      gameOver: document.getElementById('gameOverScreen'),
      victory: document.getElementById('victoryScreen'),
      root: document.getElementById('gameRoot'),
      seedDisplay: document.getElementById('seedDisplay'),
      healthFill: document.getElementById('healthFill'),
      healthNum: document.getElementById('healthNum'),
      levelLabel: document.getElementById('levelLabel'),
      scoreNum: document.getElementById('scoreNum'),
      radarCanvas: document.getElementById('radarCanvas'),
      compassTrack: document.getElementById('compassTrack'),
      compassStrip: document.getElementById('compassStrip'),
      objectiveToast: document.getElementById('objectiveToast'),
      hitMarker: document.getElementById('hitMarker'),
      damageDir: document.getElementById('damageDirIndicator'),
      flashOverlay: document.getElementById('flashOverlay'),
      lockLostPrompt: document.getElementById('lockLostPrompt'),
      goLevel: document.getElementById('goLevel'),
      goKills: document.getElementById('goKills'),
      goTime: document.getElementById('goTime'),
      goScore: document.getElementById('goScore'),
      vKills: document.getElementById('vKills'),
      vTime: document.getElementById('vTime'),
      vScore: document.getElementById('vScore')
    };
    this.radarCtx = this.el.radarCanvas.getContext('2d');
    this._buildCompassTrack();

    const gesture = () => { this.audio.init(); this.audio.resume(); };

    document.getElementById('startBtn').addEventListener('click', () => { gesture(); this._startNewGame(); });
    document.getElementById('regenBtn').addEventListener('click', () => { this._newSeedForMenu(); });
    document.getElementById('pauseBtn').addEventListener('click', () => this._pause());
    document.getElementById('resumeBtn').addEventListener('click', () => { gesture(); this._resumeGame(); });
    document.getElementById('restartFromPauseBtn').addEventListener('click', () => { gesture(); this._startNewGame(); });
    document.getElementById('quitBtn').addEventListener('click', () => this._toMenu());
    document.getElementById('retryBtn').addEventListener('click', () => { gesture(); this._startNewGame(); });
    document.getElementById('menuFromGoBtn').addEventListener('click', () => this._toMenu());
    document.getElementById('playAgainBtn').addEventListener('click', () => { gesture(); this._startNewGame(); });
    document.getElementById('menuFromVBtn').addEventListener('click', () => this._toMenu());
  }

  _buildCompassTrack() {
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    this.pxPerDeg = 4;
    let html = '';
    for (let deg = -360; deg <= 720; deg += 15) {
      const mod = ((deg % 360) + 360) % 360;
      const isCardinal = mod % 45 === 0;
      const label = isCardinal ? labels[(mod / 45) % 8] : '\u00B7';
      const left = (deg + 360) * this.pxPerDeg;
      html += `<span style="position:absolute;left:${left}px;top:0;transform:translateX(-50%);${isCardinal ? 'color:#ff3333;font-weight:700;' : 'opacity:0.3;'}">${label}</span>`;
    }
    this.el.compassTrack.innerHTML = html;
    this.el.compassTrack.style.position = 'relative';
  }

  _newSeedForMenu() {
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    this._pendingSeed = seed;
    this.el.seedDisplay.textContent = seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
  }

  _bindInput() {
    this.moveJoystick = new Joystick(document.getElementById('moveZone'), document.getElementById('moveStick'), 40);
    this.lookJoystick = new Joystick(document.getElementById('lookZone'), document.getElementById('lookStick'), 40);

    // PC Keyboard Listeners
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'f' && this.platformMode === 'pc') {
        this.isFiring = true;
        this._tryFire();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      if (e.key.toLowerCase() === 'f') this.isFiring = false;
    });

    // PC Mouse Look Listener -- uses movementX/Y (relative delta) rather than
    // absolute clientX/Y, since with the pointer locked the cursor position
    // itself is meaningless; only frame-to-frame movement matters.
    document.addEventListener('mousemove', (e) => {
      if (this.state === 'playing' && this.platformMode === 'pc' && document.pointerLockElement === this.canvas) {
        this.player.angle = normalizeAngle(this.player.angle + e.movementX * CONFIG.mouseSensitivity * 20);
        this.player.pitch = clamp(this.player.pitch - e.movementY * CONFIG.mousePitchSensitivity, -55, 55);
      }
    });

    // Touch Action Triggers
    const runBtn = document.getElementById('runBtn');
    runBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._isRunHeld = true; });
    runBtn.addEventListener('pointerup', () => { this._isRunHeld = false; });

    document.getElementById('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); this._triggerJumpBob(); });

    const fireBtn = document.getElementById('fireBtn');
    fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.isFiring = true; this._tryFire(); });
    fireBtn.addEventListener('pointerup', () => { this.isFiring = false; });
  }

  _bindPointerLockUI() {
    // Shows a "click to resume" prompt whenever the pointer lock is lost
    // mid-game (Esc key, tab switch, etc.) so PC aiming never silently breaks.
    const prompt = document.getElementById('lockLostPrompt');
    const evaluate = () => {
      if (this.platformMode !== 'pc') { prompt.classList.add('hidden'); return; }
      const locked = document.pointerLockElement === this.canvas;
      prompt.classList.toggle('hidden', locked || this.state !== 'playing');
    };
    document.addEventListener('pointerlockchange', evaluate);
    prompt.addEventListener('click', () => {
      if (this.state === 'playing' && this.platformMode === 'pc') this.canvas.requestPointerLock();
    });
    this._evaluateLockPrompt = evaluate;
  }

  _triggerJumpBob() { if (!this._jumpBobTimer) this._jumpBobTimer = 0.001; }

  _showScreen(name) {
    document.getElementById('platformPopup').classList.toggle('hidden', name !== 'popup');
    this.el.menu.classList.toggle('hidden', name !== 'menu');
    this.el.pause.classList.toggle('hidden', name !== 'pause');
    this.el.gameOver.classList.toggle('hidden', name !== 'gameover');
    this.el.victory.classList.toggle('hidden', name !== 'victory');
    this.el.root.classList.toggle('hidden', name !== 'playing');
    if (this._evaluateLockPrompt) this._evaluateLockPrompt();
  }

  _toMenu() { this.state = 'menu'; document.exitPointerLock?.(); this._newSeedForMenu(); this._showScreen('menu'); }
  _pause() { if (this.state !== 'playing') return; this.state = 'paused'; document.exitPointerLock?.(); this._showScreen('pause'); }
  _resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing'; this._lastTime = performance.now(); this._showScreen('playing');
    if (this.platformMode === 'pc') this.canvas.requestPointerLock();
  }

  _startNewGame(seed) {
    this.seedNumeric = seed !== undefined ? seed : this._pendingSeed;
    this.rng = mulberry32(this.seedNumeric);
    this.score = 0; this.kills = 0; this.levelIndex = 0;
    this.startTime = performance.now();
    this._loadLevel(0, CONFIG.maxHealth);
    this.state = 'playing';
    this._lastTime = performance.now();
    this._showScreen('playing');
    if (this.platformMode === 'pc') this.canvas.requestPointerLock();
  }

  _loadLevel(index, carryHealth) {
    const cfg = CONFIG.levels[index];
    const levelRng = mulberry32((this.seedNumeric ^ (index * 0x1000193)) >>> 0);
    this.maze = new MazeGenerator(cfg.mazeW, cfg.mazeH, levelRng, cfg.loopChance);
    this.levelIndex = index; this.levelCfg = cfg;

    this.player = new Player(1.5, 1.5, 0);
    this.player.health = carryHealth !== undefined ? carryHealth : CONFIG.maxHealth;

    const far = this.maze.findFarthestCell(1, 1);
    this.exitPos = { x: far.x + 0.5, y: far.y + 0.5 };

    const openCells = this.maze.getOpenCells().filter(([x, y]) => Math.hypot(x - 1.5, y - 1.5) > 5);
    this.enemies = [];
    for (let i = 0; i < cfg.enemyCount; i++) {
      if (openCells.length === 0) break;
      const idx = Math.floor(levelRng() * openCells.length);
      const pick = openCells.splice(idx, 1)[0];
      this.enemies.push(new Enemy(pick[0] + 0.5, pick[1] + 0.5));
    }
    this.tracers = [];
    this.el.levelLabel.textContent = cfg.name;
    this._showToast(index === 0 ? 'VOID CONSTRUCTION ACTIVE: FIND EXIT' : 'SECTOR STABLE: DEEPENING DESCENT');
  }

  _gameOver() { this.state = 'gameover'; this.audio.playGameOver(); document.exitPointerLock?.(); this._fillEndMetrics(this.el.goLevel, this.el.goKills, this.el.goTime, this.el.goScore); this._showScreen('gameover'); }
  _victory() { this.state = 'victory'; this.audio.playVictory(); document.exitPointerLock?.(); this._fillEndMetrics(null, this.el.vKills, this.el.vTime, this.el.vScore); this._showScreen('victory'); }

  _fillEndMetrics(lvlEl, kEl, tEl, sEl) {
    const elapsed = (performance.now() - this.startTime) / 1000;
    if (lvlEl) lvlEl.textContent = String(this.levelIndex + 1);
    kEl.textContent = String(this.kills);
    tEl.textContent = formatTime(elapsed);
    sEl.textContent = String(this.score);
  }

  _showToast(text) {
    const el = this.el.objectiveToast; el.textContent = text;
    el.classList.remove('toast-active'); void el.offsetWidth; el.classList.add('toast-active');
  }
  _showHitMarker() { this._pulse(this.el.hitMarker, 'show'); }
  _showDamageFlash() {
    this._pulse(this.el.damageDir, 'show');
    this.el.flashOverlay.style.transition = 'none'; this.el.flashOverlay.style.opacity = '0.5';
    requestAnimationFrame(() => { this.el.flashOverlay.style.transition = 'opacity 0.3s ease'; this.el.flashOverlay.style.opacity = '0'; });
  }
  _pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    const renderWidth = Math.max(320, Math.min(640, Math.round(w * 0.4)));
    this.canvas.width = renderWidth;
    this.canvas.height = Math.round(renderWidth * (h / w));
    this.zbuffer = new Float32Array(this.canvas.width);
  }

  _tryFire() {
    if (this.state !== 'playing' || this.player.fireCooldownTimer > 0) return;
    this.player.fireCooldownTimer = CONFIG.fireCooldown;
    this.player.recoil = 1.2;
    this.audio.playGunshot();
    this.tracers.push({ life: 0.08, maxLife: 0.08 });

    let target = null, minDist = Infinity;
    for (const en of this.enemies) {
      if (!en.alive) continue;
      const dx = en.x - this.player.x, dy = en.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > CONFIG.fireRange) continue;
      const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - this.player.angle));
      if (diff < CONFIG.fireCone && dist < minDist && this.maze.hasLineOfSight(this.player.x, this.player.y, en.x, en.y)) {
        minDist = dist; target = en;
      }
    }
    if (target) {
      target.health -= CONFIG.fireDamageMin + this.rng() * (CONFIG.fireDamageMax - CONFIG.fireDamageMin);
      target.hitFlash = 0.12; this.audio.playHit(); this._showHitMarker();
      if (target.health <= 0) {
        target.alive = false; target.state = 'dead'; this.audio.playEnemyDeath();
        this.kills++; this.score += 150;
      }
    }
  }

  _reachExit() {
    if (this.levelIndex < CONFIG.levels.length - 1) {
      this._loadLevel(this.levelIndex + 1, this.player.health);
    } else {
      this._victory();
    }
  }

  _loop(now) {
    let dt = Math.min((now - this._lastTime) / 1000, 0.04);
    this._lastTime = now;
    if (this.state === 'playing') this._update(dt);
    this._renderFrame();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    const p = this.player;

    // Mobile Autofire Routines
    if (this.platformMode === 'mobile') {
      let enemyAimed = false;
      for (const en of this.enemies) {
        if (!en.alive) continue;
        const dist = Math.hypot(en.x - p.x, en.y - p.y);
        if (dist < 8 && this.maze.hasLineOfSight(p.x, p.y, en.x, en.y)) {
          let targetAngle = Math.atan2(en.y - p.y, en.x - p.x);
          p.angle = lerp(p.angle, targetAngle, 0.08); // Automatic magnetic tracking lock
          enemyAimed = true;
          break;
        }
      }
      if (enemyAimed && p.fireCooldownTimer <= 0) this._tryFire();
    }

    // Input Movement Integrator Mapping
    let moveX = 0, moveY = 0;
    if (this.platformMode === 'pc') {
      if (this.keys['arrowup'] || this.keys['w']) moveY += 1;
      if (this.keys['arrowdown'] || this.keys['s']) moveY -= 1;
      if (this.keys['arrowleft'] || this.keys['a']) moveX -= 1;
      if (this.keys['arrowright'] || this.keys['d']) moveX += 1;
      this._isRunning = this.keys['shift'];
    } else {
      moveX = this.moveJoystick.value.x;
      moveY = -this.moveJoystick.value.y;
      const lk = this.lookJoystick.value;
      p.angle += lk.x * CONFIG.turnSpeed * dt;
      p.pitch = clamp(p.pitch - lk.y * 40 * dt, -50, 50);
      this._isRunning = this._isRunHeld;
    }

    const currentSpeed = CONFIG.moveSpeed * (this._isRunning ? CONFIG.runMultiplier : 1);
    const dx = (Math.cos(p.angle) * moveY + Math.cos(p.angle + Math.PI / 2) * moveX) * currentSpeed * dt;
    const dy = (Math.sin(p.angle) * moveY + Math.sin(p.angle + Math.PI / 2) * moveX) * currentSpeed * dt;

    p.isMoving = Math.hypot(dx, dy) > 0.001;
    this._tryMoveEntity(p, dx, dy, CONFIG.playerRadius);

    if (p.isMoving) {
      p.bobPhase += dt * (this._isRunning ? 11 : 7);
      p.footstepTimer -= dt;
      if (p.footstepTimer <= 0) { this.audio.playFootstep(); p.footstepTimer = this._isRunning ? 0.24 : 0.38; }
    } else {
      p.bobPhase = lerp(p.bobPhase, 0, 0.15);
    }

    if (p.fireCooldownTimer > 0) p.fireCooldownTimer -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 7);
    this.tracers.forEach(tr => tr.life -= dt);
    this.tracers = this.tracers.filter(tr => tr.life > 0);

    if (this._jumpBobTimer) {
      this._jumpBobTimer += dt;
      if (this._jumpBobTimer > 0.4) this._jumpBobTimer = 0;
    }

    // Enemy state processors
    for (const en of this.enemies) this._updateEnemy(en, dt);
    this.enemies = this.enemies.filter(en => !en.removed);

    const distToExit = Math.hypot(p.x - this.exitPos.x, p.y - this.exitPos.y);
    if (distToExit < 0.6) this._reachExit();

    if (p.health <= 0) this._gameOver();
  }

  _tryMoveEntity(ent, dx, dy, r) {
    let nx = ent.x + dx, ny = ent.y + dy;
    if (this.maze.get(Math.floor(nx), Math.floor(ent.y)) === 0) ent.x = nx;
    if (this.maze.get(Math.floor(ent.x), Math.floor(ny)) === 0) ent.y = ny;
  }

  _updateEnemy(en, dt) {
    if (!en.alive) {
      en.deathTimer += dt;
      if (en.deathTimer > 1.5) en.removed = true;
      return;
    }
    if (en.hitFlash > 0) en.hitFlash -= dt;
    if (en.attackCooldown > 0) en.attackCooldown -= dt;
    if (en.growlCooldown > 0) en.growlCooldown -= dt;

    const dist = Math.hypot(this.player.x - en.x, this.player.y - en.y);
    const los = this.maze.hasLineOfSight(en.x, en.y, this.player.x, this.player.y);

    if (los && dist < this.levelCfg.detectRadius) {
      if (en.state !== 'chase' && en.growlCooldown <= 0) {
        this.audio.playEnemyGrowl(); en.growlCooldown = 3.5;
      }
      en.state = 'chase'; en.lastKnownPlayer = { x: this.player.x, y: this.player.y };
      en.searchTimer = this.levelCfg.searchPersistence;
    } else if (en.state === 'chase') {
      en.searchTimer -= dt;
      if (en.searchTimer <= 0) en.state = 'patrol';
    }

    if (en.state === 'chase') {
      en.repathTimer -= dt;
      if (en.repathTimer <= 0) {
        en.repathTimer = CONFIG.enemyRepathInterval;
        const targetX = en.lastKnownPlayer ? en.lastKnownPlayer.x : this.player.x;
        const targetY = en.lastKnownPlayer ? en.lastKnownPlayer.y : this.player.y;
        en.path = this.maze.bfsPath(Math.floor(en.x), Math.floor(en.y), Math.floor(targetX), Math.floor(targetY));
        en.pathIndex = 0;
      }
      this._followPath(en, dt);

      if (dist <= CONFIG.enemyAttackRange && en.attackCooldown <= 0) {
        this.player.health -= CONFIG.enemyContactDamage;
        en.attackCooldown = CONFIG.enemyAttackCooldown;
        this.audio.playPlayerHurt(); this._showDamageFlash();
      }
    } else {
      // Basic patrol updates
      en.state = 'patrol';
      en.repathTimer -= dt;
      if (!en.path || en.pathIndex >= en.path.length || en.repathTimer <= 0) {
        en.repathTimer = 2.0;
        const cells = this.maze.getOpenCells();
        const pick = cells[Math.floor(hashCell(Math.floor(en.x), Math.floor(en.y)) * cells.length)];
        en.path = this.maze.bfsPath(Math.floor(en.x), Math.floor(en.y), pick[0], pick[1]);
        en.pathIndex = 0;
      }
      this._followPath(en, dt);
    }
  }

  _followPath(en, dt) {
    if (!en.path || en.pathIndex >= en.path.length) return;
    const targetCell = en.path[en.pathIndex];
    const tx = targetCell[0] + 0.5, ty = targetCell[1] + 0.5;
    const ex = tx - en.x, ey = ty - en.y;
    const d = Math.hypot(ex, ey);
    if (d < 0.2) {
      en.pathIndex++;
    } else {
      en.angle = Math.atan2(ey, ex);
      this._tryMoveEntity(en, Math.cos(en.angle) * CONFIG.enemySpeed * dt, Math.sin(en.angle) * CONFIG.enemySpeed * dt, CONFIG.enemyRadius);
    }
  }

  _renderFrame() {
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.fillStyle = '#010000'; this.ctx.fillRect(0, 0, w, h);

    if (this.state === 'popup' || !this.player) return;

    const p = this.player;
    let bobY = Math.sin(p.bobPhase) * 0.05;
    if (this._jumpBobTimer) {
      bobY -= Math.sin((this._jumpBobTimer / 0.4) * Math.PI) * 0.35;
    }
    const horizon = Math.round(h / 2 + p.pitch + bobY * h);

    // 1. Raycasted Core Maze Engine Geometry (Narrow Roads & Heavy Column Thick Walls)
    for (let x = 0; x < w; x++) {
      const rayAngle = normalizeAngle((p.angle - CONFIG.fov / 2) + (x / w) * CONFIG.fov);
      const ray = castRay(p.x, p.y, rayAngle, this.maze, this.levelCfg.viewDist);

      if (ray) {
        const corrDist = ray.dist * Math.cos(rayAngle - p.angle);
        this.zbuffer[x] = corrDist;
        const wallH = Math.round((h / corrDist) * 1.1);
        const top = horizon - wallH / 2;
        const bottom = horizon + wallH / 2;

        // Dynamic High-Contrast Shadow Ambience Falloff
        let ambience = Math.max(0, 1 - (corrDist / this.levelCfg.viewDist));

        // Custom Code Overhead Fixture Light Calculations
        let lightCenterDistance = Math.abs(ray.wallX - 0.5);
        let lightConeEffect = Math.max(0, 1 - (lightCenterDistance * 2.5)) * 0.35;
        let finalBrightness = clamp((ray.side === 1 ? ambience * 0.4 : ambience * 0.65) + lightConeEffect, 0, 1);

        // Procedural Structural Wall Profiles (Monolithic brutalist panel columns)
        let r = Math.floor(18 * finalBrightness);
        let g = Math.floor(12 * finalBrightness);
        let b = Math.floor(8 * finalBrightness);

        // Structural lines overlay
        if (ray.wallX < 0.03 || ray.wallX > 0.97) { r += 15; g += 5; }

        this.ctx.fillStyle = `rgb(${r},${g},${b})`;
        this.ctx.fillRect(x, top, 1, wallH);

        // Floor ceiling procedural tracking paths
        this.ctx.fillStyle = '#060403';
        this.ctx.fillRect(x, 0, 1, top);
        this.ctx.fillStyle = '#020202';
        this.ctx.fillRect(x, bottom, 1, h - bottom);
      } else {
        this.zbuffer[x] = this.levelCfg.viewDist;
      }
    }

    // 2. Procedural Furniture & Structural Props Layer Projection
    this._renderStructuralProps(w, h, horizon);

    // 3. Cybernetic Dark Villain Structural Bezier Engine
    this._renderDarkVillains(w, h, horizon);

    // 4. Combat Overlay Gun Systems Drawing Layout
    this._drawWeaponSystems(w, h, bobY);

    // 5. Interface HUD Minimap Update Modules
    this._updateInterfaceHUD();
  }

  _renderStructuralProps(w, h, horizon) {
    const p = this.player;
    let items = [];
    for (let y = 1; y < this.maze.h - 1; y++) {
      for (let x = 1; x < this.maze.w - 1; x++) {
        let type = this.maze.decorations[this.maze.idx(x, y)];
        if (type > 0) {
          let itemX = x + 0.5, itemY = y + 0.5;
          let dx = itemX - p.x, dy = itemY - p.y;
          let dist = Math.hypot(dx, dy);
          if (dist < this.levelCfg.viewDist && dist > 0.3) {
            let angleTo = Math.atan2(dy, dx);
            let diff = normalizeAngle(angleTo - p.angle);
            if (Math.abs(diff) < CONFIG.fov) items.push({ x: itemX, y: itemY, dist, diff, type });
          }
        }
      }
    }
    items.sort((a, b) => b.dist - a.dist);

    items.forEach(it => {
      let spriteX = Math.round((w / 2) + (Math.tan(it.diff) * (w / CONFIG.fov)));
      let propSize = Math.round((h / it.dist) * 0.7);
      let baseOffsetY = horizon + (h / it.dist) / 2 - propSize;
      let leftX = Math.round(spriteX - propSize / 2);

      let light = Math.max(0, 1 - (it.dist / this.levelCfg.viewDist));

      for (let sx = 0; sx < propSize; sx++) {
        let screenX = leftX + sx;
        if (screenX >= 0 && screenX < w && this.zbuffer[screenX] > it.dist) {
          this.ctx.save();
          this.ctx.globalAlpha = light;
          // Render based on custom vector code structures
          if (it.type === 1) { // Sculpture Pillars
            this.ctx.fillStyle = `rgb(${Math.floor(25 * light)},0,0)`;
            this.ctx.fillRect(screenX, baseOffsetY, 1, propSize);
            this.ctx.fillStyle = `rgb(${Math.floor(45 * light)},${Math.floor(40 * light)},${Math.floor(35 * light)})`;
            this.ctx.fillRect(screenX, baseOffsetY + Math.round(propSize * 0.2), 1, Math.round(propSize * 0.7));
          } else if (it.type === 2) { // Industrial Chairs
            this.ctx.fillStyle = `rgb(${Math.floor(15 * light)},${Math.floor(12 * light)},${Math.floor(10 * light)})`;
            this.ctx.fillRect(screenX, baseOffsetY + Math.round(propSize * 0.4), 1, Math.round(propSize * 0.6));
          } else { // Generic Structural Tables/Wardrobes
            this.ctx.fillStyle = `rgb(${Math.floor(20 * light)},${Math.floor(16 * light)},${Math.floor(12 * light)})`;
            this.ctx.fillRect(screenX, baseOffsetY + Math.round(propSize * 0.1), 1, Math.round(propSize * 0.9));
          }
          this.ctx.restore();
        }
      }
    });
  }

  _renderDarkVillains(w, h, horizon) {
    const p = this.player;
    let activeRoster = this.enemies.filter(en => !en.removed);
    activeRoster.forEach(en => {
      en.dist = Math.hypot(en.x - p.x, en.y - p.y);
      en.diff = normalizeAngle(Math.atan2(en.y - p.y, en.x - p.x) - p.angle);
    });
    activeRoster.sort((a, b) => b.dist - a.dist);

    activeRoster.forEach(en => {
      if (en.dist > this.levelCfg.viewDist || Math.abs(en.diff) > CONFIG.fov * 1.2) return;

      let spriteX = (w / 2) + (Math.tan(en.diff) * (w / CONFIG.fov));
      let eSize = Math.round((h / en.dist) * 1.2);
      let eTop = horizon - eSize / 2 + Math.sin(en.bobPhase) * 10;

      let scale = eSize / 250;
      let light = Math.max(0, 1 - (en.dist / this.levelCfg.viewDist));

      // Horizontal sliced clip testing scan engine loop
      let startX = Math.round(spriteX - eSize / 2);
      let endX = Math.round(spriteX + eSize / 2);

      for (let sx = startX; sx < endX; sx++) {
        if (sx >= 0 && sx < w && this.zbuffer[sx] > en.dist) {
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.rect(sx, eTop, 1, eSize);
          this.ctx.clip();

          if (!en.alive) {
            // Death state pools collapse
            this.ctx.fillStyle = '#1a0202';
            this.ctx.fillRect(spriteX - eSize / 2, eTop + eSize * 0.6, eSize, eSize * 0.4);
            this.ctx.restore();
            continue;
          }

          // Custom code-based procedural generation drawing:
          // dark bio-mechanical segmented plates, curved horns, absolute dark tones & glowing mono eye core
          this.ctx.translate(spriteX, eTop + eSize / 2);
          this.ctx.scale(scale, scale);

          // Sub-layer shadow buffer depth base
          this.ctx.fillStyle = `rgba(5, 2, 2, ${light})`;
          this.ctx.beginPath();
          this.ctx.arc(0, -20, 65, 0, Math.PI * 2);
          this.ctx.fill();

          // Outward sweeping heavy curved spikes / berserker armor horns
          this.ctx.fillStyle = `rgb(${Math.floor(10 * light)}, 1, 1)`;
          this.ctx.beginPath();
          this.ctx.moveTo(-45, -70);
          this.ctx.quadraticCurveTo(-95, -140, -115, -80);
          this.ctx.quadraticCurveTo(-75, -50, -45, -40);
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.moveTo(45, -70);
          this.ctx.quadraticCurveTo(95, -140, 115, -80);
          this.ctx.quadraticCurveTo(75, -50, 45, -40);
          this.ctx.fill();

          // Angular jagged segmented core torso chassis
          this.ctx.fillStyle = `rgb(${Math.floor(16 * light)}, 3, 3)`;
          this.ctx.beginPath();
          this.ctx.moveTo(-55, -40);
          this.ctx.lineTo(55, -40);
          this.ctx.lineTo(75, 70);
          this.ctx.lineTo(-75, 70);
          this.ctx.closePath();
          this.ctx.fill();

          // Bio-mechanical rib plates interlaced rib lines
          this.ctx.strokeStyle = `rgb(${Math.floor(45 * light)}, 5, 5)`;
          this.ctx.lineWidth = 4;
          for (let i = -20; i <= 40; i += 15) {
            this.ctx.beginPath();
            this.ctx.moveTo(-45, i); this.ctx.lineTo(45, i);
            this.ctx.stroke();
          }

          // Dense hardened skull helmet overlay
          this.ctx.fillStyle = `rgb(${Math.floor(8 * light)}, 0, 0)`;
          this.ctx.beginPath();
          this.ctx.moveTo(-35, -50);
          this.ctx.lineTo(35, -50);
          this.ctx.lineTo(45, -95);
          this.ctx.lineTo(0, -125);
          this.ctx.lineTo(-45, -95);
          this.ctx.closePath();
          this.ctx.fill();

          // Crimson central gaze monochromatic eye core
          let flickerIntensity = 0.7 + Math.random() * 0.3;
          this.ctx.fillStyle = `rgba(255, 10, 10, ${light * flickerIntensity})`;
          this.ctx.shadowBlur = 25;
          this.ctx.shadowColor = '#ff0000';
          this.ctx.beginPath();
          this.ctx.arc(0, -80, 11, 0, Math.PI * 2);
          this.ctx.fill();

          // Hit-marker strobe flash overlay
          if (en.hitFlash > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${en.hitFlash * 6})`;
            this.ctx.fillRect(-100, -150, 200, 300);
          }

          this.ctx.restore();
        }
      }
    });
  }

  _drawWeaponSystems(w, h, bobY) {
    const p = this.player;
    let rec = p.recoil * 25;
    let wx = w * 0.68 - rec * 0.4;
    let wy = h * 0.72 + Math.abs(bobY) * h * 0.6 + rec;

    this.ctx.save();
    // Heavy anti-anomaly industrial kinetic cannon blueprint structure
    this.ctx.fillStyle = '#080605';
    this.ctx.fillRect(wx, wy, w * 0.16, h * 0.4);

    // Core weapon shroud rails
    this.ctx.fillStyle = '#1c1613';
    this.ctx.fillRect(wx - 4, wy + 20, w * 0.2, h * 0.12);

    // Muzzle flash processing
    if (p.fireCooldownTimer > CONFIG.fireCooldown - 0.06) {
      let fGrad = this.ctx.createRadialGradient(wx + 10, wy, 2, wx + 10, wy, 45);
      fGrad.addColorStop(0, '#ffffff'); fGrad.addColorStop(0.3, '#ff3333'); fGrad.addColorStop(1, 'transparent');
      this.ctx.fillStyle = fGrad;
      this.ctx.beginPath(); this.ctx.arc(wx + 10, wy, 40, 0, Math.PI * 2); this.ctx.fill();
    }
    this.ctx.restore();
  }

  _updateInterfaceHUD() {
    this.el.healthNum.textContent = String(Math.max(0, Math.floor(this.player.health)));
    this.el.healthFill.style.width = Math.max(0, this.player.health) + '%';
    this.el.scoreNum.textContent = String(this.score);

    // Compass engine slider processing track
    let angleDeg = (this.player.angle * 180 / Math.PI) % 360;
    if (angleDeg < 0) angleDeg += 360;
    let offset = -(angleDeg * this.pxPerDeg) - (360 * this.pxPerDeg);
    this.el.compassTrack.style.transform = `translateX(${offset}px)`;

    // Radar minimap blitter engine loop
    const rc = this.el.radarCanvas.width;
    this.radarCtx.fillStyle = 'rgba(2,1,1,0.85)'; this.radarCtx.fillRect(0, 0, rc, rc);

    let center = rc / 2;
    this.radarCtx.strokeStyle = 'rgba(255,51,51,0.25)'; this.radarCtx.lineWidth = 1;
    this.radarCtx.beginPath(); this.radarCtx.arc(center, center, center - 5, 0, Math.PI * 2); this.radarCtx.stroke();

    // Map units projection drawing loops
    if (!this.maze || !this.player) return;
    let rScale = 6;
    let px = this.player.x, py = this.player.y;

    for (let y = 0; y < this.maze.h; y++) {
      for (let x = 0; x < this.maze.w; x++) {
        if (this.maze.get(x, y) === 1) {
          let cx = center + (x + 0.5 - px) * rScale;
          let cy = center + (y + 0.5 - py) * rScale;
          if (Math.hypot(cx - center, cy - center) < center - 6) {
            this.radarCtx.fillStyle = '#1c0a0a';
            this.radarCtx.fillRect(cx - rScale / 2, cy - rScale / 2, rScale, rScale);
          }
        }
      }
    }

    // Anomalies on radar projection loop
    this.enemies.forEach(en => {
      if (!en.alive) return;
      let cx = center + (en.x - px) * rScale;
      let cy = center + (en.y - py) * rScale;
      if (Math.hypot(cx - center, cy - center) < center - 6) {
        this.radarCtx.fillStyle = '#ff0000';
        this.radarCtx.fillRect(cx - 2, cy - 2, 4, 4);
      }
    });

    // Draw player positioning core directional needle blit
    this.radarCtx.fillStyle = '#ffffff';
    this.radarCtx.beginPath(); this.radarCtx.arc(center, center, 3, 0, Math.PI * 2); this.radarCtx.fill();
  }
}

// Instantiate game engine matrix framework context initialization
window.addEventListener('DOMContentLoaded', () => { window.gameEngine = new Game(); });
