// In-memory GitHub REST API (the §6.1 endpoints plus contents GET) behind a fake fetch.
import { decodeUtf8Base64, encodeUtf8Base64 } from '../../src/core/base64.ts';

export interface Req {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
}

type Fail = { method: string; match: RegExp; status: number | 'network'; headers?: Record<string, string> };

const hash = (s: string) => {
  let h = 5381;
  for (const c of s) h = (h * 33 + c.codePointAt(0)!) >>> 0;
  return 'b' + h.toString(16);
};

/** A repo `owner/data` on branch main with the given files; push permission by default. */
export function fakeGitHub(initial: Record<string, string> = {}, opts: { push?: boolean; truncated?: boolean } = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  const blobs = new Map<string, string>();
  const requests: Req[] = [];
  const fails: Fail[] = [];
  let commit = 1;
  const head = () => `c${commit}`;
  const shaOf = (path: string) => {
    const sha = hash(files.get(path)!);
    blobs.set(sha, files.get(path)!);
    return sha;
  };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  function route(method: string, url: URL, body: any): Response {
    const p = decodeURIComponent(url.pathname.replace('/repos/owner/data', ''));
    if (method === 'GET' && p === '') return json(200, { permissions: { push: opts.push ?? true } });
    if (method === 'GET' && p === '/commits/main') return json(200, { sha: head(), commit: { tree: { sha: `t${commit}` } } });
    if (method === 'GET' && p.startsWith('/git/trees/')) {
      const tree = [...files.keys()].map((path) => ({ path, type: 'blob', sha: shaOf(path) }));
      return json(200, { tree, truncated: opts.truncated ?? false });
    }
    if (method === 'GET' && p.startsWith('/git/blobs/')) {
      const text = blobs.get(p.slice('/git/blobs/'.length));
      return text === undefined ? json(404, {}) : json(200, { content: chunked(encodeUtf8Base64(text)), encoding: 'base64' });
    }
    const path = p.replace(/^\/contents\/?/, '');
    if (method === 'GET' && p.startsWith('/contents')) {
      if (files.has(path)) return json(200, { type: 'file', path, sha: shaOf(path), content: chunked(encodeUtf8Base64(files.get(path)!)) });
      const prefix = path ? path + '/' : '';
      const names = new Set([...files.keys()].filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split('/')[0]));
      if (!names.size) return json(404, {});
      return json(200, [...names].map((n) => {
        const full = prefix + n;
        return files.has(full) ? { type: 'file', path: full, sha: shaOf(full) } : { type: 'dir', path: full, sha: 'tree' };
      }));
    }
    if (method === 'PUT' && p.startsWith('/contents/')) {
      if (files.has(path) && body.sha !== shaOf(path)) return json(body.sha ? 409 : 422, { message: 'sha mismatch' });
      if (!files.has(path) && body.sha) return json(409, {});
      const parent = head();
      files.set(path, decodeUtf8Base64(body.content));
      commit++;
      return json(201, { content: { path, sha: shaOf(path) }, commit: { sha: head(), parents: [{ sha: parent }] } });
    }
    return json(404, {});
  }

  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url: String(input), headers: { ...(init.headers as Record<string, string>) }, body });
    const i = fails.findIndex((f) => f.method === method && f.match.test(url.pathname));
    if (i >= 0) {
      const [f] = fails.splice(i, 1);
      if (f.status === 'network') throw new TypeError('Failed to fetch');
      return json(f.status, { message: 'fail' }, f.headers);
    }
    return route(method, url, body);
  };

  return {
    fetch: fetch as typeof globalThis.fetch,
    files,
    requests,
    /** Fails the next matching request once. */
    failNext: (method: string, match: RegExp, status: number | 'network', headers?: Record<string, string>) =>
      void fails.push({ method, match, status, headers }),
    /** Simulates a commit from another device. */
    commitRemote: (path: string, text: string) => {
      files.set(path, text);
      commit++;
    },
    head,
    shaOf,
  };
}

const chunked = (b64: string) => b64.replace(/.{60}/g, '$&\n');
