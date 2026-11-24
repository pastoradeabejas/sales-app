<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import { isExpenseItem } from '../../../core/purchases.ts';
  import type { PurchaseLine } from '../../../core/types.ts';
  import { app, localDate, view } from '../../data.svelte.ts';
  import { filterPurchases, groupPurchasesByDay, monthName, purchaseSummary, spentIn } from './logic.ts';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const today = localDate();
  let search = $state('');
  let showVoided = $state(false);

  const days = $derived(groupPurchasesByDay(filterPurchases(app.purchases, search, showVoided), today));
  const expense = (l: PurchaseLine) => {
    const c = view.classesById.get(l.classId);
    return !!c && isExpenseItem(c);
  };
</script>

<Header title="Expenses">
  {#snippet actions()}
    <a class="btn btn-primary" href="#/purchases/new">+ New purchase</a>
  {/snippet}
</Header>
<TabSwitch side="purchases" />
<div class="page">
  <p class="month">Spent in {monthName(today)} <strong>{formatMoney(spentIn(app.purchases, today.slice(0, 7)))}</strong></p>
  <SearchField bind:value={search} label="Search purchases" placeholder="Search supplier, item, note" />
  <label class="toggle"><input type="checkbox" bind:checked={showVoided} /> Show voided</label>

  {#if app.purchases.length === 0}
    <EmptyState title="No purchases yet">
      <a class="btn btn-primary" href="#/purchases/new">+ New purchase</a>
    </EmptyState>
  {:else if days.length === 0}
    <p class="hint">No purchases match.</p>
  {/if}

  {#each days as day (day.date)}
    <section class="day">
      <h2>{day.label}</h2>
      <div class="card list rows">
        {#each day.purchases as p (p.id)}
          <a class="list-row" href="#/purchases/{p.id}" class:voided={p.voided}>
            <span class="grow">
              <span class="title">{p.supplierName || 'No supplier'}{p.voided ? ' (voided)' : ''}</span>
              <span class="muted ellipsis">{purchaseSummary(p.lines, expense)}</span>
            </span>
            <span class="amount">{formatMoney(p.total)}</span>
          </a>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .month {
    margin: 0 4px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    font-size: var(--fs-small);
    color: var(--muted);
  }
  .day {
    display: grid;
    gap: 6px;
  }
  .day h2 {
    margin: 0 4px;
    font-size: var(--fs-small);
    font-weight: 600;
    color: var(--muted);
  }
  .rows {
    padding: 0 14px;
  }
  .rows .list-row {
    padding: 12px 0;
  }
  .voided {
    opacity: 0.55;
  }
</style>
