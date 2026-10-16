<script>
  import "fluent-svelte-extra/switchable.css";
  import Sidebar from './Sidebar.svelte';
  import SessionDetail from './SessionDetail.svelte';
  import TodayView from './TodayView.svelte';
  import SettingsView from './SettingsView.svelte';
  import HistoryView from './HistoryView.svelte';
  import Palette from './Palette.svelte';

  export let sessions = [];
  export let pending = [];
  export let selectedId = 'today';
  export let details = {};
  export let conv = null;
  export let media = null;
  export let calendar = null;
  export let timer = null;
  export let usage = null;
  export let settings = {};
  export let themeInfo = { isDark: true, accent: null };
  export let focusReply = 0;
  export let paletteToken = 0;
  export let weather = null;

  let paletteOpen = false, seenPalette = 0, localFocus = 0;
  $: if (paletteToken && paletteToken !== seenPalette) { seenPalette = paletteToken; paletteOpen = true; }
  $: replyToken = Math.max(focusReply || 0, localFocus);
  const api = (fn, ...a) => window.ccApi && window.ccApi[fn] && window.ccApi[fn](...a);
  function onWindowKey(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); paletteOpen = !paletteOpen; }
  }
  const go = (id) => handleSelect({ detail: id });
  $: commands = [
    { group: 'Git', title: 'Bugün', hint: 'Odak, takvim, hava durumu', icon: 'calendar', run: () => go('today') },
    { group: 'Git', title: 'Geçmiş', hint: 'Tamamlanan görevler', icon: 'clock', run: () => go('history') },
    { group: 'Git', title: 'Ayarlar', icon: 'settings', run: () => go('settings') },
    { group: 'Git', title: 'Onay kuralları', hint: 'Ayarlar', icon: 'shield', keywords: 'rule kural', run: () => go('settings') },
    ...sessions.map((s) => ({ group: 'Oturumlar', title: s.name, hint: s.status === 'working' ? 'Çalışıyor' : s.status === 'waiting' ? 'Bekliyor' : s.status === 'done' ? 'Tamamlandı' : 'Boşta', icon: 'bot', keywords: s.cwd, run: () => go(s.id) })),
    ...sessions.filter((s) => s.agent !== 'cursor').map((s) => ({ group: 'Oturumlar', title: 'Mesaj gönder: ' + s.name, icon: 'message', keywords: 'yanıt reply', run: () => { go(s.id); localFocus = Date.now(); } })),
    ...pending.filter((p) => !p.questions).flatMap((p) => [
      { group: 'Onaylar', title: 'İzin ver: ' + p.tool, hint: p.summary, icon: 'check', keywords: 'allow', run: () => api('decide', p.id, 'allow') },
      { group: 'Onaylar', title: 'Reddet: ' + p.tool, hint: p.summary, icon: 'x', keywords: 'deny', run: () => api('decide', p.id, 'deny') },
    ]),
    ...(timer
      ? [
        { group: 'Odak', title: timer.paused ? 'Zamanlayıcıyı sürdür' : 'Zamanlayıcıyı duraklat', icon: timer.paused ? 'play' : 'pause', run: () => api('timer', timer.paused ? 'resume' : 'pause') },
        { group: 'Odak', title: '5 dakika ekle', icon: 'plus', run: () => api('timer', 'add') },
        { group: 'Odak', title: 'Zamanlayıcıyı bitir', icon: 'x', run: () => api('timer', 'stop') },
      ]
      : [
        { group: 'Odak', title: 'Odak başlat (' + (settings.focusMin || 25) + ' dk)', icon: 'timer', keywords: 'pomodoro focus', run: () => api('timer', 'focus') },
        { group: 'Odak', title: 'Odak başlat (50 dk)', icon: 'timer', keywords: 'pomodoro focus', run: () => api('timer', 'focus', 50) },
        { group: 'Odak', title: 'Mola (' + (settings.breakMin || 5) + ' dk)', icon: 'play', keywords: 'break', run: () => api('timer', 'break') },
      ]),
    { group: 'Uygulama', title: 'Takvimi yenile', icon: 'refresh', run: () => api('calendar', 'refresh') },
    { group: 'Uygulama', title: 'Tüm durumları göster', hint: 'Demo', icon: 'sparkles', run: () => api('app', 'demo') },
    { group: 'Uygulama', title: 'Oturumları temizle', icon: 'trash', run: () => api('app', 'clear') },
  ];

  $: {
    if (!['today', 'settings', 'history'].includes(selectedId) && !sessions.some(s => s.id === selectedId)) {
      selectedId = sessions.length ? sessions[0].id : 'today';
    }
  }

  $: currentSession = sessions.find(s => s.id === selectedId);
  $: totalTools = sessions.reduce((n, s) => n + (s.totalTools || 0), 0);

  $: accentStyles = (() => {
    if (!themeInfo || !themeInfo.accent) return '';
    const a = themeInfo.accent;
    return `
      --fds-accent-light-3: ${a.light3};
      --fds-accent-light-2: ${a.light2};
      --fds-accent-light-1: ${a.light1};
      --fds-accent-base: ${a.base};
      --fds-accent-dark-1: ${a.dark1};
      --fds-accent-dark-2: ${a.dark2};
      --fds-accent-dark-3: ${a.dark3};
    `;
  })();

  $: radiusPx = Math.round(42 * (Math.min(150, Math.max(0, (settings && (settings.radiusFull ?? settings.radius) != null ? (settings.radiusFull ?? settings.radius) : 100))) / 100));
  $: shapeStyle = (settings && settings.shape === 'pill') ? `border-radius: ${radiusPx}px;` : `border-radius: 0 0 ${radiusPx}px ${radiusPx}px;`;

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleSelect(e) {
    selectedId = e.detail;
    dispatch('select', e.detail);
  }
</script>

<svelte:window on:keydown={onWindowKey} />

<div
  class="fluent-app-container {themeInfo.isDark ? 'fds-theme-dark' : 'fds-theme-light'}"
  style={accentStyles + shapeStyle}
>
  <Sidebar
    {sessions}
    {selectedId}
    {pending}
    {media}
    {totalTools}
    on:select={handleSelect}
  />

  <main class="fluent-main-panel">
    {#if selectedId === 'settings'}
      <SettingsView {settings} {themeInfo} projects={[...new Set(sessions.map((s) => s.cwd).filter(Boolean))]} />
    {:else if selectedId === 'history'}
      <HistoryView />
    {:else if selectedId === 'today' || !currentSession}
      <TodayView {calendar} {timer} {usage} {settings} {weather} />
    {:else}
      <SessionDetail
        session={currentSession}
        {pending}
        {details}
        {conv}
        focusReply={replyToken}
        on:tabchange
      />
    {/if}
  </main>
  <Palette open={paletteOpen} {commands} on:close={() => (paletteOpen = false)} />
</div>

<style>
  .fluent-app-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    overflow: hidden;
    box-sizing: border-box;
    font-family: var(--fds-font-family-text, 'Segoe UI Variable Text', 'Segoe UI', sans-serif);
    font-size: 14px;
    color: var(--fds-text-primary);
    background: var(--fds-solid-background-base, #202020);
    border-radius: 0 0 42px 42px;
  }

  .fluent-main-panel {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    background: var(--fds-layer-background-default, rgba(58,58,58,.3));
    border: 1px solid var(--fds-card-stroke-default, rgba(255,255,255,.06));
    border-right: none;
    border-bottom: none;
    border-top-left-radius: 8px;
  }

  :global(.fluent-app-container button::after) { display: none !important; }
  :global(.fluent-app-container .button) { white-space: nowrap; }

  :global(.fluent-app-container ::-webkit-scrollbar) { width: 6px; height: 6px; }
  :global(.fluent-app-container ::-webkit-scrollbar-track) { background: transparent; }
  :global(.fluent-app-container ::-webkit-scrollbar-thumb) { background: var(--fds-control-strong-fill-default, rgba(255,255,255,.35)); border-radius: 3px; }
</style>
