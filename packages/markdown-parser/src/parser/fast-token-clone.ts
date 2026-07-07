import type { MarkdownToken } from '../types'

/**
 * Fast token cloning optimized for common Markdown token structures.
 * This replaces the deep recursive `safeCloneTokenField` for performance-critical paths.
 *
 * Assumptions:
 * - Token fields are primitives, arrays, or plain objects
 * - No Map, Set, Date, RegExp, URL, Error in common token paths
 * - Children arrays are shallow (we clone tokens but not their internal structures deeply)
 */
export function fastCloneToken<T extends MarkdownToken>(token: T): T {
  // Fast path for primitives
  if (!token || typeof token !== 'object')
    return token

  const cloned = Object.create(Object.getPrototypeOf(token)) as T

  // Clone essential token properties
  cloned.type = token.type
  cloned.tag = token.tag
  cloned.nesting = token.nesting
  cloned.level = token.level
  cloned.content = token.content
  cloned.markup = token.markup
  cloned.info = token.info
  cloned.block = token.block
  cloned.hidden = token.hidden

  // Shallow clone attrs array
  if (Array.isArray(token.attrs)) {
    cloned.attrs = token.attrs.map(([key, value]) => [key, value] as [string, string])
  }
  else {
    cloned.attrs = token.attrs
  }

  // Shallow clone map array
  if (Array.isArray(token.map)) {
    cloned.map = [token.map[0], token.map[1]]
  }
  else {
    cloned.map = token.map
  }

  // Recursively clone children
  if (Array.isArray(token.children)) {
    cloned.children = token.children.map(child => fastCloneToken(child))
  }
  else {
    cloned.children = token.children
  }

  // Handle meta (usually primitives or simple objects)
  if (token.meta) {
    if (typeof token.meta === 'object' && !Array.isArray(token.meta)) {
      cloned.meta = { ...token.meta }
    }
    else {
      cloned.meta = token.meta
    }
  }

  return cloned
}

/**
 * Clone an array of tokens efficiently.
 */
export function fastCloneTokens<T extends MarkdownToken>(tokens: T[]): T[] {
  return tokens.map(token => fastCloneToken(token))
}
