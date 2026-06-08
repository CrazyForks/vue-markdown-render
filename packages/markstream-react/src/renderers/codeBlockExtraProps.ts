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

  const descriptors = Object.getOwnPropertyDescriptors(source)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (RESERVED_CODE_BLOCK_EXTRA_PROPS.has(key))
      continue

    if (!('value' in descriptor))
      continue

    extraProps[key] = descriptor.value
  }

  return extraProps
}
