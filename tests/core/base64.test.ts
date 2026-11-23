import { describe, expect, it } from 'vitest';
import { decodeUtf8Base64, encodeUtf8Base64 } from '../../src/core/base64.ts';

describe('base64 utf-8', () => {
  it.each(['Lucía', '€', '😀 emoji', '', 'plain'])('round trips %s', (s) => {
    expect(decodeUtf8Base64(encodeUtf8Base64(s))).toBe(s);
  });
  it('matches known encoding', () => {
    expect(encodeUtf8Base64('Lucía')).toBe('THVjw61h');
  });
  it('round trips a string over 64 KB', () => {
    const s = 'Lucía €😀 '.repeat(20000);
    expect(decodeUtf8Base64(encodeUtf8Base64(s))).toBe(s);
  });
  it('tolerates wrapped lines like the GitHub blob API', () => {
    const wrapped = encodeUtf8Base64('Lucía €').replace(/(.{4})/g, '$1\n');
    expect(decodeUtf8Base64(wrapped)).toBe('Lucía €');
  });
});
