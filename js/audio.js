// ============================================================
//  Sound. Drop files in assets/sfx/<name>.mp3 (or .ogg/.wav) to
//  replace any synth sound. Music: assets/music/shop.mp3, battle.mp3
// ============================================================
const SFX_NAMES = ['buy', 'sell', 'roll', 'merge', 'levelup', 'hit', 'faint', 'nuke', 'start', 'win', 'lose', 'giuseppe', 'freeze', 'click', 'item'];

const Audio2 = {
  ctx: null, files: {}, duck: 1, mus: 1, muted: false, volume: 0.6, level: 100, prevLevel: 100, music: null, musicName: null,
  // volume is a level from 0 to 100 (saved). internal gain = 0.6 * level / 100
  init() {
    let l = 100;
    try { const v = localStorage.getItem('np_vol'); if (v !== null && !isNaN(+v)) l = Math.max(0, Math.min(100, +v)); } catch (e) {}
    this.applyLevel(l);
    for (const n of SFX_NAMES) this.probe('assets/sfx/' + n, a => { this.files[n] = a; });
  },
  probe(base, ok) {
    const exts = ['mp3', 'ogg', 'wav'];
    const tryExt = i => {
      if (i >= exts.length) return;
      const a = new Audio(); a.preload = 'auto';
      a.addEventListener('canplaythrough', () => ok(a), { once: true });
      a.addEventListener('error', () => tryExt(i + 1), { once: true });
      a.src = base + '.' + exts[i];
    };
    tryExt(0);
  },
  ac() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol * this.volume * this.duck, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, delay = 0, lp = 2000) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = ac.createGain(); g.gain.value = vol * this.volume * this.duck;
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  },
  play(n) {
    if (this.muted) return;
    if (this.files[n]) { const a = this.files[n].cloneNode(); a.volume = this.volume * this.duck; a.play().catch(() => {}); return; }
    switch (n) {
      case 'buy': this.tone(520, .08); this.tone(780, .1, 'square', .15, 0, .07); break;
      case 'sell': this.tone(700, .07, 'triangle'); this.tone(1050, .12, 'triangle', .15, 0, .06); this.tone(1400, .15, 'triangle', .1, 0, .12); break;
      case 'roll': this.noise(.12, .12, 0, 4000); this.tone(300, .1, 'sawtooth', .06, 300); break;
      case 'merge': [440, 554, 659].forEach((f, i) => this.tone(f, .12, 'square', .12, 0, i * .06)); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .16, 'square', .14, 0, i * .08)); break;
      case 'hit': this.noise(.09, .3, 0, 1200); this.tone(160, .1, 'sawtooth', .12, -100); break;
      case 'faint': this.tone(400, .35, 'sawtooth', .12, -340); break;
      case 'nuke': this.noise(.9, .45, 0, 600); this.tone(90, .9, 'sawtooth', .2, -60); break;
      case 'start': this.tone(220, .1, 'square', .12); this.tone(220, .1, 'square', .12, 0, .15); this.tone(440, .25, 'square', .14, 0, .3); break;
      case 'win': [523, 659, 784, 659, 1046].forEach((f, i) => this.tone(f, .2, 'square', .14, 0, i * .12)); break;
      case 'lose': [392, 370, 349, 262].forEach((f, i) => this.tone(f, .3, 'triangle', .16, 0, i * .22)); break;
      case 'giuseppe': [196, 233, 262, 311, 294].forEach((f, i) => this.tone(f, .22, 'sawtooth', .1, 0, i * .14)); break;
      case 'freeze': this.tone(1800, .12, 'sine', .1, -600); break;
      case 'item': this.tone(880, .06, 'triangle'); this.tone(1320, .12, 'triangle', .12, 0, .05); break;
      default: this.tone(600, .04, 'square', .08);
    }
  },
  playMusic(name) {
    if (this.musicName === name) return;
    this.songPath = null;
    this.musicName = name; this.mus = 1; clearInterval(this.musT);
    if (this.music) { this.music.pause(); this.music = null; }
    this.probe('assets/music/' + name, a => {
      if (this.musicName !== name) return;
      a.loop = true; a.volume = this.volume * 0.5 * this.duck * this.mus; this.music = a;
      this.tryPlayMusic();
    });
  },
  applyLevel(l) {
    this.level = Math.max(0, Math.min(100, Math.round(l)));
    this.volume = 0.6 * this.level / 100;
    this.muted = this.level === 0;
    if (this.music) { this.music.volume = this.volume * 0.5 * this.duck * this.mus; if (this.muted) this.music.pause(); else if (this.music.paused) this.tryPlayMusic(); }
    if (this.active) this.active.forEach(a => { a.volume = this.volume * this.duck; });
    if (this.muted && this.stopSfx) this.stopSfx();
  },
  setLevel(l) {
    if (this.level > 0) this.prevLevel = this.level;
    this.applyLevel(l);
    try { localStorage.setItem('np_vol', String(this.level)); } catch (e) {}
    return this.level;
  },
  // PC: the speaker button mutes / restores. Phones: it steps 100 > 75 > 50 > 25 > 0 > 100.
  toggleMute() { return this.setLevel(this.level > 0 ? 0 : (this.prevLevel || 100)); },
  cycleLevel() { const next = [100, 75, 50, 25, 0].find(v => v < this.level); return this.setLevel(next === undefined ? 100 : next); }
};

// ---------------- songs, playlists and stacking sound files ----------------
const encodePath = p => p.split('/').map(encodeURIComponent).join('/');
function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// a playlist is { list, i }: songs play in order and never repeat until all have played
function newPlaylist() { return { list: shuffled(MANIFEST.songs), i: 0 }; }
function nextSong(pl) {
  if (!pl.list.length) return null;
  if (pl.i >= pl.list.length) { pl.list = shuffled(pl.list); pl.i = 0; }
  return pl.list[pl.i++];
}

Object.assign(Audio2, {
  active: new Set(), exclusiveUntil: 0, songPath: null,
  playSong(path, loop = true) {
    if (!path || this.songPath === path) return;
    this.mus = 1; clearInterval(this.musT); this.songPath = path; this.musicName = null; this.songT0 = Date.now();
    if (this.music) { this.music.pause(); this.music = null; }
    const a = new Audio(encodePath(path));
    a.loop = loop; a.volume = this.volume * 0.5 * this.duck * this.mus; this.music = a;
    this.tryPlayMusic();
  },
  // browsers refuse to play sound before the first tap/click on the page.
  // If that happens, wait for the first interaction and start the music then.
  tryPlayMusic() {
    const a = this.music;
    if (!a || this.muted) return;
    const p = a.play();
    if (p && p.catch) p.catch(() => this.armMusicUnlock());
  },
  armMusicUnlock() {
    if (this.unlockArmed) return;
    this.unlockArmed = true;
    const evs = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
    const go = () => {
      this.unlockArmed = false;
      evs.forEach(e => document.removeEventListener(e, go, true));
      this.ac();
      const a = this.music;
      if (a && !this.muted && a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => this.armMusicUnlock()); }
    };
    evs.forEach(e => document.addEventListener(e, go, true));
  },
  // where the current song is (seconds), and how long it is. Used to sync the sudden death video and battle.
  songLen() { const d = this.music && this.music.duration; return isFinite(d) && d > 1 ? d : 58.71; },
  songPos() {
    const m = this.music;
    if (m && !m.paused && m.currentTime > 0) return m.currentTime % this.songLen();
    return ((Date.now() - (this.songT0 || Date.now())) / 1000) % this.songLen();   // song not audible (muted): use the clock
  },
  stopMusic() { if (this.music) { this.music.pause(); this.music = null; } this.songPath = null; this.musicName = null; },
  // play a sound file; sounds stack unless one marked exclusive is playing
  playFile(path, { exclusive = false, force = false } = {}) {
    if (this.muted || !path) return null;
    if (!force && this.exclusive) return null;
    const a = new Audio(encodePath(path));
    a.volume = this.volume * this.duck;
    this.active.add(a);
    const done = () => { this.active.delete(a); if (this.exclusive === a) this.exclusive = null; };
    a.addEventListener('ended', done); a.addEventListener('error', done);
    if (exclusive) this.exclusive = a;
    a.play().catch(done);
    return a;
  },
  sfxDone(maxMs = 15000) {
    return new Promise(res => {
      const t0 = Date.now();
      const check = () => { if (!this.active.size || Date.now() - t0 > maxMs) res(); else setTimeout(check, 100); };
      check();
    });
  },
  // cutscene ducking: everything else fades to `to` (1 = normal, 0.15 = 85% quieter) over `ms`
  setDuck(to, ms) {
    clearInterval(this.duckT);
    const from = this.duck, t0 = Date.now();
    const step = () => {
      const k = ms <= 0 ? 1 : Math.min(1, (Date.now() - t0) / ms);
      this.duck = from + (to - from) * k;
      if (this.music) this.music.volume = this.volume * 0.5 * this.duck * this.mus;
      this.active.forEach(a => { a.volume = this.volume * this.duck; });
      if (k >= 1) clearInterval(this.duckT);
    };
    step(); if (ms > 0) this.duckT = setInterval(step, 30);
  },
  // the music alone fades to `to` (0 = silent) over `ms`, for special sounds that need the stage to themselves
  fadeMusic(to, ms) {
    clearInterval(this.musT);
    const from = this.mus, t0 = Date.now();
    const step = () => {
      const k = ms > 0 ? Math.min(1, (Date.now() - t0) / ms) : 1;
      this.mus = from + (to - from) * k;
      if (this.music) this.music.volume = this.volume * 0.5 * this.duck * this.mus;
      if (k >= 1) clearInterval(this.musT);
    };
    step(); if (ms > 0) this.musT = setInterval(step, 30);
  },
  stopSfx() { this.active.forEach(a => a.pause()); this.active.clear(); this.exclusive = null; },
});
