const fs = require('fs');

const MAX_LINES = 400;
const CONTEXT = 3;

function readText(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 2 * 1024 * 1024) return null;
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch { return null; }
}

function lineDiff(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 1500000) return [...a.map((s) => ({ t: '-', s })), ...b.map((s) => ({ t: '+', s }))];
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push({ t: ' ', s: a[i] }); i++; j++; }
    else if (i < n && (j >= m || dp[(i + 1) * w + j] >= dp[i * w + j + 1])) out.push({ t: '-', s: a[i++] });
    else out.push({ t: '+', s: b[j++] });
  }
  return out;
}

function number(lines, oldStart, newStart) {
  let o = oldStart, n = newStart;
  return lines.map((l) => ({ ...l, o: l.t === '+' ? null : o++, n: l.t === '-' ? null : n++ }));
}

function trimContext(lines) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, i) => { if (l.t !== ' ') for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) keep[k] = true; });
  const hunks = [];
  let cur = null;
  lines.forEach((l, i) => {
    if (!keep[i]) { cur = null; return; }
    if (!cur) hunks.push((cur = { lines: [] }));
    cur.lines.push(l);
  });
  return hunks;
}

function editHunk(content, oldStr, newStr) {
  oldStr = String(oldStr || '').replace(/\r\n/g, '\n');
  newStr = String(newStr || '').replace(/\r\n/g, '\n');
  const idx = content != null && oldStr ? content.indexOf(oldStr) : -1;
  const start = idx >= 0 ? content.slice(0, idx).split('\n').length : 1;
  const all = content != null && idx >= 0 ? content.split('\n') : null;
  const oldLines = oldStr.split('\n'), newLines = newStr.split('\n');
  const before = all ? all.slice(Math.max(0, start - 1 - CONTEXT), start - 1) : [];
  const after = all ? all.slice(start - 1 + oldLines.length, start - 1 + oldLines.length + CONTEXT) : [];
  const body = lineDiff(oldLines, newLines);
  const lines = [...before.map((s) => ({ t: ' ', s })), ...body, ...after.map((s) => ({ t: ' ', s }))];
  const first = start - before.length;
  return { located: idx >= 0, lines: number(lines, first, first) };
}

function parsePatch(text) {
  const files = [];
  let f = null, h = null, o = 1, n = 1;
  for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const fm = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(raw);
    if (fm) { files.push((f = { file: fm[2].trim(), isNew: fm[1] === 'Add', deleted: fm[1] === 'Delete', hunks: [] })); h = null; o = n = 1; continue; }
    if (!f || /^\*\*\* /.test(raw)) continue;
    const hm = /^@@(?: -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@)?/.exec(raw);
    if (hm) { f.hunks.push((h = { lines: [] })); if (hm[1]) { o = +hm[1]; n = +hm[2]; } continue; }
    const t = raw[0];
    if (t !== '+' && t !== '-' && t !== ' ') continue;
    if (!h) f.hunks.push((h = { lines: [] }));
    h.lines.push({ t, s: raw.slice(1), o: t === '+' ? null : o++, n: t === '-' ? null : n++ });
  }
  return files;
}

function cap(d) {
  let left = MAX_LINES;
  for (const h of d.hunks) {
    if (left <= 0) { h.lines = []; continue; }
    if (h.lines.length > left) { h.lines = h.lines.slice(0, left); d.truncated = true; }
    left -= h.lines.length;
  }
  d.hunks = d.hunks.filter((h) => h.lines.length);
  d.added = d.hunks.reduce((a, h) => a + h.lines.filter((l) => l.t === '+').length, 0);
  d.removed = d.hunks.reduce((a, h) => a + h.lines.filter((l) => l.t === '-').length, 0);
  return d;
}

function diffOf(tool, input) {
  const i = input && typeof input === 'object' ? input : {};
  try {
    if (tool === 'Edit' && i.file_path) {
      const h = editHunk(readText(i.file_path), i.old_string, i.new_string);
      return [cap({ file: i.file_path, hunks: [{ lines: h.lines }], located: h.located })];
    }
    if (tool === 'MultiEdit' && i.file_path && Array.isArray(i.edits)) {
      let content = readText(i.file_path);
      const hunks = [];
      for (const e of i.edits.slice(0, 30)) {
        const h = editHunk(content, e.old_string, e.new_string);
        hunks.push({ lines: h.lines });
        if (content != null && h.located) content = content.replace(String(e.old_string).replace(/\r\n/g, '\n'), String(e.new_string || '').replace(/\r\n/g, '\n'));
      }
      return [cap({ file: i.file_path, hunks })];
    }
    if (tool === 'Write' && i.file_path) {
      const old = readText(i.file_path);
      const next = String(i.content || '').replace(/\r\n/g, '\n').split('\n');
      if (old == null) return [cap({ file: i.file_path, isNew: true, hunks: [{ lines: number(next.map((s) => ({ t: '+', s })), 1, 1) }] })];
      return [cap({ file: i.file_path, hunks: trimContext(number(lineDiff(old.split('\n'), next), 1, 1)) })];
    }
    const patch = [i.patch, i.input, i.command].find((v) => typeof v === 'string' && v.includes('*** '));
    if (patch) return parsePatch(patch).slice(0, 10).map(cap);
  } catch {}
  return null;
}

module.exports = { diffOf, lineDiff, parsePatch };
