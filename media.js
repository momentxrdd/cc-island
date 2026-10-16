const { spawnWatcher } = require('./lib/helper');

class MediaWatcher {
  constructor(onUpdate, source = 'spotify') {
    this.onUpdate = onUpdate;
    this.source = source;
    this.proc = null;
    this.active = false;
    this.buf = '';
    this.art = null;
    this.fails = 0;
    this.restartTimer = null;
    this.state = null;
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    if (on) this._start();
    else this._stop();
  }

  setSource(source) {
    if (source === this.source) return;
    this.source = source;
    if (this.active) { this._stop(); this.active = true; this._start(); }
  }

  send(cmd) {
    const p = this.proc;
    if (p && p.stdin && p.stdin.writable) { try { p.stdin.write(cmd + '\n'); } catch {} }
  }

  _start() {
    if (this.proc) return;
    const p = spawnWatcher('media', { source: this.source === 'all' ? 'all' : 'spotify' });
    this.proc = p;
    const startedAt = Date.now();
    p.stderr.on('data', (d) => {
      console.log(`[MediaWatcher stderr] ${d}`);
    });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      if (this.proc !== p) return;
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line) this._line(line);
      }
    });
    p.stdin.on('error', () => {});
    p.on('exit', () => {
      if (this.proc && this.proc !== p) return;
      this.proc = null;
      this.buf = '';
      if (!this.active) return;
      this.fails = Date.now() - startedAt < 5000 ? this.fails + 1 : 0;
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => { if (this.active) this._start(); }, Math.min(30000, 1000 * 2 ** this.fails));
    });
  }

  _stop() {
    clearTimeout(this.restartTimer);
    const p = this.proc;
    this.proc = null;
    this.state = null; this.art = null;
    if (p) {
      try { p.stdin.write('quit\n'); } catch {}
      setTimeout(() => { try { p.kill(); } catch {} }, 800);
    }
    this.onUpdate(null);
  }

  _line(line) {
    let o;
    try { o = JSON.parse(line); } catch { return; }
    if (o.none) { this.state = null; this.art = null; this.onUpdate(null); return; }
    if ('art' in o) this.art = o.art;
    delete o.art;
    this.state = o;
    this.onUpdate({ ...o, art: this.art });
  }
}

module.exports = { MediaWatcher };
