// Reactive current route and query, driven by `hashchange`.
import { SIDES, SIDES_KEY, parseQuery, parseRoute, parseSides, type Tab } from './router.ts';

export const router = $state({ route: parseRoute(location.hash), query: parseQuery(location.hash) });

addEventListener('hashchange', () => {
  router.route = parseRoute(location.hash);
  router.query = parseQuery(location.hash);
  scrollTo(0, 0);
});

/** Navigates to a hash route, e.g. go('#/orders/abc'). */
export function go(hash: string, replace = false) {
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (replace) dispatchEvent(new HashChangeEvent('hashchange'));
}

function readSides() {
  try {
    return parseSides(localStorage.getItem(SIDES_KEY));
  } catch {
    return {};
  }
}

/** Last list screen shown in each two-sided tab, kept per device. */
export const sides = $state<Record<string, string>>(readSides());

export function rememberSide(tab: Tab, side: string) {
  if (!SIDES[tab]?.includes(side) || sides[tab] === side) return;
  sides[tab] = side;
  try {
    localStorage.setItem(SIDES_KEY, JSON.stringify(sides));
  } catch {
    // Storage blocked: the nav still follows for this visit.
  }
}
