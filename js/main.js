/* =========================================================
   RESIDENT SLUG - Survival Horror (Canvas 2D)
   - 10 niveles
   - Enemigos distintos con ataques distintos
   - Jefe final (nivel 10)
   - Puerta: "CERRADO" -> "SALIDA (E)"
   - WASD mover, Mouse apuntar, Click/Space disparar, R recargar, H curar, E puerta
   - W = BRINCAR, S = AGACHARSE (NEW)
   - Player run animation (3 frames) + flip L/R (NEW)
   - Sangre + impactos (NEW)
   - HUD estilo Metal Slug + minimapa + contador de objetivos (NEW)
   - Fix: nunca te quedas sin enemigos antes de cumplir objetivos (NEW)
========================================================= */

// ===================== CANVAS =====================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
canvas.style.outline = "none";
canvas.setAttribute("tabindex", "0");
canvas.style.display = "block";

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);

  // transform correcto
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ===================== UI =====================
const uiLvl   = document.getElementById("uiLvl");
const uiScore = document.getElementById("uiScore");
const uiHigh  = document.getElementById("uiHigh");

const overlay = document.getElementById("overlay");
const btnStart = document.getElementById("btnStart");
const btnReset = document.getElementById("btnReset");
const btnPause = document.getElementById("btnPause");
const btnMute  = document.getElementById("btnMute");
const volEl    = document.getElementById("vol");

function setText(el, v){ if(el) el.textContent = v; }

// ===================== UTILS =====================
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>Math.random()*(b-a)+a;

function aabb(a,b){
  return !(a.x+a.w<=b.x || a.x>=b.x+b.w || a.y+a.h<=b.y || a.y>=b.y+b.h);
}
function norm(x,y){
  const L = Math.hypot(x,y) || 1;
  return {x:x/L, y:y/L};
}

// ===================== ASSETS =====================
const ASSETS = {
  bg:      { src:"img/Fondo.png" },
  idle:    { src:"img/player.png" },

  // ✅ tus 3 frames de correr
  run1:    { src:"img/run1.png" },
  run2:    { src:"img/run2.png" },
  run3:    { src:"img/run3.png" },

  muzzle:  { src:"img/Balas.png" },              // 3 frames horiz
  z_basic: { src:"img/zombie.png" },
  z_green: { src:"img/zombie verde.png" },
  z_white: { src:"img/zombie blanco.png" },
  dog:     { src:"img/perro.png" },
  spider:  { src:"img/zombie araña.png" },
  boss:    { src:"img/jefe final.png" },
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
let audioCtx=null, master=null, sfxGain=null, musicGain=null;
let muted=false, musicOn=false, musicNodes=[];
let sfxVol = 0.85;

function initAudio(){
  if(audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  master = audioCtx.createGain();
  master.gain.value = 0.9;
  master.connect(audioCtx.destination);

  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = sfxVol;
  sfxGain.connect(master);

  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.18;
  musicGain.connect(master);
}

function setMuted(m){
  muted = m;
  if(master) master.gain.value = muted ? 0 : 0.9;

  if(btnMute) btnMute.textContent = muted ? "Activar sonido" : "Mute";
  if(muted) stopMusic(); else startMusic();
}

function beep({f=440,d=0.08,type="square",g=0.20,slide=null,bus="sfx"}={}){
  if(!audioCtx || muted) return;
  const o = audioCtx.createOscillator();
  const gg = audioCtx.createGain();
  const t0 = audioCtx.currentTime;

  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if(slide!=null) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + d);

  gg.gain.setValueAtTime(0.0001, t0);
  gg.gain.exponentialRampToValueAtTime(g, t0 + 0.01);
  gg.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

  o.connect(gg);
  gg.connect(bus==="music" ? musicGain : sfxGain);
  o.start(t0);
  o.stop(t0 + d);
}

function noisePop(d=0.08,g=0.20){
  if(!audioCtx || muted) return;
  const n = Math.floor(audioCtx.sampleRate * d);
  const b = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const data = b.getChannelData(0);
  for(let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1 - i/n);
  const src = audioCtx.createBufferSource();
  src.buffer = b;
  const gg = audioCtx.createGain();
  gg.gain.value = g;
  src.connect(gg);
  gg.connect(sfxGain);
  src.start();
}

const SFX = {
  shoot(){ beep({f:980,slide:520,d:0.05,type:"square",g:0.22}); },
  reload(){ beep({f:260,slide:420,d:0.12,type:"sine",g:0.20}); },
  heal(){ beep({f:520,slide:920,d:0.15,type:"triangle",g:0.18}); },
  hit(){ beep({f:140,slide:90,d:0.10,type:"sawtooth",g:0.20}); noisePop(0.05,0.18); },
  dead(){ noisePop(0.10,0.28); beep({f:120,slide:70,d:0.16,type:"sawtooth",g:0.16}); },
  step(){ beep({f:90,d:0.03,type:"sine",g:0.05}); },
  zombie(){
    beep({ f: 110, d: 0.10, type:"sawtooth", g:0.16 });
    beep({ f: 90, d: 0.14, type:"triangle", g:0.14 });
    noisePop(0.06, 0.18);
  },
  boss(){
    beep({ f: 70, d: 0.22, type:"sawtooth", g:0.18 });
    beep({ f: 55, d: 0.26, type:"triangle", g:0.14 });
    noisePop(0.10, 0.22);
  },
  spit(){ beep({f:340,slide:210,d:0.12,type:"square",g:0.18}); },
  web(){ beep({f:380,slide:140,d:0.14,type:"triangle",g:0.18}); },
  bark(){ beep({f:220,slide:160,d:0.10,type:"sawtooth",g:0.16}); },
  door(){ beep({f:520,slide:740,d:0.10,type:"sine",g:0.16}); }
};

function startMusic(){
  if(!audioCtx || muted || musicOn) return;
  musicOn = true;

  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  const f = audioCtx.createBiquadFilter();
  f.type="lowpass";
  f.frequency.value = 680;

  const g1 = audioCtx.createGain(); g1.gain.value = 0.07;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.05;

  o1.type="triangle";
  o2.type="sine";
  o1.connect(g1); o2.connect(g2);
  g1.connect(f); g2.connect(f);
  f.connect(musicGain);

  const seq=[196,174.61,164.81,146.83,164.81,174.61,196,220];
  let i=0;
  function tick(){
    if(!musicOn) return;
    const t0 = audioCtx.currentTime;
    const n = seq[i%seq.length];
    o1.frequency.setValueAtTime(n, t0);
    o2.frequency.setValueAtTime(n*0.5, t0);
    i++;
    setTimeout(tick, 360);
  }
  o1.start(); o2.start(); tick();
  musicNodes=[o1,o2,f,g1,g2];
}

function stopMusic(){
  musicOn=false;
  try{ for(const n of musicNodes) if(n && typeof n.stop==="function") n.stop(); }catch{}
  musicNodes=[];
}

// ===================== INPUT =====================
let keys = new Set();
let mouse = { x: 0, y: 0, down: false };
let paused = true;
let gameOver = false;
let victory = false;

let interactPressed = false;

// NEW: salto por “evento”, no por hold
let jumpQueued = false;

function isSpaceKey(e){
  const k = (e.key || "").toLowerCase();
  return e.key === " " || k === " " || k === "space" || k === "spacebar";
}

document.addEventListener("keydown",(e)=>{
  const k = (e.key || "").toLowerCase();

  if(isSpaceKey(e) || ["arrowup","arrowdown","arrowleft","arrowright","tab"].includes(k)) {
    e.preventDefault();
  }

  keys.add(k);

  if(k==="p") togglePause();
  if(k==="m") toggleMute();
  if(k==="r") reload();
  if(k==="h") heal();
  if(k==="e") interactPressed = true;

  // ✅ W = brincar
  if(k==="w" || k==="arrowup") jumpQueued = true;

  // ✅ Space dispara
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

// ===================== WORLD =====================
const MAX_LEVELS = 10;
const WORLD_W = 5200;
const FLOOR_H = 120;

function W(){ return canvas.clientWidth; }
function H(){ return canvas.clientHeight; }
function groundY(){ return H() - FLOOR_H; }

let cameraX = 0;
let cameraVx = 0;

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

// NEW: perfil de spawns por nivel
let waveProfile = null;

const player = {
  x: 120, y: 0,
  w: 54, h: 64,
  baseH: 64,
  crouchH: 44,
  isCrouch: false,

  vx: 0, vy: 0,
  hp: 100, maxHp: 100,
  inv: 0,
  speed: 4.2,

  aim: {ax:1, ay:0},
  facing: 1,

  // NEW: anim run
  animT: 0,
};

let ammo = { mag: 18, maxMag: 18, reserve: 120 };
let medkits = 2;

// ===================== LEVEL TABLE =====================
const LEVELS = [
  { goal: 8,  wave: { basic:6, spitter:1, dog:0, tongue:0, spider:0, flyer:0 } },
  { goal: 10, wave: { basic:6, spitter:2, dog:1, tongue:0, spider:0, flyer:0 } },
  { goal: 12, wave: { basic:6, spitter:3, dog:1, tongue:1, spider:0, flyer:0 } },
  { goal: 14, wave: { basic:6, spitter:3, dog:2, tongue:1, spider:1, flyer:0 } },
  { goal: 16, wave: { basic:7, spitter:4, dog:2, tongue:2, spider:1, flyer:0 } },
  { goal: 18, wave: { basic:7, spitter:4, dog:3, tongue:2, spider:2, flyer:0 } },
  { goal: 20, wave: { basic:8, spitter:5, dog:3, tongue:2, spider:2, flyer:1 } },
  { goal: 22, wave: { basic:8, spitter:5, dog:4, tongue:3, spider:2, flyer:2 } },
  { goal: 24, wave: { basic:9, spitter:6, dog:4, tongue:3, spider:3, flyer:3 } },
  { goal: 999, wave: { boss:1 } }, // boss
];

// ===================== SPAWN =====================
function enemyTemplate(type){
  const T = {
    basic:  { img:"z_basic",  w:70,h:78, hp:55,  sp:1.1,  dmg:10, flyer:false },
    spitter:{ img:"z_green",  w:84,h:84, hp:70,  sp:0.9,  dmg:10, flyer:false },
    tongue: { img:"z_white",  w:78,h:88, hp:80,  sp:0.85, dmg:12, flyer:false },
    dog:    { img:"dog",      w:92,h:62, hp:55,  sp:2.3,  dmg:14, flyer:false },
    spider: { img:"spider",   w:92,h:80, hp:70,  sp:1.6,  dmg:12, flyer:false },
    flyer:  { img:"spider",   w:82,h:72, hp:60,  sp:1.5,  dmg:10, flyer:true  },
    boss:   { img:"boss",     w:190,h:180,hp:900, sp:0.85, dmg:18, flyer:false, boss:true },
  };
  return T[type];
}

// NEW: pick random enemy type from waveProfile (weighted)
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

    nextAtk: performance.now() + rand(600, 1400),
    atkCD: rand(900, 1500),
    nextSound: performance.now() + rand(700, 1500),

    bob: rand(0, Math.PI*2),
  });
}

// NEW: director de spawn (evita quedarte sin enemigos)
function spawnDirector(){
  if(level >= 10) return; // boss level se maneja distinto
  if(killsThisLevel >= killGoal) return;

  // cuántos enemigos vivos quieres al mismo tiempo (sube con nivel)
  const aliveTarget = clamp(3 + Math.floor(level/2), 3, 10);

  // si hay muy pocos enemigos, spawnea
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

  // boss
  if(row.wave.boss){
    const T = enemyTemplate("boss");
    enemies.push({
      type:"boss", imgKey:"boss",
      x: WORLD_W - 980, y: groundY() - T.h, w:T.w, h:T.h,
      vx: -0.9, vy: 0,
      hp: T.hp, maxHp: T.hp,
      sp: T.sp, dmg: T.dmg,
      flyer:false, boss:true,
      nextAtk: performance.now()+900,
      atkCD: 600,
      nextSound: performance.now()+700,
      bob: 0
    });
    return;
  }

  // arranque: spawnea pocos y luego el director mantiene
  const aliveTarget = clamp(3 + Math.floor(lvl/2), 3, 10);
  for(let i=0;i<aliveTarget;i++){
    spawnEnemy(pickEnemyTypeFromProfile(waveProfile));
  }
}

function spawnDrop(x,y){
  const r = Math.random();
  if(r < 0.45){
    drops.push({kind:"ammo", x, y, w:26, h:20});
  } else if(r < 0.80){
    drops.push({kind:"med", x, y, w:22, h:22});
  } else {
    drops.push({kind:"kit", x, y, w:22, h:22});
  }
}

// ===================== AIM / CURSOR =====================
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

// ===================== SHOOT / RELOAD / HEAL =====================
let lastShot = 0;

function shoot(){
  if(paused || gameOver) return;

  const t = performance.now();
  if(t - lastShot < 115) return;

  if(ammo.mag <= 0){
    beep({f:220,d:0.05,type:"sine",g:0.08});
    return;
  }

  lastShot = t;
  ammo.mag--;
  SFX.shoot();

  updateAim();

  const sx = player.x + player.w*0.55;
  const sy = player.y + player.h*0.40;

  fx.push({
    kind: "muzzle",
    x: sx + player.aim.ax * 18,
    y: sy + player.aim.ay * 18,
    life: 10
  });

  const speed = 13.8;
  bullets.push({
    x: sx,
    y: sy,
    vx: player.aim.ax * speed,
    vy: player.aim.ay * speed,
    r: 3,
    life: 90,
    dmg: 22 + Math.floor(level*1.1),
  });
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
  const amount = 28;
  player.hp = clamp(player.hp + amount, 0, player.maxHp);
  SFX.heal();

  fx.push({kind:"heal", x: player.x + player.w/2, y: player.y + 10, life: 26});
}

// ===================== BLOOD / IMPACT FX (NEW) =====================
function spawnBlood(x,y,amount=10){
  for(let i=0;i<amount;i++){
    fx.push({
      kind:"blood",
      x, y,
      vx: rand(-2.6, 2.6),
      vy: rand(-3.6, -0.8),
      r: rand(1.5, 3.4),
      life: Math.floor(rand(20, 42)),
    });
  }
}
function spawnImpact(x,y){
  fx.push({kind:"hit", x, y, life: 16});
  for(let i=0;i<6;i++){
    fx.push({
      kind:"spark",
      x, y,
      vx: rand(-3.5, 3.5),
      vy: rand(-3.2, 1.0),
      life: Math.floor(rand(10, 18)),
    });
  }
}

// ===================== ENEMY ATTACKS =====================
function enemyAttack(e){
  const t = performance.now();

  if(t > e.nextSound){
    if(e.boss) SFX.boss();
    else SFX.zombie();
    e.nextSound = t + rand(900, 1700);
  }

  const dx = (player.x + player.w*0.5) - (e.x + e.w*0.5);
  const dy = (player.y + player.h*0.5) - (e.y + e.h*0.5);
  const dist = Math.hypot(dx,dy);

  if(e.type === "basic"){
    if(dist < 62){
      damagePlayer(e.dmg);
      spawnImpact(player.x+player.w/2, player.y+player.h*0.5);
      spawnBlood(player.x+player.w/2, player.y+player.h*0.55, 6);
      e.nextAtk = t + 850;
    } else e.nextAtk = t + 400;
    return;
  }

  if(e.type === "spitter"){
    if(dist < 780){
      const v = norm(dx, dy);
      enemyBullets.push({
        kind:"spit",
        x: e.x + e.w*0.55,
        y: e.y + e.h*0.45,
        vx: v.x * 6.6,
        vy: v.y * 6.6,
        r: 6,
        life: 140,
        dmg: 10 + Math.floor(level*0.6),
      });
      SFX.spit();
      e.nextAtk = t + 1100;
    } else e.nextAtk = t + 500;
    return;
  }

  if(e.type === "tongue"){
    if(dist < 320){
      const v = norm(dx, dy);
      enemyBullets.push({
        kind:"tongue",
        x: e.x + e.w*0.55,
        y: e.y + e.h*0.45,
        vx: v.x * 10.2,
        vy: v.y * 10.2,
        r: 4,
        life: 26,
        dmg: 14 + Math.floor(level*0.7),
      });
      SFX.web();
      e.nextAtk = t + 1050;
    } else e.nextAtk = t + 520;
    return;
  }

  if(e.type === "dog"){
    if(dist < 520){
      const dir = dx>=0 ? 1 : -1;
      e.vx = dir * 5.8;
      e.vy = -2.2;
      SFX.bark();
      e.nextAtk = t + 900;
    } else e.nextAtk = t + 500;
    return;
  }

  if(e.type === "spider"){
    if(dist < 560){
      const v = norm(dx, dy);
      e.vx = v.x * 4.2;
      e.vy = -8.6;
      SFX.web();
      e.nextAtk = t + 1200;
    } else e.nextAtk = t + 600;
    return;
  }

  if(e.type === "flyer"){
    if(dist < 860){
      const v = norm(dx, dy);
      enemyBullets.push({
        kind:"spit",
        x: e.x + e.w*0.55,
        y: e.y + e.h*0.55,
        vx: v.x * 6.9,
        vy: v.y * 6.9,
        r: 6,
        life: 160,
        dmg: 10 + Math.floor(level*0.7),
      });
      SFX.spit();
      e.nextAtk = t + 950;
    } else e.nextAtk = t + 480;
    return;
  }

  if(e.type === "boss"){
    if(dist < 1200){
      const v = norm(dx, dy);
      enemyBullets.push({
        kind:"cannon",
        x: e.x + e.w*0.25,
        y: e.y + e.h*0.55,
        vx: v.x * 7.2,
        vy: v.y * 7.2,
        r: 10,
        life: 170,
        dmg: 18,
      });
      SFX.boss();
    }

    if(Math.random() < 0.30 && enemies.length < 18){
      spawnEnemy("basic");
      spawnEnemy("spitter");
    }
    e.nextAtk = t + 650;
  }
}

// ===================== DAMAGE =====================
function damagePlayer(dmg){
  if(player.inv>0) return;
  player.hp -= dmg;
  player.inv = 18;
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
  SFX.hit();

  // NEW impact + blood
  spawnImpact(hitX, hitY);
  spawnBlood(hitX, hitY, e.boss ? 18 : 10);

  if(e.hp <= 0){
    e.hp = 0;
    killsThisLevel++;
    score += e.boss ? 1400 : 140;
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
  return Math.abs(player.y - gy) < 0.001 && Math.abs(player.vy) < 0.001;
}

function applyCrouch(){
  // ✅ S = agacharse solo en el piso
  const wantCrouch = (keys.has("s") || keys.has("arrowdown")) && isGrounded();
  if(wantCrouch === player.isCrouch) return;

  player.isCrouch = wantCrouch;
  const oldH = player.h;
  player.h = wantCrouch ? player.crouchH : player.baseH;

  // mantener pies en piso cuando cambia altura
  const gyNew = groundY() - player.h;
  player.y = gyNew;

  // compensar si cambiaste en el aire (por seguridad)
  if(!isGrounded()){
    player.y += (oldH - player.h);
  }
}

function stepPlayer(){
  const left  = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");

  // crouch primero
  applyCrouch();

  // movimiento horizontal (crouch más lento)
  let ax = 0;
  if(left) ax -= 1;
  if(right) ax += 1;

  const spMul = player.isCrouch ? 0.55 : 1.0;

  player.vx += ax * 0.75 * spMul;
  player.vx *= 0.82;
  player.vx = clamp(player.vx, -player.speed*spMul, player.speed*spMul);

  // ✅ salto
  if(jumpQueued){
    jumpQueued = false;
    if(isGrounded() && !player.isCrouch){
      player.vy = -13.2;
      SFX.step();
    }
  }

  // gravedad
  player.vy += GRAV;
  player.vy = clamp(player.vy, -14, MAX_FALL);

  player.x += player.vx;
  player.y += player.vy;

  // límites mundo
  player.x = clamp(player.x, 0, WORLD_W - player.w);

  // piso
  const gy = groundY() - player.h;
  if(player.y > gy){
    player.y = gy;
    player.vy = 0;
  }

  // anim timer
  const moving = Math.abs(player.vx) > 0.35;
  if(moving && isGrounded() && !player.isCrouch){
    player.animT += 1;
  } else {
    player.animT = 0;
  }

  if(player.inv>0) player.inv--;
}

function stepEnemies(){
  const t = performance.now();
  for(const e of enemies){
    if(e.dead) continue;

    e.bob += 0.10;

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

    // contacto
    if(!e.flyer && aabb(player, e)){
      damagePlayer(e.dmg);
      spawnBlood(player.x+player.w/2, player.y+player.h*0.6, 5);
    }

    if(t > e.nextAtk){
      enemyAttack(e);
    }
  }

  enemies = enemies.filter(e=>!e.dead);
}

function stepBullets(){
  // player bullets
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

  // enemy bullets
  for(const b of enemyBullets){
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    if(b.kind==="spit") b.vy += 0.02;

    if(b.x > player.x && b.x < player.x+player.w && b.y > player.y && b.y < player.y+player.h){
      damagePlayer(b.dmg);
      spawnImpact(b.x, b.y);
      spawnBlood(b.x, b.y, 6);
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

    // NEW particles move
    if(p.kind==="blood" || p.kind==="spark"){
      p.x += p.vx;
      p.y += p.vy;
      p.vy += (p.kind==="blood" ? 0.22 : 0.18);
      // rebotito suelo
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
  const target = clamp(player.x - W()*0.40, 0, WORLD_W - W());
  cameraVx += (target - cameraX) * 0.08;
  cameraVx *= 0.72;
  cameraX += cameraVx;
  cameraX = clamp(cameraX, 0, WORLD_W - W());
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
  if(level < 10){
    exitDoor.active = (killsThisLevel >= killGoal);
  } else {
    exitDoor.active = (enemies.length === 0);
  }

  if(!exitDoor.active) return;

  const near = aabb(player, exitDoor);

  if(near && interactPressed){
    interactPressed = false;
    SFX.door();

    if(level < MAX_LEVELS){
      level++;
      setupLevel(level);
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
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,"#0b1220");
    g.addColorStop(1,"#050713");
    ctx.fillStyle=g;
    ctx.fillRect(0,0,w,h);
  }

  ctx.fillStyle="rgba(0,0,0,0.25)";
  ctx.fillRect(0, groundY(), w, FLOOR_H);
}

function drawPlayer(){
  const x = Math.round(player.x - cameraX);
  const y = Math.round(player.y);

  // elegir sprite según estado
  let img = GFX.idle;

  const moving = Math.abs(player.vx) > 0.35;
  const grounded = isGrounded();

  if(player.isCrouch){
    img = GFX.idle || null;
  } else if(!grounded){
    img = GFX.idle || null;
  } else if(moving){
    const frames = [GFX.run1, GFX.run2, GFX.run3].filter(Boolean);
    if(frames.length){
      const idx = Math.floor(player.animT / 6) % frames.length; // velocidad anim
      img = frames[idx];
    }
  }

  // dibujar con flip izquierda/derecha
  if(img){
    ctx.save();
    if(player.facing === -1){
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

  // barra vida arriba del player
  drawHealthBar(x, y-10, player.w, 6, player.hp, player.maxHp, true);

  drawCrosshair();
}

function drawEnemies(){
  for(const e of enemies){
    const img = GFX[e.imgKey];
    const x = Math.round(e.x - cameraX);
    const y = Math.round(e.y + (e.flyer ? Math.sin(e.bob)*2 : 0));

    if(img){
      ctx.drawImage(img, x, y, e.w, e.h);
    } else {
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(x,y,e.w,e.h);
    }

    drawHealthBar(x, y-10, e.w, 6, e.hp, e.maxHp, false);

    if(e.boss){
      ctx.fillStyle="rgba(255,255,255,0.92)";
      ctx.font="bold 14px Arial";
      ctx.fillText("JEFE", x+10, y-18);
    }
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

function drawDrops(){
  for(const d of drops){
    const x = d.x - cameraX;
    ctx.fillStyle = d.kind==="ammo" ? "rgba(56,189,248,0.95)"
                : d.kind==="med"  ? "rgba(251,113,133,0.95)"
                : "rgba(250,204,21,0.95)";
    ctx.fillRect(x, d.y, d.w, d.h);
    ctx.strokeStyle="rgba(0,0,0,0.35)";
    ctx.strokeRect(x, d.y, d.w, d.h);
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

        const size = 52;
        ctx.save();
        ctx.translate(x, y);
        const ang = Math.atan2(player.aim.ay, player.aim.ax);
        ctx.rotate(ang);
        ctx.drawImage(img, idx * fw, 0, fw, fh, -size/2, -size/2, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle="rgba(250,204,21,0.85)";
        ctx.beginPath(); ctx.arc(x,y,10,0,Math.PI*2); ctx.fill();
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
      const a = clamp(p.life/42,0,1);
      ctx.fillStyle = `rgba(220,38,38,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI*2);
      ctx.fill();
      continue;
    }

    if(p.kind==="heal"){
      const a = clamp(p.life/26,0,1);
      ctx.fillStyle = `rgba(34,197,94,${a})`;
      ctx.beginPath(); ctx.arc(x,y,16*(1.1-a),0,Math.PI*2); ctx.fill();
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

  const near = aabb(player, exitDoor);

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
    if(near){
      ctx.fillStyle="rgba(250,204,21,0.95)";
      ctx.font="bold 12px Arial";
      ctx.fillText("Presiona E", x+16, y+64);
    }
  }
}

// ✅ HUD estilo Metal Slug + contador objetivo
function drawHUD(){
  const w=W();

  // panel superior izq
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.40)";
  ctx.fillRect(12, 12, 460, 96);
  ctx.strokeStyle="rgba(255,255,255,0.10)";
  ctx.strokeRect(12, 12, 460, 96);

  ctx.fillStyle="rgba(255,255,255,0.92)";
  ctx.font="bold 14px Arial";
  ctx.fillText(`Nivel: ${level}/10`, 24, 34);

  ctx.font="13px Arial";
  ctx.fillText(`Objetivo (kills): ${killsThisLevel}/${killGoal===999?"BOSS":killGoal}`, 24, 54);
  ctx.fillText(`Munición: ${ammo.mag}/${ammo.maxMag}  |  Reserva: ${ammo.reserve}`, 24, 74);
  ctx.fillText(`Medkits: ${medkits}`, 330, 74);

  // barra HP pro
  drawHealthBar(24, 84, 430, 10, player.hp, player.maxHp, true);
  ctx.restore();

  // minimapa
  drawMiniMap(w - 220, 12, 200, 64);
}

function drawMiniMap(x,y,w,h){
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.45)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle="rgba(255,255,255,0.12)";
  ctx.strokeRect(x, y, w, h);

  const scale = w / WORLD_W;

  // door
  ctx.fillStyle = exitDoor.active ? "rgba(34,197,94,0.95)" : "rgba(255,255,255,0.35)";
  ctx.fillRect(x + exitDoor.x * scale, y + h - 10, 4, 8);

  // enemies
  ctx.fillStyle="rgba(239,68,68,0.95)";
  for(const e of enemies){
    const ex = x + e.x * scale;
    const ey = y + h - (e.flyer ? 24 : 10);
    ctx.fillRect(ex, ey, 3, 3);
  }

  // player
  ctx.fillStyle="rgba(250,204,21,0.95)";
  ctx.fillRect(x + player.x * scale, y + h - 12, 4, 6);

  ctx.restore();
}

function drawCrosshair(){
  const x = mouse.x;
  const y = mouse.y;
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

function drawEnd(){
  const w=W(), h=H();
  ctx.fillStyle="rgba(0,0,0,0.78)";
  ctx.fillRect(0,0,w,h);

  const cardW = Math.min(900, w*0.92);
  const cardH = Math.min(460, h*0.70);
  const x=(w-cardW)/2, y=(h-cardH)/2;

  const g = ctx.createLinearGradient(x,y,x+cardW,y+cardH);
  g.addColorStop(0,"rgba(20,28,45,0.96)");
  g.addColorStop(1,"rgba(8,12,22,0.96)");
  ctx.fillStyle=g;
  ctx.fillRect(x,y,cardW,cardH);

  ctx.strokeStyle="rgba(255,255,255,0.18)";
  ctx.lineWidth=2;
  ctx.strokeRect(x,y,cardW,cardH);

  ctx.fillStyle="rgba(255,255,255,0.95)";
  ctx.textAlign="center";
  ctx.font="bold 34px Arial";
  ctx.fillText(victory ? "🏆 VICTORIA" : "☠ GAME OVER", w/2, y+56);

  ctx.font="18px Arial";
  ctx.textAlign="left";
  ctx.fillText(`Nivel alcanzado: ${level}/10`, x+34, y+120);
  ctx.fillText(`Score: ${score}`, x+34, y+152);
  ctx.fillText(`High Score: ${high}`, x+34, y+184);
  ctx.fillText(`Objetivo: ${killsThisLevel}/${killGoal===999?"BOSS":killGoal}`, x+34, y+216);

  ctx.textAlign="center";
  ctx.font="14px Arial";
  ctx.fillStyle="rgba(255,255,255,0.75)";
  ctx.fillText("Click para reiniciar • R reiniciar • P pausa • M mute", w/2, y+cardH-28);
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

  // ✅ NEW: mantiene enemigos hasta cumplir objetivo
  spawnDirector();

  updateCamera();
  updateExit();
  updateTopUI();

  if(score > high) updateHigh();
}

function render(){
  drawBackground();
  drawDoor();
  drawDrops();
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

// ===================== CONTROL =====================
function setupLevel(lvl){
  level = lvl;

  const baseMag = 18;
  ammo.maxMag = baseMag + Math.floor((lvl-1)/2)*2;
  ammo.mag = ammo.maxMag;
  ammo.reserve += 40;
  medkits = clamp(medkits + 1, 0, 6);
  player.hp = clamp(player.hp + 18, 0, player.maxHp);
  player.inv = 10;

  player.x = 120;
  player.h = player.baseH;
  player.isCrouch = false;
  player.y = groundY() - player.h;
  player.vx = 0;
  player.vy = 0;

  bullets.length = 0;
  enemyBullets.length = 0;
  drops.length = 0;
  fx.length = 0;

  spawnWave(lvl);
  setupExit();
  updateTopUI();
}

async function startGame(){
  initAudio();
  if(audioCtx && audioCtx.state==="suspended") await audioCtx.resume();
  if(!muted) startMusic();

  paused = false;

  if(overlay){
    overlay.classList.add("hidden");
    overlay.style.pointerEvents = "none";
  }

  canvas.focus();
}

function resetGame(){
  paused = true;
  gameOver = false;
  victory = false;

  score = 0;
  killsThisLevel = 0;

  ammo = { mag: 18, maxMag: 18, reserve: 120 };
  medkits = 2;

  player.hp = player.maxHp;
  player.inv = 0;
  player.x = 120;
  player.h = player.baseH;
  player.isCrouch = false;
  player.y = groundY() - player.h;

  cameraX = 0; cameraVx = 0;

  setupLevel(1);
  updateTopUI();

  if(overlay){
    overlay.classList.remove("hidden");
    overlay.style.pointerEvents = "auto";
  }
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

// click en pantalla final reinicia
canvas.addEventListener("click",()=>{
  if(gameOver){
    resetGame();
  }
});

// ===================== EVENTS =====================
if(btnStart) btnStart.addEventListener("click", startGame);
if(btnReset) btnReset.addEventListener("click", resetGame);
if(btnPause) btnPause.addEventListener("click", togglePause);
if(btnMute) btnMute.addEventListener("click", toggleMute);

if(volEl){
  volEl.addEventListener("input", ()=>{
    sfxVol = Number(volEl.value);
    if(sfxGain) sfxGain.gain.value = sfxVol;
  });
}

// ===================== BOOT =====================
(async function boot(){
  setText(uiHigh, high);
  if(btnMute) btnMute.textContent = muted ? "Activar sonido" : "Mute";

  await loadAll();

  resetGame();
  loop();
})();