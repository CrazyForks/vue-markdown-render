function humanizeKey(key: string) {
  const s = key.split('.').pop() || key
  return s
    .replace(/[_-]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

const defaultMap: Record<string, string> = {
  'common.copy': 'Copy',
  'common.copySuccess': 'Copied',
  'common.decrease': 'Decrease',
  'common.reset': 'Reset',
  'common.increase': 'Increase',
  'common.expand': 'Expand',
  'common.collapse': 'Collapse',
  'common.preview': 'Preview',
  'common.source': 'Source',
  'common.export': 'Export',
  'common.open': 'Open',
  'common.zoomIn': 'Zoom in',
  'common.zoomOut': 'Zoom out',
  'common.resetZoom': 'Reset zoom',
  'image.loadError': 'Image failed to load',
  'image.loading': 'Loading image...',

}

/**
 * Replace the entire default translation map.
 * Consumers can call this to provide their own fallback translations (e.g. Chinese).
 */
export function setDefaultI18nMap(map: Record<keyof typeof defaultMap, string>) {
  Object.assign(defaultMap, map)
}

export function useSafeI18n() {
  // Synchronous fallback in case `vue-i18n` is not installed.
  // We attempt a dynamic import at runtime for consumers that do have `vue-i18n`.
  // Note: dynamic import is async, but this function returns a synchronous
  // API so callers can use `const { t } = useSafeI18n()` without awaiting.
  try {
    // Try to use global installed vue-i18n if available synchronously via composition API
    // This will work when the consumer has set up vue-i18n and the bundler left
    // the runtime entry available. We access it via (global) require-ish path.
    // Keep this non-throwing.
    const possible = (globalThis as any).$vueI18nUse || null
    if (possible && typeof possible === 'function') {
      try {
        const i18n = possible()
        if (i18n && typeof i18n.t === 'function') {
          return { t: (i18n.t as any).bind(i18n) }
        }
      }
      catch {}
    }
  }
  catch {}

  // Fallback synchronous translator
  const fallbackT = (key: string) => defaultMap[key] ?? humanizeKey(key)

  // Kick off an async dynamic import to wire up real vue-i18n if available at runtime.
  ;(async () => {
    try {
      const mod = await import('vue-i18n')
      // prefer `useI18n` exported hook; if not present, ignore.
      const useI18n = (mod as any).useI18n || ((mod as any).default && (mod as any).default.useI18n)
      if (useI18n && typeof useI18n === 'function') {
        try {
          const i18n = useI18n()
          if (i18n && typeof i18n.t === 'function') {
            // Attach to global so next calls can pick it up synchronously
            try {
              (globalThis as any).$vueI18nUse = () => i18n
            }
            catch {}
          }
        }
        catch {}
      }
    }
    catch {
      // ignore if not installed
    }
  })()

  return { t: fallbackT }
}
