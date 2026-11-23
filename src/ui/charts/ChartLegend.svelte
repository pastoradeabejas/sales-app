<script lang="ts">
  // Always shown (spec §8.13): paid and unpaid differ in colour and lightness.
  let { paidLabel = 'Paid', unpaidLabel = 'Unpaid' }: { paidLabel?: string; unpaidLabel?: string } = $props();
</script>

<div class="legend">
  <span><i class="paid"></i>{paidLabel}</span>
  <span><i class="unpaid"></i>{unpaidLabel}</span>
</div>

<style>
  .legend {
    display: flex;
    gap: 14px;
    font-size: 12px;
    color: var(--muted);
  }
  span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  i {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .paid {
    background: var(--accent);
  }
  .unpaid {
    background: var(--owed-bar);
  }
</style>
