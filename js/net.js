// ============================================================
//  Online versus mode (up to 8 friends), peer to peer via PeerJS.
//  The host's room code is their peer id. The host decides pairings,
//  seeds and standings; every PC replays the same battle from the seed.
// ============================================================
const NET_PREFIX = 'npap-v1-';
const TURN_SECONDS = 90;
const MAX_PLAYERS = 8;
const NET_LIVES = 5;

const NET = {
  active: false, isHost: false, peer: null, conn: null, conns: {},
  myId: null, myName: '', code: '', players: {}, order: [],
  turn: 0, deadline: 0, timerInt: null, phase: 'lobby', pendingTurn: null, lastBattle: null,
  hostTimeout: null,

  // ---------- setup ----------
  host(name) {
    this.reset(); this.isHost = true; this.myName = name;
    this.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    this.peer = new Peer(NET_PREFIX + this.code);
    this.peer.on('open', id => {
      this.myId = id; this.active = true;
      this.addPlayer(id, name);
      this.peer.on('connection', conn => this.hostAccept(conn));
      this.showLobby();
    });
    this.peer.on('error', e => this.fail(e.type === 'unavailable-id' ? 'that room code is taken, try again' : 'connection error: ' + e.type));
  },
  join(name, code) {
    this.reset(); this.myName = name; this.code = code.toUpperCase().trim();
    this.peer = new Peer();
    this.peer.on('open', id => {
      this.myId = id;
      const conn = this.peer.connect(NET_PREFIX + this.code, { reliable: true });
      this.conn = conn;
      const t = setTimeout(() => this.fail('could not reach room ' + this.code + '. check the code'), 12000);
      conn.on('open', () => { clearTimeout(t); this.active = true; conn.send({ t: 'hello', name }); });
      conn.on('data', m => this.onMessage(m));
      conn.on('close', () => { if (this.active) this.fail('the host left. and you cry'); });
    });
    this.peer.on('error', e => this.fail(e.type === 'peer-unavailable' ? 'room ' + this.code + ' not found' : 'connection error: ' + e.type));
  },
  reset() {
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    clearInterval(this.timerInt); clearTimeout(this.hostTimeout);
    Object.assign(this, { active: false, isHost: false, peer: null, conn: null, conns: {}, players: {}, order: [], turn: 0, phase: 'lobby', pendingTurn: null, lastBattle: null });
  },
  leave() {
    this.reset();
    this.sdPanel(null);
    $('#hud-sd').classList.add('hidden');
    $('#hud-timer').classList.add('hidden');
    S = null; battleBusy = false;
    $('#result').classList.add('hidden'); $('#modal').classList.add('hidden');
    toTitle();
  },
  fail(msg) {
    const wasActive = this.active;
    this.reset();
    $('#hud-timer').classList.add('hidden');
    S = null; battleBusy = false; $('#result').classList.add('hidden');
    $('#hud-sd').classList.add('hidden');
    showScreen('title');
    openModal(`<h2>online</h2><p class="cap-style" style="font-size:24px">${msg}</p><button class="big" id="net-back">back</button>`);
    $('#net-back').onclick = () => { closeModal(); onlineMenu(); };
    if (!wasActive) return;
  },

  // ---------- host side ----------
  addPlayer(id, name) {
    this.players[id] = { id, name: name.slice(0, 16) || 'player', lives: NET_LIVES, wins: 0, alive: true, team: [], ready: false, done: false, connected: true };
    this.order.push(id);
  },
  hostAccept(conn) {
    conn.on('data', m => this.hostHandle(conn.peer, m, conn));
    conn.on('close', () => {
      const p = this.players[conn.peer]; delete this.conns[conn.peer];
      if (!p) return;
      p.connected = false;
      if (this.phase === 'lobby') { delete this.players[conn.peer]; this.order = this.order.filter(x => x !== conn.peer); }
      else { p.alive = false; p.lives = 0; }
      this.broadcast({ t: 'lobby', players: this.publicPlayers(), code: this.code, msg: `${p.name} left` });
      this.hostCheckProgress();
    });
  },
  hostHandle(from, m, conn) {
    if (m.t === 'hello') {
      if (this.phase !== 'lobby') { conn && conn.send({ t: 'error', msg: 'that game already started' }); return; }
      if (this.order.length >= MAX_PLAYERS) { conn && conn.send({ t: 'error', msg: 'room is full (8 players)' }); return; }
      this.conns[from] = conn;
      this.addPlayer(from, m.name);
      this.broadcast({ t: 'lobby', players: this.publicPlayers(), code: this.code });
    } else if (m.t === 'ready') {
      const p = this.players[from]; if (!p || this.phase !== 'shop') return;
      p.team = m.team; p.ready = true;
      this.broadcast({ t: 'status', ready: this.aliveIds().filter(id => this.players[id].ready).length, total: this.aliveIds().length });
      this.hostCheckProgress();
    } else if ((m.t === 'sd_vote' || m.t === 'sd_pick') && this.sd) {
      this.hostHandleSd(from, m);
    } else if (m.t === 'done') {
      const p = this.players[from]; if (p) p.done = true;
      this.hostCheckProgress();
    }
  },
  aliveIds() { return this.order.filter(id => this.players[id].alive); },
  publicPlayers() { return this.order.map(id => { const p = this.players[id]; return { id, name: p.name, lives: p.lives, wins: p.wins, alive: p.alive, connected: p.connected }; }); },
  hostStart() {
    if (this.order.length < 2) return toast('need at least 2 players');
    this.phase = 'starting';
    this.playlist = newPlaylist();
    this.hostNextTurn();
  },
  hostNextTurn() {
    clearTimeout(this.hostTimeout);
    this.turn++;
    const alive = this.aliveIds();
    const sudden = alive.length === 2 && alive.every(id => this.players[id].lives === 1);
    this.turnSongs = sudden ? { shop: SD_SONG, battle: SD_SONG } : { shop: nextSong(this.playlist), battle: nextSong(this.playlist) };
    this.sd = sudden ? { mode: null, votes: {}, picks: {}, bans: null, resolved: false } : null;
    this.hostStartShop();
  },
  hostStartShop() {
    clearTimeout(this.hostTimeout);
    this.phase = 'shop';
    this.order.forEach(id => { const p = this.players[id]; p.ready = !p.alive; p.done = false; });
    this.broadcast({ t: 'turn', turn: this.turn, seconds: TURN_SECONDS, players: this.publicPlayers(), songs: this.turnSongs,
                     sudden: this.sd ? { mode: this.sd.mode } : null });
    // anyone who hasn't sent a team 15s after the timer keeps their last team
    this.hostTimeout = setTimeout(() => {
      this.aliveIds().forEach(id => { this.players[id].ready = true; });
      this.hostCheckProgress();
    }, (TURN_SECONDS + 15) * 1000);
  },
  hostCheckProgress() {
    if (!this.isHost) return;
    if (this.phase === 'shop' && this.aliveIds().every(id => this.players[id].ready)) {
      if (this.sd && !this.sd.resolved) this.hostStartVote();
      else this.hostRunBattles();
    }
    else if (this.phase === 'battle' && this.order.every(id => this.players[id].done || !this.players[id].connected)) this.hostAfterBattles();
  },
  hostRunBattles() {
    clearTimeout(this.hostTimeout);
    this.phase = 'battle';
    const ids = this.aliveIds().slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const list = [];
    while (ids.length >= 2) list.push([ids.pop(), ids.pop()]);
    if (ids.length === 1) list.push([ids.pop(), 'ghost']);
    const battles = list.map(([a, b]) => {
      const seed = this.sd && this.sd.bgSeed != null ? this.sd.bgSeed : Math.floor(Math.random() * 1e9);
      let teamB, nameB;
      if (b === 'ghost') {
        const dead = this.order.filter(id => !this.players[id].alive && this.players[id].team.length);
        if (dead.length) { const d = this.players[pick(dead)]; teamB = d.team; nameB = 'ghost of ' + d.name; }
        else { teamB = buildBotTeam(this.turn, mulberry32(seed + 1)).map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp, item: u.item, uid: u.uid })); nameB = 'ghost: ' + pick(TEAM_NAMES); }
      } else { teamB = this.players[b].team; nameB = this.players[b].name; }
      const teamA = this.players[a].team;
      const ban = this.sd && this.sd.bans ? this.sd.bans.filter(r => r.target === a || r.target === b).map(r => ({ side: r.target === a ? 'A' : 'B', uid: r.uid })) : null;
      const res = simulateBattle(netTeam(teamA), netTeam(teamB), seed, { ban }).result;
      return { a, b, seed, teamA, teamB, nameA: this.players[a].name, nameB, result: res, ban, sudden: !!this.sd };
    });
    // standings: winner +1 trophy, loser -1 life
    battles.forEach(bt => {
      const A = this.players[bt.a], B = this.players[bt.b];
      if (bt.result === 'win') { A.wins++; if (B) B.lives--; }
      else if (bt.result === 'lose') { A.lives--; if (B) B.wins++; }
    });
    this.order.forEach(id => { const p = this.players[id]; if (p.lives <= 0) p.alive = false; p.done = !p.connected; });
    this.broadcast({ t: 'battles', turn: this.turn, battles, players: this.publicPlayers() });
    this.hostTimeout = setTimeout(() => { this.order.forEach(id => { this.players[id].done = true; }); this.hostCheckProgress(); }, 60000);
  },
  hostAfterBattles() {
    clearTimeout(this.hostTimeout);
    const alive = this.aliveIds();
    const champ = this.order.find(id => this.players[id].wins >= WIN_TARGET);
    if (alive.length <= 1 || champ) {
      this.phase = 'over';
      const winner = champ || alive[0] || null;
      this.broadcast({ t: 'end', winner, players: this.publicPlayers() });
    } else this.hostNextTurn();
  },
  broadcast(m) {
    Object.values(this.conns).forEach(c => { try { c.send(m); } catch (e) {} });
    this.onMessage(m); // host is a player too
  },
  send(m) {
    if (this.isHost) this.hostHandle(this.myId, m, null);
    else if (this.conn) this.conn.send(m);
  },

  // ---------- every player ----------
  onMessage(m) {
    if (m.t === 'lobby') { this.lobbyPlayers = m.players; if (this.phase === 'lobby') this.showLobby(m.msg); else if (m.msg) toast(m.msg); }
    else if (m.t === 'error') this.fail(m.msg);
    else if (m.t === 'status') { $('#net-wait-count') && ($('#net-wait-count').textContent = `${m.ready}/${m.total} ready`); }
    else if (m.t === 'turn') this.onTurn(m);
    else if (m.t === 'battles') this.onBattles(m);
    else if (m.t === 'end') this.onEnd(m);
    else if (m.t === 'sd_vote') this.onSdVote(m);
    else if (m.t === 'sd_mode') this.onSdMode(m);
    else if (m.t === 'sd_pick') this.onSdPick(m);
    else if (m.t === 'sd_result') this.onSdResult(m);
  },
  me(players) { return players.find(p => p.id === this.myId); },

  onTurn(m) {
    this.lobbyPlayers = m.players;
    const meP = this.me(m.players);
    if (this.phase === 'lobby' || this.phase === 'starting' || !S) {
      $('#modal').classList.add('hidden');
      S = { net: true, runId: 'net-' + this.myId, turn: 0, gold: START_GOLD, lives: NET_LIVES, wins: 0,
            team: [null, null, null, null, null], shop: { units: [], items: [] }, nikeKills: 0, history: [] };
    }
    if (!this.isHost) this.phase = 'shop';
    this.pendingTurn = m;
    // wait for the player to close the result screen first
    if ($('#result').classList.contains('hidden')) this.beginTurn();
  },
  beginTurn() {
    const m = this.pendingTurn; if (!m) return;
    this.pendingTurn = null;
    const meP = this.me(m.players);
    S.lives = meP.lives; S.wins = meP.wins;
    if (!meP.alive) return this.spectate(m.players);
    $('#modal').classList.add('hidden'); $('#modal-close').classList.remove('hidden');
    battleBusy = false;
    S.turn = m.turn - 1;
    this.songs = m.songs || this.songs;
    this.sudden = m.sudden || null;
    startTurn();
    $('#hud-sd').classList.toggle('hidden', !this.sudden);
    if (this.sudden) { ACH.unlock('sudden'); $('#hud-sd').textContent = '☠ sudden death · last round'; toast('sudden death. after the shop you pick: remove a buff or ban a card'); }
    this.deadline = Date.now() + m.seconds * 1000;
    $('#hud-timer').classList.remove('hidden');
    clearInterval(this.timerInt);
    this.timerInt = setInterval(() => {
      const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
      $('#hud-timer').textContent = `⏱ ${left}s`;
      $('#hud-timer').classList.toggle('urgent', left <= 10);
      if (left <= 0) { clearInterval(this.timerInt); if (!battleBusy) endTurn(true); }
    }, 250);
  },
  submitTeam() {
    clearInterval(this.timerInt);
    $('#hud-timer').textContent = '⏱ done';
    const team = S.team.filter(Boolean).map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp, item: u.item, uid: u.uid, buffs: u.buffs || [] }));
    // open the waiting screen first: for the host, send() can immediately open the next screen
    openModal(`<div style="text-align:center"><h2>wait a bit</h2><p class="cap-style" style="font-size:24px">waiting for the other players</p><p id="net-wait-count"></p></div>`);
    $('#modal-close').classList.add('hidden');
    this.send({ t: 'ready', team });
  },

  async onBattles(m) {
    $('#modal').classList.add('hidden'); $('#modal-close').classList.remove('hidden');
    this.lobbyPlayers = m.players;
    const bt = m.battles.find(b => b.a === this.myId || b.b === this.myId);
    if (!bt) { // already out: just follow the standings
      this.send({ t: 'done' });
      this.spectate(m.players);
      return;
    }
    const mineIsA = bt.a === this.myId;
    const res = simulateBattle(netTeam(bt.teamA), netTeam(bt.teamB), bt.seed, { ban: bt.ban });
    let frames = res.frames, result = res.result;
    if (!mineIsA) {
      frames = frames.map(f => ({ ...f, A: f.B, B: f.A }));
      result = result === 'win' ? 'lose' : result === 'lose' ? 'win' : 'draw';
    }
    if (!bt.sudden) phaseSong('battle');
    setBattleBg(bt.seed);
    showScreen('battle');
    $('#hud-sd') && $('#hud-sd').classList.add('hidden');
    this.sdPanel(null);
    $('#enemy-name').textContent = mineIsA ? bt.nameB : bt.nameA;
    $('#b-lives').textContent = S.lives; $('#b-wins').textContent = S.wins; $('#b-turn').textContent = S.turn;
    skipping = false;
    this.lastSudden = !!bt.sudden;
    this.lastGhost = mineIsA && /^ghost/.test(bt.nameB || '');
    await playBattle(frames, { result, seed: bt.seed, sudden: bt.sudden });
    S.nikeKills += mineIsA ? res.stats.cloneKills : res.stats.killsA;
    applyFusions(res.fusions, mineIsA ? 'A' : 'B');
    this.showResult(result, m.players);
  },
  standingsHTML(players) {
    const rows = players.slice().sort((a, b) => b.alive - a.alive || b.wins - a.wins || b.lives - a.lives).map(p =>
      `<tr class="${p.id === this.myId ? 'me' : ''} ${p.alive ? '' : 'out'}"><td>${p.name}${p.id === this.myId ? ' (you)' : ''}${p.connected === false ? ' · left' : ''}</td><td>🏆 ${p.wins}</td><td>${p.alive ? '❤️ ' + p.lives : 'is died'}</td></tr>`).join('');
    return `<table class="standings">${rows}</table>`;
  },
  showResult(result, players) {
    const meP = this.me(players);
    S.lives = meP.lives; S.wins = meP.wins; setColour();
    ACH.afterBattle(result, { wins: meP.wins, lives: meP.lives, startLives: NET_LIVES, ghost: this.lastGhost, net: true });
    playResultTheme(result, this.lastSudden);
    $('#result-title').textContent = result;
    $('#result-cap').textContent = pick(CAPTIONS[result]);
    $('#result-sub').innerHTML = (meP.alive ? '' : '<b style="color:#ff5252">you are out. and you cry</b>') + this.standingsHTML(players);
    $('#result').classList.remove('hidden');
    $('#caption').textContent = '';
    $('#btn-result').textContent = 'continue';
    $('#btn-result').onclick = () => {
      $('#result').classList.add('hidden');
      if (!this.pendingTurn && this.phase !== 'over') {
        openModal(`<div style="text-align:center"><h2>wait a bit</h2><p class="cap-style" style="font-size:24px">waiting for the others to finish their battles</p></div>`);
        $('#modal-close').classList.add('hidden');
      }
      this.send({ t: 'done' });
      if (this.pendingTurn) this.beginTurn();
    };
  },
  spectate(players) {
    showScreen('battle');
    $('#b-mine').innerHTML = ''; $('#b-theirs').innerHTML = '';
    $('#caption').textContent = 'you are out. watching the standings';
    openModal(`<div style="text-align:center"><h2>you are out</h2><p class="cap-style" style="font-size:22px">wait a bit for the end of the line</p>${this.standingsHTML(players)}<button id="net-leave2">leave game</button></div>`);
    $('#modal-close').classList.add('hidden');
    $('#net-leave2').onclick = () => this.leave();
  },
  onEnd(m) {
    clearInterval(this.timerInt);
    const win = m.winner === this.myId;
    ACH.unlock('firstfriend'); if (win) ACH.unlock('beatfriend');
    const w = m.players.find(p => p.id === m.winner);
    const show = () => {
      $('#result').classList.add('hidden'); $('#modal-close').classList.remove('hidden');
      if (win) document.documentElement.style.setProperty('--gray', '0');
      openModal(`<div style="text-align:center"><h2 style="font-size:64px">${win ? 'end of the line' : 'and you cry'}</h2>
        <p class="cap-style" style="font-size:24px">${w ? w.name + ' ends the line' : 'nobody survives the darius nuke aftermath'}</p>
        ${this.standingsHTML(m.players)}<button class="big" id="net-done">back to title</button></div>`);
      Audio2.play(win ? 'win' : 'lose');
      $('#net-done').onclick = () => this.leave();
    };
    // let the player read their last battle result first
    if (!$('#result').classList.contains('hidden')) { const b = $('#btn-result'); const old = b.onclick; b.onclick = () => { old && old(); show(); }; }
    else show();
  },

  // ---------- lobby UI ----------
  showLobby(msg) {
    const players = this.isHost ? this.publicPlayers() : (this.lobbyPlayers || []);
    openModal(`<h2>room <span class="room-code">${this.code}</span></h2>
      <p>${this.isHost ? 'send this code to your friends. they press <b>play online</b>, then <b>join</b>.' : 'connected. waiting for the host to start.'}</p>
      ${msg ? `<p class="cap-style">${msg}</p>` : ''}
      <ul class="lobby-list">${players.map(p => `<li>${p.name}${p.id === this.myId ? ' (you)' : ''}${p.id === NET_PREFIX + this.code ? ' 👑' : ''}</li>`).join('')}</ul>
      <p class="t">${players.length}/${MAX_PLAYERS} players · ${TURN_SECONDS}s per turn · ${NET_LIVES} lives · first to ${WIN_TARGET} wins or last one standing</p>
      <div style="display:flex;gap:12px">${this.isHost ? `<button class="big" id="net-start" ${players.length < 2 ? 'disabled' : ''}>start game</button>` : ''}<button id="net-leave">leave</button></div>`);
    $('#modal-close').classList.add('hidden');
    if (this.isHost) $('#net-start').onclick = () => this.hostStart();
    $('#net-leave').onclick = () => this.leave();
  },
};

const netTeam = team => (team || []).map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp, item: u.item, uid: u.uid }));

function onlineMenu() {
  let name = ''; try { name = localStorage.getItem('np_name') || ''; } catch (e) {}
  openModal(`<h2>play online</h2>
    <p>play versus with up to 8 friends. everyone shops at the same time, then you get paired up for battles.</p>
    <label class="field">your name <input id="net-name" maxlength="16" value="${name.replace(/"/g, '')}" placeholder="john tanner"></label>
    <div class="online-cols">
      <div><h3>host</h3><p class="t">make a room and share the code</p><button class="big" id="net-host">host game</button></div>
      <div><h3>join</h3><p class="t">enter a friend's room code</p><input id="net-code" maxlength="4" placeholder="ABCD" class="code-input"><button class="big" id="net-join">join</button></div>
    </div>
    <p class="t">needs an internet connection. connects directly between your PCs.</p>`);
  const getName = () => { const n = $('#net-name').value.trim() || 'player'; try { localStorage.setItem('np_name', n); } catch (e) {} return n; };
  $('#net-host').onclick = () => { const n = getName(); openModal('<h2>making room…</h2>'); NET.host(n); };
  $('#net-join').onclick = () => {
    const code = $('#net-code').value.trim(); if (code.length !== 4) return toast('room codes are 4 letters');
    const n = getName(); openModal('<h2>joining…</h2>'); NET.join(n, code);
  };
}

// ============================================================
//  Sudden death (2 players left, both on 1 life)
//  The last round's shop plays as normal. After both end their turn, the
//  battle screen shows both teams frozen and the choices appear below:
//  1. vote within 15s: remove a buff, or ban a card (only if both choose it)
//  2. pick within 20s: one buff on an enemy character, or one enemy card
//  3. a short countdown, then the battle (banned cards die first, live)
// ============================================================
const SD_SONG = 'assets/music/suddendeath.mp3';
const SD_VOTE_SECONDS = 15, SD_PICK_SECONDS = 20, SD_COUNTDOWN = 3;

Object.assign(NET, {
  // ---------- host ----------
  sdTeams() { const t = {}; this.aliveIds().forEach(id => { t[id] = this.players[id].team || []; }); return t; },
  sdNames() { return Object.fromEntries(this.aliveIds().map(id => [id, this.players[id].name])); },
  hostStartVote() {
    clearTimeout(this.hostTimeout);
    this.phase = 'sdvote'; this.sd.votes = {};
    this.sd.bgSeed = Math.floor(Math.random() * 1e9); // the sudden death battle reuses this seed, so its background doesn't change at the start
    this.broadcast({ t: 'sd_vote', bgSeed: this.sd.bgSeed, seconds: SD_VOTE_SECONDS, teams: this.sdTeams(), names: this.sdNames() });
    this.hostTimeout = setTimeout(() => this.hostResolveVote(), (SD_VOTE_SECONDS + 2) * 1000);
  },
  hostResolveVote() {
    if (!this.sd || this.phase !== 'sdvote') return;
    clearTimeout(this.hostTimeout);
    const ids = this.aliveIds();
    this.sd.mode = ids.every(id => this.sd.votes[id] === 'ban') ? 'ban' : 'debuff';
    this.phase = 'sdpick'; this.sd.picks = {};
    this.broadcast({ t: 'sd_mode', mode: this.sd.mode, votes: this.sd.votes });
    this.broadcast({ t: 'sd_pick', kind: this.sd.mode, seconds: SD_PICK_SECONDS, teams: this.sdTeams(), names: this.sdNames() });
    this.hostTimeout = setTimeout(() => this.hostResolvePicks(), (SD_PICK_SECONDS + 2) * 1000);
  },
  hostResolvePicks() {
    if (!this.sd || this.phase !== 'sdpick') return;
    clearTimeout(this.hostTimeout);
    this.phase = 'sdcount';
    const ids = this.aliveIds(), results = [];
    ids.forEach(me => {
      const opp = ids.find(x => x !== me); if (!opp) return;
      const oteam = this.players[opp].team || [];
      const pk = this.sd.picks[me];
      if (this.sd.mode === 'debuff') {
        const choices = sdBuffChoices(oteam);
        let c = pk && choices.find(x => x.uid === pk.uid && x.key === pk.buff);
        if (!c && choices.length) c = pick(choices); // ran out of time: random buff
        if (c) results.push({ target: opp, by: this.players[me].name, uid: c.uid, key: c.key, label: c.label, unit: c.unitName, a: c.a, h: c.h, item: c.item || null });
      } else {
        let u = pk && oteam.find(x => x.uid === pk.uid);
        if (!u && oteam.length) u = pick(oteam);
        if (u) results.push({ target: opp, by: this.players[me].name, uid: u.uid, unit: UNITS[u.id].name });
      }
    });
    if (this.sd.mode === 'debuff') results.forEach(r => sdApplyDebuff(this.players[r.target].team, r));
    else this.sd.bans = results.map(r => ({ target: r.target, uid: r.uid }));
    this.sd.resolved = true;
    this.broadcast({ t: 'sd_result', mode: this.sd.mode, list: results, teams: this.sdTeams(), countdown: SD_COUNTDOWN });
    this.hostTimeout = setTimeout(() => this.hostRunBattles(), (SD_COUNTDOWN + 2.5) * 1000);
  },
  hostHandleSd(from, m) {
    if (m.t === 'sd_vote' && this.phase === 'sdvote') {
      this.sd.votes[from] = m.choice;
      if (this.aliveIds().every(id => this.sd.votes[id])) this.hostResolveVote();
    } else if (m.t === 'sd_pick' && this.phase === 'sdpick') {
      this.sd.picks[from] = { uid: m.uid, buff: m.buff };
      if (this.aliveIds().every(id => this.sd.picks[id])) this.hostResolvePicks();
    }
  },

  // ---------- every player: the panel under the frozen battle ----------
  amAlive() { const p = (this.lobbyPlayers || []).find(x => x.id === this.myId); return !p || p.alive; },
  sdPanel(html) {
    const el = $('#sd-panel');
    if (html == null) { el.classList.add('hidden'); el.innerHTML = ''; clearInterval(this.sdInt); return; }
    el.innerHTML = html; el.classList.remove('hidden');
  },
  sdTimer(seconds, sel, onEnd) {
    clearInterval(this.sdInt);
    const end = Date.now() + seconds * 1000;
    const tick = () => {
      const n = $(sel); if (!n) return clearInterval(this.sdInt);
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      n.textContent = left + 's'; n.classList.toggle('urgent', left <= 5);
      if (!left) { clearInterval(this.sdInt); onEnd && onEnd(); }
    };
    tick(); this.sdInt = setInterval(tick, 200);
  },
  sdShowTeams(m) {
    const oppId = Object.keys(m.teams).find(id => id !== this.myId);
    this.sdOpp = oppId;
    renderBattleTeams({ A: m.teams[this.myId] || [], B: m.teams[oppId] || [] });
    if (m.names) $('#enemy-name').textContent = m.names[oppId];
    return oppId;
  },
  onSdVote(m) {
    if (!S || !this.amAlive()) return;
    $('#modal').classList.add('hidden'); $('#modal-close').classList.remove('hidden');
    $('#result').classList.add('hidden');
    if (m.bgSeed != null) setBattleBg(m.bgSeed);
    showScreen('battle');
    $('#b-lives').textContent = S.lives; $('#b-wins').textContent = S.wins; $('#b-turn').textContent = S.turn;
    this.sdShowTeams(m);
    showCaption('sudden death. its over when i say its over');
    this.sdPanel(`<div class="sd-head"><b class="sd-title-sm">sudden death</b><span class="sd-timer" id="sd-timer"></span></div>
      <p>card bans only happen if <b>both</b> players choose them, otherwise it's buff removal.</p>
      <div class="sd-choices">
        <button class="big" id="sd-debuff">remove a buff<small>take one buff or item off an enemy character</small></button>
        <button class="big danger" id="sd-ban">ban a card<small>each bans 1 enemy card. it dies at the start</small></button>
      </div><p id="sd-status" class="t"></p>`);
    this.sdTimer(m.seconds, '#sd-timer');
    const vote = choice => {
      this.send({ t: 'sd_vote', choice });
      $('#sd-debuff').disabled = $('#sd-ban').disabled = true;
      $(choice === 'ban' ? '#sd-ban' : '#sd-debuff').classList.add('chosen');
      $('#sd-status').textContent = 'wait a bit, waiting for your opponent';
      Audio2.play('click');
    };
    $('#sd-debuff').onclick = () => vote('debuff');
    $('#sd-ban').onclick = () => vote('ban');
  },
  onSdMode(m) {
    if (!S || !this.amAlive()) return;
    showCaption(m.mode === 'ban' ? 'both chose card bans' : 'buff removal');
  },
  onSdPick(m) {
    if (!S || !this.amAlive()) return;
    const oppId = this.sdShowTeams(m);
    const isBan = m.kind === 'ban';
    const oteam = m.teams[oppId] || [];
    const choices = sdBuffChoices(oteam);
    this.sdPanel(`<div class="sd-head"><b class="sd-title-sm">${isBan ? 'ban a card' : 'remove a buff'}</b><span class="sd-timer" id="sd-timer"></span></div>
      <p>${isBan ? `click one of <b>${m.names[oppId]}</b>'s cards. it dies at the start of the battle (faint abilities still trigger)` : `click one of <b>${m.names[oppId]}</b>'s cards, then the buff to remove`}</p>
      <div class="sd-buffs" id="sd-buffs"></div><p id="sd-status" class="t">${oteam.length ? '' : 'their team is empty. nothing to pick'}</p>`);
    this.sdTimer(m.seconds, '#sd-timer');
    let done = false;
    const cards = [...document.querySelectorAll('#b-theirs .card')];
    const send = (uid, buff) => {
      if (done) return; done = true;
      this.send({ t: 'sd_pick', uid, buff });
      cards.forEach(c => { c.classList.remove('pickable'); c.classList.toggle('dim', c.dataset.uid != uid); });
      $('#sd-buffs').innerHTML = '';
      $('#sd-status').textContent = 'wait a bit, waiting for your opponent';
      Audio2.play('click');
    };
    cards.forEach(el => {
      const uid = +el.dataset.uid;
      const mine = choices.filter(c => c.uid === uid);
      if (isBan || mine.length) el.classList.add('pickable'); else el.classList.add('dim');
      el.onclick = () => {
        if (done) return;
        if (isBan) return send(uid);
        if (!mine.length) return toast('no buffs on this one');
        cards.forEach(c => c.classList.remove('sel')); el.classList.add('sel');
        $('#sd-buffs').innerHTML = mine.map((c, i) => `<button data-i="${i}">${c.label}</button>`).join('');
        $('#sd-buffs').querySelectorAll('button').forEach(b => b.onclick = () => send(uid, mine[+b.dataset.i].key));
      };
    });
  },
  onSdResult(m) {
    if (!S) return;
    clearInterval(this.sdInt);
    const lines = m.list.map(r => {
      const mineTarget = r.target === this.myId;
      if (m.mode === 'ban') return mineTarget ? `${r.by} bans your ${r.unit}` : `you ban ${r.unit}`;
      if (mineTarget) {
        sdApplyDebuff(S.team, r); // keep your own shop team in sync too
        const u = S.team.find(x => x && x.uid === r.uid); if (u) u.debuffNote = `${r.by} removed ${r.label}`;
        return `${r.by} removes ${r.label} from your ${r.unit}`;
      }
      return `you remove ${r.label} from ${r.unit}`;
    });
    if (!this.amAlive()) return;
    if (m.mode === 'ban') ACH.unlock('mutual');
    else if (m.list.some(r => r.target !== this.myId)) ACH.unlock('banhammer');
    this.sdShowTeams(m);
    if (m.mode === 'ban') m.list.forEach(r => {
      const side = r.target === this.myId ? '#b-mine' : '#b-theirs';
      const el = document.querySelector(`${side} .card[data-uid="${r.uid}"]`); if (el) el.classList.add('banned');
    });
    else m.list.forEach(r => {
      const side = r.target === this.myId ? '#b-mine' : '#b-theirs';
      const el = document.querySelector(`${side} .card[data-uid="${r.uid}"]`);
      if (el) { el.classList.add('shake'); const f = document.createElement('div'); f.className = 'float dmg'; f.style.animationDuration = '2.5s'; f.textContent = r.item ? 'item removed' : `-${r.a}/-${r.h}`; el.appendChild(f); }
    });
    this.sdPanel(`${lines.map(l => `<p class="cap-style sd-line">${l}</p>`).join('')}<div class="sd-count" id="sd-count"></div>`);
    let n = m.countdown;
    const step = () => {
      const c = $('#sd-count'); if (!c) return;
      c.textContent = n > 0 ? n : 'free fight';
      c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
      Audio2.play(n > 0 ? 'click' : 'start');
      if (n-- > 0) this.sdCountT = setTimeout(step, 1000);
    };
    clearTimeout(this.sdCountT);
    this.sdCountT = setTimeout(step, 600);
  },
});

// remove one buff (or the held item) from a unit in a team
function sdApplyDebuff(team, r) {
  const u = (team || []).find(x => x && x.uid === r.uid); if (!u) return;
  if (r.item) { if (u.item === r.item) u.item = null; return; }
  u.atk = Math.max(1, u.atk - r.a); u.hp = Math.max(1, u.hp - r.h);
  const k = +String(r.key).slice(1);
  if (u.buffs && u.buffs[k]) u.buffs.splice(k, 1);
}

// every removable buff on a team: logged stat buffs, plus held items
function sdBuffChoices(team) {
  const out = [];
  (team || []).forEach(u => {
    const name = UNITS[u.id].name;
    (u.buffs || []).forEach((b, k) => {
      if (!(b.a > 0 || b.h > 0)) return;
      out.push({ uid: u.uid, key: 'b' + k, a: Math.max(0, b.a), h: Math.max(0, b.h), unitName: name, label: `+${Math.max(0, b.a)}/+${Math.max(0, b.h)} from ${b.src}` });
    });
    if (u.item) out.push({ uid: u.uid, key: 'item', item: u.item, a: 0, h: 0, unitName: name, label: `held item: ${ITEMS[u.item].name}` });
  });
  return out;
}
