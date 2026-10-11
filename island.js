/**
 * DynamicIsland — bağımsız, yeniden kullanılabilir Dynamic Island bileşeni.
 * İçerik üretimini bilmez; görünümleri (compact / overlay / peek / full) dışarıdan verilen renderer'lar doldurur.
 *
 *   const island = new DynamicIsland(rootEl, { render: { compact, overlay, peek, full }, onPointer, onShow, onHover });
 *   island.setBase({ kind: 'loading', ... });          // kalıcı taban durum (compact görünüm için)
 *   island.push({ id, kind, title, text, ... });       // bildirim / loading / progress / success / error
 *   island.update(id, patch); island.dismiss(id);
 *   island.expand(); island.collapse(); island.destroy();
 *
 * Durum geçişleri tek yerde (_target + _apply). Aynı anda gelen olaylar kuyruğa girer, geçişler birbirini ezmez.
 */
class DynamicIsland {
  static PRIORITY = { error: 5, notification: 4, success: 3, progress: 2, loading: 1 };

  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.views = {};
    root.querySelectorAll('[data-view]').forEach((v) => (this.views[v.dataset.view] = v));
    this.state = { expanded: false, hover: false };
    this.base = { kind: 'idle' };
    this.overlays = [];
    this.active = null; // şu an gösterilen geçici bildirim
    this.cur = { view: null, key: '' };
    this._timers = new Map(); // ad -> timeout id
    this._ac = new AbortController();
    this._raf = 0;
    this._lock = 0;
    this._size = { w: 0, h: 0 };
    this._dead = false;

    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionMode = opts.motion || 'on'; // 'on' | 'system' | 'off'
    this._applyMotion();
    this.motionQuery.addEventListener('change', () => this._applyMotion(), { signal: this._ac.signal });

    this._ro = new ResizeObserver(() => this._resize());
    Object.values(this.views).forEach((v) => this._ro.observe(v));
    this._bind();
    this.commit();
  }

  // ---------- genel API ----------
  // hareket modu: 'on' her zaman animasyon, 'system' OS "hareketi azalt" tercihini izler, 'off' animasyonsuz
  setMotionMode(mode) { this.motionMode = mode; this._applyMotion(); }
  _applyMotion() {
    const reduced = this.motionMode === 'off' || (this.motionMode === 'system' && this.motionQuery.matches);
    this.root.dataset.motion = reduced ? 'reduced' : 'full';
  }
  setBase(base) { this.base = base; this.commit(); }
  refresh() { this.commit(); }

  push(item) {
    const i = this.overlays.findIndex((o) => o.id === item.id);
    if (i >= 0) {
      Object.assign(this.overlays[i], item);
      if (this.active === this.overlays[i]) this._armExpiry(this.overlays[i]); // aynı bildirim güncellendi: süre baştan başlar
    }
    else this.overlays.push({ priority: DynamicIsland.PRIORITY[item.kind] || 0, duration: 4000, persistent: false, at: performance.now(), ...item });
    this.commit();
  }
  update(id, patch) { const o = this.overlays.find((x) => x.id === id); if (o) { Object.assign(o, patch); this.commit(); } }
  has(id) { return this.overlays.some((o) => o.id === id); }
  dismiss(id) {
    const n = this.overlays.length;
    this.overlays = this.overlays.filter((o) => o.id !== id);
    if (this.active && this.active.id === id) { this.active = null; this._clearT('act'); }
    if (n !== this.overlays.length) this.commit();
  }
  expand() { if (!this.state.expanded) { this.state.expanded = true; this.commit(); } }
  collapse() { if (this.state.expanded) { this.state.expanded = false; this.commit(); } }
  get expanded() { return this.state.expanded; }

  destroy() {
    this._dead = true;
    this._timers.forEach((id) => clearTimeout(id));
    this._timers.clear();
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this._ac.abort();
  }

  // ---------- zamanlayıcılar (hepsi izlenir, destroy'da temizlenir) ----------
  _t(name, fn, ms) {
    this._clearT(name);
    const id = setTimeout(() => { this._timers.delete(name); if (!this._dead) fn(); }, ms);
    this._timers.set(name, id);
  }
  _clearT(name) {
    const id = this._timers.get(name);
    if (id) { clearTimeout(id); this._timers.delete(name); }
  }

  // ---------- durum makinesi ----------
  _persistent() {
    return this.overlays.filter((o) => o.persistent).sort((a, b) => b.priority - a.priority || a.at - b.at)[0] || null;
  }

  _nextTransient() {
    if (this.active && this.overlays.includes(this.active)) return this.active;
    // kalıcı bir bildirim yüzünden uzun süre bekleyen eski geçici bildirimler artık anlamsızdır
    const now = performance.now();
    this.overlays = this.overlays.filter((o) => o.persistent || now - o.at < 20000);
    const q = this.overlays.filter((o) => !o.persistent).sort((a, b) => b.priority - a.priority || a.at - b.at);
    this.active = q[0] || null;
    if (this.active) this._armExpiry(this.active);
    return this.active;
  }

  _armExpiry(item) {
    this._t('act', () => {
      // etkileşim sürerken kapanmasın
      if (this.state.hover || this.state.expanded) { this._armExpiry(item); return; }
      this.overlays = this.overlays.filter((o) => o !== item);
      if (this.active === item) this.active = null;
      this.commit();
    }, item.duration);
  }

  _target() {
    const p = this._persistent();
    if (this.state.expanded) return { view: 'full' };
    if (p) return { view: 'overlay', item: p };
    if (this.state.hover) return { view: 'peek' };
    const t = this._nextTransient();
    if (t) return { view: 'overlay', item: t };
    return { view: 'compact' };
  }

  commit() {
    if (this._dead || this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._apply(); });
  }

  _apply() {
    if (this._dead) return;
    const t = this._target();
    const key = t.view + (t.item ? `:${t.item.id}:${t.item.kind}` : '');
    const changed = key !== this.cur.key;
    const now = performance.now();
    // kullanıcı kaydırırken içerik yenilemesi ertelenir (görünüm değişmiyorsa)
    if (!changed && this.opts.defer && this.opts.defer()) { this._t('defer', () => this.commit(), 160); return; }
    // geçişler çakışmasın: bir geçiş sürerken yenisi bekletilir
    if (changed && now < this._lock) { this._t('retry', () => this.commit(), this._lock - now + 16); return; }

    const r = this.opts.render;
    if (changed && this.opts.onShow) this.opts.onShow(t.view, t.item);
    if (r[t.view]) r[t.view](this.views[t.view], t.item, this);

    if (changed) {
      Object.entries(this.views).forEach(([n, el]) => {
        const on = n === t.view;
        el.classList.toggle('on', on);
        el.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (on) el.removeAttribute('inert'); else el.setAttribute('inert', '');
      });
      this.cur = { view: t.view, key };
      this._lock = now + (this.root.dataset.motion === 'reduced' ? 0 : 240);
      if (t.view === 'overlay') this._bump();
    }
    const pv = this._persistent();
    this.root.dataset.attn = pv && pv.kind === 'notification' ? '1' : '0';
    this.root.dataset.busy = this.base.kind === 'loading' || this.base.kind === 'progress' ? '1' : '0';
    this.root.dataset.view = t.view;
    this.root.setAttribute('aria-expanded', String(this.state.expanded));
    this._resize();
  }

  _bump() {
    if (this.root.dataset.motion === 'reduced') return;
    this.root.classList.add('bump');
    this._t('bump', () => this.root.classList.remove('bump'), 320);
  }

  // kapsül boyutu: aktif görünümün doğal boyutu ölçülür, CSS geçişi animasyonu yapar
  _resize() {
    const el = this.views[this.cur.view];
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    if (w !== this._size.w) this.root.style.width = w + 'px';
    if (h !== this._size.h) this.root.style.height = h + 'px';
    this._size = { w, h };
    const cap = { full: 42, peek: 34 }[this.cur.view] || 34;
    this.root.style.borderRadius = Math.min(h / 2, cap) + 'px';
  }

  // ---------- etkileşim ----------
  _bind() {
    const sig = { signal: this._ac.signal };
    this.root.addEventListener('pointerenter', () => {
      this._clearT('leave');
      this._t('enter', () => { this.state.hover = true; this.commit(); }, this.state.expanded ? 0 : 90);
      if (this.opts.onHover) this.opts.onHover(true);
    }, sig);
    this.root.addEventListener('pointerleave', () => {
      this._clearT('enter');
      this._t('leave', () => {
        this.state.hover = false;
        if (this.state.expanded && !this._persistent()) this.state.expanded = false;
        this.commit();
      }, this.state.expanded ? 1400 : 220);
      if (this.opts.onHover) this.opts.onHover(false);
    }, sig);
    // pointerdown: içerik yeniden çizilse bile tıklama kaybolmaz
    this.root.addEventListener('pointerdown', (e) => {
      if (this.opts.onPointer && this.opts.onPointer(e, this)) return;
      if (!this.state.expanded) this.expand();
      else if (e.target.closest('[data-toggle]')) this.collapse();
    }, sig);
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.state.expanded ? this.collapse() : this.expand(); }
      if (e.key === 'Escape') this.collapse();
    }, sig);
  }
}
