<script lang="ts">
  import { app } from '../../data.svelte.ts';
  // Placeholder: only the Demo pill for now. Sync status replaces this component later.
</script>

{#if app.settings.demoMode}
  <span class="pill">Demo</span>
{/if}

<style>
  .pill {
    align-self: center;
    font-size: var(--fs-small);
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 10px;
  }
</style>
