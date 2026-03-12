import React, { createContext, useContext, useMemo, useRef } from 'react'

export interface VisibilityHandle {
  isVisible: () => boolean
  whenVisible: Promise<void>
  destroy: () => void
}

export type RegisterViewportFn = (el: HTMLElement, opts?: { rootMargin?: string, threshold?: number }) => VisibilityHandle

type GetRootFn = () => HTMLElement | null
type EnabledFn = () => boolean

const ViewportPriorityContext = createContext<RegisterViewportFn | null>(null)

function createViewportRegistrar(getRoot: GetRootFn, enabled: EnabledFn): RegisterViewportFn {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  interface ObserverConfig {
    root: Element | null
    rootMargin: string
    threshold: number
  }

  let observer: IntersectionObserver | null = null
  let currentConfig: ObserverConfig | null = null
  const targets = new Map<Element, { resolve: () => void, state: { current: boolean } }>()

  const normalizeConfig = (rootMargin: string, threshold: number): ObserverConfig => ({
    root: getRoot() ?? null,
    rootMargin,
    threshold,
  })

  const sameConfig = (a: ObserverConfig | null, b: ObserverConfig) => {
    return !!a
      && a.root === b.root
      && a.rootMargin === b.rootMargin
      && a.threshold === b.threshold
  }

  const ensureObserver = (rootMargin: string, threshold: number) => {
    if (!isBrowser)
      return null
    if (typeof IntersectionObserver === 'undefined')
      return null

    const nextConfig = normalizeConfig(rootMargin, threshold)
    if (observer && sameConfig(currentConfig, nextConfig))
      return observer

    if (observer) {
      try {
        observer.disconnect()
      }
      catch {}
    }

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const target = targets.get(entry.target)
        if (!target)
          continue
        const isVisible = entry.isIntersecting || entry.intersectionRatio > 0
        if (!isVisible)
          continue
        target.state.current = true
        try {
          target.resolve()
        }
        catch {}
        try {
          observer.unobserve(entry.target)
        }
        catch {}
        targets.delete(entry.target)
      }
    }, {
      root: nextConfig.root,
      rootMargin: nextConfig.rootMargin,
      threshold: nextConfig.threshold,
    })

    currentConfig = nextConfig

    for (const element of targets.keys())
      observer.observe(element)

    return observer
  }

  const register: RegisterViewportFn = (el, opts) => {
    const state = { current: false }
    let settled = false
    let resolve!: () => void
    const whenVisible = new Promise<void>((res) => {
      resolve = () => {
        if (settled)
          return
        settled = true
        res()
      }
    })
    const destroy = () => {
      if (targets.has(el)) {
        targets.delete(el)
        try {
          observer?.unobserve(el)
        }
        catch {}
      }
      if (!targets.size) {
        try {
          observer?.disconnect()
        }
        catch {}
        observer = null
        currentConfig = null
      }
    }

    if (!isBrowser || !enabled()) {
      state.current = true
      resolve()
      return {
        isVisible: () => true,
        whenVisible,
        destroy,
      }
    }

    const rootMargin = opts?.rootMargin ?? '300px'
    const threshold = opts?.threshold ?? 0
    const nextObserver = ensureObserver(rootMargin, threshold)
    if (!nextObserver) {
      state.current = true
      resolve()
      return {
        isVisible: () => true,
        whenVisible,
        destroy,
      }
    }

    targets.set(el, { resolve, state })
    nextObserver.observe(el)
    return {
      isVisible: () => state.current,
      whenVisible,
      destroy,
    }
  }

  return register
}

const fallbackRegister = createViewportRegistrar(() => null, () => true)

export interface ViewportPriorityProviderProps {
  getRoot: () => HTMLElement | null
  enabled?: boolean
  children: React.ReactNode
}

export function ViewportPriorityProvider({ getRoot, enabled = true, children }: ViewportPriorityProviderProps) {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const getRootRef = useRef(getRoot)
  getRootRef.current = getRoot

  const registrar = useMemo(() => {
    return createViewportRegistrar(() => getRootRef.current?.() ?? null, () => enabledRef.current)
  }, [])

  return (
    <ViewportPriorityContext.Provider value={registrar}>
      {children}
    </ViewportPriorityContext.Provider>
  )
}

export function useViewportPriority(): RegisterViewportFn {
  return useContext(ViewportPriorityContext) ?? fallbackRegister
}
