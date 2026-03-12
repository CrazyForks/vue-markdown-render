import type { Ref } from 'vue'
import { inject, provide, ref } from 'vue'

// Injection key for viewport-priority registration
const ViewportPriorityKey = Symbol('ViewportPriority') as unknown as InjectionKey<RegisterFn>

export interface VisibilityHandle {
  isVisible: Ref<boolean>
  whenVisible: Promise<void>
  destroy: () => void
}

export type RegisterFn = (el: HTMLElement, opts?: { rootMargin?: string, threshold?: number }) => VisibilityHandle

type InjectionKey<T> = symbol & { __type?: T }

/**
 * Provide a shared IntersectionObserver based visibility registrar.
 * If disabled or not in browser, registers resolve immediately.
 */
export function provideViewportPriority(
  getRootEl: (target?: HTMLElement | null) => HTMLElement | null | undefined,
  enabled: Ref<boolean> | boolean,
): RegisterFn {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const enabledRef = typeof enabled === 'boolean' ? ref(enabled) : enabled

  interface ObserverConfig {
    root: HTMLElement | null
    rootMargin: string
    threshold: number
  }

  // Lazily created IO bound to the provided root element
  let io: IntersectionObserver | null = null
  let currentConfig: ObserverConfig | null = null
  const targets = new Map<Element, { resolve: () => void, visible: Ref<boolean> }>()

  function normalizeConfig(target?: HTMLElement, opts?: { rootMargin?: string, threshold?: number }): ObserverConfig {
    return {
      root: getRootEl?.(target ?? null) ?? null,
      rootMargin: opts?.rootMargin ?? '300px',
      threshold: opts?.threshold ?? 0,
    }
  }

  function sameConfig(a: ObserverConfig | null, b: ObserverConfig) {
    return !!a
      && a.root === b.root
      && a.rootMargin === b.rootMargin
      && a.threshold === b.threshold
  }

  function ensureObserver(target?: HTMLElement, opts?: { rootMargin?: string, threshold?: number }) {
    if (!isBrowser)
      return io
    // Guard: some browser-like environments (e.g., jsdom) don't provide IO
    if (typeof IntersectionObserver === 'undefined')
      return null

    const nextConfig = normalizeConfig(target, opts)
    if (io && sameConfig(currentConfig, nextConfig))
      return io

    if (io) {
      try {
        io.disconnect()
      }
      catch {}
    }

    io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const data = targets.get(entry.target)
        if (!data)
          continue
        const isVisible = entry.isIntersecting || entry.intersectionRatio > 0
        if (isVisible) {
          if (!data.visible.value) {
            data.visible.value = true
            // resolve once; subsequent intersections are ignored
            try {
              data.resolve()
            }
            catch {}
          }
          io?.unobserve(entry.target)
          targets.delete(entry.target)
        }
      }
    }, {
      root: nextConfig.root,
      rootMargin: nextConfig.rootMargin, // prefetch slightly before entering viewport
      threshold: nextConfig.threshold,
    })

    currentConfig = nextConfig
    for (const el of targets.keys())
      io.observe(el)

    return io
  }

  const register: RegisterFn = (el, opts) => {
    const visible = ref(false)
    let settled = false
    let resolve!: () => void
    const whenVisible = new Promise<void>((res) => {
      resolve = () => {
        if (!settled) {
          settled = true
          res()
        }
      }
    })

    const cleanup = () => {
      try {
        io?.unobserve(el)
      }
      catch {}
      targets.delete(el)
      if (!targets.size) {
        try {
          io?.disconnect()
        }
        catch {}
        io = null
        currentConfig = null
      }
    }

    if (!isBrowser || !enabledRef.value) {
      // not in browser or feature disabled -> proceed immediately
      visible.value = true
      resolve()
      return { isVisible: visible, whenVisible, destroy: cleanup }
    }

    const obs = ensureObserver(el, opts)
    if (!obs) {
      visible.value = true
      resolve()
      return { isVisible: visible, whenVisible, destroy: cleanup }
    }

    targets.set(el, { resolve, visible })
    obs.observe(el)
    return { isVisible: visible, whenVisible, destroy: cleanup }
  }

  provide(ViewportPriorityKey, register)
  return register
}

/**
 * Child components call this to register an element and await visibility.
 * If provider is missing, returns a no-op registrar that resolves immediately.
 */
export function useViewportPriority() {
  const injected = inject<RegisterFn | undefined>(ViewportPriorityKey, undefined)
  if (injected)
    return injected

  // Fallback: create a local root-less IntersectionObserver to the viewport
  const localTargets = new WeakMap<Element, { resolve: () => void, visible: Ref<boolean> }>()
  let localIo: IntersectionObserver | null = null
  const ensureLocal = () => {
    if (localIo)
      return localIo
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined')
      return null
    localIo = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const data = localTargets.get(e.target)
        if (!data)
          continue
        const vis = e.isIntersecting || e.intersectionRatio > 0
        if (vis) {
          if (!data.visible.value) {
            data.visible.value = true
            try {
              data.resolve()
            }
            catch {}
          }
          localIo?.unobserve(e.target)
          localTargets.delete(e.target)
        }
      }
    }, { root: null, rootMargin: '300px', threshold: 0 })
    return localIo
  }

  const register: RegisterFn = (el) => {
    const isVisible = ref(false)
    let settled = false
    let resolve!: () => void
    const whenVisible = new Promise<void>((res) => {
      resolve = () => {
        if (!settled) {
          settled = true
          res()
        }
      }
    })
    const cleanup = () => {
      try {
        localIo?.unobserve(el)
      }
      catch {}
      localTargets.delete(el)
    }
    const obs = ensureLocal()
    if (!obs) {
      isVisible.value = true
      resolve()
      return { isVisible, whenVisible, destroy: cleanup }
    }
    localTargets.set(el, { resolve, visible: isVisible })
    obs.observe(el)
    return { isVisible, whenVisible, destroy: cleanup }
  }

  return register
}
