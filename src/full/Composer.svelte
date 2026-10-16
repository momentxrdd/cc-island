<script>
  import { tick } from 'svelte';
  import { Button } from 'fluent-svelte-extra';
  import Icon from './Icon.svelte';

  export let session;
  export let pending = [];
  export let focusToken = 0;

  const ERR = {
    native: 'Yerel yardımcı derlenmemiş (npm run build:native).',
    nopid: 'Ajanın terminali bulunamadı. Oturumda bir sonraki adımdan sonra tekrar dene.',
    pending: 'Önce bekleyen onayı ya da soruyu yanıtla.',
    unsupported: 'Bu ajan terminalde çalışmıyor; yanıt gönderilemez.',
    attach: 'Terminale bağlanılamadı. Oturum kapanmış olabilir.',
  };

  let text = '', busy = false, note = '', noteKind = '', input;
  let lastFocus = 0;
  $: blocked = pending.some((p) => p.session_id === session.id);
  $: if (focusToken && focusToken !== lastFocus) { lastFocus = focusToken; tick().then(() => input && input.focus()); }
  $: hint = blocked ? ERR.pending : session.status === 'working' ? 'Çalışırken gönderilen mesaj sıraya girer.' : 'Enter gönderir.';

  async function send() {
    const t = text.trim();
    if (!t || busy || blocked || !(window.ccApi && window.ccApi.reply)) return;
    busy = true; note = '';
    const r = await window.ccApi.reply(session.id, t);
    busy = false;
    if (r && r.ok) { text = ''; note = 'Gönderildi'; noteKind = 'ok'; setTimeout(() => { if (noteKind === 'ok') note = ''; }, 2500); }
    else { note = ERR[r && r.error] || 'Gönderilemedi.'; noteKind = 'err'; }
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  }
  function grow() { if (!input) return; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; }
  $: text, tick().then(grow);
</script>

<div class="composer" class:blocked>
  <div class="box">
    <textarea bind:this={input} bind:value={text} rows="1" maxlength="4000" disabled={blocked}
      placeholder={`${session.name} oturumuna yaz…`} aria-label="Oturuma yanıt" on:keydown={onKey}></textarea>
    <Button variant="accent" disabled={!text.trim() || busy || blocked} on:click={send}>
      <Icon name="arrowRight" size={14} />&nbsp;Gönder
    </Button>
  </div>
  <div class="foot" class:err={noteKind === 'err' && note} class:ok={noteKind === 'ok' && note}>{note || hint}</div>
</div>

<style>
  .composer {
    flex: none; padding: 10px 20px 12px;
    background: var(--fds-solid-background-base, #202020);
    border-top: 1px solid var(--fds-divider-stroke-default, rgba(255,255,255,.08));
  }
  .box { display: flex; align-items: flex-end; gap: 8px; }
  textarea {
    flex: 1; min-width: 0; resize: none; box-sizing: border-box; min-height: 32px; max-height: 112px; padding: 6px 10px;
    font: inherit; font-size: 14px; line-height: 20px; color: var(--fds-text-primary);
    background: var(--fds-control-fill-default, rgba(255,255,255,.06)); border: 0; border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -1px 0 var(--fds-control-strong-stroke-default, rgba(255,255,255,.54));
    outline: none;
  }
  textarea:focus { background: var(--fds-control-fill-input-active, rgba(30,30,30,.7));
    box-shadow: inset 0 0 0 1px var(--fds-control-stroke-default, rgba(255,255,255,.07)), inset 0 -2px 0 var(--fds-accent-default, #60cdff); }
  textarea::placeholder { color: var(--fds-text-secondary); }
  textarea:disabled { opacity: .5; }
  .box :global(.button) { display: inline-flex; align-items: center; flex: none; }
  .foot { margin-top: 6px; font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); }
  .foot.err { color: var(--fds-system-critical, #ff99a4); }
  .foot.ok { color: var(--fds-system-success, #6ccb5f); }
</style>
