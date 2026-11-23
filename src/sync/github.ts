// Minimal GitHub REST client over fetch (spec §6.1). The token goes only to api.github.com and is never logged.
import { decodeUtf8Base64, encodeUtf8Base64 } from '../core/base64.ts';

const API = 'https://api.github.com';

export type GitHubErrorKind = 'auth' | 'notFound' | 'conflict' | 'network' | 'server' | 'rateLimit';

/** A failed GitHub request; status 0 for network errors. */
export class GitHubError extends Error {
  constructor(readonly kind: GitHubErrorKind, readonly status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface RepoFile {
  path: string;
  sha: string;
}

export interface FolderEntry extends RepoFile {
  type: 'file' | 'dir';
}

export interface GitHubOptions {
  repo: string; // owner/name
  branch: string;
  token: string;
  fetch?: typeof fetch;
}

export type GitHub = ReturnType<typeof createGitHub>;

function kindOf(res: Response): GitHubErrorKind {
  const s = res.status;
  if (s === 429 || (s === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')))) return 'rateLimit';
  if (s === 401 || s === 403) return 'auth';
  if (s === 404) return 'notFound';
  if (s === 409 || s === 422) return 'conflict';
  return 'server';
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Client for one data repo and branch. */
export function createGitHub(opts: GitHubOptions) {
  const doFetch = opts.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const [owner, name] = opts.repo.split('/');
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name ?? '')}`;
  const ref = `ref=${encodeURIComponent(opts.branch)}`;

  async function call(method: 'GET' | 'PUT', path: string, body?: object): Promise<any> {
    let res: Response;
    try {
      res = await doFetch(base + path, {
        method,
        cache: 'no-store', // GitHub sends max-age=60; a cached head would hide new commits
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body && JSON.stringify(body),
      });
    } catch {
      throw new GitHubError('network', 0, 'No internet');
    }
    if (!res.ok) throw new GitHubError(kindOf(res), res.status, `GitHub ${method} ${path.split('?')[0]} failed (${res.status})`);
    return res.json();
  }

  return {
    /** Repo access check: push permission needed (§8.1). */
    getRepo: async () => ({ pushAllowed: (await call('GET', ''))?.permissions?.push === true }),
    /** Latest commit of the branch. */
    getHead: async () => {
      const c = await call('GET', `/commits/${encodeURIComponent(opts.branch)}`);
      return { sha: c.sha as string, treeSha: c.commit.tree.sha as string };
    },
    /** Every file path and blob SHA of a tree. */
    getTree: async (treeSha: string) => {
      const t = await call('GET', `/git/trees/${treeSha}?recursive=1`);
      const entries: RepoFile[] = t.tree.filter((e: any) => e.type === 'blob').map((e: any) => ({ path: e.path, sha: e.sha }));
      return { entries, truncated: t.truncated === true };
    },
    /** A blob's content as UTF-8 text. */
    getBlob: async (sha: string) => decodeUtf8Base64((await call('GET', `/git/blobs/${sha}`)).content),
    /** One file's blob SHA and text, or null when it does not exist. */
    getFile: async (path: string): Promise<{ sha: string; text: string } | null> => {
      try {
        const f = await call('GET', `/contents/${encodePath(path)}?${ref}`);
        return { sha: f.sha, text: decodeUtf8Base64(f.content) };
      } catch (e) {
        if (e instanceof GitHubError && e.kind === 'notFound') return null;
        throw e;
      }
    },
    /** One folder's entries ('' = root); the fallback for a truncated tree (§6.6). */
    getFolder: async (path: string): Promise<FolderEntry[]> => {
      const list = await call('GET', `/contents${path ? '/' + encodePath(path) : ''}?${ref}`);
      return list.map((e: any) => ({ path: e.path, sha: e.sha, type: e.type === 'dir' ? 'dir' : 'file' }));
    },
    /** Creates or updates a file in one commit; sha is required for updates. */
    putFile: async (path: string, text: string, message: string, sha?: string) => {
      const body = { message, content: encodeUtf8Base64(text), branch: opts.branch, ...(sha ? { sha } : {}) };
      const r = await call('PUT', `/contents/${encodePath(path)}`, body);
      return { blobSha: r.content.sha as string, commitSha: r.commit.sha as string, parentSha: (r.commit.parents?.[0]?.sha ?? null) as string | null };
    },
  };
}
