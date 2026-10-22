// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false, // SPA mode: instant interactivity, zero SSR hydration freeze
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
    preset: 'aws-lambda'
  }
})
