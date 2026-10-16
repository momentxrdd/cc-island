function settingsItem(selected) {
  return `<div class="sitem settings-item${selected ? ' sel' : ''}" data-sel="settings">
    <span class="tdi gray">${ic('settings', 15)}</span><div class="meta"><div class="name">${esc(L('set.title'))}</div></div></div>`;
}

function settingsHead() {
  return `<div class="dh"><span class="tdi big gray">${ic('settings', 18)}</span><div class="t"><h3>${esc(L('set.title'))}</h3>
    <div class="path"><span>${esc(L('set.sub'))}</span></div></div></div>`;
}

const seg = (key, cur, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, label]) =>
  `<button class="${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-set="${key}" data-val='${JSON.stringify(v)}'>${esc(label)}</button>`).join('')}</div>`;
const sw = (on, attrs) => `<button class="sw${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" ${attrs}><i></i></button>`;
const stepper = (key, val, step, min, max) => `<div class="stepper">
  <button data-set="${key}" data-val="${Math.max(min, val - step)}"${val <= min ? ' disabled' : ''} aria-label="-">${ic('minus', 13)}</button>
  <b>${esc(L('set.minutes', { m: val }))}</b>
  <button data-set="${key}" data-val="${Math.min(max, val + step)}"${val >= max ? ' disabled' : ''} aria-label="+">${ic('plus', 13)}</button></div>`;
const row = (icon, color, label, desc, control) => `<div class="srow"><span class="si c-${color}">${ic(icon, 15)}</span>
  <div class="st"><b>${esc(label)}</b>${desc ? `<small>${desc}</small>` : ''}</div><div class="sc">${control}</div></div>`;
const group = (title, rows) => `<section class="sgroup"><div class="sec">${esc(title)}</div><div class="slist">${rows.join('')}</div></section>`;

function settingsBody() {
  const s = W.set || {};
  const cal = W.cal || { events: [] };
  const calDesc = s.calendarOn
    ? (cal.error ? `<span class="bad">${esc(L('cal.error', { e: cal.error }))}</span>` : esc(L('set.calOn', { n: cal.events.length, t: cal.at ? hm(cal.at) : '…' })))
    : esc(L('set.calOff')) + '<br>' + esc(L('cal.howto'));
  return `<div class="set${en('f:b:settings')}">
  ${group(L('set.general'), [
    row('languages', 'blue', L('set.lang'), esc(L('set.langDesc')), seg('lang', s.langPref || 'auto', [['auto', L('set.auto')], ['en', 'English'], ['tr', 'Türkçe']])),
    row('monitor', 'purple', L('set.display'), esc(L('set.displayDesc')), seg('display', s.display, [['primary', L('set.primary')], ['cursor', L('set.cursor')]])),
    row('power', 'green', L('set.login'), esc(L('set.loginDesc')), sw(s.startAtLogin, 'data-login')),
  ])}
  ${group(L('set.alerts'), [
    row('bell', 'amber', L('set.sound'), esc(L('set.soundDesc')), seg('sound', s.sound, [['on', L('set.all')], ['important', L('set.important')], ['off', L('set.off')]])),
    row('wave', 'pink', L('set.motion'), esc(L('set.motionDesc')), seg('motion', s.motion, [['on', L('set.on')], ['system', L('set.windows')], ['off', L('set.off')]])),
    row('volume', 'cyan', L('set.osd'), esc(L('set.osdDesc')), sw(s.osd !== 'off', `data-set="osd" data-val='${JSON.stringify(s.osd === 'off' ? 'on' : 'off')}'`)),
  ])}
  ${group(L('set.music'), [
    row('music', 'green', L('set.media'), esc(L('set.mediaDesc')), seg('media', s.media, [['spotify', L('set.spotify')], ['all', L('set.anyPlayer')], ['off', L('set.off')]])),
  ])}
  ${group(L('set.timer'), [
    row('timer', 'orange', L('set.focus'), '', stepper('focusMin', s.focusMin || 25, 5, 5, 180)),
    row('coffee', 'teal', L('set.break'), '', stepper('breakMin', s.breakMin || 5, 1, 1, 60)),
    row('coffee', 'teal', L('set.longBreak'), esc(L('set.longBreakDesc')), stepper('longBreakMin', s.longBreakMin || 15, 5, 5, 60)),
    row('play', 'orange', L('set.autoBreak'), esc(L('set.autoBreakDesc')), sw(s.autoBreak !== false, `data-set="autoBreak" data-val='${JSON.stringify(s.autoBreak === false)}'`)),
  ])}
  ${group(L('set.calendar'), [
    row('calendar', 'blue', L('set.calStatus'), calDesc, s.calendarOn
      ? `<button class="b-ghost sm" data-cal="refresh">${ic('refresh', 13)}${esc(L('cal.refresh'))}</button><button class="b-ghost sm danger" data-cal="disconnect">${esc(L('cal.disconnect'))}</button>`
      : `<button class="b-allow sm" data-cal="paste">${ic('link', 13)}${esc(L('cal.paste'))}</button>`),
  ])}
  ${group(L('set.claude'), [
    row('plug', 'orange', L('set.hooks'), esc(L('set.hooksDesc')),
      `<span class="pill ${s.hooksInstalled ? 'ok' : 'warn'}">${esc(L(s.hooksInstalled ? 'set.installed' : 'set.notInstalled'))}</span>` +
      (s.hooksInstalled ? `<button class="b-ghost sm" data-hooks="remove">${esc(L('set.remove'))}</button>` : `<button class="b-allow sm" data-hooks="install">${esc(L('set.install'))}</button>`)),
    row('sparkles', 'pink', L('set.demo'), esc(L('set.demoDesc')), `<button class="b-ghost sm" data-appcmd="demo">${ic('play', 12)}${esc(L('set.run'))}</button>`),
    row('trash', 'gray', L('set.clear'), esc(L('set.clearDesc')), `<button class="b-ghost sm" data-appcmd="clear">${esc(L('set.clearBtn'))}</button>`),
  ])}
  ${group(L('set.about'), [
    `<div class="about">${claudeIcon(28)}<div class="st"><b>CC Island <span class="ver">v${esc(s.version || '')}</span></b>
      <small>${esc(L('set.port'))}: <code>${esc(s.port || '')}</code> · ${esc(L('set.file'))}: <code title="${esc(s.settingsPath || '')}">${esc(s.settingsPath || '')}</code></small></div>
      <button class="b-ghost sm danger" data-appcmd="quit">${ic('power', 13)}${esc(L('set.quit'))}</button></div>`,
  ])}
  </div>`;
}

function settingsPointer(t) {
  const b = t.closest('[data-set]');
  if (b) { if (!b.disabled) window.ccApi.setSetting(b.dataset.set, JSON.parse(b.dataset.val)); return true; }
  if (t.closest('[data-login]')) { window.ccApi.setLogin(!(W.set && W.set.startAtLogin)); return true; }
  const h = t.closest('[data-hooks]');
  if (h) { window.ccApi.hooks(h.dataset.hooks); return true; }
  const a = t.closest('[data-appcmd]');
  if (a) { window.ccApi.app(a.dataset.appcmd); return true; }
  return false;
}

window.ccApi.onOpenSettings(() => { S.sel = 'settings'; forget('f:b:'); window.expandSoon ? window.expandSoon() : island.expand(); });
