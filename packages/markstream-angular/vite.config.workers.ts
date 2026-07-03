import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: {
        'katexRenderer.worker': './src/workers/katexRenderer.worker.ts',
        'mermaidParser.worker': './src/workers/mermaidParser.worker.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'katex',
        'katex/contrib/mhchem',
        'katex/dist/contrib/mhchem',
        'mermaid',
      ],
      output: {
        entryFileNames: 'workers/[name].js',
        chunkFileNames: 'workers/[name].js',
        assetFileNames: 'workers/[name][extname]',
      },
    },
  },
})
