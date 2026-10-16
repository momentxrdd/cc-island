<script>
  export let name = 'idle-living';
  export let size = 24;
  $: src = window.CCPet ? window.CCPet.src(name) : '';
</script>

<span class="pet" data-pet={name} style="--ps:{size}px" aria-hidden="true">
  {#key name}<img class="pet-in" {src} alt="" draggable="false" />{/key}
</span>

<style>
  .pet-in { animation: pet-in .45s cubic-bezier(.34, 1.56, .64, 1); }
  @keyframes pet-in { from { transform: scale(.6) translateY(3px); opacity: .2; } }
  @media (prefers-reduced-motion: reduce) { .pet-in { animation: none; } }
</style>
