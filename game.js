
'use strict';
/* ==========================================================================
   NO EXIT :: Backrooms Maze FPS
   Pure HTML5 Canvas + Vanilla JS raycasting engine. No dependencies.
   ========================================================================== */
 
/* ---------------------------------------------------------------------- */
/*  CONFIG                                                                 */
/* ---------------------------------------------------------------------- */
const CONFIG = {
  levels: [
    { name: 'LEVEL 1', mazeW: 21, mazeH: 21, enemyCount: 4,  viewDist: 9.5, detectRadius: 6.0, loopChance: 0.05, searchPersistence: 2.0 },
    { name: 'LEVEL 2', mazeW: 29, mazeH: 29, enemyCount: 7,  viewDist: 8.5, detectRadius: 7.5, loopChance: 0.09, searchPersistence: 3.2 },
    { name: 'LEVEL 3', mazeW: 39, mazeH: 39, enemyCount: 11, viewDist: 7.5, detectRadius: 9.5, loopChance: 0.13, searchPersistence: 4.5 }
  ],
  fov: Math.PI / 3,
  moveSpeed: 2.6,
  runMultiplier: 1.8,
  turnSpeed: 2.6,
  playerRadius: 0.22,
  maxHealth: 100,
  fireDamageMin: 16,
  fireDamageMax: 24,
  fireRange: 22,
  fireCooldown: 0.26,
  fireCone: 0.05,
  enemyHealth: 42,
  enemySpeed: 1.55,
  enemyRadius: 0.26,
  enemyContactDamage: 9,
  enemyAttackRange: 0.95,
  enemyAttackCooldown: 0.85,
  enemyRepathInterval: 0.45
};
 
/* ---------------------------------------------------------------------- */
/*  UTILITIES                                                              */
/* ---------------------------------------------------------------------- */
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
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
 
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
 
/* ---------------------------------------------------------------------- */
/*  MAZE GENERATOR                                                         */
/* ---------------------------------------------------------------------- */
class MazeGenerator {
  constructor(w, h, rng, loopChance) {
    this.w = w % 2 === 0 ? w + 1 : w;
    this.h = h % 2 === 0 ? h + 1 : h;
    this.rng = rng;
    this.grid = new Uint8Array(this.w * this.h).fill(1);
    this._carve();
    this._addLoops(loopChance);
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
    const steps = Math.ceil(dist * 4);
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
 
/* ---------------------------------------------------------------------- */
/*  RAYCASTER                                                              */
/* ---------------------------------------------------------------------- */
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
 
/* ---------------------------------------------------------------------- */
/*  ENTITIES                                                               */
/* ---------------------------------------------------------------------- */
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
 
/* ---------------------------------------------------------------------- */
/*  AUDIO MANAGER (procedural, no external files)                         */
/* ---------------------------------------------------------------------- */
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
    noise.buffer = this._noiseBuffer(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(250, t + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    noise.start(t); noise.stop(t + 0.16);
  }
 
  playFootstep() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(85 + Math.random() * 30, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.09);
  }
 
  playEnemyGrowl() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, t);
    osc.frequency.linearRampToValueAtTime(42, t + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.05);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.46);
  }
 
  playHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.09);
  }
 
  playPlayerHurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.26);
  }
 
  playEnemyDeath() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.51);
  }
 
  playGameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [220, 196, 174, 130].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.28);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + i * 0.28);
      gain.gain.linearRampToValueAtTime(0.2, t + i * 0.28 + 0.05);
      gain.gain.linearRampToValueAtTime(0.0001, t + i * 0.28 + 0.5);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t + i * 0.28); osc.stop(t + i * 0.28 + 0.55);
    });
  }
 
  playVictory() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [392, 523, 659, 784].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.14);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + i * 0.14);
      gain.gain.linearRampToValueAtTime(0.22, t + i * 0.14 + 0.03);
      gain.gain.linearRampToValueAtTime(0.0001, t + i * 0.14 + 0.4);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t + i * 0.14); osc.stop(t + i * 0.14 + 0.45);
    });
  }
 
  playChime() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [523, 659].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.09);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.15, t + i * 0.09 + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, t + i * 0.09 + 0.35);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.4);
    });
  }
 
  _startAmbient() {
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine'; osc1.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine'; osc2.frequency.value = 58.5;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.03;
    osc1.connect(gain); osc2.connect(gain); gain.connect(this.ctx.destination);
    osc1.start(); osc2.start();
    this._creakInterval = setInterval(() => {
      if (this.ready && Math.random() < 0.55) this._playCreak();
    }, 6500);
  }
 
  _playCreak() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const freq = 70 + Math.random() * 260;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * 0.55, t + 1.1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.045, t + 0.3);
    gain.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 1.4);
  }
}
 
/* ---------------------------------------------------------------------- */
/*  TOUCH JOYSTICK                                                         */
/* ---------------------------------------------------------------------- */
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
 
/* ---------------------------------------------------------------------- */
/*  GAME                                                                   */
/* ---------------------------------------------------------------------- */
class Game {
  constructor() {
    this.canvas = document.getElementById('viewCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioManager();
 
    this.state = 'menu'; // menu | playing | paused | gameover | victory
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
    this.wallColorCache = new Map();
 
    this._bindDom();
    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 200));
 
    this._newSeedForMenu();
    this._lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }
 
  /* ---------------- DOM / UI wiring ---------------- */
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
      html += `<span style="position:absolute;left:${left}px;top:0;transform:translateX(-50%);${isCardinal ? 'color:#c8d24a;font-weight:700;' : 'opacity:0.5;'}">${label}</span>`;
    }
    this.el.compassTrack.innerHTML = html;
    this.el.compassTrack.style.position = 'relative';
  }
 
  _newSeedForMenu() {
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    this._pendingSeed = seed;
    this.el.seedDisplay.textContent = seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
  }
 
  /* ---------------- Input wiring ---------------- */
  _bindInput() {
    this.moveJoystick = new Joystick(document.getElementById('moveZone'), document.getElementById('moveStick'), 40);
    this.lookJoystick = new Joystick(document.getElementById('lookZone'), document.getElementById('lookStick'), 40);
 
    const runBtn = document.getElementById('runBtn');
    runBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._isRunHeld = true; });
    runBtn.addEventListener('pointerup', (e) => { this._isRunHeld = false; });
    runBtn.addEventListener('pointercancel', () => { this._isRunHeld = false; });
 
    const jumpBtn = document.getElementById('jumpBtn');
    jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._triggerJumpBob(); });
 
    const fireBtn = document.getElementById('fireBtn');
    fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.isFiring = true; this._tryFire(); });
    fireBtn.addEventListener('pointerup', () => { this.isFiring = false; });
    fireBtn.addEventListener('pointercancel', () => { this.isFiring = false; });
  }
 
  _triggerJumpBob() { this._jumpBobTimer = 0.001; }
 
  /* ---------------- Screen state ---------------- */
  _showScreen(name) {
    this.el.menu.classList.toggle('hidden', name !== 'menu');
    this.el.pause.classList.toggle('hidden', name !== 'pause');
    this.el.gameOver.classList.toggle('hidden', name !== 'gameover');
    this.el.victory.classList.toggle('hidden', name !== 'victory');
    this.el.root.classList.toggle('hidden', name !== 'playing');
  }
 
  _toMenu() {
    this.state = 'menu';
    this._newSeedForMenu();
    this._showScreen('menu');
  }
 
  _pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._showScreen('pause');
  }
 
  _resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this._lastTime = performance.now();
    this._showScreen('playing');
  }
 
  /* ---------------- Game lifecycle ---------------- */
  _startNewGame(seed) {
    this.seedNumeric = seed !== undefined ? seed : this._pendingSeed;
    this.rng = mulberry32(this.seedNumeric);
    this.score = 0;
    this.kills = 0;
    this.levelIndex = 0;
    this.startTime = performance.now();
    this._loadLevel(0, CONFIG.maxHealth);
    this.state = 'playing';
    this._lastTime = performance.now();
    this._showScreen('playing');
  }
 
  _loadLevel(index, carryHealth) {
    const cfg = CONFIG.levels[index];
    const levelRng = mulberry32((this.seedNumeric ^ (index * 0x1000193)) >>> 0);
    this.maze = new MazeGenerator(cfg.mazeW, cfg.mazeH, levelRng, cfg.loopChance);
    this.levelIndex = index;
    this.levelCfg = cfg;
 
    const startX = 1.5, startY = 1.5;
    const far = this.maze.findFarthestCell(1, 1);
    this.exitPos = { x: far.x + 0.5, y: far.y + 0.5 };
 
    this.player = new Player(startX, startY, 0);
    this.player.health = carryHealth !== undefined ? carryHealth : CONFIG.maxHealth;
 
    const openCells = this.maze.getOpenCells().filter(([x, y]) => {
      const d = Math.hypot(x - startX, y - startY);
      return d > 6;
    });
    this.enemies = [];
    for (let i = 0; i < cfg.enemyCount; i++) {
      if (openCells.length === 0) break;
      const pick = openCells[Math.floor(levelRng() * openCells.length)];
      this.enemies.push(new Enemy(pick[0] + 0.5, pick[1] + 0.5));
    }
    this.tracers = [];
    this.el.levelLabel.textContent = cfg.name;
    this._showToast(index === 0 ? 'FIND THE EXIT' : 'SECTOR CLEARED \u2014 ' + cfg.name);
  }
 
  _gameOver() {
    this.state = 'gameover';
    this.audio.playGameOver();
    const elapsed = (performance.now() - this.startTime) / 1000;
    this.el.goLevel.textContent = String(this.levelIndex + 1);
    this.el.goKills.textContent = String(this.kills);
    this.el.goTime.textContent = formatTime(elapsed);
    this.el.goScore.textContent = String(this.score);
    this._showScreen('gameover');
  }
 
  _victory() {
    this.state = 'victory';
    this.audio.playVictory();
    const elapsed = (performance.now() - this.startTime) / 1000;
    this.el.vKills.textContent = String(this.kills);
    this.el.vTime.textContent = formatTime(elapsed);
    this.el.vScore.textContent = String(this.score);
    this._showScreen('victory');
  }
 
  _showToast(text) {
    const el = this.el.objectiveToast;
    el.textContent = text;
    el.classList.remove('toast-active');
    void el.offsetWidth;
    el.classList.add('toast-active');
  }
 
  _showHitMarker() { this._pulse(this.el.hitMarker, 'show'); }
  _showDamageFlash() {
    this._pulse(this.el.damageDir, 'show');
    this.el.flashOverlay.style.transition = 'none';
    this.el.flashOverlay.style.opacity = '0.35';
    requestAnimationFrame(() => {
      this.el.flashOverlay.style.transition = 'opacity 0.4s ease';
      this.el.flashOverlay.style.opacity = '0';
    });
  }
  _pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
 
  /* ---------------- Resize ---------------- */
  _resize() {
    const dispW = window.innerWidth, dispH = window.innerHeight;
    this.canvas.style.width = dispW + 'px';
    this.canvas.style.height = dispH + 'px';
    const cols = Math.max(220, Math.min(420, Math.round(dispW * 0.5)));
    this.canvas.width = cols;
    this.canvas.height = Math.max(140, Math.round(cols * (dispH / Math.max(1, dispW))));
    this.ctx.imageSmoothingEnabled = true;
    this.zbuffer = new Float32Array(this.canvas.width);
  }
 
  /* ---------------- Combat ---------------- */
  _tryFire() {
    if (this.state !== 'playing') return;
    if (this.player.fireCooldownTimer > 0) return;
    this.player.fireCooldownTimer = CONFIG.fireCooldown;
    this.player.recoil = 1;
    this.audio.playGunshot();
    this.tracers.push({ life: 0.09, maxLife: 0.09 });
 
    let best = null, bestDist = Infinity;
    for (const en of this.enemies) {
      if (!en.alive) continue;
      const dx = en.x - this.player.x, dy = en.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > CONFIG.fireRange) continue;
      const angleTo = Math.atan2(dy, dx);
      const diff = normalizeAngle(angleTo - this.player.angle);
      if (Math.abs(diff) > CONFIG.fireCone) continue;
      if (!this.maze.hasLineOfSight(this.player.x, this.player.y, en.x, en.y)) continue;
      if (dist < bestDist) { bestDist = dist; best = en; }
    }
    if (best) {
      const dmg = CONFIG.fireDamageMin + this.rng() * (CONFIG.fireDamageMax - CONFIG.fireDamageMin);
      best.health -= dmg;
      best.hitFlash = 0.15;
      this.audio.playHit();
      this._showHitMarker();
      if (best.health <= 0 && best.alive) {
        best.alive = false; best.state = 'dead'; best.deathTimer = 0;
        this.audio.playEnemyDeath();
        this.kills++;
        this.score += 100;
      }
    }
  }
 
  /* ---------------- Update ---------------- */
  _loop(now) {
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    dt = Math.min(dt, 0.05);
    if (this.state === 'playing') this._update(dt);
    this._renderFrame();
    requestAnimationFrame((t) => this._loop(t));
  }
 
  _update(dt) {
    const p = this.player;
 
    // ---- movement from joystick ----
    const mv = this.moveJoystick.value;
    const forward = clamp(-mv.y, -1, 1);
    const strafe = clamp(mv.x, -1, 1);
    this._isRunning = this._isRunHeld && (Math.abs(forward) > 0.1 || Math.abs(strafe) > 0.1);
    const speed = CONFIG.moveSpeed * (this._isRunning ? CONFIG.runMultiplier : 1);
    const dx = (Math.cos(p.angle) * forward + Math.cos(p.angle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(p.angle) * forward + Math.sin(p.angle + Math.PI / 2) * strafe) * speed * dt;
    p.isMoving = Math.hypot(dx, dy) > 0.0001;
    this._tryMoveEntity(p, dx, dy, CONFIG.playerRadius);
 
    // ---- rotation from look joystick ----
    const lk = this.lookJoystick.value;
    p.angle += lk.x * CONFIG.turnSpeed * dt;
    p.pitch = clamp(lerp(p.pitch, -lk.y * 60, 0.15), -60, 60);
 
    // ---- bob & footsteps ----
    if (p.isMoving) {
      p.bobPhase += dt * (this._isRunning ? 10 : 6.2);
      p.footstepTimer -= dt;
      if (p.footstepTimer <= 0) { this.audio.playFootstep(); p.footstepTimer = this._isRunning ? 0.26 : 0.42; }
    } else {
      p.bobPhase = lerp(p.bobPhase, Math.round(p.bobPhase / (Math.PI * 2)) * Math.PI * 2, 0.2);
    }
 
    if (p.fireCooldownTimer > 0) p.fireCooldownTimer -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 6);
    if (this.isFiring && p.fireCooldownTimer <= 0) this._tryFire();
    if (this._jumpBobTimer !== undefined) {
      this._jumpBobTimer += dt;
      if (this._jumpBobTimer > 0.4) this._jumpBobTimer = undefined;
    }
 
    // ---- tracers ----
    this.tracers = this.tracers.filter((tr) => { tr.life -= dt; return tr.life > 0; });
 
    // ---- enemies ----
    for (const en of this.enemies) this._updateEnemy(en, dt);
 
    // ---- exit check ----
    const distToExit = Math.hypot(p.x - this.exitPos.x, p.y - this.exitPos.y);
    if (distToExit < 0.55) this._reachExit();
 
    // ---- death check ----
    if (p.health <= 0) this._gameOver();
 
    // ---- HUD ----
    this._updateHud();
  }
 
  _reachExit() {
    this.audio.playChime();
    this.score += 250;
    if (this.levelIndex < CONFIG.levels.length - 1) {
      this._loadLevel(this.levelIndex + 1, this.player.health);
    } else {
      this._victory();
    }
  }
 
  _tryMoveEntity(entity, dx, dy, radius) {
    if (dx !== 0) {
      const nx = entity.x + dx;
      if (!this._collidesAt(nx, entity.y, radius)) entity.x = nx;
    }
    if (dy !== 0) {
      const ny = entity.y + dy;
      if (!this._collidesAt(entity.x, ny, radius)) entity.y = ny;
    }
  }
 
  _collidesAt(x, y, radius) {
    const minX = Math.floor(x - radius), maxX = Math.floor(x + radius);
    const minY = Math.floor(y - radius), maxY = Math.floor(y + radius);
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (this.maze.get(gx, gy) === 1) {
          const closestX = Math.max(gx, Math.min(x, gx + 1));
          const closestY = Math.max(gy, Math.min(y, gy + 1));
          const ddx = x - closestX, ddy = y - closestY;
          if (ddx * ddx + ddy * ddy < radius * radius) return true;
        }
      }
    }
    return false;
  }
 
  _updateEnemy(en, dt) {
    if (en.hitFlash > 0) en.hitFlash -= dt;
    if (!en.alive) {
      en.deathTimer += dt;
      if (en.deathTimer > 1.6) en.removed = true;
      return;
    }
    const p = this.player;
    const dx = p.x - en.x, dy = p.y - en.y;
    const dist = Math.hypot(dx, dy);
    const cfg = this.levelCfg;
 
    const canSeePlayer = dist < cfg.detectRadius && this.maze.hasLineOfSight(en.x, en.y, p.x, p.y);
 
    if (canSeePlayer) {
      if (en.state !== 'chase' && en.state !== 'attack') {
        en.growlCooldown = 0;
      }
      en.state = dist <= CONFIG.enemyAttackRange ? 'attack' : 'chase';
      en.lastKnownPlayer = { x: p.x, y: p.y };
      en.searchTimer = 0;
    } else if (en.state === 'chase' || en.state === 'attack') {
      en.searchTimer += dt;
      if (en.searchTimer > cfg.searchPersistence) { en.state = 'search'; en.searchTimer = 0; }
    }
 
    en.growlCooldown -= dt;
    if ((en.state === 'chase' || en.state === 'attack') && en.growlCooldown <= 0) {
      this.audio.playEnemyGrowl();
      en.growlCooldown = 2.5 + Math.random() * 2;
    }
 
    if (en.state === 'attack') {
      en.attackCooldown -= dt;
      if (dist > CONFIG.enemyAttackRange * 1.4) {
        en.state = 'chase';
      } else if (en.attackCooldown <= 0) {
        en.attackCooldown = CONFIG.enemyAttackCooldown;
        p.health -= CONFIG.enemyContactDamage;
        this.audio.playPlayerHurt();
        this._showDamageFlash();
      }
      en.angle = Math.atan2(dy, dx);
      return;
    }
 
    // movement states: patrol / chase / search
    en.repathTimer -= dt;
    if (en.state === 'chase') {
      if (en.repathTimer <= 0) {
        en.repathTimer = CONFIG.enemyRepathInterval;
        const path = this.maze.bfsPath(Math.floor(en.x), Math.floor(en.y), Math.floor(p.x), Math.floor(p.y));
        if (path) { en.path = path; en.pathIndex = 0; }
      }
    } else if (en.state === 'search') {
      if (!en.path || en.pathIndex >= (en.path ? en.path.length : 0)) {
        if (en.lastKnownPlayer) {
          const tx = Math.floor(en.lastKnownPlayer.x), ty = Math.floor(en.lastKnownPlayer.y);
          const path = this.maze.bfsPath(Math.floor(en.x), Math.floor(en.y), tx, ty);
          en.path = path; en.pathIndex = 0;
          en.lastKnownPlayer = null;
        } else {
          en.state = 'patrol';
          en.path = null;
        }
      }
    } else { // patrol
      if (!en.path || en.pathIndex >= en.path.length) {
        const open = this.maze.getOpenCells();
        if (open.length > 0) {
          const target = open[Math.floor(this.rng() * open.length)];
          const path = this.maze.bfsPath(Math.floor(en.x), Math.floor(en.y), target[0], target[1]);
          if (path && path.length > 1) { en.path = path; en.pathIndex = 0; }
        }
      }
    }
 
    // follow path
    if (en.path && en.pathIndex < en.path.length) {
      const wp = en.path[en.pathIndex];
      const tx = wp[0] + 0.5, ty = wp[1] + 0.5;
      const ex = tx - en.x, ey = ty - en.y;
      const d = Math.hypot(ex, ey);
      if (d < 0.12) {
        en.pathIndex++;
      } else {
        const speed = CONFIG.enemySpeed * dt;
        const mx = (ex / d) * speed, my = (ey / d) * speed;
        en.angle = Math.atan2(ey, ex);
        this._tryMoveEntity(en, mx, my, CONFIG.enemyRadius);
        en.bobPhase += dt * 8;
      }
    }
  }
 
  /* ---------------- HUD ---------------- */
  _updateHud() {
    const p = this.player;
    const pct = clamp((p.health / CONFIG.maxHealth) * 100, 0, 100);
    this.el.healthFill.style.width = pct + '%';
    this.el.healthNum.textContent = String(Math.ceil(clamp(p.health, 0, CONFIG.maxHealth)));
    this.el.scoreNum.textContent = String(this.score);
 
    const headingDeg = ((p.angle * 180 / Math.PI) + 90 + 3600) % 360;
    const stripWidth = this.el.compassStrip.clientWidth || 220;
    const offset = stripWidth / 2 - (headingDeg + 360) * this.pxPerDeg;
    this.el.compassTrack.style.transform = `translateX(${offset}px)`;
 
    this._renderRadar();
  }
 
  _renderRadar() {
    const ctx = this.radarCtx;
    const size = this.el.radarCanvas.width;
    const radiusCells = 7.5;
    const pxPerCell = size / (radiusCells * 2);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,18,12,0.55)';
    ctx.fill();
    ctx.clip();
 
    const p = this.player;
    const cosA = Math.cos(p.angle), sinA = Math.sin(p.angle);
    const worldToScreen = (wx, wy) => {
      const dx = wx - p.x, dy = wy - p.y;
      const localX = dx * cosA + dy * sinA;
      const localY = -dx * sinA + dy * cosA;
      return { x: size / 2 + localY * pxPerCell, y: size / 2 - localX * pxPerCell };
    };
 
    ctx.fillStyle = 'rgba(138,122,74,0.85)';
    const minGX = Math.floor(p.x - radiusCells), maxGX = Math.ceil(p.x + radiusCells);
    const minGY = Math.floor(p.y - radiusCells), maxGY = Math.ceil(p.y + radiusCells);
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (this.maze.get(gx, gy) === 1) {
          const c1 = worldToScreen(gx, gy);
          const c2 = worldToScreen(gx + 1, gy + 1);
          const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
          const w = Math.abs(c2.x - c1.x), h = Math.abs(c2.y - c1.y);
          ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
        }
      }
    }
 
    const distExit = Math.hypot(this.exitPos.x - p.x, this.exitPos.y - p.y);
    ctx.fillStyle = '#7fd6a0';
    if (distExit < radiusCells) {
      const c = worldToScreen(this.exitPos.x, this.exitPos.y);
      ctx.beginPath(); ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      const ang = Math.atan2(this.exitPos.y - p.y, this.exitPos.x - p.x) - p.angle - (-Math.PI / 2);
      const ex = size / 2 + Math.sin(ang + Math.PI / 2) * (size / 2 - 8);
      const ey = size / 2 - Math.cos(ang + Math.PI / 2) * (size / 2 - 8);
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill();
    }
 
    for (const en of this.enemies) {
      if (!en.alive) continue;
      const d = Math.hypot(en.x - p.x, en.y - p.y);
      if (d > radiusCells + 1) continue;
      const c = worldToScreen(en.x, en.y);
      ctx.fillStyle = en.state === 'chase' || en.state === 'attack' ? '#c4453d' : 'rgba(196,69,61,0.55)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill();
    }
 
    ctx.restore();
 
    ctx.strokeStyle = 'rgba(200,210,74,0.5)';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.stroke();
 
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = '#c8d24a';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
 
  /* ---------------- Rendering: 3D view ---------------- */
  _wallColor(mapX, mapY, side, wallX, fog) {
    const variation = 0.85 + hashCell(mapX, mapY) * 0.3;
    let r = 138 * variation, g = 122 * variation, b = 74 * variation;
    const stripe = Math.floor(wallX * 6) % 2 === 0 ? 1 : 0.86;
    r *= stripe; g *= stripe; b *= stripe;
    if (side === 1) { r *= 0.72; g *= 0.72; b *= 0.72; }
    const tint = hashCell(mapX + 91, mapY + 17);
    r += tint * 10; g += tint * 14;
    const fogR = 10, fogG = 9, fogB = 6;
    r = lerp(r, fogR, fog); g = lerp(g, fogG, fog); b = lerp(b, fogB, fog);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
 
  _renderFrame() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const p = this.player;
    const maxDist = this.levelCfg ? this.levelCfg.viewDist : 9;
 
    const bobY = p.isMoving ? Math.sin(p.bobPhase) * 4 : 0;
    const pitchPx = (p.pitch / 60) * (h * 0.18);
    const horizon = h / 2 + pitchPx + bobY;
 
    // sky / ceiling
    ctx.fillStyle = '#151208';
    ctx.fillRect(0, 0, w, Math.max(0, horizon));
    // floor gradient
    const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
    floorGrad.addColorStop(0, '#2a2718');
    floorGrad.addColorStop(1, '#0a0906');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, Math.max(0, horizon), w, h - Math.max(0, horizon));
 
    const fov = CONFIG.fov;
    const halfFov = fov / 2;
    const tanHalfFov = Math.tan(halfFov);
 
    for (let i = 0; i < w; i++) {
      const cameraX = (2 * i) / w - 1;
      const rayAngle = p.angle + Math.atan(cameraX * tanHalfFov);
      const result = castRay(p.x, p.y, rayAngle, this.maze, maxDist);
      if (!result) { this.zbuffer[i] = maxDist; continue; }
      const perp = Math.max(0.05, result.dist * Math.cos(rayAngle - p.angle));
      this.zbuffer[i] = perp;
      const lineHeight = h / perp;
      let drawStart = horizon - lineHeight / 2;
      let drawEnd = horizon + lineHeight / 2;
      const fog = clamp(perp / maxDist, 0, 1);
      ctx.fillStyle = this._wallColor(result.mapX, result.mapY, result.side, result.wallX, fog);
      ctx.fillRect(i, drawStart, 1, drawEnd - drawStart + 1);
    }
 
    this._renderSprites(ctx, w, h, horizon, maxDist, fov, tanHalfFov);
    this._renderGunAndTracers(ctx, w, h);
  }
 
  _renderSprites(ctx, w, h, horizon, maxDist, fov, tanHalfFov) {
    const p = this.player;
    const sprites = [];
    for (const en of this.enemies) {
      if (en.removed) continue;
      const dx = en.x - p.x, dy = en.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist + 1 || dist < 0.15) continue;
      const angleTo = Math.atan2(dy, dx);
      const diff = normalizeAngle(angleTo - p.angle);
      if (Math.abs(diff) > fov / 2 + 0.5) continue;
      sprites.push({ en, dist, diff });
    }
    sprites.sort((a, b) => b.dist - a.dist);
 
    for (const s of sprites) {
      const cameraXForSprite = Math.tan(s.diff) / tanHalfFov;
      const screenX = ((cameraXForSprite + 1) / 2) * w;
      const col = Math.round(clamp(screenX, 0, w - 1));
      const perp = Math.max(0.1, s.dist * Math.cos(s.diff));
      if (this.zbuffer[col] !== undefined && perp > this.zbuffer[col]) continue;
 
      const en = s.en;
      let spriteH = (h / perp) * 0.78;
      let alpha = 1;
      if (!en.alive) {
        const t = clamp(en.deathTimer / 1.4, 0, 1);
        spriteH *= (1 - t * 0.7);
        alpha = 1 - t;
      }
      const spriteW = spriteH * 0.42;
      const fog = clamp(perp / maxDist, 0, 1);
      const baseY = horizon + spriteH / 2 - (en.alive ? 0 : (h / perp) * 0.78 * 0.35 * clamp(en.deathTimer / 1.4, 0, 1));
 
      this._drawHumanoid(ctx, screenX, baseY, spriteW, spriteH, en, fog, alpha);
    }
  }
 
  _drawHumanoid(ctx, cx, baseY, w, h, en, fog, alpha) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    let baseR = 108, baseG = 128, baseB = 96;
    if (en.state === 'chase' || en.state === 'attack') { baseR = 150; baseG = 90; baseB = 78; }
    if (en.hitFlash > 0) { baseR = 255; baseG = 240; baseB = 210; }
    const fogR = 10, fogG = 9, fogB = 6;
    const r = lerp(baseR, fogR, fog), g = lerp(baseG, fogG, fog), b = lerp(baseB, fogB, fog);
    const color = `rgb(${r | 0},${g | 0},${b | 0})`;
    const dark = `rgb(${(r * 0.6) | 0},${(g * 0.6) | 0},${(b * 0.6) | 0})`;
 
    const bob = en.alive ? Math.sin(en.bobPhase) * h * 0.02 : 0;
    const top = baseY - h + bob;
    const headR = w * 0.5;
    const bodyTop = top + headR * 1.6;
    const bodyH = h - headR * 1.6;
 
    // legs (slight walk animation)
    const legSwing = en.alive ? Math.sin(en.bobPhase) * w * 0.18 : 0;
    ctx.fillStyle = dark;
    ctx.fillRect(cx - w * 0.28 + legSwing, bodyTop + bodyH * 0.62, w * 0.24, bodyH * 0.38);
    ctx.fillRect(cx + w * 0.04 - legSwing, bodyTop + bodyH * 0.62, w * 0.24, bodyH * 0.38);
 
    // torso
    ctx.fillStyle = color;
    ctx.fillRect(cx - w * 0.32, bodyTop, w * 0.64, bodyH * 0.65);
 
    // arms
    ctx.fillStyle = dark;
    ctx.fillRect(cx - w * 0.46, bodyTop + bodyH * 0.05, w * 0.14, bodyH * 0.5);
    ctx.fillRect(cx + w * 0.32, bodyTop + bodyH * 0.05, w * 0.14, bodyH * 0.5);
 
    // head
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, top + headR, headR, 0, Math.PI * 2);
    ctx.fill();
 
    // eyes (faint glow when hunting)
    if (en.state === 'chase' || en.state === 'attack') {
      ctx.fillStyle = 'rgba(200,40,30,0.9)';
      ctx.fillRect(cx - headR * 0.45, top + headR * 0.85, headR * 0.28, headR * 0.18);
      ctx.fillRect(cx + headR * 0.17, top + headR * 0.85, headR * 0.28, headR * 0.18);
    }
    ctx.restore();
  }
 
  _renderGunAndTracers(ctx, w, h) {
    const p = this.player;
    const recoilPx = p.recoil * 14;
    const gunW = w * 0.16, gunH = h * 0.22;
    const gx = w / 2 - gunW / 2;
    const gy = h - gunH + recoilPx + (p.isMoving ? Math.abs(Math.sin(p.bobPhase)) * 6 : 0);
 
    if (p.recoil > 0.55) {
      ctx.save();
      ctx.globalAlpha = clamp((p.recoil - 0.55) / 0.45, 0, 1) * 0.9;
      const flashGrad = ctx.createRadialGradient(w / 2, gy, 2, w / 2, gy, gunW * 1.4);
      flashGrad.addColorStop(0, 'rgba(255,240,180,0.9)');
      flashGrad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(w / 2 - gunW * 1.4, gy - gunW * 1.4, gunW * 2.8, gunW * 2.8);
      ctx.restore();
    }
 
    ctx.fillStyle = '#1c1a14';
    ctx.fillRect(gx + gunW * 0.32, gy, gunW * 0.36, gunH * 0.55);
    ctx.fillStyle = '#26231a';
    ctx.fillRect(gx, gy + gunH * 0.45, gunW, gunH * 0.55);
    ctx.fillStyle = '#3a3626';
    ctx.fillRect(gx + gunW * 0.38, gy - gunH * 0.12, gunW * 0.24, gunH * 0.2);
 
    if (this.tracers.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,250,200,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, gy);
      ctx.lineTo(w / 2 + (Math.random() - 0.5) * 2, h * 0.45);
      ctx.stroke();
      ctx.restore();
    }
  }
}
 
/* ---------------------------------------------------------------------- */
/*  BOOTSTRAP                                                              */
/* ---------------------------------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
 
