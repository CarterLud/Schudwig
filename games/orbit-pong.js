(() => {
  'use strict';

  // Canvas setup with DPR scaling
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const scoreL = document.getElementById('scoreL');
  const scoreR = document.getElementById('scoreR');
  const scorebar = document.getElementById('scorebar');
  const gameRoot = document.querySelector('.game-root');
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
    if (gameRoot) gameRoot.style.paddingTop = (sbH) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // Utilities
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const sign = (n) => (n < 0 ? -1 : 1);

  // Config
  const config = {
    targetScore: 10,
    paddle: { width: 16 * DPR, height: 120 * DPR, speed: 520 * DPR },
    ball: { radius: 8 * DPR, baseSpeed: 420 * DPR, speedInc: 28 * DPR, maxSpeed: 1100 * DPR, minSpeed: 260 * DPR },
    wells: { count: 2, strength: 1.2e8, minDist: 28 * DPR, influenceRadius: 140 * DPR, fadeMs: 500, lifeMs: 6000, gapMs: 800, whiteChance: 0.5, maxAccel: 7500 * DPR },
    powerups: { max: 4, lifeMs: 15000, spawnEveryMs: 4500, radius: 28 * DPR },
    colors: {
      bg: '#000000',
      left: '#3a8dff',
      right: '#ff3a6e',
      ball: '#ffffff',
      wellCore: '#ffb84a',
      wellAura: '#ff8c1a',
      whiteCore: '#9fe8ff',
      whiteAura: '#4fd8ff'
    }
  };

  // Input
  const keys = new Set();
  window.addEventListener('keydown', (e) => { keys.add(e.key); if ([' ', 'ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S'].includes(e.key)) e.preventDefault(); });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  // Audio
  let audioCtx = null;
  function ensureAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  function beep(freq = 440, duration = 0.07, type = 'square', gain = 0.08) {
    try {
      ensureAudio();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const amp = audioCtx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(gain, t + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(amp).connect(audioCtx.destination);
      osc.start(t); osc.stop(t + duration + 0.02);
    } catch {}
  }
  function scoreChime() { beep(540, 0.09, 'triangle', 0.06); setTimeout(() => beep(720, 0.09, 'triangle', 0.06), 70); }
  let lastWhooshAt = 0; function whoosh() { const now = performance.now(); if (now - lastWhooshAt < 400) return; lastWhooshAt = now; beep(160, 0.12, 'sawtooth', 0.03); }

  // Game state
  const state = {
    running: false,
    paused: false,
    over: false,
    leftScore: 0,
    rightScore: 0,
    balls: [ { x: 0, y: 0, vx: 0, vy: 0, trail: [], flags: { fast:false, nogravity:false, curve:false }, until: { fast:0, nogravity:0, curve:0 } } ],
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
    wells: [],
    wellsPhase: 'gap', // 'fadeIn' | 'alive' | 'fadeOut' | 'gap'
    wellsAlpha: 0,
    wellsTimer: 0,
    powerups: [],
    awaitNextBall: false,
    awaitSide: null, // 'left' | 'right'
    lastBallY: 0,
    fxParticles: [],
  };

  function resetPositions(dir = (Math.random() > 0.5 ? 1 : -1)) {
    // Paddles
    state.left.x = 24 * DPR;
    state.left.y = (height - config.paddle.height) / 2;
    state.right.x = width - (24 * DPR + config.paddle.width);
    state.right.y = (height - config.paddle.height) / 2;

    // Ball
    state.balls = [ { x: width/2, y: height/2, vx: 0, vy: 0, trail: [], flags: { fast:false, nogravity:false, curve:false }, until: { fast:0, nogravity:0, curve:0 } } ];
    const angle = rand(-0.35, 0.35);
    const sp = config.ball.baseSpeed;
    state.balls[0].vx = Math.cos(angle) * sp * dir;
    state.balls[0].vy = Math.sin(angle) * sp;

    // Wells timer reset to spawn new
    state.wells = [];
    state.wellsPhase = 'gap';
    state.wellsTimer = 0;

    // Clear powerups
    state.powerups = [];
  }

  function resetPaddles() {
    state.left.x = 24 * DPR;
    state.left.y = (height - config.paddle.height) / 2;
    state.right.x = width - (24 * DPR + config.paddle.width);
    state.right.y = (height - config.paddle.height) / 2;
  }

  function start() {
    state.running = true; state.over = false; state.leftScore = 0; state.rightScore = 0; resetPositions(sign(Math.random()-0.5));
  }

  function point(scoredRight, lastY) {
    if (scoredRight) state.rightScore++; else state.leftScore++;
    scoreL.textContent = state.leftScore;
    scoreR.textContent = state.rightScore;
    scoreChime();
    if (state.leftScore >= config.targetScore || state.rightScore >= config.targetScore) {
      state.over = true; state.running = false; return;
    }
    state.balls = [];
    state.awaitNextBall = true;
    state.awaitSide = scoredRight ? 'left' : 'right';
    state.lastBallY = typeof lastY === 'number' ? lastY : height / 2;
    spawnFireworks(state.awaitSide, state.lastBallY);
    hud.textContent = 'Point! Press Space for next serve';
  }

  // Stars background
  const stars = Array.from({ length: 140 }, () => ({
    x: Math.random(), y: Math.random(), s: Math.random()*1.2 + 0.2, p: Math.random()*Math.PI*2
  }));

  function drawStars(t) {
    ctx.save();
    ctx.fillStyle = config.colors.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'screen';
    for (const st of stars) {
      const tw = (Math.sin(t*0.001 + st.p) * 0.5 + 0.5) * 0.8 + 0.2;
      ctx.fillStyle = `rgba(180,200,255,${0.2 + tw*0.6})`;
      const sx = st.x * width, sy = st.y * height;
      ctx.beginPath(); ctx.arc(sx, sy, st.s * DPR, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCenterNet() {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,230,255,0.25)';
    ctx.lineWidth = 4 * DPR; ctx.setLineDash([12 * DPR, 16 * DPR]);
    ctx.beginPath(); ctx.moveTo(width/2, 0); ctx.lineTo(width/2, height); ctx.stroke();
    ctx.restore();
  }

  function drawWells(t) {
    ctx.save();
    for (const w of state.wells) {
      const pulse = (Math.sin(t*0.005 + w.x*0.001) * 0.5 + 0.5);
      const auraR = (w.R || config.wells.influenceRadius) * (0.98 + pulse * 0.02);
      ctx.globalAlpha = state.wellsAlpha;
      const isWhite = w.type === 'white';
      ctx.shadowColor = isWhite ? config.colors.whiteAura : config.colors.wellAura; ctx.shadowBlur = 28 * DPR;
      ctx.beginPath(); ctx.arc(w.x, w.y, auraR, 0, Math.PI*2);
      ctx.strokeStyle = isWhite ? 'rgba(79, 216, 255, 0.28)' : 'rgba(255, 140, 26, 0.28)'; ctx.lineWidth = 10 * DPR; ctx.stroke();
      ctx.globalAlpha = state.wellsAlpha;
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(w.x, w.y, (w.r || 12 * DPR) * (1.4 + pulse*0.2), 0, Math.PI*2);
      ctx.fillStyle = isWhite ? 'rgba(159, 232, 255, 0.95)' : 'rgba(255, 184, 74, 0.95)'; ctx.fill();
      ctx.globalAlpha = state.wellsAlpha * 0.12;
      ctx.beginPath(); ctx.arc(w.x, w.y, auraR * 0.7, 0, Math.PI*2);
      ctx.fillStyle = isWhite ? 'rgba(79, 216, 255, 0.6)' : 'rgba(255, 184, 74, 0.6)'; ctx.fill();
      // center mark for orientation
      ctx.globalAlpha = state.wellsAlpha;
      ctx.fillStyle = isWhite ? '#dff8ff' : '#ffcf8a';
      ctx.beginPath(); ctx.arc(w.x, w.y, 2.5 * DPR, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPaddles() {
    ctx.save();
    ctx.shadowBlur = 22 * DPR; ctx.shadowColor = config.colors.left;
    ctx.fillStyle = config.colors.left;
    ctx.fillRect(state.left.x, state.left.y, config.paddle.width, config.paddle.height);
    ctx.shadowColor = config.colors.right;
    ctx.fillStyle = config.colors.right;
    ctx.fillRect(state.right.x, state.right.y, config.paddle.width, config.paddle.height);
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    // Trail
    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.balls) {
      for (let i = 0; i < b.trail.length; i++) {
        const p = b.trail[i];
        const a = (i+1) / b.trail.length;
        ctx.fillStyle = `rgba(255,255,255,${a*0.14})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, config.ball.radius * (0.7 + a*0.3), 0, Math.PI*2); ctx.fill();
      }
    }
    // Balls
    for (const b of state.balls) {
      ctx.shadowBlur = 18 * DPR; ctx.shadowColor = '#ffffff';
      ctx.fillStyle = config.colors.ball;
      ctx.beginPath(); ctx.arc(b.x, b.y, config.ball.radius, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawScoreAndUI() {
    hud.textContent = state.over ? 'Game Over — Press Space to Restart' : '';
  }

  function applyGravityForBall(b) {
    if (b.flags.nogravity) return { ax: 0, ay: 0, maxForce: 0 };
    let ax = 0, ay = 0, aMagMax = 0;
    for (const w of state.wells) {
      const dx = w.x - b.x; const dy = w.y - b.y;
      const dist2 = dx*dx + dy*dy;
      const dist = Math.sqrt(dist2);
      const R = w.R || config.wells.influenceRadius || 0;
      if (dist > R) continue;
      const invR = dist > 0 ? 1 / dist : 0;
      const soft2 = config.wells.minDist * config.wells.minDist;
      let force = (config.wells.strength * (w.alpha ?? 1)) / (dist2 + soft2);
      // White holes repel, stronger closer to center (scale by (R/dist))
      if (w.type === 'white') {
        const proximity = Math.min(4, Math.max(1, R / Math.max(dist, 1)));
        force *= proximity; // increases as dist shrinks
        ax -= dx * invR * force; ay -= dy * invR * force; // repel
      } else { // black hole attract
        ax += dx * invR * force; ay += dy * invR * force; // attract
      }
      aMagMax = Math.max(aMagMax, force);
    }
    // Clamp total acceleration to avoid trapping/spin
    const aMag = Math.hypot(ax, ay);
    const maxA = config.wells.maxAccel || Infinity;
    if (aMag > maxA) { const s = maxA / aMag; ax *= s; ay *= s; }
    if (aMagMax > 4000) whoosh();
    return { ax, ay, maxForce: aMagMax };
  }

  function collidePaddles(b) {
    // Left
    if (b.vx < 0 && b.x - config.ball.radius <= state.left.x + config.paddle.width && b.y + config.ball.radius >= state.left.y && b.y - config.ball.radius <= state.left.y + config.paddle.height) {
      b.x = state.left.x + config.paddle.width + config.ball.radius;
      const inc = b.flags.fast ? config.ball.speedInc * 1.5 : config.ball.speedInc;
      b.vx = Math.min(Math.abs(b.vx) + inc, config.ball.maxSpeed) * 1;
      const offset = (b.y - (state.left.y + config.paddle.height/2)) / (config.paddle.height/2);
      b.vy += offset * (b.flags.curve ? 240 : 140) * DPR;
      beep(420, 0.06, 'square', 0.05);
    }
    // Right
    if (b.vx > 0 && b.x + config.ball.radius >= state.right.x && b.y + config.ball.radius >= state.right.y && b.y - config.ball.radius <= state.right.y + config.paddle.height) {
      b.x = state.right.x - config.ball.radius;
      const inc = b.flags.fast ? config.ball.speedInc * 1.5 : config.ball.speedInc;
      b.vx = -Math.min(Math.abs(b.vx) + inc, config.ball.maxSpeed);
      const offset = (b.y - (state.right.y + config.paddle.height/2)) / (config.paddle.height/2);
      b.vy += offset * (b.flags.curve ? 240 : 140) * DPR;
      beep(460, 0.06, 'square', 0.05);
    }
  }

  // Wells lifecycle and randomization
  function randomWells() {
    state.wells = [];
    const count = clamp(config.wells.count, 1, 3);
    for (let i = 0; i < count; i++) {
      const marginX = 0.2 * width, marginY = 0.15 * height;
      const x = rand(marginX, width - marginX);
      const y = rand(marginY, height - marginY);
      const type = Math.random() < (config.wells.whiteChance || 0) ? 'white' : 'black';
      state.wells.push({ x, y, r: 12 * DPR, R: config.wells.influenceRadius, alpha: 0, type });
    }
  }

  function updateWells(dt) {
    state.wellsTimer += dt * 1000;
    const { fadeMs, lifeMs, gapMs } = config.wells;
    if (state.wellsPhase === 'gap') {
      if (state.wellsTimer >= gapMs) {
        randomWells();
        state.wellsPhase = 'fadeIn';
        state.wellsTimer = 0;
      }
    } else if (state.wellsPhase === 'fadeIn') {
      const a = Math.min(1, state.wellsTimer / fadeMs);
      state.wellsAlpha = a; state.wells.forEach(w => w.alpha = a);
      if (a >= 1) { state.wellsPhase = 'alive'; state.wellsTimer = 0; }
    } else if (state.wellsPhase === 'alive') {
      if (state.wellsTimer >= lifeMs) { state.wellsPhase = 'fadeOut'; state.wellsTimer = 0; }
    } else if (state.wellsPhase === 'fadeOut') {
      const a = 1 - Math.min(1, state.wellsTimer / fadeMs);
      state.wellsAlpha = a; state.wells.forEach(w => w.alpha = a);
      if (a <= 0) { state.wellsPhase = 'gap'; state.wellsTimer = 0; state.wells = []; }
    }
  }

  // Powerups
  const PU_TYPES = ['split', 'fast', 'nogravity', 'curve'];
  function spawnPowerup() {
    if (state.powerups.length >= config.powerups.max) return;
    const pad = 40 * DPR;
    const x = rand(pad, width - pad);
    const y = rand(pad, height - pad);
    const type = PU_TYPES[(Math.random() * PU_TYPES.length) | 0];
    const expiresAt = performance.now() + config.powerups.lifeMs;
    state.powerups.push({ x, y, r: config.powerups.radius, type, expiresAt });
  }

  function drawPowerups(now) {
    ctx.save();
    for (const p of state.powerups) {
      const ttl = p.expiresAt - now;
      const a = clamp(ttl / config.powerups.lifeMs, 0, 1);
      ctx.globalAlpha = 0.5 + 0.5 * a;
      ctx.shadowBlur = 14 * DPR; ctx.shadowColor = '#7cffd9';
      ctx.fillStyle = '#7cffd9';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.fillStyle = '#001f1a';
      ctx.font = `${12*DPR}px Inter, ui-sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = p.type === 'split' ? 'S' : p.type === 'fast' ? 'F' : p.type === 'nogravity' ? 'N' : 'C';
      ctx.fillText(label, p.x, p.y + 1*DPR);
    }
    ctx.restore();
  }

  function applyPowerupToBall(b, p) {
    if (p.type === 'split') {
      if (state.balls.length < 4) {
        const nb = { x: b.x, y: b.y, vx: -b.vx, vy: -b.vy, trail: [], flags: { ...b.flags }, until: { ...b.until } };
        state.balls.push(nb);
      }
    } else if (p.type === 'fast') {
      b.flags.fast = true; b.until.fast = performance.now() + 8000;
      const speedUp = 1.25; b.vx *= speedUp; b.vy *= speedUp;
    } else if (p.type === 'nogravity') {
      b.flags.nogravity = true; b.until.nogravity = performance.now() + 8000;
    } else if (p.type === 'curve') {
      b.flags.curve = true; b.until.curve = performance.now() + 8000;
    }
    beep(520, 0.08, 'triangle', 0.05);
  }

  function updatePowerups(now, dt) {
    // Expire
    state.powerups = state.powerups.filter(p => p.expiresAt > now);
    // Spawn timer
    if (!updatePowerups.next) updatePowerups.next = now + config.powerups.spawnEveryMs;
    if (now >= updatePowerups.next) { spawnPowerup(); updatePowerups.next = now + config.powerups.spawnEveryMs; }
    // Collisions
    for (const b of state.balls) {
      for (let i = state.powerups.length - 1; i >= 0; i--) {
        const p = state.powerups[i];
        const dx = b.x - p.x, dy = b.y - p.y;
        const d2 = dx*dx + dy*dy;
        if (d2 <= (config.ball.radius + p.r) * (config.ball.radius + p.r)) {
          applyPowerupToBall(b, p);
          state.powerups.splice(i, 1);
        }
      }
    }
    // Clear expired flags
    for (const b of state.balls) {
      const n = performance.now();
      if (b.flags.fast && n > b.until.fast) b.flags.fast = false;
      if (b.flags.nogravity && n > b.until.nogravity) b.flags.nogravity = false;
      if (b.flags.curve && n > b.until.curve) b.flags.curve = false;
    }
  }

  function spawnFireworks(side, y) {
    const x = side === 'left' ? 20 * DPR : width - 20 * DPR;
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 220 + 80) * DPR;
      state.fxParticles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 700 + Math.random() * 400, born: performance.now(),
        color: side === 'left' ? '#3a8dff' : '#ff3a6e'
      });
    }
  }

  function updateFireworks(now, dt) {
    const gravity = 420 * DPR;
    for (const p of state.fxParticles) {
      const age = now - p.born;
      p.vy += gravity * dt * 0.15;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.dead = age > p.life;
    }
    state.fxParticles = state.fxParticles.filter(p => !p.dead);
  }

  function drawFireworks(now) {
    ctx.save();
    for (const p of state.fxParticles) {
      const age = now - p.born;
      const a = Math.max(0, 1 - age / p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * DPR, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const rawDt = Math.min(32, now - last); // ms
    last = now;
    const dt = rawDt / 1000; // s

    // Update
    if (state.running && !state.over) {
      // Paddles
      const pspd = config.paddle.speed * dt;
      if (keys.has('w') || keys.has('W')) state.left.y -= pspd;
      if (keys.has('s') || keys.has('S')) state.left.y += pspd;
      if (keys.has('ArrowUp')) state.right.y -= pspd;
      if (keys.has('ArrowDown')) state.right.y += pspd;
      state.left.y = clamp(state.left.y, 0, height - config.paddle.height);
      state.right.y = clamp(state.right.y, 0, height - config.paddle.height);

      // Wells lifecycle
      updateWells(dt);

      // Balls gravity + motion
      for (const b of state.balls) {
        const g = applyGravityForBall(b);
        b.vx += g.ax * dt; b.vy += g.ay * dt;
        const spd = Math.hypot(b.vx, b.vy);
        const cap = b.flags.fast ? config.ball.maxSpeed * 1.15 : config.ball.maxSpeed;
        if (spd > cap) { const s = cap / spd; b.vx *= s; b.vy *= s; }
        // enforce min speed
        const minS = config.ball.minSpeed || 0;
        if (spd < minS) {
          const s = (spd === 0 ? 1 : minS / spd);
          if (spd === 0) {
            // nudge in a random direction
            const th = rand(-0.5, 0.5);
            b.vx = Math.cos(th) * minS; b.vy = Math.sin(th) * minS;
          } else {
            b.vx *= s; b.vy *= s;
          }
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
      }

      // Walls
      for (const b of state.balls) {
        if (b.y - config.ball.radius < 0) { b.y = config.ball.radius; b.vy = Math.abs(b.vy); beep(320, 0.04, 'triangle', 0.03); }
        if (b.y + config.ball.radius > height) { b.y = height - config.ball.radius; b.vy = -Math.abs(b.vy); beep(320, 0.04, 'triangle', 0.03); }
      }

      // Paddles
      for (const b of state.balls) collidePaddles(b);

      // Scoring
      for (const b of [...state.balls]) {
        if (b.x + config.ball.radius < 0) { point(true, b.y); break; }
        else if (b.x - config.ball.radius > width) { point(false, b.y); break; }
      }

      // Trail
      for (const b of state.balls) {
        b.trail.unshift({ x: b.x, y: b.y });
        if (b.trail.length > 16) b.trail.pop();
      }

      // Powerups
      updatePowerups(now, dt);
    }

    // Draw
    drawStars(now);
    drawCenterNet();
    drawWells(now);
    drawPaddles();
    drawBall();
    drawPowerups(now);
    updateFireworks(now, dt);
    drawFireworks(now);
    drawScoreAndUI();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // Modal and controls
  document.body.style.overflow = 'hidden';
  function serveNextBall() {
    // Serve towards the side that conceded
    const dir = state.awaitSide === 'left' ? -1 : 1;
    resetPaddles();
    state.awaitNextBall = false;
    state.awaitSide = null;
    const angle = rand(-0.35, 0.35);
    const sp = config.ball.baseSpeed;
    state.balls = [ { x: width/2, y: state.lastBallY, vx: Math.cos(angle) * sp * dir, vy: Math.sin(angle) * sp, trail: [], flags: { fast:false, nogravity:false, curve:false }, until: { fast:0, nogravity:0, curve:0 } } ];
    hud.textContent = '';
  }
  function beginGame() {
    infoModal.style.display = 'none';
    document.body.style.overflow = 'hidden';
    ensureAudio();
    state.running = true; state.over = false; state.leftScore = 0; state.rightScore = 0;
    resetPaddles();
    // First serve: random direction from center
    const dir = sign(Math.random()-0.5);
    const angle = rand(-0.35, 0.35);
    const sp = config.ball.baseSpeed;
    state.balls = [ { x: width/2, y: height/2, vx: Math.cos(angle) * sp * dir, vy: Math.sin(angle) * sp, trail: [], flags: { fast:false, nogravity:false, curve:false }, until: { fast:0, nogravity:0, curve:0 } } ];
  }
  startBtn.addEventListener('click', beginGame);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      if (!state.running || state.over) { beginGame(); }
      else if (state.awaitNextBall) { serveNextBall(); }
    }
  });
})();


