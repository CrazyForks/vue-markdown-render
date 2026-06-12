import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const distDir = path.resolve('dist')
const sourcePath = path.join(distDir, '.tailwind-source.ts')
const esmPath = path.join(distDir, 'tailwind.js')
const cjsPath = path.join(distDir, 'tailwind.cjs')
const dtsPath = path.join(distDir, 'tailwind.d.ts')

const source = await readFile(sourcePath, 'utf8')
const match = source.match(/export const safeList = `[\s\S]*?`/)

if (!match)
  throw new Error(`[finalize-tailwind-export] Could not find safeList export in ${path.relative(process.cwd(), sourcePath)}`)

const esmDeclaration = `${match[0]};`
const cjsDeclaration = esmDeclaration.replace('export const ', 'const ')

await writeFile(esmPath, `${esmDeclaration}\nexport default safeList;\n`)
await writeFile(cjsPath, `${cjsDeclaration}\nmodule.exports = safeList;\nmodule.exports.safeList = safeList;\nmodule.exports.default = safeList;\n`)
await writeFile(dtsPath, `export declare const safeList: string\nexport default safeList\n`)
await rm(sourcePath, { force: true })

console.log('[finalize-tailwind-export] Wrote dist/tailwind.js, dist/tailwind.cjs, and dist/tailwind.d.ts')
