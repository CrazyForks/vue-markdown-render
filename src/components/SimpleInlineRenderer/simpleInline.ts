export interface SimpleInlineNode {
  type: string
  raw?: string
  children?: SimpleInlineNode[]
  [key: string]: unknown
}

export type SimpleInlineTextNode = SimpleInlineNode & {
  type: 'text'
  content?: unknown
  center?: boolean
}

const SIMPLE_INLINE_TYPES = new Set([
  'checkbox',
  'checkbox_input',
  'emoji',
  'emphasis',
  'hardbreak',
  'highlight',
  'inline_code',
  'insert',
  'link',
  'reference',
  'strikethrough',
  'strong',
  'subscript',
  'superscript',
  'text',
])

const SIMPLE_INLINE_CONTAINER_TYPES = new Set([
  'emphasis',
  'highlight',
  'insert',
  'link',
  'strikethrough',
  'strong',
  'subscript',
  'superscript',
])

export function isSimpleInlineNode(node: SimpleInlineNode) {
  if (!node || typeof node !== 'object')
    return false

  const type = String(node.type)
  if (!SIMPLE_INLINE_TYPES.has(type))
    return false

  if (!SIMPLE_INLINE_CONTAINER_TYPES.has(type))
    return true

  const children = node.children
  return Array.isArray(children) && children.every(isSimpleInlineNode)
}

export function areSimpleInlineNodes(nodes: readonly SimpleInlineNode[] | undefined) {
  return Array.isArray(nodes) && nodes.every(isSimpleInlineNode)
}

export function getPlainTextContent(
  nodes: readonly SimpleInlineNode[] | undefined,
) {
  if (!Array.isArray(nodes) || nodes.length === 0)
    return null

  let content = ''

  for (const node of nodes) {
    if (node?.type !== 'text')
      return null

    const textNode = node as SimpleInlineTextNode
    if (textNode.center === true)
      return null

    content += String(textNode.content ?? textNode.raw ?? '')
  }

  return content
}
