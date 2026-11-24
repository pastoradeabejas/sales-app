<script lang="ts">
  import ConfirmSheet from '../components/ConfirmSheet.svelte';
  import Header from '../components/Header.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { app, clearDevice, startDemo } from '../data.svelte.ts';
  import { startSync, stopSync } from '../sync.svelte.ts';
  import { go } from '../router.svelte.ts';
  import { appearance, setTextScale, setThemePref } from '../theme.svelte.ts';
  import { TEXT_SCALE } from '../textSize.ts';
  import { formatBuildTime } from '../months.ts';
  import type { ThemePref } from '../theme.ts';
  import { isConfigured } from '../../store/settings.ts';
  import Backup from './settings/Backup.svelte';
  import SyncSettings from './settings/SyncSettings.svelte';
  import WorkLevels from './settings/WorkLevels.svelte';


  const configured = $derived(isConfigured(app.settings));
  const buildTime = formatBuildTime(import.meta.env.VITE_BUILD_TIME);
  let confirmDemo = $state(false);
  let confirmLeave = $state(false);

  const themes: { value: ThemePref; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'blue', label: 'Blue' },
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
  {/if}

  {#if !configured}
    <!-- Demo only before a data repo is connected: it would replace the real data (D-036). -->
    <section class="card stack">
      <h2>Use without sync</h2>
      <p class="muted">Loads sample data so you can try every screen. Sync stays off.</p>
      <button type="button" class="btn" onclick={() => (confirmDemo = true)}>Use demo data</button>
    </section>
  {/if}

  {#if configured}<WorkLevels /><Backup />{/if}

  <section class="card stack">
    <h2>Appearance</h2>
    <Segmented options={themes} bind:value={theme} label="Appearance" onchange={setThemePref} />
    <div class="field">
      <label for="text-size">Text size: {Math.round(appearance.textScale * 100)} %</label>
      <div class="size-row">
        <span class="small-a" aria-hidden="true">A</span>
        <input
          id="text-size"
          type="range"
          min={TEXT_SCALE.min}
          max={TEXT_SCALE.max}
          step={TEXT_SCALE.step}
          value={appearance.textScale}
          oninput={(e) => setTextScale(Number(e.currentTarget.value))}
        />
        <span class="big-a" aria-hidden="true">A</span>
      </div>
      {#if appearance.textScale !== 1}
        <button type="button" class="btn btn-ghost reset" onclick={() => setTextScale(1)}>Reset to 100 %</button>
      {/if}
    </div>
  </section>

  <section class="card">
    <h2>About</h2>
    <p class="muted">Version {import.meta.env.VITE_APP_VERSION} · build {import.meta.env.VITE_COMMIT.slice(0, 7)}{buildTime ? ` · ${buildTime}` : ''}</p>
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
  .size-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: var(--tap);
  }
  .size-row input {
    flex: 1;
    accent-color: var(--accent);
    min-height: var(--tap);
  }
  .small-a {
    font-size: 13px;
    font-weight: 600;
  }
  .big-a {
    font-size: 22px;
    font-weight: 600;
  }
  .reset {
    justify-self: start;
    padding: 0;
  }
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
