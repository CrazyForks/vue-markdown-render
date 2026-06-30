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

  const mappedStartRange = mapper(startLine)
  const mappedEndLine = endLine > startLine
    ? mapper(endLine - 1).endLine
    : mapper(endLine).startLine

  return {
    startLine: mappedStartRange.startLine,
    endLine: Math.max(mappedStartRange.startLine, mappedEndLine),
  }
}

function lineAtOffset(source: string, offset: number) {
  const target = Math.max(0, Math.min(source.length, Math.trunc(offset)))
  let line = 0
  for (let i = 0; i < target; i++) {
    if (source[i] === '\n')
      line++
  }
  return line
}

function sourceLineRangeFromOffsets(source: string, start: number, end: number): MarkdownNodeSourceMap {
  const startIndex = Math.max(0, Math.min(source.length, Math.trunc(start)))
  const endIndex = Math.max(startIndex, Math.min(source.length, Math.trunc(end)))
  const startLine = lineAtOffset(source, startIndex)
  let endLine = lineAtOffset(source, endIndex)

  if (endIndex > startIndex && source[endIndex - 1] !== '\n')
    endLine++

  return {
    startLine,
    endLine,
  }
}

export function createSourceMapFromOffsets(
  source: string,
  start: number,
  end: number,
  options?: ParseOptions,
): MarkdownNodeSourceMap {
  const range = sourceLineRangeFromOffsets(source, start, end)
  return mapSourceLineRange(range.startLine, range.endLine, options)
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
