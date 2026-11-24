<script lang="ts">
  import Icon from '../../components/Icon.svelte';

  // Collapsible group header (D-015): name, product count, indented by depth.
  let { name, count, open, depth = 0, locked = false, ontoggle }: { name: string; count: number; open: boolean; depth?: number; locked?: boolean; ontoggle: () => void } = $props();
</script>

<button type="button" class="gh" style:margin-left="{depth * 12}px" aria-expanded={open} disabled={locked} onclick={ontoggle}>
  <Icon name={open ? 'up' : 'down'} size={18} />
  <span class="grow title">{name}</span>
  <span class="muted">{count}</span>
</button>

<style>
  .gh {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: left;
  }
  .gh:disabled {
    opacity: 1;
  }
</style>
