// ============================================================
//  Game flow: title, shop phase, battle playback, results.
// ============================================================
const $ = s => document.querySelector(s);
const UNIT_COST = 3, ITEM_COST = 3, ROLL_COST = 1, START_GOLD = 10, START_LIVES = 5, WIN_TARGET = 10;

let S = null;          // run state
let sel = null;        // {kind:'shop'|'item'|'team', idx}
let speed = 1, skipping = false, battleBusy = false;

const imgSrc = id => { const i = UNITS[id].img; return i ? `assets/units/${i.includes('.') ? i : i + '.png'}` : null; };
const itemArt = (id, cls = '') => { const it = ITEMS[id]; return it.img ? `<img class="iimg ${cls} ${it.fit === 'contain' ? 'contain' : ''}" src="assets/items/${it.img}" alt="">` : it.icon; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const lvl = u => levelOf(u.exp);

// ---------------- persistence ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const saveRun = () => { if (S && !S.net) store.set('np_run', S); };

// ---------------- shop ability context ----------------
// every stat buff is logged on the character so sudden death can remove one
let buffSrc = null;
function logBuff(u, a, h, src) { if (!a && !h) return; (u.buffs = u.buffs || []).push({ a, h, src: src || buffSrc || 'buff' }); }
function shopCtx() {
  const team = S.team;
  const live = () => team.filter(Boolean);
  const s = {
    buff(u, a, h) { if (!u) return; const a0 = u.atk, h0 = u.hp; u.atk = Math.min(MAX_STAT, u.atk + a); u.hp = Math.min(MAX_STAT, u.hp + h); logBuff(u, u.atk - a0, u.hp - h0); flashCard(u.uid); },
    gold(n) { S.gold = Math.max(0, S.gold + n); },
    randomFriends(u, n) { const a = live().filter(f => f !== u); const r = []; while (r.length < n && a.length) r.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return r; },
    allFriends: () => live(),
    ahead(u) { const i = team.indexOf(u); for (let j = i - 1; j >= 0; j--) if (team[j]) return team[j]; return null; },
    behind(u) { const i = team.indexOf(u); for (let j = i + 1; j < 5; j++) if (team[j]) return team[j]; return null; },
    addExp(u, n) { const before = lvl(u); u.exp = Math.min(5, u.exp + n); if (lvl(u) > before) onLevelUp(u); },
    caption(t) { toast(t); },
  };
  return s;
}
function shopTrigger(u, ev, ...a) { const h = UNITS[u.id].on[ev]; if (h) { buffSrc = UNITS[u.id].name; try { h(shopCtx(), u, lvl(u), ...a); } finally { buffSrc = null; } } }

// ---------------- run lifecycle ----------------
// one song per shop phase and per battle phase; no repeats within a run / online game
function phaseSong(kind) {
  if (S && S.net) { if (NET.songs && NET.songs[kind]) Audio2.playSong(NET.songs[kind]); return; }
  if (!S) return;
  if (!S.playlist || !S.playlist.list || !S.playlist.list.length) S.playlist = newPlaylist();
  Audio2.playSong(nextSong(S.playlist));
}

function newRun() {
  S = { runId: Date.now() + '-' + Math.floor(Math.random() * 1e6), turn: 1, gold: START_GOLD, lives: START_LIVES, wins: 0,
        team: [null, null, null, null, null], shop: { units: [], items: [] }, nikeKills: 0, history: [] };
  rollShop(true);
  S.playlist = newPlaylist();
  saveRun();
  showScreen('shop'); renderShop();
  phaseSong('shop');
}

function startTurn() {
  S.turn++; S.gold = START_GOLD;
  rollShop(true);
  S.team.filter(Boolean).forEach(u => shopTrigger(u, 'startTurn'));
  saveRun();
  showScreen('shop'); renderShop();
  phaseSong('shop');
}

function shopSizes() {
  const t = S.turn;
  return { units: t <= 4 ? 3 : t <= 8 ? 4 : 5, items: t <= 2 ? 1 : 2 };
}
function randomUnitId(maxTier) {
  const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && UNITS[k].tier <= maxTier);
  return pick(pool);
}
function randomItemId(maxTier) {
  return pick(Object.keys(ITEMS).filter(k => ITEMS[k].tier <= maxTier));
}
function rollShop(free) {
  const tier = tierFor(S.turn), n = shopSizes();
  const keptU = S.shop.units.filter(s => s.frozen), keptI = S.shop.items.filter(s => s.frozen);
  const units = keptU.slice(0, Math.max(n.units, keptU.length));
  while (units.length < n.units) units.push({ u: newUnit(randomUnitId(tier)), frozen: false });
  const items = keptI.slice();
  while (items.length < n.items) items.push({ id: randomItemId(tier), frozen: false });
  S.shop.units = units; S.shop.items = items;
}

// ---------------- shop actions ----------------
function emptyIndex() { return S.team.findIndex(x => !x); }

function placeAt(unit, i) {
  if (!S.team[i]) { S.team[i] = unit; return true; }
  const empties = [0, 1, 2, 3, 4].filter(j => !S.team[j]);
  if (!empties.length) return false;
  const j = empties.sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
  if (j > i) for (let k = j; k > i; k--) S.team[k] = S.team[k - 1];
  else for (let k = j; k < i; k++) S.team[k] = S.team[k + 1];
  S.team[i] = unit; return true;
}

function mergeInto(target, src) {
  const before = lvl(target), a0 = target.atk, h0 = target.hp;
  target.atk = Math.min(MAX_STAT, Math.max(target.atk, src.atk) + 1);
  target.hp = Math.min(MAX_STAT, Math.max(target.hp, src.hp) + 1);
  logBuff(target, target.atk - a0, target.hp - h0, 'merge');
  target.exp = Math.min(5, target.exp + src.exp + 1);
  if (!target.item && src.item) target.item = src.item;
  Audio2.play('merge');
  if (lvl(target) > before) onLevelUp(target);
}

function onLevelUp(u) {
  Audio2.play('levelup');
  toast(`${UNITS[u.id].name} goes ssj (level ${lvl(u)})`);
  const t = Math.min(6, tierFor(S.turn) + 1);
  const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && UNITS[k].tier === t);
  if (S.shop.units.length < 7) S.shop.units.push({ u: newUnit(pick(pool)), frozen: false });
}

function canMerge(a, b) { return a && b && a.id === b.id && a.uid !== b.uid && lvl(a) < 3; }

function buyUnit(shopIdx, slot) {
  const entry = S.shop.units[shopIdx]; if (!entry) return;
  if (S.gold < UNIT_COST) return toast('not enough gold and you cry');
  const target = S.team[slot];
  if (canMerge(target, entry.u)) {
    S.gold -= UNIT_COST; S.shop.units.splice(shopIdx, 1);
    mergeInto(target, entry.u);
    shopTrigger(target, 'buy');
  } else {
    const fresh = entry.u;
    if (!placeAt(fresh, slot)) return toast('team is full');
    S.gold -= UNIT_COST; S.shop.units.splice(shopIdx, 1);
    Audio2.play('buy');
    shopTrigger(fresh, 'buy');
  }
  sel = null; saveRun(); renderShop();
}

function useItem(itemIdx, slot) {
  const entry = S.shop.items[itemIdx]; const u = S.team[slot];
  if (!entry || !u) return;
  if (S.gold < ITEM_COST) return toast('not enough gold and you cry');
  const it = ITEMS[entry.id];
  S.gold -= ITEM_COST; S.shop.items.splice(itemIdx, 1);
  if (it.equip) { u.item = entry.id; toast(`${UNITS[u.id].name} equips ${it.name}`); }
  else { buffSrc = it.name; try { it.use(shopCtx(), u); } finally { buffSrc = null; } }
  Audio2.play('item');
  sel = null; saveRun(); renderShop();
}

function moveTeam(from, to) {
  if (from === to) { sel = null; return renderShop(); }
  const a = S.team[from], b = S.team[to];
  if (canMerge(b, a)) { S.team[from] = null; mergeInto(b, a); }
  else { S.team[to] = a; S.team[from] = b; Audio2.play('click'); }
  sel = null; saveRun(); renderShop();
}

function sellTeam(idx) {
  const u = S.team[idx]; if (!u) return;
  shopTrigger(u, 'sell');
  S.gold += lvl(u);
  S.team[idx] = null;
  Audio2.play('sell');
  toast(`sold ${UNITS[u.id].name} (+${lvl(u)}🪙)`);
  sel = null; saveRun(); renderShop();
}

function roll() {
  if (S.gold < ROLL_COST) return toast('not enough gold and you cry');
  S.gold -= ROLL_COST; rollShop(); Audio2.play('roll');
  sel = null; saveRun(); renderShop();
}

function toggleFreeze() {
  if (!sel) return;
  const e = sel.kind === 'shop' ? S.shop.units[sel.idx] : sel.kind === 'item' ? S.shop.items[sel.idx] : null;
  if (!e) return;
  e.frozen = !e.frozen; Audio2.play('freeze');
  saveRun(); renderShop();
}

function slotClick(i) {
  if (battleBusy) return;
  if (!sel) {
    if (S.team[i]) { sel = { kind: 'team', idx: i }; Audio2.play('click'); }
    return renderShop();
  }
  if (sel.kind === 'shop') return buyUnit(sel.idx, i);
  if (sel.kind === 'item') { if (S.team[i]) return useItem(sel.idx, i); return toast('drop items on a character'); }
  if (sel.kind === 'team') return moveTeam(sel.idx, i);
}

// ---------------- rendering ----------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}
function setColour() {
  const w = S ? S.wins : 0;
  document.documentElement.style.setProperty('--gray', Math.max(0, 1 - w / WIN_TARGET).toFixed(2));
}

function cardEl(u, opts = {}) {
  const d = UNITS[u.id];
  const el = document.createElement('div');
  el.className = 'card' + (opts.sel ? ' sel' : '') + (opts.frozen ? ' frozen' : '');
  el.dataset.uid = u.uid;
  const L = u.lvl || levelOf(u.exp || 0), exp = u.exp || 0;
  const src = imgSrc(u.id);
  const pips = L >= 3 ? '' : (L === 1 ? [0, 1].map(k => `<i class="${exp > k ? 'on' : ''}"></i>`) : [2, 3, 4].map(k => `<i class="${exp > k ? 'on' : ''}"></i>`)).join('');
  el.innerHTML = `
    <div class="pic">${src ? `<img src="${src}" alt=""${d.bw ? ' class="bw"' : ''}>` : `<div class="noimg">?</div>`}
      ${opts.shop ? `<span class="tier">t${d.tier}</span><span class="cost">${UNIT_COST}🪙</span>` : ''}
      <div class="nm">${u.name || d.name}</div>
    </div>
    ${u.item ? `<div class="itm" title="${ITEMS[u.item].name}">${itemArt(u.item)}</div>` : ''}
    ${u.debuffNote ? `<div class="dbf" title="${u.debuffNote}">−</div>` : ''}
    <div class="stats"><div class="badge atk">${u.atk}</div><div class="badge hp">${u.hp}</div></div>
    <div class="lvl">lvl ${L} ${pips}</div>`;
  return el;
}

function itemEl(entry, isSel) {
  const it = ITEMS[entry.id];
  const el = document.createElement('div');
  el.className = 'item-card' + (isSel ? ' sel' : '') + (entry.frozen ? ' frozen' : '');
  el.innerHTML = `<div class="ipic">${itemArt(entry.id)}</div><div class="inm">${it.name}</div>`;
  return el;
}

function infoFor(u, isItem) {
  const box = $('#info');
  if (!u) { box.innerHTML = `<div class="info-empty">tap a character to see what they do. tap a shop card, then a team slot to buy (on PC you can also drag).</div>`; return; }
  if (isItem) {
    const it = ITEMS[u];
    box.innerHTML = `<div class="info-icon">${itemArt(u)}</div><div><h3>${it.name}</h3><div class="t">item · tier ${it.tier} · ${ITEM_COST}🪙</div><div class="ab">${it.text}</div></div>`;
    return;
  }
  const d = UNITS[u.id], L = levelOf(u.exp || 0);
  box.innerHTML = `<div><h3>${d.name}</h3><div class="t">tier ${d.tier} · level ${L}${u.item ? ` · holding ${ITEMS[u.item].name}: ${ITEMS[u.item].text}` : ''}${(d.tags || []).includes('nike') ? ' · nike inc.' : ''}</div><div class="ab">${d.text(L)}</div>${u.debuffNote ? `<div class="ab" style="color:#ff5252">☠ ${u.debuffNote}</div>` : ''}</div>`;
}

function renderShop() {
  setColour();
  $('#hud-gold').textContent = S.gold;
  $('#hud-lives').textContent = S.lives;
  $('#hud-wins').textContent = S.wins;
  $('#hud-turn').textContent = S.turn;
  const k = S.nikeKills;
  $('#hud-nike').textContent = k >= 104 ? 'nike inc status: total 104 dead 1 to go' : `nike inc status: ${k} dead ${104 - k} to go`;
  $('#tier-label').textContent = `tier 1-${tierFor(S.turn)}`;
  $('#btn-mute').textContent = Audio2.muted ? '🔇' : '🔊';

  // team
  const row = $('#team-row'); row.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot'; slot.dataset.i = i;
    const u = S.team[i];
    const targetable = sel && (sel.kind === 'shop' || sel.kind === 'team' || (sel.kind === 'item' && u));
    if (targetable) slot.classList.add('target');
    if (u) {
      const el = cardEl(u, { sel: sel && sel.kind === 'team' && sel.idx === i });
      el.draggable = true;
      el.addEventListener('dragstart', e => { sel = { kind: 'team', idx: i }; e.dataTransfer.setData('text', 'x'); });
      el.addEventListener('mouseenter', () => { if (!sel) infoFor(u); });
      slot.appendChild(el);
    } else slot.textContent = i === 0 ? 'front' : '';
    slot.addEventListener('click', () => slotClick(i));
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('over'));
    slot.addEventListener('drop', e => { e.preventDefault(); slot.classList.remove('over'); slotClick(i); });
    row.appendChild(slot);
  }

  // shop units
  const su = $('#shop-units'); su.innerHTML = '';
  S.shop.units.forEach((e, i) => {
    const el = cardEl(e.u, { shop: true, frozen: e.frozen, sel: sel && sel.kind === 'shop' && sel.idx === i });
    el.draggable = true;
    el.addEventListener('dragstart', ev => { sel = { kind: 'shop', idx: i }; ev.dataTransfer.setData('text', 'x'); });
    el.addEventListener('click', () => { sel = sel && sel.kind === 'shop' && sel.idx === i ? null : { kind: 'shop', idx: i }; Audio2.play('click'); renderShop(); });
    el.addEventListener('mouseenter', () => { if (!sel) infoFor(e.u); });
    su.appendChild(el);
  });
  // shop items
  const si = $('#shop-items'); si.innerHTML = '';
  S.shop.items.forEach((e, i) => {
    const el = itemEl(e, sel && sel.kind === 'item' && sel.idx === i);
    el.draggable = true;
    el.addEventListener('dragstart', ev => { sel = { kind: 'item', idx: i }; ev.dataTransfer.setData('text', 'x'); });
    el.addEventListener('click', () => { sel = sel && sel.kind === 'item' && sel.idx === i ? null : { kind: 'item', idx: i }; Audio2.play('click'); renderShop(); });
    el.addEventListener('mouseenter', () => { if (!sel) infoFor(e.id, true); });
    si.appendChild(el);
  });

  // info + buttons
  if (sel) {
    if (sel.kind === 'shop') infoFor(S.shop.units[sel.idx] && S.shop.units[sel.idx].u);
    else if (sel.kind === 'item') infoFor(S.shop.items[sel.idx] && S.shop.items[sel.idx].id, true);
    else infoFor(S.team[sel.idx]);
  } else infoFor(null);
  $('#btn-sell').disabled = !(sel && sel.kind === 'team');
  $('#btn-sell').textContent = sel && sel.kind === 'team' && S.team[sel.idx] ? `sell (+${lvl(S.team[sel.idx])}🪙)` : 'sell';
  const fr = sel && (sel.kind === 'shop' || sel.kind === 'item');
  $('#btn-freeze').disabled = !fr;
  const fe = fr && (sel.kind === 'shop' ? S.shop.units[sel.idx] : S.shop.items[sel.idx]);
  $('#btn-freeze').textContent = fe && fe.frozen ? 'unfreeze ❄' : 'freeze ❄';
  $('#btn-roll').disabled = S.gold < ROLL_COST;
}

function flashCard(uid) {
  setTimeout(() => {
    const el = document.querySelector(`.card[data-uid="${uid}"]`);
    if (el) { el.classList.remove('buffed'); void el.offsetWidth; el.classList.add('buffed'); }
  }, 30);
}

let toastTimer = null, toastQ = [];
function toast(t) {
  toastQ.push(t);
  if (toastTimer) return;
  const next = () => {
    const m = toastQ.shift();
    if (!m) { toastTimer = null; $('#toast').classList.remove('show'); return; }
    $('#toast').textContent = m; $('#toast').classList.add('show');
    toastTimer = setTimeout(next, 1300);
  };
  next();
}

// ---------------- battle ----------------
const sleep = ms => new Promise(r => setTimeout(r, skipping ? 0 : ms / speed));

function pickOpponent() {
  const ghosts = store.get('np_ghosts', []).filter(g => g.turn === S.turn && g.run !== S.runId);
  if (ghosts.length && Math.random() < 0.4) {
    const g = pick(ghosts);
    return { name: `ghost: ${g.name}`, team: g.team.map(u => newUnit(u.id, { atk: u.atk, hp: u.hp, exp: u.exp, item: u.item })) };
  }
  const seed = Math.floor(Math.random() * 1e9);
  return { name: pick(TEAM_NAMES), team: buildBotTeam(S.turn, mulberry32(seed)) };
}

function saveGhost() {
  const team = S.team.filter(Boolean).map(u => ({ id: u.id, atk: u.atk, hp: u.hp, exp: u.exp, item: u.item }));
  if (!team.length) return;
  const g = store.get('np_ghosts', []);
  g.push({ run: S.runId, turn: S.turn, team, name: pick(TEAM_NAMES) });
  store.set('np_ghosts', g.slice(-300));
}

async function endTurn(forced) {
  if (battleBusy || !S) return;
  if (!S.team.some(Boolean) && !S.net) return toast('you need at least 1 character');
  battleBusy = true; sel = null;
  S.team.filter(Boolean).forEach(u => shopTrigger(u, 'endTurn'));
  renderShop();
  await new Promise(r => setTimeout(r, 450));
  saveGhost();
  if (S.net) { NET.submitTeam(); return; }

  const opp = pickOpponent();
  const seed = Math.floor(Math.random() * 1e9);
  const res = simulateBattle(S.team, opp.team, seed);
  showScreen('battle');
  phaseSong('battle');
  $('#enemy-name').textContent = opp.name;
  $('#b-lives').textContent = S.lives; $('#b-wins').textContent = S.wins; $('#b-turn').textContent = S.turn;
  skipping = false;
  await playBattle(res.frames, { result: res.result, seed });

  S.nikeKills += res.stats.cloneKills;
  finishBattle(res.result);
}

function renderBattleTeams(f) {
  const draw = (el, team, side) => {
    el.innerHTML = '';
    team.forEach(u => { const c = cardEl(u); c.dataset.side = side; el.appendChild(c); });
  };
  draw($('#b-mine'), f.A, 'A'); draw($('#b-theirs'), f.B, 'B');
}

function floatText(uid, text, cls) {
  const el = document.querySelector(`#battle .card[data-uid="${uid}"]`);
  if (!el) return;
  const f = document.createElement('div'); f.className = 'float ' + cls; f.textContent = text;
  el.appendChild(f); setTimeout(() => f.remove(), 900);
}

// Works out which death sounds play on which frame. The battle is already
// simulated, so comebacks and landslides are known before they happen.
const SPECIAL = {
  comeback: 'assets/sfx/special/deathsfxCOMEBACK.mp3',
  landslide: 'assets/sfx/special/deathsfxlastdeathbylandslide.mp3',
  rare: 'assets/sfx/special/deathsfxlastdeathrarechance.mp3',
  noproblem: 'assets/sfx/special/deathsfxnoproblem2killsplus.mp3',
  suddenLast: 'assets/sfx/special/suddendeathlastdeathsfx.mp3',
};
function planDeathSounds(frames, opts) {
  const plan = {};            // frame index -> list of {path, exclusive} or 'synth'
  const add = (i, x) => { (plan[i] = plan[i] || []).push(x); };
  const deaths = [];
  frames.forEach((f, i) => f.fx.forEach(x => { if (x.type === 'faint') deaths.push(Object.assign({ i }, x)); }));
  if (!deaths.length) return plan;
  const last = deaths[deaths.length - 1];
  const rng = mulberry32((opts.seed || 1) ^ 0x5eed);
  const W = opts.result === 'win' ? 'A' : opts.result === 'lose' ? 'B' : null;
  const Lside = W ? (W === 'A' ? 'B' : 'A') : null;

  if (opts.sudden) {
    deaths.forEach(d => { if (d !== last) add(d.i, 'synth'); });
    add(last.i, { path: SPECIAL.suddenLast, stopMusic: true });
    return plan;
  }
  // every death: a random death sound (they stack)
  deaths.forEach(d => add(d.i, MANIFEST.death.length ? { path: MANIFEST.death[Math.floor(rng() * MANIFEST.death.length)] } : 'synth'));
  // comeback: the eventual winner was down by 2+ cards; starts on the first loser death after that
  if (W) {
    const k = frames.findIndex(f => f[W].length >= 1 && f[Lside].length - f[W].length >= 2);
    if (k >= 0) { const d = deaths.find(d => d.i > k && d.side === Lside); if (d) add(d.i, { path: SPECIAL.comeback }); }
  }
  // last death: landslide (winner still has 3+ alive) and a 15% rare sound
  if (W && last.side === Lside && frames[last.i][W].length >= 3) add(last.i, { path: SPECIAL.landslide });
  if (rng() < 0.15) add(last.i, { path: SPECIAL.rare });
  // no problem's 2nd kill: plays alone and only once
  const kills = {};
  for (const d of deaths) {
    if (d.killerId !== 'noproblem') continue;
    kills[d.killerUid] = (kills[d.killerUid] || 0) + 1;
    if (kills[d.killerUid] === 2) { plan[d.i] = [{ path: SPECIAL.noproblem, exclusive: true }]; break; }
  }
  return plan;
}

function playDeathSounds(list) {
  for (const x of list) {
    if (x === 'synth') { Audio2.play('faint'); continue; }
    if (x.stopMusic) Audio2.stopMusic();
    if (x.exclusive) { Audio2.stopSfx(); Audio2.playFile(x.path, { exclusive: true, force: true }); }
    else Audio2.playFile(x.path);
  }
}

async function playBattle(frames, opts = {}) {
  let prev = null;
  const plan = planDeathSounds(frames, opts);
  const replaceSynth = MANIFEST.death.length > 0 || !!opts.sudden;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (skipping) { prev = f; continue; }
    try { await playFrame(f, prev, i, plan[i], replaceSynth); } catch (e) { console.error('battle frame', i, e); }
    prev = f;
  }
  if (prev) { try { renderBattleTeams(prev); } catch (e) { console.error(e); } }
  await sleep(500);
}

// after the battle: wait for every death sound, then the win or lose theme
async function playResultTheme(result, sudden) {
  Audio2.stopMusic();
  if (sudden) return; // sudden death: only the last-death sound, no theme
  await Audio2.sfxDone();
  const list = result === 'win' ? MANIFEST.win : result === 'lose' ? MANIFEST.lose : [];
  if (list.length) Audio2.playSong(pick(list), false);
  else Audio2.play(result === 'win' ? 'win' : result === 'lose' ? 'lose' : 'click');
}

async function playFrame(f, prev, i, deathSounds, replaceSynthFaint) {
  {
    // faint animation on the previous render
    const dying = f.fx.filter(x => x.type === 'faint').map(x => x.uid);
    if (dying.length && prev) {
      dying.forEach(uid => { const el = document.querySelector(`#battle .card[data-uid="${uid}"]`); if (el) el.classList.add('dying'); });
      f.fx.filter(x => x.type === 'absorb').forEach(x => { const el = document.querySelector(`#battle .card[data-uid="${x.uid}"]`); if (el) el.classList.add('dying'); });
      await sleep(280);
    }
    const attackers = f.fx.filter(x => x.type === 'attack').map(x => x.uid);
    if (attackers.length && prev) {
      attackers.forEach(uid => {
        const el = document.querySelector(`#battle .card[data-uid="${uid}"]`);
        if (el) el.classList.add(el.dataset.side === 'A' ? 'lunge-r' : 'lunge-l');
      });
      await sleep(170);
    }
    renderBattleTeams(f);
    for (const x of f.fx) {
      const el = document.querySelector(`#battle .card[data-uid="${x.uid}"]`);
      if (!el) continue;
      if (x.type === 'hit') { el.classList.add('shake'); floatText(x.uid, '-' + x.amt, 'dmg'); }
      else if (x.type === 'buff') { el.classList.add('buffed'); if (x.amt) floatText(x.uid, `+${x.amt[0]}/+${x.amt[1]}`, 'buf'); }
      else if (x.type === 'heal') { el.classList.add('buffed'); floatText(x.uid, '+' + x.amt + ' hp', 'buf'); }
      else if (x.type === 'debuff') el.classList.add('shake');
      else if (x.type === 'summon') el.classList.add('summoned');
      else if (x.type === 'ability') el.classList.add('ability');
    }
    (f.sfx || []).filter(x => !(replaceSynthFaint && x === 'faint')).forEach((s, k) => setTimeout(() => Audio2.play(s), k * 60));
    if (deathSounds) playDeathSounds(deathSounds);
    f.fx.filter(x => x.type === 'ban').forEach(x => { const el = document.querySelector(`#battle .card[data-uid="${x.uid}"]`); if (el) el.classList.add('banned'); });
    if ((f.sfx || []).includes('nuke')) { const fl = document.createElement('div'); fl.className = 'flash'; $('#app').appendChild(fl); setTimeout(() => fl.remove(), 600); }
    if (f.cap) showCaption(f.cap);
    await sleep(i === 0 ? 1100 : 720);
  }
}

function showCaption(t) {
  const c = $('#caption'); c.textContent = t;
  c.style.opacity = 1;
}

function finishBattle(result) {
  battleBusy = false;
  const caps = CAPTIONS[result];
  let title = result, sub = '';
  if (result === 'win') { S.wins++; sub = `${S.wins}/${WIN_TARGET} trophies`; }
  else if (result === 'lose') { S.lives--; sub = `${S.lives} lives left`; }
  else { sub = 'nobody wins. untied ends.'; }
  playResultTheme(result);
  S.history.push(result);
  setColour();
  $('#result-title').textContent = result === 'win' ? 'win' : result === 'lose' ? 'lose' : 'draw';
  $('#result-cap').textContent = pick(caps);
  $('#result-sub').textContent = sub;
  $('#result').classList.remove('hidden');
  $('#caption').textContent = '';

  const over = S.wins >= WIN_TARGET ? 'victory' : S.lives <= 0 ? 'defeat' : null;
  $('#btn-result').textContent = over ? 'continue' : 'next turn';
  $('#btn-result').onclick = () => {
    $('#result').classList.add('hidden');
    if (over) return endRun(over);
    startTurn();
  };
  saveRun();
}

function endRun(kind) {
  store.del('np_run');
  const best = store.get('np_best', 0);
  if (S.wins > best) store.set('np_best', S.wins);
  const win = kind === 'victory';
  if (win) document.documentElement.style.setProperty('--gray', '0');
  openModal(`
    <div style="text-align:center">
      <h2 style="font-size:72px">${win ? 'end of the line' : 'and you cry'}</h2>
      <p class="cap-style" style="font-size:26px">${win ? 'no problem vi, the end. giuseppe captured in the famous basement.' : 'its over when giuseppe says its over'}</p>
      <p>${S.wins} wins · turn ${S.turn} · nike inc status: ${Math.min(104, S.nikeKills)} dead ${S.nikeKills >= 104 ? 1 : 104 - S.nikeKills} to go</p>
      <p>best run: ${Math.max(best, S.wins)} wins</p>
      <button class="big" id="btn-again">new run</button>
    </div>`);
  Audio2.play(win ? 'win' : 'lose');
  $('#btn-again').onclick = () => { closeModal(); newRun(); };
  S = null;
}

// ---------------- modals ----------------
function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modal-close').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); if (!S) toTitle(); }

function howToPlay() {
  openModal(`<h2>how to play</h2>
  <ul>
    <li>each turn you get <b>10 gold</b>. characters and items cost <b>3</b>, rolling the shop costs <b>1</b>.</li>
    <li>click a shop card, then a team slot (or drag it). the slot on the <b>right</b> is the <b>front</b>, they attack first.</li>
    <li>drop a character on a copy of itself to <b>merge</b>: +1/+1 and experience. 3 copies = <b>level 2</b>, 6 = <b>level 3</b>. leveling up adds a higher tier character to the shop.</li>
    <li>items: food-style ones give stats, <b>equip</b> items stay on the character (one each).</li>
    <li><b>freeze</b> a shop card to keep it for the next turn. <b>sell</b> gives gold equal to the level.</li>
    <li>press <b>end turn</b>: the battle plays by itself. fronts hit each other at the same time until one team is empty.</li>
    <li>win <b>10</b> battles to end the line. lose <b>5</b> and you cry.</li>
    <li>the game starts in black and white and gets more colour the closer you get to the end. just like the series.</li>
    <li>new tiers unlock every 2 turns. <b>nike</b> characters take double damage from john tanner.</li>
  </ul>`);
}

function codex() {
  let html = `<h2>all characters</h2><div class="codex">`;
  for (let t = 1; t <= 6; t++) {
    html += `<div class="codex-tier">tier ${t}</div>`;
    Object.entries(UNITS).filter(([k, d]) => d.tier === t && !d.token).forEach(([k, d]) => {
      const src = imgSrc(k);
      html += `<div class="entry">${src ? `<img src="${src}"${d.bw ? ' style="filter:grayscale(1) contrast(1.3)"' : ''}>` : `<div class="noimg">?</div>`}<div><h4>${d.name}</h4><div class="s">${d.atk}/${d.hp}${(d.tags || []).includes('nike') ? ' · nike inc.' : ''}</div><div class="d">${d.text(1)}</div></div></div>`;
    });
  }
  html += `<div class="codex-tier">items</div>`;
  Object.values(ITEMS).forEach(it => { html += `<div class="entry"><div class="noimg" style="font-size:38px;color:#fff;overflow:hidden">${itemArt(Object.keys(ITEMS).find(k => ITEMS[k] === it))}</div><div><h4>${it.name}</h4><div class="s">tier ${it.tier}${it.equip ? ' · equip' : ''}</div><div class="d">${it.text}</div></div></div>`; });
  openModal(html + `</div>`);
}

function menu() {
  if (S && S.net) {
    openModal(`<h2>menu</h2><p>online room <b>${NET.code}</b></p>${NET.standingsHTML(NET.lobbyPlayers || [])}<div class="menu" style="align-items:flex-start">
      <button id="m-resume" class="big">resume</button><button id="m-codex">all characters</button>
      <button id="m-leave" style="background:#6d1b1b">leave online game</button></div>`);
    $('#m-resume').onclick = () => $('#modal').classList.add('hidden');
    $('#m-codex').onclick = codex;
    $('#m-leave').onclick = () => NET.leave();
    return;
  }
  openModal(`<h2>menu</h2><div class="menu" style="align-items:flex-start">
    <button id="m-resume" class="big">resume</button>
    <button id="m-how">how to play</button>
    <button id="m-codex">all characters</button>
    <button id="m-title">save and quit to title</button>
    <button id="m-abandon" class="danger" style="background:#6d1b1b">abandon run</button></div>`);
  $('#m-resume').onclick = () => $('#modal').classList.add('hidden');
  $('#m-how').onclick = howToPlay; $('#m-codex').onclick = codex;
  $('#m-title').onclick = () => { saveRun(); $('#modal').classList.add('hidden'); toTitle(); };
  $('#m-abandon').onclick = () => { store.del('np_run'); S = null; $('#modal').classList.add('hidden'); toTitle(); };
}

// ---------------- title ----------------
function toTitle() {
  showScreen('title');
  document.documentElement.style.setProperty('--gray', '1');
  $('#btn-continue').classList.toggle('hidden', !store.get('np_run', null));
  const titleSong = MANIFEST.songs.find(x => /problem arises/i.test(x)) || MANIFEST.songs[0];
  Audio2.playSong(titleSong);
  const col = $('#collage'); col.innerHTML = '';
  const ids = ['giuseppe', 'noproblem', 'john', 'bondo2', 'darius', 'funny', 'crosos', 'man', 'g0', 'renault'];
  ids.forEach((id, i) => {
    const im = document.createElement('img'); im.src = imgSrc(id);
    im.style.left = (i * 10 - 3) + '%'; im.style.top = (i % 2 ? 48 : 4) + '%';
    im.style.setProperty('--r', ((i % 3) - 1) * 4 + 'deg'); im.style.animationDelay = (-i * 1.3) + 's';
    col.appendChild(im);
  });
}

// ---------------- wiring ----------------
window.addEventListener('DOMContentLoaded', () => {
  Audio2.init();
  $('#btn-new').onclick = () => { Audio2.play('start'); newRun(); };
  $('#btn-continue').onclick = () => {
    S = store.get('np_run', null); if (!S) return;
    UID = 1 + Math.max(0, ...S.team.filter(Boolean).map(u => u.uid), ...S.shop.units.map(e => e.u.uid));
    showScreen('shop'); renderShop(); phaseSong('shop');
  };
  $('#btn-how').onclick = howToPlay;
  $('#btn-online').onclick = onlineMenu;
  $('#btn-units').onclick = codex;
  $('#modal-close').onclick = closeModal;
  $('#btn-roll').onclick = roll;
  $('#btn-freeze').onclick = toggleFreeze;
  $('#btn-sell').onclick = () => sel && sel.kind === 'team' && sellTeam(sel.idx);
  const sellBtn = $('#btn-sell');
  sellBtn.addEventListener('dragover', e => { if (sel && sel.kind === 'team') { e.preventDefault(); sellBtn.classList.add('sell-zone', 'over'); } });
  sellBtn.addEventListener('dragleave', () => sellBtn.classList.remove('over'));
  sellBtn.addEventListener('drop', e => { e.preventDefault(); sellBtn.classList.remove('over'); if (sel && sel.kind === 'team') sellTeam(sel.idx); });
  $('#btn-end').onclick = endTurn;
  $('#btn-mute').onclick = () => { Audio2.toggleMute(); renderShop(); };
  $('#btn-menu').onclick = menu;
  document.querySelectorAll('.sp[data-speed]').forEach(b => b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('.sp[data-speed]').forEach(x => x.classList.toggle('active', x === b));
  });
  $('#btn-skip').onclick = () => { skipping = true; };
  document.addEventListener('keydown', e => {
    if (!$('#shop').classList.contains('active') || !S) return;
    if (e.key === 'r') roll();
    else if (e.key === 'f') toggleFreeze();
    else if (e.key === 's' && sel && sel.kind === 'team') sellTeam(sel.idx);
    else if (e.key === 'Enter') endTurn();
    else if (e.key === 'Escape') { sel = null; renderShop(); }
  });
  // click on empty board clears selection
  $('.board').addEventListener('click', e => { if (e.target.classList.contains('board') && sel) { sel = null; renderShop(); } });
  toTitle();
});
