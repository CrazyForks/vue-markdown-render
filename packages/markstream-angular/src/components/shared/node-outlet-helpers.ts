import type { AngularRenderContext, AngularRenderableNode } from './node-helpers'
import { getHtmlTagFromContent, resolveCodeBlockLanguage, stripCustomHtmlWrapper } from './node-helpers'

export type CodeBlockMode = 'mermaid' | 'd2' | 'infographic' | 'pre' | 'code'

export function resolveNodeOutletCodeMode(
  node: AngularRenderableNode,
  context?: AngularRenderContext,
): CodeBlockMode {
  if (context?.renderCodeBlocksAsPre)
    return 'pre'

  const language = resolveCodeBlockLanguage(node)
  if (language === 'd2' || language === 'd2lang')
    return 'd2'
  if (language === 'infographic')
    return 'infographic'
  if (language === 'mermaid')
    return 'mermaid'
  return 'code'
}

export function resolveHtmlTag(node: AngularRenderableNode) {
  return String((node as any)?.tag || '').trim().toLowerCase() || getHtmlTagFromContent((node as any)?.content)
}

export function coerceCustomHtmlNode(node: AngularRenderableNode) {
  const tag = resolveHtmlTag(node)
  if (!tag)
    return node
  return {
    ...(node as any),
    type: tag,
    tag,
    content: stripCustomHtmlWrapper((node as any)?.content, tag),
  } as AngularRenderableNode
}

export function coerceBuiltinHtmlNode(node: AngularRenderableNode, resolvedType: string) {
  const tag = resolveHtmlTag(node)
  if (!tag)
    return node
  return {
    ...(node as any),
    type: resolvedType,
    tag,
  } as AngularRenderableNode
}

export function resolveNodeOutletCustomInputs(
  node: AngularRenderableNode,
  context?: AngularRenderContext,
) {
  if (String((node as any)?.type || '') !== 'code_block')
    return null

  const codeMode = resolveNodeOutletCodeMode(node, context)
  if (codeMode === 'mermaid')
    return context?.mermaidProps ?? null
  if (codeMode === 'd2')
    return context?.d2Props ?? null
  if (codeMode === 'infographic')
    return context?.infographicProps ?? null
  return context?.codeBlockProps ?? null
}
