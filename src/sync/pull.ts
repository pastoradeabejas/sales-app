// Puller (spec §6.3): head check, tree diff, blobs with concurrency 6, merge into the local store.
import { mergeRecord, resolvePending } from '../core/merge.ts';
import { parsePath } from '../core/paths.ts';
import { META_JSON, parseRecord } from '../core/serialize.ts';
import { STORE_OF, type FileEntry, type OutboxEntry } from '../store/store.ts';
import { conflictToast, type Lookup } from './commitMessage.ts';
import type { GitHub, RepoFile } from './github.ts';
import type { SyncDeps } from './push.ts';
import { checkMeta, isReadOnly } from './setup.ts';

export interface PullSummary {
  changed: number;
  toasts: string[];
  readOnly: boolean;
}

const CONCURRENCY = 6;

/** Runs fn over items with at most `limit` in flight. */
async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Every file of the repo by walking folders (the truncated-tree fallback, §6.6). */
async function listFolders(gh: GitHub, path: string): Promise<RepoFile[]> {
  const out: RepoFile[] = [];
  for (const e of await gh.getFolder(path)) {
    if (e.type === 'dir') out.push(...(await listFolders(gh, e.path)));
    else out.push({ path: e.path, sha: e.sha });
  }
  return out;
}

/** Pulls remote changes into the store; onProgress(done, total) drives "Downloading 312 / 540". */
export async function pull({ gh, store, now }: SyncDeps, onProgress?: (done: number, total: number) => void): Promise<PullSummary> {
  const head = await gh.getHead();
  if (head.sha === (await store.getMeta('lastSyncedCommitSha'))) return { changed: 0, toasts: [], readOnly: await isReadOnly(store) };

  const tree = await gh.getTree(head.treeSha);
  const remote = tree.truncated ? await listFolders(gh, '') : tree.entries;
  const files = await store.files();
  const metaSha = await store.getMeta('metaSha');
  const remotePaths = new Set(remote.map((e) => e.path));
  for (const path of files.keys()) {
    if (!remotePaths.has(path)) console.warn(`Sync: ${path} is missing in the data repo; keeping the local copy`);
  }
  const todo = remote.filter((e) => (e.path === META_JSON ? e.sha !== metaSha : parsePath(e.path) && files.get(e.path)?.blobSha !== e.sha));
  const pending = new Map<string, OutboxEntry>((await store.outbox()).map((e) => [e.path, e]));
  const lookup: Lookup = (s, id) => store.get(s, id);
  const toasts: string[] = [];

  async function apply({ path, sha }: RepoFile, text: string) {
    if (path === META_JSON) {
      await store.setMeta('schemaVersion', checkMeta(text).schemaVersion);
      await store.setMeta('metaSha', sha);
      return;
    }
    const { type, id } = parsePath(path)!;
    const file: FileEntry = { path, blobSha: sha, recordType: type, recordId: id };
    const remoteRecord = parseRecord(type, text);
    const entry = pending.get(path);
    if (!entry) {
      const local = await store.get(STORE_OF[type], id);
      await store.applyRemote(type, mergeRecord(type, local, remoteRecord).merged, file);
      return;
    }
    const r = resolvePending(entry.content, remoteRecord, type);
    if (r.dropOutbox) await store.dropOutboxEntry(entry.seq!);
    // A kept entry keeps the old blob SHA: its push then conflicts and merges with the remote (§6.2).
    await store.applyRemote(type, r.merged, r.dropOutbox ? file : (files.get(path) ?? file));
    if (r.toast) toasts.push(await conflictToast(type, r.merged, lookup));
  }

  let done = 0;
  onProgress?.(0, todo.length);
  await eachLimit(todo, CONCURRENCY, async (e) => {
    const text = await gh.getBlob(e.sha);
    try {
      await apply(e, text);
    } catch (err) {
      console.warn(`Sync: skipped ${e.path}: ${(err as Error).message}`);
    }
    onProgress?.(++done, todo.length);
  });
  await store.setMeta('lastSyncedCommitSha', head.sha);
  await store.setMeta('lastSyncAt', now());
  return { changed: todo.length, toasts, readOnly: await isReadOnly(store) };
}
