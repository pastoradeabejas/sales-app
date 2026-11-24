<script lang="ts">
  import { formatMoney } from '../../../core/money.ts';
  import { app, view } from '../../data.svelte.ts';
  import Avatar from '../../components/Avatar.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import GoneQuiet from './GoneQuiet.svelte';
  import ClientSheet from './ClientSheet.svelte';
  import { clientRows, filterClients, shortDate, sortRows, type ClientSort } from './logic.ts';

  let { query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const asSort = (s: string | undefined): ClientSort => (s === 'name' || s === 'last' ? s : 'owed');
  let search = $state('');
  let sort = $state<ClientSort>('owed');
  let showArchived = $state(false);
  let adding = $state(false);

  $effect(() => {
    sort = asSort(query.sort);
  });

  const rows = $derived(
    sortRows(clientRows(filterClients(app.clients, search, showArchived), app.orders, view.balances), sort),
  );
</script>

<Header title="Clients">
  {#snippet actions()}
    <button type="button" class="btn btn-primary" onclick={() => (adding = true)}>+ New client</button>
  {/snippet}
</Header>
<TabSwitch side="clients" />

<div class="page">
  <SearchField bind:value={search} label="Search clients" placeholder="Search name, phone or tag" />
  <Segmented
    label="Sort clients"
    bind:value={sort}
    options={[
      { value: 'owed', label: 'Owed' },
      { value: 'name', label: 'Name' },
      { value: 'last', label: 'Last order' },
    ]}
  />

  <GoneQuiet />

  {#if rows.length === 0}
    <EmptyState title={app.clients.length === 0 ? 'No clients yet' : 'No clients found'}>
      {#if app.clients.length === 0}Add your first client with "+ New client".{/if}
    </EmptyState>
  {:else}
    <div class="card list">
      {#each rows as r (r.client.id)}
        <a class="list-row" href="#/clients/{r.client.id}">
          <Avatar name={r.client.name} />
          <span class="grow">
            <span class="title ellipsis">{r.client.name}{r.client.archived ? ' (archived)' : ''}</span>
            <span class="muted">{r.lastOrder ? `Last order ${shortDate(r.lastOrder)}` : 'No orders'}</span>
          </span>
          {#if r.owed > 0}
            <span class="amount owed-text">{formatMoney(r.owed)}</span>
          {:else if r.credit > 0}
            <span class="amount credit-text">Credit {formatMoney(r.credit)}</span>
          {:else}
            <span class="muted">Settled</span>
          {/if}
        </a>
      {/each}
    </div>
  {/if}

  <label class="toggle">
    <input type="checkbox" bind:checked={showArchived} />
    Show archived
  </label>
</div>

<ClientSheet bind:open={adding} />

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--tap);
    padding: 0 4px;
    color: var(--muted);
  }
  .toggle input {
    width: 20px;
    height: 20px;
  }
</style>
