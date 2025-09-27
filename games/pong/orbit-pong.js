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
    paddle: { w: 16*DPR, h: 120*DPR, speed: 520*DPR, baseH: 120*DPR },
    ball: { r: 8*DPR, base: 420*DPR, inc: 28*DPR, max: 1100*DPR, min: 260*DPR },
    wells: { 
      minCount: 2, maxCount: 4, R: 140*DPR, minDist: 28*DPR, 
      strength: 6e7, fade: 500, minLife: 10000, maxLife: 20000, 
      gap: 1000, whiteChance: 0.5, maxAccel: 5000*DPR, sizeVariation: 0.25,
      minSpacing: 50*DPR // Minimum distance between wells
    },
    powerups: {
      count: 5, r: 12*DPR, speed: 120*DPR, respawnDelay: 2000,
      collisionRange: 18*DPR, // Increased collision range
      types: ['split', 'fast', 'grow', 'shrink', 'speedUp', 'slowDown']
    },
    effects: {
      paddleSize: { duration: 20000 }, // 20 seconds
      paddleSpeed: { duration: 10000, modifier: 0.3 }, // 10 seconds, ±30%
      fastBall: { duration: 15000, speedMultiplier: 1.5 }
    },
    colors: { 
      left:'#3a8dff', right:'#ff3a6e', ball:'#ffffff', 
      blackCore:'#ffb84a', blackAura:'#ff8c1a', whiteCore:'#9fe8ff', whiteAura:'#4fd8ff',
      powerups: {
        split: '#ff6b35', fast: '#f7931e', grow: '#00d4aa', 
        shrink: '#ff1744', speedUp: '#76ff03', slowDown: '#3f51b5'
      }
    }
  };

  // State
  const state = {
    running:false, over:false,
    leftScore:0, rightScore:0,
    left:{ x:0, y:0, h: config.paddle.h, speed: config.paddle.speed, effects: [] }, 
    right:{ x:0, y:0, h: config.paddle.h, speed: config.paddle.speed, effects: [] },
    balls: [],
    wells: [], wellsAlpha:0, wellsPhase:'gap', wellsTimer:0,
    powerups: [],
    awaitNext:false, awaitSide:null, lastBallY:0, lastHitter: null,
    fx: [],
  };

  function resetPaddles() {
    state.left.x = 24*DPR; state.left.y = (height - state.left.h)/2;
    state.right.x = width - (24*DPR + config.paddle.w); state.right.y = (height - state.right.h)/2;
    // Reset paddle effects
    state.left.h = config.paddle.h; state.left.speed = config.paddle.speed; state.left.effects = [];
    state.right.h = config.paddle.h; state.right.speed = config.paddle.speed; state.right.effects = [];
  }

  function serve(dir, y) {
    const angle = rand(-0.35, 0.35);
    const sp = config.ball.base;
    state.balls = [ { x: width/2, y: (y ?? height/2), vx: Math.cos(angle)*sp*dir, vy: Math.sin(angle)*sp, trail: [], color: config.colors.ball, effects: [] } ];
  }

  function startMatch() {
    state.running = true; state.over = false; state.leftScore = 0; state.rightScore = 0;
    scoreL.textContent = '0'; scoreR.textContent = '0';
    resetPaddles();
    state.wells = []; state.wellsPhase = 'gap'; state.wellsTimer = 0; state.wellsAlpha = 0;
    state.powerups = []; initializePowerups();
    state.fx.length = 0; state.awaitNext = false; state.awaitSide = null; state.lastHitter = null;
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
    console.log('Generating new wells...');
    const startTime = performance.now();
    
    state.wells = [];
    const count = Math.floor(rand(config.wells.minCount, config.wells.maxCount + 1));
    
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let x, y, validPosition = false;
      
      // Try to find a position with minimum spacing from other wells
      while (!validPosition && attempts < 50) {
        x = rand(width * 0.2, width * 0.8);
        y = rand(height * 0.25, height * 0.75);
        
        validPosition = true;
        // Check distance from existing wells
        for (const existingWell of state.wells) {
          const dx = x - existingWell.x;
          const dy = y - existingWell.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < config.wells.minSpacing) {
            validPosition = false;
            break;
          }
        }
        attempts++;
      }
      
      // If we couldn't find a valid position after 50 attempts, use the last generated position
      if (!validPosition) {
        console.warn(`Could not find valid position for well ${i} after 50 attempts`);
      }
      
      const type = Math.random() < config.wells.whiteChance ? 'white' : 'black';
      const sizeVar = 1 + rand(-config.wells.sizeVariation, config.wells.sizeVariation);
      const lifeTime = rand(config.wells.minLife, config.wells.maxLife);
      state.wells.push({ 
        x, y, r: 12*DPR*sizeVar, R: config.wells.R*sizeVar, 
        alpha: 0, type, life: lifeTime, timer: 0 
      });
    }
    
    const endTime = performance.now();
    console.log(`Wells generation took ${(endTime - startTime).toFixed(2)}ms for ${count} wells`);
  }
  function updateWells(dt) {
    state.wellsTimer += dt;
    const { fade, gap } = config.wells;
    
    if (state.wellsPhase==='gap') { 
      if (state.wellsTimer>=gap) { randomWells(); state.wellsPhase='fadeIn'; state.wellsTimer=0; } 
    }
    else if (state.wellsPhase==='fadeIn') { 
      const a = Math.min(1, state.wellsTimer/fade); 
      state.wellsAlpha=a; 
      state.wells.forEach(w=>w.alpha=a); 
      if (a>=1){ state.wellsPhase='alive'; state.wellsTimer=0; } 
    }
    else if (state.wellsPhase==='alive') { 
      // Update individual well timers
      for (const w of state.wells) {
        w.timer += dt;
        if (w.timer >= w.life) {
          w.fadeStart = true;
          w.fadeTimer = 0;
        }
      }
      // Check if all wells are fading
      if (state.wells.every(w => w.fadeStart)) {
        state.wellsPhase = 'fadeOut';
        state.wellsTimer = 0;
      }
    }
    else if (state.wellsPhase==='fadeOut') { 
      const a = 1 - Math.min(1, state.wellsTimer/fade); 
      state.wellsAlpha=a; 
      state.wells.forEach(w=>w.alpha=a); 
      if (a<=0){ 
        state.wellsPhase='gap'; 
        state.wellsTimer=0; 
        state.wells=[]; 
        // Add 1 second delay before next spawn
        setTimeout(() => {
          if (state.running && state.wellsPhase === 'gap') {
            state.wellsTimer = gap - 1000;
          }
        }, 1000);
      } 
    }
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

  // Powerup System
  function initializePowerups() {
    state.powerups = [];
    for (let i = 0; i < config.powerups.count; i++) {
      spawnPowerup();
    }
  }

  function spawnPowerup() {
    const x = rand(width * 0.15, width * 0.85);
    const y = rand(height * 0.15, height * 0.85);
    const angle = rand(0, Math.PI * 2);
    const speed = config.powerups.speed;
    const type = config.powerups.types[Math.floor(rand(0, config.powerups.types.length))];
    
    state.powerups.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      type, r: config.powerups.r, collected: false, respawnTimer: 0
    });
  }

  function updatePowerups(dt) {
    for (const p of state.powerups) {
      if (p.collected) {
        p.respawnTimer += dt;
        if (p.respawnTimer >= config.powerups.respawnDelay) {
          // Respawn powerup
          p.x = rand(width * 0.15, width * 0.85);
          p.y = rand(height * 0.15, height * 0.85);
          const angle = rand(0, Math.PI * 2);
          const speed = config.powerups.speed;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.type = config.powerups.types[Math.floor(rand(0, config.powerups.types.length))];
          p.collected = false;
          p.respawnTimer = 0;
        }
        continue;
      }

      // Apply well acceleration to powerups
      const accel = applyWellAccel(p);
      p.vx += accel.ax * (dt / 1000);
      p.vy += accel.ay * (dt / 1000);

      // Move powerup
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);

      // Bounce off walls
      if (p.x - p.r < 0 || p.x + p.r > width) {
        p.vx = -p.vx;
        p.x = clamp(p.x, p.r, width - p.r);
      }
      if (p.y - p.r < 0 || p.y + p.r > height) {
        p.vy = -p.vy;
        p.y = clamp(p.y, p.r, height - p.r);
      }
    }
  }

  function checkPowerupCollisions() {
    if (state.balls.length > 2) {
      console.time('powerup-collision-check');
    }
    
    // Ball-powerup collisions (using square collision for powerups)
    for (const ball of state.balls) {
      for (const powerup of state.powerups) {
        if (powerup.collected) continue;
        
        // Square collision detection for ball-powerup
        const halfSize = config.powerups.collisionRange / 2;
        if (ball.x + config.ball.r >= powerup.x - halfSize &&
            ball.x - config.ball.r <= powerup.x + halfSize &&
            ball.y + config.ball.r >= powerup.y - halfSize &&
            ball.y - config.ball.r <= powerup.y + halfSize) {
          // Collision detected with square powerup
          collectPowerup(powerup, ball);
          beep(800, 0.1, 'sine', 0.08);
        }
      }
    }
    
    // Paddle-powerup collisions (only for size and speed powerups)
    for (const powerup of state.powerups) {
      if (powerup.collected) continue;
      
      // Only allow paddle collection for size/speed powerups
      if (!['grow', 'shrink', 'speedUp', 'slowDown'].includes(powerup.type)) continue;
      
      const halfSize = powerup.r;
      
      // Check left paddle collision
      if (powerup.x + halfSize >= state.left.x && 
          powerup.x - halfSize <= state.left.x + config.paddle.w &&
          powerup.y + halfSize >= state.left.y && 
          powerup.y - halfSize <= state.left.y + state.left.h) {
        collectPowerupByPaddle(powerup, 'left');
        beep(600, 0.12, 'triangle', 0.1);
      }
      
      // Check right paddle collision
      if (powerup.x + halfSize >= state.right.x && 
          powerup.x - halfSize <= state.right.x + config.paddle.w &&
          powerup.y + halfSize >= state.right.y && 
          powerup.y - halfSize <= state.right.y + state.right.h) {
        collectPowerupByPaddle(powerup, 'right');
        beep(600, 0.12, 'triangle', 0.1);
      }
    }
    
    if (state.balls.length > 2) {
      console.timeEnd('powerup-collision-check');
    }
  }

  function collectPowerup(powerup, ball) {
    powerup.collected = true;
    
    // Change ball color
    ball.color = config.colors.powerups[powerup.type];
    
    // Apply powerup effect
    applyPowerupEffect(powerup.type, ball);
  }

  function collectPowerupByPaddle(powerup, paddleSide) {
    powerup.collected = true;
    
    // Apply powerup effect directly to the paddle that collected it
    const now = performance.now();
    const paddle = paddleSide === 'left' ? state.left : state.right;
    
    switch (powerup.type) {
      case 'grow':
        paddle.effects.push({ type: 'grow', endTime: now + config.effects.paddleSize.duration });
        break;
        
      case 'shrink':
        // When paddle collects shrink, apply to opponent
        const opponentPaddle = paddleSide === 'left' ? state.right : state.left;
        opponentPaddle.effects.push({ type: 'shrink', endTime: now + config.effects.paddleSize.duration });
        break;
        
      case 'speedUp':
        paddle.effects.push({ type: 'speedUp', endTime: now + config.effects.paddleSpeed.duration });
        break;
        
      case 'slowDown':
        // When paddle collects slowDown, apply to opponent
        const opponentPaddleSpeed = paddleSide === 'left' ? state.right : state.left;
        opponentPaddleSpeed.effects.push({ type: 'slowDown', endTime: now + config.effects.paddleSpeed.duration });
        break;
    }
  }

  function applyPowerupEffect(type, ball) {
    const now = performance.now();
    
    switch (type) {
      case 'split':
        // Create additional balls
        for (let i = 0; i < 2; i++) {
          const angle = rand(-Math.PI/3, Math.PI/3);
          const newBall = {
            x: ball.x, y: ball.y,
            vx: ball.vx * Math.cos(angle) - ball.vy * Math.sin(angle),
            vy: ball.vx * Math.sin(angle) + ball.vy * Math.cos(angle),
            trail: [], color: ball.color, effects: [...ball.effects]
          };
          state.balls.push(newBall);
        }
        break;
        
      case 'fast':
        ball.effects.push({ type: 'fast', endTime: now + config.effects.fastBall.duration });
        break;
        
      case 'grow':
        if (state.lastHitter) {
          const paddle = state.lastHitter === 'left' ? state.left : state.right;
          paddle.effects.push({ type: 'grow', endTime: now + config.effects.paddleSize.duration });
        }
        break;
        
      case 'shrink':
        if (state.lastHitter) {
          const paddle = state.lastHitter === 'left' ? state.right : state.left; // Opposite paddle
          paddle.effects.push({ type: 'shrink', endTime: now + config.effects.paddleSize.duration });
        }
        break;
        
      case 'speedUp':
        if (state.lastHitter) {
          const paddle = state.lastHitter === 'left' ? state.left : state.right;
          paddle.effects.push({ type: 'speedUp', endTime: now + config.effects.paddleSpeed.duration });
        }
        break;
        
      case 'slowDown':
        if (state.lastHitter) {
          const paddle = state.lastHitter === 'left' ? state.right : state.left; // Opposite paddle
          paddle.effects.push({ type: 'slowDown', endTime: now + config.effects.paddleSpeed.duration });
        }
        break;
    }
  }

  function updateEffects(now) {
    // Update paddle effects
    for (const paddle of [state.left, state.right]) {
      paddle.effects = paddle.effects.filter(effect => {
        if (now > effect.endTime) {
          return false; // Remove expired effect
        }
        return true;
      });
      
      // Apply current effects
      paddle.h = config.paddle.h;
      paddle.speed = config.paddle.speed;
      
      for (const effect of paddle.effects) {
        switch (effect.type) {
          case 'grow':
            paddle.h = config.paddle.h * 1.5;
            break;
          case 'shrink':
            paddle.h = config.paddle.h * 0.6;
            break;
          case 'speedUp':
            paddle.speed = config.paddle.speed * (1 + config.effects.paddleSpeed.modifier);
            break;
          case 'slowDown':
            paddle.speed = config.paddle.speed * (1 - config.effects.paddleSpeed.modifier);
            break;
        }
      }
    }
    
    // Update ball effects
    for (const ball of state.balls) {
      ball.effects = ball.effects.filter(effect => {
        if (now > effect.endTime) {
          ball.color = config.colors.ball; // Reset color when effect expires
          return false;
        }
        return true;
      });
    }
  }

  function drawPowerups(now) {
    ctx.save();
    for (const powerup of state.powerups) {
      if (powerup.collected) continue;
      
      const pulse = Math.sin(now * 0.008) * 0.3 + 0.7;
      const color = config.colors.powerups[powerup.type];
      const size = powerup.r * 1.5; // Make squares larger
      
      ctx.globalAlpha = pulse;
      ctx.shadowBlur = 15 * DPR;
      ctx.shadowColor = color;
      
      // Draw square background for all powerups
      ctx.fillStyle = color;
      ctx.fillRect(powerup.x - size/2, powerup.y - size/2, size, size);
      
      // Draw icon inside square based on type
      ctx.fillStyle = '#000'; // Black icons for contrast
      ctx.globalAlpha = pulse * 0.8;
      
      switch (powerup.type) {
        case 'split':
          // Draw three small squares
          const smallSize = size * 0.2;
          for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            const offset = size * 0.25;
            const px = powerup.x + Math.cos(angle) * offset;
            const py = powerup.y + Math.sin(angle) * offset;
            ctx.fillRect(px - smallSize/2, py - smallSize/2, smallSize, smallSize);
          }
          break;
          
        case 'fast':
          // Draw arrow pointing right
          ctx.beginPath();
          ctx.moveTo(powerup.x + size * 0.3, powerup.y);
          ctx.lineTo(powerup.x - size * 0.1, powerup.y - size * 0.25);
          ctx.lineTo(powerup.x - size * 0.1, powerup.y - size * 0.1);
          ctx.lineTo(powerup.x - size * 0.3, powerup.y - size * 0.1);
          ctx.lineTo(powerup.x - size * 0.3, powerup.y + size * 0.1);
          ctx.lineTo(powerup.x - size * 0.1, powerup.y + size * 0.1);
          ctx.lineTo(powerup.x - size * 0.1, powerup.y + size * 0.25);
          ctx.closePath();
          ctx.fill();
          break;
          
        case 'grow':
          // Draw expanding squares outline
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2 * DPR;
          for (let i = 1; i <= 3; i++) {
            const squareSize = size * i * 0.2;
            ctx.strokeRect(powerup.x - squareSize/2, powerup.y - squareSize/2, squareSize, squareSize);
          }
          break;
          
        case 'shrink':
          // Draw contracting squares
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2 * DPR;
          for (let i = 3; i >= 1; i--) {
            const squareSize = size * i * 0.15;
            ctx.globalAlpha = pulse * 0.8 * (4 - i) / 3;
            ctx.strokeRect(powerup.x - squareSize/2, powerup.y - squareSize/2, squareSize, squareSize);
          }
          break;
          
        case 'speedUp':
          // Draw plus sign
          const plusThick = size * 0.15;
          const plusLen = size * 0.6;
          ctx.fillRect(powerup.x - plusLen/2, powerup.y - plusThick/2, plusLen, plusThick);
          ctx.fillRect(powerup.x - plusThick/2, powerup.y - plusLen/2, plusThick, plusLen);
          break;
          
        case 'slowDown':
          // Draw minus sign
          const minusThick = size * 0.15;
          const minusLen = size * 0.6;
          ctx.fillRect(powerup.x - minusLen/2, powerup.y - minusThick/2, minusLen, minusThick);
          break;
      }
    }
    ctx.restore();
  }

  function collidePaddles(b) {
    // left
    if (b.vx<0 && b.x - config.ball.r <= state.left.x + config.paddle.w && b.y + config.ball.r >= state.left.y && b.y - config.ball.r <= state.left.y + state.left.h) {
      b.x = state.left.x + config.paddle.w + config.ball.r; 
      let speedInc = config.ball.inc;
      
      // Apply fast ball effect
      for (const effect of b.effects) {
        if (effect.type === 'fast') {
          speedInc *= config.effects.fastBall.speedMultiplier;
        }
      }
      
      b.vx = Math.abs(b.vx) + speedInc; 
      const offset=(b.y-(state.left.y+state.left.h/2))/(state.left.h/2); 
      b.vy += offset*160*DPR; 
      beep(420,0.06,'square',0.05);
      state.lastHitter = 'left';
    }
    // right
    if (b.vx>0 && b.x + config.ball.r >= state.right.x && b.y + config.ball.r >= state.right.y && b.y - config.ball.r <= state.right.y + state.right.h) {
      b.x = state.right.x - config.ball.r; 
      let speedInc = config.ball.inc;
      
      // Apply fast ball effect
      for (const effect of b.effects) {
        if (effect.type === 'fast') {
          speedInc *= config.effects.fastBall.speedMultiplier;
        }
      }
      
      b.vx = -Math.abs(b.vx) - speedInc; 
      const offset=(b.y-(state.right.y+state.right.h/2))/(state.right.h/2); 
      b.vy += offset*160*DPR; 
      beep(460,0.06,'square',0.05);
      state.lastHitter = 'right';
    }
  }

  function spawnFireworks(side,y){ const x = side==='left'? 20*DPR : width-20*DPR; for(let i=0;i<70;i++){ const a=Math.random()*Math.PI*2; const s=(Math.random()*200+80)*DPR; state.fx.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:600+Math.random()*400,born:performance.now(),color: side==='left'?config.colors.left:config.colors.right}); } }
  function updateFX(dt,now){ const g=420*DPR; for(const p of state.fx){ p.vy += g*dt*0.00015; p.x += p.vx*dt*0.001; p.y += p.vy*dt*0.001; p.dead = (now-p.born)>p.life; } state.fx = state.fx.filter(p=>!p.dead); }
  function drawFX(now){ ctx.save(); for(const p of state.fx){ const a = Math.max(0,1-(now-p.born)/p.life); ctx.globalAlpha=a; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,2.2*DPR,0,Math.PI*2); ctx.fill(); } ctx.restore(); }

  let keys = new Set(); window.addEventListener('keydown',(e)=>{ keys.add(e.key); if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) e.preventDefault(); }); window.addEventListener('keyup',(e)=>keys.delete(e.key));

  let last = performance.now();
  let frameCount = 0;
  let fpsLogTimer = 0;
  
  function frame(now){ 
    const dt = Math.min(32, now-last); 
    last = now; 
    frameCount++;
    fpsLogTimer += dt;
    
    // Log FPS every 2 seconds when there are multiple balls
    if (state.balls.length > 2 && fpsLogTimer > 2000) {
      console.log(`FPS: ${(frameCount / (fpsLogTimer / 1000)).toFixed(1)}, Balls: ${state.balls.length}, Wells: ${state.wells.length}, Powerups: ${state.powerups.filter(p => !p.collected).length}`);
      frameCount = 0;
      fpsLogTimer = 0;
    }
    
    if (state.running) {
      const frameStartTime = performance.now();
      
      // Update effects
      updateEffects(now);
      
      // paddles
      if (keys.has('w')||keys.has('W')) state.left.y -= state.left.speed * (dt/1000);
      if (keys.has('s')||keys.has('S')) state.left.y += state.left.speed * (dt/1000);
      if (keys.has('ArrowUp')) state.right.y -= state.right.speed * (dt/1000);
      if (keys.has('ArrowDown')) state.right.y += state.right.speed * (dt/1000);
      state.left.y = clamp(state.left.y, 0, height-state.left.h); 
      state.right.y = clamp(state.right.y, 0, height-state.right.h);

      // wells
      updateWells(dt);

      // powerups
      updatePowerups(dt);
      checkPowerupCollisions();

      // balls - performance critical with multiple balls
      if (state.balls.length > 3) {
        console.time('ball-physics');
      }
      
      for (const b of state.balls) {
        const a = applyWellAccel(b); b.vx += a.ax*(dt/1000); b.vy += a.ay*(dt/1000);
        // clamp/max
        let spd = Math.hypot(b.vx,b.vy); if (spd>config.ball.max){ const s=config.ball.max/spd; b.vx*=s; b.vy*=s; }
        // min speed
        spd = Math.hypot(b.vx,b.vy); if (spd<config.ball.min){ if (spd===0){ const th=rand(-0.5,0.5); b.vx=Math.cos(th)*config.ball.min; b.vy=Math.sin(th)*config.ball.min; } else { const s=config.ball.min/spd; b.vx*=s; b.vy*=s; } }
        b.x += b.vx*(dt/1000); b.y += b.vy*(dt/1000);
      }
      
      if (state.balls.length > 3) {
        console.timeEnd('ball-physics');
      }

      // walls
      for (const b of state.balls) {
        if (b.y - config.ball.r < 0) { b.y = config.ball.r; b.vy = Math.abs(b.vy); beep(320,0.04,'triangle',0.03); }
        if (b.y + config.ball.r > height) { b.y = height - config.ball.r; b.vy = -Math.abs(b.vy); beep(320,0.04,'triangle',0.03); }
      }

      // paddles
      if (state.balls.length > 3) {
        console.time('paddle-collision');
      }
      for (const b of state.balls) collidePaddles(b);
      if (state.balls.length > 3) {
        console.timeEnd('paddle-collision');
      }

      // scoring
      for (const b of [...state.balls]) { if (b.x + config.ball.r < 0) { point(true, b.y); break; } else if (b.x - config.ball.r > width) { point(false, b.y); break; } }
      
      if (state.balls.length > 3) {
        const frameEndTime = performance.now();
        console.log(`Frame update took ${(frameEndTime - frameStartTime).toFixed(2)}ms`);
      }
    }

    // draw
    if (state.balls.length > 3) {
      console.time('rendering');
    }
    
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,width,height);
    // net
    ctx.save(); ctx.strokeStyle='rgba(220,230,255,0.25)'; ctx.setLineDash([12*DPR,16*DPR]); ctx.lineWidth=4*DPR; ctx.beginPath(); ctx.moveTo(width/2,0); ctx.lineTo(width/2,height); ctx.stroke(); ctx.restore();
    drawWells(now);
    drawPowerups(now);
    // paddles
    ctx.save(); 
    ctx.shadowBlur=22*DPR; 
    ctx.shadowColor=config.colors.left; ctx.fillStyle=config.colors.left; 
    ctx.fillRect(state.left.x,state.left.y,config.paddle.w,state.left.h); 
    ctx.shadowColor=config.colors.right; ctx.fillStyle=config.colors.right; 
    ctx.fillRect(state.right.x,state.right.y,config.paddle.w,state.right.h); 
    ctx.restore();
    // balls + trails - performance critical with multiple balls
    if (state.balls.length > 3) {
      console.time('ball-rendering');
    }
    
    ctx.save(); 
    ctx.globalCompositeOperation='lighter'; 
    for(const b of state.balls){ 
      b.trail.unshift({x:b.x,y:b.y,color:b.color}); 
      if (b.trail.length>16) b.trail.pop(); 
      for(let i=0;i<b.trail.length;i++){ 
        const p=b.trail[i]; const a=(i+1)/b.trail.length; 
        const trailColor = p.color || config.colors.ball;
        const rgb = trailColor === '#ffffff' ? '255,255,255' : 
                   trailColor === config.colors.powerups.split ? '255,107,53' :
                   trailColor === config.colors.powerups.fast ? '247,147,30' :
                   trailColor === config.colors.powerups.grow ? '0,212,170' :
                   trailColor === config.colors.powerups.shrink ? '255,23,68' :
                   trailColor === config.colors.powerups.speedUp ? '118,255,3' :
                   trailColor === config.colors.powerups.slowDown ? '63,81,181' : '255,255,255';
        ctx.fillStyle=`rgba(${rgb},${a*0.14})`; 
        ctx.beginPath(); 
        ctx.arc(p.x,p.y,config.ball.r*(0.7+a*0.3),0,Math.PI*2); 
        ctx.fill(); 
      } 
      ctx.shadowBlur=18*DPR; 
      ctx.shadowColor=b.color; 
      ctx.fillStyle=b.color; 
      ctx.beginPath(); 
      ctx.arc(b.x,b.y,config.ball.r,0,Math.PI*2); 
      ctx.fill(); 
    } 
    ctx.restore();
    
    if (state.balls.length > 3) {
      console.timeEnd('ball-rendering');
    }
    
    drawFX(now);
    
    if (state.balls.length > 3) {
      console.timeEnd('rendering');
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function beginGame(){ infoModal.style.display='none'; ensureAudio(); startMatch(); hud.textContent=''; }
  function serveNext(){ if (!state.awaitNext) return; const dir = state.awaitSide==='left' ? -1 : 1; resetPaddles(); state.awaitNext=false; serve(dir, state.lastBallY); hud.textContent=''; }
  startBtn.addEventListener('click', beginGame);
  window.addEventListener('keydown',(e)=>{ if (e.key===' ') { if (!state.running || state.over){ beginGame(); } else if (state.awaitNext){ serveNext(); } } });
})();


