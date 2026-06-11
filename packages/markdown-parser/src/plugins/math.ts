import type { MathOptions } from '../config'
import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

import findMatchingClose from '../findMatchingClose'
import { ESCAPED_TEX_BRACE_COMMANDS, isMathLike } from './isMathLike'

interface MathInlineState {
  env?: Record<string, unknown>
  pending?: string
  pos: number
  push: (type: string, tag?: string, nesting?: number) => MarkdownToken
  src: string
}

interface MathBlockState {
  bMarks: number[]
  eMarks: number[]
  env?: Record<string, unknown>
  line: number
  push: (type: string, tag?: string, nesting?: number) => MarkdownToken
  src: string
  tShift: number[]
  tokens: MarkdownToken[]
}

type TolerantMathToken = MarkdownToken & { tolerantBoundary?: boolean }

export const TOLERANT_BOUNDARY_SYNTHETIC_PARAGRAPH_META = '__markstreamTolerantBoundarySyntheticParagraph'
export const TOLERANT_BOUNDARY_STREAM_CACHE_KEY_ENV = '__markstreamTolerantBoundaryStreamCacheKey'
const MARKSTREAM_MATH_PLUGIN_APPLIED = '__markstreamMathPluginApplied'

export function hasMarkstreamMathPlugin(md: MarkdownIt) {
  return !!(md as unknown as Record<string, unknown>)[MARKSTREAM_MATH_PLUGIN_APPLIED]
}

function markMarkstreamMathPluginApplied(md: MarkdownIt) {
  ;(md as unknown as Record<string, unknown>)[MARKSTREAM_MATH_PLUGIN_APPLIED] = true
}

// Heuristic to decide whether a piece of text is likely math.
// Matches common TeX commands, math operators, function-call patterns like f(x),
// superscripts/subscripts, and common math words.
// Common TeX formatting commands that take a brace argument, e.g. \boldsymbol{...}
// Keep this list in a single constant so it's easy to extend/test.

// Precompute an escaped, |-joined string of TEX brace commands so we don't
// rebuild it on every call to `isMathLike`.

// Common KaTeX/TeX command names that might lose their leading backslash.
// Keep this list conservative to avoid false-positives in normal text.
export const KATEX_COMMANDS = [
  'ldots',
  'cdots',
  'quad',
  'in',
  'displaystyle',
  'int_',
  'lim',
  'lim_',
  'ce',
  'pu',
  'end',
  'infty',
  'perp',
  'mid',
  'operatorname',
  'to',
  'rightarrow',
  'leftarrow',
  'math',
  'mathrm',
  'mathit',
  'mathbb',
  'mathcal',
  'mathfrak',
  'implies',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'lambda',
  'sum',
  'sum_',
  'prod',
  'sqrt',
  'fbox',
  'boxed',
  'color',
  'rule',
  'edef',
  'fcolorbox',
  'hline',
  'hdashline',
  'cdot',
  'times',
  'pm',
  'le',
  'ge',
  'neq',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'frac',
  'text',
  'left',
  'right',
]

// 允许不含空格直接跟下面的公式
const ANY_COMMANDS = [
  'cdot',
  'mathbf{',
  'partial',
  'mu_{',
]

// Precompute escaped KATEX commands and default regex used by
// `normalizeStandaloneBackslashT` when no custom commands are provided.
// Sort commands by length (desc) before joining so longer commands like
// 'operatorname' are preferred over shorter substrings like 'to'. This
// avoids accidental partial matches when building the regex.
export const ESCAPED_KATEX_COMMANDS = KATEX_COMMANDS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(c => c.replace(/[.*+?^${}()|[\\]\\\]/g, '\\$&'))
  .join('|')
const CONTROL_CHARS_CLASS = '[\t\r\b\f\v]'
export const ESCAPED_MKATWX_COMMANDS = new RegExp(`([^\\\\])(${ANY_COMMANDS.map(c => c).join('|')})+`, 'g')

// Precompiled helpers reused by normalization
const SPAN_CURLY_RE = /span\{([^}]+)\}/
const OPERATORNAME_SPAN_RE = /\\operatorname\{span\}\{((?:[^{}]|\{[^}]*\})+)\}/
const SINGLE_BACKSLASH_NEWLINE_RE = /(^|[^\\])\\\r?\n/g
const ENDING_SINGLE_BACKSLASH_RE = /(^|[^\\])\\$/g

// Cache for dynamically built regexes depending on commands list
// Avoid lookbehind; capture possible prefix so replacements can preserve it.
// Pattern groups:
// 1 - control char (e.g. '\t')
// 2 - optional prefix char (start or a non-word/non-backslash)
// 3 - command name
const DEFAULT_MATH_RE = new RegExp(`(${CONTROL_CHARS_CLASS})|(${ESCAPED_KATEX_COMMANDS})\\b`, 'g')
const MATH_RE_CACHE = new Map<string, RegExp>()
const BRACE_CMD_RE_CACHE = new Map<string, RegExp>()

function getMathRegex(commands: ReadonlyArray<string> | undefined) {
  if (!commands)
    return DEFAULT_MATH_RE
  const arr = [...commands]
  arr.sort((a, b) => b.length - a.length)
  const key = arr.join('\u0001')
  const cached = MATH_RE_CACHE.get(key)
  if (cached)
    return cached
  const commandPattern = `(?:${arr.map(c => c.replace(/[.*+?^${}()|[\\]\\"\]/g, '\\$&')).join('|')})`
  // Use non-lookbehind prefix but capture the prefix so replacement can
  // re-insert it. Groups: (control) | (prefix)(command)
  const re = new RegExp(`(${CONTROL_CHARS_CLASS})|(${commandPattern})\\b`, 'g')
  MATH_RE_CACHE.set(key, re)
  return re
}

function getBraceCmdRegex(useDefault: boolean, commands: ReadonlyArray<string> | undefined) {
  const arr = useDefault ? [] : [...(commands ?? [])]
  if (!useDefault)
    arr.sort((a, b) => b.length - a.length)
  const key = useDefault ? '__default__' : arr.join('\u0001')
  const cached = BRACE_CMD_RE_CACHE.get(key)
  if (cached)
    return cached
  const braceEscaped = useDefault
    ? [ESCAPED_TEX_BRACE_COMMANDS, ESCAPED_KATEX_COMMANDS].filter(Boolean).join('|')
    : [
        arr.map(c => c.replace(/[.*+?^${}()|[\\]\\\]/g, '\\$&')).join('|'),
        ESCAPED_TEX_BRACE_COMMANDS,
      ].filter(Boolean).join('|')
  const re = new RegExp(`(^|[^\\\\\\w])(${braceEscaped})\\s*\\{`, 'g')
  BRACE_CMD_RE_CACHE.set(key, re)
  return re
}

// Hoisted map of control characters -> escaped letter (e.g. '\t' -> 't').
// Kept at module scope to avoid recreating on every normalization call.
const CONTROL_MAP: Record<string, string> = {
  '\t': 't',
  '\r': 'r',
  '\b': 'b',
  '\f': 'f',
  '\v': 'v',
}

function countUnescapedStrong(s: string) {
  const re = /(^|[^\\])(__|\*\*)/g
  let m: RegExpExecArray | null
  let c = 0
  // eslint-disable-next-line unused-imports/no-unused-vars
  while ((m = re.exec(s)) !== null) {
    c++
  }
  return c
}

function findLastUnescapedStrongMarker(s: string) {
  const re = /(^|[^\\])(__|\*\*)/g
  let m: RegExpExecArray | null
  let last: { marker: string, index: number } | null = null

  while ((m = re.exec(s)) !== null) {
    const marker = m[2]
    const index = m.index + (m[1]?.length ?? 0)
    last = { marker, index }
  }
  return last
}

export function normalizeStandaloneBackslashT(s: string, opts?: MathOptions) {
  const commands = opts?.commands ?? KATEX_COMMANDS
  const escapeExclamation = opts?.escapeExclamation ?? true

  const useDefault = opts?.commands == null

  // Build or reuse regex: match control chars or unescaped command words.
  const re = getMathRegex(useDefault ? undefined : commands)

  // Replace callback receives groups: (match, controlChar, cmd)
  let out = s.replace(re, (m: string, control?: string, cmd?: string, offset?: number, str?: string) => {
    if (control !== undefined && CONTROL_MAP[control] !== undefined)
      return `\\${CONTROL_MAP[control]}`
    if (cmd && commands.includes(cmd)) {
      // Ensure we are not inside a word or escaped by a backslash
      const prev = (str && typeof offset === 'number') ? str[offset - 1] : undefined
      if (prev === '\\' || (prev && /\w/.test(prev)))
        return m
      return `\\${cmd}`
    }
    return m
  })

  // Escape standalone '!' but don't double-escape already escaped ones.
  if (escapeExclamation)
    out = out.replace(/(^|[^\\])!/g, '$1\\!')

  // Final pass: some TeX command names take a brace argument and may have
  // lost their leading backslash, e.g. "operatorname{span}". Ensure we
  // restore a backslash before known brace-taking commands when they are
  // followed by '{' and are not already escaped.
  // Use default escaped list when possible. Include TEX_BRACE_COMMANDS so
  // known brace-taking TeX commands (e.g. `text`, `boldsymbol`) are also
  // restored when their leading backslash was lost.
  let result = out
  const braceCmdRe = getBraceCmdRegex(useDefault, useDefault ? undefined : commands)
  result = result.replace(braceCmdRe, (_m: string, p1: string, p2: string) => `${p1}\\${p2}{`)
  result = result.replace(SPAN_CURLY_RE, 'span\\{$1\\}')
    .replace(OPERATORNAME_SPAN_RE, '\\operatorname{span}\\{$1\\}')

  // If a single backslash appears immediately before a newline (e.g. "... 8 \n5..."),
  // it's likely intended as a LaTeX linebreak (`\\`). Double it, but avoid
  // changing already escaped `\\` sequences.
  // Match a single backslash not preceded by another backslash, followed by an optional CR and a LF.
  result = result.replace(SINGLE_BACKSLASH_NEWLINE_RE, '$1\\\\\n')

  // If the string ends with a single backslash (no trailing newline), double it.
  result = result.replace(ENDING_SINGLE_BACKSLASH_RE, '$1\\\\')
  // 将 \n\w+ 转义 \\n\w+
  // result = result.replace(/ \n(\w)/,' \\n$1')
  result = result.replace(ESCAPED_MKATWX_COMMANDS, '$1\\$2')

  return result
}

function isPlainBracketMathLike(content: string) {
  const stripped = content.trim()
  if (!isMathLike(stripped))
    return false

  // Avoid false positives for JSON / structured data inside brackets.
  // Example:
  // [
  //   { "a": 1 }
  // ]
  // Quotes + colon is a strong indicator it's not math.
  if (/"[^"\n]{1,80}"\s*:\s*/.test(stripped))
    return false

  const hasStrongSignal = /\\[a-z]+/i.test(stripped)
    || /[=+*/^<>]|\\times|\\pm|\\cdot|\\le|\\ge|\\neq/.test(stripped)
    || /[_^]/.test(stripped)

  // In non-strict mode, plain `[...]` is allowed as a display-math delimiter.
  // During streaming, incomplete links like `[label]` may transiently appear
  // as a full line before the following `(` arrives. Natural-language labels
  // often use spaced hyphens ("foo - bar"), which should not be treated as math.
  if (!hasStrongSignal && /\s-\s/.test(stripped))
    return false

  return true
}

function buildCodeSpanRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let i = 0

  while (i < src.length) {
    if (src[i] !== '`') {
      i++
      continue
    }

    const openStart = i
    let openLen = 1
    while (openStart + openLen < src.length && src[openStart + openLen] === '`')
      openLen++

    let j = openStart + openLen
    let closeStart = -1
    while (j < src.length) {
      if (src[j] !== '`') {
        j++
        continue
      }

      let runLen = 1
      while (j + runLen < src.length && src[j + runLen] === '`')
        runLen++

      if (runLen === openLen) {
        closeStart = j
        break
      }

      j += runLen
    }

    if (closeStart !== -1) {
      ranges.push([openStart, closeStart + openLen])
      i = closeStart + openLen
      continue
    }

    i = openStart + openLen
  }

  return ranges
}

function findRangeAt(ranges: Array<[number, number]>, index: number): [number, number] | null {
  for (const range of ranges) {
    if (index >= range[0] && index < range[1])
      return range
  }
  return null
}

function buildImageRanges(src: string, allowIncomplete = false): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let i = 0
  while (i < src.length - 1) {
    if (src[i] === '!' && src[i + 1] === '[') {
      const start = i
      let j = i + 2
      let labelDepth = 1
      while (j < src.length && labelDepth > 0) {
        if (src[j] === '\\' && j + 1 < src.length) {
          j += 2
          continue
        }
        if (src[j] === '[')
          labelDepth++
        else if (src[j] === ']')
          labelDepth--
        j++
      }
      if (labelDepth === 0 && j < src.length && src[j] === '(') {
        let k = j + 1
        let depth = 1
        while (k < src.length && depth > 0) {
          if (src[k] === '\\' && k + 1 < src.length) {
            k += 2
            continue
          }
          if (src[k] === '(')
            depth++
          else if (src[k] === ')')
            depth--
          k++
        }
        if (depth === 0) {
          ranges.push([start, k])
          i = k
          continue
        }
        if (allowIncomplete) {
          ranges.push([start, src.length])
          i = src.length
          continue
        }
      }
    }
    i++
  }
  return ranges
}

function isEscapedAt(src: string, index: number) {
  let cursor = index - 1
  let backslashes = 0
  while (cursor >= 0 && src[cursor] === '\\') {
    backslashes++
    cursor--
  }
  return backslashes % 2 === 1
}

function findNextUnescapedDollar(src: string, startIdx: number) {
  let searchPos = startIdx

  while (searchPos < src.length) {
    const index = src.indexOf('$', searchPos)
    if (index === -1)
      return -1
    if (isEscapedAt(src, index)) {
      searchPos = index + 1
      continue
    }
    return index
  }

  return -1
}

function findSingleDollarClose(src: string, startIdx: number) {
  let searchPos = startIdx

  while (searchPos < src.length) {
    const index = findNextUnescapedDollar(src, searchPos)
    if (index === -1)
      return -1
    if ((index > 0 && src[index - 1] === '$') || (index + 1 < src.length && src[index + 1] === '$')) {
      searchPos = index + 1
      continue
    }
    return index
  }

  return -1
}

function findUnescapedDelimiter(
  src: string,
  delimiter: string,
  startIdx = 0,
  excludedRanges: Array<[number, number]> = [],
) {
  let searchPos = Math.max(0, startIdx)

  while (searchPos < src.length) {
    const index = src.indexOf(delimiter, searchPos)
    if (index === -1)
      return -1

    const excludedRange = findRangeAt(excludedRanges, index)
    if (excludedRange) {
      searchPos = Math.max(index + Math.max(1, delimiter.length), excludedRange[1])
      continue
    }

    if (!isEscapedAt(src, index))
      return index

    searchPos = index + Math.max(1, delimiter.length)
  }

  return -1
}

function countUnescapedDelimiter(
  src: string,
  delimiter: string,
  startIdx = 0,
  endIdx = src.length,
  excludedRanges: Array<[number, number]> = [],
) {
  let count = 0
  let searchPos = Math.max(0, startIdx)
  const end = Math.min(src.length, Math.max(0, endIdx))

  while (searchPos < end) {
    const index = findUnescapedDelimiter(src, delimiter, searchPos, excludedRanges)
    if (index === -1 || index >= end)
      break

    count++
    searchPos = index + delimiter.length
  }

  return count
}

function isPlainBracketFallbackCloseMathContinuation(tail: string) {
  const stripped = String(tail ?? '').trimStart()
  if (!stripped)
    return false

  // Lines like `] + x = 0`, `] \cdot x`, or `]}` are likely still math
  // content, so the leading `]` should not be treated as the malformed close
  // for a non-strict `\[` block.
  const first = stripped[0]
  if (first === ']' || first === ')' || first === '}')
    return true

  if (/^\\[a-z]+/i.test(stripped))
    return true

  if (/^[+*/^_=<>]\s*(?:[a-z0-9\\({]|$)/i.test(stripped))
    return true

  // `] - x` can be math continuation, but `] - where ...` is normal suffix.
  // Keep hyphen conservative: treat it as math only when the right side is a
  // short variable/number/TeX command, not a prose word.
  return /^-\s*(?:[a-z](?![a-z0-9])|[\d({]|\\[a-z]+|$)/i.test(stripped)
}

function findPlainBracketFallbackClose(src: string) {
  let index = 0
  while (index < src.length && (src[index] === ' ' || src[index] === '\t'))
    index++

  if (src[index] !== ']')
    return -1

  if (isEscapedAt(src, index))
    return -1

  const tail = src.slice(index + 1).trimStart()
  if (!tail)
    return index

  // Non-strict `\[` accepts a plain `]` close for malformed LLM output:
  //
  //   \[
  //   x + y
  //   ] where ...
  //
  // But a math line may also legitimately start with `]` as content:
  //
  //   \[
  //   ] + x = 0
  //   \]
  //
  // Treat the plain `]` as a fallback close only when the tail does not look
  // like a math continuation.
  if (isPlainBracketFallbackCloseMathContinuation(tail))
    return -1

  return index
}

const TOLERANT_VALUE_ATOM = String.raw`(?:[a-z]|\d+(?:\.\d+)?|\\[a-z]+)`
const TOLERANT_BOUNDARY_BEFORE = String.raw`(?:^|[^\p{L}\p{N}\\])`
const TOLERANT_BOUNDARY_AFTER = String.raw`(?:$|[^\p{L}\p{N}])`
const TOLERANT_OPERATOR = String.raw`(?:[=+*/<>]|-(?!\s*\p{L}{2,}\b))`
const TOLERANT_FORMULA_OPERATOR_SIGNAL_RE = new RegExp(
  String.raw`${TOLERANT_BOUNDARY_BEFORE}${TOLERANT_VALUE_ATOM}\s*${TOLERANT_OPERATOR}\s*${TOLERANT_VALUE_ATOM}${TOLERANT_BOUNDARY_AFTER}`,
  'iu',
)
// eslint-disable-next-line regexp/no-useless-assertions
const TOLERANT_ABSOLUTE_VALUE_SIGNAL_RE = /\|[^|\n]{1,160}\|\s*(?:[-=+*/<>]|\\(?:le|ge|neq|approx|sim)\b)|(?:[-=+*/<>]|\\(?:le|ge|neq|approx|sim)\b)\s*\|[^|\n]{1,160}\|/u

function hasTolerantFormulaOperatorSignal(content: string) {
  return TOLERANT_FORMULA_OPERATOR_SIGNAL_RE.test(content)
}

function hasTolerantAbsoluteValueSignal(content: string) {
  return TOLERANT_ABSOLUTE_VALUE_SIGNAL_RE.test(content)
}

function isLikelyClosedTolerantSingleAtomMath(content: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped || stripped.length > 80)
    return false

  // Tolerant same-line display repair should still accept closed blocks like:
  //
  //   prefix $
  //   x
  //   $ suffix
  //
  // But keep this deliberately narrower than `isMathLike()` so ordinary prose
  // words such as "hello" do not become display math merely because a later
  // unrelated line contains "$".
  return /^(?:[a-z]|pi)$/i.test(stripped)
    || /^\d+(?:\.\d+)?$/.test(stripped)
    || /^(?:[A-Z][a-z]?(?:_\{?\d+\}?|\^\{?\d+\}?)?)+$/.test(stripped)
}

function isLikelySpacedSuperSubscriptMath(content: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped || stripped.length > 400)
    return false
  return /(?:^|[^\p{L}\p{N}\\])(?:[a-z]|\\[a-z]+)\s*[_^]\s*(?:\{[^{}\n]{1,120}\}|[a-z0-9\\]+)(?:$|[^\p{L}\p{N}])/iu.test(stripped)
}
function isLikelyTolerantExplicitMathBlockContent(content: string, closed: boolean) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false

  // Tolerant same-line boundaries are weaker than real line-start `$` / `\[`.
  // Require a concrete math signal so ordinary prose ending with `$` does not
  // split into synthetic paragraph + math_block + paragraph.
  return /\\[a-z]+/i.test(stripped)
    || /[a-z0-9\\][_^][a-z0-9\\{]/i.test(stripped)
    || /\\(?:times|pm|cdot|le|ge|neq)\b/.test(stripped)
    || hasTolerantFormulaOperatorSignal(stripped)
    || hasTolerantAbsoluteValueSignal(stripped)
    || (closed && isLikelyClosedTolerantSingleAtomMath(stripped))
    || (closed && isLikelySpacedSuperSubscriptMath(stripped))
}

function isInsideCodeSpanOrUnclosedTail(src: string, index: number) {
  let cursor = 0

  while (cursor < src.length) {
    if (src[cursor] !== '`' || isEscapedAt(src, cursor)) {
      cursor++
      continue
    }

    const openStart = cursor
    let openLen = 1
    while (openStart + openLen < src.length && src[openStart + openLen] === '`')
      openLen++

    let search = openStart + openLen
    let closeStart = -1

    while (search < src.length) {
      if (src[search] !== '`') {
        search++
        continue
      }

      const runStart = search
      let runLen = 1
      while (runStart + runLen < src.length && src[runStart + runLen] === '`')
        runLen++

      if (runLen === openLen) {
        closeStart = runStart
        break
      }

      search = runStart + runLen
    }

    if (closeStart === -1)
      return index >= openStart

    if (index >= openStart && index < closeStart + openLen)
      return true

    cursor = closeStart + openLen
  }

  return false
}

const MAX_TOLERANT_BOUNDARY_LINES = 80
const MAX_TOLERANT_BOUNDARY_CHARS = 20000
const MAX_TOLERANT_BOUNDARY_CACHE_SCAN_CHARS = MAX_TOLERANT_BOUNDARY_CHARS + 8192

function isSpaceOrTab(ch?: string) {
  return ch === ' ' || ch === '\t'
}

function splitTolerantBoundaryBlockquotePrefix(line: string) {
  const source = String(line ?? '')
  let cursor = 0
  let contentStart = 0

  while (cursor < source.length) {
    const markerStart = cursor
    let spaces = 0

    // CommonMark allows up to 3 spaces before a blockquote marker.
    while (spaces < 4 && isSpaceOrTab(source[cursor])) {
      cursor++
      spaces++
    }

    if (spaces >= 4 || source[cursor] !== '>') {
      cursor = markerStart
      break
    }

    cursor++

    // The optional post-marker space belongs to the blockquote prefix.
    if (isSpaceOrTab(source[cursor]))
      cursor++

    contentStart = cursor
  }

  return {
    prefix: source.slice(0, contentStart),
    content: source.slice(contentStart),
  }
}

interface TolerantBoundaryScanContext {
  blockquotePrefix: string
  listContinuationIndent: number
}

interface TolerantBoundaryScanLine {
  matched: boolean
  content: string
  contentOffset: number
}

function parseTolerantBoundaryListContinuationIndent(line: string) {
  const source = String(line ?? '')
  let index = 0
  let spaces = 0

  while (spaces < 4 && isSpaceOrTab(source[index])) {
    index++
    spaces++
  }

  if (spaces >= 4)
    return 0

  const markerStart = index
  const first = source[index]

  if (first === '-' || first === '+' || first === '*') {
    index++
    if (!isSpaceOrTab(source[index]))
      return 0

    while (isSpaceOrTab(source[index]))
      index++

    return index > markerStart + 1 ? index : 0
  }

  if (!isAsciiDigit(first))
    return 0

  while (isAsciiDigit(source[index]))
    index++

  if (source[index] !== '.' && source[index] !== ')')
    return 0

  index++
  if (!isSpaceOrTab(source[index]))
    return 0

  while (isSpaceOrTab(source[index]))
    index++

  return index
}

function buildTolerantBoundaryScanContext(openingContentLine: string, blockquotePrefix: string): TolerantBoundaryScanContext {
  return {
    blockquotePrefix,
    listContinuationIndent: parseTolerantBoundaryListContinuationIndent(openingContentLine),
  }
}

function stripTolerantBoundaryListContinuationIndent(line: string, indent: number) {
  const source = String(line ?? '')
  if (indent <= 0) {
    return {
      matched: true,
      content: source,
      offset: 0,
    }
  }

  let cursor = 0
  while (cursor < source.length && cursor < indent && isSpaceOrTab(source[cursor]))
    cursor++

  if (cursor >= indent) {
    return {
      matched: true,
      content: source.slice(cursor),
      offset: cursor,
    }
  }

  if (!source.trim()) {
    return {
      matched: true,
      content: '',
      offset: source.length,
    }
  }

  return {
    matched: false,
    content: source,
    offset: 0,
  }
}

function getTolerantBoundaryScanLine(line: string, context: TolerantBoundaryScanContext): TolerantBoundaryScanLine {
  const expectedBlockquotePrefix = context.blockquotePrefix

  if (!expectedBlockquotePrefix) {
    const list = stripTolerantBoundaryListContinuationIndent(line, context.listContinuationIndent)
    return { matched: list.matched, content: list.content, contentOffset: list.offset }
  }

  const parsed = splitTolerantBoundaryBlockquotePrefix(line)
  if (parsed.prefix !== expectedBlockquotePrefix)
    return { matched: false, content: parsed.content, contentOffset: parsed.prefix.length }

  const list = stripTolerantBoundaryListContinuationIndent(parsed.content, context.listContinuationIndent)
  return {
    matched: list.matched,
    content: list.content,
    contentOffset: parsed.prefix.length + list.offset,
  }
}

function hashTolerantBoundaryCacheText(value: string) {
  // Small deterministic hash for cache identity. The tolerant boundary scan is
  // capped by MAX_TOLERANT_BOUNDARY_CHARS, so this stays bounded and avoids
  // storing full math content in the stream reset cache key.
  let hash = 0
  for (let i = 0; i < value.length; i++)
    hash = ((hash * 31) + value.charCodeAt(i)) | 0

  return hash.toString(36)
}

function isOnlySpaceOrTabFrom(value: string, start = 0) {
  for (let i = Math.max(0, start); i < value.length; i++) {
    if (!isSpaceOrTab(value[i]))
      return false
  }
  return true
}

function isIndentedCodeLineForTolerantBoundary(line: string) {
  const source = String(line ?? '')
  if (!source.trim())
    return false

  let columns = 0
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === ' ') {
      columns++
      if (columns >= 4)
        return true
      continue
    }
    if (ch === '\t')
      return true
    break
  }
  return false
}

function parseTolerantBoundaryFenceMarker(line: string) {
  const source = String(line ?? '')
  let index = 0
  let spaces = 0

  while (spaces < 4 && isSpaceOrTab(source[index])) {
    index++
    spaces++
  }

  if (spaces >= 4)
    return null

  const marker = source[index]
  if (marker !== '`' && marker !== '~')
    return null

  let markerLen = 0
  while (source[index + markerLen] === marker)
    markerLen++

  if (markerLen < 3)
    return null

  return {
    markerChar: marker as '`' | '~',
    markerLen,
    rest: source.slice(index + markerLen),
  }
}

function parseTolerantBoundaryHtmlOpen(line: string) {
  const source = String(line ?? '')
  let index = 0
  let spaces = 0

  while (spaces < 4 && isSpaceOrTab(source[index])) {
    index++
    spaces++
  }

  if (spaces >= 4 || source[index] !== '<')
    return null

  index++
  while (isSpaceOrTab(source[index]))
    index++

  if (source[index] === '/' || source[index] === '!' || source[index] === '?')
    return null

  if (!isAsciiAlpha(source[index]))
    return null

  const nameStart = index
  index++
  while (isHtmlNameChar(source[index]))
    index++

  const tag = source.slice(nameStart, index).toLowerCase()
  const boundary = source[index]
  if (boundary && !isSpaceOrTab(boundary) && boundary !== '>' && boundary !== '/')
    return null

  let tagEnd = index
  while (tagEnd < source.length && source[tagEnd] !== '>')
    tagEnd++

  if (tagEnd >= source.length) {
    return {
      tag,
      closed: false,
    }
  }

  let beforeClose = tagEnd - 1
  while (beforeClose >= 0 && isSpaceOrTab(source[beforeClose]))
    beforeClose--

  const selfClosing = source[beforeClose] === '/'
  const sameLineClose = hasTolerantBoundaryHtmlClose(source.slice(tagEnd + 1), tag)

  return {
    tag,
    closed: selfClosing || sameLineClose,
  }
}

function hasTolerantBoundaryHtmlClose(line: string, tag: string) {
  const lower = String(line ?? '').toLowerCase()
  const lowerTag = String(tag ?? '').toLowerCase()
  if (!lower || !lowerTag)
    return false

  let pos = lower.indexOf('</')
  while (pos !== -1) {
    let index = pos + 2
    while (isSpaceOrTab(lower[index]))
      index++

    if (lower.slice(index, index + lowerTag.length) === lowerTag) {
      const boundary = lower[index + lowerTag.length]
      if (!boundary || isSpaceOrTab(boundary) || boundary === '>')
        return true
    }

    pos = lower.indexOf('</', pos + 2)
  }

  return false
}

function getTolerantBoundaryProtectedLineContent(line: string, context?: TolerantBoundaryScanContext) {
  if (context)
    return getTolerantBoundaryScanLine(line, context).content

  return splitTolerantBoundaryBlockquotePrefix(line).content
}

function buildTolerantBoundaryProtectedLineMask(lines: string[], context?: TolerantBoundaryScanContext) {
  const protectedLines = new Array<boolean>(lines.length).fill(false)
  let fenceMarker: '`' | '~' | '' = ''
  let fenceLen = 0
  let htmlTag = ''

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = getTolerantBoundaryProtectedLineContent(lines[lineNumber], context)

    if (htmlTag) {
      protectedLines[lineNumber] = true
      if (hasTolerantBoundaryHtmlClose(line, htmlTag))
        htmlTag = ''
      continue
    }

    if (fenceMarker) {
      protectedLines[lineNumber] = true
      const fence = parseTolerantBoundaryFenceMarker(line)
      if (fence && fence.markerChar === fenceMarker && fence.markerLen >= fenceLen && isOnlySpaceOrTabFrom(fence.rest)) {
        fenceMarker = ''
        fenceLen = 0
      }
      continue
    }

    if (isIndentedCodeLineForTolerantBoundary(line)) {
      protectedLines[lineNumber] = true
      continue
    }

    const fence = parseTolerantBoundaryFenceMarker(line)
    if (fence) {
      protectedLines[lineNumber] = true
      fenceMarker = fence.markerChar
      fenceLen = fence.markerLen
      continue
    }

    const html = parseTolerantBoundaryHtmlOpen(line)
    if (html) {
      protectedLines[lineNumber] = true
      if (!html.closed)
        htmlTag = html.tag
    }
  }

  return protectedLines
}

const TOLERANT_MATH_BLOCK_BOUNDARY_DELIMITERS = [
  ['\u0024\u0024', '\u0024\u0024'],
  ['\\[', '\\]'],
] as const

function findLineStartAtOrBefore(source: string, index: number) {
  const boundedIndex = Math.min(Math.max(0, index), source.length)
  const previousNewline = source.lastIndexOf('\n', Math.max(0, boundedIndex - 1))
  return previousNewline === -1 ? 0 : previousNewline + 1
}

function findTolerantBoundaryProtectedContextStart(source: string, targetIndex: number) {
  const target = Math.min(Math.max(0, targetIndex), source.length)
  let index = 0

  let fenceMarker: '`' | '~' | '' = ''
  let fenceLen = 0
  let fenceStart = -1

  let htmlTag = ''
  let htmlStart = -1

  while (index < source.length && index < target) {
    const newlineIndex = source.indexOf('\n', index)
    const hasNewline = newlineIndex !== -1
    const rawLineEnd = hasNewline
      ? (newlineIndex > index && source[newlineIndex - 1] === '\r' ? newlineIndex - 1 : newlineIndex)
      : source.length
    const rawLine = source.slice(index, rawLineEnd)
    const line = splitTolerantBoundaryBlockquotePrefix(rawLine).content

    if (htmlTag) {
      if (hasTolerantBoundaryHtmlClose(line, htmlTag)) {
        htmlTag = ''
        htmlStart = -1
      }
    }
    else if (fenceMarker) {
      const fence = parseTolerantBoundaryFenceMarker(line)
      if (
        fence
        && fence.markerChar === fenceMarker
        && fence.markerLen >= fenceLen
        && isOnlySpaceOrTabFrom(fence.rest)
      ) {
        fenceMarker = ''
        fenceLen = 0
        fenceStart = -1
      }
    }
    else if (!isIndentedCodeLineForTolerantBoundary(line)) {
      const fence = parseTolerantBoundaryFenceMarker(line)
      if (fence) {
        fenceMarker = fence.markerChar
        fenceLen = fence.markerLen
        fenceStart = index
      }
      else {
        const html = parseTolerantBoundaryHtmlOpen(line)
        if (html && !html.closed) {
          htmlTag = html.tag
          htmlStart = index
        }
      }
    }

    if (!hasNewline)
      break

    index = newlineIndex + 1
  }

  if (fenceMarker && fenceStart !== -1)
    return fenceStart

  if (htmlTag && htmlStart !== -1)
    return htmlStart

  return findLineStartAtOrBefore(source, target)
}

function getTolerantBoundaryCacheScanWindow(source: string, maxChars = MAX_TOLERANT_BOUNDARY_CACHE_SCAN_CHARS) {
  const value = String(source ?? '')
  if (value.length <= maxChars) {
    return {
      source: value,
      lineOffset: 0,
    }
  }

  let windowStart = value.length - maxChars
  const nextLineBreak = value.indexOf('\n', windowStart)
  if (nextLineBreak !== -1)
    windowStart = nextLineBreak + 1

  windowStart = findTolerantBoundaryProtectedContextStart(value, windowStart)

  const prefix = value.slice(0, windowStart)
  return {
    source: value.slice(windowStart),
    lineOffset: countLineBreaks(prefix),
  }
}

function getTolerantMathBlockBoundaryCacheKey(markdown: string, includePending: boolean) {
  const fullSource = String(markdown ?? '')
  if (!fullSource || (!fullSource.includes('$') && !fullSource.includes('\\[')))
    return null

  const {
    source,
    lineOffset,
  } = getTolerantBoundaryCacheScanWindow(fullSource)

  if (!source || (!source.includes('$') && !source.includes('\\[')))
    return null

  const keys: string[] = []
  const lines = source.split(/\r?\n/)

  const protectedLines = buildTolerantBoundaryProtectedLineMask(lines)
  const protectedLinesByScanContext = new Map<string, boolean[]>()

  const getProtectedLinesForScanContext = (context: TolerantBoundaryScanContext) => {
    if (!context.listContinuationIndent)
      return protectedLines

    const key = `${context.blockquotePrefix}\u0000${context.listContinuationIndent}`
    const cached = protectedLinesByScanContext.get(key)
    if (cached)
      return cached

    const next = buildTolerantBoundaryProtectedLineMask(lines, context)
    protectedLinesByScanContext.set(key, next)
    return next
  }

  let skipUntilLine = -1

  for (let startLine = 0; startLine < lines.length - 1; startLine++) {
    if (startLine <= skipUntilLine)
      continue

    if (protectedLines[startLine])
      continue

    const line = lines[startLine]
    const openingLine = splitTolerantBoundaryBlockquotePrefix(line)
    const scanContext = buildTolerantBoundaryScanContext(
      openingLine.content,
      openingLine.prefix,
    )
    const scanProtectedLines = getProtectedLinesForScanContext(scanContext)
    const lineWithoutTrailingWs = openingLine.content.replace(/[\t ]+$/, '')
    if (!lineWithoutTrailingWs.trim())
      continue

    for (const [open, close] of TOLERANT_MATH_BLOCK_BOUNDARY_DELIMITERS) {
      if (!lineWithoutTrailingWs.endsWith(open))
        continue

      const openIndex = lineWithoutTrailingWs.length - open.length
      if (openIndex <= 0)
        continue

      if (isEscapedAt(lineWithoutTrailingWs, openIndex) || isInsideCodeSpanOrUnclosedTail(lineWithoutTrailingWs, openIndex))
        continue

      if (openIndex > 0 && lineWithoutTrailingWs[openIndex - 1] === open[0])
        continue

      const before = lineWithoutTrailingWs.slice(0, openIndex).replace(/[\t ]+$/, '')
      if (!before.trim())
        continue

      const codeSpanRanges = buildCodeSpanRanges(lineWithoutTrailingWs)
      const previousOpenCount = countUnescapedDelimiter(lineWithoutTrailingWs, open, 0, openIndex, codeSpanRanges)
      const previousCloseCount = open === '\u0024\u0024'
        ? 0
        : countUnescapedDelimiter(lineWithoutTrailingWs, close, 0, openIndex, codeSpanRanges)

      if (open === '\u0024\u0024' ? previousOpenCount % 2 === 1 : previousOpenCount > previousCloseCount)
        continue

      let content = ''
      let stoppedBeforeTail = false
      let closed = false
      let currentLineNumber = startLine + 1

      for (; currentLineNumber < lines.length; currentLineNumber++) {
        const currentScanLine = getTolerantBoundaryScanLine(
          lines[currentLineNumber],
          scanContext,
        )
        if (!currentScanLine.matched) {
          stoppedBeforeTail = true
          break
        }

        if (scanProtectedLines[currentLineNumber]) {
          stoppedBeforeTail = true
          break
        }

        const currentLine = currentScanLine.content
        const nextRawLine = lines[currentLineNumber + 1] ?? ''
        const nextLine = getTolerantBoundaryScanLine(nextRawLine, scanContext).content

        if (shouldAbortTolerantBoundaryScan(currentLine, startLine, currentLineNumber, content, nextLine)) {
          stoppedBeforeTail = true
          break
        }

        const closeIndex = findUnescapedDelimiter(currentLine, close)
        const fallbackCloseIndex = open === '\\['
          ? findPlainBracketFallbackClose(currentLine)
          : -1
        const endIndex = closeIndex !== -1 ? closeIndex : fallbackCloseIndex

        if (endIndex !== -1) {
          closed = true
          const closeDelimiterLength = closeIndex !== -1 ? close.length : 1
          const beforeClose = currentLine.slice(0, endIndex)
          const trailingAfterClose = currentLine.slice(endIndex + closeDelimiterLength)
          const suffixState = trailingAfterClose.trim() ? 'suffix' : 'nosuffix'
          const candidateContent = appendTolerantBoundaryContent(content, beforeClose)
          if (isLikelyTolerantExplicitMathBlockContent(candidateContent, true)) {
            const contentHash = hashTolerantBoundaryCacheText(candidateContent)
            const rawEndIndex = endIndex + currentScanLine.contentOffset
            keys.push(`closed:${open}:${lineOffset + startLine}:${openIndex}:${lineOffset + currentLineNumber}:${rawEndIndex}:${contentHash}:${suffixState}`)
            skipUntilLine = currentLineNumber
          }
          break
        }

        content = appendTolerantBoundaryContent(content, currentLine)
      }

      if (
        includePending
        && !closed
        && !stoppedBeforeTail
        && currentLineNumber >= lines.length
        && isPotentialTolerantPendingMathContent(content)
      ) {
        // Pending key deliberately does not include content hash. While the user
        // is still streaming math content, appending normal math text should not
        // reset on every chunk. We only need one reset when entering this pending
        // tolerant-boundary shape; completion will produce a different closed key.
        keys.push(`pending:${open}:${lineOffset + startLine}:${openIndex}`)
        skipUntilLine = lines.length - 1
      }
    }
  }

  return keys.length ? keys.join('|') : null
}

export function getCompletedTolerantMathBlockBoundaryCacheKey(markdown: string) {
  return getTolerantMathBlockBoundaryCacheKey(markdown, false)
}

export function getActiveTolerantMathBlockBoundaryCacheKey(markdown: string) {
  return getTolerantMathBlockBoundaryCacheKey(markdown, true)
}

function isPotentialTolerantPendingMathContent(content: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false

  if (stripped.length > MAX_TOLERANT_BOUNDARY_CHARS)
    return true

  if (isLikelyTolerantExplicitMathBlockContent(stripped, false))
    return true

  if (isLikelySpacedSuperSubscriptMath(stripped))
    return true

  if (/^(?:[a-z]|pi|\\[a-z]*|\d+(?:\.\d+)?)$/i.test(stripped))
    return true

  if (/[=+\-*/^_<>|\\({]\s*$/.test(stripped) || stripped.endsWith('['))
    return true

  return /(?:^|[^\p{L}\p{N}\\])(?:[a-z]|\\[a-z]+)\s*[-+*/=<>_^]\s*$/iu.test(stripped)
}

export function mayContainPendingTolerantMathBlockBoundaryCandidate(markdown: string) {
  const source = String(markdown ?? '')
  if (!source || (!source.includes('$') && !source.includes('\\[')))
    return false

  const { source: tail } = getTolerantBoundaryCacheScanWindow(source, MAX_TOLERANT_BOUNDARY_CHARS)
  const lines = tail.split(/\r?\n/)
  const protectedLines = buildTolerantBoundaryProtectedLineMask(lines)
  const protectedLinesByScanContext = new Map<string, boolean[]>()

  const getProtectedLinesForScanContext = (context: TolerantBoundaryScanContext) => {
    if (!context.listContinuationIndent)
      return protectedLines

    const key = `${context.blockquotePrefix}\u0000${context.listContinuationIndent}`
    const cached = protectedLinesByScanContext.get(key)
    if (cached)
      return cached

    const next = buildTolerantBoundaryProtectedLineMask(lines, context)
    protectedLinesByScanContext.set(key, next)
    return next
  }

  const minStartLine = Math.max(0, lines.length - MAX_TOLERANT_BOUNDARY_LINES - 1)

  for (let startLine = lines.length - 1; startLine >= minStartLine; startLine--) {
    if (protectedLines[startLine])
      continue

    const openingLine = splitTolerantBoundaryBlockquotePrefix(lines[startLine])
    const scanContext = buildTolerantBoundaryScanContext(
      openingLine.content,
      openingLine.prefix,
    )
    const scanProtectedLines = getProtectedLinesForScanContext(scanContext)
    const lineWithoutTrailingWs = openingLine.content.replace(/[\t ]+$/, '')
    if (!lineWithoutTrailingWs.trim())
      continue

    for (const [open, close] of TOLERANT_MATH_BLOCK_BOUNDARY_DELIMITERS) {
      if (!lineWithoutTrailingWs.endsWith(open))
        continue

      const openIndex = lineWithoutTrailingWs.length - open.length
      if (openIndex <= 0)
        continue

      if (isEscapedAt(lineWithoutTrailingWs, openIndex) || isInsideCodeSpanOrUnclosedTail(lineWithoutTrailingWs, openIndex))
        continue

      if (openIndex > 0 && lineWithoutTrailingWs[openIndex - 1] === open[0])
        continue

      const before = lineWithoutTrailingWs.slice(0, openIndex).replace(/[\t ]+$/, '')
      if (!before.trim())
        continue

      const codeSpanRanges = buildCodeSpanRanges(lineWithoutTrailingWs)
      const previousOpenCount = countUnescapedDelimiter(lineWithoutTrailingWs, open, 0, openIndex, codeSpanRanges)
      const previousCloseCount = open === '\u0024\u0024'
        ? 0
        : countUnescapedDelimiter(lineWithoutTrailingWs, close, 0, openIndex, codeSpanRanges)

      if (open === '\u0024\u0024' ? previousOpenCount % 2 === 1 : previousOpenCount > previousCloseCount)
        continue

      if (startLine === lines.length - 1)
        return true

      let content = ''

      for (let currentLineNumber = startLine + 1; currentLineNumber < lines.length; currentLineNumber++) {
        const currentScanLine = getTolerantBoundaryScanLine(
          lines[currentLineNumber],
          scanContext,
        )
        if (!currentScanLine.matched)
          break

        if (scanProtectedLines[currentLineNumber])
          break

        const currentLine = currentScanLine.content
        const nextRawLine = lines[currentLineNumber + 1] ?? ''
        const nextLine = getTolerantBoundaryScanLine(nextRawLine, scanContext).content

        if (shouldAbortTolerantBoundaryScan(currentLine, startLine, currentLineNumber, content, nextLine))
          break

        const closeIndex = findUnescapedDelimiter(currentLine, close)
        const fallbackCloseIndex = open === '\\['
          ? findPlainBracketFallbackClose(currentLine)
          : -1

        if (closeIndex !== -1 || fallbackCloseIndex !== -1)
          break

        content = appendTolerantBoundaryContent(content, currentLine)

        if (currentLineNumber === lines.length - 1)
          return isPotentialTolerantPendingMathContent(content)
      }
    }
  }

  return false
}

function hasNonSpaceOrTabAfter(value: string, start: number) {
  for (let i = Math.max(0, start); i < value.length; i++) {
    if (!isSpaceOrTab(value[i]))
      return true
  }
  return false
}

function isAsciiAlpha(ch?: string) {
  if (!ch)
    return false
  const code = ch.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isAsciiDigit(ch?: string) {
  if (!ch)
    return false
  const code = ch.charCodeAt(0)
  return code >= 48 && code <= 57
}

function isHtmlNameChar(ch?: string) {
  return isAsciiAlpha(ch) || isAsciiDigit(ch) || ch === '_' || ch === ':' || ch === '-'
}

function isThematicOrSetextBoundaryLine(line: string) {
  // Tolerant math repair must not scan across horizontal rules or setext
  // heading underlines. Otherwise ordinary text ending with "$" can consume
  // a later unrelated "$" and swallow the block boundary in between.
  // Covers: "---", "- - -", "***", "* * *", "___", "_ _ _", "===".
  //
  // Keep this as a deterministic scanner instead of a nested-quantifier regex.
  // This function runs in the tolerant cross-line scan hot path. Regexes like
  // `(?:-[\t ]*){3,}` are easy to make pathological with long near-matches,
  // e.g. "- - - ... x".
  const value = String(line ?? '').trim()
  if (!value)
    return false

  if (value[0] === '=') {
    if (value.length < 3)
      return false
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== '=')
        return false
    }
    return true
  }

  const marker = value[0]
  if (marker !== '-' && marker !== '*' && marker !== '_')
    return false

  let markerCount = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === marker) {
      markerCount++
      continue
    }
    if (isSpaceOrTab(ch))
      continue
    return false
  }

  return markerCount >= 3
}

function isMarkdownTableDelimiterCell(cell: string) {
  const value = String(cell ?? '').trim()
  if (!value)
    return false

  let index = 0
  if (value[index] === ':')
    index++

  let dashCount = 0
  while (value[index] === '-') {
    dashCount++
    index++
  }

  if (dashCount < 3)
    return false

  if (value[index] === ':')
    index++

  return index === value.length
}

function isLikelyMarkdownTableBoundaryLine(trimmed: string) {
  // Markdown table delimiter rows may omit leading/trailing pipes:
  //
  //   A | B
  //   --- | ---
  //
  // If a tolerant math opener appears before such a table, scanning must abort
  // on the delimiter row instead of treating the table as formula content.
  //
  // Important: do NOT treat normal pipe-containing data rows as hard scan
  // boundaries here. A valid display formula may start with absolute values,
  // including spaced absolute values, e.g.
  //
  //   |x| = y
  //   | x | = y
  //
  // The previous implementation treated many pipe data rows as table
  // boundaries, which made tolerant display math under-recognize valid absolute
  // value expressions. Real markdown tables are still guarded by their delimiter
  // rows:
  //
  //   --- | ---
  const value = String(trimmed ?? '').trim()
  if (!value || !value.includes('|'))
    return false

  const withoutLeadingPipe = value[0] === '|' ? value.slice(1) : value
  const withoutEdgePipes = withoutLeadingPipe.endsWith('|')
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe
  const cells = withoutEdgePipes.split('|')

  if (!cells.length)
    return false

  for (const cell of cells) {
    if (!isMarkdownTableDelimiterCell(cell))
      return false
  }

  return true
}

function isLikelyMarkdownTableHeaderBeforeDelimiter(trimmed: string, nextLine?: string) {
  const value = String(trimmed ?? '').trim()
  if (!value || !value.includes('|'))
    return false

  const next = String(nextLine ?? '').trim()
  if (!isLikelyMarkdownTableBoundaryLine(next))
    return false

  // A table header row followed by a delimiter row is a hard boundary for the
  // tolerant same-line math repair. Without this guard, a header like:
  //
  //   Name $ | Value
  //   --- | ---
  //
  // can be mistaken for the closing `$` of an earlier malformed display block.
  // Keep absolute-value formula rows safe: `|x| = y` is not followed by a table
  // delimiter in valid math-block repair cases, so it still parses as math.
  const withoutLeadingPipe = value[0] === '|' ? value.slice(1) : value
  const withoutEdgePipes = withoutLeadingPipe.endsWith('|')
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe
  const cells = withoutEdgePipes.split('|')

  if (!cells.length)
    return false

  return cells.some(cell => cell.trim())
}

function isHeadingBoundaryLine(trimmed: string) {
  let level = 0
  while (trimmed[level] === '#')
    level++

  if (level < 1 || level > 6)
    return false

  return isSpaceOrTab(trimmed[level]) && hasNonSpaceOrTabAfter(trimmed, level + 1)
}

function isFenceBoundaryLine(trimmed: string) {
  const marker = trimmed[0]
  if (marker !== '`' && marker !== '~')
    return false

  let count = 0
  while (trimmed[count] === marker)
    count++

  return count >= 3
}

function isContainerBoundaryLine(trimmed: string) {
  let count = 0
  while (trimmed[count] === ':')
    count++

  return count >= 3
}

function isListBoundaryLine(trimmed: string) {
  const first = trimmed[0]

  if ((first === '*' || first === '+' || first === '-') && isSpaceOrTab(trimmed[1]))
    return true

  if (!isAsciiDigit(first))
    return false

  let index = 0
  while (isAsciiDigit(trimmed[index]))
    index++

  if (trimmed[index] !== '.' && trimmed[index] !== ')')
    return false

  return isSpaceOrTab(trimmed[index + 1])
}

function isHtmlBoundaryLine(trimmed: string) {
  if (trimmed[0] !== '<')
    return false

  let index = 1
  while (isSpaceOrTab(trimmed[index]))
    index++

  if (trimmed[index] === '/') {
    index++
    while (isSpaceOrTab(trimmed[index]))
      index++
  }

  if (!isAsciiAlpha(trimmed[index]))
    return false

  index++
  while (isHtmlNameChar(trimmed[index]))
    index++

  const boundary = trimmed[index]
  return boundary == null || isSpaceOrTab(boundary) || boundary === '>' || boundary === '/'
}

function isReferenceDefinitionBoundaryLine(trimmed: string) {
  if (trimmed[0] !== '[')
    return false

  let index = 1
  while (index < trimmed.length) {
    const ch = trimmed[index]
    if (ch === '\\') {
      index += 2
      continue
    }
    if (ch === ']')
      break
    index++
  }

  if (trimmed[index] !== ']')
    return false

  index++
  if (trimmed[index] !== ':')
    return false

  index++
  while (isSpaceOrTab(trimmed[index]))
    index++

  return hasNonSpaceOrTabAfter(trimmed, index)
}

function isMarkdownBlockBoundaryLine(trimmed: string) {
  return isHeadingBoundaryLine(trimmed)
    || trimmed[0] === '>'
    || isListBoundaryLine(trimmed)
    || isFenceBoundaryLine(trimmed)
    || isContainerBoundaryLine(trimmed)
    || isHtmlBoundaryLine(trimmed)
}

function isTolerantBoundaryScanStopLine(line: string, nextLine = '') {
  if (isIndentedCodeLineForTolerantBoundary(line))
    return true

  const trimmed = String(line ?? '').trimStart()

  if (!trimmed)
    return true

  if (isThematicOrSetextBoundaryLine(trimmed))
    return true

  // Tolerant same-line math boundaries are an LLM-output repair path, not a
  // general block parser. Do not scan across obvious markdown block boundaries;
  // otherwise ordinary paragraphs ending with "$" can accidentally consume a
  // later unrelated "$". Keep pipe/table detection separate so formulas like
  // `|x| = y` can still be parsed as math.
  if (isLikelyMarkdownTableHeaderBeforeDelimiter(trimmed, nextLine))
    return true
  if (isLikelyMarkdownTableBoundaryLine(trimmed))
    return true
  if (isMarkdownBlockBoundaryLine(trimmed))
    return true

  // Reference/definition-style boundaries are not formula content.
  if (isReferenceDefinitionBoundaryLine(trimmed))
    return true

  return false
}

function isLikelyTolerantSignedMathContinuation(trimmed: string) {
  const source = String(trimmed ?? '')
  const sign = source[0]
  if (sign !== '+' && sign !== '-')
    return false

  if (!isSpaceOrTab(source[1]))
    return false

  const rest = source.slice(1).trimStart()
  if (!rest)
    return false

  if (/^\\[a-z]+/i.test(rest))
    return true

  if (/^[\d({|]/.test(rest))
    return true

  return /^[a-z](?:\s*[_^=+\-*/<>]|\s*$)/i.test(rest)
}

function shouldAbortTolerantBoundaryScan(
  currentLine: string,
  startLine: number,
  currentLineNumber: number,
  accumulatedContent: string,
  nextLine = '',
) {
  if (currentLineNumber - startLine > MAX_TOLERANT_BOUNDARY_LINES)
    return true

  if (accumulatedContent.length + currentLine.length > MAX_TOLERANT_BOUNDARY_CHARS)
    return true

  const trimmed = String(currentLine ?? '').trimStart()
  if (isLikelyTolerantSignedMathContinuation(trimmed)) {
    const signedCandidateContent = appendTolerantBoundaryContent(
      accumulatedContent,
      trimmed,
    )

    if (
      isLikelyTolerantExplicitMathBlockContent(signedCandidateContent, false)
      || isPotentialTolerantPendingMathContent(signedCandidateContent)
    ) {
      return false
    }
  }

  return isTolerantBoundaryScanStopLine(currentLine, nextLine)
}

function appendTolerantBoundaryContent(content: string, line: string) {
  if (!content)
    return line
  if (!line)
    return content
  return `${content}\n${line}`
}

export function hasClosedTolerantMathBlockBoundaryCandidate(markdown: string) {
  return getCompletedTolerantMathBlockBoundaryCacheKey(markdown) !== null
}

function tolerantBoundaryKeyHasCloseAtLine(
  key: string | null | undefined,
  line: number,
  closeIndex: number,
  delimiter: string,
) {
  if (!key)
    return false

  return key.split('|').some((part) => {
    const fields = part.split(':')
    return fields[0] === 'closed'
      && fields[1] === delimiter
      && Number(fields[4]) === line
      && Number(fields[5]) === closeIndex
  })
}

function hasTolerantBoundaryCloseAtLine(markdown: string, line: number, closeIndex: number, delimiter: string) {
  return tolerantBoundaryKeyHasCloseAtLine(
    getCompletedTolerantMathBlockBoundaryCacheKey(markdown),
    line,
    closeIndex,
    delimiter,
  )
}

function countLineBreaks(value: string) {
  let count = 0
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10)
      count++
  }
  return count
}

function isLikelyCurrencyRangeDollar(content: string, nextChar?: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false
  // Currency ranges like "$2000~$5000" should remain plain text.
  // We only gate when the content before closing "$" ends with a range marker
  // and the following character continues with digits.
  if (!/^\d[\d,.]*\s*[~～-]\s*$/.test(stripped))
    return false
  return /\d/.test(String(nextChar ?? ''))
}

function isLikelyCurrencyAmountStart(content: string) {
  const stripped = String(content ?? '').trimStart()
  const amount = stripped.match(/^\d+(?:,\d{3})*(?:\.\d+)?/)
  if (!amount)
    return false
  const rest = stripped.slice(amount[0].length)
  if (/^\s*(?:[+\-*/^_=<>]|\\[a-z]+)/i.test(rest))
    return false
  return rest === '' || /^[)\s,.!?;:]/.test(rest)
}

function isLikelyPlaceholderDollar(content: string) {
  const stripped = String(content ?? '').trim()
  if (!stripped)
    return false
  // Placeholder text like "$...$" / "$…$" is not math.
  return /^(?:\.{3,}|…+)$/.test(stripped)
}

function markSyntheticTolerantBoundaryParagraphToken(token: MarkdownToken) {
  const previousMeta = token.meta && typeof token.meta === 'object'
    ? token.meta
    : {}

  token.meta = {
    ...previousMeta,
    [TOLERANT_BOUNDARY_SYNTHETIC_PARAGRAPH_META]: true,
  }
}

function pushSyntheticInlineParagraph(s: MathBlockState, content: string, line: number) {
  const paragraphContent = String(content ?? '')
    .replace(/^[\t ]+/, '')
    .replace(/[\t ]+$/, '')
  if (!paragraphContent)
    return

  const paragraphOpen = s.push('paragraph_open', 'p', 1)
  paragraphOpen.map = [line, line + 1]
  markSyntheticTolerantBoundaryParagraphToken(paragraphOpen)

  const inlineToken = s.push('inline', '', 0)
  inlineToken.content = paragraphContent
  inlineToken.map = [line, line + 1]
  markSyntheticTolerantBoundaryParagraphToken(inlineToken)
  // Do not pre-parse children here. This helper runs during block parsing, and
  // markdown-it's core inline rule will parse every `inline` token afterwards.
  // Pre-filling children here makes the core rule append the same inline tokens
  // again, which duplicates text/math_inline nodes in synthetic paragraphs.
  inlineToken.children = []

  const paragraphClose = s.push('paragraph_close', 'p', -1)
  markSyntheticTolerantBoundaryParagraphToken(paragraphClose)
}

export function applyMath(md: MarkdownIt, mathOpts?: MathOptions) {
  markMarkstreamMathPluginApplied(md)

  // Inline rule for `\\(...\\)` and `$$...$$` and `$...$`
  const mathInline = (state: unknown, silent?: boolean) => {
    const s = state as MathInlineState
    const strict = !!mathOpts?.strictDelimiters
    const allowLoading = !s?.env?.__markstreamFinal

    const preserveSpacesBeforeLineBreak = (src: string, start: number) => {
      let end = start
      while (end < src.length && (src[end] === ' ' || src[end] === '\t'))
        end++

      if (end === start)
        return start

      const hitsLineBreak = src[end] === '\n' || (src[end] === '\r' && src[end + 1] === '\n')
      if (!hitsLineBreak)
        return start

      const text = src.slice(start, end)
      const token = s.push('text', '', 0)
      token.content = text
      return end
    }

    if (/^\*[^*]+/.test(s.src)) {
      return false
    }
    const delimiters: [string, string][] = [
      ['$$', '$$'],
      ['$', '$'],
      // Support explicit TeX inline delimiters only: `\\(...\\)`
      // NOTE: in source text authors must write the backslashes literally
      // (e.g. `\\(...\\)`). Unescaped `\(...\)` cannot be reliably
      // distinguished from ordinary parentheses and may not be parsed as math.
      ['\\(', '\\)'],
      // Do NOT treat plain parentheses as math delimiters. Using ['\(', '\)']
      // accidentally becomes ['(', ')'] in JS/TS strings and over-matches
      // regular text like "(0 <= t < S-1)", causing false math detection.
    ]

    const pending = String(s.pending ?? '')
    const currentStart = Math.max(0, s.pos - pending.length)
    let searchPos = currentStart
    let preMathPos = currentStart
    // Save the initial unconsumed position so $$ can rescan the current
    // inline segment even after $ handling advances the cursor. Starting
    // from absolute 0 can duplicate already-emitted text after hardbreaks.
    const initialPos = currentStart
    // use findMatchingClose from util
    for (const [open, close] of delimiters) {
      // We'll scan the entire inline source and tokenize all occurrences
      const src = s.src
      const codeSpanRanges = buildCodeSpanRanges(src)
      const imageRanges = buildImageRanges(src, allowLoading)
      let foundAny = false
      // Reset searchPos for $$ to allow it to scan the full content
      // even after $ rule has processed some text
      if (open === '$$' && searchPos !== initialPos) {
        searchPos = initialPos
      }
      // Guard against non-advancing loops: if we ever end up repeatedly
      // matching the same opener at the same position, force `searchPos`
      // to advance so the inline rule can't hang the UI.
      let lastIndex = -1
      let lastSearchPos = -1
      let stallCount = 0
      const pushText = (text: string) => {
        // sanitize unexpected values
        if (text === 'undefined' || text == null) {
          text = ''
        }
        if (text === '\\') {
          s.pos = s.pos + text.length
          searchPos = s.pos
          return
        }
        if (text === '\\)' || text === '\\(') {
          const t = s.push('text_special', '', 0)
          t.content = text === '\\)' ? ')' : '('
          t.markup = text
          s.pos = s.pos + text.length
          searchPos = s.pos
          return
        }

        if (!text)
          return

        // When scanning $$...$$, also parse nested single-dollar $...$ math
        // segments that appear in the surrounding text. Without this, mixing
        // $ and $$ in one line can cause the $ segments to be emitted as plain
        // text because this rule returns after the first successful delimiter
        // pass.
        if (open === '$$' && text.includes('$')) {
          let localPos = 0
          while (localPos < text.length) {
            const dollarIndex = findNextUnescapedDollar(text, localPos)
            if (dollarIndex === -1) {
              const rest = text.slice(localPos)
              if (rest) {
                const t = s.push('text', '', 0)
                t.content = rest
                s.pos = s.pos + rest.length
                searchPos = s.pos
              }
              break
            }

            // Skip "$$" occurrences; they belong to the $$ scanner.
            if ((dollarIndex > 0 && text[dollarIndex - 1] === '$') || (dollarIndex + 1 < text.length && text[dollarIndex + 1] === '$')) {
              const beforeSkip = text.slice(localPos, dollarIndex + 1)
              if (beforeSkip) {
                const t = s.push('text', '', 0)
                t.content = beforeSkip
                s.pos = s.pos + beforeSkip.length
                searchPos = s.pos
              }
              localPos = dollarIndex + 1
              continue
            }

            const before = text.slice(localPos, dollarIndex)
            if (before) {
              const t = s.push('text', '', 0)
              t.content = before
              s.pos = s.pos + before.length
              searchPos = s.pos
            }

            const closingDollarIndex = findSingleDollarClose(text, dollarIndex + 1)
            if (closingDollarIndex === -1) {
              // No closing delimiter; treat the rest as text.
              const rest = text.slice(dollarIndex)
              const t = s.push('text', '', 0)
              t.content = rest
              s.pos = s.pos + rest.length
              searchPos = s.pos
              break
            }

            const content = text.slice(dollarIndex + 1, closingDollarIndex)
            const hasBacktick = content.includes('`')
            const isEmpty = !content || !content.trim()
            const nextChar = text[closingDollarIndex + 1]
            const isCurrencyRange = isLikelyCurrencyRangeDollar(content, nextChar)
            const isPlaceholder = isLikelyPlaceholderDollar(content)
            if (!hasBacktick && !isEmpty && !isCurrencyRange && !isPlaceholder) {
              const token = s.push('math_inline', 'math', 0)
              token.content = normalizeStandaloneBackslashT(content, mathOpts)
              token.markup = '$'
              token.raw = `$${content}$`
              token.loading = false
              s.pos = s.pos + (closingDollarIndex - dollarIndex + 1)
              searchPos = s.pos
              localPos = closingDollarIndex + 1
              continue
            }

            // Not valid math; emit '$' as text and continue.
            const t = s.push('text', '', 0)
            t.content = '$'
            s.pos = s.pos + 1
            searchPos = s.pos
            localPos = dollarIndex + 1
          }
          return
        }

        // Check if text contains image syntax ![...](...)
        // If so, parse and push the image token manually
        const imageStart = text.indexOf('![')
        if (imageStart !== -1) {
          // Push text before the image syntax
          if (imageStart > 0) {
            const beforeImage = text.slice(0, imageStart)
            const t = s.push('text', '', 0)
            t.content = beforeImage
            s.pos = s.pos + beforeImage.length
            searchPos = s.pos
          }

          // Try to parse the image syntax: ![alt](src "title")
          const imageText = text.slice(imageStart)
          const imageMatch = imageText.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
          if (imageMatch) {
            const [, alt, srcAndTitle] = imageMatch
            // Parse src and optional title
            const srcMatch = srcAndTitle.match(/^(\S+)(?:\s+"([^"]+)")?\s*$/)
            const src = srcMatch ? srcMatch[1] : srcAndTitle
            const title = srcMatch && srcMatch[2] ? srcMatch[2] : null

            // Create image token
            const token = s.push('image', 'img', 0)
            token.attrs = [['src', src], ['alt', alt]]
            if (title) {
              token.attrs.push(['title', title])
            }
            token.content = alt
            token.children = [{ type: 'text', content: alt, tag: '' }]
            s.pos = s.pos + imageMatch[0].length
            searchPos = s.pos

            // Continue processing the remaining text after the image
            const remainingText = text.slice(imageStart + imageMatch[0].length)
            if (remainingText) {
              // Recursively process the remaining text
              pushText(remainingText)
            }
            return
          }

          // If image syntax is incomplete, push it as text and continue
          const t = s.push('text', '', 0)
          t.content = text
          s.pos = s.pos + text.length
          searchPos = s.pos
          return
        }

        const t = s.push('text', '', 0)
        t.content = text
        s.pos = s.pos + text.length
        searchPos = s.pos
      }

      while (true) {
        if (searchPos >= src.length)
          break
        const index = src.indexOf(open, searchPos)
        if (index === -1)
          break
        if (isEscapedAt(src, index)) {
          searchPos = index + Math.max(1, open.length)
          continue
        }

        const codeSpanAtIndex = findRangeAt(codeSpanRanges, index)
        if (codeSpanAtIndex) {
          searchPos = codeSpanAtIndex[1]
          continue
        }

        const imageRangeAtIndex = findRangeAt(imageRanges, index)
        if (imageRangeAtIndex) {
          searchPos = imageRangeAtIndex[1]
          continue
        }

        if (index === lastIndex && searchPos === lastSearchPos) {
          stallCount++
          if (stallCount > 2) {
            searchPos = index + Math.max(1, open.length)
            continue
          }
        }
        else {
          stallCount = 0
          lastIndex = index
          lastSearchPos = searchPos
        }
        // NOTE: historically this math rule also supported plain parentheses
        // delimiters, so we avoided matching a "(" right after a link label
        // like `[text](...)`. We no longer treat parentheses as math delimiters,
        // and this rule scans the whole inline source (not only `state.pos`),
        // so returning `false` here can break markdown-it's invariants and hang
        // the parser after we already emitted tokens/advanced `state.pos`.
        //
        // Keep the link-guard only for the legacy "(" delimiter (currently unused).
        if (open === '(' && index > 0) {
          let i = index - 1
          while (i >= 0 && src[i] === ' ')
            i--
          if (i >= 0 && src[i] === ']') {
            searchPos = index + open.length
            continue
          }
        }

        // Skip $$ delimiters when processing $ delimiter to avoid conflicts
        // The $$ rule will handle these separately
        if (open === '$' && index > 0 && src[index - 1] === '$') {
          searchPos = index + 1
          continue
        }
        if (open === '$' && index < src.length - 1 && src[index + 1] === '$') {
          searchPos = index + 2
          continue
        }
        // 有可能遇到 \((\operatorname{span}\\{\boldsymbol{\alpha}\\})^\perp\)
        // 这种情况，前面的 \( 是数学公式的开始，后面的 ( 是普通括号
        // endIndex 需要找到与 open 对应的 close
        // 不能简单地用 indexOf 找到第一个 close — 需要处理嵌套与转义字符
        const endIdx = open === '$'
          ? findSingleDollarClose(src, index + open.length)
          : findMatchingClose(src, index + open.length, open, close)
        if (endIdx === -1) {
          // no matching close for this opener; skip forward
          const content = src.slice(index + open.length)
          if (content.includes(open)) {
            searchPos = src.indexOf(open, index + open.length)
            continue
          }
          if (endIdx === -1) {
            // Do not treat segments containing inline code as math
            const isCurrencyAmount = open === '$' && isLikelyCurrencyAmountStart(content)
            if (allowLoading && !strict && !isCurrencyAmount && isMathLike(content) && !content.includes('`')) {
              searchPos = index + open.length
              foundAny = true
              if (!silent) {
                s.pending = ''
                const toPushBefore = preMathPos ? src.slice(preMathPos, searchPos) : src.slice(0, searchPos)
                const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1

                if (preMathPos) {
                  pushText(src.slice(preMathPos, searchPos))
                }
                else {
                  let text = src.slice(0, searchPos)
                  if (text.endsWith(open))
                    text = text.slice(0, text.length - open.length)
                  pushText(text)
                }
                if (isStrongPrefix) {
                  const strongMarker = findLastUnescapedStrongMarker(toPushBefore)?.marker ?? '**'
                  const strongToken = s.push('strong_open', '', 0)
                  strongToken.markup = strongMarker
                  const token = s.push('math_inline', 'math', 0)
                  token.content = normalizeStandaloneBackslashT(content, mathOpts)
                  token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
                  token.raw = `${open}${content}${close}`
                  token.loading = true
                  strongToken.content = content
                  s.push('strong_close', '', 0)
                }
                else {
                  const token = s.push('math_inline', 'math', 0)
                  token.content = normalizeStandaloneBackslashT(content, mathOpts)
                  token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
                  token.raw = `${open}${content}${close}`
                  token.loading = true
                }
                // consume the full inline source
                s.pos = src.length
              }
              searchPos = src.length
              preMathPos = searchPos
            }
            break
          }
        }
        const content = src.slice(index + open.length, endIdx)
        // Skip treating as math when the content contains inline-code backticks
        // Always accept explicit dollar-delimited math ($...$) even if the
        // heuristic deems it not math-like (to support cases like $H$, $CO_2$).
        const hasBacktick = content.includes('`')
        const isEmpty = !content || !content.trim()
        const isDollar = open === '$'
        const nextChar = src[endIdx + close.length]
        const isCurrencyRange = isDollar && isLikelyCurrencyRangeDollar(content, nextChar)
        const isPlaceholder = isDollar && isLikelyPlaceholderDollar(content)
        const shouldSkip = strict
          ? (hasBacktick || isEmpty || isCurrencyRange || isPlaceholder)
          : (hasBacktick || isEmpty || isCurrencyRange || isPlaceholder || (!isDollar && !isMathLike(content)))
        if (shouldSkip) {
          // push remaining text after last match
          // not math-like; skip this match and continue scanning
          searchPos = endIdx + close.length
          const text = src.slice(s.pos, searchPos)
          if (!s.pending) {
            pushText(text)
            // We consumed the skipped span as plain text; advance the "consumed"
            // cursor so subsequent matches don't re-push this prefix.
            preMathPos = searchPos
          }
          continue
        }
        foundAny = true

        if (!silent) {
          // push text before this math
          const before = src.slice(s.pos - (s.pending ?? '').length, index)
          // 如果 before 包含 单边的 ` ** 或 __ ，则直接跳过，交给 md 处理

          // const m = before.match(/(^|[^\\])(`+|__|\*\*)/)
          // if (m) {
          //   // If there is an unclosed code/emphasis marker before the
          //   // potential math opener, don't abort the whole inline rule
          //   // (which can cause the parser to repeatedly re-run this rule
          //   // leading to a loop). Instead skip this opener and continue
          //   // scanning after it so other rules can handle the content.
          //   searchPos = index + open.length
          //   continue
          // }

          // If we already consumed some content, avoid duplicating the prefix
          // Only push the portion from previous search position
          const prevConsumed = src.slice(0, searchPos)
          let toPushBefore = prevConsumed ? src.slice(preMathPos, index) : before
          const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1
          if (index !== s.pos && isStrongPrefix) {
            toPushBefore = s.pending + src.slice(s.pos, index)
          }
          const strongMarkerInfo = isStrongPrefix ? findLastUnescapedStrongMarker(toPushBefore) : null
          const strongMarker = strongMarkerInfo?.marker ?? '**'

          // strong prefix handling (preserve previous behavior)
          if (s.pending !== toPushBefore) {
            s.pending = ''
            if (isStrongPrefix) {
              if (strongMarkerInfo) {
                const after = toPushBefore.slice(strongMarkerInfo.index + strongMarker.length)
                pushText(toPushBefore.slice(0, strongMarkerInfo.index))
                const strongToken = s.push('strong_open', '', 0)
                strongToken.markup = strongMarker
                const textToken = s.push('text', '', 0)
                textToken.content = after
                s.push('strong_close', '', 0)
              }
              else {
                pushText(toPushBefore)
              }
            }
            else {
              pushText(toPushBefore)
            }
          }
          if (isStrongPrefix) {
            const strongToken = s.push('strong_open', '', 0)
            strongToken.markup = strongMarker
            const token = s.push('math_inline', 'math', 0)
            token.content = normalizeStandaloneBackslashT(content, mathOpts)
            token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
            token.raw = `${open}${content}${close}`
            token.loading = false
            const raw = src.slice(endIdx + close.length)
            const isBeforeClose = raw.startsWith(strongMarker)
            if (isBeforeClose) {
              s.push('strong_close', '', 0)
            }
            // Always advance cursor past the math span; otherwise when the math
            // is at end-of-line (raw === ''), we'd loop forever on the same opener.
            // 这里的 raw 可能还会有 math_inline, 应该交给后续的规则处理，直接 s.pos 到当前位置
            s.pos = preserveSpacesBeforeLineBreak(src, endIdx + close.length)
            searchPos = s.pos
            preMathPos = searchPos
            if (!isBeforeClose)
              s.push('strong_close', '', 0)
            // Leave the remaining inline suffix to markdown-it so later rules
            // (for example superscript, footnotes, or strong/emphasis) can
            // tokenize it normally instead of being collapsed into plain text.
            return true
          }
          else {
            const token = s.push('math_inline', 'math', 0)
            token.content = normalizeStandaloneBackslashT(content, mathOpts)
            token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
            token.raw = `${open}${content}${close}`
            token.loading = false
          }
        }

        searchPos = preserveSpacesBeforeLineBreak(src, endIdx + close.length)
        preMathPos = searchPos
        s.pos = searchPos
        // Do not consume the trailing suffix here. Returning now lets the
        // inline parser continue from the end of the math token so adjacent
        // markdown like `^[1]^`, `[^1]`, or `**strong**` is still parsed by
        // the normal rules.
        return true
      }

      if (foundAny) {
        if (!silent) {
          // Special handling for $$ rule: process remaining $ delimiters before pushing text
          // This is needed because the $ rule won't run after we return true
          if (open === '$$' && searchPos < src.length && src.slice(searchPos).includes('$')) {
            // Find and process all $...$ patterns in the remaining text
            let remainingPos = searchPos
            while (true) {
              if (remainingPos >= src.length)
                break
              const dollarIndex = findNextUnescapedDollar(src, remainingPos)
              if (dollarIndex === -1)
                break

              // Skip $$ patterns
              if (dollarIndex + 1 < src.length && src[dollarIndex + 1] === '$') {
                remainingPos = dollarIndex + 2
                continue
              }
              if (dollarIndex > 0 && src[dollarIndex - 1] === '$') {
                remainingPos = dollarIndex + 1
                continue
              }

              // Find matching closing $
              const closingDollarIndex = findSingleDollarClose(src, dollarIndex + 1)
              if (closingDollarIndex === -1)
                break

              // Valid $...$ pattern
              const content = src.slice(dollarIndex + 1, closingDollarIndex)
              const hasBacktick = content.includes('`')
              const isEmpty = !content || !content.trim()
              const nextChar = src[closingDollarIndex + 1]
              const isCurrencyRange = isLikelyCurrencyRangeDollar(content, nextChar)
              const isPlaceholder = isLikelyPlaceholderDollar(content)
              // For explicit $...$ delimiters, accept non-empty content
              // (e.g. "$H$", "$1$") even if the heuristic doesn't classify it
              // as "math-like".
              if (!hasBacktick && !isEmpty && !isCurrencyRange && !isPlaceholder) {
                // Push text before this $...$
                const before = src.slice(searchPos, dollarIndex)
                if (before) {
                  pushText(before)
                }
                // Push the $ math token
                const token = s.push('math_inline', 'math', 0)
                token.content = normalizeStandaloneBackslashT(content, mathOpts)
                token.markup = '$'
                token.raw = `$${content}$`
                token.loading = false
                searchPos = closingDollarIndex + 1
                remainingPos = closingDollarIndex + 1
              }
              else {
                // Not valid math; emit '$' and continue scanning.
                pushText('$')
                remainingPos = dollarIndex + 1
              }
            }

            // Push remaining text after all $...$ patterns
            if (remainingPos < src.length) {
              pushText(src.slice(remainingPos))
            }
          }
          else {
            // push remaining text after last match
            if (searchPos < src.length)
              pushText(src.slice(searchPos))
          }

          // consume the full inline source
          s.pos = src.length
        }
        else {
          // in silent mode, advance position past what we scanned
          s.pos = searchPos
        }

        return true
      }
    }

    return false
  }

  // Block math rule similar to previous implementation
  const mathBlock = (
    state: unknown,
    startLine: number,
    endLine: number,
    silent: boolean,
  ) => {
    const s = state as MathBlockState
    const allowLoading = !s?.env?.__markstreamFinal
    const strict = mathOpts?.strictDelimiters

    const delimiters: [string, string][] = strict
      ? [
          ['\\[', '\\]'],
          ['$$', '$$'],
        ]
      : [
          ['\\[', '\\]'],
          ['\[', '\]'],
          ['$$', '$$'],
        ]
    const startPos = s.bMarks[startLine] + s.tShift[startLine]
    let lineText = s.src.slice(startPos, s.eMarks[startLine]).trim()
    let matched = false
    let openDelim = ''
    let closeDelim = ''
    let skipFirstLine = false
    let prefixBeforeOpen = ''
    let tolerantBoundary = false
    for (const [open, close] of delimiters) {
      // 这里其实不应该只匹配 startWith的情况因为很可能前面还有 text
      if (lineText.startsWith(open)) {
        if (open.includes('[')) {
          if (mathOpts?.strictDelimiters) {
            if (lineText.replace('\\', '') === '[') {
              if (startLine + 1 < endLine) {
                matched = true
                openDelim = open
                closeDelim = close
                break
              }
              continue
            }
          }
          else {
            if (lineText.replace('\\', '') === '[') {
              if (startLine + 1 < endLine) {
                matched = true
                openDelim = open
                closeDelim = close
                break
              }
              continue
            }
            else {
              // inline math block
              // 排除 todo list 的情况
              const lastToken = s.tokens[s.tokens.length - 1]
              if (lastToken && lastToken.type === 'list_item_open' && lastToken.mark === '-' && lineText.slice(open.length, lineText.indexOf(']')).trim() === 'x') {
                continue
              }
              if (lineText.replace('\\', '').startsWith('[') && !lineText.includes('](')) {
                const closeIndex = lineText.indexOf(']')
                if (lineText.slice(closeIndex).trim() !== ']') {
                  continue
                }
                const inner = lineText.slice(open.length, closeIndex)
                const looksMath = open === '[' ? isPlainBracketMathLike(inner) : isMathLike(inner)
                if (looksMath) {
                  matched = true
                  openDelim = open
                  closeDelim = close
                  break
                }
                continue
              }
            }
          }
        }
        else {
          // When the stream parser re-processes a changed line that starts
          // with `$$`, the markdown-it block rule may be invoked for
          // a line that was already consumed as the *close* delimiter of a
          // tolerant same-line boundary on an earlier line. Without this guard,
          // the stream parser creates a duplicate math_block for the close.
          //
          let closesExistingTolerantMath = false
          const tolerantBoundaryStreamKey = typeof s.env?.[TOLERANT_BOUNDARY_STREAM_CACHE_KEY_ENV] === 'string'
            ? String(s.env[TOLERANT_BOUNDARY_STREAM_CACHE_KEY_ENV])
            : ''
          const fullSource = typeof s.env?.__markstreamSource === 'string'
            ? s.env.__markstreamSource
            : ''
          const hasStreamSource = fullSource.length > 0
          const fullSourceTailOffset = fullSource && fullSource !== s.src && fullSource.endsWith(s.src)
            ? fullSource.length - s.src.length
            : -1
          const fullSourceLineOffset = fullSourceTailOffset >= 0
            ? countLineBreaks(fullSource.slice(0, fullSourceTailOffset))
            : 0
          const rawCurrentLine = s.src.slice(s.bMarks[startLine], s.eMarks[startLine])
          const rawLineSearchStart = Math.max(0, startPos - s.bMarks[startLine])
          const closeIndexInCurrentLine = rawCurrentLine.indexOf(open, rawLineSearchStart)
          const absoluteStartLine = fullSourceLineOffset + startLine

          if (absoluteStartLine > 0 && closeIndexInCurrentLine !== -1 && open === '$$') {
            // map[1] is exclusive; a repaired close line can share it with the
            // next real display opener, so close ownership must come from the
            // boundary key or bounded source lookup.
            closesExistingTolerantMath = tolerantBoundaryKeyHasCloseAtLine(
              tolerantBoundaryStreamKey,
              absoluteStartLine,
              closeIndexInCurrentLine,
              open,
            )

            if (!closesExistingTolerantMath && hasStreamSource) {
              const sourceThroughDelimiter = fullSourceTailOffset >= 0
                ? fullSource.slice(0, fullSourceTailOffset + startPos + open.length)
                : s.src.slice(0, startPos + open.length)
              closesExistingTolerantMath = hasTolerantBoundaryCloseAtLine(
                sourceThroughDelimiter,
                absoluteStartLine,
                closeIndexInCurrentLine,
                open,
              )
            }
          }

          if (!closesExistingTolerantMath) {
            matched = true
            openDelim = open
            closeDelim = close
            break
          }
        }
      }
      // AI/LLM 输出中常见的异常格式：
      //   prefix text $
      //   E = mc^2
      //   $ suffix
      // 在 markdown-it block rule 层修复，避免 prefix/suffix 被吞掉。
      else if ((open === '$$' || open === '\\[') && lineText.endsWith(open) && startLine + 1 < endLine) {
        const openIndex = lineText.length - open.length
        if (isEscapedAt(lineText, openIndex) || isInsideCodeSpanOrUnclosedTail(lineText, openIndex))
          continue

        const before = lineText.slice(0, openIndex).replace(/[\t ]+$/, '')
        if (!before.trim())
          continue

        const codeSpanRanges = buildCodeSpanRanges(lineText)
        const previousOpenCount = countUnescapedDelimiter(lineText, open, 0, openIndex, codeSpanRanges)
        const previousCloseCount = open === '$$'
          ? 0
          : countUnescapedDelimiter(lineText, close, 0, openIndex, codeSpanRanges)

        if (open === '$$' ? previousOpenCount % 2 === 1 : previousOpenCount > previousCloseCount)
          continue

        prefixBeforeOpen = before
        tolerantBoundary = true

        const nextLineStartPos = s.bMarks[startLine + 1] + s.tShift[startLine + 1]
        lineText = s.src.slice(nextLineStartPos, s.eMarks[startLine + 1]).trim()
        skipFirstLine = true
        matched = true
        openDelim = open
        closeDelim = close
        break
      }
    }

    if (!matched)
      return false

    // Keep the old fast path for real line-start math blocks.
    //
    // For tolerant same-line boundaries (`prefix $$` / `prefix \[`), do not
    // return true in silent mode until the candidate has passed the same checks
    // as non-silent parsing. Otherwise markdown-it's paragraph rule can treat
    // ordinary prose lines ending in `$$` or `\[` as block terminators, split the
    // paragraph, and then the non-silent parse of that same line can still return
    // false after `looksMath`.
    if (silent && !tolerantBoundary)
      return true

    const startDelimIndex = lineText.indexOf(openDelim)
    const closeSearchStart = startDelimIndex + openDelim.length
    const escapedPlainBracketCloseIndex = !strict && openDelim === '['
      ? findUnescapedDelimiter(lineText, '\\]', closeSearchStart)
      : -1
    const sameLineCloseDelim = escapedPlainBracketCloseIndex >= 0 ? '\\]' : closeDelim
    const sameLineCloseIndex = escapedPlainBracketCloseIndex >= 0
      ? escapedPlainBracketCloseIndex
      : findUnescapedDelimiter(lineText, closeDelim, closeSearchStart)

    if (!skipFirstLine && sameLineCloseIndex > openDelim.length) {
      const content = lineText.slice(
        startDelimIndex + openDelim.length,
        sameLineCloseIndex,
      )
      const token = s.push('math_block', 'math', 0)
      token.content = normalizeStandaloneBackslashT(content)
      token.markup
        = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
      token.map = [startLine, startLine + 1]
      token.raw = `${openDelim}${content}${sameLineCloseDelim}`
      token.block = true
      token.loading = false
      s.line = startLine + 1

      const trailingAfterClose = lineText.slice(sameLineCloseIndex + sameLineCloseDelim.length)
      if (trailingAfterClose.trim())
        pushSyntheticInlineParagraph(s, trailingAfterClose, startLine)

      return true
    }

    let nextLine = startLine
    let content = ''
    let found = false
    let trailingAfterClose = ''
    let trailingAfterCloseLine = startLine
    let closeLineHasContentBeforeDelim = false

    const firstLineContent
      = skipFirstLine
        ? lineText
        : lineText === openDelim ? '' : lineText.slice(openDelim.length)
    const fallbackPlainBracketClose = !strict && openDelim === '\\[' ? ']' : ''

    const getSourceLine = (line: number) => {
      if (line < 0 || line >= endLine)
        return ''
      const lineStart = s.bMarks[line] + s.tShift[line]
      const lineEnd = s.eMarks[line]
      return s.src.slice(lineStart, lineEnd)
    }

    const firstLineNumber = skipFirstLine ? startLine + 1 : startLine
    if (
      tolerantBoundary
      && shouldAbortTolerantBoundaryScan(getSourceLine(firstLineNumber), startLine, firstLineNumber, '', getSourceLine(firstLineNumber + 1))
    ) {
      return false
    }

    const firstLineCloseIndex = findUnescapedDelimiter(firstLineContent, closeDelim)

    if (firstLineCloseIndex !== -1) {
      const endIndex = firstLineCloseIndex
      const beforeClose = firstLineContent.slice(0, endIndex)
      content = beforeClose
      trailingAfterClose = firstLineContent.slice(endIndex + closeDelim.length)
      closeLineHasContentBeforeDelim = !!beforeClose.trim()
      trailingAfterCloseLine = skipFirstLine ? startLine + 1 : startLine
      found = true
      nextLine = skipFirstLine ? startLine + 1 : startLine
    }
    else {
      if (firstLineContent && !skipFirstLine)
        content = firstLineContent

      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        const currentLine = getSourceLine(nextLine)
        const currentLineTrimmed = currentLine.trim()

        if (
          tolerantBoundary
          && shouldAbortTolerantBoundaryScan(getSourceLine(nextLine), startLine, nextLine, content, getSourceLine(nextLine + 1))
        ) {
          return false
        }

        const escapedPlainBracketCloseInLine = !strict && openDelim === '['
          ? findUnescapedDelimiter(currentLine, '\\]')
          : -1
        const closeIndexInLine = findUnescapedDelimiter(currentLine, closeDelim)
        const fallbackPlainBracketCloseInLine = fallbackPlainBracketClose
          ? findPlainBracketFallbackClose(currentLine)
          : -1
        if (!strict && openDelim === '[' && currentLineTrimmed === '\\]') {
          closeDelim = '\\]'
          found = true
          break
        }
        if (fallbackPlainBracketClose && currentLine.trim() === fallbackPlainBracketClose) {
          closeDelim = fallbackPlainBracketClose
          found = true
          break
        }
        if (fallbackPlainBracketCloseInLine !== -1) {
          closeDelim = fallbackPlainBracketClose
          found = true
          const beforeClose = currentLine.slice(0, fallbackPlainBracketCloseInLine)
          if (beforeClose.trim()) {
            content += (content ? '\n' : '') + beforeClose
            closeLineHasContentBeforeDelim = true
          }
          trailingAfterClose = currentLine.slice(fallbackPlainBracketCloseInLine + closeDelim.length)
          trailingAfterCloseLine = nextLine
          break
        }
        if (currentLineTrimmed === closeDelim) {
          found = true
          break
        }
        else if (escapedPlainBracketCloseInLine !== -1) {
          found = true
          const endIndex = escapedPlainBracketCloseInLine
          const beforeClose = currentLine.slice(0, endIndex)
          closeDelim = '\\]'
          if (beforeClose) {
            content += (content ? '\n' : '') + beforeClose
            closeLineHasContentBeforeDelim = !!beforeClose.trim()
          }
          trailingAfterClose = currentLine.slice(endIndex + closeDelim.length)
          trailingAfterCloseLine = nextLine
          break
        }
        else if (closeIndexInLine !== -1) {
          found = true
          const endIndex = closeIndexInLine
          const beforeClose = currentLine.slice(0, endIndex)
          if (beforeClose) {
            content += (content ? '\n' : '') + beforeClose
            closeLineHasContentBeforeDelim = !!beforeClose.trim()
          }
          trailingAfterClose = currentLine.slice(endIndex + closeDelim.length)
          trailingAfterCloseLine = nextLine
          break
        }

        content += (content ? '\n' : '') + currentLine
      }
    }

    // In strict mode or final mode, do not emit mid-state (unclosed) block math
    if ((!allowLoading || strict) && !found)
      return false

    // Standalone line-start $$ / \[ is a strong display math delimiter.
    // Only guard against empty-content ghost math_blocks (e.g. when an
    // intervening table was consumed by another rule before the math rule
    // reached the close delimiter). Real math content like "x" or "f _ { x }"
    // always deserves a loading token during streaming.
    if (allowLoading && !tolerantBoundary && !found && (openDelim === '$$' || openDelim === '\\[')) {
      if (!String(content ?? '').trim())
        return false
    }

    // 追加检测内容是否是 math
    // For explicit $$ delimiters, skip the isMathLike check since $$ is already
    // a clear math marker. This allows spaced subscript formats like "f _ { x }"
    // to be correctly recognized as math.
    // The same applies to explicit `\[` / `\]`: unlike non-strict plain `[`,
    // this is an intentional TeX display delimiter and should not be rejected
    // merely because the content has weak heuristic signals.
    // However, if the content starts with markdown special syntax like ![, skip.
    const hasMarkdownPrefix = /^\s*!\[/.test(content)
    const looksTolerantBoundaryMath = !tolerantBoundary
      || (found
        ? isLikelyTolerantExplicitMathBlockContent(content, true)
        : isPotentialTolerantPendingMathContent(content))

    const looksMath = openDelim === '$$' || openDelim === '\\['
      ? !hasMarkdownPrefix && looksTolerantBoundaryMath
      : (
          openDelim === '['
            ? isPlainBracketMathLike(content)
            : isMathLike(content)
        )
    if (!looksMath)
      return false

    if (silent)
      return true

    if (prefixBeforeOpen)
      pushSyntheticInlineParagraph(s, prefixBeforeOpen, startLine)

    const token = s.push('math_block', 'math', 0)
    token.content = normalizeStandaloneBackslashT(content)
    token.markup
      = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
    token.raw = `${openDelim}${content}${content.startsWith('\n') ? '\n' : ''}${closeDelim}`

    const consumedEndLine = found ? nextLine + 1 : endLine

    // Completed tolerant repairs keep non-overlapping maps for prefix/math/suffix.
    // Pending loading blocks include the opener line so stream tail reparse keeps
    // the tolerant-boundary context while content is still appending.
    const mapStartLine = tolerantBoundary
      ? (found ? firstLineNumber : startLine)
      : startLine

    let mapEndLine = consumedEndLine
    if (
      tolerantBoundary
      && found
      && trailingAfterClose.trim()
      && !closeLineHasContentBeforeDelim
    ) {
      mapEndLine = trailingAfterCloseLine
    }

    if (mapEndLine <= mapStartLine)
      mapEndLine = mapStartLine + 1

    token.map = [mapStartLine, mapEndLine]
    token.block = true
    token.loading = !found
    ;(token as TolerantMathToken).tolerantBoundary = tolerantBoundary
    s.line = consumedEndLine

    if (trailingAfterClose.trim())
      pushSyntheticInlineParagraph(s, trailingAfterClose, trailingAfterCloseLine)

    return true
  }

  const explicitMathBlockBeforeSetext = (
    state: unknown,
    startLine: number,
    endLine: number,
    silent: boolean,
  ) => {
    const s = state as MathBlockState
    const startPos = s.bMarks[startLine] + s.tShift[startLine]
    const lineText = s.src.slice(startPos, s.eMarks[startLine]).trim()

    if (!lineText.startsWith('$$') && !lineText.startsWith('\\['))
      return false

    return mathBlock(state, startLine, endLine, silent)
  }

  // Register math before the escape rule so inline math is tokenized
  // before markdown-it processes backslash escapes. This preserves
  // backslashes inside math content (e.g. "\\{") instead of having
  // the escape rule remove them from the token content.
  md.inline.ruler.before('escape', 'math', mathInline)
  md.block.ruler.before('lheading', 'explicit_math_block', explicitMathBlockBeforeSetext, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
  md.block.ruler.before('paragraph', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
}
