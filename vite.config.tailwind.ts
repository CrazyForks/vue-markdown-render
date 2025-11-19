import Vue from '@vitejs/plugin-vue'
/// <reference types="vitest" />

import autoprefixer from 'autoprefixer'
import UnpluginClassExtractor from 'unplugin-class-extractor/vite'
import { defineConfig } from 'vite'
import { name } from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    Vue(),
    UnpluginClassExtractor({
      output: 'dist/tailwind.ts',
      include: [/\/src\/components\/(?:[^/]+\/)*[^/]+\.vue(\?.*)?$/],
    }) as any,
  ],
  build: {
    target: 'es2015',
    cssTarget: 'chrome61',
    copyPublicDir: false,
    outDir: 'dist', // 修改输出路径为 dist
    // Don't clear `dist` before this build — we may run this after the
    // main library build and we don't want to remove generated types.
    emptyOutDir: false,
    lib: {
      entry: './src/exports.ts',
      formats: ['cjs', 'es'],
      name,
      fileName: 'index',
    },
    rollupOptions: {
      // Externalise large runtime/highlighter/editor libs so we don't
      // bundle all language/theme chunks into `dist/` during the
      // tailwind-only build. These packages are provided as peer deps
      // (or loaded by consumers) and should not be emitted by this
      // helper build.
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
        // syntax highlighting / editor libs that previously caused
        // many language/theme chunks to be emitted
        'shiki',
        'monaco-editor',
        'monaco-editor-core',
        'stream-monaco',
        'stream-markdown',
        'vscode-textmate',
        'vscode-oniguruma',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
        exports: 'named',
        // Emit CSS asset with a distinct name so consumers can pick the
        // "tailwind-ready" CSS separately (index.tailwind.css).
        assetFileNames: (assetInfo: any) => {
          try {
            const fname = (assetInfo && ((assetInfo as any).name || (assetInfo as any).fileName || '')) as string
            if (fname && fname.endsWith('.css'))
              return 'index.tailwind.css'
          }
          catch {}
          return '[name][extname]'
        },
      },
    },
  },
  worker: {
    // Ensure web workers are bundled as ESM; IIFE/UMD are invalid with code-splitting
    format: 'es',
    rollupOptions: {
      // Externalize heavy libs in worker bundling as well
      external: (id: string) => /(?:^|\/)(?:mermaid|katex|shiki|monaco-editor|vscode-textmate|vscode-oniguruma)(?:\/|$)/.test(id),
      output: {
        entryFileNames: 'workers/[name].js',
        chunkFileNames: 'workers/[name].js',
        assetFileNames: 'workers/[name][extname]',
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
