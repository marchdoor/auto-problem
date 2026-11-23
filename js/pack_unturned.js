// ============================================================
//  Character packs. A pack is a set of extra characters and items that can be switched on
//  when starting a run, or by the host of an online room. The "unturned dlc" is the first one.
//  Everything in a pack has `pack: 'id'`. The battle rules for these (bleeding, poison, dodge,
//  tent, 1911 ...) live in engine.js; the food rules are at the bottom of this file.
//  Zombies are tagged 'zombie' (the 1911 and the fire zombie care about that).
// ============================================================
const PACKS = {
  unturned: { name: 'unturned dlc', text: '6 zombies, 14 items and random foods. adds bleeding and poison to battles.' },
};
let ACTIVE_PACKS = {};
const packOk = d => !d.pack || !!ACTIVE_PACKS[d.pack];
function setPacks(p) { ACTIVE_PACKS = Object.assign({}, p || {}); }
function packPrefs() { try { return JSON.parse(localStorage.getItem('np_packs') || '{"unturned":false}'); } catch (e) { return { unturned: false }; } }
function savePackPrefs(p) { try { localStorage.setItem('np_packs', JSON.stringify(p)); } catch (e) {} }

const BLEED_TXT = '<b>bleeding</b>: 2 damage at the end of each turn, for 3 turns';

Object.assign(UNITS, {
  mj: {
    name: 'michael jackson (unturned)', tier: 2, atk: 3, hp: 3, img: 'mj.png', tags: ['zombie'], pack: 'unturned', bleed: 0.35, on: {},
    text: L => `zombie. normal stats, but his hits cause bleeding ${Math.round(100 * (0.35 + 0.05 * (L - 1)))}% of the time (most zombies only 10-15%). ${BLEED_TXT}`
  },
  dogz: {
    name: 'dog family zombie', tier: 1, atk: 1, hp: 2, img: 'dogz.png', tags: ['zombie'], pack: 'unturned', bleed: 0.08, on: {},
    text: L => `zombie. weak, but he always attacks twice. low bleeding chance (${Math.round(100 * (0.08 + 0.05 * (L - 1)))}%)`
  },
  acidz: {
    name: 'acid zombie', tier: 3, atk: 3, hp: 3, img: 'acidz.png', tags: ['zombie'], pack: 'unturned', poison: true, on: {},
    text: L => `zombie. every hit poisons (<b>poison</b>: 2 damage at the end of each turn, 3 turns, no bleeding). every 5th turn he spits acid from wherever he stands: full damage on the front enemy, half on the 2 behind it, all poisoned`
  },
  firez: {
    name: 'fire zombie', tier: 4, atk: 4, hp: 5, img: 'firez.png', tags: ['zombie'], pack: 'unturned', bleed: 0.1, on: {
      faint(c, u, L) {
        c.caption('the fire zombie explodes'); c.sfx('nuke');
        c.randomAllies(u.side, 2).forEach(m => { c.damage(m, 2 + 2 * L, u, 'fire'); if ((UNITS[m.id].tags || []).includes('zombie')) c.buff(m, 2, 0); });
        c.randomAllies(c.other(u.side), 2).forEach(e => c.damage(e, 2 + 2 * L, u, 'fire'));
      }
    },
    text: L => `zombie. hits for direct damage. <b>faint:</b> explodes, ${2 + 2 * L} fire damage to 2 random friends and 2 random enemies. friendly zombies also get +2 attack`
  },
  miamiz: {
    name: 'ghost of miami zombie', tier: 3, atk: 3, hp: 4, img: 'miamiz.png', tags: ['zombie'], pack: 'unturned', bleed: 0.12, on: {},
    text: L => `zombie. ${Math.round(100 * (0.15 + 0.1 * L))}% chance to avoid an attack completely (higher with levels)`
  },
  bigz: {
    name: 'big nigga', tier: 5, atk: 6, hp: 16, img: 'bigz.png', tags: ['zombie'], pack: 'unturned', bleed: 0.1, on: {},
    text: L => `zombie. very tanky. he winds up for a turn, then throws a rock on the next. each rock has a ${Math.round(100 * (0.12 + 0.04 * L))}% chance to kill on the spot`
  },
});

// ---- items ----
const FOOD = {
  lettuce: { name: 'lettuce', icon: '🥬', tier: 1, a: 0, h: 3 },
  juice: { name: 'juice', icon: '🧃', tier: 1, a: 2, h: 0 },
  milk: { name: 'milk', icon: '🥛', tier: 2, a: 0, h: 4 },
  cheese: { name: 'cheese', icon: '🧀', tier: 2, a: 2, h: 1 },
  bread: { name: 'bread', icon: '🍞', tier: 4, a: 3, h: 3 },
};
Object.entries(FOOD).forEach(([k, f]) => {
  ITEMS[k] = {
    name: f.name, tier: f.tier, icon: f.icon, food: true, pack: 'unturned',
    text: `food. a random freshness from 1% to 100% scales it (full: ${[f.a ? '+' + f.a + ' attack' : '', f.h ? '+' + f.h + ' health' : ''].filter(Boolean).join(' and ')}). above 80% it has a good side effect, under 50% a bad one, under 25% it barely helps, under 10% it is cursed`,
    use() {},
  };
});
Object.assign(ITEMS, {
  scrap: { name: 'metal scrap', tier: 3, img: 'scrap.png', fit: 'contain', pack: 'unturned', text: 'gives +1 experience to the character of your choice', use(s, u) { s.addExp(u, 1); } },
  dressing: { name: 'dressing', tier: 4, img: 'dressing.png', fit: 'contain', pack: 'unturned', food: false, text: 'food. +6 permanent health', use(s, u) { s.buff(u, 0, 6); } },
  ladder: { name: 'ladder fail', tier: 3, img: 'ladder.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: once per battle, on its first attack it makes the enemy in front bleed and skip its turn' },
  fullmoon: { name: 'full moon', tier: 4, img: 'fullmoon.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: +4/+4 at the start of each battle (only for that battle) and its hits have a 25% chance to cause bleeding' },
  chainsaw: { name: 'hyundai chainsaw', tier: 3, img: 'chainsaw.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: like the negev but weaker, a third of the attack splashes onto the enemy behind, and 15% chance to cause bleeding' },
  heli: { name: 'helicopter kamikaze fail', tier: 2, icon: '🚁', equip: true, pack: 'unturned', text: 'equip: when its holder dies, EVERYONE on the field takes 4 damage' },
  corona: { name: 'coronavirus', tier: 4, icon: '☢️', equip: true, pack: 'unturned', text: 'equip: every time the holder is hurt, all enemies lose 1 health per level of the holder (they never drop below 1)' },
  carjack: { name: 'carjack', tier: 3, img: 'carjack.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: the first time something targets the holder at turn 0 (start of battle abilities), the effect goes back to whoever caused it' },
  chef: { name: 'chef skill', tier: 3, img: 'chef.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: food and buff items used on this character work twice (the bad parts too)' },
  tent: { name: 'make tent bro', tier: 5, img: 'tent.png', fit: 'whole', equip: true, pack: 'unturned', text: 'equip: the holder disappears at the start of battle (nothing can target it) and comes back on turn 5. if the rest of the team is dead before that, it never comes back and you lose the character' },
  m1911: { name: '1911', tier: 3, img: 'm1911.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: when facing a zombie, a chance to kill it outright every turn (70% against tier 1, 10% less for each tier higher, 10% at least)' },
  knife: { name: 'military knife', tier: 3, img: 'knife.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: bleeding aimed at the holder goes back to whoever caused it. bleeding that would hit the whole team is cancelled when it was aimed at the holder' },
  hamburg: { name: 'hamburg lore', tier: 6, img: 'hamburg.png', fit: 'contain', equip: true, pack: 'unturned', text: 'equip: at the start of battle 3 random characters of each team are killed on the spot. the holder can die too' },
});

// ---- food: freshness, good and bad side effects ----
// effects that last for the next battle only are stored on the character as u.next = ['bleed', ...]
const NEXT_TXT = { bleed: 'starts the next battle bleeding', poison: 'starts the next battle poisoned', skip: 'skips its first attack in the next battle', halfhp: 'starts the next battle with half health', weak: '-3 attack in the next battle' };
function foodGains(f, pct) {
  const sc = (n) => !n ? 0 : pct < 25 ? 1 : Math.max(1, Math.round(n * pct / 100));
  return { a: sc(f.a), h: sc(f.h) };
}
function foodText(id, pct) {
  const f = FOOD[id], g = foodGains(f, pct);
  const gain = [g.a ? `+${g.a} attack` : '', g.h ? `+${g.h} health` : ''].filter(Boolean).join(' and ');
  const side = pct > 80 ? 'good side effect: +1 attack or +1 health' : pct < 10 ? 'cursed: a unique debuff, sometimes it lands on the enemy instead' : pct < 25 ? 'two bad side effects likely' : pct < 50 ? 'a bad side effect' : 'no side effect';
  return `food at ${pct}%: ${gain}. ${side}.`;
}
// apply one food to a character. s = shop context. Returns text for toasts.
function applyFood(s, u, id, pct) {
  const f = FOOD[id], g = foodGains(f, pct), out = [];
  s.buff(u, g.a, g.h);
  const bad = () => {
    const r = Math.floor(Math.random() * 4);
    if (r === 0) { const a0 = u.atk; u.atk = Math.max(1, u.atk - 1); logBuff(u, u.atk - a0, 0, 'bad food'); out.push('spoiled: -1 attack'); }
    else if (r === 1) { const h0 = u.hp; u.hp = Math.max(1, u.hp - 1); logBuff(u, 0, u.hp - h0, 'bad food'); out.push('stomach ache: -1 health'); }
    else { const t = r === 2 ? 'bleed' : 'poison'; (u.next = u.next || []).push(t); out.push(`${f.name}: ${NEXT_TXT[t]}`); }
  };
  if (pct > 80) { if (Math.random() < 0.5) { s.buff(u, 1, 0); out.push('fresh: +1 attack'); } else { s.buff(u, 0, 1); out.push('fresh: +1 health'); } }
  else if (pct < 10) {
    const t = ['skip', 'halfhp', 'weak'][Math.floor(Math.random() * 3)];
    if (!S.net && Math.random() < 0.25) { (S.curses = S.curses || []).push(t); out.push(`cursed ${f.name}... it lands on the enemy: they ${NEXT_TXT[t]}`); }
    else { (u.next = u.next || []).push(t); out.push(`cursed ${f.name}: ${NEXT_TXT[t]}`); }
  }
  else if (pct < 25) { bad(); if (Math.random() < 0.6) bad(); }
  else if (pct < 50) bad();
  return out;
}
