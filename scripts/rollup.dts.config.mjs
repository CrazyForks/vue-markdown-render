import fs from 'node:fs'
import path from 'node:path'
import dts from 'rollup-plugin-dts'

// Bundle the generated declaration entry into a single dist/index.d.ts.
// Treat workspace deps as external so we don't try to resolve them during
// bundling (the consumer will have their own types for those packages).
// If the expected Vite output entry (./dist/types/exports.d.ts) is missing
// fall back to an existing `dist/index.d.ts` so the build doesn't fail in
// environments where declarations were previously emitted differently.
const fallbackInput = './dist/index.d.ts'
const preferredInput = './dist/types/exports.d.ts'

const inputPath = fs.existsSync(path.resolve(preferredInput)) ? preferredInput : fallbackInput

export default [
  {
    // Prefer the Vite emitted declarations under dist/types if present
    input: inputPath,
    plugins: [
      dts({
        // Inline local type imports to ensure named interfaces are bundled
        respectExternal: false,
      }),
    ],
    external: [
      /^stream-markdown-parser(?:\/.*)?$/,
    ],
    output: [
      {
        file: 'dist/index.d.ts',
        format: 'es',
      },
    ],
  },
]
