// ============================================================
//  Dev mode (secret). Turn it on / off by tapping the game title on the main menu
//  7 times quickly (or Ctrl+Alt+D). A small "dev" tab shows up on the left side.
//  Lets you put any character in your team, build the opponent's team, change the
//  run (gold, lives, wins, turn) and test things. Solo runs only: it is switched off
//  inside online games. Achievements do not unlock while it is on (unless you tick it).
// ============================================================
const DEV = {
  on: false, ach: false, cutRepeat: true, opp: [], useOpp: true, tab: 'deck',

  load() {
    try {
      this.on = localStorage.getItem('np_dev') === '1';
      this.useOpp = localStorage.getItem('np_dev_useopp') !== '0';
      this.opp = JSON.parse(localStorage.getItem('np_dev_opp') || '[]').filter(u => UNITS[u.id]);
    } catch (e) {}
  },
  save() {
    try {
      localStorage.setItem('np_dev', this.on ? '1' : '0');
      localStorage.setItem('np_dev_useopp', this.useOpp ? '1' : '0');
      localStorage.setItem('np_dev_opp', JSON.stringify(this.opp));
    } catch (e) {}
  },
  flash(t) {
    let el = document.getElementById('dev-flash');
    if (!el) { el = document.createElement('div'); el.id = 'dev-flash'; document.getElementById('app').appendChild(el); }
    el.textContent = t; el.classList.add('show');
    clearTimeout(this.ft); this.ft = setTimeout(() => el.classList.remove('show'), 1800);
  },
  set(on) {
    this.on = on; this.save(); this.refresh();
    this.flash(on ? 'dev mode on. achievements are paused' : 'dev mode off');
  },
  refresh() {
    let b = document.getElementById('dev-btn');
    if (!b) { b = document.createElement('button'); b.id = 'dev-btn'; b.textContent = 'dev'; b.onclick = () => this.open(); document.getElementById('app').appendChild(b); }
    b.classList.toggle('hidden', !(this.on && !(S && S.net)));
  },
  // the opponent for the next battle, or null for a normal one
  opponent() {
    if (!this.on || !this.useOpp || !this.opp.length || (S && S.net)) return null;
    return { name: 'dev dummy', team: this.opp.map(u => newUnit(u.id, { atk: u.atk, hp: u.hp, exp: u.exp, item: u.item })) };
  },

  init() {
    this.load(); this.refresh();
    // 7 quick taps on the title
    const h = document.querySelector('.title-box h1'); let n = 0, t0 = 0;
    if (h) h.addEventListener('click', () => {
      const now = Date.now(); if (now - t0 > 2500) n = 0; t0 = now;
      if (++n >= 7) { n = 0; this.set(!this.on); }
    });
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); this.set(!this.on); } });
  },

  // ---------------- the panel ----------------
  unitOptions(filter) {
    const f = (filter || '').toLowerCase();
    return Object.entries(UNITS).filter(([k, d]) => !f || d.name.toLowerCase().includes(f) || k.includes(f))
      .sort((a, b) => a[1].tier - b[1].tier || a[1].name.localeCompare(b[1].name))
      .map(([k, d]) => `<option value="${k}">t${d.tier} · ${d.name}${d.token ? ' (token)' : ''}${d.secret ? ' (secret)' : ''}</option>`).join('');
  },
  itemOptions() { return '<option value="">no item</option>' + Object.entries(ITEMS).filter(([k, it]) => it.equip).map(([k, it]) => `<option value="${k}">${it.name}</option>`).join(''); },
  formHTML(extra) {
    return `<div class="dev-form">
      <input class="dv-search" placeholder="search a character…">
      <select class="dv-unit">${this.unitOptions()}</select>
      <label>atk <input type="number" class="dv-atk" min="0" max="999"></label>
      <label>hp <input type="number" class="dv-hp" min="1" max="999"></label>
      <label>level <input type="number" class="dv-lvl" min="1" max="30" value="1"></label>
      <select class="dv-item">${this.itemOptions()}</select>
      ${extra || ''}
      <button class="dv-add big">add</button>
    </div>`;
  },
  wireForm(root, onAdd) {
    const q = s => root.querySelector(s);
    const sel = q('.dv-unit');
    const fillDefaults = () => { const d = UNITS[sel.value]; if (!d) return; q('.dv-atk').value = d.atk; q('.dv-hp').value = d.hp; };
    q('.dv-search').oninput = e => { sel.innerHTML = this.unitOptions(e.target.value); fillDefaults(); };
    sel.onchange = fillDefaults; fillDefaults();
    q('.dv-add').onclick = () => {
      if (!sel.value) return;
      const num = (s, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+q(s).value || d)));
      const L = num('.dv-lvl', 1, 1, 30);
      onAdd({ id: sel.value, atk: num('.dv-atk', 1, 0, 999), hp: num('.dv-hp', 1, 1, 999), exp: expForLevel(L), item: q('.dv-item').value || null }, root);
    };
  },
  unitLine(u) {
    const d = UNITS[u.id]; const L = levelOf(u.exp || 0);
    return `${d.name} <b>${u.atk}/${u.hp}</b> lvl ${L}${u.item ? ' · ' + ITEMS[u.item].name : ''}`;
  },

  open(tab) {
    if (tab) this.tab = tab;
    const tabs = [['deck', 'my team'], ['opp', 'opponent'], ['run', 'run'], ['tools', 'tools']];
    openModal(`<h2>dev mode</h2>
      <div class="dev-tabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="dev-body"></div>`);
    const body = $('#dev-body');
    document.querySelectorAll('.dev-tabs button').forEach(b => b.onclick = () => this.open(b.dataset.t));
    ({ deck: () => this.tabDeck(body), opp: () => this.tabOpp(body), run: () => this.tabRun(body), tools: () => this.tabTools(body) })[this.tab]();
  },

  tabDeck(body) {
    if (!S) { body.innerHTML = '<p>start a run first (new run), then open this again. the opponent tab works from the menu.</p>'; return; }
    const slots = S.team.map((u, i) => `<div class="dev-row"><span class="dev-slot">slot ${i + 1}${i === 0 ? ' (front)' : ''}</span><span class="dev-desc">${u ? this.unitLine(u) : '<i>empty</i>'}</span>${u ? `<button data-rm="${i}">✕</button>` : ''}</div>`).join('');
    body.innerHTML = `<p class="t">your team, slot 1 is the front. pick a character and a slot. it replaces what is there.</p>${slots}
      <h3>add a character</h3>${this.formHTML(`<label>slot <select class="dv-slot"><option value="-1">first empty</option>${[1, 2, 3, 4, 5].map(i => `<option value="${i - 1}">${i}</option>`).join('')}</select></label>`)}
      <h3>add an item to the shop (free)</h3>
      <div class="dev-form"><select id="dv-shopitem">${Object.entries(ITEMS).map(([k, it]) => `<option value="${k}">${it.name}${it.equip ? ' (equip)' : ''}</option>`).join('')}</select><button id="dv-shopitem-add" class="big">add to shop</button></div>`;
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { S.team[+b.dataset.rm] = null; this.after(); });
    this.wireForm(body, (spec, root) => {
      let slot = +root.querySelector('.dv-slot').value; if (slot < 0) slot = S.team.findIndex(x => !x);
      if (slot < 0) { this.flash('team is full, pick a slot to replace'); return; }
      S.team[slot] = newUnit(spec.id, spec);
      this.after();
    });
    $('#dv-shopitem-add').onclick = () => { S.shop.items.push({ id: $('#dv-shopitem').value, frozen: false }); this.after(); };
  },
  after() { saveRun(); renderShop(); this.open(this.tab); },

  tabOpp(body) {
    const rows = this.opp.map((u, i) => `<div class="dev-row"><span class="dev-slot">${i + 1}${i === 0 ? ' (front)' : ''}</span><span class="dev-desc">${this.unitLine(u)}</span><button data-rm="${i}">✕</button></div>`).join('') || '<p class="t"><i>empty: normal opponents.</i></p>';
    body.innerHTML = `<p class="t">build the team you fight. while it has characters in it, every battle uses it (first one is the front, up to 10).</p>
      <label class="dev-check"><input type="checkbox" id="dv-useopp" ${this.useOpp ? 'checked' : ''}> use this opponent</label>
      ${rows}
      <div class="dev-form"><button id="dv-copy">copy my team</button><button id="dv-clear">clear</button>${S ? '<button id="dv-fight" class="big">fight now</button>' : ''}</div>
      <h3>add a character</h3>${this.formHTML()}`;
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { this.opp.splice(+b.dataset.rm, 1); this.save(); this.open('opp'); });
    $('#dv-useopp').onchange = e => { this.useOpp = e.target.checked; this.save(); };
    $('#dv-clear').onclick = () => { this.opp = []; this.save(); this.open('opp'); };
    $('#dv-copy').onclick = () => { if (!S) return this.flash('start a run first'); this.opp = S.team.filter(Boolean).map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp, item: u.item })); this.save(); this.open('opp'); };
    if (S) $('#dv-fight').onclick = () => { $('#modal').classList.add('hidden'); endTurn(); };
    this.wireForm(body, spec => { if (this.opp.length >= 10) return this.flash('10 is the most'); this.opp.push(spec); this.save(); this.open('opp'); });
  },

  tabRun(body) {
    if (!S) { body.innerHTML = '<p>start a run first.</p>'; return; }
    body.innerHTML = `<div class="dev-grid">
      <label>gold <input type="number" id="dv-gold" value="${S.gold}"></label>
      <label>lives <input type="number" id="dv-lives" value="${S.lives}"></label>
      <label>wins <input type="number" id="dv-wins" value="${S.wins}"></label>
      <label>turn <input type="number" id="dv-turn" value="${S.turn}" min="1"></label>
      <label>nike kills <input type="number" id="dv-kills" value="${S.nikeKills || 0}"></label></div>
      <div class="dev-form"><button id="dv-apply" class="big">apply</button><button id="dv-reroll">free reroll</button><button id="dv-endless">endless on</button><button id="dv-boss">final wave next turn</button></div>
      <p class="t">turn changes the shop tier, wins change the colour. endless on turns on the high caps (150 stats, levels past 3).</p>`;
    $('#dv-apply').onclick = () => {
      S.gold = +$('#dv-gold').value || 0; S.lives = Math.max(1, +$('#dv-lives').value || 1); S.wins = Math.max(0, +$('#dv-wins').value || 0);
      S.turn = Math.max(1, +$('#dv-turn').value || 1); S.nikeKills = Math.max(0, +$('#dv-kills').value || 0);
      rollShop(true); setColour(); this.after();
    };
    $('#dv-reroll').onclick = () => { S.shop.units = []; S.shop.items = []; rollShop(true); this.after(); };
    $('#dv-endless').onclick = () => { S.endless = true; setEndless(true); setColour(); this.after(); };
    $('#dv-boss').onclick = () => { S.endless = true; setEndless(true); S.nikeKills = 104; S.boss = true; setColour(); this.flash('the final wave starts next turn'); saveRun(); };
  },

  tabTools(body) {
    body.innerHTML = `<label class="dev-check"><input type="checkbox" id="dv-ach" ${this.ach ? 'checked' : ''}> achievements unlock while dev mode is on</label>
      <div class="dev-form"><button id="dv-unlock">unlock all achievements</button><button id="dv-lock">reset achievements</button></div>
      <div class="dev-form"><button id="dv-sd" class="big">simulate sudden death</button></div>
      <p class="t">sudden death: starts the sudden death song in the shop. when you press end turn the video opens, the ban phase is skipped, and the battle is timed to the end of the song, then the last death video plays. the opponent is your dev opponent if you made one.</p>
      <label class="dev-check"><input type="checkbox" id="dv-cutrep" ${this.cutRepeat ? 'checked' : ''}> cutscenes can repeat in dev mode (normally once per run)</label>
      <div class="dev-form">${Object.entries(CUTSCENES).filter(([k]) => !['sudden', 'suddenlast'].includes(k)).map(([k, c]) => `<button class="dv-cut" data-k="${k}">play: ${c.title}${k === 'johnwin' ? ' (john wins)' : k === 'vodafonewin' ? ' (vodafone wins)' : ''}</button>`).join('')}</div>
      <div class="dev-form"><button id="dv-off" class="danger">turn dev mode off</button></div>
      <p class="t">dev mode switches itself off in online games. tap the title 7 times (or Ctrl+Alt+D) to turn it on or off.</p>`;
    $('#dv-ach').onchange = e => { this.ach = e.target.checked; };
    $('#dv-unlock').onclick = () => { const d = ACH.load(); ACH_LIST.forEach(a => { if (!d.done[a.id]) d.done[a.id] = Date.now(); }); ACH.save(); ACH.refreshButton(); this.flash('all achievements unlocked'); };
    $('#dv-lock').onclick = () => { ACH.data = { done: {}, themes: [], items: [], chaos: [] }; ACH.save(); ACH.refreshButton(); this.flash('achievements reset'); };
    $('#dv-sd').onclick = () => {
      if (!S) newRun(false);
      closeModal(); showScreen('shop'); renderShop();
      Audio2.stopMusic(); Audio2.playSong('assets/music/suddendeath.mp3');
      this.sdSim = true;
      $('#hud-sd').classList.remove('hidden'); $('#hud-sd').textContent = '☠ sudden death (simulated)';
      toast('sudden death shop. put a team together and press end turn');
    };
    $('#dv-cutrep').onchange = e => { this.cutRepeat = e.target.checked; };
    body.querySelectorAll('.dv-cut').forEach(b => b.onclick = () => { $('#modal').classList.add('hidden'); CUT.watch(b.dataset.k); });
    $('#dv-off').onclick = () => { this.set(false); closeModal(); };
  },
};
window.addEventListener('DOMContentLoaded', () => DEV.init());
