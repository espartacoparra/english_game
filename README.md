# VerbMaster

English verb practice game built with Nuxt 4 and deployed to Cloudflare Workers.

## Requirements

- Node.js 22+
- pnpm 11+

## Setup

```bash
pnpm install
```

## Development

Start the dev server on `http://localhost:3010`:

```bash
pnpm dev
```

## Production build

```bash
pnpm build
```

The Cloudflare preset (`cloudflare_module`) generates `.output/server/wrangler.json` and the
static assets in `.output/public`.

## Deploy

Authenticate Wrangler once, then deploy:

```bash
pnpm exec wrangler login   # or export CLOUDFLARE_API_TOKEN
pnpm deploy
```

`pnpm deploy` builds the app and runs `wrangler deploy --config .output/server/wrangler.json`.
The Worker is named `english-game`.

Preview a production build locally:

```bash
pnpm exec wrangler dev --config .output/server/wrangler.json
```
