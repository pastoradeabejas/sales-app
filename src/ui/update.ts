// App version check (spec §7): the service worker registration, shared by the update banner and the Overview sync button.
let registration: ServiceWorkerRegistration | undefined;

export function setRegistration(r: ServiceWorkerRegistration) {
  registration = r;
}

/** Asks the server for a newer app version; the update banner shows when one is waiting. */
export async function checkAppUpdate(): Promise<void> {
  await registration?.update().catch(() => undefined);
}
