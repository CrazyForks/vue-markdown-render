import { resolve } from 'node:path'
import autoprefixer from 'autoprefixer'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  build: {
    target: 'es2019',
    cssTarget: 'chrome80',
    copyPublicDir: false,
    outDir: 'dist-tw',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/tailwind-entry.ts'),
      formats: ['es'],
      name: 'markstream-react',
      fileName: 'index',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'chunks/[name].js',
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
  css: {
    postcss: {
      plugins: [
        // Do not run Tailwind here; this build produces the Tailwind-ready CSS.
        autoprefixer,
      ],
    },
  },
})
