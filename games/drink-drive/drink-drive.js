(() => {
  'use strict';

  // DOM elements
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const statusbar = document.getElementById('statusbar');
  const speedDisplay = document.getElementById('speedDisplay');
  const beerCount = document.getElementById('beerCount');
  const hud = document.getElementById('hud');
  const beerModal = document.getElementById('beerModal');
  const beerSlider = document.getElementById('beerSlider');
  const beerSliderValue = document.getElementById('beerSliderValue');
  const speedEffect = document.getElementById('speedEffect');
  const controlEffect = document.getElementById('controlEffect');
  const visionEffect = document.getElementById('visionEffect');
  const startRaceBtn = document.getElementById('startRaceBtn');
  const resultsModal = document.getElementById('resultsModal');
  const resultsStats = document.getElementById('resultsStats');
  const educationalMessage = document.getElementById('educationalMessage');
  const playAgainBtn = document.getElementById('playAgainBtn');

  // Canvas setup
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let width = 0, height = 0, headerH = 0;

  function resize() {
    const header = document.querySelector('.site-header');
    headerH = header ? header.getBoundingClientRect().height : 0;
    const cssW = window.innerWidth;
    const sbH = statusbar ? statusbar.getBoundingClientRect().height : 0;
    const cssH = window.innerHeight - headerH - sbH;
    width = Math.max(640, Math.floor(cssW * DPR));
    height = Math.max(360, Math.floor(cssH * DPR));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // Utility functions
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Audio system
  let audioCtx = null;
  const ensureAudio = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  };

  function playSound(freq = 440, duration = 0.1, type = 'sine', gain = 0.1) {
    try {
      ensureAudio();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gainNode.gain.value = gain;
      osc.connect(gainNode).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playVictoryFanfare() {
    try {
      ensureAudio();
      const t = audioCtx.currentTime;
      
      // Play a celebratory chord progression
      const notes = [
        { freq: 523.25, delay: 0 },    // C5
        { freq: 659.25, delay: 0 },    // E5
        { freq: 783.99, delay: 0 },    // G5
        { freq: 1046.50, delay: 0.2 }, // C6
        { freq: 783.99, delay: 0.4 },  // G5
        { freq: 1046.50, delay: 0.6 }  // C6
      ];
      
      notes.forEach(note => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = note.freq;
        gainNode.gain.value = 0.15;
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + note.delay + 0.4);
        osc.connect(gainNode).connect(audioCtx.destination);
        osc.start(t + note.delay);
        osc.stop(t + note.delay + 0.4);
      });
    } catch (e) {
      // Ignore audio errors
    }
  }

  // Game configuration
  const config = {
    car: {
      width: 24 * DPR,
      height: 48 * DPR,
      maxSpeed: 800 * DPR,
      acceleration: 400 * DPR,
      friction: 0.95,
      turnSpeed: 3.5
    },
    road: {
      width: 400 * DPR,
      laneWidth: 100 * DPR,
      stripeSpeed: 200 * DPR
    },
    obstacles: {
      spawnRate: 0.6, // per second
      minSpeed: 100 * DPR,
      maxSpeed: 600 * DPR,
      types: ['car', 'box', 'truck'],
      sizes: {
        car: { width: 20 * DPR, height: 40 * DPR },
        box: { width: 15 * DPR, height: 15 * DPR },
        truck: { width: 24 * DPR, height: 60 * DPR }
      }
    },
    race: {
      distance: 2000 * DPR, // 2000 units to finish line
      startLineY: height * 0.8
    },
    alcohol: {
      speedBonus: [0, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1.1, 1.3, 1.6, 2.0], // per beer
      controlPenalty: [1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1], // per beer
      swerveIntensity: [0, 0.5, 1, 1.8, 2.8, 4, 5.5, 7.5, 10, 13, 17], // per beer
      visionImpairment: [0, 0.05, 0.1, 0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0] // per beer
    }
  };

  // Game state
  const state = {
    phase: 'selection', // 'selection', 'racing', 'finished'
    beerCount: 0,
    car: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      speed: 0
    },
    camera: {
      y: 0
    },
    race: {
      distance: 0,
      time: 0,
      crashes: 0,
      maxSpeed: 0,
      finished: false
    },
    effects: {
      swervePhase: 0,
      lastSwerveTime: 0,
      vignetteIntensity: 0,
      blurIntensity: 0
    },
    barriers: {
      leftHits: 0,
      rightHits: 0
    },
    obstacles: [],
    obstacleSpawnTimer: 0
  };

  // Input handling
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'a', 'd', 'w', 's', 'r'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // Beer selection logic
  function updateBeerSelection() {
    const beers = parseInt(beerSlider.value);
    beerSliderValue.textContent = beers;
    
    // Update effect previews
    if (beers === 0) {
      speedEffect.textContent = 'Normal';
      speedEffect.style.color = '#4CAF50';
      controlEffect.textContent = 'Normal';
      controlEffect.style.color = '#4CAF50';
      visionEffect.textContent = 'Clear';
      visionEffect.style.color = '#4CAF50';
    } else if (beers <= 3) {
      speedEffect.textContent = 'Slightly Faster';
      speedEffect.style.color = '#FFC107';
      controlEffect.textContent = 'Slightly Impaired';
      controlEffect.style.color = '#FFC107';
      visionEffect.textContent = 'Slightly Blurred';
      visionEffect.style.color = '#FFC107';
    } else if (beers <= 6) {
      speedEffect.textContent = 'Much Faster';
      speedEffect.style.color = '#FF9800';
      controlEffect.textContent = 'Significantly Impaired';
      controlEffect.style.color = '#FF9800';
      visionEffect.textContent = 'Moderately Blurred';
      visionEffect.style.color = '#FF9800';
    } else {
      speedEffect.textContent = 'Extremely Fast';
      speedEffect.style.color = '#F44336';
      controlEffect.textContent = 'Severely Impaired';
      controlEffect.style.color = '#F44336';
      visionEffect.textContent = 'Heavily Impaired';
      visionEffect.style.color = '#F44336';
    }
  }

  beerSlider.addEventListener('input', updateBeerSelection);

  function startRace() {
    ensureAudio();
    state.beerCount = parseInt(beerSlider.value);
    state.phase = 'racing';
    
    // Initialize car position
    state.car.x = width / 2;
    state.car.y = config.race.startLineY;
    state.car.vx = 0;
    state.car.vy = 0;
    state.car.angle = 0;
    state.car.speed = 0;
    
    // Reset race stats
    state.race.distance = 0;
    state.race.time = 0;
    state.race.crashes = 0;
    state.race.maxSpeed = 0;
    state.race.finished = false;
    state.barriers.leftHits = 0;
    state.barriers.rightHits = 0;
    
    // Reset obstacles
    state.obstacles = [];
    state.obstacleSpawnTimer = 0;
    
    // Reset camera
    state.camera.y = 0;
    
    // Update UI
    beerCount.textContent = `🍺 × ${state.beerCount}`;
    beerModal.style.display = 'none';
    
    hud.textContent = 'Hold SPACE to accelerate!';
    setTimeout(() => {
      hud.textContent = '';
    }, 3000);
  }

  function resetGame() {
    state.phase = 'selection';
    state.beerCount = 0;
    beerSlider.value = 0;
    updateBeerSelection();
    beerModal.style.display = '';
    resultsModal.style.display = 'none';
  }

  // Event listeners
  startRaceBtn.addEventListener('click', startRace);
  playAgainBtn.addEventListener('click', resetGame);

  // Obstacle spawning and management
  function updateObstacles(dt) {
    if (state.phase !== 'racing' || state.race.finished) return;
    
    // Spawn new obstacles
    state.obstacleSpawnTimer += dt;
    if (state.obstacleSpawnTimer >= 1000 / config.obstacles.spawnRate) {
      spawnObstacle();
      state.obstacleSpawnTimer = 0;
    }
    
    // Update existing obstacles
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obstacle = state.obstacles[i];
      obstacle.y += obstacle.vy * dt;
      
      // Remove obstacles that are off-screen
      if (obstacle.y > state.camera.y + height + 100 || obstacle.y < state.camera.y - 300) {
        state.obstacles.splice(i, 1);
      }
    }
  }
  
  function spawnObstacle() {
    const roadLeft = width / 2 - config.road.width / 2;
    const roadRight = width / 2 + config.road.width / 2;
    const laneWidth = config.road.width / 4;
    
    // Choose random lane (0-3)
    const lane = Math.floor(Math.random() * 4);
    const x = roadLeft + (lane + 0.5) * laneWidth;
    
    // Choose obstacle type
    const type = config.obstacles.types[Math.floor(Math.random() * config.obstacles.types.length)];
    const size = config.obstacles.sizes[type];
    
    // Choose direction (with traffic or against traffic)
    const direction = Math.random() < 0.7 ? 1 : -1; // 70% with traffic, 30% against
    const speed = direction > 0 ? 
      rand(config.obstacles.minSpeed, config.obstacles.maxSpeed * 0.6) : // Slower when going with traffic
      rand(config.obstacles.maxSpeed * 0.8, config.obstacles.maxSpeed); // Faster when going against traffic
    
    const obstacle = {
      x: x,
      y: state.camera.y - 100, // Spawn ahead of camera
      vy: direction * speed,
      width: size.width,
      height: size.height,
      type: type,
      direction: direction
    };
    
    state.obstacles.push(obstacle);
  }
  
  function checkObstacleCollisions() {
    const carLeft = state.car.x - config.car.width / 2;
    const carRight = state.car.x + config.car.width / 2;
    const carTop = state.car.y - config.car.height / 2;
    const carBottom = state.car.y + config.car.height / 2;
    
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obs = state.obstacles[i];
      const obsLeft = obs.x - obs.width / 2;
      const obsRight = obs.x + obs.width / 2;
      const obsTop = obs.y - obs.height / 2;
      const obsBottom = obs.y + obs.height / 2;
      
      // Check collision
      if (carLeft < obsRight && carRight > obsLeft && carTop < obsBottom && carBottom > obsTop) {
        // Collision detected!
        state.obstacles.splice(i, 1);
        state.car.speed *= 0.2; // Massive speed reduction
        state.race.crashes++;
        
        playSound(80, 0.4, 'square', 0.3);
        
        // Strong screen shake
        canvas.style.transform = 'translate(' + (Math.random() - 0.5) * 20 + 'px, ' + (Math.random() - 0.5) * 20 + 'px)';
        setTimeout(() => { canvas.style.transform = ''; }, 300);
        
        // Push car away from obstacle
        const pushX = (state.car.x - obs.x) * 0.5;
        state.car.x += pushX;
        state.car.angle += (Math.random() - 0.5) * 0.8;
      }
    }
  }

  // Game physics and updates
  function updateCarPhysics(dt) {
    if (state.phase !== 'racing' || state.race.finished) return;
    
    const alcoholMultiplier = config.alcohol.speedBonus[state.beerCount] || 0;
    const controlMultiplier = config.alcohol.controlPenalty[state.beerCount] || 1;
    const swerveIntensity = config.alcohol.swerveIntensity[state.beerCount] || 0;
    
    // Acceleration
    if (keys.has(' ') || keys.has('w')) {
      state.car.speed += config.car.acceleration * (1 + alcoholMultiplier) * dt;
    }
    
    // Apply friction
    state.car.speed *= config.car.friction;
    
    // Clamp speed
    state.car.speed = clamp(state.car.speed, 0, config.car.maxSpeed * (1 + alcoholMultiplier));
    
    // Record max speed
    state.race.maxSpeed = Math.max(state.race.maxSpeed, state.car.speed);
    
    // Steering input
    let steerInput = 0;
    if (keys.has('a') || keys.has('arrowleft')) steerInput -= 1;
    if (keys.has('d') || keys.has('arrowright')) steerInput += 1;
    
    // Apply alcohol swerving
    if (swerveIntensity > 0) {
      state.effects.swervePhase += dt * 2;
      const swerveOffset = Math.sin(state.effects.swervePhase) * swerveIntensity * 0.1;
      
      // Random sudden swerves
      if (Math.random() < swerveIntensity * 0.001 * dt) {
        const randomSwerve = (Math.random() - 0.5) * swerveIntensity * 0.3;
        state.car.angle += randomSwerve;
        playSound(200, 0.1, 'sawtooth', 0.05);
      }
      
      steerInput += swerveOffset;
    }
    
    // Apply steering with alcohol impairment
    state.car.angle += steerInput * config.car.turnSpeed * controlMultiplier * dt;
    
    // Calculate velocity from angle and speed
    state.car.vx = Math.sin(state.car.angle) * state.car.speed;
    state.car.vy = -Math.cos(state.car.angle) * state.car.speed;
    
    // Update position
    state.car.x += state.car.vx * dt;
    state.car.y += state.car.vy * dt;
    
    // Update race progress (based on forward movement)
    if (state.car.vy < 0) { // Moving forward
      state.race.distance += Math.abs(state.car.vy) * dt;
    }
    
    // Update camera to follow car
    state.camera.y = state.car.y - height * 0.7;
    
    // Barrier collision detection
    const roadLeft = width / 2 - config.road.width / 2;
    const roadRight = width / 2 + config.road.width / 2;
    
    if (state.car.x - config.car.width / 2 < roadLeft) {
      state.car.x = roadLeft + config.car.width / 2;
      state.car.speed *= 0.3; // Significant speed reduction
      state.barriers.leftHits++;
      state.race.crashes++;
      playSound(100, 0.3, 'square', 0.2);
      
      // Screen shake effect
      canvas.style.transform = 'translate(' + (Math.random() - 0.5) * 10 + 'px, ' + (Math.random() - 0.5) * 10 + 'px)';
      setTimeout(() => { canvas.style.transform = ''; }, 200);
    }
    
    if (state.car.x + config.car.width / 2 > roadRight) {
      state.car.x = roadRight - config.car.width / 2;
      state.car.speed *= 0.3; // Significant speed reduction
      state.barriers.rightHits++;
      state.race.crashes++;
      playSound(100, 0.3, 'square', 0.2);
      
      // Screen shake effect
      canvas.style.transform = 'translate(' + (Math.random() - 0.5) * 10 + 'px, ' + (Math.random() - 0.5) * 10 + 'px)';
      setTimeout(() => { canvas.style.transform = ''; }, 200);
    }
    
    // Check for race completion
    if (state.race.distance >= config.race.distance) {
      finishRace();
    }
    
    // Update race time
    state.race.time += dt;
    
    // Update visual effects based on alcohol
    const visionImpairment = config.alcohol.visionImpairment[state.beerCount] || 0;
    state.effects.vignetteIntensity = visionImpairment;
    state.effects.blurIntensity = visionImpairment * 3;
  }

  function finishRace() {
    if (state.race.finished) return;
    
    state.race.finished = true;
    state.phase = 'finished';
    
    playVictoryFanfare();
    
    // Calculate results
    const timeSeconds = state.race.time / 1000;
    const maxSpeedMph = Math.round((state.race.maxSpeed / DPR) * 0.68); // Rough conversion to MPH
    const avgSpeedMph = Math.round((state.race.distance / state.race.time) * 0.68);
    
    // Update results display
    resultsStats.innerHTML = `
      <div><strong>Race Time:</strong> ${timeSeconds.toFixed(2)} seconds</div>
      <div><strong>Max Speed:</strong> ${maxSpeedMph} MPH</div>
      <div><strong>Average Speed:</strong> ${avgSpeedMph} MPH</div>
      <div><strong>Barrier Crashes:</strong> ${state.race.crashes}</div>
      <div><strong>Beers Consumed:</strong> ${state.beerCount}</div>
    `;
    
    // Educational message based on performance
    let message = '';
    if (state.beerCount === 0) {
      message = '✅ <strong>Excellent!</strong> You drove safely with no alcohol. This is always the best choice.';
    } else if (state.race.crashes === 0) {
      message = '⚠️ <strong>Lucky this time!</strong> Even with alcohol, you avoided crashes in this simulation. In reality, alcohol impairs your driving even when you think you\'re "fine."';
    } else if (state.race.crashes <= 2) {
      message = '🚨 <strong>Dangerous!</strong> Multiple crashes occurred due to alcohol impairment. In real life, this could mean serious injury or death.';
    } else {
      message = '💀 <strong>Extremely Dangerous!</strong> Severe alcohol impairment led to multiple crashes. This level of impairment would likely result in a fatal accident.';
    }
    
    message += '<br><br><strong>Remember:</strong> No amount of alcohol is safe when driving. Always designate a driver, use ride-sharing, or take public transportation.';
    
    educationalMessage.innerHTML = message;
    resultsModal.style.display = '';
  }

  // Rendering functions
  function drawRoad() {
    const roadLeft = width / 2 - config.road.width / 2;
    const roadRight = width / 2 + config.road.width / 2;
    
    // Road surface
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(roadLeft, 0, config.road.width, height);
    
    // Road barriers/edges
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(roadLeft - 10 * DPR, 0, 10 * DPR, height);
    ctx.fillRect(roadRight, 0, 10 * DPR, height);
    
    // Lane markings
    ctx.fillStyle = '#ffd700';
    const laneWidth = config.road.width / 4;
    for (let i = 1; i < 4; i++) {
      const x = roadLeft + i * laneWidth;
      ctx.fillRect(x - 2 * DPR, 0, 4 * DPR, height);
    }
    
    // Road stripes (moving based on car speed)
    ctx.fillStyle = '#ffffff';
    const stripeHeight = 30 * DPR;
    const stripeGap = 40 * DPR;
    // Make stripe movement more responsive to car speed
    const speedMultiplier = Math.max(0.5, state.car.speed / (config.car.maxSpeed * 0.3));
    const stripeOffset = (state.camera.y * speedMultiplier) % (stripeHeight + stripeGap);
    
    for (let y = -stripeOffset; y < height + stripeHeight; y += stripeHeight + stripeGap) {
      // Center line stripes
      ctx.fillRect(width / 2 - 2 * DPR, y, 4 * DPR, stripeHeight);
    }
  }

  function drawCar() {
    ctx.save();
    ctx.translate(state.car.x, state.car.y - state.camera.y);
    ctx.rotate(state.car.angle);
    
    // Car body
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(-config.car.width / 2, -config.car.height / 2, config.car.width, config.car.height);
    
    // Car details
    ctx.fillStyle = '#000';
    ctx.fillRect(-config.car.width / 3, -config.car.height / 2 + 5 * DPR, config.car.width / 1.5, 8 * DPR); // Windshield
    ctx.fillRect(-config.car.width / 3, config.car.height / 2 - 10 * DPR, config.car.width / 1.5, 5 * DPR); // Rear window
    
    ctx.restore();
  }

  function drawObstacles() {
    ctx.save();
    
    for (const obstacle of state.obstacles) {
      const screenY = obstacle.y - state.camera.y;
      
      ctx.save();
      ctx.translate(obstacle.x, screenY);
      
      switch (obstacle.type) {
        case 'car':
          // Draw car
          ctx.fillStyle = obstacle.direction > 0 ? '#4CAF50' : '#F44336'; // Green for same direction, red for opposite
          ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
          
          // Car details
          ctx.fillStyle = '#fff';
          if (obstacle.direction > 0) {
            // Headlights (facing same direction as player)
            ctx.fillRect(-obstacle.width / 3, -obstacle.height / 2 + 2 * DPR, obstacle.width / 6, 4 * DPR);
            ctx.fillRect(obstacle.width / 6, -obstacle.height / 2 + 2 * DPR, obstacle.width / 6, 4 * DPR);
          } else {
            // Taillights (facing opposite direction)
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(-obstacle.width / 3, obstacle.height / 2 - 6 * DPR, obstacle.width / 6, 4 * DPR);
            ctx.fillRect(obstacle.width / 6, obstacle.height / 2 - 6 * DPR, obstacle.width / 6, 4 * DPR);
          }
          break;
          
        case 'box':
          // Draw box
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
          
          // Box tape
          ctx.strokeStyle = '#DEB887';
          ctx.lineWidth = 2 * DPR;
          ctx.strokeRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
          ctx.beginPath();
          ctx.moveTo(-obstacle.width / 2, 0);
          ctx.lineTo(obstacle.width / 2, 0);
          ctx.moveTo(0, -obstacle.height / 2);
          ctx.lineTo(0, obstacle.height / 2);
          ctx.stroke();
          break;
          
        case 'truck':
          // Draw truck
          ctx.fillStyle = '#2196F3';
          ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
          
          // Truck cab
          ctx.fillStyle = '#1976D2';
          const cabHeight = obstacle.height * 0.3;
          if (obstacle.direction > 0) {
            ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, cabHeight);
          } else {
            ctx.fillRect(-obstacle.width / 2, obstacle.height / 2 - cabHeight, obstacle.width, cabHeight);
          }
          
          // Lights
          ctx.fillStyle = obstacle.direction > 0 ? '#fff' : '#ff0000';
          const lightY = obstacle.direction > 0 ? -obstacle.height / 2 + 2 * DPR : obstacle.height / 2 - 6 * DPR;
          ctx.fillRect(-obstacle.width / 3, lightY, obstacle.width / 8, 4 * DPR);
          ctx.fillRect(obstacle.width / 4, lightY, obstacle.width / 8, 4 * DPR);
          break;
      }
      
      ctx.restore();
    }
    
    ctx.restore();
  }

  function drawUI() {
    // Speed display
    const speedMph = Math.round((state.car.speed / DPR) * 0.68);
    speedDisplay.textContent = `${speedMph} MPH`;
    
    // Progress bar
    const progress = state.race.distance / config.race.distance;
    const progressWidth = width * 0.8;
    const progressHeight = 20 * DPR;
    const progressX = (width - progressWidth) / 2;
    const progressY = 30 * DPR;
    
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(progressX, progressY, progressWidth, progressHeight);
    
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(progressX, progressY, progressWidth * progress, progressHeight);
    
    ctx.fillStyle = '#fff';
    ctx.font = `${12 * DPR}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText('Race Progress', width / 2, progressY - 8 * DPR);
    
    // Distance to finish
    const distanceLeft = Math.max(0, config.race.distance - state.race.distance);
    const distanceLeftPercent = Math.round((distanceLeft / config.race.distance) * 100);
    ctx.fillText(`${distanceLeftPercent}% to finish`, width / 2, progressY + progressHeight + 20 * DPR);
  }

  function drawVisualEffects() {
    if (state.effects.vignetteIntensity > 0) {
      // Vignette effect
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${state.effects.vignetteIntensity * 0.8})`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    
    if (state.effects.blurIntensity > 0) {
      // Blur effect simulation with opacity layers
      ctx.globalAlpha = state.effects.blurIntensity * 0.1;
      ctx.fillStyle = '#000';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Main game loop
  let lastTime = performance.now();
  
  function gameLoop(currentTime) {
    const dt = Math.min(32, currentTime - lastTime) / 1000; // Cap at ~30fps for stability
    lastTime = currentTime;
    
    if (state.phase === 'racing') {
      updateCarPhysics(dt);
      updateObstacles(dt);
      checkObstacleCollisions();
      
      // Handle reset
      if (keys.has('r')) {
        resetGame();
        return;
      }
    }
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    
    if (state.phase === 'racing' || state.phase === 'finished') {
      // Draw game elements
      drawRoad();
      drawObstacles();
      drawCar();
      drawUI();
      drawVisualEffects();
    }
    
    requestAnimationFrame(gameLoop);
  }

  // Initialize game
  updateBeerSelection();
  requestAnimationFrame(gameLoop);
})();
