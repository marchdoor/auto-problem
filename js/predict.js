// ============================================================
//  foi predict: two bot teams are built at random, you see both (items too) and have about 10 seconds to
//  call the winner. 10 lives. A right call gains a life, a wrong one (or no call) loses one. "double down" doubles it.
//  Works alone and online (the host builds the match, everybody calls it, the result is the same for all).
//  Cutscenes still play, but nothing unlocks: the run state is flagged `custom` (no achievements, no stats).
// ============================================================
const PRED = {
  SECONDS: 10, LIVES: 10, MAX_ROUNDS: 20, MAX_LIVES: 99,
  tok: 0, timerInt: null, locked: false, watching: false, pending: null, solo: null, playlist: null,

  strip: t => t.map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp || 0, item: u.item || null, uid: u.uid, next: [] })),

  // a chance for the left team to win, from a few quick simulations
  odds(A, B) {
    let w = 0, dr = 0; const n = 20;
    for (let i = 0; i < n; i++) {
      const r = simulateBattle(netTeam(A), netTeam(B), Math.floor(Math.random() * 1e9), {}).result;
      w += r === 'win' ? 1 : r === 'draw' ? 0.5 : 0; if (r === 'draw') dr++;
    }
    this.lastDraws = dr / n;
    return w / n;
  },
  // two teams of the same strength level (so the same number of characters and the same kind of stats), the level is
  // random: round 1 can be two late game teams. Lopsided pairs are thrown away, so it is a real guess.
  make(round) {
    let best = null;
    for (let i = 0; i < 14; i++) {
      const T = 1 + Math.floor(Math.random() * 14);
      const A = this.strip(buildBotTeam(T, mulberry32(Math.floor(Math.random() * 1e9)))), B = this.strip(buildBotTeam(T, mulberry32(Math.floor(Math.random() * 1e9))));
      const p = this.odds(A, B);
      let na = pick(TEAM_NAMES), nb = pick(TEAM_NAMES); while (nb === na) nb = pick(TEAM_NAMES);
      const m = { T, teamA: A, teamB: B, nameA: na, nameB: nb, seed: Math.floor(Math.random() * 1e9), round };
      const dr = this.lastDraws, score = Math.abs(p - 0.5) + dr;   // lopsided and drawish pairs both score badly
      if (!best || score < best.score) best = { m, p, score };
      if (p >= 0.3 && p <= 0.7 && dr <= 0.15) return m;
    }
    return best.m;
  },
  // the lives you gain or lose. pick = { side, dd } or nothing
  delta(winSide, pk) {
    if (!pk) return -1;
    if (!winSide) return 0;                       // a draw changes nothing
    return (pk.side === winSide ? 1 : -1) * (pk.dd ? 2 : 1);
  },
  winSide: result => result === 'win' ? 'A' : result === 'lose' ? 'B' : null,

  freshState(lives) {
    return { net: true, predict: true, custom: true, runId: 'predict', turn: 0, gold: 0, lives, wins: 0, team: [null, null, null, null, null], shop: { units: [], items: [] }, nikeKills: 0, history: [], packs: {}, curses: [] };
  },

  // ---------- the screen ----------
  panel() { return document.getElementById('pred-panel'); },
  hidePanel() { clearInterval(this.timerInt); const p = this.panel(); if (p) p.classList.add('hidden'); },
  cardUnit: u => ({ ...u, name: UNITS[u.id].name, lvl: levelOf(u.exp || 0), dead: false }),
  // shows both teams and the buttons. o: { canPick, seconds, onPick(side, dd), info, lives, round }
  showMatch(m, o) {
    clearInterval(this.timerInt); this.locked = false;
    skipping = false;
    showScreen('battle'); closeModalQuiet();
    $('#result').classList.add('hidden');
    setBattleBg(m.seed);
    document.querySelector('#battle .side-name.left').textContent = m.nameA;
    $('#enemy-name').textContent = m.nameB;
    $('#b-lives').textContent = o.lives; $('#b-turn').textContent = m.round;
    $('#b-wins').textContent = o.correct != null ? o.correct : '-';
    const wm = document.querySelector('#battle .wins-max'); if (wm) wm.textContent = ' right';
    $('#caption').textContent = '';
    const f = { A: m.teamA.map(this.cardUnit), B: m.teamB.map(this.cardUnit) };
    renderBattleTeams(f);
    const p = this.panel(); p.classList.remove('hidden');
    p.innerHTML = `<div class="pred-top"><div class="pred-bar"><i id="pred-fill"></i></div><b id="pred-time">${o.seconds}</b></div>
      ${o.canPick ? `<label class="pred-dd"><input type="checkbox" id="pred-dd"> double down <small>(±2 ❤️ instead of ±1)</small></label>
      <div class="pred-btns"><button id="pred-a" class="big">◀ ${esc(m.nameA)} wins</button><button id="pred-b" class="big">${esc(m.nameB)} wins ▶</button></div>`
        : `<p class="cap-style" style="font-size:20px">${o.info || 'watching'}</p>`}
      <p class="pred-info" id="pred-info">${o.canPick ? 'right call +1 ❤️ · wrong call −1 ❤️ · no call −1 ❤️ · a draw changes nothing' : ''}</p>
      <button class="pred-leave" id="pred-leave">leave</button>`;
    $('#pred-leave').onclick = () => o.onLeave ? o.onLeave() : toTitle();
    const end = Date.now() + o.seconds * 1000;
    const pick = side => {
      if (this.locked || !o.canPick) return;
      this.locked = true;
      const dd = !!$('#pred-dd').checked;
      $('#pred-a').disabled = $('#pred-b').disabled = true; $('#pred-dd').disabled = true;
      $(side === 'A' ? '#pred-a' : '#pred-b').classList.add('chosen');
      $('#pred-info').textContent = `you called ${side === 'A' ? m.nameA : m.nameB}${dd ? ' · double down!' : ''}`;
      o.onPick(side, dd);
    };
    if (o.canPick) {
      $('#pred-a').onclick = () => pick('A'); $('#pred-b').onclick = () => pick('B');
      this.keyHandler = e => { if (e.key === 'ArrowLeft') pick('A'); else if (e.key === 'ArrowRight') pick('B'); else if (e.key === 'd' || e.key === 'D') { const c = $('#pred-dd'); if (c && !c.disabled) c.checked = !c.checked; } };
      document.addEventListener('keydown', this.keyHandler);
    }
    this.timerInt = setInterval(() => {
      const left = Math.max(0, (end - Date.now()) / 1000);
      const t = $('#pred-time'); if (!t) return clearInterval(this.timerInt);
      t.textContent = Math.ceil(left); $('#pred-fill').style.width = (100 * left / o.seconds) + '%'; p.classList.toggle('urgent', left <= 3);
      if (left <= 0) { clearInterval(this.timerInt); if (o.canPick && !this.locked) { this.locked = true; $('#pred-a').disabled = $('#pred-b').disabled = true; $('#pred-info').textContent = 'too slow. no call'; o.onPick(null, false); } }
    }, 100);
    phaseSong('shop');
  },
  dropKeys() { if (this.keyHandler) { document.removeEventListener('keydown', this.keyHandler); this.keyHandler = null; } },
  // plays the battle of a match. resolves with the result from the left team's side
  async play(m) {
    this.hidePanel(); this.dropKeys();
    const res = simulateBattle(netTeam(m.teamA), netTeam(m.teamB), m.seed, {});
    REPLAY.keep(m.teamA, m.teamB, m.seed, null, [m.nameA, m.nameB]);
    phaseSong('battle');
    setBattleBg(m.seed); showScreen('battle');
    skipping = false;
    await playBattle(res.frames, { result: res.result, seed: m.seed });
    return res.result;
  },
  cleanup() {
    clearInterval(this.timerInt); this.dropKeys(); this.tok++; this.pending = null; this.solo = null; this.watching = false;
    const p = this.panel(); if (p) p.classList.add('hidden');
    const l = document.querySelector('#battle .side-name.left'); if (l) l.textContent = 'you';
    const wm = document.querySelector('#battle .wins-max'); if (wm) wm.textContent = '/' + (typeof WIN_TARGET !== 'undefined' ? WIN_TARGET : 10);
  },
  resultCap(result, pk, d) {
    if (!pk) return 'too slow. no call';
    if (result === 'draw') return 'a draw. nothing changes';
    return d > 0 ? pick(['called it', 'no problem', 'you saw it coming', 'free win']) : pick(['and you cry', 'i cant', 'no problem miscalculates the problem']);
  },

  // ---------- singleplayer ----------
  intro() {
    const best = store.get('np_predict_best', { rounds: 0, correct: 0 });
    openModal(`<h2>foi predict</h2>
      <p>two bot teams are built at random. you see both of them, items included, and you have <b>${this.SECONDS} seconds</b> to call the winner.</p>
      <ul><li>you start with <b>${this.LIVES} ❤️</b>. a right call gains 1, a wrong call (or no call) loses 1.</li>
      <li><b>double down</b> doubles it: +2 or −2.</li><li>the teams are always the same strength, but the strength is random. round 1 can be two late game teams.</li>
      <li>cutscenes play, but nothing unlocks in this mode.</li></ul>
      <p class="t">best: ${best.rounds} rounds, ${best.correct} right calls</p>
      <div style="display:flex;gap:12px;justify-content:center"><button class="big" id="pr-go">start</button></div>`);
    $('#pr-go').onclick = () => { closeModal(); Audio2.play('start'); this.startSolo(); };
  },
  startSolo() {
    setRules(null); setEndless(false); setPacks(packPrefs());
    S = this.freshState(this.LIVES); S.packs = packPrefs(); S.solo = true;
    this.solo = { round: 0, correct: 0, streak: 0, bestStreak: 0 };
    this.playlist = newPlaylist();
    this.nextSolo();
  },
  nextSolo() {
    const so = this.solo; if (!so) return;
    so.round++; S.turn = so.round;
    NET.songs = { shop: nextSong(this.playlist), battle: nextSong(this.playlist) };
    const m = this.make(so.round);
    const tok = ++this.tok;
    this.showMatch(m, { canPick: true, seconds: this.SECONDS, lives: S.lives, correct: so.correct, onLeave: () => { this.cleanup(); S = null; battleBusy = false; toTitle(); },
      onPick: (side, dd) => this.resolveSolo(m, side ? { side, dd } : null, tok) });
  },
  async resolveSolo(m, pk, tok) {
    const so = this.solo;
    const result = await this.play(m);
    if (tok !== this.tok || !this.solo) return;
    const win = this.winSide(result), d = this.delta(win, pk);
    const right = !!(pk && win && pk.side === win);
    S.lives = Math.min(this.MAX_LIVES, S.lives + d);
    if (right) { so.correct++; so.streak++; so.bestStreak = Math.max(so.bestStreak, so.streak); } else if (d < 0) so.streak = 0;
    playResultTheme(right ? 'win' : d < 0 ? 'lose' : 'draw');
    const dead = S.lives <= 0;
    $('#result-title').textContent = !pk ? 'no call' : result === 'draw' ? 'draw' : right ? 'right' : 'wrong';
    $('#result-cap').textContent = this.resultCap(result, pk, d);
    $('#result-sub').innerHTML = `${d ? `<b style="color:${d > 0 ? '#7CFC00' : '#ff5252'}">${d > 0 ? '+' : ''}${d} ❤️</b>${pk && pk.dd ? ' (double down)' : ''} · ` : ''}❤️ ${Math.max(0, S.lives)} · streak ${so.streak} · ${so.correct} right of ${so.round}`;
    $('#b-lives').textContent = Math.max(0, S.lives);
    $('#result').classList.remove('hidden');
    $('#btn-result').textContent = dead ? 'continue' : 'next match';
    $('#btn-result2').classList.add('hidden');
    $('#btn-result').onclick = () => { $('#result').classList.add('hidden'); if (dead) this.gameOverSolo(); else this.nextSolo(); };
  },
  gameOverSolo() {
    const so = this.solo;
    const best = store.get('np_predict_best', { rounds: 0, correct: 0 });
    const rec = so.round > best.rounds || (so.round === best.rounds && so.correct > best.correct);
    if (rec) store.set('np_predict_best', { rounds: so.round, correct: so.correct });
    openModal(`<div style="text-align:center"><h2 style="font-size:56px">out of lives</h2>
      <p class="cap-style" style="font-size:24px">${so.round} rounds · ${so.correct} right calls · best streak ${so.bestStreak}${rec ? ' · new best!' : ''}</p>
      <div style="display:flex;gap:12px;justify-content:center"><button class="big" id="pr-again">play again</button><button class="big" id="pr-title">back to title</button></div></div>`);
    $('#modal-close').classList.add('hidden');
    $('#pr-again').onclick = () => { closeModalQuiet(); this.startSolo(); };
    $('#pr-title').onclick = () => { $('#modal').classList.add('hidden'); this.cleanup(); S = null; toTitle(); };
  },
};

// closeModal() goes back to the title when there is no run: this only hides the window
function closeModalQuiet() { ACH.stop(); $('#modal').classList.add('hidden'); $('#modal-close').classList.remove('hidden'); }

// ============================================================
//  online
// ============================================================
Object.assign(NET, {
  // ---- host ----
  hostStartPredict() {
    clearTimeout(this.hostTimeout);
    this.phase = 'predict';
    this.order.forEach(id => {
      const p = this.players[id];
      if (p.alive && !p.connected && ++p.missed > 3) { p.alive = false; p.lives = 0; }
      p.done = false;
    });
    if (this.aliveIds().length <= 1) { this.phase = 'battle'; return this.hostAfterBattles(); }
    this.songs2 = { shop: nextSong(this.playlist), battle: nextSong(this.playlist) };
    this.pm = { m: PRED.make(this.turn), picks: {}, start: Date.now() };
    this.broadcast({ t: 'pmatch', turn: this.turn, match: this.pm.m, seconds: PRED.SECONDS, songs: this.songs2, players: this.publicPlayers() });
    this.hostTimeout = setTimeout(() => this.hostResolvePredict(), (PRED.SECONDS + 4) * 1000);
  },
  hostCheckPredict() {
    if (this.phase !== 'predict' || !this.pm) return;
    if (this.aliveIds().every(id => this.pm.picks[id] || !this.players[id].connected)) this.hostResolvePredict();
  },
  hostPredictPick(from, m) {
    const p = this.players[from];
    if (!p || !p.alive || this.phase !== 'predict' || !this.pm || this.pm.picks[from]) return;
    if (m.side !== 'A' && m.side !== 'B') return;
    this.pm.picks[from] = { side: m.side, dd: !!m.dd };
    this.broadcast({ t: 'status', ready: Object.keys(this.pm.picks).length, total: this.aliveIds().length });
    this.hostCheckPredict();
  },
  hostResolvePredict() {
    if (this.phase !== 'predict') return;
    clearTimeout(this.hostTimeout);
    this.phase = 'battle';
    const m = this.pm.m, result = simulateBattle(netTeam(m.teamA), netTeam(m.teamB), m.seed, {}).result, win = PRED.winSide(result);
    this.aliveIds().forEach(id => {
      const p = this.players[id], k = this.pm.picks[id];
      if (k && win && k.side === win) p.wins++;
      p.lives = Math.min(PRED.MAX_LIVES, p.lives + PRED.delta(win, k));
      if (p.lives <= 0) p.alive = false;
    });
    this.order.forEach(id => { this.players[id].done = !this.players[id].connected; });
    this.broadcast({ t: 'presult', turn: this.turn, match: m, result, picks: this.pm.picks, players: this.publicPlayers() });
    this.hostTimeout = setTimeout(() => { this.order.forEach(id => { this.players[id].done = true; }); this.hostCheckProgress(); }, 120000);
  },

  // ---- every player ----
  onPmatch(m) {
    PRED.tok++; if (PRED.watching) skipping = true;
    this.lobbyPlayers = m.players;
    const meP = this.me(m.players); if (!meP) return;
    if (m.packs) { this.packs = m.packs; setPacks(m.packs); }
    if (!S || !S.predict) { S = PRED.freshState(meP.lives); S.runId = 'net-' + this.myId; }
    if (!this.isHost) this.phase = 'predict';
    S.lives = meP.lives; S.wins = meP.wins; S.turn = m.turn;
    this.songs = m.songs || this.songs;
    PRED.pending = null;
    if (!$('#result').classList.contains('hidden')) { PRED.pending = m; return; }   // still reading the last result
    this.showPmatch(m);
  },
  showPmatch(m) {
    const meP = this.me(m.players);
    const canPick = meP.alive && !meP.spec;
    PRED.canPick = canPick;
    PRED.showMatch(m.match, {
      canPick, seconds: m.seconds, lives: meP.lives, correct: meP.wins, onLeave: () => this.leave(),
      info: meP.spec ? 'you are spectating' : 'you are out. watching',
      onPick: (side, dd) => { if (side) this.send({ t: 'ppick', side, dd }); else { /* no call: the host counts it when the time is up */ } },
    });
    if (m.restore) toast('you are back in the game');
  },
  async onPresult(m) {
    const tok = ++PRED.tok;
    this.lobbyPlayers = m.players;
    const meP = this.me(m.players); if (!meP) return;
    if (!S || !S.predict) { S = PRED.freshState(meP.lives); S.runId = 'net-' + this.myId; }
    const mine = m.picks[this.myId];
    const spectator = !PRED.canPick;             // spectators and players who are out watch only. someone who made no call still plays on
    $('#modal').classList.add('hidden'); $('#modal-close').classList.remove('hidden');
    if (spectator) this.send({ t: 'done' });     // they do not hold the next round up
    PRED.watching = spectator;
    const before = S.lives;
    const result = await PRED.play(m.match);
    if (tok !== PRED.tok) return;
    PRED.watching = false;
    const win = PRED.winSide(result);
    S.lives = meP.lives; S.wins = meP.wins;
    if (spectator) {
      const res = [`${esc(m.match.nameA)} ${result === 'win' ? 'beat' : result === 'lose' ? 'lost to' : 'drew with'} ${esc(m.match.nameB)}`];
      this.spectate(m.players, res);
      return;
    }
    const d = meP.lives - before, right = !!(win && mine && mine.side === win);
    playResultTheme(right ? 'win' : d < 0 ? 'lose' : 'draw');
    $('#result-title').textContent = result === 'draw' ? 'draw' : right ? 'right' : 'wrong';
    $('#result-cap').textContent = PRED.resultCap(result, mine, d);
    $('#result-sub').innerHTML = `${d ? `<b style="color:${d > 0 ? '#7CFC00' : '#ff5252'}">${d > 0 ? '+' : ''}${d} ❤️</b>${mine && mine.dd ? ' (double down)' : ''}` : ''}${meP.alive ? '' : ' <b style="color:#ff5252">you are out. and you cry</b>'}${this.standingsHTML(m.players)}`;
    $('#b-lives').textContent = Math.max(0, meP.lives);
    $('#result').classList.remove('hidden'); $('#caption').textContent = '';
    $('#btn-result').textContent = 'continue';
    $('#btn-result2').classList.add('hidden');
    $('#btn-result').onclick = () => {
      $('#result').classList.add('hidden');
      this.send({ t: 'done' });
      if (PRED.pending) { const p = PRED.pending; PRED.pending = null; this.showPmatch(p); }
      else if (this.phase !== 'over') {
        openModal(`<div style="text-align:center"><h2>wait a bit</h2><p class="cap-style" style="font-size:24px">waiting for the others</p></div>`);
        $('#modal-close').classList.add('hidden');
      }
    };
  },
});

// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('btn-predict'); if (b) b.onclick = () => PRED.intro();
});
// leaving to the title always tidies this mode up
(function () {
  const old = toTitle;
  toTitle = function () { PRED.cleanup(); return old.apply(this, arguments); };
})();
