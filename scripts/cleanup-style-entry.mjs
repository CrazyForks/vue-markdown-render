import { rm } from 'node:fs/promises'

// `styles-entry.ts` exists only to force Vite to emit the explicit CSS file
// exported through `markstream-vue/index.css`. The JS entry itself must never
// be published or imported by consumers.
await Promise.all([
  'dist/styles.js',
  'dist/styles.mjs',
  'dist/styles.cjs',
  'dist/styles.js.map',
  'dist/styles.mjs.map',
  'dist/styles.cjs.map',
].map(file => rm(file, { force: true })))
