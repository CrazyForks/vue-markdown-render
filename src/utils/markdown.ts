import katex from 'katex'
import MarkdownIt from 'markdown-it'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItIns from 'markdown-it-ins'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import * as markdownItCheckbox from 'markdown-it-task-checkbox'
import { useSafeI18n } from '../composables/useSafeI18n'
import { renderKaTeXInWorker, setKaTeXCache } from '../workers/katexWorkerClient'

import {
  parseInlineTokens,
  parseMarkdownToStructure,
  processTokens,
} from './markdown-parser'
import { getMarkdown as factory } from './markdown/getMarkdown'
import 'katex/dist/katex.min.css'

// Re-export the node types for backward compatibility
export * from '../types'
export { parseInlineTokens, parseMarkdownToStructure, processTokens }

export interface GetMarkdownOptions {
  plugin?: Array<any>
  apply?: Array<(md: MarkdownIt) => void>
}

export function getMarkdown(msgId: string = `editor-${Date.now()}`, options: GetMarkdownOptions = {}) {
  // keep legacy behaviour but delegate to new factory and reapply project-specific rules
  const md = factory({})

  // apply user supplied plugins (md.use)
  if (Array.isArray(options.plugin)) {
    for (const p of options.plugin) {
      // allow both [plugin, opts] tuple or plugin function
      if (Array.isArray(p))
        md.use(p[0], p[1])
      else
        md.use(p)
    }
  }

  // apply user supplied apply functions to mutate the md instance (e.g. md.block.ruler.before(...))
  if (Array.isArray(options.apply)) {
    for (const fn of options.apply) {
      try {
        fn(md)
      }
      catch (e) {
        // swallow errors to preserve legacy behaviour; developers can see stack in console

        console.error('[getMarkdown] apply function threw an error', e)
      }
    }
  }

  // Re-apply a few project specific plugins that were previously always enabled
  md.use(markdownItSub)
  md.use(markdownItSup)
  md.use(markdownItMark)
  md.use(markdownItEmoji)
  const markdownItCheckboxPlugin
    = (markdownItCheckbox as any).default ?? markdownItCheckbox
  md.use(markdownItCheckboxPlugin)
  md.use(markdownItIns)
  md.use(markdownItFootnote)

  // Annotate fence tokens with unclosed meta using a lightweight line check
  md.core.ruler.after('block', 'mark_fence_closed', (state: any) => {
    const src: string = state.src as string
    const lines = src.split(/\r?\n/)
    for (const token of state.tokens) {
      if (token.type !== 'fence' || !token.map || !token.markup)
        continue
      const openLine: number = token.map[0]
      const endLine: number = token.map[1]
      const markup: string = token.markup
      const marker = markup[0]
      const minLen = markup.length
      // The closing line, if exists, should be the last line consumed by the block
      const lineIdx = Math.max(0, endLine - 1)
      const line = lines[lineIdx] ?? ''
      let i = 0
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
      let count = 0
      while (i + count < line.length && line[i + count] === marker) count++
      let j = i + count
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++
      const closed = endLine > openLine + 1 && count >= minLen && j === line.length
      token.meta = token.meta || {}
      token.meta.unclosed = !closed
      // also set a explicit `closed` boolean for compatibility with plugins/tests
      token.meta.closed = !!closed
    }
  })

  // wave rule (legacy)
  const waveRule = (state: any, silent: boolean) => {
    const start = state.pos
    if (state.src[start] !== '~')
      return false
    const prevChar = state.src[start - 1]
    const nextChar = state.src[start + 1]
    if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
      if (!silent) {
        const token = state.push('text', '', 0)
        token.content = '~'
      }
      state.pos += 1
      return true
    }
    return false
  }

  md.inline.ruler.before('sub', 'wave', waveRule)

  // custom fence that uses msgId for unique ids
  md.renderer.rules.fence = (tokens: any, idx: number) => {
    const { t } = useSafeI18n()
    const token = tokens[idx]
    const info = token.info ? token.info.trim() : ''
    const str = token.content
    const encodedCode = btoa(unescape(encodeURIComponent(str)))
    const language = info || 'text'
    const uniqueId = `editor-${msgId}-${idx}-${language}`

    return `<div class="code-block" data-code="${encodedCode}" data-lang="${language}" id="${uniqueId}">
      <div class="code-header">
        <span class="code-lang">${language.toUpperCase()}</span>
        <button class="copy-button" data-code="${encodedCode}">${t(
          'common.copy',
        )}</button>
      </div>
      <div class="code-editor"></div>
    </div>`
  }

  // reference rule (legacy)
  const referenceInline = (state: any, silent: boolean) => {
    if (state.src[state.pos] !== '[')
      return false
    const match = /^\[(\d+)\]/.exec(state.src.slice(state.pos))
    if (!match)
      return false
    if (!silent) {
      const id = match[1]
      const token = state.push('reference', 'span', 0)
      token.content = id
      token.markup = match[0]
    }
    state.pos += match[0].length
    return true
  }

  md.inline.ruler.before('escape', 'reference', referenceInline)
  md.renderer.rules.reference = (tokens: any, idx: number) => {
    const id = tokens[idx].content
    return `<span class="reference-link" data-reference-id="${id}" role="button" tabindex="0" title="Click to view reference">${id}</span>`
  }

  return md
}

export function getCommonMarkdown() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  })
  return md
}

export function renderMarkdown(md: MarkdownIt, content: string) {
  const html = md.render(content)

  const newHTML = html.replace(/\([^)]*\)/g, (match) => {
    const latex = match.slice(1, -1) // remove surrounding parentheses
    try {
      const data = katex.renderToString(latex, {
        throwOnError: true,
        displayMode: false,
      })
      return data
    }
    catch {
      return match
    }
  })
  return newHTML
}

// Async version that uses the KaTeX worker (if available) to render inline parentheses content
// to avoid blocking the main thread. Falls back to synchronous renderToString on worker failure.
export async function renderMarkdownAsync(md: MarkdownIt, content: string) {
  const html = md.render(content)

  const matches = [...html.matchAll(/\([^)]*\)/g)]
  if (matches.length === 0)
    return html

  // Kick off all renders in parallel (worker preferred), then apply replacements
  const renderPromises = matches.map((m) => {
    const latex = (m[0] || '').slice(1, -1)
    return (async () => {
      try {
        return await renderKaTeXInWorker(latex, false, 800)
      }
      catch (err: any) {
        // Only fallback to synchronous main-thread KaTeX render if the worker
        // couldn't be instantiated (init error). If the worker reported a
        // render/syntax error, we should not treat it as an init failure.
        if (err?.code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer) {
          try {
            const data = katex.renderToString(latex, {
              throwOnError: true,
              displayMode: false,
            })
            try {
              setKaTeXCache(latex, false, data)
            }
            catch {
              // ignore cache set errors
            }
            return data
          }
          catch {
            return null
          }
        }
        return null
      }
    })()
  })

  const results = await Promise.all(renderPromises)

  // Apply replacements in reverse order so indices remain valid
  let result = html
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    const start = m.index ?? 0
    const end = start + m[0].length
    const rendered = results[i]
    if (rendered)
      result = result.slice(0, start) + rendered + result.slice(end)
  }

  return result
}
