<script>
  import { onMount, onDestroy } from 'svelte';
  import { Button } from 'fluent-svelte-extra';
  import Icon from './Icon.svelte';

  export let calendar = null;
  export let timer = null;
  export let usage = null;
  export let settings = {};

  let now = Date.now(), tick;
  onMount(() => { tick = setInterval(() => (now = Date.now()), 1000); });
  onDestroy(() => clearInterval(tick));

  const api = (fn, ...a) => window.ccApi && window.ccApi[fn] && window.ccApi[fn](...a);
  const timerCmd = (cmd, arg) => api('timer', cmd, arg);
  const LOC = 'tr-TR';

  $: focusMin = settings.focusMin || 25;
  $: breakMin = settings.breakMin || 5;
  let dur = null;
  $: if (dur == null && settings.focusMin) dur = settings.focusMin;
  const step = (d) => (dur = Math.min(180, Math.max(5, (dur || focusMin) + d)));
  $: left = !timer ? (dur || focusMin) * 60000 : timer.paused ? timer.left : Math.max(0, timer.endsAt - now);
  $: frac = timer && timer.dur ? Math.min(1, Math.max(0, 1 - left / timer.dur)) : 0;
  const R = 58, C = 2 * Math.PI * R;
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s % 60).padStart(2, '0'); };
  $: phaseLabel = !timer ? 'dakika odak' : timer.paused ? 'duraklatıldı' : timer.phase === 'break' ? 'mola' : 'kaldı';
  $: cycles = timer ? timer.cycles || 0 : 0;
  $: sync = settings.focusSync !== 'off';
  const hm = (ms) => new Date(ms).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });

  const DAY = 86400000;
  const day0 = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
  const WEEK = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  $: today = day0(now);
  let month = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); })();
  let selected = day0(Date.now());
  $: gridStart = (() => { const d = new Date(month); const dow = (d.getDay() + 6) % 7; return addDays(month, -dow); })();
  $: cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  $: monthLabel = new Date(month).toLocaleDateString(LOC, { month: 'long', year: 'numeric' });
  const shiftMonth = (n) => { const d = new Date(month); month = new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };
  function goToday() { const d = new Date(); month = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); selected = day0(Date.now()); }
  function pick(ts) {
    selected = ts;
    const d = new Date(ts);
    if (d.getMonth() !== new Date(month).getMonth()) month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }

  let rangeEvents = [], rangeKey = '', loading = false;
  $: connected = !!settings.calendarOn;
  $: reqKey = connected ? gridStart + ':' + (calendar && calendar.at) + ':' + settings.calSystem + ':' + settings.icalOn : '';
  $: if (reqKey !== rangeKey) loadRange(reqKey, gridStart);
  async function loadRange(key, from) {
    rangeKey = key;
    if (!key || !(window.ccApi && window.ccApi.calendarRange)) { rangeEvents = []; return; }
    loading = true;
    const r = await window.ccApi.calendarRange(from, 42);
    if (key !== rangeKey) return;
    rangeEvents = (r && r.events) || [];
    loading = false;
  }
  $: allEvents = (() => {
    const m = new Map();
    for (const e of [...rangeEvents, ...((calendar && calendar.events) || [])]) m.set(e.id + '|' + e.start, e);
    return [...m.values()];
  })();
  const onDay = (list, ts) => { const end = addDays(ts, 1); return list.filter((e) => e.start < end && e.end > ts).sort((a, b) => (b.allDay - a.allDay) || a.start - b.start); };
  $: byDay = new Map(cells.map((ts) => [ts, onDay(allEvents, ts)]));
  $: dayEvents = byDay.get(selected) || onDay(allEvents, selected);
  $: selLabel = selected === today ? 'Bugün' : selected === addDays(today, 1) ? 'Yarın'
    : new Date(selected).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
  $: sourceText = [settings.calSystem !== 'off' && 'Windows Takvim', settings.icalOn && 'iCal'].filter(Boolean).join(' · ');
  function until(e) {
    if (e.allDay) return '';
    if (e.start <= now && e.end > now) return 'Şimdi';
    if (e.end <= now) return 'Bitti';
    const m = Math.ceil((e.start - now) / 60000);
    return m < 60 ? m + ' dk sonra' : '';
  }
  function onGridKey(ev) {
    const k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
    if (!k) return;
    ev.preventDefault();
    pick(addDays(selected, k));
  }

  $: u = usage && usage.today ? usage.today : { tokens: 0, output: 0, cost: 0, calls: 0 };
  const tok = (n) => (!n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
  const money = (v) => (!v ? '$0' : v >= 100 ? '$' + v.toFixed(0) : v >= 10 ? '$' + v.toFixed(1) : '$' + v.toFixed(2));
</script>

<div class="page">
  <h1 class="title">
    <span class="crumb">CC Island</span>
    <Icon name="chevronRight" size={16} className="crumb-sep" />
    <span>Bugün</span>
  </h1>
  <div class="date">{new Date(now).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>

  <section class="td-card focus" class:running={!!timer} class:brk={timer && timer.phase === 'break'}>
    <div class="f-ring" aria-hidden="true">
      <svg viewBox="0 0 132 132">
        <circle class="f-track" cx="66" cy="66" r={R} />
        <circle class="f-bar" cx="66" cy="66" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
      </svg>
      <div class="f-in">
        {#if timer}<span class="f-digits">{clock(left)}</span>{:else}<span class="f-digits big">{dur || focusMin}</span>{/if}
        <span class="f-phase">{phaseLabel}</span>
      </div>
    </div>

    <div class="f-side">
      <div class="f-h">
        <h2>Odak oturumu</h2>
        {#if sync}<span class="tag" title="Odak başlayınca Windows odak modu da açılır"><Icon name="bell" size={12} />Windows odağı</span>{/if}
      </div>
      <p class="td-sub">
        {#if !timer}{sync ? 'Bildirimler susar, ' : ''}geri sayım kapsülde görünür.
        {:else if timer.paused}Duraklatıldı, kalan süreden devam eder.
        {:else}{timer.phase === 'break' ? 'Mola' : 'Odak'} {hm(timer.endsAt)}'de bitiyor{timer.windows ? ' · Windows\'tan başlatıldı' : ''}.{/if}
      </p>
      <div class="f-row">
        {#if !timer}
          <div class="td-stepper" role="group" aria-label="Odak süresi">
            <button type="button" class="td-st" on:click={() => step(-5)} disabled={dur <= 5} aria-label="5 dakika azalt"><Icon name="minus" size={14} /></button>
            <button type="button" class="td-st" on:click={() => step(5)} disabled={dur >= 180} aria-label="5 dakika artır"><Icon name="plus" size={14} /></button>
          </div>
          <Button variant="accent" on:click={() => timerCmd('focus', dur || focusMin)}><Icon name="play" size={14} filled />&nbsp;Başlat</Button>
          <Button on:click={() => timerCmd('break')}>{breakMin} dk mola</Button>
        {:else}
          <Button variant="accent" on:click={() => timerCmd(timer.paused ? 'resume' : 'pause')}>
            <Icon name={timer.paused ? 'play' : 'pause'} size={14} filled />&nbsp;{timer.paused ? 'Devam et' : 'Duraklat'}
          </Button>
          <Button on:click={() => timerCmd('add')}>+5 dk</Button>
          <Button on:click={() => timerCmd('stop')}>Bitir</Button>
        {/if}
      </div>
      <div class="cycles" aria-label="Odak döngüsü {cycles % 4} / 4">
        {#each [0, 1, 2, 3] as i}<span class="cy" class:on={i < cycles % 4}></span>{/each}
        <span>{cycles ? `${cycles} odak tamamlandı` : 'Her 4 odakta bir uzun mola'}</span>
      </div>
    </div>
  </section>

  <section class="td-card cal">
    <div class="cal-h">
      <div class="cal-t">
        <h2 class="month">{monthLabel}</h2>
        <span>{connected ? sourceText + (loading ? ' · yükleniyor…' : '') : 'Takvim kaynağı kapalı'}</span>
      </div>
      <button type="button" class="ib txt" on:click={goToday} disabled={month === new Date(new Date(today).getFullYear(), new Date(today).getMonth(), 1).getTime() && selected === today}>Bugün</button>
      <button type="button" class="ib" aria-label="Önceki ay" on:click={() => shiftMonth(-1)}><Icon name="chevronRight" size={16} className="flip" /></button>
      <button type="button" class="ib" aria-label="Sonraki ay" on:click={() => shiftMonth(1)}><Icon name="chevronRight" size={16} /></button>
      {#if connected}<button type="button" class="ib" aria-label="Takvimi yenile" title="Yenile" on:click={() => api('calendar', 'refresh')}><Icon name="refresh" size={16} /></button>{/if}
    </div>

    <div class="cal-body">
      <div class="grid" role="grid" aria-label={monthLabel} tabindex="0" on:keydown={onGridKey}>
        {#each WEEK as w}<span class="wd" role="columnheader">{w}</span>{/each}
        {#each cells as ts (ts)}
          {@const evs = byDay.get(ts) || []}
          {@const out = new Date(ts).getMonth() !== new Date(month).getMonth()}
          <button type="button" role="gridcell" class="dc" class:out class:today={ts === today} class:sel={ts === selected}
            aria-selected={ts === selected} aria-label="{new Date(ts).toLocaleDateString(LOC, { day: 'numeric', month: 'long' })}{evs.length ? ', ' + evs.length + ' etkinlik' : ''}"
            tabindex="-1" on:click={() => pick(ts)}>
            <span class="n">{new Date(ts).getDate()}</span>
            <span class="dots">{#each evs.slice(0, 3) as e}<i style="background:{e.color || 'var(--fds-accent-default)'}"></i>{/each}</span>
          </button>
        {/each}
      </div>

      <div class="agenda">
        <div class="ag-h">{selLabel}</div>
        {#if !connected}
          <p class="muted">Ayarlar &gt; Takvim'den Windows Takvim'i aç ya da bir iCal linki bağla.</p>
        {:else if calendar && calendar.error && !dayEvents.length}
          <p class="muted err">{calendar.error}</p>
        {:else if !dayEvents.length}
          <div class="free">
            <Icon name="calendar" size={28} />
            <p class="muted">{selected === today ? 'Bugün takvimin boş.' : 'Bu gün için etkinlik yok.'}</p>
            {#if settings.calSystem !== 'off' && !settings.icalOn && !allEvents.length}
              <Button on:click={() => api('app', 'win-accounts')}>Windows'a hesap ekle</Button>
            {/if}
          </div>
        {:else}
          <ul class="events">
            {#each dayEvents as e (e.id + e.start)}
              {@const w = until(e)}
              <li class="td-ev" class:live={w === 'Şimdi'} class:past={w === 'Bitti'}>
                <span class="bar-c" style="background:{e.color || 'var(--fds-accent-default)'}"></span>
                <div class="ev-main">
                  <div class="ev-title" title={e.title}>{e.title || '(Başlıksız)'}</div>
                  <div class="ev-sub">
                    {e.allDay ? 'Tüm gün' : hm(e.start) + ' – ' + hm(e.end)}{e.location ? ' · ' + e.location : ''}
                  </div>
                </div>
                {#if w && w !== 'Bitti'}<span class="when" class:now={w === 'Şimdi'}>{w}</span>{/if}
                {#if e.link && w !== 'Bitti'}<Button variant={w === 'Şimdi' ? 'accent' : 'standard'} on:click={() => api('openLink', e.link)}>Katıl</Button>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
    {#if calendar && calendar.warn && !calendar.error}<p class="muted warn">{calendar.warn}</p>{/if}
  </section>

  <section class="td-card usage">
    <div class="u-h"><Icon name="zap" size={18} /><h2>Bugünkü Claude kullanımı</h2><span>tahmini</span></div>
    <div class="stats">
      <div><span>Maliyet</span><b>{money(u.cost)}</b></div>
      <div><span>Toplam token</span><b>{tok(u.tokens)}</b></div>
      <div><span>Çıktı token</span><b>{tok(u.output)}</b></div>
      <div><span>İstek</span><b>{u.calls || 0}</b></div>
    </div>
    {#if usage && usage.unpriced && usage.unpriced.length}<p class="muted warn">Fiyatı bilinmeyen model: {usage.unpriced.join(', ')}</p>{/if}
  </section>
</div>

<style>
  .page { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 28px 32px 40px; box-sizing: border-box; container-type: inline-size; }
  .title {
    display: flex; align-items: center; gap: 12px; margin: 0;
    font-family: var(--fds-font-family-display, 'Segoe UI Variable Display', 'Segoe UI', sans-serif);
    font-size: 28px; line-height: 36px; font-weight: 600; color: var(--fds-text-primary);
  }
  .crumb, .title :global(.crumb-sep) { color: var(--fds-text-secondary); }
  .date { margin: 2px 0 20px; font-size: 14px; line-height: 20px; color: var(--fds-text-secondary); }

  .td-card {
    border-radius: 8px; padding: 16px 18px; margin-bottom: 12px;
    background: var(--fds-card-background-default); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08));
  }
  h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--fds-text-primary); }
  .muted { margin: 0; font-size: 13px; line-height: 18px; color: var(--fds-text-secondary); }
  .err { color: var(--fds-system-critical, #ff99a4); }

  .focus { display: flex; align-items: center; gap: 22px; }
  .f-ring { position: relative; width: 132px; height: 132px; flex: none; }
  .f-ring svg { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }
  .f-ring circle { fill: none; stroke-width: 7; }
  .f-track { stroke: var(--fds-control-strong-stroke-disabled, rgba(255,255,255,.14)); }
  .f-bar { stroke: var(--fds-accent-default, #60cdff); stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
  .focus:not(.running) .f-bar { opacity: 0; }
  .brk .f-bar { stroke: #6ccb5f; }
  .f-in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .f-digits { font-family: var(--fds-font-family-display, 'Segoe UI Variable Display', 'Segoe UI', sans-serif); font-size: 28px; line-height: 34px;
    font-weight: 600; font-variant-numeric: tabular-nums; color: var(--fds-text-primary); }
  .f-digits.big { font-size: 40px; line-height: 44px; }
  .f-phase { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }

  .f-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .f-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tag { display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; height: 20px; border-radius: 10px; font-size: 11px; font-weight: 600;
    background: color-mix(in srgb, var(--fds-accent-default, #60cdff) 16%, transparent); color: var(--fds-accent-text-primary, #99ebff); }
  .td-sub { margin: 0; font-size: 13px; line-height: 18px; color: var(--fds-text-secondary); }
  .f-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .f-row :global(.button) { display: inline-flex; align-items: center; }
  .td-stepper { display: inline-flex; gap: 2px; padding: 2px; border-radius: 5px;
    background: var(--fds-control-fill-default, rgba(255,255,255,.06)); box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)); }
  .td-st { width: 30px; height: 28px; border: 0; border-radius: 3px; background: none; color: var(--fds-text-primary); display: grid; place-items: center; cursor: pointer; }
  .td-st:hover:not(:disabled) { background: var(--fds-subtle-fill-secondary); }
  .td-st:disabled { color: var(--fds-text-disabled); cursor: default; }
  .td-st:focus-visible, .ib:focus-visible, .dc:focus-visible { outline: none; box-shadow: var(--fds-focus-stroke); }
  .cycles { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--fds-text-secondary); }
  .cy { width: 7px; height: 7px; border-radius: 50%; background: var(--fds-control-strong-stroke-disabled, rgba(255,255,255,.18)); }
  .cy.on { background: var(--fds-accent-default, #60cdff); }
  .cycles span:last-child { margin-left: 4px; }

  .cal-h { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; }
  .cal-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .cal-t span { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .month { font-size: 18px; line-height: 24px; text-transform: capitalize; }
  .ib { min-width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--fds-text-secondary);
    display: grid; place-items: center; cursor: pointer; font: inherit; font-size: 13px; }
  .ib.txt { padding: 0 10px; color: var(--fds-text-primary); }
  .ib:hover:not(:disabled) { background: var(--fds-subtle-fill-secondary); color: var(--fds-text-primary); }
  .ib:disabled { color: var(--fds-text-disabled); cursor: default; }
  .ib :global(.flip) { transform: rotate(180deg); }

  .cal-body { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @container (min-width: 560px) { .cal-body { grid-template-columns: minmax(270px, 300px) 1fr; } }

  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; outline: none; align-self: start; }
  .wd { height: 28px; display: grid; place-items: center; font-size: 12px; color: var(--fds-text-secondary); }
  .dc { position: relative; height: 40px; padding: 0; border: 0; border-radius: 4px; background: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--fds-text-primary); font: inherit; }
  .dc:hover { background: var(--fds-subtle-fill-secondary); }
  .dc .n { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-variant-numeric: tabular-nums; }
  .dc.out { color: var(--fds-text-disabled, rgba(255,255,255,.36)); }
  .dc.sel .n { box-shadow: inset 0 0 0 2px var(--fds-accent-default, #60cdff); }
  .dc.today .n { background: var(--fds-accent-default, #60cdff); color: var(--fds-text-on-accent-primary, #000); font-weight: 600; }
  .dots { display: flex; gap: 2px; height: 4px; }
  .dots i { width: 4px; height: 4px; border-radius: 50%; }

  .agenda { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .ag-h { font-size: 13px; line-height: 20px; font-weight: 600; color: var(--fds-text-primary); text-transform: capitalize;
    padding-bottom: 6px; border-bottom: 1px solid var(--fds-divider-stroke-default, rgba(255,255,255,.08)); }
  .free { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 8px; text-align: center; color: var(--fds-text-disabled, rgba(255,255,255,.36)); }
  .events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .td-ev { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 4px 6px 4px 0; border-radius: 4px; }
  .td-ev:hover { background: var(--fds-subtle-fill-secondary); }
  .td-ev.past { opacity: .5; }
  .td-ev.live { background: color-mix(in srgb, var(--fds-accent-default, #60cdff) 10%, transparent); }
  .bar-c { width: 3px; align-self: stretch; margin: 3px 0 3px 4px; border-radius: 2px; flex: none; }
  .ev-main { flex: 1; min-width: 0; }
  .ev-title { font-size: 14px; line-height: 20px; color: var(--fds-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ev-sub { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .when { font-size: 12px; color: var(--fds-text-secondary); white-space: nowrap; }
  .when.now { color: var(--fds-accent-text-primary, #99ebff); font-weight: 600; }
  .warn { margin-top: 10px; font-size: 12px; }

  .u-h { display: flex; align-items: center; gap: 10px; color: var(--fds-text-primary); margin-bottom: 10px; }
  .u-h span { margin-left: auto; font-size: 12px; color: var(--fds-text-secondary); }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .stats div { display: flex; flex-direction: column; }
  .stats span { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .stats b { font-size: 20px; line-height: 28px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--fds-text-primary); }

  @container (max-width: 440px) {
    .focus { flex-direction: column; align-items: stretch; }
    .f-ring { align-self: center; }
    .stats { grid-template-columns: repeat(2, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) { .f-bar { transition: none; } }
</style>
