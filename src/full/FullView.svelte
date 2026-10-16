<script>
  import "fluent-svelte-extra/switchable.css";
  import Sidebar from './Sidebar.svelte';
  import SessionDetail from './SessionDetail.svelte';
  import TodayView from './TodayView.svelte';
  import SettingsView from './SettingsView.svelte';
  import HistoryView from './HistoryView.svelte';

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
      <TodayView {calendar} {timer} {usage} {settings} />
    {:else}
      <SessionDetail
        session={currentSession}
        {pending}
        {details}
        {conv}
        {focusReply}
        on:tabchange
      />
    {/if}
  </main>
</div>

<style>
  .fluent-app-container {
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
