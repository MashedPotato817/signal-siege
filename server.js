const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const WORLD = { width: 2400, height: 1400 };
const clients = new Set();
const game = { phase: 'lobby', time: 0, wave: 0, score: 0, player: null, bots: [], cores: [], bullets: [], effects: [], options: [], controller: null, last: Date.now() };

const UPGRADE_POOL = [
  ['rapid', '极速脉冲', '射击间隔 -22%'], ['swift', '相位推进', '移动速度 +18%'],
  ['heavy', '过载弹头', '每发伤害 +7'], ['vital', '强韧核心', '最大生命 +30，立即回复'],
  ['magnet', '能量磁场', '核心拾取范围 +14'], ['velocity', '高速弹体', '子弹速度 +100'],
  ['shield', '偏转护盾', '受到伤害 -12%'], ['restore', '应急维修', '回复 45 生命'],
];

const server = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  let file = route === '/' ? 'index.html' : route.slice(1);
  file = path.join(ROOT, file);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const client = { socket, buffer: Buffer.alloc(0), input: { x: 0, y: 0, aimX: 1, aimY: 0, shoot: false } };
  clients.add(client); socket.on('data', data => receive(client, data)); socket.on('close', () => { clients.delete(client); if(game.controller===client)game.controller=[...clients].find(c=>c.joined)||null; }); socket.on('error', () => { clients.delete(client); if(game.controller===client)game.controller=[...clients].find(c=>c.joined)||null; });
});

function receive(client, data) {
  client.buffer = Buffer.concat([client.buffer, data]);
  while (client.buffer.length >= 2) {
    const size = client.buffer[1] & 127, header = size === 126 ? 4 : 2, total = header + 4 + size;
    if (size === 127 || client.buffer.length < total) return;
    const mask = client.buffer.subarray(header, header + 4); const payload = client.buffer.subarray(header + 4, total); client.buffer = client.buffer.subarray(total);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    try { handle(client, JSON.parse(payload.toString())); } catch { /* ignore malformed frames */ }
  }
}
function handle(client, message) {
  if (message.type === 'join') { client.joined = true; send(client, { type: 'ready' }); return; }
  if (message.type === 'input') { if (Number(message.x) !== 0 || Number(message.y) !== 0 || !!message.shoot || !!message.sprint) game.controller = client; const aim = Math.hypot(Number(message.aimX) || 0, Number(message.aimY) || 0); client.input = { x: clamp(message.x, -1, 1), y: clamp(message.y, -1, 1), aimX: aim ? (Number(message.aimX) || 0) / aim : 1, aimY: aim ? (Number(message.aimY) || 0) / aim : 0, shoot: !!message.shoot, sprint: !!message.sprint }; }
  if (message.type === 'start') startGame();
  if (message.type === 'upgrade' && game.phase === 'upgrade' && game.options.some(x => x.id === message.id)) { applyUpgrade(game.player, message.id); game.phase = 'playing'; game.options = []; effect('升级完成', game.player.x, game.player.y, '#ffe073'); }
}

function createActor(kind, x, y, type='scout') { return { kind, type, x, y, hp: kind === 'player' ? 100 : 55, maxHp: kind === 'player' ? 100 : 55, speed: kind === 'player' ? 215 : 145, damage: kind === 'player' ? 18 : 8, fireRate: kind === 'player' ? 1 : 1.5, bulletSpeed: 620, pickup: 36, resist: 0, aimX: 1, aimY: 0, cooldown: 0, touchCooldown: 0, respawn: 0, invuln: 0, stamina: 100, maxStamina: 100, xp: 0, level: 1, brain: {} }; }
function startGame() {
  game.phase = 'playing'; game.wave = 0; game.score = 0; game.bullets = []; game.effects = [];
  game.player = createActor('player', WORLD.width / 2, WORLD.height / 2);
  game.cores = Array.from({ length: 8 }, () => spawnCore());
  startWave();
}
function startWave() { game.wave++; game.time = 32 + Math.min(18, game.wave * 3); const boss = game.wave % 3 === 0; const count = boss ? 1 + Math.floor(game.wave / 3) : 2 + Math.min(4, game.wave); const types = boss ? ['boss', ...Array.from({length: count - 1}, () => Math.random() < .6 ? 'scout' : 'shooter')] : Array.from({length: count}, () => { const r=Math.random(); return r < .5 ? 'scout' : r < .82 ? 'shooter' : 'brute'; }); game.bots = types.map((type, i) => makeEnemy(type, i)); effect(boss ? `第 ${game.wave} 波 · 首领来袭` : `第 ${game.wave} 波开始`, game.player.x, game.player.y - 70, boss ? '#ffca68' : '#bcecff'); }
function makeEnemy(type, index) { const angle=(Math.PI*2/index + Math.random()) / Math.max(1, (type === 'boss' ? 1 : 3)); const x=clamp(game.player.x + Math.cos(angle)* (type === 'boss' ? 560 : 430 + Math.random()*260),60,WORLD.width-60), y=clamp(game.player.y + Math.sin(angle)*(type === 'boss'?400:300+Math.random()*220),60,WORLD.height-60); const bot=createActor('bot',x,y,type); if(type==='scout'){bot.hp=bot.maxHp=45;bot.speed=170;bot.damage=6;bot.fireRate=1.7;} if(type==='shooter'){bot.hp=bot.maxHp=62;bot.speed=118;bot.damage=10;bot.fireRate=1.35;bot.range=360;} if(type==='brute'){bot.hp=bot.maxHp=125;bot.speed=92;bot.damage=15;bot.fireRate=1.8;bot.range=230;} if(type==='boss'){bot.hp=bot.maxHp=360;bot.speed=88;bot.damage=17;bot.fireRate=1.1;bot.range=420;bot.boss=true;} return bot; }
function spawnCore() { return { x: 180 + Math.random() * (WORLD.width - 360), y: 160 + Math.random() * (WORLD.height - 320), live: true, timer: 0 }; }
function pickOptions() { return [...UPGRADE_POOL].sort(() => Math.random() - .5).slice(0, 3).map(([id, title, text]) => ({ id, title, text })); }
function applyUpgrade(p, id) { if (id === 'rapid') p.fireRate *= .78; if (id === 'swift') p.speed *= 1.18; if (id === 'heavy') p.damage += 7; if (id === 'vital') { p.maxHp += 30; p.hp += 30; } if (id === 'magnet') p.pickup += 14; if (id === 'velocity') p.bulletSpeed += 100; if (id === 'shield') p.resist = Math.min(.48, p.resist + .12); if (id === 'restore') p.hp = Math.min(p.maxHp, p.hp + 45); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, Number(v) || 0)); }
function effect(text, x, y, color) { game.effects.push({ text, x, y, color, life: 1 }); }

function stepActor(actor, input, dt) {
  if (actor.respawn > 0) { actor.respawn -= dt; if (actor.respawn <= 0) { actor.hp = actor.maxHp; actor.invuln = 1.5; } return; }
  actor.invuln = Math.max(0, (actor.invuln || 0) - dt);
  const moving = Math.hypot(input.x, input.y) > .05; const sprint = actor.kind === 'player' && input.sprint && moving && actor.stamina > 0; actor.stamina = clamp(actor.stamina + (sprint ? -34 : 22) * dt, 0, actor.maxStamina); const move = Math.hypot(input.x, input.y) || 1, speed = actor.speed * (sprint ? 1.62 : 1); actor.x = clamp(actor.x + input.x / move * speed * dt, 35, WORLD.width - 35); actor.y = clamp(actor.y + input.y / move * speed * dt, 35, WORLD.height - 35);
  const aim = Math.hypot(input.aimX, input.aimY) || 1; actor.aimX = input.aimX / aim; actor.aimY = input.aimY / aim; actor.cooldown -= dt; actor.touchCooldown -= dt;
  if (input.shoot && actor.cooldown <= 0) { const shots=actor.type==='boss'?[-.2,0,.2]:[0]; shots.forEach(offset=>{const a=Math.atan2(actor.aimY,actor.aimX)+offset;game.bullets.push({ team: actor.kind, type:actor.type, x: actor.x + Math.cos(a) * 21, y: actor.y + Math.sin(a) * 21, dx: Math.cos(a) * actor.bulletSpeed, dy: Math.sin(a) * actor.bulletSpeed, damage: actor.damage, life: .82 }); }); actor.cooldown = .42 * actor.fireRate; }
}
function aiInput(bot, now, dt) {
  const b = bot.brain, p = game.player;
  if (!b.until || now > b.until) { const roll = Math.random(); b.mode = roll < .52 ? 'core' : roll < .88 ? 'wander' : 'duel'; b.until = now + 1500 + Math.random() * 2200; b.x = 180 + Math.random() * (WORLD.width - 360); b.y = 160 + Math.random() * (WORLD.height - 320); }
  const core = game.cores.filter(c => c.live).sort((a, z) => distance(bot, a) - distance(bot, z))[0]; const target = b.mode === 'core' && core ? core : b.mode === 'duel' ? p : { x: b.x, y: b.y };
  let x = target.x - bot.x, y = target.y - bot.y; const playerDistance=distance(bot,p); if ((bot.type==='shooter'||bot.type==='boss')&&b.mode==='duel'){const desired=bot.type==='boss'?300:260;const direction=playerDistance<desired?-1:playerDistance>desired+70?1:0;x=(p.x-bot.x)*direction;y=(p.y-bot.y)*direction;} if (Math.hypot(x, y) < 55) { b.until = 0; x = y = 0; }
  b.vx = (b.vx || 0) * .84 + x * .16; b.vy = (b.vy || 0) * .84 + y * .16;
  const d = distance(bot, p); const range=bot.range || 240; if (d < range && Math.random() < (bot.boss ? .014 : .007) * dt * 30) b.shootUntil = now + 160 + Math.random() * 260;
  return { x: b.vx, y: b.vy, aimX: p.x - bot.x, aimY: p.y - bot.y, shoot: now < (b.shootUntil || 0) };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function tick() {
  const now = Date.now(), dt = Math.min(.05, (now - game.last) / 1000); game.last = now;
  if (game.phase === 'playing') {
    game.time -= dt; const playerClient = game.controller && clients.has(game.controller) ? game.controller : [...clients].find(c => c.joined); stepActor(game.player, playerClient?.input || { x: 0, y: 0, aimX: 1, aimY: 0, shoot: false, sprint:false }, dt);
    game.bots.forEach(bot => { stepActor(bot, aiInput(bot, now, dt), dt); if (bot.touchCooldown<=0 && bot.type!=='shooter' && game.player.respawn<=0 && game.player.invuln<=0 && distance(bot,game.player)<(bot.type==='boss'?52:40)) { const hit=bot.type==='boss'?18:bot.type==='brute'?13:7;game.player.hp-=hit;bot.touchCooldown=1;effect(`-${hit}`,game.player.x,game.player.y-25,'#ff8d8d'); } }); if(game.player.hp<=0 && game.player.respawn<=0){game.player.hp=0;game.player.respawn=1.8;effect('击倒',game.player.x,game.player.y,'#ffffff');}
    for (const core of game.cores) if (!core.live) { core.timer -= dt; if (core.timer <= 0) Object.assign(core, spawnCore()); }
    for (const actor of [game.player, ...game.bots]) for (const core of game.cores) if (core.live && actor.respawn <= 0 && distance(actor, core) < actor.pickup) { core.live = false; core.timer = 4; if (actor.kind === 'player') { game.score++; actor.xp++; effect('+1 核心', actor.x, actor.y, '#ffe073'); if (actor.xp >= 3) { actor.xp = 0; actor.level++; game.phase = 'upgrade'; game.options = pickOptions(); } } }
    game.bullets = game.bullets.filter(b => { b.x += b.dx * dt; b.y += b.dy * dt; b.life -= dt; const targets = b.team === 'player' ? game.bots : [game.player]; const target = targets.find(t => t.respawn <= 0 && (t.invuln || 0) <= 0 && distance(b, t) < 24); if (target) { target.hp -= b.damage * (1 - target.resist); effect(`-${Math.round(b.damage)}`, target.x, target.y - 25, '#ff8d8d'); b.life = 0; if (target.hp <= 0) { if (target.kind === 'bot') { target.dead = true; game.score += target.boss ? 8 : target.type === 'brute' ? 3 : 2; game.player.xp += target.boss ? 2 : 1; effect(target.boss ? '首领击败！' : '击败', target.x, target.y, '#ffffff'); } else { target.respawn = 2.6; effect('击倒', target.x, target.y, '#ffffff'); } } } return b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height; });
    game.bots = game.bots.filter(bot => !bot.dead);
    if (game.player.xp >= 3) { game.player.xp -= 3; game.player.level++; game.phase = 'upgrade'; game.options = pickOptions(); }
    else if (game.bots.length === 0) { game.score += 3; game.time += 8; startWave(); }
    else if (game.time <= 0) game.phase = 'finished';
  }
  game.effects = game.effects.filter(e => (e.life -= dt) > 0); broadcast({ type: 'state', game: view() });
}
function viewActor(a) { return { type:a.type, x: a.x, y: a.y, hp: a.hp, maxHp: a.maxHp, stamina: a.stamina, maxStamina: a.maxStamina, pickup:a.pickup, respawn: a.respawn, invuln:a.invuln || 0, aimX: a.aimX, aimY: a.aimY }; }
function view() { return { phase: game.phase, time: game.time, wave:game.wave, score: game.score, player: game.player && { ...viewActor(game.player), xp: game.player.xp, level: game.player.level, speed: game.player.speed }, bots: game.bots.map(viewActor), cores: game.cores, bullets: game.bullets, effects: game.effects, options: game.options, world: WORLD }; }
function send(c, data) { const body = Buffer.from(JSON.stringify(data)); const header = body.length < 126 ? Buffer.from([129, body.length]) : Buffer.from([129, 126, body.length >> 8, body.length & 255]); c.socket.write(Buffer.concat([header, body])); }
function broadcast(data) { clients.forEach(c => { try { const g = data.game; send(c, { type: 'state', game: { ...g, you: c === game.controller } }); } catch { clients.delete(c); } }); }
setInterval(tick, 1000 / 60);
server.listen(3000, '0.0.0.0', () => console.log('Signal Siege: http://localhost:3000'));
