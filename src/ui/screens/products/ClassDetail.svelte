<script lang="ts">
  import { untrack } from 'svelte';
  import Header from '../../components/Header.svelte';
  import Icon from '../../components/Icon.svelte';
  import Tag from '../../components/Tag.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import VariantSheet from './VariantSheet.svelte';
  import {
    app,
    view,
    newClassDraft,
    saveClass,
    decimalsLocked,
    stampVariant,
    newId,
  } from '../../data.svelte.ts';
  import { go } from '../../router.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { formatUnitCost } from '../../../core/money.ts';
  import { formatAmount, parseAmount } from '../../../core/quantity.ts';
  import type { CustomField, Decimals, ProductClass, Variant } from '../../../core/types.ts';
  import { fieldKey, moveVariant, priceLabel, sortedVariants, validateClassName, type VariantValue } from './logic.ts';

  let { params = {}, query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();
  untrack(() => query);

  // The router remounts this screen per route, so reading the id once is enough.
  const classId = untrack(() => params.classId ?? params.id);
  const stored = $derived(classId ? view.classesById.get(classId) : undefined);
  const isNew = !classId || classId === 'new';

  const DEFAULT_DECIMALS: Record<string, Decimals> = { pcs: 0, kg: 3, g: 0, L: 2, m: 2, box: 0 };
  const DECIMAL_OPTIONS = (['0', '1', '2', '3'] as const).map((d) => ({ value: d, label: d }));

  // Local edit copy of the class form (variants are saved separately from the stored class).
  const initial: ProductClass = isNew
    ? newClassDraft()
    : ($state.snapshot(view.classesById.get(classId as string) ?? newClassDraft()) as ProductClass);
  let name = $state(initial.name);
  let unitName = $state(initial.unit.name);
  let decimals = $state(String(initial.unit.decimals) as '0' | '1' | '2' | '3');
  let trackStock = $state(initial.trackStock);
  let sellable = $state(initial.sellable);
  let notes = $state(initial.notes);
  let lowText = $state(
    initial.lowStockThreshold === null ? '' : formatAmount(initial.lowStockThreshold, initial.unit.decimals),
  );
  let fields = $state<CustomField[]>(initial.customFields.map((f) => ({ ...f })));
  let values = $state<Record<string, string>>(
    Object.fromEntries(initial.customFields.map((f) => [f.key, String(initial.customValues[f.key] ?? '')])),
  );
  let tried = $state(false);

  const missing = $derived(!isNew && !stored);
  const locked = $derived(!isNew && decimalsLocked(classId as string));
  const dec = $derived(Number(decimals) as Decimals);
  const nameError = $derived(validateClassName(name, app.products, stored?.id));
  const unitError = $derived(unitName.trim() ? null : 'Unit name is required');
  const lowParsed = $derived(lowText.trim() ? parseAmount(lowText, dec) : null);
  const lowError = $derived(trackStock && lowText.trim() && lowParsed === null ? 'Enter an amount greater than 0 or leave empty' : null);
  const valueErrors = $derived(
    fields.map((f) => (f.type === 'number' && values[f.key]?.trim() && Number.isNaN(Number(values[f.key].replace(',', '.'))) ? 'Enter a number' : null)),
  );
  const labelErrors = $derived(fields.map((f) => (f.label.trim() ? null : 'Label is required')));
  const valid = $derived(
    !nameError && !unitError && !lowError && valueErrors.every((e) => !e) && labelErrors.every((e) => !e),
  );

  function onUnitInput() {
    const d = DEFAULT_DECIMALS[unitName.trim()];
    if (isNew && d !== undefined) decimals = String(d) as typeof decimals;
  }

  function addField() {
    const key = fieldKey(`field ${fields.length + 1}`, fields.map((f) => f.key));
    fields.push({ key, label: '', type: 'text' });
    values[key] = '';
  }
  function removeField(i: number) {
    const [f] = fields.splice(i, 1);
    delete values[f.key];
  }

  async function save() {
    tried = true;
    if (!valid) return;
    const base = stored ? ($state.snapshot(stored) as ProductClass) : newClassDraft();
    const oldDec = base.unit.decimals;
    // Without orders or stock, new decimals rescale the stored fixed amounts.
    const variants = base.variants.map((v) =>
      v.baseAmount !== null && oldDec !== dec
        ? stampVariant({ ...v, baseAmount: Math.round(v.baseAmount * 10 ** (dec - oldDec)) })
        : v,
    );
    const customFields = fields.map((f) => ({ ...f, label: f.label.trim() }));
    const customValues: Record<string, string | number> = {};
    for (const f of customFields) {
      const t = (values[f.key] ?? '').trim();
      if (!t) continue;
      customValues[f.key] = f.type === 'number' ? Number(t.replace(',', '.')) : t;
    }
    const cls: ProductClass = {
      ...base,
      name: name.trim(),
      unit: { name: unitName.trim(), decimals: dec },
      trackStock,
      sellable,
      lowStockThreshold: trackStock ? lowParsed : null,
      notes: notes.trim(),
      customFields,
      customValues,
      variants,
    };
    await saveClass(cls);
    showToast(isNew && sellable ? 'Class added. Now add its variants.' : isNew ? 'Class added' : 'Class saved');
    if (isNew) go(`#/products/${cls.id}`, true);
  }

  // Variants (saved straight onto the stored class)
  let variantOpen = $state(false);
  let editing = $state<Variant | null>(null);
  let confirmClass = $state(false);
  let confirmVariant = $state(false);
  let target = $state<Variant | null>(null);

  async function saveVariants(variants: Variant[]) {
    if (stored) await saveClass({ ...($state.snapshot(stored) as ProductClass), variants });
  }

  async function saveVariant(value: VariantValue, id: string | null) {
    if (!stored) return;
    const list = $state.snapshot(stored.variants) as Variant[];
    if (id) {
      await saveVariants(list.map((v) => (v.id === id ? stampVariant({ ...v, ...value }) : v)));
    } else {
      const sortOrder = Math.max(0, ...list.map((v) => v.sortOrder)) + 1;
      const v = stampVariant({ id: newId(), ...value, sortOrder, archived: false, createdAt: '', updatedAt: '', updatedBy: '' });
      await saveVariants([...list, v]);
    }
  }

  async function reorder(id: string, dir: -1 | 1) {
    if (!stored) return;
    const before = $state.snapshot(stored.variants) as Variant[];
    const after = moveVariant(before, id, dir);
    const order = new Map(before.map((v) => [v.id, v.sortOrder]));
    await saveVariants(after.map((v) => (order.get(v.id) === v.sortOrder ? v : stampVariant(v))));
  }

  async function toggleVariant() {
    if (!target || !stored) return;
    const t = target;
    await saveVariants(
      ($state.snapshot(stored.variants) as Variant[]).map((v) => (v.id === t.id ? stampVariant({ ...v, archived: !v.archived }) : v)),
    );
    showToast(t.archived ? 'Variant restored' : 'Variant archived');
  }

  async function toggleClass() {
    if (!stored) return;
    const archived = !stored.archived;
    await saveClass({ ...($state.snapshot(stored) as ProductClass), archived });
    showToast(archived ? 'Class archived' : 'Class restored');
    if (archived) go('#/products');
  }
</script>

<Header title={isNew ? 'New class' : (stored?.name ?? 'Product')} back="#/products" />

<div class="page">
  {#if missing}
    <section class="card"><p class="muted">This class does not exist.</p></section>
  {:else}
    <form
      class="card form"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div class="field">
        <label for="c-name">Name</label>
        <input id="c-name" class="input" bind:value={name} maxlength="80" autocomplete="off" />
        {#if tried && nameError}<p class="error">{nameError}</p>{/if}
      </div>

      <div class="field">
        <label for="c-unit">Unit name</label>
        <input
          id="c-unit"
          class="input"
          list="unit-suggestions"
          bind:value={unitName}
          oninput={onUnitInput}
          maxlength="20"
          autocomplete="off"
        />
        <datalist id="unit-suggestions">
          {#each ['pcs', 'kg', 'g', 'L', 'm', 'box'] as u (u)}<option value={u}></option>{/each}
        </datalist>
        {#if tried && unitError}<p class="error">{unitError}</p>{/if}
      </div>

      <div class="field">
        <span class="label">Decimals</span>
        {#if locked}
          <p class="decimals-locked"><strong>{decimals}</strong></p>
          <p class="hint">Decimals can't be changed: this class already has orders or stock movements.</p>
        {:else}
          <Segmented label="Decimals" options={DECIMAL_OPTIONS} bind:value={decimals} />
          <p class="hint">kg with 3 decimals = gram precision. Example: {formatAmount(Math.round(1.25 * 10 ** dec), dec, unitName.trim() || 'units', { fixed: true })}</p>
        {/if}
      </div>

      <label class="toggle">
        <span class="grow">
          <span class="title">Sold to clients</span>
          <span class="muted">Off = raw material: not offered in orders</span>
        </span>
        <input type="checkbox" role="switch" bind:checked={sellable} />
      </label>

      <label class="toggle">
        <span class="grow">
          <span class="title">Track stock</span>
          <span class="muted">Needed for transforms and low-stock warnings</span>
        </span>
        <input type="checkbox" role="switch" bind:checked={trackStock} />
      </label>

      {#if trackStock}
        <div class="field">
          <label for="c-low">Warn when stock is at or below ({unitName.trim() || 'unit'})</label>
          <input id="c-low" class="input" bind:value={lowText} inputmode="decimal" placeholder="No warning" autocomplete="off" />
          {#if tried && lowError}<p class="error">{lowError}</p>{/if}
        </div>
      {/if}

      <div class="field">
        <label for="c-notes">Notes</label>
        <textarea id="c-notes" class="input" bind:value={notes} placeholder="Optional"></textarea>
      </div>

      <div class="field">
        <div class="section-head">
          <span class="label">Custom fields</span>
          <button type="button" class="btn btn-ghost" onclick={addField}>+ Add field</button>
        </div>
        {#each fields as f, i (f.key)}
          <div class="cf">
            <div class="cf-top">
              <input class="input" aria-label="Field label" placeholder="Label" bind:value={f.label} maxlength="40" />
              <select class="input type" aria-label="Field type" bind:value={f.type}>
                <option value="text">Text</option>
                <option value="number">Number</option>
              </select>
              <button type="button" class="icon" aria-label="Remove field {f.label}" onclick={() => removeField(i)}>
                <Icon name="close" />
              </button>
            </div>
            <input
              class="input"
              aria-label="Value of {f.label || 'field'}"
              placeholder="Value"
              inputmode={f.type === 'number' ? 'decimal' : 'text'}
              bind:value={values[f.key]}
            />
            {#if tried && (labelErrors[i] || valueErrors[i])}<p class="error">{labelErrors[i] ?? valueErrors[i]}</p>{/if}
          </div>
        {/each}
      </div>

      <button type="submit" class="btn btn-primary btn-block">{isNew && sellable ? 'Save and add variants' : isNew ? 'Save' : 'Save class'}</button>
    </form>

    {#if stored}
      <section class="card">
        <div class="section-head">
          <h2>Variants</h2>
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => {
              editing = null;
              variantOpen = true;
            }}>+ Add variant</button
          >
        </div>
        {#if !stored.variants.length}
          <p class="muted">{stored.sellable ? 'No variants yet. Add one to start selling this class.' : 'Raw material: no variants needed.'}</p>
        {/if}
        <div class="list">
          {#each sortedVariants(stored.variants) as v, i (v.id)}
            <div class="list-row" class:greyed={v.archived}>
              <button
                type="button"
                class="grow edit"
                onclick={() => {
                  editing = v;
                  variantOpen = true;
                }}
              >
                <span class="title">{v.label}{v.archived ? ' · archived' : ''}</span>
                <span class="muted">
                  {v.kind === 'fixed' && v.baseAmount !== null
                    ? formatAmount(v.baseAmount, stored.unit.decimals, stored.unit.name)
                    : `by ${stored.unit.name}`}
                  · {priceLabel(v, stored.unit.name)}{v.price === 0 ? ' (free)' : ''} · cost {v.cost === null ? '—' : formatUnitCost(v.cost)}
                </span>
              </button>
              {#if v.price === 0}<Tag>free</Tag>{/if}
              <button type="button" class="icon" aria-label="Move {v.label} up" disabled={i === 0} onclick={() => reorder(v.id, -1)}>
                <Icon name="up" />
              </button>
              <button
                type="button"
                class="icon"
                aria-label="Move {v.label} down"
                disabled={i === stored.variants.length - 1}
                onclick={() => reorder(v.id, 1)}
              >
                <Icon name="down" />
              </button>
              <button
                type="button"
                class="icon"
                aria-label="{v.archived ? 'Restore' : 'Archive'} {v.label}"
                onclick={() => {
                  target = v;
                  confirmVariant = true;
                }}
              >
                <Icon name="archive" />
              </button>
            </div>
          {/each}
        </div>
      </section>

      <button type="button" class="btn btn-block {stored.archived ? '' : 'btn-danger'}" onclick={() => (confirmClass = true)}>
        {stored.archived ? 'Restore class' : 'Archive class'}
      </button>

      <VariantSheet
        bind:open={variantOpen}
        unitName={stored.unit.name}
        decimals={stored.unit.decimals}
        siblings={stored.variants}
        variant={editing}
        onsave={saveVariant}
      />

      <ConfirmSheet
        bind:open={confirmClass}
        title={stored.archived ? `Restore ${stored.name}?` : `Archive ${stored.name}?`}
        confirmLabel={stored.archived ? 'Restore' : 'Archive'}
        danger={!stored.archived}
        onconfirm={toggleClass}
      >
        <p>
          {stored.archived
            ? 'It will appear again in lists and in the order picker.'
            : 'It will be hidden from the order picker and the default lists.'}
          History is kept: past orders and stats still show it.
        </p>
      </ConfirmSheet>

      <ConfirmSheet
        bind:open={confirmVariant}
        title={target?.archived ? `Restore ${target?.label}?` : `Archive ${target?.label}?`}
        confirmLabel={target?.archived ? 'Restore' : 'Archive'}
        danger={!target?.archived}
        onconfirm={toggleVariant}
      >
        <p>
          {target?.archived ? 'It can be added to new orders again.' : "It can't be added to new orders."}
          History is kept: past orders and stats still show it.
        </p>
      </ConfirmSheet>
    {/if}
  {/if}
</div>

<style>
  .form {
    display: grid;
    gap: 16px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: var(--tap);
    cursor: pointer;
  }
  .toggle input {
    width: 24px;
    height: 24px;
    accent-color: var(--accent);
    flex: none;
  }
  .decimals-locked {
    margin: 0;
  }
  .cf {
    display: grid;
    gap: 6px;
    padding: 8px 0;
    border-top: 1px solid var(--divider);
  }
  .cf-top {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .type {
    width: 110px;
    flex: none;
  }
  .icon {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    flex: none;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .edit {
    border: 0;
    background: none;
    text-align: left;
    padding: 0;
    min-height: var(--tap);
    justify-content: center;
    cursor: pointer;
  }
  .greyed .title {
    color: var(--muted);
  }
  p {
    margin: 0;
  }
</style>
