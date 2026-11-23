// Reactive current route, driven by `hashchange`.
import { parseRoute } from './router.ts';

export const router = $state({ route: parseRoute(location.hash) });

addEventListener('hashchange', () => {
  router.route = parseRoute(location.hash);
  scrollTo(0, 0);
});
