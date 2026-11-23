<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { app } from '../../data.svelte.ts';
  import { sync } from '../../sync.svelte.ts';

  // Sync status badge (§6.5); tap opens Settings with the details.
  const s = $derived(sync.state);
  const fresh = $derived(s.lastPullAt !== null && Date.now() - Date.parse(s.lastPullAt) < 120_000);
  const label = $derived(
    app.settings.demoMode
      ? 'Demo'
      : s.status === 'syncing'
        ? 'Syncing…'
        : s.status === 'error'
          ? 'Error'
          : s.pendingCount > 0
            ? `${s.pendingCount} pending`
            : s.status === 'offline'
              ? 'Offline'
              : s.status === 'synced' && fresh
                ? 'Synced'
                : s.status === 'off'
                  ? ''
                  : 'Synced',
  );
</script>

{#if label}
  <a class="pill" class:error={s.status === 'error'} href="#/settings" aria-label="Sync status: {label}. Open settings">
    {#if label === 'Synced'}<Icon name="check" size={14} />{:else if label === 'Offline'}<Icon name="offline" size={14} />{:else if label === 'Error'}<Icon
        name="alert"
        size={14}
      />{/if}
    {label}
  </a>
{/if}

<style>
  .pill {
    align-self: center;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    font-size: var(--fs-small);
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 10px;
    text-decoration: none;
  }
  .pill :global(svg) {
    color: var(--accent);
  }
  .error {
    color: var(--danger);
  }
  .error :global(svg) {
    color: var(--danger);
  }
</style>
