import type { MarkdownIt } from 'markdown-it-ts'
import type { MarkdownToken, ParsedNode, ParseOptions } from '../types'
import { parseInlineTokens } from './inline-parsers'
import { parseFenceToken } from './inline-parsers/fence-parser'
import { parseAdmonition } from './node-parsers/admonition-parser'
import { parseBlockquote } from './node-parsers/blockquote-parser'
import { parseCodeBlock } from './node-parsers/code-block-parser'
import { parseContainer } from './node-parsers/container-parser'
import { parseDefinitionList } from './node-parsers/definition-list-parser'
import { parseFootnote } from './node-parsers/footnote-parser'
import { parseHardBreak } from './node-parsers/hardbreak-parser'
import { parseHeading } from './node-parsers/heading-parser'
import { parseHtmlBlock } from './node-parsers/html-block-parser'
import { parseList } from './node-parsers/list-parser'
import { parseMathBlock } from './node-parsers/math-block-parser'
import { parseParagraph } from './node-parsers/paragraph-parser'
import { parseTable } from './node-parsers/table-parser'
import { parseThematicBreak } from './node-parsers/thematic-break-parser'

export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
  options: ParseOptions = {},
): ParsedNode[] {
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  // todo: 下面的特殊 math 其实应该更精确匹配到() 或者 $$ $$ 或者 \[ \] 内部的内容
  let safeMarkdown = (markdown ?? '').toString().replace(/([^\\])\r(ight|ho)/g, '$1\\r$2').replace(/([^\\])\n(abla|eq|ot|exists)/g, '$1\\n$2')
  if (safeMarkdown.endsWith('- *')) {
    // 放置markdown 解析 - * 会被处理成多个 ul >li 嵌套列表
    safeMarkdown = safeMarkdown.replace(/- \*$/, '- \\*')
  }
  if (/\n\s*-\s*$/.test(safeMarkdown)) {
    // 此时 markdown 解析会出错要跳过
    safeMarkdown = safeMarkdown.replace(/\n\s*-\s*$/, '\n')
  }
  else if (/\n[[(]\n*$/.test(safeMarkdown)) {
    // 此时 markdown 解析会出错要跳过
    safeMarkdown = safeMarkdown.replace(/(\n\[|\n\()+\n*$/g, '\n')
  }

  // Get tokens from markdown-it
  const tokens = md.parse(safeMarkdown, {})
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  // Allow consumers to transform tokens before processing
  const pre = options.preTransformTokens
  const post = options.postTransformTokens
  let transformedTokens = tokens as unknown as MarkdownToken[]
  if (pre && typeof pre === 'function') {
    transformedTokens = pre(transformedTokens) || transformedTokens
  }
  // Process the tokens into our structured format
  let result = processTokens(transformedTokens, options)

  // Backwards compatible token-level post hook: if provided and returns
  // a modified token array, re-process tokens and override node-level result.
  if (post && typeof post === 'function') {
    const postResult = post(transformedTokens)
    if (Array.isArray(postResult)) {
      // Backwards compatibility: if the hook returns an array of tokens
      // (they have a `type` string property), re-process them into nodes.
      const first = (postResult as unknown[])[0] as unknown
      const firstType = (first as Record<string, unknown>)?.type
      if (first && typeof firstType === 'string') {
        result = processTokens(postResult as unknown as MarkdownToken[])
      }
      else {
        // Otherwise assume it returned ParsedNode[] and use it as-is
        result = postResult as unknown as ParsedNode[]
      }
    }
  }
  return result
}

// Process markdown-it tokens into our structured format
export function processTokens(tokens: MarkdownToken[], options?: ParseOptions): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  let i = 0
  // Note: table token normalization is applied during markdown-it parsing
  // via the `applyFixTableTokens` plugin (core.ruler.after('block')).
  // Link/strong/list-item fixes are applied during the inline stage by
  // their respective plugins. That keeps parsing-time fixes centralized
  // and avoids ad-hoc post-processing here.
  while (i < tokens.length) {
    const token = tokens[i]
    switch (token.type) {
      case 'container_warning_open':
      case 'container_info_open':
      case 'container_note_open':
      case 'container_tip_open':
      case 'container_danger_open':
      case 'container_caution_open':
      case 'container_error_open': {
        const [warningNode, newIndex] = parseContainer(tokens, i, options)
        result.push(warningNode)
        i = newIndex
        break
      }

      case 'heading_open':
        result.push(parseHeading(tokens, i, options))
        i += 3 // Skip heading_open, inline, heading_close
        break

      case 'paragraph_open':
        result.push(parseParagraph(tokens, i, options))
        i += 3 // Skip paragraph_open, inline, paragraph_close
        break

      case 'html_block':
        result.push(parseHtmlBlock(token))
        i += 1
        break
      case 'code_block':
        result.push(parseCodeBlock(tokens[i]))
        i += 1
        break

      case 'fence':
        result.push(parseFenceToken(tokens[i]))
        i += 1
        break

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listNode, newIndex] = parseList(tokens, i, options)
        result.push(listNode)
        i = newIndex
        break
      }

      case 'hr':
        result.push(parseThematicBreak())
        i += 1
        break

      case 'blockquote_open': {
        const [blockquoteNode, newIndex] = parseBlockquote(tokens, i, options)
        result.push(blockquoteNode)
        i = newIndex
        break
      }

      case 'table_open': {
        const [tableNode, newIndex] = parseTable(tokens, i, options)
        result.push(tableNode)
        i = newIndex
        break
      }

      case 'dl_open': {
        const [definitionListNode, newIndex] = parseDefinitionList(tokens, i, options)
        result.push(definitionListNode)
        i = newIndex
        break
      }

      case 'footnote_open': {
        const [footnoteNode, newIndex] = parseFootnote(tokens, i, options)
        result.push(footnoteNode)
        i = newIndex
        break
      }

      case 'container_open': {
        const match
          = /^::: ?(warning|info|note|tip|danger|caution|error) ?(.*)$/.exec(
            String(token.info ?? ''),
          )
        if (match) {
          const [admonitionNode, newIndex] = parseAdmonition(tokens, i, match, options)
          result.push(admonitionNode)
          i = newIndex
        }
        else {
          i += 1 // Not a container type we handle, skip
        }
        break
      }

      case 'hardbreak':
        result.push(parseHardBreak())
        i++
        break

      case 'math_block':
        result.push(parseMathBlock(tokens[i]))
        i += 1
        break

      case 'inline':
        result.push(...parseInlineTokens(token.children || [], String(token.content ?? ''), undefined, { requireClosingStrong: options?.requireClosingStrong }))
        i += 1
        break
      default:
        // Handle other token types or skip them
        i += 1
        break
    }
  }

  return result
}

export { parseInlineTokens }
