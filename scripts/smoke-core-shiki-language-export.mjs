import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const requiredExports = [
  'createRegisteredHighlightLanguages',
  'getHighlightRegistrationKey',
  'getLanguageBaseToken',
  'getRegisterHighlightOptions',
  'getShikiLangs',
  'getShikiLanguageMatchKey',
  'getShikiRendererOptions',
  'getShikiThemes',
  'normalizeShikiLanguage',
  'registerHighlightOnce',
]

const variants = [
  ['esm', await import('markstream-core')],
  ['cjs', require('markstream-core')],
]

for (const [format, core] of variants) {
  for (const key of requiredExports) {
    if (!(key in core))
      throw new Error(`[${format}] markstream-core missing export: ${key}`)
  }
}
