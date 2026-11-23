// ============================================================
//  Battle engine. Battles are fully deterministic from a seed,
//  so later online play can replay the same fight on both PCs.
// ============================================================

// ---- endless mode: levels keep growing (3 merges per level after level 2) and the stat cap is higher
let ENDLESS = false;
const MAX_STAT_NORMAL = 50, MAX_STAT_ENDLESS = 150;
let MAX_STAT = MAX_STAT_NORMAL;
function setEndless(on) { ENDLESS = !!on; MAX_STAT = ENDLESS ? MAX_STAT_ENDLESS : MAX_STAT_NORMAL; }
const expCap = () => ENDLESS ? 9999 : 5;
const maxLevel = () => ENDLESS ? Infinity : 3;
const levelOf = exp => exp >= 5 ? (ENDLESS ? 3 + Math.floor((exp - 5) / 3) : 3) : exp >= 2 ? 2 : 1;
// the least experience a unit needs to be a given level (endless: 3 per level after level 2)
const expForLevel = L => L <= 1 ? 0 : L === 2 ? 2 : 5 + 3 * (L - 3);
// the most units a side can have on the field in a battle. Your team is still 5, but clones can go past it.
const MAX_FIELD = 10;
// the squares under a card: merges collected towards the next level
function expProgress(exp) {
  exp = exp || 0;
  const L = levelOf(exp);
  if (L === 1) return { have: exp, need: 2 };
  if (L === 2) return { have: exp - 2, need: 3 };
  if (!ENDLESS) return { have: 0, need: 0 };
  return { have: (exp - 5) % 3, need: 3 };
}
const hasTag = (u, t) => (UNITS[u.id].tags || []).includes(t);
let UID = 1;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function newUnit(id, extra = {}) {
  const d = UNITS[id];
  return Object.assign({ uid: UID++, id, atk: d.atk, hp: d.hp, exp: 0, item: null }, extra);
}

function fill(s, n) { return s.replace('{n}', n.n || '').replace('{k}', n.k || ''); }

function simulateBattle(teamA, teamB, seed, opts = {}) {
  const rng = mulberry32(seed);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  let cloneNo = 1 + Math.floor(rng() * 104);
  const frames = [];
  // cloneKills = enemy (side B) units that died, killsA = your side's deaths. "nike inc status" counts the first.
  const stats = { cloneKills: 0, killsA: 0 };
  let pendingFx = [], pendingCap = null, pendingSfx = [];

  const mk = (u, side) => ({
    uid: UID++, srcUid: u.uid, id: u.id, name: UNITS[u.id].name, atk: u.atk, hp: u.hp, exp: u.exp || 0,
    lvl: levelOf(u.exp || 0), item: u.item, side, flags: {}, baseAtk: u.atk, maxHp: u.hp, dead: false
  });
  const T = { A: teamA.filter(Boolean).map(u => mk(u, 'A')), B: teamB.filter(Boolean).map(u => mk(u, 'B')) };
  T.A.concat(T.B).forEach(u => { if (u.id === 'clonetoken') u.name = 'giuseppe n.' + (cloneNo++ % 104 + 1); });

  const snap = () => {
    const cp = side => T[side].map(u => ({ uid: u.uid, id: u.id, name: u.name, atk: u.atk, hp: Math.max(0, u.hp), lvl: u.lvl, exp: u.exp, item: u.item, dead: u.dead }));
    frames.push({ A: cp('A'), B: cp('B'), fx: pendingFx, cap: pendingCap, sfx: pendingSfx });
    pendingFx = []; pendingCap = null; pendingSfx = [];
  };

  const hurtQ = [];
  const c = {
    rng,
    other: s => s === 'A' ? 'B' : 'A',
    team: s => T[s],
    front: s => T[s].find(u => !u.dead),
    all: () => T.A.concat(T.B).filter(u => !u.dead),
    indexOf: u => T[u.side].indexOf(u),
    behindOf: u => { const t = T[u.side]; for (let i = t.indexOf(u) + 1; i < t.length; i++) if (!t[i].dead) return t[i]; return null; },
    randomAlly: s => { const a = T[s].filter(u => !u.dead); return a.length ? pick(a) : null; },
    randomAllies: (s, n) => { const a = T[s].filter(u => !u.dead).slice(); const r = []; while (r.length < n && a.length) r.push(a.splice(Math.floor(rng() * a.length), 1)[0]); return r; },
    randomEnemy: s => c.randomAlly(c.other(s)),
    strongestEnemy: s => T[c.other(s)].filter(u => !u.dead).sort((a, b) => b.atk - a.atk)[0],
    weakestEnemy: s => T[c.other(s)].filter(u => !u.dead).sort((a, b) => a.hp - b.hp)[0],
    caption: t => { pendingCap = t; },
    sfx: n => { pendingSfx.push(n); },
    fx: (u, type, amt) => { pendingFx.push({ uid: u.uid, type, amt }); },
    buff(u, a, h) {
      if (!u || u.dead) return;
      u.atk = Math.min(MAX_STAT, u.atk + a); u.hp = Math.min(MAX_STAT, u.hp + h); u.maxHp = Math.min(MAX_STAT, u.maxHp + h);
      c.fx(u, 'buff', [a, h]);
    },
    damage(t, amt, src, kind) {
      if (!t || t.dead || amt <= 0) return 0;
      if (src && src.id === 'john' && hasTag(t, 'nike')) amt *= 2;
      if (t.item === 'petronas') amt = Math.max(1, amt - 2);
      if (t.item === 'keys' && !t.flags.keyUsed && t.hp - amt <= 0) { t.flags.keyUsed = true; amt = t.hp - 1; c.caption('keys to the famous basement'); }
      t.hp -= amt; t.lastHitBy = src;
      c.fx(t, 'hit', amt);
      if (t.hp <= 0) t.dead = true; else hurtQ.push(t);
      return amt;
    },
    summon(side, idx, id, atk, hp) {
      const alive = T[side].filter(u => !u.dead);
      if (alive.length >= MAX_FIELD) return null;
      const n = mk({ id, atk, hp, exp: 0 }, side);
      n.uid = UID++;
      if (id === 'clonetoken') n.name = 'giuseppe n.' + (cloneNo++ % 104 + 1);
      T[side].splice(Math.min(Math.max(0, idx), T[side].length), 0, n);
      c.fx(n, 'summon');
      return n;
    },
    remove(u) { const t = T[u.side]; const i = t.indexOf(u); if (i >= 0) t.splice(i, 1); c.fx(u, 'absorb'); },
  };

  function trigger(u, ev, ...args) {
    const h = UNITS[u.id].on[ev];
    if (h) { h(c, u, u.lvl, ...args); c.fx(u, 'ability'); }
  }

  function settle() {
    let guard = 0;
    while (guard++ < 200) {
      while (hurtQ.length) { const u = hurtQ.shift(); if (!u.dead) trigger(u, 'hurt'); }
      let died = null, side = null;
      for (const s of ['A', 'B']) { const d = T[s].find(u => u.dead); if (d) { died = d; side = s; break; } }
      if (!died) break;
      const t = T[side], idx = t.indexOf(died);
      t.splice(idx, 1);
      const behind = t[idx];
      const killer = died.lastHitBy;
      pendingFx.push({ uid: died.uid, type: 'faint', side, killerId: killer && killer.side !== side ? killer.id : null, killerUid: killer && killer.side !== side ? killer.uid : null, banned: !!died.flags.banned });
      if (side === 'B') stats.cloneKills++; else stats.killsA++;
      pendingCap = pendingCap || (killer && killer.side !== died.side && rng() < 0.5
        ? fill(pick(CAPTIONS.ko), { k: killer.name, n: died.name })
        : fill(pick(CAPTIONS.faint), { n: died.name }));
      pendingSfx.push('faint');
      trigger(died, 'faint', idx);
      if (died.item === 'reebok') { const e = c.front(c.other(side)); if (e) { c.damage(e, 4, died, 'reebok'); c.caption(`${died.name}'s car has been reebooked`); pendingSfx.push('nuke'); } }
      t.filter(u => !u.dead).forEach(f => trigger(f, 'friendFaint'));
      if (behind && !behind.dead && t.includes(behind)) trigger(behind, 'friendAheadFaint');
      if (killer && !killer.dead && killer.side !== side && T[killer.side].includes(killer)) trigger(killer, 'knockout');
      snap();
    }
  }

  // ---- start of battle ----
  pendingCap = pick(CAPTIONS.start);
  pendingSfx.push('start');
  snap();
  // sudden death card bans: the banned cards die before anything else (their faint abilities still trigger)
  if (opts.ban && opts.ban.length) {
    const banned = T.A.concat(T.B).filter(u => opts.ban.some(b => b.side === u.side && b.uid === u.srcUid));
    if (banned.length) {
      banned.forEach(u => { u.flags.banned = true; c.fx(u, 'ban'); });
      pendingCap = banned.map(u => u.name).join(' and ') + ' got banned';
      snap();
      banned.forEach(u => { u.dead = true; });
      pendingCap = 'uninstall life of ' + banned.map(u => u.name).join(' and ');
      settle();
    }
  }
  const order = T.A.concat(T.B); order.forEach(u => { u.tb = rng(); }); order.sort((a, b) => b.atk - a.atk || a.tb - b.tb);
  for (const u of order) {
    if (u.dead || !T[u.side].includes(u)) continue;
    trigger(u, 'startBattle');
    if (u.item === 'chip') { const e = c.randomEnemy(u.side); if (e) c.damage(e, 3, u, 'chip'); }
    if (pendingFx.length) snap();
    settle();
  }

  // ---- main fight ----
  let rounds = 0;
  while (T.A.length && T.B.length && rounds++ < 200) {
    let a = T.A[0], b = T.B[0];
    trigger(a, 'beforeAttack'); trigger(b, 'beforeAttack');
    if (pendingFx.length) snap();
    settle();
    a = T.A[0]; b = T.B[0];
    if (!a || !b) break;
    const dmgA = a.atk + (a.item === 'ghostgun' ? 3 : 0);
    const dmgB = b.atk + (b.item === 'ghostgun' ? 3 : 0);
    c.fx(a, 'attack'); c.fx(b, 'attack');
    pendingSfx.push('hit');
    const dealtA = c.damage(b, dmgA, a, 'atk');
    const dealtB = c.damage(a, dmgB, b, 'atk');
    for (const [u, d] of [[a, dealtA], [b, dealtB]]) {
      if (u.item === 'vnegev' && !u.dead && d > 0) {
        const heal = Math.min(d, MAX_STAT - u.hp);
        if (heal > 0) { u.hp += heal; c.fx(u, 'heal', heal); }
      }
    }
    if (a.item === 'negev' && T.B[1]) c.damage(T.B[1], Math.ceil(dmgA / 2), a, 'negev');
    if (b.item === 'negev' && T.A[1]) c.damage(T.A[1], Math.ceil(dmgB / 2), b, 'negev');
    snap();
    settle();
  }

  const result = !T.A.length && !T.B.length ? 'draw' : !T.A.length ? 'lose' : !T.B.length ? 'win' : 'draw';
  return { frames, result, stats };
}

// ============================================================
//  Bot opponents: a rough "what a player would have by turn N"
// ============================================================
function tierFor(turn) { return Math.min(6, Math.ceil(turn / 2)); }

function buildBotTeam(turn, rng) {
  const maxTier = tierFor(turn);
  const pool = Object.keys(UNITS).filter(k => !UNITS[k].token && UNITS[k].tier <= maxTier);
  const count = Math.min(5, 2 + Math.floor(turn / 1.5));
  const team = [];
  for (let i = 0; i < count; i++) {
    // favour higher tiers as the game goes on
    const weighted = pool.filter(k => rng() < 0.35 + UNITS[k].tier / (maxTier + 1));
    const id = (weighted.length ? weighted : pool)[Math.floor(rng() * (weighted.length || pool.length))];
    const u = newUnit(id);
    const exp = Math.min(expCap(), Math.floor(rng() * (turn / 2.5)));
    u.exp = exp; u.atk += exp; u.hp += exp;
    team.push(u);
  }
  // spend "food" budget
  let budget = Math.floor((turn - 1) * 1.6);
  if (ENDLESS && turn > 12) budget = Math.floor(11 * 1.6 + (turn - 12) * 2.6); // endless: bots keep growing
  while (budget-- > 0) { const u = team[Math.floor(rng() * team.length)]; if (rng() < 0.5) u.atk++; else u.hp++; }
  if (turn >= 4) {
    const eq = Object.keys(ITEMS).filter(k => ITEMS[k].equip && ITEMS[k].tier <= maxTier);
    const n = Math.floor(rng() * Math.min(3, turn / 3));
    for (let i = 0; i < n; i++) team[Math.floor(rng() * team.length)].item = eq[Math.floor(rng() * eq.length)];
  }
  team.forEach(u => { u.atk = Math.min(MAX_STAT, u.atk); u.hp = Math.min(MAX_STAT, u.hp); });
  return team;
}

// ============================================================
//  The final boss: Giuseppe and the Nike Inc. militia ("104 dead, 1 to go").
//  Front of the team first. Only used in endless mode, so the higher stat cap applies.
// ============================================================
function buildBossTeam() {
  const mk = (id, atk, hp, exp, item) => newUnit(id, { atk: Math.min(MAX_STAT, atk), hp: Math.min(MAX_STAT, hp), exp, item });
  return [
    mk('noproblem', BOSS.a1, BOSS.h1, BOSS.exp, 'keys'),
    mk('g0',        BOSS.a2, BOSS.h2, BOSS.exp, 'petronas'),
    mk('agartha',   BOSS.a3, BOSS.h3, BOSS.exp, 'negev'),
    mk('gjr',       BOSS.a4, BOSS.h4, BOSS.exp, 'ghostgun'),
    mk('giuseppe',  BOSS.a5, BOSS.h5, BOSS.exp + 3, 'vnegev'),
  ];
}
// Tuned by simulation: a team needs roughly 58+ in every stat on all five units (level 4, with a negev) to beat it.
const BOSS = { exp: 13, a1: 56, h1: 44, a2: 60, h2: 56, a3: 64, h3: 56, a4: 56, h4: 60, a5: 68, h5: 76 };

// The "veterans market": if you rebuild before the final wave you get REBUILD.gold and a shop of
// pre-levelled tier 5-6 characters (a fresh deck can't otherwise get anywhere near the boss).
// If you keep your team for the final wave, every unit gets this (once per run).
const KEEP_BONUS = { stat: 30, levels: 5 };
const REBUILD = { gold: 60, bonus: 50, exp: 8, minTier: 5, shop: 6 };
const mkVeteran = id => newUnit(id, { atk: UNITS[id].atk + REBUILD.bonus, hp: UNITS[id].hp + REBUILD.bonus, exp: REBUILD.exp });
