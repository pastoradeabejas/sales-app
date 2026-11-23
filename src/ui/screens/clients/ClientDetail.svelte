<script lang="ts">
  import Placeholder from '../Placeholder.svelte';
  let { params = {}, query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();
  void params;
  void query;
</script>

<Placeholder title="Client" point="S5" back="#/clients" gear={false} />
