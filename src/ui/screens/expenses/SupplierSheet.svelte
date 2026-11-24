<script lang="ts">
  import { validateClientName } from '../../../core/clients.ts';
  import type { Supplier } from '../../../core/types.ts';
  import { app, newSupplierDraft, saveSupplier } from '../../data.svelte.ts';
  import Sheet from '../../components/Sheet.svelte';

  // New or edit supplier (same form). `supplier` null = new; `full` adds the notes field.
  let {
    open = $bindable(false),
    supplier = null,
    full = true,
    initialName = '',
    onsaved,
  }: { open: boolean; supplier?: Supplier | null; full?: boolean; initialName?: string; onsaved?: (s: Supplier) => void } = $props();

  let name = $state('');
  let phone = $state('');
  let notes = $state('');
  let touched = $state(false);

  $effect(() => {
    if (open) {
      name = supplier?.name ?? initialName;
      phone = supplier?.phone ?? '';
      notes = supplier?.notes ?? '';
      touched = false;
    }
  });

  const check = $derived(validateClientName(name, app.suppliers, supplier?.id));

  async function save() {
    touched = true;
    if (check.error || check.duplicate) return;
    const saved = await saveSupplier({ ...(supplier ?? newSupplierDraft()), name: name.trim(), phone: phone.trim(), notes: notes.trim() });
    open = false;
    onsaved?.(saved);
  }
</script>

<Sheet bind:open title={supplier ? 'Edit supplier' : 'New supplier'}>
  <div class="field">
    <label for="ss-name">Name</label>
    <input id="ss-name" class="input" bind:value={name} autocomplete="off" />
    {#if touched && check.error}<p class="error">{check.error}</p>{/if}
    {#if check.duplicate}<p class="warning">A supplier named {check.duplicate.name} already exists.</p>{/if}
  </div>
  <div class="field">
    <label for="ss-phone">Phone (optional)</label>
    <input id="ss-phone" class="input" type="tel" bind:value={phone} autocomplete="off" />
  </div>
  {#if full}
    <div class="field">
      <label for="ss-notes">Notes</label>
      <textarea id="ss-notes" class="input" bind:value={notes}></textarea>
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" class="btn btn-primary btn-block" onclick={save}>{supplier ? 'Save' : 'Add supplier'}</button>
  {/snippet}
</Sheet>
