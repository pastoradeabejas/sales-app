<script lang="ts">
  import Sheet from '../../components/Sheet.svelte';
  import { formatMoney } from '../../../core/money.ts';
  import type { WorkLevel } from '../../../core/types.ts';
  import { app, newLevelDraft, saveLevel } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import { levelNameError, parseRate, rateText } from './levels.ts';

  // Work levels (§16.5): name and hourly rate; archived levels stay on old recipes and transforms.
  let showArchived = $state(false);
  const shown = $derived(
    app.levels.filter((l) => showArchived || !l.archived).slice().sort((a, b) => a.name.localeCompare(b.name)),
  );

  let open = $state(false);
  let draft = $state<WorkLevel>(newLevelDraft());
  let isNew = $state(true);
  let rateInput = $state('');
  let tried = $state(false);

  function edit(l: WorkLevel | null) {
    isNew = !l;
    draft = l ? { ...l } : newLevelDraft();
    rateInput = l ? rateText(l.hourlyRate) : '';
    tried = false;
    open = true;
  }

  const nameError = $derived(levelNameError(draft.name, app.levels, draft.id));
  const rate = $derived(parseRate(rateInput));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    tried = true;
    if (nameError || rate === null) return;
    await saveLevel({ ...draft, hourlyRate: rate });
    showToast(isNew ? 'Level added' : 'Level saved');
    open = false;
  }

  async function setArchived(archived: boolean) {
    if (archived === false && levelNameError(draft.name, app.levels, draft.id)) {
      tried = true;
      return;
    }
    await saveLevel({ ...draft, archived });
    showToast(archived ? `Archived ${draft.name}` : `Restored ${draft.name}`);
    open = false;
  }
</script>

<section class="card stack">
  <h2>Work levels</h2>
  {#if shown.length}
    <div class="list">
      {#each shown as l (l.id)}
        <button type="button" class="list-row" class:greyed={l.archived} onclick={() => edit(l)}>
          <span class="grow">{l.name}{l.archived ? ' (archived)' : ''}</span>
          <b>{formatMoney(l.hourlyRate)} / h</b>
        </button>
      {/each}
    </div>
  {:else}
    <p class="muted">No levels yet. Levels price the labour in recipes and transforms.</p>
  {/if}
  <button type="button" class="btn" onclick={() => edit(null)}>+ New level</button>
  {#if app.levels.some((l) => l.archived)}
    <button type="button" class="btn btn-ghost" onclick={() => (showArchived = !showArchived)}>{showArchived ? 'Hide' : 'Show'} archived</button>
  {/if}
</section>

<Sheet bind:open title={isNew ? 'New level' : draft.name || 'Level'}>
  <form class="stack" onsubmit={save} novalidate>
    <div class="field">
      <label for="lv-name">Name</label>
      <input id="lv-name" class="input" placeholder="e.g. Level 1" bind:value={draft.name} aria-invalid={tried && !!nameError} />
      {#if tried && nameError}<p class="error">{nameError}</p>{/if}
    </div>
    <div class="field">
      <label for="lv-rate">Rate, € per hour</label>
      <input id="lv-rate" class="input" inputmode="decimal" placeholder="12,00" bind:value={rateInput} aria-invalid={tried && rate === null} />
      {#if tried && rate === null}<p class="error">Enter a rate from 0 to 1,000 euros.</p>{/if}
    </div>
    <p class="hint">A new rate applies to future transforms; saved ones keep theirs.</p>
    <button type="submit" class="btn btn-primary btn-block">Save level</button>
    {#if !isNew}
      <button type="button" class="btn btn-block" onclick={() => setArchived(!draft.archived)}>{draft.archived ? 'Unarchive' : 'Archive'}</button>
    {/if}
  </form>
</Sheet>

<style>
  .stack {
    display: grid;
    gap: 12px;
  }
  h2,
  p {
    margin: 0;
  }
  .list-row {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
  }
  .greyed {
    opacity: 0.6;
  }
</style>
