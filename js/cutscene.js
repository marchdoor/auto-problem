// ============================================================
//  Cutscenes: a little picture-in-picture video player.
//  When john tanner and the vodafone ceo meet front to front, the player turns on like an
//  old TV, every other sound drops by 85%, and the battle is timed so the loser
//  dies as the video ends. Then the player turns off (white line, then gone) and the sound
//  fades back. The videos live in assets/cutscenes. To add one, add an entry here and an
//  achievement in achievements.js (with a `video` key).
// ============================================================
const CUTSCENES = {
  johnwin: { src: 'assets/cutscenes/johnvsvodafoneceo_johnwin.mp4', dur: 8.65, ach: 'cut_john', title: 'john tanner vs woto tolff' },
  vodafonewin: { src: 'assets/cutscenes/johnvsvodafoneceo_vodafonewin.mp4', dur: 8.65, ach: 'cut_vodafone', title: 'woto tolff vs john tanner' },
};
CUTSCENES.sudden = { src: 'assets/cutscenes/suddendeathvideo.mp4', dur: 58.7, ach: 'sudden', title: 'sudden death' };
CUTSCENES.suddenlast = { src: 'assets/cutscenes/suddendeathlastdeathsfxVIDEO.mp4', dur: 10.4, ach: 'suddenlast', title: 'last death' };
CUTSCENES.giuseppekill = { src: 'assets/cutscenes/giuseppe124killsvodafoneceoorgavincollins.mp4', dur: 5.5, ach: 'cut_giuseppe', title: 'giuseppe vs the rat' };
CUTSCENES.noyes3 = { src: 'assets/cutscenes/noyesproblem3killsplus.mp4', dur: 24.6, ach: 'cut_noyes', title: 'no problem / yes problem' };
CUTSCENES.bondokill = { src: 'assets/cutscenes/bondo2killsgiuseppe1.mp4', dur: 7.3, ach: 'cut_bondo', title: 'bondo vs giuseppe' };
CUTSCENES.funnydraw = { src: 'assets/cutscenes/funnyheimerkillseveryone2plus.mp4', dur: 8.8, ach: 'cut_funny', title: 'free sacrifice' };
CUTSCENES.crososdies = { src: 'assets/cutscenes/crososdiestoanygiuseppe.mp4', dur: 6.2, ach: 'cut_crosos', title: 'crosos vs giuseppe' };
CUTSCENES.rebookboom = { src: 'assets/cutscenes/rebookexplosiondeaths.mp4', dur: 9.65, ach: 'cut_rebook', title: 'rebook explosion' };
CUTSCENES.g44venom = { src: 'assets/cutscenes/giuseppe44killsbarbievenom.mp4', dur: 6.7, ach: 'cut_g44', title: 'giuseppe 44 vs barbie venom' };
CUTSCENES.clone84 = { src: 'assets/cutscenes/giuseppeclonen84killedbyjannertohn.mp4', dur: 5.7, ach: 'cut_clone84', title: 'giuseppe n.84' };
CUTSCENES.johnjannerebook = { src: 'assets/cutscenes/johnjannerebook.mp4', dur: 6.18, ach: 'cut_johnjanner', title: 'john, janner and the rebook' };
CUTSCENES.noprobjohn = { src: 'assets/cutscenes/noproblemkillsjohntanner.mp4', dur: 10.2, ach: 'cut_noprobjohn', title: 'no problem vs john tanner' };
// videos that may not be in assets/cutscenes yet. They are probed at load: a missing file is simply never planned,
// and a present one gets its real length from the file, so nothing has to be edited when a video is added.
const PENDING_CUTS = {
  johnfree: ['johntannerfreeedit.mp4', 'cut_johnfree', 'john tanner free edit'],
  john71: ['johntannerkillsclonenumber71.mp4', 'cut_john71', 'john tanner vs giuseppe n.71'],
  noyes5: ['noproblem5killsplus.mp4', 'cut_noyes5', 'no problem / yes problem (5+)'],
  crososdarius: ['crososkillsdarius.mp4', 'cut_crososdarius', 'crosos vs secretary darius'],
  kenjinuke: ['kenjiwithrebooknuke.mp4', 'cut_kenjinuke', 'kenji and the rebook nuke'],
  nfsg44: ['nfsmafiakillsgiuseppe44.mp4', 'cut_nfsg44', 'nfs mafia vs giuseppe 44'],
  wotocall: ['vodafoneceocallused.mp4', 'cut_wotocall', 'the vodafone call'],
  johnsoon: ['johndiessoon.mp4', 'cut_johnsoon', 'john dies soon'],
  funnynegev: ['funnyheimerdestroysnegev.mp4', 'cut_funnyneg', 'funnyheimer deletes the negev'],
  venomnegev: ['venomdestroysnegev.mp4', 'cut_venomneg', 'venom deletes the negev'],
};
Object.entries(PENDING_CUTS).forEach(([k, [f, ach, title]]) => {
  const c = CUTSCENES[k] = { src: 'assets/cutscenes/' + f, dur: 6, ach, title, pending: true, ok: false };
  // these two run over the whole battle: funnyheimer's has no song (death sounds stay, quieter), venom's keeps the battle music and sounds, quieter
  if (k === 'funnynegev') { c.noMusic = true; c.duck = 0.3; }
  if (k === 'venomnegev') { c.duck = 0.35; }
  try {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    v.addEventListener('loadedmetadata', () => { if (v.duration && isFinite(v.duration)) { c.dur = v.duration; c.ok = true; } });
    v.addEventListener('error', () => { c.ok = false; });
    v.src = c.src;
  } catch (e) {}
});
const DUCK_LEVEL = 0.15;   // other sounds keep 15% (85% quieter) while the video plays

const CUT = {
  el: null, v: null, active: false, key: null, closing: null,

  // A cutscene may only play once per run (or online game). Dev mode can turn that off.
  played(key) { return !(typeof DEV !== 'undefined' && DEV.on && DEV.cutRepeat) && !!(S && S.cutsSeen && S.cutsSeen[key]); },
  markSeen(key) { if (S) { (S.cutsSeen = S.cutsSeen || {})[key] = true; try { saveRun(); } catch (e) {} } },

  // Looks through a finished battle for moments that have a cutscene. Returns a list of
  // { k, d, key }: k = frame where the video starts, d = frame where it ends (a death).
  // The battle is stretched between them so the video ends right as that death happens.
  plan(frames) {
    const out = [];
    const idOf = {}, nameOf = {};
    frames.forEach(f => f.A.concat(f.B).forEach(u => { idOf[u.uid] = u.id; nameOf[u.uid] = u.name; }));
    const attackFrame = (uid, d) => { for (let j = d; j >= 0; j--) if (frames[j].fx.some(x => x.type === 'attack' && x.uid === uid)) return j; return d; };
    const firstAttack = (uid, d) => { for (let j = 0; j <= d; j++) if (frames[j].fx.some(x => x.type === 'attack' && x.uid === uid)) return j; return d; };
    const rosterHas = (side, ids, d) => ids.every(id => { for (let j = 0; j <= d; j++) if ((side === 'A' ? frames[j].A : frames[j].B).some(u => u.id === id)) return true; return false; });
    const add = (c) => { if (c && !this.played(c.key) && !(CUTSCENES[c.key].pending && !CUTSCENES[c.key].ok) && !out.some(o => o.key === c.key)) out.push(c); };

    // 1. john tanner vs the vodafone ceo, front to front: the one who dies decides the video
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const atk = f.fx.filter(x => x.type === 'attack').map(x => x.uid);
      if (atk.length < 2) continue;
      const j = f.A.concat(f.B).find(u => atk.includes(u.uid) && u.id === 'john');
      const v = f.A.concat(f.B).find(u => atk.includes(u.uid) && isCeo(u));
      if (!j || !v || (f.A.includes(j) === f.A.includes(v))) continue;
      for (let d = i; d < frames.length; d++) {
        const dead = frames[d].fx.filter(x => x.type === 'faint').map(x => x.uid);
        const jd = dead.includes(j.uid), vd = dead.includes(v.uid);
        if (jd || vd) { if (!(jd && vd)) add({ k: i, d, key: vd ? 'johnwin' : 'vodafonewin' }); break; }
      }
      break;
    }
    // 2. giuseppe 1, 2 or 4 kills gavin collins or the vodafone ceo, with both of them on that team
    // 3. bondo 2, bondo 2 prime or cigga nover kills giuseppe 1
    // 4. no problem or yes problem gets 3 or more kills: the video starts when they start attacking and ends at their last kill
    const killCount = {}, johnKills = {};
    for (let d = 0; d < frames.length; d++) {
      for (const x of frames[d].fx) {
        if (x.type !== 'faint' || !x.killerId) continue;
        const victim = idOf[x.uid];
        if (['giuseppe', 'g2', 'giuseppe4'].includes(x.killerId) && ['gavin', 'vodafone', 'vodafoneprime'].includes(victim) && (rosterHas(x.side, ['gavin', 'vodafone'], d) || rosterHas(x.side, ['gavin', 'vodafoneprime'], d)))
          add({ k: attackFrame(x.killerUid, d), d, key: 'giuseppekill' });
        if (['bondo2', 'bondo2prime', 'ciggan'].includes(x.killerId) && victim === 'giuseppe')
          add({ k: attackFrame(x.killerUid, d), d, key: 'bondokill' });
        // john tanner kills 3 or more: the video starts on his first attack and ends with his last kill
        if (x.killerId === 'john') {
          const jk = (johnKills[x.killerUid] = (johnKills[x.killerUid] || 0) + 1);
          if (jk >= 3) {
            const ex = out.find(o => o.key === 'johnfree' && o.uid === x.killerUid);
            if (ex) ex.d = d; else add({ k: firstAttack(x.killerUid, d), d, key: 'johnfree', uid: x.killerUid, pri: 2 });
          }
        }
        if (['noproblem', 'yesproblem'].includes(x.killerId)) {
          const kc = (killCount[x.killerUid] = (killCount[x.killerUid] || 0) + 1);
          if (kc >= 5) add({ k: 0, d: 0, key: 'noyes5', uid: x.killerUid, pri: 99 });   // plays at the start of the battle
          if (kc >= 3) {   // 3, 4, 5... kills: the video runs until the last of them
            const ex = out.find(o => o.key === 'noyes3' && o.uid === x.killerUid);
            if (ex) ex.d = d; else add({ k: firstAttack(x.killerUid, d), d, key: 'noyes3', uid: x.killerUid });
          }
        }
      }
    }
    const isG = id => !!(UNITS[id] && /giuseppe/i.test(UNITS[id].name));
    const last = frames[frames.length - 1];
    const draw = !!last && !last.A.some(u => !u.dead) && !last.B.some(u => !u.dead);
    let lastFaint = -1; frames.forEach((f, j) => { if (f.fx.some(x => x.type === 'faint')) lastFaint = j; });
    const funny = {};   // dr. funnyheimer: his kills and where he fell
    for (let d = 0; d < frames.length; d++) {
      for (const x of frames[d].fx) {
        if (x.type !== 'faint') continue;
        const victim = idOf[x.uid];
        // 5. sgt. crosos dies to any giuseppe (clones too)
        if (victim === 'crosos' && x.killerId && isG(x.killerId)) add({ k: attackFrame(x.killerUid, d), d, key: 'crososdies' });
        // 6. giuseppe n.44 kills barbie venom
        if (victim === 'venom' && x.killerId === 'g44') add({ k: attackFrame(x.killerUid, d), d, key: 'g44venom' });
        // john tanner kills giuseppe n.71
        if (x.killerId === 'john' && nameOf[x.uid] === 'giuseppe n.71') add({ k: attackFrame(x.killerUid, d), d, key: 'john71', pri: 3 });
        // sgt. crosos kills secretary darius
        if (victim === 'darius' && x.killerId === 'crosos') add({ k: attackFrame(x.killerUid, d), d, key: 'crososdarius', pri: 2 });
        // a member of the nfs mafia kills giuseppe n°44: the video runs on his death turn
        if (victim === 'g44' && ['troop', 'nfsvp'].includes(x.killerId)) add({ k: attackFrame(x.killerUid, d), d, key: 'nfsg44', pri: 2 });
        // john tanner is going to die to a nike inc unit: played at the start of the battle
        if (victim === 'john' && x.killerId && ((UNITS[x.killerId] || {}).tags || []).includes('nike')) add({ k: 0, d: 0, key: 'johnsoon', pri: 40 });
        // 7. janner tohn kills giuseppe n.84 (a numbered clone)
        if (x.killerId === 'janner' && nameOf[x.uid] === 'giuseppe n.84') add({ k: attackFrame(x.killerUid, d), d, key: 'clone84', pri: 3 });
        // 8. no problem kills john tanner: the video starts the turn before
        if (victim === 'john' && x.killerId === 'noproblem') {
          const a = attackFrame(x.killerUid, d);
          let k = a; for (let j = a - 1; j >= 0; j--) if (frames[j].fx.some(y => y.type === 'attack')) { k = j; break; }
          add({ k, d, key: 'noprobjohn' });
        }
        if (victim === 'funny') (funny[x.uid] = funny[x.uid] || { kills: 0, lastKill: -1 }).fell = d;
        if (x.killerId === 'funny') { const e = (funny[x.killerUid] = funny[x.killerUid] || { kills: 0, lastKill: -1 }); e.kills++; e.lastKill = d; }
      }
    }
    // 9. dr. funnyheimer nukes at least 2 others (and falls himself) and the battle ends in a draw
    for (const uid in funny) {
      const e = funny[uid];
      if (draw && e.fell != null && e.kills >= 2 && e.lastKill === lastFaint)
        add({ k: Math.min(e.fell, attackFrame(+uid, e.fell)), d: lastFaint, key: 'funnydraw', pri: 2 });
    }
    // rebook bombs: one that kills somebody gets a video that ends at the explosion. If john tanner and
    // janner tohn are on the bomber's team, that video plays right after it explodes instead.
    frames.forEach((f, b) => f.fx.forEach(x => {
      if (x.type !== 'bomb') return;
      // lt. kenji's rebook nuke is going to kill no problem or yes problem: played at the start of the battle (instead of the plain rebook video)
      if (idOf[x.owner] === 'kenji') {
        let kd = -1;
        for (let j = b; j < frames.length; j++) {
          if (j > b && frames[j].fx.some(y => y.type === 'attack')) break;
          if (frames[j].fx.some(y => y.type === 'faint' && y.killerUid === x.owner && ['noproblem', 'yesproblem'].includes(idOf[y.uid]))) { kd = j; break; }
        }
        if (kd >= 0) { add({ k: 0, d: 0, key: 'kenjinuke', pri: 50 }); return; }
      }
      const mine = f[x.ownerSide] || [];
      const both = ['john', 'janner'].every(id => mine.some(u => u.id === id && !u.dead));
      if (both && !this.played('johnjannerebook')) { add({ k: b, d: b, key: 'johnjannerebook', after: true, pri: 3 }); return; }
      let d = -1;
      for (let j = b; j < frames.length; j++) {
        if (j > b && frames[j].fx.some(y => y.type === 'attack')) break;
        if (frames[j].fx.some(y => y.type === 'faint' && y.killerUid === x.owner)) { d = j; break; }
      }
      if (d < 0) return;
      let plant = 0; for (let j = 0; j <= b; j++) if (frames[j].fx.some(y => y.type === 'plant' && y.owner === x.owner)) { plant = j; break; }
      add({ k: Math.max(plant, d - 14), d, key: 'rebookboom' });
    }));

    // vodafone call goes off with the vodafone ceo on the field: played right after it happens
    // funnyheimer / venom delete the negev: the video plays over the whole battle, start to end
    frames.forEach((f, i) => f.fx.forEach(x => {
      if (x.type === 'vcallceo') add({ k: i, d: i, key: 'wotocall', after: true, pri: 4 });
      if (x.type === 'negevban') add({ k: 0, d: frames.length - 1, key: x.who === 'funny' ? 'funnynegev' : 'venomnegev', pri: 30 });
    }));
    // the 5+ kills video replaces the 3+ one for the same unit
    out.forEach((o, i) => { if (o.key === 'noyes3' && out.some(p => p.key === 'noyes5' && p.uid === o.uid)) out.splice(i, 1); });

    // one video at a time: rarer ones first (then earliest first), and skip any that would overlap
    out.sort((a, b) => (b.pri || 0) - (a.pri || 0) || a.k - b.k);
    const res = [];
    for (const c of out) if (!res.some(r => !(c.d < r.k || c.k > r.d))) res.push(c);
    res.sort((a, b) => a.k - b.k);
    return res;
  },

  // turns the player on. big = centred and larger (watching it again from the achievements page)
  open(key, big, noAch) {
    this.close(true);
    const c = CUTSCENES[key]; if (!c) return null;
    const el = document.createElement('div');
    el.className = 'pip opening' + (big ? ' big' : '');
    el.innerHTML = `<div class="pip-screen"><video playsinline preload="auto"></video><div class="pip-scan"></div><div class="pip-white"></div></div>
      <div class="pip-bar"><i class="rec"></i><span>${c.title}</span>${big ? '<button class="pip-x">✕</button>' : ''}</div>`;
    document.getElementById('app').appendChild(el);
    const v = el.querySelector('video');
    v.src = c.src;
    v.volume = Math.min(1, Audio2.volume / 0.6);
    v.muted = Audio2.muted;
    this.el = el; this.v = v; this.active = true; this.key = key; this.seen = false; this.noAch = !!noAch;
    Audio2.setDuck(c.duck || DUCK_LEVEL, 220);
    if (c.noMusic) Audio2.stopMusic();
    const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); });
    v.addEventListener('playing', () => { this.seen = true; }, { once: true });
    if (big) { el.classList.add('interactive'); el.querySelector('.pip-x').onclick = () => this.close(); v.addEventListener('ended', () => this.close(), { once: true }); }
    return v;
  },

  // turns the player off: a white flash while it collapses to a line, then it disappears.
  // fast = no animation (skipping the battle)
  close(fast) {
    const el = this.el; if (!el) return;
    const v = this.v, key = this.key, seen = this.seen && !this.noAch; this.noAch = false;
    this.el = null; this.v = null; this.active = false; this.lastOn = false;
    if (this.sd) { clearInterval(this.sd.timer); this.sd = null; }
    Audio2.setDuck(1, fast ? 150 : 1100);
    if (seen && key) ACH.unlock(CUTSCENES[key].ach);
    if (fast) { try { v.pause(); } catch (e) {} el.remove(); return; }
    el.classList.remove('opening'); el.classList.add('closing');
    // the video's sound fades out while the picture collapses
    const t0 = Date.now(), v0 = v.volume;
    const fade = setInterval(() => { const k = Math.min(1, (Date.now() - t0) / 500); try { v.volume = v0 * (1 - k); } catch (e) {} if (k >= 1) { clearInterval(fade); try { v.pause(); } catch (e) {} } }, 40);
    setTimeout(() => el.remove(), 760);
  },

  // ---- sudden death (online): the video plays muted, kept in step with the song ----
  sd: null,
  openSudden() {
    this.close(true);
    const c = CUTSCENES.sudden;
    const el = document.createElement('div');
    el.className = 'pip opening sd';
    el.innerHTML = `<div class="pip-screen"><video playsinline preload="auto" loop muted></video><div class="pip-scan"></div><div class="pip-white"></div></div>
      <div class="pip-bar"><i class="rec"></i><span>${c.title}</span></div>`;
    document.getElementById('app').appendChild(el);
    const v = el.querySelector('video');
    v.muted = true; v.src = c.src;
    this.el = el; this.v = v; this.active = true; this.key = 'sudden'; this.seen = false;
    const sync = (force) => {
      if (!v.duration) return;
      const want = Audio2.songPos() % v.duration, diff = Math.abs(v.currentTime - want);
      if ((force || diff > 0.3) && diff < v.duration - 0.3) v.currentTime = want;
    };
    v.addEventListener('loadedmetadata', () => { sync(true); v.play().catch(() => {}); }, { once: true });
    v.play().catch(() => {});
    v.addEventListener('playing', () => { this.seen = true; }, { once: true });
    this.sd = { timer: setInterval(() => sync(false), 400) };
    // have the last death video ready
    this.preLast = document.createElement('video'); this.preLast.preload = 'auto'; this.preLast.src = CUTSCENES.suddenlast.src;
  },
  // the battle is over: the picture changes to the last death video (with its own sound), then the player turns off
  lastDeath() {
    if (!this.sd || !this.el) return false;
    clearInterval(this.sd.timer); this.sd = null;
    const v = this.v, c = CUTSCENES.suddenlast;
    v.loop = false; v.src = c.src; v.muted = Audio2.muted; v.volume = Math.min(1, Audio2.volume / 0.6);
    this.el.querySelector('.pip-bar span').textContent = c.title;
    this.key = 'suddenlast'; this.seen = false; this.lastOn = true;
    v.addEventListener('playing', () => { this.seen = true; }, { once: true });
    v.play().catch(() => {});
    v.addEventListener('ended', () => { if (this.v === v) this.close(); }, { once: true });
    setTimeout(() => { if (this.v === v) this.close(); }, (c.dur + 2) * 1000);   // never get stuck
    return true;
  },

  watch(key) { ACH.stop(); this.open(key, true); },

  // waits for ms, but stops waiting early if the battle is skipped
  wait(ms) {
    return new Promise(res => {
      const t0 = Date.now();
      const tick = () => { if (skipping || Date.now() - t0 >= ms) res(); else setTimeout(tick, Math.min(80, ms - (Date.now() - t0))); };
      tick();
    });
  },
};
