<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import { app, localDate } from '../../data.svelte.ts';
  import { quietRows, quietText } from './quiet.ts';

  const rows = $derived(quietRows(app.orders, app.clients, localDate()));
  let open = $state(false);
</script>

{#if rows.length > 0}
  <section class="card">
    <button type="button" class="head" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="title">Gone quiet ({rows.length})</span>
      <span class="muted">{open ? 'Hide' : 'Show'}</span>
    </button>
    {#if open}
      <div class="list">
        {#each rows as r (r.clientId)}
          <a class="list-row" href="#/clients/{r.clientId}">
            <Avatar name={r.clientName} />
            <span class="grow">
              <span class="title ellipsis">{r.clientName}</span>
              <span class="muted">{quietText(r.days, r.orderCount)}</span>
            </span>
          </a>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-height: var(--tap);
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
  }
</style>
