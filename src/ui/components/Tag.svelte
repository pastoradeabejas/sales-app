<script lang="ts" module>
  export type TagTone = 'unpaid' | 'partial' | 'paid' | 'voided' | 'low' | 'credit' | 'neutral' | 'negative';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  // Text tag: status is never shown by colour alone (spec §10).
  let { tone = 'neutral', children }: { tone?: TagTone; children: Snippet } = $props();
</script>

<span class="tag {tone}">{@render children()}</span>

<style>
  .tag {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .unpaid,
  .low,
  .negative {
    background: var(--owed-tag);
    color: var(--owed-on-bg);
  }
  .partial {
    background: var(--owed-bg);
    color: var(--owed-on-bg);
    border: 1px dashed var(--owed-mid);
  }
  .paid,
  .credit {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .voided,
  .neutral {
    background: var(--chip);
    color: var(--muted);
    border-color: var(--border);
  }
</style>
