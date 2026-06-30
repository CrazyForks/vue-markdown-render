export type TypewriterCursorMode = 'off' | 'simple' | 'precise'

export function normalizeTypewriterCursorMode(value: unknown): TypewriterCursorMode {
  if (value === 'simple')
    return 'simple'
  if (value === true || value === 'true' || value === 'precise')
    return 'precise'
  return 'off'
}

export function isTypewriterEnabled(value: unknown) {
  return normalizeTypewriterCursorMode(value) !== 'off'
}
