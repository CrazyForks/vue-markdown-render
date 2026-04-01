import type { CodeBlockMonacoOptions, CodeBlockMonacoTheme } from '../../types/component-props'
import { preload } from '../NodeRenderer/preloadMonaco'

export interface MonacoDisposableLike {
  dispose?: () => void
}

export interface MonacoModelLike {
  getLineCount?: () => number
}

export interface MonacoEditorViewLike {
  getModel?: () => MonacoModelLike | null | undefined
  getOption?: (option: unknown) => unknown
  updateOptions?: (options: Record<string, unknown>) => void
  layout?: () => void
  getContentHeight?: () => number
  onDidContentSizeChange?: (listener: () => void) => MonacoDisposableLike | void
  onDidLayoutChange?: (listener: () => void) => MonacoDisposableLike | void
}

export interface MonacoDiffLineChangeLike {
  originalStartLineNumber?: number
  originalEndLineNumber?: number
  modifiedStartLineNumber?: number
  modifiedEndLineNumber?: number
}

export interface MonacoDiffEditorViewLike extends MonacoEditorViewLike {
  getOriginalEditor?: () => MonacoEditorViewLike | null | undefined
  getModifiedEditor?: () => MonacoEditorViewLike | null | undefined
  getLineChanges?: () => MonacoDiffLineChangeLike[] | null | undefined
  onDidUpdateDiff?: (listener: () => void) => MonacoDisposableLike | void
}

export interface MonacoNamespaceLike {
  EditorOption?: {
    fontInfo?: unknown
    lineHeight?: unknown
  }
}

export interface MonacoRuntimeOptions extends Omit<CodeBlockMonacoOptions, 'theme'> {
  theme?: CodeBlockMonacoTheme
  themes?: CodeBlockMonacoTheme[]
  onThemeChange?: () => void
}

export interface MonacoHelpers {
  createEditor?: (container: HTMLElement, code: string, language: string) => Promise<unknown> | unknown
  createDiffEditor?: (container: HTMLElement, original: string, modified: string, language: string) => Promise<unknown> | unknown
  updateCode?: (code: string, language: string) => Promise<unknown> | unknown
  updateDiff?: (original: string, modified: string, language: string) => Promise<unknown> | unknown
  getEditor?: () => MonacoNamespaceLike | null
  getEditorView?: () => MonacoEditorViewLike | null
  getDiffEditorView?: () => MonacoDiffEditorViewLike | null
  cleanupEditor?: () => void
  safeClean?: () => void
  refreshDiffPresentation?: () => void
  setTheme?: (theme: CodeBlockMonacoTheme | undefined) => Promise<void> | void
}

export interface MonacoModule {
  useMonaco?: (options: MonacoRuntimeOptions) => MonacoHelpers | null | undefined
  detectLanguage?: (code: string) => string
}

let mod: MonacoModule | null = null
let importAttempted = false
let loadingPromise: Promise<MonacoModule | null> | null = null

export async function getUseMonaco(): Promise<MonacoModule | null> {
  if (mod)
    return mod
  if (loadingPromise)
    return loadingPromise
  if (importAttempted)
    return null

  loadingPromise = (async () => {
    try {
      mod = await import('stream-monaco') as MonacoModule
      await preload(mod)
      return mod
    }
    catch {
      importAttempted = true
      // Return null to indicate the module is not available
      // The caller should handle the fallback gracefully
      return null
    }
    finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}
