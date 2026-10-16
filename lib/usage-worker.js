const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

const files = new Map();
const seen = new Set();
const sums = new Map();
const events = [];

const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function walk(dir, out, depth = 0) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) walk(p, out, depth + 1);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
}

function line(l, minTs) {
  if (!l.includes('"usage"') || !l.includes('"assistant"')) return;
  let o; try { o = JSON.parse(l); } catch { return; }
  const m = o && o.type === 'assistant' && o.message;
  const u = m && m.usage;
  if (!u || !m.model || m.model === '<synthetic>') return;
  const ts = Date.parse(o.timestamp);
  if (!(ts >= minTs)) return;
  const id = (m.id || '') + ':' + (o.requestId || '');
  if (id !== ':') { if (seen.has(id)) return; seen.add(id); }
  const cc = u.cache_creation || {};
  const cw1h = cc.ephemeral_1h_input_tokens || 0;
  const cw5m = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, (u.cache_creation_input_tokens || 0) - cw1h);
  const key = dayKey(ts) + '|' + m.model + '|' + (o.cwd || '');
  let s = sums.get(key);
  if (!s) sums.set(key, (s = { input: 0, output: 0, cacheRead: 0, cw5m: 0, cw1h: 0, calls: 0 }));
  s.input += u.input_tokens || 0; s.output += u.output_tokens || 0; s.cacheRead += u.cache_read_input_tokens || 0;
  s.cw5m += cw5m; s.cw1h += cw1h; s.calls++;
  events.push({ ts, model: m.model, input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cw5m, cw1h });
}

function scan(root, days) {
  const minTs = Date.now() - days * 86400000;
  const list = [];
  walk(root, list);
  const buf = Buffer.alloc(4 * 1024 * 1024);
  for (const p of list) {
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.mtimeMs < minTs) continue;
    let f = files.get(p);
    if (!f || st.size < f.pos) files.set(p, (f = { pos: 0, tail: '', dec: new StringDecoder('utf8') }));
    if (st.size === f.pos) continue;
    let fd; try { fd = fs.openSync(p, 'r'); } catch { continue; }
    try {
      while (f.pos < st.size) {
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, st.size - f.pos), f.pos);
        if (!n) break;
        f.pos += n;
        const parts = (f.tail + f.dec.write(buf.subarray(0, n))).split('\n');
        f.tail = parts.pop();
        for (const l of parts) line(l, minTs);
      }
    } finally { fs.closeSync(fd); }
  }
  const rows = [...sums].map(([k, v]) => { const [day, model, cwd] = k.split('|'); return { day, model, cwd, ...v }; });
  return { rows, events: events.filter((e) => e.ts >= minTs) };
}

parentPort.on('message', ({ id, root, days }) => {
  try { const r = scan(root, days); parentPort.postMessage({ id, rows: r.rows, events: r.events }); }
  catch (e) { parentPort.postMessage({ id, error: String(e && e.message || e) }); }
});
