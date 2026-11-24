<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { normalizeName } from '../../../core/clients.ts';
  import { fullName } from '../../../core/groups.ts';
  import { formatMoney, formatUnitCost } from '../../../core/money.ts';
  import { isExpenseItem, purchaseLineUnitCost, purchaseTotal, validatePurchase } from '../../../core/purchases.ts';
  import type { Id, PaymentMethod, ProductClass, Purchase, PurchaseLine, Supplier } from '../../../core/types.ts';
  import { app, localDate, newId, newPurchaseDraft, savePurchase, undoPurchaseToast, view } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { groupedOptions } from '../stock/grouping.ts';
  import { buildPurchaseLine, matchSuppliers, pickableClasses, recentSuppliers, stockHint } from './logic.ts';
  import SupplierSheet from './SupplierSheet.svelte';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  interface Row {
    lineId: Id;
    cls: ProductClass;
    amountText: string;
    totalText: string;
  }

  // The edited purchase as it was when the form opened (the route is keyed, so this runs once).
  // svelte-ignore state_referenced_locally
  const prev: Purchase | undefined = params.route === 'purchase-edit' ? $state.snapshot(view.purchasesById.get(params.id ?? '')) : undefined;
  // svelte-ignore state_referenced_locally
  const missing = params.route === 'purchase-edit' && (!prev || prev.voided);

  // A line's class, or a stand-in built from its snapshot when the class is gone.
  const classOf = (l: PurchaseLine): ProductClass =>
    view.classesById.get(l.classId) ??
    ({ id: l.classId, name: l.className, trackStock: true, sellable: false, unit: { name: l.unitName, decimals: l.decimals } } as ProductClass);
  const rowOf = (l: PurchaseLine): Row => ({
    lineId: l.lineId,
    cls: classOf(l),
    amountText: String(l.amount / 10 ** l.decimals),
    totalText: (l.lineTotal / 100).toFixed(2),
  });

  const today = localDate();
  const base = prev ?? newPurchaseDraft(today);
  let supplierId = $state<Id | null>(base.supplierId);
  let date = $state(base.date);
  let rows = $state<Row[]>(prev ? prev.lines.map(rowOf) : []);
  let method = $state<PaymentMethod>(base.method);
  let note = $state(base.note);
  let errors = $state<string[]>([]);
  let busy = $state(false);

  let supplierSearch = $state('');
  let newSupplier = $state(false);
  let itemSheet = $state(false);
  let itemSearch = $state('');

  const methodOptions: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'bizum', label: 'Bizum' },
    { value: 'other', label: 'Other' },
  ];

  const matches = $derived(matchSuppliers(app.suppliers, supplierSearch));
  const chips = $derived.by(() => {
    const recent = recentSuppliers(app.suppliers, app.purchases);
    const chosen = supplierId ? view.suppliersById.get(supplierId) : undefined;
    return chosen && !recent.some((s) => s.id === chosen.id) ? [chosen, ...recent] : recent;
  });
  const pickable = $derived.by(() => {
    const q = normalizeName(itemSearch);
    return groupedOptions(pickableClasses(app.products).filter((c) => !q || normalizeName(fullName(c)).includes(q)));
  });
  const built = $derived(rows.map((r) => buildPurchaseLine(r.cls, r.amountText, r.totalText, r.lineId)));
  const total = $derived(purchaseTotal(built.map((b) => b.line)));

  const chipLabel = (s: Supplier) => s.name + (s.archived ? ' (archived)' : '');

  function pickSupplier(id: Id | null) {
    supplierId = id;
    supplierSearch = '';
  }

  function addItem(cls: ProductClass) {
    rows.push({ lineId: newId(), cls, amountText: '', totalText: '' });
    itemSheet = false;
    itemSearch = '';
  }

  /** Hint under a line: unit cost and stock change, once the inputs parse. */
  function hint(r: Row, b: (typeof built)[number]): string {
    if (isExpenseItem(r.cls) || b.errors.length) return '';
    const l = b.line;
    const before = (view.snapshot.get(l.classId)?.stock ?? 0) - (prev?.lines.filter((x) => x.classId === l.classId).reduce((s, x) => s + x.amount, 0) ?? 0);
    return `${formatUnitCost(purchaseLineUnitCost(l))} / ${l.unitName} · ${stockHint(before, l.amount, l.decimals, l.unitName, r.cls.name)}`;
  }

  async function save() {
    const lines = built.map((b) => b.line);
    const rowErrors = built.flatMap((b) => b.errors);
    errors = rowErrors.length ? rowErrors : validatePurchase({ lines });
    if (errors.length) return;
    busy = true;
    try {
      const saved = await savePurchase({ ...base, date, supplierId, lines, method, note: note.trim() });
      go(`#/purchases/${saved.id}`, true);
      if (prev) showToast('Purchase updated');
      else undoPurchaseToast('Purchase saved', saved.id);
    } finally {
      busy = false;
    }
  }
</script>

<Header title={prev ? 'Edit purchase' : 'New purchase'} back={prev ? `#/purchases/${prev.id}` : '#/purchases'} />

{#if missing}
  <div class="page">
    <EmptyState title="This purchase can't be edited">
      <p>It was not found or it is voided.</p>
      <a class="btn" href="#/purchases">Back to purchases</a>
    </EmptyState>
  </div>
{:else}
  <div class="page">
    <section class="picker">
      <h2>Supplier</h2>
      <SearchField bind:value={supplierSearch} label="Search suppliers" placeholder="Search or type a new name" />
      {#if supplierSearch.trim()}
        <div class="card list matches">
          {#each matches as s (s.id)}
            <button type="button" class="list-row" onclick={() => pickSupplier(s.id)}><span class="grow title">{s.name}</span></button>
          {:else}
            <p class="hint none">No supplier called “{supplierSearch.trim()}”.</p>
          {/each}
        </div>
      {/if}
      <div class="chips">
        <button type="button" class="chip" class:on={supplierId === null} aria-pressed={supplierId === null} onclick={() => pickSupplier(null)}>No supplier</button>
        {#each chips as s (s.id)}
          <button type="button" class="chip" class:on={s.id === supplierId} aria-pressed={s.id === supplierId} onclick={() => pickSupplier(s.id)}>{chipLabel(s)}</button>
        {/each}
        <button type="button" class="chip new" onclick={() => (newSupplier = true)}>+ New supplier</button>
      </div>
    </section>

    <div class="field">
      <label for="purchase-date">Date</label>
      <input id="purchase-date" class="input" type="date" bind:value={date} />
    </div>

    <section class="picker">
      <h2>Items</h2>
      {#each rows as r, i (r.lineId)}
        {@const b = built[i]}
        <div class="card line">
          <div class="row-between">
            <span class="title">{fullName(r.cls)}</span>
            <button type="button" class="icon-btn" aria-label="Remove {fullName(r.cls)}" onclick={() => rows.splice(i, 1)}><Icon name="close" /></button>
          </div>
          <div class="inputs">
            {#if !isExpenseItem(r.cls)}
              <div class="field">
                <label for="amt-{r.lineId}">Amount ({r.cls.unit.name})</label>
                <input id="amt-{r.lineId}" class="input" inputmode="decimal" autocomplete="off" bind:value={r.amountText} />
              </div>
            {/if}
            <div class="field">
              <label for="tot-{r.lineId}">Total paid €</label>
              <input id="tot-{r.lineId}" class="input" inputmode="decimal" autocomplete="off" placeholder="0.00" bind:value={r.totalText} />
            </div>
          </div>
          {#if hint(r, b)}<p class="hint">{hint(r, b)}</p>{/if}
        </div>
      {/each}
      <button type="button" class="btn btn-block" onclick={() => (itemSheet = true)}>+ Add item</button>
    </section>

    <div class="field">
      <span class="label">Payment method</span>
      <Segmented options={methodOptions} bind:value={method} label="Payment method" />
    </div>
    <div class="field">
      <label for="purchase-note">Note</label>
      <input id="purchase-note" class="input" bind:value={note} placeholder="Optional" autocomplete="off" />
    </div>
  </div>

  <footer class="sticky-footer">
    <div class="row-between">
      <span class="muted">Total</span>
      <span class="total">{formatMoney(total)}</span>
    </div>
    {#if errors.length}
      <ul class="errors" role="alert">
        {#each errors as e (e)}<li class="error">{e}</li>{/each}
      </ul>
    {/if}
    <button type="button" class="btn btn-primary btn-block" disabled={busy} onclick={save}>{prev ? 'Save changes' : 'Save purchase'}</button>
  </footer>
{/if}

<SupplierSheet bind:open={newSupplier} full={false} initialName={supplierSearch.trim()} onsaved={(s) => pickSupplier(s.id)} />

<Sheet bind:open={itemSheet} title="Add item">
  <SearchField bind:value={itemSearch} label="Search items" placeholder="Search items" />
  {#each pickable as g (g.path)}
    {#if g.path}<h3 class="group">{g.path.replaceAll('/', ' - ')}</h3>{/if}
    <div class="list">
      {#each g.items as c (c.id)}
        <button type="button" class="list-row" onclick={() => addItem(c)}>
          <span class="grow title">{fullName(c)}</span>
          <span class="muted">{isExpenseItem(c) ? 'expense' : c.unit.name}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="hint">No items. Add a stock-tracked or expense item in Products first.</p>
  {/each}
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
  .group {
    margin: 12px 4px 0;
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
  .line {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
  }
  .inputs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 10px;
  }
  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border: 0;
    background: none;
    color: var(--muted);
  }
  .total {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .errors {
    margin: 0;
    padding: 0 0 0 18px;
  }
</style>
