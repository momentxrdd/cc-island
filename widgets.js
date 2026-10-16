const W = { timer: null, cal: { events: [], error: '', at: 0 }, calOn: false, osdOn: true, usage: null, usageAt: 0, usageBusy: false };
const MIN = 60000;

const hm = (ts) => new Date(ts).toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' });
const clockText = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
const money = (v) => (v >= 100 ? '$' + v.toFixed(0) : v >= 10 ? '$' + v.toFixed(1) : '$' + v.toFixed(2));
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const range = (e) => (e.allDay ? L('cal.allDay') : hm(e.start) + '–' + hm(e.end));
const title = (e) => e.title || L('cal.untitled');

const timerLeft = (t = W.timer) => (!t ? 0 : t.paused ? t.left : Math.max(0, t.endsAt - Date.now()));
const timerFrac = (t = W.timer) => (!t || !t.dur ? 0 : 1 - timerLeft(t) / t.dur);
const phaseText = (t) => (!t ? L('timer.ready') : t.paused ? L('timer.paused') : L(t.phase === 'break' ? 'timer.break' : 'timer.focus'));

const upcoming = () => { const now = Date.now(); return W.cal.events.filter((e) => !e.allDay && e.end > now); };
function soonEvent() {
  const now = Date.now();
  return W.cal.events.find((e) => !e.allDay && e.start - now <= 15 * MIN && now - e.start < 5 * MIN) || null;
}
const untilLong = (start) => {
  const m = Math.max(1, Math.ceil((start - Date.now()) / MIN));
  return L('cal.in', { t: m >= 60 ? L('dur.hm', { h: Math.floor(m / 60), m: m % 60 }) : L('cal.chipMin', { m }) });
};
const untilText = (e) => { const d = e.start - Date.now(); return d <= 0 ? L('cal.now') : L('cal.chipMin', { m: Math.max(1, Math.ceil(d / MIN)) }); };

function compactExtras(el) {
  const t = W.timer, e = soonEvent();
  const key = (t ? t.phase + (t.paused ? 'p' : '') : '') + '|' + (e ? e.id : '');
  if (el.__xk !== key) {
    el.__xk = key;
    el.innerHTML = (e ? `<span class="xc cal" title="${esc(title(e))}">${ic('calendar', 12)}<b data-until="${e.start}">${untilText(e)}</b></span>` : '') +
      (t ? `<span class="xc tmr ${t.phase}${t.paused ? ' paused' : ''}"><svg class="mini" viewBox="0 0 16 16"><circle class="rt" cx="8" cy="8" r="6.5"/><circle class="rp" cx="8" cy="8" r="6.5" data-tring/></svg><b data-timer>${clockText(timerLeft())}</b></span>` : '');
  }
  el.classList.toggle('on', !!(t || e));
}

function todayItem(selected) {
  const next = upcoming()[0];
  const sub = W.timer ? `${ic('timer', 12)}<span data-timer>${clockText(timerLeft())}</span> · ${esc(phaseText(W.timer))}`
    : next ? `${ic('calendar', 12)}<span>${esc(hm(next.start))} ${esc(title(next))}</span>`
    : W.calOn ? esc(L('today.nothing')) : esc(new Date().toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long' }));
  return `<div class="sitem today-item${selected ? ' sel' : ''}${en('f:s:today')}" data-sel="today">
    <span class="tdi">${ic('calendar', 15)}</span><div class="meta"><div class="name">${esc(L('today.title'))}</div><div class="sub">${sub}</div></div></div>`;
}

function todayHead() {
  return `<div class="dh"><span class="tdi big">${ic('calendar', 18)}</span><div class="t"><h3>${esc(L('today.title'))}</h3>
    <div class="path"><span>${esc(new Date().toLocaleDateString(I18N.locale, { weekday: 'long', day: 'numeric', month: 'long' }))}</span></div></div></div>`;
}

function calCard() {
  const head = `<div class="ch">${ic('calendar', 14)}<b>${L('cal.title')}</b>${W.calOn ? `<span class="ibtn sm push" data-cal="refresh" title="${esc(L('cal.refresh') || '')}">${ic('refresh', 13)}</span>` : ''}</div>`;
  if (!W.calOn) {
    return `<section class="card calc">${head}<div class="cal-empty">${ic('calendar', 26)}<b>${L('cal.empty')}</b><p>${esc(L('cal.howto'))}</p>
      <button class="b-ghost" data-cal="paste">${ic('copy', 14)}${L('cal.paste')}</button></div></section>`;
  }
  const now = Date.now(), t0 = dayStart(now);
  const today = W.cal.events.filter((e) => e.start < t0 + 864e5 && e.end > t0);
  const tomorrow = W.cal.events.filter((e) => e.start >= t0 + 864e5);
  const next = upcoming()[0];
  const row = (e) => {
    const live = !e.allDay && e.start <= now && e.end > now, past = e.end <= now;
    const badge = live ? `<span class="evbadge live">${L('cal.now')}</span>` : e === next ? `<span class="evbadge next" data-until-long="${e.start}">${esc(untilLong(e.start))}</span>` : '';
    const meta = badge + (e.location ? `<span class="loc">${ic('mapPin', 11)}${esc(e.location)}</span>` : '');
    return `<div class="ev-row${live ? ' live' : ''}${past ? ' past' : ''}${e === next ? ' next' : ''}">
      <span class="ev-t">${esc(range(e))}</span>
      <div class="ev-m"><b title="${esc(title(e))}">${esc(title(e))}</b>${meta ? `<small>${meta}</small>` : ''}</div>
      ${e.link && !past ? `<button class="b-allow sm" data-link="${esc(e.link)}" title="${esc(L('cal.join'))}">${ic('video', 13)}${L('cal.join')}</button>` : ''}</div>`;
  };
  let body = today.length ? today.map(row).join('') : `<div class="sub pad">${L('cal.none')}</div>`;
  if (today.length && !today.some((e) => e.end > now)) body += `<div class="sub pad">${L('cal.none')}</div>`;
  if (tomorrow.length) body += `<div class="sec tm">${L('cal.tomorrow')}</div>` + tomorrow.slice(0, 6).map(row).join('');
  if (W.cal.error) body = `<div class="cal-err">${ic('alert', 13)}${esc(W.cal.error)}</div>` + body;
  return `<section class="card calc">${head}<div class="ev-list">${body}</div></section>`;
}

const RING_T = 2 * Math.PI * 52;
function timerCard() {
  const t = W.timer;
  const fm = (W.set && W.set.focusMin) || 25, bm = (W.set && W.set.breakMin) || 5;
  const btns = !t
    ? `<button class="b-allow" data-timer-cmd="focus" data-arg="${fm}">${ic('timer', 14)}${L('timer.min', { m: fm })}</button>
       ${fm !== 50 ? `<button class="b-ghost" data-timer-cmd="focus" data-arg="50">${L('timer.min', { m: 50 })}</button>` : ''}
       <button class="b-ghost" data-timer-cmd="break" data-arg="${bm}">${ic('coffee', 14)}${L('timer.breakMin', { m: bm })}</button>`
    : `<button class="${t.paused ? 'b-allow' : 'b-ghost'}" data-timer-cmd="${t.paused ? 'resume' : 'pause'}">${ic(t.paused ? 'play' : 'pauseF', 13)}${L(t.paused ? 'timer.resume' : 'timer.pause')}</button>
       <button class="b-ghost" data-timer-cmd="add">${ic('plus', 14)}${L('timer.add')}</button>
       <button class="b-ghost" data-timer-cmd="stop">${ic('square', 13)}${L('timer.stop')}</button>`;
  return `<section class="card tmrc ${t ? t.phase : 'idle'}${t && t.paused ? ' paused' : ''}">
    <div class="ch">${ic('timer', 14)}<b>${L('timer.title')}</b>${t && t.cycles ? `<span class="push sub">${esc(LP('timer.cycles', t.cycles))}</span>` : ''}</div>
    <div class="big-ring"><svg viewBox="0 0 120 120"><circle class="rt" cx="60" cy="60" r="52"/><circle class="rp" cx="60" cy="60" r="52" data-tring-big
      style="stroke-dasharray:${RING_T};stroke-dashoffset:${RING_T * (1 - timerFrac())}"/></svg>
      <div class="ring-tx"><b data-timer>${t ? clockText(timerLeft()) : clockText(fm * MIN)}</b><span>${esc(phaseText(t))}</span></div></div>
    <div class="btns center">${btns}</div></section>`;
}

function usageCard() {
  const u = W.usage;
  const head = `<div class="ch">${ic('sparkles', 14)}<b>${L('usage.title')}</b><span class="push sub">${L('usage.note')}</span></div>`;
  if (!u) return `<section class="card usec">${head}<div class="sub pad">${ic('clock', 12, 'spin')} ${L('usage.loading')}</div></section>`;
  if (!u.week.calls) return `<section class="card usec">${head}<div class="sub pad">${L('usage.none')}</div></section>`;
  const max = Math.max(...u.daily.map((d) => d.cost), 0.01);
  const today = u.daily[u.daily.length - 1].day;
  const bars = u.daily.map((d) => {
    const [y, m, dd] = d.day.split('-').map(Number);
    const name = new Date(y, m - 1, dd).toLocaleDateString(I18N.locale, { weekday: 'short' });
    return `<div class="ub${d.day === today ? ' now' : ''}" title="${esc(name)}: ${money(d.cost)} · ${esc(L('usage.tokens', { n: fmtN(d.tokens) }))}">
      <span class="ubv">${d.cost ? money(d.cost) : ''}</span><span class="ubt"><b style="height:${Math.max(d.cost ? 4 : 0, Math.round((d.cost / max) * 100))}%"></b></span><span class="ubl">${esc(name)}</span></div>`;
  }).join('');
  const pmax = Math.max(...u.projects.map((p) => p.cost), 0.01);
  const projects = u.projects.map((p) => `<div class="brow"><span class="nm" title="${esc(p.name)}">${ic('folder', 12)}<span>${esc(p.name)}</span></span>
    <span class="tr"><b style="width:${Math.round((p.cost / pmax) * 100)}%"></b></span><span class="ct wide">${money(p.cost)}</span></div>`).join('');
  const models = u.models.map((m) => `<span class="mchip">${esc(m.name)}<b>${money(m.cost)}</b></span>`).join('');
  return `<section class="card usec">${head}
    <div class="tiles">
      ${tile(L('usage.today'), 'zap', 'u:t', money(u.today.cost), ` <small>${esc(fmtN(u.today.tokens))}</small>`)}
      ${tile(L('usage.week'), 'calendar', 'u:w', money(u.week.cost), ` <small>${esc(fmtN(u.week.tokens))}</small>`)}
      ${tile(L('usage.output'), 'cpu', 'u:o', fmtN(u.week.output))}
      ${tile(L('usage.calls'), 'hash', 'u:c', fmtN(u.week.calls))}
    </div>
    <div class="ubars">${bars}</div>
    ${projects ? `<div><div class="sec">${ic('folder', 12)} ${L('usage.projects')}</div><div class="bars">${projects}</div></div>` : ''}
    ${models ? `<div class="mchips">${models}</div>` : ''}
    ${u.unpriced && u.unpriced.length ? `<div class="sub">${esc(L('usage.unpriced', { m: u.unpriced.join(', ') }))}</div>` : ''}
  </section>`;
}

function todayBody() {
  loadUsage();
  return `<div class="today${en('f:b:today')}"><div class="tgrid">${calCard()}${timerCard()}</div>${usageCard()}</div>`;
}

function loadUsage(force) {
  if (W.usageBusy || (!force && W.usage && Date.now() - W.usageAt < 60000)) return;
  W.usageBusy = true;
  window.ccApi.getUsage().then((u) => { W.usageBusy = false; W.usageAt = Date.now(); if (u) { W.usage = u; schedule(); } }, () => { W.usageBusy = false; });
}

function peekStrip() {
  const next = upcoming()[0], t = W.timer;
  if (!next && !t) return '';
  return `<div class="pk-today">${next ? `<span class="pt">${ic('calendar', 12)}<b>${esc(hm(next.start))}</b><span>${esc(title(next))}</span></span>` : ''}
    ${t ? `<span class="pt tm ${t.phase}">${ic('timer', 12)}<b data-timer>${clockText(timerLeft())}</b><span>${esc(phaseText(t))}</span></span>` : ''}</div>`;
}

function tickWidgets() {
  const left = clockText(timerLeft()), frac = timerFrac();
  document.querySelectorAll('[data-timer]').forEach((e) => { if (W.timer && e.textContent !== left) e.textContent = left; });
  document.querySelectorAll('[data-tring]').forEach((e) => e.style.strokeDashoffset = String(40.84 * (1 - frac)));
  document.querySelectorAll('[data-tring-big]').forEach((e) => e.style.strokeDashoffset = String(RING_T * (1 - frac)));
  document.querySelectorAll('[data-until]').forEach((e) => { const t = untilText({ start: +e.dataset.until }); if (e.textContent !== t) e.textContent = t; });
  document.querySelectorAll('[data-until-long]').forEach((e) => { const t = untilLong(+e.dataset.untilLong); if (e.textContent !== t) e.textContent = t; });
  const k = (soonEvent() || {}).id || '';
  if (k !== W.lastSoon) { W.lastSoon = k; schedule(); }
}

const OSD_ICON = { volume: (o) => (o.muted || o.value === 0 ? 'volumeX' : 'volume'), brightness: () => 'sun', battery: (o) => (o.charging ? 'batteryCharging' : 'battery') };
function showOsd(o) {
  if (!W.osdOn) return;
  const label = o.kind === 'volume' ? (o.muted ? L('osd.muted') : L('osd.volume')) : o.kind === 'brightness' ? L('osd.brightness') : o.charging ? L('osd.charging') : L('osd.unplugged');
  island.push({ id: 'osd', kind: 'level', priority: 6, preempt: true, duration: o.kind === 'battery' ? 2600 : 1500,
    icon: OSD_ICON[o.kind](o), title: label, value: o.muted ? 0 : o.value, muted: !!o.muted, osd: o.kind, charging: !!o.charging });
}

function renderLevel(el, item) {
  const key = 'lvl:' + item.icon + ':' + item.osd;
  if (el.__ik !== key) {
    el.__ik = key; el.__t1 = undefined;
    el.innerHTML = `<div class="ov k-level o-${item.osd}${item.charging ? ' charging' : ''}" role="status"><span class="lv-i">${ic(item.icon, 18)}</span>
      <div class="lv-tx"><span class="lv-l"></span><div class="lv-bar"><b></b></div></div><span class="lv-v"></span></div>`;
  }
  el.querySelector('.lv-l').textContent = item.title;
  el.querySelector('.lv-bar b').style.width = item.value + '%';
  el.querySelector('.lv-v').textContent = item.value + '%';
  el.querySelector('.ov').classList.toggle('muted', !!item.muted);
  el.querySelector('.ov').setAttribute('aria-label', `${item.title} ${item.value}%`);
}

function watchBattery() {
  if (!navigator.getBattery) return;
  navigator.getBattery().then((b) => {
    let warned = 101;
    const pct = () => Math.round(b.level * 100);
    b.addEventListener('chargingchange', () => {
      if (!W.osdOn) return;
      if (b.charging) warned = 101;
      showOsd({ kind: 'battery', value: pct(), charging: b.charging });
      window.ccApi.hold(3200);
    });
    b.addEventListener('levelchange', () => {
      const p = pct();
      if (b.charging || !W.osdOn) return;
      const step = [20, 10, 5].find((x) => p <= x && x < warned);
      if (!step) return;
      warned = step;
      island.push({ id: 'battery-low', kind: 'error', title: L('battery.low', { p }), text: L('battery.lowText'), duration: 6000 });
      window.ccApi.hold(6500);
      beep([440, 330], true);
    });
  }).catch(() => {});
}

function widgetPointer(t) {
  if (settingsPointer(t)) return true;
  const tc = t.closest('[data-timer-cmd]');
  if (tc) { window.ccApi.timer(tc.dataset.timerCmd, tc.dataset.arg ? +tc.dataset.arg : undefined); return true; }
  const cc = t.closest('[data-cal]');
  if (cc) { window.ccApi.calendar(cc.dataset.cal); return true; }
  const lk = t.closest('[data-link]');
  if (lk) { window.ccApi.openLink(lk.dataset.link); return true; }
  return false;
}

window.ccApi.onTimer((t) => { W.timer = t; schedule(); });
window.ccApi.onTimerDone(({ phase, next }) => {
  const focus = (W.set && W.set.focusMin) || 25;
  island.push(phase === 'focus'
    ? { id: 'timer-done:' + Date.now(), kind: 'success', title: L('timer.doneFocus'), text: next ? L('timer.doneFocusText', { m: next }) : L('timer.doneBreakText'), duration: 6000,
      buttons: next ? null : [{ cls: 'b-allow', icon: 'coffee', label: L('timer.breakMin', { m: (W.set && W.set.breakMin) || 5 }), attrs: `data-timer-cmd="break" data-arg="${(W.set && W.set.breakMin) || 5}"` }] }
    : { id: 'timer-done:' + Date.now(), kind: 'notification', badge: 'timer', title: L('timer.doneBreak'), text: L('timer.doneBreakText'), duration: 6000,
      buttons: [{ cls: 'b-allow', icon: 'timer', label: L('timer.min', { m: focus }), attrs: `data-timer-cmd="focus" data-arg="${focus}"` }] });
  beep(phase === 'focus' ? [660, 880, 1100] : [880, 660, 880], true);
});
window.ccApi.onCalendar((c) => { W.cal = c || { events: [] }; schedule(); });
window.ccApi.onCalAlert(({ kind, event: e }) => {
  island.push({ id: 'cal:' + e.id + ':' + kind, kind: 'notification', badge: 'calendar', title: title(e),
    text: (kind === 'now' ? L('cal.startingNow') : L('cal.startsIn', { m: Math.max(1, Math.round((e.start - Date.now()) / MIN)) })) + ' · ' + range(e),
    duration: 8500, buttons: e.link ? [{ cls: 'b-allow', icon: 'video', label: L('cal.join'), attrs: `data-link="${esc(e.link)}"` }] : null });
  beep([660, 880], true);
});
window.ccApi.onOsd(showOsd);
window.ccApi.onNotice((n) => island.push({ id: 'notice:' + Date.now(), kind: n.kind === 'error' ? 'error' : 'success', title: n.text, text: '', duration: 4500 }));
window.ccApi.onSettings((s) => { W.set = s; W.calOn = !!s.calendarOn; W.osdOn = s.osd !== 'off'; schedule(); });
watchBattery();
setInterval(tickWidgets, 1000);
setInterval(() => { if (island.expanded && S.sel === 'today') loadUsage(); }, 15000);
