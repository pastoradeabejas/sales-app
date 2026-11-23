<script lang="ts" generics="T extends string">
  // Segmented control (radio group): Week/Month/Year, Unpaid/Partial/Paid...
  let {
    options,
    value = $bindable(),
    label,
    onchange,
  }: { options: { value: T; label: string }[]; value: T; label: string; onchange?: (v: T) => void } = $props();
  const name = `seg-${Math.random().toString(36).slice(2)}`;
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <label>
      <input
        type="radio"
        {name}
        value={o.value}
        checked={value === o.value}
        onchange={() => {
          value = o.value;
          onchange?.(o.value);
        }}
      />
      <span>{o.label}</span>
    </label>
  {/each}
</div>

<style>
  .seg {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: var(--chip);
  }
  label {
    position: relative;
  }
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
  }
  span {
    display: grid;
    place-items: center;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 8px;
    font-size: 14px;
    color: var(--muted);
  }
  input:checked + span {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);
  }
  input:focus-visible + span {
    outline: 2px solid var(--accent);
  }
</style>
