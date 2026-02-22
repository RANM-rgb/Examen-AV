// ===================== RESIDENT SLUG (Canvas 2D) =====================
// Reemplaza TODO tu archivo por este: js/main.js

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;
const randi = (a, b) => Math.floor(rand(a, b + 1));
const now = () => performance.now();

// ---------- Canvas ----------
const canvas = $("canvas");              // id="canvas"
const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---------- UI elements from your HTML ----------
const overlay = $("overlay");
const btnStart = $("btnStart");
const btnPause = $("btnPause");
const btnRestart = $("btnRestart");

const lvlEl = $("lvl");
const scoreEl = $("score");
const highEl = $("high");

const modeLabelEl = $("modeLabel");
const aliveEl = $("alive");
const killedEl = $("killed");
const killedPctEl = $("killedPct");
const timeEl = $("time");

const goalNEl = $("goalN");
const goalN2El = $("goalN2");
const progNEl = $("progN");

const volEl = $("vol");
const diffEl = $("difficulty");

const helpBox = document.querySelector(".help"); // instrucciones rápidas HTML

function setText(el, v) { if (el) el.textContent = String(v); }

// ---------- Rename (NO Bubble Defense) ----------
(function renameUI(){
  document.title = "Resident Slug - Canvas Game";
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = "Resident Slug (Interactividad 2D)";
  const subtitle = document.querySelector(".text-white-50.small");
  if (subtitle) subtitle.textContent = "WASD para moverte • Apunta con mouse • Dispara • 10 niveles • Boss final";
  if (modeLabelEl) setText(modeLabelEl, "Survival");
})();

// ---------- Storage ----------
const HS_KEY = "resident_slug_highscore_v2";
const loadHighScore = () => Number(localStorage.getItem(HS_KEY) || "0") || 0;
const saveHighScore = (v) => localStorage.setItem(HS_KEY, String(Math.max(0, Math.floor(v))));

// ---------- Input ----------
const keys = new Set();
let mouse = { x: 0, y: 0, down: false };

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "tab" || k === " ") e.preventDefault();
  keys.add(k);

  if (k === "p") togglePause();
  if (k === "r") restartGame();
  if (k === " ") shoot();
  if (k === "f") useMedkit();
  if (k === "h") toggleHelp();
}, { passive: false });

document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});

canvas.addEventListener("mousedown", (e) => {
  mouse.down = true;
  if (paused && !gameOver) startGame();
  if (e.button === 0) {
    knifeClick();
    shoot();
  }
});
canvas.addEventListener("mouseup", () => (mouse.down = false));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function toggleHelp(){
  if(!helpBox) return;
  helpBox.style.display = (helpBox.style.display === "none") ? "" : "none";
}

// ---------- Audio (Music + SFX) ----------
let audioCtx = null, master = null, sfxGain = null, musicGain = null;
let musicOn = false;
let musicNodes = [];
let muted = false;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  master.gain.value = 0.9;

  sfxGain = audioCtx.createGain();
  sfxGain.connect(master);
  sfxGain.gain.value = 0.85;

  musicGain = audioCtx.createGain();
  musicGain.connect(master);
  musicGain.gain.value = 0.18;
}

function setSfxVol(v) {
  if (sfxGain) sfxGain.gain.value = clamp(v, 0, 1.4);
}

function beep({ f=600, d=0.06, type="square", g=0.20, slide=null, bus="sfx" } = {}) {
  if (!audioCtx || muted) return;
  const o = audioCtx.createOscillator();
  const gg = audioCtx.createGain();
  const t0 = audioCtx.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slide != null) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + d);
  gg.gain.setValueAtTime(0.0001, t0);
  gg.gain.exponentialRampToValueAtTime(g, t0 + 0.01);
  gg.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(gg);
  gg.connect(bus === "music" ? musicGain : sfxGain);
  o.start(t0);
  o.stop(t0 + d);
}

function noisePop(d=0.10, g=0.55){
  if(!audioCtx || muted) return;
  const n = Math.floor(audioCtx.sampleRate * d);
  const b = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const data = b.getChannelData(0);
  for(let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1 - i/n);
  const src = audioCtx.createBufferSource(); src.buffer = b;
  const gg = audioCtx.createGain(); gg.gain.value = g;
  src.connect(gg); gg.connect(sfxGain);
  src.start();
}

const SFX = {
  shoot(){ beep({ f:980, slide:720, d:0.045, type:"square", g:0.26 }); },
  shotgun(){ beep({ f:680, slide:420, d:0.08, type:"sawtooth", g:0.24 }); noisePop(0.06,0.25); },
  hit(){ beep({ f:180, slide:120, d:0.08, type:"sawtooth", g:0.24 }); },
  zombie(){ beep({ f:95, d:0.10, type:"triangle", g:0.16 }); },
  dog(){ beep({ f:140, d:0.06, type:"square", g:0.14 }); },
  boss(){ beep({ f:70, d:0.16, type:"sine", g:0.16 }); },
  explode(){ noisePop(0.14,0.65); beep({ f:240, slide:90, d:0.18, type:"sawtooth", g:0.22 }); },
  pickup(){ beep({ f:620, slide:1040, d:0.11, type:"triangle", g:0.22 }); },
  reload(){ beep({ f:260, slide:520, d:0.12, type:"sine", g:0.20 }); },
  level(){ beep({ f:440, slide:660, d:0.12, type:"sine", g:0.20 }); beep({ f:660, slide:880, d:0.12, type:"sine", g:0.20 }); },
  playerDead(){ beep({ f:220, slide:80, d:0.35, type:"sawtooth", g:0.18 }); noisePop(0.20,0.55); }
};

function startMusic(){
  if(!audioCtx || muted || musicOn) return;
  musicOn = true;

  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  const f  = audioCtx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 950;

  const g1 = audioCtx.createGain(); g1.gain.value = 0.11;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.07;

  o1.type = "triangle";
  o2.type = "sine";

  o1.connect(g1); o2.connect(g2);
  g1.connect(f); g2.connect(f);
  f.connect(musicGain);

  const seq = [196, 220, 246.94, 293.66, 246.94, 220, 196, 174.61];
  let i = 0;

  function tick(){
    if(!musicOn) return;
    const t0 = audioCtx.currentTime;
    const n = seq[i % seq.length];
    o1.frequency.setValueAtTime(n, t0);
    o2.frequency.setValueAtTime(n*2, t0);
    i++;
    setTimeout(tick, 260);
  }

  o1.start(); o2.start();
  tick();
  musicNodes = [o1,o2,f,g1,g2];
}

function stopMusic(){
  musicOn = false;
  try{ for(const n of musicNodes) if(n && typeof n.stop === "function") n.stop(); }catch{}
  musicNodes = [];
}

// ---------- Assets ----------
const ASSET_LIST = {
  bg:      ["img/Fondo.png", "Fondo.png"],
  player:  ["img/player.png", "player.png"],
  muzzle:  ["img/Balas.png", "Balas.png"],

  z_basic: ["img/zombie.png", "zombie.png"],
  z_green: ["img/zombie verde.png", "zombie verde.png"],
  z_white: ["img/zombie blanco.png", "zombie blanco.png"],
  dog:     ["img/perro.png", "perro.png"],
  spider:  ["img/zombie araña.png", "zombie araña.png"],
  boss:    ["img/jefe final.png", "jefe final.png"],
};

function loadImageTry(paths) {
  return new Promise((resolve) => {
    let idx = 0;
    const img = new Image();
    img.decoding = "async";

    const tryNext = () => {
      if (idx >= paths.length) return resolve(null);
      const src = paths[idx++];
      img.onload = () => resolve(img);
      img.onerror = () => tryNext();
      img.src = encodeURI(src);
    };

    tryNext();
  });
}

const GFX = {};
async function loadAllAssets() {
  for (const [k, paths] of Object.entries(ASSET_LIST)) {
    GFX[k] = await loadImageTry(paths);
  }
}

// ---------- Game constants ----------
const MAX_LEVELS = 10;
const WORLD = { baseLen: 3400, extraPerLevel: 520, gravity: 0.85, maxFall: 18 };

function groundY() { return canvas.clientHeight - 88; }

// Weapons
const WEAPONS = {
  rifle:   { name: "RIFLE",   dmg: 14, rate: 85,  spread: 0.03, bulletSpeed: 14.2, pellets: 1, sfx:"shoot" },
  pistol:  { name: "PISTOL",  dmg: 18, rate: 150, spread: 0.02, bulletSpeed: 12.8, pellets: 1, sfx:"shoot" },
  shotgun: { name: "SHOTGUN", dmg: 10, rate: 240, spread: 0.22, bulletSpeed: 12.2, pellets: 6, sfx:"shotgun" },
};

const ENEMY_TYPES = {
  basic:  { key: "z_basic", hp: 55,  spd: 1.10, score: 90,  attack: "melee",  flyer:false },
  green:  { key: "z_green", hp: 70,  spd: 0.85, score: 140, attack: "vomit",  flyer:false }, // dispara ácido
  white:  { key: "z_white", hp: 78,  spd: 0.78, score: 170, attack: "tongue", flyer:false }, // “lengua” rápida
  dog:    { key: "dog",     hp: 46,  spd: 2.35, score: 160, attack: "dash",   flyer:false }, // embestida
  spider: { key: "spider",  hp: 60,  spd: 1.55, score: 190, attack: "jump",   flyer:false }, // salto + spit
  boss:   { key: "boss",    hp: 1200,spd: 0.90, score: 1600,attack: "cannon", flyer:false },
  // ejemplo volador (si luego agregas sprite): flyer: { key:"bat", hp:40, spd:1.8, score:140, attack:"fly", flyer:true }
};

function levelParams(lvl) {
  const base = Number(diffEl?.value || "1");
  const mult = clamp(base, 1, 1.6);

  // pool progresivo
  const pool = ["basic"];
  if (lvl >= 2) pool.push("dog");
  if (lvl >= 3) pool.push("green");
  if (lvl >= 5) pool.push("spider");
  if (lvl >= 7) pool.push("white");

  const goal = (lvl === 10) ? 1 : Math.min(30, 8 + lvl * 2);
  const count = (lvl === 10) ? 1 : Math.min(26, 6 + lvl * 2);

  return { mult, goal, count, pool };
}

// ---------- State ----------
let paused = true;
let gameOver = false;
let victory = false;

let level = 1;
let worldLen = WORLD.baseLen;

let highScore = loadHighScore();
let score = 0;

let startTime = now();
let elapsed = 0;

let killsThisLevel = 0;
let killGoal = 10;

let cameraX = 0;

const player = {
  x: 180, y: 0, w: 72, h: 92,          // MÁS GRANDE (ya no cuadrito)
  vx: 0, vy: 0,
  hp: 100, maxHp: 100,
  inv: 0,
  facing: 1,
  onGround: false,

  weapon: "rifle",
  ammoMag: 24,
  ammoRes: 180,
  magMax: 24,

  medkits: 2,
  reloadUntil: 0,
  lastShot: 0,
};

let enemies = [];
let bullets = [];
let enemyShots = [];     // proyectiles de enemigos
let pickups = [];
let fx = [];

let exitDoor = { x: 0, y: 0, w: 100, h: 150, active: false };

let toastMsg = "";
let toastUntil = 0;
function toast(t) { toastMsg = t; toastUntil = now() + 1200; }

// ---------- UI update ----------
function updateHUD() {
  setText(lvlEl, `${level}`);
  setText(scoreEl, `${Math.floor(score)}`);
  setText(highEl, `${Math.floor(highScore)}`);

  if (modeLabelEl) setText(modeLabelEl, "Survival");

  setText(aliveEl, enemies.filter(e => e.hp > 0).length);
  setText(killedEl, killsThisLevel);

  const pct = killGoal ? Math.round((killsThisLevel / killGoal) * 100) : 0;
  setText(killedPctEl, clamp(pct, 0, 100));

  setText(timeEl, (elapsed / 1000).toFixed(1));
  setText(goalNEl, killGoal);
  setText(goalN2El, killGoal);
  setText(progNEl, killsThisLevel);
}

// ---------- Geometry ----------
function aabb(A, B) {
  return !(A.x + A.w <= B.x || A.x >= B.x + B.w || A.y + A.h <= B.y || A.y >= B.y + B.h);
}
function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// ---------- Aim ----------
let aim = { ax: 1, ay: 0, angle: 0 };
function updateAim() {
  const px = player.x - cameraX + player.w * 0.55;
  const py = player.y + player.h * 0.40;
  const dx = mouse.x - px;
  const dy = mouse.y - py;
  const len = Math.hypot(dx, dy) || 1;
  aim.ax = dx / len;
  aim.ay = dy / len;
  aim.angle = Math.atan2(aim.ay, aim.ax);
  player.facing = aim.ax >= 0 ? 1 : -1;
}

// ---------- Spawns ----------
function spawnEnemy(type, x) {
  const T = ENEMY_TYPES[type];
  const img = GFX[T.key];

  // escala tipo “metal slug”: grandes y visibles
  const baseScale = (type === "boss") ? 1.05 : 0.85;
  const w = img ? Math.floor(img.width * baseScale) : 64;
  const h = img ? Math.floor(img.height * baseScale) : 90;

  const isFlyer = !!T.flyer;
  const y = isFlyer ? rand(120, groundY() - h - 120) : (groundY() - h); // SOLO voladores flotan

  enemies.push({
    type,
    x,
    y,
    w, h,
    vx: 0, vy: 0,
    hp: Math.floor(T.hp * (1 + (level - 1) * 0.10)),
    maxHp: Math.floor(T.hp * (1 + (level - 1) * 0.10)),
    nextAtk: now() + rand(600, 1200),
    facing: -1,
    state: { dashCD: 0, spitCD: 0, tongueCD: 0, jumpCD: 0, roarCD: now() + rand(900, 1700) }
  });
}

function maybeSpawnPickup(x, y){
  const r = Math.random();
  if (r < 0.22) pickups.push({ kind:"ammo", x, y, w:26, h:26, life: 6000 });
  else if (r < 0.36) pickups.push({ kind:"med", x, y, w:26, h:26, life: 6000 });
}

// ---------- Level setup ----------
function setupLevel(lvl) {
  const W = canvas.clientWidth;
  const p = levelParams(lvl);

  killGoal = p.goal;
  killsThisLevel = 0;

  worldLen = WORLD.baseLen + WORLD.extraPerLevel * (lvl - 1);

  enemies = [];
  bullets = [];
  enemyShots = [];
  fx = [];
  pickups = [];

  exitDoor = { x: worldLen - 200, y: groundY() - 150, w: 110, h: 150, active: false };

  player.x = 180;
  player.y = groundY() - player.h;
  player.vx = 0;
  player.vy = 0;
  player.inv = 0;

  // descanso por nivel
  player.hp = clamp(player.hp + 16, 0, player.maxHp);
  player.ammoRes += 40 + lvl * 5;
  if (lvl % 3 === 0) player.medkits += 1;

  // mejoras suaves
  player.magMax = 24 + Math.floor((lvl - 1) / 2) * 4;
  player.ammoMag = clamp(player.ammoMag, 0, player.magMax);

  // arma cambia (se siente más “metal slug”)
  if (lvl === 1) player.weapon = "rifle";
  if (lvl === 4) player.weapon = "shotgun";
  if (lvl === 7) player.weapon = "rifle";

  if (lvl < 10) {
    for (let i = 0; i < p.count; i++) {
      const t = p.pool[randi(0, p.pool.length - 1)];
      spawnEnemy(t, rand(620, worldLen - 620));
    }
  } else {
    // boss final
    killGoal = 1;
    spawnEnemy("boss", worldLen - 720);
    toast("¡JEFE FINAL!");
    SFX.boss();
  }

  cameraX = clamp(player.x - W * 0.35, 0, worldLen - W);

  SFX.level();
  toast(`Nivel ${lvl}: elimina ${killGoal} enemigo(s)`);
  updateHUD();
}

// ---------- Actions ----------
function reload() {
  if (now() < player.reloadUntil) return;
  if (player.ammoMag >= player.magMax) { toast("Cargador completo"); return; }
  if (player.ammoRes <= 0) { toast("Sin munición"); return; }

  const need = player.magMax - player.ammoMag;
  const take = Math.min(need, player.ammoRes);
  player.ammoMag += take;
  player.ammoRes -= take;

  player.reloadUntil = now() + 420;
  SFX.reload();
  toast("Recargando...");
}

function useMedkit() {
  if (paused || gameOver) return;
  if (player.medkits <= 0) return toast("Sin botiquines");
  if (player.hp >= player.maxHp) return toast("HP al máximo");
  player.medkits--;
  player.hp = clamp(player.hp + 40, 0, player.maxHp);
  toast("+HP (botiquín)");
  SFX.pickup();
}

function knifeClick() {
  if (paused || gameOver) return;
  const wx = mouse.x + cameraX;
  const wy = mouse.y;

  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (pointInRect(wx, wy, e)) {
      const dmg = (e.type === "boss") ? 25 : 60;
      e.hp -= dmg;
      fx.push({ kind: "hit", x: wx, y: wy, life: 18 });
      SFX.hit();
      toast("¡Cuchillazo!");
      return;
    }
  }
}

function shoot() {
  if (paused || gameOver) return;
  if (now() < player.reloadUntil) return;

  updateAim();

  const WPN = WEAPONS[player.weapon];
  const t = now();
  if (t - player.lastShot < WPN.rate) return;

  if (player.ammoMag <= 0) { reload(); return; }

  player.lastShot = t;
  player.ammoMag--;

  // SFX disparo
  if (WPN.sfx === "shotgun") SFX.shotgun(); else SFX.shoot();

  const sx = player.x + (player.facing > 0 ? player.w * 0.72 : player.w * 0.28);
  const sy = player.y + player.h * 0.50;

  const mk = (ax, ay, dmg) => ({
    x: sx, y: sy, w: 14, h: 6,
    vx: ax * WPN.bulletSpeed,
    vy: ay * WPN.bulletSpeed,
    dmg,
    life: 80
  });

  for (let i = 0; i < WPN.pellets; i++) {
    const a = aim.angle + rand(-WPN.spread, WPN.spread);
    bullets.push(mk(Math.cos(a), Math.sin(a), WPN.dmg));
  }
}

// ---------- Enemy attacks ----------
function enemyMelee(e, dmg) {
  if (player.inv > 0) return;
  if (aabb(player, e)) {
    player.hp -= dmg;
    player.inv = 24;
    player.vx += (player.x < e.x ? -5 : 5);
    player.vy = -7;
    fx.push({ kind: "hit", x: player.x + player.w / 2, y: player.y + 10, life: 18 });
    SFX.hit();
  }
}

function enemyShoot(e, kind){
  // proyectiles enemigos (ácido / lengua / bala boss)
  const px = e.x + (e.facing>0 ? e.w*0.75 : e.w*0.25);
  const py = e.y + e.h*0.45;

  const dx = (player.x + player.w*0.5) - px;
  const dy = (player.y + player.h*0.45) - py;
  const len = Math.hypot(dx,dy) || 1;
  const ax = dx/len, ay = dy/len;

  let spd = 7.6, dmg = 10, w=12, h=6, color="rgba(34,197,94,0.95)";
  if(kind==="vomit"){ spd=6.5; dmg=12; color="rgba(34,197,94,0.95)"; }
  if(kind==="tongue"){ spd=10.5; dmg=14; color="rgba(255,255,255,0.95)"; w=14; }
  if(kind==="cannon"){ spd=8.8; dmg=18; color="rgba(239,68,68,0.95)"; w=16; h=8; }

  enemyShots.push({
    kind,
    x:px, y:py, w, h,
    vx: ax*spd, vy: ay*spd,
    dmg, life: 110,
    color
  });
}

// ---------- Update loop ----------
function updatePlayer() {
  updateAim();

  const left  = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const jump  = keys.has("w") || keys.has("arrowup");

  if (keys.has("r")) reload();

  // movimiento tipo metal
  const accel = 0.78;
  const maxSp = 5.0;
  if (left)  { player.vx -= accel; player.facing = -1; }
  if (right) { player.vx += accel; player.facing =  1; }
  player.vx *= 0.86;
  player.vx = clamp(player.vx, -maxSp, maxSp);

  // gravedad y piso
  player.vy += WORLD.gravity;
  player.vy = clamp(player.vy, -30, WORLD.maxFall);

  player.x += player.vx;
  player.y += player.vy;

  player.x = clamp(player.x, 20, worldLen - player.w - 20);

  const g = groundY();
  player.onGround = false;
  if (player.y + player.h >= g) {
    player.y = g - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // salto simple
  if (jump && player.onGround) {
    player.vy = -14.2;
    player.onGround = false;
  }

  if (player.inv > 0) player.inv--;
}

function updateEnemies() {
  const t = now();
  const mult = levelParams(level).mult;

  for (const e of enemies) {
    if (e.hp <= 0) continue;

    // sonido ocasional
    if(t > e.state.roarCD){
      if(e.type==="dog") SFX.dog();
      else if(e.type==="boss") SFX.boss();
      else SFX.zombie();
      e.state.roarCD = t + rand(1200, 2200);
    }

    const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
    e.facing = dx >= 0 ? 1 : -1;

    const baseSpd = (ENEMY_TYPES[e.type].spd + (level - 1) * 0.03) * mult;

    // IA por tipo
    if(e.type === "dog"){
      // dash
      if(t > e.state.dashCD && Math.abs(dx) < 520){
        e.vx = Math.sign(dx) * (baseSpd * 3.2);
        e.state.dashCD = t + 1200;
      } else {
        e.vx = Math.sign(dx) * (baseSpd * 1.4);
      }
    } else if(e.type === "spider"){
      // salto hacia el jugador
      if(t > e.state.jumpCD && Math.abs(dx) < 520){
        e.vy = -12.5;
        e.state.jumpCD = t + 1400;
        // spit en el aire
        if(t > e.state.spitCD){
          enemyShoot(e, "vomit");
          e.state.spitCD = t + 1200;
        }
      }
      e.vx = Math.sign(dx) * baseSpd;
    } else if(e.type === "green"){
      // vomit ranged
      e.vx = Math.sign(dx) * baseSpd * 0.9;
      if(t > e.state.spitCD && Math.abs(dx) < 720){
        enemyShoot(e, "vomit");
        e.state.spitCD = t + rand(900, 1400);
      }
    } else if(e.type === "white"){
      // tongue fast
      e.vx = Math.sign(dx) * baseSpd * 0.85;
      if(t > e.state.tongueCD && Math.abs(dx) < 620){
        enemyShoot(e, "tongue");
        e.state.tongueCD = t + rand(800, 1200);
      }
    } else if(e.type === "boss"){
      // boss cannon + heavy melee
      e.vx = Math.sign(dx) * baseSpd * 0.9;
      if(t > e.state.spitCD && Math.abs(dx) < 980){
        enemyShoot(e, "cannon");
        enemyShoot(e, "cannon");
        e.state.spitCD = t + rand(700, 950);
      }
    } else {
      e.vx = Math.sign(dx) * baseSpd;
    }

    // física: SOLO los voladores mantienen y
    if(!ENEMY_TYPES[e.type].flyer){
      e.vy += WORLD.gravity * 0.85;
      e.vy = clamp(e.vy, -30, WORLD.maxFall);

      e.x += e.vx;
      e.y += e.vy;

      const g = groundY();
      if (e.y + e.h >= g) {
        e.y = g - e.h;
        e.vy = 0;
      }
    } else {
      // volador: flota con leve seno
      e.x += e.vx;
      e.y += Math.sin((t + e.x)*0.004) * 0.6;
    }

    // daño por contacto (melee)
    const dmg = (e.type === "boss") ? (18 + level) : (9 + level);
    enemyMelee(e, dmg);
  }

  // muertes
  for (const e of enemies) {
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;

      killsThisLevel++;
      score += ENEMY_TYPES[e.type].score + level * 12;

      fx.push({ kind: "boom", x: e.x + e.w / 2, y: e.y + e.h / 2, life: 26 });
      SFX.explode();
      maybeSpawnPickup(e.x + e.w/2, e.y + e.h*0.7);
    }
  }
  enemies = enemies.filter(e => !e.dead);
}

function updateBullets() {
  for (const b of bullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (aabb({ x: b.x, y: b.y, w: b.w, h: b.h }, e)) {
        e.hp -= b.dmg;
        score += 10;
        fx.push({ kind: "hit", x: b.x, y: b.y, life: 14 });
        SFX.hit();
        b.life = 0;
        break;
      }
    }
  }
  bullets = bullets.filter(b => b.life > 0);
}

function updateEnemyShots(){
  for(const s of enemyShots){
    s.x += s.vx;
    s.y += s.vy;
    s.life--;

    if(s.life>0 && player.inv<=0){
      if(aabb(player, s)){
        player.hp -= s.dmg;
        player.inv = 24;
        fx.push({ kind:"hit", x: player.x+player.w/2, y: player.y+16, life: 18 });
        SFX.hit();
        s.life = 0;
      }
    }
  }
  enemyShots = enemyShots.filter(s=>s.life>0);
}

function updatePickups(){
  for(const p of pickups){
    p.life -= 16;
    if(p.life <= 0) p.dead = true;

    if(!p.dead && aabb(player, p)){
      if(p.kind==="ammo"){
        player.ammoRes += 60;
        score += 40;
        toast("Munición +60");
        SFX.pickup();
      }
      if(p.kind==="med"){
        player.medkits += 1;
        score += 60;
        toast("Botiquín +1");
        SFX.pickup();
      }
      p.dead = true;
    }
  }
  pickups = pickups.filter(p=>!p.dead);
}

function updateExit() {
  // activa salida al cumplir
  exitDoor.active = (level < 10) ? (killsThisLevel >= killGoal) : (enemies.length === 0);

  if (exitDoor.active && aabb(player, exitDoor)) {
    if (level < MAX_LEVELS) {
      level++;
      setupLevel(level);
    } else {
      victory = true;
      gameOver = true;
      stopMusic();
      toast("¡VICTORIA!");
    }
  }
}

function updateCamera() {
  const W = canvas.clientWidth;
  const target = clamp(player.x - W * 0.35, 0, Math.max(0, worldLen - W));
  cameraX += (target - cameraX) * 0.10;
  cameraX = clamp(cameraX, 0, Math.max(0, worldLen - W));
}

// ---------- Rendering ----------
function drawSprite(img, x, y, w, h, flip = false) {
  if (!img) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x + (flip ? w : 0), y);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
  ctx.restore();
}

function drawBG() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!GFX.bg) {
    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const img = GFX.bg;
  const scale = Math.max(W / img.width, H / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const off = (cameraX * 0.25) % iw;

  ctx.fillStyle = "#0a1020";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, -off, 0, iw, ih);
  ctx.drawImage(img, -off + iw, 0, iw, ih);
}

function drawGround() {
  const W = canvas.clientWidth;
  const g = groundY();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, g, W, canvas.clientHeight - g);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(0, g, W, 2);
}

function drawExitDoor() {
  const x = exitDoor.x - cameraX;
  const y = exitDoor.y;

  ctx.fillStyle = exitDoor.active ? "rgba(34,197,94,0.18)" : "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, exitDoor.w, exitDoor.h);

  ctx.strokeStyle = exitDoor.active ? "rgba(34,197,94,0.90)" : "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, exitDoor.w, exitDoor.h);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "bold 14px Arial";
  ctx.fillText(exitDoor.active ? "SALIDA" : "CERRADO", x + 18, y + 24);
}

function drawHealthBar(x, y, w, pct, color="rgba(34,197,94,0.95)"){
  pct = clamp(pct, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x, y, w, 8);
  ctx.fillStyle = color;
  ctx.fillRect(x+1, y+1, (w-2)*pct, 6);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(x, y, w, 8);
}

function drawPlayer() {
  const x = player.x - cameraX;
  const y = player.y;
  drawSprite(GFX.player, x, y, player.w, player.h, player.facing < 0);

  // Barra HP jugador (arriba izquierda) -> NO tapa instrucciones del HTML
  drawHealthBar(18, 18, 220, player.hp/player.maxHp, "rgba(34,197,94,0.95)");
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "14px Arial";
  ctx.fillText(`HP ${Math.max(0,Math.round(player.hp))}  |  Med ${player.medkits} (F)`, 20, 48);

  // Ammo
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(`Ammo ${player.ammoMag}/${player.magMax}  Res ${player.ammoRes} (R)  |  Arma: ${WEAPONS[player.weapon].name}`, 20, 68);
}

function drawEnemies() {
  for (const e of enemies) {
    const img = GFX[ENEMY_TYPES[e.type].key];
    const x = e.x - cameraX;
    const y = e.y;

    drawSprite(img, x, y, e.w, e.h, e.facing < 0);

    // barra vida enemy
    const pct = e.hp / e.maxHp;
    const barW = Math.max(48, Math.min(120, e.w));
    const bx = x + (e.w - barW)/2;
    const by = y - 12;

    let c = "rgba(239,68,68,0.92)";
    if(e.type==="boss") c = "rgba(250,204,21,0.95)";
    drawHealthBar(bx, by, barW, pct, c);
  }
}

function drawBullets() {
  // balas jugador
  ctx.fillStyle = "rgba(56,189,248,0.95)";
  for (const b of bullets) {
    ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
  }

  // tiros enemigos
  for(const s of enemyShots){
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - cameraX, s.y, s.w, s.h);
  }
}

function drawPickups(){
  for(const p of pickups){
    const x = p.x - cameraX, y = p.y;
    if(p.kind==="ammo") ctx.fillStyle = "rgba(56,189,248,0.90)";
    if(p.kind==="med")  ctx.fillStyle = "rgba(34,197,94,0.90)";
    ctx.fillRect(x,y,p.w,p.h);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(x,y,p.w,p.h);
  }
}

function drawFX() {
  for (const p of fx) {
    const x = p.x - cameraX;
    const y = p.y;
    p.life--;
    if (p.kind === "hit") {
      ctx.fillStyle = `rgba(255,255,255,${clamp(p.life / 18, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a = clamp(p.life / 26, 0, 1);
      ctx.fillStyle = `rgba(250,204,21,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 18 * (1.2 - a), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  fx = fx.filter(p => p.life > 0);
}

function drawCrosshair() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mouse.x - 10, mouse.y);
  ctx.lineTo(mouse.x + 10, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 10);
  ctx.lineTo(mouse.x, mouse.y + 10);
  ctx.stroke();
  ctx.restore();
}

function drawTopRightHUD() {
  // HUD pequeño top-right (sin tapar el HTML de instrucciones)
  const W = canvas.clientWidth;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(W - 280, 12, 268, 70);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(W - 280, 12, 268, 70);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "14px Arial";
  ctx.fillText(`Nivel ${level}/10  |  Score ${Math.floor(score)}`, W - 264, 36);
  ctx.fillText(`Kills: ${killsThisLevel}/${killGoal}  |  H: ${Math.floor(highScore)}`, W - 264, 58);

  if (toastUntil > now()) {
    ctx.fillStyle = "rgba(56,189,248,0.95)";
    ctx.fillText(toastMsg, W - 264, 78);
  }
  ctx.restore();
}

function drawGameOver() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textAlign = "center";
  ctx.font = "bold 34px Arial";
  ctx.fillText(victory ? "🏆 VICTORIA" : "☠ GAME OVER", W / 2, H / 2 - 18);
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fillText("Presiona R para reiniciar", W / 2, H / 2 + 18);
  ctx.textAlign = "left";
}

// ---------- Gameplay checks ----------
function step() {
  if (paused) return;

  const t = now();
  elapsed = t - startTime;

  updatePlayer();
  updateEnemies();
  updateBullets();
  updateEnemyShots();
  updatePickups();
  updateExit();
  updateCamera();

  // high score
  if (score > highScore) {
    highScore = score;
    saveHighScore(highScore);
  }

  // death
  if (player.hp <= 0 && !gameOver) {
    gameOver = true;
    victory = false;
    stopMusic();
    SFX.playerDead();
    toast("GAME OVER");
  }

  updateHUD();
}

function render() {
  drawBG();
  drawGround();
  drawExitDoor();
  drawPickups();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawFX();
  drawTopRightHUD();
  drawCrosshair();
  if (gameOver) drawGameOver();
}

function loop() {
  requestAnimationFrame(loop);
  step();
  render();
}

// ---------- Control (Start/Pause/Restart) ----------
function startGame() {
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

  // hide overlay
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.style.display = "none";
    overlay.style.pointerEvents = "none";
  }

  // instrucciones rápidas: no estorban (se ocultan solas al iniciar)
  if (helpBox) {
    helpBox.style.opacity = "1";
    helpBox.style.display = "";
    setTimeout(() => {
      // fade-out suave sin tocar CSS
      helpBox.style.transition = "opacity .5s ease";
      helpBox.style.opacity = "0";
      setTimeout(() => { helpBox.style.display = "none"; }, 520);
    }, 2600);
  }

  // focus
  canvas.tabIndex = 0;
  canvas.focus();

  paused = false;
  if (!gameOver) {
    startTime = now();
  }
  gameOver = false;
  victory = false;

  // music
  startMusic();

  toast("Iniciado ✅  WASD mover | Mouse apunta | Click/Space dispara | R recargar | F curar | H ayuda");
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (btnPause) btnPause.textContent = paused ? "Reanudar" : "Pausar";

  if (overlay) {
    if (paused) {
      overlay.classList.remove("hidden");
      overlay.style.display = "flex";
      overlay.style.pointerEvents = "auto";
      stopMusic();
    } else {
      overlay.classList.add("hidden");
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
      startMusic();
    }
  }
}

function restartGame() {
  paused = true;
  gameOver = false;
  victory = false;
  score = 0;
  level = 1;

  player.hp = player.maxHp;
  player.weapon = "rifle";
  player.ammoRes = 180;
  player.magMax = 24;
  player.ammoMag = 24;
  player.medkits = 2;
  player.reloadUntil = 0;
  player.lastShot = 0;

  stopMusic();
  setupLevel(level);

  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
  }
  if (btnPause) btnPause.textContent = "Pausar";
  if (helpBox) { helpBox.style.display = ""; helpBox.style.opacity = "1"; }

  toast("Listo. Dale Iniciar");
  updateHUD();
}

// ---------- Boot ----------
(async function boot() {
  console.log("[BOOT] canvas:", !!canvas, "btnStart:", !!btnStart, "overlay:", !!overlay);

  // bind buttons
  if (btnStart) btnStart.addEventListener("click", startGame);
  if (btnPause) btnPause.addEventListener("click", togglePause);
  if (btnRestart) btnRestart.addEventListener("click", restartGame);

  initAudio();
  if (volEl) {
    setSfxVol(Number(volEl.value || "0.85"));
    volEl.addEventListener("input", () => setSfxVol(Number(volEl.value || "0.85")));
  }

  highScore = loadHighScore();
  setText(highEl, highScore);

  await loadAllAssets();
  setupLevel(level);
  updateHUD();

  if (overlay) {
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
  }

  loop();
})();