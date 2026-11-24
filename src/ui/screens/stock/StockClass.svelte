<script lang="ts">
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import Tag from '../../components/Tag.svelte';
  import { fullName } from '../../../core/groups.ts';
  import { formatMoney, formatUnitCost } from '../../../core/money.ts';
  import { formatAmount, parseAmount } from '../../../core/quantity.ts';
  import { classTimeline, isLowStock, sellRate } from '../../../core/stock.ts';
  import type { StockEvent } from '../../../core/types.ts';
  import { app, localDate, saveClass, view, voidStockEvent } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { liveName } from './grouping.ts';
  import StockChart from './StockChart.svelte';
  import { cap, dayLabel, daysLeftText, movementLabel, rateText, reasonLabel, signedAmount, transformSummary } from './logic.ts';

  let { params = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();

  const today = localDate();
  const cls = $derived(view.classesById.get(params.classId ?? ''));
  const timeline = $derived(cls ? classTimeline(cls, app.orders, app.stock, view.classesById) : []);
  const stock = $derived(cls ? (view.snapshot.get(cls.id)?.stock ?? 0) : 0);
  const rate = $derived(cls ? sellRate(cls.id, app.orders, today) : { perDay: 0, enoughData: false });
  const fmt = (v: number) => (cls ? formatAmount(v, cls.unit.decimals, cls.unit.name) : '');
  const history = $derived([...timeline].reverse());

  // Low threshold, edited inline.
  let editing = $state(false);
  let thresholdText = $state('');
  let thresholdError = $state('');
  function startEdit() {
    if (!cls) return;
    thresholdText = cls.lowStockThreshold === null ? '' : formatAmount(cls.lowStockThreshold, cls.unit.decimals).replaceAll(',', '');
    thresholdError = '';
    editing = true;
  }
  async function saveThreshold(e: SubmitEvent) {
    e.preventDefault();
    if (!cls) return;
    const t = thresholdText.trim();
    const value = t === '' ? null : t === '0' ? 0 : parseAmount(t, cls.unit.decimals);
    if (t !== '' && value === null) {
      thresholdError = `Enter an amount in ${cls.unit.name}, or leave empty for no warning.`;
      return;
    }
    await saveClass({ ...cls, lowStockThreshold: value });
    editing = false;
  }

  // Event sheet and void.
  let event = $state<StockEvent | null>(null);
  let sheetOpen = $state(false);
  let confirmVoid = $state(false);
  function openEvent(id: string) {
    event = app.stock.find((e) => e.id === id) ?? null;
    sheetOpen = !!event;
  }
  async function doVoid() {
    if (!event) return;
    await voidStockEvent(event.id);
    sheetOpen = false;
    showToast(event.type === 'transform' ? 'Transform voided: inputs restored, outputs removed' : 'Stock event voided');
  }
  const typeLabel = (e: StockEvent) => (e.type === 'add' ? 'Add' : e.type === 'remove' ? 'Remove' : 'Transform');
  const nameOf = (id: string) => liveName(view.classesById, id);
</script>

{#if !cls || !cls.trackStock}
  <Header title="Stock" back="#/stock" />
  <div class="page">
    <EmptyState title={cls ? 'This product does not track stock' : 'Product not found'}>
      <a class="btn" href="#/stock">Back to stock</a>
    </EmptyState>
  </div>
{:else}
  <Header title={fullName(cls)} back="#/stock">
    {#snippet actions()}
      {#if !cls.sellable}<Tag>Raw material</Tag>{/if}
      {#if cls.archived}<Tag tone="voided">Archived</Tag>{/if}
    {/snippet}
  </Header>

  <div class="page">
    <section class="card hero">
      <div class="top">
        <span class="stack">
          <span class="muted">In stock</span>
          <span class="big" class:owed-text={stock < 0}>{fmt(stock)}</span>
          {#if stock < 0}<Tag tone="negative">sold without stock</Tag>{/if}
          {#if isLowStock(cls, stock)}<Tag tone="low">Low</Tag>{/if}
        </span>
        <span class="stack right muted">
          {#if cls.sellable}
            <span>{rate.enoughData ? rateText(rate.perDay, cls) : 'Sell rate: not enough data'}</span>
            {#if rate.enoughData}<span>{daysLeftText(cls, stock, rate)} left</span>{/if}
          {/if}
          {#if !editing}
            <span>
              {cls.lowStockThreshold === null ? 'No low warning' : `Low below ${fmt(cls.lowStockThreshold)}`}
              <button type="button" class="btn-ghost edit" onclick={startEdit}>Edit</button>
            </span>
          {/if}
        </span>
      </div>
      {#if editing}
        <form class="threshold" onsubmit={saveThreshold} novalidate>
          <label for="thr" class="label">Low stock at or below ({cls.unit.name}, empty = no warning)</label>
          <div class="thr-row">
            <input id="thr" class="input" inputmode="decimal" autocomplete="off" bind:value={thresholdText} />
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
          </div>
          {#if thresholdError}<p class="error" role="alert">{thresholdError}</p>{/if}
        </form>
      {/if}
      <StockChart {cls} {timeline} {today} />
    </section>

    <section class="actions">
      <a class="btn add" href="#/stock/add?class={cls.id}">+ Add</a>
      <a class="btn tr" href="#/stock/transform?input={cls.id}">Transform</a>
      <a class="btn remove" href="#/stock/remove?class={cls.id}">− Remove</a>
    </section>

    <section class="card">
      <div class="hist-head">
        <h2>History</h2><span class="muted">Change</span><span class="muted">Balance</span>
      </div>
      {#each history as m (`${m.ref.id}-${m.kind}`)}
        {@const label = movementLabel(m, view.classesById)}
        {@const sub = `${cap(dayLabel(m.date, today))}${m.reset ? ' · (negative reset to 0)' : ''}`}
        {#snippet body()}
          <span class="stack">
            <span class="title">{label}</span>
            <span class="muted">{sub}</span>
          </span>
          <span class="amount num" class:owed-text={m.delta < 0 && m.kind !== 'transform-out'}>{signedAmount(m.delta, cls)}</span>
          <span class="num muted" class:owed-text={m.balanceAfter < 0}>{fmt(m.balanceAfter)}</span>
        {/snippet}
        {#if m.ref.type === 'order'}
          <a class="hist-row" href="#/orders/{m.ref.id}">{@render body()}</a>
        {:else}
          <button type="button" class="hist-row" onclick={() => openEvent(m.ref.id)}>{@render body()}</button>
        {/if}
      {:else}
        <p class="muted">No movements yet.</p>
      {/each}
    </section>
  </div>
{/if}

<Sheet bind:open={sheetOpen} title={event ? `${typeLabel(event)} · ${cap(dayLabel(event.date, today))}` : 'Stock event'}>
  {#if event}
    <dl class="details">
      <dt>Date</dt><dd>{event.date}</dd>
      {#if event.type === 'transform'}
        <dt>Transform</dt><dd>{transformSummary(event.inputs, event.outputs, view.classesById)}</dd>
        {@const recipeId = event.recipeId}
        {#if recipeId}<dt>Recipe</dt><dd>{app.recipes.find((r) => r.id === recipeId)?.name ?? 'Unknown'}</dd>{/if}
        {#if event.costs}
          <dt>Cost</dt>
          <dd>{formatMoney(event.costs.total)} (materials {formatMoney(event.costs.materials)}{event.costs.materialsComplete ? '' : ', incomplete'})</dd>
        {/if}
      {:else}
        {@const c = view.classesById.get(event.classId)}
        <dt>Product</dt><dd>{nameOf(event.classId)}</dd>
        <dt>Amount</dt><dd>{event.type === 'add' ? '+' : '−'}{formatAmount(event.amount, c?.unit.decimals ?? 0, c?.unit.name ?? '')}</dd>
        {#if event.type === 'remove'}<dt>Reason</dt><dd>{reasonLabel(event.reason) || '—'}</dd>{/if}
        {#if event.unitCost !== null}<dt>Unit cost</dt><dd>{formatUnitCost(event.unitCost)} / {c?.unit.name}</dd>{/if}
      {/if}
      {#if event.note}<dt>Note</dt><dd>{event.note}</dd>{/if}
      <dt>By</dt><dd>{event.updatedBy || '—'}</dd>
    </dl>
    {#if event.voided}<Tag tone="voided">Voided</Tag>{/if}
  {/if}
  {#snippet footer()}
    {#if event && !event.voided}
      <button type="button" class="btn btn-block btn-danger" onclick={() => (confirmVoid = true)}>Void</button>
    {/if}
  {/snippet}
</Sheet>

<ConfirmSheet bind:open={confirmVoid} title="Void this {event ? typeLabel(event).toLowerCase() : 'event'}?" confirmLabel="Void" danger onconfirm={doVoid}>
  <p>
    {event?.type === 'transform'
      ? 'Voiding restores the inputs and removes the outputs. It stays in the history as voided.'
      : 'The stock goes back as if this never happened. It stays in the history as voided.'}
  </p>
</ConfirmSheet>

<style>
  h2,
  p {
    margin: 0;
  }
  .hero {
    display: grid;
    gap: 12px;
    border-radius: var(--radius-hero);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
  }
  .right {
    align-items: flex-end;
    text-align: right;
  }
  .big {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .edit {
    min-height: var(--tap);
    padding: 0 4px;
    font-weight: 600;
  }
  .threshold {
    display: grid;
    gap: 6px;
  }
  .thr-row {
    display: flex;
    gap: 8px;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .actions .btn {
    min-height: 48px;
    padding: 0 8px;
  }
  .add {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .tr {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }
  .remove {
    color: var(--owed);
  }
  .hist-head,
  .hist-row {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
  .hist-head {
    margin-bottom: 6px;
  }
  .hist-head span {
    text-align: right;
  }
  .hist-row {
    width: 100%;
    min-height: var(--tap);
    padding: 10px 0;
    border: 0;
    border-top: 1px solid var(--divider);
    background: none;
    color: var(--ink);
    text-align: left;
    text-decoration: none;
    font: inherit;
  }
  .num {
    text-align: right;
    overflow-wrap: anywhere;
  }
  .details {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 0 0 12px;
  }
  dt {
    color: var(--muted);
    font-size: var(--fs-small);
  }
  dd {
    margin: 0;
  }
</style>
