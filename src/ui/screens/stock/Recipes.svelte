<script lang="ts">
  // Stock tab, second side (D-024): recipes list, view, use, restore archived.
  import Header from '../../components/Header.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { app, view, saveRecipe } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';
  import type { Recipe } from '../../../core/types.ts';
  import RecipeSheet from './RecipeSheet.svelte';
  import { activeRecipes, recipeNameError, transformSummary } from './logic.ts';

  const recipes = $derived(activeRecipes(app.recipes));
  const archived = $derived(app.recipes.filter((r) => r.archived).sort((a, b) => a.name.localeCompare(b.name)));
  let showArchived = $state(false);
  let sheetOpen = $state(false);
  let editing = $state<Recipe | null>(null);
  function openSheet(r: Recipe | null) {
    editing = r;
    sheetOpen = true;
  }
  async function restore(r: Recipe) {
    if (recipeNameError(r.name, app.recipes, r.id)) {
      showToast(`Archive the other recipe called ${r.name} first`);
      return;
    }
    await saveRecipe({ ...r, archived: false });
    showToast(`Restored ${r.name}`);
  }
</script>

<Header title="Stock">
  {#snippet actions()}
    <button type="button" class="btn btn-primary" onclick={() => openSheet(null)}>+ New recipe</button>
  {/snippet}
</Header>
<TabSwitch side="recipes" />

<div class="page">
  {#if !recipes.length}
    <EmptyState title="No recipes yet">
      <p>A recipe says what one batch uses and makes, plus its labour.</p>
    </EmptyState>
  {:else}
    <section class="card list">
      {#each recipes as r (r.id)}
        <div class="list-row">
          <span class="grow">
            <span class="title">{r.name}</span>
            <span class="muted">{transformSummary(r.inputs, r.outputs, view.classesById)}</span>
          </span>
          <button type="button" class="edit" aria-label="View {r.name}" onclick={() => openSheet(r)}>View</button>
          <a class="use" href="#/stock/transform?recipe={r.id}" aria-label="Use {r.name}">Use</a>
        </div>
      {/each}
    </section>
  {/if}

  {#if archived.length}
    <button type="button" class="btn btn-ghost" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
      {showArchived ? 'Hide' : 'Show'} archived recipes ({archived.length})
    </button>
    {#if showArchived}
      <section class="card list">
        {#each archived as r (r.id)}
          <div class="list-row">
            <span class="grow">
              <span class="title">{r.name}</span>
              <span class="muted">{transformSummary(r.inputs, r.outputs, view.classesById)}</span>
            </span>
            <button type="button" class="edit" aria-label="Restore {r.name}" onclick={() => restore(r)}>Restore</button>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</div>

<RecipeSheet bind:open={sheetOpen} recipe={editing} />

<style>
  p {
    margin: 0;
  }
  .edit,
  .use {
    min-height: var(--tap);
    padding: 0 14px;
    border-radius: 10px;
    font-weight: 600;
  }
  .edit {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
  }
  .use {
    background: var(--accent-soft);
    color: var(--accent-strong);
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
