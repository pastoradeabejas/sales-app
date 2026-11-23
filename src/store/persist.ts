// Persistent storage request (spec §7) so Android does not evict IndexedDB.

interface StorageNavigator {
  storage?: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };
}

/** Asks the browser to keep this site's data; false when unavailable, refused or failing. */
export async function requestPersistence(nav: StorageNavigator = globalThis.navigator ?? {}): Promise<boolean> {
  try {
    if (!nav.storage?.persist) return false;
    if (await nav.storage.persisted?.()) return true;
    return await nav.storage.persist();
  } catch {
    return false;
  }
}
