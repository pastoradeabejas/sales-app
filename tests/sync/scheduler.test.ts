import { describe, expect, it, vi } from 'vitest';
import { memoryBackend } from '../../src/store/memory.ts';
import { createStore } from '../../src/store/store.ts';
import { GitHubError } from '../../src/sync/github.ts';
import type { PullSummary } from '../../src/sync/pull.ts';
import type { PushSummary } from '../../src/sync/push.ts';
import { createSyncScheduler } from '../../src/sync/scheduler.ts';

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

const OK_PUSH: PushSummary = { pushed: 0, conflicts: 0, toasts: [], stopped: null };
const OK_PULL: PullSummary = { changed: 0, toasts: [], readOnly: false };
const offlinePush = (): PushSummary => ({ ...OK_PUSH, stopped: 'retry', error: new GitHubError('network', 0, 'No internet') });

function setup(opts: { online?: boolean; demo?: boolean } = {}) {
  const store = createStore(memoryBackend(), { deviceName: () => 'Phone A' });
  const timers = new Map<number, { ms: number; fn: () => void }>();
  let nextId = 0;
  const env = { online: opts.online ?? true, visible: true };
  const win = new EventTarget();
  const doc = new EventTarget();
  const push = vi.fn(async (): Promise<PushSummary> => OK_PUSH);
  const pull = vi.fn(async (): Promise<PullSummary> => OK_PULL);
  const toasts: string[] = [];
  const sched = createSyncScheduler({
    store, push, pull, win, doc,
    isOnline: () => env.online,
    isVisible: () => env.visible,
    setTimeout: (fn, ms) => (timers.set(++nextId, { ms, fn }), nextId),
    clearTimeout: (id) => void timers.delete(id as number),
    now: () => '2026-11-24T12:00:00.000Z',
    demo: () => opts.demo ?? false,
    onToast: (m) => toasts.push(m),
  });
  const delays = () => [...timers.values()].map((t) => t.ms);
  const fire = async () => {
    const [[id, t]] = [...timers];
    timers.delete(id);
    t.fn();
    await flush();
  };
  const save = (name: string) => store.save('client', { id: 'c1', name, phone: '', notes: '', tags: [], archived: false }, 'clients/c1.json');
  return { store, sched, push, pull, env, win, doc, delays, fire, toasts, save };
}

describe('sync scheduler (§6.2, §6.5)', () => {
  it('starts with push then pull, ends synced, and polls every 60 s', async () => {
    const t = setup();
    const order: string[] = [];
    t.push.mockImplementation(async () => (order.push('push'), OK_PUSH));
    t.pull.mockImplementation(async () => (order.push('pull'), OK_PULL));
    t.sched.start();
    await flush();
    expect(order).toEqual(['push', 'pull']);
    expect(t.sched.state).toMatchObject({ status: 'synced', pendingCount: 0, lastPullAt: '2026-11-24T12:00:00.000Z', authError: false });
    expect(t.delays()).toEqual([60_000]);
    await t.fire();
    expect(t.pull).toHaveBeenCalledTimes(2);
  });

  it('backs off 5 s, 15 s, 60 s, 5 min on network errors, then resets', async () => {
    const t = setup();
    t.push.mockImplementation(async () => offlinePush());
    await t.save('Marta');
    t.sched.start();
    await flush();
    expect(t.sched.state).toMatchObject({ status: 'pending', pendingCount: 1 });
    const seen = [t.delays()];
    for (let i = 0; i < 4; i++) {
      await t.fire();
      seen.push(t.delays());
    }
    expect(seen).toEqual([[5_000], [15_000], [60_000], [300_000], [300_000]]);
    expect(t.pull).not.toHaveBeenCalled();
    t.push.mockImplementation(async () => OK_PUSH);
    await t.fire();
    expect(t.delays()).toEqual([60_000]);
  });

  it('a server error shows Error and backs off', async () => {
    const t = setup();
    t.pull.mockRejectedValueOnce(new GitHubError('server', 502, 'GitHub GET /commits failed (502)'));
    t.sched.start();
    await flush();
    expect(t.sched.state).toMatchObject({ status: 'error', lastError: 'GitHub GET /commits failed (502)', authError: false });
    expect(t.delays()).toEqual([5_000]);
  });

  it('an auth error stops syncing until Sync now', async () => {
    const t = setup();
    t.push.mockResolvedValueOnce({ ...OK_PUSH, stopped: 'auth', error: new GitHubError('auth', 401, 'x') });
    t.sched.start();
    await flush();
    expect(t.sched.state).toMatchObject({ status: 'error', authError: true, lastError: 'Token invalid or expired' });
    expect(t.delays()).toEqual([]);
    await t.save('Marta');
    t.win.dispatchEvent(new Event('online'));
    await flush();
    expect(t.push).toHaveBeenCalledTimes(1);
    await t.sched.syncNow();
    expect(t.push).toHaveBeenCalledTimes(2);
    expect(t.sched.state).toMatchObject({ status: 'pending', authError: false, lastError: null }); // the mock push leaves the entry
  });

  it('syncs on outbox change, online and becoming visible; not while hidden', async () => {
    const t = setup();
    t.sched.start();
    await flush();
    await t.save('Marta');
    await flush();
    expect(t.push).toHaveBeenCalledTimes(2);
    t.win.dispatchEvent(new Event('online'));
    await flush();
    expect(t.push).toHaveBeenCalledTimes(3);
    t.env.visible = false;
    await t.fire();
    expect(t.push).toHaveBeenCalledTimes(3);
    t.env.visible = true;
    t.doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(t.push).toHaveBeenCalledTimes(4);
  });

  it('shows Offline or N pending without network calls while offline', async () => {
    const t = setup({ online: false });
    t.sched.start();
    await flush();
    expect(t.sched.state.status).toBe('offline');
    await t.save('Marta');
    await flush();
    expect(t.sched.state).toMatchObject({ status: 'pending', pendingCount: 1 });
    expect(t.push).not.toHaveBeenCalled();
    t.env.online = true;
    t.win.dispatchEvent(new Event('online'));
    await flush();
    expect(t.push).toHaveBeenCalledTimes(1);
  });

  it('forwards toasts, reports read-only, notifies subscribers, and stays off in demo mode', async () => {
    const t = setup();
    t.pull.mockResolvedValueOnce({ changed: 1, toasts: ['Marta was changed on Phone B; showing the latest version'], readOnly: true });
    const states: string[] = [];
    t.sched.subscribe((s) => states.push(s.status));
    t.sched.start();
    await flush();
    expect(t.toasts).toEqual(['Marta was changed on Phone B; showing the latest version']);
    expect(t.sched.state).toMatchObject({ status: 'error', readOnly: true, lastError: 'Update the app' });
    expect(states).toContain('syncing');
    t.sched.stop();
    expect(t.sched.state.status).toBe('off');

    const demo = setup({ demo: true });
    demo.sched.start();
    await flush();
    expect(demo.sched.state.status).toBe('demo');
    expect(demo.push).not.toHaveBeenCalled();
  });
});
