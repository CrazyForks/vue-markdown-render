import type MarkdownIt from 'markdown-it'
import type { MathOptions } from '../config'

import findMatchingClose from '../findMatchingClose'

// Heuristic to decide whether a piece of text is likely math.
// Matches common TeX commands, math operators, function-call patterns like f(x),
// superscripts/subscripts, and common math words.
// Common TeX formatting commands that take a brace argument, e.g. \boldsymbol{...}
// Keep this list in a single constant so it's easy to extend/test.
export const TEX_BRACE_COMMANDS = [
  'mathbf',
  'boldsymbol',
  'mathbb',
  'mathcal',
  'mathfrak',
  'mathrm',
  'mathit',
  'mathsf',
  'vec',
  'hat',
  'bar',
  'tilde',
  'overline',
  'underline',
  'mathscr',
  'mathnormal',
  'operatorname',
  'mathbf*',
]

// Precompute an escaped, |-joined string of TEX brace commands so we don't
// rebuild it on every call to `isMathLike`.
export const ESCAPED_TEX_BRACE_COMMANDS = TEX_BRACE_COMMANDS.map(c => c.replace(/[.*+?^${}()|[\\]"\]/g, '\\$&')).join('|')

// Common KaTeX/TeX command names that might lose their leading backslash.
// Keep this list conservative to avoid false-positives in normal text.
export const KATEX_COMMANDS = [
  'ldots',
  'cdots',
  'quad',
  'in',
  'infty',
  'perp',
  'mid',
  'operatorname',
  'to',
  'rightarrow',
  'leftarrow',
  'math',
  'mathrm',
  'mathbf',
  'mathit',
  'mathbb',
  'mathcal',
  'mathfrak',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'lambda',
  'sum',
  'prod',
  'int',
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
  'lim',
  'frac',
  'text',
  'left',
  'right',
  'times',
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

// Hoisted map of control characters -> escaped letter (e.g. '\t' -> 't').
// Kept at module scope to avoid recreating on every normalization call.
const CONTROL_MAP: Record<string, string> = {
  '\t': 't',
  '\r': 'r',
  '\b': 'b',
  '\f': 'f',
  '\v': 'v',
}

// Precompiled regexes for isMathLike to avoid reconstructing them per-call
// and prebuilt default regexes for normalizeStandaloneBackslashT when the
// default command set is used.
const TEX_CMD_RE = /\\[a-z]+/i
const PREFIX_CLASS = '(?:\\\\|\\u0008)'
const TEX_CMD_WITH_BRACES_RE = new RegExp(`${PREFIX_CLASS}(?:${ESCAPED_TEX_BRACE_COMMANDS})\\s*\\{[^}]+\\}`, 'i')
// Detect brace-taking TeX commands even when the leading backslash or the
// closing brace/content is missing (e.g. "operatorname{" or "operatorname{span").
// This helps the heuristic treat incomplete but clearly TeX-like fragments
// as math-like instead of plain text.
const TEX_BRACE_CMD_START_RE = new RegExp(`(?:${PREFIX_CLASS})?(?:${ESCAPED_TEX_BRACE_COMMANDS})\s*\{`, 'i')
const TEX_SPECIFIC_RE = /\\(?:text|frac|left|right|times)/
const SUPER_SUB_RE = /\^|_/
// Match common math operator symbols or named commands.
// Avoid treating the C/C++ increment operator ("++") as a math operator by
// ensuring a lone '+' isn't matched when it's part of a '++' sequence.
// Use a RegExp constructed from a string to avoid issues escaping '/' in a
// regex literal on some platforms/linters.
// eslint-disable-next-line prefer-regex-literals
const OPS_RE = new RegExp('(?<!\\+)\\+(?!\\+)|[=\\-*/^<>]|\\\\times|\\\\pm|\\\\cdot|\\\\le|\\\\ge|\\\\neq')
const FUNC_CALL_RE = /[A-Z]+\s*\([^)]+\)/i
const WORDS_RE = /\b(?:sin|cos|tan|log|ln|exp|sqrt|frac|sum|lim|int|prod)\b/
// Heuristic to detect common date/time patterns like 2025/9/30 21:37:24 and
// avoid classifying them as math merely because they contain '/' or ':'
const DATE_TIME_RE = /\b\d{4}\/\d{1,2}\/\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/

export function isMathLike(s: string) {
  if (!s)
    return false

  // Normalize accidental control characters that may appear if a single
  // backslash sequence was interpreted in a JS string literal (for example
  // '\\b' becoming a backspace U+0008). Convert such control characters
  // back into their two-character escaped forms so our regexes can match
  // TeX commands reliably.
  // eslint-disable-next-line no-control-regex
  const norm = s.replace(/\u0008/g, '\\b')
  const stripped = norm.trim()

  // quick bailouts
  // If the content looks like a timestamp or date, it's not math.
  if (DATE_TIME_RE.test(stripped))
    return false
  if (stripped.length > 2000)
    return true // very long blocks likely math

  // TeX commands e.g. \frac, \alpha
  const texCmd = TEX_CMD_RE.test(norm)
  const texCmdWithBraces = TEX_CMD_WITH_BRACES_RE.test(norm)
  const texBraceStart = TEX_BRACE_CMD_START_RE.test(norm)

  // Explicit common TeX tokens (keeps compatibility with previous heuristic)
  const texSpecific = TEX_SPECIFIC_RE.test(norm)
  // caret or underscore for super/subscripts
  const superSub = SUPER_SUB_RE.test(norm)
  // common math operator symbols or named commands
  const ops = OPS_RE.test(norm)
  // function-like patterns: f(x), sin(x)
  const funcCall = FUNC_CALL_RE.test(norm)
  // common math words
  const words = WORDS_RE.test(norm)

  return texCmd || texCmdWithBraces || texBraceStart || texSpecific || superSub || ops || funcCall || words
}

export function normalizeStandaloneBackslashT(s: string, opts?: MathOptions) {
  const commands = opts?.commands ?? KATEX_COMMANDS
  const escapeExclamation = opts?.escapeExclamation ?? true

  const useDefault = opts?.commands == null

  // Build or reuse regex: match control chars or unescaped command words.
  let re: RegExp
  if (useDefault) {
    re = new RegExp(`${CONTROL_CHARS_CLASS}|(?<!\\\\|\\w)(${ESCAPED_KATEX_COMMANDS})\\b`, 'g')
  }
  else {
    const commandPattern = `(?:${commands.slice().sort((a, b) => b.length - a.length).map(c => c.replace(/[.*+?^${}()|[\\]\\"\]/g, '\\$&')).join('|')})`
    re = new RegExp(`${CONTROL_CHARS_CLASS}|(?<!\\\\|\\w)(${commandPattern})\\b`, 'g')
  }

  let out = s.replace(re, (m: string, cmd?: string) => {
    if (CONTROL_MAP[m] !== undefined)
      return `\\${CONTROL_MAP[m]}`
    if (cmd && commands.includes(cmd))
      return `\\${cmd}`
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
  const braceEscaped = useDefault
    ? [ESCAPED_TEX_BRACE_COMMANDS, ESCAPED_KATEX_COMMANDS].filter(Boolean).join('|')
    : [commands.map(c => c.replace(/[.*+?^${}()|[\\]\\\]/g, '\\$&')).join('|'), ESCAPED_TEX_BRACE_COMMANDS].filter(Boolean).join('|')
  let result = out
  if (braceEscaped) {
    const braceCmdRe = new RegExp(`(^|[^\\\\])(${braceEscaped})\\s*\\{`, 'g')
    result = result.replace(braceCmdRe, (_m: string, p1: string, p2: string) => `${p1}\\${p2}{`)
  }
  result = result.replace(/span\{([^}]+)\}/, 'span\\{$1\\}')
    .replace(/\\operatorname\{span\}\{((?:[^{}]|\{[^}]*\})+)\}/, '\\operatorname{span}\\{$1\\}')
  return result
}
export function applyMath(md: MarkdownIt, mathOpts?: MathOptions) {
  // Inline rule for \(...\) and $$...$$ and $...$
  const mathInline = (state: any, silent: boolean) => {
    if (state.src.includes('\n')) {
      return false
    }
    const delimiters: [string, string][] = [
      ['$$', '$$'],
      ['\\(', '\\)'],
      ['\(', '\)'],
    ]
    let searchPos = 0
    let jump = true
    // use findMatchingClose from util
    for (const [open, close] of delimiters) {
      // We'll scan the entire inline source and tokenize all occurrences
      const src = state.src
      let foundAny = false
      const pushText = (text: string) => {
        if (!text)
          return
        const strongMatch = text.match(/^(\*+)([^*]+)\*+/)
        if (strongMatch) {
          const strongToken = state.push('strong_open', '', 0)
          strongToken.markup = strongMatch[1]
          const strongTextToken = state.push('text', '', 0)
          strongTextToken.content = strongMatch[2]
          const strongCloseToken = state.push('strong_close', '', 0)
          strongCloseToken.markup = strongMatch[1]
          text = text.slice(strongMatch[0].length)
          if (text) {
            const t = state.push('text', '', 0)
            t.content = text
          }
          return
        }
        const t = state.push('text', '', 0)
        t.content = text
      }

      while (true) {
        if (searchPos >= src.length)
          break
        const index = src.indexOf(open, searchPos)
        if (index === -1)
          break

        // If the delimiter is immediately preceded by a ']' (possibly with
        // intervening spaces), it's likely part of a markdown link like
        // `[text](...)`, so we should not treat this '(' as the start of
        // an inline math span. Also guard the index to avoid OOB access.
        if (index > 0) {
          let i = index - 1
          // skip spaces between ']' and the delimiter
          while (i >= 0 && src[i] === ' ')
            i--
          if (i >= 0 && src[i] === ']')
            return false
        }
        // 有可能遇到 \((\operatorname{span}\\{\boldsymbol{\alpha}\\})^\perp\)
        // 这种情况，前面的 \( 是数学公式的开始，后面的 ( 是普通括号
        // endIndex 需要找到与 open 对应的 close
        // 不能简单地用 indexOf 找到第一个 close — 需要处理嵌套与转义字符
        const endIdx = findMatchingClose(src, index + open.length, open, close)
        if (endIdx === -1) {
          // loading 状态的 math，没有找到匹配的结尾
          const preSearchPos = searchPos
          // no matching close for this opener; skip forward
          searchPos = index + open.length
          const content = src.slice(searchPos)
          if (isMathLike(content)) {
            foundAny = true
            if (!silent) {
              if (preSearchPos)
                pushText(src.slice(preSearchPos, searchPos))
              else
                pushText(src.slice(0, index))
              const token = state.push('math_inline', 'math', 0)
              token.content = normalizeStandaloneBackslashT(content, mathOpts)
              token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
              token.loading = true
              // consume the full inline source
              state.pos = src.length
            }
            searchPos = src.length
            // break
          }
          else {
            pushText(src.slice(preSearchPos, searchPos))
          }
          break
        }
        const content = src.slice(index + open.length, endIdx)
        if (!isMathLike(content)) {
          // push remaining text after last match
          // not math-like; skip this match and continue scanning
          const temp = searchPos
          searchPos = endIdx + close.length
          if (!src.includes(open, endIdx + close.length)) {
            const text = src.slice(temp, searchPos)
            if (!state.pending && state.pos + open.length < searchPos)
              pushText(text)
            if (jump)
              return false
          }
          continue
        }
        foundAny = true

        if (!silent) {
          jump = false
          // push text before this math
          const before = src.slice(0, index)
          // If we already consumed some content, avoid duplicating the prefix
          // Only push the portion from previous search position
          const prevConsumed = src.slice(0, searchPos)
          // Determine whether there's an unclosed strong opener (**) or (__)
          // before this math delimiter. We only want to treat a prefix as a
          // strong-open when the number of unescaped strong markers in the
          // preceding segment is odd (i.e. there's an unmatched opener). This
          // avoids treating a fully paired `**bold**` as an open prefix.
          const countUnescapedStrong = (s: string) => {
            const re = /(^|[^\\])(__|\*\*)/g
            let m: RegExpExecArray | null
            let c = 0
            // eslint-disable-next-line unused-imports/no-unused-vars
            while ((m = re.exec(s)) !== null) {
              c++
            }
            return c
          }

          let toPushBefore = prevConsumed ? src.slice(searchPos, index) : before
          const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1
          if (index !== state.pos && isStrongPrefix) {
            toPushBefore = src.slice(state.pos, index)
          }

          // strong prefix handling (preserve previous behavior)
          if (state.pending !== toPushBefore)
            pushText(isStrongPrefix ? toPushBefore.replace(/^\*+/, '') : toPushBefore)

          const token = state.push('math_inline', 'math', 0)
          token.content = normalizeStandaloneBackslashT(content, mathOpts)
          token.markup = open === '$$' ? '$$' : open === '\\(' ? '\\(\\)' : open === '$' ? '$' : '()'
          token.loading = false
          // we'll handle the trailing text after loop; but to preserve the
          // original behaviour when strong prefix was detected, mimic it here
          if (isStrongPrefix) {
            const textToken = state.push('strong_open', '', 0)
            textToken.markup = src.slice(0, index + 2)
            const textContentToken = state.push('text', '', 0)
            textContentToken.content = src.slice(endIdx + close.length).replace(/\*+$/, '')
            state.push('strong_close', '', 0)
            // since we've pushed the remainder as part of strong, we're done
            state.pos = src.length
            searchPos = src.length
            continue
          }

          // advance searchPos to continue scanning after this match
        }

        searchPos = endIdx + close.length
        // continue scanning for further matches
      }

      if (foundAny) {
        if (!silent) {
          // push remaining text after last match
          if (searchPos < src.length)
            pushText(src.slice(searchPos))
          // consume the full inline source
          state.pos = src.length
        }
        else {
          // in silent mode, advance position past what we scanned
          state.pos = searchPos
        }

        return true
      }
    }

    return false
  }

  // Block math rule similar to previous implementation
  const mathBlock = (
    state: any,
    startLine: number,
    endLine: number,
    silent: boolean,
  ) => {
    const delimiters: [string, string][] = [
      ['\\[', '\\]'],
      ['\[', '\]'],
      ['$$', '$$'],
    ]

    const startPos = state.bMarks[startLine] + state.tShift[startLine]
    const lineText = state.src.slice(startPos, state.eMarks[startLine]).trim()
    let matched = false
    let openDelim = ''
    let closeDelim = ''

    for (const [open, close] of delimiters) {
      if (lineText === open || lineText.startsWith(open)) {
        if (open === '[') {
          if (lineText === '[') {
            if (startLine + 1 < endLine) {
              const nextLineStart
                = state.bMarks[startLine + 1] + state.tShift[startLine + 1]
              const nextLineText = state.src.slice(
                nextLineStart,
                state.eMarks[startLine + 1],
              )
              if (isMathLike(nextLineText.trim())) {
                matched = true
                openDelim = open
                closeDelim = close
                break
              }
            }
            continue
          }
        }
        else {
          matched = true
          openDelim = open
          closeDelim = close
          break
        }
      }
    }

    if (!matched)
      return false
    if (silent)
      return true

    if (
      lineText.includes(closeDelim)
      && lineText.indexOf(closeDelim) > openDelim.length
    ) {
      const startDelimIndex = lineText.indexOf(openDelim)
      const endDelimIndex = lineText.indexOf(
        closeDelim,
        startDelimIndex + openDelim.length,
      )
      const content = lineText.slice(
        startDelimIndex + openDelim.length,
        endDelimIndex,
      )

      const token: any = state.push('math_block', 'math', 0)
      token.content = normalizeStandaloneBackslashT(content)
      token.markup
        = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
      token.map = [startLine, startLine + 1]
      token.block = true
      token.loading = false
      state.line = startLine + 1
      return true
    }

    let nextLine = startLine
    let content = ''
    let found = false

    const firstLineContent
      = lineText === openDelim ? '' : lineText.slice(openDelim.length)

    if (firstLineContent.includes(closeDelim)) {
      const endIndex = firstLineContent.indexOf(closeDelim)
      content = firstLineContent.slice(0, endIndex)
      found = true
      nextLine = startLine
    }
    else {
      if (firstLineContent)
        content = firstLineContent

      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
        const lineEnd = state.eMarks[nextLine]
        const currentLine = state.src.slice(lineStart - 1, lineEnd)
        if (currentLine.trim() === closeDelim) {
          found = true
          break
        }
        else if (currentLine.includes(closeDelim)) {
          found = true
          const endIndex = currentLine.indexOf(closeDelim)
          content += (content ? '\n' : '') + currentLine.slice(0, endIndex)
          break
        }
        content += (content ? '\n' : '') + currentLine
      }
    }

    const token: any = state.push('math_block', 'math', 0)
    token.content = normalizeStandaloneBackslashT(content)
    token.markup
      = openDelim === '$$' ? '$$' : openDelim === '[' ? '[]' : '\\[\\]'
    token.map = [startLine, nextLine + 1]
    token.block = true
    token.loading = !found
    state.line = nextLine + 1
    return true
  }

  // Register math before the escape rule so inline math is tokenized
  // before markdown-it processes backslash escapes. This preserves
  // backslashes inside math content (e.g. "\\{") instead of having
  // the escape rule remove them from the token content.
  md.inline.ruler.before('escape', 'math', mathInline)
  md.block.ruler.before('paragraph', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
}
