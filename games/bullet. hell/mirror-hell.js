(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const hud = document.getElementById('hud');
  const infoModal = document.getElementById('infoModal');
  const startBtn = document.getElementById('startBtn');

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let width = 0, height = 0, headerH = 0, sbH = 0;
  function resize() {
    const header = document.querySelector('.site-header');
    const scorebar = document.getElementById('scorebar');
    headerH = header ? header.getBoundingClientRect().height : 0;
    sbH = scorebar ? scorebar.getBoundingClientRect().height : 0;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight - headerH - sbH;
    width = Math.floor(cssW * DPR);
    height = Math.floor(cssH * DPR);
    canvas.width = width; canvas.height = height;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
  window.addEventListener('resize', resize); resize();

  // Audio
  let audioCtx; const ensureAudio = () => { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); };
  function blip(freq = 660, dur = 0.05, type = 'square', gain = 0.06) {
    try { ensureAudio(); const t = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); g.gain.value = gain; o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t+dur); } catch {}
  }

  // Input
  const keys = new Set();
  window.addEventListener('keydown', e => { keys.add(e.key); if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w','a','s','d','W','A','S','D','j','J'].includes(e.key)) e.preventDefault(); });
  window.addEventListener('keyup', e => keys.delete(e.key));

  // Game state
  const state = {
    running: false,
    score: 0,
    lives: 3,
    time: 0,
    ships: { x: 0, yTop: 0, yBot: 0, speed: 420 * DPR },
    bullets: [], // player
    enemyBullets: [],
    enemies: [],
    wave: 0,
    nextEnemyAt: 0,
    nextPlayerShotAt: 0,
  };

  function reset() {
    state.score = 0; state.lives = 3; state.time = 0; state.wave = 0;
    state.enemies.length = 0; state.enemyBullets.length = 0; state.bullets.length = 0;
    state.ships.x = width/2; state.ships.yTop = height*0.25; state.ships.yBot = height*0.75;
    scoreEl.textContent = '000000';
    renderLives();
  }

  function renderLives() {
    livesEl.innerHTML = '';
    for (let i=0;i<state.lives;i++) { const d = document.createElement('div'); d.className='life'; livesEl.appendChild(d); }
  }

  function addScore(n) {
    state.score += n; scoreEl.textContent = String(state.score).padStart(6,'0');
  }

  function spawnEnemy(type = 'fan') {
    const x = Math.random()* (width*0.8) + width*0.1;
    const y = height/2;
    const hp = 3;
    state.enemies.push({ x, y, hp, t:0, type });
    blip(220,0.07,'sawtooth',0.05);
  }

  function shootPlayer() {
    const now = state.time;
    if (now < state.nextPlayerShotAt) return;
    state.nextPlayerShotAt = now + 120; // ms
    const speed = 800 * DPR;
    // two shots (top and mirrored bottom)
    state.bullets.push({ x: state.ships.x, y: state.ships.yTop, vx: 0, vy: -speed, color:'#7cffd9' });
    state.bullets.push({ x: state.ships.x, y: state.ships.yBot, vx: 0, vy: speed, color:'#ff9fd6' });
    blip(880,0.04,'square',0.06);
  }

  function enemyFire(enemy) {
    // simple fan spread and ring combo
    const base = Math.random() < 0.5 ? 'fan' : 'ring';
    const shots = base==='fan'? 8 : 16;
    const speed = base==='fan'? 240*DPR : 180*DPR;
    for (let i=0;i<shots;i++) {
      const a = base==='fan' ? (-Math.PI/3 + i*(Math.PI*2/ (shots*3))) : (i*(Math.PI*2/shots));
      const vx = Math.cos(a)*speed; const vy = Math.sin(a)*speed;
      // mirror across center by duplicating with -vy
      state.enemyBullets.push({ x: enemy.x, y: enemy.y, vx, vy, color:'#ffcf6a' });
      state.enemyBullets.push({ x: enemy.x, y: enemy.y, vx, vy: -vy, color:'#6ac7ff' });
    }
    blip(320,0.06,'triangle',0.05);
  }

  function updateEnemies(dt) {
    for (const e of state.enemies) {
      e.t += dt;
      // idle float
      e.x += Math.sin(e.t*0.001)*0.2*DPR;
      if (e.t % 1200 < dt) enemyFire(e);
    }
    // spawn waves
    if (state.time >= state.nextEnemyAt) {
      state.wave++;
      const count = Math.min(1 + Math.floor(state.wave/2), 4);
      for (let i=0;i<count;i++) spawnEnemy();
      state.nextEnemyAt = state.time + Math.max(2200 - state.wave*120, 900);
    }
    // cleanup dead
    state.enemies = state.enemies.filter(e => e.hp>0);
  }

  function collide(a,b,r=8*DPR) { const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy <= r*r; }

  function update(dt) {
    state.time += dt;
    // input movement (mirrored vertically)
    const sp = state.ships.speed * (dt/1000);
    const left = keys.has('ArrowLeft')||keys.has('a')||keys.has('A');
    const right= keys.has('ArrowRight')||keys.has('d')||keys.has('D');
    const up   = keys.has('ArrowUp')||keys.has('w')||keys.has('W');
    const down = keys.has('ArrowDown')||keys.has('s')||keys.has('S');
    if (left) state.ships.x -= sp;
    if (right) state.ships.x += sp;
    if (up) { state.ships.yTop -= sp; state.ships.yBot += sp; }
    if (down) { state.ships.yTop += sp; state.ships.yBot -= sp; }
    state.ships.x = Math.max(16*DPR, Math.min(width-16*DPR, state.ships.x));
    const padY = 20*DPR; const mid = height/2;
    state.ships.yTop = Math.max(padY, Math.min(mid-24*DPR, state.ships.yTop));
    state.ships.yBot = Math.max(mid+24*DPR, Math.min(height-padY, state.ships.yBot));

    // shooting
    if (keys.has(' ')||keys.has('j')||keys.has('J')) shootPlayer();

    // player bullets
    for (const b of state.bullets) { b.x += b.vx*(dt/1000); b.y += b.vy*(dt/1000); }
    state.bullets = state.bullets.filter(b => b.y>-40*DPR && b.y<height+40*DPR);
    // enemy bullets
    for (const eb of state.enemyBullets) { eb.x += eb.vx*(dt/1000); eb.y += eb.vy*(dt/1000); }
    state.enemyBullets = state.enemyBullets.filter(b => b.x>-40*DPR && b.x<width+40*DPR && b.y>-40*DPR && b.y<height+40*DPR);

    // collisions: player bullets vs enemies
    for (const e of state.enemies) {
      for (const b of state.bullets) {
        if (collide(e,b,14*DPR)) { e.hp--; b.dead = true; addScore(25); blip(980,0.03,'square',0.05); }
      }
    }
    state.bullets = state.bullets.filter(b=>!b.dead);

    // collisions: enemy bullets vs ships (either top or bottom position)
    for (const eb of state.enemyBullets) {
      if (collide({x:state.ships.x,y:state.ships.yTop}, eb, 12*DPR) || collide({x:state.ships.x,y:state.ships.yBot}, eb, 12*DPR)) {
        eb.dead = true; state.lives--; renderLives(); blip(140,0.08,'sawtooth',0.06);
        if (state.lives<=0) { state.running=false; hud.textContent='Game Over — Press Space'; }
      }
    }
    state.enemyBullets = state.enemyBullets.filter(b=>!b.dead);

    // enemies fire/update
    updateEnemies(dt);
  }

  function drawShip(x,y,color,flip=false) {
    ctx.save();
    ctx.translate(x,y); ctx.rotate(flip?Math.PI:0);
    ctx.shadowColor = color; ctx.shadowBlur = 14*DPR;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0,-10*DPR); ctx.lineTo(7*DPR,8*DPR); ctx.lineTo(-7*DPR,8*DPR); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0,0,width,height);
    // midline
    ctx.save(); ctx.strokeStyle='rgba(160,180,220,0.15)'; ctx.setLineDash([8*DPR,10*DPR]); ctx.beginPath(); ctx.moveTo(0,height/2); ctx.lineTo(width,height/2); ctx.stroke(); ctx.restore();
    // enemies
    for (const e of state.enemies) {
      ctx.save(); ctx.shadowColor='#ffd56a'; ctx.shadowBlur=10*DPR; ctx.fillStyle='#ffd56a'; ctx.beginPath(); ctx.arc(e.x,e.y,10*DPR,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    // bullets
    for (const b of state.bullets) { ctx.save(); ctx.fillStyle=b.color; ctx.shadowColor=b.color; ctx.shadowBlur=10*DPR; ctx.beginPath(); ctx.arc(b.x,b.y,3.5*DPR,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    for (const b of state.enemyBullets) { ctx.save(); ctx.fillStyle=b.color; ctx.shadowColor=b.color; ctx.shadowBlur=8*DPR; ctx.beginPath(); ctx.arc(b.x,b.y,3*DPR,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    // ships
    drawShip(state.ships.x, state.ships.yTop, '#7cffd9', false);
    drawShip(state.ships.x, state.ships.yBot, '#ff9fd6', true);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(32, now - last); last = now;
    if (state.running) update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function begin() {
    infoModal.style.display='none'; ensureAudio(); state.running=true; reset();
  }
  startBtn.addEventListener('click', begin);
  window.addEventListener('keydown', (e)=>{ if(e.key===' ' && !state.running) begin(); });
})();


