<script>
  import Icon from './Icon.svelte';

  export let icon = 'settings';
  export let title = '';
  export let desc = '';
  export let disabled = false;
</script>

<div class="card" class:disabled>
  <div class="head">
    <span class="ic"><Icon name={icon} size={20} /></span>
    <div class="text">
      <div class="title">{title}</div>
      {#if desc}<div class="desc">{desc}</div>{/if}
      <slot name="desc" />
    </div>
    {#if $$slots.default}<div class="ctl"><slot /></div>{/if}
  </div>
  {#if $$slots.body}<div class="body"><slot name="body" /></div>{/if}
</div>

<style>
  .card {
    background: var(--fds-card-background-default, rgba(255,255,255,.0512));
    border: 1px solid var(--fds-card-stroke-default, rgba(0,0,0,.1));
    border-radius: 4px;
    background-clip: padding-box;
  }
  .head { display: flex; align-items: center; gap: 16px; min-height: 68px; padding: 12px 16px; box-sizing: border-box; }
  .ic { flex: none; width: 20px; display: grid; place-items: center; color: var(--fds-text-primary); }
  .text { flex: 1; min-width: 0; }
  .title { font-size: 14px; line-height: 20px; color: var(--fds-text-primary); }
  .desc { font-size: 12px; line-height: 16px; color: var(--fds-text-secondary); margin-top: 1px; }
  .ctl { flex: none; display: flex; align-items: center; gap: 12px; }
  .body { border-top: 1px solid var(--fds-card-stroke-default, rgba(0,0,0,.1)); padding: 16px 16px 16px 52px; }
  .disabled .head, .disabled .body { opacity: .5; pointer-events: none; }
</style>
