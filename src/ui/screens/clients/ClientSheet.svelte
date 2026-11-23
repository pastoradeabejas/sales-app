<script lang="ts">
  import { validateClientName } from '../../../core/clients.ts';
  import type { Client } from '../../../core/types.ts';
  import { app, newClientDraft, saveClient } from '../../data.svelte.ts';
  import Sheet from '../../components/Sheet.svelte';
  import { parseTags } from './logic.ts';

  // New or edit client (same form). `client` null = new.
  let {
    open = $bindable(false),
    client = null,
    onsaved,
  }: { open: boolean; client?: Client | null; onsaved?: (c: Client) => void } = $props();

  let name = $state('');
  let phone = $state('');
  let notes = $state('');
  let tags = $state('');
  let touched = $state(false);

  $effect(() => {
    if (open) {
      name = client?.name ?? '';
      phone = client?.phone ?? '';
      notes = client?.notes ?? '';
      tags = client?.tags.join(', ') ?? '';
      touched = false;
    }
  });

  const check = $derived(validateClientName(name, app.clients, client?.id));

  async function save() {
    touched = true;
    if (check.error) return;
    const saved = { ...(client ?? newClientDraft()), name: name.trim(), phone: phone.trim(), notes: notes.trim(), tags: parseTags(tags) };
    await saveClient(saved);
    open = false;
    onsaved?.(saved);
  }
</script>

<Sheet bind:open title={client ? 'Edit client' : 'New client'}>
  <div class="field">
    <label for="cs-name">Name</label>
    <input id="cs-name" class="input" bind:value={name} autocomplete="off" />
    {#if touched && check.error}<p class="error">{check.error}</p>{/if}
    {#if check.duplicate}
      <p class="warning">
        A client named {check.duplicate.name} already exists.
        <a href="#/clients/{check.duplicate.id}" onclick={() => (open = false)}>Use existing {check.duplicate.name}?</a>
      </p>
    {/if}
  </div>
  <div class="field">
    <label for="cs-phone">Phone (optional)</label>
    <input id="cs-phone" class="input" type="tel" bind:value={phone} autocomplete="off" />
  </div>
  <div class="field">
    <label for="cs-notes">Notes</label>
    <textarea id="cs-notes" class="input" bind:value={notes}></textarea>
  </div>
  <div class="field">
    <label for="cs-tags">Tags (comma separated)</label>
    <input id="cs-tags" class="input" bind:value={tags} autocomplete="off" />
  </div>
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" onclick={save}>{client ? 'Save' : 'Add client'}</button>
  {/snippet}
</Sheet>
