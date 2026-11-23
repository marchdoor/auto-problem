// ============================================================
//  Achievements. Saved on this device only (localStorage), no syncing.
//
//  Icons: each box looks for assets/ach/<id>.png first. If you drop a picture
//  with the achievement's id as its name in that folder it is used. Otherwise
//  the placeholder picture below (a character or item) is shown.
//  Tiers: bronze, silver, gold and red (special).
// ============================================================
const SPX = 'assets/sfx/special/';
const ACH_LIST = [
  // ---- sounds (they unlock the first time you hear them) ----
  { id: 'comeback', cat: 'sounds', tier: 'silver', name: 'comeback', img: 'units/barbara.png', secret: true,
    desc: 'a battle turns around: the winning team was down by 2 or more cards. a special death sound plays on the next card that falls.',
    hint: 'turn a lost battle around.', sound: SPX + 'deathsfxCOMEBACK.mp3' },
  { id: 'landslide', cat: 'sounds', tier: 'silver', name: 'landslide', img: 'units/troop.png', secret: true,
    desc: 'a battle ends with the winner still holding 3 or more cards. the last death plays this sound.',
    hint: 'end a battle with a huge lead.', sound: SPX + 'deathsfxlastdeathbylandslide.mp3' },
  { id: 'rare', cat: 'sounds', tier: 'red', name: 'rare last words', img: 'units/pennius.png', secret: true,
    desc: 'the last death of a battle has a 15% chance to play this one instead of staying quiet.',
    hint: 'a rare sound hides behind the last death of a battle.', sound: SPX + 'deathsfxlastdeathrarechance.mp3' },
  { id: 'noproblem', cat: 'sounds', tier: 'red', name: 'no problem x2', img: 'units/noproblem.png', secret: true,
    desc: 'no problem gets his 2nd kill in one battle. the sound plays alone, and only once.',
    hint: 'let no problem fight. he has a sound for his 2nd kill.', sound: SPX + 'deathsfxnoproblem2killsplus.mp3' },
  { id: 'sudden', cat: 'sounds', tier: 'silver', name: 'sudden death', img: 'units/venom.png', secret: true,
    desc: 'reach sudden death in an online game: two players left, both on their last life.',
    hint: 'an online game can end in sudden death.', sound: 'assets/music/suddendeath.mp3' },
  { id: 'suddenlast', cat: 'sounds', tier: 'silver', name: 'last death', img: 'units/criminal.png', secret: true,
    desc: 'the last death of a sudden death battle. everything else goes quiet.',
    hint: 'finish a sudden death battle.', sound: SPX + 'suddendeathlastdeathsfx.mp3' },
  { id: 'negev', cat: 'sounds', tier: 'red', name: 'negev', img: 'items/negev.png', secret: true,
    desc: 'a negev lose theme. it plays in the middle of the normal lose themes.',
    hint: 'one lose theme is not like the others.', sound: 'assets/music/lose/negev.mp3' },
  { id: 'themes_win', cat: 'sounds', tier: 'bronze', name: 'victory songs', img: 'units/funny.png', themes: 'win',
    desc: 'the songs that play after you win a battle. each one unlocks when you hear it.' },
  { id: 'themes_lose', cat: 'sounds', tier: 'bronze', name: 'defeat songs', img: 'units/bondo2.png', themes: 'lose',
    desc: 'the songs that play after you lose a battle. each one unlocks when you hear it.' },

  // ---- secret characters ----
  { id: 'jahntonner', cat: 'secret', tier: 'red', name: 'jahn tonner', img: 'units/jahntonner.png', secret: true, unit: 'jahntonner',
    desc: 'fuse john tanner with a level 3 tanner john. he is tier 7 and never appears in the shop.',
    hint: 'two old friends can become something bigger.' },

  // ---- cutscenes (you can watch them again here) ----
  { id: 'cut_john', cat: 'cutscenes', tier: 'red', name: 'the rat is caught', img: 'units/john.png', secret: true, video: 'johnwin',
    desc: 'john tanner and woto tolff meet front to front, and john tanner wins. the player pops out and the battle is timed to the video.',
    hint: 'john tanner and the vodafone ceo might have words. one of them has to win.' },
  { id: 'cut_vodafone', cat: 'cutscenes', tier: 'red', name: 'the rat survives', img: 'units/vodafone.png', secret: true, video: 'vodafonewin',
    desc: 'john tanner and woto tolff meet front to front, and woto tolff wins.',
    hint: 'john tanner and the vodafone ceo might have words. one of them has to win.' },

  // ---- runs ----
  { id: 'firstblood', cat: 'run', tier: 'bronze', name: 'first blood', img: 'units/noproblem.png', desc: 'win your first battle.' },
  { id: 'level3', cat: 'run', tier: 'bronze', name: 'ssj', img: 'units/tannerjohn.png', desc: 'get a character to level 3.' },
  { id: 'overdose', cat: 'run', tier: 'bronze', name: 'overdose', img: 'items/overdose.jpg', desc: 'use agartha 67 overdose on one of your own characters.' },
  { id: 'tenwins', cat: 'run', tier: 'silver', name: 'end of the line', img: 'units/giuseppe.png', desc: 'win 10 battles in one run.' },
  { id: 'lastlife', cat: 'run', tier: 'silver', name: 'one more life', img: 'units/man.png', desc: 'win a battle while you are on your last life.' },
  { id: 'fullhouse', cat: 'run', tier: 'silver', name: 'full house', img: 'units/gjr.png', desc: 'have 6 or more characters alive on your side at the same time (clones help).' },
  { id: 'ghost', cat: 'run', tier: 'bronze', name: 'ghost hunter', img: 'units/frog.png', desc: 'beat a ghost, a team another run left behind.' },
  { id: 'flawless', cat: 'run', tier: 'gold', name: 'flawless', img: 'units/yesproblem.png', desc: 'win 10 battles in one run without losing a single life.' },
  { id: 'soldout', cat: 'run', tier: 'gold', name: 'sold out', img: 'items/tantum.png', items: true, desc: 'use every item in the game at least once.' },
  { id: 'chaos', cat: 'run', tier: 'silver', name: 'cemetery chaos', img: 'units/cemeteryfc.webp', chaos: true, desc: 'see all 6 of cemetery fc\'s start of battle effects: ban, rl number swap, ghost, the monitor explodes, turn on monitor and the rage quit.' },
  { id: 'criminol', cat: 'run', tier: 'silver', name: 'criminol nuke', img: 'units/criminol_nuke.png', desc: 'see criminol\'s nuke go off.' },

  // ---- endless ----
  { id: 'endless', cat: 'endless', tier: 'silver', name: 'endless', img: 'units/clone.png', desc: 'win a battle in endless mode.' },
  { id: 'beyond', cat: 'endless', tier: 'gold', name: 'beyond level 3', img: 'units/ceo3m.png', desc: 'get a character to level 10.' },
  { id: 'finalboss', cat: 'endless', tier: 'silver', name: 'the final wave', img: 'units/g44.png', desc: 'reach the final wave: 104 dead, 1 to go.' },
  { id: 'keeporrebuild', cat: 'endless', tier: 'bronze', name: 'keep or rebuild', img: 'units/loanshark.png', desc: 'choose between keeping your team or rebuilding before the final wave.' },
  { id: 'nikeslayer', cat: 'endless', tier: 'gold', name: 'nike slayer', img: 'units/john.png', desc: 'beat giuseppe creatore and the nike inc. militia.' },
  { id: 'rebuilt', cat: 'endless', tier: 'gold', name: 'rebuilt', img: 'units/boschceo.png', desc: 'beat the final wave after rebuilding in the veterans market.' },

  // ---- online ----
  { id: 'firstfriend', cat: 'online', tier: 'bronze', name: 'first friend', img: 'units/renault.png', desc: 'finish an online game.' },
  { id: 'beatfriend', cat: 'online', tier: 'silver', name: 'beat a friend', img: 'units/darius.png', desc: 'win an online game.' },
  { id: 'banhammer', cat: 'online', tier: 'silver', name: 'banhammer', img: 'units/kenji.png', desc: 'in sudden death, remove a buff from an enemy character.' },
  { id: 'mutual', cat: 'online', tier: 'silver', name: 'mutual destruction', img: 'units/crosos.png', desc: 'in sudden death, both players agree to ban a card from each team.' },
];
const ACH_CATS = { sounds: 'sounds', secret: 'secret characters', cutscenes: 'cutscenes', run: 'runs', endless: 'endless', online: 'online' };
const ACH_TIERS = ['bronze', 'silver', 'gold', 'red'];

const ACH = {
  data: null,
  load() {
    if (this.data) return this.data;
    let d = null; try { d = JSON.parse(localStorage.getItem('np_ach') || 'null'); } catch (e) {}
    this.data = Object.assign({ done: {}, themes: [], items: [], chaos: [] }, d || {});
    return this.data;
  },
  save() { try { localStorage.setItem('np_ach', JSON.stringify(this.data)); } catch (e) {} },
  get: id => ACH_LIST.find(a => a.id === id),
  has(id) { return !!this.load().done[id]; },
  count() { const d = this.load(); return ACH_LIST.filter(a => d.done[a.id]).length; },

  unlock(id, silent) {
    const a = this.get(id), d = this.load();
    if (!a || d.done[id]) return;
    d.done[id] = Date.now(); this.save();
    this.refreshButton();
    if (!silent) this.popup(a);
  },

  // ---- the popup ----
  queue: [], popping: false,
  popup(a) { this.queue.push(a); if (!this.popping) this.nextPopup(); },
  nextPopup() {
    const a = this.queue.shift();
    if (!a) { this.popping = false; return; }
    this.popping = true;
    let el = document.getElementById('ach-pop');
    if (!el) { el = document.createElement('div'); el.id = 'ach-pop'; document.getElementById('app').appendChild(el); }
    el.className = 't-' + a.tier;
    el.innerHTML = `${this.iconHTML(a)}<div><small>achievement unlocked</small><b>${a.name}</b></div>`;
    void el.offsetWidth; el.classList.add('show');
    try { Audio2.tone(784, .12, 'square', .1); Audio2.tone(1175, .2, 'square', .1, 0, .12); } catch (e) {}
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => this.nextPopup(), 400); }, 3200);
  },

  // ---- hooks the game calls ----
  heard(path) { // a death sound or a song started playing
    const a = ACH_LIST.find(x => x.sound === path);
    if (a) this.unlock(a.id);
  },
  theme(path) { // a win / lose song started
    if (!path) return;
    if (path.endsWith('/negev.mp3')) return this.unlock('negev');
    const kind = (MANIFEST.win || []).includes(path) ? 'win' : (MANIFEST.lose || []).includes(path) ? 'lose' : null;
    if (!kind) return;
    const d = this.load();
    if (!d.themes.includes(path)) { d.themes.push(path); this.save(); }
    this.unlock('themes_' + kind);
  },
  level(L) { if (L >= 3) this.unlock('level3'); if (L >= 10) this.unlock('beyond'); },
  item(id) {
    const d = this.load();
    if (!d.items.includes(id)) { d.items.push(id); this.save(); }
    if (ITEMS[id] && ITEMS[id].kill) this.unlock('overdose');
    if (Object.keys(ITEMS).every(k => d.items.includes(k))) this.unlock('soldout');
  },
  // o: { wins, lives, startLives, endless, boss, rebuild, ghost, net }
  afterBattle(result, o) {
    if (result !== 'win') return;
    this.unlock('firstblood');
    if (o.lives === 1) this.unlock('lastlife');
    if (o.ghost) this.unlock('ghost');
    if (o.endless) this.unlock('endless');
    if (o.wins >= 10) { this.unlock('tenwins'); if (!o.net && o.lives >= o.startLives) this.unlock('flawless'); }
    if (o.boss) { this.unlock('nikeslayer'); if (o.rebuild) this.unlock('rebuilt'); }
  },
  frames(frames) { // things you can only see in the battle itself
    const d = this.load();
    const re = [[/720 hour ban/, 0], [/rl number swapped/, 1], [/ghost joins the cemetery/, 2], [/the monitor explodes/, 3], [/^turn on monitor$/, 4], [/cemetery fc rage quits/, 5]];
    let full = false, nuked = false, chaosNew = false;
    for (const f of frames) {
      if (!full && (f.A || []).filter(u => !u.dead).length >= 6) full = true;
      if (f.cap) {
        if (/criminol nukes everything/.test(f.cap)) nuked = true;
        for (const [r, k] of re) if (r.test(f.cap) && !d.chaos.includes(k)) { d.chaos.push(k); chaosNew = true; }
      }
    }
    if (chaosNew) { this.save(); if (d.chaos.length >= 6) this.unlock('chaos'); }
    if (full) this.unlock('fullhouse');
    if (nuked) this.unlock('criminol');
  },

  // ---- the menu button ----
  refreshButton() {
    const b = document.getElementById('btn-ach'); if (!b) return;
    b.textContent = `achievements ${this.count()}/${ACH_LIST.length}`;
  },
  init() {
    this.load();
    try { if (localStorage.getItem('np_secret_jahn') === '1') this.unlock('jahntonner', true); } catch (e) {}
    this.refreshButton();
  },

  // ---- icons ----
  iconHTML(a, locked) {
    const fb = 'assets/' + a.img;
    return `<div class="ach-ico${locked ? ' locked' : ''}${locked && a.secret ? ' secret' : ''}"><img src="assets/ach/${a.id}.png" onerror="this.onerror=null;this.src='${fb}'" alt=""></div>`;
  },

  // ---- the page ----
  stop() {
    if (this.audio) { this.audio.pause(); this.audio = null; }
    if (this.playBtn) { this.playBtn.textContent = '▶'; this.playBtn.parentNode.classList.remove('playing'); this.playBtn = null; }
    if (this.resumeMenu) { this.resumeMenu = false; try { Audio2.tryPlayMusic(); } catch (e) {} }
  },
  play(src, root) {
    const btn = root.querySelector('.ap-btn'), bar = root.querySelector('.ap-bar i');
    const same = this.playBtn === btn;
    this.stop();
    if (same) return;
    const a = new Audio(encodePath(src));
    a.volume = Audio2.volume;
    this.audio = a; this.playBtn = btn;
    btn.textContent = '■'; root.classList.add('playing');
    // the menu song would play over it: pause it until the sound is done
    if (Audio2.music && !Audio2.music.paused) { Audio2.music.pause(); this.resumeMenu = true; }
    a.addEventListener('timeupdate', () => { if (a.duration) bar.style.width = (100 * a.currentTime / a.duration) + '%'; });
    a.addEventListener('ended', () => { if (this.audio === a) { this.stop(); bar.style.width = '0'; } });
    a.addEventListener('error', () => { if (this.audio === a) this.stop(); });
    a.play().catch(() => this.stop());
  },
  playerHTML(a) {
    if (a.sound) return `<div class="ach-player" data-src="${a.sound}"><button class="ap-btn">▶</button><div class="ap-mid"><span class="ap-name">${a.sound.split('/').pop().replace(/\.\w+$/, '')}</span><div class="ap-bar"><i></i></div></div></div>`;
    if (a.themes) {
      const all = (MANIFEST[a.themes] || []).filter(p => !p.endsWith('/negev.mp3')).slice().sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
      return `<div class="ach-player list" data-themes="${a.themes}"><button class="ap-nav" data-d="-1">‹</button><button class="ap-btn">▶</button><div class="ap-mid"><span class="ap-name"></span><div class="ap-bar"><i></i></div></div><button class="ap-nav" data-d="1">›</button></div><div class="ach-n">${this.load().themes.filter(p => all.includes(p)).length}/${all.length} heard</div>`;
    }
    return '';
  },
  wirePlayers(root) {
    const d = this.load();
    root.querySelectorAll('.ach-player').forEach(p => {
      if (p.dataset.src) { p.querySelector('.ap-btn').onclick = () => this.play(p.dataset.src, p); return; }
      const kind = p.dataset.themes;
      const all = (MANIFEST[kind] || []).filter(x => !x.endsWith('/negev.mp3')).slice().sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
      let i = Math.max(0, all.findIndex(x => d.themes.includes(x)));
      const draw = () => {
        const heard = d.themes.includes(all[i]);
        p.querySelector('.ap-name').textContent = heard ? `${all[i].split('/').pop().replace(/\.\w+$/, '')}  (${i + 1}/${all.length})` : `???  (${i + 1}/${all.length})`;
        p.classList.toggle('unheard', !heard);
      };
      p.querySelectorAll('.ap-nav').forEach(b => b.onclick = () => { this.stop(); p.querySelector('.ap-bar i').style.width = '0'; i = (i + (+b.dataset.d) + all.length) % all.length; draw(); });
      p.querySelector('.ap-btn').onclick = () => { if (d.themes.includes(all[i])) this.play(all[i], p); else toast('you have not heard this one yet'); };
      draw();
    });
  },

  open() {
    const d = this.load();
    const tierCount = t => { const l = ACH_LIST.filter(a => a.tier === t); return `${l.filter(a => d.done[a.id]).length}/${l.length}`; };
    let html = `<h2>achievements</h2>
      <p class="t">${this.count()}/${ACH_LIST.length} unlocked · <span class="tc t-bronze">bronze ${tierCount('bronze')}</span> <span class="tc t-silver">silver ${tierCount('silver')}</span> <span class="tc t-gold">gold ${tierCount('gold')}</span> <span class="tc t-red">special ${tierCount('red')}</span> · saved on this device only</p>
      <div class="ach-grid">`;
    Object.keys(ACH_CATS).forEach(cat => {
      html += `<div class="codex-tier">${ACH_CATS[cat]}</div>`;
      ACH_LIST.filter(a => a.cat === cat).forEach(a => {
        const done = !!d.done[a.id], hide = a.secret && !done;
        let extra = '';
        if (a.themes || (a.sound && done)) extra = this.playerHTML(a);
        if (a.video && done) extra = `<div class="ach-vid"><video preload="metadata" muted playsinline src="${CUTSCENES[a.video].src}#t=1"></video><button class="ach-watch" data-key="${a.video}">▶ watch again</button></div>`;
        if (a.unit) extra = `<div class="ach-card${done ? '' : ' locked'}" data-unit="${a.unit}"></div>`;
        if (!done && a.items) { const n = d.items.length, t = Object.keys(ITEMS).length; extra = `<div class="ach-prog"><i style="width:${100 * n / t}%"></i></div><div class="ach-n">${n}/${t} items used</div>`; }
        if (!done && a.chaos) extra = `<div class="ach-prog"><i style="width:${100 * d.chaos.length / 6}%"></i></div><div class="ach-n">${d.chaos.length}/6 effects seen</div>`;
        const locked = !done && !(a.themes && d.themes.length);
        if (a.themes && !locked) extra = this.playerHTML(a);
        if (a.themes && locked) extra = `<div class="ach-n">hear one to unlock</div>`;
        html += `<div class="ach t-${a.tier}${locked ? ' locked' : ''}">
          ${this.iconHTML(a, locked)}
          <div class="ach-body"><h4>${hide ? '???' : a.name}<span class="ach-tier">${a.tier === 'red' ? 'special' : a.tier}</span></h4>
          <div class="ach-desc">${hide ? a.hint : a.desc}</div>${extra}</div></div>`;
      });
    });
    html += `</div>`;
    openModal(html);
    const root = $('#modal-body');
    this.wirePlayers(root);
    root.querySelectorAll('.ach-watch').forEach(b => b.onclick = () => CUT.watch(b.dataset.key));
    const slot = root.querySelector('.ach-card');
    if (slot) { const u = newUnit(slot.dataset.unit); u.lvl = 1; slot.appendChild(cardEl(u)); }
  },
};
