// Spotify (Windows SMTC) izleyicisi: media.ps1'i çalıştırır, JSON satırlarını durum olarak yayınlar, komut gönderir.
const { spawn } = require('child_process');
const path = require('path');

class MediaWatcher {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.proc = null;
    this.active = false;
    this.buf = '';
    this.art = null;
    this.fails = 0;
    this.restartTimer = null;
    this.state = null;
  }

  // yalnızca ada görünürken çalışır (gereksiz CPU yok)
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    if (on) this._start();
    else this._stop();
  }

  send(cmd) {
    const p = this.proc;
    if (p && p.stdin && p.stdin.writable) { try { p.stdin.write(cmd + '\n'); } catch {} }
  }

  _start() {
    if (this.proc) return;
    const p = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'media.ps1')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc = p;
    const startedAt = Date.now();
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
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
      if (this.proc === p) this.proc = null;
      this.buf = '';
      if (!this.active) return;
      // hızlı çöküyorsa üstel geri çekilme (en çok 30 sn)
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
    if ('art' in o) this.art = o.art; // yalnızca parça değişince gelir
    delete o.art;
    this.state = o;
    this.onUpdate({ ...o, art: this.art });
  }
}

module.exports = { MediaWatcher };
