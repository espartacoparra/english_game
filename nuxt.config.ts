// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: true,
  spaLoadingTemplate: 'spa-loading-template.html',
  devtools: { enabled: false },
  devServer: {
    port: 3010
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'VerbMaster — English Verb Practice & Mastery',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Master all regular and irregular English verbs with interactive gamified practice modes and streak rewards.'
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
