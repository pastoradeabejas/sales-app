<script lang="ts">
  import Placeholder from '../Placeholder.svelte';
  let { params = {}, query = {} }: { params?: Record<string, string>; query?: Record<string, string> } = $props();
  void params;
  void query;
</script>

<Placeholder title="Clients" point="S5" back={undefined} gear={false} />
