const DAY = 86400000;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const WIN_TZ = {
  'Turkey Standard Time': 'Europe/Istanbul', 'GTB Standard Time': 'Europe/Bucharest', 'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kiev', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik', 'Russian Standard Time': 'Europe/Moscow', 'Arabic Standard Time': 'Asia/Baghdad',
  'Arab Standard Time': 'Asia/Riyadh', 'Israel Standard Time': 'Asia/Jerusalem', 'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo', 'AUS Eastern Standard Time': 'Australia/Sydney',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
};

const tzCache = new Map();
function zone(tzid) {
  if (!tzid) return null;
  if (tzCache.has(tzid)) return tzCache.get(tzid);
  let z = WIN_TZ[tzid] || tzid.replace(/^\/[^/]+\/[^/]+\//, '');
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); } catch { z = null; }
  tzCache.set(tzid, z);
  return z;
}

const fmtCache = new Map();
function tzOffset(z, utc) {
  let f = fmtCache.get(z);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    fmtCache.set(z, f);
  }
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(utc))) p[type] = +value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utc / 1000) * 1000;
}

function wallToUtc(wall, z) {
  if (z === 'UTC') return wall;
  if (!z) { const d = new Date(wall); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime(); }
  const guess = wall - tzOffset(z, wall);
  return wall - tzOffset(z, guess);
}

function parseTime(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value || '');
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const allDay = !m[4] || (params && params.VALUE === 'DATE');
  const z = m[7] ? 'UTC' : allDay ? null : zone(params && params.TZID);
  return { wall, z, allDay, utc: wallToUtc(wall, z) };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 3600000) + ((+m[5] || 0) * 60000) + ((+m[6] || 0) * 1000);
  return m[1] === '-' ? -ms : ms;
}

const unescape = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function parseICS(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null, depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { props: {} }; depth = 0; continue; }
    if (!cur) continue;
    if (line.startsWith('BEGIN:')) { depth++; continue; }
    if (line.startsWith('END:')) { if (line === 'END:VEVENT' && depth === 0) { events.push(cur.props); cur = null; } else depth--; continue; }
    if (depth) continue;
    let i = 0, q = false;
    for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
    if (i >= line.length) continue;
    const [name, ...ps] = line.slice(0, i).split(';');
    const params = {};
    for (const p of ps) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); }
    const key = name.toUpperCase();
    const entry = { value: line.slice(i + 1), params };
    if (key === 'EXDATE') (cur.props.EXDATE = cur.props.EXDATE || []).push(entry);
    else if (!(key in cur.props)) cur.props[key] = entry;
  }
  return events;
}

const MEET = /https?:\/\/[^\s"<>]*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si)[^\s"<>]*/i;

function rrule(v) {
  const r = {};
  for (const part of String(v || '').split(';')) { const [k, x] = part.split('='); if (k) r[k.toUpperCase()] = x || ''; }
  return r;
}

function expand(startWall, r, from, to, max = 3000) {
  const out = [];
  const freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1);
  const count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseTime(r.UNTIL).wall + (r.UNTIL.length === 8 ? DAY - 1 : 0) : Infinity;
  const tod = ((startWall % DAY) + DAY) % DAY, startDay = startWall - tod;
  const sd = new Date(startWall);
  let n = 0;
  const emit = (dayMs) => {
    const t = dayMs + tod;
    if (t < startWall) return true;
    if (t > until || n >= count) return false;
    n++;
    if (t >= from && t <= to) out.push(t);
    return t <= to;
  };
  const days = (r.BYDAY || '').split(',').filter(Boolean).map((d) => { const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d); return m && { n: m[1] ? +m[1] : 0, wd: WD[m[2]] }; }).filter(Boolean);
  const skipTo = count === Infinity ? Math.max(startDay, from - 40 * DAY) : startDay;

  if (freq === 'DAILY') {
    let k = Math.ceil((skipTo - startDay) / DAY / interval);
    for (let i = 0; i < 100000; i++, k++) { if (!emit(startDay + k * interval * DAY)) break; if (out.length >= max) break; }
  } else if (freq === 'WEEKLY') {
    const wds = (days.length ? days.map((d) => d.wd) : [sd.getUTCDay()]).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const weekStart = startDay - ((sd.getUTCDay() + 6) % 7) * DAY;
    let w = Math.max(0, Math.floor((skipTo - weekStart) / (7 * DAY) / interval));
    for (let i = 0; i < 20000; i++, w++) {
      const base = weekStart + w * interval * 7 * DAY;
      let go = true;
      for (const wd of wds) { if (!emit(base + ((wd + 6) % 7) * DAY)) { go = false; break; } }
      if (!go || out.length >= max) break;
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const y0 = sd.getUTCFullYear(), m0 = sd.getUTCMonth();
    const monthDays = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
    let k = 0;
    if (count === Infinity) {
      const f = new Date(skipTo); const diff = (f.getUTCFullYear() - y0) * 12 + f.getUTCMonth() - m0;
      k = Math.max(0, Math.floor(diff / (freq === 'YEARLY' ? 12 : 1) / interval));
    }
    for (let i = 0; i < 5000; i++, k++) {
      const months = freq === 'YEARLY' ? k * interval * 12 : k * interval;
      const y = y0 + Math.floor((m0 + months) / 12), m = (m0 + months) % 12;
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      let cand = [];
      if (days.length) {
        for (const d of days) {
          const all = [];
          for (let day = 1; day <= dim; day++) if (new Date(Date.UTC(y, m, day)).getUTCDay() === d.wd) all.push(day);
          if (!d.n) cand.push(...all); else { const pick = d.n > 0 ? all[d.n - 1] : all[all.length + d.n]; if (pick) cand.push(pick); }
        }
      } else if (monthDays.length) cand = monthDays.map((d) => (d < 0 ? dim + d + 1 : d)).filter((d) => d >= 1 && d <= dim);
      else if (sd.getUTCDate() <= dim) cand = [sd.getUTCDate()];
      let go = true;
      for (const day of [...new Set(cand)].sort((a, b) => a - b)) { if (!emit(Date.UTC(y, m, day))) { go = false; break; } }
      if (!go || out.length >= max) break;
    }
  } else out.push(startWall);
  return out;
}

function eventsBetween(text, from, to) {
  const raw = parseICS(text);
  const overridden = new Map();
  for (const p of raw) {
    if (!p['RECURRENCE-ID'] || !p.UID) continue;
    const t = parseTime(p['RECURRENCE-ID'].value, p['RECURRENCE-ID'].params);
    if (t) (overridden.get(p.UID.value) || overridden.set(p.UID.value, new Set()).get(p.UID.value)).add(t.utc);
  }
  const out = [];
  for (const p of raw) {
    if (!p.DTSTART || (p.STATUS && p.STATUS.value.toUpperCase() === 'CANCELLED')) continue;
    const st = parseTime(p.DTSTART.value, p.DTSTART.params);
    if (!st) continue;
    const en = p.DTEND && parseTime(p.DTEND.value, p.DTEND.params);
    const dur = en ? en.utc - st.utc : p.DURATION ? parseDuration(p.DURATION.value) || 0 : st.allDay ? DAY : 0;
    const uid = p.UID ? p.UID.value : '';
    const title = p.SUMMARY ? unescape(p.SUMMARY.value).trim() : '';
    const location = p.LOCATION ? unescape(p.LOCATION.value).trim() : '';
    const hay = [location, p.DESCRIPTION && unescape(p.DESCRIPTION.value), p.URL && p.URL.value, p['X-GOOGLE-CONFERENCE'] && p['X-GOOGLE-CONFERENCE'].value].filter(Boolean).join(' ');
    const lm = MEET.exec(hay);
    const base = { title, location, allDay: st.allDay, link: lm ? lm[0] : '' };
    const toUtc = (wall) => (st.allDay ? wallToUtc(wall, null) : wallToUtc(wall, st.z));

    let starts;
    if (p.RRULE && !p['RECURRENCE-ID']) {
      const ex = new Set((p.EXDATE || []).flatMap((e) => e.value.split(',').map((v) => { const t = parseTime(v, e.params); return t && t.utc; })));
      const skip = overridden.get(uid) || new Set();
      starts = expand(st.wall, rrule(p.RRULE.value), from - dur - 2 * DAY - (st.utc - st.wall), to + 2 * DAY - (st.utc - st.wall))
        .map(toUtc).filter((u) => !ex.has(u) && !skip.has(u));
    } else starts = [st.utc];

    for (const s of starts) {
      const e = s + Math.max(0, dur);
      if (e < from || s > to) continue;
      out.push({ id: uid + ':' + s, ...base, start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

module.exports = { parseICS, eventsBetween, parseDuration, expand, wallToUtc };
