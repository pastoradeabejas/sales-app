<script lang="ts">
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Tag from '../../components/Tag.svelte';
  import { formatMoney, formatUnitCost } from '../../../core/money.ts';
  import { isExpenseItem, purchaseLineUnitCost } from '../../../core/purchases.ts';
  import { formatAmount } from '../../../core/quantity.ts';
  import type { PaymentMethod } from '../../../core/types.ts';
  import { view, voidPurchase } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { formatDay } from '../orders/logic.ts';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const purchase = $derived(view.purchasesById.get(params.id ?? ''));
  const supplier = $derived(purchase?.supplierId ? view.suppliersById.get(purchase.supplierId) : undefined);
  const methodLabel: Record<PaymentMethod, string> = { cash: 'Cash', bizum: 'Bizum', other: 'Other' };
  const expense = (classId: string) => {
    const c = view.classesById.get(classId);
    return !!c && isExpenseItem(c);
  };

  let voiding = $state(false);

  async function confirmVoid() {
    if (!purchase) return;
    await voidPurchase(purchase.id);
    showToast('Purchase voided');
  }
</script>

<Header title="Purchase" back="#/purchases" />

{#if !purchase}
  <div class="page">
    <EmptyState title="Purchase not found">
      <a class="btn" href="#/purchases">Back to purchases</a>
    </EmptyState>
  </div>
{:else}
  <div class="page">
    <section class="card head">
      <div class="row-between">
        {#if purchase.supplierId}
          <a class="title" href="#/suppliers/{purchase.supplierId}">{supplier?.name ?? purchase.supplierName}{supplier?.archived ? ' (archived)' : ''}</a>
        {:else}
          <span class="title">No supplier</span>
        {/if}
        {#if purchase.voided}<Tag tone="voided">Voided</Tag>{/if}
      </div>
      <span class="muted">{formatDay(purchase.date, true)} · {methodLabel[purchase.method]}</span>
      {#if purchase.note}<span class="muted">{purchase.note}</span>{/if}
    </section>

    <section class="card items">
      <h2>Items</h2>
      {#each purchase.lines as l (l.lineId)}
        <div class="line">
          <span class="grow">
            <span class="title">{l.className}</span>
            {#if !expense(l.classId)}
              <span class="muted">{formatAmount(l.amount, l.decimals, l.unitName)} · {formatUnitCost(purchaseLineUnitCost(l))} / {l.unitName}</span>
            {/if}
          </span>
          <span class="amount">{formatMoney(l.lineTotal)}</span>
        </div>
      {/each}
      <div class="row-between total"><span>Total</span><span>{formatMoney(purchase.total)}</span></div>
    </section>

    {#if !purchase.voided}
      <div class="two">
        <a class="btn" href="#/purchases/{purchase.id}/edit">Edit</a>
        <button type="button" class="btn btn-danger" onclick={() => (voiding = true)}>Void</button>
      </div>
    {/if}
  </div>

  <ConfirmSheet bind:open={voiding} title="Void purchase" confirmLabel="Void purchase" danger onconfirm={confirmVoid}>
    <p class="hint">A voided purchase stays in the history but no longer counts in totals or stock.</p>
  </ConfirmSheet>
{/if}

<style>
  .head {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
  }
  .items {
    padding: 6px 16px 14px;
  }
  .items h2 {
    margin: 10px 0 6px;
    font-size: var(--fs-body);
  }
  .line {
    display: flex;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid var(--divider);
  }
  .line .grow {
    display: grid;
  }
  .total {
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 16px;
    font-weight: 700;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
</style>
