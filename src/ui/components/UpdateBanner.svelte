<script lang="ts">
  import { registerSW } from 'virtual:pwa-register';

  // Shown when a new service worker is waiting; reloads only on tap (spec §7).
  let waiting = $state(false);
  const updateSW = registerSW({ onNeedRefresh: () => (waiting = true) });
</script>

{#if waiting}
  <div role="status">
    <span>New version available</span>
    <button type="button" onclick={() => updateSW(true)}>Reload</button>
  </div>
{/if}

<style>
  div {
    position: fixed;
    inset: calc(8px + env(safe-area-inset-top)) 8px auto;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 6px 6px 16px;
    border-radius: var(--radius-control);
    background: var(--ink);
    color: var(--bg);
  }
  button {
    min-height: var(--tap);
    padding: 0 16px;
    border: 0;
    border-radius: 9px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
  }
</style>
