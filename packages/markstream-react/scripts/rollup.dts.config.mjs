import fs from 'node:fs'
import path from 'node:path'
import dts from 'rollup-plugin-dts'

const fallbackInput = './dist/index.d.ts'
const preferredInputs = [
  './dist/types/index.d.ts',
  './dist/types/exports.d.ts',
]

const inputPath = preferredInputs.find(p => fs.existsSync(path.resolve(p)))
  ?? (fs.existsSync(path.resolve(fallbackInput)) ? fallbackInput : null)

if (!inputPath) {
  throw new Error(
    'No declaration entry found. Run `pnpm run build` (which emits declarations) before running `build:dts`.',
  )
}

export default [
  {
    input: inputPath,
    plugins: [
      dts({
        respectExternal: false,
      }),
    ],
    external: [
      /^react(?:\/.*)?$/,
      /^react-dom(?:\/.*)?$/,
      /^(?:katex|mermaid|stream-monaco|stream-markdown)(?:\/.*)?$/,
      /^stream-markdown-parser(?:\/.*)?$/,
      /^@antv\/infographic(?:\/.*)?$/,
      /^@floating-ui\/dom(?:\/.*)?$/,
    ],
    output: [
      {
        file: 'dist/index.d.ts',
        format: 'es',
      },
    ],
  },
]
