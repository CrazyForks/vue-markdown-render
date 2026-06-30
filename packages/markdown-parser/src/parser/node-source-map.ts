import type { InternalParseOptions, MarkdownNodeSourceMap, MarkdownToken, ParsedNode, ParseOptions } from '../types'

function mapSourceLineRange(
  startLine: number,
  endLine: number,
  options?: ParseOptions,
): MarkdownNodeSourceMap {
  const mapper = (options as InternalParseOptions | undefined)?.__sourceLineMapper
  if (!mapper) {
    return {
      startLine,
      endLine,
    }
  }

  const mappedStartLine = mapper(startLine)
  const mappedEndLine = endLine > startLine
    ? mapper(endLine - 1) + 1
    : mapper(endLine)

  return {
    startLine: mappedStartLine,
    endLine: Math.max(mappedStartLine, mappedEndLine),
  }
}

function readSourceMap(token: MarkdownToken | undefined, options?: ParseOptions): MarkdownNodeSourceMap | null {
  const map = token?.map
  if (!Array.isArray(map) || map.length < 2)
    return null

  const startLine = Number(map[0])
  const endLine = Number(map[1])
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine))
    return null

  return mapSourceLineRange(startLine, endLine, options)
}

export function applyNodeSourceMap<TNode extends ParsedNode>(
  node: TNode,
  token: MarkdownToken | undefined,
  options?: ParseOptions,
): TNode {
  if (!options?.includeSourceMap)
    return node

  const sourceMap = readSourceMap(token, options)
  if (!sourceMap)
    return node

  node.sourceMap = sourceMap
  if (node.type === 'code_block') {
    const codeNode = node as Extract<ParsedNode, { type: 'code_block' }>
    codeNode.startLine = sourceMap.startLine
    codeNode.endLine = sourceMap.endLine
  }

  return node
}
