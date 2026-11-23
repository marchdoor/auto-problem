// ============================================================
//  NO PROBLEM: AUTO PROBLEM - unit and item data
//  Every ability is built from the lore bible. L = level (1..3).
//  Battle events: startBattle, beforeAttack, hurt, faint, knockout,
//                 friendFaint, friendAheadFaint
//  Shop events:   buy, sell, startTurn, endTurn
// ============================================================

const UNITS = {
  // ---------------- TIER 1 ----------------
  clone: {
    name: 'giuseppe clone', tier: 1, atk: 2, hp: 1, img: 'clone', tags: ['nike'],
    text: L => `<b>faint:</b> summon a ${L}/${L} numbered clone. there are 104 of them`,
    on: {
      faint(c, u, L, idx) { c.summon(u.side, idx, 'clonetoken', L, L); }
    }
  },
  pennius: {
    name: 'pennius llays', tier: 1, atk: 2, hp: 2, img: 'pennius',
    text: L => `<b>sell:</b> give 2 random friends +${L} health. "race package" installed`,
    on: {
      sell(s, u, L) { s.randomFriends(u, 2).forEach(f => s.buff(f, 0, L)); s.caption('pennius llays installs 1 gif'); }
    }
  },
  troop: {
    name: 'nfs troop', tier: 1, atk: 2, hp: 2, img: 'troop',
    text: L => `<b>faint:</b> give a random friend +${2 * L}/+${L}`,
    on: {
      faint(c, u, L) { const f = c.randomAlly(u.side); if (f) c.buff(f, 2 * L, L); }
    }
  },
  man: {
    name: 'man', tier: 1, atk: 1, hp: 3, img: 'man',
    text: L => `<b>faint:</b> give the friend behind +${L}/+${2 * L}. he left bondo a letter`,
    on: {
      faint(c, u, L, idx) { const f = c.team(u.side)[idx]; if (f) { c.buff(f, L, 2 * L); c.caption('man sacrificed himself so bondo could win'); } }
    }
  },
  loanshark: {
    name: 'continente loan shark', tier: 1, atk: 3, hp: 1, img: 'loanshark',
    text: L => `<b>buy:</b> gain ${L + 1} gold. <b>start of turn:</b> lose 1 gold. they are watching you`,
    on: {
      buy(s, u, L) { s.gold(L + 1); s.caption('they giveth the money'); },
      startTurn(s, u) { s.gold(-1); s.caption('they taketh 1 gold'); }
    }
  },

  // ---------------- TIER 2 ----------------
  venom: {
    name: 'barbie venom', tier: 2, atk: 2, hp: 3, img: 'venom',
    text: L => `<b>faint:</b> give 2 random friends +${L}/+${L}. venom cries`,
    on: {
      faint(c, u, L) { c.randomAllies(u.side, 2).forEach(f => c.buff(f, L, L)); c.caption('venom cries and nukes'); }
    }
  },
  tannerjohn: {
    name: 'tanner john', tier: 2, atk: 2, hp: 3, img: 'tannerjohn',
    text: L => `<b>start of battle:</b> deal ${2 * L} damage to a random enemy. he likes to troll everyone`,
    on: {
      startBattle(c, u, L) { const e = c.randomEnemy(u.side); if (e) c.damage(e, 2 * L, u, 'troll'); }
    }
  },
  kenji: {
    name: 'lt. kenji', tier: 2, atk: 2, hp: 3, img: 'kenji',
    text: L => `<b>faint:</b> summon kenji's twin brother ${2 * L}/${2 * L}. the kidnapped one was the twin`,
    on: {
      faint(c, u, L, idx) { c.summon(u.side, idx, 'kenjitwin', 2 * L, 2 * L); c.caption('it was kenjis twin brother all along'); }
    }
  },
  gavin: {
    name: 'gavin collins', tier: 2, atk: 3, hp: 2, img: 'gavin',
    text: L => `<b>faint:</b> TDI limousine crash, deal ${3 * L} damage to the front enemy`,
    on: {
      faint(c, u, L) { const e = c.front(c.other(u.side)); if (e) { c.damage(e, 3 * L, u, 'crash'); c.caption('9289034kmh limo breaks time and space'); } }
    }
  },
  barbara: {
    name: 'coach barbara', tier: 2, atk: 1, hp: 3, img: 'barbara',
    text: L => `<b>end turn:</b> give the friend ahead +${L} health`,
    on: {
      endTurn(s, u, L) { const f = s.ahead(u); if (f) s.buff(f, 0, L); }
    }
  },

  // ---------------- TIER 3 ----------------
  funny: {
    name: 'dr. funnyheimer', tier: 3, atk: 3, hp: 3, img: 'funny',
    text: L => `<b>faint:</b> negev nuke, deal ${2 * L} damage to EVERYONE. free sacrifice`,
    on: {
      faint(c, u, L) { c.caption('free sacrifice and negev nuke'); c.sfx('nuke'); c.all().forEach(t => c.damage(t, 2 * L, u, 'nuke')); }
    }
  },
  crosos: {
    name: 'sgt. crosos', tier: 3, atk: 3, hp: 4, img: 'crosos',
    text: L => `<b>start of battle:</b> betray the friend behind (${2 * L} damage) and gain +${2 * L} attack`,
    on: {
      startBattle(c, u, L) {
        const b = c.behindOf(u); c.buff(u, 2 * L, 0);
        if (b) { c.damage(b, 2 * L, u, 'betray'); c.caption('crosos springs a betrayal'); }
      }
    }
  },
  vodafone: {
    name: 'woto tolff (vodafone ceo)', tier: 3, atk: 2, hp: 4, img: 'vodafone',
    text: L => `<b>start of battle:</b> plant a chip on the strongest enemy, -${2 * L} attack. the rat, real name woto tolff`,
    on: {
      startBattle(c, u, L) {
        const e = c.strongestEnemy(u.side);
        if (e) { e.atk = Math.max(1, e.atk - 2 * L); c.fx(e, 'debuff'); c.caption(`woto tolff plants vodafone chip on ${e.name}`); }
      }
    }
  },
  g44: {
    name: 'giuseppe n°44', tier: 3, atk: 3, hp: 3, img: 'g44', tags: ['nike'],
    text: L => `<b>knock out:</b> gain +${2 * L}/+${L}. for some reason he's better than the other soldiers`,
    on: {
      knockout(c, u, L) { c.buff(u, 2 * L, L); }
    }
  },
  kitchen: {
    name: 'dr. kitchen', tier: 3, atk: 2, hp: 3, img: 'kitchen',
    text: L => `<b>end turn:</b> give a random friend +${L} attack. incentivizes the problem`,
    on: {
      endTurn(s, u, L) { const f = s.randomFriends(u, 1)[0]; if (f) s.buff(f, L, 0); }
    }
  },
  mlk: {
    name: 'martin luther link', tier: 3, atk: 2, hp: 2, img: 'mlk',
    text: L => `<b>start of battle:</b> linkedin router deals ${L} damage to ALL enemies`,
    on: {
      startBattle(c, u, L) { c.team(c.other(u.side)).slice().forEach(e => c.damage(e, L, u, 'router')); }
    }
  },

  // ---------------- TIER 4 ----------------
  nfsvp: {
    name: 'nfs mafia vp', tier: 4, atk: 4, hp: 4, img: 'nfsvp',
    text: L => `<b>start of battle:</b> laser eyes, deal ${3 * L} damage to the weakest enemy`,
    on: {
      startBattle(c, u, L) { const e = c.weakestEnemy(u.side); if (e) { c.damage(e, 3 * L, u, 'laser'); c.caption('a tua mae esta morta AHAHHAHAHAHAH'); } }
    }
  },
  bondo2: {
    name: 'bondo 2', tier: 4, atk: 4, hp: 5, img: 'bondo2',
    text: L => `<b>faint:</b> give all friends +${L}/+${L}. but at what cost`,
    on: {
      faint(c, u, L) { c.team(u.side).forEach(f => c.buff(f, L, L)); c.caption('bondo 2 wins, but at what cost'); }
    }
  },
  noproblem: {
    name: 'no problem', tier: 4, atk: 5, hp: 3, img: 'noproblem', tags: ['nike'],
    text: L => `<b>knock out:</b> deal ${3 * L} damage to the next enemy. there cant be any witnesses`,
    on: {
      knockout(c, u, L) { const e = c.front(c.other(u.side)); if (e) { c.damage(e, 3 * L, u, 'witness'); c.caption('there cant be any witnesses'); } }
    }
  },
  janner: {
    name: 'janner tohn', tier: 4, atk: 3, hp: 5, img: 'janner',
    text: L => `<b>friend ahead faints:</b> gain +${2 * L}/+${2 * L}. clutches the round`,
    on: {
      friendAheadFaint(c, u, L) { c.buff(u, 2 * L, 2 * L); c.caption('janner tohn clutches the round'); }
    }
  },
  renault: {
    name: 'renault', tier: 4, atk: 3, hp: 6, img: 'renault',
    text: L => `<b>start of battle:</b> welcome to renault island, all friends +${L} health`,
    on: {
      startBattle(c, u, L) { c.team(u.side).forEach(f => c.buff(f, 0, L)); c.caption('free fight soon renault island™'); }
    }
  },
  bondo3: {
    name: 'bondo 3', tier: 4, atk: 3, hp: 4, img: 'bondo3',
    text: L => `<b>faint:</b> summon bondo 2 (${2 * L}/${2 * L}). existing`,
    on: {
      faint(c, u, L, idx) { c.summon(u.side, idx, 'bondo2', 2 * L, 2 * L); }
    }
  },

  // ---------------- TIER 5 ----------------
  darius: {
    name: 'secretary darius', tier: 5, atk: 4, hp: 6, img: 'darius',
    text: L => `<b>faint:</b> 480V transformer, deal ${2 * L} damage to all enemies. no one can touch me`,
    on: {
      faint(c, u, L) { c.caption('no one can touch me'); c.sfx('nuke'); c.team(c.other(u.side)).slice().forEach(e => c.damage(e, 2 * L, u, '480v')); }
    }
  },
  g0: {
    name: 'giuseppe 0', tier: 5, atk: 5, hp: 5, img: 'g0', tags: ['nike'],
    text: L => `<b>friend faints:</b> gain +${L}/+${L}. the spawner needs sacrifices`,
    on: {
      friendFaint(c, u, L) { c.buff(u, L, L); }
    }
  },
  jeej: {
    name: 'jeej claalc', tier: 5, atk: 3, hp: 5, img: 'jeej',
    text: L => `<b>start of turn:</b> gain ${L} gold. sells 24 eur hacks. the real problem??`,
    on: {
      startTurn(s, u, L) { s.gold(L); s.caption('free plan for you'); }
    }
  },
  g2: {
    name: 'giuseppe 2', tier: 5, atk: 6, hp: 3, img: 'g2', tags: ['nike'],
    text: L => `<b>faint:</b> respawns for 10 seconds as a ${3 * L}/1 to break the fourth wall`,
    on: {
      faint(c, u, L, idx) { if (!u.flags.fake) { const n = c.summon(u.side, idx, 'g2', 3 * L, 1); if (n) { n.flags.fake = true; c.caption('his reebok is a fake'); } } }
    }
  },
  iliad: {
    name: 'iliad ceo', tier: 5, atk: 4, hp: 5, img: 'iliad',
    text: L => `<b>end turn:</b> give 2 random friends +${L}/+${L} with the iliadbox`,
    on: {
      endTurn(s, u, L) { s.randomFriends(u, 2).forEach(f => s.buff(f, L, L)); }
    }
  },
  gjr: {
    name: 'giuseppe jr.', tier: 5, atk: 4, hp: 4, img: 'gjr', tags: ['nike'],
    text: L => `<b>start of battle:</b> summon a ${2 * L}/${2 * L} clone behind him. new problem`,
    on: {
      startBattle(c, u, L) { c.summon(u.side, c.indexOf(u) + 1, 'clonetoken', 2 * L, 2 * L); }
    }
  },
  newman: {
    name: 'new man', tier: 5, atk: 5, hp: 5, img: 'newman',
    text: L => `<b>hurt:</b> gain +${L} attack. returns after insta death revolver`,
    on: {
      hurt(c, u, L) { c.buff(u, L, 0); }
    }
  },

  // ---------------- TIER 6 ----------------
  giuseppe: {
    name: 'm° giuseppe creatore', tier: 6, atk: 6, hp: 7, img: 'giuseppe', tags: ['nike'],
    text: L => `<b>start of battle:</b> summon ${L} clones (${2 * L}/${2 * L}). <b>faint:</b> respawn once and call ${L} more clones. its over when i say its over`,
    on: {
      startBattle(c, u, L) {
        c.sfx('giuseppe'); c.caption('he just trolls');
        for (let i = 0; i < L; i++) c.summon(u.side, c.indexOf(u) + 1, 'clonetoken', 2 * L, 2 * L);
      },
      faint(c, u, L, idx) {
        if (!u.flags.respawned) {
          const n = c.summon(u.side, idx, 'giuseppe', Math.max(1, Math.ceil(u.baseAtk / 2)), 3 * L);
          if (n) { n.flags.respawned = true; n.flags.noSummon = true; c.sfx('giuseppe'); c.caption('its over when i say its over'); }
          // his clones come out as well, even if the field is already full
          for (let i = 0; i < L; i++) c.summon(u.side, idx + 1, 'clonetoken', 2 * L, 2 * L);
        }
      }
    }
  },
  agartha: {
    name: 'agartha giuseppe', tier: 6, atk: 6, hp: 7, img: 'agartha.webp', bw: true, tags: ['nike'],
    text: L => `<b>start of battle:</b> rises from agartha, deal ${4 * L} damage to the enemy at the back. if his twin giuseppe creatore is on the team, both gain +${2 * L}/+${2 * L}`,
    on: {
      startBattle(c, u, L) {
        const enemies = c.team(c.other(u.side)).filter(e => !e.dead);
        const back = enemies[enemies.length - 1];
        c.sfx('giuseppe');
        if (back) { c.damage(back, 4 * L, u, 'agartha'); c.caption('agartha giuseppe spawns behind ' + back.name); }
        const twin = c.team(u.side).find(f => f.id === 'giuseppe' && !f.dead && !f.flags.respawned);
        if (twin) { c.buff(u, 2 * L, 2 * L); c.buff(twin, 2 * L, 2 * L); c.caption('hidden folder brother returns from tanzania'); }
      }
    }
  },
  john: {
    name: 'john tanner', tier: 6, atk: 6, hp: 6, img: 'john',
    text: L => `deals <b>double damage</b> to nike units. <b>end turn:</b> gain +${L} attack. ends the line`,
    on: {
      endTurn(s, u, L) { s.buff(u, L, 0); }
    }
  },
  boner: {
    name: 'boner twohn', tier: 6, atk: 5, hp: 6, img: 'boner',
    text: L => `<b>start of battle:</b> free fusion, absorb ${L} friend${L > 1 ? 's' : ''} behind him`,
    on: {
      startBattle(c, u, L) {
        for (let i = 0; i < L; i++) {
          const b = c.behindOf(u); if (!b) break;
          c.remove(b); c.buff(u, b.atk, b.hp);
        }
        c.caption('free fusion');
      }
    }
  },
  ceo3m: {
    name: '3m mafia ceo', tier: 6, atk: 5, hp: 6, img: 'ceo3m',
    text: L => `<b>start of battle:</b> all friends +${L} attack. intervenes with the problem`,
    on: {
      startBattle(c, u, L) { c.team(u.side).forEach(f => c.buff(f, L, 0)); }
    }
  },
  boschceo: {
    name: 'bosch mafia ceo', tier: 6, atk: 4, hp: 8, img: 'boschceo',
    text: L => `<b>hurt:</b> deal ${2 * L} damage to a random enemy. starts the problem`,
    on: {
      hurt(c, u, L) { const e = c.randomEnemy(u.side); if (e) c.damage(e, 2 * L, u, 'bosch'); }
    }
  },
  palex: {
    name: 'palexandros apadopoulous', tier: 6, atk: 7, hp: 5, img: 'palex',
    text: L => `<b>before attack:</b> gain +${L}/+${L}. i ame the danger`,
    on: {
      beforeAttack(c, u, L) { c.buff(u, L, L); }
    }
  },

  // ---------------- TOKENS (not in shop) ----------------
  clonetoken: {
    name: 'giuseppe n.', tier: 1, atk: 1, hp: 1, img: 'clone', tags: ['nike'], token: true,
    text: () => `one of 104`, on: {}
  },
  kenjitwin: {
    name: "kenji's twin", tier: 1, atk: 2, hp: 2, img: 'kenji', token: true,
    text: () => `exists, survives`, on: {}
  },
};

const ITEMS = {
  gif: { name: 'free 1 gif', tier: 1, icon: '🎁', text: 'give +1/+1', use(s, u) { s.buff(u, 1, 1); } },
  reebok: { name: 'reebok', tier: 1, icon: '💣', equip: true, text: 'equip: car bomb. when this faints, deal 4 damage to the front enemy' },
  tantum: { name: 'tantum verde', tier: 1, img: 'tantum.png', icon: '🧴', text: 'give +2 health', use(s, u) { s.buff(u, 0, 2); } },
  vhs: { name: 'vhs tape', tier: 2, icon: '📼', text: 'lore drop: +1 experience and +1/+1', use(s, u) { s.buff(u, 1, 1); s.addExp(u, 1); } },
  ghostgun: { name: '12 eur ghost gun', tier: 2, icon: '🔫', equip: true, text: 'equip: +3 damage on every attack' },
  petronas: { name: 'petronas suit', tier: 3, icon: '🏎️', equip: true, text: 'equip: take 2 less damage from every hit' },
  hacks: { name: '24 eur hacks', tier: 3, icon: '💶', text: 'give 2 random friends +1/+1', team: true, use(s) { s.randomFriends(null, 2).forEach(f => s.buff(f, 1, 1)); } },
  iliadbox: { name: 'iliadbox', tier: 4, icon: '📦', text: 'give +2/+2', use(s, u) { s.buff(u, 2, 2); } },
  chip: { name: 'vodafone chip', tier: 4, icon: '📡', equip: true, text: 'equip: start of battle, deal 3 damage to a random enemy' },
  negev: { name: 'negev', tier: 5, img: 'negev.png', fit: 'contain', icon: '☢️', equip: true, text: 'equip: attacks splash half damage onto the enemy behind' },
  vnegev: { name: 'vodafone essence negev', tier: 5, img: 'vnegev.webp', fit: 'contain', icon: '📶', equip: true, text: 'equip: heals 100% of the attack damage it deals. vodafone essence' },
  keys: { name: 'keys to the basement', tier: 5, icon: '🔑', equip: true, text: 'equip: survive the first lethal hit with 1 health' },
  v480: { name: '480v transformer', tier: 6, icon: '⚡', text: 'give +4/+4', use(s, u) { s.buff(u, 4, 4); } },
  chf850: { name: '850 chf form', tier: 6, icon: '🇨🇭', text: 'goes ssj: give ALL friends +2/+1', team: true, use(s) { s.allFriends().forEach(f => s.buff(f, 2, 1)); } },
};

const TEAM_NAMES = [
  'nike inc.', 'nfs mafia', 'vodafone mafia', 'MEO', 'marchdoor investigation bureau',
  '3m mafia', 'bosch mafia', 'continente loan sharks', 'giuseppe militia', 'iliad',
  'renault island', 'llays factory (defunct)', 'problem city', 'jeej claalc shop'
];

const CAPTIONS = {
  faint: ['{n} is died', '{n} got uninstalled', '{n} despawns LOL LOL LOL', 'uninstall life of {n}', '{n} is died (1 gif)', '{n} was trolled'],
  ko: ['{k} has 1 gif for {n}', '{k} uninstalls {n}', '{k} nikes {n}', '{k} trolls {n}'],
  start: ['wait a bit', 'free fight soon renault island™', 'top 10 anime fights of all time space continuum', 'unlimited giuseppe works', 'rac netflix award ??', 'no problem'],
  win: ['end of the line', 'no problem', 'LOL LOL LOL', 'he just trolls', 'free win'],
  lose: ['and you cry', 'i cant', 'and you cry', 'rest in piss', 'no problem miscalculates the problem'],
  draw: ['wait a bit', 'or did he??', 'mystery mysteried', 'untied ends'],
};
