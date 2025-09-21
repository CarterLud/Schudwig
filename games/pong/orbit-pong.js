(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const scoreL = document.getElementById('scoreL');
  const scoreR = document.getElementById('scoreR');
  const scorebar = document.getElementById('scorebar');
  const infoModal = document.getElementById('infoModal');
  const startBtn = document.getElementById('startBtn');

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let width = 0, height = 0, headerH = 0;
  function resize() {
    const header = document.querySelector('.site-header');
    headerH = header ? header.getBoundingClientRect().height : 0;
    const cssW = window.innerWidth;
    const sbH = scorebar ? scorebar.getBoundingClientRect().height : 0;
    const cssH = window.innerHeight - headerH - sbH;
    width = Math.max(640, Math.floor(cssW * DPR));
    height = Math.max(360, Math.floor(cssH * DPR));
    canvas.width = width; canvas.height = height;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
  window.addEventListener('resize', resize); resize();

  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const sign = (n) => (n < 0 ? -1 : 1);

  // Audio (lightweight beeps)
  let audioCtx = null; const ensureAudio = () => { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); };
  function beep(freq = 440, duration = 0.06, type = 'square', gain = 0.06) {
    try { ensureAudio(); const t = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = gain; o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t+duration); } catch {}
  }
  function chime() { beep(580,0.08,'triangle',0.05); setTimeout(()=>beep(760,0.08,'triangle',0.05),70); }

  // Config
  const config = {
    targetScore: 10,
    paddle: { w: 16*DPR, h: 120*DPR, speed: 520*DPR },
    ball: { r: 8*DPR, base: 420*DPR, inc: 28*DPR, max: 1100*DPR, min: 260*DPR },
    wells: { count: 2, R: 140*DPR, minDist: 28*DPR, strength: 1.2e8, fade: 500, life: 6000, gap: 800, whiteChance: 0.5, maxAccel: 7500*DPR },
    colors: { left:'#3a8dff', right:'#ff3a6e', ball:'#ffffff', blackCore:'#ffb84a', blackAura:'#ff8c1a', whiteCore:'#9fe8ff', whiteAura:'#4fd8ff' }
  };

  // State
  const state = {
    running:false, over:false,
    leftScore:0, rightScore:0,
    left:{ x:0, y:0 }, right:{ x:0, y:0 },
    balls: [],
    wells: [], wellsAlpha:0, wellsPhase:'gap', wellsTimer:0,
    awaitNext:false, awaitSide:null, lastBallY:0,
    fx: [],
  };

  function resetPaddles() {
    state.left.x = 24*DPR; state.left.y = (height - config.paddle.h)/2;
    state.right.x = width - (24*DPR + config.paddle.w); state.right.y = (height - config.paddle.h)/2;
  }

  function serve(dir, y) {
    const angle = rand(-0.35, 0.35);
    const sp = config.ball.base;
    state.balls = [ { x: width/2, y: (y ?? height/2), vx: Math.cos(angle)*sp*dir, vy: Math.sin(angle)*sp, trail: [] } ];
  }

  function startMatch() {
    state.running = true; state.over = false; state.leftScore = 0; state.rightScore = 0;
    scoreL.textContent = '0'; scoreR.textContent = '0';
    resetPaddles();
    state.wells = []; state.wellsPhase = 'gap'; state.wellsTimer = 0; state.wellsAlpha = 0;
    state.fx.length = 0; state.awaitNext = false; state.awaitSide = null;
    serve(sign(Math.random()-0.5));
  }

  function point(scoredRight, lastY) {
    if (scoredRight) state.rightScore++; else state.leftScore++;
    scoreL.textContent = state.leftScore; scoreR.textContent = state.rightScore; chime();
    if (state.leftScore >= config.targetScore || state.rightScore >= config.targetScore) { state.over = true; state.running = false; hud.textContent = 'Game Over — Press Space'; return; }
    // fireworks + await next serve
    state.balls = [];
    state.awaitNext = true; state.awaitSide = scoredRight ? 'left' : 'right'; state.lastBallY = lastY ?? height/2;
    spawnFireworks(state.awaitSide, state.lastBallY);
    hud.textContent = 'Point! Press Space for next serve';
  }

  // Wells lifecycle
  function randomWells() {
    state.wells = [];
    const count = clamp(config.wells.count,1,3);
    for (let i=0;i<count;i++) {
      const x = rand(width*0.2, width*0.8); const y = rand(height*0.25, height*0.75);
      const type = Math.random()<config.wells.whiteChance ? 'white':'black';
      state.wells.push({ x, y, r: 12*DPR, R: config.wells.R, alpha:0, type });
    }
  }
  function updateWells(dt) {
    state.wellsTimer += dt;
    const { fade, life, gap } = config.wells;
    if (state.wellsPhase==='gap') { if (state.wellsTimer>=gap) { randomWells(); state.wellsPhase='fadeIn'; state.wellsTimer=0; } }
    else if (state.wellsPhase==='fadeIn') { const a = Math.min(1, state.wellsTimer/fade); state.wellsAlpha=a; state.wells.forEach(w=>w.alpha=a); if (a>=1){ state.wellsPhase='alive'; state.wellsTimer=0; } }
    else if (state.wellsPhase==='alive') { if (state.wellsTimer>=life) { state.wellsPhase='fadeOut'; state.wellsTimer=0; } }
    else if (state.wellsPhase==='fadeOut') { const a = 1 - Math.min(1, state.wellsTimer/fade); state.wellsAlpha=a; state.wells.forEach(w=>w.alpha=a); if (a<=0){ state.wellsPhase='gap'; state.wellsTimer=0; state.wells=[]; } }
  }

  function drawWells(t) {
    ctx.save();
    for (const w of state.wells) {
      const pulse = (Math.sin(t*0.005 + w.x*0.001)*0.5+0.5);
      const auraR = (w.R||config.wells.R)*(0.98 + pulse*0.02);
      const isWhite = w.type==='white';
      ctx.globalAlpha = state.wellsAlpha;
      ctx.shadowColor = isWhite ? config.colors.whiteAura : config.colors.blackAura; ctx.shadowBlur = 28*DPR;
      ctx.beginPath(); ctx.arc(w.x,w.y,auraR,0,Math.PI*2); ctx.strokeStyle = isWhite ? 'rgba(79,216,255,0.28)' : 'rgba(255,140,26,0.28)'; ctx.lineWidth=10*DPR; ctx.stroke();
      ctx.globalAlpha = state.wellsAlpha; ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(w.x,w.y,(w.r||12*DPR)*(1.4+pulse*0.2),0,Math.PI*2); ctx.fillStyle = isWhite ? 'rgba(159,232,255,0.95)' : 'rgba(255,184,74,0.95)'; ctx.fill();
      ctx.globalAlpha = state.wellsAlpha*0.12; ctx.beginPath(); ctx.arc(w.x,w.y,auraR*0.7,0,Math.PI*2); ctx.fillStyle = isWhite ? 'rgba(79,216,255,0.6)' : 'rgba(255,184,74,0.6)'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function applyWellAccel(b) {
    if (!state.wells.length) return {ax:0,ay:0};
    let ax=0, ay=0;
    for (const w of state.wells) {
      const dx = w.x - b.x, dy = w.y - b.y; const dist2 = dx*dx + dy*dy; const dist = Math.sqrt(dist2);
      const R = w.R || config.wells.R; if (dist>R) continue; const inv = dist>0 ? 1/dist : 0;
      const soft2 = config.wells.minDist * config.wells.minDist; let force = (config.wells.strength * (w.alpha??1)) / (dist2 + soft2);
      if (w.type==='white') { const proximity = Math.min(4, Math.max(1, R/Math.max(dist,1))); force *= proximity; ax -= dx*inv*force; ay -= dy*inv*force; }
      else { ax += dx*inv*force; ay += dy*inv*force; }
    }
    const mag = Math.hypot(ax,ay), maxA = config.wells.maxAccel; if (mag>maxA){ const s = maxA/mag; ax*=s; ay*=s; }
    return {ax,ay};
  }

  function collidePaddles(b) {
    // left
    if (b.vx<0 && b.x - config.ball.r <= state.left.x + config.paddle.w && b.y + config.ball.r >= state.left.y && b.y - config.ball.r <= state.left.y + config.paddle.h) {
      b.x = state.left.x + config.paddle.w + config.ball.r; b.vx = Math.abs(b.vx) + config.ball.inc; const offset=(b.y-(state.left.y+config.paddle.h/2))/(config.paddle.h/2); b.vy += offset*160*DPR; beep(420,0.06,'square',0.05);
    }
    // right
    if (b.vx>0 && b.x + config.ball.r >= state.right.x && b.y + config.ball.r >= state.right.y && b.y - config.ball.r <= state.right.y + config.paddle.h) {
      b.x = state.right.x - config.ball.r; b.vx = -Math.abs(b.vx) - config.ball.inc; const offset=(b.y-(state.right.y+config.paddle.h/2))/(config.paddle.h/2); b.vy += offset*160*DPR; beep(460,0.06,'square',0.05);
    }
  }

  function spawnFireworks(side,y){ const x = side==='left'? 20*DPR : width-20*DPR; for(let i=0;i<70;i++){ const a=Math.random()*Math.PI*2; const s=(Math.random()*200+80)*DPR; state.fx.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:600+Math.random()*400,born:performance.now(),color: side==='left'?config.colors.left:config.colors.right}); } }
  function updateFX(dt,now){ const g=420*DPR; for(const p of state.fx){ p.vy += g*dt*0.00015; p.x += p.vx*dt*0.001; p.y += p.vy*dt*0.001; p.dead = (now-p.born)>p.life; } state.fx = state.fx.filter(p=>!p.dead); }
  function drawFX(now){ ctx.save(); for(const p of state.fx){ const a = Math.max(0,1-(now-p.born)/p.life); ctx.globalAlpha=a; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,2.2*DPR,0,Math.PI*2); ctx.fill(); } ctx.restore(); }

  let keys = new Set(); window.addEventListener('keydown',(e)=>{ keys.add(e.key); if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) e.preventDefault(); }); window.addEventListener('keyup',(e)=>keys.delete(e.key));

  let last = performance.now();
  function frame(now){ const dt = Math.min(32, now-last); last = now; if (state.running) {
      // paddles
      const sp = config.paddle.speed * (dt/1000);
      if (keys.has('w')||keys.has('W')) state.left.y -= sp;
      if (keys.has('s')||keys.has('S')) state.left.y += sp;
      if (keys.has('ArrowUp')) state.right.y -= sp;
      if (keys.has('ArrowDown')) state.right.y += sp;
      state.left.y = clamp(state.left.y, 0, height-config.paddle.h); state.right.y = clamp(state.right.y, 0, height-config.paddle.h);

      // wells
      updateWells(dt);

      // balls
      for (const b of state.balls) {
        const a = applyWellAccel(b); b.vx += a.ax*(dt/1000); b.vy += a.ay*(dt/1000);
        // clamp/max
        let spd = Math.hypot(b.vx,b.vy); if (spd>config.ball.max){ const s=config.ball.max/spd; b.vx*=s; b.vy*=s; }
        // min speed
        spd = Math.hypot(b.vx,b.vy); if (spd<config.ball.min){ if (spd===0){ const th=rand(-0.5,0.5); b.vx=Math.cos(th)*config.ball.min; b.vy=Math.sin(th)*config.ball.min; } else { const s=config.ball.min/spd; b.vx*=s; b.vy*=s; } }
        b.x += b.vx*(dt/1000); b.y += b.vy*(dt/1000);
      }

      // walls
      for (const b of state.balls) {
        if (b.y - config.ball.r < 0) { b.y = config.ball.r; b.vy = Math.abs(b.vy); beep(320,0.04,'triangle',0.03); }
        if (b.y + config.ball.r > height) { b.y = height - config.ball.r; b.vy = -Math.abs(b.vy); beep(320,0.04,'triangle',0.03); }
      }

      // paddles
      for (const b of state.balls) collidePaddles(b);

      // scoring
      for (const b of [...state.balls]) { if (b.x + config.ball.r < 0) { point(true, b.y); break; } else if (b.x - config.ball.r > width) { point(false, b.y); break; } }
    }

    // draw
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,width,height);
    // net
    ctx.save(); ctx.strokeStyle='rgba(220,230,255,0.25)'; ctx.setLineDash([12*DPR,16*DPR]); ctx.lineWidth=4*DPR; ctx.beginPath(); ctx.moveTo(width/2,0); ctx.lineTo(width/2,height); ctx.stroke(); ctx.restore();
    drawWells(now);
    // paddles
    ctx.save(); ctx.shadowBlur=22*DPR; ctx.shadowColor=config.colors.left; ctx.fillStyle=config.colors.left; ctx.fillRect(state.left.x,state.left.y,config.paddle.w,config.paddle.h); ctx.shadowColor=config.colors.right; ctx.fillStyle=config.colors.right; ctx.fillRect(state.right.x,state.right.y,config.paddle.w,config.paddle.h); ctx.restore();
    // balls + trails
    ctx.save(); ctx.globalCompositeOperation='lighter'; for(const b of state.balls){ b.trail.unshift({x:b.x,y:b.y}); if (b.trail.length>16) b.trail.pop(); for(let i=0;i<b.trail.length;i++){ const p=b.trail[i]; const a=(i+1)/b.trail.length; ctx.fillStyle=`rgba(255,255,255,${a*0.14})`; ctx.beginPath(); ctx.arc(p.x,p.y,config.ball.r*(0.7+a*0.3),0,Math.PI*2); ctx.fill(); } ctx.shadowBlur=18*DPR; ctx.shadowColor='#fff'; ctx.fillStyle=config.colors.ball; ctx.beginPath(); ctx.arc(b.x,b.y,config.ball.r,0,Math.PI*2); ctx.fill(); } ctx.restore();
    drawFX(now);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function beginGame(){ infoModal.style.display='none'; ensureAudio(); startMatch(); hud.textContent=''; }
  function serveNext(){ if (!state.awaitNext) return; const dir = state.awaitSide==='left' ? -1 : 1; resetPaddles(); state.awaitNext=false; serve(dir, state.lastBallY); hud.textContent=''; }
  startBtn.addEventListener('click', beginGame);
  window.addEventListener('keydown',(e)=>{ if (e.key===' ') { if (!state.running || state.over){ beginGame(); } else if (state.awaitNext){ serveNext(); } } });
})();


