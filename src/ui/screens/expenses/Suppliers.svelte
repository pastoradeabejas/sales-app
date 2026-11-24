<script lang="ts">
  import EmptyState from '../../components/EmptyState.svelte';
  import Header from '../../components/Header.svelte';
  import TabSwitch from '../../components/TabSwitch.svelte';

  let {}: { params?: Record<string, string>; query?: Record<string, string> } = $props();
</script>

<Header title="Expenses" />
<TabSwitch side="suppliers" />
<div class="page">
  <EmptyState title="Coming soon" />
</div>
