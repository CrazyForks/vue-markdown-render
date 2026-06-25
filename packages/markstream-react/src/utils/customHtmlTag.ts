import type { ComponentType } from 'react'
import type { ParsedNode } from 'stream-markdown-parser'
import type { CustomComponentDisplayMode } from '../customComponents'
import { getHtmlTagFromContent, normalizeCustomHtmlTagName } from 'stream-markdown-parser'
import { getCustomComponentDisplay } from '../customComponents'

export interface ResolvedCustomHtmlTag {
  tag: string
  isWhitelisted: boolean
  component: ComponentType<any> | null
  display: CustomComponentDisplayMode | undefined
}

export function resolveCustomHtmlTag(
  node: Pick<ParsedNode, 'type'> & { tag?: string | null, content?: unknown },
  customComponents: Record<string, ComponentType<any>>,
  customHtmlTags?: readonly string[],
): ResolvedCustomHtmlTag | null {
  const normalizedType = normalizeCustomHtmlTagName(node.type)
  const normalizedTags = (customHtmlTags ?? []).map(tag => normalizeCustomHtmlTagName(tag)).filter(Boolean)
  const taggedNode = normalizedType === 'html_inline' || normalizedType === 'html_block'

  if (!taggedNode && !normalizedTags.includes(normalizedType))
    return null

  const tag = taggedNode
    ? (normalizeCustomHtmlTagName(node.tag) || getHtmlTagFromContent(node.content))
    : (normalizeCustomHtmlTagName(node.tag) || normalizedType)
  if (!tag)
    return null

  const isWhitelisted = normalizedTags.includes(tag)
  const component = isWhitelisted ? (customComponents[tag] ?? customComponents[normalizedType] ?? null) : null

  return {
    tag,
    isWhitelisted,
    component,
    display: getCustomComponentDisplay(component as any),
  }
}

export function isParagraphBreakingCustomHtmlNode(
  node: Pick<ParsedNode, 'type'> & { tag?: string | null, content?: unknown },
  customComponents: Record<string, ComponentType<any>>,
  customHtmlTags?: readonly string[],
) {
  return resolveCustomHtmlTag(node, customComponents, customHtmlTags)?.display === 'block'
}
