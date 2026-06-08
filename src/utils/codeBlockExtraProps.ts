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

export interface CodeBlockExtraPropsOptions {
  omit?: readonly string[]
}

export function getCodeBlockExtraProps(
  source: unknown,
  options: CodeBlockExtraPropsOptions = {},
) {
  const extraProps: Record<string, unknown> = {}
  const omittedProps = new Set(options.omit ?? [])

  if (!source || typeof source !== 'object')
    return extraProps

  const descriptors = Object.getOwnPropertyDescriptors(source)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (RESERVED_CODE_BLOCK_EXTRA_PROPS.has(key) || omittedProps.has(key))
      continue

    if (!descriptor.enumerable || !('value' in descriptor))
      continue

    extraProps[key] = descriptor.value
  }

  return extraProps
}
