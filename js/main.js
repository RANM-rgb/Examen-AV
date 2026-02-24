/* =========================================================
   RESIDENT SLUG - Survival Horror (Canvas 2D)
   FIX:
   - Desaparecer al moverse/cambiar nivel: viewW/viewH estables
   - Audio más fuerte (compresor + sfx mejorados)
   - Música de fondo mejor (pad + beat simple)
   - Pantalla completa (botón btnFS + tecla F)
========================================================= */

// ===================== CANVAS =====================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
canvas.style.outline = "none";
canvas.setAttribute("tabindex", "0");

// ✅ Tamaño visible estable (evita W/H = 0)
let viewW = 800;
let viewH = 600;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();

  // guardamos tamaño visible REAL (CSS px)
  viewW = Math.max(1, Math.floor(r.width));
  viewH = Math.max(1, Math.floor(r.height));

  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Helpers usando viewW/viewH (NO clientWidth)
function W() { return viewW; }
function H() { return viewH; }

// ===================== UI =====================
const uiLvl   = document.getElementById("uiLvl");
const uiScore = document.getElementById("uiScore");
const uiHigh  = document.getElementById("uiHigh");

const overlay  = document.getElementById("overlay");
const btnStart = document.getElementById("btnStart");
const btnReset = document.getElementById("btnReset");
const btnPause = document.getElementById("btnPause");
const btnMute  = document.getElementById("btnMute");
const btnFS    = document.getElementById("btnFS");
const volEl    = document.getElementById("vol");

function setText(el, v){ if(el) el.textContent = v; }

// ===================== UTILS =====================
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand  = (a,b)=>Math.random()*(b-a)+a;

function aabb(a,b){
  return !(a.x+a.w<=b.x || a.x>=b.x+b.w || a.y+a.h<=b.y || a.y>=b.y+b.h);
}
function norm(x,y){
  const L = Math.hypot(x,y) || 1;
  return {x:x/L, y:y/L};
}

// ===================== WORLD =====================
const MAX_LEVELS = 10;
const WORLD_W = 5200;
const FLOOR_H = 120;
function groundY(){ return H() - FLOOR_H; }

let cameraX = 0;
let cameraVx = 0;

// ===================== ASSETS =====================
const ASSETS = {
  bg:      { src:"img/Fondo.png" },

  // player
  idle:     { src:"img/player.png" },
  runR:     { src:"img/run1.png" },
  runL:     { src:"img/runl_left.png" },
  crouch:   { src:"img/agachada.png" },
  jump:     { src:"img/jumping.png" },
  hurt:     { src:"img/damage.png" },
  injured:  { src:"img/lastimada.png" },
  defeated: { src:"img/defeated.png" },
  shoot:    { src:"img/shoot.png" },

  // muzzle
  muzzle:  { src:"img/Balas.png" }, // 3 frames

  // enemies
  z_basic: { src:"img/zombie.png" },
  z_green: { src:"img/zombie verde.png" },
  z_white: { src:"img/zombie blanco.png" },
  dog:     { src:"img/perro.png" },
  spider:  { src:"img/zombie araña.png" },

  // boss anims
  boss_idle:   { src:"img/jefe_final.png" },
  boss_attack: { src:"img/heavy_attack.png" },
  boss_hurt:   { src:"img/boss_hurt.png" },
};

const GFX = {};
function loadImage(key, src){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=>res(img);
    img.onerror = ()=>rej(new Error("No se pudo cargar: " + src));
    img.src = src;
    GFX[key] = img;
  });
}
async function loadAll(){
  const tasks = [];
  for(const k in ASSETS) tasks.push(loadImage(k, ASSETS[k].src));
  await Promise.allSettled(tasks);
}

// ===================== AUDIO (WebAudio) =====================
let audioCtx=null, master=null, comp=null, sfxGain=null, musicGain=null;
let muted=false, musicOn=false, musicNodes=[];
let sfxVol = 0.95;

function initAudio(){
  if(audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  master = audioCtx.createGain();
  master.gain.value = 0.95;

  // ✅ compresor para que suene fuerte sin reventar
  comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.12;

  master.connect(comp);
  comp.connect(audioCtx.destination);

  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = sfxVol;
  sfxGain.connect(master);

  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.26; // música más presente
  musicGain.connect(master);
}

function setMuted(m){
  muted = m;
  if(master) master.gain.value = muted ? 0 : 0.95;
  if(btnMute) btnMute.textContent = muted ? "Activar sonido" : "Mute";
  if(muted) stopMusic(); else startMusic();
}

function envGain(g, t0, a=0.005, d=0.08, peak=1.0){
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function noiseBuffer(seconds){
  const n = Math.floor(audioCtx.sampleRate * seconds);
  const b = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const data = b.getChannelData(0);
  for(let i=0;i<n;i++) data[i] = (Math.random()*2-1);
  return b;
}

// ✅ SFX más “Metal Slug”
const SFX = {
  shoot(){
    if(!audioCtx || muted) return;
    const t0 = audioCtx.currentTime;

    // ruido + filtro (muzzle)
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer(0.08);

    const hp = audioCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(900, t0);

    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5200, t0);

    const g = audioCtx.createGain();
    envGain(g, t0, 0.003, 0.06, 0.85);

    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + 0.09);

    // click metálico
    const o = audioCtx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(1200, t0);
    o.frequency.exponentialRampToValueAtTime(420, t0 + 0.05);
    const g2 = audioCtx.createGain();
    envGain(g2, t0, 0.002, 0.05, 0.20);
    o.connect(g2); g2.connect(sfxGain);
    o.start(t0);
    o.stop(t0 + 0.06);
  },

  hit(){
    if(!audioCtx || muted) return;
    const t0 = audioCtx.currentTime;

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer(0.10);
    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(240, t0);

    const g = audioCtx.createGain();
    envGain(g, t0, 0.004, 0.10, 0.65);

    src.connect(bp); bp.connect(g); g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + 0.11);
  },

  dead(){
    if(!audioCtx || muted) return;
    const t0 = audioCtx.currentTime;

    // thump + noise
    const o = audioCtx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(120, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.18);

    const g = audioCtx.createGain();
    envGain(g, t0, 0.004, 0.22, 0.35);
    o.connect(g); g.connect(sfxGain);
    o.start(t0);
    o.stop(t0 + 0.20);

    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const lp = audioCtx.createBiquadFilter();
    lp.type="lowpass";
    lp.frequency.setValueAtTime(650, t0);
    const g2 = audioCtx.createGain();
    envGain(g2, t0, 0.003, 0.18, 0.45);
    src.connect(lp); lp.connect(g2); g2.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + 0.20);
  },

  zombie(){
    if(!audioCtx || muted) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.type="triangle";
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(80, t0+0.18);
    const g = audioCtx.createGain();
    envGain(g, t0, 0.01, 0.20, 0.18);
    o.connect(g); g.connect(sfxGain);
    o.start(t0);
    o.stop(t0+0.22);
  },

  boss(){
    if(!audioCtx || muted) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.type="sawtooth";
    o.frequency.setValueAtTime(70, t0);
    o.frequency.exponentialRampToValueAtTime(45, t0+0.25);
    const g = audioCtx.createGain();
    envGain(g, t0, 0.01, 0.28, 0.24);
    o.connect(g); g.connect(sfxGain);
    o.start(t0);
    o.stop(t0+0.30);
  },

  spit(){ if(!audioCtx||muted) return; simpleBeep(380, 0.12, 0.22, "square"); },
  web(){  if(!audioCtx||muted) return; simpleBeep(420, 0.14, 0.20, "triangle"); },
  bark(){ if(!audioCtx||muted) return; simpleBeep(220, 0.10, 0.24, "sawtooth"); },
  reload(){ if(!audioCtx||muted) return; simpleBeep(260, 0.12, 0.22, "sine"); },
  heal(){ if(!audioCtx||muted) return; simpleBeep(640, 0.16, 0.18, "triangle"); },
  door(){ if(!audioCtx||muted) return; simpleBeep(720, 0.10, 0.20, "sine"); },
};

function simpleBeep(freq, dur, gain, type="sine"){
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = audioCtx.createGain();
  envGain(g, t0, 0.003, dur, gain);
  o.connect(g); g.connect(sfxGain);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// ✅ Música más “horror” con beat suave
function startMusic(){
  if(!audioCtx || muted || musicOn) return;
  musicOn = true;

  const t0 = audioCtx.currentTime;

  // pad
  const pad1 = audioCtx.createOscillator();
  const pad2 = audioCtx.createOscillator();
  pad1.type="triangle";
  pad2.type="sine";

  const padG = audioCtx.createGain();
  padG.gain.setValueAtTime(0.06, t0);

  const lp = audioCtx.createBiquadFilter();
  lp.type="lowpass";
  lp.frequency.setValueAtTime(900, t0);

  pad1.connect(padG);
  pad2.connect(padG);
  padG.connect(lp);
  lp.connect(musicGain);

  // intervalos tensos
  const seq=[196,174.61,164.81,146.83,164.81,174.61,196,220];
  let i=0;
  let alive=true;

  function tick(){
    if(!musicOn || !alive) return;
    const tt = audioCtx.currentTime;
    const n = seq[i%seq.length];
    pad1.frequency.setValueAtTime(n, tt);
    pad2.frequency.setValueAtTime(n*0.503, tt); // desafinado para terror
    i++;
    setTimeout(tick, 320);
  }

  // beat (kick suave)
  const beat = setInterval(()=>{
    if(!musicOn) return;
    const tt = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.type="sine";
    o.frequency.setValueAtTime(90, tt);
    o.frequency.exponentialRampToValueAtTime(45, tt + 0.12);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.exponentialRampToValueAtTime(0.10, tt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);

    o.connect(g); g.connect(musicGain);
    o.start(tt);
    o.stop(tt + 0.18);
  }, 680);

  pad1.start(t0);
  pad2.start(t0);
  tick();

  musicNodes = [pad1, pad2, lp, padG, { stop(){ alive=false; clearInterval(beat); } }];
}

function stopMusic(){
  musicOn=false;
  try{
    for(const n of musicNodes){
      if(!n) continue;
      if(typeof n.stop === "function") n.stop();
    }
  }catch{}
  musicNodes=[];
}

// ===================== FULLSCREEN =====================
function toggleFullscreen(){
  const el = canvas; // o document.querySelector(".canvas-wrap")
  const fsEl = document.fullscreenElement;

  if(!fsEl){
    if(el.requestFullscreen) el.requestFullscreen();
  }else{
    if(document.exitFullscreen) document.exitFullscreen();
  }
}

document.addEventListener("keydown",(e)=>{
  if((e.key||"").toLowerCase()==="f"){
    toggleFullscreen();
  }
});

// ===================== INPUT =====================
let keys = new Set();
let mouse = { x: 0, y: 0, down: false };
let paused = true;
let gameOver = false;
let victory = false;

let interactPressed = false;
let jumpQueued = false;

function isSpaceKey(e){
  const k = (e.key || "").toLowerCase();
  return e.key === " " || k === " " || k === "space" || k === "spacebar";
}

document.addEventListener("keydown",(e)=>{
  const k = (e.key || "").toLowerCase();
  if(isSpaceKey(e) || ["arrowup","arrowdown","arrowleft","arrowright","tab"].includes(k)) e.preventDefault();
  keys.add(k);

  if(k==="p") togglePause();
  if(k==="m") toggleMute();
  if(k==="r") reload();
  if(k==="h") heal();
  if(k==="e") interactPressed = true;

  if(k==="w" || k==="arrowup") jumpQueued = true;
  if(isSpaceKey(e)) shoot();
},{passive:false});

document.addEventListener("keyup",(e)=>{
  const k = (e.key || "").toLowerCase();
  keys.delete(k);
  if(k==="e") interactPressed = false;
});

canvas.addEventListener("mousemove",(e)=>{
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left);
  mouse.y = (e.clientY - r.top);
});
canvas.addEventListener("mousedown",(e)=>{
  mouse.down = true;
  canvas.focus();
  if(paused){
    startGame();
    return;
  }
  if(e.button===0) shoot();
});
canvas.addEventListener("mouseup",()=>mouse.down=false);
canvas.addEventListener("contextmenu",(e)=>e.preventDefault());

function autoFire(){
  if(mouse.down && !paused && !gameOver) shoot();
  requestAnimationFrame(autoFire);
}
autoFire();

// ===================== STATE =====================
let level = 1;
let score = 0;
let high = Number(localStorage.getItem("rs_high") || 0);

let killGoal = 10;
let killsThisLevel = 0;

let bullets = [];
let enemyBullets = [];
let enemies = [];
let drops = [];
let fx = [];

let exitDoor = { x: WORLD_W - 280, y: 0, w: 110, h: 140, active: false };
let waveProfile = null;

// tamaños
const SPR = {
  playerH: 96,
  playerW: 70,
  crouchH: 64,
  zH: { basic: 110, spitter: 118, tongue: 118, dog: 92, spider: 110, flyer: 98, boss: 230 }
};

const player = {
  x: 120, y: 0,
  w: 70, h: 96,
  baseH: 96,
  crouchH: 64,
  isCrouch: false,

  vx: 0, vy: 0,
  hp: 100, maxHp: 100,
  inv: 0,
  speed: 4.2,

  aim: {ax:1, ay:0},
  facing: 1,

  hurtT: 0,
  shootT: 0,
};

let ammo = { mag: 18, maxMag: 18, reserve: 120 };
let medkits = 2;

// ===================== AUTO SIZE =====================
function sizeFromImage(imgKey, targetH, fallbackW=80){
  const img = GFX[imgKey];
  if(!img || !img.width || !img.height){
    return { w: fallbackW, h: targetH };
  }
  const aspect = img.width / img.height;
  const w = Math.round(targetH * aspect);
  return { w, h: targetH };
}
function initSpriteMetrics(){
  const base = sizeFromImage(GFX.runR ? "runR" : "idle", 112, 80); // ⬅️ un poco más grande
  SPR.playerH = clamp(base.h, 96, 140);
  SPR.playerW = clamp(base.w, 70, 130);
  SPR.crouchH = Math.round(SPR.playerH * 0.68);

  player.w = SPR.playerW;
  player.h = SPR.playerH;
  player.baseH = SPR.playerH;
  player.crouchH = SPR.crouchH;
  player.y = groundY() - player.h;
}

// ===================== LEVELS =====================
const LEVELS = [
  { goal: 10, wave: { basic: 10 } },
  { goal: 12, wave: { basic: 8, spitter: 4 } },
  { goal: 14, wave: { basic: 8, spitter: 4, dog: 2 } },
  { goal: 16, wave: { basic: 8, spitter: 4, dog: 2, tongue: 2 } },
  { goal: 18, wave: { basic: 7, spitter: 5, dog: 2, tongue: 2, spider: 2 } },
  { goal: 20, wave: { basic: 6, spitter: 6, dog: 3, tongue: 2, spider: 3 } },
  { goal: 22, wave: { basic: 6, spitter: 6, dog: 3, tongue: 2, spider: 3, flyer: 2 } },
  { goal: 24, wave: { basic: 6, spitter: 7, dog: 3, tongue: 3, spider: 3, flyer: 3 } },
  { goal: 26, wave: { basic: 6, spitter: 8, dog: 4, tongue: 3, spider: 4, flyer: 4 } },
  { goal: 999, wave: { boss: 1 } },
];

// ===================== SPAWN =====================
function enemyTemplate(type){
  const h = SPR.zH[type] ?? 110;
  const base = {
    basic:   { img:"z_basic",  hp:55,  sp:1.1,  dmg:10, flyer:false },
    spitter: { img:"z_green",  hp:70,  sp:0.9,  dmg:10, flyer:false },
    tongue:  { img:"z_white",  hp:80,  sp:0.85, dmg:12, flyer:false },
    dog:     { img:"dog",      hp:55,  sp:2.3,  dmg:14, flyer:false },
    spider:  { img:"spider",   hp:70,  sp:1.6,  dmg:12, flyer:false },
    flyer:   { img:"spider",   hp:60,  sp:1.5,  dmg:10, flyer:true  },
    boss:    { img:"boss_idle",hp:980, sp:0.9,  dmg:18, flyer:false, boss:true },
  }[type];
  if(!base) return null;

  const sz = sizeFromImage(base.img, h, Math.round(h*0.9));
  return { ...base, w: sz.w, h: sz.h };
}

function pickEnemyTypeFromProfile(profile){
  const entries = Object.entries(profile || {}).filter(([k,v])=>v>0 && k!=="boss");
  if(entries.length===0) return "basic";
  let sum = 0;
  for(const [,w] of entries) sum += w;
  let r = Math.random() * sum;
  for(const [type,w] of entries){
    r -= w;
    if(r <= 0) return type;
  }
  return entries[0][0];
}

function spawnEnemy(type){
  const T = enemyTemplate(type);
  if(!T) return;

  const x = rand(Math.max(600, player.x+500), Math.min(WORLD_W - 600, player.x+1600));
  const y = T.flyer ? rand(90, groundY() - T.h - 180) : (groundY() - T.h);

  enemies.push({
    type,
    imgKey: T.img,
    x, y, w:T.w, h:T.h,
    vx: (Math.random()<0.5?-1:1) * T.sp,
    vy: 0,
    hp: T.hp + Math.floor(level*8),
    maxHp: T.hp + Math.floor(level*8),
    sp: T.sp,
    dmg: T.dmg,
    flyer: !!T.flyer,
    boss: !!T.boss,

    attackT: 0,
    hurtT: 0,
    enraged: false,

    nextAtk: performance.now() + rand(600, 1400),
    nextSound: performance.now() + rand(700, 1500),
    bob: rand(0, Math.PI*2),
  });
}

function spawnDirector(){
  if(level >= 10) return;
  if(killsThisLevel >= killGoal) return;

  const aliveTarget = clamp(5 + Math.floor(level/2), 5, 12);
  if(enemies.length < aliveTarget){
    const need = aliveTarget - enemies.length;
    for(let i=0;i<need;i++){
      spawnEnemy(pickEnemyTypeFromProfile(waveProfile));
    }
  }
}

function spawnWave(lvl){
  enemies.length = 0;
  const row = LEVELS[lvl-1];
  killGoal = row.goal;
  killsThisLevel = 0;
  waveProfile = row.wave;

  if(row.wave.boss){
    spawnEnemy("boss");
    enemies[0].x = WORLD_W - 980;
    enemies[0].y = groundY() - enemies[0].h;
    return;
  }

  const aliveTarget = clamp(5 + Math.floor(lvl/2), 5, 12);
  for(let i=0;i<aliveTarget;i++){
    spawnEnemy(pickEnemyTypeFromProfile(waveProfile));
  }
}

function spawnDrop(x,y){
  const r = Math.random();
  if(r < 0.45) drops.push({kind:"ammo", x, y, w:26, h:20});
  else if(r < 0.80) drops.push({kind:"med", x, y, w:22, h:22});
  else drops.push({kind:"kit", x, y, w:22, h:22});
}

// ===================== AIM =====================
function updateAim(){
  const px = (player.x - cameraX) + player.w*0.55;
  const py = player.y + player.h*0.40;
  const dx = mouse.x - px;
  const dy = mouse.y - py;
  const v = norm(dx, dy);
  player.aim.ax = v.x;
  player.aim.ay = v.y;
  player.facing = (v.x >= 0) ? 1 : -1;
}

// ===================== ACTIONS =====================
let lastShot = 0;

function shoot(){
  if(paused || gameOver) return;
  const t = performance.now();
  if(t - lastShot < 115) return;

  if(ammo.mag <= 0) return;

  lastShot = t;
  ammo.mag--;
  SFX.shoot();
  player.shootT = 6;

  updateAim();

  const sx = player.x + player.w*0.55;
  const sy = player.y + player.h*0.40;

  fx.push({ kind:"muzzle", x: sx + player.aim.ax * 18, y: sy + player.aim.ay * 18, life: 10 });

  const speed = 13.8;
  bullets.push({ x:sx, y:sy, vx:player.aim.ax*speed, vy:player.aim.ay*speed, r:3, life:90, dmg:22 + Math.floor(level*1.1) });
}

function reload(){
  if(paused || gameOver) return;
  if(ammo.mag === ammo.maxMag) return;
  if(ammo.reserve <= 0) return;

  const need = ammo.maxMag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
  SFX.reload();
}

function heal(){
  if(paused || gameOver) return;
  if(medkits <= 0) return;
  if(player.hp >= player.maxHp) return;

  medkits--;
  player.hp = clamp(player.hp + 28, 0, player.maxHp);
  SFX.heal();
  fx.push({kind:"heal", x: player.x + player.w/2, y: player.y + 10, life: 26});
}

// ===================== FX =====================
function spawnBlood(x,y,amount=10){
  for(let i=0;i<amount;i++){
    fx.push({ kind:"blood", x, y, vx: rand(-2.6,2.6), vy: rand(-3.6,-0.8), r: rand(1.6,3.8), life: Math.floor(rand(22,48)) });
  }
}
function spawnImpact(x,y){
  fx.push({kind:"hit", x, y, life: 16});
  for(let i=0;i<6;i++){
    fx.push({ kind:"spark", x, y, vx: rand(-3.5,3.5), vy: rand(-3.2,1.0), life: Math.floor(rand(10,18)) });
  }
}

// ===================== ENEMY ATTACKS =====================
function enemyAttack(e){
  const t = performance.now();

  if(t > e.nextSound){
    if(e.boss) SFX.boss(); else SFX.zombie();
    e.nextSound = t + rand(900, 1700);
  }

  const dx = (player.x + player.w*0.5) - (e.x + e.w*0.5);
  const dy = (player.y + player.h*0.5) - (e.y + e.h*0.5);
  const dist = Math.hypot(dx,dy);

  if(e.type === "basic"){
    if(dist < 70){
      damagePlayer(e.dmg);
      spawnImpact(player.x+player.w/2, player.y+player.h*0.5);
      spawnBlood(player.x+player.w/2, player.y+player.h*0.55, 6);
      e.nextAtk = t + 850;
    } else e.nextAtk = t + 400;
    return;
  }

  if(e.type === "spitter" || e.type === "flyer"){
    if(dist < 860){
      const v = norm(dx, dy);
      enemyBullets.push({ kind:"spit", x:e.x+e.w*0.55, y:e.y+e.h*0.50, vx:v.x*6.7, vy:v.y*6.7, r:6, life:150, dmg:10+Math.floor(level*0.6) });
      SFX.spit();
      e.nextAtk = t + (e.type==="flyer" ? 950 : 1100);
    } else e.nextAtk = t + 520;
    return;
  }

  if(e.type === "tongue"){
    if(dist < 340){
      const v = norm(dx, dy);
      enemyBullets.push({ kind:"tongue", x:e.x+e.w*0.55, y:e.y+e.h*0.50, vx:v.x*10.2, vy:v.y*10.2, r:4, life:26, dmg:14+Math.floor(level*0.7) });
      SFX.web();
      e.nextAtk = t + 1050;
    } else e.nextAtk = t + 560;
    return;
  }

  if(e.type === "dog"){
    if(dist < 540){
      const dir = dx>=0 ? 1 : -1;
      e.vx = dir * 6.0;
      e.vy = -2.2;
      SFX.bark();
      e.nextAtk = t + 900;
    } else e.nextAtk = t + 520;
    return;
  }

  if(e.type === "spider"){
    if(dist < 580){
      const v = norm(dx, dy);
      e.vx = v.x * 4.2;
      e.vy = -8.6;
      SFX.web();
      e.nextAtk = t + 1200;
    } else e.nextAtk = t + 640;
    return;
  }

  if(e.type === "boss"){
    if(dist < 1500){
      e.attackT = 16;
      const v = norm(dx, dy);
      enemyBullets.push({ kind:"cannon", x:e.x+e.w*0.20, y:e.y+e.h*0.52, vx:v.x*(e.enraged?8.2:7.2), vy:v.y*(e.enraged?8.2:7.2), r:12, life:190, dmg:(e.enraged?22:18) });
      SFX.boss();
    }
    if(Math.random() < (e.enraged ? 0.45 : 0.30) && enemies.length < 18){
      spawnEnemy("basic");
      spawnEnemy("spitter");
    }
    e.nextAtk = t + (e.enraged ? 520 : 650);
  }
}

// ===================== DAMAGE =====================
function damagePlayer(dmg){
  if(player.inv>0) return;
  player.hp -= dmg;
  player.inv = 18;
  player.hurtT = 12;
  SFX.hit();

  if(player.hp <= 0){
    player.hp = 0;
    gameOver = true;
    victory = false;
    SFX.dead();
    stopMusic();
    updateHigh();
  }
}

function damageEnemy(e, dmg, hitX, hitY){
  e.hp -= dmg;
  spawnImpact(hitX, hitY);
  spawnBlood(hitX, hitY, e.boss ? 22 : 12);
  SFX.hit();

  if(e.boss){
    e.hurtT = 12;
    if(e.hp / e.maxHp <= 0.35) e.enraged = true;
  }

  if(e.hp <= 0){
    e.hp = 0;
    killsThisLevel++;
    score += e.boss ? 2000 : 140;
    spawnDrop(e.x+e.w/2, e.y+e.h*0.5);
    SFX.dead();
    e.dead = true;

    if(e.boss){
      gameOver = true;
      victory = true;
      stopMusic();
      updateHigh();
    }
  }
}

// ===================== PHYS / MOVE =====================
const GRAV = 0.72;
const MAX_FALL = 16;

function isGrounded(){
  const gy = groundY() - player.h;
  return Math.abs(player.y - gy) < 0.01 && Math.abs(player.vy) < 0.01;
}
function applyCrouch(){
  const want = (keys.has("s") || keys.has("arrowdown")) && isGrounded();
  if(want === player.isCrouch) return;
  player.isCrouch = want;
  player.h = want ? player.crouchH : player.baseH;
  player.y = groundY() - player.h;
}

function stepPlayer(){
  const left  = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");

  applyCrouch();

  let ax = 0;
  if(left) ax -= 1;
  if(right) ax += 1;

  const spMul = player.isCrouch ? 0.55 : 1.0;

  player.vx += ax * 0.75 * spMul;
  player.vx *= 0.82;
  player.vx = clamp(player.vx, -player.speed*spMul, player.speed*spMul);

  if(jumpQueued){
    jumpQueued = false;
    if(isGrounded() && !player.isCrouch){
      player.vy = -13.2;
    }
  }

  player.vy += GRAV;
  player.vy = clamp(player.vy, -14, MAX_FALL);

  player.x += player.vx;
  player.y += player.vy;

  player.x = clamp(player.x, 0, WORLD_W - player.w);

  const gy = groundY() - player.h;
  if(player.y > gy){
    player.y = gy;
    player.vy = 0;
  }

  if(player.inv>0) player.inv--;
  if(player.hurtT>0) player.hurtT--;
  if(player.shootT>0) player.shootT--;
}

function stepEnemies(){
  const t = performance.now();
  for(const e of enemies){
    if(e.dead) continue;

    e.bob += 0.10;
    if(e.attackT>0) e.attackT--;
    if(e.hurtT>0) e.hurtT--;

    const px = player.x + player.w*0.5;
    const ex = e.x + e.w*0.5;
    const dir = (px >= ex) ? 1 : -1;

    if(e.flyer){
      e.x += dir * e.sp * 0.65;
      e.y += Math.sin(e.bob) * 0.45;
      e.y = clamp(e.y, 70, groundY() - e.h - 180);
    } else {
      e.vy += GRAV;
      e.vy = clamp(e.vy, -12, MAX_FALL);

      if(e.type==="dog"){
        e.vx += dir * 0.14;
        e.vx = clamp(e.vx, -e.sp*1.2, e.sp*1.2);
        e.vx *= 0.92;
      } else if(e.type==="spider"){
        e.vx += dir * 0.10;
        e.vx = clamp(e.vx, -e.sp, e.sp);
        e.vx *= 0.90;
      } else if(e.type==="boss"){
        const sp = e.enraged ? (e.sp*1.15) : e.sp;
        e.vx += dir * 0.05;
        e.vx = clamp(e.vx, -sp, sp);
        e.vx *= 0.95;
      } else {
        e.vx += dir * 0.06;
        e.vx = clamp(e.vx, -e.sp, e.sp);
        e.vx *= 0.94;
      }

      e.x += e.vx;
      e.y += e.vy;

      const gy = groundY() - e.h;
      if(e.y > gy){
        e.y = gy;
        e.vy = 0;
      }
    }

    if(!e.flyer && aabb(player, e)){
      damagePlayer(e.dmg);
      spawnBlood(player.x+player.w/2, player.y+player.h*0.6, 6);
    }

    if(t > e.nextAtk){
      enemyAttack(e);
    }
  }

  enemies = enemies.filter(e=>!e.dead);
}

function stepBullets(){
  for(const b of bullets){
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    for(const e of enemies){
      if(e.dead) continue;
      if(b.x > e.x && b.x < e.x+e.w && b.y > e.y && b.y < e.y+e.h){
        damageEnemy(e, b.dmg, b.x, b.y);
        b.life = 0;
        break;
      }
    }
  }
  bullets = bullets.filter(b=>b.life>0 && b.x>-100 && b.x<WORLD_W+100 && b.y>-100 && b.y<H()+100);

  for(const b of enemyBullets){
    b.x += b.vx;
    b.y += b.vy;
    b.life--;
    if(b.kind==="spit") b.vy += 0.02;

    if(b.x > player.x && b.x < player.x+player.w && b.y > player.y && b.y < player.y+player.h){
      damagePlayer(b.dmg);
      spawnImpact(b.x, b.y);
      spawnBlood(b.x, b.y, 7);
      b.life = 0;
    }
  }
  enemyBullets = enemyBullets.filter(b=>b.life>0);
}

function stepDrops(){
  for(const d of drops){
    d.y += 1.8;
    d.y = Math.min(d.y, groundY() - d.h);

    if(aabb(player, d)){
      if(d.kind==="ammo"){
        ammo.reserve += 30;
        score += 25;
        SFX.reload();
      } else if(d.kind==="med"){
        player.hp = clamp(player.hp + 18, 0, player.maxHp);
        score += 20;
        SFX.heal();
      } else if(d.kind==="kit"){
        medkits += 1;
        score += 30;
        SFX.heal();
      }
      d.dead = true;
    }
  }
  drops = drops.filter(d=>!d.dead);
}

function stepFX(){
  for(const p of fx){
    p.life--;
    if(p.kind==="blood" || p.kind==="spark"){
      p.x += p.vx; p.y += p.vy;
      p.vy += (p.kind==="blood" ? 0.22 : 0.18);
      const gy = groundY()-2;
      if(p.y > gy){
        p.y = gy;
        p.vx *= 0.65;
        p.vy *= -0.20;
      }
    }
  }
  fx = fx.filter(p=>p.life>0);
}

// ===================== CAMERA =====================
function updateCamera(){
  // ✅ si viewW aún es raro, no rompas cámara
  const vw = Math.max(1, W());
  const maxCam = Math.max(0, WORLD_W - vw);
  const target = clamp(player.x - vw*0.40, 0, maxCam);

  cameraVx += (target - cameraX) * 0.08;
  cameraVx *= 0.72;
  cameraX += cameraVx;

  if(!Number.isFinite(cameraX)) cameraX = 0;
  cameraX = clamp(cameraX, 0, maxCam);
}

// ===================== EXIT DOOR =====================
function setupExit(){
  exitDoor.x = WORLD_W - 280;
  exitDoor.w = 110;
  exitDoor.h = 140;
  exitDoor.y = groundY() - exitDoor.h;
  exitDoor.active = false;
}

function updateExit(){
  exitDoor.active = (level < 10) ? (killsThisLevel >= killGoal) : (enemies.length === 0);
  if(!exitDoor.active) return;

  if(aabb(player, exitDoor) && interactPressed){
    interactPressed = false;
    SFX.door();

    bullets.length = 0;
    enemyBullets.length = 0;
    drops.length = 0;
    fx.length = 0;

    if(level < MAX_LEVELS){
      setupLevel(level + 1);
    } else {
      gameOver = true;
      victory = true;
      stopMusic();
      updateHigh();
    }
  }
}

// ===================== HUD / HIGH SCORE =====================
function updateHigh(){
  if(score > high){
    high = score;
    localStorage.setItem("rs_high", String(high));
  }
}
function updateTopUI(){
  setText(uiLvl, level);
  setText(uiScore, score);
  setText(uiHigh, high);
}

// ===================== RENDER =====================
function drawBackground(){
  const img = GFX.bg;
  const w = W(), h = H();

  ctx.fillStyle = "#070b14";
  ctx.fillRect(0,0,w,h);

  if(img){
    const sx = Math.floor(cameraX * 0.55) % img.width;
    for(let x=-sx; x<w; x+=img.width){
      ctx.drawImage(img, x, 0, img.width, h);
    }
  } else {
    ctx.fillStyle="#0b1220";
    ctx.fillRect(0,0,w,h);
  }

  ctx.fillStyle="rgba(0,0,0,0.25)";
  ctx.fillRect(0, groundY(), w, FLOOR_H);
}

function drawCrosshair(){
  const x = mouse.x, y = mouse.y;
  ctx.save();
  ctx.strokeStyle="rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x-10,y); ctx.lineTo(x+10,y);
  ctx.moveTo(x,y-10); ctx.lineTo(x,y+10);
  ctx.stroke();
  ctx.restore();
}

function drawHealthBar(x,y,w,h,val,max,isPlayer){
  const pct = clamp(val/max, 0, 1);
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.55)";
  ctx.fillRect(x,y,w,h);
  ctx.fillStyle = isPlayer ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.92)";
  ctx.fillRect(x,y,w*pct,h);
  ctx.strokeStyle="rgba(255,255,255,0.18)";
  ctx.strokeRect(x,y,w,h);
  ctx.restore();
}

function drawPlayer(){
  const x = Math.round(player.x - cameraX);
  const y = Math.round(player.y);

  const grounded = isGrounded();
  const moving = Math.abs(player.vx) > 0.35;

  let img = null;
  if(gameOver && !victory) img = GFX.defeated || GFX.idle;
  else if(player.hurtT > 0) img = GFX.hurt || GFX.idle;
  else if(player.shootT > 0 && GFX.shoot) img = GFX.shoot;
  else if(player.isCrouch) img = GFX.crouch || GFX.idle;
  else if(!grounded) img = GFX.jump || GFX.idle;
  else if(moving) img = (player.facing === -1) ? (GFX.runL || GFX.runR || GFX.idle) : (GFX.runR || GFX.runL || GFX.idle);
  else if(player.hp <= 35 && GFX.injured) img = GFX.injured;
  else img = GFX.idle;

  if(img){
    ctx.save();
    const flip =
      (player.facing === -1) &&
      (img === GFX.idle || img === GFX.jump || img === GFX.hurt || img === GFX.injured || img === GFX.shoot);

    if(flip){
      ctx.translate(x + player.w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, player.w, player.h);
    } else {
      ctx.drawImage(img, x, y, player.w, player.h);
    }
    ctx.restore();
  } else {
    ctx.fillStyle="#fff";
    ctx.fillRect(x,y,player.w,player.h);
  }

  drawHealthBar(x, y-10, player.w, 6, player.hp, player.maxHp, true);
  drawCrosshair();
}

function drawEnemies(){
  for(const e of enemies){
    const x = Math.round(e.x - cameraX);
    const y = Math.round(e.y + (e.flyer ? Math.sin(e.bob)*2 : 0));

    let img = GFX[e.imgKey];
    if(e.boss){
      if(e.hurtT > 0) img = GFX.boss_hurt || GFX.boss_idle;
      else if(e.attackT > 0) img = GFX.boss_attack || GFX.boss_idle;
      else img = GFX.boss_idle || GFX.boss_attack;
    }

    if(img) ctx.drawImage(img, x, y, e.w, e.h);
    else { ctx.fillStyle="#7f1d1d"; ctx.fillRect(x,y,e.w,e.h); }

    drawHealthBar(x, y-10, e.w, 6, e.hp, e.maxHp, false);
  }
}

function drawBullets(){
  ctx.fillStyle = "rgba(250,204,21,0.95)";
  for(const b of bullets){
    const x = b.x - cameraX;
    ctx.beginPath();
    ctx.arc(x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
  }

  for(const b of enemyBullets){
    const x = b.x - cameraX;
    if(b.kind==="cannon"){
      ctx.fillStyle="rgba(239,68,68,0.95)";
      ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    } else if(b.kind==="tongue"){
      ctx.fillStyle="rgba(251,113,133,0.95)";
      ctx.fillRect(x-6, b.y-2, 12, 4);
    } else {
      ctx.fillStyle="rgba(34,197,94,0.95)";
      ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI*2); ctx.fill();
    }
  }
}

function drawFX(){
  for(const p of fx){
    const x = p.x - cameraX;
    const y = p.y;

    if(p.kind==="muzzle"){
      const img = GFX.muzzle;
      if(img){
        const frames = 3;
        const fw = Math.floor(img.width / frames);
        const fh = img.height;
        const idx = clamp(Math.floor((10 - p.life) / 3), 0, 2);

        const size = 58;
        ctx.save();
        ctx.translate(x, y);
        const ang = Math.atan2(player.aim.ay, player.aim.ax);
        ctx.rotate(ang);
        ctx.drawImage(img, idx * fw, 0, fw, fh, -size/2, -size/2, size, size);
        ctx.restore();
      }
      continue;
    }

    if(p.kind==="hit"){
      ctx.fillStyle = `rgba(255,255,255,${clamp(p.life/16,0,1)})`;
      ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();
      continue;
    }

    if(p.kind==="spark"){
      ctx.fillStyle = `rgba(250,204,21,${clamp(p.life/18,0,1)})`;
      ctx.fillRect(x, y, 2, 2);
      continue;
    }

    if(p.kind==="blood"){
      ctx.fillStyle = `rgba(220,38,38,${clamp(p.life/48,0,1)})`;
      ctx.beginPath(); ctx.arc(x,y,p.r,0,Math.PI*2); ctx.fill();
      continue;
    }

    if(p.kind==="heal"){
      ctx.fillStyle = `rgba(34,197,94,${clamp(p.life/26,0,1)})`;
      ctx.beginPath(); ctx.arc(x,y,16,0,Math.PI*2); ctx.fill();
      continue;
    }
  }
}

function drawDoor(){
  const x = exitDoor.x - cameraX;
  const y = exitDoor.y;

  ctx.fillStyle = exitDoor.active ? "rgba(34,197,94,0.18)" : "rgba(0,0,0,0.30)";
  ctx.fillRect(x, y, exitDoor.w, exitDoor.h);

  ctx.strokeStyle = exitDoor.active ? "rgba(34,197,94,0.95)" : "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, exitDoor.w, exitDoor.h);

  ctx.fillStyle="rgba(255,255,255,0.95)";
  ctx.font="bold 14px Arial";

  if(!exitDoor.active){
    ctx.fillText("CERRADO", x+16, y+24);
    ctx.font="12px Arial";
    ctx.fillText(`Objetivo: ${killsThisLevel}/${killGoal}`, x+12, y+44);
  } else {
    ctx.fillText("SALIDA", x+26, y+24);
    ctx.font="12px Arial";
    ctx.fillText("META COMPLETA", x+12, y+44);
  }
}

function drawHUD(){
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.40)";
  ctx.fillRect(12, 12, 520, 96);
  ctx.strokeStyle="rgba(255,255,255,0.10)";
  ctx.strokeRect(12, 12, 520, 96);

  ctx.fillStyle="rgba(255,255,255,0.92)";
  ctx.font="bold 14px Arial";
  ctx.fillText(`Nivel: ${level}/10`, 24, 34);

  ctx.font="13px Arial";
  ctx.fillText(`Objetivo: ${killsThisLevel}/${killGoal===999?"BOSS":killGoal}`, 24, 54);
  ctx.fillText(`Munición: ${ammo.mag}/${ammo.maxMag}  |  Reserva: ${ammo.reserve}`, 24, 74);
  ctx.fillText(`Medkits: ${medkits}`, 430, 74);
  drawHealthBar(24, 84, 490, 10, player.hp, player.maxHp, true);
  ctx.restore();
}

function drawEnd(){
  const w=W(), h=H();
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.78)";
  ctx.fillRect(0,0,w,h);

  ctx.fillStyle="rgba(255,255,255,0.95)";
  ctx.textAlign="center";
  ctx.font="bold 34px Arial";
  ctx.fillText(victory ? "🏆 VICTORIA" : "☠ GAME OVER", w/2, h/2 - 60);

  ctx.font="18px Arial";
  ctx.fillText(`Nivel alcanzado: ${level}/10`, w/2, h/2 - 18);
  ctx.fillText(`Score: ${score}`, w/2, h/2 + 12);
  ctx.fillText(`High Score: ${high}`, w/2, h/2 + 42);

  ctx.font="14px Arial";
  ctx.fillStyle="rgba(255,255,255,0.75)";
  ctx.fillText("Click para reiniciar • R reiniciar • P pausa • M mute • F fullscreen", w/2, h/2 + 90);
  ctx.restore();
  ctx.textAlign="left";
}

// ===================== LOOP =====================
function step(){
  if(paused || gameOver) return;

  updateAim();
  stepPlayer();
  stepEnemies();
  stepBullets();
  stepDrops();
  stepFX();

  spawnDirector();

  updateCamera();
  updateExit();
  updateTopUI();

  if(score > high) updateHigh();
}

function render(){
  drawBackground();
  drawDoor();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawFX();
  drawHUD();
  if(gameOver) drawEnd();
}

function loop(){
  requestAnimationFrame(loop);
  step();
  render();
}

// ===================== LEVEL CONTROL =====================
function setupLevel(lvl){
  level = lvl;

  // reset player
  player.isCrouch = false;
  player.h = player.baseH;
  player.x = 120;
  player.y = groundY() - player.h;
  player.vx = 0;
  player.vy = 0;
  player.inv = 10;
  player.hurtT = 0;
  player.shootT = 0;

  ammo.maxMag = 18 + Math.floor((lvl-1)/2)*2;
  ammo.mag = ammo.maxMag;
  ammo.reserve += 40;
  medkits = clamp(medkits + 1, 0, 6);
  player.hp = clamp(player.hp + 18, 0, player.maxHp);

  spawnWave(lvl);
  setupExit();
  updateTopUI();

  // ✅ cámara SIEMPRE válida
  cameraVx = 0;
  cameraX  = clamp(player.x - Math.max(1,W())*0.40, 0, Math.max(0, WORLD_W - Math.max(1,W())));

  paused = false;
  if(btnPause) btnPause.textContent = "Pausa";
}

async function startGame(){
  initAudio();
  if(audioCtx && audioCtx.state==="suspended") await audioCtx.resume();
  if(!muted) startMusic();

  paused = false;
  if(overlay) overlay.classList.add("hidden");
  canvas.focus();
}

function resetGame(){
  paused = true;
  gameOver = false;
  victory = false;

  score = 0;
  killsThisLevel = 0;

  bullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  drops.length = 0;
  fx.length = 0;

  ammo = { mag: 18, maxMag: 18, reserve: 120 };
  medkits = 2;

  player.hp = player.maxHp;
  player.inv = 0;

  cameraX = 0; cameraVx = 0;

  setupLevel(1);
  updateTopUI();

  if(overlay) overlay.classList.remove("hidden");
}

function togglePause(){
  if(gameOver) return;
  paused = !paused;
  if(btnPause) btnPause.textContent = paused ? "Reanudar" : "Pausa";
  if(!paused) canvas.focus();
}

function toggleMute(){
  initAudio();
  setMuted(!muted);
}

canvas.addEventListener("click",()=>{
  if(gameOver) resetGame();
});

// ===================== BUTTONS =====================
if(btnStart) btnStart.addEventListener("click", startGame);
if(btnReset) btnReset.addEventListener("click", resetGame);
if(btnPause) btnPause.addEventListener("click", togglePause);
if(btnMute)  btnMute.addEventListener("click", toggleMute);
if(btnFS)    btnFS.addEventListener("click", toggleFullscreen);

if(volEl){
  volEl.addEventListener("input", ()=>{
    sfxVol = Number(volEl.value);
    if(sfxGain) sfxGain.gain.value = sfxVol;
  });
}

// ===================== BOOT =====================
(async function boot(){
  setText(uiHigh, high);
  await loadAll();
  initSpriteMetrics();

  resetGame();
  loop();
})();