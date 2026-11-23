import { describe, expect, it } from 'vitest';
import { metaContent } from '../../src/core/serialize.ts';
import { createGitHub } from '../../src/sync/github.ts';
import { checkMeta, ensureMeta, validateConnection } from '../../src/sync/setup.ts';
import { fakeGitHub } from './fakeGitHub.ts';

const gh = (fake: ReturnType<typeof fakeGitHub>) => createGitHub({ repo: 'owner/data', branch: 'main', token: 't', fetch: fake.fetch });
const NOW = '2026-11-24T10:00:00.000Z';

describe('validateConnection (§8.1)', () => {
  it('accepts a repo with push permission', async () => {
    expect(await validateConnection(gh(fakeGitHub()))).toEqual({ ok: true });
  });

  it('reports the three setup errors', async () => {
    const readOnly = fakeGitHub({}, { push: false });
    expect(await validateConnection(gh(readOnly))).toEqual({ ok: false, message: 'Token is read-only' });
    for (const status of [404, 401, 403] as const) {
      const fake = fakeGitHub();
      fake.failNext('GET', /data$/, status);
      expect(await validateConnection(gh(fake))).toEqual({ ok: false, message: 'Repository not found or token has no access' });
    }
    const offline = fakeGitHub();
    offline.failNext('GET', /data$/, 'network');
    expect(await validateConnection(gh(offline))).toEqual({ ok: false, message: 'No internet' });
  });
});

describe('meta.json (§3.7)', () => {
  it('creates meta.json in a repo that has only a README', async () => {
    const fake = fakeGitHub({ 'README.md': '# data\n' });
    expect(await ensureMeta(gh(fake), NOW)).toBe('created');
    expect(fake.files.get('meta.json')).toBe(metaContent(NOW));
  });

  it('keeps an existing meta.json', async () => {
    const fake = fakeGitHub({ 'meta.json': metaContent('2026-01-01T00:00:00.000Z') });
    expect(await ensureMeta(gh(fake), NOW)).toBe('exists');
    expect(fake.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  });

  it('reports a newer schema as tooNew (read-only)', async () => {
    const fake = fakeGitHub({ 'meta.json': '{ "app": "sales-bookkeeping", "schemaVersion": 2 }\n' });
    expect(await ensureMeta(gh(fake), NOW)).toBe('tooNew');
    expect(checkMeta('{"schemaVersion":1}')).toEqual({ schemaVersion: 1, tooNew: false });
    expect(checkMeta('{"schemaVersion":3}')).toEqual({ schemaVersion: 3, tooNew: true });
  });
});

describe('meta.json confirmation', () => {
  it('does not create meta.json when the user declines', async () => {
    const fake = fakeGitHub({ 'README.md': '# data\n' });
    expect(await ensureMeta(gh(fake), NOW, async () => false)).toBe('declined');
    expect(fake.files.has('meta.json')).toBe(false);
  });
});
