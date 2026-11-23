import { describe, expect, it } from 'vitest';
import { createGitHub, GitHubError } from '../../src/sync/github.ts';
import { fakeGitHub } from './fakeGitHub.ts';

const make = (fake = fakeGitHub()) => ({ fake, gh: createGitHub({ repo: 'owner/data', branch: 'main', token: 'tok123', fetch: fake.fetch }) });

async function kindOf(p: Promise<unknown>) {
  try {
    await p;
    return 'none';
  } catch (e) {
    return e instanceof GitHubError ? `${e.kind} ${e.status}` : String(e);
  }
}

describe('github client', () => {
  it('sends exactly the §6.1 headers and only to api.github.com', async () => {
    const { fake, gh } = make();
    await gh.getRepo();
    await gh.getHead();
    await gh.putFile('clients/c1.json', '{}\n', 'msg');
    for (const r of fake.requests) {
      expect(r.url.startsWith('https://api.github.com/repos/owner/data')).toBe(true);
      expect(r.headers).toEqual({
        Authorization: 'Bearer tok123',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      });
    }
  });

  it('reads repo permission, head, tree and blobs', async () => {
    const { fake, gh } = make(fakeGitHub({ 'meta.json': '{}\n', 'clients/c1.json': '{"name":"Lucía"}\n' }));
    expect(await gh.getRepo()).toEqual({ pushAllowed: true });
    const head = await gh.getHead();
    expect(head).toEqual({ sha: 'c1', treeSha: 't1' });
    const tree = await gh.getTree(head.treeSha);
    expect(tree.truncated).toBe(false);
    expect(tree.entries).toContainEqual({ path: 'clients/c1.json', sha: fake.shaOf('clients/c1.json') });
    expect(await gh.getBlob(fake.shaOf('clients/c1.json'))).toBe('{"name":"Lucía"}\n');
  });

  it('puts a file as UTF-8 base64 with branch and optional sha', async () => {
    const { fake, gh } = make();
    const res = await gh.putFile('clients/c1.json', '{"name":"Lucía"}\n', '[Mac] client: Lucía');
    expect(fake.files.get('clients/c1.json')).toBe('{"name":"Lucía"}\n');
    expect(fake.requests[0].body).toEqual({ message: '[Mac] client: Lucía', content: expect.any(String), branch: 'main' });
    expect(res).toEqual({ blobSha: fake.shaOf('clients/c1.json'), commitSha: 'c2', parentSha: 'c1' });
    await gh.putFile('clients/c1.json', '{}\n', 'edit', res.blobSha);
    expect(fake.requests[1].body.sha).toBe(res.blobSha);
  });

  it('reads one file and lists a folder', async () => {
    const { fake, gh } = make(fakeGitHub({ 'orders/2026/11/o1.json': '{}\n', 'clients/c1.json': '{"a":1}\n' }));
    expect(await gh.getFile('clients/c1.json')).toEqual({ sha: fake.shaOf('clients/c1.json'), text: '{"a":1}\n' });
    expect(await gh.getFile('clients/zz.json')).toBeNull();
    expect(await gh.getFolder('')).toEqual([
      { path: 'orders', sha: 'tree', type: 'dir' },
      { path: 'clients', sha: 'tree', type: 'dir' },
    ]);
  });

  it('maps failures to typed errors', async () => {
    const { fake, gh } = make();
    fake.failNext('GET', /data$/, 401);
    expect(await kindOf(gh.getRepo())).toBe('auth 401');
    fake.failNext('GET', /data$/, 403);
    expect(await kindOf(gh.getRepo())).toBe('auth 403');
    fake.failNext('GET', /data$/, 403, { 'x-ratelimit-remaining': '0' });
    expect(await kindOf(gh.getRepo())).toBe('rateLimit 403');
    fake.failNext('GET', /data$/, 404);
    expect(await kindOf(gh.getRepo())).toBe('notFound 404');
    fake.failNext('PUT', /contents/, 409);
    expect(await kindOf(gh.putFile('a.json', '', 'm'))).toBe('conflict 409');
    fake.failNext('PUT', /contents/, 422);
    expect(await kindOf(gh.putFile('a.json', '', 'm'))).toBe('conflict 422');
    fake.failNext('GET', /commits/, 502);
    expect(await kindOf(gh.getHead())).toBe('server 502');
    fake.failNext('GET', /commits/, 'network');
    expect(await kindOf(gh.getHead())).toBe('network 0');
  });

  it('never puts the token in an error message', async () => {
    const { fake, gh } = make();
    fake.failNext('GET', /commits/, 401);
    const err = await gh.getHead().catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain('tok123');
  });
});
