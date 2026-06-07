const RESERVED_CODE_BLOCK_EXTRA_PROPS = new Set([
  'node',
  'key',
  'ref',
  'ctx',
  'renderNode',
  'indexKey',
  '__proto__',
  'prototype',
  'constructor',
])

export function getCodeBlockExtraProps(source: unknown) {
  const extraProps: Record<string, unknown> = {}

  if (!source || typeof source !== 'object')
    return extraProps

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!RESERVED_CODE_BLOCK_EXTRA_PROPS.has(key))
      extraProps[key] = value
  }

  return extraProps
}
