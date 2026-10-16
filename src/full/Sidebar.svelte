<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  import Pet from './Pet.svelte';
  import mascotRaw from '../../assets/claude-code.svg?raw';
  const mascot = mascotRaw.replace(/<title>[\s\S]*?<\/title>/, '');

  export let sessions = [];
  export let selectedId = 'today';
  export let pending = [];
  export let media = null;
  export let totalTools = 0;

  const dispatch = createEventDispatcher();
  const select = (id) => dispatch('select', id);
  const mediaCmd = (cmd) => window.ccApi && window.ccApi.media && window.ccApi.media(cmd);

  let opto = null, seenMedia = null;
  $: if (media !== seenMedia) { seenMedia = media; opto = null; }
  function togglePlay() {
    if (media) opto = playing ? 'Paused' : 'Playing';
    mediaCmd('toggle');
  }
  let now = Date.now(), tick;
  onMount(() => { tick = setInterval(() => (now = Date.now()), 500); });
  onDestroy(() => clearInterval(tick));

  const STATUS_TEXT = { working: 'Çalışıyor', waiting: 'Onay bekliyor', done: 'Tamamlandı', idle: 'Boşta' };
  function badgeOf(s) {
    if (pending.some((p) => p.session_id === s.id)) return 'waiting';
    if (s.status === 'working') return 'working';
    if (s.status === 'done') return 'done';
    return '';
  }
  function tooltip(s) {
    const st = pending.some((p) => p.session_id === s.id) ? STATUS_TEXT.waiting : STATUS_TEXT[s.status] || '';
    return `${s.name}\n${st}${s.current ? ', ' + s.current.tool : ''}\n${s.cwd || ''}`;
  }

  const AGENT_LABEL = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', cursor: 'Cursor' };
  $: agentIds = [...new Set(sessions.map((s) => s.agent || 'claude'))];
  $: title = agentIds.length > 1 ? 'Yapay zekâ ajanları' : AGENT_LABEL[agentIds[0] || 'claude'] || agentIds[0];
  const petOf = (list, pend, t) => (window.CCPet ? window.CCPet.forState({ sessions: list, pending: pend, now: t }) : 'idle-living');
  $: mood = petOf(sessions, pending, now);

  $: working = sessions.filter((s) => s.status === 'working').length;
  $: meta = sessions.length
    ? `${sessions.length} oturum${working ? `, ${working} çalışıyor` : ''}`
    : 'Etkin oturum yok';
  $: playing = !!media && ((opto != null ? opto : media.status) === 'Playing');
  $: pos = media ? (media.posMs || 0) + (playing ? Math.max(0, now - (media.at || now)) : 0) : 0;
  $: progress = media && media.durMs ? Math.min(100, (pos / media.durMs) * 100) : 0;
</script>

<aside class="nav">
  <header class="profile" title="{totalTools} araç çağrısı">
    <div class="avatar"><span class="pet-fallback">{@html mascot}</span><Pet name={mood} size={56} /></div>
    <div class="who">
      <div class="name">{title}</div>
      <div class="meta">{meta}</div>
    </div>
  </header>

  <nav class="items" aria-label="Gezinme">
    <button type="button" class="item" class:sel={selectedId === 'today'} aria-current={selectedId === 'today' ? 'page' : undefined} on:click={() => select('today')}>
      <span class="ic today"><Icon name="calendar" size={18} filled /></span>
      <span class="label">Bugün</span>
    </button>
    <button type="button" class="item" class:sel={selectedId === 'history'} aria-current={selectedId === 'history' ? 'page' : undefined} on:click={() => select('history')}>
      <span class="ic gear"><Icon name="clock" size={18} filled={selectedId === 'history'} /></span>
      <span class="label">Geçmiş</span>
    </button>

    {#if sessions.length}
      <div class="sep" role="separator"></div>
      {#each sessions as s (s.id)}
        {@const b = badgeOf(s)}
        <button type="button" class="item" class:sel={selectedId === s.id} aria-current={selectedId === s.id ? 'page' : undefined}
          title={tooltip(s)} on:click={() => select(s.id)}>
          <span class="ic mascot">
            <span class="pet-fallback">{@html mascot}</span><Pet name={petOf([s], pending.filter((p) => p.session_id === s.id), now)} size={26} />
            {#if b}<span class="badge {b}" aria-label={STATUS_TEXT[b]}>{#if b === 'done'}<Icon name="check" size={8} />{:else if b === 'waiting'}!{/if}</span>{/if}
          </span>
          <span class="label">{s.name}</span>
          {#if s.agent && s.agent !== 'claude'}<span class="ag ag-{s.agent}">{AGENT_LABEL[s.agent] || s.agent}</span>{/if}
        </button>
      {/each}
    {/if}
  </nav>

  <footer class="bottom">
    {#if media && media.title}
      <div class="player">
        <div class="art" style={media.art ? `background-image:url("${media.art}")` : ''}>
          {#if !media.art}<Icon name="music" size={16} />{/if}
        </div>
        <div class="track">
          <div class="t" title={media.title}>{media.title}</div>
          <div class="a" title={media.artist}>{media.artist || media.app || ''}</div>
          <div class="bar"><span style="width:{progress}%"></span></div>
        </div>
        <div class="ctl">
          <button type="button" class="ib" aria-label="Önceki" disabled={media.canPrev === false} on:click|stopPropagation={() => mediaCmd('prev')}><Icon name="skipBack" size={14} filled /></button>
          <button type="button" class="ib" aria-label={playing ? 'Duraklat' : 'Oynat'} on:click|stopPropagation={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={16} filled /></button>
          <button type="button" class="ib" aria-label="Sonraki" disabled={media.canNext === false} on:click|stopPropagation={() => mediaCmd('next')}><Icon name="skipFwd" size={14} filled /></button>
        </div>
      </div>
    {/if}

    <button type="button" class="item" class:sel={selectedId === 'settings'} aria-current={selectedId === 'settings' ? 'page' : undefined} on:click={() => select('settings')}>
      <span class="ic gear"><Icon name="settings" size={18} filled={selectedId === 'settings'} /></span>
      <span class="label">Ayarlar</span>
    </button>
  </footer>
</aside>

<style>
  .nav {
    width: 248px; height: 100%; flex: none; box-sizing: border-box;
    display: flex; flex-direction: column; padding: 8px 4px 8px 8px; user-select: none;
  }

  .profile { display: flex; align-items: center; gap: 12px; padding: 12px 10px 18px; }
  .avatar {
    width: 56px; height: 56px; border-radius: 50%; flex: none; overflow: hidden; display: grid; place-items: center;
    background: color-mix(in srgb, #d97757 16%, var(--fds-card-background-secondary, #2b2b2b));
    box-shadow: inset 0 0 0 1px var(--fds-card-stroke-default, rgba(255,255,255,.08));
  }
  .avatar :global(svg) { width: 28px; height: 28px; }
  .who { min-width: 0; }
  .name { font-size: 14px; font-weight: 600; line-height: 20px; color: var(--fds-text-primary); }
  .meta { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .items { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 4px; padding-right: 4px; }
  .sep { height: 1px; margin: 4px 12px; background: var(--fds-divider-stroke-default, rgba(255,255,255,.08)); flex: none; }

  .item {
    position: relative; display: flex; align-items: center; gap: 14px; width: 100%; min-height: 36px; flex: none;
    padding: 0 12px; border: 0; border-radius: 4px; background: transparent; cursor: pointer; text-align: left;
    color: var(--fds-text-primary); font: inherit; font-size: 14px; line-height: 20px;
    transition: background-color var(--fds-control-faster-duration, 83ms) linear;
  }
  .item:hover { background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.0605)); }
  .item:active { background: var(--fds-subtle-fill-tertiary, rgba(255,255,255,.0419)); color: var(--fds-text-secondary); }
  .item.sel { background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.0605)); }
  .item.sel::before {
    content: ''; position: absolute; left: 0; top: 50%; width: 3px; height: 16px; margin-top: -8px;
    border-radius: 2px; background: var(--fds-accent-default, #60cdff);
    animation: pill-in var(--fds-control-normal-duration, 250ms) var(--fds-control-fast-out-slow-in-easing, ease);
  }
  @keyframes pill-in { from { transform: scaleY(0); } }
  .item:focus-visible { outline: none; box-shadow: var(--fds-focus-stroke); }
  .label { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .ic { position: relative; width: 18px; height: 18px; flex: none; display: grid; place-items: center; }
  .ic.today { color: var(--fds-accent-default, #60cdff); }
  .ic.gear { color: var(--fds-text-secondary); }
  .ic.mascot :global(.pet-fallback svg) { width: 18px; height: 18px; display: block; }
  .ic.mascot :global(.pet) { margin: -4px; }
  .item .ag { flex: none; margin-left: auto; }

  .badge {
    position: absolute; right: -4px; bottom: -3px; min-width: 10px; height: 10px; border-radius: 5px;
    display: grid; place-items: center; font-size: 8px; font-weight: 700; line-height: 1; color: #000;
    box-shadow: 0 0 0 2px var(--fds-solid-background-base, #202020);
  }
  .badge.working { background: var(--fds-accent-default, #60cdff); animation: breathe 1.6s ease-in-out infinite; }
  .badge.waiting { background: #fce100; }
  .badge.done { background: #6ccb5f; }
  @keyframes breathe { 50% { opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { .badge.working, .item.sel::before { animation: none; } }

  .bottom { display: flex; flex-direction: column; gap: 4px; padding: 8px 4px 0 0; }

  .player {
    display: grid; grid-template-columns: 40px 1fr; grid-template-rows: auto auto; gap: 8px 10px; padding: 10px;
    border-radius: 8px; background: var(--fds-card-background-default, rgba(255,255,255,.05));
    border: 1px solid var(--fds-card-stroke-default, rgba(255,255,255,.08)); margin-bottom: 4px;
  }
  .art {
    width: 40px; height: 40px; border-radius: 4px; background: var(--fds-card-background-secondary, #333) center / cover no-repeat;
    display: grid; place-items: center; color: var(--fds-text-secondary);
  }
  .track { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 1px; }
  .t { font-size: 12px; font-weight: 600; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .a { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 3px; border-radius: 2px; margin-top: 5px; background: var(--fds-control-strong-fill-disabled, rgba(255,255,255,.16)); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--fds-accent-default, #60cdff); transition: width .5s linear; }
  .ctl { grid-column: 1 / -1; display: flex; justify-content: center; gap: 4px; }
  .ib {
    width: 32px; height: 28px; border: 0; border-radius: 4px; background: transparent; color: var(--fds-text-primary);
    display: grid; place-items: center; cursor: pointer;
  }
  .ib:hover { background: var(--fds-subtle-fill-secondary, rgba(255,255,255,.0605)); }
  .ib:active { background: var(--fds-subtle-fill-tertiary, rgba(255,255,255,.0419)); }
  .ib:disabled { opacity: .35; pointer-events: none; }
</style>
