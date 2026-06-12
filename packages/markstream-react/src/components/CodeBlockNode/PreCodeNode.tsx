import type { PreCodeNodeProps } from '../../types/component-props'
import React, { useMemo } from 'react'

type DiffPreviewLineKind = 'context' | 'removed' | 'added' | 'hunk'

interface DiffPreviewLine {
  code: string
  kind: DiffPreviewLineKind
  key: string
  number: number | string
}

interface DiffPreviewPane {
  className: string
  key: string
  lines: DiffPreviewLine[]
}

function normalizeLanguage(raw: unknown) {
  const head = String(String(raw ?? '').split(/\s+/g)[0] ?? '')
    .split(':')[0]
    .toLowerCase()
  const safe = head.replace(/[^\w-]/g, '')
  return safe || 'plaintext'
}

function splitLines(source: unknown) {
  return String(source ?? '').split(/\r\n|\n|\r/)
}

function isRemovedDiffLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function isAddedDiffLine(line: string) {
  return line.startsWith('+') && !line.startsWith('+++')
}

function toDiffLine(code: string, kind: DiffPreviewLineKind, key: string, number: number | string): DiffPreviewLine {
  const empty = String(code ?? '').trim().length === 0
  return {
    code,
    kind: empty && kind !== 'hunk' ? 'context' : kind,
    key,
    number,
  }
}

function buildDiffPanes(node: PreCodeNodeProps['node'], inline = false): DiffPreviewPane[] {
  const patchLines = splitLines((node as any)?.code)
  const hasPatchLines = patchLines.some(line => isRemovedDiffLine(line) || isAddedDiffLine(line))

  if (!hasPatchLines && ((node as any)?.originalCode != null || (node as any)?.updatedCode != null)) {
    const original = splitLines((node as any)?.originalCode)
    const modified = splitLines((node as any)?.updatedCode)

    if (inline) {
      const count = Math.max(original.length, modified.length)
      const lines: DiffPreviewLine[] = []
      for (let index = 0; index < count; index += 1) {
        const before = original[index] ?? ''
        const after = modified[index] ?? ''
        if (before === after) {
          lines.push(toDiffLine(after, 'context', `inline-context-${index}`, index + 1))
        }
        else {
          if (index < original.length)
            lines.push(toDiffLine(before, 'removed', `inline-removed-${index}`, index + 1))
          if (index < modified.length)
            lines.push(toDiffLine(after, 'added', `inline-added-${index}`, index + 1))
        }
      }
      return [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines }]
    }

    return [
      {
        key: 'original',
        className: 'markstream-pre__diff-pane--original',
        lines: original.map((line, index) => toDiffLine(line, modified[index] === line ? 'context' : 'removed', `original-${index}`, index + 1)),
      },
      {
        key: 'modified',
        className: 'markstream-pre__diff-pane--modified',
        lines: modified.map((line, index) => toDiffLine(line, original[index] === line ? 'context' : 'added', `modified-${index}`, index + 1)),
      },
    ]
  }

  if (inline) {
    let originalLine = 1
    let modifiedLine = 1
    const lines = patchLines.map((raw, index) => {
      if (raw.startsWith('@@'))
        return toDiffLine(raw, 'hunk', `inline-hunk-${index}`, '')
      if (isRemovedDiffLine(raw))
        return toDiffLine(raw.slice(1), 'removed', `inline-removed-${index}`, originalLine++)
      if (isAddedDiffLine(raw))
        return toDiffLine(raw.slice(1), 'added', `inline-added-${index}`, modifiedLine++)

      const code = raw.startsWith(' ') ? raw.slice(1) : raw
      originalLine += 1
      return toDiffLine(code, 'context', `inline-context-${index}`, modifiedLine++)
    })
    return [{ key: 'inline', className: 'markstream-pre__diff-pane--inline', lines }]
  }

  const original: DiffPreviewLine[] = []
  const modified: DiffPreviewLine[] = []
  let originalLine = 1
  let modifiedLine = 1

  for (const [index, raw] of patchLines.entries()) {
    if (raw.startsWith('@@')) {
      original.push(toDiffLine(raw, 'hunk', `original-hunk-${index}`, ''))
      modified.push(toDiffLine(raw, 'hunk', `modified-hunk-${index}`, ''))
    }
    else if (isRemovedDiffLine(raw)) {
      original.push(toDiffLine(raw.slice(1), 'removed', `original-removed-${index}`, originalLine++))
    }
    else if (isAddedDiffLine(raw)) {
      modified.push(toDiffLine(raw.slice(1), 'added', `modified-added-${index}`, modifiedLine++))
    }
    else {
      const code = raw.startsWith(' ') ? raw.slice(1) : raw
      original.push(toDiffLine(code, 'context', `original-context-${index}`, originalLine++))
      modified.push(toDiffLine(code, 'context', `modified-context-${index}`, modifiedLine++))
    }
  }

  return [
    { key: 'original', className: 'markstream-pre__diff-pane--original', lines: original },
    { key: 'modified', className: 'markstream-pre__diff-pane--modified', lines: modified },
  ]
}

function getDisplayCode(node: PreCodeNodeProps['node']) {
  if ((node as any)?.diff === true)
    return String((node as any)?.code ?? '')
  const value = String((node as any)?.code ?? '')
  return (node as any)?.loading === true ? value : value.replace(/\r\n$|\n$|\r$/, '')
}

export function PreCodeNode({ node, className, diffInline, showLineNumbers, style }: PreCodeNodeProps) {
  const normalizedLanguage = useMemo(() => normalizeLanguage((node as any)?.language), [node])
  const languageClass = `language-${normalizedLanguage}`
  const ariaLabel = normalizedLanguage ? `Code block: ${normalizedLanguage}` : 'Code block'
  const isDiffPreview = showLineNumbers === true && (node as any)?.diff === true
  const diffPanes = useMemo(() => isDiffPreview ? buildDiffPanes(node, diffInline === true) : [], [diffInline, isDiffPreview, node])
  const displayCode = useMemo(() => getDisplayCode(node), [node])

  return (
    <pre
      className={[
        languageClass,
        className,
        showLineNumbers ? 'markstream-pre--line-numbers' : '',
        isDiffPreview ? 'markstream-pre--diff-preview' : '',
        isDiffPreview && diffInline ? 'markstream-pre--diff-inline' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-busy={(node as any)?.loading === true}
      aria-label={ariaLabel}
      data-language={normalizedLanguage}
      data-markstream-line-numbers={showLineNumbers ? '1' : undefined}
      data-markstream-pre="1"
      tabIndex={0}
    >
      {isDiffPreview
        ? (
            <code translate="no" className="markstream-pre__diff-code">
              {diffPanes.map(pane => (
                <span key={pane.key} className={['markstream-pre__diff-pane', pane.className].join(' ')}>
                  {pane.lines.map(line => (
                    <span key={line.key} className={['markstream-pre__diff-line', `markstream-pre__diff-line--${line.kind}`, line.code.trim() ? '' : 'markstream-pre__diff-line--empty'].filter(Boolean).join(' ')}>
                      <span className="markstream-pre__diff-rail" aria-hidden="true" />
                      <span className="markstream-pre__diff-number" aria-hidden="true">{line.number}</span>
                      <span className="markstream-pre__diff-content">
                        <span className="markstream-pre__diff-content-inner">{line.code}</span>
                      </span>
                    </span>
                  ))}
                </span>
              ))}
            </code>
          )
        : <code translate="no">{displayCode}</code>}
    </pre>
  )
}
