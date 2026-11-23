<script lang="ts">
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import { app, clearDevice, getStore, localDate } from '../../data.svelte.ts';
  import { connect, stopSync, sync, syncNow, tokenDaysLeft } from '../../sync.svelte.ts';
  import type { OutboxEntry } from '../../../store/store.ts';
  import { go } from '../../router.svelte.ts';

  // Data repository setup (§8.1) and sync details (§6.5).
  const s = app.settings;
  let dataRepo = $state(s.dataRepo);
  let token = $state(s.token);
  let branch = $state(s.branch || 'main');
  let deviceName = $state(s.deviceName);
  let tokenExpiry = $state(s.tokenExpiry ?? '');
  let showToken = $state(false);
  let busy = $state(false);
  let error = $state('');

  let initOpen = $state(false);
  let initAnswer: ((yes: boolean) => void) | null = null;
  function askInit(): Promise<boolean> {
    initOpen = true;
    return new Promise((resolve) => (initAnswer = resolve));
  }

  // Closing the sheet without confirming answers no.
  $effect(() => {
    if (!initOpen && initAnswer) {
      const answer = initAnswer;
      initAnswer = null;
      answer(false);
    }
  });

  const connected = $derived(Boolean(app.settings.dataRepo && app.settings.token && app.settings.deviceName));

  async function doConnect(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(dataRepo.trim())) return void (error = 'Enter the repository as owner/name.');
    if (!token.trim()) return void (error = 'Enter the token.');
    if (!deviceName.trim()) return void (error = 'Enter a device name, e.g. Phone A.');
    busy = true;
    try {
      error =
        (await connect(
          { dataRepo, token, branch: branch.trim() || 'main', deviceName: deviceName.trim(), tokenExpiry: tokenExpiry || null },
          askInit,
        )) ?? '';
      if (!error) go('#/overview');
    } finally {
      busy = false;
    }
  }

  let outbox = $state<OutboxEntry[]>([]);
  $effect(() => {
    void sync.state.pendingCount;
    if (connected) getStore().outbox().then((o) => (outbox = o));
  });

  let disconnectOpen = $state(false);
  async function disconnect() {
    stopSync();
    await clearDevice();
    token = '';
    dataRepo = '';
  }

  const daysLeft = $derived(tokenDaysLeft(app.settings.tokenExpiry, localDate()));
</script>

{#if connected}
  <section class="card stack">
    <h2>Sync</h2>
    <p class="muted">
      {app.settings.dataRepo} · {app.settings.branch} · this device: {app.settings.deviceName}
    </p>
    <p>
      Status: <strong>{sync.state.status}</strong>
      {#if sync.state.lastPullAt}· last checked {new Date(sync.state.lastPullAt).toLocaleTimeString()}{/if}
    </p>
    {#if sync.progress}<p class="muted">Downloading {sync.progress.done} / {sync.progress.total}</p>{/if}
    {#if sync.state.authError}<p class="warning">Token invalid or expired. Enter a new token below.</p>{/if}
    {#if sync.state.readOnly}<p class="warning">The data was written by a newer app version. Update the app.</p>{/if}
    {#if sync.state.lastError && !sync.state.authError}<p class="error">{sync.state.lastError}</p>{/if}
    {#if daysLeft !== null && daysLeft <= 14}
      <p class="warning">{daysLeft < 0 ? 'Token expired' : `Token expires in ${daysLeft} days`}</p>
    {/if}
    <button type="button" class="btn" onclick={() => syncNow()}>Sync now</button>
    {#if outbox.length}
      <details>
        <summary>{outbox.length} pending change{outbox.length === 1 ? '' : 's'}</summary>
        <ul class="outbox">
          {#each outbox as e (e.seq)}
            <li>
              <span class="ellipsis">{e.path}</span>
              {#if e.lastError}<span class="error">{e.lastError} ({e.attempts} tries)</span>{/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
    <button type="button" class="btn btn-danger" onclick={() => (disconnectOpen = true)}>Disconnect this device</button>
  </section>
{/if}

<form class="card stack" onsubmit={doConnect}>
  <h2>{connected ? 'Change connection' : 'Connect to the data repository'}</h2>
  <div class="field">
    <label for="repo">Data repository</label>
    <input id="repo" class="input" placeholder="owner/name" autocomplete="off" autocapitalize="off" bind:value={dataRepo} />
  </div>
  <div class="field">
    <label for="token">Token</label>
    <div class="row">
      <input id="token" class="input" type={showToken ? 'text' : 'password'} autocomplete="off" bind:value={token} />
      <button type="button" class="btn" onclick={() => (showToken = !showToken)}>{showToken ? 'Hide' : 'Show'}</button>
    </div>
  </div>
  <div class="field">
    <label for="device">Device name</label>
    <input id="device" class="input" placeholder="e.g. Phone A" bind:value={deviceName} />
  </div>
  <div class="field">
    <label for="expiry">Token expiry date (optional)</label>
    <input id="expiry" class="input" type="date" bind:value={tokenExpiry} />
  </div>
  <details>
    <summary>Advanced</summary>
    <div class="field">
      <label for="branch">Branch</label>
      <input id="branch" class="input" bind:value={branch} />
    </div>
  </details>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button type="submit" class="btn btn-primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
</form>

<ConfirmSheet
  bind:open={initOpen}
  title="This repository is empty"
  confirmLabel="Initialise it"
  onconfirm={() => {
    initAnswer?.(true);
    initAnswer = null;
  }}
>
  <p>Initialise it for Sales Book? This creates a meta.json file.</p>
</ConfirmSheet>

<ConfirmSheet bind:open={disconnectOpen} title="Disconnect this device?" confirmLabel="Disconnect" danger onconfirm={disconnect}>
  <p>The token and all local data are removed from this device. The data repository is not touched.</p>
  {#if outbox.length}
    <p class="warning">{outbox.length} change{outbox.length === 1 ? ' is' : 's are'} not synced yet and will be lost.</p>
  {/if}
</ConfirmSheet>

<style>
  .stack {
    display: grid;
    gap: 12px;
  }
  h2,
  p {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .outbox {
    display: grid;
    gap: 6px;
    padding-left: 18px;
    font-size: var(--fs-small);
  }
  .outbox li {
    display: grid;
  }
  summary {
    min-height: var(--tap);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
</style>
