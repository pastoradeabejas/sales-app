<script lang="ts">
  import { makeBackup, parseBackup, restoreCounts, restorePlan } from '../../../core/backup.ts';
  import { exportFiles } from '../../../core/csv.ts';
  import ConfirmSheet from '../../components/ConfirmSheet.svelte';
  import { app, importBackup, localDate, updateSettings } from '../../data.svelte.ts';
  import { showToast } from '../../toast.svelte.ts';

  // Export CSV, export/import JSON backup (§8.1, S11).

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const files = exportFiles(
      { orders: app.orders, payments: app.payments, clients: app.clients, stock: app.stock, classes: app.products },
      localDate(),
    );
    for (const f of files) download(f.name, f.content, 'text/csv;charset=utf-8');
  }

  function exportJson() {
    const now = new Date().toISOString();
    const records = {
      products: app.products,
      clients: app.clients,
      orders: app.orders,
      payments: app.payments,
      stock: app.stock,
      recipes: app.recipes,
    };
    download(`sales-backup-${localDate()}.json`, makeBackup($state.snapshot(records), now), 'application/json');
    updateSettings({ lastBackupAt: now });
  }

  let plan = $state<ReturnType<typeof restorePlan>>([]);
  let summary = $state('');
  let confirm = $state(false);
  let error = $state('');

  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      error = parsed.error;
      return;
    }
    error = '';
    const all = [...app.products, ...app.clients, ...app.orders, ...app.payments, ...app.stock, ...app.recipes];
    plan = restorePlan(parsed.backup, new Map(all.map((r) => [r.id, r.updatedAt])));
    const counts = restoreCounts(plan);
    const names: [keyof typeof counts, string][] = [
      ['product', 'products'],
      ['client', 'clients'],
      ['order', 'orders'],
      ['payment', 'payments'],
      ['stock', 'stock events'],
      ['recipe', 'recipes'],
    ];
    summary = names
      .filter(([k]) => counts[k] > 0)
      .map(([k, n]) => `${counts[k]} ${n}`)
      .join(', ');
    if (!plan.length) showToast('Nothing to restore: this device already has everything in the backup');
    else confirm = true;
  }

  async function restore() {
    await importBackup(plan);
    showToast(`Restored ${summary}`);
  }

  const lastBackup = $derived(app.settings.lastBackupAt ? new Date(app.settings.lastBackupAt).toLocaleDateString() : 'never');
</script>

<section class="card stack">
  <h2>Export and backup</h2>
  <button type="button" class="btn" onclick={exportCsv}>Export CSV</button>
  <p class="hint">Orders, lines, payments, clients and stock, one file each.</p>
  <button type="button" class="btn" onclick={exportJson}>Export JSON backup</button>
  <p class="hint">Last backup on this device: {lastBackup}.</p>
  <label class="btn">
    Import JSON backup
    <input type="file" accept="application/json,.json" class="visually-hidden" onchange={pick} />
  </label>
  <p class="hint">For restoring a device. Restored records are synced like any change.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<ConfirmSheet bind:open={confirm} title="Restore backup?" confirmLabel="Restore" onconfirm={restore}>
  <p>Restore {summary}. Records that are newer on this device are kept.</p>
</ConfirmSheet>

<style>
  .stack {
    display: grid;
    gap: 10px;
  }
  h2 {
    margin: 0;
  }
  p {
    margin: 0;
  }
</style>
