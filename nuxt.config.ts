// https://nuxt.com/docs/api/configuration/nuxt-config

/**
 * Where the browser dials the room Worker.
 *
 * Rooms live in `workers/room`, a Worker of their own, so the address cannot be
 * derived from the page origin: the app and the room Worker are two deployments.
 * `wrangler deploy --config workers/room/wrangler.jsonc` publishes it as
 * `english-game-room.<account-subdomain>.workers.dev`, and the app has to be
 * built pointing there — `ws://127.0.0.1:8787` only exists on a dev machine.
 * Setting `NUXT_PUBLIC_ROOM_WS_URL` overrides both defaults (a custom domain, a
 * fork on another account).
 */
const DEV_ROOM_WS_URL = 'ws://127.0.0.1:8787'
const PRODUCTION_ROOM_WS_URL = 'wss://english-game-room.espartaco-ing.workers.dev'

// `nuxt dev` sets NODE_ENV=development; a build does not always set
// NODE_ENV=production, and a build must never dial the dev machine.
const isDevBuild = process.env.NODE_ENV === 'development'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: true,
  spaLoadingTemplate: 'spa-loading-template.html',
  devtools: { enabled: false },
  devServer: {
    port: 3010,
    // Explicit string: the schema default is a `{ $resolve }` object that the
    // dev CLI does not always resolve, and it crashes on `hostname.toLowerCase`.
    host: 'localhost'
  },
  runtimeConfig: {
    public: {
      // `pnpm dev` talks to the local `wrangler dev` on 8787; `pnpm build` (the
      // deployed app, served over https) must talk to the deployed room Worker
      // over wss, otherwise the browser blocks the dial as mixed content.
      roomWsUrl: process.env.NUXT_PUBLIC_ROOM_WS_URL ??
        (isDevBuild ? DEV_ROOM_WS_URL : PRODUCTION_ROOM_WS_URL)
    }
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'The Best IFL Team — English Practice & Mastery',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'The Best IFL Team — Practice English verbs, vocabulary, synonyms, antonyms and cognates with real-time multiplayer and single-player modes.'
        }
      ]
    }
  },
  nitro: {
    // Cloudflare Workers preset (same setup as the portfolio project).
    // `deployConfig: true` makes Nitro generate `.output/server/wrangler.json`
    // with the correct `main`, `assets` binding and `nodejs_compat` flag, so
    // `npx wrangler deploy` works without a hand-written Wrangler config.
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: 'english-game',
      },
    },
  }
})
