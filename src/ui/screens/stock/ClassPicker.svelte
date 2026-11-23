<script lang="ts">
  import type { ProductClass } from '../../../core/types.ts';

  // Class choice: chips for a few classes (mockup), a select when there are many.
  let {
    options,
    value = $bindable(),
    label,
    onchange,
  }: { options: ProductClass[]; value: string; label: string; onchange?: (id: string) => void } = $props();

  function pick(id: string) {
    value = id;
    onchange?.(id);
  }
</script>

{#if options.length <= 8}
  <div class="chips" role="group" aria-label={label}>
    {#each options as c (c.id)}
      <button type="button" class:on={value === c.id} aria-pressed={value === c.id} onclick={() => pick(c.id)}>{c.name}</button>
    {/each}
  </div>
{:else}
  <select class="input" aria-label={label} {value} onchange={(e) => pick(e.currentTarget.value)}>
    <option value="" disabled>Choose…</option>
    {#each options as c (c.id)}
      <option value={c.id}>{c.name}</option>
    {/each}
  </select>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font-size: 14px;
  }
  .on {
    border: 1.5px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 600;
  }
</style>
