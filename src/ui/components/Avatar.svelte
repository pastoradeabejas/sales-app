<script lang="ts">
  let { name, size = 40 }: { name: string; size?: number } = $props();
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
</script>

<span aria-hidden="true" style:width="{size}px" style:height="{size}px">{initial}</span>

<style>
  span {
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
</style>
