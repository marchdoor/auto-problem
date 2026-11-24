// ============================================================
//  Game flow: title, shop phase, battle playback, results.
// ============================================================
const $ = s => document.querySelector(s);

// phones: the visible height changes as the browser bars slide in and out.
// Track it so the bottom buttons (end turn, descriptions) are never hidden.
function fitAppHeight() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
}
fitAppHeight();
window.addEventListener('resize', fitAppHeight);
window.addEventListener('orientationchange', () => setTimeout(fitAppHeight, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitAppHeight);
let UNIT_COST = 3, ITEM_COST = 3, ROLL_COST = 1, START_GOLD = 10, START_LIVES = 5, WIN_TARGET = 10;
// room rules (online): the host can change these in the lobby. solo runs always use the defaults.
const RULE_DEFS = {
  lives: { name: 'hearts', def: 5, opts: [1, 2, 3, 4, 5, 6, 8, 10, 15] },
  gold: { name: 'gold per turn', def: 10, opts: [6, 8, 10, 12, 15, 20, 30] },
  wins: { name: 'trophies to win', def: 10, opts: [3, 5, 7, 10, 12, 15, 20] },
  secs: { name: 'seconds per turn', def: 90, opts: [30, 45, 60, 90, 120, 180] },
  unit: { name: 'character cost', def: 3, opts: [1, 2, 3, 4, 5] },
  roll: { name: 'roll cost', def: 1, opts: [0, 1, 2, 3] },
};
// special mode (online): best of 3, veteran cards, the team is wiped every round and you get loads of gold.
// 2 hearts and 2 trophies make it a best of 3: after 1-1 both players are on their last heart, so game 3 is sudden death.
const SPMODE = { gold: 40, bonus: 4, exp: 2, minTier: 3, units: 5, items: 3 };
let SPECIAL_ON = false;
function cleanRules(r) {
  const o = {}; r = r || {};
  o.special = r.special ? 1 : 0;
  for (const k in RULE_DEFS) { const v = +r[k]; o[k] = RULE_DEFS[k].opts.includes(v) ? v : RULE_DEFS[k].def; }
  return o;
}
function setRules(r) {
  r = cleanRules(r);
  SPECIAL_ON = !!r.special;
  START_LIVES = r.lives; START_GOLD = r.gold; WIN_TARGET = r.wins; UNIT_COST = r.unit; ROLL_COST = r.roll;
  if (SPECIAL_ON) { START_GOLD = SPMODE.gold; START_LIVES = 2; WIN_TARGET = 2; }
  if (typeof NET_LIVES !== 'undefined') { NET_LIVES = START_LIVES; TURN_SECONDS = r.secs; }
  return r;
}

let S = null;          // run state
let sel = null;        // {kind:'shop'|'item'|'team', idx}
let speed = 1, skipping = false, battleBusy = false, lastGhost = false;

const imgSrc = (id, alt) => { const d = UNITS[id]; const i = (alt && d.alt) ? d.alt : d.img; return i ? `assets/units/${i.includes('.') ? i : i + '.png'}` : null; };
const itemArt = (id, cls = '') => { const it = ITEMS[id]; return it.img ? `<img class="iimg ${cls} ${it.fit === 'contain' ? 'contain' : it.fit === 'logo' ? 'logo' : it.fit === 'whole' ? 'whole' : ''}" src="assets/items/${it.img}" alt="">` : it.icon; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const itemCost = it => it.cost || ITEM_COST;
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
    buff(u, a, h) { if (!u) return; const a0 = u.atk, h0 = u.hp; u.atk = capAdd(u.atk, a); u.hp = capAdd(u.hp, h); logBuff(u, u.atk - a0, u.hp - h0); flashCard(u.uid); },
    gold(n) { S.gold = Math.max(0, S.gold + n); },
    randomFriends(u, n) { const a = live().filter(f => f !== u); const r = []; while (r.length < n && a.length) r.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return r; },
    allFriends: () => live(),
    ahead(u) { const i = team.indexOf(u); for (let j = i - 1; j >= 0; j--) if (team[j]) return team[j]; return null; },
    behind(u) { const i = team.indexOf(u); for (let j = i + 1; j < 5; j++) if (team[j]) return team[j]; return null; },
    addExp(u, n) { const before = lvl(u); u.exp = Math.min(expCap(), u.exp + n); if (lvl(u) > before) onLevelUp(u); },
    caption(t) { toast(t); },
  };
  return s;
}
function shopTrigger(u, ev, ...a) { const h = UNITS[u.id].on[ev]; if (h) { buffSrc = UNITS[u.id].name; try { h(shopCtx(), u, lvl(u), ...a); } finally { buffSrc = null; } } }

// ---------------- run lifecycle ----------------
// one song per shop phase and per battle phase; no repeats within a run / online game
// A win/lose theme waits for the death sounds to finish. If the next phase's music
// has started in the meantime (you pressed continue early), the waiting theme is
// cancelled so it can't overwrite the new song (e.g. the sudden death song).
let themeToken = 0;
function cancelTheme() { themeToken++; }

function phaseSong(kind) {
  cancelTheme();
  if (S && S.net) { if (NET.songs && NET.songs[kind]) Audio2.playSong(NET.songs[kind]); return; }
  if (!S) return;
  if (!S.playlist || !S.playlist.list || !S.playlist.list.length) S.playlist = newPlaylist();
  Audio2.playSong(nextSong(S.playlist));
}

function newRun(endless = false) {
  setRules();
  setEndless(endless);
  S = { runId: Date.now() + '-' + Math.floor(Math.random() * 1e6), turn: 1, gold: START_GOLD, lives: START_LIVES, wins: 0,
        team: [null, null, null, null, null], shop: { units: [], items: [] }, nikeKills: 0, history: [], endless: !!endless, packs: packPrefs(), curses: [] };
  setPacks(S.packs);
  rollShop(true);
  S.playlist = newPlaylist();
  saveRun();
  showScreen('shop'); renderShop();
  phaseSong('shop');
}

function startTurn() {
  S.turn++; S.gold = START_GOLD;
  if (SPECIAL_ON && S.net) S.team = [null, null, null, null, null];   // special mode: fresh deck every round
  S.team.forEach(u => { if (u) u.next = null; });   // food side effects only last one battle
  rollShop(true);
  S.team.filter(Boolean).forEach(u => shopTrigger(u, 'startTurn'));
  S.rebuild = false; S.bossChosen = false;
  saveRun();
  showScreen('shop'); renderShop();
  phaseSong('shop');
  if (S.boss) bossChoice();
}

// ---------------- the final wave (endless mode, after 104 kills) ----------------
function bossChoice() {
  ACH.unlock('finalboss');
  const boss = buildBossTeam();
  openModal(`<div class="boss-box">
    <h2 class="sd-title">final wave</h2>
    <p class="cap-style" style="font-size:22px">104 dead. 1 to go.</p>
    <p>giuseppe creatore and the nike inc. militia are coming. this is what you'll face:</p>
    <div class="sd-team" id="boss-team"></div>
    <div class="sd-choices">
      <button class="big" id="boss-keep">keep my team<small>${S.keepBonusGiven ? '' : `every unit gets +${KEEP_BONUS.stat}/+${KEEP_BONUS.stat} and +${KEEP_BONUS.levels} levels · `}normal shop · ${START_GOLD} gold</small></button>
      <button class="big danger" id="boss-new">rebuild<small>sell the team · ${REBUILD.gold} gold · veterans market (tier ${REBUILD.minTier}-6, level ${levelOf(REBUILD.exp)}, +${REBUILD.bonus}/+${REBUILD.bonus})</small></button>
    </div></div>`);
  $('#modal-close').classList.add('hidden');
  const row = $('#boss-team'); boss.forEach(u => { u.lvl = levelOf(u.exp); row.appendChild(cardEl(u)); });
  $('#boss-keep').onclick = () => {
    S.bossChosen = true; Audio2.play('click'); ACH.unlock('keeporrebuild');
    if (!S.keepBonusGiven) {
      // the final wave bonus for staying with your deck (once per run)
      S.keepBonusGiven = true;
      S.team.filter(Boolean).forEach(u => {
        const L = lvl(u);
        u.atk = Math.min(MAX_STAT, u.atk + KEEP_BONUS.stat); u.hp = Math.min(MAX_STAT, u.hp + KEEP_BONUS.stat);
        u.exp += expForLevel(L + KEEP_BONUS.levels) - expForLevel(L);
        logBuff(u, KEEP_BONUS.stat, KEEP_BONUS.stat, 'final wave');
      });
      toast(`final wave bonus: +${KEEP_BONUS.stat}/+${KEEP_BONUS.stat} and +${KEEP_BONUS.levels} levels`);
    }
    closeModal(); saveRun(); renderShop();
  };
  $('#boss-new').onclick = () => {
    S.bossChosen = true; S.rebuild = true; ACH.unlock('keeporrebuild');
    S.team = [null, null, null, null, null]; S.gold = REBUILD.gold; S.shop.units = []; S.shop.items = [];
    rollShop(true); sel = null; Audio2.play('start'); closeModal(); saveRun(); renderShop();
    toast('the veterans market is open');
  };
}

function shopSizes() {
  const t = S.turn;
  if (S.rebuild) return { units: REBUILD.shop, items: 2 };
  if (SPECIAL_ON && S.net) return { units: SPMODE.units, items: SPMODE.items };
  return { units: t <= 4 ? 3 : t <= 8 ? 4 : 5, items: t <= 2 ? 1 : 2 };
}
// a shop character: normal, or a veteran in the final wave's rebuild shop
function shopUnit(tier) {
  if (S.rebuild) {
    const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && !UNITS[k].secret && UNITS[k].tier >= REBUILD.minTier && packOk(UNITS[k]));
    return mkVeteran(pick(pool));
  }
  if (SPECIAL_ON && S.net) {   // veteran card: pre-levelled and a bit stronger
    const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && !UNITS[k].secret && UNITS[k].tier >= SPMODE.minTier && packOk(UNITS[k]));
    const id = pick(pool);
    return newUnit(id, { atk: UNITS[id].atk + SPMODE.bonus, hp: UNITS[id].hp + SPMODE.bonus, exp: SPMODE.exp });
  }
  return newUnit(randomUnitId(tier));
}
function randomUnitId(maxTier) {
  const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && !UNITS[k].secret && UNITS[k].tier <= maxTier && packOk(UNITS[k]));
  return pick(pool);
}
function randomItemId(maxTier) {
  return pick(Object.keys(ITEMS).filter(k => ITEMS[k].tier <= maxTier && packOk(ITEMS[k])));
}
// a shop item. food gets a random freshness (1-100%)
function newItemEntry(tier) {
  const id = randomItemId(tier), e = { id, frozen: false };
  if (ITEMS[id].food) e.pct = 1 + Math.floor(Math.random() * 100);
  return e;
}
function rollShop(free) {
  const tier = tierFor(S.turn), n = shopSizes();
  const keptU = S.shop.units.filter(s => s.frozen), keptI = S.shop.items.filter(s => s.frozen);
  const units = keptU.slice(0, Math.max(n.units, keptU.length));
  while (units.length < n.units) units.push({ u: shopUnit(tier), frozen: false });
  const items = keptI.slice();
  while (items.length < n.items) items.push(newItemEntry(tier));
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
  target.atk = capAdd(Math.max(target.atk, src.atk), 1);
  target.hp = capAdd(Math.max(target.hp, src.hp), 1);
  logBuff(target, target.atk - a0, target.hp - h0, 'merge');
  target.exp = Math.min(expCap(), target.exp + src.exp + 1);
  if (!target.item && src.item) target.item = src.item;
  Audio2.play('merge');
  if (lvl(target) > before) onLevelUp(target);
}

function onLevelUp(u) {
  Audio2.play('levelup');
  ACH.level(lvl(u));
  toast(`${UNITS[u.id].name} goes ssj (level ${lvl(u)})`);
  shopTrigger(u, 'levelUp');
  const t = Math.min(6, tierFor(S.turn) + 1);
  const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && !UNITS[k].secret && UNITS[k].tier === t && packOk(UNITS[k]));
  if (S.shop.units.length < 8) S.shop.units.push({ u: S.rebuild ? shopUnit(6) : newUnit(pick(pool)), frozen: false });
}

function canMerge(a, b) { return a && b && a.id === b.id && a.uid !== b.uid && lvl(a) < maxLevel(); }

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

// agartha 67 overdose: kill one of your characters. Its faint effects play out (buffs stay for good,
// clones fill up to 5), exactly like a battle death but with no enemies.
function shopKill(target) {
  const team = S.team.filter(Boolean);
  const byUid = new Map(team.map(x => [x.uid, x]));
  const res = simulateBattle(team, [], Math.floor(Math.random() * 1e9), { shopKill: target.uid, fieldCap: 5 });
  const out = [];
  res.shop.forEach(r => {
    const o = r.srcUid != null ? byUid.get(r.srcUid) : null;
    if (o) {
      const a0 = o.atk, h0 = o.hp;
      o.atk = Math.min(MAX_STAT, r.atk); o.hp = Math.min(MAX_STAT, r.hp);
      logBuff(o, o.atk - a0, o.hp - h0, 'agartha 67 overdose');
      out.push(o);
    } else out.push(newUnit(r.id, { atk: r.atk, hp: r.hp, exp: r.exp, item: r.item }));   // a clone, twin or revived unit
  });
  S.team = [null, null, null, null, null];
  out.slice(0, 5).forEach((x, i) => { S.team[i] = x; });
  Audio2.play('faint');
  (res.caps.length ? res.caps : [`${UNITS[target.id].name} is died`]).slice(0, 3).forEach(t => toast(t));
}

function useItem(itemIdx, slot) {
  const entry = S.shop.items[itemIdx]; const u = S.team[slot];
  if (!entry || !u) return;
  const it = ITEMS[entry.id];
  if (S.gold < itemCost(it)) return toast('not enough gold and you cry');
  S.gold -= itemCost(it); S.shop.items.splice(itemIdx, 1);
  ACH.item(entry.id);
  if (it.kill) { shopKill(u); sel = null; saveRun(); renderShop(); return; }
  if (it.equip) { u.item = entry.id; toast(`${UNITS[u.id].name} equips ${it.name}`); }
  else {
    const times = u.item === 'chef' ? 2 : 1;   // chef skill: food and buffs work twice
    for (let k = 0; k < times; k++) {
      if (it.food) applyFood(shopCtx(), u, entry.id, entry.pct == null ? 100 : entry.pct).forEach(t => toast(t));
      else { buffSrc = it.name; try { it.use(shopCtx(), u); } finally { buffSrc = null; } }
    }
    if (times > 1) toast('chef skill: it works twice');
  }
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
  if (typeof DEV !== 'undefined') setTimeout(() => DEV.refresh(), 0);
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}
function setColour() {
  document.body.classList.toggle('endless', !!(S && S.endless));
  const w = S ? S.wins : 0;
  document.documentElement.style.setProperty('--gray', Math.max(0, 1 - w / WIN_TARGET).toFixed(2));
}

function cardEl(u, opts = {}) {
  const d = UNITS[u.id];
  const el = document.createElement('div');
  el.className = 'card' + (opts.sel ? ' sel' : '') + (opts.frozen ? ' frozen' : '');
  el.dataset.uid = u.uid;
  const L = u.lvl || levelOf(u.exp || 0), exp = u.exp || 0;
  const src = imgSrc(u.id, u.alt);
  const pr = expProgress(exp);
  const pips = pr.need ? Array.from({ length: pr.need }, (_, k) => `<i class="${k < pr.have ? 'on' : ''}"></i>`).join('') : '';
  el.innerHTML = `
    <div class="pic">${src ? `<img src="${src}" alt=""${d.bw ? ' class="bw"' : ''}>` : `<div class="noimg">?</div>`}
      ${opts.shop ? `<span class="tier">t${d.tier}</span><span class="cost">${UNIT_COST}🪙</span>` : ''}
      <div class="nm">${u.name || d.name}</div>
    </div>
    ${u.item ? `<div class="itm" title="${ITEMS[u.item].name}">${itemArt(u.item)}</div>` : ''}
    ${u.debuffNote ? `<div class="dbf" title="${u.debuffNote}">−</div>` : ''}
    ${u.bleed ? '<div class="bleedtag" title="bleeding"><img src="assets/items/bleed.png" alt=""></div>' : ''}${u.psn ? '<div class="psntag" title="poisoned">🧪</div>' : ''}${u.next && u.next.length ? `<div class="nexttag" title="${u.next.map(t => NEXT_TXT[t]).join('; ')}">🤢</div>` : ''}
    ${u.bomb ? `<div class="bombtag" title="rebook nuke">💣${u.bomb}</div>` : ''}
    <div class="stats"><div class="badge atk">${u.atk}</div><div class="badge hp">${u.hp}</div></div>
    <div class="lvl">lvl ${L} ${pips}</div>`;
  return el;
}

function itemEl(entry, isSel) {
  const it = ITEMS[entry.id];
  const el = document.createElement('div');
  el.className = 'item-card' + (isSel ? ' sel' : '') + (entry.frozen ? ' frozen' : '');
  el.innerHTML = `<div class="ipic">${itemArt(entry.id)}</div><div class="inm">${it.name}${entry.pct != null ? ` ${entry.pct}%` : ''}</div>`;
  return el;
}

function infoFor(u, isItem, pct) {
  const box = $('#info');
  if (!u) { box.innerHTML = `<div class="info-empty">tap a character to see what they do. tap a shop card, then a team slot to buy (on PC you can also drag).</div>`; return; }
  if (isItem) {
    const it = ITEMS[u];
    box.innerHTML = `<div class="info-icon">${itemArt(u)}</div><div><h3>${it.name}</h3><div class="t">item · tier ${it.tier} · ${itemCost(it)}🪙</div><div class="ab">${it.food ? foodText(u, pct == null ? 100 : pct) : it.text}</div></div>`;
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
  const nk = S.boss ? 'nike inc status: 104 dead. the final wave' : k >= 104 ? 'nike inc status: total 104 dead 1 to go' : `nike inc status: ${k} dead ${104 - k} to go`;
  $('#hud-nike').textContent = (S.endless ? '∞ endless · ' : '') + nk;
  $('#tier-label').textContent = `tier 1-${tierFor(S.turn)}`;
  syncVolume();

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
    el.addEventListener('mouseenter', () => { if (!sel) infoFor(e.id, true, e.pct); });
    si.appendChild(el);
  });

  // info + buttons
  if (sel) {
    if (sel.kind === 'shop') infoFor(S.shop.units[sel.idx] && S.shop.units[sel.idx].u);
    else if (sel.kind === 'item') infoFor(S.shop.items[sel.idx] && S.shop.items[sel.idx].id, true, S.shop.items[sel.idx] && S.shop.items[sel.idx].pct);
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
  // ignore ghosts saved by an older version that contain characters which no longer exist
  const ghosts = store.get('np_ghosts', []).filter(g => g.turn === S.turn && g.run !== S.runId && g.team.every(u => UNITS[u.id]));
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

  const isBoss = !!S.boss;
  const opp = (typeof DEV !== 'undefined' && DEV.opponent()) || (isBoss ? { name: 'nike inc. · the final wave', team: buildBossTeam() } : pickOpponent());
  lastGhost = /^ghost/.test(opp.name);
  const seed = Math.floor(Math.random() * 1e9);
  const res = simulateBattle(S.team, opp.team, seed, { curses: S.curses || [] });
  S.curses = [];
  const sdSim = typeof DEV !== 'undefined' && DEV.sdSim; if (sdSim) DEV.sdSim = false;   // dev: simulated sudden death
  setBattleBg(seed);
  showScreen('battle');
  if (!sdSim) phaseSong('battle');
  $('#enemy-name').textContent = opp.name;
  $('#b-lives').textContent = S.lives; $('#b-wins').textContent = S.wins; $('#b-turn').textContent = S.turn;
  skipping = false;
  if (sdSim) {
    // like the online flow: the video opens when the shop ends, a pause for the ban phase, then the timed battle
    CUT.openSudden(); showCaption('sudden death (simulated). the ban phase is skipped'); $('#hud-sd').classList.add('hidden');
    await new Promise(r => setTimeout(r, 4000));
  }
  await playBattle(res.frames, { result: res.result, seed, sudden: sdSim });
  applyFusions(res.fusions, 'A');
  applyTentLoss(res.tentLost, 'A');

  S.nikeKills += res.stats.cloneKills;
  finishBattle(res.result, isBoss, sdSim);
}

// one background per battle. The same seed gives the same picture, so both
// online players see the same place.
function setBattleBg(seed) {
  const el = $('#battle-bg'); if (!el) return;
  const list = (typeof MANIFEST !== 'undefined' && MANIFEST.bg) || [];
  if (!list.length) { el.style.backgroundImage = 'none'; return; }
  const path = list[Math.abs(Math.floor(seed)) % list.length];
  el.style.backgroundImage = `linear-gradient(rgba(0,0,0,.62), rgba(0,0,0,.42) 45%, rgba(0,0,0,.74)), url("${encodePath(path)}")`;
}

// john tanner + tanner john fused during the battle: the fusion stays
function applyFusions(list, side) {
  (list || []).filter(f => f.side === side).forEach(f => {
    const iJ = S.team.findIndex(u => u && u.uid === f.uids[0]), iT = S.team.findIndex(u => u && u.uid === f.uids[1]);
    if (iJ < 0 || iT < 0) return;
    const at = Math.min(iJ, iT);
    S.team[iJ] = null; S.team[iT] = null;
    S.team[at] = newUnit('jahntonner', { atk: f.atk, hp: f.hp, exp: f.exp, item: f.item });
    try { localStorage.setItem('np_secret_jahn', '1'); } catch (e) {}
    ACH.unlock('jahntonner');
    toast('tanner john and john tanner fused into jahn tonner');
  });
}

// make tent bro: the holder never came back because the rest of its team died first
function applyTentLoss(list, side) {
  (list || []).filter(x => x.side === side).forEach(x => {
    const i = S.team.findIndex(u => u && u.uid === x.uid);
    if (i >= 0) { toast(`${UNITS[S.team[i].id].name} never came back from the tent`); S.team[i] = null; }
  });
}

function renderBattleTeams(f) {
  // clones can push a side past 5 units: size the cards for however many there are
  // (units that just died are still drawn for a moment, so count only the living for the size)
  const alive = t => t.filter(u => !u.dead).length;
  $('#battle').style.setProperty('--n', Math.min(MAX_FIELD, Math.max(5, alive(f.A), alive(f.B))));
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
    add(last.i, { path: SPECIAL.suddenLast, stopMusic: true, video: !!CUT.sd });
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
    if (kills[d.killerUid] === 2) { plan[d.i] = [{ path: SPECIAL.noproblem, exclusive: true, muteMusic: true }]; break; }
  }
  return plan;
}

function playDeathSounds(list) {
  for (const x of list) {
    if (x === 'synth') { Audio2.play('faint'); continue; }
    ACH.heard(x.path);
    if (x.stopMusic) Audio2.stopMusic();
    if (x.video && CUT.lastDeath()) continue;   // the last death video has its own sound
    if (x.exclusive) { Audio2.stopSfx(); const a = Audio2.playFile(x.path, { exclusive: true, force: true });
      if (x.muteMusic) {   // the music goes silent while it plays, then fades back in
        Audio2.fadeMusic(0, 150);
        if (a) { const back = () => Audio2.fadeMusic(1, 1500); a.addEventListener('ended', back, { once: true }); a.addEventListener('error', back, { once: true }); a.addEventListener('pause', back, { once: true }); }
        else Audio2.fadeMusic(1, 1500);
      } }
    else Audio2.playFile(x.path);
  }
}

async function playBattle(frames, opts = {}) {
  let prev = null;
  const plan = planDeathSounds(frames, opts);
  const replaceSynth = MANIFEST.death.length > 0 || !!opts.sudden;
  // john tanner vs the vodafone ceo: a cutscene when they meet front to front
  let cuts = [], cut = null; try { cuts = (skipping || opts.sudden) ? [] : CUT.plan(frames); } catch (e) { console.error(e); }
  // online sudden death: the battle is timed so it ends exactly when the sudden death song ends.
  // The time left in the song is read the moment the battle starts. Every frame then gets a share
  // of what is left, and it re-adjusts as it goes.
  let syncEnd = null, w = null, fixedL = null, wSum = null, fSum = null;
  const savedSpeed = speed;
  if (opts.sudden && CUT.sd && !skipping) {
    const n = frames.length;
    w = frames.map((f, i) => i === 0 ? 1100 : 720); w[n - 1] = 0;          // the last frame has no wait: the song ends with it
    fixedL = frames.map(f => (f.fx.some(x => x.type === 'faint') ? 280 : 0) + (f.fx.some(x => x.type === 'attack') ? 170 : 0));
    wSum = new Array(n + 1).fill(0); fSum = new Array(n + 1).fill(0);
    for (let j = n - 1; j >= 0; j--) { wSum[j] = wSum[j + 1] + w[j]; fSum[j] = fSum[j + 1] + fixedL[j]; }
    let rem = (Audio2.songLen() - Audio2.songPos()) * 1000;
    if (rem < fSum[0] + 0.25 * wSum[0]) rem += Audio2.songLen() * 1000;   // too little song left: end with the next loop
    syncEnd = Date.now() + rem; speed = 1;
  }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (skipping) { if (CUT.active && !CUT.sd && !CUT.lastOn) CUT.close(true); prev = f; continue; }
    let hold, closeCut = false;
    if (syncEnd) hold = wSum[i] > 0 ? Math.max(40, (syncEnd - Date.now() - fSum[i]) * w[i] / wSum[i]) : 0;
    const starting = cuts.find(c => c.k === i && !c.after);
    if (starting && !syncEnd) {
      // the video plays and the frames up to the death are stretched, so it ends right as that death happens
      cut = starting;
      const total = CUTSCENES[cut.key].dur * 1000, n = cut.d - cut.k;
      if (CUT.open(cut.key)) {
        CUT.markSeen(cut.key);
        if (n === 0) await CUT.wait(Math.max(0, total - 470));
        else cut.hold = Math.max(350, (total - 300 - 170 * n) / n);
      } else cut = null;
    }
    if (cut && CUT.active && !syncEnd) { if (i >= cut.k && i < cut.d && cut.hold) hold = cut.hold; if (i === cut.d) closeCut = true; }
    try { await playFrame(f, prev, i, plan[i], replaceSynth, hold, closeCut); } catch (e) { console.error('battle frame', i, e); }
    if (cut && i >= cut.d) cut = null;
    // a video that plays right after something happens (the bomb has just gone off)
    const late = !syncEnd && !skipping && cuts.find(c => c.after && c.k === i);
    if (late && CUT.open(late.key)) {
      CUT.markSeen(late.key);
      await CUT.wait(Math.max(0, CUTSCENES[late.key].dur * 1000 - 150));
      CUT.close(skipping);
    }
    prev = f;
  }
  if (syncEnd) speed = savedSpeed;
  if (opts.sudden && CUT.sd) { Audio2.stopMusic(); CUT.lastDeath(); }   // skipped, or the last death never fired
  else if (CUT.active && !CUT.sd && !CUT.lastOn) CUT.close(true);
  if (prev) { try { renderBattleTeams(prev); } catch (e) { console.error(e); } }
  try { ACH.frames(frames); } catch (e) { console.error(e); }
  if (!syncEnd) await sleep(500);
}

// after the battle: wait for every death sound, then the win or lose theme
async function playResultTheme(result, sudden) {
  const tok = ++themeToken;
  Audio2.stopMusic();
  if (sudden) return; // sudden death: only the last-death sound, no theme
  await Audio2.sfxDone();
  if (tok !== themeToken) return; // the next round's music already started
  const list = result === 'win' ? MANIFEST.win : result === 'lose' ? MANIFEST.lose : [];
  if (list.length) { const song = pick(list); Audio2.playSong(song, false); ACH.theme(song); }
  else Audio2.play(result === 'win' ? 'win' : result === 'lose' ? 'lose' : 'click');
}

async function playFrame(f, prev, i, deathSounds, replaceSynthFaint, hold, closeCut) {
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
      else if (x.type === 'buff') { el.classList.add('buffed'); if (x.amt) { const sg = n => (n >= 0 ? '+' : '') + n; floatText(x.uid, `${sg(x.amt[0])}/${sg(x.amt[1])}`, x.amt[0] < 0 || x.amt[1] < 0 ? 'dmg' : 'buf'); } }
      else if (x.type === 'heal') { el.classList.add('buffed'); floatText(x.uid, '+' + x.amt + ' hp', 'buf'); }
      else if (x.type === 'debuff') el.classList.add('shake');
      else if (x.type === 'bleed') { el.classList.add('shake'); floatText(x.uid, 'bleeding', 'dmg'); }
      else if (x.type === 'poison') { el.classList.add('shake'); floatText(x.uid, 'poisoned', 'dmg'); }
      else if (x.type === 'summon') el.classList.add('summoned');
      else if (x.type === 'ability') el.classList.add('ability');
    }
    (f.sfx || []).filter(x => !(replaceSynthFaint && x === 'faint')).forEach((s, k) => setTimeout(() => Audio2.play(s), k * 60));
    if (deathSounds) playDeathSounds(deathSounds);
    if (closeCut) CUT.close();
    f.fx.filter(x => x.type === 'ban').forEach(x => { const el = document.querySelector(`#battle .card[data-uid="${x.uid}"]`); if (el) el.classList.add('banned'); });
    if ((f.sfx || []).includes('nuke')) { const fl = document.createElement('div'); fl.className = 'flash'; $('#app').appendChild(fl); setTimeout(() => fl.remove(), 600); }
    if (f.cap) showCaption(f.cap);
    if (hold != null) await CUT.wait(hold); else await sleep(i === 0 ? 1100 : 720);
  }
}

function showCaption(t) {
  const c = $('#caption'); c.textContent = t;
  c.style.opacity = 1;
}

function finishBattle(result, isBoss, sudden) {
  battleBusy = false;
  const caps = CAPTIONS[result];
  let sub = '';
  if (result === 'win') { S.wins++; sub = S.endless ? `${S.wins} trophies` : `${S.wins}/${WIN_TARGET} trophies`; }
  else if (result === 'lose') { S.lives--; sub = `${S.lives} lives left`; }
  else { sub = 'nobody wins. untied ends.'; }
  ACH.afterBattle(result, { wins: S.wins, lives: S.lives, startLives: START_LIVES, endless: S.endless, boss: isBoss, rebuild: S.rebuild, ghost: lastGhost });
  // endless: 104 kills open the final wave
  let note = '';
  if (S.endless) {
    if (!S.boss && S.nikeKills >= 104) { S.boss = true; note = ' · 104 dead. 1 to go. the final wave is next'; }
    else if (!S.boss) note = ` · ${S.nikeKills} dead, ${104 - S.nikeKills} to go`;
  }
  playResultTheme(result, sudden);
  S.history.push(result);
  setColour();
  $('#result-title').textContent = result === 'win' ? 'win' : result === 'lose' ? 'lose' : 'draw';
  $('#result-cap').textContent = pick(caps);
  $('#result-sub').textContent = sub + note;
  $('#result').classList.remove('hidden');
  $('#caption').textContent = '';

  const b1 = $('#btn-result'), b2 = $('#btn-result2');
  b2.classList.add('hidden');
  let over = null;
  if (S.lives <= 0) over = 'defeat';
  else if (isBoss && result === 'win') over = 'boss';
  else if (!S.endless && S.wins >= WIN_TARGET) over = 'choice';
  const next = () => { $('#result').classList.add('hidden'); startTurn(); };
  if (over === 'choice') {
    // 10 trophies: end the run with a win, or keep going until all 104 are dead
    b1.textContent = 'end the run (win)';
    b1.onclick = () => { $('#result').classList.add('hidden'); endRun('victory'); };
    b2.textContent = `keep going: endless (${S.nikeKills}/104 dead)`;
    b2.classList.remove('hidden');
    b2.onclick = () => { S.endless = true; setEndless(true); saveRun(); next(); };
  } else if (over) {
    b1.textContent = 'continue';
    b1.onclick = () => { $('#result').classList.add('hidden'); endRun(over === 'boss' ? 'victory' : 'defeat', over === 'boss'); };
  } else {
    b1.textContent = 'next turn';
    b1.onclick = next;
  }
  saveRun();
}

function endRun(kind, boss) {
  store.del('np_run');
  const best = store.get('np_best', 0);
  if (S.wins > best) store.set('np_best', S.wins);
  const bestK = store.get('np_best_kills', 0);
  if (S.nikeKills > bestK) store.set('np_best_kills', S.nikeKills);
  const win = kind === 'victory';
  if (win) document.documentElement.style.setProperty('--gray', '0');
  const kills = `nike inc status: ${Math.min(104, S.nikeKills)} dead ${S.nikeKills >= 104 ? '1 to go' : (104 - S.nikeKills) + ' to go'}`;
  const text = boss ? 'giuseppe creatore is captured in the famous basement. 105 dead. the line is ended.'
    : win ? 'no problem vi, the end. giuseppe captured in the famous basement.' : 'its over when giuseppe says its over';
  openModal(`
    <div style="text-align:center">
      <h2 style="font-size:72px">${win ? 'end of the line' : 'and you cry'}</h2>
      <p class="cap-style" style="font-size:26px">${text}</p>
      <p>${S.wins} wins · turn ${S.turn} · ${kills}${S.endless ? ' · endless' : ''}</p>
      <p>best run: ${Math.max(best, S.wins)} wins · best kills: ${Math.max(bestK, S.nikeKills)}</p>
      <button class="big" id="btn-again">new run</button>
    </div>`);
  Audio2.play(win ? 'win' : 'lose');
  $('#btn-again').onclick = () => { closeModal(); newRun(); };
  S = null;
  setEndless(false);
}

// ---------------- modals ----------------
function openModal(html, opts = {}) {
  ACH.stop();
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
  $('#modal-close').classList.remove('hidden');
  $('#modal .modal-box').classList.toggle('compact', !!opts.compact);
  syncVolume();
}
function closeModal() { ACH.stop(); $('#modal').classList.add('hidden'); if (!S) toTitle(); }

function howToPlay() {
  openModal(`<h2>how to play</h2>
  <ul>
    <li>each turn you get <b>10 gold</b>. characters and items cost <b>3</b>, rolling the shop costs <b>1</b>.</li>
    <li>click a shop card, then a team slot (or drag it). the slot on the <b>right</b> is the <b>front</b>, they attack first.</li>
    <li>drop a character on a copy of itself to <b>merge</b>: +1/+1 and experience. 3 copies = <b>level 2</b>, 6 = <b>level 3</b>. the squares under a card show how far along it is. leveling up adds a higher tier character to the shop.</li>
    <li>items: food-style ones give stats, <b>equip</b> items stay on the character (one each).</li>
    <li><b>freeze</b> a shop card to keep it for the next turn. <b>sell</b> gives gold equal to the level.</li>
    <li>press <b>end turn</b>: the battle plays by itself. fronts hit each other at the same time until one team is empty.</li>
    <li>win <b>10</b> battles to end the line. lose <b>5</b> and you cry. after 10 trophies you can end the run, or keep going in <b>endless</b>.</li>
    <li><b>endless</b>: levels never stop growing (3 merges per level after level 2) and the stat cap is higher. keep going until you've killed all <b>104</b> (see "nike inc status"). then the <b>final wave</b> comes: giuseppe and the nike inc. militia. before it you can keep your team (every unit gets +${KEEP_BONUS.stat}/+${KEEP_BONUS.stat} and +${KEEP_BONUS.levels} levels, once per run), or sell it and rebuild with ${REBUILD.gold} gold in a veterans market.</li>
    <li>clones can go past 5 units on the field (up to 10 per side): giuseppe jr., giuseppe creatore and clone factories keep spawning even when your team is full.</li>
    <li>the game starts in black and white and gets more colour the closer you get to the end. just like the series.</li>
    <li>new tiers unlock every 2 turns. <b>nike</b> characters take double damage from john tanner.</li>
  </ul>`);
}

function codex() {
  let html = `<h2>all characters</h2><div class="codex">`;
  let found = false; try { found = localStorage.getItem('np_secret_jahn') === '1'; } catch (e) {}
  for (let t = 1; t <= 7; t++) {
    const list = Object.entries(UNITS).filter(([k, d]) => d.tier === t && !d.token && (!d.secret || found) && packOk(d));
    if (!list.length) continue;
    html += `<div class="codex-tier">tier ${t}</div>`;
    list.forEach(([k, d]) => {
      const src = imgSrc(k);
      html += `<div class="entry">${src ? `<img src="${src}"${d.bw ? ' style="filter:grayscale(1) contrast(1.3)"' : ''}>` : `<div class="noimg">?</div>`}<div><h4>${d.name}</h4><div class="s">${d.atk}/${d.hp}${(d.tags || []).includes('nike') ? ' · nike inc.' : ''}</div><div class="d">${d.text(1)}</div></div></div>`;
    });
  }
  openModal(html + `</div>`);
}

function itemsCodex() {
  let html = `<h2>all items</h2><p class="t">items cost ${ITEM_COST} gold in the shop unless it says otherwise. <b>equip</b> items stay on a character (one each), the others are used up.</p><div class="codex">`;
  for (let t = 1; t <= 6; t++) {
    const list = Object.entries(ITEMS).filter(([k, it]) => it.tier === t && packOk(it));
    if (!list.length) continue;
    html += `<div class="codex-tier">tier ${t}</div>`;
    list.forEach(([k, it]) => {
      const kind = (it.food ? 'food · used up' : it.equip ? 'equip · stays on the character' : it.team ? 'team item · used up' : it.kill ? 'kills a character · used up' : 'used up') + (it.cost && it.cost !== ITEM_COST ? ` · ${it.cost} gold` : '');
      html += `<div class="entry"><div class="ipic-sm">${itemArt(k)}</div><div><h4>${it.name}</h4><div class="s">${kind}</div><div class="d">${it.text}</div></div></div>`;
    });
  }
  openModal(html + `</div>`);
}

// ---------------- volume ----------------
// PC: a slider next to the speaker (the speaker mutes / restores).
// Phones and touch screens: no slider, the speaker button steps 100 > 75 > 50 > 25 > 0 > 100.
const touchy = () => window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const volIcon = l => l === 0 ? '🔇' : l <= 25 ? '🔈' : l <= 60 ? '🔉' : '🔊';
function mountVolume() {
  document.querySelectorAll('[data-vol]').forEach(el => {
    el.classList.add('vol');
    el.innerHTML = `<button class="icon vol-btn" title="volume"></button><input class="vol-range" type="range" min="0" max="100" step="5" aria-label="volume"><span class="vol-pct"></span>`;
    el.querySelector('.vol-btn').onclick = () => { if (touchy()) Audio2.cycleLevel(); else Audio2.toggleMute(); syncVolume(); Audio2.play('click'); };
    el.querySelector('.vol-range').oninput = e => { Audio2.setLevel(+e.target.value); syncVolume(); };
    el.querySelector('.vol-range').onchange = () => Audio2.play('click');
  });
  syncVolume();
}
function syncVolume() {
  const l = Audio2.level;
  document.querySelectorAll('.vol').forEach(el => {
    el.querySelector('.vol-btn').textContent = volIcon(l);
    const r = el.querySelector('.vol-range'); if (r && +r.value !== l) r.value = l;
    el.querySelector('.vol-pct').textContent = l + '%';
  });
  const m = $('#m-vol'); if (m) { if (+m.value !== l) m.value = l; $('#m-vol-pct').textContent = l + '%'; }
  const mi = $('#m-vol-ico'); if (mi) mi.textContent = volIcon(l);
}
const menuVolHTML = `<div class="menu-vol"><span id="m-vol-ico">🔊</span><input id="m-vol" type="range" min="0" max="100" step="5" aria-label="volume"><b id="m-vol-pct">100%</b></div>`;
function wireMenuVolume() {
  const m = $('#m-vol'); if (!m) return;
  m.oninput = () => { Audio2.setLevel(+m.value); syncVolume(); };
  m.onchange = () => Audio2.play('click');
  syncVolume();
}

function menu() {
  if (S && S.net) {
    openModal(`<h2>menu</h2><p>online room <b>${NET.code}</b></p>${NET.standingsHTML(NET.lobbyPlayers || [])}${menuVolHTML}<div class="menu">
      <button id="m-resume" class="big">resume</button><button id="m-codex">all characters</button><button id="m-items">all items</button>
      <button id="m-leave" style="background:#6d1b1b">leave online game</button></div>`, { compact: true });
    $('#m-resume').onclick = () => $('#modal').classList.add('hidden');
    $('#m-codex').onclick = codex; $('#m-items').onclick = itemsCodex;
    $('#m-leave').onclick = () => NET.leave();
    wireMenuVolume();
    return;
  }
  openModal(`<h2>menu</h2>${menuVolHTML}<div class="menu">
    <button id="m-resume" class="big">resume</button>
    <button id="m-how">how to play</button>
    <button id="m-codex">all characters</button>
    <button id="m-items">all items</button>
    <button id="m-title">save and quit to title</button>
    <button id="m-abandon" class="danger" style="background:#6d1b1b">abandon run</button></div>`, { compact: true });
  $('#m-resume').onclick = () => $('#modal').classList.add('hidden');
  $('#m-how').onclick = howToPlay; $('#m-codex').onclick = codex; $('#m-items').onclick = itemsCodex;
  $('#m-title').onclick = () => { saveRun(); $('#modal').classList.add('hidden'); toTitle(); };
  $('#m-abandon').onclick = () => { store.del('np_run'); S = null; setEndless(false); $('#modal').classList.add('hidden'); toTitle(); };
  wireMenuVolume();
}

// ---------------- title ----------------
// character packs the next new run starts with (an online room uses the host's choice)
function renderPackRow() {
  const el = $('#pack-row'); if (!el) return;
  const pr = packPrefs();
  el.innerHTML = Object.entries(PACKS).map(([k, p]) => `<label class="pack"><input type="checkbox" data-pk="${k}" ${pr[k] ? 'checked' : ''}><span><b>${p.name}</b> <small>${p.text} applies to new runs.</small></span></label>`).join('');
  el.querySelectorAll('input').forEach(i => { i.onchange = () => { const q = packPrefs(); q[i.dataset.pk] = i.checked; savePackPrefs(q); setPacks(q); }; });
}
function toTitle() {
  CUT.close(true);
  cancelTheme();
  setEndless(false);
  showScreen('title');
  document.documentElement.style.setProperty('--gray', '1');
  $('#btn-continue').classList.toggle('hidden', !store.get('np_run', null));
  // the menu song comes back at a random speed and pitch every time (medium: between about 0.72x and 1.4x, never close to normal)
  const sign = Math.random() < 0.5 ? -1 : 1, menuRate = Math.exp(sign * (0.15 + Math.random() * 0.19));
  Audio2.playSong('assets/music/menusong.mp3', true, menuRate);
  setPacks(packPrefs()); renderPackRow();
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
  mountVolume();
  $('#btn-new').onclick = () => { Audio2.play('start'); newRun(false); };
  $('#btn-endless').onclick = () => { Audio2.play('start'); newRun(true); };
  $('#btn-continue').onclick = () => {
    S = store.get('np_run', null); if (!S) return;
    // drop anything a newer version removed (old saves) so the game can't crash on it
    S.team = (S.team || []).map(u => (u && UNITS[u.id]) ? Object.assign(u, { item: u.item && ITEMS[u.item] ? u.item : null }) : null);
    while (S.team.length < 5) S.team.push(null);
    S.shop.units = (S.shop.units || []).filter(e => e && e.u && UNITS[e.u.id]);
    S.shop.items = (S.shop.items || []).filter(e => e && ITEMS[e.id]);
    UID = 1 + Math.max(0, ...S.team.filter(Boolean).map(u => u.uid), ...S.shop.units.map(e => e.u.uid));
    setEndless(!!S.endless);
    S.packs = S.packs || {}; S.curses = S.curses || []; setPacks(S.packs);
    showScreen('shop'); renderShop(); phaseSong('shop');
    if (S.boss && !S.bossChosen) bossChoice();
  };
  $('#btn-how').onclick = howToPlay;
  $('#btn-online').onclick = onlineMenu;
  $('#btn-units').onclick = codex;
  $('#btn-items').onclick = itemsCodex;
  $('#btn-ach').onclick = () => ACH.open();
  ACH.init();
  $('#modal-close').onclick = closeModal;
  $('#btn-roll').onclick = roll;
  $('#btn-freeze').onclick = toggleFreeze;
  $('#btn-sell').onclick = () => sel && sel.kind === 'team' && sellTeam(sel.idx);
  const sellBtn = $('#btn-sell');
  sellBtn.addEventListener('dragover', e => { if (sel && sel.kind === 'team') { e.preventDefault(); sellBtn.classList.add('sell-zone', 'over'); } });
  sellBtn.addEventListener('dragleave', () => sellBtn.classList.remove('over'));
  sellBtn.addEventListener('drop', e => { e.preventDefault(); sellBtn.classList.remove('over'); if (sel && sel.kind === 'team') sellTeam(sel.idx); });
  $('#btn-end').onclick = endTurn;
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
