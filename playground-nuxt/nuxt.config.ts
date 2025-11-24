import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
  ],
  css: [
    '@/assets/tailwind.css',
    'vue-renderer-markdown/index.tailwind.css',
    'vue-renderer-markdown/index.css',
    'katex/dist/katex.min.css',
  ],
  nitro: {
    publicAssets: [
      { dir: 'public' },
      { dir: '../playground/public', baseURL: '/' },
    ],
  },
  vite: {
    optimizeDeps: {
      exclude: ['monaco-editor', 'stream-monaco', 'vue-renderer-markdown'],
    },
  },
  runtimeConfig: {
    public: {
      demoTitle: 'Nuxt + Vue Renderer Markdown',
    },
  },
})
