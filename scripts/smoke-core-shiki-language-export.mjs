const core = await import('markstream-core')

const requiredExports = [
  'createRegisteredHighlightLanguages',
  'getHighlightRegistrationKey',
  'getRegisterHighlightOptions',
  'getShikiRendererOptions',
  'normalizeShikiLanguage',
  'registerHighlightOnce',
]

for (const key of requiredExports) {
  if (!(key in core))
    throw new Error(`markstream-core missing export: ${key}`)
}
