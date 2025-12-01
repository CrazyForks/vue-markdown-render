import type { AdmonitionNode, MarkdownToken, ParsedNode, ParseOptions } from '../../types'
import { parseFenceToken } from '../inline-parsers/fence-parser'
import { parseCodeBlock } from './code-block-parser'
import { parseDefinitionList } from './definition-list-parser'
import { parseFootnote } from './footnote-parser'
import { parseHeading } from './heading-parser'
import { parseHtmlBlock } from './html-block-parser'
import { parseMathBlock } from './math-block-parser'
import { parseTable } from './table-parser'
import { parseThematicBreak } from './thematic-break-parser'

export function parseBasicBlockToken(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
): [ParsedNode, number] | null {
  const token = tokens[index]
  switch (token.type) {
    case 'heading_open':
      return [parseHeading(tokens, index, options), index + 3]

    case 'code_block':
      return [parseCodeBlock(token), index + 1]

    case 'fence':
      return [parseFenceToken(token), index + 1]

    case 'math_block':
      return [parseMathBlock(token), index + 1]

    case 'html_block':
      return [parseHtmlBlock(token), index + 1]

    case 'table_open': {
      const [tableNode, newIndex] = parseTable(tokens, index, options)
      return [tableNode, newIndex]
    }

    case 'dl_open': {
      const [definitionListNode, newIndex] = parseDefinitionList(tokens, index, options)
      return [definitionListNode, newIndex]
    }

    case 'footnote_open': {
      const [footnoteNode, newIndex] = parseFootnote(tokens, index, options)
      return [footnoteNode, newIndex]
    }

    case 'hr':
      return [parseThematicBreak(), index + 1]
    default:
      break
  }

  return null
}

type ContainerParser = (
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
) => [AdmonitionNode, number]

type ContainerMatcher = (
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
) => [AdmonitionNode, number] | null

export function parseCommonBlockToken(
  tokens: MarkdownToken[],
  index: number,
  options?: ParseOptions,
  handlers?: {
    parseContainer?: ContainerParser
    matchAdmonition?: ContainerMatcher
  },
): [ParsedNode, number] | null {
  const basicResult = parseBasicBlockToken(tokens, index, options)
  if (basicResult)
    return basicResult

  const token = tokens[index]
  switch (token.type) {
    case 'container_warning_open':
    case 'container_info_open':
    case 'container_note_open':
    case 'container_tip_open':
    case 'container_danger_open':
    case 'container_caution_open':
    case 'container_error_open': {
      if (handlers?.parseContainer)
        return handlers.parseContainer(tokens, index, options)
      break
    }

    case 'container_open': {
      if (handlers?.matchAdmonition) {
        const result = handlers.matchAdmonition(tokens, index, options)
        if (result)
          return result
      }
      break
    }
    default:
      break
  }

  return null
}
