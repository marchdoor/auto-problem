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
    const idOf = {};
    frames.forEach(f => f.A.concat(f.B).forEach(u => { idOf[u.uid] = u.id; }));
    const attackFrame = (uid, d) => { for (let j = d; j >= 0; j--) if (frames[j].fx.some(x => x.type === 'attack' && x.uid === uid)) return j; return d; };
    const firstAttack = (uid, d) => { for (let j = 0; j <= d; j++) if (frames[j].fx.some(x => x.type === 'attack' && x.uid === uid)) return j; return d; };
    const rosterHas = (side, ids, d) => ids.every(id => { for (let j = 0; j <= d; j++) if ((side === 'A' ? frames[j].A : frames[j].B).some(u => u.id === id)) return true; return false; });
    const add = (c) => { if (c && !this.played(c.key) && !out.some(o => o.key === c.key)) out.push(c); };

    // 1. john tanner vs the vodafone ceo, front to front: the one who dies decides the video
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const atk = f.fx.filter(x => x.type === 'attack').map(x => x.uid);
      if (atk.length < 2) continue;
      const j = f.A.concat(f.B).find(u => atk.includes(u.uid) && u.id === 'john');
      const v = f.A.concat(f.B).find(u => atk.includes(u.uid) && u.id === 'vodafone');
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
    // 4. no problem or yes problem gets their 3rd kill: the video starts when they start attacking
    const killCount = {};
    for (let d = 0; d < frames.length; d++) {
      for (const x of frames[d].fx) {
        if (x.type !== 'faint' || !x.killerId) continue;
        const victim = idOf[x.uid];
        if (['giuseppe', 'g2', 'giuseppe4'].includes(x.killerId) && ['gavin', 'vodafone'].includes(victim) && rosterHas(x.side, ['gavin', 'vodafone'], d))
          add({ k: attackFrame(x.killerUid, d), d, key: 'giuseppekill' });
        if (['bondo2', 'bondo2prime', 'ciggan'].includes(x.killerId) && victim === 'giuseppe')
          add({ k: attackFrame(x.killerUid, d), d, key: 'bondokill' });
        if (['noproblem', 'yesproblem'].includes(x.killerId)) {
          killCount[x.killerUid] = (killCount[x.killerUid] || 0) + 1;
          if (killCount[x.killerUid] === 3) add({ k: firstAttack(x.killerUid, d), d, key: 'noyes3' });
        }
      }
    }
    // one video at a time: earliest first, and skip any that would overlap
    out.sort((a, b) => a.k - b.k);
    const res = []; let until = -1;
    for (const c of out) if (c.k > until) { res.push(c); until = c.d; }
    return res;
  },

  // turns the player on. big = centred and larger (watching it again from the achievements page)
  open(key, big) {
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
    this.el = el; this.v = v; this.active = true; this.key = key; this.seen = false;
    Audio2.setDuck(DUCK_LEVEL, 220);
    const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); });
    v.addEventListener('playing', () => { this.seen = true; }, { once: true });
    if (big) { el.classList.add('interactive'); el.querySelector('.pip-x').onclick = () => this.close(); v.addEventListener('ended', () => this.close(), { once: true }); }
    return v;
  },

  // turns the player off: a white flash while it collapses to a line, then it disappears.
  // fast = no animation (skipping the battle)
  close(fast) {
    const el = this.el; if (!el) return;
    const v = this.v, key = this.key, seen = this.seen;
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
