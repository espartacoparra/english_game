# The Best IFL Team

English practice game and multiplayer arena built with Nuxt 4 and deployed to Cloudflare Workers.

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

Authenticate Wrangler once: `pnpm exec wrangler login` (or export
`CLOUDFLARE_API_TOKEN`).

The app and the rooms are **two** Workers, and the multiplayer link only works
when both are deployed and the app is built pointing at the room Worker. Deploy
both with one command:

```bash
pnpm deploy:all
```

That runs, in order:

1. `wrangler deploy --config workers/room/wrangler.jsonc` — publishes the room
   Worker as `english-game-room.<account-subdomain>.workers.dev`.
2. `nuxt build` — builds the app.
3. `wrangler deploy --config .output/server/wrangler.json` — publishes the app
   as `english-game.<account-subdomain>.workers.dev`.

Each step is also available alone (`pnpm deploy:room`, `pnpm deploy`).

### Room address

`nuxt.config.ts` picks the address the browser dials from the build mode:

| Build | `runtimeConfig.public.roomWsUrl` |
| --- | --- |
| `pnpm dev` | `ws://127.0.0.1:8787` (local `wrangler dev`) |
| `pnpm build` | `wss://english-game-room.espartaco-ing.workers.dev` |

`NUXT_PUBLIC_ROOM_WS_URL` overrides both (a custom domain, another account).
A deployed app served over https must dial `wss://`; the browser blocks a `ws:`
dial from an https page as mixed content, so a wrong value fails exactly like a
missing room Worker. If the room Worker is deployed under a different name, set
the variable and rebuild.

Preview a production build locally:

```bash
pnpm exec wrangler dev --config .output/server/wrangler.json
```
