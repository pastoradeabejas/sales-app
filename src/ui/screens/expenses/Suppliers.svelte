<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import { app, localDate } from '../../data.svelte.ts';
  import { shortDate } from '../clients/logic.ts';
  import { filterSuppliers, supplierRows } from './logic.ts';
  import SupplierSheet from './SupplierSheet.svelte';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  let search = $state('');
  let showArchived = $state(false);
  let adding = $state(false);

  const rows = $derived(supplierRows(filterSuppliers(app.suppliers, search, showArchived), app.purchases, localDate()));
</script>

<Header title="Expenses">
  {#snippet actions()}
    <button type="button" class="btn btn-primary" onclick={() => (adding = true)}>+ New supplier</button>
  {/snippet}
</Header>
<TabSwitch side="suppliers" />
<div class="page">
  <SearchField bind:value={search} label="Search suppliers" placeholder="Search name or phone" />
  <label class="toggle"><input type="checkbox" bind:checked={showArchived} /> Show archived</label>

  {#if rows.length === 0}
    <EmptyState title={app.suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers found'}>
      {#if app.suppliers.length === 0}Add your first supplier with "+ New supplier".{/if}
    </EmptyState>
  {:else}
    <div class="card list">
      {#each rows as r (r.supplier.id)}
        <a class="list-row" href="#/suppliers/{r.supplier.id}">
          <Avatar name={r.supplier.name} />
          <span class="grow">
            <span class="title">{r.supplier.name}{r.supplier.archived ? ' (archived)' : ''}</span>
            <span class="muted">{r.last ? `Last purchase ${shortDate(r.last)}` : 'No purchases yet'}</span>
          </span>
          <span class="amount">{formatMoney(r.spentYear)}<span class="muted"> this year</span></span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<SupplierSheet bind:open={adding} />

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    font-size: var(--fs-small);
    color: var(--muted);
  }
</style>
