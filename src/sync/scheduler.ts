// Sync scheduler (spec §6.2, §6.3, §6.5): when to push and pull, backoff, and the badge state.
import type { Store } from '../store/store.ts';
import { GitHubError } from './github.ts';
import type { PullSummary } from './pull.ts';
import type { PushSummary } from './push.ts';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error' | 'demo' | 'off';

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null;
  /** Show "Token invalid or expired" linking to Settings. */
  authError: boolean;
  /** Data repo schema is newer: show "Update the app". */
  readOnly: boolean;
  lastPullAt: string | null;
}

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface SchedulerDeps {
  store: Pick<Store, 'subscribe' | 'outboxCount'>;
  push: () => Promise<PushSummary>;
  pull: () => Promise<PullSummary>;
  /** window: `online` events. */
  win: Listen;
  /** document: `visibilitychange` events. */
  doc: Listen;
  isOnline: () => boolean;
  isVisible: () => boolean;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => string;
  demo?: () => boolean;
  onToast?: (message: string) => void;
}

export type SyncScheduler = ReturnType<typeof createSyncScheduler>;

const INTERVAL = 60_000;
const BACKOFF = [5_000, 15_000, 60_000, 300_000];
const AUTH_TEXT = 'Token invalid or expired';

/** Creates the scheduler; nothing runs until start(). */
export function createSyncScheduler(d: SchedulerDeps) {
  let state: SyncState = { status: 'off', pendingCount: 0, lastError: null, authError: false, readOnly: false, lastPullAt: null };
  const listeners = new Set<(s: SyncState) => void>();
  let started = false;
  let timer: unknown = null;
  let failures = 0;
  let running: Promise<void> | null = null;
  let again = false;
  let pushing = false;
  let unsubscribe = () => {};

  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };
  const schedule = (ms: number) => {
    if (timer !== null) d.clearTimeout(timer);
    timer = d.setTimeout(() => {
      timer = null;
      if (d.isVisible()) void syncNow();
    }, ms);
  };
  const offlineStatus = (n: number): SyncStatus => (n ? 'pending' : 'offline');

  function failed(e: unknown, pendingCount: number) {
    const kind = e instanceof GitHubError ? e.kind : 'server';
    if (kind === 'auth' || kind === 'notFound') return set({ status: 'error', authError: true, lastError: AUTH_TEXT, pendingCount });
    schedule(BACKOFF[Math.min(failures++, BACKOFF.length - 1)]);
    set({ status: kind === 'network' ? offlineStatus(pendingCount) : 'error', lastError: (e as Error).message, pendingCount });
  }

  async function runOnce() {
    if (!d.isOnline()) return set({ status: offlineStatus(await d.store.outboxCount()) });
    set({ status: 'syncing' });
    try {
      pushing = true;
      const p = await d.push();
      pushing = false;
      p.toasts.forEach((m) => d.onToast?.(m));
      if (p.stopped === 'auth' || p.stopped === 'retry') return failed(p.error, await d.store.outboxCount());
      const r = await d.pull();
      r.toasts.forEach((m) => d.onToast?.(m));
      failures = 0;
      const n = await d.store.outboxCount();
      const readOnly = r.readOnly || p.stopped === 'readOnly';
      set({
        status: readOnly ? 'error' : n ? 'pending' : 'synced',
        lastError: readOnly ? 'Update the app' : null,
        readOnly, authError: false, pendingCount: n, lastPullAt: d.now(),
      });
      schedule(INTERVAL);
    } catch (e) {
      failed(e, await d.store.outboxCount());
    } finally {
      pushing = false;
    }
  }

  /** Push then pull now; a call during a run queues one more run. */
  function syncNow(): Promise<void> {
    if (!started) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await runOnce();
      } while (again && !state.authError);
    })().finally(() => (running = null));
    return running;
  }

  // Automatic triggers stay quiet after an auth error, until syncNow or a restart.
  const trigger = () => {
    if (!state.authError) void syncNow();
  };
  const onOnline = () => {
    failures = 0;
    trigger();
  };
  const onVisible = () => {
    if (d.isVisible()) trigger();
  };

  return {
    /** Current badge state. */
    get state() {
      return state;
    },
    /** Calls fn on every state change; returns the unsubscribe function. */
    subscribe(fn: (s: SyncState) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    /** Starts listening and syncs once (app start); demo mode never syncs. */
    start() {
      if (started) return;
      if (d.demo?.()) return set({ status: 'demo' });
      started = true;
      d.win.addEventListener('online', onOnline);
      d.doc.addEventListener('visibilitychange', onVisible);
      unsubscribe = d.store.subscribe(async (changed) => {
        if (!changed.includes('outbox')) return;
        const n = await d.store.outboxCount();
        set(d.isOnline() || state.status === 'error' ? { pendingCount: n } : { pendingCount: n, status: offlineStatus(n) });
        // The flusher's own outbox writes don't retrigger it; during backoff the timer decides.
        if (!pushing && failures === 0 && d.isOnline()) trigger();
      });
      void syncNow();
    },
    /** Stops listeners and timers (Settings changed, Disconnect). */
    stop() {
      started = false;
      d.win.removeEventListener('online', onOnline);
      d.doc.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
      if (timer !== null) d.clearTimeout(timer);
      timer = null;
      failures = 0;
      set({ status: 'off', authError: false });
    },
    /** Manual "Sync now" / "Retry now"; also clears an auth error. */
    syncNow: () => {
      failures = 0;
      set({ authError: false });
      return syncNow();
    },
  };
}
