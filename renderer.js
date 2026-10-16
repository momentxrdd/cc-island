const $ = (id) => document.getElementById(id);
const L = (key, vars) => I18N.t(key, vars);
const LP = (key, n, vars) => I18N.plural(key, n, vars);
const S = { sessions: [], pending: [], sel: null, tab: 'act', open: new Set(), details: {}, conv: {}, lastInd: 0,
  prevTiles: {}, scroll: {}, errSeen: {}, doneId: {}, ans: {}, settings: {}, calendar: null, timer: null, usage: null, themeInfo: { isDark: true, accent: null } };
let island = null;
const schedule = () => island && island.refresh();

const STATUS_ICON = { working: 'zap', waiting: 'lock', done: 'circleCheck', idle: 'pause' };
const statusText = (s) => L('status.' + s);
const ORDER = { waiting: 0, working: 1, done: 2, idle: 3 };
const TABS = ['act', 'chat', 'info'];
const TAB_W = 130;

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m >= 60 ? L('dur.hm', { h: Math.floor(m / 60), m: m % 60 }) : m ? L('dur.ms', { m, s: s % 60 }) : L('dur.s', { s });
};
const ago = (ms) => L('dur.ago', { t: fmt(ms) });
const fmtMs = (ms) => (ms < 1000 ? L('dur.msShort', { ms }) : ms < 10000 ? L('dur.s', { s: (ms / 1000).toFixed(1) }) : fmt(ms));
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' }) : '');
const sorted = () => [...S.sessions].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updated - a.updated);
const selSession = () => S.sessions.find((x) => x.id === S.sel);

const seen = new Set();
let frame = new Set(), idx = 0;
const en = (key) => {
  if (seen.has(key)) return '';
  frame.add(key);
  return ` enter" style="--d:${Math.min(idx++, 14) * 40}ms`;
};
const forget = (prefix) => { for (const k of [...seen]) if (k.startsWith(prefix)) seen.delete(k); };
const withFrame = (fn) => (...a) => { try { return fn(...a); } finally { for (const k of frame) seen.add(k); frame.clear(); idx = 0; } };

const eq = '<span class="eq"><i></i><i></i><i></i><i></i></span>';

function liveLine(s) {
  if (s.status === 'waiting') return `${ic('lock', 12)}<span>${esc(s.message || statusText('waiting'))}</span>`;
  if (s.current) { const [n] = toolMeta(s.current.tool); return `${ic(n, 12)}<b style="color:#ddd;font-weight:600">${esc(s.current.tool)}</b><code>${esc(s.current.summary)}</code>`; }
  if (s.status === 'done' && s.lastText) return `<span>${esc(s.lastText.replace(/\s+/g, ' ').slice(0, 120))}</span>`;
  return `<span>${esc(s.prompt || statusText(s.status))}</span>`;
}

function permCard(p, withName, ns) {
  if (p.questions) return questionCard(p, withName, ns);
  const s = S.sessions.find((x) => x.id === p.session_id);
  return `<div class="perm${en(`${ns}:perm:${p.id}`)}">
    <div class="perm-h"><span class="lk wiggle">${ic('lock', 18)}</span><b>${esc(withName && s ? s.name : L('ui.permission'))}</b>
      <span class="tool">${ic(toolMeta(p.tool)[0], 13)}${esc(p.tool)}</span>
      <span class="time" style="margin-left:auto" data-since="${p.ts}">${fmt(Date.now() - p.ts)}</span></div>
    <pre>${esc(p.detail || p.summary || L('ui.noDetails'))}</pre>
    <div class="btns">
      <button class="b-allow" data-act="allow" data-id="${p.id}">${ic('check', 15)}${L('ui.allow')}</button>
      <button class="b-deny" data-act="deny" data-id="${p.id}">${ic('x', 15)}${L('ui.deny')}</button>
      ${p.hasSug ? `<button class="b-always" data-act="always" data-id="${p.id}">${ic('shield', 15)}${L('ui.alwaysAllow')}</button>` : ''}
      <button class="b-ghost" data-act="terminal" data-id="${p.id}">${ic('terminal', 15)}${L('ui.askTerminal')}</button>
    </div>
    <div class="keys"><span><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Y</kbd> ${L('ui.keyAllow')}</span><span><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> ${L('ui.keyDeny')}</span></div>
  </div>`;
}

const needsSubmit = (qs) => qs.length > 1 || qs.some((q) => q.multiSelect);
const picks = (pid, qs) => (S.ans[pid] = S.ans[pid] || qs.map(() => []));

function questionBody(pid, qs) {
  const sel = picks(pid, qs);
  const ready = sel.every((a) => a.length);
  return qs.map((q, qi) => `<div class="q">
      ${q.header || q.multiSelect ? `<div class="q-top">${q.header ? `<span class="q-chip">${esc(q.header)}</span>` : ''}${q.multiSelect ? `<span class="q-hint">${L('ui.multi')}</span>` : ''}</div>` : ''}
      <div class="q-t">${esc(q.question)}</div>
      <div class="q-opts" role="${q.multiSelect ? 'group' : 'radiogroup'}">${q.options.map((o, oi) => {
        const on = sel[qi].includes(o.label);
        return `<button class="qopt${on ? ' on' : ''}${q.multiSelect ? ' multi' : ''}" data-qopt="${pid}:${qi}:${oi}" role="${q.multiSelect ? 'checkbox' : 'radio'}" aria-checked="${on}">
          <span class="qx">${on ? ic('check', 11) : ''}</span><span class="ql"><b>${esc(o.label)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></button>`;
      }).join('')}</div></div>`).join('') +
    `<div class="btns q-btns">${needsSubmit(qs) ? `<button class="b-allow" data-qsubmit="${pid}"${ready ? '' : ` disabled title="${esc(L('ui.pickAll'))}"`}>${ic('check', 15)}${L('ui.submit')}</button>` : ''}
      <button class="b-ghost" data-act="terminal" data-id="${pid}">${ic('terminal', 15)}${L('ui.answerTerminal')}</button></div>`;
}

function questionCard(p, withName, ns) {
  const s = S.sessions.find((x) => x.id === p.session_id);
  return `<div class="perm qcard${en(`${ns}:perm:${p.id}`)}">
    <div class="perm-h"><span class="lk">${ic('help', 18)}</span><b>${esc(withName && s ? s.name : L('ui.question'))}</b>
      <span class="time push" data-since="${p.ts}">${fmt(Date.now() - p.ts)}</span></div>
    ${questionBody(p.id, p.questions)}</div>`;
}

function sendAnswers(pid) {
  const p = S.pending.find((x) => x.id === pid);
  if (!p || !p.questions) return;
  const sel = picks(pid, p.questions);
  if (!sel.every((a) => a.length)) return;
  const answers = {};
  p.questions.forEach((q, qi) => { answers[q.question] = sel[qi].join(', '); });
  delete S.ans[pid];
  window.ccApi.decide(pid, 'answer', answers);
}

function pickOption(pid, qi, oi) {
  const p = S.pending.find((x) => x.id === pid);
  const q = p && p.questions && p.questions[qi];
  const o = q && q.options[oi];
  if (!o) return;
  const sel = picks(pid, p.questions);
  if (q.multiSelect) sel[qi] = sel[qi].includes(o.label) ? sel[qi].filter((l) => l !== o.label) : [...sel[qi], o.label];
  else sel[qi] = [o.label];
  if (!needsSubmit(p.questions)) return sendAnswers(pid);
  schedule();
}

function navPerm(dir) {
  const n = S.pending.length;
  if (!n) return;
  S.permIdx = (((S.permIdx || 0) + dir) + n) % n;
  const p = S.pending[S.permIdx], s = S.sessions.find((v) => v.id === p.session_id);
  const name = s ? s.name : L('ui.session');
  island.update('perm', p.questions
    ? { title: L('notif.question', { name }), text: '', badge: 'help', pid: p.id, hasSug: false, questions: p.questions, count: n, pi: S.permIdx, sid: p.session_id }
    : { title: L('notif.permission', { name }), text: `${p.tool}  ${p.summary}`, badge: 'lock', pid: p.id, hasSug: p.hasSug, questions: null, count: n, pi: S.permIdx, sid: p.session_id });
}

function kvs(obj, skip = []) {
  const rows = Object.entries(obj || {}).filter(([k, v]) => !skip.includes(k) && v !== '' && v != null);
  return rows.length ? `<div class="kvs">${rows.map(([k, v]) =>
    `<span class="k">${esc(k.replace(/_/g, ' '))}</span><span class="v">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span>`).join('')}</div>` : '';
}
const blk = (label, body, copy) => `<div class="blk"><div class="lbl">${esc(label)}${copy ? `<span class="ibtn" data-copy="1" title="${esc(L('ui.copy'))}">${ic('copy', 13)}</span>` : ''}</div>${body}</div>`;
const diff = (o, n) => `<div class="code df">${String(o || '').split('\n').map((l) => `<span class="del">- ${esc(l)}</span>`).join('')}${String(n || '').split('\n').map((l) => `<span class="add">+ ${esc(l)}</span>`).join('')}</div>`;

function inputHTML(tool, i) {
  i = i || {};
  switch (tool) {
    case 'Bash': return blk(L('block.command'), `<div class="code">${esc(i.command)}</div>`, true) +
      kvs({ [L('block.description')]: i.description, [L('block.timeout')]: i.timeout });
    case 'Edit': return kvs({ [L('block.file')]: i.file_path }) + blk(L('block.change'), diff(i.old_string, i.new_string), true);
    case 'MultiEdit': return kvs({ [L('block.file')]: i.file_path }) + (i.edits || []).map((e, n) => blk(L('block.edit', { n: n + 1 }), diff(e.old_string, e.new_string))).join('');
    case 'Write': return kvs({ [L('block.file')]: i.file_path }) + blk(L('block.content'), `<div class="code">${esc(i.content)}</div>`, true);
    case 'AskUserQuestion': return (i.questions || []).map((q, n) => blk(q.header || L('ui.question') + ' ' + (n + 1),
      `<div class="code">${esc(q.question)}\n${(q.options || []).map((o) => `  • ${esc(o.label)}${o.description ? ' — ' + esc(o.description) : ''}`).join('\n')}</div>`)).join('');
    case 'TodoWrite': return blk(L('sec.tasks'), `<div class="code">${(i.todos || []).map((t) => `[${esc(t.status)}] ${esc(t.content)}`).join('\n')}</div>`);
    case 'Prompt': return blk(L('block.request'), `<div class="code">${esc(i.prompt)}</div>`, true);
    case 'Task': case 'Agent': return kvs({ [L('block.description')]: i.description, [L('block.type')]: i.subagent_type }) +
      (i.prompt ? blk(L('block.instructions'), `<div class="code">${esc(i.prompt)}</div>`, true) : '');
    default: return kvs(i);
  }
}

function eventBody(sid, a) {
  const d = S.details[`${sid}:${a.n}`];
  if (!d) return `<div class="sub">${ic('clock', 12, 'spin')} ${L('ui.loading')}</div>`;
  let h = inputHTML(a.tool, d.input);
  if (a.tool !== 'Prompt') {
    if (!a.done) h += `<div class="sub">${ic('clock', 12, 'spin')} ${L('ui.runningDots')}</div>`;
    else h += blk(a.error ? L('block.outputError') : L('block.output'), `<div class="out">${esc(d.output || L('ui.noOutput'))}</div>`, !!d.output);
  }
  return h;
}

function actTab(s) {
  let h = '';
  if (s.current) {
    h += `<div class="cur${en('f:b:cur')}">${toolIcon(s.current.tool, 32)}<div class="tx"><b>${esc(s.current.tool)}</b><code>${esc(s.current.summary)}</code></div>
      <span class="time" data-since="${s.current.ts}">${fmt(Date.now() - s.current.ts)}</span></div>`;
  }
  if (s.lastText) h += `<div class="${en('f:b:say')}"><div class="sec">${ic('sparkles', 12)} ${L('sec.latest')}</div><div class="say">${esc(s.lastText)}</div></div>`;
  const acts = [...s.activity].reverse();
  h += `<div><div class="sec">${ic('activity', 12)} ${L('sec.activity')}</div><div class="feed">${acts.map((a) => {
    const key = `${s.id}:${a.n}`, open = S.open.has(key);
    const status = a.tool === 'Prompt' ? '' : a.error ? `<span class="er">${ic('alert', 14)}</span>` : a.done ? `<span class="ok">${ic('check', 14)}</span>` : `<span class="run">${ic('clock', 14, 'spin')}</span>`;
    const tm = a.done && a.endedAt ? `<span class="tm" title="${clock(a.ts)}">${fmtMs(a.endedAt - a.ts)}</span>` : a.tool === 'Prompt' ? `<span class="tm">${clock(a.ts)}</span>` : `<span class="tm" data-since="${a.ts}">${fmt(Date.now() - a.ts)}</span>`;
    return `<div class="ev${open ? ' open' : ''}${en(`f:b:ev:${key}`)}">
      <div class="evh" data-ev="${a.n}">${toolIcon(a.tool, 24)}<span class="tn">${esc(a.tool)}</span><span class="sm">${esc(a.summary)}</span>
        <span class="st">${status}</span>${tm}<span class="ch">${ic('chevron', 14)}</span></div>
      <div class="evb"><div><div class="pad">${open ? eventBody(s.id, a) : ''}</div></div></div></div>`;
  }).join('') || `<div class="sub">${L('ui.noActivity')}</div>`}</div></div>`;
  return h;
}

function chatTab(s) {
  const c = S.conv[s.id];
  if (!c) return `<div class="empty">${ic('clock', 24, 'spin')}<span>${L('ui.loadingConv')}</span></div>`;
  if (!c.messages.length) return `<div class="empty">${ic('message', 26)}<span>${L('ui.noConv')}</span></div>`;
  return c.messages.map((m, i) => `<div class="msg ${m.role}${en(`f:b:m:${s.id}:${m.ts}:${i}`)}">
    <div class="av">${ic(m.role === 'user' ? 'user' : 'sparkles', 15)}</div>
    <div class="bd"><div class="who">${m.role === 'user' ? L('ui.you') : 'Claude'}<span style="font-weight:400">${clock(m.ts)}</span></div>
      ${m.text ? `<div class="tx">${esc(m.text)}</div>` : ''}
      ${m.tools.length ? `<div class="tchips">${m.tools.map((t) => `<span class="tchip">${toolIcon(t.name, 20)}<b>${esc(t.name)}</b><code>${esc(t.summary)}</code></span>`).join('')}</div>` : ''}
    </div></div>`).join('');
}

function tile(k, icn, id, v, extra = '') {
  const prev = S.prevTiles[id]; S.prevTiles[id] = v;
  return `<div class="tile"><div class="k">${ic(icn, 12)}${k}</div><div class="v${prev !== undefined && prev !== v ? ' pop' : ''}">${v}${extra}</div></div>`;
}

function infoTab(s) {
  const c = S.conv[s.id], u = c && c.usage;
  const max = Math.max(1, ...Object.values(s.toolCounts));
  const counts = Object.entries(s.toolCounts).sort((a, b) => b[1] - a[1]);
  const dur = s.status === 'done' ? `<span>${fmt(s.doneAt - s.since)}</span>` : `<span data-since="${s.since}">${fmt(Date.now() - s.since)}</span>`;
  let h = `<div class="tiles">
    ${tile(L('tile.status'), STATUS_ICON[s.status], s.id + 'st', statusText(s.status))}
    ${tile(L('tile.lastDuration'), 'clock', s.id + 'du' + s.status, dur)}
    ${tile(L('tile.toolsTurn'), 'wrench', s.id + 'tt', s.tools)}
    ${tile(L('tile.toolsTotal'), 'hash', s.id + 'ta', s.totalTools)}
    ${tile(L('tile.requests'), 'message', s.id + 'tu', s.turns)}
    ${tile(L('tile.errors'), 'alert', s.id + 'er', s.errors)}
    ${tile(L('tile.inputTokens'), 'layers', s.id + 'ti', u ? fmtN(u.input + u.cacheRead + u.cacheCreate) : '—', u && u.cacheRead ? ` <small>(${fmtN(u.cacheRead)} ${L('tile.cache')})</small>` : '')}
    ${tile(L('tile.outputTokens'), 'cpu', s.id + 'to', u ? fmtN(u.output) : '—')}
  </div>
  <div class="kvs big"><span class="k">${L('kv.model')}</span><span class="v">${esc((c && c.model) || '—')}</span>
    <span class="k">${L('kv.session')}</span><span class="v">${esc(s.id)}</span>
    <span class="k">${L('kv.folder')}</span><span class="v">${esc(s.cwd)}</span>
    <span class="k">${L('kv.transcript')}</span><span class="v">${esc(s.transcript || '—')}</span>
    <span class="k">${L('kv.started')}</span><span class="v">${clock(s.started)}</span></div>`;
  if (counts.length) h += `<div><div class="sec">${ic('wrench', 12)} ${L('sec.toolBreakdown')}</div><div class="bars">${counts.map(([t, n]) =>
    `<div class="brow"><span class="nm">${toolIcon(t, 20)}${esc(t)}</span><span class="tr"><b style="width:${Math.round((n / max) * 100)}%"></b></span><span class="ct">${n}</span></div>`).join('')}</div></div>`;
  if (s.files.length) h += `<div><div class="sec">${ic('folder', 12)} ${L('sec.touched')} (${s.files.length})</div>${s.files.map((f) =>
    `<div class="frow">${ic('fileText', 14)}<code title="${esc(f.path)}">&lrm;${esc(f.path)}</code>${f.reads ? `<span class="badge r">R ${f.reads}</span>` : ''}${f.writes ? `<span class="badge w">W ${f.writes}</span>` : ''}</div>`).join('')}</div>`;
  return h;
}

const cmpKey = (h) => h.replace(/ enter" style="--d:\d+ms/g, '').replace(/(data-(?:since|done|until|until-long)="\d+">|data-timer>)[^<]*/g, '$1')
  .replace(/stroke-dashoffset:[\d.e-]+/g, '');
function setHTML(el, html) {
  const k = cmpKey(html);
  if (el.__k === k) return false;
  el.__k = k; el.innerHTML = html; return true;
}

function ensureSkeleton(el) {
  if (el.querySelector('.fullgrid')) return;
  el.innerHTML = '<div class="fullgrid"><div class="side" id="fSide"></div><div class="detail"><div id="fHead"></div><div id="fPerm"></div><div id="fTodos"></div>' +
    '<div class="tabs"><div id="fTabs" style="display:flex"></div><div class="ind" style="width:' + TAB_W + 'px;left:' + S.lastInd * TAB_W + 'px"></div></div>' +
    '<div class="tabbody" id="fBody"></div></div></div>';
  el.querySelectorAll('#fHead,#fPerm,#fTodos').forEach((n) => (n.style.flexShrink = '0'));
}

function renderFull() {
  const el = $('full');
  const list = sorted();
  if (!el.querySelector('.fullgrid')) { for (const k of [...seen]) if (k.startsWith('f:')) seen.delete(k); }
  if (S.sel !== 'today' && S.sel !== 'settings' && !list.find((s) => s.id === S.sel)) S.sel = list.length ? list[0].id : 'today';
  const s = list.find((x) => x.id === S.sel);
  ensureSkeleton(el);

  const sideEl = $('fSide'), bodyEl = $('fBody');
  const sideScroll = sideEl.scrollTop, bodyScroll = bodyEl.scrollTop;

  const footTools = list.reduce((n, x) => n + x.totalTools, 0);
  const side = todayItem(S.sel === 'today') + list.map((x) => '<div class="sitem' + (x.id === S.sel ? ' sel' : '') + en('f:s:' + x.id) + '" data-sel="' + esc(x.id) + '">' +
    '<span class="dot ' + x.status + '"></span><div class="meta"><div class="name">' + esc(x.name) + '</div>' +
    '<div class="sub">' + (x.current ? ic(toolMeta(x.current.tool)[0], 12) + esc(x.current.tool) : esc(statusText(x.status))) + '</div></div></div>').join('') +
    '<div class="side-bottom">' + mediaCard('side') + settingsItem(S.sel === 'settings') +
    '<div class="side-foot"><span>' + LP('ui.sessions', list.length) + '</span><span>' + LP('ui.toolCalls', footTools) + '</span></div></div>';
  if (setHTML(sideEl, side)) sideEl.scrollTop = sideScroll;
  syncMedia();
  el.querySelector('.detail').classList.toggle('no-tabs', !s);

  if (S.sel === 'settings') {
    setHTML($('fHead'), settingsHead());
    setHTML($('fPerm'), S.pending.map((p) => permCard(p, true, 'f')).join(''));
    setHTML($('fTodos'), '');
    setHTML($('fTabs'), '');
    setBody(bodyEl, 'settings', settingsBody(), bodyScroll);
    return;
  }
  if (!s) {
    setHTML($('fHead'), todayHead());
    setHTML($('fPerm'), S.pending.map((p) => permCard(p, true, 'f')).join(''));
    setHTML($('fTodos'), '');
    setHTML($('fTabs'), '');
    setBody(bodyEl, 'today', todayBody(), bodyScroll);
    return;
  }

  const mine = S.pending.filter((p) => p.session_id === s.id);
  const others = S.pending.length - mine.length;
  const head = '<div class="dh"><span class="dot ' + s.status + '"></span>' +
    '<div class="t"><h3>' + esc(s.name) + '</h3><div class="path" title="' + esc(s.cwd) + '">' + ic('folder', 11) + '<span>' + esc(s.cwd) + '</span></div></div>' +
    '<span class="chip ' + s.status + '">' + ic(STATUS_ICON[s.status], 12) + statusText(s.status) + '</span>' +
    '<span class="ibtn" data-copypath="' + esc(s.cwd) + '" title="' + esc(L('ui.copyPath')) + '">' + ic('copy', 16) + '</span>' +
    '<span class="ibtn red" data-dismiss="' + esc(s.id) + '" title="' + esc(L('ui.remove')) + '">' + ic('trash', 16) + '</span></div>' +
    (others ? '<div class="hint" style="color:var(--amber)">' + ic('lock', 12) + ' ' + LP('ui.otherApprovals', others) + '</div>' : '');
  setHTML($('fHead'), head);
  setHTML($('fPerm'), mine.map((p) => permCard(p, false, 'f')).join(''));

  const done = s.todos.filter((t) => t.status === 'completed').length;
  setHTML($('fTodos'), s.todos.length ? '<div class="todos' + en('f:b:todos:' + s.id) + '"><div class="hd">' + ic('todo', 13) + ' ' + L('sec.tasks') + ' <span style="margin-left:2px">' + done + '/' + s.todos.length + '</span>' +
    '<span class="pbar"><b style="width:' + Math.round((done / s.todos.length) * 100) + '%"></b></span></div>' +
    s.todos.map((t) => '<div class="td ' + t.status + '"><span class="bx">' + (t.status === 'completed' ? ic('check', 11) : '') + '</span><span class="tx">' + esc(t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content) + '</span></div>').join('') + '</div>' : '');

  const tabDefs = { act: ['activity', L('tab.activity'), s.activity.length], chat: ['message', L('tab.chat'), ''], info: ['info', L('tab.info'), ''] };
  setHTML($('fTabs'), TABS.map((t) => '<div class="tab' + (S.tab === t ? ' on' : '') + '" data-tab="' + t + '" style="width:' + TAB_W + 'px">' + ic(tabDefs[t][0], 14) + tabDefs[t][1] +
    (tabDefs[t][2] !== '' ? '<span class="n">' + tabDefs[t][2] + '</span>' : '') + '</div>').join(''));
  const target = TABS.indexOf(S.tab);
  el.querySelector('.ind').style.left = target * TAB_W + 'px';
  S.lastInd = target;

  setBody(bodyEl, S.sel + ':' + S.tab, S.tab === 'act' ? actTab(s) : S.tab === 'chat' ? chatTab(s) : infoTab(s), bodyScroll);
}

function setBody(bodyEl, bodyKey, body, bodyScroll) {
  const switched = bodyEl.__bk !== bodyKey;
  if (switched) { if (bodyEl.__bk) S.scroll[bodyEl.__bk] = bodyScroll; bodyEl.__k = null; bodyEl.__bk = bodyKey; }
  if (setHTML(bodyEl, body)) bodyEl.scrollTop = switched ? (S.scroll[bodyKey] || 0) : bodyScroll;
}

const inflight = new Set();
function ensureData() {
  const s = selSession(); if (!s) return;
  for (const a of s.activity) {
    const key = `${s.id}:${a.n}`;
    if (!S.open.has(key)) continue;
    const c = S.details[key];
    if ((!c || (a.done && !c.done)) && !inflight.has(key)) {
      inflight.add(key);
      window.ccApi.getDetail(s.id, a.n).then((d) => { S.details[key] = { ...(d || { input: null, output: '' }), done: a.done }; inflight.delete(key); schedule(); });
    }
  }
  if ((S.tab === 'chat' || S.tab === 'info') && !inflight.has('c' + s.id)) {
    const c = S.conv[s.id];
    if (!c || (Date.now() - c.at > 2500 && s.status === 'working')) fetchConv(s.id);
  }
}
function fetchConv(sid) {
  inflight.add('c' + sid);
  window.ccApi.getTranscript(sid).then((d) => {
    inflight.delete('c' + sid);
    const prev = S.conv[sid];
    S.conv[sid] = { ...d, at: Date.now() };
    const last = d.messages[d.messages.length - 1];
    if (!prev || JSON.stringify(prev.usage) !== JSON.stringify(d.usage) || prev.messages.length !== d.messages.length ||
        (last && (prev.messages[prev.messages.length - 1] || {}).text !== last.text)) schedule();
  });
}

const RING_C = 75.4;
const trClean = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

function computeBase() {
  const list = sorted();
  const work = list.filter((s) => s.status === 'working');
  const withTodos = work.find((s) => s.todos && s.todos.length);
  const progress = withTodos ? withTodos.todos.filter((t) => t.status === 'completed').length / withTodos.todos.length : null;
  const one = work[0];
  return {
    kind: work.length ? (progress != null ? 'progress' : 'loading') : 'idle',
    work: work.length, total: list.length, done: list.filter((s) => s.status === 'done').length,
    tool: one && one.current ? one.current.tool : '', name: one ? one.name : '', progress, wait: S.pending.length,
    allQ: S.pending.length > 0 && S.pending.every((p) => p.questions),
  };
}

function setFlap(el, text) {
  if (!$('island').dataset.motion || $('island').dataset.motion === 'reduced') { el.textContent = text; return; }
  const chars = Array.from(text.slice(0, 28));
  el.innerHTML = chars.length
    ? chars.map((c, i) => `<span class="flap" style="--i:${Math.min(i, 14)}">${esc(c === ' ' ? '\u00a0' : c)}</span>`).join('')
    : '';
}

const AGENT_LABEL = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', cursor: 'Cursor' };
const agentTag = (s) => (s.agent && s.agent !== 'claude' ? `<span class="ag ag-${s.agent}">${esc(AGENT_LABEL[s.agent] || s.agent)}</span>` : '');
function agentTitle(list) {
  const ids = [...new Set(list.map((s) => s.agent || 'claude'))];
  return ids.length === 1 ? AGENT_LABEL[ids[0]] || ids[0] : L('ui.agents');
}
const sessionPet = (s) => CCPet.forState({ sessions: [s], pending: S.pending.filter((p) => p.session_id === s.id) });
function overlayPet(item, isQ) {
  if (isQ) return 'idea';
  if (item.kind === 'success') return 'celebrating';
  if (item.kind === 'error') return 'error';
  if (item.kind === 'loading' || item.kind === 'progress') return 'working-thinking';
  if (item.badge === 'timer') return 'working-typing';
  return 'notification';
}
let petT = null;
function syncPet(el) {
  CCPet.set(el, CCPet.forState({ sessions: S.sessions, pending: S.pending }));
  clearTimeout(petT);
  const ms = CCPet.nextChange({ sessions: S.sessions });
  if (ms) petT = setTimeout(schedule, ms);
}

function focusSession() {
  const list = sorted();
  return list.find((s) => s.status === 'working' && s.ctx) || list.find((s) => s.ctx) || null;
}
function syncCtxBar(bar) {
  if (!bar) return;
  const s = focusSession();
  const pct = s && s.ctx ? s.ctx.pct : null;
  bar.classList.toggle('on', pct != null);
  if (pct == null) return;
  bar.firstElementChild.style.width = Math.max(2, Math.round(pct * 100)) + '%';
  bar.dataset.level = pct >= 0.9 ? 'crit' : pct >= 0.7 ? 'warn' : 'ok';
  bar.title = L('ctx.title', { pct: Math.round(pct * 100), used: fmtN(s.ctx.used), max: fmtN(s.ctx.max) });
}

function diffPreview(diff, max = 14) {
  if (!diff || !diff.length) return '';
  const d = diff[0];
  const lines = [];
  for (const h of d.hunks) { for (const l of h.lines) { if (lines.length >= max) break; lines.push(l); } if (lines.length >= max) break; }
  const total = diff.reduce((a, f) => a + f.hunks.reduce((b, h) => b + h.lines.length, 0), 0);
  const name = String(d.file || '').split(/[\\/]/).pop();
  return `<div class="ov-diff"><div class="dh"><b>${esc(name)}</b>${d.isNew ? `<span class="nw">${esc(L('diff.new'))}</span>` : ''}<span class="ad">+${d.added || 0}</span><span class="rm">−${d.removed || 0}</span>${diff.length > 1 ? `<span class="mf">+${diff.length - 1}</span>` : ''}</div>
    <div class="dl">${lines.map((l) => `<div class="ln ${l.t === '+' ? 'a' : l.t === '-' ? 'r' : ''}"><i>${l.t === '+' ? l.n : l.t === '-' ? l.o : l.n || ''}</i><code>${esc(l.s) || ' '}</code></div>`).join('')}
    ${total > lines.length ? `<div class="more">${esc(L('diff.more', { n: total - lines.length }))}</div>` : ''}</div></div>`;
}

function renderCompact(el) {
  if (!el.__r) {
    el.innerHTML = `<div class="cp" role="button" tabindex="0" aria-label="${esc(L('ui.aria.status'))}" data-m="idle">
      <span class="cl"><svg class="ring" viewBox="0 0 28 28"><circle class="rt" cx="14" cy="14" r="12"/><circle class="rp" cx="14" cy="14" r="12"/></svg>${claudeIcon(21)}${CCPet.html('idle-living', 30, 'cp-pet')}</span>
      <span class="lb"></span><span class="tr"></span><span class="xw"></span><span class="ctxbar" aria-hidden="true"><i></i></span><span class="mu"><span class="mu-art" data-art></span><span class="wv"><i></i><i></i><i></i></span></span></div>`;
    el.__r = { cp: el.firstElementChild, ctx: el.querySelector('.ctxbar'), pet: el.querySelector('.pet'), ring: el.querySelector('.ring'), lb: el.querySelector('.lb'), tr: el.querySelector('.tr'), xw: el.querySelector('.xw'), mu: el.querySelector('.mu'), tk: '', lt: '' };
  }
  const { cp, ring, lb, tr, mu } = el.__r;
  const b = computeBase();
  const m = b.wait ? 'attn' : b.work ? 'busy' : b.total ? 'ready' : 'idle';
  cp.dataset.m = m;
  const text = m === 'attn' ? (b.allQ ? LP('ui.questions', b.wait) : LP('ui.pending', b.wait)) : m === 'busy' ? (b.tool ? `${b.tool} · ${b.name}` : LP('ui.running', b.work)) : m === 'ready' ? LP('ui.sessions', b.total) : '';
  if (text !== el.__r.lt) { el.__r.lt = text; setFlap(lb, text); }
  const petOn = document.documentElement.dataset.pet !== 'off';
  const tk = m + (m === 'ready' && b.done ? 'd' : '') + (m === 'attn' && b.allQ ? 'q' : '') + (petOn ? 'p' : '');
  if (tk !== el.__r.tk) {
    el.__r.tk = tk;
    tr.innerHTML = m === 'busy' ? (petOn ? '' : eq) : m === 'attn' ? ic(b.allQ ? 'help' : 'lock', 14) : m === 'ready' ? (b.done ? ic('circleCheck', 15) : '<span class="dot"></span>') : '';
  }
  const showRing = m === 'busy' || m === 'attn';
  ring.classList.toggle('on', showRing);
  ring.classList.toggle('indet', showRing && b.progress == null);
  if (b.progress != null && showRing) ring.style.setProperty('--off', String(RING_C * (1 - b.progress)));
  cp.setAttribute('aria-label', L('ui.aria.compact', { text: text || L('ui.idle') }));
  syncPet(el.__r.pet);
  mu.classList.toggle('on', !!(S.media && S.media.status === 'Playing'));
  compactExtras(el.__r.xw, m);
  syncCtxBar(el.__r.ctx);
  syncMedia();
}

const BADGES = { success: ['check', 'green'], error: ['alert', 'red'], notification: ['lock', 'amber'] };

const BADGE_COLOR = { help: 'blue', calendar: 'blue', timer: 'green' };
function renderOverlay(el, item) {
  if (!item) return;
  if (item.kind === 'level') return renderLevel(el, item);
  const hasSug = !!item.hasSug;
  const isQ = !!item.questions;
  const nav = item.actions && item.count > 1;
  const key = `${item.id}:${item.kind}:${!!item.actions}:${hasSug}:${item.pid || ''}:${isQ}:${item.buttons ? item.buttons.length : 0}:${nav ? item.count + ':' + item.bulkN : ''}`;
  if (el.__ik !== key) {
    el.__ik = key; el.__t1 = undefined;
    const bd = isQ ? ['help', 'blue'] : item.kind === 'notification' ? [item.badge || 'alert', BADGE_COLOR[item.badge] || 'amber'] : BADGES[item.kind];
    const ringOn = item.kind === 'loading' || item.kind === 'progress';
    el.innerHTML = `<div class="ov k-${isQ ? 'question' : item.kind}" role="group">
      <div class="ov-main">
        <span class="tile">${ringOn ? '<svg class="ring on" viewBox="0 0 28 28"><circle class="rt" cx="14" cy="14" r="12"/><circle class="rp" cx="14" cy="14" r="12"/></svg>' : ''}${item.kind === 'music' ? `<span class="mp-art big" data-art>${ic('music', 22)}</span>` : claudeIcon(30) + CCPet.html(overlayPet(item, isQ), 40, 'ov-pet')}
          ${bd ? `<span class="bd b-${bd[1]}">${ic(bd[0], 11, item.kind === 'success' ? 'tick' : '')}</span>` : ''}</span>
        <div class="ov-tx"><div class="t1"></div><div class="t2"></div>${ringOn ? '<div class="pg"><b></b></div>' : ''}</div>
        ${nav ? `<span class="ov-nav"><button class="pn" data-permnav="prev" aria-label="${esc(L('ui.prevReq'))}">${ic('chevron', 14)}</button><b class="pn-c"></b><button class="pn pn-r" data-permnav="next" aria-label="${esc(L('ui.nextReq'))}">${ic('chevron', 14)}</button></span>` : `<span class="ov-tr">${item.kind === 'music' ? WAVE : ''}</span>`}
      </div>
      ${item.buttons ? `<div class="ov-ac custom">${item.buttons.map((b) => `<button class="${b.cls}" ${b.attrs}>${b.icon ? ic(b.icon, 14) : ''}${esc(b.label)}</button>`).join('')}</div>` : ''}
      ${!isQ && item.actions && item.diff ? diffPreview(item.diff) : ''}
      ${isQ ? '<div class="ov-q"></div>' : item.actions ? `<div class="ov-ac">
        <button class="b-allow" data-act="allow">${ic('check', 14)}${L('ui.allow')}</button>
        <button class="b-deny" data-act="deny">${ic('x', 14)}${L('ui.deny')}</button>
        ${hasSug ? `<button class="b-always" data-act="always">${ic('shield', 14)}${L('ui.always')}</button>` : ''}
        <button class="b-ghost sq" data-act="rule" title="${esc(L('ui.ruleAllow', { pattern: item.ruleHint || item.tool || '' }))}" aria-label="${esc(L('ui.ruleAllow', { pattern: item.ruleHint || item.tool || '' }))}">${ic('zap', 14)}</button>
        <button class="b-ghost sq" data-act="terminal" title="${esc(L('ui.askTerminal'))}" aria-label="${esc(L('ui.askTerminal'))}">${ic('terminal', 14)}</button>
      </div>
      ${!isQ && item.bulkN > 1 ? `<div class="ov-bulk"><button class="bb a" data-bulk="allow">${ic('check', 12)}${esc(L('ui.allowAll', { n: item.bulkN }))}</button><button class="bb d" data-bulk="deny">${ic('x', 12)}${esc(L('ui.denyAll', { n: item.bulkN }))}</button></div>` : ''}` : ''}</div>`;
  }
  const set = (sel, v) => { const n = el.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
  const prevT1 = el.__t1; el.__t1 = item.title || '';
  if (prevT1 !== undefined && prevT1 !== el.__t1 && item.kind === 'music') { const tx = el.querySelector('.ov-tx'); tx.classList.remove('swap'); void tx.offsetWidth; tx.classList.add('swap'); }
  set('.t1', item.title || '');
  set('.t2', item.text || '');
  const tr = el.querySelector('.ov-tr');
  const pct = item.progress != null ? Math.round(item.progress * 100) : null;
  const trText = pct != null ? pct + '%' : item.count > 1 ? '+' + (item.count - 1) : '';
  const pnc = el.querySelector('.pn-c');
  if (pnc) pnc.textContent = `${((item.pi || 0) + 1)}/${item.count}`;
  if (item.kind !== 'music' && tr) { tr.textContent = trText; tr.classList.toggle('cnt', !!(item.count > 1 && pct == null)); }
  const ring = el.querySelector('.ring'), pg = el.querySelector('.pg');
  if (ring) { ring.classList.toggle('indet', pct == null); if (pct != null) ring.style.setProperty('--off', String(RING_C * (1 - item.progress))); }
  if (pg) { pg.classList.toggle('indet', pct == null); if (pct != null) pg.style.setProperty('--pg', pct + '%'); }
  if (isQ) setHTML(el.querySelector('.ov-q'), questionBody(item.pid, item.questions));
  else if (item.actions) el.querySelectorAll('[data-act]').forEach((b) => (b.dataset.id = String(item.pid)));
  el.querySelector('.ov').setAttribute('aria-label', `${item.title || ''}. ${item.text || ''}`);
  syncMedia();
}

function renderPeek(el) {
  const list = sorted();
  const rows = list.slice(0, 5).map((s) => {
    const t = s.status === 'done' ? ago(Date.now() - s.doneAt) : fmt(Date.now() - s.since);
    return `<div class="row${en('p:r:' + s.id)}"><span class="dot ${s.status}"></span>${CCPet.html(sessionPet(s), 30, 'row-pet')}<div class="meta">
      <div class="name">${esc(s.name)}${agentTag(s)}</div><div class="sub">${liveLine(s)}</div></div>
      <span class="time" data-${s.status === 'done' ? 'done' : 'since'}="${s.status === 'done' ? s.doneAt : s.since}">${t}</span></div>`;
  }).join('') || `<div class="empty${en('p:empty')}">${claudeIcon(30)}<span>${L('ui.noSessions')}</span></div>`;
  setHTML(el, `<div class="pk"><div class="pk-h">${claudeIcon(16)}<b>${esc(agentTitle(list))}</b><span>${LP('ui.sessions', list.length)}</span></div>${peekStrip()}${mediaCard('peek')}${rows}
    ${list.length ? `<div class="hint${en('p:hint')}">${ic('arrowRight', 12)} ${L('ui.clickDetails')}</div>` : ''}</div>`);
  syncMedia();
}

function renderFullView() {
  const list = sorted();
  const w = list.filter((s) => s.status === 'working').length;
  const fbSub = $('fbSub');
  if (fbSub) fbSub.textContent = LP('ui.sessions', list.length) + (w ? ' · ' + LP('ui.running', w) : '');

  if (window.CCFullView && window.CCFullView.mount) {
    if (!['today', 'settings', 'history'].includes(S.sel) && !list.find((s) => s.id === S.sel)) {
      S.sel = list.length ? list[0].id : 'today';
    }
    const s = list.find((x) => x.id === S.sel);
    const props = {
      sessions: list,
      pending: S.pending,
      selectedId: S.sel || 'today',
      details: S.details,
      conv: s ? S.conv[s.id] : null,
      media: S.media,
      calendar: S.calendar,
      timer: S.timer,
      usage: S.usage,
      settings: S.settings,
      themeInfo: S.themeInfo || { isDark: true, accent: null },
      focusReply: S.focusReply || 0,
      paletteToken: S.palette || 0,
      weather: W.weather,
    };
    const instance = window.CCFullView.mount($('full'), props);
    if (instance && !instance.__listenerAttached) {
      instance.__listenerAttached = true;
      instance.$on('select', (e) => {
        S.sel = e.detail;
        ensureData();
      });
      instance.$on('tabchange', (e) => {
        S.tab = e.detail;
        ensureData();
      });
    }
  } else {
    renderFull();
  }
  ensureData();
}

const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const mediaPos = (m) => {
  if (!m) return 0;
  const p = m.posMs + (m.status === 'Playing' ? Date.now() - m.at : 0);
  return Math.max(0, Math.min(m.durMs || p, p));
};
const WAVE = '<span class="wv"><i></i><i></i><i></i><i></i></span>';

function mediaCard(kind) {
  const m = S.media;
  if (!m || !m.title) return '';
  const playing = m.status === 'Playing';
  return '<div class="mp mp-' + kind + '"><div class="mp-top"><span class="mp-art" data-art>' + ic('music', 20) + '</span>' +
    '<div class="mp-tx"><div class="mp-t" title="' + esc(m.title) + '">' + esc(m.title) + '</div><div class="mp-a">' + esc(m.artist) + (m.app && m.app !== 'Spotify' ? ' · ' + esc(m.app) : '') + '</div></div>' + (playing ? WAVE : '') + '</div>' +
    '<div class="mp-prog"' + (m.canSeek ? ' data-seek' : '') + ' role="progressbar" aria-label="' + esc(L('music.progress')) + '"><b data-mprog></b></div>' +
    '<div class="mp-times"><span data-mtime>0:00</span><span>' + mmss(m.durMs) + '</span></div>' +
    '<div class="mp-ctl"><button class="mc" data-media="prev" aria-label="' + esc(L('music.prev')) + '"' + (m.canPrev ? '' : ' disabled') + '>' + ic('skipBack', 16) + '</button>' +
    '<button class="mc big" data-media="toggle" aria-label="' + esc(playing ? L('music.pause') : L('music.play')) + '">' + ic(playing ? 'pauseF' : 'play', 18) + '</button>' +
    '<button class="mc" data-media="next" aria-label="' + esc(L('music.next')) + '"' + (m.canNext ? '' : ' disabled') + '>' + ic('skipFwd', 16) + '</button></div></div>';
}

function syncMedia() {
  const art = S.art || null;
  document.querySelectorAll('[data-art]').forEach((el) => {
    if (el.__a !== art) { el.__a = art; el.style.backgroundImage = art ? 'url("' + art + '")' : ''; el.classList.toggle('has', !!art); }
  });
  const m = S.media;
  const playing = !!m && m.status === 'Playing';
  document.querySelectorAll('.cp .mu').forEach((el) => el.classList.toggle('on', playing && document.contains(el)));
  document.querySelectorAll('.mp').forEach((el) => el.classList.toggle('paused', !!m && !playing));
  document.querySelectorAll('[data-media="toggle"]').forEach((b) => {
    if (b.__p !== playing) { b.__p = playing; b.innerHTML = ic(playing ? 'pauseF' : 'play', 18);
      b.setAttribute('aria-label', playing ? L('music.pause') : L('music.play')); }
  });
  if (!m) return;
  const p = mediaPos(m), d = m.durMs || 1;
  document.querySelectorAll('[data-mprog]').forEach((e) => { e.style.width = Math.min(100, (p / d) * 100) + '%'; });
  document.querySelectorAll('[data-mtime]').forEach((e) => { const t = mmss(p); if (e.textContent !== t) e.textContent = t; });
}

let musicTimer = 0;
function announceTrack() {
  musicTimer = 0;
  const m = S.media;
  if (m && m.status === 'Playing') island.push({ id: 'music', kind: 'music', priority: 2, title: m.title, text: m.artist, duration: 2800 });
}

function onMedia(m) {
  const prev = S.media;
  S.media = m && m.title ? m : null;
  S.art = m ? m.art : null;
  const key = S.media ? S.media.title + '|' + S.media.artist : '';
  if (S.media && S.media.status === 'Playing' && S.lastTrack !== undefined && key !== S.lastTrack) {
    clearTimeout(musicTimer);
    musicTimer = setTimeout(announceTrack, 700);
  }
  if (S.media || prev) S.lastTrack = key;
  island.refresh();
  syncMedia();
}

let surfaceTimer = 0, surfaceToken = 0;
const sendSurface = (v) => window.ccApi.surface && window.ccApi.surface(v);
window.expandSoon = function () {
  const token = ++surfaceToken;
  sendSurface('expanding');
  setTimeout(() => { if (token === surfaceToken && island && !island._dead) island.expand(); }, 60);
};
let surfaceObs = null;
function initSurfaceObserver() {
  if (surfaceObs) return;
  surfaceObs = new MutationObserver(() => {
    const v = $('island').dataset.view;
    clearTimeout(surfaceTimer);
    if (!v) return;
    if (v === 'compact') surfaceTimer = setTimeout(() => { if (island && island.cur.view === 'compact') sendSurface('compact'); }, 750);
    else sendSurface(v);
  });
  surfaceObs.observe($('island'), { attributes: true, attributeFilter: ['data-view'] });
}
let audio = null;
function beep(freqs, important) {
  if (S.sound === 'off' || (S.sound === 'important' && !important)) return;
  if (S.game && !important) return;
  try {
    const ctx = audio || (audio = new AudioContext());
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    freqs.forEach((f) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(.14, t); g.gain.exponentialRampToValueAtTime(.001, t + .2);
      o.start(t); o.stop(t + .2); t += .13;
    });
  } catch {}
}

function summaryLine(sum) {
  if (!sum) return '';
  const parts = [LP('sum.tools', sum.tools)];
  if (sum.files && sum.files.length) parts.push(LP('sum.files', sum.files.length));
  if (sum.errors) parts.push(LP('sum.errors', sum.errors));
  return parts.join(' · ');
}
const doneText = (s) => {
  const line = summaryLine(s.lastSummary);
  const msg = trClean(s.lastText || s.prompt || L('ui.taskDone'), 110);
  return line ? line + ' — ' + msg : msg;
};
const doneTitle = (s, name) => {
  const sum = s && s.lastSummary;
  return L('notif.done', { name }) + (sum && sum.end > sum.start ? ' · ' + fmt(sum.end - sum.start) : '');
};

function onState({ sessions, pending, notify }) {
  S.sessions = sessions; S.pending = pending; S.permIdx = S.permIdx || 0;

  if (pending.length) {
    if (!Number.isFinite(S.permIdx) || S.permIdx >= pending.length) S.permIdx = 0;
    const idx = Math.max(0, S.permIdx | 0), p = pending[idx], s = sessions.find((x) => x.id === p.session_id);
    const name = s ? s.name : L('ui.session');
    const bulkN = pending.filter((x) => !x.questions).length;
    island.push(p.questions
      ? { id: 'perm', kind: 'notification', persistent: true, priority: 10, title: L('notif.question', { name }), text: '',
        badge: 'help', actions: true, pid: p.id, hasSug: false, questions: p.questions, count: pending.length, pi: idx, bulkN, sid: p.session_id }
      : { id: 'perm', kind: 'notification', persistent: true, priority: 10, title: L('notif.permission', { name }),
        text: `${p.tool}  ${p.summary}`, badge: 'lock', actions: true, pid: p.id, hasSug: p.hasSug, ruleHint: p.ruleHint, diff: p.diff, questions: null, count: pending.length, pi: idx, bulkN, sid: p.session_id });
  } else { island.dismiss('perm'); S.permIdx = 0; }
  for (const pid of Object.keys(S.ans)) if (!pending.some((p) => p.id === +pid)) delete S.ans[pid];

  for (const s of sessions) {
    const prev = S.errSeen[s.id];
    if (prev !== undefined && s.errors > prev) {
      const a = [...s.activity].reverse().find((x) => x.error);
      island.push({ id: `err:${s.id}:${s.errors}`, kind: 'error', title: L('notif.error', { name: s.name }), text: a ? `${a.tool}  ${a.summary}` : L('ui.toolFailed'), duration: 5200 });
      beep([330, 247]);
    }
    S.errSeen[s.id] = s.errors;
  }

  if (notify) {
    const s = sessions.find((x) => x.id === notify.id);
    const name = s ? s.name : L('ui.session');
    if (notify.type === 'done') {
      const id = `done:${notify.id}:${Date.now()}`; S.doneId[notify.id] = id;
      const canReply = s && s.agent !== 'cursor';
      island.push({ id, kind: 'success', title: doneTitle(s, name), text: s ? doneText(s) : '', duration: canReply ? 9000 : 4800,
        buttons: canReply ? [{ cls: 'b-allow', icon: 'message', label: L('ui.reply'), attrs: `data-reply="${esc(s.id)}"` }] : null });
      beep([660, 880, 1100]);
    } else if (notify.type === 'waiting') {
      island.push({ id: `wait:${notify.id}:${Date.now()}`, kind: 'notification', badge: 'alert', title: L('notif.waiting', { name }), text: trClean(s && s.message, 120), duration: 7000 });
      beep([880, 660, 880], true);
    } else if (notify.type === 'stuck' && s && s.alert) {
      const a = s.alert;
      const text = a.kind === 'loop' ? L('stuck.loop', { tool: a.tool, summary: trClean(a.summary, 70) })
        : a.kind === 'tool' ? L('stuck.tool', { tool: a.tool, t: fmt(a.ms), summary: trClean(a.summary, 60) })
        : L('stuck.quiet', { t: fmt(a.ms) });
      island.push({ id: `stuck:${notify.id}:${Date.now()}`, kind: 'notification', badge: 'alert', title: L('stuck.title', { name }), text, duration: 10000,
        buttons: s.agent !== 'cursor' ? [{ cls: 'b-allow', icon: 'message', label: L('ui.reply'), attrs: `data-reply="${esc(s.id)}"` }] : null });
      beep([520, 440], true);
    } else if (notify.type === 'permission' || notify.type === 'question') { S.sel = notify.id; beep([880, 660, 880], true); }
  }
  for (const s of sessions) { const id = S.doneId[s.id]; if (id && island.has(id)) island.update(id, { title: doneTitle(s, s.name), text: doneText(s) }); }

  island.setBase(computeBase());
}

function onPointer(e) {
  const t = e.target;
  const interactive = t.closest('[data-reply],[data-media],[data-seek],[data-qopt],[data-qsubmit],[data-act],[data-copy],[data-copypath],[data-dismiss],[data-sel],[data-tab],[data-ev],[data-toggle]');
  if (!interactive && !widgetPointer(t)) {
    if (!island.expanded) { window.expandSoon(); e.preventDefault(); return true; }
  }
  const rp = t.closest('[data-reply]');
  if (rp) {
    S.sel = rp.dataset.reply; S.focusReply = Date.now();
    const done = S.doneId[rp.dataset.reply]; if (done) island.dismiss(done);
    if (!island.expanded) window.expandSoon(); else schedule();
    e.preventDefault(); return true;
  }
  const mc = t.closest('[data-media]');
  if (mc) {
    if (!mc.disabled) {
      window.ccApi.media(mc.dataset.media);
      if (mc.dataset.media === 'toggle' && S.media && S.media.durMs) {
        S.media.posMs = mediaPos(S.media);
        S.media.status = S.media.status === 'Playing' ? 'Paused' : 'Playing';
        S.media.at = Date.now();
        syncMedia();
      }
    }
    e.preventDefault(); return true;
  }
  const sk = t.closest('[data-seek]');
  if (sk && S.media && S.media.durMs) {
    const rc = sk.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - rc.left) / rc.width));
    const ms = Math.round(f * S.media.durMs);
    window.ccApi.media('seek:' + ms);
    S.media.posMs = ms; S.media.at = Date.now(); syncMedia();
    return true;
  }
  const qo = t.closest('[data-qopt]');
  if (qo) { const [pid, qi, oi] = qo.dataset.qopt.split(':').map(Number); pickOption(pid, qi, oi); e.preventDefault(); return true; }
  const qs = t.closest('[data-qsubmit]');
  if (qs) { if (!qs.disabled) sendAnswers(+qs.dataset.qsubmit); e.preventDefault(); return true; }
  if (widgetPointer(t)) { e.preventDefault(); return true; }
  const nav = t.closest('[data-permnav]');
  if (nav) { navPerm(nav.dataset.permnav === 'prev' ? -1 : 1); e.preventDefault(); return true; }
  const bulk = t.closest('[data-bulk]');
  if (bulk) {
    S.pending.filter((x) => !x.questions).map((x) => x.id).forEach((id) => window.ccApi.decide(id, bulk.dataset.bulk));
    S.permIdx = 0;
    e.preventDefault(); return true;
  }
  const act = t.closest('[data-act]');
  if (act) { window.ccApi.decide(+act.dataset.id, act.dataset.act); e.preventDefault(); return true; }
  const cp = t.closest('[data-copy]');
  if (cp) { const b = cp.closest('.blk'); const src = b && b.querySelector('.code,.out'); if (src) window.ccApi.copy(src.textContent); cp.classList.add('pop'); setTimeout(() => cp.classList.remove('pop'), 500); return true; }
  const cpp = t.closest('[data-copypath]'); if (cpp) { window.ccApi.copy(cpp.dataset.copypath); return true; }
  const dm = t.closest('[data-dismiss]'); if (dm) { window.ccApi.dismiss(dm.dataset.dismiss); return true; }
  const si = t.closest('[data-sel]'); if (si) { S.sel = si.dataset.sel; forget('f:b:'); schedule(); return true; }
  const tb = t.closest('[data-tab]'); if (tb) { if (S.tab !== tb.dataset.tab) { S.tab = tb.dataset.tab; forget('f:b:'); schedule(); } return true; }
  const ev = t.closest('[data-ev]');
  if (ev) { const key = `${S.sel}:${ev.dataset.ev}`; S.open.has(key) ? S.open.delete(key) : S.open.add(key); schedule(); return true; }
  if (island.expanded && !t.closest('[data-toggle]')) return true;
  return false;
}

let demoTimers = [];
function runDemo() {
  demoTimers.forEach(clearTimeout); demoTimers = [];
  ['demo-n', 'demo-l', 'demo-s', 'demo-e'].forEach((id) => island.dismiss(id));
  const at = (ms, fn) => demoTimers.push(setTimeout(fn, ms));
  island.push({ id: 'demo-n', kind: 'notification', badge: 'alert', title: L('demo.newTitle'), text: L('demo.newText'), duration: 3000 });
  at(3900, () => island.push({ id: 'demo-l', kind: 'progress', persistent: true, title: L('demo.scanning'), text: L('demo.reviewing'), progress: null }));
  for (let i = 0; i <= 10; i++) at(5400 + i * 380, () => island.update('demo-l', { progress: i / 10, text: L('demo.progress', { i: i * 12 + 8 }), title: i === 10 ? L('demo.almost') : L('demo.scanning') }));
  at(9900, () => { island.dismiss('demo-l'); island.push({ id: 'demo-s', kind: 'success', title: L('demo.done'), text: L('demo.testsPassed'), duration: 3200 }); });
  at(13600, () => island.push({ id: 'demo-e', kind: 'error', title: L('demo.errorTitle'), text: L('demo.errorText'), duration: 4200 }));
}

let lastScroll = 0;
const scrollAc = new AbortController();
document.addEventListener('scroll', () => { lastScroll = Date.now(); }, { capture: true, signal: scrollAc.signal });
document.addEventListener('wheel', () => { lastScroll = Date.now(); }, { capture: true, passive: true, signal: scrollAc.signal });

island = new DynamicIsland($('island'), {
  defer: () => Date.now() - lastScroll < 350,
  render: { compact: withFrame(renderCompact), overlay: withFrame(renderOverlay), peek: withFrame(renderPeek), full: withFrame(renderFullView) },
  onPointer,
  onShow: (view) => { if (view === 'peek') forget('p:'); if (view === 'full') forget('f:'); },
  onHover: (over) => {
    if (over && !island.expanded && island.cur.view === 'compact') sendSurface('peek');
    window.ccApi.mouseOver(over);
  },
});
$('fbL').innerHTML = `${claudeIcon(20)}Claude Code<small id="fbSub"></small>`;
$('fbX').innerHTML = ic('chevron', 18).replace('<svg ', '<svg style="transform:rotate(180deg)" ');

function applyStaticI18n() {
  document.documentElement.lang = I18N.lang;
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', L(el.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', L(el.dataset.i18nTitle)));
}

window.ccApi.onSettings((s) => {
  S.settings = s;
  I18N.setLang(s.lang || 'en');
  S.sound = s.sound || 'on';
  applyStaticI18n();
  island.setMotionMode(s.motion || 'on');
  island.setShape(s.shape || 'notch');
  const legacy = s.radius != null ? s.radius : 100;
  island.setRadii({ compact: s.radiusCompact ?? legacy, overlay: s.radiusOverlay ?? legacy, peek: s.radiusPeek ?? legacy, full: s.radiusFull ?? legacy });
  const root = document.documentElement.style;
  root.setProperty('--notch-h', (s.notchHeight || 34) + 'px');
  root.setProperty('--notch-w', (s.notchWidth || 104) + 'px');
  root.setProperty('--notch-label', (s.notchLabel || 150) + 'px');
  document.documentElement.dataset.pet = s.pet === 'off' ? 'off' : 'on';
  schedule();
});
if (window.ccApi.onPermNav) window.ccApi.onPermNav((d) => navPerm(d === 'prev' ? -1 : 1));
window.ccApi.onState(onState);
if (window.ccApi.onCtxWarn) window.ccApi.onCtxWarn((d) => {
  island.push({ id: 'ctx:' + d.id + ':' + Math.round(d.pct * 100), kind: 'notification', badge: 'alert', title: L('ctx.warnTitle', { name: d.name, pct: Math.round(d.pct * 100) }),
    text: L(d.pct >= 0.95 ? 'ctx.warnCrit' : 'ctx.warn'), duration: 9000 });
  beep([660, 520], true);
});
if (window.ccApi.onUsage) window.ccApi.onUsage((u) => { W.usage = u; W.usageAt = Date.now(); schedule(); });
if (window.ccApi.onWeather) window.ccApi.onWeather((w) => { W.weather = w; schedule(); });
if (window.ccApi.getWeather) window.ccApi.getWeather().then((w) => { W.weather = w; schedule(); });
if (window.ccApi.onPalette) window.ccApi.onPalette(() => { S.palette = Date.now(); if (!island.expanded) window.expandSoon(); else schedule(); });
if (window.ccApi.onGame) window.ccApi.onGame((v) => { S.game = !!v; });
window.ccApi.onMedia(onMedia);
window.ccApi.onDemo(runDemo);
if (window.ccApi.onOpenFull) window.ccApi.onOpenFull(() => window.expandSoon());
if (window.ccApi.onToggleFull) window.ccApi.onToggleFull(() => { island.expanded ? island.collapse() : window.expandSoon(); });
initSurfaceObserver();

if (window.ccApi.getThemeInfo) {
  window.ccApi.getThemeInfo().then((t) => { if (t) { S.themeInfo = t; schedule(); } });
}
if (window.ccApi.onThemeChanged) {
  window.ccApi.onThemeChanged((t) => { if (t) { S.themeInfo = t; schedule(); } });
}
if (window.ccApi.onCalendar) {
  window.ccApi.onCalendar((c) => { S.calendar = c; schedule(); });
}
if (window.ccApi.onTimer) {
  window.ccApi.onTimer((t) => { S.timer = t; schedule(); });
}
let usageBusy = false;
function loadUsage() {
  if (usageBusy || !window.ccApi.getUsage) return;
  usageBusy = true;
  window.ccApi.getUsage().then((u) => { usageBusy = false; if (u) { S.usage = u; schedule(); } }, () => { usageBusy = false; });
}
loadUsage();

applyStaticI18n();

document.documentElement.classList.add('cc-boot');
setTimeout(() => document.documentElement.classList.remove('cc-boot'), 900);

const tickId = setInterval(() => {
  if (document.hidden) return;
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach((e) => (e.textContent = fmt(now - +e.dataset.since)));
  document.querySelectorAll('[data-done]').forEach((e) => (e.textContent = ago(now - +e.dataset.done)));
}, 1000);
const mediaId = setInterval(() => { if (!document.hidden && S.media) syncMedia(); }, 500);
const dataId = setInterval(() => { if (island.expanded && S.tab !== 'act') ensureData(); }, 2500);
const usageId = setInterval(() => { if (island.expanded) loadUsage(); }, 60000);
window.addEventListener('beforeunload', () => { clearInterval(tickId); clearInterval(dataId); clearInterval(mediaId); clearInterval(usageId); demoTimers.forEach(clearTimeout); clearTimeout(musicTimer); island.destroy(); scrollAc.abort(); });
