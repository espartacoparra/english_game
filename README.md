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

The app and the multiplayer rooms are two servers. `nuxt dev` serves the game on
`http://localhost:3010`; the rooms live in a separate Cloudflare Worker served by
`wrangler dev` on `ws://127.0.0.1:8787` (the address the client dials through
`runtimeConfig.public.roomWsUrl`).

Start both at once:

```bash
pnpm dev:all
```

Or run them in separate terminals:

```bash
pnpm dev        # app on http://localhost:3010
pnpm dev:room   # room Worker on ws://127.0.0.1:8787
```

Single-player modes work with `pnpm dev` alone; the room page needs the room
Worker, and shows a connection error naming the missing server when it is not
running.

End-to-end check of the room Worker (starts its own `wrangler dev` on a free
port):

```bash
pnpm smoke:room
```

## Troubleshooting

`nuxt dev` exits with `options.hostname.toLowerCase is not a function`: the dev
CLI caches the last address it bound in `node_modules/.cache/nuxt/dev-server.json`
and reuses it before reading `nuxt.config.ts`. A hint written by an older config
(where `devServer.host` resolved to a schema object instead of a string) breaks
the next start. Delete the cache and start again:

```bash
rm -f node_modules/.cache/nuxt/dev-server.json
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
