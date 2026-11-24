// ============================================================
//  Online chat. Messages go through the host (everyone is connected to the host).
//  - profile pictures come from the player name (see profileFor)
//  - achievements unlock chat looks (bubble colours, name effects, text effects)
//  - a player can send a cutscene they have unlocked: only its key travels, the video plays
//    from the receiver's own files (and does not unlock anything for them)
// ============================================================
const REWARDS = [
  // bubble colours
  { id: 'b-ember', type: 'bubble', name: 'ember bubble', ach: 'comeback', col: '#ff7a1a' },
  { id: 'b-ocean', type: 'bubble', name: 'ocean bubble', ach: 'landslide', col: '#2a8bff' },
  { id: 'b-gold', type: 'bubble', name: 'gold bubble', ach: 'themes_win', col: '#ffd34d' },
  { id: 'b-violet', type: 'bubble', name: 'violet bubble', ach: 'themes_lose', col: '#9b5cff' },
  { id: 'b-snow', type: 'bubble', name: 'snow bubble', ach: 'tenwins', col: '#dfe9f5' },
  { id: 'b-blood', type: 'bubble', name: 'vodafone red bubble', ach: 'cut_vodafone', col: '#e60000' },
  { id: 'b-toxic', type: 'bubble', name: 'toxic bubble', ach: 'cut_bondo', col: '#43e04f' },
  { id: 'b-boom', type: 'bubble', name: 'rebook bubble', ach: 'cut_rebook', col: '#ffb300' },
  { id: 'b-jahn', type: 'bubble', name: 'jahn tonner bubble', ach: 'jahntonner', col: '#00e5ff' },
  { id: 'b-friend', type: 'bubble', name: 'friendly bubble', ach: 'firstfriend', col: '#ff6fb5' },
  // name effects
  { id: 'n-rainbow', type: 'name', name: 'rainbow name', ach: 'rare' },
  { id: 'n-glitch', type: 'name', name: 'glitch name', ach: 'sudden' },
  { id: 'n-fire', type: 'name', name: 'fire name', ach: 'suddenlast' },
  { id: 'n-electric', type: 'name', name: 'electric name', ach: 'negev' },
  { id: 'n-gold', type: 'name', name: 'golden name', ach: 'cut_giuseppe' },
  { id: 'n-pulse', type: 'name', name: 'nuke pulse name', ach: 'cut_funny' },
  { id: 'n-neon', type: 'name', name: 'neon name', ach: 'flawless' },
  { id: 'n-ghost', type: 'name', name: 'ghost name', ach: 'ghost' },
  { id: 'n-crown', type: 'name', name: 'crown name', ach: 'beatfriend' },
  // text effects
  { id: 't-wave', type: 'text', name: 'wavy text', ach: 'cut_john' },
  { id: 't-shake', type: 'text', name: 'shaky text', ach: 'noproblem' },
  { id: 't-shadow', type: 'text', name: 'shadow text', ach: 'cut_noyes' },
  { id: 't-glow', type: 'text', name: 'glowing text', ach: 'cut_crosos' },
  { id: 't-caps', type: 'text', name: 'loud text', ach: 'cut_g44' },
  { id: 't-bold', type: 'text', name: 'bold italic text', ach: 'cut_johnjanner' },
  { id: 't-tiny', type: 'text', name: 'tiny whisper text', ach: 'cut_noprobjohn' },
  { id: 't-blur', type: 'text', name: 'foggy text', ach: 'cut_clone84' },
];
const PFP = { jahn: 'jahntonner.png', john: 'john.png', tannerjohn: 'tannerjohn.png', janner: 'janner.png', clone: 'clone.png', man: 'man.png', randomman: 'randomman.png', troop: 'troop.png', pennius: 'pennius.png' };
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHAT = {
  msgs: [], unread: 0, open: false, picking: false, last: 0, el: null, btn: null,

  // ---- rewards ----
  unlocked(r) { try { return !!ACH.load().done[r.ach]; } catch (e) { return false; } },
  rewardOf(id) { return REWARDS.find(r => r.id === id); },
  rewardLine(a, done, hide) {
    const rs = REWARDS.filter(r => r.ach === a.id);
    if (!rs.length) return '';
    return `<div class="ach-rw">online reward: <b>${hide ? '???' : rs.map(r => r.name).join(', ')}</b>${done ? ' · unlocked' : ''}</div>`;
  },
  style() {   // what this player has picked, only counting what is really unlocked
    let st = {}; try { st = JSON.parse(localStorage.getItem('np_chat_style') || '{}'); } catch (e) {}
    const ok = (k) => { const r = this.rewardOf(st[k]); return r && r.type === k && this.unlocked(r) ? r.id : null; };
    return { bubble: ok('bubble'), name: ok('name'), text: ok('text') };
  },
  saveStyle(st) { try { localStorage.setItem('np_chat_style', JSON.stringify(st)); } catch (e) {} },

  // ---- profile picture from the name ----
  // giuseppe (any spelling close to it): clone with a random number · janner: his picture, but only for
  // people who unlocked "john, janner and the rebook" · tanner: random between the two tanners · john: john tanner
  profileFor(name) {
    const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const hashPick = () => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ['man', 'randomman', 'troop', 'pennius'][h % 4]; };
    if (/giu+s+e+p+e|giuse/.test(n)) return { pfp: 'clone', suffix: ` nº${1 + Math.floor(Math.random() * 104)}` };
    if (n.includes('janner') && ACH.load().done['cut_johnjanner']) return { pfp: 'janner', suffix: '' };
    if ((n.includes('jahn') || n.includes('tonner')) && ACH.load().done['jahntonner']) return { pfp: 'jahn', suffix: '' };
    // any other character: its name inside the username (4+ letters). secret ones need their achievement
    const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
    const stop = ['mafia', 'zombie', 'unturned', 'family', 'secretary', 'coach', 'giuseppe', 'clone', 'tonner', 'tanner', 'john', 'janner'];
    const keys = k => [k, ...String(UNITS[k].name).split(/[^a-z0-9]+/i).map(norm)].filter(w => w.length >= 4 && !stop.includes(w));
    let hit = null, best = 0;
    Object.keys(UNITS).forEach(k => {
      if (UNITS[k].token || !UNITS[k].img || (UNITS[k].secret && !ACH.load().done[k])) return;
      keys(k).forEach(w => { if (n.includes(w) && w.length > best) { best = w.length; hit = k; } });
    });
    if (hit && UNITS[hit].img) return { pfp: 'u:' + hit, suffix: '' };
    if (n.includes('tanner')) return { pfp: pick(['john', 'tannerjohn']), suffix: '' };
    if (n.includes('john')) return { pfp: 'john', suffix: '' };
    return { pfp: hashPick(), suffix: '' };
  },
  cleanProf(p) {
    p = p || {};
    return { pfp: (PFP[p.pfp] || (/^u:/.test(p.pfp || '') && UNITS[p.pfp.slice(2)])) ? p.pfp : 'man', suffix: /^ nº\d{1,3}$/.test(p.suffix || '') ? p.suffix : '' };
  },

  // ---- sending / receiving ----
  send(text, clip) {
    if (!NET.active) return;
    text = String(text || '').trim().slice(0, 200);
    if (!text && !clip) return;
    if (Date.now() - this.last < 700) return toast('slow down');
    this.last = Date.now();
    NET.send({ t: 'chat', text, clip: clip || null, st: this.style() });
  },
  // host: attach the sender's name and picture, then pass it on to everybody
  hostRelay(from, m) {
    const p = NET.players[from]; if (!p) return;
    const now = Date.now(); if (p.lastChat && now - p.lastChat < 500) return; p.lastChat = now;
    const text = String(m.text || '').slice(0, 200);
    const clip = m.clip && CUTSCENES[m.clip] ? m.clip : null;
    if (!text.trim() && !clip) return;
    const st = m.st || {};
    const okSt = (k) => { const r = this.rewardOf(st[k]); return r && r.type === k ? r.id : null; };
    NET.broadcast({ t: 'chat', from, name: p.name, prof: this.cleanProf(p.prof), text, clip, st: { bubble: okSt('bubble'), name: okSt('name'), text: okSt('text') }, ts: now });
  },
  muted: {},
  receive(m) {
    if (this.muted[m.from]) return;
    this.msgs.push(m); if (this.msgs.length > 120) this.msgs.shift();
    if (this.open) this.draw(true); else { this.unread++; this.badge(); }
  },
  clear() { this.muted = {}; this.msgs = []; this.unread = 0; this.open = false; this.picking = false; this.badge(); if (this.el) this.el.classList.add('hidden'); },
  watchClip(key) {
    if (!CUTSCENES[key]) return;
    if (CUT.active) return toast('wait for the cutscene that is playing');
    ACH.stop(); CUT.open(key, true, true);   // true: big, true: does not unlock anything
  },

  // ---- UI ----
  build() {
    if (this.el) return;
    const app = document.getElementById('app');
    this.btn = document.createElement('button');
    this.btn.id = 'chat-btn'; this.btn.className = 'hidden'; this.btn.innerHTML = '<span>💬 room chat</span><i id="chat-badge" class="hidden">0</i>';
    this.btn.onclick = () => this.toggle();
    this.el = document.createElement('div');
    this.el.id = 'chat'; this.el.className = 'hidden';
    this.el.innerHTML = `<div class="chat-head"><b id="chat-title">chat</b><button id="chat-style" title="chat looks">looks</button><button id="chat-x">✕</button></div>
      <div class="chat-picker hidden" id="chat-picker"></div>
      <div class="chat-list" id="chat-list"></div>
      <div class="chat-clips hidden" id="chat-clips"></div>
      <div class="chat-row"><input id="chat-in" maxlength="200" placeholder="say something" autocomplete="off"><button id="chat-clip" title="send a cutscene you unlocked">clip</button><button id="chat-send" class="primary">send</button></div>`;
    app.appendChild(this.btn); app.appendChild(this.el);
    const q = s => this.el.querySelector(s);
    q('#chat-x').onclick = () => this.toggle(false);
    q('#chat-style').onclick = () => { this.picking = !this.picking; this.drawPicker(); };
    q('#chat-clip').onclick = () => { q('#chat-clips').classList.toggle('hidden'); this.drawClips(); };
    const go = () => { const i = q('#chat-in'); this.send(i.value); i.value = ''; };
    q('#chat-send').onclick = go;
    q('#chat-in').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    setInterval(() => this.sync(), 800);
  },
  sync() {
    const on = !!(typeof NET !== 'undefined' && NET.active);
    this.btn.classList.toggle('hidden', !on);
    if (!on && this.msgs.length) this.clear();
    if (!on) return;
    this.el.querySelector('#chat-title').textContent = 'chat · room ' + (NET.code || '');
  },
  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) { this.unread = 0; this.badge(); this.draw(true); setTimeout(() => this.el.querySelector('#chat-in').focus(), 50); }
  },
  badge() { const b = document.getElementById('chat-badge'); if (!b) return; b.textContent = this.unread; b.classList.toggle('hidden', !this.unread); },
  drawClips() {
    const box = this.el.querySelector('#chat-clips'); if (box.classList.contains('hidden')) return;
    const done = ACH.load().done;
    const list = ACH_LIST.filter(a => a.video && done[a.id]);
    box.innerHTML = list.length ? list.map(a => `<button data-k="${a.video}">▶ ${esc(CUTSCENES[a.video].title)}</button>`).join('') : '<span class="t">unlock a cutscene to send it here</span>';
    box.querySelectorAll('button').forEach(b => b.onclick = () => { this.send('', b.dataset.k); box.classList.add('hidden'); });
  },
  drawPicker() {
    const box = this.el.querySelector('#chat-picker');
    box.classList.toggle('hidden', !this.picking);
    if (!this.picking) return;
    const cur = this.style();
    const groups = { bubble: 'bubble colour', name: 'name effect', text: 'text effect' };
    box.innerHTML = Object.keys(groups).map(k => `<div class="pk-title">${groups[k]}</div><div class="pk-row">
      <button class="pk${cur[k] ? '' : ' on'}" data-k="${k}" data-id="">none</button>
      ${REWARDS.filter(r => r.type === k).map(r => {
        const un = this.unlocked(r), a = ACH_LIST.find(x => x.id === r.ach);
        return `<button class="pk${cur[k] === r.id ? ' on' : ''}${un ? '' : ' locked'}" data-k="${k}" data-id="${r.id}" title="${un ? '' : 'unlock: ' + esc(a && a.secret ? '???' : a ? a.name : '')}">${un ? this.sample(r) : 'locked'}</button>`;
      }).join('')}</div>`).join('');
    box.querySelectorAll('.pk').forEach(b => b.onclick = () => {
      const r = this.rewardOf(b.dataset.id);
      if (b.dataset.id && !this.unlocked(r)) return toast('unlock it with an achievement first');
      const st = this.style(); st[b.dataset.k] = b.dataset.id || null; this.saveStyle(st); this.drawPicker();
    });
  },
  sample(r) {
    if (r.type === 'bubble') return `<span class="pk-bub" style="--bc:${r.col}">${esc(r.name.replace(' bubble', ''))}</span>`;
    if (r.type === 'name') return `<span class="${r.id}">${esc(r.name.replace(' name', ''))}</span>`;
    return `<span class="${r.id}">${esc(r.name.replace(' text', ''))}</span>`;
  },
  textHTML(text, textFx) {
    if (textFx === 't-wave') return [...text].map((ch, i) => `<span style="animation-delay:${i * 0.07}s">${esc(ch) === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
    return esc(text);
  },
  draw(scroll) {
    this.drawPicker(); this.drawClips();
    const list = this.el.querySelector('#chat-list');
    const me = typeof NET !== 'undefined' ? NET.myId : null;
    list.innerHTML = this.msgs.length ? '' : '<div class="chat-empty">nobody said anything yet</div>';
    this.msgs.filter(m => !this.muted[m.from]).forEach(m => {
      const prof = this.cleanProf(m.prof), st = m.st || {};
      const bub = this.rewardOf(st.bubble), nm = this.rewardOf(st.name), tx = this.rewardOf(st.text);
      const row = document.createElement('div');
      row.className = 'chat-msg' + (m.from === me ? ' mine' : '');
      const body = m.clip && CUTSCENES[m.clip]
        ? `<button class="chat-clipcard" data-k="${esc(m.clip)}"><i>▶</i><span><b>${esc(CUTSCENES[m.clip].title)}</b><small>tap to watch</small></span></button>`
        : `<div class="chat-text ${tx && tx.type === 'text' ? tx.id : ''}">${this.textHTML(m.text, tx && tx.id)}</div>`;
      row.innerHTML = `<div class="chat-pfp"><img src="${/^u:/.test(prof.pfp) ? imgSrc(prof.pfp.slice(2)) : 'assets/units/' + PFP[prof.pfp]}" alt="" ${/^u:/.test(prof.pfp) ? 'class="top"' : ''}></div>
        <div class="chat-main"><div class="chat-name ${nm && nm.type === 'name' ? nm.id : ''}">${esc(m.name)}${esc(prof.suffix)}</div>
        <div class="chat-bubble" style="--bc:${bub && bub.type === 'bubble' ? bub.col : '#8a8f98'}">${body}</div></div>`;
      if (m.from !== me) row.querySelector('.chat-name').onclick = () => { this.muted[m.from] = true; toast(`muted ${m.name}. their messages are hidden until you leave the room`); this.draw(); };
      row.querySelector('.chat-name').title = m.from === me ? '' : 'click to mute';
      const c = row.querySelector('.chat-clipcard'); if (c) c.onclick = () => this.watchClip(c.dataset.k);
      list.appendChild(row);
    });
    if (scroll) list.scrollTop = list.scrollHeight;
  },
};
document.addEventListener('DOMContentLoaded', () => CHAT.build());
if (document.readyState !== 'loading') CHAT.build();
