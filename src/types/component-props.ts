// Centralized exported props interfaces for components
import type { CodeBlockNode } from 'stream-markdown-parser'

export type CodeBlockDiffHideUnchangedRegions
  = | boolean
    | {
      enabled?: boolean
      contextLineCount?: number
      minimumLineCount?: number
      revealLineCount?: number
    }

export type CodeBlockDiffLineStyle = 'background' | 'bar'
export type CodeBlockDiffAppearance = 'auto' | 'light' | 'dark'
export type CodeBlockDiffUnchangedRegionStyle = 'line-info' | 'line-info-basic' | 'metadata' | 'simple'

export interface CodeBlockMonacoOptions {
  MAX_HEIGHT?: number | string
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  tabSize?: number
  readOnly?: boolean
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded' | string
  wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent' | string
  theme?: string
  renderSideBySide?: boolean
  enableSplitViewResizing?: boolean
  ignoreTrimWhitespace?: boolean
  maxComputationTime?: number
  diffAlgorithm?: string
  renderIndicators?: boolean
  originalEditable?: boolean
  revealDebounceMs?: number
  revealStrategy?: 'bottom' | 'centerIfOutside' | 'center'
  revealBatchOnIdleMs?: number
  updateThrottleMs?: number
  diffUpdateThrottleMs?: number
  diffAutoScroll?: boolean
  diffHideUnchangedRegions?: CodeBlockDiffHideUnchangedRegions
  diffLineStyle?: CodeBlockDiffLineStyle
  diffAppearance?: CodeBlockDiffAppearance
  diffUnchangedRegionStyle?: CodeBlockDiffUnchangedRegionStyle
  diffHunkActionsOnHover?: boolean
  diffHunkHoverHideDelayMs?: number
  onDiffHunkAction?: (...args: any[]) => void | boolean | Promise<void | boolean>
  scrollbar?: Record<string, any>
  [key: string]: any
}

export interface CodeBlockNodeProps {
  node: CodeBlockNode
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  darkTheme?: any
  lightTheme?: any
  isShowPreview?: boolean
  monacoOptions?: CodeBlockMonacoOptions
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  themes?: any[]
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  showTooltips?: boolean
  customId?: string
}

export interface ImageNodeProps {
  node: {
    type: 'image'
    src: string
    alt: string
    title: string | null
    raw: string
    loading?: boolean
  }
  fallbackSrc?: string
  showCaption?: boolean
  lazy?: boolean
  svgMinHeight?: string
  usePlaceholder?: boolean
}

export interface LinkNodeProps {
  node: {
    type: 'link'
    href: string
    title: string | null
    text: string
    attrs?: [string, string][]
    children: { type: string, raw: string }[]
    raw: string
    loading?: boolean
  }
  indexKey: number | string
  customId?: string
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}

export interface PreCodeNodeProps {
  node: CodeBlockNode
}

export interface MermaidBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  loading?: boolean
  isDark?: boolean
  workerTimeoutMs?: number
  parseTimeoutMs?: number
  renderTimeoutMs?: number
  fullRenderTimeoutMs?: number
  renderDebounceMs?: number
  contentStableDelayMs?: number
  previewPollDelayMs?: number
  previewPollMaxDelayMs?: number
  previewPollMaxAttempts?: number
  // header customization
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableWheelZoom?: boolean
  // When false, relax all sanitization/security (not recommended)
  isStrict?: boolean
  showTooltips?: boolean
  // Custom error handler called when mermaid rendering fails.
  // Receives the error, the raw mermaid code, and the container element.
  // Return true to prevent the default error display.
  onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void
}

// Generic event wrapper used by MermaidBlockNode emits. Consumers can call
// `preventDefault()` to stop the component's default action.
export interface MermaidBlockEvent<TPayload = any> {
  payload?: TPayload
  defaultPrevented: boolean
  preventDefault: () => void
  // optional: direct access to the rendered SVG element (if available)
  svgElement?: SVGElement | null
  // optional: serialized SVG string (may be absent to avoid extra work)
  svgString?: string | null
}

export interface D2BlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  loading?: boolean
  isDark?: boolean
  progressiveRender?: boolean
  progressiveIntervalMs?: number
  themeId?: number | null
  darkThemeId?: number | null
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showCollapseButton?: boolean
}

export interface InfographicBlockNodeProps {
  node: CodeBlockNode
  maxHeight?: string | null
  loading?: boolean
  isDark?: boolean
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showCollapseButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showZoomControls?: boolean
}

export interface MathBlockNodeProps {
  node: {
    type: 'math_block'
    content: string
    raw: string
    loading?: boolean
  }
}

export interface MathInlineNodeProps {
  node: {
    type: 'math_inline'
    content: string
    raw: string
    loading?: boolean
    markup?: string
  }
}
