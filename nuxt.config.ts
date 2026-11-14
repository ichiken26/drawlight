import { env } from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    baseURL: env.NUXT_APP_BASE_URL || '/',
    head: {
      title: 'Drawlight — Sketch systems, not pixels',
      meta: [
        { name: 'description', content: 'A lightweight, AI-friendly diagram editor built for engineers.' },
        { name: 'theme-color', content: '#101a2e' }
      ]
    }
  },
  runtimeConfig: {
    gleamApiUrl: env.GLEAM_API_URL || 'http://127.0.0.1:8000',
    public: {
      syncEnabled: env.NUXT_PUBLIC_SYNC_ENABLED === 'true'
    }
  }
})
