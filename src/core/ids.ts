const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// New 16-char time-sortable ID: 10 chars of base32 timestamp + 6 random chars (§3.1).
export function newId(now: number = Date.now()): string {
  let time = '';
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time;
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return time + Array.from(rnd, (b) => ALPHABET[b % 32]).join('');
}
