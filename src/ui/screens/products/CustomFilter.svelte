<script lang="ts">
  import type { ProductClass } from '../../../core/types.ts';
  import { customFieldLabels } from './customFilter.ts';

  let { classes, key = $bindable(''), text = $bindable('') }: { classes: ProductClass[]; key: string; text: string } = $props();

  const fields = $derived(customFieldLabels(classes));
</script>

{#if fields.length > 0}
  <div class="filter">
    <select class="input" aria-label="Custom field" bind:value={key}>
      <option value="">Custom field…</option>
      {#each fields as f (f.key)}<option value={f.key}>{f.label}</option>{/each}
    </select>
    <input class="input" type="search" aria-label="Custom field value" placeholder="Contains…" bind:value={text} disabled={!key} />
  </div>
{/if}

<style>
  .filter {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
</style>
