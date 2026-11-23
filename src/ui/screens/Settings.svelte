<script lang="ts">
  import Header from '../components/Header.svelte';
  import { appearance, setThemePref } from '../theme.svelte.ts';
  import type { ThemePref } from '../theme.ts';

  const options: { value: ThemePref; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];
</script>

<Header title="Settings" back="#/overview" />

<div class="stack">
  <section class="card">
    <fieldset>
      <legend><h2>Appearance</h2></legend>
      <div class="segmented">
        {#each options as { value, label } (value)}
          <label>
            <input
              type="radio"
              name="theme"
              {value}
              checked={appearance.pref === value}
              onchange={() => setThemePref(value)}
            />
            <span>{label}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  </section>

  <section class="card">
    <h2>About</h2>
    <p class="muted">Version {import.meta.env.VITE_APP_VERSION} · build {import.meta.env.VITE_COMMIT.slice(0, 7)}</p>
  </section>
</div>

<style>
  .stack {
    display: grid;
    gap: 12px;
    margin: 0 16px;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
  legend {
    padding: 0;
  }
  p {
    margin: 0;
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-control);
    background: var(--bg);
  }
  label {
    position: relative;
  }
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
  }
  span {
    display: grid;
    place-items: center;
    min-height: var(--tap);
    border-radius: 9px;
    color: var(--muted);
  }
  input:checked + span {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
  }
  input:focus-visible + span {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
