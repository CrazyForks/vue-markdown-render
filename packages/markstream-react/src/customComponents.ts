import type { ComponentType, PropsWithChildren } from 'react'
import type { NodeComponentProps } from './types/node-component'
import { normalizeCustomHtmlTagName } from 'stream-markdown-parser'
import { isDevEnvironment } from './utils/devEnv'

export type CustomComponentDisplayMode = 'inline' | 'block'
export type MarkstreamCustomComponent<P = never> = ComponentType<P> & {
  markstreamDisplay?: CustomComponentDisplayMode
}
export type CustomComponentMap = Record<string, MarkstreamCustomComponent>
export type StreamingComponent<TNode = any> = ComponentType<NodeComponentProps<TNode>>
export type StreamingComponentMap<TNode = any> = Record<string, StreamingComponent<TNode>>
export type HtmlComponent<P extends object = any> = ComponentType<PropsWithChildren<P>>
export type HtmlComponentMap<P extends object = any> = Record<string, HtmlComponent<P>>

const GLOBAL_KEY = '__global__'

interface Store {
  scopedComponents: Record<string, CustomComponentMap>
  revision: number
  listeners: Set<() => void>
}

const STORE_KEY = '__MARKSTREAM_REACT_CUSTOM_COMPONENTS_STORE__'
const store: Store = (() => {
  const g = globalThis as any
  if (g[STORE_KEY])
    return g[STORE_KEY] as Store
  const next: Store = {
    scopedComponents: {},
    revision: 0,
    listeners: new Set(),
  }
  g[STORE_KEY] = next
  return next
})()

function bumpRevision() {
  store.revision++
  for (const listener of Array.from(store.listeners)) {
    try {
      listener()
    }
    catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeCustomComponents(listener: () => void) {
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

export function getCustomComponentsRevision() {
  return store.revision
}

export function setCustomComponents(id: string, mapping: CustomComponentMap): void
export function setCustomComponents(mapping: CustomComponentMap): void
export function setCustomComponents(idOrMapping: string | CustomComponentMap, maybeMapping?: CustomComponentMap) {
  if (typeof idOrMapping === 'string')
    store.scopedComponents[idOrMapping] = { ...(maybeMapping || {}) }
  else
    store.scopedComponents[GLOBAL_KEY] = { ...idOrMapping }
  bumpRevision()
}

export function getCustomNodeComponents(customId?: string): CustomComponentMap {
  const globalMapping = store.scopedComponents[GLOBAL_KEY] || {}
  if (!customId)
    return globalMapping

  const scopedMapping = store.scopedComponents[customId] || {}
  if (!globalMapping || Object.keys(globalMapping).length === 0)
    return scopedMapping
  if (!scopedMapping || Object.keys(scopedMapping).length === 0)
    return globalMapping
  return {
    ...globalMapping,
    ...scopedMapping,
  }
}

export function removeCustomComponents(id: string) {
  if (id === GLOBAL_KEY)
    throw new Error('removeCustomComponents: cannot delete global mapping; call clearGlobalCustomComponents instead.')
  delete store.scopedComponents[id]
  bumpRevision()
}

export function clearGlobalCustomComponents() {
  delete store.scopedComponents[GLOBAL_KEY]
  bumpRevision()
}

export function getCustomComponentDisplay(component: ComponentType<never> | null | undefined): CustomComponentDisplayMode | undefined {
  return (component as MarkstreamCustomComponent | null | undefined)?.markstreamDisplay
}

export function withMarkstreamComponentDisplay<T extends ComponentType<never>>(
  component: T,
  display: CustomComponentDisplayMode,
) {
  ;(component as MarkstreamCustomComponent).markstreamDisplay = display
  return component as T & { markstreamDisplay: CustomComponentDisplayMode }
}

export function normalizeComponentMap<T>(mapping?: Record<string, T>): Record<string, T> {
  if (!mapping)
    return {}

  const normalized: Record<string, T> = {}
  for (const [rawKey, component] of Object.entries(mapping)) {
    const key = normalizeCustomHtmlTagName(rawKey)
    if (key)
      normalized[key] = component
  }
  return normalized
}

export function warnComponentMapConflicts(
  streamingComponents: StreamingComponentMap,
  htmlComponents: HtmlComponentMap,
  warnedTags: Set<string>,
) {
  if (!isDevEnvironment())
    return

  for (const tag of Object.keys(streamingComponents)) {
    if (!htmlComponents[tag] || warnedTags.has(tag))
      continue
    warnedTags.add(tag)
    console.warn(
      `[markstream-react] "${tag}" was provided in both streamingComponents and htmlComponents. `
      + 'The streamingComponents entry will be used for parser-backed rendering.',
    )
  }
}
