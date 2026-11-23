<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { validateClientName } from '../../../core/clients.ts';
  import type { Id } from '../../../core/types.ts';
  import { app, newClientDraft, saveClient } from '../../data.svelte.ts';
  import Balance from './Balance.svelte';
  import { matchClients, recentClients } from './logic.ts';

  // Client step of the order form (§8.4): search, recent chips, "+ New client" sheet.
  let { selectedId = '', onpick }: { selectedId?: Id; onpick: (id: Id, isNew: boolean) => void } = $props();

  let search = $state('');
  let sheet = $state(false);
  let name = $state('');
  let phone = $state('');
  let tried = $state(false);
  let busy = $state(false);

  const matches = $derived(matchClients(app.clients, search));
  const recent = $derived(recentClients(app.clients, app.orders));
  const check = $derived(validateClientName(name, app.clients));

  function openNew() {
    name = search.trim();
    phone = '';
    tried = false;
    sheet = true;
  }

  async function create() {
    tried = true;
    if (check.error || check.duplicate) return;
    busy = true;
    try {
      const c = await saveClient({ ...newClientDraft(name), phone: phone.trim() });
      sheet = false;
      onpick(c.id, true);
    } finally {
      busy = false;
    }
  }

  function useExisting(id: Id) {
    sheet = false;
    onpick(id, false);
  }
</script>

<section class="picker">
  <h2>Client</h2>
  <SearchField bind:value={search} label="Search clients" placeholder="Search or type a new name" />

  {#if search.trim()}
    <div class="card list matches">
      {#each matches as c (c.id)}
        <button type="button" class="list-row" onclick={() => onpick(c.id, false)}>
          <Avatar name={c.name} size={32} />
          <span class="grow title">{c.name}</span>
          <Balance clientId={c.id} />
        </button>
      {:else}
        <p class="hint none">No client called “{search.trim()}”.</p>
      {/each}
    </div>
  {/if}

  <div class="chips">
    {#each recent as c (c.id)}
      <button type="button" class="chip" class:on={c.id === selectedId} aria-pressed={c.id === selectedId} onclick={() => onpick(c.id, false)}>
        {c.name}
      </button>
    {/each}
    <button type="button" class="chip new" onclick={openNew}>+ New client</button>
  </div>
</section>

<Sheet bind:open={sheet} title="New client">
  <div class="form">
    <div class="field">
      <label for="new-client-name">Name</label>
      <input id="new-client-name" class="input" bind:value={name} maxlength="80" autocomplete="off" />
      {#if tried && check.error}<p class="error">{check.error}</p>{/if}
    </div>
    {#if check.duplicate}
      {@const dup = check.duplicate}
      <p class="warning">
        A client called {dup.name} already exists.
        <button type="button" class="btn btn-ghost" onclick={() => useExisting(dup.id)}>Use existing {dup.name}?</button>
      </p>
    {/if}
    <div class="field">
      <label for="new-client-phone">Phone (optional)</label>
      <input id="new-client-phone" class="input" type="tel" bind:value={phone} placeholder="+34 …" autocomplete="off" />
    </div>
    <p class="hint">A new client has no past orders, so the order starts empty.</p>
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" disabled={busy || !!check.duplicate} onclick={create}>Create and start order</button>
  {/snippet}
</Sheet>

<style>
  .picker {
    display: grid;
    gap: 8px;
  }
  .picker h2 {
    margin: 0 4px;
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .matches {
    padding: 0 14px;
  }
  .none {
    padding: 12px 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 14px;
  }
  .chip.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 600;
  }
  .chip.new {
    border-style: dashed;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }
  .form {
    display: grid;
    gap: 14px;
  }
  .warning .btn {
    min-height: var(--tap);
    padding: 0 4px;
  }
</style>
