// UTF-8 safe base64 (spec §6.1). Never use raw btoa on strings.

/** Encode text as UTF-8, then base64. */
export function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); // chunked: no call-stack overflow
  }
  return btoa(bin);
}

/** Decode base64 (newlines allowed, as in GitHub blobs) to UTF-8 text. */
export function decodeUtf8Base64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
