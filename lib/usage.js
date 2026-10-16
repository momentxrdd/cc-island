const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

const PRICES = [
  [/fable-5-1/, 10, 50, 0.25],
  [/fable-5|mythos-5/, 10, 50, 1],
  [/opus-5-5/, 4, 20, 0.2],
  [/opus-5(?!-\d)|opus-4-[678]/, 5, 25, 0.5],
  [/sonnet-5/, 2, 10, 0.2],
  [/sonnet-4-6/, 3, 15, 0.3],
  [/haiku-4-5/, 1, 5, 0.1],
];
const priceOf = (model) => { const p = PRICES.find(([re]) => re.test(model)); return p && { input: p[1], output: p[2], read: p[3] }; };

function costOf(r) {
  const p = priceOf(r.model);
  if (!p) return null;
  return (r.input * p.input + r.output * p.output + r.cacheRead * p.read + r.cw5m * p.input * 1.25 + r.cw1h * p.input * 2) / 1e6;
}

function modelName(id) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
  return m ? m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[2] + (m[3] ? '.' + m[3] : '') : id;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

class Usage {
  constructor(root = path.join(os.homedir(), '.claude', 'projects')) {
    this.root = root;
    this.worker = null;
    this.waiting = new Map();
    this.seq = 0;
    this.last = null;
    this.busy = null;
  }

  _worker() {
    if (this.worker) return this.worker;
    const w = new Worker(path.join(__dirname, 'usage-worker.js'));
    w.on('message', ({ id, rows, error }) => { if (this.waiting.size <= 1) w.unref(); const cb = this.waiting.get(id); this.waiting.delete(id); if (cb) cb(error ? null : rows); });
    w.on('error', () => {});
    w.on('exit', () => { this.worker = null; for (const cb of this.waiting.values()) cb(null); this.waiting.clear(); });
    w.unref();
    return (this.worker = w);
  }

  get(maxAge = 30000) {
    if (this.last && Date.now() - this.last.at < maxAge) return Promise.resolve(this.last);
    if (this.busy) return this.busy;
    this.busy = new Promise((resolve) => {
      const id = ++this.seq;
      this.waiting.set(id, (rows) => {
        this.busy = null;
        if (rows) this.last = summarize(rows);
        resolve(this.last);
      });
      const w = this._worker();
      w.ref();
      w.postMessage({ id, root: this.root, days: 8 });
    });
    return this.busy;
  }

  stop() { if (this.worker) this.worker.terminate(); }
}

function summarize(rows, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
  const today = days[6], inWeek = new Set(days);
  const blank = () => ({ tokens: 0, output: 0, cost: 0, calls: 0 });
  const t = blank(), w = blank();
  const daily = Object.fromEntries(days.map((d) => [d, blank()]));
  const models = new Map(), projects = new Map(), unpriced = new Set();
  for (const r of rows) {
    if (!inWeek.has(r.day)) continue;
    const c = costOf(r);
    if (c == null) unpriced.add(r.model);
    const tokens = r.input + r.output + r.cacheRead + r.cw5m + r.cw1h;
    const add = (o) => { o.tokens += tokens; o.output += r.output; o.cost += c || 0; o.calls += r.calls; };
    add(w); add(daily[r.day]);
    if (r.day === today) add(t);
    const name = modelName(r.model);
    if (!models.has(name)) models.set(name, blank());
    add(models.get(name));
    const proj = path.basename(r.cwd || '') || '—';
    if (!projects.has(proj)) projects.set(proj, { week: blank(), today: blank() });
    add(projects.get(proj).week);
    if (r.day === today) add(projects.get(proj).today);
  }
  const top = (m, n) => [...m].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens).slice(0, n);
  return {
    at: Date.now(), today: t, week: w,
    daily: days.map((d) => ({ day: d, ...daily[d] })),
    models: top(models, 5),
    projects: [...projects].map(([name, v]) => ({ name, cost: v.week.cost, tokens: v.week.tokens, todayCost: v.today.cost, todayTokens: v.today.tokens }))
      .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens).slice(0, 5),
    unpriced: [...unpriced].map(modelName),
  };
}

module.exports = { Usage, summarize, costOf, modelName };
