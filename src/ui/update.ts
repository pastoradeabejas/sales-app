// App version check (spec §7): the service worker registration, shared by the update banner and the Overview sync button.
let registration: ServiceWorkerRegistration | undefined;

export function setRegistration(r: ServiceWorkerRegistration) {
  registration = r;
}

/** Asks the server for a newer app version; true when one was found (the update banner shows once it is ready). */
export async function checkAppUpdate(): Promise<boolean> {
  if (!registration) return false;
  await registration.update().catch(() => undefined);
  return !!(registration.installing || registration.waiting);
}
