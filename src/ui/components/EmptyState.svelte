<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<section class="card empty">
  <h2>{title}</h2>
  {#if children}{@render children()}{/if}
</section>

<style>
  .empty {
    display: grid;
    gap: 10px;
    justify-items: start;
    color: var(--muted);
  }
  h2 {
    color: var(--ink);
    margin: 0;
  }
</style>
