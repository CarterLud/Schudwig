// Simple UNO Twist server using ws (WebSocket)
// Run: npm install && npm start

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;

// In-memory lobbies
/** @type {Record<string, Lobby>} */
const lobbies = Object.create(null);

// Types (JSDoc for clarity)
/**
 * @typedef {{ id:string, name:string, hand:Card[], saidUno:boolean, isBot?:boolean }} Player
 * @typedef {{ color:'red'|'yellow'|'green'|'blue'|null, value:string, type:'number'|'action'|'wild', id:string }} Card
 * @typedef {{ name:string, description:string, key:string }} Twist
 * @typedef {{ pin:string, hostId:string, players:Player[], started:boolean, drawPile:Card[], discardPile:Card[], currentColor:'red'|'yellow'|'green'|'blue'|null, turnIndex:number, direction:number, pendingDraw:number, twist:Twist, slamTrack?:{received:Set<string>, timeout?:NodeJS.Timeout}, deferAdvanceSkip?:number, unoWindow?:{playerId:string, resolved:boolean, aiTimeout?:NodeJS.Timeout} }} Lobby
 */

function genPin() {
  let pin;
  do { pin = Math.floor(100000 + Math.random() * 900000).toString(); } while (lobbies[pin]);
  return pin;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function buildDeck() {
  /** @type {Card[]} */
  const deck = [];
  const colors = ['red','yellow','green','blue'];
  for (const color of colors) {
    // one 0, two 1-9, two Draw2, two Skip, two Reverse
    deck.push({ color, value:'0', type:'number', id: uid() });
    for (let i=1;i<=9;i++) { deck.push({ color, value:String(i), type:'number', id: uid() }, { color, value:String(i), type:'number', id: uid() }); }
    for (let i=0;i<2;i++) {
      deck.push({ color, value:'Draw2', type:'action', id: uid() });
      deck.push({ color, value:'Skip', type:'action', id: uid() });
      deck.push({ color, value:'Reverse', type:'action', id: uid() });
    }
  }
  for (let i=0;i<4;i++) { deck.push({ color:null, value:'Wild', type:'wild', id: uid() }); deck.push({ color:null, value:'+4', type:'wild', id: uid() }); }
  return shuffle(deck);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/** @returns {Twist[]} */
function getTwists() {
  const list = [
    ['Hot Potato','Every time a 0 is played, pass hands left','hot_potato'],
    ['Hand Swap','Play a 7 to swap hands with another player','hand_swap'],
    ['Draw Dump','If drawn card matches discard, you must play it','draw_dump'],
    ['Color Lock','Declared color stays until a Wild is played','color_lock'],
    ['Last Card Wild','Your final card must be a Wild','last_card_wild'],
    ['Reverse Draw','Draw 2/+4 makes the player who played it draw','reverse_draw'],
    ['Stack Chaos','Draw 2/+4 stack and penalty doubles','stack_chaos'],
    ['Wild Shuffle','Every Wild shuffles discard into deck','wild_shuffle'],
    ['Color Swap','Wild causes hand pass left','color_swap'],
    ['Card Gift','When you play Skip, give one card to another','card_gift'],
    ['Mirror Match','Same exact card can be slapped out of turn','mirror_match'],
    ['Quick Draw','Two same numbers in a row → others draw 2','quick_draw'],
    ['Exploding Color','Three same color in a row → everyone draws 3','exploding_color'],
    ['UNO Bomb','Forget UNO? Draw 7','uno_bomb'],
    ['Everyone Draws','First Wild forces all to draw 2','everyone_draws_first_wild'],
    ['Keyboard Slam','On Wild, last to press Space draws 2','keyboard_slam'],
    ['Double Play','Must play two of same number if possible','double_play'],
    ['No Numbers','Only action cards; numbers only by stacking','no_numbers'],
    ['Reverse World','Skips act as Reverses and vice versa','reverse_world'],
    ['Lucky 13','If you reach 13 cards, discard half','lucky_13'],
    ['Sudden Death','Rule mistake knocks you out','sudden_death'],
    ['Wild Draw Swap','+4 makes next player swap hands instead','wild_draw_swap'],
    ['UNO Roulette','Roll a die at start of turn','uno_roulette'],
    ['Last Laugh','Winner makes one opponent draw 5','last_laugh'],
    ['Joker’s Rule','Dealer invents a house rule','jokers_rule'],
    ['Draw Echo','If you draw 2+, choose another to draw 1','draw_echo'],
    ['Skip Chain','Two Skips in a row skip third player','skip_chain'],
    ['Color Bomb','Only one color in hand → draw 4','color_bomb'],
    ['Wild Echo','Whenever you play a Wild, draw 1','wild_echo'],
    ['Reverse Chain','Two Reverses cancel each other','reverse_chain']
  ];
  return list.map(([name, description, key]) => ({ name, description, key }));
}

function broadcast(lobby, data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1 && ws.lobbyPin === lobby.pin) ws.send(payload);
  });
}

function sendState(lobby) {
  const state = serializeState(lobby);
  broadcast(lobby, { type: 'state', state });
}

function serializeState(lobby) {
  return {
    pin: lobby.pin,
    players: lobby.players.map((p) => ({ id: p.id, name: p.name, hand: p.hand.map(redactCard) })),
    discardTop: lobby.discardPile[lobby.discardPile.length - 1] || null,
    currentColor: lobby.currentColor,
    turnIndex: lobby.turnIndex,
  };
}

function redactCard(c) { return { color: c.color, value: c.value, type: c.type, id: c.id }; }

function createLobby(hostName) {
  const pin = genPin();
  /** @type {Lobby} */
  const lobby = {
    pin,
    hostId: '',
    players: [],
    started: false,
    drawPile: buildDeck(),
    discardPile: [],
    currentColor: null,
    turnIndex: 0,
    direction: 1,
    pendingDraw: 0,
    twist: pickTwist(),
    deferAdvanceSkip: 0,
  };
  lobbies[pin] = lobby;
  const host = addPlayer(lobby, hostName);
  lobby.hostId = host.id;
  return { lobby, host };
}

function pickTwist() {
  const list = getTwists();
  return list[Math.floor(Math.random() * list.length)];
}

function addPlayer(lobby, name) {
  const player = { id: uid(), name, hand: [], saidUno: false };
  lobby.players.push(player);
  return player;
}

function startGame(lobby) {
  if (lobby.started) return;
  lobby.started = true;
  // If only one player, add an AI opponent
  if (lobby.players.length === 1) {
    const bot = { id: 'bot_'+uid(), name: 'AI Bot', hand: [], saidUno: false, isBot: true };
    lobby.players.push(bot);
  }
  // Deal 7
  for (let r=0;r<7;r++) {
    for (const p of lobby.players) p.hand.push(drawCard(lobby));
  }
  // Flip first non-action wild for discard
  let first;
  do { first = drawCard(lobby); } while (first.type === 'wild');
  lobby.discardPile.push(first);
  lobby.currentColor = first.color;
}

function drawCard(lobby) {
  if (lobby.drawPile.length === 0) {
    // reshuffle discard (keep top)
    const top = lobby.discardPile.pop();
    lobby.drawPile = shuffle(lobby.discardPile);
    lobby.discardPile = [top];
  }
  return lobby.drawPile.pop();
}

function canPlay(card, top, currentColor) {
  if (!top) return true;
  if (card.type === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === top.value) return true;
  return false;
}

function advanceTurn(lobby, skipCount=0) {
  const n = lobby.players.length;
  lobby.turnIndex = (lobby.turnIndex + lobby.direction + n) % n;
  if (skipCount > 0) {
    for (let i=0;i<skipCount;i++) lobby.turnIndex = (lobby.turnIndex + lobby.direction + n) % n;
  }
  maybeTriggerBotTurn(lobby);
}

function handlePlay(lobby, player, cardId, ws) {
  const top = lobby.discardPile[lobby.discardPile.length - 1];
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return;
  const card = player.hand[idx];

  if (!canPlay(card, top, lobby.currentColor)) return;

  // enforce pending draw must be taken first
  if (lobby.pendingDraw > 0 && !(card.type === 'wild' && card.value === '+4') && !(card.type==='action' && card.value==='Draw2')) {
    return;
  }

  player.hand.splice(idx,1);
  lobby.discardPile.push(card);

  if (card.type === 'wild') {
    if (player.isBot) {
      // Bot chooses color automatically based on hand composition
      const color = pickBestColor(player);
      lobby.currentColor = color;
      if (lobby.twist.key === 'keyboard_slam') triggerKeyboardSlam(lobby);
      if (lobby.twist.key === 'wild_shuffle') reshuffleDiscardIntoDeck(lobby);
      if (card.value === '+4') lobby.pendingDraw += 4;
      // proceed turn
    } else {
      // ask for color from human
      ws && ws.send(JSON.stringify({ type:'choose_color', cardId: card.id }));
      if (lobby.twist.key === 'keyboard_slam') triggerKeyboardSlam(lobby);
      if (lobby.twist.key === 'wild_shuffle') reshuffleDiscardIntoDeck(lobby);
      if (card.value === '+4') lobby.pendingDraw += 4;
      return; // color will be set later by human
    }
  } else {
    lobby.currentColor = card.color;
  }
  let skipNext = 0;

  if (card.type === 'action') {
    if (card.value === 'Skip') skipNext = 1;
    if (card.value === 'Reverse') lobby.direction *= -1;
    if (card.value === 'Draw2') lobby.pendingDraw += 2;
    if (card.value === 'Reverse' && lobby.players.length === 2) skipNext = 1; // UNO quirk
  }

  // Twist: Hot Potato on 0
  if (lobby.twist.key === 'hot_potato' && card.value === '0') passHands(lobby, +1);

  // Twist: Hand Swap on 7 — skip targeting in MVP (swap with next player)
  if (lobby.twist.key === 'hand_swap' && card.value === '7') swapWithNext(lobby, player);

  // Victory check
  if (player.hand.length === 0) {
    broadcast(lobby, { type:'message', text: `${player.name} wins the round!` });
  }

  // UNO penalty: if a player plays to 1 card and didn't say UNO earlier this turn, others can call
  if (player.hand.length === 1) {
    player.saidUno = false; // reset; must press UNO now
    // Setup UNO reaction window; if bot, delay their UNO by 1s
    lobby.unoWindow = { playerId: player.id, resolved: false };
    if (player.isBot) {
      const botRef = player;
      lobby.unoWindow.aiTimeout = setTimeout(() => {
        if (lobby.unoWindow && !lobby.unoWindow.resolved && lobby.unoWindow.playerId === botRef.id) {
          botRef.saidUno = true;
          broadcast(lobby, { type:'message', text: `${botRef.name} says UNO!` });
          lobby.unoWindow.resolved = true;
        }
      }, 1000);
    }
  }

  // Start UNO reaction window if player now has 1 card
  if (player.hand.length === 1) {
    setupUnoWindow(lobby, player);
  }
  // Draw penalties apply immediately and pass turn
  if (lobby.pendingDraw > 0) {
    applyPendingDrawImmediate(lobby);
    return;
  }
  advanceTurn(lobby, skipNext);
}

function handleChooseColor(lobby, player, color, cardId) {
  const played = lobby.discardPile[lobby.discardPile.length - 1];
  if (!played || played.id !== cardId) return;
  if (!['red','yellow','green','blue'].includes(color)) return;
  lobby.currentColor = color;
  advanceTurn(lobby);
}

function handleDraw(lobby, player) {
  if (lobby.pendingDraw > 0) { applyPendingDrawImmediate(lobby); return; }
  player.hand.push(drawCard(lobby));
  // If they had one card and didn't say UNO, penalize 2 (simple detection)
  if (player.hand.length === 2 && !player.saidUno) {
    player.hand.push(drawCard(lobby), drawCard(lobby));
    broadcast(lobby, { type:'message', text:`UNO penalty: ${player.name} draws 2` });
  }
  advanceTurn(lobby);
}

function applyPendingDrawImmediate(lobby) {
  const n = lobby.players.length;
  const nextIndex = (lobby.turnIndex + lobby.direction + n) % n;
  const target = lobby.players[nextIndex];
  for (let i=0;i<lobby.pendingDraw;i++) target.hand.push(drawCard(lobby));
  lobby.pendingDraw = 0;
  // skip the penalized player's turn
  lobby.turnIndex = nextIndex;
  advanceTurn(lobby, 1);
}

function passHands(lobby, offset) {
  const hands = lobby.players.map((p) => p.hand);
  lobby.players.forEach((p, i) => { p.hand = hands[(i + offset + hands.length) % hands.length]; });
}

function swapWithNext(lobby, player) {
  const i = lobby.players.findIndex((p)=>p.id===player.id);
  const j = (i + 1) % lobby.players.length;
  const tmp = lobby.players[i].hand; lobby.players[i].hand = lobby.players[j].hand; lobby.players[j].hand = tmp;
}

function reshuffleDiscardIntoDeck(lobby) {
  const top = lobby.discardPile.pop();
  lobby.drawPile.push(...lobby.discardPile);
  lobby.discardPile = [top];
  shuffle(lobby.drawPile);
}

function triggerKeyboardSlam(lobby) {
  if (!lobby.started) return; // safety
  if (lobby.twist.key !== 'keyboard_slam') return; // only if twist active
  lobby.slamTrack = { received: new Set() };
  broadcast(lobby, { type:'slam_start' });
  clearTimeout(lobby.slamTrack.timeout);
  lobby.slamTrack.timeout = setTimeout(() => {
    // Penalize last to respond (pick one who didn't respond; if all did, penalize random)
    const nonResponders = lobby.players.filter(p => !lobby.slamTrack.received.has(p.id));
    const target = nonResponders.length ? nonResponders[Math.floor(Math.random()*nonResponders.length)] : lobby.players[Math.floor(Math.random()*lobby.players.length)];
    for (let i=0;i<2;i++) target.hand.push(drawCard(lobby));
    broadcast(lobby, { type:'slam_penalty', playerName: target.name, count: 2 });
    sendState(lobby);
  }, 2000);
}

function pickBestColor(player) {
  const counts = { red:0, yellow:0, green:0, blue:0 };
  for (const c of player.hand) if (c.color && counts.hasOwnProperty(c.color)) counts[c.color]++;
  let best = 'red'; let max = -1;
  for (const k of Object.keys(counts)) { if (counts[k] > max) { max = counts[k]; best = k; } }
  return best;
}

function maybeTriggerBotTurn(lobby) {
  if (!lobby.started) return;
  const current = lobby.players[lobby.turnIndex];
  if (!current || !current.isBot) return;
  setTimeout(() => botTakeTurn(lobby, current), 600);
}

function botTakeTurn(lobby, bot) {
  if (!lobby.started) return;
  const top = lobby.discardPile[lobby.discardPile.length - 1];
  // If pending draws, bot cannot avoid unless +4/Draw2
  const playable = bot.hand.filter((c) => {
    if (lobby.pendingDraw > 0) return (c.type==='wild' && c.value==='+4') || (c.type==='action' && c.value==='Draw2');
    return canPlay(c, top, lobby.currentColor);
  });
  let card;
  // Prefer non-wild when possible
  card = playable.find(c => c.type !== 'wild') || playable[0];
  if (card) {
    handlePlay(lobby, bot, card.id, null);
    sendState(lobby);
    return;
  }
  // Otherwise draw
  handleDraw(lobby, bot);
  sendState(lobby);
}

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(String(data)); } catch { return; }
    const t = msg.type;
    if (t === 'create_lobby') {
      const { lobby, host } = createLobby(msg.name || 'Host');
      ws.lobbyPin = lobby.pin;
      ws.playerId = host.id;
      // reply to creator first, then broadcast player list
      ws.send(JSON.stringify({ type: 'lobby_created', pin: lobby.pin, playerId: host.id, hostId: lobby.hostId, players: lobby.players.map(p=>({id:p.id,name:p.name})) }));
      broadcast(lobby, { type:'lobby_update', hostId:lobby.hostId, players: lobby.players.map(p=>({id:p.id,name:p.name})) });
    } else if (t === 'join_lobby') {
      const lobby = lobbies[msg.pin];
      if (!lobby) { ws.send(JSON.stringify({ type:'error', message:'Invalid PIN' })); return; }
      if (lobby.started) { ws.send(JSON.stringify({ type:'error', message:'Game already started' })); return; }
      const player = addPlayer(lobby, msg.name || 'Player');
      ws.lobbyPin = lobby.pin;
      ws.playerId = player.id;
      ws.send(JSON.stringify({ type:'joined_lobby', pin:lobby.pin, playerId: player.id, hostId: lobby.hostId, players: lobby.players.map(p=>({id:p.id,name:p.name})) }));
      broadcast(lobby, { type:'lobby_update', hostId: lobby.hostId, players: lobby.players.map(p=>({id:p.id,name:p.name})) });
    } else if (t === 'start_game') {
      const lobby = lobbies[msg.pin]; if (!lobby) { ws.send(JSON.stringify({ type:'error', message:'Lobby not found' })); return; }
      if (ws.playerId !== lobby.hostId) { ws.send(JSON.stringify({ type:'error', message:'Only the host can start' })); return; }
      if (lobby.started) { ws.send(JSON.stringify({ type:'error', message:'Game already started' })); return; }
      if (lobby.players.length < 1) { ws.send(JSON.stringify({ type:'error', message:'No players in lobby' })); return; }
      startGame(lobby);
      const payload = { type:'game_started', twist: lobby.twist, state: serializeState(lobby) };
      broadcast(lobby, payload);
    } else if (t === 'play') {
      const lobby = lobbies[msg.pin]; if (!lobby) return;
      const player = lobby.players.find(p=>p.id===ws.playerId); if (!player) return;
      handlePlay(lobby, player, msg.cardId, ws);
      sendState(lobby);
    } else if (t === 'choose_color') {
      const lobby = lobbies[msg.pin]; if (!lobby) return;
      const player = lobby.players.find(p=>p.id===ws.playerId); if (!player) return;
      handleChooseColor(lobby, player, msg.color, msg.cardId);
      sendState(lobby);
    } else if (t === 'draw') {
      const lobby = lobbies[msg.pin]; if (!lobby) return;
      const player = lobby.players.find(p=>p.id===ws.playerId); if (!player) return;
      handleDraw(lobby, player);
      sendState(lobby);
    } else if (t === 'uno') {
      const lobby = lobbies[msg.pin]; if (!lobby) return;
      const player = lobby.players.find(p=>p.id===ws.playerId); if (!player) return;
      player.saidUno = true;
      broadcast(lobby, { type:'message', text: `${player.name} says UNO!` });
    } else if (t === 'slam') {
      const lobby = lobbies[ws.lobbyPin]; if (!lobby || !lobby.slamTrack) return;
      lobby.slamTrack.received.add(ws.playerId);
    } else if (t === 'ping') {
      ws.send(JSON.stringify({ type:'pong' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`UNO Twist server running on :${PORT}`);
});


