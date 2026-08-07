const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#start');
const intro = document.querySelector('#intro');
const status = document.querySelector('#status');
const timerEl = document.querySelector('#timer');
const waveEl = document.querySelector('#wave');
const hudLevelEl = document.querySelector('#hudLevel');
const hudHpFill = document.querySelector('.hud-hp i');
const hudXpFill = document.querySelector('.hud-xp i');
const hudLivesEl = document.querySelector('#hudLives');

const state = game;          // 直接引用本地游戏状态（game.js）
const input = game.input;    // 输入对象，game.js 的 tick 读取它
window.__state = game;       // 调试用

let camera = { x: 0, y: 0 };
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
let autoMode = false, autoFire = false;
const keys = new Set();
const BINDINGS = { KeyW:'up', KeyA:'left', KeyS:'down', KeyD:'right', Space:'shoot', ShiftLeft:'sprint', ShiftRight:'sprint' };
let lastFrame = performance.now();
const IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
let joy = null, aimJoy = null; // 手机端：左摇杆移动 / 右摇杆瞄准

const stamina = document.createElement('div');
stamina.className = 'stamina'; stamina.innerHTML = '<i></i>';
document.querySelector('#arena-wrap').append(stamina);
const staminaFill = stamina.firstChild;
const fireMode = document.createElement('div');
fireMode.className = 'fire-mode'; document.querySelector('#arena-wrap').append(fireMode);
const buffBar = document.createElement('div');
buffBar.className = 'buffs'; document.querySelector('#arena-wrap').append(buffBar);
const BOSS_NAMES = { boss: '首领', fireboss: '喷火首领', tankboss: '堡垒首领' };
const bossBar = document.createElement('div');
bossBar.className = 'boss-bar'; bossBar.hidden = true;
bossBar.innerHTML = '<span class="boss-name"></span><div class="boss-track"><i></i></div><span class="boss-hp"></span>';
document.querySelector('#arena-wrap').append(bossBar);
const bossNameEl = bossBar.querySelector('.boss-name');
const bossFillEl = bossBar.querySelector('.boss-track i');
const bossHpEl = bossBar.querySelector('.boss-hp');
const attrPanel = document.createElement('div');
attrPanel.className = 'attr'; attrPanel.style.display = 'none';
document.querySelector('#arena-wrap').append(attrPanel);

startButton.disabled = false; startButton.textContent = '开始新一局';
startButton.onclick = () => { startGame(); intro.hidden = true; status.textContent = '正在生成新战场…'; };

function syncInput() {
  if (IS_TOUCH) return; // 手机端由摇杆驱动
  input.x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  input.y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  input.sprint = keys.has('sprint');
  input.shoot = keys.has('shoot') || (autoMode ? autoFire : input.mouseFire);
}
const KEY_FALLBACK = { w:'up', a:'left', s:'down', d:'right', ' ':'shoot', shift:'sprint' };
function keyName(e) { return e.isComposing ? null : BINDINGS[e.code] || KEY_FALLBACK[String(e.key).toLowerCase()] || null; }
function clearKeys() { if (keys.size || autoFire || input.mouseFire) { keys.clear(); autoFire = false; input.mouseFire = false; syncInput(); } }
addEventListener('keydown', e => { if (e.key === 'Escape') { togglePause(); return; } const name = keyName(e); if (!name) return; e.preventDefault(); if (!e.repeat || !keys.has(name)) { keys.add(name); syncInput(); } });
addEventListener('keyup', e => { const name = keyName(e); if (!name) return; keys.delete(name); syncInput(); });
addEventListener('compositionstart', clearKeys);
addEventListener('blur', clearKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * canvas.width / r.width; mouse.y = (e.clientY - r.top) * canvas.height / r.height; });
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { if (autoMode) autoFire = !autoFire; else input.mouseFire = true; syncInput(); }
  if (e.button === 2) { autoMode = !autoMode; autoFire = false; input.mouseFire = false; syncInput(); }
});
addEventListener('mouseup', e => { if (e.button === 0 && !autoMode) { input.mouseFire = false; syncInput(); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ==== 手机端：左摇杆移动 / 右摇杆瞄准 / 自动开火 ====
if (IS_TOUCH) {
  canvas.style.touchAction = 'none';
  const touchPos = t => { const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left) * canvas.width / r.width, y: (t.clientY - r.top) * canvas.height / r.height }; };
  function syncTouch() {
    if (joy) { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy); input.x = d > 10 ? dx / d : 0; input.y = d > 10 ? dy / d : 0; }
    else { input.x = 0; input.y = 0; }
    if (aimJoy) { const dx = aimJoy.x - aimJoy.ox, dy = aimJoy.y - aimJoy.oy, d = Math.hypot(dx, dy); if (d > 10) { input.aimX = dx / d; input.aimY = dy / d; } }
    input.shoot = true; // 手机端自动开火
  }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) { const p = touchPos(t); if (!joy && p.x < canvas.width * .5) joy = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y }; else if (!aimJoy) aimJoy = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y }; } syncTouch(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) { const p = touchPos(t); if (joy && joy.id === t.identifier) { joy.x = p.x; joy.y = p.y; } if (aimJoy && aimJoy.id === t.identifier) { aimJoy.x = p.x; aimJoy.y = p.y; } } syncTouch(); }, { passive: false });
  canvas.addEventListener('touchend', e => { e.preventDefault(); for (const t of e.changedTouches) { if (joy && joy.id === t.identifier) joy = null; if (aimJoy && aimJoy.id === t.identifier) aimJoy = null; } syncTouch(); }, { passive: false });
  canvas.addEventListener('touchcancel', e => { e.preventDefault(); joy = null; aimJoy = null; syncTouch(); }, { passive: false });
}
function drawJoysticks() {
  if (!IS_TOUCH) return;
  if (joy) { ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 48, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#7fd4ff'; ctx.beginPath(); ctx.arc(joy.ox + (joy.x - joy.ox) * .45, joy.oy + (joy.y - joy.oy) * .45, 20, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  if (aimJoy) { ctx.save(); ctx.globalAlpha = .5; ctx.strokeStyle = '#ffb37f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(aimJoy.ox, aimJoy.oy, 48, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#ffb37f'; ctx.beginPath(); ctx.arc(aimJoy.ox + (aimJoy.x - aimJoy.ox) * .45, aimJoy.oy + (aimJoy.y - aimJoy.oy) * .45, 20, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}

function updateCamera(player) {
  const left = canvas.width * .34, right = canvas.width * .66, top = canvas.height * .34, bottom = canvas.height * .66;
  const screenX = player.x - camera.x, screenY = player.y - camera.y;
  let targetX = camera.x, targetY = camera.y;
  if (screenX < left) targetX = player.x - left;
  if (screenX > right) targetX = player.x - right;
  if (screenY < top) targetY = player.y - top;
  if (screenY > bottom) targetY = player.y - bottom;
  camera.x += (Math.max(0, Math.min(WORLD.width - canvas.width, targetX)) - camera.x) * .16;
  camera.y += (Math.max(0, Math.min(WORLD.height - canvas.height, targetY)) - camera.y) * .16;
}
function drawActor(a, color, label) {
  const alpha = a.respawn > 0 ? .22 : (a.invuln > 0 ? .4 + .25 * Math.sin(Date.now() / 90) : 1);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(a.x, a.y, a.boss ? 30 : 19, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#06101c'; ctx.fillRect(a.x - 32, a.y - 48, 64, 17); ctx.fillStyle = '#253b4d'; ctx.fillRect(a.x - 28, a.y - 43, 56, 7); ctx.fillStyle = color; ctx.fillRect(a.x - 28, a.y - 43, 56 * Math.max(0, a.hp) / a.maxHp, 7);
  ctx.fillStyle = '#fff'; ctx.font = '10px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(`${label} ${Math.ceil(a.hp)}/${a.maxHp}`, a.x, a.y - 53);
  ctx.globalAlpha = 1;
}
function drawWorld() {
  const p = state.player;
  updateCamera(p); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#081a2c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(-camera.x, -camera.y); ctx.strokeStyle = '#163950';
  for (let x = 0; x <= WORLD.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
  for (let y = 0; y <= WORLD.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
  state.cores.forEach(c => { if (!c.live) return; ctx.fillStyle = '#ffe073'; ctx.shadowBlur = 20; ctx.shadowColor = '#ffe073'; ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
  state.items.forEach(it => { if (!it.live) return; ctx.save(); const pulse = 1 + Math.sin(Date.now() / 220 + it.x) * .15; ctx.fillStyle = it.color; ctx.shadowBlur = 16; ctx.shadowColor = it.color; ctx.globalAlpha = Math.min(1, it.life / 3); ctx.beginPath(); ctx.arc(it.x, it.y, 11 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#06101c'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(it.type === 'medkit' ? '+' : it.type === 'fury' ? '攻' : it.type === 'overclock' ? '速' : '程', it.x, it.y + 3); ctx.restore(); });
  state.bullets.forEach(b => { ctx.fillStyle = b.team === 'player' ? '#ff6677' : (b.fire ? '#ff7a4d' : '#72b8ff'); ctx.shadowBlur = b.fire ? 10 : 0; ctx.shadowColor = b.fire ? '#ff7a4d' : ''; ctx.beginPath(); ctx.arc(b.x, b.y, b.fire ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
  drawActor(p, '#f85c6c', '你');
  const styles = { scout: ['#65b8ff','侦察'], shooter: ['#b18cff','射手'], brute: ['#ff9565','重装'], boss: ['#ffd464','首领'], fireboss: ['#ff7a4d','喷火首领'], tankboss: ['#c9a0ff','堡垒首领'] };
  state.bots.forEach(b => drawActor(b, ...(styles[b.type] || ['#58a7ff','AI'])));
  state.effects.forEach(e => { ctx.globalAlpha = e.life; ctx.fillStyle = e.color; ctx.font = 'bold 15px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(e.text, e.x, e.y - (1 - e.life) * 35); ctx.globalAlpha = 1; });
  ctx.restore();
}
function drawHud() {
  const p = state.player, sx = p.x - camera.x, sy = p.y - camera.y, range = 510, ex = sx + p.aimX * range, ey = sy + p.aimY * range;
  ctx.save(); const gradient = ctx.createLinearGradient(sx, sy, ex, ey); gradient.addColorStop(0, 'rgba(255,232,132,.45)'); gradient.addColorStop(1, 'rgba(255,218,92,0)'); ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.setLineDash([3, 11]); ctx.lineDashOffset = -(Date.now() / 28) % 14; ctx.beginPath(); ctx.moveTo(sx + p.aimX * 25, sy + p.aimY * 25); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,228,118,.65)'; ctx.beginPath(); ctx.arc(ex, ey, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(mouse.x, mouse.y); ctx.strokeStyle = 'rgba(255,245,202,.92)'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.moveTo(-13,0);ctx.lineTo(-4,0);ctx.moveTo(4,0);ctx.lineTo(13,0);ctx.moveTo(0,-13);ctx.lineTo(0,-4);ctx.moveTo(0,4);ctx.lineTo(0,13);ctx.stroke(); ctx.restore();
  if (p.pickup > 36) drawMagnet(p); drawOffscreenEnemies(); drawJoysticks();
}
function drawMagnet(p) { const x = p.x - camera.x, y = p.y - camera.y, r = p.pickup * (1 + Math.sin(Date.now() / 260) * .05); ctx.save(); ctx.strokeStyle = 'rgba(105,231,255,.72)'; ctx.setLineDash([5,7]); ctx.lineDashOffset = -Date.now()/42; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke(); ctx.restore(); }
function drawOffscreenEnemies() { const pad=42,cx=canvas.width/2,cy=canvas.height/2; state.bots.forEach(bot => { const x=bot.x-camera.x,y=bot.y-camera.y; if(x>pad&&x<canvas.width-pad&&y>pad&&y<canvas.height-pad)return; const dx=x-cx,dy=y-cy,angle=Math.atan2(dy,dx),scale=Math.min((canvas.width/2-pad)/Math.max(1,Math.abs(dx)),(canvas.height/2-pad)/Math.max(1,Math.abs(dy))),ax=cx+dx*scale,ay=cy+dy*scale; ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);ctx.fillStyle=bot.boss?'#ffd464':'#72b8ff';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-9,-8);ctx.lineTo(-5,0);ctx.lineTo(-9,8);ctx.closePath();ctx.fill();ctx.restore(); }); }
function showUpgrade() {
  if (document.querySelector('#upgrade')) return;
  const panel=document.createElement('div');panel.id='upgrade';
  panel.style.cssText='position:fixed;inset:0;background:#030912dc;display:grid;place-content:center;gap:14px;z-index:4;text-align:center;padding:20px';
  panel.innerHTML='<h2 style="color:#ffe073;margin:0">选择一项强化</h2><p style="margin:0;color:#c8d8e5">本局死亡后仍会保留</p>';
  const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;flex-wrap:wrap;justify-content:center';
  state.options.forEach(o=>{const b=document.createElement('button');b.innerHTML=`<b>${o.title}</b><br><small>${o.text}</small>`;b.style.cssText='width:170px;min-height:90px;background:#12354b;color:#eefaff;border:1px solid #65c4de';b.onclick=()=>{applyUpgrade(state.player, o.id); state.phase='playing'; state.options=[]; effect('升级完成', state.player.x, state.player.y, '#ffe073'); panel.remove()};row.append(b)});
  panel.append(row);document.body.append(panel);
}
let attrCache = '';
function buildAttr(p) {
  const c = CAPS;
  const mark = cond => cond ? ' <em>满</em>' : '';
  return `<div class="attr-row"><span>能量</span><b>${game.score}</b></div>` +
    `<div class="attr-row"><span>伤害</span><b>${p.damage}${mark(p.damage >= c.damage)}</b></div>` +
    `<div class="attr-row"><span>射速</span><b>${(1 / (p.fireRate || 1)).toFixed(1)}/s${mark(p.fireRate <= c.fireRate + .001)}</b></div>` +
    `<div class="attr-row"><span>弹速</span><b>${p.bulletSpeed}${mark(p.bulletSpeed >= c.bulletSpeed)}</b></div>` +
    `<div class="attr-row"><span>移速</span><b>${Math.round(p.speed)}${mark(p.speed >= c.speed)}</b></div>` +
    `<div class="attr-row"><span>拾取</span><b>${p.pickup}${mark(p.pickup >= c.pickup)}</b></div>` +
    `<div class="attr-row"><span>减伤</span><b>${Math.round((p.resist || 0) * 100)}%${mark(p.resist >= c.resist)}</b></div>`;
}
function updateAttr(p) {
  hudXpFill.style.width = `${Math.max(0, Math.min(100, p.xp / xpToNext(p.level) * 100))}%`;
  attrPanel.style.display = p ? '' : 'none';
  if (!p) return;
  const atr = buildAttr(p);
  if (atr !== attrCache) { attrPanel.innerHTML = atr; attrCache = atr; }
}
// ==== 暂停 / 游戏结束 页面 ====
const pauseBtn = document.createElement('div');
pauseBtn.className = 'pause-btn'; pauseBtn.textContent = '⏸';
pauseBtn.addEventListener('click', togglePause);
document.querySelector('#arena-wrap').append(pauseBtn);
const pausePanel = document.createElement('div');
pausePanel.id = 'pausePanel'; pausePanel.className = 'panel-overlay'; pausePanel.hidden = true;
pausePanel.innerHTML = `<h2>已暂停</h2><div class="attr-box" style="display:none"></div><div class="panel-btns"><button id="btnResume">继续</button><button id="btnRestart">重新开始</button></div>`;
document.body.appendChild(pausePanel);
const overPanel = document.createElement('div');
overPanel.id = 'overPanel'; overPanel.className = 'panel-overlay'; overPanel.hidden = true;
overPanel.innerHTML = `<h2>游戏结束</h2><p class="over-stats"></p><div class="panel-btns"><button id="btnAgain">重新开始</button></div>`;
document.body.appendChild(overPanel);
function togglePause() {
  if (state.phase !== 'playing') return;
  game.paused = !game.paused;
  if (game.paused) showPause(); else hidePause();
}
function showPause() {
  const box = pausePanel.querySelector('.attr-box');
  box.style.display = IS_TOUCH ? '' : 'none';
  if (IS_TOUCH) box.innerHTML = buildAttr(state.player);
  pausePanel.hidden = false;
}
function hidePause() { pausePanel.hidden = true; }
function showOver() {
  overPanel.querySelector('.over-stats').textContent = `存活 ${Math.floor(state.time)} 秒 · 第 ${state.wave} 波 · 获得 ${state.score} 能量`;
  overPanel.hidden = false;
}
function hideOver() { overPanel.hidden = true; }
pausePanel.querySelector('#btnResume').onclick = () => togglePause();
pausePanel.querySelector('#btnRestart').onclick = () => { startGame(); hidePause(); };
overPanel.querySelector('#btnAgain').onclick = () => { startGame(); hideOver(); };
let lastPhase = '';
function frame() {
  const now = performance.now(), dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now;
  if (state.player) {
    const p = state.player;
    const dx=mouse.x-(p.x-camera.x),dy=mouse.y-(p.y-camera.y),d=Math.hypot(dx,dy)||1; if(!IS_TOUCH){ input.aimX=dx/d; input.aimY=dy/d; }
    staminaFill.style.width=`${p.stamina/p.maxStamina*100}%`;
    const bf = p.buffs || {}; const active = []; if (bf.fury > 0) active.push(`<span>怒火 ${bf.fury.toFixed(1)}s</span>`); if (bf.overclock > 0) active.push(`<span>超频 ${bf.overclock.toFixed(1)}s</span>`); if (bf.snipe > 0) active.push(`<span>射程 ${bf.snipe.toFixed(1)}s</span>`); buffBar.innerHTML = active.join(''); buffBar.style.display = active.length ? '' : 'none';
    hudLevelEl.textContent = `LV ${p.level}`;
    hudHpFill.style.width = `${Math.max(0, Math.min(100, p.hp / p.maxHp * 100))}%`;
    hudLivesEl.textContent = '♥'.repeat(Math.max(0, game.lives));
    updateAttr(p); drawWorld(); drawHud();
    const boss = state.bots.find(b => b.boss) || null;
    if (boss) {
      bossNameEl.textContent = BOSS_NAMES[boss.type] || '首领';
      bossFillEl.style.width = `${Math.max(0, boss.hp) / boss.maxHp * 100}%`;
      bossHpEl.textContent = `${Math.ceil(Math.max(0, boss.hp))}/${boss.maxHp}`;
      bossBar.hidden = false;
      timerEl.style.display = 'none';
    } else {
      bossBar.hidden = true;
      timerEl.style.display = '';
    }
    timerEl.textContent=`${String(Math.max(0,Math.ceil(state.time))/60|0).padStart(2,'0')}:${String(Math.max(0,Math.ceil(state.time))%60).padStart(2,'0')}`;
    waveEl.textContent=`第 ${state.wave} 波`;
    if(state.phase==='playing')status.textContent=`第 ${state.wave} 波 · 敌人 ${state.bots.length}`;
  }
  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
    if (state.phase === 'upgrade') showUpgrade();
    if (state.phase === 'finished') showOver();
  }
  pauseBtn.style.display = (state.phase === 'playing' && !game.paused) ? '' : 'none';
  fireMode.textContent=autoMode?`自动发射 · ${autoFire?'开火中':'待机'}（右键切换）`:'手动发射（右键切换）';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
