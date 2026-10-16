const { spawnWatcher } = require('./helper');

class SystemWatcher {
  constructor(onChange) {
    this.onChange = onChange;
    this.proc = null;
    this.active = false;
    this.fails = 0;
    this.timer = null;
    this.stopTimer = null;
    this.stopDelayMs = +process.env.CC_WATCH_STOP_MS || 60000;
  }

  setActive(on) {
    if (on) {
      if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
      if (this.active) return;
      this.active = true;
      this._start();
    } else {
      if (!this.active || this.stopTimer) return;
      this.stopTimer = setTimeout(() => {
        this.stopTimer = null;
        if (!this.active) return;
        this.active = false;
        this._stop();
      }, this.stopDelayMs);
    }
  }

  dispose() {
    if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
    this.active = false;
    this._stop();
  }

  _start() {
    if (this.proc) return;
    const p = spawnWatcher('system', { selfPid: process.pid });
    p.stderr.resume();
    this.proc = p;
    const startedAt = Date.now();
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        let o; try { o = JSON.parse(l); } catch { continue; }
        if (typeof o.focus === 'boolean') { this.onChange({ kind: 'focus', active: o.focus }); continue; }
        if (typeof o.game === 'boolean') { this.onChange({ kind: 'game', active: o.game, d3d: !!o.d3d, mon: Array.isArray(o.mon) && o.mon.length === 4 ? o.mon : null }); continue; }
        if (o.init) continue;
        if (typeof o.vol === 'number') this.onChange({ kind: 'volume', value: o.vol, muted: !!o.muted });
        else if (typeof o.bri === 'number') this.onChange({ kind: 'brightness', value: o.bri });
      }
    });
    p.stdin.on('error', () => {});
    p.on('exit', () => {
      if (this.proc === p) this.proc = null;
      if (!this.active) return;
      this.fails = Date.now() - startedAt < 5000 ? this.fails + 1 : 0;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (this.active) this._start(); }, Math.min(60000, 2000 * 2 ** this.fails));
    });
  }

  _stop() {
    clearTimeout(this.timer);
    const p = this.proc;
    this.proc = null;
    if (p) { try { p.stdin.write('quit\n'); } catch {} setTimeout(() => { try { p.kill(); } catch {} }, 800); }
  }
}

module.exports = { SystemWatcher };
