// Outbox flusher (spec §6.2): one PUT per entry, in seq order, with merge-and-retry on conflicts.
import { resolvePending } from '../core/merge.ts';
import { parseRecord, serializeRecord } from '../core/serialize.ts';
import type { OutboxEntry, Store } from '../store/store.ts';
import { commitMessage, conflictToast, type Lookup } from './commitMessage.ts';
import { GitHubError, type GitHub, type GitHubErrorKind } from './github.ts';
import { isReadOnly } from './setup.ts';

/** What push and pull need. */
export interface SyncDeps {
  gh: GitHub;
  store: Store;
  deviceName: string;
  now: () => string;
}

export type PushStop = 'auth' | 'retry' | 'readOnly';

export interface PushSummary {
  pushed: number;
  conflicts: number;
  toasts: string[];
  stopped: PushStop | null;
  /** The error that stopped the run, if any (the scheduler picks the badge from it). */
  error?: GitHubError;
}

const MAX_ATTEMPTS = 3;

const ERROR_TEXT: Partial<Record<GitHubErrorKind, string>> = {
  auth: 'Token invalid or expired',
  notFound: 'Repository not found or token has no access',
  network: 'No internet',
  rateLimit: 'GitHub rate limit reached',
};
const errorText = (e: unknown) => (e instanceof GitHubError && ERROR_TEXT[e.kind]) || (e as Error).message;

/** auth/notFound stop the flusher; network, 5xx and rate limits retry later; other errors skip the entry. */
function stopFor(e: unknown): PushStop | null {
  if (!(e instanceof GitHubError)) return null;
  return e.kind === 'auth' || e.kind === 'notFound' ? 'auth' : e.kind === 'conflict' ? null : 'retry';
}

/** Pushes the outbox; entries saved meanwhile are pushed in the same run. */
export async function pushOutbox({ gh, store, deviceName }: SyncDeps): Promise<PushSummary> {
  const sum: PushSummary = { pushed: 0, conflicts: 0, toasts: [], stopped: null };
  if (await isReadOnly(store)) return { ...sum, stopped: 'readOnly' };
  const lookup: Lookup = (s, id) => store.get(s, id);
  const tried = new Set<number>();

  async function fail(seq: number, e: unknown): Promise<PushStop | null> {
    await store.markAttempt(seq, errorText(e));
    const stop = stopFor(e);
    if (stop) sum.error = e as GitHubError;
    return stop;
  }

  async function pushEntry(entry: OutboxEntry): Promise<PushStop | null> {
    const { path, recordType: type, recordId: id } = entry;
    const seq = entry.seq!;
    let content = entry.content;
    let sha = (await store.files()).get(path)?.blobSha;
    for (let attempt = 1; ; attempt++) {
      store.markInFlight(seq);
      try {
        const head = await store.getMeta<string>('lastSyncedCommitSha');
        const message = await commitMessage(deviceName, { recordType: type, content }, lookup);
        const res = await gh.putFile(path, serializeRecord(type, content as object), message, sha);
        await store.completePush(seq, path, res.blobSha, type, id);
        if (head && res.parentSha === head) await store.setMeta('lastSyncedCommitSha', res.commitSha);
        sum.pushed++;
        return null;
      } catch (e) {
        if (!(e instanceof GitHubError && e.kind === 'conflict')) return fail(seq, e);
        sum.conflicts++;
        await store.markAttempt(seq, `Conflict with the remote version (${e.status})`);
      }
      if (attempt === MAX_ATTEMPTS) return null;
      try {
        const remote = await gh.getFile(path);
        sha = remote?.sha;
        if (!remote) continue;
        const r = resolvePending(content, parseRecord(type, remote.text), type);
        if (r.toast) sum.toasts.push(await conflictToast(type, r.merged, lookup));
        if (r.dropOutbox) {
          await store.applyRemote(type, r.merged, { path, blobSha: remote.sha, recordType: type, recordId: id });
          await store.dropOutboxEntry(seq);
          return null;
        }
        // Keep the old files row until the merged version is pushed, so a give-up re-merges next time.
        const old = (await store.files()).get(path);
        if (r.toast) await store.applyRemote(type, r.merged, old ?? { path, blobSha: remote.sha, recordType: type, recordId: id });
        content = r.merged;
      } catch (e) {
        return fail(seq, e);
      }
    }
  }

  for (;;) {
    const entry = (await store.outbox()).find((e) => !tried.has(e.seq!));
    if (!entry) return sum;
    tried.add(entry.seq!);
    const stop = await pushEntry(entry);
    if (stop) return { ...sum, stopped: stop };
  }
}
