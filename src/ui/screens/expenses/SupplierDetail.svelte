<script lang="ts">
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import { isExpenseItem } from '../../../core/purchases.ts';
  import type { PurchaseLine } from '../../../core/types.ts';
  import { app, localDate, saveSupplier, view } from '../../data.svelte.ts';
  import { shortDate } from '../clients/logic.ts';
  import { purchaseSummary, spentIn } from './logic.ts';
  import SupplierSheet from './SupplierSheet.svelte';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const supplier = $derived(view.suppliersById.get(params.id ?? ''));
  const purchases = $derived(
    app.purchases
      .filter((p) => p.supplierId === supplier?.id && !p.voided)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  );
  const today = localDate();
  const expense = (l: PurchaseLine) => {
    const c = view.classesById.get(l.classId);
    return !!c && isExpenseItem(c);
  };

  let editing = $state(false);
  let archiving = $state(false);

  async function toggleArchive() {
    if (supplier) await saveSupplier({ ...supplier, archived: !supplier.archived });
  }
</script>

{#if !supplier}
  <Header title="Supplier" back="#/suppliers" />
  <div class="page"><EmptyState title="Supplier not found" /></div>
{:else}
  <Header title={supplier.name + (supplier.archived ? ' (archived)' : '')} back="#/suppliers" />

  <div class="page">
    {#if supplier.phone || supplier.notes}
      <div class="info">
        {#if supplier.phone}<a href="tel:{supplier.phone}">{supplier.phone}</a>{/if}
        {#if supplier.notes}<span class="muted">{supplier.notes}</span>{/if}
      </div>
    {/if}

    <section class="card stats">
      <div class="row-between"><span class="muted">Spent this month</span><span class="amount">{formatMoney(spentIn(app.purchases, today.slice(0, 7), supplier.id))}</span></div>
      <div class="row-between"><span class="muted">Spent all time</span><span class="amount">{formatMoney(spentIn(app.purchases, '', supplier.id))}</span></div>
    </section>

    <div class="two">
      <button type="button" class="btn" onclick={() => (editing = true)}>Edit</button>
      <button type="button" class="btn" onclick={() => (archiving = true)}>{supplier.archived ? 'Unarchive' : 'Archive'}</button>
    </div>

    <section>
      <h2>Purchases</h2>
      {#if purchases.length === 0}
        <EmptyState title="No purchases yet" />
      {:else}
        <div class="card list">
          {#each purchases as p (p.id)}
            <a class="list-row" href="#/purchases/{p.id}">
              <span class="grow">
                <span class="muted">{shortDate(p.date)}</span>
                <span class="ellipsis">{purchaseSummary(p.lines, expense)}</span>
              </span>
              <span class="amount">{formatMoney(p.total)}</span>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <SupplierSheet bind:open={editing} {supplier} />
  <ConfirmSheet
    bind:open={archiving}
    title={supplier.archived ? `Unarchive ${supplier.name}?` : `Archive ${supplier.name}?`}
    confirmLabel={supplier.archived ? 'Unarchive' : 'Archive'}
    onconfirm={toggleArchive}
  >
    <p class="hint">
      {supplier.archived
        ? 'They will be offered in the purchase form again.'
        : 'They are hidden from the purchase form. Their purchases stay valid.'}
    </p>
  </ConfirmSheet>
{/if}

<style>
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 4px;
  }
  .stats {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
</style>
