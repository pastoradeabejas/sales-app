<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let { title, back, actions }: { title: string; back?: string; actions?: Snippet } = $props();
</script>

<header>
  {#if back}
    <a class="icon-btn" href={back} aria-label="Back"><Icon name="back" /></a>
  {/if}
  <h1>{title}</h1>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 12px 16px 8px;
    padding-top: calc(12px + env(safe-area-inset-top));
  }
  h1 {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  header :global(.icon-btn) {
    display: inline-grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border-radius: var(--radius-control);
    color: var(--ink);
  }
</style>
