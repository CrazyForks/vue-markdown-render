import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc'
import UnpluginClassExtractor from 'unplugin-class-extractor/vite'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { name } from './package.json'

export default defineConfig(({ mode }) => {
  const base = mode === 'npm' ? '' : '/'
  const plugins = [react()]
  if (mode === 'npm') {
    plugins.push(
      dts({
        outDir: 'dist/types',
        insertTypesEntry: true,
        // Use a build-only tsconfig without workspace path aliases, otherwise
        // declaration output can rewrite workspace deps into relative paths.
        tsconfigPath: './tsconfig.build.json',
      }),
      UnpluginClassExtractor({
        output: 'dist/tailwind.ts',
        include: [/\/src\/.*\.(?:ts|tsx)(\?.*)?$/],
      }) as any,
    )
  }
  return {
    base,
    plugins,
    css: {
      postcss: './postcss.config.cjs',
    },
    worker: {
      format: 'es',
      rollupOptions: {
        // Keep heavy optional peer deps out of the published worker bundles.
        // Consumers bundling `markstream-react/workers/*?worker` will still
        // bundle these as needed in their own app build.
        external: [
          'katex',
          'katex/contrib/mhchem',
          'mermaid',
        ],
        output: {
          entryFileNames: 'workers/[name].js',
          chunkFileNames: 'workers/[name].js',
          assetFileNames: 'workers/[name][extname]',
        },
      },
    },
    build: {
      target: 'es2019',
      cssTarget: 'chrome80',
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          ecma: 2019,
          drop_console: false,
          drop_debugger: true,
          pure_funcs: ['console.log'],
          passes: 2,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
          ecma: 2019,
        },
      },
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name,
        fileName: 'index',
        formats: ['es'],
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'katex',
          'katex/contrib/mhchem',
          'mermaid',
          'stream-monaco',
          'stream-markdown',
          'stream-markdown-parser',
          '@antv/infographic',
          '@floating-ui/dom',
        ],
      },
    },
  }
})
