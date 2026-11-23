<script lang="ts">
  import type { Client } from '../../../core/types.ts';
  import { app, mergeClients } from '../../data.svelte.ts';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import { go } from '../../router.svelte.ts';
  import { mergePreview, mergeText } from './logic.ts';

  // Merge this client (the duplicate) into the one to keep.
  let { open = $bindable(false), client }: { open: boolean; client: Client } = $props();

  let keepId = $state('');
  const options = $derived(
    app.clients.filter((c) => !c.archived && c.id !== client.id).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const keep = $derived(options.find((c) => c.id === keepId));
  const preview = $derived(mergePreview(app.orders, app.payments, client.id));

  $effect(() => {
    if (open) keepId = '';
  });

  async function confirm() {
    if (!keep) return;
    await mergeClients(keep.id, client.id);
    go(`#/clients/${keep.id}`);
  }
</script>

<ConfirmSheet bind:open title="Merge {client.name} into…" confirmLabel="Merge" danger disabled={!keep} onconfirm={confirm}>
  <div class="field">
    <label for="ms-keep">Client to keep</label>
    <select id="ms-keep" class="input" bind:value={keepId}>
      <option value="">Choose a client</option>
      {#each options as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </div>
  {#if keep}
    <p class="warning">{mergeText(preview)} to {keep.name}. {client.name} will be archived.</p>
  {/if}
</ConfirmSheet>
