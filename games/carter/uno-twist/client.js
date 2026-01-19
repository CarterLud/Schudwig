(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const connStatus = $('#connStatus');
  const createBtn = $('#createBtn');
  const joinBtn = $('#joinBtn');
  const startBtn = $('#startBtn');
  const modeSelect = $('#modeSelect');
  const hostPanel = $('#hostPanel');
  const joinPanel = $('#joinPanel');
  const playersPanel = $('#playersPanel');
  const hostChoice = $('#hostChoice');
  const joinChoice = $('#joinChoice');
  const backFromHost = $('#backFromHost');
  const backFromJoin = $('#backFromJoin');
  const leaveLobby = $('#leaveLobby');
  const playersList = $('#players');
  const createdPin = $('#createdPin');
  const pinText = $('#pinText');
  const twistInfo = $('#twistInfo');
  const twistNameEl = $('#twistName');
  const twistDescEl = $('#twistDesc');
  const twistBadge = $('#twistBadge');
  const discardTop = $('#discardTop');
  const currentColorDot = $('#currentColor');
  const opponentsEl = $('#opponents');
  const handEl = $('#hand');
  const drawPileFace = $('#drawPileFace');
  const unoBtn = $('#unoBtn');
  const messages = $('#messages');
  const lobbyScreen = $('#lobbyScreen');
  const gameScreen = $('#gameScreen');
  const colorPicker = $('#colorPicker');
  const slamOverlay = $('#slamOverlay');
  const turnPlayerEl = $('#turnPlayer');
  const turnArrow = $('#turnArrow');
  const unoOverlay = $('#unoOverlay');
  const unoPlayerName = $('#unoPlayerName');
  const unoSelfBtn = $('#unoSelfBtn');
  const callUnoBtn = $('#callUnoBtn');

  let ws;
  let playerId = null;
  let myName = '';
  let currentPin = null;
  let awaitingColorChoice = null;
  let hostId = null;

  function connect(onOpen) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const host = location.hostname || 'localhost';
    const port = location.port || '3001';
    const url = `${protocol}://${host}:${port}`;
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      connStatus.textContent = 'Connected';
      if (onOpen) onOpen();
    });
    ws.addEventListener('close', () => {
      connStatus.textContent = 'Disconnected';
      notify('Server disconnected');
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    });
  }

  function ensureConnected(callback) {
    if (ws && ws.readyState === 1) { callback(); return; }
    if (ws && ws.readyState === 0) { ws.addEventListener('open', callback, { once: true }); notify('Connecting...'); return; }
    notify('Connecting...');
    connect(callback);
  }

  function send(type, data) {
    ws.send(JSON.stringify({ type, ...data }));
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'lobby_created':
        currentPin = msg.pin;
        createdPin.textContent = `PIN: ${currentPin}`;
        pinText.textContent = currentPin;
        playerId = msg.playerId;
        hostId = msg.hostId;
        myName = $('#hostName').value.trim() || 'Host';
        modeSelect.hidden = true;
        hostPanel.hidden = true;
        joinPanel.hidden = true;
        playersPanel.hidden = false;
        renderPlayers(msg.players);
        break;
      case 'joined_lobby':
        currentPin = msg.pin;
        pinText.textContent = msg.pin;
        playerId = msg.playerId;
        hostId = msg.hostId;
        myName = $('#joinName').value.trim() || 'Player';
        modeSelect.hidden = true;
        hostPanel.hidden = true;
        joinPanel.hidden = true;
        playersPanel.hidden = false;
        renderPlayers(msg.players);
        break;
      case 'lobby_update':
        hostId = msg.hostId;
        renderPlayers(msg.players);
        break;
      case 'game_started':
        lobbyScreen.hidden = true;
        gameScreen.hidden = false;
        twistInfo.hidden = false;
        twistNameEl.textContent = msg.twist.name;
        twistDescEl.textContent = msg.twist.description;
        twistBadge.textContent = msg.twist.name;
        renderState(msg.state);
        notify(`This round's twist: ${msg.twist.name}`);
        break;
      case 'state':
        renderState(msg.state);
        break;
      case 'choose_color':
        awaitingColorChoice = msg.cardId;
        colorPicker.hidden = false;
        break;
      case 'message':
        notify(msg.text);
        break;
      case 'uno_window':
        // Show UNO window to everyone
        unoPlayerName.textContent = msg.playerName;
        unoOverlay.hidden = false;
        // Enable/disable self action if this client is the UNO player
        const isSelf = msg.playerId === playerId;
        unoSelfBtn.hidden = !isSelf;
        callUnoBtn.hidden = isSelf;
        break;
      case 'uno_window_close':
        unoOverlay.hidden = false; // quick flash will be hidden below
        unoOverlay.hidden = true;
        break;
      case 'error':
        notify(msg.message || 'Error');
        break;
      case 'slam_start':
        if (gameScreen.hidden) return; // ignore pre-game
        slamOverlay.hidden = false;
        // Capture first Space press
        const onKey = (e) => {
          if (e.code === 'Space') {
            window.removeEventListener('keydown', onKey);
            send('slam', { pin: currentPin });
            slamOverlay.hidden = true;
          }
        };
        window.addEventListener('keydown', onKey, { once: true });
        break;
      case 'slam_penalty':
        notify(`${msg.playerName} was last to slam — draws ${msg.count}`);
        break;
    }
  }

  function renderPlayers(players) {
    playersList.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.name + (p.id === playerId ? ' (you)' : '');
      playersList.appendChild(li);
    });
    startBtn.hidden = playerId !== hostId;
    // Enable for solo host (bot will be added on start)
    startBtn.disabled = (players.length < 1) || (playerId !== hostId);
  }

  function renderCardFace(el, card, chosenColor) {
    el.className = 'card-face';
    if (!card) { el.classList.add('face-back'); el.textContent = ''; return; }
    if (card.type === 'wild') {
      el.classList.add('wild');
      el.style.removeProperty('background');
      el.style.color = '#fff';
      el.textContent = card.value;
      if (chosenColor) el.setAttribute('data-color', chosenColor);
      return;
    }
    el.classList.add(card.color);
    el.style.removeProperty('background');
    el.textContent = card.value;
    el.setAttribute('data-color', card.color);
  }

  function renderHand(cards) {
    handEl.innerHTML = '';
    cards.forEach((c) => {
      const b = document.createElement('button');
      b.className = `card-small ${c.type === 'wild' ? 'wild' : c.color}`;
      b.textContent = c.value;
      b.title = `${c.color || 'wild'} ${c.value}`;
      b.onclick = () => send('play', { pin: currentPin, cardId: c.id });
      handEl.appendChild(b);
    });
  }

  function renderState(state) {
    pinText.textContent = state.pin;
    turnPlayerEl.textContent = state.players[state.turnIndex].name;
    renderCardFace(discardTop, state.discardTop, state.currentColor);
    const me = state.players.find((p) => p.id === playerId);
    if (me) renderHand(me.hand);
    renderOpponents(state.players);
    updateUnoButton(me);
    updateTurnArrow(state);
  }

  function updateTurnArrow(state) {
    // Place arrow between deck and pile, rotate toward whose turn it is
    const count = state.players.length;
    const index = state.turnIndex % count;
    const angle = (index / count) * 360; // rough mapping
    turnArrow.style.transform = `rotate(${angle}deg)`;
  }

  function renderOpponents(players) {
    opponentsEl.innerHTML = '';
    players.forEach((p) => {
      if (p.id === playerId) return;
      const wrap = document.createElement('div');
      wrap.className = 'opponent';
      const backs = document.createElement('div');
      backs.style.display = 'flex';
      backs.style.gap = '4px';
      const count = p.hand.length;
      for (let i=0;i<count;i++) {
        const b = document.createElement('div');
        b.className = 'back';
        backs.appendChild(b);
      }
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = p.name;
      wrap.appendChild(backs);
      wrap.appendChild(name);
      opponentsEl.appendChild(wrap);
    });
  }

  function updateUnoButton(me) {
    if (!me) { unoBtn.hidden = true; return; }
    const hasOne = me.hand.length === 1;
    unoBtn.hidden = !hasOne;
  }

  function colorToHex(color) {
    switch (color) {
      case 'red': return 'var(--red)';
      case 'yellow': return 'var(--yellow)';
      case 'green': return 'var(--green)';
      case 'blue': return 'var(--blue)';
      default: return '#666';
    }
  }

  function notify(text) {
    const line = document.createElement('div');
    line.textContent = text;
    messages.appendChild(line);
    messages.scrollTop = messages.scrollHeight;
  }

  // UI events
  createBtn.onclick = () => {
    const name = $('#hostName').value.trim() || 'Host';
    ensureConnected(() => send('create_lobby', { name }));
  };
  joinBtn.onclick = () => {
    const name = $('#joinName').value.trim() || 'Player';
    const pin = $('#joinPin').value.trim();
    if (!pin || pin.length !== 6) { notify('Enter a valid 6-digit PIN'); return; }
    ensureConnected(() => send('join_lobby', { name, pin }));
  };
  startBtn.onclick = () => {
    if (!currentPin) { notify('Create or join a lobby first'); return; }
    notify('Starting game...');
    ensureConnected(() => send('start_game', { pin: currentPin }));
  };

  hostChoice.onclick = () => { modeSelect.hidden = true; hostPanel.hidden = false; joinPanel.hidden = true; playersPanel.hidden = true; };
  joinChoice.onclick = () => { modeSelect.hidden = true; joinPanel.hidden = false; hostPanel.hidden = true; playersPanel.hidden = true; };
  backFromHost.onclick = () => { modeSelect.hidden = false; hostPanel.hidden = true; joinPanel.hidden = true; playersPanel.hidden = true; };
  backFromJoin.onclick = () => { modeSelect.hidden = false; hostPanel.hidden = true; joinPanel.hidden = true; playersPanel.hidden = true; };
  leaveLobby.onclick = () => { modeSelect.hidden = false; hostPanel.hidden = true; joinPanel.hidden = true; playersPanel.hidden = true; currentPin = null; playersList.innerHTML = ''; createdPin.textContent = ''; };

  drawPileFace.onclick = () => send('draw', { pin: currentPin });
  unoBtn.onclick = () => send('uno', { pin: currentPin });
  unoSelfBtn.onclick = () => { send('uno', { pin: currentPin }); unoOverlay.hidden = true; };
  callUnoBtn.onclick = () => { send('call_uno', { pin: currentPin }); unoOverlay.hidden = true; };

  colorPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('button.color');
    if (!btn) return;
    const color = btn.dataset.color;
    colorPicker.hidden = true;
    send('choose_color', { pin: currentPin, color, cardId: awaitingColorChoice });
    awaitingColorChoice = null;
  });

  connect();
})();


