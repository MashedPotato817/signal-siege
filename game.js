// game.js —— 信号争夺：游戏逻辑（纯前端，浏览器本地运行）
'use strict';

const WORLD = { width: 2400, height: 1400 };
// 属性上限（升级/强化不会超过；留足余地，避免过早封顶降低乐趣）
const CAPS = { fireRate: .35, speed: 410, damage: 80, maxHp: 400, pickup: 200, bulletSpeed: 1500, resist: .48, lives: 5 };
const UPGRADE_POOL = [
  ['rapid', '极速脉冲', '射击间隔 -22%'], ['swift', '相位推进', '移动速度 +18%'],
  ['heavy', '过载弹头', '每发伤害 +7'], ['vital', '强韧核心', '最大生命 +30，立即回复'],
  ['magnet', '能量磁场', '核心拾取范围 +14'], ['velocity', '高速弹体', '子弹速度 +100'],
  ['shield', '偏转护盾', '受到伤害 -12%'], ['restore', '应急维修', '回复 45 生命'],
  ['life', '备用生命', '多给一条命'],
];

const game = {
  phase: 'lobby', time: 0, wave: 0, score: 0, player: null, lives: 3, paused: false,
  bots: [], cores: [], bullets: [], effects: [], options: [], items: [],
  last: Date.now(),
  input: { x: 0, y: 0, aimX: 1, aimY: 0, shoot: false, sprint: false },
};

function createActor(kind, x, y, type='scout') { return { kind, type, x, y, hp: kind === 'player' ? 100 : 55, maxHp: kind === 'player' ? 100 : 55, speed: kind === 'player' ? 215 : 145, damage: kind === 'player' ? 18 : 8, fireRate: kind === 'player' ? 1 : 1.5, bulletSpeed: 620, pickup: 36, resist: 0, aimX: 1, aimY: 0, cooldown: 0, touchCooldown: 0, respawn: 0, invuln: 0, stamina: 100, maxStamina: 100, xp: 0, level: 1, buffs: { fury: 0, overclock: 0, snipe: 0 }, brain: {} }; }
function startGame() {
  game.phase = 'playing'; game.wave = 0; game.score = 0; game.bullets = []; game.effects = []; game.options = [];
  game.items = [];
  game.lives = 3; game.time = 0; game.paused = false; // 无尽生存：正计时，3 条命
  game.player = createActor('player', WORLD.width / 2, WORLD.height / 2);
  game.cores = Array.from({ length: 8 }, () => spawnCore());
  startWave();
}
const BOSS_TYPES = ['boss', 'fireboss', 'tankboss'];
function startWave() {
  game.wave++;
  const boss = game.wave % 3 === 0;
  if (boss) {
    // 首领 + 周围区域跟随的小怪（Boss 战）
    const bossBot = makeEnemy(BOSS_TYPES[Math.floor(game.wave / 3) % BOSS_TYPES.length], 0);
    const escort = Math.max(2, Math.floor(game.wave / 3)); // 波 3:2、6:2、9:3…
    game.bots = [bossBot];
    for (let i = 0; i < escort; i++) game.bots.push(makeEnemy(Math.random() < .6 ? 'scout' : 'shooter', i + 1, bossBot));
  } else {
    const count = 2 + Math.min(4, game.wave);
    game.bots = Array.from({ length: count }, () => { const r = Math.random(); return r < .5 ? 'scout' : r < .82 ? 'shooter' : 'brute'; }).map((type, i) => makeEnemy(type, i));
  }
  effect(boss ? `第 ${game.wave} 波 · 首领来袭` : `第 ${game.wave} 波开始`, game.player.x, game.player.y - 70, boss ? '#ffca68' : '#bcecff');
}
function makeEnemy(type, index, near) { const big = type === 'boss' || type === 'fireboss' || type === 'tankboss'; const angle=(Math.PI*2*index + Math.random()) / Math.max(1, big ? 1 : 3); const ox = near ? near.x : game.player.x, oy = near ? near.y : game.player.y; const rx = near ? 130 + Math.random() * 150 : big ? 560 : 430 + Math.random() * 260; const ry = near ? 110 + Math.random() * 140 : big ? 400 : 300 + Math.random() * 220; const x=clamp(ox + Math.cos(angle)*rx,60,WORLD.width-60), y=clamp(oy + Math.sin(angle)*ry,60,WORLD.height-60); const bot=createActor('bot',x,y,type); if(type==='scout'){bot.hp=bot.maxHp=45;bot.speed=170;bot.damage=6;bot.fireRate=1.7;} if(type==='shooter'){bot.hp=bot.maxHp=62;bot.speed=118;bot.damage=10;bot.fireRate=1.35;bot.range=360;} if(type==='brute'){bot.hp=bot.maxHp=125;bot.speed=92;bot.damage=15;bot.fireRate=1.8;bot.range=230;} if(type==='boss'){bot.hp=bot.maxHp=360;bot.speed=88;bot.damage=17;bot.fireRate=1.1;bot.range=420;bot.boss=true;} if(type==='fireboss'){bot.hp=bot.maxHp=420;bot.speed=96;bot.damage=13;bot.fireRate=1.2;bot.range=400;bot.boss=true;bot.breath=1.4;} if(type==='tankboss'){bot.hp=bot.maxHp=820;bot.speed=46;bot.damage=30;bot.fireRate=3;bot.range=110;bot.boss=true;} if(!bot.boss){ const s=1+(game.wave-1)*.12; bot.hp=bot.maxHp=Math.round(bot.hp*s); bot.damage=Math.round(bot.damage*(1+(game.wave-1)*.1)); } return bot; }
function spawnCore() { return { x: 180 + Math.random() * (WORLD.width - 360), y: 160 + Math.random() * (WORLD.height - 320), live: true, timer: 0 }; }
const ITEM_TYPES = [
  ['medkit', '血包', '回复 45 生命', '#7dffb0'],
  ['fury', '怒火', '攻击力 +50%（8 秒，可突破上限）', '#ff9b6b'],
  ['overclock', '超频', '攻速 +60%（8 秒，可突破上限）', '#ffd97d'],
  ['snipe', '射程增幅', '子弹射程 +80%（8 秒，可突破上限）', '#8ecbff'],
];
function spawnItem(x, y) {
  const t = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  game.items.push({ type: t[0], title: t[1], text: t[2], color: t[3], x: x + Math.random() * 40 - 20, y: y + Math.random() * 40 - 20, life: 12, live: true });
}
function applyItem(p, it) {
  if (it.type === 'medkit') { p.hp = Math.min(p.maxHp, p.hp + 45); effect('+45 生命', p.x, p.y, it.color); }
  if (it.type === 'fury') { p.buffs.fury = 8; effect('攻击力 +50%', p.x, p.y, it.color); }
  if (it.type === 'overclock') { p.buffs.overclock = 8; effect('攻速 +60%', p.x, p.y, it.color); }
  if (it.type === 'snipe') { p.buffs.snipe = 8; effect('射程 +80%', p.x, p.y, it.color); }
}
function xpToNext(level) { return 3 + Math.floor((level - 1) * 1.5); }
function addXp(n) {
  const p = game.player;
  p.xp += n;
  let gained = false, need = xpToNext(p.level);
  while (p.xp >= need) { p.xp -= need; p.level++; gained = true; need = xpToNext(p.level); }
  if (gained) { game.phase = 'upgrade'; game.options = pickOptions(); }
}
function pickOptions() {
  const p = game.player;
  const capped = new Set();
  if (p.fireRate <= CAPS.fireRate + .001) capped.add('rapid');
  if (p.speed >= CAPS.speed - 1) capped.add('swift');
  if (p.damage >= CAPS.damage - 1) capped.add('heavy');
  if (p.maxHp >= CAPS.maxHp - 1) capped.add('vital');
  if (p.pickup >= CAPS.pickup - 1) capped.add('magnet');
  if (p.bulletSpeed >= CAPS.bulletSpeed - 1) capped.add('velocity');
  if (p.resist >= CAPS.resist - .01) capped.add('shield');
  if (game.lives >= CAPS.lives) capped.add('life');
  const pool = UPGRADE_POOL.filter(([id]) => !capped.has(id));
  const list = pool.length >= 3 ? pool : UPGRADE_POOL;
  return [...list].sort(() => Math.random() - .5).slice(0, 3).map(([id, title, text]) => ({ id, title, text }));
}
function applyUpgrade(p, id) {
  if (id === 'rapid') p.fireRate = Math.max(CAPS.fireRate, p.fireRate * .78);
  if (id === 'swift') p.speed = Math.min(CAPS.speed, p.speed * 1.18);
  if (id === 'heavy') p.damage = Math.min(CAPS.damage, p.damage + 7);
  if (id === 'vital') { p.maxHp = Math.min(CAPS.maxHp, p.maxHp + 30); p.hp = Math.min(p.maxHp, p.hp + 30); }
  if (id === 'magnet') p.pickup = Math.min(CAPS.pickup, p.pickup + 14);
  if (id === 'velocity') p.bulletSpeed = Math.min(CAPS.bulletSpeed, p.bulletSpeed + 100);
  if (id === 'shield') p.resist = Math.min(CAPS.resist, p.resist + .12);
  if (id === 'restore') p.hp = Math.min(p.maxHp, p.hp + 45);
  if (id === 'life') game.lives = Math.min(CAPS.lives, game.lives + 1);
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, Number(v) || 0)); }
function effect(text, x, y, color) { game.effects.push({ text, x, y, color, life: 1 }); }

function stepActor(actor, input, dt) {
  if (actor.respawn > 0) { actor.respawn -= dt; if (actor.respawn <= 0) { actor.hp = actor.maxHp; actor.invuln = 1.5; } return; }
  actor.invuln = Math.max(0, (actor.invuln || 0) - dt);
  const moving = Math.hypot(input.x, input.y) > .05; const sprint = actor.kind === 'player' && input.sprint && moving && actor.stamina > 0; actor.stamina = clamp(actor.stamina + (sprint ? -34 : 22) * dt, 0, actor.maxStamina); const move = Math.hypot(input.x, input.y) || 1, speed = actor.speed * (sprint ? 1.62 : 1); actor.x = clamp(actor.x + input.x / move * speed * dt, 35, WORLD.width - 35); actor.y = clamp(actor.y + input.y / move * speed * dt, 35, WORLD.height - 35);
  const aim = Math.hypot(input.aimX, input.aimY) || 1; actor.aimX = input.aimX / aim; actor.aimY = input.aimY / aim; actor.cooldown -= dt; actor.touchCooldown -= dt;
  if (input.shoot && actor.cooldown <= 0) { const bf = actor.buffs || {}; const dmg = Math.round(actor.damage * (bf.fury > 0 ? 1.5 : 1)); const life = .82 * (bf.snipe > 0 ? 1.8 : 1); const shots = (actor.type === 'boss' || actor.type === 'fireboss') ? [-.2, 0, .2] : [0]; shots.forEach(offset=>{const a=Math.atan2(actor.aimY,actor.aimX)+offset;game.bullets.push({ team: actor.kind, type:actor.type, x: actor.x + Math.cos(a) * 21, y: actor.y + Math.sin(a) * 21, dx: Math.cos(a) * actor.bulletSpeed, dy: Math.sin(a) * actor.bulletSpeed, damage: dmg, life }); }); actor.cooldown = .42 * actor.fireRate * (bf.overclock > 0 ? .625 : 1); }
}
function aiInput(bot, now, dt) {
  const b = bot.brain, p = game.player;
  if (!b.until || now > b.until) { const roll = Math.random(); b.mode = roll < .52 ? 'core' : roll < .88 ? 'wander' : 'duel'; b.until = now + 1500 + Math.random() * 2200; b.x = 180 + Math.random() * (WORLD.width - 360); b.y = 160 + Math.random() * (WORLD.height - 320); }
  const core = game.cores.filter(c => c.live).sort((a, z) => distance(bot, a) - distance(bot, z))[0]; const target = b.mode === 'core' && core ? core : b.mode === 'duel' ? p : { x: b.x, y: b.y };
  let x = target.x - bot.x, y = target.y - bot.y; const playerDistance=distance(bot,p); if ((bot.type==='shooter'||bot.type==='boss'||bot.type==='fireboss')&&b.mode==='duel'){const desired=(bot.type==='boss'||bot.type==='fireboss')?300:260;const direction=playerDistance<desired?-1:playerDistance>desired+70?1:0;x=(p.x-bot.x)*direction;y=(p.y-bot.y)*direction;} if (Math.hypot(x, y) < 55) { b.until = 0; x = y = 0; }
  b.vx = (b.vx || 0) * .84 + x * .16; b.vy = (b.vy || 0) * .84 + y * .16;
  const d = distance(bot, p); const range=bot.range || 240; if (d < range && Math.random() < (bot.boss ? .014 : .007) * dt * 30) b.shootUntil = now + 160 + Math.random() * 260;
  return { x: b.vx, y: b.vy, aimX: p.x - bot.x, aimY: p.y - bot.y, shoot: now < (b.shootUntil || 0) };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function tick() {
  const now = Date.now(), dt = Math.min(.05, (now - game.last) / 1000); game.last = now;
  if (game.paused) return; // 暂停：完全冻结
  if (game.phase === 'playing') {
    game.time += dt; // 正计时（无尽生存）
    stepActor(game.player, game.input, dt);
    game.bots.forEach(bot => { stepActor(bot, aiInput(bot, now, dt), dt); if (bot.type === 'fireboss') { bot.breath = (bot.breath || 1.4) - dt; if (bot.breath <= 0) { if (game.player.respawn <= 0) { const a = Math.atan2(game.player.y - bot.y, game.player.x - bot.x); for (let i = -2; i <= 2; i++) { const ang = a + i * .22; game.bullets.push({ team: 'bot', fire: true, x: bot.x + Math.cos(ang) * 30, y: bot.y + Math.sin(ang) * 30, dx: Math.cos(ang) * 280, dy: Math.sin(ang) * 280, damage: 10, life: .6 }); } effect('火焰喷射', bot.x, bot.y - 25, '#ff7a4d'); bot.breath = 2.6; } } } if (bot.touchCooldown<=0 && bot.type!=='shooter' && game.player.respawn<=0 && game.player.invuln<=0 && distance(bot,game.player)<(bot.boss?54:40)) { const hit=bot.type==='tankboss'?26:(bot.boss?18:bot.type==='brute'?13:7);game.player.hp-=hit;bot.touchCooldown=1;effect(`-${hit}`,game.player.x,game.player.y-25,'#ff8d8d'); } }); if(game.player.hp<=0 && game.player.respawn<=0){ if(game.lives>1){ game.lives--; game.player.hp=0; game.player.respawn=1.8; effect('失去一条命',game.player.x,game.player.y-25,'#ffd0a0'); } else { game.lives=0; game.player.hp=0; game.phase='finished'; effect('力竭',game.player.x,game.player.y,'#ffffff'); } }
    for (const k in game.player.buffs) game.player.buffs[k] = Math.max(0, game.player.buffs[k] - dt); // 临时增益倒计时
    for (const core of game.cores) if (!core.live) { core.timer -= dt; if (core.timer <= 0) Object.assign(core, spawnCore()); }
    for (const actor of [game.player, ...game.bots]) for (const core of game.cores) if (core.live && actor.respawn <= 0 && distance(actor, core) < actor.pickup) { core.live = false; core.timer = 4; if (actor.kind === 'player') { game.score++; addXp(1); effect('+1 核心', actor.x, actor.y, '#ffe073'); } }
    if (game.player.respawn <= 0) for (const it of game.items) if (it.live && distance(game.player, it) < game.player.pickup) { it.live = false; applyItem(game.player, it); }
    game.items = game.items.filter(it => { it.life -= dt; return it.live && it.life > 0; });
    game.bullets = game.bullets.filter(b => { b.x += b.dx * dt; b.y += b.dy * dt; b.life -= dt; const targets = b.team === 'player' ? game.bots : [game.player]; const target = targets.find(t => t.respawn <= 0 && (t.invuln || 0) <= 0 && distance(b, t) < (b.fire ? 26 : 24)); if (target) { target.hp -= b.damage * (1 - target.resist); effect(`-${Math.round(b.damage)}`, target.x, target.y - 25, '#ff8d8d'); b.life = 0; if (target.hp <= 0) { if (target.kind === 'bot') { target.dead = true; game.score += target.boss ? 8 : target.type === 'brute' ? 3 : 2; addXp(target.boss ? 2 : 1); effect(target.boss ? '首领击败！' : '击败', target.x, target.y, '#ffffff'); if (target.boss || Math.random() < .15) spawnItem(target.x, target.y); } } } return b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height; });
    game.bots = game.bots.filter(bot => !bot.dead);
    if (game.phase === 'upgrade') { /* 升级暂停，本 tick 不再推进波次 */ }
    else if (game.phase === 'playing' && game.bots.length === 0) { game.score += 3; startWave(); }
  }
  game.effects = game.effects.filter(e => (e.life -= dt) > 0);
}
setInterval(tick, 1000 / 60);
