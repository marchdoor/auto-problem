// ============================================================
//  Extras: battle replay codes, the stats page and custom solo runs.
//  - replay code: the two teams, the seed and the bans of a battle. Anyone can paste it and watch the same battle.
//  - stats: kept in localStorage (np_stats), shown on the title screen.
//  - custom run: a solo run with your own hearts, gold, trophies and prices (no achievements).
// ============================================================
let REPLAYING = false;
let LASTBATTLE = null;

const REPLAY = {
  keep(A, B, seed, ban, names, curses) {
    const clean = t => (t || []).filter(Boolean).map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp || 0, item: u.item || null, uid: u.uid, next: u.next || [] }));
    LASTBATTLE = { A: clean(A), B: clean(B), s: seed, b: ban || null, n: names || ['you', 'enemy'], c: curses || [] };
    const b = document.getElementById('btn-replay'); if (b) b.classList.remove('hidden');
  },
  encode(d) {
    const json = JSON.stringify(d);
    return 'NPR1-' + btoa(unescape(encodeURIComponent(json)));
  },
  decode(code) {
    try {
      code = String(code || '').trim();
      if (!code.startsWith('NPR1-')) return null;
      const d = JSON.parse(decodeURIComponent(escape(atob(code.slice(5)))));
      const num = (v, lo, hi) => { v = Math.floor(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
      const team = t => {
        if (!Array.isArray(t) || t.length > 10) throw 0;
        return t.map((u, i) => {
          if (!u || !UNITS[u.id]) throw 0;
          const item = u.item && ITEMS[u.item] ? u.item : null;
          const nx = (Array.isArray(u.next) ? u.next : []).filter(x => typeof x === 'string' && NEXT_TXT[x]).slice(0, 6);
          return { id: u.id, atk: num(u.atk, 1, 9999), hp: num(u.hp, 1, 9999), exp: num(u.exp, 0, 9999), item, uid: num(u.uid, 1, 1e6), next: nx };
        });
      };
      const A = team(d.A), B = team(d.B);
      const ban = Array.isArray(d.b) ? d.b.filter(x => x && (x.side === 'A' || x.side === 'B')).map(x => ({ side: x.side, uid: num(x.uid, 0, 9999) })).slice(0, 4) : null;
      return { A, B, s: num(d.s, 0, 2e9), b: ban && ban.length ? ban : null, n: [String(d.n && d.n[0] || 'a').slice(0, 24), String(d.n && d.n[1] || 'b').slice(0, 24)], c: (Array.isArray(d.c) ? d.c : []).filter(x => NEXT_TXT[x]).slice(0, 6) };
    } catch (e) { return null; }
  },
  copy() {
    if (!LASTBATTLE) return toast('no battle to copy yet');
    const code = this.encode(LASTBATTLE);
    const done = () => toast('replay code copied. paste it in "watch replay"');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => window.prompt('copy this replay code:', code));
    else window.prompt('copy this replay code:', code);
    STATS.bump('replaysMade');
  },
  menu() {
    openModal(`<h2>watch replay</h2><p>paste a replay code. you will watch exactly the same battle.</p>
      <textarea id="rp-code" rows="4" style="width:100%;background:#000;color:#fff;border:2px solid #fff;border-radius:12px;padding:8px;font:12px monospace" placeholder="NPR1-..."></textarea>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:10px"><button class="big" id="rp-go">watch</button></div>`);
    $('#rp-go').onclick = () => this.play($('#rp-code').value);
  },
  async play(code) {
    const d = this.decode(code);
    if (!d) return toast('that replay code does not work');
    if (REPLAYING) return;
    REPLAYING = true;
    const hadS = S; const oldPacks = Object.assign({}, ACTIVE_PACKS);
    try {
      closeModal();
      S = { net: false, turn: 1, gold: 0, lives: 0, wins: 0, team: [null, null, null, null, null], shop: { units: [], items: [] }, history: [], nikeKills: 0, packs: {}, curses: [] };
      setPacks({ unturned: true });
      const res = simulateBattle(d.A, d.B, d.s, { ban: d.b, curses: d.c });
      phaseSong('battle'); setBattleBg(d.s); showScreen('battle');
      $('#enemy-name').textContent = d.n[1];
      $('#b-lives').textContent = '-'; $('#b-wins').textContent = '-'; $('#b-turn').textContent = '-';
      $('#result').classList.add('hidden');
      skipping = false;
      await playBattle(res.frames, { result: res.result, seed: d.s });
      STATS.bump('replaysWatched');
      if (typeof ACH !== 'undefined') { REPLAYING = false; ACH.unlock('replay'); REPLAYING = true; }
      Audio2.stopMusic();
      openModal(`<div style="text-align:center"><h2>replay over</h2><p class="cap-style" style="font-size:24px">${esc(d.n[0])} ${res.result === 'win' ? 'beat' : res.result === 'lose' ? 'lost to' : 'drew with'} ${esc(d.n[1])}</p>
        <div style="display:flex;gap:12px;justify-content:center"><button class="big" id="rp-again">watch again</button><button class="big" id="rp-back">back to title</button></div></div>`);
      $('#rp-again').onclick = () => { REPLAYING = false; this.play(code); };
      $('#rp-back').onclick = () => { closeModal(); REPLAYING = false; S = hadS; setPacks(oldPacks); toTitle(); };
      return;
    } catch (e) { console.error(e); toast('could not play that replay'); }
    REPLAYING = false; S = hadS; setPacks(oldPacks);
  },
};

const STATS = {
  load() {
    const d = store.get('np_stats', null) || {};
    return Object.assign({ win: 0, lose: 0, draw: 0, online: 0, onlineWin: 0, coopWin: 0, runs: 0, runWins: 0, bestWins: 0, replaysMade: 0, replaysWatched: 0, units: {} }, d);
  },
  save(d) { store.set('np_stats', d); },
  bump(k, n = 1) { const d = this.load(); d[k] = (d[k] || 0) + n; this.save(d); },
  battle(result) { if (REPLAYING || (typeof S !== 'undefined' && S && S.custom)) return; if (result === 'win' || result === 'lose' || result === 'draw') this.bump(result); },
  team(team) {
    if (typeof S !== 'undefined' && S && S.custom) return;
    const d = this.load();
    (team || []).filter(Boolean).forEach(u => { d.units[u.id] = (d.units[u.id] || 0) + 1; });
    this.save(d);
  },
  run(win, wins) { if (typeof S !== 'undefined' && S && S.custom) return; const d = this.load(); d.runs++; if (win) d.runWins++; d.bestWins = Math.max(d.bestWins, wins || 0); this.save(d); },
  online(win, coop) { if (typeof S !== 'undefined' && S && S.predict) return; const d = this.load(); d.online++; if (win) { d.onlineWin++; if (coop) d.coopWin++; } this.save(d); },
  open() {
    const d = this.load(), n = d.win + d.lose + d.draw;
    const top = Object.entries(d.units).filter(([k]) => UNITS[k]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const row = (a, b) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`;
    openModal(`<h2>stats</h2>
      <table class="standings stats-table">
        ${row('battles', n)}${row('wins · losses · draws', `${d.win} · ${d.lose} · ${d.draw}`)}${row('win rate', n ? Math.round(100 * d.win / n) + '%' : '-')}
        ${row('runs finished', d.runs)}${row('runs won', d.runWins)}${row('best trophies in a run', `${d.bestWins}/10`)}
        ${row('online games', d.online)}${row('online wins', d.onlineWin)}${row('co-op wins', d.coopWin)}
        ${row('replays copied · watched', `${d.replaysMade} · ${d.replaysWatched}`)}
      </table>
      <h3>most used characters</h3>
      <div class="stat-units">${top.length ? top.map(([k, c]) => `<div><img src="${imgSrc(k)}" alt=""><span>${UNITS[k].name}<small>${c} battles</small></span></div>`).join('') : '<p class="t">play a few battles first</p>'}</div>`);
  },
};

// ---- custom solo run ----
function customRunMenu() {
  const keys = Object.keys(RULE_DEFS).filter(k => k !== 'secs');
  openModal(`<h2>custom run</h2><p>pick your own rules. custom runs do not count for achievements or stats.</p>
    <div class="lobby-rules">${keys.map(k => `<label>${RULE_DEFS[k].name} <select data-rk="${k}">${RULE_DEFS[k].opts.map(o => `<option ${o === RULE_DEFS[k].def ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('')}</div>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:10px"><button class="big" id="cr-go">start</button></div>`);
  $('#cr-go').onclick = () => {
    const r = {}; document.querySelectorAll('.lobby-rules select').forEach(s => { r[s.dataset.rk] = +s.value; });
    closeModal(); Audio2.play('start'); newRun(false, r);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const on = (id, f) => { const e = document.getElementById(id); if (e) e.onclick = f; };
  on('btn-replay', () => REPLAY.copy());
  on('btn-replay-open', () => REPLAY.menu());
  on('btn-stats', () => STATS.open());
  on('btn-custom', customRunMenu);
});
