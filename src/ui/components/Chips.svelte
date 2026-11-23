<script lang="ts" generics="T extends string">
  // Single-choice filter chips (Orders: All · Unpaid · Partial · Paid · Voided).
  let {
    options,
    value = $bindable(),
    label,
  }: { options: { value: T; label: string }[]; value: T; label: string } = $props();
</script>

<div class="chips" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" class:on={value === o.value} aria-pressed={value === o.value} onclick={() => (value = o.value)}>
      {o.label}
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  button {
    flex: none;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font-size: 14px;
  }
  .on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
</style>
