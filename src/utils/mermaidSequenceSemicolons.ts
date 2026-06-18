import { getMermaidDiagramKind } from './diagramHeight'

const SEMICOLON_ENTITY = '#59;'

function isEscapedEntityBefore(text: string, index: number) {
  return /(?:&#\d+|#\d+|&[a-z]+)$/i.test(text.slice(Math.max(0, index - 12), index))
}

function hasSequenceArrow(text: string) {
  return text.includes('->')
    || text.includes('-->')
    || text.includes('->>')
    || text.includes('-->>')
    || text.includes('-x')
    || text.includes('--x')
    || text.includes('-)')
    || text.includes('--)')
    || text.includes('-+')
    || text.includes('--+')
}

function startsSequenceMessage(text: string) {
  const segment = text.split(';', 1)[0]
  const colonIndex = segment.indexOf(':')
  return colonIndex > 0 && hasSequenceArrow(segment.slice(0, colonIndex))
}

function startsSequenceStatement(text: string) {
  const source = text.trimStart()
  return /^(?:accDescr|accTitle|activate|actor|and|alt|autonumber|box|break|critical|create\s+(?:actor|participant)|deactivate|destroy|else|end|link|links|loop|Note|opt|option|par|participant|properties|rect)\b/i.test(source)
    || startsSequenceMessage(source)
}

function isSequenceTextLine(line: string, colonIndex: number) {
  const prefix = line.slice(0, colonIndex)
  return /^\s*Note\b/i.test(prefix)
    || hasSequenceArrow(prefix)
}

function escapeTextSemicolons(text: string) {
  let escaped = ''
  let changed = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char !== ';' || isEscapedEntityBefore(text, index)) {
      escaped += char
      continue
    }

    if (startsSequenceStatement(text.slice(index + 1))) {
      escaped += char
      continue
    }

    escaped += SEMICOLON_ENTITY
    changed = true
  }

  return changed ? escaped : text
}

function escapeLine(line: string) {
  if (!line.includes(';'))
    return line

  const colonIndex = line.indexOf(':')
  if (colonIndex === -1 || !isSequenceTextLine(line, colonIndex))
    return line

  const beforeText = line.slice(0, colonIndex + 1)
  const text = line.slice(colonIndex + 1)
  const escapedText = escapeTextSemicolons(text)
  return escapedText === text ? line : `${beforeText}${escapedText}`
}

export function escapeSequenceTextSemicolons(code: string) {
  if (getMermaidDiagramKind(code) !== 'sequencediagram')
    return code

  const parts = code.split(/(\r\n|\n|\r)/)
  let changed = false

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    const escapedLine = escapeLine(line)
    if (escapedLine !== line) {
      parts[index] = escapedLine
      changed = true
    }
  }

  return changed ? parts.join('') : code
}
