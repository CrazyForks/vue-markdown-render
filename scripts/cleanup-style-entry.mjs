import { rm } from 'node:fs/promises'

await rm('dist/styles.js', { force: true })
