// Wires the sync engine (src/sync) to the app: connect, scheduler, status.
import { createGitHub } from '../sync/github.ts';
import { pull } from '../sync/pull.ts';
import { pushOutbox } from '../sync/push.ts';
import { createSyncScheduler, type SyncScheduler, type SyncState } from '../sync/scheduler.ts';
import { ensureMeta, validateConnection } from '../sync/setup.ts';
import { requestPersistence } from '../store/persist.ts';
import { app, getStore, updateSettings } from './data.svelte.ts';
import { showToast } from './toast.svelte.ts';

export const sync = $state({
  state: { status: 'off', pendingCount: 0, lastError: null, authError: false, readOnly: false, lastPullAt: null } as SyncState,
  progress: null as { done: number; total: number } | null,
});

let scheduler: SyncScheduler | null = null;

function deps() {
  const s = app.settings;
  const gh = createGitHub({ repo: s.dataRepo.trim(), branch: s.branch || 'main', token: s.token.trim() });
  return { gh, store: getStore(), deviceName: s.deviceName || 'This device', now: () => new Date().toISOString() };
}

const connected = () => !app.settings.demoMode && Boolean(app.settings.dataRepo && app.settings.token && app.settings.deviceName);

/** Starts background sync when this device is connected (app start, after Connect). */
export function startSync() {
  stopSync();
  if (app.settings.demoMode) {
    sync.state = { ...sync.state, status: 'demo' };
    return;
  }
  if (!connected()) return;
  const d = deps();
  scheduler = createSyncScheduler({
    store: d.store,
    push: () => pushOutbox(d),
    pull: () => pull(d, (done, total) => (sync.progress = done < total ? { done, total } : null)),
    win: window,
    doc: document,
    isOnline: () => navigator.onLine,
    isVisible: () => document.visibilityState === 'visible',
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    now: d.now,
    demo: () => app.settings.demoMode,
    onToast: (m) => showToast(m),
  });
  scheduler.subscribe((s) => (sync.state = s));
  scheduler.start();
}

export function stopSync() {
  scheduler?.stop();
  scheduler = null;
  sync.state = { ...sync.state, status: 'off' };
}

/** "Sync now" / "Retry now". */
export function syncNow() {
  return scheduler?.syncNow();
}

/**
 * Connect flow (§8.1): validate repo + token, create meta.json if the repo is
 * empty (after confirm), then the initial sync with progress.
 */
export async function connect(
  input: { dataRepo: string; token: string; branch: string; deviceName: string; tokenExpiry: string | null },
  confirmInit: () => Promise<boolean>,
): Promise<string | null> {
  const gh = createGitHub({ repo: input.dataRepo.trim(), branch: input.branch || 'main', token: input.token.trim() });
  const check = await validateConnection(gh);
  if (!check.ok) return check.message;
  const meta = await ensureMeta(gh, new Date().toISOString(), confirmInit);
  if (meta === 'declined') return 'The repository was not initialised.';
  if (meta === 'tooNew') return 'This data was written by a newer app version. Update the app.';
  updateSettings({ ...input, dataRepo: input.dataRepo.trim(), token: input.token.trim(), demoMode: false });
  void requestPersistence();
  startSync();
  return null;
}

/** Days until the token expires (null without an expiry date). */
export function tokenDaysLeft(expiry: string | null, today: string): number | null {
  if (!expiry) return null;
  return Math.round((Date.parse(expiry) - Date.parse(today)) / 86_400_000);
}
