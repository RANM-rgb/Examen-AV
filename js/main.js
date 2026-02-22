// ===================== FIX + GAME BOOT =====================
// Pega este archivo como: js/main.js

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;
const randi = (a, b) => Math.floor(rand(a, b + 1));
const now = () => performance.now();

// ---------- Canvas ----------
const canvas = $("canvas");
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

// ---------- UI ----------
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

function setText(el, v) { if (el) el.textContent = String(v); }

// ---------- Storage ----------
const HS_KEY = "resident_slug_highscore_v1";
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
}, { passive: false });

document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});

canvas.addEventListener("mousedown", (e) => {
  mouse.down = true;
  // Si está pausado, un click puede iniciar también
  if (paused && !gameOver) startGame();
  if (e.button === 0) {
    knifeClick();
    shoot();
  }
});
canvas.addEventListener("mouseup", () => (mouse.down = false));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------- Audio (simple) ----------
let audioCtx = null, sfxGain = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sfxGain = audioCtx.createGain();
  sfxGain.connect(audioCtx.destination);
  sfxGain.gain.value = 0.85;
}
function setSfxVol(v) { if (sfxGain) sfxGain.gain.value = clamp(v, 0, 1.2); }

function beep(f = 600, d = 0.06, type = "square", g = 0.18) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const gg = audioCtx.createGain();
  const t0 = audioCtx.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  gg.gain.setValueAtTime(0.0001, t0);
  gg.gain.exponentialRampToValueAtTime(g, t0 + 0.01);
  gg.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(gg);
  gg.connect(sfxGain);
  o.start(t0);
  o.stop(t0 + d);
}

const SFX = {
  shoot() { beep(980, 0.05, "square", 0.22); },
  hit() { beep(160, 0.08, "sawtooth", 0.22); },
  pickup() { beep(620, 0.10, "triangle", 0.22); },
  reload() { beep(260, 0.10, "sine", 0.22); },
  level() { beep(440, 0.10, "sine", 0.2); beep(660, 0.10, "sine", 0.2); },
};

// ---------- Assets ----------
const ASSET_LIST = {
  bg: ["img/Fondo.png", "Fondo.png"],
  player: ["img/player.png", "player.png"],
  muzzle: ["img/Balas.png", "Balas.png"],

  z_basic: ["img/zombie.png", "zombie.png"],
  z_green: ["img/zombie verde.png", "zombie verde.png"],
  z_white: ["img/zombie blanco.png", "zombie blanco.png"],
  dog: ["img/perro.png", "perro.png"],
  spider: ["img/zombie araña.png", "zombie araña.png"],
  boss: ["img/jefe final.png", "jefe final.png"],
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
const WORLD = { baseLen: 2400, extraPerLevel: 380, gravity: 0.85, maxFall: 18 };
const PLAYER_CFG = { speed: 4.2, jump: -14.2, friction: 0.82, airFriction: 0.94, maxHP: 100 };

const WEAPONS = {
  pistol:  { name: "PISTOL",  dmg: 16, rate: 140, spread: 0.02, bulletSpeed: 12.5 },
  rifle:   { name: "RIFLE",   dmg: 12, rate: 85,  spread: 0.03, bulletSpeed: 14.0 },
  shotgun: { name: "SHOTGUN", dmg: 9,  rate: 220, spread: 0.20, bulletSpeed: 12.0, pellets: 6 },
};

const ENEMY_TYPES = {
  basic:  { key: "z_basic",  hp: 42,  spd: 1.05, score: 80,  attack: "melee" },
  green:  { key: "z_green",  hp: 52,  spd: 0.85, score: 120, attack: "vomit" },
  white:  { key: "z_white",  hp: 58,  spd: 0.75, score: 150, attack: "tongue" },
  dog:    { key: "dog",      hp: 34,  spd: 2.35, score: 130, attack: "dash" },
  spider: { key: "spider",   hp: 46,  spd: 1.55, score: 160, attack: "jumpSpit" },
  boss:   { key: "boss",     hp: 900, spd: 0.85, score: 1200, attack: "cannon" },
};

function groundY() { return canvas.clientHeight - 92; }

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
  x: 180, y: 0, w: 48, h: 64,
  vx: 0, vy: 0,
  hp: PLAYER_CFG.maxHP,
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
let enemyShots = [];
let pickups = [];
let fx = [];

let exitDoor = { x: 0, y: 0, w: 90, h: 140, active: false };

let toastMsg = "";
let toastUntil = 0;
function toast(t) { toastMsg = t; toastUntil = now() + 1100; }

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

// ---------- Level logic ----------
function levelParams(lvl) {
  const base = Number(diffEl?.value || "1");
  const mult = clamp(base, 1, 1.6);
  const goal = Math.min(30, 8 + lvl * 2);
  const count = Math.min(26, 6 + lvl * 2);
  const pool = ["basic"];
  if (lvl >= 2) pool.push("dog");
  if (lvl >= 3) pool.push("green");
  if (lvl >= 5) pool.push("spider");
  if (lvl >= 7) pool.push("white");
  return { mult, goal, count, pool };
}

function spawnEnemy(type, x) {
  const T = ENEMY_TYPES[type];
  const img = GFX[T.key];
  const scale = (type === "boss") ? 0.90 : 0.65;
  const w = img ? Math.floor(img.width * scale) : 48;
  const h = img ? Math.floor(img.height * scale) : 64;

  enemies.push({
    type, x,
    y: groundY() - h,
    w, h,
    vx: 0, vy: 0,
    hp: Math.floor(T.hp * (1 + (level - 1) * 0.10)),
    maxHp: Math.floor(T.hp * (1 + (level - 1) * 0.10)),
    nextAtk: now() + rand(600, 1300),
    facing: -1,
    extra: { spitCD: 0, dashCD: 0, jumpCD: 0 }
  });
}

function setupLevel(lvl) {
  const W = canvas.clientWidth;
  const p = levelParams(lvl);

  killGoal = (lvl === 10) ? 1 : p.goal;
  killsThisLevel = 0;

  worldLen = WORLD.baseLen + WORLD.extraPerLevel * (lvl - 1);

  enemies = [];
  bullets = [];
  enemyShots = [];
  fx = [];
  pickups = [];

  exitDoor = { x: worldLen - 170, y: groundY() - 140, w: 90, h: 140, active: false };

  player.x = 160;
  player.y = groundY() - player.h;
  player.vx = 0;
  player.vy = 0;
  player.inv = 0;

  // refill suave
  player.hp = clamp(player.hp + 18, 0, PLAYER_CFG.maxHP);
  player.ammoRes += 40 + lvl * 4;
  if (lvl % 3 === 0) player.medkits += 1;

  player.magMax = 24 + Math.floor((lvl - 1) / 2) * 3;
  player.ammoMag = clamp(player.ammoMag, 0, player.magMax);

  if (lvl < 10) {
    for (let i = 0; i < p.count; i++) {
      const t = p.pool[randi(0, p.pool.length - 1)];
      spawnEnemy(t, rand(520, worldLen - 520));
    }
  } else {
    spawnEnemy("boss", worldLen - 520);
    toast("¡JEFE FINAL!");
  }

  cameraX = clamp(player.x - W * 0.35, 0, worldLen - W);

  SFX.level();
  toast(`Nivel ${lvl}: elimina ${killGoal} objetivo(s)`);
  updateHUD();
}

// ---------- Combat ----------
function aabb(A, B) {
  return !(A.x + A.w <= B.x || A.x >= B.x + B.w || A.y + A.h <= B.y || A.y >= B.y + B.h);
}
function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

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
  if (player.hp >= PLAYER_CFG.maxHP) return toast("HP al máximo");
  player.medkits--;
  player.hp = clamp(player.hp + 40, 0, PLAYER_CFG.maxHP);
  toast("+HP (botiquín)");
  SFX.pickup();
}

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

function knifeClick() {
  if (paused || gameOver) return;
  const wx = mouse.x + cameraX;
  const wy = mouse.y;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (pointInRect(wx, wy, e)) {
      e.hp -= (e.type === "boss" ? 25 : 60);
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
  SFX.shoot();

  const sx = player.x + (player.facing > 0 ? player.w * 0.70 : player.w * 0.30);
  const sy = player.y + player.h * 0.45;

  const mk = (ax, ay, dmg) => ({ x: sx, y: sy, w: 14, h: 6, vx: ax * WPN.bulletSpeed, vy: ay * WPN.bulletSpeed, dmg, life: 75 });

  if (player.weapon === "shotgun") {
    for (let i = 0; i < WEAPONS.shotgun.pellets; i++) {
      const a = aim.angle + rand(-WPN.spread, WPN.spread);
      bullets.push(mk(Math.cos(a), Math.sin(a), WPN.dmg));
    }
  } else {
    const a = aim.angle + rand(-WPN.spread, WPN.spread);
    bullets.push(mk(Math.cos(a), Math.sin(a), WPN.dmg));
  }
}

// ---------- Update ----------
function enemyMelee(e, dmg) {
  if (player.inv > 0) return;
  if (aabb(player, e)) {
    player.hp -= dmg;
    player.inv = 22;
    player.vx += (player.x < e.x ? -5 : 5);
    player.vy = -7;
    fx.push({ kind: "hit", x: player.x + player.w / 2, y: player.y + 10, life: 18 });
    SFX.hit();
  }
}

function updatePlayer() {
  player.onGround = false;
  updateAim();

  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const jump = keys.has("w") || keys.has("arrowup");

  if (keys.has("r")) reload();

  if (left) player.vx -= PLAYER_CFG.speed * 0.55;
  if (right) player.vx += PLAYER_CFG.speed * 0.55;

  const fr = player.onGround ? PLAYER_CFG.friction : PLAYER_CFG.airFriction;
  player.vx *= fr;

  player.vy += WORLD.gravity;
  player.vy = clamp(player.vy, -40, WORLD.maxFall);

  player.x += player.vx;
  player.y += player.vy;

  player.x = clamp(player.x, 20, worldLen - player.w - 20);

  const g = groundY();
  if (player.y + player.h >= g) {
    player.y = g - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  if (player.inv > 0) player.inv--;
}

function updateEnemies() {
  const t = now();
  const mult = levelParams(level).mult;

  for (const e of enemies) {
    if (e.hp <= 0) continue;

    const dx = (player.x + player.w / 2) - (e.x + e.w / 2);
    e.facing = dx >= 0 ? 1 : -1;

    const baseSpd = (ENEMY_TYPES[e.type].spd + (level - 1) * 0.03) * mult;
    e.vx = Math.sign(dx) * baseSpd;

    e.vy += WORLD.gravity * 0.85;
    e.vy = clamp(e.vy, -40, WORLD.maxFall);

    e.x += e.vx;
    e.y += e.vy;

    const g = groundY();
    if (e.y + e.h >= g) {
      e.y = g - e.h;
      e.vy = 0;
    }

    enemyMelee(e, 9 + level);
    if (t >= e.nextAtk) e.nextAtk = t + rand(600, 1200);
  }

  // muertes
  for (const e of enemies) {
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      killsThisLevel++;
      score += ENEMY_TYPES[e.type].score + level * 10;
      fx.push({ kind: "boom", x: e.x + e.w / 2, y: e.y + e.h / 2, life: 22 });
      SFX.hit();
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
        score += 8;
        fx.push({ kind: "hit", x: b.x, y: b.y, life: 14 });
        SFX.hit();
        b.life = 0;
        break;
      }
    }
  }
  bullets = bullets.filter(b => b.life > 0);
}

function updateExit() {
  exitDoor.active = (level < 10) ? (killsThisLevel >= killGoal) : (enemies.length === 0);
  if (exitDoor.active && aabb(player, exitDoor)) {
    if (level < MAX_LEVELS) {
      level++;
      setupLevel(level);
    } else {
      victory = true;
      gameOver = true;
    }
  }
}

function updateCamera() {
  const W = canvas.clientWidth;
  const target = clamp(player.x - W * 0.35, 0, worldLen - W);
  cameraX += (target - cameraX) * 0.10;
  cameraX = clamp(cameraX, 0, Math.max(0, worldLen - W));
}

// ---------- Render ----------
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
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, g, W, canvas.clientHeight - g);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(0, g, W, 2);
}

function drawExitDoor() {
  const x = exitDoor.x - cameraX;
  const y = exitDoor.y;
  ctx.fillStyle = exitDoor.active ? "rgba(34,197,94,0.20)" : "rgba(255,255,255,0.06)";
  ctx.fillRect(x, y, exitDoor.w, exitDoor.h);
  ctx.strokeStyle = exitDoor.active ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, exitDoor.w, exitDoor.h);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 14px Arial";
  ctx.fillText(exitDoor.active ? "EXIT" : "LOCK", x + 18, y + 24);
}

function drawPlayer() {
  const x = player.x - cameraX;
  const y = player.y;
  drawSprite(GFX.player, x, y, player.w, player.h, player.facing < 0);

  // mini HUD inferior dentro del canvas
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(14, canvas.clientHeight - 82, 340, 62);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(14, canvas.clientHeight - 82, 340, 62);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "14px Arial";
  ctx.fillText(`HP: ${Math.max(0, Math.round(player.hp))} | Med: ${player.medkits} (F)`, 26, canvas.clientHeight - 56);
  ctx.fillText(`Ammo: ${player.ammoMag}/${player.magMax} Res: ${player.ammoRes} (R)`, 26, canvas.clientHeight - 34);
}

function drawEnemies() {
  for (const e of enemies) {
    const img = GFX[ENEMY_TYPES[e.type].key];
    const x = e.x - cameraX;
    const y = e.y;
    drawSprite(img, x, y, e.w, e.h, e.facing < 0);
  }
}

function drawBullets() {
  for (const b of bullets) {
    const x = b.x - cameraX;
    const y = b.y;
    ctx.fillStyle = "rgba(56,189,248,0.95)";
    ctx.fillRect(x, y, b.w, b.h);
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
      const a = clamp(p.life / 22, 0, 1);
      ctx.fillStyle = `rgba(250,204,21,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 16 * (1.2 - a), 0, Math.PI * 2);
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

function drawTopHUD() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(canvas.clientWidth - 260, 12, 248, 74);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(canvas.clientWidth - 260, 12, 248, 74);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "14px Arial";
  ctx.fillText(`Nivel ${level}/10 | Score ${Math.floor(score)}`, canvas.clientWidth - 244, 36);
  ctx.fillText(`Kills: ${killsThisLevel}/${killGoal}`, canvas.clientWidth - 244, 58);
  if (toastUntil > now()) {
    ctx.fillStyle = "rgba(56,189,248,0.95)";
    ctx.fillText(toastMsg, canvas.clientWidth - 244, 80);
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
  ctx.fillText(victory ? "🏆 VICTORIA" : "☠ GAME OVER", W / 2, H / 2 - 20);
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fillText("Presiona R para reiniciar", W / 2, H / 2 + 20);
  ctx.textAlign = "left";
}

// ---------- Loop ----------
let lastT = now();

function step() {
  if (paused) return;

  const t = now();
  elapsed = t - startTime;

  updatePlayer();
  updateEnemies();
  updateBullets();
  updateExit();
  updateCamera();

  if (score > highScore) {
    highScore = score;
    saveHighScore(highScore);
  }

  if (player.hp <= 0 && !gameOver) {
    gameOver = true;
    victory = false;
    toast("GAME OVER");
  }

  updateHUD();
  lastT = t;
}

function render() {
  drawBG();
  drawGround();
  drawExitDoor();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawFX();
  drawTopHUD();
  drawCrosshair();
  if (gameOver) drawGameOver();
}

function loop() {
  requestAnimationFrame(loop);
  step();
  render();
}

// ---------- Controls (FIX START) ----------
function startGame() {
  // ✅ FIX: inicializa audio en interacción del usuario
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

  // ✅ FIX: asegura que el overlay se oculte de verdad
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.style.display = "none"; // <<<<< MUY IMPORTANTE
    overlay.style.pointerEvents = "none";
  }

  // ✅ para que WASD funcione aunque no hayas clickeado el canvas
  canvas.tabIndex = 0;
  canvas.focus();

  paused = false;
  gameOver = false;
  victory = false;
  startTime = now();

  toast("Iniciado ✅  WASD mover | Click/Space disparar | R recargar | F botiquín");
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
    } else {
      overlay.classList.add("hidden");
      overlay.style.display = "none";
      overlay.style.pointerEvents = "none";
    }
  }
}

function restartGame() {
  paused = true;
  gameOver = false;
  victory = false;
  score = 0;
  level = 1;

  player.hp = PLAYER_CFG.maxHP;
  player.weapon = "rifle";
  player.ammoRes = 180;
  player.magMax = 24;
  player.ammoMag = 24;
  player.medkits = 2;
  player.reloadUntil = 0;
  player.lastShot = 0;

  setupLevel(level);

  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
  }
  if (btnPause) btnPause.textContent = "Pausar";
  toast("Listo. Dale Iniciar");
  updateHUD();
}

// ---------- Boot ----------
(async function boot() {
  // Logs para detectar rápido el problema
  console.log("[BOOT] btnStart:", !!btnStart, "overlay:", !!overlay, "canvas:", !!canvas);

  // bind botones
  if (btnStart) btnStart.addEventListener("click", startGame);
  if (btnPause) btnPause.addEventListener("click", togglePause);
  if (btnRestart) btnRestart.addEventListener("click", restartGame);

  // volumen
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

  // deja overlay visible al inicio
  if (overlay) {
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
  }

  loop();
})();