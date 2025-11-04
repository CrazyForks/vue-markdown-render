import Vue from '@vitejs/plugin-vue'
/// <reference types="vitest" />

import autoprefixer from 'autoprefixer'
import UnpluginClassExtractor from 'unplugin-class-extractor/vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { name } from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    Vue(),
    dts({
      outDir: 'dist2/types',
    }),
    UnpluginClassExtractor({
      output: 'dist2/tailwind.ts',
      include: [/\/src\/components\/(?:[^/]+\/)*[^/]+\.vue(\?.*)?$/],
    }) as any,
  ],
  build: {
    target: 'es2015',
    cssTarget: 'chrome61',
    copyPublicDir: false,
    outDir: 'dist2', // 修改输出路径为 dist2
    lib: {
      entry: './src/exports.ts',
      formats: ['cjs', 'es'],
      name,
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'vue',
        'markdown-it-ts',
        'markdown-it-container',
        'markdown-it-emoji',
        'markdown-it-footnote',
        'markdown-it-ins',
        'markdown-it-mark',
        'markdown-it-sub',
        'markdown-it-sup',
        'markdown-it-task-checkbox',
        'mermaid',
        'vue-i18n',
        'katex',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
        exports: 'named',
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        // 不使用 tailwindcss 插件，这样 @apply 指令就不会被处理
        autoprefixer,
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
