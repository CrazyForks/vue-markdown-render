export type {
  MonacoDiffEditorViewLike,
  MonacoDiffLineChangeLike,
  MonacoDisposableLike,
  MonacoEditorViewLike,
  MonacoHelpers,
  MonacoModelLike,
  MonacoModule,
  MonacoNamespaceLike,
  MonacoRuntimeOptions,
} from '../components/CodeBlockNode/monaco'
export { isCodeBlockRuntimeReady } from '../components/CodeBlockNode/runtime'
export { getRegisteredThemes, registerIconTheme, setIconTheme } from '../icon-themes'
export type { IconTheme } from '../icon-themes'
export * from './katex-threshold'
export * from './languageIcon'
export * from './nodeLifecycle'
export * from './safeRaf'
export * from 'stream-markdown-parser'

export async function preloadCodeBlockRuntime() {
  const { preloadCodeBlockRuntime } = await import('../components/CodeBlockNode/monaco')
  return preloadCodeBlockRuntime()
}

export async function getUseMonaco() {
  const { getUseMonaco } = await import('../components/CodeBlockNode/monaco')
  return getUseMonaco()
}
