import { getD2 } from './optional/d2'
import { getInfographic } from './optional/infographic'
import { getKatex } from './optional/katex'
import { getUseMonaco } from './optional/monaco'
import { getMermaid } from './optional/mermaid'
import { extractRenderedSvg, toSafeSvgMarkup } from './sanitizeSvg'

let mermaidRenderId = 0
const rootHandles = new WeakMap<HTMLElement, RenderedHtmlEnhancementHandle>()

const DARK_THEME_OVERRIDES: Record<string, string> = {
  N1: '#E5E7EB',
  N2: '#CBD5E1',
  N3: '#94A3B8',
  N4: '#64748B',
  N5: '#475569',
  N6: '#334155',
  N7: '#0B1220',
  B1: '#60A5FA',
  B2: '#3B82F6',
  B3: '#2563EB',
  B4: '#1D4ED8',
  B5: '#1E40AF',
  B6: '#111827',
  AA2: '#22D3EE',
  AA4: '#0EA5E9',
  AA5: '#0284C7',
  AB4: '#FBBF24',
  AB5: '#F59E0B',
}

const MONACO_LANGUAGE_ALIASES: Record<string, string> = {
  cjs: 'javascript',
  cts: 'typescript',
  d2lang: 'plaintext',
  js: 'javascript',
  jsonc: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  sh: 'shell',
  text: 'plaintext',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'plaintext',
  vue: 'html',
  yml: 'yaml',
}

export interface EnhanceRenderedHtmlOptions {
  final?: boolean
  isDark?: boolean
  renderCodeBlocksAsPre?: boolean
  monacoOptions?: Record<string, any>
  d2ThemeId?: number | null
  d2DarkThemeId?: number | null
  showTooltips?: boolean
  onCopy?: (code: string) => void
  isCancelled?: () => boolean
}

export interface RenderedHtmlEnhancementHandle {
  dispose: () => void
}

export async function enhanceRenderedHtml(
  root: HTMLElement,
  options: EnhanceRenderedHtmlOptions = {},
): Promise<RenderedHtmlEnhancementHandle> {
  disposeRenderedHtmlEnhancements(root)

  const cleanupFns: Array<() => void> = []
  let disposed = false
  const isActive = () => !disposed && options.isCancelled?.() !== true
  const handle: RenderedHtmlEnhancementHandle = {
    dispose: () => {
      if (disposed)
        return
      disposed = true
      for (let index = cleanupFns.length - 1; index >= 0; index -= 1) {
        try {
          cleanupFns[index]?.()
        }
        catch {
          // Best-effort cleanup only.
        }
      }
      if (rootHandles.get(root) === handle)
        rootHandles.delete(root)
    },
  }

  rootHandles.set(root, handle)

  if (!isActive())
    return handle

  await renderKatex(root, isActive)
  if (!isActive())
    return handle

  await renderMermaid(root, isActive)
  if (!isActive())
    return handle

  if (options.final !== false) {
    await renderInfographic(root, cleanupFns, options, isActive)
    if (!isActive())
      return handle

    await renderD2(root, cleanupFns, options, isActive)
    if (!isActive())
      return handle

    if (!options.renderCodeBlocksAsPre)
      await renderMonaco(root, cleanupFns, options, isActive)
  }

  return handle
}

export function disposeRenderedHtmlEnhancements(root: HTMLElement | null | undefined) {
  if (!root)
    return
  const existing = rootHandles.get(root)
  existing?.dispose()
}

async function renderKatex(root: HTMLElement, isActive: () => boolean) {
  const katex = await getKatex()
  if (!katex || !isActive())
    return

  const inlineNodes = Array.from(root.querySelectorAll<HTMLElement>('.markstream-nested-math'))
  for (const node of inlineNodes) {
    if (!isActive())
      return
    const source = (node.textContent || '').trim()
    if (!source)
      continue
    try {
      node.innerHTML = katex.renderToString(source, {
        displayMode: node.dataset.display === 'block',
        throwOnError: false,
      })
      node.dataset.markstreamKatex = '1'
    }
    catch {
      // Leave the plain source intact if KaTeX fails to render.
    }
  }

  const blockNodes = Array.from(root.querySelectorAll<HTMLElement>('.markstream-nested-math-block'))
  for (const node of blockNodes) {
    if (!isActive())
      return
    const source = (node.textContent || '').trim()
    if (!source)
      continue
    try {
      node.innerHTML = katex.renderToString(source, {
        displayMode: true,
        throwOnError: false,
      })
      node.dataset.markstreamKatex = '1'
      node.classList.add('markstream-nested-math-block--rendered')
    }
    catch {
      // Leave the plain source intact if KaTeX fails to render.
    }
  }
}

async function renderMermaid(root: HTMLElement, isActive: () => boolean) {
  const mermaid = await getMermaid({
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrorRendering: true,
  })
  if (!mermaid || !isActive())
    return

  const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre > code.language-mermaid'))
  for (const codeNode of codeNodes) {
    if (!isActive())
      return
    const container = codeNode.parentElement
    const source = (codeNode.textContent || '').trim()
    if (!container || !source)
      continue

    try {
      const renderId = `markstream-angular-mermaid-${++mermaidRenderId}`
      const rendered = await mermaid.render(renderId, source)
      if (!isActive())
        return
      const svg = typeof rendered === 'string' ? rendered : rendered?.svg
      if (!svg)
        continue
      container.innerHTML = svg
      container.classList.add('markstream-angular-mermaid')
      rendered?.bindFunctions?.(container)
    }
    catch {
      // Keep the original <pre><code> when Mermaid cannot render.
    }
  }
}

async function renderInfographic(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const InfographicClass = await getInfographic()
  if (!InfographicClass || !isActive())
    return

  const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre[data-markstream-code-block="1"] > code.language-infographic'))
  for (const codeNode of codeNodes) {
    if (!isActive())
      return
    const pre = codeNode.parentElement as HTMLElement | null
    const source = codeNode.textContent || ''
    if (!pre || !source.trim())
      continue

    const originalPre = pre.cloneNode(true) as HTMLElement
    const shell = createEnhancedBlockShell('infographic', 'Infographic', source, true, options)
    shell.body.style.minHeight = '320px'
    shell.body.style.height = '360px'
    pre.replaceWith(shell.wrapper)

    try {
      const instance = new InfographicClass({
        container: shell.body,
        width: '100%',
        height: '100%',
      })
      instance.render(source)

      let frameId: number | null = null
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frameId = window.requestAnimationFrame(() => {
          const actualHeight = shell.body.scrollHeight
          if (actualHeight > 0)
            shell.body.style.height = `${Math.min(Math.max(actualHeight, 260), 720)}px`
        })
      }

      cleanupFns.push(() => {
        if (frameId != null && typeof window !== 'undefined')
          window.cancelAnimationFrame(frameId)
        instance.destroy?.()
        if (shell.wrapper.isConnected)
          shell.wrapper.replaceWith(originalPre.cloneNode(true))
      })
      shell.wrapper.dataset.markstreamInfographic = '1'
    }
    catch {
      shell.wrapper.replaceWith(originalPre)
    }
  }
}

async function renderD2(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const D2Ctor = await getD2()
  if (!D2Ctor || !isActive())
    return

  const codeNodes = Array.from(root.querySelectorAll<HTMLElement>('pre[data-markstream-code-block="1"] > code.language-d2, pre[data-markstream-code-block="1"] > code.language-d2lang'))
  for (const codeNode of codeNodes) {
    if (!isActive())
      return
    const pre = codeNode.parentElement as HTMLElement | null
    const source = codeNode.textContent || ''
    if (!pre || !source.trim())
      continue

    const originalPre = pre.cloneNode(true) as HTMLElement
    const shell = createEnhancedBlockShell('d2', 'D2', source, true, options)
    pre.replaceWith(shell.wrapper)

    try {
      const instance = createD2Instance(D2Ctor)
      if (!instance || typeof instance.compile !== 'function' || typeof instance.render !== 'function')
        throw new TypeError('D2 instance is missing compile/render methods.')

      const compileResult = await instance.compile(source)
      const diagram = compileResult?.diagram ?? compileResult
      const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
      const resolvedThemeId = options.d2ThemeId ?? baseRenderOptions.themeID
      const resolvedDarkThemeId = options.d2DarkThemeId ?? baseRenderOptions.darkThemeID
      const renderOptions: Record<string, any> = { ...baseRenderOptions }
      renderOptions.themeID = options.isDark && resolvedDarkThemeId != null
        ? resolvedDarkThemeId
        : resolvedThemeId
      renderOptions.darkThemeID = null
      renderOptions.darkThemeOverrides = null
      if (options.isDark) {
        const baseOverrides = baseRenderOptions.themeOverrides && typeof baseRenderOptions.themeOverrides === 'object'
          ? baseRenderOptions.themeOverrides
          : null
        renderOptions.themeOverrides = {
          ...DARK_THEME_OVERRIDES,
          ...(baseOverrides || {}),
        }
      }

      const renderResult = await instance.render(diagram, renderOptions)
      if (!isActive())
        return
      const safeSvg = toSafeSvgMarkup(extractRenderedSvg(renderResult))
      if (!safeSvg)
        throw new Error('D2 render returned empty output.')

      shell.body.innerHTML = safeSvg
      shell.wrapper.dataset.markstreamD2 = '1'
      cleanupFns.push(() => {
        if (shell.wrapper.isConnected)
          shell.wrapper.replaceWith(originalPre.cloneNode(true))
      })
    }
    catch {
      shell.wrapper.replaceWith(originalPre)
    }
  }
}

async function renderMonaco(
  root: HTMLElement,
  cleanupFns: Array<() => void>,
  options: EnhanceRenderedHtmlOptions,
  isActive: () => boolean,
) {
  const monacoModule = await getUseMonaco()
  if (!monacoModule || typeof monacoModule.useMonaco !== 'function' || !isActive())
    return

  const preNodes = Array.from(root.querySelectorAll<HTMLElement>('pre[data-markstream-code-block="1"]'))
  for (const pre of preNodes) {
    if (!isActive())
      return
    const codeNode = pre.querySelector<HTMLElement>('code')
    if (!codeNode)
      continue

    const rawLanguage = resolveCodeLanguage(pre, codeNode)
    const normalizedLanguage = rawLanguage.trim().toLowerCase()
    if (normalizedLanguage === 'mermaid' || normalizedLanguage === 'infographic' || normalizedLanguage === 'd2' || normalizedLanguage === 'd2lang')
      continue

    const source = codeNode.textContent || ''
    const diff = pre.dataset.markstreamDiff === '1'
    const updatedCode = decodeDataPayload(pre.dataset.markstreamUpdated)
    const monacoLanguage = resolveMonacoLanguage(rawLanguage)
    const renderLanguage = diff ? 'plaintext' : monacoLanguage
    const shell = createEnhancedBlockShell(
      'code',
      diff ? `Diff / ${monacoLanguage}` : `Code / ${monacoLanguage}`,
      source,
      false,
      options,
    )
    shell.body.classList.add('markstream-angular-enhanced-block__body--code')
    shell.body.style.minHeight = `${estimateCodeBlockHeight(diff ? updatedCode || source : source, diff)}px`
    const originalPre = pre.cloneNode(true) as HTMLElement
    pre.replaceWith(shell.wrapper)

    const helpers = monacoModule.useMonaco({
      themes: ['vitesse-dark', 'vitesse-light'],
      languages: Array.from(new Set([monacoLanguage, 'plaintext'])),
      readOnly: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      wordWrap: 'off',
      revealDebounceMs: 75,
      MAX_HEIGHT: 500,
      fontSize: 13,
      ...(options.monacoOptions || {}),
    })

    try {
      // Vue/React wire Monaco diff editors through dedicated components.
      // Angular currently enhances static HTML after the fact, and the diff
      // editor path in stream-monaco can leave an empty shell or raise
      // "no diff result available" during worker setup. Prefer a stable
      // single-editor fallback that still preserves the diff source text.
      await helpers.createEditor(
        shell.body,
        source,
        renderLanguage,
      )
      if (!isActive())
        return

      await helpers.setTheme?.(options.isDark ? 'vitesse-dark' : 'vitesse-light')
      shell.wrapper.dataset.markstreamMonaco = '1'
      if (diff)
        shell.wrapper.dataset.markstreamMonacoDiff = '1'
      cleanupFns.push(() => {
        try {
          helpers.cleanupEditor?.()
        }
        finally {
          if (shell.wrapper.isConnected)
            shell.wrapper.replaceWith(originalPre.cloneNode(true))
        }
      })
    }
    catch {
      try {
        helpers.cleanupEditor?.()
      }
      catch {
        // Ignore cleanup failures during fallback.
      }
      shell.wrapper.replaceWith(originalPre)
    }
  }
}

function createD2Instance(D2Ctor: any) {
  if (typeof D2Ctor === 'function') {
    const instance = new D2Ctor()
    if (instance && typeof instance.compile === 'function')
      return instance
    if (typeof D2Ctor.compile === 'function')
      return D2Ctor
  }

  if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function')
    return new D2Ctor.D2()

  if (typeof D2Ctor?.compile === 'function')
    return D2Ctor

  return null
}

function resolveCodeLanguage(pre: HTMLElement, codeNode: HTMLElement) {
  const explicit = pre.dataset.markstreamLanguage?.trim()
  if (explicit)
    return explicit

  const languageClass = Array.from(codeNode.classList).find(className => className.startsWith('language-'))
  return languageClass ? languageClass.slice('language-'.length) : 'plaintext'
}

function resolveMonacoLanguage(language: string) {
  const normalized = language.trim().toLowerCase()
  return MONACO_LANGUAGE_ALIASES[normalized] || normalized || 'plaintext'
}

function estimateCodeBlockHeight(source: string, diff: boolean) {
  const lineCount = Math.max(1, source.split('\n').length)
  const perLine = diff ? 20 : 18
  const base = diff ? 180 : 96
  return Math.min(520, base + lineCount * perLine)
}

function decodeDataPayload(value: string | null | undefined) {
  if (!value)
    return ''

  const globalBuffer = (globalThis as any)?.Buffer
  if (globalBuffer?.from)
    return globalBuffer.from(value, 'base64').toString('utf8')

  if (typeof globalThis.atob === 'function' && typeof TextDecoder !== 'undefined') {
    const binary = globalThis.atob(value)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  return ''
}

function createEnhancedBlockShell(
  kind: 'code' | 'd2' | 'infographic',
  label: string,
  source: string,
  showSourceDetails: boolean,
  options: EnhanceRenderedHtmlOptions,
) {
  const wrapper = document.createElement('div')
  wrapper.className = `markstream-angular-enhanced-block markstream-angular-enhanced-block--${kind}`

  const header = document.createElement('div')
  header.className = 'markstream-angular-enhanced-block__header'

  const badge = document.createElement('span')
  badge.className = 'markstream-angular-enhanced-block__badge'
  badge.textContent = label

  header.appendChild(badge)
  header.appendChild(createHeaderActions(source, options))
  wrapper.appendChild(header)

  const body = document.createElement('div')
  body.className = 'markstream-angular-enhanced-block__body'
  wrapper.appendChild(body)

  if (showSourceDetails) {
    const details = document.createElement('details')
    details.className = 'markstream-angular-enhanced-block__details'

    const summary = document.createElement('summary')
    summary.textContent = 'Source'
    details.appendChild(summary)

    const sourcePre = document.createElement('pre')
    sourcePre.className = 'markstream-angular-enhanced-block__source'
    const code = document.createElement('code')
    code.textContent = source
    sourcePre.appendChild(code)
    details.appendChild(sourcePre)

    wrapper.appendChild(details)
  }

  return { wrapper, body }
}

function createHeaderActions(source: string, options: EnhanceRenderedHtmlOptions) {
  const actions = document.createElement('div')
  actions.className = 'markstream-angular-enhanced-block__actions'

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.className = 'markstream-angular-enhanced-block__action'
  copyButton.textContent = 'Copy'
  if (options.showTooltips !== false)
    copyButton.title = 'Copy source'

  copyButton.addEventListener('click', () => {
    void copyText(source)
    options.onCopy?.(source)
  })

  actions.appendChild(copyButton)
  return actions
}

async function copyText(source: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(source)
      return
    }
  }
  catch {
    // Fall through to the textarea fallback below.
  }

  if (typeof document === 'undefined')
    return

  const textarea = document.createElement('textarea')
  textarea.value = source
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  }
  catch {
    // Ignore copy failures; the output callback still fires.
  }
  finally {
    textarea.remove()
  }
}
