# sales-app

**Sales Book**: a small offline-first bookkeeping web app (PWA) for
products, clients, orders, payments and stock. It syncs its data as JSON
files to a private GitHub repository through the GitHub REST API; there
is no backend.

## Use
Open `https://<owner>.github.io/<repo>/` in Chrome (Android) or
Safari/Chrome (Mac) and install it. The data repository and a per-device
token are entered in Settings; no data lives in this repository.

## Develop
Node 24. `npm ci`, then `npm run dev`. Tests: `npm test`; types and
accessibility: `npm run check`; production build: `npm run build`.
