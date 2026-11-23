// Pure build helpers: base path and web app manifest (spec §7).

/** Normalises a Vite base path to "/" or "/name/". */
export function normalizeBase(raw: string | undefined): string {
  const parts = (raw ?? '').split('/').map((p) => p.trim()).filter(Boolean);
  return parts.length ? `/${parts.join('/')}/` : '/';
}
