import type { MarkdownIt } from 'markdown-it-ts'
import markdownItContainer from 'markdown-it-container'

export function applyContainers(md: MarkdownIt) {
  ;[
    'admonition',
    'info',
    'warning',
    'error',
    'tip',
    'danger',
    'note',
    'caution',
  ].forEach((name) => {
    md.use(markdownItContainer, name, {
      render(tokens: unknown, idx: number) {
        const tokensAny = tokens as unknown as import('../types').MarkdownToken[]
        const token = tokensAny[idx]
        // `nesting` is a runtime-only property present on MarkdownIt tokens.
        // Narrow the shape with `unknown` -> specific minimal interface to avoid `as any`.
        const tokenShape = token as unknown as { nesting?: number }
        if (tokenShape.nesting === 1) {
          return `<div class="vmr-container vmr-container-${name}">`
        }
        else {
          return '</div>\n'
        }
      },
    })
  })

  // fallback for simple ::: blocks (kept for backwards compat)
  md.block.ruler.before(
    'fence',
    'vmr_container_fallback',
    (state: unknown, startLine: number, endLine: number, silent: boolean) => {
      interface ParserState {
        bMarks: number[]
        tShift: number[]
        eMarks: number[]
        src: string
        push: (type: string, tag?: string, nesting?: number) => any
        md: any
        line: number
      }
      const s = state as unknown as ParserState
      const startPos = s.bMarks[startLine] + s.tShift[startLine]
      const lineMax = s.eMarks[startLine]
      const line = s.src.slice(startPos, lineMax)

      // Match ::: container syntax: ::: name {"json"}
      // Using separate patterns to avoid backtracking issues
      const nameMatch = line.match(/^:::(\S+)/)
      if (!nameMatch)
        return false

      const name = nameMatch[1]
      // Validate name is not empty (handles edge case like ":::   ")
      if (!name.trim())
        return false

      const rest = line.slice(nameMatch[0].length)
      // Improved JSON matching: find balanced braces instead of simple non-greedy match
      let jsonStr: string | undefined
      const trimmedRest = rest.trim()
      if (trimmedRest.startsWith('{')) {
        let depth = 0
        let jsonEnd = -1
        for (let i = 0; i < trimmedRest.length; i++) {
          if (trimmedRest[i] === '{')
            depth++
          else if (trimmedRest[i] === '}')
            depth--
          if (depth === 0) {
            jsonEnd = i + 1
            break
          }
        }
        if (jsonEnd > 0) {
          jsonStr = trimmedRest.slice(0, jsonEnd)
        }
      }

      if (silent)
        return true

      let nextLine = startLine + 1
      let found = false
      while (nextLine <= endLine) {
        const sPos = s.bMarks[nextLine] + s.tShift[nextLine]
        const ePos = s.eMarks[nextLine]
        if (s.src.slice(sPos, ePos).trim() === ':::') {
          found = true
          break
        }
        nextLine++
      }
      if (!found)
        return false

      const tokenOpen = s.push('vmr_container_open', 'div', 1)
      // `tokenOpen` is runtime token object; keep using runtime helpers but avoid casting `s` to `any`.
      tokenOpen.attrSet('class', `vmr-container vmr-container-${name}`)

      // If JSON attributes are present, store them as data attributes
      if (jsonStr) {
        try {
          const attrs = JSON.parse(jsonStr)
          for (const [key, value] of Object.entries(attrs)) {
            tokenOpen.attrSet(`data-${key}`, String(value))
          }
        }
        catch {
          // If JSON parsing fails, store the raw string as a data attribute
          tokenOpen.attrSet('data-attrs', jsonStr)
        }
      }

      const contentLines: string[] = []
      for (let i = startLine + 1; i < nextLine; i++) {
        const sPos = s.bMarks[i] + s.tShift[i]
        const ePos = s.eMarks[i]
        contentLines.push(s.src.slice(sPos, ePos))
      }

      // Only render paragraph content if there's actual content (not just empty lines)
      const hasContent = contentLines.some(line => line.trim().length > 0)
      if (hasContent) {
        // Open a paragraph, push inline content and then close paragraph
        s.push('paragraph_open', 'p', 1)
        const inlineToken = s.push('inline', '', 0)
        inlineToken.content = contentLines.join('\n')
        inlineToken.map = [startLine + 1, nextLine]
        // Ensure children exist and parse the inline content into them so the renderer
        // won't encounter a null children array (which causes .length read errors).
        inlineToken.children = []
        s.md.inline.parse(inlineToken.content, s.md, (s as any).env, inlineToken.children)
        s.push('paragraph_close', 'p', -1)
      }

      s.push('vmr_container_close', 'div', -1)

      s.line = nextLine + 1
      return true
    },
  )
}
