// Reactive current route and query, driven by `hashchange`.
import { parseQuery, parseRoute } from './router.ts';

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
