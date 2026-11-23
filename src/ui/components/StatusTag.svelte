<script lang="ts">
  import Tag from './Tag.svelte';
  let { status }: { status: 'unpaid' | 'partial' | 'paid' | 'voided' } = $props();
  const labels = { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', voided: 'Voided' };
</script>

<Tag tone={status}>{labels[status]}</Tag>
