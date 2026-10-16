<script>
  import { onMount } from 'svelte';
  import { Button } from 'fluent-svelte-extra';
  import Icon from './Icon.svelte';
  import Markdown from './Markdown.svelte';

  const api = window.ccApi || {};
  const AGENT = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', cursor: 'Cursor' };
  let items = [], query = '', open = null, loaded = false;

  async function load() { items = (api.getHistory ? await api.getHistory() : []) || []; loaded = true; }
  onMount(() => { load(); if (api.onHistory) api.onHistory(load); });

  const day0 = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hm = (ts) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : m ? `${m} dk ${s % 60} sn` : `${s} sn`; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  function dayLabel(ts) {
    const t = day0(Date.now());
    if (ts === t) return 'Bugün';
    if (ts === t - 86400000) return 'Dün';
    return new Date(ts).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  $: q = query.trim().toLocaleLowerCase('tr');
  $: shown = q ? items.filter((r) => [r.prompt, r.name, r.text, ...(r.files || [])].some((x) => String(x || '').toLocaleLowerCase('tr').includes(q))) : items;
  $: groups = (() => {
    const m = new Map();
    for (const r of shown) { const k = day0(r.end); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()].map(([k, list]) => ({ k, label: dayLabel(k), list }));
  })();
  $: today = items.filter((r) => day0(r.end) === day0(Date.now()));
  $: todayStats = { n: today.length, ms: today.reduce((a, r) => a + (r.end - r.start), 0), files: today.reduce((a, r) => a + (r.files || []).length, 0) };
</script>

<div class="page">
  <h1 class="title">
    <span class="crumb">CC Island</span>
    <Icon name="chevronRight" size={16} className="crumb-sep" />
    <span>Geçmiş</span>
  </h1>

  <div class="top">
    <div class="stats">
      <div><b>{todayStats.n}</b><span>bugün tamamlanan</span></div>
      <div><b>{todayStats.ms ? dur(todayStats.ms) : '0 sn'}</b><span>ajan çalışma süresi</span></div>
      <div><b>{todayStats.files}</b><span>değişen dosya</span></div>
    </div>
    <div class="tools">
      <div class="search">
        <Icon name="search" size={14} />
        <input type="search" bind:value={query} placeholder="İstek, proje ya da dosya ara" aria-label="Geçmişte ara" />
      </div>
      {#if items.length}<Button on:click={() => api.history && api.history('clear')}>Temizle</Button>{/if}
    </div>
  </div>

  {#if loaded && !items.length}
    <div class="empty">
      <Icon name="clock" size={32} />
      <p>Henüz tamamlanan bir görev yok. Bir ajan işini bitirdiğinde burada özeti görünür.</p>
    </div>
  {:else if loaded && !shown.length}
    <div class="empty"><p>"{query}" için sonuç yok.</p></div>
  {/if}

  {#each groups as g (g.k)}
    <h2>{g.label}</h2>
    <ul class="list">
      {#each g.list as r (r.id)}
        <li class="row" class:open={open === r.id}>
          <button type="button" class="head" aria-expanded={open === r.id} on:click={() => (open = open === r.id ? null : r.id)}>
            <span class="time">{hm(r.end)}</span>
            <div class="main">
              <div class="prompt" title={r.prompt}>{r.prompt || '(istek metni yok)'}</div>
              <div class="meta">
                <span class="proj">{r.name || base(r.cwd)}</span>
                {#if r.agent && r.agent !== 'claude'}<span class="ag">{AGENT[r.agent] || r.agent}</span>{/if}
                <span>{dur(r.end - r.start)}</span>
                <span>{r.tools} araç</span>
                {#if r.files && r.files.length}<span>{r.files.length} dosya</span>{/if}
                {#if r.errors}<span class="err">{r.errors} hata</span>{/if}
              </div>
            </div>
            <span class="chev"><Icon name="chevron" size={14} /></span>
          </button>
          {#if open === r.id}
            <div class="body">
              {#if r.text}<Markdown text={r.text} className="h-md" />{/if}
              {#if r.files && r.files.length}
                <div class="files-h">Değişen dosyalar</div>
                <ul class="files">{#each r.files as f}<li title={f}>{f.replace(r.cwd || '', '').replace(/^[\\/]/, '') || f}</li>{/each}</ul>
              {/if}
              <div class="acts">
                <Button on:click={() => navigator.clipboard && navigator.clipboard.writeText(r.prompt || '')}>İsteği kopyala</Button>
                <Button on:click={() => api.history && api.history('remove', r.id)}>Kaldır</Button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
</div>

<style>
  .page { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 28px 32px 40px; box-sizing: border-box; }
  .title {
    display: flex; align-items: center; gap: 12px; margin: 0 0 20px;
    font-family: var(--fds-font-family-display, 'Segoe UI Variable Display', 'Segoe UI', sans-serif);
    font-size: 28px; line-height: 36px; font-weight: 600; color: var(--fds-text-primary);
  }
  .crumb, .title :global(.crumb-sep) { color: var(--fds-text-secondary); }

  .top { display: flex; flex-direction: column; gap: 12px; margin-bottom: 8px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stats div { display: flex; flex-direction: column; padding: 12px 14px; border-radius: 8px;
    background: var(--fds-card-background-default); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08)); }
  .stats b { font-size: 20px; line-height: 28px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--fds-text-primary); }
  .stats span { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .tools { display: flex; gap: 8px; align-items: center; }
  .search { flex: 1; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 4px; color: var(--fds-text-secondary);
    background: var(--fds-control-fill-default, rgba(255,255,255,.06)); box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)); }
  .search:focus-within { box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -2px 0 var(--fds-accent-default, #60cdff); }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; font-size: 14px; color: var(--fds-text-primary); }
  .search input::placeholder { color: var(--fds-text-secondary); }

  h2 { margin: 20px 0 8px 2px; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--fds-text-primary); text-transform: capitalize; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .row { border-radius: 4px; background: var(--fds-card-background-default); box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08)); }
  .head { width: 100%; display: flex; align-items: center; gap: 14px; padding: 10px 14px; border: 0; background: none; cursor: pointer;
    text-align: left; font: inherit; color: inherit; border-radius: 4px; }
  .head:hover { background: var(--fds-subtle-fill-secondary); }
  .head:focus-visible { outline: none; box-shadow: var(--fds-focus-stroke); }
  .time { width: 40px; flex: none; font-size: 12px; color: var(--fds-text-secondary); font-variant-numeric: tabular-nums; }
  .main { flex: 1; min-width: 0; }
  .prompt { font-size: 14px; line-height: 20px; color: var(--fds-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .proj { color: var(--fds-text-primary); }
  .meta .err { color: var(--fds-system-critical, #ff99a4); }
  .chev { color: var(--fds-text-secondary); transition: transform .2s; }
  .open .chev { transform: rotate(180deg); }
  .body { padding: 4px 14px 14px 68px; display: flex; flex-direction: column; gap: 10px; }
  .body :global(.h-md) { font-size: 13px; line-height: 19px; color: var(--fds-text-secondary); }
  .files-h { font-size: 12px; font-weight: 600; color: var(--fds-text-secondary); }
  .files { list-style: none; margin: -6px 0 0; padding: 0; font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12px; line-height: 18px; color: var(--fds-text-primary); }
  .files li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acts { display: flex; gap: 8px; }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 16px; text-align: center; color: var(--fds-text-secondary); }
  .empty p { margin: 0; max-width: 360px; font-size: 13px; line-height: 18px; }
</style>
