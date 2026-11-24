<script lang="ts">
  import { nextSort, type Sort, type SortKey } from '../screens/profit/logic.ts';

  // Table header whose columns sort the table: tap a column, tap again to flip.
  let { cols, sort = $bindable() }: { cols: { key: SortKey; label: string }[]; sort: Sort } = $props();
</script>

<thead>
  <tr>
    {#each cols as c (c.key)}
      <th aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" class:on={sort.key === c.key} onclick={() => (sort = nextSort(sort, c.key))}>
          {c.label}<span class="arrow" aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
        </button>
      </th>
    {/each}
  </tr>
</thead>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button.on {
    color: var(--accent);
  }
  .arrow {
    font-size: 0.7em;
  }
</style>
