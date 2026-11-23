// Connect checks (§8.1) and the data repo meta file (§3.7).
import { META_JSON, metaContent } from '../core/serialize.ts';
import { SCHEMA_VERSION } from '../core/types.ts';
import type { Store } from '../store/store.ts';
import { GitHubError, type GitHub } from './github.ts';

const NO_ACCESS = 'Repository not found or token has no access';

/** Checks repo access and push permission; the message is shown under Connect. */
export async function validateConnection(gh: GitHub): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    return (await gh.getRepo()).pushAllowed ? { ok: true } : { ok: false, message: 'Token is read-only' };
  } catch (e) {
    if (!(e instanceof GitHubError)) throw e;
    if (e.kind === 'network') return { ok: false, message: 'No internet' };
    if (e.kind === 'notFound' || e.kind === 'auth') return { ok: false, message: NO_ACCESS };
    return { ok: false, message: `GitHub error (${e.status}), try again later` };
  }
}

/** Schema version of a meta.json text; tooNew = this app must go read-only. */
export function checkMeta(text: string): { schemaVersion: number; tooNew: boolean } {
  let version = SCHEMA_VERSION;
  try {
    const v = JSON.parse(text)?.schemaVersion;
    if (typeof v === 'number') version = v;
  } catch {
    // an unreadable meta.json is treated as the current schema
  }
  return { schemaVersion: version, tooNew: version > SCHEMA_VERSION };
}

/** Creates meta.json when missing, if confirm ("This repository is empty. Initialise it?") agrees. */
export async function ensureMeta(
  gh: GitHub,
  now: string,
  confirm: () => Promise<boolean> = async () => true,
): Promise<'exists' | 'created' | 'tooNew' | 'declined'> {
  const file = await gh.getFile(META_JSON);
  if (file) return checkMeta(file.text).tooNew ? 'tooNew' : 'exists';
  if (!(await confirm())) return 'declined';
  await gh.putFile(META_JSON, metaContent(now), 'Initialise sales data');
  return 'created';
}

/** True when the data repo's schema is newer than this app (stored by pull from meta.json). */
export async function isReadOnly(store: Pick<Store, 'getMeta'>): Promise<boolean> {
  return ((await store.getMeta<number>('schemaVersion')) ?? SCHEMA_VERSION) > SCHEMA_VERSION;
}
