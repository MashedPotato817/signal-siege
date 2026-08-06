const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#start');
const intro = document.querySelector('#intro');
const status = document.querySelector('#status');
const scoreEl = document.querySelector('#score');
const timerEl = document.querySelector('#timer');
const levelEl = document.querySelector('#level');

let state = null;
let camera = { x: 0, y: 0 };
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
let autoMode = false, autoFire = false;
const keys = new Set();
const input = { x: 0, y: 0, aimX: 1, aimY: 0, shoot: false, sprint: false };
const BINDINGS = { KeyW:'up', KeyA:'left', KeyS:'down', KeyD:'right', Space:'shoot', ShiftLeft:'sprint', ShiftRight:'sprint' };

const stamina = document.createElement('div');
stamina.className = 'stamina'; stamina.innerHTML = '<i></i>';
document.querySelector('#arena-wrap').append(stamina);
const staminaFill = stamina.firstChild;
const fireMode = document.createElement('div');
fireMode.className = 'fire-mode'; document.querySelector('#arena-wrap').append(fireMode);

const socket = new WebSocket(`ws://${location.host}`);
socket.onopen = () => socket.send(JSON.stringify({ type: 'join' }));
socket.onclose = () => status.textContent = '连接已断开，请刷新页面';
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.type === 'ready') { startButton.disabled = false; startButton.textContent = '开始新一局'; status.textContent = '战场已就绪'; }
  if (message.type !== 'state') return;
  state = message.game;
  if (state.phase === 'upgrade') showUpgrade();
  if (state.phase === 'finished') { intro.hidden = false; intro.querySelector('h2').textContent = `第 ${state.wave} 波结束`; intro.querySelector('p').textContent = `本局获得 ${state.score} 能量。再来一局，尝试新的构筑。`; startButton.textContent = '再来一局'; }
};
startButton.onclick = () => { socket.send(JSON.stringify({ type: 'start' })); intro.hidden = true; status.textContent = '正在生成新战场…'; };

function syncInput() {
  input.x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  input.y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  input.sprint = keys.has('sprint');
  input.shoot = keys.has('shoot') || (autoMode ? autoFire : input.mouseFire);
}
function keyName(e) { return (e.isComposing || e.keyCode === 229) ? null : BINDINGS[e.code] || null; }
function clearKeys() { if (keys.size || autoFire || input.mouseFire) { keys.clear(); autoFire = false; input.mouseFire = false; syncInput(); } }
addEventListener('keydown', e => { const name = keyName(e); if (!name) return; e.preventDefault(); if (!e.repeat) { keys.add(name); syncInput(); } });
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

function updateCamera(player) {
  const left = canvas.width * .34, right = canvas.width * .66, top = canvas.height * .34, bottom = canvas.height * .66;
  const screenX = player.x - camera.x, screenY = player.y - camera.y;
  let targetX = camera.x, targetY = camera.y;
  if (screenX < left) targetX = player.x - left;
  if (screenX > right) targetX = player.x - right;
  if (screenY < top) targetY = player.y - top;
  if (screenY > bottom) targetY = player.y - bottom;
  camera.x += (Math.max(0, Math.min(state.world.width - canvas.width, targetX)) - camera.x) * .16;
  camera.y += (Math.max(0, Math.min(state.world.height - canvas.height, targetY)) - camera.y) * .16;
}
function drawActor(a, color, label) {
  const alpha = a.respawn > 0 ? .22 : (a.invuln > 0 ? .4 + .25 * Math.sin(Date.now() / 90) : 1);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(a.x, a.y, label === '首领' ? 28 : 19, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#06101c'; ctx.fillRect(a.x - 32, a.y - 48, 64, 17); ctx.fillStyle = '#253b4d'; ctx.fillRect(a.x - 28, a.y - 43, 56, 7); ctx.fillStyle = color; ctx.fillRect(a.x - 28, a.y - 43, 56 * Math.max(0, a.hp) / a.maxHp, 7);
  ctx.fillStyle = '#fff'; ctx.font = '10px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(`${label} ${Math.ceil(a.hp)}/${a.maxHp}`, a.x, a.y - 53);
  ctx.globalAlpha = 1;
}
function drawWorld() {
  const p = state.player; updateCamera(p); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#081a2c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(-camera.x, -camera.y); ctx.strokeStyle = '#163950';
  for (let x = 0; x <= state.world.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.world.height); ctx.stroke(); }
  for (let y = 0; y <= state.world.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.world.width, y); ctx.stroke(); }
  state.cores.forEach(c => { if (!c.live) return; ctx.fillStyle = '#ffe073'; ctx.shadowBlur = 20; ctx.shadowColor = '#ffe073'; ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
  state.bullets.forEach(b => { ctx.fillStyle = b.team === 'player' ? '#ff6677' : '#72b8ff'; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); });
  drawActor(p, '#f85c6c', '你');
  const styles = { scout: ['#65b8ff','侦察'], shooter: ['#b18cff','射手'], brute: ['#ff9565','重装'], boss: ['#ffd464','首领'] };
  state.bots.forEach(b => drawActor(b, ...(styles[b.type] || ['#58a7ff','AI'])));
  state.effects.forEach(e => { ctx.globalAlpha = e.life; ctx.fillStyle = e.color; ctx.font = 'bold 15px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(e.text, e.x, e.y - (1 - e.life) * 35); ctx.globalAlpha = 1; });
  ctx.restore();
}
function drawHud() {
  const p = state.player, sx = p.x - camera.x, sy = p.y - camera.y, range = 510, ex = sx + p.aimX * range, ey = sy + p.aimY * range;
  ctx.save(); const gradient = ctx.createLinearGradient(sx, sy, ex, ey); gradient.addColorStop(0, 'rgba(255,232,132,.45)'); gradient.addColorStop(1, 'rgba(255,218,92,0)'); ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.setLineDash([3, 11]); ctx.lineDashOffset = -(Date.now() / 28) % 14; ctx.beginPath(); ctx.moveTo(sx + p.aimX * 25, sy + p.aimY * 25); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,228,118,.65)'; ctx.beginPath(); ctx.arc(ex, ey, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.translate(mouse.x, mouse.y); ctx.strokeStyle = 'rgba(255,245,202,.92)'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.moveTo(-13,0);ctx.lineTo(-4,0);ctx.moveTo(4,0);ctx.lineTo(13,0);ctx.moveTo(0,-13);ctx.lineTo(0,-4);ctx.moveTo(0,4);ctx.lineTo(0,13);ctx.stroke(); ctx.restore();
  if (p.pickup > 36) drawMagnet(p); drawOffscreenEnemies(p);
}
function drawMagnet(p) { const x = p.x - camera.x, y = p.y - camera.y, r = p.pickup * (1 + Math.sin(Date.now() / 260) * .05); ctx.save(); ctx.strokeStyle = 'rgba(105,231,255,.72)'; ctx.setLineDash([5,7]); ctx.lineDashOffset = -Date.now()/42; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke(); ctx.restore(); }
function drawOffscreenEnemies(p) { const pad=42,cx=canvas.width/2,cy=canvas.height/2; state.bots.forEach(bot => { const x=bot.x-camera.x,y=bot.y-camera.y; if(x>pad&&x<canvas.width-pad&&y>pad&&y<canvas.height-pad)return; const dx=x-cx,dy=y-cy,angle=Math.atan2(dy,dx),scale=Math.min((canvas.width/2-pad)/Math.max(1,Math.abs(dx)),(canvas.height/2-pad)/Math.max(1,Math.abs(dy))),ax=cx+dx*scale,ay=cy+dy*scale; ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);ctx.fillStyle=bot.type==='boss'?'#ffd464':'#72b8ff';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-9,-8);ctx.lineTo(-5,0);ctx.lineTo(-9,8);ctx.closePath();ctx.fill();ctx.restore(); }); }
function showUpgrade() { if (document.querySelector('#upgrade')) return; const panel=document.createElement('div');panel.id='upgrade';panel.style.cssText='position:fixed;inset:0;background:#030912dc;display:grid;place-content:center;gap:14px;z-index:4;text-align:center;padding:20px';panel.innerHTML='<h2 style="color:#ffe073;margin:0">选择一项强化</h2><p style="margin:0;color:#c8d8e5">本局死亡后仍会保留</p>';const row=document.createElement('div');row.style.cssText='display:flex;gap:12px;flex-wrap:wrap;justify-content:center';state.options.forEach(o=>{const b=document.createElement('button');b.innerHTML=`<b>${o.title}</b><br><small>${o.text}</small>`;b.style.cssText='width:170px;min-height:90px;background:#12354b;color:#eefaff;border:1px solid #65c4de';b.onclick=()=>{socket.send(JSON.stringify({type:'upgrade',id:o.id}));panel.remove()};row.append(b)});panel.append(row);document.body.append(panel); }
function frame() { if (state?.player) { const p=state.player; const dx=mouse.x-(p.x-camera.x),dy=mouse.y-(p.y-camera.y),d=Math.hypot(dx,dy)||1; input.aimX=dx/d;input.aimY=dy/d; staminaFill.style.width=`${p.stamina/p.maxStamina*100}%`; drawWorld();drawHud();scoreEl.textContent=`能量 ${state.score}`;timerEl.textContent=`${String(Math.max(0,Math.ceil(state.time))/60|0).padStart(2,'0')}:${String(Math.max(0,Math.ceil(state.time))%60).padStart(2,'0')}`;levelEl.textContent=`第${state.wave}波 · Lv.${p.level}`;if(state.phase==='playing')status.textContent=`第 ${state.wave} 波 · 敌人 ${state.bots.length}`; } if(socket.readyState===1)socket.send(JSON.stringify({type:'input',...input})); fireMode.textContent=autoMode?`自动发射 · ${autoFire?'开火中':'待机'}（右键切换）`:'手动发射（右键切换）';requestAnimationFrame(frame); }
requestAnimationFrame(frame);
