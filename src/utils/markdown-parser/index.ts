import type MarkdownIt from 'markdown-it'
import type { MarkdownToken, ParsedNode } from '../../types'
import { fixTableTokens } from './fixTableTokens'
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
import { parseList } from './node-parsers/list-parser'
import { parseMathBlock } from './node-parsers/math-block-parser'
import { parseParagraph } from './node-parsers/paragraph-parser'
import { parseTable } from './node-parsers/table-parser'
import { parseThematicBreak } from './node-parsers/thematic-break-parser'

// Function to parse markdown into a structured representation
export function parseMarkdownToStructure(
  markdown: string,
  md: MarkdownIt,
): ParsedNode[] {
  // Ensure markdown is a string — guard against null/undefined inputs from callers
  let safeMarkdown = (markdown ?? '').toString().replace(/([^\\])\right/g, '$1\\right')
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
  const tokens = md.parse(safeMarkdown, {}) as MarkdownToken[]
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  // Process the tokens into our structured format
  const result = processTokens(tokens)

  return result
}

// Process markdown-it tokens into our structured format
export function processTokens(tokens: MarkdownToken[]): ParsedNode[] {
  // Defensive: ensure tokens is an array
  if (!tokens || !Array.isArray(tokens))
    return []

  const result: ParsedNode[] = []
  let i = 0
  tokens = fixTableTokens(tokens)
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
        const [warningNode, newIndex] = parseContainer(tokens, i)
        result.push(warningNode)
        i = newIndex
        break
      }

      case 'heading_open':
        result.push(parseHeading(tokens, i))
        i += 3 // Skip heading_open, inline, heading_close
        break

      case 'paragraph_open':
        result.push(parseParagraph(tokens, i))
        i += 3 // Skip paragraph_open, inline, paragraph_close
        break

      case 'html_block':
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
        const [listNode, newIndex] = parseList(tokens, i)
        result.push(listNode)
        i = newIndex
        break
      }

      case 'hr':
        result.push(parseThematicBreak())
        i += 1
        break

      case 'blockquote_open': {
        const [blockquoteNode, newIndex] = parseBlockquote(tokens, i)
        result.push(blockquoteNode)
        i = newIndex
        break
      }

      case 'table_open': {
        const [tableNode, newIndex] = parseTable(tokens, i)
        result.push(tableNode)
        i = newIndex
        break
      }

      case 'dl_open': {
        const [definitionListNode, newIndex] = parseDefinitionList(tokens, i)
        result.push(definitionListNode)
        i = newIndex
        break
      }

      case 'footnote_open': {
        const [footnoteNode, newIndex] = parseFootnote(tokens, i)
        result.push(footnoteNode)
        i = newIndex
        break
      }

      case 'container_open': {
        const match
          = /^::: ?(warning|info|note|tip|danger|caution|error) ?(.*)$/.exec(
            token.info || '',
          )
        if (match) {
          const [admonitionNode, newIndex] = parseAdmonition(tokens, i, match)
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

      default:
        // Handle other token types or skip them
        i += 1
        break
    }
  }

  return result
}

export { parseInlineTokens }
