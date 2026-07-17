export type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk' | 'collapsed' | 'spacer'

export interface DiffPreviewLine {
  code: string
  empty: boolean
  key: string
  kind: DiffPreviewLineKind
  number: number | string
}

export interface DiffPreviewPane {
  className: string
  key: string
  lines: DiffPreviewLine[]
}

export interface DiffPreviewCollapseOptions {
  contextLineCount?: number
  enabled?: boolean
  minimumLineCount?: number
}

export interface BuildDiffPreviewOptions {
  code?: unknown
  hideUnchangedRegions?: boolean | DiffPreviewCollapseOptions
  inline?: boolean
  language?: unknown
  loading?: boolean
  originalCode?: unknown
  raw?: unknown
  updatedCode?: unknown
}

interface SourceLineMatch {
  modifiedIndex: number
  originalIndex: number
}

const DIFF_HEADER_PREFIXES = ['diff ', 'index ', '--- ', '+++ ', '@@ ']

function displaySource(source: unknown, loading: boolean) {
  const value = String(source ?? '')
  return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

function splitSource(source: unknown, loading: boolean) {
  const value = displaySource(source, loading)
  return value ? value.split(/\r\n|\n|\r/) : []
}

function normalizeLanguage(language: unknown) {
  return String(language ?? '')
    .split(/\s+/g)[0]
    ?.split(':')[0]
    ?.toLowerCase()
    .replace(/[^\w-]/g, '') || 'plaintext'
}

function isBlank(code: string) {
  return code.trim().length === 0
}

function makeLine(
  code: string,
  kind: DiffPreviewLineKind,
  key: string,
  number: number | string,
  preserveBlankKind = false,
): DiffPreviewLine {
  const empty = isBlank(code)
  return {
    code,
    empty,
    key,
    kind: empty && kind !== 'hunk' && kind !== 'collapsed' && kind !== 'spacer' && !preserveBlankKind ? 'context' : kind,
    number,
  }
}

function shouldPreserveBlankKind(lines: string[], index: number) {
  return !isBlank(lines[index]) || index < lines.length - 1
}

function isRemovedLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
}

function hasDiffHeaders(lines: string[]) {
  return lines.some(line => DIFF_HEADER_PREFIXES.some(prefix => line.startsWith(prefix)))
}

function normalizeDiffBody(body: string, headers: boolean) {
  return !headers && body.startsWith(' ') && !body.startsWith('  ') ? ` ${body}` : body
}

function computeMatches(original: string[], modified: string[]): SourceLineMatch[] {
  const prefix: SourceLineMatch[] = []
  let start = 0
  while (start < original.length && start < modified.length && original[start] === modified[start]) {
    prefix.push({ originalIndex: start, modifiedIndex: start })
    start++
  }

  const suffix: SourceLineMatch[] = []
  let originalEnd = original.length - 1
  let modifiedEnd = modified.length - 1
  while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
    suffix.unshift({ originalIndex: originalEnd, modifiedIndex: modifiedEnd })
    originalEnd--
    modifiedEnd--
  }

  const originalLength = originalEnd - start + 1
  const modifiedLength = modifiedEnd - start + 1
  if (originalLength <= 0 || modifiedLength <= 0 || (originalLength + 1) * (modifiedLength + 1) > 1_500_000)
    return prefix.concat(suffix)

  const columns = modifiedLength + 1
  const scores = new Uint32Array((originalLength + 1) * (modifiedLength + 1))
  for (let originalIndex = originalLength - 1; originalIndex >= 0; originalIndex--) {
    for (let modifiedIndex = modifiedLength - 1; modifiedIndex >= 0; modifiedIndex--) {
      const scoreIndex = originalIndex * columns + modifiedIndex
      if (original[start + originalIndex] === modified[start + modifiedIndex]) {
        scores[scoreIndex] = scores[(originalIndex + 1) * columns + modifiedIndex + 1] + 1
      }
      else {
        scores[scoreIndex] = Math.max(
          scores[(originalIndex + 1) * columns + modifiedIndex],
          scores[originalIndex * columns + modifiedIndex + 1],
        )
      }
    }
  }

  const middle: SourceLineMatch[] = []
  let originalIndex = 0
  let modifiedIndex = 0
  while (originalIndex < originalLength && modifiedIndex < modifiedLength) {
    if (original[start + originalIndex] === modified[start + modifiedIndex]) {
      middle.push({ originalIndex: start + originalIndex, modifiedIndex: start + modifiedIndex })
      originalIndex++
      modifiedIndex++
    }
    else if (scores[(originalIndex + 1) * columns + modifiedIndex] >= scores[originalIndex * columns + modifiedIndex + 1]) {
      originalIndex++
    }
    else {
      modifiedIndex++
    }
  }
  return prefix.concat(middle, suffix)
}

function buildSourcePanes(original: string[], modified: string[]) {
  const originalLines: DiffPreviewLine[] = []
  const modifiedLines: DiffPreviewLine[] = []
  const matches = computeMatches(original, modified)
  let originalIndex = 0
  let modifiedIndex = 0
  let blockIndex = 0

  const appendChangedRows = (originalEnd: number, modifiedEnd: number) => {
    const count = Math.max(originalEnd - originalIndex, modifiedEnd - modifiedIndex)
    for (let offset = 0; offset < count; offset++) {
      const nextOriginal = originalIndex + offset
      const nextModified = modifiedIndex + offset
      originalLines.push(nextOriginal < originalEnd
        ? makeLine(original[nextOriginal], 'removed', `original-changed-${blockIndex}-${nextOriginal}`, nextOriginal + 1, shouldPreserveBlankKind(original, nextOriginal))
        : makeLine('', 'spacer', `original-spacer-${blockIndex}-${offset}`, ''))
      modifiedLines.push(nextModified < modifiedEnd
        ? makeLine(modified[nextModified], 'added', `modified-changed-${blockIndex}-${nextModified}`, nextModified + 1, shouldPreserveBlankKind(modified, nextModified))
        : makeLine('', 'spacer', `modified-spacer-${blockIndex}-${offset}`, ''))
    }
    originalIndex = originalEnd
    modifiedIndex = modifiedEnd
    blockIndex++
  }

  for (const match of matches) {
    appendChangedRows(match.originalIndex, match.modifiedIndex)
    originalLines.push(makeLine(original[match.originalIndex], 'context', `original-context-${match.originalIndex}-${match.modifiedIndex}`, match.originalIndex + 1))
    modifiedLines.push(makeLine(modified[match.modifiedIndex], 'context', `modified-context-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1))
    originalIndex = match.originalIndex + 1
    modifiedIndex = match.modifiedIndex + 1
  }
  appendChangedRows(original.length, modified.length)

  return [
    { key: 'original', className: 'markstream-pre__diff-pane--original', lines: originalLines },
    { key: 'modified', className: 'markstream-pre__diff-pane--modified', lines: modifiedLines },
  ] satisfies DiffPreviewPane[]
}

function buildInlineSourceLines(original: string[], modified: string[]) {
  const panes = buildSourcePanes(original, modified)
  const lines: DiffPreviewLine[] = []
  for (let index = 0; index < panes[0].lines.length; index++) {
    const originalLine = panes[0].lines[index]
    const modifiedLine = panes[1].lines[index]
    if (originalLine.kind === 'removed')
      lines.push({ ...originalLine, key: `inline-${originalLine.key}` })
    if (modifiedLine.kind !== 'spacer')
      lines.push({ ...modifiedLine, key: `inline-${modifiedLine.key}` })
  }
  return lines
}

function readHunkStart(line: string) {
  const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
  return match ? { original: Number(match[1]), modified: Number(match[2]) } : undefined
}

function buildPatchPanes(lines: string[], inline: boolean) {
  const original: DiffPreviewLine[] = []
  const modified: DiffPreviewLine[] = []
  const inlineLines: DiffPreviewLine[] = []
  const headers = hasDiffHeaders(lines)
  let originalNumber = 1
  let modifiedNumber = 1
  let index = 0

  while (index < lines.length) {
    const raw = lines[index]
    if (headers && ['diff ', 'index ', '--- ', '+++ '].some(prefix => raw.startsWith(prefix))) {
      index++
      continue
    }
    if (raw.startsWith('@@')) {
      const start = readHunkStart(raw)
      if (start) {
        originalNumber = start.original
        modifiedNumber = start.modified
      }
      const originalHunk = makeLine(raw, 'hunk', `original-hunk-${index}`, '')
      const modifiedHunk = makeLine(raw, 'hunk', `modified-hunk-${index}`, '')
      original.push(originalHunk)
      modified.push(modifiedHunk)
      inlineLines.push({ ...modifiedHunk, key: `inline-hunk-${index}` })
      index++
      continue
    }

    if (isRemovedLine(raw) || isAddedLine(raw)) {
      const removed: string[] = []
      const added: string[] = []
      const blockStart = index
      while (index < lines.length && (isRemovedLine(lines[index]) || isAddedLine(lines[index]))) {
        if (isRemovedLine(lines[index]))
          removed.push(normalizeDiffBody(lines[index].slice(1), headers))
        else
          added.push(normalizeDiffBody(lines[index].slice(1), headers))
        index++
      }
      const count = Math.max(removed.length, added.length)
      for (let offset = 0; offset < count; offset++) {
        const removedLine = offset < removed.length
          ? makeLine(removed[offset], 'removed', `original-removed-${blockStart}-${offset}`, originalNumber++, true)
          : makeLine('', 'spacer', `original-spacer-${blockStart}-${offset}`, '')
        const addedLine = offset < added.length
          ? makeLine(added[offset], 'added', `modified-added-${blockStart}-${offset}`, modifiedNumber++, true)
          : makeLine('', 'spacer', `modified-spacer-${blockStart}-${offset}`, '')
        original.push(removedLine)
        modified.push(addedLine)
        if (removedLine.kind !== 'spacer')
          inlineLines.push({ ...removedLine, key: `inline-${removedLine.key}` })
        if (addedLine.kind !== 'spacer')
          inlineLines.push({ ...addedLine, key: `inline-${addedLine.key}` })
      }
      continue
    }

    const code = headers && raw.startsWith(' ') ? raw.slice(1) : raw
    const originalLine = makeLine(code, 'context', `original-context-${index}`, originalNumber++)
    const modifiedLine = makeLine(code, 'context', `modified-context-${index}`, modifiedNumber++)
    original.push(originalLine)
    modified.push(modifiedLine)
    inlineLines.push({ ...modifiedLine, key: `inline-context-${index}` })
    index++
  }

  return inline
    ? [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines: inlineLines }]
    : [
        { key: 'original', className: 'markstream-pre__diff-pane--original', lines: original },
        { key: 'modified', className: 'markstream-pre__diff-pane--modified', lines: modified },
      ]
}

function collapsePanes(
  panes: DiffPreviewPane[],
  value: BuildDiffPreviewOptions['hideUnchangedRegions'],
) {
  if (!value || panes.length < 1 || panes.length > 2)
    return panes
  if (panes.length === 2 && panes[0].lines.length !== panes[1].lines.length)
    return panes

  const options = value === true ? {} : value
  if (options.enabled === false)
    return panes
  const contextLineCount = Math.max(0, Math.floor(options.contextLineCount ?? 2))
  const minimumLineCount = Math.max(1, Math.floor(options.minimumLineCount ?? 4))
  const original = panes[0].lines
  const modified = panes[1]?.lines
  const isMatchingContext = (line: number) => !modified
    || (modified[line].kind === 'context' && original[line].code === modified[line].code)
  const ranges: Array<{ end: number, start: number }> = []
  let index = 0

  while (index < original.length) {
    const start = index
    while (
      index < original.length
      && original[index].kind === 'context'
      && isMatchingContext(index)
    ) {
      index++
    }
    const end = index
    if (end - start >= minimumLineCount) {
      const hiddenStart = start + (start === 0 ? 0 : contextLineCount)
      const hiddenEnd = end - (end === original.length ? 0 : contextLineCount)
      if (hiddenEnd - hiddenStart >= minimumLineCount)
        ranges.push({ start: hiddenStart, end: hiddenEnd })
    }
    if (index === start)
      index++
  }

  if (!ranges.length)
    return panes

  return panes.map((pane, paneIndex) => {
    const lines: DiffPreviewLine[] = []
    let sourceIndex = 0
    for (const range of ranges) {
      lines.push(...pane.lines.slice(sourceIndex, range.start))
      lines.push(makeLine(
        paneIndex === 0 || panes.length === 1 ? `${range.end - range.start} unmodified lines` : '',
        'collapsed',
        `${pane.key}-collapsed-${range.start}-${range.end}`,
        '',
      ))
      sourceIndex = range.end
    }
    lines.push(...pane.lines.slice(sourceIndex))
    return { ...pane, lines }
  })
}

export function buildDiffPreviewPanes(options: BuildDiffPreviewOptions): DiffPreviewPane[] {
  const loading = options.loading === true
  const inline = options.inline === true
  const original = splitSource(options.originalCode, loading)
  const modified = splitSource(options.updatedCode, loading)
  const hasSourcePair = options.originalCode != null || options.updatedCode != null

  let panes: DiffPreviewPane[]
  if (hasSourcePair) {
    panes = inline
      ? [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines: buildInlineSourceLines(original, modified) }]
      : buildSourcePanes(original, modified)
  }
  else {
    const patchLines = splitSource(options.code, loading)
    const language = normalizeLanguage(options.language)
    const firstLine = String(options.raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
    const explicitDiff = language === 'diff' || /^`{3,}\s*diff(?:\s|$)|^~{3,}\s*diff(?:\s|$)/.test(firstLine)
    const hasPatch = patchLines.some(isRemovedLine) && patchLines.some(isAddedLine)
    if (!hasPatch && !explicitDiff)
      return []
    panes = buildPatchPanes(patchLines, inline)
  }

  return collapsePanes(panes, options.hideUnchangedRegions)
}
