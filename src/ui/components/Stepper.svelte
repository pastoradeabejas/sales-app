<script lang="ts">
  import Icon from './Icon.svelte';

  // [−] qty [+]; long-press (or tap) the number to type it (§8.4).
  let {
    value = $bindable(0),
    max = 9999,
    label,
  }: { value: number; max?: number; label: string } = $props();

  let editing = $state(false);
  let text = $state('');

  function commit() {
    const n = Number(text.trim());
    if (Number.isInteger(n) && n >= 0 && n <= max) value = n;
    editing = false;
  }
</script>

<div class="stepper">
  <button type="button" class="dec" aria-label="Fewer {label}" disabled={value <= 0} onclick={() => (value = Math.max(0, value - 1))}>
    <Icon name="minus" />
  </button>
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="qty"
      inputmode="numeric"
      aria-label="Quantity of {label}"
      bind:value={text}
      autofocus
      onblur={commit}
      onkeydown={(e) => e.key === 'Enter' && commit()}
    />
  {:else}
    <button
      type="button"
      class="qty"
      aria-label="{value} × {label}, tap to type"
      onclick={() => {
        text = value ? String(value) : '';
        editing = true;
      }}>{value}</button
    >
  {/if}
  <button type="button" class="inc" aria-label="More {label}" disabled={value >= max} onclick={() => (value = value + 1)}>
    <Icon name="plus" />
  </button>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  button {
    width: var(--tap);
    height: var(--tap);
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
  }
  .dec {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--ink);
  }
  .inc {
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
  }
  .qty {
    width: 40px;
    height: var(--tap);
    border: 0;
    background: none;
    text-align: center;
    font: inherit;
    font-size: 17px;
    font-weight: 700;
    color: var(--ink);
  }
  input.qty {
    border: 1.5px solid var(--accent);
    border-radius: 10px;
    width: 56px;
  }
</style>
