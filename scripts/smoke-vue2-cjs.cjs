const { createRequire } = require('node:module')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const vue2Entry = path.join(root, 'packages/markstream-vue2/dist/index.cjs')

const req = createRequire(vue2Entry)

const vue2 = req(vue2Entry)
if (!vue2 || typeof vue2 !== 'object') {
  throw new TypeError('markstream-vue2 CJS entry did not return an export object.')
}

const expectedVue2Exports = [
  'default',
  'MarkdownRender',
  'MarkdownRenderer',
  'MarkdownCodeBlockNode',
  'CodeBlockNode',
]

if (!expectedVue2Exports.some(key => key in vue2)) {
  throw new Error(
    `markstream-vue2 CJS entry loaded, but expected public exports were not found. Found: ${Object.keys(vue2).join(', ')}`,
  )
}

const core = req('markstream-core')
for (const key of [
  'registerHighlightOnce',
  'normalizeShikiLanguage',
  'getRuntimeShikiRegistrationConfig',
]) {
  if (typeof core[key] !== 'function') {
    throw new TypeError(`markstream-core CJS export ${key} is missing or not a function.`)
  }
}

console.log('[smoke-vue2-cjs] ok')
