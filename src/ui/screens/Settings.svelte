<script lang="ts">
  import ConfirmSheet from '../components/ConfirmSheet.svelte';
  import Header from '../components/Header.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { app, clearDevice, startDemo } from '../data.svelte.ts';
  import { startSync, stopSync } from '../sync.svelte.ts';
  import { go } from '../router.svelte.ts';
  import { appearance, setThemePref } from '../theme.svelte.ts';
  import type { ThemePref } from '../theme.ts';
  import { isConfigured } from '../../store/settings.ts';
  import Backup from './settings/Backup.svelte';
  import SyncSettings from './settings/SyncSettings.svelte';


  const configured = $derived(isConfigured(app.settings));
  let confirmDemo = $state(false);
  let confirmLeave = $state(false);

  const themes: { value: ThemePref; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];
  let theme = $state(appearance.pref);

  async function useDemo() {
    await startDemo();
    startSync();
    go('#/overview');
  }
</script>

<Header title="Settings" back={configured ? '#/overview' : undefined} />

<div class="page">
  {#if !configured}
    <section class="card intro">
      <h2>Welcome to Sales Book</h2>
      <p class="muted">
        Connect this device to the data repository to sync with the other devices, or try the app with sample data.
      </p>
    </section>
  {/if}

  {#if app.settings.demoMode}
    <section class="card stack">
      <h2>Demo mode</h2>
      <p class="muted">Sample data on this device only. Nothing is synced.</p>
      <button type="button" class="btn" onclick={() => (confirmLeave = true)}>Leave demo mode</button>
    </section>
  {:else}
    <SyncSettings />

    <section class="card stack">
      <h2>Use without sync</h2>
      <p class="muted">Loads sample data so you can try every screen. Sync stays off.</p>
      <button type="button" class="btn" onclick={() => (confirmDemo = true)}>Use demo data</button>
    </section>
  {/if}

  {#if configured}<Backup />{/if}

  <section class="card stack">
    <h2>Appearance</h2>
    <Segmented options={themes} bind:value={theme} label="Appearance" onchange={setThemePref} />
  </section>

  <section class="card">
    <h2>About</h2>
    <p class="muted">Version {import.meta.env.VITE_APP_VERSION} · build {import.meta.env.VITE_COMMIT.slice(0, 7)}</p>
  </section>
</div>

<ConfirmSheet bind:open={confirmDemo} title="Use demo data?" confirmLabel="Load demo data" onconfirm={useDemo}>
  <p>This replaces any data on this device with sample data. Sync stays off.</p>
</ConfirmSheet>

<ConfirmSheet bind:open={confirmLeave} title="Leave demo mode?" confirmLabel="Clear demo data" danger onconfirm={async () => {
    stopSync();
    await clearDevice();
  }}>
  <p>The sample data is deleted from this device.</p>
</ConfirmSheet>

<style>
  .stack {
    display: grid;
    gap: 12px;
  }
  .stack h2,
  .intro h2 {
    margin: 0;
  }
  p {
    margin: 0;
  }
</style>
