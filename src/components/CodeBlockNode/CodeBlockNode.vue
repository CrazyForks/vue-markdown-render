<script setup lang="ts">
import type { CodeBlockMonacoTheme, CodeBlockNodeProps } from '../../types/component-props'
import CodeBlockShell from './CodeBlockShell.vue'
import type { MonacoDiffEditorViewLike, MonacoDisposableLike, MonacoEditorViewLike, MonacoNamespaceLike, MonacoRuntimeOptions } from './monaco'
// Avoid static import of `stream-monaco` for types so the runtime bundle
// doesn't get a reference. Define minimal local types we need here.
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onUnmounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
// Tooltip is provided as a singleton via composable to avoid many DOM nodes
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getLanguageIcon, languageIconsRevision, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId } from '../../utils'
import { safeCancelRaf, safeRaf } from '../../utils/safeRaf'
import PreCodeNode from '../PreCodeNode'
import HtmlPreviewFrame from './HtmlPreviewFrame.vue'
import {
  getUseMonaco,

} from './monaco'
import { scheduleGlobalMonacoTheme } from './monacoThemeScheduler'

const props = withDefaults(
  defineProps<CodeBlockNodeProps & {
    estimatedHeightPx?: number
    estimatedContentHeightPx?: number
  }>(),
  {
    isShowPreview: true,
    darkTheme: 'vitesse-dark',
    lightTheme: 'vitesse-light',
    isDark: false,
    loading: true,
    stream: true,
    enableFontSizeControl: true,
    minWidth: undefined,
    maxWidth: undefined,
    // Header configuration: allow consumers to toggle built-in buttons and header visibility
    showHeader: true,
    showCopyButton: true,
    showExpandButton: true,
    showPreviewButton: true,
    showCollapseButton: true,
    showFontSizeButtons: true,
  },
)

const emits = defineEmits(['previewCode', 'copy'])

// Chrome warns when Monaco registers non-passive touchstart listeners.
// Patch the editor host so touch handlers default to passive for Monaco roots.
const MONACO_TOUCH_PATCH_FLAG = '__markstreamMonacoPassiveTouch__'

function ensureMonacoPassiveTouchListeners() {
  try {
    const globalObj = window as Window
    const flagStore = globalObj as unknown as Record<string, unknown>
    if (flagStore[MONACO_TOUCH_PATCH_FLAG])
      return
    const proto = window.Element?.prototype
    const nativeAdd = proto?.addEventListener
    if (!proto || !nativeAdd)
      return
    proto.addEventListener = function patchedMonacoTouchStart(
      this: Element,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === 'touchstart' && shouldForcePassiveForMonaco(this, options))
        return nativeAdd.call(this, type, listener, withPassiveOptions(options))
      return nativeAdd.call(this, type, listener, options)
    }
    flagStore[MONACO_TOUCH_PATCH_FLAG] = true
  }
  catch {}
}

function shouldForcePassiveForMonaco(target: EventTarget | null, options?: boolean | AddEventListenerOptions) {
  if (!target)
    return false
  const el = target as Element
  if (typeof el.closest !== 'function')
    return false
  if (!el.closest('.monaco-editor, .monaco-diff-editor'))
    return false
  if (options && typeof options === 'object' && 'passive' in options)
    return false
  return true
}

function withPassiveOptions(options?: boolean | AddEventListenerOptions): AddEventListenerOptions {
  if (options == null)
    return { passive: true }
  if (typeof options === 'boolean')
    return { capture: options, passive: true }
  if (typeof options === 'object') {
    if ('passive' in options)
      return options
    return { ...options, passive: true }
  }
  return { passive: true }
}

function warnCodeBlockDev(context: string, error: unknown) {
  if (import.meta.env?.DEV)
    console.warn(`[markstream-vue] ${context}:`, error)
}

const instance = getCurrentInstance()
const hasPreviewListener = computed(() => {
  const props = instance?.vnode.props as Record<string, unknown> | null | undefined
  return !!(props && (props.onPreviewCode || props.onPreviewCode))
})
const { t } = useSafeI18n()
// No mermaid-specific handling here; NodeRenderer routes mermaid blocks.
const codeEditor = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const copyText = ref(false)
// local tooltip logic removed; use shared `showTooltipForAnchor` / `hideTooltip`

const codeLanguage = ref(normalizeLanguageIdentifier(props.node.language))
const monacoLanguage = computed(() => resolveMonacoLanguageId(codeLanguage.value))
const isPlainTextLanguage = computed(() => monacoLanguage.value === 'plaintext')
const isExpanded = ref(false)
const isCollapsed = ref(false)
const editorCreated = ref(false)
const editorMounted = ref(false)
const monacoReady = ref(false)
let isUnmounted = false
let expandRafId: number | null = null
let deferredHeightSyncRafId: number | null = null
const heightBeforeCollapse = ref<number | null>(null)
let resumeGuardFrames = 0
const registerVisibility = useViewportPriority()
const viewportHandle = ref<ReturnType<typeof registerVisibility> | null>(null)
const viewportReady = ref(typeof window === 'undefined')
if (typeof window !== 'undefined') {
  watch(
    () => container.value,
    (el) => {
      viewportHandle.value?.destroy()
      viewportHandle.value = null
      if (!el) {
        viewportReady.value = false
        return
      }
      const handle = registerVisibility(el, { rootMargin: '400px' })
      viewportHandle.value = handle
      viewportReady.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        viewportReady.value = true
      })
    },
    { immediate: true },
  )
}
onBeforeUnmount(() => {
  isUnmounted = true
  viewportHandle.value?.destroy()
  viewportHandle.value = null
})

// Lazy-load `stream-monaco` helpers at runtime so consumers who don't install
// `stream-monaco` won't have the editor code bundled. We provide safe no-op
// fallbacks for the minimal API we use.
let createEditor: ((el: HTMLElement, code: string, lang: string) => Promise<unknown> | unknown) | null = null
let createDiffEditor: ((el: HTMLElement, original: string, modified: string, lang: string) => Promise<unknown> | unknown) | null = null
let updateCode: (code: string, lang: string) => Promise<unknown> | unknown = () => {}
let updateDiffCode: (original: string, modified: string, lang: string) => Promise<unknown> | unknown = () => {}
let getEditor: () => MonacoNamespaceLike | null = () => null
let getEditorView: () => MonacoEditorViewLike | null = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let getDiffEditorView: () => MonacoDiffEditorViewLike | null = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let cleanupEditor: () => void = () => {}
let safeClean = () => {}
let refreshDiffPresentation: () => void = () => {}
let createEditorPromise: Promise<void> | null = null
let detectLanguage: (code: string) => string = () => String(props.node.language ?? 'plaintext')
let setTheme: (theme: CodeBlockMonacoTheme | undefined) => Promise<void> | void = async () => {}
const editorHeightSyncDisposables: MonacoDisposableLike[] = []
const inlineFoldProxyCleanups: Array<() => void> = []
let runtimeMonacoOptions: MonacoRuntimeOptions | null = null
const isDiff = computed(() => props.node.diff)
const diffStats = ref({ removed: 0, added: 0 })
const diffStatsAriaLabel = computed(() => `-${diffStats.value.removed} +${diffStats.value.added}`)
const defaultDiffHideUnchangedRegions = Object.freeze({
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 5,
})
function resolveDiffHideUnchangedRegionsOption(value: unknown) {
  if (typeof value === 'boolean')
    return value
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>
    return {
      ...defaultDiffHideUnchangedRegions,
      ...raw,
      enabled: raw.enabled ?? true,
    }
  }
  return { ...defaultDiffHideUnchangedRegions }
}
const resolvedMonacoOptions = computed(() => {
  const raw = props.monacoOptions ? { ...props.monacoOptions } : {}
  if (!isDiff.value)
    return raw
  const diffHideUnchangedRegions = raw.diffHideUnchangedRegions === undefined
    ? { ...defaultDiffHideUnchangedRegions }
    : resolveDiffHideUnchangedRegionsOption(raw.diffHideUnchangedRegions)
  const hideUnchangedRegions = raw.hideUnchangedRegions === undefined
    ? undefined
    : resolveDiffHideUnchangedRegionsOption(raw.hideUnchangedRegions)
  const diffUnchangedRegionStyle = raw.diffUnchangedRegionStyle ?? 'line-info'
  const needsExtraBottomSpace
    = diffUnchangedRegionStyle === 'line-info'
      || diffUnchangedRegionStyle === 'line-info-basic'
      || diffUnchangedRegionStyle === 'metadata'
  const diffDefaults = {
    maxComputationTime: 0,
    diffAlgorithm: 'legacy',
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    diffUpdateThrottleMs: 120,
    renderLineHighlight: 'none',
    renderLineHighlightOnlyWhenFocus: true,
    selectionHighlight: false,
    occurrencesHighlight: 'off',
    matchBrackets: 'never',
    lineDecorationsWidth: 12,
    lineNumbersMinChars: 2,
    glyphMargin: false,
    fontSize: 13,
    lineHeight: 30,
    renderOverviewRuler: false,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    scrollBeyondLastLine: false,
    padding: { top: 10, bottom: needsExtraBottomSpace ? 22 : 14 },
    diffHideUnchangedRegions,
    diffLineStyle: 'background',
    diffAppearance: 'auto',
    diffUnchangedRegionStyle,
    diffHunkActionsOnHover: true,
    diffHunkHoverHideDelayMs: 160,
  }
  return {
    ...diffDefaults,
    ...raw,
    ...(hideUnchangedRegions === undefined ? {} : { hideUnchangedRegions }),
    diffHideUnchangedRegions,
  }
})

// In streaming scenarios, the opening fence info string can arrive in chunks
// (e.g. "```d" then "iff json:..."), which means a block may flip between
// single <-> diff after the component has mounted. Monaco editors can't switch
// kind in-place, so we recreate the editor when the kind changes.
const desiredEditorKind = computed<'diff' | 'single'>(() => (isDiff.value ? 'diff' : 'single'))
const currentEditorKind = ref<'diff' | 'single'>(desiredEditorKind.value)
const usePreCodeRender = ref(false)
const preFallbackWrap = computed(() => {
  const wordWrap = props.monacoOptions?.wordWrap
  // Keep consistent with CodeBlockNode's default `wordWrap: 'on'`.
  if (wordWrap == null)
    return true
  return String(wordWrap) !== 'off'
})
const showPreWhileMonacoLoads = computed(() => {
  // If Monaco isn't available at all, the component renders a standalone PreCodeNode.
  if (usePreCodeRender.value)
    return false
  // Keep showing the fallback until Monaco finished mounting for this block.
  return !editorMounted.value
})
const showInlinePreview = ref(false)
// Defer client-only editor initialization to the browser to avoid SSR errors
if (typeof window !== 'undefined') {
  ;(async () => {
    try {
      const mod = await getUseMonaco()
      if (isUnmounted)
        return
      // If mod is null, stream-monaco is not available
      if (!mod) {
        // Only log warning in development mode
        if (import.meta.env?.DEV) {
          console.warn('[markstream-vue] stream-monaco is not installed. Code blocks will use basic rendering. Install stream-monaco for enhanced code editor features.')
        }
        usePreCodeRender.value = true
        return
      }
      // `useMonaco` and `detectLanguage` should be available
      const useMonaco = mod.useMonaco
      const det = mod.detectLanguage
      if (typeof det === 'function')
        detectLanguage = det
      if (typeof useMonaco === 'function') {
        const theme = resolveRequestedTheme()
        if (theme && props.themes && Array.isArray(props.themes) && !props.themes.includes(theme)) {
          throw new Error('Preferred theme not in provided themes array')
        }
        runtimeMonacoOptions = buildRuntimeMonacoOptions()
        const helpers = useMonaco(runtimeMonacoOptions)
        createEditor = helpers.createEditor || createEditor
        createDiffEditor = helpers.createDiffEditor || createDiffEditor
        updateCode = helpers.updateCode || updateCode
        updateDiffCode = helpers.updateDiff || updateDiffCode
        getEditor = helpers.getEditor || getEditor
        getEditorView = helpers.getEditorView || getEditorView
        getDiffEditorView = helpers.getDiffEditorView || getDiffEditorView
        cleanupEditor = helpers.cleanupEditor || cleanupEditor
        safeClean = helpers.safeClean || helpers.cleanupEditor || safeClean
        refreshDiffPresentation = helpers.refreshDiffPresentation || refreshDiffPresentation
        setTheme = helpers.setTheme || setTheme
        monacoReady.value = true

        if (!isUnmounted && codeEditor.value)
          await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
    }
    catch (err) {
      if (isUnmounted)
        return
      // Only log warning in development mode
      if (import.meta.env?.DEV) {
        console.warn('[markstream-vue] Failed to initialize Monaco editor:', err)
      }
      // Use PreCodeNode for rendering
      usePreCodeRender.value = true
    }
  })()
}

const codeFontMin = 10
const codeFontMax = 36
const codeFontStep = 1
const defaultCodeFontSize = ref<number>(
  typeof props.monacoOptions?.fontSize === 'number' ? props.monacoOptions!.fontSize : Number.NaN,
)
const codeFontSize = ref<number>(defaultCodeFontSize.value)
const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value
  const b = codeFontSize.value
  return typeof a === 'number' && Number.isFinite(a) && a > 0 && typeof b === 'number' && Number.isFinite(b) && b > 0
})
const preFallbackFontSize = computed(() => {
  const fromOptions = props.monacoOptions?.fontSize
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  const fromState = codeFontSize.value
  if (typeof fromState === 'number' && Number.isFinite(fromState) && fromState > 0)
    return fromState
  return 12
})
const preFallbackLineHeight = computed(() => {
  const fromOptions = props.monacoOptions?.lineHeight
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  return Math.round(preFallbackFontSize.value * 1.5)
})
const preFallbackTabSize = computed(() => {
  const fromOptions = props.monacoOptions?.tabSize
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  // Monaco default is 4.
  return 4
})
const estimatedVisibleContentHeight = computed(() => {
  const value = props.estimatedContentHeightPx
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null
})
const preFallbackStyle = computed(() => {
  const fontFamily = props.monacoOptions?.fontFamily
  return {
    fontSize: `${preFallbackFontSize.value}px`,
    lineHeight: `${preFallbackLineHeight.value}px`,
    tabSize: preFallbackTabSize.value,
    ...(estimatedVisibleContentHeight.value != null
      ? { minHeight: `${estimatedVisibleContentHeight.value}px` }
      : {}),
    ...(typeof fontFamily === 'string' && fontFamily.trim()
      ? { '--markstream-code-font-family': fontFamily.trim() }
      : {}),
  } as Record<string, string | number>
})
const shouldReserveEstimatedEditorHeight = computed(() => {
  return estimatedVisibleContentHeight.value != null && !editorMounted.value
})
const codeEditorContainerStyle = computed(() => {
  if (!shouldReserveEstimatedEditorHeight.value)
    return undefined
  return {
    minHeight: `${estimatedVisibleContentHeight.value}px`,
  }
})
const loadingPlaceholderStyle = computed(() => {
  if (estimatedVisibleContentHeight.value == null)
    return undefined
  return {
    minHeight: `${estimatedVisibleContentHeight.value}px`,
  }
})
// Keep computed height tight to content. Extra padding caused visible bottom gap.
const CONTENT_PADDING = 0
// Fine-tuned to avoid bottom gap at default font size
const LINE_EXTRA_PER_LINE = 1.5
const PIXEL_EPSILON = 1

// Use shared safeRaf / safeCancelRaf from utils to avoid duplication

function measureLineHeightFromDom(): number | null {
  try {
    const root = codeEditor.value as HTMLElement | null
    if (!root)
      return null
    const lineEl = root.querySelector('.view-lines .view-line') as HTMLElement | null
    if (lineEl) {
      const h = Math.ceil(lineEl.getBoundingClientRect().height)
      if (h > 0)
        return h
    }
  }
  catch {}
  return null
}

function readActualFontSizeFromEditor(): number | null {
  try {
    const ed = isDiff.value ? getDiffEditorView()?.getModifiedEditor?.() ?? getDiffEditorView() : getEditorView()
    const mon = getEditor()
    const key = mon?.EditorOption?.fontInfo
    if (ed && key != null) {
      const info = ed.getOption?.(key) as { fontSize?: unknown } | undefined
      const size = info?.fontSize
      if (typeof size === 'number' && Number.isFinite(size) && size > 0)
        return size
    }
  }
  catch {}
  try {
    const root = codeEditor.value as HTMLElement | null
    if (root) {
      const lineEl = root.querySelector('.view-lines .view-line') as HTMLElement | null
      if (lineEl) {
        try {
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const fs = window.getComputedStyle(lineEl).fontSize
            const m = fs && fs.match(/^(\d+(?:\.\d+)?)/)
            if (m)
              return Number.parseFloat(m[1])
          }
        }
        catch {}
      }
    }
  }
  catch {}
  return null
}

function getLineHeightSafe(editor: MonacoEditorViewLike | null | undefined): number {
  try {
    const monacoEditor = getEditor()
    const key = monacoEditor?.EditorOption?.lineHeight
    if (key != null) {
      const v = editor?.getOption?.(key)
      if (typeof v === 'number' && v > 0)
        return v
    }
  }
  catch {}

  const domH = measureLineHeightFromDom()
  if (domH && domH > 0)
    return domH
  const fs = Number.isFinite(codeFontSize.value) && codeFontSize.value! > 0 ? (codeFontSize.value as number) : 12
  // Conservative fallback close to Monaco's default ratio
  return Math.max(12, Math.round(fs * 1.35))
}

function countChangedLineRange(start: number | undefined, end: number | undefined) {
  if (typeof start !== 'number' || typeof end !== 'number')
    return 0
  if (start < 1 || end < start)
    return 0
  return end - start + 1
}

function splitCodeLines(source: string) {
  if (!source)
    return [] as string[]
  const lines = source.split(/\r?\n/)
  return lines.length === 1 && lines[0] === '' ? [] : lines
}

function estimateDiffStats(originalSource: string, modifiedSource: string) {
  const originalLines = splitCodeLines(originalSource)
  const modifiedLines = splitCodeLines(modifiedSource)
  let start = 0
  let originalEnd = originalLines.length - 1
  let modifiedEnd = modifiedLines.length - 1

  while (
    start <= originalEnd
    && start <= modifiedEnd
    && originalLines[start] === modifiedLines[start]
  ) {
    start++
  }

  while (
    originalEnd >= start
    && modifiedEnd >= start
    && originalLines[originalEnd] === modifiedLines[modifiedEnd]
  ) {
    originalEnd--
    modifiedEnd--
  }

  return {
    removed: Math.max(0, originalEnd - start + 1),
    added: Math.max(0, modifiedEnd - start + 1),
  }
}

function syncEstimatedDiffStats() {
  if (!isDiff.value) {
    diffStats.value = { removed: 0, added: 0 }
    return
  }

  diffStats.value = estimateDiffStats(
    String(props.node.originalCode ?? ''),
    String(props.node.updatedCode ?? ''),
  )
}

function refreshDiffStats() {
  if (!isDiff.value) {
    diffStats.value = { removed: 0, added: 0 }
    return
  }

  try {
    const diff = getDiffEditorView()
    const lineChanges = diff?.getLineChanges?.()
    if (!Array.isArray(lineChanges)) {
      syncEstimatedDiffStats()
      return
    }

    let removed = 0
    let added = 0
    for (const change of lineChanges) {
      removed += countChangedLineRange(
        change.originalStartLineNumber,
        change.originalEndLineNumber,
      )
      added += countChangedLineRange(
        change.modifiedStartLineNumber,
        change.modifiedEndLineNumber,
      )
    }

    diffStats.value = { removed, added }
  }
  catch {
    syncEstimatedDiffStats()
  }
}

function ensureFontBaseline() {
  if (Number.isFinite(codeFontSize.value) && (codeFontSize.value as number) > 0 && Number.isFinite(defaultCodeFontSize.value))
    return codeFontSize.value as number
  const actual = readActualFontSizeFromEditor()
  if (typeof props.monacoOptions?.fontSize === 'number') {
    defaultCodeFontSize.value = props.monacoOptions.fontSize
    codeFontSize.value = props.monacoOptions.fontSize
    return codeFontSize.value as number
  }
  if (actual && actual > 0) {
    defaultCodeFontSize.value = actual
    codeFontSize.value = actual
    return actual
  }
  // 极端兜底
  defaultCodeFontSize.value = 12
  codeFontSize.value = 12
  return 12
}

function increaseCodeFont() {
  const base = ensureFontBaseline()
  const after = Math.min(codeFontMax, base + codeFontStep)
  codeFontSize.value = after
}
function decreaseCodeFont() {
  const base = ensureFontBaseline()
  const after = Math.max(codeFontMin, base - codeFontStep)
  codeFontSize.value = after
}
function resetCodeFont() {
  ensureFontBaseline()
  if (Number.isFinite(defaultCodeFontSize.value))
    codeFontSize.value = defaultCodeFontSize.value as number
}

function computeContentHeight(): number | null {
  // Prefer Monaco's contentHeight when available; fallback to lineCount * lineHeight
  try {
    const diffEditor = isDiff.value ? getDiffEditorView() : null
    const editor = isDiff.value ? diffEditor : getEditorView()
    if (!editor)
      return null
    if (diffEditor?.getOriginalEditor && diffEditor?.getModifiedEditor) {
      const o = diffEditor.getOriginalEditor?.()
      const m = diffEditor.getModifiedEditor?.()
      o?.layout?.()
      m?.layout?.()
      const oh = (o?.getContentHeight?.() as number) || 0
      const mh = (m?.getContentHeight?.() as number) || 0
      const h = Math.max(oh, mh)
      if (h > 0)
        return Math.ceil(h + PIXEL_EPSILON)
      // fallback per-editor line count
      const olc = o?.getModel?.()?.getLineCount?.() || 1
      const mlc = m?.getModel?.()?.getLineCount?.() || 1
      const lc = Math.max(olc, mlc)
      const lh = Math.max(getLineHeightSafe(o), getLineHeightSafe(m))
      return Math.ceil(lc * (lh + LINE_EXTRA_PER_LINE) + CONTENT_PADDING + PIXEL_EPSILON)
    }
    else if (editor?.getContentHeight) {
      editor?.layout?.()
      const h = editor.getContentHeight()
      if (h > 0)
        return Math.ceil(h + PIXEL_EPSILON)
    }
    // generic fallback
    const model = editor?.getModel?.()
    let lineCount = 1
    if (model && typeof model.getLineCount === 'function') {
      lineCount = model.getLineCount()
    }
    const lh = getLineHeightSafe(editor)
    return Math.ceil(lineCount * (lh + LINE_EXTRA_PER_LINE) + CONTENT_PADDING + PIXEL_EPSILON)
  }
  catch {
    return null
  }
}

function getColorLuminance(color: string) {
  const channels = String(color ?? '').match(/\d+(?:\.\d+)?/g)
  if (!channels || channels.length < 3)
    return null
  const [r, g, b] = channels.slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function shouldPreferPlainTextFallbackSurface(bg: string, fg: string, expectDark: boolean) {
  if (!isPlainTextLanguage.value)
    return false

  const bgLuminance = getColorLuminance(bg)
  const fgLuminance = getColorLuminance(fg)

  if (expectDark) {
    return (bgLuminance != null && bgLuminance > 170)
      || (fgLuminance != null && fgLuminance < 110)
  }

  return (bgLuminance != null && bgLuminance < 85)
    || (fgLuminance != null && fgLuminance > 190)
}

// Copy computed CSS variables from the editor DOM up to the component root so
// the header (which lives alongside the editor but outside its inner DOM)
// can use variables like --vscode-editor-foreground / --vscode-editor-background.
function syncEditorCssVars() {
  const editorEl = codeEditor.value as HTMLElement | null
  const rootEl = container.value as HTMLElement | null
  if (!editorEl || !rootEl)
    return
  // Target: write --vscode-* vars to the editor container (Monaco zone),
  // NOT to rootEl (Shell zone). Shell no longer reads these variables.
  const targetEl = editorEl
  if (isDiff.value) {
    targetEl.style.removeProperty('--vscode-editor-foreground')
    targetEl.style.removeProperty('--vscode-editor-background')
    targetEl.style.removeProperty('--vscode-editor-selectionBackground')
    return
  }
  // Monaco usually applies theme variables on an element with class
  // 'monaco-editor' or on the editor root; try to read from either.
  const editorRoot = (editorEl.querySelector('.monaco-editor') || editorEl) as HTMLElement
  const bgEl = (editorRoot.querySelector('.monaco-editor-background') || editorRoot) as HTMLElement
  const fgEl = (editorRoot.querySelector('.view-lines') || editorRoot) as HTMLElement

  let rootStyles: CSSStyleDeclaration | null = null
  let bgStyles: CSSStyleDeclaration | null = null
  let fgStyles: CSSStyleDeclaration | null = null
  try {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      rootStyles = window.getComputedStyle(editorRoot)
      bgStyles = bgEl === editorRoot ? rootStyles : window.getComputedStyle(bgEl)
      fgStyles = fgEl === editorRoot ? rootStyles : window.getComputedStyle(fgEl)
    }
  }
  catch {
    rootStyles = null
    bgStyles = null
    fgStyles = null
  }
  const fgVar = String(rootStyles?.getPropertyValue('--vscode-editor-foreground') ?? '').trim()
  const bgVar = String(rootStyles?.getPropertyValue('--vscode-editor-background') ?? '').trim()
  const selVar = String(
    rootStyles?.getPropertyValue('--vscode-editor-selectionBackground')
    ?? rootStyles?.getPropertyValue('--vscode-editor-hoverHighlightBackground')
    ?? '',
  ).trim()

  const fg = fgVar || String(fgStyles?.color ?? rootStyles?.color ?? '').trim()
  const bg = bgVar || String(bgStyles?.backgroundColor ?? rootStyles?.backgroundColor ?? '').trim()

  if (shouldPreferPlainTextFallbackSurface(bg, fg, rootEl.classList.contains('is-dark'))) {
    targetEl.style.removeProperty('--vscode-editor-foreground')
    targetEl.style.removeProperty('--vscode-editor-background')
    targetEl.style.removeProperty('--vscode-editor-selectionBackground')
    return
  }

  if (fg)
    targetEl.style.setProperty('--vscode-editor-foreground', fg)
  if (bg)
    targetEl.style.setProperty('--vscode-editor-background', bg)
  if (selVar)
    targetEl.style.setProperty('--vscode-editor-selectionBackground', selVar)
}

let resizeSyncHandler: (() => void) | null = null
const SCROLL_PARENT_OVERFLOW_RE = /auto|scroll|overlay/i

function resolveScrollRootElement(node?: HTMLElement | null) {
  if (typeof window === 'undefined')
    return null
  const doc = node?.ownerDocument ?? document
  const scrollRoot = (doc.scrollingElement || doc.documentElement || doc.body) as HTMLElement | null
  let current = node?.parentElement ?? null
  while (current) {
    if (current === doc.body || current === scrollRoot)
      break
    const style = window.getComputedStyle(current)
    const overflowY = (style.overflowY || '').toLowerCase()
    const overflow = (style.overflow || '').toLowerCase()
    if (SCROLL_PARENT_OVERFLOW_RE.test(overflowY) || SCROLL_PARENT_OVERFLOW_RE.test(overflow))
      return current
    current = current.parentElement
  }
  return scrollRoot
}

function adjustScrollAfterHeightChange(container: HTMLElement, previousHeight: number, nextHeight: number) {
  if (typeof window === 'undefined')
    return
  const roundedPrev = Math.ceil(previousHeight)
  const roundedNext = Math.ceil(nextHeight)
  const delta = roundedNext - roundedPrev
  if (!delta)
    return

  const root = resolveScrollRootElement(container)
  if (!root)
    return

  const doc = container.ownerDocument ?? document
  const viewportRoot = root === doc.body || root === doc.documentElement || root === doc.scrollingElement
  const rootTop = viewportRoot ? 0 : root.getBoundingClientRect().top
  const containerTop = container.getBoundingClientRect().top - rootTop
  if (containerTop >= 0)
    return

  if (viewportRoot && typeof window.scrollBy === 'function') {
    window.scrollBy(0, delta)
    return
  }

  root.scrollTop += delta
}

function updateExpandedHeight() {
  try {
    const container = codeEditor.value
    if (!container)
      return

    const oldHeight = container.getBoundingClientRect().height
    const h = computeContentHeight()
    if (h != null && h > 0) {
      const nextHeight = Math.ceil(h)
      container.style.minHeight = '0px'
      container.style.height = `${nextHeight}px`
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      adjustScrollAfterHeightChange(container, oldHeight, nextHeight)
    }
  }
  catch {}
}

function clearEditorHeightSyncBindings() {
  while (editorHeightSyncDisposables.length > 0) {
    try {
      editorHeightSyncDisposables.pop()?.dispose?.()
    }
    catch {}
  }
  if (deferredHeightSyncRafId != null) {
    safeCancelRaf(deferredHeightSyncRafId)
    deferredHeightSyncRafId = null
  }
}

function clearInlineFoldProxies() {
  while (inlineFoldProxyCleanups.length > 0) {
    try {
      inlineFoldProxyCleanups.pop()?.()
    }
    catch {}
  }
}

function syncInlineFoldProxies() {
  clearInlineFoldProxies()

  if (!isDiff.value)
    return

  const root = codeEditor.value
  if (!root)
    return

  const diffRoot = root.querySelector('.monaco-diff-editor') as HTMLElement | null
  if (!diffRoot || diffRoot.classList.contains('side-by-side'))
    return

  const originalWidgets = Array.from(diffRoot.querySelectorAll('.editor.original .diff-hidden-lines'))
  const modifiedWidgets = Array.from(diffRoot.querySelectorAll('.editor.modified .diff-hidden-lines'))
  const pairCount = Math.min(originalWidgets.length, modifiedWidgets.length)

  for (let i = 0; i < pairCount; i++) {
    const originalWidget = originalWidgets[i] as HTMLElement
    const modifiedWidget = modifiedWidgets[i] as HTMLElement
    const modifiedTrigger = modifiedWidget.querySelector('a') as HTMLElement | null
    const originalSlot = originalWidget.querySelector('.center > div:first-child') as HTMLElement | null

    if (!modifiedTrigger || !originalSlot)
      continue

    const proxyButton = document.createElement('button')
    proxyButton.type = 'button'
    proxyButton.className = 'markstream-inline-fold-proxy'
    const label = modifiedTrigger.getAttribute('title') || 'Show Unchanged Region'
    proxyButton.title = label
    proxyButton.setAttribute('aria-label', label)

    const sourceIcon = modifiedTrigger.querySelector('.codicon') as HTMLElement | null
    const icon = document.createElement('span')
    icon.className = sourceIcon?.className || 'codicon codicon-unfold'
    proxyButton.append(icon)

    const handlePointerDown = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    const handleClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      modifiedTrigger.click()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ')
        return
      event.preventDefault()
      event.stopPropagation()
      modifiedTrigger.click()
    }

    proxyButton.addEventListener('mousedown', handlePointerDown)
    proxyButton.addEventListener('click', handleClick)
    proxyButton.addEventListener('keydown', handleKeyDown)
    originalSlot.replaceChildren(proxyButton)

    inlineFoldProxyCleanups.push(() => {
      proxyButton.removeEventListener('mousedown', handlePointerDown)
      proxyButton.removeEventListener('click', handleClick)
      proxyButton.removeEventListener('keydown', handleKeyDown)
      if (originalSlot.contains(proxyButton))
        originalSlot.replaceChildren()
    })
  }
}

function scheduleEditorHeightSync() {
  if (deferredHeightSyncRafId != null)
    return
  deferredHeightSyncRafId = safeRaf(() => {
    deferredHeightSyncRafId = null
    safeRaf(() => {
      syncInlineFoldProxies()
      if (isCollapsed.value)
        return
      if (isExpanded.value)
        updateExpandedHeight()
      else
        updateCollapsedHeight()
    })
  })
}

function applyCollapsedContainerHeight(container: HTMLElement, contentHeight: number, maxHeight: number) {
  const cappedHeight = Math.min(contentHeight, maxHeight)
  const shouldScroll = contentHeight > maxHeight + PIXEL_EPSILON
  container.style.minHeight = '0px'
  container.style.height = `${Math.ceil(cappedHeight)}px`
  container.style.maxHeight = `${Math.ceil(maxHeight)}px`
  container.style.overflow = shouldScroll ? 'auto' : 'hidden'
  return Math.ceil(cappedHeight)
}

function bindEditorHeightSync() {
  clearEditorHeightSyncBindings()

  if (isDiff.value) {
    const diff = getDiffEditorView()
    const originalEditor = diff?.getOriginalEditor?.()
    const modifiedEditor = diff?.getModifiedEditor?.()

    const bind = (
      source: MonacoEditorViewLike | null | undefined,
      eventName: 'onDidContentSizeChange' | 'onDidLayoutChange',
    ) => {
      try {
        const subscribe = source?.[eventName]
        if (typeof subscribe !== 'function')
          return
        const disposable = subscribe.call(source, () => scheduleEditorHeightSync())
        if (disposable)
          editorHeightSyncDisposables.push(disposable)
      }
      catch {}
    }

    try {
      const disposable = diff?.onDidUpdateDiff?.(() => {
        scheduleEditorHeightSync()
        safeRaf(() => refreshDiffStats())
      })
      if (disposable)
        editorHeightSyncDisposables.push(disposable)
    }
    catch {}
    bind(originalEditor, 'onDidContentSizeChange')
    bind(modifiedEditor, 'onDidContentSizeChange')
    bind(originalEditor, 'onDidLayoutChange')
    bind(modifiedEditor, 'onDidLayoutChange')
  }
  else {
    const editor = getEditorView()
    try {
      const disposable = editor?.onDidContentSizeChange?.(() => scheduleEditorHeightSync())
      if (disposable)
        editorHeightSyncDisposables.push(disposable)
    }
    catch {}
    try {
      const disposable = editor?.onDidLayoutChange?.(() => scheduleEditorHeightSync())
      if (disposable)
        editorHeightSyncDisposables.push(disposable)
    }
    catch {}
  }
}

function updateCollapsedHeight() {
  try {
    const container = codeEditor.value
    if (!container)
      return

    const oldHeight = container.getBoundingClientRect().height

    const max = getMaxHeightValue()
    if (resumeGuardFrames > 0) {
      resumeGuardFrames--
      if (heightBeforeCollapse.value != null) {
        const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max)
        adjustScrollAfterHeightChange(container, oldHeight, h)
        return
      }
    }
    const h0 = computeContentHeight()
    // 1) 有实时内容高度 -> 采用并记忆原始内容高度（未裁剪前），用于下一次恢复
    if (h0 != null && h0 > 0) {
      const h = applyCollapsedContainerHeight(container, h0, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 2) 使用折叠前的内容高度（不更新记忆值）
    if (heightBeforeCollapse.value != null) {
      const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 3) 使用当前 DOM 高度（不更新记忆值）
    const rectH = Math.ceil((container.getBoundingClientRect?.().height) || 0)
    if (rectH > 0) {
      const h = applyCollapsedContainerHeight(container, rectH, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 4) 兜底：若有先前行高/字体，可估一个最小高度；否则保持现状，避免强制跳到 MAX
    const prev = Number.parseFloat(container.style.height)
    if (!Number.isNaN(prev) && prev > 0) {
      const h = applyCollapsedContainerHeight(container, prev, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
    }
    else {
      // 实在没有历史高度，才退到 max（极少数首次场景）
      const h = applyCollapsedContainerHeight(container, max, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
    }
  }
  catch {}
}

function getMaxHeightValue(): number {
  const maxH = props.monacoOptions?.MAX_HEIGHT ?? 500
  if (typeof maxH === 'number')
    return maxH
  const m = String(maxH).match(/^(\d+(?:\.\d+)?)/)
  return m ? Number.parseFloat(m[1]) : 500
}

// Check if the language is previewable (HTML or SVG)
const isPreviewable = computed(() => props.isShowPreview && (codeLanguage.value === 'html' || codeLanguage.value === 'svg'))

watch(
  () => props.node.language,
  (newLanguage) => {
    codeLanguage.value = normalizeLanguageIdentifier(newLanguage)
  },
)

watch(
  () => [props.node.originalCode, props.node.updatedCode, isDiff.value] as const,
  () => {
    syncEstimatedDiffStats()
    safeRaf(() => refreshDiffStats())
  },
  { immediate: true },
)

watch(
  () => [props.node.originalCode, props.node.updatedCode, monacoLanguage.value, isDiff.value] as const,
  async ([originalCode, updatedCode, _language, diff]) => {
    if (props.stream === false || !diff)
      return
    // If the editor helpers exist but the editor hasn't been created yet,
    // ensure creation first so update calls don't get lost.
    if (createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    updateDiffCode(
      String(originalCode ?? ''),
      String(updatedCode ?? ''),
      monacoLanguage.value,
    )

    if (isExpanded.value) {
      safeRaf(() => updateExpandedHeight())
    }
  },
)

watch(
  () => props.node.code,
  async (newCode) => {
    if (props.stream === false)
      return
    if (!codeLanguage.value)
      codeLanguage.value = normalizeLanguageIdentifier(detectLanguage(newCode))
    if (isDiff.value)
      return

    // If the editor helpers exist but the editor hasn't been created yet,
    // ensure creation first so update calls don't get lost.
    if (createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    updateCode(newCode, monacoLanguage.value)

    if (isExpanded.value) {
      safeRaf(() => updateExpandedHeight())
    }
  },
)

// 计算用于显示的语言名称
const displayLanguage = computed(() => {
  const lang = codeLanguage.value
  if (!lang)
    return languageMap[''] || 'Plain Text'
  return languageMap[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)
})

function parseCodeFenceInfo(raw: string) {
  const firstLine = String(raw ?? '').split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine.length < 3)
    return ''
  const marker = firstLine[0]
  if ((marker !== '`' && marker !== '~') || firstLine[1] !== marker || firstLine[2] !== marker)
    return ''

  let index = 3
  while (firstLine[index] === marker)
    index += 1

  return firstLine.slice(index).trim()
}

function extractCodeBlockFileLabel(raw: string) {
  const info = parseCodeFenceInfo(raw)
  if (!info)
    return ''

  const tokens = info.split(/\s+/).filter(Boolean)
  if (!tokens.length)
    return ''

  const candidates = tokens[0] === 'diff' ? tokens.slice(1) : tokens
  for (const token of candidates) {
    const value = token.includes(':')
      ? token.slice(token.indexOf(':') + 1)
      : token
    if (!value)
      continue
    if (/[./\\-]/.test(value))
      return value
  }

  return ''
}

const codeFileLabel = computed(() => extractCodeBlockFileLabel(String(props.node.raw ?? '')))
const headerTitle = computed(() => codeFileLabel.value || displayLanguage.value)
const headerCaption = computed(() => {
  if (!codeFileLabel.value)
    return ''
  return isDiff.value ? `Diff / ${displayLanguage.value}` : displayLanguage.value
})

// Computed property for language icon
const languageIcon = computed(() => {
  void languageIconsRevision.value
  return getLanguageIcon(codeLanguage.value || '')
})

// Compute inline style for container to respect optional min/max width
const containerStyle = computed(() => {
  const s: Record<string, string> = {}
  const fmt = (v: string | number | undefined) => {
    if (v == null)
      return undefined
    return typeof v === 'number' ? `${v}px` : String(v)
  }
  const min = fmt(props.minWidth)
  const max = fmt(props.maxWidth)
  if (min)
    s.minWidth = min
  if (max)
    s.maxWidth = max
  if (isDiff.value) {
    s.color = 'var(--markstream-diff-shell-fg)'
    s.borderColor = 'var(--markstream-diff-shell-border)'
  }
  else {
    s.color = 'var(--vscode-editor-foreground, var(--markstream-code-fallback-fg))'
    s.backgroundColor = 'var(--vscode-editor-background, var(--markstream-code-fallback-bg))'
    s.borderColor = 'var(--markstream-code-border-color)'
  }
  return s
})
const headerStyle = computed<Record<string, string> | undefined>(() => {
  // Shell zone: header always uses page-level tokens, not Monaco colors
  return undefined
})
const tooltipsEnabled = computed(() => props.showTooltips !== false)

// 复制代码
async function copy() {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(props.node.code)
    }
    copyText.value = true
    emits('copy', props.node.code)
    setTimeout(() => {
      copyText.value = false
    }, 1000)
  }
  catch (err) {
    console.error('复制失败:', err)
  }
}

// Tooltip helpers: use the global singleton tooltip so there's only one DOM node
watch(tooltipsEnabled, (enabled) => {
  if (!enabled)
    hideTooltip()
})

function resolveTooltipTarget(e: Event) {
  const btn = (e.currentTarget || e.target) as HTMLButtonElement | null
  if (!btn || btn.disabled)
    return null
  return btn
}

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
function onBtnHover(e: Event, text: string, place: TooltipPlacement = 'top') {
  if (!tooltipsEnabled.value)
    return
  const target = resolveTooltipTarget(e)
  if (!target)
    return
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(target, text, place, false, origin, props.isDark)
}

function onBtnLeave() {
  if (!tooltipsEnabled.value)
    return
  hideTooltip()
}

function onCopyHover(e: Event) {
  if (!tooltipsEnabled.value)
    return
  const target = resolveTooltipTarget(e)
  if (!target)
    return
  const txt = copyText.value ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(target, txt, 'top', false, origin, props.isDark)
}

function toggleExpand(e?: Event) {
  isExpanded.value = !isExpanded.value

  if (e && tooltipsEnabled.value) {
    const target = resolveTooltipTarget(e)
    if (target) {
      const txt = isExpanded.value ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand')
      showTooltipForAnchor(target, txt, 'top', false, undefined, props.isDark)
    }
  }

  const editor = isDiff.value
    ? getDiffEditorView()
    : getEditorView()
  const container = codeEditor.value
  if (!editor || !container)
    return

  if (isExpanded.value) {
    // Expanded: enable automaticLayout and explicitly size container by lines
    setAutomaticLayout(true)
    container.style.maxHeight = 'none'
    container.style.overflow = 'visible'
    updateExpandedHeight()
  }
  else {
    stopExpandAutoResize()
    setAutomaticLayout(false)
    container.style.overflow = 'auto'
    updateCollapsedHeight()
  }
}

function toggleHeaderCollapse() {
  isCollapsed.value = !isCollapsed.value
  if (isCollapsed.value) {
    if (codeEditor.value) {
      const rectH = Math.ceil((codeEditor.value.getBoundingClientRect?.().height) || 0)
      if (rectH > 0)
        heightBeforeCollapse.value = rectH
    }
    stopExpandAutoResize()
    setAutomaticLayout(false)
  }
  else {
    if (isExpanded.value)
      setAutomaticLayout(true)
    if (codeEditor.value && heightBeforeCollapse.value != null) {
      codeEditor.value.style.height = `${heightBeforeCollapse.value}px`
    }
    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    try {
      ed?.layout?.()
    }
    catch {}
    resumeGuardFrames = 2
    safeRaf(() => {
      if (isExpanded.value)
        updateExpandedHeight()
      else
        updateCollapsedHeight()
    })
  }
}

watch(
  () => codeFontSize.value,
  (size, _prev) => {
    const editor = isDiff.value ? getDiffEditorView() : getEditorView()
    if (!editor)
      return
    if (!(typeof size === 'number' && Number.isFinite(size) && size > 0))
      return
    editor.updateOptions({ fontSize: size })
    // In automaticLayout mode, no manual height updates are needed
    if (isExpanded.value && !isCollapsed.value)
      updateExpandedHeight()
  },
  { flush: 'post', immediate: false },
)

// 预览HTML/SVG代码
function previewCode() {
  if (!isPreviewable.value)
    return

  const lowerLang = codeLanguage.value
  if (hasPreviewListener.value) {
    const artifactType = lowerLang === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle
      = lowerLang === 'html'
        ? t('artifacts.htmlPreviewTitle') || 'HTML Preview'
        : t('artifacts.svgPreviewTitle') || 'SVG Preview'
    emits('previewCode', {
      node: props.node,
      artifactType,
      artifactTitle,
      id: `temp-${lowerLang}-${Date.now()}`,
    })
    return
  }

  if (lowerLang === 'html')
    showInlinePreview.value = !showInlinePreview.value
}

function setAutomaticLayout(expanded: boolean) {
  try {
    if (isDiff.value) {
      const diff = getDiffEditorView()
      diff?.updateOptions?.({ automaticLayout: expanded })
    }
    else {
      const ed = getEditorView()
      ed?.updateOptions?.({ automaticLayout: expanded })
    }
  }
  catch {}
}

function resetEditorHost(el: HTMLElement) {
  // Monaco diff/single editors should own the host exclusively. Clearing the
  // host before each creation prevents stale roots from stacking when a block
  // is recreated at the end of a streaming session.
  el.replaceChildren()
}

async function runEditorCreation(el: HTMLElement) {
  if (!createEditor || isUnmounted)
    return

  clearEditorHeightSyncBindings()
  clearInlineFoldProxies()
  resetEditorHost(el)
  if (isUnmounted)
    return

  if (isDiff.value) {
    safeClean()
    if (createDiffEditor) {
      await createDiffEditor(el as HTMLElement, String(props.node.originalCode ?? ''), String(props.node.updatedCode ?? ''), monacoLanguage.value)
    }
    else {
      await createEditor(el as HTMLElement, props.node.code, monacoLanguage.value)
    }
  }
  else {
    await createEditor(el as HTMLElement, props.node.code, monacoLanguage.value)
  }
  if (isUnmounted)
    return

  const editor = isDiff.value ? getDiffEditorView() : getEditorView()
  if (typeof props.monacoOptions?.fontSize === 'number') {
    editor?.updateOptions({ fontSize: props.monacoOptions.fontSize, automaticLayout: false })
    defaultCodeFontSize.value = props.monacoOptions.fontSize
    codeFontSize.value = props.monacoOptions.fontSize
  }
  else {
    const actual = readActualFontSizeFromEditor()
    if (actual && actual > 0) {
      defaultCodeFontSize.value = actual
      codeFontSize.value = actual
    }
    else {
      defaultCodeFontSize.value = 12
      codeFontSize.value = 12
    }
  }

  if (!isExpanded.value && !isCollapsed.value)
    updateCollapsedHeight()

  if (props.loading === false) {
    await nextTick()
    if (isUnmounted)
      return
    safeRaf(() => {
      if (isUnmounted)
        return
      if (isExpanded.value && !isCollapsed.value)
        updateExpandedHeight()
      else if (!isCollapsed.value)
        updateCollapsedHeight()
    })
  }

  await nextTick()
  if (isUnmounted)
    return
  editorMounted.value = true
  bindEditorHeightSync()
  syncEditorCssVars()
  syncInlineFoldProxies()
  refreshDiffStats()
  scheduleEditorHeightSync()
}

function ensureEditorCreation(el: HTMLElement) {
  if (!createEditor || isUnmounted)
    return null
  ensureMonacoPassiveTouchListeners()
  if (createEditorPromise)
    return createEditorPromise
  if (editorCreated.value && editorMounted.value)
    return Promise.resolve()

  editorCreated.value = true
  const pending = (async () => {
    await runEditorCreation(el)
  })()

  const currentPromise = pending.finally(() => {
    if (createEditorPromise === currentPromise)
      createEditorPromise = null
  })
  createEditorPromise = currentPromise
  return currentPromise
}

// 延迟创建编辑器：仅在可见且准备就绪时创建，避免无意义的初始化
const stopCreateEditorWatch = watch(
  () => [codeEditor.value, isDiff.value, props.stream, props.loading, monacoReady.value, viewportReady.value] as const,
  async ([el, _isDiff, stream, loading, _monacoReady, visible]) => {
    if (!el || !createEditor)
      return
    if (!visible)
      return

    // If streaming is disabled, defer editor creation until loading is finished
    if (stream === false && loading !== false)
      return

    const creation = ensureEditorCreation(el as HTMLElement)
    if (!creation)
      return

    try {
      await creation
    }
    catch (error) {
      // Keep the `<pre>` fallback if Monaco fails to mount for this block.
      warnCodeBlockDev('Failed to mount Monaco editor', error)
      editorMounted.value = false
    }

    stopCreateEditorWatch()
  },
)

watch(
  desiredEditorKind,
  async (nextKind, prevKind) => {
    if (nextKind === prevKind)
      return
    currentEditorKind.value = nextKind

    // If Monaco isn't mounted yet (or not available), just let the normal
    // creation path pick up the latest kind.
    if (!createEditor || !codeEditor.value)
      return
    if (!editorCreated.value)
      return

    // If streaming is disabled, we still respect the "wait until loaded" rule.
    if (props.stream === false && props.loading !== false)
      return
    if (!viewportReady.value)
      return
    const pendingCreation = createEditorPromise
    if (pendingCreation) {
      try {
        await pendingCreation
      }
      catch {}
      if (isUnmounted || !codeEditor.value)
        return
    }

    try {
      editorMounted.value = false
      editorCreated.value = false
      clearEditorHeightSyncBindings()
      clearInlineFoldProxies()
      safeClean()
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch (error) {
      warnCodeBlockDev('Failed to recreate Monaco editor after code block kind changed', error)
      // Keep fallback rendering if recreation fails.
      editorMounted.value = false
    }
  },
)

function isPairedTheme(t: unknown): t is { light: CodeBlockMonacoTheme, dark: CodeBlockMonacoTheme } {
  return !!t && typeof t === 'object' && 'light' in t && 'dark' in t
}

function getPreferredColorScheme(): CodeBlockMonacoTheme | undefined {
  // Unified theme prop takes precedence
  if (props.theme !== undefined) {
    const t = props.theme
    if (isPairedTheme(t))
      return props.isDark ? t.dark : t.light
    // Fixed theme — always this theme regardless of isDark
    return t as CodeBlockMonacoTheme
  }
  // Backward compat: darkTheme / lightTheme
  return props.isDark ? props.darkTheme : props.lightTheme
}

function isFixedTheme(): boolean {
  return props.theme !== undefined && !isPairedTheme(props.theme)
}

function getThemeName(theme: CodeBlockMonacoTheme | null | undefined) {
  if (typeof theme === 'string')
    return theme
  if (theme && typeof theme === 'object' && 'name' in theme)
    return String(theme.name)
  return null
}

function resolveRequestedTheme() {
  const preferred = getPreferredColorScheme()
  const explicit = resolvedMonacoOptions.value?.theme
  const requested = preferred ?? explicit

  // Object themes are self-contained — trust them directly, skip availability check
  if (requested != null && typeof requested === 'object')
    return requested

  const availableThemes = Array.isArray(props.themes) ? props.themes : []
  if (!availableThemes.length || requested == null)
    return requested

  const requestedName = getThemeName(requested)
  const availableNames = availableThemes
    .map(theme => getThemeName(theme))
    .filter((name): name is string => !!name)
  if (!requestedName || availableNames.includes(requestedName))
    return requested

  const explicitName = getThemeName(explicit)
  if (explicit != null && explicitName && availableNames.includes(explicitName))
    return explicit

  return availableThemes[0]
}

function themeUpdate() {
  syncRuntimeMonacoOptions()

  const themeToSet = resolveRequestedTheme()
  const syncPresentation = () => {
    if (isDiff.value)
      refreshDiffPresentation()
    safeRaf(() => {
      syncEditorCssVars()
      scheduleEditorHeightSync()
    })
  }

  if (!themeToSet) {
    syncPresentation()
    return
  }

  void scheduleGlobalMonacoTheme(setTheme, themeToSet)
    .then(syncPresentation)
    .catch((error) => {
      warnCodeBlockDev('Failed to apply Monaco theme', error)
    })
}

function themeLooksDark(theme: CodeBlockMonacoTheme | null | undefined) {
  // For object themes, try to detect from editor.background luminance
  if (theme && typeof theme === 'object' && theme.colors?.['editor.background']) {
    const lum = getColorLuminance(theme.colors['editor.background'])
    if (lum != null)
      return lum < 128
  }
  const themeName = getThemeName(theme) ?? ''
  const normalized = themeName.toLowerCase()
  if (!normalized)
    return !!props.isDark
  const darkTokens = [
    'dark',
    'night',
    'moon',
    'black',
    'dracula',
    'mocha',
    'frappe',
    'macchiato',
    'palenight',
    'ocean',
    'poimandres',
    'monokai',
    'laserwave',
    'tokyo',
    'slack-dark',
    'rose-pine',
    'github-dark',
    'material-theme',
    'one-dark',
    'catppuccin-mocha',
    'catppuccin-frappe',
    'catppuccin-macchiato',
  ]
  const lightTokens = ['light', 'latte', 'dawn', 'lotus']
  return darkTokens.some(token => normalized.includes(token))
    && !lightTokens.some(token => normalized.includes(token))
}

/**
 * Whether the editor surface (Monaco area) is dark.
 * For fixed themes: detected from theme name or object luminance.
 * For paired themes: follows page isDark.
 */
const editorSurfaceIsDark = computed(() => {
  if (isFixedTheme())
    return themeLooksDark(resolveRequestedTheme())
  // Paired or default: follow page theme
  return !!props.isDark
})

const effectiveDiffAppearance = computed<'light' | 'dark'>(() => {
  if (!isDiff.value)
    return editorSurfaceIsDark.value ? 'dark' : 'light'

  const explicit = resolvedMonacoOptions.value?.diffAppearance
  if (explicit === 'light' || explicit === 'dark')
    return explicit

  return editorSurfaceIsDark.value ? 'dark' : 'light'
})

const resolvedSurfaceIsDark = computed(() =>
  isDiff.value ? effectiveDiffAppearance.value === 'dark' : editorSurfaceIsDark.value,
)

function buildRuntimeMonacoOptions() {
  return {
    wordWrap: 'on',
    wrappingIndent: 'same',
    themes: props.themes,
    ...(resolvedMonacoOptions.value || {}),
    theme: resolveRequestedTheme(),
    ...(isDiff.value ? { diffAppearance: effectiveDiffAppearance.value } : {}),
    onThemeChange() {
      syncEditorCssVars()
    },
  } as MonacoRuntimeOptions
}

function syncRuntimeMonacoOptions() {
  const nextOptions = buildRuntimeMonacoOptions()
  if (!runtimeMonacoOptions) {
    runtimeMonacoOptions = nextOptions
    return runtimeMonacoOptions
  }

  for (const key of Object.keys(runtimeMonacoOptions)) {
    if (!(key in nextOptions))
      delete runtimeMonacoOptions[key]
  }
  Object.assign(runtimeMonacoOptions, nextOptions)
  return runtimeMonacoOptions
}

const monacoStructuralSignature = computed(() => JSON.stringify({
  diffLineStyle: resolvedMonacoOptions.value?.diffLineStyle ?? 'background',
  diffUnchangedRegionStyle: resolvedMonacoOptions.value?.diffUnchangedRegionStyle ?? 'line-info',
  diffHideUnchangedRegions: resolvedMonacoOptions.value?.diffHideUnchangedRegions ?? true,
  renderSideBySide: resolvedMonacoOptions.value?.renderSideBySide ?? true,
  enableSplitViewResizing: resolvedMonacoOptions.value?.enableSplitViewResizing ?? true,
  ignoreTrimWhitespace: resolvedMonacoOptions.value?.ignoreTrimWhitespace ?? true,
  originalEditable: resolvedMonacoOptions.value?.originalEditable ?? false,
}))

// Watch for monacoOptions changes (deep) and try to update editor options or
// recreate the editor when necessary.
watch(
  () => [props.monacoOptions, viewportReady.value],
  () => {
    syncRuntimeMonacoOptions()
    if (!createEditor || !viewportReady.value)
      return

    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    const applying = typeof props.monacoOptions?.fontSize === 'number'
      ? props.monacoOptions.fontSize
      : (Number.isFinite(codeFontSize.value) ? (codeFontSize.value as number) : undefined)
    if (typeof applying === 'number' && Number.isFinite(applying) && applying > 0) {
      ed?.updateOptions?.({ fontSize: applying })
    }
    if (isExpanded.value && !isCollapsed.value)
      updateExpandedHeight()
    else if (!isCollapsed.value)
      updateCollapsedHeight()
  },
  { deep: true },
)

watch(
  () => [resolveRequestedTheme(), effectiveDiffAppearance.value, monacoReady.value, editorCreated.value, viewportReady.value] as const,
  () => {
    if (!monacoReady.value || !editorCreated.value || !viewportReady.value)
      return
    themeUpdate()
  },
  { flush: 'post' },
)

watch(
  () => [monacoStructuralSignature.value, monacoReady.value, viewportReady.value] as const,
  async ([nextSignature, ready, visible], [prevSignature]) => {
    syncRuntimeMonacoOptions()
    if (!ready || !visible)
      return
    if (!createEditor || !codeEditor.value)
      return
    if (!editorCreated.value)
      return
    if (nextSignature === prevSignature)
      return
    if (props.stream === false && props.loading !== false)
      return
    const pendingCreation = createEditorPromise
    if (pendingCreation) {
      try {
        await pendingCreation
      }
      catch {}
      if (isUnmounted || !codeEditor.value)
        return
    }

    try {
      editorMounted.value = false
      editorCreated.value = false
      clearEditorHeightSyncBindings()
      clearInlineFoldProxies()
      safeClean()
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch (error) {
      warnCodeBlockDev('Failed to recreate Monaco editor after Monaco options changed', error)
      editorMounted.value = false
    }
  },
  { flush: 'post' },
)

// 当 loading 变为 false 时：计算并缓存一次展开高度，随后停止观察

const stopLoadingWatch = watch(
  () => [props.loading, viewportReady.value],
  async ([loaded, visible], previous) => {
    if (!visible)
      return
    if (loaded)
      return
    const prevLoaded = previous?.[0]
    const loadingJustFinished = prevLoaded !== undefined && prevLoaded !== false
    await nextTick()
    safeRaf(() => {
      void (async () => {
        try {
          if (loadingJustFinished && editorCreated.value) {
            if (isDiff.value && codeEditor.value) {
              const pendingCreation = createEditorPromise
              if (pendingCreation) {
                try {
                  await pendingCreation
                }
                catch {}
              }
              editorMounted.value = false
              editorCreated.value = false
              clearEditorHeightSyncBindings()
              clearInlineFoldProxies()
              safeClean()
              codeEditor.value.replaceChildren()
              await nextTick()
              await ensureEditorCreation(codeEditor.value as HTMLElement)
            }
            else {
              updateCode(String(props.node.code ?? ''), monacoLanguage.value)
            }
          }
          if (!isCollapsed.value) {
            if (isExpanded.value)
              updateExpandedHeight()
            else
              updateCollapsedHeight()
          }
          stopLoadingWatch()
        }
        catch (error) {
          warnCodeBlockDev('Failed to refresh Monaco editor after streaming settled', error)
        }
      })()
    })
    stopExpandAutoResize()
  },
  { immediate: true, flush: 'post' },
)

function stopExpandAutoResize() {
  if (expandRafId != null) {
    safeCancelRaf(expandRafId)
    expandRafId = null
  }
}

onUnmounted(() => {
  // Ensure any RAF loops are stopped and editor resources are released
  stopExpandAutoResize()
  clearEditorHeightSyncBindings()
  clearInlineFoldProxies()
  cleanupEditor()

  if (resizeSyncHandler) {
    try {
      if (typeof window !== 'undefined')
        window.removeEventListener('resize', resizeSyncHandler)
    }
    catch {}
    resizeSyncHandler = null
  }
})
</script>

<template>
  <PreCodeNode v-if="usePreCodeRender" :node="props.node" :loading="props.loading" />
  <div
    v-else
    ref="container"
    :style="containerStyle"
    class="markstream-vue code-block-container my-4 rounded-lg border overflow-hidden"
    data-markstream-code-block="1"
    :data-markstream-enhanced="editorMounted && !usePreCodeRender ? 'true' : 'false'"
    :class="[
      { dark: props.isDark, 'is-rendering': props.loading, 'is-dark': resolvedSurfaceIsDark, 'is-diff': isDiff, 'is-plain-text': isPlainTextLanguage },
    ]"
  >
    <CodeBlockShell
      :show-header="props.showHeader"
      :show-collapse-button="props.showCollapseButton"
      :show-font-size-buttons="props.showFontSizeButtons"
      :enable-font-size-control="props.enableFontSizeControl"
      :show-copy-button="props.showCopyButton"
      :show-expand-button="props.showExpandButton"
      :show-preview-button="props.showPreviewButton"
      :show-tooltips="props.showTooltips"
      :is-dark="props.isDark"
      :loading="props.loading"
      :stream="stream"
      :is-collapsed="isCollapsed"
      :is-expanded="isExpanded"
      :copy-text="copyText"
      :is-previewable="isPreviewable"
      :code-font-size="codeFontSize"
      :code-font-min="codeFontMin"
      :code-font-max="codeFontMax"
      :default-code-font-size="defaultCodeFontSize"
      :font-baseline-ready="fontBaselineReady"
      :diff-stats="isDiff ? diffStats : null"
      :diff-stats-aria-label="diffStatsAriaLabel"
      @toggle-collapse="toggleHeaderCollapse"
      @decrease-font="decreaseCodeFont"
      @reset-font="resetCodeFont"
      @increase-font="increaseCodeFont"
      @copy="copy"
      @toggle-expand="toggleExpand"
      @preview="previewCode"
    >
      <template #header-left>
        <slot name="header-left">
          <div class="code-header-main">
            <span class="icon-slot h-4 w-4 flex-shrink-0" v-html="languageIcon" />
            <div class="code-header-copy">
              <div class="code-header-title">
                {{ headerTitle }}
              </div>
              <div v-if="headerCaption" class="code-header-caption">
                {{ headerCaption }}
              </div>
            </div>
          </div>
        </slot>
      </template>
      <template v-if="$slots['header-right']" #header-right>
        <slot name="header-right" />
      </template>

      <!-- Monaco editor layer -->
      <div v-show="!isCollapsed && (stream ? true : !loading)" class="code-editor-layer">
      <div
        ref="codeEditor"
        class="code-editor-container"
        :class="[stream ? '' : 'code-height-placeholder', { 'is-hidden': showPreWhileMonacoLoads }]"
        :style="codeEditorContainerStyle"
      />
      <PreCodeNode
        v-if="showPreWhileMonacoLoads"
        class="code-pre-fallback"
        :class="{ 'is-wrap': preFallbackWrap }"
        :style="preFallbackStyle"
        :node="props.node"
      />
    </div>
    <HtmlPreviewFrame
      v-if="showInlinePreview && !hasPreviewListener && isPreviewable && codeLanguage === 'html'"
      :code="props.node.code"
      :is-dark="props.isDark"
      :on-close="() => (showInlinePreview = false)"
    />

      <template #loading>
        <slot name="loading" :loading="loading" :stream="stream">
          <div class="loading-skeleton">
            <div class="skeleton-line" />
            <div class="skeleton-line" />
            <div class="skeleton-line short" />
          </div>
        </slot>
      </template>
    </CodeBlockShell>
  </div>
</template>

<style scoped>
.code-block-container {
  contain: content;
    /* 新增：显著减少离屏 codeblock 的布局/绘制与样式计算 */
  content-visibility: auto;
  contain-intrinsic-size: 320px 180px;
  container-type: inline-size;
  box-shadow: var(--ms-shadow-subtle);
  --markstream-code-fallback-bg: var(--code-bg);
  --markstream-code-fallback-fg: var(--code-fg);
  --markstream-code-border-color: var(--code-border);
  --vscode-editor-selectionBackground: var(--markstream-code-fallback-selection-bg);
  --markstream-code-fallback-selection-bg: var(--code-selection-bg);
  --markstream-diff-frame-border: var(--code-border);
  --markstream-diff-frame-shadow: 0 16px 40px -32px hsl(var(--ms-foreground) / 0.18);
  --markstream-diff-shell-fg: hsl(var(--ms-foreground));
  --markstream-diff-shell-muted: hsl(var(--ms-muted-foreground));
  --markstream-diff-shell-border: hsl(var(--ms-border) / 0.18);
  --markstream-diff-shell-shadow: 0 30px 70px -48px hsl(var(--ms-foreground) / 0.42);
  --markstream-diff-shell-bg: radial-gradient(
      circle at top center,
      hsl(var(--ms-background) / 0.9),
      transparent 55%
    ),
    linear-gradient(180deg, var(--code-bg) 0%, hsl(var(--ms-muted)) 100%);
  --markstream-diff-header-border: hsl(var(--ms-border) / 0.92);
  --markstream-diff-editor-bg: var(--code-bg);
  --markstream-diff-editor-fg: hsl(var(--ms-foreground));
  --markstream-diff-unchanged-fg: hsl(var(--ms-foreground));
  --markstream-diff-unchanged-bg: hsl(var(--ms-muted));
  --markstream-diff-unchanged-divider: hsl(var(--ms-background) / 0.94);
  --markstream-diff-focus: var(--focus-ring);
  --markstream-diff-widget-shadow: hsl(var(--ms-foreground) / 0.26);
  --markstream-diff-action-hover: var(--code-action-hover-bg);
  --markstream-diff-panel-bg: linear-gradient(180deg, var(--code-bg) 0%, hsl(var(--ms-muted)) 100%);
  --markstream-diff-panel-bg-soft: var(--code-bg);
  --markstream-diff-panel-bg-strong: var(--code-bg);
  --markstream-diff-panel-border: hsl(var(--ms-border) / 0.3);
  --markstream-diff-pane-divider: hsl(var(--ms-border) / 0.42);
  --markstream-diff-gutter-bg: transparent;
  --markstream-diff-gutter-guide: transparent;
  --markstream-diff-gutter-gap: 16px;
  --markstream-diff-line-number: var(--code-line-number);
  --markstream-diff-line-number-active: var(--code-line-number);
  --markstream-diff-added-fg: var(--diff-added-fg);
  --markstream-diff-removed-fg: var(--diff-removed-fg);
  --markstream-diff-added-line: var(--diff-added-bg);
  --markstream-diff-removed-line: var(--diff-removed-bg);
  --markstream-diff-added-inline: var(--diff-added-inline-bg);
  --markstream-diff-removed-inline: var(--diff-removed-inline-bg);
  --markstream-diff-added-inline-border: transparent;
  --markstream-diff-removed-inline-border: transparent;
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 var(--stream-monaco-gutter-marker-width, 4px),
    hsl(var(--ms-diff-added) / 0.08) var(--stream-monaco-gutter-marker-width, 4px) 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / var(--stream-monaco-gutter-marker-width, 4px) 100% no-repeat,
    linear-gradient(90deg, hsl(var(--ms-diff-removed) / 0.08) 0 100%);
  --markstream-diff-added-line-fill: var(--diff-added-bg);
  --markstream-diff-removed-line-fill: var(--diff-removed-bg);
}

.code-block-container.is-dark {
  --markstream-code-fallback-bg: var(--code-bg);
  --markstream-code-fallback-fg: var(--code-fg);
  --markstream-code-border-color: var(--code-border);
  --markstream-code-fallback-selection-bg: var(--code-selection-bg);
  --markstream-diff-frame-border: var(--code-border);
  --markstream-diff-frame-shadow: 0 18px 40px -30px hsl(var(--ms-foreground) / 0.84);
  --markstream-diff-shell-fg: hsl(var(--ms-foreground));
  --markstream-diff-shell-muted: hsl(var(--ms-muted-foreground));
  --markstream-diff-shell-border: hsl(var(--ms-border) / 0.56);
  --markstream-diff-shell-shadow: 0 34px 80px -52px hsl(var(--ms-foreground) / 0.72);
  --markstream-diff-shell-bg: hsl(var(--ms-background) / 0.99);
  --markstream-diff-header-border: hsl(var(--ms-border) / 0.82);
  --markstream-diff-editor-bg: var(--code-bg);
  --markstream-diff-editor-fg: hsl(var(--ms-foreground));
  --markstream-diff-unchanged-fg: hsl(var(--ms-foreground));
  --markstream-diff-unchanged-bg: hsl(var(--ms-muted));
  --markstream-diff-unchanged-divider: hsl(var(--ms-background) / 0.18);
  --markstream-diff-focus: var(--focus-ring);
  --markstream-diff-widget-shadow: hsl(var(--ms-foreground) / 0.72);
  --markstream-diff-action-hover: var(--code-action-hover-bg);
  --markstream-diff-panel-bg: hsl(var(--ms-background) / 0.99);
  --markstream-diff-panel-bg-soft: hsl(var(--ms-background) / 0.99);
  --markstream-diff-panel-bg-strong: hsl(var(--ms-background) / 0.99);
  --markstream-diff-panel-border: hsl(var(--ms-border) / 0.3);
  --markstream-diff-pane-divider: hsl(var(--ms-border) / 0.34);
  --markstream-diff-gutter-bg: linear-gradient(
    180deg,
    hsl(var(--ms-background) / 0.94) 0%,
    hsl(var(--ms-background) / 0.98) 100%
  );
  --markstream-diff-gutter-guide: hsl(var(--ms-muted-foreground) / 0.08);
  --markstream-diff-gutter-gap: 16px;
  --markstream-diff-line-number: var(--code-line-number);
  --markstream-diff-line-number-active: var(--code-line-number);
  --markstream-diff-added-fg: var(--diff-added-fg);
  --markstream-diff-removed-fg: var(--diff-removed-fg);
  --markstream-diff-added-line: var(--diff-added-bg);
  --markstream-diff-removed-line: var(--diff-removed-bg);
  --markstream-diff-added-inline: var(--diff-added-inline-bg);
  --markstream-diff-removed-inline: var(--diff-removed-inline-bg);
  --markstream-diff-added-inline-border: transparent;
  --markstream-diff-removed-inline-border: transparent;
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 var(--stream-monaco-gutter-marker-width, 4px),
    hsl(var(--ms-diff-added) / 0.2) var(--stream-monaco-gutter-marker-width, 4px) 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / var(--stream-monaco-gutter-marker-width, 4px) 100% no-repeat,
    linear-gradient(90deg, hsl(var(--ms-diff-removed) / 0.18) 0 100%);
  --markstream-diff-added-line-fill: var(--diff-added-bg);
  --markstream-diff-removed-line-fill: var(--diff-removed-bg);
}

.code-editor-container {
  transition: height var(--ms-duration-standard) var(--ms-ease-standard), max-height var(--ms-duration-standard) var(--ms-ease-standard);
}

.code-block-header {
  gap: var(--ms-gap-header);
  border-color: var(--code-border);
  color: var(--code-fg);
  background-color: var(--code-header-bg);
}

.code-header-main {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--ms-gap-header-main);
  overflow: hidden;
}

.code-header-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.code-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ms-gap-header-actions);
  flex-wrap: wrap;
}

.code-header-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.code-header-caption {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--code-line-number);
}

.code-editor-layer {
  display: grid;
  min-width: 0;
}
.code-editor-layer > .code-editor-container {
  grid-area: 1 / 1;
}
:deep(.code-editor-layer > pre.code-pre-fallback) {
  grid-area: 1 / 1;
}

.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .monaco-editor-background),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .margin),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .lines-content) {
  background: var(--vscode-editor-background, var(--markstream-code-fallback-bg)) !important;
}

.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .margin),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .view-lines),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .view-line),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .view-line span),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .line-numbers) {
  color: var(--vscode-editor-foreground, var(--markstream-code-fallback-fg)) !important;
}

.code-block-container.is-diff .code-block-header {
  padding: 18px 20px 14px;
  color: var(--markstream-diff-shell-fg);
  background: transparent;
  border-bottom-color: var(--markstream-diff-header-border);
}

.code-block-container.is-diff {
  background: var(--markstream-diff-shell-bg);
  box-shadow: var(--markstream-diff-shell-shadow);
  border-color: var(--markstream-diff-shell-border);
  --vscode-editor-selectionBackground: var(--markstream-diff-action-hover);
}

.code-block-container.is-diff .code-header-caption {
  color: var(--markstream-diff-shell-muted);
}

.code-block-container.is-diff .code-editor-layer {
  padding: 4px 4px 8px;
  background: transparent;
  --vscode-editor-background: var(--markstream-diff-editor-bg);
  --vscode-editor-foreground: var(--markstream-diff-editor-fg);
  --vscode-diffEditor-unchangedRegionForeground: var(--markstream-diff-unchanged-fg);
  --vscode-diffEditor-unchangedRegionBackground: var(--markstream-diff-unchanged-bg);
  --vscode-focusBorder: var(--markstream-diff-focus);
  --vscode-widget-shadow: var(--markstream-diff-widget-shadow);
  --vscode-editor-selectionBackground: color-mix(
    in srgb,
    var(--markstream-diff-editor-bg) 90%,
    var(--markstream-diff-editor-fg) 10%
  );
  --stream-monaco-editor-bg: var(--markstream-diff-editor-bg);
  --stream-monaco-editor-fg: var(--markstream-diff-editor-fg);
  --stream-monaco-unchanged-fg: var(--markstream-diff-unchanged-fg);
  --stream-monaco-unchanged-bg: var(--markstream-diff-unchanged-bg);
  --stream-monaco-frame-radius: 18px;
  --stream-monaco-fixed-editor-bg: var(--markstream-diff-panel-bg-strong);
  --stream-monaco-frame-border: var(--markstream-diff-frame-border);
  --stream-monaco-frame-shadow: var(--markstream-diff-frame-shadow);
  --stream-monaco-panel-bg: var(--markstream-diff-panel-bg);
  --stream-monaco-panel-bg-soft: var(--markstream-diff-panel-bg-soft);
  --stream-monaco-panel-bg-strong: var(--markstream-diff-panel-bg-strong);
  --stream-monaco-panel-border: var(--markstream-diff-panel-border);
  --stream-monaco-pane-divider: var(--markstream-diff-pane-divider);
  --stream-monaco-gutter-bg: var(--markstream-diff-gutter-bg);
  --stream-monaco-gutter-guide: var(--markstream-diff-gutter-guide);
  --stream-monaco-gutter-marker-width: 4px;
  --stream-monaco-gutter-gap: var(--markstream-diff-gutter-gap);
  --stream-monaco-line-number: var(--markstream-diff-line-number);
  --stream-monaco-line-number-active: var(--markstream-diff-line-number-active);
  --stream-monaco-line-number-left: calc(
    var(--stream-monaco-gutter-marker-width) + var(--stream-monaco-gutter-gap)
  );
  --stream-monaco-line-number-width: 36px;
  --stream-monaco-line-number-align: center;
  --stream-monaco-original-margin-width: calc(
    var(--stream-monaco-gutter-marker-width) +
      (var(--stream-monaco-gutter-gap) * 2) +
      var(--stream-monaco-line-number-width)
  );
  --stream-monaco-original-scrollable-left: var(--stream-monaco-original-margin-width);
  --stream-monaco-original-scrollable-width: calc(
    100% - var(--stream-monaco-original-margin-width)
  );
  --stream-monaco-modified-margin-width: calc(
    var(--stream-monaco-gutter-marker-width) +
      (var(--stream-monaco-gutter-gap) * 2) +
      var(--stream-monaco-line-number-width)
  );
  --stream-monaco-modified-scrollable-left: var(--stream-monaco-modified-margin-width);
  --stream-monaco-modified-scrollable-width: calc(
    100% - var(--stream-monaco-modified-margin-width)
  );
  --stream-monaco-added-fg: var(--markstream-diff-added-fg);
  --stream-monaco-removed-fg: var(--markstream-diff-removed-fg);
  --stream-monaco-added-line: var(--markstream-diff-added-line);
  --stream-monaco-removed-line: var(--markstream-diff-removed-line);
  --stream-monaco-added-inline: var(--markstream-diff-added-inline);
  --stream-monaco-removed-inline: var(--markstream-diff-removed-inline);
  --stream-monaco-added-outline: transparent;
  --stream-monaco-removed-outline: transparent;
  --stream-monaco-added-inline-border: var(--markstream-diff-added-inline-border);
  --stream-monaco-removed-inline-border: var(--markstream-diff-removed-inline-border);
  --stream-monaco-added-line-shadow: none;
  --stream-monaco-removed-line-shadow: none;
  --stream-monaco-added-gutter: var(--markstream-diff-added-gutter);
  --stream-monaco-removed-gutter: var(--markstream-diff-removed-gutter);
  --stream-monaco-added-line-fill: var(--markstream-diff-added-line-fill);
  --stream-monaco-removed-line-fill: var(--markstream-diff-removed-line-fill);
}



.code-editor-container.is-hidden {
  opacity: 0;
  pointer-events: none;
}

:deep(pre.code-pre-fallback) {
  margin: 0;
  padding: var(--markstream-code-padding-y, 8px) var(--markstream-code-padding-x, 12px);
  padding-left: var(--markstream-code-padding-left, 52px);
  background: transparent;
  color: var(--vscode-editor-foreground, inherit);
  /* Match Monaco defaults to avoid a jarring swap while it loads */
  font-size: var(--vscode-editor-font-size, 12px);
  font-weight: 400;
  font-family: var(
    --markstream-code-font-family,
    ui-monospace,
    SFMono-Regular,
    SF Mono,
    Menlo,
    Monaco,
    Consolas,
    Liberation Mono,
    Courier New,
    monospace
  );
}

:deep(pre.code-pre-fallback > code) {
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

:deep(pre.code-pre-fallback.is-wrap) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.code-block-container.is-rendering .code-height-placeholder{
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  min-height: var(--ms-size-skeleton-min-height);
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted) / 0.7) 37%, var(--loading-shimmer) 63%);
}

/* Loading placeholder styles */
.code-loading-placeholder {
  padding: 1rem;
  min-height: var(--ms-size-skeleton-min-height);
}

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-line {
  height: 1rem;
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted) / 0.7) 37%, var(--loading-shimmer) 63%);
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  border-radius: 0.25rem;
}

.skeleton-line.short {
  width: 60%;
}

@keyframes code-skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

.code-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.5rem;
  border-radius: 0.375rem;
  line-height: 1;
  flex-shrink: 0;
  font-family: inherit;
  color: var(--code-action-fg);
}

.code-action-btn:hover {
  background-color: var(--code-action-hover-bg);
  color: var(--code-action-hover-fg);
}

.code-block-container.is-diff .icon-slot {
  width: 28px;
  height: 28px;
  box-shadow: inset 0 1px 0 hsl(var(--ms-background) / 0.7);
  padding: 5px;
  color: var(--markstream-diff-added-fg);
}

.code-block-container.is-diff.is-dark .icon-slot {
  box-shadow:
    inset 0 1px 0 hsl(var(--ms-background) / 0.08),
    0 12px 28px -20px hsl(var(--ms-ring) / 0.45);
}

.code-diff-stats {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: 4px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.code-diff-stat {
  display: inline-flex;
  align-items: center;
}

.code-diff-stat.removed {
  color: var(--vscode-diffEditor-removedTextForeground, var(--markstream-diff-removed-fg));
}

.code-diff-stat.added {
  color: var(--vscode-diffEditor-insertedTextForeground, var(--markstream-diff-added-fg));
}

.code-block-container.is-dark .code-diff-stat {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid transparent;
  line-height: 1;
  box-shadow: inset 0 1px 0 hsl(var(--ms-background) / 0.05);
}

.code-block-container.is-dark .code-diff-stat.removed {
  color: var(--diff-removed-fg);
  background: hsl(var(--ms-diff-removed) / 0.16);
  border-color: hsl(var(--ms-diff-removed) / 0.2);
}

.code-block-container.is-dark .code-diff-stat.added {
  color: var(--diff-added-fg);
  background: hsl(var(--ms-diff-added) / 0.16);
  border-color: hsl(var(--ms-diff-added) / 0.22);
}

.code-action-btn:active {
  transform: scale(0.98);
}

.code-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.code-action-btn:disabled:hover {
  background-color: transparent;
}

/* Ensure injected icons align consistently whether img or inline svg */
.icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-slot :deep(svg),
.icon-slot :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
}

@container (max-width: 640px) {
  .code-block-container.is-diff .code-block-header {
    padding: 16px 16px 12px;
  }

  .code-block-container.is-diff .code-editor-layer {
    padding: 4px 4px 8px;
  }

  .code-diff-stats {
    gap: 6px;
    font-size: 12px;
  }
}

:deep(.monaco-diff-editor .diffOverview){
  background-color: var(--vscode-editor-background);
}

:deep(.stream-monaco-diff-root .monaco-diff-editor .diffOverview),
:deep(.stream-monaco-diff-root .decorationsOverviewRuler) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  border: 0 !important;
  background: transparent !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
}

:deep(.code-block-container .stream-monaco-diff-root .monaco-diff-editor) {
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

:deep(.code-block-container .stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center:not(.stream-monaco-clickable) > *:not(a)) {
  visibility: hidden !important;
}

:deep(.code-block-container .stream-monaco-diff-root .monaco-editor .diff-hidden-lines-compact .text) {
  opacity: 0 !important;
}

:deep(.stream-monaco-diff-root) {
  --stream-monaco-gutter-gap: var(--markstream-diff-gutter-gap) !important;
  --stream-monaco-line-number: var(--markstream-diff-line-number) !important;
  --stream-monaco-line-number-active: var(--markstream-diff-line-number-active) !important;
  --stream-monaco-added-fg: var(--markstream-diff-added-fg) !important;
  --stream-monaco-removed-fg: var(--markstream-diff-removed-fg) !important;
  --stream-monaco-added-line: var(--markstream-diff-added-line) !important;
  --stream-monaco-removed-line: var(--markstream-diff-removed-line) !important;
  --stream-monaco-added-inline: var(--markstream-diff-added-inline) !important;
  --stream-monaco-removed-inline: var(--markstream-diff-removed-inline) !important;
  --stream-monaco-added-inline-border: var(--markstream-diff-added-inline-border) !important;
  --stream-monaco-removed-inline-border: var(--markstream-diff-removed-inline-border) !important;
  --stream-monaco-added-line-fill: var(--markstream-diff-added-line-fill) !important;
  --stream-monaco-removed-line-fill: var(--markstream-diff-removed-line-fill) !important;
  --stream-monaco-added-gutter: var(--markstream-diff-added-gutter) !important;
  --stream-monaco-removed-gutter: var(--markstream-diff-removed-gutter) !important;
  --stream-monaco-added-line-shadow: none !important;
  --stream-monaco-removed-line-shadow: none !important;
  --stream-monaco-unchanged-bg: var(--markstream-diff-unchanged-bg) !important;
  --stream-monaco-unchanged-fg: var(--markstream-diff-unchanged-fg) !important;
}

:deep(.stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center:not(.stream-monaco-unchanged-bridge-source)),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge) {
  --stream-monaco-unchanged-bg: var(--markstream-diff-unchanged-bg) !important;
  --stream-monaco-unchanged-fg: var(--markstream-diff-unchanged-fg) !important;
  background: var(--stream-monaco-unchanged-bg) !important;
  color: var(--stream-monaco-unchanged-fg) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge) {
  right: calc(
    var(--stream-monaco-gutter-marker-width) - var(--stream-monaco-unchanged-rail-width) / 2 + (var(--stream-monaco-gutter-gap) * 2)
  ) !important;
  width: auto !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary:hover),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary:focus-visible),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary.stream-monaco-focus-visible) {
  background: var(--stream-monaco-unchanged-bg) !important;
  color: var(--markstream-diff-unchanged-fg) !important;
  padding-left: calc(
    var(--stream-monaco-gutter-marker-width) + (var(--stream-monaco-gutter-gap) * 2)
  ) !important;
  padding-right: calc(
    var(--stream-monaco-gutter-marker-width) + (var(--stream-monaco-gutter-gap) * 2)
  ) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge.stream-monaco-diff-unchanged-bridge-line-info .stream-monaco-unchanged-rail),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:hover),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:focus-visible),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal.stream-monaco-focus-visible) {
  background: var(--stream-monaco-unchanged-bg) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail) {
  border-right-color: var(--markstream-diff-unchanged-divider) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal) {
  border-bottom-color: transparent !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail.stream-monaco-unchanged-rail-both .stream-monaco-unchanged-reveal:first-child) {
  border-bottom-color: var(--markstream-diff-unchanged-divider) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail.stream-monaco-unchanged-rail-top-only .stream-monaco-unchanged-reveal),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail.stream-monaco-unchanged-rail-bottom-only .stream-monaco-unchanged-reveal) {
  border-bottom: 0 !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-meta),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-count),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-metadata-label),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:hover),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:focus-visible),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal.stream-monaco-focus-visible) {
  color: var(--markstream-diff-unchanged-fg) !important;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.original .diff-hidden-lines .center) {
  align-items: center;
  justify-content: center;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.original .diff-hidden-lines .center > div:first-child) {
  align-items: center;
  display: flex;
  justify-content: center !important;
  min-width: 100%;
  width: 100% !important;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.modified .diff-hidden-lines .center > div:first-child) {
  display: none !important;
}

:deep(.markstream-inline-fold-proxy) {
  align-items: center;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 4px;
  box-shadow: none;
  color: var(--vscode-diffEditor-unchangedRegionForeground, currentColor);
  cursor: pointer;
  display: inline-flex;
  height: 16px;
  justify-content: center;
  padding: 0;
  width: 16px;
}

:deep(.markstream-inline-fold-proxy:hover),
:deep(.markstream-inline-fold-proxy:focus-visible) {
  color: var(--vscode-editorLink-activeForeground, var(--vscode-diffEditor-unchangedRegionForeground, currentColor));
}

:deep(.markstream-inline-fold-proxy:focus-visible) {
  outline: 1px solid var(--vscode-focusBorder, currentColor);
  outline-offset: 1px;
}

:deep(.markstream-inline-fold-proxy .codicon) {
  color: inherit;
  font-size: 16px;
  height: 16px;
  line-height: 16px;
  width: 16px;
}
</style>
